import { pick } from '../../core/random';
import { formatBoth, type UnitSystem } from '../../core/units';
import {
  rotationPattern,
  starPattern,
  type VehicleSpec,
  WHEEL_NAMES,
  WHEELS,
  type WheelPos,
} from '../../vehicles/specs';
import { HAND, type LessonDef, type MistakeDef, type StepDef } from '../engine/types';
import { liftSteps, lowerStep, ppeStep } from './common';

export type WearPattern = 'edges' | 'center' | 'inner';

export interface TireVariant {
  lowTire: WheelPos;
  lowPressure: number;
  pressures: Record<WheelPos, number>;
  wornTire: WheelPos;
  wear: WearPattern;
  /** Tread depth in 32nds of an inch: outer, center, inner groove of each tire. */
  tread: Record<WheelPos, [number, number, number]>;
}

const WEAR_CAUSE: Record<WearPattern, number> = { edges: 0, center: 1, inner: 2 };
const WEAR_OPTIONS = [
  'Underinflation: the tire has been run low on air',
  'Overinflation: the tire has been run with too much air',
  'Wheel alignment is out',
];

export const tireService: LessonDef<TireVariant> = {
  id: 'tire-service',
  title: 'Tire Service',
  summary: 'Check pressure and tread, read wear patterns, rotate the tires and torque the lugs in a star pattern.',
  available: true,
  vehicles: ['sedan', 'pickup', 'ev'],
  cartItems: ['tire-gauge', 'tread-gauge', 'air-chuck', 'impact-wrench', 'torque-wrench', 'ratchet-17'],
  intro:
    'Tires are the only part of the car that touches the road. In this job you will check them like a pro, rotate them so they wear evenly, and put them back on safely.',
  outro:
    'Great job. Correct pressure, a tread report the customer can trust, rotated tires and every lug nut torqued in a star pattern.',
  variant: (rng, vehicle) => {
    const spec = vehicle.tires.pressurePsi;
    const lowTire = pick(rng, WHEELS);
    const lowPressure = spec - 6 - Math.floor(rng() * 4);
    const pressures = Object.fromEntries(
      WHEELS.map((w) => [w, w === lowTire ? lowPressure : spec - Math.floor(rng() * 2)]),
    ) as Record<WheelPos, number>;
    const wornTire = pick(
      rng,
      WHEELS.filter((w) => w !== lowTire),
    );
    const wear = pick(rng, ['edges', 'center', 'inner'] as const);
    const good = vehicle.tires.newTread32 - 3;
    const tread = Object.fromEntries(
      WHEELS.map((w): [WheelPos, [number, number, number]] => {
        if (w !== wornTire) return [w, [good, good, good]];
        if (wear === 'edges') return [w, [3, 7, 3]];
        if (wear === 'center') return [w, [7, 3, 7]];
        return [w, [7, 6, 3]];
      }),
    ) as Record<WheelPos, [number, number, number]>;
    return { lowTire, lowPressure, pressures, wornTire, wear, tread };
  },
  workOrder: (vehicle, _v, units) => [
    `Tires: ${vehicle.tires.size}, ${vehicle.drivetrain}`,
    'Pressure: see the door placard',
    `Lug nuts: ${formatBoth('torque', vehicle.tires.lugTorque, units)}, star pattern`,
  ],
  steps: (vehicle, v, units) => tireSteps(vehicle, v, units),
};

