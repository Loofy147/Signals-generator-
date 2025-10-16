import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TradingSignal, LLMResponseParsed } from '../types';
import { ProviderWithHealth } from '../hooks/useSignalGenerator';
import { generateTradingSignal, AggregationMode } from '../services/signalService';
import { listProviderSpecs } from '../utils/providerStore';
import { getHealthStatus } from '../utils/providerHealthStore';
import NetInfo from '@react-native-community/netinfo';

interface SignalState {
  loading: boolean;
  lastSignal: TradingSignal | null;
  lastResponses: LLMResponseParsed[];
  providersWithHealth: ProviderWithHealth[];
  generate: (symbol: string, aggregation?: AggregationMode) => Promise<any>;
  refreshProviders: () => Promise<void>;
}

export const useSignalStore = create<SignalState>()(
  persist(
    (set, get) => ({
      loading: false,
      lastSignal: null,
      lastResponses: [],
  providersWithHealth: [],
  generate: async (symbol, aggregation) => {
    const netInfo = await NetInfo.fetch();
    if (!netInfo.isConnected) {
      throw new Error('You are offline. Please check your internet connection.');
    }

    const { providersWithHealth, refreshProviders } = get();
    const activeProviders = providersWithHealth
      .filter((p) => p.health.state !== 'OPEN')
      .map((p) => p.spec);

    if (activeProviders.length === 0) {
      throw new Error('No healthy LLM providers available. Check provider settings or wait for them to recover.');
    }

    set({ loading: true });
    try {
      const result = await generateTradingSignal(symbol, activeProviders, aggregation);
      if (result.final) {
        set({ lastSignal: result.final });
      }
      set({ lastResponses: result.providerResponses });
      set({ loading: false });
      refreshProviders();
      return result;
    } catch (err) {
      set({ loading: false });
      refreshProviders();
      throw err;
    }
  },
  refreshProviders: async () => {
    const specs = await listProviderSpecs();
    const healthPromises = specs.map((spec) => getHealthStatus(spec.id));
    const healths = await Promise.all(healthPromises);

    const providers = specs.map((spec) => ({
      spec,
      health: healths.find((h) => h.providerId === spec.id)!,
    }));
    set({ providersWithHealth: providers });
  },
    }),
    {
      name: 'signal-storage', // name of the item in the storage (must be unique)
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        lastSignal: state.lastSignal,
        lastResponses: state.lastResponses,
        providersWithHealth: state.providersWithHealth,
      }),
    }
  )
);
