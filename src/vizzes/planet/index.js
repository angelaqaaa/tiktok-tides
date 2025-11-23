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
      { value: 0.0, color: '#FF0000' },  
      { value: 0.15, color: '#FF7F00' }, 
      { value: 0.3, color: '#FFFF00' },  
      { value: 0.45, color: '#00FF00' }, 
      { value: 0.6, color: '#00FFFF' },  
      { value: 0.75, color: '#0000FF' }, 
      { value: 0.9, color: '#8B00FF' },  
      { value: 1.0, color: '#FF00FF' }   
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
      .data(planetsData, d => d.name);

    const tooltip = this.tooltip;
    const self = this;

    const planetsEnter = planets.enter()
      .append('circle')
      .attr('class', 'planet')
      .attr('cx', centerX)
      .attr('cy', centerY)
      .attr('r', 0)
      .attr('fill', d => this.danceabilityToColor(d.avgDanceability))
      .attr('stroke', '#fff')
      .attr('stroke-width', 2);

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
      });

    // Apply transitions after event handlers are set
    allPlanets
      .transition()
      .duration(1000)
      .attr('cx', d => d.x)
      .attr('cy', d => d.y)
      .attr('r', d => sizeScale(d.songCount))
      .attr('fill', d => this.danceabilityToColor(d.avgDanceability));

    planets.exit()
      .transition()
      .duration(500)
      .attr('r', 0)
      .attr('cx', centerX)
      .attr('cy', centerY)
      .remove();

    if (this.animationRunning && !this.options.reducedMotion) {
      this.animatePlanets(planetsData, centerX, centerY, sizeScale);
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
  }

  fadeOrbits() {
    this.svg.selectAll('.planet-orbit')
      .transition()
      .duration(600)
      .attr('opacity', 0);
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
   * Reset all planet highlights to normal state
   */
  resetHighlights() {
    this.svg.selectAll('.planet')
      .transition()
      .duration(400)
      .attr('opacity', 1)
      .attr('stroke-width', 2)
      .attr('stroke', '#fff');
  }
}