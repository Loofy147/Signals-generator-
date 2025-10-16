/**
 * @file Manages the storage and retrieval of LLM provider specifications and their secrets.
 *
 * This store uses AsyncStorage to save the non-sensitive provider specifications
 * and Expo's SecureStore to save sensitive data like API keys.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { ProviderSpecSchema } from '../schemas';

/**
 * Defines the structure of a provider specification.
 * @interface ProviderSpec
 * @property {string} id - A unique identifier for the provider, e.g., "my-llm-1".
 * @property {string} [name] - A user-friendly display name.
 * @property {string} endpoint - The API endpoint URL for the provider.
 * @property {string} [model] - The model name to be used with the provider.
 * @property {Record<string, string>} [headers] - Headers to be sent with the request. Can contain placeholders like "{{API_KEY}}".
 * @property {string} [requestTemplate] - A stringified JSON template for the request body. Can use placeholders like "{{prompt}}" and "{{model}}".
 * @property {number} [timeoutMs] - The request timeout in milliseconds.
 * @property {number} [maxRetries] - The maximum number of retries for a failed request.
 */
export interface ProviderSpec {
  id: string;
  name?: string;
  endpoint: string;
  model?: string;
  headers?: Record<string, string>;
  requestTemplate?: string;
  timeoutMs?: number;
  maxRetries?: number;
}

const SPECS_KEY = '@app:provider_specs_v1';
const KEY_PREFIX = '@app:provider_key:'; // SecureStore key prefix

/**
 * Lists all saved provider specifications.
 * @returns {Promise<ProviderSpec[]>} A promise that resolves to an array of provider specs.
 */
export async function listProviderSpecs(): Promise<ProviderSpec[]> {
  const raw = await AsyncStorage.getItem(SPECS_KEY);
  return raw ? JSON.parse(raw) : [];
}

/**
 * Retrieves a single provider specification by its ID.
 * @param {string} id The ID of the provider to retrieve.
 * @returns {Promise<ProviderSpec | null>} A promise that resolves to the provider spec, or null if not found.
 */
export async function getProviderSpec(id: string): Promise<ProviderSpec | null> {
  const specs = await listProviderSpecs();
  return specs.find(s => s.id === id) ?? null;
}

/**
 * Saves a provider specification.
 * If a spec with the same ID already exists, it will be overwritten.
 * @param {ProviderSpec} spec The provider spec to save.
 * @throws {Error} If the spec fails validation.
 */
export async function saveProviderSpec(spec: ProviderSpec): Promise<void> {
  // Validate the spec against the schema before saving.
  const validationResult = ProviderSpecSchema.safeParse(spec);
  if (!validationResult.success) {
    // Combine error messages into a single string.
    const errorMessage = validationResult.error.errors.map(e => e.message).join(', ');
    throw new Error(`Invalid provider spec: ${errorMessage}`);
  }

  const specs = await listProviderSpecs();
  const idx = specs.findIndex(s => s.id === spec.id);
  if (idx === -1) {
    specs.push(spec);
  } else {
    specs[idx] = spec;
  }
  await AsyncStorage.setItem(SPECS_KEY, JSON.stringify(specs));
}

/**
 * Stores a secret for a provider in SecureStore.
 * @param {string} providerId The ID of the provider.
 * @param {string} secretKeyName The name of the secret key, e.g., "API_KEY".
 * @param {string} secretValue The value of the secret.
 */
export async function storeProviderSecret(providerId: string, secretKeyName: string, secretValue: string) {
  const key = KEY_PREFIX + providerId;
  const existing = await SecureStore.getItemAsync(key);
  const obj = existing ? JSON.parse(existing) : {};
  obj[secretKeyName] = secretValue;
  await SecureStore.setItemAsync(key, JSON.stringify(obj));
}

/**
 * Retrieves all secrets for a provider from SecureStore.
 * @param {string} providerId The ID of the provider.
 * @returns {Promise<Record<string, string> | null>} A promise that resolves to a record of the provider's secrets, or null if not found.
 */
export async function getProviderSecrets(providerId: string): Promise<Record<string,string> | null> {
  const key = KEY_PREFIX + providerId;
  const raw = await SecureStore.getItemAsync(key);
  return raw ? JSON.parse(raw) : null;
}

/**
 * Removes a provider specification and its associated secrets.
 * @param {string} id The ID of the provider to remove.
 */
export async function removeProviderSpec(id: string) {
  const specs = await listProviderSpecs();
  const filtered = specs.filter(s => s.id !== id);
  await AsyncStorage.setItem(SPECS_KEY, JSON.stringify(filtered));
  await SecureStore.deleteItemAsync(KEY_PREFIX + id);
}
