// Micro-interactions for narrative story touches
// All features respect prefers-reduced-motion

/**
 * A) Planets - Comet hint on artist highlight
 * Spawns a one-shot comet flying across in ~400ms
 * Reduced-motion: subtle glow flash only
 */
export class CometEffect {
  constructor(vizContainer) {
    this.container = vizContainer;
    this.overlay = null;
    this.prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.init();
  }

  init() {
    // Create overlay for comets
    this.overlay = document.createElement('div');
    this.overlay.className = 'comet-overlay';
    this.overlay.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;';
    this.container.appendChild(this.overlay);
  }

  spawn() {
    if (this.prefersReducedMotion) {
      // Reduced motion: just flash a glow
      this.container.style.transition = 'box-shadow 200ms ease-out';
      this.container.style.boxShadow = '0 0 40px rgba(0, 255, 224, 0.5)';
      setTimeout(() => {
        this.container.style.boxShadow = '';
      }, 200);
      return;
    }

    // Full motion: spawn comet
    const comet = document.createElement('div');
    comet.className = 'comet';
    this.overlay.appendChild(comet);

    requestAnimationFrame(() => {
      comet.style.transform = 'translate(-120%, 120%) rotate(-20deg)';
      comet.style.opacity = '0';
    });

    setTimeout(() => comet.remove(), 500);
  }
}

/**
 * B) Ranking - Gentle leaf hint on first enter
 * First time section enters: 2 decorative leaves drop and settle
 * Reduced-motion: fade-in only
 */
export class LeafHintEffect {
  constructor(sectionContainer) {
    this.container = sectionContainer;
    this.hasTriggered = false;
    this.prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  trigger() {
    if (this.hasTriggered) return;
    this.hasTriggered = true;

    if (this.prefersReducedMotion) {
      // Just fade in the detail panel
      const panel = this.container.querySelector('.detail-panel');
      if (panel) {
        panel.style.transition = 'opacity 400ms ease-in';
        panel.style.opacity = '1';
      }
      return;
    }

    // Spawn 2 hint leaves
    for (let i = 0; i < 2; i++) {
      this.spawnHintLeaf(i);
    }
  }

  spawnHintLeaf(index) {
    const leaf = document.createElement('div');
    leaf.className = 'hint-leaf';
    leaf.style.cssText = `
      position: absolute;
      top: ${20 + index * 10}%;
      left: ${30 + index * 20}%;
      width: 12px;
      height: 12px;
      background: rgba(139, 195, 74, 0.6);
      border-radius: 50% 0;
      transform: translateY(-20px) rotate(45deg);
      opacity: 0;
      transition: all 200ms ease-out;
      pointer-events: none;
    `;

    this.container.appendChild(leaf);

    // Animate drop and settle
    requestAnimationFrame(() => {
      leaf.style.transform = 'translateY(12px) rotate(65deg)';
      leaf.style.opacity = '0.7';
    });

    // Fade out after settling
    setTimeout(() => {
      leaf.style.opacity = '0';
      setTimeout(() => leaf.remove(), 200);
    }, 1500);
  }
}

/**
 * C) Emotion - Bubble "breathe while inviting"
 * Nearest 3 bubbles to cursor scale 1.03× for 150ms
 * Reduced-motion: outline brightness pulse only
 */
export class BubbleBreatheEffect {
  constructor(vizContainer) {
    this.container = vizContainer;
    this.prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.throttleTimer = null;
    this.init();
  }

  init() {
    if (!this.container) return;

    this.container.addEventListener('mousemove', (e) => {
      if (this.throttleTimer) return;

      this.throttleTimer = setTimeout(() => {
        this.onMouseMove(e);
        this.throttleTimer = null;
      }, 100);
    });
  }

