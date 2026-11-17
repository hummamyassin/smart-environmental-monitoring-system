/* SEMS dashboard recovered from https://semsp.netlify.app/ on 2026-11-18.
   Firebase live readings with simulated fallback; see docs/recovery.md. */

'use strict';

/* ── FIREBASE CONFIGURATION ─────────────────────────────────────
   Reads real ESP32 sensor data from:
   /sensors/latest

   History charts can later be connected to:
   /sensors/history
──────────────────────────────────────────────────────────────── */
const firebaseConfig = window.SEMS_FIREBASE_CONFIG || null;

let firebaseDb = null;
let firebaseConnected = false;
let fallbackTimer = null;


/* ── CONFIGURATION ─────────────────────────────────────────────
   Change these values to adjust simulation behaviour.
   Thresholds must match config.h on the firmware side.
──────────────────────────────────────────────────────────────── */
const CONFIG = {
  UPDATE_INTERVAL:  3000,     // ms between fallback/mock readings
  HISTORY_POINTS:   20,       // data points kept per mini-chart

  // Alert thresholds — matched to current firmware config.h
  THRESH: {
    temp:  { warn: 25,    danger: 28   },
    hum:   { low:  50,    high:   65   },   // warning outside 50–65%
    air:   { warn: 1000,  danger: 1200 },
    dust:  { warn: 0.400, danger: 0.500 },
    sound: { warn: 800,   danger: 900  },
  },

  // Sensor reading ranges for fallback mock simulator only
  SIM: {
    temp:  { min: 20,   max: 40,   step: 1.0  },
    hum:   { min: 35,   max: 75,   step: 2    },
    air:   { min: 700,  max: 1300, step: 40   },
    dust:  { min: 0.0,  max: 0.90, step: 0.04 },
    sound: { min: 300,  max: 950,  step: 45   },
  },
};

/* ── STATE ───────────────────────────────────────────────────── */
const state = {
  // Current readings
  readings: {
    temp:  24.0,
    hum:   55.0,
    air:   180,
    dust:  0.01,
    sound: 450,
    fan:   false,
  },

  // Chart history buffers
  history: {
    temp:  [],
    hum:   [],
    air:   [],
    dust:  [],
  },

  // Timing
  bootTime:   Date.now(),
  cycleCount: 0,
  lastUpdate: null,

  // Sound events (for the log in the sound card)
  soundEvents: [],
};

/* ── CHART INSTANCES ─────────────────────────────────────────── */
const charts = {};

/* ── DOM REFERENCES ──────────────────────────────────────────── */
// Cached once on init to avoid repeated querySelector calls.
const dom = {};

function cacheDom() {
  const ids = [
    'systemClock','systemDate','uptimeVal','connBadge','connLabel',
    'systemOrb','systemStatusText','systemStatusBar',
    'lastUpdate','cycleCount','sourceLabel',
    'alertBanner','alertMessages','alertDismiss',
    'val-temp','badge-temp','fill-temp','upd-temp','card-temp',
    'val-hum', 'badge-hum', 'fill-hum', 'upd-hum', 'card-hum',
    'val-air', 'badge-air', 'fill-air', 'upd-air', 'card-air',
    'val-dust','badge-dust','fill-dust','upd-dust','card-dust',
    'badge-sound','upd-sound','card-sound',
    'soundIndicator','soundIcon','soundStatus','soundEventList',
    'badge-fan','upd-fan','card-fan',
    'fanVisual','fanSvg','fanBlades','fanStatusText','fanTriggerInfo',
    'fanIconHeader',
    'eventLogList','clearLogBtn',
    'dataSourceVal','footerMode',
  ];
  ids.forEach(id => { dom[id] = document.getElementById(id); });
}

/* ================================================================
   INITIALISATION
================================================================ */
function init() {
  cacheDom();
  initCharts();
  startClock();
  startUptime();

  // Event listeners
  dom['alertDismiss'].addEventListener('click', () => {
    dom['alertBanner'].classList.remove('visible');
  });

  dom['clearLogBtn'].addEventListener('click', () => {
    dom['eventLogList'].innerHTML = '';
    addLogEntry('Event log cleared.', 'info');
  });

  addLogEntry('Dashboard initialised. Connecting to Firebase Realtime Database...', 'info');
  addLogEntry('Live path: /sensors/latest', 'info');

  startFirebaseLiveData();
}


