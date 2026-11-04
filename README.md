# Service Bay VR

An educational WebXR game that teaches automotive service procedures to high school and vocational auto-shop students. Work in a low-poly service bay with Valkyrie, the shop's robot drone, who guides you, spotlights parts and explains the "why" behind every step.

Runs in a browser. No install, no app store:

- **Meta Quest 2 / 3 / 3S**: open the game's web address in the Quest browser and press **Enter VR**.
- **PC VR** (SteamVR, Quest Link): open it in Chrome or Edge on the PC.
- **Apple Vision Pro**: Safari, with look-and-pinch or hand input.
- **No headset**: play on a laptop, Chromebook or phone with mouse, keyboard or touch.

## How a lesson works

Every lesson has three runs:

| Run | What happens |
| --- | --- |
| **Learn** | Valkyrie guides every step, highlights the tool and the part, and explains why. |
| **Practice** | You do it yourself. Ask for a hint any time; hints are counted. |
| **Test** | No hints. Pass with **80% and zero safety errors** to earn a certificate. |

Mistakes play a short, non-graphic replay of what would happen in a real shop (the car settling off a lift, an oil spill, a stripped thread), then Valkyrie explains and you try again. The player's view never moves during a replay, which keeps VR comfortable.

Every run produces a report card (score, safety errors, hints, time, each mistake with its explanation). Report cards and certificates can be downloaded from **Records & certificates** on the title screen.

## Lessons

| Lesson | Status |
| --- | --- |
| Oil & Filter Change | Available |
| Tire Service (pressure, tread, wear patterns, rotation, star-pattern torque) | Available |
| Brake Inspection & Pads (wheel chocks, floor jack and jack stands, pad and rotor measurements, caliper on an S-hook, pedal pump) | Available |
| Battery & Jump-Start (voltage and load tests, then clean, replace, or jump-start with cables or a jump pack) | Available |
| Multi-Point Inspection (12 checks with 2 to 4 random faults; tag each part green, yellow or red) | Available |
| OBD-II Diagnostics (scan tool with its own screen; random fault: loose gas cap, misfire with a coil swap test, vacuum leak from fuel trims, or a stuck-open thermostat) | Available |
| Spark Plugs & Ignition (cold check, blow out the well, read the old plug, gap, start by hand, torque) | Available |
| EV High-Voltage Safety (spot the orange parts, barrier, glove air test, lockbox, 12 V off, service disconnect, wait, live-dead-live) | Available |

Three vehicles:
- the **Aster S4** sedan;
- the **Talus 1500** crew-cab pickup (6-lug wheels, a frame you lift on with truck adapters, its own specs);
- the **Wren EV** hatchback (a flat high-voltage battery pack, orange cables, a frunk and a 12-volt battery).

Each lesson runs on every vehicle it suits. Gas-engine lessons skip the EV, the EV safety lesson is EV-only, and the EV gets its own versions of tires, brakes, battery (12 V only) and inspection. Pick the vehicle on the lesson card for Learn and Practice. A Test picks one at random, so students learn the procedure, not one car.

Whenever an engine runs indoors in the diagnostics and spark plug lessons, the shop's exhaust extraction hose goes on the tailpipe first; skipping it is a safety error.

## Shop mode

Shop mode turns the lessons into a career at your own repair shop. A shift has 3 to 5 customers:

1. **The counter.** A customer walks up and describes a problem in their own voice. Ask questions (some help, some are small talk), then pick the service that fits. A wrong pick costs a little reputation.
2. **The estimate.** It is priced like a real repair order: book labor hours at a $120/hr shop rate, parts marked up 40% from cost, shop supplies and sales tax. The customer approves it, and their car drives in through the bay door.
3. **The job.** It runs as a Practice lesson on that car, with the customer's scenario (for example, the OBD-II fault they described). Hints still work, but each one costs the shop $10. A safety error stops the job with no charge.
4. **The courtesy check.** Some cars get one extra look at the end, at the wipers or the tires. The part may really be worn, or it may be fine. Recommend real problems and the customer may approve the extra work. Flag a good part and Valkyrie calls it out as an upsell.
5. **The bill.** Pay, tips for quick and clean work, and reputation changes are shown after every job. Mistakes that would leave a defect (a drain plug under-torqued, lug nuts out of spec) bring the car back next shift as an unpaid **comeback**.

The end-of-shift **day sheet** totals income, parts, hints, tips and reputation. Reputation unlocks new work in tiers: sedan basics first, then brakes and battery, the pickup, diagnostics and spark plugs, and finally the Wren EV. Money buys upgrades that change the work: a cordless impact wrench, a digital torque wrench (shows IN SPEC), a pro scan tool (repair tips for each code), a digital battery analyzer (state of health) and a wheel balancer (lets the shop sell tires).

