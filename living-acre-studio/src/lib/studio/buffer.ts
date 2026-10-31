import { ENV } from "./constants";
import { hashJson } from "./util";

/* ------------------------------------------------------------------ */
/*  Buffer client — the studio's only publishing integration.          */
/*                                                                     */
/*  Current Buffer public API (developers.buffer.com): GraphQL at      */
/*  https://api.buffer.com with Bearer-token auth, `createPost`         */
/*  mutation (channelId + schedulingType + mode: customScheduled +     */
/*  dueAt). The live path is only ever exercised when BUFFER_API_KEY   */
/*  is configured; otherwise the client runs a deterministic mock so   */
/*  the full workflow is testable without credentials.                  */
/*                                                                     */
/*  Secrets are never logged; channel IDs come from env config and are */
/*  masked in responses.                                                */
/* ------------------------------------------------------------------ */

export interface BufferChannel {
  channelId: string;
  service: "instagram" | "youtube";
  label: string;
}

export interface CreatePostInput {
  channelId: string;
  text: string;
  mediaUrl: string;
  mediaAltText?: string;
  title?: string;
  dueAt: Date;
  idempotencyKey: string;
}

export interface BufferPostResult {
  postId: string;
  status: "scheduled" | "draft";
  dueAt: string;
  mode: "live" | "mock";
  raw?: Record<string, unknown>;
}

const BASE = "https://api.buffer.com";

export function getBufferMode(): "live" | "mock" {
  const flag = ENV.yoloExternal;
  return ENV.bufferApiKey && flag === "true" ? "live" : "mock";
}

export function configuredChannels(): BufferChannel[] {
  const out: BufferChannel[] = [];
  if (ENV.bufferIgChannel)
    out.push({ channelId: ENV.bufferIgChannel, service: "instagram", label: "Instagram — Reels" });
  if (ENV.bufferYtChannel)
    out.push({ channelId: ENV.bufferYtChannel, service: "youtube", label: "YouTube — Shorts" });
  return out;
}

function maskChannels(list: BufferChannel[]) {
  return list.map((c) => ({
    ...c,
    channelId: mask(c.channelId),
  }));
}
function mask(id: string) {
  if (id.length <= 6) return "••••••";
  return `${id.slice(0, 4)}…${id.slice(-2)}`;
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 400 * 2 ** i));
    }
  }
  throw lastErr;
}

/** GraphQL helper — never serializes credentials into logs. */
async function gql<T>(query: string): Promise<T> {
  const res = await fetch(BASE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ENV.bufferApiKey}`,
    },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`Buffer HTTP ${res.status}`);
  const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (json.errors?.length) throw new Error(`Buffer: ${json.errors[0].message}`);
  return json.data as T;
}

export async function listChannelsLive(): Promise<BufferChannel[]> {
  interface Resp {
    organization: {
      channels: { id: string; service: string; displayName: string }[];
    };
  }
  const data = await withRetry(() =>
    gql<Resp>(
      `query OrgChannels($orgId: ID!) {
        organization(id: $orgId) { channels { id service displayName } }
      }`.replace("$orgId", JSON.stringify(ENV.bufferOrgId)),
    ),
  );
  return data.organization.channels
    .filter((c) => ["instagram", "youtube"].includes(c.service))
    .map((c) => ({
      channelId: c.id,
      service: c.service as "instagram" | "youtube",
      label: c.displayName,
    }));
}

export async function createScheduledPost(input: CreatePostInput): Promise<BufferPostResult> {
  const mode = getBufferMode();
  const dueAtIso = input.dueAt.toISOString();

  if (mode === "mock") {
    await new Promise((r) => setTimeout(r, 120)); // simulate latency
    return {
      postId: `mock-post-${hashJson(input.idempotencyKey).slice(0, 18)}`,
      status: "scheduled",
      dueAt: dueAtIso,
      mode,
      raw: { note: "Buffer mock — set BUFFER_API_KEY to go live" },
    };
  }

  type Resp = {
    createPost:
      | { __typename: "PostActionSuccess"; post: { id: string; dueAt: string } }
      | { __typename: "MutationError"; message: string };
  };
  const data = await withRetry(() =>
    gql<Resp>(`mutation {
      createPost(input: {
        text: ${JSON.stringify(input.text)},
        channelId: ${JSON.stringify(input.channelId)},
        schedulingType: automatic,
        mode: customScheduled,
        dueAt: ${JSON.stringify(dueAtIso)},
        metadata: { video: { title: ${JSON.stringify(input.title ?? "")} } }
      }) {
        ... on PostActionSuccess { post { id dueAt } }
        ... on MutationError { message }
      }
    }`),
  );
  if (data.createPost.__typename !== "PostActionSuccess")
    throw new Error(`Buffer rejected post: ${(data.createPost as { message: string }).message}`);
  return {
    postId: data.createPost.post.id,
    status: "scheduled",
    dueAt: data.createPost.post.dueAt,
    mode,
    raw: { post: data.createPost.post },
  };
}

/** Poll Buffer until a scheduled post is confirmed published. */
export async function confirmPublished(postId: string, dueAt: Date): Promise<{
  confirmed: boolean;
  status: string;
}> {
  const mode = getBufferMode();
  if (mode === "mock") {
    // Deterministic mock confirmation: due time passed → published.
    return Date.now() >= dueAt.getTime()
      ? { confirmed: true, status: "published" }
      : { confirmed: false, status: "scheduled" };
  }
  type Resp = { post: { id: string; status: string; dueAt: string } };
  try {
    const data = await withRetry(() =>
      gql<Resp>(`query { post(id: ${JSON.stringify(postId)}) { id status dueAt } }`),
    );
    const st = String(data.post.status ?? "").toLowerCase();
    return { confirmed: st === "published" || st === "sent", status: st };
  } catch {
    return { confirmed: false, status: "unknown" };
  }
}

export function bufferStatusSummary() {
  const mode = getBufferMode();
  return {
    mode,
    apiKeyConfigured: Boolean(ENV.bufferApiKey),
    externalCallsEnabled: ENV.yoloExternal,
    organizationId: mask(ENV.bufferOrgId || "not-configured"),
    channels: mode === "live" ? [] : maskChannels(configuredChannels()),
    autoPublish: ENV.autoPublish,
    note:
      mode === "mock"
        ? "MOCK mode: deterministic local simulation. Set BUFFER_API_KEY + ALLOW_EXTERNAL_CALLS=true to go live."
        : "LIVE mode: posts will be scheduled on real Buffer channels.",
  };
}
