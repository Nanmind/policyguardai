from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api import trust
from apps.api.auth_routes import get_current_user, require_role
from apps.api.context import ExecutionContext
from apps.api.database import get_db
from apps.api.models import Agent, ApprovalRequest, User
from apps.api.tool_executor import ToolExecutor
from apps.api.tool_broker import assess_request
from apps.api.policy_engine import Decision
from apps.api.trust_model import APPROVAL_EVIDENCE

router = APIRouter(prefix="/api/approvals")


class DecisionRequest(BaseModel):
    decision: str


def _payload(a: ApprovalRequest, names: dict[int, str], emails: dict[int, str]) -> dict:
    ctx = a.context or {}
    return {"id": a.id, "run_id": a.run_id, "agent_id": a.agent_id, "agent_name": names.get(a.agent_id, f"agent-{a.agent_id}"),
            "tool_name": a.tool_name, "action": a.action, "arguments": a.arguments, "risk_score": a.risk_score,
            "reasons": a.reasons or [], "status": a.status, "execution_result": a.execution_result,
            "decided_by": a.decided_by, "decided_at": a.decided_at, "created_at": a.created_at,
            "conversation_id": ctx.get("conversation_id"), "requested_by": emails.get(ctx.get("user_id")),
            "tainted": ctx.get("tainted", False)}


REVIEWERS = {"admin", "approver"}


@router.get("")
def list_approvals(status: str | None = None, db: Session = Depends(get_db),
                   user: User = Depends(get_current_user)):
    names = {a.id: a.name for a in db.scalars(select(Agent)).all()}
    emails = {u.id: u.email for u in db.scalars(select(User)).all()}
    stmt = select(ApprovalRequest).order_by(ApprovalRequest.id.desc()).limit(200)
    if status:
        stmt = stmt.where(ApprovalRequest.status == status.upper())
    rows = db.scalars(stmt).all()
    if user.role not in REVIEWERS:
        rows = [a for a in rows if (a.context or {}).get("user_id") == user.id]
    return [_payload(a, names, emails) for a in rows]


@router.get("/{approval_id}")
def get_approval(approval_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    a = db.get(ApprovalRequest, approval_id)
    if a is None:
        raise HTTPException(status_code=404, detail="Not found")
    if user.role not in REVIEWERS and (a.context or {}).get("user_id") != user.id:
        raise HTTPException(status_code=404, detail="Not found")
    return _payload(a, {x.id: x.name for x in db.scalars(select(Agent)).all()},
                    {x.id: x.email for x in db.scalars(select(User)).all()})


@router.post("/{approval_id}/decision")
def decide_approval(approval_id: int, request: DecisionRequest, db: Session = Depends(get_db),
                    user: User = Depends(require_role("admin", "approver"))):
    decision = request.decision.upper()
    if decision not in {"APPROVE", "REJECT"}:
        raise HTTPException(status_code=400, detail="Decision must be APPROVE or REJECT")
    approval = db.scalar(select(ApprovalRequest).where(ApprovalRequest.id == approval_id).with_for_update())
    if approval is None:
        raise HTTPException(status_code=404, detail="Approval request not found")
    if approval.status != "PENDING":
        raise HTTPException(status_code=409, detail="Approval request has already been decided")

    ctx = ExecutionContext.from_json(approval.context)
    agent = db.get(Agent, approval.agent_id)
    requester = db.get(User, ctx.user_id) if ctx.user_id else None
    if decision == "APPROVE":
        if ctx.user_id is None:
            raise HTTPException(status_code=409, detail="This legacy request lacks requester context. Submit a new request before approval.")
        current = assess_request(db, agent, requester, approval.tool_name, approval.arguments, ctx)["policy"]
        if current.decision == Decision.DENY:
            raise HTTPException(status_code=409, detail=f"Approval blocked by current policy ({current.rule}). Reject this request or resolve the restriction first.")
    approval.status = "APPROVED" if decision == "APPROVE" else "REJECTED"
    approval.decided_by = user.email
    approval.decided_at = datetime.utcnow()

    tool_result = None
    if decision == "APPROVE":
        try:
            tool_result = ToolExecutor().execute(approval.tool_name, approval.arguments, ctx)
        except Exception as exc:
            tool_result = {"status": "error", "result": f"Approved action failed: {exc}"}
        tool_result["files"] = ctx.files_created
        approval.execution_result = tool_result

    # Human feedback is the strongest trust evidence there is.
    pos, neg, why = APPROVAL_EVIDENCE["agent"][decision]
    execution_ok = decision == "REJECT" or (tool_result or {}).get("status") == "success"
    if execution_ok:
        trust.apply_evidence(db, agent, pos, neg, f"{why} [{approval.tool_name}]", "approval")
    if execution_ok and requester is not None and requester.id != user.id:
        upos, uneg, uwhy = APPROVAL_EVIDENCE["user"][decision]
        trust.mark_flag_if_needed(requester, trust.apply_evidence(db, requester, upos, uneg, f"{uwhy} [{approval.tool_name}]", "approval"))
    db.commit()

    response = {"id": approval.id, "status": approval.status, "decided_by": user.email}
    if tool_result is not None:
        response["tool_result"] = tool_result
    return response
