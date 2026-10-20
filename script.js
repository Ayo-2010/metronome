const startBtn = document.getElementById('startBtn');
const startLabel = document.getElementById('startLabel');
const bpmSlider = document.getElementById('bpmSlider');
const bpmEl = document.getElementById('bpm');
const bpmMinus = document.getElementById('bpmMinus');
const bpmPlus = document.getElementById('bpmPlus');
const tapBtn = document.getElementById('tapBtn');
const signatureEl = document.getElementById('signature');
const beatsEl = document.getElementById('beats');
const volumeEl = document.getElementById('volume');
const barCountEl = document.getElementById('barCount');
const statusEl = document.getElementById('status');
const meterLabel = document.getElementById('meterLabel');

const STORAGE_KEY = 'tempo-01-settings';
const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD = 0.1;
const MIN_BPM = 40;
const MAX_BPM = 240;

let bpm = 120;
let beatsPerBar = 4;
let volume = 0.7;
let isRunning = false;
let audioCtx = null;
let timerId = null;
let rafId = null;
let nextNoteTime = 0;
let currentBeat = 0;
let currentBar = 1;
let queue = [];
let taps = [];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (typeof saved.bpm === 'number') {
      bpm = clamp(Math.round(saved.bpm), MIN_BPM, MAX_BPM);
    }
    if ([2, 3, 4, 6].includes(saved.beats)) {
      beatsPerBar = saved.beats;
    }
    if (typeof saved.volume === 'number') {
      volume = clamp(saved.volume, 0, 1);
    }
  } catch (error) {
    return;
  }
}

function saveSettings() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ bpm, beats: beatsPerBar, volume }));
  } catch (error) {
    return;
  }
}

function setFill(element, percent) {
  element.style.setProperty('--fill', clamp(percent, 0, 100) + '%');
}

function updateTempoUI() {
  bpmEl.textContent = String(bpm);
  bpmSlider.value = String(bpm);
  setFill(bpmSlider, ((bpm - MIN_BPM) / (MAX_BPM - MIN_BPM)) * 100);
  meterLabel.textContent = beatsPerBar + (beatsPerBar === 6 ? ' / 8' : ' / 4');
}

function updateVolumeUI() {
  const percent = Math.round(volume * 100);
  volumeEl.value = String(percent);
  setFill(volumeEl, percent);
}

function renderBeats() {
  beatsEl.innerHTML = '';
  for (let i = 0; i < beatsPerBar; i += 1) {
    const dot = document.createElement('span');
    dot.className = 'dot' + (i === 0 ? ' accent' : '');
    beatsEl.appendChild(dot);
  }
}

function clearDots() {
  beatsEl.querySelectorAll('.dot').forEach((dot) => dot.classList.remove('active'));
}

function flashBeat(index) {
  const dots = beatsEl.querySelectorAll('.dot');
  dots.forEach((dot) => dot.classList.remove('active'));
  if (dots[index]) {
    dots[index].classList.add('active');
  }
}