/* ================================================================
   FIREBASE LIVE DATA
================================================================ */
function startFirebaseLiveData() {
  try {
    if (!firebaseConfig || !firebaseConfig.databaseURL || firebaseConfig.apiKey === 'YOUR_API_KEY') {
      setConnectionMode(false);
      addLogEntry('Firebase is not configured. Showing simulated fallback data.', 'info');
      startMockFallback();
      return;
    }
    if (typeof firebase === 'undefined') {
      throw new Error('Firebase SDK not loaded');
    }

    firebase.initializeApp(firebaseConfig);
    firebaseDb = firebase.database();

    const latestRef = firebaseDb.ref('sensors/latest');

    latestRef.on('value', (snapshot) => {
      const data = snapshot.val();

      if (!data) {
        addLogEntry('Firebase connected, but /sensors/latest is empty. Using fallback data.', 'warn');
        startMockFallback();
        return;
      }

      firebaseConnected = true;
      if (fallbackTimer) {
        clearInterval(fallbackTimer);
        fallbackTimer = null;
      }

      applyFirebaseReading(data);
      setConnectionMode(true);
      updateAllUI();
    }, (error) => {
      console.error('Firebase read error:', error);
      addLogEntry('Firebase read error: ' + error.message, 'danger');
      setConnectionMode(false);
      startMockFallback();
    });

  } catch (error) {
    console.error('Firebase init error:', error);
    addLogEntry('Firebase connection failed. Fallback mock data enabled.', 'danger');
    setConnectionMode(false);
    startMockFallback();
  }
}

function applyFirebaseReading(data) {
  state.readings.temp  = Number(data.temperature ?? state.readings.temp);
  state.readings.hum   = Number(data.humidity ?? state.readings.hum);
  state.readings.air   = Number(data.airQuality ?? state.readings.air);
  state.readings.dust  = Number(data.dust ?? state.readings.dust);
  state.readings.sound = Number(data.sound ?? state.readings.sound);
  state.readings.fan   = Boolean(data.fan ?? state.readings.fan);

  state.lastUpdate = new Date();
  state.cycleCount++;

  // Add a sound event when analog sound crosses warning threshold
  if (state.readings.sound >= CONFIG.THRESH.sound.warn) {
    const now = formatTime(new Date());
    if (state.soundEvents[0] !== now) {
      state.soundEvents.unshift(now);
      if (state.soundEvents.length > 5) state.soundEvents.pop();
    }
  }

  // Store extra metadata for status/log use
  state.meta = {
    dhtOk: data.dhtOk,
    mqWarmupDone: data.mqWarmupDone,
    wifiRssi: data.wifiRssi,
    dustRaw: data.dustRaw,
    dustVoltage: data.dustVoltage,
    timestamp: data.timestamp,
  };
}

function setConnectionMode(live) {
  if (dom['connBadge']) dom['connBadge'].classList.toggle('live', live);
  if (dom['connLabel']) dom['connLabel'].textContent = live ? 'FIREBASE LIVE' : 'FALLBACK DATA';
  if (dom['dataSourceVal']) {
    dom['dataSourceVal'].textContent = live ? '⬤ Firebase Realtime DB' : '⬤ Fallback / Simulated JS';
    dom['dataSourceVal'].classList.toggle('live', live);
  }
  if (dom['footerMode']) dom['footerMode'].textContent = live ? 'Mode: Firebase Live' : 'Mode: Fallback Data';
  if (dom['sourceLabel']) dom['sourceLabel'].textContent = live ? 'Firebase' : 'Fallback';
}

function startMockFallback() {
  firebaseConnected = false;
  setConnectionMode(false);
  if (fallbackTimer) return;
  tick();
  fallbackTimer = setInterval(tick, CONFIG.UPDATE_INTERVAL);
}

// Simulation tick, used only by the labelled fallback.
function tick() {
  generateMockData();   // <-- FIREBASE HOOK: replace this line
  updateAllUI();
}

