"use client";
import { useEffect, useState } from "react";
import AppShell, { useUser } from "@/components/AppShell";
import { ErrorBox, Panel } from "@/components/ui";
import { apiGet, apiSend } from "@/lib/api";
import { buttonClass, errorText, fieldClass, type SecurityConfig } from "@/lib/security";

type Coverage = { claim: string; controls: { id: string; title: string; status: string; explanation: string; evidence: string }[]; nist: { id: string; mapping: string }[]; changes: { paused: boolean; actor: string; reason: string; created_at: string }[] };
export default function ThreatCenter() { return <AppShell title="Threat Center" eyebrow="Controls, limitations & emergency response"><Center /></AppShell>; }
function Center() {
  const user = useUser();
  const [config, setConfig] = useState<SecurityConfig | null>(null);
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    Promise.all([apiGet<SecurityConfig>("/api/policy/config"), apiGet<Coverage>("/api/security/coverage")]).then(([c, v]) => { if (active) { setConfig(c); setCoverage(v); } }).catch(e => { if (active) setError(errorText(e)); });
    return () => { active = false; };
  }, []);
  async function toggle() {
    if (!config) return;
    setBusy(true); setError("");
    try {
      await apiSend("/api/security/control", "POST", { paused: !config.control.paused, reason });
      const [c, v] = await Promise.all([apiGet<SecurityConfig>("/api/policy/config"), apiGet<Coverage>("/api/security/coverage")]);
      setConfig(c); setCoverage(v); setReason("");
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  return <>
    {error && <ErrorBox message={error} />}
    <div className="mb-6 grid gap-6 xl:grid-cols-2">
      <Panel title="Global execution control" subtitle="Persistent across API restarts; applies to broker and approval execution">
        <p className={`mb-3 text-lg font-semibold ${config?.control.paused ? "text-red-300" : "text-emerald-300"}`}>{config ? config.control.paused ? "Execution paused" : "Execution enabled" : "Loading…"}</p>
        <p className="mb-4 text-xs leading-relaxed text-white/50">A pause waits for supported in-flight tool executions to finish, then denies subsequent execution. It does not undo completed actions or interrupt an external operation already running.</p>
        {user?.role === "admin" && <div className="space-y-3"><label className="block text-xs text-white/55">Reason for the control change<input className={`${fieldClass} mt-1`} maxLength={500} value={reason} onChange={e => setReason(e.target.value)} /></label><button className={buttonClass} disabled={!config || busy || reason.trim().length < 3} onClick={toggle}>{busy ? "Applying…" : config?.control.paused ? "Resume execution" : "Pause execution"}</button></div>}
        {config?.control.updated_by && <p className="mt-3 text-xs text-white/40">Last changed by {config.control.updated_by} · {new Date(config.control.updated_at).toLocaleString()}</p>}
      </Panel>
      <Panel title="Environment & evidence"><div className="space-y-3 text-sm text-white/55"><p>Application version: {config?.version ?? "…"}</p><p>Configured agent model: {config?.model ?? "…"} (availability checked separately)</p><p>Email delivery: {config?.email_mode ?? "…"}</p><p className="break-all text-xs">Registry fingerprint: {config?.registry_sha256 ?? "…"}</p><p className="text-xs">A fingerprint identifies this registry definition; it is not a signed supply-chain verification.</p></div></Panel>
    </div>
    <Panel title="OWASP Agentic Top 10 implementation map" subtitle={coverage?.claim}>
      <div className="grid gap-4 lg:grid-cols-2">{coverage?.controls.map(c => <article key={c.id} className="rounded-xl border border-white/10 p-4"><div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">{c.id} · {c.title}</h3><span className={`rounded px-2 py-1 text-[10px] uppercase ${c.status === "planned" ? "bg-white/5 text-white/40" : c.status === "partial" ? "bg-amber-400/10 text-amber-300" : "bg-sky-400/10 text-sky-300"}`}>{c.status}</span></div><p className="text-xs leading-relaxed text-white/55">{c.explanation}</p><p className="mt-3 font-mono text-[10px] text-white/35">{c.evidence}</p></article>)}</div>
    </Panel>
    <div className="mt-6 grid gap-6 lg:grid-cols-2"><Panel title="Selected NIST mappings">{coverage?.nist.map(n => <p key={n.id} className="mb-3 text-xs text-white/55"><b>{n.id}</b> · {n.mapping}</p>)}</Panel><Panel title="Execution-control history">{coverage?.changes.length ? coverage.changes.map((c, i) => <p key={i} className="mb-3 text-xs text-white/55">{c.paused ? "PAUSED" : "RESUMED"} · {c.actor}<br />{c.reason} · {new Date(c.created_at).toLocaleString()}</p>) : <p className="text-xs text-white/40">No control changes recorded.</p>}</Panel></div>
  </>;
}
