import {
  type AttemptView,
  type CellView,
  type ClassSettings,
  type ClassView,
  type CreateClassResponse,
  cleanName,
  defaultClassSettings,
  type JoinResponse,
  LIMITS,
  type LiveView,
  type MistakeCount,
  type MistakeUpload,
  normalizeCode,
  parseSettings,
  parseSync,
  type ShopView,
  type SyncResponse,
} from '../../src/net/protocol';
import { randomCode, randomSecret, sameDigest, sha256 } from './crypto';
import { allowedOrigin, corsHeaders, csv, csvTable, HttpError, json, readJson } from './http';

const DAY = 24 * 60 * 60 * 1000;
/** Classes with no activity for this long are deleted by the daily cleanup. */
export const IDLE_LIMIT = 365 * DAY;
/** A student counts as "playing now" if they sent a heartbeat this recently. */
export const LIVE_WINDOW = 2 * 60 * 1000;

interface ClassRow {
  id: string;
  name: string;
  code: string;
  key_hash: string;
  settings: string;
}

interface StudentRow {
  id: string;
  class_id: string;
  nickname: string;
}

/** Handles one request: CORS, routing and error responses. */
export async function handleFetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const origin = allowedOrigin(request, env.ALLOWED_ORIGINS);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
  let res: Response;
  try {
    res = await route(request, env, ctx);
  } catch (err) {
    if (err instanceof HttpError) {
      res = json({ error: err.message }, err.status);
    } else {
      console.error(JSON.stringify({ msg: 'unhandled error', path: new URL(request.url).pathname, err: String(err) }));
      res = json({ error: 'server error' }, 500);
    }
  }
  for (const [k, v] of Object.entries(corsHeaders(origin))) res.headers.set(k, v);
  return res;
}

/** Deletes idle classes (and everything in them), stale heartbeats and old rate-limit counters. */
export async function cleanup(env: Env, now: number): Promise<{ classes: number }> {
  const idle = await env.DB.prepare('SELECT id FROM classes WHERE active_at < ?')
    .bind(now - IDLE_LIMIT)
    .all<{ id: string }>();
  for (const { id } of idle.results) await deleteClass(env, id);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM heartbeats WHERE at < ?').bind(now - DAY),
    env.DB.prepare('DELETE FROM rate_limits WHERE window < ?').bind(Math.floor((now - DAY) / 1000)),
  ]);
  console.log(JSON.stringify({ msg: 'cleanup', classesDeleted: idle.results.length }));
  return { classes: idle.results.length };
}

async function route(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const m = request.method;

  if (m === 'GET' && path === '/health') return json({ ok: true });
  if (m === 'POST' && path === '/classes') return createClass(request, env);
  if (m === 'POST' && path === '/join') return join(request, env);
  if (m === 'POST' && path === '/sync') return sync(request, env);

  // Everything below is for the teacher.
  const cls = await teacher(request, env);
  if (m === 'GET' && path === '/class') return json(await classView(env, cls));
  if (m === 'GET' && path === '/attempts') return json(await attempts(env, cls.id, url.searchParams.get('student')));
  if (m === 'GET' && path === '/mistakes') return json(await mistakes(env, cls.id));
  if (m === 'GET' && path === '/live') return json(await live(env, cls.id));
  if (m === 'GET' && path === '/shop') return json(await shopStats(env, cls.id));
  if (m === 'GET' && path === '/certificates') return json(await certificates(env, cls.id));
  if (m === 'PUT' && path === '/settings') return updateSettings(request, env, cls);
  if (m === 'PUT' && path === '/name') return rename(request, env, cls);
  if (m === 'POST' && path === '/roster') return addRoster(request, env, cls);
  const studentPath = path.match(/^\/students\/([A-Za-z0-9-]{8,64})(\/results)?$/);
  if (m === 'DELETE' && studentPath) {
    const id = studentPath[1] as string;
    await ownStudent(env, cls.id, id);
    if (studentPath[2]) await resetStudent(env, id);
    else await removeStudent(env, id);
    return json({ ok: true });
  }
  if (m === 'DELETE' && path === '/class') {
    await deleteClass(env, cls.id);
    return json({ ok: true });
  }
  if (m === 'GET' && path === '/export/attempts.csv') return exportAttempts(env, cls);
  if (m === 'GET' && path === '/export/grades.csv') return exportGrades(env, cls);
  if (m === 'GET' && path === '/export/shop.csv') return exportShop(env, cls);
  throw new HttpError(404, 'not found');
}

