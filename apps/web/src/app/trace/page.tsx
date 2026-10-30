"use client";

import { useCallback, useState } from "react";
import { usePolling } from "@/lib/usePolling";
import AppShell from "@/components/AppShell";
import { DecisionBadge, EmptyState, ErrorBox, FactorBreakdown, Panel, ReasonList, RiskBar, formatTime } from "@/components/ui";
import { apiGet, type AgentRun } from "@/lib/api";

export default function TracePage() {
  return (
    <AppShell title="Live Trace" eyebrow="Agent runs, step by step">
      <TraceContent />
    </AppShell>
  );
}

function TraceContent() {
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiGet<AgentRun[]>("/api/runs?limit=25");
      setRuns(data);
      setSelected((cur) => cur ?? data[0]?.id ?? null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load runs.");
    }
  }, []);

  usePolling(load, 4000);

  const run = runs.find((r) => r.id === selected);

  return (
    <>
      {error && <ErrorBox message={error} />}
      <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
        <Panel title="Recent runs" subtitle="Auto-refreshes every 4s">
          {runs.length === 0 ? (
            <EmptyState message="No runs yet." />
          ) : (
            <div className="space-y-2">
              {runs.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setSelected(r.id)}
                  className={`w-full rounded-lg border p-3 text-left transition ${
                    r.id === selected ? "border-white/30 bg-white/[0.06]" : "border-white/10 hover:bg-white/[0.03]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-medium">{r.agent_name}</span>
                    <span className="shrink-0 text-[10px] uppercase text-white/40">{r.status}</span>
                  </div>
                  <div className="mt-1 line-clamp-2 text-[11px] text-white/45">{r.prompt}</div>
                  <div className="mt-2 flex gap-1">
                    {r.events.map((e) => (
                      <span
                        key={e.id}
                        className={`h-1.5 w-4 rounded-full ${
                          e.decision === "ALLOW" ? "bg-emerald-400" : e.decision === "REVIEW" ? "bg-amber-400" : "bg-red-400"
                        }`}
                      />
                    ))}
                  </div>
                </button>
              ))}
            </div>
          )}
        </Panel>

        {run ? (
          <div className="space-y-6">
            <Panel title={run.agent_name} subtitle={`${formatTime(run.created_at)} · by ${run.user_email ?? "unknown"} · ${run.status}`}>
              <div className="text-[11px] uppercase tracking-wider text-white/30">User instruction</div>
              <p className="mt-1 text-sm text-white/80">{run.prompt}</p>
              {run.final_output && (
                <>
                  <div className="mt-4 text-[11px] uppercase tracking-wider text-white/30">Agent output</div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-white/65">{run.final_output}</p>
                </>
              )}
            </Panel>

            <Panel title="Timeline" subtitle="Each tool request in order">
              {run.events.length === 0 ? (
                <EmptyState message="No tool requests in this run." />
              ) : (
                <ol className="relative space-y-5 border-l border-white/10 pl-6">
                  {run.events.map((e, i) => (
                    <li key={e.id} className="relative">
                      <span
                        className={`absolute -left-[31px] top-1 h-3 w-3 rounded-full border-2 border-[#0d121c] ${
                          e.decision === "ALLOW" ? "bg-emerald-400" : e.decision === "REVIEW" ? "bg-amber-400" : "bg-red-400"
                        }`}
                      />
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-white/30">step {i + 1}</span>
                          <DecisionBadge value={e.decision} />
                          <span className="font-mono text-sm">{e.tool_name}</span>
                          {e.tainted && <span className="rounded bg-amber-400/10 px-1.5 text-[10px] text-amber-300">tainted</span>}
                          {e.rule && e.rule !== "risk_threshold" && (
                            <span className="rounded bg-red-400/10 px-1.5 font-mono text-[10px] text-red-300">{e.rule}</span>
                          )}
                        </div>
                        <RiskBar value={e.risk_score} />
                      </div>
                      <pre className="mt-2 overflow-x-auto rounded-lg bg-black/40 p-2 font-mono text-[11px] text-white/55">
                        {JSON.stringify(e.arguments ?? {}, null, 2)}
                      </pre>
                      <div className="mt-3 grid gap-4 md:grid-cols-2">
                        <ReasonList reasons={e.reasons} />
                        <FactorBreakdown factors={e.factors} />
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </Panel>
          </div>
        ) : (
          <Panel>
            <EmptyState message="Select a run." />
          </Panel>
        )}
      </div>
    </>
  );
}
