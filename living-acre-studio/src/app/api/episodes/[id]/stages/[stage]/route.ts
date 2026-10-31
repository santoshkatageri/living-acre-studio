import { NextResponse } from "next/server";
import { runStage } from "@/lib/studio/pipeline";
import { STAGES, type StageId } from "@/db/schema";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string; stage: string }> },
) {
  const { id, stage } = await ctx.params;
  if (!STAGES.includes(stage as StageId))
    return NextResponse.json({ error: `unknown stage "${stage}"` }, { status: 404 });
  try {
    const result = await runStage(id, stage as StageId);
    return NextResponse.json(result);
  } catch (e) {
    const err = e as Error & { code?: number };
    return NextResponse.json(
      { error: err.message },
      { status: typeof err.code === "number" ? err.code : 500 },
    );
  }
}
