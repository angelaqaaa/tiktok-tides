import * as d3 from 'd3';

const VIEWBOX_SIZE = 700;
const CENTER = VIEWBOX_SIZE / 2;
const OUTER_RADIUS = CENTER - 60;
const INNER_RADIUS = 60;
const ROTATION_SPEED = 360 / 12000; // deg per ms

function formatPlayCount(count) {
    if (!Number.isFinite(count)) return null;
    const millions = count / 1_000_000;
    const decimals = millions >= 100 ? 0 : 1;
    return `${millions.toFixed(decimals)}M`;
}

// Default album cover when no song is selected
const DEFAULT_ALBUM_COVER = "/assets/images/sound-covers/Sound_Default.png";

// Album cover paths - randomly shuffled
const albumCoverPaths = [
    "/assets/images/sound-covers/Sound_1.png",
    "/assets/images/sound-covers/Sound_2.png",
    "/assets/images/sound-covers/Sound_3.png",
    "/assets/images/sound-covers/Sound_4.png",
    "/assets/images/sound-covers/Sound_5.png"
];

// Shuffle array function
function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

export class RecordPlayerViz {
    constructor() {
        this.container = null;
        this.svg = null;
        this.ringsGroup = null;
        this.wrapperEl = null;
        this.notesWrapper = null;
        this.tonearm = null;
        this.tonearmArm = null;
        this.tonearmHinge = null;
        this.tonearmHead = null;

        this.data = [];
        this.songInfo = []; // song info data
        this.radiusScale = null;
        this.angleScale = null;
        this.shuffledAlbumCovers = shuffleArray(albumCoverPaths); // Randomly shuffled album covers

        this.allSongs = [];
        this.availableYears = [];
        this.yearBounds = [2020, 2025];
        this.currentYearRange = [2020, 2025];

        this.activeIndex = null;
        this.lockedIndex = null;
        this.isDraggingTonearm = false;
        this.activePointerElement = null;

        this.spinAngles = new Map(); // index -> angle
        this.spinTimers = new Map(); // index -> { rafId, last }

        this.audioCache = new Map(); // url -> Audio
        this.currentAudio = null;
        this.currentAudioIndex = null;
        this.isMuted = true; // mute state - default to muted

        this.yearSliderEl = null;
        this.yearSelectionEl = null;
        this.yearStartHandle = null;
        this.yearEndHandle = null;
        this.yearTicksEl = null;
        this.yearRangeLabelEl = null;
        this.yearTrackEl = null;
        this.recordCenterLabelEl = null;
        this.sliderActiveHandle = null;
        this.sliderPointerMoveHandler = this.handleSliderPointerMove.bind(this);
        this.sliderPointerUpHandler = this.handleSliderPointerUp.bind(this);
        this.handleResizeBound = () => this.updateYearSliderUI();
        this.setHoverState(false);

        this.autoplayUnlocked = false;
        this.pendingAudioIndex = null;
        this.autoSequenceRunning = false;
        this.handleFirstGesture = this.handleFirstGesture.bind(this);
        this.handleMuteToggle = this.handleMuteToggle.bind(this);

        // Debounce hover events to prevent excessive state changes
        this.hoverDebounceTimer = null;
        this.hoverDebounceDelay = 50; // 50ms debounce
    }

    async init(selector, options = {}) {
        this.container = document.querySelector(selector);
        if (!this.container) {
            throw new Error(`RecordPlayerViz: container "${selector}" not found.`);
        }

        this.wrapperEl = this.container.querySelector('.record-player-wrapper');
        this.notesWrapper = this.container.querySelector('.record-player-notes');
        this.svg = d3.select(this.container.querySelector('.record-disc'));
        this.ringsGroup = this.svg.select('[data-record-rings]');
        this.tonearm = this.container.querySelector('.tonearm');
        this.tonearmArm = this.container.querySelector('[data-tonearm-arm]');
        this.tonearmHinge = this.container.querySelector('.tonearm-hinge');
        this.tonearmHead = this.container.querySelector('.tonearm-head');
        this.recordCenterLabelEl = this.container.querySelector('[data-year-range-display]');

        // Song info screen elements
        this.songInfoScreen = this.container.querySelector('[data-song-info-screen]');
        this.songTitleEl = this.container.querySelector('[data-song-title]');
        this.songDescriptionEl = this.container.querySelector('[data-song-description]');
        this.albumCoverEl = this.container.querySelector('[data-album-cover]');

        // Mute toggle button
        this.muteToggleButton = this.container.querySelector('[data-mute-toggle]');

        // Year range slider elements
        this.yearSliderEl = this.container.querySelector('[data-year-slider]');
        this.yearSelectionEl = this.container.querySelector('[data-year-range-selection]');
        this.yearStartHandle = this.container.querySelector('[data-year-handle-start]');
        this.yearEndHandle = this.container.querySelector('[data-year-handle-end]');
        this.yearTicksEl = this.container.querySelector('[data-year-slider-ticks]');
        this.yearRangeLabelEl = this.container.querySelector('[data-year-range-label]');
        this.yearTrackEl = this.container.querySelector('.year-range-slider__track');

        await this.loadData();
        this.bindInteractions();
        this.initializeYearSlider();
        this.bindMuteToggle();
        this.initializeMuteButton(); // Set initial mute button state
        this.resetSongInfo(); // Set default "no song" state
        document.addEventListener('pointerdown', this.handleFirstGesture, { once: true });
        this.setTonearmToIndex(0, { silent: true });
    }

