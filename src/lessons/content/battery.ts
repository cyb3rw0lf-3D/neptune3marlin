import { pick } from '../../core/random';
import { formatBoth, type UnitSystem } from '../../core/units';
import type { VehicleSpec } from '../../vehicles/specs';
import { HAND, type LessonDef, type MistakeDef, type StepDef } from '../engine/types';
import { ppeStep } from './common';

/** good: terminals need cleaning. weak: fails the load test, replace it. dead: won't crank, jump-start it. */
export type BatteryState = 'good' | 'weak' | 'dead';

export interface BatteryVariant {
  state: BatteryState;
  /** How a dead car gets its jump: cables from a donor car, or a portable jump pack. */
  jump: 'cables' | 'pack';
  restVolts: number;
  loadVolts: number;
  chargingVolts: number;
}

const POS_FIRST: MistakeDef = {
  code: 'battery.disconnect.positive_first',
  kind: 'safety',
  label: 'Disconnected the positive cable first',
  explain:
    'The negative cable comes off first. With it still connected, the whole car body is negative, so a wrench on the positive post that touches any metal makes a dead short: sparks, burns, even a battery explosion.',
  consequence: 'spark',
};

const NEG_ON_FIRST: MistakeDef = {
  code: 'battery.connect.negative_first',
  kind: 'safety',
  label: 'Connected the negative cable before the positive',
  explain:
    'Positive goes on first and negative goes on last. If negative is already connected, a wrench on the positive post that touches the body shorts the battery.',
  consequence: 'spark',
};

const HOLDDOWN: MistakeDef = {
  code: 'battery.holddown.left_on',
  kind: 'procedure',
  label: 'Tried to lift the battery with the hold-down still on',
  explain:
    'The hold-down clamp keeps the battery from bouncing around while driving. Remove it before lifting the battery out, and always put it back on the new one.',
};

const WRONG_GROUP: MistakeDef = {
  code: 'battery.replace.wrong_group',
  kind: 'wrong-item',
  label: 'Picked a battery with the wrong group size',
  explain:
    'The group size sets the battery case size and which side the posts are on. The wrong group may not fit the tray or hold-down, or the cables may not reach.',
};

const LAST_CLAMP_ON_BATTERY: MistakeDef = {
  code: 'battery.jump.last_clamp_on_battery',
  kind: 'safety',
  label: 'Put the last jumper clamp on the dead battery',
  explain:
    'The last connection always makes a small spark. A charging battery gives off hydrogen gas, which can explode. Make the last connection on bare metal on the engine, away from the battery.',
  consequence: 'spark',
};

const CLAMP_ORDER: MistakeDef = {
  code: 'battery.jump.wrong_order',
  kind: 'safety',
  label: 'Connected the jumper clamps in the wrong order',
  explain:
    'The order is red to the dead positive, red to the good positive, black to the good negative, then black to bare metal on the dead car. Any other order risks a short or a spark at the battery.',
  consequence: 'spark',
};

const REMOVE_ORDER: MistakeDef = {
  code: 'battery.jump.wrong_removal_order',
  kind: 'safety',
  label: 'Removed the jumper clamps in the wrong order',
  explain:
    'Clamps come off in exactly the reverse order they went on: the ground clamp first, the dead battery positive last.',
  consequence: 'spark',
};

const VOLT_OPTIONS = [
  'Fully charged: 12.6 volts or more',
  'Partly charged: about 12.4 volts',
  'Discharged: below 12.0 volts',
];

export const battery: LessonDef<BatteryVariant> = {
  id: 'battery',
  title: 'Battery & Jump-Start',
  summary: 'Test, disconnect in the safe order, replace a battery, and jump-start a car.',
  available: true,
  vehicles: ['sedan', 'pickup'],
  cartItems: [
    'multimeter',
    'battery-tester',
    'ratchet-10',
    'ratchet-14',
    'terminal-brush',
    'jumper-cables',
    'battery-new',
    'battery-wrong',
  ],
  intro:
    "Batteries cause more no-start calls than anything else. Today's car came in with a battery complaint. You'll test it, then do what the results say: clean it, replace it, or jump-start it.",
  outro: 'Good work. Tested before guessing, and every cable went on and off in the safe order.',
  variant: (rng) => {
    const state = pick(rng, ['good', 'weak', 'dead'] as const);
    const jump = pick(rng, ['cables', 'pack'] as const);
    const r = (a: number, b: number) => Math.round((a + rng() * (b - a)) * 10) / 10;
    return {
      state,
      jump,
      restVolts: state === 'good' ? r(12.6, 12.7) : state === 'weak' ? r(12.3, 12.4) : r(11.3, 11.8),
      loadVolts: state === 'good' ? r(10.2, 10.8) : r(7.6, 8.6),
      chargingVolts: r(14.0, 14.4),
    };
  },
  stage: (v) => ({
    carNoseX: -0.2,
    donor: v.state === 'dead' && v.jump === 'cables',
    jumpPack: v.state === 'dead' && v.jump === 'pack',
    faults: v.state === 'dead' ? [] : ['terminals'],
  }),
  workOrder: (vehicle, v) => [
    `Complaint: ${v.state === 'dead' ? 'no crank, car will not start' : 'slow cranking in the morning'}`,
    `Battery: group ${vehicle.battery.group}, ${vehicle.battery.cca} CCA`,
    'Test before replacing',
  ],
  steps: (vehicle, v, units) => batterySteps(vehicle, v, units),
};

