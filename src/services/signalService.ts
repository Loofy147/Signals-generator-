/**
 * @file Core service for generating and aggregating trading signals.
 *
 * This service orchestrates the other services to produce a final trading signal.
 * It fetches multi-timeframe market data, calls multiple LLM providers for analysis,
 * aggregates their responses, calculates risk metrics, and stores the final signal
 * in the playbook.
 */

import { v4 as uuidv4 } from 'uuid';
import {
  fetchMultiTimeframeData,
  generateMultiTimeframeSummary,
  Timeframe,
  TimeframeAnalysis,
} from './multiTimeframeService';
import { callProvidersParallel, createLLMAdapter, LLMResponseParsed, extractTextFromObject } from './llmService';
import { addSignalToPlaybook } from './playbookService';
import { SignalHistory, SignalType, TradingSignal } from '../types/signal';

// --------------------------
// Types and Enums
// --------------------------

/**
 * Defines the available modes for aggregating signals from multiple providers.
 * - `MAJORITY`: The signal type with the most votes wins.
 * - `WEIGHTED`: Votes are weighted by the provider's confidence level.
 * - `FIRST`: The first valid signal received is used.
 */
export type AggregationMode = 'MAJORITY' | 'WEIGHTED' | 'FIRST';

// --------------------------
// Core Signal Generation
// --------------------------

/**
 * Generates a trading signal by orchestrating market data analysis and LLM providers.
 *
 * @param symbol The trading symbol (e.g., "BTCUSDT").
 * @param adapters An array of configured LLM adapters.
 * @param aggregation The mode to use for aggregating LLM responses.
 * @param options Additional options for signal generation.
 * @returns A promise that resolves with the final signal, provider responses, and market data.
 */
export async function generateTradingSignal(
  symbol: string,
  adapters: ReturnType<typeof createLLMAdapter>[],
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
  // 1. Fetch and summarize multi-timeframe market data
  const tfList = options.timeframes ?? ['1m', '5m', '15m', '1h', '4h', '1d'];
  const mtf = await fetchMultiTimeframeData(symbol, tfList);
  const mtfSummary = generateMultiTimeframeSummary(mtf);

  // 2. Construct the prompt for the LLMs
  const prompt =
    `Symbol: ${symbol}\nMulti-timeframe summary:\n${mtfSummary}\n\n` +
    `Instruction: Generate a structured JSON trading signal with fields: type (BUY|SELL|HOLD), ` +
    `confidence (0-100), entry (number), stopLoss (number), takeProfit (number), reasoning (string). ` +
    `Provide numbers in plain digits.` +
    (options.extraContext ? `\n\nExtra: ${options.extraContext}` : '');

  // 3. Call LLM providers in parallel
  const providerResponses = await callProvidersParallel(adapters, prompt, {});
  const parsed = providerResponses.filter((r) => r.ok && r.parsed) as LLMResponseParsed[];

  if (parsed.length === 0) {
    return { providerResponses, mtf };
  }

  // 4. Aggregate the parsed responses
  const groups: Record<string, { items: LLMResponseParsed[]; avgConf: number }> = {};
  parsed.forEach((p) => {
    const t = (p.parsed!.type || 'HOLD') as SignalType;
    groups[t] = groups[t] || { items: [], avgConf: 0 };
    groups[t].items.push(p);
  });

  for (const k of Object.keys(groups)) {
    const arr = groups[k].items;
    groups[k].avgConf = arr.reduce((s, it) => s + (it.parsed!.confidence ?? 50), 0) / arr.length;
  }

  let winnerType: SignalType = 'HOLD';
  if (aggregation === 'MAJORITY') {
    winnerType = Object.keys(groups).sort((a, b) => groups[b].items.length - groups[a].items.length)[0] as SignalType;
  } else if (aggregation === 'WEIGHTED') {
    winnerType = Object.keys(groups).sort(
      (a, b) => groups[b].items.length * groups[b].avgConf - groups[a].items.length * groups[a].avgConf
    )[0] as SignalType;
  } else {
    winnerType = parsed[0].parsed!.type as SignalType;
  }

  // 5. Consolidate the winning signal's data
  const winnerGroup = groups[winnerType];
  const flatten = (path: (p: LLMResponseParsed) => number | undefined) =>
    winnerGroup.items.map(path).filter((x) => typeof x === 'number') as number[];
  const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

  const entryArr = flatten((p) => p.parsed!.price);
  const slArr = flatten((p) => p.parsed!.riskMetrics?.stopLoss ?? p.parsed!['stopLoss'] ?? undefined);
  const tpArr = flatten((p) => p.parsed!.riskMetrics?.takeProfit ?? p.parsed!['takeProfit'] ?? undefined);
  const confArr = winnerGroup.items.map((p) => p.parsed!.confidence ?? 50);

  const entry = Math.round((avg(entryArr) || entryArr[0] || 0) * 100) / 100;
  const stopLoss = Math.round((avg(slArr) || slArr[0] || 0) * 100) / 100;
  const takeProfit = Math.round((avg(tpArr) || tpArr[0] || 0) * 100) / 100;
  const confidence = Math.round(avg(confArr));
  const positionRiskPercent = options.positionRiskPercent ?? 2;

  // 6. Build the final signal object
  const final: TradingSignal = {
    id: uuidv4(),
    symbol,
    type: winnerType,
    confidence,
    price: entry,
    timestamp: Date.now(),
    strategy: 'multi-llm-consensus',
    indicators: { mtf },
    riskMetrics: {
      stopLoss: stopLoss || 0,
      takeProfit: takeProfit || 0,
      riskRewardRatio: 0,
      positionSizePercent,
    },
    exchange: 'BINANCE',
    status: 'NEW',
    reasoning: winnerGroup.items.map((p) => p.parsed!.reasoning ?? extractTextFromObject(p.raw) ?? '').join('\n---\n'),
  };

  // 7. Calculate the risk-reward ratio
  if (final.riskMetrics.stopLoss && final.riskMetrics.takeProfit && final.price) {
    const risk = Math.abs(final.price - final.riskMetrics.stopLoss);
    const reward = Math.abs(final.riskMetrics.takeProfit - final.price);
    final.riskMetrics.riskRewardRatio = risk > 0 ? Math.round((reward / risk) * 100) / 100 : 0;
  }

  // 8. Store the new signal in the playbook
  const history: SignalHistory = { id: final.id, signal: final, outcome: 'PENDING', entryPrice: final.price };
  await addSignalToPlaybook(history);

  return { final, providerResponses, mtf };
}
