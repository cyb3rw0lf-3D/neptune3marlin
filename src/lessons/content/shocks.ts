import { pick } from '../../core/random';
import type { UnitSystem } from '../../core/units';
import type { VehicleSpec, WheelPos } from '../../vehicles/specs';
import { HAND, type LessonDef, type LessonStage, type StepDef } from '../engine/types';
import { liftSteps, lowerStep } from './common';

export interface ShocksVariant {
  /** The corner with the bad shock or strut. */
  bad: WheelPos;
  /** What is wrong with it. */
  fault: 'leak' | 'weak' | 'mount';
  /** That corner also sits low: a tired spring. */
  sag: boolean;
}

const CORNERS: WheelPos[] = ['FL', 'FR', 'RL', 'RR'];
const NAMES: Record<WheelPos, string> = { FL: 'left front', FR: 'right front', RL: 'left rear', RR: 'right rear' };
/** Fender lip to floor at the factory ride height, inches. */
const RIDE_HEIGHT: Record<string, number> = { sedan: 26.5, pickup: 36.0, ev: 27.0 };

const FAULT_TEXT: Record<ShocksVariant['fault'], string> = {
  leak: 'Wet with oil running down the body',
  weak: 'Dry and undamaged, but it bounced',
  mount: 'The upper mount rubber is cracked through',
};

export const shocks: LessonDef<ShocksVariant> = {
  id: 'shocks',
  title: 'Shocks & Struts Check',
  summary: 'Bounce-test each corner, measure ride height, and find the bad shock or strut on the lift.',
  available: true,
  vehicles: ['sedan', 'pickup', 'ev'],
  cartItems: ['tape-measure', 'flashlight', 'tread-gauge'],
  intro:
    'Shocks and struts keep the tires pressed to the road. Worn ones make the car bounce, nose-dive when braking, and take longer to stop. Today you test each corner, measure the ride height and find the bad one.',
  outro:
    'You found the bad corner with a bounce test, a tape measure and a flashlight, and wrote up the right repair. Good shocks shorten stopping distances, so this check makes cars safer.',
  variant: (rng) => ({
    bad: pick(rng, CORNERS),
    fault: pick(rng, ['leak', 'weak', 'mount'] as const),
    sag: rng() < 0.4,
  }),
  workOrder: (vehicle, _v, units) => [
    `${vehicle.name}: bouncy ride and nose-dives when braking`,
    units === 'metric'
      ? `Ride height, fender lip to floor: ${Math.round((RIDE_HEIGHT[vehicle.id] ?? 27) * 25.4)} mm (±13)`
      : `Ride height, fender lip to floor: ${RIDE_HEIGHT[vehicle.id]} in (±0.5)`,
    'Inspect and write up only: strut replacement is a separate job',
  ],
  stage: (v): LessonStage => ({
    faults: [`weak-${v.bad}`, ...(v.fault === 'leak' ? [`shock-mist-${v.bad}`] : [])],
  }),
  steps: (vehicle, v, units) => steps(vehicle, v, units),
};