    async loadData() {
        const parsed = await d3.csv('/data/top_music.csv', (d) => {
            const year = +d.year || +d.Year;
            const name = d.music_name || d['musicMeta/musicName'] || d['music_name'] || d.name;
            const playUrl = d.music_url || d['musicMeta/playUrl'] || d.play_url || d.playUrl || '';
            const playCount = +d.play_count || +d.playCount || 0;
            const coverUrl = d.cover_url || d['musicMeta/coverMediumUrl'] || d.coverUrl || '';
            const author = d.music_author || d['musicMeta/musicAuthor'] || d.author || '';
            return {
                year,
                name,
                playUrl,
                totalPlayCount: playCount,
                coverUrl,
                author
            };
        });

        this.allSongs = parsed
            .filter((song) =>
                song.name &&
                Number.isFinite(song.totalPlayCount) &&
                Number.isFinite(song.year) &&
                song.year >= 2020 &&
                song.year <= 2025
            )
            .sort((a, b) => b.totalPlayCount - a.totalPlayCount);

        this.availableYears = Array.from(new Set(this.allSongs.map((song) => song.year))).sort((a, b) => a - b);
        if (this.availableYears.length === 0) {
            this.availableYears = [2020, 2025];
        }
        this.yearBounds = [
            Math.min(...this.availableYears),
            Math.max(...this.availableYears)
        ];

        const defaultRange = [2020, 2025];
        this.currentYearRange = [
            Math.max(this.yearBounds[0], defaultRange[0]),
            Math.min(this.yearBounds[1], defaultRange[1])
        ];

        this.updateDataForYearRange(this.currentYearRange, { skipSliderUpdate: true, animate: false });

        // Load song info data
        try {
            const songInfoResponse = await fetch('/data/songInfo/songInfo.json');
            this.songInfo = await songInfoResponse.json();
        } catch (error) {
            console.warn('Failed to load song info:', error);
            this.songInfo = [];
        }

        // Initialize audio cache but don't play until hovered/interacted
        this.audioCache = new Map();
    }

    getSongsForRange(range) {
        if (!Array.isArray(range) || range.length < 2) return [];
        const [startYear, endYear] = range;
        return this.allSongs
            .filter((song) => song.year >= startYear && song.year <= endYear)
            .sort((a, b) => b.totalPlayCount - a.totalPlayCount)
            .slice(0, 7);
    }

    updateDataForYearRange(range, { skipSliderUpdate = false, animate = true } = {}) {
        if (!Array.isArray(range) || range.length < 2) return;
        const sanitizedStart = Math.max(this.yearBounds[0], Math.min(range[0], range[1]));
        const sanitizedEnd = Math.min(this.yearBounds[1], Math.max(range[0], range[1]));
        this.currentYearRange = [sanitizedStart, sanitizedEnd];

        this.data = this.getSongsForRange(this.currentYearRange);
        this.totalRings = Math.max(this.data.length, 1);
        this.setupScales();
        this.renderRings({ animate });
        this.bindRingEvents();
        this.updateYearRangeLabel();
        if (!skipSliderUpdate) {
            this.updateYearSliderUI();
        }

        // Clear all states together synchronously
        this.clearActiveRing({ preserveLocked: false });
        this.stopSongImmediate();
        this.resetSongInfo();
        this.toggleNotes(false);
        this.setHoverState(false);
    }

    initializeYearSlider() {
        if (!this.yearSliderEl) return;

        if (this.yearTicksEl) {
            this.yearTicksEl.innerHTML = '';
            const tickYears = [];
            for (let year = this.yearBounds[0]; year <= this.yearBounds[1]; year += 1) {
                tickYears.push(year);
            }
            tickYears.forEach((year) => {
                const tick = document.createElement('span');
                tick.textContent = year;
                tick.dataset.yearTick = year.toString();
                this.yearTicksEl.appendChild(tick);
            });
        }

        const startHandler = (event) => this.handleSliderPointerDown(event, 'start');
        const endHandler = (event) => this.handleSliderPointerDown(event, 'end');

        this.yearStartHandle?.addEventListener('pointerdown', startHandler);
        this.yearEndHandle?.addEventListener('pointerdown', endHandler);

        this.updateYearSliderUI();
        window.addEventListener('resize', this.handleResizeBound);
    }

