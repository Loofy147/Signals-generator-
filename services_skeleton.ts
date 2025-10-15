/*
  services-skeleton.ts
  نوع الملف: TypeScript - هيكل خدمات رئيسية لتوليد إشارات التداول (skeleton)
  المحتوى: llmService, signalService, multiTimeframeService, playbookService, hooks/useSignalGenerator (skeleton), وأنواع أساسية
  ملاحظة: هذه سكليتون قابل للنسخ واللصق داخل المشروع. اكمل التكامل مع تفاصيل الطلب/البيانات داخل المشروع.
*/

// --------------------------
// types/signal.ts (embedded)
// --------------------------
export type SignalType = 'BUY' | 'SELL' | 'HOLD';

export interface RiskMetrics {
  stopLoss: number;
  takeProfit: number;
  riskRewardRatio: number;
  positionSizePercent: number; // 0-100
  maxDrawdownPercent?: number;
}

export interface TradingSignal {
  id: string;
  symbol: string; // e.g. BTCUSDT
  type: SignalType;
  confidence: number; // 0-100
  price: number; // entry price
  timestamp: number; // epoch ms
  strategy?: string;
  indicators?: Record<string, any>;
  riskMetrics: RiskMetrics;
  exchange?: string;
  status?: 'NEW' | 'PENDING' | 'CLOSED' | 'CANCELLED';
  reasoning?: string;
}

export interface SignalHistory {
  id: string;
  signal: TradingSignal;
  outcome: 'WIN' | 'LOSS' | 'PENDING' | 'CANCELLED';
  entryPrice: number;
  exitPrice?: number;
  pnl?: number;
  pnlPercent?: number;
  durationMs?: number;
  closedAt?: number;
  hitTarget?: 'TP' | 'SL' | 'MANUAL' | null;
}

// --------------------------
// services/llmService.ts
// --------------------------
export interface LLMSpec {
  id: string;
  name: string;
  endpoint: string;
  model: string;
  authHeaders?: Record<string, string>;
  requestTemplate?: Record<string, any>;
  responsePathCandidates?: string[]; // e.g. ["content","text","response","output"]
  timeoutMs?: number;
}

export interface LLMResponseParsed {
  providerId: string;
  raw: any;
  ok: boolean;
  parsed?: Partial<TradingSignal> & { reasoning?: string };
  error?: string;
}

// Minimal adapter interface
export interface LLMAdapter {
  spec: LLMSpec;
  call(prompt: string, options?: Record<string, any>): Promise<LLMResponseParsed>;
}

// Factory to create an adapter (simple skeleton)
export function createLLMAdapter(spec: LLMSpec): LLMAdapter {
  return {
    spec,
    async call(prompt: string, options = {}) {
      // Implement: build request body from spec.requestTemplate and prompt
      // Implement: fetch with timeout, retries, parse response using responsePathCandidates
      // For skeleton, return mock
      return {
        providerId: spec.id,
        raw: { mock: true },
        ok: true,
        parsed: {
          id: 'mock-'+Date.now(),
          symbol: 'BTCUSDT',
          type: 'HOLD',
          confidence: 50,
          price: 0,
          timestamp: Date.now(),
          riskMetrics: { stopLoss: 0, takeProfit: 0, riskRewardRatio: 0, positionSizePercent: 2 },
          reasoning: 'mock response',
        },
      };
    },
  };
}

// Helper: call multiple adapters in parallel
export async function callProvidersParallel(adapters: LLMAdapter[], prompt: string, timeoutMs = 8000) {
  const calls = adapters.map((a) => a.call(prompt));
  // NOTE: add circuit breaker / timeout control in real impl
  const results = await Promise.allSettled(calls);
  return results.map((r) => (r.status === 'fulfilled' ? r.value : { ok: false, error: (r as any).reason }));
}

// --------------------------
// services/multiTimeframeService.ts
// --------------------------
export interface Candle { t: number; open: number; high: number; low: number; close: number; volume: number; }

export type Timeframe = '1m'|'5m'|'15m'|'1h'|'4h'|'1d';

