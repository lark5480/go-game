import { useCallback, useEffect, useRef, useState } from 'react';
import { useGameStore } from '@/store/game-store';
import { useSound } from '@/hooks/use-sound';
import type { GameMove } from '@/engine/types';

const WOOD_LIGHT = '#e8bd76';
const WOOD_DARK = '#d5a35b';

/** Cached background layer (wood, grid, star points) — redrawn only when the
 *  board size or rendered pixel size actually changes, never per interaction. */
let staticLayer: { key: string; canvas: HTMLCanvasElement } | null = null;

const getStaticLayer = (
  size: number,
  widthCss: number,
  dpr: number,
): HTMLCanvasElement | null => {
  const pixelWidth = Math.round(widthCss * dpr);
  const key = `${size}:${pixelWidth}`;
  if (staticLayer && staticLayer.key === key) return staticLayer.canvas;

  const canvas = document.createElement('canvas');
  canvas.width = pixelWidth;
  canvas.height = pixelWidth;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.setTransform(dpr, 0, 0, dpr, 0, 0);

  const margin = widthCss / (size + 1);
  const gap = (widthCss - margin * 2) / (size - 1);

  const wood = context.createLinearGradient(0, 0, widthCss, widthCss);
  wood.addColorStop(0, WOOD_LIGHT);
  wood.addColorStop(1, WOOD_DARK);
  context.fillStyle = wood;
  context.fillRect(0, 0, widthCss, widthCss);

  context.strokeStyle = '#6b4423';
  context.lineWidth = 1;
  for (let index = 0; index < size; index += 1) {
    const coordinate = margin + index * gap;
    context.beginPath();
    context.moveTo(margin, coordinate);
    context.lineTo(widthCss - margin, coordinate);
    context.stroke();
    context.beginPath();
    context.moveTo(coordinate, margin);
    context.lineTo(coordinate, widthCss - margin);
    context.stroke();
  }

  for (const star of getStarPoints(size)) {
    context.fillStyle = '#6b4423';
    context.beginPath();
    context.arc(margin + star.x * gap, margin + star.y * gap, gap * .08, 0, Math.PI * 2);
    context.fill();
  }

  staticLayer = { key, canvas };
  return canvas;
};

