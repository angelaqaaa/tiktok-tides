// Main scrollytelling orchestrator with enhanced transitions
import '../css/tokens.css';
import '../css/base.css';
import '../css/record-player.css';
import '../css/conveyor.css';
import { MotionPatterns } from './motion/patterns.js';
import { StopwatchViz } from '../vizzes/stopwatch/index.js';
import { PlanetViz } from '../vizzes/planet/index.js';
import { CommunityViz } from '../vizzes/community/index.js';
import { RankingViz } from '../vizzes/ranking/index.js';
import { EmotionViz } from '../vizzes/emotion/index.js';
import { IngredientsViz } from '../vizzes/ingredients/index.js';
import { RecordPlayerViz } from '../vizzes/record-player/index.js';
import { ConveyorViz } from '../vizzes/conveyor/index.js';
import { initMicroInteractions } from './micro-interactions.js';
import { installIllustrations } from '../illustrations/index.js';

// Scene mapping for semantic worlds
const SCENE_MAP = {
    '#section-landing': 'cosmos',
    '#section-ignite': 'dawn',
    '#section-surge': 'orbit',
    '#section-spillover': 'city',
    '#section-fade': 'forest',
    '#section-takeaway': 'air',
    '#section-ingredients': 'lab'
};

// Scene names for keyboard shortcuts
const SCENE_NAMES = ['cosmos', 'dawn', 'orbit', 'city', 'forest', 'air', 'lab'];

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
        'section-landing': 'scene--stars',
        'section-surge': 'scene--orbits',
        'section-spillover': 'scene--grid',
        'section-fade': 'scene--canopy',
        'section-takeaway': 'scene--bubbles'
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

        // Section metadata for transitions
        this.sectionMeta = {
            'section-landing': { bg: 'bg-cosmos', name: 'Landing' },
            'section-ignite': { bg: 'bg-dawn', name: 'Ignite' },
            'section-surge': { bg: 'bg-cosmos-deep', name: 'Surge' },
            'section-spillover': { bg: 'bg-city', name: 'Spillover' },
            'section-fade': { bg: 'bg-forest', name: 'Fade/Revival' },
            'section-takeaway': { bg: 'bg-neutral', name: 'The Formula' },
            'section-ingredients': { bg: 'bg-lab', name: 'Recipe Builder' },
            'section-conveyor': { bg: 'bg-lab', name: 'Conveyor Belt' }
        };

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

        // Setup progress bar
        this.setupProgressBar();

        // Setup keyboard navigation
        this.setupKeyboardNav();

        // Setup reduced motion
        this.setupReducedMotion();

        // Setup audio controls
        this.setupAudioControls();

        // Initialize starfield
        this.initStarfield();

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
        this.vizControllers.community = new CommunityViz();
        this.vizControllers.ranking = new RankingViz();
        this.vizControllers.emotion = new EmotionViz();
        this.vizControllers.ingredients = new IngredientsViz();
        this.vizControllers.recordPlayer = new RecordPlayerViz();
        this.vizControllers.conveyor = new ConveyorViz();

        // Initialize each viz with canonical API
        for (const [key, viz] of Object.entries(this.vizControllers)) {
            try {
                // SPECIAL-CASE: Stopwatch mounts into #chart (Section 1)
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

                // For stopwatch, mount immediately and wire resize (no .viz-container in HTML)
                if (key === 'stopwatch') {
                    viz.mount();
                    viz.mounted = true;

                    // Debounced resize sized to the #chart box; keep dial circular
                    this._stopwatchResize = debounce(() => {
                        const el = document.getElementById('chart');
                        if (!el) return;
                        const { width, height } = el.getBoundingClientRect();
                        const size = Math.max(320, Math.min(width, height || width));
                        viz.resize(size, size);
                    }, 150);

                    window.addEventListener('resize', this._stopwatchResize);
                    this._stopwatchResize();

                    // Also prime step updates when the ignite section comes into view
                    const ignite = document.getElementById('section-ignite');
                    if (ignite && 'IntersectionObserver' in window) {
                        const io = new IntersectionObserver((entries) => {
                            entries.forEach((e) => {
                                if (e.isIntersecting && e.intersectionRatio > 0.5) {
                                    viz.update(1);
                                    setTimeout(() => viz.update(2), 1600);
                                }
                            });
                        }, { threshold: 0.5 });
                        io.observe(ignite);
                    }
                }

                if (key === 'recordPlayer') {
                    viz.mount?.();
                    viz.mounted = true;
                }

                // Setup event listeners for micro-interactions
                this.setupVizEvents(key, viz);
            } catch (err) {
                console.warn(`Failed to init ${key}:`, err);
            }
        }
    }

    setupVizEvents(key, viz) {
        // Community: Audio preview on hover
        if (key === 'community') {
            viz.on('onHoverAudio', (data) => {
                if (!this.audioMuted) {
                    this.previewAudio(data.soundId, 2000); // 2 second preview
                }
            });
        }

        // Ranking: Leaf reveal
        if (key === 'ranking') {
            viz.on('onLeafReveal', (data) => {
                this.showDetailPanel(data);
            });
        }

        // Emotion: Drawer open
        if (key === 'emotion') {
            viz.on('bubbleClick', (data) => {
                this.openEmotionDrawer(data);
            });
        }

        // Ingredients: Quiz events
        if (key === 'ingredients') {
            viz.on('quizOpened', (data) => {
                this.announce(`Testing ${data.ingredient} impact`);
            });
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

                // Handle scroll steps
                if (entry.target.classList.contains('scroll-step') && entry.isIntersecting) {
                    const step = parseInt(entry.target.dataset.step);
                    this.handleStepUpdate(step, entry.target);
                }
            });
        }, options);

        // Observe all sections
        document.querySelectorAll('.section').forEach(section => {
            this.observer.observe(section);
        });

        // Observe all scroll steps
        document.querySelectorAll('.scroll-step').forEach(step => {
            this.observer.observe(step);
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

        // Transition between sections
        this.transitionSections(prevSection, sectionId);

        // Mount visualization if needed (sections that use .viz-container)
        const vizContainer = section.querySelector('.viz-container');
        if (vizContainer) {
            const vizType = vizContainer.dataset.viz;
            const viz = this.vizControllers[vizType];
            if (viz && !viz.mounted) {
                viz.mount();
                viz.mounted = true;
            }
        }

        // Special-case: ensure Stopwatch (section-ignite) is mounted & step-updated
        if (sectionId === 'section-ignite') {
            const sw = this.vizControllers.stopwatch;
            if (sw && !sw.mounted) {
                sw.mount();
                sw.mounted = true;
            }
            // Trigger a gentle narrative step pass
            sw?.update(1);
            setTimeout(() => sw?.update(2), 1600);
            this._stopwatchResize?.(); // ensure it fits if coming from different viewport
        }

        // TASK 4 - Enhanced live region announcement with scene info
        const meta = this.sectionMeta[sectionId];
        const scene = document.body.dataset.scene;
        if (meta) {
            const sceneName = scene ? ` - ${scene} scene` : '';
            this.announce(`${meta.name} section entered${sceneName}`);
            console.log(`[Section] Entered: ${meta.name}${sceneName}`);
        }

        // Animate KPIs
        this.animateKPIs(section);
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

        // Smooth transition via CSS
        document.body.style.transition = 'background 600ms cubic-bezier(0.4, 0.0, 0.2, 1)';
    }

    handleStepUpdate(step, element) {
        const section = element.closest('.section');
        const vizContainer = section?.querySelector('.viz-container');

        if (vizContainer) {
            const vizType = vizContainer.dataset.viz;
            const viz = this.vizControllers[vizType];

            if (viz) {
                viz.update(step, {
                    transition: {
                        duration: 400,
                        easing: 'cubic-bezier(0.4, 0.0, 0.2, 1)'
                    }
                });
            }
        } else if (section?.id === 'section-ignite') {
            // Allow scroll-steps to target stopwatch even without .viz-container
            const sw = this.vizControllers.stopwatch;
            sw?.update(step, {
                transition: {
                    duration: 400,
                    easing: 'cubic-bezier(0.4, 0.0, 0.2, 1)'
                }
            });
        }

        // Update annotation rail if present
        const annotation = section?.querySelector('.annotation');
        if (annotation) {
            this.updateAnnotation(annotation, step);
        }
    }

    transitionSections(from, to) {
        // DISABLED: Transitions were hiding visualizations
        // Scene backgrounds provide enough narrative transition
        // Visualizations stay visible and functional throughout scroll

        // Optional: Call viz-specific transition hooks if they exist
        // These are internal to viz and don't affect DOM elements
        if (from && to) {
            const fromVizId = from.replace('section-', '');
            const toVizId = to.replace('section-', '');

            // Notify viz controllers they can run internal transitions
            const fromViz = this.vizControllers[fromVizId];
            const toViz = this.vizControllers[toVizId];

            fromViz?.onTransitionOut?.();
            toViz?.onTransitionIn?.();
        }
    }

    updateAnnotation(annotation, step) {
        const messages = {
            1: 'Optimal duration: 15-30 seconds',
            2: 'First hour engagement crucial',
            3: 'Top artists dominate the soundscape',
            4: '2022 saw the most diverse trends',
            5: 'BookTok drives publishing industry',
            6: 'Sound trends last 6-12 weeks',
            7: 'Engagement varies by community',
            8: '30% of trends see revival',
            9: 'Positive emotions drive shares',
            10: 'Anger surprisingly viral',
            11: 'Key ingredients identified',
            12: 'Your recipe ready to test'
        };

        if (messages[step]) {
            annotation.textContent = messages[step];
        }
    }

    updateNavigation(sectionId) {
        // Update nav links aria-current
        document.querySelectorAll('.nav-links a').forEach(link => {
            const href = link.getAttribute('href').substring(1);
            const mappedSection = href === 'section-ignite' ? 'section-ignite' :
                href === 'section-surge' ? 'section-surge' :
                    href === 'section-spillover' ? 'section-spillover' :
                        href === 'section-fade' ? 'section-fade' :
                            href === 'section-takeaway' ? 'section-takeaway' :
                                href === 'section-ingredients' ? 'section-ingredients' :
                                    href === 'section-conveyor' ? 'section-conveyor' :
                                        href;
            link.setAttribute('aria-current', mappedSection === sectionId ? 'true' : 'false');
        });
    }

    setupNavigation() {
        // Smooth scroll for nav links
        document.querySelectorAll('.nav-links a').forEach(link => {
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
            // Number keys 1-7 jump to sections
            if (e.key >= '1' && e.key <= '7') {
                const sections = [
                    'section-ignite',
                    'section-surge',
                    'section-spillover',
                    'section-fade',
                    'section-takeaway',
                    'section-ingredients',
                    'section-conveyor'
                ];
                const sectionId = sections[parseInt(e.key) - 1];
                const target = document.getElementById(sectionId);
                if (target) {
                    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }

            // Escape closes modals/drawers
            if (e.key === 'Escape') {
                this.closeAllOverlays();
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

    setupAudioControls() {
        // Audio mute toggle
        const muteToggle = document.querySelector('.audio-mute-toggle');
        if (muteToggle) {
            muteToggle.addEventListener('click', () => {
                this.audioMuted = !this.audioMuted;
                const muteIcon = muteToggle.querySelector('.mute-icon');
                const unmuteIcon = muteToggle.querySelector('.unmute-icon');

                if (this.audioMuted) {
                    muteIcon.style.display = 'inline';
                    unmuteIcon.style.display = 'none';
                } else {
                    muteIcon.style.display = 'none';
                    unmuteIcon.style.display = 'inline';
                }

                this.announce(this.audioMuted ? 'Audio muted' : 'Audio unmuted');
            });
        }

        // Audio item hovers
        document.querySelectorAll('.audio-item').forEach(item => {
            item.addEventListener('mouseenter', () => {
                if (!this.audioMuted) {
                    const soundId = item.dataset.sound;
                    this.previewAudio(soundId, 2000);
                }
            });
        });
    }

    previewAudio(soundId, duration) {
        // Stub for audio preview - would play actual audio file
        console.log(`Playing 2s preview of ${soundId}`);

        // Visual feedback
        const item = document.querySelector(`[data-sound="${soundId}"]`);
        if (item) {
            item.classList.add('playing');
            setTimeout(() => {
                item.classList.remove('playing');
            }, duration);
        }
    }

    setupPlayerIntro() {
        // Start button removed - player is now always unlocked
        const playerWrapper = document.querySelector('.record-player-wrapper');
        if (playerWrapper) {
            playerWrapper.removeAttribute('data-player-locked');
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

            if (!this.prefersReducedMotion()) {
                panel.style.transition = 'all 400ms cubic-bezier(0.4, 0.0, 0.2, 1)';
                panel.style.transform = 'translateX(0)';
                panel.style.opacity = '1';
            }
        }
    }

    openEmotionDrawer(data) {
        const drawer = document.querySelector('.detail-drawer');
        if (drawer) {
            const sparkline = drawer.querySelector('.sparkline-container');
            const phrases = drawer.querySelector('.example-phrases');

            // Update content
            sparkline.innerHTML = `<canvas width="200" height="50"></canvas>`;
            phrases.innerHTML = `<p>Example: "${data.word}" in context</p>`;

            drawer.setAttribute('aria-hidden', 'false');

            // Focus management
            drawer.querySelector('.drawer-close').focus();
        }
    }

    animateKPIs(section) {
        const kpis = section.querySelectorAll('.kpi-value');

        kpis.forEach((kpi, index) => {
            const target = parseFloat(kpi.dataset.target);
            if (isNaN(target)) return;

            const duration = 1000;
            const delay = index * 100;

            setTimeout(() => {
                this.animateNumber(kpi, 0, target, duration);
            }, delay);
        });
    }

    animateNumber(element, start, end, duration) {
        const startTime = Date.now();
        const isFloat = end % 1 !== 0;

        const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = this.easeOutCubic(progress);
            const current = start + (end - start) * eased;

            element.textContent = isFloat ? current.toFixed(1) : Math.round(current);

            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };

        animate();
    }

    easeOutCubic(t) {
        return 1 - Math.pow(1 - t, 3);
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

    closeAllOverlays() {
        // Close detail drawer
        const drawer = document.querySelector('.detail-drawer');
        if (drawer) {
            drawer.setAttribute('aria-hidden', 'true');
        }

        // Close quiz modal
        const modal = document.querySelector('.quiz-modal');
        if (modal) {
            modal.classList.remove('active');
            modal.setAttribute('aria-hidden', 'true');
        }

        // Close detail panel
        const panel = document.querySelector('.detail-panel');
        if (panel) {
            panel.setAttribute('aria-hidden', 'true');
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
    window.app.setupPlayerIntro();
});
