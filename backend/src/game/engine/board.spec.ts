import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { autoPlace, validateBoard, buildPrivateBoard, publicEnemyView } from './board';

describe('board engine', () => {
  it('autoPlace produces a valid fleet', () => {
    const ships = autoPlace();
    const result = validateBoard(ships);
    assert.equal(result.ok, true, result.ok ? '' : (result as any).reason);
    assert.equal(ships.length, 10);
  });

  it('publicEnemyView hides non-sunk ship positions', () => {
    const ships = autoPlace();
    const board = buildPrivateBoard(ships);
    const view = publicEnemyView(board);
    assert.equal(view.sunkShips.length, 0);
    assert.equal(view.attacks.length, 0);
    assert.ok(!('ships' in view));
    const allShipCells = new Set(
      ships.flatMap((s) => {
        const cells: string[] = [];
        for (let i = 0; i < s.size; i++) {
          const x = s.horizontal ? s.x + i : s.x;
          const y = s.horizontal ? s.y : s.y + i;
          cells.push(`${x}:${y}`);
        }
        return cells;
      }),
    );
    for (const a of view.attacks) {
      assert.ok(!allShipCells.has(`${a.x}:${a.y}`) || a.hit === true);
    }
  });

  it('rejects overlapping ships', () => {
    const ships = autoPlace();
    ships[1] = { ...ships[1], x: ships[0].x, y: ships[0].y };
    const result = validateBoard(ships);
    assert.equal(result.ok, false);
  });
});
