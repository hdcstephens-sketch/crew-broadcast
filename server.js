const express = require('express');
const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const http = require('http');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const JWT_SECRET = 'crew-broadcast-secret-key-2024';
const PORT = process.env.PORT || 3000;
const STORE_DIR = path.join(__dirname, 'data');
const STORE_FILE = path.join(STORE_DIR, 'state.json');

const USERS = {
  coach: { password: 'crew2024', role: 'coach', name: 'Head Coach' },
  admin: { password: 'admin123', role: 'admin', name: 'Administrator' },

  staff: { password: 'staff456', role: 'staff', name: 'Staff' }
};

const DEFAULT_TEAM_PRESETS = {
  'brooks-school': {
    id: 'brooks-school',
    name: 'Brooks School',
    shortName: 'Brooks',
    primaryColor: '#004830',
    secondaryColor: '#000000',
    textColor: '#FFFFFF',
    logo: '/images/brooks-logo.png'
  },
  'phillips-exeter': {
    id: 'phillips-exeter',
    name: 'Phillips Exeter',
    shortName: 'Exeter',
    primaryColor: '#8B0000',
    secondaryColor: '#F3F4F6',
    textColor: '#FFFFFF',
    logo: null
  },
  andover: {
    id: 'andover',
    name: 'Andover',
    shortName: 'Andover',
    primaryColor: '#2E7D32',
    secondaryColor: '#0F172A',
    textColor: '#FFFFFF',
    logo: null
  },
  'st-pauls': {
    id: 'st-pauls',
    name: "St. Paul's",
    shortName: "St. Paul's",
    primaryColor: '#4A148C',
    secondaryColor: '#EDE9FE',
    textColor: '#FFFFFF',
    logo: null
  },
  groton: {
    id: 'groton',
    name: 'Groton',
    shortName: 'Groton',
    primaryColor: '#E65100',
    secondaryColor: '#FFF7ED',
    textColor: '#FFFFFF',
    logo: null
  },
  middlesex: {
    id: 'middlesex',
    name: 'Middlesex',
    shortName: 'Middlesex',
    primaryColor: '#880E4F',
    secondaryColor: '#FDF2F8',
    textColor: '#FFFFFF',
    logo: null
  }
};

function laneFromPreset(teamPreset, lane) {
  return {
    lane,
    presetId: teamPreset.id,
    school: teamPreset.name,
    color: teamPreset.primaryColor,
    accentColor: teamPreset.secondaryColor,
    textColor: teamPreset.textColor,
    logo: teamPreset.logo || null
  };
}

function defaultOverlayState() {
  const teams = Object.values(DEFAULT_TEAM_PRESETS);
  return {
    eventHeader: {
      active: false,
      text: "Men's Varsity 8+ - Finals",
      subtitle: 'Spring Invitational 2026'
    },
    timer: { active: false, running: false, startTime: null, elapsed: 0 },
    countdown: { active: false, duration: 300, startTime: null },
    lanes: {
      active: false,
      data: teams.slice(0, 6).map((team, index) => laneFromPreset(team, index + 1))
    },
    schoolLogos: {
      active: false,
      title: 'Schools',
      items: teams.slice(0, 4).map(team => ({
        name: team.name,
        logo: team.logo || null
      }))
    },
    splits: {
      active: false,
      data: [
        { mark: '500m', time: '' },
        { mark: '1000m', time: '' },
        { mark: '1500m', time: '' },
        { mark: 'Finish', time: '' }
      ]
    },
    results: {
      active: false,
      data: [
        {
          place: 1,
          school: 'Brooks School',
          time: '6:02.4',
          margin: '-',
          lane: 1,
          logo: DEFAULT_TEAM_PRESETS['brooks-school'].logo || null
        },
        {
          place: 2,
          school: 'Phillips Exeter',
          time: '6:05.1',
          margin: '+2.7',
          lane: 2,
          logo: DEFAULT_TEAM_PRESETS['phillips-exeter'].logo || null
        },
        {
          place: 3,
          school: 'Andover',
          time: '6:07.8',
          margin: '+5.4',
          lane: 3,
          logo: DEFAULT_TEAM_PRESETS.andover.logo || null
        }
      ]
    },
    strokeRate: { active: false, value: 36, label: 'Leading Boat' },
    distance: { active: false, covered: 0, total: 2000 },
    lowerThird: { active: false, name: '', title: '', school: '' },
    watermark: { active: true, text: 'Brooks School Crew' },
    conditions: { active: false, wind: 'NW 8 mph', temp: '65°F', water: '58°F' }
  };
}

