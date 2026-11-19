import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import type { ZodType } from "zod";
import { db } from "@/lib/db/client";
import { aiCache, aiCalls } from "@/lib/db/schema";
import { resolveProvider, type Provider } from "./providers";

export { providerLabel } from "./providers";

export interface AiOptions<T> {
  /** Short task label for usage stats ("research", "score", ...). */
  task?: string;
  /** Deterministic fallback used when no provider is configured or the provider fails. */
  mock?: () => T;
}

export interface AiMeta {
  source: "live" | "cache" | "mock";
  provider: string;
  error?: string;
}

let lastMeta: AiMeta = { source: "mock", provider: "mock" };
/** Metadata about the most recent AI call (used for toasts: "served from cache", "mock fallback"). */
export function lastAiMeta(): AiMeta {
  return lastMeta;
}

function cacheKey(provider: Provider, prompt: string, mode: string): string {
  return createHash("sha256").update(`${provider.name}|${provider.model}|${mode}|${prompt}`).digest("hex");
}

function record(provider: string, task: string, cached: boolean, prompt: string, output: string) {
  db.insert(aiCalls)
    .values({ provider, task, cached, promptChars: prompt.length, outputChars: output.length, createdAt: new Date().toISOString() })
    .run();
}

function readCache(key: string): string | null {
  return db.select().from(aiCache).where(eq(aiCache.key, key)).get()?.response ?? null;
}

function writeCache(key: string, provider: string, response: string) {
  db.insert(aiCache)
    .values({ key, provider, response, createdAt: new Date().toISOString() })
    .onConflictDoUpdate({ target: aiCache.key, set: { response } })
    .run();
}

/** Pull the first JSON object/array out of a model response (handles ```json fences and chatter). */
export function extractJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : raw).trim();
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.search(/[[{]/);
    const end = Math.max(candidate.lastIndexOf("}"), candidate.lastIndexOf("]"));
    if (start >= 0 && end > start) return JSON.parse(candidate.slice(start, end + 1));
    throw new Error("Response was not valid JSON");
  }
}

function validate<T>(raw: string, schema: ZodType<T>): { ok: true; value: T } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = extractJson(raw);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "invalid JSON" };
  }
  const result = schema.safeParse(parsed);
  if (result.success) return { ok: true, value: result.data };
  return { ok: false, error: result.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ") };
}

function fallback<T>(task: string, prompt: string, opts: AiOptions<T> | undefined, error: string | undefined): T {
  if (!opts?.mock) throw new Error(`AI ${task} failed and no mock fallback was provided${error ? `: ${error}` : ""}`);
  const value = opts.mock();
  record("mock", task, false, prompt, JSON.stringify(value));
  lastMeta = { source: "mock", provider: "mock", error };
  return value;
}

/**
 * Generate structured output. Requests JSON mode, validates with Zod, retries once with a
 * corrective prompt, caches by hash(provider, prompt), and falls back to `opts.mock`.
 */
export async function generateJSON<T>(prompt: string, schema: ZodType<T>, opts?: AiOptions<T>): Promise<T> {
  const task = opts?.task ?? "json";
  const provider = resolveProvider();
  if (!provider) return fallback(task, prompt, opts, undefined);

  const fullPrompt = `${prompt}\n\nRespond with a single JSON object only. No markdown, no commentary.`;
  const key = cacheKey(provider, fullPrompt, "json");
  const cached = readCache(key);
  if (cached) {
    const v = validate(cached, schema);
    if (v.ok) {
      record(provider.name, task, true, fullPrompt, cached);
      lastMeta = { source: "cache", provider: provider.name };
      return v.value;
    }
  }

  let lastError = "";
  try {
    const first = await provider.complete(fullPrompt, { json: true });
    const v1 = validate(first, schema);
    record(provider.name, task, false, fullPrompt, first);
    if (v1.ok) {
      writeCache(key, provider.name, JSON.stringify(v1.value));
      lastMeta = { source: "live", provider: provider.name };
      return v1.value;
    }
    lastError = v1.error;

    const corrective = `${fullPrompt}\n\nYour previous response was rejected.\nPrevious response:\n${first.slice(0, 2000)}\n\nProblems: ${v1.error}\nReturn corrected JSON that fixes every problem and matches the required shape exactly.`;
    const second = await provider.complete(corrective, { json: true });
    record(provider.name, task, false, corrective, second);
    const v2 = validate(second, schema);
    if (v2.ok) {
      writeCache(key, provider.name, JSON.stringify(v2.value));
      lastMeta = { source: "live", provider: provider.name };
      return v2.value;
    }
    lastError = v2.error;
  } catch (e) {
    lastError = e instanceof Error ? e.message : String(e);
  }
  console.warn(`[ai] ${provider.name} ${task} failed, using mock: ${lastError}`);
  return fallback(task, prompt, opts, lastError);
}

/** Generate free text, with the same caching and mock fallback behaviour. */
export async function generateText(prompt: string, opts?: AiOptions<string>): Promise<string> {
  const task = opts?.task ?? "text";
  const provider = resolveProvider();
  const mockText = (error?: string) =>
    fallback(task, prompt, { mock: opts?.mock ?? (() => "AI provider unavailable; this is placeholder text.") }, error);
  if (!provider) return mockText();

  const key = cacheKey(provider, prompt, "text");
  const cached = readCache(key);
  if (cached) {
    record(provider.name, task, true, prompt, cached);
    lastMeta = { source: "cache", provider: provider.name };
    return cached;
  }
  try {
    const out = (await provider.complete(prompt, { json: false })).trim();
    record(provider.name, task, false, prompt, out);
    writeCache(key, provider.name, out);
    lastMeta = { source: "live", provider: provider.name };
    return out;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[ai] ${provider.name} ${task} failed, using mock: ${msg}`);
    return mockText(msg);
  }
}
