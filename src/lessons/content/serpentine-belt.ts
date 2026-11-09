import { pick } from '../../core/random';
import { HAND, type LessonDef, type MistakeDef, type StepDef } from '../engine/types';
import { exhaustStep, ppeStep, runEngineStep } from './common';

export interface BeltVariant {
  /** What is wrong with the old belt. */
  wear: 'worn' | 'glazed' | 'cracked';
  /** The tensioner pulley is rough and should be replaced too. */
  weakTensioner: boolean;
}

const ENGINE_ON: MistakeDef = {
  code: 'belt.engine.not_off',
  kind: 'safety',
  label: 'Reached into the belt drive before making sure the engine was off',
  explain:
    'A running belt drive pulls fingers, sleeves and tools into the pulleys in a fraction of a second, and a car with a remote start or push button can start without warning. Engine off, key or fob out of the car, before your hands go near the belt.',
};

const MISROUTED: MistakeDef = {
  code: 'belt.route.wrong',
  kind: 'procedure',
  label: 'Routed the new belt the wrong way',
  explain:
    'A serpentine belt has one correct path, shown on the routing diagram. Routed wrong, a pulley turns backwards or the belt rubs, and it squeals, throws off or shreds within minutes. Follow the diagram pulley by pulley, and fit the smooth tensioner pulley last.',
  consequence: 'buzz',
};

const SNAP_BACK: MistakeDef = {
  code: 'belt.tensioner.snapped',
  kind: 'procedure',
  label: 'Let the tensioner snap back',
  explain:
    'The tensioner spring is strong. Let go suddenly and it slams back, which can damage the tensioner and pinch your fingers. Keep the belt tool on it and let it back slowly.',
};

const NO_DIAGRAM: MistakeDef = {
  code: 'belt.diagram.skipped',
  kind: 'order',
  label: 'Took the belt off without checking the routing diagram',
  explain:
    'Once the old belt is off, its path is gone. Find the routing diagram, or take a photo, before you release the tensioner.',
};

const WEAR_TEXT: Record<BeltVariant['wear'], string> = {
  worn: 'The wear gauge sits flush with the ribs: the grooves are worn too deep.',
  glazed: 'The ribs are shiny and hard: the belt is glazed and slipping.',
  cracked: 'Cracks run across several ribs.',
};

export const serpentineBelt: LessonDef<BeltVariant> = {
  id: 'serpentine-belt',
  title: 'Serpentine Belt',
  summary: 'Inspect the drive belt, release the tensioner and route a new belt by the diagram.',
  available: true,
  vehicles: ['sedan', 'pickup'],
  cartItems: ['belt-tool', 'belt-new', 'belt-gauge', 'flashlight', 'ratchet-14'],
  intro:
    'One belt drives the alternator, the A/C compressor and more. When it squeals or cracks, it is due. Today you inspect it, take the tension off safely, and route a new belt exactly by the diagram.',
  outro:
    'New belt, right path, tensioner checked, and the engine runs quiet. A car that loses its belt loses charging and often steering assist, so this job keeps people safe on the road.',
  variant: (rng) => ({
    wear: pick(rng, ['worn', 'glazed', 'cracked'] as const),
    weakTensioner: rng() < 0.35,
  }),
  workOrder: (vehicle) => [
    `${vehicle.name}: squeal on cold start, inspect and replace the drive belt`,
    'Engine off, fob out of the car before touching the belt',
    'Check the tensioner pulley while the belt is off',
  ],
  stage: () => ({ exhaust: true }),
  steps: (_vehicle, v) => steps(v),
};

