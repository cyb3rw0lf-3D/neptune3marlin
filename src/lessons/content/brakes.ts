import { formatBoth, type UnitSystem } from '../../core/units';
import { starPattern, type VehicleSpec } from '../../vehicles/specs';
import { HAND, type LessonDef, type MistakeDef, type StepDef } from '../engine/types';
import { ppeStep } from './common';

export interface BrakeVariant {
  /** Pad lining left, in millimeters. */
  outerPadMm: number;
  innerPadMm: number;
  /** Rotor thickness in inches, and whether it is still above the minimum. */
  rotorIn: number;
  rotorOk: boolean;
}

const NO_CHOCKS: MistakeDef = {
  code: 'brakes.jack.no_chocks',
  kind: 'safety',
  label: 'Jacked up the car without chocking the rear wheels',
  explain:
    'With the front in the air, the car can roll off the jack. Wheel chocks behind the rear tires stop it from moving before you lift.',
  consequence: 'car-slip',
};

const LUGS_IN_AIR: MistakeDef = {
  code: 'brakes.lugs.not_broken_loose',
  kind: 'procedure',
  label: 'Lifted the car before breaking the lug nuts loose',
  explain:
    'Once the wheel is in the air it just spins when you turn a tight lug nut. Break the lugs loose a little while the tire is still on the ground, then lift.',
  consequence: 'wheel-spin',
};

const JACK_ON_PAN: MistakeDef = {
  code: 'brakes.jack.wrong_point',
  kind: 'procedure',
  label: 'Put the jack under the oil pan',
  explain:
    'The oil pan is thin metal. A jack under it dents or cracks it and the engine can lose its oil. Only lift at the jacking point shown in the service information.',
  consequence: 'oil-leak',
};

const JACK_ONLY: MistakeDef = {
  code: 'brakes.jack.no_stands',
  kind: 'safety',
  label: 'Worked on a car held up only by the jack',
  explain:
    'A jack is for lifting, never for holding. Its seals can leak down or it can roll. Set jack stands under solid points and lower the car onto them before any part of you goes near the wheel.',
  consequence: 'car-slip',
};

const NO_SHAKE: MistakeDef = {
  code: 'brakes.stands.no_shake_test',
  kind: 'procedure',
  label: 'Skipped the shake test on the jack stands',
  explain:
    'Give the car a firm push at the corner once it sits on the stands. If anything moves or creaks, lift it again and reset the stands. Better to find out now than with your arm under it.',
};

const HUNG_BY_HOSE: MistakeDef = {
  code: 'brakes.caliper.hung_by_hose',
  kind: 'safety',
  label: 'Let the caliper hang by its brake hose',
  explain:
    'The rubber brake hose is not built to carry weight. Hanging the caliper from it can tear the inside of the hose, and the brakes can fail later. Always hang the caliper on an S-hook.',
  consequence: 'caliper-hose',
};

const GREASE_ON_ROTOR: MistakeDef = {
  code: 'brakes.grease.on_rotor',
  kind: 'safety',
  label: 'Got grease on the rotor',
  explain:
    'Grease on a rotor or pad face means the brakes cannot grip. Grease only goes on the slide clips and pins, never on any friction surface. A greasy rotor has to be cleaned with brake cleaner before the car can move.',
};

const NO_GREASE: MistakeDef = {
  code: 'brakes.clips.not_greased',
  kind: 'procedure',
  label: 'Installed pads without lubricating the slide clips',
  explain:
    'Dry clips let the pads stick and squeal, and they wear unevenly. A thin film of brake grease on the clips lets the pads slide freely.',
};

const PISTON_OUT: MistakeDef = {
  code: 'brakes.piston.not_compressed',
  kind: 'procedure',
  label: 'Tried to refit the caliper without pushing the piston back',
  explain:
    'New pads are much thicker than worn ones. The caliper piston has to be pushed back into its bore first, or the caliper will not fit over the new pads.',
};

const NO_PEDAL: MistakeDef = {
  code: 'brakes.pedal.not_pumped',
  kind: 'safety',
  label: 'Started the car before pumping the brake pedal',
  explain:
    'After the piston is pushed back, the first press of the pedal goes almost to the floor. Pump it until it is firm before the car moves, or the brakes will not work on the first stop.',
  consequence: 'pedal-sink',
};