// --- rate limiting ---

/** Fixed-window counter per client IP. Throws 429 once `limit` is passed in the window. */
async function rateLimit(request: Request, env: Env, bucket: string, limit: number, windowSec: number): Promise<void> {
  const ip = request.headers.get('CF-Connecting-IP') ?? 'local';
  const key = `${bucket}:${await sha256(ip)}`;
  const window = Math.floor(Date.now() / 1000 / windowSec) * windowSec;
  const row = await env.DB.prepare(
    'INSERT INTO rate_limits (key, window, count) VALUES (?, ?, 1) ON CONFLICT(key, window) DO UPDATE SET count = count + 1 RETURNING count',
  )
    .bind(key, window)
    .first<{ count: number }>();
  const scale = Math.max(1, Number(env.RATE_LIMIT_SCALE) || 1);
  if ((row?.count ?? 0) > limit * scale) throw new HttpError(429, 'too many requests, try again later');
}

// --- auth ---

function bearer(request: Request): string | null {
  const h = request.headers.get('Authorization') ?? '';
  const m = h.match(/^Bearer ([A-Za-z0-9.-]{20,200})$/);
  return m ? (m[1] as string) : null;
}

/** Teacher keys look like `<classId>.<secret>`; only the secret's hash is stored. */
async function teacher(request: Request, env: Env): Promise<ClassRow> {
  const key = bearer(request);
  const [id, secret] = key?.split('.') ?? [];
  if (!id || !secret) throw new HttpError(401, 'teacher key required');
  const row = await env.DB.prepare('SELECT * FROM classes WHERE id = ?').bind(id).first<ClassRow>();
  const hash = await sha256(secret);
  if (!row || !sameDigest(hash, row.key_hash)) throw new HttpError(401, 'unknown teacher key');
  await env.DB.prepare('UPDATE classes SET active_at = ? WHERE id = ?').bind(Date.now(), id).run();
  return row;
}

async function student(request: Request, env: Env): Promise<{ student: StudentRow; cls: ClassRow }> {
  const token = bearer(request);
  if (!token) throw new HttpError(401, 'student token required');
  const row = await env.DB.prepare(
    `SELECT s.id AS sid, s.class_id, s.nickname, c.* FROM tokens t
     JOIN students s ON s.id = t.student_id JOIN classes c ON c.id = s.class_id WHERE t.hash = ?`,
  )
    .bind(await sha256(token))
    .first<ClassRow & { sid: string; class_id: string; nickname: string }>();
  if (!row) throw new HttpError(401, 'unknown student token');
  return { student: { id: row.sid, class_id: row.class_id, nickname: row.nickname }, cls: row };
}

async function ownStudent(env: Env, classId: string, studentId: string): Promise<void> {
  const row = await env.DB.prepare('SELECT id FROM students WHERE id = ? AND class_id = ?')
    .bind(studentId, classId)
    .first();
  if (!row) throw new HttpError(404, 'no such student in this class');
}

const settingsOf = (row: ClassRow): ClassSettings => parseSettings(JSON.parse(row.settings)) ?? defaultClassSettings();

// --- classes and joining ---

async function uniqueCode(env: Env, sql: string, length: number): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const code = randomCode(length);
    if (!(await env.DB.prepare(sql).bind(code).first())) return code;
  }
  throw new HttpError(503, 'could not make a unique code, try again');
}

