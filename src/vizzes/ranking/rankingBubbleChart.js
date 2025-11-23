// RankingBubbleChart.js
// Secondary view for RankingViz: top creators within a selected category.

export class RankingBubbleChart {
  /**
   * @param {string|HTMLElement} parentElement - container for the popup view
   * @param {string} category - initial selected category
   * @param {string} categoryColor - fill color for circles (match sticky note color)
   * @param {Object} options - optional config overrides
   */
  constructor(parentElement, category, categoryColor, gifUrl, options = {}) {
    this.parentElement =
      typeof parentElement === 'string'
        ? d3.select(parentElement)
        : d3.select(parentElement);

    if (this.parentElement.empty()) {
      throw new Error(
        `RankingBubbleChart: container "${parentElement}" not found.`
      );
    }

    this.category = category;
    this.categoryColor = categoryColor || 'var(--color-accent)';
    this.gifUrl = gifUrl || null;
    this.options = {
      maxAuthors: 18, // show top N authors in this category
      margin: { top: 40, right: 10, bottom: 25, left: 10 },
      minRadius: 14,
      maxRadius: 60,
      dataPath: '/data/youtube_shorts_tiktok_trends_2025.csv',
      ...options
    };

    this.width =
      this.parentElement.node().clientWidth ||
      480;
    this.height =
      this.parentElement.node().clientHeight ||
      360;

    this.rawData = [];      // all rows from CSV
    this.authorStats = [];  // aggregated per-author stats

    this.svg = null;
    this.chartG = null;
    this.tooltip = null;

    this.initVis();
    // Load data asynchronously; once loaded we wrangle + render.
    this.loadData();
  }

  // ---------- VIS SETUP ----------

  initVis() {
    // Clear any previous SVG (for safety / resize)
    this.parentElement.selectAll('*').remove();
    d3.selectAll('#rankingBubbleTooltip').remove();

    // Remove old tooltip if re-initializing
    if (this.tooltip) {
      this.tooltip.remove();
      this.tooltip = null;
    }

    this.svg = this.parentElement
      .append('svg')
      .attr('class', 'ranking-bubble-chart')
      .attr('width', this.width)
      .attr('height', this.height)
      .attr('role', 'img')
      .attr(
        'aria-label',
        `Top creators in ${this.category} community`
      );
    // --- defs: rounded corner clip for the whole drawing area
    const rx = 20, ry = 20;
    const defs = this.svg.append('defs');
    defs.append('clipPath')
      .attr('id', 'bubbleChartRoundedClip')
      .append('rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', this.width)
      .attr('height', this.height)
      .attr('rx', rx)
      .attr('ry', ry);
    
    // TikTok-style gradient for hover strokes
    const hoverGradient = defs.append('linearGradient')
      .attr('id', 'bubbleHoverStroke')
      .attr('x1', '0%')
      .attr('y1', '0%')
      .attr('x2', '100%')
      .attr('y2', '100%'); // roughly 135deg

    hoverGradient.append('stop')
      .attr('offset', '0%')
      .attr('stop-color', '#00f7ff'); // aqua

    hoverGradient.append('stop')
      .attr('offset', '100%')
      .attr('stop-color', '#ff5ce7'); // pink

     // Background + border for the whole drawing area
    this.svg
      .append('rect')
      .attr('class', 'bubble-bg')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', this.width)
      .attr('height', this.height)
      .attr('fill', '#ffffff')
      .attr('stroke', '#ff0050') // TikTok pink border
      .attr('stroke-width', 0)
      .attr('rx', rx)   // horizontal corner radius
      .attr('ry', ry);
    
    // --- GIF layer (plays automatically if animated)
    if (this.gifUrl) {
      this.svg.append('image')
        .attr('class', 'bubble-gif')
        .attr('href', this.gifUrl)
        .attr('x', 0)
        .attr('y', 0)
        .attr('width', this.width)
        .attr('height', this.height)
        .attr('opacity', 0.75)
        .attr('filter', 'brightness(0.3)') // darken for contrast
        .attr('preserveAspectRatio', 'xMidYMid slice')
        .attr('clip-path', 'url(#bubbleChartRoundedClip)');
    }

    // --- border overlay so the frame is crisp above the GIF
    this.svg.append('rect')
      .attr('class', 'bubble-frame')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', this.width)
      .attr('height', this.height)
      .attr('fill', 'none')
      .attr('rx', rx)
      .attr('ry', ry)
      ;

    // Main chart group on top
    this.chartG = this.svg
      .append('g')
      .attr(
        'transform',
        `translate(${this.options.margin.left},${this.options.margin.top})`
      );

    this.innerWidth =
      this.width -
      this.options.margin.left -
      this.options.margin.right;
    this.innerHeight =
      this.height -
      this.options.margin.top -
      this.options.margin.bottom;

    // Optional title inside popup
    this.title = this.chartG
      .append('text')
      .attr('class', 'bubble-title')
      .attr('x', this.innerWidth / 2)
      .attr('y', 28)
      .attr('text-anchor', 'middle')
      .text(this.category ? `${this.category}Tok` : 'Creators')
      .style('font-size', '60px')
      .style('font-weight', '700')
      .style('fill', 'url(#bubbleHoverStroke)');
    
    // Subtitle
    this.subtitle = this.chartG
      .append('text')
      .attr('class', 'bubble-subtitle')
      .attr('x', this.innerWidth / 2)
      .attr('y', 60)  // just below the title; tweak as needed
      .attr('text-anchor', 'middle')
      .style('font-size', '20px')
      .style('font-weight', '700')
      .style('fill', 'url(#bubbleHoverStroke)')
      .text('Top Creators In This Community');


    // Lab 6-style tooltip
    this.tooltip = d3
      .select('body')
      .append('div')
      .attr('class', 'tooltip ranking-bubble-tooltip')
      .attr('id', 'rankingBubbleTooltip')
      .style('position', 'absolute')     // important for placement
        .style('pointer-events', 'none')   // ignore mouse events
      .style('z-index', '9999')          // sit on top of SVG & overlays
      .style('opacity', 0)
      .style('width', '300px')          // fixed width
      .style('max-width', '350px')      // (optional) enforce max
      .style('white-space', 'normal')   // allow wrapping
      .style('word-wrap', 'break-word') // break long tokens if needed
      .style('overflow', 'hidden');     // don't grow forever vertically (optional)
  }

