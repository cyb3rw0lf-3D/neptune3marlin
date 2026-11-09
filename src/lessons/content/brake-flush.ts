import { pick } from '../../core/random';
import type { VehicleSpec, WheelPos } from '../../vehicles/specs';
import { HAND, type LessonDef, type MistakeDef, type StepDef } from '../engine/types';
import { liftSteps, lowerStep, ppeStep } from './common';

export interface BrakeFlushVariant {
  /** Water in the old fluid, percent. */
  moisture: number;
  /** The line that spits air bubbles before it runs clear. */
  airAt: WheelPos;
}

/** Farthest from the master cylinder first. */
const ORDER: WheelPos[] = ['RR', 'RL', 'FR', 'FL'];
const NAMES: Record<WheelPos, string> = {
  RR: 'right rear',
  RL: 'left rear',
  FR: 'right front',
  FL: 'left front',
};

const WRONG_ORDER: MistakeDef = {
  code: 'brakeflush.order.wrong',
  kind: 'procedure',
  label: 'Bled the wheels in the wrong order',
  explain:
    'Bleed the wheel farthest from the master cylinder first and work closer: right rear, left rear, right front, left front. Out of order, old fluid and air get pushed back into lines you already bled.',
};

const RAN_DRY: MistakeDef = {
  code: 'brakeflush.reservoir.dry',
  kind: 'procedure',
  label: 'Let the brake fluid reservoir run low while bleeding',
  explain:
    'Every pedal stroke pulls fluid out of the reservoir. If it runs dry, air goes into the master cylinder and the whole job starts over, with a soft pedal until it is fixed. Top it up between wheels.',
  consequence: 'pedal-sink',
};

const SILICONE: MistakeDef = {
  code: 'brakeflush.fluid.dot5',
  kind: 'wrong-item',
  label: 'Grabbed DOT 5 silicone brake fluid for a DOT 3/DOT 4 system',
  explain:
    'DOT 5 is silicone. It does not mix with the glycol DOT 3 and DOT 4 fluid in this system, and the mix can make the brakes fail. Read the reservoir cap and use the fluid it lists.',
};

const PEDAL_UP: MistakeDef = {
  code: 'brakeflush.pedal.released',
  kind: 'procedure',
  label: 'Opened a bleeder without the pedal held down',
  explain:
    'The bleeder only opens while your helper holds the pedal down. If the pedal comes up with the bleeder open, it sucks air back into the caliper. Press and hold, open, close, and only then release.',
  consequence: 'pedal-sink',
};

export const brakeFlush: LessonDef<BrakeFlushVariant> = {
  id: 'brake-flush',
  title: 'Brake Fluid Flush',
  summary: 'Test the old fluid, refill, and bleed every wheel in order with Valkyrie on the pedal.',
  available: true,
  vehicles: ['sedan', 'pickup', 'ev'],
  cartItems: [
    'moisture-strip',
    'fluid-extractor',
    'brake-fluid-dot4',
    'brake-fluid-dot5',
    'bleed-bottle',
    'wrench-8',
    'rag',
  ],
  intro:
    'Brake fluid soaks up water from the air. Wet fluid boils on a long downhill and the pedal goes soft. Today you test it, refill with fresh fluid and bleed every wheel, with Valkyrie working the pedal while you open each bleeder.',
  outro:
    'Fresh, dry fluid at every wheel, no air, and a pedal that is firm and high. That is a car that will stop on the longest hill.',
  variant: (rng) => ({
    moisture: pick(rng, [2.5, 3, 3.5, 4]),
    airAt: pick(rng, ORDER),
  }),
  workOrder: (vehicle) => [
    `${vehicle.name}: soft brake pedal, test and flush the brake fluid`,
    'Bleed order: farthest first (RR, LR, RF, LF)',
    'Fluid: what the reservoir cap says (DOT 3 systems take DOT 4)',
  ],
  steps: (vehicle, v) => steps(vehicle, v),
};

function wheelSteps(pos: WheelPos, i: number, v: BrakeFlushVariant): StepDef[] {
  const name = NAMES[pos];
  const prev = ORDER[i - 1];
  const spot = { RR: 'right-rear', RL: 'left-rear', FR: 'right-front', FL: 'left-front' }[pos];
  const requires = [...(prev ? [`bleed-${prev}`] : ['lock']), ...(i === 2 ? ['topoff'] : [])];
  return [
    {
      id: `hose-${pos}`,
      label: `Put the bleeder hose on the ${name} bleeder`,
      say: `Push the clear hose of the bleeder bottle onto the ${name} bleeder screw.`,
      hint: `The ${name} bleeder is on top of the brake, just above the tire.`,
      spot,
      item: 'bleed-bottle',
      targets: [`bleeder-${pos}`],
      gesture: { kind: 'press' },
      requires,
      fit: true,
      effects: [{ fx: 'inspect' }],
    },
    {
      id: `call-${pos}`,
      label: 'Call the pedal to Valkyrie',
      say: 'Valkyrie is in the driver’s seat. What do you tell her before you open the bleeder?',
      hint: 'The pedal must be down whenever the bleeder is open.',
      item: HAND,
      targets: [],
      gesture: { kind: 'press' },
      choice: {
        prompt: `Bleeding the ${name}. What do you call to Valkyrie?`,
        options: ['“Press and hold!”', '“Pump it fast!”', '“Let it up!”'],
        correct: 0,
        wrong: PEDAL_UP,
        right: 'Pedal down and holding!',
      },
      stepEffects: [{ fx: 'pedal-hold' }],
    },
    {
      id: `bleed-${pos}`,
      label: `Open the ${name} bleeder, then close it`,
      say: 'Crack the bleeder open a quarter turn. Old fluid runs into the bottle. Close it before Valkyrie lets the pedal up, and repeat until it runs clear.',
      hint: 'The 8 mm bleeder wrench. Open, flow, close.',
      spot,
      item: 'wrench-8',
      targets: [`bleeder-${pos}`],
      gesture: { kind: 'twist', turns: 0.25, dir: 'ccw' },
      skipMistake: WRONG_ORDER,
      unfit: ['bleed-bottle'],
      readings: {
        [`bleeder-${pos}`]: {
          text: pos === v.airAt ? 'Bubbles at first, then clear fluid' : 'Dark old fluid, then clear',
        },
      },
      effects: [{ fx: 'inspect' }],
    },
  ];
}