/* ================================================================
   MOCK DATA GENERATOR
   Simulates realistic sensor drift using a random-walk approach.
   Occasionally spikes into warning/danger zones to demo alerts.
================================================================ */
function generateMockData() {
  const r = state.readings;
  const s = CONFIG.SIM;

  // Random walk helper — adds ± step, clamps to [min, max]
  function walk(current, { min, max, step }) {
    const delta = (Math.random() - 0.5) * 2 * step;
    return Math.min(max, Math.max(min, current + delta));
  }

  // Every ~30 cycles introduce a deliberate spike to demonstrate alerts
  const spike = (state.cycleCount % 28 === 0);

  r.temp  = walk(r.temp,  s.temp);
  r.hum   = walk(r.hum,   s.hum);
  r.air   = walk(r.air,   s.air);
  r.dust  = walk(r.dust,  s.dust);

  if (spike) {
    // Spike one of the sensors into danger territory
    const which = state.cycleCount % 3;
    if (which === 0) r.air  = 650 + Math.random() * 100;
    if (which === 1) r.dust = 0.17 + Math.random() * 0.05;
    if (which === 2) r.temp = 47 + Math.random() * 5;
  }

  // Sound: analog raw level
  const prevSoundHigh = r.sound >= CONFIG.THRESH.sound.warn;
  r.sound = walk(r.sound, s.sound);
  const soundHigh = r.sound >= CONFIG.THRESH.sound.warn;

  if (soundHigh && !prevSoundHigh) {
    // New sound event
    state.soundEvents.unshift(formatTime(new Date()));
    if (state.soundEvents.length > 5) state.soundEvents.pop();
  }

  // Fan logic: mirrors firmware hysteresis
  const danger = r.air  >= CONFIG.THRESH.air.danger ||
                 r.dust >= CONFIG.THRESH.dust.danger ||
                 r.temp >= CONFIG.THRESH.temp.danger ||
                 r.sound >= CONFIG.THRESH.sound.danger;
  const clear  = r.air  < CONFIG.THRESH.air.warn &&
                 r.dust < CONFIG.THRESH.dust.warn &&
                 r.temp < CONFIG.THRESH.temp.warn &&
                 r.sound < CONFIG.THRESH.sound.warn;

  if (danger)      r.fan = true;
  else if (clear)  r.fan = false;
  // else: keep current state (hysteresis)

  state.cycleCount++;
  state.lastUpdate = new Date();
}

/* ================================================================
   UI UPDATE — takes whatever is in state.readings and renders it.
   Called by tick() whether data is mock or real Firebase.
================================================================ */
function updateAllUI() {
  const r = state.readings;

  // Push to history buffers
  Object.keys(state.history).forEach(key => {
    state.history[key].push(r[key]);
    if (state.history[key].length > CONFIG.HISTORY_POINTS) {
      state.history[key].shift();
    }
  });

  // Determine levels
  const levels = {
    temp:  getLevel(r.temp,  CONFIG.THRESH.temp.warn,  CONFIG.THRESH.temp.danger),
    air:   getLevel(r.air,   CONFIG.THRESH.air.warn,   CONFIG.THRESH.air.danger),
    dust:  getLevel(r.dust,  CONFIG.THRESH.dust.warn,  CONFIG.THRESH.dust.danger),
    hum:   getHumLevel(r.hum),
    sound: getLevel(r.sound, CONFIG.THRESH.sound.warn, CONFIG.THRESH.sound.danger),
  };

  // Update each sensor card
  updateNumericCard('temp',  r.temp.toFixed(1), levels.temp,
    (r.temp / 75) * 100);

  updateNumericCard('hum',   r.hum.toFixed(1),  levels.hum,
    r.hum);

  updateNumericCard('air',   Math.round(r.air).toString(), levels.air,
    (r.air / 4095) * 100);

  updateNumericCard('dust',  r.dust.toFixed(4), levels.dust,
    (r.dust / 1.0) * 100);

  updateSoundCard(r.sound, levels.sound);
  updateFanCard(r.fan, levels);
  updateSystemStatus(levels, r.fan);
  updateCharts();
  updateTimestamps();
  updateAlertBanner(r, levels);
}

