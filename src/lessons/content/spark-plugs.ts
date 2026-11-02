import { pick } from '../../core/random';
import { formatBoth, type UnitSystem } from '../../core/units';
import type { VehicleSpec } from '../../vehicles/specs';
import { HAND, type LessonDef, type MistakeDef, type StepDef } from '../engine/types';
import { exhaustStep, ppeStep, runEngineStep } from './common';

export type PlugCondition = 'normal' | 'carbon' | 'oil' | 'overheated' | 'worn';

export interface PlugVariant {
  condition: PlugCondition;
  /** The new plug's gap out of the box, in inches. */
  newGapIn: number;
}

const CONDITIONS: PlugCondition[] = ['normal', 'carbon', 'oil', 'overheated', 'worn'];

const LOOKS: Record<PlugCondition, string> = {
  normal: 'Light tan deposits, even wear',
  carbon: 'Dry, black, sooty deposits',
  oil: 'Wet, oily black deposits',
  overheated: 'Blistered white insulator, burned electrode',
  worn: 'Rounded electrode, gap far too wide',
};

const CAUSES = [
  'Normal: the engine is healthy, the plug is just due',
  'Running rich, or lots of very short trips',
  'Oil getting into the cylinder (rings or valve seals)',
  'Running too hot: wrong heat range or a lean mixture',
  'Worn out: well past its service interval',
];

const HOT_ENGINE: MistakeDef = {
  code: 'plugs.hot_engine',
  kind: 'procedure',
  label: 'Started on the plugs without checking the engine was cold',
  explain:
    'Most heads are aluminum. Taking a steel plug out of a hot aluminum head can pull the threads right out with it. Always check that the engine is cold first.',
};

const DEBRIS: MistakeDef = {
  code: 'plugs.no_blow_out',
  kind: 'procedure',
  label: 'Removed the plug without blowing out the well',
  explain:
    'Dirt and sand collect in the plug well. Pull the plug first and that dirt falls straight into the cylinder, where it scores the cylinder wall. Blow the well clean with compressed air before the plug comes out.',
};

const CROSS_THREAD: MistakeDef = {
  code: 'plugs.cross_thread',
  kind: 'procedure',
  label: 'Started the new plug with the ratchet instead of by hand',
  explain:
    'With a ratchet you cannot feel a plug going in crooked. A cross-threaded plug ruins the threads in the head. Always start plugs by hand, at least two full turns.',
  consequence: 'stripped-thread',
};

export const sparkPlugs: LessonDef<PlugVariant> = {
  id: 'spark-plugs',
  title: 'Spark Plugs & Ignition',
  summary: 'Read old plugs for clues, gap and torque new ones.',
  available: true,
  vehicles: ['sedan', 'pickup'],
  cartItems: [
    'ir-thermometer',
    'air-blower',
    'plug-socket',
    'feeler-gauge',
    'torque-wrench',
    'dielectric-grease',
    'ratchet-14',
    'scan-tool',
    'exhaust-hose',
    'new-plug',
  ],
  intro:
    'Spark plugs fire thousands of times a minute. Today you will replace one step by step, and read the old plug, because its tip tells you how the engine has been running.',
  outro: 'Nice work. Clean well, a plug started by hand, torqued to spec, and an engine with zero misfires.',
  variant: (rng, vehicle) => {
    const gap = vehicle.ignition?.plugGapIn ?? 0.044;
    return {
      condition: pick(rng, CONDITIONS),
      newGapIn: rng() < 0.5 ? gap : Math.round((gap - 0.008) * 1000) / 1000,
    };
  },
  stage: () => ({
    trayItem: 'new-plug',
    exhaust: true,
    hoodOpen: true,
    scan: {
      codes: ['Stored codes:', 'No codes stored.'],
      freeze: ['Freeze frame:', 'No codes stored.'],
      live: ['Live data (idle):', 'Misfire count', 'All cylinders: 0', 'Idle smooth'],
    },
  }),
  workOrder: (vehicle, _v, units) => {
    const ign = vehicle.ignition;
    if (!ign) return [];
    return [
      `${vehicle.engine}: replace spark plugs`,
      `Gap: ${formatBoth('length', ign.plugGapIn, units)}`,
      `Torque: ${formatBoth('torque', ign.plugTorque, units)}`,
    ];
  },
  steps: (vehicle, v, units) => plugSteps(vehicle, v, units),
};

