import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/atkinson-hyperlegible/700.css';
import './style.css';
import type { Profile } from '../src/core/save';
import { API_URL } from '../src/net/class-client';
import {
  type AttemptView,
  type ClassSettings,
  type ClassView,
  type CreateClassResponse,
  LESSON_KEYS,
  LESSON_TITLES,
  type LessonKey,
  type LiveView,
  type MistakeCount,
  MODES,
  type ModeKey,
  type ShopView,
} from '../src/net/protocol';
import { certificatePng, slug } from '../src/ui/records';
import { zip } from './zip';

// --- tiny DOM helper ---

type Child = Node | string | null | undefined | false;
function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | boolean | ((e: Event) => void)> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, '');
    else if (v !== false) el.setAttribute(k, v);
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

const main = document.getElementById('main') as HTMLElement;
const chip = document.getElementById('class-chip') as HTMLElement;
const titleEl = document.getElementById('title') as HTMLElement;

// --- remembered classes (this browser only) ---

interface Remembered {
  key: string;
  name: string;
  code: string;
}
const STORE = 'service-bay-vr/dashboard';
function remembered(): Remembered[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE) ?? '[]') as Remembered[];
    return Array.isArray(raw) ? raw.filter((r) => typeof r.key === 'string') : [];
  } catch {
    return [];
  }
}
function remember(r: Remembered): void {
  try {
    const list = remembered().filter((x) => x.key !== r.key);
    localStorage.setItem(STORE, JSON.stringify([r, ...list].slice(0, 20)));
  } catch {
    // Private windows: the link still works, it just is not remembered.
  }
}
function forget(key: string): void {
  try {
    localStorage.setItem(STORE, JSON.stringify(remembered().filter((x) => x.key !== key)));
  } catch {
    // ignore
  }
}

// --- API ---

class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function api<T>(method: string, path: string, key: string | null, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (key) headers.Authorization = `Bearer ${key}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(res.status, data.error ?? `Error ${res.status}`);
  }
  return (path.endsWith('.csv') ? res.text() : res.json()) as Promise<T>;
}

function teacherLink(key: string): string {
  return `${location.origin}${location.pathname}#k=${key}`;
}

function keyFromHash(): string | null {
  const m = location.hash.match(/^#k=([A-Za-z0-9.-]{20,200})$/);
  return m ? (m[1] as string) : null;
}

function saveFile(name: string, data: Blob | string, type = 'text/csv'): void {
  const blob = typeof data === 'string' ? new Blob([data], { type }) : data;
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

const when = (ms: number) =>
  new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const ago = (ms: number) => {
  const s = Math.round((Date.now() - ms) / 1000);
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)} min ago` : when(ms);
};

function notice(text: string, tone: 'info' | 'bad' = 'info'): HTMLElement {
  return h('p', { class: `notice ${tone}`, role: tone === 'bad' ? 'alert' : 'status' }, text);
}

// --- home: create or open a class ---

function renderHome(message?: string): void {
  chip.hidden = true;
  titleEl.textContent = 'Teacher dashboard';
  document.title = 'Service Bay VR · Teacher dashboard';
  main.replaceChildren();
  if (!API_URL) {
    main.append(
      h(
        'section',
        { class: 'card' },
        h('h2', {}, 'The class server is not set up yet'),
        h(
          'p',
          {},
          'This copy of Service Bay VR was built without a class server address. The game works without one; see the README for the Cloudflare setup steps.',
        ),
      ),
    );
    return;
  }
  if (message) main.append(notice(message, 'bad'));
  const nameInput = h('input', {
    id: 'class-name',
    name: 'name',
    required: true,
    maxlength: '60',
    placeholder: 'e.g. Period 3 Auto Tech',
    autocomplete: 'off',
  });
  const status = h('p', { class: 'form-status', 'aria-live': 'polite' });
  const form = h(
    'form',
    { class: 'card create' },
    h('h2', {}, 'Create a class'),
    h(
      'p',
      { class: 'muted' },
      'No sign-up: you get a class code for students and a private link for you. Only nicknames are stored.',
    ),
    h('label', { for: 'class-name' }, 'Class name'),
    h('div', { class: 'row' }, nameInput, h('button', { type: 'submit', class: 'btn primary' }, 'Create class')),
    status,
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    status.textContent = 'Creating…';
    try {
      const c = await api<CreateClassResponse>('POST', '/classes', null, { name: nameInput.value });
      remember({ key: c.teacherKey, name: c.name, code: c.code });
      renderCreated(c);
    } catch (err) {
      status.textContent = err instanceof Error ? err.message : 'Could not create the class.';
    }
  });
  main.append(form);

  const list = remembered();
  if (list.length) {
    main.append(
      h(
        'section',
        { class: 'card' },
        h('h2', {}, 'Your classes on this browser'),
        h(
          'ul',
          { class: 'class-list' },
          ...list.map((r) =>
            h('li', {}, h('a', { href: `#k=${r.key}` }, r.name), h('span', { class: 'muted' }, ` · code ${r.code}`)),
          ),
        ),
      ),
    );
  }
}

