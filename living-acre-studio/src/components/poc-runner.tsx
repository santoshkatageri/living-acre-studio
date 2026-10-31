"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCircle2, Loader2, Mic2, Play } from "lucide-react";
import { Badge } from "./ui";

export interface PocTakeRow {
  id: number;
  kind: string;
  path: string;
  voiceId: string;
  provider: string;
  durationS: number;
  degraded: boolean;
}

const KIND_LABEL: Record<string, string> = {
  narration_a: "Narration take A",
  narration_b: "Narration take B",
  ambience: "Ambience only",
  mixed_preview: "Mixed preview",
};

export function PocRunner({
  takes,
  approvals,
}: {
  takes: PocTakeRow[];
  approvals: Record<string, { voiceId: string }>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  void approvals;

  async function run() {
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch("/api/audio/poc", {
        method: "POST",
        headers: { "x-studio-confirm": "manual-approval" },
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setMsg(j.reason ?? "");
      router.refresh();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4">
      <button onClick={run} disabled={busy} className="btn-primary inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13px]">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic2 className="h-4 w-4" />}
        {takes.length ? "Re-run POC takes" : "Generate POC narration takes"}
      </button>
      {msg && <p className="mt-2 font-mono text-[10.5px] text-muted">{msg}</p>}

      {takes.length > 0 && (
        <div className="mt-4 space-y-2.5">
          {takes.map((t) => (
            <div key={t.id} className="rounded-xl border hairline bg-ink/50 p-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[12.5px] font-bold text-cream">{KIND_LABEL[t.kind] ?? t.kind}</span>
                {t.voiceId && <span className="font-mono text-[10px] text-amber">{t.voiceId}</span>}
                <span className="font-mono text-[10px] text-faint">{t.provider} · {t.durationS}s</span>
                {t.degraded && <Badge tone="warn">mock voice</Badge>}
                {t.kind.startsWith("narration") && (
                  <span className="ml-auto inline-flex items-center gap-1 font-mono text-[9.5px] text-faint">
                    <Play className="h-3 w-3" /> press play, then A/B
                  </span>
                )}
              </div>
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <audio controls preload="none" src={t.path} className="mt-2.5 h-8 w-full" />
            </div>
          ))}
          <p className="border-l-2 border-amber/40 pl-3 text-[11px] leading-relaxed text-muted">
            Evaluate naturalness, Kannada pronunciation and consistency. Approving a voice marks the profile as the
            recurring narrator — approval is a human decision and is recorded in studio config.
          </p>
        </div>
      )}
    </div>
  );
}

export function ApprovalStamp({ approved }: { approved: boolean }) {
  return approved ? (
    <span className="inline-flex items-center gap-1 font-mono text-[10px] text-leaf">
      <CheckCircle2 className="h-3.5 w-3.5" /> voice approved
    </span>
  ) : null;
}
