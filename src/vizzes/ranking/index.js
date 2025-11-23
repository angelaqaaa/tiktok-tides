import { EventEmitter, prefersReducedMotion } from '../shared/utils.js';
import { VIZ_EVENTS, DEFAULT_OPTIONS } from '../shared/types.js';
import { RankingBubbleChart } from './rankingBubbleChart.js';

export class RankingViz extends EventEmitter {
  constructor() {
    super();
    this.container = null;
    this.data = null;
    this.state = {
      currentStep: 0,
      filters: { topN: 6 },
      highlights: [],
      animationPaused: false,
      interactionMode: 'explore',
    };
    this.options = { ...DEFAULT_OPTIONS };
    this.mounted = false;
    this.svg = null;
    this.simulation = null;
    this.popup = null;
  }

  async init(selector, options = {}) {
    this.container = typeof selector === 'string' ?
      document.querySelector(selector) : selector;

    if (!this.container) {
      throw new Error(`Container not found: ${selector}`);
    }

    this.options = { ...this.options, ...options };

    // Load dataset
    await this.loadData();
    this.emit(VIZ_EVENTS.DATA_READY);
  }

  async loadData() {
    try {
      const rawData = await d3.csv('/data/youtube_shorts_tiktok_trends_2025.csv'); // load csv

      const categoryViews = {};

      rawData.forEach(row => {
        const category = row.category;
        const views = parseInt(row.views, 10);

        if (category in categoryViews) {
          categoryViews[category] += views;
        } else {
          categoryViews[category] = views;
        }
      });

      // convert the object to an array of {category, views} objects
      const categoryArray = Object.keys(categoryViews).map(category => ({
        category,
        views: categoryViews[category]
      }));

      const topCategories = categoryArray.sort((a, b) => b.views - a.views).slice(0, 6);

      // update the data for viz
      this.data = {
        categories: topCategories.map((d, index) => ({
          rank: index + 1,
          category: d.category,
          color: this.getCategoryColor(d.category),
          views: d.views
        }))
      };

      this.emit(VIZ_EVENTS.DATA_READY);
    } catch (error) {
      console.error('Error loading or processing data:', error);
    }
  }

  getCategoryColor() {
    const r = Math.floor(Math.random() * 128 + 128);
    const g = Math.floor(Math.random() * 128 + 128);
    const b = Math.floor(Math.random() * 128 + 128);

    const rgbToHex = (r, g, b) => {
      return `#${(1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1).toUpperCase()}`;
    };

    return rgbToHex(r, g, b);
  }

  mount() {
    if (this.mounted) return;
    this.render();
    this.mounted = true;
    this.emit(VIZ_EVENTS.ENTER_COMPLETE);
  }

