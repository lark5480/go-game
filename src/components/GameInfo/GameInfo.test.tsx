// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { GameInfo } from './GameInfo';
import { ResultModal } from '@/components/Modal/ResultModal';
import { useGameStore } from '@/store/game-store';
import { scoreGame } from '@/engine/scoring';
import type { Board } from '@/engine/types';

afterEach(() => {
  cleanup();
  useGameStore.getState().returnToMenu();
});

const setStateForPlay = () => {
  const board: Board = Array.from({ length: 9 }, () => Array(9).fill('empty'));
  board[4][4] = 'black';
  board[2][2] = 'white';
  useGameStore.setState({
    mode: 'ai',
    phase: 'playing',
    currentPlayer: 'black',
    capturedByBlack: 52,
    capturedByWhite: 3,
    moves: [],
    aiThinking: false,
    board,
  });
};

describe('GameInfo', () => {
  it('explains the victory rule next to the capture counters', () => {
    setStateForPlay();
    const { container } = render(<GameInfo />);
    const text = container.textContent ?? '';
    expect(text).toContain('52 提子');
    expect(text).toContain('终局数子定胜负');
    expect(text).toContain('提子多只是过程战果');
  });

  it('shows a live rough estimate while playing', () => {
    setStateForPlay();
    const { container } = render(<GameInfo />);
    const text = container.textContent ?? '';
    expect(text).toContain('形势粗估');
    // estimate must reflect the actual engine scoring of the same board
    const estimate = scoreGame(useGameStore.getState().board);
    expect(text).toContain(`黑 ${estimate.blackScore.toFixed(1)}`);
  });

  it('hides the estimate outside of play', () => {
    setStateForPlay();
    useGameStore.setState({ phase: 'scoring' });
    const { container } = render(<GameInfo />);
    expect(container.textContent ?? '').not.toContain('形势粗估');
  });
});

describe('ResultModal', () => {
  it('announces the winner with the full score breakdown', () => {
    const board: Board = Array.from({ length: 9 }, () => Array(9).fill('black'));
    const score = scoreGame(board); // all-black board: black wins by a mile
    useGameStore.setState({ phase: 'finished', resigner: undefined, score });
    const { container } = render(<ResultModal />);
    const text = container.textContent ?? '';
    expect(text).toContain('黑方胜');
    expect(text).toContain(`黑方胜 ${score.margin.toFixed(1)} 分`);
    expect(text).toContain(`存子 ${score.blackStones}`);
    expect(text).toContain('贴 7.5');
  });

  it('reports resignation without a score', () => {
    useGameStore.setState({ phase: 'finished', resigner: 'white', score: undefined });
    const { container } = render(<ResultModal />);
    const text = container.textContent ?? '';
    expect(text).toContain('黑方胜');
    expect(text).toContain('白方认输');
  });
});
