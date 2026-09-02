import { describe, expect, it } from 'vitest';
import {
  MAX_BOARD_SIZE,
  compressPoints,
  expandPointValues,
  isPassValue,
  parseBoardSize,
  pointToSgf,
  sgfToPoint,
} from './coords';
import { parseSgf, parseSgfBytes, unescapeSimpleText, unescapeText } from './parse';
import { escapeTextValue, serializeSgf } from './serialize';
import { SgfParseError, getFirstValue, getValues } from './types';
import type { SgfGameTree } from './types';
import type { Point } from '@/engine/types';

/** Named escapes keep the assertions below readable and unambiguous. */
const ESC = String.fromCharCode(92);
const LF = String.fromCharCode(10);
const CR = String.fromCharCode(13);

const shapeOf = (points: Point[]): string =>
  points
    .map((point) => `${point.x},${point.y}`)
    .sort()
    .join(' ');

const rootOf = (tree: SgfGameTree) => tree.sequence[0];

describe('point coordinates', () => {
  it('round-trips every coordinate SGF can address', () => {
    expect(MAX_BOARD_SIZE).toBe(52);
    for (let index = 0; index < MAX_BOARD_SIZE; index += 1) {
      expect(sgfToPoint(pointToSgf({ x: index, y: index }))).toEqual({ x: index, y: index });
    }
  });

  it('uses uppercase letters for rows and columns 27 to 52', () => {
    expect(pointToSgf({ x: 26, y: 26 })).toBe('AA');
    expect(pointToSgf({ x: 51, y: 51 })).toBe('ZZ');
    expect(sgfToPoint('AA')).toEqual({ x: 26, y: 26 });
    expect(sgfToPoint('Zz')).toEqual({ x: 51, y: 25 });
  });

  it('rejects malformed points', () => {
    expect(sgfToPoint('')).toBeNull();
    expect(sgfToPoint('a')).toBeNull();
    expect(sgfToPoint('abc')).toBeNull();
    expect(sgfToPoint('11')).toBeNull();
  });
});

describe('pass moves', () => {
  it('treats an empty value as a pass on any board size', () => {
    expect(isPassValue('', 9)).toBe(true);
    expect(isPassValue('', 19)).toBe(true);
    expect(isPassValue('', 52)).toBe(true);
  });

  it('treats tt as a pass only up to 19x19, where it falls off the board', () => {
    expect(isPassValue('tt', 9)).toBe(true);
    expect(isPassValue('tt', 19)).toBe(true);
    expect(isPassValue('tt', 20)).toBe(false);
    expect(sgfToPoint('tt')).toEqual({ x: 19, y: 19 });
  });
});

describe('compressed point lists', () => {
  it('expands a rectangle into every point it covers', () => {
    const points = expandPointValues(['aa:cc'], 19);
    expect(points).toHaveLength(9);
    expect(shapeOf(points)).toBe('0,0 0,1 0,2 1,0 1,1 1,2 2,0 2,1 2,2');
  });

  it('mixes single points with rectangles', () => {
    const points = expandPointValues(['aa:bb', 'dd'], 19);
    expect(points).toHaveLength(5);
    expect(points).toContainEqual({ x: 3, y: 3 });
  });

  it('repairs rectangles whose corners are swapped', () => {
    expect(shapeOf(expandPointValues(['cc:aa'], 19))).toBe(
      shapeOf(expandPointValues(['aa:cc'], 19)),
    );
  });

  it('reads a 1x1 rectangle as a single point and warns', () => {
    const warnings: string[] = [];
    const points = expandPointValues(['dd:dd'], 19, (message) => warnings.push(message));
    expect(points).toEqual([{ x: 3, y: 3 }]);
    expect(warnings.some((message) => message.includes('1x1'))).toBe(true);
  });

  it('warns about points outside the board', () => {
    const warnings: string[] = [];
    expect(expandPointValues(['tt'], 9, (message) => warnings.push(message))).toHaveLength(0);
    expect(warnings.some((message) => message.includes('outside'))).toBe(true);
  });

  it('warns about duplicated points', () => {
    const warnings: string[] = [];
    expect(expandPointValues(['aa', 'aa'], 19, (message) => warnings.push(message))).toHaveLength(1);
    expect(warnings.some((message) => message.includes('more than once'))).toBe(true);
  });
});

describe('point compression', () => {
  it('compresses a filled block into one rectangle', () => {
    const block: Point[] = [];
    for (let y = 0; y < 3; y += 1) for (let x = 0; x < 3; x += 1) block.push({ x, y });
    expect(compressPoints(block)).toEqual(['aa:cc']);
  });

  it('never emits 1x1 rectangles', () => {
    expect(compressPoints([{ x: 3, y: 3 }])).toEqual(['dd']);
  });

  it('round-trips an irregular shape', () => {
    const shape: Point[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 0, y: 2 },
      { x: 8, y: 8 },
    ];
    expect(shapeOf(expandPointValues(compressPoints(shape), 19))).toBe(shapeOf(shape));
  });
});

describe('board size', () => {
  it('reads a square board', () => {
    expect(parseBoardSize('19')).toEqual({ width: 19, height: 19 });
  });

  it('reads a rectangular board as columns:rows', () => {
    expect(parseBoardSize('13:9')).toEqual({ width: 13, height: 9 });
  });

  it('warns when a square board uses the compose type', () => {
    const warnings: string[] = [];
    expect(parseBoardSize('19:19', (message) => warnings.push(message))).toEqual({
      width: 19,
      height: 19,
    });
    expect(warnings.some((message) => message.includes('illegal'))).toBe(true);
  });
});

