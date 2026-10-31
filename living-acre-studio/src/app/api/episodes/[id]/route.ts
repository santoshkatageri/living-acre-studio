import { NextResponse } from "next/server";
import { getEpisodeDetail } from "@/lib/studio/pipeline";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const detail = await getEpisodeDetail(id);
  if (!detail) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(detail);
}