  // ---------- DATA LOADING & EXTERNAL HOOKS ----------

  async loadData() {
    if (!this.rawData.length) {
      this.rawData = await d3.csv(this.options.dataPath, d3.autoType);
    }
    this.wrangleData();
    this.updateVis();
  }

  /**
   * Allow parent (RankingViz) to inject already-loaded dataset
   * to avoid re-fetching.
   */
  setData(data) {
    this.rawData = data || [];
    this.wrangleData();
    this.updateVis();
  }

  /**
   * Update category + color from parent viz (on sticky-note click).
   */
  // setCategory(category, categoryColor) {
  //   this.category = category;
  //   if (categoryColor) this.categoryColor = categoryColor;
  //   if (this.title) {
  //     this.title.text(`Top Creators in ${this.category} Community by Total Views`);
  //   }
  //   this.wrangleData();
  //   this.updateVis();
  // }

  // ---------- WRANGLE DATA (Lab 3 style aggregation) ----------

  wrangleData() {
    if (!this.rawData.length || !this.category) {
      this.authorStats = [];
      return;
    }

    // Filter by selected category
    const categoryFiltered = this.rawData.filter((d) => {
      const g = d.category || d.Category;
      return g === this.category;
    });

    // Group by author handle
    const rollup = d3.rollups(
      categoryFiltered,
      (v) => {
        const totalViews = d3.sum(v, (d) => d.views ?? d.playCount ?? 0);
        const totalLikes = d3.sum(v, (d) => d.likes ?? 0);
        const totalComments = d3.sum(v, (d) => d.comments ?? 0);
        const totalShares = d3.sum(v, (d) => d.shares ?? 0);
        const totalSaves = d3.sum(v, (d) => d.saves ?? 0);

        const hashtagSet = new Set();
        const genreSet = new Set();
        const soundSet = new Set();

        v.forEach((d) => {
          // Hashtags: handle either single or multiple
          if (d.hashtag) {
            String(d.hashtag)
              .split(/[,\s]+/)
              .filter(Boolean)
              .forEach((t) =>
                hashtagSet.add(t.startsWith('#') ? t : `#${t}`)
              );
          }
          if (d.hashtags) {
            String(d.hashtags)
              .split(/[,\s]+/)
              .filter(Boolean)
              .forEach((t) =>
                hashtagSet.add(t.startsWith('#') ? t : `#${t}`)
              );
          }

          // Genre tags
          const genre = d.genre || d.Genre;
            if (genre) {
              // allow comma-separated lists too
              String(genre)
                .split(/[,\s]+/)
                .filter(Boolean)
                .forEach((c) => genreSet.add(c));
            }

          // Sounds / tracks
          const s =
            d.music_track ||
            d.soundtrack ||
            d.sound ||
            d.audio;
          if (s) soundSet.add(String(s));
        });

        return {
          totalViews,
          totalLikes,
          totalComments,
          totalShares,
          totalSaves,
          hashtags: Array.from(hashtagSet).slice(0, 15),
          genres: Array.from(genreSet).slice(0, 10),
          sounds: Array.from(soundSet).slice(0, 10)
        };
      },
      (d) =>
        d.authorHandle ||
        d.author_handle ||
        d.creator ||
        'Unknown'
    );

    let stats = rollup
      .map(([author, metrics]) => ({
        author,
        ...metrics
      }))
      .filter((d) => d.totalViews > 0);

    // Rank by total views and keep top 10
    // stats.sort((a, b) =>
    //   d3.descending(a.totalViews, b.totalViews)
    // );
    stats = stats.slice(0,25);

    // Proportional circle sizes (area ~ views)
    const maxViews =
      d3.max(stats, (d) => d.totalViews) || 1;
    const rScale = d3
      .scaleSqrt()
      .domain([0, maxViews])
      .range([this.options.minRadius, this.options.maxRadius]);

    stats.forEach((d) => {
      d.r = rScale(d.totalViews);
    });

    this.authorStats = stats;
  }

