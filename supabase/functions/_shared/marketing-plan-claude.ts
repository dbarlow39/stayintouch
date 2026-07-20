// Shared Claude helper for the Marketing Plan pipeline.
// Standalone: does not touch existing sonnet callers. Supports content-block arrays
// (text/image/document), streaming, tools with pause_turn loop, and opus-specific params.

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

export const OPUS_MODEL = "claude-opus-4-8";

export type Block =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
  | { type: "document"; source: { type: "base64"; media_type: string; data: string } }
  | Record<string, any>;

export type Msg = { role: "user" | "assistant"; content: string | Block[] };

export interface ClaudeCallOptions {
  model: string;
  system?: string;
  messages: Msg[];
  max_tokens: number;
  tools?: any[];
  // Opus-specific:
  thinking?: { type: "adaptive" | "disabled" | "enabled" };
  output_config?: { effort: "low" | "medium" | "high" };
  // Sonnet-only (silently dropped for opus):
  temperature?: number;
  top_p?: number;
  top_k?: number;
  // Loop control:
  maxPauseTurnRetries?: number; // default 5
  onPauseTurn?: () => Promise<void>; // heartbeat between pause_turn rounds
}

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
// Beta header required for the web_search / web_fetch server-side tools.
const ANTHROPIC_BETA =
  "web-search-2025-03-05,files-api-2025-04-14";

function buildBody(o: ClaudeCallOptions, stream: boolean) {
  const isOpus = o.model.startsWith("claude-opus");
  const body: Record<string, any> = {
    model: o.model,
    max_tokens: o.max_tokens,
    messages: o.messages,
    stream,
  };
  if (o.system) body.system = o.system;
  if (o.tools && o.tools.length) body.tools = o.tools;
  if (isOpus) {
    if (o.thinking) body.thinking = o.thinking;
    if (o.output_config) body.output_config = o.output_config;
    // opus rejects temperature/top_p/top_k
  } else {
    if (o.temperature != null) body.temperature = o.temperature;
    if (o.top_p != null) body.top_p = o.top_p;
    if (o.top_k != null) body.top_k = o.top_k;
  }
  return body;
}

function apiKey(): string {
  const k = Deno.env.get("ANTHROPIC_API_KEY");
  if (!k) throw new Error("ANTHROPIC_API_KEY not configured");
  return k;
}

// Exponential backoff schedule for HTTP 429 / 529 (Anthropic overload).
// Total added wall time: ~32s across 3 retries.
const RETRY_BACKOFF_MS = [3_000, 9_000, 20_000];

/**
 * POSTs to Anthropic, retrying on transient overload (429/529) with exponential
 * backoff. Returns { response, retries }. Non-retryable statuses (including
 * other 5xx) return immediately so the caller sees the real error.
 */
async function postAnthropicWithRetry(body: unknown): Promise<{ response: Response; retries: number }> {
  let retries = 0;
  for (let attempt = 0; attempt <= RETRY_BACKOFF_MS.length; attempt++) {
    const response = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey(),
        "anthropic-version": ANTHROPIC_VERSION,
        "anthropic-beta": ANTHROPIC_BETA,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (response.status !== 429 && response.status !== 529) {
      return { response, retries };
    }
    if (attempt === RETRY_BACKOFF_MS.length) {
      return { response, retries };
    }
    const wait = RETRY_BACKOFF_MS[attempt];
    console.warn(`Anthropic ${response.status} overload; retry ${attempt + 1}/${RETRY_BACKOFF_MS.length} in ${wait}ms`);
    try { await response.body?.cancel(); } catch { /* ignore */ }
    await new Promise((r) => setTimeout(r, wait));
    retries++;
  }
  // unreachable
  throw new Error("postAnthropicWithRetry: exhausted without response");
}


/**
 * Non-streaming Claude call. Handles pause_turn tool loop up to 5 iterations.
 * Returns the final assistant message content blocks joined into text plus the raw blocks.
 */