async function createClass(request: Request, env: Env): Promise<Response> {
  await rateLimit(request, env, 'create', 5, 3600);
  const body = (await readJson(request, 4096)) as { name?: unknown };
  const name = cleanName(body?.name, LIMITS.className);
  if (!name) throw new HttpError(400, 'class name: 1 to 60 letters, numbers and spaces');
  const id = crypto.randomUUID();
  const secret = randomSecret();
  const code = await uniqueCode(env, 'SELECT 1 FROM classes WHERE code = ?', 6);
  const now = Date.now();
  await env.DB.prepare(
    'INSERT INTO classes (id, name, code, key_hash, settings, created_at, active_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(id, name, code, await sha256(secret), JSON.stringify(defaultClassSettings()), now, now)
    .run();
  const out: CreateClassResponse = { classId: id, name, code, teacherKey: `${id}.${secret}` };
  return json(out, 201);
}

async function issueToken(env: Env, studentId: string): Promise<string> {
  const token = `${studentId}.${randomSecret()}`;
  await env.DB.prepare('INSERT INTO tokens (hash, student_id, created_at) VALUES (?, ?, ?)')
    .bind(await sha256(token), studentId, Date.now())
    .run();
  return token;
}

async function join(request: Request, env: Env): Promise<Response> {
  await rateLimit(request, env, 'join', 30, 600);
  const body = (await readJson(request, 4096)) as Record<string, unknown>;
  const now = Date.now();
  let studentRow: StudentRow | null = null;
  let cls: ClassRow | null = null;

  if (body?.rosterCode !== undefined) {
    const rc = normalizeCode(body.rosterCode);
    if (!rc) throw new HttpError(400, 'that roster code does not look right');
    const row = await env.DB.prepare(
      'SELECT s.id AS sid, s.class_id, s.nickname, c.* FROM students s JOIN classes c ON c.id = s.class_id WHERE s.roster_code = ?',
    )
      .bind(rc)
      .first<ClassRow & { sid: string; class_id: string; nickname: string }>();
    if (!row) throw new HttpError(404, 'no student with that roster code');
    studentRow = { id: row.sid, class_id: row.class_id, nickname: row.nickname };
    cls = row;
  } else {
    const code = normalizeCode(body?.code);
    const nickname = cleanName(body?.nickname, LIMITS.nickname);
    if (!code) throw new HttpError(400, 'that class code does not look right');
    if (!nickname) throw new HttpError(400, 'nickname: 1 to 24 letters, numbers and spaces');
    cls = await env.DB.prepare('SELECT * FROM classes WHERE code = ?').bind(code).first<ClassRow>();
    if (!cls) throw new HttpError(404, 'no class with that code');
    if (settingsOf(cls).roster) throw new HttpError(403, 'this class uses roster codes: ask your teacher for yours');
    studentRow = await env.DB.prepare(
      'SELECT id, class_id, nickname FROM students WHERE class_id = ? AND nickname = ? COLLATE NOCASE',
    )
      .bind(cls.id, nickname)
      .first<StudentRow>();
    if (!studentRow) {
      const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM students WHERE class_id = ?')
        .bind(cls.id)
        .first<{ n: number }>();
      if ((count?.n ?? 0) >= 200) throw new HttpError(403, 'this class is full');
      studentRow = { id: crypto.randomUUID(), class_id: cls.id, nickname };
      await env.DB.prepare(
        'INSERT INTO students (id, class_id, nickname, created_at, active_at) VALUES (?, ?, ?, ?, ?)',
      )
        .bind(studentRow.id, cls.id, nickname, now, now)
        .run();
    }
  }
  const token = await issueToken(env, studentRow.id);
  await env.DB.prepare('UPDATE classes SET active_at = ? WHERE id = ?').bind(now, cls.id).run();
  const out: JoinResponse = {
    token,
    studentId: studentRow.id,
    nickname: studentRow.nickname,
    className: cls.name,
    settings: settingsOf(cls),
  };
  return json(out, 201);
}

// --- syncing results from the game ---

async function sync(request: Request, env: Env): Promise<Response> {
  const { student: s, cls } = await student(request, env);
  const parsed = parseSync(await readJson(request, LIMITS.bodyBytes));
  if (typeof parsed === 'string') throw new HttpError(400, parsed);
  const now = Date.now();
  const stmts: D1PreparedStatement[] = parsed.attempts.map((a) =>
    env.DB.prepare(
      `INSERT INTO attempts (id, student_id, lesson, mode, vehicle, score, passed, completed, critical, hints, seconds, mistakes, at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING`,
    ).bind(
      a.id,
      s.id,
      a.lesson,
      a.mode,
      a.vehicle,
      a.score,
      a.passed ? 1 : 0,
      a.completed ? 1 : 0,
      a.critical,
      a.hints,
      a.seconds,
      JSON.stringify(a.mistakes),
      a.at,
    ),
  );
  if (parsed.shop) {
    const sh = parsed.shop;
    stmts.push(
      env.DB.prepare(
        `INSERT INTO shop (student_id, money, rep, shifts, jobs, comebacks, safety_stops, upgrades, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(student_id) DO UPDATE SET money = excluded.money, rep = excluded.rep,
         shifts = excluded.shifts, jobs = excluded.jobs, comebacks = excluded.comebacks, safety_stops = excluded.safety_stops,
         upgrades = excluded.upgrades, updated_at = excluded.updated_at`,
      ).bind(s.id, sh.money, sh.rep, sh.shifts, sh.jobs, sh.comebacks, sh.safetyStops, sh.upgrades, now),
    );
  }
  if (parsed.heartbeat) {
    const h = parsed.heartbeat;
    stmts.push(
      env.DB.prepare(
        `INSERT INTO heartbeats (student_id, lesson, mode, step, at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(student_id) DO UPDATE SET lesson = excluded.lesson, mode = excluded.mode, step = excluded.step, at = excluded.at`,
      ).bind(s.id, h.lesson, h.mode, h.step, now),
    );
  }
  stmts.push(env.DB.prepare('UPDATE students SET active_at = ? WHERE id = ?').bind(now, s.id));
  stmts.push(env.DB.prepare('UPDATE classes SET active_at = ? WHERE id = ?').bind(now, cls.id));
  await env.DB.batch(stmts);
  const out: SyncResponse = {
    className: cls.name,
    nickname: s.nickname,
    settings: settingsOf(cls),
    accepted: parsed.attempts.length,
  };
  return json(out);
}

// --- teacher views ---

async function students(env: Env, classId: string) {
  const rows = await env.DB.prepare(
    'SELECT id, nickname, roster_code, active_at FROM students WHERE class_id = ? ORDER BY nickname COLLATE NOCASE',
  )
    .bind(classId)
    .all<{ id: string; nickname: string; roster_code: string | null; active_at: number }>();
  return rows.results.map((r) => ({
    id: r.id,
    nickname: r.nickname,
    rosterCode: r.roster_code,
    activeAt: r.active_at,
  }));
}

async function classView(env: Env, cls: ClassRow): Promise<ClassView> {
  const cells = await env.DB.prepare(
    `SELECT a.student_id, a.lesson, a.mode, COUNT(*) AS attempts, MAX(a.score) AS best, MAX(a.passed) AS passed
     FROM attempts a JOIN students s ON s.id = a.student_id WHERE s.class_id = ? AND a.completed = 1
     GROUP BY a.student_id, a.lesson, a.mode`,
  )
    .bind(cls.id)
    .all<{ student_id: string; lesson: string; mode: string; attempts: number; best: number; passed: number }>();
  return {
    id: cls.id,
    name: cls.name,
    code: cls.code,
    settings: settingsOf(cls),
    students: await students(env, cls.id),
    cells: cells.results.map(
      (c) =>
        ({
          studentId: c.student_id,
          lesson: c.lesson,
          mode: c.mode,
          attempts: c.attempts,
          best: c.best,
          passed: c.passed === 1,
        }) as CellView,
    ),
  };
}

interface AttemptRow {
  id: string;
  student_id: string;
  nickname: string;
  lesson: string;
  mode: string;
  vehicle: string;
  score: number;
  passed: number;
  completed: number;
  critical: number;
  hints: number;
  seconds: number;
  mistakes: string;
  at: number;
}

const attemptView = (r: AttemptRow): AttemptView =>
  ({
    id: r.id,
    studentId: r.student_id,
    nickname: r.nickname,
    lesson: r.lesson,
    mode: r.mode,
    vehicle: r.vehicle,
    score: r.score,
    passed: r.passed === 1,
    completed: r.completed === 1,
    critical: r.critical,
    hints: r.hints,
    seconds: r.seconds,
    mistakes: JSON.parse(r.mistakes) as MistakeUpload[],
    at: r.at,
  }) as AttemptView;

async function attemptRows(env: Env, classId: string, studentId: string | null): Promise<AttemptRow[]> {
  const where = studentId ? 'AND a.student_id = ?' : '';
  const stmt = env.DB.prepare(
    `SELECT a.*, s.nickname FROM attempts a JOIN students s ON s.id = a.student_id
     WHERE s.class_id = ? ${where} ORDER BY a.at DESC LIMIT 5000`,
  );
  const rows = await (studentId ? stmt.bind(classId, studentId) : stmt.bind(classId)).all<AttemptRow>();
  return rows.results;
}

async function attempts(env: Env, classId: string, studentId: string | null): Promise<AttemptView[]> {
  return (await attemptRows(env, classId, studentId)).map(attemptView);
}

async function mistakes(env: Env, classId: string): Promise<MistakeCount[]> {
  const counts = new Map<string, MistakeCount & { who: Set<string> }>();
  for (const a of await attemptRows(env, classId, null)) {
    for (const m of JSON.parse(a.mistakes) as MistakeUpload[]) {
      const c = counts.get(m.code) ?? { ...m, count: 0, students: 0, who: new Set<string>() };
      c.count += m.count;
      c.who.add(a.student_id);
      counts.set(m.code, c);
    }
  }
  return [...counts.values()]
    .map(({ who, ...c }) => ({ ...c, students: who.size }))
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code))
    .slice(0, 50);
}

