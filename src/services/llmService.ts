/**
 * @file Manages interactions with Large Language Model (LLM) providers.
 *
 * This service provides a standardized way to communicate with various LLM APIs,
 * handling request building, response parsing, timeouts, and retries. It uses an
 * adapter pattern to support different providers like OpenAI, Anthropic, etc.
 */

import type { TradingSignal, SignalType } from '../types/signal';
import { fetchWithTimeout } from '../utils/fetch';

// --------------------------
// Interfaces and Types
// --------------------------

/**
 * Defines the specification for an LLM provider adapter.
 * This configuration tells the adapter how to interact with a specific LLM API.
 */
export interface LLMSpec {
  /** A unique identifier for the provider (e.g., "openai"). */
  id: string;
  /** The display name of the provider (e.g., "OpenAI"). */
  name: string;
  /** The API endpoint URL for the provider. */
  endpoint: string;
  /** The specific model to use (e.g., "gpt-4o-mini"). */
  model?: string;
  /** Optional headers to include in the request, such as for authorization. */
  headers?: Record<string, string>;
  /** A function to build the request body for the provider's API. */
  buildRequest?: (prompt: string, model?: string, extra?: Record<string, any>) => any;
  /** A function to extract the text content from the provider's response. */
  extractText?: (raw: any) => string | null;
  /** The timeout for the request in milliseconds. Defaults to 8000. */
  timeoutMs?: number;
  /** The maximum number of times to retry a failed request. Defaults to 1. */
  maxRetries?: number;
}

/**
 * Represents the parsed response from an LLM provider.
 */
export interface LLMResponseParsed {
  /** The ID of the provider that generated the response. */
  providerId: string;
  /** The raw, unprocessed response from the API. */
  raw: any;
  /** A boolean indicating whether the request was successful. */
  ok: boolean;
  /** The parsed trading signal data, if available. */
  parsed?: Partial<TradingSignal> & { reasoning?: string };
  /** An error message if the request failed. */
  error?: string;
}

// --------------------------
// Utility Functions
// --------------------------

/**
 * Pauses execution for a specified number of milliseconds.
 * @param ms The number of milliseconds to sleep.
 * @returns A promise that resolves after the specified duration.
 */
function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// --------------------------
// Default Implementations
// --------------------------

/**
 * A default request builder for OpenAI's chat completions API.
 * @param prompt The user's prompt.
 * @param model The model to use.
 * @param extra Extra parameters for the request.
 * @returns The request body object.
 */
function buildOpenAIRequest(prompt: string, model = 'gpt-4o-mini', extra: any = {}) {
  return {
    model,
    messages: [
      { role: 'system', content: 'You are a concise trading signal generator.' },
      { role: 'user', content: prompt },
    ],
    temperature: extra.temperature ?? 0.1,
    max_tokens: extra.max_tokens ?? 800,
  };
}

/**
 * A conservative function to extract text from various possible response structures.
 * @param obj The raw response object from an LLM API.
 * @returns The extracted text content or `null` if not found.
 */
export function extractTextFromObject(obj: any): string | null {
  if (!obj) return null;
  if (typeof obj === 'string') return obj;
  if (obj.choices && Array.isArray(obj.choices) && obj.choices[0]) {
    const c = obj.choices[0];
    if (c.message && typeof c.message.content === 'string') return c.message.content;
    if (typeof c.text === 'string') return c.text;
  }
  if (obj.completion && typeof obj.completion === 'string') return obj.completion;
  if (typeof obj.text === 'string') return obj.text;
  if (typeof obj.content === 'string') return obj.content;
  if (typeof obj.response === 'string') return obj.response;
  if (typeof obj.output === 'string') return obj.output;
  return null;
}

// --------------------------
// Core Adapter Logic
// --------------------------

/**
 * Creates an LLM adapter based on a given specification.
 * The adapter provides a `call` method to interact with the LLM API.
 * @param spec The `LLMSpec` configuration for the provider.
 * @returns An object with the provider's spec and a `call` function.
 */