    updateYearSliderUI() {
        if (!this.yearSliderEl || !this.yearTrackEl) return;
        const sliderRect = this.yearSliderEl.getBoundingClientRect();
        const trackRect = this.yearTrackEl.getBoundingClientRect();
        const trackWidth = trackRect.width || 1;
        const offsetLeft = trackRect.left - sliderRect.left;
        const [startYear, endYear] = this.currentYearRange;
        const startRatio = this.yearToRatio(startYear);
        const endRatio = this.yearToRatio(endYear);
        const startPx = offsetLeft + trackWidth * startRatio;
        const endPx = offsetLeft + trackWidth * endRatio;
        const widthPx = Math.max(4, endPx - startPx);

        if (this.yearSelectionEl) {
            this.yearSelectionEl.style.left = `${startPx}px`;
            this.yearSelectionEl.style.width = `${widthPx}px`;
        }
        if (this.yearStartHandle) {
            this.yearStartHandle.style.left = `${startPx}px`;
        }
        if (this.yearEndHandle) {
            this.yearEndHandle.style.left = `${endPx}px`;
        }
        this.updateYearRangeLabel();
    }

    yearToRatio(year) {
        const span = Math.max(this.yearBounds[1] - this.yearBounds[0], 1);
        return (year - this.yearBounds[0]) / span;
    }

    handleSliderPointerDown(event, handle) {
        event.preventDefault();
        this.sliderActiveHandle = handle;
        this.yearSliderEl.classList.add('is-dragging');
        window.addEventListener('pointermove', this.sliderPointerMoveHandler);
        window.addEventListener('pointerup', this.sliderPointerUpHandler);
        window.addEventListener('pointercancel', this.sliderPointerUpHandler);
        this.handleSliderPointerMove(event);
    }

    handleSliderPointerMove(event) {
        if (!this.sliderActiveHandle || !this.yearTrackEl) return;
        const bounds = this.yearTrackEl.getBoundingClientRect();
        const width = bounds.width || 1;
        const ratio = (event.clientX - bounds.left) / bounds.width;
        const clampedRatio = Math.min(1, Math.max(0, ratio || 0));
        const rawYear = this.yearBounds[0] + clampedRatio * (this.yearBounds[1] - this.yearBounds[0]);
        const snappedYear = Math.round(rawYear);
        this.updateRangeFromHandle(this.sliderActiveHandle, snappedYear);
    }

    handleSliderPointerUp() {
        this.sliderActiveHandle = null;
        this.yearSliderEl?.classList.remove('is-dragging');
        window.removeEventListener('pointermove', this.sliderPointerMoveHandler);
        window.removeEventListener('pointerup', this.sliderPointerUpHandler);
        window.removeEventListener('pointercancel', this.sliderPointerUpHandler);
    }

    updateRangeFromHandle(handle, year) {
        const [startYear, endYear] = this.currentYearRange;
        if (handle === 'start') {
            if (year > endYear) {
                this.sliderActiveHandle = 'end';
                this.updateDataForYearRange([endYear, year]);
                return;
            }
            if (year === startYear) {
                this.updateYearSliderUI();
                return;
            }
            const nextStart = Math.min(year, endYear);
            this.updateDataForYearRange([nextStart, endYear]);
        } else {
            if (year < startYear) {
                this.sliderActiveHandle = 'start';
                this.updateDataForYearRange([year, startYear]);
                return;
            }
            if (year === endYear) {
                this.updateYearSliderUI();
                return;
            }
            const nextEnd = Math.max(year, startYear);
            this.updateDataForYearRange([startYear, nextEnd]);
        }
    }

    updateYearRangeLabel() {
        if (!this.currentYearRange) return;
        const [startYear, endYear] = this.currentYearRange;
        const labelText = `${startYear} – ${endYear}`;
        if (this.yearRangeLabelEl) {
            this.yearRangeLabelEl.textContent = labelText;
        }
        if (this.recordCenterLabelEl) {
            this.recordCenterLabelEl.textContent = labelText.replace(' – ', '–');
        }
    }

    setupScales() {
        const ringCount = Math.max(this.data.length, 1);
        const ringStep = (OUTER_RADIUS - INNER_RADIUS) / ringCount;
        this.radiusScale = (index) => OUTER_RADIUS - (index + 0.75) * ringStep;
        const maxAngle = 32;
        const minAngle = 8;
        const domainEnd = Math.max(ringCount - 1, 1);
        this.angleScale = d3.scaleLinear().domain([0, domainEnd]).range([minAngle, maxAngle]);
    }

