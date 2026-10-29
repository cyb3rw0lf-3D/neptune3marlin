import type { LessonProgress, SaveStore } from '../core/save';
import type { Settings } from '../core/settings';
import { LESSONS } from '../lessons/content';
import type { LessonDef, Mode, VehicleId } from '../lessons/engine/types';
import { VEHICLES } from '../vehicles/specs';
import { Panel, UI } from './panel';

type Screen = 'profiles' | 'keyboard' | 'home' | 'lesson' | 'settings' | 'pause';

export interface MenuActions {
  startLesson(lesson: LessonDef, mode: Mode, vehicle: VehicleId): void;
  settingsChanged(s: Partial<Settings>): void;
  calibrateHeight(): void;
  resume(): void;
  restart(): void;
  quitLesson(): void;
}

const KEYS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];

/** The in-world menu board: students, lessons, modes and settings. */
export class Menus {
  readonly panel = new Panel('menu', 1.3, 0.86, 1000);
  private screen: Screen = 'profiles';
  private lesson: LessonDef | null = null;
  private vehicle: VehicleId = 'sedan';
  private name = '';
  private returnTo: Screen = 'home';
  private page = 0;

  constructor(
    private readonly save: SaveStore,
    private readonly actions: MenuActions,
  ) {
    this.panel.setDraw((p) => this.draw(p));
  }

  open(screen?: Screen): void {
    this.screen = screen ?? (this.save.activeProfile ? 'home' : 'profiles');
    this.panel.mesh.visible = true;
    this.panel.redraw();
  }

  openPause(): void {
    this.open('pause');
  }

  close(): void {
    this.panel.mesh.visible = false;
  }

  get isOpen(): boolean {
    return this.panel.mesh.visible;
  }

  get current(): Screen {
    return this.screen;
  }

  private go(screen: Screen): void {
    this.screen = screen;
    this.panel.hoverId = null;
    this.panel.redraw();
  }

  private draw(p: Panel): void {
    p.background(30);
    switch (this.screen) {
      case 'profiles':
        this.drawProfiles(p);
        break;
      case 'keyboard':
        this.drawKeyboard(p);
        break;
      case 'home':
        this.drawHome(p);
        break;
      case 'lesson':
        this.drawLesson(p);
        break;
      case 'settings':
        this.drawSettings(p);
        break;
      case 'pause':
        this.drawPause(p);
        break;
    }
  }

  private header(p: Panel, title: string, sub?: string): void {
    p.ctx.fillStyle = UI.accent;
    p.ctx.fillRect(0, 0, p.widthPx, 10);
    p.text(title, 50, 40, { size: 52, bold: true, maxWidth: p.widthPx - 100 });
    if (sub) p.text(sub, 50, 104, { size: 28, color: UI.muted, maxWidth: p.widthPx - 100 });
  }

  private drawProfiles(p: Panel): void {
    this.header(p, "Who's working today?", 'Pick your name, or add yourself. Progress is saved on this device.');
    const profiles = this.save.data.profiles;
    const perPage = 8;
    const pages = Math.max(1, Math.ceil(profiles.length / perPage));
    this.page = Math.min(this.page, pages - 1);
    const shown = profiles.slice(this.page * perPage, this.page * perPage + perPage);
    shown.forEach((prof, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      p.button(
        `profile-${prof.id}`,
        prof.name,
        50 + col * 610,
        170 + row * 100,
        590,
        84,
        () => {
          this.save.selectProfile(prof.id);
          this.go('home');
        },
        { align: 'left' },
      );
    });
    const by = p.heightPx - 120;
    p.button(
      'new-profile',
      '+ New student',
      50,
      by,
      400,
      84,
      () => {
        this.name = '';
        this.go('keyboard');
      },
      { variant: 'primary' },
    );
    if (pages > 1) {
      p.button('prev-page', '◀', 480, by, 100, 84, () => {
        this.page = (this.page - 1 + pages) % pages;
        p.redraw();
      });
      p.button('next-page', '▶', 600, by, 100, 84, () => {
        this.page = (this.page + 1) % pages;
        p.redraw();
      });
    }
    p.button('settings', 'Settings', p.widthPx - 330, by, 280, 84, () => {
      this.returnTo = 'profiles';
      this.go('settings');
    });
  }

