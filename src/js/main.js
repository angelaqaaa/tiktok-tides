// Main scrollytelling orchestrator - Redesigned for guided data story
import '../css/tokens.css';
import '../css/base.css';
import '../css/record-player.css';
import '../css/conveyor.css';
import { MotionPatterns } from './motion/patterns.js';
import { StopwatchViz } from '../vizzes/stopwatch/index.js';
import { PlanetViz } from '../vizzes/planet/index.js';
import { RankingViz } from '../vizzes/ranking/index.js';
import { EmotionViz } from '../vizzes/emotion/index.js';
import { RecordPlayerViz } from '../vizzes/record-player/index.js';
import { ConveyorViz } from '../vizzes/conveyor/index.js';
import { initMicroInteractions } from './micro-interactions.js';
import { installIllustrations } from '../illustrations/index.js';

// Scene mapping for semantic worlds (v3 spec - 8 scenes)
const SCENE_MAP = {
  // V3 scene IDs
  '#scene-hero': 'cosmos',
  '#scene-music-galaxy': 'orbit',
  '#scene-viral-sounds': 'orbit',
  '#scene-timing': 'dawn',
  '#scene-trend-pyramid': 'forest',
  '#scene-captions-emotion': 'air',
  '#scene-quiz': 'lab',
  '#scene-wrap-up': 'cosmos',
  // Legacy IDs (for backwards compatibility during transition)
  '#scene-landing': 'cosmos',
  '#scene-sound-universe': 'orbit',
  '#scene-top-sounds': 'orbit',
  '#scene-duration': 'dawn',
  '#scene-category': 'forest',
  '#scene-emotion': 'air',
  '#scene-summary': 'cosmos'
};

// Node positions for alien marker on map canvas (using legacy section IDs)
const NODE_POSITIONS = {
  'scene-landing': { x: '30%', y: '8%' },
  'scene-sound-universe': { x: '58%', y: '15%' },
  'scene-top-sounds': { x: '78%', y: '28%' },
  'scene-duration': { x: '72%', y: '45%' },
  'scene-category': { x: '58%', y: '60%' },
  'scene-emotion': { x: '42%', y: '72%' },
  'scene-quiz': { x: '28%', y: '82%' },
  'scene-summary': { x: '50%', y: '90%' }
};

// Scene names for keyboard shortcuts
const SCENE_NAMES = ['cosmos', 'orbit', 'dawn', 'forest', 'air', 'lab'];

// --- util: tiny debounce (used for stopwatch resize) ------------------------
function debounce(fn, ms = 150) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/**
 * TASK 0 - Dev-only SceneChip
 * Shows current scene at bottom-left for QA
 */
function createSceneChip() {
  const isProd = document.documentElement.dataset.env === 'prod';
  if (isProd) return;

  const chip = document.createElement('div');
  chip.id = 'scene-chip';
  chip.style.cssText = `
    position: fixed;
    bottom: 8px;
    left: 8px;
    padding: 4px 8px;
    background: rgba(0, 0, 0, 0.7);
    color: #00FFE0;
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    border-radius: 4px;
    opacity: 0.5;
    z-index: 10000;
    pointer-events: none;
    user-select: none;
  `;
  chip.textContent = 'scene: none';
  document.body.appendChild(chip);

  // Update chip when scene changes
  const observer = new MutationObserver(() => {
    const scene = document.body.dataset.scene || 'none';
    chip.textContent = `scene: ${scene}`;
  });
  observer.observe(document.body, { attributes: true, attributeFilter: ['data-scene'] });
}

/**
 * TASK 0 - Keyboard QA: Keys 1-7 force scenes (dev-only)
 */
function setupSceneKeyboardQA() {
  const isProd = document.documentElement.dataset.env === 'prod';
  if (isProd) return;

  document.addEventListener('keydown', (e) => {
    const key = parseInt(e.key);
    if (key >= 1 && key <= 7) {
      const scene = SCENE_NAMES[key - 1];
      document.body.dataset.scene = scene;
      console.log(`[QA] Force scene: ${scene}`);
    }
  });
}

/**
 * TASK 1 - Ensure scene layers exist (runtime injection)
 */
