// app/services/__tests__/llmService.test.ts
import { buildAdapterFromSpec } from '../llmService';
import { ProviderSpec } from '../../utils/providerStore';
import * as helpers from '../_utils_helpers';
import * as healthStore from '../../utils/providerHealthStore';

// Mock the getProviderSecrets and providerHealthStore functions
jest.mock('../../utils/providerStore', () => ({
  getProviderSecrets: jest.fn().mockResolvedValue({ API_KEY: 'test-key' }),
}));
jest.mock('../../utils/providerHealthStore');

describe('buildAdapterFromSpec', () => {
  beforeEach(() => {
    // Reset mocks before each test
    (healthStore.getHealthStatus as jest.Mock).mockClear();
    (healthStore.recordSuccess as jest.Mock).mockClear();
    (healthStore.recordFailure as jest.Mock).mockClear();
  });

  it('should build a request, call the endpoint, and parse the response', async () => {
    (healthStore.getHealthStatus as jest.Mock).mockResolvedValue({ state: 'CLOSED', failureCount: 0 });
    const mockSpec: ProviderSpec = {
      id: 'test-provider',
      endpoint: 'https://api.test.com/generate',
      headers: {
        Authorization: 'Bearer {{API_KEY}}',
      },
      requestTemplate: JSON.stringify({
        model: 'test-model',
        prompt: '{{prompt}}',
      }),
    };

    const mockResponse = {
      choices: [{ message: { content: '{"type":"BUY","confidence":80,"price":50000,"stopLoss":49000,"takeProfit":51000}' } }],
    };

    // Mock fetchWithTimeout
    const fetchSpy = jest.spyOn(helpers, 'fetchWithTimeout').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    } as Response);

    const adapter = buildAdapterFromSpec(mockSpec);
    const result = await adapter.call('Test prompt');

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.test.com/generate',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-key',
        }),
        body: JSON.stringify({
          model: 'test-model',
          prompt: 'Test prompt',
        }),
      }),
      9000
    );

    expect(result.ok).toBe(true);
    expect(result.parsed).toEqual({
      type: 'BUY',
      confidence: 80,
      price: 50000,
      stopLoss: 49000,
      takeProfit: 51000,
    });

    fetchSpy.mockRestore();
  });

  it('should open the circuit after 3 consecutive failures', async () => {
    const mockSpec: ProviderSpec = { id: 'failing-provider', endpoint: 'https://api.fail.com' };
    (healthStore.getHealthStatus as jest.Mock).mockResolvedValue({ state: 'CLOSED', failureCount: 2, lastAttempt: Date.now() });

    const fetchSpy = jest.spyOn(helpers, 'fetchWithTimeout').mockRejectedValue(new Error('API Error'));

    const adapter = buildAdapterFromSpec(mockSpec);
    await adapter.call('Test prompt');

    expect(healthStore.recordFailure).toHaveBeenCalledWith('failing-provider');

    fetchSpy.mockRestore();
  });

  it('should not make a request if the circuit is open', async () => {
    const mockSpec: ProviderSpec = { id: 'open-provider', endpoint: 'https://api.open.com' };
    (healthStore.getHealthStatus as jest.Mock).mockResolvedValue({ state: 'OPEN', failureCount: 3, lastAttempt: Date.now() });

    const fetchSpy = jest.spyOn(helpers, 'fetchWithTimeout');

    const adapter = buildAdapterFromSpec(mockSpec);
    const result = await adapter.call('Test prompt');

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Circuit breaker is open');

    fetchSpy.mockRestore();
  });
});