function batterySteps(vehicle: VehicleSpec, v: BatteryVariant, units: UnitSystem): StepDef[] {
  const volts = (n: number) => formatBoth('voltage', n, units);
  const group = vehicle.battery.group;

  const common: StepDef[] = [
    ppeStep(
      'Battery acid burns skin and eyes, and a battery can vent hydrogen gas that explodes from a single spark. Glasses and gloves, every time.',
    ),
    {
      id: 'hood',
      label: 'Open the hood',
      say: 'Pull the hood release at the front of the car and lift the hood.',
      hint: 'The battery is under the hood.',
      spot: 'battery',
      item: HAND,
      targets: ['hood-latch'],
      gesture: { kind: 'press' },
      effects: [{ fx: 'hood-open' }],
    },
    {
      id: 'volts',
      label: 'Measure the resting voltage',
      say: 'Touch the multimeter leads to the battery posts, red to positive and black to negative, and read the voltage.',
      hint: 'A multimeter on the two battery posts tells you the state of charge.',
      spot: 'battery',
      item: 'multimeter',
      targets: ['battery-posts'],
      gesture: { kind: 'press' },
      effects: [{ fx: 'inspect' }],
      readings: { 'battery-posts': { quantity: 'voltage', value: v.restVolts, note: 'Engine off, resting' } },
    },
    {
      id: 'volt-call',
      label: 'Read the state of charge',
      say: 'What does that voltage mean?',
      hint: '12.6 volts is full. Every tenth of a volt below that is a lot less charge.',
      item: HAND,
      targets: [],
      gesture: { kind: 'press' },
      choice: {
        prompt: `The battery reads ${volts(v.restVolts)} at rest. What is its state of charge?`,
        options: VOLT_OPTIONS,
        correct: v.state === 'good' ? 0 : v.state === 'weak' ? 1 : 2,
        wrong: {
          code: 'battery.test.misread_voltage',
          kind: 'value',
          label: 'Misread the battery voltage',
          explain:
            'A rested battery at 12.6 volts or more is full, about 12.4 is three-quarters, and under 12.0 is discharged. Small differences in volts mean big differences in charge.',
        },
      },
    },
  ];

  if (v.state === 'dead') return [...common, ...jumpSteps(v)];

  const passed = v.state === 'good';
  const loadSteps: StepDef[] = [
    {
      id: 'load-test',
      label: 'Load test the battery',
      say: 'Voltage alone does not prove a battery is healthy. Clip the load tester onto the posts and run the test.',
      hint: 'The blue tester on the cart puts a real load on the battery.',
      spot: 'battery',
      item: 'battery-tester',
      targets: ['battery-posts'],
      gesture: { kind: 'hold', seconds: 2 },
      wrongItems: {
        multimeter: {
          code: 'battery.test.no_load_test',
          kind: 'wrong-item',
          label: 'Tried to judge battery health with only a voltmeter',
          explain:
            'A worn battery can show good voltage with no load and still collapse when the starter pulls on it. Only a load test shows that.',
        },
      },
      effects: [{ fx: 'inspect' }],
      readings: {
        'battery-posts': {
          text: passed ? `PASS: ${volts(v.loadVolts)} under load` : `FAIL: ${volts(v.loadVolts)} under load`,
          note: `Rated ${vehicle.battery.cca} CCA`,
        },
      },
    },
    {
      id: 'load-call',
      label: 'Decide what the battery needs',
      say: 'Based on the load test, what does this battery need?',
      hint: 'Look at the result on the tester, and at the battery posts.',
      item: HAND,
      targets: [],
      gesture: { kind: 'press' },
      choice: {
        prompt: passed
          ? 'The load test PASSED, but the posts are crusted with white-green corrosion. What now?'
          : 'The load test FAILED. What now?',
        options: [
          'Keep the battery, clean the terminals',
          'Replace the battery',
          'Recharge it and send the customer home',
        ],
        correct: passed ? 0 : 1,
        wrong: {
          code: 'battery.test.wrong_call',
          kind: 'value',
          label: 'Made the wrong call after the load test',
          explain: passed
            ? 'The battery passed, so replacing it sells the customer a part they do not need. Corroded terminals cause slow cranking, so clean them.'
            : 'A battery that fails a load test cannot hold up under the starter, even after a charge. It gets replaced.',
        },
      },
    },
  ];

  const disconnect: StepDef[] = [
    {
      id: 'neg-off',
      label: 'Disconnect the negative (−) cable first',
      say: 'Loosen the negative cable clamp with the 10 millimeter wrench and lift it off the post. Negative always comes off first.',
      hint: 'One cable must come off before the other. Think about what the car body is connected to.',
      spot: 'battery',
      item: 'ratchet-10',
      targets: ['batt-neg'],
      gesture: { kind: 'twist', turns: 1, dir: 'ccw' },
      wrongTargets: { 'batt-pos': POS_FIRST },
      effects: [{ fx: 'cable-off' }],
      safety: true,
    },
    {
      id: 'pos-off',
      label: 'Disconnect the positive (+) cable',
      say: 'Now the positive cable. With the negative off, the wrench cannot short to the body.',
      hint: 'The red cable is next.',
      spot: 'battery',
      item: 'ratchet-10',
      targets: ['batt-pos'],
      gesture: { kind: 'twist', turns: 1, dir: 'ccw' },
      effects: [{ fx: 'cable-off' }],
    },
  ];

  const connect: StepDef[] = [
    {
      id: 'pos-on',
      label: 'Connect the positive (+) cable first',
      say: 'Reconnect in the reverse order. Positive cable on first, tighten it snug.',
      hint: 'Going back together, the order flips.',
      spot: 'battery',
      item: 'ratchet-10',
      targets: ['batt-pos'],
      gesture: { kind: 'twist', turns: 1, dir: 'cw' },
      wrongTargets: { 'batt-neg': NEG_ON_FIRST },
      effects: [{ fx: 'cable-on' }],
      safety: true,
    },
    {
      id: 'neg-on',
      label: 'Connect the negative (−) cable last',
      say: 'Negative cable on last, and snug it down.',
      hint: 'One cable left.',
      spot: 'battery',
      item: 'ratchet-10',
      targets: ['batt-neg'],
      gesture: { kind: 'twist', turns: 1, dir: 'cw' },
      effects: [{ fx: 'cable-on' }],
    },
    {
      id: 'start',
      label: 'Start the engine',
      say: 'Start the engine so we can check the charging system.',
      hint: 'The start button is on the dash.',
      spot: 'driver',
      item: HAND,
      targets: ['start-button'],
      gesture: { kind: 'press' },
      effects: [{ fx: 'engine-run' }],
    },
    {
      id: 'charging',
      label: 'Check the charging voltage',
      say: 'With the engine running, read the voltage at the posts again. Now you are measuring the alternator.',
      hint: 'Same meter, same posts, engine running.',
      spot: 'battery',
      item: 'multimeter',
      targets: ['battery-posts'],
      gesture: { kind: 'press' },
      effects: [{ fx: 'inspect' }],
      readings: { 'battery-posts': { quantity: 'voltage', value: v.chargingVolts, note: 'Engine running' } },
    },
    {
      id: 'charging-call',
      label: 'Judge the charging system',
      say: 'Is the alternator charging correctly?',
      hint: 'A healthy charging system reads about 13.8 to 14.7 volts.',
      item: HAND,
      targets: [],
      gesture: { kind: 'press' },
      choice: {
        prompt: `Engine running: ${volts(v.chargingVolts)}. The normal range is ${volts(13.8)} to ${volts(14.7)}.`,
        options: ['Charging normally', 'Not charging: alternator problem', 'Overcharging: voltage regulator problem'],
        correct: 0,
        wrong: {
          code: 'battery.charging.misread',
          kind: 'value',
          label: 'Misjudged the charging voltage',
          explain:
            'With the engine running, 13.8 to 14.7 volts means the alternator is charging normally. Below that it is not charging; above it, it is overcharging.',
        },
        right: 'Correct. The charging system is healthy, so the battery will stay charged.',
      },
    },
  ];

  if (passed) {
    return [
      ...common,
      ...loadSteps,
      ...disconnect,
      {
        id: 'clean',
        label: 'Clean the posts and cable ends',
        say: 'Scrub the corrosion off both battery posts and the inside of both cable clamps with the terminal brush, until the metal shines.',
        hint: 'The wire brush on the cart cleans posts and clamps.',
        why: 'Corrosion is a poor conductor. Even a thin crust can stop the starter from getting enough current on a cold morning.',
        spot: 'battery',
        item: 'terminal-brush',
        targets: ['batt-pos', 'batt-neg', 'cable-pos', 'cable-neg'],
        gesture: { kind: 'hold', seconds: 1 },
        effects: [{ fx: 'clean' }],
      },
      ...connect,
    ];
  }

  return [
    ...common,
    ...loadSteps,
    ...disconnect,
    {
      id: 'holddown-off',
      label: 'Remove the battery hold-down',
      say: 'Unbolt the hold-down clamp that holds the battery in its tray.',
      hint: 'Something keeps the battery from bouncing around.',
      spot: 'battery',
      item: 'ratchet-10',
      targets: ['batt-holddown'],
      gesture: { kind: 'twist', turns: 2, dir: 'ccw' },
      skipMistake: HOLDDOWN,
      effects: [{ fx: 'holddown' }],
    },
    {
      id: 'battery-out',
      label: 'Lift the old battery out',
      say: 'Lift the battery straight up and out, keeping it level. Batteries are heavy, so lift with your legs.',
      hint: 'The battery is free now.',
      spot: 'battery',
      item: HAND,
      targets: ['battery'],
      gesture: { kind: 'hold', seconds: 1.2 },
      requires: ['holddown-off'],
      effects: [{ fx: 'battery-out' }],
    },
    {
      id: 'clean-cables',
      label: 'Clean the cable clamps',
      say: 'Before the new battery goes in, scrub the inside of both cable clamps with the terminal brush.',
      hint: 'A new battery deserves clean clamps.',
      spot: 'battery',
      item: 'terminal-brush',
      targets: ['cable-pos', 'cable-neg'],
      gesture: { kind: 'hold', seconds: 1 },
      effects: [{ fx: 'clean' }],
    },
    {
      id: 'core',
      label: 'Put the old battery on the core return',
      say: 'Carry the old battery to the core return pallet by the battery bench. Old batteries are recycled. Almost all of the lead gets reused.',
      hint: 'The old battery does not go in the trash.',
      spot: 'bench',
      item: 'old-battery',
      targets: ['core-shelf'],
      gesture: { kind: 'press' },
      effects: [{ fx: 'battery-core' }],
    },
    {
      id: 'install',
      label: `Install a new group ${group} battery`,
      say: `Pick up the new group ${group} battery from the bench and set it in the tray, posts on the same side as the old one.`,
      hint: `The work order lists group ${group}. Check the label.`,
      spot: 'battery',
      item: 'battery-new',
      targets: ['batt-tray'],
      gesture: { kind: 'press' },
      wrongItems: { 'battery-wrong': WRONG_GROUP },
      effects: [{ fx: 'battery-in' }],
    },
    {
      id: 'holddown-on',
      label: 'Refit the hold-down',
      say: 'Bolt the hold-down back on so the battery cannot move.',
      hint: 'The clamp you removed goes back on.',
      spot: 'battery',
      item: 'ratchet-10',
      targets: ['batt-holddown'],
      gesture: { kind: 'twist', turns: 2, dir: 'cw' },
      skipMistake: {
        code: 'battery.holddown.missing',
        kind: 'procedure',
        label: 'Left the hold-down off the new battery',
        explain:
          'A loose battery bounces on every bump. It can crack the case, leak acid or short against the hood. The hold-down always goes back on.',
      },
      effects: [{ fx: 'holddown' }],
    },
    ...connect,
  ];
}

