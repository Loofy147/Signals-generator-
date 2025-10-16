/**
 * @file Central repository for Zod validation schemas.
 *
 * This file defines the data contracts for key objects in the application,
 * ensuring that data conforms to the expected structure and types.
 */

import { z } from 'zod';

/**
 * @name ProviderSpecSchema
 * @description Zod schema for validating the configuration of a generic LLM provider.
 * Ensures that provider specs are well-formed before they are saved.
 * @property {string} id - A unique identifier for the provider.
 * @property {string} [name] - The name of the provider.
 * @property {string} endpoint - The URL of the provider's API endpoint.
 * @property {string} [model] - The model to use for the provider.
 * @property {Record<string, string>} [headers] - Headers to include in the request.
 * @property {string} [requestTemplate] - A JSON string template for the request body.
 * @property {number} [timeoutMs] - The timeout for the request in milliseconds.
 * @property {number} [maxRetries] - The maximum number of times to retry a failed request.
 */
export const ProviderSpecSchema = z.object({
  id: z.string().min(1, { message: "ID is required" }),
  name: z.string().optional(),
  endpoint: z.string().url({ message: "Invalid URL format" }),
  model: z.string().optional(),
  headers: z.record(z.string()).optional(),
  requestTemplate: z.string().optional().refine((val) => {
    if (!val) return true; // Optional field is valid if empty
    try {
      JSON.parse(val);
      return true;
    } catch {
      return false;
    }
  }, { message: "Request template must be a valid JSON string" }),
  timeoutMs: z.number().int().positive().optional(),
  maxRetries: z.number().int().min(0).optional(),
});

/**
 * @name ParsedSignalSchema
 * @description Zod schema for validating the parsed signal from an LLM response.
 * This ensures that the data from the LLM is in the expected format before processing.
 * @property {'BUY' | 'SELL' | 'HOLD'} [type] - The type of the signal.
 * @property {number} [confidence] - The confidence level of the signal, from 0 to 100.
 * @property {number} [price] - The target price for the signal.
 * @property {number} [stopLoss] - The price at which to exit a losing trade.
 * @property {number} [takeProfit] - The price at which to exit a winning trade.
 * @property {string} [reasoning] - The reasoning or justification for the signal.
 */
export const ParsedSignalSchema = z.object({
  type: z.enum(['BUY', 'SELL', 'HOLD']),
  confidence: z.number().min(0).max(100),
  price: z.number().positive(),
  stopLoss: z.number().positive(),
  takeProfit: z.number().positive(),
  reasoning: z.string().optional(),
}).partial();
