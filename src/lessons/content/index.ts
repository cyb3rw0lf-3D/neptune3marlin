import type { LessonDef, LessonId, VehicleId } from '../engine/types';
import { oilChange } from './oil-change';
import { tireService } from './tire-service';

function comingSoon(id: LessonId, title: string, summary: string, vehicles: VehicleId[]): LessonDef {
  return {
    id,
    title,
    summary,
    available: false,
    vehicles,
    cartItems: [],
    intro: '',
    outro: '',
    variant: () => ({}),
    workOrder: () => [],
    steps: () => [],
  };
}

/** All eight lessons in menu order. Unavailable ones arrive in later stages. */
export const LESSONS: LessonDef[] = [
  oilChange as LessonDef,
  tireService as LessonDef,
  comingSoon(
    'brakes',
    'Brake Inspection & Pads',
    'Measure pads and rotors, then replace the front pads safely on jack stands.',
    ['sedan', 'pickup', 'ev'],
  ),
  comingSoon(
    'battery',
    'Battery & Jump-Start',
    'Test, disconnect in the safe order, replace a battery, and jump-start a car.',
    ['sedan', 'pickup'],
  ),
  comingSoon(
    'inspection',
    'Multi-Point Inspection',
    'Check fluids, belts, hoses, filters, wipers and lights, and report honestly.',
    ['sedan', 'pickup', 'ev'],
  ),
  comingSoon('obd2', 'OBD-II Diagnostics', 'Read check-engine codes and track a code back to the real cause.', [
    'sedan',
    'pickup',
  ]),
  comingSoon('spark-plugs', 'Spark Plugs & Ignition', 'Read old plugs for clues, gap and torque new ones.', [
    'sedan',
    'pickup',
  ]),
  comingSoon(
    'ev-safety',
    'EV High-Voltage Safety',
    'Spot high-voltage parts and rehearse the certified shutdown procedure.',
    ['ev'],
  ),
];

export function lessonById(id: LessonId): LessonDef {
  const lesson = LESSONS.find((l) => l.id === id);
  if (!lesson) throw new Error(`Unknown lesson ${id}`);
  return lesson;
}
