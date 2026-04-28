import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { getTurnColor, getTurnProgress } from '../src/components/turnTimer.js';

test('turn timer: 剩余时间越多越接近绿色，越少越接近红色', () => {
  assert.equal(getTurnProgress(60_000, 0), 100);
  assert.equal(getTurnProgress(30_000, 0), 50);
  assert.equal(getTurnProgress(0, 0), 100);
  assert.equal(getTurnProgress(1, 1), 0);

  assert.equal(getTurnColor(100), 'hsl(120, 75%, 55%)');
  assert.equal(getTurnColor(50), 'hsl(60, 75%, 55%)');
  assert.equal(getTurnColor(0), 'hsl(0, 75%, 55%)');
});
