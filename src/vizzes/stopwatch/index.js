// Stopwatch Visualization Adapter - Wraps legacy implementation with Canonical API
import { EventEmitter, prefersReducedMotion, getDataPath } from '../shared/utils.js';
import { VIZ_EVENTS, DEFAULT_OPTIONS } from '../shared/types.js';

export class StopwatchViz extends EventEmitter {
  constructor() {
    super();
    this.container = null;
    // Will hold [[binEndSeconds, meanPlayCount, meanDuration], ...] sorted ascending by binEndSeconds.
    // Durations are grouped into 10s bins: 0–10, 10–20, 20–30, ...
    this.data = null;
    this.rawData = null;      // Optional: raw CSV rows (if needed later)
    this.state = {
      currentStep: 0,
      filters: {},
      highlights: [],
      animationPaused: false,
      interactionMode: 'explore'
    };
    this.options = { ...DEFAULT_OPTIONS, reducedMotion: prefersReducedMotion() };
    this.mounted = false;

    // binning config (seconds)
    this.binSize = 10;

    // D3 handles
    this.svg = null;
    this.g = null;
    this.paths = null;
    this.buttonRect = null;
    this.crownRect = null;
    this.labelsG = null; // group for labels above arcs

    // scales & layout
    this.angleScale = null;
    this.rScale = null;

    // geometry cache
    this._geom = {
      width: 0,
      height: 0,
      ringOuter: 0,
      ringInner: 0,
      btnY: 0,
      crownY: 0,
      R: 0,
      // Reduced margin so the stopwatch appears larger within the container
      margin: 24,
      arcThickness: 8 // default; will be overwritten in render()
    };

    // tooltip ref
    this.tooltip = null;
  }

  async init(selector, options = {}) {
    this.container = typeof selector === 'string'
      ? document.querySelector(selector)
      : selector;

    if (!this.container) {
      throw new Error(`Container not found: ${selector}`);
    }

    this.options = { ...this.options, ...options };

    // Load CSV-backed data for MVP
    await this.loadData();
    this.emit(VIZ_EVENTS.DATA_READY);
  }

  // --- Data loading (with 10s binning) ---------------------------------------
  async loadData() {
    try {
      const [data] = await Promise.all([
        d3.csv(getDataPath('data/cleaned_tiktok_data.csv'), d3.autoType),
      ]);
      this.rawData = data;

      // Keep rows with finite duration & playCount, and duration <= 60s
      const rows = data.filter(d =>
        Number.isFinite(d?.['videoMeta/duration']) &&
        Number.isFinite(d?.playCount) &&
        +d['videoMeta/duration'] <= 60
      );

      const binSize = this.binSize;
      const maxDuration = 60;
      const maxBinIndex = maxDuration / binSize - 1; // 0..5 for 0–60

      // Group directly into bins of width 10 seconds:
      // 0–10s  -> binEnd = 10
      // 10–20s -> binEnd = 20
      // ...
      // 50–60s -> binEnd = 60
      let binned = d3.rollups(
        rows,
        v => {
          const meanPlayCount = d3.mean(v, d => +d.playCount);
          const meanDuration = d3.mean(v, d => +d['videoMeta/duration']);
          return { meanPlayCount, meanDuration };
        },
        d => {
          const durRaw = +d['videoMeta/duration'];
          const dur = Math.max(0, Math.min(durRaw, maxDuration)); // clamp
          let binIndex = Math.floor(dur / binSize);
          // Ensure 60s stays in the last bin (50–60)
          binIndex = Math.min(binIndex, maxBinIndex);
          const binEnd = (binIndex + 1) * binSize;
          return binEnd; // numeric key: 10, 20, 30, 40, 50, 60
        }
      )
        // Flatten to [binEnd, meanPlayCount, meanDuration]
        .map(([binEnd, stats]) => [binEnd, stats.meanPlayCount, stats.meanDuration])
        .filter(d =>
          Number.isFinite(d[0]) && // binEnd
          Number.isFinite(d[1]) && // meanPlayCount
          Number.isFinite(d[2])    // meanDuration
        );

      // Sort by binEnd ascending for consistent angle mapping
      binned.sort((a, b) => d3.ascending(a[0], b[0]));

      // this.data = [[binEndSec, meanPlayCount, meanDuration], ...]
      this.data = binned;
    } catch (error) {
      console.error('Error loading CSV data:', error);
      throw error;
    }
  }

