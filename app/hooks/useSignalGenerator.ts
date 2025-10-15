/**
 * @file A React hook for generating trading signals using dynamically configured providers.
 */
import { useState, useCallback, useEffect } from 'react';
import { generateTradingSignal, AggregationMode } from '../services/signalService';
import { listProviderSpecs, ProviderSpec } from '../utils/providerStore';
import { TradingSignal } from '../types';

export function useSignalGenerator() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSignal, setLastSignal] = useState<TradingSignal | null>(null);
  const [availableProviders, setAvailableProviders] = useState<ProviderSpec[]>([]);

  // Fetch available providers on mount and whenever the list might change.
  const refreshProviders = useCallback(async () => {
    const specs = await listProviderSpecs();
    setAvailableProviders(specs);
  }, []);

  useEffect(() => {
    refreshProviders();
  }, [refreshProviders]);

  const generate = useCallback(
    async (
      symbol: string,
      aggregation: AggregationMode = 'WEIGHTED'
    ) => {
      if (availableProviders.length === 0) {
        setError("No LLM providers configured. Please add a provider in settings.");
        return { error: "No providers" };
      }
      setLoading(true);
      setError(null);
      try {
        const { final, providerResponses, mtf } = await generateTradingSignal(
          symbol,
          availableProviders,
          aggregation
        );
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
    [availableProviders] // Dependency on availableProviders ensures it uses the latest list.
  );

  return { loading, error, lastSignal, generate, availableProviders, refreshProviders };
}
