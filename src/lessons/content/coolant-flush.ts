import { pick } from '../../core/random';
import type { VehicleSpec } from '../../vehicles/specs';
import { HAND, type LessonDef, type MistakeDef, type StepDef } from '../engine/types';
import { engineOffStep, exhaustStep, liftSteps, lowerStep, ppeStep, runEngineStep } from './common';

export interface CoolantVariant {
  /** What the old coolant looks like in the radiator neck. */
  old: 'normal' | 'rusty' | 'oily';
  /** Upper hose temperature in °F (the engine has cooled down). */
  hoseTempF: number;
  /** Freeze point the refractometer reads after the refill, in °F. */
  freezeF: number;
}

const HOT_CAP: MistakeDef = {
  code: 'coolant.cap.hot',
  kind: 'safety',
  label: 'Opened the radiator cap without checking the engine was cold',
  explain:
    'A hot cooling system is under pressure, far above boiling. Opening the cap sprays scalding coolant and steam. Check the upper hose temperature first, and only open the cap on a cold engine.',
  consequence: 'hot-steam',
};

const NO_PAN: MistakeDef = {
  code: 'coolant.drain.no_pan',
  kind: 'procedure',
  label: 'Opened the drain with nothing to catch the coolant',
  explain:
    'Coolant tastes sweet and is poisonous to pets and children. A puddle on the floor is a real danger. Put the drain pan under the radiator before opening the petcock.',
  consequence: 'oil-spill',
};

const WRONG_COOLANT: MistakeDef = {
  code: 'coolant.fill.wrong_type',
  kind: 'wrong-item',
  label: 'Grabbed the wrong type of coolant',
  explain:
    'Coolants use different chemistries. Mixing them can make sludge that blocks the radiator and heater core. Use the type on the work order.',
};

const NO_BLEED: MistakeDef = {
  code: 'coolant.bleed.skipped',
  kind: 'procedure',
  label: 'Closed up the system without bleeding the air out',
  explain:
    'An air pocket sits at the highest point of the engine, right at the thermostat. The engine overheats there even though the radiator looks full. Open the bleeder until a steady stream of coolant comes out with no bubbles.',
  consequence: 'hot-steam',
};

const OLD_MEANING: Record<CoolantVariant['old'], number> = { normal: 0, rusty: 1, oily: 2 };

export const coolantFlush: LessonDef<CoolantVariant> = {
  id: 'coolant-flush',
  title: 'Coolant Flush & Bleed',
  summary: 'Drain, refill with the right coolant, bleed the air out and check the freeze protection.',
  available: true,
  vehicles: ['sedan', 'pickup'],
  cartItems: ['ir-thermometer', 'drain-pan', 'spill-funnel', 'coolant-oat', 'coolant-green', 'refractometer', 'rag'],
  intro:
    'Coolant keeps the engine from overheating in summer and freezing in winter. Over time it wears out. Today you drain it, refill it, and get every bubble of air out, because one air pocket can overheat an engine.',
  outro:
    'Fresh coolant, no air pockets, protection well below freezing, and not a drop on the floor. That engine will run cool for years.',
  variant: (rng) => ({
    old: pick(rng, ['normal', 'rusty', 'oily'] as const),
    hoseTempF: 72 + Math.floor(rng() * 14),
    freezeF: -34 - Math.floor(rng() * 3),
  }),
  workOrder: (vehicle) => [
    `${vehicle.name}: coolant drain, fill and bleed`,
    'Coolant: long-life, premixed 50/50 (the pink jug)',
    'Engine must be cold before opening the cap',
  ],
  stage: () => ({ drainPan: true, exhaust: true }),
  steps: (vehicle, v) => steps(vehicle, v),
};

