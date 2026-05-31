import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { roundRub } from './money';

describe('money utils', () => {
  it('roundRub avoids float drift', () => {
    assert.equal(roundRub(0.1 + 0.2), 0.3);
    assert.equal(roundRub(99.999), 100);
  });
});
