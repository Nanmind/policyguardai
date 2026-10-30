"use client";
import { useState } from "react";
import AppShell from "@/components/AppShell";
import { DecisionBadge, ErrorBox, FactorBreakdown, Panel } from "@/components/ui";
import { apiSend } from "@/lib/api";
import { buttonClass, errorText } from "@/lib/security";

type Row = { name: string; category: string; expected: string; actual: string; passed: boolean; risk_score: number; rule: string; policy_ms: number; factors: Record<string, number>; reasons: string[]; unguarded: string; static_allowlist: string };
type Report = { scope: string; dataset: string; created_at: string; engine_sha256: string; cases_sha256: string; passed: number; total: number; comparisons: { name: string; matches: number; total: number }[]; results: Row[] };
export default function AttackLab() {
  return <AppShell title="Attack Lab" eyebrow="Reproducible policy evaluation" requiredRoles={["admin", "analyst"]}><Lab /></AppShell>;
}
function Lab() {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true); setError("");
    try { setReport(await apiSend<Report>("/api/evaluations/policy", "POST", {})); }
    catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  function download() {
    if (!report) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = "policyguard-policy-evaluation.json"; a.click(); URL.revokeObjectURL(url);
  }
  return <>
    <p className="mb-5 max-w-4xl text-sm leading-relaxed text-white/55">These project-authored scenarios exercise the actual policy engine with fixed tool/context inputs. They perform no model inference or tool execution. Results measure expected decision matches, not attack success rate or full AgentDojo/InjecAgent benchmark performance.</p>
    <div className="mb-6 flex gap-3"><button className={buttonClass} onClick={run} disabled={busy}>{busy ? "Running…" : "Run policy suite"}</button>{report && <button className={buttonClass} onClick={download}>Download evidence JSON</button>}</div>
    {error && <ErrorBox message={error} />}
    {report && <>
      <div className="mb-6 grid gap-4 md:grid-cols-3">{report.comparisons.map(c => <Panel key={c.name} title={c.name}><div className="text-3xl font-semibold">{c.matches}<span className="text-base text-white/40"> / {c.total}</span></div><div className="mt-2 text-xs text-white/45">Expected decision matches</div></Panel>)}</div>
      <Panel title={`${report.passed} of ${report.total} PolicyGuard scenarios passed`} subtitle={new Date(report.created_at).toLocaleString()}>
        <div className="space-y-2">{report.results.map((r, i) => <details key={i} className="rounded-lg border border-white/10 p-3"><summary className="flex cursor-pointer flex-wrap items-center gap-3 text-sm"><span className={r.passed ? "text-emerald-300" : "text-red-300"}>{r.passed ? "PASS" : "FAIL"}</span><span className="flex-1">{r.name}</span><span className="text-xs text-white/35">{r.category}</span><DecisionBadge value={r.actual} /></summary><div className="mt-4 space-y-3 text-xs text-white/55"><p>Expected: {r.expected} · Rule: {r.rule} · Risk: {r.risk_score.toFixed(4)} · Policy time: {r.policy_ms.toFixed(4)} ms</p><p>Always allow: {r.unguarded} · Tool allowlist only: {r.static_allowlist}</p><FactorBreakdown factors={r.factors} />{r.reasons.map((s, j) => <p key={j}>{s}</p>)}</div></details>)}</div>
      </Panel>
      <div className="mt-5 break-all text-xs leading-relaxed text-white/35">{report.dataset}<br />Engine SHA-256: {report.engine_sha256}<br />Cases SHA-256: {report.cases_sha256}</div>
    </>}
    {!report && <Panel title="Evidence you can reproduce"><p className="text-sm text-white/50">The suite covers safe reads, tool permission boundaries, privileged execution, data-sensitive egress, tainted context and human-review floors. Baseline decisions are computed on the same cases.</p></Panel>}
  </>;
}
