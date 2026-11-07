import { pick } from '../../core/random';
import { formatBoth, type UnitSystem } from '../../core/units';
import type { VehicleSpec } from '../../vehicles/specs';
import { HAND, type LessonDef, type MistakeDef, type StepDef } from '../engine/types';
import { leftOn, liftSteps, lowerStep } from './common';

export interface AlignVariant {
  /** The front wheel whose toe is out of spec. */
  side: 'FL' | 'FR';
  /** Toe-in (front of the tire points inward) or toe-out. */
  toe: 'in' | 'out';
  /** Measured toe on that wheel, degrees (spec 0.10 ± 0.10). */
  toeDeg: number;
  /** Sometimes camber is also out: that needs parts, so it is referred, not adjusted. */
  camberBad: boolean;
}

/** Tie-rod jam nut torque by vehicle (ft-lb). */
const JAM_TORQUE: Record<string, number> = { sedan: 47, pickup: 52, ev: 50 };

const NOT_CENTERED: MistakeDef = {
  code: 'alignment.wheel.not_centered',
  kind: 'procedure',
  label: 'Adjusted toe without centering and locking the steering wheel',
  explain:
    'Toe is set with the steering wheel straight. If it is turned while you adjust, the car drives straight with a crooked steering wheel, and the customer comes right back. Center it and lock it with the holder first.',
  consequence: 'wheel-wobble',
};

const CAMBER_WITH_TOE: MistakeDef = {
  code: 'alignment.camber.toe_fix',
  kind: 'procedure',
  label: 'Tried to fix camber by adjusting toe',
  explain:
    'Toe and camber are different angles. Turning the tie rod only changes toe. Camber out of spec on this car means a bent or worn part, so it gets written up for repair, not hidden with toe.',
};

const SIDE_NAME = { FL: 'left front', FR: 'right front' } as const;

export const alignment: LessonDef<AlignVariant> = {
  id: 'alignment',
  title: 'Wheel Alignment Check',
  summary: 'Read the alignment rack, center the steering wheel, and set toe with the tie rod.',
  available: true,
  vehicles: ['sedan', 'pickup', 'ev'],
  cartItems: ['align-heads', 'wheel-holder', 'wrench-21', 'torque-wrench', 'rag'],
  intro:
    'When toe is off, tires scrub sideways with every turn of the wheel. They wear out in a few thousand miles and the car pulls. The alignment rack measures every angle; you fix toe with the tie rods and refer anything bent.',
  outro:
    'Toe is back in spec with a straight steering wheel, the jam nut is torqued, and anything that needs parts is written up. Those tires will wear evenly now.',
  variant: (rng) => {
    const toe = pick(rng, ['in', 'out'] as const);
    return {
      side: pick(rng, ['FL', 'FR'] as const),
      toe,
      toeDeg: toe === 'in' ? 0.35 + Math.round(rng() * 20) / 100 : -(0.2 + Math.round(rng() * 20) / 100),
      camberBad: rng() < 0.25,
    };
  },
  workOrder: (vehicle) => [
    `${vehicle.name}: alignment check, adjust front toe`,
    'Toe spec: 0.10° ± 0.10° per wheel',
    `Tie-rod jam nut: ${formatBoth('torque', JAM_TORQUE[vehicle.id] ?? 50, 'us')}`,
  ],
  stage: (v) => ({ align: alignScreens(v) }),
  steps: (vehicle, v, units) => steps(vehicle, v, units),
};

