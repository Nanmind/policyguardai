"use client";

import { createContext, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  Bot,
  Clock3,
  FolderOpen,
  LogOut,
  MessageSquare,
  Search,
  Send,
  Shield,
  Users,
  Wrench,
} from "lucide-react";
import { authFetch, clearSession, getToken, type CurrentUser } from "@/lib/auth";
import { API_URL } from "@/lib/api";

const UserContext = createContext<CurrentUser | null>(null);

export function useUser() {
  return useContext(UserContext);
}

type NavEntry = {
  label: string;
  href?: string;
  icon: React.ReactNode;
  roles?: string[];
};

const NAV: NavEntry[] = [
  { label: "Chat", href: "/chat", icon: <MessageSquare size={17} /> },
  { label: "Dashboard", href: "/", icon: <Activity size={17} /> },
  { label: "Agents", href: "/agents", icon: <Bot size={17} /> },
  { label: "Agent Console", href: "/console", icon: <Send size={17} />, roles: ["admin", "analyst"] },
  { label: "Live Trace", href: "/trace", icon: <Activity size={17} /> },
  { label: "Approvals", href: "/approvals", icon: <Clock3 size={17} />, roles: ["admin", "approver", "analyst"] },
  { label: "Audit Explorer", href: "/audit", icon: <Search size={17} /> },
  { label: "My Files", href: "/files", icon: <FolderOpen size={17} /> },
  { label: "Tool Registry", href: "/tools", icon: <Wrench size={17} /> },
  { label: "Threat Center", href: "/threat-center", icon: <AlertTriangle size={17} /> },
  { label: "Attack Lab", href: "/attack-lab", icon: <Activity size={17} />, roles: ["admin", "analyst"] },
  { label: "Policy Studio", href: "/policy-studio", icon: <Shield size={17} />, roles: ["admin", "analyst"] },
  { label: "Users", href: "/users", icon: <Users size={17} />, roles: ["admin"] },
];


export default function AppShell({
  title,
  eyebrow = "Security Operations",
  actions,
  requiredRoles,
  bare = false,
  children,
}: {
  title: string;
  eyebrow?: string;
  actions?: React.ReactNode;
  requiredRoles?: string[];
  bare?: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [status, setStatus] = useState<"checking" | "ok" | "denied">("checking");

  useEffect(() => {
    let cancelled = false;

    async function verify() {
      if (!getToken()) {
        router.replace("/login");
        return;
      }
      try {
        const response = await authFetch(`${API_URL}/api/auth/me`);
        if (!response.ok) throw new Error("invalid session");
        const me: CurrentUser = await response.json();
        if (cancelled) return;
        setUser(me);
        setStatus("ok");
      } catch {
        clearSession();
        router.replace("/login");
      }
    }

    verify();
    return () => {
      cancelled = true;
    };
  }, [router]);

  function signOut() {
    clearSession();
    router.push("/login");
  }

  if (status !== "ok" || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#080b12] text-sm text-white/40">
        Checking authentication...
      </main>
    );
  }

  const allowed = !requiredRoles || requiredRoles.includes(user.role);

  return (
    <UserContext.Provider value={user}>
      <main className="min-h-screen bg-[#080b12] text-white">
        <div className="flex min-h-screen">
          <aside className="hidden w-64 shrink-0 border-r border-white/10 bg-[#0b0f18] lg:flex lg:flex-col">
            <div className="flex h-20 items-center gap-3 border-b border-white/10 px-6">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-black">
                <Shield size={19} />
              </div>
              <div>
                <div className="text-sm font-semibold tracking-wide">PolicyGuard</div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-white/40">Security Control Plane</div>
              </div>
            </div>

            <nav className="flex-1 space-y-1 p-4">
              {NAV.filter((n) => !n.roles || n.roles.includes(user.role)).map((n) => {
                const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href ?? "#");
                return (
                  <Link
                    key={n.label}
                    href={n.href ?? "#"}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${
                      active ? "bg-white/[0.08] text-white" : "text-white/55 hover:bg-white/[0.04] hover:text-white"
                    }`}
                  >
                    {n.icon}
                    <span>{n.label}</span>
                  </Link>
                );
              })}


            </nav>

            <div className="border-t border-white/10 p-4">
              <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <div className="min-w-0">
                  <div className="truncate text-xs font-medium text-white/80">{user.email}</div>
                  <div className="text-[11px] uppercase tracking-wider text-white/40">{user.role}</div>
                </div>
                <button
                  onClick={signOut}
                  title="Sign out"
                  className="ml-2 shrink-0 rounded-lg border border-white/10 bg-white/[0.04] p-2 text-white/60 transition hover:bg-white/[0.08] hover:text-white"
                >
                  <LogOut size={15} />
                </button>
              </div>
            </div>
          </aside>

          <section className={`flex min-w-0 flex-1 flex-col ${bare ? "h-screen" : ""}`}>
            <header className="flex min-h-20 items-center justify-between gap-4 border-b border-white/10 px-6 lg:px-8">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-white/40">{eyebrow}</div>
                <h1 className="mt-1 text-xl font-semibold">{title}</h1>
              </div>
              <div className="flex items-center gap-3">{actions}</div>
            </header>

            <div className={bare ? "min-h-0 flex-1" : "flex-1 p-6 lg:p-8"}>
              {allowed ? (
                children
              ) : (
                <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-6 text-sm text-amber-200">
                  Your role (<b>{user.role}</b>) cannot access this page. Required: {requiredRoles?.join(", ")}.
                  Ask an admin to change your role on the Users page.
                </div>
              )}
            </div>
          </section>
        </div>
      </main>
    </UserContext.Provider>
  );
}