  private drawKeyboard(p: Panel): void {
    this.header(p, 'Type your name', 'First name or nickname. It appears on your reports and certificates.');
    p.ctx.fillStyle = '#0d161d';
    p.ctx.fillRect(50, 160, p.widthPx - 100, 80);
    p.text(`${this.name}|`, 70, 178, { size: 44, bold: true });
    KEYS.forEach((row, r) => {
      const offset = r * 40;
      [...row].forEach((k, i) => {
        p.button(`key-${k}`, k, 60 + offset + i * 116, 270 + r * 100, 104, 88, () => this.type(k), { size: 38 });
      });
    });
    const by = p.heightPx - 120;
    p.button('key-space', 'Space', 60, by, 260, 84, () => this.type(' '));
    p.button('key-back', '⌫ Delete', 340, by, 240, 84, () => {
      this.name = this.name.slice(0, -1);
      p.redraw();
    });
    p.button('key-cancel', 'Cancel', 600, by, 220, 84, () => this.go('profiles'));
    p.button('key-done', 'Done', p.widthPx - 330, by, 280, 84, () => this.finishName(), {
      variant: 'primary',
      enabled: this.name.trim().length > 0,
    });
  }

  private type(k: string): void {
    if (this.name.length >= 20) return;
    this.name = this.name.length === 0 ? k : this.name + k.toLowerCase();
    if (this.name.endsWith(' ') && k === ' ' && this.name.trim() === '') this.name = '';
    this.panel.redraw();
  }

  /** Used by the keyboard "Done" key and the desktop name field. */
  finishName(name = this.name): void {
    if (!name.trim()) return;
    this.save.createProfile(name);
    this.go('home');
  }

  setTypedName(name: string): void {
    this.name = name;
    this.panel.redraw();
  }

  private badge(p: Panel, x: number, y: number, label: string, state: 'done' | 'partial' | 'none'): void {
    const color = state === 'done' ? UI.good : state === 'partial' ? UI.warn : UI.disabled;
    p.ctx.fillStyle = color;
    p.ctx.beginPath();
    p.ctx.roundRect?.(x, y, 116, 34, 10);
    p.ctx.fill();
    p.text(label, x + 58, y + 4, { size: 22, bold: true, color: '#0b141a', align: 'center' });
  }

  private drawHome(p: Panel): void {
    const prof = this.save.activeProfile;
    this.header(
      p,
      `Hi, ${prof?.name ?? 'technician'}!`,
      'Training: pick a lesson. Each one has Learn, Practice and Test runs.',
    );
    LESSONS.forEach((lesson, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = 50 + col * 610;
      const y = 160 + row * 128;
      const prog = this.save.progress(lesson.id);
      const label = lesson.available ? lesson.title : `${lesson.title} (soon)`;
      p.button(
        `lesson-${lesson.id}`,
        '',
        x,
        y,
        590,
        112,
        () => {
          this.lesson = lesson;
          this.vehicle = lesson.vehicles.find((v) => v === 'sedan') ?? (lesson.vehicles[0] as VehicleId);
          this.go('lesson');
        },
        { enabled: lesson.available },
      );
      p.text(label, x + 24, y + 14, {
        size: 32,
        bold: true,
        color: lesson.available ? UI.text : UI.disabled,
        maxWidth: 540,
      });
      if (lesson.available) {
        this.badge(p, x + 24, y + 62, 'LEARN', prog.learned ? 'done' : 'none');
        this.badge(
          p,
          x + 152,
          y + 62,
          prog.practiceBest !== null ? `PRAC ${prog.practiceBest}` : 'PRACTICE',
          prog.practiceBest !== null ? (prog.practiceBest >= 80 ? 'done' : 'partial') : 'none',
        );
        this.badge(
          p,
          x + 280,
          y + 62,
          prog.passed ? 'PASSED' : prog.testBest !== null ? `TEST ${prog.testBest}` : 'TEST',
          prog.passed ? 'done' : prog.testBest !== null ? 'partial' : 'none',
        );
      } else {
        p.text('Coming in a later update', x + 24, y + 66, { size: 24, color: UI.disabled });
      }
    });
    const by = p.heightPx - 104;
    p.button('switch', 'Switch student', 50, by, 330, 76, () => this.go('profiles'));
    p.button('shop', 'Shop mode (soon)', 400, by, 380, 76, () => {}, { enabled: false });
    p.button('settings', 'Settings', p.widthPx - 330, by, 280, 76, () => {
      this.returnTo = 'home';
      this.go('settings');
    });
  }

