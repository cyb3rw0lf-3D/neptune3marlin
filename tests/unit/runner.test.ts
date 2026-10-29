import { describe, expect, it } from 'vitest';
import { LessonRunner } from '../../src/lessons/engine/runner';
import { HAND, type StepDef } from '../../src/lessons/engine/types';

const glassesSkip = {
  code: 'safety.glasses',
  kind: 'safety' as const,
  label: 'No glasses',
  explain: 'Wear glasses.',
};

function steps(): StepDef[] {
  return [
    {
      id: 'ppe',
      label: 'PPE',
      say: '',
      hint: 'glasses',
      item: HAND,
      targets: ['glasses', 'gloves'],
      gesture: { kind: 'press' },
      skipMistake: glassesSkip,
      effects: [{ fx: 'ppe' }],
    },
    {
      id: 'drain',
      label: 'Drain',
      say: '',
      hint: '',
      item: 'ratchet-14',
      targets: ['drain-plug'],
      gesture: { kind: 'twist', turns: 2, dir: 'ccw' },
      requires: ['ppe'],
      wrongItems: {
        'ratchet-10': { code: 'oil.socket', kind: 'wrong-item', label: 'Wrong socket', explain: 'Too small.' },
      },
    },
    {
      id: 'torque',
      label: 'Torque',
      say: '',
      hint: '',
      item: 'torque-wrench',
      targets: ['drain-plug'],
      gesture: { kind: 'twist', turns: 0.25, dir: 'cw' },
      measure: { quantity: 'torque', spec: 30, min: 27, max: 33, source: 'setting' },
    },
    {
      id: 'fill',
      label: 'Fill',
      say: '',
      hint: '',
      item: 'oil',
      targets: ['neck'],
      gesture: { kind: 'hold', seconds: 30 },
      measure: { quantity: 'volume', spec: 4.4, min: 4.2, max: 4.7, source: 'fill', rate: 0.5 },
    },
    {
      id: 'quiz',
      label: 'Quiz',
      say: '',
      hint: '',
      item: HAND,
      targets: [],
      gesture: { kind: 'press' },
      choice: {
        prompt: '?',
        options: ['a', 'b'],
        correct: 1,
        wrong: { code: 'quiz.wrong', kind: 'procedure', label: 'Wrong', explain: 'No.' },
      },
    },
  ];
}

