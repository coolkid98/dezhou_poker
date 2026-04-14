import { verifyToken } from './auth.js';
import { qUserById } from './db.js';
import { rooms } from './rooms.js';

export function attachSocket(io) {
  rooms.attachIo(io);
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
    });

    socket.on('room:leave', () => {
      if (currentRoomId) {
        rooms.leaveRoom(currentRoomId, user.id);
        socket.leave(currentRoomId);
        currentRoomId = null;
      }
    });

    socket.on('game:ready', () => {
      if (currentRoomId) rooms.ready(currentRoomId, user.id);
    });

    socket.on('game:action', (action) => {
      if (!currentRoomId) return;
      const res = rooms.act(currentRoomId, user.id, action);
      if (res && res.error) socket.emit('error', { message: res.error });
    });

    socket.on('disconnect', () => {
      if (currentRoomId) {
        // 断线不立刻离开，只解除 socket 映射；玩家可用相同账号重连
        const room = rooms.rooms.get(currentRoomId);
        if (room) room.sockets.delete(user.id);
      }
    });
  });
}
