import { HAND, type MistakeDef, type StepDef } from '../engine/types';

/** Shared mistakes and steps used by several lessons. */

export const NO_EYE_PROTECTION: MistakeDef = {
  code: 'safety.no_eye_protection',
  kind: 'safety',
  label: 'Started work without safety glasses and gloves',
  explain:
    'Hot oil, brake dust and rust flakes fall right into your face when you work under a car. Safety glasses go on before any tool touches the car, every time.',
  consequence: 'eye-splash',
};

export const LIFT_ARMS_NOT_SET: MistakeDef = {
  code: 'safety.lift.arms_not_set',
  kind: 'safety',
  label: 'Raised the lift before setting all four arm pads',
  explain:
    "The arm pads must sit under the car's four lift points before it leaves the ground. A car on the wrong spots, or on three pads, can tip and slide off the lift.",
  consequence: 'car-tilt',
};

export const LIFT_NOT_LOCKED: MistakeDef = {
  code: 'safety.lift.not_locked',
  kind: 'safety',
  label: 'Worked under the car before the lift was on its safety locks',
  explain:
    'Never work under a lift that is only held up by hydraulics. A seal can fail without warning. Always lower the lift onto its mechanical safety locks first.',
  consequence: 'car-drop',
};

const PPE_WHY =
  'Nitrile gloves keep used oil off your skin. It contains chemicals you should not soak into your hands every day.';

export function ppeStep(why = PPE_WHY): StepDef {
  return {
    id: 'ppe',
    label: 'Put on safety glasses and gloves',
    say: 'Safety first. Grab the safety glasses and the nitrile gloves from the top of the tool cart.',
    hint: 'Your personal protective equipment is on the top shelf of the tool cart.',
    why,
    spot: 'cart',
    item: HAND,
    targets: ['ppe-glasses', 'ppe-gloves'],
    gesture: { kind: 'press' },
    skipMistake: NO_EYE_PROTECTION,
    effects: [{ fx: 'ppe' }],
    safety: true,
  };
}

export function liftSteps(): StepDef[] {
  return [
    {
      id: 'arms',
      label: 'Set the lift arms under the four lift points',
      say: 'Swing each of the four lift arms under the car and line the pad up with the lift point. The lift points are the reinforced spots marked with small triangles on the rocker panels.',
      hint: 'Four arms, four lift points. Look for the triangle marks along the bottom edge of the car.',
      why: 'Lift points are built to carry the weight of the car. Lifting anywhere else can crush the floor pan or let the car slip.',
      spot: 'side-left',
      item: HAND,
      targets: ['lift-arm-FL', 'lift-arm-FR', 'lift-arm-RL', 'lift-arm-RR'],
      gesture: { kind: 'press' },
      skipMistake: LIFT_ARMS_NOT_SET,
      effects: [{ fx: 'arm-place' }],
      safety: true,
    },
    {
      id: 'raise',
      label: 'Raise the car to working height',
      say: 'Now hold the green UP button on the lift control until the car is at working height. Watch the car as it rises in case anything shifts.',
      hint: 'The lift controls are on the post nearest the tool cart. Hold the UP button.',
      spot: 'lift-controls',
      item: HAND,
      targets: ['lift-up'],
      gesture: { kind: 'hold', seconds: 2.5 },
      requires: ['arms'],
      stepEffects: [{ fx: 'lift-raise' }],
    },
    {
      id: 'lock',
      label: 'Lower the lift onto its safety locks',
      say: 'Before anyone goes under the car, pull the lock lever. The lift settles onto its mechanical safety locks, so it is held by steel, not hydraulic pressure.',
      hint: 'There is a step between raising the car and going under it. Find the lock lever on the lift post.',
      spot: 'lift-controls',
      item: HAND,
      targets: ['lift-lock'],
      gesture: { kind: 'press' },
      requires: ['raise'],
      skipMistake: LIFT_NOT_LOCKED,
      stepEffects: [{ fx: 'lift-lock' }],
      safety: true,
    },
  ];
}

export function lowerStep(requires: string[], skip?: MistakeDef): StepDef {
  return {
    id: 'lower',
    label: 'Lower the car',
    say: 'Check that no tools or people are under the car, then hold the red DOWN button. The lift rises off its locks first, then lowers.',
    hint: 'Everything underneath is done. Use the DOWN button on the lift control.',
    why: 'Always walk around the lift before lowering. A forgotten drain pan or jack can damage the car or the lift.',
    spot: 'lift-controls',
    item: HAND,
    targets: ['lift-down'],
    gesture: { kind: 'hold', seconds: 2.5 },
    requires,
    skipMistake: skip,
    stepEffects: [{ fx: 'lift-lower' }],
  };
}
