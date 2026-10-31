import { NextResponse } from "next/server";
import { db } from "@/db";
import { series, usageEvents, assets } from "@/db/schema";
import { bufferStatusSummary } from "@/lib/studio/buffer";
import { DEFAULT_SLOTS, ENV, BRAND, TZ } from "@/lib/studio/constants";
import { TEMPLATES } from "@/lib/studio/series";
import { GEMINI_TTS_MODELS, VOICE_PROFILES } from "@/lib/audio/voices";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const seriesRows = await db.select().from(series).orderBy(series.sortOrder);
  const usage = await db
    .select({ kind: usageEvents.kind, units: usageEvents.units, cost: usageEvents.costEstimateUsd })
    .from(usageEvents);
  const assetCount = await db.select({ n: sql<number>`count(*)::int` }).from(assets);
  const usageTotals: Record<string, { units: number; cost: number }> = {};
  for (const u of usage) {
    usageTotals[u.kind] ??= { units: 0, cost: 0 };
    usageTotals[u.kind].units += u.units;
    usageTotals[u.kind].cost += u.cost;
  }
  const geminiKey = Boolean(process.env.GEMINI_API_KEY);
  const externalOk = (process.env.ALLOW_EXTERNAL_CALLS ?? "").toLowerCase() === "true";
  return NextResponse.json({
    brand: BRAND,
    timezone: TZ,
    slots: DEFAULT_SLOTS,
    buffer: bufferStatusSummary(),
    autoPublish: ENV.autoPublish,
    audio: {
      provider: "google_gemini",
      live: geminiKey && externalOk,
      geminiKeyConfigured: geminiKey,
      externalCallsEnabled: externalOk,
      models: GEMINI_TTS_MODELS,
      voiceProfiles: VOICE_PROFILES,
    },
    series: seriesRows,
    templates: TEMPLATES,
    usage: usageTotals,
    assetCount: assetCount[0]?.n ?? 0,
  });
}
