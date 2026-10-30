import type { Decision } from "@/lib/api";

const DECISION_STYLES: Record<string, string> = {
  ALLOW: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  REVIEW: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  DENY: "border-red-400/30 bg-red-400/10 text-red-300",
  PENDING: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  APPROVED: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  REJECTED: "border-red-400/30 bg-red-400/10 text-red-300",
};

export function DecisionBadge({ value }: { value: Decision | string }) {
  const style = DECISION_STYLES[value] ?? "border-white/15 bg-white/5 text-white/60";
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-[11px] font-semibold ${style}`}>
      {value}
    </span>
  );
}

export function riskColor(risk: number) {
  if (risk >= 0.75) return "bg-red-400";
  if (risk >= 0.45) return "bg-amber-400";
  return "bg-emerald-400";
}

export function RiskBar({ value }: { value: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-white/10">
        <div className={`h-full rounded-full ${riskColor(value)}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-xs text-white/60">{value.toFixed(2)}</span>
    </div>
  );
}

const TIER_STYLES: Record<string, string> = {
  trusted: "bg-emerald-400/10 text-emerald-300 border-emerald-400/30",
  standard: "bg-sky-400/10 text-sky-300 border-sky-400/30",
  probation: "bg-amber-400/10 text-amber-300 border-amber-400/30",
  restricted: "bg-red-400/10 text-red-300 border-red-400/30",
};

export function TierBadge({ tier }: { tier: string }) {
  return (
    <span className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${TIER_STYLES[tier] ?? "border-white/10 text-white/50"}`}>
      {tier}
    </span>
  );
}

export function TrustMeter({ trust }: { trust: { mean: number; lower: number; evidence: number; tier: string } }) {
  const mean = Math.round(trust.mean * 100);
  const lower = Math.round(trust.lower * 100);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px] text-white/40">
        <span>Trust <TierBadge tier={trust.tier} /></span>
        <span className="font-mono text-white/70">
          {trust.lower.toFixed(2)} <span className="text-white/30">/ avg {trust.mean.toFixed(2)}</span>
        </span>
      </div>
      <div className="relative h-2 overflow-hidden rounded-full bg-white/10">
        <div className="absolute inset-y-0 left-0 rounded-full bg-white/15" style={{ width: `${mean}%` }} />
        <div
          className={`absolute inset-y-0 left-0 rounded-full ${trust.lower >= 0.75 ? "bg-emerald-400" : trust.lower >= 0.55 ? "bg-sky-400" : trust.lower >= 0.35 ? "bg-amber-400" : "bg-red-400"}`}
          style={{ width: `${lower}%` }}
        />
      </div>
      <div className="mt-1 text-[10px] text-white/30">
        Policy uses the cautious score; the gap shrinks as history ({trust.evidence.toFixed(1)} evidence) grows.
      </div>
    </div>
  );
}

export function TrustBar({ value }: { value: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  const color = value >= 0.75 ? "bg-emerald-400" : value >= 0.5 ? "bg-amber-400" : "bg-red-400";
  return (
    <div>
      <div className="mb-1 flex justify-between text-[11px] text-white/40">
        <span>Behavioral trust</span>
        <span className="font-mono text-white/70">{value.toFixed(3)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/10">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function Panel({
  title,
  subtitle,
  actions,
  children,
}: {
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-[#0d121c]">
      {title && (
        <div className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold">{title}</h2>
            {subtitle && <p className="mt-1 text-xs text-white/35">{subtitle}</p>}
          </div>
          {actions}
        </div>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function EmptyState({ message }: { message: string }) {
  return <div className="flex h-32 items-center justify-center text-sm text-white/35">{message}</div>;
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <div className="mb-4 rounded-xl border border-red-400/20 bg-red-400/5 px-4 py-3 text-xs text-red-300">
      {message}
    </div>
  );
}

export function ToolChip({ name }: { name: string }) {
  return (
    <span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 font-mono text-[11px] text-white/70">
      {name}
    </span>
  );
}

export function ReasonList({ reasons }: { reasons: string[] }) {
  if (!reasons.length) return null;
  return (
    <ul className="space-y-1">
      {reasons.map((r, i) => (
        <li key={i} className="flex gap-2 text-xs text-white/55">
          <span className="text-white/25">›</span>
          <span>{r}</span>
        </li>
      ))}
    </ul>
  );
}

export function FactorBreakdown({ factors }: { factors: Record<string, number> }) {
  const entries = Object.entries(factors);
  if (!entries.length) return null;
  return (
    <div className="space-y-1.5">
      {entries.map(([name, value]) => (
        <div key={name} className="flex items-center gap-3 text-[11px]">
          <span className="w-36 shrink-0 text-white/45">{name.replaceAll("_", " ")}</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
            <div className={`h-full rounded-full ${value < 0 ? "bg-emerald-400/70" : "bg-sky-400/70"}`} style={{ width: `${Math.min(100, Math.abs(value) * 200)}%` }} />
          </div>
          <span className="w-12 text-right font-mono text-white/60">{value >= 0 ? "+" : ""}{value.toFixed(3)}</span>
        </div>
      ))}
    </div>
  );
}

export function formatTime(value: string) {
  const d = new Date(value.endsWith("Z") ? value : `${value}Z`);
  return d.toLocaleString();
}
