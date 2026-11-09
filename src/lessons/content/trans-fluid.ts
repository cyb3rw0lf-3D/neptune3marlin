import { pick } from '../../core/random';
import type { VehicleSpec } from '../../vehicles/specs';
import { HAND, type LessonDef, type MistakeDef, type StepDef } from '../engine/types';
import { engineOffStep, exhaustStep, liftSteps, lowerStep, ppeStep, runEngineStep } from './common';

export interface TransVariant {
  /** Fluid level when checked hot. */
  low: boolean;
  /** Old fluid condition. */
  fluid: 'good' | 'burnt';
  /** Fluid temperature on the scan tool (sealed units), °F. */
  tempF: number;
}

const COLD_CHECK: MistakeDef = {
  code: 'trans.check.cold',
  kind: 'procedure',
  label: 'Checked the transmission fluid before it was warm and running',
  explain:
    'Transmission fluid expands a lot as it warms up, and most automatics are checked with the engine running in Park. A cold or engine-off reading looks low, and topping it up then overfills it.',
};

const WRONG_ATF: MistakeDef = {
  code: 'trans.fill.wrong_type',
  kind: 'wrong-item',
  label: 'Grabbed the wrong transmission fluid',
  explain:
    'CVT fluid and automatic transmission fluid are not interchangeable. The wrong fluid changes how the clutches grip and can ruin a transmission. Use the exact spec on the work order.',
};

const OVERFILL: MistakeDef = {
  code: 'trans.fill.overfill',
  kind: 'value',
  label: 'Overfilled the transmission',
  explain:
    'Too much fluid gets whipped into foam, which causes slipping and overheating, and can blow out through the vent. Add a little at a time and recheck.',
  consequence: 'overfill',
};

const DIPSTICK_HUNT: MistakeDef = {
  code: 'trans.sealed.dipstick_hunt',
  kind: 'value',
  label: 'Went looking for a dipstick on a sealed transmission',
  explain:
    'Many modern automatics are sealed: there is no dipstick. The level is checked at a check plug underneath, at a set fluid temperature read on the scan tool. Pulling the engine oil dipstick tells you nothing about the transmission.',
};

export const transFluid: LessonDef<TransVariant> = {
  id: 'trans-fluid',
  title: 'Transmission Fluid Check',
  summary: 'Check automatic transmission fluid the right way: hot dipstick, or a sealed unit with the scan tool.',
  available: true,
  vehicles: ['pickup', 'sedan'],
  cartItems: ['rag', 'atf-funnel', 'atf-spec', 'atf-cvt', 'atf-pump', 'ratchet-17', 'scan-tool', 'flashlight'],
  intro:
    'The transmission depends on the right fluid at the right level. Low fluid makes it slip, and so does too much. Today you check it the way the maker says, which is different on a dipstick transmission and a sealed one.',
  outro:
    'Level checked at the right temperature, the right fluid in, and nothing overfilled. Most transmission failures start with fluid nobody checked properly.',
  variant: (rng) => ({
    low: rng() < 0.6,
    fluid: pick(rng, ['good', 'good', 'burnt'] as const),
    tempF: 100 + Math.floor(rng() * 10),
  }),
  workOrder: (vehicle) =>
    vehicle.id === 'pickup'
      ? [
          `${vehicle.name}: slips when shifting, check the transmission fluid`,
          'Check HOT, engine running, in Park, on a level floor',
          'Fluid: ATF to the maker’s spec (red jug)',
        ]
      : [
          `${vehicle.name}: slips when shifting, check the transmission fluid`,
          'Sealed automatic: check level at 95 to 113 °F fluid temperature',
          'Fluid: ATF to the maker’s spec (red jug)',
        ],
  stage: (v) => ({
    exhaust: true,
    scan: {
      live: [
        'Live data: transmission',
        `Trans fluid temp: ${v.tempF} °F`,
        'Gear: Park',
        'Engine: 750 rpm',
        'Check window: 95 to 113 °F',
      ],
    },
  }),
  steps: (vehicle, v) => (vehicle.id === 'pickup' ? dipstickSteps(v) : sealedSteps(vehicle, v)),
};

const FLUID_LOOKS: Record<TransVariant['fluid'], string> = {
  good: 'Bright red and sweet-smelling',
  burnt: 'Dark brown and smells burnt',
};

