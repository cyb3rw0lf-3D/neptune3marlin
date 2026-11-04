// Pre-records every spoken line with Piper TTS so every headset hears the same voices,
// then packs the clips into a few dozen audio files.
//
//   PIPER_PYTHON=/path/to/venv/bin/python PIPER_VOICES=/path/to/voices node scripts/gen-narration.mjs
//
// PIPER_VOICES is a folder holding the .onnx voices listed in VOICES below. Needs ffmpeg.
// Single clips are kept in audio-src/narration (only new or changed lines are recorded);
// the game loads the packs from public/audio/narration.
//
// All voices are public domain or CC0 (see the README for each source):
//   kristin, norman, john, ljspeech, bryce: https://huggingface.co/rhasspy/piper-voices
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'vite';

const root = resolve(import.meta.dirname, '..');
const clipDir = join(root, 'audio-src', 'narration');
const outDir = join(root, 'public', 'audio', 'narration');
const python = process.env.PIPER_PYTHON ?? 'python3';
const voices = process.env.PIPER_VOICES;
if (!voices) {
  console.error('Set PIPER_VOICES to a folder with the Piper .onnx voices.');
  process.exit(1);
}

const ROBOT = 'asetrate=22050*1.04,aresample=22050,atempo=0.9615,chorus=0.7:0.9:40:0.25:0.3:1.8';
const pitch = (f) => `asetrate=22050*${f},aresample=22050,atempo=${(1 / f).toFixed(4)}`;
/** Speaker key -> Piper voice and an ffmpeg filter that gives it its own character. */
const VOICES = {
  valkyrie: { model: 'en_US-kristin-medium', filter: ROBOT },
  maya: { model: 'en_US-ljspeech-medium', filter: 'anull' },
  rosa: { model: 'en_US-ljspeech-medium', filter: pitch(0.94) },
  june: { model: 'en_US-ljspeech-medium', filter: pitch(1.06) },
  dale: { model: 'en_US-norman-medium', filter: 'anull' },
  theo: { model: 'en_US-john-medium', filter: 'anull' },
  omar: { model: 'en_US-bryce-medium', filter: 'anull' },
};

const SAMPLE_RATE = 22050;
/** Silence around each clip in a pack, so a slightly early or late start never clips a word. */
const PAD_BEFORE = 0.15;
const PAD_AFTER = 0.3;
/** Roughly how much speech goes in one pack (seconds). */
const PACK_SECONDS = 75;

const server = await createServer({ root, logLevel: 'error', server: { middlewareMode: true }, appType: 'custom' });
const { collectSpoken } = await server.ssrLoadModule('/src/guide/collect-lines.ts');
const { lineKey, speakable } = await server.ssrLoadModule('/src/guide/narration.ts');
await server.close();

const lines = collectSpoken();
const wanted = new Map();
for (const { text, speaker } of lines) {
  const voice = speaker ?? 'valkyrie';
  if (!VOICES[voice]) throw new Error(`No voice for speaker ${voice}`);
  wanted.set(lineKey(text, speaker), { text: speakable(text), voice });
}
console.log(`${lines.length} lines, ${wanted.size} unique clips`);

mkdirSync(clipDir, { recursive: true });
const todo = [...wanted].filter(([key]) => !existsSync(join(clipDir, `${key}.mp3`)));
console.log(`${todo.length} to record`);

for (const [voice, cfg] of Object.entries(VOICES)) {
  const batch = todo.filter(([, w]) => w.voice === voice).map(([key, w]) => ({ key, text: w.text }));
  if (!batch.length) continue;
  console.log(`${voice}: ${batch.length}`);
  const tmp = mkdtempSync(join(tmpdir(), 'narration-'));
  const res = spawnSync(python, ['-I', join(root, 'scripts', 'narrate.py'), join(voices, `${cfg.model}.onnx`), tmp], {
    input: JSON.stringify(batch),
    stdio: ['pipe', 'inherit', 'inherit'],
  });
  if (res.status !== 0) process.exit(res.status ?? 1);
  for (const { key } of batch) {
    execFileSync('ffmpeg', [
      '-loglevel',
      'error',
      '-y',
      '-i',
      join(tmp, `${key}.wav`),
      '-af',
      `${cfg.filter},loudnorm=I=-18:TP=-2`,
      '-ac',
      '1',
      '-ar',
      String(SAMPLE_RATE),
      '-b:a',
      '48k',
      join(clipDir, `${key}.mp3`),
    ]);
  }
  rmSync(tmp, { recursive: true, force: true });
}

// Drop clips for lines that no longer exist.
for (const file of readdirSync(clipDir)) {
  if (file.endsWith('.mp3') && !wanted.has(file.slice(0, -4))) unlinkSync(join(clipDir, file));
}

// --- packs ---
const pcm = (file) =>
  execFileSync(
    'ffmpeg',
    ['-loglevel', 'error', '-i', file, '-f', 's16le', '-ac', '1', '-ar', String(SAMPLE_RATE), '-'],
    {
      maxBuffer: 1 << 28,
    },
  );
const silence = (sec) => Buffer.alloc(Math.round(sec * SAMPLE_RATE) * 2);

const keys = [...wanted.keys()].sort();
const clips = {};
const packs = [];
let chunk = [];
let chunkSeconds = 0;
let pos = 0;
const flush = () => {
  if (!chunk.length) return;
  const name = `pack-${String(packs.length).padStart(2, '0')}.mp3`;
  execFileSync(
    'ffmpeg',
    [
      '-loglevel',
      'error',
      '-y',
      '-f',
      's16le',
      '-ar',
      String(SAMPLE_RATE),
      '-ac',
      '1',
      '-i',
      '-',
      '-b:a',
      '48k',
      join(outDir, name),
    ],
    { input: Buffer.concat(chunk) },
  );
  packs.push(name);
  chunk = [];
  chunkSeconds = 0;
  pos = 0;
};
mkdirSync(outDir, { recursive: true });
for (const file of readdirSync(outDir)) if (file.endsWith('.mp3')) unlinkSync(join(outDir, file));
for (const key of keys) {
  const data = pcm(join(clipDir, `${key}.mp3`));
  const seconds = data.length / 2 / SAMPLE_RATE;
  if (chunkSeconds > 0 && chunkSeconds + seconds > PACK_SECONDS) flush();
  const start = pos + PAD_BEFORE;
  chunk.push(silence(PAD_BEFORE), data, silence(PAD_AFTER));
  pos += PAD_BEFORE + seconds + PAD_AFTER;
  chunkSeconds += seconds;
  // [pack, start, length]: the length runs a little into the trailing silence.
  clips[key] = [packs.length, Math.round(start * 1000) / 1000, Math.round((seconds + 0.12) * 1000) / 1000];
}
flush();

writeFileSync(
  join(outDir, 'manifest.json'),
  `${JSON.stringify({ voices: Object.fromEntries(Object.entries(VOICES).map(([k, v]) => [k, v.model])), packs, clips })}\n`,
);
console.log(`manifest: ${Object.keys(clips).length} clips in ${packs.length} packs`);