/* ── Numeric card updater ────────────────────────────────────── */
function updateNumericCard(sensor, displayVal, level, fillPct) {
  const card  = dom[`card-${sensor}`];
  const badge = dom[`badge-${sensor}`];
  const val   = dom[`val-${sensor}`];
  const fill  = dom[`fill-${sensor}`];

  if (!card || !badge || !val || !fill) return;

  // Value — flash animation on change
  if (val.textContent !== displayVal) {
    val.classList.remove('flash');
    void val.offsetWidth; // reflow to restart animation
    val.classList.add('flash');
    val.textContent = displayVal;
  }

  // Progress bar
  fill.style.width = Math.min(100, Math.max(0, fillPct)) + '%';

  // Card state class
  card.classList.remove('state-warn', 'state-danger');
  if (level === 'danger') card.classList.add('state-danger');
  else if (level === 'warn') card.classList.add('state-warn');

  // Badge
  setBadge(badge, level === 'safe' ? 'SAFE' :
                  level === 'warn' ? 'WARN' : 'DANGER', level);
}

/* ── Sound card ──────────────────────────────────────────────── */
function updateSoundCard(soundValue, level) {
  const card      = dom['card-sound'];
  const indicator = dom['soundIndicator'];
  const status    = dom['soundStatus'];
  const badge     = dom['badge-sound'];
  const list      = dom['soundEventList'];

  const value = Number(soundValue || 0);
  const detected = value >= CONFIG.THRESH.sound.warn;

  if (detected) {
    card.classList.add(level === 'danger' ? 'state-danger' : 'state-warn');
    card.classList.remove(level === 'danger' ? 'state-warn' : 'state-danger');
    indicator.classList.add('sound-active');

    status.textContent = level === 'danger'
      ? `⚠ High sound level: ${Math.round(value)} raw`
      : `⚡ Sound level elevated: ${Math.round(value)} raw`;

    setBadge(badge, level === 'danger' ? 'DANGER' : 'WARN',
             level === 'danger' ? 'danger' : 'warn');
  } else {
    card.classList.remove('state-warn', 'state-danger');
    indicator.classList.remove('sound-active');
    status.textContent = `Sound level: ${Math.round(value)} raw`;
    setBadge(badge, 'QUIET', 'safe');
  }

  // Sound event mini-log
  if (list) {
    list.innerHTML = state.soundEvents.length === 0
      ? '<li style="color:var(--text-dim)">No events yet</li>'
      : state.soundEvents.map(t =>
          `<li><span class="evt-time">${t}</span> Sound ≥ ${CONFIG.THRESH.sound.warn}</li>`
        ).join('');
  }
}

/* ── Fan card ────────────────────────────────────────────────── */
function updateFanCard(fanOn, levels) {
  const card       = dom['card-fan'];
  const fanSvg     = dom['fanSvg'];
  const statusText = dom['fanStatusText'];
  const trigInfo   = dom['fanTriggerInfo'];
  const badge      = dom['badge-fan'];
  const headerIcon = dom['fanIconHeader'];

  if (!card) return;

  if (fanOn) {
    card.classList.add('fan-active-state', 'state-warn');
    fanSvg.classList.add('fan-spinning');
    statusText.textContent = 'ACTIVE — Purging air';
    setBadge(badge, 'ON', 'active');
    if (headerIcon) headerIcon.style.color = 'var(--accent)';

    // Build trigger reason string
    const triggers = [];
    if (levels.air   === 'danger') triggers.push('Air quality DANGER');
    if (levels.dust  === 'danger') triggers.push('Dust level DANGER');
    if (levels.temp  === 'danger') triggers.push('Temperature DANGER');
    if (levels.sound === 'danger') triggers.push('Sound DANGER');
    if (levels.air   === 'warn')   triggers.push('Air quality elevated');
    if (levels.dust  === 'warn')   triggers.push('Dust level elevated');
    if (levels.temp  === 'warn')   triggers.push('Temperature elevated');
    if (levels.sound === 'warn')   triggers.push('Sound elevated');
    trigInfo.textContent = triggers.length
      ? 'Triggers: ' + triggers.join(' · ')
      : 'Maintaining air quality';

  } else {
    card.classList.remove('fan-active-state', 'state-warn', 'state-danger');
    fanSvg.classList.remove('fan-spinning');
    statusText.textContent = 'Standby';
    trigInfo.textContent   = 'No active triggers';
    setBadge(badge, 'OFF', 'off');
    if (headerIcon) headerIcon.style.color = '';
  }
}

