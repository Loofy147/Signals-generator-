/**
 * @file Manages the storage and retrieval of trading signal history (the "playbook").
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

// NOTE: Types would normally be in a central `types.ts` file.
export interface SignalHistory {
  id: string;
  // Define other fields as needed from the full spec
}

const PLAYBOOK_KEY = '@app:playbook:v1';
const MAX_SIGNALS = 500;

export async function loadPlaybook(): Promise<SignalHistory[]> {
  try {
    const raw = await AsyncStorage.getItem(PLAYBOOK_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.warn('loadPlaybook error', err);
    return [];
  }
}

export async function savePlaybook(list: SignalHistory[]) {
  const truncated = list.slice(-MAX_SIGNALS);
  await AsyncStorage.setItem(PLAYBOOK_KEY, JSON.stringify(truncated));
}

export async function addSignalToPlaybook(item: SignalHistory) {
  const current = await loadPlaybook();
  current.push(item);
  await savePlaybook(current);
}

export async function updateSignalOutcome(id: string, update: Partial<SignalHistory>): Promise<boolean> {
  const list = await loadPlaybook();
  const idx = list.findIndex((s) => s.id === id);
  if (idx === -1) return false;
  list[idx] = { ...list[idx], ...update };
  await savePlaybook(list);
  return true;
}

export async function clearPlaybook() {
  await AsyncStorage.removeItem(PLAYBOOK_KEY);
}

export async function getPlaybookSummary() {
  const list = await loadPlaybook();
  // NOTE: This is a simplified summary. The full implementation would have more detailed stats.
  const total = list.length;
  return { total };
}
