import type { AcVariant } from '../lessons/content/ac-check';
import type { BatteryVariant } from '../lessons/content/battery';
import type { CoolantVariant } from '../lessons/content/coolant-flush';
import type { ObdVariant } from '../lessons/content/obd2';
import type { BeltVariant } from '../lessons/content/serpentine-belt';
import type { TransVariant } from '../lessons/content/trans-fluid';
import type { LessonId, VehicleId } from '../lessons/engine/types';
import type { VehicleSpec } from '../vehicles/specs';
import { laborLine, partLine, type QuoteLine, type ServiceId } from './price-book';

export interface Question {
  /** What the student asks. */
  q: string;
  /** The customer's answer, in their voice. */
  a: string;
  /** Helpful questions narrow the problem down; the rest are small talk. */
  helpful: boolean;
}

/** A found-it check added at the end of a job: a real problem or a temptation to upsell. */
export type ExtraId = 'wipers' | 'tires';

export interface JobTemplate {
  id: string;
  lesson: LessonId;
  vehicles: VehicleId[];
  /** The customer who brings this car in (their voice speaks the lines). */
  customer: string;
  /** Short title for the day sheet. */
  title: string;
  /** What the customer says at the counter. */
  complaint: string;
  questions: Question[];
  service: ServiceId;
  /** Keeps only lesson variants that match the complaint (e.g. the OBD scenario). */
  match?: (variant: unknown) => boolean;
  /** Parts and labor added once the work shows what the car needed. */
  partsAfter?: (variant: unknown, vehicle: VehicleSpec) => QuoteLine[];
  extras: ExtraId[];
  /** A shop upgrade the job needs (the alignment rack, the EV service cart). */
  needs?: 'rack' | 'ev-cart';
}

const obd = (code: ObdVariant['code']) => (v: unknown) => (v as ObdVariant).code === code;

