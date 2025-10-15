/**
 * @file Central repository for Zod validation schemas.
 *
 * This file defines the data contracts for key objects in the application,
 * ensuring that data conforms to the expected structure and types.
 */

import { z } from 'zod';

/**
 * Schema for validating the configuration of a generic LLM provider.
 * Ensures that provider specs are well-formed before they are saved.
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
 * Schema for validating the parsed signal from an LLM response.
 * This ensures that the data from the LLM is in the expected format before processing.
 */
export const ParsedSignalSchema = z.object({
  type: z.enum(['BUY', 'SELL', 'HOLD']),
  confidence: z.number().min(0).max(100),
  price: z.number().positive(),
  stopLoss: z.number().positive(),
  takeProfit: z.number().positive(),
  reasoning: z.string().optional(),
}).partial(); // Use .partial() because the LLM might not return all fields