function conditionChoice(v: TransVariant): StepDef {
  return {
    id: 'condition',
    label: 'Judge the fluid condition',
    say: 'Look at the color and smell the fluid on the rag. What does it tell you?',
    hint: 'Healthy fluid is red. Brown and burnt means trouble inside.',
    item: HAND,
    targets: [],
    gesture: { kind: 'press' },
    choice: {
      prompt: `The fluid is ${FLUID_LOOKS[v.fluid].toLowerCase()}. What do you tell the customer?`,
      options: [
        'Fluid is healthy: correct the level and keep an eye on it',
        'Burnt fluid: the clutches are overheating. Recommend a transmission diagnosis, not just a top-up',
      ],
      correct: v.fluid === 'good' ? 0 : 1,
      wrong: {
        code: 'trans.fluid.misread',
        kind: 'value',
        label: 'Misread the transmission fluid',
        explain:
          'Bright red fluid is healthy. Dark brown fluid with a burnt smell means the clutches inside are slipping and overheating. Topping it up will not fix that; it needs a proper diagnosis.',
      },
    },
  };
}

function fillMeasure(): StepDef['measure'] {
  return {
    quantity: 'volume',
    spec: 0.5,
    min: 0.4,
    max: 0.65,
    source: 'fill',
    rate: 0.2,
    start: 0,
    over: OVERFILL,
    under: {
      code: 'trans.fill.under',
      kind: 'value',
      label: 'Left the transmission still low',
      explain: 'The level was still below the mark. Low fluid makes the transmission slip and overheat.',
    },
  };
}

/** Pickup: a classic automatic with a dipstick, checked hot and running in Park. */
function dipstickSteps(v: TransVariant): StepDef[] {
  const reading = v.low ? 'Below the HOT crosshatch: about half a quart low' : 'In the HOT crosshatch: full';
  const out: StepDef[] = [
    ppeStep('Hot transmission fluid burns. Gloves and glasses on.'),
    {
      id: 'hood',
      label: 'Open the hood',
      say: 'Pull the hood release and lift the hood.',
      hint: 'The transmission dipstick is at the back of the engine bay.',
      spot: 'hood',
      item: HAND,
      targets: ['hood-latch'],
      gesture: { kind: 'press' },
      effects: [{ fx: 'hood-open' }],
    },
    exhaustStep(),
    {
      ...runEngineStep(
        'run',
        'Engine running in Park, fluid warm',
        'Start the engine, leave it in Park on the level floor, and let the transmission warm up.',
        ['exhaust'],
      ),
      skipMistake: COLD_CHECK,
    },
    {
      id: 'pull',
      label: 'Pull the dipstick and wipe it clean',
      say: 'Pull the red transmission dipstick and wipe it clean with the rag. The first reading is smeared, so it does not count.',
      hint: 'The red loop at the back of the engine bay, not the engine oil dipstick.',
      spot: 'hood',
      item: 'rag',
      targets: ['trans-dipstick'],
      gesture: { kind: 'press' },
      requires: ['run'],
      effects: [{ fx: 'inspect' }],
    },
    {
      id: 'read',
      label: 'Reinsert it fully and read the level',
      say: 'Push the dipstick all the way back in, pull it again and read the HOT range.',
      hint: 'Read the HOT marks, since the fluid is warm.',
      spot: 'hood',
      item: HAND,
      targets: ['trans-dipstick'],
      gesture: { kind: 'press' },
      readings: { 'trans-dipstick': { text: `${reading}. ${FLUID_LOOKS[v.fluid]}.` } },
      effects: [{ fx: 'inspect' }],
    },
    conditionChoice(v),
  ];
  if (v.low) {
    out.push(
      {
        id: 'funnel',
        label: 'Put the long funnel in the dipstick tube',
        say: 'The dipstick tube is also the fill tube. Put the long-neck funnel in it.',
        hint: 'The red funnel with the long neck.',
        spot: 'hood',
        item: 'atf-funnel',
        targets: ['trans-dipstick'],
        gesture: { kind: 'press' },
        fit: true,
        effects: [{ fx: 'inspect' }],
      },
      {
        id: 'fill',
        label: 'Add ATF a little at a time',
        say: 'Pour in the ATF a little at a time. It is about half a quart low. Stop before you overfill.',
        hint: 'Match the fluid on the work order. Small amounts, then recheck.',
        spot: 'hood',
        item: 'atf-spec',
        targets: ['trans-dipstick'],
        gesture: { kind: 'hold', seconds: 30 },
        measure: fillMeasure(),
        wrongItems: { 'atf-cvt': WRONG_ATF },
        effects: [{ fx: 'oil-fill' }],
      },
      {
        id: 'funnel-out',
        label: 'Take the funnel out and recheck',
        say: 'Pull the funnel out, put the dipstick back in, and check again: right in the HOT range.',
        hint: 'Always recheck after adding fluid.',
        spot: 'hood',
        item: HAND,
        targets: ['trans-dipstick'],
        gesture: { kind: 'press' },
        skipMistake: {
          code: 'trans.funnel.left_on',
          kind: 'order',
          label: 'Tried to finish with the funnel still in the dipstick tube',
          explain:
            'Take the funnel off first. A tool left on a car goes home with the customer, or falls off on the road. Everything you fit to the car comes off again before you call the job done.',
        },
        unfit: ['atf-funnel'],
        readings: { 'trans-dipstick': { text: 'In the HOT crosshatch: full' } },
        effects: [{ fx: 'inspect' }],
      },
    );
  }
  out.push(engineOffStep('off', 'Level is right. Turn the engine off.'), {
    id: 'close',
    label: 'Close the hood',
    say: 'Make sure the dipstick is seated, then lower the hood and latch it.',
    hint: 'Leave the car the way it came in.',
    spot: 'hood',
    item: HAND,
    targets: ['hood-latch'],
    gesture: { kind: 'press' },
    requires: v.low ? ['funnel-out'] : [],
    effects: [{ fx: 'hood-close' }],
  });
  return out;
}

