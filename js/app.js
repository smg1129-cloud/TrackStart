/*
 * TrackStart — block-start reaction timer for track athletes.
 *
 * Sequence when START is pressed:
 *   1. "Runner, take your mark"   (spoken)      -> hold with on-screen countdown (default 10 s)
 *   2. "Set"                      (spoken)      -> record setTime
 *   3. Motion detection arms at setTime + 1.0 s (false-start window opens)
 *   4. Gunshot at setTime + random(0.8 s .. 2.2 s)
 *        - motion between arm and gun  -> FALSE START
 *        - first motion at/after gun    -> reaction time = motionTime - gunTime
 *   5. Result shown large on screen, stored, fastest tracked.
 *   6. Pressing START again resets everything.
 *
 * Motion detection uses frame-to-frame pixel differencing on a small canvas.
 * A per-pixel brightness threshold plus a minimum changed-area threshold keep
 * small/low-energy movement (a few strands of hair, minor background flutter)
 * from triggering, while whole-limb / body movement clears the bar. Tune with
 * the sensitivity slider in Settings.
 */

(() => {
  'use strict';

  // ---- Constants -----------------------------------------------------------
  const ARM_DELAY_MS = 1000;       // motion detection arms 1.0 s after "Set"
                                   // (lets the runner settle into set position)
  const GUN_MIN_MS = 1200;         // earliest gunshot after "Set"
  const GUN_MAX_MS = 2600;         // latest gunshot after "Set"
  const QUICK_RT_MS = 100;         // World Athletics false-start threshold
  const STORE_KEY = 'trackstart.results.v1';
  const SETTINGS_KEY = 'trackstart.settings.v1';

  // ---- DOM -----------------------------------------------------------------
  const el = (id) => document.getElementById(id);
  const video = el('video');
  const analysis = el('analysis');
  const actx = analysis.getContext('2d', { willReadFrequently: true });

  const statusEl = el('status');
  const bigEl = el('bigDisplay');
  const subEl = el('subDisplay');
  const bestEl = el('bestTime');
  const startBtn = el('startBtn');

  const camPrompt = el('camPrompt');
  const camMsg = el('camMsg');
  const enableCamBtn = el('enableCamBtn');

  const testGunBtn = el('testGunBtn');
  const historyBtn = el('historyBtn');
  const historyPanel = el('historyPanel');
  const historyList = el('historyList');
  const closeHistory = el('closeHistory');
  const clearHistory = el('clearHistory');

  const settingsBtn = el('settingsBtn');
  const settingsPanel = el('settingsPanel');
  const closeSettings = el('closeSettings');
  const sensitivityInput = el('sensitivity');
  const markHoldInput = el('markHold');
  const markHoldOut = el('markHoldOut');
  const flagQuickInput = el('flagQuick');

  // ---- State ---------------------------------------------------------------
  const State = {
    IDLE: 'idle',
    MARK: 'mark',
    SET: 'set',
    ARMED: 'armed',   // false-start window is open
    FIRED: 'fired',   // gun has gone, measuring reaction
    DONE: 'done',
  };
  let state = State.IDLE;

  let settings = {
    sensitivity: 11,    // 1..20
    markHold: 10,       // seconds
    flagQuick: true,
  };

  let results = [];     // { rt: number|null, false: bool, quick: bool, ts: number }
  let bestRt = null;

  let stream = null;
  let motionRunning = false;
  let refGray = null;      // frozen reference frame (the still "set" pose)
  let motionMask = null;   // reusable per-pixel change mask
  let motionHist = null;   // reusable histogram for median-shift compensation
  let motionStreak = 0;    // consecutive frames over threshold (debounce)
  let firstMotionT = 0;    // timestamp of the first over-threshold frame

  // Per-run scheduling / timing
  let timers = [];
  let setTime = 0;
  let armTime = 0;
  let gunTime = 0;
  let gunFired = false;
  let reactionCaptured = false;
  let countdownRAF = null;
  let reactionRAF = null;  // live reaction-clock animation frame

  // ---- Utilities -----------------------------------------------------------
  const now = () => performance.now();

  function clearTimers() {
    timers.forEach((t) => clearTimeout(t));
    timers = [];
    if (countdownRAF) { cancelAnimationFrame(countdownRAF); countdownRAF = null; }
    if (reactionRAF) { cancelAnimationFrame(reactionRAF); reactionRAF = null; }
  }
  function later(fn, ms) { const t = setTimeout(fn, ms); timers.push(t); return t; }

  function setPhaseClass(name) {
    document.body.classList.remove('phase-mark', 'phase-set', 'phase-armed', 'phase-fired');
    if (name) document.body.classList.add('phase-' + name);
  }

  function flash(color) {
    const cls = color === 'red' ? 'flash-red' : 'flash-green';
    document.body.classList.remove('flash-red', 'flash-green');
    // force reflow so the animation restarts
    void document.body.offsetWidth;
    document.body.classList.add(cls);
    setTimeout(() => document.body.classList.remove(cls), 520);
  }

  function fmt(ms) {
    if (ms == null) return '—';
    return (ms / 1000).toFixed(3) + 's';
  }

  // ---- Persistence ---------------------------------------------------------
  function loadSettings() {
    try {
      const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
      settings = Object.assign(settings, s);
    } catch (_) { /* ignore */ }
    sensitivityInput.value = settings.sensitivity;
    markHoldInput.value = settings.markHold;
    markHoldOut.textContent = settings.markHold + ' s';
    flagQuickInput.checked = !!settings.flagQuick;
  }
  function saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (_) {}
  }

  function loadResults() {
    try {
      results = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
      if (!Array.isArray(results)) results = [];
    } catch (_) { results = []; }
    recomputeBest();
  }
  function saveResults() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(results)); } catch (_) {}
  }
  function recomputeBest() {
    bestRt = null;
    for (const r of results) {
      if (!r.false && r.rt != null && (bestRt == null || r.rt < bestRt)) bestRt = r.rt;
    }
    bestEl.textContent = bestRt == null ? '—' : fmt(bestRt);
  }

  // ---- Audio ---------------------------------------------------------------
  let audioCtx = null;
  function ensureAudio() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  // Gunshot as pooled HTMLAudioElements. Web Audio output is silenced by the
  // iOS hardware mute switch, but media-element playback is not — so the
  // gunshot must go through <audio> to be heard on phones. We fire several
  // overlapping copies at once for extra loudness (SPL stacks).
  const GUN_POOL_SIZE = 6;
  let gunPool = [];
  let gunURI = null;

  function buildGunshotDataURI() {
    const sr = 44100;
    const dur = 0.5;
    const n = Math.floor(sr * dur);
    const samples = new Float32Array(n);

    // Phone speakers are loudest in the midrange (~1-4 kHz), so concentrate the
    // energy there with a band-pass (RBJ biquad) instead of a bright hiss or a
    // sub thump the speaker can't reproduce. A sustained, hard-saturated
    // mid-band burst reads as far LOUDER than a quick click at the same peak.
    const fc = 2200, Q = 0.7;
    const w0 = 2 * Math.PI * fc / sr;
    const cw = Math.cos(w0), sw = Math.sin(w0);
    const alpha = sw / (2 * Q);
    const a0 = 1 + alpha;
    const b0 = alpha / a0, b2 = -alpha / a0;   // b1 = 0
    const a1 = (-2 * cw) / a0, a2 = (1 - alpha) / a0;
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;

    const attack = 0.003, sustainEnd = 0.15;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      // Band-passed white noise.
      const x0 = Math.random() * 2 - 1;
      const bp = b0 * x0 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1; x1 = x0; y2 = y1; y1 = bp;
      // A little low thump for body (small — phones barely reproduce lows).
      const f = 70 + 120 * Math.exp(-t * 22);
      const thump = Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 10) * 0.3;
      // Saturate the mid burst hard so its average level (perceived loudness)
      // rails near full scale rather than being a quiet transient.
      let s = Math.tanh(bp * 6.0) * 0.95 + thump;
      // Amplitude envelope: fast attack, hold, then decay.
      let env;
      if (t < attack) env = t / attack;
      else if (t < sustainEnd) env = 1;
      else env = Math.exp(-(t - sustainEnd) * 11);
      samples[i] = s * env;
    }
    // Normalize to near full scale.
    let peak = 0;
    for (let i = 0; i < n; i++) { const a = Math.abs(samples[i]); if (a > peak) peak = a; }
    const g = peak > 0 ? 0.99 / peak : 1;

    // Encode as a mono 16-bit PCM WAV.
    const dataLen = n * 2;
    const buf = new ArrayBuffer(44 + dataLen);
    const dv = new DataView(buf);
    const wr = (off, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(off + i, s.charCodeAt(i)); };
    wr(0, 'RIFF'); dv.setUint32(4, 36 + dataLen, true); wr(8, 'WAVE');
    wr(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true);
    dv.setUint16(22, 1, true); dv.setUint32(24, sr, true);
    dv.setUint32(28, sr * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
    wr(36, 'data'); dv.setUint32(40, dataLen, true);
    let off = 44;
    for (let i = 0; i < n; i++) {
      let v = Math.max(-1, Math.min(1, samples[i] * g));
      dv.setInt16(off, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      off += 2;
    }
    // base64-encode the buffer for a self-contained data: URI.
    const bytes = new Uint8Array(buf);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return 'data:audio/wav;base64,' + btoa(bin);
  }

  function ensureGunAudio() {
    if (gunPool.length === 0) {
      try {
        gunURI = gunURI || buildGunshotDataURI();
        for (let i = 0; i < GUN_POOL_SIZE; i++) {
          const el = new Audio();
          el.preload = 'auto';
          el.src = gunURI;
          el.volume = 1.0;
          gunPool.push(el);
        }
      } catch (_) { gunPool = []; }
    }
    return gunPool;
  }

  // Called within the Start-button gesture: resume Web Audio and "prime" every
  // pooled gunshot element with a muted play so iOS lets them fire later.
  function unlockAudio() {
    ensureAudio();
    const pool = ensureGunAudio();
    pool.forEach((el) => {
      try {
        el.muted = true;
        const p = el.play();
        if (p && p.then) {
          p.then(() => { el.pause(); el.currentTime = 0; el.muted = false; })
           .catch(() => { el.muted = false; });
        } else {
          el.muted = false;
        }
      } catch (_) { el.muted = false; }
    });
  }

  // Speak a phrase; resolve when speech ends (or immediately if unsupported).
  function speak(text) {
    return new Promise((resolve) => {
      try {
        if (!('speechSynthesis' in window)) return resolve();
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.rate = 1.0;
        u.pitch = 1.0;
        u.volume = 1.0;
        u.onend = () => resolve();
        u.onerror = () => resolve();
        window.speechSynthesis.speak(u);
        // Safety net in case the engine never fires onend
        setTimeout(resolve, 2500);
      } catch (_) { resolve(); }
    });
  }

  // Fire the gunshot. Primary path is the HTMLAudio element (audible even with
  // the iOS silent switch on); the Web Audio synthesis is layered on for extra
  // punch on devices where it isn't muted.
  function playGunshot() {
    const pool = ensureGunAudio();
    pool.forEach((el) => {
      try {
        el.muted = false;
        el.volume = 1.0;
        el.currentTime = 0;
        const p = el.play();
        if (p && p.catch) p.catch(() => {});
      } catch (_) {}
    });
    playGunshotWebAudio();
  }

  // Synthesize a short, sharp gunshot-like report (noise burst + low thump).
  function playGunshotWebAudio() {
    const ctx = ensureAudio();
    if (!ctx) return;
    const t0 = ctx.currentTime;

    // White-noise crack
    const dur = 0.25;
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      // fast exponential decay
      const env = Math.pow(1 - i / data.length, 3);
      data[i] = (Math.random() * 2 - 1) * env;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'highpass';
    noiseFilter.frequency.value = 800;

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(1.8, t0);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);

    noise.connect(noiseFilter).connect(noiseGain).connect(ctx.destination);

    // Low-frequency thump for body
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, t0);
    osc.frequency.exponentialRampToValueAtTime(50, t0 + 0.12);
    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(1.5, t0);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.18);
    osc.connect(oscGain).connect(ctx.destination);

    noise.start(t0);
    noise.stop(t0 + dur);
    osc.start(t0);
    osc.stop(t0 + 0.2);
  }

  // Short beep used for the visible countdown ticks (optional cue).
  function tick(freq = 660, dur = 0.06) {
    const ctx = ensureAudio();
    if (!ctx) return;
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.15, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur);
  }

  // ---- Camera --------------------------------------------------------------
  async function startCamera() {
    if (stream) return true;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      camMsg.textContent = 'This browser does not support camera access (getUserMedia).';
      camPrompt.classList.remove('hidden');
      return false;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 60, max: 60 },
        },
      });
      video.srcObject = stream;
      await video.play().catch(() => {});
      camPrompt.classList.add('hidden');
      startMotionLoop();
      return true;
    } catch (err) {
      let msg = 'Camera access was blocked. ';
      if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
        msg += 'The page must be served over HTTPS (e.g. GitHub Pages) or on localhost for the camera to work.';
      } else {
        msg += 'Please allow camera access in your browser settings and try again.';
      }
      camMsg.textContent = msg;
      camPrompt.classList.remove('hidden');
      return false;
    }
  }

  // ---- Motion detection ----------------------------------------------------
  // Reference-frame differencing: the first frame after arming/firing is frozen
  // as the reference (the still "set" pose). Every later frame is compared to
  // that fixed reference, so as soon as the athlete begins to leave the set
  // position the changed area grows and stays large — a reliable "first motion"
  // trigger, unlike frame-to-frame diffing which only sees motion mid-stride.
  function analyzeFrame() {
    const w = analysis.width, h = analysis.height;
    try {
      actx.drawImage(video, 0, 0, w, h);
    } catch (_) {
      return 0; // video not ready yet
    }
    const frame = actx.getImageData(0, 0, w, h).data;
    const n = w * h;
    const gray = new Uint8ClampedArray(n);
    for (let i = 0, p = 0; i < n; i++, p += 4) {
      // luma
      gray[i] = (frame[p] * 0.299 + frame[p + 1] * 0.587 + frame[p + 2] * 0.114) | 0;
    }
    if (!refGray) { refGray = gray; return 0; }

    // Compensate for GLOBAL brightness/exposure drift: the phone's auto-exposure
    // shifts the whole frame at once, which against a frozen reference would look
    // like full-frame "motion". Subtract the MEDIAN signed difference (via a
    // histogram) — the median tracks the uniform lighting shift but is unmoved by
    // a large moving object, so it removes drift without masking real movement.
    const hist = motionHist || (motionHist = new Int32Array(512));
    hist.fill(0);
    for (let i = 0; i < n; i++) hist[(gray[i] - refGray[i]) + 255]++;
    let cum = 0, medianShift = 0; const half = n >> 1;
    for (let b = 0; b < 512; b++) { cum += hist[b]; if (cum >= half) { medianShift = b - 255; break; } }

    // Per-pixel brightness threshold derived from sensitivity (1..20).
    const pixelThresh = 40 - settings.sensitivity * 1.5; // ~38 (low) .. ~10 (high)
    const mask = motionMask && motionMask.length === n ? motionMask : (motionMask = new Uint8Array(n));
    for (let i = 0; i < n; i++) {
      const d = (gray[i] - refGray[i]) - medianShift;
      mask[i] = ((d < 0 ? -d : d) > pixelThresh) ? 1 : 0;
    }
    // Reject isolated speckle (sensor noise, sub-pixel shake, JPEG artifacts):
    // only count a changed pixel if a horizontal neighbour also changed, so a
    // real moving edge/limb survives but lone hot pixels don't.
    let changed = 0;
    for (let i = 1; i < n - 1; i++) {
      if (mask[i] && (mask[i - 1] || mask[i + 1])) changed++;
    }
    return changed / n;
  }

  function motionThreshold() {
    // Minimum fraction of the frame that must differ from the reference to
    // count as real motion. Higher sensitivity -> smaller required area.
    // sensitivity 1 -> ~4% of frame ; sensitivity 20 -> ~0.3% of frame
    return Math.max(0.003, 0.042 - settings.sensitivity * 0.002);
  }

  function startMotionLoop() {
    if (motionRunning) return;
    motionRunning = true;
    refGray = null;

    const hasRVFC = 'requestVideoFrameCallback' in HTMLVideoElement.prototype;

    const step = () => {
      if (!motionRunning) return;
      // Only run the pixel analysis during the windows that judge motion:
      // ARMED (watching for a false start) and FIRED (timing the reaction).
      if (state === State.ARMED || state === State.FIRED) {
        handleMotion(analyzeFrame());
      }
      if (hasRVFC) {
        video.requestVideoFrameCallback(step);
      } else {
        requestAnimationFrame(step);
      }
    };

    if (hasRVFC) video.requestVideoFrameCallback(step);
    else requestAnimationFrame(step);
  }

  // Called every analysed frame with the changed-area fraction. Requires two
  // consecutive over-threshold frames to fire (debounce), but timestamps the
  // FIRST of them so reaction timing stays accurate.
  function handleMotion(frac) {
    if (state !== State.ARMED && state !== State.FIRED) return;
    const moved = frac >= motionThreshold();
    if (!moved) { motionStreak = 0; return; }

    if (motionStreak === 0) firstMotionT = now();
    motionStreak++;
    if (motionStreak < 2) return; // need confirmation on the next frame

    if (state === State.ARMED) {
      // Movement before the gun -> false start.
      onFalseStart();
    } else if (state === State.FIRED && !reactionCaptured) {
      reactionCaptured = true;
      onReaction(firstMotionT - gunTime);
    }
  }

  // ---- Run sequence --------------------------------------------------------
  async function beginSequence() {
    // Reset run state
    clearTimers();
    gunFired = false;
    reactionCaptured = false;
    refGray = null;

    // Ensure camera + audio are live (user gesture unlocks them here)
    unlockAudio();
    const camOk = await startCamera();
    if (!camOk) { resetToIdle(); return; }

    bigEl.className = 'big-display';
    subEl.textContent = '';
    startBtn.textContent = 'ABORT';
    startBtn.classList.add('running', 'abort');

    // --- Phase 1: take your mark + countdown ---
    state = State.MARK;
    setPhaseClass('mark');
    statusEl.textContent = 'Runner, take your mark…';
    bigEl.className = 'big-display command';
    bigEl.textContent = 'MARK';
    speak('Runner, take your mark');

    const holdMs = settings.markHold * 1000;
    const holdStart = now();

    // Show a live countdown; brief command word first, then numbers.
    later(() => runCountdown(holdStart, holdMs), 900);
  }

  function runCountdown(holdStart, holdMs) {
    if (state !== State.MARK) return;
    bigEl.className = 'big-display count';
    let lastShown = -1;

    const tickLoop = () => {
      if (state !== State.MARK) return;
      const elapsed = now() - holdStart;
      const remain = Math.max(0, holdMs - elapsed);
      const secs = Math.ceil(remain / 1000);
      if (secs !== lastShown) {
        lastShown = secs;
        bigEl.textContent = secs > 0 ? String(secs) : '';
        if (secs > 0 && secs <= 5) tick(600, 0.05);
      }
      if (remain <= 0) { goToSet(); return; }
      countdownRAF = requestAnimationFrame(tickLoop);
    };
    countdownRAF = requestAnimationFrame(tickLoop);
  }

  function goToSet() {
    if (countdownRAF) { cancelAnimationFrame(countdownRAF); countdownRAF = null; }
    state = State.SET;
    setPhaseClass('set');
    statusEl.textContent = 'Set…';
    bigEl.className = 'big-display command';
    bigEl.textContent = 'SET';
    setTime = now();
    speak('Set');

    // Random gun delay in [0.8, 2.2] s after "Set".
    const gunDelay = GUN_MIN_MS + Math.random() * (GUN_MAX_MS - GUN_MIN_MS);
    gunTime = setTime + gunDelay;
    armTime = setTime + ARM_DELAY_MS;

    // Arm motion detection 1.0 s after "Set".
    later(() => {
      if (state !== State.SET) return;
      state = State.ARMED;
      setPhaseClass('armed');
      statusEl.textContent = 'Hold… watching for movement';
      bigEl.textContent = '';
      refGray = null;      // freeze the set pose as the reference on the next frame
      motionStreak = 0;
    }, ARM_DELAY_MS);

    // Fire the gun.
    later(fireGun, gunDelay);
  }

  function fireGun() {
    if (state !== State.ARMED && state !== State.SET) return; // aborted / false-started
    state = State.FIRED;
    gunFired = true;
    gunTime = now();           // exact moment sound is triggered
    reactionCaptured = false;
    refGray = null;            // re-freeze the set pose at the gun as reference
    motionStreak = 0;
    setPhaseClass('fired');
    playGunshot();
    flash('green');
    statusEl.textContent = 'GO!';
    // Show a live timer counting up from the gun; it freezes on first motion.
    bigEl.className = 'big-display result';
    bigEl.textContent = '0.000s';
    startReactionClock();

    // If no motion is detected within a generous window, still close out.
    later(() => {
      if (state === State.FIRED && !reactionCaptured) {
        stopReactionClock();
        state = State.DONE;
        statusEl.textContent = 'No movement detected';
        bigEl.className = 'big-display';
        bigEl.textContent = '—';
        subEl.textContent = 'Raise sensitivity in Settings, or reframe the athlete';
        finishRun();
      }
    }, 5000);
  }

  // Live reaction clock: updates the big display every frame from the gun until
  // motion is captured, so "starts on the gun / stops on first motion" is visible.
  function startReactionClock() {
    stopReactionClock();
    const tickClock = () => {
      if (state !== State.FIRED || reactionCaptured) return;
      bigEl.textContent = ((now() - gunTime) / 1000).toFixed(3) + 's';
      reactionRAF = requestAnimationFrame(tickClock);
    };
    reactionRAF = requestAnimationFrame(tickClock);
  }
  function stopReactionClock() {
    if (reactionRAF) { cancelAnimationFrame(reactionRAF); reactionRAF = null; }
  }

  function onFalseStart() {
    clearTimers();
    state = State.DONE;
    setPhaseClass(null);
    flash('red');
    statusEl.textContent = 'Moved before the gun';
    bigEl.className = 'big-display false';
    bigEl.textContent = 'FALSE START';
    subEl.textContent = '';
    speak('False start');
    recordResult({ rt: null, false: true, quick: false });
    finishRun();
  }

  function onReaction(rt) {
    clearTimers();
    state = State.DONE;
    setPhaseClass('fired');
    const quick = settings.flagQuick && rt < QUICK_RT_MS;
    statusEl.textContent = quick ? 'Reaction faster than 0.100 s' : 'Reaction time';
    bigEl.className = 'big-display result' + (quick ? ' slow' : '');
    bigEl.textContent = fmt(rt);

    if (quick) {
      // Under 0.100 s is ruled a false start by World Athletics.
      bigEl.className = 'big-display false';
      bigEl.textContent = fmt(rt);
      subEl.textContent = 'FALSE START (under 0.100 s)';
      flash('red');
      recordResult({ rt, false: true, quick: true });
    } else {
      subEl.textContent = (bestRt != null && rt < bestRt) ? 'New best!' : '';
      recordResult({ rt, false: false, quick: false });
    }
    finishRun();
  }

  function recordResult(r) {
    r.ts = Date.now();
    results.unshift(r);
    if (results.length > 200) results.length = 200;
    saveResults();
    recomputeBest();
    renderHistory();
  }

  function finishRun() {
    startBtn.textContent = 'START';
    startBtn.classList.remove('running', 'abort');
    // Leave the result on screen until the next START.
  }

  function resetToIdle() {
    clearTimers();
    state = State.IDLE;
    setPhaseClass(null);
    startBtn.textContent = 'START';
    startBtn.classList.remove('running', 'abort');
    statusEl.textContent = 'Tap START when the athlete is set in the blocks';
    bigEl.className = 'big-display';
    bigEl.textContent = '';
    subEl.textContent = '';
    try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (_) {}
  }

  // ---- History rendering ---------------------------------------------------
  function renderHistory() {
    historyList.innerHTML = '';
    if (results.length === 0) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = 'No starts yet';
      historyList.appendChild(li);
      return;
    }
    results.forEach((r) => {
      const li = document.createElement('li');
      const rt = document.createElement('span');
      const meta = document.createElement('span');
      meta.className = 'meta';

      if (r.false) {
        rt.className = 'rt false';
        rt.textContent = r.quick ? fmt(r.rt) + ' · <0.100' : 'False start';
      } else {
        rt.className = 'rt' + (bestRt != null && r.rt === bestRt ? ' best' : '');
        rt.textContent = fmt(r.rt);
      }
      const d = new Date(r.ts);
      meta.textContent = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      li.appendChild(rt);
      li.appendChild(meta);
      historyList.appendChild(li);
    });
  }

  // ---- Event wiring --------------------------------------------------------
  startBtn.addEventListener('click', () => {
    // If a run is in progress, START acts as ABORT / reset.
    if (state !== State.IDLE && state !== State.DONE) {
      resetToIdle();
      return;
    }
    beginSequence();
  });

  enableCamBtn.addEventListener('click', () => { unlockAudio(); startCamera(); });

  // Test-gun button: fire the shot immediately so volume can be tuned without
  // running the whole cadence. This is a user gesture, so audio unlocks here.
  testGunBtn.addEventListener('click', () => {
    ensureAudio();
    ensureGunAudio();
    playGunshot();
  });

  historyBtn.addEventListener('click', () => { renderHistory(); historyPanel.classList.remove('hidden'); });
  closeHistory.addEventListener('click', () => historyPanel.classList.add('hidden'));
  clearHistory.addEventListener('click', () => {
    results = [];
    saveResults();
    recomputeBest();
    renderHistory();
  });

  settingsBtn.addEventListener('click', () => settingsPanel.classList.remove('hidden'));
  closeSettings.addEventListener('click', () => settingsPanel.classList.add('hidden'));

  sensitivityInput.addEventListener('input', (e) => {
    settings.sensitivity = parseInt(e.target.value, 10);
    saveSettings();
  });
  markHoldInput.addEventListener('input', (e) => {
    settings.markHold = parseInt(e.target.value, 10);
    markHoldOut.textContent = settings.markHold + ' s';
    saveSettings();
  });
  flagQuickInput.addEventListener('change', (e) => {
    settings.flagQuick = e.target.checked;
    saveSettings();
  });

  // Warm up speech synthesis voice list (some browsers load async).
  if ('speechSynthesis' in window) {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
  }

  // Register service worker for installability / offline (optional).
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }

  // ---- Init ----------------------------------------------------------------
  loadSettings();
  loadResults();
  renderHistory();
  resetToIdle();
  // Build the gunshot WAV up front so it's decoded and ready before the first
  // start (it still only plays after the Start gesture unlocks audio).
  ensureGunAudio();
  // Attempt to start the camera immediately; if blocked we show the prompt.
  startCamera();
})();