const NO_TORQUE: MistakeDef = {
  code: 'brakes.caliper.no_torque_wrench',
  kind: 'procedure',
  label: 'Tightened the caliper bolts by feel',
  explain: 'Caliper bolts hold the brakes to the car. They are always tightened to spec with a torque wrench.',
};

export const brakes: LessonDef<BrakeVariant> = {
  id: 'brakes',
  title: 'Brake Inspection & Pads',
  summary: 'Measure pads and rotors, then replace the front pads safely on jack stands.',
  available: true,
  vehicles: ['sedan', 'pickup'],
  cartItems: [
    'breaker-bar',
    'impact-wrench',
    'brake-gauge',
    'micrometer',
    'ratchet-14',
    'ratchet-17',
    'piston-tool',
    'brake-grease',
    'torque-wrench',
    'new-pads',
  ],
  intro:
    "Brakes are the most important safety system on a car. Today you'll measure the front brakes and replace the pads on the left side, using a floor jack and jack stands. The right side is done the same way.",
  outro:
    'Excellent. Measured, replaced, torqued, and a firm pedal before the car moved. That is a brake job you can trust.',
  variant: (rng, vehicle) => {
    const b = vehicle.brakes;
    const outerPadMm = Math.round((2 + rng() * 1) * 2) / 2;
    const innerPadMm = Math.max(1, outerPadMm - 0.5 - Math.round(rng() * 2) / 2);
    const rotorOk = rng() < 0.6;
    const rotorIn = rotorOk
      ? Math.round((b.rotorMinIn + 0.02 + rng() * 0.04) * 1000) / 1000
      : Math.round((b.rotorMinIn - 0.008 - rng() * 0.01) * 1000) / 1000;
    return { outerPadMm, innerPadMm, rotorIn, rotorOk };
  },
  stage: () => ({ jack: true }),
  workOrder: (vehicle, _v, units) => [
    `Front pads: replace if under ${formatBoth('thickness', vehicle.brakes.padMinMm, units)}`,
    `Rotor minimum: ${formatBoth('length', vehicle.brakes.rotorMinIn, units)}`,
    `Caliper bolts: ${vehicle.brakes.caliperBoltMm} mm, ${formatBoth('torque', vehicle.brakes.caliperBoltTorque, units)}`,
    `Lug nuts: ${formatBoth('torque', vehicle.tires.lugTorque, units)}`,
  ],
  steps: (vehicle, v, units) => brakeSteps(vehicle, v, units),
};

