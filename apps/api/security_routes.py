"""Read-only experiments and operator execution controls."""
from dataclasses import asdict
from datetime import datetime
import hashlib
import json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.auth_routes import get_current_user, require_role
from apps.api.context import ExecutionContext
from apps.api.database import get_db
from apps.api.evaluation import run_policy_suite
from apps.api.models import Agent, ControlChange, RuntimeControl, User
from apps.api.policy_engine import DENY_THRESHOLD, REVIEW_THRESHOLD, WEIGHTS
from apps.api.settings import OLLAMA_MODEL, email_mode
from apps.api.tool_broker import assess_request
from apps.api.tool_registry import TOOLS

router = APIRouter(prefix='/api')


class Simulation(BaseModel):
    agent_id: int
    tool_name: str = Field(min_length=1, max_length=100)
    arguments: dict[str, Any] = Field(default_factory=dict)
    tainted: bool = False
    data_level: int = Field(default=0, ge=0, le=2)
    request_risk: float = Field(default=0, ge=0, le=1, allow_inf_nan=False)


class PauseRequest(BaseModel):
    paused: bool
    reason: str = Field(min_length=3, max_length=500)

    @field_validator('reason')
    @classmethod
    def meaningful_reason(cls, value: str) -> str:
        if len(value.strip()) < 3:
            raise ValueError('Provide a reason of at least three non-padding characters.')
        return value.strip()


def _state(state: RuntimeControl):
    return {'paused': state.paused, 'updated_by': state.updated_by,
            'updated_at': state.updated_at.isoformat() + 'Z'}


@router.get('/policy/config')
def configuration(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    state = db.get(RuntimeControl, 1)
    if state is None:
        raise HTTPException(503, 'Execution controls require API restart.')
    return {'version': '0.4.0', 'review_threshold': REVIEW_THRESHOLD, 'deny_threshold': DENY_THRESHOLD,
            'weights': WEIGHTS, 'destination_is_separate_adjustment': True,
            'tools': {n: {'action': t['action'], 'sensitivity': t['sensitivity']} for n, t in TOOLS.items()},
            'control': _state(state), 'model': OLLAMA_MODEL, 'email_mode': email_mode(),
            'registry_sha256': hashlib.sha256(json.dumps(TOOLS, sort_keys=True).encode()).hexdigest()}


@router.post('/policy/simulate')
def simulate(body: Simulation, db: Session = Depends(get_db), user: User = Depends(require_role('admin', 'analyst'))):
    agent = db.get(Agent, body.agent_id)
    if agent is None:
        raise HTTPException(404, 'Agent not found')
    ctx = ExecutionContext(run_id='simulation', user_id=user.id, user_email=user.email,
                           tainted=body.tainted, taint_sources=['hypothetical input'] if body.tainted else [],
                           data_level=body.data_level, request_risk=body.request_risk)
    current = assess_request(db, agent, user, body.tool_name, body.arguments, ctx)
    result = asdict(current['policy'])
    result['decision'] = current['policy'].decision.value
    return {**result, 'simulation': True, 'executed': False,
            'agent_trust': current['agent_view'].as_dict(), 'destination': current['destination']}


@router.post('/evaluations/policy')
def evaluation(user: User = Depends(require_role('admin', 'analyst'))):
    return run_policy_suite()


@router.post('/security/control')
def pause(body: PauseRequest, db: Session = Depends(get_db), user: User = Depends(require_role('admin'))):
    # Exclusive lock waits for executions holding the shared execution gate.
    state = db.scalar(select(RuntimeControl).where(RuntimeControl.id == 1).with_for_update())
    if state is None:
        raise HTTPException(503, 'Execution controls require API restart.')
    state.paused, state.updated_by, state.updated_at = body.paused, user.email, datetime.utcnow()
    db.add(ControlChange(paused=body.paused, actor=user.email, reason=body.reason.strip()))
    db.commit()
    return _state(state)


@router.get('/security/coverage')
def coverage(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    controls = [
        ('ASI01', 'Agent Goal Hijack', 'partial', 'Content signatures, request-intent scoring; semantic/task-alignment guard remains future work.', 'content_inspector.py'),
        ('ASI02', 'Tool Misuse and Exploitation', 'implemented controls', 'Tool allowlists, contextual decisions, review and revalidation before approved execution.', 'tool_broker.py; approval_routes.py'),
        ('ASI03', 'Identity and Privilege Abuse', 'implemented controls', 'JWT roles, account suspension, agent permissions and separate business database roles.', 'auth_routes.py; business_db.py'),
        ('ASI04', 'Agentic Supply Chain Vulnerabilities', 'planned', 'Registry fingerprint is observable; signed registry/model supply-chain verification is not implemented.', 'tool_registry.py'),
        ('ASI05', 'Unexpected Code Execution', 'implemented controls', 'Privileged shell requests are denied; file paths are confined by application checks.', 'policy_engine.py; workspace.py'),
        ('ASI06', 'Memory and Context Poisoning', 'partial', 'Conversation taint/data class influences egress. This is not formal information-flow isolation.', 'chat_service.py; context.py'),
        ('ASI07', 'Insecure Inter-Agent Communication', 'partial', 'Server-side capability handoffs retain context; cryptographic handoff authentication is not implemented.', 'qwen_agent.py'),
        ('ASI08', 'Cascading Failures', 'partial', 'Bounded agent loops and a persistent execution stop; dedicated burst circuit breakers remain future work.', 'qwen_agent.py; runtime_control.py'),
        ('ASI09', 'Human-Agent Trust Exploitation', 'partial', 'Human review includes reasons and context. Approval-fatigue evaluation remains future work.', 'approval_routes.py'),
        ('ASI10', 'Rogue Agents', 'implemented controls', 'Behavioral trust, quarantine, per-agent deactivation and global execution stop.', 'trust_model.py; security_routes.py'),
    ]
    changes = db.scalars(select(ControlChange).order_by(ControlChange.id.desc()).limit(20)).all()
    return {'claim': 'Implementation mapping, not certification or proof of full risk coverage',
            'framework': 'OWASP Top 10 for Agentic Applications 2026',
            'controls': [dict(id=i, title=t, status=s, explanation=e, evidence=f) for i, t, s, e, f in controls],
            'nist': [{'id': 'AC-3 / AC-6', 'mapping': 'Access enforcement and least privilege'},
                     {'id': 'AU-2 / AU-12', 'mapping': 'Persisted security events, not immutable storage'},
                     {'id': 'SI-4 / SI-10', 'mapping': 'Monitoring and input validation'},
                     {'id': 'SP 800-207', 'mapping': 'Policy decision/enforcement separation inspired by zero-trust architecture'}],
            'changes': [{'paused': c.paused, 'actor': c.actor, 'reason': c.reason,
                         'created_at': c.created_at.isoformat() + 'Z'} for c in changes]}