function renderCreated(c: CreateClassResponse): void {
  const link = teacherLink(c.teacherKey);
  const copy = h('button', { type: 'button', class: 'btn' }, 'Copy link');
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(link);
      copy.textContent = 'Copied ✓';
    } catch {
      linkBox.select();
    }
  });
  const linkBox = h('input', { readonly: true, value: link, 'aria-label': 'Your private teacher link', class: 'mono' });
  main.replaceChildren(
    h(
      'section',
      { class: 'card created' },
      h('h2', {}, `${c.name} is ready`),
      h('p', {}, 'Students type this class code in the game (Join a class on the main menu):'),
      h('p', { class: 'big-code', 'aria-label': `Class code ${[...c.code].join(' ')}` }, c.code),
      h('h3', {}, 'Your private teacher link'),
      h(
        'p',
        { class: 'notice bad' },
        '⚠ Save this link now (bookmark it or keep it somewhere safe). It is the only way into this class: there is no password to reset. Anyone with it can see and change the class.',
      ),
      h('div', { class: 'row' }, linkBox, copy),
      h('p', {}, h('a', { class: 'btn primary', href: `#k=${c.teacherKey}` }, 'Open the class dashboard')),
    ),
  );
}

// --- the class dashboard ---

type Tab = 'overview' | 'grid' | 'mistakes' | 'live' | 'shop' | 'settings' | 'export';
const TABS: [Tab, string][] = [
  ['overview', 'Overview'],
  ['grid', 'Class grid'],
  ['mistakes', 'Common mistakes'],
  ['live', 'Playing now'],
  ['shop', 'Shop mode'],
  ['settings', 'Settings & roster'],
  ['export', 'Export'],
];

let key = '';
let view: ClassView | null = null;
let tab: Tab = 'overview';
let refreshTimer: number | null = null;
const panel = h('div', { class: 'panel', role: 'tabpanel', id: 'panel' });

async function openClass(k: string): Promise<void> {
  key = k;
  try {
    view = await api<ClassView>('GET', '/class', key);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      forget(k);
      renderHome('That teacher link does not open a class. It may have been deleted.');
    } else renderHome(err instanceof Error ? err.message : 'Could not reach the class server.');
    return;
  }
  remember({ key, name: view.name, code: view.code });
  titleEl.textContent = view.name;
  document.title = `${view.name} · Service Bay VR`;
  chip.hidden = false;
  chip.replaceChildren(h('span', { class: 'muted' }, 'Class code '), h('strong', { class: 'mono' }, view.code));
  const tabs = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Dashboard sections' });
  for (const [id, label] of TABS) {
    const b = h(
      'button',
      {
        type: 'button',
        role: 'tab',
        id: `tab-${id}`,
        'aria-controls': 'panel',
        'aria-selected': String(id === tab),
        tabindex: id === tab ? '0' : '-1',
      },
      label,
    );
    b.addEventListener('click', () => selectTab(id));
    b.addEventListener('keydown', (e) => {
      const i = TABS.findIndex(([t]) => t === id);
      const next = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : null;
      if (next === null) return;
      const [t] = TABS[(next + TABS.length) % TABS.length] as [Tab, string];
      selectTab(t);
      document.getElementById(`tab-${t}`)?.focus();
    });
    tabs.append(b);
  }
  main.replaceChildren(tabs, panel);
  selectTab(tab);
}

