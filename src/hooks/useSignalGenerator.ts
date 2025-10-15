/**
 * @file A React hook for generating trading signals.
 *
 * This hook provides a simple interface for UI components to trigger the signal
 * generation process and manage the state associated with it, including loading,
 * error handling, and storing the most recent signal.
 */

import { useState, useCallback } from 'react';
import { generateTradingSignal, AggregationMode } from '../services/signalService';
import { createLLMAdapter } from '../services/llmService';
import { TradingSignal } from '../types/signal';

/**
 * A custom hook that provides a function to generate trading signals and manages the state.
 *
 * @returns An object with the following properties:
 *  - `loading`: A boolean indicating if a signal is currently being generated.
 *  - `error`: A string containing an error message if the last attempt failed, otherwise `null`.
 *  - `lastSignal`: The last successfully generated `TradingSignal`, otherwise `null`.
 *  - `generate`: A function to trigger the signal generation process.
 */
export function useSignalGenerator() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSignal, setLastSignal] = useState<TradingSignal | null>(null);

  /**
   * Triggers the signal generation process.
   * @param symbol The trading symbol to generate a signal for (e.g., "BTCUSDT").
   * @param adapters An array of configured LLM adapters.
   * @param aggregation The aggregation mode to use.
   * @returns The result of the signal generation, including the final signal and provider responses.
   */
  const generate = useCallback(
    async (
      symbol: string,
      adapters: ReturnType<typeof createLLMAdapter>[],
      aggregation: AggregationMode = 'WEIGHTED'
    ) => {
      setLoading(true);
      setError(null);
      try {
        const { final, providerResponses, mtf } = await generateTradingSignal(symbol, adapters, aggregation);
        if (final) {
          setLastSignal(final);
        }
        setLoading(false);
        return { final, providerResponses, mtf };
      } catch (err: any) {
        setError(String(err));
        setLoading(false);
        return { error: String(err) };
      }
    },
    []
  );

  return { loading, error, lastSignal, generate };
}
