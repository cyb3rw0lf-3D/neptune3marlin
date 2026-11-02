import { pick } from '../../core/random';
import { formatBoth, type UnitSystem } from '../../core/units';
import type { VehicleSpec } from '../../vehicles/specs';
import { HAND, type LessonDef, type MistakeDef, type StepDef } from '../engine/types';
import { engineOffStep, exhaustStep, ppeStep, runEngineStep } from './common';

export type ObdScenario = 'P0455' | 'P0301' | 'P0171' | 'P0128';

export interface ObdVariant {
  code: ObdScenario;
}

const COMPLAINT: Record<ObdScenario, string> = {
  P0455: 'Check engine light on, runs fine',
  P0301: 'Engine shakes at idle, check engine light flashing',
  P0171: 'Rough idle, check engine light on',
  P0128: 'Heater blows lukewarm, check engine light on',
};

const PART: Record<ObdScenario, string> = {
  P0455: 'new-gas-cap',
  P0301: 'new-coil',
  P0171: 'new-vacuum-hose',
  P0128: 'new-thermostat',
};

/** What the scan tool shows on each screen for each fault. */
function screens(code: ObdScenario): Record<string, string[]> {
  const cleared = { 'codes-cleared': ['Stored codes:', 'No codes stored.'] };
  switch (code) {
    case 'P0455':
      return {
        codes: ['Stored codes:', 'P0455  EVAP system:', 'large leak detected'],
        freeze: ['Freeze frame (P0455):', 'Engine off soak: 8 h', 'Fuel level: 62%', 'Ambient: 70 °F (21 °C)'],
        live: ['Live data (key on):', 'RPM: 0', 'Fuel level: 62%', 'EVAP purge: 0%'],
        ...cleared,
      };
    case 'P0301':
      return {
        codes: ['Stored codes:', 'P0301  Cylinder 1:', 'misfire detected'],
        freeze: ['Freeze frame (P0301):', 'RPM 1850, load 42%', 'Coolant 195 °F (91 °C)', 'Misfires cyl 1: 37'],
        live: ['Live data (idle):', 'Misfire count', 'Cylinder 1: 24', 'Cylinder 3: 0', 'Others: 0'],
        'live-swapped': ['Live data (idle):', 'Misfire count', 'Cylinder 1: 0', 'Cylinder 3: 26', 'Others: 0'],
        'live-after': ['Live data (idle):', 'Misfire count', 'All cylinders: 0'],
        ...cleared,
      };
    case 'P0171':
      return {
        codes: ['Stored codes:', 'P0171  System too lean', '(bank 1)'],
        freeze: ['Freeze frame (P0171):', 'RPM 760 (idle), load 18%', 'Short term trim: +9%', 'Long term trim: +24%'],
        live: ['Live data:', 'Idle: STFT +8%  LTFT +23%', '2500 rpm: STFT +2%  LTFT +4%', 'Trims drop as rpm rises'],
        'live-after': ['Live data:', 'Idle: STFT +1%  LTFT +3%', '2500 rpm: STFT 0%  LTFT +2%'],
        ...cleared,
      };
    case 'P0128':
      return {
        codes: ['Stored codes:', 'P0128  Coolant temp below', 'thermostat regulating temp'],
        freeze: ['Freeze frame (P0128):', 'Run time: 18 min', 'Coolant: 152 °F (67 °C)', 'Ambient: 50 °F (10 °C)'],
        live: [
          'Live data (20 min run):',
          'Coolant: 150 °F (66 °C)',
          'and holding there.',
          'Normal: 195-220 °F',
          '(90-104 °C)',
        ],
        'live-after': ['Live data (12 min run):', 'Coolant: 201 °F (94 °C)', 'Thermostat regulating'],
        ...cleared,
      };
  }
}

const CLEAR_EARLY: MistakeDef = {
  code: 'obd.clear_before_repair',
  kind: 'procedure',
  label: 'Cleared the codes before fixing anything',
  explain:
    'Clearing a code erases the freeze frame and readiness data you need for diagnosis, and the problem is still there. The light just comes back. Codes get cleared only after the repair.',
};