export interface TimeframeAnalysis {
  timeframe: Timeframe;
  lastCandle?: Candle;
  trend: 'BULLISH'|'BEARISH'|'NEUTRAL';
  volatility: number; // ATR-like
  support?: number[]; // levels
  resistance?: number[];
  volumeInfo?: { avg: number; last: number };
}

export async function fetchKlineData(symbol: string, timeframe: Timeframe, limit = 200): Promise<Candle[]> {
  // Implement: call Binance or configured exchange and normalize to Candle[]
  // Skeleton returns empty
  return [];
}

export function calculateSMA(values: number[], length: number) {
  if (values.length < length) return null;
  const slice = values.slice(values.length - length);
  const sum = slice.reduce((s, v) => s + v, 0);
  return sum / length;
}

export function analyzeTimeframe(candles: Candle[], timeframe: Timeframe): TimeframeAnalysis {
  // Implement real calculations: ATR, trend, S/R detection, volume analysis
  return {
    timeframe,
    lastCandle: candles[candles.length-1],
    trend: 'NEUTRAL',
    volatility: 0,
    support: [],
    resistance: [],
    volumeInfo: { avg: 0, last: 0 },
  };
}

export async function fetchMultiTimeframeData(symbol: string, timeframes: Timeframe[] = ['1m','5m','15m','1h','4h','1d']) {
  const res: Record<Timeframe, TimeframeAnalysis> = {} as any;
  for (const tf of timeframes) {
    const candles = await fetchKlineData(symbol, tf);
    res[tf] = analyzeTimeframe(candles, tf);
  }
  return res;
}

export function generateMultiTimeframeSummary(mtf: Record<Timeframe, TimeframeAnalysis>) {
  // Build compact textual summary for prompts
  const lines: string[] = [];
  for (const k of Object.keys(mtf) as Timeframe[]) {
    const a = mtf[k];
    lines.push(`${k}: ${a.trend} vol=${a.volatility} last=${a.lastCandle?.close ?? 'n/a'}`);
  }
  return lines.join('\n');
}

// --------------------------
// services/playbookService.ts
// --------------------------
import AsyncStorage from '@react-native-async-storage/async-storage';

const PLAYBOOK_KEY = '@app:playbook:v1';
const MAX_SIGNALS = 500;

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

export async function savePlaybook(list: SignalHistory[]) {
  const truncated = list.slice(-MAX_SIGNALS);
  await AsyncStorage.setItem(PLAYBOOK_KEY, JSON.stringify(truncated));
}

export async function addSignalToPlaybook(item: SignalHistory) {
  const current = await loadPlaybook();
  current.push(item);
  if (current.length > MAX_SIGNALS) current.splice(0, current.length - MAX_SIGNALS);
  await savePlaybook(current);
}

export async function updateSignalOutcome(id: string, update: Partial<SignalHistory>) {
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
  const total = list.length;
  const wins = list.filter((l) => l.outcome === 'WIN').length;
  const loss = list.filter((l) => l.outcome === 'LOSS').length;
  const winRate = total === 0 ? 0 : Math.round((wins/total)*10000)/100;
  // avg pnl
  const pnls = list.filter((l)=>typeof l.pnlPercent === 'number').map(l=>l.pnlPercent!);
  const avgPnl = pnls.length? pnls.reduce((a,b)=>a+b,0)/pnls.length : 0;
  return { total, wins, loss, winRate, avgPnl };
}

// --------------------------
// services/signalService.ts
// --------------------------
import { v4 as uuidv4 } from 'uuid';

export type AggregationMode = 'MAJORITY'|'WEIGHTED'|'FIRST';

