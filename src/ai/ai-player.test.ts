import { describe, expect, it } from 'vitest';
import { chooseAiMove } from './ai-player';
import { legalMoveResult } from '@/engine/rules';
import type { Board } from '@/engine/types';

const board: Board = Array.from({ length: 5 }, () => Array(5).fill('empty'));
board[0][1] = 'white';

describe('AI players', () => {
  it('easy AI plays only legal moves', async () => {
    const point = await chooseAiMove(board, 'black', 'easy');
    expect(point).not.toBeNull();
    expect(legalMoveResult(board, 'black', point!)).not.toBeNull();
  });

  it('medium AI returns within its thinking budget and legally', async () => {
    const startedAt = performance.now();
    const point = await chooseAiMove(board, 'black', 'medium');
    expect(performance.now() - startedAt).toBeLessThan(900);
    expect(point && legalMoveResult(board, 'black', point)).not.toBeNull();
  }, 1000);
});
