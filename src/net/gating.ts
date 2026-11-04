import type { ClassSettings, LessonKey } from './protocol';

/** What a class lets a student start. Every function returns why not, or null when allowed. */

export function lessonLock(settings: ClassSettings | null, lesson: LessonKey): string | null {
  if (!settings) return null;
  return settings.open[lesson] === false ? 'Your teacher has not opened this lesson yet.' : null;
}

export function modeLock(
  settings: ClassSettings | null,
  mode: 'learn' | 'practice' | 'test',
  progress: { learned: boolean },
): string | null {
  if (!settings) return null;
  if (mode === 'test' && settings.learnFirst && !progress.learned)
    return 'Finish Learn first. Your teacher asked for it.';
  return null;
}

export function shopLock(settings: ClassSettings | null, passedAnyTest: boolean): string | null {
  if (!settings || settings.shop === 'on') return null;
  if (settings.shop === 'off') return 'Shop mode is turned off for your class.';
  return passedAnyTest ? null : 'Pass any lesson Test to open Shop mode.';
}
