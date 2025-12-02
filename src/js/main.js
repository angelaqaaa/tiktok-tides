// Main scrollytelling orchestrator - Redesigned for guided data story
import '../css/tokens.css';
import '../css/design-system.css';
import '../css/alien-narrator.css';
import '../css/base.css';
import '../css/navigation.css';
import '../css/hero.css';
import '../css/stopwatch.css';
import '../css/record-player.css';
import '../css/ranking.css';
import '../css/conveyor.css';
import '../css/emotion.css';
import '../css/planet.css';
import '../css/music-galaxy.css';
import '../css/credits.css';
import { StopwatchViz } from '../vizzes/stopwatch/index.js';
import { PlanetViz } from '../vizzes/planet/index.js';
import { RankingViz } from '../vizzes/ranking/index.js';
import { EmotionViz } from '../vizzes/emotion/index.js';
import { RecordPlayerViz } from '../vizzes/record-player/index.js';
import { ConveyorViz } from '../vizzes/conveyor/index.js';
import { initMicroInteractions } from './micro-interactions.js';

// Scene mapping for semantic worlds
// Maps section IDs to scene attribute values for body[data-scene]
const SCENE_MAP = {
  '#scene-hero': 'cosmos',
  '#scene-music-galaxy': 'galaxy',
  '#scene-viral-sounds': 'sounds',
  '#scene-duration': 'dawn',
  '#bridge-topics': 'dawn',          // Mid-point bridge
  '#scene-category': 'forest',
  '#scene-emotion': 'air',
  '#scene-quiz': 'lab',
  '#scene-summary': 'wrapup',
  '#scene-credits': 'wrapup'          // Team credits page
};

// Node positions for alien marker on map canvas
const NODE_POSITIONS = {
  'scene-hero': { x: '30%', y: '8%' },
  'scene-music-galaxy': { x: '58%', y: '15%' },
  'scene-viral-sounds': { x: '78%', y: '28%' },
  'scene-duration': { x: '72%', y: '45%' },
  'scene-category': { x: '58%', y: '60%' },
  'scene-emotion': { x: '42%', y: '72%' },
  'scene-quiz': { x: '28%', y: '82%' },
  'scene-summary': { x: '50%', y: '90%' },
  'scene-credits': { x: '50%', y: '95%' }  // Credits page below summary
};

// Scene names for keyboard shortcuts (includes new scene values)
const SCENE_NAMES = ['cosmos', 'galaxy', 'sounds', 'dawn', 'forest', 'air', 'lab'];

