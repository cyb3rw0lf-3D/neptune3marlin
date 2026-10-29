import { describe, expect, it } from 'vitest';
import { type KeyValueStore, SaveStore } from '../../src/core/save';
import type { RunResult } from '../../src/lessons/engine/types';

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

const result = (over: Partial<RunResult> = {}): RunResult => ({
  completed: true,
  score: 90,
  passed: true,
  criticalCount: 0,
  mistakes: [],
  hints: 0,
  durationSec: 200,
  stepsDone: 10,
  stepsTotal: 10,
  ...over,
});

describe('SaveStore', () => {
  it('creates profiles and persists them', () => {
    const mem = memoryStore();
    const s = new SaveStore(mem);
    const p = s.createProfile('  Ana   Lopez ');
    expect(p.name).toBe('Ana Lopez');
    const reloaded = new SaveStore(mem);
    expect(reloaded.activeProfile?.name).toBe('Ana Lopez');
  });

  it('records progress and awards a certificate only for a passed test', () => {
    const s = new SaveStore(memoryStore());
    s.createProfile('Sam');
    const base = { lessonId: 'oil-change' as const, lessonTitle: 'Oil', vehicleName: 'Aster S4' };
    s.recordRun({ ...base, ...result(), mode: 'learn' });
    s.recordRun({ ...base, ...result({ score: 85 }), mode: 'practice' });
    expect(s.progress('oil-change')).toMatchObject({ learned: true, practiceBest: 85, passed: false });
    s.recordRun({ ...base, ...result({ score: 70, passed: false }), mode: 'test' });
    expect(s.progress('oil-change').passed).toBe(false);
    s.recordRun({ ...base, ...result({ score: 92 }), mode: 'test' });
    expect(s.progress('oil-change')).toMatchObject({ passed: true, testBest: 92 });
    expect(s.progress('oil-change').certificateDate).not.toBeNull();
  });

  it('survives corrupt or unavailable storage', () => {
    const mem = memoryStore();
    mem.data.set('service-bay-vr/save', '{not json');
    expect(new SaveStore(mem).data.profiles).toEqual([]);
    const throwing: KeyValueStore = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    const s = new SaveStore(throwing);
    expect(s.createProfile('X').name).toBe('X');
    expect(s.persist()).toBe(false);
    expect(new SaveStore(null).persist()).toBe(false);
  });

  it('sanitizes settings', () => {
    const s = new SaveStore(memoryStore());
    expect(s.updateSettings({ units: 'metric', heightOffset: 99 } as never)).toMatchObject({
      units: 'metric',
      heightOffset: 0,
    });
  });
});
