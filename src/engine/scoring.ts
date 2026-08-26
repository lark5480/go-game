import type { Board, Player, ScoreDetail, StoneMap } from './types';

export const KOMI = 7.5;

const neighbors = (x: number, y: number): Array<[number, number]> => [
  [x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1],
];

export const scoreGame = (board: Board, deadStones: StoneMap = {}): ScoreDetail => {
  const size = board.length;
  const effective: Board = board.map((row) => row.map(() => 'empty'));
  let blackPrisoners = 0;
  let whitePrisoners = 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const player = board[y][x];
      if (player === 'empty') continue;
      const key = `${x},${y}`;
      const isDead = deadStones[key] === player;
      if (!isDead) {
        effective[y][x] = player;
      } else if (player === 'black') blackPrisoners += 1;
      else whitePrisoners += 1;
    }
  }
  const ownership: Board = effective.map((row) => [...row]);
  const seen = new Set<string>();
  let blackTerritory = 0;
  let whiteTerritory = 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (effective[y][x] !== 'empty' || seen.has(`${x},${y}`)) continue;
      const stack: Array<[number, number]> = [[x, y]];
      const region: Array<[number, number]> = [];
      const borders = new Set<Player>();
      seen.add(`${x},${y}`);
      while (stack.length > 0) {
        const [cx, cy] = stack.pop()!;
        region.push([cx, cy]);
        for (const [nx, ny] of neighbors(cx, cy)) {
          if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
          const value = effective[ny][nx];
          const key = `${nx},${ny}`;
          if (value === 'black' || value === 'white') borders.add(value);
          else if (!seen.has(key)) { seen.add(key); stack.push([nx, ny]); }
        }
      }
      if (borders.size === 1) {
        const owner = [...borders][0];
        if (owner === 'black') blackTerritory += region.length;
        else whiteTerritory += region.length;
        for (const [px, py] of region) ownership[py][px] = owner;
      }
    }
  }
  let blackStones = 0;
  let whiteStones = 0;
  for (const row of effective) for (const cell of row) {
    if (cell === 'black') blackStones += 1;
    else if (cell === 'white') whiteStones += 1;
  }
  const blackScore = blackStones + blackTerritory + whitePrisoners;
  const whiteScore = whiteStones + whiteTerritory + blackPrisoners + KOMI;
  return {
    ownership,
    blackStones,
    whiteStones,
    blackTerritory,
    whiteTerritory,
    blackPrisoners,
    whitePrisoners,
    blackScore,
    whiteScore,
    winner: blackScore > whiteScore ? 'black' : 'white',
    margin: Math.abs(blackScore - whiteScore),
  };
};
