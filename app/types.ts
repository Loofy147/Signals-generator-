/**
 * @file Defines the core data structures and types used throughout the trading signal application.
 */

export type SignalType = 'BUY' | 'SELL' | 'HOLD';

export interface RiskMetrics {
  stopLoss: number;
  takeProfit: number;
  riskRewardRatio: number;
  positionSizePercent: number;
  maxDrawdownPercent?: number;
}

export interface TradingSignal {
  id: string;
  symbol: string;
  type: SignalType;
  confidence: number;
  price: number;
  timestamp: number;
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

// From llmService
export interface LLMResponseParsed {
  providerId: string;
  raw: any;
  ok: boolean;
  parsed?: Partial<TradingSignal> & { reasoning?: string };
  error?: string;
}

// From multiTimeframeService
export interface Candle {
  t: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
export type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';
export interface TimeframeAnalysis {
  timeframe: Timeframe;
  lastCandle?: Candle;
  trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  volatility: number;
  support?: number[];
  resistance?: number[];
  volumeInfo?: { avg: number; last: number };
}

// From providerHealthStore
export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';
export interface ProviderHealth {
  providerId: string;
  state: CircuitState;
  failureCount: number;
  lastAttempt: number; // Timestamp
}
