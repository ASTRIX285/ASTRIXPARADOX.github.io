/**
 * The Daevanion board drawing, shared by the Ascent Plan route screen and the Daevanion page.
 * A node is a tile in a grid (the official site sends each node's row and column); the game's own node art
 * is drawn on it. What a tile means (taken, on the route, greyed) is set by the caller through `status`.
 */
import { esc } from './aetherium-ui.mjs';

/* The game's own node art, as the official AION 2 site uses it (NCSOFT CDN, never re-hosted). */
const NODE_ART = 'https://assets.playnccdn.com/static-aion2/characters/img/daevanion/';
const NODE_GRADE = { 'active-skill': 'legend', 'passive-skill': 'rare', unique: 'unique', stat: 'common' };
const START_ART = { Gladiator: 'gladiator', Templar: 'templar', Assassin: 'assassin', Ranger: 'ranger', Sorcerer: 'sorcerer', Spiritmaster: 'elementalist', Cleric: 'cleric', Chanter: 'chanter' };

export const KIND_LABEL = { 'active-skill': 'Skill +1', 'passive-skill': 'Passive +1', unique: 'Corner', stat: 'Stat', start: 'Start' };

export const nodeArt = (kind, taken, className) => kind === 'start'
  ? `${NODE_ART}board_icon_start_${START_ART[className] ?? 'gladiator'}.png`
  : `${NODE_ART}board_icon_${NODE_GRADE[kind] ?? 'common'}${taken ? '_open' : ''}.png`;

export const nodeImg = (kind, taken, className) => `<img class="ae-node-art" src="${esc(nodeArt(kind, taken, className))}" alt="" width="70" height="70" loading="lazy" decoding="async" referrerpolicy="no-referrer">`;

/**
 * One node tile, placed in the grid by its row and column.
 * tile: a planDaevanionBoard tile. bounds: the board's bounds. options: { className, status, label, step }.
 * Not a <button>: the shared button skin would turn every node into a gold action button.
 */
export function nodeTileHtml(tile, bounds, { className, status, label, step = null }) {
  return `<span class="ae-node" role="img" tabindex="0" data-kind="${esc(tile.kind)}" data-status="${esc(status)}"${tile.keySkill ? ' data-key="true"' : ''} data-node="${esc(tile.nodeId)}" data-rc="${tile.row}:${tile.col}" style="grid-row:${tile.row - bounds.top + 1};grid-column:${tile.col - bounds.left + 1}" aria-label="${esc(label)}">${nodeImg(tile.kind, tile.taken, className)}${step ? `<span class="ae-node-step" aria-hidden="true">${step}</span>` : ''}</span>`;
}

/** The grid size the board's CSS reads (--rows, --cols). */
export const boardGridStyle = bounds => `--rows:${bounds.bottom - bounds.top + 1};--cols:${bounds.right - bounds.left + 1}`;
