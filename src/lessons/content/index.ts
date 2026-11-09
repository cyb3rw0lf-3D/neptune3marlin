import type { LessonDef, LessonId } from '../engine/types';
import { acCheck } from './ac-check';
import { alignment } from './alignment';
import { battery } from './battery';
import { brakeFlush } from './brake-flush';
import { brakes } from './brakes';
import { coolantFlush } from './coolant-flush';
import { evCoolant } from './ev-coolant';
import { evSafety } from './ev-safety';
import { inspection } from './inspection';
import { obd2 } from './obd2';
import { oilChange } from './oil-change';
import { serpentineBelt } from './serpentine-belt';
import { shocks } from './shocks';
import { sparkPlugs } from './spark-plugs';
import { tireService } from './tire-service';
import { transFluid } from './trans-fluid';
import { wipersBulbs } from './wipers-bulbs';

/** All seventeen lessons in menu order (the day-one starter first). */
export const LESSONS: LessonDef[] = [
  wipersBulbs as LessonDef,
  oilChange as LessonDef,
  tireService as LessonDef,
  brakes as LessonDef,
  battery as LessonDef,
  inspection as LessonDef,
  obd2 as LessonDef,
  sparkPlugs as LessonDef,
  evSafety as LessonDef,
  coolantFlush as LessonDef,
  alignment as LessonDef,
  acCheck as LessonDef,
  serpentineBelt as LessonDef,
  shocks as LessonDef,
  brakeFlush as LessonDef,
  transFluid as LessonDef,
  evCoolant as LessonDef,
];

export function lessonById(id: LessonId): LessonDef {
  const lesson = LESSONS.find((l) => l.id === id);
  if (!lesson) throw new Error(`Unknown lesson ${id}`);
  return lesson;
}
