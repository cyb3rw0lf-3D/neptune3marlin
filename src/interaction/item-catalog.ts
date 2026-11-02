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
