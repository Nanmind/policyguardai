"use client";

import { useCallback, useState } from "react";
import { usePolling } from "@/lib/usePolling";
import AppShell, { useUser } from "@/components/AppShell";
import TrustHistory from "@/components/TrustHistory";
import { ErrorBox, ToolChip, TrustMeter } from "@/components/ui";
import { apiGet, apiSend, type Agent } from "@/lib/api";

export default function AgentsPage() {
  return (
    <AppShell title="Agents" eyebrow="Identities, privileges & behavioral trust">
      <AgentsContent />
    </AppShell>
  );
}

function AgentsContent() {
  const user = useUser();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [historyFor, setHistoryFor] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      setAgents(await apiGet<Agent[]>("/api/agents"));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load agents.");
    }
  }, []);

  usePolling(load, 8000);

  async function update(id: number, body: Record<string, boolean>) {
    try {
      await apiSend(`/api/agents/${id}`, "PATCH", body);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed.");
    }
  }

  const isAdmin = user?.role === "admin";
  const btn = "rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/70 hover:bg-white/[0.06]";

  return (
    <>
      {error && <ErrorBox message={error} />}
      <p className="mb-6 max-w-4xl text-sm text-white/45">
        Trust is a Bayesian reputation: safe actions add positive evidence (more for riskier work), violations add heavy negative
        evidence, and old evidence fades (good behaviour after 14 days, bad after 45). The policy uses the <b>cautious score</b>, so a
        new agent must build a track record. Repeated violations within minutes trigger an automatic quarantine.
      </p>
      <div className="grid gap-5 xl:grid-cols-3">
        {agents.map((a) => (
          <div key={a.id} className="flex flex-col rounded-2xl border border-white/10 bg-[#0d121c] p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-semibold">{a.name}</div>
                <div className="text-xs text-white/40">{a.role}</div>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-[11px] ${a.quarantined_until ? "bg-red-400/15 text-red-300" : a.is_active ? "bg-emerald-400/10 text-emerald-300" : "bg-white/10 text-white/50"}`}>
                {a.quarantined_until ? "quarantined" : a.is_active ? "active" : "inactive"}
              </span>
            </div>
            {a.quarantined_until && (
              <div className="mt-2 text-[11px] text-red-300">Quarantined until {new Date(a.quarantined_until + "Z").toLocaleTimeString()}</div>
            )}
            <p className="mt-3 text-xs leading-relaxed text-white/50">{a.description}</p>
            <div className="mt-4"><TrustMeter trust={a.trust} /></div>
            <div className="mt-2 flex gap-4 font-mono text-[11px] text-white/40">
              <span className="text-emerald-300/80">+{a.trust.positive.toFixed(2)} good</span>
              <span className="text-red-300/80">-{a.trust.negative.toFixed(2)} bad</span>
            </div>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {a.allowed_tools.map((t) => <ToolChip key={t} name={t} />)}
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              {(["ALLOW", "REVIEW", "DENY"] as const).map((d) => (
                <div key={d} className="rounded-lg border border-white/10 bg-white/[0.02] py-2">
                  <div className={`text-lg font-semibold ${d === "ALLOW" ? "text-emerald-300" : d === "REVIEW" ? "text-amber-300" : "text-red-300"}`}>{a.decisions[d]}</div>
                  <div className="text-[10px] text-white/35">{d.toLowerCase()}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2 border-t border-white/10 pt-4">
              <button onClick={() => setHistoryFor(historyFor === a.id ? null : a.id)} className={btn}>
                {historyFor === a.id ? "Hide" : "Trust"} history
              </button>
              {isAdmin && (
                <>
                  <button onClick={() => update(a.id, { is_active: !a.is_active })} className={btn}>{a.is_active ? "Deactivate" : "Activate"}</button>
                  <button onClick={() => update(a.id, { reset_trust: true })} className={btn}>Reset trust</button>
                  {a.quarantined_until && <button onClick={() => update(a.id, { release_quarantine: true })} className={btn}>Release quarantine</button>}
                </>
              )}
            </div>
            {historyFor === a.id && <div className="mt-4"><TrustHistory kind="agent" id={a.id} /></div>}
          </div>
        ))}
      </div>
    </>
  );
}
