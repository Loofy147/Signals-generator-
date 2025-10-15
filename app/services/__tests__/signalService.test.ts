// app/services/__tests__/signalService.test.ts
import { generateTradingSignal } from '../signalService';
import * as providerStore from '../../utils/providerStore';
import * as multiTimeframeService from '../multiTimeframeService';
import * as llmService from '../llmService';
import { ProviderSpec } from '../../utils/providerStore';

// Mock the dependencies
jest.mock('../../utils/providerStore');
jest.mock('../multiTimeframeService');
jest.mock('../llmService');

describe('generateTradingSignal', () => {
  it('should generate a signal by orchestrating all services', async () => {
    const mockSpecs: ProviderSpec[] = [{ id: 'test-provider', endpoint: 'test-endpoint' }];
    const mockMtfData = { '1h': { timeframe: '1h', trend: 'BULLISH', volatility: 100 } };
    const mockLlmResponse = {
      providerId: 'test-provider',
      ok: true,
      raw: {},
      parsed: { type: 'BUY', confidence: 75, price: 60000, stopLoss: 59000, takeProfit: 61000 },
    };

    // Setup mocks
    (providerStore.listProviderSpecs as jest.Mock).mockResolvedValue(mockSpecs);
    (multiTimeframeService.fetchMultiTimeframeData as jest.Mock).mockResolvedValue(mockMtfData);
    (multiTimeframeService.generateMultiTimeframeSummary as jest.Mock).mockReturnValue('1h: BULLISH');

    // Since buildAdapterFromSpec returns a function, we need to mock that function's return value
    const mockAdapter = { call: jest.fn().mockResolvedValue(mockLlmResponse) };
    (llmService.buildAdapterFromSpec as jest.Mock).mockReturnValue(mockAdapter);


    const { final } = await generateTradingSignal('BTCUSDT', mockSpecs);

    // Verify that the final signal is correctly aggregated
    expect(final).toBeDefined();
    expect(final?.type).toBe('BUY');
    expect(final?.confidence).toBe(75);
    expect(final?.price).toBe(60000);
  });
});
