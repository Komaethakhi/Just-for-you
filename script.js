/* ==================================================
   CINEMATIC NARRATIVE & AUDIO SYNTH ENGINE - TANGLISH UPDATE
   ================================================== */

// ==========================================
// 1. WEB AUDIO API SYNTHESIZER
// ==========================================

class CinematicSynth {
    constructor() {
        this.ctx = null;
        this.gainNode = null;
        this.filterNode = null;
        this.delayNode = null;
        this.delayFeedbackNode = null;
        this.activeOscillators = [];
        this.muted = false;
        this.isPlaying = false;
        this.chordInterval = null;
        this.currentScale = 'major'; // 'major', 'minor', 'triumph', 'peace'
        this.chordIndex = 0;
        this.volumeLevel = 0.18; // soft piano level
        
        // Auto-check for uploaded background music file
        this.bgMusic = new Audio();
        this.bgMusic.src = 'assets/audio/bgm.mpeg';
        this.bgMusic.loop = true;
        this.useUploadedMusic = false;
        
        this.bgMusic.addEventListener('canplaythrough', () => {
            this.useUploadedMusic = true;
        });
        this.bgMusic.addEventListener('error', () => {
            this.useUploadedMusic = false; // Fallback to felt piano synth if blocked or missing
        });
        
        this.bgMusic.load(); // Force browser file resolution check
    }

    init() {
        if (this.ctx) return;
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioContextClass();
        
        this.gainNode = this.ctx.createGain();
        this.gainNode.gain.setValueAtTime(0, this.ctx.currentTime);
        
        // Lowpass filter set to 600Hz to remove harsh buzzy harmonics, creating felt piano tone
        this.filterNode = this.ctx.createBiquadFilter();
        this.filterNode.type = 'lowpass';
        this.filterNode.frequency.setValueAtTime(600, this.ctx.currentTime);
        
        this.delayNode = this.ctx.createDelay(1.2);
        this.delayNode.delayTime.setValueAtTime(0.45, this.ctx.currentTime);
        
        this.delayFeedbackNode = this.ctx.createGain();
        this.delayFeedbackNode.gain.setValueAtTime(0.35, this.ctx.currentTime);
        
        this.delayNode.connect(this.delayFeedbackNode);
        this.delayFeedbackNode.connect(this.delayNode);
        
        this.filterNode.connect(this.gainNode);
        this.filterNode.connect(this.delayNode);
        this.delayNode.connect(this.gainNode);
        this.gainNode.connect(this.ctx.destination);
    }

    start() {
        this.init();
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
        this.isPlaying = true;

        if (this.useUploadedMusic) {
            this.bgMusic.volume = 0.0001;
            this.bgMusic.play().catch(err => console.log("Bg audio playback blocked:", err));
            gsap.to(this.bgMusic, { volume: this.muted ? 0.0001 : 0.45, duration: 2.0 });
        } else {
            this.fadeToVolume(this.muted ? 0.0001 : this.volumeLevel, 2.0);
            this.startChordProgression();
        }
    }

    stop() {
        if (this.useUploadedMusic) {
            gsap.to(this.bgMusic, {
                volume: 0.0001,
                duration: 1.2,
                onComplete: () => {
                    this.bgMusic.pause();
                    this.isPlaying = false;
                }
            });
        } else {
            this.fadeToVolume(0.0001, 1.2);
            setTimeout(() => {
                if (this.chordInterval) clearInterval(this.chordInterval);
                this.isPlaying = false;
            }, 1300);
        }
    }

    fadeToVolume(target, duration) {
        if (!this.gainNode || !this.ctx) return;
        const now = this.ctx.currentTime;
        this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, now);
        this.gainNode.gain.exponentialRampToValueAtTime(target, now + duration);
    }

    setMute(mute) {
        this.muted = mute;
        if (this.isPlaying) {
            if (this.useUploadedMusic) {
                gsap.to(this.bgMusic, { volume: mute ? 0.0001 : 0.45, duration: 0.8 });
            } else {
                this.fadeToVolume(mute ? 0.0001 : this.volumeLevel, 0.8);
            }
        }
    }

    setScale(scale) {
        if (this.currentScale === scale) return;
        this.currentScale = scale;
        this.chordIndex = 0;
        if (this.isPlaying && !this.useUploadedMusic) {
            this.playNextChord();
        }
    }

    // Felt Piano Note synthesises a warm, organic hammer strike with a lowpass damp
    playPianoNote(freq, duration, gain = 0.07) {
        if (!this.ctx || this.ctx.state === 'suspended' || this.muted) return;
        
        const osc = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const oscGain = this.ctx.createGain();
        
        osc.type = 'sine'; // pure round fundamental
        osc2.type = 'triangle'; // soft overtones
        
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        osc2.frequency.setValueAtTime(freq * 1.002, this.ctx.currentTime); // natural chorusing detune
        
        const now = this.ctx.currentTime;
        oscGain.gain.setValueAtTime(0, now);
        // Piano attack: instant strike
        oscGain.gain.linearRampToValueAtTime(gain, now + 0.015);
        // Piano decay/release: long natural damping fadeout
        oscGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
        
        const keyFilter = this.ctx.createBiquadFilter();
        keyFilter.type = 'lowpass';
        keyFilter.frequency.setValueAtTime(600, this.ctx.currentTime); 
        
        osc.connect(oscGain);
        osc2.connect(oscGain);
        oscGain.connect(keyFilter);
        keyFilter.connect(this.filterNode);
        
        osc.start(now);
        osc2.start(now);
        osc.stop(now + duration + 0.1);
        osc2.stop(now + duration + 0.1);
        
        this.activeOscillators.push(osc);
        setTimeout(() => {
            const idx = this.activeOscillators.indexOf(osc);
            if (idx > -1) this.activeOscillators.splice(idx, 1);
        }, duration * 1000 + 300);
    }

    // Defensive bridge to map old playNote calls to playPianoNote
    playNote(freq, duration, type = 'sine', gain = 0.07) {
        this.playPianoNote(freq, duration, gain);
    }

    // Plays strummed chords (staggering start time by 140ms per note)
    playStrummedChord(notes, duration) {
        notes.forEach((freq, idx) => {
            const delay = idx * 0.14; 
            setTimeout(() => {
                if (this.isPlaying && !this.muted && !this.useUploadedMusic) {
                    this.playPianoNote(freq, duration - delay, 0.075);
                }
            }, delay * 1000);
        });
    }

    startChordProgression() {
        if (this.chordInterval) clearInterval(this.chordInterval);
        this.playNextChord();
        this.chordInterval = setInterval(() => {
            this.playNextChord();
        }, 5500);
    }

    playNextChord() {
        if (this.useUploadedMusic) return;

        const scales = {
            major: [
                [174.61, 220.00, 261.63, 329.63], // Fmaj7
                [130.81, 196.00, 246.94, 293.66], // Cmaj9
                [196.00, 246.94, 293.66, 392.00], // G6
                [220.00, 261.63, 329.63, 392.00]  // Am7
            ],
            minor: [
                [110.00, 164.81, 220.00, 261.63], // Am
                [146.83, 220.00, 293.66, 349.23], // Dm
                [130.81, 196.00, 261.63, 329.63], // C
                [123.47, 164.81, 246.94, 329.63]  // Esus4
            ],
            triumph: [
                [130.81, 261.63, 329.63, 392.00, 493.88], // Cmaj7
                [174.61, 349.23, 440.00, 523.25, 659.25], // Fmaj7
                [196.00, 392.00, 493.88, 587.33, 739.99], // Gadd9
                [220.00, 440.00, 523.25, 659.25, 783.99]  // Am7
            ],
            peace: [
                [130.81, 261.63, 329.63, 392.00], // C
                [174.61, 261.63, 349.23, 440.00], // F
                [130.81, 261.63, 329.63, 392.00], // C
                [196.00, 293.66, 392.00, 440.00]  // G
            ]
        };

        const currentScaleSet = scales[this.currentScale] || scales.major;
        const chord = currentScaleSet[this.chordIndex];
        this.playStrummedChord(chord, 5.0);
        
        // Gentle High Octave improvisation melody (rolled after chord)
        setTimeout(() => {
            if (this.isPlaying && !this.muted && !this.useUploadedMusic && Math.random() > 0.4) {
                const improvNotes = [chord[2] * 2, chord[3] * 2];
                const noteFreq = improvNotes[Math.floor(Math.random() * improvNotes.length)];
                this.playPianoNote(noteFreq, 2.0, 0.035);
            }
        }, 2200);

        this.chordIndex = (this.chordIndex + 1) % currentScaleSet.length;
    }
}

