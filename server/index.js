const express = require('express');
const http = require('http');
const crypto = require('crypto');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.set('trust proxy', 1);

// Configure the exact browser origins that may call the API/socket server:
//   CORS_ORIGINS=https://game.example.com,https://preview.example.com
// Local origins stay available for development. Production deliberately does
// not fall back to "*"; deployments must name their browser origin(s).
const LOCAL_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
];
const DEPLOYED_BROWSER_ORIGINS = [
  'https://rp-game-three.vercel.app',
];
const configuredOrigins = String(process.env.CORS_ORIGINS || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);
// Environment-provided origins extend the known browser origins instead of
// accidentally removing the production site or local development access.
const ALLOWED_ORIGINS = new Set([
  ...LOCAL_ORIGINS,
  ...DEPLOYED_BROWSER_ORIGINS,
  ...configuredOrigins,
]);
const isSafeBrowserOrigin = (origin) => {
  if (ALLOWED_ORIGINS.has(origin)) return true;
  try {
    const parsed = new URL(origin);
    const isLocal = parsed.protocol === 'http:'
      && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1');
    const isProjectPreview = parsed.protocol === 'https:'
      && /^rp-game-three-[a-z0-9-]+\.vercel\.app$/i.test(parsed.hostname);
    return (isLocal || isProjectPreview)
      && parsed.username === ''
      && parsed.password === ''
      && parsed.pathname === '/'
      && parsed.search === ''
      && parsed.hash === '';
  } catch {
    return false;
  }
};
const corsOrigin = (origin, callback) => {
  // Native apps, curl, health checks and same-origin requests send no Origin.
  if (!origin || isSafeBrowserOrigin(origin)) return callback(null, true);
  return callback(new Error('Origin is not allowed by CORS'));
};
const corsOptions = {
  origin: corsOrigin,
  methods: ['GET', 'POST', 'PUT', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false,
  maxAge: 86400,
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
// Saves can be sizeable, but an unbounded JSON parser is an easy memory DoS.
app.use(express.json({ limit: process.env.MAX_SAVE_BYTES || '2mb' }));

const { Pool } = require('pg');

// Database Connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL, // Railway provides this automatically
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false // Railway requires SSL for DB
});

/**
 * With no DATABASE_URL the server used to answer every auth request with
 * "Database error", so the game could not be opened locally at all - which
 * meant visual changes could only ever be checked against production. This
 * keeps guests in memory instead. Railway always sets DATABASE_URL, so this
 * path cannot be reached there.
 */
const HAS_DB = Boolean(process.env.DATABASE_URL);
const memUsers = new Map(); // uuid -> { username, password(hash), short_id, uuid, save_data }

// Production/database deployments require a signed session by default. A
// database-free local server remains compatible with the existing CLI co-op
// tests; set AUTH_REQUIRED=true to exercise the strict path locally.
const AUTH_REQUIRED = process.env.AUTH_REQUIRED
  ? process.env.AUTH_REQUIRED !== 'false'
  : (HAS_DB || process.env.NODE_ENV === 'production');
const SESSION_TTL_SECONDS = Math.min(
  60 * 60 * 24 * 30,
  Math.max(60 * 5, Number(process.env.SESSION_TTL_SECONDS) || 60 * 60 * 24 * 7)
);
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

if (!process.env.SESSION_SECRET) {
  console.warn('SESSION_SECRET is not set; sessions will be invalidated when this server restarts.');
}

if (!HAS_DB) {
  console.warn('Running without a database: guest accounts live in memory for this process only.');
}

// Initialize Database Table
async function initDB() {
  try {
    if (!process.env.DATABASE_URL) {
      console.warn("No DATABASE_URL found. Skipping DB init (running in memory mode?)");
      return;
    }
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        short_id VARCHAR(50) UNIQUE NOT NULL,
        uuid VARCHAR(255) UNIQUE NOT NULL,
        save_data JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    // Added after the table existed, so it has to be additive.
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS power INTEGER DEFAULT 0;`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS power_class VARCHAR(40);`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS power_level INTEGER DEFAULT 1;`);
    // Friendships are stored once per pair, with the two uuids ordered so the
    // relationship is inherently mutual and cannot be duplicated.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS friendships (
        uuid_low  VARCHAR(255) NOT NULL,
        uuid_high VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (uuid_low, uuid_high)
      );
    `);
    console.log("Database tables initialized.");
  } catch (err) {
    console.error("DB Init error:", err);
  }
}
initDB();

// Healthcheck endpoint for Railway
app.get('/', (req, res) => {
  res.send('RPGame Multiplayer Server is running!');
});


// ----------------- HTTP API ENDPOINTS -----------------

const PASSWORD_PREFIX = 'scrypt';
const PASSWORD_KEY_BYTES = 64;
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function generateRandomPassword() {
  // 72 bits of crypto randomness, shown exactly once when the guest is made.
  return crypto.randomBytes(9).toString('base64url');
}

/** Display names are rendered in several legacy innerHTML templates. Keep one
 * server policy for every account/socket entry point until those consumers are
 * migrated to textContent. */
function safeDisplayName(value) {
  if (typeof value !== 'string') return null;
  const name = value.trim();
  if (name.length < 3 || name.length > 32) return null;
  if (/[\u0000-\u001f\u007f<>&"'`]/.test(name)) return null;
  return name;
}

function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16);
    crypto.scrypt(password, salt, PASSWORD_KEY_BYTES, SCRYPT_OPTIONS, (error, key) => {
      if (error) return reject(error);
      resolve(`${PASSWORD_PREFIX}$${salt.toString('base64url')}$${key.toString('base64url')}`);
    });
  });
}

function verifyPassword(password, stored) {
  if (typeof password !== 'string' || typeof stored !== 'string') return Promise.resolve(false);
  if (!stored.startsWith(`${PASSWORD_PREFIX}$`)) {
    // Migration path for accounts created before password hashing. The caller
    // replaces this value with a hash immediately after a successful login.
    const supplied = Buffer.from(password);
    const legacy = Buffer.from(stored);
    return Promise.resolve(supplied.length === legacy.length && crypto.timingSafeEqual(supplied, legacy));
  }

  const [, saltText, hashText] = stored.split('$');
  if (!saltText || !hashText) return Promise.resolve(false);
  let salt;
  let expected;
  try {
    salt = Buffer.from(saltText, 'base64url');
    expected = Buffer.from(hashText, 'base64url');
  } catch {
    return Promise.resolve(false);
  }
  if (salt.length !== 16 || expected.length !== PASSWORD_KEY_BYTES) return Promise.resolve(false);
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, expected.length, SCRYPT_OPTIONS, (error, key) => {
      if (error) return reject(error);
      resolve(key.length === expected.length && crypto.timingSafeEqual(key, expected));
    });
  });
}

function base64urlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function signSession(user) {
  const now = Math.floor(Date.now() / 1000);
  const displayName = safeDisplayName(user.username);
  if (!displayName) throw new Error('Unsafe stored display name');
  const payload = base64urlJson({
    sub: user.uuid,
    name: displayName,
    shortId: user.short_id,
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
  });
  const signature = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function verifySession(token) {
  if (typeof token !== 'string' || token.length > 4096) return null;
  const [payloadText, signatureText] = token.split('.');
  if (!payloadText || !signatureText) return null;
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(payloadText).digest();
  let supplied;
  try {
    supplied = Buffer.from(signatureText, 'base64url');
  } catch {
    return null;
  }
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) return null;

  try {
    const claims = JSON.parse(Buffer.from(payloadText, 'base64url').toString('utf8'));
    if (!claims || typeof claims.sub !== 'string' || claims.sub.length > 128) return null;
    if (!Number.isFinite(claims.exp) || claims.exp <= Math.floor(Date.now() / 1000)) return null;
    return { uuid: claims.sub, name: claims.name, shortId: claims.shortId };
  } catch {
    return null;
  }
}

function bearerToken(req) {
  const match = /^Bearer\s+(.+)$/i.exec(String(req.headers.authorization || ''));
  return match ? match[1] : null;
}

function authenticateRequest(req, res, next) {
  const auth = verifySession(bearerToken(req));
  if (auth) {
    req.auth = auth;
    return next();
  }
  if (!AUTH_REQUIRED) return next();
  return res.status(401).json({ error: 'Authentication required' });
}

// Small per-process protection for the expensive registration/login paths.
// A shared store can replace this if the backend is later scaled horizontally.
const httpAuthBuckets = new Map();
const HTTP_AUTH_WINDOW_MS = 60_000;
const HTTP_AUTH_LIMIT = 12;

function limitAuthRequests(req, res, next) {
  const now = Date.now();
  const key = `${req.ip}:${req.path}`;
  let bucket = httpAuthBuckets.get(key);
  if (!bucket || now - bucket.startedAt >= HTTP_AUTH_WINDOW_MS) {
    bucket = { startedAt: now, count: 0 };
    httpAuthBuckets.set(key, bucket);
  }
  bucket.count++;
  if (bucket.count > HTTP_AUTH_LIMIT) {
    const retrySeconds = Math.max(1, Math.ceil((HTTP_AUTH_WINDOW_MS - (now - bucket.startedAt)) / 1000));
    res.set('Retry-After', String(retrySeconds));
    return res.status(429).json({ error: 'Too many authentication attempts' });
  }

  if (httpAuthBuckets.size > 5000) {
    for (const [bucketKey, entry] of httpAuthBuckets) {
      if (now - entry.startedAt >= HTTP_AUTH_WINDOW_MS) httpAuthBuckets.delete(bucketKey);
    }
  }
  return next();
}

function cleanIdentity(body = {}) {
  const username = safeDisplayName(body.username);
  const shortId = typeof body.shortId === 'string' ? body.shortId.trim().toUpperCase() : '';
  const uuid = typeof body.uuid === 'string' ? body.uuid.trim() : '';
  if (!username) return null;
  if (!/^[A-Z0-9]{4,16}$/.test(shortId)) return null;
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(uuid)) return null;
  return { username, shortId, uuid };
}

