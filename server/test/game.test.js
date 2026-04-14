// game.js unit 测试 — 使用 node:test
// 运行：npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/poker/game.js';
import { calculatePots } from '../src/poker/sidePot.js';
import { evaluate7, compareRanks } from '../src/poker/evaluator.js';

// 创建一个禁用定时器的 Game，便于同步断言
function makeGame(numPlayers, { stack = 1000, sb = 10, bb = 20 } = {}) {
  const g = new Game({
    roomId: 'test', smallBlind: sb, bigBlind: bb,
    turnTimeoutMs: 0, autoStartMs: 0,
  });
  for (let i = 1; i <= numPlayers; i++) {
    g.addPlayer({ id: i, nickname: `P${i}`, stack, seat: i - 1 });
  }
  // 直接设置 ready 字段避免 tryStart 中途触发 heads-up，然后手动 tryStart 一次
  for (const p of g.players) p.ready = true;
  g.tryStart();
  return g;
}

test('heads-up: button 同时是 SB，preflop 首行动', () => {
  const g = makeGame(2);
  assert.equal(g.phase, 'PREFLOP');
  assert.equal(g.buttonIdx, 0);
  assert.equal(g.sbIdx, 0, 'heads-up 时 button 即 SB');
  assert.equal(g.bbIdx, 1);
  assert.equal(g.turnIdx, 0, 'SB(button) 先行动');
  assert.equal(g.players[0].bet, 10, 'P0 下了 SB');
  assert.equal(g.players[1].bet, 20, 'P1 下了 BB');
  assert.equal(g.currentBet, 20);
});

test('3 人局：SB=button+1, BB=button+2, 首行动=button(UTG)', () => {
  const g = makeGame(3);
  assert.equal(g.buttonIdx, 0);
  assert.equal(g.sbIdx, 1);
  assert.equal(g.bbIdx, 2);
  assert.equal(g.turnIdx, 0, '3 人局 UTG 就是 button');
  assert.equal(g.players[0].bet, 0);
  assert.equal(g.players[1].bet, 10);
  assert.equal(g.players[2].bet, 20);
});

test('4 人局：首行动是 BB 后一位（真正的 UTG）', () => {
  const g = makeGame(4);
  assert.equal(g.buttonIdx, 0);
  assert.equal(g.sbIdx, 1);
  assert.equal(g.bbIdx, 2);
  assert.equal(g.turnIdx, 3, 'UTG=BB 后一位');
});

test('3 人局：全部跟注后 BB 仍有 option（可 check 或 raise）', () => {
  const g = makeGame(3);
  // UTG (P0) 跟注
  assert.equal(g.turnIdx, 0);
  g.act(1, { type: 'call' });
  // SB (P1) 跟注
  assert.equal(g.turnIdx, 1);
  g.act(2, { type: 'call' });
  // 现在轮到 BB (P2)，他应该能行动（而不是直接进 flop）
  assert.equal(g.phase, 'PREFLOP', '轮次不应因跟注结束');
  assert.equal(g.turnIdx, 2, 'BB 得到 option');
  // BB check → 进入 flop
  g.act(3, { type: 'check' });
  assert.equal(g.phase, 'FLOP');
});

test('3 人局：BB 可以 raise，其他人需要重新行动', () => {
  const g = makeGame(3);
  g.act(1, { type: 'call' });       // UTG call
  g.act(2, { type: 'call' });       // SB call
  assert.equal(g.turnIdx, 2);        // BB option
  g.act(3, { type: 'raise', amount: 60 });
  assert.equal(g.phase, 'PREFLOP');
  assert.equal(g.currentBet, 60);
  // 之后 UTG 应该重新被问
  assert.equal(g.turnIdx, 0);
  assert.equal(g.players[0].acted, false);
  assert.equal(g.players[1].acted, false);
});

test('heads-up：button 先行动，flop 开始 BB 先行动', () => {
  const g = makeGame(2);
  assert.equal(g.turnIdx, 0);
  g.act(1, { type: 'call' });
  assert.equal(g.turnIdx, 1);
  g.act(2, { type: 'check' });
  assert.equal(g.phase, 'FLOP');
  // heads-up postflop: BB (非 button) 先行动
  assert.equal(g.turnIdx, 1);
});

test('button 每手轮转到下一个玩家', () => {
  const g = makeGame(3);
  assert.equal(g.buttonIdx, 0);
  // 快速打完：UTG/SB 都 fold，BB 默认胜
  g.act(1, { type: 'fold' });  // UTG fold
  g.act(2, { type: 'fold' });  // SB fold → BB 独享
  assert.equal(g.phase, 'WAITING');
  // 手动启动下一手（测试模式关了 autoStart）
  g.tryStart();
  assert.equal(g.phase, 'PREFLOP');
  assert.equal(g.buttonIdx, 1, 'button 前移到 P1');
  assert.equal(g.sbIdx, 2);
  assert.equal(g.bbIdx, 0);
  assert.equal(g.turnIdx, 1, '3 人局下新 button/UTG 先行动');
});

