import { NextResponse } from "next/server";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { audioPoc } from "@/db/schema";
import { runAudioPoc } from "@/lib/audio/poc";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  const rows = await db.select().from(audioPoc).orderBy(asc(audioPoc.id));
  return NextResponse.json({
    takes: rows,
    note:
      "Generated with the deterministic local mock unless GEMINI_API_KEY + ALLOW_EXTERNAL_CALLS=true are set. Takes are labelled.",
  });
}

export async function POST(req: Request) {
  // Narration synthesis is a paid API operation when live — require an
  // explicit confirmation header so the UI button also proves intent.
  const confirm = req.headers.get("x-studio-confirm");
  if (confirm !== "manual-approval") {
    return NextResponse.json({ error: "requires x-studio-confirm: manual-approval header" }, { status: 409 });
  }
  try {
    const { takes, providerInfo } = await runAudioPoc();
    return NextResponse.json({
      takes,
      provider: providerInfo.provider.id,
      degraded: providerInfo.degraded,
      reason: providerInfo.reason,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