    renderRings({ animate = false } = {}) {
        // reset timers/angles when rendering
        this.stopAllRingRotation();
        this.spinAngles.clear();

        const defs = this.ensureDefs();
        const transition = animate ? d3.transition().duration(650).ease(d3.easeCubicOut) : null;

        const rings = this.ringsGroup
            .selectAll('.record-ring')
            .data(this.data, d => d.name);

        const ringsEnter = rings.enter()
            .append('g')
            .attr('class', 'record-ring')
            .attr('data-song-index', (_, i) => i)
            .attr('transform', `translate(${CENTER}, ${CENTER})`)
            .style('opacity', 0);

        ringsEnter.append('circle').attr('class', 'record-ring-arc');
        ringsEnter.append('text').attr('class', 'record-ring-label').append('textPath');

        if (transition) {
            ringsEnter.transition(transition).style('opacity', 1);
        } else {
            ringsEnter.style('opacity', 1);
        }

        const ringsMerge = ringsEnter.merge(rings);

        ringsMerge
            .attr('data-song-index', (_, i) => i)
            .each((d, i, nodes) => {
                const radius = Math.max(14, this.radiusScale(i));
                const ringCount = Math.max(this.totalRings, 1);
                const ringStep = (OUTER_RADIUS - INNER_RADIUS) / ringCount;
                const strokeWidth = ringStep * 1.0;
                const ringSel = d3.select(nodes[i]);
                const arc = ringSel.select('.record-ring-arc');

                if (transition) {
                    arc.transition(transition)
                        .attr('r', radius)
                        .attr('stroke-width', strokeWidth);
                } else {
                    arc
                        .attr('r', radius)
                        .attr('stroke-width', strokeWidth);
                }

                const labelRadius = Math.max(12, radius - strokeWidth * 0.35);
                const sweep = Math.PI * 0.72;
                const baseStart = -Math.PI / 2 - sweep / 2;
                const startAngle = baseStart + (i % 2 === 0 ? -0.05 : 0.05);
                const endAngle = startAngle + sweep;

                const pathId = `record-ring-label-path-${i}`;
                let labelPath = defs.select(`#${pathId}`);
                if (labelPath.empty()) {
                    labelPath = defs.append('path').attr('id', pathId);
                }
                const pathBuilder = d3.path();
                pathBuilder.arc(0, 0, labelRadius, startAngle, endAngle);
                labelPath.attr('d', pathBuilder.toString());

                const textPath = ringSel
                    .select('.record-ring-label')
                    .select('textPath');

                const isInner = i >= this.data.length - 2;
                textPath
                    .attr('startOffset', '50%')
                    .attr('href', `#${pathId}`)
                    .attr('text-anchor', 'middle')
                    .attr('dominant-baseline', 'middle')
                    .attr('method', 'stretch')
                    .attr('dy', 0)
                    .classed('inner-label', isInner)
                    .attr('textLength', isInner ? sweep * labelRadius * 1.1 : null)
                    .text(() => {
                        const millions = d.totalPlayCount / 1_000_000;
                        const metric = millions >= 100 ? Math.round(millions) : millions.toFixed(1);
                        return `${d.name} • ${metric}M`;
                    });

                this.spinAngles.set(i, this.spinAngles.get(i) ?? 0);
                this.applyRingTransform(i);
            });

        if (transition) {
            rings.exit().transition(transition).style('opacity', 0).remove();
        } else {
            rings.exit().remove();
        }
    }

    ensureDefs() {
        let defs = this.svg.select('defs');
        if (defs.empty()) {
            defs = this.svg.insert('defs', ':first-child');
        }
        return defs;
    }

    bindInteractions() {
        this.indicatorMax = this.container.querySelector('.record-indicator-line--max');
        this.discArea = this.container.querySelector('.record-disc-area');
        if (this.discArea && !this.discArea.dataset.bound) {
            this.discArea.dataset.bound = 'true';
            this.discArea.addEventListener('mouseleave', () => {
                // Clear all states together synchronously
                this.stopAllRingRotation();
                this.clearActiveRing({ preserveLocked: false });
                this.stopSongImmediate();
                this.resetSongInfo();
                this.showIndicator();
                this.setHoverState(false);
            });
        }
        this.showIndicator();
        this.bindRingEvents();
    }

    showIndicator() {
        this.indicatorMax?.classList.remove('is-hidden');
    }

    hideIndicator() {
        this.indicatorMax?.classList.add('is-hidden');
    }

    bindRingEvents() {
        const ringNodes = this.container.querySelectorAll('.record-ring');
        ringNodes.forEach((ringEl) => {
            if (ringEl.dataset.bound === 'true') return;
            ringEl.dataset.bound = 'true';

            ringEl.addEventListener('mouseenter', () => {
                const index = Number(ringEl.dataset.songIndex);
                // If there's a locked ring, don't override it
                if (this.lockedIndex !== null && this.lockedIndex !== index) {
                    return;
                }
                // Debounce hover to prevent excessive state changes
                if (this.hoverDebounceTimer) {
                    clearTimeout(this.hoverDebounceTimer);
                }
                this.hoverDebounceTimer = setTimeout(() => {
                    // Immediately activate this ring - all states change together
                    this.activateRingImmediate(index, { locked: false, source: 'hover' });
                    this.hoverDebounceTimer = null;
                }, this.hoverDebounceDelay);
            });

            ringEl.addEventListener('mouseleave', () => {
                const index = Number(ringEl.dataset.songIndex);

                // Clear any pending hover activation
                if (this.hoverDebounceTimer) {
                    clearTimeout(this.hoverDebounceTimer);
                    this.hoverDebounceTimer = null;
                }

                // If there's a locked ring, restore it
                if (this.lockedIndex !== null && this.lockedIndex !== index) {
                    this.activateRingImmediate(this.lockedIndex, { locked: true, source: 'tonearm' });
                    return;
                }

                // Immediately deactivate - all states change together
                if (this.activeIndex === index) {
                    this.deactivateRingImmediate(index);
                }
            });

            ringEl.addEventListener('click', () => {
                const index = Number(ringEl.dataset.songIndex);
                this.handleFirstGesture();
                this.activateRingImmediate(index, { locked: true, source: 'click' });
                this.hideIndicator();
            });
        });
    }