function ensureAudio() {
  if (!audioCtx) {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return false;
    audioCtx = new AudioCtor();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return true;
}

function scheduleClick(beat, time) {
  const accent = beat === 0;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  const level = Math.max(0.0002, volume * (accent ? 0.85 : 0.42));

  osc.type = 'sine';
  osc.frequency.setValueAtTime(accent ? 1560 : 980, time);
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(level, time + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.055);

  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(time);
  osc.stop(time + 0.08);
}

function scheduler() {
  if (!isRunning || !audioCtx) return;
  const secondsPerBeat = 60 / bpm;

  while (nextNoteTime < audioCtx.currentTime + SCHEDULE_AHEAD) {
    scheduleClick(currentBeat, nextNoteTime);
    queue.push({
      beat: currentBeat,
      bar: currentBeat === 0 ? currentBar : null,
      time: nextNoteTime
    });
    if (currentBeat === 0) {
      currentBar += 1;
    }
    nextNoteTime += secondsPerBeat;
    currentBeat = (currentBeat + 1) % beatsPerBar;
  }
}

function visualLoop() {
  if (!isRunning || !audioCtx) return;
  const now = audioCtx.currentTime;
  while (queue.length && queue[0].time <= now) {
    const note = queue.shift();
    flashBeat(note.beat);
    if (note.bar !== null) {
      barCountEl.textContent = String(note.bar);
    }
  }
  rafId = requestAnimationFrame(visualLoop);
}

function startMetronome() {
  if (!ensureAudio()) return;
  isRunning = true;
  currentBeat = 0;
  currentBar = 1;
  queue = [];
  clearDots();
  barCountEl.textContent = '0';
  nextNoteTime = audioCtx.currentTime + 0.08;

  startBtn.classList.add('running');
  startBtn.setAttribute('aria-label', 'Stop metronome');
  startLabel.textContent = 'Stop';
  statusEl.textContent = 'PLAYING';
  document.body.classList.add('is-live');

  timerId = window.setInterval(scheduler, LOOKAHEAD_MS);
  scheduler();
  rafId = requestAnimationFrame(visualLoop);
}

function stopMetronome() {
  isRunning = false;
  window.clearInterval(timerId);
  timerId = null;
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  queue = [];
  clearDots();
  barCountEl.textContent = '0';
  startBtn.classList.remove('running');
  startBtn.setAttribute('aria-label', 'Start metronome');
  startLabel.textContent = 'Start';
  statusEl.textContent = 'READY';
  document.body.classList.remove('is-live');
}

function toggleMetronome() {
  if (isRunning) {
    stopMetronome();
  } else {
    startMetronome();
  }
}

function setBpm(value) {
  bpm = clamp(Math.round(value), MIN_BPM, MAX_BPM);
  updateTempoUI();
  saveSettings();
}

function setSignature(beats) {
  beatsPerBar = beats;
  renderBeats();
  clearDots();
  barCountEl.textContent = '0';
  currentBeat = 0;
  currentBar = 1;
  queue = [];
  if (isRunning && audioCtx) {
    nextNoteTime = Math.max(nextNoteTime, audioCtx.currentTime + 0.05);
  }
  signatureEl.querySelectorAll('button').forEach((button) => {
    button.classList.toggle('active', Number(button.dataset.beats) === beatsPerBar);
    button.setAttribute('aria-pressed', String(Number(button.dataset.beats) === beatsPerBar));
  });
  updateTempoUI();
  saveSettings();
}

function tapTempo() {
  const now = performance.now();
  if (taps.length && now - taps[taps.length - 1] > 2000) {
    taps = [];
  }
  taps.push(now);
  if (taps.length > 6) {
    taps.shift();
  }

  tapBtn.classList.remove('hit');
  void tapBtn.offsetWidth;
  tapBtn.classList.add('hit');

  if (taps.length < 2) return;
  let total = 0;
  for (let i = 1; i < taps.length; i += 1) {
    total += taps[i] - taps[i - 1];
  }
  const average = total / (taps.length - 1);
  if (average > 0) {
    setBpm(60000 / average);
  }
}

startBtn.addEventListener('click', toggleMetronome);

bpmSlider.addEventListener('input', (event) => {
  setBpm(Number(event.target.value));
});

bpmMinus.addEventListener('click', () => setBpm(bpm - 1));
bpmPlus.addEventListener('click', () => setBpm(bpm + 1));

tapBtn.addEventListener('click', tapTempo);

volumeEl.addEventListener('input', (event) => {
  volume = clamp(Number(event.target.value) / 100, 0, 1);
  setFill(volumeEl, Number(event.target.value));
  saveSettings();
});

signatureEl.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  setSignature(Number(button.dataset.beats));
});

document.addEventListener('keydown', (event) => {
  if (event.code !== 'Space') return;
  const tag = event.target.tagName;
  if (tag === 'BUTTON' || tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
  event.preventDefault();
  toggleMetronome();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && isRunning) {
    stopMetronome();
  }
});

loadSettings();
renderBeats();
updateTempoUI();
updateVolumeUI();
setSignature(beatsPerBar);
