const express = require('express');
const https = require('https');
const fs = require('fs');
const socketIo = require('socket.io');
const cors = require('cors');

// --- Simple logger with timestamps and basic coloring ---
const ts = () => new Date().toISOString().replace('T', ' ').replace('Z','');
const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  mag: (s) => `\x1b[35m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
};

function log(...args) {
  console.log(c.dim(`[${ts()}]`), ...args);
}

const app = express();

app.set('trust proxy', true);

const server = https.createServer({
  key: fs.readFileSync("key.pem"),
  cert: fs.readFileSync("cert.pem")
}, app);

const ALLOWED_ORIGINS = [
  'https://bughosted.com',      // your Angular app in prod
  'https://www.bughosted.com',       
  'https://localhost:443',               // dev
  'http://localhost:80',               // dev, optional
];


app.use(cors({
 
	origin: (origin, cb) => {
	  // allow non-browser tools (no Origin) and your allowed origins
	  if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
	  return cb(new Error('Not allowed by CORS'));
	},

	methods: ['GET', 'POST', 'OPTIONS'], 
	credentials: true,
}));
// Optional: widen allowed headers (or omit and let defaults work)
app.options('*', cors());

// Simple health endpoint
app.get('/', (req, res) => res.status(200).send('Netplay HTTPS up'));


const io = socketIo(server, {
  cors: { 
    origin: ALLOWED_ORIGINS, 
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

const PORT = process.env.PORT || 3000;
let rooms = {};

const getClientIp = (socket) => {
  const forwarded = socket.handshake.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return socket.handshake.headers['x-real-ip'] || socket.handshake.address;
};

setInterval(() => {
  for (const sessionId in rooms) {
    if (Object.keys(rooms[sessionId].players).length === 0) {
      delete rooms[sessionId];
    }
  }
}, 60000);

app.get('/list', (req, res) => {
  const gameId = req.query.game_id;
  const openRooms = Object.keys(rooms)
    .filter((sessionId) => {
      const room = rooms[sessionId];
      return (
        room &&
        Object.keys(room.players).length < room.maxPlayers &&
        String(room.gameId) === gameId
      );
    })
    .reduce((acc, sessionId) => {
      const room = rooms[sessionId];
      const ownerPlayerId = Object.keys(room.players).find(
        (playerId) => room.players[playerId].socketId === room.owner
      );
      const playerName = ownerPlayerId ? room.players[ownerPlayerId].player_name : 'Unknown';
      acc[sessionId] = {
        room_name: room.roomName,
        current: Object.keys(room.players).length,
        max: room.maxPlayers,
        player_name: playerName,
        hasPassword: !!room.password,
      };
      return acc;
    }, {});
  res.json(openRooms);
});

io.on('connection', (socket) => {
  const clientIp = getClientIp(socket);

	const ua = (socket.handshake.headers['user-agent'] || '').slice(0, 120);
	log(c.cyan('➕ connect'), c.yellow(socket.id), 'from', clientIp, c.dim(ua));

  socket.on('open-room', (data, callback) => {
    let sessionId, playerId, roomName, gameId, maxPlayers, playerName, roomPassword;
    if (data.extra) {
      sessionId = data.extra.sessionid;
      playerId = data.extra.userid || data.extra.playerId;
      roomName = data.extra.room_name;
      gameId = data.extra.game_id;
      maxPlayers = data.maxPlayers || 4;
      playerName = data.extra.player_name || 'Unknown';
      roomPassword = data.extra.room_password || 'none';
    }
    if (!sessionId || !playerId) {
      return callback('Invalid data: sessionId and playerId required');
    }
    if (rooms[sessionId]) {
      return callback('Room already exists');
    }

    let finalDomain = data.extra.domain;
    if (finalDomain === undefined || finalDomain === null) {
        finalDomain = 'unknown';
    }

    rooms[sessionId] = {
      owner: socket.id,
      players: { [playerId]: { ...data.extra, socketId: socket.id } },
      peers: [],
      roomName: roomName || `Room ${sessionId}`,
      gameId: gameId || 'default',
      domain: finalDomain,
      password: data.password || null,
      maxPlayers: maxPlayers,
    };
    socket.join(sessionId);
    socket.sessionId = sessionId;
    socket.playerId = playerId;
	
  log(c.green('📦 open-room'),
      'session=', sessionId,
      'ownerSocket=', socket.id,
      'playerId=', playerId,
      'gameId=', gameId,
      'roomName=', roomName,
      'maxPlayers=', maxPlayers);

    io.to(sessionId).emit('users-updated', rooms[sessionId].players);
    callback(null);
  });

  socket.on('join-room', (data, callback) => {
    const { sessionid: sessionId, userid: playerId, player_name: playerName = 'Unknown' } = data.extra || {};
    
    if (!sessionId || !playerId) {
        if (typeof callback === 'function') callback('Invalid data: sessionId and playerId required');
        return;
    }

    const room = rooms[sessionId];
    if (!room) {
        if (typeof callback === 'function') callback('Room not found');
        return;
    }

    const roomPassword = data.password || null;
    if (room.password && room.password !== roomPassword) {
        if (typeof callback === 'function') callback('Incorrect password');
        return;
    }
    
    if (Object.keys(room.players).length >= room.maxPlayers) {
        if (typeof callback === 'function') callback('Room full');
        return;
    }
    
    room.players[playerId] = { ...data.extra, socketId: socket.id };
    socket.join(sessionId);
    socket.sessionId = sessionId;
    socket.playerId = playerId;
    
  log(c.green('🚪 join-room'),
      'session=', sessionId,
      'socket=', socket.id,
      'playerId=', playerId,
      'playerName=', player_name || playerName);

    io.to(sessionId).emit('users-updated', room.players);
    
    if (typeof callback === 'function') {
        callback(null, room.players);
    }
  });

  socket.on('leave-room', () => {
    if (socket.sessionId && socket.playerId) {
      const sessionId = socket.sessionId;
      const playerId = socket.playerId;
      if (rooms[sessionId]) {
        delete rooms[sessionId].players[playerId];
        rooms[sessionId].peers = rooms[sessionId].peers.filter(
          (peer) => peer.source !== socket.id && peer.target !== socket.id
        );
        io.to(sessionId).emit('users-updated', rooms[sessionId].players);
        if (Object.keys(rooms[sessionId].players).length === 0) {
          delete rooms[sessionId];
        } else if (socket.id === rooms[sessionId].owner) {
          const remainingPlayers = Object.keys(rooms[sessionId].players);
          if (remainingPlayers.length > 0) {
            const newOwnerId = rooms[sessionId].players[remainingPlayers[0]].socketId;
            rooms[sessionId].owner = newOwnerId;
            rooms[sessionId].peers = rooms[sessionId].peers.map((peer) => {
              if (peer.source === socket.id) {
                return { source: newOwnerId, target: peer.target };
              }
              return peer;
            });
            if (rooms[sessionId].peers.length > 0) {
              io.to(newOwnerId).emit('webrtc-signal', {
                target: rooms[sessionId].peers[0].target,
                requestRenegotiate: true,
              });
            }
            io.to(sessionId).emit('users-updated', rooms[sessionId].players);
          }
        }
      }
      socket.leave(sessionId);
      delete socket.sessionId;
      delete socket.playerId;
    }
  });

  socket.on('webrtc-signal', (data) => {
    try {
        const { target, candidate, offer, answer, requestRenegotiate } = data || {};
        
        if (!target && !requestRenegotiate) {
            throw new Error('Target ID missing unless requesting renegotiation');
        }
        
        if (requestRenegotiate) {
            const targetSocket = io.sockets.sockets.get(target);
            if (targetSocket) {
                targetSocket.emit('webrtc-signal', {
                    sender: socket.id,
                    requestRenegotiate: true,
                });
            }
        } else {
            io.to(target).emit('webrtc-signal', {
                sender: socket.id,
                candidate,
                offer,
                answer,
            });
        }
    } catch (error) {
        console.error(`WebRTC signal error: ${error.message}`);
    }
  });

  socket.on('data-message', (data) => {
    if (socket.sessionId) {
      socket.to(socket.sessionId).emit('data-message', data);
    }
  });

  socket.on('snapshot', (data) => {
    if (socket.sessionId) {
      socket.to(socket.sessionId).emit('snapshot', data);
    }
  });

  socket.on('input', (data) => {
    if (socket.sessionId) {
      socket.to(socket.sessionId).emit('input', data);
    }
  });

  socket.on('disconnect', () => {
	  
	log(c.mag('➖ disconnect'), c.yellow(socket.id),
		'room=', socket.sessionId || '-', 'player=', socket.playerId || '-');

    const sessionId = socket.sessionId;
    const playerId = socket.playerId;

    if (socket.sessionId && socket.playerId) {
      if (rooms[sessionId]) {
        delete rooms[sessionId].players[playerId];
        rooms[sessionId].peers = rooms[sessionId].peers.filter(
          (peer) => peer.source !== socket.id && peer.target !== socket.id
        );
        io.to(sessionId).emit('users-updated', rooms[sessionId].players);
        if (Object.keys(rooms[sessionId].players).length === 0) {
          delete rooms[sessionId];
        } else if (socket.id === rooms[sessionId].owner) {
          const remainingPlayers = Object.keys(rooms[sessionId].players);
          if (remainingPlayers.length > 0) {
            const newOwnerId = rooms[sessionId].players[remainingPlayers[0]].socketId;
            rooms[sessionId].owner = newOwnerId;
            rooms[sessionId].peers = rooms[sessionId].peers.map((peer) => {
              if (peer.source === socket.id) {
                return { source: newOwnerId, target: peer.target };
              }
              return peer;
            });
            if (rooms[sessionId].peers.length > 0) {
              io.to(newOwnerId).emit('webrtc-signal', {
                target: rooms[sessionId].peers[0].target,
                requestRenegotiate: true,
              });
            }
            io.to(sessionId).emit('users-updated', rooms[sessionId].players);
          }
        }
      }
    }
  });
});


server.listen(PORT, '0.0.0.0', () =>
  log(c.green(`✅ Netplay HTTPS server listening on https://0.0.0.0:${PORT}/`))
);