    getRingSelection(index) {
        return this.ringsGroup.select(`[data-song-index="${index}"]`);
    }

    getRingNode(index) {
        return this.getRingSelection(index).node();
    }

    applyRingTransform(index) {
        const node = this.getRingNode(index);
        if (!node) return;
        const angle = this.spinAngles.get(index) || 0;
        // Use transform attribute for SVG (more efficient than style for SVG)
        node.setAttribute('transform', `translate(${CENTER}, ${CENTER}) rotate(${angle})`);
    }

    startRingRotation(index) {
        if (this.spinTimers.has(index)) return;
        const node = this.getRingNode(index);
        if (!node) return;
        let angle = this.spinAngles.get(index) || 0;
        const state = { last: null, rafId: null };
        const step = (timestamp) => {
            if (!this.spinTimers.has(index)) return;
            if (state.last === null) state.last = timestamp;
            const delta = timestamp - state.last;
            state.last = timestamp;
            angle = (angle + delta * ROTATION_SPEED) % 360;
            this.spinAngles.set(index, angle);
            // Direct transform update for SVG (most efficient)
            node.setAttribute('transform', `translate(${CENTER}, ${CENTER}) rotate(${angle})`);
            state.rafId = requestAnimationFrame(step);
        };
        state.rafId = requestAnimationFrame(step);
        this.spinTimers.set(index, state);
    }

    stopRingRotation(index) {
        const state = this.spinTimers.get(index);
        if (state) {
            if (state.rafId) cancelAnimationFrame(state.rafId);
            this.spinTimers.delete(index);
        }
        this.applyRingTransform(index);
    }

    stopAllRingRotation() {
        this.spinTimers.forEach((state) => {
            if (state.rafId) cancelAnimationFrame(state.rafId);
        });
        this.spinTimers.clear();
    }

    getRingRotation(index) {
        return this.spinAngles.get(index) || 0;
    }

    // Immediate activation - all states change together synchronously
    activateRingImmediate(index, { locked = false, source = 'hover' } = {}) {
        if (index < 0 || index >= this.data.length) return;
        const ringSel = this.getRingSelection(index);
        if (!ringSel.node()) return;

        // Early return if already active and same state
        if (this.activeIndex === index && this.lockedIndex === (locked ? index : null)) {
            return;
        }

        const isHover = source === 'hover';
        const isAuto = source === 'auto';

        // STEP 1: Stop ALL previous states immediately (if switching)
        if (this.activeIndex !== null && this.activeIndex !== index) {
            const prevRing = this.getRingSelection(this.activeIndex);
            if (prevRing.node() && this.lockedIndex !== this.activeIndex) {
                // Stop previous ring rotation
                this.stopRingRotation(this.activeIndex);
                // Remove previous ring classes
                prevRing.classed('is-active', false).classed('is-hovered', false);
            }
            // Stop previous audio immediately
            this.stopSongImmediate();
        }

        // STEP 2: Update locked state if needed
        if (locked) {
            if (this.lockedIndex !== null && this.lockedIndex !== index) {
                const prevLocked = this.getRingSelection(this.lockedIndex);
                if (prevLocked.node()) {
                    this.stopRingRotation(this.lockedIndex);
                    prevLocked.classed('is-active', false).classed('is-hovered', false);
                }
                this.stopSongImmediate();
            }
            this.lockedIndex = index;
        } else if (this.lockedIndex === index) {
            // Unlocking
            this.lockedIndex = null;
        }

        // STEP 3: Set ALL new states together
        this.activeIndex = index;
        ringSel.classed('is-hovered', isHover);
        ringSel.classed('is-active', true);

        // STEP 4: Start rotation
        if (isHover) {
            this.startRingRotation(index);
            this.setHoverState(true);
        } else {
            this.stopRingRotation(index);
            this.setHoverState(false);
        }

        // STEP 5: Update song info
        this.updateSongInfo(index);

        // STEP 6: Start audio playback (with mute state)
        this.playSongImmediate(index, { autoplay: isHover || locked });

        // STEP 7: Update tonearm
        if (isHover) {
            this.setTonearmToIndex(index, { silent: true });
        } else {
            this.setTonearmToIndex(index, { silent: !locked });
        }
    }

