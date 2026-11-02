import type { VehicleId } from '../lessons/engine/types';
import type { WheelPos } from './specs';

export type V3 = [number, number, number];

/**
 * Where everything is on a vehicle body, in vehicle-local meters
 * (x forward, y up, z to the passenger side). Lessons never use these
 * numbers directly; they target named anchors built from them.
 */
export interface VehicleLayout {
  /** Front and rear axle positions along x. */
  wheelX: { front: number; rear: number };
  /** Wheel center distance from the centerline. */
  trackZ: number;
  wheelR: number;
  tireW: number;
  rimR: number;
  lugRadius: number;
  /** Body extents, used to keep the player from walking into the car. */
  front: number;
  rear: number;
  halfWidth: number;
  /** Two-post lift contact points (pinch welds on the sedan, frame rails on the pickup). */
  liftPoints: Record<WheelPos, V3>;
  /** Floor jack lifting point at the front (subframe or differential). */
  jackPoint: V3;
  /** Front jack stand points (left, right). */
  standPoints: { FL: V3; FR: V3 };
  /** How far the floor jack raises the car. */
  jackRaise: number;
  hood: { pivot: V3; length: number; width: number; slope: number };
  /** Named anchor positions. */
  at: {
    hoodLatch: V3;
    placard: V3;
    fillCap: V3;
    dipstick: V3;
    drainPlug: V3;
    filter: V3;
    oilPan: V3;
    startButton: V3;
    lightSwitch: V3;
    driverSeat: V3;
    battery: V3;
    batterySize: V3;
    coolant: V3;
    radiatorCap: V3;
    washer: V3;
    brakeFluid: V3;
    airFilter: V3;
    belt: V3;
    upperHose: V3;
    engineGround: V3;
    wipers: V3;
    leakCheck: V3;
    headlights: { x: number; y: number; z: number; size: V3 };
    taillights: { x: number; y: number; z: number; size: V3 };
  };
}

export const LAYOUTS: Record<Exclude<VehicleId, 'ev'>, VehicleLayout> = {
  sedan: {
    wheelX: { front: 1.35, rear: -1.35 },
    trackZ: 0.76,
    wheelR: 0.33,
    tireW: 0.215,
    rimR: 0.215,
    lugRadius: 0.065,
    front: 2.33,
    rear: -2.33,
    halfWidth: 0.9,
    liftPoints: {
      FL: [1.02, 0.28, -0.74],
      FR: [1.02, 0.28, 0.74],
      RL: [-1.12, 0.28, -0.74],
      RR: [-1.12, 0.28, 0.74],
    },
    jackPoint: [1.12, 0.22, 0],
    standPoints: { FL: [1.02, 0.28, -0.74], FR: [1.02, 0.28, 0.74] },
    jackRaise: 0.16,
    hood: { pivot: [1.27, 1.0, 0], length: 0.96, width: 1.6, slope: -0.11 },
    at: {
      hoodLatch: [2.2, 0.8, 0],
      placard: [-0.15, 0.86, -0.88],
      fillCap: [1.72, 0.875, 0.18],
      dipstick: [1.92, 0.87, -0.1],
      drainPlug: [1.78, 0.115, 0.08],
      filter: [1.5, 0.165, -0.26],
      oilPan: [1.65, 0.13, -0.05],
      startButton: [0.92, 1.03, -0.12],
      lightSwitch: [0.95, 1.03, -0.6],
      driverSeat: [0.35, 1.12, -0.86],
      battery: [1.97, 0.79, -0.52],
      batterySize: [0.24, 0.16, 0.17],
      coolant: [2.02, 0.79, 0.52],
      radiatorCap: [2.18, 0.84, -0.12],
      washer: [2.12, 0.84, 0.28],
      brakeFluid: [1.42, 0.8, -0.55],
      airFilter: [1.45, 0.78, 0.5],
      belt: [1.72, 0.8, 0.39],
      upperHose: [2.07, 0.83, 0.08],
      engineGround: [1.52, 0.9, -0.28],
      wipers: [1.2, 1.0, -0.3],
      leakCheck: [2.6, 0.02, 0],
      headlights: { x: 2.275, y: 0.68, z: 0.58, size: [0.05, 0.07, 0.32] },
      taillights: { x: -2.295, y: 0.84, z: 0.58, size: [0.05, 0.08, 0.34] },
    },
  },
  pickup: {
    wheelX: { front: 1.75, rear: -1.95 },
    trackZ: 0.86,
    wheelR: 0.4,
    tireW: 0.265,
    rimR: 0.22,
    lugRadius: 0.07,
    front: 3.02,
    rear: -3.02,
    halfWidth: 1.02,
    liftPoints: {
      FL: [1.15, 0.38, -0.5],
      FR: [1.15, 0.38, 0.5],
      RL: [-1.2, 0.38, -0.5],
      RR: [-1.2, 0.38, 0.5],
    },
    jackPoint: [1.75, 0.27, 0.05],
    standPoints: { FL: [1.15, 0.38, -0.5], FR: [1.15, 0.38, 0.5] },
    jackRaise: 0.16,
    hood: { pivot: [1.38, 1.25, 0], length: 1.52, width: 1.84, slope: -0.03 },
    at: {
      hoodLatch: [2.95, 1.1, 0],
      placard: [0.35, 1.12, -0.96],
      fillCap: [2.0, 1.175, 0.2],
      dipstick: [2.3, 1.16, -0.18],
      drainPlug: [2.2, 0.405, 0.1],
      filter: [1.85, 0.47, -0.3],
      oilPan: [2.1, 0.47, -0.05],
      startButton: [1.0, 1.37, -0.15],
      lightSwitch: [1.0, 1.37, -0.66],
      driverSeat: [0.55, 1.45, -0.98],
      battery: [2.45, 1.05, -0.62],
      batterySize: [0.3, 0.2, 0.2],
      coolant: [2.55, 1.05, 0.62],
      radiatorCap: [2.72, 1.12, -0.2],
      washer: [2.68, 1.12, 0.36],
      brakeFluid: [1.55, 1.05, -0.62],
      airFilter: [1.75, 1.05, 0.6],
      belt: [2.45, 1.08, 0.12],
      upperHose: [2.6, 1.12, 0.02],
      engineGround: [1.72, 1.16, -0.3],
      wipers: [1.32, 1.37, -0.3],
      leakCheck: [3.3, 0.02, 0],
      headlights: { x: 2.975, y: 1.08, z: 0.72, size: [0.05, 0.12, 0.3] },
      taillights: { x: -2.985, y: 1.05, z: 0.88, size: [0.05, 0.3, 0.1] },
    },
  },
};
