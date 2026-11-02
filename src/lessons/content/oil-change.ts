import { formatBoth, type UnitSystem } from '../../core/units';
import type { VehicleSpec } from '../../vehicles/specs';
import { HAND, type LessonDef, type MistakeDef, type StepDef } from '../engine/types';
import { liftSteps, lowerStep, ppeStep } from './common';

export const OIL_GRADES = ['0W-20', '5W-30', '10W-40'] as const;

export function oilTarget(grade: string): string {
  return `oil-${grade.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
}

const OIL_SPILL: MistakeDef = {
  code: 'oil.drain.no_pan',
  kind: 'procedure',
  label: 'Opened the drain plug with no drain pan underneath',
  explain:
    'Without a drain pan, several quarts of hot oil go all over the floor. That is a slip hazard, a burn risk and an environmental cleanup. Pan first, plug second.',
  consequence: 'oil-spill',
};

const OLD_WASHER: MistakeDef = {
  code: 'oil.drain.old_washer',
  kind: 'procedure',
  label: 'Reused the old drain plug washer',
  explain:
    'The crush washer flattens to seal the plug and only works once. A reused washer often seeps, and the customer finds oil spots on their driveway.',
  consequence: 'oil-leak',
};

const DOUBLE_GASKET: MistakeDef = {
  code: 'oil.filter.double_gasket',
  kind: 'procedure',
  label: "Didn't check that the old filter gasket came off",
  explain:
    'Sometimes the old filter gasket sticks to the engine. If the new filter goes on over it, the double gasket blows out when the engine starts and dumps oil fast. Always wipe and check the mounting surface.',
  consequence: 'oil-leak',
};

const DRY_GASKET: MistakeDef = {
  code: 'oil.filter.dry_gasket',
  kind: 'procedure',
  label: "Didn't oil the new filter gasket",
  explain:
    'A dry rubber gasket can grab, twist and tear as you tighten the filter. A thin film of fresh oil lets it seat evenly and seal.',
  consequence: 'oil-leak',
};

const FILTER_WRENCH_INSTALL: MistakeDef = {
  code: 'oil.filter.wrench_install',
  kind: 'procedure',
  label: 'Installed the filter with the filter wrench',
  explain:
    'The filter wrench is for removal only. Installing with it overtightens the filter, crushes the gasket and makes the next oil change a fight. Hand tight plus three-quarters of a turn.',
};

const NO_TORQUE_WRENCH: MistakeDef = {
  code: 'oil.plug.no_torque_wrench',
  kind: 'procedure',
  label: 'Tightened the drain plug by feel instead of to spec',
  explain:
    'Drain plugs thread into a soft aluminum or thin steel oil pan. Tightening by feel is how threads strip or plugs back out. Use the torque wrench set to the spec.',
};

export interface OilVariant {
  grade: string;
}

export const oilChange: LessonDef<OilVariant> = {
  id: 'oil-change',
  title: 'Oil & Filter Change',
  summary: 'Drain the old oil, replace the filter and washer, refill to spec, and check for leaks.',
  available: true,
  vehicles: ['sedan', 'pickup'],
  cartItems: [
    'ratchet-10',
    'ratchet-14',
    'ratchet-17',
    'filter-wrench',
    'torque-wrench',
    'rag',
    'new-filter',
    'new-washer',
  ],
  intro:
    "Welcome to the oil change, the job you will do more than any other in a shop. Fresh oil keeps the engine's moving parts from grinding each other apart. Let's do it right.",
  outro:
    'Nice work. Fresh oil, new filter, no leaks, and the old oil went to recycling. That is a professional oil change.',
  variant: (_rng, vehicle) => ({ grade: vehicle.oil?.grade ?? '0W-20' }),
  stage: () => ({ drainPan: true, hoodOpen: true }),
  workOrder: (vehicle, v, units) => {
    const oil = vehicle.oil;
    if (!oil) return [];
    return [
      `Oil: ${v.grade}, ${formatBoth('volume', oil.capacityQt, units)} with filter`,
      `Drain plug: ${oil.drainPlugSocketMm} mm, ${formatBoth('torque', oil.drainPlugTorque, units)}`,
      'Filter: hand tight + 3/4 turn',
    ];
  },
  steps: (vehicle, v, units) => oilSteps(vehicle, v, units),
};

function oilSteps(vehicle: VehicleSpec, v: OilVariant, units: UnitSystem): StepDef[] {
  const oil = vehicle.oil;
  if (!oil) throw new Error(`${vehicle.name} has no engine oil`);
  const socket = `ratchet-${oil.drainPlugSocketMm}`;
  const qty = formatBoth('volume', oil.capacityQt, units);
  const torque = formatBoth('torque', oil.drainPlugTorque, units);

  const wrongGrade: MistakeDef = {
    code: 'oil.wrong_grade',
    kind: 'value',
    label: 'Picked the wrong oil grade',
    explain: `This engine is built for ${v.grade} oil. The wrong viscosity flows differently when cold and hot, which can hurt protection and fuel economy. Always match the grade on the work order and the oil fill cap.`,
  };
  const wrongTargets = Object.fromEntries(
    OIL_GRADES.filter((g) => g !== v.grade).map((g) => [oilTarget(g), wrongGrade]),
  );

  const sockets = [10, 14, 17].filter((mm) => mm !== oil.drainPlugSocketMm);
  const wrongSockets = Object.fromEntries(
    sockets.map((mm): [string, MistakeDef] => [
      `ratchet-${mm}`,
      {
        code: 'oil.drain.wrong_socket',
        kind: 'wrong-item',
        label: 'Used the wrong size socket on the drain plug',
        explain: `The ${mm} millimeter socket is ${mm < oil.drainPlugSocketMm ? 'too small to fit' : 'too big and will slip'}. A loose socket rounds off the bolt head. This drain plug takes ${oil.drainPlugSocketMm} millimeters.`,
      },
    ]),
  );

  return [
    {
      id: 'choose-oil',
      label: `Get the right oil (${v.grade})`,
      say: `Every job starts with the work order. This ${vehicle.name} needs ${qty} of ${v.grade} oil. The grade is printed on the oil fill cap too. Grab the ${v.grade} jug from the parts shelf.`,
      hint: 'The oil grade is on your work order and on the oil fill cap under the hood.',
      why: `In ${v.grade}, the first number is how easily the oil flows when cold, and the second is its thickness when hot.`,
      spot: 'parts',
      item: HAND,
      targets: [oilTarget(v.grade)],
      gesture: { kind: 'press' },
      wrongTargets,
      effects: [{ fx: 'oil-pick' }],
    },
    ppeStep(),
    {
      id: 'fill-cap-off',
      label: 'Loosen the oil fill cap',
      say: 'Under the open hood, twist the oil fill cap counterclockwise to take it off. Lefty-loosey.',
      hint: 'The oil fill cap is on top of the engine and has an oil can symbol on it.',
      why: 'Opening the fill cap lets air in at the top, so the old oil drains out faster and more completely.',
      spot: 'hood',
      item: HAND,
      targets: ['fill-cap'],
      gesture: { kind: 'twist', turns: 1, dir: 'ccw' },
      requires: ['ppe'],
      effects: [{ fx: 'fillcap-off' }],
    },
    ...liftSteps(),
    {
      id: 'pan',
      label: 'Place the drain pan under the drain plug',
      say: 'The car is safely on its locks. Take the drain pan from beside the cart and set it on the floor right under the drain plug.',
      hint: 'Before anything comes loose underneath, something has to be ready to catch the oil.',
      spot: 'under',
      item: 'drain-pan',
      targets: ['pan-spot'],
      gesture: { kind: 'press' },
      requires: ['lock'],
      skipMistake: OIL_SPILL,
      effects: [{ fx: 'pan-place' }],
    },
    {
      id: 'drain',
      label: 'Remove the drain plug',
      say: `Use the ${oil.drainPlugSocketMm} millimeter socket on the drain plug at the lowest point of the oil pan. Turn it counterclockwise. The oil will be warm, so keep your hand out of the stream.`,
      hint: `The drain plug takes a ${oil.drainPlugSocketMm} millimeter socket. Lefty-loosey.`,
      spot: 'under',
      item: socket,
      targets: ['drain-plug'],
      gesture: { kind: 'twist', turns: 2, dir: 'ccw' },
      requires: ['ppe', 'lock', 'pan'],
      wrongItems: wrongSockets,
      effects: [{ fx: 'drain-oil' }],
    },
    {
      id: 'washer',
      label: 'Put a new washer on the drain plug',
      say: 'While it drains, swap the drain plug washer. Take the new crush washer from the cart and fit it onto the plug sitting on the tray.',
      hint: 'One part on the drain plug is used up every time it is tightened.',
      spot: 'under',
      item: 'new-washer',
      targets: ['plug-on-tray'],
      gesture: { kind: 'press' },
      skipMistake: OLD_WASHER,
      effects: [{ fx: 'washer-new' }],
    },
    {
      id: 'filter-off',
      label: 'Remove the old oil filter',
      say: 'Next, the oil filter. Put the filter wrench on it and turn counterclockwise. Some oil will come out, and it will land in the pan.',
      hint: 'Filters come off with a special wrench that grips the can.',
      spot: 'under',
      item: 'filter-wrench',
      targets: ['filter'],
      gesture: { kind: 'twist', turns: 1.5, dir: 'ccw' },
      requires: ['pan'],
      effects: [{ fx: 'filter-off' }],
    },
    {
      id: 'clean-mount',
      label: 'Wipe the filter mount and check for the old gasket',
      say: 'Wipe the filter mounting surface with the shop rag, and check that the old rubber gasket came off with the filter.',
      hint: 'Before a new filter goes on, look closely at where the old one sat.',
      why: 'An old gasket stuck to the engine plus a new one is called a double gasket. It leaks badly the moment the engine starts.',
      spot: 'under',
      item: 'rag',
      targets: ['filter-mount'],
      gesture: { kind: 'press' },
      skipMistake: DOUBLE_GASKET,
      effects: [{ fx: 'mount-clean' }],
    },
    {
      id: 'lube',
      label: 'Oil the new filter gasket',
      say: 'Pick up the new filter and touch its rubber gasket to the open jug of fresh oil. A thin film of oil helps it seal.',
      hint: "The new filter's rubber ring should not go on dry.",
      spot: 'under',
      item: 'new-filter',
      targets: ['oil-jug'],
      gesture: { kind: 'press' },
      skipMistake: DRY_GASKET,
      effects: [{ fx: 'filter-lube' }],
    },
    {
      id: 'filter-on',
      label: 'Install the new filter: hand tight plus three-quarter turn',
      say: 'Spin the new filter on by hand, clockwise. Once the gasket touches, give it about three-quarters of a turn more. No wrench.',
      hint: 'Hand tight, then three-quarters of a turn. Tools are for removing filters, not installing them.',
      spot: 'under',
      item: 'new-filter',
      targets: ['filter-mount'],
      gesture: { kind: 'twist', turns: 1.75, dir: 'cw' },
      requires: ['clean-mount', 'lube'],
      wrongItems: { 'filter-wrench': FILTER_WRENCH_INSTALL },
      effects: [{ fx: 'filter-on' }],
    },
    {
      id: 'plug-in',
      label: 'Thread the drain plug in by hand',
      say: 'The oil has finished draining. Take the drain plug from the tray and thread it in by hand, clockwise, so it cannot cross-thread.',
      hint: 'Start threads by hand first. If it is hard to turn by hand, it is crooked.',
      spot: 'under',
      item: 'drain-plug',
      targets: ['drain-plug'],
      gesture: { kind: 'twist', turns: 2, dir: 'cw' },
      requires: ['washer'],
      effects: [{ fx: 'plug-in' }],
    },
    {
      id: 'torque',
      label: `Torque the drain plug to ${torque}`,
      say: `Now set the torque wrench to the drain plug spec, ${torque}, and tighten clockwise until the wrench clicks.`,
      hint: 'The spec is on your work order. Set the dial before you tighten.',
      why: 'A torque wrench clicks when it reaches the set value. Stop at the click. Pulling past it adds more torque.',
      spot: 'under',
      item: 'torque-wrench',
      targets: ['drain-plug'],
      gesture: { kind: 'twist', turns: 0.25, dir: 'cw' },
      measure: {
        quantity: 'torque',
        spec: oil.drainPlugTorque,
        min: oil.drainPlugTorque - 3,
        max: oil.drainPlugTorque + 3,
        source: 'setting',
        over: {
          code: 'oil.plug.overtorque',
          kind: 'value',
          label: 'Over-tightened the drain plug',
          explain: `Too much torque strips the threads in the oil pan, and a stripped pan can mean replacing the whole pan. The spec is ${torque}.`,
          consequence: 'stripped-thread',
        },
        under: {
          code: 'oil.plug.undertorque',
          kind: 'value',
          label: 'Under-tightened the drain plug',
          explain: `A loose drain plug can vibrate out on the road and drain the engine. With no oil an engine destroys itself in minutes. The spec is ${torque}.`,
          consequence: 'oil-leak',
        },
      },
      wrongItems: { [socket]: NO_TORQUE_WRENCH },
      effects: [{ fx: 'plug-torque' }],
    },
    lowerStep(['torque', 'filter-on']),
    {
      id: 'fill',
      label: `Refill with ${qty} of ${v.grade}`,
      say: `Pour the fresh oil into the fill opening and watch the gauge on the jug. Stop at ${qty}.`,
      hint: `The capacity with a new filter is on the work order: ${qty}.`,
      why: 'Too little oil starves the engine. Too much gets whipped into foam by the crankshaft, and foam does not protect anything.',
      spot: 'hood',
      item: 'oil-bottle',
      targets: ['fill-neck'],
      gesture: { kind: 'hold', seconds: 30 },
      measure: {
        quantity: 'volume',
        spec: oil.capacityQt,
        min: oil.capacityQt - 0.2,
        max: oil.capacityQt + 0.3,
        source: 'fill',
        rate: 0.5,
        start: 0,
        over: {
          code: 'oil.fill.overfill',
          kind: 'value',
          label: 'Overfilled the engine oil',
          explain:
            'Overfilled oil gets churned into foam by the spinning crankshaft and can push past seals. The extra had to be drained back out.',
          consequence: 'overfill',
        },
      },
      skipMistake: {
        code: 'oil.fill.underfill',
        kind: 'value',
        label: 'Stopped filling below the oil capacity',
        explain: `The engine needs ${qty}. Running low on oil wears bearings fast and can seize the engine.`,
      },
      effects: [{ fx: 'oil-fill' }],
    },
    {
      id: 'cap-on',
      label: 'Reinstall the oil fill cap',
      say: 'Put the fill cap back on and turn it clockwise until it is snug.',
      hint: 'Something at the top of the engine is still open.',
      spot: 'hood',
      item: HAND,
      targets: ['fill-cap'],
      gesture: { kind: 'twist', turns: 1, dir: 'cw' },
      requires: ['fill'],
      effects: [{ fx: 'fillcap-on' }],
    },
    {
      id: 'run',
      label: 'Run the engine and check for leaks',
      say: 'Press the start button through the open driver window and let the engine run for half a minute. The oil pressure light should go out, and nothing should drip underneath.',
      hint: 'Before releasing the car, run it and look for leaks.',
      why: 'Running the engine fills the new filter and pressurizes the system, so any leak at the plug or filter shows up now instead of in the customer driveway.',
      spot: 'driver',
      item: HAND,
      targets: ['start-button'],
      gesture: { kind: 'press' },
      requires: ['cap-on'],
      effects: [{ fx: 'engine-run' }],
    },
    {
      id: 'dipstick',
      label: 'Check the level on the dipstick',
      say: 'Engine off. Give the oil a moment to settle, then pull the yellow dipstick, read it, and slide it back in. The level should be between the two marks.',
      hint: 'The final check of oil level uses the yellow handle in the engine bay.',
      spot: 'hood',
      item: HAND,
      targets: ['dipstick'],
      gesture: { kind: 'press' },
      readings: { dipstick: { quantity: 'volume', value: oil.capacityQt, note: 'Level is between MIN and MAX' } },
      effects: [{ fx: 'dipstick' }],
    },
    {
      id: 'recycle',
      label: 'Pour the used oil into the recycling drum',
      say: 'Last step. Carry the drain pan to the used oil drum and pour it in. Used oil is recycled, never dumped.',
      hint: 'The old oil is still in the pan. Where does it go?',
      why: 'One gallon of used motor oil can contaminate a million gallons of fresh water. Recycled oil gets cleaned and used again.',
      spot: 'recycle',
      item: 'drain-pan',
      targets: ['recycle-drum'],
      gesture: { kind: 'hold', seconds: 2 },
      effects: [{ fx: 'oil-recycle' }],
    },
  ];
}
