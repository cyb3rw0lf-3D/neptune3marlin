import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import type {
  AttemptUpload,
  AttemptView,
  ClassView,
  CreateClassResponse,
  JoinResponse,
  LiveView,
  MistakeCount,
  ShopView,
  SyncResponse,
} from '../../src/net/protocol';
import { defaultClassSettings } from '../../src/net/protocol';
import { cleanup, IDLE_LIMIT } from '../src/api';
import { csvCell } from '../src/http';
import worker from '../src/index';

const ORIGIN = 'https://cyb3rw0lf-3d.github.io';
let ip = 0;

async function call(
  method: string,
  path: string,
  opts: { body?: unknown; token?: string; origin?: string; ip?: string; raw?: string } = {},
): Promise<Response> {
  const headers: Record<string, string> = { 'CF-Connecting-IP': opts.ip ?? `10.0.0.${ip}` };
  if (opts.origin !== undefined) headers.Origin = opts.origin;
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  let body: string | undefined = opts.raw;
  if (opts.body !== undefined) {
    body = JSON.stringify(opts.body);
    headers['Content-Type'] = 'application/json';
  }
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request(`https://api.test${path}`, { method, headers, body }), env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

async function ok<T>(res: Response, status = 200): Promise<T> {
  const text = await res.text();
  expect(res.status, text).toBe(status);
  return JSON.parse(text) as T;
}

async function newClass(name = 'Period 3 Auto'): Promise<CreateClassResponse> {
  return ok<CreateClassResponse>(await call('POST', '/classes', { body: { name } }), 201);
}

async function joinAs(code: string, nickname: string): Promise<JoinResponse> {
  return ok<JoinResponse>(await call('POST', '/join', { body: { code, nickname } }), 201);
}

let n = 0;
function attempt(over: Partial<AttemptUpload> = {}): AttemptUpload {
  n++;
  return {
    id: `attempt-${n}-${Math.random().toString(36).slice(2, 10)}`,
    lesson: 'oil-change',
    mode: 'test',
    vehicle: 'Aster S4',
    score: 92,
    passed: true,
    completed: true,
    critical: 0,
    hints: 0,
    seconds: 240,
    mistakes: [{ code: 'oil.plug.undertorque', label: 'Drain plug under-torqued', count: 1, critical: false }],
    at: Date.now(),
    ...over,
  };
}

beforeEach(() => {
  ip++;
});

describe('classes and joining', () => {
  it('creates a class with a readable code and a teacher key shown once', async () => {
    const c = await newClass();
    expect(c.code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(c.teacherKey.startsWith(`${c.classId}.`)).toBe(true);
    const stored = await env.DB.prepare('SELECT key_hash FROM classes WHERE id = ?')
      .bind(c.classId)
      .first<{ key_hash: string }>();
    expect(stored?.key_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored?.key_hash).not.toContain(c.teacherKey.split('.')[1]);
  });

  it('rejects bad class names', async () => {
    expect((await call('POST', '/classes', { body: { name: '' } })).status).toBe(400);
    expect((await call('POST', '/classes', { body: { name: '<script>' } })).status).toBe(400);
    expect((await call('POST', '/classes', { body: { name: 'x'.repeat(61) } })).status).toBe(400);
  });

  it('joins by code and nickname, and the same nickname rejoins as the same student', async () => {
    const c = await newClass();
    const a = await joinAs(c.code.toLowerCase(), 'Sam');
    const b = await joinAs(c.code, 'sam');
    expect(b.studentId).toBe(a.studentId);
    expect(b.token).not.toBe(a.token);
    expect(a.className).toBe('Period 3 Auto');
    expect((await call('POST', '/join', { body: { code: 'ZZZZZZ', nickname: 'Sam' } })).status).toBe(404);
    expect((await call('POST', '/join', { body: { code: c.code, nickname: '' } })).status).toBe(400);
  });

  it('roster classes need personal codes', async () => {
    const c = await newClass();
    const roster = await ok<{ students: { id: string; nickname: string; rosterCode: string }[] }>(
      await call('POST', '/roster', { token: c.teacherKey, body: { names: ['Ana', 'Ben'] } }),
      201,
    );
    expect(roster.students.map((s) => s.nickname)).toEqual(['Ana', 'Ben']);
    await ok(
      await call('PUT', '/settings', { token: c.teacherKey, body: { ...defaultClassSettings(), roster: true } }),
    );
    expect((await call('POST', '/join', { body: { code: c.code, nickname: 'Eve' } })).status).toBe(403);
    const ben = roster.students[1];
    const j = await ok<JoinResponse>(await call('POST', '/join', { body: { rosterCode: ben?.rosterCode } }), 201);
    expect(j.nickname).toBe('Ben');
    expect(j.studentId).toBe(ben?.id);
    expect(j.settings.roster).toBe(true);
  });

  it('rate-limits class creation per address', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++)
      statuses.push((await call('POST', '/classes', { body: { name: 'Spam' }, ip: '9.9.9.9' })).status);
    expect(statuses.slice(0, 5)).toEqual([201, 201, 201, 201, 201]);
    expect(statuses.slice(5)).toEqual([429, 429]);
  });
});