    // Immediate deactivation - all states reset together synchronously
    deactivateRingImmediate(index) {
        if (index < 0 || index >= this.data.length) return;
        const ringSel = this.getRingSelection(index);

        // STEP 1: Stop ALL states immediately
        this.stopRingRotation(index);
        ringSel.classed('is-hovered', false);
        ringSel.classed('is-active', false);

        // STEP 2: Clear active index
        if (this.activeIndex === index) {
            this.activeIndex = null;
        }

        // STEP 3: Stop audio immediately
        this.stopSongImmediate();

        // STEP 4: Reset song info
        this.resetSongInfo();

        // STEP 5: Reset hover state
        this.setHoverState(false);
    }

    // Legacy method for backward compatibility
    activateRing(index, { locked = false, source = 'hover' } = {}) {
        this.activateRingImmediate(index, { locked, source });
    }

    clearActiveRing({ preserveLocked = true } = {}) {
        this.ringsGroup.selectAll('.record-ring').each((d, i, nodes) => {
            const ringIndex = Number(nodes[i].dataset.songIndex);
            if (preserveLocked && ringIndex === this.lockedIndex) return;
            this.stopRingRotation(ringIndex);
            nodes[i].classList.remove('is-active', 'is-hovered');
            this.spinAngles.set(ringIndex, this.getRingRotation(ringIndex));
            this.applyRingTransform(ringIndex);
        });
        if (!preserveLocked) {
            this.lockedIndex = null;
        }
        this.activeIndex = null;
        this.setHoverState(false);
    }

    setTonearmToIndex(index, { silent = false } = {}) {
        if (!this.tonearmArm || index == null || index < 0 || index >= this.data.length) return;

        // Use angleScale from setupScales()
        const angle = this.angleScale(index);

        this.tonearmArm.style.transform = `rotate(${angle}deg)`;
        if (!silent) {
            this.lockedIndex = index;
        }
    }

    clampTonearmAngle(angle) {
        const range = this.angleScale.range();
        const min = Math.min(...range) - 12;
        const max = Math.max(...range) + 8;
        return Math.max(min, Math.min(max, angle));
    }

    updateSongInfo(index) {
        if (index == null || index < 0 || index >= this.data.length) {
            return;
        }

        const song = this.data[index];
        const info = this.songInfo.find(si => si.name === song.name);

        if (this.songTitleEl) {
            if (song.name) {
                this.songTitleEl.innerHTML = `<span class="music-icon">♪</span> ${song.name}`;
            } else {
                this.songTitleEl.textContent = 'No song selected';
            }
        }

        if (this.songDescriptionEl) {
            const formattedPlays = formatPlayCount(song.totalPlayCount) || 'Unavailable';
            const authorName = (song.author && song.author.trim()) || info?.musicAuthor || 'Unknown artist';
            const playLine = `🎧 Play Count: ${formattedPlays}`;
            const authorLine = `✨ Author: ${authorName}`;
            this.songDescriptionEl.innerHTML = `${playLine}<br>${authorLine}`;
        }

        if (this.albumCoverEl) {
            const albumCoverPath = this.getAlbumCoverUrl(song.coverUrl, index);
            this.albumCoverEl.src = albumCoverPath;
            this.albumCoverEl.alt = song.name ? `${song.name} album cover` : 'Album cover';
        }
    }

    resetSongInfo() {
        if (this.songTitleEl) {
            this.songTitleEl.textContent = 'No song selected';
        }

        if (this.songDescriptionEl) {
            this.songDescriptionEl.innerHTML = '🎧 Play Count: —<br>✨ Author: —';
        }

        if (this.albumCoverEl) {
            this.albumCoverEl.src = DEFAULT_ALBUM_COVER;
            this.albumCoverEl.alt = 'No song selected';
        }
    }

