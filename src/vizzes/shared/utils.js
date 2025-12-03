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

export function getDataPath(relativePath) {
  const base = import.meta.env.BASE_URL || '/';
  return `${base}${relativePath}`.replace(/\/+/g, '/');
}