describe('syncing from the game', () => {
  it('stores attempts once, even when the same upload is sent twice', async () => {
    const c = await newClass();
    const s = await joinAs(c.code, 'Sam');
    const a = attempt();
    const first = await ok<SyncResponse>(await call('POST', '/sync', { token: s.token, body: { attempts: [a] } }));
    expect(first.accepted).toBe(1);
    expect(first.settings.open['oil-change']).toBe(true);
    await ok(await call('POST', '/sync', { token: s.token, body: { attempts: [a] } }));
    const list = await ok<AttemptView[]>(await call('GET', '/attempts', { token: c.teacherKey }));
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ nickname: 'Sam', lesson: 'oil-change', score: 92, passed: true });
  });

  it('rejects malformed, oversized and unauthenticated uploads', async () => {
    const c = await newClass();
    const s = await joinAs(c.code, 'Sam');
    expect((await call('POST', '/sync', { body: { attempts: [] } })).status).toBe(401);
    expect(
      (await call('POST', '/sync', { token: `${s.studentId}.deadbeefdeadbeefdeadbeef`, body: { attempts: [] } }))
        .status,
    ).toBe(401);
    expect(
      (await call('POST', '/sync', { token: s.token, body: { attempts: [attempt({ score: 101 })] } })).status,
    ).toBe(400);
    expect(
      (await call('POST', '/sync', { token: s.token, body: { attempts: [attempt({ lesson: 'welding' as never })] } }))
        .status,
    ).toBe(400);
    expect((await call('POST', '/sync', { token: s.token, raw: '{not json' })).status).toBe(400);
    const big = { attempts: [], pad: 'x'.repeat(70_000) };
    expect((await call('POST', '/sync', { token: s.token, body: big })).status).toBe(413);
    const many = { attempts: Array.from({ length: 51 }, () => attempt()) };
    expect((await call('POST', '/sync', { token: s.token, body: many })).status).toBe(400);
  });

  it('records shop stats and heartbeats for the live view', async () => {
    const c = await newClass();
    const s = await joinAs(c.code, 'Sam');
    const shop = { money: 812.5, rep: 34, shifts: 3, jobs: 11, comebacks: 1, safetyStops: 0, upgrades: 2 };
    await ok(
      await call('POST', '/sync', {
        token: s.token,
        body: { attempts: [], shop, heartbeat: { lesson: 'brakes', mode: 'practice', step: 'caliper-hang' } },
      }),
    );
    const live = await ok<LiveView[]>(await call('GET', '/live', { token: c.teacherKey }));
    expect(live).toEqual([expect.objectContaining({ nickname: 'Sam', lesson: 'brakes', step: 'caliper-hang' })]);
    const stats = await ok<ShopView[]>(await call('GET', '/shop', { token: c.teacherKey }));
    expect(stats[0]).toMatchObject({ nickname: 'Sam', money: 812.5, rep: 34, comebacks: 1 });
  });
});

