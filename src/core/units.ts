/**
 * Measurement units. Specs are stored once in US customary units and converted
 * for display, so a value can never disagree between the two systems.
 */
export type UnitSystem = 'us' | 'metric';
export type Quantity = 'torque' | 'pressure' | 'volume' | 'tread' | 'length' | 'voltage' | 'thickness';

interface UnitInfo {
  us: string;
  metric: string;
  /** Multiply a US value by this to get the metric value. */
  factor: number;
  usDecimals: number;
  metricDecimals: number;
  /** Increment used by adjustable tools (e.g. the torque wrench dial). */
  usStep: number;
  metricStep: number;
}

export const UNITS: Record<Quantity, UnitInfo> = {
  torque: { us: 'ft-lb', metric: 'N·m', factor: 1.355818, usDecimals: 0, metricDecimals: 0, usStep: 1, metricStep: 1 },
  pressure: { us: 'psi', metric: 'kPa', factor: 6.894757, usDecimals: 0, metricDecimals: 0, usStep: 1, metricStep: 5 },
  volume: { us: 'qt', metric: 'L', factor: 0.946353, usDecimals: 1, metricDecimals: 1, usStep: 0.1, metricStep: 0.1 },
  // Tread depth is measured in 32nds of an inch in the US.
  tread: { us: '/32 in', metric: 'mm', factor: 0.79375, usDecimals: 0, metricDecimals: 1, usStep: 1, metricStep: 0.5 },
  length: { us: 'in', metric: 'mm', factor: 25.4, usDecimals: 3, metricDecimals: 2, usStep: 0.001, metricStep: 0.01 },
  voltage: { us: 'V', metric: 'V', factor: 1, usDecimals: 1, metricDecimals: 1, usStep: 0.1, metricStep: 0.1 },
  // Brake pad lining is measured in millimeters in US shops too.
  thickness: { us: 'mm', metric: 'mm', factor: 1, usDecimals: 1, metricDecimals: 1, usStep: 0.5, metricStep: 0.5 },
};

export function toDisplay(quantity: Quantity, usValue: number, system: UnitSystem): number {
  return system === 'us' ? usValue : usValue * UNITS[quantity].factor;
}

export function fromDisplay(quantity: Quantity, value: number, system: UnitSystem): number {
  return system === 'us' ? value : value / UNITS[quantity].factor;
}

export function unitLabel(quantity: Quantity, system: UnitSystem): string {
  return UNITS[quantity][system];
}

export function stepSize(quantity: Quantity, system: UnitSystem): number {
  const info = UNITS[quantity];
  return system === 'us' ? info.usStep : info.metricStep;
}

/** Format a US-unit value for display, e.g. format('torque', 80, 'metric') -> "108 N·m". */
export function format(quantity: Quantity, usValue: number, system: UnitSystem): string {
  const info = UNITS[quantity];
  const decimals = system === 'us' ? info.usDecimals : info.metricDecimals;
  const value = toDisplay(quantity, usValue, system).toFixed(decimals);
  if (quantity === 'tread' && system === 'us') return `${value}/32 in`;
  return `${value} ${unitLabel(quantity, system)}`;
}

/** Format in the chosen system with the other system in brackets, for teaching specs. */
export function formatBoth(quantity: Quantity, usValue: number, primary: UnitSystem): string {
  if (UNITS[quantity].us === UNITS[quantity].metric) return format(quantity, usValue, primary);
  const other: UnitSystem = primary === 'us' ? 'metric' : 'us';
  return `${format(quantity, usValue, primary)} (${format(quantity, usValue, other)})`;
}
