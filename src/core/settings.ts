import type { UnitSystem } from './units';

export type CaptionSize = 'small' | 'medium' | 'large' | 'xlarge';
export type Palette = 'standard' | 'colorblind' | 'contrast';
export type Handedness = 'right' | 'left';

export interface Settings {
  units: UnitSystem;
  /** Seated play: the floor is raised so everything stays within reach. */
  seated: boolean;
  /** Extra height offset in meters applied to the player rig (height calibration). */
  heightOffset: number;
  handedness: Handedness;
  captionSize: CaptionSize;
  snapTurnDegrees: 30 | 45 | 90;
  /** Turns off shaking and flashing in consequence replays. */
  reducedMotion: boolean;
  /** Use "hold the trigger" instead of twisting the wrist for wrench work. */
  simpleGestures: boolean;
  narrationVolume: number;
  effectsVolume: number;
  /** Panel colors: standard, a color-blind-safe set, or high contrast. */
  palette: Palette;
  /** One controller does everything: teleport, snap turn and tools. */
  oneHanded: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  units: 'us',
  seated: false,
  heightOffset: 0,
  handedness: 'right',
  captionSize: 'medium',
  snapTurnDegrees: 45,
  reducedMotion: false,
  simpleGestures: false,
  narrationVolume: 0.9,
  effectsVolume: 0.7,
  palette: 'standard',
  oneHanded: false,
};

export function sanitizeSettings(raw: unknown): Settings {
  const s = { ...DEFAULT_SETTINGS };
  if (!raw || typeof raw !== 'object') return s;
  const r = raw as Record<string, unknown>;
  if (r.units === 'us' || r.units === 'metric') s.units = r.units;
  if (typeof r.seated === 'boolean') s.seated = r.seated;
  if (typeof r.heightOffset === 'number' && Math.abs(r.heightOffset) <= 1.5) s.heightOffset = r.heightOffset;
  if (r.handedness === 'left' || r.handedness === 'right') s.handedness = r.handedness;
  if (
    r.captionSize === 'small' ||
    r.captionSize === 'medium' ||
    r.captionSize === 'large' ||
    r.captionSize === 'xlarge'
  )
    s.captionSize = r.captionSize;
  if (r.palette === 'standard' || r.palette === 'colorblind' || r.palette === 'contrast') s.palette = r.palette;
  if (typeof r.oneHanded === 'boolean') s.oneHanded = r.oneHanded;
  if (r.snapTurnDegrees === 30 || r.snapTurnDegrees === 45 || r.snapTurnDegrees === 90)
    s.snapTurnDegrees = r.snapTurnDegrees;
  if (typeof r.reducedMotion === 'boolean') s.reducedMotion = r.reducedMotion;
  if (typeof r.simpleGestures === 'boolean') s.simpleGestures = r.simpleGestures;
  if (typeof r.narrationVolume === 'number') s.narrationVolume = clamp01(r.narrationVolume);
  if (typeof r.effectsVolume === 'number') s.effectsVolume = clamp01(r.effectsVolume);
  return s;
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}