function selectTab(t: Tab): void {
  tab = t;
  for (const [id] of TABS) {
    const b = document.getElementById(`tab-${id}`);
    b?.setAttribute('aria-selected', String(id === t));
    b?.setAttribute('tabindex', id === t ? '0' : '-1');
  }
  panel.setAttribute('aria-labelledby', `tab-${t}`);
  if (refreshTimer !== null) clearInterval(refreshTimer);
  refreshTimer = null;
  void renderTab();
  // Grid and live views refresh on their own while a class is playing.
  if (t === 'grid' || t === 'live')
    refreshTimer = window.setInterval(() => void renderTab(true), t === 'live' ? 15_000 : 30_000);
}

async function renderTab(quiet = false): Promise<void> {
  if (!quiet) panel.replaceChildren(h('p', { class: 'muted' }, 'Loading…'));
  try {
    if (tab === 'overview') await renderOverview();
    else if (tab === 'grid') await renderGrid();
    else if (tab === 'mistakes') await renderMistakes();
    else if (tab === 'live') await renderLive();
    else if (tab === 'shop') await renderShop();
    else if (tab === 'settings') await renderSettings();
    else renderExport();
  } catch (err) {
    if (!quiet) panel.replaceChildren(notice(err instanceof Error ? err.message : 'Something went wrong.', 'bad'));
  }
}

// --- grid ---

const MODE_SHORT: Record<ModeKey, string> = { learn: 'L', practice: 'P', test: 'T' };
let gridMode: 'all' | ModeKey = 'all';

async function renderGrid(): Promise<void> {
  view = await api<ClassView>('GET', '/class', key);
  const v = view;
  if (v.students.length === 0) {
    panel.replaceChildren(
      h(
        'div',
        { class: 'empty' },
        h('p', {}, `No students yet. Students join from the game with class code ${v.code}.`),
      ),
    );
    return;
  }
  const filter = h(
    'div',
    { class: 'filters', role: 'group', 'aria-label': 'Show' },
    ...(['all', ...MODES] as const).map((m) => {
      const b = h(
        'button',
        { type: 'button', class: 'pill', 'aria-pressed': String(gridMode === m) },
        m === 'all' ? 'All runs' : m[0]?.toUpperCase() + m.slice(1),
      );
      b.addEventListener('click', () => {
        gridMode = m;
        void renderGrid();
      });
      return b;
    }),
  );
  const head = h(
    'tr',
    {},
    h('th', { scope: 'col' }, 'Student'),
    ...LESSON_KEYS.map((l) =>
      h(
        'th',
        { scope: 'col', class: v.settings.open[l] ? '' : 'locked' },
        LESSON_TITLES[l],
        v.settings.open[l] ? '' : ' 🔒',
      ),
    ),
  );
  const rows = v.students.map((s) =>
    h(
      'tr',
      {},
      h('th', { scope: 'row' }, s.nickname),
      ...LESSON_KEYS.map((l) => {
        const cells = v.cells.filter((c) => c.studentId === s.id && c.lesson === l);
        const parts = MODES.filter((m) => gridMode === 'all' || gridMode === m).map((m) => {
          const c = cells.find((x) => x.mode === m);
          if (!c) return h('span', { class: 'mark none', title: `${m}: not yet` }, `${MODE_SHORT[m]} –`);
          if (m === 'learn') return h('span', { class: 'mark done', title: 'Learn: done' }, 'L ✓');
          const pass = m === 'test' && c.passed;
          return h(
            'span',
            {
              class: `mark ${m === 'test' ? (pass ? 'done' : 'partial') : c.best >= 80 ? 'done' : 'partial'}`,
              title: `${m}: best ${c.best}% in ${c.attempts} run(s)${pass ? ', passed' : ''}`,
            },
            `${MODE_SHORT[m]} ${c.best}${pass ? ' ✓' : ''}`,
          );
        });
        const btn = h(
          'button',
          {
            type: 'button',
            class: 'cell',
            'aria-label': `${s.nickname}, ${LESSON_TITLES[l]}: ${parts.map((p) => p.title).join('; ')}. Show runs.`,
          },
          ...parts,
        );
        btn.addEventListener('click', () => void openDrawer(s.id, s.nickname, l));
        return h('td', {}, btn);
      }),
    ),
  );
  panel.replaceChildren(
    filter,
    h(
      'p',
      { class: 'muted small' },
      'L = Learn done, P = best Practice score, T = best Test score (✓ passed: 80% and no safety errors). Select a cell for the runs and mistakes.',
    ),
    h(
      'div',
      { class: 'scroll' },
      h('table', { class: 'grid' }, h('thead', {}, head), h('tbody', {}, ...rows), h('tfoot', {}, summaryRow(v))),
    ),
  );
}