function plugSteps(vehicle: VehicleSpec, v: PlugVariant, units: UnitSystem): StepDef[] {
  const ign = vehicle.ignition;
  if (!ign) throw new Error(`${vehicle.name} has no spark plugs`);
  const gap = formatBoth('length', ign.plugGapIn, units);
  const newGap = formatBoth('length', v.newGapIn, units);
  const torque = formatBoth('torque', ign.plugTorque, units);
  const gapOff = v.newGapIn !== ign.plugGapIn;
  const others = ign.cylinders - 1;

  const gapSteps: StepDef[] = gapOff
    ? [
        {
          id: 'gap-call',
          label: 'Decide on the gap',
          say: 'The gap is not what the work order says. What do you do?',
          hint: 'Compare the gauge reading with the spec.',
          item: HAND,
          targets: [],
          gesture: { kind: 'press' },
          choice: {
            prompt: `The new plug's gap measures ${newGap}. The spec is ${gap}. What now?`,
            options: [
              'Open the gap to spec with the gap tool',
              'Install it as is. New plugs are always right.',
              'Close the gap a bit more',
            ],
            correct: 0,
            wrong: {
              code: 'plugs.gap.wrong_call',
              kind: 'value',
              label: 'Made the wrong call on the plug gap',
              explain:
                'Plugs get bumped in shipping, so the gap can be off even on a new plug. A gap that is too small makes a weak spark and can cause misfires. Set it to spec.',
            },
          },
        },
        {
          id: 'gap-set',
          label: `Set the gap to ${gap}`,
          say: 'Use the gap tool to gently open the ground electrode until the gauge slides through at the spec.',
          hint: 'Gently bend the side electrode, never the center one.',
          spot: 'cart',
          item: 'feeler-gauge',
          targets: ['new-plug-gap'],
          gesture: { kind: 'hold', seconds: 1.2 },
          effects: [{ fx: 'inspect' }],
          readings: { 'new-plug-gap': { quantity: 'length', value: ign.plugGapIn, note: 'On spec' } },
        },
      ]
    : [];

  return [
    ppeStep(
      'Old plugs and coil wells are dirty, and compressed air throws grit. Glasses on, and gloves keep the grease off your hands.',
    ),
    {
      id: 'cold-check',
      label: 'Check that the engine is cold',
      say: 'Point the infrared thermometer at the engine and read the temperature.',
      hint: 'There is a tool on the cart that reads temperature from a distance.',
      spot: 'hood',
      item: 'ir-thermometer',
      targets: ['engine-cover'],
      gesture: { kind: 'press' },
      skipMistake: HOT_ENGINE,
      effects: [{ fx: 'inspect' }],
      readings: { 'engine-cover': { text: '84 °F (29 °C)', note: 'Cold: safe to remove the plugs' } },
    },
    {
      id: 'coil-off',
      label: 'Remove the coil on cylinder 1',
      say: 'Unplug the connector on the cylinder 1 coil and pull the coil straight up out of its well.',
      hint: 'Cylinder 1 is the first coil in the row.',
      spot: 'hood',
      item: HAND,
      targets: ['coil-1'],
      gesture: { kind: 'hold', seconds: 0.8 },
      requires: ['cold-check'],
      effects: [{ fx: 'coil-out' }],
    },
    {
      id: 'blow-out',
      label: 'Blow out the plug well',
      say: 'Before the plug comes out, blow the well clean with compressed air.',
      hint: 'Anything sitting around the plug falls into the engine once the plug is out.',
      spot: 'hood',
      item: 'air-blower',
      targets: ['plug-well-1'],
      gesture: { kind: 'hold', seconds: 1 },
      skipMistake: DEBRIS,
      effects: [{ fx: 'inspect' }],
    },
    {
      id: 'plug-out',
      label: 'Remove the old spark plug',
      say: 'Use the spark plug socket on the extension and turn the plug counterclockwise until it comes out.',
      hint: 'The plug socket with the long extension reaches down the well.',
      spot: 'hood',
      item: 'plug-socket',
      targets: ['plug-well-1'],
      gesture: { kind: 'twist', turns: 2, dir: 'ccw' },
      requires: ['blow-out'],
      wrongItems: {
        'ratchet-14': {
          code: 'plugs.wrong_socket',
          kind: 'wrong-item',
          label: 'Used a regular socket on the spark plug',
          explain:
            'A regular socket is too shallow to reach down the well and has no rubber insert, so it can crack the plug porcelain. Use the spark plug socket.',
        },
      },
      effects: [{ fx: 'plug-out' }],
    },
    {
      id: 'read-plug',
      label: 'Read the old plug',
      say: 'Look closely at the tip of the old plug on the parts tray.',
      hint: 'The old plug is on the tray.',
      spot: 'cart',
      item: HAND,
      targets: ['old-plug-view'],
      gesture: { kind: 'press' },
      effects: [{ fx: 'inspect' }],
      readings: { 'old-plug-view': { text: LOOKS[v.condition], note: 'Cylinder 1 plug' } },
    },
    {
      id: 'plug-cause',
      label: 'Decide what the plug is telling you',
      say: 'What does that plug tell you about the engine?',
      hint: 'Color and deposits are clues: tan is normal, black means fuel or oil, white means heat.',
      item: HAND,
      targets: [],
      gesture: { kind: 'press' },
      choice: {
        prompt: `The old plug shows: ${LOOKS[v.condition].toLowerCase()}. What is the most likely cause?`,
        options: CAUSES,
        correct: CONDITIONS.indexOf(v.condition),
        wrong: {
          code: 'plugs.misread_plug',
          kind: 'value',
          label: 'Misread the old spark plug',
          explain:
            'Light tan is normal. Dry black soot means too much fuel. Wet oily deposits mean oil is getting in. A blistered white tip means it ran too hot. A rounded electrode with a wide gap is simply worn out.',
        },
        right: 'Good read. A plug is a window into the cylinder.',
      },
    },
    {
      id: 'gap-check',
      label: 'Check the gap on the new plug',
      say: `Slide the gap gauge between the electrodes of the new plug. The spec is ${gap}.`,
      hint: 'The gap gauge is the round tool on the cart.',
      spot: 'cart',
      item: 'feeler-gauge',
      targets: ['new-plug-gap'],
      gesture: { kind: 'press' },
      effects: [{ fx: 'inspect' }],
      readings: { 'new-plug-gap': { quantity: 'length', value: v.newGapIn, note: `Spec ${gap}` } },
    },
    ...gapSteps,
    {
      id: 'thread-in',
      label: 'Thread the new plug in by hand',
      say: 'Start the new plug by hand, turning it clockwise at least two full turns. If it is hard to turn, it is crooked: back it out and start again.',
      hint: 'Fingers first, tools second.',
      spot: 'hood',
      item: 'new-plug',
      targets: ['plug-well-1'],
      gesture: { kind: 'twist', turns: 2, dir: 'cw' },
      requires: ['gap-check'],
      wrongItems: { 'plug-socket': CROSS_THREAD },
      effects: [{ fx: 'spark-in' }],
    },
    {
      id: 'torque',
      label: `Torque the plug to ${torque}`,
      say: `Set the torque wrench to ${torque} and tighten until it clicks.`,
      hint: 'The plug torque is on the work order.',
      spot: 'hood',
      item: 'torque-wrench',
      targets: ['plug-well-1'],
      gesture: { kind: 'twist', turns: 0.25, dir: 'cw' },
      measure: {
        quantity: 'torque',
        spec: ign.plugTorque,
        min: ign.plugTorque - 1,
        max: ign.plugTorque + 2,
        source: 'setting',
        over: {
          code: 'plugs.overtorque',
          kind: 'value',
          label: 'Overtightened the spark plug',
          explain: `Too much torque stretches the plug shell and can strip the head threads. The spec is ${torque}.`,
          consequence: 'stripped-thread',
        },
        under: {
          code: 'plugs.undertorque',
          kind: 'value',
          label: 'Undertightened the spark plug',
          explain: `A loose plug cannot pass its heat into the head. It overheats, and it can even blow out of the threads. The spec is ${torque}.`,
        },
      },
      effects: [{ fx: 'plug-torque' }],
    },
    {
      id: 'grease',
      label: 'Put dielectric grease in the coil boot',
      say: 'Put a small dab of dielectric grease inside the coil boot.',
      hint: 'The coil is lying beside its well.',
      why: 'Dielectric grease seals out moisture and keeps the boot from sticking to the plug next time.',
      spot: 'hood',
      item: 'dielectric-grease',
      targets: ['coil-boot-1'],
      gesture: { kind: 'press' },
      effects: [{ fx: 'inspect' }],
    },
    {
      id: 'coil-on',
      label: 'Reinstall the coil and plug in its connector',
      say: 'Press the coil back down onto the plug until it seats, and plug in the connector.',
      hint: 'The coil goes back where it came from.',
      why: `The other ${others} cylinders get exactly the same steps. I will fast-forward through them for you.`,
      spot: 'hood',
      item: 'coil-c1',
      targets: ['plug-well-1'],
      gesture: { kind: 'press' },
      effects: [{ fx: 'coil-in' }],
      stepEffects: [{ fx: 'plugs-rest' }],
    },
    exhaustStep(),
    runEngineStep('run', 'Start the engine', 'Start the engine and let it idle.', ['exhaust']),
    {
      id: 'scan-in',
      label: 'Plug in the scan tool',
      say: 'Plug the scan tool into the OBD-II port under the dash so we can check for misfires.',
      hint: 'The scan tool hangs on the lift post.',
      spot: 'driver',
      item: 'scan-tool',
      targets: ['dlc'],
      gesture: { kind: 'press' },
      effects: [{ fx: 'scan-plug' }],
    },
    {
      id: 'misfire-check',
      label: 'Check for misfires on live data',
      say: 'Press Live data and check the misfire counters.',
      hint: 'Live data shows misfire counts per cylinder.',
      spot: 'driver',
      item: HAND,
      targets: ['scan-live'],
      gesture: { kind: 'press' },
    },
  ];
}
