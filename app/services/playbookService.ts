/**
 * @file Manages the storage and retrieval of trading signal history (the "playbook").
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { SignalHistory } from '../types';
import { Timeframe, TimeframeAnalysis } from './multiTimeframeService';

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

/**
 * Finds and ranks relevant historical signals from the playbook.
 * @param symbol The trading symbol to match.
 * @param currentMtf The current multi-timeframe analysis data.
 * @param topN The number of top signals to return.
 * @returns A ranked list of the most relevant signal histories.
 */
export async function findRelevantSignals(
  symbol: string,
  currentMtf: Record<Timeframe, TimeframeAnalysis>,
  topN = 3
): Promise<SignalHistory[]> {
  const allSignals = await loadPlaybook();

  // Filter for the same symbol and signals that have an outcome.
  const relevantSignals = allSignals.filter(
    (s) => s.signal.symbol === symbol && s.outcome !== 'PENDING' && s.signal.indicators?.mtf
  );

  if (relevantSignals.length === 0) {
    return [];
  }

  // Define a scoring function to rank signals by relevance.
  const scoreSignal = (signal: SignalHistory): number => {
    let score = 0;
    const historicalMtf = signal.signal.indicators?.mtf as Record<Timeframe, TimeframeAnalysis>;

    // Compare trends on key timeframes (e.g., 1h, 4h, 1d)
    const keyTimeframes: Timeframe[] = ['1h', '4h', '1d'];
    for (const tf of keyTimeframes) {
      if (currentMtf[tf] && historicalMtf[tf] && currentMtf[tf].trend === historicalMtf[tf].trend) {
        score += 1; // Add 1 point for each matching trend
      }
    }

    // A more advanced scoring could also consider volatility, recency, etc.
    return score;
  };

  // Score and sort the signals.
  const scoredSignals = relevantSignals.map((signal) => ({
    signal,
    score: scoreSignal(signal),
  }));

  // Sort by score (descending), and then by recency (descending) as a tie-breaker.
  scoredSignals.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return b.signal.signal.timestamp - a.signal.signal.timestamp;
  });

  return scoredSignals.slice(0, topN).map(s => s.signal);
}

/**
 * Formats a list of historical signals into a concise string for an LLM prompt.
 * @param signals An array of `SignalHistory` objects.
 * @returns A formatted string summarizing the signals.
 */
export function formatSignalsForPrompt(signals: SignalHistory[]): string {
  if (signals.length === 0) {
    return "No relevant past examples found.";
  }

  return signals
    .map((s) => {
      const { signal, outcome, pnlPercent } = s;
      const mtf = signal.indicators?.mtf as Record<Timeframe, TimeframeAnalysis> | undefined;
      const keyTimeframes: Timeframe[] = ['1h', '4h', '1d'];
      const trendSummary = mtf
        ? keyTimeframes.map(tf => `${tf}:${mtf[tf]?.trend || 'N/A'}`).join(', ')
        : 'N/A';

      return (
        `- Date: ${new Date(signal.timestamp).toISOString().split('T')[0]}\n` +
        `  - Signal: ${signal.type} @ ${signal.price}\n` +
        `  - Market Context (Trends): ${trendSummary}\n` +
        `  - Outcome: ${outcome} (${(pnlPercent ?? 0).toFixed(2)}% PnL)`
      );
    })
    .join('\n\n');
}