export async function callClaude(opts: ClaudeCallOptions): Promise<{
  text: string;
  blocks: any[];
  stop_reason: string;
  raw: any;
}> {
  let messages: Msg[] = [...opts.messages];
  let iterations = 0;
  let last: any = null;
  const maxRetries = opts.maxPauseTurnRetries ?? 5;

  while (iterations <= maxRetries) {
    const body = buildBody({ ...opts, messages }, false);
    const r = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey(),
        "anthropic-version": ANTHROPIC_VERSION,
        "anthropic-beta": ANTHROPIC_BETA,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const t = await r.text();
      throw new Error(`Claude API error [${r.status}]: ${t.slice(0, 800)}`);
    }
    last = await r.json();
    const stop = last.stop_reason as string;
    const assistantBlocks = last.content ?? [];
    // If pause_turn, append assistant response and re-send.
    if (stop === "pause_turn" && iterations < maxRetries) {
      messages = [...messages, { role: "assistant", content: assistantBlocks }];
      iterations++;
      if (opts.onPauseTurn) {
        try { await opts.onPauseTurn(); } catch (_) { /* ignore */ }
      }
      continue;
    }
    const text = assistantBlocks
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("\n");
    return { text, blocks: assistantBlocks, stop_reason: stop, raw: last };
  }
  const text = (last?.content ?? [])
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("\n");
  return { text, blocks: last?.content ?? [], stop_reason: "pause_turn_exhausted", raw: last };
}

/**
 * Streams Claude output into storage via periodic partial callbacks. Meant for
 * background execution (EdgeRuntime.waitUntil) — does NOT hold an HTTP stream
 * open to the browser. The caller polls the persisted row for progress.
 */
export async function streamClaudeToStorage(
  opts: ClaudeCallOptions,
  onPartial: (fullText: string) => Promise<void>,
  onComplete: (fullText: string) => Promise<void>,
  partialIntervalMs = 2000,
): Promise<{ text: string; stop_reason: string; output_tokens: number }> {
  const body = buildBody(opts, true);
  const upstream = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey(),
      "anthropic-version": ANTHROPIC_VERSION,
      "anthropic-beta": ANTHROPIC_BETA,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!upstream.ok || !upstream.body) {
    const t = await upstream.text();
    throw new Error(`Claude API error [${upstream.status}]: ${t.slice(0, 800)}`);
  }

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let full = "";
  let buf = "";
  let lastFlush = Date.now();
  let lastFlushedLen = 0;
  let stopReason = "unknown";
  let outputTokens = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, nl).trimEnd();
      buf = buf.slice(nl + 1);
      if (!line.startsWith("data: ")) continue;
      const json = line.slice(6).trim();
      if (!json) continue;
      try {
        const evt = JSON.parse(json);
        if (
          evt.type === "content_block_delta" &&
          evt.delta?.type === "text_delta" &&
          evt.delta.text
        ) {
          full += evt.delta.text;
        } else if (evt.type === "message_delta") {
          if (evt.delta?.stop_reason) stopReason = evt.delta.stop_reason;
          if (evt.usage?.output_tokens) outputTokens = evt.usage.output_tokens;
        } else if (evt.type === "message_stop" && evt["amazon-bedrock-invocationMetrics"]) {
          // no-op, but keeps parser tolerant of future fields
        }
      } catch (_) { /* ignore partials */ }
    }
    const now = Date.now();
    if (now - lastFlush >= partialIntervalMs && full.length > lastFlushedLen) {
      lastFlush = now;
      lastFlushedLen = full.length;
      try { await onPartial(full); } catch (e) { console.error("onPartial failed:", e); }
    }
  }
  await onComplete(full);
  return { text: full, stop_reason: stopReason, output_tokens: outputTokens };
}

/**
 * Streams Claude output directly to the browser as SSE `data:` chunks (plain text deltas).
 * Persists the accumulated text via the provided onComplete callback.
 */
export async function streamClaudeToBrowser(
  opts: ClaudeCallOptions,
  onComplete: (fullText: string) => Promise<void>,
): Promise<Response> {
  const body = buildBody(opts, true);
  const upstream = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey(),
      "anthropic-version": ANTHROPIC_VERSION,
      "anthropic-beta": ANTHROPIC_BETA,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!upstream.ok || !upstream.body) {
    const t = await upstream.text();
    return new Response(
      JSON.stringify({ error: "Claude API error", status: upstream.status, details: t.slice(0, 800) }),
      { status: upstream.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let full = "";

  const stream = new ReadableStream({
    async start(controller) {
      let buf = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buf.indexOf("\n")) !== -1) {
            const line = buf.slice(0, nl).trimEnd();
            buf = buf.slice(nl + 1);
            if (!line.startsWith("data: ")) continue;
            const json = line.slice(6).trim();
            if (!json) continue;
            try {
              const evt = JSON.parse(json);
              if (
                evt.type === "content_block_delta" &&
                evt.delta?.type === "text_delta" &&
                evt.delta.text
              ) {
                full += evt.delta.text;
                const payload = { choices: [{ delta: { content: evt.delta.text } }] };
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
              }
            } catch (_) { /* ignore partials */ }
          }
        }
        try { await onComplete(full); } catch (e) { console.error("stage 5 onComplete failed:", e); }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } catch (e) {
        console.error("Stream relay error:", e);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
  });
}
