import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/atkinson-hyperlegible/700.css';
import './style.css';
import { App } from './app';
import { installTestHooks } from './debug/test-hooks';
import { certificatePng, download, reportHtml, slug } from './ui/records';

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} missing`);
  return el;
}

async function main(): Promise<void> {
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load('400 32px "Atkinson Hyperlegible"'),
        document.fonts.load('700 32px "Atkinson Hyperlegible"'),
      ]),
      new Promise((r) => setTimeout(r, 2500)),
    ]);
  } catch {
    // Panels fall back to system fonts.
  }

  const app = new App($('stage'));
  const overlay = $('overlay');
  const hudbar = $('hudbar');
  const vrButton = $('enter-vr') as HTMLButtonElement;
  const note = $('vr-note');

  app.onScreenChange = (screen) => {
    const inGame = screen !== 'title';
    overlay.hidden = inGame;
    hudbar.hidden = !inGame || app.renderer.xr.isPresenting;
  };

  // Offer VR only where the browser can actually start an immersive session.
  const xr = navigator.xr;
  if (xr) {
    xr.isSessionSupported('immersive-vr')
      .then((ok) => {
        vrButton.hidden = !ok;
        if (!ok) note.textContent = 'No VR headset found. Open this page in your headset browser to play in VR.';
      })
      .catch(() => {
        note.textContent = 'VR is blocked on this page. Open the game directly in your headset browser to play in VR.';
      });
  } else {
    note.textContent = window.isSecureContext
      ? 'This browser has no WebXR. Play on screen, or open the page in a VR headset browser.'
      : 'VR needs a secure (https) page.';
  }

  vrButton.addEventListener('click', async () => {
    vrButton.disabled = true;
    const ok = await app.enterVR();
    vrButton.disabled = false;
    if (!ok) note.textContent = 'Could not start VR. Check that your headset is connected and try again.';
  });
  $('play-screen').addEventListener('click', () => app.begin());
  $('exit-screen').addEventListener('click', () => {
    if (app.session.active) app.session.quit();
    app.screen = 'title';
    app.menus.close();
    app.onScreenChange('title');
  });

  // Records & certificates (2D overlay).
  const records = $('records');
  const studentSelect = $('records-student') as HTMLSelectElement;
  const list = $('records-list');
  const renderRecords = () => {
    const profiles = app.save.data.profiles;
    studentSelect.replaceChildren();
    for (const p of profiles) {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      opt.selected = p.id === (app.save.data.activeProfileId ?? profiles[0]?.id);
      studentSelect.appendChild(opt);
    }
    const profile = profiles.find((p) => p.id === studentSelect.value) ?? profiles[0];
    list.replaceChildren();
    if (!profile || profile.runs.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'empty';
      empty.textContent = profile
        ? 'No finished runs yet.'
        : 'No students on this device yet. Start the game to add one.';
      list.appendChild(empty);
      return;
    }
    for (const run of [...profile.runs].reverse()) {
      const row = document.createElement('div');
      row.className = 'run';
      const info = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = `${run.lessonTitle} · ${run.mode[0]?.toUpperCase()}${run.mode.slice(1)}`;
      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.textContent = `${new Date(run.date).toLocaleString()} · ${run.vehicleName}`;
      info.append(title, meta);
      const score = document.createElement('span');
      score.className = `score ${run.mode === 'test' ? (run.passed ? 'pass' : 'fail') : ''}`;
      score.textContent =
        run.mode === 'learn'
          ? 'Done'
          : `${run.score}%${run.mode === 'test' ? (run.passed ? ' · passed' : ' · not passed') : ''}`;
      const buttons = document.createElement('div');
      buttons.className = 'buttons';
      const rep = document.createElement('button');
      rep.className = 'btn small';
      rep.type = 'button';
      rep.textContent = 'Report card';
      rep.addEventListener('click', () =>
        saveOrPreview(
          `report-${slug(profile.name)}-${slug(run.lessonTitle)}-${run.mode}.html`,
          reportHtml(profile, run),
        ),
      );
      buttons.appendChild(rep);
      if (run.mode === 'test' && run.passed) {
        const cert = document.createElement('button');
        cert.className = 'btn small primary';
        cert.type = 'button';
        cert.textContent = 'Certificate';
        cert.addEventListener('click', async () => {
          const png = await certificatePng(profile, run.lessonTitle, run.score, run.date);
          if (png) saveOrPreview(`certificate-${slug(profile.name)}-${slug(run.lessonTitle)}.png`, png);
        });
        buttons.appendChild(cert);
      }
      row.append(info, score, buttons);
      list.appendChild(row);
    }
  };
  // Embedded pages (such as a shared preview) can't download files, so show them instead.
  const preview = $('preview');
  const previewBody = $('preview-body');
  const framed = (() => {
    try {
      return window.self !== window.top;
    } catch {
      return true;
    }
  })();
  const saveOrPreview = (name: string, data: Blob | string) => {
    if (!framed) {
      download(name, data);
      return;
    }
    previewBody.replaceChildren();
    if (typeof data === 'string') {
      const frame = document.createElement('iframe');
      frame.title = 'Report card';
      frame.srcdoc = data;
      previewBody.appendChild(frame);
    } else {
      const img = document.createElement('img');
      img.alt = 'Certificate of completion';
      img.src = URL.createObjectURL(data);
      previewBody.appendChild(img);
    }
    preview.hidden = false;
  };
  $('close-preview').addEventListener('click', () => {
    preview.hidden = true;
  });
  studentSelect.addEventListener('change', renderRecords);
  $('open-records').addEventListener('click', () => {
    renderRecords();
    records.hidden = false;
  });
  $('close-records').addEventListener('click', () => {
    records.hidden = true;
  });
  app.onRecordsChanged = () => {
    if (!records.hidden) renderRecords();
  };

  if (new URLSearchParams(location.search).has('test')) installTestHooks(app);
}

void main();
