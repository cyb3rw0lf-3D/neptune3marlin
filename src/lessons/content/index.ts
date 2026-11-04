import type { LessonDef, LessonId } from '../engine/types';
import { acCheck } from './ac-check';
import { alignment } from './alignment';
import { battery } from './battery';
import { brakes } from './brakes';
import { coolantFlush } from './coolant-flush';
import { evSafety } from './ev-safety';
import { inspection } from './inspection';
import { obd2 } from './obd2';
import { oilChange } from './oil-change';
import { sparkPlugs } from './spark-plugs';
import { tireService } from './tire-service';
import { wipersBulbs } from './wipers-bulbs';

/** All twelve lessons in menu order (the day-one starter first). */
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
];

export function lessonById(id: LessonId): LessonDef {
  const lesson = LESSONS.find((l) => l.id === id);
  if (!lesson) throw new Error(`Unknown lesson ${id}`);
  return lesson;
}
