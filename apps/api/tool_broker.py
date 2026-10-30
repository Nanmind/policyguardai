"""The enforcement point: every tool call goes through here.

Everything security-relevant is looked up server-side (trust, allowlist,
tool metadata, destination, payload). The caller only names the tool and
its arguments."""
import logging
from typing import Any

from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from apps.api import trust
from apps.api.content_inspector import inspect_arguments
from apps.api.context import ExecutionContext
from apps.api.database import engine
from apps.api.models import Agent, ApprovalRequest, SecurityEvent, User
from apps.api.policy_engine import Decision, PolicyInput, PolicyResult, classify_destination, evaluate
from apps.api.runtime_control import execution_gate
from apps.api.tool_executor import ToolExecutor
from apps.api.tool_registry import get_tool, resolve_action
from apps.api.trust_model import agent_evidence_for_decision, compute, user_evidence_for_decision


log = logging.getLogger("uvicorn.error")


class ToolRequest(BaseModel):
    agent_id: int
    tool_name: str
    arguments: dict[str, Any] = Field(default_factory=dict)
    context_tainted: bool = False


def assess_request(session: Session, agent: Agent | None, user: User | None, tool_name: str,
                   arguments: dict[str, Any], ctx: ExecutionContext) -> dict[str, Any]:
    state = execution_gate(session)
    tool_def = get_tool(tool_name)
    action = resolve_action(tool_name, arguments)
    agent_view = trust.view(agent) if agent else compute("agent", 0, 20)
    user_view = trust.view(user) if user else compute("user", 0, 0)
    destination, detail = classify_destination(tool_name, arguments, ctx.user_email)
    content = inspect_arguments(tool_name, action, arguments)
    policy = evaluate(PolicyInput(
        tool_name=tool_name, tool_def=tool_def, action=action,
        agent_trust=agent_view.lower, agent_tier=agent_view.tier,
        agent_active=bool(agent and agent.is_active),
        agent_quarantined=bool(agent and trust.locked_until(agent)),
        allowed_tools=(agent.allowed_tools or []) if agent else [],
        user_trust=user_view.lower, user_tier=user_view.tier,
        destination=destination, destination_detail=detail, content=content,
        context_tainted=ctx.tainted, taint_sources=list(ctx.taint_sources),
        request_risk=ctx.request_risk,
        data_level=ctx.data_level, data_sources=list(ctx.data_sources),
    ))
    if state.paused:
        policy = PolicyResult(Decision.DENY, 1.0, ["Execution paused by an administrator."], policy.factors, "emergency_stop")
    elif ctx.user_id and (user is None or not user.is_active or trust.locked_until(user)):
        policy = PolicyResult(Decision.DENY, 1.0, ["Requesting account is unavailable or suspended."], policy.factors, "requester_unavailable")
    return {"policy": policy, "agent_view": agent_view, "content": content,
            "destination": destination, "action": action}


class ToolBroker:
    def __init__(self) -> None:
        self.executor = ToolExecutor()

    def request_tool(self, agent_id: int, tool_name: str, arguments: dict[str, Any], ctx: ExecutionContext) -> dict[str, Any]:
        action = resolve_action(tool_name, arguments)

        with Session(engine) as session:
            agent = session.get(Agent, agent_id)
            user = session.get(User, ctx.user_id) if ctx.user_id else None
            assessment = assess_request(session, agent, user, tool_name, arguments, ctx)
            policy = assessment["policy"]
            agent_view = assessment["agent_view"]
            content = assessment["content"]
            destination = assessment["destination"]

            log.info("[policy] %-20s -> %-16s %-6s risk=%.2f rule=%s", agent.name if agent else f"agent-{agent_id}",
                     tool_name, policy.decision.value, policy.risk_score, policy.rule)
            result: dict[str, Any] = {
                "decision": policy.decision.value, "risk_score": policy.risk_score, "rule": policy.rule,
                "reasons": policy.reasons, "factors": policy.factors, "agent_id": agent_id,
                "tool_name": tool_name, "action": action, "arguments": arguments, "tainted": ctx.tainted,
                "destination": destination, "content_findings": content["findings"],
                "agent_trust_before": agent_view.as_dict(),
            }

            if policy.decision == Decision.ALLOW:
                try:
                    result["tool_result"] = self.executor.execute(tool_name, arguments, ctx)
                except Exception as exc:  # noqa: BLE001 - never skip the audit log
                    result["tool_result"] = {"status": "error", "result": f"Tool execution failed: {exc}"}
            elif policy.decision == Decision.REVIEW:
                approval = ApprovalRequest(
                    run_id=ctx.run_id, agent_id=agent_id, tool_name=tool_name, action=action,
                    arguments=arguments, risk_score=policy.risk_score, reasons=policy.reasons,
                    status="PENDING", context=ctx.to_json(),
                )
                session.add(approval)
                session.flush()
                result["approval_id"] = approval.id
                result["tool_result"] = {"status": "pending_approval", "result": "Waiting for human approval."}
            else:
                result["tool_result"] = {"status": "denied", "result": "PolicyGuard denied this tool request."}

            session.add(SecurityEvent(
                run_id=ctx.run_id, agent_id=agent_id, tool_name=tool_name, action=action, arguments=arguments,
                decision=policy.decision.value, risk_score=policy.risk_score, rule=policy.rule,
                reasons=policy.reasons, factors=policy.factors, trust_before=agent_view.lower,
                tainted=ctx.tainted, user_id=ctx.user_id, conversation_id=ctx.conversation_id,
                destination=destination, content_findings=content["findings"], request_risk=ctx.request_risk,
            ))

            tool_ok = result["tool_result"].get("status") == "success"
            pos, neg, why = agent_evidence_for_decision(
                policy.decision.value, policy.rule, policy.risk_score, tool_ok, ctx.tainted, ctx.request_risk)
            if policy.rule in {"emergency_stop", "requester_unavailable"}:
                pos = neg = 0.0
            after = trust.apply_evidence(session, agent, pos, neg, f"{why} [{tool_name}]", "decision")
            if after is not None:
                result["agent_trust_after"] = after.as_dict()

            upos, uneg, uwhy = user_evidence_for_decision(policy.decision.value, ctx.tainted)
            if user is not None and (upos or uneg) and policy.rule not in {"emergency_stop", "requester_unavailable"}:
                trust.mark_flag_if_needed(user, trust.apply_evidence(session, user, upos, uneg, f"{uwhy} [{tool_name}]", "decision"))

            session.commit()
        return result
