/**
 * @file Fetches and analyzes multi-timeframe market data from Binance.
 */
import { fetchWithTimeout } from './_utils_helpers';
import { Candle, Timeframe, TimeframeAnalysis } from '../types';

const BINANCE_BASE = 'https://api.binance.com/api/v3';

function intervalMap(tf: Timeframe) {
  return tf; // 1m, 5m, 15m, 1h, 4h, 1d are valid for Binance
}

export async function fetchKlineData(symbol: string, timeframe: Timeframe, limit = 200): Promise<Candle[]> {
  const interval = intervalMap(timeframe);
  const url = `${BINANCE_BASE}/klines?symbol=${symbol.toUpperCase()}&interval=${interval}&limit=${limit}`;
  const res = await fetchWithTimeout(url, {}, 8000);
  if (!res.ok) throw new Error(`Binance Klines fetch failed: ${res.status}`);
  const data = await res.json();
  return data.map((d: any) => ({
    t: d[0], open: Number(d[1]), high: Number(d[2]), low: Number(d[3]), close: Number(d[4]), volume: Number(d[5])
  }));
}

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

export function calculateSMAFromCandles(candles: Candle[], length = 50): number | null {
  const closes = candles.map(c => c.close);
  if (closes.length < length) return null;
  const slice = closes.slice(-length);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

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

export function generateMultiTimeframeSummary(mtf: Record<Timeframe, TimeframeAnalysis>): string {
  return (Object.keys(mtf) as Timeframe[])
    .map(tf => {
      const a = mtf[tf];
      if (!a || !a.lastCandle) return `${tf}: Data unavailable`;
      return `${tf}: ${a.trend} | last=${a.lastCandle.close} | ATR=${(a.volatility || 0).toFixed(2)}`;
    })
    .join('\n');
}
