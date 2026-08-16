const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

// Healthcheck endpoint for Railway
app.get('/', (req, res) => {
  res.send('RPGame Multiplayer Server is running!');
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
    console.log(`Registered ${data.name} (${data.shortId})`);
  });

  // Create Lobby
  socket.on('create_lobby', (data) => {
    const p = players[socket.id];
    if (!p) return;

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
    const p = players[socket.id];
    if (!p || !p.room) return;

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
    console.log(`User disconnected: ${socket.id}`);
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
