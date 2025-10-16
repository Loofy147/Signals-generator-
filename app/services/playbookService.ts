/**
 * @file Manages the storage and retrieval of trading signal history (the "playbook").
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SignalHistory, Timeframe, TimeframeAnalysis } from '../types';
import { config } from '../config';

const PLAYBOOK_KEY = '@app:playbook:v1';

/**
 * Loads the playbook from AsyncStorage.
 * @returns {Promise<SignalHistory[]>} A promise that resolves to an array of signal history items.
 */
export async function loadPlaybook(): Promise<SignalHistory[]> {
  try {
    const raw = await AsyncStorage.getItem(PLAYBOOK_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.warn('loadPlaybook error', err);
    return [];
  }
}

/**
 * Saves the playbook to AsyncStorage.
 * @param {SignalHistory[]} list The array of signal history items to save.
 */
export async function savePlaybook(list: SignalHistory[]) {
  const truncated = list.slice(-config.playbook.maxSignalsToStore);
  await AsyncStorage.setItem(PLAYBOOK_KEY, JSON.stringify(truncated));
}

/**
 * Adds a new signal to the playbook.
 * @param {SignalHistory} item The signal history item to add.
 */
export async function addSignalToPlaybook(item: SignalHistory) {
  const current = await loadPlaybook();
  current.push(item);
  await savePlaybook(current);
}

/**
 * Updates the outcome of a signal in the playbook.
 * @param {string} id The ID of the signal to update.
 * @param {Partial<SignalHistory>} update An object containing the fields to update.
 * @returns {Promise<boolean>} A promise that resolves to true if the update was successful, false otherwise.
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
 * Clears the playbook from AsyncStorage.
 */
export async function clearPlaybook() {
  await AsyncStorage.removeItem(PLAYBOOK_KEY);
}

/**
 * Calculates a summary of the playbook's performance.
 * @returns {Promise<{total: number, wins: number, losses: number, winRate: number, avgPnl: number}>} A promise that resolves to an object containing the playbook summary.
 */
export async function getPlaybookSummary() {
  const list = await loadPlaybook();
  const total = list.length;
  const wins = list.filter((l) => l.outcome === 'WIN').length;
  const losses = list.filter((l) => l.outcome === 'LOSS').length;
  const winRate = total > 0 ? (wins / (wins + losses)) * 100 : 0;

  const pnlPercentages = list
    .map(l => l.pnlPercent)
    .filter((p): p is number => typeof p === 'number');

  const avgPnl = pnlPercentages.length > 0
    ? pnlPercentages.reduce((a, b) => a + b, 0) / pnlPercentages.length
    : 0;

  return {
    total,
    wins,
    losses,
    winRate: parseFloat(winRate.toFixed(2)),
    avgPnl: parseFloat(avgPnl.toFixed(2)),
  };
}

/**
 * Finds and ranks relevant historical signals from the playbook.
 * @param {string} symbol The trading symbol to match.
 * @param {Record<Timeframe, TimeframeAnalysis>} currentMtf The current multi-timeframe analysis data.
 * @param {number} [topN=3] The number of top signals to return.
 * @returns {Promise<SignalHistory[]>} A promise that resolves to a ranked list of the most relevant signal histories.
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
 * @param {SignalHistory[]} signals An array of `SignalHistory` objects.
 * @returns {string} A formatted string summarizing the signals.
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
