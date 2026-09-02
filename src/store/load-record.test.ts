import { afterEach, describe, expect, it } from 'vitest';
import { useGameStore } from './game-store';
import { loadGameRecord } from '@/sgf/record';

afterEach(() => {
  useGameStore.getState().returnToMenu();
});

const load = (sgf: string): void => {
  const result = loadGameRecord(sgf);
  if (!result.ok) throw new Error(result.error);
  useGameStore.getState().loadRecord(result);
};

describe('loading an imported record', () => {
  it('resumes an even game on the side that follows the last move', () => {
    load('(;FF[4]GM[1]SZ[9];B[aa];W[bb];B[cc])');
    const state = useGameStore.getState();
    expect(state.boardSize).toBe(9);
    expect(state.moves).toHaveLength(3);
    expect(state.currentPlayer).toBe('white');
  });

  it('switches the board over to the imported size', () => {
    load('(;FF[4]GM[1]SZ[13];B[jj])');
    const state = useGameStore.getState();
    expect(state.boardSize).toBe(13);
    expect(state.board).toHaveLength(13);
  });

  it('keeps handicap stones and hands the move to white when undone to the start', () => {
    load('(;FF[4]GM[1]SZ[9]AB[gg];W[gc];B[cc])');
    expect(useGameStore.getState().currentPlayer).toBe('white');
    useGameStore.getState().undo();
    const state = useGameStore.getState();
    expect(state.moves).toHaveLength(0);
    // Regression: the restored board used to be rebuilt from an empty board,
    // silently dropping every handicap stone.
    expect(state.board[6][6]).toBe('black');
    expect(state.currentPlayer).toBe('white');
  });
});
