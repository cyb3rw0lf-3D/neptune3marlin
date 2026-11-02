import type { VehicleId } from '../lessons/engine/types';

/**
 * The shop's price book. Prices are example US numbers for teaching how a
 * repair order is built: book labor hours at the shop rate, parts marked up
 * from cost, a shop-supplies fee and sales tax on parts.
 */
export const LABOR_RATE = 120;
/** Parts sell at cost plus this markup. */
export const PARTS_MARKUP = 0.4;
/** Shop supplies (rags, cleaner, grease): a percentage of labor, capped. */
export const SUPPLIES_RATE = 0.05;
export const SUPPLIES_CAP = 25;
/** Sales tax on parts only (labor is untaxed in many states). */
export const TAX_RATE = 0.07;
/** What a Practice hint costs in Shop mode: a senior tech's time. */
export const HINT_COST = 10;

export type ServiceId =
  | 'oil-change'
  | 'tire-rotation'
  | 'front-brakes'
  | 'battery-test'
  | 'inspection'
  | 'engine-diag'
  | 'spark-plugs'
  | 'hv-disable'
  | 'wiper-blades'
  | 'tires-pair';

export interface ServiceDef {
  id: ServiceId;
  name: string;
  /** Book labor hours per vehicle (null: not offered on that vehicle). */
  hours: Partial<Record<VehicleId, number>>;
  /** Parts always on the quote, as [name, cost] per vehicle. */
  parts?: Partial<Record<VehicleId, [string, number][]>>;
  /** Shown at the counter so students learn what each service is for. */
  blurb: string;
  /** Upsell-only services are never offered as the main job. */
  extraOnly?: boolean;
}

export const SERVICES: Record<ServiceId, ServiceDef> = {
  'oil-change': {
    id: 'oil-change',
    name: 'Oil & filter change',
    hours: { sedan: 0.5, pickup: 0.6 },
    parts: {
      sedan: [
        ['0W-20 oil, 5 qt', 24],
        ['Oil filter', 7],
        ['Drain plug washer', 1],
      ],
      pickup: [
        ['5W-30 oil, 6 qt', 27],
        ['Oil filter', 9],
        ['Drain plug washer', 1],
      ],
    },
    blurb: 'Fresh oil and filter. Due every 5,000 to 10,000 miles.',
  },
  'tire-rotation': {
    id: 'tire-rotation',
    name: 'Tire pressure check & rotation',
    hours: { sedan: 0.6, pickup: 0.7, ev: 0.6 },
    blurb: 'Set pressures, read tread wear and rotate the tires so they wear evenly.',
  },
  'front-brakes': {
    id: 'front-brakes',
    name: 'Front brake inspection & pads',
    hours: { sedan: 1.5, pickup: 1.8, ev: 1.5 },
    parts: {
      sedan: [
        ['Front brake pads', 38],
        ['Brake hardware kit', 9],
      ],
      pickup: [
        ['Front brake pads (HD)', 55],
        ['Brake hardware kit', 12],
      ],
      ev: [
        ['Front brake pads', 42],
        ['Brake hardware kit', 9],
      ],
    },
    blurb: 'Measure pads and rotors, replace the front pads, lube the slides.',
  },
  'battery-test': {
    id: 'battery-test',
    name: 'Battery & charging system test',
    hours: { sedan: 0.5, pickup: 0.5, ev: 0.5 },
    blurb: 'Test the battery and charging system. Replacing or jump-starting is quoted after the test.',
  },
  inspection: {
    id: 'inspection',
    name: 'Multi-point inspection',
    hours: { sedan: 0.5, pickup: 0.5, ev: 0.5 },
    blurb: 'A health check of fluids, belts, filters, wipers, lights, tires and leaks.',
  },
  'engine-diag': {
    id: 'engine-diag',
    name: 'Check engine light diagnosis',
    hours: { sedan: 1.0, pickup: 1.0 },
    blurb: 'Scan codes, test, find the cause and repair it. Parts are added once the cause is found.',
  },
  'spark-plugs': {
    id: 'spark-plugs',
    name: 'Spark plug replacement',
    hours: { sedan: 1.0, pickup: 1.8 },
    parts: {
      sedan: [['Iridium spark plugs (4)', 36]],
      pickup: [['Iridium spark plugs (6)', 54]],
    },
    blurb: 'New plugs, gapped and torqued, with the old ones read for clues.',
  },
  'hv-disable': {
    id: 'hv-disable',
    name: 'High-voltage disable for service',
    hours: { ev: 1.0 },
    blurb: 'Make the high-voltage system safe before a certified tech replaces an HV part.',
  },
  'wiper-blades': {
    id: 'wiper-blades',
    name: 'Wiper blades (pair)',
    hours: { sedan: 0.1, pickup: 0.1, ev: 0.1 },
    parts: { sedan: [['Wiper blades (2)', 22]], pickup: [['Wiper blades (2)', 26]], ev: [['Wiper blades (2)', 24]] },
    blurb: 'New front wiper blades.',
    extraOnly: true,
  },
  'tires-pair': {
    id: 'tires-pair',
    name: 'Two front tires, mounted & balanced',
    hours: { sedan: 0.8, pickup: 1.0, ev: 0.8 },
    parts: { sedan: [['Tires (2)', 210]], pickup: [['LT tires (2)', 380]], ev: [['EV tires (2)', 330]] },
    blurb: 'Replace two worn tires.',
    extraOnly: true,
  },
};

export interface QuoteLine {
  kind: 'labor' | 'part';
  name: string;
  /** Hours for labor lines, quantity 1 for parts. */
  hours?: number;
  /** What the shop pays (parts only). */
  cost: number;
  /** What the customer pays for this line. */
  price: number;
}

export interface Quote {
  lines: QuoteLine[];
  labor: number;
  parts: number;
  partsCost: number;
  supplies: number;
  tax: number;
  total: number;
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

export function laborLine(name: string, hours: number): QuoteLine {
  return { kind: 'labor', name, hours, cost: 0, price: round2(hours * LABOR_RATE) };
}

export function partLine(name: string, cost: number): QuoteLine {
  return { kind: 'part', name, cost, price: round2(cost * (1 + PARTS_MARKUP)) };
}

/** The labor and parts lines for a service on a vehicle. */
export function serviceLines(id: ServiceId, vehicle: VehicleId): QuoteLine[] {
  const s = SERVICES[id];
  const hours = s.hours[vehicle];
  if (hours === undefined) return [];
  return [laborLine(s.name, hours), ...(s.parts?.[vehicle] ?? []).map(([n, c]) => partLine(n, c))];
}

export function quote(lines: QuoteLine[]): Quote {
  const labor = round2(lines.filter((l) => l.kind === 'labor').reduce((a, l) => a + l.price, 0));
  const parts = round2(lines.filter((l) => l.kind === 'part').reduce((a, l) => a + l.price, 0));
  const partsCost = round2(lines.filter((l) => l.kind === 'part').reduce((a, l) => a + l.cost, 0));
  const supplies = lines.length === 0 ? 0 : round2(Math.min(SUPPLIES_CAP, labor * SUPPLIES_RATE));
  const tax = round2(parts * TAX_RATE);
  return { lines, labor, parts, partsCost, supplies, tax, total: round2(labor + parts + supplies + tax) };
}

export const money = (n: number) =>
  `${n < 0 ? '−' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