export const JOBS: JobTemplate[] = [
  {
    id: 'oil-due',
    lesson: 'oil-change',
    vehicles: ['sedan', 'pickup'],
    customer: 'maya',
    title: 'Oil change',
    complaint: 'Hi! The little sticker on my windshield says I am about six hundred miles past my oil change.',
    questions: [
      {
        q: 'When was the last oil change?',
        a: 'About six thousand miles ago, at another shop.',
        helpful: true,
      },
      { q: 'Any warning lights or noises?', a: 'Nope, just the oil change reminder.', helpful: true },
      { q: 'Do you have plans this weekend?', a: 'Ha, just a soccer game. Is that important?', helpful: false },
    ],
    service: 'oil-change',
    extras: ['wipers', 'tires'],
  },
  {
    id: 'tpms-light',
    lesson: 'tire-service',
    vehicles: ['sedan', 'pickup', 'ev'],
    customer: 'dale',
    title: 'Tire pressure light & rotation',
    complaint:
      'My tire pressure light came on this morning, and I honestly cannot remember when the tires were last rotated.',
    questions: [
      {
        q: 'Does the car pull to one side?',
        a: 'Maybe a little to the left on the highway.',
        helpful: true,
      },
      { q: 'Did you hit a pothole or curb?', a: 'Not that I noticed.', helpful: true },
      { q: 'What color would you call this paint?', a: 'Uh, I just call it the car color.', helpful: false },
    ],
    service: 'tire-rotation',
    extras: ['wipers'],
  },
  {
    id: 'brake-squeal',
    lesson: 'brakes',
    vehicles: ['sedan', 'pickup', 'ev'],
    customer: 'rosa',
    title: 'Front brakes',
    complaint: 'I hear a high squeal every time I brake, and it is getting worse.',
    questions: [
      {
        q: 'Is the noise from the front or the back?',
        a: 'From the front, I think. It sounds close to my feet.',
        helpful: true,
      },
      {
        q: 'Does the pedal feel soft or go to the floor?',
        a: 'No, the pedal feels normal. It is just the noise.',
        helpful: true,
      },
      {
        q: 'Do you listen to music while you drive?',
        a: 'Sometimes. Not loud enough to hide that squeal!',
        helpful: false,
      },
    ],
    service: 'front-brakes',
    extras: ['wipers'],
  },
  {
    id: 'slow-crank',
    lesson: 'battery',
    vehicles: ['sedan', 'pickup', 'ev'],
    customer: 'theo',
    title: 'Slow crank',
    complaint: 'On cold mornings the car is slow to wake up. It starts, but it sounds tired.',
    questions: [
      { q: 'How old is the battery?', a: 'I think it is the original one. Maybe five years old?', helpful: true },
      {
        q: 'Have you left the lights on lately?',
        a: 'Not that I know of. It happens every cold morning.',
        helpful: true,
      },
      { q: 'Do you like cold weather?', a: 'Not anymore!', helpful: false },
    ],
    service: 'battery-test',
    match: (v) => (v as BatteryVariant).state !== 'dead',
    partsAfter: (v, vehicle) =>
      (v as BatteryVariant).state === 'weak'
        ? [
            laborLine('Battery replacement', 0.3),
            partLine(`Battery, group ${vehicle.battery.group}`, vehicle.hv ? 165 : 120),
          ]
        : [],
    extras: ['wipers', 'tires'],
  },
  {
    id: 'no-start',
    lesson: 'battery',
    vehicles: ['sedan', 'pickup', 'ev'],
    customer: 'june',
    title: 'No start',
    complaint: 'My car will not start at all. It just clicks. I had it towed in.',
    questions: [
      {
        q: 'Do the dash lights come on?',
        a: 'Very dim, and they flicker when I try to start it.',
        helpful: true,
      },
      { q: 'Was anything left on overnight?', a: 'Oh no. Maybe the dome light?', helpful: true },
      { q: 'Did the tow truck driver say anything?', a: 'Only that the truck was a nice color.', helpful: false },
    ],
    service: 'battery-test',
    match: (v) => (v as BatteryVariant).state === 'dead',
    extras: [],
  },
  {
    id: 'road-trip',
    lesson: 'inspection',
    vehicles: ['sedan', 'pickup', 'ev'],
    customer: 'omar',
    title: 'Pre-trip inspection',
    complaint: 'I am driving across the state next week. Could you look the whole car over first?',
    questions: [
      { q: 'Any problems you have noticed?', a: 'Nothing big. I just want peace of mind.', helpful: true },
      {
        q: 'When was it last serviced?',
        a: 'About a year ago. I have been busy.',
        helpful: true,
      },
      { q: 'Where are you headed?', a: 'To visit my sister. She makes great pie.', helpful: false },
    ],
    service: 'inspection',
    extras: [],
  },
  {
    id: 'cel-gas-cap',
    lesson: 'obd2',
    vehicles: ['sedan', 'pickup'],
    customer: 'dale',
    title: 'Check engine light (evap)',
    complaint: 'The check engine light came on a day after I filled up with gas. The car drives fine.',
    questions: [
      {
        q: 'Did you hear the gas cap click when you closed it?',
        a: 'Now that you mention it, I am not sure I did.',
        helpful: true,
      },
      { q: 'Does it run rough or smell like fuel?', a: 'No, it runs normal.', helpful: true },
      { q: 'Which gas station do you use?', a: 'Whichever is cheapest that week.', helpful: false },
    ],
    service: 'engine-diag',
    match: obd('P0455'),
    partsAfter: () => [partLine('Gas cap', 18)],
    extras: ['wipers'],
  },
  {
    id: 'cel-misfire',
    lesson: 'obd2',
    vehicles: ['sedan', 'pickup'],
    customer: 'rosa',
    title: 'Check engine light (misfire)',
    complaint: 'The engine shakes at stoplights and the check engine light is flashing.',
    questions: [
      {
        q: 'Is the light flashing or steady?',
        a: 'Flashing, especially when I speed up.',
        helpful: true,
      },
      { q: 'When did the shaking start?', a: 'Last week, and it is getting worse.', helpful: true },
      { q: 'Do you drive with the windows down?', a: 'In the summer. Why?', helpful: false },
    ],
    service: 'engine-diag',
    match: obd('P0301'),
    partsAfter: () => [laborLine('Ignition coil replacement', 0.3), partLine('Ignition coil', 62)],
    extras: ['wipers'],
  },
  {
    id: 'cel-lean',
    lesson: 'obd2',
    vehicles: ['sedan', 'pickup'],
    customer: 'theo',
    title: 'Check engine light (lean)',
    complaint: 'It idles rough, kind of hunting up and down, and the check engine light is on.',
    questions: [
      { q: 'Do you hear a hiss under the hood?', a: 'Maybe a faint hiss when it is idling.', helpful: true },
      { q: 'Is it worse when the engine is cold?', a: 'It is a little worse when it is cold.', helpful: true },
      { q: 'Do you wash the car often?', a: 'Once a month, if I am lucky.', helpful: false },
    ],
    service: 'engine-diag',
    match: obd('P0171'),
    partsAfter: () => [laborLine('Vacuum hose replacement', 0.4), partLine('Vacuum hose', 14)],
    extras: ['wipers'],
  },
  {
    id: 'cel-heater',
    lesson: 'obd2',
    vehicles: ['sedan', 'pickup'],
    customer: 'maya',
    title: 'Check engine light (cold engine)',
    complaint: 'My heater only blows lukewarm air, and now the check engine light is on.',
    questions: [
      {
        q: 'Where does the temperature gauge sit?',
        a: 'Lower than it used to. It barely reaches the middle.',
        helpful: true,
      },
      { q: 'Have you been adding coolant?', a: 'No, the level looks fine.', helpful: true },
      { q: 'Do you like your coffee hot?', a: 'Very hot. Unlike my heater.', helpful: false },
    ],
    service: 'engine-diag',
    match: obd('P0128'),
    partsAfter: () => [
      laborLine('Thermostat replacement', 1.0),
      partLine('Thermostat and gasket', 42),
      partLine('Coolant, 1 gal', 15),
    ],
    extras: ['wipers'],
  },
  {
    id: 'plugs-due',
    lesson: 'spark-plugs',
    vehicles: ['sedan', 'pickup'],
    customer: 'omar',
    title: 'Spark plugs',
    complaint:
      'The owner’s manual says spark plugs at one hundred thousand miles. I am at one hundred and two thousand.',
    questions: [
      { q: 'How does it run right now?', a: 'A little sluggish when I pull away.', helpful: true },
      {
        q: 'Has your fuel economy changed?',
        a: 'Yes, I fill up more often than I used to.',
        helpful: true,
      },
      { q: 'Did you read the whole manual?', a: 'Just the maintenance page, honestly.', helpful: false },
    ],
    service: 'spark-plugs',
    extras: ['wipers'],
  },
  {
    id: 'ev-hv',
    lesson: 'ev-safety',
    vehicles: ['ev'],
    customer: 'june',
    title: 'HV disable for coolant pump',
    complaint:
      'My car says battery coolant pump fault. The certified tech is coming tomorrow, and asked you to make the high-voltage system safe first.',
    questions: [
      {
        q: 'Is the car still drivable?',
        a: 'It limits power, so I came straight here.',
        helpful: true,
      },
      { q: 'Where is the key fob?', a: 'Right here. Do you need it?', helpful: true },
      { q: 'Do you like driving electric?', a: 'Love it. So quiet.', helpful: false },
    ],
    service: 'hv-disable',
    extras: [],
  },
  {
    id: 'day-one',
    lesson: 'wipers-bulbs',
    vehicles: ['sedan', 'pickup', 'ev'],
    customer: 'maya',
    title: 'Wipers, bulb & cabin filter',
    complaint: 'My wipers streak, one headlight is out, and the air from the vents smells a bit musty.',
    questions: [
      { q: 'Which headlight is out?', a: 'The driver side. I noticed it in the garage.', helpful: true },
      { q: 'When were the wipers last changed?', a: 'Honestly, I think never.', helpful: true },
      { q: 'Do you drive at night a lot?', a: 'Every day after work, so I really need that light.', helpful: false },
    ],
    service: 'refresh',
    extras: ['tires'],
  },
  {
    id: 'coolant-due',
    lesson: 'coolant-flush',
    vehicles: ['sedan', 'pickup'],
    customer: 'dale',
    title: 'Coolant flush',
    complaint:
      'The maintenance schedule says the coolant is due at this mileage, and my heater takes forever to warm up.',
    questions: [
      { q: 'Have you seen any leaks or puddles?', a: 'No puddles, but the reservoir looks a bit low.', helpful: true },
      { q: 'Does the temperature gauge ever run high?', a: 'No, it stays in the middle.', helpful: true },
      { q: 'Do you have a long commute?', a: 'Forty minutes each way, mostly highway.', helpful: false },
    ],
    service: 'coolant-service',
    match: (v) => (v as CoolantVariant).old !== 'oily',
    extras: ['wipers'],
  },
  {
    id: 'pulls-left',
    lesson: 'alignment',
    vehicles: ['sedan', 'pickup', 'ev'],
    customer: 'theo',
    title: 'Alignment',
    complaint: 'The car pulls to one side and the front tires are wearing funny on the edges.',
    questions: [
      { q: 'Did you hit a curb or a big pothole?', a: 'Yes, a nasty pothole a couple of weeks ago.', helpful: true },
      {
        q: 'Is the steering wheel straight when you drive?',
        a: 'It is a little crooked, now that you ask.',
        helpful: true,
      },
      { q: 'Do you like road trips?', a: 'Love them. That is why I want this fixed.', helpful: false },
    ],
    service: 'alignment',
    needs: 'rack',
    extras: [],
  },
  {
    id: 'ac-warm',
    lesson: 'ac-check',
    vehicles: ['sedan', 'pickup', 'ev'],
    customer: 'rosa',
    title: 'A/C check',
    complaint: 'The air conditioning blows cool at first, but it is warm by the afternoon.',
    questions: [
      { q: 'Does it get worse in traffic or on the highway?', a: 'Worse sitting in traffic, I think.', helpful: true },
      { q: 'Do you hear the A/C click on?', a: 'I hear a click, then it cycles a lot.', helpful: true },
      { q: 'What music do you play with the windows up?', a: 'Mostly podcasts, honestly.', helpful: false },
    ],
    service: 'ac-diagnosis',
    match: (v) => (v as AcVariant).fault !== 'normal',
    extras: ['wipers'],
  },
  {
    id: 'belt-squeal',
    lesson: 'serpentine-belt',
    vehicles: ['sedan', 'pickup'],
    customer: 'june',
    title: 'Belt squeal',
    complaint: 'There is a loud squeal from under the hood for the first minute every morning.',
    questions: [
      { q: 'Is it worse when it is cold or wet?', a: 'Yes! Rainy mornings are the worst.', helpful: true },
      { q: 'Does it squeal when you turn on the A/C?', a: 'Now that you mention it, yes, it chirps.', helpful: true },
      { q: 'Do you drive far to work?', a: 'About twenty minutes each way.', helpful: false },
    ],
    service: 'belt-replace',
    partsAfter: (v) =>
      (v as BeltVariant).weakTensioner
        ? [laborLine('Belt tensioner replacement', 0.4), partLine('Belt tensioner', 62)]
        : [],
    extras: ['wipers'],
  },
  {
    id: 'soft-pedal',
    lesson: 'brake-flush',
    vehicles: ['sedan', 'pickup', 'ev'],
    customer: 'dale',
    title: 'Brake fluid',
    complaint: 'The brake pedal feels a bit soft, and the brakes faded on the long hill into town.',
    questions: [
      {
        q: 'When was the brake fluid last changed?',
        a: 'Changed? I did not know it ever needed changing.',
        helpful: true,
      },
      { q: 'Does the pedal sink to the floor at a stop?', a: 'No, it just feels squishy at the top.', helpful: true },
      { q: 'Do you tow a trailer?', a: 'Only my fishing boat, twice a year.', helpful: false },
    ],
    service: 'brake-flush',
    extras: ['tires'],
  },
  {
    id: 'bouncy-ride',
    lesson: 'shocks',
    vehicles: ['sedan', 'pickup', 'ev'],
    customer: 'omar',
    title: 'Bouncy ride',
    complaint: 'The car keeps bouncing after bumps, and the nose dives when I brake hard.',
    questions: [
      { q: 'Did it start after hitting something?', a: 'No, it just got worse slowly.', helpful: true },
      { q: 'Any clunks over bumps?', a: 'Maybe a little knock from one corner.', helpful: true },
      { q: 'What do you use the car for?', a: 'Mostly the school run.', helpful: false },
    ],
    service: 'suspension-check',
    extras: ['tires'],
  },
  {
    id: 'slips-shifting',
    lesson: 'trans-fluid',
    vehicles: ['sedan', 'pickup'],
    customer: 'theo',
    title: 'Shifting slips',
    complaint: 'When it shifts gears, the engine revs up for a second before it catches.',
    questions: [
      { q: 'Have you seen any red drips where you park?', a: 'A couple of small reddish spots, yes.', helpful: true },
      { q: 'Is it worse when the car is warm?', a: 'Yes, worse after driving a while.', helpful: true },
      { q: 'What color is the car?', a: 'You are looking at it!', helpful: false },
    ],
    service: 'trans-check',
    partsAfter: (v) => ((v as TransVariant).low ? [partLine('ATF, 1 qt', 11)] : []),
    extras: ['wipers'],
  },
  {
    id: 'ev-coolant-due',
    lesson: 'ev-coolant',
    vehicles: ['ev'],
    customer: 'rosa',
    title: 'EV coolant',
    complaint: 'The car showed a battery coolant warning, and the manual says the coolant service is due.',
    questions: [
      { q: 'Did the warning say anything about charging?', a: 'It said fast charging might be slower.', helpful: true },
      { q: 'Have you seen any drips under the front?', a: 'Not that I have noticed.', helpful: true },
      { q: 'How do you like driving electric?', a: 'Love it. So quiet!', helpful: false },
    ],
    service: 'ev-coolant-service',
    needs: 'ev-cart',
    extras: [],
  },
];

