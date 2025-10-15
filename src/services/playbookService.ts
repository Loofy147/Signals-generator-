/**
 * @file Manages the storage and retrieval of trading signal history (the "playbook").
 *
 * This service uses AsyncStorage to store the list of past signals and their outcomes,
 * and SecureStore to handle sensitive data like provider API keys. This allows for

 * performance tracking and analysis over time.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import type { SignalHistory } from '../types/signal';

// --------------------------
// Constants
// --------------------------

const PLAYBOOK_KEY = '@app:playbook:v1';
const PROVIDER_KEYS_PREFIX = '@app:provider_key:';
const MAX_SIGNALS = 500; // The maximum number of signal histories to store.

// --------------------------
// Secure Key Storage
// --------------------------

/**
 * Securely stores an API key for a given provider.
 * @param providerId The unique identifier of the provider (e.g., "openai").
 * @param keyValue The API key to store.
 * @returns A promise that resolves when the key is stored.
 */
export async function storeProviderKey(providerId: string, keyValue: string) {
  return await SecureStore.setItemAsync(PROVIDER_KEYS_PREFIX + providerId, keyValue, {
    keychainAccessible: SecureStore.ALWAYS,
  });
}

/**
 * Retrieves a securely stored API key for a provider.
 * @param providerId The ID of the provider.
 * @returns A promise that resolves with the API key or `null` if not found.
 */
export async function getProviderKey(providerId: string) {
  return await SecureStore.getItemAsync(PROVIDER_KEYS_PREFIX + providerId);
}

/**
 * Deletes a securely stored API key for a provider.
 * @param providerId The ID of the provider.
 * @returns A promise that resolves when the key is deleted.
 */
export async function removeProviderKey(providerId: string) {
  return await SecureStore.deleteItemAsync(PROVIDER_KEYS_PREFIX + providerId);
}

// --------------------------
// Playbook Management
// --------------------------

/**
 * Loads the entire signal history from AsyncStorage.
 * @returns A promise that resolves with an array of `SignalHistory` objects.
 */
export async function loadPlaybook(): Promise<SignalHistory[]> {
  try {
    const raw = await AsyncStorage.getItem(PLAYBOOK_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SignalHistory[];
  } catch (err) {
    console.warn('loadPlaybook error', err);
    return [];
  }
}

/**
 * Saves a list of signal histories to AsyncStorage.
 * This will truncate the list if it exceeds `MAX_SIGNALS`.
 * @param list The array of `SignalHistory` objects to save.
 */
export async function savePlaybook(list: SignalHistory[]) {
  const truncated = list.slice(-MAX_SIGNALS);
  await AsyncStorage.setItem(PLAYBOOK_KEY, JSON.stringify(truncated));
}

/**
 * Adds a new signal history item to the playbook.
 * @param item The `SignalHistory` item to add.
 */
export async function addSignalToPlaybook(item: SignalHistory) {
  const current = await loadPlaybook();
  current.push(item);
  await savePlaybook(current); // savePlaybook handles truncation
}

/**
 * Updates a specific signal in the playbook with new information (e.g., outcome).
 * @param id The ID of the signal to update.
 * @param update A partial `SignalHistory` object with the fields to update.
 * @returns A promise that resolves with `true` if the update was successful, `false` otherwise.
 */
export async function updateSignalOutcome(id: string, update: Partial<SignalHistory>): Promise<boolean> {
  const list = await loadPlaybook();
  const idx = list.findIndex((s) => s.id === id);
  if (idx === -1) return false;
  list[idx] = { ...list[idx], ...update };
  await savePlaybook(list);
  return true;
}

/**
 * Deletes the entire playbook from storage.
 */
export async function clearPlaybook() {
  await AsyncStorage.removeItem(PLAYBOOK_KEY);
}

/**
 * Generates a summary of the playbook's performance.
 * @returns An object containing performance metrics like total signals, wins, losses, win rate, etc.
 */
export async function getPlaybookSummary() {
  const list = await loadPlaybook();
  const total = list.length;
  const wins = list.filter((l) => l.outcome === 'WIN').length;
  const loss = list.filter((l) => l.outcome === 'LOSS').length;
  const winRate = total === 0 ? 0 : Math.round((wins / total) * 10000) / 100;
  const pnls = list.filter((l) => typeof l.pnlPercent === 'number').map((l) => l.pnlPercent!);
  const avgPnl = pnls.length ? pnls.reduce((a, b) => a + b, 0) / pnls.length : 0;
  const timeframeCounts: Record<string, number> = {};
  list.forEach((l) => {
    const tf = l.signal?.strategy || 'unknown';
    timeframeCounts[tf] = (timeframeCounts[tf] || 0) + 1;
  });
  const bestStrategy = Object.keys(timeframeCounts).sort((a, b) => timeframeCounts[b] - timeframeCounts[a])[0] || null;

  return { total, wins, loss, winRate, avgPnl, bestStrategy };
}
