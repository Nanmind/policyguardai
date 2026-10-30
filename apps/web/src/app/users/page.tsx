"use client";

import { Fragment, useCallback, useState } from "react";
import { usePolling } from "@/lib/usePolling";
import AppShell, { useUser } from "@/components/AppShell";
import TrustHistory from "@/components/TrustHistory";
import { ErrorBox, Panel, TierBadge, formatTime } from "@/components/ui";
import { apiGet, apiSend, type TrustView } from "@/lib/api";

type UserRow = {
  id: number; email: string; role: string; is_active: boolean; created_at: string;
  trust: TrustView; flagged: boolean; suspended_until: string | null; suspension_reason: string | null;
};

const ROLES = ["admin", "analyst", "approver", "viewer"];

export default function UsersPage() {
  return (
    <AppShell title="Users" eyebrow="Human access control & user trust" requiredRoles={["admin"]}>
      <UsersContent />
    </AppShell>
  );
}

function UsersContent() {
  const me = useUser();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      setUsers(await apiGet<UserRow[]>("/api/users"));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load users.");
    }
  }, []);

  usePolling(load, 8000);

  async function act(path: string, method: "POST" | "PATCH", body: unknown = {}) {
    try {
      await apiSend(path, method, body);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.");
    }
  }

  function suspend(u: UserRow) {
    const minutes = Number(window.prompt(`Suspend ${u.email} for how many minutes?`, "60"));
    if (!minutes) return;
    const reason = window.prompt("Reason (shown to the user):", "Suspended pending security review") || "Suspended by administrator";
    act(`/api/users/${u.id}/suspend`, "POST", { minutes, reason });
  }

  const small = "rounded-md border border-white/10 px-2 py-1 text-[11px] text-white/70 hover:bg-white/[0.06] disabled:opacity-40";
  const flaggedCount = users.filter((u) => u.flagged).length;

  return (
    <>
      {error && <ErrorBox message={error} />}
      {flaggedCount > 0 && (
        <div className="mb-4 rounded-xl border border-amber-400/25 bg-amber-400/5 px-4 py-3 text-xs text-amber-200">
          {flaggedCount} user(s) flagged by PolicyGuard for risky behaviour. Review their trust history below.
        </div>
      )}
      <Panel title="Accounts" subtitle="admin: everything · analyst: console + view · approver: decide approvals · viewer: chat + read-only">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-white/35">
              <tr>
                <th className="pb-2 font-normal">User</th>
                <th className="pb-2 font-normal">Role</th>
                <th className="pb-2 font-normal">Trust</th>
                <th className="pb-2 font-normal">Status</th>
                <th className="pb-2 font-normal">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {users.map((u) => {
                const self = u.id === me?.id;
                return (
                  <Fragment key={u.id}>
                    <tr className="align-top">
                      <td className="py-3">
                        <div>{u.email} {self && <span className="text-[10px] text-white/35">(you)</span>}</div>
                        <div className="text-[10px] text-white/30">joined {formatTime(u.created_at)}</div>
                      </td>
                      <td className="py-3">
                        <select value={u.role} disabled={self} onChange={(e) => act(`/api/users/${u.id}`, "PATCH", { role: e.target.value })}
                          className="rounded-md border border-white/10 bg-black/40 px-2 py-1 outline-none disabled:opacity-50">
                          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </td>
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-mono">{u.trust.lower.toFixed(2)}</span>
                          <TierBadge tier={u.trust.tier} />
                          {u.flagged && <span className="rounded bg-amber-400/15 px-1.5 text-[10px] text-amber-300">flagged</span>}
                        </div>
                        <div className="mt-1 font-mono text-[10px] text-white/30">+{u.trust.positive.toFixed(2)} / -{u.trust.negative.toFixed(2)}</div>
                      </td>
                      <td className="py-3">
                        {!u.is_active ? (
                          <span className="text-red-300">disabled</span>
                        ) : u.suspended_until ? (
                          <div className="text-amber-300">
                            suspended until {new Date(u.suspended_until + "Z").toLocaleString()}
                            <div className="max-w-[220px] text-[10px] text-white/40">{u.suspension_reason}</div>
                          </div>
                        ) : (
                          <span className="text-emerald-300">active</span>
                        )}
                      </td>
                      <td className="py-3">
                        <div className="flex flex-wrap gap-1.5">
                          <button className={small} onClick={() => setOpen(open === u.id ? null : u.id)}>History</button>
                          {u.suspended_until ? (
                            <button className={small} disabled={self} onClick={() => act(`/api/users/${u.id}/unsuspend`, "POST")}>Lift suspension</button>
                          ) : (
                            <button className={small} disabled={self} onClick={() => suspend(u)}>Suspend…</button>
                          )}
                          <button className={small} disabled={self} onClick={() => act(`/api/users/${u.id}`, "PATCH", { is_active: !u.is_active })}>
                            {u.is_active ? "Disable" : "Enable"}
                          </button>
                          <button className={small} onClick={() => act(`/api/users/${u.id}/revoke-sessions`, "POST")}>Revoke sessions</button>
                          <button className={small} onClick={() => act(`/api/users/${u.id}/reset-trust`, "POST")}>Reset trust</button>
                        </div>
                      </td>
                    </tr>
                    {open === u.id && (
                      <tr>
                        <td colSpan={5} className="bg-white/[0.02] p-4"><TrustHistory kind="user" id={u.id} /></td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
