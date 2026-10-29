import { describe, expect, it } from 'vitest';
import { format, formatBoth, fromDisplay, toDisplay } from '../../src/core/units';

describe('units', () => {
  it('formats US and metric specs', () => {
    expect(format('torque', 80, 'us')).toBe('80 ft-lb');
    expect(format('torque', 80, 'metric')).toBe('108 N·m');
    expect(format('pressure', 35, 'metric')).toBe('241 kPa');
    expect(format('volume', 4.4, 'metric')).toBe('4.2 L');
    expect(format('tread', 4, 'us')).toBe('4/32 in');
    expect(format('tread', 4, 'metric')).toBe('3.2 mm');
  });

  it('shows both systems for teaching', () => {
    expect(formatBoth('torque', 30, 'us')).toBe('30 ft-lb (41 N·m)');
    expect(formatBoth('torque', 30, 'metric')).toBe('41 N·m (30 ft-lb)');
  });

  it('round-trips conversions', () => {
    for (const q of ['torque', 'pressure', 'volume', 'tread', 'length'] as const) {
      expect(fromDisplay(q, toDisplay(q, 12.5, 'metric'), 'metric')).toBeCloseTo(12.5, 9);
    }
  });
});
