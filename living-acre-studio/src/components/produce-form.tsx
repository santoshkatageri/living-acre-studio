"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Sprout, Loader2 } from "lucide-react";

const SUGGESTIONS = [
  "Create today's morning farm episode. Walk to the goshala, feed Ganga, inspect the tomato crop and water the vegetable beds. Kannada narration.",
  "Evening at the farm — sunset courtyard, lamp light, quiet end to the day. Minimal narration.",
  "A sustainable living episode: compost corner, saved pond water, nothing wasted on the acre.",
];

export function ProduceForm() {
  const router = useRouter();
  const [instruction, setInstruction] = useState(SUGGESTIONS[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function produce() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/episodes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "planning failed");
      router.push(`/episodes/${json.episodeId}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div>
      <textarea
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        rows={3}
        className="w-full resize-none rounded-xl border hairline bg-ink/70 px-4 py-3 font-mono text-[12.5px] leading-relaxed text-straw outline-none placeholder:text-faint focus:border-amber/60"
        placeholder="Describe today's episode in plain language…"
      />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {SUGGESTIONS.map((s, i) => (
          <button
            key={i}
            onClick={() => setInstruction(s)}
            className="rounded-lg border hairline px-2.5 py-1.5 text-[11px] text-muted hover:border-amber/50 hover:text-cream"
          >
            {["Morning canon", "Evening", "Sustainability"][i]}
          </button>
        ))}
        <button
          onClick={produce}
          disabled={busy || instruction.trim().length < 12}
          className="btn-primary ml-auto inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13px]"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sprout className="h-4 w-4" />}
          {busy ? "Planning…" : "Plan today's episode"}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-ember">{error}</p>}
    </div>
  );
}