// --- class summary (shared by the grid's summary row and the Overview tab) ---

interface LessonSummary {
  lesson: LessonKey;
  passed: number;
  tried: number;
  learned: number;
  avgTest: number | null;
}

function summarize(v: ClassView): LessonSummary[] {
  return LESSON_KEYS.map((lesson) => {
    const cells = v.cells.filter((c) => c.lesson === lesson);
    const tests = cells.filter((c) => c.mode === 'test');
    const who = (list: typeof cells) => new Set(list.map((c) => c.studentId)).size;
    return {
      lesson,
      passed: who(tests.filter((c) => c.passed)),
      tried: who(cells),
      learned: who(cells.filter((c) => c.mode === 'learn')),
      avgTest: tests.length ? Math.round(tests.reduce((a, c) => a + c.best, 0) / tests.length) : null,
    };
  });
}

function summaryRow(v: ClassView): HTMLTableRowElement {
  const n = v.students.length;
  return h(
    'tr',
    { class: 'summary' },
    h('th', { scope: 'row' }, 'Class'),
    ...summarize(v).map((s) =>
      h(
        'td',
        {},
        h('strong', {}, `${s.passed}/${n} passed`),
        h('br'),
        h('span', { class: 'muted small' }, `avg Test ${s.avgTest ?? '–'} · ${s.learned} did Learn`),
      ),
    ),
  );
}

async function renderOverview(): Promise<void> {
  view = await api<ClassView>('GET', '/class', key);
  const v = view;
  const n = v.students.length;
  if (n === 0) {
    panel.replaceChildren(
      h(
        'div',
        { class: 'empty' },
        h('p', {}, `No students yet. Students join from the game with class code ${v.code}.`),
      ),
    );
    return;
  }
  const all = summarize(v);
  const certs = v.cells.filter((c) => c.mode === 'test' && c.passed).length;
  // Ranked by pass rate, then by how many have started, so the strongest and weakest lessons stand out.
  const ranked = [...all].sort((a, b) => b.passed - a.passed || b.tried - a.tried);
  const pct = (x: number) => `${(x / n) * 100}%`;
  const rows = ranked.map((s) =>
    h(
      'tr',
      {},
      h('th', { scope: 'row' }, LESSON_TITLES[s.lesson], v.settings.open[s.lesson] ? '' : ' 🔒'),
      h('td', { class: 'num' }, `${s.passed} of ${n}`),
      h('td', { class: 'num' }, String(s.tried - s.passed)),
      h('td', { class: 'num' }, String(n - s.tried)),
      h('td', { class: 'num' }, s.avgTest === null ? '–' : `${s.avgTest}%`),
      h(
        'td',
        { class: 'bar-cell', 'aria-hidden': 'true' },
        h(
          'div',
          {
            class: 'stack',
            title: `${s.passed} passed, ${s.tried - s.passed} working on it, ${n - s.tried} not started`,
          },
          s.passed ? h('div', { class: 'seg passed', style: `width:${pct(s.passed)}` }) : null,
          s.tried - s.passed ? h('div', { class: 'seg tried', style: `width:${pct(s.tried - s.passed)}` }) : null,
        ),
      ),
    ),
  );
  panel.replaceChildren(
    h(
      'div',
      { class: 'stats' },
      h('div', { class: 'stat' }, h('span', { class: 'stat-num' }, String(n)), h('span', {}, 'students')),
      h(
        'div',
        { class: 'stat' },
        h('span', { class: 'stat-num' }, String(certs)),
        h('span', {}, 'certificates earned'),
      ),
      h(
        'div',
        { class: 'stat' },
        h('span', { class: 'stat-num' }, String(all.filter((s) => s.passed === n).length)),
        h('span', {}, 'lessons passed by everyone'),
      ),
    ),
    h('h2', { class: 'section' }, 'Pass rate by lesson'),
    h(
      'p',
      { class: 'legend small' },
      h('span', { class: 'key passed' }),
      ' Passed the Test ',
      h('span', { class: 'key tried' }),
      ' Working on it (any run, no pass yet) ',
      h('span', { class: 'key empty' }),
      ' Not started',
    ),
    h(
      'div',
      { class: 'scroll' },
      h(
        'table',
        { class: 'chart overview' },
        h(
          'thead',
          {},
          h(
            'tr',
            {},
            h('th', { scope: 'col' }, 'Lesson'),
            h('th', { scope: 'col', class: 'num' }, 'Passed'),
            h('th', { scope: 'col', class: 'num' }, 'Working'),
            h('th', { scope: 'col', class: 'num' }, 'Not started'),
            h('th', { scope: 'col', class: 'num' }, 'Avg Test'),
            h('th', { scope: 'col' }, h('span', { class: 'sr' }, 'Bar')),
          ),
        ),
        h('tbody', {}, ...rows),
      ),
    ),
  );
}

