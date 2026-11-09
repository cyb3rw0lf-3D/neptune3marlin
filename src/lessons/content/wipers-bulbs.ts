import { pick } from '../../core/random';
import type { VehicleSpec } from '../../vehicles/specs';
import { HAND, type LessonDef, type MistakeDef, type StepDef } from '../engine/types';
import { leftOn, ppeStep } from './common';

export interface WiperVariant {
  /** The headlight bulb this car takes. */
  bulb: 'H11' | '9005';
  /** The cabin filter housing's airflow arrow points down (true) or up. */
  flowDown: boolean;
  /** What the old cabin filter looks like. */
  oldFilter: 'gray' | 'leaves' | 'black';
}

const BULB_FOR: Record<string, WiperVariant['bulb']> = { sedan: 'H11', pickup: '9005', ev: 'H11' };

const WIPER_SNAP: MistakeDef = {
  code: 'wipers.arm.snapped',
  kind: 'procedure',
  label: 'Lifted the wiper arm with nothing under it',
  explain:
    'A wiper arm is spring loaded. With the blade off, a bumped arm slaps straight down onto the glass and can crack the windshield. Lay a folded towel on the windshield under the arm first.',
  consequence: 'glass-crack',
};

const WRONG_BULB: MistakeDef = {
  code: 'wipers.bulb.wrong_type',
  kind: 'wrong-item',
  label: 'Picked the wrong headlight bulb',
  explain:
    'Headlight bulbs look alike, but the base and plug differ. Read the number on the old bulb or in the owner’s manual and match it exactly.',
};

const BULB_GLASS: MistakeDef = {
  code: 'wipers.bulb.touched_glass',
  kind: 'procedure',
  label: 'Planned to hold a halogen bulb by the glass',
  explain:
    'Skin oil on a halogen bulb makes a hot spot on the glass, and the bulb can crack or burn out early. Hold it by the plastic base, with gloves on.',
};

const FILTER_BACKWARDS: MistakeDef = {
  code: 'wipers.filter.backwards',
  kind: 'procedure',
  label: 'Put the cabin filter in backwards',
  explain:
    'A cabin filter is built to catch dirt on one side. Backwards, it lets dirt through, whistles and clogs fast. Match the arrow on the filter to the airflow arrow on the housing.',
};

export const wipersBulbs: LessonDef<WiperVariant> = {
  id: 'wipers-bulbs',
  title: 'Wipers, Bulbs & Cabin Filter',
  summary: 'A first-day job: new wiper blades, a headlight bulb and the cabin air filter, done right.',
  available: true,
  vehicles: ['sedan', 'pickup', 'ev'],
  cartItems: ['towel', 'wiper-blades', 'bulb-h11', 'bulb-9005', 'cabin-filter-new', 'rag'],
  intro:
    'Small jobs build trust. Wipers, a headlight bulb and a cabin filter take ten minutes, and each one has a way to break something if you rush. Let’s do them like a pro.',
  outro:
    'Done. New blades, a bright headlight and fresh cabin air, with no cracked glass and no fingerprints on the bulb. Customers notice the small things.',
  variant: (rng, vehicle) => ({
    bulb: BULB_FOR[vehicle.id] ?? 'H11',
    flowDown: rng() < 0.5,
    oldFilter: pick(rng, ['gray', 'leaves', 'black'] as const),
  }),
  workOrder: (vehicle, v) => [
    `${vehicle.name}: wiper blades, driver headlight bulb, cabin air filter`,
    `Bulb: read the old one (this car takes ${v.bulb})`,
    'Cabin filter: match the airflow arrow',
  ],
  stage: () => ({ hoodOpen: false }),
  steps: (vehicle, v) => steps(vehicle, v),
};

