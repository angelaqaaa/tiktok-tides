import * as d3 from 'd3';

const VIEWBOX_SIZE = 700;
const CENTER = VIEWBOX_SIZE / 2;
const OUTER_RADIUS = CENTER - 30;  // Larger rings (was 60)
const INNER_RADIUS = 45;           // Smaller center (was 60)
const ROTATION_SPEED = 360 / 12000; // deg per ms

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
        this.radiusScale = null;
        this.angleScale = null;

        this.activeIndex = null;
        this.lockedIndex = null;
        this.isDraggingTonearm = false;
        this.activePointerElement = null;

        this.spinAngles = new Map(); // index -> angle
        this.spinTimers = new Map(); // index -> { rafId, last }

        this.audioCache = new Map(); // url -> Audio
        this.currentAudio = null;
        this.currentAudioIndex = null;

        this.autoplayUnlocked = false;
        this.pendingAudioIndex = null;
        this.autoSequenceRunning = false;
        this.handleFirstGesture = this.handleFirstGesture.bind(this);
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


        await this.loadData();
        this.setupScales();
        this.renderRings();
        this.bindInteractions();
        document.addEventListener('pointerdown', this.handleFirstGesture, { once: true });
        this.setTonearmToIndex(0, { silent: true });
    }

    async loadData() {
        const parsed = await d3.csv('/data/top10_music.csv', (d) => ({
            name: d['musicMeta/musicName'] ?? d['Music Name'],
            playUrl: d['music_playUrl'] ?? d['musicMeta/musicPlayUrl'] ?? '',
            totalPlayCount: +d['total_playCount'] || +d['Total Digg'] || 0
        }));

        this.data = parsed
            .filter((row) => row.name && Number.isFinite(row.totalPlayCount))
            .sort((a, b) => b.totalPlayCount - a.totalPlayCount)
            .slice(0, 10);

        // set songs playing muted on the background, only unmuted if hovered or interacted
        this.audioCache = new Map(); //map storing loaded music
        this.data.forEach(song => {
            const audio = new Audio(song.playUrl);
            audio.loop = true;
            audio.muted = true;
            audio.play().catch(() => { });
            this.audioCache.set(song.playUrl, audio);
        });

        this.totalRings = this.data.length;
    }

    setupScales() {
        const ringStep = (OUTER_RADIUS - INNER_RADIUS) / this.data.length;
        this.radiusScale = (index) => OUTER_RADIUS - (index + 0.75) * ringStep;

        // Tonearm angles: base rotation is -32deg in CSS, we add to it
        // Outer ring (index 0) needs less rotation, inner ring needs more
        const baseAngle = -32;  // Base CSS rotation
        const minOffset = 0;    // Outermost ring
        const maxOffset = 50;   // Innermost ring
        this.angleScale = d3.scaleLinear()
            .domain([0, this.totalRings - 1])
            .range([baseAngle + minOffset, baseAngle + maxOffset]);
    }

    renderRings() {
        // reset timers/angles when rendering
        this.stopAllRingRotation();
        this.spinAngles.clear();

        const defs = this.ensureDefs();

        const rings = this.ringsGroup
            .selectAll('.record-ring')
            .data(this.data, d => d.name);

        const ringsEnter = rings.enter()
            .append('g')
            .attr('class', 'record-ring')
            .attr('data-song-index', (_, i) => i)
            .attr('transform', `translate(${CENTER}, ${CENTER})`);

        ringsEnter.append('circle').attr('class', 'record-ring-arc');
        ringsEnter.append('text').attr('class', 'record-ring-label').append('textPath');

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

                arc
                    .attr('r', radius)
                    .attr('stroke-width', strokeWidth);

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
                    .attr('textLength', isInner ? sweep * labelRadius * 1 : null)
                    // .attr('textLength',  sweep * labelRadius * 1)
                    .text(() => {
                        const millions = d.totalPlayCount / 1_000_000;
                        const metric = millions >= 100 ? Math.round(millions) : millions.toFixed(1);
                        return `🎵 ${d.name} • ${metric}M`;
                    });

                this.spinAngles.set(i, this.spinAngles.get(i) ?? 0);
                this.applyRingTransform(i);
            });

        rings.exit().remove();
    }

    ensureDefs() {
        let defs = this.svg.select('defs');
        if (defs.empty()) {
            defs = this.svg.insert('defs', ':first-child');
        }
        return defs;
    }

    bindInteractions() {
        const ringNodes = this.container.querySelectorAll('.record-ring');
        const indicatorMax = this.container.querySelector('.record-indicator-line--max');
        const showIndicator = () => indicatorMax?.classList.remove('is-hidden');
        const hideIndicator = () => indicatorMax?.classList.add('is-hidden');
        showIndicator();

        ringNodes.forEach((ringEl) => {
            ringEl.addEventListener('mouseenter', () => {
                const index = Number(ringEl.dataset.songIndex);
                this.activateRing(index, { locked: false, source: 'hover' });
                hideIndicator();
            });

            ringEl.addEventListener('mouseleave', () => {
                const index = Number(ringEl.dataset.songIndex);
                if (this.lockedIndex !== null && this.lockedIndex !== index) {
                    this.activateRing(this.lockedIndex, { locked: true, source: 'tonearm' });
                    return;
                }
                this.stopRingRotation(index);
                ringEl.classList.remove('is-hovered');
                ringEl.classList.remove('is-active');
                if (this.lockedIndex === index) this.lockedIndex = null;
                if (this.activeIndex === index) this.activeIndex = null;
                this.stopSong(true);
            });

            ringEl.addEventListener('click', () => {
                const index = Number(ringEl.dataset.songIndex);
                this.handleFirstGesture();
                this.activateRing(index, { locked: true, source: 'click' });
                hideIndicator();
            });
        });

        const discArea = this.container.querySelector('.record-disc-area');
        if (discArea) {
            discArea.addEventListener('mouseleave', () => {
                this.stopAllRingRotation();
                this.clearActiveRing({ preserveLocked: false });
                this.stopSong(true);
                showIndicator();
            });
        }
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

    activateRing(index, { locked = false, source = 'hover' } = {}) {
        if (index < 0 || index >= this.data.length) return;
        const ringSel = this.getRingSelection(index);
        if (!ringSel.node()) return;

        if (locked) {
            if (this.lockedIndex !== index) {
                if (this.lockedIndex !== null && this.lockedIndex !== index) {
                    this.stopRingRotation(this.lockedIndex);
                    const prevLocked = this.getRingSelection(this.lockedIndex);
                    prevLocked.classed('is-active', false).classed('is-hovered', false);
                }
                this.lockedIndex = index;
            }
        }

        if (this.activeIndex !== null && this.activeIndex !== index) {
            const previous = this.getRingSelection(this.activeIndex);
            if (previous.node() && this.lockedIndex !== this.activeIndex) {
                this.stopRingRotation(this.activeIndex);
                previous.classed('is-active', false).classed('is-hovered', false);
            }
        }

        const isHover = source === 'hover';
        const isAuto = source === 'auto';

        ringSel.classed('is-hovered', isHover);
        ringSel.classed('is-active', locked || this.lockedIndex === index || !isHover);

        if (isHover || isAuto) {
            this.startRingRotation(index);
        } else if (!locked && this.lockedIndex !== index) {
            this.stopRingRotation(index);
        }

        // Enable audio during hover, click, or auto-sequence
        this.playSong(index, { autoplay: isHover || locked || isAuto });
        if (isHover) {
            this.setTonearmToIndex(index, { silent: true });
        } else {
            this.setTonearmToIndex(index, { silent: !locked });
        }
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
    }

    setTonearmToIndex(index, { silent = false } = {}) {
        if (!this.tonearmArm || index == null || index < 0 || index >= this.data.length) return;

        // Use angleScale from setupScales()
        const angle = this.angleScale(index);
        console.log(`Ring ${index}, angle ${angle.toFixed(1)}°`);

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

    playSong(index, { autoplay = true, force = false } = {}) {
        const song = this.data[index];

        if (!song || !song.playUrl) {
            this.stopSong(true);
            return;
        }

        let audio = this.audioCache.get(song.playUrl);
        if (!audio) {
            audio = new Audio(song.playUrl);
            audio.loop = true;
            audio.preload = 'auto';
            this.audioCache.set(song.playUrl, audio);
        }

        audio.muted = false;

        if (autoplay && !force && !this.autoplayUnlocked) {
            this.currentAudio = audio;
            this.currentAudioIndex = index;

            audio.currentTime = 0;
            audio.muted = true;
            audio.play().then(() => {
                audio.muted = false;
                audio.currentTime = 0;
                this.autoplayUnlocked = true;
                audio.play().then(() => {
                    this.toggleNotes(true);
                }).catch(() => {
                    this.toggleNotes(false);
                });
            }).catch(() => {
                this.pendingAudioIndex = index;
                this.toggleNotes(false);
                document.addEventListener('pointerdown', this.handleFirstGesture, { once: true });
            });
            return;
        }

        if (this.currentAudioIndex === index && this.currentAudio) {
            if (autoplay && this.currentAudio.paused) {
                this.currentAudio.play().catch(() => this.toggleNotes(false));
            }
            return;
        }

        if (this.currentAudio && this.currentAudioIndex !== index) {
            this.currentAudio.pause();
            this.currentAudio.currentTime = 0;
        }

        this.currentAudio = audio;
        this.currentAudioIndex = index;

        audio.currentTime = 0;
        if (autoplay || force) {
            this.toggleNotes(true);
            audio.play().catch(() => {
                this.pendingAudioIndex = index;
                this.toggleNotes(false);
                this.autoplayUnlocked = false;
                document.addEventListener('pointerdown', this.handleFirstGesture, { once: true });
            });
        } else {
            this.toggleNotes(false);
        }
    }


    stopSong(force = false) {
        if (!this.currentAudio) return;
        if (!force && this.lockedIndex !== null) return;
        this.currentAudio.pause();
        this.currentAudio.currentTime = 0;
        this.currentAudio = null;
        this.currentAudioIndex = null;
        this.toggleNotes(false);
    }

    toggleNotes(isPlaying) {
        if (!this.wrapperEl) return;
        if (isPlaying) {
            this.wrapperEl.classList.add('is-playing');
        } else {
            this.wrapperEl.classList.remove('is-playing');
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
                arc.style('filter', 'drop-shadow(0 0 8px var(--color-accent-cyan))');
                arc.style('stroke', 'var(--color-accent-cyan)');
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
        this.stopSong(true);
        this.stopAllRingRotation();
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
}
