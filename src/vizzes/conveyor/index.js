// Conveyor Belt Visualization - Interactive guessing game
import { EventEmitter, prefersReducedMotion } from '../shared/utils.js';
import { VIZ_EVENTS, DEFAULT_OPTIONS } from '../shared/types.js';

export class ConveyorViz extends EventEmitter {
  constructor() {
    super();
    this.container = null;
    this.data = null;
    this.state = {
      currentIndex: 0,
      isMoving: false,
      isPaused: true,
      hasGuessed: false,
      currentGuess: '',
      score: 0,
      totalAttempts: 0,
      revealed: false,
      answeredCorrectly: [] // Track which questions were answered correctly
    };
    this.options = { ...DEFAULT_OPTIONS };
    this.mounted = false;
  }

  async init(selector, options = {}) {
    this.container = typeof selector === 'string' ?
      document.querySelector(selector) : selector;

    if (!this.container) {
      throw new Error(`Container not found: ${selector}`);
    }

    this.options = { ...this.options, ...options };

    // Load ingredient data
    await this.loadData();
    this.emit(VIZ_EVENTS.DATA_READY);
  }

  async loadData() {
    // Use mock data for ingredients that make TikToks popular
    this.data = [
      {
        id: 'duration',
        label: 'Ideal Video Duration ⏱️',
        answer: '20-30 seconds',
        hint: 'Keep it punchy to maximize completion and replays.',
        options: ['10-15 seconds', '45-60 seconds', '20-30 seconds', '2-3 minutes']
      },
      {
        id: 'popular_sound',
        label: 'Most Popular Sound to Use 🎵',
        answer: 'Anxiety by Doechii',
        hint: 'This track topped the TikTok charts recently.',
        options: ['Streets by Doja Cat', 'Cold Water by Justin Bieber', 'Anxiety by Doechii', 'Cruel Summer by Taylor Swift']
      },
      {
        id: 'danceability_avg',
        label: 'Average Danceability for Sounds 💃',
        answer: '0.8',
        hint: 'On a 0–1 scale, higher means more groove.',
        options: ['0.4', '0.6', '0.8', '0.2']
      },
      {
        id: 'energy_avg',
        label: 'Average Energy for Sounds ⚡',
        answer: '0.7',
        hint: '0–1 scale; think intensity and activity.',
        options: ['0.3', '0.5', '0.7', '0.9']
      },
      {
        id: 'caption_word',
        label: 'What Word to Include in the Caption ✍️',
        answer: 'fyp',
        hint: 'A classic tag to boost discoverability.',
        options: ['pls', 'linkinbio', 'omg', 'fyp']
      },
      {
        id: 'community',
        label: 'Popular TikTok Community 🐾',
        answer: 'pets',
        hint: 'Content that never goes out of style.',
        options: ['finance', 'origami', 'pets', 'meteorology']
      }
    ];
  }

  mount() {
    if (this.mounted) return;
    this.render();
    this.setupEventListeners();
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
    // Allow external step updates
    if (step === 1) {
      this.startConveyor();
    }
  }

