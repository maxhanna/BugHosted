/**
 * EmulatorJS Netplay Server — embedded module
 * Based on: https://github.com/EmulatorJS/EmulatorJS-Netplay  (Apache-2.0)
 *
 * This is a near-exact copy of the upstream server.js, adapted to run as a
 * module inside the existing Express / HTTPS server instead of on its own port.
 *
 * IMPORTANT: The EmulatorJS client does `io(netplayUrl)`.  When the URL has
 * NO path component (e.g. "https://bughosted.com") Socket.IO connects to the
 * DEFAULT namespace "/".  The upstream server.js also uses the default namespace.
 * We MUST do the same — using a custom namespace like "/netplay" changes
 * socket-id scoping, room broadcast behaviour and breaks the client relay.
 *
 * Usage (in prod-server.js):
 *
 *   const netplay = require('./netplay-server');
 *   netplay.registerRoutes(app);            // EARLY — before any middleware
 *   // ... create `server` ...
 *   netplay.attachSocket(server);           // after server creation
 */

const chalk = require('chalk');

// ---- Simple logger with timestamps (matches standalone server.js style) ----
const ts = () => new Date().toISOString().replace('T', ' ').replace('Z', '');
function log(...args) {
  console.log(chalk.dim(`[${ts()}]`), chalk.cyan('[Netplay]'), ...args);
}

// ---- Shared state (module-scoped) ----
let rooms = {};
let io = null; // populated by attachSocket

// ---- Helpers ----
const getClientIp = (socket) => {
  const forwarded = socket.handshake.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return socket.handshake.headers['x-real-ip'] || socket.handshake.address;
};

// ---- Express routes (call BEFORE any middleware) ----
function registerRoutes(app) {
  /**
   * GET /list?game_id=<id>
   * Returns open rooms filtered by game_id.
   * This matches the upstream EmulatorJS-Netplay server.js exactly.
   */
  app.get('/list', (req, res) => {
    const gameId = req.query.game_id;
    const openRooms = Object.keys(rooms)
      .filter((sessionId) => {
        const room = rooms[sessionId];
        return (
          room &&
          Object.keys(room.players).length < room.maxPlayers &&
          String(room.gameId) === String(gameId)
        );
      })
      .reduce((acc, sessionId) => {
        const room = rooms[sessionId];
        const ownerPlayerId = Object.keys(room.players).find(
          (pid) => room.players[pid].socketId === room.owner
        );
        const playerName = ownerPlayerId
          ? room.players[ownerPlayerId].player_name
          : 'Unknown';
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

  log(chalk.green('✓ Netplay route registered: GET /list'));
}

// ---- Socket.IO attachment (call after httpServer is created) ----
function attachSocket(httpServer) {
  const { Server: SocketIOServer } = require('socket.io');

  // Match the upstream server.js — default namespace, default path (/socket.io).
  //
  // CRITICAL: maxHttpBufferSize must be large enough for game-state sync.
  // When player 2 joins, the host sends the ENTIRE emulator save state
  // (N64 = 16 MB+, PS1 = several MB, SNES = ~500 KB) as a single
  // Socket.IO message.  The default limit is only 1 MB — exceeding it
  // makes engine.io force-disconnect the sender, killing both players.
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    maxHttpBufferSize: 100 * 1024 * 1024,  // 100 MB — handles any save state
  });

  // Periodically clean up empty rooms
  setInterval(() => {
    for (const sessionId in rooms) {
      if (Object.keys(rooms[sessionId].players).length === 0) {
        delete rooms[sessionId];
      }
    }
  }, 60000);

  // ---- Default namespace — identical to upstream server.js ----
  io.on('connection', (socket) => {
    const clientIp = getClientIp(socket);
    const ua = (socket.handshake.headers['user-agent'] || '').slice(0, 120);
    log(chalk.green('➕ connect'), chalk.yellow(socket.id), 'from', clientIp, chalk.dim(ua));

    // ---- open-room ----
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

      log(chalk.green('📦 open-room'),
        'session=', sessionId,
        'ownerSocket=', socket.id,
        'playerId=', playerId,
        'gameId=', gameId,
        'roomName=', roomName,
        'maxPlayers=', maxPlayers);

      io.to(sessionId).emit('users-updated', rooms[sessionId].players);
      callback(null);
    });

    // ---- join-room ----
    socket.on('join-room', (data, callback) => {
      const {
        sessionid: sessionId,
        userid: playerId,
        player_name: playerName = 'Unknown',
      } = data.extra || {};

      if (!sessionId || !playerId) {
        if (typeof callback === 'function')
          callback('Invalid data: sessionId and playerId required');
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

      log(chalk.green('🚪 join-room'),
        'session=', sessionId,
        'socket=', socket.id,
        'playerId=', playerId,
        'playerName=', playerName);

      io.to(sessionId).emit('users-updated', room.players);

      if (typeof callback === 'function') {
        callback(null, room.players);
      }
    });

    // ---- leave-room ----
    socket.on('leave-room', () => {
      handlePlayerLeave(socket);
    });

    // ---- webrtc-signal ----
    socket.on('webrtc-signal', (data) => {
      try {
        const { target, candidate, offer, answer, requestRenegotiate } =
          data || {};

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
        console.error(`[Netplay] WebRTC signal error: ${error.message}`);
      }
    });

    // ---- data-message ----
    // Matches upstream: socket.to(room) broadcasts to everyone else in room
    socket.on('data-message', (data) => {
      if (socket.sessionId) {
        socket.to(socket.sessionId).emit('data-message', data);
      }
    });

    // ---- snapshot ----
    socket.on('snapshot', (data) => {
      if (socket.sessionId) {
        socket.to(socket.sessionId).emit('snapshot', data);
      }
    });

    // ---- input ----
    socket.on('input', (data) => {
      if (socket.sessionId) {
        socket.to(socket.sessionId).emit('input', data);
      }
    });

    // ---- disconnect ----
    socket.on('disconnect', (reason) => {
      log(chalk.red('⚡ disconnect'), chalk.yellow(socket.id), 'reason:', reason,
        'room:', socket.sessionId || '-', 'player:', socket.playerId || '-');
      handlePlayerLeave(socket);
    });
  });

  log(chalk.green('✓ EmulatorJS Netplay server attached (default namespace /)'));
}

// ---- Shared disconnect / leave logic ----
function handlePlayerLeave(socket) {
  const sessionId = socket.sessionId;
  const playerId = socket.playerId;

  if (!sessionId || !playerId) return;
  if (!rooms[sessionId]) return;

  log(chalk.magenta('➖ disconnect/leave'), chalk.yellow(socket.id),
    'room=', sessionId, 'player=', playerId);

  delete rooms[sessionId].players[playerId];
  rooms[sessionId].peers = rooms[sessionId].peers.filter(
    (peer) => peer.source !== socket.id && peer.target !== socket.id
  );

  io.to(sessionId).emit('users-updated', rooms[sessionId].players);

  if (Object.keys(rooms[sessionId].players).length === 0) {
    delete rooms[sessionId];
  } else if (socket.id === rooms[sessionId].owner) {
    // Transfer ownership
    const remainingPlayers = Object.keys(rooms[sessionId].players);
    if (remainingPlayers.length > 0) {
      const newOwnerId =
        rooms[sessionId].players[remainingPlayers[0]].socketId;
      rooms[sessionId].owner = newOwnerId;

      log(chalk.yellow('👑 owner transferred'), 'room=', sessionId, 'newOwner=', newOwnerId);

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

  socket.leave(sessionId);
  delete socket.sessionId;
  delete socket.playerId;
}

module.exports = { registerRoutes, attachSocket };
