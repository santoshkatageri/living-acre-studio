import { NextRequest, NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { episodes } from "@/db/schema";
import { createEpisode } from "@/lib/studio/pipeline";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(episodes).orderBy(desc(episodes.seq));
  return NextResponse.json({ episodes: rows });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      instruction?: string;
      seriesSlug?: string;
      language?: "kn" | "hi" | "en";
    };
    if (!body.instruction || body.instruction.trim().length < 12)
      return NextResponse.json(
        { error: "instruction is required (min 12 chars)" },
        { status: 422 },
      );
    const id = await createEpisode({
      instruction: body.instruction.trim(),
      seriesSlug: body.seriesSlug,
      language: body.language,
    });
    return NextResponse.json({ episodeId: id }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