function jumpSteps(v: BatteryVariant): StepDef[] {
  const cables = v.jump === 'cables';
  const final: StepDef = {
    id: 'next-step',
    label: 'Tell the customer what comes next',
    say: 'It started. Is the job done?',
    hint: 'A jump-start gets a car running. It does not fix anything.',
    item: HAND,
    targets: [],
    gesture: { kind: 'press' },
    choice: {
      prompt: 'The car is running after the jump-start. What should happen next?',
      options: [
        'Fully charge the battery, load test it, and check the charging system',
        'Nothing, it runs now',
        'Replace the starter motor',
      ],
      correct: 0,
      wrong: {
        code: 'battery.jump.no_follow_up',
        kind: 'procedure',
        label: 'Sent the car off without finding out why the battery went flat',
        explain:
          'A jump only gets the engine running. The battery still needs a full charge and a load test, and the charging system needs checking, or the car will not start again tomorrow.',
      },
      right: 'Exactly. Charge it, test it and check the alternator, so the customer is not stranded again.',
    },
  };

  if (cables) {
    return [
      {
        id: 'clamps-on',
        label: 'Connect the jumper cables in order',
        say: 'Red clamp on the dead battery positive. Other red clamp on the good battery positive. Black clamp on the good battery negative. Last black clamp on bare metal on the dead engine, away from the battery.',
        hint: 'Red, red, black, then bare metal. Never finish on the dead battery.',
        why: 'The last connection makes a small spark, so it goes on bare metal away from any battery gas.',
        spot: 'donor',
        item: 'jumper-cables',
        targets: ['batt-pos', 'donor-pos', 'donor-neg', 'engine-ground'],
        ordered: true,
        gesture: { kind: 'press' },
        orderMistake: CLAMP_ORDER,
        wrongTargets: { 'batt-neg': LAST_CLAMP_ON_BATTERY },
        effects: [{ fx: 'clamp-on' }],
        safety: true,
      },
      {
        id: 'donor-start',
        label: 'Start the donor car',
        say: 'Start the donor car and let it run for a minute to put some charge in.',
        hint: 'The good car runs first.',
        spot: 'donor',
        item: HAND,
        targets: ['donor-start'],
        gesture: { kind: 'press' },
        effects: [{ fx: 'donor-start' }],
      },
      {
        id: 'start',
        label: 'Start the dead car',
        say: 'Now start the car with the dead battery.',
        hint: 'Now the car you are working on.',
        spot: 'driver',
        item: HAND,
        targets: ['start-button'],
        gesture: { kind: 'press' },
        requires: ['clamps-on'],
        effects: [{ fx: 'engine-run' }],
      },
      {
        id: 'clamps-off',
        label: 'Remove the clamps in reverse order',
        say: 'Both cars running. Take the clamps off in reverse order: engine ground first, then good negative, good positive, and the dead positive last.',
        hint: 'Exactly the reverse of how they went on.',
        spot: 'donor',
        item: HAND,
        targets: ['engine-ground', 'donor-neg', 'donor-pos', 'batt-pos'],
        ordered: true,
        gesture: { kind: 'press' },
        orderMistake: REMOVE_ORDER,
        effects: [{ fx: 'clamp-off' }],
        safety: true,
      },
      final,
    ];
  }

  return [
    {
      id: 'clamps-on',
      label: 'Clamp the jump pack on: red, then black to ground',
      say: 'Check that the jump pack is switched off. Red clamp on the dead battery positive, then the black clamp on bare metal on the engine, away from the battery.',
      hint: 'Red to positive first. Black goes to ground, not the battery.',
      spot: 'battery',
      item: 'pack-clamps',
      targets: ['batt-pos', 'engine-ground'],
      ordered: true,
      gesture: { kind: 'press' },
      orderMistake: CLAMP_ORDER,
      wrongTargets: { 'batt-neg': LAST_CLAMP_ON_BATTERY },
      effects: [{ fx: 'clamp-on' }],
      safety: true,
    },
    {
      id: 'pack-on',
      label: 'Switch the jump pack on',
      say: 'Clamps are on. Switch the jump pack on.',
      hint: 'The pack has a power button.',
      spot: 'battery',
      item: HAND,
      targets: ['pack-power'],
      gesture: { kind: 'press' },
      effects: [{ fx: 'pack-power' }],
    },
    {
      id: 'start',
      label: 'Start the car',
      say: 'Now start the car.',
      hint: 'The start button is on the dash.',
      spot: 'driver',
      item: HAND,
      targets: ['start-button'],
      gesture: { kind: 'press' },
      requires: ['pack-on'],
      effects: [{ fx: 'engine-run' }],
    },
    {
      id: 'pack-off',
      label: 'Switch the jump pack off',
      say: 'It is running. Switch the pack off before you touch the clamps.',
      hint: 'Power off before the clamps come off.',
      spot: 'battery',
      item: HAND,
      targets: ['pack-power'],
      gesture: { kind: 'press' },
      effects: [{ fx: 'pack-power' }],
    },
    {
      id: 'clamps-off',
      label: 'Remove the clamps: black first, then red',
      say: 'Black clamp off first, then the red clamp.',
      hint: 'Reverse order.',
      spot: 'battery',
      item: HAND,
      targets: ['engine-ground', 'batt-pos'],
      ordered: true,
      gesture: { kind: 'press' },
      requires: ['pack-off'],
      orderMistake: REMOVE_ORDER,
      effects: [{ fx: 'clamp-off' }],
      safety: true,
    },
    final,
  ];
}