// ==========================================
// 2. CANVAS PARTICLE RENDERING SYSTEM
// ==========================================

class ParticleEngine {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.mode = 'idle'; 
        this.particles = [];
        this.running = false;
        
        this.resize = this.resize.bind(this);
        this.loop = this.loop.bind(this);
        
        window.addEventListener('resize', this.resize);
        this.resize();
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    setMode(mode) {
        this.mode = mode;
        this.particles = [];
        if (mode !== 'idle' && !this.running) {
            this.running = true;
            this.loop();
        }
    }

    stop() {
        this.running = false;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    loop() {
        if (!this.running) return;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        if (this.mode === 'rain') {
            this.updateRain();
        } else if (this.mode === 'embers') {
            this.updateEmbers();
        } else if (this.mode === 'sparkles') {
            this.updateSparkles();
        }
        requestAnimationFrame(this.loop);
    }

    updateRain() {
        if (this.particles.length < 150) {
            this.particles.push({
                x: Math.random() * this.canvas.width,
                y: -30,
                length: Math.random() * 20 + 20,
                speed: Math.random() * 10 + 16,
                opacity: Math.random() * 0.35 + 0.15,
                wind: Math.random() * 1.5 - 0.75
            });
        }
        this.particles.forEach((p, i) => {
            p.y += p.speed;
            p.x += p.wind - 1.2;
            
            this.ctx.beginPath();
            this.ctx.strokeStyle = `rgba(180, 220, 255, ${p.opacity})`;
            this.ctx.lineWidth = 1;
            this.ctx.moveTo(p.x, p.y);
            this.ctx.lineTo(p.x - 2, p.y + p.length);
            this.ctx.stroke();
            
            if (p.y > this.canvas.height) {
                this.particles[i] = {
                    x: Math.random() * this.canvas.width,
                    y: -30,
                    length: Math.random() * 20 + 20,
                    speed: Math.random() * 10 + 16,
                    opacity: Math.random() * 0.35 + 0.15,
                    wind: Math.random() * 1.5 - 0.75
                };
            }
        });
    }

    updateEmbers() {
        if (this.particles.length < 75) {
            this.particles.push({
                x: Math.random() * this.canvas.width,
                y: this.canvas.height + 20,
                size: Math.random() * 3 + 1,
                speedY: -(Math.random() * 1.0 + 0.7),
                speedX: Math.random() * 0.6 - 0.3,
                wobble: Math.random() * 0.04,
                opacity: Math.random() * 0.5 + 0.4,
                color: 'rgba(255, 200, 40, '
            });
        }
        this.particles.forEach((p, i) => {
            p.y += p.speedY;
            p.x += p.speedX + Math.sin(p.y * 0.01) * 0.3;
            p.opacity -= 0.0015;
            
            this.ctx.beginPath();
            const grad = this.ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 2);
            grad.addColorStop(0, `${p.color}${p.opacity})`);
            grad.addColorStop(1, `${p.color}0)`);
            this.ctx.fillStyle = grad;
            this.ctx.arc(p.x, p.y, p.size * 2.5, 0, Math.PI * 2);
            this.ctx.fill();
            
            if (p.y < -20 || p.opacity <= 0) {
                this.particles[i] = {
                    x: Math.random() * this.canvas.width,
                    y: this.canvas.height + 20,
                    size: Math.random() * 3 + 1,
                    speedY: -(Math.random() * 1.0 + 0.7),
                    speedX: Math.random() * 0.6 - 0.3,
                    wobble: Math.random() * 0.04,
                    opacity: Math.random() * 0.5 + 0.4,
                    color: 'rgba(255, 200, 40, '
                };
            }
        });
    }

    updateSparkles() {
        if (this.particles.length < 80) {
            this.particles.push({
                x: Math.random() * this.canvas.width,
                y: -10,
                size: Math.random() * 4 + 3,
                speedY: Math.random() * 2 + 1.2,
                speedX: Math.random() * 1.6 - 0.8,
                rot: Math.random() * Math.PI,
                rotSpeed: Math.random() * 0.04 - 0.02,
                color: `hsl(${Math.random() * 55 + 345}, 90%, 65%)`,
                opacity: 1
            });
        }
        this.particles.forEach((p, i) => {
            p.y += p.speedY;
            p.x += p.speedX;
            p.rot += p.rotSpeed;
            p.opacity -= 0.004;
            
            this.ctx.save();
            this.ctx.translate(p.x, p.y);
            this.ctx.rotate(p.rot);
            this.ctx.fillStyle = p.color;
            this.ctx.globalAlpha = p.opacity;
            this.ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
            this.ctx.restore();
            
            if (p.y > this.canvas.height || p.opacity <= 0) {
                this.particles[i] = {
                    x: Math.random() * this.canvas.width,
                    y: -10,
                    size: Math.random() * 4 + 3,
                    speedY: Math.random() * 2 + 1.2,
                    speedX: Math.random() * 1.6 - 0.8,
                    rot: Math.random() * Math.PI,
                    rotSpeed: Math.random() * 0.04 - 0.02,
                    color: `hsl(${Math.random() * 55 + 345}, 90%, 65%)`,
                    opacity: 1
                };
            }
        });
    }
}

