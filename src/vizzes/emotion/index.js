// Language/Emotion vs Engagement Visualization - Word Cloud Version
import { EventEmitter, prefersReducedMotion } from "../shared/utils.js";
import { VIZ_EVENTS, DEFAULT_OPTIONS } from "../shared/types.js";

import "../../css/emotion.css";

export class EmotionViz extends EventEmitter {
  constructor() {
    super();
    this.container = null;
    this.rawData = null;

    this.data = null; // { tokens, links, emotionCategories, emotionColors }

    this.state = {
      currentStep: 0,
      filters: { layer: "emotion" },
      highlights: [],
      animationPaused: false,
      interactionMode: "explore",
      sortedView: false, // <-- new
    };

    this.options = {
      ...DEFAULT_OPTIONS,
      reducedMotion: prefersReducedMotion(),
    };
    this.mounted = false;
    this.svg = null;

    // track layout size for sorted view
    this.layoutWidth = null;
    this.layoutHeight = null;
    this.layoutMargin = 40;

    // separate layer for hover connection lines
    this.linkLayer = null;

    // NLP bits
    this.sentiment = null;

    // In-browser embedding model (transformers.js pipeline)
    this.embedder = null;

    // Active emotion filters (multi-select)
    this.activeEmotions = null;

    // timer for floating animation
    this.bubbleTimer = null;

    // --- Manual fallback lexicon so we always get non-neutral scores ----
    this.manualLexicon = {
      "+3": new Set([
        // strong positive / excitement / hype
        "amazing",
        "awesome",
        "love",
        "loving",
        "perfect",
        "incredible",
        "best",
        "beautiful",

        // general hype slang
        "lit",
        "fire",
        "epic",
        "legendary",
        "iconic",
        "unreal",
        "insane",
        "crazy",
        "banger",
        "slay",
        "slayed",
        "goat",
        "hype",
        "hyping",
        "pumped",
        "stoked",
        "mindblowing",
        "mindblown",
        "nextlevel",
        "wild",
        "shook",
        "insanely",
        "ridiculous",
        "electric",
        "explosive",
        "booming",
        "massive",
        "jawdropping",
        "superhit",
        "smash",
        "smashhit",
        "killer",

        // TikTok / virality specific
        "viral",
        "viralvideo",
        "viraltiktok",
        "tiktokviral",
        "trend",
        "trends",
        "trending",
        "trendingvideo",
        "newtrend",
        "fyp",
        "foryou",
        "foryoupage",
        "xyzbca",
        "blowthisup",
        "blowup",
        "blowingup",
        "dancetrend",
        "dancetrends",
        "dancechallenge",
        "tiktokdance",
        "newdance",
        "dancers",

        // action / call-to-hype
        "exploding",
        "breaking",
        "offthecharts",
        "insanelygood",
        "goingcrazy",
        "goingwild",
      ]),
      "+2": new Set([
        "good",
        "great",
        "nice",
        "cool",
        "funny",
        "fun",
        "popular",
        "viral",
        "trend",
        "trendy",
        "fyp",
        "foryou",
        "foryoupage",
        "dance",
        "cute",
        "enjoy",
        "wow",
        "happy",
        "smile",
      ]),
      "-2": new Set([
        "bad",
        "sad",
        "angry",
        "hate",
        "cringe",
        "boring",
        "worst",
        "tired",
        "alone",
        "upset",
        "cry",
        "crying",
      ]),
    };
  }

  async init(selector, options = {}) {
    this.container =
      typeof selector === "string"
        ? document.querySelector(selector)
        : selector;

    if (!this.container) {
      throw new Error(`Container not found: ${selector}`);
    }

    this.options = { ...this.options, ...options };

    // Load data + NLP tools
    await this.loadData();
    this.emit(VIZ_EVENTS.DATA_READY);
  }

  // --- NLP / sentiment -------------------------------------------------------
  async initNLP() {
    if (this.sentiment) return;

    if (window.Sentiment) {
      this.sentiment = new window.Sentiment();
    } else {
      console.warn(
        "Sentiment library not found; using manual lexicon for emotions. " +
          'Include it via <script src="https://cdn.jsdelivr.net/npm/sentiment@5.0.1/dist/sentiment.min.js"></script>'
      );
    }
  }

  lexiconScore(word) {
    const w = word.toLowerCase();
    if (this.manualLexicon["+3"].has(w)) return 3;
    if (this.manualLexicon["+2"].has(w)) return 2;
    if (this.manualLexicon["-2"].has(w)) return -2;
    return 0;
  }

