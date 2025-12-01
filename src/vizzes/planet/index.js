import { EventEmitter, prefersReducedMotion } from '../shared/utils.js';
import { VIZ_EVENTS, DEFAULT_OPTIONS } from '../shared/types.js';

export class PlanetViz extends EventEmitter {
  constructor() {
    super();
    this.container = null;
    this.data = null;
    this.currentYear = '2019';
    this.state = {
      currentStep: 0,
      filters: {},
      highlights: [],
      animationPaused: false,
      interactionMode: 'explore'
    };
    this.options = { ...DEFAULT_OPTIONS };
    this.mounted = false;
    this.svg = null;
    this.tooltip = null;
    this.animationRunning = true;
    this.startTime = Date.now();
    this.previousPlanetsData = null;
  }

  async init(selector, options = {}) {
    this.container = typeof selector === 'string' ?
      document.querySelector(selector) : selector;

    if (!this.container) {
      throw new Error(`Container not found: ${selector}`);
    }

    this.options = { ...this.options, ...options };

    await this.loadData();
    this.emit(VIZ_EVENTS.DATA_READY);
  }

  async loadData() {
    try {
      const [data2019, data2020, data2021, data2022] = await Promise.all([
        d3.csv('/data/TikTok_songs_2019.csv'),
        d3.csv('/data/TikTok_songs_2020.csv'),
        d3.csv('/data/TikTok_songs_2021.csv'),
        d3.csv('/data/TikTok_songs_2022.csv')
      ]);

      this.data = {
        '2019': this.processData(data2019),
        '2020': this.processData(data2020),
        '2021': this.processData(data2021),
        '2022': this.processData(data2022)
      };
    } catch (error) {
      console.error('Error loading CSV data:', error);
      throw error;
    }
  }

  processData(data) {
    const artistMap = new Map();
    
    data.forEach(song => {
      const artist = song.artist_name;
      const danceability = parseFloat(song.danceability);
      const energy = parseFloat(song.energy);
      
      if (!artistMap.has(artist)) {
        artistMap.set(artist, {
          name: artist,
          songs: [],
          danceabilities: [],
          energies: []
        });
      }
      
      const artistData = artistMap.get(artist);
      artistData.songs.push(song.track_name);
      artistData.danceabilities.push(danceability);
      artistData.energies.push(energy);
    });
    
    return Array.from(artistMap.values()).map(artist => ({
      name: artist.name,
      songCount: artist.songs.length,
      avgDanceability: d3.mean(artist.danceabilities),
      avgEnergy: d3.mean(artist.energies),
      songs: artist.songs
    }));
  }

  danceabilityToColor(danceability) {
    const colors = [
      { value: 0.0, color: '#FFFFFF' },  // White at bottom
      { value: 0.35, color: '#2af0ea' },  // TikTok blue in lower-middle
      { value: 1.0, color: '#fe2858' }   // TikTok pink at top
    ];
    
    for (let i = 0; i < colors.length - 1; i++) {
      if (danceability >= colors[i].value && danceability <= colors[i + 1].value) {
        const t = (danceability - colors[i].value) / (colors[i + 1].value - colors[i].value);
        return d3.interpolateRgb(colors[i].color, colors[i + 1].color)(t);
      }
    }
    
    return colors[colors.length - 1].color;
  }

  mount() {
    if (this.mounted) return;
    this.createSolarSystem();
    this.updateVisualization();
    this.setupYearButtons();
    this.mounted = true;
    this.emit(VIZ_EVENTS.ENTER_COMPLETE);

    // Notify splash screen that planet viz is ready
    if (window.markPlanetVizReady) {
      window.markPlanetVizReady();
    }
  }

  unmount() {
    if (!this.mounted) return;
    this.animationRunning = false;
    this.container.innerHTML = '';
    this.mounted = false;
    this.emit(VIZ_EVENTS.EXIT_COMPLETE);
  }

  destroy() {
    this.unmount();
    this.data = null;
    this.state = null;
    this.events.clear();
  }