/**
 * Starfield: Global Background Engine
 * Renders glittering twinkle sparkles, diagonal shooting stars (left to right),
 * and soft pink floating hearts in the background.
 */
class Starfield {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.stars = [];
        this.shootingStars = [];
        this.hearts = [];
        
        this.resize();
        window.addEventListener('resize', () => this.resize());
        this.loop();
    }
    
    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.initStars();
        this.initHearts();
    }
    
    initStars() {
        this.stars = [];
        const count = Math.floor((this.canvas.width * this.canvas.height) / 8500);
        for (let i = 0; i < count; i++) {
            const isSparkler = Math.random() > 0.85; // 15% brightest stars get crosshair sparkles
            this.stars.push({
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height,
                size: isSparkler ? Math.random() * 2.0 + 1.2 : Math.random() * 1.2 + 0.4,
                speed: Math.random() * 0.03 + 0.008,
                phase: Math.random() * Math.PI * 2,
                brightness: Math.random() * 0.65 + 0.35,
                sparkle: isSparkler
            });
        }
    }

    initHearts() {
        this.hearts = [];
        const count = 16;
        for (let i = 0; i < count; i++) {
            this.hearts.push({
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height + this.canvas.height, // spawn below or staggered
                size: Math.random() * 8 + 4,
                speedY: -(Math.random() * 0.7 + 0.4),
                speedX: Math.random() * 0.4 - 0.2,
                phase: Math.random() * Math.PI * 2,
                phaseSpeed: Math.random() * 0.025 + 0.01,
                alpha: Math.random() * 0.22 + 0.08 // very soft transparent rose backdrop
            });
        }
    }

    drawHeart(x, y, size, alpha) {
        this.ctx.save();
        this.ctx.translate(x, y);
        this.ctx.beginPath();
        this.ctx.fillStyle = `rgba(255, 60, 112, ${alpha})`;
        this.ctx.moveTo(0, -size / 4);
        // Left lobe
        this.ctx.bezierCurveTo(-size / 2, -size / 2, -size, -size / 4, -size, size / 4);
        // Bottom tip
        this.ctx.bezierCurveTo(-size, size * 0.6, -size / 4, size * 0.8, 0, size);
        // Right tip
        this.ctx.bezierCurveTo(size / 4, size * 0.8, size, size * 0.6, size, size / 4);
        // Right lobe
        this.ctx.bezierCurveTo(size, -size / 4, size / 2, -size / 2, 0, -size / 4);
        this.ctx.closePath();
        this.ctx.fill();
        this.ctx.restore();
    }

    updateStars() {
        this.stars.forEach(s => {
            s.phase += s.speed;
            const alpha = Math.abs(Math.sin(s.phase)) * s.brightness * 0.75 + 0.1;
            
            // Draw static twinkle circle
            this.ctx.beginPath();
            this.ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
            this.ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
            this.ctx.fill();
            
            // If sparkler, draw 4-point glittering flares
            if (s.sparkle && alpha > 0.4) {
                const flare = s.size * 2.8 * alpha;
                this.ctx.beginPath();
                this.ctx.strokeStyle = `rgba(255, 240, 180, ${alpha * 0.75})`;
                this.ctx.lineWidth = 0.8;
                // Horizontal line
                this.ctx.moveTo(s.x - flare, s.y);
                this.ctx.lineTo(s.x + flare, s.y);
                // Vertical line
                this.ctx.moveTo(s.x, s.y - flare);
                this.ctx.lineTo(s.x, s.y + flare);
                this.ctx.stroke();
            }
        });
    }

    updateShootingStars() {
        // Spawn chance (0.8% per frame, max 3 stars concurrent)
        if (Math.random() < 0.008 && this.shootingStars.length < 3) {
            this.shootingStars.push({
                x: Math.random() * (this.canvas.width * 0.75) - 100,
                y: Math.random() * (this.canvas.height * 0.4) - 100,
                length: Math.random() * 70 + 70,
                speed: Math.random() * 9 + 11,
                dx: Math.cos(35 * Math.PI / 180), // 35 degrees angle
                dy: Math.sin(35 * Math.PI / 180),
                opacity: 1
            });
        }

        this.shootingStars.forEach((s, idx) => {
            s.x += s.speed * s.dx;
            s.y += s.speed * s.dy;
            s.opacity -= 0.014; // fade out trail

            if (s.opacity > 0) {
                // Diagonal fading trail gradient
                const grad = this.ctx.createLinearGradient(
                    s.x - s.length * s.dx, s.y - s.length * s.dy,
                    s.x, s.y
                );
                grad.addColorStop(0, 'rgba(255, 255, 255, 0)');
                grad.addColorStop(1, `rgba(255, 255, 255, ${s.opacity * 0.85})`);

                this.ctx.beginPath();
                this.ctx.strokeStyle = grad;
                this.ctx.lineWidth = 1.6;
                this.ctx.moveTo(s.x - s.length * s.dx, s.y - s.length * s.dy);
                this.ctx.lineTo(s.x, s.y);
                this.ctx.stroke();
            }

            // Recycle off-screen or faded stars
            if (s.x > this.canvas.width + 100 || s.y > this.canvas.height + 100 || s.opacity <= 0) {
                this.shootingStars.splice(idx, 1);
            }
        });
    }

    updateHearts() {
        this.hearts.forEach(h => {
            h.y += h.speedY;
            h.phase += h.phaseSpeed;
            h.x += h.speedX + Math.sin(h.phase) * 0.28;
            
            this.drawHeart(h.x, h.y, h.size, h.alpha);
            
            // Recycle heart to bottom if it rises past top
            if (h.y < -30) {
                h.y = this.canvas.height + 30;
                h.x = Math.random() * this.canvas.width;
                h.alpha = Math.random() * 0.22 + 0.08;
            }
        });
    }

    loop() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Background Render Stack
        this.updateStars();
        this.updateShootingStars();
        this.updateHearts();
        
        requestAnimationFrame(() => this.loop());
    }
}

// ==========================================
// 3. TANGLISH NARRATIVE CONFIG DATA
// ==========================================

const STAGE_FLOW = [
    { id: 'scene-welcome' },
    { id: 'scene-letter' },
    { id: 'scene-gift' },
    { id: 'scene-emotion' },
    { id: 'scene-motivation' },
    { id: 'scene-story-boy' },
    { id: 'scene-story-adult' },
    { id: 'scene-story-success' },
    { id: 'scene-story-epilogue' }
];

