/**
 * SGF (Smart Game Format) FF[4] data model.
 *
 * Property values are stored **raw**: SGF escape sequences are kept verbatim. That keeps
 * `parse -> serialize` round-trips byte-exact and makes double escaping impossible. Use
 * `escapeTextValue` when building a value from a plain string, and `unescapeText` /
 * `unescapeSimpleText` when reading one.
 *
 * @see https://www.red-bean.com/sgf/sgf4.html
 * @see https://www.red-bean.com/sgf/go.html
 */

/** A property identifier together with its raw (still escaped) values. */
export interface SgfProperty {
  id: string;
  values: string[];
}

/** `;` followed by zero or more properties. */
export interface SgfNode {
  properties: SgfProperty[];
}

/** A node sequence plus its variations. */
export interface SgfGameTree {
  sequence: SgfNode[];
  children: SgfGameTree[];
}

/** A file is a collection of one or more game trees. */
export type SgfCollection = SgfGameTree[];

export interface SgfParseResult {
  collection: SgfCollection;
  /** Spec violations that were repaired rather than fatal. */
  warnings: string[];
}

export class SgfParseError extends Error {}

/** Setup properties describe a position; they must not share a node with move properties. */
export const SETUP_PROPERTIES = new Set(['AB', 'AE', 'AW', 'PL']);

/** Move properties describe a move; they must not share a node with setup properties. */
export const MOVE_PROPERTIES = new Set([
  'B',
  'W',
  'KO',
  'MN',
  'BM',
  'DO',
  'IT',
  'TE',
  'BL',
  'OB',
  'OW',
  'WL',
]);

/** Root properties are only legal in the first node of a top level game tree. */
export const ROOT_PROPERTIES = new Set(['AP', 'CA', 'FF', 'GM', 'ST', 'SZ']);

/** Properties whose value type is `simpletext` (no line breaks). */
export const SIMPLE_TEXT_PROPERTIES = new Set([
  'AN',
  'BR',
  'BT',
  'CP',
  'DT',
  'EV',
  'GN',
  'N',
  'ON',
  'OT',
  'PB',
  'PC',
  'PW',
  'RE',
  'RO',
  'RU',
  'SO',
  'US',
  'WR',
  'WT',
]);

/** Properties whose value type is `text` (line breaks preserved). */
export const TEXT_PROPERTIES = new Set(['C', 'GC']);

/** Properties using the compose type, where `:` must be escaped. */
export const COMPOSE_PROPERTIES = new Set(['AP', 'AR', 'FG', 'LB', 'LN', 'SZ']);

export const getProperty = (node: SgfNode, id: string): SgfProperty | undefined =>
  node.properties.find((property) => property.id === id);

export const getValues = (node: SgfNode, id: string): string[] =>
  getProperty(node, id)?.values ?? [];

export const getFirstValue = (node: SgfNode, id: string): string | undefined =>
  getValues(node, id)[0];
