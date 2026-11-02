import type { VehicleId } from '../lessons/engine/types';

/**
 * Example service specs for the game's fictional vehicles. They are typical
 * values for each kind of vehicle, not data for any real make or model.
 * All values are in US units; the UI converts to metric.
 */
export interface VehicleSpec {
  id: VehicleId;
  name: string;
  kind: string;
  drivetrain: 'FWD' | 'RWD' | '4WD' | 'AWD';
  engine: string;
  oil: { grade: string; capacityQt: number; drainPlugTorque: number; drainPlugSocketMm: number } | null;
  tires: { size: string; pressurePsi: number; lugTorque: number; lugsPerWheel: number; newTread32: number };
  /** Front brakes. Rotor thickness is in inches (the minimum is cast into the rotor). */
  brakes: {
    padMinMm: number;
    padNewMm: number;
    rotorMinIn: number;
    rotorNewIn: number;
    caliperBoltMm: number;
    caliperBoltTorque: number;
  };
  /** 12-volt battery: BCI group size and cold cranking amps. */
  battery: { group: string; cca: number; wrongGroup: string };
}

export const VEHICLES: Record<VehicleId, VehicleSpec> = {
  sedan: {
    id: 'sedan',
    name: 'Aster S4',
    kind: 'compact sedan',
    drivetrain: 'FWD',
    engine: '2.0 L four-cylinder',
    oil: { grade: '0W-20', capacityQt: 4.4, drainPlugTorque: 30, drainPlugSocketMm: 14 },
    tires: { size: '215/55R17', pressurePsi: 35, lugTorque: 80, lugsPerWheel: 5, newTread32: 10 },
    brakes: {
      padMinMm: 3,
      padNewMm: 11,
      rotorMinIn: 0.984,
      rotorNewIn: 1.063,
      caliperBoltMm: 14,
      caliperBoltTorque: 26,
    },
    battery: { group: '35', cca: 640, wrongGroup: '51R' },
  },
  pickup: {
    id: 'pickup',
    name: 'Talus 1500',
    kind: 'full-size pickup',
    drivetrain: '4WD',
    engine: '3.5 L V6',
    oil: { grade: '5W-30', capacityQt: 6.0, drainPlugTorque: 20, drainPlugSocketMm: 17 },
    tires: { size: 'LT265/70R17', pressurePsi: 40, lugTorque: 150, lugsPerWheel: 6, newTread32: 15 },
    brakes: {
      padMinMm: 3,
      padNewMm: 12,
      rotorMinIn: 1.26,
      rotorNewIn: 1.339,
      caliperBoltMm: 17,
      caliperBoltTorque: 30,
    },
    battery: { group: '65', cca: 750, wrongGroup: '35' },
  },
  ev: {
    id: 'ev',
    name: 'Wren EV',
    kind: 'electric hatchback',
    drivetrain: 'RWD',
    engine: 'Electric motor, 400 V battery',
    oil: null,
    tires: { size: '235/45R19', pressurePsi: 42, lugTorque: 120, lugsPerWheel: 5, newTread32: 10 },
    brakes: {
      padMinMm: 3,
      padNewMm: 11,
      rotorMinIn: 0.945,
      rotorNewIn: 1.024,
      caliperBoltMm: 14,
      caliperBoltTorque: 26,
    },
    battery: { group: 'H5', cca: 550, wrongGroup: '35' },
  },
};

export const WHEELS = ['FL', 'FR', 'RL', 'RR'] as const;
export type WheelPos = (typeof WHEELS)[number];

export const WHEEL_NAMES: Record<WheelPos, string> = {
  FL: 'front left',
  FR: 'front right',
  RL: 'rear left',
  RR: 'rear right',
};

/** Where each wheel goes in a rotation, by drivetrain. */
export function rotationPattern(drivetrain: VehicleSpec['drivetrain']): Record<WheelPos, WheelPos> {
  if (drivetrain === 'FWD') {
    // Forward cross: fronts straight back, rears cross to the front.
    return { FL: 'RL', FR: 'RR', RL: 'FR', RR: 'FL' };
  }
  // Rearward cross for RWD/4WD/AWD: rears straight forward, fronts cross to the rear.
  return { RL: 'FL', RR: 'FR', FL: 'RR', FR: 'RL' };
}

/** Star (criss-cross) tightening order for a wheel with n lugs, as lug indexes. */
export function starPattern(lugs: number): number[] {
  if (lugs === 5) return [0, 2, 4, 1, 3];
  if (lugs === 6) return [0, 3, 1, 4, 2, 5];
  if (lugs === 8) return [0, 4, 2, 6, 1, 5, 3, 7];
  if (lugs === 4) return [0, 2, 1, 3];
  return Array.from({ length: lugs }, (_, i) => i);
}