const drawer = h('dialog', { class: 'drawer', 'aria-labelledby': 'drawer-title' });
document.body.append(drawer);

async function openDrawer(studentId: string, nickname: string, lesson: LessonKey): Promise<void> {
  const list = (await api<AttemptView[]>('GET', `/attempts?student=${encodeURIComponent(studentId)}`, key)).filter(
    (a) => a.lesson === lesson,
  );
  const close = h('button', { type: 'button', class: 'btn', autofocus: true }, 'Close');
  close.addEventListener('click', () => drawer.close());
  drawer.replaceChildren(
    h('h2', { id: 'drawer-title' }, `${nickname} · ${LESSON_TITLES[lesson]}`),
    list.length === 0
      ? h('p', { class: 'muted' }, 'No runs of this lesson yet.')
      : h(
          'ol',
          { class: 'runs' },
          ...list.map((a) =>
            h(
              'li',
              {},
              h(
                'p',
                { class: 'run-head' },
                h('strong', {}, `${a.mode[0]?.toUpperCase()}${a.mode.slice(1)}`),
                ` · ${a.vehicle} · ${when(a.at)} · `,
                a.mode === 'learn'
                  ? 'done'
                  : `${a.score}%${a.mode === 'test' ? (a.passed ? ' · passed' : ' · not passed') : ''}`,
                a.hints ? ` · ${a.hints} hint(s)` : '',
              ),
              a.mistakes.length
                ? h(
                    'ul',
                    { class: 'mistakes' },
                    ...a.mistakes.map((m) =>
                      h(
                        'li',
                        { class: m.critical ? 'critical' : '' },
                        m.critical ? h('span', { class: 'tag critical' }, '⚠ Safety') : null,
                        ` ${m.label}${m.count > 1 ? ` (×${m.count})` : ''}`,
                      ),
                    ),
                  )
                : h('p', { class: 'muted small' }, 'No mistakes.'),
            ),
          ),
        ),
    h('div', { class: 'row end' }, close),
  );
  drawer.showModal();
}

// --- common mistakes: ranked horizontal bars, one hue; safety errors flagged with an icon and label ---

