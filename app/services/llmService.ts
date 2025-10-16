/**
 * @file Manages interactions with Large Language Model (LLM) providers.
 *
 * This service builds a generic adapter for any LLM provider, allowing for
 * dynamic, runtime configuration. It also integrates a circuit breaker
 * to handle provider failures gracefully.
 */
import { ProviderSpec, getProviderSecrets } from '../utils/providerStore';
import { getHealthStatus, recordSuccess, recordFailure } from '../utils/providerHealthStore';
import { fetchWithTimeout, sleep, extractTextFromObject } from './_utils_helpers';
import { ParsedSignalSchema } from '../schemas';
import { LLMResponseParsed } from '../types';

/**
 * Replaces placeholders in a template string with values from a variables object.
 * Placeholders are in the format `{{key}}`.
 * @param {string} template The template string.
 * @param {Record<string, any>} vars An object containing key-value pairs for replacement.
 * @returns {string} The rendered string.
 */
function renderTemplate(template: string, vars: Record<string, any>): string {
  return template.replace(/\{\{(.+?)\}\}/g, (_, key) => {
    const k = key.trim();
    return String(vars[k] ?? '');
  });
}

/**
 * Builds a generic LLM adapter from a provider specification.
 * This function allows for dynamic, runtime configuration of any LLM provider.
 * @param {ProviderSpec} spec The `ProviderSpec` object describing the LLM provider.
 * @returns {{spec: ProviderSpec, call: (prompt: string, extra?: Record<string, any>) => Promise<LLMResponseParsed>}} An adapter object with a `call` method to interact with the LLM API.
 */
export function buildAdapterFromSpec(spec: ProviderSpec) {
  const timeout = spec.timeoutMs ?? 9000;
  const retries = spec.maxRetries ?? 1;

  /**
   * Makes a call to the LLM provider's API.
   * @param {string} prompt The prompt to send to the LLM.
   * @param {Record<string, any>} [extra] - Extra variables to use in the request template.
   * @returns {Promise<LLMResponseParsed>} A promise that resolves to the parsed response from the LLM.
   */
  async function call(prompt: string, extra: Record<string, any> = {}): Promise<LLMResponseParsed> {
    // 1. Check provider health before making a call
    const health = await getHealthStatus(spec.id);
    if (health.state === 'OPEN') {
      return {
        providerId: spec.id,
        raw: null,
        ok: false,
        error: `Circuit breaker is open for ${spec.id}. Temporarily unavailable.`,
      };
    }

    const secrets = await getProviderSecrets(spec.id) || {};

    // Build headers: merge spec.headers and replace any placeholders with secrets.
    const headers: Record<string, string> = {};
    if (spec.headers) {
      for (const k of Object.keys(spec.headers)) {
        let val = spec.headers[k];
        val = renderTemplate(val, { ...secrets, ...extra });
        headers[k] = val;
      }
    }

    // Build body from the request template.
    const tmpl = spec.requestTemplate ?? JSON.stringify({ prompt: '{{prompt}}', model: '{{model}}' });
    const bodyText = renderTemplate(tmpl, { prompt, model: spec.model ?? '', ...extra });
    const body = (() => {
      try { return JSON.parse(bodyText); } catch (e) { return bodyText; }
    })();

    // Fetch with retries logic.
    let attempt = 0;
    let lastErr: any = null;
    while (attempt <= retries) {
      try {
        const res = await fetchWithTimeout(spec.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: typeof body === 'string' ? body : JSON.stringify(body),
        }, timeout);

        const raw = await res.json();
        const text = extractTextFromObject(raw);

        // Attempt to parse a JSON block from the response text.
        let parsedJson: object | undefined;
        if (text) {
          const match = text.match(/\{[\s\S]*\}/);
          if (match) {
            try {
              parsedJson = JSON.parse(match[0]);
            } catch {
              // Not a valid JSON object, do nothing.
            }
          }
        }

        if (parsedJson) {
          const validationResult = ParsedSignalSchema.safeParse(parsedJson);
          if (validationResult.success) {
            await recordSuccess(spec.id);
            return { providerId: spec.id, raw, ok: true, parsed: validationResult.data };
          } else {
            // Log the validation error for debugging, but treat it as a failed parse.
            console.warn(`Validation failed for provider ${spec.id}:`, validationResult.error.errors);
            return { providerId: spec.id, raw, ok: false, error: 'Invalid response schema' };
          }
        }

        // If no JSON was found or parsed, return a failed response.
        const result = { providerId: spec.id, raw, ok: false, error: 'No valid JSON found in response' };
        await recordFailure(spec.id);
        return result;
      } catch (err) {
        lastErr = err;
        attempt++;
        if (attempt <= retries) await sleep(200 * Math.pow(2, attempt));
      }
    }

    // If all retries fail, record the failure and return the error.
    await recordFailure(spec.id);
    return { providerId: spec.id, raw: null, ok: false, error: String(lastErr) };
  }

  return { spec, call };
}
