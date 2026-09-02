// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Controls } from './Controls';
import { useGameStore } from '@/store/game-store';
import type { Board, GameMove } from '@/engine/types';

afterEach(() => {
  cleanup();
  useGameStore.getState().returnToMenu();
});

const emptyBoard: Board = Array.from({ length: 9 }, () => Array(9).fill('empty'));
const humanMove: GameMove = {
  kind: 'stone',
  player: 'black',
  point: { x: 4, y: 4 },
  captures: [],
  boardAfter: emptyBoard,
};

const buttonByName = (name: string): HTMLButtonElement =>
  screen.getByRole('button', { name }) as HTMLButtonElement;

describe('Controls disable matrix', () => {
  it('disables every action including undo while the AI is thinking', () => {
    // Regression: undo used to stay clickable mid-think, orphaning aiThinking
    // and soft-locking the game.
    useGameStore.setState({ phase: 'playing', aiThinking: true, moves: [humanMove] });
    render(<Controls />);
    for (const name of ['Pass', '悔棋', '认输', '进入数子']) {
      expect(buttonByName(name).disabled).toBe(true);
    }
  });

  it('enables undo and pass once the human may act', () => {
    useGameStore.setState({ phase: 'playing', aiThinking: false, moves: [humanMove] });
    render(<Controls />);
    expect(buttonByName('悔棋').disabled).toBe(false);
    expect(buttonByName('Pass').disabled).toBe(false);
    expect(buttonByName('认输').disabled).toBe(false);
  });

  it('disables undo on an empty move list', () => {
    useGameStore.setState({ phase: 'playing', aiThinking: false, moves: [] });
    render(<Controls />);
    expect(buttonByName('悔棋').disabled).toBe(true);
  });
});
