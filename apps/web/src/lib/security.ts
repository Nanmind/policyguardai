export type SecurityConfig = {
  version: string;
  review_threshold: number;
  deny_threshold: number;
  weights: Record<string, number>;
  tools: Record<string, { action: string; sensitivity: number }>;
  control: { paused: boolean; updated_by: string | null; updated_at: string };
  registry_sha256: string;
  model: string;
  email_mode: string;
};

export const fieldClass = "w-full rounded-lg border border-white/15 bg-[#111827] px-3 py-2 text-sm text-white outline-none focus:border-sky-400";
export const buttonClass = "rounded-lg border border-sky-400/30 bg-sky-400/10 px-4 py-2 text-sm text-sky-200 hover:bg-sky-400/20 disabled:opacity-40";
export function errorText(error: unknown) { return error instanceof Error ? error.message : "Request failed"; }