function steps(v: BeltVariant): StepDef[] {
  return [
    ppeStep('The engine bay has sharp edges and hot parts. Gloves and glasses on.'),
    {
      id: 'key',
      label: 'Engine off, fob out of the car',
      say: 'Make sure the engine is off and take the key fob out of the car, so nobody can start it while your hands are in the belt drive.',
      hint: 'The power button is on the dash.',
      spot: 'driver',
      item: HAND,
      targets: ['start-button'],
      gesture: { kind: 'press' },
      skipMistake: ENGINE_ON,
      effects: [{ fx: 'engine-off' }],
      safety: true,
    },
    {
      id: 'hood',
      label: 'Open the hood',
      say: 'Pull the hood release and lift the hood.',
      hint: 'The belt is at the side of the engine.',
      spot: 'hood',
      item: HAND,
      targets: ['hood-latch'],
      gesture: { kind: 'press' },
      effects: [{ fx: 'hood-open' }],
    },
    {
      id: 'gauge',
      label: 'Check the belt with the wear gauge',
      say: 'Press the wear gauge into the belt ribs. If it sits flush, the grooves are worn out. Look for glazing and cracks too.',
      hint: 'The orange wear gauge is on the cart.',
      spot: 'hood',
      item: 'belt-gauge',
      targets: ['drive-belt'],
      gesture: { kind: 'press' },
      requires: ['key'],
      readings: { 'drive-belt': { text: WEAR_TEXT[v.wear] } },
      effects: [{ fx: 'inspect' }],
    },
    {
      id: 'diagram',
      label: 'Find the belt routing diagram',
      say: 'Find the belt routing diagram on the radiator support and study the path before anything comes off.',
      hint: 'A white sticker near the hood latch.',
      spot: 'hood',
      item: HAND,
      targets: ['belt-diagram'],
      gesture: { kind: 'press' },
      skipMistake: NO_DIAGRAM,
      readings: { 'belt-diagram': { text: 'Crank, idler, alternator, then over the tensioner' } },
      effects: [{ fx: 'inspect' }],
    },
    {
      id: 'release',
      label: 'Lever the tensioner and slip the belt off',
      say: 'Fit the belt tool on the tensioner, pull it back against the spring, and slip the belt off the smooth tensioner pulley. Then let the tensioner back slowly.',
      hint: 'The long belt tool goes on the tensioner bolt.',
      spot: 'hood',
      item: 'belt-tool',
      targets: ['belt-tensioner'],
      gesture: { kind: 'hold', seconds: 1.5 },
      requires: ['key', 'diagram'],
      wrongItems: { [HAND]: SNAP_BACK },
      stepEffects: [{ fx: 'belt-off' }],
    },
    {
      id: 'spin',
      label: 'Spin the tensioner pulley by hand',
      say: 'With the belt off, spin the tensioner pulley by hand. It should turn smoothly and quietly, with no wobble.',
      hint: 'Feel and listen.',
      spot: 'hood',
      item: HAND,
      targets: ['belt-tensioner'],
      gesture: { kind: 'press' },
      readings: {
        'belt-tensioner': {
          text: v.weakTensioner ? 'Rough and grinding, with a wobble' : 'Smooth and quiet, no wobble',
        },
      },
      effects: [{ fx: 'inspect' }],
    },
    {
      id: 'tensioner-call',
      label: 'Decide about the tensioner',
      say: 'Is the tensioner good, or does it need replacing too?',
      hint: 'A rough tensioner pulley will eat a new belt.',
      item: HAND,
      targets: [],
      gesture: { kind: 'press' },
      choice: {
        prompt: `The tensioner pulley is ${v.weakTensioner ? 'rough and wobbles' : 'smooth and quiet'}. What do you write up?`,
        options: ['Tensioner is good: belt only', 'Replace the tensioner with the belt'],
        correct: v.weakTensioner ? 1 : 0,
        wrong: {
          code: 'belt.tensioner.misjudged',
          kind: 'value',
          label: 'Misjudged the belt tensioner',
          explain:
            'A tensioner that grinds or wobbles has a worn bearing. It will make noise and wear the new belt fast. A smooth, quiet one is fine to keep.',
        },
      },
    },
    {
      id: 'route',
      label: 'Route the new belt by the diagram',
      say: 'Route the new belt around the pulleys in diagram order: crank, idler, then alternator. The tensioner comes last.',
      hint: 'Follow the diagram: crank, idler, alternator.',
      spot: 'hood',
      item: 'belt-new',
      targets: ['pulley-crank', 'pulley-idler', 'pulley-alternator'],
      ordered: true,
      orderMistake: MISROUTED,
      gesture: { kind: 'press' },
      effects: [{ fx: 'part-in' }],
    },
    {
      id: 'tension',
      label: 'Lever the tensioner and slip the belt on, release slowly',
      say: 'Pull the tensioner back with the belt tool, slip the belt over the tensioner pulley, and let the tensioner back slowly onto the belt.',
      hint: 'The smooth tensioner pulley goes last.',
      spot: 'hood',
      item: 'belt-tool',
      targets: ['belt-tensioner'],
      gesture: { kind: 'hold', seconds: 1.5 },
      wrongItems: { [HAND]: SNAP_BACK },
      stepEffects: [{ fx: 'belt-on' }],
    },
    {
      id: 'align',
      label: 'Check the belt sits in every groove',
      say: 'Shine the flashlight along the belt. Every rib must sit in the pulley grooves, with nothing hanging off an edge.',
      hint: 'Check each pulley in turn.',
      spot: 'hood',
      item: 'flashlight',
      targets: ['pulley-crank', 'pulley-idler', 'pulley-alternator', 'belt-tensioner'],
      gesture: { kind: 'press' },
      effects: [{ fx: 'inspect' }],
    },
    exhaustStep(),
    runEngineStep(
      'run',
      'Start the engine and listen',
      'Start the engine and listen: no squeal, and the belt runs straight and steady.',
      ['exhaust', 'align'],
    ),
    {
      id: 'close',
      label: 'Engine off and close the hood',
      say: 'Quiet and steady. Turn the engine off and close the hood.',
      hint: 'Leave the car the way it came in.',
      spot: 'hood',
      item: HAND,
      targets: ['hood-latch'],
      gesture: { kind: 'press' },
      effects: [{ fx: 'engine-off' }, { fx: 'hood-close' }],
    },
  ];
}