/** What the alignment console shows before and after the adjustment. */
function alignScreens(v: AlignVariant): { before: string[]; after: string[] } {
  const fmt = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}°`;
  const toe = (side: 'FL' | 'FR', fixed: boolean) =>
    side === v.side && !fixed ? `${fmt(v.toeDeg)}  ✗` : `${fmt(0.08 + (side === 'FR' ? 0.03 : 0))}  ✓`;
  const camber = (side: 'FL' | 'FR') =>
    side === v.side && v.camberBad ? `${fmt(-1.9)}  ✗` : `${fmt(-0.6 + (side === 'FR' ? 0.1 : 0))}  ✓`;
  const lines = (fixed: boolean) => [
    'FRONT        Left        Right',
    `Toe       ${toe('FL', fixed)}   ${toe('FR', fixed)}`,
    `Camber    ${camber('FL')}   ${camber('FR')}`,
    'Caster    +4.10°  ✓   +4.05°  ✓',
    'Spec: toe 0.10° ± 0.10°, camber -0.60° ± 0.50°',
  ];
  return { before: lines(false), after: lines(true) };
}

function steps(vehicle: VehicleSpec, v: AlignVariant, units: UnitSystem): StepDef[] {
  const side = v.side;
  const name = SIDE_NAME[side];
  const torque = JAM_TORQUE[vehicle.id] ?? 50;
  const screens = alignScreens(v);
  const out: StepDef[] = [
    {
      id: 'center',
      label: 'Center the steering wheel and lock it',
      say: 'Sit in the driver’s seat, set the steering wheel perfectly straight, and lock it with the steering wheel holder.',
      hint: 'The yellow steering wheel holder is on the cart.',
      why: 'Toe is set with the wheel straight, so the car drives straight with a straight steering wheel.',
      spot: 'driver',
      item: 'wheel-holder',
      targets: ['steering-wheel'],
      gesture: { kind: 'press' },
      skipMistake: NOT_CENTERED,
      fit: true,
      effects: [{ fx: 'inspect' }],
    },
    {
      id: 'heads',
      label: 'Clamp the alignment targets on all four wheels',
      say: 'Clamp an alignment target onto each wheel. The rack’s cameras read the angles from them.',
      hint: 'Four wheels, four targets.',
      item: 'align-heads',
      targets: ['hub-FL', 'hub-FR', 'hub-RL', 'hub-RR'],
      gesture: { kind: 'press' },
      fit: true,
      effects: [{ fx: 'inspect' }],
    },
    {
      id: 'read',
      label: 'Read the alignment screen',
      say: 'Press MEASURE on the alignment console and read the angles.',
      hint: 'The console stands at the front of the rack.',
      spot: 'align',
      item: HAND,
      targets: ['align-console'],
      gesture: { kind: 'press' },
      requires: ['heads'],
      readings: { 'align-console': { text: screens.before.slice(1, 3).join('\n') } },
      effects: [{ fx: 'align-read', arg: 'before' }],
    },
    {
      id: 'which',
      label: 'Find what is out of spec',
      say: 'Compare each angle to the spec at the bottom of the screen. What is out?',
      hint: 'Green ticks are in spec; a cross is not.',
      item: HAND,
      targets: [],
      gesture: { kind: 'press' },
      choice: {
        prompt: 'Which reading is out of spec?',
        options: [
          `Toe, ${name}${v.camberBad ? ' (and camber)' : ''}`,
          `Toe, ${side === 'FL' ? 'right front' : 'left front'}`,
          'Caster on both sides',
          'Everything is in spec',
        ],
        correct: 0,
        wrong: {
          code: 'alignment.read.misread',
          kind: 'value',
          label: 'Misread the alignment screen',
          explain:
            'Read each angle against the spec. Toe, camber and caster each have a range. The cross marks the reading outside it.',
        },
      },
    },
  ];
  if (v.camberBad) {
    out.push({
      id: 'camber',
      label: 'Decide what to do about camber',
      say: 'Camber is out of spec on this wheel too, and this car has no camber adjustment. What do you do?',
      hint: 'Toe and camber are different angles.',
      item: HAND,
      targets: [],
      gesture: { kind: 'press' },
      choice: {
        prompt: 'Camber is out on a car with no camber adjustment. What now?',
        options: [
          'Set toe, then write up the camber for a parts inspection (a bent or worn part)',
          'Turn the tie rod further to cover for the camber',
          'Ignore it, the customer only asked about toe',
        ],
        correct: 0,
        wrong: CAMBER_WITH_TOE,
        wrongByOption: {
          2: {
            code: 'alignment.camber.ignored',
            kind: 'procedure',
            label: 'Ignored an out-of-spec camber reading',
            explain:
              'An honest shop reports every problem the rack finds. Camber out of spec usually means a bent or worn part, which is a safety and tire-wear issue for the customer.',
          },
        },
      },
    });
  }
  out.push(
    ...liftSteps(),
    {
      id: 'jam-loose',
      label: `Loosen the ${name} tie-rod jam nut`,
      say: `From under the car, put the 21 millimeter wrench on the ${name} tie-rod jam nut and loosen it.`,
      hint: 'The jam nut locks the tie rod. It has to be loose before the tie rod can turn.',
      spot: 'under',
      item: 'wrench-21',
      targets: [`jam-nut-${side}`],
      gesture: { kind: 'twist', turns: 0.5, dir: 'ccw' },
      requires: ['center', 'lock'],
      effects: [{ fx: 'inspect' }],
    },
    {
      id: 'tie-rod',
      label: `Turn the ${name} tie rod to bring toe into spec`,
      say: `Turn the ${name} tie rod a little at a time. Toe is ${v.toe === 'in' ? 'in, so turn it to push the front of the tire out' : 'out, so turn it to pull the front of the tire in'}. The rack shows the change live.`,
      hint: 'The tie rod is the bar between the steering rack and the wheel.',
      spot: 'under',
      item: 'wrench-21',
      targets: [`tie-rod-${side}`],
      gesture: { kind: 'twist', turns: 1, dir: v.toe === 'in' ? 'ccw' : 'cw' },
      effects: [{ fx: 'align-read', arg: 'after' }],
    },
    {
      id: 'jam-torque',
      label: 'Torque the jam nut',
      say: `Hold the tie rod still and tighten the jam nut with the torque wrench to ${formatBoth('torque', torque, units)}.`,
      hint: 'A loose jam nut lets the toe drift back out.',
      spot: 'under',
      item: 'torque-wrench',
      targets: [`jam-nut-${side}`],
      gesture: { kind: 'twist', turns: 0.5, dir: 'cw' },
      measure: {
        quantity: 'torque',
        spec: torque,
        min: torque - 4,
        max: torque + 4,
        source: 'setting',
        under: {
          code: 'alignment.jam.undertorque',
          kind: 'value',
          label: 'Left the tie-rod jam nut loose',
          explain: `A loose jam nut lets the tie rod turn, the toe drifts, and the steering can feel loose. The spec is ${formatBoth('torque', torque, units)}.`,
          consequence: 'wheel-wobble',
        },
        over: {
          code: 'alignment.jam.overtorque',
          kind: 'value',
          label: 'Over-tightened the tie-rod jam nut',
          explain: `Too much torque can stretch the threads on the tie rod. The spec is ${formatBoth('torque', torque, units)}.`,
          consequence: 'stripped-thread',
        },
      },
      effects: [{ fx: 'inspect' }],
    },
    lowerStep(['jam-torque']),
    {
      id: 'reread',
      label: 'Measure again',
      say: 'Press MEASURE again and check that toe is in spec on both sides.',
      hint: 'Always confirm with a final reading.',
      spot: 'align',
      item: HAND,
      targets: ['align-console'],
      gesture: { kind: 'press' },
      readings: { 'align-console': { text: screens.after.slice(1, 3).join('\n') } },
      effects: [{ fx: 'align-read', arg: 'after' }],
    },
    {
      id: 'wear',
      label: 'Explain the tire wear to the customer',
      say: 'Toe that far out leaves a telltale wear pattern on the tires. Which one?',
      hint: 'Think about a tire being dragged sideways.',
      item: HAND,
      targets: [],
      gesture: { kind: 'press' },
      choice: {
        prompt: 'Bad toe wears the tire in which pattern?',
        options: [
          'Feathered edges: the tread ribs feel sharp one way and smooth the other',
          'Worn only in the center',
          'Even wear, toe never affects tires',
        ],
        correct: 0,
        wrong: {
          code: 'alignment.wear.misread',
          kind: 'value',
          label: 'Picked the wrong tire wear pattern for toe',
          explain:
            'Toe drags the tire slightly sideways, so the tread ribs wear into a sawtooth or feathered edge. Center wear means overinflation.',
        },
        right: 'Right. Run your hand across the tread and you can feel the feathering.',
      },
    },
    {
      id: 'heads-off',
      label: 'Unclamp the alignment targets',
      say: 'Unclamp the alignment target from each wheel and put them back on the cart.',
      hint: 'Four wheels, four targets to take off.',
      item: HAND,
      targets: ['hub-FL', 'hub-FR', 'hub-RL', 'hub-RR'],
      gesture: { kind: 'press' },
      skipMistake: leftOn('alignment', 'targets', 'alignment targets'),
      unfit: ['align-heads'],
      effects: [{ fx: 'inspect' }],
    },
    {
      id: 'holder-off',
      label: 'Remove the steering wheel holder',
      say: 'Take the steering wheel holder off. The job is done.',
      hint: 'Leave the car the way it came in.',
      spot: 'driver',
      item: HAND,
      targets: ['steering-wheel'],
      gesture: { kind: 'press' },
      requires: ['heads-off'],
      skipMistake: leftOn('alignment', 'holder', 'steering wheel holder'),
      unfit: ['wheel-holder'],
      effects: [{ fx: 'inspect' }],
    },
  );
  return out;
}