export async function generateTradingSignal(
  symbol: string,
  adapters: LLMAdapter[],
  aggregation: AggregationMode = 'WEIGHTED',
  extraContext = ''
): Promise<{ final?: TradingSignal; providerResponses: LLMResponseParsed[] }>{
  // 1. Fetch multi-timeframe data and build prompt (caller can prefetch and pass in)
  // 2. Call providers in parallel
  // 3. Parse responses and validate schema
  // 4. Aggregate according to mode
  // 5. Return final signal and raw provider responses

  const prompt = `Generate trading signal for ${symbol}\n${extraContext}`;
  const rawResponses = await callProvidersParallel(adapters, prompt);

  // collect parsed signals
  const parsed = rawResponses.filter(r=>r && (r as any).ok && (r as any).parsed) as LLMResponseParsed[];

  // Simple aggregation skeleton: choose highest average confidence
  if (parsed.length === 0) {
    return { providerResponses: rawResponses as any };
  }

  // Weighted average example
  const votes: Record<string, {count:number; sumConf:number; signals:Partial<TradingSignal>[]}> = {};
  parsed.forEach(p=>{
    const s = p.parsed as Partial<TradingSignal>;
    const key = s.type || 'HOLD';
    if (!votes[key]) votes[key] = { count:0, sumConf:0, signals:[] };
    votes[key].count += 1;
    votes[key].sumConf += (s.confidence ?? 50);
    votes[key].signals.push(s);
  });

  // choose winner by highest (count * avgConf)
  let bestKey: string | null = null; let bestScore = -Infinity;
  for (const k of Object.keys(votes)){
    const v = votes[k];
    const avgConf = v.sumConf / v.count;
    const score = v.count * avgConf;
    if (score > bestScore) { bestScore = score; bestKey = k; }
  }

  const winner = votes[bestKey!];
  // average numeric fields
  const avg = (arr: number[]) => arr.length? arr.reduce((a,b)=>a+b,0)/arr.length : 0;
  const entryPrices = winner.signals.map(s=>s.price ?? 0).filter(x=>x>0);
  const stopLosses = winner.signals.map(s=>s.riskMetrics?.stopLoss ?? 0).filter(x=>x>0);
  const takeProfits = winner.signals.map(s=>s.riskMetrics?.takeProfit ?? 0).filter(x=>x>0);
  const confidences = winner.signals.map(s=>s.confidence ?? 50);

  const final: TradingSignal = {
    id: uuidv4(),
    symbol,
    type: bestKey as SignalType,
    confidence: Math.round(avg(confidences)),
    price: Math.round(avg(entryPrices) * 100) / 100 || (winner.signals[0].price || 0),
    timestamp: Date.now(),
    strategy: 'multi-llm-consensus',
    indicators: {},
    riskMetrics: {
      stopLoss: Math.round(avg(stopLosses) * 100) / 100 || 0,
      takeProfit: Math.round(avg(takeProfits) * 100) / 100 || 0,
      riskRewardRatio: 0,
      positionSizePercent: 2,
    },
    exchange: 'BINANCE',
    status: 'NEW',
    reasoning: winner.signals.map(s=>s.reasoning||'').join('\n---\n'),
  };

  // compute riskRewardRatio if possible
  if (final.riskMetrics.stopLoss && final.riskMetrics.takeProfit && final.price) {
    const risk = Math.abs(final.price - final.riskMetrics.stopLoss);
    const reward = Math.abs(final.riskMetrics.takeProfit - final.price);
    final.riskMetrics.riskRewardRatio = risk>0? Math.round((reward / risk) * 100)/100 : 0;
  }

  return { final, providerResponses: rawResponses as any };
}

// --------------------------
// hooks/useSignalGenerator.ts (skeleton)
// --------------------------
import { useState, useCallback } from 'react';

export function useSignalGenerator() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSignal, setLastSignal] = useState<TradingSignal | null>(null);

  const generate = useCallback(async (symbol: string, adapters: LLMAdapter[], aggregation: AggregationMode = 'WEIGHTED') => {
    setLoading(true); setError(null);
    try {
      const { final, providerResponses } = await generateTradingSignal(symbol, adapters, aggregation);
      if (final) setLastSignal(final);
      setLoading(false);
      return { final, providerResponses };
    } catch (err: any) {
      setError(String(err));
      setLoading(false);
      return { error: String(err) };
    }
  }, []);

  return { loading, error, lastSignal, generate };
}

/*
  نهاية الملف - ملاحظة:
  - هذه نسخة مبسطة جداً للسكليتون. استكمل الربط الحقيقي مع شبكات، مفاتيح، وفحص الأخطاء، وتوحيد تنسيقات الاستجابة.
  - يمكنني توليد ملفات منفصلة لكل service أو تحويلها إلى ADR تفصيلي أو إنشاء اختبارات unit إذا رغبت.
*/
