/**
 * @file Manages the application's configuration.
 *
 * This file imports environment variables from the `.env` file and exports them
 * as typed constants. This provides a single source of truth for configuration
 * values and ensures that they are type-safe.
 */
import {
  MAX_SIGNALS_TO_STORE,
  FAILURE_THRESHOLD,
  OPEN_TIMEOUT_MS,
  BINANCE_BASE_URL
} from '@env';

export const config = {
  playbook: {
    maxSignalsToStore: parseInt(MAX_SIGNALS_TO_STORE, 10),
  },
  circuitBreaker: {
    failureThreshold: parseInt(FAILURE_THRESHOLD, 10),
    openTimeoutMs: parseInt(OPEN_TIMEOUT_MS, 10),
  },
  api: {
    binanceBaseUrl: BINANCE_BASE_URL,
  },
};