const DEFAULT_PRESET_CONFIGS = {
  'pre-race': { elements: ['eventHeader', 'lanes', 'schoolLogos', 'watermark'] },
  'race-start': { elements: ['eventHeader', 'lanes', 'countdown', 'watermark'] },
  'race-running': { elements: ['eventHeader', 'timer', 'strokeRate', 'distance', 'watermark'] },
  finish: { elements: ['eventHeader', 'timer', 'results', 'watermark'] },
  'post-race': { elements: ['eventHeader', 'results', 'schoolLogos', 'watermark'] },
  clear: { elements: [] }
};

const DEFAULT_DESIGN_CONFIG = {
  primaryColor: '#004830',
  secondaryColor: '#000000',
  accentColor: '#D1D1D1',
  textColor: '#FFFFFF',
  fontFamily: 'Rajdhani',
  animationStyle: 'slide',
  animationDuration: 0.6,
  borderRadius: 10,
  opacity: 0.92,
  showShadows: true,
  gradientStyle: 'brooks',
  elementLayout: {}
};

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function deepMerge(base, override) {
  if (Array.isArray(base)) {
    return Array.isArray(override) ? override : base;
  }

  if (isPlainObject(base)) {
    const result = { ...base };
    if (!isPlainObject(override)) return result;
    Object.entries(override).forEach(([key, value]) => {
      result[key] = key in base ? deepMerge(base[key], value) : value;
    });
    return result;
  }

  return override !== undefined ? override : base;
}

function getDefaultStore() {
  return {
    overlayState: defaultOverlayState(),
    designConfig: { ...DEFAULT_DESIGN_CONFIG },
    presetConfigs: { ...DEFAULT_PRESET_CONFIGS },
    teamPresets: { ...DEFAULT_TEAM_PRESETS },
    raceSchedule: []
  };
}

function loadStore() {
  const defaults = getDefaultStore();
  try {
    if (!fs.existsSync(STORE_FILE)) return defaults;
    const raw = fs.readFileSync(STORE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      overlayState: deepMerge(defaults.overlayState, parsed.overlayState),
      designConfig: deepMerge(defaults.designConfig, parsed.designConfig),
      presetConfigs: deepMerge(defaults.presetConfigs, parsed.presetConfigs),
      teamPresets: deepMerge(defaults.teamPresets, parsed.teamPresets),
      raceSchedule: Array.isArray(parsed.raceSchedule) ? parsed.raceSchedule : []
    };
  } catch (error) {
    console.error('Failed to load persisted state, using defaults.', error);
    return defaults;
  }
}

let { overlayState, designConfig, presetConfigs, teamPresets, raceSchedule } = loadStore();

function persistStore() {
  const data = { overlayState, designConfig, presetConfigs, teamPresets, raceSchedule };
  fs.mkdirSync(STORE_DIR, { recursive: true });
  fs.writeFileSync(STORE_FILE, JSON.stringify(data, null, 2));
}

