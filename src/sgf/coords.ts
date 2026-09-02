import type { Point } from '@/engine/types';

/**
 * FF[4] Go point alphabet.
 *
 * `a` is the first column/row and `z` the 26th; boards up to 52x52 continue with
 * uppercase letters, i.e. `A`=27 ... `Z`=52. Smaller boards use the upper left subset,
 * so a 13x13 board only uses `a`-`m`.
 *
 * @see https://www.red-bean.com/sgf/go.html
 */
export const SGF_ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Largest board SGF can address (52x52 for Go). */
export const MAX_BOARD_SIZE = SGF_ALPHABET.length;

/** Default Go board size used when `SZ` is missing. */
export const DEFAULT_BOARD_SIZE = 19;

const charIndex = new Map<string, number>();
for (let index = 0; index < SGF_ALPHABET.length; index += 1) {
  charIndex.set(SGF_ALPHABET[index], index);
}

export type Warn = (message: string) => void;

const keyOf = (point: Point): string => `${point.x},${point.y}`;

/** Encodes a board coordinate as its two letter SGF point. */
export const pointToSgf = (point: Point): string => {
  if (
    point.x < 0 ||
    point.y < 0 ||
    point.x >= MAX_BOARD_SIZE ||
    point.y >= MAX_BOARD_SIZE
  ) {
    throw new Error(
      `Point (${point.x},${point.y}) exceeds the SGF coordinate range (max ${MAX_BOARD_SIZE})`,
    );
  }
  return SGF_ALPHABET[point.x] + SGF_ALPHABET[point.y];
};

/** Decodes a two letter SGF point, or `null` when the value is not a well formed point. */
export const sgfToPoint = (value: string): Point | null => {
  if (value.length !== 2) return null;
  const x = charIndex.get(value[0]);
  const y = charIndex.get(value[1]);
  if (x === undefined || y === undefined) return null;
  return { x, y };
};

/**
 * A pass is written as `[]`, or as `[tt]` on boards up to 19x19.
 *
 * `tt` is only a pass while it is off board: `t` is the 20th letter, so from 20x20 up
 * `tt` designates the real point (19,19) and must be played as a move.
 */
export const isPassValue = (value: string, size: number): boolean =>
  value === '' || (value === 'tt' && size <= 19);

/**
 * Expands compressed rectangles (`ul:lr`) into single points.
 *
 * Rectangles are inclusive on both corners and may appear in either order (FF[4]
 * requires upper left first, but real files get it wrong, so we repair it). A 1x1
 * rectangle is illegal per spec: it is read as a single point with a warning.
 */
export const expandPointValues = (values: string[], size: number, warn?: Warn): Point[] => {
  const points: Point[] = [];
  const seen = new Set<string>();

  const push = (point: Point): void => {
    const key = keyOf(point);
    if (point.x >= size || point.y >= size) {
      warn?.(`Point ${pointToSgf(point)} lies outside the ${size}x${size} board`);
      return;
    }
    if (seen.has(key)) {
      warn?.(`Point ${pointToSgf(point)} appears more than once in a point list`);
      return;
    }
    seen.add(key);
    points.push(point);
  };

  for (const value of values) {
    const colon = value.indexOf(':');
    if (colon < 0) {
      const point = sgfToPoint(value);
      if (!point) {
        warn?.(`Not a valid point: "${value}"`);
        continue;
      }
      push(point);
      continue;
    }
    const upperLeft = sgfToPoint(value.slice(0, colon));
    const lowerRight = sgfToPoint(value.slice(colon + 1));
    if (!upperLeft || !lowerRight) {
      warn?.(`Not a valid rectangle: "${value}"`);
      continue;
    }
    const x0 = Math.min(upperLeft.x, lowerRight.x);
    const x1 = Math.max(upperLeft.x, lowerRight.x);
    const y0 = Math.min(upperLeft.y, lowerRight.y);
    const y1 = Math.max(upperLeft.y, lowerRight.y);
    if (x0 === x1 && y0 === y1) {
      warn?.(`1x1 rectangle "${value}" is illegal; read as the single point it names`);
    }
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) push({ x, y });
    }
  }

  return points;
};

/** Greedily re-compresses points into single points and rectangles. */
export const compressPoints = (points: Point[]): string[] => {
  const sorted = [...points].sort((a, b) => a.y - b.y || a.x - b.x);
  const remaining = new Set(sorted.map(keyOf));
  const values: string[] = [];

  for (const origin of sorted) {
    if (!remaining.has(keyOf(origin))) continue;

    let right = origin.x;
    while (remaining.has(`${right + 1},${origin.y}`)) right += 1;

    let bottom = origin.y;
    for (;;) {
      const nextRow = bottom + 1;
      let complete = true;
      for (let x = origin.x; x <= right; x += 1) {
        if (!remaining.has(`${x},${nextRow}`)) {
          complete = false;
          break;
        }
      }
      if (!complete) break;
      bottom = nextRow;
    }

    for (let y = origin.y; y <= bottom; y += 1) {
      for (let x = origin.x; x <= right; x += 1) remaining.delete(`${x},${y}`);
    }

    const upperLeft = pointToSgf(origin);
    values.push(
      right === origin.x && bottom === origin.y
        ? upperLeft
        : `${upperLeft}:${pointToSgf({ x: right, y: bottom })}`,
    );
  }

  return values;
};

export interface BoardSize {
  width: number;
  height: number;
}

/**
 * Reads an `SZ` value.
 *
 * A single number means a square board; `columns:rows` means a rectangular one. Square
 * boards must not use the compose type, so `SZ[19:19]` is warned about even though its
 * meaning is unambiguous.
 */
export const parseBoardSize = (value: string, warn?: Warn): BoardSize => {
  const fallback: BoardSize = {
    width: DEFAULT_BOARD_SIZE,
    height: DEFAULT_BOARD_SIZE,
  };
  const colon = value.indexOf(':');
  if (colon < 0) {
    const size = Number(value);
    if (!Number.isInteger(size) || size < 1) {
      warn?.(`Invalid board size "${value}"; using ${DEFAULT_BOARD_SIZE}`);
      return fallback;
    }
    return { width: size, height: size };
  }

  const width = Number(value.slice(0, colon));
  const height = Number(value.slice(colon + 1));
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    warn?.(`Invalid board size "${value}"; using ${DEFAULT_BOARD_SIZE}`);
    return fallback;
  }
  if (width === height) {
    warn?.(`SZ[${value}] is illegal: a square board must not use the compose type`);
  }
  return { width, height };
};