  resize(width, height) {
    this.options.width = width;
    this.options.height = height;
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

  render() {
    if (!this.data) return;

    this.container.innerHTML = '';
    this.container.className = 'conveyor-container';

    // Create header with score
    const header = document.createElement('div');
    header.className = 'conveyor-header';
    header.innerHTML = `
      <h3>Guess the Ingredient!</h3>
      <div class="conveyor-score">
        <span class="score-label">Score:</span>
        <span class="score-value">${this.state.score}/${this.data ? this.data.length : 0}</span>
      </div>
    `;
    this.container.appendChild(header);

    // Create controls (moved above belt)
    const controls = document.createElement('div');
    controls.className = 'conveyor-controls';
    controls.innerHTML = `
      <button class="btn-primary start-btn" aria-label="Start conveyor belt">
        Start Conveyor
      </button>
      <button class="btn-secondary restart-btn" aria-label="Restart from beginning" style="display:none;">
        Restart
      </button>
    `;
    this.container.appendChild(controls);

    // Create interaction panel (moved above belt)
    const panel = this.createInteractionPanel();
    this.container.appendChild(panel);

    // Create conveyor belt wrapper (now below controls and panel)
    const beltWrapper = document.createElement('div');
    beltWrapper.className = 'conveyor-belt-wrapper';
    
    // Create conveyor belt track
    const belt = document.createElement('div');
    belt.className = 'conveyor-belt';
    belt.setAttribute('role', 'region');
    belt.setAttribute('aria-label', 'Conveyor belt with ingredient boxes');

    // Create boxes
    this.data.forEach((item, index) => {
      const box = this.createBox(item, index);
      belt.appendChild(box);
    });

    beltWrapper.appendChild(belt);
    this.container.appendChild(beltWrapper);

    // Position first box at center
    this.updateBeltPosition();
  }

  createBox(item, index) {
    const box = document.createElement('div');
    box.className = 'conveyor-box';
    box.setAttribute('data-index', index);
    box.setAttribute('data-id', item.id);

    // Front face (question)
    const front = document.createElement('div');
    front.className = 'box-face box-front';
    front.innerHTML = `
      <div class="box-label">${item.label}</div>
      <div class="box-hint">${item.hint}</div>
      <div class="box-number">#${index + 1}</div>
    `;

    // Back face (answer)
    const back = document.createElement('div');
    back.className = 'box-face box-back';
    back.innerHTML = `
      <div class="box-answer-label">Answer:</div>
      <div class="box-answer">${item.answer}</div>
      <div class="box-checkmark">✓</div>
      <div class="box-xmark">✗</div>
    `;

    box.appendChild(front);
    box.appendChild(back);

    return box;
  }

  createInteractionPanel() {
    const panel = document.createElement('div');
    panel.className = 'interaction-panel';
    panel.style.display = 'none';

    panel.innerHTML = `
      <div class="current-ingredient">
        <h4 class="ingredient-title"></h4>
        <p class="ingredient-hint"></p>
        <p class="attempts-remaining" aria-live="polite"></p>
      </div>
      
      <div class="options-grid" role="group" aria-label="Answer choices"></div>

      <div class="feedback-area" style="display:none;">
        <div class="feedback-message"></div>
        <button class="btn-secondary reveal-btn" aria-label="Reveal the answer">
          Reveal Answer
        </button>
        <button class="btn-primary next-btn" style="display:none;" aria-label="Move to next ingredient">
          Next →
        </button>
      </div>
    `;

    return panel;
  }

  setupEventListeners() {
    // Start button
    const startBtn = this.container.querySelector('.start-btn');
    startBtn?.addEventListener('click', () => this.startConveyor());

    // Restart button
    const restartBtn = this.container.querySelector('.restart-btn');
    restartBtn?.addEventListener('click', () => this.restart());

    // Option buttons (event delegation)
    const panel = this.container.querySelector('.interaction-panel');
    panel?.addEventListener('click', (e) => {
      const target = e.target;
      if (target && target.classList?.contains('option-btn') && !target.disabled) {
        const value = target.getAttribute('data-value');
        this.submitGuess(value, target);
      }
    });

    // Reveal button
    const revealBtn = this.container.querySelector('.reveal-btn');
    revealBtn?.addEventListener('click', () => this.revealAnswer());

    // Next button
    const nextBtn = this.container.querySelector('.next-btn');
    nextBtn?.addEventListener('click', () => this.moveToNext());
  }

  updateBeltPosition() {
    const belt = this.container.querySelector('.conveyor-belt');
    if (!belt) return;

    // Center the current box using actual sizes (responsive-friendly)
    const currentBox = this.container.querySelector(
      `.conveyor-box[data-index="${this.state.currentIndex}"]`
    );
    if (!currentBox) return;

    // Get live dimensions
    const styles = window.getComputedStyle(belt);
    // Flex row gap is exposed as column-gap/gap depending on browser
    const gapStr = styles.columnGap || styles.gap || '0px';
    const gap = parseFloat(gapStr) || 0;
    const boxW = currentBox.getBoundingClientRect().width;
    const step = boxW + gap; // width of one box plus the gap between boxes

    // Half width of the box for proper centering without hardcoding
    const halfBox = boxW / 2;
    const offset = -(this.state.currentIndex * step);

    // Keep the original centering approach but with dynamic values
    belt.style.transform = `translateX(calc(50% - ${halfBox}px + ${offset}px))`;
  }

  startConveyor() {
    this.state.isPaused = false;
    this.state.isMoving = false;

    // Hide start button, show interaction panel
    const startBtn = this.container.querySelector('.start-btn');
    startBtn.style.display = 'none';

    const panel = this.container.querySelector('.interaction-panel');
    panel.style.display = 'block';

    // Show current ingredient info
    this.showCurrentIngredient();

    // Animate belt to position
    const belt = this.container.querySelector('.conveyor-belt');
    belt?.classList.add('active');
  }

  showCurrentIngredient() {
    const current = this.data[this.state.currentIndex];
    if (!current) return;

    const title = this.container.querySelector('.ingredient-title');
    const hint = this.container.querySelector('.ingredient-hint');
    const attemptsEl = this.container.querySelector('.attempts-remaining');
    
    if (title) title.textContent = current.label;
    if (hint) hint.textContent = `Hint: ${current.hint}`;

    // Reset guess state
    this.state.hasGuessed = false;
    this.state.revealed = false;
    this.state.currentGuess = '';
    this.state.attemptsLeft = 3; // allow a few tries

    if (attemptsEl) attemptsEl.textContent = `Attempts left: ${this.state.attemptsLeft}`;

    // Render options
    const optionsWrap = this.container.querySelector('.options-grid');
    if (optionsWrap) {
      optionsWrap.innerHTML = '';
      const options = (current.options && current.options.length
        ? current.options.slice()
        : this.generateOptions(current.answer));
      const shuffled = this.shuffle(options);
      shuffled.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.type = 'button';
        btn.setAttribute('data-value', opt);
        btn.textContent = opt;
        optionsWrap.appendChild(btn);
      });
    }

