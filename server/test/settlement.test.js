import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSettlement } from '../src/settlement.js';

test('settlement: A 320 / B 80 且各买入 200 时，B 转给 A 120', () => {
  const summary = createSettlement(
    [
      { id: 1, nickname: 'A', stack: 320 },
      { id: 2, nickname: 'B', stack: 80 },
    ],
    new Map([[1, 200], [2, 200]]),
    123,
  );

  assert.equal(summary.totalBuyIn, 400);
  assert.equal(summary.totalFinal, 400);
  assert.equal(summary.balanced, true);
  assert.deepEqual(summary.players.map(p => ({
    nickname: p.nickname,
    buyIn: p.buyIn,
    finalStack: p.finalStack,
    net: p.net,
  })), [
    { nickname: 'A', buyIn: 200, finalStack: 320, net: 120 },
    { nickname: 'B', buyIn: 200, finalStack: 80, net: -120 },
  ]);
  assert.deepEqual(summary.transfers, [{
    fromPlayerId: 2,
    fromNickname: 'B',
    toPlayerId: 1,
    toNickname: 'A',
    amount: 120,
  }]);
});

test('settlement: 多名输家按赢家净赢金额生成转账明细', () => {
  const summary = createSettlement(
    [
      { id: 1, nickname: 'A', stack: 350 },
      { id: 2, nickname: 'B', stack: 260 },
      { id: 3, nickname: 'C', stack: 140 },
      { id: 4, nickname: 'D', stack: 50 },
    ],
    new Map([[1, 200], [2, 200], [3, 200], [4, 200]]),
    123,
  );

  assert.equal(summary.balanced, true);
  assert.deepEqual(summary.players.map(p => p.net), [150, 60, -60, -150]);
  assert.deepEqual(summary.transfers, [
    { fromPlayerId: 3, fromNickname: 'C', toPlayerId: 1, toNickname: 'A', amount: 60 },
    { fromPlayerId: 4, fromNickname: 'D', toPlayerId: 1, toNickname: 'A', amount: 90 },
    { fromPlayerId: 4, fromNickname: 'D', toPlayerId: 2, toNickname: 'B', amount: 60 },
  ]);
});