  private modeState(prog: LessonProgress, mode: Mode): string {
    if (mode === 'learn') return prog.learned ? 'Done ✓' : 'Guided, with Valkyrie';
    if (mode === 'practice') return prog.practiceBest !== null ? `Best ${prog.practiceBest}%` : 'Hints on request';
    return prog.passed
      ? `Passed ✓ (best ${prog.testBest}%)`
      : prog.testBest !== null
        ? `Best ${prog.testBest}%`
        : 'No hints · 80% to pass';
  }

  private drawLesson(p: Panel): void {
    const lesson = this.lesson;
    if (!lesson) {
      this.go('home');
      return;
    }
    this.header(p, lesson.title);
    p.paragraph(lesson.summary, 50, 104, p.widthPx - 100, { size: 28, color: UI.muted, maxLines: 2 });
    const prog = this.save.progress(lesson.id);

    p.text('Vehicle', 50, 196, { size: 26, color: UI.muted });
    // Stage 1 ships the sedan; the other vehicles arrive in later updates.
    const vehicles: VehicleId[] = ['sedan', 'pickup', 'ev'];
    vehicles.forEach((v, i) => {
      const supported = lesson.vehicles.includes(v);
      const built = v === 'sedan';
      p.button(
        `vehicle-${v}`,
        built ? VEHICLES[v].name : `${VEHICLES[v].name} (soon)`,
        50 + i * 400,
        232,
        380,
        70,
        () => {
          this.vehicle = v;
          p.redraw();
        },
        { enabled: supported && built, selected: this.vehicle === v },
      );
    });

    const modes: [Mode, string, string][] = [
      ['learn', 'Learn', 'Valkyrie guides every step and explains why.'],
      ['practice', 'Practice', 'Do it yourself. Ask for hints when stuck.'],
      ['test', 'Test', 'From memory. Pass with 80% and no safety errors.'],
    ];
    modes.forEach(([mode, title, desc], i) => {
      const y = 330 + i * 116;
      p.button(
        `mode-${mode}`,
        '',
        50,
        y,
        p.widthPx - 100,
        100,
        () => this.actions.startLesson(lesson, mode, this.vehicle),
        {
          variant: i === 0 && !prog.learned ? 'primary' : 'normal',
        },
      );
      p.text(title, 80, y + 14, { size: 36, bold: true });
      p.text(desc, 80, y + 58, { size: 24, color: i === 0 && !prog.learned ? '#e6f2ff' : UI.muted, maxWidth: 760 });
      p.text(this.modeState(prog, mode), p.widthPx - 80, y + 32, {
        size: 26,
        bold: true,
        align: 'right',
        color: UI.warn,
      });
    });
    p.button('back', '◀ Back', 50, p.heightPx - 96, 240, 72, () => this.go('home'));
  }