    const feedbackArea = this.container.querySelector('.feedback-area');
    if (feedbackArea) feedbackArea.style.display = 'none';

    // Reset reveal and next buttons
    const revealBtn = this.container.querySelector('.reveal-btn');
    const nextBtn = this.container.querySelector('.next-btn');
    if (revealBtn) {
      revealBtn.style.display = 'none';
      revealBtn.disabled = true;
    }
    if (nextBtn) nextBtn.style.display = 'none';

    // Highlight current box
    const boxes = this.container.querySelectorAll('.conveyor-box');
    boxes.forEach((box, i) => {
      box.classList.toggle('active', i === this.state.currentIndex);
    });

    // Focus first option for accessibility
    const firstOpt = this.container.querySelector('.option-btn');
    firstOpt?.focus();
  }

  submitGuess(guess, btnEl) {
    if (!guess) return;

  this.state.hasGuessed = true;
  this.state.currentGuess = guess;

    // Disable clicked option to prevent repeat
    if (btnEl) btnEl.disabled = true;

    // Check answer (fuzzy match)
    const current = this.data[this.state.currentIndex];
    const isCorrect = this.checkAnswer(guess, current.answer);

    if (isCorrect) {
      this.state.score++;
      this.showFeedback(`🎉 Correct! "${current.answer}"`, 'correct');
      // Disable all options after correct
      this.disableAllOptions();
      
      // Auto-reveal after short delay
      setTimeout(() => this.revealAnswer(), 1000);
    } else {
      this.state.attemptsLeft = Math.max(0, (this.state.attemptsLeft || 1) - 1);
      const attemptsEl = this.container.querySelector('.attempts-remaining');
      if (attemptsEl) attemptsEl.textContent = `Attempts left: ${this.state.attemptsLeft}`;

      if (this.state.attemptsLeft > 0) {
        this.showFeedback(`Not quite! Try again.`, 'incorrect');
      } else {
        this.showFeedback(`Out of attempts. You can reveal the answer.`, 'warning');
        // Disable remaining options
        this.disableAllOptions();
        // Enable reveal button now that attempts are exhausted
        const revealBtn = this.container.querySelector('.reveal-btn');
        if (revealBtn) {
          revealBtn.style.display = 'inline-block';
          revealBtn.disabled = false;
        }
      }
    }

    // Update score
    this.updateScore();

    // Show reveal/next buttons
    const feedbackArea = this.container.querySelector('.feedback-area');
    feedbackArea.style.display = 'block';
  }

  disableAllOptions() {
    const opts = this.container.querySelectorAll('.option-btn');
    opts.forEach(o => (o.disabled = true));
  }

  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  generateOptions(correct) {
    // Fallback: mix correct with answers from other items
    const pool = this.data.map(d => d.answer).filter(a => a && a !== correct);
    const distractors = this.shuffle(pool).slice(0, 3);
    return this.shuffle([correct, ...distractors]);
  }

  checkAnswer(guess, answer) {
    // Simple fuzzy matching
    const normalizeText = (text) => text.toLowerCase().replace(/[^a-z0-9]/g, '');
    const normalizedGuess = normalizeText(guess);
    const normalizedAnswer = normalizeText(answer);

    // Check if answer contains guess or vice versa
    return normalizedAnswer.includes(normalizedGuess) || 
           normalizedGuess.includes(normalizedAnswer) ||
           normalizedGuess === normalizedAnswer;
  }

  showFeedback(message, type) {
    const feedbackMsg = this.container.querySelector('.feedback-message');
    if (feedbackMsg) {
      feedbackMsg.textContent = message;
      feedbackMsg.className = `feedback-message feedback-${type}`;
    }
  }

  revealAnswer() {
    if (this.state.revealed) return;

    // Prevent reveal unless user is out of attempts or already correct
    const current = this.data[this.state.currentIndex];
    const lastGuessCorrect = this.checkAnswer(this.state.currentGuess || '', current.answer);
    if (!lastGuessCorrect && (this.state.attemptsLeft ?? 0) > 0) {
      this.showFeedback('Take up to 3 attempts before revealing.', 'warning');
      return;
    }

    this.state.revealed = true;

    // Track if this was answered correctly
    this.state.answeredCorrectly[this.state.currentIndex] = lastGuessCorrect;

    // Flip current box and mark as correct or incorrect
    const currentBox = this.container.querySelector(`.conveyor-box[data-index="${this.state.currentIndex}"]`);
    if (currentBox) {
      currentBox.classList.add('flipped');
      if (lastGuessCorrect) {
        currentBox.classList.add('correct');
      } else {
        currentBox.classList.add('incorrect');
      }
    }

    // Hide reveal button, show next button
    const revealBtn = this.container.querySelector('.reveal-btn');
    const nextBtn = this.container.querySelector('.next-btn');
    
    if (revealBtn) revealBtn.style.display = 'none';
    if (nextBtn) {
      nextBtn.style.display = 'inline-block';
      
      // Update button text for last item
      if (this.state.currentIndex >= this.data.length - 1) {
        nextBtn.textContent = 'Finish';
      } else {
        nextBtn.textContent = 'Next →';
      }
    }
  }

  moveToNext() {
    if (this.state.currentIndex >= this.data.length - 1) {
      this.finish();
      return;
    }

    // Remove active and flipped class from current box before moving
    const currentBox = this.container.querySelector(`.conveyor-box[data-index="${this.state.currentIndex}"]`);
    if (currentBox) {
      currentBox.classList.remove('active');
      // Don't remove flipped - keep it revealed for review
    }

    // Move to next ingredient
    this.state.currentIndex++;
    
    // Animate belt
    this.state.isMoving = true;
    this.updateBeltPosition();

    // After animation, show next ingredient
    setTimeout(() => {
      this.state.isMoving = false;
      this.showCurrentIngredient();
    }, 600);
  }

  finish() {
    // Remove active class from the last card
    const currentBox = this.container.querySelector(`.conveyor-box[data-index="${this.state.currentIndex}"]`);
    if (currentBox) {
      currentBox.classList.remove('active');
    }

    const panel = this.container.querySelector('.interaction-panel');
    panel.innerHTML = `
      <div class="completion-message">
        <h3>🎊 Complete!</h3>
        <p class="final-score">Your Score: ${this.state.score}/${this.data ? this.data.length : 0}</p>
        <p class="score-message">${this.getScoreMessage()}</p>
      </div>
    `;

    // Show restart button
    const restartBtn = this.container.querySelector('.restart-btn');
    if (restartBtn) {
      restartBtn.style.display = 'inline-block';
    }
  }

  getScoreMessage() {
    const total = this.data ? this.data.length : 1;
    const percentage = (this.state.score / total) * 100;
    
    if (percentage === 100) return '🌟 Perfect! You know your TikTok ingredients!';
    if (percentage >= 80) return '🔥 Excellent! You\'re ready to go viral!';
    if (percentage >= 60) return '👍 Good job! Keep learning!';
    if (percentage >= 40) return '💪 Not bad! Study the trends more!';
    return '📚 Keep practicing! Every creator starts somewhere!';
  }

  updateScore() {
    const scoreValue = this.container.querySelector('.score-value');
    if (scoreValue) {
      scoreValue.textContent = `${this.state.score}/${this.data ? this.data.length : 0}`;
    }
  }

  restart() {
    // Reset state
    this.state = {
      currentIndex: 0,
      isMoving: false,
      isPaused: true,
      hasGuessed: false,
      currentGuess: '',
      score: 0,
      totalAttempts: 0,
      revealed: false,
      answeredCorrectly: []
    };

    // Reset all boxes (remove flipped class)
    const boxes = this.container.querySelectorAll('.conveyor-box');
    boxes.forEach(box => box.classList.remove('flipped', 'active', 'correct', 'incorrect'));

    // Re-render
    this.render();
    this.setupEventListeners();
  }
}