async function live(env: Env, classId: string): Promise<LiveView[]> {
  const rows = await env.DB.prepare(
    `SELECT h.*, s.nickname FROM heartbeats h JOIN students s ON s.id = h.student_id
     WHERE s.class_id = ? AND h.at > ? ORDER BY s.nickname COLLATE NOCASE`,
  )
    .bind(classId, Date.now() - LIVE_WINDOW)
    .all<{
      student_id: string;
      nickname: string;
      lesson: string | null;
      mode: string | null;
      step: string | null;
      at: number;
    }>();
  return rows.results.map((r) => ({
    studentId: r.student_id,
    nickname: r.nickname,
    lesson: r.lesson,
    mode: r.mode,
    step: r.step,
    at: r.at,
  }));
}

async function shopStats(env: Env, classId: string): Promise<ShopView[]> {
  const rows = await env.DB.prepare(
    `SELECT sh.*, s.nickname FROM shop sh JOIN students s ON s.id = sh.student_id
     WHERE s.class_id = ? ORDER BY s.nickname COLLATE NOCASE`,
  )
    .bind(classId)
    .all<{
      student_id: string;
      nickname: string;
      money: number;
      rep: number;
      shifts: number;
      jobs: number;
      comebacks: number;
      safety_stops: number;
      upgrades: number;
      updated_at: number;
    }>();
  return rows.results.map((r) => ({
    studentId: r.student_id,
    nickname: r.nickname,
    money: r.money,
    rep: r.rep,
    shifts: r.shifts,
    jobs: r.jobs,
    comebacks: r.comebacks,
    safetyStops: r.safety_stops,
    upgrades: r.upgrades,
    updatedAt: r.updated_at,
  }));
}