  update(step, payload = {}) {
    this.state.currentStep = step;

    switch (step) {
      case 3:
        this.highlightTopArtists();
        break;
      case 4:
        this.switchYear('2022');
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
    if (newState.reducedMotion !== undefined) {
      this.animationRunning = !newState.reducedMotion;
    }
    this.emit(VIZ_EVENTS.STATE_CHANGE);
  }

  isDataReady() {
    return this.data !== null;
  }

  createSolarSystem() {
    this.container.innerHTML = '';

    const bbox = this.container.getBoundingClientRect();
    const width = bbox.width || 1200;
    const height = bbox.height || 800;

    this.svg = d3.select(this.container)
      .append('svg')
      .attr('width', '100%')
      .attr('height', '100%')
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('preserveAspectRatio', 'xMidYMid meet')
      .attr('role', 'img')
      .attr('aria-label', 'Planet system visualization showing artists as gravitational centers');

    this.svg.append('g').attr('id', 'orbits');
    this.svg.append('g').attr('id', 'planets');

    const defs = this.svg.append('defs');
    const sunGradient = defs.append('radialGradient')
      .attr('id', 'sunGradient');
    sunGradient.append('stop')
      .attr('offset', '0%')
      .attr('stop-color', '#FFD700');
    sunGradient.append('stop')
      .attr('offset', '50%')
      .attr('stop-color', '#FFA500');
    sunGradient.append('stop')
      .attr('offset', '100%')
      .attr('stop-color', '#FF8C00');

    this.svg.append('circle')
      .attr('class', 'sun')
      .attr('cx', width / 2)
      .attr('cy', height / 2)
      .attr('r', 40)
      .attr('fill', 'url(#sunGradient)');

    this.tooltip = d3.select('body').append('div')
      .attr('class', 'tooltip-planet')
      .style('opacity', 0)
      .style('display', 'none')
      .style('position', 'absolute')
      .style('background', 'rgba(0, 0, 0, 0.9)')
      .style('color', '#fff')
      .style('padding', '10px')
      .style('border-radius', '8px')
      .style('border', '1px solid var(--color-accent-cyan)')
      .style('pointer-events', 'none')
      .style('z-index', '1000')
      .style('font-size', '0.9rem');

    // Create danceability indicator for legend (upward-pointing arrow below gradient)
    this.legendIndicator = d3.select('.legend-gradient-wrap').append('div')
      .attr('class', 'danceability-indicator')
      .style('position', 'absolute')
      .style('bottom', '-20px')
      .style('opacity', 0)
      .style('pointer-events', 'none')
      .style('transition', 'all 0.2s ease')
      .style('font-size', '16px')
      .style('color', '#00F2EA')
      .style('text-shadow', '0 0 8px rgba(0, 242, 234, 0.8)')
      .text('▲');
  }

  updateVisualization() {
    const data = this.data[this.currentYear];
    if (!data) return;

    const bbox = this.container.getBoundingClientRect();
    const width = bbox.width || 1200;
    const height = bbox.height || 800;
    const centerX = width / 2;
    const centerY = height / 2;
    const minRadius = 80;
    const maxRadius = 350;

    // Update sun position to always stay centered
    this.svg.select('.sun')
      .attr('cx', centerX)
      .attr('cy', centerY);

    const sizeScale = d3.scaleSqrt()
      .domain([1, d3.max(data, d => d.songCount)])
      .range([8, 40]);

    const distanceScale = d3.scaleLinear()
      .domain([0, 1])
      .range([minRadius, maxRadius]);

    const angleStep = (2 * Math.PI) / data.length;

    const planetsData = data.map((d, i) => {
      const baseAngle = i * angleStep;
      const distance = distanceScale(d.avgEnergy);
      const orbitalSpeed = 0.00005 / (distance / 100);

      return {
        ...d,
        baseAngle,
        distance,
        orbitalSpeed,
        x: centerX + distance * Math.cos(baseAngle),
        y: centerY + distance * Math.sin(baseAngle)
      };
    });

    // Sort planets by size (songCount) so larger planets render first (in back)
    const sortedPlanetsData = [...planetsData].sort((a, b) => b.songCount - a.songCount);

    // Store reference to previous year's data for smooth transitions
    const previousData = this.previousPlanetsData;

    const orbits = this.svg.select('#orbits')
      .selectAll('.planet-orbit')
      .data(planetsData, d => d.name);

    orbits.enter()
      .append('circle')
      .attr('class', 'planet-orbit')
      .attr('cx', centerX)
      .attr('cy', centerY)
      .attr('r', 0)
      .attr('fill', 'none')
      .attr('stroke', 'var(--color-border-primary)')
      .attr('stroke-width', 1)
      .attr('opacity', 0.3)
      .merge(orbits)
      .transition()
      .duration(1000)
      .attr('r', d => d.distance);

    orbits.exit()
      .transition()
      .duration(500)
      .attr('r', 0)
      .remove();

    const planets = this.svg.select('#planets')
      .selectAll('.planet')
      .data(sortedPlanetsData, d => d.name);

    const tooltip = this.tooltip;
    const self = this;

    const planetsEnter = planets.enter()
      .append('circle')
      .attr('class', 'planet')
      .attr('cx', d => {
        // Check if planet existed in previous year
        if (previousData) {
          const prevPlanet = previousData.find(p => p.name === d.name);
          if (prevPlanet) return prevPlanet.x;
        }
        return centerX;
      })
      .attr('cy', d => {
        if (previousData) {
          const prevPlanet = previousData.find(p => p.name === d.name);
          if (prevPlanet) return prevPlanet.y;
        }
        return centerY;
      })
      .attr('r', d => {
        // Start with previous size if planet existed before
        if (previousData) {
          const prevPlanet = previousData.find(p => p.name === d.name);
          if (prevPlanet) return sizeScale(prevPlanet.songCount);
        }
        return 0;
      })
      .attr('fill', d => this.danceabilityToColor(d.avgDanceability))
      .attr('stroke', '#fff')
      .attr('stroke-width', 2)
      .attr('opacity', d => {
        // Returning planets start visible, new planets fade in
        if (previousData) {
          const prevPlanet = previousData.find(p => p.name === d.name);
          if (prevPlanet) return 1;
        }
        return 0;
      });

    // Merge enter and update selections, then set up event handlers
    const allPlanets = planetsEnter.merge(planets)
      .on('mouseenter', function(event, d) {
        const currentRadius = sizeScale(d.songCount);
        d3.select(this).attr('data-original-r', currentRadius);
        
        d3.select(this)
          .transition()
          .duration(200)
          .attr('stroke-width', 4)
          .attr('r', currentRadius * 1.2);
        
        tooltip
          .style('display', 'block')
          .transition()
          .duration(200)
          .style('opacity', 1);

        // Show indicator arrow on legend
        const gradientBar = document.querySelector('.legend-dance-bar');
        if (gradientBar && self.legendIndicator) {
          const barRect = gradientBar.getBoundingClientRect();
          const barWidth = barRect.width;
          // Position from left: 0.0 is at left (0%), 1.0 is at right (100%)
          // Gradient goes: White (0.0) -> Blue (0.35) -> Pink (1.0)
          const position = d.avgDanceability * barWidth;
          
          self.legendIndicator
            .style('left', `${position}px`)
            .style('opacity', 1);
        }
      })
      .on('mousemove', function(event, d) {
        tooltip
          .html(`
            <strong>${d.name}</strong>
            <div>Songs: ${d.songCount}</div>
            <div>Avg Danceability: ${d.avgDanceability.toFixed(2)}</div>
            <div>Avg Energy: ${d.avgEnergy.toFixed(2)}</div>
            <div style="margin-top: 5px; font-size: 0.8rem; color: #aaa;">
              ${d.songs.slice(0, 3).join(', ')}${d.songs.length > 3 ? '...' : ''}
            </div>
          `)
          .style('left', (event.pageX + 15) + 'px')
          .style('top', (event.pageY - 15) + 'px');
      })
      .on('mouseleave', function(event, d) {
        const currentRadius = sizeScale(d.songCount);
        
        d3.select(this)
          .transition()
          .duration(200)
          .attr('stroke-width', 2)
          .attr('r', currentRadius);
        
        tooltip
          .transition()
          .duration(200)
          .style('opacity', 0)
          .on('end', function() {
            d3.select(this).style('display', 'none');
          });

        // Hide indicator arrow
        if (self.legendIndicator) {
          self.legendIndicator.style('opacity', 0);
        }
      });

    // Apply transitions after event handlers are set
    // IMPORTANT: Reset stroke/stroke-width to clear any highlighting from previous steps
    allPlanets
      .transition()
      .duration(1000)
      .attr('cx', d => d.x)
      .attr('cy', d => d.y)
      .attr('r', d => sizeScale(d.songCount))
      .attr('fill', d => this.danceabilityToColor(d.avgDanceability))
      .attr('stroke', '#fff')
      .attr('stroke-width', 2)
      .attr('opacity', 1);

    planets.exit()
      .transition()
      .duration(500)
      .attr('opacity', 0)
      .attr('r', 0)
      .remove();

    // Store current planets data for next year transition
    this.previousPlanetsData = sortedPlanetsData.map(d => ({
      name: d.name,
      x: d.x,
      y: d.y,
      songCount: d.songCount
    }));

    if (this.animationRunning && !this.options.reducedMotion) {
      this.animatePlanets(sortedPlanetsData, centerX, centerY, sizeScale);
    }
  }

  animatePlanets(planetsData, centerX, centerY, sizeScale) {
    const animate = () => {
      if (!this.animationRunning) return;

      const elapsed = Date.now() - this.startTime;

      this.svg.select('#planets')
        .selectAll('.planet')
        .data(planetsData, d => d.name)
        .attr('cx', d => {
          const angle = d.baseAngle + (elapsed * d.orbitalSpeed);
          return centerX + d.distance * Math.cos(angle);
        })
        .attr('cy', d => {
          const angle = d.baseAngle + (elapsed * d.orbitalSpeed);
          return centerY + d.distance * Math.sin(angle);
        });

      requestAnimationFrame(animate);
    };

    animate();
  }

  setupYearButtons() {
    document.querySelectorAll('.year-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const year = e.target.dataset.year;
        this.switchYear(year);

        document.querySelectorAll('.year-btn').forEach(b => {
          b.classList.remove('active');
        });
        e.target.classList.add('active');
      });
    });
  }

  switchYear(year) {
    if (!this.data[year]) return;

    this.currentYear = year;
    this.startTime = Date.now();
    this.updateVisualization();
  }

  highlightTopArtists() {
    const yearData = this.data[this.currentYear];
    if (!yearData) return;

    const sorted = [...yearData].sort((a, b) => b.songCount - a.songCount);
    const top2 = sorted.slice(0, 2).map(d => d.name);

    this.svg.selectAll('.planet')
      .transition()
      .duration(400)
      .attr('opacity', d => top2.includes(d.name) ? 1 : 0.3);

    // Store top artist for annotation tracking
    this.topArtistName = sorted[0].name;
  }

  /**
   * Get current position of top highlighted artist for annotation
   * Returns screen-relative coordinates (accounts for SVG viewBox transformation)
   */
  getTopArtistPosition() {
    if (!this.topArtistName || !this.svg) return null;

    const planet = this.svg.selectAll('.planet')
      .filter(d => d.name === this.topArtistName);

    if (planet.empty()) return null;

    const cx = parseFloat(planet.attr('cx'));
    const cy = parseFloat(planet.attr('cy'));

    // Convert SVG viewBox coordinates to screen coordinates
    const svgNode = this.svg.node();
    const point = svgNode.createSVGPoint();
    point.x = cx;
    point.y = cy;

    // Apply the transformation matrix to get screen coordinates
    const ctm = svgNode.getScreenCTM();
    if (ctm) {
      const screenPoint = point.matrixTransform(ctm);
      return { x: screenPoint.x, y: screenPoint.y, name: this.topArtistName };
    }

    // Fallback to raw SVG coords if transform unavailable
    return { x: cx, y: cy, name: this.topArtistName };
  }

  /**
   * Highlight planets with high danceability (above threshold)
   * Dims planets below the threshold to draw attention to danceable tracks
   */
  highlightHighDanceability() {
    const threshold = 0.65; // Danceability above 0.65 is considered "high"

    this.svg.selectAll('.planet')
      .transition()
      .duration(600)
      .attr('opacity', d => d.avgDanceability >= threshold ? 1 : 0.25)
      .attr('stroke-width', d => d.avgDanceability >= threshold ? 3 : 2);
  }

  /**
   * Highlight artists who appear in multiple years (repeated viral artists)
   * Identifies artists with songs in 2+ years and highlights them
   */
  highlightRepeatedArtists() {
    // Build map of artist -> years they appear in
    const artistYears = new Map();

    Object.entries(this.data).forEach(([year, yearData]) => {
      yearData.forEach(artist => {
        if (!artistYears.has(artist.name)) {
          artistYears.set(artist.name, new Set());
        }
        artistYears.get(artist.name).add(year);
      });
    });

    // Find artists appearing in 2+ years
    const repeatedArtists = Array.from(artistYears.entries())
      .filter(([_, years]) => years.size >= 2)
      .map(([name, _]) => name);

    console.log('Repeated viral artists:', repeatedArtists);

    // Highlight repeated artists
    this.svg.selectAll('.planet')
      .transition()
      .duration(600)
      .attr('opacity', d => repeatedArtists.includes(d.name) ? 1 : 0.2)
      .attr('stroke-width', d => repeatedArtists.includes(d.name) ? 4 : 2)
      .attr('stroke', d => repeatedArtists.includes(d.name) ? '#FBEB35' : '#fff'); // Yellow glow for repeated
  }

  /**
   * Highlight planets in the high-energy / medium-danceability "sweet spot"
   * Only highlights the planets themselves with glowing effect, no band overlay
   */
  highlightEnergyBand() {
    // Define the "sweet spot" criteria:
    // High energy (0.5 to 0.8) + medium danceability (0.4 to 0.7)
    const minEnergy = 0.5;
    const maxEnergy = 0.8;
    const minDance = 0.4;
    const maxDance = 0.7;

    // Remove any existing band highlight (from previous impl)
    this.svg.selectAll('.energy-band-highlight').remove();

    // Get current year's data
    const data = this.data[this.currentYear] || [];

    // Helper to check if planet is in sweet spot
    const isInSweetSpot = (planetName) => {
      const planetData = data.find(p => p.name === planetName);
      if (!planetData) return false;
      const energy = planetData.avgEnergy || 0;
      const dance = planetData.avgDanceability || 0;
      return (energy >= minEnergy && energy <= maxEnergy) &&
             (dance >= minDance && dance <= maxDance);
    };

    // Highlight planets in the sweet spot with glowing effect, dim others
    this.svg.selectAll('.planet')
      .transition()
      .duration(600)
      .attr('opacity', d => isInSweetSpot(d.name) ? 1 : 0.15)
      .attr('stroke-width', d => isInSweetSpot(d.name) ? 5 : 2)
      .attr('stroke', d => isInSweetSpot(d.name) ? '#00F2EA' : '#fff')
      .style('filter', d => isInSweetSpot(d.name) ?
        'drop-shadow(0 0 12px rgba(0, 242, 234, 0.8)) drop-shadow(0 0 20px rgba(255, 92, 231, 0.5))' :
        'none');

    // Keep orbits normal - don't highlight bands
    this.svg.selectAll('.planet-orbit')
      .transition()
      .duration(600)
      .attr('opacity', 0.15)
      .attr('stroke', 'var(--color-border-primary)');
  }

  /**
   * Reset all planet highlights to normal state
   */
  resetHighlights() {
    // Remove energy band highlight if present
    this.svg.selectAll('.energy-band-highlight').remove();

    this.svg.selectAll('.planet')
      .transition()
      .duration(400)
      .attr('opacity', 1)
      .attr('stroke-width', 2)
      .attr('stroke', '#fff')
      .style('filter', 'none'); // Clear any glow effects

    // Reset orbits
    this.svg.selectAll('.planet-orbit')
      .transition()
      .duration(400)
      .attr('opacity', 0.3)
      .attr('stroke', 'var(--color-border-primary)');
  }
}