const NARRATIVE_SUBTITLES_TANGLISH = {
    'scene-story-boy': [
        { time: 500, text: "Oru chinna paiyan... cycle-la pogumbodhu, frustrations, dreams oda travel panran." },
        { time: 4200, text: "Avan cycle la poga poga, life-oda bharam adhigam aaguradha feel panran..." }
    ],
    'scene-story-adult': [
        { time: 500, text: "Adhe paiyan ipo oru responsible man ahh... Kudumba poruppugalum, money pirachanaiyum avana soozhndhaalume." },
        { time: 4500, text: "Tholvigal, stress, rejections, thanimai soozhndhalum koodaa..." },
        { time: 8200, text: "Evlo pressure irundhalum, avan nenjil irukura dreams innum marayala." }
    ],
    'scene-story-success': [
        { time: 500, text: "He believes him! He tries again!!." },
        { time: 3800, text: "Kadaisila vetri. Dreams ellaame reality-ah maariruchuuh. Now Success is in his hand! ❤️🏆" }
    ],
    'scene-story-epilogue': []
};

const TANGLISH_LETTER_TEMPLATE = `Hey {NAME} ❤️,

Surprise! Ennoda small gift for youhhhhh... ✨

Life ippo ungalukuuh easy-ah illanuhh enakku theriyum. Money issues, Responsibilities, Stress, Rejections, Tholvi... ellame ungalukuuh ipo venaah irukkalaam. Aana ungalodaah confidence, chance eh illah.

Ungalukaga, unga dreams wait pannitu irukku. Ipo venaa situation ungalukuuh kastam kudukalaam, aana neengathaan '{NAME}', Ungala nambi irukuravangaloda proud smile!.. Unga dream bike, unga dream home, unga success... ellame oru naal unga lifestyle-ah maarum.

focus on your goal {NAME}. I am always there for you in all situations. Ungaloda indha journey-la unga dreams ennadhu nu paakalamaa. Ready-aah? 🚀`;

// ==========================================
// 4. MAIN CINEMATIC DIRECTOR ENGINE
// ==========================================

class CinematicDirector {
    constructor() {
        this.synth = new CinematicSynth();
        this.particles = new ParticleEngine('particle-overlay-canvas');
        this.starfield = new Starfield('starfield-canvas');
        
        this.visitorName = "Raj";
        this.currentStageIdx = 0;
        this.subtitleTimers = [];
        this.paused = false;
        
        // Dom selectors
        this.hud = document.getElementById('cinematic-hud');
        this.hudPlayPause = document.getElementById('hud-play-pause');
        this.hudAudioToggle = document.getElementById('hud-audio-toggle');
        this.subtitleText = document.getElementById('subtitle-text');
        
        // State variables
        this.letterTypingInterval = null;
        this.unlockedCards = 0;
        this.bikeSFX = document.getElementById('sfx-bike');
        this.zoomedCard = null;
        this.unlockedCardsList = new Set();
        
        this.bindEvents();
    }

    bindEvents() {
        // Unlock triggers
        document.getElementById('btn-unlock-sound').addEventListener('click', () => this.unlockVerification(false));
        document.getElementById('btn-unlock-muted').addEventListener('click', () => this.unlockVerification(true));
        
        // HUD buttons
        this.hudPlayPause.addEventListener('click', () => this.togglePlayback());
        this.hudAudioToggle.addEventListener('click', () => this.toggleAudio());
        document.getElementById('hud-next').addEventListener('click', () => this.nextStage());
        document.getElementById('hud-prev').addEventListener('click', () => this.prevStage());
        
        // Closed letter trigger
        document.getElementById('btn-close-letter').addEventListener('click', () => this.nextStage());
        
        // Gift proceeding trigger
        document.getElementById('btn-gift-proceed').addEventListener('click', () => this.nextStage());
        
        // Motivation trigger
        document.getElementById('btn-start-story').addEventListener('click', () => this.nextStage());
        
        // Replay trigger
        document.getElementById('btn-final-replay').addEventListener('click', () => this.replayJourney());
        
        // Backdrop Click to Place Down
        document.getElementById('card-backdrop').addEventListener('click', () => {
            if (this.zoomedCard) {
                this.placeDownCard(this.zoomedCard);
            }
        });
    }

    unlockVerification(isMuted) {
        const nameInput = document.getElementById('visitor-name');
        const enteredName = nameInput.value.trim();
        const lowerName = enteredName.toLowerCase();
        const errorEl = document.getElementById('welcome-error');
        const box = document.querySelector('.welcome-box');
        
        if (lowerName === "raj" || lowerName === "rajesh") {
            this.visitorName = this.capitalize(enteredName);
            errorEl.innerText = "";
            
            // Audio init
            this.synth.setMute(isMuted);
            if (isMuted) {
                this.hudAudioToggle.classList.remove('sound-playing');
                this.hudAudioToggle.querySelector('i').className = 'fa-solid fa-volume-xmark';
            }
            this.synth.start();
            this.hud.classList.remove('hidden');
            
            // Transition to Letter
            this.nextStage();
        } else {
            errorEl.innerText = "Hmm... 😊 Indha surprise Raj-ku mattumdhaan lock pannirukku!";
            box.classList.add('shake');
            
            if (!isMuted) {
                this.synth.playNote(150, 0.4, 'sawtooth', 0.1);
            }
            
            setTimeout(() => box.classList.remove('shake'), 400);
        }
    }

