import { customAlphabet } from 'nanoid';
import { Game } from './poker/game.js';
import {
  qInsertRoom, qListRooms, qRoomById,
  qInsertHand, qHandsByRoom, qUpdateChips, qUserById,
} from './db.js';

const genRoomId = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 6);

// 房间在内存中持有实时状态，通过 db 持久化创建记录和手牌历史
class RoomManager {
  constructor() {
    this.rooms = new Map(); // roomId -> { meta, game, sockets: Map<userId, socketId> }
    this.io = null;
  }

  attachIo(io) { this.io = io; }

  createRoom({ name, smallBlind, bigBlind, maxSeats, createdBy }) {
    const id = genRoomId();
    qInsertRoom.run(id, name, smallBlind, bigBlind, maxSeats || 6, createdBy, Date.now());
    return this.loadRoom(id);
  }

  loadRoom(roomId) {
    if (this.rooms.has(roomId)) return this.rooms.get(roomId);
    const meta = qRoomById.get(roomId);
    if (!meta) return null;
    const game = new Game({
      roomId,
      smallBlind: meta.small_blind,
      bigBlind: meta.big_blind,
      onUpdate: () => this.broadcastState(roomId),
      onEnd: (summary) => this.handleHandEnd(roomId, summary),
      onEvent: (event) => {
        if (this.io) this.io.to(roomId).emit('game:event', event);
      },
    });
    const room = { meta, game, sockets: new Map(), buyIns: new Map() };
    this.rooms.set(roomId, room);
    return room;
  }

  listPublicRooms() {
    const rows = qListRooms.all();
    return rows.map(r => {
      const live = this.rooms.get(r.id);
      return {
        id: r.id,
        name: r.name,
        smallBlind: r.small_blind,
        bigBlind: r.big_blind,
        maxSeats: r.max_seats,
        players: live ? live.game.players.length : 0,
      };
    });
  }

  joinRoom(roomId, user, buyIn, socket) {
    const room = this.loadRoom(roomId);
    if (!room) return { error: '房间不存在' };
    if (room.game.players.length >= room.meta.max_seats &&
        !room.game.players.find(p => p.id === user.id)) {
      return { error: '房间已满' };
    }
    const dbUser = qUserById.get(user.id);
    if (!dbUser) return { error: '用户不存在' };
    const existing = room.game.players.find(p => p.id === user.id);
    if (!existing) {
      const amount = Math.min(buyIn || room.meta.big_blind * 100, dbUser.chips);
      if (amount <= 0) return { error: '筹码不足' };
      qUpdateChips.run(dbUser.chips - amount, user.id);
      room.game.addPlayer({
        id: user.id,
        nickname: dbUser.nickname,
        stack: amount,
        seat: room.game.players.length,
      });
      room.buyIns.set(user.id, amount);
      // 加入即自动 ready：手局进行中时下一手会自动参与
      room.game.markReady(user.id);
    }
    room.sockets.set(user.id, socket.id);
    socket.join(roomId);
    return { ok: true, room };
  }

  leaveRoom(roomId, userId) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    const p = room.game.players.find(x => x.id === userId);
    if (p) {
      // 归还桌面筹码到账户
      const dbUser = qUserById.get(userId);
      if (dbUser) qUpdateChips.run(dbUser.chips + p.stack, userId);
      room.game.removePlayer(userId);
    }
    room.sockets.delete(userId);
    this.broadcastState(roomId);
  }

  ready(roomId, userId) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    room.game.markReady(userId);
    this.broadcastState(roomId);
  }

  act(roomId, userId, action) {
    const room = this.rooms.get(roomId);
    if (!room) return { error: '房间不存在' };
    return room.game.act(userId, action);
  }

  broadcastState(roomId) {
    const room = this.rooms.get(roomId);
    if (!room || !this.io) return;
    const state = room.game.publicState();
    this.io.to(roomId).emit('state', state);
    // 单独给每位玩家推送底牌
    for (const [userId, socketId] of room.sockets.entries()) {
      const hole = room.game.getHole(userId);
      this.io.to(socketId).emit('private:cards', { hole });
    }
  }

  handleHandEnd(roomId, summary) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    // 落库
    qInsertHand.run(
      roomId,
      summary.handNo,
      summary.board.join(' '),
      summary.pot,
      JSON.stringify(summary.winners),
      JSON.stringify(summary.actions),
      Date.now(),
    );
    // 把最新桌面筹码同步到 users（保持账户 = 未加入桌上时的余额 + 桌上筹码）
    // 这里选择：仅在玩家离开时回写；此处不即时回写账户，只保证桌面 stack 正确
    if (this.io) this.io.to(roomId).emit('hand:end', summary);
    // 再广播一次状态（已进入 WAITING）
    this.broadcastState(roomId);
  }

  getHistory(roomId) {
    return qHandsByRoom.all(roomId).map(h => ({
      id: h.id,
      handNo: h.hand_no,
      board: h.board,
      pot: h.pot,
      winners: JSON.parse(h.winners || '[]'),
      endedAt: h.ended_at,
    }));
  }
}

export const rooms = new RoomManager();