export function createLLMAdapter(spec: LLMSpec) {
  const timeoutMs = spec.timeoutMs ?? 8000;
  const maxRetries = spec.maxRetries ?? 1;

  async function call(prompt: string, extra: Record<string, any> = {}): Promise<LLMResponseParsed> {
    let attempt = 0;
    let lastErr: any = null;
    const url = spec.endpoint;

    while (attempt <= maxRetries) {
      try {
        const body = spec.buildRequest ? spec.buildRequest(prompt, spec.model, extra) : buildOpenAIRequest(prompt, spec.model, extra);
        const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(spec.headers || {}) };
        const res = await fetchWithTimeout(url, { method: 'POST', headers, body: JSON.stringify(body) }, timeoutMs);
        const raw = await res.json();
        const text = spec.extractText ? spec.extractText(raw) : extractTextFromObject(raw);

        let parsedSignal: Partial<TradingSignal> | undefined;
        if (text) {
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            try {
              parsedSignal = JSON.parse(jsonMatch[0]);
            } catch (e) {
              /* Not strict JSON, will fall back to regex parsing */
            }
          }
        }

        if (!parsedSignal && text) {
          const s: Partial<TradingSignal> = {};
          const typeMatch = text.match(/\b(BUY|SELL|HOLD)\b/i);
          if (typeMatch) s.type = typeMatch[1].toUpperCase() as SignalType;
          const confMatch = text.match(/Confidence[:\s]*([0-9]{1,3})/i);
          if (confMatch) s.confidence = Number(confMatch[1]);
          const priceMatch = text.match(/Entry[:\s]*\$?([0-9,.]+)/i);
          if (priceMatch) s.price = Number(priceMatch[1].replace(/,/g, ''));
          const slMatch = text.match(/Stop\s*Loss[:\s]*\$?([0-9,.]+)/i);
          if (slMatch) s.riskMetrics = { ...(s.riskMetrics || {}), stopLoss: Number(slMatch[1].replace(/,/g, '')) } as any;
          const tpMatch = text.match(/Take\s*Profit[:\s]*\$?([0-9,.]+)/i);
          if (tpMatch) s.riskMetrics = { ...(s.riskMetrics || {}), takeProfit: Number(tpMatch[1].replace(/,/g, '')) } as any;
          if (Object.keys(s).length) parsedSignal = s;
        }

        return { providerId: spec.id, raw, ok: true, parsed: parsedSignal ? parsedSignal : undefined };
      } catch (err) {
        lastErr = err;
        attempt += 1;
        if (attempt <= maxRetries) await sleep(200 * Math.pow(2, attempt));
      }
    }
    return { providerId: spec.id, raw: null, ok: false, error: String(lastErr) };
  }

  return { spec, call };
}

/**
 * Calls multiple LLM providers in parallel and returns their settled responses.
 * @param adapters An array of LLM adapters to call.
 * @param prompt The prompt to send to each provider.
 * @param extra Extra options for the request.
 * @returns A promise that resolves with an array of responses.
 */
export async function callProvidersParallel(adapters: ReturnType<typeof createLLMAdapter>[], prompt: string, extra = {}) {
  const promises = adapters.map((a) => a.call(prompt, extra));
  const settled = await Promise.all(promises);
  return settled;
}

// --------------------------
// Pre-configured Adapter Specs
// --------------------------

/**
 * Creates a specification for the OpenAI API.
 * @param apiKey Your OpenAI API key.
 * @param model The model to use (defaults to "gpt-4o-mini").
 * @returns An `LLMSpec` for OpenAI.
 */
export function openAIAdapterSpec(apiKey: string, model = 'gpt-4o-mini'): LLMSpec {
  return {
    id: 'openai',
    name: 'OpenAI',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    model,
    headers: { Authorization: `Bearer ${apiKey}` },
    buildRequest: (prompt, modelName) => ({
      model: modelName || model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
    }),
    extractText: (raw) => extractTextFromObject(raw),
    timeoutMs: 8000,
    maxRetries: 1,
  };
}

/**
 * Creates a specification for the Anthropic API.
 * @param apiKey Your Anthropic API key.
 * @param model The model to use (defaults to "claude-3-5-sonnet").
 * @returns An `LLMSpec` for Anthropic.
 */
export function anthropicAdapterSpec(apiKey: string, model = 'claude-3-5-sonnet'): LLMSpec {
  return {
    id: 'anthropic',
    name: 'Anthropic',
    endpoint: 'https://api.anthropic.com/v1/complete',
    model,
    headers: { Authorization: `Bearer ${apiKey}` },
    buildRequest: (prompt, modelName) => ({
      model: modelName,
      prompt,
      max_tokens: 800,
      temperature: 0.1,
    }),
    extractText: (raw) => extractTextFromObject(raw),
    timeoutMs: 9000,
    maxRetries: 1,
  };
}

/**
 * Creates a specification for the Cohere API.
 * @param apiKey Your Cohere API key.
 * @param model The model to use (defaults to "command-r-plus").
 * @returns An `LLMSpec` for Cohere.
 */
export function cohereAdapterSpec(apiKey: string, model = 'command-r-plus'): LLMSpec {
  return {
    id: 'cohere',
    name: 'Cohere',
    endpoint: 'https://api.cohere.ai/v1/generate',
    model,
    headers: { Authorization: `Bearer ${apiKey}`, 'Cohere-Version': '2024-12-01' },
    buildRequest: (prompt, modelName) => ({
      model: modelName,
      prompt,
      max_tokens: 800,
      temperature: 0.1,
    }),
    extractText: (raw) => extractTextFromObject(raw),
    timeoutMs: 9000,
    maxRetries: 1,
  };
}

/**
 * Creates a specification for the Gemini API.
 * @param apiKey Your Gemini API key.
 * @param model The model to use (defaults to "gemini-1.5").
 * @returns An `LLMSpec` for Gemini.
 */
export function geminiAdapterSpec(apiKey: string, model = 'gemini-1.5'): LLMSpec {
  // Note: This is a simplified placeholder. Gemini's API structure might differ.
  // Consult the official Gemini API documentation for the correct implementation.
  return {
    id: 'gemini',
    name: 'Google Gemini',
    endpoint: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    model,
    headers: { 'Content-Type': 'application/json' },
    buildRequest: (prompt, modelName) => ({
      contents: [{ parts: [{ text: prompt }] }],
    }),
    extractText: (raw) => {
      try {
        return raw?.candidates?.[0]?.content?.parts?.[0]?.text || null;
      } catch {
        return null;
      }
    },
    timeoutMs: 10000,
    maxRetries: 1,
  };
}