> Specs in the game are typical example values for fictional vehicles. Real service work always follows the manufacturer's service information.

## Teacher dashboard

Teachers get a web dashboard at **`/dashboard/`** on the same site (for example `https://cyb3rw0lf-3d.github.io/neptune3marlin/dashboard/`). There are no accounts and no passwords:

1. **Create a class** on the dashboard. You get a 6-character **class code** for students and a **private teacher link**. Bookmark the link: it is the only way into the class.
2. **Students join** from the game's main menu (**Join a class**) with the class code and a nickname. For a locked-down class, add a **roster** and turn on *Roster only*: each student then gets a personal 8-character code.
3. Every finished run uploads by itself. Results played offline wait on the device and upload when the network is back.

The dashboard shows:
- a **class grid** (students by lessons, with Learn, best Practice and best Test, and each student's runs and mistakes);
- the **most common mistakes** across the class, with safety errors flagged;
- who is **playing now**;
- **Shop mode** results.

**Settings** open or lock lessons, require Learn before Test, turn Shop mode on, off or "after passing a Test", and choose how shared headsets work: keep each student on the device, or **sign in every session** so the headset forgets the student when they exit. **Exports**: a grade summary CSV, every run as CSV, Shop mode CSV, and a zip of certificate PNGs.

**Privacy:**
- The server stores only class names, student nicknames and game results.
- Teacher keys and student tokens are stored only as SHA-256 hashes.
- Roster codes are shown only to the teacher.
- Deleting a class removes everything in it right away, and classes with no activity for a year are deleted automatically.

### Setting up the class server (Cloudflare, free plan)

The dashboard needs a small API: a Cloudflare Worker with a D1 database, in [`server/`](server). Until it is set up, the game and dashboard work as before and class features stay hidden.

1. Sign up at [dash.cloudflare.com](https://dash.cloudflare.com) (the free plan is plenty for a school).
2. Create an API token: **My Profile → API Tokens → Create Token → Edit Cloudflare Workers** template, then **add** the permission **Account → D1 → Edit**. Copy the token.
3. Find your **Account ID** on the right side of the Workers & Pages overview page.
4. In this GitHub repository: **Settings → Secrets and variables → Actions → New repository secret**. Add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
5. Run the **Deploy the class API** workflow (**Actions** tab, or push to `main`). It creates the database, applies the migrations and deploys the Worker. The log shows its address, like `https://service-bay-vr-api.<your-subdomain>.workers.dev`.
6. Add that address as a repository **variable** (same page, **Variables** tab) named `API_URL`, then re-run **Deploy to GitHub Pages**.

If the game is hosted somewhere other than `https://cyb3rw0lf-3d.github.io`, add that origin to `ALLOWED_ORIGINS` in [`server/wrangler.jsonc`](server/wrangler.jsonc).

## Controls

- **VR controllers**: point and pull the trigger to click or use. Grip grabs a tool or puts it back. Twist your wrist while holding the trigger to turn wrenches (or switch on *Hold trigger* in Settings). Hold the trigger on the floor jack handle and move your hand up and down to pump it. Crouch for work near the floor. Push the left stick forward to aim a teleport arc, then let go. The right stick snap turns. With the torque wrench in hand, push the stick up or down to set it.
- **Hands**: pinch to click, grab and use. Point at the blue floor rings to move.
- **Mouse and keyboard**: click to grab or use, and hold the click for wrench and hold jobs. Click the jack handle repeatedly (or drag up and down on it) to pump it. Drag empty space to look, WASD to walk, and click the blue floor rings to jump to work spots. Work spots near the floor crouch for you, and **C** crouches anywhere. The mouse wheel sets the torque wrench. **Q** puts the tool back, **H** gives a hint, **Esc** pauses.
- **Touch**: tap to use, drag to look, tap the blue rings to move.

Like a real shop, you can only work on what you can reach: solid things (the car body, the lift, the cart) block your pointer, so walk to the part or crouch down to it.

Settings include US or metric units, seated play, height calibration, snap-turn angle and volume.

**Accessibility** settings:
- Text size from small to extra large. Extra large also enlarges the floating panels in VR.
- A color-blind-safe palette (Okabe-Ito colors) or a high-contrast palette. Inspection tags and dialogs use shapes and icons as well as colors.
- One-handed play: the main-hand stick both teleports and snap turns. One stick does both automatically whenever only one controller is connected.
- Reduced motion for mistake replays.

## Hosting on GitHub Pages

The `Deploy to GitHub Pages` workflow publishes `main` automatically. Turn it on once in **Settings → Pages → Build and deployment → Source: GitHub Actions**. The game is then at `https://<owner>.github.io/<repo>/`. The build uses relative paths, so renaming the repo is fine.

WebXR needs HTTPS, which GitHub Pages provides.

## Development

Requires Node 22.12 or newer.

```bash
npm install
npm run dev        # local dev server
npm run check      # lint, type-check, unit tests
npm run e2e        # Playwright end-to-end tests (flat screen + emulated Quest 3 via IWER)
npm run build      # production build in dist/
```

The class API has its own package in `server/`:

```bash
npm ci --prefix server
npm --prefix server test          # Workers-runtime tests against a local D1 database
npm --prefix server run dev:e2e   # the API on http://127.0.0.1:8787 with a local database
VITE_API_URL=http://127.0.0.1:8787 npm run dev   # the game and dashboard, talking to it
```

To test VR on a headset during development, the page must be served over HTTPS (for example, through a tunnel). Otherwise use the deployed Pages site.

### Project layout

```
src/
  core/         settings, saves (per-device student profiles), units, tweens
  lessons/      engine (pure lesson state machine + scoring), content (one file per lesson),
                session (runs a lesson in the world), consequences (mistake replays)
  shop/         Shop mode: price book, jobs, customers, pay and reputation, shifts, comebacks
                (all pure and unit-tested), plus the controller that runs a shift
  net/          class API contract (shared with the server), join and sync client, offline outbox,
                class locks
  world/        garage, two-post lift, tool cart, floor jack and stands, jump pack, scan tool,
                exhaust reel, EV safety kit, service counter and customers, low-poly helpers
  vehicles/     shared vehicle model, sedan, pickup and EV bodies, part layouts, example specs
  interaction/  tool grabbing, gestures, targets and the interaction registry
  input/        WebXR controllers / hands / transient pointers, mouse / keyboard / touch
  locomotion/   teleport, snap turn, seated height, desktop movement
  guide/        Valkyrie the drone and narration
  ui/           in-world panels: menus, clipboard, captions, dialogs, records
tests/unit      Vitest: lesson engine, scoring, units, saves, gestures, content validation, Shop economy
tests/e2e       Playwright: every lesson on every vehicle (with a check that every part can be
                reached from a work spot), Shop shifts, class join and sync against a local API,
                the dashboard, real mouse input, VR emulation, render budget
dashboard/      the teacher dashboard page (second Vite entry)
server/         the class API: Cloudflare Worker, D1 migrations, Workers-runtime tests
scripts/        narration generator
audio-src/      single narration clips (the game loads packs built from them)
```

Lessons are data: each step names the tool, the target part, the gesture and any spec, plus the mistakes that can happen and what they would cause. Mistake codes (like `safety.lift.not_locked`) are stable, so report cards and the future dashboard can group them.

### Narration

Valkyrie's and the customers' lines are pre-recorded so every headset hears the same voices (the Quest browser's own speech synthesis is unreliable). After changing any lesson, job or customer text, regenerate the clips:

```bash
python3 -m venv .venv && .venv/bin/pip install piper-tts
# download the kristin, ljspeech, norman, john and bryce medium voices (.onnx and .onnx.json)
# from huggingface.co/rhasspy/piper-voices into one folder
PIPER_PYTHON=.venv/bin/python PIPER_VOICES=path/to/voices npm run narration
```

Single clips are kept in `audio-src/narration`, and only new lines are recorded. The script then packs every clip into about 75 audio files in `public/audio/narration`, with a manifest of where each line starts. The game plays slices of the packs, which keeps hosting simple. A unit test fails if any line is missing a clip. Lines without a clip fall back to the browser's speech synthesis, and captions are always shown.

## Credits

- Voices: [Piper](https://github.com/OHF-Voice/piper1-gpl), used only at build time, with these voices from [piper-voices](https://huggingface.co/rhasspy/piper-voices):
  - Valkyrie: *Kristin*, trained from scratch on public-domain LibriVox recordings ([model card](https://huggingface.co/rhasspy/piper-voices/tree/main/en/en_US/kristin/medium)).
  - Customers: *LJSpeech* (public-domain LJ Speech dataset), and *Norman*, *John* and *Bryce* (public domain; [model cards](https://huggingface.co/rhasspy/piper-voices/tree/main/en/en_US)).
- Font: [Atkinson Hyperlegible](https://brailleinstitute.org/freefont) by the Braille Institute (SIL Open Font License).
- 3D engine: [three.js](https://threejs.org) (MIT). VR emulation in tests: [IWER](https://github.com/meta-quest/immersive-web-emulation-runtime) (MIT).
- All 3D models and sound effects are generated in code.

## License

MIT, see [LICENSE](LICENSE).