async function renderMistakes(): Promise<void> {
  const list = await api<MistakeCount[]>('GET', '/mistakes', key);
  if (list.length === 0) {
    panel.replaceChildren(h('div', { class: 'empty' }, h('p', {}, 'No mistakes recorded yet.')));
    return;
  }
  const top = list.slice(0, 15);
  const max = Math.max(...top.map((m) => m.count));
  const rows = top.map((m) =>
    h(
      'tr',
      {},
      h(
        'th',
        { scope: 'row' },
        m.critical ? h('span', { class: 'tag critical' }, '⚠ Safety') : null,
        ` ${m.label}`,
        h('span', { class: 'code' }, m.code),
      ),
      h('td', { class: 'num' }, String(m.count)),
      h('td', { class: 'num' }, String(m.students)),
      h(
        'td',
        { class: 'bar-cell', 'aria-hidden': 'true' },
        h('div', {
          class: `bar ${m.critical ? 'critical' : ''}`,
          style: `width:${Math.max(2, (m.count / max) * 100)}%`,
          title: `${m.label}: ${m.count} time(s) by ${m.students} student(s)`,
        }),
      ),
    ),
  );
  panel.replaceChildren(
    h('h2', { class: 'section' }, 'Most common mistakes'),
    h(
      'p',
      { class: 'muted small' },
      'Across every run in this class, most frequent first. Use it to decide what to re-teach.',
    ),
    h(
      'div',
      { class: 'scroll' },
      h(
        'table',
        { class: 'chart' },
        h(
          'thead',
          {},
          h(
            'tr',
            {},
            h('th', { scope: 'col' }, 'Mistake'),
            h('th', { scope: 'col', class: 'num' }, 'Times'),
            h('th', { scope: 'col', class: 'num' }, 'Students'),
            h('th', { scope: 'col' }, h('span', { class: 'sr' }, 'Bar')),
          ),
        ),
        h('tbody', {}, ...rows),
      ),
    ),
  );
}

// --- live ---

async function renderLive(): Promise<void> {
  const list = await api<LiveView[]>('GET', '/live', key);
  const label = (l: LiveView) =>
    l.lesson === 'shop'
      ? 'Shop mode'
      : l.lesson
        ? `${LESSON_TITLES[l.lesson as LessonKey] ?? l.lesson} · ${l.mode ?? ''} · step ${l.step ?? ''}`
        : 'In the menus';
  panel.replaceChildren(
    h('h2', { class: 'section' }, `Playing now (${list.length})`),
    h(
      'p',
      { class: 'muted small' },
      'Students who sent an update in the last two minutes. Refreshes every 15 seconds.',
    ),
    list.length === 0
      ? h('div', { class: 'empty' }, h('p', {}, 'Nobody is playing right now.'))
      : h(
          'ul',
          { class: 'live' },
          ...list.map((l) =>
            h('li', {}, h('strong', {}, l.nickname), h('span', {}, label(l)), h('span', { class: 'muted' }, ago(l.at))),
          ),
        ),
  );
}

// --- shop ---

async function renderShop(): Promise<void> {
  const list = await api<ShopView[]>('GET', '/shop', key);
  if (list.length === 0) {
    panel.replaceChildren(h('div', { class: 'empty' }, h('p', {}, 'No Shop mode shifts played yet.')));
    return;
  }
  const money = (n: number) => n.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
  panel.replaceChildren(
    h(
      'div',
      { class: 'scroll' },
      h(
        'table',
        { class: 'data' },
        h(
          'thead',
          {},
          h(
            'tr',
            {},
            ...[
              'Student',
              'Shifts',
              'Jobs',
              'Money',
              'Reputation',
              'Comebacks',
              'Safety stops',
              'Upgrades',
              'Updated',
            ].map((c, i) => h('th', { scope: 'col', class: i > 0 && i < 8 ? 'num' : '' }, c)),
          ),
        ),
        h(
          'tbody',
          {},
          ...list.map((s) =>
            h(
              'tr',
              {},
              h('th', { scope: 'row' }, s.nickname),
              ...[s.shifts, s.jobs, money(s.money), `${s.rep}/100`, s.comebacks, s.safetyStops, s.upgrades].map((x) =>
                h('td', { class: 'num' }, String(x)),
              ),
              h('td', {}, ago(s.updatedAt)),
            ),
          ),
        ),
      ),
    ),
  );
}

// --- settings and roster ---

