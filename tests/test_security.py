"""Isolated integration checks; SQLite does not validate PostgreSQL row locking."""
import unittest
from datetime import datetime, timedelta
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from apps.api.auth_utils import create_access_token
from apps.api.context import ExecutionContext
from apps.api.database import get_db
from apps.api.evaluation import run_policy_suite
from apps.api.main import app
from apps.api.models import Agent, ApprovalRequest, Base, ControlChange, RuntimeControl, SecurityEvent, User
from apps.api.tool_broker import ToolBroker


class SecurityIntegration(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        with Session(self.engine) as db:
            db.add_all([User(id=1, email='admin@example.com', password_hash='unused', role='admin'),
                        User(id=2, email='viewer@example.com', password_hash='unused', role='viewer'),
                        User(id=3, email='analyst@example.com', password_hash='unused', role='analyst'),
                        Agent(id=1, name='Test agent', role='research', allowed_tools=['file_reader', 'web_fetch', 'create_document'])])
            db.commit()
        def session():
            with Session(self.engine) as db: yield db
        app.dependency_overrides[get_db] = session
        self.patches = [patch('apps.api.main.engine', self.engine), patch('apps.api.tool_broker.engine', self.engine)]
        for p in self.patches: p.start()
        self.client = TestClient(app)
        self.client.__enter__()
        self.ctx = ExecutionContext(run_id='test', user_id=1, user_email='admin@example.com')

    def tearDown(self):
        self.client.__exit__(None, None, None)
        app.dependency_overrides.clear()
        for p in reversed(self.patches): p.stop()
        self.engine.dispose()

    def headers(self, uid=1, role='admin'):
        return {'Authorization': 'Bearer '+create_access_token(uid, f'{role}@example.com', role, 0)}

    def pending(self):
        with Session(self.engine) as db:
            a = ApprovalRequest(agent_id=1, tool_name='web_fetch', action='read', arguments={'url':'https://example.com'},
                                risk_score=.3, status='PENDING', context=self.ctx.to_json())
            db.add(a); db.commit(); return a.id

    def decide(self, aid):
        return self.client.post(f'/api/approvals/{aid}/decision',json={'decision':'APPROVE'},headers=self.headers())

    def test_policy_cases(self):
        r=run_policy_suite(); self.assertEqual((r['passed'],r['total']),(18,18))
        self.assertEqual(len(r['engine_sha256']),64)

    def test_protected_routes(self):
        self.assertEqual(self.client.get('/api/policy/config').status_code,401)
        for route in ['/api/policy/simulate','/api/evaluations/policy']:
            self.assertEqual(self.client.post(route,json={},headers=self.headers(2,'viewer')).status_code,403)

    def test_only_admin_can_pause(self):
        r=self.client.post('/api/security/control',json={'paused':True,'reason':'testing'},headers=self.headers(3,'analyst'))
        self.assertEqual(r.status_code,403)

    def test_simulation_has_no_execution_or_mutations(self):
        with patch('apps.api.tool_executor.ToolExecutor.execute') as execute:
            r=self.client.post('/api/policy/simulate',json={'agent_id':1,'tool_name':'file_reader','arguments':{'path':'report.txt'}},headers=self.headers())
            self.assertEqual(r.status_code,200);self.assertFalse(r.json()['executed']);execute.assert_not_called()
        with Session(self.engine) as db:
            self.assertEqual(db.scalar(select(func.count()).select_from(SecurityEvent)),0)
            self.assertEqual(db.scalar(select(func.count()).select_from(ApprovalRequest)),0)
            self.assertEqual(db.get(Agent,1).trust_pos,0)

    def test_simulation_rejects_nonfinite_intent(self):
        r=self.client.post('/api/policy/simulate',json={'agent_id':1,'tool_name':'file_reader','request_risk':'NaN'},headers=self.headers())
        self.assertEqual(r.status_code,422)

    def test_stop_blocks_broker_without_trust_penalty(self):
        r=self.client.post('/api/security/control',json={'paused':True,'reason':'recorded test'},headers=self.headers())
        self.assertEqual(r.status_code,200)
        with patch('apps.api.tool_executor.ToolExecutor.execute') as execute:
            r=ToolBroker().request_tool(1,'file_reader',{'path':'report.txt'},self.ctx)
            self.assertEqual(r['rule'],'emergency_stop');execute.assert_not_called()
        with Session(self.engine) as db:
            self.assertEqual(db.get(Agent,1).trust_neg,0)
            self.assertEqual(db.get(User,1).trust_neg,0)
            self.assertEqual(db.scalar(select(func.count()).select_from(ControlChange)),1)

    def test_stop_blocks_old_approval(self):
        aid=self.pending()
        self.client.post('/api/security/control',json={'paused':True,'reason':'test pause'},headers=self.headers())
        with patch('apps.api.tool_executor.ToolExecutor.execute') as execute:
            r=self.decide(aid);self.assertEqual(r.status_code,409);execute.assert_not_called()
        with Session(self.engine) as db:self.assertEqual(db.get(ApprovalRequest,aid).status,'PENDING')

    def test_deactivation_blocks_old_approval(self):
        aid=self.pending()
        with Session(self.engine) as db:
            db.get(Agent,1).is_active=False;db.commit()
        with patch('apps.api.tool_executor.ToolExecutor.execute') as execute:
            self.assertEqual(self.decide(aid).status_code,409);execute.assert_not_called()

    def test_legacy_approval_without_requester_is_blocked(self):
        aid=self.pending()
        with Session(self.engine) as db:
            db.get(ApprovalRequest,aid).context=None;db.commit()
        with patch('apps.api.tool_executor.ToolExecutor.execute') as execute:
            self.assertEqual(self.decide(aid).status_code,409);execute.assert_not_called()

    def test_changed_allowlist_blocks_old_approval(self):
        aid=self.pending()
        with Session(self.engine) as db:
            db.get(Agent,1).allowed_tools=[];db.commit()
        with patch('apps.api.tool_executor.ToolExecutor.execute') as execute:
            self.assertEqual(self.decide(aid).status_code,409);execute.assert_not_called()

    def test_suspended_requester_blocks_old_approval(self):
        aid=self.pending()
        with Session(self.engine) as db:
            a=db.get(ApprovalRequest,aid);ctx=dict(a.context);ctx['user_id']=3;a.context=ctx
            db.get(User,3).suspended_until=datetime.utcnow()+timedelta(hours=1);db.commit()
        with patch('apps.api.tool_executor.ToolExecutor.execute') as execute:
            self.assertEqual(self.decide(aid).status_code,409);execute.assert_not_called()

    def test_approval_executes_only_once(self):
        aid=self.pending()
        with patch('apps.api.tool_executor.ToolExecutor.execute',return_value={'status':'success','result':'test response'}) as execute:
            self.assertEqual(self.decide(aid).status_code,200)
            self.assertEqual(self.decide(aid).status_code,409)
            self.assertEqual(execute.call_count,1)

    def test_failed_execution_has_no_positive_trust(self):
        aid=self.pending()
        with patch('apps.api.tool_executor.ToolExecutor.execute',side_effect=RuntimeError('test failure')):
            r=self.decide(aid);self.assertEqual(r.status_code,200);self.assertEqual(r.json()['tool_result']['status'],'error')
        with Session(self.engine) as db:self.assertEqual(db.get(Agent,1).trust_pos,0)

    def test_stop_survives_startup(self):
        self.client.post('/api/security/control',json={'paused':True,'reason':'restart test'},headers=self.headers())
        with TestClient(app) as other:
            self.assertTrue(other.get('/api/policy/config',headers=self.headers()).json()['control']['paused'])

    def test_complete_coverage_map_with_limitations(self):
        r=self.client.get('/api/security/coverage',headers=self.headers())
        self.assertEqual(len(r.json()['controls']),10)
        self.assertTrue(any(c['status']=='planned' for c in r.json()['controls']))


if __name__=='__main__':unittest.main()