export const obd2: LessonDef<ObdVariant> = {
  id: 'obd2',
  title: 'OBD-II Diagnostics',
  summary: 'Read check-engine codes and track a code back to the real cause.',
  available: true,
  vehicles: ['sedan', 'pickup'],
  cartItems: ['ratchet-10', 'ratchet-14', 'torque-wrench', 'scan-tool', 'exhaust-hose'],
  intro:
    'A check engine light means the car computer saw a problem it could not fix itself. Today you will read the code with a scan tool, then use data and tests to find the real cause. A code points you to a system, never straight to a part.',
  outro:
    'Diagnosed, repaired and verified. You followed the data instead of guessing, and that is what a real technician does.',
  variant: (rng) => ({ code: pick(rng, ['P0455', 'P0301', 'P0171', 'P0128'] as const) }),
  stage: (v) => ({ scan: screens(v.code), trayItem: PART[v.code], exhaust: true, hoodOpen: true }),
  workOrder: (vehicle, v) => [
    `Complaint: ${COMPLAINT[v.code]}`,
    `${vehicle.name}, ${vehicle.engine}`,
    'Scan, diagnose, repair, verify',
  ],
  steps: (vehicle, v, units) => obdSteps(vehicle, v, units),
};

function obdSteps(vehicle: VehicleSpec, v: ObdVariant, units: UnitSystem): StepDef[] {
  const code = v.code;
  const start: StepDef[] = [
    ppeStep(
      'Engines are hot and have spinning parts. Glasses and gloves stay on even for diagnosis, because diagnosis often ends in a repair.',
    ),
    {
      id: 'plug-in',
      label: 'Plug the scan tool into the OBD-II port',
      say: 'Take the scan tool from its hook on the lift post. The OBD-II port is under the dash on the driver side. Plug the tool in through the open window.',
      hint: 'Every car since 1996 has its diagnostic port under the dashboard, near the steering column.',
      spot: 'driver',
      item: 'scan-tool',
      targets: ['dlc'],
      gesture: { kind: 'press' },
      effects: [{ fx: 'scan-plug' }],
    },
    {
      id: 'read-codes',
      label: 'Read the trouble codes',
      say: 'Press Read codes on the scan tool screen.',
      hint: 'The scan tool has a Read codes button.',
      spot: 'driver',
      item: HAND,
      targets: ['scan-read'],
      gesture: { kind: 'press' },
    },
    {
      id: 'freeze-frame',
      label: 'Look at the freeze frame data',
      say: 'Now press Freeze frame. It is a snapshot of the engine sensors at the moment the code was set.',
      hint: 'Freeze frame shows the conditions when the code was stored.',
      why: 'Freeze frame tells you when the fault happens: cold or hot, idle or cruising. That decides how you test.',
      spot: 'driver',
      item: HAND,
      targets: ['scan-freeze'],
      gesture: { kind: 'press' },
    },
    {
      id: 'code-means',
      label: 'Decide what the code tells you',
      say: 'What does this code actually tell you?',
      hint: 'A code names the system that failed a self-test.',
      item: HAND,
      targets: [],
      gesture: { kind: 'press' },
      choice: {
        prompt: `The scan tool shows ${code}. What does that tell you?`,
        options: [
          'Which system failed its self-test. Now test to find the cause.',
          'Exactly which part to replace.',
          'Nothing useful. Clear it and see if it comes back.',
        ],
        correct: 0,
        wrong: {
          code: 'obd.code_is_not_a_part',
          kind: 'value',
          label: 'Treated the code as a part to replace',
          explain:
            'A trouble code tells you which system failed a test, not which part is bad. Replacing parts from the code alone is called throwing parts at it. It wastes the customer money and often does not fix the car.',
        },
        right: 'Exactly. The code is where diagnosis starts, not where it ends.',
      },
    },
  ];

  const finish = (repairStep: string, hoseConnected: boolean): StepDef[] => [
    {
      id: 'clear',
      label: 'Clear the codes',
      say: 'The repair is done. Now press Clear codes on the scan tool.',
      hint: 'With the fault fixed, the stored code can be cleared.',
      spot: 'driver',
      item: HAND,
      targets: ['scan-clear'],
      gesture: { kind: 'press' },
      requires: [repairStep],
      effects: [{ fx: 'scan-clear' }],
    },
    ...(hoseConnected ? [] : [exhaustStep('verify-exhaust')]),
    runEngineStep(
      'verify-run',
      'Run the engine to verify the repair',
      'Start the engine and let it run, so the computer can test the system again.',
      [hoseConnected ? 'exhaust' : 'verify-exhaust'],
    ),
    {
      id: 'verify-read',
      label: 'Read codes again to verify',
      say: 'Read the codes one more time. No codes means the repair worked.',
      hint: 'Same button as the first time.',
      spot: 'driver',
      item: HAND,
      targets: ['scan-read'],
      gesture: { kind: 'press' },
    },
    {
      id: 'clearing-is-not-fixing',
      label: 'Explain to the customer',
      say: 'Last question, the kind a customer asks.',
      hint: 'Think about what clearing a code really does.',
      item: HAND,
      targets: [],
      gesture: { kind: 'press' },
      choice: {
        prompt: 'A customer asks: "Can you just clear the light? That fixes it, right?"',
        options: [
          'No. Clearing only turns the light off. The fault is fixed by repairing the cause, then verifying.',
          'Yes. Clearing the code resets the car and fixes the problem.',
          'Yes, but only if you clear it twice.',
        ],
        correct: 0,
        wrong: {
          code: 'obd.clearing_is_not_fixing',
          kind: 'value',
          label: 'Said that clearing a code fixes the car',
          explain:
            'Clearing only erases the memory. If the cause is still there, the computer sees it again and the light comes back, sometimes after the customer has already paid.',
        },
        right: 'Right. Honest and accurate. That is how you keep a customer.',
      },
    },
  ];

  if (code === 'P0455') {
    const repair: StepDef[] = [
      {
        id: 'check-cap',
        label: 'Inspect the gas cap',
        say: 'A large EVAP leak is very often the gas cap. Go to the fuel door and check the cap and its rubber seal.',
        hint: 'The EVAP system includes the fuel tank, and the tank has a cap.',
        spot: 'left-rear',
        item: HAND,
        targets: ['gas-cap'],
        gesture: { kind: 'press' },
        effects: [{ fx: 'inspect' }],
        readings: { 'gas-cap': { text: 'Cap was only finger-tight', note: 'The rubber seal is cracked' } },
      },
      {
        id: 'cap-call',
        label: 'Decide on the repair',
        say: 'What is the fix?',
        hint: 'A cracked seal cannot seal, no matter how tight.',
        item: HAND,
        targets: [],
        gesture: { kind: 'press' },
        choice: {
          prompt: 'The gas cap seal is cracked. What do you do?',
          options: ['Replace the gas cap', 'Tighten the old cap harder', 'Replace the charcoal canister'],
          correct: 0,
          wrong: {
            code: 'obd.p0455.wrong_fix',
            kind: 'value',
            label: 'Chose the wrong fix for the EVAP leak',
            explain:
              'The leak is at the cracked cap seal. Tightening will not seal a crack, and the canister is fine. A new cap is the right and cheapest fix.',
          },
        },
      },
      {
        id: 'repair',
        label: 'Install the new gas cap',
        say: 'Take the new cap from the parts tray and turn it on until it clicks.',
        hint: 'The new cap is on the parts tray on the cart.',
        spot: 'left-rear',
        item: 'new-gas-cap',
        targets: ['gas-cap'],
        gesture: { kind: 'twist', turns: 0.75, dir: 'cw' },
        skipMistake: CLEAR_EARLY,
        effects: [{ fx: 'part-in' }],
      },
    ];
    return [...start, ...repair, ...finish('repair', false)];
  }

  const runFirst: StepDef[] = [
    exhaustStep(),
    runEngineStep('run', 'Start the engine', 'Start the engine so the scan tool can show live data.', ['exhaust']),
    {
      id: 'live',
      label: 'Watch the live data',
      say: 'Press Live data on the scan tool and watch the numbers.',
      hint: 'Live data shows what the sensors read right now.',
      spot: 'driver',
      item: HAND,
      targets: ['scan-live'],
      gesture: { kind: 'press' },
    },
  ];

  if (code === 'P0301') {
    const coilShock: MistakeDef = {
      code: 'obd.p0301.coils_engine_running',
      kind: 'safety',
      label: 'Reached for the ignition coils with the engine running',
      explain:
        'Ignition coils put out tens of thousands of volts. Touching one on a running engine can give a painful shock and make you jerk your hand into moving parts. Engine off first.',
      consequence: 'spark',
    };
    const repair: StepDef[] = [
      { ...engineOffStep('stop', 'Engine off before you touch the coils.'), skipMistake: coilShock, safety: true },
      {
        id: 'coils-out',
        label: 'Pull the coils on cylinders 1 and 3',
        say: 'Here is the classic swap test. Unplug and pull the ignition coils from cylinder 1 and cylinder 3.',
        hint: 'The coils sit in a row on top of the engine. Cylinder 1 is first.',
        spot: 'hood',
        item: HAND,
        targets: ['coil-1', 'coil-3'],
        gesture: { kind: 'hold', seconds: 0.8 },
        requires: ['stop'],
        effects: [{ fx: 'coil-out' }],
      },
      {
        id: 'swap',
        label: 'Swap the two coils',
        say: 'Put the coil from cylinder 1 into cylinder 3, and the coil from cylinder 3 into cylinder 1.',
        hint: 'Each coil goes into the other one’s well.',
        spot: 'hood',
        item: 'coil-c3',
        targets: ['plug-well-1', 'plug-well-3'],
        targetItems: { 'plug-well-1': 'coil-c3', 'plug-well-3': 'coil-c1' },
        gesture: { kind: 'press' },
        effects: [{ fx: 'coil-in' }],
        stepEffects: [{ fx: 'scan-set', arg: 'live=live-swapped' }],
      },
      runEngineStep('run-swapped', 'Start the engine again', 'Start the engine and let it idle.', ['exhaust']),
      {
        id: 'live-swapped',
        label: 'Check the misfire counters again',
        say: 'Look at the live data again. Where is the misfire now?',
        hint: 'Live data, misfire count.',
        spot: 'driver',
        item: HAND,
        targets: ['scan-live'],
        gesture: { kind: 'press' },
      },
      {
        id: 'swap-call',
        label: 'Decide what failed',
        say: 'What does the swap test tell you?',
        hint: 'Did the misfire stay in cylinder 1, or did it move?',
        item: HAND,
        targets: [],
        gesture: { kind: 'press' },
        choice: {
          prompt:
            'Before the swap, cylinder 1 misfired. After swapping coils 1 and 3, cylinder 3 misfires. What failed?',
          options: [
            'The ignition coil: the misfire followed it',
            'The spark plug in cylinder 1',
            'The engine computer',
          ],
          correct: 0,
          wrong: {
            code: 'obd.p0301.misread_swap',
            kind: 'value',
            label: 'Misread the coil swap test',
            explain:
              'The misfire moved from cylinder 1 to cylinder 3, the same way the coil moved. Whatever moved with the problem is the problem: the coil.',
          },
          right: 'Correct. The misfire followed the coil, so the coil is bad.',
        },
      },
      {
        ...engineOffStep('stop-2', 'Engine off again before you replace the coil.'),
        skipMistake: coilShock,
        safety: true,
      },
      {
        id: 'bad-coil-out',
        label: 'Remove the bad coil (now in cylinder 3)',
        say: 'The bad coil is now in cylinder 3. Pull it out.',
        hint: 'The bad coil moved during the swap test.',
        spot: 'hood',
        item: HAND,
        targets: ['coil-3'],
        gesture: { kind: 'hold', seconds: 0.8 },
        requires: ['stop-2'],
        effects: [{ fx: 'coil-out' }],
      },
      {
        id: 'repair',
        label: 'Install the new coil in cylinder 3',
        say: 'Take the new coil from the parts tray and press it into cylinder 3.',
        hint: 'The new coil is on the parts tray.',
        spot: 'hood',
        item: 'new-coil',
        targets: ['plug-well-3'],
        gesture: { kind: 'press' },
        skipMistake: CLEAR_EARLY,
        effects: [{ fx: 'coil-in' }],
        stepEffects: [{ fx: 'scan-set', arg: 'live=live-after' }],
      },
    ];
    return [...start, ...runFirst, ...repair, ...finish('repair', true)];
  }

  if (code === 'P0171') {
    const repair: StepDef[] = [
      {
        id: 'trim-call',
        label: 'Read the fuel trims',
        say: 'Fuel trims show how much extra fuel the computer adds. Compare idle with 2500 rpm.',
        hint: 'Which condition has the most unmetered air?',
        item: HAND,
        targets: [],
        gesture: { kind: 'press' },
        choice: {
          prompt: 'Long term fuel trim is +23% at idle but only +4% at 2500 rpm. What does that point to?',
          options: ['Unmetered air: a vacuum leak', 'A weak fuel pump', 'A clogged air filter'],
          correct: 0,
          wrong: {
            code: 'obd.p0171.misread_trims',
            kind: 'value',
            label: 'Misread the fuel trims',
            explain:
              'A vacuum leak lets in air the sensors never measured. It matters most at idle, when little air flows, and fades at higher rpm. A weak pump does the opposite: it gets worse under load.',
          },
          right: 'Right. Lean at idle, normal at speed: classic vacuum leak.',
        },
      },
      engineOffStep('stop', 'Engine off, then inspect the vacuum hoses.'),
      {
        id: 'find-leak',
        label: 'Inspect the vacuum hoses',
        say: 'Look over the vacuum hoses on the intake for cracks, especially at the bends.',
        hint: 'Rubber vacuum hoses crack where they bend.',
        spot: 'hood',
        item: HAND,
        targets: ['vacuum-hose'],
        gesture: { kind: 'press' },
        effects: [{ fx: 'inspect' }],
        readings: {
          'vacuum-hose': { text: 'Cracked through at the bend', note: 'You can hear a hiss with the engine running' },
        },
      },
      {
        id: 'repair',
        label: 'Replace the vacuum hose',
        say: 'Fit the new hose from the parts tray.',
        hint: 'The new hose is on the parts tray.',
        spot: 'hood',
        item: 'new-vacuum-hose',
        targets: ['vacuum-hose'],
        gesture: { kind: 'press' },
        skipMistake: CLEAR_EARLY,
        effects: [{ fx: 'part-in' }],
        stepEffects: [{ fx: 'scan-set', arg: 'live=live-after' }],
      },
    ];
    return [...start, ...runFirst, ...repair, ...finish('repair', true)];
  }

  // P0128: thermostat stuck open.
  const torque = formatBoth('torque', 9, units);
  const repair: StepDef[] = [
    {
      id: 'temp-call',
      label: 'Read the coolant temperature',
      say: 'The engine has been running for twenty minutes. Look at the coolant temperature.',
      hint: 'A warm engine should be close to 200 degrees Fahrenheit.',
      item: HAND,
      targets: [],
      gesture: { kind: 'press' },
      choice: {
        prompt: 'After 20 minutes the coolant holds at 150 °F (66 °C). Normal is 195 to 220 °F. Most likely cause?',
        options: ['The thermostat is stuck open', 'The coolant is low', 'The water pump has failed'],
        correct: 0,
        wrong: {
          code: 'obd.p0128.misread_temp',
          kind: 'value',
          label: 'Misjudged the cold-running engine',
          explain:
            'An engine that warms up but never reaches normal temperature is losing heat to the radiator all the time. A thermostat stuck open does exactly that. Low coolant or a failed pump makes an engine overheat instead.',
        },
        right: 'Correct. It never closes, so the engine never warms up fully.',
      },
    },
    engineOffStep('stop', 'Engine off. Let it cool before you open the cooling system.'),
    {
      id: 'housing-off',
      label: 'Remove the thermostat housing',
      say: 'With the engine cool, unbolt the thermostat housing where the upper hose meets the engine.',
      hint: 'The thermostat sits under the housing at the end of the upper hose.',
      spot: 'hood',
      item: 'ratchet-10',
      targets: ['thermostat'],
      gesture: { kind: 'twist', turns: 1.5, dir: 'ccw' },
      effects: [{ fx: 'inspect' }],
    },
    {
      id: 'thermostat-in',
      label: 'Fit the new thermostat and gasket',
      say: 'Fit the new thermostat with a new gasket. The spring side faces the engine.',
      hint: 'The new thermostat is on the parts tray.',
      spot: 'hood',
      item: 'new-thermostat',
      targets: ['thermostat'],
      gesture: { kind: 'press' },
      effects: [{ fx: 'part-in' }],
    },
    {
      id: 'repair',
      label: `Torque the housing bolts to ${torque}`,
      say: `Bolt the housing back on and torque the bolts to ${torque}. The housing is aluminum, so do not overtighten.`,
      hint: 'Small bolts into aluminum need a low torque.',
      spot: 'hood',
      item: 'torque-wrench',
      targets: ['thermostat'],
      gesture: { kind: 'twist', turns: 0.25, dir: 'cw' },
      measure: {
        quantity: 'torque',
        spec: 9,
        min: 8,
        max: 10,
        source: 'setting',
        over: {
          code: 'obd.p0128.housing_overtorque',
          kind: 'value',
          label: 'Overtightened the thermostat housing',
          explain: `The aluminum housing can crack or the threads strip. The spec is ${torque}.`,
          consequence: 'stripped-thread',
        },
      },
      skipMistake: CLEAR_EARLY,
      effects: [{ fx: 'plug-torque' }],
      stepEffects: [{ fx: 'scan-set', arg: 'live=live-after' }],
    },
  ];
  void vehicle;
  return [...start, ...runFirst, ...repair, ...finish('repair', true)];
}
