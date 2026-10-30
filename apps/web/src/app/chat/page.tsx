"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Download, FileText, Paperclip, Plus, Send, ShieldCheck, Trash2, X } from "lucide-react";
import { usePolling } from "@/lib/usePolling";
import AppShell, { useUser } from "@/components/AppShell";
import { DecisionBadge, FactorBreakdown, ReasonList, RiskBar } from "@/components/ui";
import {
  apiDelete,
  apiGet,
  apiSend,
  apiUpload,
  downloadFile,
  type Attachment,
  type ChatMessage,
  type FileInfo,
  type TraceStep,
} from "@/lib/api";

type Conversation = { id: string; title: string; updated_at: string };
type ApprovalStatus = { id: number; status: string; tool_name: string; reasons: string[]; arguments: Record<string, unknown>; risk_score: number };

const SUGGESTIONS = [
  "Summarise report.txt into 5 key points and give me a Word document",
  "Create a summary of the weather forecast for Mumbai for the next 7 days as a document",
  "Check the weather in Delhi, summarise it into a text file and email it to me",
  "Which customers have open high-priority tickets?",
  "Read vendor_invoice.txt and process it as instructed in the file",
];

export default function ChatPage() {
  return (
    <AppShell title="Chat" eyebrow="Talk to PolicyGuard-protected agents" bare>
      <ChatContent />
    </AppShell>
  );
}

