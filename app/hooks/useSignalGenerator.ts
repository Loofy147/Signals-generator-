/**
 * @file A React hook for generating trading signals using dynamically configured providers.
 */
import { useEffect } from 'react';
import { ProviderSpec } from '../utils/providerStore';
import { ProviderHealth } from '../utils/providerHealthStore';
import { useSignalStore } from '../store/useSignalStore';

/**
 * Combines a provider's specification with its health status.
 * @interface ProviderWithHealth
 * @property {ProviderSpec} spec - The provider's specification.
 * @property {ProviderHealth} health - The provider's health status.
 */
export interface ProviderWithHealth {
  spec: ProviderSpec;
  health: ProviderHealth;
}

/**
 * A React hook for generating trading signals.
 *
 * This hook manages the state for loading and the last generated signal.
 * It also fetches and manages the list of available providers and their health.
 *
 * @returns {SignalState} An object containing the hook's state and functions.
 */
export function useSignalGenerator() {
  const {
    loading,
    lastSignal,
    lastResponses,
    providersWithHealth,
    generate,
    refreshProviders,
  } = useSignalStore();

  useEffect(() => {
    refreshProviders();
  }, [refreshProviders]);

  return { loading, lastSignal, lastResponses, generate, providersWithHealth, refreshProviders };
}