  // ---------- RENDER / UPDATE (Lab 4 pattern + force layout) ----------

  updateVis() {
    if (!this.chartG) return;

    const nodesData = this.authorStats;

    // No data: clear
    if (!nodesData.length) {
      this.chartG.selectAll('.author-node').remove();
      return;
    }

    const cx = this.innerWidth / 2;
    const cy = this.innerHeight / 2;

    // Use a local force simulation to avoid overlapping circles
    const simNodes = nodesData.map((d) => ({ ...d }));

    const simulation = d3
      .forceSimulation(simNodes)
      .force('x', d3.forceX(cx).strength(0.08))
      .force('y', d3.forceY(cy).strength(0.08))
      .force(
        'collide',
        d3.forceCollide((d) => d.r + 4)
      )
      .stop();

    // Run a fixed number of ticks and clamp within the inner chart box
    const maxTicks = 260;
    for (let i = 0; i < maxTicks; i++) {
    simulation.tick();
    simNodes.forEach((d) => {
        // keep each circle fully inside [0, innerWidth] x [30, innerHeight]
        d.x = Math.max(d.r, Math.min(this.innerWidth - d.r, d.x));
        d.y = Math.max(d.r + 80, Math.min((this.innerHeight) - d.r, d.y));
    });
    }
    simulation.stop();

    // DATA JOIN
    const nodes = this.chartG
      .selectAll('.author-node')
      .data(simNodes, (d) => d.author);

    // EXIT
    nodes
      .exit()
      .transition()
      .duration(200)
      .attr('opacity', 0)
      .remove();

    // ENTER
    const nodesEnter = nodes
      .enter()
      .append('g')
      .attr('class', 'author-node')
      .attr(
        'transform',
        `translate(${cx},${cy})`
      )
      .attr('opacity', 0);

    nodesEnter
      .append('circle')
      .attr('class', 'author-circle')
      .attr('r', 0)
      .attr('fill', this.categoryColor)
      .attr('fill-opacity', 1);

    nodesEnter
      .append('text')
      .attr('class', 'author-label')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .style('pointer-events', 'none')
      .style('font-weight', '600')
      .style('fill', '#292929ff')
      .text((d) => d.author);

    // ENTER + UPDATE MERGE
    const nodesMerged = nodesEnter.merge(nodes);

    nodesMerged
      .transition()
      .duration(400)
      .attr('opacity', 1)
      .attr(
        'transform',
        (d) => `translate(${d.x},${d.y})`
      );

    nodesMerged
      .select('.author-circle')
      .transition()
      .duration(400)
      .attr('r', (d) => d.r)
      .attr('fill', this.categoryColor);

    nodesMerged.select('.author-label').each(function (d) {
      const textSel = d3.select(this);

      // Start with full handle
      let label = d.author || '';
      textSel.text(label);

      const padding = 6;                          // small padding from circle edge
      const maxWidth = (d.r * 2) - padding;       // max label width inside circle
      let fontSize = Math.min(16, d.r * 0.6);     // initial guess: depends on radius

      if (fontSize < 8) {
        // If the circle is tiny, don't force unreadable text; hide and rely on tooltip
        textSel.text('');
        return;
      }

      textSel.style('font-size', `${fontSize}px`);

      // Measure and shrink font-size until it fits
      let bbox = this.getBBox();
      while (bbox.width > maxWidth && fontSize > 7) {
        fontSize -= 1;
        textSel.style('font-size', `${fontSize}px`);
        bbox = this.getBBox();
      }

      // If it still doesn't fit at minimum font size, truncate with ellipsis
      if (bbox.width > maxWidth) {
        let truncated = label;
        // Keep trimming until it fits or is very short
        while (truncated.length > 3) {
          truncated = truncated.slice(0, -2);
          textSel.text(truncated + '…');
          bbox = this.getBBox();
          if (bbox.width <= maxWidth) break;
        }
        // If it's still too big, hide label
        if (bbox.width > maxWidth) {
          textSel.text('');
        }
      }
    });


    // TOOLTIP (hover only; clicks handled by RankingViz)
    nodesMerged
      .on('mouseover', (event, d) => {
        const node = d3.select(event.currentTarget);

        // Highlight circle with TikTok aqua
        node.select('.author-circle')
            .attr('stroke', 'url(#bubbleHoverStroke)')
            .attr('stroke-width', 5);

        this.tooltip
          .style('opacity', 1)
          .html(this.getTooltipHtml(d));
      })
      .on('mousemove', (event) => {
        this.moveTooltip(event);
      })
      .on('mouseleave', () => {
        const node = d3.select(event.currentTarget);

        // Remove highlight, restore original (no stroke)
        node.select('.author-circle')
          .attr('stroke', null)
          .attr('stroke-width', null);
        this.tooltip
          .style('opacity', 0);
      });
  }