describe('teacher views', () => {
  async function classWithResults() {
    const c = await newClass();
    const sam = await joinAs(c.code, 'Sam');
    const ana = await joinAs(c.code, 'Ana');
    await ok(
      await call('POST', '/sync', {
        token: sam.token,
        body: {
          attempts: [
            attempt({ mode: 'learn', score: 100 }),
            attempt({ score: 70, passed: false }),
            attempt({ score: 95, at: Date.now() - 1000 }),
          ],
        },
      }),
    );
    await ok(
      await call('POST', '/sync', {
        token: ana.token,
        body: {
          attempts: [
            attempt({
              lesson: 'brakes',
              score: 60,
              passed: false,
              critical: 1,
              mistakes: [
                { code: 'brakes.jack.no_stands', label: 'Worked under a car on a jack', count: 1, critical: true },
              ],
            }),
          ],
        },
      }),
    );
    return { c, sam, ana };
  }

  it('builds the class grid with best scores per lesson and mode', async () => {
    const { c, sam } = await classWithResults();
    const view = await ok<ClassView>(await call('GET', '/class', { token: c.teacherKey }));
    expect(view.students.map((s) => s.nickname)).toEqual(['Ana', 'Sam']);
    const test = view.cells.find(
      (x) => x.studentId === sam.studentId && x.lesson === 'oil-change' && x.mode === 'test',
    );
    expect(test).toMatchObject({ attempts: 2, best: 95, passed: true });
    expect(view.cells.some((x) => x.studentId === sam.studentId && x.mode === 'learn')).toBe(true);
  });

  it('counts common mistakes across students', async () => {
    const { c } = await classWithResults();
    const list = await ok<MistakeCount[]>(await call('GET', '/mistakes', { token: c.teacherKey }));
    expect(list[0]).toMatchObject({ code: 'oil.plug.undertorque', count: 3, students: 1 });
    expect(list.find((m) => m.code === 'brakes.jack.no_stands')).toMatchObject({ critical: true, count: 1 });
  });

  it('lists one certificate per passed lesson', async () => {
    const { c } = await classWithResults();
    const certs = await ok<AttemptView[]>(await call('GET', '/certificates', { token: c.teacherKey }));
    expect(certs).toHaveLength(1);
    expect(certs[0]).toMatchObject({ nickname: 'Sam', lesson: 'oil-change', score: 95 });
  });

  it('exports CSVs a spreadsheet can open safely', async () => {
    const { c } = await classWithResults();
    const res = await call('GET', '/export/attempts.csv', { token: c.teacherKey });
    expect(res.headers.get('Content-Type')).toContain('text/csv');
    const text = await res.text();
    expect(text.split('\r\n')[0]).toBe(
      'student,lesson,mode,vehicle,score,passed,completed,safety errors,hints,seconds,mistakes,date (UTC)',
    );
    expect(text.split('\r\n').filter(Boolean)).toHaveLength(5);
    const grades = await (await call('GET', '/export/grades.csv', { token: c.teacherKey })).text();
    expect(grades).toContain('Sam,95,,,,,,,,1');
    expect(grades).toContain('Ana,,,60,,,,,,0');
    expect((await call('GET', '/export/shop.csv', { token: c.teacherKey })).status).toBe(200);
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('-1+2')).toBe(`'-1+2`);
    expect(csvCell(-12)).toBe('-12');
  });

  it('keeps classes apart: another teacher key sees nothing', async () => {
    const { sam } = await classWithResults();
    const other = await newClass('Other class');
    expect(await ok<AttemptView[]>(await call('GET', '/attempts', { token: other.teacherKey }))).toEqual([]);
    expect((await call('DELETE', `/students/${sam.studentId}/results`, { token: other.teacherKey })).status).toBe(404);
    expect((await call('GET', '/class')).status).toBe(401);
    expect((await call('GET', '/class', { token: `${other.classId}.0000000000000000000000000000000` })).status).toBe(
      401,
    );
  });

  it('saves settings that the game receives on its next sync', async () => {
    const { c, sam } = await classWithResults();
    const settings = { ...defaultClassSettings(), learnFirst: true, shop: 'off', signIn: 'session' };
    settings.open.brakes = false;
    await ok(await call('PUT', '/settings', { token: c.teacherKey, body: settings }));
    const res = await ok<SyncResponse>(await call('POST', '/sync', { token: sam.token, body: { attempts: [] } }));
    expect(res.settings).toMatchObject({ learnFirst: true, shop: 'off', signIn: 'session' });
    expect(res.settings.open.brakes).toBe(false);
    expect((await call('PUT', '/settings', { token: c.teacherKey, body: { ...settings, shop: 'maybe' } })).status).toBe(
      400,
    );
  });

  it('resets one student, removes a student, and deletes a class with everything in it', async () => {
    const { c, sam, ana } = await classWithResults();
    await ok(await call('DELETE', `/students/${sam.studentId}/results`, { token: c.teacherKey }));
    const left = await ok<AttemptView[]>(await call('GET', '/attempts', { token: c.teacherKey }));
    expect(left.map((a) => a.nickname)).toEqual(['Ana']);
    await ok(await call('DELETE', `/students/${ana.studentId}`, { token: c.teacherKey }));
    expect((await call('POST', '/sync', { token: ana.token, body: { attempts: [] } })).status).toBe(401);
    await ok(await call('DELETE', '/class', { token: c.teacherKey }));
    expect((await call('GET', '/class', { token: c.teacherKey })).status).toBe(401);
    expect((await call('POST', '/sync', { token: sam.token, body: { attempts: [] } })).status).toBe(401);
    const counts = await env.DB.prepare(
      'SELECT (SELECT COUNT(*) FROM students WHERE class_id = ?) AS s, (SELECT COUNT(*) FROM tokens) AS t',
    )
      .bind(c.classId)
      .first<{ s: number }>();
    expect(counts?.s).toBe(0);
  });
});

