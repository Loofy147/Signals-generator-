/**
 * @file Core service for generating and aggregating trading signals using dynamic providers.
 */
import { v4 as uuidv4 } from 'uuid';
import { fetchMultiTimeframeData, generateMultiTimeframeSummary, Timeframe, TimeframeAnalysis } from './multiTimeframeService';
import { buildAdapterFromSpec, LLMResponseParsed } from './llmService';
import { addSignalToPlaybook, findRelevantSignals, formatSignalsForPrompt } from './playbookService';
import { SignalHistory, SignalType, TradingSignal } from '../types';
import { ProviderSpec } from '../utils/providerStore';

/**
 * The aggregation mode for combining signals from multiple providers.
 * @typedef {'MAJORITY' | 'WEIGHTED' | 'FIRST'} AggregationMode
 */
export type AggregationMode = 'MAJORITY' | 'WEIGHTED' | 'FIRST';

/**
 * Generates a trading signal by querying multiple LLM providers and aggregating their responses.
 * @param {string} symbol The trading symbol, e.g., 'BTCUSDT'.
 * @param {ProviderSpec[]} providerSpecs An array of provider specifications.
 * @param {AggregationMode} [aggregation='WEIGHTED'] The method for aggregating signals.
 * @param {object} [options] - Additional options for signal generation.
 * @param {number} [options.positionRiskPercent] The percentage of the portfolio to risk on the trade.
 * @param {string} [options.extraContext] - Extra context to include in the prompt.
 * @param {Timeframe[]} [options.timeframes] - The timeframes to analyze.
 * @returns {Promise<{final?: TradingSignal, providerResponses: LLMResponseParsed[], mtf?: Record<Timeframe, TimeframeAnalysis>}>} A promise that resolves to an object containing the final signal, the responses from each provider, and the multi-timeframe analysis.
 */
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

  // Retrieve and format relevant historical signals.
  const relevantSignals = await findRelevantSignals(symbol, mtf);
  const examplesSummary = formatSignalsForPrompt(relevantSignals);

  const prompt =
    `Symbol: ${symbol}\n\n## Current Market Analysis\n${mtfSummary}\n\n` +
    `## Relevant Past Examples\n${examplesSummary}\n\n` +
    `## Instruction\nBased on the analysis and past examples, generate a structured JSON trading signal ` +
    `with fields: type (BUY|SELL|HOLD), confidence (0-100), price (number), stopLoss (number), takeProfit (number), and reasoning (string).`;

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