/** Sedan: a sealed automatic with no dipstick, checked at the check plug at a set fluid temperature. */
function sealedSteps(_vehicle: VehicleSpec, v: TransVariant): StepDef[] {
  return [
    ppeStep('Hot fluid can run out of the check hole. Gloves and glasses on.'),
    {
      id: 'sealed',
      label: 'Work out how to check this transmission',
      say: 'Open the service information for this car. Where do you check the transmission fluid?',
      hint: 'Look for a dipstick in the service information, not in the engine bay.',
      item: HAND,
      targets: [],
      gesture: { kind: 'press' },
      choice: {
        prompt: 'The service information says this automatic is sealed. How is the fluid checked?',
        options: [
          'At the check plug underneath, with the fluid at the temperature the scan tool shows',
          'With the engine oil dipstick',
          'By looking for a transmission dipstick under the hood',
        ],
        correct: 0,
        wrong: DIPSTICK_HUNT,
        right: 'Right. No dipstick on this one: check plug and fluid temperature.',
      },
    },
    {
      id: 'scan',
      label: 'Plug the scan tool into the OBD-II port',
      say: 'Take the scan tool from its hook on the lift post and plug it into the OBD-II port under the dash.',
      hint: 'The port is under the dash on the driver side.',
      spot: 'driver',
      item: 'scan-tool',
      targets: ['dlc'],
      gesture: { kind: 'press' },
      effects: [{ fx: 'scan-plug' }],
    },
    exhaustStep(),
    {
      ...runEngineStep(
        'run',
        'Engine running in Park',
        'Start the engine and leave it in Park. The fluid must warm into the check window.',
        ['exhaust'],
      ),
      skipMistake: COLD_CHECK,
    },
    {
      id: 'temp',
      label: 'Read the fluid temperature',
      say: 'Press Live data on the scan tool and read the transmission fluid temperature. It must be inside the check window.',
      hint: 'The check window is on the work order.',
      spot: 'driver',
      item: HAND,
      targets: ['scan-live'],
      gesture: { kind: 'press' },
      requires: ['run'],
      readings: { 'scan-live': { text: `Trans fluid temp: ${v.tempF} °F (window 95 to 113 °F)` } },
      effects: [{ fx: 'inspect' }],
    },
    ...liftSteps(),
    {
      id: 'plug-out',
      label: 'Remove the check plug and watch the level',
      say: 'With the engine still running, remove the check plug. A thin trickle means the level is right. Nothing at all means it is low.',
      hint: 'The check plug is on the side of the transmission.',
      spot: 'under',
      item: 'ratchet-17',
      targets: ['trans-check-plug'],
      gesture: { kind: 'twist', turns: 1, dir: 'ccw' },
      requires: ['temp', 'lock'],
      readings: {
        'trans-check-plug': {
          text: `${v.low ? 'Nothing comes out: the level is low' : 'A thin trickle: the level is right'}. On your glove: ${FLUID_LOOKS[v.fluid].toLowerCase()}.`,
        },
      },
      effects: [{ fx: 'inspect' }],
    },
    ...(v.low
      ? [
          {
            id: 'fill',
            label: 'Pump in ATF until it trickles out',
            say: 'Pump the ATF into the check hole until it just starts to trickle out, then stop.',
            hint: 'Use the right fluid, and stop at the first trickle.',
            spot: 'under',
            item: 'atf-pump',
            targets: ['trans-check-plug'],
            gesture: { kind: 'hold', seconds: 30 },
            measure: fillMeasure(),
            effects: [{ fx: 'oil-fill' }],
          } satisfies StepDef,
        ]
      : []),
    {
      id: 'plug-in',
      label: 'Refit the check plug',
      say: 'Refit the check plug and snug it down.',
      hint: 'Clockwise to tighten.',
      spot: 'under',
      item: 'ratchet-17',
      targets: ['trans-check-plug'],
      gesture: { kind: 'twist', turns: 1, dir: 'cw' },
      effects: [{ fx: 'inspect' }],
    },
    conditionChoice(v),
    lowerStep(['plug-in']),
    engineOffStep('off', 'Done. Turn the engine off.'),
  ];
}