function ensureSceneLayers() {
  const needs = {
    'scene-landing': 'scene--stars',
    'scene-sound-universe': 'scene--orbits',
    'scene-category': 'scene--canopy',
    'scene-emotion': 'scene--bubbles'
  };

  Object.entries(needs).forEach(([id, cls]) => {
    const host = document.getElementById(id);
    if (!host) return;

    if (!host.querySelector(`.scene-layer.${cls}`)) {
      const layer = document.createElement('div');
      layer.className = `scene-layer ${cls}`;
      layer.setAttribute('aria-hidden', 'true');
      host.appendChild(layer);
      console.log(`[SceneLayer] Injected ${cls} into #${id}`);
    }
  });
}

class TikTokTidesApp {
  constructor() {
    this.vizControllers = {};
    this.currentSection = null;
    this.motion = new MotionPatterns();
    this.liveRegion = document.querySelector('[role="status"]');
    this.audioMuted = true;

    // Section metadata for transitions (v3 spec)
    this.sectionMeta = {
      // V3 scene IDs
      'scene-hero': { bg: 'bg-cosmos', name: 'Arrival', scene: 'hero', nodeNum: 1 },
      'scene-music-galaxy': { bg: 'bg-orbit', name: 'Music Galaxy', scene: 'music-galaxy', nodeNum: 2 },
      'scene-viral-sounds': { bg: 'bg-orbit', name: 'Viral Sounds', scene: 'viral-sounds', nodeNum: 3 },
      'scene-timing': { bg: 'bg-dawn', name: 'Timing', scene: 'timing', nodeNum: 4 },
      'scene-trend-pyramid': { bg: 'bg-forest', name: 'Trend Pyramid', scene: 'trend-pyramid', nodeNum: 5 },
      'scene-captions-emotion': { bg: 'bg-air', name: 'Captions & Emotion', scene: 'captions-emotion', nodeNum: 6 },
      'scene-quiz': { bg: 'bg-lab', name: 'Quiz', scene: 'quiz', nodeNum: 7 },
      'scene-wrap-up': { bg: 'bg-cosmos', name: 'Wrap-up', scene: 'wrap-up', nodeNum: 8 },
      // Legacy IDs (for backwards compatibility)
      'scene-landing': { bg: 'bg-cosmos', name: 'Welcome', scene: 'hero', nodeNum: 1 },
      'scene-sound-universe': { bg: 'bg-orbit', name: 'Sound Universe', scene: 'music-galaxy', nodeNum: 2 },
      'scene-top-sounds': { bg: 'bg-orbit', name: 'Top Sounds', scene: 'viral-sounds', nodeNum: 3 },
      'scene-duration': { bg: 'bg-dawn', name: 'Duration', scene: 'timing', nodeNum: 4 },
      'scene-category': { bg: 'bg-forest', name: 'Category', scene: 'trend-pyramid', nodeNum: 5 },
      'scene-emotion': { bg: 'bg-air', name: 'Emotion', scene: 'captions-emotion', nodeNum: 6 },
      'scene-summary': { bg: 'bg-cosmos', name: 'Summary', scene: 'wrap-up', nodeNum: 8 }
    };

    // Insight callout state (track which have been revealed)
    this.insightRevealed = {};

    // bound handlers
    this._stopwatchResize = null;

    this.init();
  }

  async init() {
    // Initialize visualizations
    await this.initVisualizations();

    // Install scene observer (semantic world switcher)
    this.installSceneObserver();

    // Setup scroll observer
    this.setupScrollObserver();

    // Setup navigation
    this.setupNavigation();

    // Setup journey map
    this.setupJourneyMap();

    // Setup progress bar
    this.setupProgressBar();

    // Setup keyboard navigation
    this.setupKeyboardNav();

    // Setup reduced motion
    this.setupReducedMotion();

    // Setup guided step buttons
    this.setupGuidedSteps();

    // Initialize starfield
    this.initStarfield();

    // Initialize alien narrator (v3 spec 4.1)
    this.initAlienNarrator();

    // Initialize micro-interactions
    initMicroInteractions();

    // Announce ready
    this.announce('TikTok Tides loaded and ready');
  }