/** The first passing Test per student and lesson: what the certificate shows. */
async function certificates(env: Env, classId: string): Promise<AttemptView[]> {
  const seen = new Set<string>();
  const out: AttemptView[] = [];
  const rows = (await attemptRows(env, classId, null)).filter((r) => r.mode === 'test' && r.passed === 1);
  rows.sort((a, b) => a.at - b.at);
  for (const r of rows) {
    const key = `${r.student_id}|${r.lesson}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(attemptView(r));
  }
  return out;
}

// --- teacher changes ---

async function updateSettings(request: Request, env: Env, cls: ClassRow): Promise<Response> {
  const settings = parseSettings(await readJson(request, 4096));
  if (!settings) throw new HttpError(400, 'invalid settings');
  await env.DB.prepare('UPDATE classes SET settings = ? WHERE id = ?').bind(JSON.stringify(settings), cls.id).run();
  return json(settings);
}

async function rename(request: Request, env: Env, cls: ClassRow): Promise<Response> {
  const body = (await readJson(request, 4096)) as { name?: unknown };
  const name = cleanName(body?.name, LIMITS.className);
  if (!name) throw new HttpError(400, 'class name: 1 to 60 letters, numbers and spaces');
  await env.DB.prepare('UPDATE classes SET name = ? WHERE id = ?').bind(name, cls.id).run();
  return json({ name });
}

async function addRoster(request: Request, env: Env, cls: ClassRow): Promise<Response> {
  const body = (await readJson(request, 16384)) as { names?: unknown };
  if (!Array.isArray(body?.names) || body.names.length < 1 || body.names.length > LIMITS.rosterSize)
    throw new HttpError(400, `send 1 to ${LIMITS.rosterSize} names`);
  const names: string[] = [];
  for (const raw of body.names) {
    const n = cleanName(raw, LIMITS.nickname);
    if (!n) throw new HttpError(400, `invalid name: ${String(raw).slice(0, 30)}`);
    names.push(n);
  }
  const now = Date.now();
  const added: { id: string; nickname: string; rosterCode: string }[] = [];
  for (const nickname of names) {
    const existing = await env.DB.prepare(
      'SELECT id, roster_code FROM students WHERE class_id = ? AND nickname = ? COLLATE NOCASE',
    )
      .bind(cls.id, nickname)
      .first<{ id: string; roster_code: string | null }>();
    const rosterCode =
      existing?.roster_code ?? (await uniqueCode(env, 'SELECT 1 FROM students WHERE roster_code = ?', 8));
    if (existing) {
      if (!existing.roster_code)
        await env.DB.prepare('UPDATE students SET roster_code = ? WHERE id = ?').bind(rosterCode, existing.id).run();
      added.push({ id: existing.id, nickname, rosterCode });
    } else {
      const id = crypto.randomUUID();
      await env.DB.prepare(
        'INSERT INTO students (id, class_id, nickname, roster_code, created_at, active_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
        .bind(id, cls.id, nickname, rosterCode, now, now)
        .run();
      added.push({ id, nickname, rosterCode });
    }
  }
  return json({ students: added }, 201);
}

async function resetStudent(env: Env, studentId: string): Promise<void> {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM attempts WHERE student_id = ?').bind(studentId),
    env.DB.prepare('DELETE FROM shop WHERE student_id = ?').bind(studentId),
    env.DB.prepare('DELETE FROM heartbeats WHERE student_id = ?').bind(studentId),
  ]);
}

async function removeStudent(env: Env, studentId: string): Promise<void> {
  await resetStudent(env, studentId);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM tokens WHERE student_id = ?').bind(studentId),
    env.DB.prepare('DELETE FROM students WHERE id = ?').bind(studentId),
  ]);
}

async function deleteClass(env: Env, classId: string): Promise<void> {
  const sub = 'SELECT id FROM students WHERE class_id = ?';
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM attempts WHERE student_id IN (${sub})`).bind(classId),
    env.DB.prepare(`DELETE FROM shop WHERE student_id IN (${sub})`).bind(classId),
    env.DB.prepare(`DELETE FROM heartbeats WHERE student_id IN (${sub})`).bind(classId),
    env.DB.prepare(`DELETE FROM tokens WHERE student_id IN (${sub})`).bind(classId),
    env.DB.prepare('DELETE FROM students WHERE class_id = ?').bind(classId),
    env.DB.prepare('DELETE FROM classes WHERE id = ?').bind(classId),
  ]);
}

