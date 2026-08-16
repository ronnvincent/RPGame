const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

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
      socketId: socket.id,
      room: null
    };
    console.log(`Registered ${data.name} (${data.uuid})`);
  });

  // Matchmaking: Find a dungeon room
  socket.on('join_matchmaking', (data) => {
    const dungeonId = data.dungeonId; // e.g., 'goblin_catacombs'
    const p = players[socket.id];
    if (!p) return;

    // Find an existing room with 1 player waiting for this dungeon
    let foundRoomId = null;
    for (const [roomId, room] of Object.entries(rooms)) {
      if (room.dungeonId === dungeonId && room.players.length === 1 && !room.started) {
        foundRoomId = roomId;
        break;
      }
    }

    if (foundRoomId) {
      // Join existing room
      const room = rooms[foundRoomId];
      room.players.push(socket.id);
      p.room = foundRoomId;
      socket.join(foundRoomId);
      
      console.log(`${p.name} joined room ${foundRoomId}`);
      
      // Start the match!
      room.started = true;
      io.to(foundRoomId).emit('dungeon_start', {
        roomId: foundRoomId,
        dungeonId: dungeonId,
        players: room.players.map(id => players[id])
      });
    } else {
      // Create new room
      const newRoomId = `room_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      rooms[newRoomId] = {
        dungeonId: dungeonId,
        players: [socket.id],
        started: false
      };
      p.room = newRoomId;
      socket.join(newRoomId);
      console.log(`${p.name} created room ${newRoomId}`);
      socket.emit('matchmaking_status', { status: 'waiting', message: 'Waiting for another player...' });
    }
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
server.listen(PORT, () => {
  console.log(`Multiplayer backend running on port ${PORT}`);
});
