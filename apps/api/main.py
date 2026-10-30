from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from apps.api.agent_routes import router as agent_router
from apps.api.approval_routes import router as approval_router
from apps.api.auth_routes import router as auth_router
from apps.api.chat_routes import router as chat_router
from apps.api.dashboard_routes import router as dashboard_router
from apps.api.database import engine
from apps.api.events_routes import router as events_router
from apps.api.models import Base
from apps.api.routes import router
from apps.api.settings import email_mode
from apps.api.tools_routes import router as tools_router
from apps.api.trust_routes import router as trust_router
from apps.api.users_routes import router as users_router
from apps.api.security_routes import router as security_router
from apps.api.workspace import ensure_workspace


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        conn.execute(text("INSERT INTO runtime_control (id, paused, updated_at) VALUES (1, false, CURRENT_TIMESTAMP) ON CONFLICT (id) DO NOTHING"))
    ensure_workspace()
    yield


app = FastAPI(title="PolicyGuard-AI API", version="0.4.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for r in (router, auth_router, users_router, dashboard_router, agent_router, approval_router,
          events_router, tools_router, chat_router, trust_router, security_router):
    app.include_router(r)


@app.get("/health")
def health_check():
    return {"status": "ok", "service": "policyguard-ai-api", "version": "0.4.0", "email_mode": email_mode()}
