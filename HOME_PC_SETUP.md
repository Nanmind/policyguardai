# Home PC setup — PolicyGuard-AI 0.4

The source bundle is self-contained and does not depend on a previous Codex/Antigravity folder. Extract it into a normal local folder outside Google Drive/OneDrive. The same ChatGPT account does not transfer dependencies, database records or Ollama models.

Install Python 3.12, Node.js 24 LTS, Docker Desktop with Compose, and Ollama. The Ryzen 5600X / RTX 3060 / 16 GB RAM machine is the target; check the actual VRAM with `nvidia-smi`. Start with the existing quantized Qwen model if installed. Do not download or switch models during recording. A dedicated security model has not been added in this release.

On Windows, open PowerShell in the extracted folder:

```powershell
py -3.12 scripts/run_local.py setup --model qwen3:8b
.\Start-PolicyGuard.ps1 -Model qwen3:8b
```

If execution policy blocks PowerShell scripts, invoke Python directly:

```powershell
py -3.12 scripts/run_local.py start --model qwen3:8b
py -3.12 scripts/run_local.py stop
```

On Linux use `python3 scripts/run_local.py setup`, then `python3 scripts/run_local.py start`. Setup creates the local virtualenv, installs locked Node dependencies, starts PostgreSQL 17, runs migrations/seeding and tests, then builds the production frontend. Setup preserves an existing apps/api/.env. If using an existing database instead of Compose, configure DATABASE_URL in that ignored file and add `--existing-db` to setup/start. Do not copy the cloud .env or passwords from another installation.

The default Compose database uses the repository's development-only credentials and port 5432. If that port is already occupied, setup stops with an error; it does not kill the other service. For an existing PostgreSQL installation, use `--existing-db` with its configured DATABASE_URL. Never run two frontends against the same ports/build folder.

The launcher verifies API health and the production login page before reporting startup. In a new database, your first signup becomes administrator. Register your own account; no demo passwords or user databases are shipped. The app listens on loopback ports 3000 and 8000. Use your local browser to open it. Stop only processes recorded by this launcher; the optional `--stop-db` flag also stops its Compose database without deleting data. Shared Ollama remains separate.

## Ollama readiness

```powershell
ollama list
ollama pull qwen3:8b  # only if not already installed; allow download time
```

The model tag passed to start must match an installed tag. Qwen3:8b is a task model, not a dedicated security classifier. Real chat remains unverified until it is exercised on the recording PC. Gmail and OpenWeather need their own credentials; use environment settings/.env securely, never paste credentials into chat. Without Gmail credentials, email is recorded in a local outbox rather than delivered.

## Demonstration order

1. Login and show the dashboard/three agents/tool registry.
2. Policy Studio: safe file read; Operations Agent requesting admin_shell (DENY); email with public versus confidential/tainted context. Explain that simulations do not execute tools.
3. Attack Lab: run the 18 policy scenarios, inspect a decision and download evidence JSON. Call this policy regression, not measured prompt-injection attack success.
4. Threat Center: explain the implemented/partial/planned OWASP controls. Pause execution, show Policy Studio returning emergency_stop, then resume.
5. With Ollama ready, use Chat to summarize report.txt. Show actual trace and recorded audit events. If demonstrating email, show actual delivery or explicitly label outbox mode.
6. Show an approval and its final status. Previously queued requests are checked again before execution, including emergency stop, current agent permissions and requester suspension.

## Changes delivered in this release

Three working research/operator pages, downloadable deterministic policy evidence, persistent global execution stop, control-change history, revalidated approval execution, duplicate-approval locking and no trust reward for failed approved execution. The frontend production build no longer depends on downloading Google Fonts. Existing polling lint errors and negative-factor display are fixed.

Future work remains explicit: semantic security-model integration, company-size profiles/15-signal scoring, post-response guard auditing, signed handoffs, trained ML/Markov evaluation and full agent-level comparative red-teaming. This release does not claim those features exist.