function steps(vehicle: VehicleSpec, v: WiperVariant): StepDef[] {
  const ev = !!vehicle.hv;
  const right = v.bulb === 'H11' ? 'bulb-h11' : 'bulb-9005';
  const wrong = v.bulb === 'H11' ? 'bulb-9005' : 'bulb-h11';
  const looks = {
    gray: 'Gray with fine dust',
    leaves: 'Full of leaves and seeds',
    black: 'Black and clogged; it smells musty',
  }[v.oldFilter];
  return [
    ppeStep('Gloves keep skin oil off the new bulb, and the glasses keep cowl debris out of your eyes.'),
    {
      id: 'hood',
      label: ev ? 'Open the frunk' : 'Open the hood',
      say: 'Pull the release and lift the hood. The headlight socket and the cabin filter cover are both under it.',
      hint: 'Two of the three jobs are under the hood.',
      spot: 'hood',
      item: HAND,
      targets: ['hood-latch'],
      gesture: { kind: 'press' },
      effects: [{ fx: 'hood-open' }],
    },
    {
      id: 'towel',
      label: 'Lay a towel on the windshield under the wiper arm',
      say: 'Before you lift the wiper arm, lay the folded towel on the glass right under it.',
      hint: 'A spring-loaded arm needs something soft under it.',
      why: 'If the arm slips while the blade is off, it lands on the towel instead of cracking the glass.',
      spot: 'hood',
      item: 'towel',
      targets: ['wipers'],
      gesture: { kind: 'press' },
      skipMistake: WIPER_SNAP,
      fit: true,
      effects: [{ fx: 'part-in' }],
    },
    {
      id: 'arm-up',
      label: 'Lift the wiper arm off the glass',
      say: 'Lift the driver wiper arm until it locks in the up position.',
      hint: 'The arm lifts straight up from the glass.',
      spot: 'hood',
      item: HAND,
      targets: ['wipers'],
      gesture: { kind: 'press' },
      requires: ['towel'],
      effects: [{ fx: 'inspect' }],
    },
    {
      id: 'blade',
      label: 'Swap in the new wiper blade',
      say: 'Press the release tab, slide the old blade off the hook, then click the new blade on until it locks.',
      hint: 'The new blades are on the cart.',
      spot: 'hood',
      item: 'wiper-blades',
      targets: ['wipers'],
      gesture: { kind: 'press' },
      effects: [{ fx: 'part-in' }],
    },
    {
      id: 'arm-down',
      label: 'Lower the wiper arm gently',
      say: 'Lower the arm by hand all the way back onto the glass. Never let it snap down.',
      hint: 'Guide the arm down slowly.',
      spot: 'hood',
      item: HAND,
      targets: ['wipers'],
      gesture: { kind: 'press' },
      effects: [{ fx: 'inspect' }],
    },
    {
      id: 'towel-off',
      label: 'Take the towel off the windshield',
      say: 'The arm is back on the glass, so take the towel off the windshield.',
      hint: 'The towel is still under the wiper.',
      spot: 'hood',
      item: HAND,
      targets: ['wipers'],
      gesture: { kind: 'press' },
      skipMistake: leftOn('wipers', 'towel', 'towel'),
      unfit: ['towel'],
      effects: [{ fx: 'inspect' }],
    },
    {
      id: 'bulb-out',
      label: 'Twist out the old headlight bulb',
      say: 'Reach behind the driver headlight. Turn the bulb socket a quarter turn counterclockwise and pull it out. Read the number on the old bulb.',
      hint: 'The socket is behind the headlight inside the engine bay.',
      spot: 'hood',
      item: HAND,
      targets: ['headlight-socket'],
      gesture: { kind: 'twist', turns: 0.25, dir: 'ccw' },
      requires: ['hood'],
      readings: { 'headlight-socket': { text: `Old bulb base reads: ${v.bulb}` } },
      effects: [{ fx: 'inspect' }],
    },
    {
      id: 'bulb-hold',
      label: 'Handle the new bulb correctly',
      say: 'How do you hold a new halogen bulb?',
      hint: 'Halogen glass gets very hot.',
      item: HAND,
      targets: [],
      gesture: { kind: 'press' },
      choice: {
        prompt: 'How should you hold the new halogen bulb?',
        options: [
          'By the plastic base, with gloves on',
          'By the glass, it is the strongest part',
          'Any way is fine if your hands are clean',
        ],
        correct: 0,
        wrong: BULB_GLASS,
        right: 'Right. Never touch the glass.',
      },
    },
    {
      id: 'bulb-in',
      label: `Fit the new ${v.bulb} bulb`,
      say: `Fit the new ${v.bulb} bulb in the socket and turn it a quarter turn clockwise until it locks.`,
      hint: `The old bulb said ${v.bulb}. Match it.`,
      spot: 'hood',
      item: right,
      targets: ['headlight-socket'],
      gesture: { kind: 'twist', turns: 0.25, dir: 'cw' },
      wrongItems: { [wrong]: WRONG_BULB },
      effects: [{ fx: 'part-in' }],
    },
    {
      id: 'lights',
      label: 'Test the headlights',
      say: 'Turn the headlight switch on and check that both headlights light up.',
      hint: 'The light switch is on the dash, left of the steering wheel.',
      spot: 'driver',
      item: HAND,
      targets: ['light-switch'],
      gesture: { kind: 'press' },
      effects: [{ fx: 'lights-on' }],
    },
    {
      id: 'filter-out',
      label: 'Open the cabin filter cover and pull the old filter',
      say: 'Unclip the cabin filter cover under the cowl and slide the old filter out. Look at it.',
      hint: 'The cabin filter sits under the cowl at the base of the windshield.',
      spot: 'hood',
      item: HAND,
      targets: ['cabin-filter'],
      gesture: { kind: 'press' },
      readings: { 'cabin-filter': { text: `Old filter: ${looks}` } },
      effects: [{ fx: 'inspect' }],
    },
    {
      id: 'filter-arrow',
      label: 'Match the airflow arrow',
      say: 'Look at the housing. Which way should the arrow on the new filter point?',
      hint: 'The housing has its own airflow arrow.',
      item: HAND,
      targets: [],
      gesture: { kind: 'press' },
      choice: {
        prompt: `The housing is marked AIRFLOW ${v.flowDown ? '↓ (down)' : '↑ (up)'}. Which way should the filter arrow point?`,
        options: ['Down', 'Up', 'It does not matter'],
        correct: v.flowDown ? 0 : 1,
        wrong: FILTER_BACKWARDS,
        right: 'Yes. The arrows match, so the dirty side faces the incoming air.',
      },
    },
    {
      id: 'filter-in',
      label: 'Slide in the new cabin filter',
      say: 'Slide the new filter in with its arrow matching the housing, and clip the cover shut.',
      hint: 'The new cabin filter is on the cart.',
      spot: 'hood',
      item: 'cabin-filter-new',
      targets: ['cabin-filter'],
      gesture: { kind: 'press' },
      effects: [{ fx: 'part-in' }],
    },
    {
      id: 'close',
      label: 'Lights off and close the hood',
      say: 'All three jobs are done. Lower the hood gently and make sure it latches.',
      hint: 'Leave the car the way it came in.',
      spot: 'hood',
      item: HAND,
      targets: ['hood-latch'],
      gesture: { kind: 'press' },
      requires: ['towel-off'],
      effects: [{ fx: 'hood-close' }, { fx: 'lights-off' }],
    },
  ];
}
