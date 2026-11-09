import type { ItemId } from '../lessons/engine/types';

export interface ItemInfo {
  id: ItemId;
  name: string;
  /** What it is for, shown when hovering in Learn mode. */
  use: string;
  kind: 'tool' | 'part' | 'supply';
}

const list: ItemInfo[] = [
  { id: 'ratchet-10', name: '10 mm socket and ratchet', use: 'Small bolts: battery terminals, covers.', kind: 'tool' },
  { id: 'ratchet-14', name: '14 mm socket and ratchet', use: 'Medium bolts such as many drain plugs.', kind: 'tool' },
  { id: 'ratchet-17', name: '17 mm socket and ratchet', use: 'Larger bolts such as truck drain plugs.', kind: 'tool' },
  { id: 'filter-wrench', name: 'oil filter wrench', use: 'Grips a tight oil filter to remove it.', kind: 'tool' },
  {
    id: 'torque-wrench',
    name: 'torque wrench',
    use: 'Tightens to an exact spec. Set the dial, then pull until it clicks.',
    kind: 'tool',
  },
  { id: 'impact-wrench', name: 'impact wrench', use: 'Air tool that spins lug nuts off fast.', kind: 'tool' },
  { id: 'tire-gauge', name: 'tire pressure gauge', use: 'Reads tire pressure at the valve stem.', kind: 'tool' },
  { id: 'tread-gauge', name: 'tread depth gauge', use: 'Measures how much tread is left.', kind: 'tool' },
  { id: 'air-chuck', name: 'air chuck', use: 'Fills a tire with shop air.', kind: 'tool' },
  { id: 'rag', name: 'shop rag', use: 'Wipes surfaces clean.', kind: 'supply' },
  { id: 'new-filter', name: 'new oil filter', use: 'Replaces the old filter at every oil change.', kind: 'part' },
  { id: 'new-washer', name: 'new drain plug washer', use: 'Crush washer that seals the drain plug.', kind: 'part' },
  { id: 'drain-pan', name: 'oil drain pan', use: 'Catches old oil under the car.', kind: 'supply' },
  { id: 'drain-plug', name: 'drain plug', use: 'Seals the bottom of the oil pan.', kind: 'part' },
  { id: 'oil-bottle', name: 'jug of fresh oil', use: 'New engine oil of the grade on the work order.', kind: 'supply' },
  { id: 'breaker-bar', name: 'breaker bar', use: 'Long handle for loosening tight lug nuts by hand.', kind: 'tool' },
  { id: 'brake-gauge', name: 'brake pad gauge', use: 'Color-coded blades that measure pad thickness.', kind: 'tool' },
  { id: 'micrometer', name: 'brake rotor micrometer', use: 'Measures rotor thickness to the hundredth.', kind: 'tool' },
  {
    id: 'brake-grease',
    name: 'brake caliper grease',
    use: 'High-temp grease for slide clips and pins.',
    kind: 'supply',
  },
  { id: 'piston-tool', name: 'caliper piston tool', use: 'Pushes the caliper piston back for new pads.', kind: 'tool' },
  { id: 'new-pads', name: 'new brake pads', use: 'A full axle set of front pads.', kind: 'part' },
  { id: 'caliper-FL', name: 'front left brake caliper', use: 'Squeezes the pads against the rotor.', kind: 'part' },
  { id: 'caliper-FR', name: 'front right brake caliper', use: 'Squeezes the pads against the rotor.', kind: 'part' },
  { id: 'multimeter', name: 'digital multimeter', use: 'Reads volts. Red lead on +, black on −.', kind: 'tool' },
  {
    id: 'battery-tester',
    name: 'battery load tester',
    use: 'Puts a load on the battery and judges its health.',
    kind: 'tool',
  },
  { id: 'terminal-brush', name: 'terminal brush', use: 'Scrubs corrosion off posts and cable ends.', kind: 'tool' },
  { id: 'battery-new', name: 'new battery (correct group size)', use: 'Matches the old one.', kind: 'part' },
  { id: 'battery-wrong', name: 'new battery (smaller group size)', use: 'Fits a different car.', kind: 'part' },
  { id: 'old-battery', name: 'old battery', use: 'Goes back to the supplier as a core.', kind: 'part' },
  { id: 'jumper-cables', name: 'jumper cables', use: 'Red and black leads for a jump-start.', kind: 'tool' },
  { id: 'pack-clamps', name: 'jump pack clamps', use: 'The red and black leads of the jump pack.', kind: 'tool' },
  { id: 'scan-tool', name: 'OBD-II scan tool', use: 'Reads trouble codes and live engine data.', kind: 'tool' },
  { id: 'exhaust-hose', name: 'exhaust extraction hose', use: 'Carries exhaust out of the shop.', kind: 'tool' },
  {
    id: 'ir-thermometer',
    name: 'infrared thermometer',
    use: 'Reads surface temperature from a distance.',
    kind: 'tool',
  },
  { id: 'air-blower', name: 'compressed air blow gun', use: 'Blows debris out of tight spots.', kind: 'tool' },
  {
    id: 'plug-socket',
    name: 'spark plug socket and extension',
    use: 'Reaches plugs deep in their wells.',
    kind: 'tool',
  },
  { id: 'feeler-gauge', name: 'spark plug gap gauge', use: 'Measures and adjusts the plug gap.', kind: 'tool' },
  { id: 'dielectric-grease', name: 'dielectric grease', use: 'Seals coil boots against moisture.', kind: 'supply' },
  { id: 'new-plug', name: 'new spark plug', use: 'The replacement plug.', kind: 'part' },
  { id: 'old-plug', name: 'old spark plug', use: 'Its tip tells you how the engine runs.', kind: 'part' },
  { id: 'coil-c1', name: 'ignition coil from cylinder 1', use: 'Fires the spark plug.', kind: 'part' },
  { id: 'coil-c3', name: 'ignition coil from cylinder 3', use: 'Fires the spark plug.', kind: 'part' },
  { id: 'new-coil', name: 'new ignition coil', use: 'Replaces a failed coil.', kind: 'part' },
  { id: 'new-gas-cap', name: 'new gas cap', use: 'Seals the fuel tank.', kind: 'part' },
  { id: 'new-vacuum-hose', name: 'new vacuum hose', use: 'Replaces a cracked hose.', kind: 'part' },
  { id: 'new-thermostat', name: 'new thermostat and gasket', use: 'Controls engine temperature.', kind: 'part' },
  { id: 'cat3-meter', name: 'CAT III 1000 V meter', use: 'Rated for testing high-voltage systems.', kind: 'tool' },
  { id: 'loto-tag', name: 'lockout tag', use: 'Warns others the system is being worked on.', kind: 'supply' },
  { id: 'key-fob', name: 'key fob', use: 'Wakes the car. It goes in the lockbox.', kind: 'part' },
  // Stage 6
  { id: 'towel', name: 'folded shop towel', use: 'Cushions the windshield under a lifted wiper arm.', kind: 'supply' },
  { id: 'wiper-blades', name: 'new wiper blades (correct length)', use: 'Clips onto the wiper arm.', kind: 'part' },
  { id: 'bulb-h11', name: 'H11 headlight bulb', use: 'Halogen bulb with an L-shaped plug.', kind: 'part' },
  { id: 'bulb-9005', name: '9005 headlight bulb', use: 'Halogen bulb with a straight plug.', kind: 'part' },
  { id: 'cabin-filter-new', name: 'new cabin air filter', use: 'Cleans the air the passengers breathe.', kind: 'part' },
  {
    id: 'spill-funnel',
    name: 'spill-free coolant funnel',
    use: 'Locks on the radiator neck for a clean fill.',
    kind: 'tool',
  },
  {
    id: 'coolant-oat',
    name: 'coolant (the type on the work order)',
    use: 'Premixed 50/50 long-life coolant.',
    kind: 'supply',
  },
  {
    id: 'coolant-green',
    name: 'old-style green coolant',
    use: 'A different chemistry for older cars.',
    kind: 'supply',
  },
  {
    id: 'refractometer',
    name: 'coolant refractometer',
    use: 'Reads the freeze point from one drop of coolant.',
    kind: 'tool',
  },
  {
    id: 'align-heads',
    name: 'alignment wheel targets',
    use: 'Clamp on the wheels so the rack cameras can see them.',
    kind: 'tool',
  },
  {
    id: 'wheel-holder',
    name: 'steering wheel holder',
    use: 'Locks the steering wheel straight during adjustment.',
    kind: 'tool',
  },
  { id: 'wrench-21', name: '21 mm open-end wrench', use: 'Loosens and turns tie-rod jam nuts.', kind: 'tool' },
  {
    id: 'coupler-low',
    name: 'blue low-side coupler (gauge set)',
    use: 'Only fits the low-side A/C port.',
    kind: 'tool',
  },
  {
    id: 'coupler-high',
    name: 'red high-side coupler (gauge set)',
    use: 'Only fits the high-side A/C port.',
    kind: 'tool',
  },
  { id: 'vent-thermo', name: 'vent thermometer', use: 'Reads the air temperature at the dash vent.', kind: 'tool' },
  // Stage 7
  {
    id: 'belt-tool',
    name: 'serpentine belt tool (long breaker bar)',
    use: 'Levers the belt tensioner back to slip the belt off and on.',
    kind: 'tool',
  },
  { id: 'belt-new', name: 'new serpentine belt', use: 'Replacement drive belt, routed by the diagram.', kind: 'part' },
  { id: 'belt-gauge', name: 'belt wear gauge', use: 'Shows when the belt ribs have worn too deep.', kind: 'tool' },
  { id: 'flashlight', name: 'flashlight', use: 'Lights up dark corners under the car.', kind: 'tool' },
  { id: 'atf-funnel', name: 'long-neck funnel', use: 'Pours fluid down a narrow dipstick tube.', kind: 'tool' },
  {
    id: 'atf-spec',
    name: 'ATF (the type on the work order)',
    use: 'Automatic transmission fluid that matches the maker’s spec.',
    kind: 'supply',
  },
  {
    id: 'atf-cvt',
    name: 'CVT fluid',
    use: 'Only for CVT transmissions. Wrong for a regular automatic.',
    kind: 'supply',
  },
  { id: 'atf-pump', name: 'fluid pump', use: 'Pumps fluid up into a sealed transmission’s fill hole.', kind: 'tool' },
  {
    id: 'moisture-strip',
    name: 'brake fluid test strip',
    use: 'Shows how much water the brake fluid has absorbed.',
    kind: 'tool',
  },
  { id: 'fluid-extractor', name: 'fluid extractor', use: 'Sucks old fluid out of a reservoir.', kind: 'tool' },
  {
    id: 'brake-fluid-dot4',
    name: 'DOT 4 brake fluid',
    use: 'Glycol brake fluid; safe in DOT 3 and DOT 4 systems.',
    kind: 'supply',
  },
  {
    id: 'brake-fluid-dot5',
    name: 'DOT 5 silicone brake fluid',
    use: 'Silicone fluid. Never mix it into a DOT 3 or DOT 4 system.',
    kind: 'supply',
  },
  {
    id: 'bleed-bottle',
    name: 'bleeder bottle and hose',
    use: 'Catches the old fluid from a bleeder screw.',
    kind: 'tool',
  },
  { id: 'wrench-8', name: '8 mm bleeder wrench', use: 'Opens and closes brake bleeder screws.', kind: 'tool' },
  { id: 'tape-measure', name: 'tape measure', use: 'Measures ride height from fender lip to floor.', kind: 'tool' },
  {
    id: 'coolant-ev',
    name: 'EV battery coolant (maker approved)',
    use: 'Low-conductivity coolant made for battery cooling loops.',
    kind: 'supply',
  },
  {
    id: 'vacuum-fill',
    name: 'vacuum fill tool',
    use: 'Pulls a vacuum on the cooling loop, tests it for leaks, then fills it without air.',
    kind: 'tool',
  },
  { id: 'wheel-FL', name: 'front left wheel', use: 'Tire and rim from the front left.', kind: 'part' },
  { id: 'wheel-FR', name: 'front right wheel', use: 'Tire and rim from the front right.', kind: 'part' },
  { id: 'wheel-RL', name: 'rear left wheel', use: 'Tire and rim from the rear left.', kind: 'part' },
  { id: 'wheel-RR', name: 'rear right wheel', use: 'Tire and rim from the rear right.', kind: 'part' },
];

export const ITEMS: Record<ItemId, ItemInfo> = Object.fromEntries(list.map((i) => [i.id, i]));

export function itemName(id: ItemId): string {
  if (id === 'hand') return 'empty hand';
  return ITEMS[id]?.name ?? id;
}
