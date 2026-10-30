"use client";

import { useCallback, useState } from "react";
import { usePolling } from "@/lib/usePolling";
import AppShell, { useUser } from "@/components/AppShell";
import { DecisionBadge, EmptyState, ErrorBox, Panel, ReasonList, RiskBar, formatTime } from "@/components/ui";
import { apiGet, apiSend } from "@/lib/api";

type Approval = {
  id: number;
  run_id: string | null;
  agent_name: string;
  tool_name: string;
  action: string;
  arguments: Record<string, unknown>;
  risk_score: number;
  reasons: string[];
  status: string;
  execution_result: Record<string, unknown> | null;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
};

export default function ApprovalsPage() {
  return (
    <AppShell title="Approvals" eyebrow="Human-in-the-loop" requiredRoles={["admin", "approver", "analyst"]}>
      <ApprovalsContent />
    </AppShell>
  );
}

function ApprovalsContent() {
  const user = useUser();
  const canDecide = user?.role === "admin" || user?.role === "approver";
  const [items, setItems] = useState<Approval[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      setItems(await apiGet<Approval[]>("/api/approvals"));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load approvals.");
    }
  }, []);

  usePolling(load, 5000);

  async function decide(id: number, decision: "APPROVE" | "REJECT") {
    setBusy(id);
    try {
      await apiSend(`/api/approvals/${id}/decision`, "POST", { decision });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Decision failed.");
    } finally {
      setBusy(null);
    }
  }

  const pending = items.filter((i) => i.status === "PENDING");
  const decided = items.filter((i) => i.status !== "PENDING");

  return (
    <>
      {error && <ErrorBox message={error} />}
      {!canDecide && (
        <div className="mb-4 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs text-white/50">
          You can view approvals, but only <b>admin</b> or <b>approver</b> roles can decide them.
        </div>
      )}

      <Panel title={`Pending (${pending.length})`} subtitle="Actions paused until a human decides. Approve = execute now.">
        {pending.length === 0 ? (
          <EmptyState message="Nothing waiting for review." />
        ) : (
          <div className="space-y-4">
            {pending.map((a) => (
              <div key={a.id} className="rounded-xl border border-amber-400/20 bg-amber-400/[0.03] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-white/40">#{a.id}</span>
                    <span className="font-mono text-sm">{a.tool_name}</span>
                    <span className="text-xs text-white/45">by {a.agent_name}</span>
                  </div>
                  <RiskBar value={a.risk_score} />
                </div>
                <pre className="mt-3 overflow-x-auto rounded-lg bg-black/40 p-2 font-mono text-[11px] text-white/60">
                  {JSON.stringify(a.arguments, null, 2)}
                </pre>
                <div className="mt-3">
                  <ReasonList reasons={a.reasons} />
                </div>
                <div className="mt-2 text-[11px] text-white/30">Requested {formatTime(a.created_at)}</div>
                {canDecide && (
                  <div className="mt-4 flex gap-2">
                    <button
                      disabled={busy === a.id}
                      onClick={() => decide(a.id, "APPROVE")}
                      className="rounded-lg bg-emerald-500/90 px-4 py-1.5 text-xs font-medium text-black hover:bg-emerald-400 disabled:opacity-50"
                    >
                      Approve & execute
                    </button>
                    <button
                      disabled={busy === a.id}
                      onClick={() => decide(a.id, "REJECT")}
                      className="rounded-lg border border-red-400/40 px-4 py-1.5 text-xs text-red-300 hover:bg-red-400/10 disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Panel>

      <div className="mt-6">
        <Panel title="History" subtitle="Human decisions also feed back into agent trust">
          {decided.length === 0 ? (
            <EmptyState message="No decisions yet." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-white/35">
                  <tr>
                    <th className="pb-2 font-normal">#</th>
                    <th className="pb-2 font-normal">Tool</th>
                    <th className="pb-2 font-normal">Agent</th>
                    <th className="pb-2 font-normal">Status</th>
                    <th className="pb-2 font-normal">Decided by</th>
                    <th className="pb-2 font-normal">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {decided.map((a) => (
                    <tr key={a.id}>
                      <td className="py-2 text-white/40">{a.id}</td>
                      <td className="py-2 font-mono">{a.tool_name}</td>
                      <td className="py-2 text-white/60">{a.agent_name}</td>
                      <td className="py-2"><DecisionBadge value={a.status} /></td>
                      <td className="py-2 text-white/50">{a.decided_by ?? "—"}</td>
                      <td className="max-w-xs truncate py-2 text-white/40">
                        {a.execution_result ? String(a.execution_result.result ?? a.execution_result.status) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
