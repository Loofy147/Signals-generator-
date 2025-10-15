// app/services/llmService.ts
import { ProviderSpec, getProviderSecrets } from '../utils/providerStore';
import { fetchWithTimeout, sleep, extractTextFromObject } from './_utils_helpers';
import { ParsedSignalSchema } from '../schemas';

// NOTE: These types would typically be in a central `types.ts` file.
// They are duplicated here temporarily to keep this module self-contained for the refactoring step.
export interface LLMResponseParsed {
  providerId: string;
  raw: any;
  ok: boolean;
  parsed?: Partial<TradingSignal> & { reasoning?: string };
  error?: string;
}
export type SignalType = 'BUY' | 'SELL' | 'HOLD';
export interface TradingSignal {
  id: string;
  symbol: string;
  type: SignalType;
  confidence: number;
  price: number;
  timestamp: number;
  reasoning?: string;
  // Define other fields as needed from the full spec
}

/**
 * Replaces placeholders in a template string with values from a variables object.
 * Placeholders are in the format `{{key}}`.
 * @param template The template string.
 * @param vars An object containing key-value pairs for replacement.
 * @returns The rendered string.
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
 * @param spec The `ProviderSpec` object describing the LLM provider.
 * @returns An adapter object with a `call` method to interact with the LLM API.
 */
export function buildAdapterFromSpec(spec: ProviderSpec) {
  const timeout = spec.timeoutMs ?? 9000;
  const retries = spec.maxRetries ?? 1;

  async function call(prompt: string, extra: Record<string, any> = {}): Promise<LLMResponseParsed> {
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
            return { providerId: spec.id, raw, ok: true, parsed: validationResult.data };
          } else {
            // Log the validation error for debugging, but treat it as a failed parse.
            console.warn(`Validation failed for provider ${spec.id}:`, validationResult.error.errors);
            return { providerId: spec.id, raw, ok: false, error: 'Invalid response schema' };
          }
        }

        // If no JSON was found or parsed, return a failed response.
        return { providerId: spec.id, raw, ok: false, error: 'No valid JSON found in response' };
      } catch (err) {
        lastErr = err;
        attempt++;
        if (attempt <= retries) await sleep(200 * Math.pow(2, attempt));
      }
    }
    return { providerId: spec.id, raw: null, ok: false, error: String(lastErr) };
  }

  return { spec, call };
}