export const GoBoard = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoverPoint, setHoverPoint] = useState<{ x: number; y: number } | null>(null);
  const playStoneAction = useGameStore((s) => s.playStone);
  const board = useGameStore((s) => s.board);
  const phase = useGameStore((s) => s.phase);
  const currentPlayer = useGameStore((s) => s.currentPlayer);
  const lastMove = useGameStore((s) => s.lastMove);
  const deadStones = useGameStore((s) => s.deadStones);
  const score = useGameStore((s) => s.score);
  const aiThinking = useGameStore((s) => s.aiThinking);
  const toggleDeadStone = useGameStore((s) => s.toggleDeadStone);
  const sound = useSound();

  // Play sounds once per newly created move record, not on every re-render.
  const announcedMoveRef = useRef<GameMove | undefined>(undefined);
  const moves = useGameStore((s) => s.moves);
  useEffect(() => {
    const latest = moves[moves.length - 1];
    if (!latest || latest === announcedMoveRef.current) return;
    announcedMoveRef.current = latest;
    if (latest.kind === 'stone') sound.playStone();
    if (latest.captures.length > 0) sound.capture();
  }, [moves, sound]);

  useEffect(() => {
    const draw = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0) return;
      if (canvas.width !== Math.round(rect.width * dpr)) {
        canvas.width = Math.round(rect.width * dpr);
        canvas.height = Math.round(rect.width * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const width = rect.width;
      const margin = width / (board.length + 1);
      const gap = (width - margin * 2) / (board.length - 1);

      const layer = getStaticLayer(board.length, width, dpr);
      if (layer) ctx.drawImage(layer, 0, 0, width, width);

      if (score && (phase === 'scoring' || phase === 'finished')) {
        for (let y = 0; y < board.length; y += 1) {
          for (let x = 0; x < board.length; x += 1) {
            const owner = score.ownership[y][x];
            if (owner === 'empty') continue;
            ctx.fillStyle = owner === 'black' ? 'rgba(17,24,39,.28)' : 'rgba(255,255,255,.38)';
            ctx.fillRect(margin + x * gap - gap / 2, margin + y * gap - gap / 2, gap, gap);
          }
        }
      }

      // Two gradients reused for every stone via translate instead of one
      // freshly-created radial gradient per stone per frame.
      const blackGradient = ctx.createRadialGradient(-gap * .15, -gap * .17, gap * .06, 0, 0, gap * .48);
      blackGradient.addColorStop(0, '#666');
      blackGradient.addColorStop(1, '#111');
      const whiteGradient = ctx.createRadialGradient(-gap * .15, -gap * .17, gap * .06, 0, 0, gap * .48);
      whiteGradient.addColorStop(0, '#fff');
      whiteGradient.addColorStop(1, '#ccc');

      for (let y = 0; y < board.length; y += 1) {
        for (let x = 0; x < board.length; x += 1) {
          const cell = board[y][x];
          if (cell === 'empty') continue;
          const dead = deadStones[`${x},${y}`];
          ctx.save();
          ctx.translate(margin + x * gap, margin + y * gap);
          ctx.globalAlpha = dead ? .32 : 1;
          ctx.beginPath();
          ctx.arc(0, 0, gap * .47, 0, Math.PI * 2);
          ctx.fillStyle = cell === 'black' ? blackGradient : whiteGradient;
          ctx.fill();
          ctx.restore();
        }
      }

      if (lastMove && board[lastMove.y]?.[lastMove.x] !== 'empty') {
        const cx = margin + lastMove.x * gap;
        const cy = margin + lastMove.y * gap;
        const value = board[lastMove.y][lastMove.x];
        ctx.strokeStyle = value === 'black' ? '#fff' : '#000';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cx, cy, gap * .14, 0, Math.PI * 2); ctx.stroke();
      }

      if (phase === 'playing' && hoverPoint && !aiThinking &&
          hoverPoint.x >= 0 && hoverPoint.y >= 0 &&
          hoverPoint.x < board.length && hoverPoint.y < board.length &&
          board[hoverPoint.y][hoverPoint.x] === 'empty') {
        ctx.globalAlpha = .42;
        ctx.fillStyle = currentPlayer === 'black' ? '#111' : '#fff';
        ctx.beginPath();
        ctx.arc(margin + hoverPoint.x * gap, margin + hoverPoint.y * gap, gap * .46, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    };
    draw();
    const observer = new ResizeObserver(() => draw());
    if (canvasRef.current) observer.observe(canvasRef.current);
    return () => observer.disconnect();
  }, [board, phase, currentPlayer, lastMove, hoverPoint, aiThinking, deadStones, score]);

  const pointFromEvent = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const size = rect.width / (board.length + 1);
    const gapValue = (rect.width - size * 2) / Math.max(1, board.length - 1);
    return {
      x: Math.round(((event.clientX - rect.left) - size) / gapValue),
      y: Math.round(((event.clientY - rect.top) - size) / gapValue),
    };
  }, [board]);

  return (
    <canvas
      ref={canvasRef}
      className={`aspect-square w-full max-w-[min(78vh,720px)] rounded-xl shadow-2xl ${aiThinking ? 'cursor-wait' : 'cursor-pointer'}`}
      onClick={(event) => {
        const point = pointFromEvent(event);
        if (point.x >= 0 && point.y >= 0 && point.x < board.length && point.y < board.length) {
          if (phase === 'playing') playStoneAction(point);
          else if (phase === 'scoring') toggleDeadStone(point);
        }
      }}
      onMouseMove={(event) => {
        const point = pointFromEvent(event);
        // Same intersection -> keep the old reference so React bails out and
        // no redraw happens while the pointer wanders within one cell.
        setHoverPoint((previous) =>
          previous && previous.x === point.x && previous.y === point.y ? previous : point,
        );
      }}
      onMouseLeave={() => setHoverPoint((previous) => (previous ? null : previous))}
    />
  );
};

function getStarPoints(size: number): Array<{ x: number; y: number }> {
  if (size === 9) return [2,4,6].flatMap(x => [2,4,6].map(y => ({x,y})));
  if (size === 13) return [{x:3,y:3},{x:9,y:3},{x:3,y:9},{x:9,y:9},{x:6,y:6}];
  if (size === 19) {
    const positions = [3,9,15];
    return positions.flatMap(x => positions.map(y => ({x,y})));
  }
  return [];
}
