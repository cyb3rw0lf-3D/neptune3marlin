import { describe, expect, it } from 'vitest';
import { SaveStore } from '../../src/core/save';
import { LESSONS } from '../../src/lessons/content';
import { lessonLock, modeLock, shopLock } from '../../src/net/gating';
import {
  type AttemptUpload,
  cleanName,
  defaultClassSettings,
  LESSON_KEYS,
  normalizeCode,
  parseSettings,
  parseSync,
} from '../../src/net/protocol';
import {
  backoff,
  emptyOutbox,
  enqueue,
  isDue,
  MAX_PENDING,
  markFailed,
  markSent,
  nextBatch,
  sanitizeOutbox,
} from '../../src/net/sync-queue';

const attempt = (id: string, over: Partial<AttemptUpload> = {}): AttemptUpload => ({
  id,
  lesson: 'oil-change',
  mode: 'test',
  vehicle: 'Aster S4',
  score: 90,
  passed: true,
  completed: true,
  critical: 0,
  hints: 0,
  seconds: 200,
  mistakes: [],
  at: Date.parse('2026-11-01T10:00:00Z'),
  ...over,
});

function memoryStore() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}

describe('protocol', () => {
  it('lists exactly the game lessons', () => {
    expect([...LESSON_KEYS].sort()).toEqual(LESSONS.map((l) => l.id).sort());
  });

  it('validates sync uploads', () => {
    expect(parseSync({ attempts: [attempt('abcdefgh-1')] })).toMatchObject({ attempts: [{ id: 'abcdefgh-1' }] });
    expect(parseSync({ attempts: [attempt('abcdefgh-1', { score: 140 })] })).toBe('invalid attempt');
    expect(parseSync({ attempts: [attempt('bad id with spaces')] })).toBe('invalid attempt');
    expect(
      parseSync({
        attempts: [
          attempt('abcdefgh-2', { mistakes: [{ code: 'DROP TABLE', label: 'x', count: 1, critical: false }] }),
        ],
      }),
    ).toBe('invalid attempt');
    expect(parseSync({ attempts: [], heartbeat: { lesson: 'brakes', mode: 'test', step: 7 } })).toBe(
      'invalid heartbeat',
    );
    expect(typeof parseSync({ attempts: Array.from({ length: 51 }, (_, i) => attempt(`abcdefgh-${i}`)) })).toBe(
      'string',
    );
  });

  it('cleans names and codes', () => {
    expect(cleanName('  Ms.  Rivera’s   Period 3 ', 60)).toBeNull();
    expect(cleanName("  Ms.  Rivera's   Period 3 ", 60)).toBe("Ms. Rivera's Period 3");
    expect(cleanName('José', 24)).toBe('José');
    expect(cleanName('<b>', 24)).toBeNull();
    expect(normalizeCode(' ab3-def ')).toBe('AB3DEF');
    expect(normalizeCode('O0O0O0')).toBeNull();
  });

  it('round-trips settings and rejects bad ones', () => {
    const s = defaultClassSettings();
    s.open.brakes = false;
    expect(parseSettings(JSON.parse(JSON.stringify(s)))).toEqual(s);
    expect(parseSettings({ ...s, shop: 'sometimes' })).toBeNull();
  });
});

