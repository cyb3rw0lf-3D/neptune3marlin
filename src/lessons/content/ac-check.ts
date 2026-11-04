import { pick } from '../../core/random';
import type { VehicleSpec } from '../../vehicles/specs';
import { HAND, type LessonDef, type MistakeDef, type StepDef } from '../engine/types';
import { engineOffStep, exhaustStep, ppeStep, runEngineStep } from './common';

export type AcFault = 'normal' | 'low' | 'blocked' | 'over' | 'fan';

export interface AcVariant {
  fault: AcFault;
}

/** Gauge readings at an 80 °F shop: low side psi, high side psi, vent °F. */
const READINGS: Record<AcFault, [number, number, number]> = {
  normal: [35, 200, 42],
  low: [18, 125, 60],
  blocked: [6, 150, 64],
  over: [55, 300, 58],
  fan: [50, 350, 62],
};

const FAULTS: AcFault[] = ['normal', 'low', 'blocked', 'over', 'fan'];
const DIAGNOSES = [
  'Working normally',
  'Low on refrigerant (a leak)',
  'Restriction in the system (blocked orifice or expansion valve)',
  'Overcharged with refrigerant',
  'Condenser fan not running',
];

const SWAPPED: MistakeDef = {
  code: 'ac.coupler.swapped',
  kind: 'procedure',
  label: 'Tried to put a gauge coupler on the wrong port',
  explain:
    'The low and high ports are different sizes on purpose, so the gauges cannot be swapped. Blue goes on the low side (L), red on the high side (H). Forcing a coupler damages the port valve and can release refrigerant.',
};

const NO_GLASSES: MistakeDef = {
  code: 'ac.ppe.missing',
  kind: 'safety',
  label: 'Connected A/C gauges without safety glasses and gloves',
  explain:
    'Refrigerant leaves a port at around minus 20 degrees. A spray in the eye or on bare skin causes frostbite in a second. Glasses and gloves go on before any coupler touches a port.',
  consequence: 'eye-splash',
};

const EV_HV: MistakeDef = {
  code: 'ac.ev.hv_compressor',
  kind: 'safety',
  label: 'Did not respect the high-voltage A/C compressor',
  explain:
    'On an electric car the A/C compressor runs on the high-voltage battery. Its orange cables carry hundreds of volts while the car is on. Hands stay off them; only a certified tech works on them, after the car is made safe.',
};

const VENTING: MistakeDef = {
  code: 'ac.refrigerant.vented',
  kind: 'procedure',
  label: 'Chose an illegal way to handle refrigerant',
  explain:
    'Releasing refrigerant into the air is illegal and harms the environment. Adding or recovering it takes EPA Section 609 certification and a recovery machine. Your job here is the diagnosis and an honest write-up.',
};

export const acCheck: LessonDef<AcVariant> = {
  id: 'ac-check',
  title: 'A/C Performance Check',
  summary: 'Connect the gauges, read pressures and vent temperature, and diagnose the A/C.',
  available: true,
  vehicles: ['sedan', 'pickup', 'ev'],
  cartItems: ['coupler-low', 'coupler-high', 'vent-thermo', 'exhaust-hose', 'rag'],
  intro:
    'A/C problems show up as numbers: the pressure on the low side, the pressure on the high side, and how cold the air at the vent is. Read all three, compare them with what a healthy system shows, and you can tell what is wrong without guessing.',
  outro:
    'Diagnosis done the right way: gauges on the right ports, honest readings, and refrigerant left to a certified tech with recovery equipment.',
  variant: (rng) => ({ fault: pick(rng, FAULTS) }),
  workOrder: (vehicle) => [
    `${vehicle.name}: A/C performance check`,
    'Shop air: 80 °F. Normal: low 25–45 psi, high 150–250 psi, vent 38–48 °F',
    'Blue coupler = low side (L), red = high side (H)',
  ],
  stage: (_v, vehicle) => ({ exhaust: !vehicle.hv }),
  steps: (vehicle, v) => steps(vehicle, v),
};

