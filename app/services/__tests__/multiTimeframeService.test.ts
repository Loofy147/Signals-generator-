// app/services/__tests__/multiTimeframeService.test.ts
import { calculateATR, calculateSMAFromCandles } from '../multiTimeframeService';
import { Candle } from '../multiTimeframeService';

describe('multiTimeframeService', () => {
  describe('calculateSMAFromCandles', () => {
    it('should return null if there are not enough candles', () => {
      const candles: Candle[] = [{ t: 0, open: 0, high: 0, low: 0, close: 10, volume: 0 }];
      expect(calculateSMAFromCandles(candles, 2)).toBeNull();
    });

    it('should calculate the SMA correctly', () => {
      const candles: Candle[] = [
        { t: 0, open: 0, high: 0, low: 0, close: 10, volume: 0 },
        { t: 1, open: 0, high: 0, low: 0, close: 20, volume: 0 },
        { t: 2, open: 0, high: 0, low: 0, close: 30, volume: 0 },
      ];
      expect(calculateSMAFromCandles(candles, 3)).toBe(20);
    });
  });

  describe('calculateATR', () => {
    it('should return 0 if there are not enough candles', () => {
      const candles: Candle[] = [{ t: 0, open: 0, high: 0, low: 0, close: 10, volume: 0 }];
      expect(calculateATR(candles, 14)).toBe(0);
    });

    it('should calculate the ATR correctly', () => {
      const candles: Candle[] = [
        { t: 0, open: 10, high: 12, low: 8, close: 11, volume: 100 },
        { t: 1, open: 11, high: 13, low: 9, close: 12, volume: 100 },
        { t: 2, open: 12, high: 14, low: 10, close: 13, volume: 100 },
      ];
      // TR1 = max(12-8, abs(12-undefined), abs(8-undefined)) -> first candle ignored
      // TR2 = max(13-9, abs(13-11), abs(9-11)) = max(4, 2, 2) = 4
      // TR3 = max(14-10, abs(14-12), abs(10-12)) = max(4, 2, 2) = 4
      // ATR should be calculated over a period. Since we have only 2 TRs, let's test a period of 2.
      expect(calculateATR(candles, 2)).toBe(4);
    });
  });
});
