/**
 * @file Core service for generating and aggregating trading signals using dynamic providers.
 */
import { v4 as uuidv4 } from 'uuid';
import { fetchMultiTimeframeData, generateMultiTimeframeSummary, Timeframe, TimeframeAnalysis } from './multiTimeframeService';
import { buildAdapterFromSpec, LLMResponseParsed } from './llmService';
import { addSignalToPlaybook } from './playbookService';
import { SignalHistory, SignalType, TradingSignal } from '../types';
import { ProviderSpec } from '../utils/providerStore';

export type AggregationMode = 'MAJORITY' | 'WEIGHTED' | 'FIRST';

export async function generateTradingSignal(
  symbol: string,
  providerSpecs: ProviderSpec[],
  aggregation: AggregationMode = 'WEIGHTED',
  options: {
    positionRiskPercent?: number;
    extraContext?: string;
    timeframes?: Timeframe[];
  } = {}
): Promise<{
  final?: TradingSignal;
  providerResponses: LLMResponseParsed[];
  mtf?: Record<Timeframe, TimeframeAnalysis>;
}> {
  const tfList = options.timeframes ?? ['1m', '5m', '15m', '1h', '4h', '1d'];
  const mtf = await fetchMultiTimeframeData(symbol, tfList);
  const mtfSummary = generateMultiTimeframeSummary(mtf);

  const prompt =
    `Symbol: ${symbol}\nMulti-timeframe summary:\n${mtfSummary}\n\n` +
    `Instruction: Generate a structured JSON trading signal with fields: type (BUY|SELL|HOLD), ` +
    `confidence (0-100), price (number), stopLoss (number), takeProfit (number), reasoning (string).`;

  const adapters = providerSpecs.map(buildAdapterFromSpec);
  const providerResponses = await Promise.all(adapters.map(a => a.call(prompt)));
  const parsed = providerResponses.filter((r) => r.ok && r.parsed) as LLMResponseParsed[];

  if (parsed.length === 0) {
    return { providerResponses, mtf };
  }

  const groups: Record<string, { items: LLMResponseParsed[]; avgConf: number }> = {};
  parsed.forEach((p) => {
    const t = (p.parsed!.type || 'HOLD') as SignalType;
    groups[t] = groups[t] || { items: [], avgConf: 0 };
    groups[t].items.push(p);
    groups[t].avgConf = groups[t].items.reduce((s, it) => s + (it.parsed!.confidence ?? 50), 0) / groups[t].items.length;
  });

  let winnerType: SignalType = 'HOLD';
  if (aggregation === 'MAJORITY') {
    winnerType = Object.keys(groups).sort((a, b) => groups[b].items.length - groups[a].items.length)[0] as SignalType;
  } else if (aggregation === 'WEIGHTED') {
    winnerType = Object.keys(groups).sort((a, b) => (groups[b].items.length * groups[b].avgConf) - (groups[a].items.length * groups[a].avgConf))[0] as SignalType;
  } else {
    winnerType = (parsed[0].parsed!.type as SignalType) || 'HOLD';
  }

  const winnerGroup = groups[winnerType];
  const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

  const entry = avg(winnerGroup.items.map(p => p.parsed!.price).filter(Number.isFinite));
  const stopLoss = avg(winnerGroup.items.map(p => p.parsed!['stopLoss']).filter(Number.isFinite));
  const takeProfit = avg(winnerGroup.items.map(p => p.parsed!['takeProfit']).filter(Number.isFinite));
  const confidence = Math.round(winnerGroup.avgConf);

  const final: TradingSignal = {
    id: uuidv4(),
    symbol,
    type: winnerType,
    confidence,
    price: entry,
    timestamp: Date.now(),
    strategy: 'dynamic-llm-consensus',
    indicators: { mtf },
    riskMetrics: {
      stopLoss,
      takeProfit,
      riskRewardRatio: 0,
      positionSizePercent: options.positionRiskPercent ?? 2,
    },
    reasoning: winnerGroup.items.map(p => p.parsed!.reasoning || 'No reasoning provided.').join('\n---\n'),
    status: 'NEW'
  };

  if (final.price && final.riskMetrics.stopLoss) {
    const risk = Math.abs(final.price - final.riskMetrics.stopLoss);
    const reward = Math.abs(final.riskMetrics.takeProfit - final.price);
    final.riskMetrics.riskRewardRatio = risk > 0 ? Math.round((reward / risk) * 100) / 100 : 0;
  }

  const history: SignalHistory = { id: final.id, signal: final, outcome: 'PENDING', entryPrice: final.price };
  await addSignalToPlaybook(history);

  return { final, providerResponses, mtf };
}