// --- util: tiny debounce (used for stopwatch resize) ------------------------
function debounce(fn, ms = 150) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
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
    'scene-hero': 'scene--stars',
    'scene-music-galaxy': 'scene--orbits',
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
    this.liveRegion = document.querySelector('[role="status"]');
    this.audioMuted = true;

    // Section metadata for transitions
    // Maps section IDs to background classes, display names, and node numbers
    this.sectionMeta = {
      'scene-hero': { bg: 'bg-cosmos', name: 'Arrival', scene: 'hero', nodeNum: 1 },
      'scene-music-galaxy': { bg: 'bg-galaxy', name: 'Music Galaxy', scene: 'music-galaxy', nodeNum: 2 },
      'scene-viral-sounds': { bg: 'bg-sounds', name: 'Viral Sounds', scene: 'viral-sounds', nodeNum: 3 },
      'scene-duration': { bg: 'bg-dawn', name: 'Duration', scene: 'duration', nodeNum: 4 },
      'scene-category': { bg: 'bg-forest', name: 'Category', scene: 'category', nodeNum: 5 },
      'scene-emotion': { bg: 'bg-air', name: 'Emotion', scene: 'emotion', nodeNum: 6 },
      'scene-quiz': { bg: 'bg-lab', name: 'Quiz', scene: 'quiz', nodeNum: 7 },
      'scene-summary': { bg: 'bg-cosmos', name: 'Summary', scene: 'summary', nodeNum: 8 }
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

    // Initialize alien narrator (v3 spec 4.1)
    this.initAlienNarrator();

    // Initialize Music Galaxy scrollytelling (v3 spec 5.2.4)
    this.setupMusicGalaxyScrollytelling();

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
        .filter(e => e.isIntersecting && e.intersectionRatio > 0.3) // Lowered from 0.5 to prevent black flash
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio);

      if (dominantSections.length > 0) {
        const mostVisible = dominantSections[0];
        const id = '#' + mostVisible.target.id;
        const scene = SCENE_MAP[id];
        if (scene && document.body.dataset.scene !== scene) {
          const previousScene = document.body.dataset.scene;
          document.body.dataset.scene = scene;
          console.log('Scene changed from:', previousScene, '→', scene, '(ratio:', mostVisible.intersectionRatio.toFixed(2), ')');

          // NOTE: .alien-narrator--hero transition code REMOVED - HTML element was removed (Dec 2025 cleanup)

          // Update journey map highlighting (inside scene change block for scene-specific updates)
        }
        // ALWAYS update journey map highlighting when any section is visible
        // (moved outside scene change condition to fix tracking issue)
        this.updateJourneyMapHighlight(mostVisible.target.id);
      }
    }, { root: null, rootMargin: '0px', threshold: [0, 0.3, 0.5, 1] }); // Multiple thresholds for smoother transitions

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

    // Stopwatch: Timing filter buttons
    if (key === 'stopwatch') {
      this.setupTimingFilters(viz);
    }
  }

  /**
   * Setup timing icon filter buttons for stopwatch viz
   */
  setupTimingFilters(viz) {
    const filterButtons = document.querySelectorAll('[data-timing-filter]');
    let activeFilter = null;

    filterButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const filter = btn.dataset.timingFilter;

        // Toggle off if clicking same filter
        if (activeFilter === filter) {
          activeFilter = null;
          // Reset all highlights
          viz.resetHighlights?.();
          filterButtons.forEach(b => b.classList.remove('timing-icon-item--active'));
          return;
        }

        activeFilter = filter;

        // Update active state
        filterButtons.forEach(b => b.classList.remove('timing-icon-item--active'));
        btn.classList.add('timing-icon-item--active');

        // Call appropriate highlight function
        switch (filter) {
          case 'short':
            viz.highlightShortClips?.();
            break;
          case 'mid':
            viz.highlightMidClips?.();
            break;
          case 'long':
            viz.highlightLongClips?.();
            break;
        }
      });
    });
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
        console.log(`[Viz] Mounting ${vizType} into`, vizContainer.id || vizContainer.className);
        viz.mount();
        viz.mounted = true;
      }
    }

    // Special-case: Music Galaxy planet viz
    if (sectionId === 'scene-music-galaxy') {
      const planetViz = this.vizControllers.planets;
      if (planetViz && !planetViz.mounted) {
        console.log('[Viz] Mounting planets for Music Galaxy');
        planetViz.mount();
        planetViz.mounted = true;
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
    // Update v3 mini-strip navigation active states
    document.querySelectorAll('.mini-node[data-target]').forEach(node => {
      const target = node.getAttribute('data-target');
      node.classList.toggle('active', target === sectionId);
    });

    // Update v3 journey map navigation active states
    document.querySelectorAll('.map-node[data-target]').forEach(node => {
      const target = node.getAttribute('data-target');
      node.classList.toggle('active', target === sectionId);
    });

    // Update mission sidebar navigation active states (Task B)
    document.querySelectorAll('.sidebar-node[data-target]').forEach(node => {
      const target = node.getAttribute('data-target');
      node.classList.toggle('active', target === sectionId);
    });
  }

  setupNavigation() {
    // Smooth scroll for nav links (skip empty hrefs)
    document.querySelectorAll('a[href^="#"]').forEach(link => {
      link.addEventListener('click', (e) => {
        const href = link.getAttribute('href');
        if (!href || href === '#') return; // Skip empty/invalid hrefs

        e.preventDefault();
        const target = document.querySelector(href);
        if (target) {
          // Use fullPage API if available
          if (window.fullpage_api) {
            const sectionIndex = Array.from(document.querySelectorAll('.section')).indexOf(target);
            if (sectionIndex >= 0) {
              window.fullpage_api.moveTo(sectionIndex + 1);
            }
          } else {
            target.scrollIntoView({
              behavior: this.prefersReducedMotion() ? 'auto' : 'smooth',
              block: 'start'
            });
          }
        }
      });
    });

    // CTA button scroll - use fullPage.js API if available, otherwise fallback to scrollIntoView
    document.querySelectorAll('[data-scroll-to]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const targetSelector = btn.dataset.scrollTo;
        const target = document.querySelector(targetSelector);

        if (target) {
          // If fullPage.js is available, use its API for proper navigation
          if (window.fullpage_api) {
            // Find the section index (1-based for fullPage)
            const sections = document.querySelectorAll('.section');
            let sectionIndex = 1;
            sections.forEach((section, idx) => {
              if (section === target || '#' + section.id === targetSelector) {
                sectionIndex = idx + 1;
              }
            });
            console.log('[CTA Button] Navigating to section', sectionIndex, 'via fullPage API');
            window.fullpage_api.moveTo(sectionIndex);
          } else {
            // Fallback to native scroll
            target.scrollIntoView({
              behavior: this.prefersReducedMotion() ? 'auto' : 'smooth',
              block: 'start'
            });
          }
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

    // Logo click - return to hero section
    const logoCluster = document.querySelector('.nav-logo-cluster[data-nav-home]');
    if (logoCluster) {
      logoCluster.addEventListener('click', (e) => {
        e.preventDefault();
        const targetId = 'scene-hero';

        // Update navigation states
        this.updateNavigation(targetId);
        this.updateAlienMarkerPosition(targetId);
        this.updateJourneyMapHighlight(targetId);

        // Use fullPage API if available
        if (window.fullpage_api) {
          window.fullpage_api.moveTo(1); // Section 1 is hero
        } else {
          const target = document.getElementById(targetId);
          target?.scrollIntoView({
            behavior: this.prefersReducedMotion() ? 'auto' : 'smooth',
            block: 'start'
          });
        }
      });
    }

    // Map node clicks (desktop cartoon map)
    document.querySelectorAll('.map-node').forEach(node => {
      node.addEventListener('click', () => {
        const targetId = node.dataset.target;
        const target = document.getElementById(targetId);
        if (target) {
          // Immediately update alien marker position before hiding overlay
          this.updateAlienMarkerPosition(targetId);
          this.updateJourneyMapHighlight(targetId);
          journeyOverlay?.setAttribute('aria-hidden', 'true');

          // Use fullPage API if available
          if (window.fullpage_api) {
            const sections = document.querySelectorAll('.section');
            let sectionIndex = 1;
            sections.forEach((section, idx) => {
              if (section.id === targetId) {
                sectionIndex = idx + 1;
              }
            });
            window.fullpage_api.moveTo(sectionIndex);
          } else {
            target.scrollIntoView({
              behavior: this.prefersReducedMotion() ? 'auto' : 'smooth',
              block: 'start'
            });
          }
        }
      });
    });

    // Mission sidebar toggle (collapse/expand)
    const sidebarToggle = document.querySelector('.sidebar-toggle');
    const missionSidebar = document.querySelector('.mission-sidebar');
    if (sidebarToggle && missionSidebar) {
      sidebarToggle.addEventListener('click', () => {
        const isCollapsed = missionSidebar.classList.toggle('collapsed');
        sidebarToggle.setAttribute('aria-expanded', !isCollapsed);
      });
    }

    // Mission sidebar node clicks (Task B - slim vertical navigation)
    document.querySelectorAll('.sidebar-node').forEach(node => {
      node.addEventListener('click', () => {
        const targetId = node.dataset.target;
        const target = document.getElementById(targetId);
        if (target) {
          // Update navigation states
          this.updateNavigation(targetId);
          this.updateAlienMarkerPosition(targetId);
          this.updateJourneyMapHighlight(targetId);

          // Use fullPage API if available
          if (window.fullpage_api) {
            const sections = document.querySelectorAll('.section');
            let sectionIndex = 1;
            sections.forEach((section, idx) => {
              if (section.id === targetId) {
                sectionIndex = idx + 1;
              }
            });
            console.log('[Mission Sidebar] Navigating to section', sectionIndex, targetId);
            window.fullpage_api.moveTo(sectionIndex);
          } else {
            target.scrollIntoView({
              behavior: this.prefersReducedMotion() ? 'auto' : 'smooth',
              block: 'start'
            });
          }
        }
      });
    });

    // Mobile list item clicks
    document.querySelectorAll('.map-list-item').forEach(item => {
      item.addEventListener('click', () => {
        const targetId = item.dataset.target;
        const target = document.getElementById(targetId);
        if (target) {
          // Immediately update alien marker position
          this.updateAlienMarkerPosition(targetId);
          this.updateJourneyMapHighlight(targetId);
          journeyOverlay?.setAttribute('aria-hidden', 'true');

          // Use fullPage API if available
          if (window.fullpage_api) {
            const sections = document.querySelectorAll('.section');
            let sectionIndex = 1;
            sections.forEach((section, idx) => {
              if (section.id === targetId) {
                sectionIndex = idx + 1;
              }
            });
            window.fullpage_api.moveTo(sectionIndex);
          } else {
            target.scrollIntoView({
              behavior: this.prefersReducedMotion() ? 'auto' : 'smooth',
              block: 'start'
            });
          }
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
          // Immediately update alien marker position and nav highlight
          this.updateAlienMarkerPosition(targetId);
          this.updateJourneyMapHighlight(targetId);

          // Use fullPage API if available for proper navigation
          if (window.fullpage_api) {
            const sections = document.querySelectorAll('.section');
            let sectionIndex = 1;
            sections.forEach((section, idx) => {
              if (section.id === targetId) {
                sectionIndex = idx + 1;
              }
            });
            console.log('[Mini-strip] Navigating to section', sectionIndex, targetId);
            window.fullpage_api.moveTo(sectionIndex);
          } else {
            target.scrollIntoView({
              behavior: this.prefersReducedMotion() ? 'auto' : 'smooth',
              block: 'start'
            });
          }
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
    const nodeNum = this.sectionMeta[sectionId]?.nodeNum || 1;

    if (alienMarker && position) {
      alienMarker.style.setProperty('--marker-x', position.x);
      alienMarker.style.setProperty('--marker-y', position.y);
      // Also update the data attribute for debugging
      alienMarker.dataset.currentNode = nodeNum;
    }

    // Update sidebar alien marker (Task B - mini mission map)
    // Get position from the sidebar node's CSS custom properties
    const sidebarAlienMarker = document.querySelector('.sidebar-alien-marker');
    const sidebarNode = document.querySelector(`.sidebar-node[data-target="${sectionId}"]`);
    if (sidebarAlienMarker && sidebarNode) {
      const nodeX = sidebarNode.style.getPropertyValue('--node-x');
      const nodeY = sidebarNode.style.getPropertyValue('--node-y');
      sidebarAlienMarker.style.setProperty('--marker-x', nodeX);
      sidebarAlienMarker.style.setProperty('--marker-y', nodeY);
      sidebarAlienMarker.dataset.currentNode = nodeNum;
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

    // Mark sidebar node as visited (Task B - mini mission map)
    const sidebarNode = document.querySelector(`.sidebar-node[data-target="${sectionId}"]`);
    if (sidebarNode) {
      sidebarNode.classList.add('visited');
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
        'scene-hero',
        'scene-music-galaxy',
        'scene-viral-sounds',
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

      // Show second alien speech bubble when 2022 is selected (per v3 spec 5.2.5)
      this.updateAlienSpeechForYear(year);
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

  /**
   * Initialize alien narrator system per v3 spec 4.1
   * Shows speech bubble after a delay when user enters a scene
   */
  initAlienNarrator() {
    // NOTE: .alien-narrator--hero initialization REMOVED - HTML element was removed (Dec 2025 cleanup)

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
      // NOTE: .alien-narrator--hero check removed - HTML element was removed (Dec 2025 cleanup)

      const speechBubble = narrator.querySelector('.alien-speech-bubble');
      if (speechBubble) {
        speechBubble.setAttribute('data-speech-state', 'hidden');
      }
      // Reset any animation classes
      narrator.classList.remove('alien-tapping', 'alien-sliding');
    });

    // Show the narrator for the current scene after a delay
    const sceneNarrator = document.querySelector(`.alien-narrator[data-scene="${scene}"]`);
    if (sceneNarrator) {
      // SKIP auto-speech for Scene 2 (galaxy) - slide handler manages speech bubbles there
      // SKIP auto-speech for Scene 1 (cosmos) - initAlienNarrator handles the hero alien
      // This prevents race conditions and flickering
      if (scene !== 'galaxy' && scene !== 'cosmos') {
        const speechBubble = sceneNarrator.querySelector('.alien-speech-bubble');
        if (speechBubble) {
          setTimeout(() => {
            speechBubble.setAttribute('data-speech-state', 'visible');
          }, 1200); // Slightly longer delay for animations to complete
        }
      }

      // Scene 3: Setup tap/bounce and scroll slide behavior
      if (scene === 'sounds') {
        this.setupScene3AlienBehavior(sceneNarrator);
      }
    }
  }

  /**
   * Update alien speech for year selection in Scene 2 (v3 spec 5.2.5)
   */
  updateAlienSpeechForYear(year) {
    const scene2Alien = document.querySelector('.alien-narrator--scene2');
    if (!scene2Alien) return;

    const speechBubble = scene2Alien.querySelector('.alien-speech-bubble');
    const speechText = scene2Alien.querySelector('.alien-speech-text');
    if (!speechBubble || !speechText) return;

    // Show second speech bubble when 2022 is selected
    if (year === '2022') {
      speechText.textContent = 'Look how this artist keeps shining year after year!';
      speechBubble.setAttribute('data-speech-state', 'visible');
      // Add pointing animation class
      scene2Alien.classList.add('alien-pointing');
    } else {
      // Revert to first speech
      speechText.textContent = 'Each planet you see is a creator or artist. I am visiting the busiest ones.';
      scene2Alien.classList.remove('alien-pointing');
    }
  }

  /**
   * Setup Scene 3 alien tap/bounce and scroll slide behavior (v3 spec 5.3.5)
   */
  setupScene3AlienBehavior(alienEl) {
    // After 4 seconds (autosequence finished), trigger tap/bounce
    setTimeout(() => {
      alienEl.classList.add('alien-tapping');
      // Remove tapping class after animation completes
      setTimeout(() => {
        alienEl.classList.remove('alien-tapping');
      }, 600);
    }, 4000);

    // Setup scroll listener for slide effect
    const scene3Section = document.getElementById('scene-viral-sounds');
    if (!scene3Section) return;

    const handleScroll = () => {
      const rect = scene3Section.getBoundingClientRect();
      const viewportHeight = window.innerHeight;

      // Calculate how much of the section has scrolled past
      const scrollProgress = Math.max(0, (viewportHeight - rect.top) / (viewportHeight + rect.height));

      // Start sliding when user scrolls past 60% of the section
      if (scrollProgress > 0.6) {
        alienEl.classList.add('alien-sliding');
      } else {
        alienEl.classList.remove('alien-sliding');
      }
    };

    // Add scroll listener
    window.addEventListener('scroll', handleScroll, { passive: true });

    // Store reference for cleanup
    this._scene3ScrollHandler = handleScroll;
  }

  /**
   * Setup Music Galaxy Slide-Based Scrollytelling (v3 spec 5.2.4)
   * PowerPoint-style slides - scroll wheel changes slides, NO page scrolling
   * Pattern from STEAMulating Trends (fullPage.js) and Smoking & Lung Cancer
   */
  setupMusicGalaxyScrollytelling() {
    const slides = document.querySelectorAll('.music-galaxy-slide');
    const annotation = document.querySelector('.music-galaxy-annotation');
    // Single speech bubble with dynamic text (v3 redesign)
    const speechBubble = document.querySelector('.alien-narrator--scene2 .alien-speech-bubble');
    const speechText = document.querySelector('.alien-narrator--scene2 .alien-speech-text');
    const alienNarrator = document.querySelector('.alien-narrator--scene2');

    // Speech text for each step (v3 redesign)
    const ALIEN_SPEECH = [
      "So many planets! Each one is an artist whose sounds went viral. Let me scan the biggest ones...",
      "These few artists fuel many viral trends. Humans really like repeating familiar sounds.",
      "Watch what happens when I switch years. Some planets keep appearing—those artists ride every wave!",
      "Fascinating patterns! Now let's zoom in on specific sounds humans can't stop looping..."
    ];

    // Helper to update alien speech for a step
    const updateAlienSpeech = (stepIndex, show = true) => {
      if (!speechBubble || !speechText) return;
      speechText.textContent = ALIEN_SPEECH[stepIndex] || ALIEN_SPEECH[0];
      setSpeechState(speechBubble, show ? 'visible' : 'hidden', 'Speech');
    };
    const planetViz = this.vizControllers.planets;

    if (!slides.length || !planetViz) {
      console.warn('Music Galaxy slide elements not found');
      return;
    }

    // Mount planet viz once
    if (!planetViz.mounted) {
      console.log('[Music Galaxy] Mounting planet viz...');
      planetViz.mount();
      planetViz.mounted = true;

      // Force update to ensure planets are visible
      setTimeout(() => {
        planetViz.updateVisualization?.();
        console.log('[Music Galaxy] Planets rendered:', planetViz.svg?.select('#planets').selectAll('.planet').size());
      }, 100);
    }

    // fullPage.js handles slide transitions via .slide class
    // We just need to respond to slide changes with viz updates

    // Track active speech bubble timeout to prevent overlaps
    let speechBubbleTimeout = null;

    // Helper to safely set speech bubble state with debug logging
    // IMPORTANT: Temporarily disable CSS transitions AND animations to prevent flicker
    const setSpeechState = (bubble, state, bubbleName) => {
      if (!bubble) return;
      const prevState = bubble.getAttribute('data-speech-state');
      if (prevState === state) {
        // Already in desired state, don't touch it
        return;
      }

      // CRITICAL: Temporarily disable ALL transitions AND animations to prevent flicker
      const savedTransition = bubble.style.transition;
      const savedAnimation = bubble.style.animation;
      bubble.style.transition = 'none';
      bubble.style.animation = 'none';

      // Set the state
      bubble.setAttribute('data-speech-state', state);

      // Force reflow to apply state change immediately without transition/animation
      void bubble.offsetHeight;

      // Re-enable transitions/animations after a brief delay (for future animations)
      requestAnimationFrame(() => {
        bubble.style.transition = savedTransition;
        bubble.style.animation = savedAnimation;
      });

      console.log(`[Alien Speech] ${bubbleName}: ${prevState} → ${state}`);
    };

    // Handle slide-specific viz changes
    const handleSlideChange = (index) => {
      if (!planetViz.mounted || !planetViz.svg) return;

      console.log('[Music Galaxy] Slide', index + 1, 'active');
      this.announce(`Music Galaxy: Slide ${index + 1} of 4`);

      // Switch text content in the text overlay based on slide index
      const textOverlay = document.querySelector('.music-galaxy-text-overlay');
      if (textOverlay) {
        const stepContents = textOverlay.querySelectorAll('.step-content[data-slide-step]');
        stepContents.forEach(content => {
          const stepIndex = parseInt(content.dataset.slideStep, 10);
          content.style.display = (stepIndex === index) ? 'block' : 'none';
        });
      }

      // Clear any pending speech bubble timeouts to prevent race conditions
      if (speechBubbleTimeout) {
        clearTimeout(speechBubbleTimeout);
        speechBubbleTimeout = null;
      }

      // NOTE: Each case handles its own speech bubbles to avoid hide-then-show flicker

      switch (index) {
        case 0: // Slide 1: Landing in galaxy - default view
          planetViz.resetHighlights?.();
          planetViz.switchYear?.('2019');
          document.querySelectorAll('.year-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.year === '2019');
          });
          // Hide annotation
          if (annotation) {
            annotation.setAttribute('aria-hidden', 'true');
            annotation.style.left = '';
            annotation.style.top = '';
          }
          // Show speech for step 0 (v3 redesign: alien at bottom-right)
          updateAlienSpeech(0, true);
          // Reset alien to default position (bottom-right per spec)
          if (alienNarrator) {
            alienNarrator.classList.remove('alien-pointing', 'alien-top-left', 'alien-bottom-left', 'alien-tracking');
            alienNarrator.style.left = '';
            alienNarrator.style.top = '';
            alienNarrator.style.bottom = '';
            alienNarrator.style.right = '';
            alienNarrator.style.visibility = 'visible';
          }
          break;

        case 1: // Slide 2: Spotlight on dominant artists
          planetViz.resetHighlights?.();
          planetViz.switchYear?.('2022');
          document.querySelectorAll('.year-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.year === '2022');
          });
          setTimeout(() => planetViz.highlightTopArtists?.(), 600);

          // Hide annotation
          if (annotation) {
            annotation.setAttribute('aria-hidden', 'true');
            annotation.style.left = '';
            annotation.style.top = '';
          }

          // Alien tracks the top highlighted planet
          if (alienNarrator) {
            alienNarrator.classList.remove('alien-top-left', 'alien-bottom-left');
            alienNarrator.classList.add('alien-tracking');
            alienNarrator.style.visibility = 'hidden';

            // Wait for highlight to complete, then start tracking
            setTimeout(() => {
              const vizOverlay = document.querySelector('.music-galaxy-viz-overlay');

              const trackAlienToPlanet = () => {
                if (!alienNarrator.classList.contains('alien-tracking')) return;
                const pos = planetViz.getTopArtistPosition?.();
                if (pos && vizOverlay) {
                  const overlayRect = vizOverlay.getBoundingClientRect();
                  // Position alien to the bottom-left of the planet
                  const targetLeft = pos.x - overlayRect.left - 80;
                  const targetTop = pos.y - overlayRect.top + 20;
                  alienNarrator.style.left = `${targetLeft}px`;
                  alienNarrator.style.top = `${targetTop}px`;
                  alienNarrator.style.bottom = 'auto';
                  alienNarrator.style.right = 'auto';
                }
                if (alienNarrator.classList.contains('alien-tracking')) {
                  requestAnimationFrame(trackAlienToPlanet);
                }
              };

              trackAlienToPlanet();
              alienNarrator.style.visibility = 'visible';
              updateAlienSpeech(1, true);
            }, 800);
          }
          break;

        case 2: // Slide 3: Comparing across years
          planetViz.resetHighlights?.();

          // Highlight medium-energy band
          setTimeout(() => {
            planetViz.highlightEnergyBand?.();
            console.log('[Music Galaxy] Step 3: Highlighting medium-energy band');
          }, 300);

          // Hide annotation
          if (annotation) {
            annotation.setAttribute('aria-hidden', 'true');
            annotation.style.left = '';
            annotation.style.top = '';
          }

          // Reset alien to default position (bottom-right)
          if (alienNarrator) {
            alienNarrator.classList.remove('alien-pointing', 'alien-bottom-left', 'alien-top-left', 'alien-tracking');
            alienNarrator.style.left = '';
            alienNarrator.style.top = '';
            alienNarrator.style.bottom = '';
            alienNarrator.style.right = '';
            alienNarrator.style.visibility = 'visible';
          }
          updateAlienSpeech(2, true);
          break;

        case 3: // Slide 4: Transition to Scene 3
          // Highlight artists who appear across multiple years (sustained influence)
          setTimeout(() => {
            planetViz.highlightRepeatedArtists?.();
            console.log('[Music Galaxy] Step 4: Highlighting repeated viral artists');
          }, 300);

          // Keep alien at default position (bottom-right)
          if (alienNarrator) {
            alienNarrator.classList.remove('alien-pointing', 'alien-bottom-left', 'alien-top-left', 'alien-tracking');
            alienNarrator.style.left = '';
            alienNarrator.style.top = '';
            alienNarrator.style.bottom = '';
            alienNarrator.style.right = '';
            alienNarrator.style.visibility = 'visible';
          }
          updateAlienSpeech(3, true);

          setTimeout(() => {
            if (annotation) {
              annotation.setAttribute('aria-hidden', 'false');

              // Track annotation to top planet position
              const updateAnnotationPosition = () => {
                const pos = planetViz.getTopArtistPosition?.();
                if (pos && annotation) {
                  const vizOverlay = document.querySelector('.music-galaxy-viz-overlay');
                  const overlayRect = vizOverlay?.getBoundingClientRect() || {};

                  // pos.x/y are screen coordinates, convert to overlay-relative
                  const relativeX = pos.x - overlayRect.left;
                  const relativeY = pos.y - overlayRect.top;

                  // Position annotation near the planet (offset to bottom-left)
                  annotation.style.left = `${relativeX - 140}px`;
                  annotation.style.top = `${relativeY + 65}px`;
                }

                // Continue tracking while annotation is visible
                if (annotation.getAttribute('aria-hidden') === 'false') {
                  requestAnimationFrame(updateAnnotationPosition);
                }
              };

              updateAnnotationPosition();
            }
          }, 400);
          break;
      }
    };

    // Store reference for fullPage.js callback
    this._musicGalaxySlideHandler = handleSlideChange;

    // Initialize first slide state
    handleSlideChange(0);

    console.log('[Music Galaxy Slides] Setup complete with', slides.length, 'horizontal slides');
  }

  /**
   * Public method called by fullPage.js onSlideLeave callback
   * Handles horizontal slide transitions in Scene 2
   */
  handleMusicGalaxySlide(slideIndex) {
    if (this._musicGalaxySlideHandler) {
      this._musicGalaxySlideHandler(slideIndex);
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
  setupSceneKeyboardQA();

  // TASK 1 - Ensure scene layers exist
  ensureSceneLayers();

  // Initialize main app
  window.app = new TikTokTidesApp();
});

/**
 * Hide splash screen once app is ready
 * Called when planet viz is mounted AND fullPage is initialized
 */
function hideSplashScreen() {
  const splash = document.getElementById('tiktok-splash');
  if (splash && !splash.classList.contains('hidden')) {
    // Complete the loading bar animation
    const loaderFill = splash.querySelector('.splash-loader-fill');
    if (loaderFill) {
      loaderFill.style.width = '100%';
    }
    const loaderText = splash.querySelector('.splash-loader-text');
    if (loaderText) {
      loaderText.textContent = 'Ready!';
    }

    // Short delay for visual feedback, then hide
    setTimeout(() => {
      splash.classList.add('hidden');
      console.log('[Splash] Hidden - app ready');
    }, 400);
  }
}

// Listen for both planet viz ready AND fullPage ready
let planetReady = false;
let fullPageReady = false;

function checkAppReady() {
  if (planetReady && fullPageReady) {
    hideSplashScreen();
  }
}

// Expose for fullPage callback
window.markFullPageReady = function() {
  fullPageReady = true;
  console.log('[Splash] fullPage.js ready');
  checkAppReady();
};

// Expose for planet viz callback
window.markPlanetVizReady = function() {
  planetReady = true;
  console.log('[Splash] Planet viz ready');
  checkAppReady();
};

// Fallback: hide splash after max timeout (in case something fails)
setTimeout(() => {
  const splash = document.getElementById('tiktok-splash');
  if (splash && !splash.classList.contains('hidden')) {
    console.log('[Splash] Fallback timeout - hiding anyway');
    hideSplashScreen();
  }
}, 5000); // 5 second max wait
