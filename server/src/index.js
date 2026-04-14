import express from 'express';
import cors from 'cors';
import http from 'http';
import { Server as IOServer } from 'socket.io';
import { authRouter, verifyToken } from './auth.js';
import { rooms } from './rooms.js';
import { attachSocket } from './socket.js';
import { qUserById } from './db.js';

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api/auth', authRouter);

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const payload = token && verifyToken(token);
  if (!payload) return res.status(401).json({ error: '未登录' });
  const user = qUserById.get(payload.id);
  if (!user) return res.status(401).json({ error: '用户不存在' });
  req.user = user;
  next();
}

app.get('/api/rooms', authMiddleware, (req, res) => {
  res.json({ rooms: rooms.listPublicRooms() });
});

app.post('/api/rooms', authMiddleware, (req, res) => {
  const { name, smallBlind, bigBlind, maxSeats } = req.body || {};
  if (!name) return res.status(400).json({ error: '房间名必填' });
  const sb = Number(smallBlind) || 10;
  const bb = Number(bigBlind) || 20;
  const seats = Math.min(Math.max(Number(maxSeats) || 9, 2), 10);
  const room = rooms.createRoom({
    name, smallBlind: sb, bigBlind: bb, maxSeats: seats, createdBy: req.user.id,
  });
  res.json({ room: {
    id: room.meta.id, name: room.meta.name,
    smallBlind: room.meta.small_blind, bigBlind: room.meta.big_blind,
    maxSeats: room.meta.max_seats,
  }});
});

app.get('/api/rooms/:id/history', authMiddleware, (req, res) => {
  res.json({ history: rooms.getHistory(req.params.id) });
});

const server = http.createServer(app);
const io = new IOServer(server, { cors: { origin: '*' } });
attachSocket(io);

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`[server] listening on :${PORT}`);
});