function steps(_vehicle: VehicleSpec, v: CoolantVariant): StepDef[] {
  const looks = {
    normal: 'Clean and pink, just old',
    rusty: 'Brown and rusty',
    oily: 'Milky, with an oily film',
  }[v.old];
  return [
    ppeStep('Coolant is toxic and stings the eyes. Gloves and glasses stay on for the whole job.'),
    {
      id: 'hood',
      label: 'Open the hood',
      say: 'Pull the hood release and lift the hood.',
      hint: 'The radiator cap is under the hood.',
      spot: 'hood',
      item: HAND,
      targets: ['hood-latch'],
      gesture: { kind: 'press' },
      effects: [{ fx: 'hood-open' }],
    },
    {
      id: 'cold',
      label: 'Check the engine is cold',
      say: 'Point the infrared thermometer at the upper radiator hose. The system is safe to open only when it is cool to the touch, under about 100 degrees Fahrenheit.',
      hint: 'Measure before you open anything in the cooling system.',
      spot: 'hood',
      item: 'ir-thermometer',
      targets: ['upper-hose'],
      gesture: { kind: 'press' },
      requires: ['hood'],
      readings: { 'upper-hose': { text: `Upper hose: ${v.hoseTempF} °F. Cold, safe to open.` } },
      skipMistake: HOT_CAP,
      effects: [{ fx: 'inspect' }],
      safety: true,
    },
    {
      id: 'cap-off',
      label: 'Remove the radiator cap',
      say: 'Push down and turn the radiator cap counterclockwise to take it off. Look at the old coolant in the neck.',
      hint: 'The pressure cap is on top of the radiator.',
      spot: 'hood',
      item: HAND,
      targets: ['radiator-cap'],
      gesture: { kind: 'twist', turns: 0.5, dir: 'ccw' },
      requires: ['cold'],
      readings: { 'radiator-cap': { text: `Old coolant: ${looks}` } },
      effects: [{ fx: 'inspect' }],
    },
    {
      id: 'old-call',
      label: 'Judge the old coolant',
      say: 'What does the old coolant tell you?',
      hint: 'Clean, rusty and milky coolant each mean something different.',
      item: HAND,
      targets: [],
      gesture: { kind: 'press' },
      choice: {
        prompt: `The old coolant is: ${looks.toLowerCase()}. What does that mean?`,
        options: [
          'Normal wear: it is just due for a change',
          'Overdue or mixed with water: the system is rusting inside',
          'Oil in the coolant: possible head gasket. Tell the customer and test further',
        ],
        correct: OLD_MEANING[v.old],
        wrong: {
          code: 'coolant.old.misread',
          kind: 'value',
          label: 'Misread the old coolant',
          explain:
            'Clean coolant is simply worn out. Brown, rusty coolant means it was overdue or mixed with plain water. Milky or oily coolant can mean engine oil is getting in, often a head gasket, which needs more testing before any flush.',
        },
      },
    },
    ...liftSteps(),
    {
      id: 'pan',
      label: 'Place the drain pan under the radiator',
      say: 'The car is on its locks. Set the drain pan on the floor under the radiator drain.',
      hint: 'Something has to catch the coolant before anything opens underneath.',
      spot: 'under',
      item: 'drain-pan',
      targets: ['pan-spot'],
      gesture: { kind: 'press' },
      requires: ['lock'],
      skipMistake: NO_PAN,
      effects: [{ fx: 'pan-place' }],
    },
    {
      id: 'drain',
      label: 'Open the radiator drain petcock',
      say: 'Turn the yellow petcock at the bottom of the radiator counterclockwise and let the old coolant drain into the pan.',
      hint: 'The drain petcock is at the bottom corner of the radiator.',
      spot: 'under',
      item: HAND,
      targets: ['radiator-petcock'],
      gesture: { kind: 'twist', turns: 1, dir: 'ccw' },
      requires: ['pan'],
      effects: [{ fx: 'inspect' }],
    },
    {
      id: 'petcock-close',
      label: 'Close the petcock',
      say: 'When it stops dripping, turn the petcock clockwise until it is snug. Plastic petcocks crack if you force them.',
      hint: 'Righty-tighty, but gently.',
      spot: 'under',
      item: HAND,
      targets: ['radiator-petcock'],
      gesture: { kind: 'twist', turns: 1, dir: 'cw' },
      effects: [{ fx: 'inspect' }],
    },
    lowerStep(['petcock-close']),
    {
      id: 'funnel',
      label: 'Lock the spill-free funnel on the radiator neck',
      say: 'Push the spill-free funnel onto the radiator neck and lock it. It lets air escape while you fill, and catches the overflow.',
      hint: 'The yellow funnel is on the cart.',
      spot: 'hood',
      item: 'spill-funnel',
      targets: ['radiator-neck'],
      gesture: { kind: 'press' },
      requires: ['lower'],
      effects: [{ fx: 'inspect' }],
    },
    {
      id: 'fill',
      label: 'Fill with the correct coolant',
      say: 'Pour the premixed long-life coolant, the pink jug, into the funnel until it stays half full.',
      hint: 'Match the coolant on the work order.',
      spot: 'hood',
      item: 'coolant-oat',
      targets: ['radiator-neck'],
      gesture: { kind: 'hold', seconds: 2 },
      wrongItems: { 'coolant-green': WRONG_COOLANT },
      effects: [{ fx: 'oil-fill' }],
    },
    exhaustStep(),
    runEngineStep(
      'run',
      'Run the engine with the heater on high',
      'Start the engine and turn the heater to hot. As the thermostat opens, trapped air bubbles up into the funnel.',
      ['exhaust', 'fill'],
    ),
    {
      id: 'bleed',
      label: 'Open the bleeder screw until no bubbles come out',
      say: 'Crack the brass bleeder screw on the thermostat housing open. Air hisses out first, then coolant. Wait for a steady stream with no bubbles.',
      hint: 'The bleeder is a small brass screw on the thermostat housing, the highest point of the system.',
      why: 'Air rises to the highest point. Letting it out there is the only way to fill the engine completely.',
      spot: 'hood',
      item: HAND,
      targets: ['bleeder'],
      gesture: { kind: 'twist', turns: 0.5, dir: 'ccw' },
      requires: ['run'],
      effects: [{ fx: 'inspect' }],
    },
    {
      id: 'bleed-close',
      label: 'Close the bleeder screw',
      say: 'Steady coolant, no bubbles. Close the bleeder snugly.',
      hint: 'Clockwise to close.',
      spot: 'hood',
      item: HAND,
      targets: ['bleeder'],
      gesture: { kind: 'twist', turns: 0.5, dir: 'cw' },
      skipMistake: NO_BLEED,
      effects: [{ fx: 'inspect' }],
    },
    engineOffStep('off', 'The air is out. Turn the engine off.'),
    {
      id: 'cap-on',
      label: 'Remove the funnel and refit the cap',
      say: 'Pull the funnel off, then push down and turn the radiator cap clockwise until it clicks.',
      hint: 'The cooling system only builds pressure with the cap on tight.',
      spot: 'hood',
      item: HAND,
      targets: ['radiator-cap'],
      gesture: { kind: 'twist', turns: 0.5, dir: 'cw' },
      requires: ['bleed-close'],
      effects: [{ fx: 'inspect' }],
    },
    {
      id: 'freeze',
      label: 'Check the freeze protection',
      say: 'Put one drop of coolant from the reservoir on the refractometer and read the freeze point.',
      hint: 'The refractometer reads freeze protection from a single drop.',
      why: 'A 50/50 mix protects to about 34 below zero. Too much water and the engine block can freeze and crack.',
      spot: 'hood',
      item: 'refractometer',
      targets: ['coolant-reservoir'],
      gesture: { kind: 'press' },
      readings: { 'coolant-reservoir': { text: `Freeze point: ${v.freezeF} °F (50/50 mix, good)` } },
      effects: [{ fx: 'inspect' }],
    },
    {
      id: 'recycle',
      label: 'Pour the old coolant into the recycling drum',
      say: 'Carry the drain pan to the recycling drum and pour the old coolant in. It never goes down a drain.',
      hint: 'The old coolant is still in the drain pan.',
      why: 'Used coolant is toxic. Recycled coolant is cleaned and reused.',
      spot: 'recycle',
      item: 'drain-pan',
      targets: ['recycle-drum'],
      gesture: { kind: 'hold', seconds: 2 },
      effects: [{ fx: 'oil-recycle' }],
    },
  ];
}
