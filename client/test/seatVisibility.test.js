import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { getSeatVisibility } from '../src/components/seatVisibility.js';

test('自己弃牌后继续显示自己的手牌，不播放隐藏动画', () => {
  const result = getSeatVisibility({
    player: { folded: true, hasCards: true },
    isSelf: true,
    hole: ['As', 'Kd'],
    showdownHole: null,
  });

  assert.deepEqual(result.showCards, ['As', 'Kd']);
  assert.equal(result.foldClass, 'self-folded');
  assert.equal(result.shouldAnimateFold, false);
});

test('别人弃牌后不显示底牌，并保持弃牌隐藏动画', () => {
  const result = getSeatVisibility({
    player: { folded: true, hasCards: true },
    isSelf: false,
    hole: null,
    showdownHole: null,
  });

  assert.equal(result.showCards, null);
  assert.equal(result.foldClass, 'folded');
  assert.equal(result.shouldAnimateFold, true);
});

test('摊牌信息存在时，非自己玩家可以显示公开手牌', () => {
  const result = getSeatVisibility({
    player: { folded: false, hasCards: false },
    isSelf: false,
    hole: null,
    showdownHole: ['Qh', 'Qs'],
  });

  assert.deepEqual(result.showCards, ['Qh', 'Qs']);
  assert.equal(result.foldClass, null);
  assert.equal(result.shouldAnimateFold, false);
});