  // ---------- TOOLTIP HELPERS (Lab 6 style) ----------

  moveTooltip(event) {
    if (!this.tooltip) return;
    const offsetX = -40;
    const offsetY = 20;

    let x = event.pageX + offsetX;
    let y = event.pageY + offsetY;

    this.tooltip
      .style('left', `${x}px`)
      .style('top', `${y}px`);
  }

  getTooltipHtml(d) {
    const fmt = d3.format(',d');

    const firstLetter =
      d.author && d.author.length ? d.author[0].toUpperCase() : '?';

    // Build hashtag "chips"
    const hashtags =
      d.hashtags && d.hashtags.length
        ? d.hashtags.slice(0, 8)
            .map((h) => {
              const label = String(h).replace(/^#/, '');
              return `
                <span style="
                  font-size: 0.8rem;
                  padding: 0.1rem 0.45rem;
                  border-radius: 999px;
                  background: rgba(15, 23, 42, 0.85);
                  border: 1px solid rgba(148, 163, 184, 0.4);
                  color: rgba(226, 232, 240, 0.95);
                  white-space: nowrap;
                  margin-right: 0.25rem;
                  margin-bottom: 0.25rem;
                  display: inline-flex;
                  align-items: center;
                ">#${label}</span>
              `;
            })
            .join('')
        : '';

    // Build sound "chips"
    const sounds =
      d.sounds && d.sounds.length
        ? d.sounds.slice(0, 4)
            .map((s) => {
              const label = String(s);
              return `
                <span style="
                  font-size: 0.8rem;
                  padding: 0.1rem 0.45rem;
                  border-radius: 999px;
                  background: rgba(15, 23, 42, 0.85);
                  border: 1px solid rgba(255, 92, 231, 0.5);
                  color: rgba(226, 232, 240, 0.95);
                  white-space: nowrap;
                  margin-right: 0.25rem;
                  margin-bottom: 0.25rem;
                  display: inline-flex;
                  align-items: center;
                ">${label}</span>
              `;
            })
            .join('')
        : '';

    return `
      <div style="
        min-width: 260px;
        max-width: 340px;
        padding: 12px 16px;
        border-radius: 14px;
        background: rgba(10, 13, 24, 0.96);
        border: 1px solid rgba(255, 255, 255, 0.06);
        box-shadow: 0 18px 48px rgba(0, 0, 0, 0.6);
        color: #f9fafb;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      ">
        <!-- Header -->
        <div style="
          display: flex;
          align-items: center;
          gap: 0.7rem;
          margin-bottom: 0.4rem;
        ">
          <div style="
            width: 32px;
            height: 32px;
            border-radius: 999px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 700;
            font-size: 0.9rem;
            color: #050609;
            background: linear-gradient(135deg, #00f7ff, #ff5ce7);
          ">
            ${firstLetter}
          </div>
          <div style="display: flex; flex-direction: column;">
            <div style="font-size: 1rem; font-weight: 600;">
              @${d.author}
            </div>
            <div style="
              font-size: 0.8rem;
              color: rgba(148, 163, 184, 0.9);
            ">
              Top creator in
              <span style="
                padding: 0.1rem 0.45rem;
                border-radius: 999px;
                background: rgba(0, 247, 255, 0.12);
                color: #7cf0ff;
                margin-left: 0.2rem;
              ">${this.category}Tok</span>
            </div>
          </div>
        </div>

          <!-- Performance section -->
        <div style="margin-top: 0.2rem;">
          <div style="
            font-size: 0.75rem;
            letter-spacing: 0.04em;
            text-transform: uppercase;
            color: rgba(148, 163, 184, 0.9);
            margin-bottom: 0.2rem;
          ">
          </div>

          ${['Views', 'Likes', 'Comments', 'Shares', 'Saves']
            .map((label) => {
              const key = 'total' + label;
              const value = fmt(d[key] || 0);
              return `
                <div style="
                  display: flex;
                  justify-content: space-between;
                  font-size: 0.85rem;
                  margin-top: 0.1rem;
                ">
                  <span style="color: rgba(148, 163, 184, 0.95);">${label}</span>
                  <strong style="font-weight: 600;">${value}</strong>
                </div>
              `;
            })
            .join('')}
        </div>

        <!-- Hashtags -->
        ${
          hashtags
            ? `
        <div style="margin-top: 0.8rem;">
          <div style="
            font-size: 0.8rem;
            letter-spacing: 0.04em;
            text-transform: uppercase;
            color: rgba(148, 163, 184, 0.9);
            margin-bottom: 0.2rem;
          ">
            Signature hashtags
          </div>
          <div style="display: flex; flex-wrap: wrap;">
            ${hashtags}
          </div>
        </div>
        `
            : ''
        }

        <!-- Sounds -->
        ${
          sounds
            ? `
        <div style="margin-top: 0.5rem;">
          <div style="
            font-size: 0.8rem;
            letter-spacing: 0.04em;
            text-transform: uppercase;
            color: rgba(148, 163, 184, 0.9);
            margin-bottom: 0.2rem;
          ">
            Sounds
          </div>
          <div style="display: flex; flex-wrap: wrap;">
            ${sounds}
          </div>
        </div>
        `
            : ''
        }
      </div>
    `;
  }

  // getTooltipHtml(d) {
  //   const fmt = d3.format(',d');
  //   return `
  //     <div class="tooltip-title">@${d.author}</div>
  //     <div class="tooltip-metric"><span>Views:</span> ${fmt(
  //       d.totalViews
  //     )}</div>
  //     <div class="tooltip-metric"><span>Likes:</span> ${fmt(
  //       d.totalLikes
  //     )}</div>
  //     <div class="tooltip-metric"><span>Comments:</span> ${fmt(
  //       d.totalComments
  //     )}</div>
  //     <div class="tooltip-metric"><span>Shares:</span> ${fmt(
  //       d.totalShares
  //     )}</div>
  //     <div class="tooltip-metric"><span>Saves:</span> ${fmt(
  //       d.totalSaves
  //     )}</div>
  //     ${
  //       d.hashtags &&
  //       d.hashtags.length
  //         ? `<div class="tooltip-list"><span>Hashtags:</span> ${d.hashtags.join(
  //             ', '
  //           )}</div>`
  //         : ''
  //     }
  //     ${
  //       d.sounds &&
  //       d.sounds.length
  //         ? `<div class="tooltip-list"><span>Sounds:</span> ${d.sounds.join(
  //             ', '
  //           )}</div>`
  //         : ''
  //     }
  //   `;
  // }

  // ---------- LIFECYCLE HELPERS ----------

  resize(width, height) {
    this.width = width;
    this.height = height;
    this.initVis();   // rebuilds defs/clip, bg, gif, frame
    this.wrangleData();
    this.updateVis();
  }

  destroy() {
    if (this.svg) {
      this.svg.remove();
      this.svg = null;
      this.chartG = null;
    }
    if (this.tooltip) {
      this.tooltip.remove();
      this.tooltip = null;
    }
    this.authorStats = [];
  }
}