async function renderSettings(): Promise<void> {
  view = await api<ClassView>('GET', '/class', key);
  const v = view;
  const s: ClassSettings = structuredClone(v.settings);
  const status = h('p', { class: 'form-status', 'aria-live': 'polite' });
  const check = (id: string, label: string, checked: boolean, onChange: (on: boolean) => void) => {
    const input = h('input', { type: 'checkbox', id, checked });
    input.addEventListener('change', () => onChange(input.checked));
    return h('label', { class: 'check', for: id }, input, ` ${label}`);
  };
  const radio = <T extends string>(
    name: string,
    legend: string,
    options: [T, string][],
    value: T,
    set: (v: T) => void,
  ) =>
    h(
      'fieldset',
      {},
      h('legend', {}, legend),
      ...options.map(([val, label]) => {
        const input = h('input', { type: 'radio', name, id: `${name}-${val}`, value: val, checked: value === val });
        input.addEventListener('change', () => set(val));
        return h('label', { class: 'check', for: `${name}-${val}` }, input, ` ${label}`);
      }),
    );
  const save = h('button', { type: 'submit', class: 'btn primary' }, 'Save settings');
  const form = h(
    'form',
    { class: 'card settings' },
    h('h2', {}, 'Lessons'),
    h(
      'fieldset',
      {},
      h('legend', { class: 'sr' }, 'Open lessons'),
      ...LESSON_KEYS.map((l) =>
        check(`open-${l}`, LESSON_TITLES[l], s.open[l], (on) => {
          s.open[l] = on;
        }),
      ),
    ),
    check('learn-first', 'Students must finish Learn before a lesson’s Test opens', s.learnFirst, (on) => {
      s.learnFirst = on;
    }),
    radio(
      'shop',
      'Shop mode',
      [
        ['on', 'On for everyone'],
        ['passed', 'Only after passing any lesson Test'],
        ['off', 'Off'],
      ],
      s.shop,
      (val) => {
        s.shop = val;
      },
    ),
    radio(
      'signin',
      'Shared headsets',
      [
        ['device', 'Keep each student on the device (they pick their name)'],
        ['session', 'Sign in every session (the headset forgets them on exit)'],
      ],
      s.signIn,
      (val) => {
        s.signIn = val;
      },
    ),
    check('roster', 'Roster only: students need a personal roster code to join', s.roster, (on) => {
      s.roster = on;
    }),
    h('div', { class: 'row' }, save),
    status,
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    status.textContent = 'Saving…';
    try {
      await api('PUT', '/settings', key, s);
      status.textContent = 'Saved. Students get the change within a minute.';
    } catch (err) {
      status.textContent = err instanceof Error ? err.message : 'Could not save.';
    }
  });

  const names = h('textarea', { id: 'roster-names', rows: '4', placeholder: 'One name per line' });
  const addStatus = h('p', { class: 'form-status', 'aria-live': 'polite' });
  const add = h('button', { type: 'button', class: 'btn' }, 'Add to roster');
  add.addEventListener('click', async () => {
    const list = names.value
      .split('\n')
      .map((n) => n.trim())
      .filter(Boolean);
    if (!list.length) return;
    try {
      await api('POST', '/roster', key, { names: list });
      void renderSettings();
    } catch (err) {
      addStatus.textContent = err instanceof Error ? err.message : 'Could not add names.';
    }
  });
  const studentRows = v.students.map((st) => {
    const reset = h('button', { type: 'button', class: 'btn small' }, 'Reset results');
    reset.addEventListener('click', async () => {
      if (!confirm(`Clear every result for ${st.nickname}? This cannot be undone.`)) return;
      await api('DELETE', `/students/${st.id}/results`, key);
      void renderSettings();
    });
    const remove = h('button', { type: 'button', class: 'btn small danger' }, 'Remove');
    remove.addEventListener('click', async () => {
      if (!confirm(`Remove ${st.nickname} and all their results from the class?`)) return;
      await api('DELETE', `/students/${st.id}`, key);
      void renderSettings();
    });
    return h(
      'tr',
      {},
      h('th', { scope: 'row' }, st.nickname),
      h('td', { class: 'mono' }, st.rosterCode ?? '—'),
      h('td', {}, ago(st.activeAt)),
      h('td', { class: 'actions' }, reset, remove),
    );
  });
  const roster = h(
    'section',
    { class: 'card' },
    h('h2', {}, 'Students and roster'),
    h(
      'p',
      { class: 'muted small' },
      'Add names to give each student a personal roster code (handy with Roster only on). Codes are shown only to you.',
    ),
    h('label', { for: 'roster-names' }, 'Add students'),
    names,
    h('div', { class: 'row' }, add),
    addStatus,
    v.students.length
      ? h(
          'div',
          { class: 'scroll' },
          h(
            'table',
            { class: 'data' },
            h(
              'thead',
              {},
              h('tr', {}, ...['Student', 'Roster code', 'Last active', ''].map((c) => h('th', { scope: 'col' }, c))),
            ),
            h('tbody', {}, ...studentRows),
          ),
        )
      : h('p', { class: 'muted' }, 'No students yet.'),
  );

  const del = h('button', { type: 'button', class: 'btn danger' }, 'Delete this class');
  del.addEventListener('click', async () => {
    if (!confirm(`Delete ${v.name} and every student result in it? This cannot be undone.`)) return;
    await api('DELETE', '/class', key);
    forget(key);
    location.hash = '';
    renderHome();
  });
  const danger = h(
    'section',
    { class: 'card' },
    h('h2', {}, 'Delete the class'),
    h(
      'p',
      { class: 'muted small' },
      'Removes the class and all its data right away. Classes with no activity for a year are deleted automatically.',
    ),
    del,
  );
  panel.replaceChildren(form, roster, danger);
}

