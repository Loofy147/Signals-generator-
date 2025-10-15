/**
 * @file Fetches and analyzes multi-timeframe market data from Binance.
 *
 * This service provides functions to retrieve candlestick (Kline) data, calculate
 * technical indicators like ATR and SMA, and generate a summary of market trends
 * across different timeframes (e.g., 1m, 5m, 1h, 1d).
 */

import { fetchWithTimeout } from '../utils/fetch';

// --------------------------
// --------------------------
// Interfaces and Types
// --------------------------

/**
 * Represents a single candlestick in a chart.
 */
export interface Candle {
  /** The timestamp of the candle's opening time (epoch ms). */
  t: number;
  /** The opening price. */
  open: number;
  /** The highest price during the candle's timeframe. */
  high: number;
  /** The lowest price during the candle's timeframe. */
  low: number;
  /** The closing price. */
  close: number;
  /** The trading volume during the candle's timeframe. */
  volume: number;
}

/**
 * Defines the supported timeframes for market analysis.
 */
export type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

/**
 * Contains the analysis results for a single timeframe.
 */
export interface TimeframeAnalysis {
  /** The timeframe being analyzed (e.g., "1h"). */
  timeframe: Timeframe;
  /** The most recent candle in the dataset. */
  lastCandle?: Candle;
  /** The identified trend (BULLISH, BEARISH, or NEUTRAL). */
  trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  /** The calculated volatility, typically using ATR. */
  volatility: number;
  /** Identified support levels. */
  support?: number[];
  /** Identified resistance levels. */
  resistance?: number[];
  /** Information about the trading volume. */
  volumeInfo?: { avg: number; last: number };
}

// --------------------------
// Service Implementation
// --------------------------

const BINANCE_BASE = 'https://api.binance.com/api/v3';

/**
 * Maps the app's Timeframe type to the corresponding Binance API interval string.
 * @param tf The timeframe.
 * @returns The Binance API interval string.
 */
function intervalMap(tf: Timeframe) {
  switch (tf) {
    case '1m': return '1m';
    case '5m': return '5m';
    case '15m': return '15m';
    case '1h': return '1h';
    case '4h': return '4h';
    case '1d': return '1d';
    default: return '1m';
  }
}

/**
 * Fetches Kline (candlestick) data from the Binance API.
 * @param symbol The trading symbol (e.g., "BTCUSDT").
 * @param timeframe The chart timeframe (e.g., "4h").
 * @param limit The number of candles to fetch.
 * @returns A promise that resolves with an array of `Candle` objects.
 */
export async function fetchKlineData(symbol: string, timeframe: Timeframe, limit = 200): Promise<Candle[]> {
  const interval = intervalMap(timeframe);
  const url = `${BINANCE_BASE}/klines?symbol=${symbol.toUpperCase()}&interval=${interval}&limit=${limit}`;
  const res = await fetchWithTimeout(url, {}, 8000);
  if (!res.ok) throw new Error(`Binance Klines fetch failed: ${res.status}`);
  const data = await res.json();
  return data.map((d: any) => ({
    t: d[0],
    open: Number(d[1]),
    high: Number(d[2]),
    low: Number(d[3]),
    close: Number(d[4]),
    volume: Number(d[5]),
  }));
}

/**
 * Calculates the Average True Range (ATR) for a given set of candles.
 * @param candles An array of `Candle` objects.
 * @param period The number of periods to use for the calculation (default is 14).
 * @returns The calculated ATR value.
 */
export function calculateATR(candles: Candle[], period = 14): number {
  if (candles.length < period + 1) return 0;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const cur = candles[i];
    const prev = candles[i - 1];
    const tr = Math.max(cur.high - cur.low, Math.abs(cur.high - prev.close), Math.abs(cur.low - prev.close));
    trs.push(tr);
  }
  const slice = trs.slice(-period);
  const sum = slice.reduce((a, b) => a + b, 0);
  return sum / slice.length;
}

/**
 * Calculates the Simple Moving Average (SMA) from a set of candles.
 * @param candles An array of `Candle` objects.
 * @param length The number of periods for the SMA (default is 50).
 * @returns The calculated SMA value or `null` if there is not enough data.
 */
export function calculateSMAFromCandles(candles: Candle[], length = 50): number | null {
  const closes = candles.map((c) => c.close);
  if (closes.length < length) return null;
  const slice = closes.slice(-length);
  const s = slice.reduce((a, b) => a + b, 0) / slice.length;
  return s;
}

/**
 * Analyzes a set of candles for a given timeframe to determine trend, volatility, etc.
 * @param candles The candle data to analyze.
 * @param timeframe The timeframe of the data.
 * @returns A `TimeframeAnalysis` object with the results.
 */
export function analyzeTimeframe(candles: Candle[], timeframe: Timeframe): TimeframeAnalysis {
  const last = candles[candles.length - 1];
  const atr = calculateATR(candles, 14);
  const sma50 = calculateSMAFromCandles(candles, 50);
  const sma200 = calculateSMAFromCandles(candles, 200);
  let trend: TimeframeAnalysis['trend'] = 'NEUTRAL';
  if (sma50 && sma200) trend = sma50 > sma200 ? 'BULLISH' : 'BEARISH';
  const closes = candles.map((c) => c.close);
  const window = closes.slice(-50);
  const support = Math.min(...window);
  const resistance = Math.max(...window);
  const volAvg = candles.slice(-50).reduce((a, b) => a + b.volume, 0) / Math.min(50, candles.length);
  return {
    timeframe,
    lastCandle: last,
    trend,
    volatility: atr,
    support: [support],
    resistance: [resistance],
    volumeInfo: { avg: volAvg, last: last.volume },
  };
}

/**
 * Fetches and analyzes data for multiple timeframes in parallel.
 * @param symbol The trading symbol (e.g., "BTCUSDT").
 * @param timeframes An array of timeframes to analyze.
 * @returns A promise that resolves with a record of `TimeframeAnalysis` objects, keyed by timeframe.
 */
export async function fetchMultiTimeframeData(
  symbol: string,
  timeframes: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1d']
): Promise<Record<Timeframe, TimeframeAnalysis>> {
  const out: Partial<Record<Timeframe, TimeframeAnalysis>> = {};
  for (const tf of timeframes) {
    try {
      const candles = await fetchKlineData(symbol, tf);
      out[tf] = analyzeTimeframe(candles, tf);
    } catch (err) {
      out[tf] = { timeframe: tf, trend: 'NEUTRAL', volatility: 0 } as any;
    }
  }
  return out as Record<Timeframe, TimeframeAnalysis>;
}

/**
 * Generates a concise summary string from multi-timeframe analysis data.
 * This is useful for providing context in prompts for LLMs.
 * @param mtf The multi-timeframe analysis data.
 * @returns A formatted string summarizing the analysis.
 */
export function generateMultiTimeframeSummary(mtf: Record<Timeframe, TimeframeAnalysis>): string {
  const lines: string[] = [];
  for (const tf of Object.keys(mtf) as Timeframe[]) {
    const a = mtf[tf];
    lines.push(`${tf}: ${a.trend} | last=${a.lastCandle?.close ?? 'n/a'} | ATR=${Math.round((a.volatility || 0) * 100) / 100}`);
  }
  return lines.join('\n');
}
