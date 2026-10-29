// Pre-records Valkyrie's narration with Piper TTS so every headset hears the same voice.
//
//   PIPER_PYTHON=/path/to/venv/bin/python PIPER_VOICE=/path/to/en_US-kristin-medium.onnx \
//     node scripts/gen-narration.mjs
//
// Needs ffmpeg. Existing clips are kept, so only new or changed lines are recorded.
// The voice used (Kristin, medium) was trained from scratch on public-domain LibriVox
// recordings: https://huggingface.co/rhasspy/piper-voices/tree/main/en/en_US/kristin
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'vite';

const root = resolve(import.meta.dirname, '..');
const outDir = join(root, 'public', 'audio', 'narration');
const python = process.env.PIPER_PYTHON ?? 'python3';
const voice = process.env.PIPER_VOICE;
if (!voice) {
  console.error('Set PIPER_VOICE to the path of a Piper .onnx voice.');
  process.exit(1);
}

const server = await createServer({ root, logLevel: 'error', server: { middlewareMode: true }, appType: 'custom' });
const { collectLines } = await server.ssrLoadModule('/src/guide/collect-lines.ts');
const { lineKey, speakable } = await server.ssrLoadModule('/src/guide/narration.ts');
await server.close();

const lines = collectLines();
const wanted = new Map(lines.map((text) => [lineKey(text), speakable(text)]));
console.log(`${lines.length} lines, ${wanted.size} unique clips`);

execFileSync('mkdir', ['-p', outDir]);
const todo = [...wanted]
  .filter(([key]) => !existsSync(join(outDir, `${key}.mp3`)))
  .map(([key, text]) => ({ key, text }));
console.log(`${todo.length} to record`);

if (todo.length) {
  const tmp = mkdtempSync(join(tmpdir(), 'narration-'));
  const res = spawnSync(python, ['-I', join(root, 'scripts', 'narrate.py'), voice, tmp], {
    input: JSON.stringify(todo),
    stdio: ['pipe', 'inherit', 'inherit'],
  });
  if (res.status !== 0) process.exit(res.status ?? 1);
  for (const { key } of todo) {
    // A light pitch lift and chorus give Valkyrie a friendly robot timbre.
    execFileSync('ffmpeg', [
      '-loglevel',
      'error',
      '-y',
      '-i',
      join(tmp, `${key}.wav`),
      '-af',
      'asetrate=22050*1.04,aresample=22050,atempo=0.9615,chorus=0.7:0.9:40:0.25:0.3:1.8,loudnorm=I=-18:TP=-2',
      '-ac',
      '1',
      '-ar',
      '22050',
      '-b:a',
      '32k',
      join(outDir, `${key}.mp3`),
    ]);
  }
  rmSync(tmp, { recursive: true, force: true });
}

// Drop clips for lines that no longer exist.
for (const file of readdirSync(outDir)) {
  if (file.endsWith('.mp3') && !wanted.has(file.slice(0, -4))) unlinkSync(join(outDir, file));
}
const clips = Object.fromEntries([...wanted.keys()].sort().map((key) => [key, `${key}.mp3`]));
writeFileSync(
  join(outDir, 'manifest.json'),
  `${JSON.stringify({ voice: 'piper en_US-kristin-medium', clips }, null, 0)}\n`,
);
console.log(`manifest: ${Object.keys(clips).length} clips`);
