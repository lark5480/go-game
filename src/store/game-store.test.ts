import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGameStore } from './game-store';
import { createBoard } from '@/engine/board';
import { hashBoard } from '@/engine/rules';

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

describe('undo safety', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    useGameStore.getState().returnToMenu();
  });

  it('undo during AI thinking clears aiThinking and keeps the game playable', async () => {
    // Regression: the undo button used to stay clickable inside the AI think
    // window; the superseded search then left aiThinking stuck on true and
    // every action was rejected for the rest of the game.
    useGameStore.getState().startGame({ mode: 'ai', boardSize: 9, humanPlayer: 'black', difficulty: 'easy' });
    expect(useGameStore.getState().playStone({ x: 4, y: 4 })).toBe(true);
    expect(useGameStore.getState().aiThinking).toBe(true); // inside the think window
    useGameStore.getState().undo();
    expect(useGameStore.getState().aiThinking).toBe(false);
    await vi.advanceTimersByTimeAsync(500); // flush the superseded search timer
    expect(useGameStore.getState().aiThinking).toBe(false);
    expect(useGameStore.getState().playStone({ x: 2, y: 2 })).toBe(true);
  });

  it('falls back to easy AI when the Worker cannot be constructed', async () => {
    // Regression: `new Worker` throws e.g. under a CSP without worker-src;
    // the rejection used to escape chooseAiMove and wedge aiThinking on true.
    const original = globalThis.Worker;
    class BrokenWorker {
      constructor() {
        throw new Error('blocked by policy');
      }
    }
    (globalThis as { Worker?: unknown }).Worker = BrokenWorker;
    try {
      useGameStore.getState().startGame({ mode: 'ai', boardSize: 9, humanPlayer: 'white', difficulty: 'medium' });
      await vi.advanceTimersByTimeAsync(500);
      const state = useGameStore.getState();
      expect(state.phase).toBe('playing');
      expect(state.aiThinking).toBe(false);
      expect(state.moves.length).toBe(1); // the easy AI still answered
      expect(state.moves[0].player).toBe('black');
      expect(state.playStone({ x: 3, y: 3 })).toBe(true);
    } finally {
      (globalThis as { Worker?: unknown }).Worker = original;
    }
  });

  it('undo in AI mode reverts the AI reply and restores the empty-board history', async () => {
    useGameStore.getState().startGame({ mode: 'ai', boardSize: 9, humanPlayer: 'black', difficulty: 'easy' });
    expect(useGameStore.getState().playStone({ x: 4, y: 4 })).toBe(true);
    await vi.advanceTimersByTimeAsync(250);
    expect(useGameStore.getState().moves.length).toBe(2);
    useGameStore.getState().undo();
    const state = useGameStore.getState();
    expect(state.moves.length).toBe(0);
    expect(state.currentPlayer).toBe('black');
    expect(state.aiThinking).toBe(false);
    expect(state.positionHashes.size).toBe(1); // only the empty board again
  });

  it('undo in pvp mode reverts a full turn and restores captures', () => {
    useGameStore.getState().startGame({ mode: 'pvp', boardSize: 9, humanPlayer: 'black' });
    expect(useGameStore.getState().playStone({ x: 1, y: 0 })).toBe(true); // black
    expect(useGameStore.getState().playStone({ x: 0, y: 0 })).toBe(true); // white
    expect(useGameStore.getState().playStone({ x: 0, y: 1 })).toBe(true); // black captures
    expect(useGameStore.getState().capturedByBlack).toBe(1);
    useGameStore.getState().undo();
    const state = useGameStore.getState();
    expect(state.moves.length).toBe(1);
    expect(state.capturedByBlack).toBe(0);
    expect(state.capturedByWhite).toBe(0);
    // The white stone has not been played yet in the restored history.
    expect(state.board[0][0]).toBe('empty');
    expect(state.board[0][1]).toBe('black');
    expect(state.currentPlayer).toBe('white');
    expect(state.positionHashes.size).toBe(2);
    expect(state.lastMove).toEqual({ x: 1, y: 0 });
  });

  it('undo restores the trailing-pass counter', () => {
    useGameStore.getState().startGame({ mode: 'pvp', boardSize: 9, humanPlayer: 'black' });
    useGameStore.getState().passTurn(); // black passes
    expect(useGameStore.getState().playStone({ x: 2, y: 2 })).toBe(true); // white
    useGameStore.getState().undo();
    const state = useGameStore.getState();
    expect(state.moves.length).toBe(1); // the pass remains
    expect(state.consecutivePasses).toBe(1);
    expect(state.currentPlayer).toBe('white');
  });

  it('undo with no moves is a no-op', () => {
    useGameStore.getState().startGame({ mode: 'pvp', boardSize: 9, humanPlayer: 'black' });
    useGameStore.getState().undo();
    const state = useGameStore.getState();
    expect(state.moves.length).toBe(0);
    expect(state.phase).toBe('playing');
  });
});

describe('positional superko', () => {
  afterEach(() => {
    useGameStore.getState().returnToMenu();
  });

  it('rejects a move recreating any earlier position', () => {
    useGameStore.getState().startGame({ mode: 'pvp', boardSize: 9, humanPlayer: 'black' });
    // Single-stone ko: white (4,4) has its last liberty at (4,5); recapturing
    // at (4,4) would recreate the position before the capture.
    const koBoard = createBoard(9);
    koBoard[4][4] = 'white'; // the ko stone
    koBoard[4][3] = 'black';
    koBoard[4][5] = 'black';
    koBoard[3][4] = 'black';
    koBoard[5][3] = 'white';
    koBoard[5][5] = 'white';
    koBoard[6][4] = 'white';
    useGameStore.setState({
      board: koBoard,
      positionHashes: new Set([hashBoard(createBoard(9)), hashBoard(koBoard)]),
      currentPlayer: 'black',
      moves: [],
    });
    // Black takes the ko.
    expect(useGameStore.getState().playStone({ x: 4, y: 5 })).toBe(true);
    expect(useGameStore.getState().board[4][4]).toBe('empty');
    // The immediate recapture would recreate the pre-capture position.
    expect(useGameStore.getState().playStone({ x: 4, y: 4 })).toBe(false);
  });
});

describe('game configuration', () => {
  afterEach(() => {
    useGameStore.getState().returnToMenu();
  });

  it('remembers the last config so a replay keeps it', () => {
    // Regression: the ResultModal's replay used to call startGame({}) which
    // silently reset every game to 9x9 vs easy AI.
    useGameStore.getState().startGame({ mode: 'pvp', boardSize: 19, humanPlayer: 'white', difficulty: 'easy' });
    expect(useGameStore.getState().lastConfig).toEqual({
      mode: 'pvp',
      boardSize: 19,
      humanPlayer: 'white',
      difficulty: 'easy',
    });
    useGameStore.getState().startGame(useGameStore.getState().lastConfig);
    expect(useGameStore.getState().boardSize).toBe(19);
    expect(useGameStore.getState().mode).toBe('pvp');
    expect(useGameStore.getState().humanPlayer).toBe('white');
  });

  it('two consecutive human passes end the game in scoring', () => {
    useGameStore.getState().startGame({ mode: 'pvp', boardSize: 9, humanPlayer: 'black' });
    useGameStore.getState().passTurn();
    useGameStore.getState().passTurn();
    const state = useGameStore.getState();
    expect(state.phase).toBe('scoring');
    expect(state.consecutivePasses).toBe(2);
    expect(state.moves.filter((move) => move.kind === 'pass').length).toBe(2);
  });
});
