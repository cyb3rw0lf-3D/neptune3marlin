import type { Profile, RunRecord } from '../core/save';
import { FONT } from './panel';

const MODE_NAME = { learn: 'Learn', practice: 'Practice', test: 'Test' } as const;

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );
}

export function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** A printable, self-contained HTML report card for one run. */
export function reportHtml(profile: Profile, run: RunRecord): string {
  const mistakes = run.mistakes.length
    ? run.mistakes
        .map(
          (m) =>
            `<li class="${m.critical ? 'crit' : ''}"><strong>${escapeHtml(m.label)}</strong>${m.count > 1 ? ` (×${m.count})` : ''}${
              run.mode === 'learn' ? '' : ` <span class="pen">−${m.penalty}</span>`
            }<br><span>${escapeHtml(m.explain)}</span></li>`,
        )
        .join('')
    : '<li>No mistakes. Clean job!</li>';
  const verdict =
    run.mode === 'test'
      ? run.passed
        ? 'PASSED'
        : 'NOT PASSED'
      : run.mode === 'practice'
        ? 'Practice run'
        : 'Learn run';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Report card: ${escapeHtml(run.lessonTitle)}</title>
<style>
body{font-family:Arial,Helvetica,sans-serif;max-width:760px;margin:24px auto;padding:0 16px;color:#111;background:#fff}
h1{margin:0 0 4px;font-size:26px}.sub{color:#555;margin:0 0 16px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin:16px 0}
.card{border:1px solid #ccc;border-radius:8px;padding:10px}.card b{display:block;font-size:22px}
li{margin:0 0 10px}li span{color:#444}.crit strong{color:#b00020}.pen{color:#b00020;font-weight:bold}
.verdict{font-size:20px;font-weight:bold;color:${run.passed ? '#1b7a3a' : run.mode === 'test' ? '#b00020' : '#1f5fa8'}}
footer{margin-top:24px;color:#666;font-size:13px}
</style></head><body>
<h1>Service Bay VR: Report card</h1>
<p class="sub">${escapeHtml(profile.name)} · ${escapeHtml(run.lessonTitle)} · ${MODE_NAME[run.mode]} · ${escapeHtml(run.vehicleName)} · ${new Date(run.date).toLocaleString()}</p>
<p class="verdict">${verdict}</p>
<div class="grid">
<div class="card">Score<b>${run.mode === 'learn' ? '—' : `${run.score}%`}</b></div>
<div class="card">Safety errors<b>${run.criticalCount}</b></div>
<div class="card">Hints used<b>${run.hints}</b></div>
<div class="card">Time<b>${formatDuration(run.durationSec)}</b></div>
<div class="card">Steps<b>${run.stepsDone}/${run.stepsTotal}</b></div>
</div>
<h2>Mistakes and what they would cause</h2><ul>${mistakes}</ul>
<footer>Pass rule: a Test score of 80% or more with zero safety errors. Specs in the game are typical examples; real work always follows the manufacturer's service information.</footer>
</body></html>`;
}

/** Draws a completion certificate and returns it as a PNG blob. */
export async function certificatePng(
  profile: Profile,
  lessonTitle: string,
  score: number,
  date: string,
): Promise<Blob | null> {
  const c = document.createElement('canvas');
  c.width = 1600;
  c.height = 1130;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  try {
    await document.fonts?.load(`700 64px "Atkinson Hyperlegible"`);
  } catch {
    // fall back to system fonts
  }
  ctx.fillStyle = '#fbfaf5';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.strokeStyle = '#2f4858';
  ctx.lineWidth = 18;
  ctx.strokeRect(40, 40, c.width - 80, c.height - 80);
  ctx.strokeStyle = '#1fa6a6';
  ctx.lineWidth = 4;
  ctx.strokeRect(76, 76, c.width - 152, c.height - 152);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#2f4858';
  ctx.font = `700 40px ${FONT}`;
  ctx.fillText('SERVICE BAY VR · TRAINING CENTER', c.width / 2, 200);
  ctx.fillStyle = '#111';
  ctx.font = `700 92px ${FONT}`;
  ctx.fillText('Certificate of Completion', c.width / 2, 340);
  ctx.font = `400 40px ${FONT}`;
  ctx.fillStyle = '#444';
  ctx.fillText('This certifies that', c.width / 2, 450);
  ctx.font = `700 96px ${FONT}`;
  ctx.fillStyle = '#1f5fa8';
  ctx.fillText(profile.name, c.width / 2, 580, c.width - 300);
  ctx.font = `400 40px ${FONT}`;
  ctx.fillStyle = '#444';
  ctx.fillText('passed the virtual service procedure test for', c.width / 2, 680);
  ctx.font = `700 64px ${FONT}`;
  ctx.fillStyle = '#111';
  ctx.fillText(lessonTitle, c.width / 2, 780, c.width - 300);
  ctx.font = `400 36px ${FONT}`;
  ctx.fillStyle = '#444';
  ctx.fillText(`Score ${score}% · zero safety errors · ${new Date(date).toLocaleDateString()}`, c.width / 2, 870);
  ctx.font = `400 26px ${FONT}`;
  ctx.fillStyle = '#777';
  ctx.fillText('Signed: Valkyrie, Shop Drone and Safety Officer', c.width / 2, 990);
  return new Promise((resolve) => c.toBlob((b) => resolve(b), 'image/png'));
}

export function download(name: string, data: Blob | string, type = 'text/html'): void {
  const blob = typeof data === 'string' ? new Blob([data], { type }) : data;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