  // --- Lifecycle -------------------------------------------------------------
  mount() {
    if (this.mounted) return;
    this.render();
    this.mounted = true;
    this.emit(VIZ_EVENTS.ENTER_COMPLETE);
  }

  unmount() {
    if (!this.mounted) return;
    if (this.container) this.container.innerHTML = '';
    if (this.tooltip) {
      this.tooltip.remove();
      this.tooltip = null;
    }
    this.svg = null;
    this.g = null;
    this.paths = null;
    this.buttonRect = null;
    this.crownRect = null;
    this.labelsG = null;
    this.mounted = false;
    this.emit(VIZ_EVENTS.EXIT_COMPLETE);
  }

  destroy() {
    this.unmount();
    this.data = null;
    this.rawData = null;
    this.state = null;
    this.events.clear();
  }

  // --- API -------------------------------------------------------------------
  update(step, payload = {}) {
    this.state.currentStep = step;

    switch (step) {
      case 1:
        // Highlight the “optimal” window used in the original viz (15–30s)
        this.highlightDurationRange(15, 30);
        break;
      case 2:
        this.showVelocityMetrics();
        break;
      default:
        // reset highlighting
        this.highlightDurationRange(-Infinity, Infinity);
        break;
    }

    this.emit(VIZ_EVENTS.UPDATE_COMPLETE);
  }

  resize(width, height) {
    this.options.width = width;
    this.options.height = height;
    if (this.mounted) {
      this.render();
    }
    this.emit(VIZ_EVENTS.RESIZE);
  }

  getState() {
    return { ...this.state };
  }

  setState(newState) {
    this.state = { ...this.state, ...newState };
    this.emit(VIZ_EVENTS.STATE_CHANGE);
  }

  isDataReady() {
    return Array.isArray(this.data) && this.data.length > 0;
  }