  installSceneObserver() {
    // Scene switches when section is > 50% visible (stable, no thrashing)
    const io = new IntersectionObserver((entries) => {
      // Find sections that are > 50% visible
      const dominantSections = entries
        .filter(e => e.isIntersecting && e.intersectionRatio > 0.5)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio);

      if (dominantSections.length > 0) {
        const mostVisible = dominantSections[0];
        const id = '#' + mostVisible.target.id;
        const scene = SCENE_MAP[id];
        if (scene && document.body.dataset.scene !== scene) {
          document.body.dataset.scene = scene;
          console.log('Scene changed to:', scene, '(ratio:', mostVisible.intersectionRatio.toFixed(2), ')');

          // Update journey map highlighting
          this.updateJourneyMapHighlight(mostVisible.target.id);
        }
      }
    }, { root: null, rootMargin: '0px', threshold: 0.5 });

    Object.keys(SCENE_MAP).forEach(sel => {
      const el = document.querySelector(sel);
      if (el) io.observe(el);
    });
  }

  async initVisualizations() {
    // Register visualization controllers
    this.vizControllers.stopwatch = new StopwatchViz();
    this.vizControllers.planets = new PlanetViz();
    this.vizControllers.ranking = new RankingViz();
    this.vizControllers.emotion = new EmotionViz();
    this.vizControllers.recordPlayer = new RecordPlayerViz();
    this.vizControllers.conveyor = new ConveyorViz();

    // Initialize each viz with canonical API
    for (const [key, viz] of Object.entries(this.vizControllers)) {
      try {
        // SPECIAL-CASE: Stopwatch mounts into #chart
        // SPECIAL-CASE: Record player mounts into .record-player-section
        const selector =
          key === 'stopwatch'
            ? '#chart'
            : key === 'recordPlayer'
              ? '.record-player-section'
              : `#viz-${key === 'planets' ? 'planets' : key}`;

        await viz.init(selector, {
          reducedMotion: this.prefersReducedMotion(),
          animationSpeed: 1,
          colorScheme: 'default'
        });

        // For stopwatch, mount immediately and wire resize
        if (key === 'stopwatch') {
          viz.mount();
          viz.mounted = true;

          // Debounced resize
          this._stopwatchResize = debounce(() => {
            const el = document.getElementById('chart');
            if (!el) return;
            const { width, height } = el.getBoundingClientRect();
            const size = Math.max(320, Math.min(width, height || width));
            viz.resize(size, size);
          }, 150);

          window.addEventListener('resize', this._stopwatchResize);
          this._stopwatchResize();
        }

        // Record player mounts immediately
        if (key === 'recordPlayer') {
          viz.mount?.();
          viz.mounted = true;
        }

        // Setup event listeners
        this.setupVizEvents(key, viz);
      } catch (err) {
        console.warn(`Failed to init ${key}:`, err);
      }
    }
  }

  setupVizEvents(key, viz) {
    // Ranking: Leaf reveal
    if (key === 'ranking') {
      viz.on?.('onLeafReveal', (data) => {
        this.showDetailPanel(data);
      });
    }

    // Emotion: Drawer open
    if (key === 'emotion') {
      viz.on?.('bubbleClick', (data) => {
        this.openEmotionDrawer(data);
      });
    }

    // Conveyor: Quiz completion (detect when completion message is shown)
    if (key === 'conveyor') {
      // Poll for completion message to show insight callout
      const checkCompletion = setInterval(() => {
        const completionMsg = viz.container?.querySelector('.completion-message');
        if (completionMsg) {
          this.revealInsightCallout('scene-quiz');
          clearInterval(checkCompletion);
        }
      }, 500);
    }
  }

  setupScrollObserver() {
    const options = {
      root: null,
      rootMargin: '0px',
      threshold: [0, 0.25, 0.5, 0.75, 1]
    };

    this.observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
          this.handleSectionEnter(entry.target);
        }
      });
    }, options);

    // Observe all sections
    document.querySelectorAll('.section').forEach(section => {
      this.observer.observe(section);
    });
  }

  handleSectionEnter(section) {
    const sectionId = section.id;
    if (this.currentSection === sectionId) return;

    const prevSection = this.currentSection;
    this.currentSection = sectionId;

    // Update navigation
    this.updateNavigation(sectionId);

    // Update background
    this.updateBackground(sectionId);

    // Mount visualization if needed
    const vizContainer = section.querySelector('.viz-container');
    if (vizContainer) {
      const vizType = vizContainer.dataset.viz;
      const viz = this.vizControllers[vizType];
      if (viz && !viz.mounted) {
        viz.mount();
        viz.mounted = true;
      }
    }

    // Special-case: ensure Stopwatch is mounted
    if (sectionId === 'scene-duration') {
      const sw = this.vizControllers.stopwatch;
      if (sw && !sw.mounted) {
        sw.mount();
        sw.mounted = true;
      }
      sw?.update(1);
      setTimeout(() => sw?.update(2), 1600);
      this._stopwatchResize?.();
    }

    // Live region announcement
    const meta = this.sectionMeta[sectionId];
    if (meta) {
      this.announce(`${meta.name} section entered`);
      console.log(`[Section] Entered: ${meta.name}`);
    }
  }

  updateBackground(sectionId) {
    const meta = this.sectionMeta[sectionId];
    if (!meta) return;

    // Remove all bg classes
    Object.values(this.sectionMeta).forEach(m => {
      document.body.classList.remove(m.bg);
    });

    // Add new bg class
    document.body.classList.add(meta.bg);
  }

  updateNavigation(sectionId) {
    // Update nav links aria-current
    document.querySelectorAll('.nav-links a').forEach(link => {
      const href = link.getAttribute('href');
      link.setAttribute('aria-current', href === `#${sectionId}` ? 'true' : 'false');
    });
  }

  setupNavigation() {
    // Smooth scroll for nav links
    document.querySelectorAll('a[href^="#"]').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const target = document.querySelector(link.getAttribute('href'));
        if (target) {
          target.scrollIntoView({
            behavior: this.prefersReducedMotion() ? 'auto' : 'smooth',
            block: 'start'
          });
        }
      });
    });

    // CTA button scroll
    document.querySelectorAll('[data-scroll-to]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const target = document.querySelector(btn.dataset.scrollTo);
        if (target) {
          target.scrollIntoView({
            behavior: this.prefersReducedMotion() ? 'auto' : 'smooth',
            block: 'start'
          });
        }
      });
    });
  }

  setupJourneyMap() {
    // V3 Navigation Elements
    const mapToggle = document.querySelector('.map-toggle-btn, [data-journey-toggle]');
    const journeyOverlay = document.querySelector('.journey-map-overlay');
    const closeBtn = document.querySelector('.journey-map-close');
    const topNavBar = document.querySelector('.top-nav-bar');

    // Mini-strip navigation
    this.setupMiniStripNavigation();

    // Map overlay toggle
    if (mapToggle && journeyOverlay) {
      mapToggle.addEventListener('click', () => {
        const isHidden = journeyOverlay.getAttribute('aria-hidden') === 'true';
        journeyOverlay.setAttribute('aria-hidden', isHidden ? 'false' : 'true');

        if (isHidden) {
          // Opening - focus close button
          setTimeout(() => closeBtn?.focus(), 100);
        }
      });
    }

    // Close button
    closeBtn?.addEventListener('click', () => {
      journeyOverlay?.setAttribute('aria-hidden', 'true');
      mapToggle?.focus();
    });

    // Click outside to close
    journeyOverlay?.addEventListener('click', (e) => {
      if (e.target === journeyOverlay) {
        journeyOverlay.setAttribute('aria-hidden', 'true');
        mapToggle?.focus();
      }
    });

    // Map node clicks (desktop cartoon map)
    document.querySelectorAll('.map-node').forEach(node => {
      node.addEventListener('click', () => {
        const targetId = node.dataset.target;
        const target = document.getElementById(targetId);
        if (target) {
          journeyOverlay?.setAttribute('aria-hidden', 'true');
          target.scrollIntoView({
            behavior: this.prefersReducedMotion() ? 'auto' : 'smooth',
            block: 'start'
          });
        }
      });
    });

    // Mobile list item clicks
    document.querySelectorAll('.map-list-item').forEach(item => {
      item.addEventListener('click', () => {
        const targetId = item.dataset.target;
        const target = document.getElementById(targetId);
        if (target) {
          journeyOverlay?.setAttribute('aria-hidden', 'true');
          target.scrollIntoView({
            behavior: this.prefersReducedMotion() ? 'auto' : 'smooth',
            block: 'start'
          });
        }
      });
    });

    // Close on escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && journeyOverlay?.getAttribute('aria-hidden') === 'false') {
        journeyOverlay.setAttribute('aria-hidden', 'true');
        mapToggle?.focus();
      }
    });

    // Nav bar scroll effect (more opaque on scroll)
    if (topNavBar) {
      let ticking = false;
      window.addEventListener('scroll', () => {
        if (!ticking) {
          requestAnimationFrame(() => {
            if (window.scrollY > 50) {
              topNavBar.classList.add('scrolled');
            } else {
              topNavBar.classList.remove('scrolled');
            }
            ticking = false;
          });
          ticking = true;
        }
      });
    }
  }

  setupMiniStripNavigation() {
    // Mini-strip node clicks
    document.querySelectorAll('.mini-node').forEach(node => {
      node.addEventListener('click', () => {
        const targetId = node.dataset.sceneTarget;
        const target = document.getElementById(targetId);
        if (target) {
          target.scrollIntoView({
            behavior: this.prefersReducedMotion() ? 'auto' : 'smooth',
            block: 'start'
          });
        }
      });
    });
  }

  updateJourneyMapHighlight(sectionId) {
    // Update which navigation elements are highlighted as current
    const meta = this.sectionMeta[sectionId];
    if (!meta) return;

    // Update mini-strip nodes in top navbar
    document.querySelectorAll('.mini-node').forEach(node => {
      const isActive = node.dataset.sceneTarget === sectionId;
      node.classList.toggle('active', isActive);
      node.setAttribute('aria-current', isActive ? 'true' : 'false');
    });

    // Update map overlay nodes (desktop cartoon map)
    document.querySelectorAll('.map-node').forEach(node => {
      const isActive = node.dataset.target === sectionId;
      node.classList.toggle('active', isActive);
      node.setAttribute('aria-current', isActive ? 'true' : 'false');
    });

    // Update mobile list items
    document.querySelectorAll('.map-list-item').forEach(item => {
      const isActive = item.dataset.target === sectionId;
      item.classList.toggle('active', isActive);
      item.setAttribute('aria-current', isActive ? 'true' : 'false');
    });

    // Update alien marker position on map canvas
    this.updateAlienMarkerPosition(sectionId);

    // Mark as visited/completed
    this.markSceneVisited(sectionId);
  }

  updateAlienMarkerPosition(sectionId) {
    const alienMarker = document.querySelector('.map-alien-marker');
    const position = NODE_POSITIONS[sectionId];

    if (alienMarker && position) {
      alienMarker.style.setProperty('--marker-x', position.x);
      alienMarker.style.setProperty('--marker-y', position.y);
      // Also update the data attribute for debugging
      alienMarker.dataset.currentNode = this.sectionMeta[sectionId]?.nodeNum || 1;
    }
  }

  markSceneVisited(sectionId) {
    // Mark mini-strip node as visited
    const miniNode = document.querySelector(`.mini-node[data-scene-target="${sectionId}"]`);
    if (miniNode) {
      miniNode.classList.add('visited');
    }

    // Mark map node as visited
    const mapNode = document.querySelector(`.map-node[data-target="${sectionId}"]`);
    if (mapNode) {
      mapNode.classList.add('visited');
    }

    // Mark mobile list item as visited
    const listItem = document.querySelector(`.map-list-item[data-target="${sectionId}"]`);
    if (listItem) {
      listItem.classList.add('visited');
    }
  }

  setupProgressBar() {
    const progressBar = document.querySelector('.progress-bar');

    const updateProgress = () => {
      const windowHeight = window.innerHeight;
      const documentHeight = document.documentElement.scrollHeight - windowHeight;
      const scrolled = window.scrollY;
      const progress = (scrolled / documentHeight) * 100;

      progressBar.style.width = `${progress}%`;
    };

    // Throttle scroll updates
    let ticking = false;
    window.addEventListener('scroll', () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          updateProgress();
          ticking = false;
        });
        ticking = true;
      }
    });
  }

  setupKeyboardNav() {
    // Global keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      // Number keys jump to sections
      const sections = [
        'scene-landing',
        'scene-sound-universe',
        'scene-duration',
        'scene-category',
        'scene-emotion',
        'scene-quiz',
        'scene-summary'
      ];

      const index = parseInt(e.key, 10) - 1;
      if (!Number.isNaN(index) && sections[index]) {
        const target = document.getElementById(sections[index]);
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }

      // ? shows help
      if (e.key === '?') {
        this.showKeyboardHelp();
      }
    });
  }

  setupReducedMotion() {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

    // Initial check
    if (mediaQuery.matches) {
      document.body.classList.add('reduced-motion');
    }

    // Listen for changes
    mediaQuery.addEventListener('change', (e) => {
      if (e.matches) {
        document.body.classList.add('reduced-motion');
      } else {
        document.body.classList.remove('reduced-motion');
      }

      // Update all visualizations
      Object.values(this.vizControllers).forEach(viz => {
        viz.setState?.({ reducedMotion: e.matches });
      });
    });
  }

  setupGuidedSteps() {
    // Wire up all guided step buttons to trigger viz actions
    document.querySelectorAll('[data-viz-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.vizAction;
        this.handleVizAction(action, btn);

        // Reveal insight callout after first interaction in a scene
        const section = btn.closest('.section');
        if (section) {
          this.revealInsightCallout(section.id);
        }
      });
    });
  }

  handleVizAction(action, button) {
    console.log('[VizAction]', action);

    // Planet actions
    if (action === 'planet-highlight-danceability') {
      const viz = this.vizControllers.planets;
      viz.highlightHighDanceability?.();
      this.announce('Highlighting planets with high danceability');
    }

    if (action === 'planet-year') {
      const year = button.dataset.year;
      const viz = this.vizControllers.planets;
      viz.currentYear = year;

      // Update active year button
      document.querySelectorAll('.year-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.year === year);
      });

      // Re-render planet viz with new year
      viz.resetHighlights?.();
      viz.switchYear(year);
      this.announce(`Showing songs from ${year}`);
    }

    if (action === 'planet-highlight-repeat') {
      const viz = this.vizControllers.planets;
      viz.highlightRepeatedArtists?.();
      this.announce('Highlighting artists who appear across multiple years');
    }

    // Record player actions
    if (action === 'record-rotate') {
      const viz = this.vizControllers.recordPlayer;
      viz.rotateToNextRecord?.();
      // Announce current record name
      const currentIndex = viz.guidedRotationIndex || 0;
      const recordName = viz.data?.[currentIndex]?.name || 'record';
      this.announce(`Playing ${recordName}`);
    }

    if (action === 'record-highlight-top3') {
      const viz = this.vizControllers.recordPlayer;
      viz.highlightTop3?.();
      this.announce('Highlighting the top 3 most popular sounds');
    }

    // Stopwatch actions
    if (action === 'stopwatch-short') {
      const viz = this.vizControllers.stopwatch;
      viz.highlightShortClips?.();
      this.announce('Highlighting short clips under 15 seconds');
    }

    if (action === 'stopwatch-mid') {
      const viz = this.vizControllers.stopwatch;
      viz.highlightMidClips?.();
      this.announce('Highlighting mid-length clips, 15 to 30 seconds');
    }

    if (action === 'stopwatch-long') {
      const viz = this.vizControllers.stopwatch;
      viz.highlightLongClips?.();
      this.announce('Highlighting long clips over 30 seconds');
    }

    // Ranking actions
    if (action === 'ranking-reveal') {
      const viz = this.vizControllers.ranking;
      viz.revealPyramidLayers?.();
      this.announce('Revealing pyramid layers from base to peak');
    }

    if (action === 'ranking-dive') {
      // Just inform user to click a tile
      this.announce('Click any category tile in the pyramid to see creators');
    }

    // Emotion actions
    if (action === 'emotion-show-all') {
      const viz = this.vizControllers.emotion;
      viz.resetHighlights?.();
      this.announce('Showing all emotion categories');
    }

    if (action === 'emotion-highlight-positive') {
      const viz = this.vizControllers.emotion;
      viz.highlightPositiveEmotions?.();
      this.announce('Highlighting positive and hype-oriented language');
    }

    if (action === 'emotion-sample') {
      this.announce('Click any bubble to see example captions');
    }
  }

  revealInsightCallout(sectionId) {
    if (this.insightRevealed[sectionId]) return;

    const section = document.getElementById(sectionId);
    if (!section) return;

    const callout = section.querySelector('.insight-callout');
    if (callout) {
      callout.setAttribute('aria-hidden', 'false');
      this.insightRevealed[sectionId] = true;
    }
  }

  showDetailPanel(data) {
    const panel = document.querySelector('.detail-panel');
    if (panel) {
      const content = panel.querySelector('.detail-content');
      content.innerHTML = `
        <h5>${data.community}</h5>
        <ul>${data.topics.map(t => `<li>${t}</li>`).join('')}</ul>
      `;

      panel.setAttribute('aria-hidden', 'false');
    }
  }

  openEmotionDrawer(data) {
    const drawer = document.querySelector('.detail-drawer');
    if (drawer) {
      const phrases = drawer.querySelector('.example-phrases');

      // Update content
      phrases.innerHTML = `<p>Example: "${data.word}" in context</p>`;

      drawer.setAttribute('aria-hidden', 'false');

      // Focus management
      drawer.querySelector('.drawer-close')?.focus();

      // Close button
      const closeBtn = drawer.querySelector('.drawer-close');
      closeBtn?.addEventListener('click', () => {
        drawer.setAttribute('aria-hidden', 'true');
      });
    }
  }

  initStarfield() {
    const starfield = document.querySelector('.starfield');
    if (!starfield) return;

    const starCount = 100;

    for (let i = 0; i < starCount; i++) {
      const star = document.createElement('div');
      star.className = 'star';
      star.style.left = `${Math.random() * 100}%`;
      star.style.top = `${Math.random() * 100}%`;
      star.style.animationDelay = `${Math.random() * 5}s`;

      const size = Math.random() * 3 + 1;
      star.style.width = `${size}px`;
      star.style.height = `${size}px`;

      starfield.appendChild(star);
    }
  }

  /**
   * Initialize alien narrator system per v3 spec 4.1
   * Shows speech bubble after a delay when user enters a scene
   */
  initAlienNarrator() {
    // Show the hero alien's speech bubble after a delay
    const heroAlien = document.querySelector('.alien-narrator--hero');
    if (heroAlien) {
      const speechBubble = heroAlien.querySelector('.alien-speech-bubble');
      if (speechBubble) {
        // Show speech bubble after 1.5 seconds
        setTimeout(() => {
          speechBubble.setAttribute('data-speech-state', 'visible');
        }, 1500);

        // Allow clicking the alien to toggle speech
        const avatar = heroAlien.querySelector('.alien-avatar');
        if (avatar) {
          avatar.style.cursor = 'pointer';
          avatar.addEventListener('click', () => {
            const current = speechBubble.getAttribute('data-speech-state');
            speechBubble.setAttribute('data-speech-state',
              current === 'visible' ? 'hidden' : 'visible'
            );
          });
        }
      }
    }

    // Setup observer for scene-specific alien narrators
    this.setupAlienSceneObserver();
  }

  /**
   * Watch for scene changes to show/hide alien narrators
   */
  setupAlienSceneObserver() {
    // Create mutation observer to watch body's data-scene attribute
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'data-scene') {
          const currentScene = document.body.dataset.scene;
          this.updateAlienNarrator(currentScene);
        }
      });
    });

    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['data-scene']
    });
  }

  /**
   * Update alien narrator based on current scene
   */
  updateAlienNarrator(scene) {
    // Hide all alien narrators first
    document.querySelectorAll('.alien-narrator').forEach(narrator => {
      const speechBubble = narrator.querySelector('.alien-speech-bubble');
      if (speechBubble) {
        speechBubble.setAttribute('data-speech-state', 'hidden');
      }
    });

    // Show the narrator for the current scene after a delay
    const sceneNarrator = document.querySelector(`.alien-narrator[data-scene="${scene}"]`);
    if (sceneNarrator) {
      const speechBubble = sceneNarrator.querySelector('.alien-speech-bubble');
      if (speechBubble) {
        setTimeout(() => {
          speechBubble.setAttribute('data-speech-state', 'visible');
        }, 800);
      }
    }
  }

  showKeyboardHelp() {
    console.log('Keyboard shortcuts:');
    console.log('1-7: Jump to sections');
    console.log('Esc: Close overlays');
    console.log('?: Show this help');
    console.log('Tab: Navigate interactive elements');
    console.log('Enter: Activate buttons/links');
  }

  announce(message) {
    if (this.liveRegion) {
      this.liveRegion.textContent = message;
    }
  }

  prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
}

// Initialize app on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  // TASK 0 - Dev-only sanity hooks
  createSceneChip();
  setupSceneKeyboardQA();

  // TASK 1 - Ensure scene layers exist
  ensureSceneLayers();

  // Initialize scene illustrations
  installIllustrations();

  // Initialize main app
  window.app = new TikTokTidesApp();
});
