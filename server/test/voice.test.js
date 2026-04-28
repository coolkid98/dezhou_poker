import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../src/auth.js';
import { qInsertUser } from '../src/db.js';
import { rooms } from '../src/rooms.js';

process.env.MINIMAX_API_KEY ||= 'test-key';
const { attachSocket } = await import('../src/socket.js');

class FakeIo {
  constructor() {
    this.middleware = null;
    this.connectionHandler = null;
    this.sockets = new Map();
    this.rooms = new Map();
  }

  use(fn) {
    this.middleware = fn;
  }

  on(event, handler) {
    if (event === 'connection') this.connectionHandler = handler;
  }

  to(target) {
    return {
      emit: (event, payload) => this.emitTo(target, event, payload),
    };
  }

  emitTo(target, event, payload, excludeSocketId = null) {
    const roomSockets = this.rooms.get(target);
    if (roomSockets) {
      for (const socketId of roomSockets) {
        if (socketId !== excludeSocketId) this.sockets.get(socketId)?.serverEmit(event, payload);
      }
      return;
    }
    this.sockets.get(target)?.serverEmit(event, payload);
  }

  addToRoom(roomId, socket) {
    if (!this.rooms.has(roomId)) this.rooms.set(roomId, new Set());
    this.rooms.get(roomId).add(socket.id);
  }

  removeFromRoom(roomId, socket) {
    this.rooms.get(roomId)?.delete(socket.id);
  }

  async connect(token) {
    const socket = new FakeSocket(this, token);
    await new Promise((resolve, reject) => {
      this.middleware(socket, (err) => err ? reject(err) : resolve());
    });
    this.sockets.set(socket.id, socket);
    this.connectionHandler(socket);
    return socket;
  }
}

let socketSeq = 0;
class FakeSocket {
  constructor(io, token) {
    this.io = io;
    this.id = `socket-${++socketSeq}`;
    this.handshake = { auth: { token } };
    this.data = {};
    this.handlers = new Map();
    this.received = [];
  }

  on(event, handler) {
    this.handlers.set(event, handler);
  }

  emit(event, payload) {
    this.serverEmit(event, payload);
  }

  serverEmit(event, payload) {
    this.received.push({ event, payload });
  }

  clientEmit(event, payload) {
    this.handlers.get(event)?.(payload);
  }

  to(roomId) {
    return {
      emit: (event, payload) => this.io.emitTo(roomId, event, payload, this.id),
    };
  }

  join(roomId) {
    this.io.addToRoom(roomId, this);
  }

  leave(roomId) {
    this.io.removeFromRoom(roomId, this);
  }

  take(event) {
    const idx = this.received.findIndex(item => item.event === event);
    if (idx < 0) return null;
    const [item] = this.received.splice(idx, 1);
    return item.payload;
  }
}

function makeUser(label) {
  const suffix = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const username = `voice_${label}_${suffix}`;
  const nickname = `语音${label}_${suffix}`;
  const info = qInsertUser.run(username, 'test_hash', nickname, 10000, Date.now());
  const id = Number(info.lastInsertRowid);
  return {
    id,
    username,
    nickname,
    token: jwt.sign({ id }, JWT_SECRET),
  };
}

test('voice signaling: 加入语音、转发 offer/answer/ICE，并广播离开', async () => {
  const fakeIo = new FakeIo();
  attachSocket(fakeIo);

  const alice = makeUser('alice');
  const bob = makeUser('bob');
  const room = rooms.createRoom({
    name: 'voice-test',
    smallBlind: 10,
    bigBlind: 20,
    maxSeats: 6,
    initialStack: 2000,
    createdBy: alice.id,
  });

  const sA = await fakeIo.connect(alice.token);
  const sB = await fakeIo.connect(bob.token);

  sA.clientEmit('room:join', { roomId: room.meta.id });
  assert.deepEqual(sA.take('room:joined'), { roomId: room.meta.id });
  sB.clientEmit('room:join', { roomId: room.meta.id });
  assert.deepEqual(sB.take('room:joined'), { roomId: room.meta.id });

  sA.clientEmit('voice:join');
  assert.deepEqual(sA.take('voice:peers'), { peers: [] });
  sB.clientEmit('voice:join');
  assert.deepEqual(sB.take('voice:peers'), {
    peers: [{ playerId: alice.id, nickname: alice.nickname }],
  });
  assert.deepEqual(sA.take('voice:peer-joined'), {
    playerId: bob.id,
    nickname: bob.nickname,
  });

  sB.clientEmit('voice:offer', {
    toPlayerId: alice.id,
    description: { type: 'offer', sdp: 'offer-sdp' },
  });
  assert.deepEqual(sA.take('voice:offer'), {
    fromPlayerId: bob.id,
    fromNickname: bob.nickname,
    description: { type: 'offer', sdp: 'offer-sdp' },
  });

  sA.clientEmit('voice:answer', {
    toPlayerId: bob.id,
    description: { type: 'answer', sdp: 'answer-sdp' },
  });
  assert.deepEqual(sB.take('voice:answer'), {
    fromPlayerId: alice.id,
    description: { type: 'answer', sdp: 'answer-sdp' },
  });

  sB.clientEmit('voice:ice-candidate', {
    toPlayerId: alice.id,
    candidate: { candidate: 'ice-candidate' },
  });
  assert.deepEqual(sA.take('voice:ice-candidate'), {
    fromPlayerId: bob.id,
    candidate: { candidate: 'ice-candidate' },
  });

  sB.clientEmit('voice:leave');
  assert.deepEqual(sA.take('voice:peer-left'), { playerId: bob.id });
});
