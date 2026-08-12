# TrackStart — Block Start Reaction Timer

A phone web app that measures a sprinter's reaction time out of the blocks using
the phone's **camera**, **speaker**, and **motion detection**. It runs the full
starter's cadence — *"Runner, take your mark" → "Set" → gun* — with a randomized
gun delay, detects movement before the gun as a **false start**, and times the
first movement after the gun.

Because it's built as a Progressive Web App (PWA), it installs and runs on **both
iPhone and Android** straight from the browser — no App Store, no build tools.

---

## How it works

When you press **START**, the app:

1. Speaks **"Runner, take your mark"** and shows a **10-second countdown**
   (adjustable in Settings).
2. Speaks **"Set"**.
3. **2.0 s after "Set"**, motion detection **arms**. Any body movement from here
   until the gun is flagged as a **FALSE START**.
4. Fires a **gunshot** at a **random time between 2.2 s and 3.2 s** after "Set"
   (so the athlete can't anticipate it).
5. After the gun, it watches the camera and records the **time between the gun
   and the athlete's first movement** — shown in large print on screen.
6. Stores every result, tracks the **fastest time** (shown top-left), and keeps a
   session **history**. Pressing **START** again resets for the next start.

Reaction times **under 0.100 s** are optionally flagged as false starts, matching
World Athletics rules (a human can't react that fast — it means the athlete
anticipated the gun). Toggle this in Settings.

### Motion detection

Movement is detected by comparing successive camera frames pixel-by-pixel. Two
thresholds keep stray motion from triggering:

- a **per-pixel brightness threshold** (ignores tiny lighting/noise changes), and
- a **minimum changed-area threshold** (a whole limb / the body must move, not a
  few strands of hair or a small background flutter).

Use the **Motion sensitivity** slider in Settings to tune this for your lighting
and framing. Lower it if hair or background movement triggers false starts; raise
it if real movement isn't being caught.

---

## Setup — hosting it so the camera works

Browsers only grant camera access over **HTTPS** (or `localhost`). The easiest way
to get an HTTPS URL is **GitHub Pages**:

1. Push this repository to GitHub (this branch already contains the app).
2. In the repo, go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source: Deploy from a branch**, pick this
   branch and the `/ (root)` folder, and **Save**.
4. After a minute, GitHub gives you a URL like
   `https://<user>.github.io/TrackStart/`.
5. Open that URL **on your phone** and allow camera + audio when prompted.
6. Optionally **Add to Home Screen** (Share menu on iOS, browser menu on Android)
   to run it fullscreen like a native app.

### Run locally (for development)

Any static file server works — it just has to be `localhost`:

```bash
# from the project root
python3 -m http.server 8000
# then open http://localhost:8000 on the same machine
```

To test on a physical phone during development you'll need HTTPS (e.g. a tunneling
service or GitHub Pages), since `localhost` won't be the phone.

---

## Using it at the track

1. Mount or prop the phone so the **rear camera** frames the athlete in the blocks.
   Keep the background as still as possible.
2. Make sure the phone **volume is up** (the commands and gun come from the speaker).
3. Tap **START** once the athlete is in position and settle time is fine.
4. Read the reaction time off the screen; check **History** (≡) for the session and
   **Fastest** at the top-left.

**Accuracy note:** timing resolution is limited by the camera frame rate
(~16 ms at 60 fps, ~33 ms at 30 fps) and speaker/detection latency. This is an
excellent **training tool** for comparing starts and drilling reaction, but it is
not a certified/officiated timing system.

---

## Tech

- **Camera:** `getUserMedia` (rear camera, up to 60 fps)
- **Voice commands:** Web Speech API (`speechSynthesis`)
- **Gunshot:** synthesized with the Web Audio API (no audio file needed)
- **Motion:** canvas frame-differencing, sampled per video frame
  (`requestVideoFrameCallback` where available)
- **Storage:** `localStorage` (results + settings persist on the device)
- **PWA:** installable, works offline after first load (service worker)

No frameworks, no external dependencies, no network calls — everything runs on
the phone.

## Project layout

```
index.html              app markup + layout
css/styles.css          styling / fullscreen camera UI
js/app.js               camera, audio, motion detection, timing, storage
manifest.webmanifest    PWA metadata
sw.js                   service worker (offline / installable)
icons/icon.svg          app icon
```

## Browser support

- **iOS:** Safari 16+ (Web Speech + `getUserMedia` supported; must be HTTPS).
- **Android:** Chrome / Edge (full support, including 60 fps frame callbacks).

Audio and camera unlock on the first tap of **START**, per mobile autoplay rules.
