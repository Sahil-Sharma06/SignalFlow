// Verifies generateJSON: JSON-mode request, Zod validation, one corrective retry, caching, mock fallback.
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

const tmp = path.resolve("data/ai-test.db");
for (const f of [tmp, `${tmp}-wal`, `${tmp}-shm`]) fs.rmSync(f, { force: true });
process.env.DATABASE_PATH = tmp;
process.env.AI_PROVIDER = "gemini";
process.env.GEMINI_API_KEY = "test-key";

const responses: string[] = [];
let calls = 0;
globalThis.fetch = (async () => {
  calls++;
  const text = responses.shift();
  if (text === undefined) return new Response("boom", { status: 500 });
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 });
}) as typeof fetch;

function check(cond: unknown, msg: string) {
  if (!cond) { console.error(`FAIL: ${msg}`); process.exit(1); }
  console.log(`ok   ${msg}`);
}

void (async () => {
  const { generateJSON, lastAiMeta } = await import("@/lib/ai");
  const schema = z.object({ n: z.number() });

  responses.push('{"n": "not a number"}', '```json\n{"n": 7}\n```');
  const a = await generateJSON("prompt A", schema, { mock: () => ({ n: -1 }) });
  check(a.n === 7 && calls === 2, "invalid first response triggers one corrective retry");

  const b = await generateJSON("prompt A", schema, { mock: () => ({ n: -1 }) });
  check(b.n === 7 && calls === 2 && lastAiMeta().source === "cache", "second identical call served from ai_cache");

  const c = await generateJSON("prompt B", schema, { mock: () => ({ n: -1 }) });
  check(c.n === -1 && lastAiMeta().source === "mock", "HTTP failure falls back to mock");

  responses.push('{"bad": 1}', '{"still": "bad"}');
  const d = await generateJSON("prompt C", schema, { mock: () => ({ n: -2 }) });
  check(d.n === -2, "two invalid responses fall back to mock");
  console.log("ai adapter test passed");
})();