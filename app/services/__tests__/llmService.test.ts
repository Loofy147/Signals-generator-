// app/services/__tests__/llmService.test.ts
import { buildAdapterFromSpec } from '../llmService';
import { ProviderSpec } from '../../utils/providerStore';
import * as helpers from '../_utils_helpers';

// Mock the getProviderSecrets function
jest.mock('../../utils/providerStore', () => ({
  getProviderSecrets: jest.fn().mockResolvedValue({ API_KEY: 'test-key' }),
}));

describe('buildAdapterFromSpec', () => {
  it('should build a request, call the endpoint, and parse the response', async () => {
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
});