// --- exports ---

const iso = (ms: number) => new Date(ms).toISOString().replace('T', ' ').slice(0, 16);
const slug = (s: string) =>
  s
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() || 'class';

async function exportAttempts(env: Env, cls: ClassRow): Promise<Response> {
  const rows = (await attemptRows(env, cls.id, null)).map((a) => [
    a.nickname,
    a.lesson,
    a.mode,
    a.vehicle,
    a.score,
    a.passed ? 'yes' : 'no',
    a.completed ? 'yes' : 'no',
    a.critical,
    a.hints,
    a.seconds,
    (JSON.parse(a.mistakes) as MistakeUpload[]).map((m) => `${m.code}${m.count > 1 ? ` x${m.count}` : ''}`).join('; '),
    iso(a.at),
  ]);
  return csv(
    csvTable(
      [
        'student',
        'lesson',
        'mode',
        'vehicle',
        'score',
        'passed',
        'completed',
        'safety errors',
        'hints',
        'seconds',
        'mistakes',
        'date (UTC)',
      ],
      rows,
    ),
    `${slug(cls.name)}-attempts.csv`,
  );
}

async function exportGrades(env: Env, cls: ClassRow): Promise<Response> {
  const view = await classView(env, cls);
  const lessons = Object.keys(view.settings.open);
  const rows = view.students.map((s) => {
    const cells = lessons.map((l) => {
      const c = view.cells.find((x) => x.studentId === s.id && x.lesson === l && x.mode === 'test');
      return c ? c.best : '';
    });
    const passed = view.cells.filter((x) => x.studentId === s.id && x.mode === 'test' && x.passed).length;
    return [s.nickname, ...cells, passed];
  });
  return csv(
    csvTable(['student', ...lessons.map((l) => `${l} test best`), 'certificates'], rows),
    `${slug(cls.name)}-grades.csv`,
  );
}

async function exportShop(env: Env, cls: ClassRow): Promise<Response> {
  const rows = (await shopStats(env, cls.id)).map((s) => [
    s.nickname,
    s.shifts,
    s.jobs,
    s.money.toFixed(2),
    s.rep,
    s.comebacks,
    s.safetyStops,
    s.upgrades,
    iso(s.updatedAt),
  ]);
  return csv(
    csvTable(
      ['student', 'shifts', 'jobs', 'money', 'reputation', 'comebacks', 'safety stops', 'upgrades', 'updated (UTC)'],
      rows,
    ),
    `${slug(cls.name)}-shop.csv`,
  );
}
