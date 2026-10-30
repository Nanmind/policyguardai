"""Check locks in an isolated, temporary schema in the configured dev PostgreSQL.

Run with apps/api/.venv/bin/python scripts/check_postgres_locking.py.
Requires schema-create privilege. Never drops existing application tables.
"""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import secrets
import sys
import threading
from time import monotonic
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session
from sqlalchemy.schema import CreateSchema, DropSchema
from apps.api.auth_utils import create_access_token
from apps.api.context import ExecutionContext
from apps.api.database import engine as parent_engine, get_db
from apps.api.main import app
from apps.api.models import Agent, ApprovalRequest, User
from apps.api.tool_broker import ToolBroker


def main():
    if parent_engine.dialect.name != 'postgresql': raise RuntimeError('PostgreSQL is required')
    schema = 'policyguard_check_' + secrets.token_hex(6)
    with parent_engine.begin() as conn: conn.execute(CreateSchema(schema))
    engine = create_engine(parent_engine.url, connect_args={'options': '-csearch_path=' + schema})
    def session():
        with Session(engine) as db: yield db
    app.dependency_overrides[get_db] = session
    try:
        with patch('apps.api.main.engine',engine), patch('apps.api.tool_broker.engine',engine), TestClient(app) as client:
            with Session(engine) as db:
                db.add_all([User(id=1,email='lock-check@example.com',password_hash='not-used',role='admin'),
                            Agent(id=1,name='Lock check',role='test',allowed_tools=['file_reader','web_fetch'])]);db.commit()
                ctx=ExecutionContext(run_id='lockcheck',user_id=1,user_email='lock-check@example.com')
                a=ApprovalRequest(agent_id=1,tool_name='web_fetch',action='read',arguments={'url':'https://example.com'},
                                  risk_score=.3,context=ctx.to_json(),status='PENDING')
                db.add(a);db.commit();aid=a.id
            headers={'Authorization':'Bearer '+create_access_token(1,'lock-check@example.com','admin',0)}
            entered,release=threading.Event(),threading.Event()
            def execute(*args):
                entered.set()
                if not release.wait(10):raise RuntimeError('test execution timed out')
                return {'status':'success','result':'isolated test'}
            with ThreadPoolExecutor(max_workers=2) as pool, patch('apps.api.tool_executor.ToolExecutor.execute',side_effect=execute) as mock:
                first=pool.submit(client.post,f'/api/approvals/{aid}/decision',json={'decision':'APPROVE'},headers=headers)
                assert entered.wait(3),'First execution did not start'
                second=pool.submit(client.post,f'/api/approvals/{aid}/decision',json={'decision':'APPROVE'},headers=headers)
                try:
                    assert wait_for_lock(engine,3),'Concurrent approval did not wait on a database lock'
                finally:release.set()
                statuses=sorted([first.result(timeout=5).status_code,second.result(timeout=5).status_code])
                assert statuses==[200,409],statuses
                assert mock.call_count==1,mock.call_count
                print('PASS PostgreSQL concurrent approval: exactly one execution, responses 200 and 409')
            entered.clear();release.clear()
            with ThreadPoolExecutor(max_workers=2) as pool, patch('apps.api.tool_executor.ToolExecutor.execute',side_effect=execute):
                running=pool.submit(ToolBroker().request_tool,1,'file_reader',{'path':'report.txt'},ctx)
                assert entered.wait(3),'Broker execution did not start'
                stopping=pool.submit(client.post,'/api/security/control',json={'paused':True,'reason':'isolated locking check'},headers=headers)
                try:
                    assert wait_for_lock(engine,3),'Pause did not wait for in-flight execution'
                    assert not stopping.done(),'Pause completed before in-flight execution'
                finally:release.set()
                assert running.result(timeout=5)['tool_result']['status']=='success'
                assert stopping.result(timeout=5).status_code==200
                denied=ToolBroker().request_tool(1,'file_reader',{'path':'report.txt'},ctx)
                assert denied['rule']=='emergency_stop'
                print('PASS PostgreSQL pause waits for in-flight execution and blocks the next request')
    finally:
        app.dependency_overrides.clear();engine.dispose()
        with parent_engine.begin() as conn:conn.execute(DropSchema(schema,cascade=True))
    return 0


def wait_for_lock(engine, seconds):
    deadline=monotonic()+seconds
    while monotonic()<deadline:
        with engine.connect() as conn:
            count=conn.scalar(text("SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND application_name='policyguard-lock-check'"))
        if count:return True
        threading.Event().wait(.03)
    return False

if __name__=='__main__':
    # Identifies only this check's sessions in pg_stat_activity.
    import os
    os.environ['PGAPPNAME']='policyguard-lock-check'
    raise SystemExit(main())