  // --- Rendering -------------------------------------------------------------
  render() {
    if (!this.isDataReady()) return;

    // Clear container
    this.container.innerHTML = '';

    // Container sizing
    const bbox = this.container.getBoundingClientRect();
    const size = Math.min(bbox.width || 800, bbox.height || 800) || 800;
    const width = size;
    const height = size;
    const margin = this._geom.margin;

    // SVG root
    this.svg = d3.select(this.container)
      .append('svg')
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('role', 'img')
      .attr(
        'aria-label',
        'Stopwatch visualization showing how video duration relates to engagement. ' +
        'The animation only plays when the top button is pressed.'
      );

    // defs for gradients, text paths, etc.
    const defs = this.svg.append('defs');

    // Arc fill gradient (shared by all sectors)
    const arcGradient = defs.append('linearGradient')
      .attr('id', 'sector-gradient')
      .attr('x1', '0%')
      .attr('y1', '0%')
      .attr('x2', '100%')
      .attr('y2', '0%');

    arcGradient.append('stop')
      .attr('offset', '0%')
      .attr('stop-color', '#2dccd3');

    arcGradient.append('stop')
      .attr('offset', '100%')
      .attr('stop-color', '#f1204a');

    // Centering group
    this.g = this.svg.append('g')
      .attr('transform', `translate(${width / 2}, ${height / 2})`);

    // Radii
    const R = Math.min(width, height) / 2 - margin;
    const ringOuter = R;
    const ringInner = R * 0.9;
    const sectorMaxRadius = R * 0.78;
    const sectorMinRadius = Math.max(12, R * 0.12);

    // Perimeter arc thickness & store it (THICKER ARCS)
    const arcThickness = Math.max(14, (sectorMaxRadius - sectorMinRadius) * 0.16);

    // Save geom
    Object.assign(this._geom, {
      width,
      height,
      R,
      ringOuter,
      ringInner,
      arcThickness
    });

    // Stopwatch chrome (with solid circular background)
    // Background disc behind the ring so the stopwatch face has a solid fill
    this.g.append('circle')
      .attr('r', ringOuter)
      .attr('class', 'stopwatch-bg')
      .attr('fill', 'var(--stopwatch-bg, #050510)')
      .attr('stroke', 'none');

    this.g.append('circle')
      .attr('r', ringOuter)
      .attr('class', 'stopwatch-ring');

    this.g.append('circle')
      .attr('r', ringInner)
      .attr('class', 'stopwatch-inner');

    // Top button & crown (button clickable to replay)
    const btnW = R * 0.25, btnH = R * 0.1, btnR = 8;
    const btnY = -ringOuter - btnH - 10;
    this._geom.btnY = btnY;

    this.buttonRect = this.g.append('rect')
      .attr('x', -btnW / 2)
      .attr('y', btnY)
      .attr('width', btnW)
      .attr('height', btnH)
      .attr('rx', btnR)
      .attr('class', 'stopwatch-button clickable')
      .attr('tabindex', 0) // keyboard access
      .attr('role', 'button')
      .attr('aria-label', 'Play or replay the animation');

    this.buttonRect.append('title').text('Click to play or replay the animation');

    const crownW = R * 0.08, crownH = R * 0.12, crownR = 5;
    const crownY = -ringOuter - crownH / 2 + 2;
    this._geom.crownY = crownY;

    this.crownRect = this.g.append('rect')
      .attr('x', -crownW / 2)
      .attr('y', crownY)
      .attr('width', crownW)
      .attr('height', crownH)
      .attr('rx', crownR)
      .attr('class', 'stopwatch-button');

    // 60 ticks (bold every 5)
    const ticks = this.g.append('g').attr('aria-hidden', true);
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * 2 * Math.PI - Math.PI / 2; // 12 o'clock origin
      const isMajor = i % 5 === 0;
      const r1 = ringInner - (isMajor ? 10 : 6);
      const r2 = ringInner - 2;
      ticks.append('line')
        .attr('x1', r1 * Math.cos(a))
        .attr('y1', r1 * Math.sin(a))
        .attr('x2', r2 * Math.cos(a))
        .attr('y2', r2 * Math.sin(a))
        .attr('class', isMajor ? 'tick-major' : 'tick-minor');
    }

    // Tooltip (single shared instance) – force it above everything
    if (!this.tooltip) {
      this.tooltip = d3.select('body')
        .append('div')
        .attr('class', 'tooltip')
        .style('opacity', 0)
        .style('position', 'fixed')
        .style('pointer-events', 'none')
        .style('z-index', 9999);
    } else {
      this.tooltip
        .style('opacity', 0)
        .style('position', 'fixed')
        .style('pointer-events', 'none')
        .style('z-index', 9999);
    }

    // Scales
    this.angleScale = d3.scaleLinear().domain([0, 60]).range([0, 2 * Math.PI]);
    const pcExtent = d3.extent(this.data, d => d[1]) || [0, 1];
    const sectorMinR = sectorMinRadius;
    const sectorMaxR = sectorMaxRadius;
    this.rScale = d3.scaleSqrt()
      .domain(pcExtent)
      .range([sectorMinR, sectorMaxR])
      .nice();

    // Sectors group (arcs)
    const sectorsG = this.g.append('g').attr('aria-label', 'sectors');

    // Labels group (above sectors)
    this.labelsG = this.g.append('g')
      .attr('class', 'labels-layer')
      .attr('pointer-events', 'none');

