import { ENV } from "./constants";
import { hashJson } from "./util";

/* ------------------------------------------------------------------ */
/*  Buffer client — the studio's only publishing integration.          */
/*                                                                     */
/*  GraphQL at https://api.buffer.com, Bearer-token auth.              */
/*                                                                     */
/*  Schema verified by live introspection 2026-10-31:                  */
/*                                                                     */
/*  CreatePostInput {                                                  */
/*    channelId: ChannelId!                                            */
/*    text: String                                                     */
/*    assets: [AssetInput!]!       ← video: { url }                   */
/*    mode: ShareMode!             ← customScheduled                   */
/*    schedulingType: SchedulingType! ← automatic                      */
/*    needsApproval: Boolean!                                          */
/*    dueAt: DateTime                                                  */
/*    metadata: PostInputMetaData  ← per-platform (NOT "video")        */
/*  }                                                                  */
/*                                                                     */
/*  PostInputMetaData fields (platform-keyed):                          */
/*    instagram: { type: reel, shouldShareToFeed: true,                */
/*                 isAiGenerated }                                      */
/*    youtube:   { title, privacy: public, isAiGenerated,              */
/*                 madeForKids, notifySubscribers }                     */
/*                                                                     */
/*  There is NO "video" key inside PostInputMetaData.                   */
/* ------------------------------------------------------------------ */

export interface BufferChannel {
  channelId: string;
  service: "instagram" | "youtube";
  label: string;
}