  onMouseMove(event) {
    const bubbles = this.container.querySelectorAll('.bubble, circle[data-type="bubble"]');
    if (!bubbles.length) return;

    // Calculate distances
    const cursorX = event.clientX;
    const cursorY = event.clientY;

    const distances = Array.from(bubbles).map(bubble => {
      const rect = bubble.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const distance = Math.hypot(centerX - cursorX, centerY - cursorY);
      return { bubble, distance };
    });

    // Sort and get nearest 3
    distances.sort((a, b) => a.distance - b.distance);
    const nearest = distances.slice(0, 3);

    if (this.prefersReducedMotion) {
      // Reduced motion: outline brightness pulse only
      nearest.forEach(({ bubble }) => {
        const currentStroke = bubble.getAttribute('stroke') || '#00FFE0';
        bubble.style.transition = 'stroke 150ms ease-out';
        bubble.setAttribute('stroke', '#FFFFFF');

        setTimeout(() => {
          bubble.setAttribute('stroke', currentStroke);
        }, 150);
      });
    } else {
      // Full motion: scale effect
      nearest.forEach(({ bubble }) => {
        // Reset all bubbles first
        bubbles.forEach(b => {
          b.style.transition = 'transform 150ms ease-out';
          b.style.transform = 'scale(1)';
        });

        // Scale nearest
        bubble.style.transform = 'scale(1.03)';

        setTimeout(() => {
          bubble.style.transform = 'scale(1)';
        }, 150);
      });
    }
  }
}

/**
 * Initialize all micro-interactions (TASK 3 - Container-level events)
 */
export function initMicroInteractions() {
  // A) Planets comet - trigger on ANY click in container
  const planetsViz = document.querySelector('#viz-planets');
  if (planetsViz) {
    const cometEffect = new CometEffect(planetsViz);

    // Trigger on ANY click in planets container
    planetsViz.addEventListener('click', () => {
      cometEffect.spawn();
    });

    // Also trigger on custom viz events if they fire
    planetsViz.addEventListener('artist-highlight', () => {
      cometEffect.spawn();
    });

    console.log('[MicroInteraction] Planets comet ready - click anywhere in viz');
  }

  // B) Ranking leaf hint - trigger on first intersection
  const rankingSection = document.querySelector('#section-fade');
  const rankingViz = document.querySelector('#viz-ranking');
  if (rankingSection && rankingViz) {
    const leafHint = new LeafHintEffect(rankingSection);

    // Trigger on first intersection
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          leafHint.trigger();
          observer.disconnect();
          console.log('[MicroInteraction] Ranking leaf hint triggered');
        }
      });
    }, { threshold: 0.3 });

    observer.observe(rankingSection);

    // Also allow clicking anywhere in ranking to show detail
    rankingViz.addEventListener('click', () => {
      const panel = rankingSection.querySelector('.detail-panel');
      if (panel && panel.getAttribute('aria-hidden') === 'true') {
        panel.setAttribute('aria-hidden', 'false');
        panel.style.opacity = '1';
        console.log('[MicroInteraction] Ranking detail panel opened');
      }
    }, { once: true });
  }

  // C) Emotion bubble breathe - trigger on section intersection, not just hover
  const emotionSection = document.querySelector('#section-takeaway');
  const emotionViz = document.querySelector('#viz-emotion');
  if (emotionSection && emotionViz) {
    const bubbleBreathe = new BubbleBreatheEffect(emotionViz);

    // Also trigger a pulse when section first enters
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          // Trigger initial pulse effect
          setTimeout(() => {
            const bubbles = emotionViz.querySelectorAll('.bubble, circle[data-type="bubble"], circle');
            const nearest = Array.from(bubbles).slice(0, 3);

            if (nearest.length > 0) {
              const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

              nearest.forEach(bubble => {
                if (prefersReducedMotion) {
                  // Reduced motion: outline brightness pulse
                  const currentStroke = bubble.getAttribute('stroke') || '#00FFE0';
                  bubble.style.transition = 'stroke 300ms ease-out';
                  bubble.setAttribute('stroke', '#FFFFFF');
                  setTimeout(() => {
                    bubble.setAttribute('stroke', currentStroke);
                  }, 300);
                } else {
                  // Full motion: scale pulse
                  bubble.style.transition = 'transform 300ms ease-out';
                  bubble.style.transform = 'scale(1.05)';
                  setTimeout(() => {
                    bubble.style.transform = 'scale(1)';
                  }, 300);
                }
              });
              console.log('[MicroInteraction] Emotion bubble breathe pulse triggered');
            }
          }, 500);

          observer.disconnect();
        }
      });
    }, { threshold: 0.4 });

    observer.observe(emotionSection);
  }
}
