"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";

export function RefreshAll({ episodeIds }: { episodeIds: string[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  return (
    <div className="flex items-center gap-3">
      {msg && <span className="font-mono text-[10.5px] text-muted">{msg}</span>}
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setMsg("");
          const out: string[] = [];
          for (const id of episodeIds) {
            const r = await fetch(`/api/episodes/${id}/refresh`, { method: "POST" });
            const j = await r.json().catch(() => null);
            if (j?.updates) out.push(...j.updates);
          }
          setMsg(out.join(" · ") || "no change");
          setBusy(false);
          router.refresh();
        }}
        className="btn-ghost inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[12.5px]"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        Poll Buffer confirmations
      </button>
    </div>
  );
}
