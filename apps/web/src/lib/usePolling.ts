"use client";
import { useEffect } from "react";

/** Schedule asynchronous subscriptions after commit and avoid overlapping polls. */
export function usePolling(load: () => Promise<void>, intervalMs?: number) {
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try { await load(); }
      finally { if (active && intervalMs) timer = setTimeout(poll, intervalMs); }
    }
    timer = setTimeout(poll, 0);
    return () => { active = false; clearTimeout(timer); };
  }, [load, intervalMs]);
}
