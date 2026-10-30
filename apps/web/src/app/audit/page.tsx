"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { usePolling } from "@/lib/usePolling";
import AppShell from "@/components/AppShell";
import { DecisionBadge, EmptyState, ErrorBox, FactorBreakdown, Panel, ReasonList, RiskBar, formatTime } from "@/components/ui";
import { apiGet, type Agent, type SecurityEvent } from "@/lib/api";

export default function AuditPage() {
  return (
    <AppShell title="Audit Explorer" eyebrow="Every decision, reconstructable">
      <AuditContent />
    </AppShell>
  );
}

function AuditContent() {
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [decision, setDecision] = useState("");
  const [agentId, setAgentId] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ limit: "200" });
    if (decision) params.set("decision", decision);
    if (agentId) params.set("agent_id", agentId);
    try {
      setEvents(await apiGet<SecurityEvent[]>(`/api/events?${params.toString()}`));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load events.");
    }
  }, [decision, agentId]);

  usePolling(load);

  useEffect(() => {
    apiGet<Agent[]>("/api/agents").then(setAgents).catch(() => {});
  }, []);

  function exportCsv() {
    const header = ["id", "created_at", "agent", "tool", "action", "decision", "risk_score", "rule", "tainted", "trust_before"];
    const rows = events.map((e) =>
      [e.id, e.created_at, e.agent_name, e.tool_name, e.action, e.decision, e.risk_score, e.rule ?? "", e.tainted ?? "", e.trust_before ?? ""].join(",")
    );
    const blob = new Blob([[header.join(","), ...rows].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "policyguard_events.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  const select = "rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-xs outline-none";

  return (
    <>
      {error && <ErrorBox message={error} />}
      <Panel
        title={`Security events (${events.length})`}
        subtitle="Click a row for reasons and risk-factor breakdown"
        actions={
          <div className="flex flex-wrap gap-2">
            <select value={decision} onChange={(e) => setDecision(e.target.value)} className={select}>
              <option value="">All decisions</option>
              <option value="ALLOW">ALLOW</option>
              <option value="REVIEW">REVIEW</option>
              <option value="DENY">DENY</option>
            </select>
            <select value={agentId} onChange={(e) => setAgentId(e.target.value)} className={select}>
              <option value="">All agents</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            <button onClick={exportCsv} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/70 hover:bg-white/[0.06]">
              Export CSV
            </button>
          </div>
        }
      >
        {events.length === 0 ? (
          <EmptyState message="No events match these filters." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-white/35">
                <tr>
                  <th className="pb-2 font-normal">Time</th>
                  <th className="pb-2 font-normal">Agent</th>
                  <th className="pb-2 font-normal">Tool</th>
                  <th className="pb-2 font-normal">Decision</th>
                  <th className="pb-2 font-normal">Risk</th>
                  <th className="pb-2 font-normal">Rule</th>
                  <th className="pb-2 font-normal">Trust</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {events.map((e) => (
                  <Fragment key={e.id}>
                    <tr onClick={() => setOpen(open === e.id ? null : e.id)} className="cursor-pointer hover:bg-white/[0.02]">
                      <td className="py-2 text-white/45">{formatTime(e.created_at)}</td>
                      <td className="py-2 text-white/70">{e.agent_name}</td>
                      <td className="py-2 font-mono">
                        {e.tool_name}
                        {e.tainted && <span className="ml-2 text-[10px] text-amber-300">tainted</span>}
                      </td>
                      <td className="py-2"><DecisionBadge value={e.decision} /></td>
                      <td className="py-2"><RiskBar value={e.risk_score} /></td>
                      <td className="py-2 font-mono text-white/45">{e.rule ?? "legacy"}</td>
                      <td className="py-2 font-mono text-white/45">{e.trust_before?.toFixed(3) ?? "—"}</td>
                    </tr>
                    {open === e.id && (
                      <tr>
                        <td colSpan={7} className="bg-white/[0.02] p-4">
                          <div className="grid gap-4 md:grid-cols-3">
                            <pre className="overflow-x-auto rounded-lg bg-black/40 p-2 font-mono text-[11px] text-white/55">
                              {JSON.stringify(e.arguments ?? {}, null, 2)}
                            </pre>
                            <ReasonList reasons={e.reasons} />
                            <FactorBreakdown factors={e.factors} />
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
