import type { UnitSystem } from '../../core/units';
import type { VehicleSpec } from '../../vehicles/specs';
import { HAND, type LessonDef, type MistakeDef, type StepDef } from '../engine/types';
import { ppeStep } from './common';

export interface EvSafetyVariant {
  /** Glove pair A has a pinhole and must be rejected. */
  pinhole: boolean;
  /** Months since the gloves were last tested. */
  gloveAgeMonths: number;
}

const NO_BARRIER: MistakeDef = {
  code: 'ev.no_barrier',
  kind: 'safety',
  label: 'Started high-voltage work without a barrier and sign',
  explain:
    'Anyone walking up to a car with its high-voltage system open could touch a live part. Set up the barrier and the HIGH VOLTAGE sign first, so nobody wanders into the work area.',
};

const BAD_GLOVES: MistakeDef = {
  code: 'ev.gloves.pinhole_used',
  kind: 'safety',
  label: 'Kept insulating gloves that failed the air test',
  explain:
    'A pinhole you can barely feel is a path for 400 volts straight through your hand. Gloves that leak air fail. Tag them out and use a pair that passes.',
  consequence: 'spark',
};

const NO_GLOVES: MistakeDef = {
  code: 'ev.no_gloves',
  kind: 'safety',
  label: 'Touched the high-voltage system without insulating gloves',
  explain:
    'Until the system is proven dead, every orange part must be treated as live. Rated insulating gloves with leather protectors go on before your hands go near it.',
  consequence: 'spark',
};

const FOB_IN_RANGE: MistakeDef = {
  code: 'ev.fob_in_range',
  kind: 'safety',
  label: 'Left the key fob near the car',
  explain:
    'An EV can wake itself up and close its high-voltage contactors when the fob is nearby. Put the fob in the lockbox, well away from the car, before you disconnect anything.',
};

const NO_WAIT: MistakeDef = {
  code: 'ev.no_wait',
  kind: 'safety',
  label: 'Did not wait for the capacitors to discharge',
  explain:
    'Even with the service disconnect out, capacitors inside the inverter stay charged for minutes. Wait the full time the manufacturer specifies before you test.',
  consequence: 'spark',
};

const UNPROVEN_METER: MistakeDef = {
  code: 'ev.meter_not_proven',
  kind: 'safety',
  label: 'Trusted a zero reading without proving the meter first',
  explain:
    'A broken meter or a blown fuse also reads zero. Live-dead-live: prove the meter works on a known live source, test the system, then prove the meter again.',
};

export const evSafety: LessonDef<EvSafetyVariant> = {
  id: 'ev-safety',
  title: 'EV High-Voltage Safety',
  summary: 'Spot high-voltage parts and rehearse the certified shutdown procedure.',
  available: true,
  vehicles: ['ev'],
  cartItems: ['ratchet-10', 'ratchet-14', 'cat3-meter', 'multimeter', 'loto-tag', 'key-fob'],
  intro:
    'Electric cars carry hundreds of volts, enough to kill. In real shops only trained, certified technicians do this procedure. Here you will learn to recognize the high-voltage parts and rehearse every step of making the system safe.',
  outro:
    'You made the system safe step by step and proved it dead with live-dead-live. Remember: on a real car, this is only done by certified technicians.',
  variant: (rng) => ({ pinhole: rng() < 0.6, gloveAgeMonths: 1 + Math.floor(rng() * 5) }),
  stage: () => ({ evKit: true, hoodOpen: true }),
  workOrder: (vehicle) => [
    `${vehicle.name}: ${vehicle.hv?.packVolts ?? 400} V system`,
    `Gloves: ${vehicle.hv?.gloveClass ?? 'Class 0'}`,
    `Wait after disconnect: ${vehicle.hv?.waitMinutes ?? 10} min`,
  ],
  steps: (vehicle, v, units) => evSteps(vehicle, v, units),
};