function tireSteps(vehicle: VehicleSpec, v: TireVariant, units: UnitSystem): StepDef[] {
  const spec = vehicle.tires.pressurePsi;
  const psi = formatBoth('pressure', spec, units);
  const lugTorque = vehicle.tires.lugTorque;
  const torque = formatBoth('torque', lugTorque, units);
  const pattern = rotationPattern(vehicle.drivetrain);
  const star = starPattern(vehicle.tires.lugsPerWheel);
  const worn = WHEEL_NAMES[v.wornTire];
  const minTread = Math.min(...v.tread[v.wornTire]);
  const fmtTread = (n: number) => formatBoth('tread', n, units);

  const lugsUnder: MistakeDef = {
    code: 'tires.lugs.undertorque',
    kind: 'safety',
    label: 'Lug nuts tightened below spec',
    explain: `Loose lug nuts work their way off as the car drives, and a wheel can come off at speed. Lug nuts on this ${vehicle.name} get ${torque}, every one, with a torque wrench.`,
    consequence: 'wheel-wobble',
  };
  const lugsOver: MistakeDef = {
    code: 'tires.lugs.overtorque',
    kind: 'value',
    label: 'Lug nuts tightened above spec',
    explain: `Too much torque stretches the wheel studs and can warp the brake rotors. The spec is ${torque}.`,
    consequence: 'stripped-thread',
  };
  const lugMeasure = {
    quantity: 'torque' as const,
    spec: lugTorque,
    min: lugTorque * 0.95,
    max: lugTorque * 1.06,
    source: 'setting' as const,
    under: lugsUnder,
    over: lugsOver,
  };
  const wrongHub: MistakeDef = {
    code: 'tires.rotation.wrong_position',
    kind: 'procedure',
    label: 'Put a wheel in the wrong rotation position',
    explain:
      vehicle.drivetrain === 'FWD'
        ? 'This car is front-wheel drive, so it uses the forward cross: front tires go straight back, rear tires cross to the opposite front.'
        : `This ${vehicle.drivetrain} vehicle uses the rearward cross: rear tires go straight forward, front tires cross to the opposite rear.`,
  };
  const impactNotForTightening: MistakeDef = {
    code: 'tires.lugs.impact_tightening',
    kind: 'procedure',
    label: 'Final-tightened lug nuts with the impact wrench',
    explain:
      'An impact wrench can hammer lug nuts far past spec. It is fine for taking them off, but final tightening is always done with a torque wrench.',
  };
  const torqueToBreakLoose: MistakeDef = {
    code: 'tires.tools.torque_wrench_loosen',
    kind: 'procedure',
    label: 'Used the torque wrench to break nuts loose',
    explain:
      'A torque wrench is a measuring tool. Using it to break nuts loose knocks it out of calibration. Use the impact wrench to remove nuts.',
  };
  const hubs = WHEELS.map((w) => `hub-${w}`);
  // targetItems: the wheel that belongs on each hub after rotation.
  const targetItems = Object.fromEntries(WHEELS.map((from) => [`hub-${pattern[from]}`, `wheel-${from}`]));

  const firstWheel: WheelPos = 'FL';
  const otherWheels = WHEELS.filter((w) => w !== firstWheel);

  return [
    ppeStep(),
    {
      id: 'placard',
      label: 'Read the tire pressure placard',
      say: `Find the tire placard on the driver door jamb. It says this ${vehicle.name} takes ${psi} cold. That is the number to use, not the maximum printed on the tire sidewall.`,
      hint: 'The correct pressure is on a sticker in the driver door opening.',
      spot: 'driver',
      item: HAND,
      targets: ['placard'],
      gesture: { kind: 'press' },
      readings: { placard: { quantity: 'pressure', value: spec, note: 'Recommended cold pressure' } },
      effects: [{ fx: 'placard' }],
    },
    {
      id: 'pressure',
      label: 'Check the pressure in all four tires',
      say: 'Use the pressure gauge on the valve stem of each tire. Press it on straight and quick so no air escapes.',
      hint: 'Four tires, four readings. The gauge goes on the valve stem.',
      spot: 'side-left',
      item: 'tire-gauge',
      targets: WHEELS.map((w) => `valve-${w}`),
      gesture: { kind: 'press' },
      readings: Object.fromEntries(
        WHEELS.map((w) => [`valve-${w}`, { quantity: 'pressure' as const, value: v.pressures[w] }]),
      ),
      effects: [{ fx: 'gauge-pressure' }],
    },
    {
      id: 'inflate',
      label: `Inflate the low tire to ${psi}`,
      say: `The ${WHEEL_NAMES[v.lowTire]} tire is low. Hold the air chuck on its valve and watch the reading. Stop at ${psi}.`,
      hint: 'One tire read well below the placard. Bring it up to spec.',
      spot: 'side-left',
      item: 'air-chuck',
      targets: [`valve-${v.lowTire}`],
      gesture: { kind: 'hold', seconds: 30 },
      measure: {
        quantity: 'pressure',
        spec,
        min: spec - 1,
        max: spec + 1.5,
        source: 'fill',
        rate: 2,
        start: v.lowPressure,
        over: {
          code: 'tires.overinflate',
          kind: 'value',
          label: 'Overinflated a tire',
          explain: `An overinflated tire has a smaller contact patch, so it grips less and wears out the center of the tread. Air was let out back to ${psi}.`,
          consequence: 'tire-overinflate',
        },
      },
      skipMistake: {
        code: 'tires.left_low',
        kind: 'value',
        label: 'Left a tire underinflated',
        explain:
          'An underinflated tire flexes too much, overheats, wears its edges and hurts braking and fuel economy. Always correct the pressure.',
      },
      effects: [{ fx: 'inflate' }],
    },
    {
      id: 'tread',
      label: 'Measure tread depth on all four tires',
      say: 'Now the tread depth gauge. Measure the tread of each tire. Check the outer, center and inner grooves, because uneven wear tells a story.',
      hint: 'The tread gauge goes into the grooves of each tire.',
      spot: 'side-left',
      item: 'tread-gauge',
      targets: WHEELS.map((w) => `tread-${w}`),
      gesture: { kind: 'press' },
      readings: Object.fromEntries(
        WHEELS.map((w) => [
          `tread-${w}`,
          {
            quantity: 'tread' as const,
            value: Math.min(...v.tread[w]),
            note: `Outer ${fmtTread(v.tread[w][0])}, center ${fmtTread(v.tread[w][1])}, inner ${fmtTread(v.tread[w][2])}`,
          },
        ]),
      ),
      effects: [{ fx: 'gauge-tread' }],
    },
    {
      id: 'wear-call',
      label: 'Diagnose the uneven wear',
      say: `Look at the ${worn} readings: outer ${fmtTread(v.tread[v.wornTire][0])}, center ${fmtTread(v.tread[v.wornTire][1])}, inner ${fmtTread(v.tread[v.wornTire][2])}. What causes that pattern?`,
      hint: 'Worn edges, worn center, or worn on one side only each point to a different cause.',
      item: HAND,
      targets: [],
      gesture: { kind: 'press' },
      choice: {
        prompt: `${capitalize(worn)} tire: outer ${fmtTread(v.tread[v.wornTire][0])}, center ${fmtTread(v.tread[v.wornTire][1])}, inner ${fmtTread(v.tread[v.wornTire][2])}. What is the most likely cause?`,
        options: WEAR_OPTIONS,
        correct: WEAR_CAUSE[v.wear],
        right:
          v.wear === 'edges'
            ? 'Right. A low tire sags, so its edges carry the load and wear first.'
            : v.wear === 'center'
              ? 'Right. Too much air makes the tread bulge, so the center wears first.'
              : 'Right. Wear on just one side means the wheel is tilted. That is an alignment problem.',
        wrong: {
          code: 'tires.wear_diagnosis',
          kind: 'procedure',
          label: 'Misread a tire wear pattern',
          explain:
            'Both edges worn means underinflation. Center worn means overinflation. One side worn means alignment. Matching the pattern to the cause fixes the real problem.',
        },
      },
    },
    {
      id: 'tread-call',
      label: 'Make a tread recommendation',
      say: `The ${worn} tire is down to ${fmtTread(minTread)} in its worst groove. What do you tell the customer?`,
      hint: 'Two thirty-seconds is the legal minimum in most states. Four thirty-seconds is when wet grip drops off.',
      item: HAND,
      targets: [],
      gesture: { kind: 'press' },
      choice: {
        prompt: `The ${worn} tire has ${fmtTread(minTread)} of tread in its worst groove. Your recommendation?`,
        options: [
          'It is fine. There is still tread left.',
          'Recommend replacing it soon, and fix the cause of the uneven wear.',
          'Refuse to let the car leave the shop.',
        ],
        correct: 1,
        right:
          'Exactly. It is above the legal two thirty-seconds, but below four thirty-seconds wet-road grip drops a lot. Recommend a replacement and explain why, without scaring the customer.',
        wrong: {
          code: 'tires.tread_recommendation',
          kind: 'procedure',
          label: 'Gave the wrong tread recommendation',
          explain: `${fmtTread(minTread)} is above the legal minimum of ${fmtTread(2)}, but at ${fmtTread(4)} or less the tire grips much worse in rain. Honest advice: recommend replacing it soon.`,
        },
      },
    },
    ...liftSteps(),
    {
      id: 'wheels-off',
      label: 'Remove all four wheels',
      say: 'Use the impact wrench on each wheel to spin the lug nuts off. Hold the trigger until the wheel comes free.',
      hint: 'The fastest tool for taking lug nuts off is the air-powered one.',
      spot: 'side-left',
      item: 'impact-wrench',
      targets: WHEELS.map((w) => `lugs-${w}`),
      gesture: { kind: 'hold', seconds: 1.5 },
      requires: ['ppe', 'lock'],
      wrongItems: { 'torque-wrench': torqueToBreakLoose },
      effects: [{ fx: 'wheel-off' }],
    },
    {
      id: 'rotate',
      label: `Rotate the tires (${vehicle.drivetrain === 'FWD' ? 'forward cross' : 'rearward cross'})`,
      say:
        vehicle.drivetrain === 'FWD'
          ? 'This car is front-wheel drive, so use the forward cross. Front wheels go straight back. Rear wheels cross to the opposite front. Pick up each wheel and set it on its new hub.'
          : 'Use the rearward cross. Rear wheels go straight forward. Front wheels cross to the opposite rear. Pick up each wheel and set it on its new hub.',
      hint:
        vehicle.drivetrain === 'FWD'
          ? 'Front-wheel drive: fronts straight back, rears cross forward.'
          : 'Rear or four-wheel drive: rears straight forward, fronts cross back.',
      why: 'The drive wheels wear faster. Rotating moves every tire through every position, so all four wear evenly and last longer.',
      spot: 'side-left',
      item: 'wheel-FL',
      targets: hubs,
      targetItems,
      wrongItem: wrongHub,
      gesture: { kind: 'press' },
      effects: [{ fx: 'wheel-place' }],
    },
    {
      id: 'lugs-hand',
      label: 'Start every lug nut by hand',
      say: 'Thread the lug nuts on each wheel by hand. Hand-starting means a crooked nut can never cross-thread.',
      hint: 'Before any tool touches a lug nut, its threads are started one way.',
      spot: 'side-left',
      item: HAND,
      targets: hubs,
      gesture: { kind: 'twist', turns: 1, dir: 'cw' },
      skipMistake: {
        code: 'tires.lower_unsecured',
        kind: 'safety',
        label: 'Lowered the car with the wheels not fastened',
        explain:
          'With no lug nuts holding them, the wheels can shift off the studs as the weight comes down. That damages the studs and can drop the car.',
        consequence: 'wheel-wobble',
      },
      effects: [{ fx: 'lugs-hand' }],
    },
    lowerStep(['lugs-hand']),
    {
      id: 'star',
      label: `Torque the ${WHEEL_NAMES[firstWheel]} lugs to ${torque} in a star pattern`,
      say: `Set the torque wrench to ${torque}. On the ${WHEEL_NAMES[firstWheel]} wheel, tighten the lugs in a star pattern: one, skip one, across, until all are clicked.`,
      hint: 'Criss-cross, not around in a circle. And set the wrench to the spec first.',
      why: 'A star pattern pulls the wheel flat against the hub evenly. Going around in a circle can seat it crooked and warp the brake rotor.',
      spot: 'side-left',
      item: 'torque-wrench',
      targets: star.map((i) => `lug-${firstWheel}-${i}`),
      ordered: true,
      orderMistake: {
        code: 'tires.lugs.not_star',
        kind: 'procedure',
        label: 'Did not use a star pattern on the lug nuts',
        explain:
          'Going around the circle pulls the wheel on unevenly. Tighten in a star pattern, criss-crossing the wheel, so it seats flat.',
      },
      gesture: { kind: 'twist', turns: 0.25, dir: 'cw' },
      measure: lugMeasure,
      wrongItems: { 'impact-wrench': impactNotForTightening },
      effects: [{ fx: 'lug-torque' }],
    },
    {
      id: 'torque-rest',
      label: `Torque the other three wheels to ${torque}`,
      say: 'Same pattern, same spec on the other three wheels.',
      hint: 'Three wheels still need their final tightening with the same tool.',
      spot: 'side-left',
      item: 'torque-wrench',
      targets: otherWheels.map((w) => `lugs-${w}`),
      gesture: { kind: 'twist', turns: 0.25, dir: 'cw' },
      measure: lugMeasure,
      wrongItems: { 'impact-wrench': impactNotForTightening },
      effects: [{ fx: 'wheel-torque' }],
    },
  ];
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