describe('LessonRunner', () => {
  it('runs a lesson to completion with a perfect score', () => {
    const r = new LessonRunner(steps(), 'test');
    expect(r.attempt(HAND, 'glasses').kind).toBe('start');
    expect(r.complete('glasses').kind).toBe('done');
    const v = r.complete('gloves');
    expect(v.kind === 'done' && v.stepDone).toBe(true);
    expect(r.attempt('ratchet-14', 'drain-plug').kind).toBe('start');
    r.complete('drain-plug');
    r.complete('drain-plug', 30);
    r.complete('neck', 4.4);
    const last = r.answer(1);
    expect(last.kind === 'done' && last.lessonDone).toBe(true);
    const res = r.result();
    expect(res).toMatchObject({ completed: true, score: 100, passed: true, criticalCount: 0 });
  });

  it('raises the safety skip mistake when a dependent step is attempted early', () => {
    const r = new LessonRunner(steps(), 'test');
    const v = r.attempt('ratchet-14', 'drain-plug');
    expect(v.kind).toBe('mistake');
    if (v.kind === 'mistake') expect(v.mistake.code).toBe('safety.glasses');
    expect(r.result().criticalCount).toBe(1);
  });

  it('a critical mistake fails the test even with a high score', () => {
    const r = new LessonRunner(steps(), 'test');
    r.attempt('ratchet-14', 'drain-plug');
    r.complete('glasses');
    r.complete('gloves');
    r.complete('drain-plug');
    r.complete('drain-plug', 30);
    r.complete('neck', 4.4);
    r.answer(1);
    const res = r.result();
    expect(res.score).toBe(75);
    expect(res.passed).toBe(false);
  });

  it('uses specific and generic wrong-item mistakes, penalizing each code once', () => {
    const r = new LessonRunner(steps(), 'practice', { itemName: (id) => `name:${id}` });
    r.complete('glasses');
    r.complete('gloves');
    const a = r.attempt('ratchet-10', 'drain-plug');
    expect(a.kind === 'mistake' && a.mistake.code).toBe('oil.socket');
    r.attempt('ratchet-10', 'drain-plug');
    const b = r.attempt('rag', 'drain-plug');
    expect(b.kind === 'mistake' && b.mistake.explain).toContain('name:ratchet-14');
    const res = r.result();
    expect(res.mistakes.find((m) => m.code === 'oil.socket')?.count).toBe(2);
    expect(res.score).toBe(96);
  });

  it('rejects torque settings outside the spec and keeps the step open', () => {
    const r = new LessonRunner(steps(), 'test');
    r.complete('glasses');
    r.complete('gloves');
    r.complete('drain-plug');
    expect(r.complete('drain-plug', 45).kind).toBe('mistake');
    expect(r.current?.id).toBe('torque');
    expect(r.complete('drain-plug', 31).kind).toBe('done');
    expect(r.current?.id).toBe('fill');
  });

  it('ignores an under-filled release and completes an overfill with a recorded mistake', () => {
    const r = new LessonRunner(steps(), 'test');
    for (const t of ['glasses', 'gloves', 'drain-plug']) r.complete(t);
    r.complete('drain-plug', 30);
    expect(r.complete('neck', 3).kind).toBe('ignored');
    const v = r.complete('neck', 5);
    expect(v.kind).toBe('done');
    if (v.kind === 'done') expect(v.mistake?.def.kind).toBe('value');
  });

  it('flags generic out-of-order work and nudges unrelated tools', () => {
    const r = new LessonRunner(steps(), 'test');
    r.complete('glasses');
    r.complete('gloves');
    const early = r.attempt('torque-wrench', 'drain-plug');
    // drain-plug is in the current step, so the torque wrench is the wrong item.
    expect(early.kind).toBe('mistake');
    const neck = r.attempt('oil', 'neck');
    expect(neck.kind === 'mistake' && neck.mistake.kind).toBe('order');
    expect(r.attempt(HAND, 'neck')).toEqual({ kind: 'ignored', reason: 'not-yet' });
    expect(r.attempt(HAND, 'nothing')).toEqual({ kind: 'ignored', reason: 'unrelated' });
  });

  it('only gives hints in practice mode', () => {
    expect(new LessonRunner(steps(), 'practice').hint()).toBe('glasses');
    expect(new LessonRunner(steps(), 'test').hint()).toBeNull();
    const r = new LessonRunner(steps(), 'practice');
    r.hint();
    r.hint();
    expect(r.result().hints).toBe(2);
  });

  it('enforces target order in ordered steps', () => {
    const ordered: StepDef[] = [
      {
        id: 'star',
        label: 'Star',
        say: '',
        hint: '',
        item: 'tw',
        targets: ['l0', 'l2', 'l4', 'l1', 'l3'],
        ordered: true,
        gesture: { kind: 'press' },
        orderMistake: { code: 'not_star', kind: 'procedure', label: 'x', explain: 'y' },
      },
    ];
    const r = new LessonRunner(ordered, 'test');
    expect(r.attempt('tw', 'l0').kind).toBe('start');
    r.complete('l0');
    const v = r.attempt('tw', 'l1');
    expect(v.kind === 'mistake' && v.mistake.code).toBe('not_star');
    expect(r.attempt('tw', 'l2').kind).toBe('start');
  });

  it('measures duration with the injected clock', () => {
    let t = 1000;
    const r = new LessonRunner(steps().slice(0, 1), 'learn', { now: () => t });
    r.complete('glasses');
    t = 61_000;
    r.complete('gloves');
    t = 99_000;
    expect(r.result().durationSec).toBe(60);
  });
});
