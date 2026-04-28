import { verifyToken } from './auth.js';
import { qUserById } from './db.js';
import { rooms } from './rooms.js';
import { monteCarloWinRate } from './poker/montecarlo.js';
import { getAISuggestion } from './ai.js';
import { evaluate7 } from './poker/evaluator.js';
import { cardToStr } from './poker/deck.js';

export function attachSocket(io) {
  rooms.attachIo(io);
  const voiceUsers = new Map(); // roomId -> Map<userId, { socketId, nickname }>

  const leaveVoice = (roomId, userId) => {
    const roomVoice = voiceUsers.get(roomId);
    if (!roomVoice || !roomVoice.has(userId)) return;
    roomVoice.delete(userId);
    if (roomVoice.size === 0) voiceUsers.delete(roomId);
    socketToRoom(io, roomId).emit('voice:peer-left', { playerId: userId });
  };

  const voiceTargetSocket = (roomId, userId) => {
    const roomVoice = voiceUsers.get(roomId);
    return roomVoice?.get(userId)?.socketId || null;
  };

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    const payload = token && verifyToken(token);
    if (!payload) return next(new Error('unauthorized'));
    const user = qUserById.get(payload.id);
    if (!user) return next(new Error('user not found'));
    socket.data.user = user;
    next();
  });

  io.on('connection', (socket) => {
    const user = socket.data.user;
    let currentRoomId = null;

    socket.on('room:join', ({ roomId, buyIn }) => {
      if (currentRoomId && currentRoomId !== roomId) {
        rooms.leaveRoom(currentRoomId, user.id);
      }
      const res = rooms.joinRoom(roomId, user, buyIn, socket);
      if (res.error) {
        socket.emit('error', { message: res.error });
        return;
      }
      currentRoomId = roomId;
      rooms.broadcastState(roomId);
      socket.emit('room:joined', { roomId });
      socket.emit('hand:history', rooms.getHistory(roomId));
      const roomVoice = voiceUsers.get(roomId);
      if (roomVoice) {
        const peers = [...roomVoice.entries()]
          .filter(([id]) => id !== user.id)
          .map(([id, info]) => ({ playerId: id, nickname: info.nickname }));
        socket.emit('voice:peers', { peers });
      }
      // 断线重连：仅对已在房间内的玩家补发上一手结算结果
      if (res.isRejoining) {
        const rejoiningRoom = rooms.rooms.get(roomId);
        if (rejoiningRoom?.lastHandSummary && rejoiningRoom.game.phase === 'WAITING') {
          setTimeout(() => socket.emit('hand:end', rejoiningRoom.lastHandSummary), 300);
        }
      }
    });

    socket.on('room:leave', () => {
      if (currentRoomId) {
        leaveVoice(currentRoomId, user.id);
        rooms.leaveRoom(currentRoomId, user.id);
        socket.leave(currentRoomId);
        currentRoomId = null;
      }
    });

    socket.on('game:ready', (payload = {}) => {
      if (!currentRoomId) return;
      const ready = payload.ready !== false; // 默认 true
      const res = rooms.setReady(currentRoomId, user.id, ready);
      if (res && res.error) socket.emit('error', { message: res.error });
    });

    socket.on('game:add-chips', () => {
      if (!currentRoomId) return;
      const res = rooms.addChips(currentRoomId, user.id);
      if (res && res.error) socket.emit('error', { message: res.error });
    });

    socket.on('game:start', () => {
      if (!currentRoomId) return;
      const res = rooms.startGame(currentRoomId, user.id);
      if (res && res.error) socket.emit('error', { message: res.error });
    });

    socket.on('game:end', () => {
      if (!currentRoomId) return;
      const res = rooms.endGame(currentRoomId, user.id);
      if (res && res.error) socket.emit('error', { message: res.error });
    });

    socket.on('game:action', (action) => {
      if (!currentRoomId) return;
      const res = rooms.act(currentRoomId, user.id, action);
      if (res && res.error) socket.emit('error', { message: res.error });
    });

    socket.on('voice:join', () => {
      if (!currentRoomId) return;
      let roomVoice = voiceUsers.get(currentRoomId);
      if (!roomVoice) {
        roomVoice = new Map();
        voiceUsers.set(currentRoomId, roomVoice);
      }
      const peers = [...roomVoice.entries()]
        .filter(([id]) => id !== user.id)
        .map(([id, info]) => ({ playerId: id, nickname: info.nickname }));
      roomVoice.set(user.id, { socketId: socket.id, nickname: user.nickname });
      socket.emit('voice:peers', { peers });
      socket.to(currentRoomId).emit('voice:peer-joined', {
        playerId: user.id,
        nickname: user.nickname,
      });
    });

    socket.on('voice:leave', () => {
      if (!currentRoomId) return;
      leaveVoice(currentRoomId, user.id);
    });

    socket.on('voice:offer', ({ toPlayerId, description } = {}) => {
      if (!currentRoomId || !toPlayerId || !description) return;
      const targetSocket = voiceTargetSocket(currentRoomId, toPlayerId);
      if (targetSocket) {
        io.to(targetSocket).emit('voice:offer', {
          fromPlayerId: user.id,
          fromNickname: user.nickname,
          description,
        });
      }
    });

    socket.on('voice:answer', ({ toPlayerId, description } = {}) => {
      if (!currentRoomId || !toPlayerId || !description) return;
      const targetSocket = voiceTargetSocket(currentRoomId, toPlayerId);
      if (targetSocket) {
        io.to(targetSocket).emit('voice:answer', {
          fromPlayerId: user.id,
          description,
        });
      }
    });

    socket.on('voice:ice-candidate', ({ toPlayerId, candidate } = {}) => {
      if (!currentRoomId || !toPlayerId || !candidate) return;
      const targetSocket = voiceTargetSocket(currentRoomId, toPlayerId);
      if (targetSocket) {
        io.to(targetSocket).emit('voice:ice-candidate', {
          fromPlayerId: user.id,
          candidate,
        });
      }
    });

    socket.on('ai:suggest', async () => {
      if (!currentRoomId) return;
      const room = rooms.rooms.get(currentRoomId);
      if (!room) return;

      const game = room.game;
      const holeRaw = game.players.find(p => p.id === user.id)?.hole;
      if (!holeRaw || holeRaw.length < 2) {
        socket.emit('ai:suggestion', { error: '当前没有手牌' });
        return;
      }

      const state = game.publicState();
      const me = state.players.find(p => p.id === user.id);
      const numOpponents = state.players.filter(p => p.id !== user.id && !p.folded && !p.sittingOut).length;
      const toCall = Math.max(0, state.currentBet - (me?.bet || 0));

      // 蒙特卡洛仅作为上下文辅助，不直接推送
      const { winRate: mcWinRate } = monteCarloWinRate(holeRaw, game.board, Math.max(1, numOpponents));

      // 当前最佳牌型
      let handName = '';
      if (game.board.length >= 3) {
        try { handName = evaluate7([...holeRaw, ...game.board]).name || ''; } catch {}
      }

      // AI 分析完成后一次性推送三个字段
      try {
        const { winRate, action, reason } = await getAISuggestion({
          hole: holeRaw.map(cardToStr),
          board: game.board.map(cardToStr),
          phase: state.phase,
          pot: state.pot,
          myStack: me?.stack || 0,
          myTotalBet: me?.totalBet || 0,
          toCall,
          numOpponents: Math.max(1, numOpponents),
          handName,
        });
        socket.emit('ai:suggestion', { winRate, action, reason });
      } catch (err) {
        console.error('[AI] error:', err.message);
        socket.emit('ai:suggestion', { error: 'AI 分析暂时不可用，请稍后重试' });
      }
    });

    socket.on('disconnect', () => {
      if (currentRoomId) {
        leaveVoice(currentRoomId, user.id);
        // 断线不立刻离开，只解除 socket 映射；玩家可用相同账号重连
        const room = rooms.rooms.get(currentRoomId);
        if (room) room.sockets.delete(user.id);
      }
    });
  });
}

function socketToRoom(io, roomId) {
  return io.to(roomId);
}
