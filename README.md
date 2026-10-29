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
| OBD-II Diagnostics | Stage 3 |
| Spark Plugs & Ignition | Stage 3 |
| EV High-Voltage Safety (awareness + de-energize procedure) | Stage 3 |

Every available lesson runs on two vehicles: the **Aster S4** sedan and the **Talus 1500** crew-cab pickup (6-lug wheels, a frame you lift on with truck adapters, its own specs). Pick the vehicle on the lesson card for Learn and Practice. A Test picks one at random, so students learn the procedure, not one car.

Later stages add the Wren EV, then a **Shop mode** career (customers, diagnosis, quotes, money, reputation and upgrades), then an online **teacher dashboard**.

> Specs in the game are typical example values for fictional vehicles. Real service work always follows the manufacturer's service information.

## Controls

- **VR controllers**: point and pull the trigger to click or use. Grip grabs a tool or puts it back. Twist your wrist while holding the trigger to turn wrenches (or switch on *Hold trigger* in Settings). Hold the trigger on the floor jack handle and move your hand up and down to pump it. Crouch for work near the floor. Push the left stick forward to aim a teleport arc, then let go. The right stick snap turns. With the torque wrench in hand, push the stick up or down to set it.
- **Hands**: pinch to click, grab and use. Point at the blue floor rings to move.
- **Mouse and keyboard**: click to grab or use, and hold the click for wrench and hold jobs. Click the jack handle repeatedly (or drag up and down on it) to pump it. Drag empty space to look, WASD to walk, and click the blue floor rings to jump to work spots. Work spots near the floor crouch for you, and **C** crouches anywhere. The mouse wheel sets the torque wrench. **Q** puts the tool back, **H** gives a hint, **Esc** pauses.
- **Touch**: tap to use, drag to look, tap the blue rings to move.

Like a real shop, you can only work on what you can reach: solid things (the car body, the lift, the cart) block your pointer, so walk to the part or crouch down to it.

Settings include US or metric units, seated play, height calibration, caption size, snap-turn angle, reduced motion and volume.

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

To test VR on a headset during development, the page must be served over HTTPS (for example, through a tunnel). Otherwise use the deployed Pages site.

### Project layout

```
src/
  core/         settings, saves (per-device student profiles), units, tweens
  lessons/      engine (pure lesson state machine + scoring), content (one file per lesson),
                session (runs a lesson in the world), consequences (mistake replays)
  world/        garage, two-post lift, tool cart, floor jack and stands, jump pack, low-poly helpers
  vehicles/     shared vehicle model, sedan and pickup bodies, part layouts, example specs
  interaction/  tool grabbing, gestures, targets and the interaction registry
  input/        WebXR controllers / hands / transient pointers, mouse / keyboard / touch
  locomotion/   teleport, snap turn, seated height, desktop movement
  guide/        Valkyrie the drone and narration
  ui/           in-world panels: menus, clipboard, captions, dialogs, records
tests/unit      Vitest: lesson engine, scoring, units, saves, gestures, content validation
tests/e2e       Playwright: every lesson on both vehicles (with a check that every part can be
                reached from a work spot), real mouse input, VR emulation, render budget
scripts/        narration generator
```

Lessons are data: each step names the tool, the target part, the gesture and any spec, plus the mistakes that can happen and what they would cause. Mistake codes (like `safety.lift.not_locked`) are stable, so report cards and the future dashboard can group them.

### Narration

Valkyrie's lines are pre-recorded so every headset hears the same voice (the Quest browser's own speech synthesis is unreliable). After changing any lesson text, regenerate the clips:

```bash
python3 -m venv .venv && .venv/bin/pip install piper-tts
# download en_US-kristin-medium.onnx and .onnx.json from huggingface.co/rhasspy/piper-voices
PIPER_PYTHON=.venv/bin/python PIPER_VOICE=path/to/en_US-kristin-medium.onnx npm run narration
```

A unit test fails if any scripted line is missing a clip. Lines without a clip fall back to the browser's speech synthesis, and captions are always shown.

## Credits

- Narration voice: [Piper](https://github.com/OHF-Voice/piper1-gpl) with the *Kristin* voice, trained from scratch on public-domain LibriVox recordings ([model card](https://huggingface.co/rhasspy/piper-voices/tree/main/en/en_US/kristin/medium)). Piper is only used at build time.
- Font: [Atkinson Hyperlegible](https://brailleinstitute.org/freefont) by the Braille Institute (SIL Open Font License).
- 3D engine: [three.js](https://threejs.org) (MIT). VR emulation in tests: [IWER](https://github.com/meta-quest/immersive-web-emulation-runtime) (MIT).
- All 3D models and sound effects are generated in code.

## License

MIT, see [LICENSE](LICENSE).
