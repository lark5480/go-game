import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGameStore } from './game-store';

// The store schedules AI turns through window.setTimeout; the default node
// test environment has no `window`, so alias it to globalThis (which vi's
// fake timers do patch).
(globalThis as { window?: unknown }).window = globalThis;

describe('AI turn flow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    useGameStore.getState().returnToMenu();
  });

  it('answers a human pass with a pass and enters scoring', async () => {
    useGameStore.getState().startGame({ mode: 'ai', boardSize: 9, humanPlayer: 'black', difficulty: 'easy' });
    expect(useGameStore.getState().phase).toBe('playing');

    useGameStore.getState().passTurn();
    expect(useGameStore.getState().consecutivePasses).toBe(1);
    expect(useGameStore.getState().currentPlayer).toBe('white');

    await vi.advanceTimersByTimeAsync(250);

    const state = useGameStore.getState();
    expect(state.phase).toBe('scoring');
    expect(state.moves.at(-1)?.kind).toBe('pass');
    expect(state.moves.at(-1)?.player).toBe('white');
    expect(state.aiThinking).toBe(false);
  });

  it('plays the opening move when the human is white', async () => {
    useGameStore.getState().startGame({ mode: 'ai', boardSize: 9, humanPlayer: 'white', difficulty: 'easy' });
    expect(useGameStore.getState().currentPlayer).toBe('black');

    await vi.advanceTimersByTimeAsync(250);

    const state = useGameStore.getState();
    expect(state.moves.length).toBe(1);
    expect(state.moves[0].player).toBe('black');
    expect(state.currentPlayer).toBe('white');
    expect(state.aiThinking).toBe(false);
  });

  it('AI passes instead of stalling when it has no legal move', async () => {
    useGameStore.getState().startGame({ mode: 'ai', boardSize: 9, humanPlayer: 'white', difficulty: 'easy' });

    // Replace the opening position with a fully-settled alternating board:
    // not a single point admits a legal move for either side.
    const size = 9;
    const board = Array.from({ length: size }, (_, y) =>
      Array.from({ length: size }, (_, x) => ((x + y) % 2 === 0 ? 'black' as const : 'white' as const)),
    );
    useGameStore.setState({ board, moves: [] });

    await vi.advanceTimersByTimeAsync(250);

    const state = useGameStore.getState();
    expect(state.aiThinking).toBe(false);
    expect(state.moves.length).toBe(1);
    expect(state.moves[0].kind).toBe('pass');
    expect(state.moves[0].player).toBe('black'); // the AI side passed
    expect(state.consecutivePasses).toBe(1);

    // Human (white) answers with a pass -> game reaches scoring.
    useGameStore.setState({ currentPlayer: 'white' });
    useGameStore.getState().passTurn();
    expect(useGameStore.getState().phase).toBe('scoring');
  });
});
