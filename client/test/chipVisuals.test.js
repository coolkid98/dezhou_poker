import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { potChipOffset, potChipStyle, potChipTarget } from '../src/components/chipVisuals.js';

test('potChipStyle: 筹码按列横向堆叠，并在超过一排后向上叠高', () => {
  assert.equal(potChipStyle(0).left, '0px');
  assert.equal(potChipStyle(1).left, '13px');
  assert.equal(potChipStyle(5).left, '65px');
  assert.equal(potChipStyle(0).bottom, '0px');
  assert.equal(potChipStyle(6).left, '0px');
  assert.equal(potChipStyle(6).bottom, '4px');
  assert.equal(potChipStyle(12).bottom, '8px');
  assert.equal(potChipStyle(0)['--chip-rot'], '-16deg');
  assert.deepEqual(potChipOffset(6), {
    left: 0,
    bottom: 4,
    rotation: '-8deg',
  });
});

test('potChipTarget: 飞行终点扣除牌桌边框并指向筹码槽位中心', () => {
  const target = potChipTarget({
    feltRect: { left: 100, top: 50 },
    stackRect: { left: 300, bottom: 150 },
    clientLeft: 6,
    clientTop: 6,
    index: 6,
  });

  assert.deepEqual(target, { x: 209, y: 75 });
});