  unmount() {
    if (!this.mounted) return;
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

  render() {
    if (!this.data) return;

    this.container.innerHTML = '';

    const width = 1000, height = 800;

    this.svg = d3.select(this.container)
      .append('svg')
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('role', 'img')
      .attr('aria-label', 'Category visualization showing ranking and interaction');

    const centerGroup = this.svg.append('g')
      .attr(
        'transform',
        `translate(${width / 2}, ${height / 2}) translate(${-width / 2}, ${-height / 2})`
      );

    const pyramidData = this.data.categories.map((d, i) => {
      let row, column;
      if (i === 0) { row = 0; column = 0; }
      else if (i <= 2) { row = 1; column = i - 1; }
      else { row = 2; column = i - 3; }
      const rowSpacing = 200;
      const y = 100 + row * rowSpacing;
      return { ...d, row, column, y, coverFallen: false };
    });

    const rectWidth = 200;
    const rectHeight = 150;
    const paddingX = 40; // padding btn columns
    const cornerRadius = 20;

    const columnXPositions = (row) => {
      switch (row) {
        case 0:
          return [(width - rectWidth) / 2];
        case 1:
          return [
            (width - rectWidth * 2 - paddingX) / 2,
            (width - rectWidth * 2 - paddingX) / 2 + rectWidth + paddingX
          ];
        case 2:
          return [
            (width - rectWidth * 3 - paddingX * 2) / 2,
            (width - rectWidth * 3 - paddingX * 2) / 2 + rectWidth + paddingX,
            (width - rectWidth * 3 - paddingX * 2) / 2 + (rectWidth + paddingX) * 2
          ];
        default:
          return [];
      }
    };

    // --- groups for pages ---
    // bottom-right pages are drawn first
    pyramidData.sort((a, b) => {
      if (a.row !== b.row) return b.row - a.row;
      return b.column - a.column;
    });

    const pages = centerGroup.selectAll('g.page')
      .data(pyramidData)
      .enter()
      .append('g')
      .attr('class', 'page')
      .attr('transform', d => `translate(${columnXPositions(d.row)[d.column]}, ${d.y})`)
      .style('cursor', 'pointer');

    // --- categories page ---
    const gifMap = {
      "Pets": "https://hips.hearstapps.com/toc.h-cdn.co/assets/16/23/640x320/landscape-1465404255-tc-060816-dog-breeds.gif?resize=640:*",
      "Fitness": "https://cdn.prod.website-files.com/66c501d753ae2a8c705375b6/67ed6a2da06e77b57e4fd380_Chest-Press-Throw.gif",
      "Music": "https://cdn.merriammusic.com/2015/07/5CuqBlN.gif",
      "Art": "https://images.squarespace-cdn.com/content/v1/54ecfc32e4b0866fef096797/1627925527930-83LG5C1EZEV3BZGMJU9R/Angled+Stroke+3.gif",
      "Tech": "https://media.giphy.com/media/v1.Y2lkPWVjZjA1ZTQ3b2t2dGN1MTJsNjFsd2pzOGt5M3d4OHAxeW94Zjhkendob3Bwd3RzdCZlcD12MV9naWZzX3JlbGF0ZWQmY3Q9Zw/WTcJBZROKjmSf5prBl/giphy.gif",
      "Food": "https://studentlife.dal.ca/article/2019/5-tips-for-your-next--or-first--meatless-monday/_jcr_content/root/maincontent/main/article-body/center/contentfragment/par17/image.coreimg.gif/1572312628676/veggie-food.gif"
    };

    // create a clipPath for rounded corners (reusable)
    const defss = this.svg.append("defs");

    defss.append("clipPath")
      .attr("id", "roundedClip")
      .append("rect")
      .attr("width", rectWidth)
      .attr("height", rectHeight)
      .attr("rx", cornerRadius)
      .attr("ry", cornerRadius);

    pages.append("g")
      .attr("class", "page-bg")
      .each(function (d) {
        const g = d3.select(this);

        g.append("image")
          .attr("href", gifMap[d.category] || "fallback.gif")
          .attr("width", rectWidth)
          .attr("height", rectHeight)
          .attr("preserveAspectRatio", "xMidYMid slice")
          .attr("clip-path", "url(#roundedClip)");

        g.append("rect")
          .attr("width", rectWidth)
          .attr("height", rectHeight)
          .attr("rx", cornerRadius)
          .attr("fill", "rgba(0, 0, 0, 0.2)");

        g.append("text")
          .attr("x", rectWidth / 2)
          .attr("y", rectHeight / 2)
          .attr("text-anchor", "middle")
          .attr("dominant-baseline", "middle")
          .attr("fill", "white")
          .style("font-size", "30px")
          .style("font-weight", "bold")
          // .style("text-shadow", "0 2px 5px rgba(0,0,0,0.5)")
          .text(d.category);
      });

    // --- cover page ---
    const defs = this.svg.append('defs');

    //  paper gradient 
    const gradient = defs.append('linearGradient')
      .attr('id', 'paperGradient')
      .attr('x1', '0%')
      .attr('y1', '0%')
      .attr('x2', '100%')
      .attr('y2', '100%');

    gradient.selectAll('stop')
      .data([
        { offset: '0%', color: '#ffffff' },
        { offset: '100%', color: '#d5cfbd' }
      ])
      .enter()
      .append('stop')
      .attr('offset', d => d.offset)
      .attr('stop-color', d => d.color);

    //  shadow 
    const shadowFilter = defs.append('filter')
      .attr('id', 'paperShadow')
      .attr('x', '-30%')
      .attr('y', '-30%')
      .attr('width', '160%')
      .attr('height', '160%');

    shadowFilter.append('feDropShadow')
      .attr('dx', 3)
      .attr('dy', 4)
      .attr('stdDeviation', 15)
      .attr('flood-color', '#000')
      .attr('flood-opacity', 0.6);

    const coverGroup = pages.append('g')
      .attr('class', 'cover-group');

    coverGroup.append('rect')
      .attr('width', rectWidth)
      .attr('height', rectHeight)
      .attr('rx', 20)
      .attr('fill', 'white')
      .attr('filter', 'url(#paperShadow)')
      .style('pointer-events', 'none');

    coverGroup.append('rect')
      .attr('width', rectWidth)
      .attr('height', rectHeight)
      .attr('rx', 20)
      .attr('fill', 'url(#paperGradient)')
      .style('pointer-events', 'none');

    coverGroup.append('text')
      .attr('x', rectWidth / 2)
      .attr('y', rectHeight / 2)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .attr('fill', 'black')
      .style('font-size', '60px')
      .style('font-weight', 'bold')
      .style('pointer-events', 'none')
      .text(d => d.rank);

    coverGroup.append('rect')
      .attr('class', 'tape')
      .attr('x', rectWidth / 2 - 40)
      .attr('y', -10)
      .attr('width', 80)
      .attr('height', 25)
      .attr('fill', '#edebb9ff')
      .attr('opacity', 0.8)
      .attr('transform', d => {
        const angle = (Math.random() * 10 - 5).toFixed(1);
        return `rotate(${angle}, ${rectWidth / 2}, 0)`;
      })
      .style('pointer-events', 'none');

    // drop cover (on hover)
    const fallenPages = new Set();
    let nextToFallIndex = 0;

    const fallOrder = new Map(
      pyramidData.map((d, i) => [d.category, i])
    );

    let isAudioPlaying = false;

    pages.on('mouseenter', function (event, d) {
      if (isAudioPlaying) return;

      const cover = d3.select(this).select('.cover-group');

      d3.select(this).select('rect')
        .transition()
        .duration(300)
        .style('filter', 'brightness(1.5)');

      if (!d.coverFallen) {
        d3.select(this).select('.cover-group text')
          .transition()
          .duration(300)
          .style('fill', '#999999');
      }
      const expectedIndex = nextToFallIndex;
      const thisIndex = fallOrder.get(d.category);

      if (thisIndex !== expectedIndex) return;

      const scaleUp = 1.1;
      const originX = rectWidth / 2, originY = 0;

      cover.transition()
        .duration(300)
        .ease(d3.easeCubicOut)
        .attr('transform', `scale(${scaleUp}) translate(${originX * (1 - scaleUp) / scaleUp}, ${originY * (1 - scaleUp) / scaleUp})`);

      fallenPages.add(d.category);
      nextToFallIndex++;

      const fallOffset = 50;
      const baseOfPyramid = 100 + 2 * 200 + rectHeight;
      const groundY = baseOfPyramid + fallOffset;
      const delayArray = [1000, 1000, 1100, 2000, 2000, 6000];
      const delayTime = delayArray[expectedIndex] || 1000;
      const audioPath = `/assets/audio/ranking${expectedIndex}.mp3`;
      const fallAudio = new Audio(audioPath);

      fallAudio.volume = 1;

      isAudioPlaying = true;

      fallAudio.addEventListener('ended', () => {
        isAudioPlaying = false;
      });

      fallAudio.addEventListener('loadedmetadata', () => {
        setTimeout(() => {
          const randomTilt = Math.random() * 40 - 20;
          const randomXShift = Math.random() * 80 - 40;
          const randomBounce = 1 + Math.random() * 0.05;

          cover.transition()
            .duration(400 + Math.random() * 400) // some fall slower
            .ease(d3.easeCubicIn)
            .attr('transform', `
                  translate(${randomXShift}, ${groundY - d.y})
                  rotate(${randomTilt}, ${rectWidth / 2}, ${rectHeight / 2})
                  scale(${randomBounce}, 0.6)
              `);
          d.coverFallen = true;
        }, delayTime);

        fallAudio.play().catch(error => {
          console.error('Error playing audio:', error);
        });

        const fadeOutStartTime = fallAudio.duration - 500 / 1000;

        setTimeout(() => {
          const fadeOutInterval = setInterval(() => {
            if (fallAudio.volume > 0) {
              fallAudio.volume = Math.max(0, fallAudio.volume - 0.05); // clamp to 0
            } else {
              fallAudio.volume = 0;
              clearInterval(fadeOutInterval);
            }
          }, 50);
        }, fadeOutStartTime * 1000);
      });

      fallAudio.onerror = (error) => {
        console.error('Error playing audio:', error);
      };
    });

    pages.on('mouseleave', function (event, d) { // reset hover effects
      d3.select(this).select('rect') // page brightness
        .transition()
        .duration(300)
        .style('filter', 'brightness(1)');

      d3.select(this).select('.cover-group text') // cover rank text brightness
        .transition()
        .duration(300)
        .style('fill', 'black');
    });

    // --- popup ---
    pages.on('click', (event, d) => {
      event.stopPropagation();

      if (!d.coverFallen) return;  // prevent popup if cover is still on top

      if (this.popup) {
        this.popup.remove();
        d3.select(this.container).select('.overlay').remove();
        this.popup = null;
        window.removeEventListener('resize', this._popupResizeHandler);
      }

      // overlay
      const overlay = d3.select(this.container)
        .append('div')
        .attr('class', 'overlay')
        .style('position', 'absolute')
        .style('top', 0)
        .style('left', 0)
        .style('width', '100%')
        .style('height', '100%')
        .style('background', 'rgba(0,0,0,0.3)')
        .style('backdrop-filter', 'blur(0px)')
        .style('z-index', 999)
        .style('opacity', 0)
        .style('transition', 'opacity 0.4s ease-out, backdrop-filter 0.4s ease-out');

      setTimeout(() => {
        overlay
          .style('opacity', 1)
          .style('backdrop-filter', 'blur(5px)');
      }, 10);

      // calculate dynamic size
      const getPopupSize = () => ({
        width: Math.min(window.innerWidth * 0.8, 700),
        height: Math.min(window.innerHeight * 0.8, 500)
      });

      const { width, height } = getPopupSize();

      // popup
      this.popup = d3.select(this.container)
        .append('div')
        .attr('class', 'bubble-popup')
        .style('position', 'absolute')
        .style('top', '50%')
        .style('left', '50%')
        .style('transform', 'translate(-50%, -50%) scale(0.7)')
        .style('opacity', 0)
        .style('background', 'white')
        .style('border-radius', '30px')
        // .style('padding', '16px')   -- makes sure gif svg fits exactly
        .style('z-index', 1000)
        .style('width', width + 'px')
        .style('height', height + 'px')
        .style('transition', 'transform 0.4s ease-out, opacity 0.4s ease-out, width 0.3s ease, height 0.3s ease');

      setTimeout(() => {
        this.popup
          .style('transform', 'translate(-50%, -50%) scale(1)')
          .style('opacity', 1);
      }, 10);

      new RankingBubbleChart(
        this.popup.node(),
        d.category,
        d.color,
        gifMap[d.category] || '',
        { maxAuthors: 18 }
      );

      // --- window resize ---
      this._popupResizeHandler = () => {
        if (!this.popup) return;
        const { width, height } = getPopupSize();
        this.popup
          .style('width', width + 'px')
          .style('height', height + 'px');
      };
      window.addEventListener('resize', this._popupResizeHandler);

      // close popup (when clicking outside)
      overlay.on('click', () => {
        this.popup
          .style('transform', 'translate(-50%, -50%) scale(0.7)')
          .style('opacity', 0);

        overlay
          .style('opacity', 0)
          .style('backdrop-filter', 'blur(0px)');

        setTimeout(() => {
          if (this.popup) {
            this.popup.remove();
            this.popup = null;
            window.removeEventListener('resize', this._popupResizeHandler);
          }
          overlay.remove();
        }, 400);
      });
    });
  }

  /**
   * Programmatically reveal all pyramid layers sequentially
   * Triggers cover-fall animation from bottom to top for guided exploration
   */
  revealPyramidLayers() {
    if (!this.svg) {
      console.warn('[Ranking] Cannot reveal pyramid - SVG not initialized');
      return;
    }

    const pages = this.svg.selectAll('g.page');
    if (pages.empty()) {
      console.warn('[Ranking] Cannot reveal pyramid - No pages found');
      return;
    }

    // Trigger mouseenter events sequentially to reveal layers
    // Bottom row (indices 3,4,5) -> Middle row (1,2) -> Top (0)
    const revealSequence = [5, 4, 3, 2, 1, 0]; // Bottom to top

    revealSequence.forEach((index, seqIndex) => {
      setTimeout(() => {
        const page = pages.filter((d, i) => i === index);
        if (!page.empty()) {
          const node = page.node();
          const event = new MouseEvent('mouseenter', {
            view: window,
            bubbles: true,
            cancelable: true
          });
          node.dispatchEvent(event);
          console.log(`[Ranking] Revealed layer ${index + 1}`);
        }
      }, seqIndex * 800); // Stagger by 800ms
    });

    console.log('[Ranking] Starting pyramid layer reveal animation');
  }
}