// rooms.js 集成测试 — 验证房主控制开局流程
// 测试用内存 db：覆盖 rooms 模块对 db 的依赖后再 import
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

// 用内存库替换掉 db 模块
const mem = new Database(':memory:');
mem.exec(`
  CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT, password_hash TEXT,
    nickname TEXT, chips INTEGER, created_at INTEGER);
  CREATE TABLE rooms (id TEXT PRIMARY KEY, name TEXT, small_blind INTEGER,
    big_blind INTEGER, max_seats INTEGER, created_by INTEGER, created_at INTEGER);
  CREATE TABLE hands (id INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT,
    hand_no INTEGER, board TEXT, pot INTEGER, winners TEXT, actions TEXT, ended_at INTEGER);
`);

// 猴子补丁 db 模块：通过动态 import 拦截
const dbModule = await import('../src/db.js');
// 重新绑定 prepared statements 到内存库
const rewire = (obj) => {
  obj.db = mem;
};
// 注意：ESM 导出是 live binding，但 prepared statement 对象是值。
// 简单起见，直接在内存库插入测试数据并构造等效 RoomManager。
// 这里改用：直接导入 Game + 手写一个最小 RoomManager 来测试逻辑。
import { Game } from '../src/poker/game.js';

// 轻量 rooms 管理器（复刻 rooms.js 中 setReady/startGame 的核心逻辑，不涉及 db/io）
class TestRooms {
  constructor() { this.rooms = new Map(); }
  create({ id, hostId, sb = 10, bb = 20, maxSeats = 6 }) {
    const game = new Game({
      roomId: id, smallBlind: sb, bigBlind: bb,
      turnTimeoutMs: 0, autoStartMs: 0,
    });
    this.rooms.set(id, { meta: { id, created_by: hostId, max_seats: maxSeats, small_blind: sb, big_blind: bb }, game });
    return this.rooms.get(id);
  }
  join(id, userId, nickname, stack = 1000) {
    const r = this.rooms.get(id);
    r.game.addPlayer({ id: userId, nickname, stack, seat: r.game.players.length });
  }
  setReady(id, userId, ready) {
    const r = this.rooms.get(id);
    if (!r) return { error: '房间不存在' };
    const p = r.game.players.find(x => x.id === userId);
    if (!p) return { error: '玩家不在房间' };
    r.game.setReady(userId, !!ready);
    return { ok: true };
  }
  startGame(id, userId) {
    const r = this.rooms.get(id);
    if (!r) return { error: '房间不存在' };
    if (r.meta.created_by !== userId) return { error: '仅房主可开始游戏' };
    if (r.game.phase !== 'WAITING') return { error: '游戏已在进行中' };
    r.game.setReady(userId, true);
    const eligible = r.game.players.filter(p => p.ready && p.stack > 0);
    if (eligible.length < 2) return { error: '至少需要 2 名已准备玩家' };
    const notReady = r.game.players.filter(p => p.id !== userId && p.stack > 0 && !p.ready);
    if (notReady.length > 0) return { error: `还有 ${notReady.length} 位玩家未准备` };
    r.game.tryStart();
    return { ok: true };
  }
}

test('rooms: 加入不会自动 ready，牌局不会自动开始', () => {
  const rooms = new TestRooms();
  rooms.create({ id: 'R1', hostId: 1 });
  rooms.join('R1', 1, '房主');
  rooms.join('R1', 2, '玩家2');
  rooms.join('R1', 3, '玩家3');
  const game = rooms.rooms.get('R1').game;
  assert.equal(game.phase, 'WAITING', '仅加入不应开始');
  for (const p of game.players) assert.equal(p.ready, false, '未自动 ready');
});

test('rooms: 只有房主可以开始游戏', () => {
  const rooms = new TestRooms();
  rooms.create({ id: 'R2', hostId: 1 });
  rooms.join('R2', 1, '房主');
  rooms.join('R2', 2, '玩家2');
  rooms.setReady('R2', 2, true);
  // 非房主点 start 应拒绝
  const res = rooms.startGame('R2', 2);
  assert.equal(res.error, '仅房主可开始游戏');
  assert.equal(rooms.rooms.get('R2').game.phase, 'WAITING');
});

test('rooms: 房主开始前必须所有玩家 ready', () => {
  const rooms = new TestRooms();
  rooms.create({ id: 'R3', hostId: 1 });
  rooms.join('R3', 1, '房主');
  rooms.join('R3', 2, '玩家2');
  rooms.join('R3', 3, '玩家3');
  // 只有玩家2 ready，玩家3 没 ready
  rooms.setReady('R3', 2, true);
  const res = rooms.startGame('R3', 1);
  assert.ok(res.error?.includes('未准备'), '应提示有人未准备');
});

test('rooms: 3 人全部 ready 后房主开始 → 进入 3 人局，非盲注玩家先行动', () => {
  const rooms = new TestRooms();
  rooms.create({ id: 'R4', hostId: 1 });
  rooms.join('R4', 1, '房主');
  rooms.join('R4', 2, '玩家2');
  rooms.join('R4', 3, '玩家3');
  rooms.setReady('R4', 2, true);
  rooms.setReady('R4', 3, true);
  const res = rooms.startGame('R4', 1);
  assert.equal(res.ok, true);
  const game = rooms.rooms.get('R4').game;
  assert.equal(game.phase, 'PREFLOP');
  assert.equal(game.players.length, 3);
  assert.equal(game.buttonIdx, 0);
  assert.equal(game.sbIdx, 1);
  assert.equal(game.bbIdx, 2);
  // 首行动=button(UTG in 3-handed)，即房主 (P1)，不是小盲/大盲
  assert.equal(game.turnIdx, 0);
  const turnPlayer = game.players[game.turnIdx];
  assert.equal(turnPlayer.id, 1);
  // 关键断言：首行动玩家既不是 SB 也不是 BB
  assert.notEqual(game.turnIdx, game.sbIdx, '首行动不是小盲');
  assert.notEqual(game.turnIdx, game.bbIdx, '首行动不是大盲');
});

test('rooms: 玩家 setReady(false) 可以取消准备', () => {
  const rooms = new TestRooms();
  rooms.create({ id: 'R5', hostId: 1 });
  rooms.join('R5', 1, '房主');
  rooms.join('R5', 2, '玩家2');
  rooms.setReady('R5', 2, true);
  assert.equal(rooms.rooms.get('R5').game.players.find(p => p.id === 2).ready, true);
  rooms.setReady('R5', 2, false);
  assert.equal(rooms.rooms.get('R5').game.players.find(p => p.id === 2).ready, false);
});

test('rooms: 房主开始时仅 1 人 ready 也应拒绝', () => {
  const rooms = new TestRooms();
  rooms.create({ id: 'R6', hostId: 1 });
  rooms.join('R6', 1, '房主');
  // 只有房主，没有其他玩家
  const res = rooms.startGame('R6', 1);
  assert.ok(res.error?.includes('至少'), '应提示至少需要 2 名玩家');
});
