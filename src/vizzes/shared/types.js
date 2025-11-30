/**
 * Shared type definitions using JSDoc
 * No TypeScript syntax - pure JavaScript with comments
 */

/**
 * @typedef {Object} VizOptions
 * @property {number} [width] - Container width in pixels
 * @property {number} [height] - Container height in pixels
 * @property {'default'|'accessible'|'print'} [colorScheme] - Color scheme
 * @property {number} [animationSpeed] - Animation speed multiplier
 * @property {boolean} [reducedMotion] - Respect prefers-reduced-motion
 * @property {string} [language] - Language code for i18n
 * @property {boolean} [debugMode] - Show debug overlays
 */

/**
 * @typedef {Object} UpdatePayload
 * @property {Object} [filter] - Filter configuration
 * @property {string|string[]} [highlight] - Elements to highlight
 * @property {Object} [transition] - Transition settings
 * @property {Object} [zoom] - Zoom configuration
 */

/**
 * @typedef {Object} VizState
 * @property {number} currentStep - Current scroll step
 * @property {*} data - Visualization data
 * @property {Object} filters - Active filters
 * @property {string[]} highlights - Highlighted elements
 * @property {boolean} animationPaused - Animation state
 * @property {'explore'|'focus'|'compare'} interactionMode - Mode
 */

/**
 * @typedef {'dataReady'|'enterComplete'|'updateComplete'|'exitComplete'|'error'|'resize'|'stateChange'|'interaction'} UniversalEvent
 */

export const VIZ_EVENTS = {
  DATA_READY: 'dataReady',
  ENTER_COMPLETE: 'enterComplete',
  UPDATE_COMPLETE: 'updateComplete',
  EXIT_COMPLETE: 'exitComplete',
  ERROR: 'error',
  RESIZE: 'resize',
  STATE_CHANGE: 'stateChange',
  INTERACTION: 'interaction'
};

export const DEFAULT_OPTIONS = {
  width: 800,
  height: 600,
  colorScheme: 'default',
  animationSpeed: 1,
  reducedMotion: false,
  language: 'en',
  debugMode: false
};