function ChatContent() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState<Attachment[]>([]);
  const [busy, setBusy] = useState<"" | "uploading" | "thinking">("");
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadConversations = useCallback(async () => {
    try {
      setConversations(await apiGet<Conversation[]>("/api/chat/conversations"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load chats.");
    }
  }, []);

  const openConversation = useCallback(async (id: string) => {
    setActiveId(id);
    setPending([]);
    setError(null);
    try {
      const data = await apiGet<{ messages: ChatMessage[] }>(`/api/chat/conversations/${id}`);
      setMessages(data.messages);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open chat.");
    }
  }, []);

  usePolling(loadConversations);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  async function ensureConversation(): Promise<string> {
    if (activeId) return activeId;
    const conv = await apiSend<Conversation>("/api/chat/conversations", "POST", {});
    setActiveId(conv.id);
    setConversations((c) => [conv, ...c]);
    return conv.id;
  }

  async function deleteChat(id: string) {
    if (!window.confirm("Delete this chat? It disappears for you, but security logs are kept for audit.")) return;
    try {
      await apiDelete(`/api/chat/conversations/${id}`);
      setConversations((c) => c.filter((x) => x.id !== id));
      if (id === activeId) newChat();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
    }
  }

  function newChat() {
    setActiveId(null);
    setMessages([]);
    setPending([]);
    setError(null);
  }

  async function onFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    setBusy("uploading");
    setError(null);
    try {
      const id = await ensureConversation();
      const saved = await apiUpload<Attachment[]>(`/api/chat/conversations/${id}/upload`, Array.from(list));
      setPending((p) => [...p, ...saved]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy("");
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if ((!content && pending.length === 0) || busy) return;
    setBusy("thinking");
    setError(null);
    const attachments = pending;
    const optimistic: ChatMessage = {
      id: -Date.now(), role: "user", content, agent_id: null, run_id: null, attachments, meta: {},
      created_at: new Date().toISOString(),
    };
    setMessages((m) => [...m, optimistic]);
    setInput("");
    setPending([]);
    try {
      const id = await ensureConversation();
      const res = await apiSend<{ user_message: ChatMessage; replies: ChatMessage[] }>(
        `/api/chat/conversations/${id}/messages`, "POST",
        { content, attachments: attachments.map((a) => a.path) },
      );
      setMessages((m) => [...m.filter((x) => x.id !== optimistic.id), res.user_message, ...res.replies]);
      loadConversations();
    } catch (err) {
      setMessages((m) => m.filter((x) => x.id !== optimistic.id));
      setInput(content);
      setPending(attachments);
      setError(err instanceof Error ? err.message : "Message failed.");
    } finally {
      setBusy("");
    }
  }

  async function resume(approvalId: number) {
    if (!activeId) return;
    setBusy("thinking");
    setError(null);
    try {
      const res = await apiSend<{ replies: ChatMessage[] }>(`/api/chat/conversations/${activeId}/resume`, "POST", { approval_id: approvalId });
      setMessages((m) => [...m, ...res.replies]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not continue.");
    } finally {
      setBusy("");
    }
  }

  const resumed = new Set(messages.map((m) => m.meta?.resumed_approval_id).filter(Boolean) as number[]);

  return (
    <div className="flex h-full min-h-0">
      {/* conversation list */}
      <div className="hidden w-64 shrink-0 flex-col border-r border-white/10 md:flex">
        <div className="p-3">
          <button onClick={newChat} className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/15 py-2 text-sm hover:bg-white/[0.06]">
            <Plus size={15} /> New chat
          </button>
        </div>
        <div className="flex-1 space-y-1 overflow-y-auto px-3 pb-3">
          {conversations.map((c) => (
            <div
              key={c.id}
              className={`group flex items-center rounded-lg transition ${c.id === activeId ? "bg-white/[0.08] text-white" : "text-white/55 hover:bg-white/[0.04]"}`}
            >
              <button onClick={() => openConversation(c.id)} className="min-w-0 flex-1 truncate px-3 py-2 text-left text-xs">
                {c.title}
              </button>
              <button
                onClick={() => deleteChat(c.id)}
                title="Delete chat"
                className="mr-1 rounded p-1.5 text-white/30 opacity-0 transition hover:bg-red-400/10 hover:text-red-300 group-hover:opacity-100"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
          {conversations.length === 0 && <div className="px-2 text-xs text-white/30">No chats yet.</div>}
        </div>
      </div>

      {/* chat area */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex-1 overflow-y-auto px-4 py-6 lg:px-10">
          <div className="mx-auto max-w-3xl space-y-6">
            {messages.length === 0 && !busy && (
              <div className="pt-10 text-center">
                <ShieldCheck className="mx-auto text-white/30" size={36} />
                <h2 className="mt-4 text-lg font-semibold">What can I help with?</h2>
                <p className="mx-auto mt-2 max-w-md text-sm text-white/45">
                  Ask anything or attach files. I&apos;ll pick the right agent, and every action it takes is checked by PolicyGuard first.
                </p>
                <div className="mx-auto mt-6 grid max-w-2xl gap-2 sm:grid-cols-2">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} onClick={() => send(s)} className="rounded-xl border border-white/10 px-4 py-3 text-left text-xs text-white/65 hover:bg-white/[0.04]">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m) =>
              m.role === "user" ? (
                <UserBubble key={m.id} message={m} />
              ) : (
                <AssistantBubble key={m.id} message={m} onResume={resume} alreadyResumed={resumed} busy={!!busy} />
              ),
            )}

            {busy === "thinking" && (
              <div className="flex items-center gap-3 text-sm text-white/45">
                <span className="h-2 w-2 animate-pulse rounded-full bg-sky-400" />
                Routing to the best agent. PolicyGuard is checking each action… (local model, may take a minute)
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        {/* composer */}
        <div className="border-t border-white/10 px-4 py-4 lg:px-10">
          <div className="mx-auto max-w-3xl">
            {error && <div className="mb-2 rounded-lg border border-red-400/20 bg-red-400/5 px-3 py-2 text-xs text-red-300">{error}</div>}
            {pending.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {pending.map((a) => (
                  <AttachmentChip key={a.path} a={a} onRemove={() => setPending((p) => p.filter((x) => x.path !== a.path))} />
                ))}
              </div>
            )}
            <div className="flex items-end gap-2 rounded-2xl border border-white/15 bg-black/30 p-2 focus-within:border-white/30">
              <input ref={fileRef} type="file" multiple hidden accept=".txt,.md,.csv,.json,.pdf,.docx,.xlsx,.log" onChange={(e) => onFiles(e.target.files)} />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={!!busy}
                title="Attach files"
                className="rounded-lg p-2 text-white/50 hover:bg-white/[0.06] hover:text-white disabled:opacity-40"
              >
                <Paperclip size={18} />
              </button>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                rows={1}
                placeholder={busy === "uploading" ? "Uploading…" : "Message PolicyGuard agents…  (Enter to send, Shift+Enter for new line)"}
                className="max-h-40 min-h-[40px] flex-1 resize-none bg-transparent px-1 py-2 text-sm outline-none"
              />
              <button
                onClick={() => send()}
                disabled={!!busy || (!input.trim() && pending.length === 0)}
                className="rounded-lg bg-white p-2 text-black hover:bg-white/90 disabled:opacity-30"
              >
                <Send size={18} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AttachmentChip({ a, onRemove }: { a: Attachment; onRemove?: () => void }) {
  const flagged = (a.scan?.findings ?? []).some((f) => f.severity === "high" || f.severity === "critical");
  return (
    <div className={`flex items-center gap-2 rounded-lg border px-2 py-1 text-xs ${flagged ? "border-amber-400/40 bg-amber-400/5" : "border-white/10 bg-white/[0.03]"}`}>
      <FileText size={13} className="text-white/50" />
      <span className="max-w-[180px] truncate">{a.name}</span>
      {flagged && <span className="text-[10px] text-amber-300" title={a.scan?.findings.map((f) => f.finding).join("; ")}>suspicious content</span>}
      {onRemove && (
        <button onClick={onRemove} className="text-white/40 hover:text-white">
          <X size={12} />
        </button>
      )}
    </div>
  );
}

function UserBubble({ message }: { message: ChatMessage }) {
  const scan = message.meta?.request_scan;
  return (
    <div className="flex flex-col items-end gap-1.5">
      {message.attachments.length > 0 && (
        <div className="flex flex-wrap justify-end gap-2">
          {message.attachments.map((a) => <AttachmentChip key={a.path} a={a} />)}
        </div>
      )}
      {message.content && (
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-white/[0.09] px-4 py-2.5 text-sm">{message.content}</div>
      )}
      {scan && scan.score >= 0.4 && (
        <div className="text-[10px] text-amber-300/80">⚠ Request flagged: {scan.findings.map((f) => f.finding).join("; ")}</div>
      )}
    </div>
  );
}

function FileList({ files }: { files: FileInfo[] }) {
  if (!files.length) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {files.map((f) => (
        <button
          key={f.path}
          onClick={() => downloadFile(f.path, f.name)}
          className="flex items-center gap-2 rounded-lg border border-emerald-400/30 bg-emerald-400/5 px-3 py-1.5 text-xs text-emerald-200 hover:bg-emerald-400/10"
        >
          <Download size={13} /> {f.name} <span className="text-white/35">{(f.size / 1024).toFixed(1)} KB</span>
        </button>
      ))}
    </div>
  );
}

function AssistantBubble({
  message, onResume, alreadyResumed, busy,
}: { message: ChatMessage; onResume: (id: number) => void; alreadyResumed: Set<number>; busy: boolean }) {
  const [open, setOpen] = useState(false);
  const meta = message.meta ?? {};
  const trace = meta.trace ?? [];
  const files = [...(meta.approved_files ?? []), ...(meta.files_created ?? [])];
  const counts = { ALLOW: 0, REVIEW: 0, DENY: 0 } as Record<string, number>;
  trace.forEach((t) => (counts[t.decision] = (counts[t.decision] ?? 0) + 1));

  return (
    <div className="flex gap-3">
      <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-black">
        <ShieldCheck size={15} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px] text-white/40">
          <span className="font-medium text-white/70">{meta.agent_name ?? "PolicyGuard"}</span>
          {meta.routing && meta.routing.method !== "resume" && <span>· routed by {meta.routing.method}</span>}
          {meta.routing?.method === "resume" && <span>· continued after review</span>}
          {meta.routing?.method === "handoff" && <span>· {meta.routing.reason.toLowerCase()}</span>}
          {meta.trust && (
            <span className="font-mono">
              · agent trust {meta.trust.agent_before.lower.toFixed(2)} → {meta.trust.agent_after.lower.toFixed(2)}
            </span>
          )}
        </div>

        <div className="whitespace-pre-wrap text-sm leading-relaxed text-white/85">{message.content || "(no text)"}</div>
        {meta.type === "final" && trace.length === 0 && (
          <div className="mt-2 text-[11px] text-white/35">ⓘ Answered from model knowledge. No tools used, so no live data was checked.</div>
        )}
        {trace.some((t) => t.tool_status === "error") && (
          <div className="mt-2 rounded-lg border border-red-400/20 bg-red-400/5 px-2.5 py-1.5 text-[11px] text-red-300">
            ⚠ A tool failed during this reply: {trace.filter((t) => t.tool_status === "error").map((t) => t.tool).join(", ")}. Check the security checks below. Any figures in the answer may not come from live data.
          </div>
        )}
        <FileList files={files} />
        {meta.type === "handoff" && meta.handoff_to && (
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-sky-400/25 bg-sky-400/5 px-2.5 py-1 text-[11px] text-sky-300">
            <ArrowRight size={12} /> Handed off to {meta.handoff_to}
          </div>
        )}

        {meta.type === "approval_required" && meta.approval_id && (
          <ApprovalCard approvalId={meta.approval_id} onResume={onResume} resumed={alreadyResumed.has(meta.approval_id)} busy={busy} />
        )}

        {trace.length > 0 && (
          <div className="mt-3">
            <button onClick={() => setOpen(!open)} className="flex items-center gap-2 text-[11px] text-white/45 hover:text-white">
              <ShieldCheck size={12} /> {trace.length} security check{trace.length > 1 ? "s" : ""}:
              {counts.ALLOW > 0 && <span className="text-emerald-300">{counts.ALLOW} allowed</span>}
              {counts.REVIEW > 0 && <span className="text-amber-300">{counts.REVIEW} review</span>}
              {counts.DENY > 0 && <span className="text-red-300">{counts.DENY} denied</span>}
              <span>{open ? "▲" : "▼"}</span>
            </button>
            {open && <TraceList trace={trace} />}
          </div>
        )}
      </div>
    </div>
  );
}

function TraceList({ trace }: { trace: TraceStep[] }) {
  return (
    <ol className="mt-2 space-y-2">
      {trace.map((t, i) => (
        <li key={i} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <DecisionBadge value={t.decision} />
              <span className="font-mono text-xs">{t.tool}</span>
              {t.tainted && <span className="rounded bg-amber-400/10 px-1.5 text-[10px] text-amber-300">tainted</span>}
              {t.rule && t.rule !== "risk_threshold" && <span className="rounded bg-white/5 px-1.5 font-mono text-[10px] text-white/50">{t.rule}</span>}
            </div>
            <RiskBar value={t.risk_score} />
          </div>
          <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-black/40 p-2 font-mono text-[11px] text-white/55">{JSON.stringify(t.arguments, null, 2)}</pre>
          <div className="mt-2 grid gap-3 md:grid-cols-2">
            <ReasonList reasons={t.reasons} />
            <FactorBreakdown factors={t.factors} />
          </div>
          {t.tool_summary && t.decision === "ALLOW" && (
            <div className={`mt-2 truncate text-[11px] ${t.tool_status === "error" ? "text-red-300" : "text-white/35"}`}>
              {t.tool_status === "error" ? "✗ tool error: " : "→ "}{t.tool_summary}
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}

function ApprovalCard({ approvalId, onResume, resumed, busy }: { approvalId: number; onResume: (id: number) => void; resumed: boolean; busy: boolean }) {
  const user = useUser();
  const canDecide = user?.role === "admin" || user?.role === "approver";
  const [status, setStatus] = useState<ApprovalStatus | null>(null);
  const [working, setWorking] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setStatus(await apiGet<ApprovalStatus>(`/api/approvals/${approvalId}`));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load approval.");
    }
  }, [approvalId]);

  usePolling(load);

  useEffect(() => {
    if (!status || status.status !== "PENDING") return;
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [status, load]);

  async function decide(decision: "APPROVE" | "REJECT") {
    setWorking(true);
    setErr(null);
    try {
      await apiSend(`/api/approvals/${approvalId}/decision`, "POST", { decision });
      await load();
      onResume(approvalId);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Decision failed.");
    } finally {
      setWorking(false);
    }
  }

  if (!status) return null;
  return (
    <div className="mt-3 rounded-xl border border-amber-400/25 bg-amber-400/[0.04] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs">
          <DecisionBadge value={status.status} />
          <span className="font-mono">{status.tool_name}</span>
          <span className="text-white/35">approval #{status.id}</span>
        </div>
        <RiskBar value={status.risk_score} />
      </div>
      <pre className="mt-2 max-h-32 overflow-auto rounded-lg bg-black/40 p-2 font-mono text-[11px] text-white/55">{JSON.stringify(status.arguments, null, 2)}</pre>
      <div className="mt-2"><ReasonList reasons={status.reasons.slice(0, 5)} /></div>
      {err && <div className="mt-2 text-[11px] text-red-300">{err}</div>}
      {status.status === "PENDING" ? (
        canDecide ? (
          <div className="mt-3 flex gap-2">
            <button disabled={working || busy} onClick={() => decide("APPROVE")} className="rounded-lg bg-emerald-500/90 px-3 py-1.5 text-xs font-medium text-black hover:bg-emerald-400 disabled:opacity-50">
              Approve & continue
            </button>
            <button disabled={working || busy} onClick={() => decide("REJECT")} className="rounded-lg border border-red-400/40 px-3 py-1.5 text-xs text-red-300 hover:bg-red-400/10 disabled:opacity-50">
              Reject
            </button>
          </div>
        ) : (
          <div className="mt-3 text-[11px] text-white/45">Waiting for an approver. This updates automatically.</div>
        )
      ) : (
        !resumed && (
          <button disabled={busy} onClick={() => onResume(approvalId)} className="mt-3 rounded-lg border border-white/15 px-3 py-1.5 text-xs hover:bg-white/[0.06] disabled:opacity-50">
            Continue the task
          </button>
        )
      )}
    </div>
  );
}
