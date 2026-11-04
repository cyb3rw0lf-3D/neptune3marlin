import type { VehicleId } from '../lessons/engine/types';

/** Reputation points (0–100) needed for each tier. */
export const TIER_AT = [0, 12, 30, 55, 80] as const;
export const TIER_NAMES = ['New shop', 'Neighborhood shop', 'Trusted shop', 'Diagnostic shop', 'EV-certified shop'];
/** What each tier opens up, shown on the menu. */
export const TIER_UNLOCKS = [
  'Sedan wipers and bulbs, oil changes, tire service and inspections',
  'Sedan brakes, battery and coolant jobs',
  'Pickup jobs, and alignments (with the alignment rack)',
  'Check engine diagnosis, spark plugs and A/C',
  'Wren EV jobs',
];
export const MAX_REP = 100;
export const START_MONEY = 500;

export function tierFor(rep: number): number {
  let t = 0;
  for (let i = 0; i < TIER_AT.length; i++) if (rep >= (TIER_AT[i] as number)) t = i;
  return t;
}

/** Reputation changes, kept in one place so the day sheet can explain them. */
export const REP = {
  cleanJob: 4,
  jobWithMistakes: 1,
  rightServiceFirstTry: 1,
  wrongService: -1,
  honestFind: 2,
  falseUpsell: -4,
  missedFind: -1,
  comeback: -5,
  safetyStop: -6,
  efficient: 1,
} as const;

export type UpgradeId = 'impact' | 'digital-torque' | 'pro-scan' | 'analyzer' | 'balancer' | 'rack';

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  price: number;
  /** What it changes, shown in the upgrade shop. */
  effect: string;
}

export const UPGRADES: UpgradeDef[] = [
  {
    id: 'impact',
    name: 'Cordless impact wrench',
    price: 450,
    effect: 'Lug nuts spin off with one press instead of a long hold.',
  },
  {
    id: 'digital-torque',
    name: 'Digital torque wrench',
    price: 380,
    effect: 'The torque dial shows a green IN SPEC check when the setting matches the work order.',
  },
  {
    id: 'pro-scan',
    name: 'Pro scan tool',
    price: 900,
    effect: 'Adds repair-information tips for each trouble code on the scan tool screen.',
  },
  {
    id: 'analyzer',
    name: 'Digital battery analyzer',
    price: 320,
    effect: 'Battery voltage readings also show the battery’s state of health.',
  },
  {
    id: 'balancer',
    name: 'Wheel balancer',
    price: 1500,
    effect: 'Lets the shop sell, mount and balance new tires when you find worn ones.',
  },
  {
    id: 'rack',
    name: 'Alignment rack',
    price: 2200,
    effect: 'Lets the shop take wheel alignment jobs.',
  },
];

export interface CustomerDef {
  id: string;
  name: string;
  /** Narration speaker key (a Piper voice). */
  voice: string;
  /** Body preset for the low-poly model. */
  look: number;
}

export const CUSTOMERS: CustomerDef[] = [
  { id: 'maya', name: 'Maya', voice: 'maya', look: 0 },
  { id: 'dale', name: 'Dale', voice: 'dale', look: 1 },
  { id: 'rosa', name: 'Rosa', voice: 'rosa', look: 2 },
  { id: 'theo', name: 'Theo', voice: 'theo', look: 3 },
  { id: 'june', name: 'June', voice: 'june', look: 4 },
  { id: 'omar', name: 'Omar', voice: 'omar', look: 5 },
];

/** A comeback waiting in the queue for the next shift. */
export interface PendingJob {
  templateId: string;
  vehicle: VehicleId;
  customerId: string;
  kind: 'comeback';
  /** What the customer says went wrong. */
  note?: string;
  /** The mistake code that caused a comeback. */
  cause?: string;
}

export interface DayLine {
  label: string;
  amount: number;
}

export interface DaySheet {
  shift: number;
  date: string;
  jobs: { title: string; customer: string; vehicle: VehicleId; net: number; rep: number; outcome: string }[];
  income: number;
  partsCost: number;
  hints: number;
  tips: number;
  net: number;
  repChange: number;
  comebacksBooked: number;
}

export interface ShopSave {
  money: number;
  rep: number;
  upgrades: UpgradeId[];
  shift: number;
  pending: PendingJob[];
  days: DaySheet[];
}

export function newShop(): ShopSave {
  return { money: START_MONEY, rep: 0, upgrades: [], shift: 0, pending: [], days: [] };
}

const UPGRADE_IDS = new Set<string>(UPGRADES.map((u) => u.id));
const VEHICLE_IDS = new Set<string>(['sedan', 'pickup', 'ev']);
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/** Repairs whatever a save holds into a valid ShopSave (old, partial or tampered saves). */
export function sanitizeShop(raw: unknown): ShopSave {
  const s = newShop();
  if (!raw || typeof raw !== 'object') return s;
  const r = raw as Record<string, unknown>;
  s.money = Math.round(num(r.money, START_MONEY) * 100) / 100;
  s.rep = Math.max(0, Math.min(MAX_REP, Math.round(num(r.rep, 0))));
  s.shift = Math.max(0, Math.floor(num(r.shift, 0)));
  if (Array.isArray(r.upgrades)) {
    s.upgrades = [...new Set(r.upgrades.filter((u): u is UpgradeId => typeof u === 'string' && UPGRADE_IDS.has(u)))];
  }
  if (Array.isArray(r.pending)) {
    s.pending = r.pending
      .filter(
        (p): p is PendingJob =>
          !!p &&
          typeof p === 'object' &&
          typeof (p as PendingJob).templateId === 'string' &&
          VEHICLE_IDS.has((p as PendingJob).vehicle) &&
          typeof (p as PendingJob).customerId === 'string' &&
          (p as PendingJob).kind === 'comeback',
      )
      .slice(0, 10);
  }
  if (Array.isArray(r.days)) s.days = (r.days as DaySheet[]).filter((d) => d && typeof d === 'object').slice(-20);
  return s;
}
