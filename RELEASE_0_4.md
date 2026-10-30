# PolicyGuard-AI 0.4 — verified baseline update

This release is a concrete implementation update for the screening demonstration. It does not complete every feature in the faculty roadmap.

## Delivered

- Policy Studio uses the same assessment function as real tool requests. Hypothetical context is explicit; tools, approvals and trust are not mutated by simulation.
- Attack Lab runs 18 project-authored policy cases and exports decisions, factor contributions, reasons, measured policy-only timings and SHA-256 fingerprints. Baselines compare expected decision matches on these same cases. This is not an AgentDojo/InjecAgent run or an attack-success-rate result.
- Threat Center maps all ten OWASP agentic risk categories to implemented controls, partial controls or planned work, plus selected NIST mappings. It records global execution-control changes.
- Persistent global execution pause applies to normal broker and approved-tool execution. Shared/exclusive PostgreSQL locks let in-flight supported tool calls finish before a pause takes effect. Pausing cannot cancel an already-running external operation or undo a completed action.
- Approvals lock their database row and recheck the current agent, requester, content and policy. Legacy approvals without requester context must be resubmitted. A DENY cannot be overridden by approval. Failed approved execution does not earn positive trust evidence.
- The production build uses system fonts and no longer fetches Google Fonts. Polling is scheduled after commit without overlapping periodic polls. Negative policy adjustments display correctly.
- Portable setup/start/stop scripts replace machine-specific external paths. Existing config is preserved, readiness is checked, and recorded process identities are verified before stopping.

## Evidence collected on the cloud machine

- Production build and its TypeScript phase: passed.
- ESLint: passed.
- Fifteen isolated application integration tests: passed.
- Three Linux launcher process-state tests: passed; these are skipped on Windows.
- Eighteen policy scenarios within the test suite and UI evaluation: all expected decisions matched.
- Two independent real-PostgreSQL checks: concurrent approval executed once (200/409), and pause waited for an in-flight tool before denying the next request.
- Production browser check: safe simulation, privileged denial, policy suite, JSON download, pause, paused simulation and resume passed with no page errors.
- Portable setup and managed stop/start: exercised on Linux. Persistent pause survived restart and was then resumed. Windows-specific process handling and the home-PC GPU/model path remain unverified until run there.

Tests use isolated fixtures. UI screenshots use a temporary test account and controlled broker requests, not an autonomous model run. The companion review material records their origin. Models and credentials are not bundled.

## Facts for report updates

The current implementation has three seeded agents, ten tool entries (including delegation and disabled shell), fourteen app pages including login, and eleven ORM tables including the two new execution-control tables. The risk function remains the eight-contribution heuristic with REVIEW 0.45 and DENY 0.75; it is not the roadmap's fifteen-parameter model. The earlier report audit describes the original baseline; this release supersedes its statements about disabled future UI pages, missing global stop, failed lint and font-blocked build.

## Remaining faculty-roadmap work

Dedicated semantic security guard, cybersecurity-only advisor mode, post-response auditing, company-size profiles/fifteen signals, signed handoffs and registry verification, ML/Markov models and model-level comparative evaluation are not included. A supply-chain fingerprint alone is not integrity verification, and a standards mapping is not certification. No claim is made about complete prompt-injection prevention, immutable logs, or distributed exactly-once execution after process/database crashes.

The cloud source changes are local until explicitly transferred or published. Download the source bundle for the home PC; sharing the ChatGPT account does not synchronize code, models or database contents. The final report and external presentation must be reviewed against the exact build demonstrated.
