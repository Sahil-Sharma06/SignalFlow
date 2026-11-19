
export type ProviderName = "gemini" | "groq" | "ollama" | "mock";

export interface Provider {
  name: ProviderName;
  model: string;
  complete(prompt: string, opts: { json: boolean }): Promise<string>;
}

const TIMEOUT_MS = 25_000;

async function postJson(url: string, body: unknown, headers: Record<string, string> = {}): Promise<unknown> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

function dig(obj: unknown, path: (string | number)[]): unknown {
  let cur: unknown = obj;
  for (const k of path) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string | number, unknown>)[k];
  }
  return cur;
}

function asText(v: unknown, provider: string): string {
  if (typeof v !== "string" || v.length === 0) throw new Error(`${provider}: empty response`);
  return v;
}

function gemini(apiKey: string): Provider {
  const model = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
  return {
    name: "gemini",
    model,
    async complete(prompt, { json }) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
      const data = await postJson(
        url,
        {
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.4, ...(json ? { responseMimeType: "application/json" } : {}) },
        },
        { "x-goog-api-key": apiKey },
      );
      return asText(dig(data, ["candidates", 0, "content", "parts", 0, "text"]), "gemini");
    },
  };
}

function groq(apiKey: string): Provider {
  const model = process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";
  return {
    name: "groq",
    model,
    async complete(prompt, { json }) {
      const data = await postJson(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          model,
          temperature: 0.4,
          messages: [{ role: "user", content: prompt }],
          ...(json ? { response_format: { type: "json_object" } } : {}),
        },
        { authorization: `Bearer ${apiKey}` },
      );
      return asText(dig(data, ["choices", 0, "message", "content"]), "groq");
    },
  };
}

function ollama(baseUrl: string): Provider {
  const model = process.env.OLLAMA_MODEL ?? "llama3.1";
  return {
    name: "ollama",
    model,
    async complete(prompt, { json }) {
      const data = await postJson(`${baseUrl.replace(/\/$/, "")}/api/generate`, {
        model,
        prompt,
        stream: false,
        options: { temperature: 0.4 },
        ...(json ? { format: "json" } : {}),
      });
      return asText(dig(data, ["response"]), "ollama");
    },
  };
}

/** Resolve the configured provider. Returns null when the demo should use deterministic mocks. */
export function resolveProvider(): Provider | null {
  const requested = (process.env.AI_PROVIDER ?? "").toLowerCase().trim();
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  const groqKey = process.env.GROQ_API_KEY?.trim();
  const ollamaUrl = process.env.OLLAMA_URL?.trim();

  switch (requested) {
    case "mock":
      return null;
    case "groq":
      return groqKey ? groq(groqKey) : null;
    case "ollama":
      return ollama(ollamaUrl || "http://localhost:11434");
    case "gemini":
    case "":
      return geminiKey ? gemini(geminiKey) : null;
    default:
      return null;
  }
}

export function providerLabel(): { name: ProviderName; model: string } {
  const p = resolveProvider();
  return p ? { name: p.name, model: p.model } : { name: "mock", model: "deterministic" };
}
