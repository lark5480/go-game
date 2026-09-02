import type { SgfCollection, SgfGameTree, SgfNode } from './types';

const BACKSLASH = String.fromCharCode(92);

const escapePattern = (compose: boolean): RegExp => (compose ? /[\\\]:]/g : /[\\\]]/g);

/**
 * Converts a plain string into a raw SGF value.
 *
 * `]` and `\` always have to be escaped; `:` only inside compose values such as
 * `LB[dd:tesuji]`, where it would otherwise be read as the separator.
 */
export const escapeTextValue = (text: string, options: { compose?: boolean } = {}): string =>
  text.replace(escapePattern(options.compose === true), (char) => BACKSLASH + char);

const serializeNode = (node: SgfNode): string =>
  ';' +
  node.properties
    .map((property) => property.id + property.values.map((value) => `[${value}]`).join(''))
    .join('');

const serializeTree = (tree: SgfGameTree): string => {
  const nodes = tree.sequence.map(serializeNode).join('\n');
  const children = tree.children.map(serializeTree).join('\n');
  return '(' + [nodes, children].filter((part) => part.length > 0).join('\n') + ')';
};

/**
 * Serializes a collection back to SGF text.
 *
 * Values are written verbatim, so a parsed tree round-trips exactly: unknown and private
 * properties survive untouched, which FF[4] requires and most re-writers lose.
 */
export const serializeSgf = (collection: SgfCollection): string =>
  collection.map(serializeTree).join('\n');
