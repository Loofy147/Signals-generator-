// app/utils/providerStore.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { ProviderSpecSchema } from '../schemas';

export interface ProviderSpec {
  id: string;                     // unique id e.g. "my-llm-1"
  name?: string;                  // display name
  endpoint: string;               // API endpoint URL
  model?: string;                 // optional model name
  // headersTemplate: JSON string or object; can contain placeholders like "{{API_KEY}}"
  headers?: Record<string, string>;
  // requestTemplate: stringified JSON template where you can use {{prompt}} and {{model}}
  requestTemplate?: string;
  timeoutMs?: number;
  maxRetries?: number;
}

const SPECS_KEY = '@app:provider_specs_v1';
const KEY_PREFIX = '@app:provider_key:'; // SecureStore key prefix

export async function listProviderSpecs(): Promise<ProviderSpec[]> {
  const raw = await AsyncStorage.getItem(SPECS_KEY);
  return raw ? JSON.parse(raw) : [];
}

export async function getProviderSpec(id: string): Promise<ProviderSpec | null> {
  const specs = await listProviderSpecs();
  return specs.find(s => s.id === id) ?? null;
}

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

// Secure storage for secret (full header values or apiKey)
export async function storeProviderSecret(providerId: string, secretKeyName: string, secretValue: string) {
  // we store a single combined blob per provider for simplicity
  // format: JSON { "<secretKeyName>": "<secretValue>" }
  const key = KEY_PREFIX + providerId;
  const existing = await SecureStore.getItemAsync(key);
  const obj = existing ? JSON.parse(existing) : {};
  obj[secretKeyName] = secretValue;
  await SecureStore.setItemAsync(key, JSON.stringify(obj));
}

export async function getProviderSecrets(providerId: string): Promise<Record<string,string> | null> {
  const key = KEY_PREFIX + providerId;
  const raw = await SecureStore.getItemAsync(key);
  return raw ? JSON.parse(raw) : null;
}

export async function removeProviderSpec(id: string) {
  const specs = await listProviderSpecs();
  const filtered = specs.filter(s => s.id !== id);
  await AsyncStorage.setItem(SPECS_KEY, JSON.stringify(filtered));
  await SecureStore.deleteItemAsync(KEY_PREFIX + id);
}