/* ── System status bar ───────────────────────────────────────── */
function updateSystemStatus(levels, fanOn) {
  const bar     = dom['systemStatusBar'];
  const orb     = dom['systemOrb'];
  const txt     = dom['systemStatusText'];
  if (!bar || !orb || !txt) return;

  const hasDanger = Object.values(levels).some(l => l === 'danger');
  const hasWarn   = Object.values(levels).some(l => l === 'warn');

  bar.classList.remove('status-warn', 'status-danger');
  orb.classList.remove('warn', 'danger');
  txt.classList.remove('warn', 'danger');

  if (hasDanger) {
    bar.classList.add('status-danger');
    orb.classList.add('danger');
    txt.classList.add('danger');
    txt.textContent = 'ALERT — DANGER CONDITION';
  } else if (hasWarn) {
    bar.classList.add('status-warn');
    orb.classList.add('warn');
    txt.classList.add('warn');
    txt.textContent = fanOn ? 'WARNING — FAN ACTIVE' : 'WARNING — ELEVATED LEVELS';
  } else {
    txt.textContent = 'NOMINAL';
  }
}

/* ── Alert banner ────────────────────────────────────────────── */
const _prevAlerts = new Set();

function updateAlertBanner(r, levels) {
  const activeAlerts = [];

  if (levels.temp  === 'danger') activeAlerts.push(`🌡 Temp ${r.temp.toFixed(1)}°C (DANGER)`);
  if (levels.air   === 'danger') activeAlerts.push(`💨 Air quality ${Math.round(r.air)} (DANGER)`);
  if (levels.dust  === 'danger') activeAlerts.push(`🌫 Dust ${r.dust.toFixed(4)} mg/m³ (DANGER)`);
  if (levels.sound === 'danger') activeAlerts.push(`🔊 Sound ${Math.round(r.sound)} raw (DANGER)`);
  if (levels.temp  === 'warn')   activeAlerts.push(`🌡 Temp ${r.temp.toFixed(1)}°C (Warning)`);
  if (levels.air   === 'warn')   activeAlerts.push(`💨 Air quality ${Math.round(r.air)} (Warning)`);
  if (levels.dust  === 'warn')   activeAlerts.push(`🌫 Dust ${r.dust.toFixed(4)} mg/m³ (Warning)`);
  if (levels.sound === 'warn')   activeAlerts.push(`🔊 Sound ${Math.round(r.sound)} raw (Warning)`);

  const banner   = dom['alertBanner'];
  const messages = dom['alertMessages'];

  if (activeAlerts.length > 0) {
    messages.innerHTML = activeAlerts
      .map(a => `<span>${a}</span>`).join('');
    banner.classList.add('visible');

    // Log new alerts only (avoid spamming the log)
    activeAlerts.forEach(a => {
      if (!_prevAlerts.has(a)) {
        const level = a.includes('DANGER') ? 'danger' : 'warn';
        addLogEntry(a, level);
      }
    });
    _prevAlerts.clear();
    activeAlerts.forEach(a => _prevAlerts.add(a));

  } else {
    banner.classList.remove('visible');
    if (_prevAlerts.size > 0) {
      addLogEntry('All readings returned to safe levels.', 'safe');
      _prevAlerts.clear();
    }
  }

  // Log fan state changes
  const fanKey = 'fan:' + state.readings.fan;
  if (!_prevAlerts.has(fanKey)) {
    if (state.readings.fan) {
      addLogEntry('Fan relay ACTIVATED — purging air.', 'fan');
    } else if (_prevAlerts.has('fan:true')) {
      addLogEntry('Fan relay deactivated.', 'info');
    }
    _prevAlerts.add(fanKey);
  }
}

/* ── Timestamps ──────────────────────────────────────────────── */
function updateTimestamps() {
  const t = state.lastUpdate;
  if (!t) return;
  const ts = formatTime(t);

  ['temp','hum','air','dust','sound','fan'].forEach(s => {
    const el = dom[`upd-${s}`];
    if (el) el.textContent = ts;
  });

  const lu = dom['lastUpdate'];
  if (lu) lu.textContent = ts;

  const cc = dom['cycleCount'];
  if (cc) cc.textContent = state.cycleCount;
}

