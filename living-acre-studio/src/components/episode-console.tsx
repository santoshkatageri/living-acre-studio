"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  Camera,
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  Clapperboard,
  Copy,
  Eye,
  Loader2,
  MonitorPlay,
  Play,
  RefreshCw,
  ScrollText,
  ShieldCheck,
  Timer,
  XCircle,
  Zap,
} from "lucide-react";
import type { Detail, StageRow } from "@/lib/studio/detail";
import { Badge, Card, ProgressBar } from "./ui";

const STAGE_LABELS: Record<string, string> = {
  specification: "Episode specification",
  narration_script: "Narration script (kn)",
  audio_design: "Audio design (buses & targets)",
  captions: "Captions & SRT",
  storyboard: "Storyboard / plate binding",
  metadata: "Platform metadata",
  voice_render: "Voice render (TTS segments)",
  render: "Render visual master (ffmpeg)",
  audio_mix: "Audio mix & mux (ffmpeg)",
  thumbnail: "Thumbnail",
  quality_control: "Quality control",
  approval_gate: "Human approval",
  publishing_package: "Publishing package",
  buffer_schedule: "Buffer scheduling",
  analytics_baseline: "Analytics baseline",
};

export function EpisodeConsole({ initial }: { initial: Detail }) {
  const [data, setData] = useState<Detail>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [autoRun, setAutoRun] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [note, setNote] = useState("");
  const [showLogs, setShowLogs] = useState(false);
  const [metaTab, setMetaTab] = useState<"youtube" | "instagram">("youtube");

  const id = data.episode.id;
  const running = data.stages.some((s) => s.status === "running");
  const anyActive = busy !== null || running || autoRun;

  const refresh = useCallback(async () => {
    const r = await fetch(`/api/episodes/${id}`, { cache: "no-store" });
    if (r.ok) setData((await r.json()) as Detail);
  }, [id]);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(refresh, 2000);
    return () => clearInterval(t);
  }, [running, refresh]);

  async function call(path: string, label: string): Promise<boolean> {
    setBusy(label);
    setNotice(null);
    try {
      const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: label === "approve" ? JSON.stringify({ note }) : undefined });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setNotice({ tone: "err", text: j.error ?? `HTTP ${r.status}` });
        await refresh();
        return false;
      }
      await refresh();
      return true;
    } catch (e) {
      setNotice({ tone: "err", text: (e as Error).message });
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function runStage(stage: string) {
    await call(`/api/episodes/${id}/stages/${stage}`, stage);
  }

  async function runAll() {
    setAutoRun(true);
    setNotice(null);
    for (const s of data.stages) {
      if (s.stage === "approval_gate") break; // human gate — never automated
      if (s.status === "complete") continue;
      const ok = await call(`/api/episodes/${id}/stages/${s.stage}`, s.stage);
      if (!ok) break;
    }
    setAutoRun(false);
  }

  async function approve() {
    const ok = await call(`/api/episodes/${id}/approve`, "approve");
    if (ok) setNotice({ tone: "ok", text: "Approved — packaged and scheduled through Buffer. Masters retained locally." });
  }

  const ep = data.episode;
  const master = data.media.find((m) => m.kind === "master_video");
  const thumb = data.media.find((m) => m.kind === "thumbnail");
  const srtKn = data.media.find((m) => m.path.includes("narration.kn"));
  const srtEn = data.media.find((m) => m.path.includes("captions.en"));
  const completeCount = data.stages.filter((s) => s.status === "complete").length;
  const canApprove = ep.status === "awaiting_approval";
  const showRefresh = data.publications.some((p) => ["scheduled", "sent"].includes(p.status));

  return (
    <div className="space-y-8">
      {/* Actions strip */}
      <div className="card-surface rise-in flex flex-wrap items-center gap-3 p-4">
        <Badge tone={ep.status} />
        <span className="font-mono text-[11px] text-faint">
          {completeCount}/{data.stages.length} stages · {ep.language} · {ep.durationSeconds}s target
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {showRefresh && (
            <button
              onClick={() => call(`/api/episodes/${id}/refresh`, "refresh")}
              disabled={anyActive}
              className="btn-ghost inline-flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-[12.5px]"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Buffer status
            </button>
          )}
          {!canApprove && !["scheduled", "published"].includes(ep.status) && (
            <button onClick={runAll} disabled={anyActive} className="btn-primary inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13px]">
              {anyActive ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              {autoRun ? "Running…" : "Run full pipeline"}
            </button>
          )}
          {canApprove && (
            <div className="flex items-center gap-2">
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="approval note (optional)"
                className="w-48 rounded-xl border hairline bg-ink/70 px-3 py-2.5 text-[12px] text-straw outline-none placeholder:text-faint focus:border-amber/60"
              />
              <button onClick={approve} disabled={anyActive} className="btn-primary inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13px]">
                {busy === "approve" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                Approve & schedule
              </button>
            </div>
          )}
        </div>
      </div>

      {notice && (
        <div className={`rise-in rounded-xl border px-4 py-3 text-[13px] ${notice.tone === "ok" ? "border-leaf/40 bg-leaf/10 text-leaf" : "border-ember/40 bg-ember/10 text-ember"}`}>
          {notice.text}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(300px,420px)_1fr]">
        {/* LEFT — media & content */}
        <div className="space-y-6">
          <Card className="rise-in">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold text-cream">Master</h3>
              <span className="font-mono text-[10.5px] text-faint">1080×1920 · H.264/AAC</span>
            </div>
            {master ? (
              <div className="video-frame relative mx-auto aspect-[9/16] max-h-[70vh] overflow-hidden rounded-xl">
                <video
                  src={`${master.path}?v=${master.checksum?.slice(0, 8)}`}
                  poster={thumb?.path}
                  controls
                  playsInline
                  preload="metadata"
                  className="h-full w-full object-contain"
                />
              </div>
            ) : (
              <PlateStack data={data} />
            )}
            {master && (
              <dl className="mt-4 grid grid-cols-2 gap-2 font-mono text-[11px] text-muted">
                <div className="rounded-lg border hairline bg-ink/50 px-3 py-2">{(master.bytes / 1048576).toFixed(1)} MB master</div>
                <div className="rounded-lg border hairline bg-ink/50 px-3 py-2">{master.durationSeconds?.toFixed(2)}s probed</div>
                <div className="col-span-2 truncate rounded-lg border hairline bg-ink/50 px-3 py-2" title={master.checksum ?? ""}>
                  sha256 · {master.checksum}
                </div>
              </dl>
            )}
            {(srtKn || srtEn) && (
              <div className="mt-3 flex flex-wrap gap-2 text-[11.5px]">
                {[srtKn, srtEn].filter(Boolean).map((s) => (
                  <a key={s!.path} href={s!.path} className="inline-flex items-center gap-1.5 rounded-lg border hairline px-2.5 py-1.5 text-straw hover:border-amber/50">
                    <ScrollText className="h-3.5 w-3.5" /> {s!.path.split("/").pop()}
                  </a>
                ))}
              </div>
            )}
          </Card>

          {/* Narration */}
          <Card className="rise-in">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold text-cream">Narration — ಕನ್ನಡ</h3>
              <Badge tone={ep.narration?.ttsStatus === "pending_voice" ? "warn" : "pass"}>
                {ep.narration?.ttsStatus?.replace(/_/g, " ") ?? "pending"}
              </Badge>
            </div>
            {ep.narration ? (
              <ol className="space-y-3">
                {ep.narration.lines.map((l, i) => (
                  <li key={i} className="rounded-xl border hairline bg-ink/40 p-3">
                    <div className="font-mono text-[10px] text-faint">
                      {l.startS.toFixed(1)}s – {l.endS.toFixed(1)}s · {l.sceneKey}
                    </div>
                    <p className="mt-1.5 text-[15px] leading-relaxed text-cream">{l.kn}</p>
                    <p className="mt-1 text-[12px] italic text-muted">{l.en}</p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-muted">Run the narration stage to author the Kannada voice track.</p>
            )}
            {ep.narration && (
              <p className="mt-4 border-l-2 border-sky/50 pl-3 text-[11.5px] leading-relaxed text-muted">
                Voice: {ep.narration.voiceProfile}. Provider from episode audio config; mock output is always labelled.
              </p>
            )}
          </Card>

          <AudioCard data={data} busy={busy} onRegen={async (sceneKey) => {
            setBusy(`regen:${sceneKey}`);
            setNotice(null);
            try {
              const r = await fetch(`/api/episodes/${id}/audio/regen`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sceneKey }),
              });
              const j = await r.json().catch(() => ({}));
              if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
              setNotice({ tone: "ok", text: `Segment "${sceneKey}" regenerated (${j.provider}). Re-run audio mix to hear it in the master.` });
            } catch (e) {
              setNotice({ tone: "err", text: (e as Error).message });
            } finally {
              await refresh();
              setBusy(null);
            }
          }} />
        </div>

        {/* RIGHT — pipeline */}
        <div className="space-y-6">
          <Card className="rise-in">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold text-cream">Pipeline</h3>
              <span className="font-mono text-[10.5px] text-faint">resumable · idempotent · logged</span>
            </div>
            <ol className="relative space-y-1.5">
              {data.stages.map((s) => (
                <StageItem key={s.id} stage={s} busy={busy} onRun={runStage} disabled={anyActive} />
              ))}
            </ol>
          </Card>

          {/* QC */}
          {data.qc && (
            <Card className="rise-in">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-display text-lg font-semibold text-cream">Quality control</h3>
                <Badge tone={data.qc.report.overall} />
              </div>
              <p className="mb-4 text-[12.5px] leading-relaxed text-muted">{data.qc.report.summary}</p>
              <ul className="space-y-1.5">
                {data.qc.checks.map((c) => (
                  <li key={c.id} className="flex items-start gap-3 rounded-lg border hairline bg-ink/40 px-3 py-2">
                    {c.status === "pass" && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-leaf" />}
                    {c.status === "warn" && <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber" />}
                    {c.status === "fail" && <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-ember" />}
                    {c.status === "manual" && <Eye className="mt-0.5 h-4 w-4 shrink-0 text-sky" />}
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-[12.5px] font-semibold text-cream">
                        {c.name}
                        <span className="font-mono text-[9px] uppercase tracking-widest text-faint">{c.category}{c.required ? "" : " · optional"}</span>
                      </div>
                      <div className="mt-0.5 text-[11.5px] leading-relaxed text-muted">{c.detail}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* Platform metadata */}
          {ep.platformMetadata && (
            <Card className="rise-in">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-display text-lg font-semibold text-cream">Platform packages</h3>
                <div className="flex gap-1">
                  {(["youtube", "instagram"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setMetaTab(t)}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11.5px] font-semibold ${metaTab === t ? "bg-raise text-amber" : "text-muted hover:text-cream"}`}
                    >
                      {t === "youtube" ? <MonitorPlay className="h-3.5 w-3.5" /> : <Camera className="h-3.5 w-3.5" />}
                      {t === "youtube" ? "Shorts" : "Reels"}
                    </button>
                  ))}
                </div>
              </div>
              <MetaCard meta={ep.platformMetadata[metaTab]} channel={metaTab} />
            </Card>
          )}

          {/* Publications */}
          {data.publications.length > 0 && (
            <Card className="rise-in">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-display text-lg font-semibold text-cream">Buffer queue</h3>
                <Badge tone={data.publications[0]?.mode ?? "mock"} />
              </div>
              <div className="space-y-3">
                {data.publications.map((p) => (
                  <div key={p.id} className="rounded-xl border hairline bg-ink/40 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      {p.channel === "youtube" ? <MonitorPlay className="h-4 w-4 text-ember" /> : <Camera className="h-4 w-4 text-amber" />}
                      <span className="text-[13px] font-bold capitalize text-cream">{p.channel}</span>
                      <Badge tone={p.status} />
                      {p.scheduledAt && (
                        <span className="ml-auto inline-flex items-center gap-1 font-mono text-[10.5px] text-muted">
                          <Timer className="h-3 w-3" />
                          {new Date(p.scheduledAt).toLocaleString("en-GB", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })} IST
                        </span>
                      )}
                    </div>
                    <div className="mt-2 grid gap-1 font-mono text-[10.5px] text-faint">
                      <div className="truncate">post: {p.bufferPostId ?? "—"}</div>
                      <div className="truncate">media: {p.mediaUrl ?? "—"}</div>
                      <div>attempts: {p.attempts} · idempotency-guarded</div>
                    </div>
                  </div>
                ))}
              </div>
              {["scheduled"].includes(ep.status) && (
                <p className="mt-3 text-[11.5px] leading-relaxed text-muted">
                  Status flips to <b className="text-leaf">published</b> only after Buffer confirms — never earlier.
                  Use “Buffer status” above to poll.
                </p>
              )}
            </Card>
          )}

          {/* Log */}
          <Card className="rise-in">
            <button onClick={() => setShowLogs((v) => !v)} className="flex w-full items-center justify-between">
              <h3 className="font-display flex items-center gap-2 text-lg font-semibold text-cream">
                <ScrollText className="h-4 w-4 text-faint" /> Production log
              </h3>
              <ChevronDown className={`h-4 w-4 text-faint transition-transform ${showLogs ? "rotate-180" : ""}`} />
            </button>
            {showLogs && (
              <div className="mt-3 max-h-72 space-y-1 overflow-y-auto rounded-xl border hairline bg-ink/60 p-3 font-mono text-[10.5px]">
                {data.logs.map((l) => (
                  <div key={l.id} className="flex gap-2">
                    <span className="shrink-0 text-faint">{new Date(l.createdAt).toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata" })}</span>
                    <span className={`shrink-0 w-14 uppercase ${l.level === "error" ? "text-ember" : l.level === "warn" ? "text-amber" : "text-leaf"}`}>{l.level}</span>
                    <span className="text-straw"><span className="text-faint">[{l.stage}]</span> {l.message}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ internals ---------------------------- */

function StageItem({
  stage: s,
  busy,
  onRun,
  disabled,
}: {
  stage: StageRow;
  busy: string | null;
  onRun: (stage: string) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const isGate = s.stage === "approval_gate";
  return (
    <li className={`rounded-xl border hairline ${s.status === "running" ? "stage-running border-amber/30" : "bg-ink/40"}`}>
      <div className="flex items-center gap-3 px-3.5 py-3">
        <span className="shrink-0">
          {s.status === "complete" ? (
            <CheckCircle2 className="h-4.5 w-4.5 h-5 w-5 text-leaf" />
          ) : s.status === "running" ? (
            <Loader2 className="h-5 w-5 animate-spin text-amber" />
          ) : s.status === "failed" ? (
            <XCircle className="h-5 w-5 text-ember" />
          ) : isGate ? (
            <BadgeCheck className="h-5 w-5 text-faint" />
          ) : (
            <CircleDashed className="h-5 w-5 text-faint" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-cream">{STAGE_LABELS[s.stage] ?? s.stage}</span>
            {s.durationMs != null && s.status === "complete" && (
              <span className="font-mono text-[9.5px] text-faint">{(s.durationMs / 1000).toFixed(1)}s</span>
            )}
          </div>
          {s.status === "running" && (
            <div className="mt-1.5 max-w-[220px]">
              <ProgressBar pct={s.progress} />
            </div>
          )}
          {s.error && <div className="mt-1 line-clamp-2 text-[11px] leading-snug text-ember">{s.error}</div>}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {s.output && (
            <button onClick={() => setOpen((v) => !v)} className="rounded-lg p-1.5 text-faint hover:text-amber" title="stage output">
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
            </button>
          )}
          {!isGate && (s.status === "pending" || s.status === "failed") && (
            <button
              onClick={() => onRun(s.stage)}
              disabled={disabled}
              className="btn-ghost inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px]"
            >
              {busy === s.stage ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
              {s.status === "failed" ? "Retry" : "Run"}
            </button>
          )}
          {isGate && s.status !== "complete" && (
            <span className="font-mono text-[9px] uppercase tracking-widest text-amber/80">human only</span>
          )}
        </div>
      </div>
      {open && s.output && (
        <pre className="mx-3.5 mb-3 max-h-44 overflow-auto rounded-lg border hairline bg-ink/70 p-3 font-mono text-[10px] leading-relaxed text-straw">
          {JSON.stringify(s.output, null, 2)}
        </pre>
      )}
    </li>
  );
}

function PlateStack({ data }: { data: Detail }) {
  const [idx, setIdx] = useState(0);
  const plated = data.scenes.filter((s) => s.platePath);
  useEffect(() => {
    if (plated.length < 2) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % plated.length), 3400);
    return () => clearInterval(t);
  }, [plated.length]);
  if (!plated.length)
    return (
      <div className="flex aspect-[9/16] max-h-[70vh] flex-col items-center justify-center gap-3 rounded-xl border border-dashed hairline text-center">
        <Clapperboard className="h-8 w-8 text-faint" />
        <p className="max-w-[220px] text-[12px] leading-relaxed text-muted">
          No frames yet — run the pipeline through storyboard & render.
        </p>
      </div>
    );
  const sc = plated[idx];
  return (
    <div className="video-frame relative mx-auto aspect-[9/16] max-h-[70vh] overflow-hidden rounded-xl">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={sc.platePath!} alt={sc.activity} className="h-full w-full object-cover transition-opacity duration-700" />
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/95 to-transparent p-3 pt-10">
        <div className="font-mono text-[9.5px] uppercase tracking-widest text-amber">storyboard · {String(idx + 1).padStart(2, "0")}</div>
        <div className="mt-0.5 text-[12.5px] font-semibold text-cream">{sc.activity}</div>
        <div className="font-mono text-[10px] text-faint">{sc.motionProfile} · {sc.durationSeconds}s · {sc.cameraStyle}</div>
      </div>
    </div>
  );
}

function AudioCard({
  data,
  busy,
  onRegen,
}: {
  data: Detail;
  busy: string | null;
  onRegen: (sceneKey: string) => Promise<void>;
}) {
  const audio = data.episode.spec?.audio;
  const segs = data.audioSegments;
  if (!audio) return null;
  return (
    <Card className="rise-in">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-display text-lg font-semibold text-cream">Audio production</h3>
        <span className="font-mono text-[10px] text-faint">
          {audio.mix.loudnessILufs} LUFS · TP {audio.mix.truePeakDb} dB · duck ×{audio.mix.duckRatio}
        </span>
      </div>
      <dl className="mb-4 grid grid-cols-2 gap-2 font-mono text-[10.5px]">
        {[
          ["provider", audio.narration.provider],
          ["model", audio.narration.model.replace("gemini-2.5-", "…2.5-")],
          ["voice", `${audio.narration.voiceId} · ${audio.narration.pace}`],
          ["buses", [audio.narration.enabled && "voice", audio.ambience.enabled && "ambience", audio.soundEffects.enabled && "sfx", audio.music.enabled && "music"].filter(Boolean).join(" + ")],
        ].map(([k, v]) => (
          <div key={k} className="rounded-lg border hairline bg-ink/50 px-3 py-2">
            <div className="text-faint">{k}</div>
            <div className="mt-0.5 truncate text-straw" title={v}>{v}</div>
          </div>
        ))}
      </dl>
      {segs.length === 0 ? (
        <p className="text-sm text-muted">Run the voice render stage to produce narration segments.</p>
      ) : (
        <ul className="space-y-2">
          {segs.map((s) => (
            <li key={s.id} className="rounded-xl border hairline bg-ink/40 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[10px] uppercase tracking-widest text-amber">{s.sceneKey}</span>
                <span className="font-mono text-[10px] text-faint">
                  @{s.windowStartS.toFixed(1)}s · {s.durationSeconds.toFixed(2)}s · {s.voiceId}
                </span>
                {s.degraded && <Badge tone="warn">mock voice</Badge>}
                <button
                  onClick={() => onRegen(s.sceneKey)}
                  disabled={busy !== null}
                  className="btn-ghost ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10.5px]"
                  title="Regenerate this segment only"
                >
                  {busy === `regen:${s.sceneKey}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                  Regen
                </button>
              </div>
              <p className="mt-1.5 text-[13px] leading-relaxed text-cream">{s.textOriginal}</p>
              {s.appliedRules.length > 0 && (
                <p className="mt-1 font-mono text-[9.5px] text-sky">pronunciation: {s.appliedRules.join(", ")}</p>
              )}
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <audio controls preload="none" src={s.path} className="mt-2 h-8 w-full" />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function MetaCard({ meta, channel }: { meta: { title: string; description: string; caption: string; hashtags: string[] }; channel: string }) {
  const [copied, setCopied] = useState(false);
  const full = channel === "instagram" ? `${meta.caption}\n\n${meta.hashtags.join(" ")}` : `${meta.title}\n\n${meta.description}`;
  return (
    <div className="rounded-xl border hairline bg-ink/50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[13.5px] font-bold text-cream">{meta.title}</div>
          <pre className="mt-2 max-h-44 overflow-y-auto whitespace-pre-wrap font-sans text-[12px] leading-relaxed text-muted">{channel === "instagram" ? meta.caption : meta.description}</pre>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {meta.hashtags.map((h) => (
              <span key={h} className="rounded bg-sky/10 px-1.5 py-0.5 font-mono text-[10px] text-sky">{h}</span>
            ))}
          </div>
        </div>
        <button
          onClick={() => {
            navigator.clipboard.writeText(full);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          }}
          className="btn-ghost shrink-0 rounded-lg p-2"
          title="Copy package"
        >
          {copied ? <CheckCircle2 className="h-4 w-4 text-leaf" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