export function jobById(id: string): JobTemplate | undefined {
  return JOBS.find((j) => j.id === id);
}

/** The reputation tier a job needs on a vehicle. */
export function tierNeeded(job: JobTemplate, vehicle: VehicleId): number {
  if (vehicle === 'ev') return 4;
  if (job.lesson === 'obd2' || job.lesson === 'spark-plugs' || job.lesson === 'ac-check') return 3;
  if (vehicle === 'pickup' || ['alignment', 'brake-flush', 'trans-fluid'].includes(job.lesson)) return 2;
  if (['brakes', 'battery', 'coolant-flush', 'serpentine-belt', 'shocks'].includes(job.lesson)) return 1;
  return 0;
}

/** What the customer says when they come back, by the mistake that caused it. */
export const COMEBACK_NOTES: Record<string, string> = {
  'oil.drain.old_washer': 'There are fresh oil spots on my driveway, right under the engine.',
  'oil.plug.undertorque': 'There are fresh oil spots on my driveway, right under the engine.',
  'oil.plug.no_torque_wrench': 'There are fresh oil spots on my driveway, right under the engine.',
  'oil.plug.overtorque': 'Oil is seeping from the drain plug, and another shop said the threads look damaged.',
  'oil.filter.double_gasket': 'Oil is dripping from around the oil filter.',
  'oil.filter.dry_gasket': 'Oil is dripping from around the oil filter.',
  'oil.fill.underfill': 'The oil light flickers when I go around corners.',
  'oil.fill.overfill': 'I saw blue smoke from the tailpipe, and it smells like burning oil.',
  'oil.wrong_grade': 'My owner’s manual says a different oil than what is on my receipt.',
  'tires.lugs.undertorque': 'I hear a clicking from one wheel, and the steering wheel shakes.',
  'tires.lugs.not_star': 'The steering wheel shakes when I brake.',
  'tires.lugs.overtorque': 'The steering wheel shakes when I brake.',
  'tires.lugs.impact_tightening': 'The steering wheel shakes when I brake.',
  'tires.left_low': 'The tire pressure light is still on.',
  'tires.overinflate': 'The ride feels really harsh and bouncy now.',
  'tires.rotation.wrong_position': 'The car pulls to one side more than before.',
  'brakes.clips.not_greased': 'The brakes still squeal.',
  'brakes.grease.on_rotor': 'The brakes feel weak, like the car does not want to stop.',
  'brakes.caliper.undertorque': 'There is a clunk from the front wheel when I brake.',
  'brakes.caliper.overtorque': 'There is a clunk from the front wheel when I brake.',
  'brakes.caliper.no_torque_wrench': 'There is a clunk from the front wheel when I brake.',
  'brakes.lugs.undertorque': 'I hear a clicking from the front wheel.',
  'brakes.lugs.overtorque': 'The steering wheel shakes when I brake.',
  'brakes.lugs.not_star': 'The steering wheel shakes when I brake.',
  'brakes.pads.wrong_call': 'The brakes are grinding now.',
  'brakes.rotor.wrong_call': 'The steering wheel shakes when I brake.',
  'battery.holddown.missing': 'There is a thump under the hood over every bump.',
  'battery.holddown.left_on': 'There is a thump under the hood over every bump.',
  'battery.replace.wrong_group': 'The battery cables barely reach, and it rattles.',
  'battery.test.wrong_call': 'The car would not start again this morning.',
  'battery.test.misread_voltage': 'The car would not start again this morning.',
  'battery.charging.misread': 'The car would not start again this morning.',
  'battery.jump.no_follow_up': 'It died again overnight. Nobody told me the battery needed testing.',
  'obd.p0455.wrong_fix': 'The check engine light is back on.',
  'obd.p0301.misread_swap': 'The check engine light is flashing again.',
  'obd.p0171.misread_trims': 'The check engine light is back on and it still idles rough.',
  'obd.p0128.misread_temp': 'The heater still blows lukewarm.',
  'obd.p0128.housing_overtorque': 'There is a coolant puddle under the front of the car.',
  'obd.clear_before_repair': 'The check engine light came right back on.',
  'plugs.undertorque': 'The engine is misfiring again.',
  'plugs.overtorque': 'The engine is misfiring again.',
  'plugs.cross_thread': 'The engine is misfiring, and it makes a ticking sound.',
  'plugs.no_blow_out': 'The engine is misfiring again.',
  'plugs.gap.wrong_call': 'The engine stumbles when I accelerate.',
  'wipers.filter.backwards': 'The vents whistle, and the air still smells musty.',
  'coolant.bleed.skipped': 'The temperature gauge climbed into the red on the highway.',
  'coolant.old.misread': 'Another shop says my coolant has oil in it. Why did nobody tell me?',
  'alignment.wheel.not_centered': 'The car drives straight now, but the steering wheel is crooked.',
  'alignment.jam.undertorque': 'The steering feels loose, and the car wanders again.',
  'ac.diagnosis.wrong': 'The A/C still blows warm in the afternoon.',
  'belt.route.wrong': 'A loud squeal started, and then the battery light came on.',
  'belt.tensioner.misjudged': 'The new belt is squealing already, and there is a grinding noise.',
  'brakeflush.order.wrong': 'The brake pedal still feels soft.',
  'brakeflush.reservoir.dry': 'The brake pedal feels even softer than before.',
  'brakeflush.pedal.released': 'The brake pedal still feels spongy.',
  'shocks.corner.wrong': 'Another shop found a leaking shock on a corner you said was fine.',
  'shocks.height.misread': 'One corner of the car still sits low.',
  'trans.fill.overfill': 'There is red fluid dripping under the car, and it shifts hard.',
  'trans.fill.under': 'It still slips when it shifts.',
  'trans.fluid.misread': 'The transmission is slipping worse now.',
  'trans.fill.wrong_type': 'It shifts harshly now, and the transmission shop asked what fluid went in.',
  'evcool.bleed.skipped': 'The car showed a battery temperature warning on a hot day.',
  'evcool.vacuum.leak_ignored': 'There is a puddle under the front of the car, and the coolant warning is back.',
};

/** Found-it checks: the inspection item, the service it sells, and any upgrade that sale needs. */
export const EXTRAS: Record<ExtraId, { check: string; service: ServiceId; needs?: 'balancer' }> = {
  wipers: { check: 'wipers', service: 'wiper-blades' },
  tires: { check: 'tires', service: 'tires-pair', needs: 'balancer' },
};
