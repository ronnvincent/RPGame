const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const { Pool } = require('pg');

// Database Connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL, // Railway provides this automatically
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false // Railway requires SSL for DB
});

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

function generateRandomPassword() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let pwd = '';
  for(let i=0; i<8; i++) pwd += chars.charAt(Math.floor(Math.random() * chars.length));
  return pwd;
}

app.post('/api/register_guest', async (req, res) => {
  const { username, shortId, uuid } = req.body;
  if (!username || !shortId || !uuid) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  try {
    const password = generateRandomPassword();
    
    // Check if user exists (fallback if they re-click guest)
    const existing = await pool.query('SELECT * FROM users WHERE uuid = $1', [uuid]);
    if (existing.rows.length > 0) {
       return res.json({ 
         success: true, 
         username: existing.rows[0].username, 
         password: existing.rows[0].password 
       });
    }

    await pool.query(
      'INSERT INTO users (username, password, short_id, uuid) VALUES ($1, $2, $3, $4)',
      [username, password, shortId, uuid]
    );

    res.json({ success: true, username, password });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1 AND password = $2', [username, password]);
    if (result.rows.length > 0) {
      const user = result.rows[0];
      res.json({ success: true, uuid: user.uuid, shortId: user.short_id, name: user.username });
    } else {
      res.status(401).json({ error: 'Invalid credentials' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/save', async (req, res) => {
  const { uuid, saveData } = req.body;
  try {
    await pool.query('UPDATE users SET save_data = $1 WHERE uuid = $2', [JSON.stringify(saveData), uuid]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save' });
  }
});

app.get('/api/load/:uuid', async (req, res) => {
  try {
    const result = await pool.query('SELECT save_data FROM users WHERE uuid = $1', [req.params.uuid]);
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
  cors: {
    origin: "*", // allow any origin since client is on vercel/github pages
    methods: ["GET", "POST"]
  }
});

// ----------------- STATE -----------------
// Player records are keyed by uuid so that they survive a socket reconnect
// (mobile browsers get a brand new socket.id on screen lock / network switch).
// `players` is a secondary index from the CURRENT socket id to the same record.
const players = {};        // socketId -> record
const playersByUuid = {};  // uuid     -> record (canonical)
const rooms = {};          // roomId   -> { dungeonId, hostUuid, members: [uuid], started }
const reconnectTimers = {}; // uuid    -> setTimeout handle

// How long a disconnected player keeps their slot in a room before we evict them.
const RECONNECT_GRACE_MS = 45000;

// Party size. Was hard-capped at 2; the lobby now supports a full squad.
const MAX_PARTY = 4;

function socketIdFor(uuid) {
  const rec = playersByUuid[uuid];
  return rec && rec.socketId ? rec.socketId : null;
}

function memberRecords(roomId) {
  const room = rooms[roomId];
  if (!room) return [];
  return room.members.map(uuid => playersByUuid[uuid]).filter(Boolean);
}

// Role is server-owned. Every membership change re-broadcasts it so a client
// can never be left guessing whether it is the host.
function broadcastRoles(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  room.members.forEach(uuid => {
    const sid = socketIdFor(uuid);
    if (sid) {
      io.to(sid).emit('role_assign', {
        roomId,
        isHost: uuid === room.hostUuid,
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
    members: room.members.map(uuid => {
      const rec = playersByUuid[uuid] || {};
      return {
        uuid,
        socketId: rec.socketId || null,
        name: rec.name || 'Adventurer',
        shortId: rec.shortId || '',
        classId: rec.classId || null,
        level: rec.level || 1,
        ready: uuid === room.hostUuid ? true : !!room.ready[uuid],
        isHost: uuid === room.hostUuid,
        online: !!rec.socketId
      };
    })
  };
}

function broadcastLobby(roomId) {
  const state = buildLobbyState(roomId);
  if (!state) return;
  for (const uuid of rooms[roomId].members) {
    const sid = socketIdFor(uuid);
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
  const entries = [];
  for (const fid of uuids) {
    const live = playersByUuid[fid];
    let base = live;
    if (!base && hasDB()) {
      try {
        const r = await pool.query('SELECT uuid, username, short_id FROM users WHERE uuid = $1', [fid]);
        if (r.rows.length) base = { uuid: fid, name: r.rows[0].username, shortId: r.rows[0].short_id };
      } catch { /* fall through to the placeholder below */ }
    }
    entries.push({
      uuid: fid,
      name: base?.name || 'Adventurer',
      shortId: base?.shortId || '',
      classId: live?.classId || null,
      level: live?.level || 1,
      online: !!(live && live.socketId),
      inParty: !!(live && live.room)
    });
  }
  entries.sort((a, b) => (b.online ? 1 : 0) - (a.online ? 1 : 0) || a.name.localeCompare(b.name));
  return entries;
}

async function pushFriendList(uuid) {
  const sid = socketIdFor(uuid);
  if (!sid) return;
  try {
    io.to(sid).emit('friends_list', { friends: await buildFriendList(uuid) });
  } catch (e) {
    console.error('[FRIENDS] push failed:', e.message);
  }
}

/** Members carry their class and level so the lobby can draw proper cards. */
function applyProfile(p, data) {
  if (!p || !data) return;
  if (data.classId) p.classId = data.classId;
  if (typeof data.level === 'number') p.level = data.level;
}

function removeMemberFromRoom(uuid, roomId) {
  const room = rooms[roomId];
  if (!room) return;

  room.members = room.members.filter(id => id !== uuid);
  if (room.ready) delete room.ready[uuid];

  const rec = playersByUuid[uuid];
  if (rec) {
    io.to(roomId).emit('player_left', { socketId: rec.socketId, uuid, name: rec.name });
    rec.room = null;
  }

  if (room.members.length === 0) {
    delete rooms[roomId];
    console.log(`[ROOM] ${roomId} destroyed (empty)`);
    return;
  }

  // Promote a surviving member if the host is the one who left.
  if (room.hostUuid === uuid) {
    room.hostUuid = room.members[0];
    console.log(`[ROOM] ${roomId} host migrated to ${playersByUuid[room.hostUuid]?.name}`);
  }
  broadcastRoles(roomId);
  broadcastLobby(roomId);
}

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // When a player joins the server with their guest info.
  // This doubles as the reconnect path: if we already know this uuid we
  // re-point the record at the new socket and put it back into its room.
  socket.on('register_player', (data) => {
    if (!data || !data.uuid) return;

    const existing = playersByUuid[data.uuid];

    if (existing) {
      // Cancel any pending eviction - they made it back in time.
      if (reconnectTimers[data.uuid]) {
        clearTimeout(reconnectTimers[data.uuid]);
        delete reconnectTimers[data.uuid];
      }

      // Retire the stale socket index entry and adopt the new socket.
      if (existing.socketId && players[existing.socketId] === existing) {
        delete players[existing.socketId];
      }
      existing.socketId = socket.id;
      existing.name = data.name || existing.name;
      existing.shortId = data.shortId || existing.shortId;
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
          isHost: existing.uuid === room.hostUuid
        });
        broadcastRoles(existing.room);
        console.log(`[AUTH] ${existing.name} rejoined room ${existing.room} on socket ${socket.id}`);
      } else {
        existing.room = null;
        console.log(`[AUTH] Re-registered ${existing.name} (${existing.shortId}) on socket ${socket.id}`);
      }
      return;
    }

    const record = {
      uuid: data.uuid,
      name: data.name,
      shortId: data.shortId,
      socketId: socket.id,
      room: null
    };
    applyProfile(record, data);
    players[socket.id] = record;
    playersByUuid[data.uuid] = record;
    // Local lookup so friend-by-ID works without a database attached.
    if (data.shortId) {
      memUsersByShortId.set(String(data.shortId).toUpperCase(), {
        uuid: data.uuid, name: data.name, shortId: data.shortId
      });
    }
    console.log(`[AUTH] Registered ${data.name} (${data.shortId}) on socket ${socket.id}`);
  });

  // Adopts a socket that emitted a lobby packet before (or instead of) register_player.
  function ensureRegistered(data) {
    if (players[socket.id]) return players[socket.id];
    if (!data || !data.uuid || !data.name || !data.shortId) return null;

    const existing = playersByUuid[data.uuid];
    if (existing) {
      if (existing.socketId && players[existing.socketId] === existing) {
        delete players[existing.socketId];
      }
      existing.socketId = socket.id;
      players[socket.id] = existing;
      console.log(`[AUTH-FALLBACK] Re-adopted ${data.name} via lobby packet`);
      return existing;
    }

    const record = { uuid: data.uuid, name: data.name, shortId: data.shortId, socketId: socket.id, room: null };
    players[socket.id] = record;
    playersByUuid[data.uuid] = record;
    console.log(`[AUTH-FALLBACK] Registered ${data.name} via lobby packet`);
    return record;
  }

  // Create Lobby
  socket.on('create_lobby', (data) => {
    console.log(`[LOBBY] create_lobby requested by socket ${socket.id}`);
    const p = ensureRegistered(data);

    if (!p) {
       console.error(`[LOBBY] ERROR: Player not found for socket ${socket.id} during create_lobby!`);
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
      removeMemberFromRoom(p.uuid, p.room);
    }

    applyProfile(p, data);

    const newRoomId = `room_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    rooms[newRoomId] = {
      dungeonId: data.dungeonId,
      hostUuid: p.uuid,
      members: [p.uuid],
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

  socket.on('friends_request_list', async () => {
    const p = players[socket.id];
    if (!p) return;
    await pushFriendList(p.uuid);
  });

  socket.on('friend_add', async (data = {}) => {
    const p = players[socket.id];
    if (!p) return;

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
    if (!p || !data.uuid) return;
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
    if (room.members.length >= MAX_PARTY) {
      socket.emit('friend_error', { msg: 'Party is full.' });
      return;
    }

    const sid = socketIdFor(data.uuid);
    if (!sid) {
      socket.emit('friend_error', { msg: 'That friend is offline.' });
      return;
    }
    io.to(sid).emit('invite_received', {
      fromName: p.name,
      dungeonId: room.dungeonId,
      roomId: p.room
    });
    socket.emit('friend_error', { msg: 'Invite sent!' });
  });

  // Toggle readiness. The host is implicitly always ready.
  socket.on('lobby_ready', (data = {}) => {
    const p = players[socket.id];
    if (!p || !p.room) return;
    const room = rooms[p.room];
    if (!room || room.started) return;
    room.ready[p.uuid] = !!data.ready;
    broadcastLobby(p.room);
  });

  // Host launches the run once everyone has readied up.
  socket.on('lobby_start', () => {
    const p = players[socket.id];
    if (!p || !p.room) return;
    const room = rooms[p.room];
    if (!room) return;

    if (p.uuid !== room.hostUuid) {
      socket.emit('lobby_error', { msg: 'Only the party leader can start.' });
      return;
    }
    const notReady = room.members.filter(u => u !== room.hostUuid && !room.ready[u]);
    if (notReady.length > 0) {
      socket.emit('lobby_error', { msg: 'Not everyone is ready yet.' });
      return;
    }

    room.started = true;
    const roster = buildLobbyState(p.room).members;
    room.members.forEach(uuid => {
      const sid = socketIdFor(uuid);
      if (sid) {
        io.to(sid).emit('dungeon_start', {
          roomId: p.room,
          dungeonId: room.dungeonId,
          players: roster,
          isHost: uuid === room.hostUuid
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
    removeMemberFromRoom(p.uuid, roomId);
    socket.emit('lobby_left', {});
    if (rooms[roomId]) broadcastLobby(roomId);
  });

  // Send Invite
  socket.on('send_invite', (data, callback) => {
    console.log(`[INVITE] send_invite requested by socket ${socket.id} for target ${data.targetShortId}`);
    const p = ensureRegistered(data);

    if (!p || !p.room) {
       console.error(`[INVITE] ERROR: Player or room not found for socket ${socket.id}`);
       if (callback) callback({ success: false, msg: 'You are not in a lobby!' });
       return;
    }

    const room = rooms[p.room];
    if (!room) return;

    // Records are keyed by uuid, so each player appears once regardless of
    // how many stale sockets they left behind.
    const targets = Object.values(playersByUuid).filter(
      player => player.shortId === data.targetShortId && player.uuid !== p.uuid && player.socketId
    );

    if (targets.length === 0) {
      if (callback) callback({ success: false, msg: 'Player not found or offline.' });
      return;
    }

    const targetName = targets[0].name;

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
  socket.on('accept_invite', (data) => {
    console.log(`[INVITE] accept_invite requested by socket ${socket.id}`);
    const p = ensureRegistered(data);

    if (!p) return;

    const room = rooms[data.roomId];
    if (!room) {
      socket.emit('invite_error', { msg: 'Lobby no longer exists.' });
      return;
    }

    const alreadyMember = room.members.includes(p.uuid);
    if (room.started && !alreadyMember) {
      socket.emit('invite_error', { msg: 'That run has already started.' });
      return;
    }
    if (!alreadyMember && room.members.length >= MAX_PARTY) {
      socket.emit('invite_error', { msg: 'Party is full.' });
      return;
    }

    applyProfile(p, data);

    // Join the LOBBY. The run no longer auto-starts here - the host launches it
    // with lobby_start once everyone has readied up.
    if (!alreadyMember) room.members.push(p.uuid);
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
    if (p.uuid === room.hostUuid) return;

    const hostSid = socketIdFor(room.hostUuid);
    if (hostSid) {
      io.to(hostSid).emit('request_full_sync', { requesterId: socket.id });
    }
  });

  // Host's snapshot reply - routed only to the client that asked.
  socket.on('full_sync', (data = {}) => {
    const p = players[socket.id];
    if (!p || !p.room) return;
    const room = rooms[p.room];
    if (!room || p.uuid !== room.hostUuid) return;

    const requesterId = data.requesterId;
    if (requesterId && players[requesterId]) {
      io.to(requesterId).emit('full_sync', data);
    } else {
      socket.to(p.room).emit('full_sync', data);
    }
  });


  // Sync Events
  socket.on('enemy_sync', (data) => {
    const p = players[socket.id];
    if (p && p.room) {
      socket.to(p.room).emit('enemy_sync', data);
    }
  });

  socket.on('wave_sync', (data) => {
    const p = players[socket.id];
    if (p && p.room) {
      socket.to(p.room).emit('wave_sync', data);
    }
  });

  socket.on('enemy_died', (data) => {
    const p = players[socket.id];
    if (p && p.room) {
      socket.to(p.room).emit('enemy_died', data);
    }
  });

  socket.on('damage_enemy', (data) => {
    const p = players[socket.id];
    if (p && p.room) {
      socket.to(p.room).emit('damage_enemy', data);
    }
  });

  // In-Game Sync Events
  socket.on('player_skill', (data) => {
    const p = players[socket.id];
    if (p && p.room) {
      socket.to(p.room).emit('remote_player_skill', {
        socketId: socket.id,
        ...data
      });
    }
  });

  socket.on('player_move', (data) => {
    const p = players[socket.id];
    if (p && p.room) {
      // Broadcast to everyone else in the room
      socket.to(p.room).emit('remote_player_move', {
        socketId: socket.id,
        ...data
      });
    }
  });

  socket.on('party_return_town', (data = {}) => {
    const p = players[socket.id];
    if (p && p.room) {
      const room = rooms[p.room];
      const payload = (data && typeof data === 'object') ? data : {};
      io.to(p.room).emit('party_return_town', {
        socketId: socket.id,
        // Only the host leaving the dungeon should drag the party back to town.
        // Without this, any member's town packet - including the sender's own
        // echo - yanked everyone out of the run.
        fromHost: !!room && p.uuid === room.hostUuid,
        x: typeof payload.x === 'number' ? payload.x : undefined,
        y: typeof payload.y === 'number' ? payload.y : undefined,
        facing: typeof payload.facing === 'number' ? payload.facing : 1,
        animState: payload.animState || 'idle',
        isTownMode: payload.isTownMode !== false,
        classId: payload.classId,
        name: payload.name || p.name
      });
    }
  });

  socket.on('party_next_dungeon', (data) => {
    const p = players[socket.id];
    if (p && p.room) {
      // Broadcast to other party members only (not echoing back to host)
      socket.to(p.room).emit('party_next_dungeon', data);
    }
  });

  // Explicit, intentional exit - no grace period.
  socket.on('leave_dungeon_room', () => {
    const p = players[socket.id];
    if (p && p.room) {
      const roomId = p.room;
      socket.leave(roomId);
      removeMemberFromRoom(p.uuid, roomId);
    }
  });

  socket.on('enemy_hit', (data) => {
    const p = players[socket.id];
    if (p && p.room) {
      socket.to(p.room).emit('enemy_hit', data);
    }
  });

  // Unintentional drop - hold the slot open so a reconnecting mobile client
  // can reclaim it instead of the party silently falling apart.
  socket.on('disconnect', () => {
    console.log(`[AUTH] User disconnected: ${socket.id}`);
    const p = players[socket.id];
    if (!p) return;

    delete players[socket.id];

    // A newer socket may already have adopted this record (fast reconnect).
    if (p.socketId !== socket.id) return;
    p.socketId = null;

    if (!p.room) {
      delete playersByUuid[p.uuid];
      return;
    }

    const roomId = p.room;
    io.to(roomId).emit('player_disconnected', { uuid: p.uuid, name: p.name });
    console.log(`[ROOM] ${p.name} dropped from ${roomId}; holding slot for ${RECONNECT_GRACE_MS / 1000}s`);

    reconnectTimers[p.uuid] = setTimeout(() => {
      delete reconnectTimers[p.uuid];
      const current = playersByUuid[p.uuid];
      // They came back on a new socket - nothing to clean up.
      if (!current || current.socketId) return;
      removeMemberFromRoom(p.uuid, roomId);
      delete playersByUuid[p.uuid];
    }, RECONNECT_GRACE_MS);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Multiplayer backend running on port ${PORT}`);
});
