// Google Gemini REST adapter. The key travels in the x-goog-api-key header (never in the URL, so it cannot
// end up in access logs) and is never included in errors or return values.

export class LlmError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createGeminiProvider(cfg, fetchImpl = fetch) {
  const url = `${cfg.baseUrl}/models/${encodeURIComponent(cfg.model)}:generateContent`;

  async function once(system, user, timeoutMs) {
    let res;
    try {
      res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': cfg.apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: user }] }],
          generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 4096 },
        }),
        signal: AbortSignal.timeout(timeoutMs),
        redirect: 'error',
      });
      if (!res.ok) return { status: res.status };
      return { status: 200, text: await res.text() };
    } catch (err) {
      if (err?.name === 'TimeoutError' || err?.name === 'AbortError') throw new LlmError('LLM_TIMEOUT');
      throw new LlmError('LLM_UNAVAILABLE');
    }
  }

  return {
    name: 'gemini',
    model: cfg.model,
    /** @returns parsed JSON body of the provider response */
    async generate(system, user, { timeoutMs }) {
      const started = Date.now();
      let out = await once(system, user, timeoutMs);
      if (RETRY_STATUSES.has(out.status)) {
        const left = timeoutMs - (Date.now() - started) - 400;
        if (left > 1000) {
          await sleep(400);
          out = await once(system, user, left);
        }
      }
      if (out.status === 401 || out.status === 403) throw new LlmError('LLM_AUTH_FAILED');
      if (out.status === 429) throw new LlmError('LLM_RATE_LIMITED');
      if (out.status >= 500) throw new LlmError('LLM_UNAVAILABLE');
      if (out.status !== 200) throw new LlmError('LLM_HTTP_ERROR');
      if (typeof out.text !== 'string' || out.text.length > 1_000_000) throw new LlmError('LLM_BAD_RESPONSE');
      try {
        return JSON.parse(out.text);
      } catch {
        throw new LlmError('LLM_BAD_RESPONSE');
      }
    },
    // Provider-specific: pull the model's text out of the response, refusing anything that is not a clean STOP.
    extractText(body) {
      if (body?.promptFeedback?.blockReason) throw new LlmError('LLM_BLOCKED');
      const cand = body?.candidates?.[0];
      if (!cand) throw new LlmError('LLM_BAD_RESPONSE');
      if (cand.finishReason && cand.finishReason !== 'STOP') {
        throw new LlmError(cand.finishReason === 'SAFETY' ? 'LLM_BLOCKED' : 'LLM_BAD_RESPONSE');
      }
      const parts = Array.isArray(cand.content?.parts) ? cand.content.parts : [];
      const text = parts.filter((p) => !p.thought && typeof p.text === 'string').map((p) => p.text).join('');
      if (!text.trim()) throw new LlmError('LLM_BAD_RESPONSE');
      return text;
    },
  };
}