function sanitizePresetId(input) {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function getStatePayload() {
  return { type: 'state', overlayState, designConfig, presetConfigs, teamPresets, raceSchedule, activeBroadcaster: !!activeAudioOffer };
}

function saveAndBroadcastState() {
  persistStore();
  const payload = getStatePayload();
  broadcast('overlay', payload);
  broadcast('controller', payload);
}

const clients = new Map();
let activeAudioOffer = null;

app.use(express.json({ limit: '25mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const user = USERS[username?.toLowerCase()];
  if (!user || user.password !== password) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign(
    { username: username.toLowerCase(), role: user.role, name: user.name },
    JWT_SECRET,
    { expiresIn: '8h' }
  );

  res.json({
    token,
    user: { username: username.toLowerCase(), role: user.role, name: user.name }
  });
});

app.get('/api/state', requireAuth, (req, res) => {
  res.json({ overlayState, designConfig, presetConfigs, teamPresets });
});

function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(auth.split(' ')[1], JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// Keep WebSocket connections alive through Railway's proxy timeout
const WS_PING_INTERVAL = 25000;
const wsHeartbeat = setInterval(() => {
  clients.forEach(({ ws }) => {
    if (ws.readyState === 1) ws.ping();
  });
}, WS_PING_INTERVAL);

wss.on('close', () => clearInterval(wsHeartbeat));

app.get('/api/ping', (_req, res) => res.json({ ok: true, ts: Date.now() }));

wss.on('connection', ws => {
  const clientId = uuidv4();
  clients.set(clientId, { ws, role: null, authenticated: false });
  ws.send(JSON.stringify({ type: 'connected', clientId }));
  ws.on('pong', () => {}); // keep-alive acknowledged

  ws.on('message', (raw, isBinary) => {
    if (isBinary) {
      const client = clients.get(clientId);
      if (client?.role === 'audio-broadcaster') {
        clients.forEach(c => {
          if (c.role === 'overlay' && c.ws.readyState === 1) {
            c.ws.send(raw, { binary: true });
          }
        });
      }
      return;
    }

    try {
      handleMessage(clientId, JSON.parse(raw));
    } catch {
      // Ignore malformed client messages.
    }
  });

  ws.on('close', () => {
    const client = clients.get(clientId);
    if (client?.role === 'audio-broadcaster') {
      activeAudioOffer = null;
      broadcast('overlay', { type: 'broadcaster-left' });
      broadcast('audio-monitor', { type: 'broadcaster-left' });
    }
    clients.delete(clientId);
  });
});

function handleMessage(clientId, msg) {
  const client = clients.get(clientId);
  if (!client) return;

  switch (msg.type) {
    case 'auth': {
      try {
        const user = jwt.verify(msg.token, JWT_SECRET);
        client.authenticated = true;
        client.user = user;
        client.role = 'controller';
        send(client, { type: 'auth-ok', user });
        send(client, getStatePayload());
      } catch {
        send(client, { type: 'auth-fail' });
        client.ws.close();
      }
      break;
    }

    case 'register': {
      if (msg.role === 'overlay' || msg.role === 'audio-monitor') {
        client.role = msg.role;
        client.authenticated = true;
        send(client, getStatePayload());
        if (msg.role === 'overlay' && activeAudioOffer) {
          send(client, { type: 'audio-offer', offer: activeAudioOffer.offer, from: activeAudioOffer.from });
        }
        // Tell monitor immediately if broadcaster is already live
        if (msg.role === 'audio-monitor' && activeAudioOffer) {
          send(client, { type: 'broadcaster-online' });
        }
      }
      break;
    }

    case 'toggle': {
      if (!client.authenticated) return;
      const element = overlayState[msg.element];
      if (!element) return;
      element.active = Boolean(msg.active);
      persistStore();
      broadcast('overlay', { type: 'toggle', element: msg.element, active: Boolean(msg.active) });
      broadcast('controller', { type: 'toggle', element: msg.element, active: Boolean(msg.active) });
      break;
    }

    case 'update': {
      if (!client.authenticated) return;
      if (!overlayState[msg.element] || !isPlainObject(msg.data)) return;
      Object.assign(overlayState[msg.element], msg.data);
      persistStore();
      broadcast('overlay', { type: 'update', element: msg.element, data: msg.data });
      broadcast('controller', { type: 'update', element: msg.element, data: msg.data });
      break;
    }

    case 'timer-control': {
      if (!client.authenticated) return;
      const timer = overlayState.timer;
      const now = Date.now();
      if (msg.action === 'start') {
        timer.running = true;
        timer.active = true;
        timer.startTime = now - (msg.elapsed || 0);
      } else if (msg.action === 'stop') {
        timer.running = false;
        timer.elapsed = msg.elapsed || 0;
      } else if (msg.action === 'reset') {
        timer.running = false;
        timer.startTime = null;
        timer.elapsed = 0;
      }
      persistStore();
      broadcast('overlay', {
        type: 'timer-control',
        action: msg.action,
        elapsed: msg.elapsed || 0,
        serverTime: now
      });
      broadcast('controller', {
        type: 'timer-control',
        action: msg.action,
        elapsed: msg.elapsed || 0
      });
      break;
    }

    case 'countdown-control': {
      if (!client.authenticated) return;
      const countdown = overlayState.countdown;
      const now = Date.now();
      if (msg.action === 'start') {
        countdown.active = true;
        countdown.duration = Math.max(0, Number(msg.duration) || countdown.duration || 300);
        countdown.startTime = now;
      } else if (msg.action === 'stop') {
        countdown.active = false;
      } else if (msg.action === 'reset') {
        countdown.active = false;
        countdown.startTime = null;
      }
      persistStore();
      broadcast('overlay', {
        type: 'countdown-control',
        action: msg.action,
        duration: countdown.duration,
        startTime: countdown.startTime
      });
      broadcast('controller', {
        type: 'countdown-control',
        action: msg.action,
        duration: countdown.duration,
        startTime: countdown.startTime
      });
      break;
    }

    case 'design': {
      if (!client.authenticated || !isPlainObject(msg.config)) return;
      designConfig = deepMerge(designConfig, msg.config);
      persistStore();
      broadcast('overlay', { type: 'design', config: designConfig });
      broadcast('controller', { type: 'design', config: designConfig });
      break;
    }

    case 'preset': {
      if (!client.authenticated) return;
      applyPreset(msg.preset);
      break;
    }

    case 'preset-config': {
      if (!client.authenticated) return;
      if (msg.name && Array.isArray(msg.elements) && presetConfigs[msg.name] !== undefined) {
        presetConfigs[msg.name] = { elements: msg.elements };
        persistStore();
        broadcast('controller', { type: 'preset-config', name: msg.name, elements: msg.elements });
      }
      break;
    }

    case 'team-preset-save': {
      if (!client.authenticated || !isPlainObject(msg.preset)) return;
      const name = String(msg.preset.name || '').trim();
      if (!name) return;
      const id = sanitizePresetId(msg.preset.id || name);
      if (!id) return;

      teamPresets[id] = {
        id,
        name,
        shortName: String(msg.preset.shortName || name).trim(),
        primaryColor: msg.preset.primaryColor || '#004830',
        secondaryColor: msg.preset.secondaryColor || '#000000',
        textColor: msg.preset.textColor || '#FFFFFF',
        logo: msg.preset.logo || null
      };

      persistStore();
      broadcast('controller', { type: 'team-presets', teamPresets });
      break;
    }

    case 'team-preset-delete': {
      if (!client.authenticated) return;
      const id = sanitizePresetId(msg.id);
      if (!id || !teamPresets[id]) return;
      delete teamPresets[id];
      persistStore();
      broadcast('controller', { type: 'team-presets', teamPresets });
      break;
    }

    case 'race-schedule-save': {
      if (!client.authenticated) return;
      if (!Array.isArray(msg.schedule)) return;
      raceSchedule = msg.schedule.slice(0, 100).map(r => ({
        name: String(r.name || '').slice(0, 120),
        sub: String(r.sub || '').slice(0, 120)
      }));
      persistStore();
      broadcast('controller', { type: 'race-schedule', schedule: raceSchedule });
      break;
    }

    case 'alert': {
      if (!client.authenticated) return;
      const alertText = String(msg.text || '').slice(0, 120);
      const alertDuration = Math.min(15, Math.max(1, Number(msg.duration) || 3));
      if (alertText) broadcast('overlay', { type: 'alert', text: alertText, duration: alertDuration });
      break;
    }

    case 'audio-offer': {
      if (!client.authenticated) return;
      if (msg.to) {
        // Targeted offer from broadcaster → specific monitor client
        const target = clients.get(msg.to);
        if (target) send(target, { type: 'audio-offer', offer: msg.offer, from: clientId });
      } else {
        // Broadcast offer → OBS overlay + notify all monitor clients to request audio
        client.role = 'audio-broadcaster';
        activeAudioOffer = { offer: msg.offer, from: clientId };
        broadcast('overlay', { type: 'audio-offer', offer: msg.offer, from: clientId });
        broadcast('audio-monitor', { type: 'broadcaster-online' });
      }
      break;
    }

    case 'request-audio': {
      // Monitor client asks broadcaster to open a dedicated connection
      const broadcaster = [...clients.values()].find(c => c.role === 'audio-broadcaster');
      if (broadcaster) {
        send(broadcaster, { type: 'listener-request', from: clientId });
      }
      break;
    }

    case 'audio-answer': {
      const target = clients.get(msg.to);
      if (target) send(target, { type: 'audio-answer', answer: msg.answer, from: clientId });
      break;
    }

    case 'ice-candidate': {
      const target = clients.get(msg.to);
      if (target) {
        send(target, { type: 'ice-candidate', candidate: msg.candidate, from: clientId });
      }
      break;
    }

    case 'find-broadcaster': {
      if (activeAudioOffer) {
        send(client, { type: 'broadcaster-found', id: activeAudioOffer.from });
      }
      break;
    }
  }
}

function send(client, msg) {
  if (client.ws.readyState === 1) client.ws.send(JSON.stringify(msg));
}

function broadcast(role, msg) {
  const data = JSON.stringify(msg);
  clients.forEach(client => {
    if (client.authenticated && client.role === role && client.ws.readyState === 1) {
      client.ws.send(data);
    }
  });
}

function applyPreset(preset) {
  const config = presetConfigs[preset];
  const activeElements = config?.elements || [];

  Object.keys(overlayState).forEach(key => {
    if (!isPlainObject(overlayState[key]) || !('active' in overlayState[key])) return;
    overlayState[key].active = activeElements.includes(key);
  });

  if (preset === 'race-start') {
    overlayState.countdown.active = true;
    overlayState.countdown.startTime = Date.now();
  } else if (preset !== 'race-start') {
    overlayState.countdown.active = false;
    overlayState.countdown.startTime = null;
  }

  if (preset === 'race-running' && !overlayState.timer.running) {
    overlayState.timer.active = true;
    overlayState.timer.running = true;
    overlayState.timer.startTime = Date.now();
    overlayState.timer.elapsed = 0;
  }

  persistStore();
  const payload = getStatePayload();
  broadcast('overlay', payload);
  broadcast('controller', payload);
}

server.listen(PORT, () => {
  console.log('\nCREW Broadcast System');
  console.log(`   Running at http://localhost:${PORT}`);
  console.log(`   OBS Overlay: http://localhost:${PORT}/overlay.html\n`);
});
