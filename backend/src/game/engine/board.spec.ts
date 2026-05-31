import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { autoPlace, validateBoard } from './board';

describe('board engine', () => {
  it('autoPlace produces a valid fleet', () => {
    const ships = autoPlace();
    const result = validateBoard(ships);
    assert.equal(result.ok, true, result.ok ? '' : (result as any).reason);
    assert.equal(ships.length, 10);
  });

  it('rejects overlapping ships', () => {
    const ships = autoPlace();
    ships[1] = { ...ships[1], x: ships[0].x, y: ships[0].y };
    const result = validateBoard(ships);
    assert.equal(result.ok, false);
  });
});