function brakeSteps(vehicle: VehicleSpec, v: BrakeVariant, units: UnitSystem): StepDef[] {
  const b = vehicle.brakes;
  const socket = `ratchet-${b.caliperBoltMm}`;
  const otherSocket = b.caliperBoltMm === 14 ? 'ratchet-17' : 'ratchet-14';
  const padMin = formatBoth('thickness', b.padMinMm, units);
  const rotorMin = formatBoth('length', b.rotorMinIn, units);
  const caliperTorque = formatBoth('torque', b.caliperBoltTorque, units);
  const lugTorque = formatBoth('torque', vehicle.tires.lugTorque, units);
  const star = starPattern(vehicle.tires.lugsPerWheel);
  const wrongSocket: MistakeDef = {
    code: 'brakes.caliper.wrong_socket',
    kind: 'wrong-item',
    label: 'Used the wrong size socket on the caliper bolts',
    explain: `These caliper bolts take a ${b.caliperBoltMm} millimeter socket. The wrong size slips and rounds the bolt head.`,
  };

  return [
    ppeStep(
      'Brake dust is fine grit you should not breathe or rub into your eyes, and brake fluid stings and strips paint. Glasses and gloves stay on for the whole job.',
    ),
    {
      id: 'chocks',
      label: 'Chock both rear wheels',
      say: 'The front of the car is going up, so the rear tires stay on the ground. Set a wheel chock tight behind each rear tire so the car cannot roll.',
      hint: 'Something has to stop the car from rolling before it leaves the ground.',
      spot: 'left-rear',
      item: HAND,
      targets: ['chock-RL', 'chock-RR'],
      gesture: { kind: 'press' },
      skipMistake: NO_CHOCKS,
      effects: [{ fx: 'chock' }],
      safety: true,
    },
    {
      id: 'break-lugs',
      label: 'Break the left front lug nuts loose on the ground',
      say: 'Before lifting, use the breaker bar to crack the left front lug nuts loose, about a quarter turn counterclockwise. The tire on the ground keeps the wheel from spinning.',
      hint: 'Lug nuts are easiest to loosen while the tire still sits on the floor.',
      spot: 'left-front',
      item: 'breaker-bar',
      targets: ['lugs-FL'],
      gesture: { kind: 'twist', turns: 0.25, dir: 'ccw' },
      skipMistake: LUGS_IN_AIR,
    },
    {
      id: 'jack-place',
      label: 'Roll the floor jack under the front jacking point',
      say: `Roll the floor jack under the car and center its saddle on the front jacking point. On this ${vehicle.name} that is the ${vehicle.id === 'pickup' ? 'front differential housing' : 'front subframe, behind the oil pan'}.`,
      hint: 'The jack lifts at one strong point at the front of the car. Not the oil pan.',
      spot: 'jack',
      item: HAND,
      targets: ['jack-point'],
      gesture: { kind: 'press' },
      requires: ['chocks', 'break-lugs'],
      wrongTargets: { 'oil-pan': JACK_ON_PAN },
      effects: [{ fx: 'jack-place' }],
    },
    {
      id: 'jack-raise',
      label: 'Pump the jack handle to raise the front',
      say: 'Grab the jack handle and pump it up and down. Raise the front until both front tires are a few inches off the floor.',
      hint: 'Pump the long handle on the floor jack.',
      why: 'Lift only as high as you need. The higher a car goes, the less stable it is.',
      spot: 'jack',
      item: HAND,
      targets: ['jack-handle'],
      gesture: { kind: 'pump', strokes: 6 },
      requires: ['jack-place'],
      stepEffects: [{ fx: 'jack-raise' }],
    },
    {
      id: 'stands',
      label: 'Set jack stands under both front stand points',
      say: 'Slide a jack stand under each front stand point, left and right. Raise each stand until its cradle is just under the point.',
      hint: 'The jack lifts the car, but something else must hold it. Two of them.',
      spot: 'left-front',
      item: HAND,
      targets: ['stand-point-FL', 'stand-point-FR'],
      gesture: { kind: 'press' },
      requires: ['jack-raise'],
      skipMistake: JACK_ONLY,
      effects: [{ fx: 'stand-place' }],
      safety: true,
    },
    {
      id: 'onto-stands',
      label: 'Lower the car onto the stands',
      say: 'Now twist the jack handle counterclockwise, slowly, to open the release valve. Let the car settle onto the stands.',
      hint: 'The stands only help once the car weight is on them. Twist the jack handle to let it down.',
      spot: 'jack',
      item: HAND,
      targets: ['jack-release'],
      gesture: { kind: 'twist', turns: 0.5, dir: 'ccw' },
      requires: ['stands'],
      skipMistake: JACK_ONLY,
      stepEffects: [{ fx: 'jack-lower', arg: 'stands' }],
      safety: true,
    },
    {
      id: 'shake',
      label: 'Shake test the car on the stands',
      say: 'Push firmly on the front corner of the car. It should feel solid. If it rocks or a stand shifts, lift and reset it.',
      hint: 'Before working near the wheel, prove the stands are holding.',
      spot: 'left-front',
      item: HAND,
      targets: ['car-shake'],
      gesture: { kind: 'hold', seconds: 1.2 },
      requires: ['onto-stands'],
      skipMistake: NO_SHAKE,
      effects: [{ fx: 'shake' }],
      safety: true,
    },
    {
      id: 'wheel-off',
      label: 'Remove the left front wheel',
      say: 'The car is safe on the stands. Spin the lug nuts off with the impact wrench and set the wheel aside.',
      hint: 'The lugs are already loose. The impact wrench takes them off quickly.',
      spot: 'left-front',
      item: 'impact-wrench',
      targets: ['lugs-FL'],
      gesture: { kind: 'twist', turns: 2, dir: 'ccw' },
      requires: ['stands', 'onto-stands', 'shake'],
      effects: [{ fx: 'wheel-off' }],
    },
    {
      id: 'measure-pads',
      label: 'Measure the outer and inner brake pads',
      say: `Use the pad gauge on the outer pad, then on the inner pad. The inner pad often wears faster, so always check both. The minimum on this car is ${padMin}.`,
      hint: 'There are two pads, one on each side of the rotor.',
      spot: 'left-front',
      item: 'brake-gauge',
      targets: ['pad-outer-FL', 'pad-inner-FL'],
      gesture: { kind: 'press' },
      effects: [{ fx: 'inspect' }],
      readings: {
        'pad-outer-FL': { quantity: 'thickness', value: v.outerPadMm, note: `Minimum ${padMin}` },
        'pad-inner-FL': { quantity: 'thickness', value: v.innerPadMm, note: `Minimum ${padMin}` },
      },
    },
    {
      id: 'pad-call',
      label: 'Decide on the pads',
      say: 'What do those pad measurements tell you?',
      hint: 'Compare the thinnest pad with the minimum on the work order.',
      item: HAND,
      targets: [],
      gesture: { kind: 'press' },
      choice: {
        prompt: `Outer pad ${formatBoth('thickness', v.outerPadMm, units)}, inner pad ${formatBoth('thickness', v.innerPadMm, units)}. Minimum ${padMin}. What is the call?`,
        options: [
          'Replace the pads on both front wheels: worn to the limit',
          'Leave them: there is still some lining left',
          'Replace only the inner pad on this wheel',
        ],
        correct: 0,
        wrong: {
          code: 'brakes.pads.wrong_call',
          kind: 'value',
          label: 'Made the wrong call on worn brake pads',
          explain:
            'Pads at or under the minimum get replaced, and always as a full axle set, both wheels, so the car stops straight. Never just one pad.',
        },
        right: 'Right. At the limit, and pads are always replaced in axle sets so the car brakes evenly.',
      },
    },
    {
      id: 'measure-rotor',
      label: 'Measure the rotor thickness',
      say: `Close the micrometer on the rotor's braking surface and read it. Compare it with the minimum thickness cast into the rotor: ${rotorMin}.`,
      hint: 'The micrometer measures the thickness of the shiny disc.',
      spot: 'left-front',
      item: 'micrometer',
      targets: ['rotor-FL'],
      gesture: { kind: 'press' },
      wrongItems: {
        'brake-gauge': {
          code: 'brakes.rotor.wrong_tool',
          kind: 'wrong-item',
          label: 'Measured the rotor with the pad gauge',
          explain:
            'The pad gauge is for pad lining. Rotor thickness needs the micrometer, accurate to a thousandth of an inch.',
        },
      },
      effects: [{ fx: 'inspect' }],
      readings: { 'rotor-FL': { quantity: 'length', value: v.rotorIn, note: `Minimum ${rotorMin}` } },
    },
    {
      id: 'rotor-call',
      label: 'Decide on the rotor',
      say: 'Is this rotor still usable?',
      hint: 'If it is thinner than the minimum, it cannot stay.',
      item: HAND,
      targets: [],
      gesture: { kind: 'press' },
      choice: {
        prompt: `The rotor measures ${formatBoth('length', v.rotorIn, units)}. The minimum is ${rotorMin}. What is the call?`,
        options: [
          'Reuse it: still thicker than the minimum',
          'Replace it: thinner than the minimum',
          'Machine it smooth and reuse it',
        ],
        correct: v.rotorOk ? 0 : 1,
        wrong: {
          code: 'brakes.rotor.wrong_call',
          kind: 'value',
          label: 'Made the wrong call on the rotor',
          explain: v.rotorOk
            ? 'This rotor is still above its minimum thickness, so it can stay. Replacing good parts costs the customer money for nothing.'
            : 'This rotor is under its minimum thickness. A thin rotor cannot soak up heat and can crack or fade. It cannot be machined thinner either. It gets replaced.',
        },
        right: v.rotorOk
          ? 'Correct. The rotor is above minimum, so it stays.'
          : 'Correct. It goes on the quote, and a new rotor goes on with the pads.',
      },
    },
    {
      id: 'caliper-off',
      label: 'Remove the caliper bolts',
      say: `Take out the two caliper bolts on the back of the caliper with the ${b.caliperBoltMm} millimeter socket. Turn them counterclockwise.`,
      hint: `The caliper bolts take a ${b.caliperBoltMm} millimeter socket.`,
      spot: 'left-front',
      item: socket,
      targets: ['caliper-bolts-FL'],
      gesture: { kind: 'twist', turns: 1.5, dir: 'ccw' },
      wrongItems: { [otherSocket]: wrongSocket },
      effects: [{ fx: 'caliper-off' }],
    },
    {
      id: 'hang-caliper',
      label: 'Hang the caliper on the S-hook',
      say: 'Lift the caliper off the pads and hang it on the S-hook from the spring. Never let it hang from the rubber brake hose.',
      hint: 'The caliper must be supported. One part in there is made for that, and one is not.',
      spot: 'left-front',
      item: 'caliper-FL',
      targets: ['caliper-hook-FL'],
      gesture: { kind: 'press' },
      wrongTargets: { 'brake-hose-FL': HUNG_BY_HOSE },
      skipMistake: HUNG_BY_HOSE,
      effects: [{ fx: 'caliper-hang' }],
      safety: true,
    },
    {
      id: 'pads-out',
      label: 'Remove the old pads',
      say: 'Pull the outer and inner pads out of the caliper bracket.',
      hint: 'The worn pads come out of the bracket by hand.',
      spot: 'left-front',
      item: HAND,
      targets: ['pad-outer-FL', 'pad-inner-FL'],
      gesture: { kind: 'press' },
      requires: ['hang-caliper'],
      effects: [{ fx: 'pads-out' }],
    },
    {
      id: 'clips',
      label: 'Grease the pad slide clips',
      say: 'Put a thin film of brake grease on the slide clips where the pad ears ride. Keep grease far away from the rotor and the pad faces.',
      hint: 'The pads slide in metal clips at the top and bottom of the bracket.',
      spot: 'left-front',
      item: 'brake-grease',
      targets: ['pad-clips-FL'],
      gesture: { kind: 'press' },
      wrongTargets: { 'rotor-FL': GREASE_ON_ROTOR },
      skipMistake: NO_GREASE,
      effects: [{ fx: 'inspect' }],
    },
    {
      id: 'piston',
      label: 'Push the caliper piston back',
      say: 'Use the piston tool to slowly push the caliper piston back into its bore. Watch the brake fluid reservoir under the hood, because the fluid level rises as the piston goes back.',
      hint: 'New pads are thick. Make room in the caliper first.',
      why: 'If the reservoir was topped off, it can overflow when the piston goes back. Brake fluid eats paint, so a shop removes a little first.',
      spot: 'left-front',
      item: 'piston-tool',
      targets: ['caliper-piston-FL'],
      gesture: { kind: 'hold', seconds: 2.5 },
      skipMistake: PISTON_OUT,
      effects: [{ fx: 'piston' }],
    },
    {
      id: 'pads-in',
      label: 'Install the new pads',
      say: 'Take the new pads from the parts tray and seat them in the bracket, friction side facing the rotor.',
      hint: 'The new pads are on the parts tray on the cart.',
      spot: 'left-front',
      item: 'new-pads',
      targets: ['caliper-bracket-FL'],
      gesture: { kind: 'press' },
      requires: ['clips'],
      effects: [{ fx: 'pads-in' }],
    },
    {
      id: 'caliper-on',
      label: 'Refit the caliper over the new pads',
      say: 'Lift the caliper off the hook and slide it back over the new pads.',
      hint: 'The caliper goes back where it came from, over the pads.',
      spot: 'left-front',
      item: 'caliper-FL',
      targets: ['caliper-bracket-FL'],
      gesture: { kind: 'press' },
      requires: ['piston', 'pads-in'],
      effects: [{ fx: 'caliper-on' }],
    },
    {
      id: 'caliper-torque',
      label: `Torque the caliper bolts to ${caliperTorque}`,
      say: `Set the torque wrench to ${caliperTorque} and tighten the caliper bolts until it clicks.`,
      hint: 'The caliper bolt spec is on the work order.',
      spot: 'left-front',
      item: 'torque-wrench',
      targets: ['caliper-bolts-FL'],
      gesture: { kind: 'twist', turns: 0.25, dir: 'cw' },
      measure: {
        quantity: 'torque',
        spec: b.caliperBoltTorque,
        min: b.caliperBoltTorque - 2,
        max: b.caliperBoltTorque + 2,
        source: 'setting',
        under: {
          code: 'brakes.caliper.undertorque',
          kind: 'safety',
          label: 'Caliper bolts tightened below spec',
          explain: `Loose caliper bolts can back out and let the caliper fall off the rotor. The spec is ${caliperTorque}.`,
          consequence: 'wheel-wobble',
        },
        over: {
          code: 'brakes.caliper.overtorque',
          kind: 'value',
          label: 'Caliper bolts tightened above spec',
          explain: `Too much torque stretches the bolts or strips the threads in the knuckle. The spec is ${caliperTorque}.`,
          consequence: 'stripped-thread',
        },
      },
      wrongItems: { [socket]: NO_TORQUE },
      effects: [{ fx: 'plug-torque' }],
    },
    {
      id: 'wheel-on',
      label: 'Mount the wheel and start the lug nuts by hand',
      say: 'Lift the wheel back onto the hub and thread the lug nuts on by hand.',
      hint: 'The wheel is on the floor beside the car.',
      spot: 'left-front',
      item: 'wheel-FL',
      targets: ['hub-FL'],
      gesture: { kind: 'press' },
      effects: [{ fx: 'wheel-place' }, { fx: 'lugs-hand' }],
    },
    {
      id: 'stands-out',
      label: 'Lift off the stands and remove them',
      say: 'Pump the jack a couple of times to take the weight off the stands, then pull both stands out.',
      hint: 'The stands are holding the car. The jack has to take the weight back first.',
      spot: 'jack',
      item: HAND,
      targets: ['jack-handle'],
      gesture: { kind: 'pump', strokes: 2 },
      stepEffects: [{ fx: 'stands-out' }],
    },
    {
      id: 'lower',
      label: 'Lower the car to the ground',
      say: 'Check nothing is under the car, then twist the jack handle to lower it slowly onto its tires.',
      hint: 'Open the release valve by twisting the jack handle.',
      spot: 'jack',
      item: HAND,
      targets: ['jack-release'],
      gesture: { kind: 'twist', turns: 0.75, dir: 'ccw' },
      stepEffects: [{ fx: 'jack-lower', arg: 'ground' }],
    },
    {
      id: 'lug-torque',
      label: `Torque the lug nuts to ${lugTorque} in a star pattern`,
      say: `With the tire on the ground, torque the lug nuts to ${lugTorque}, crossing the wheel in a star pattern.`,
      hint: 'Tighten across the wheel, not around it.',
      spot: 'left-front',
      item: 'torque-wrench',
      targets: star.map((i) => `lug-FL-${i}`),
      ordered: true,
      gesture: { kind: 'twist', turns: 0.25, dir: 'cw' },
      measure: {
        quantity: 'torque',
        spec: vehicle.tires.lugTorque,
        min: vehicle.tires.lugTorque * 0.95,
        max: vehicle.tires.lugTorque * 1.06,
        source: 'setting',
        under: {
          code: 'brakes.lugs.undertorque',
          kind: 'safety',
          label: 'Lug nuts tightened below spec',
          explain: `Loose lug nuts can let the wheel come off. The spec is ${lugTorque}.`,
          consequence: 'wheel-wobble',
        },
        over: {
          code: 'brakes.lugs.overtorque',
          kind: 'value',
          label: 'Lug nuts tightened above spec',
          explain: `Too much torque can warp the rotor you just measured. The spec is ${lugTorque}.`,
        },
      },
      orderMistake: {
        code: 'brakes.lugs.not_star',
        kind: 'procedure',
        label: 'Torqued the lug nuts around the circle instead of a star',
        explain:
          'Tightening around the circle pulls the wheel on crooked. Cross the wheel in a star pattern so it seats evenly.',
      },
      effects: [{ fx: 'lug-torque' }],
    },
    {
      id: 'pump-pedal',
      label: 'Pump the brake pedal until it is firm',
      say: "Reach into the driver's seat and pump the brake pedal until it feels firm. The first few presses go almost to the floor.",
      hint: 'The pistons were pushed back. Something has to bring them out to the pads again.',
      why: 'Each pump pushes the pistons out until the pads touch the rotors. Only then does the pedal feel firm.',
      spot: 'driver',
      item: HAND,
      targets: ['driver-seat'],
      gesture: { kind: 'hold', seconds: 2 },
      skipMistake: NO_PEDAL,
      effects: [{ fx: 'pedal' }],
      safety: true,
    },
    {
      id: 'road-test',
      label: 'Start the car for the road test',
      say: 'Firm pedal. Start the car, and the job is ready for a road test.',
      hint: 'The last step is starting the car.',
      spot: 'driver',
      item: HAND,
      targets: ['start-button'],
      gesture: { kind: 'press' },
      requires: ['pump-pedal'],
      effects: [{ fx: 'engine-run' }],
    },
  ];
}
