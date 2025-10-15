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
