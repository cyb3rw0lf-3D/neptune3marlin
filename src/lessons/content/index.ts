import type { LessonDef, LessonId } from '../engine/types';
import { battery } from './battery';
import { brakes } from './brakes';
import { evSafety } from './ev-safety';
import { inspection } from './inspection';
import { obd2 } from './obd2';
import { oilChange } from './oil-change';
import { sparkPlugs } from './spark-plugs';
import { tireService } from './tire-service';

/** All eight lessons in menu order. */
export const LESSONS: LessonDef[] = [
  oilChange as LessonDef,
  tireService as LessonDef,
  brakes as LessonDef,
  battery as LessonDef,
  inspection as LessonDef,
  obd2 as LessonDef,
  sparkPlugs as LessonDef,
  evSafety as LessonDef,
];

export function lessonById(id: LessonId): LessonDef {
  const lesson = LESSONS.find((l) => l.id === id);
  if (!lesson) throw new Error(`Unknown lesson ${id}`);
  return lesson;
}
