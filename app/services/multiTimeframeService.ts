/**
 * @file Fetches and analyzes multi-timeframe market data from Binance.
 */
import { fetchWithTimeout } from './_utils_helpers';
import { Candle, Timeframe, TimeframeAnalysis } from '../types';
import { config } from '../config';

/**
 * Maps a timeframe to a Binance API interval string.
 * @param {Timeframe} tf The timeframe to map.
 * @returns {string} The corresponding Binance API interval string.
 */
function intervalMap(tf: Timeframe): string {
  return tf; // 1m, 5m, 15m, 1h, 4h, 1d are valid for Binance
}

/**
 * Fetches Kline (candlestick) data from the Binance API.
 * @param {string} symbol The trading symbol, e.g., 'BTCUSDT'.
 * @param {Timeframe} timeframe The timeframe for the Kline data.
 * @param {number} [limit=200] The number of candles to fetch.
 * @returns {Promise<Candle[]>} A promise that resolves to an array of candles.
 */
export async function fetchKlineData(symbol: string, timeframe: Timeframe, limit = 200): Promise<Candle[]> {
  const interval = intervalMap(timeframe);
  const url = `${config.api.binanceBaseUrl}/klines?symbol=${symbol.toUpperCase()}&interval=${interval}&limit=${limit}`;
  const res = await fetchWithTimeout(url, {}, 8000);
  if (!res.ok) throw new Error(`Binance Klines fetch failed: ${res.status}`);
  const data = await res.json();
  return data.map((d: any) => ({
    t: d[0], open: Number(d[1]), high: Number(d[2]), low: Number(d[3]), close: Number(d[4]), volume: Number(d[5])
  }));
}

/**
 * Calculates the Average True Range (ATR) for a series of candles.
 * @param {Candle[]} candles An array of candles.
 * @param {number} [period=14] The period over which to calculate the ATR.
 * @returns {number} The calculated ATR.
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
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

/**
 * Calculates the Simple Moving Average (SMA) for a series of candles.
 * @param {Candle[]} candles An array of candles.
 * @param {number} [length=50] The length of the SMA.
 * @returns {number | null} The calculated SMA, or null if there is not enough data.
 */
export function calculateSMAFromCandles(candles: Candle[], length = 50): number | null {
  const closes = candles.map(c => c.close);
  if (closes.length < length) return null;
  const slice = closes.slice(-length);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

/**
 * Analyzes a single timeframe of market data.
 * @param {Candle[]} candles An array of candles for the timeframe.
 * @param {Timeframe} timeframe The timeframe being analyzed.
 * @returns {TimeframeAnalysis} An object containing the analysis results.
 */
export function analyzeTimeframe(candles: Candle[], timeframe: Timeframe): TimeframeAnalysis {
  const last = candles[candles.length - 1];
  const atr = calculateATR(candles, 14);
  const sma50 = calculateSMAFromCandles(candles, 50);
  const sma200 = calculateSMAFromCandles(candles, 200);
  let trend: TimeframeAnalysis['trend'] = 'NEUTRAL';
  if (sma50 && sma200) trend = sma50 > sma200 ? 'BULLISH' : 'BEARISH';
  const closes = candles.map(c => c.close).slice(-50);
  const support = Math.min(...closes);
  const resistance = Math.max(...closes);
  const volAvg = candles.slice(-50).reduce((a, b) => a + b.volume, 0) / Math.min(50, candles.length);
  return {
    timeframe, lastCandle: last, trend, volatility: atr, support: [support],
    resistance: [resistance], volumeInfo: { avg: volAvg, last: last.volume }
  };
}

/**
 * Fetches and analyzes market data for multiple timeframes.
 * @param {string} symbol The trading symbol, e.g., 'BTCUSDT'.
 * @param {Timeframe[]} [timeframes=['1m', '5m', '15m', '1h', '4h', '1d']] An array of timeframes to analyze.
 * @returns {Promise<Record<Timeframe, TimeframeAnalysis>>} A promise that resolves to a record of timeframe analyses.
 */
export async function fetchMultiTimeframeData(
  symbol: string,
  timeframes: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1d']
): Promise<Record<Timeframe, TimeframeAnalysis>> {
  const analyses = await Promise.all(
    timeframes.map(async tf => {
      try {
        const candles = await fetchKlineData(symbol, tf);
        return [tf, analyzeTimeframe(candles, tf)];
      } catch (err) {
        return [tf, { timeframe: tf, trend: 'NEUTRAL', volatility: 0 }];
      }
    })
  );
  return Object.fromEntries(analyses) as Record<Timeframe, TimeframeAnalysis>;
}

/**
 * Generates a human-readable summary of the multi-timeframe analysis.
 * @param {Record<Timeframe, TimeframeAnalysis>} mtf A record of timeframe analyses.
 * @returns {string} A string containing the summary.
 */
export function generateMultiTimeframeSummary(mtf: Record<Timeframe, TimeframeAnalysis>): string {
  return (Object.keys(mtf) as Timeframe[])
    .map(tf => {
      const a = mtf[tf];
      if (!a || !a.lastCandle) return `${tf}: Data unavailable`;
      return `${tf}: ${a.trend} | last=${a.lastCandle.close} | ATR=${(a.volatility || 0).toFixed(2)}`;
    })
    .join('\n');
}