/* ================================================================
   MINI CHARTS (Chart.js)
================================================================ */
function initCharts() {
  const sensors = ['temp', 'hum', 'air', 'dust'];
  const colors  = {
    temp: '#ff6b6b',
    hum:  '#4ecdc4',
    air:  '#ffe66d',
    dust: '#a8edea',
  };

  // Seed history with current values so charts don't start empty
  sensors.forEach(s => {
    for (let i = 0; i < CONFIG.HISTORY_POINTS; i++) {
      state.history[s].push(state.readings[s]);
    }
  });

  sensors.forEach(sensor => {
    const canvas = document.getElementById(`chart-${sensor}`);
    if (!canvas) return;

    const color = colors[sensor];

    charts[sensor] = new Chart(canvas, {
      type: 'line',
      data: {
        labels: Array(CONFIG.HISTORY_POINTS).fill(''),
        datasets: [{
          data:            [...state.history[sensor]],
          borderColor:     color,
          backgroundColor: color + '18',
          borderWidth:     1.5,
          pointRadius:     0,
          tension:         0.4,
          fill:            true,
        }],
      },
      options: {
        responsive:          true,
        maintainAspectRatio: false,
        animation:           { duration: 400 },
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: {
          x: { display: false },
          y: { display: false },
        },
      },
    });
  });
}

function updateCharts() {
  ['temp','hum','air','dust'].forEach(sensor => {
    const chart = charts[sensor];
    if (!chart) return;
    chart.data.datasets[0].data = [...state.history[sensor]];
    chart.update('none'); // 'none' skips animation for snappy updates
  });
}

/* ================================================================
   CLOCK & UPTIME
================================================================ */
function startClock() {
  function updateClock() {
    const now  = new Date();
    const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const mons = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

    if (dom['systemClock']) {
      dom['systemClock'].textContent = formatTime(now);
    }
    if (dom['systemDate']) {
      dom['systemDate'].textContent =
        `${days[now.getDay()]} ${now.getDate()} ${mons[now.getMonth()]} ${now.getFullYear()}`;
    }
  }
  updateClock();
  setInterval(updateClock, 1000);
}

function startUptime() {
  function updateUptime() {
    const elapsed = Math.floor((Date.now() - state.bootTime) / 1000);
    const h = Math.floor(elapsed / 3600);
    const m = Math.floor((elapsed % 3600) / 60);
    const s = elapsed % 60;
    if (dom['uptimeVal']) {
      dom['uptimeVal'].textContent =
        `${pad(h)}:${pad(m)}:${pad(s)}`;
    }
  }
  updateUptime();
  setInterval(updateUptime, 1000);
}

/* ================================================================
   HELPERS
================================================================ */

// Returns 'safe' | 'warn' | 'danger'
function getLevel(value, warnThresh, dangerThresh) {
  if (value >= dangerThresh) return 'danger';
  if (value >= warnThresh)   return 'warn';
  return 'safe';
}

// Humidity uses low + high thresholds instead of a single ramp
function getHumLevel(hum) {
  const { low, high } = CONFIG.THRESH.hum;
  if (hum <= low || hum >= high) return 'warn';
  return 'safe';
}

// Set badge text and class
function setBadge(el, text, level) {
  if (!el) return;
  el.textContent = text;
  el.className   = 'card-badge';
  if (level && level !== 'safe') el.classList.add(level);
}

// Add entry to the event log panel
function addLogEntry(message, type = 'info') {
  const list = dom['eventLogList'];
  if (!list) return;

  const li = document.createElement('li');
  li.className = `log-entry log-${type}`;
  const time = document.createElement('span');
  time.className = 'log-time';
  time.textContent = formatTime(new Date());
  const text = document.createElement('span');
  text.className = 'log-msg';
  text.textContent = message;
  li.append(time, text);

  list.prepend(li);

  // Keep log from growing unbounded
  while (list.children.length > 60) {
    list.removeChild(list.lastChild);
  }
}

function formatTime(date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function pad(n) { return String(n).padStart(2, '0'); }

/* ================================================================
   BOOT
================================================================ */
document.addEventListener('DOMContentLoaded', init);
