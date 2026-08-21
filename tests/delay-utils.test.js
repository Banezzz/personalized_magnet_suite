import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomBetween } from '../delay-utils.js';

describe('randomBetween', () => {
  it('stays within the requested range', () => {
    for (let i = 0; i < 20; i += 1) {
      const value = randomBetween(5000, 7000);
      assert.ok(value >= 5000 && value <= 7000);
    }
  });

  it('returns min when the range is invalid', () => {
    assert.equal(randomBetween(3000, 1000), 3000);
  });
});
