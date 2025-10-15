/**
 * @file Internal utility helpers for services. Not intended for direct use outside of the services directory.
 */

/**
 * A utility function to make a `fetch` request with a specified timeout.
 */
export async function fetchWithTimeout(url: string, options: any = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return res;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

/**
 * Pauses execution for a specified number of milliseconds.
 */
export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * A conservative function to extract text from various possible LLM response structures.
 */
export function extractTextFromObject(obj: any): string | null {
  if (!obj) return null;
  if (typeof obj === 'string') return obj;
  // OpenAI / Anthropic-like
  if (obj.choices && Array.isArray(obj.choices) && obj.choices[0]) {
    const c = obj.choices[0];
    if (c.message && typeof c.message.content === 'string') return c.message.content;
    if (typeof c.text === 'string') return c.text;
  }
  // Gemini-like
  if (obj.candidates && Array.isArray(obj.candidates) && obj.candidates[0]) {
    const cand = obj.candidates[0];
    if (cand.content && cand.content.parts && Array.isArray(cand.content.parts) && cand.content.parts[0]) {
        return cand.content.parts[0].text ?? null;
    }
  }
  // Other common fields
  if (obj.completion && typeof obj.completion === 'string') return obj.completion;
  if (typeof obj.text === 'string') return obj.text;
  if (typeof obj.content === 'string') return obj.content;
  if (typeof obj.response === 'string') return obj.response;
  if (typeof obj.output === 'string') return obj.output;

  return null;
}
