"""Database locks serialize pause changes with supported tool execution paths."""
from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.models import RuntimeControl


def execution_gate(db: Session) -> RuntimeControl:
    # Hold a shared lock through execution/commit. A pause waits for in-flight
    # tools, then stops subsequent broker and approval executions across workers.
    state = db.scalar(select(RuntimeControl).where(RuntimeControl.id == 1).with_for_update(read=True))
    if state is None:
        raise RuntimeError("Execution gate is uninitialized; restart the API.")
    return state
