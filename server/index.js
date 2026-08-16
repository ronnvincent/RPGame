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

// State
const players = {};
const rooms = {};

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // When a player joins the server with their guest info
  socket.on('register_player', (data) => {
    players[socket.id] = {
      uuid: data.uuid,
      name: data.name,
      shortId: data.shortId,
      socketId: socket.id,
      room: null
    };
    console.log(`[AUTH] Registered ${data.name} (${data.shortId}) on socket ${socket.id}`);
  });

  // Create Lobby
  socket.on('create_lobby', (data) => {
    console.log(`[LOBBY] create_lobby requested by socket ${socket.id}`);
    // Force register if missing
    if (!players[socket.id] && data.uuid && data.name && data.shortId) {
       players[socket.id] = { uuid: data.uuid, name: data.name, shortId: data.shortId, socketId: socket.id, room: null };
       console.log(`[AUTH-FALLBACK] Registered ${data.name} via lobby packet`);
    }
    const p = players[socket.id];

    if (!p) {
       console.error(`[LOBBY] ERROR: Player not found for socket ${socket.id} during create_lobby!`);
       return;
    }

    const newRoomId = `room_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    rooms[newRoomId] = {
      dungeonId: data.dungeonId,
      hostId: socket.id,
      players: [socket.id],
      started: false
    };
    p.room = newRoomId;
    socket.join(newRoomId);
    console.log(`${p.name} created lobby ${newRoomId}`);
    
    socket.emit('lobby_update', { 
      roomId: newRoomId, 
      dungeonId: data.dungeonId,
      players: [ { name: p.name, shortId: p.shortId } ]
    });
  });

  // Send Invite
  socket.on('send_invite', (data, callback) => {
    console.log(`[INVITE] send_invite requested by socket ${socket.id} for target ${data.targetShortId}`);
    // Force register if missing
    if (!players[socket.id] && data.uuid && data.name && data.shortId) {
       players[socket.id] = { uuid: data.uuid, name: data.name, shortId: data.shortId, socketId: socket.id, room: null };
       console.log(`[AUTH-FALLBACK] Registered ${data.name} via lobby packet`);
    }
    const p = players[socket.id];

    if (!p || !p.room) {
       console.error(`[INVITE] ERROR: Player or room not found for socket ${socket.id}`);
       if (callback) callback({ success: false, msg: 'You are not in a lobby!' });
       return;
    }

    const room = rooms[p.room];
    if (!room) return;

    // Find player by shortId
    const targetPlayer = Object.values(players).find(player => player.shortId === data.targetShortId);
    
    if (!targetPlayer) {
      if (callback) callback({ success: false, msg: 'Player not found or offline.' });
      return;
    }

    if (targetPlayer.socketId === socket.id) {
      if (callback) callback({ success: false, msg: 'You cannot invite yourself.' });
      return;
    }

    // Send invite to target
    io.to(targetPlayer.socketId).emit('invite_received', {
      fromName: p.name,
      dungeonId: room.dungeonId,
      roomId: p.room
    });

    if (callback) callback({ success: true, msg: `Invite sent to ${targetPlayer.name}!` });
  });

  // Accept Invite
  socket.on('accept_invite', (data) => {
    console.log(`[INVITE] accept_invite requested by socket ${socket.id}`);
    // Force register if missing
    if (!players[socket.id] && data.uuid && data.name && data.shortId) {
       players[socket.id] = { uuid: data.uuid, name: data.name, shortId: data.shortId, socketId: socket.id, room: null };
       console.log(`[AUTH-FALLBACK] Registered ${data.name} via lobby packet`);
    }
    const p = players[socket.id];

    if (!p) return;

    const room = rooms[data.roomId];
    if (!room) {
      socket.emit('invite_error', { msg: 'Lobby no longer exists.' });
      return;
    }

    if (room.started || room.players.length >= 2) {
      socket.emit('invite_error', { msg: 'Lobby is full or already started.' });
      return;
    }

    // Join room
    room.players.push(socket.id);
    p.room = data.roomId;
    socket.join(data.roomId);
    
    console.log(`${p.name} joined room ${data.roomId}`);
    
    // Start the match!
    room.started = true;
    io.to(data.roomId).emit('dungeon_start', {
      roomId: data.roomId,
      dungeonId: room.dungeonId,
      players: room.players.map(id => players[id])
    });
  });

  // In-Game Sync Events
  socket.on('player_move', (data) => {
    const p = players[socket.id];
    if (p && p.room) {
      // Broadcast to everyone else in the room
      socket.to(p.room).emit('remote_player_move', {
        socketId: socket.id,
        x: data.x,
        y: data.y,
        facing: data.facing,
        isGrounded: data.isGrounded,
        isAttacking: data.isAttacking
      });
    }
  });

  socket.on('player_attack', (data) => {
    const p = players[socket.id];
    if (p && p.room) {
      socket.to(p.room).emit('remote_player_attack', {
        socketId: socket.id,
        skillId: data.skillId
      });
    }
  });

  socket.on('enemy_damaged', (data) => {
    const p = players[socket.id];
    if (p && p.room) {
      // In a fully authoritative server, we'd subtract HP here. 
      // For now, we trust the first client to report it and broadcast to others.
      // This is a hybrid Client-Authoritative model.
      io.to(p.room).emit('sync_enemy_hp', {
        enemyId: data.enemyId,
        newHp: data.newHp,
        damage: data.damage
      });
    }
  });

  socket.on('disconnect', () => {
    console.log(`[AUTH] User disconnected: ${socket.id}`);
    const p = players[socket.id];
    if (p) {
      if (p.room) {
        const room = rooms[p.room];
        if (room) {
          room.players = room.players.filter(id => id !== socket.id);
          io.to(p.room).emit('player_left', { socketId: socket.id, name: p.name });
          if (room.players.length === 0) {
            delete rooms[p.room];
          }
        }
      }
      delete players[socket.id];
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Multiplayer backend running on port ${PORT}`);
});