  private drawSettings(p: Panel): void {
    const s = this.save.data.settings;
    this.header(p, 'Settings', 'Saved on this device for every student.');
    const set = (patch: Partial<Settings>) => {
      this.actions.settingsChanged(patch);
      p.redraw();
    };
    const rows: [string, [string, () => void, boolean][]][] = [
      [
        'Units',
        [
          ['US (psi, ft-lb, qt)', () => set({ units: 'us' }), s.units === 'us'],
          ['Metric (kPa, N·m, L)', () => set({ units: 'metric' }), s.units === 'metric'],
        ],
      ],
      [
        'Play position',
        [
          ['Standing', () => set({ seated: false }), !s.seated],
          ['Seated', () => set({ seated: true }), s.seated],
        ],
      ],
      [
        'Wrench gestures',
        [
          ['Twist wrist', () => set({ simpleGestures: false }), !s.simpleGestures],
          ['Hold trigger', () => set({ simpleGestures: true }), s.simpleGestures],
        ],
      ],
      [
        'Captions',
        [
          ['Small', () => set({ captionSize: 'small' }), s.captionSize === 'small'],
          ['Medium', () => set({ captionSize: 'medium' }), s.captionSize === 'medium'],
          ['Large', () => set({ captionSize: 'large' }), s.captionSize === 'large'],
        ],
      ],
      [
        'Snap turn',
        [
          ['30°', () => set({ snapTurnDegrees: 30 }), s.snapTurnDegrees === 30],
          ['45°', () => set({ snapTurnDegrees: 45 }), s.snapTurnDegrees === 45],
          ['90°', () => set({ snapTurnDegrees: 90 }), s.snapTurnDegrees === 90],
        ],
      ],
      [
        'Motion effects',
        [
          ['Full', () => set({ reducedMotion: false }), !s.reducedMotion],
          ['Reduced', () => set({ reducedMotion: true }), s.reducedMotion],
        ],
      ],
    ];
    rows.forEach(([label, options], r) => {
      const y = 150 + r * 82;
      p.text(label, 50, y + 18, { size: 28, color: UI.muted });
      options.forEach(([text, fn, selected], i) => {
        const w = options.length === 3 ? 240 : 370;
        p.button(`set-${r}-${i}`, text, 330 + i * (w + 16), y, w, 66, fn, { selected, size: 26 });
      });
    });
    const vy = 150 + rows.length * 82;
    p.text('Voice / effects', 50, vy + 18, { size: 28, color: UI.muted });
    const vol = (key: 'narrationVolume' | 'effectsVolume', d: number) =>
      set({ [key]: Math.round(Math.min(1, Math.max(0, s[key] + d)) * 10) / 10 });
    p.button('voice-down', 'Voice −', 330, vy, 170, 66, () => vol('narrationVolume', -0.1), { size: 26 });
    p.text(`${Math.round(s.narrationVolume * 100)}%`, 560, vy + 16, { size: 30, bold: true, align: 'center' });
    p.button('voice-up', 'Voice +', 620, vy, 170, 66, () => vol('narrationVolume', 0.1), { size: 26 });
    p.button('fx-down', 'FX −', 820, vy, 140, 66, () => vol('effectsVolume', -0.1), { size: 26 });
    p.text(`${Math.round(s.effectsVolume * 100)}%`, 1000, vy + 16, { size: 30, bold: true, align: 'center' });
    p.button('fx-up', 'FX +', 1050, vy, 140, 66, () => vol('effectsVolume', 0.1), { size: 26 });

    const by = p.heightPx - 96;
    p.button('calibrate', 'Calibrate my height', 50, by, 420, 72, () => this.actions.calibrateHeight());
    p.button('settings-done', 'Done', p.widthPx - 330, by, 280, 72, () => this.go(this.returnTo), {
      variant: 'primary',
    });
  }

  private drawPause(p: Panel): void {
    this.header(p, 'Paused', 'Your run is waiting right where you left it.');
    const items: [string, string, () => void, 'primary' | 'normal' | 'danger'][] = [
      ['resume', 'Resume', () => this.actions.resume(), 'primary'],
      ['restart', 'Restart this run', () => this.actions.restart(), 'normal'],
      [
        'pause-settings',
        'Settings',
        () => {
          this.returnTo = 'pause';
          this.go('settings');
        },
        'normal',
      ],
      ['quit', 'Quit to menu', () => this.actions.quitLesson(), 'danger'],
    ];
    items.forEach(([id, label, fn, variant], i) => {
      p.button(id, label, 300, 180 + i * 140, p.widthPx - 600, 110, fn, { variant });
    });
  }
}