function steps(_vehicle: VehicleSpec, v: BrakeFlushVariant): StepDef[] {
  const wheels = ORDER.flatMap((pos, i) => wheelSteps(pos, i, v));
  return [
    ppeStep('Brake fluid stings your eyes and strips paint. Glasses and gloves stay on.'),
    {
      id: 'hood',
      label: 'Open the hood',
      say: 'Pull the hood release and lift the hood. Lay a rag over the fender: brake fluid strips paint.',
      hint: 'The brake fluid reservoir has a yellow cap.',
      spot: 'hood',
      item: HAND,
      targets: ['hood-latch'],
      gesture: { kind: 'press' },
      effects: [{ fx: 'hood-open' }],
    },
    {
      id: 'test',
      label: 'Test the old fluid for water',
      say: 'Dip the test strip in the brake fluid reservoir and read the moisture.',
      hint: 'The test strip changes color with water content.',
      spot: 'hood',
      item: 'moisture-strip',
      targets: ['brake-reservoir'],
      gesture: { kind: 'press' },
      readings: {
        'brake-reservoir': { text: `Water in the fluid: ${v.moisture}% (replace at 3% or more)` },
      },
      effects: [{ fx: 'inspect' }],
    },
    {
      id: 'cap',
      label: 'Read the reservoir cap',
      say: 'Read the reservoir cap. Which fluid can go in this system?',
      hint: 'The cap is printed with the fluid type.',
      item: HAND,
      targets: [],
      gesture: { kind: 'press' },
      choice: {
        prompt: 'The cap says “Use only DOT 3 or DOT 4 from a sealed container.” Which fluid do you use?',
        options: ['DOT 4 glycol brake fluid', 'DOT 5 silicone brake fluid', 'Power steering fluid'],
        correct: 0,
        wrong: SILICONE,
        right: 'Right. DOT 4 is safe in a DOT 3 system, and it boils at a higher temperature.',
      },
    },
    {
      id: 'extract',
      label: 'Suck the old fluid out of the reservoir',
      say: 'Use the fluid extractor to pull most of the old fluid out of the reservoir. Do not let it go below the ports in the bottom.',
      hint: 'Less old fluid in the reservoir means less to bleed through.',
      spot: 'hood',
      item: 'fluid-extractor',
      targets: ['brake-reservoir'],
      gesture: { kind: 'hold', seconds: 2 },
      effects: [{ fx: 'inspect' }],
    },
    {
      id: 'fill',
      label: 'Refill with fresh DOT 4',
      say: 'Fill the reservoir to MAX with fresh DOT 4 from a sealed bottle.',
      hint: 'The yellow bottle.',
      spot: 'hood',
      item: 'brake-fluid-dot4',
      targets: ['brake-reservoir'],
      gesture: { kind: 'hold', seconds: 2 },
      wrongItems: { 'brake-fluid-dot5': SILICONE },
      effects: [{ fx: 'oil-fill' }],
    },
    ...liftSteps('mid'),
    ...wheels.slice(0, 6),
    {
      id: 'topoff',
      label: 'Top up the reservoir',
      say: 'Two wheels done, and every stroke used fluid. Top the reservoir back up to MAX before you start on the front wheels.',
      hint: 'Never let the reservoir run low.',
      spot: 'hood',
      item: 'brake-fluid-dot4',
      targets: ['brake-reservoir'],
      gesture: { kind: 'hold', seconds: 2 },
      skipMistake: RAN_DRY,
      wrongItems: { 'brake-fluid-dot5': SILICONE },
      effects: [{ fx: 'oil-fill' }],
    },
    ...wheels.slice(6),
    lowerStep([`bleed-FL`]),
    {
      id: 'final-fill',
      label: 'Top up to MAX and cap the reservoir',
      say: 'Top the reservoir to MAX and screw the cap on tight. Wipe up any drips with the rag.',
      hint: 'Fresh fluid to the MAX line.',
      spot: 'hood',
      item: 'brake-fluid-dot4',
      targets: ['brake-reservoir'],
      gesture: { kind: 'hold', seconds: 2 },
      wrongItems: { 'brake-fluid-dot5': SILICONE },
      effects: [{ fx: 'oil-fill' }],
    },
    {
      id: 'pedal',
      label: 'Check for a firm, high pedal',
      say: 'Sit in the driver’s seat and press the brake pedal. It should be firm and high, not soft or sinking.',
      hint: 'Never drive a car with a soft pedal.',
      spot: 'driver',
      item: HAND,
      targets: ['driver-seat'],
      gesture: { kind: 'press' },
      readings: { 'driver-seat': { text: 'Pedal firm and high' } },
      effects: [{ fx: 'pedal' }],
    },
    {
      id: 'close',
      label: 'Close the hood',
      say: 'Lower the hood gently and latch it.',
      hint: 'Leave the car the way it came in.',
      spot: 'hood',
      item: HAND,
      targets: ['hood-latch'],
      gesture: { kind: 'press' },
      effects: [{ fx: 'hood-close' }],
    },
  ];
}