describe('CORS', () => {
  it('allows the game site and refuses other origins', async () => {
    const pre = await call('OPTIONS', '/sync', { origin: ORIGIN });
    expect(pre.status).toBe(204);
    expect(pre.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(pre.headers.get('Access-Control-Allow-Headers')).toContain('Authorization');
    const bad = await call('GET', '/health', { origin: 'https://evil.example' });
    expect(bad.headers.get('Access-Control-Allow-Origin')).toBeNull();
    const good = await call('GET', '/health', { origin: ORIGIN });
    expect(good.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
  });
});

describe('cleanup', () => {
  it('deletes classes idle for a year, and keeps active ones', async () => {
    const old = await newClass('Old class');
    const fresh = await newClass('Fresh class');
    const s = await joinAs(old.code, 'Sam');
    await ok(await call('POST', '/sync', { token: s.token, body: { attempts: [attempt()] } }));
    await env.DB.prepare('UPDATE classes SET active_at = ? WHERE id = ?')
      .bind(Date.now() - IDLE_LIMIT - 1000, old.classId)
      .run();
    const out = await cleanup(env, Date.now());
    expect(out.classes).toBeGreaterThanOrEqual(1);
    expect((await call('GET', '/class', { token: old.teacherKey })).status).toBe(401);
    expect((await call('GET', '/class', { token: fresh.teacherKey })).status).toBe(200);
    const left = await env.DB.prepare('SELECT COUNT(*) AS n FROM attempts WHERE student_id = ?')
      .bind(s.studentId)
      .first<{ n: number }>();
    expect(left?.n).toBe(0);
  });
});
