// Shared utilities for all visualizations

export class EventEmitter {
  constructor() {
    this.events = new Map();
  }

  on(event, callback) {
    if (!this.events.has(event)) {
      this.events.set(event, new Set());
    }
    this.events.get(event).add(callback);
  }

  off(event, callback) {
    if (this.events.has(event)) {
      this.events.get(event).delete(callback);
    }
  }

  emit(event, data = {}) {
    if (this.events.has(event)) {
      this.events.get(event).forEach(callback => {
        callback({ type: event, data });
      });
    }
  }
}

export function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Debug logging utility - only logs in development mode
 * Usage: debugLog('[Module]', 'message', data)
 */
export const DEBUG = import.meta.env?.DEV ?? (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production');

export function debugLog(...args) {
  if (DEBUG) {
    console.log(...args);
  }
}