test('中途加入：加入时手局进行中则观战，下一手自动参与', () => {
  const g = makeGame(2);
  assert.equal(g.phase, 'PREFLOP');
  // P3 中途加入
  g.addPlayer({ id: 3, nickname: 'P3', stack: 1000, seat: 2 });
  g.markReady(3);
  const p3 = g.players.find(p => p.id === 3);
  assert.equal(p3.sittingOut, true, '观战状态');
  assert.equal(p3.ready, true);
  // 进行中的手不应受影响
  assert.equal(g.phase, 'PREFLOP');
  assert.equal(g.turnIdx, 0); // 依然 heads-up 的 turn

  // 快速结束：两人都 fold 不行，改成一方弃牌
  g.act(1, { type: 'fold' }); // P0 (SB/button) fold
  assert.equal(g.phase, 'WAITING');

  // 下一手：现在应该是 3 人
  g.tryStart();
  assert.equal(g.phase, 'PREFLOP');
  const activeCount = g.players.filter(p => !p.folded && !p.sittingOut).length;
  assert.equal(activeCount, 3, '中途加入的玩家进入下一手');
});

test('中途加入的玩家不会被选为当前手 turn', () => {
  const g = makeGame(2);
  g.addPlayer({ id: 3, nickname: 'P3', stack: 1000, seat: 2 });
  g.markReady(3);
  // turnIdx 应仍指向 heads-up 的两位玩家之一
  assert.ok([0, 1].includes(g.turnIdx));
  // P3 应当不在 nextToAct 的结果里
  const next = g.nextToAct(g.turnIdx);
  assert.ok(next !== 2, '中途加入者不应被选中行动');
});

test('sidePot: 三方 all-in 分层正确', () => {
  // P1 只有 100, P2/P3 各 500，且都 all-in
  const contributions = [
    { playerId: 1, amount: 100, folded: false },
    { playerId: 2, amount: 500, folded: false },
    { playerId: 3, amount: 500, folded: false },
  ];
  const pots = calculatePots(contributions);
  // 主池：100 * 3 = 300，由三人争夺
  // 边池：(500 - 100) * 2 = 800，由 P2/P3 争夺
  assert.equal(pots.length, 2);
  assert.equal(pots[0].amount, 300);
  assert.deepEqual(pots[0].eligible.sort(), [1, 2, 3]);
  assert.equal(pots[1].amount, 800);
  assert.deepEqual(pots[1].eligible.sort(), [2, 3]);
});

test('sidePot: 一方弃牌时 contributes 依然计入相应池', () => {
  // P1 跟到 50 后弃牌，P2/P3 跟到 200 摊牌
  const contributions = [
    { playerId: 1, amount: 50, folded: true },
    { playerId: 2, amount: 200, folded: false },
    { playerId: 3, amount: 200, folded: false },
  ];
  const pots = calculatePots(contributions);
  assert.equal(pots.length, 2);
  // 第一层 50×3=150，但 P1 fold → 仅 P2/P3 有资格
  assert.equal(pots[0].amount, 150);
  assert.deepEqual(pots[0].eligible.sort(), [2, 3]);
  // 第二层 150×2=300，P2/P3 争夺
  assert.equal(pots[1].amount, 300);
});

test('evaluator: 基础牌型大小比较', () => {
  // 皇家同花顺 > 同花顺 > 四条
  const royal = evaluate7([
    { r: 14, s: 's' }, { r: 13, s: 's' }, { r: 12, s: 's' }, { r: 11, s: 's' }, { r: 10, s: 's' },
    { r: 2, s: 'd' }, { r: 3, s: 'd' },
  ]);
  assert.equal(royal.category, 9);

  const straightFlush = evaluate7([
    { r: 9, s: 's' }, { r: 8, s: 's' }, { r: 7, s: 's' }, { r: 6, s: 's' }, { r: 5, s: 's' },
    { r: 2, s: 'd' }, { r: 3, s: 'd' },
  ]);
  assert.equal(straightFlush.category, 8);
  assert.ok(compareRanks(royal, straightFlush) > 0);

  const quads = evaluate7([
    { r: 7, s: 's' }, { r: 7, s: 'h' }, { r: 7, s: 'd' }, { r: 7, s: 'c' }, { r: 5, s: 's' },
    { r: 2, s: 'd' }, { r: 3, s: 'd' },
  ]);
  assert.equal(quads.category, 7);
  assert.ok(compareRanks(straightFlush, quads) > 0);
});

