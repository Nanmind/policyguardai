"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { Activity, Bot, CheckCircle2, Clock3, RefreshCw, Shield, Wrench, XCircle } from "lucide-react";
import { usePolling } from "@/lib/usePolling";
import AppShell from "@/components/AppShell";
import { DecisionBadge, EmptyState, ErrorBox, Panel, RiskBar, TrustMeter, formatTime } from "@/components/ui";
import { apiGet, type Agent, type SecurityEvent } from "@/lib/api";

type DashboardData = {
  agents: { total: number; active: number };
  tools: { total: number };
  events: { total: number; allowed: number; review: number; denied: number };
  approvals: { pending: number };
  users?: { flagged: number; suspended: number };
  quarantined_agents?: number;
  security: { average_risk: number; blocked_rate: number };
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [updated, setUpdated] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, a, e] = await Promise.all([
        apiGet<DashboardData>("/api/dashboard"),
        apiGet<Agent[]>("/api/agents"),
        apiGet<SecurityEvent[]>("/api/events?limit=8"),
      ]);
      setData(d);
      setAgents(a);
      setEvents(e);
      setError(null);
      setUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to reach the PolicyGuard API.");
    } finally {
      setLoading(false);
    }
  }, []);

  usePolling(load, 5000);

  const pct = (v: number) => `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%`;
  const v = (n: number | undefined) => (data ? String(n ?? 0) : "—");

  return (
    <AppShell
      title="PolicyGuard Dashboard"
      actions={
        <>
          {updated && <span className="hidden text-xs text-white/35 sm:block">Updated {updated.toLocaleTimeString()}</span>}
          <button
            onClick={load}
            className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white/70 hover:bg-white/[0.08]"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
        </>
      }
    >
      {error && <ErrorBox message={error} />}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric title="Active Agents" value={v(data?.agents.active)} sub={`${data?.agents.total ?? 0} registered`} icon={<Bot size={18} />} />
        <Metric title="Registered Tools" value={v(data?.tools.total)} sub="Policy-controlled" icon={<Wrench size={18} />} />
        <Metric title="Security Events" value={v(data?.events.total)} sub="Recorded in PostgreSQL" icon={<Activity size={18} />} />
        <Metric title="Average Risk" value={data ? pct(data.security.average_risk) : "—"} sub={`Blocked rate ${data ? pct(data.security.blocked_rate) : "—"}`} icon={<Shield size={18} />} />
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <Metric title="Allowed" value={v(data?.events.allowed)} sub="Executed automatically" icon={<CheckCircle2 size={18} className="text-emerald-400" />} />
        <Metric title="Review" value={v(data?.events.review)} sub={`${data?.approvals.pending ?? 0} pending approval`} icon={<Clock3 size={18} className="text-amber-400" />} />
        <Metric title="Denied" value={v(data?.events.denied)} sub={`${data?.users?.flagged ?? 0} flagged user(s) · ${data?.users?.suspended ?? 0} suspended`} icon={<XCircle size={18} className="text-red-400" />} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Panel title="Recent security decisions" subtitle="Latest tool requests evaluated by PolicyGuard" actions={<Link href="/audit" className="text-xs text-white/50 hover:text-white">View all →</Link>}>
          {events.length === 0 ? (
            <EmptyState message="No security events yet. Run a task in the Agent Console." />
          ) : (
            <div className="divide-y divide-white/5">
              {events.map((e) => (
                <div key={e.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <DecisionBadge value={e.decision} />
                      <span className="font-mono text-xs text-white/80">{e.tool_name}</span>
                      {e.tainted && <span className="text-[10px] text-amber-300/80">tainted</span>}
                    </div>
                    <div className="mt-1 truncate text-[11px] text-white/35">
                      {e.agent_name} · {formatTime(e.created_at)}
                    </div>
                  </div>
                  <RiskBar value={e.risk_score} />
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Agent trust" subtitle="Bayesian reputation with decay; policy uses the cautious score" actions={<Link href="/agents" className="text-xs text-white/50 hover:text-white">Agents →</Link>}>
          {agents.length === 0 ? (
            <EmptyState message="No agents seeded yet." />
          ) : (
            <div className="space-y-4">
              {agents.map((a) => (
                <div key={a.id}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-white/80">{a.name}</span>
                    {a.quarantined_until ? <span className="text-red-300">quarantined</span> : !a.is_active && <span className="text-red-300">inactive</span>}
                  </div>
                  <TrustMeter trust={a.trust} />
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </AppShell>
  );
}

function Metric({ title, value, sub, icon }: { title: string; value: string; sub: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0d121c] p-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs text-white/40">{title}</div>
          <div className="mt-3 text-3xl font-semibold tracking-tight">{value}</div>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/[0.04] p-2 text-white/50">{icon}</div>
      </div>
      <div className="mt-3 text-xs text-white/30">{sub}</div>
    </div>
  );
}