    // Create ring-shaped arcs (only perimeter/arc, not full wedge from center)
    const arcFor = outerR => d3.arc()
      .innerRadius(outerR - arcThickness)
      .outerRadius(outerR)
      .cornerRadius(arcThickness / 2)
      .startAngle(0); // start at 12 o'clock

    this.paths = sectorsG.selectAll('path.sector')
      .data(this.data) // data is ascending by binEnd
      .join('path')
      .attr('class', 'sector')
      .attr('fill', 'url(#sector-gradient)')
      .attr('stroke', 'none')
      // default opacity = hover opacity (fully opaque)
      .style('opacity', 1)
      // Z-order: longest durations at the bottom, shortest on top
      .sort((a, b) => d3.descending(a[0], b[0])); // larger binEnd first in DOM (drawn underneath)

    // Draw sectors in their final static state (no auto animation)
    this.paths.attr('d', d => {
      const outerR = this.rScale(d[1]);
      const meanDuration = d[2];
      const end = this.angleScale(meanDuration); // use meanDuration instead of binEnd
      return arcFor(outerR).endAngle(end)(d);
    });

    // Helper: format playCount in a simplified way (e.g., 6M, 15K)
    const formatPlayCountShort = (value) => {
      if (!Number.isFinite(value)) return '';
      const abs = Math.abs(value);
      if (abs >= 1e9) return `${Math.round(value / 1e9)}B`;
      if (abs >= 1e6) return `${Math.round(value / 1e6)}M`;
      if (abs >= 1e3) return `${Math.round(value / 1e3)}K`;
      return d3.format(',.0f')(value);
    };

    // PLAYCOUNT LABELS ALONG ARCS (curved text)
    const labelGroups = this.labelsG.selectAll('g.bin-label-group')
      .data(this.data)
      .join('g')
      .attr('class', 'bin-label-group');

    labelGroups.each((d, i, nodes) => {
      const outerR = this.rScale(d[1]);
      const innerR = outerR - arcThickness;

      // Move label slightly "down" inside the ring towards the centre
      const labelOffset = 6; // tweak as needed (px)
      const rLabel = innerR + arcThickness / 2 - labelOffset;

      const meanDuration = d[2];
      const endAngle = this.angleScale(meanDuration);
      const pathId = `bin-label-path-${d[0]}`;

      // Create an (invisible) arc path at the adjusted label radius
      const labelArc = d3.arc()
        .innerRadius(rLabel)
        .outerRadius(rLabel)
        .startAngle(0)
        .endAngle(endAngle);

      defs.append('path')
        .attr('id', pathId)
        .attr('d', labelArc())
        .attr('fill', 'none')
        .attr('stroke', 'none');

      const gNode = d3.select(nodes[i]);

      const labelText = gNode.append('text')
        .attr('class', 'bin-label')
        .attr('text-anchor', 'middle')
        .attr('alignment-baseline', 'middle');

      labelText.append('textPath')
        .attr('href', `#${pathId}`)
        // Shift towards the start of the arc so it's on the "left" side
        .attr('startOffset', '25%')
        .text(() => {
          const avgPlayCount = d[1];
          return formatPlayCountShort(avgPlayCount);
        });
    });

    // Initial label visibility:
    // - If reduced motion: show immediately (no animations).
    // - Otherwise: hide; they will fade in after the first animation completes.
    if (this.options.reducedMotion) {
      this.labelsG.style('opacity', 1);
    } else {
      this.labelsG.style('opacity', 0);
    }

