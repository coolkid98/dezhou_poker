import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { potChipStyle } from '../src/components/chipVisuals.js';

test('potChipStyle: 筹码按列横向堆叠，并在超过一排后向上叠高', () => {
  assert.equal(potChipStyle(0).left, '0px');
  assert.equal(potChipStyle(1).left, '13px');
  assert.equal(potChipStyle(5).left, '65px');
  assert.equal(potChipStyle(0).bottom, '0px');
  assert.equal(potChipStyle(6).left, '0px');
  assert.equal(potChipStyle(6).bottom, '4px');
  assert.equal(potChipStyle(12).bottom, '8px');
});