function steps(vehicle: VehicleSpec, v: AcVariant): StepDef[] {
  const ev = !!vehicle.hv;
  const [low, high, vent] = READINGS[v.fault];
  const ppe = ppeStep(
    'Refrigerant can spray out of a port at minus 20 degrees. Glasses and gloves protect you from frostbite.',
  );
  ppe.skipMistake = NO_GLASSES;
  const out: StepDef[] = [
    ppe,
    {
      id: 'hood',
      label: ev ? 'Open the frunk' : 'Open the hood',
      say: 'Pull the release and lift the hood. The A/C service ports are under it.',
      hint: 'The ports are in the engine bay.',
      spot: 'hood',
      item: HAND,
      targets: ['hood-latch'],
      gesture: { kind: 'press' },
      effects: [{ fx: 'hood-open' }],
    },
  ];
  if (ev) {
    out.push({
      id: 'hv-aware',
      label: 'Spot the high-voltage A/C parts',
      say: 'On this electric car, which A/C part must you keep your hands off while the car is on?',
      hint: 'Orange means high voltage.',
      item: HAND,
      targets: [],
      gesture: { kind: 'press' },
      choice: {
        prompt: 'Which A/C part is high voltage on the Wren EV?',
        options: [
          'The electric compressor and its orange cables',
          'The blue low-side port cap',
          'The cabin air filter',
        ],
        correct: 0,
        wrong: EV_HV,
        right: 'Right. Orange cables mean high voltage. Look, don’t touch.',
      },
    });
  }
  out.push({
    id: 'couplers',
    label: 'Connect the gauge couplers (engine off)',
    say: 'With the engine off, snap the blue coupler onto the low-side port marked L, and the red coupler onto the high-side port marked H.',
    hint: 'Blue on L, red on H. The ports are different sizes.',
    spot: 'hood',
    item: 'coupler-low',
    targets: ['ac-low-port', 'ac-high-port'],
    targetItems: { 'ac-low-port': 'coupler-low', 'ac-high-port': 'coupler-high' },
    gesture: { kind: 'press' },
    requires: ['ppe'],
    wrongItems: { 'coupler-high': SWAPPED, 'coupler-low': SWAPPED },
    effects: [{ fx: 'inspect' }],
  });
  if (!ev) out.push(exhaustStep());
  out.push(
    runEngineStep(
      'run',
      ev ? 'Switch the car on, A/C on max' : 'Start the engine, A/C on max',
      `${ev ? 'Switch the car on' : 'Start the engine'}, set the A/C to max cold with the fan on high and the doors open, and let it run for a few minutes.`,
      ev ? ['couplers'] : ['couplers', 'exhaust'],
    ),
    {
      id: 'vent',
      label: 'Measure the vent temperature',
      say: 'Push the vent thermometer into the center dash vent and read it.',
      hint: 'The center vent is in the middle of the dash.',
      spot: 'driver',
      item: 'vent-thermo',
      targets: ['center-vent'],
      gesture: { kind: 'press' },
      requires: ['run'],
      readings: { 'center-vent': { text: `Center vent: ${vent} °F` } },
      effects: [{ fx: 'inspect' }],
    },
    {
      id: 'gauges',
      label: 'Read the gauges',
      say: 'Read both gauges on the manifold set.',
      hint: 'The gauge set hangs from the hood.',
      spot: 'hood',
      item: HAND,
      targets: ['ac-high-port'],
      gesture: { kind: 'press' },
      readings: { 'ac-high-port': { text: `Low side: ${low} psi · High side: ${high} psi` } },
      effects: [{ fx: 'inspect' }],
    },
    {
      id: 'diagnose',
      label: 'Diagnose the A/C',
      say: 'Compare low side, high side and vent temperature with the normal ranges on the work order.',
      hint: 'Low and high both low, both high, or one low and one high: each points to a different fault.',
      item: HAND,
      targets: [],
      gesture: { kind: 'press' },
      choice: {
        prompt: `Low ${low} psi, high ${high} psi, vent ${vent} °F at 80 °F. What is the diagnosis?`,
        options: DIAGNOSES,
        correct: FAULTS.indexOf(v.fault),
        wrong: {
          code: 'ac.diagnosis.wrong',
          kind: 'value',
          label: 'Misdiagnosed the A/C',
          explain:
            'Both sides low with warm air: low charge. Low side very low with the high side not high: a restriction. Both sides high: overcharge, or the condenser fan not moving air. A healthy system shows 25 to 45 low, 150 to 250 high, and cold air around 40 degrees.',
        },
      },
    },
    engineOffStep(
      'off',
      ev ? 'Switch the car off before you touch the couplers.' : 'Turn the engine off before you touch the couplers.',
    ),
    {
      id: 'disconnect',
      label: 'Disconnect the couplers',
      say: 'With everything off, unsnap both couplers and put the port caps back on.',
      hint: 'Caps back on keep dirt out of the valves.',
      spot: 'hood',
      item: HAND,
      targets: ['ac-low-port', 'ac-high-port'],
      gesture: { kind: 'press' },
      effects: [{ fx: 'inspect' }],
    },
    {
      id: 'next',
      label: 'Decide the next step',
      say: 'The system needs refrigerant work. Who does it, and how?',
      hint: 'Refrigerant work is regulated.',
      item: HAND,
      targets: [],
      gesture: { kind: 'press' },
      choice: {
        prompt: 'If this system needs refrigerant recovered or added, who does it?',
        options: [
          'A tech with EPA Section 609 certification, using a recovery machine',
          'Anyone, with a can of refrigerant from the parts store',
          'Let some refrigerant out first to see if it helps',
        ],
        correct: 0,
        wrong: VENTING,
        right: 'Right. Write it up, and a certified tech does the refrigerant work.',
      },
    },
    {
      id: 'close',
      label: ev ? 'Close the frunk' : 'Close the hood',
      say: 'Lower the hood gently and make sure it latches.',
      hint: 'Leave the car the way it came in.',
      spot: 'hood',
      item: HAND,
      targets: ['hood-latch'],
      gesture: { kind: 'press' },
      effects: [{ fx: 'hood-close' }],
    },
  );
  return out;
}
