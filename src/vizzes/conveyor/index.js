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
      answeredCorrectly: [], // Track which questions were answered correctly
      visitingScene: null // Track if user is visiting a scene for hints
    };
    this.options = { ...DEFAULT_OPTIONS };
    this.mounted = false;

    // Map quiz question IDs to their corresponding scene sections
    this.sceneMap = {
      'duration': { section: 'scene-duration', label: 'Stopwatch' },
      'popular_sound': { section: 'scene-viral-sounds', label: 'Vinyl Records' },
      'danceability_avg': { section: 'scene-music-galaxy', label: 'Music Galaxy' },
      'energy_avg': { section: 'scene-music-galaxy', label: 'Music Galaxy' },
      'caption_word': { section: 'scene-emotion', label: 'Captions' },
      'community': { section: 'scene-category', label: 'Ranking Pyramid' }
    };
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
        hint: 'Check the stopwatch—which duration got the biggest radius?',
        options: ['10-15 seconds', '45-60 seconds', '20-30 seconds', '2-3 minutes']
      },
      {
        id: 'popular_sound',
        label: 'Most Popular Sound to Use 🎵',
        answer: 'Anxiety by Doechii',
        hint: 'Spin back to the vinyl—which track sits on the outermost ring?',
        options: ['Streets by Doja Cat', 'Cold Water by Justin Bieber', 'Anxiety by Doechii', 'Cruel Summer by Taylor Swift']
      },
      {
        id: 'danceability_avg',
        label: 'Average Danceability for Sounds 💃',
        answer: '0.8',
        hint: 'Remember the planet colors? What\'s the typical danceability score?',
        options: ['0.4', '0.6', '0.8', '0.2']
      },
      {
        id: 'energy_avg',
        label: 'Average Energy for Sounds ⚡',
        answer: '0.7',
        hint: 'Think solar system—how far from the sun are most planets orbiting?',
        options: ['0.3', '0.5', '0.7', '0.9']
      },
      {
        id: 'caption_word',
        label: 'What Word to Include in the Caption ✍️',
        answer: 'viral',
        hint: 'The emotion bubbles revealed the most popular language—what was it?',
        options: ['pls', 'linkinbio', 'omg', 'viral']
      },
      {
        id: 'community',
        label: 'Popular TikTok Community 🐾',
        answer: 'pets',
        hint: 'Who climbed highest on the pyramid without even trying?',
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
    box.className = 'conveyor-box inactive';
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
      <div class="box-question-on-back">${item.label}</div>
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

      <div class="hint-navigation" style="display:none;">
        <p class="hint-prompt">Need a hint? Explore the scene where this was covered:</p>
        <button class="btn-secondary go-to-scene-btn" aria-label="Go to scene for hints">
          <span class="go-to-icon">&#x21AA;</span>
          <span class="go-to-label">Visit Scene</span>
        </button>
      </div>

      <div class="feedback-area" style="display:none;">
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

    // Next button
    const nextBtn = this.container.querySelector('.next-btn');
    nextBtn?.addEventListener('click', () => this.moveToNext());

    // Go to scene button for hints
    const goToSceneBtn = this.container.querySelector('.go-to-scene-btn');
    goToSceneBtn?.addEventListener('click', () => this.navigateToHintScene());
  }

  updateBeltPosition() {
    const boxes = this.container.querySelectorAll('.conveyor-box');
    if (!boxes.length) return;

    boxes.forEach((box, index) => {
      const dataIndex = parseInt(box.getAttribute('data-index'));
      
      // Position based on state relative to current index
      if (dataIndex < this.state.currentIndex) {
        // Completed cards - move to the left
        box.style.transform = 'translateX(-400px)';
        box.classList.remove('waiting', 'active-card');
        box.classList.add('completed-card');
      } else if (dataIndex === this.state.currentIndex) {
        // Active card - center position
        box.style.transform = 'translateX(0)';
        box.classList.remove('waiting', 'completed-card');
        box.classList.add('active-card');
      } else {
        // Waiting cards - stay on the right
        box.style.transform = 'translateX(400px)';
        box.classList.add('waiting');
        box.classList.remove('active-card', 'completed-card');
      }
    });
  }

  startConveyor() {
    this.state.isPaused = false;
    this.state.isMoving = false;

    // Remove inactive class from all boxes
    const boxes = this.container.querySelectorAll('.conveyor-box');
    boxes.forEach(box => box.classList.remove('inactive'));

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

    // Reset next button
    const nextBtn = this.container.querySelector('.next-btn');
    if (nextBtn) nextBtn.style.display = 'none';

    // Reset hint navigation
    const hintNav = this.container.querySelector('.hint-navigation');
    if (hintNav) hintNav.style.display = 'none';

    // Update the go-to-scene button label for current question
    this.updateHintNavigationLabel();

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

    // Capture the current index NOW before any async operations
    const questionIndex = this.state.currentIndex;

    if (isCorrect) {
      this.state.score++;
      // Mark the correct button as green
      if (btnEl) btnEl.classList.add('correct-answer');

      // Disable all options after correct
      this.disableAllOptions();

      // Show feedback area and next button immediately
      const feedbackArea = this.container.querySelector('.feedback-area');
      const nextBtn = this.container.querySelector('.next-btn');

      if (feedbackArea) feedbackArea.style.display = 'flex';

      if (nextBtn) {
        nextBtn.style.display = 'block';
        // Update button text for last item
        if (this.state.currentIndex >= this.data.length - 1) {
          nextBtn.textContent = 'Finish';
        } else {
          nextBtn.textContent = 'Next →';
        }
      }

      // Auto-reveal after short delay - pass captured index
      setTimeout(() => this.revealAnswer(questionIndex, true), 1000);
    } else {
      // Mark the incorrect button as red
      if (btnEl) btnEl.classList.add('incorrect-answer');

      this.state.attemptsLeft = Math.max(0, (this.state.attemptsLeft || 1) - 1);
      const attemptsEl = this.container.querySelector('.attempts-remaining');
      if (attemptsEl) attemptsEl.textContent = `Attempts left: ${this.state.attemptsLeft}`;

      if (this.state.attemptsLeft > 0) {
        // Show hint navigation to help user find the answer
        this.showHintNavigation();
      } else {
        // Don't show feedback message - just highlight the correct answer
        // Disable remaining options
        this.disableAllOptions();

        // Highlight the correct answer in green
        const current = this.data[this.state.currentIndex];
        const allOptions = this.container.querySelectorAll('.option-btn');
        allOptions.forEach(opt => {
          if (opt.getAttribute('data-value') === current.answer) {
            opt.classList.add('correct-answer');
          }
        });

        // Show next button immediately without reveal step
        const feedbackArea = this.container.querySelector('.feedback-area');
        const nextBtn = this.container.querySelector('.next-btn');

        if (feedbackArea) feedbackArea.style.display = 'flex';

        if (nextBtn) {
          nextBtn.style.display = 'block';
          // Update button text for last item
          if (this.state.currentIndex >= this.data.length - 1) {
            nextBtn.textContent = 'Finish';
          } else {
            nextBtn.textContent = 'Next →';
          }
        }

        // Auto-reveal after short delay - pass captured index
        setTimeout(() => this.revealAnswer(questionIndex, false), 1000);
      }
    }

    // Update score
    this.updateScore();

    // Show feedback area only when out of attempts
    if (!isCorrect && this.state.attemptsLeft <= 0) {
      const feedbackArea = this.container.querySelector('.feedback-area');
      feedbackArea.style.display = 'block';
    }
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

  /**
   * Reveal the answer for a specific question
   * @param {number} questionIndex - The index of the question to reveal (captured at guess time)
   * @param {boolean} wasCorrect - Whether the answer was correct (captured at guess time)
   */
  revealAnswer(questionIndex = null, wasCorrect = null) {
    // Use provided index or fall back to current (for backwards compatibility)
    const indexToReveal = questionIndex !== null ? questionIndex : this.state.currentIndex;

    // Check if this specific question was already revealed
    if (this.state.answeredCorrectly[indexToReveal] !== undefined) {
      // Already revealed, just ensure the card is flipped
      const box = this.container.querySelector(`.conveyor-box[data-index="${indexToReveal}"]`);
      if (box && !box.classList.contains('flipped')) {
        box.classList.add('flipped');
        box.classList.add(this.state.answeredCorrectly[indexToReveal] ? 'correct' : 'incorrect');
      }
      return;
    }

    // Determine correctness - use provided value or calculate
    let isCorrect = wasCorrect;
    if (isCorrect === null) {
      const current = this.data[indexToReveal];
      isCorrect = this.checkAnswer(this.state.currentGuess || '', current.answer);
      // Prevent reveal if still has attempts and not correct
      if (!isCorrect && (this.state.attemptsLeft ?? 0) > 0 && indexToReveal === this.state.currentIndex) {
        this.showFeedback('Take up to 3 attempts before revealing.', 'warning');
        return;
      }
    }

    // Track that this question was answered
    this.state.answeredCorrectly[indexToReveal] = isCorrect;

    // Mark revealed only if this is the current question
    if (indexToReveal === this.state.currentIndex) {
      this.state.revealed = true;
    }

    // Flip the specific box and mark as correct or incorrect
    const currentBox = this.container.querySelector(`.conveyor-box[data-index="${indexToReveal}"]`);
    if (currentBox) {
      currentBox.classList.add('flipped');
      if (isCorrect) {
        currentBox.classList.add('correct');
      } else {
        currentBox.classList.add('incorrect');
      }
    }

    // Show next button (only if we're on the current question)
    if (indexToReveal === this.state.currentIndex) {
      const nextBtn = this.container.querySelector('.next-btn');

      if (nextBtn) {
        nextBtn.style.display = 'block';

        // Update button text for last item
        if (this.state.currentIndex >= this.data.length - 1) {
          nextBtn.textContent = 'Finish';
        } else {
          nextBtn.textContent = 'Next →';
        }
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

    // Center all cards in a row
    const boxes = this.container.querySelectorAll('.conveyor-box');
    const totalCards = boxes.length;
    const cardWidth = 220; // from CSS
    const gap = 32; // from CSS
    const totalWidth = (totalCards * cardWidth) + ((totalCards - 1) * gap);
    const startOffset = -(totalWidth / 2) + (cardWidth / 2);
    
    boxes.forEach((box, index) => {
      const offset = startOffset + (index * (cardWidth + gap));
      box.style.transform = `translateX(${offset}px)`;
      box.classList.remove('waiting', 'active-card', 'completed-card');
      box.classList.add('final-position');
    });

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
      answeredCorrectly: [],
      visitingScene: null
    };

    // Reset all boxes (remove flipped class)
    const boxes = this.container.querySelectorAll('.conveyor-box');
    boxes.forEach(box => box.classList.remove('flipped', 'active', 'correct', 'incorrect'));

    // Re-render
    this.render();
    this.setupEventListeners();
  }

  // ============================================
  // HINT NAVIGATION - Go to scene for hints
  // ============================================

  /**
   * Update the hint navigation button label based on current question
   */
  updateHintNavigationLabel() {
    const current = this.data?.[this.state.currentIndex];
    if (!current) return;

    const sceneInfo = this.sceneMap[current.id];
    const goToLabel = this.container.querySelector('.go-to-scene-btn .go-to-label');
    if (goToLabel && sceneInfo) {
      goToLabel.textContent = `Visit ${sceneInfo.label}`;
    }
  }

  /**
   * Show the hint navigation panel
   */
  showHintNavigation() {
    const hintNav = this.container.querySelector('.hint-navigation');
    if (hintNav) {
      hintNav.style.display = 'block';
    }
  }

  /**
   * Navigate to the scene that has hints for the current question
   */
  navigateToHintScene() {
    const current = this.data?.[this.state.currentIndex];
    if (!current) return;

    const sceneInfo = this.sceneMap[current.id];
    if (!sceneInfo) return;

    // Store current state so we can return
    this.state.visitingScene = sceneInfo.section;

    // Get the target section
    const targetSection = document.getElementById(sceneInfo.section);
    if (!targetSection) return;

    // Create and show the "Return to Quiz" button in the target scene
    this.showReturnToQuizButton(targetSection);

    // Scroll to the target section using fullPage.js if available
    if (window.fullpage_api) {
      // Find the section index
      const allSections = document.querySelectorAll('.section');
      let sectionIndex = 0;
      allSections.forEach((section, index) => {
        if (section.id === sceneInfo.section) {
          sectionIndex = index + 1; // fullPage uses 1-based indexing
        }
      });
      window.fullpage_api.moveTo(sectionIndex);
    } else {
      // Fallback: scroll into view
      targetSection.scrollIntoView({ behavior: 'smooth' });
    }

    // Emit event for analytics/debugging
    this.emit(VIZ_EVENTS.STATE_CHANGE, {
      action: 'navigate_to_hint_scene',
      scene: sceneInfo.section,
      questionId: current.id
    });
  }

  /**
   * Show a floating "Return to Quiz" button (fixed position, appended to body)
   */
  showReturnToQuizButton(targetSection) {
    // Remove any existing return button
    const existingBtn = document.querySelector('.return-to-quiz-btn');
    if (existingBtn) existingBtn.remove();

    // Create the return button
    const returnBtn = document.createElement('button');
    returnBtn.className = 'return-to-quiz-btn';
    returnBtn.innerHTML = `
      <span class="return-icon">&#x21A9;</span>
      <span class="return-label">Back to Quiz</span>
    `;
    returnBtn.setAttribute('aria-label', 'Return to quiz');

    // Add click handler - bind to this instance
    const self = this;
    returnBtn.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      self.returnToQuiz();
    });

    // Append to body for proper fixed positioning with fullPage.js
    document.body.appendChild(returnBtn);
  }

  /**
   * Return to the quiz from the hint scene
   */
  returnToQuiz() {
    // Remove the return button
    const returnBtn = document.querySelector('.return-to-quiz-btn');
    if (returnBtn) returnBtn.remove();

    // Clear visiting state
    this.state.visitingScene = null;

    // Navigate back to quiz section
    const quizSection = document.getElementById('scene-quiz');
    if (!quizSection) return;

    if (window.fullpage_api) {
      // Find the quiz section index
      const allSections = document.querySelectorAll('.section');
      let sectionIndex = 0;
      allSections.forEach((section, index) => {
        if (section.id === 'scene-quiz') {
          sectionIndex = index + 1;
        }
      });
      window.fullpage_api.moveTo(sectionIndex);
    } else {
      // Fallback: scroll into view
      quizSection.scrollIntoView({ behavior: 'smooth' });
    }

    // Emit event
    this.emit(VIZ_EVENTS.STATE_CHANGE, { action: 'return_to_quiz' });
  }
}
