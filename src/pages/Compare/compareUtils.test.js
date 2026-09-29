import { describe, it, expect } from 'vitest';
import {
  calculateNDVI, calculateNDWI, calculateDifference, calculatePercentageChange,
  routeCompareQuery, validateDates, findTemporalObservation, buildCompareResponse
} from './compareUtils';

describe('Compare Utilities', () => {
  describe('NDVI calculation', () => {
    it('calculates correct NDVI', () => {
      expect(calculateNDVI(0.8, 0.2)).toBeCloseTo(0.6);
    });
    it('handles denominator 0', () => {
      expect(calculateNDVI(0, 0)).toBe(0);
    });
    it('handles invalid inputs', () => {
      expect(calculateNDVI(null, 0.2)).toBeNaN();
      expect(calculateNDVI(0.8, undefined)).toBeNaN();
      expect(calculateNDVI('foo', 0.2)).toBeNaN();
    });
  });

  describe('NDWI calculation', () => {
    it('calculates correct NDWI', () => {
      expect(calculateNDWI(0.6, 0.2)).toBeCloseTo(0.5);
    });
    it('handles denominator 0', () => {
      expect(calculateNDWI(0, 0)).toBe(0);
    });
    it('handles invalid inputs', () => {
      expect(calculateNDWI(null, 0.2)).toBeNaN();
    });
  });

  describe('Math and Difference', () => {
    it('calculates difference', () => {
      expect(calculateDifference(12, 10)).toBe(2);
      expect(calculateDifference(null, 10)).toBeNaN();
    });

    it('calculates percentage change', () => {
      expect(calculatePercentageChange(12, 10)).toBeCloseTo(20);
    });

    it('handles zero baseline for percentage change', () => {
      expect(calculatePercentageChange(12, 0)).toBeUndefined();
    });
  });

  describe('Routing', () => {
    it('routes vegetation queries to NDVI', () => {
      expect(routeCompareQuery('How has vegetation changed?')).toEqual({ analysisType: "temporal_comparison", indicator: "NDVI" });
      expect(routeCompareQuery('Compare forest vegetation.')).toEqual({ analysisType: "temporal_comparison", indicator: "NDVI" });
    });

    it('routes water queries to NDWI', () => {
      expect(routeCompareQuery('Compare the water area.')).toEqual({ analysisType: "temporal_comparison", indicator: "NDWI" });
      expect(routeCompareQuery('Has water increased between these dates?')).toEqual({ analysisType: "temporal_comparison", indicator: "NDWI" });
    });

    it('handles ambiguous queries', () => {
      expect(routeCompareQuery('What changed between these two dates?')).toEqual({ analysisType: "temporal_comparison", indicator: "unspecified" });
    });
  });

  describe('Date Validation', () => {
    it('validates different dates', () => {
      expect(validateDates('2026-09-10', '2026-09-24').valid).toBe(true);
    });

    it('rejects same dates', () => {
      const res = validateDates('2026-09-10', '2026-09-10');
      expect(res.valid).toBe(false);
      expect(res.reason).toBe("Baseline and current observations are identical.");
    });

    it('rejects missing dates', () => {
      expect(validateDates(null, '2026-09-24').valid).toBe(false);
    });
  });

  describe('Temporal Observation Selection', () => {
    const mockCollection = [
      { actualDate: '2026-09-08', validPixelPercentage: 90, imageId: 'S2_1' },
      { actualDate: '2026-09-10', validPixelPercentage: 85, imageId: 'S2_2' }, // Exact match
      { actualDate: '2026-09-12', validPixelPercentage: 10, imageId: 'S2_3' }, // Cloudy
      { actualDate: '2026-09-22', validPixelPercentage: 95, imageId: 'S2_4' }, // Nearest valid
      { actualDate: '2026-09-24', validPixelPercentage: 5, imageId: 'S2_5' }, // Exact match but cloudy
    ];

    it('finds exact date available', () => {
      const obs = findTemporalObservation('2026-09-10', mockCollection);
      expect(obs.actualDate).toBe('2026-09-10');
    });

    it('finds nearest valid observation when exact date unavailable (or cloudy)', () => {
      // 2026-09-24 is cloudy (5%). Nearest is 2026-09-22 (95%).
      const obs = findTemporalObservation('2026-09-24', mockCollection);
      expect(obs.actualDate).toBe('2026-09-22');
    });

    it('returns null for no valid observation within window', () => {
      const obs = findTemporalObservation('2026-10-24', mockCollection);
      expect(obs).toBeNull();
    });

    it('builds success response for different actual acquisition dates', () => {
      const res = buildCompareResponse('2026-09-10', '2026-09-24', mockCollection);
      expect(res.status).toBe('success');
      expect(res.baseline.requestedDate).toBe('2026-09-10');
      expect(res.baseline.actualDate).toBe('2026-09-10');
      expect(res.current.requestedDate).toBe('2026-09-24');
      expect(res.current.actualDate).toBe('2026-09-22');
    });

    it('rejects same actual acquisition date', () => {
      const collectionSame = [
        { actualDate: '2026-09-11', validPixelPercentage: 90, imageId: 'S2_A' }
      ];
      // Requesting two close dates that resolve to the SAME nearest image
      const res = buildCompareResponse('2026-09-10', '2026-09-12', collectionSame);
      expect(res.status).toBe('insufficient_data');
      expect(res.reason).toContain('Baseline and current observations are identical (same acquisition).');
    });
  });
});
