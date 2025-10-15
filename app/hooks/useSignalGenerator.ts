/**
 * @file A React hook for generating trading signals using dynamically configured providers.
 */
import { useState, useCallback, useEffect } from 'react';
import { generateTradingSignal, AggregationMode } from '../services/signalService';
import { listProviderSpecs, ProviderSpec } from '../utils/providerStore';
import { getHealthStatus, ProviderHealth } from '../utils/providerHealthStore';
import { TradingSignal } from '../types';

export interface ProviderWithHealth {
  spec: ProviderSpec;
  health: ProviderHealth;
}

import { LLMResponseParsed } from '../types';

export function useSignalGenerator() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSignal, setLastSignal] = useState<TradingSignal | null>(null);
  const [providersWithHealth, setProvidersWithHealth] = useState<ProviderWithHealth[]>([]);
  const [lastResponses, setLastResponses] = useState<LLMResponseParsed[]>([]);

  // Fetch available providers and their health on mount and whenever the list might change.
  const refreshProviders = useCallback(async () => {
    const specs = await listProviderSpecs();
    const healthPromises = specs.map(spec => getHealthStatus(spec.id));
    const healths = await Promise.all(healthPromises);

    const providers = specs.map(spec => ({
      spec,
      health: healths.find(h => h.providerId === spec.id)!,
    }));
    setProvidersWithHealth(providers);
  }, []);

  useEffect(() => {
    refreshProviders();
  }, [refreshProviders]);

  const generate = useCallback(
    async (
      symbol: string,
      aggregation: AggregationMode = 'WEIGHTED'
    ) => {
      const activeProviders = providersWithHealth
        .filter(p => p.health.state !== 'OPEN')
        .map(p => p.spec);

      if (activeProviders.length === 0) {
        setError("No healthy LLM providers available. Check provider settings or wait for them to recover.");
        return { error: "No healthy providers" };
      }
      setLoading(true);
      setError(null);
      try {
        const result = await generateTradingSignal(
          symbol,
          activeProviders,
          aggregation
        );
        if (result.final) {
          setLastSignal(result.final);
        }
        setLastResponses(result.providerResponses);
        setLoading(false);
        // Refresh provider health after a call
        refreshProviders();
        return result;
      } catch (err: any) {
        setError(String(err));
        setLoading(false);
        refreshProviders(); // Also refresh on error
        return { error: String(err) };
      }
    },
    [providersWithHealth, refreshProviders]
  );

  return { loading, error, lastSignal, lastResponses, generate, providersWithHealth, refreshProviders };
}