    // Tooltips & hover (only custom HTML tooltip, no SVG <title> on arcs)
    this.paths
      .on('pointerenter', (event, d) => {
        const [binEnd, avgPC, meanDuration] = d;
        const binSize = this.binSize || 10;
        const binStart = binEnd - binSize;

        this.tooltip
          .style('opacity', 1)
          .html(
            `<strong>Duration bin:</strong> ${binStart}s–${binEnd}s<br>` +
            `<strong>Avg duration in bin:</strong> ${d3.format('.1f')(meanDuration)}s<br>` +
            `<strong>Avg playCount:</strong> ${d3.format(',.2f')(avgPC)}`
          )
          .style('left', `${event.clientX}px`)
          .style('top', `${event.clientY - 18}px`);
        // opacity already 1, but keep transition for consistency
        d3.select(event.currentTarget).transition().duration(120).style('opacity', 1);
      })
      .on('pointermove', (event) => {
        this.tooltip
          .style('left', `${event.clientX}px`)
          .style('top', `${event.clientY - 18}px`);
      })
      .on('pointerleave', (event) => {
        this.tooltip.style('opacity', 0);
        // return to fully opaque instead of semi-transparent
        d3.select(event.currentTarget).transition().duration(120).style('opacity', 1);
      });

    // Center dot
    this.g.append('circle').attr('r', 4.5).attr('class', 'center-dot');

    // Fixed labels at 15s, 30s, 45s
    [15, 30, 45].forEach(sec => {
      const a = this.angleScale(sec) - Math.PI / 2;
      const rLab = ringOuter - 14;
      this.g.append('text')
        .attr('class', 'time-label')
        .attr('x', rLab * Math.cos(a))
        .attr('y', rLab * Math.sin(a))
        .text(`${sec}`);
    });