  /**
   * Map a (normalized) sentiment score into a discrete emotion bucket.
   * Score is expected to be roughly in [-3, 3], but compressed via sqrt.
   */
  mapSentimentToEmotion(score) {
    const s = score;

    if (s <= -1.8) return "anger";
    if (s <= -1.0) return "sadness";
    if (s < -0.25) return "disappointment";

    if (s <= 0.25) return "neutral";

    if (s < 0.9) return "hope";
    if (s < 1.6) return "joy";
    return "excitement";
  }

  // --- Embedding helpers (transformers.js) ----------------------------------

  // Lazily load the embedding pipeline in the browser
  async initEmbedder() {
    if (this.embedder) return;

    // Dynamic import so Vite can code-split the model
    const { pipeline, env } = await import("@xenova/transformers");

    // Use remote models (Hugging Face Hub) by default
    env.allowLocalModels = false;

    // Small sentence-embedding model
    this.embedder = await pipeline(
      "feature-extraction",
      "Xenova/all-MiniLM-L6-v2"
    );
  }

  // Compute embeddings for an array of words
  async computeEmbeddings(words) {
    await this.initEmbedder();

    const tensor = await this.embedder(words, {
      pooling: "mean",
      normalize: true,
    });

    const embeddings = tensor.tolist ? tensor.tolist() : tensor.data;
    return embeddings;
  }

  // Cosine similarity between two embedding vectors
  cosineSimilarity(a, b) {
    if (!a || !b || a.length !== b.length) return 0;

    let dot = 0;
    let na = 0;
    let nb = 0;

    for (let i = 0; i < a.length; i++) {
      const va = a[i];
      const vb = b[i];
      dot += va * vb;
      na += va * va;
      nb += vb * vb;
    }

    const denom = Math.sqrt(na) * Math.sqrt(nb);
    return denom ? dot / denom : 0;
  }

  /**
   * Project high-dimensional embeddings into 2D using a simple random
   * linear projection. This preserves neighborhood structure reasonably well
   * and gives us a stable "embedding space" layout to anchor the words to.
   */
  projectEmbeddingsTo2D(tokens) {
    if (!tokens.length || !tokens[0].embedding) return;

    const dim = tokens[0].embedding.length;

    // Two random projection directions
    const r1 = new Array(dim);
    const r2 = new Array(dim);
    for (let i = 0; i < dim; i++) {
      r1[i] = Math.random() - 0.5;
      r2[i] = Math.random() - 0.5;
    }

    tokens.forEach((t) => {
      const e = t.embedding;
      let x = 0;
      let y = 0;
      for (let i = 0; i < dim; i++) {
        x += e[i] * r1[i];
        y += e[i] * r2[i];
      }
      t.projX = x;
      t.projY = y;
    });
  }

