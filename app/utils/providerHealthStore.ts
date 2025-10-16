/**
 * @file Manages the health status of LLM providers using a circuit breaker pattern.
 *
 * This store tracks the health of each provider, including its circuit state
 * ('OPEN', 'CLOSED', 'HALF_OPEN'), failure count, and the timestamp of the last attempt.
 * This allows the application to avoid sending requests to providers that are likely to fail.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CircuitState, ProviderHealth } from '../types';
import { FAILURE_THRESHOLD, OPEN_TIMEOUT_MS } from '../constants';

const HEALTH_KEY_PREFIX = '@app:provider_health:';

/**
 * Generates the AsyncStorage key for a provider's health status.
 * @param {string} providerId The ID of the provider.
 * @returns {string} The AsyncStorage key.
 */
const getHealthKey = (providerId: string) => `${HEALTH_KEY_PREFIX}${providerId}`;

/**
 * Retrieves the health status for a specific provider.
 * If no status is found, it returns a default healthy status.
 * It also handles the transition from 'OPEN' to 'HALF_OPEN' after a timeout.
 * @param {string} providerId The ID of the provider.
 * @returns {Promise<ProviderHealth>} A promise that resolves to the provider's health status.
 */
export async function getHealthStatus(providerId: string): Promise<ProviderHealth> {
  const raw = await AsyncStorage.getItem(getHealthKey(providerId));
  if (raw) {
    const health: ProviderHealth = JSON.parse(raw);
    // Check if an 'OPEN' circuit should transition to 'HALF_OPEN'
    if (health.state === 'OPEN' && Date.now() - health.lastAttempt > OPEN_TIMEOUT_MS) {
      return { ...health, state: 'HALF_OPEN' };
    }
    return health;
  }
  return {
    providerId,
    state: 'CLOSED',
    failureCount: 0,
    lastAttempt: Date.now(),
  };
}

/**
 * Updates the health status for a provider in AsyncStorage.
 * @param {ProviderHealth} health The health status to save.
 */
async function setHealthStatus(health: ProviderHealth): Promise<void> {
  await AsyncStorage.setItem(getHealthKey(health.providerId), JSON.stringify(health));
}

/**
 * Records a successful API call for a provider, resetting its health status to 'CLOSED'.
 * @param {string} providerId The ID of the provider.
 */
export async function recordSuccess(providerId: string): Promise<void> {
  const health: ProviderHealth = {
    providerId,
    state: 'CLOSED',
    failureCount: 0,
    lastAttempt: Date.now(),
  };
  await setHealthStatus(health);
}

/**
 * Records a failed API call for a provider and updates its circuit state.
 * If the failure threshold is reached, the circuit is opened.
 * @param {string} providerId The ID of the provider.
 */
export async function recordFailure(providerId: string): Promise<void> {
  const currentHealth = await getHealthStatus(providerId);
  const now = Date.now();

  let newState = currentHealth.state;
  let newFailureCount = currentHealth.failureCount + 1;

  if (currentHealth.state === 'HALF_OPEN') {
    // A single failure in HALF_OPEN state re-opens the circuit immediately.
    newState = 'OPEN';
  } else if (newFailureCount >= FAILURE_THRESHOLD) {
    // Reaching the threshold opens the circuit.
    newState = 'OPEN';
  }

  const newHealth: ProviderHealth = {
    providerId,
    state: newState,
    failureCount: newFailureCount,
    lastAttempt: now,
  };
  await setHealthStatus(newHealth);
}
