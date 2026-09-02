import { describe, expect, it } from 'vitest';
import { createBoard } from '@/engine/board';
import { legalMoveResult } from '@/engine/rules';
import { opponent } from '@/engine/types';
import { buildSgf, loadGameRecord } from './record';
import { parseSgf } from './parse';
import { getFirstValue, getValues } from './types';
import type { GameMove, Player, Point } from '@/engine/types';

/** Plays a legal sequence through the reference engine. */
const playMoves = (size: number, points: Point[]): GameMove[] => {
  let board = createBoard(size);
  let player: Player = 'black';
  const moves: GameMove[] = [];
  for (const point of points) {
    const result = legalMoveResult(board, player, point);
    if (!result) continue;
    board = result.board;
    moves.push({
      kind: 'stone',
      player,
      point,
      captures: result.captured,
      boardAfter: result.board,
    });
    player = opponent(player);
  }
  return moves;
};

describe('importing a record', () => {
  it('replays the main line through the rules engine', () => {
    const result = loadGameRecord('(;FF[4]GM[1]SZ[9];B[aa];W[bb];B[cc])');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.boardSize).toBe(9);
    expect(result.warnings).toEqual([]);
    expect(result.moves).toHaveLength(3);
    expect(result.moves.map((move) => move.player)).toEqual(['black', 'white', 'black']);
    expect(result.initialBoard.flat().every((cell) => cell === 'empty')).toBe(true);
  });

  it('places handicap stones on the starting board, not as moves', () => {
    const result = loadGameRecord('(;FF[4]GM[1]SZ[9]HA[2]AB[gg][cg];W[gc];B[cc])');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.initialBoard[6][6]).toBe('black');
    expect(result.initialBoard[6][2]).toBe('black');
    expect(result.moves).toHaveLength(2);
    expect(result.moves[0].player).toBe('white');
    expect(result.moves[1].player).toBe('black');
  });

  it('understands both spellings of a pass', () => {
    const result = loadGameRecord('(;FF[4]SZ[9];B[];W[tt];B[cc])');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.moves.map((move) => move.kind)).toEqual(['pass', 'pass', 'stone']);
  });

  it('rejects board sizes the app cannot play', () => {
    const result = loadGameRecord('(;FF[4]GM[1]SZ[15];B[pd])');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('15');
  });

  it('rejects rectangular boards', () => {
    const result = loadGameRecord('(;FF[4]GM[1]SZ[13:9];B[pd])');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('矩形');
  });

  it('reports a parse failure instead of throwing', () => {
    const result = loadGameRecord(';B[aa]');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('解析失败');
  });

  it('skips illegal moves and says so', () => {
    const result = loadGameRecord('(;FF[4]SZ[9];B[aa];W[aa])');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.moves).toHaveLength(1);
    expect(result.warnings.some((message) => message.includes('非法'))).toBe(true);
  });

  it('warns about variations, extra games and mid-game edits it cannot import', () => {
    const withVariation = loadGameRecord('(;FF[4]SZ[9];B[aa](;W[bb])(;W[cc]))');
    expect(withVariation.ok && withVariation.warnings.some((m) => m.includes('变化图'))).toBe(true);

    const twoGames = loadGameRecord('(;FF[4]SZ[9];B[aa])(;FF[4]SZ[9];B[bb])');
    expect(twoGames.ok && twoGames.warnings.some((m) => m.includes('多局'))).toBe(true);

    const edited = loadGameRecord('(;FF[4]SZ[9];B[aa];AB[bb];W[cc])');
    expect(edited.ok && edited.warnings.some((m) => m.includes('中途摆子'))).toBe(true);
  });
});

describe('exporting a record', () => {
  it('round-trips back through import unchanged', () => {
    const moves = playMoves(9, [
      { x: 2, y: 2 },
      { x: 6, y: 2 },
      { x: 2, y: 6 },
      { x: 6, y: 6 },
    ]);
    const sgf = buildSgf({ boardSize: 9, moves });
    const result = loadGameRecord(sgf);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings).toEqual([]);
    expect(result.moves).toHaveLength(moves.length);
    for (let index = 0; index < moves.length; index += 1) {
      expect(result.moves[index].player).toBe(moves[index].player);
      expect(result.moves[index].point).toEqual(moves[index].point);
    }
  });

  it('keeps setup stones out of move nodes and compresses them', () => {
    const sgf = buildSgf({
      boardSize: 9,
      moves: [],
      setup: { '0,0': 'black', '1,0': 'black' },
      handicap: 2,
    });
    const { collection } = parseSgf(sgf);
    const root = collection[0].sequence[0];
    // SGF forbids mixing setup and move properties in one node, and HA must
    // sit alongside AB, so everything has to land in the root node.
    expect(getValues(root, 'AB')).toEqual(['aa:ba']);
    expect(getFirstValue(root, 'HA')).toBe('2');
    expect(collection[0].sequence).toHaveLength(1);
  });

  it('writes passes as empty moves and skips resignations', () => {
    const stone = playMoves(9, [{ x: 4, y: 4 }]);
    const sgf = buildSgf({
      boardSize: 9,
      moves: [
        ...stone,
        { kind: 'pass', player: 'white', captures: [], boardAfter: stone[0].boardAfter },
        { kind: 'resign', player: 'black', captures: [], boardAfter: stone[0].boardAfter },
      ],
      result: 'W+R',
    });
    const { collection } = parseSgf(sgf);
    const sequence = collection[0].sequence;
    expect(sequence).toHaveLength(3);
    expect(getFirstValue(sequence[2], 'W')).toBe('');
    expect(getFirstValue(sequence[0], 'RE')).toBe('W+R');
  });
});
