import { NextRequest, NextResponse } from "next/server";
import { approveEpisode, refreshPublications } from "@/lib/studio/pipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  try {
    const body = (await req.json().catch(() => ({}))) as { note?: string };
    const detail = await approveEpisode(id, body.note);
    return NextResponse.json(detail);
  } catch (e) {
    const err = e as Error & { code?: number };
    return NextResponse.json(
      { error: err.message },
      { status: typeof err.code === "number" ? err.code : 500 },
    );
  }
}