export interface CreatePostInput {
  channelId: string;
  channel: "instagram" | "youtube";
  text: string;
  mediaUrl: string;
  thumbnailUrl?: string;
  title?: string;
  description?: string;
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

/** Resolve the real Buffer channel ID from env, falling back to the stored value.
 *  If the env value looks like a hex ObjectId (24 chars), use it directly.
 *  Otherwise, resolve channel IDs from the Buffer API by querying the organization. */
export function resolveChannelId(channel: "instagram" | "youtube", fallback: string): string {
  const envVal = channel === "instagram" ? ENV.bufferIgChannel : ENV.bufferYtChannel;
  // Buffer channel IDs are 24-char hex strings; display names are not
  if (envVal && /^[a-f0-9]{24}$/i.test(envVal)) return envVal;
  return fallback;
}

let _cachedChannels: { instagram?: string; youtube?: string } | null = null;

/** Discover real channel IDs from the Buffer API using organization channels query. */
export async function discoverChannelIds(): Promise<{ instagram?: string; youtube?: string }> {
  if (_cachedChannels) return _cachedChannels;
  // First get the organization ID
  type AcctResp = { account: { organizations: { id: string }[] } };
  const acct = await withRetry(() =>
    gql<AcctResp>("query { account { organizations { id } } }"),
  );
  const orgId = acct.account.organizations[0]?.id;
  if (!orgId) throw new Error("Buffer: no organization found on this account");

  // Then get channels for that org
  type ChResp = { channels: { id: string; service: string; displayName: string }[] };
  const data = await withRetry(() =>
    gql<ChResp>(
      `query { channels(input: { organizationId: ${JSON.stringify(orgId)} }) { id service displayName } }`,
    ),
  );
  const result: { instagram?: string; youtube?: string } = {};
  for (const ch of data.channels) {
    if (ch.service === "instagram") result.instagram = ch.id;
    if (ch.service === "youtube") result.youtube = ch.id;
  }
  _cachedChannels = result;
  return result;
}

/** Resolve channel ID: use env if it's a valid hex ID, otherwise discover from API. */
export async function resolveChannelIdAsync(channel: "instagram" | "youtube"): Promise<string> {
  const envVal = channel === "instagram" ? ENV.bufferIgChannel : ENV.bufferYtChannel;
  if (envVal && /^[a-f0-9]{24}$/i.test(envVal)) return envVal;
  // Env value is a display name, not an ID — discover from API
  const discovered = await discoverChannelIds();
  const id = discovered[channel];
  if (!id) throw new Error(`Buffer: no ${channel} channel found on the connected organization`);
  return id;
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

/** GraphQL helper with variables support — never serializes credentials. */
async function gql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const body: Record<string, unknown> = { query };
  if (variables) body.variables = variables;
  const res = await fetch(BASE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ENV.bufferApiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Buffer HTTP ${res.status}`);
  const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (json.errors?.length) throw new Error(`Buffer: ${json.errors[0].message}`);
  return json.data as T;
}

export async function createScheduledPost(input: CreatePostInput): Promise<BufferPostResult> {
  const mode = getBufferMode();
  const dueAtIso = input.dueAt.toISOString();

  if (mode === "mock") {
    await new Promise((r) => setTimeout(r, 120));
    return {
      postId: `mock-post-${hashJson(input.idempotencyKey).slice(0, 18)}`,
      status: "scheduled",
      dueAt: dueAtIso,
      mode,
      raw: { note: "Buffer mock — set BUFFER_API_KEY + ALLOW_EXTERNAL_CALLS=true to go live" },
    };
  }

  // Build platform-specific metadata block — schema verified by introspection.
  // PostInputMetaData has per-platform keys (instagram, youtube), NOT a "video" key.
  let metadataGql: string;
  if (input.channel === "youtube") {
    metadataGql = `metadata: {
      youtube: {
        title: ${JSON.stringify((input.title ?? "").slice(0, 100))},
        categoryId: "22",
        privacy: public,
        isAiGenerated: true,
        madeForKids: false,
        notifySubscribers: true
      }
    }`;
  } else {
    // Instagram Reel
    metadataGql = `metadata: {
      instagram: {
        type: reel,
        shouldShareToFeed: true,
        isAiGenerated: true
      }
    }`;
  }

  // Build assets array — video URL must be publicly accessible HTTPS.
  const assetsGql = `assets: [{ video: { url: ${JSON.stringify(input.mediaUrl)} } }]`;

  const mutation = `mutation {
    createPost(input: {
      text: ${JSON.stringify(input.text)},
      channelId: ${JSON.stringify(input.channelId)},
      schedulingType: automatic,
      mode: customScheduled,
      needsApproval: false,
      dueAt: ${JSON.stringify(dueAtIso)},
      ${assetsGql},
      ${metadataGql}
    }) {
      __typename
      ... on PostActionSuccess { post { id dueAt status } }
      ... on InvalidInputError { message }
      ... on LimitReachedError { message }
      ... on UnauthorizedError { message }
      ... on NotFoundError { message }
      ... on UnexpectedError { message }
      ... on RestProxyError { message }
    }
  }`;

  type Resp = {
    createPost:
      | { __typename: "PostActionSuccess"; post: { id: string; dueAt: string; status: string } }
      | { __typename: string; message?: string };
  };

  const data = await withRetry(() => gql<Resp>(mutation));

  if (data.createPost.__typename !== "PostActionSuccess") {
    const errObj = data.createPost as Record<string, unknown>;
    throw new Error(
      `Buffer rejected post: ${errObj.message ?? JSON.stringify(errObj)}`,
    );
  }

  const success = data.createPost as { post: { id: string; dueAt: string; status: string } };
  return {
    postId: success.post.id,
    status: "scheduled",
    dueAt: success.post.dueAt,
    mode,
    raw: { post: success.post },
  };
}

/** Poll Buffer until a scheduled post is confirmed published. */
export async function confirmPublished(
  postId: string,
  dueAt: Date,
): Promise<{ confirmed: boolean; status: string }> {
  const mode = getBufferMode();
  if (mode === "mock") {
    return Date.now() >= dueAt.getTime()
      ? { confirmed: true, status: "published" }
      : { confirmed: false, status: "scheduled" };
  }
  type Resp = { post: { id: string; status: string; dueAt: string } };
  try {
    const data = await withRetry(() =>
      gql<Resp>(`query { post(input: { id: ${JSON.stringify(postId)} }) { id status dueAt } }`),
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
    channels:
      mode === "live"
        ? []
        : configuredChannels().map((c) => ({ ...c, channelId: mask(c.channelId) })),
    autoPublish: ENV.autoPublish,
    note:
      mode === "mock"
        ? "MOCK mode: deterministic local simulation. Set BUFFER_API_KEY + ALLOW_EXTERNAL_CALLS=true to go live."
        : "LIVE mode: posts will be scheduled on real Buffer channels.",
  };
}