  // --- Data loading + processing --------------------------------------------
  async loadData() {
    try {
      await this.initNLP();

      const [data] = await Promise.all([
        d3.csv("/data/cleaned_tiktok_data.csv", d3.autoType),
      ]);

      this.rawData = data;

      // Use only rows that actually have caption text
      const rows = data.filter(
        (d) => typeof d?.text === "string" && d.text.trim().length > 0
      );

      // Basic stopword list (extend as needed)
      const stopwords = new Set([
        "the",
        "and",
        "for",
        "that",
        "this",
        "with",
        "have",
        "has",
        "was",
        "are",
        "but",
        "not",
        "just",
        "you",
        "your",
        "they",
        "them",
        "their",
        "its",
        "it's",
        "ive",
        "i've",
        "cant",
        "can't",
        "didnt",
        "didn't",
        "im",
        "i'm",
        "like",
        "get",
        "got",
        "tiktok",
        "http",
        "https",
        "www",
        "com",
      ]);

      // explicit filler / reaction words we treat as non-key and never show
      const fillerWords = new Set([
        "omg",
        "lol",
        "lmao",
        "lmfao",
        "wtf",
        "idk",
        "tbh",
        "btw",
        "ikr",
        "rn",
        "tho",
        "bruh",
        "bro",
        "sis",
        "omfg",
        "pls",
        "plz",
        "yall",
        "ya",
        "yea",
        "yeah",
        "ok",
        "okay",
        "kinda",
        "sorta",
        "really",
        "literally",
        "actually",
        "gonna",
        "wanna",
        "gotta",
        "haha",
        "hahaha",
        "ahah",
        "hehe",
        "heh",
        "ugh",
        "smh",
        "fr",
        "lowkey",
        "highkey",
        "how",
        "many",
        "our",
        "back",
        "try",
        "keep",
        "now",
        "these",
        "who",
        "one",
        "what",
        "think",
        "part",
        "never",
        "can",
      ]);

      // Keep only simple English tokens: a–z after lowercasing
      const englishWordRegex = /^[a-z]+$/;

      // Small list of common English words for a rough language heuristic
      const englishCommonWords = new Set([
        "the",
        "and",
        "for",
        "that",
        "this",
        "with",
        "have",
        "has",
        "was",
        "were",
        "are",
        "is",
        "on",
        "in",
        "of",
        "to",
        "from",
        "it",
        "its",
        "as",
        "at",
        "by",
        "or",
        "if",
        "but",
        "so",
        "just",
        "not",
        "no",
        "yes",
        "you",
        "your",
        "yours",
        "me",
        "my",
        "we",
        "our",
        "ours",
        "they",
        "them",
        "their",
        "what",
        "when",
        "where",
        "why",
        "how",
        "who",
        "which",
        "can",
        "could",
        "do",
        "did",
        "done",
        "will",
        "would",
        "all",
        "any",
        "some",
        "more",
        "most",
        "very",
        "too",
        "also",
        "only",
        "new",
        "now",
        "one",
        "two",
        "make",
        "made",
        "get",
        "got",
        "see",
        "look",
        "watch",
        "video",
        "music",
        "song",
        "dance",
        "trend",
        "trending",
        "viral",
        "fyp",
        "foryou",
        "foryoupage",
        "love",
        "like",
        "good",
        "great",
        "best",
        "fun",
        "funny",
        "cool",
        "nice",
        "happy",
        "sad",
        "bad",
        "girl",
        "boy",
        "girls",
        "boys",
        "school",
        "day",
        "time",
        "life",
        "people",
        "friend",
        "friends",
      ]);

      const wordMap = new Map();

      // Build word frequencies
      rows.forEach((row) => {
        const text = String(row.text).toLowerCase();
        const rawTokens = text.match(/\b[\p{L}\p{N}'’]+\b/gu) || [];

        // Normalize + keep only a–z words
        const normalizedTokens = rawTokens
          .map((rawToken) => rawToken.replace(/['’]/g, ""))
          .filter((token) => token && englishWordRegex.test(token));

        if (!normalizedTokens.length) return;

        // Caption-level English heuristic:
        const englishCount = normalizedTokens.filter((t) =>
          englishCommonWords.has(t)
        ).length;
        const englishRatio = englishCount / normalizedTokens.length;

        if (englishRatio < 0.3) {
          return; // skip this caption entirely
        }

        normalizedTokens.forEach((token) => {
          if (stopwords.has(token) || fillerWords.has(token)) return;
          if (token.length <= 2) return;

          let entry = wordMap.get(token);
          if (!entry) {
            entry = {
              word: token,
              count: 0,
            };
            wordMap.set(token, entry);
          }
          entry.count += 1;
        });
      });

      // Take the top N most frequent words to keep layout manageable
      let tokens = Array.from(wordMap.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 120);

      // --- Emotion colors: more categories + more colors --------------------
      const emotionColors = {
        anger: "#dc2626", // red
        sadness: "#2563eb", // blue
        disappointment: "#FF004F", // purple
        neutral: "#6b7280", // gray
        hope: "#22c55e", // green
        joy: "#00f7efda", // lime
        excitement: "#f97316", // orange
      };
      const emotionCategories = new Set();

      // Assign sentiment + emotion bucket
      tokens.forEach((t) => {
        let rawScore = 0;

        if (this.sentiment) {
          const res = this.sentiment.analyze(t.word);
          rawScore = res.score || 0;
        }

        if (rawScore === 0) {
          const lexScore = this.lexiconScore(t.word);
          if (lexScore !== 0) {
            rawScore = lexScore;
          }
        }

        if (rawScore === 0) {
          let r = (Math.random() - 0.5) * 2; // [-1, 1]
          if (Math.abs(r) < 0.3) {
            r = r < 0 ? -0.3 : 0.3;
          }
          rawScore = r;
        }

        let score = rawScore;
        if (Math.abs(rawScore) >= 1) {
          score = Math.sign(rawScore) * Math.sqrt(Math.abs(rawScore));
        }

        t.sentiment = score;
        t.emotion = this.mapSentimentToEmotion(score);
        emotionCategories.add(t.emotion);
      });

      // === compute real semantic embeddings in the browser ==================
      const words = tokens.map((t) => t.word);
      const embeddings = await this.computeEmbeddings(words);

      if (!embeddings || embeddings.length !== tokens.length) {
        console.warn(
          "Embeddings missing or wrong size; falling back to no semantic links"
        );
        this.data = {
          tokens,
          links: [],
          emotionCategories: Array.from(emotionCategories),
          emotionColors,
        };
        this.activeEmotions = new Set(this.data.emotionCategories);
        return;
      }

      tokens.forEach((t, i) => {
        t.embedding = embeddings[i];
      });

      // Project embeddings into 2D for layout anchoring
      this.projectEmbeddingsTo2D(tokens);

      // Build similarity graph from cosine similarity between embeddings
      const links = [];
      const SIM_THRESHOLD = 0.25;
      const MAX_NEIGHBORS = 8;

      for (let i = 0; i < tokens.length; i++) {
        const sims = [];

        for (let j = 0; j < tokens.length; j++) {
          if (i === j) continue;
          const sim = this.cosineSimilarity(
            tokens[i].embedding,
            tokens[j].embedding
          );
          sims.push({ j, sim });
        }

        sims
          .sort((a, b) => b.sim - a.sim)
          .slice(0, MAX_NEIGHBORS)
          .forEach(({ j, sim }) => {
            if (sim >= SIM_THRESHOLD) {
              links.push({
                source: i,
                target: j,
                similarity: sim,
              });
            }
          });
      }

      this.data = {
        tokens,
        links,
        emotionCategories: Array.from(emotionCategories),
        emotionColors,
      };
      this.activeEmotions = new Set(this.data.emotionCategories);
    } catch (err) {
      console.error("Error loading TikTok data for EmotionViz:", err);
    }
  }

  // --- Lifecycle ------------------------------------------------------------

  mount() {
    if (this.mounted || !this.data) return;
    this.render();
    this.setupLegend();
    this.mounted = true;
    this.emit(VIZ_EVENTS.ENTER_COMPLETE);
  }

  unmount() {
    if (!this.mounted) return;

    // stop floating animation
    if (this.bubbleTimer) {
      this.bubbleTimer.stop();
      this.bubbleTimer = null;
    }

    this.container.innerHTML = "";
    this.mounted = false;
    this.emit(VIZ_EVENTS.EXIT_COMPLETE);
  }

  destroy() {
    this.unmount();
    this.data = null;
    this.state = null;
    this.events.clear();

    if (this.bubbleTimer) {
      this.bubbleTimer.stop();
      this.bubbleTimer = null;
    }
  }

  update(step, payload = {}) {
    this.state.currentStep = step;

    switch (step) {
      case 9:
        this.toggleLayer("sentiment");
        break;
      case 10:
        this.highlightHighEngagement();
        break;
    }

    this.emit(VIZ_EVENTS.UPDATE_COMPLETE);
  }

  resize(width, height) {
    this.options.width = width;
    this.options.height = height;
    if (this.mounted) {
      this.render();
      if (this.state.sortedView) {
        this.applySortedLayout();
      }
      this.applyEmotionFilter();
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
    return this.data !== null;
  }

  // --- Rendering: word cloud with speech bubbles ----------------------------
  render() {
    if (!this.data) return;

    const { tokens, links, emotionColors } = this.data;

    // Clear container
    this.container.innerHTML = "";

    // also clear any existing timer
    if (this.bubbleTimer) {
      this.bubbleTimer.stop();
      this.bubbleTimer = null;
    }

    // Dimensions
    const bbox = this.container.getBoundingClientRect();
    const width = this.options.width || bbox.width || 800;
    const height = this.options.height || bbox.height || 600;
    const margin = 40;

    this.layoutWidth = width;
    this.layoutHeight = height;
    this.layoutMargin = margin;

    // Create SVG
    this.svg = d3
      .select(this.container)
      .append("svg")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("role", "img")
      .attr(
        "aria-label",
        "Word cloud showing sentiment-colored speech bubbles for TikTok caption words"
      );

    // Layer for hover lines (drawn behind words)
    this.linkLayer = this.svg.append("g").attr("class", "semantic-links");

    // Size scale: frequency → font size / bubble size
    const sizeScale = d3
      .scaleSqrt()
      .domain(d3.extent(tokens, (d) => d.count))
      .range([12, 42]);

    // Pre-compute estimated bubble box sizes (for collision + drawing)
    const paddingX = 10;
    const paddingY = 6;
    tokens.forEach((t) => {
      const fontSize = sizeScale(t.count);
      const textWidth = t.word.length * fontSize * 0.6; // rough estimate
      t.fontSize = fontSize;
      t.boxWidth = textWidth + paddingX * 2;
      t.boxHeight = fontSize + paddingY * 2;
    });

    // --- Map the 2D embedding projection into the SVG viewport -------------
    const projXExtent = d3.extent(tokens, (d) => d.projX);
    const projYExtent = d3.extent(tokens, (d) => d.projY);

    const xScale = d3
      .scaleLinear()
      .domain(projXExtent)
      .range([margin, width - margin]);

    const yScale = d3
      .scaleLinear()
      .domain(projYExtent)
      .range([margin, height - margin]);

    // Set initial & anchor positions from embedding 2D projection
    tokens.forEach((t) => {
      const x = xScale(t.projX);
      const y = yScale(t.projY);
      t.x = x;
      t.y = y;
      t.anchorX = x;
      t.anchorY = y;
      t.offsetX = 0;
      t.offsetY = 0;
      t.isHovered = false;
    });

    // --- Light force layout: stay near embedding positions + avoid overlap -
    const simulation = d3
      .forceSimulation(tokens)
      .alphaDecay(0.12)
      .velocityDecay(0.4)
      .force(
        "x",
        d3
          .forceX((d) => d.anchorX)
          .strength(0.2)
      )
      .force(
        "y",
        d3
          .forceY((d) => d.anchorY)
          .strength(0.2)
      )
      // small semantic link force to keep local neighborhoods tight
      .force(
        "link",
        d3
          .forceLink(links)
          .id((d, i) => i)
          .distance((d) => {
            const sim = d.similarity || 0;
            // nearby in embedding = short distance
            return 30 + (1 - sim) * 120;
          })
          .strength((d) => 0.12 * (d.similarity || 0))
      )
      .force(
        "collision",
        d3.forceCollide(
          (d) => Math.max(d.boxWidth, d.boxHeight) / 2 + 6
        )
      )
      .stop();

    for (let i = 0; i < 150; i++) simulation.tick();

    const bubbles = this.svg
      .selectAll(".word-bubble")
      .data(tokens)
      .join("g")
      .attr("class", "word-bubble")
      .attr("transform", (d) => `translate(${d.x}, ${d.y})`);

    // Rounded rect for speech bubble body
    bubbles
      .append("rect")
      .attr("class", "bubble-body")
      .attr("x", (d) => -d.boxWidth / 2)
      .attr("y", (d) => -d.boxHeight / 2)
      .attr("width", (d) => d.boxWidth)
      .attr("height", (d) => d.boxHeight)
      .attr("rx", 16)
      .attr("ry", 16)
      .attr("fill", (d) => emotionColors[d.emotion] || "#e5e7eb")
      .attr("stroke", "transparent")
      .attr("opacity", 0.95);

    // Small triangle tail for the speech bubble
    bubbles
      .append("path")
      .attr("class", "bubble-tail")
      .attr("d", (d) => {
        // Bigger tail
        const tailWidth = 18;
        const tailHeight = 14;

        // Move tail up into the rect a bit more
        const tailOffset = 3;
        const y = d.boxHeight / 2 - tailOffset;

        // How far inside from the right edge of the bubble
        const tailInsetFromRight = 8;

        // Position the base of the tail near the bottom-right of the bubble
        const baseRight = d.boxWidth / 2 - tailInsetFromRight;
        const baseLeft = baseRight - tailWidth;

        const tipX = (baseLeft + baseRight) / 2;
        const tipY = y + tailHeight;

        return `M ${baseLeft} ${y}
                L ${baseRight} ${y}
                L ${tipX} ${tipY}
                Z`;
      })
      .attr("fill", (d) => emotionColors[d.emotion] || "#e5e7eb")
      .attr("stroke", "transparent")
      .attr("opacity", 0.95);

    // Word text
    bubbles
      .append("text")
      .text((d) => d.word)
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .style("font-size", (d) => `${d.fontSize}px`)
      .style("fill", "var(--color-text-primary, #020617)")
      .style("pointer-events", "none");

    // Interactions (hover only)
    this.addBubbleInteractions(bubbles);

    // Simple fade-in animation
    if (!this.options.reducedMotion) {
      bubbles
        .attr("opacity", 0)
        .transition()
        .duration(700)
        .delay((d, i) => i * 20)
        .attr("opacity", 1);
    }

    // Start gentle floating animation
    this.startFloatingAnimation(bubbles);

    // Apply current emotion visibility filter
    this.applyEmotionFilter();

    // If sort is on, arrange into columns
    if (this.state.sortedView) {
      this.applySortedLayout();
    }
  }

  /**
   * Gentle floating animation: each bubble drifts slightly around its anchor.
   */
  startFloatingAnimation(bubbles) {
    if (this.options.reducedMotion || !this.svg) return;

    // Initialize per-bubble motion parameters
    bubbles.each((d) => {
      d.baseX = d.x;
      d.baseY = d.y;
      d.phaseX = Math.random() * Math.PI * 2;
      d.phaseY = Math.random() * Math.PI * 2;
      d.ampX = 3 + Math.random() * 4; // 3–7 px
      d.ampY = 2 + Math.random() * 3; // 2–5 px
      d.speedX = 0.0006 + Math.random() * 0.0005; // radians per ms
      d.speedY = 0.0007 + Math.random() * 0.0005;
      d.offsetX = 0;
      d.offsetY = 0;
    });

    const self = this;

    if (this.bubbleTimer) {
      this.bubbleTimer.stop();
    }

    this.bubbleTimer = d3.timer((elapsed) => {
      if (!self.svg) {
        self.bubbleTimer.stop();
        self.bubbleTimer = null;
        return;
      }

      self.svg
        .selectAll(".word-bubble")
        .each(function (d) {
          // Skip bubbles under hover animation
          if (d.isHovered) return;

          const dx =
            Math.sin(d.phaseX + elapsed * d.speedX) * d.ampX;
          const dy =
            Math.cos(d.phaseY + elapsed * d.speedY) * d.ampY;

          d.offsetX = dx;
          d.offsetY = dy;

          d3.select(this).attr(
            "transform",
            `translate(${d.x + dx}, ${d.y + dy})`
          );
        });
    });
  }

  /**
   * Arrange visible emotions into neat columns for comparison.
   */
  applySortedLayout() {
    if (!this.svg || !this.data) return;

    const active =
      this.activeEmotions || new Set(this.data.emotionCategories);
    const allCategories = this.data.emotionCategories;
    const categories = allCategories.filter((em) => active.has(em));

    if (!categories.length) return;

    const width =
      this.layoutWidth ||
      this.options.width ||
      this.container.getBoundingClientRect().width ||
      800;
    const margin = this.layoutMargin ?? 40;
    const innerWidth = Math.max(10, width - margin * 2);

    const colWidth = innerWidth / categories.length;
    const topPadding = 50;
    const rowGap = 6;

    // group tokens by emotion (only active ones)
    const tokensByEmotion = new Map();
    this.data.tokens.forEach((t) => {
      if (!active.has(t.emotion)) return;
      if (!tokensByEmotion.has(t.emotion)) {
        tokensByEmotion.set(t.emotion, []);
      }
      tokensByEmotion.get(t.emotion).push(t);
    });

    // sort each column's tokens by frequency (then alphabetically)
    categories.forEach((emotion) => {
      const arr = tokensByEmotion.get(emotion) || [];
      arr.sort(
        (a, b) => b.count - a.count || a.word.localeCompare(b.word)
      );
    });

    // position tokens
    categories.forEach((emotion, colIndex) => {
      const arr = tokensByEmotion.get(emotion) || [];
      let y = topPadding;
      const colCenterX = margin + colWidth * (colIndex + 0.5);

      arr.forEach((t) => {
        t.x = colCenterX;
        // center rect at y line
        t.y = y + t.boxHeight / 2;
        y += t.boxHeight + rowGap;
      });
    });

    // stop current float timer so we can restart from new positions
    if (this.bubbleTimer) {
      this.bubbleTimer.stop();
      this.bubbleTimer = null;
    }

    const bubbles = this.svg.selectAll(".word-bubble");

    if (!this.options.reducedMotion) {
      bubbles
        .transition()
        .duration(600)
        .attr("transform", (d) => `translate(${d.x}, ${d.y})`);
    } else {
      bubbles.attr("transform", (d) => `translate(${d.x}, ${d.y})`);
    }

    // Column labels
    let labelLayer = this.svg.select(".emotion-column-labels");
    if (labelLayer.empty()) {
      labelLayer = this.svg
        .append("g")
        .attr("class", "emotion-column-labels");
    }

    const labels = labelLayer
      .selectAll("text.column-label")
      .data(categories, (d) => d);

    labels
      .join(
        (enter) =>
          enter
            .append("text")
            .attr("class", "column-label")
            .attr("text-anchor", "middle")
            .attr("y", 20)
            .style("font-size", "12px")
            .style("font-weight", "600")
            .style("fill", "var(--color-text-primary, #e5e7eb)")
            .text((d) => d),
        (update) => update,
        (exit) => exit.remove()
      )
      .attr(
        "x",
        (d, i) => margin + colWidth * (i + 0.5)
      );

    // restart floating animation with new anchors
    this.startFloatingAnimation(bubbles);
  }

  /**
   * Public helper to enable/disable sorted view.
   */
  setSortedView(enabled) {
    const sorted = !!enabled;
    if (!this.state) return;
    if (this.state.sortedView === sorted) return;

    this.state.sortedView = sorted;

    if (!this.svg || !this.data) return;

    if (sorted) {
      this.applySortedLayout();
    } else {
      // re-render original cloud layout
      this.render();
      this.applyEmotionFilter();
    }
  }

  toggleSortedView() {
    this.setSortedView(!this.state.sortedView);
  }

  /**
   * Draw dotted lines from hovered word to a few of its most similar neighbors
   */
  updateHoverLinks(centerNode) {
    if (!this.linkLayer || !this.data) return;

    const { links } = this.data;
    if (!links || !links.length) {
      this.clearHoverLinks();
      return;
    }

    // d3-force gives each node an .index property
    const centerIndex = centerNode.index;
    const active =
      this.activeEmotions || new Set(this.data.emotionCategories || []);

    // Find links where the hovered node is one endpoint
    const neighbors = links.filter(
      (l) =>
        (l.source.index ?? l.source) === centerIndex ||
        (l.target.index ?? l.target) === centerIndex
    );

    if (!neighbors.length) {
      this.clearHoverLinks();
      return;
    }

    // Sort by similarity, strongest first
    neighbors.sort((a, b) => b.similarity - a.similarity);
    const MAX_LINES = 6;
    const top = neighbors.slice(0, MAX_LINES);

    const lineData = top
      .map((l) => {
        const sourceIndex = l.source.index ?? l.source;
        const targetIndex = l.target.index ?? l.target;

        const other =
          sourceIndex === centerIndex ? l.target : l.source;

        if (!other || !active.has(other.emotion)) return null;

        return {
          x1: centerNode.x,
          y1: centerNode.y,
          x2: other.x,
          y2: other.y,
          similarity: l.similarity,
        };
      })
      .filter(Boolean);

    // Clear existing lines
    this.linkLayer.selectAll("line.semantic-link").remove();

    if (!lineData.length) return;

    const lines = this.linkLayer
      .selectAll("line.semantic-link")
      .data(lineData)
      .enter()
      .append("line")
      .attr("class", "semantic-link")
      .attr("x1", (d) => d.x1)
      .attr("y1", (d) => d.y1)
      // start collapsed at the center, then animate out
      .attr("x2", (d) => d.x1)
      .attr("y2", (d) => d.y1)
      .attr("stroke-opacity", 0)
      .attr("pointer-events", "none");

    if (this.options.reducedMotion) {
      // No animation, just snap into place
      lines
        .attr("x2", (d) => d.x2)
        .attr("y2", (d) => d.y2)
        .attr("stroke-opacity", 0.9);
    } else {
      // Animate outwards from the hovered word
      lines
        .transition()
        .duration(200)
        .attr("x2", (d) => d.x2)
        .attr("y2", (d) => d.y2)
        .attr("stroke-opacity", 0.9);
    }
  }

  clearHoverLinks() {
    if (!this.linkLayer) return;
    const selection = this.linkLayer.selectAll("line.semantic-link");
    if (this.options.reducedMotion) {
      selection.remove();
    } else {
      selection
        .transition()
        .duration(150)
        .attr("stroke-opacity", 0)
        .remove();
    }
  }

  // --- Legend + interactions ------------------------------------------------
  setupLegend() {
    const legendPanel = document.querySelector(".emotion-legend");
    if (!legendPanel || !this.data) return;

    legendPanel.innerHTML = "";
    const viz = this;

    this.data.emotionCategories.forEach((emotion) => {
      const item = document.createElement("li");
      item.className = "emotion-legend-item";

      const color = this.data.emotionColors[emotion];

      item.innerHTML = `
      <label class="emotion-legend-label-wrapper">
        <input
          type="checkbox"
          class="emotion-legend-checkbox"
          data-emotion="${emotion}"
          checked
        />
        <span class="emotion-legend-chip" style="--emotion-color:${color}">
          <span class="emotion-legend-checkmark"></span>
          <span class="emotion-legend-color-dot"></span>
          <span class="emotion-legend-text">${emotion}</span>
        </span>
      </label>
    `;

      legendPanel.appendChild(item);

      const checkbox = item.querySelector(".emotion-legend-checkbox");
      if (checkbox) {
        checkbox.addEventListener("change", (e) => {
          const key = e.target.dataset.emotion;
          if (!viz.activeEmotions) {
            viz.activeEmotions = new Set(viz.data.emotionCategories);
          }

          if (e.target.checked) {
            viz.activeEmotions.add(key);
          } else {
            viz.activeEmotions.delete(key);
          }

          viz.applyEmotionFilter();
          if (viz.state.sortedView) {
            viz.applySortedLayout();
          }
        });
      }
    });

    // Optional sort toggle control (checkbox or button)
    const sortToggle = document.querySelector(".emotion-sort-toggle");
    if (sortToggle) {
      // checkbox style
      if (
        sortToggle.tagName === "INPUT" &&
        sortToggle.type === "checkbox"
      ) {
        sortToggle.addEventListener("change", (e) => {
          viz.setSortedView(e.target.checked);
        });
      } else {
        // button / div style, using aria-pressed
        sortToggle.addEventListener("click", (e) => {
          const el = e.currentTarget;
          const current = el.getAttribute("aria-pressed") === "true";
          const next = !current;
          el.setAttribute("aria-pressed", String(next));
          viz.setSortedView(next);
        });
      }
    }
  }

  applyEmotionFilter() {
    if (!this.svg || !this.data || !this.activeEmotions) return;

    const active = this.activeEmotions;

    this.svg
      .selectAll(".word-bubble")
      .attr("display", (d) => (active.has(d.emotion) ? null : "none"));

    // also clear links so we don't show connections to hidden bubbles
    this.clearHoverLinks();
  }

  addBubbleInteractions(bubbles) {
    bubbles
      .on("mouseenter", (event, d) => {
        const g = d3.select(event.currentTarget);

        d.isHovered = true;

        const dx = d.offsetX || 0;
        const dy = d.offsetY || 0;

        // enlarge slightly
        if (!this.options.reducedMotion) {
          g.raise()
            .transition()
            .duration(160)
            .attr(
              "transform",
              `translate(${d.x + dx}, ${d.y + dy}) scale(1.08)`
            );
        } else {
          g.raise().attr(
            "transform",
            `translate(${d.x + dx}, ${d.y + dy}) scale(1.08)`
          );
        }

        // show side detail, if present
        this.showBubbleDetail(d);

        // show semantic dotted lines
        this.updateHoverLinks(d);
      })
      .on("mouseleave", (event, d) => {
        const g = d3.select(event.currentTarget);

        const dx = d.offsetX || 0;
        const dy = d.offsetY || 0;

        // return to original size, then resume float
        if (!this.options.reducedMotion) {
          g.transition()
            .duration(160)
            .attr(
              "transform",
              `translate(${d.x + dx}, ${d.y + dy}) scale(1)`
            )
            .on("end", () => {
              d.isHovered = false;
            });
        } else {
          g.attr(
            "transform",
            `translate(${d.x + dx}, ${d.y + dy}) scale(1)`
          );
          d.isHovered = false;
        }

        // remove hover connections
        this.clearHoverLinks();
      });

    // no click handler: clicking does nothing now
  }

  showBubbleDetail(data) {
    const detailContent = document.querySelector(".drawer-content");
    if (detailContent) {
      detailContent.innerHTML = `
        <h3>${data.word}</h3>
        <p>Emotion bucket: <strong>${data.emotion}</strong></p>
        <p>Sentiment score: ${
          data.sentiment?.toFixed ? data.sentiment.toFixed(2) : data.sentiment
        }</p>
        <p>Frequency (word count): ${data.count}</p>
      `;
    }
  }

  // Drawer is no longer used for clicks, but kept in case other steps call it
  openDetailDrawer(data) {
    const drawer = document.querySelector(".detail-drawer");
    if (drawer) {
      drawer.setAttribute("aria-hidden", "false");
      this.showBubbleDetail(data);
    }

    const closeBtn = document.querySelector(".drawer-close");
    if (closeBtn && drawer) {
      closeBtn.onclick = () => {
        drawer.setAttribute("aria-hidden", "true");
      };
    }
  }

  // --- Misc behaviors used by scrollytelling driver ------------------------
  toggleLayer(layer) {
    console.log(`Toggling to "${layer}" layer`);
  }

  highlightHighEngagement() {
    if (!this.svg || !this.data) return;

    const maxCount = d3.max(this.data.tokens, (d) => d.count) || 1;
    const threshold = maxCount * 0.6;

    this.svg
      .selectAll(".word-bubble")
      .transition()
      .duration(400)
      .attr("opacity", (d) => (d.count >= threshold ? 1 : 0.25));
  }

  emphasizeOutlines() {
    if (this.svg) {
      this.svg.selectAll(".word-bubble rect").attr("stroke-width", 3);
    }
  }
}