describe('sync queue', () => {
  it('queues each result once and drops the oldest past the limit', () => {
    const o = emptyOutbox();
    enqueue(o, attempt('aaaaaaaa'));
    enqueue(o, attempt('aaaaaaaa'));
    expect(o.pending).toHaveLength(1);
    for (let i = 0; i < 10; i++) enqueue(o, attempt(`bbbbbbbb-${i}`), 5);
    expect(o.pending).toHaveLength(5);
    expect(o.pending[0]?.id).toBe('bbbbbbbb-5');
  });

  it('sends in batches and clears what was accepted', () => {
    const o = emptyOutbox();
    for (let i = 0; i < 60; i++) enqueue(o, attempt(`cccccccc-${i}`));
    const batch = nextBatch(o);
    expect(batch).toHaveLength(50);
    markSent(o, batch, 1000);
    expect(o.pending).toHaveLength(10);
    expect(o.lastSync).toBe(1000);
  });

  it('backs off after failures, up to five minutes, and retries new work soon', () => {
    const o = emptyOutbox();
    markFailed(o, 0, 'offline');
    expect(o.nextTry).toBe(5000);
    expect(isDue(o, 4000)).toBe(false);
    markFailed(o, 0, 'offline');
    markFailed(o, 0, 'offline');
    expect(o.nextTry).toBe(20000);
    expect(backoff(20)).toBe(300_000);
    o.nextTry = Date.now() + 999_999;
    enqueue(o, attempt('dddddddd'));
    expect(o.nextTry).toBeLessThanOrEqual(Date.now() + 5000);
  });

  it('repairs a damaged outbox from storage', () => {
    expect(sanitizeOutbox(null)).toEqual(emptyOutbox());
    const o = sanitizeOutbox({ pending: [attempt('eeeeeeee'), null, { nope: 1 }], failures: -3 });
    expect(o.pending).toHaveLength(1);
    expect(o.failures).toBe(0);
    expect(
      sanitizeOutbox({ pending: Array.from({ length: MAX_PENDING + 5 }, (_, i) => attempt(`f-${i}xxxxxx`)) }).pending,
    ).toHaveLength(MAX_PENDING);
  });
});

describe('class gating', () => {
  it('locks closed lessons, Test before Learn, and Shop mode', () => {
    const s = defaultClassSettings();
    expect(lessonLock(null, 'brakes')).toBeNull();
    s.open.brakes = false;
    expect(lessonLock(s, 'brakes')).toMatch(/not opened/);
    expect(lessonLock(s, 'oil-change')).toBeNull();
    expect(modeLock(s, 'test', { learned: false })).toBeNull();
    s.learnFirst = true;
    expect(modeLock(s, 'test', { learned: false })).toMatch(/Learn first/);
    expect(modeLock(s, 'test', { learned: true })).toBeNull();
    expect(modeLock(s, 'practice', { learned: false })).toBeNull();
    s.shop = 'off';
    expect(shopLock(s, true)).toMatch(/turned off/);
    s.shop = 'passed';
    expect(shopLock(s, false)).toMatch(/Pass any/);
    expect(shopLock(s, true)).toBeNull();
  });
});

describe('class link in the save', () => {
  it('queues every finished run of a student in a class, and nothing otherwise', () => {
    const save = new SaveStore(memoryStore());
    save.createProfile('Sam');
    const run = {
      completed: true,
      score: 88,
      passed: true,
      criticalCount: 0,
      mistakes: [
        {
          code: 'oil.plug.undertorque',
          kind: 'value' as const,
          label: 'Under-torqued',
          explain: 'x',
          critical: false,
          penalty: 10,
          stepId: 'plug',
          count: 2,
        },
      ],
      hints: 1,
      durationSec: 201.6,
      stepsDone: 20,
      stepsTotal: 20,
      lessonId: 'oil-change' as const,
      lessonTitle: 'Oil & Filter Change',
      mode: 'test' as const,
      vehicleName: 'Aster S4',
    };
    save.recordRun(run);
    expect(save.activeProfile?.class).toBeUndefined();
    save.linkClass({
      className: 'Period 3',
      nickname: 'Sam',
      studentId: 's1',
      token: 's1.tok',
      settings: defaultClassSettings(),
    });
    const rec = save.recordRun(run);
    const queued = save.activeProfile?.class?.outbox.pending ?? [];
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({
      id: rec?.id,
      lesson: 'oil-change',
      score: 88,
      seconds: 202,
      hints: 1,
      mistakes: [{ code: 'oil.plug.undertorque', count: 2, critical: false }],
    });
    expect(parseSync({ attempts: queued })).not.toBeTypeOf('string');
    // The link survives a reload.
    const again = new SaveStore({ getItem: () => JSON.stringify(save.data), setItem: () => {} });
    expect(again.activeProfile?.class?.className).toBe('Period 3');
    expect(again.activeProfile?.class?.outbox.pending).toHaveLength(1);
  });
});