    // Button handlers (click & keyboard)
    this.buttonRect
      .on('click', () => { this._pressAnimation(); this.runAnimation(true); })
      .on('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { this._pressAnimation(); this.runAnimation(true); }
      });

    // NOTE: No initial auto animation. Animation only runs on button interaction.
  }

  // --- Animations ------------------------------------------------------------
  runAnimation(fromUser = false) {
    if (!this.paths || this.options.reducedMotion) return;

    const sweepDuration = 300; // ms per sector
    const sweepGap = 40;       // ms between sectors
    const numArcs = this.paths.size ? this.paths.size() : this.data.length || 0;

    const { arcThickness } = this._geom;

    // Hide labels during animation; they'll reappear when all arcs finish.
    if (this.labelsG) {
      this.labelsG.interrupt().style('opacity', 0);
    }

    // Use same ring-shaped arcs for animation as in render()
    const arcFor = outerR => d3.arc()
      .innerRadius(outerR - arcThickness)
      .outerRadius(outerR)
      .cornerRadius(arcThickness / 2)
      .startAngle(0);

    // Reset & animate in order of current selection:
    // due to .sort(descending) in render(), index 0 = largest binEnd,
    // so the longest durations animate first and are visually underneath.
    this.paths.interrupt();
    this.paths.attr('d', d => arcFor(this.rScale(d[1])).endAngle(0)(d));

    this.paths
      .transition()
      .delay((d, i) => i * (sweepDuration + sweepGap)) // selection is already longest -> shortest
      .duration(sweepDuration)
      .ease(d3.easeCubicOut)
      .attrTween('d', d => {
        const outerR = this.rScale(d[1]);
        const meanDuration = d[2];
        const end = this.angleScale(meanDuration); // use meanDuration
        const interp = d3.interpolateNumber(0, end);
        const arc = arcFor(outerR);
        return t => arc.endAngle(interp(t))(d);
      })
      // Ensure arcs that start their animation later end up on top:
      // each path moves to the front when its animation starts,
      // so the last-animated arcs are the final topmost layer.
      .on('start', function () {
        if (this.parentNode) {
          this.parentNode.appendChild(this);
        }
      });

    // Schedule labels to fade in AFTER the last arc finishes.
    if (!this.options.reducedMotion && this.labelsG && numArcs > 0) {
      const totalAnimTime =
        (numArcs - 1) * (sweepDuration + sweepGap) + sweepDuration;

      this.labelsG
        .interrupt()
        .transition()
        .delay(totalAnimTime + 80) // small buffer so it feels "after" everything
        .duration(250)
        .style('opacity', 1);
    }

    if (fromUser) this.emit(VIZ_EVENTS.INTERACTION); // optional signal
  }

  _pressAnimation() {
    if (!this.buttonRect || !this.crownRect) return;
    const { btnY, crownY } = this._geom;
    const pressDyBtn = 10;
    const pressDyCrown = 5;

    this.buttonRect.interrupt()
      .transition().duration(80).attr('y', btnY + pressDyBtn)
      .transition().duration(280).ease(d3.easeElastic.period(0.3)).attr('y', btnY);

    this.crownRect.interrupt()
      .transition().duration(80).attr('y', crownY + pressDyCrown)
      .transition().duration(280).ease(d3.easeElastic.period(0.3)).attr('y', crownY);
  }

  // --- Interaction helpers ---------------------------------------------------
  highlightDurationRange(min, max) {
    if (!this.paths) return;

    const binSize = this.binSize || 10;

    this.paths
      .interrupt()
      .transition()
      .duration(180)
      .style('opacity', d => {
        const binEnd = d[0];
        const binStart = binEnd - binSize;
        // Highlight if bin overlaps [min, max]
        const overlaps = binEnd >= min && binStart <= max;
        return overlaps ? 1 : 0.25;
      })
      .attr('stroke', d => {
        const binEnd = d[0];
        const binStart = binEnd - binSize;
        const overlaps = binEnd >= min && binStart <= max;
        return overlaps ? 'var(--color-glint)' : 'none';
      })
      .attr('stroke-width', d => {
        const binEnd = d[0];
        const binStart = binEnd - binSize;
        const overlaps = binEnd >= min && binStart <= max;
        return overlaps ? 2.5 : 0;
      });
  }

  showVelocityMetrics() {
    // Placeholder for additional overlays if needed later
    // (kept to preserve API parity)
    // e.g., could draw a second set of arcs or markers.
    // For MVP: no-op with a debug statement.
    // eslint-disable-next-line no-console
    console.log('Velocity metrics overlay (placeholder)');
  }

  /**
   * Highlight short clips (<15 seconds)
   * For guided exploration of duration bands
   */
  highlightShortClips() {
    this.highlightDurationRange(0, 15);
    console.log('[Stopwatch] Highlighting short clips (<15s)');
  }

  /**
   * Highlight mid-length clips (15-30 seconds)
   * This is the "sweet spot" for engagement in the dataset
   */
  highlightMidClips() {
    this.highlightDurationRange(15, 30);
    console.log('[Stopwatch] Highlighting mid-length clips (15-30s)');
  }

  /**
   * Highlight long clips (>30 seconds)
   * Shows less common longer-form content
   */
  highlightLongClips() {
    this.highlightDurationRange(30, Infinity);
    console.log('[Stopwatch] Highlighting long clips (>30s)');
  }

  /**
   * Reset all duration highlights to show full dataset
   */
  resetHighlights() {
    this.highlightDurationRange(-Infinity, Infinity);
    console.log('[Stopwatch] Reset all highlights');
  }

  playGlowSweep() {
    // Optional special effect for transitions (kept from legacy API)
    if (!this.g || this.options.reducedMotion) return;

    const sweep = this.g.append('line')
      .attr('x1', 0)
      .attr('y1', 0)
      .attr('x2', 0)
      .attr('y2', -this._geom.R * 0.8)
      .attr('stroke', 'var(--color-glint)')
      .attr('stroke-width', 3)
      .attr('opacity', 0.8);

    sweep
      .transition()
      .duration(2000)
      .ease(d3.easeLinear)
      .attrTween('transform', () => {
        return t => `rotate(${t * 360})`;
      })
      .on('end', () => sweep.remove());
  }
}