app.post('/api/register_guest', limitAuthRequests, async (req, res) => {
  const identity = cleanIdentity(req.body);
  if (!identity) return res.status(400).json({ error: 'Invalid account fields' });
  const { username, shortId, uuid } = identity;

  try {
    const password = generateRandomPassword();
    const passwordHash = await hashPassword(password);

    if (!HAS_DB) {
      const existing = memUsers.get(uuid);
      if (existing) {
        // Never reveal a credential again. The old endpoint returned the
        // stored password to anyone who knew an account UUID.
        return res.status(409).json({ error: 'Account already exists. Sign in instead.' });
      }
      const user = { username, password: passwordHash, short_id: shortId, uuid, save_data: null };
      memUsers.set(uuid, user);
      return res.status(201).json({ success: true, username, shortId, uuid, password, token: signSession(user) });
    }

    // UUID, display name and short id are all unique identities.
    const existing = await pool.query(
      'SELECT uuid FROM users WHERE uuid = $1 OR LOWER(username) = LOWER($2) OR UPPER(short_id) = UPPER($3) LIMIT 1',
      [uuid, username, shortId]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Account already exists. Sign in instead.' });
    }

    await pool.query(
      'INSERT INTO users (username, password, short_id, uuid) VALUES ($1, $2, $3, $4)',
      [username, passwordHash, shortId, uuid]
    );

    const user = { username, short_id: shortId, uuid };
    res.status(201).json({ success: true, username, shortId, uuid, password, token: signSession(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/login', limitAuthRequests, async (req, res) => {
  const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!username || username.length > 32 || !password || password.length > 256) {
    return res.status(400).json({ error: 'Invalid credentials' });
  }
  try {
    if (!HAS_DB) {
      const user = [...memUsers.values()].find((u) => u.username.toLowerCase() === username.toLowerCase());
      if (!user || !(await verifyPassword(password, user.password))) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      if (!safeDisplayName(user.username)) {
        return res.status(409).json({ error: 'This legacy display name must be changed before login.' });
      }
      if (!user.password.startsWith(`${PASSWORD_PREFIX}$`)) user.password = await hashPassword(password);
      return res.json({
        success: true,
        uuid: user.uuid,
        shortId: user.short_id,
        name: user.username,
        token: signSession(user),
      });
    }

    const result = await pool.query('SELECT * FROM users WHERE LOWER(username) = LOWER($1) LIMIT 1', [username]);
    if (result.rows.length > 0) {
      const user = result.rows[0];
      if (await verifyPassword(password, user.password)) {
        if (!safeDisplayName(user.username)) {
          return res.status(409).json({ error: 'This legacy display name must be changed before login.' });
        }
        if (!user.password.startsWith(`${PASSWORD_PREFIX}$`)) {
          const migrated = await hashPassword(password);
          await pool.query('UPDATE users SET password = $1 WHERE uuid = $2 AND password = $3', [migrated, user.uuid, user.password]);
          user.password = migrated;
        }
        return res.json({
          success: true,
          uuid: user.uuid,
          shortId: user.short_id,
          name: user.username,
          token: signSession(user),
        });
      }
    }
    res.status(401).json({ error: 'Invalid credentials' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/save', authenticateRequest, async (req, res) => {
  const requestedUuid = typeof req.body?.uuid === 'string' ? req.body.uuid : '';
  const uuid = req.auth?.uuid || requestedUuid;
  if (!uuid) return res.status(401).json({ error: 'Authentication required' });
  if (req.auth && requestedUuid && requestedUuid !== req.auth.uuid) {
    return res.status(403).json({ error: 'Cannot write another account save' });
  }
  const { saveData, power, className, level } = req.body;
  if (!saveData || typeof saveData !== 'object' || Array.isArray(saveData)) {
    return res.status(400).json({ error: 'Invalid save data' });
  }
  const score = Math.min(2_000_000_000, Math.max(0, Math.round(Number(power) || 0)));
  const safeClassName = typeof className === 'string' ? className.slice(0, 40) : null;
  const safeLevel = Math.min(10000, Math.max(1, Math.round(Number(level) || 1)));

  // Power rides along with the save rather than having an endpoint of its own:
  // it is derived from exactly the state being written, so two calls could
  // disagree with each other.
  if (!HAS_DB) {
    const rec = memUsers.get(uuid);
    if (rec) {
      rec.save_data = saveData;
      rec.power = score;
      rec.power_class = safeClassName || rec.power_class;
      rec.power_level = safeLevel || rec.power_level || 1;
    }
    return rec
      ? res.json({ success: true })
      : res.status(404).json({ success: false, msg: 'Account not found' });
  }

  try {
    const result = await pool.query(
      'UPDATE users SET save_data = $1, power = $2, power_class = COALESCE($3, power_class), power_level = COALESCE($4, power_level) WHERE uuid = $5',
      [JSON.stringify(saveData), score, safeClassName, safeLevel, uuid]
    );
    if (!result.rowCount) return res.status(404).json({ success: false, msg: 'Account not found' });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save' });
  }
});

/**
 * Highest power, best first.
 *
 * Ranked on the stored figure rather than recomputed here: the server has no
 * idea what an item is worth, and duplicating the formula would let the two
 * drift apart silently.
 */
app.get('/api/leaderboard', async (req, res) => {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
  // Two boards, one endpoint: the rows are identical and only the ordering
  // differs, so splitting them would duplicate everything for one ORDER BY.
  const byLevel = req.query.sort === 'level';

  if (!HAS_DB) {
    // Same rule as the SQL: the save is the source of truth for level and class.
    const levelOf = (u) => Number(u.save_data?.playerState?.level) || u.power_level || 1;
    const powerOf = (u) => u.power || Number(u.save_data?.playerState?.power) || 0;
    const classOf = (u) => u.save_data?.playerState?.characterClass?.name || u.power_class || null;

    const rows = [...memUsers.values()]
      .filter((u) => Boolean(u.save_data))
      .sort((a, b) => byLevel
        ? levelOf(b) - levelOf(a) || powerOf(b) - powerOf(a)
        : powerOf(b) - powerOf(a) || levelOf(b) - levelOf(a))
      .slice(0, limit)
      .map((u, i) => ({ rank: i + 1, name: u.username, shortId: u.short_id, power: powerOf(u), className: classOf(u), level: levelOf(u) }));
    return res.json({ success: true, entries: rows });
  }

  try {
    // Level and class come out of save_data, not out of the columns.
    //
    // power_level was added recently and defaults to 1, so every account made
    // before it read as level 1 - which is what put a board full of level 1
    // players in front of someone who knew they were not. The real figures have
    // been in save_data the whole time; nothing was reading them.
    //
    // Ties on level fall back to power so the order is stable between requests.
    const columns = `
      username,
      short_id,
      COALESCE(NULLIF(power, 0), NULLIF(save_data->'playerState'->>'power', '')::int, 0) AS power,
      COALESCE(save_data->'playerState'->'characterClass'->>'name', power_class) AS power_class,
      COALESCE(NULLIF(save_data->'playerState'->>'level', '')::int, NULLIF(power_level, 0), 1) AS power_level
    `;

    const result = await pool.query(
      byLevel
        // Anyone with a save has a level worth ranking, whether or not they
        // have opened the game since power existed.
        ? `SELECT ${columns} FROM users WHERE save_data IS NOT NULL ORDER BY power_level DESC, power DESC LIMIT $1`
        // Everyone with a save appears, ranked by power, with those who have
        // not opened the game since power existed sorted last. Filtering them
        // out entirely is what made a populated game look empty - showing them
        // with no figure at least says what is actually true about them.
        : `SELECT ${columns} FROM users WHERE save_data IS NOT NULL ORDER BY power DESC, power_level DESC LIMIT $1`,
      [limit]
    );
    res.json({
      success: true,
      entries: result.rows.map((r, i) => ({
        rank: i + 1, name: r.username, shortId: r.short_id,
        power: r.power, className: r.power_class, level: r.power_level,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load leaderboard' });
  }
});

app.get('/api/load/:uuid', authenticateRequest, async (req, res) => {
  const uuid = req.auth?.uuid || req.params.uuid;
  if (!uuid) return res.status(401).json({ error: 'Authentication required' });
  if (req.auth && req.params.uuid !== req.auth.uuid) {
    return res.status(403).json({ error: 'Cannot read another account save' });
  }
  if (!HAS_DB) {
    const rec = memUsers.get(uuid);
    return res.json(rec && rec.save_data
      ? { success: true, saveData: rec.save_data }
      : { success: false, msg: 'No save found' });
  }

  try {
    const result = await pool.query('SELECT save_data FROM users WHERE uuid = $1', [uuid]);
    if (result.rows.length > 0 && result.rows[0].save_data) {
      res.json({ success: true, saveData: result.rows[0].save_data });
    } else {
      res.json({ success: false, msg: 'No save found' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load' });
  }
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: corsOptions,
  maxHttpBufferSize: 256 * 1024,
});

// ----------------- STATE -----------------
// Account identity and in-game actor identity are deliberately separate. Two
// browsers signed into one account are two actors in a room, while saves and
// friendships still belong to the one authenticated account UUID.
const players = {};          // socketId -> actor record
const playersByActor = {};   // actorId  -> canonical actor record
const actorIdsByUuid = {};    // account UUID -> Set<actorId>
const rooms = {};            // roomId -> { dungeonId, hostActorId, members: [actorId], started }
const reconnectTimers = {};  // actorId -> setTimeout handle

// How long a disconnected player keeps their slot in a room before we evict them.
const RECONNECT_GRACE_MS = 45000;

// Party size. Was hard-capped at 2; the lobby now supports a full squad.
const MAX_PARTY = 4;

// Server-owned access requirements. Clients may display these values but may
// not lower them when creating a public lobby.
const DUNGEON_MIN_LEVELS = Object.freeze({
  goblin_catacombs: 1,
  venomous_swamp: 3,
  sunlit_vale: 4,
  undead_crypt: 5,
  twilight_peaks: 6,
  emerald_ridge: 8,
  dragon_lair: 9,
  sunken_abyss: 10,
  gallet_depths: 12,
  castle_approach: 13,
  void_nexus: 14,
  endless_arena: 16,
});

function socketIdForActor(actorId) {
  const rec = playersByActor[actorId];
  return rec && rec.socketId ? rec.socketId : null;
}

function accountRecords(uuid) {
  return [...(actorIdsByUuid[uuid] || [])]
    .map(actorId => playersByActor[actorId])
    .filter(Boolean);
}

function liveAccountRecord(uuid) {
  return accountRecords(uuid).find(rec => rec.socketId) || accountRecords(uuid)[0] || null;
}

function rememberActor(rec) {
  playersByActor[rec.actorId] = rec;
  if (!actorIdsByUuid[rec.uuid]) actorIdsByUuid[rec.uuid] = new Set();
  actorIdsByUuid[rec.uuid].add(rec.actorId);
}

function forgetActor(rec) {
  if (!rec) return;
  delete playersByActor[rec.actorId];
  const ids = actorIdsByUuid[rec.uuid];
  if (!ids) return;
  ids.delete(rec.actorId);
  if (!ids.size) delete actorIdsByUuid[rec.uuid];
}

function memberRecords(roomId) {
  const room = rooms[roomId];
  if (!room) return [];
  return room.members.map(actorId => playersByActor[actorId]).filter(Boolean);
}

// Role is server-owned. Every membership change re-broadcasts it so a client
// can never be left guessing whether it is the host.
function broadcastRoles(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  room.members.forEach(actorId => {
    const sid = socketIdForActor(actorId);
    if (sid) {
      io.to(sid).emit('role_assign', {
        roomId,
        isHost: actorId === room.hostActorId,
        dungeonId: room.dungeonId
      });
    }
  });
}

/**
 * Full lobby snapshot. This is the single payload the lobby UI renders from -
 * slots, readiness, who the host is, and which dungeon is queued.
 */
function buildLobbyState(roomId) {
  const room = rooms[roomId];
  if (!room) return null;
  return {
    roomId,
    dungeonId: room.dungeonId,
    maxPlayers: MAX_PARTY,
    started: room.started,
    members: room.members.map(actorId => {
      const rec = playersByActor[actorId] || {};
      return {
        // Do not expose the account UUID in a public party snapshot. The UI
        // only needs a stable actor key and the current socket id.
        uuid: actorId,
        actorId,
        socketId: rec.socketId || null,
        name: rec.name || 'Adventurer',
        shortId: rec.shortId || '',
        classId: rec.classId || null,
        level: rec.level || 1,
        power: rec.power || 0,
        ready: actorId === room.hostActorId ? true : !!room.ready[actorId],
        isHost: actorId === room.hostActorId,
        online: !!rec.socketId
      };
    })
  };
}

function broadcastLobby(roomId) {
  const state = buildLobbyState(roomId);
  if (!state) return;
  for (const actorId of rooms[roomId].members) {
    const sid = socketIdForActor(actorId);
    if (sid) io.to(sid).emit('lobby_state', state);
  }
}

// ----------------- FRIENDS -----------------
// Backed by Postgres in production. Without DATABASE_URL the same API is served
// from memory, so the friends flow is testable locally instead of only after a
// deploy.
const hasDB = () => !!process.env.DATABASE_URL;
const memFriends = new Set();          // "uuidLow|uuidHigh"
const memUsersByShortId = new Map();   // shortId -> { uuid, name, shortId }

const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

async function lookupByShortId(shortId) {
  if (!shortId) return null;
  const id = String(shortId).toUpperCase();

  if (hasDB()) {
    try {
      const r = await pool.query('SELECT uuid, username, short_id FROM users WHERE UPPER(short_id) = $1', [id]);
      if (r.rows.length) {
        return { uuid: r.rows[0].uuid, name: r.rows[0].username, shortId: r.rows[0].short_id };
      }
    } catch (e) {
      console.error('[FRIENDS] db lookup failed, falling back to live players:', e.message);
    }
  }

  // Fall back to whoever is connected right now. The users table only holds
  // accounts created through /api/register_guest, so a player who is online but
  // not in that table would otherwise be unfindable - and a DB hiccup would
  // take the whole friends feature down rather than degrading it.
  return memUsersByShortId.get(id) || null;
}

async function addFriendship(a, b) {
  const [low, high] = a < b ? [a, b] : [b, a];
  if (hasDB()) {
    try {
      await pool.query(
        'INSERT INTO friendships (uuid_low, uuid_high) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [low, high]
      );
      return;
    } catch (e) {
      console.error('[FRIENDS] db insert failed, keeping in memory:', e.message);
    }
  }
  memFriends.add(pairKey(a, b));
}

async function removeFriendship(a, b) {
  const [low, high] = a < b ? [a, b] : [b, a];
  if (hasDB()) {
    try {
      await pool.query('DELETE FROM friendships WHERE uuid_low = $1 AND uuid_high = $2', [low, high]);
    } catch (e) {
      console.error('[FRIENDS] db delete failed:', e.message);
    }
  }
  memFriends.delete(pairKey(a, b));
}

async function friendUuidsOf(uuid) {
  if (hasDB()) {
    try {
      const r = await pool.query(
        'SELECT uuid_low, uuid_high FROM friendships WHERE uuid_low = $1 OR uuid_high = $1',
        [uuid]
      );
      return r.rows.map(row => (row.uuid_low === uuid ? row.uuid_high : row.uuid_low));
    } catch (e) {
      console.error('[FRIENDS] db read failed, serving from memory:', e.message);
    }
  }
  const out = [];
  for (const key of memFriends) {
    const [x, y] = key.split('|');
    if (x === uuid) out.push(y);
    else if (y === uuid) out.push(x);
  }
  return out;
}

/** Friend list with live presence, pulled from the connected-player registry. */
async function buildFriendList(uuid) {
  const uuids = await friendUuidsOf(uuid);
  if (!uuids.length) return [];

  // One query for the whole list.
  //
  // This ran a lookup per friend, every time the list was refreshed, purely to
  // read a name and a level. Small lists hid it; it is still a round trip per
  // friend per refresh, and the same rows can be fetched at once.
  const saved = new Map();
  const needed = uuids.filter((fid) => {
    const live = liveAccountRecord(fid);
    return !live || typeof live.level !== 'number';
  });

  if (needed.length) {
    if (hasDB()) {
      try {
        const r = await pool.query(
          `SELECT uuid, username, short_id,
                  COALESCE(NULLIF(save_data->'playerState'->>'level', '')::int, NULLIF(power_level, 0), 1) AS saved_level
             FROM users WHERE uuid = ANY($1)`,
          [needed]
        );
        r.rows.forEach((row) => saved.set(row.uuid, {
          name: row.username,
          shortId: row.short_id,
          level: Number(row.saved_level) || 0,
        }));
      } catch { /* fall through to the placeholders below */ }
    } else {
      needed.forEach((fid) => {
        const rec = memUsers.get(fid);
        if (rec) saved.set(fid, {
          name: rec.username,
          shortId: rec.short_id,
          level: Number(rec.save_data?.playerState?.level) || Number(rec.power_level) || 0,
        });
      });
    }
  }

  const entries = uuids.map((fid) => {
    const live = liveAccountRecord(fid);
    const stored = saved.get(fid);
    // The level came only from the live socket, and a socket carries one only
    // after that player has sent it. An offline friend - or one who simply had
    // not opened a lobby yet - therefore read as Lv 1. Same bug the leaderboard
    // had, same fix: the save is the source of truth for level.
    return {
      uuid: fid,
      name: live?.name || stored?.name || 'Adventurer',
      shortId: live?.shortId || stored?.shortId || '',
      classId: live?.classId || null,
      level: Number(live?.level) || stored?.level || 1,
      online: !!(live && live.socketId),
      inParty: !!(live && live.room),
    };
  });

  entries.sort((a, b) => (b.online ? 1 : 0) - (a.online ? 1 : 0) || a.name.localeCompare(b.name));
  return entries;
}

/**
 * Tell this player's friends that their presence changed.
 *
 * The friend list was pushed on add, remove and level-up, but never on
 * connecting or disconnecting - the two events it exists to report. A friend
 * logging in was invisible: your list kept saying Offline until you closed the
 * lobby and reopened it, which re-requested the whole thing by hand.
 */
async function broadcastPresence(uuid) {
  try {
    const friends = await friendUuidsOf(uuid);
    await Promise.all(friends.map((fid) => pushFriendList(fid)));
  } catch (e) {
    console.error('[FRIENDS] presence broadcast failed:', e.message);
  }
}

async function pushFriendList(uuid) {
  try {
    const payload = { friends: await buildFriendList(uuid) };
    for (const rec of accountRecords(uuid)) {
      if (rec.socketId) io.to(rec.socketId).emit('friends_list', payload);
    }
  } catch (e) {
    console.error('[FRIENDS] push failed:', e.message);
  }
}

/** Members carry their class and level so the lobby can draw proper cards. */
function applyProfile(p, data) {
  if (!p || !data) return;
  if (typeof data.classId === 'string' && /^[a-z0-9_-]{1,32}$/i.test(data.classId)) p.classId = data.classId;
  if (Number.isFinite(data.level)) p.level = Math.min(10000, Math.max(1, Math.round(data.level)));
  if (Number.isFinite(data.power)) p.power = Math.min(2_000_000_000, Math.max(0, Math.round(data.power)));
}

function removeMemberFromRoom(actorId, roomId) {
  const room = rooms[roomId];
  if (!room) return;

  room.members = room.members.filter(id => id !== actorId);
  if (room.ready) delete room.ready[actorId];

  const rec = playersByActor[actorId];
  if (rec) {
    io.to(roomId).emit('player_left', {
      socketId: rec.socketId || rec.lastSocketId || null,
      actorId,
      name: rec.name,
    });
    rec.room = null;
  }

  if (room.members.length === 0) {
    delete rooms[roomId];
    console.log(`[ROOM] ${roomId} destroyed (empty)`);
    return;
  }

  // Promote a surviving member if the host is the one who left.
  if (room.hostActorId === actorId) {
    room.hostActorId = room.members[0];
    console.log(`[ROOM] ${roomId} host migrated to ${playersByActor[room.hostActorId]?.name}`);
  }
  broadcastRoles(roomId);
  broadcastLobby(roomId);
}

function socketToken(socket) {
  const authToken = socket.handshake.auth && socket.handshake.auth.token;
  if (typeof authToken === 'string') return authToken;
  const match = /^Bearer\s+(.+)$/i.exec(String(socket.handshake.headers.authorization || ''));
  return match ? match[1] : null;
}

io.use((socket, next) => {
  const auth = verifySession(socketToken(socket));
  if (auth) {
    socket.data.auth = auth;
    return next();
  }
  if (AUTH_REQUIRED) return next(new Error('Authentication required'));
  socket.data.auth = null;
  return next();
});

const RATE_LIMITS = {
  register_player: [5, 10_000],
  create_lobby: [3, 10_000],
  accept_invite: [6, 10_000],
  send_invite: [10, 10_000],
  friend_invite: [10, 10_000],
  browse_lobbies: [10, 5_000],
  quick_join: [6, 5_000],
  lobby_ready: [12, 5_000],
  lobby_start: [5, 5_000],
  profile_update: [20, 5_000],
  player_move: [40, 1000],
  player_skill: [20, 1000],
  damage_enemy: [120, 1000],
  enemy_hit: [120, 1000],
  enemy_sync: [15, 1000],
  wave_sync: [6, 1000],
  enemy_died: [64, 1000],
  player_damage: [48, 1000],
  combat_defense: [30, 1000],
  run_sync: [10, 1000],
  request_full_sync: [3, 3000],
  full_sync: [3, 3000],
  voice_signal: [80, 1000],
  voice_join: [5, 5_000],
  party_support: [12, 1000],
  party_stats: [5, 10_000],
  party_ping: [5, 1000],
  party_chat: [4, 3000],
};

function isPayloadWithin(value, maxBytes = 64 * 1024) {
  try {
    return Buffer.byteLength(JSON.stringify(value ?? null), 'utf8') <= maxBytes;
  } catch {
    return false;
  }
}

function finiteNumber(value, min, max) {
  return Number.isFinite(value) && value >= min && value <= max;
}

function safeId(value, max = 128) {
  return typeof value === 'string' && value.length > 0 && value.length <= max && /^[A-Za-z0-9:_-]+$/.test(value);
}

function safeEntityId(value, max = 160) {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= max
    && !/[\u0000-\u001f\u007f]/.test(value);
}

function sanitizePlayerDamageStatus(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const kinds = new Set(['slow', 'poison', 'burn', 'stun']);
  if (!kinds.has(value.kind)) return null;

  const maxDuration = value.kind === 'stun' ? 2.5 : 8;
  if (!finiteNumber(value.duration, 0.1, maxDuration)) return null;
  if (!finiteNumber(value.magnitude, 0, value.kind === 'slow' ? 0.8 : 1)) return null;

  const damageOverTime = value.kind === 'poison' || value.kind === 'burn';
  if (damageOverTime) {
    if (!finiteNumber(value.tickInterval, 0.25, 2)) return null;
    if (!finiteNumber(value.rawTickDamage, 1, 100_000)) return null;
  } else if (value.tickInterval !== undefined || value.rawTickDamage !== undefined) {
    return null;
  }

  return {
    kind: value.kind,
    duration: value.duration,
    magnitude: value.magnitude,
    tickInterval: damageOverTime ? value.tickInterval : undefined,
    rawTickDamage: damageOverTime ? value.rawTickDamage : undefined,
  };
}

const RUN_SYNC_PROTOCOL_VERSION = 1;
const RUN_SYNC_MAX_BYTES = 128 * 1024;
const ENCOUNTER_SNAPSHOT_MAX_BYTES = 64 * 1024;
const ENCOUNTER_LIMITS = Object.freeze({
  maxActors: 8,
  maxEnemies: 32,
  maxWorldObjects: 32,
  maxHazards: 16,
  maxRouteProps: 8,
  maxPendingExplosions: 8,
});
const RUN_SYNC_LIMITS = Object.freeze({
  maxActors: 8,
  maxRooms: 32,
  maxExitsPerRoom: 4,
  maxObjectiveEntities: 64,
  maxRoomChoices: 12,
  maxRelicsPerActor: 24,
  maxRelicOfferSize: 4,
});
const RUN_STATE_STATUSES = new Set(['active', 'completed', 'failed']);
const ROOM_STATE_STATUSES = new Set(['available', 'active', 'completed', 'failed']);
const COMBAT_DEFENSE_OUTCOMES = new Set(['dodge', 'perfect-dodge', 'parry']);
const ATTACK_DEFENSE_TYPES = new Set(['parryable', 'dodge-only', 'unavoidable']);
const ENEMY_ATTACK_PROFILE_IDS = new Set([
  'melee-light', 'melee-heavy', 'shield-bash', 'ranged-shot', 'healer-cast',
  'summoner-cast', 'assassin-lunge', 'boss-slam', 'boss-volley', 'boss-nova', 'boss-beam',
]);
const RESERVED_RECORD_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

function isRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function safeRunToken(value, max = 128) {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= max
    && !RESERVED_RECORD_KEYS.has(value)
    && /^[A-Za-z0-9:._-]+$/.test(value);
}

function boundedInteger(value, min, max) {
  return Number.isSafeInteger(value) && value >= min && value <= max;
}

function boundedTokenArray(value, maxItems, maxTokenLength = 128) {
  return Array.isArray(value)
    && value.length <= maxItems
    && value.every(item => safeRunToken(item, maxTokenLength));
}

/**
 * A host owns run decisions, but it does not own guest memory. Reject stale
 * schema versions, oversized graphs, unsafe record keys, and unbounded arrays
 * before a snapshot is relayed or embedded in a reconnect full_sync.
 */
function sanitizeDungeonRunState(value, expectedDungeonId) {
  if (!isRecord(value) || !isPayloadWithin(value, RUN_SYNC_MAX_BYTES)) return null;
  if (value.schemaVersion !== 1) return null;
  if (!safeRunToken(value.contentVersion, 64)) return null;
  if (!safeRunToken(value.runId, 128) || !safeRunToken(value.dungeonId, 64)) return null;
  if (expectedDungeonId && value.dungeonId !== expectedDungeonId) return null;
  if (!boundedInteger(value.seed, 0, 0xffffffff)) return null;
  if (!boundedInteger(value.authorityEpoch, 1, 1_000_000_000)) return null;
  if (!boundedInteger(value.revision, 0, 2_147_483_647)) return null;
  if (!boundedInteger(value.lastCommandSequence, 0, 2_147_483_647)) return null;
  if (!boundedInteger(value.elapsedMs, 0, 2_147_483_647)) return null;
  if (!RUN_STATE_STATUSES.has(value.status) || !safeRunToken(value.currentRoomId, 128)) return null;

  const graph = value.graph;
  if (!isRecord(graph) || !Array.isArray(graph.nodes) || !Array.isArray(graph.exits)) return null;
  if (graph.nodes.length < 1 || graph.nodes.length > RUN_SYNC_LIMITS.maxRooms) return null;
  if (graph.exits.length > RUN_SYNC_LIMITS.maxRooms * RUN_SYNC_LIMITS.maxExitsPerRoom) return null;
  const nodeIds = new Set();
  for (const node of graph.nodes) {
    if (!isRecord(node) || !safeRunToken(node.id, 128) || nodeIds.has(node.id)) return null;
    if (!safeRunToken(node.templateId, 128) || !safeRunToken(node.sceneId, 128)) return null;
    if (!boundedTokenArray(node.enemyGroupIds, RUN_SYNC_LIMITS.maxObjectiveEntities)) return null;
    if (!boundedTokenArray(node.worldObjectIds, RUN_SYNC_LIMITS.maxObjectiveEntities)) return null;
    if (!Array.isArray(node.choices) || node.choices.length > RUN_SYNC_LIMITS.maxRoomChoices) return null;
    if (!boundedTokenArray(node.tags, 32, 64)) return null;
    nodeIds.add(node.id);
  }
  if (!safeRunToken(graph.entryRoomId, 128) || !nodeIds.has(graph.entryRoomId)) return null;
  if (!safeRunToken(graph.finaleRoomId, 128) || !nodeIds.has(graph.finaleRoomId)) return null;
  if (!nodeIds.has(value.currentRoomId)) return null;
  for (const exit of graph.exits) {
    if (!isRecord(exit) || !safeRunToken(exit.id, 128)) return null;
    if (!safeRunToken(exit.fromRoomId, 128) || !nodeIds.has(exit.fromRoomId)) return null;
    if (!safeRunToken(exit.toRoomId, 128) || !nodeIds.has(exit.toRoomId)) return null;
  }

  if (!boundedTokenArray(value.activeActorIds, RUN_SYNC_LIMITS.maxActors)) return null;
  if (new Set(value.activeActorIds).size !== value.activeActorIds.length) return null;
  if (!boundedTokenArray(value.visitedRoomIds, RUN_SYNC_LIMITS.maxRooms)
    || !value.visitedRoomIds.every(roomId => nodeIds.has(roomId))) return null;
  if (!boundedTokenArray(value.revealedSecretRoomIds, RUN_SYNC_LIMITS.maxRooms)
    || !value.revealedSecretRoomIds.every(roomId => nodeIds.has(roomId))) return null;

  if (!isRecord(value.roomStates)) return null;
  const roomStates = Object.entries(value.roomStates);
  if (roomStates.length > RUN_SYNC_LIMITS.maxRooms) return null;
  for (const [roomId, roomState] of roomStates) {
    if (!safeRunToken(roomId, 128) || !nodeIds.has(roomId) || !isRecord(roomState)) return null;
    if (roomState.roomId !== roomId || !ROOM_STATE_STATUSES.has(roomState.status)) return null;
    if (!Array.isArray(roomState.choiceSelections)
      || roomState.choiceSelections.length > RUN_SYNC_LIMITS.maxRoomChoices) return null;
    for (const choice of roomState.choiceSelections) {
      if (!isRecord(choice) || !safeRunToken(choice.actorId, 128) || !safeRunToken(choice.choiceId, 128)) return null;
    }
    if (roomState.objectiveState !== undefined && !isRecord(roomState.objectiveState)) return null;
  }
  if (!Object.hasOwn(value.roomStates, value.currentRoomId)) return null;

  if (!isRecord(value.relicsByActorId)) return null;
  const relicEntries = Object.entries(value.relicsByActorId);
  if (relicEntries.length > RUN_SYNC_LIMITS.maxActors) return null;
  for (const [actorId, relicIds] of relicEntries) {
    if (!safeRunToken(actorId, 128)
      || !boundedTokenArray(relicIds, RUN_SYNC_LIMITS.maxRelicsPerActor)) return null;
  }

  if (!Array.isArray(value.relicOffers) || value.relicOffers.length > RUN_SYNC_LIMITS.maxRooms) return null;
  for (const offer of value.relicOffers) {
    if (!isRecord(offer)
      || !safeRunToken(offer.id, 128)
      || !safeRunToken(offer.actorId, 128)
      || !safeRunToken(offer.sourceId, 128)
      || !boundedTokenArray(offer.relicIds, RUN_SYNC_LIMITS.maxRelicOfferSize)) return null;
    if (offer.chosenRelicId !== undefined && !safeRunToken(offer.chosenRelicId, 128)) return null;
  }
  if (value.failureReason !== undefined
    && (typeof value.failureReason !== 'string' || value.failureReason.length > 256)) return null;
  return value;
}

function recordHasOnly(value, allowedKeys) {
  if (!isRecord(value)) return false;
  const allowed = new Set(allowedKeys);
  return Object.keys(value).every(key => allowed.has(key) && !RESERVED_RECORD_KEYS.has(key));
}

function finiteEncounterNumber(value, min, max) {
  return Number.isFinite(value) && value >= min && value <= max;
}

function uniqueSafeEncounterIds(value, limit) {
  return boundedTokenArray(value, limit) && new Set(value).size === value.length;
}

function safeEncounterSprite(value) {
  return safeRunToken(value, 160);
}

function validEncounterObjective(value) {
  if (!isRecord(value) || !safeRunToken(value.id, 128) || typeof value.type !== 'string') return false;
  const groups = list => uniqueSafeEncounterIds(list, ENCOUNTER_LIMITS.maxEnemies);
  switch (value.type) {
    case 'kill_all':
      return recordHasOnly(value, ['id', 'type', 'spawnGroupIds']) && groups(value.spawnGroupIds);
    case 'defend_relic':
      return recordHasOnly(value, ['id', 'type', 'targetObjectId', 'durationMs', 'maxHp', 'spawnGroupIds'])
        && safeRunToken(value.targetObjectId, 128) && finiteEncounterNumber(value.durationMs, 1, 3_600_000)
        && finiteEncounterNumber(value.maxHp, 1, 1_000_000_000) && groups(value.spawnGroupIds);
    case 'escort':
      return recordHasOnly(value, ['id', 'type', 'escortActorId', 'checkpointIds', 'maxHp', 'spawnGroupIds'])
        && safeRunToken(value.escortActorId, 128)
        && uniqueSafeEncounterIds(value.checkpointIds, ENCOUNTER_LIMITS.maxWorldObjects)
        && finiteEncounterNumber(value.maxHp, 1, 1_000_000_000) && groups(value.spawnGroupIds);
    case 'survive':
      return recordHasOnly(value, ['id', 'type', 'durationMs', 'spawnGroupIds'])
        && finiteEncounterNumber(value.durationMs, 1, 3_600_000) && groups(value.spawnGroupIds);
    case 'destroy_nests':
      return recordHasOnly(value, ['id', 'type', 'nestObjectIds', 'spawnGroupIds'])
        && uniqueSafeEncounterIds(value.nestObjectIds, ENCOUNTER_LIMITS.maxWorldObjects)
        && groups(value.spawnGroupIds);
    case 'timed_escape':
      return recordHasOnly(value, ['id', 'type', 'durationMs', 'exitTriggerId', 'participation', 'requiredCount'])
        && finiteEncounterNumber(value.durationMs, 1, 3_600_000)
        && safeRunToken(value.exitTriggerId, 128)
        && (value.participation === 'all_active' || value.participation === 'fixed_count')
        && (value.requiredCount === undefined
          || boundedInteger(value.requiredCount, 1, ENCOUNTER_LIMITS.maxActors));
    default: return false;
  }
}

/** Server-side mirror of the client encounter boundary; returns null on any malformed field. */
function sanitizeDungeonEncounterSnapshot(value, expectedRoomId) {
  if (!recordHasOnly(value, [
    'schemaVersion', 'room', 'seed', 'arenaWidth', 'groundY', 'elapsedSeconds', 'objectiveElapsedMs',
    'objectiveStatus', 'eventSequence', 'worldObjects', 'hazards', 'routeProps', 'escort',
    'activeActorIds', 'escapedActorIds', 'knownEnemyIds', 'defeatedEnemyIds', 'spawnsSealed',
    'pendingExplosions',
  ]) || !isPayloadWithin(value, ENCOUNTER_SNAPSHOT_MAX_BYTES) || value.schemaVersion !== 1) return null;
  if (!recordHasOnly(value.room, ['id', 'kind', 'access', 'objective'])
    || !safeRunToken(value.room.id, 128)
    || (expectedRoomId && value.room.id !== expectedRoomId)
    || !new Set(['combat', 'objective', 'elite', 'miniboss', 'event', 'treasure', 'shrine', 'boss', 'escape']).has(value.room.kind)
    || !new Set(['normal', 'secret']).has(value.room.access)
    || (value.room.objective !== undefined && !validEncounterObjective(value.room.objective))) return null;
  if (!boundedInteger(value.seed, 0, 0xffffffff)
    || !finiteEncounterNumber(value.arenaWidth, 640, 12_000)
    || !finiteEncounterNumber(value.groundY, -12_000, 12_000)
    || !finiteEncounterNumber(value.elapsedSeconds, 0, 3_600_000)
    || !finiteEncounterNumber(value.objectiveElapsedMs, 0, 3_600_000_000)
    || !boundedInteger(value.eventSequence, 0, Number.MAX_SAFE_INTEGER)
    || !new Set(['active', 'succeeded', 'failed']).has(value.objectiveStatus)
    || typeof value.spawnsSealed !== 'boolean') return null;
  if (!Array.isArray(value.worldObjects) || value.worldObjects.length > ENCOUNTER_LIMITS.maxWorldObjects
    || !Array.isArray(value.hazards) || value.hazards.length > ENCOUNTER_LIMITS.maxHazards
    || !Array.isArray(value.routeProps) || value.routeProps.length > ENCOUNTER_LIMITS.maxRouteProps
    || !Array.isArray(value.pendingExplosions) || value.pendingExplosions.length > ENCOUNTER_LIMITS.maxPendingExplosions
    || !uniqueSafeEncounterIds(value.activeActorIds, ENCOUNTER_LIMITS.maxActors)
    || !uniqueSafeEncounterIds(value.escapedActorIds, ENCOUNTER_LIMITS.maxActors)
    || !uniqueSafeEncounterIds(value.knownEnemyIds, ENCOUNTER_LIMITS.maxEnemies)
    || !uniqueSafeEncounterIds(value.defeatedEnemyIds, ENCOUNTER_LIMITS.maxEnemies)
    || !value.escapedActorIds.every(id => value.activeActorIds.includes(id))
    || !value.defeatedEnemyIds.every(id => value.knownEnemyIds.includes(id))) return null;

  for (const object of value.worldObjects) {
    if (!recordHasOnly(object, ['id', 'kind', 'spriteId', 'secondarySpriteId', 'x', 'y', 'width', 'height', 'hp', 'maxHp', 'active'])
      || !safeRunToken(object.id, 128)
      || !new Set(['relic', 'nest', 'explosive-barrel', 'breakable-bridge', 'escape-gate', 'survival-ward']).has(object.kind)
      || !safeEncounterSprite(object.spriteId)
      || (object.secondarySpriteId !== undefined && !safeEncounterSprite(object.secondarySpriteId))
      || !finiteEncounterNumber(object.x, -24_000, 24_000) || !finiteEncounterNumber(object.y, -24_000, 24_000)
      || !finiteEncounterNumber(object.width, 1, 4_000) || !finiteEncounterNumber(object.height, 1, 4_000)
      || !finiteEncounterNumber(object.maxHp, 1, 1_000_000_000)
      || !finiteEncounterNumber(object.hp, 0, object.maxHp) || typeof object.active !== 'boolean') return null;
  }
  for (const hazard of value.hazards) {
    if (!recordHasOnly(hazard, ['id', 'kind', 'bodySpriteId', 'telegraphSpriteId', 'impactSpriteId', 'x', 'y', 'baseX', 'baseY', 'minX', 'maxX', 'width', 'height', 'direction', 'phase', 'timerSeconds', 'impactSeconds', 'cycle'])
      || !safeRunToken(hazard.id, 128)
      || !new Set(['falling-rocks', 'traps', 'moving-platform']).has(hazard.kind)
      || !safeEncounterSprite(hazard.bodySpriteId) || !safeEncounterSprite(hazard.telegraphSpriteId)
      || !safeEncounterSprite(hazard.impactSpriteId)
      || ![hazard.x, hazard.y, hazard.baseX, hazard.baseY, hazard.minX, hazard.maxX]
        .every(number => finiteEncounterNumber(number, -24_000, 24_000))
      || hazard.minX > hazard.maxX || !finiteEncounterNumber(hazard.width, 1, 4_000)
      || !finiteEncounterNumber(hazard.height, 1, 4_000) || ![-1, 1].includes(hazard.direction)
      || !new Set(['cooldown', 'telegraph', 'active']).has(hazard.phase)
      || !finiteEncounterNumber(hazard.timerSeconds, 0, 3_600)
      || !finiteEncounterNumber(hazard.impactSeconds, 0, 60)
      || !boundedInteger(hazard.cycle, 0, Number.MAX_SAFE_INTEGER)) return null;
  }
  for (const prop of value.routeProps) {
    if (!recordHasOnly(prop, ['id', 'kind', 'spriteId', 'x', 'y', 'scale'])
      || !safeRunToken(prop.id, 128) || !new Set(['route', 'event', 'treasure', 'shrine', 'secret']).has(prop.kind)
      || !safeEncounterSprite(prop.spriteId) || !finiteEncounterNumber(prop.x, -24_000, 24_000)
      || !finiteEncounterNumber(prop.y, -24_000, 24_000) || !finiteEncounterNumber(prop.scale, 0.05, 20)) return null;
  }
  if (value.escort !== null) {
    const escort = value.escort;
    if (!recordHasOnly(escort, ['actorId', 'idleSpriteId', 'walkSpriteId', 'x', 'y', 'hp', 'maxHp', 'nextCheckpointIndex', 'checkpointXs', 'moving'])
      || !safeRunToken(escort.actorId, 128) || !safeEncounterSprite(escort.idleSpriteId)
      || !safeEncounterSprite(escort.walkSpriteId) || !finiteEncounterNumber(escort.x, -24_000, 24_000)
      || !finiteEncounterNumber(escort.y, -24_000, 24_000)
      || !finiteEncounterNumber(escort.maxHp, 1, 1_000_000_000) || !finiteEncounterNumber(escort.hp, 0, escort.maxHp)
      || !boundedInteger(escort.nextCheckpointIndex, 0, ENCOUNTER_LIMITS.maxWorldObjects)
      || !Array.isArray(escort.checkpointXs) || escort.checkpointXs.length > ENCOUNTER_LIMITS.maxWorldObjects
      || !escort.checkpointXs.every(x => finiteEncounterNumber(x, -24_000, 24_000))
      || typeof escort.moving !== 'boolean') return null;
  }
  for (const explosion of value.pendingExplosions) {
    if (!recordHasOnly(explosion, ['id', 'x', 'y', 'radius', 'playerDamage', 'enemyDamage'])
      || !safeRunToken(explosion.id, 128) || !finiteEncounterNumber(explosion.x, -24_000, 24_000)
      || !finiteEncounterNumber(explosion.y, -24_000, 24_000) || !finiteEncounterNumber(explosion.radius, 1, 4_000)
      || !finiteEncounterNumber(explosion.playerDamage, 0, 9_999)
      || !finiteEncounterNumber(explosion.enemyDamage, 0, 9_999)) return null;
  }
  return value;
}

function socketIdentity(socket, data = {}) {
  const auth = socket.data.auth;
  const uuid = auth?.uuid || (safeId(data.uuid) ? data.uuid : '');
  const nameSource = auth?.name || data.name;
  const shortSource = auth?.shortId || data.shortId;
  const name = safeDisplayName(nameSource);
  const shortId = typeof shortSource === 'string' ? shortSource.trim().toUpperCase().slice(0, 16) : '';
  if (!uuid || !name || !/^[A-Z0-9]{4,16}$/.test(shortId)) return null;

  const requestedActor = typeof data.actorId === 'string' ? data.actorId.trim() : '';
  const actorId = safeId(requestedActor)
    ? requestedActor
    : `legacy_${crypto.createHash('sha256').update(uuid).digest('hex').slice(0, 24)}`;
  return { uuid, name, shortId, actorId };
}

function isRoomHost(p) {
  const room = p?.room ? rooms[p.room] : null;
  return !!room && room.hostActorId === p.actorId;
}

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Reject oversized or abusive packets before any individual event handler
  // allocates/copies them. Socket.IO's transport cap is a second line of defence.
  socket.data.rateBuckets = new Map();
  socket.use(([event, ...args], next) => {
    if (typeof event !== 'string' || event.length > 64 || !isPayloadWithin(args[0], 256 * 1024)) {
      socket.emit('protocol_error', { event: String(event).slice(0, 64), reason: 'invalid_payload' });
      return;
    }
    const [limit, windowMs] = RATE_LIMITS[event] || [60, 1000];
    const now = Date.now();
    const bucket = socket.data.rateBuckets.get(event);
    if (!bucket || now - bucket.startedAt >= windowMs) {
      socket.data.rateBuckets.set(event, { startedAt: now, count: 1 });
      return next();
    }
    bucket.count++;
    if (bucket.count > limit) {
      socket.emit('protocol_error', { event, reason: 'rate_limited' });
      return;
    }
    return next();
  });

  // When a player joins the server with their guest info.
  // This doubles as the reconnect path: if we already know this actor we
  // re-point the record at the new socket and put it back into its room.
  function registerIdentity(data = {}) {
    const identity = socketIdentity(socket, data);
    if (!identity) return null;
    setTimeout(() => broadcastPresence(identity.uuid), 0);

    const existing = playersByActor[identity.actorId];
    if (existing) {
      // An actor id can only ever belong to the account that first registered it.
      if (existing.uuid !== identity.uuid) return null;
      // Cancel any pending eviction - they made it back in time.
      if (reconnectTimers[identity.actorId]) {
        clearTimeout(reconnectTimers[identity.actorId]);
        delete reconnectTimers[identity.actorId];
      }

      // Retire the stale socket index entry and tell peers to drop that old
      // render key before the replacement starts broadcasting movement.
      const oldSocketId = existing.socketId;
      if (oldSocketId && oldSocketId !== socket.id) {
        if (existing.room) {
          socket.to(existing.room).emit('player_left', {
            socketId: oldSocketId,
            actorId: existing.actorId,
            name: existing.name,
          });
        }
        if (players[oldSocketId] === existing) delete players[oldSocketId];
        const oldSocket = io.sockets.sockets.get(oldSocketId);
        if (oldSocket) {
          if (existing.room) oldSocket.leave(existing.room);
          oldSocket.emit('session_replaced', { actorId: existing.actorId });
          oldSocket.disconnect(true);
        }
        existing.lastSocketId = oldSocketId;
      }
      existing.socketId = socket.id;
      existing.name = identity.name;
      existing.shortId = identity.shortId;
      applyProfile(existing, data);
      players[socket.id] = existing;

      const room = existing.room ? rooms[existing.room] : null;
      if (room) {
        // The new socket is not in the socket.io room yet - this is the bug that
        // silently orphaned reconnecting mobile clients from every broadcast.
        socket.join(existing.room);
        socket.emit('room_rejoined', {
          roomId: existing.room,
          dungeonId: room.dungeonId,
          isHost: existing.actorId === room.hostActorId
        });
        broadcastRoles(existing.room);
        console.log(`[AUTH] ${existing.name} rejoined room ${existing.room} on socket ${socket.id}`);
      } else {
        existing.room = null;
        console.log(`[AUTH] Re-registered ${existing.name} (${existing.shortId}) on socket ${socket.id}`);
      }
      return existing;
    }

    const record = {
      uuid: identity.uuid,
      actorId: identity.actorId,
      name: identity.name,
      shortId: identity.shortId,
      socketId: socket.id,
      lastSocketId: null,
      room: null,
      sceneId: 'town',
      isTownMode: true,
    };
    applyProfile(record, data);
    players[socket.id] = record;
    rememberActor(record);
    // Local lookup so friend-by-ID works without a database attached.
    if (record.shortId) {
      memUsersByShortId.set(record.shortId, {
        uuid: record.uuid, name: record.name, shortId: record.shortId
      });
    }
    console.log(`[AUTH] Registered ${record.name} (${record.shortId}) actor ${record.actorId} on socket ${socket.id}`);
    return record;
  }

  socket.on('register_player', (data = {}) => {
    if (!registerIdentity(data)) socket.emit('protocol_error', { event: 'register_player', reason: 'invalid_identity' });
  });

  // Adopts a socket that emitted a lobby packet before (or instead of) register_player.
  function ensureRegistered(data) {
    if (players[socket.id]) return players[socket.id];
    return registerIdentity(data || {});
  }

  // Create Lobby
  socket.on('create_lobby', (data = {}) => {
    console.log(`[LOBBY] create_lobby requested by socket ${socket.id}`);
    const p = ensureRegistered(data);

    if (!p) {
       console.error(`[LOBBY] ERROR: Player not found for socket ${socket.id} during create_lobby!`);
       return;
    }
    const canonicalMinLevel = DUNGEON_MIN_LEVELS[data.dungeonId];
    if (!Number.isInteger(canonicalMinLevel)) {
      socket.emit('lobby_error', { msg: 'Invalid dungeon.' });
      return;
    }

    // Refuse to split an existing party. The World Map auto-opens near the town
    // portal, so a partied guest could pick a dungeon there and silently become
    // host of a brand new room - leaving both devices in separate rooms with
    // one-way relay. That is the bug this guard exists to prevent.
    const current = p.room ? rooms[p.room] : null;
    if (current && current.members.length > 1) {
      console.log(`[LOBBY] refused: ${p.name} is already partied in ${p.room}`);
      socket.emit('lobby_error', { msg: 'You are already in a party. Leave the party first.' });
      return;
    }

    // Alone in a stale room - tear it down cleanly before opening a new one.
    if (current) {
      socket.leave(p.room);
      removeMemberFromRoom(p.actorId, p.room);
    }

    applyProfile(p, data);

    const newRoomId = `room_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    rooms[newRoomId] = {
      dungeonId: data.dungeonId,
      // Sent by the host's client from the dungeon definition, so there is one
      // source of truth for the requirement rather than a copy here that can
      // fall behind.
      minLevel: canonicalMinLevel,
      hostActorId: p.actorId,
      members: [p.actorId],
      ready: {},
      started: false
    };
    p.room = newRoomId;
    socket.join(newRoomId);
    console.log(`${p.name} created lobby ${newRoomId}`);

    socket.emit('lobby_update', {
      roomId: newRoomId,
      dungeonId: data.dungeonId,
      isHost: true,
      players: [ { name: p.name, shortId: p.shortId } ]
    });
    broadcastRoles(newRoomId);
    broadcastLobby(newRoomId);
  });

  // ---------- FRIENDS ----------

  // Levelling up mid-session used to be invisible to everyone else: the server
  // heard a level only in lobby packets. The client now pushes on every change,
  // and everyone looking at this player is refreshed.
  socket.on('profile_update', async (data = {}) => {
    const p = players[socket.id];
    if (!p) return;
    const before = p.level;
    applyProfile(p, data);
    if (p.level === before) return;
    if (p.room) broadcastLobby(p.room);
    const friends = await friendUuidsOf(p.uuid);
    await Promise.all(friends.map((fid) => pushFriendList(fid)));
    await pushFriendList(p.uuid);
  });

  /**
   * Open parties anyone may join.
   *
   * Co-op was invite-only and friends-only, so a player with nobody online
   * could never reach it - the feature existed but was unreachable for exactly
   * the people most likely to try it once. A room is listed only while it is
   * still a lobby: not started, not full, and within the joiner's level.
   */
  function openLobbies(forLevel) {
    return Object.entries(rooms)
      .filter(([, room]) =>
        !room.started &&
        room.members.length < MAX_PARTY &&
        (room.minLevel || 1) <= forLevel &&
        // At least one member still connected. members[] holds uuids, which
        // outlive the socket, so counting the array alone advertised rooms
        // whose players had all left - and quick join walked straight into
        // one of those empty rooms instead of the party that was waiting.
        room.members.some(actorId => playersByActor[actorId]?.socketId))
      .map(([roomId, room]) => {
        const host = playersByActor[room.hostActorId];
        return {
          roomId,
          dungeonId: room.dungeonId,
          minLevel: room.minLevel || 1,
          hostName: host?.name || 'Adventurer',
          members: room.members.length,
          maxPlayers: MAX_PARTY,
        };
      })
      .sort((a, b) => b.members - a.members);
  }

  socket.on('browse_lobbies', () => {
    const p = players[socket.id];
    if (!p) return;
    socket.emit('lobby_list', { lobbies: openLobbies(p.level || 1) });
  });

  /** The fullest room we qualify for - joining a party of three beats a party of one. */
  socket.on('quick_join', () => {
    const p = players[socket.id];
    if (!p) return;
    const mine = p.room;
    const best = openLobbies(p.level || 1).find(l => l.roomId !== mine);
    if (!best) {
      socket.emit('lobby_error', { msg: 'No open parties right now - start one and others can find you.' });
      return;
    }
    socket.emit('quick_join_room', { roomId: best.roomId });
  });

  socket.on('friends_request_list', async () => {
    const p = players[socket.id];
    if (!p) return;
    await pushFriendList(p.uuid);
  });

  socket.on('friend_add', async (data = {}) => {
    const p = players[socket.id];
    if (!p) return;

    if (typeof data.shortId !== 'string' || !/^[A-Z0-9]{4,16}$/i.test(data.shortId)) {
      socket.emit('friend_error', { msg: 'Invalid player ID.' });
      return;
    }

    const target = await lookupByShortId(data.shortId);
    if (!target) {
      socket.emit('friend_error', { msg: 'No player with that ID.' });
      return;
    }
    if (target.uuid === p.uuid) {
      socket.emit('friend_error', { msg: 'You cannot add yourself.' });
      return;
    }

    try {
      await addFriendship(p.uuid, target.uuid);
    } catch (e) {
      console.error('[FRIENDS] add failed:', e.message);
      socket.emit('friend_error', { msg: 'Could not add friend.' });
      return;
    }

    socket.emit('friend_added', { name: target.name, shortId: target.shortId });
    await pushFriendList(p.uuid);
    await pushFriendList(target.uuid); // so their list updates live too
  });

  socket.on('friend_remove', async (data = {}) => {
    const p = players[socket.id];
    if (!p || !safeId(data.uuid)) return;
    try {
      await removeFriendship(p.uuid, data.uuid);
    } catch (e) {
      console.error('[FRIENDS] remove failed:', e.message);
      return;
    }
    await pushFriendList(p.uuid);
    await pushFriendList(data.uuid);
  });

  /** Invite a friend straight into the current lobby, by uuid. */
  socket.on('friend_invite', async (data = {}) => {
    const p = players[socket.id];
    if (!p || !p.room) {
      socket.emit('friend_error', { msg: 'Create a party first.' });
      return;
    }
    const room = rooms[p.room];
    if (!room) return;
    if (!safeId(data.uuid)) return;
    if (room.members.length >= MAX_PARTY) {
      socket.emit('friend_error', { msg: 'Party is full.' });
      return;
    }

    const targets = accountRecords(data.uuid).filter(rec => rec.socketId);
    if (!targets.length) {
      socket.emit('friend_error', { msg: 'That friend is offline.' });
      return;
    }
    targets.forEach(target => {
      io.to(target.socketId).emit('invite_received', {
        fromName: p.name,
        dungeonId: room.dungeonId,
        roomId: p.room
      });
    });
    socket.emit('friend_error', { msg: 'Invite sent!' });
  });

  // Toggle readiness. The host is implicitly always ready.
  socket.on('lobby_ready', (data = {}) => {
    const p = players[socket.id];
    if (!p || !p.room) return;
    const room = rooms[p.room];
    if (!room || room.started) return;
    room.ready[p.actorId] = !!data.ready;
    broadcastLobby(p.room);
  });

  // Host launches the run once everyone has readied up.
  socket.on('lobby_start', () => {
    const p = players[socket.id];
    if (!p || !p.room) return;
    const room = rooms[p.room];
    if (!room) return;

    if (p.actorId !== room.hostActorId) {
      socket.emit('lobby_error', { msg: 'Only the party leader can start.' });
      return;
    }
    const notReady = room.members.filter(actorId => actorId !== room.hostActorId && !room.ready[actorId]);
    if (notReady.length > 0) {
      socket.emit('lobby_error', { msg: 'Not everyone is ready yet.' });
      return;
    }

    room.started = true;
    room.members.forEach(actorId => {
      const member = playersByActor[actorId];
      if (!member) return;
      member.sceneId = room.dungeonId;
      member.isTownMode = false;
    });
    const roster = buildLobbyState(p.room).members;
    room.members.forEach(actorId => {
      const sid = socketIdForActor(actorId);
      if (sid) {
        io.to(sid).emit('dungeon_start', {
          roomId: p.room,
          dungeonId: room.dungeonId,
          players: roster,
          isHost: actorId === room.hostActorId
        });
      }
    });
    console.log(`[LOBBY] ${p.name} started ${p.room} with ${room.members.length} player(s)`);
  });

  // Deliberate exit. Without this a partied player has no way back to solo.
  socket.on('leave_lobby', () => {
    const p = players[socket.id];
    if (!p || !p.room) return;
    const roomId = p.room;
    socket.leave(roomId);
    removeMemberFromRoom(p.actorId, roomId);
    socket.emit('lobby_left', {});
    if (rooms[roomId]) broadcastLobby(roomId);
  });

  // Send Invite
  socket.on('send_invite', (data = {}, callback) => {
    console.log(`[INVITE] send_invite requested by socket ${socket.id} for target ${data.targetShortId}`);
    const p = ensureRegistered(data);

    if (!p || !p.room) {
       console.error(`[INVITE] ERROR: Player or room not found for socket ${socket.id}`);
       if (callback) callback({ success: false, msg: 'You are not in a lobby!' });
       return;
    }

    const room = rooms[p.room];
    if (!room) return;
    const targetShortId = typeof data.targetShortId === 'string' ? data.targetShortId.trim().toUpperCase() : '';
    if (!/^[A-Z0-9]{4,16}$/.test(targetShortId)) {
      if (typeof callback === 'function') callback({ success: false, msg: 'Invalid player ID.' });
      return;
    }

    // Records are keyed by uuid, so each player appears once regardless of
    // how many stale sockets they left behind.
    const targets = Object.values(playersByActor).filter(
      player => player.shortId === targetShortId && player.uuid !== p.uuid && player.socketId
    );

    if (targets.length === 0) {
      if (callback) callback({ success: false, msg: 'Player not found or offline.' });
      return;
    }

    const targetName = targets[0].name;

    // A friend who cannot enter the dungeon must not be invited into it. Both
    // sides are told, because from the invitee's side an invite that silently
    // never arrives is indistinguishable from a broken connection.
    const required = room.minLevel || 1;
    const targetLevel = targets[0].level || 1;
    if (targetLevel < required) {
      const msg = `${targetName} is Lv. ${targetLevel} - this dungeon needs Lv. ${required}.`;
      targets.forEach(target => {
        io.to(target.socketId).emit('invite_blocked', {
          fromName: p.name,
          msg: `${p.name} tried to invite you, but you are Lv. ${targetLevel} and this dungeon needs Lv. ${required}.`
        });
      });
      if (callback) callback({ success: false, msg });
      return;
    }

    targets.forEach(target => {
      io.to(target.socketId).emit('invite_received', {
        fromName: p.name,
        dungeonId: room.dungeonId,
        roomId: p.room
      });
    });

    if (callback) callback({ success: true, msg: `Invite sent to ${targetName}!` });
  });

  // Accept Invite
  socket.on('accept_invite', (data = {}) => {
    console.log(`[INVITE] accept_invite requested by socket ${socket.id}`);
    const p = ensureRegistered(data);

    if (!p) return;
    if (!safeId(data.roomId, 128)) {
      socket.emit('invite_error', { msg: 'Invalid lobby.' });
      return;
    }

    const room = rooms[data.roomId];
    if (!room) {
      socket.emit('invite_error', { msg: 'Lobby no longer exists.' });
      return;
    }

    // A socket may belong to exactly one gameplay room. Previously accepting a
    // second invite joined the Socket.IO room without removing the first,
    // leaking combat/voice packets between two parties.
    const previousRoom = p.room ? rooms[p.room] : null;
    if (previousRoom && p.room !== data.roomId) {
      socket.emit('invite_error', { msg: 'Leave your current party before joining another.' });
      return;
    }
    if (p.room && !previousRoom) {
      socket.leave(p.room);
      p.room = null;
    }

    const alreadyMember = room.members.includes(p.actorId);
    if (room.started && !alreadyMember) {
      socket.emit('invite_error', { msg: 'That run has already started.' });
      return;
    }
    if (!alreadyMember && room.members.length >= MAX_PARTY) {
      socket.emit('invite_error', { msg: 'Party is full.' });
      return;
    }

    // Checked again on the join itself: send_invite guards the common path, but
    // the join is the moment that actually puts someone in the dungeon.
    const joinLevel = (data.level || p.level || 1);
    if (joinLevel < (room.minLevel || 1)) {
      socket.emit('invite_error', {
        msg: `You are Lv. ${joinLevel} - this dungeon needs Lv. ${room.minLevel}.`
      });
      return;
    }

    applyProfile(p, data);

    // Join the LOBBY. The run no longer auto-starts here - the host launches it
    // with lobby_start once everyone has readied up.
    if (!alreadyMember) room.members.push(p.actorId);
    p.room = data.roomId;
    socket.join(data.roomId);

    console.log(`${p.name} joined lobby ${data.roomId} (${room.members.length}/${MAX_PARTY})`);

    broadcastRoles(data.roomId);
    broadcastLobby(data.roomId);
  });

  // A client that just (re)joined asks the host for a complete state snapshot.
  socket.on('request_full_sync', () => {
    const p = players[socket.id];
    if (!p || !p.room) return;
    const room = rooms[p.room];
    if (!room) return;

    // The host does not need to ask itself.
    if (p.actorId === room.hostActorId) return;

    const hostSid = socketIdForActor(room.hostActorId);
    if (hostSid) {
      io.to(hostSid).emit('request_full_sync', { requesterId: socket.id });
    }
  });

  // Host's snapshot reply - routed only to the client that asked.
  socket.on('full_sync', (data = {}) => {
    const p = players[socket.id];
    if (!p || !p.room) return;
    const room = rooms[p.room];
    if (!room || p.actorId !== room.hostActorId) return;
    if (data.protocolVersion !== undefined && data.protocolVersion !== RUN_SYNC_PROTOCOL_VERSION) return;
    if (!Array.isArray(data.enemies) || data.enemies.length > 128) return;
    if (!Number.isInteger(data.waveIndex) || data.waveIndex < 0 || data.waveIndex > 100000) return;
    if (!Number.isInteger(data.dungeonIndex) || data.dungeonIndex < 0 || data.dungeonIndex > 10000) return;
    if (!safeId(data.dungeonId, 64)) return;
    if (data.dungeonId !== room.dungeonId) return;
    const runState = data.runState === undefined
      ? undefined
      : sanitizeDungeonRunState(data.runState, data.dungeonId);
    if (data.runState !== undefined && !runState) return;
    const encounterSnapshot = data.encounterSnapshot === undefined
      ? undefined
      : sanitizeDungeonEncounterSnapshot(data.encounterSnapshot, runState?.currentRoomId);
    if (data.encounterSnapshot !== undefined && !encounterSnapshot) return;

    const requesterId = data.requesterId;
    const requester = requesterId && players[requesterId];
    if (!requester || requester.room !== p.room || requester.actorId === p.actorId) return;
    io.to(requesterId).emit('full_sync', {
      protocolVersion: RUN_SYNC_PROTOCOL_VERSION,
      requesterId,
      waveIndex: data.waveIndex,
      dungeonIndex: data.dungeonIndex,
      dungeonId: data.dungeonId,
      enemies: data.enemies,
      ...(runState ? { runState } : {}),
      ...(encounterSnapshot ? { encounterSnapshot } : {}),
    });
  });

  // Host-owned deterministic run state. This is separate from high-frequency
  // enemy_sync so branching/objective/relic revisions can be versioned and
  // applied atomically by guests.
  socket.on('run_sync', (data = {}) => {
    const p = players[socket.id];
    if (!isRoomHost(p) || !p.room || !isPayloadWithin(data, RUN_SYNC_MAX_BYTES)) return;
    const room = rooms[p.room];
    if (!room
      || !room.started
      || !room.members.includes(p.actorId)
      || p.isTownMode
      || p.sceneId !== room.dungeonId) return;
    if (data.protocolVersion !== RUN_SYNC_PROTOCOL_VERSION) return;
    const runState = sanitizeDungeonRunState(data.runState, room.dungeonId);
    if (!runState) return;
    const encounterSnapshot = data.encounterSnapshot === undefined
      ? undefined
      : sanitizeDungeonEncounterSnapshot(data.encounterSnapshot, runState.currentRoomId);
    if (data.encounterSnapshot !== undefined && !encounterSnapshot) return;
    socket.to(p.room).emit('run_sync', {
      protocolVersion: RUN_SYNC_PROTOCOL_VERSION,
      runState,
      ...(encounterSnapshot ? { encounterSnapshot } : {}),
    });
  });


  // Sync Events
  socket.on('enemy_sync', (data = {}) => {
    const p = players[socket.id];
    if (!isRoomHost(p)) return;
    if (!Array.isArray(data.enemies) || data.enemies.length > 128) return;
    if (!Number.isInteger(data.waveIndex) || data.waveIndex < 0 || data.waveIndex > 100000) return;
    if (data.dungeonIndex !== undefined && (!Number.isInteger(data.dungeonIndex) || data.dungeonIndex < 0 || data.dungeonIndex > 10000)) return;
    if (data.dungeonId !== undefined && !safeId(data.dungeonId, 64)) return;
    if (!data.enemies.every(enemy => enemy && typeof enemy === 'object' && !Array.isArray(enemy))) return;
    socket.to(p.room).emit('enemy_sync', {
      enemies: data.enemies,
      waveIndex: data.waveIndex,
      dungeonIndex: data.dungeonIndex,
      dungeonId: data.dungeonId,
    });
  });

  socket.on('wave_sync', (data = {}) => {
    const p = players[socket.id];
    if (!isRoomHost(p)) return;
    if (!Number.isInteger(data.waveIndex) || data.waveIndex < 0 || data.waveIndex > 100000) return;
    socket.to(p.room).emit('wave_sync', { waveIndex: data.waveIndex, cleared: data.cleared === true });
  });

  socket.on('enemy_died', (data = {}) => {
    const p = players[socket.id];
    if (!isRoomHost(p)) return;
    if (!safeEntityId(String(data.id ?? '')) || !isPayloadWithin(data, 32 * 1024)) return;
    socket.to(p.room).emit('enemy_died', data);
  });

  socket.on('damage_enemy', (data = {}) => {
    const p = players[socket.id];
    if (!p || !p.room || isRoomHost(p)) return;
    if (!safeEntityId(String(data.enemyId ?? ''))) return;
    if (!finiteNumber(data.damage, 0, 1_000_000) || !finiteNumber(data.facing, -1, 1)) return;
    const room = rooms[p.room];
    const hostSid = room && socketIdForActor(room.hostActorId);
    if (hostSid) {
      io.to(hostSid).emit('damage_enemy', {
        enemyId: String(data.enemyId),
        damage: Math.round(data.damage),
        facing: data.facing < 0 ? -1 : 1,
      });
    }
  });

  // A guest resolves its own dodge/parry window, then reports only the bounded
  // result for the host's specific attack intent. The server stamps identity;
  // guests cannot choose which host or party receives the result.
  socket.on('combat_defense', (data = {}) => {
    const p = players[socket.id];
    if (!p || !p.room || isRoomHost(p) || !isPayloadWithin(data, 1024)) return;
    const room = rooms[p.room];
    if (!room
      || !room.started
      || !room.members.includes(p.actorId)
      || p.isTownMode
      || p.sceneId !== room.dungeonId) return;
    if (!safeRunToken(data.intentId, 96) || !safeRunToken(data.sourceEnemyId, 160)) return;
    if (!COMBAT_DEFENSE_OUTCOMES.has(data.outcome)) return;

    const hostSid = socketIdForActor(room.hostActorId);
    const host = hostSid ? players[hostSid] : null;
    if (!host
      || host.room !== p.room
      || host.actorId !== room.hostActorId
      || host.isTownMode
      || host.sceneId !== room.dungeonId) return;

    const now = Date.now();
    const seen = socket.data.combatDefenseIntentIds || new Map();
    socket.data.combatDefenseIntentIds = seen;
    for (const [intentId, receivedAt] of seen) {
      if (now - receivedAt > 15_000) seen.delete(intentId);
    }
    if (seen.has(data.intentId)) return;
    seen.set(data.intentId, now);
    while (seen.size > 512) seen.delete(seen.keys().next().value);

    io.to(hostSid).emit('combat_defense', {
      socketId: socket.id,
      intentId: data.intentId,
      sourceEnemyId: data.sourceEnemyId,
      outcome: data.outcome,
    });
  });

  // In-Game Sync Events
  // ---- Voice chat signalling ----
  //
  // The audio itself is peer to peer; the server only introduces the peers and
  // passes the WebRTC handshake between them. Nothing here touches the media,
  // so voice costs the server no bandwidth and keeps working in a dungeon
  // exactly as it does in the lobby - it is tied to the room, not the scene.
  socket.on('voice_join', () => {
    const p = players[socket.id];
    if (!p || !p.room) return;
    p.voice = true;

    // Tell the newcomer who is already talking, so it can offer to each.
    const peers = (rooms[p.room]?.members || [])
      .map(actorId => playersByActor[actorId])
      .filter(m => m && m.voice && m.socketId && m.socketId !== socket.id)
      .map(m => ({ socketId: m.socketId, name: m.name }));
    socket.emit('voice_peers', { peers });

    socket.to(p.room).emit('voice_peer_joined', { socketId: socket.id, name: p.name });
    console.log(`[VOICE] ${p.name} joined voice in ${p.room} (${peers.length} already there)`);
  });

  socket.on('voice_signal', (data = {}) => {
    const p = players[socket.id];
    const target = safeId(data.to, 128) ? players[data.to] : null;
    if (!p || !p.room || !p.voice || !target || !target.voice || target.room !== p.room) return;
    if (!data.signal || typeof data.signal !== 'object' || !isPayloadWithin(data.signal, 32 * 1024)) return;
    io.to(data.to).emit('voice_signal', { from: socket.id, signal: data.signal });
  });

  socket.on('voice_leave', () => {
    const p = players[socket.id];
    if (!p) return;
    p.voice = false;
    if (p.room) socket.to(p.room).emit('voice_peer_left', { socketId: socket.id });
  });

  // Support effects reach the whole party. A heal or a shield that only ever
  // helped the caster made the support classes pointless in co-op.
  socket.on('party_support', (data = {}) => {
    const p = players[socket.id];
    const kinds = new Set(['heal', 'buff', 'cleanse', 'downed', 'revive', 'loot']);
    const buffStats = new Set([
      'atk',
      'def',
      'speed',
      'crit',
      'attackSpeed',
      'damageReduction',
      'shield',
      'airMobility',
      'deathPrevention',
    ]);
    if (!p || !p.room || !kinds.has(data.kind) || !isPayloadWithin(data, 8 * 1024)) return;

    const targetSocketId = safeId(data.targetSocketId, 128) && players[data.targetSocketId]?.room === p.room
      ? data.targetSocketId
      : undefined;
    const validPercent = finiteNumber(data.percent, 0.01, 1);
    if (data.kind === 'heal' && !finiteNumber(data.amount, 1, 100_000) && !validPercent) return;
    if (data.kind === 'buff' && (
      !buffStats.has(data.stat)
      || !finiteNumber(data.multiplier, 0.1, 3)
      || !finiteNumber(data.duration, 0.1, 30)
    )) return;
    if (data.kind === 'cleanse' && !finiteNumber(data.count, 1, 5)) return;
    if (data.kind === 'revive' && !targetSocketId) return;

    const payload = {
      socketId: socket.id,
      kind: data.kind,
      amount: finiteNumber(data.amount, 1, 100_000) ? data.amount : undefined,
      percent: validPercent ? data.percent : undefined,
      count: finiteNumber(data.count, 1, 5) ? Math.round(data.count) : undefined,
      stat: buffStats.has(data.stat) ? data.stat : undefined,
      multiplier: finiteNumber(data.multiplier, 0.1, 3) ? data.multiplier : undefined,
      duration: finiteNumber(data.duration, 0.1, 30) ? data.duration : undefined,
      casterName: p.name,
      targetSocketId,
      itemName: typeof data.itemName === 'string' ? data.itemName.slice(0, 80) : undefined,
      rarity: typeof data.rarity === 'string' ? data.rarity.slice(0, 24) : undefined,
    };
    socket.to(p.room).emit('remote_party_support', payload);
  });

  // Each client tallies only its own blows, so the party summary is assembled
  // from everyone reporting their own. Relayed untouched - the server has no
  // view of combat and no reason to arbitrate it.
  socket.on('party_stats', (data = {}) => {
    const p = players[socket.id];
    if (!p || !p.room) return;
    const stat = value => Math.min(2_000_000_000, Math.max(0, Math.round(Number(value) || 0)));
    socket.to(p.room).emit('remote_party_stats', {
      socketId: socket.id,
      name: p.name,
      classId: typeof data.classId === 'string' ? data.classId.slice(0, 32) : undefined,
      damageDealt: stat(data.damageDealt),
      damageTaken: stat(data.damageTaken),
      kills: stat(data.kills),
      revives: stat(data.revives),
    });
  });

  // Quick chat carries an id, never typed text, so there is nothing here to
  // sanitise and no free-text channel to moderate. Anything that is not a
  // short id is dropped rather than relayed.
  socket.on('party_chat', (data = {}) => {
    const p = players[socket.id];
    const lineId = typeof data.lineId === 'string' ? data.lineId.slice(0, 16) : '';
    if (!p || !p.room || !/^[a-z]+$/.test(lineId)) return;
    socket.to(p.room).emit('remote_party_chat', { socketId: socket.id, lineId });
  });

  socket.on('party_ping', (data = {}) => {
    const p = players[socket.id];
    if (!p || !p.room) return;
    if (!finiteNumber(data.x, -10_000_000, 10_000_000) || !finiteNumber(data.y, -10_000_000, 10_000_000)) return;
    socket.to(p.room).emit('remote_party_ping', { socketId: socket.id, x: data.x, y: data.y });
  });

  socket.on('player_skill', (data = {}) => {
    const p = players[socket.id];
    if (!p || !p.room) return;
    if (!Number.isInteger(data.skillIndex) || data.skillIndex < 0 || data.skillIndex > 16) return;
    if (!safeId(data.classId, 32)) return;
    if (!finiteNumber(data.x, -10_000_000, 10_000_000) || !finiteNumber(data.y, -10_000_000, 10_000_000)) return;
    if (!finiteNumber(data.facing, -1, 1)) return;
    if (data.skillDamage !== undefined && !finiteNumber(data.skillDamage, 0, 1_000_000)) return;
    socket.to(p.room).emit('remote_player_skill', {
      socketId: socket.id,
      skillIndex: data.skillIndex,
      classId: data.classId,
      x: data.x,
      y: data.y,
      facing: data.facing < 0 ? -1 : 1,
      isTownMode: data.isTownMode === true,
      skillDamage: data.skillDamage,
    });
  });

  socket.on('player_move', (data = {}) => {
    const p = players[socket.id];
    if (!p || !p.room) return;
    if (!finiteNumber(data.x, -10_000_000, 10_000_000) || !finiteNumber(data.y, -10_000_000, 10_000_000)) return;
    if (!finiteNumber(data.facing, -1, 1)) return;
    const classId = safeId(data.classId, 32) ? data.classId : (p.classId || 'knight');
    const animState = typeof data.animState === 'string' && /^[a-z0-9_-]{1,32}$/i.test(data.animState)
      ? data.animState
      : 'idle';
    const room = rooms[p.room];
    if (!room) return;
    const isTownMode = data.isTownMode === true;
    const sceneId = isTownMode
      ? 'town'
      : (data.sceneId === undefined
          ? room.dungeonId
          : (safeId(data.sceneId, 64) && data.sceneId === room.dungeonId ? data.sceneId : null));
    if (!sceneId) return;
    p.isTownMode = isTownMode;
    p.sceneId = sceneId;
    socket.to(p.room).emit('remote_player_move', {
      socketId: socket.id,
      classId,
      name: p.name,
      x: data.x,
      y: data.y,
      facing: data.facing < 0 ? -1 : 1,
      isGrounded: data.isGrounded === true,
      isAttacking: data.isAttacking === true,
      animState,
      isTownMode,
      sceneId,
      downed: data.downed === true,
      hpPct: finiteNumber(data.hpPct, 0, 100) ? Math.round(data.hpPct) : 100,
    });
  });

  socket.on('party_return_town', (data = {}) => {
    const p = players[socket.id];
    if (p && p.room) {
      p.sceneId = 'town';
      p.isTownMode = true;
      const room = rooms[p.room];
      const payload = (data && typeof data === 'object') ? data : {};
      io.to(p.room).emit('party_return_town', {
        socketId: socket.id,
        // Only the host leaving the dungeon should drag the party back to town.
        // Without this, any member's town packet - including the sender's own
        // echo - yanked everyone out of the run.
        fromHost: !!room && p.actorId === room.hostActorId,
        x: finiteNumber(payload.x, -10_000_000, 10_000_000) ? payload.x : undefined,
        y: finiteNumber(payload.y, -10_000_000, 10_000_000) ? payload.y : undefined,
        facing: finiteNumber(payload.facing, -1, 1) && payload.facing < 0 ? -1 : 1,
        animState: typeof payload.animState === 'string' ? payload.animState.slice(0, 32) : 'idle',
        isTownMode: payload.isTownMode !== false,
        classId: safeId(payload.classId, 32) ? payload.classId : p.classId,
        name: p.name
      });
    }
  });

  socket.on('party_next_dungeon', (data = {}) => {
    const p = players[socket.id];
    if (!isRoomHost(p)) return;
    if (!safeId(data.dungeonId, 64) || !Number.isInteger(data.dungeonIndex) || data.dungeonIndex < 0 || data.dungeonIndex > 10000) return;
    if (!Object.hasOwn(DUNGEON_MIN_LEVELS, data.dungeonId)) return;
    const room = rooms[p.room];
    if (!room) return;
    room.dungeonId = data.dungeonId;
    room.members.forEach(actorId => {
      const member = playersByActor[actorId];
      if (!member) return;
      member.sceneId = data.dungeonId;
      member.isTownMode = false;
    });
    socket.to(p.room).emit('party_next_dungeon', {
      dungeonId: data.dungeonId,
      dungeonIndex: data.dungeonIndex,
    });
  });

  // Explicit, intentional exit - no grace period.
  socket.on('leave_dungeon_room', () => {
    const p = players[socket.id];
    if (p && p.room) {
      const roomId = p.room;
      socket.leave(roomId);
      removeMemberFromRoom(p.actorId, roomId);
    }
  });

  socket.on('enemy_hit', (data = {}) => {
    const p = players[socket.id];
    if (!isRoomHost(p)) return;
    if (!safeEntityId(String(data.enemyId ?? ''))) return;
    if (!finiteNumber(data.damage, 0, 1_000_000) || !finiteNumber(data.newHp, -1_000_000, 1_000_000)) return;
    if (!finiteNumber(data.knockbackDir, -1, 1)) return;
    socket.to(p.room).emit('enemy_hit', {
      enemyId: String(data.enemyId),
      damage: Math.round(data.damage),
      isCrit: data.isCrit === true,
      knockbackDir: data.knockbackDir < 0 ? -1 : 1,
      newHp: Math.round(data.newHp),
    });
  });

  // Enemy AI belongs to the room host. It sends raw attack power to exactly
  // one remote target; that target still resolves its own defence, shield,
  // i-frames, death prevention, and downed state locally.
  socket.on('player_damage', (data = {}) => {
    const p = players[socket.id];
    if (!isRoomHost(p) || !p.room || !isPayloadWithin(data, 4 * 1024)) return;
    const room = rooms[p.room];
    if (!room || !room.started || p.isTownMode || p.sceneId !== room.dungeonId) return;

    const targetSocketId = safeId(data.targetSocketId, 128) ? data.targetSocketId : null;
    const target = targetSocketId ? players[targetSocketId] : null;
    if (
      !target
      || target.room !== p.room
      || target.actorId === room.hostActorId
      || target.socketId !== targetSocketId
      || target.isTownMode
      || target.sceneId !== p.sceneId
    ) return;

    if (!safeId(data.hitId, 96)) return;
    if (!finiteNumber(data.rawDamage, 1, 250_000)) return;
    if (!finiteNumber(data.sourceX, -10_000_000, 10_000_000)) return;
    if (data.knockbackDir !== -1 && data.knockbackDir !== 1) return;
    if (data.isTownMode !== false || data.sceneId !== p.sceneId) return;

    const intentFields = [data.parryability, data.intentId, data.sourceEnemyId, data.profileId];
    const hasIntentMetadata = intentFields.some(value => value !== undefined);
    if (hasIntentMetadata && (
      !ATTACK_DEFENSE_TYPES.has(data.parryability)
      || !safeRunToken(data.intentId, 96)
      || !safeRunToken(data.sourceEnemyId, 160)
      || !ENEMY_ATTACK_PROFILE_IDS.has(data.profileId)
    )) return;

    const status = data.status === undefined ? undefined : sanitizePlayerDamageStatus(data.status);
    if (data.status !== undefined && !status) return;

    const now = Date.now();
    const seen = socket.data.playerDamageHitIds || new Map();
    socket.data.playerDamageHitIds = seen;
    for (const [hitId, receivedAt] of seen) {
      if (now - receivedAt > 15_000) seen.delete(hitId);
    }
    if (seen.has(data.hitId)) return;
    seen.set(data.hitId, now);
    while (seen.size > 512) seen.delete(seen.keys().next().value);

    io.to(targetSocketId).emit('player_damage', {
      hitId: data.hitId,
      rawDamage: data.rawDamage,
      sourceX: data.sourceX,
      knockbackDir: data.knockbackDir,
      isTownMode: false,
      sceneId: p.sceneId,
      status,
      ...(hasIntentMetadata ? {
        parryability: data.parryability,
        intentId: data.intentId,
        sourceEnemyId: data.sourceEnemyId,
        profileId: data.profileId,
      } : {}),
    });
  });

  // Unintentional drop - hold the slot open so a reconnecting mobile client
  // can reclaim it instead of the party silently falling apart.
  socket.on('disconnect', () => {
    console.log(`[AUTH] User disconnected: ${socket.id}`);
    // And so is going offline. Queued so it runs after this handler has
    // cleared the socket, or the list would still report them as present.
    const goneUuid = players[socket.id]?.uuid;
    if (goneUuid) setTimeout(() => broadcastPresence(goneUuid), 0);
    const voiceRec = players[socket.id];
    if (voiceRec && voiceRec.room) {
      voiceRec.voice = false;
      socket.to(voiceRec.room).emit('voice_peer_left', { socketId: socket.id });
    }
    const p = players[socket.id];
    if (!p) return;

    delete players[socket.id];

    // A newer socket may already have adopted this record (fast reconnect).
    if (p.socketId !== socket.id) return;
    p.lastSocketId = socket.id;
    p.socketId = null;

    if (!p.room) {
      forgetActor(p);
      return;
    }

    const roomId = p.room;
    io.to(roomId).emit('player_disconnected', {
      socketId: socket.id,
      actorId: p.actorId,
      name: p.name,
    });

    // Do not freeze the whole run for the reconnect grace period. Keep the
    // disconnected actor's member slot so it can return, but immediately move
    // authority to the first connected survivor. A returning former host is a
    // guest unless authority later migrates back through a real departure.
    const room = rooms[roomId];
    if (room && room.hostActorId === p.actorId) {
      const successor = room.members.find(actorId =>
        actorId !== p.actorId && playersByActor[actorId]?.socketId
      );
      if (successor) {
        room.hostActorId = successor;
        console.log(`[ROOM] ${roomId} authority migrated immediately to ${playersByActor[successor]?.name}`);
        broadcastRoles(roomId);
        broadcastLobby(roomId);
      }
    }
    console.log(`[ROOM] ${p.name} dropped from ${roomId}; holding slot for ${RECONNECT_GRACE_MS / 1000}s`);

    reconnectTimers[p.actorId] = setTimeout(() => {
      delete reconnectTimers[p.actorId];
      const current = playersByActor[p.actorId];
      // They came back on a new socket - nothing to clean up.
      if (!current || current.socketId) return;
      removeMemberFromRoom(p.actorId, roomId);
      forgetActor(p);
    }, RECONNECT_GRACE_MS);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Multiplayer backend running on port ${PORT}`);
});