describe('parser', () => {
  it('reads root properties and the main line', () => {
    const { collection, warnings } = parseSgf('(;FF[4]GM[1]SZ[19]KM[7.5];B[pd];W[dp];B[pp])');
    expect(warnings).toEqual([]);
    expect(collection).toHaveLength(1);
    expect(collection[0].sequence).toHaveLength(4);
    expect(getFirstValue(rootOf(collection[0]), 'SZ')).toBe('19');
    expect(getFirstValue(collection[0].sequence[1], 'B')).toBe('pd');
  });

  it('preserves unknown and private properties', () => {
    const { collection } = parseSgf('(;FF[4]SZ[19]XX[private];B[dd]ZZ[])');
    expect(getFirstValue(rootOf(collection[0]), 'XX')).toBe('private');
    expect(getValues(collection[0].sequence[1], 'ZZ')).toEqual(['']);
  });

  it('warns when a node mixes setup and move properties', () => {
    const { warnings } = parseSgf('(;FF[4]SZ[19];AB[dd]B[pp])');
    expect(warnings.some((message) => message.includes('mixes setup and move'))).toBe(true);
  });

  it('warns about root properties outside the root node', () => {
    const { warnings } = parseSgf('(;FF[4]SZ[19];B[dd]SZ[13])');
    expect(warnings.some((message) => message.includes('outside a root node'))).toBe(true);
  });

  it('merges duplicated properties within a node and warns', () => {
    const { collection, warnings } = parseSgf('(;FF[4]SZ[19];C[one]C[two])');
    expect(getValues(collection[0].sequence[1], 'C')).toEqual(['one', 'two']);
    expect(warnings.some((message) => message.includes('more than once'))).toBe(true);
  });

  it('parses variations and multi-game collections', () => {
    const { collection } = parseSgf('(;SZ[19];B[dd](;W[pp])(;W[dp]))(;SZ[13];B[jj])');
    expect(collection).toHaveLength(2);
    expect(collection[0].children).toHaveLength(2);
    expect(getFirstValue(rootOf(collection[0].children[1]), 'W')).toBe('dp');
    expect(getFirstValue(rootOf(collection[1]), 'SZ')).toBe('13');
  });

  it('rejects malformed input', () => {
    expect(() => parseSgf(';B[dd]')).toThrow(SgfParseError);
    expect(() => parseSgf('(;B[dd]')).toThrow(SgfParseError);
    expect(() => parseSgf('(;B[dd)')).toThrow(SgfParseError);
  });
});

describe('text unescaping', () => {
  it('unescapes brackets and backslashes', () => {
    expect(unescapeText('a' + ESC + ']b')).toBe('a]b');
    expect(unescapeText('a' + ESC + ESC + 'b')).toBe('a' + ESC + 'b');
  });

  it('removes soft line breaks and keeps hard ones in text', () => {
    expect(unescapeText('won' + ESC + LF + 'derful')).toBe('wonderful');
    expect(unescapeText('one' + LF + 'two')).toBe('one' + LF + 'two');
    expect(unescapeText('one' + CR + LF + 'two')).toBe('one' + LF + 'two');
  });

  it('collapses line breaks to spaces in simpletext', () => {
    expect(unescapeSimpleText('one' + LF + 'two')).toBe('one two');
  });

  it('escapes only what SGF requires when writing', () => {
    expect(escapeTextValue('a]b')).toBe('a' + ESC + ']b');
    expect(escapeTextValue('a:b')).toBe('a:b');
    expect(escapeTextValue('a:b', { compose: true })).toBe('a' + ESC + ':b');
  });
});

describe('charset handling', () => {
  it('decodes text with the charset declared by CA', () => {
    const head = new TextEncoder().encode('(;FF[4]SZ[19]CA[ISO-8859-1]C[');
    const tail = new TextEncoder().encode('])');
    const bytes = new Uint8Array([...head, 0xe9, ...tail]);
    const { collection } = parseSgfBytes(bytes);
    expect(unescapeSimpleText(getFirstValue(rootOf(collection[0]), 'C') ?? '')).toBe('é');
  });

  it('falls back to UTF-8 when the declared charset is unknown', () => {
    const warnings: string[] = [];
    const bytes = new TextEncoder().encode('(;FF[4]SZ[19]CA[not-a-charset]C[hi])');
    const { collection } = parseSgfBytes(bytes, { onWarning: (message) => warnings.push(message) });
    expect(warnings.some((message) => message.includes('Unsupported charset'))).toBe(true);
    expect(getFirstValue(rootOf(collection[0]), 'C')).toBe('hi');
  });
});

describe('round-trip', () => {
  const sample =
    '(;FF[4]GM[1]SZ[19]KM[7.5]AP[go-game:0.1]XX[keep' +
    ESC +
    ']me]C[line one' +
    LF +
    'line two]' +
    LF +
    ';B[pd]C[won' +
    ESC +
    LF +
    'derful];W[];B[tt]N[last])';

  it('survives parse, serialize and parse again unchanged', () => {
    const first = parseSgf(sample);
    const second = parseSgf(serializeSgf(first.collection));
    expect(second.collection).toEqual(first.collection);
    expect(second.warnings).toEqual(first.warnings);
  });

  it('keeps escaped private properties intact', () => {
    const { collection } = parseSgf(serializeSgf(parseSgf(sample).collection));
    expect(getFirstValue(rootOf(collection[0]), 'XX')).toBe('keep' + ESC + ']me');
  });
});
