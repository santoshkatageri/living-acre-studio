import { NextRequest, NextResponse } from "next/server";
import { regenerateSegment } from "@/lib/audio/tts";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Regenerate exactly one narration segment — never the whole episode. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const body = (await req.json()) as { sceneKey?: string };
    if (!body.sceneKey) return NextResponse.json({ error: "sceneKey required" }, { status: 422 });
    const result = await regenerateSegment(id, body.sceneKey);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