test('evaluator: A-2-3-4-5 轮子顺子识别', () => {
  const wheel = evaluate7([
    { r: 14, s: 's' }, { r: 2, s: 'h' }, { r: 3, s: 'd' }, { r: 4, s: 'c' }, { r: 5, s: 's' },
    { r: 9, s: 'd' }, { r: 13, s: 'c' },
  ]);
  assert.equal(wheel.category, 4);
  assert.equal(wheel.tiebreakers[0], 5, 'A-5 的最大牌是 5，不是 A');
});

test('完整手局：3 人局从 preflop 打到摊牌不报错', () => {
  const g = makeGame(3, { stack: 1000 });
  // preflop
  g.act(1, { type: 'call' });   // UTG call
  g.act(2, { type: 'call' });   // SB call
  g.act(3, { type: 'check' });  // BB check
  assert.equal(g.phase, 'FLOP');
  assert.equal(g.board.length, 3);
  // flop: SB acts first postflop
  assert.equal(g.turnIdx, 1);
  g.act(2, { type: 'check' });
  g.act(3, { type: 'check' });
  g.act(1, { type: 'check' });
  assert.equal(g.phase, 'TURN');
  assert.equal(g.board.length, 4);
  g.act(2, { type: 'check' });
  g.act(3, { type: 'check' });
  g.act(1, { type: 'check' });
  assert.equal(g.phase, 'RIVER');
  assert.equal(g.board.length, 5);
  g.act(2, { type: 'check' });
  g.act(3, { type: 'check' });
  g.act(1, { type: 'check' });
  // 摊牌后回到 WAITING
  assert.equal(g.phase, 'WAITING');
  // 玩家筹码总和不变（庄家未抽水）
  const totalChips = g.players.reduce((s, p) => s + p.stack, 0);
  assert.equal(totalChips, 3000, '筹码守恒');
});

test('6 人局：盲注顺序与首行动位置', () => {
  const g = makeGame(6);
  assert.equal(g.buttonIdx, 0);
  assert.equal(g.sbIdx, 1);
  assert.equal(g.bbIdx, 2);
  assert.equal(g.turnIdx, 3, '6 人局：UTG=BB+1');
  assert.notEqual(g.turnIdx, g.sbIdx);
  assert.notEqual(g.turnIdx, g.bbIdx);
});

test('10 人局：盲注顺序与首行动位置', () => {
  const g = makeGame(10);
  assert.equal(g.buttonIdx, 0);
  assert.equal(g.sbIdx, 1);
  assert.equal(g.bbIdx, 2);
  assert.equal(g.turnIdx, 3);
  // 验证全员发到底牌
  const withCards = g.players.filter(p => p.hasCards);
  assert.equal(withCards.length, 10);
  // 底池只有小盲大盲
  assert.equal(g.pot === undefined ? g.players.reduce((s, p) => s + p.totalBet, 0) : g.pot, 30);
});

test('10 人局：一轮全部跟注后进入 flop', () => {
  const g = makeGame(10);
  // 从 UTG(P3) 开始依次 call，到 BB 为止；BB 有 option → check
  const order = [3, 4, 5, 6, 7, 8, 9, 0, 1]; // 9 个玩家依次 call
  for (const idx of order) {
    assert.equal(g.turnIdx, idx, `应该轮到 P${idx}`);
    g.act(idx + 1, { type: 'call' });
  }
  // 最后 BB (P2) option
  assert.equal(g.turnIdx, 2);
  g.act(3, { type: 'check' });
  assert.equal(g.phase, 'FLOP');
  assert.equal(g.board.length, 3);
});

test('publicState: 同桌重复昵称自动加 #id 后缀', () => {
  const g = new Game({
    roomId: 't', smallBlind: 10, bigBlind: 20,
    turnTimeoutMs: 0, autoStartMs: 0,
  });
  g.addPlayer({ id: 10, nickname: 'kid3', stack: 1000, seat: 0 });
  g.addPlayer({ id: 11, nickname: 'kid3', stack: 1000, seat: 1 });
  g.addPlayer({ id: 12, nickname: 'alice', stack: 1000, seat: 2 });
  const st = g.publicState();
  const names = st.players.map(p => p.nickname).sort();
  assert.deepEqual(names, ['alice', 'kid3#10', 'kid3#11']);
});

test('publicState: 昵称无冲突时保持原样', () => {
  const g = makeGame(3);
  const st = g.publicState();
  for (const p of st.players) assert.ok(!p.nickname.includes('#'));
});

test('只有一人未弃牌时立即结算', () => {
  const g = makeGame(3);
  g.act(1, { type: 'fold' });  // UTG fold
  g.act(2, { type: 'fold' });  // SB fold
  // BB 独享，goShowdown 应立即触发
  assert.equal(g.phase, 'WAITING');
  const p3 = g.players.find(p => p.id === 3);
  assert.equal(p3.stack, 1000 + 10, 'BB 赢了 SB 下的 10'); // BB 自己下的 20 回流
});