    // Immediate playback - synchronous state changes
    playSongImmediate(index, { autoplay = true, force = false } = {}) {
        const song = this.data[index];

        if (!song || !song.playUrl) {
            this.stopSongImmediate();
            return;
        }

        // If same song is already playing, just update mute state
        if (this.currentAudioIndex === index && this.currentAudio && !this.currentAudio.paused) {
            this.currentAudio.muted = this.isMuted;
            return;
        }

        // Stop any currently playing audio first (synchronously)
        if (this.currentAudio && this.currentAudioIndex !== index) {
            this.stopSongImmediate();
        }

        // Get or create audio object
        let audio = this.audioCache.get(song.playUrl);
        if (!audio) {
            audio = new Audio(song.playUrl);
            audio.loop = true;
            audio.preload = 'auto';
            audio.crossOrigin = 'anonymous';
            this.audioCache.set(song.playUrl, audio);
        }

        // Set current audio reference immediately
        this.currentAudio = audio;
        this.currentAudioIndex = index;

        // Set mute state immediately
        audio.muted = this.isMuted;
        // Only reset currentTime if audio is not already playing to avoid stuttering
        if (audio.paused || audio.currentTime > 0.1) {
            audio.currentTime = 0;
        }

        // Handle autoplay unlock logic
        if (autoplay && !force && !this.autoplayUnlocked) {
            audio.muted = true;
            // Use requestAnimationFrame to avoid blocking
            requestAnimationFrame(() => {
                audio.play().then(() => {
                    // First play succeeded, now unlock and play for real
                    audio.pause();
                    audio.currentTime = 0;
                    audio.muted = this.isMuted;
                    this.autoplayUnlocked = true;
                    requestAnimationFrame(() => {
                        audio.play().then(() => {
                            this.toggleNotes(true);
                        }).catch(() => {
                            this.toggleNotes(false);
                        });
                    });
                }).catch(() => {
                    // First play failed, wait for user gesture
                    audio.pause();
                    audio.currentTime = 0;
                    this.pendingAudioIndex = index;
                    this.toggleNotes(false);
                    document.addEventListener('pointerdown', this.handleFirstGesture, { once: true });
                });
            });
            return;
        }

        // Normal playback - start immediately (use requestAnimationFrame to avoid blocking)
        if (autoplay || force) {
            this.toggleNotes(true);
            requestAnimationFrame(() => {
                audio.play().catch(() => {
                    this.pendingAudioIndex = index;
                    this.toggleNotes(false);
                    this.autoplayUnlocked = false;
                    document.addEventListener('pointerdown', this.handleFirstGesture, { once: true });
                });
            });
        } else {
            this.toggleNotes(false);
        }
    }

    // Legacy method for backward compatibility
    playSong(index, { autoplay = true, force = false } = {}) {
        this.playSongImmediate(index, { autoplay, force });
    }


    // Immediate stop - synchronous state reset
    stopSongImmediate() {
        if (this.currentAudio) {
            // Stop audio immediately - no async operations
            this.currentAudio.pause();
            this.currentAudio.currentTime = 0;
            this.currentAudio.muted = true;

            // Remove event listeners that might cause issues
            this.currentAudio.onplay = null;
            this.currentAudio.onpause = null;
            this.currentAudio.onended = null;

            this.currentAudio = null;
            this.currentAudioIndex = null;
        }

        this.toggleNotes(false);
    }

    // Legacy method for backward compatibility
    stopSong(force = false) {
        if (!force && this.lockedIndex !== null) return;
        this.stopSongImmediate();

        // Reset song info when stopping if no active or locked song
        if (this.activeIndex === null && this.lockedIndex === null) {
            this.resetSongInfo();
        }
    }

    toggleNotes(isPlaying) {
        if (!this.wrapperEl) return;
        if (isPlaying) {
            this.wrapperEl.classList.add('is-playing');
        } else {
            this.wrapperEl.classList.remove('is-playing');
        }
    }

    setHoverState(isHovering) {
        if (!this.wrapperEl) return;
        if (isHovering) {
            this.wrapperEl.classList.add('is-hovering');
        } else {
            this.wrapperEl.classList.remove('is-hovering');
        }
    }

    /**
     * Rotate to the next record in sequence (for guided exploration)
     * Cycles through records one by one from outermost (top) to innermost
     */
    rotateToNextRecord() {
        // Initialize or increment the rotation index
        if (this.guidedRotationIndex === undefined) {
            this.guidedRotationIndex = 0;
        } else {
            this.guidedRotationIndex = (this.guidedRotationIndex + 1) % this.data.length;
        }

        const index = this.guidedRotationIndex;

        // Activate the record
        this.activateRing(index, { locked: true, source: 'guided' });

        // Start rotation animation
        this.startRingRotation(index);

        console.log(`[RecordPlayer] Rotated to record ${index + 1}/${this.data.length}: ${this.data[index].name}`);
    }

    /**
     * Highlight the top 3 records by adding visual emphasis
     * Dims records 4-10 to draw attention to the most popular sounds
     */
    highlightTop3() {
        const top3Indices = [0, 1, 2]; // Top 3 are already sorted by playCount

        this.ringsGroup.selectAll('.record-ring').each((d, i, nodes) => {
            const ringIndex = Number(nodes[i].dataset.songIndex);
            const isTop3 = top3Indices.includes(ringIndex);

            // Add glow effect to top 3, dim others
            const ringEl = d3.select(nodes[i]);
            const arc = ringEl.select('.record-ring-arc');
            const label = ringEl.select('.record-ring-label');

            if (isTop3) {
                // Highlight top 3 with cyan glow
                arc.style('filter', 'drop-shadow(0 0 8px var(--color-glint))');
                arc.style('stroke', 'var(--color-glint)');
                arc.style('opacity', 1);
                label.style('opacity', 1);
                label.style('font-weight', 'bold');

                // Start rotation for visual emphasis
                this.startRingRotation(ringIndex);
            } else {
                // Dim others
                arc.style('filter', 'none');
                arc.style('stroke', 'var(--color-border-primary)');
                arc.style('opacity', 0.3);
                label.style('opacity', 0.3);
                label.style('font-weight', 'normal');

                this.stopRingRotation(ringIndex);
            }
        });

        console.log('[RecordPlayer] Highlighted top 3 records');
    }

