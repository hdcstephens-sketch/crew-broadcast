const express = require('express');
const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const JWT_SECRET = 'crew-broadcast-secret-key-2024';
const PORT = process.env.PORT || 3000;
const STORE_DIR = path.join(__dirname, 'data');
const STORE_FILE = path.join(STORE_DIR, 'state.json');

const dbPool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    })
  : null;

const USERS = {
  admin:  { password: 'admin123',  role: 'admin',  name: 'Administrator', teamName: 'Brooks School', firstLogin: false },
  coach:  { password: 'crew2024',  role: 'coach',  name: 'Head Coach',    teamName: 'Brooks School', firstLogin: false },
  staff:  { password: 'staff456',  role: 'staff',  name: 'Staff',         teamName: 'Brooks School', firstLogin: false }
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
      text: '',
      subtitle: ''
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
    watermark: { active: true, text: '', teamLogo: null },
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

const DEFAULT_BOATS = {
  'boys-varsity-1': { id: 'boys-varsity-1', name: 'Boys Varsity 1', boatClass: '', athletes: [] },
  'boys-varsity-2': { id: 'boys-varsity-2', name: 'Boys Varsity 2', boatClass: '', athletes: [] },
  'boys-varsity-3': { id: 'boys-varsity-3', name: 'Boys Varsity 3', boatClass: '', athletes: [] },
  'boys-varsity-4': { id: 'boys-varsity-4', name: 'Boys Varsity 4', boatClass: '', athletes: [] },
  'boys-jv-1':      { id: 'boys-jv-1',      name: 'Boys JV 1',      boatClass: '', athletes: [] },
  'boys-jv-2':      { id: 'boys-jv-2',      name: 'Boys JV 2',      boatClass: '', athletes: [] },
  'girls-varsity-1': { id: 'girls-varsity-1', name: 'Girls Varsity 1', boatClass: '', athletes: [] },
  'girls-varsity-2': { id: 'girls-varsity-2', name: 'Girls Varsity 2', boatClass: '', athletes: [] },
  'girls-varsity-3': { id: 'girls-varsity-3', name: 'Girls Varsity 3', boatClass: '', athletes: [] },
  'girls-varsity-4': { id: 'girls-varsity-4', name: 'Girls Varsity 4', boatClass: '', athletes: [] },
  'girls-jv-1':      { id: 'girls-jv-1',      name: 'Girls JV 1',      boatClass: '', athletes: [] },
  'girls-jv-2':      { id: 'girls-jv-2',      name: 'Girls JV 2',      boatClass: '', athletes: [] }
};

function getDefaultStore() {
  return {
    overlayState: defaultOverlayState(),
    designConfig: { ...DEFAULT_DESIGN_CONFIG },
    presetConfigs: { ...DEFAULT_PRESET_CONFIGS },
    teamPresets: { ...DEFAULT_TEAM_PRESETS },
    raceSchedule: [],
    raceRosters: {},
    currentRaceId: null,
    boats: { ...DEFAULT_BOATS },
    users: {}
  };
}

function parseStoreData(parsed, defaults) {
  return {
    overlayState: deepMerge(defaults.overlayState, parsed.overlayState),
    designConfig: deepMerge(defaults.designConfig, parsed.designConfig),
    presetConfigs: deepMerge(defaults.presetConfigs, parsed.presetConfigs),
    teamPresets: deepMerge(defaults.teamPresets, parsed.teamPresets),
    raceSchedule: Array.isArray(parsed.raceSchedule) ? parsed.raceSchedule : [],
    raceRosters: isPlainObject(parsed.raceRosters) ? parsed.raceRosters : {},
    currentRaceId: parsed.currentRaceId || null,
    boats: isPlainObject(parsed.boats) ? { ...DEFAULT_BOATS, ...parsed.boats } : { ...DEFAULT_BOATS },
    users: isPlainObject(parsed.users) ? parsed.users : {}
  };
}

async function loadStore() {
  const defaults = getDefaultStore();

  if (dbPool) {
    try {
      const result = await dbPool.query("SELECT value FROM app_state WHERE key = 'state'");
      if (result.rows.length > 0) {
        console.log('State loaded from database.');
        return parseStoreData(result.rows[0].value, defaults);
      }
      console.log('No saved state in database, using defaults.');
      return defaults;
    } catch (err) {
      console.error('DB load failed, falling back to file:', err.message);
    }
  }

  try {
    if (!fs.existsSync(STORE_FILE)) return defaults;
    const raw = fs.readFileSync(STORE_FILE, 'utf8');
    return parseStoreData(JSON.parse(raw), defaults);
  } catch (error) {
    console.error('Failed to load persisted state, using defaults.', error);
    return defaults;
  }
}

let overlayState, designConfig, presetConfigs, teamPresets, raceSchedule, raceRosters, currentRaceId, boats, users;

function persistStore() {
  const data = { overlayState, designConfig, presetConfigs, teamPresets, raceSchedule, raceRosters, currentRaceId, boats, users };

  if (dbPool) {
    dbPool.query(
      "INSERT INTO app_state (key, value) VALUES ('state', $1::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
      [JSON.stringify(data)]
    ).catch(err => console.error('DB persist error:', err.message));
    return;
  }

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
  return {
    type: 'state',
    overlayState,
    designConfig,
    presetConfigs,
    teamPresets,
    raceSchedule,
    raceRosters,
    currentRaceId,
    boats,
    activeBroadcaster: Boolean(activeBroadcasterId && clients.has(activeBroadcasterId)),
    activeMimeType,
    hasPDF: fs.existsSync(path.join(__dirname, 'public', 'uploads', 'schedule.pdf'))
  };
}

function saveAndBroadcastState() {
  persistStore();
  const payload = getStatePayload();
  broadcast('overlay', payload);
  broadcast('controller', payload);
  broadcast('viewer', payload);
}

const clients = new Map();
let activeBroadcasterId = null;
let audioInitChunk = null;
let activeMimeType = 'audio/webm;codecs=opus';

app.use(express.json({ limit: '25mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const id = username?.toLowerCase();
  const legacyUser = USERS[id];
  const dynamicUser = !legacyUser ? users[id] : null;
  const user = legacyUser || dynamicUser;

  if (!user || user.password !== password) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const payload = {
    username: id,
    role: user.role,
    name: user.name,
    teamName: user.teamName || '',
    firstLogin: Boolean(user.firstLogin)
  };

  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' });

  res.json({ token, user: payload });
});

app.post('/api/register', (req, res) => {
  const { username, password, teamName } = req.body || {};

  if (!username || !password || !teamName) {
    return res.status(400).json({ error: 'username, password, and teamName are required' });
  }

  const id = String(username).toLowerCase();

  if (!/^[a-z0-9_]{3,30}$/.test(id)) {
    return res.status(400).json({ error: 'username must be 3-30 characters: letters, numbers, underscores only' });
  }

  if (String(password).length < 6) {
    return res.status(400).json({ error: 'password must be at least 6 characters' });
  }

  if (String(teamName).trim().length === 0 || String(teamName).length > 60) {
    return res.status(400).json({ error: 'teamName must be 1-60 characters' });
  }

  if (USERS[id] || users[id]) {
    return res.status(409).json({ error: 'Username already taken' });
  }

  const name = String(teamName).trim() + ' Admin';
  const record = {
    username: id,
    password: String(password),
    role: 'admin',
    name,
    teamName: String(teamName).trim(),
    firstLogin: true
  };

  users[id] = record;
  persistStore();

  const payload = {
    username: id,
    role: record.role,
    name: record.name,
    teamName: record.teamName,
    firstLogin: true
  };

  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' });

  res.json({ token, user: payload });
});

app.post('/api/me/onboarded', requireAuth, (req, res) => {
  const { username } = req.user;
  if (!users[username]) {
    return res.status(404).json({ error: 'User not found' });
  }
  users[username].firstLogin = false;
  persistStore();
  res.json({ ok: true });
});

app.get('/api/state', requireAuth, (req, res) => {
  res.json({
    overlayState,
    designConfig,
    presetConfigs,
    teamPresets,
    raceSchedule,
    raceRosters,
    currentRaceId,
    boats
  });
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

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
}

const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');

app.post('/api/upload-schedule',
  requireAuth,
  requireAdmin,
  express.raw({ type: 'application/pdf', limit: '50mb' }),
  (req, res) => {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    fs.writeFileSync(path.join(UPLOAD_DIR, 'schedule.pdf'), req.body);
    res.json({ ok: true });
  }
);

app.delete('/api/upload-schedule', requireAuth, requireAdmin, (req, res) => {
  const f = path.join(UPLOAD_DIR, 'schedule.pdf');
  if (fs.existsSync(f)) fs.unlinkSync(f);
  res.json({ ok: true });
});

const ATHLETE_PHOTO_DIR = path.join(__dirname, 'public', 'media', 'athletes');

app.post('/api/upload/athlete-photo',
  requireAuth,
  requireAdmin,
  express.raw({ type: req => /^image\/(jpeg|png|webp|gif)$/.test(req.headers['content-type'] || ''), limit: '10mb' }),
  (req, res) => {
    if (!req.body || !req.body.length) return res.status(400).json({ error: 'No image data' });
    const ext = (req.headers['content-type'] || 'image/jpeg').split('/')[1].split(';')[0];
    const filename = `${uuidv4()}.${ext}`;
    fs.mkdirSync(ATHLETE_PHOTO_DIR, { recursive: true });
    fs.writeFileSync(path.join(ATHLETE_PHOTO_DIR, filename), req.body);
    res.json({ ok: true, path: `/media/athletes/${filename}` });
  }
);

app.delete('/api/upload/athlete-photo', requireAuth, requireAdmin, (req, res) => {
  const filename = path.basename(req.query.file || '');
  if (!filename) return res.status(400).json({ error: 'No filename' });
  const filepath = path.join(ATHLETE_PHOTO_DIR, filename);
  if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
  res.json({ ok: true });
});

const GRID_PHOTO_DIR = path.join(__dirname, 'public', 'media', 'grid');

app.post('/api/upload/grid-photo',
  requireAuth,
  requireAdmin,
  express.raw({ type: req => /^image\/(jpeg|png|webp|gif)$/.test(req.headers['content-type'] || ''), limit: '10mb' }),
  (req, res) => {
    if (!req.body || !req.body.length) return res.status(400).json({ error: 'No image data' });
    const ext = (req.headers['content-type'] || 'image/jpeg').split('/')[1].split(';')[0];
    const filename = `${uuidv4()}.${ext}`;
    fs.mkdirSync(GRID_PHOTO_DIR, { recursive: true });
    fs.writeFileSync(path.join(GRID_PHOTO_DIR, filename), req.body);
    res.json({ ok: true, path: `/media/grid/${filename}` });
  }
);

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
      if (client?.role !== 'audio-broadcaster') return;
      if (!audioInitChunk) audioInitChunk = raw; // save init segment for late joiners
      clients.forEach(({ ws: cws, role }) => {
        if (role === 'audio-monitor' && cws.readyState === 1) cws.send(raw);
      });
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
    if (activeBroadcasterId === clientId || client?.role === 'audio-broadcaster') {
      activeBroadcasterId = null;
      audioInitChunk = null;
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
      if (msg.role === 'overlay' || msg.role === 'audio-monitor' || msg.role === 'viewer') {
        client.role = msg.role;
        client.authenticated = true;
        send(client, getStatePayload());
        if (activeBroadcasterId) {
          if (msg.role === 'overlay') {
            send(client, { type: 'broadcaster-online', mimeType: activeMimeType });
          }
          if (msg.role === 'audio-monitor' && audioInitChunk) {
            // state already carries activeBroadcaster:true — just send the init chunk
            // so the monitor can decode from mid-stream without a double-setup race
            client.ws.send(audioInitChunk);
          }
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

    case 'save-widgets': {
      if (!client.authenticated || !isPlainObject(msg.widgets)) return;
      Object.entries(msg.widgets).forEach(([key, active]) => {
        if (overlayState[key] && 'active' in overlayState[key]) {
          overlayState[key].active = Boolean(active);
        }
      });
      saveAndBroadcastState();
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
      broadcast('viewer',     { type: 'race-schedule', schedule: raceSchedule });
      break;
    }

    case 'alert': {
      if (!client.authenticated) return;
      const alertText = String(msg.text || '').slice(0, 120);
      const alertDuration = Math.min(15, Math.max(1, Number(msg.duration) || 3));
      if (alertText) broadcast('overlay', { type: 'alert', text: alertText, duration: alertDuration });
      break;
    }

    case 'grid-start': {
      if (!client.authenticated) return;
      const entries = Array.isArray(msg.entries)
        ? msg.entries.slice(0, 20).map(e => ({
            lane:   String(e.lane   || '').slice(0, 10),
            name:   String(e.name   || '').slice(0, 80),
            school: String(e.school || '').slice(0, 80),
            image:  String(e.image  || '').slice(0, 300)
          }))
        : [];
      const duration = Math.min(15000, Math.max(2000, Number(msg.duration) || 5000));
      broadcast('overlay', { type: 'grid-start', entries, duration });
      break;
    }

    case 'grid-stop': {
      if (!client.authenticated) return;
      broadcast('overlay', { type: 'grid-stop' });
      break;
    }

    case 'play-intro': {
      if (!client.authenticated) return;
      const introId = String(msg.intro || '').slice(0, 64);
      if (!introId) return;
      const race = currentRaceId ? (raceSchedule.find(r => r.id === currentRaceId) || null) : null;
      // Prefer boat roster if race has a boatId, fall back to raceRoster
      let roster = null;
      if (race?.boatId && boats[race.boatId]) {
        roster = boats[race.boatId];
      } else if (currentRaceId && raceRosters[currentRaceId]) {
        roster = raceRosters[currentRaceId];
      }
      const duration = introId === 'athletes' && roster
        ? Math.max(6, (roster.athletes || []).length * 5)
        : 6;
      broadcast('overlay',    { type: 'play-intro', intro: introId, race, roster });
      broadcast('controller', { type: 'intro-playing', intro: introId, duration });
      break;
    }

    case 'boats-save': {
      if (!client.authenticated || client.user?.role !== 'admin') return;
      if (!isPlainObject(msg.boats)) return;
      Object.entries(msg.boats).forEach(([id, boat]) => {
        if (!isPlainObject(boat) || !boats[id]) return;
        boats[id] = {
          id:        String(boat.id || id).slice(0, 64),
          name:      String(boat.name || '').slice(0, 80),
          boatClass: String(boat.boatClass || '').slice(0, 80),
          athletes: Array.isArray(boat.athletes) ? boat.athletes.slice(0, 20).map(a => ({
            id:        String(a.id        || uuidv4()).slice(0, 64),
            name:      String(a.name      || '').slice(0, 80),
            seat:      String(a.seat      || '').slice(0, 40),
            photoPath: String(a.photoPath || '').slice(0, 200)
          })) : []
        };
      });
      persistStore();
      broadcast('controller', { type: 'boats-saved', boats, raceSchedule, currentRaceId });
      broadcast('overlay',    { type: 'boats-saved', boats, raceSchedule, currentRaceId });
      break;
    }

    case 'setup-save': {
      if (!client.authenticated || client.user?.role !== 'admin') return;
      if (Array.isArray(msg.raceSchedule)) {
        raceSchedule = msg.raceSchedule.slice(0, 100).map(r => ({
          id:     String(r.id     || uuidv4()).slice(0, 64),
          name:   String(r.name   || '').slice(0, 120),
          sub:    String(r.sub    || '').slice(0, 120),
          boatId: r.boatId ? String(r.boatId).slice(0, 64) : null
        }));
      }
      if (isPlainObject(msg.raceRosters)) {
        raceRosters = {};
        Object.entries(msg.raceRosters).forEach(([raceId, roster]) => {
          if (!isPlainObject(roster)) return;
          raceRosters[raceId] = {
            boatClass: String(roster.boatClass || '').slice(0, 80),
            athletes: Array.isArray(roster.athletes) ? roster.athletes.slice(0, 20).map(a => ({
              id:        String(a.id        || uuidv4()).slice(0, 64),
              name:      String(a.name      || '').slice(0, 80),
              seat:      String(a.seat      || '').slice(0, 40),
              photoPath: String(a.photoPath || '').slice(0, 200)
            })) : []
          };
        });
      }
      if (!raceSchedule.some(r => r.id === currentRaceId)) {
        currentRaceId = raceSchedule[0]?.id || null;
      }
      persistStore();
      broadcast('controller', { type: 'setup-saved', raceSchedule, raceRosters, currentRaceId, boats });
      broadcast('overlay',    { type: 'setup-saved', raceSchedule, raceRosters, currentRaceId, boats });
      break;
    }

    case 'conditions-save': {
      if (!client.authenticated) return;
      const wind  = String(msg.wind  || '').slice(0, 40);
      const air   = String(msg.air   || '').slice(0, 40);
      const water = String(msg.water || '').slice(0, 40);
      overlayState.conditions = { ...overlayState.conditions, wind, temp: air, water };
      persistStore();
      broadcast('overlay',     { type: 'conditions', wind, air, water });
      broadcast('controller',  { type: 'conditions', wind, air, water });
      break;
    }

    case 'current-race-set': {
      if (!client.authenticated) return;
      const nextRaceId = msg.raceId ? String(msg.raceId) : null;
      currentRaceId = nextRaceId && raceSchedule.some(r => r.id === nextRaceId) ? nextRaceId : null;
      persistStore();
      broadcast('controller', { type: 'current-race-set', raceId: currentRaceId });
      broadcast('overlay',    { type: 'current-race-set', raceId: currentRaceId });
      break;
    }

    case 'start-broadcast': {
      if (!client.authenticated) return;
      if (activeBroadcasterId && activeBroadcasterId !== clientId) {
        const previous = clients.get(activeBroadcasterId);
        if (previous) previous.role = 'controller';
      }
      activeBroadcasterId = clientId;
      client.role = 'audio-broadcaster';
      activeMimeType = msg.mimeType || 'audio/webm;codecs=opus';
      audioInitChunk = null; // clear stale init chunk from previous session
      broadcast('overlay', { type: 'broadcaster-online' });
      broadcast('audio-monitor', { type: 'broadcaster-online', mimeType: activeMimeType });
      break;
    }

    case 'end-broadcast': {
      if (client?.role !== 'audio-broadcaster' && activeBroadcasterId !== clientId) return;
      client.role = 'controller';
      activeBroadcasterId = null;
      audioInitChunk = null;
      broadcast('overlay', { type: 'broadcaster-left' });
      broadcast('audio-monitor', { type: 'broadcaster-left' });
      break;
    }

    case 'audio-offer': {
      if (!client.authenticated || !msg.to) return;
      const target = clients.get(msg.to);
      if (target) send(target, { type: 'audio-offer', offer: msg.offer, from: clientId });
      break;
    }

    case 'request-audio': {
      if (!client.authenticated) return;
      const broadcaster = activeBroadcasterId ? clients.get(activeBroadcasterId) : null;
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
      if (activeBroadcasterId) {
        send(client, { type: 'broadcaster-found', id: activeBroadcasterId });
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

async function startServer() {
  if (dbPool) {
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS app_state (
        key TEXT PRIMARY KEY,
        value JSONB NOT NULL
      )
    `);
    console.log('PostgreSQL connected — state will save to cloud database.');
  }

  const state = await loadStore();
  overlayState  = state.overlayState;
  designConfig  = state.designConfig;
  presetConfigs = state.presetConfigs;
  teamPresets   = state.teamPresets;
  raceSchedule  = state.raceSchedule;
  raceRosters   = state.raceRosters;
  currentRaceId = state.currentRaceId;
  boats         = state.boats;
  users         = state.users;

  server.listen(PORT, () => {
    console.log('\nCREW Broadcast System');
    console.log(`   Running at http://localhost:${PORT}`);
    console.log(`   OBS Overlay: http://localhost:${PORT}/overlay.html\n`);
    if (!dbPool) console.log('   Storage: local file (data/state.json)');
    else         console.log('   Storage: cloud PostgreSQL database');
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