function evSteps(vehicle: VehicleSpec, v: EvSafetyVariant, _units: UnitSystem): StepDef[] {
  const hv = vehicle.hv;
  if (!hv) throw new Error(`${vehicle.name} has no high-voltage system`);
  const gloveSteps: StepDef[] = [
    {
      id: 'glove-date',
      label: 'Check the glove test date',
      say: 'Insulating gloves must be lab-tested every six months. Check the date stamp on pair A.',
      hint: 'The gloves are on the safety kit table.',
      spot: 'ev-kit',
      item: HAND,
      targets: ['gloves-a'],
      gesture: { kind: 'press' },
      effects: [{ fx: 'inspect' }],
      readings: { 'gloves-a': { text: `Tested ${v.gloveAgeMonths} months ago`, note: hv.gloveClass } },
    },
    {
      id: 'air-test',
      label: 'Air test glove pair A',
      say: 'Roll the cuff of each glove to trap air, then squeeze and listen for leaks. Any leak, and the glove fails.',
      hint: 'Trap air in the glove and squeeze it.',
      spot: 'ev-kit',
      item: HAND,
      targets: ['gloves-a'],
      gesture: { kind: 'hold', seconds: 1.5 },
      readings: {
        'gloves-a': {
          text: v.pinhole ? 'Air hisses out of the left index finger' : 'Both gloves hold air',
          note: 'Air test',
        },
      },
      tag: {
        prompt: 'use them?',
        options: ['Use these gloves', 'Reject them: tag them out'],
        tones: [0, 2],
        correct: v.pinhole ? 1 : 0,
        wrong: v.pinhole
          ? BAD_GLOVES
          : {
              code: 'ev.gloves.good_rejected',
              kind: 'procedure',
              label: 'Rejected gloves that passed the test',
              explain: 'These gloves are in date and held air. They are safe to use.',
            },
      },
      effects: [{ fx: 'inspect' }],
    },
  ];
  if (v.pinhole) {
    gloveSteps.push(
      {
        id: 'reject',
        label: 'Set the failed pair aside',
        say: 'Set the leaking pair aside so nobody uses it, then air test pair B.',
        hint: 'The failed gloves go out of service.',
        spot: 'ev-kit',
        item: HAND,
        targets: ['gloves-b'],
        gesture: { kind: 'hold', seconds: 1.5 },
        stepEffects: [{ fx: 'gloves-reject' }],
        readings: { 'gloves-b': { text: 'Both gloves hold air', note: `Tested ${v.gloveAgeMonths} months ago` } },
      },
      {
        id: 'gloves-on',
        label: 'Put on glove pair B',
        say: 'Pair B passed. Put them on.',
        hint: 'The pair that passed the air test.',
        spot: 'ev-kit',
        item: HAND,
        targets: ['gloves-b'],
        gesture: { kind: 'press' },
        skipMistake: NO_GLOVES,
        effects: [{ fx: 'gloves-on' }],
        safety: true,
      },
    );
  } else {
    gloveSteps.push({
      id: 'gloves-on',
      label: 'Put on glove pair A',
      say: 'Pair A passed. Put them on.',
      hint: 'The pair you just tested.',
      spot: 'ev-kit',
      item: HAND,
      targets: ['gloves-a'],
      gesture: { kind: 'press' },
      skipMistake: NO_GLOVES,
      effects: [{ fx: 'gloves-on' }],
      safety: true,
    });
  }

  return [
    ppeStep(
      'Safety glasses protect your eyes from an arc flash, and the insulating gloves come next. Personal protection is the last line of defense.',
    ),
    {
      id: 'identify',
      label: 'Find the high-voltage parts',
      say: 'High-voltage parts are marked in orange. Point to the battery pack under the floor, the orange cables, the inverter and the service disconnect.',
      hint: 'Look for orange: cables, the pack edges, the disconnect handle.',
      why: 'If it is orange, treat it as live until it is proven dead.',
      spot: 'hood',
      item: HAND,
      targets: ['inverter', 'hv-cable', 'service-disconnect', 'hv-pack'],
      gesture: { kind: 'press' },
      wrongTargets: {
        battery: {
          code: 'ev.identify.twelve_volt',
          kind: 'wrong-item',
          label: 'Mistook the 12-volt battery for high voltage',
          explain:
            'That is the ordinary 12-volt battery that runs the lights and computers. It is not orange. You will disconnect it later, but it is not part of the high-voltage system.',
        },
      },
      effects: [{ fx: 'inspect' }],
    },
    {
      id: 'barrier',
      label: 'Set up the barrier and HIGH VOLTAGE sign',
      say: 'Put a barrier with the HIGH VOLTAGE sign at the front and another at the back, so nobody walks into your work area.',
      hint: 'The barrier spots are on the floor in front of and behind the car.',
      spot: 'ev-kit',
      item: HAND,
      targets: ['barrier-front', 'barrier-rear'],
      gesture: { kind: 'press' },
      skipMistake: NO_BARRIER,
      effects: [{ fx: 'barrier' }],
      safety: true,
    },
    ...gloveSteps,
    {
      id: 'protectors',
      label: 'Put the leather protectors on over the gloves',
      say: 'Leather protectors go on over the rubber gloves, so nothing sharp can cut them.',
      hint: 'The brown leather covers on the kit table.',
      spot: 'ev-kit',
      item: HAND,
      targets: ['protectors'],
      gesture: { kind: 'press' },
      effects: [{ fx: 'protectors-on' }],
    },
    {
      id: 'power-off',
      label: 'Switch the car off',
      say: 'Press the power button to switch the car off.',
      hint: 'The power button is on the dash.',
      spot: 'driver',
      item: HAND,
      targets: ['start-button'],
      gesture: { kind: 'press' },
      effects: [{ fx: 'engine-off' }],
    },
    {
      id: 'fob',
      label: 'Lock the key fob away from the car',
      say: 'Take the key fob from the dash and lock it in the lockbox on the battery bench, far from the car.',
      hint: 'A car with its fob nearby can wake up.',
      spot: 'bench',
      item: 'key-fob',
      targets: ['lockbox'],
      gesture: { kind: 'press' },
      skipMistake: FOB_IN_RANGE,
      effects: [{ fx: 'fob-lockbox' }],
      safety: true,
    },
    {
      id: '12v-off',
      label: 'Disconnect the 12-volt negative cable',
      say: 'Disconnect the negative cable on the 12-volt battery in the frunk. Without 12 volts, the high-voltage contactors cannot close.',
      hint: 'The small black battery in the frunk. Negative first, as always.',
      spot: 'hood',
      item: 'ratchet-10',
      targets: ['batt-neg'],
      gesture: { kind: 'twist', turns: 1, dir: 'ccw' },
      requires: ['fob'],
      wrongTargets: {
        'batt-pos': {
          code: 'battery.disconnect.positive_first',
          kind: 'safety',
          label: 'Disconnected the positive cable first',
          explain:
            'The negative cable comes off first. With it still connected, the whole car body is negative, so a wrench on the positive post that touches any metal makes a dead short: sparks, burns, even a battery explosion.',
          consequence: 'spark',
        },
      },
      effects: [{ fx: 'cable-off' }],
    },
    {
      id: 'disconnect',
      label: 'Pull the service disconnect',
      say: 'With your gloves on, pull the orange service disconnect straight out. This splits the battery pack in two inside.',
      hint: 'The orange handle in the frunk.',
      spot: 'hood',
      item: HAND,
      targets: ['service-disconnect'],
      gesture: { kind: 'hold', seconds: 1.2 },
      requires: ['barrier', 'gloves-on', '12v-off'],
      effects: [{ fx: 'sd-out' }],
      safety: true,
    },
    {
      id: 'lockout',
      label: 'Lock out and tag the disconnect',
      say: 'Put the lockout tag on the empty disconnect socket, and keep the plug in your pocket, so nobody can put it back.',
      hint: 'The red tag on the cart.',
      spot: 'hood',
      item: 'loto-tag',
      targets: ['service-disconnect'],
      gesture: { kind: 'press' },
      effects: [{ fx: 'loto' }],
      safety: true,
    },
    {
      id: 'wait',
      label: `Wait ${hv.waitMinutes} minutes`,
      say: `Start the wait timer. The capacitors need ${hv.waitMinutes} minutes to discharge. I will fast-forward it for you.`,
      hint: 'There is a timer on the safety kit table.',
      spot: 'ev-kit',
      item: HAND,
      targets: ['wait-timer'],
      gesture: { kind: 'press' },
      skipMistake: NO_WAIT,
      effects: [{ fx: 'wait' }],
      safety: true,
    },
    {
      id: 'live-1',
      label: 'Live: prove the meter on a known source',
      say: 'Live-dead-live. First prove the CAT III meter works on the proving unit.',
      hint: 'The blue proving unit on the kit table is a known live source.',
      spot: 'ev-kit',
      item: 'cat3-meter',
      targets: ['proving-unit'],
      gesture: { kind: 'press' },
      requires: ['wait'],
      skipMistake: UNPROVEN_METER,
      wrongItems: {
        multimeter: {
          code: 'ev.meter.wrong_rating',
          kind: 'safety',
          label: 'Used an ordinary meter on high voltage',
          explain:
            'A basic multimeter is not rated for a 400-volt battery and can fail violently. Use the CAT III meter rated for 1000 volts.',
        },
      },
      effects: [{ fx: 'inspect' }],
      readings: { 'proving-unit': { quantity: 'voltage', value: 12.6, note: 'Meter works' } },
      safety: true,
    },
    {
      id: 'dead',
      label: 'Dead: test the high-voltage terminals',
      say: 'Now test the high-voltage terminals at the disconnect. You are looking for zero.',
      hint: 'Test the HV points in the frunk.',
      spot: 'hood',
      item: 'cat3-meter',
      targets: ['hv-test'],
      gesture: { kind: 'press' },
      requires: ['live-1'],
      effects: [{ fx: 'inspect' }],
      readings: { 'hv-test': { quantity: 'voltage', value: 0, note: 'No voltage present' } },
    },
    {
      id: 'live-2',
      label: 'Live: prove the meter again',
      say: 'And prove the meter on the proving unit once more. If it still reads, the zero you saw was real.',
      hint: 'Back to the proving unit.',
      spot: 'ev-kit',
      item: 'cat3-meter',
      targets: ['proving-unit'],
      gesture: { kind: 'press' },
      effects: [{ fx: 'inspect' }],
      readings: { 'proving-unit': { quantity: 'voltage', value: 12.6, note: 'Meter still works: the system is dead' } },
    },
    {
      id: 'who',
      label: 'Who does this on a real car?',
      say: 'One last question.',
      hint: 'Think about training and certification.',
      item: HAND,
      targets: [],
      gesture: { kind: 'press' },
      choice: {
        prompt: 'On a real electric car, who may perform this high-voltage shutdown?',
        options: [
          'Only trained, certified technicians with rated gear',
          'Anyone with insulating gloves',
          'Anyone who watched a video of it',
        ],
        correct: 0,
        wrong: {
          code: 'ev.who_may',
          kind: 'value',
          label: 'Thought anyone may do high-voltage work',
          explain:
            'High-voltage work needs formal training and certification, plus tested, rated equipment. Gloves alone do not make it safe.',
        },
        right: 'Exactly. Today you rehearsed it. Certification comes with real training.',
      },
    },
  ];
}