    /**
     * Reset all record highlights to normal state
     */
    resetHighlights() {
        this.ringsGroup.selectAll('.record-ring').each((d, i, nodes) => {
            const ringEl = d3.select(nodes[i]);
            const arc = ringEl.select('.record-ring-arc');
            const label = ringEl.select('.record-ring-label');

            arc.style('filter', 'none');
            arc.style('stroke', 'var(--color-border-primary)');
            arc.style('opacity', 1);
            label.style('opacity', 1);
            label.style('font-weight', 'normal');
        });

        this.stopAllRingRotation();
        this.clearActiveRing({ preserveLocked: false });
    }

    /**
     * Auto-sequence: Cycle through top 3 rings when scene enters viewport
     * Per spec 5.3.4: ~5 seconds total, each ring highlighted for ~1.5s
     */
    startAutoSequence() {
        if (this.autoSequenceRunning) return;
        this.autoSequenceRunning = true;

        const topRings = [0, 1, 2]; // Top 3 rings
        const durationPerRing = 1500; // 1.5 seconds each
        let currentStep = 0;

        const highlightNext = () => {
            if (currentStep >= topRings.length) {
                // Sequence complete - emit event
                this.autoSequenceRunning = false;
                const event = new CustomEvent('record-player:autosequence-complete', {
                    detail: { lastIndex: topRings[topRings.length - 1] }
                });
                this.container.dispatchEvent(event);
                // Leave tonearm on top track
                this.activateRing(0, { locked: false, source: 'auto' });
                return;
            }

            const index = topRings[currentStep];
            this.activateRing(index, { locked: false, source: 'auto' });
            currentStep++;

            setTimeout(highlightNext, durationPerRing);
        };

        // Start after small delay
        setTimeout(highlightNext, 300);
    }

    mount() {
        this.mounted = true;
    }

    update() { }

    destroy() {
        // Clear debounce timer
        if (this.hoverDebounceTimer) {
            clearTimeout(this.hoverDebounceTimer);
            this.hoverDebounceTimer = null;
        }
        this.stopSong(true);
        this.stopAllRingRotation();
        window.removeEventListener('resize', this.handleResizeBound);
    }

    getAlbumCoverUrl(rawUrl, index) {
        const fallbackCover = this.shuffledAlbumCovers[index % this.shuffledAlbumCovers.length];
        const candidate = rawUrl || fallbackCover || DEFAULT_ALBUM_COVER;
        return candidate;
    }

    handleFirstGesture() {
        if (this.autoplayUnlocked) return;
        this.autoplayUnlocked = true;
        if (this.pendingAudioIndex != null) {
            const pending = this.pendingAudioIndex;
            this.pendingAudioIndex = null;
            this.playSong(pending, { autoplay: true, force: true });
        }
    }

    bindMuteToggle() {
        if (!this.muteToggleButton) return;
        this.muteToggleButton.addEventListener('click', this.handleMuteToggle);
    }

    initializeMuteButton() {
        // Set initial mute button state to muted
        if (this.muteToggleButton) {
            this.muteToggleButton.classList.add('is-muted');
            const iconPath = this.muteToggleButton.querySelector('path');
            if (iconPath) {
                // Set to muted icon
                iconPath.setAttribute('d', 'M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z');
            }
        }
        // Audio cache is empty initially, so no need to set muted state
    }

    handleMuteToggle() {
        this.isMuted = !this.isMuted;

        // Update button visual state
        if (this.muteToggleButton) {
            if (this.isMuted) {
                this.muteToggleButton.classList.add('is-muted');
                // Update icon to muted state
                const iconPath = this.muteToggleButton.querySelector('path');
                if (iconPath) {
                    iconPath.setAttribute('d', 'M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z');
                }
            } else {
                this.muteToggleButton.classList.remove('is-muted');
                // Update icon to unmuted state
                const iconPath = this.muteToggleButton.querySelector('path');
                if (iconPath) {
                    iconPath.setAttribute('d', 'M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z');
                }
            }
        }

        // Update audio mute state immediately - all states change together
        if (this.currentAudio && this.activeIndex !== null) {
            // If there's an active song, update its mute state immediately
            this.currentAudio.muted = this.isMuted;
        } else if (this.currentAudio && this.activeIndex === null) {
            // If audio is playing but no active index, stop it immediately
            this.stopSongImmediate();
            this.resetSongInfo();
        } else if (!this.currentAudio && this.activeIndex === null) {
            // No audio and no active song, just reset info
            this.resetSongInfo();
        }
    }
}

