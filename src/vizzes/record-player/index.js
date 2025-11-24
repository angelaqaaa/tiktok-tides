import * as d3 from 'd3';

const VIEWBOX_SIZE = 700;
const CENTER = VIEWBOX_SIZE / 2;
const OUTER_RADIUS = CENTER - 60;
const INNER_RADIUS = 60;
const ROTATION_SPEED = 360 / 12000; // deg per ms

// Default album cover when no song is selected
const DEFAULT_ALBUM_COVER = "/data/record_music_cover/noSong.jpg";

// Album cover paths - randomly shuffled
const albumCoverPaths = [
    "/data/record_music_cover/premium_vector-1711922642822-695731cfcb4a.avif",
    "/data/record_music_cover/premium_vector-1711987689675-439d95531384.avif",
    "/data/record_music_cover/premium_vector-1717009247018-b153fdffe0d7.avif",
    "/data/record_music_cover/premium_vector-1725675010771-4bc9e0c22249.avif",
    "/data/record_music_cover/premium_vector-1745509208269-c7a2d8c1ac6e.avif",
    "/data/record_music_cover/premium_vector-1758194439297-68d0d2577abb.avif",
    "/data/record_music_cover/premium_vector-1762261283518-65c1081da634.avif"
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

        this.autoplayUnlocked = false;
        this.pendingAudioIndex = null;
        this.handleFirstGesture = this.handleFirstGesture.bind(this);
        this.handleMuteToggle = this.handleMuteToggle.bind(this);
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

        // Song info screen elements
        this.songInfoScreen = this.container.querySelector('[data-song-info-screen]');
        this.songTitleEl = this.container.querySelector('[data-song-title]');
        this.songDescriptionEl = this.container.querySelector('[data-song-description]');
        this.albumCoverEl = this.container.querySelector('[data-album-cover]');

        // Mute toggle button
        this.muteToggleButton = this.container.querySelector('[data-mute-toggle]');

        await this.loadData();
        this.setupScales();
        this.renderRings();
        this.bindInteractions();
        this.bindMuteToggle();
        this.initializeMuteButton(); // Set initial mute button state
        this.resetSongInfo(); // Set default "no song" state
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

        // Load song info data
        try {
            const songInfoResponse = await fetch('/data/songInfo/songInfo.json');
            this.songInfo = await songInfoResponse.json();
        } catch (error) {
            console.warn('Failed to load song info:', error);
            this.songInfo = [];
        }

        // Initialize audio cache but don't play until hovered/interacted
        this.audioCache = new Map(); //map storing loaded music
        // Don't preload and play all songs - only create when needed

        this.totalRings = this.data.length;
    }

    setupScales() {
        const ringStep = (OUTER_RADIUS - INNER_RADIUS) / this.data.length;
        this.radiusScale = (index) => OUTER_RADIUS - (index + 0.75) * ringStep;

        const maxAngle = 35;
        const minAngle = 10;
        this.angleScale = d3.scaleLinear().domain([0, this.totalRings - 1]).range([minAngle, maxAngle]);
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
                // Reset song info display when hover ends
                this.resetSongInfo();
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
                this.resetSongInfo();
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

        ringSel.classed('is-hovered', isHover);
        ringSel.classed('is-active', locked || this.lockedIndex === index || !isHover);

        if (isHover) {
            this.startRingRotation(index);
        } else if (!locked && this.lockedIndex !== index) {
            this.stopRingRotation(index);
        }

        // Update song info display
        this.updateSongInfo(index);

        this.playSong(index, { autoplay: isHover || locked });
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
        const angle = this.angleScale(index);
        console.log('angle', angle);
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
            this.songTitleEl.textContent = song.name || 'No song selected';
        }

        if (this.songDescriptionEl) {
            this.songDescriptionEl.textContent = info?.description || 'Hover over a ring to see song information';
        }

        if (this.albumCoverEl) {
            // Get album cover based on ring index (sorted by popularity)
            // Index 0 = most popular (outermost ring), index 9 = least popular (innermost ring)
            const albumCoverPath = this.shuffledAlbumCovers[index % this.shuffledAlbumCovers.length];

            if (albumCoverPath) {
                this.albumCoverEl.src = albumCoverPath;
                this.albumCoverEl.alt = `${song.name} album cover`;
            } else {
                this.albumCoverEl.src = '';
                this.albumCoverEl.alt = 'Album cover';
            }
        }
    }

    resetSongInfo() {
        if (this.songTitleEl) {
            this.songTitleEl.textContent = 'No song selected';
        }

        if (this.songDescriptionEl) {
            this.songDescriptionEl.textContent = 'Hover over a ring to see song information';
        }

        if (this.albumCoverEl) {
            this.albumCoverEl.src = DEFAULT_ALBUM_COVER;
            this.albumCoverEl.alt = 'No song selected';
        }
    }

    playSong(index, { autoplay = true, force = false } = {}) {
        const song = this.data[index];

        if (!song || !song.playUrl) {
            this.stopSong(true);
            return;
        }

        // Update song info display
        this.updateSongInfo(index);

        let audio = this.audioCache.get(song.playUrl);
        if (!audio) {
            audio = new Audio(song.playUrl);
            audio.loop = true;
            audio.preload = 'auto';
            this.audioCache.set(song.playUrl, audio);
        }

        audio.muted = this.isMuted;

        if (autoplay && !force && !this.autoplayUnlocked) {
            this.currentAudio = audio;
            this.currentAudioIndex = index;

            audio.currentTime = 0;
            audio.muted = true;
            audio.play().then(() => {
                audio.muted = this.isMuted;
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
        if (!this.currentAudio) {
            // Even if no audio, ensure song info is reset if no active song
            if (this.activeIndex === null && this.lockedIndex === null) {
                this.resetSongInfo();
            }
            return;
        }
        if (!force && this.lockedIndex !== null) return;
        this.currentAudio.pause();
        this.currentAudio.currentTime = 0;
        this.currentAudio.muted = true; // Ensure it's muted when stopped
        this.currentAudio = null;
        this.currentAudioIndex = null;
        this.toggleNotes(false);
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

        // Only update the currently playing audio if there's an active song
        // Don't resume playback if no song is currently active (hovered/clicked)
        if (this.currentAudio && this.activeIndex !== null) {
            this.currentAudio.muted = this.isMuted;
        } else if (this.currentAudio && this.activeIndex === null) {
            // If no active song but audio exists, stop it and reset song info
            this.stopSong(true);
            this.resetSongInfo();
        } else if (!this.currentAudio && this.activeIndex === null) {
            // If no audio and no active song, ensure song info is reset
            this.resetSongInfo();
        }
    }
}
