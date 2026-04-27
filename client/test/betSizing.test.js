import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { clampBet, poolRaiseTo } from '../src/components/betSizing.js';

test('clampBet: 手动输入金额会限制在合法加注范围内', () => {
  assert.equal(clampBet(40, 60, 500), 60);
  assert.equal(clampBet(800, 60, 500), 500);
  assert.equal(clampBet(180, 60, 500), 180);
});

test('poolRaiseTo: 按底池比例计算加注至金额', () => {
  const common = {
    pot: 300,
    meBet: 20,
    toCall: 40,
    minRaiseTo: 100,
    maxRaiseTo: 1000,
  };

  assert.equal(poolRaiseTo({ ...common, fraction: 1 / 4 }), 135);
  assert.equal(poolRaiseTo({ ...common, fraction: 1 / 3 }), 160);
  assert.equal(poolRaiseTo({ ...common, fraction: 1 / 2 }), 210);
});

test('poolRaiseTo: 底池比例结果低于最小加注或高于筹码上限时自动夹紧', () => {
  assert.equal(poolRaiseTo({
    pot: 30,
    fraction: 1 / 4,
    meBet: 0,
    toCall: 20,
    minRaiseTo: 60,
    maxRaiseTo: 200,
  }), 60);

  assert.equal(poolRaiseTo({
    pot: 1000,
    fraction: 1 / 2,
    meBet: 0,
    toCall: 20,
    minRaiseTo: 60,
    maxRaiseTo: 300,
  }), 300);
});
