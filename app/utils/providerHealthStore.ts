// app/utils/providerHealthStore.ts
import AsyncStorage from '@react-native-async-storage/async-storage';

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface ProviderHealth {
  providerId: string;
  state: CircuitState;
  failureCount: number;
  lastAttempt: number; // Timestamp
}

const HEALTH_KEY_PREFIX = '@app:provider_health:';
const FAILURE_THRESHOLD = 3; // Number of failures before opening the circuit
const OPEN_TIMEOUT_MS = 60 * 1000; // 1 minute before moving to HALF_OPEN

const getHealthKey = (providerId: string) => `${HEALTH_KEY_PREFIX}${providerId}`;

/**
 * Retrieves the health status for a specific provider.
 * Returns a default healthy status if none exists.
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
 * Updates the health status for a provider.
 */
async function setHealthStatus(health: ProviderHealth): Promise<void> {
  await AsyncStorage.setItem(getHealthKey(health.providerId), JSON.stringify(health));
}

/**
 * Records a successful API call for a provider, resetting its health status.
 */
export async function recordSuccess(providerId: string): Promise<void> {
  const health = {
    providerId,
    state: 'CLOSED' as CircuitState,
    failureCount: 0,
    lastAttempt: Date.now(),
  };
  await setHealthStatus(health);
}

/**
 * Records a failed API call for a provider and updates its circuit state.
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