// --- exports ---

function renderExport(): void {
  const v = view;
  if (!v) return;
  const status = h('p', { class: 'form-status', 'aria-live': 'polite' });
  const csvButton = (path: string, label: string, desc: string) => {
    const b = h('button', { type: 'button', class: 'btn' }, label);
    b.addEventListener('click', async () => {
      status.textContent = 'Preparing…';
      try {
        const text = await api<string>('GET', path, key);
        saveFile(`${slug(v.name)}-${path.split('/').pop()}`, text);
        status.textContent = 'Downloaded.';
      } catch (err) {
        status.textContent = err instanceof Error ? err.message : 'Could not export.';
      }
    });
    return h('li', {}, b, h('span', { class: 'muted small' }, desc));
  };
  const certs = h('button', { type: 'button', class: 'btn' }, 'Certificates (zip of PNGs)');
  certs.addEventListener('click', async () => {
    status.textContent = 'Drawing certificates…';
    try {
      const list = await api<AttemptView[]>('GET', '/certificates', key);
      if (!list.length) {
        status.textContent = 'No passed Tests yet.';
        return;
      }
      const entries = [];
      for (const a of list) {
        const png = await certificatePng(
          { name: a.nickname } as Profile,
          LESSON_TITLES[a.lesson],
          a.score,
          new Date(a.at).toISOString(),
        );
        if (png)
          entries.push({
            name: `${slug(a.nickname)}-${slug(LESSON_TITLES[a.lesson])}.png`,
            data: new Uint8Array(await png.arrayBuffer()),
          });
      }
      saveFile(`${slug(v.name)}-certificates.zip`, zip(entries));
      status.textContent = `${entries.length} certificate(s) downloaded.`;
    } catch (err) {
      status.textContent = err instanceof Error ? err.message : 'Could not make the certificates.';
    }
  });
  panel.replaceChildren(
    h(
      'section',
      { class: 'card' },
      h('h2', {}, 'Export'),
      h(
        'ul',
        { class: 'exports' },
        csvButton(
          '/export/grades.csv',
          'Grade summary (CSV)',
          'One row per student: best Test score per lesson and certificates earned.',
        ),
        csvButton(
          '/export/attempts.csv',
          'Every run (CSV)',
          'One row per run: lesson, mode, vehicle, score, safety errors, hints, time, mistakes.',
        ),
        csvButton(
          '/export/shop.csv',
          'Shop mode (CSV)',
          'Shifts, jobs, money, reputation, comebacks and safety stops.',
        ),
        h(
          'li',
          {},
          certs,
          h('span', { class: 'muted small' }, 'Every passed Test, drawn exactly like the in-game certificate.'),
        ),
      ),
      status,
    ),
  );
}

// --- routing ---

function route(): void {
  const k = keyFromHash();
  if (k && API_URL) void openClass(k);
  else renderHome();
}
window.addEventListener('hashchange', route);
route();

// Exposed for end-to-end tests.
(window as unknown as { __dashboard: unknown }).__dashboard = {
  openClass,
  selectTab,
  get tab() {
    return tab;
  },
};
