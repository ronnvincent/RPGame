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

function removeMemberFromRoom(uuid, roomId) {
  const room = rooms[roomId];
  if (!room) return;

  room.members = room.members.filter(id => id !== uuid);

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
    players[socket.id] = record;
    playersByUuid[data.uuid] = record;
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

    const newRoomId = `room_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    rooms[newRoomId] = {
      dungeonId: data.dungeonId,
      hostUuid: p.uuid,
      members: [p.uuid],
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
    if (!alreadyMember && room.members.length >= 2) {
      socket.emit('invite_error', { msg: 'Lobby is full or already started.' });
      return;
    }

    // Join room
    if (!alreadyMember) room.members.push(p.uuid);
    p.room = data.roomId;
    socket.join(data.roomId);

    console.log(`${p.name} joined room ${data.roomId}`);

    // Start the match!
    room.started = true;

    const roster = memberRecords(data.roomId).map(r => ({
      uuid: r.uuid, name: r.name, shortId: r.shortId, socketId: r.socketId
    }));

    room.members.forEach(uuid => {
      const sid = socketIdFor(uuid);
      if (sid) {
        io.to(sid).emit('dungeon_start', {
          roomId: data.roomId,
          dungeonId: room.dungeonId,
          players: roster,
          isHost: uuid === room.hostUuid
        });
      }
    });
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
      const payload = (data && typeof data === 'object') ? data : {};
      io.to(p.room).emit('party_return_town', {
        socketId: socket.id,
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
