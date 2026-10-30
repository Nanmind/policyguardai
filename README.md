# Policy Guard-AI

A prototype runtime authorization layer for tool-using AI agents: three seeded agents, ten registry entries, contextual ALLOW/REVIEW/DENY decisions, Bayesian reputation, human review and an operator console.

## Run locally

See [HOME_PC_SETUP.md](HOME_PC_SETUP.md) for the portable Python launcher, Windows commands, prerequisites, model readiness and a recording checklist. The existing [RUNNING.md](RUNNING.md) describes the original manual workflow.

```bash
python3 scripts/run_local.py setup
python3 scripts/run_local.py start
python3 scripts/run_local.py stop
```

Use Python 3.12, Node.js 24 LTS and Docker Compose. Existing PostgreSQL configurations can use `--existing-db`. Ollama and its installed model are separate prerequisites for actual agent chat; dry-run policy experiments work without model inference.

## Current release

[Version 0.4](RELEASE_0_4.md) adds working Policy Studio, Attack Lab and Threat Center pages, a persistent global execution stop, revalidation before approved execution and duplicate-approval locking. Policy experiments are labelled as deterministic regression scenarios, not LLM red-team benchmark results. The production frontend uses system fonts so builds do not require Google Fonts access.

## Verify

```bash
apps/api/.venv/bin/python -m unittest discover -s tests -v
apps/api/.venv/bin/python scripts/check_postgres_locking.py
cd apps/web
npm run lint
npm run build
```

On Windows, the virtualenv Python is `apps/api/.venv/Scripts/python.exe`. The PostgreSQL check creates and removes only a temporary isolated schema and requires schema-create privileges. It does not drop application tables. Linux process-state tests are skipped on Windows.

Security-model integration, fifteen-parameter/company profiles, cryptographic handoff verification, learned risk/anomaly models and agent-level comparative evaluation remain future work. This prototype is not a certified or formally verified security boundary. Never commit `.env`, local credentials, user uploads or database contents.