function steps(vehicle: VehicleSpec, v: ShocksVariant, units: UnitSystem): StepDef[] {
  const spec = RIDE_HEIGHT[vehicle.id] ?? 27;
  const heights = Object.fromEntries(
    CORNERS.map((c, i) => [c, c === v.bad && v.sag ? spec - 1.3 : spec + [0.1, -0.2, 0.2, -0.1][i]!]),
  ) as Record<WheelPos, number>;
  const fmt = (inches: number) => (units === 'metric' ? `${Math.round(inches * 25.4)} mm` : `${inches.toFixed(1)} in`);
  const shockReading = (c: WheelPos) => ({ text: c === v.bad ? FAULT_TEXT[v.fault] : 'Dry and clean, mounts good' });
  return [
    {
      id: 'bounce',
      label: 'Bounce-test each corner',
      say: 'Push down hard on each corner of the car and let go. A good shock lets it rise once and settle. A bad one keeps bouncing.',
      hint: 'Press on the fender above each wheel.',
      item: HAND,
      targets: CORNERS.map((c) => `fender-${c}`),
      gesture: { kind: 'press' },
      readings: Object.fromEntries(
        CORNERS.map((c) => [
          `fender-${c}`,
          { text: c === v.bad ? 'Bounces two or three times before it settles' : 'Rises once and settles' },
        ]),
      ),
      effects: [{ fx: 'bounce' }],
    },
    {
      id: 'height',
      label: 'Measure the ride height at each fender lip',
      say: 'Measure from the top of each wheel opening, the fender lip, straight down to the floor.',
      hint: 'The spec is on the work order.',
      item: 'tape-measure',
      targets: CORNERS.map((c) => `fender-${c}`),
      gesture: { kind: 'press' },
      readings: Object.fromEntries(
        CORNERS.map((c) => [`fender-${c}`, { text: `Fender lip to floor: ${fmt(heights[c])}` }]),
      ),
      effects: [{ fx: 'inspect' }],
    },
    {
      id: 'which',
      label: 'Name the weak corner',
      say: 'Which corner failed the bounce test?',
      hint: 'One corner kept bouncing.',
      item: HAND,
      targets: [],
      gesture: { kind: 'press' },
      choice: {
        prompt: 'Which corner kept bouncing?',
        options: CORNERS.map((c) => `The ${NAMES[c]}`),
        correct: CORNERS.indexOf(v.bad),
        wrong: {
          code: 'shocks.corner.wrong',
          kind: 'value',
          label: 'Picked the wrong corner',
          explain:
            'The bad corner is the one that bounced more than once after you let go. Recheck the corners before you condemn a part.',
        },
      },
    },
    {
      id: 'sag',
      label: 'Judge the ride height',
      say: 'Compare your four measurements with the spec.',
      hint: 'More than half an inch below spec is low.',
      item: HAND,
      targets: [],
      gesture: { kind: 'press' },
      choice: {
        prompt: `Spec ${fmt(spec)}. You measured ${CORNERS.map((c) => `${c} ${fmt(heights[c])}`).join(', ')}. What does it show?`,
        options: [
          'All four corners are within spec (half an inch either way)',
          `The ${NAMES[v.bad]} sits low: its spring is tired too`,
        ],
        correct: v.sag ? 1 : 0,
        wrong: {
          code: 'shocks.height.misread',
          kind: 'value',
          label: 'Misread the ride height',
          explain:
            'A shock does not hold the car up; the spring does. A corner more than half an inch below spec means a tired or broken spring, which gets written up too. Within spec, the springs are fine.',
        },
      },
    },
    ...liftSteps(),
    {
      id: 'front',
      label: 'Inspect the front shocks or struts',
      say: 'Shine the flashlight on each front shock or strut. Look for oil running down the body, and for cracked or torn mounts.',
      hint: 'A little dust is normal. Wet oil is a leak.',
      spot: 'under',
      item: 'flashlight',
      targets: ['shock-FL', 'shock-FR'],
      gesture: { kind: 'press' },
      requires: ['lock'],
      readings: { 'shock-FL': shockReading('FL'), 'shock-FR': shockReading('FR') },
      effects: [{ fx: 'inspect' }],
    },
    {
      id: 'rear',
      label: 'Inspect the rear shocks',
      say: 'Now the rear shocks. Same check: oil leaks and mounts.',
      hint: 'Walk to the rear axle.',
      spot: 'under-rear',
      item: 'flashlight',
      targets: ['shock-RL', 'shock-RR'],
      gesture: { kind: 'press' },
      readings: { 'shock-RL': shockReading('RL'), 'shock-RR': shockReading('RR') },
      effects: [{ fx: 'inspect' }],
    },
    lowerStep(['rear']),
    {
      id: 'writeup',
      label: 'Write up the repair',
      say: 'What repair do you recommend?',
      hint: 'Shocks and struts are replaced in pairs on the same axle.',
      item: HAND,
      targets: [],
      gesture: { kind: 'press' },
      choice: {
        prompt: `The ${NAMES[v.bad]} ${v.fault === 'mount' ? 'strut mount is cracked' : 'shock is bad'}. What do you write up?`,
        options: [
          `Replace both ${v.bad[0] === 'F' ? 'front' : 'rear'} shocks or struts as a pair${v.sag ? ', and the tired spring' : ''}`,
          'Replace only the bad one',
          'Nothing: they all still hold the car up',
        ],
        correct: 0,
        wrong: {
          code: 'shocks.writeup.wrong',
          kind: 'value',
          label: 'Wrote up the wrong shock repair',
          explain:
            'Replace shocks and struts in pairs on the same axle, so both sides of the car damp the same. A new one beside a worn one makes the car pull and handle unevenly.',
        },
      },
    },
    {
      id: 'why-not-now',
      label: 'Explain why the strut is not swapped right now',
      say: 'The customer asks you to swap the strut right now. Why is that a separate job?',
      hint: 'Think about the coil spring on a strut.',
      item: HAND,
      targets: [],
      gesture: { kind: 'press' },
      choice: {
        prompt: 'Why is strut replacement booked as its own job?',
        options: [
          'The coil spring is under huge force: it needs a spring compressor, training and time',
          'It is quicker to do it during the inspection',
          'Struts never need replacing',
        ],
        correct: 0,
        wrong: {
          code: 'shocks.spring.unsafe',
          kind: 'safety',
          label: 'Treated a strut swap as a quick job',
          explain:
            'A strut’s coil spring stores enough energy to kill if it is released uncontrolled. Taking a strut apart takes a proper spring compressor, training, and the time to do it right. It is never rushed into an inspection.',
        },
        right: 'Right. A compressed spring holds enough energy to seriously hurt someone.',
      },
    },
  ];
}
