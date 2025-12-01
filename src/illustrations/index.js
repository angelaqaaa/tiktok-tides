// src/illustrations/index.js
import { createForestIllustration } from './forest.js';
import { createLabIllustration } from './lab.js';
const NS = 'http://www.w3.org/2000/svg';

const mounts = {
  forest: { hostId: 'scene-category',   factory: createForestIllustration },
  lab:    { hostId: 'scene-quiz',       factory: createLabIllustration }
};

let current = { scene: null, node: null };

export function installIllustrations() {
  console.log('[Illustrations] Installing illustration system...');

  // Ensure hosts exist
  ensureIllustrationHosts();

  // observe scene changes on body[data-scene]
  console.log('[Illustrations] Setting up MutationObserver for body[data-scene]');
  new MutationObserver(()=> {
    console.log('[Illustrations] Scene attribute changed');
    renderIllustration();
  }).observe(document.body, { attributes:true, attributeFilter:['data-scene'] });

  console.log('[Illustrations] Initial render...');
  renderIllustration();
}

function ensureIllustrationHosts() {
  console.log('[Illustrations] Ensuring illustration hosts (sections)...');
  ['scene-category','scene-quiz'].forEach(id=>{
    const host = document.getElementById(id);
    if (!host) {
      console.warn(`[Illustrations] Section #${id} not found!`);
      return;
    }
    console.log(`[Illustrations] Found section #${id}`);
    host.style.position = host.style.position || 'relative';
    if (!host.querySelector('.scene-illustration')) {
      const d = document.createElement('div');
      d.className = 'scene-illustration';
      d.setAttribute('aria-hidden','true');
      d.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:0;overflow:visible;';
      host.prepend(d);
      console.log(`[Illustrations] Created .scene-illustration in section #${id}`);
    } else {
      console.log(`[Illustrations] .scene-illustration already exists in section #${id}`);
    }
  });
}

function renderIllustration(){
  const scene = document.body.dataset.scene;
  console.log(`[Illustrations] renderIllustration called, scene=${scene}`);

  if (!scene || !mounts[scene]) {
    console.log(`[Illustrations] No mount for scene "${scene}", unmounting`);
    unmount();
    return;
  }

  const { hostId, factory } = mounts[scene];
  console.log(`[Illustrations] Rendering ${scene} in section #${hostId}`);

  // Get section
  const section = document.getElementById(hostId);
  if (!section) {
    console.error(`[Illustrations] Could not find section #${hostId}`);
    return;
  }

  // Ensure container exists (sections don't re-render)
  let container = section.querySelector('.scene-illustration');
  if (!container) {
    console.log(`[Illustrations] Container missing, recreating in section #${hostId}`);
    container = document.createElement('div');
    container.className = 'scene-illustration';
    container.setAttribute('aria-hidden','true');
    container.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:0;overflow:visible;';
    section.style.position = section.style.position || 'relative';
    section.prepend(container);
  }

  if (current.node) {
    console.log(`[Illustrations] Unmounting previous illustration`);
    unmount();
  }

  console.log(`[Illustrations] Creating SVG for ${scene}...`);
  current = { scene, node: factory() };
  container.appendChild(current.node);
  console.log(`[Illustrations] SVG appended to container`);

  // installLabParallax() call removed - was empty function (cleanup Dec 2025)

  // TASK 3: Attach easter eggs
  attachEasterEggs(scene, current.node);
}

function unmount(){
  if (current.node?.parentNode) current.node.parentNode.removeChild(current.node);
  current = { scene:null, node:null };
}

// ────────────────────────────────────────────────────────────────
// TASK 3 — Easter eggs
// ────────────────────────────────────────────────────────────────

function attachEasterEggs(scene, svg) {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (scene === 'forest') {
    // Add hot zone for clicks
    const hotZone = document.createElementNS(NS, 'rect');
    hotZone.setAttribute('x', '0');
    hotZone.setAttribute('y', '0');
    hotZone.setAttribute('width', '1440');
    hotZone.setAttribute('height', '300');
    hotZone.setAttribute('fill', 'transparent');
    hotZone.style.pointerEvents = 'auto';
    hotZone.style.cursor = 'pointer';
    svg.appendChild(hotZone);

    // Click to drop leaf
    hotZone.addEventListener('click', (e) => {
      const rect = svg.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 1440;
      const y = ((e.clientY - rect.top) / rect.height) * 400;
      if (y > 300) return; // Only in canopy area

      const leaf = document.createElementNS(NS, 'path');
      leaf.setAttribute('d', `M${x},${y} q-5,-10 0,-15 q5,5 0,15 z`);
      leaf.setAttribute('fill', '#2a8a5f');
      leaf.style.opacity = '0.8';
      leaf.style.transformOrigin = '50% 50%';

      if (reducedMotion) {
        leaf.style.animation = 'leafFadeOnly 1.5s ease-out forwards';
      } else {
        leaf.style.animation = 'leafFall 2s ease-out forwards';
      }

      svg.appendChild(leaf);
      setTimeout(() => leaf.remove(), 2000);
    });
  }

  if (scene === 'lab') {
    // Add hot zone over beaker area
    const hotZone = document.createElementNS(NS, 'rect');
    hotZone.setAttribute('x', '650');
    hotZone.setAttribute('y', '50');
    hotZone.setAttribute('width', '140');
    hotZone.setAttribute('height', '250');
    hotZone.setAttribute('fill', 'transparent');
    hotZone.style.pointerEvents = 'auto';
    hotZone.style.cursor = 'pointer';
    svg.appendChild(hotZone);

    const liquid = svg.querySelector('.lab-liquid');

    // Click to spawn bubbles
    hotZone.addEventListener('click', () => {
      if (reducedMotion) {
        // Flash liquid brightness
        if (liquid) {
          liquid.style.transition = 'fill 300ms ease';
          const originalFill = liquid.getAttribute('fill');
          liquid.setAttribute('fill', 'rgba(100, 255, 240, 0.6)');
          setTimeout(() => {
            liquid.setAttribute('fill', originalFill || 'rgba(0,255,224,.25)');
          }, 300);
        }
      } else {
        // Spawn 3 large bubbles
        for (let i = 0; i < 3; i++) {
          const c = document.createElementNS(NS, 'circle');
          c.setAttribute('cx', String(690 + Math.random() * 60));
          c.setAttribute('cy', String(250));
          c.setAttribute('r', String(5 + Math.random() * 4));
          c.setAttribute('fill', 'rgba(160, 210, 255, 0.9)');
          c.style.animation = `rise 1s ease-in forwards`;
          c.style.animationDelay = `${i * 0.15}s`;

          svg.appendChild(c);
          setTimeout(() => c.remove(), 1000 + i * 150);
        }
      }
    });
  }
}
