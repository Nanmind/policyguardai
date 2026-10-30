"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { DecisionBadge, ErrorBox, FactorBreakdown, Panel, ReasonList } from "@/components/ui";
import { apiGet, apiSend, type Agent } from "@/lib/api";
import { buttonClass, errorText, fieldClass, type SecurityConfig } from "@/lib/security";

type Result = { decision: string; risk_score: number; reasons: string[]; rule: string; factors: Record<string, number>; destination: string };
const examples: Record<string, object> = {
  file_reader: { path: "report.txt" }, create_document: { filename: "summary.txt", content: "Example summary" },
  email_sender: { to: "reviewer@example.com", subject: "Project summary", body: "A public summary" },
  web_fetch: { url: "https://example.com" }, database_query: { sql: "SELECT COUNT(*) FROM customers" },
  admin_shell: { command: "whoami" }, weather_lookup: { city: "Mumbai" },
};

export default function PolicyStudio() {
  return <AppShell title="Policy Studio" eyebrow="Explain a proposed action" requiredRoles={["admin", "analyst"]}><Studio /></AppShell>;
}
function Studio() {
  const [config, setConfig] = useState<SecurityConfig | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agent, setAgent] = useState(0);
  const [tool, setTool] = useState("file_reader");
  const [args, setArgs] = useState(JSON.stringify(examples.file_reader, null, 2));
  const [level, setLevel] = useState(0);
  const [tainted, setTainted] = useState(false);
  const [intent, setIntent] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    Promise.all([apiGet<SecurityConfig>("/api/policy/config"), apiGet<Agent[]>("/api/agents")]).then(([c, a]) => {
      if (active) { setConfig(c); setAgents(a); setAgent(a[0]?.id ?? 0); }
    }).catch(e => { if (active) setError(errorText(e)); });
    return () => { active = false; };
  }, []);
  async function simulate() {
    setBusy(true); setError(""); setResult(null);
    try {
      const parsed = JSON.parse(args);
      if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error("Arguments must be a JSON object.");
      setResult(await apiSend<Result>("/api/policy/simulate", "POST", { agent_id: agent, tool_name: tool, arguments: parsed, data_level: level, tainted, request_risk: intent }));
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  return <>
    <p className="mb-6 max-w-3xl text-sm text-white/55">Inspect a hypothetical request using the live agent permissions, trust and policy. Simulation does not execute tools, change trust, or create approval requests.</p>
    {error && <ErrorBox message={error} />}
    {config?.control.paused && <div className="mb-5 rounded-lg border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">Global execution is paused. The live execution gate also applies to simulations.</div>}
    <div className="grid gap-6 xl:grid-cols-2">
      <Panel title="Proposed action" subtitle="Change context to see why the same tool can receive a different decision">
        <div className="space-y-4">
          <label className="block text-xs text-white/60">Agent<select className={`${fieldClass} mt-1`} value={agent} onChange={e => { setAgent(Number(e.target.value)); setResult(null); }}>{agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
          <label className="block text-xs text-white/60">Tool<select className={`${fieldClass} mt-1`} value={tool} onChange={e => { setTool(e.target.value); setArgs(JSON.stringify(examples[e.target.value] ?? {}, null, 2)); setResult(null); }}>{Object.keys(config?.tools ?? {}).map(n => <option key={n}>{n}</option>)}</select></label>
          <label className="block text-xs text-white/60">Arguments<textarea rows={6} className={`${fieldClass} mt-1 font-mono`} value={args} onChange={e => { setArgs(e.target.value); setResult(null); }} /></label>
          <label className="block text-xs text-white/60">Most sensitive data seen<select className={`${fieldClass} mt-1`} value={level} onChange={e => { setLevel(Number(e.target.value)); setResult(null); }}><option value={0}>Public</option><option value={1}>Internal</option><option value={2}>Confidential business data</option></select></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={tainted} onChange={e => { setTainted(e.target.checked); setResult(null); }} />Previously read untrusted content</label>
          <label className="block text-xs text-white/60">Hypothetical request-intent risk: {intent.toFixed(2)}<input className="mt-2 w-full" type="range" min={0} max={1} step={0.05} value={intent} onChange={e => { setIntent(Number(e.target.value)); setResult(null); }} /></label>
          <button className={buttonClass} onClick={simulate} disabled={busy || !agent}>{busy ? "Evaluating…" : "Simulate decision"}</button>
        </div>
      </Panel>
      <div className="space-y-6">
        <Panel title="Decision explanation" subtitle={config ? `REVIEW ≥ ${config.review_threshold} · DENY ≥ ${config.deny_threshold}; hard rules and floors can override score` : "Loading policy…"}>
          {result ? <div className="space-y-5"><div className="flex items-center gap-3"><DecisionBadge value={result.decision} /><span className="font-mono">Risk {result.risk_score.toFixed(4)}</span></div><p className="text-xs text-white/50">Rule: {result.rule} · Destination: {result.destination}</p><FactorBreakdown factors={result.factors} /><ReasonList reasons={result.reasons} /></div> : <p className="text-sm text-white/40">Run a simulation to see factor contributions and the controlling rule.</p>}
        </Panel>
        <Panel title="How to interpret this"><p className="text-sm leading-relaxed text-white/55">Hard rules can deny a low-score action. Review floors can escalate it. Contributions are summed and clamped, with a separate destination adjustment; these are heuristic choices, not trained probabilities.</p></Panel>
      </div>
    </div>
  </>;
}