    capitalize(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    transitionToStage(stageIdx) {
        if (stageIdx < 0 || stageIdx >= STAGE_FLOW.length) return;
        
        this.clearStageTimers();
        this.currentStageIdx = stageIdx;
        const stage = STAGE_FLOW[stageIdx];
        
        if (stage.id === 'scene-welcome') {
            this.hud.classList.add('hidden');
        } else {
            this.hud.classList.remove('hidden');
        }

        this.hideSubtitle();

        document.querySelectorAll('.scene').forEach(sec => {
            sec.classList.remove('active-scene');
        });
        const activeNode = document.getElementById(stage.id);
        activeNode.classList.add('active-scene');
        
        this.updateGlobalBackground(stage.id);
        this.setupStageEnvironment(stage.id);
        this.runSubtitles(stage.id);
    }

    updateGlobalBackground(stageId) {
        const backdrop = document.getElementById('ambient-backdrop');
        let bgStyle = "";
        
        switch (stageId) {
            case 'scene-welcome':
            case 'scene-letter':
            case 'scene-gift':
            case 'scene-motivation':
                bgStyle = "radial-gradient(circle at 10% 20%, var(--bg-aurora-1) 0%, transparent 40%), radial-gradient(circle at 90% 80%, var(--bg-aurora-2) 0%, transparent 40%), linear-gradient(180deg, #03050c 0%, #0a0d1e 50%, #03050c 100%)";
                break;
                
            case 'scene-emotion':
                bgStyle = "radial-gradient(circle at 50% 50%, #030a21 0%, #010206 100%)";
                break;
                
            case 'scene-story-boy':
                bgStyle = "linear-gradient(to bottom, #11152a 0%, #4a283c 45%, #ca5b33 75%, #ca5b33 100%)";
                break;
                
            case 'scene-story-adult':
                bgStyle = "linear-gradient(180deg, #020308 0%, #080c1f 100%)";
                break;
                
            case 'scene-story-success':
                bgStyle = "radial-gradient(circle at 50% 50%, #0f1538 0%, #03050c 100%)";
                break;
                
            case 'scene-story-epilogue':
                bgStyle = "linear-gradient(180deg, #020307 0%, #010206 100%)";
                break;
        }
        
        gsap.to(backdrop, {
            background: bgStyle,
            duration: 2.0,
            ease: "power2.out"
        });
    }

    nextStage() {
        if (this.currentStageIdx < STAGE_FLOW.length - 1) {
            this.transitionToStage(this.currentStageIdx + 1);
        }
    }

    prevStage() {
        if (this.currentStageIdx > 0) {
            this.transitionToStage(this.currentStageIdx - 1);
        }
    }

    clearStageTimers() {
        this.subtitleTimers.forEach(t => clearTimeout(t));
        this.subtitleTimers = [];
        
        if (this.letterTypingInterval) {
            clearInterval(this.letterTypingInterval);
            this.letterTypingInterval = null;
        }
        
        if (this.emotionTimeout) clearTimeout(this.emotionTimeout);
        if (this.thunderInterval) clearInterval(this.thunderInterval);
        
        this.bikeSFX.pause();
    }

    // ==========================================
    // 5. STAGE GRAPHICS & ANIMATIONS
    // ==========================================

    setupStageEnvironment(stageId) {
        this.particles.setMode('idle');
        
        switch (stageId) {
            case 'scene-letter':
                this.synth.setScale('major');
                this.typewriterLetter();
                break;
                
            case 'scene-gift':
                this.synth.setScale('major');
                this.setupGiftBox();
                break;
                
            case 'scene-emotion':
                this.synth.setScale('peace');
                this.runEmotionChanger();
                break;
                
            case 'scene-motivation':
                this.synth.setScale('major');
                this.runMotivationScene();
                break;
                
            case 'scene-story-boy':
                this.synth.setScale('minor');
                this.runStoryBoyScene();
                break;
                
            case 'scene-story-adult':
                this.synth.setScale('minor');
                this.particles.setMode('rain');
                this.runStoryAdultScene();
                break;
                
            case 'scene-story-success':
                this.synth.setScale('triumph');
                this.particles.setMode('sparkles');
                this.runStorySuccessScene();
                break;
                
            case 'scene-story-epilogue':
                this.synth.setScale('peace');
                this.runStoryEpilogueScene();
                break;
        }
    }

    /**
     * Stage 1: Letter typing
     */
    typewriterLetter() {
        document.getElementById('letter-title').innerText = `Dear ${this.visitorName}... ❤️`;
        const bodyTextEl = document.getElementById('letter-body-text');
        const closeBtn = document.getElementById('btn-close-letter');
        
        const personalizedLetter = TANGLISH_LETTER_TEMPLATE.replace(/{NAME}/g, this.visitorName);
        
        bodyTextEl.innerText = "";
        closeBtn.style.opacity = "0";
        closeBtn.style.pointerEvents = "none";
        
        let charIdx = 0;
        const speed = 25;
        
        this.letterTypingInterval = setInterval(() => {
            if (charIdx < personalizedLetter.length) {
                bodyTextEl.innerHTML += personalizedLetter.charAt(charIdx);
                charIdx++;
                
                const wrapper = document.querySelector('.letter-scroll-wrapper');
                wrapper.scrollTop = wrapper.scrollHeight;
            } else {
                clearInterval(this.letterTypingInterval);
                this.letterTypingInterval = null;
                
                gsap.to(closeBtn, {
                    opacity: 1,
                    pointerEvents: "auto",
                    duration: 0.6
                });
            }
        }, speed);
    }

    /**
     * Stage 2: Gift Box & Scattered Polaroids
     */
    setupGiftBox() {
        const gift = document.getElementById('target-gift-box');
        const cards = document.querySelectorAll('.polaroid-card');
        const proceedBtn = document.getElementById('btn-gift-proceed');
        
        // Reset states
        this.zoomedCard = null;
        this.unlockedCardsList.clear();
        proceedBtn.classList.add('hidden-btn');
        proceedBtn.classList.remove('visible-btn');
        
        gsap.set(gift, { opacity: 1, scale: 1, display: 'block' });
        gsap.set('.box-lid', { y: 0, rotationX: 0, opacity: 1 });
        gsap.set('.inner-glowing-light', { opacity: 0 });
        document.getElementById('card-backdrop').classList.remove('active');
        
        // Reset polaroids to hidden inside box
        cards.forEach(card => {
            card.classList.remove('active-reveal', 'zoomed');
            card.querySelector('.card-grey-screen').style.opacity = "1";
            card.querySelector('.card-grey-screen').style.visibility = "visible";
            
            gsap.set(card, {
                opacity: 0,
                scale: 0.2,
                x: 0,
                y: 0,
                rotation: 0
            });
        });

        // Set up click trigger on gift box
        const scatterFunction = () => {
            gift.removeEventListener('click', scatterFunction);
            this.scatterDreams(gift, cards, proceedBtn);
        };
        gift.addEventListener('click', scatterFunction);
    }

    scatterDreams(gift, cards, proceedBtn) {
        this.synth.playNote(261.63, 1.2, 'sine', 0.15); // C4
        this.synth.playNote(392.00, 1.5, 'triangle', 0.1); // G4
        
        gsap.to('.box-lid', {
            y: -180,
            rotationX: -140,
            opacity: 0,
            duration: 1.4,
            ease: "power2.out"
        });
        
        gsap.to('.inner-glowing-light', {
            opacity: 1,
            scale: 1.4,
            duration: 0.8
        });

        const W = window.innerWidth;
        const H = window.innerHeight;
        
        let desktopOffsets = [
            { x: -W * 0.28, y: -H * 0.23, rot: -10 }, // Top Left
            { x: 0,          y: -H * 0.26, rot: 3 },   // Top Center
            { x: W * 0.28,  y: -H * 0.23, rot: 12 },  // Top Right
            { x: -W * 0.28, y: H * 0.23,  rot: -6 },  // Bottom Left
            { x: 0,          y: H * 0.26,  rot: -2 },  // Bottom Center
            { x: W * 0.28,  y: H * 0.23,  rot: 8 }    // Bottom Right
        ];

        let mobileOffsets = [
            { x: -W * 0.22, y: -H * 0.24, rot: -8 },
            { x: W * 0.22,  y: -H * 0.24, rot: 5 },
            { x: -W * 0.22, y: -H * 0.04, rot: -4 },
            { x: W * 0.22,  y: -H * 0.04, rot: 8 },
            { x: -W * 0.22, y: H * 0.16,  rot: -12 },
            { x: W * 0.22,  y: H * 0.16,  rot: 4 }
        ];

        const coordinates = W > 768 ? desktopOffsets : mobileOffsets;

        cards.forEach((card, idx) => {
            card.classList.add('active-reveal');
            
            const targetPos = coordinates[idx];
            card.dataset.scatterX = targetPos.x;
            card.dataset.scatterY = targetPos.y;
            card.dataset.scatterRot = targetPos.rot;
            
            card.style.setProperty('--hover-dx', `${targetPos.x}px`);
            card.style.setProperty('--hover-dy', `${targetPos.y}px`);

            // Scatter Animation
            gsap.to(card, {
                opacity: 1,
                scale: 1,
                x: targetPos.x,
                y: targetPos.y,
                rotation: targetPos.rot,
                duration: 1.6,
                delay: 0.2 + (idx * 0.15),
                ease: "elastic.out(0.9, 0.65)"
            });

            // Smooth Hover Handling in GSAP to prevent CSS coordinate jumping glitches
            card.addEventListener('mouseenter', () => {
                if (this.zoomedCard === card || card.classList.contains('zoomed')) return;
                gsap.to(card, {
                    scale: 1.06,
                    rotation: 0,
                    duration: 0.35,
                    overwrite: "auto",
                    ease: "power2.out"
                });
            });

            card.addEventListener('mouseleave', () => {
                if (this.zoomedCard === card || card.classList.contains('zoomed')) return;
                gsap.to(card, {
                    scale: 1.0,
                    rotation: targetPos.rot,
                    duration: 0.35,
                    overwrite: "auto",
                    ease: "power2.out"
                });
            });

            // Card Click Event
            card.addEventListener('click', (e) => {
                if (e.target.classList.contains('btn-close-card')) return;
                this.zoomSingleCard(card, proceedBtn);
            });

            // Close button inside card
            card.querySelector('.btn-close-card').addEventListener('click', (e) => {
                e.stopPropagation(); 
                this.placeDownCard(card, proceedBtn);
            });
        });

        // Hide Box base
        gsap.to(gift, {
            opacity: 0,
            scale: 0.8,
            duration: 1.0,
            delay: 1.0,
            onComplete: () => {
                gift.style.display = 'none';
            }
        });
    }

    zoomSingleCard(card, proceedBtn) {
        if (this.zoomedCard) return; 
        
        this.zoomedCard = card;
        
        this.synth.playNote(523.25, 0.8, 'sine', 0.12);
        
        const greyScreen = card.querySelector('.card-grey-screen');
        gsap.to(greyScreen, {
            opacity: 0,
            duration: 0.4,
            onComplete: () => {
                greyScreen.style.visibility = "hidden";
            }
        });

        card.classList.add('zoomed');
        document.getElementById('card-backdrop').classList.add('active');

        const zoomScale = window.innerWidth > 768 ? 1.4 : 1.15;
        gsap.to(card, {
            x: 0,
            y: 0,
            scale: zoomScale,
            rotation: 0,
            duration: 0.6,
            ease: "power2.out"
        });
    }

    placeDownCard(card, proceedBtn) {
        if (this.zoomedCard !== card) return;
        
        const scatterX = parseFloat(card.dataset.scatterX);
        const scatterY = parseFloat(card.dataset.scatterY);
        const scatterRot = parseFloat(card.dataset.scatterRot);
        
        gsap.to(card, {
            x: scatterX,
            y: scatterY,
            scale: 1,
            rotation: scatterRot,
            duration: 0.6,
            ease: "power2.inOut",
            onComplete: () => {
                card.classList.remove('zoomed');
                this.zoomedCard = null;
                
                this.unlockedCardsList.add(card.id);
                
                if (this.unlockedCardsList.size >= 6) {
                    document.getElementById('btn-gift-proceed').classList.remove('hidden-btn');
                    document.getElementById('btn-gift-proceed').classList.add('visible-btn');
                }
            }
        });

        document.getElementById('card-backdrop').classList.remove('active');
    }

    /**
     * Stage 3: Emotion Changer
     */
    runEmotionChanger() {
        this.emotionTimeout = setTimeout(() => {
            this.nextStage();
        }, 6500);
    }

    /**
     * Stage 4: Motivation Card
     */
    runMotivationScene() {
        const pTag = document.querySelector('.motivation-text-tanglish');
        pTag.innerHTML = pTag.innerHTML.replace(/Rajesh/g, this.visitorName).replace(/Raj/g, this.visitorName);
        
        gsap.from('.motivation-box', {
            scale: 0.9,
            opacity: 0,
            duration: 1.2,
            ease: "back.out(1.5)"
        });
    }

    /**
     * Stage 5: Frustrated Cycle Boy
     */
    runStoryBoyScene() {
        const boy = document.getElementById('actor-boy-cycle');
        gsap.set(boy, { x: -250 });
        
        const bikeJiggle = gsap.to(boy, {
            y: "+=3",
            x: "+=1.5",
            duration: 0.08,
            repeat: -1,
            yoyo: true
        });

        gsap.to(boy, {
            x: window.innerWidth + 300,
            duration: 9.0,
            ease: "power1.inOut",
            onComplete: () => {
                bikeJiggle.kill();
                
                const blackCurtain = document.createElement('div');
                blackCurtain.style.position = 'fixed';
                blackCurtain.style.inset = '0';
                blackCurtain.style.backgroundColor = 'black';
                blackCurtain.style.zIndex = '999';
                blackCurtain.style.opacity = '0';
                document.body.appendChild(blackCurtain);
                
                gsap.to(blackCurtain, {
                    opacity: 1,
                    duration: 1.0,
                    onComplete: () => {
                        this.nextStage();
                        gsap.to(blackCurtain, {
                            opacity: 0,
                            duration: 1.0,
                            onComplete: () => blackCurtain.remove()
                        });
                    }
                });
            }
        });
    }

    /**
     * Stage 6: Adult Raj - Responsibilities & Dreams
     */
    runStoryAdultScene() {
        const adult = document.getElementById('actor-raj-heavy');
        const respWords = document.querySelectorAll('.resp-word');
        const bgDreams = document.querySelectorAll('.bg-dream');
        
        gsap.set(adult, { opacity: 0, filter: "grayscale(1) brightness(0.1)" });
        gsap.set(respWords, { opacity: 0, y: 30 });
        gsap.set(bgDreams, { opacity: 0, scale: 0.7, filter: "blur(5px) grayscale(0.5)" });

        this.triggerThunder();
        this.thunderInterval = setInterval(() => {
            if (this.currentStageIdx === 6 && !this.paused) {
                this.triggerThunder();
            } else {
                clearInterval(this.thunderInterval);
            }
        }, 5500);

        gsap.to(adult, {
            opacity: 1,
            filter: "grayscale(1) brightness(0.28)",
            duration: 3.0,
            ease: "power2.out",
            delay: 0.5
        });

        gsap.to(respWords, {
            opacity: 1,
            y: 0,
            duration: 1.2,
            stagger: 0.5,
            ease: "power2.out",
            delay: 1.5,
            onComplete: () => {
                respWords.forEach((word) => {
                    gsap.to(word, {
                        y: "+=10",
                        duration: gsap.utils.random(2.0, 3.5),
                        repeat: -1,
                        yoyo: true,
                        ease: "sine.inOut"
                    });
                });
            }
        });

        gsap.to(bgDreams, {
            opacity: 0.14,
            scale: 1,
            duration: 2.2,
            stagger: 0.4,
            ease: "sine.out",
            delay: 3.5,
            onComplete: () => {
                bgDreams.forEach(dream => {
                    gsap.to(dream, {
                        scale: 1.08,
                        opacity: 0.22,
                        duration: 3.5,
                        repeat: -1,
                        yoyo: true,
                        ease: "sine.inOut"
                    });
                });
            }
        });

        this.sceneTimeout = setTimeout(() => {
            this.nextStage();
        }, 13000);
    }

    triggerThunder() {
        const backdrop = document.getElementById('ambient-backdrop');
        const flash = gsap.timeline();
        
        if (this.synth.isPlaying && !this.synth.muted) {
            this.synth.playNote(50, 1.8, 'triangle', 0.2); 
        }
        
        flash.to(backdrop, {
            backgroundColor: "rgba(255, 255, 255, 0.3)",
            filter: "brightness(2) saturate(0.5)",
            duration: 0.07
        })
        .to(backdrop, {
            backgroundColor: "transparent",
            filter: "brightness(1) saturate(1)",
            duration: 0.12
        })
        .to(backdrop, {
            backgroundColor: "rgba(255, 255, 255, 0.15)",
            duration: 0.05
        })
        .to(backdrop, {
            backgroundColor: "transparent",
            duration: 0.25
        });
    }

    /**
     * Stage 7: Story - Scene 3 (Triumph)
     */
    runStorySuccessScene() {
        const actor = document.getElementById('actor-raj-triumph');
        const bubbles = document.querySelectorAll('.success-bubble');
        
        gsap.set(actor, { opacity: 0, scale: 0.95, filter: "grayscale(1) brightness(0.2)" });
        gsap.set(bubbles, { opacity: 0, scale: 0.5 });
        
        gsap.to(actor, {
            opacity: 1,
            scale: 1,
            filter: "grayscale(0) brightness(1.1) drop-shadow(0 0 25px rgba(255,215,0,0.35)) drop-shadow(0 15px 30px rgba(0,0,0,0.85))",
            duration: 2.5,
            ease: "power2.out"
        });

        this.bikeSFX.currentTime = 0;
        this.bikeSFX.volume = this.synth.muted ? 0 : 0.6;
        this.bikeSFX.play().catch(err => console.log("Bike sound blocked:", err));
        gsap.to(this.bikeSFX, { volume: 0, duration: 3.5, delay: 2.0, onComplete: () => this.bikeSFX.pause() });

        gsap.to(bubbles, {
            opacity: 1,
            scale: 1,
            duration: 1.2,
            stagger: 0.3,
            ease: "back.out(1.5)",
            delay: 1.2,
            onComplete: () => {
                bubbles.forEach((bubble, idx) => {
                    gsap.to(bubble, {
                        y: "+=12",
                        rotation: idx % 2 === 0 ? "+=2" : "-=2",
                        duration: gsap.utils.random(2.2, 3.8),
                        repeat: -1,
                        yoyo: true,
                        ease: "sine.inOut"
                    });
                });
            }
        });

        this.sceneTimeout = setTimeout(() => {
            this.nextStage();
        }, 9000);
    }

    /**
     * Stage 8: Story - Scene 4 (Epilogue Credits)
     * Animates Raj climbing the staircase of perseverance step-by-step.
     * At the top platform, reveals the golden trophy and confetti sparkles.
     */
    runStoryEpilogueScene() {
        const actor = document.getElementById('actor-staircase-raj-box');
        const trophy = document.getElementById('golden-trophy-hand');
        const steps = document.querySelectorAll('.stair-step');
        
        const l1 = document.querySelector('.epilogue-line.l1');
        const l2 = document.querySelector('.epilogue-line.l2');
        const l3 = document.querySelector('.epilogue-line.l3');
        const heart = document.querySelector('.pulsing-glow-heart');
        const replay = document.getElementById('btn-final-replay');
        
        // Reset states
        this.particles.setMode('idle');
        gsap.set([l1, l2, l3, heart, replay], { opacity: 0, y: 20 });
        heart.classList.remove('active-heart');
        if (trophy) trophy.classList.remove('active-trophy');
        steps.forEach(s => s.classList.remove('active-step'));
        
        // Position actor off-stairs initially
        const container = document.getElementById('perseverance-staircase');
        gsap.set(actor, {
            opacity: 0,
            scale: 0.8,
            left: 0,
            top: container.offsetHeight - 50
        });
        
        const mainTimeline = gsap.timeline();
        
        // Fade in Raj at start
        mainTimeline.to(actor, {
            opacity: 1,
            duration: 0.8,
            ease: "power2.out"
        }, 0.5);

        // Helper to schedule step hop
        const addStepHop = (stepIdx, delay) => {
            mainTimeline.add(() => {
                const targetStep = document.querySelector('.stair-step.step-' + stepIdx);
                const targetLeft = targetStep.offsetLeft + (targetStep.offsetWidth / 2) - (actor.offsetWidth / 2);
                const targetTop = targetStep.offsetTop - actor.offsetHeight + 10;
                
                // Play step note
                const frequencies = [130.81, 164.81, 196.00, 220.00, 261.63]; // C3, E3, G3, A3, C4
                this.synth.playNote(frequencies[stepIdx - 1], 0.7, 'triangle', 0.12);
                
                // Animate Hop
                const duration = 0.55;
                gsap.to(actor, { left: targetLeft, duration: duration, ease: "power1.inOut" });
                gsap.to(actor, { top: targetTop - 35, duration: duration * 0.45, ease: "power1.out" });
                gsap.to(actor, { top: targetTop, duration: duration * 0.55, ease: "power1.in", delay: duration * 0.45, onComplete: () => {
                    // Activate step glow
                    targetStep.classList.add('active-step');
                }});
                
                // Update subtitle tag
                const VirtueTexts = [
                    `${this.visitorName} consistency oda mudhal adi eduthu vekkiraar... 🔑`,
                    "Stress and tholvigalai patience oda thaandi aduthu adi... ⏳",
                    "Direction marama goal mela focus panni moonram adi... 🚗",
                    "Thookam tholaitha late nights, hard work oda naangam adi... 📈",
                    `Triumph! ${this.visitorName} consistency oda peak success-a hit pannitaar! 🏆✨`
                ];
                this.showSubtitle(VirtueTexts[stepIdx - 1]);
                setTimeout(() => this.hideSubtitle(), 1800);
                
            }, delay);
        };

        // Schedule step jumps
        addStepHop(1, "+=0.8");
        addStepHop(2, "+=1.8");
        addStepHop(3, "+=1.8");
        addStepHop(4, "+=1.8");
        addStepHop(5, "+=1.8");

        // Climax: Trophy & Confetti Sparks
        mainTimeline.add(() => {
            // Activate sparkles overlay
            this.particles.setMode('sparkles');
            
            // Activate golden trophy
            if (trophy) trophy.classList.add('active-trophy');
            
            // Play big triumphant chord
            this.synth.playChord([261.63, 329.63, 392.00, 523.25], 3.5); // C major chord
        }, "+=2.4");

        // FADE OUT STAIRCASE & FADE IN CREDITS CONTAINER SEQUENTIALLY
        mainTimeline.to('#perseverance-staircase', {
            opacity: 0,
            duration: 1.2,
            ease: "power2.inOut"
        }, "+=2.5")
        .to('.epilogue-credits', {
            opacity: 1,
            pointerEvents: "auto",
            duration: 0.8,
            ease: "power2.out"
        })

        // Credits reveal in the center
        .to(l1, {
            opacity: 1,
            y: 0,
            duration: 1.5,
            ease: "power2.out"
        })
        .to(l2, {
            opacity: 1,
            y: 0,
            duration: 1.5,
            ease: "power2.out"
        }, "+=0.8")
        .to(l3, {
            opacity: 1,
            y: 0,
            duration: 1.8,
            ease: "power2.out"
        }, "+=0.8")
        .to(heart, {
            opacity: 1,
            scale: 1,
            duration: 1.2,
            ease: "back.out(1.8)",
            onStart: () => {
                heart.classList.add('active-heart');
            }
        }, "-=0.2")
        .to(replay, {
            opacity: 1,
            y: 0,
            duration: 1.0,
            ease: "power2.out"
        }, "+=0.8");
    }

    replayJourney() {
        this.paused = false;
        this.hudPlayPause.querySelector('i').className = 'fa-solid fa-pause';
        
        // Clean up staircase classes
        const trophy = document.getElementById('golden-trophy-hand');
        const steps = document.querySelectorAll('.stair-step');
        if (trophy) trophy.classList.remove('active-trophy');
        steps.forEach(s => s.classList.remove('active-step'));
        
        // Reset element visibilities for replay
        gsap.set('#perseverance-staircase', { opacity: 1 });
        gsap.set('.epilogue-credits', { opacity: 0, pointerEvents: "none" });
        
        this.transitionToStage(1); 
    }

    // ==========================================
    // 6. NARRATIVE SUBTITLES CONTROL
    // ==========================================

    runSubtitles(stageId) {
        const subs = NARRATIVE_SUBTITLES_TANGLISH[stageId];
        if (!subs || subs.length === 0) return;
        
        subs.forEach(sub => {
            const timer = setTimeout(() => {
                const processed = sub.text.replace(/{NAME}/g, this.visitorName);
                this.showSubtitle(processed);
                
                this.subtitleTimers.push(setTimeout(() => {
                    this.hideSubtitle();
                }, 3000));
            }, sub.time);
            this.subtitleTimers.push(timer);
        });
    }

    showSubtitle(text) {
        this.subtitleText.innerText = text;
        this.subtitleText.classList.add('active');
    }

    hideSubtitle() {
        this.subtitleText.classList.remove('active');
    }

    // ==========================================
    // 7. PLAYBACK STATE MANAGEMENTS
    // ==========================================

    togglePlayback() {
        this.paused = !this.paused;
        if (this.paused) {
            gsap.globalTimeline.pause();
            this.hudPlayPause.querySelector('i').className = 'fa-solid fa-play';
            this.hudPlayPause.setAttribute('title', 'Resume');
            
            if (this.synth.useUploadedMusic) {
                this.synth.bgMusic.pause();
            } else {
                this.synth.fadeToVolume(0.0001, 0.4);
            }
            this.clearStageTimers();
        } else {
            gsap.globalTimeline.play();
            this.hudPlayPause.querySelector('i').className = 'fa-solid fa-pause';
            this.hudPlayPause.setAttribute('title', 'Pause');
            
            if (this.synth.useUploadedMusic) {
                this.synth.bgMusic.play().catch(err => console.log("BGM play error:", err));
            } else {
                if (!this.synth.muted) {
                    this.synth.fadeToVolume(this.synth.volumeLevel, 0.6);
                }
            }
            
            const stageId = STAGE_FLOW[this.currentStageIdx].id;
            if (stageId === 'scene-story-adult') {
                this.sceneTimeout = setTimeout(() => this.nextStage(), 7000); 
            } else if (stageId === 'scene-story-success') {
                this.sceneTimeout = setTimeout(() => this.nextStage(), 5000);
            }
        }
    }

    toggleAudio() {
        const isMuted = !this.synth.muted;
        this.synth.setMute(isMuted);
        
        if (isMuted) {
            this.hudAudioToggle.classList.remove('sound-playing');
            this.hudAudioToggle.querySelector('i').className = 'fa-solid fa-volume-xmark';
            this.hudAudioToggle.setAttribute('title', 'Unmute');
        } else {
            this.hudAudioToggle.classList.add('sound-playing');
            this.hudAudioToggle.querySelector('i').className = 'fa-solid fa-volume-high';
            this.hudAudioToggle.setAttribute('title', 'Mute');
            if (this.synth.ctx && this.synth.ctx.state === 'suspended') {
                this.synth.ctx.resume();
            }
        }
    }
}

// ==========================================
// 8. INITIALIZE ENGINE
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    window.Director = new CinematicDirector();
});
