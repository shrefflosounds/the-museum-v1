/**
 * THE MUSEUM — FOUR-STORY FORBES LIBRARY & MUSEUM EDITION
 * Photorealistic multi-floor architectural layout based on the Forbes Library floorplan,
 * featuring 4 interconnected floors, dual 4-story U-stairwells, 136 curated gallery artworks,
 * realistic Web Audio synthesis, and a multi-floor graph-navigating Stalker AI.
 */

(() => {
  'use strict';

  // --- EDITABLE GAME TEXT (loaded from GAME_TEXT.txt by text_loader.js) ---
  const T = (window.GameText && window.GameText.t) || ((key, fallback, vars) => {
    let s = fallback;
    if (vars) s = s.replace(/\{(\w+)\}/g, (m, n) => (n in vars ? vars[n] : m));
    return s;
  });

  // --- REALISTIC PROCEDURAL HORROR AUDIO ENGINE ---
  class MuseumAudioEngine {
    constructor() {
      this.ctx = null;
      this.initialized = false;
      this.noiseBuffer = null;
      this.reverbNode = null;
      this.masterGain = null;
      this.heartbeatTimer = 0;
      this.currentBpm = 45;
      this.stepToggle = false;
      this.customBuffers = {};
      this.activeMonsterSources = [];
    }

    init() {
      if (this.initialized) {
        if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
        return;
      }
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;

      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 1.36; // Boosted by +60% (from 0.85)

      // Dynamics compressor prevents digital clipping at +60% volume across overlapping tracks
      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.setValueAtTime(-4, this.ctx.currentTime);
      this.compressor.knee.setValueAtTime(12, this.ctx.currentTime);
      this.compressor.ratio.setValueAtTime(8, this.ctx.currentTime);
      this.compressor.attack.setValueAtTime(0.003, this.ctx.currentTime);
      this.compressor.release.setValueAtTime(0.15, this.ctx.currentTime);
      this.masterGain.connect(this.compressor);
      this.compressor.connect(this.ctx.destination);

      this.createNoiseBuffer();
      this.createMuseumReverb();
      this.startRoomTone();
      this.startHeartbeatLoop();
      this.loadCustomAudio();
      this.initialized = true;
    }

    async loadCustomAudio() {
      const files = [
        'player_footstep.wav', 'smitty_footstep.wav', 'weapon_shot.wav',
        'weapon_empty_click.wav', 'weapon_reload.wav', 'flashlight_click.wav',
        'relic_chime.wav', 'lockdown_disengaged.wav', 'smitty_growl.wav',
        'jumpscare_stinger.wav', 'heartbeat_pulse.wav', 'room_tone_ambience.wav'
      ];
      const audioVer = window._ASSET_VERSION || Date.now();
      for (const name of files) {
        try {
          const res = await fetch(`assets/audio/${name}?v=${audioVer}`);
          if (res.ok) {
            const ab = await res.arrayBuffer();
            this.ctx.decodeAudioData(ab, (buf) => {
              this.customBuffers[name] = buf;
              if (name === 'room_tone_ambience.wav') {
                this.startRoomTone();
              }
            }, () => {});
          }
        } catch (e) {}
      }
    }

    playCustom(name, fallbackFn, vol = 1.6, rate = 1.0) {
      if (this.customBuffers[name]) {
        try {
          const src = this.ctx.createBufferSource();
          src.buffer = this.customBuffers[name];
          if (rate !== 1.0) {
            src.playbackRate.setValueAtTime(rate, this.ctx.currentTime);
          }
          const g = this.ctx.createGain();
          g.gain.value = vol;
          src.connect(g);
          g.connect(this.masterGain);
          src.start();
          return src;
        } catch (e) {}
      }
      if (fallbackFn) fallbackFn();
      return null;
    }

    createNoiseBuffer() {
      const sr = this.ctx.sampleRate;
      const len = sr * 2.0;
      this.noiseBuffer = this.ctx.createBuffer(1, len, sr);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) {
        data[i] = Math.random() * 2 - 1;
      }
    }

    createMuseumReverb() {
      const sr = this.ctx.sampleRate;
      const duration = 2.0;
      const len = Math.floor(sr * duration);
      const impulse = this.ctx.createBuffer(2, len, sr);

      for (let c = 0; c < 2; c++) {
        const ch = impulse.getChannelData(c);
        for (let i = 0; i < len; i++) {
          const t = i / sr;
          const env = Math.exp(-t * 2.8);
          ch[i] = (Math.random() * 2 - 1) * env * 0.28;
        }
      }

      this.reverbNode = this.ctx.createConvolver();
      this.reverbNode.buffer = impulse;

      const reverbGain = this.ctx.createGain();
      reverbGain.gain.value = 0.32;
      this.reverbNode.connect(reverbGain);
      reverbGain.connect(this.masterGain);
    }

    startRoomTone() {
      if (!this.ctx) return;
      if (this.customBuffers && this.customBuffers['room_tone_ambience.wav']) {
        if (this.roomToneSource) {
          try { this.roomToneSource.stop(); } catch (e) {}
        }
        const src = this.ctx.createBufferSource();
        src.buffer = this.customBuffers['room_tone_ambience.wav'];
        src.loop = true;
        const gain = this.ctx.createGain();
        gain.gain.value = 0.56; // Boosted by +60% (from 0.35)
        src.connect(gain);
        gain.connect(this.masterGain);
        src.start();
        this.roomToneSource = src;
        return;
      }
      if (!this.noiseBuffer) return;

      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      src.loop = true;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 68;

      const gain = this.ctx.createGain();
      gain.gain.value = 0.18; // Boosted by +60% (from 0.11)

      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);
      src.start();
      this.roomToneSource = src;
    }

    startHeartbeatLoop() {
      const beat = () => {
        if (this.initialized && this.ctx && this.ctx.state === 'running') {
          if (this.currentBpm > 65) {
            const intensity = Math.min(1.0, (this.currentBpm - 60) / 110);
            this.triggerThump(0, 52, 0.42 * intensity);
            this.triggerThump(0.14, 44, 0.26 * intensity);
          }
        }
        const intervalMs = (60 / Math.max(40, this.currentBpm)) * 1000;
        this.heartbeatTimer = setTimeout(beat, intervalMs);
      };
      beat();
    }

    triggerThump(delay, freq, vol) {
      if (!this.ctx) return;
      const now = this.ctx.currentTime + delay;

      if (this.customBuffers && this.customBuffers['heartbeat_pulse.wav']) {
        try {
          const src = this.ctx.createBufferSource();
          src.buffer = this.customBuffers['heartbeat_pulse.wav'];
          const g = this.ctx.createGain();
          g.gain.setValueAtTime(vol * 2.56, now); // Boosted by +60%
          src.connect(g);
          g.connect(this.masterGain);
          src.start(now);
          return;
        } catch (e) {}
      }

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(22, now + 0.12);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(vol * 1.6, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.15);
    }

    setHeartbeatBpm(bpm) {
      this.currentBpm = bpm;
    }

    stopLingeringMonsterAudio() {
      this.setHeartbeatBpm(45);
      if (this.activeMonsterSources && this.activeMonsterSources.length > 0) {
        for (const s of this.activeMonsterSources) {
          try {
            s.stop();
          } catch (e) {}
        }
        this.activeMonsterSources = [];
      }
    }

    playMarbleFootstep() {
      if (!this.ctx) return;
      if (this.playCustom('player_footstep.wav', null, 0.72)) return; // Boosted by +60% (from 0.45)
      const now = this.ctx.currentTime;
      this.stepToggle = !this.stepToggle;

      // Soft, click-free low-frequency muffled step (smooth attack ramp prevents any speaker click)
      const heelOsc = this.ctx.createOscillator();
      const heelGain = this.ctx.createGain();
      heelOsc.type = 'sine';
      const baseFreq = this.stepToggle ? 64 : 58;
      heelOsc.frequency.setValueAtTime(baseFreq, now);
      heelOsc.frequency.exponentialRampToValueAtTime(24, now + 0.09);

      heelGain.gain.setValueAtTime(0.0001, now);
      heelGain.gain.linearRampToValueAtTime(0.045, now + 0.018); // Boosted by +60%
      heelGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.095);

      heelOsc.connect(heelGain);
      heelGain.connect(this.masterGain);
      heelOsc.start(now);
      heelOsc.stop(now + 0.10);
    }

    playSmittyFootstep(distance) {
      if (!this.ctx || distance > 38) return;
      const atten = Math.max(0, 1 - distance / 38);
      const vol = atten * atten * 1.12; // Boosted by +60% (from 0.70)
      if (this.playCustom('smitty_footstep.wav', null, vol)) return;
      if (!this.noiseBuffer) return;
      const now = this.ctx.currentTime;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(68, now);
      osc.frequency.exponentialRampToValueAtTime(22, now + 0.14);

      gain.gain.setValueAtTime(vol, now);
      gain.gain.exponentialRampToValueAtTime(0.0005, now + 0.15);

      osc.connect(gain);
      gain.connect(this.masterGain);
      if (this.reverbNode) gain.connect(this.reverbNode);
      osc.start(now);
      osc.stop(now + 0.16);
    }

    playPistolShot() {
      if (!this.ctx) return;
      if (this.playCustom('weapon_shot.wav', null, 1.44)) return; // Boosted by +60% (from 0.9)
      if (!this.noiseBuffer) return;
      const now = this.ctx.currentTime;

      const punchOsc = this.ctx.createOscillator();
      const punchGain = this.ctx.createGain();
      punchOsc.type = 'sine';
      punchOsc.frequency.setValueAtTime(190, now);
      punchOsc.frequency.exponentialRampToValueAtTime(36, now + 0.09);

      punchGain.gain.setValueAtTime(1.04, now); // Boosted by +60% (from 0.65)
      punchGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

      punchOsc.connect(punchGain);
      punchGain.connect(this.masterGain);
      punchOsc.start(now);
      punchOsc.stop(now + 0.11);

      const crackSrc = this.ctx.createBufferSource();
      crackSrc.buffer = this.noiseBuffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(4200, now);
      filter.frequency.exponentialRampToValueAtTime(420, now + 0.26);

      const crackGain = this.ctx.createGain();
      crackGain.gain.setValueAtTime(0.88, now); // Boosted by +60% (from 0.55)
      crackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

      crackSrc.connect(filter);
      filter.connect(crackGain);
      crackGain.connect(this.masterGain);
      if (this.reverbNode) crackGain.connect(this.reverbNode);

      crackSrc.start(now, 0, 0.3);
    }

    playEmptyClick() {
      if (!this.ctx) return;
      if (this.playCustom('weapon_empty_click.wav', null, 0.80)) return; // Boosted by +60% (from 0.5)
      if (!this.noiseBuffer) return;
      const now = this.ctx.currentTime;
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;

      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 3400;
      bp.Q.value = 6.0;

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.29, now); // Boosted by +60% (from 0.18)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.02);

      src.connect(bp);
      bp.connect(gain);
      gain.connect(this.masterGain);
      src.start(now, 0.2, 0.025);
    }

    playReloadSound() {
      if (!this.ctx) return;
      if (this.playCustom('weapon_reload.wav', null, 0.96)) return; // Boosted by +60% (from 0.6)
      if (!this.noiseBuffer) return;
      const triggerSlide = (delay, freq) => {
        const now = this.ctx.currentTime + delay;
        const src = this.ctx.createBufferSource();
        src.buffer = this.noiseBuffer;

        const bp = this.ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = freq;
        bp.Q.value = 4.5;

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.29, now); // Boosted by +60% (from 0.18)
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

        src.connect(bp);
        bp.connect(gain);
        gain.connect(this.masterGain);
        src.start(now, Math.random(), 0.07);
      };
      triggerSlide(0.05, 1400);
      triggerSlide(0.45, 1950);
      triggerSlide(0.75, 2600);
    }

    playFlashlightClick() {
      if (!this.ctx) return;
      if (this.playCustom('flashlight_click.wav', null, 0.80)) return; // Boosted by +60% (from 0.5)
      this.playEmptyClick();
    }

    playRelicChime() {
      if (!this.ctx) return;
      if (this.playCustom('relic_chime.wav', null, 1.20)) return; // Boosted by +60% (from 0.75)
      const now = this.ctx.currentTime;
      const freqs = [528, 792];
      freqs.forEach((f) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f, now);

        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.18, now + 0.02); // Boosted by +60% (from 0.11)
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.4);

        osc.connect(gain);
        gain.connect(this.masterGain);
        if (this.reverbNode) gain.connect(this.reverbNode);
        osc.start(now);
        osc.stop(now + 1.45);
      });
    }

    playLockdownDisengaged() {
      if (!this.ctx) return;
      if (this.playCustom('lockdown_disengaged.wav', null, 1.36)) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.linearRampToValueAtTime(110, now + 0.6);

      gain.gain.setValueAtTime(0.40, now); // Boosted by +60% (from 0.25)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.95);

      osc.connect(gain);
      gain.connect(this.masterGain);
      if (this.reverbNode) gain.connect(this.reverbNode);
      osc.start(now);
      osc.stop(now + 1.0);
    }

    playSmittyGrowl() {
      if (!this.ctx) return;
      const customSrc = this.playCustom('smitty_growl.wav', null, 1.20);
      if (customSrc) {
        this.activeMonsterSources.push(customSrc);
        customSrc.onended = () => {
          this.activeMonsterSources = this.activeMonsterSources.filter(s => s !== customSrc);
        };
        return;
      }
      if (!this.noiseBuffer) return;
      const now = this.ctx.currentTime;

      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(160, now);
      filter.frequency.exponentialRampToValueAtTime(75, now + 0.65);
      filter.Q.value = 3.5;

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.45, now + 0.08); // Boosted by +60% (from 0.28)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);

      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);
      if (this.reverbNode) gain.connect(this.reverbNode);
      src.start(now, 0, 0.75);
    }

    playJumpscareStinger() {
      if (!this.ctx) return;
      const customSrc = this.playCustom('jumpscare_stinger.wav', null, 1.52);
      if (customSrc) {
        this.activeMonsterSources.push(customSrc);
        customSrc.onended = () => {
          this.activeMonsterSources = this.activeMonsterSources.filter(s => s !== customSrc);
        };
        return;
      }
      if (!this.noiseBuffer) return;
      const now = this.ctx.currentTime;

      const sub = this.ctx.createOscillator();
      const subGain = this.ctx.createGain();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(95, now);
      sub.frequency.exponentialRampToValueAtTime(28, now + 0.9);

      subGain.gain.setValueAtTime(0.88, now); // Boosted by +60% (from 0.55)
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.95);

      sub.connect(subGain);
      subGain.connect(this.masterGain);
      sub.start(now);
      sub.stop(now + 1.0);

      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;

      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(420, now);
      bp.frequency.exponentialRampToValueAtTime(140, now + 0.8);
      bp.Q.value = 2.0;

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.56, now); // Boosted by +60% (from 0.35)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.85);

      src.connect(bp);
      bp.connect(gain);
      gain.connect(this.masterGain);
      if (this.reverbNode) gain.connect(this.reverbNode);
      src.start(now, 0, 0.9);
    }
  }

  // --- PHOTOREALISTIC TEXTURE LOADER & PLAQUE GENERATOR ---
  class TextureFactory {
    static loadPhotorealTexture(loader, path, repeatX, repeatY, fallbackColor = 0xffffff) {
      const tex = loader.load(path, (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.wrapS = THREE.RepeatWrapping;
        t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(repeatX, repeatY);
        t.needsUpdate = true;
      });
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(repeatX, repeatY);
      return new THREE.MeshPhongMaterial({
        map: tex,
        color: fallbackColor,
        shininess: 6,
        specular: 0x0a0a0a
      });
    }

    static createSignageTexture(title, subtitle = '') {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 128;
      const ctx = canvas.getContext('2d');

      ctx.fillStyle = '#18130d';
      ctx.fillRect(0, 0, 512, 128);

      ctx.strokeStyle = '#c5a059';
      ctx.lineWidth = 5;
      ctx.strokeRect(6, 6, 500, 116);

      ctx.fillStyle = '#e8d09c';
      ctx.font = 'bold 28px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(title.toUpperCase(), 256, subtitle ? 48 : 64);

      if (subtitle) {
        ctx.fillStyle = '#b4975a';
        ctx.font = '18px sans-serif';
        ctx.fillText(subtitle.toUpperCase(), 256, 86);
      }

      return new THREE.CanvasTexture(canvas);
    }

    static createPlaqueTexture(title = 'EXHIBIT') {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');

      ctx.fillStyle = '#b4975a';
      ctx.fillRect(0, 0, 256, 64);

      ctx.strokeStyle = '#7c6534';
      ctx.lineWidth = 3;
      ctx.strokeRect(3, 3, 250, 58);

      ctx.fillStyle = '#1a1409';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const clean = title.length > 24 ? title.substring(0, 22) + '...' : title;
      ctx.fillText(clean.toUpperCase(), 128, 25);

      ctx.font = '10px sans-serif';
      ctx.fillStyle = '#3a2e15';
      ctx.fillText(T('plaque.subtitle', 'SHREFFLO MUSEUM ARCHIVE'), 128, 44);

      return new THREE.CanvasTexture(canvas);
    }
  }

  // --- CONFIGURATION ---
  const CONFIG = {
    TOTAL_RELICS: 13,
    FLOOR_HEIGHT: 5.2,
    NUM_FLOORS: 4,
    AMMO_PICKUP: {
      RESPAWN_TIME: 180.0, // 3 minutes respawn timer
      AMMO_AMOUNT: 24
    },
    PLAYER: {
      WALK_SPEED: 5.0,
      SPRINT_SPEED: 8.6,
      CROUCH_SPEED: 2.4,
      CAMERA_HEIGHT: 1.72,
      CROUCH_HEIGHT: 0.95,
      JUMP_FORCE: 5.4,
      GRAVITY: 16.0,
      RADIUS: 0.36,
      MOUSE_SENS: 0.0024,
      MAX_HEALTH: 100,
      MAX_STAMINA: 100
    },
    WEAPON: {
      MAG_CAPACITY: 12,
      RESERVE_AMMO: 36,
      FIRE_RATE: 0.22,
      DAMAGE: 35
    },
    SMITTY: {
      PATROL_SPEED: 2.1,
      SEARCH_SPEED: 3.4,
      STALK_SPEED: 4.2,
      CHASE_SPEED: 7.2,
      DETECT_RANGE: 29.2, // Lowered by 27% (from 40)
      FOV_DEGREES: 125,
      ATTACK_RANGE: 2.1,
      ATTACK_DAMAGE: 30,
      ATTACK_COOLDOWN: 1.2,
      MAX_HP: 100
    }
  };

  const CURATED_ARTWORKS = [
  {
    "id": 1,
    "x": -35.65,
    "y": 2.35,
    "z": -2.0,
    "rotY": 1.5708,
    "w": 2.024,
    "h": 2.15,
    "wing": "1ST FLOOR \u2022 WEST EXHIBITION HALL",
    "title": "Smitty Silly",
    "file": "assets/gallery/001_Smitty-silly.gif"
  },
  {
    "id": 2,
    "x": -35.65,
    "y": 2.35,
    "z": 3.0,
    "rotY": 1.5708,
    "w": 2.15,
    "h": 2.15,
    "wing": "1ST FLOOR \u2022 WEST EXHIBITION HALL",
    "title": "Emoji Movie",
    "file": "assets/gallery/002_Emoji-movie.jpg"
  },
  {
    "id": 3,
    "x": -35.65,
    "y": 2.35,
    "z": 8.0,
    "rotY": 1.5708,
    "w": 2.15,
    "h": 1.391,
    "wing": "1ST FLOOR \u2022 WEST EXHIBITION HALL",
    "title": "Pinkthing",
    "file": "assets/gallery/003_pinkthing.jpg"
  },
  {
    "id": 4,
    "x": -35.65,
    "y": 2.35,
    "z": 13.0,
    "rotY": 1.5708,
    "w": 2.15,
    "h": 1.613,
    "wing": "1ST FLOOR \u2022 WEST EXHIBITION HALL",
    "title": "Iwanttolivebythesea",
    "file": "assets/gallery/004_iwanttolivebythesea.jpg"
  },
  {
    "id": 5,
    "x": -32.0,
    "y": 2.35,
    "z": -5.65,
    "rotY": 0.0,
    "w": 2.15,
    "h": 2.15,
    "wing": "1ST FLOOR \u2022 WEST EXHIBITION HALL",
    "title": "Frenchhouse",
    "file": "assets/gallery/005_frenchhouse.jpg"
  },
  {
    "id": 6,
    "x": -20.0,
    "y": 2.35,
    "z": -5.65,
    "rotY": 0.0,
    "w": 2.15,
    "h": 1.392,
    "wing": "1ST FLOOR \u2022 WEST EXHIBITION HALL",
    "title": "Curator S Assets",
    "file": "assets/gallery/006_Curator_s_Assets.png"
  },
  {
    "id": 7,
    "x": -16.35,
    "y": 2.35,
    "z": 2.0,
    "rotY": -1.5708,
    "w": 1.683,
    "h": 2.15,
    "wing": "1ST FLOOR \u2022 WEST EXHIBITION HALL",
    "title": "Painting Grey Face",
    "file": "assets/gallery/007_painting-grey-face.jpg"
  },
  {
    "id": 8,
    "x": -16.35,
    "y": 2.35,
    "z": 10.0,
    "rotY": -1.5708,
    "w": 2.15,
    "h": 1.609,
    "wing": "1ST FLOOR \u2022 WEST EXHIBITION HALL",
    "title": "Smitty Wild Animal Framed",
    "file": "assets/gallery/008_Smitty-wild-animal-framed.jpg"
  },
  {
    "id": 9,
    "x": -12.5,
    "y": 2.35,
    "z": -17.65,
    "rotY": 0.0,
    "w": 2.15,
    "h": 1.613,
    "wing": "1ST FLOOR \u2022 NORTH GALLERY ALCOVE",
    "title": "Leadership Lemon",
    "file": "assets/gallery/009_leadership-lemon.jpg"
  },
  {
    "id": 10,
    "x": -7.5,
    "y": 2.35,
    "z": -17.65,
    "rotY": 0.0,
    "w": 2.15,
    "h": 2.15,
    "wing": "1ST FLOOR \u2022 NORTH GALLERY ALCOVE",
    "title": "Star Ez Duz It",
    "file": "assets/gallery/010_star-ez-duz-it.jpg"
  },
  {
    "id": 11,
    "x": -15.65,
    "y": 2.35,
    "z": -12.0,
    "rotY": 1.5708,
    "w": 2.15,
    "h": 2.15,
    "wing": "1ST FLOOR \u2022 NORTH GALLERY ALCOVE",
    "title": "Smitty Cola Melt Shirtless",
    "file": "assets/gallery/011_smitty-cola-melt-shirtless.jpg"
  },
  {
    "id": 12,
    "x": -15.65,
    "y": 2.35,
    "z": 2.0,
    "rotY": 1.5708,
    "w": 2.15,
    "h": 1.433,
    "wing": "1ST FLOOR \u2022 HOSMER GALLERY",
    "title": "Shocksites",
    "file": "assets/gallery/012_shocksites.jpg"
  },
  {
    "id": 13,
    "x": -15.65,
    "y": 2.35,
    "z": 10.0,
    "rotY": 1.5708,
    "w": 1.661,
    "h": 2.15,
    "wing": "1ST FLOOR \u2022 HOSMER GALLERY",
    "title": "Gemini",
    "file": "assets/gallery/013_gemini.jpg"
  },
  {
    "id": 14,
    "x": -15.65,
    "y": 2.35,
    "z": -7.0,
    "rotY": 1.5708,
    "w": 2.15,
    "h": 1.613,
    "wing": "1ST FLOOR \u2022 HOSMER GALLERY",
    "title": "Smitty Dirt",
    "file": "assets/gallery/014_smitty-dirt.jpg"
  },
  {
    "id": 15,
    "x": -4.35,
    "y": 2.35,
    "z": -2.0,
    "rotY": -1.5708,
    "w": 2.15,
    "h": 2.15,
    "wing": "1ST FLOOR \u2022 HOSMER GALLERY",
    "title": "E9E",
    "file": "assets/gallery/015_E9e.jpg"
  },
  {
    "id": 16,
    "x": -4.35,
    "y": 2.35,
    "z": 13.0,
    "rotY": -1.5708,
    "w": 2.15,
    "h": 2.15,
    "wing": "1ST FLOOR \u2022 HOSMER GALLERY",
    "title": "Bathbomb",
    "file": "assets/gallery/016_bathbomb.jpg"
  },
  {
    "id": 17,
    "x": 1.0,
    "y": 2.35,
    "z": -39.65,
    "rotY": 0.0,
    "w": 2.15,
    "h": 1.391,
    "wing": "1ST FLOOR \u2022 HAMPSHIRE ROOM",
    "title": "Crate Challenge",
    "file": "assets/gallery/017_crate-challenge.jpg"
  },
  {
    "id": 18,
    "x": 23.0,
    "y": 2.35,
    "z": -39.65,
    "rotY": 0.0,
    "w": 1.437,
    "h": 2.15,
    "wing": "1ST FLOOR \u2022 HAMPSHIRE ROOM",
    "title": "Elderly Portrait",
    "file": "assets/gallery/018_elderly-portrait.jpg"
  },
  {
    "id": 19,
    "x": 9.5,
    "y": 2.35,
    "z": -41.65,
    "rotY": 0.0,
    "w": 2.15,
    "h": 1.252,
    "wing": "1ST FLOOR \u2022 HAMPSHIRE ROOM",
    "title": "Astonishment",
    "file": "assets/gallery/019_astonishment.jpg"
  },
  {
    "id": 20,
    "x": 14.5,
    "y": 2.35,
    "z": -41.65,
    "rotY": 0.0,
    "w": 2.15,
    "h": 2.141,
    "wing": "1ST FLOOR \u2022 HAMPSHIRE ROOM",
    "title": "Sf Astonishment Ad",
    "file": "assets/gallery/020_sf-astonishment-ad.jpg"
  },
  {
    "id": 21,
    "x": -3.65,
    "y": 2.35,
    "z": -33.0,
    "rotY": 1.5708,
    "w": 2.15,
    "h": 1.209,
    "wing": "1ST FLOOR \u2022 HAMPSHIRE ROOM",
    "title": "Heknah Wallpaper As",
    "file": "assets/gallery/021_heknah-wallpaper-AS.jpg"
  },
  {
    "id": 22,
    "x": 27.65,
    "y": 2.35,
    "z": -33.0,
    "rotY": -1.5708,
    "w": 2.15,
    "h": 1.641,
    "wing": "1ST FLOOR \u2022 HAMPSHIRE ROOM",
    "title": "Spongeclownbob",
    "file": "assets/gallery/022_spongeclownbob.jpg"
  },
  {
    "id": 23,
    "x": 11.0,
    "y": 2.35,
    "z": -26.35,
    "rotY": 3.1416,
    "w": 2.15,
    "h": 1.391,
    "wing": "1ST FLOOR \u2022 HAMPSHIRE ROOM",
    "title": "Smittys Room Toon",
    "file": "assets/gallery/023_smittys-room-toon.jpg"
  },
  {
    "id": 24,
    "x": 11.0,
    "y": 2.35,
    "z": -25.65,
    "rotY": 0.0,
    "w": 2.15,
    "h": 1.39,
    "wing": "1ST FLOOR \u2022 ARTS & MUSIC HALL",
    "title": "Smittys Room Live Action",
    "file": "assets/gallery/024_smittys-room-live-action.jpg"
  },
  {
    "id": 25,
    "x": 24.5,
    "y": 2.35,
    "z": -25.65,
    "rotY": 0.0,
    "w": 2.053,
    "h": 2.15,
    "wing": "1ST FLOOR \u2022 ARTS & MUSIC HALL",
    "title": "Pinocchio",
    "file": "assets/gallery/025_pinocchio.jpg"
  },
  {
    "id": 26,
    "x": 32.65,
    "y": 2.35,
    "z": -18.0,
    "rotY": -1.5708,
    "w": 1.661,
    "h": 2.15,
    "wing": "1ST FLOOR \u2022 EAST BAY ALCOVE",
    "title": "Shawtys Mix",
    "file": "assets/gallery/026_shawtys-mix.jpg"
  },
  {
    "id": 27,
    "x": 32.65,
    "y": 2.35,
    "z": -4.0,
    "rotY": -1.5708,
    "w": 2.15,
    "h": 1.47,
    "wing": "1ST FLOOR \u2022 EAST BAY ALCOVE",
    "title": "2008 Red Fox",
    "file": "assets/gallery/027_2008-red-fox.jpg"
  },
  {
    "id": 28,
    "x": 27.65,
    "y": 2.35,
    "z": -11.0,
    "rotY": -1.5708,
    "w": 2.15,
    "h": 2.135,
    "wing": "1ST FLOOR \u2022 ARTS & MUSIC HALL",
    "title": "Rip Odi",
    "file": "assets/gallery/028_rip-odi.jpg"
  },
  {
    "id": 29,
    "x": 27.65,
    "y": 2.35,
    "z": 4.0,
    "rotY": -1.5708,
    "w": 2.15,
    "h": 1.727,
    "wing": "1ST FLOOR \u2022 ARTS & MUSIC HALL",
    "title": "Shrefflo Smittyfantastic",
    "file": "assets/gallery/029_Shrefflo-SmittyFantastic.jpg"
  },
  {
    "id": 30,
    "x": -33.65,
    "y": 2.35,
    "z": 23.0,
    "rotY": 1.5708,
    "w": 2.15,
    "h": 1.474,
    "wing": "1ST FLOOR \u2022 COOLIDGE OFFICE",
    "title": "Cherry Drink",
    "file": "assets/gallery/030_cherry-drink.jpg"
  },
  {
    "id": 31,
    "x": 32.65,
    "y": 2.35,
    "z": 13.0,
    "rotY": -1.5708,
    "w": 1.969,
    "h": 2.15,
    "wing": "1ST FLOOR \u2022 CURATOR'S OFFICE",
    "title": "Trumpa",
    "file": "assets/gallery/031_trumpa.jpg"
  },
  {
    "id": 32,
    "x": 4.0,
    "y": 2.35,
    "z": 27.65,
    "rotY": 3.1416,
    "w": 2.15,
    "h": 1.209,
    "wing": "1ST FLOOR \u2022 SOUTH MEDIA WING",
    "title": "Dynamic",
    "file": "assets/gallery/032_dynamic.jpg"
  },
  {
    "id": 33,
    "x": 19.0,
    "y": 2.35,
    "z": 33.65,
    "rotY": 3.1416,
    "w": 1.721,
    "h": 2.15,
    "wing": "1ST FLOOR \u2022 FEATURE FILMS ROTUNDA",
    "title": "Work Breakroom",
    "file": "assets/gallery/033_work-breakroom.jpg"
  },
  {
    "id": 34,
    "x": 27.65,
    "y": 2.35,
    "z": 23.0,
    "rotY": -1.5708,
    "w": 2.15,
    "h": 2.15,
    "wing": "1ST FLOOR \u2022 SOUTH MEDIA WING",
    "title": "Mocha Slip",
    "file": "assets/gallery/034_mocha-slip.jpg"
  },
  {
    "id": 35,
    "x": -35.65,
    "y": 7.55,
    "z": -2.0,
    "rotY": 1.5708,
    "w": 2.15,
    "h": 2.021,
    "wing": "2ND FLOOR \u2022 WEST EXHIBITION HALL",
    "title": "Spotify Ad",
    "file": "assets/gallery/035_spotify-ad.jpg"
  },
  {
    "id": 36,
    "x": -35.65,
    "y": 7.55,
    "z": 3.0,
    "rotY": 1.5708,
    "w": 2.15,
    "h": 1.391,
    "wing": "2ND FLOOR \u2022 WEST EXHIBITION HALL",
    "title": "Shake It For Me",
    "file": "assets/gallery/036_shake-it-for-me.jpg"
  },
  {
    "id": 37,
    "x": -35.65,
    "y": 7.55,
    "z": 8.0,
    "rotY": 1.5708,
    "w": 2.15,
    "h": 1.209,
    "wing": "2ND FLOOR \u2022 WEST EXHIBITION HALL",
    "title": "Misty Morning",
    "file": "assets/gallery/037_misty-morning.jpg"
  },
  {
    "id": 38,
    "x": -35.65,
    "y": 7.55,
    "z": 13.0,
    "rotY": 1.5708,
    "w": 1.661,
    "h": 2.15,
    "wing": "2ND FLOOR \u2022 WEST EXHIBITION HALL",
    "title": "Omelette On Paper",
    "file": "assets/gallery/038_omelette-on_paper.jpg"
  },
  {
    "id": 39,
    "x": -32.0,
    "y": 7.55,
    "z": -5.65,
    "rotY": 0.0,
    "w": 2.15,
    "h": 2.15,
    "wing": "2ND FLOOR \u2022 WEST EXHIBITION HALL",
    "title": "Bird Mouth",
    "file": "assets/gallery/039_bird-mouth.jpg"
  },
  {
    "id": 40,
    "x": -20.0,
    "y": 7.55,
    "z": -5.65,
    "rotY": 0.0,
    "w": 2.15,
    "h": 2.15,
    "wing": "2ND FLOOR \u2022 WEST EXHIBITION HALL",
    "title": "4Who",
    "file": "assets/gallery/040_4Who.jpg"
  },
  {
    "id": 41,
    "x": -16.35,
    "y": 7.55,
    "z": 2.0,
    "rotY": -1.5708,
    "w": 2.15,
    "h": 2.15,
    "wing": "2ND FLOOR \u2022 WEST EXHIBITION HALL",
    "title": "Joyous Protection",
    "file": "assets/gallery/041_Joyous_Protection.jpg"
  },
  {
    "id": 42,
    "x": -16.35,
    "y": 7.55,
    "z": 10.0,
    "rotY": -1.5708,
    "w": 1.768,
    "h": 2.15,
    "wing": "2ND FLOOR \u2022 WEST EXHIBITION HALL",
    "title": "Made U A Bird",
    "file": "assets/gallery/042_made-u-a-bird.jpg"
  },
  {
    "id": 43,
    "x": -12.5,
    "y": 7.55,
    "z": -17.65,
    "rotY": 0.0,
    "w": 2.15,
    "h": 2.15,
    "wing": "2ND FLOOR \u2022 NORTH GALLERY ALCOVE",
    "title": "Dog Drawing",
    "file": "assets/gallery/043_dog-drawing.jpg"
  },
  {
    "id": 44,
    "x": -7.5,
    "y": 7.55,
    "z": -17.65,
    "rotY": 0.0,
    "w": 2.15,
    "h": 1.86,
    "wing": "2ND FLOOR \u2022 NORTH GALLERY ALCOVE",
    "title": "Smitty Pixels Mussel Heart",
    "file": "assets/gallery/044_Smitty-pixels-mussel-heart.jpg"
  },
  {
    "id": 45,
    "x": -15.65,
    "y": 7.55,
    "z": -12.0,
    "rotY": 1.5708,
    "w": 1.53,
    "h": 2.15,
    "wing": "2ND FLOOR \u2022 NORTH GALLERY ALCOVE",
    "title": "Hans",
    "file": "assets/gallery/045_Hans.jpg"
  },
  {
    "id": 46,
    "x": -15.65,
    "y": 7.55,
    "z": 2.0,
    "rotY": 1.5708,
    "w": 2.15,
    "h": 2.15,
    "wing": "2ND FLOOR \u2022 HOSMER GALLERY",
    "title": "Blip Vision Pizza Reach",
    "file": "assets/gallery/046_blip-vision-pizza-reach.jpg"
  },
  {
    "id": 47,
    "x": -15.65,
    "y": 7.55,
    "z": 10.0,
    "rotY": 1.5708,
    "w": 2.15,
    "h": 1.209,
    "wing": "2ND FLOOR \u2022 HOSMER GALLERY",
    "title": "Lake Excursion Ad",
    "file": "assets/gallery/047_lake-excursion-ad.jpg"
  },
  {
    "id": 48,
    "x": -4.35,
    "y": 7.55,
    "z": -10.0,
    "rotY": -1.5708,
    "w": 2.15,
    "h": 1.474,
    "wing": "2ND FLOOR \u2022 HOSMER GALLERY",
    "title": "Sand",
    "file": "assets/gallery/048_Sand.jpg"
  },
  {
    "id": 49,
    "x": -4.35,
    "y": 7.55,
    "z": -2.0,
    "rotY": -1.5708,
    "w": 1.919,
    "h": 2.15,
    "wing": "2ND FLOOR \u2022 HOSMER GALLERY",
    "title": "Floating Boxer Ad",
    "file": "assets/gallery/049_floating-boxer-ad.jpg"
  },
  {
    "id": 50,
    "x": -4.35,
    "y": 7.55,
    "z": 13.0,
    "rotY": -1.5708,
    "w": 2.15,
    "h": 1.474,
    "wing": "2ND FLOOR \u2022 HOSMER GALLERY",
    "title": "Peter Griffin Tribute",
    "file": "assets/gallery/050_peter-griffin-tribute.jpg"
  },
  {
    "id": 51,
    "x": 1.0,
    "y": 7.55,
    "z": -39.65,
    "rotY": 0.0,
    "w": 2.15,
    "h": 1.991,
    "wing": "2ND FLOOR \u2022 HAMPSHIRE ROOM",
    "title": "Imagen",
    "file": "assets/gallery/051_imagen.jpg"
  },
  {
    "id": 52,
    "x": 23.0,
    "y": 7.55,
    "z": -39.65,
    "rotY": 0.0,
    "w": 2.15,
    "h": 1.474,
    "wing": "2ND FLOOR \u2022 HAMPSHIRE ROOM",
    "title": "Spew",
    "file": "assets/gallery/052_spew.jpg"
  },
  {
    "id": 53,
    "x": 9.5,
    "y": 7.55,
    "z": -41.65,
    "rotY": 0.0,
    "w": 2.15,
    "h": 1.378,
    "wing": "2ND FLOOR \u2022 HAMPSHIRE ROOM",
    "title": "Purple Smile",
    "file": "assets/gallery/053_purple-smile.jpg"
  },
  {
    "id": 54,
    "x": 14.5,
    "y": 7.55,
    "z": -41.65,
    "rotY": 0.0,
    "w": 2.15,
    "h": 1.818,
    "wing": "2ND FLOOR \u2022 HAMPSHIRE ROOM",
    "title": "Smitty Ocean Storm",
    "file": "assets/gallery/054_Smitty-ocean-storm.jpg"
  },
  {
    "id": 55,
    "x": -3.65,
    "y": 7.55,
    "z": -33.0,
    "rotY": 1.5708,
    "w": 2.15,
    "h": 1.546,
    "wing": "2ND FLOOR \u2022 HAMPSHIRE ROOM",
    "title": "Liberal Lawn Sign",
    "file": "assets/gallery/055_liberal-lawn-sign.jpg"
  },
  {
    "id": 56,
    "x": 27.65,
    "y": 7.55,
    "z": -33.0,
    "rotY": -1.5708,
    "w": 2.15,
    "h": 2.15,
    "wing": "2ND FLOOR \u2022 HAMPSHIRE ROOM",
    "title": "Smitty Cow",
    "file": "assets/gallery/056_smitty-cow.jpg"
  },
  {
    "id": 57,
    "x": 11.0,
    "y": 7.55,
    "z": -26.35,
    "rotY": 3.1416,
    "w": 2.15,
    "h": 1.561,
    "wing": "2ND FLOOR \u2022 HAMPSHIRE ROOM",
    "title": "Ancient Predators",
    "file": "assets/gallery/057_ancient-predators.jpg"
  },
  {
    "id": 58,
    "x": 11.0,
    "y": 7.55,
    "z": -25.65,
    "rotY": 0.0,
    "w": 2.15,
    "h": 1.715,
    "wing": "2ND FLOOR \u2022 ARTS & MUSIC HALL",
    "title": "Hey Guy Tv",
    "file": "assets/gallery/058_hey-guy-tv.jpg"
  },
  {
    "id": 59,
    "x": 24.5,
    "y": 7.55,
    "z": -25.65,
    "rotY": 0.0,
    "w": 2.15,
    "h": 2.15,
    "wing": "2ND FLOOR \u2022 ARTS & MUSIC HALL",
    "title": "Yellow Guy Cute",
    "file": "assets/gallery/059_yellow-guy-cute.jpg"
  },
  {
    "id": 60,
    "x": 32.65,
    "y": 7.55,
    "z": -18.0,
    "rotY": -1.5708,
    "w": 2.15,
    "h": 2.15,
    "wing": "2ND FLOOR \u2022 EAST BAY ALCOVE",
    "title": "Smitty Blackbox Sigil Tee",
    "file": "assets/gallery/060_Smitty-BlackBox_Sigil_Tee.png"
  },
  {
    "id": 61,
    "x": 32.65,
    "y": 7.55,
    "z": -4.0,
    "rotY": -1.5708,
    "w": 2.15,
    "h": 1.207,
    "wing": "2ND FLOOR \u2022 EAST BAY ALCOVE",
    "title": "Annoyeornej",
    "file": "assets/gallery/061_annoyeornej.jpg"
  },
  {
    "id": 62,
    "x": 27.65,
    "y": 7.55,
    "z": -11.0,
    "rotY": -1.5708,
    "w": 2.15,
    "h": 1.474,
    "wing": "2ND FLOOR \u2022 ARTS & MUSIC HALL",
    "title": "Dogandghostthings",
    "file": "assets/gallery/062_dogandghostthings.jpg"
  },
  {
    "id": 63,
    "x": 27.65,
    "y": 7.55,
    "z": 4.0,
    "rotY": -1.5708,
    "w": 2.15,
    "h": 2.012,
    "wing": "2ND FLOOR \u2022 ARTS & MUSIC HALL",
    "title": "Thin Blue Line",
    "file": "assets/gallery/063_thin-blue-line.jpg"
  },
  {
    "id": 64,
    "x": -33.65,
    "y": 7.55,
    "z": 23.0,
    "rotY": 1.5708,
    "w": 2.15,
    "h": 2.15,
    "wing": "2ND FLOOR \u2022 COOLIDGE OFFICE",
    "title": "Space Planet",
    "file": "assets/gallery/064_Space-planet.jpg"
  },
  {
    "id": 65,
    "x": 32.65,
    "y": 7.55,
    "z": 13.0,
    "rotY": -1.5708,
    "w": 1.683,
    "h": 2.15,
    "wing": "2ND FLOOR \u2022 CURATOR'S OFFICE",
    "title": "Messages From God",
    "file": "assets/gallery/065_messages-from-God.jpg"
  },
  {
    "id": 66,
    "x": 4.0,
    "y": 7.55,
    "z": 27.65,
    "rotY": 3.1416,
    "w": 2.15,
    "h": 2.15,
    "wing": "2ND FLOOR \u2022 SOUTH MEDIA WING",
    "title": "Beach Video",
    "file": "assets/gallery/066_beach-video.jpg"
  },
  {
    "id": 67,
    "x": 19.0,
    "y": 7.55,
    "z": 33.65,
    "rotY": 3.1416,
    "w": 2.15,
    "h": 1.209,
    "wing": "2ND FLOOR \u2022 FEATURE FILMS ROTUNDA",
    "title": "Grafeetee",
    "file": "assets/gallery/067_grafeetee.jpg"
  },
  {
    "id": 68,
    "x": 27.65,
    "y": 7.55,
    "z": 23.0,
    "rotY": -1.5708,
    "w": 2.15,
    "h": 2.15,
    "wing": "2ND FLOOR \u2022 SOUTH MEDIA WING",
    "title": "Sf Penguin 1",
    "file": "assets/gallery/068_SF-penguin-1.jpg"
  },
  {
    "id": 69,
    "x": -35.65,
    "y": 12.75,
    "z": -2.0,
    "rotY": 1.5708,
    "w": 2.15,
    "h": 1.209,
    "wing": "3RD FLOOR \u2022 WEST EXHIBITION HALL",
    "title": "Penguin 2",
    "file": "assets/gallery/069_penguin-2.jpg"
  },
  {
    "id": 70,
    "x": -35.65,
    "y": 12.75,
    "z": 3.0,
    "rotY": 1.5708,
    "w": 2.15,
    "h": 2.15,
    "wing": "3RD FLOOR \u2022 WEST EXHIBITION HALL",
    "title": "Sf Beach Photo Drawn Eyebrows",
    "file": "assets/gallery/070_SF_beach_photo_drawn_eyebrows.jpg"
  },
  {
    "id": 71,
    "x": -35.65,
    "y": 12.75,
    "z": 8.0,
    "rotY": 1.5708,
    "w": 2.15,
    "h": 1.474,
    "wing": "3RD FLOOR \u2022 WEST EXHIBITION HALL",
    "title": "Yellow Ball Face",
    "file": "assets/gallery/071_yellow-ball-face.jpg"
  },
  {
    "id": 72,
    "x": -35.65,
    "y": 12.75,
    "z": 13.0,
    "rotY": 1.5708,
    "w": 1.93,
    "h": 2.15,
    "wing": "3RD FLOOR \u2022 WEST EXHIBITION HALL",
    "title": "Evil Purple Pixelated Face",
    "file": "assets/gallery/072_evil-purple-pixelated-face.jpg"
  },
  {
    "id": 73,
    "x": -32.0,
    "y": 12.75,
    "z": -5.65,
    "rotY": 0.0,
    "w": 2.15,
    "h": 2.15,
    "wing": "3RD FLOOR \u2022 WEST EXHIBITION HALL",
    "title": "Fancy",
    "file": "assets/gallery/073_fancy.jpg"
  },
  {
    "id": 74,
    "x": -20.0,
    "y": 12.75,
    "z": -5.65,
    "rotY": 0.0,
    "w": 2.15,
    "h": 1.209,
    "wing": "3RD FLOOR \u2022 WEST EXHIBITION HALL",
    "title": "Cow Flag",
    "file": "assets/gallery/074_cow-flag.jpg"
  },
  {
    "id": 75,
    "x": -16.35,
    "y": 12.75,
    "z": 2.0,
    "rotY": -1.5708,
    "w": 2.15,
    "h": 1.7,
    "wing": "3RD FLOOR \u2022 WEST EXHIBITION HALL",
    "title": "The Big Man",
    "file": "assets/gallery/075_the-big-man.jpg"
  },
  {
    "id": 76,
    "x": -16.35,
    "y": 12.75,
    "z": 10.0,
    "rotY": -1.5708,
    "w": 2.15,
    "h": 1.463,
    "wing": "3RD FLOOR \u2022 WEST EXHIBITION HALL",
    "title": "Consumer Sculpture",
    "file": "assets/gallery/076_consumer-sculpture.jpg"
  },
  {
    "id": 77,
    "x": -12.5,
    "y": 12.75,
    "z": -17.65,
    "rotY": 0.0,
    "w": 2.15,
    "h": 1.535,
    "wing": "3RD FLOOR \u2022 NORTH GALLERY ALCOVE",
    "title": "Green Guy With Wings",
    "file": "assets/gallery/077_green-guy-with-wings.jpg"
  },
  {
    "id": 78,
    "x": -7.5,
    "y": 12.75,
    "z": -17.65,
    "rotY": 0.0,
    "w": 2.15,
    "h": 1.613,
    "wing": "3RD FLOOR \u2022 NORTH GALLERY ALCOVE",
    "title": "Pointy World Car Fire",
    "file": "assets/gallery/078_pointy-world-car-fire.jpg"
  },
  {
    "id": 79,
    "x": -15.65,
    "y": 12.75,
    "z": -12.0,
    "rotY": 1.5708,
    "w": 2.15,
    "h": 1.402,
    "wing": "3RD FLOOR \u2022 NORTH GALLERY ALCOVE",
    "title": "Paint Red House",
    "file": "assets/gallery/079_paint-red-house.jpg"
  },
  {
    "id": 80,
    "x": -15.65,
    "y": 12.75,
    "z": 2.0,
    "rotY": 1.5708,
    "w": 1.794,
    "h": 2.15,
    "wing": "3RD FLOOR \u2022 HOSMER GALLERY",
    "title": "The Harbinger",
    "file": "assets/gallery/080_the-harbinger.jpg"
  },
  {
    "id": 81,
    "x": -15.65,
    "y": 12.75,
    "z": 10.0,
    "rotY": 1.5708,
    "w": 2.033,
    "h": 2.15,
    "wing": "3RD FLOOR \u2022 HOSMER GALLERY",
    "title": "Monkey Full Body",
    "file": "assets/gallery/081_monkey-full-body.jpg"
  },
  {
    "id": 82,
    "x": -4.35,
    "y": 12.75,
    "z": -10.0,
    "rotY": -1.5708,
    "w": 2.15,
    "h": 2.15,
    "wing": "3RD FLOOR \u2022 HOSMER GALLERY",
    "title": "Now Watch Me Whip",
    "file": "assets/gallery/082_now-watch-me-whip.jpg"
  },
  {
    "id": 83,
    "x": -4.35,
    "y": 12.75,
    "z": -2.0,
    "rotY": -1.5708,
    "w": 2.15,
    "h": 2.15,
    "wing": "3RD FLOOR \u2022 HOSMER GALLERY",
    "title": "Luv Graffiti Shirt Ad",
    "file": "assets/gallery/083_luv-graffiti-shirt-ad.jpg"
  },
  {
    "id": 84,
    "x": -4.35,
    "y": 12.75,
    "z": 13.0,
    "rotY": -1.5708,
    "w": 2.15,
    "h": 1.669,
    "wing": "3RD FLOOR \u2022 HOSMER GALLERY",
    "title": "Sf Mini Drawing Red",
    "file": "assets/gallery/084_sf-mini-drawing-red.jpg"
  },
  {
    "id": 85,
    "x": 1.0,
    "y": 12.75,
    "z": -39.65,
    "rotY": 0.0,
    "w": 2.143,
    "h": 2.15,
    "wing": "3RD FLOOR \u2022 HAMPSHIRE ROOM",
    "title": "Painting With A Bed",
    "file": "assets/gallery/085_painting-with-a-bed.jpg"
  },
  {
    "id": 86,
    "x": 23.0,
    "y": 12.75,
    "z": -39.65,
    "rotY": 0.0,
    "w": 2.15,
    "h": 1.295,
    "wing": "3RD FLOOR \u2022 HAMPSHIRE ROOM",
    "title": "Person With Mask Behind",
    "file": "assets/gallery/086_person-with-mask-behind.jpg"
  },
  {
    "id": 87,
    "x": 9.5,
    "y": 12.75,
    "z": -41.65,
    "rotY": 0.0,
    "w": 1.444,
    "h": 2.15,
    "wing": "3RD FLOOR \u2022 HAMPSHIRE ROOM",
    "title": "Photo Turned Drawing Creatureg",
    "file": "assets/gallery/087_photo-turned-drawing-creatureg.jpg"
  },
  {
    "id": 88,
    "x": 14.5,
    "y": 12.75,
    "z": -41.65,
    "rotY": 0.0,
    "w": 2.15,
    "h": 2.15,
    "wing": "3RD FLOOR \u2022 HAMPSHIRE ROOM",
    "title": "Goblin Drawing",
    "file": "assets/gallery/088_goblin-drawing.jpg"
  },
  {
    "id": 89,
    "x": -3.65,
    "y": 12.75,
    "z": -33.0,
    "rotY": 1.5708,
    "w": 2.15,
    "h": 2.15,
    "wing": "3RD FLOOR \u2022 HAMPSHIRE ROOM",
    "title": "Snapchat Athlete Gun Woman Boo",
    "file": "assets/gallery/089_snapchat-athlete-gun-woman-boo.jpg"
  },
  {
    "id": 90,
    "x": 27.65,
    "y": 12.75,
    "z": -33.0,
    "rotY": -1.5708,
    "w": 1.949,
    "h": 2.15,
    "wing": "3RD FLOOR \u2022 HAMPSHIRE ROOM",
    "title": "Smitty Shirt Handmade",
    "file": "assets/gallery/090_smitty-shirt-handmade.jpg"
  },
  {
    "id": 91,
    "x": 11.0,
    "y": 12.75,
    "z": -26.35,
    "rotY": 3.1416,
    "w": 2.15,
    "h": 1.383,
    "wing": "3RD FLOOR \u2022 HAMPSHIRE ROOM",
    "title": "Painted Smitty Red",
    "file": "assets/gallery/091_painted-smitty-red.jpg"
  },
  {
    "id": 92,
    "x": 11.0,
    "y": 12.75,
    "z": -25.65,
    "rotY": 0.0,
    "w": 2.15,
    "h": 1.22,
    "wing": "3RD FLOOR \u2022 ARTS & MUSIC HALL",
    "title": "Three Creatures",
    "file": "assets/gallery/092_three-creatures.jpg"
  },
  {
    "id": 93,
    "x": 24.5,
    "y": 12.75,
    "z": -25.65,
    "rotY": 0.0,
    "w": 1.612,
    "h": 2.15,
    "wing": "3RD FLOOR \u2022 ARTS & MUSIC HALL",
    "title": "Saxophone Fight",
    "file": "assets/gallery/093_saxophone-fight.jpg"
  },
  {
    "id": 94,
    "x": 32.65,
    "y": 12.75,
    "z": -18.0,
    "rotY": -1.5708,
    "w": 2.15,
    "h": 1.666,
    "wing": "3RD FLOOR \u2022 EAST BAY ALCOVE",
    "title": "Escapism By Medication",
    "file": "assets/gallery/094_escapism-by-medication.jpg"
  },
  {
    "id": 95,
    "x": 32.65,
    "y": 12.75,
    "z": -4.0,
    "rotY": -1.5708,
    "w": 2.15,
    "h": 1.614,
    "wing": "3RD FLOOR \u2022 EAST BAY ALCOVE",
    "title": "Minnesota Fish Painting",
    "file": "assets/gallery/095_Minnesota-fish-painting.jpg"
  },
  {
    "id": 96,
    "x": 27.65,
    "y": 12.75,
    "z": -11.0,
    "rotY": -1.5708,
    "w": 2.15,
    "h": 2.15,
    "wing": "3RD FLOOR \u2022 ARTS & MUSIC HALL",
    "title": "Dr Coach Incubation",
    "file": "assets/gallery/096_dr-coach-incubation.jpg"
  },
  {
    "id": 97,
    "x": 27.65,
    "y": 12.75,
    "z": 4.0,
    "rotY": -1.5708,
    "w": 2.15,
    "h": 2.15,
    "wing": "3RD FLOOR \u2022 ARTS & MUSIC HALL",
    "title": "Ascetic Sebring Ad",
    "file": "assets/gallery/097_Ascetic_Sebring_ad.jpg"
  },
  {
    "id": 98,
    "x": -33.65,
    "y": 12.75,
    "z": 23.0,
    "rotY": 1.5708,
    "w": 2.15,
    "h": 2.15,
    "wing": "3RD FLOOR \u2022 COOLIDGE OFFICE",
    "title": "Hairy Guy Drawing",
    "file": "assets/gallery/098_hairy-guy-drawing.jpg"
  },
  {
    "id": 99,
    "x": 32.65,
    "y": 12.75,
    "z": 13.0,
    "rotY": -1.5708,
    "w": 2.15,
    "h": 1.613,
    "wing": "3RD FLOOR \u2022 CURATOR'S OFFICE",
    "title": "Lake Blue Violet",
    "file": "assets/gallery/099_lake-blue-violet.jpg"
  },
  {
    "id": 100,
    "x": 4.0,
    "y": 12.75,
    "z": 27.65,
    "rotY": 3.1416,
    "w": 2.15,
    "h": 2.15,
    "wing": "3RD FLOOR \u2022 SOUTH MEDIA WING",
    "title": "Orange Stick Figure",
    "file": "assets/gallery/100_orange-stick-figure.jpg"
  },
  {
    "id": 101,
    "x": 19.0,
    "y": 12.75,
    "z": 33.65,
    "rotY": 3.1416,
    "w": 2.15,
    "h": 2.143,
    "wing": "3RD FLOOR \u2022 FEATURE FILMS ROTUNDA",
    "title": "Green Beanie Ad",
    "file": "assets/gallery/101_green-beanie-ad.jpg"
  },
  {
    "id": 102,
    "x": 27.65,
    "y": 12.75,
    "z": 23.0,
    "rotY": -1.5708,
    "w": 2.15,
    "h": 1.46,
    "wing": "3RD FLOOR \u2022 SOUTH MEDIA WING",
    "title": "Person On Fire",
    "file": "assets/gallery/102_person-on-fire.jpg"
  },
  {
    "id": 103,
    "x": -35.65,
    "y": 17.95,
    "z": -2.0,
    "rotY": 1.5708,
    "w": 2.15,
    "h": 1.443,
    "wing": "4TH FLOOR \u2022 WEST EXHIBITION HALL",
    "title": "Painting Red Abstract",
    "file": "assets/gallery/103_painting-red-abstract.jpg"
  },
  {
    "id": 104,
    "x": -35.65,
    "y": 17.95,
    "z": 3.0,
    "rotY": 1.5708,
    "w": 2.15,
    "h": 1.474,
    "wing": "4TH FLOOR \u2022 WEST EXHIBITION HALL",
    "title": "Clown Fast Food",
    "file": "assets/gallery/104_clown-fast-food.jpg"
  },
  {
    "id": 105,
    "x": -35.65,
    "y": 17.95,
    "z": 8.0,
    "rotY": 1.5708,
    "w": 2.15,
    "h": 2.141,
    "wing": "4TH FLOOR \u2022 WEST EXHIBITION HALL",
    "title": "Shirt Ad Flight",
    "file": "assets/gallery/105_shirt-ad-flight.jpg"
  },
  {
    "id": 106,
    "x": -35.65,
    "y": 17.95,
    "z": 13.0,
    "rotY": 1.5708,
    "w": 1.746,
    "h": 2.15,
    "wing": "4TH FLOOR \u2022 WEST EXHIBITION HALL",
    "title": "Simple Drawing Flower",
    "file": "assets/gallery/106_simple-drawing-flower.jpg"
  },
  {
    "id": 107,
    "x": -32.0,
    "y": 17.95,
    "z": -5.65,
    "rotY": 0.0,
    "w": 2.15,
    "h": 1.609,
    "wing": "4TH FLOOR \u2022 WEST EXHIBITION HALL",
    "title": "Framed Sf Animal 2",
    "file": "assets/gallery/107_framed-sf-animal-2.jpg"
  },
  {
    "id": 108,
    "x": -20.0,
    "y": 17.95,
    "z": -5.65,
    "rotY": 0.0,
    "w": 1.781,
    "h": 2.15,
    "wing": "4TH FLOOR \u2022 WEST EXHIBITION HALL",
    "title": "Darling Actor Drawing",
    "file": "assets/gallery/108_darling-actor-drawing.jpg"
  },
  {
    "id": 109,
    "x": -16.35,
    "y": 17.95,
    "z": 2.0,
    "rotY": -1.5708,
    "w": 2.15,
    "h": 2.15,
    "wing": "4TH FLOOR \u2022 WEST EXHIBITION HALL",
    "title": "Beekeeper",
    "file": "assets/gallery/109_beekeeper.jpg"
  },
  {
    "id": 110,
    "x": -16.35,
    "y": 17.95,
    "z": 10.0,
    "rotY": -1.5708,
    "w": 2.15,
    "h": 2.132,
    "wing": "4TH FLOOR \u2022 WEST EXHIBITION HALL",
    "title": "Run Your Shit 1",
    "file": "assets/gallery/110_run-your-shit-1.jpg"
  },
  {
    "id": 111,
    "x": -12.5,
    "y": 17.95,
    "z": -17.65,
    "rotY": 0.0,
    "w": 2.13,
    "h": 2.15,
    "wing": "4TH FLOOR \u2022 NORTH GALLERY ALCOVE",
    "title": "Run Your Shit 2",
    "file": "assets/gallery/111_run-your-shit-2.jpg"
  },
  {
    "id": 112,
    "x": -7.5,
    "y": 17.95,
    "z": -17.65,
    "rotY": 0.0,
    "w": 1.612,
    "h": 2.15,
    "wing": "4TH FLOOR \u2022 NORTH GALLERY ALCOVE",
    "title": "Hundred Percent Can",
    "file": "assets/gallery/112_hundred-percent-can.jpg"
  },
  {
    "id": 113,
    "x": -15.65,
    "y": 17.95,
    "z": -12.0,
    "rotY": 1.5708,
    "w": 2.15,
    "h": 2.15,
    "wing": "4TH FLOOR \u2022 NORTH GALLERY ALCOVE",
    "title": "Early Memorial 2",
    "file": "assets/gallery/113_early-memorial-2.jpg"
  },
  {
    "id": 114,
    "x": -15.65,
    "y": 17.95,
    "z": 2.0,
    "rotY": 1.5708,
    "w": 2.15,
    "h": 1.842,
    "wing": "4TH FLOOR \u2022 HOSMER GALLERY",
    "title": "Cheetah In Space",
    "file": "assets/gallery/114_cheetah-in-space.jpg"
  },
  {
    "id": 115,
    "x": -15.65,
    "y": 17.95,
    "z": 10.0,
    "rotY": 1.5708,
    "w": 2.15,
    "h": 2.15,
    "wing": "4TH FLOOR \u2022 HOSMER GALLERY",
    "title": "Shrefflo Ocean Cap Ad",
    "file": "assets/gallery/115_Shrefflo-ocean-cap-ad.jpg"
  },
  {
    "id": 116,
    "x": -4.35,
    "y": 17.95,
    "z": -10.0,
    "rotY": -1.5708,
    "w": 2.15,
    "h": 2.15,
    "wing": "4TH FLOOR \u2022 HOSMER GALLERY",
    "title": "Cartoon Ampersand Face",
    "file": "assets/gallery/116_cartoon-ampersand-face.jpg"
  },
  {
    "id": 117,
    "x": -4.35,
    "y": 17.95,
    "z": -2.0,
    "rotY": -1.5708,
    "w": 2.15,
    "h": 1.487,
    "wing": "4TH FLOOR \u2022 HOSMER GALLERY",
    "title": "Painted Sheet Mouse Shapes",
    "file": "assets/gallery/117_painted-sheet-mouse-shapes.jpg"
  },
  {
    "id": 118,
    "x": -4.35,
    "y": 17.95,
    "z": 13.0,
    "rotY": -1.5708,
    "w": 1.662,
    "h": 2.15,
    "wing": "4TH FLOOR \u2022 HOSMER GALLERY",
    "title": "Orange Kitchen Visions",
    "file": "assets/gallery/118_orange-kitchen-visions.jpg"
  },
  {
    "id": 119,
    "x": 1.0,
    "y": 17.95,
    "z": -39.65,
    "rotY": 0.0,
    "w": 2.15,
    "h": 2.15,
    "wing": "4TH FLOOR \u2022 HAMPSHIRE ROOM",
    "title": "Intense Face Clown",
    "file": "assets/gallery/119_intense-face-clown.jpg"
  },
  {
    "id": 120,
    "x": 23.0,
    "y": 17.95,
    "z": -39.65,
    "rotY": 0.0,
    "w": 2.15,
    "h": 1.892,
    "wing": "4TH FLOOR \u2022 HAMPSHIRE ROOM",
    "title": "Yoda Smoking Weed",
    "file": "assets/gallery/120_yoda-smoking-weed.jpg"
  },
  {
    "id": 121,
    "x": 9.5,
    "y": 17.95,
    "z": -41.65,
    "rotY": 0.0,
    "w": 2.15,
    "h": 1.639,
    "wing": "4TH FLOOR \u2022 HAMPSHIRE ROOM",
    "title": "Agressive Defensive Stance",
    "file": "assets/gallery/121_Agressive-Defensive-Stance.png"
  },
  {
    "id": 122,
    "x": 14.5,
    "y": 17.95,
    "z": -41.65,
    "rotY": 0.0,
    "w": 2.15,
    "h": 2.15,
    "wing": "4TH FLOOR \u2022 HAMPSHIRE ROOM",
    "title": "Meg Chain Sf Crate Challenge",
    "file": "assets/gallery/122_meg-chain-sf-crate-challenge.jpg"
  },
  {
    "id": 123,
    "x": -3.65,
    "y": 17.95,
    "z": -33.0,
    "rotY": 1.5708,
    "w": 2.15,
    "h": 1.476,
    "wing": "4TH FLOOR \u2022 HAMPSHIRE ROOM",
    "title": "Bird",
    "file": "assets/gallery/123_Bird.jpg"
  },
  {
    "id": 124,
    "x": 27.65,
    "y": 17.95,
    "z": -33.0,
    "rotY": -1.5708,
    "w": 2.15,
    "h": 2.15,
    "wing": "4TH FLOOR \u2022 HAMPSHIRE ROOM",
    "title": "Gaiter Mask Dr Coach Ad",
    "file": "assets/gallery/124_gaiter-mask-dr-coach-ad.jpg"
  },
  {
    "id": 125,
    "x": 11.0,
    "y": 17.95,
    "z": -26.35,
    "rotY": 3.1416,
    "w": 2.15,
    "h": 2.15,
    "wing": "4TH FLOOR \u2022 HAMPSHIRE ROOM",
    "title": "Tissue",
    "file": "assets/gallery/125_tissue.jpg"
  },
  {
    "id": 126,
    "x": 11.0,
    "y": 17.95,
    "z": -25.65,
    "rotY": 0.0,
    "w": 2.15,
    "h": 1.878,
    "wing": "4TH FLOOR \u2022 ARTS & MUSIC HALL",
    "title": "Older Bald Drawing",
    "file": "assets/gallery/126_older-bald-drawing.jpg"
  },
  {
    "id": 127,
    "x": 24.5,
    "y": 17.95,
    "z": -25.65,
    "rotY": 0.0,
    "w": 1.741,
    "h": 2.15,
    "wing": "4TH FLOOR \u2022 ARTS & MUSIC HALL",
    "title": "Selfie In The Woods",
    "file": "assets/gallery/127_selfie-in-the-woods.jpg"
  },
  {
    "id": 128,
    "x": 32.65,
    "y": 17.95,
    "z": -18.0,
    "rotY": -1.5708,
    "w": 2.044,
    "h": 2.15,
    "wing": "4TH FLOOR \u2022 EAST BAY ALCOVE",
    "title": "Curly Hair Low Res Guy",
    "file": "assets/gallery/128_curly-hair-low-res-guy.jpg"
  },
  {
    "id": 129,
    "x": 32.65,
    "y": 17.95,
    "z": -4.0,
    "rotY": -1.5708,
    "w": 2.15,
    "h": 1.357,
    "wing": "4TH FLOOR \u2022 EAST BAY ALCOVE",
    "title": "Winter 2022 Ad",
    "file": "assets/gallery/129_winter-2022-ad.jpg"
  },
  {
    "id": 130,
    "x": 27.65,
    "y": 17.95,
    "z": -11.0,
    "rotY": -1.5708,
    "w": 2.15,
    "h": 2.15,
    "wing": "4TH FLOOR \u2022 ARTS & MUSIC HALL",
    "title": "Dr Coach Full Face",
    "file": "assets/gallery/130_dr-coach-full-face.jpg"
  },
  {
    "id": 131,
    "x": 27.65,
    "y": 17.95,
    "z": 4.0,
    "rotY": -1.5708,
    "w": 2.15,
    "h": 2.134,
    "wing": "4TH FLOOR \u2022 ARTS & MUSIC HALL",
    "title": "Auto Shop Nightmare",
    "file": "assets/gallery/131_Auto-shop-nightmare.jpg"
  },
  {
    "id": 132,
    "x": -33.65,
    "y": 17.95,
    "z": 23.0,
    "rotY": 1.5708,
    "w": 2.15,
    "h": 2.137,
    "wing": "4TH FLOOR \u2022 COOLIDGE OFFICE",
    "title": "Pink Slime Thing",
    "file": "assets/gallery/132_pink-slime-thing.jpg"
  },
  {
    "id": 133,
    "x": 32.65,
    "y": 17.95,
    "z": 13.0,
    "rotY": -1.5708,
    "w": 2.15,
    "h": 2.15,
    "wing": "4TH FLOOR \u2022 CURATOR'S OFFICE",
    "title": "2 Hands Drawing At Once",
    "file": "assets/gallery/133_2-hands-drawing-at-once.jpg"
  },
  {
    "id": 134,
    "x": 4.0,
    "y": 17.95,
    "z": 27.65,
    "rotY": 3.1416,
    "w": 2.15,
    "h": 1.655,
    "wing": "4TH FLOOR \u2022 SOUTH MEDIA WING",
    "title": "No Weather Data",
    "file": "assets/gallery/134_no-weather-data.jpg"
  },
  {
    "id": 135,
    "x": 19.0,
    "y": 17.95,
    "z": 33.65,
    "rotY": 3.1416,
    "w": 2.15,
    "h": 2.15,
    "wing": "4TH FLOOR \u2022 FEATURE FILMS ROTUNDA",
    "title": "Most Famous Cover",
    "file": "assets/gallery/135_Most-Famous-cover.jpg"
  },
  {
    "id": 136,
    "x": 27.65,
    "y": 17.95,
    "z": 23.0,
    "rotY": -1.5708,
    "w": 2.15,
    "h": 2.15,
    "wing": "4TH FLOOR \u2022 SOUTH MEDIA WING",
    "title": "Big Party Weather",
    "file": "assets/gallery/136_big-party-weather.jpg"
  }
];

  // Apply custom artwork titles / room labels from GAME_TEXT.txt
  (() => {
    const wings = [];
    CURATED_ARTWORKS.forEach(a => { if (!wings.includes(a.wing)) wings.push(a.wing); });
    CURATED_ARTWORKS.forEach(a => {
      a.wing = T('artroom.' + String(wings.indexOf(a.wing) + 1).padStart(2, '0'), a.wing);
      a.title = T('art.' + String(a.id).padStart(3, '0'), a.title);
    });
  })();

  const _tempVec1 = new THREE.Vector3();
  const _tempVec2 = new THREE.Vector3();
  const _tempForward = new THREE.Vector3();
  const _tempRight = new THREE.Vector3();
  const _tempMoveDir = new THREE.Vector3();

  // 2D Liang-Barsky Line-Segment to AABB Slab Clipping (Raycast Occlusion)
  function lineIntersectsBox(x0, z0, x1, z1, minX, maxX, minZ, maxZ) {
    const dx = x1 - x0;
    const dz = z1 - z0;
    const p = [-dx, dx, -dz, dz];
    const q = [x0 - minX, maxX - x0, z0 - minZ, maxZ - z0];
    let u1 = 0.0;
    let u2 = 1.0;

    for (let i = 0; i < 4; i++) {
      if (p[i] === 0) {
        if (q[i] < 0) return false;
      } else {
        const t = q[i] / p[i];
        if (p[i] < 0) {
          if (t > u2) return false;
          if (t > u1) u1 = t;
        } else if (p[i] > 0) {
          if (t < u1) return false;
          if (t < u2) u2 = t;
        }
      }
    }
    return u1 <= u2;
  }

  class MuseumGame {
    constructor() {
      this.canvas = document.getElementById('game-canvas');
      this.audio = new MuseumAudioEngine();

      this.renderer = null;
      this.scene = null;
      this.camera = null;
      this.clock = new THREE.Clock();
      this.texLoader = new THREE.TextureLoader();

      this.gameStarted = false;
      this.graceTimer = 15.0;

      // Lighting
      this.flashlight = null;
      this.flashlightTarget = null;
      this.flashlightOn = false;
      this.muzzleLight = null;

      // Player State: Spawns on 1st Floor South Hosmer Gallery facing North (-Z) down the grand promenade
      this.playerPos = new THREE.Vector3(-10.0, CONFIG.PLAYER.CAMERA_HEIGHT, 22.0);
      this.playerFloor = 0;
      this.playerStairState = { active: null, baseFloor: 0 };
      this.playerPitch = 0;
      this.playerYaw = 0;
      this.health = CONFIG.PLAYER.MAX_HEALTH;
      this.stamina = CONFIG.PLAYER.MAX_STAMINA;
      this.isSprinting = false;
      this.relicsCollected = 0;
      this.isGameOver = false;
      this.isVictory = false;
      this.isPaused = false;
      this.isExaminingArt = false;
      this.isPointerLocked = false;
      this.isNativeLocked = false;
      this.skipNextMouseMove = false;
      this.lastClientX = null;
      this.lastClientY = null;
      this.currentRoom = T('hud.room_format', '{floor} • {area}', { floor: T('floor.1', '1ST FLOOR'), area: T('area.hosmer_gallery', 'HOSMER GALLERY') });

      // Weapon State
      this.ammoInMag = CONFIG.WEAPON.MAG_CAPACITY;
      this.reserveAmmo = CONFIG.WEAPON.RESERVE_AMMO;
      this.isReloading = false;
      this.lastShotTime = 0;
      this.isAiming = false;
      this.shotsFired = 0;
      this.shotsHit = 0;
      this.startTime = Date.now();

      // Input Map & Movement State
      this.keys = {};
      this.headBobTimer = 0;
      this.footstepTimer = 0;
      this.recoilOffset = { z: 0, rotX: 0 };
      this.leftHandHoverTimer = 0;
      this.leftHandGrabTimer = 0;
      this.leftHandGrabDuration = 0.55;
      this.isCrouching = false;
      this.isGrounded = true;
      this.jumpOffset = 0;
      this.jumpVelocity = 0;
      this.currentCamHeight = CONFIG.PLAYER.CAMERA_HEIGHT;

      // Architecture, Collisions & Navigation Graph
      this.colliders = [];
      this.paintings = [];
      this.relics = [];
      this.ammoPickups = [];
      this.lastAnnouncedFloor = null;
      this.floorIndicatorTimeout = null;
      this.navNodes = [];
      this.navAdj = [];
      this.exitDoors = null;
      this.exitUnlocked = false;
      this.focusedPainting = null;

      // Smitty Horror AI State: Spawns on 4th Floor (floor 3) in the North-East Restricted Reliquary
      this.smittyMesh = null;
      this.smittyMixer = null;
      this.smittyActions = {};
      this.smittyBones = {};
      this.currentActionName = 'Idle';
      this.smittyFallAngle = 0;
      this.smittyDeadTimer = 0;
      this.smittyRespawnTimer = 0;

      // Liquid Blood Physics State
      this.bloodDroplets = [];
      this.bloodPuddles = [];
      this.bloodDropGeom = new THREE.SphereGeometry(1, 10, 10);
      this.bloodDropMat = new THREE.MeshPhongMaterial({
        color: 0x7a0202,
        emissive: 0x240000,
        specular: 0xff9999,
        shininess: 120
      });
      this.bloodPuddleMat = this.createLiquidBloodPuddleMaterial();
      this.hiddenCapMat = new THREE.MeshBasicMaterial({ visible: false });

      this.smittyPos = new THREE.Vector3(12.0, 3 * CONFIG.FLOOR_HEIGHT, -34.0);
      this.smittyFloor = 3;
      this.smittyStairState = { active: null, baseFloor: 2 };
      this.smittyState = 'PATROL';
      this.smittyHp = CONFIG.SMITTY.MAX_HP;

      this.smittyPatrolGoalNode = 0;
      this.smittyPath = [];
      this.smittyPathIndex = 0;
      this.smittyPathGoalId = -1;
      this.smittyDanceTimer = 0;
      this.smittyStuckTimer = 0;
      this.relicNotificationTimeout = null;
      this.systemNotificationTimeout = null;
      this.isSpectatorMode = false;
      this.isNoClipMode = false;
      this.isFalling = false;
      this.fallVelocity = 0;
      this.lastKnownPlayerPos = new THREE.Vector3(-10, 0, 22);
      this.lastKnownPlayerFloor = 0;
      this.investigatePos = new THREE.Vector3();
      this.investigateFloor = 0;

      this.smittyLastAttackTime = 0;
      this.smittyStunTimer = 0;
      this.smittyRespawnTimer = 0;
      this.smittySearchTimer = 0;
      this.smittyFootstepInterval = 0.55;
      this.smittyFootstepTimer = 0;
      this.timeSincePlayerSeen = 0;

      this.playerVelocity = new THREE.Vector3();
      this.smittyStalkFreezeTimer = 0;
      this.smittySearchStage = 'NAV';
      this.smittySearchScanTimer = 0;
      this.smittyInspectTimer = 0;

      this.dom = {
        startScreen: document.getElementById('start-screen'),
        startBtn: document.getElementById('start-btn'),
        pauseModal: document.getElementById('pause-modal'),
        resumeBtn: document.getElementById('resume-btn'),
        objModal: document.getElementById('objective-modal'),
        floorplanCanvas: document.getElementById('floorplan-canvas'),
        gameOverModal: document.getElementById('game-over-modal'),
        restartBtn: document.getElementById('restart-btn'),
        victoryModal: document.getElementById('victory-modal'),
        winRestartBtn: document.getElementById('win-restart-btn'),
        artModal: document.getElementById('art-modal'),
        artModalImg: document.getElementById('art-modal-img'),
        artModalTitle: document.getElementById('art-modal-title'),
        artModalWing: document.getElementById('art-modal-wing'),
        artCloseBtn: document.getElementById('art-close-btn'),
        roomIndicator: document.getElementById('room-indicator'),
        floorIndicator: document.getElementById('floor-indicator'),
        spectatorIndicator: document.getElementById('spectator-indicator'),
        relicNotification: document.getElementById('relic-notification'),
        systemNotification: document.getElementById('system-notification'),
        healthValue: document.getElementById('health-value'),
        healthFill: document.getElementById('health-fill'),
        staminaFill: document.getElementById('stamina-fill'),
        ammoValue: document.getElementById('ammo-value'),
        reloadWarning: document.getElementById('reload-warning'),
        damageOverlay: document.getElementById('damage-overlay'),
        jumpscareOverlay: document.getElementById('jumpscare-overlay'),
        interactPrompt: document.getElementById('interact-prompt'),
        deathKeys: document.getElementById('death-keys'),
        deathShots: document.getElementById('death-shots'),
        deathHits: document.getElementById('death-hits'),
        winTime: document.getElementById('win-time'),
        winAccuracy: document.getElementById('win-accuracy')
      };

      window.game = this;

      console.log('%c[THE MUSEUM]%c Ready', 'color:#00ff88;font-weight:bold;background:#111;padding:3px 6px;border-radius:3px', 'color:#fff;background:#222;padding:3px 6px');

      this.initThree();
      this.buildForbesMuseum();
      this.buildNavGraph();
      this.randomizeSmittySpawn();
      this.buildWeaponViewmodel();
      this.buildLeftHandViewmodel();
      this.spawnRelics();
      this.spawnAmmoPickups();
      this.loadSmittyModel();
      this.setupEventListeners();
      this.animate();
    }

    initThree() {
      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(0x05070c);
      this.scene.fog = new THREE.FogExp2(0x05070c, 0.032);

      this.camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.04, 95);
      this.camera.position.copy(this.playerPos);
      this.scene.add(this.camera);

      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: true,
        powerPreference: 'high-performance'
      });
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.renderer.setPixelRatio(1);
      this.renderer.shadowMap.enabled = false;
      this.renderer.toneMapping = THREE.LinearToneMapping;
      this.renderer.toneMappingExposure = 1.0;

      // Atmospheric museum ambient illumination + subtle hemisphere bounce (balanced so artwork never washes out)
      const ambientLight = new THREE.AmbientLight(0x2d3648, 0.50);
      this.scene.add(ambientLight);

      const hemiLight = new THREE.HemisphereLight(0x4a5a78, 0x1a1612, 0.30);
      this.scene.add(hemiLight);

      // Flashlight SpotLight attached to player camera (starts OFF until player presses F)
      this.flashlight = new THREE.SpotLight(0xfff6e8, 0, 38, Math.PI / 4.4, 0.42, 1.05);
      this.flashlight.castShadow = false;

      this.flashlightTarget = new THREE.Object3D();
      this.scene.add(this.flashlightTarget);
      this.flashlight.target = this.flashlightTarget;
      this.camera.add(this.flashlight);

      const viewmodelLight = new THREE.PointLight(0xffeedd, 0.85, 2.5);
      viewmodelLight.position.set(0.12, 0.05, -0.25);
      this.camera.add(viewmodelLight);

      this.muzzleLight = new THREE.PointLight(0xffaa33, 0, 12);
      this.muzzleLight.position.set(0.18, -0.15, -0.8);
      this.camera.add(this.muzzleLight);
    }

    createLiquidBloodPuddleMaterial() {
      const cvs = document.createElement('canvas');
      cvs.width = 128;
      cvs.height = 128;
      const ctx = cvs.getContext('2d');
      const grad = ctx.createRadialGradient(64, 64, 6, 64, 64, 62);
      grad.addColorStop(0, 'rgba(95, 0, 0, 0.96)');
      grad.addColorStop(0.65, 'rgba(72, 0, 0, 0.90)');
      grad.addColorStop(0.92, 'rgba(45, 0, 0, 0.55)');
      grad.addColorStop(1, 'rgba(30, 0, 0, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 128, 128);
      const tex = new THREE.CanvasTexture(cvs);
      return new THREE.MeshPhongMaterial({
        map: tex,
        transparent: true,
        depthWrite: false,
        specular: 0xffaaaa,
        shininess: 140,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2
      });
    }

    buildForbesMuseum() {
      // Load photorealistic internet-sourced textures from assets/textures/
      const mats = {
        floorMarble: TextureFactory.loadPhotorealTexture(this.texLoader, 'assets/textures/marble_floor.jpg', 18, 18, 0xd8dce2),
        floorParquet: TextureFactory.loadPhotorealTexture(this.texLoader, 'assets/textures/wood_parquet.jpg', 20, 20, 0xc8a882),
        floorDarkWood: TextureFactory.loadPhotorealTexture(this.texLoader, 'assets/textures/wood_floor_dark.jpg', 18, 18, 0x8c7258),
        floorVaultStone: TextureFactory.loadPhotorealTexture(this.texLoader, 'assets/textures/stone_tiles.jpg', 20, 20, 0x7a8088),
        wallPlasterWarm: TextureFactory.loadPhotorealTexture(this.texLoader, 'assets/textures/gallery_plaster.jpg', 10, 2, 0xd8d2c7),
        wallPlasterCool: TextureFactory.loadPhotorealTexture(this.texLoader, 'assets/textures/gallery_plaster.jpg', 10, 2, 0xb8c4d4),
        wallPlasterSlate: TextureFactory.loadPhotorealTexture(this.texLoader, 'assets/textures/gallery_plaster.jpg', 10, 2, 0x8e9bae),
        wallBrick: TextureFactory.loadPhotorealTexture(this.texLoader, 'assets/textures/basement_brick.jpg', 10, 2, 0x8c685c),
        wallConcrete: TextureFactory.loadPhotorealTexture(this.texLoader, 'assets/textures/vault_concrete.jpg', 10, 2, 0x888e96),
        mahogany: TextureFactory.loadPhotorealTexture(this.texLoader, 'assets/textures/mahogany_wood.jpg', 4, 2, 0x6e4730),
        ceiling: TextureFactory.loadPhotorealTexture(this.texLoader, 'assets/textures/ceiling_plaster.jpg', 16, 16, 0x6e7684),
        stairStone: TextureFactory.loadPhotorealTexture(this.texLoader, 'assets/textures/vault_concrete.jpg', 4, 4, 0x9aa0a8)
      };

      mats.mahogany.polygonOffset = true;
      mats.mahogany.polygonOffsetFactor = -1;
      mats.mahogany.polygonOffsetUnits = -1;
      mats.wallBrick.polygonOffset = true;
      mats.wallBrick.polygonOffsetFactor = -1;
      mats.wallBrick.polygonOffsetUnits = -1;

      // Build all 4 floors of the Forbes Library & Museum
      for (let fl = 0; fl < CONFIG.NUM_FLOORS; fl++) {
        this.buildSingleForbesFloor(fl, mats);
      }

      // Build the two continuous 4-story U-stairwells (Stairwell N and Stairwell SW)
      this.buildFourStoryStairwells(mats);

      // Populate all 136 curated gallery artworks across the 4 floors
      this.populateCuratedArtworks(mats);
    }

    buildSingleForbesFloor(fl, mats) {
      const y0 = fl * CONFIG.FLOOR_HEIGHT;
      const h = CONFIG.FLOOR_HEIGHT;
      const ceilH = h - 0.06; // 5.14m ceiling height leaves a 6cm structural plenum below the next floor
      const wallH = ceilH;    // Walls span full 0.00..ceilH (5.14m) with hidden top/bottom caps
      const yc = y0 + wallH / 2;
      const ycFull = y0 + h / 2; // Full 5.20m height for stairwell-bordering walls so no inter-floor seam exists in stairwells
      const t = 0.4;

      const floorMat = fl === 0 ? mats.floorMarble
                     : fl === 1 ? mats.floorParquet
                     : fl === 2 ? mats.floorDarkWood
                     : mats.floorVaultStone;

      const mainWallMat = fl === 0 ? mats.wallPlasterCool
                        : fl === 1 ? mats.wallPlasterWarm
                        : fl === 2 ? mats.wallPlasterSlate
                        : mats.wallConcrete;

      const accentWallMat = fl === 3 ? mats.wallBrick : mats.mahogany;

      // --- FLOOR SLABS (Exact non-overlapping grid partition — zero overlap at doorways!) ---
      // 1. West Wing Slab (x: -36..-16, z: -6..18)
      this.createSlab(-26, y0, 6, 20.0, 24.0, floorMat, mats.ceiling, ceilH);
      // 2. Coolidge Office Slab (x: -34..-24, z: 18..28)
      this.createSlab(-29, y0, 23, 10.0, 10.0, mats.floorDarkWood, mats.ceiling, ceilH);
      // 3. Hosmer Gallery + North Magazine Alcove Slab (x: -16..-4, z: -18..28)
      this.createSlab(-10, y0, 5, 12.0, 46.0, floorMat, mats.ceiling, ceilH);
      // 4. Central Core South of Stairwell N (x: -4..4, z: -14..28)
      this.createSlab(0, y0, 7, 8.0, 42.0, floorMat, mats.ceiling, ceilH);
      // 5. Hampshire Room for Local History Slab (x: -4..28, z: -40..-26) + North Bay (x: 6..18, z: -42..-40)
      this.createSlab(12, y0, -33, 32.0, 14.0, floorMat, mats.ceiling, ceilH);
      this.createSlab(12, y0, -41, 12.0, 2.0, floorMat, mats.ceiling, ceilH);
      // 6. East Main Hall ("Arts & Music / Books") Slab (x: 4..28, z: -26..18) + East Bays (x: 28..33)
      this.createSlab(16, y0, -4, 24.0, 44.0, floorMat, mats.ceiling, ceilH);
      this.createSlab(30.5, y0, -18, 5.0, 8.0, floorMat, mats.ceiling, ceilH);
      this.createSlab(30.5, y0, -4, 5.0, 8.0, floorMat, mats.ceiling, ceilH);
      this.createSlab(30.5, y0, 13, 5.0, 10.0, mats.floorDarkWood, mats.ceiling, ceilH);
      // 7. South-East Media Wing Slab (x: 4..28, z: 18..28) + South Beaux-Arts Rotunda (x: 12..26, z: 28..36)
      this.createSlab(16, y0, 23, 24.0, 10.0, floorMat, mats.ceiling, ceilH);
      this.createSlab(19, y0, 32, 14.0, 8.0, floorMat, mats.ceiling, ceilH);

      // --- OUTER & INTERIOR ARCHITECTURAL WALLS ---
      // Convention: Z-walls own the 0.4x0.4 corner pillars; X-walls butt flush against the ±X faces of Z-walls (x1+0.2 .. x2-0.2).
      // Zero overlapping volumes, zero coplanar faces, zero corner gaps!

      // A. WEST WING: CALVIN COOLIDGE PRESIDENTIAL MUSEUM (x: -36..-16, z: -6..18)
      this.createWall(-36, yc, 6, t, wallH, 24.4, mainWallMat, true, fl);         // -6.2..18.2
      this.createWall(-26, yc, -6, 19.6, wallH, t, mainWallMat, true, fl);        // -35.8..-16.2
      this.createWall(-26, yc, -5.0, 3.6, wallH, 1.4, accentWallMat, true, fl);   // -5.7..-4.3 (flush against z=-5.8)
      // South wall of West Wing (z = 18, x: -35.8..-16.2) with 2 doorways:
      // Door 1 into Coolidge Office: x = -31.5..-28.5; Door 2 into SW Stairwell Landing: x = -21.5..-18.5
      this.createWall(-33.65, yc, 18, 4.3, wallH, t, mainWallMat, true, fl);      // -35.8..-31.5
      this.createWall(-25.0, ycFull, 18, 7.0, h, t, mainWallMat, true, fl);       // -28.5..-21.5 (borders SW Stairwell)
      this.createWall(-17.35, ycFull, 18, 2.3, h, t, mainWallMat, true, fl);      // -18.5..-16.2 (borders SW Stairwell)
      this.createLintel(-30.0, y0, 18, 3.0, t, ceilH, mainWallMat);
      this.createLintel(-20.0, y0, 18, 3.0, t, ceilH, mainWallMat);

      // B. COOLIDGE OFFICE (x: -34..-24, z: 18..28)
      this.createWall(-34, yc, 23.2, t, wallH, 10.0, accentWallMat, true, fl);    // 18.2..28.2
      this.createWall(-29, yc, 28, 9.6, wallH, t, accentWallMat, true, fl);       // -33.8..-24.2
      // East wall of Coolidge Office (x = -24, z: 18.2..28.2) with doorway at z: 18.6..20.8 into SW Stairwell Landing
      this.createWall(-24, ycFull, 18.4, t, h, 0.4, accentWallMat, true, fl);     // North jamb (18.2..18.6)
      this.createWall(-24, ycFull, 24.5, t, h, 7.4, accentWallMat, true, fl);     // South segment (20.8..28.2)
      this.createLintelZ(-24, y0, 19.7, t, 2.2, ceilH, accentWallMat);

      // C. HOSMER GALLERY & NORTH MAGAZINE ALCOVE (x: -16..-4, z: -18..28)
      // Entire x = -16 wall from z = -18.2 to 28.2 (disjoint collinear segments):
      this.createWall(-16, yc, -10.85, t, wallH, 14.7, mainWallMat, true, fl);    // -18.2..-3.5
      this.createLintelZ(-16, y0, -2.0, t, 3.0, ceilH, mainWallMat);              // -3.5..-0.5
      this.createWall(-16, yc, 2.0, t, wallH, 5.0, mainWallMat, true, fl);        // -0.5..4.5
      this.createLintelZ(-16, y0, 6.0, t, 3.0, ceilH, mainWallMat);               // 4.5..7.5
      this.createWall(-16, yc, 10.0, t, wallH, 5.0, mainWallMat, true, fl);       // 7.5..12.5
      this.createLintelZ(-16, y0, 14.0, t, 3.0, ceilH, mainWallMat);              // 12.5..15.5
      this.createWall(-16, ycFull, 17.05, t, h, 3.1, mainWallMat, true, fl);      // 15.5..18.6
      this.createLintelZ(-16, y0, 19.7, t, 2.2, ceilH, mainWallMat);              // 18.6..20.8
      this.createWall(-16, ycFull, 24.5, t, h, 7.4, mainWallMat, true, fl);       // 20.8..28.2

      this.createWall(-10, yc, -18, 11.6, wallH, t, mainWallMat, true, fl);       // -15.8..-4.2
      this.createWall(-14.8, yc, -6, 2.0, wallH, t, mainWallMat, true, fl);       // -15.8..-13.8
      this.createWall(-5.2, yc, -6, 2.0, wallH, t, mainWallMat, true, fl);        // -6.2..-4.2

      // South wall of Hosmer Gallery (z = 28, x: -15.8..-4.2)
      if (fl === 0) {
        this.createWall(-14.1, yc, 28, 3.4, wallH, t, mainWallMat, true, fl);     // -15.8..-12.4
        this.createWall(-5.9, yc, 28, 3.4, wallH, t, mainWallMat, true, fl);      // -7.6..-4.2
        this.createLintel(-10.0, y0, 28, 4.8, t, ceilH, mainWallMat);             // -12.4..-7.6
        this.createExitDoors(-10.0, 0, 28);
      } else {
        this.createWall(-10, yc, 28, 11.6, wallH, t, mainWallMat, true, fl);      // -15.8..-4.2
      }

      // Entire x = -4 wall from z = -40.2 to 28.2 (disjoint collinear segments):
      this.createWall(-4, yc, -33.1, t, wallH, 14.2, mainWallMat, true, fl);      // -40.2..-26.0 (Hampshire Room West)
      this.createWall(-4, ycFull, -21.4, t, h, 9.2, mainWallMat, true, fl);       // -26.0..-16.8 (Stairwell N West shaft)
      this.createLintelZ(-4, y0, -15.4, t, 2.8, ceilH, mainWallMat);              // -16.8..-14.0 (Stairwell N West door)
      this.createWall(-4, yc, -5.75, t, wallH, 16.5, mainWallMat, true, fl);      // -14.0..2.5
      this.createLintelZ(-4, y0, 5.0, t, 5.0, ceilH, mainWallMat);                // 2.5..7.5
      this.createWall(-4, yc, 13.75, t, wallH, 12.5, mainWallMat, true, fl);      // 7.5..20.0
      this.createLintelZ(-4, y0, 22.0, t, 4.0, ceilH, mainWallMat);               // 20.0..24.0
      this.createWall(-4, yc, 26.1, t, wallH, 4.2, mainWallMat, true, fl);        // 24.0..28.2

      // D. CENTRAL SERVICE CORE (x: -3.8..3.8, z: -14..28)
      this.createWall(0, ycFull, -14, 7.6, h, t, mainWallMat, true, fl);          // -3.8..3.8 (South wall of Stairwell N)
      this.createWall(0, yc, -10, 7.6, wallH, t, mainWallMat, true, fl);          // -3.8..3.8 (Dividing wall between Men's & Women's restrooms)
      this.createWall(0, yc, -6, 7.6, wallH, t, mainWallMat, true, fl);           // -3.8..3.8 (South wall of restrooms / North wall of study)
      this.createWall(0, yc, 2.0, 7.6, wallH, t, mainWallMat, true, fl);          // -3.8..3.8

      // Entire x = 4 wall from z = -26.0 to 18.2 (disjoint collinear segments):
      this.createWall(4, ycFull, -21.4, t, h, 9.2, mainWallMat, true, fl);        // -26.0..-16.8 (Stairwell N East shaft)
      this.createLintelZ(4, y0, -15.4, t, 2.8, ceilH, mainWallMat);               // -16.8..-14.0 (Stairwell N East door)
      this.createWall(4, yc, -13.5, t, wallH, 1.0, mainWallMat, true, fl);        // -14.0..-13.0
      this.createLintelZ(4, y0, -12.0, t, 2.0, ceilH, mainWallMat);               // -13.0..-11.0
      this.createWall(4, yc, -10.0, t, wallH, 2.0, mainWallMat, true, fl);        // -11.0..-9.0
      this.createLintelZ(4, y0, -8.0, t, 2.0, ceilH, mainWallMat);                // -9.0..-7.0
      this.createWall(4, yc, -5.25, t, wallH, 3.5, mainWallMat, true, fl);        // -7.0..-3.5
      this.createLintelZ(4, y0, -2.0, t, 3.0, ceilH, mainWallMat);                // -3.5..-0.5
      this.createWall(4, yc, 1.0, t, wallH, 3.0, mainWallMat, true, fl);          // -0.5..2.5
      this.createLintelZ(4, y0, 5.0, t, 5.0, ceilH, mainWallMat);                 // 2.5..7.5
      this.createWall(4, yc, 12.85, t, wallH, 10.7, accentWallMat, true, fl);     // 7.5..18.2 (Mechanical Core East)

      // Elevator & Mechanical Core Block (x: -3.8..3.8, z: 8..18)
      this.createWall(0.0, yc, 8.0, 7.6, wallH, t, accentWallMat, true, fl);      // -3.8..3.8
      this.createWall(0.0, yc, 14.0, 7.6, wallH, t, accentWallMat, true, fl);     // -3.8..3.8
      this.createWall(-2.0, yc, 16.0, t, wallH, 3.6, accentWallMat, true, fl);    // 14.2..17.8
      this.createWall(-2.8, yc, 18.0, 2.0, wallH, t, mainWallMat, true, fl);      // -3.8..-1.8
      this.createWall(2.9, yc, 18.0, 1.8, wallH, t, mainWallMat, true, fl);       // 2.0..3.8
      this.createLintel(0.1, y0, 18.0, 3.8, t, ceilH, mainWallMat);               // -1.8..2.0

      // South wall of South Cross-Passage (z = 28, x: -3.8..11.8)
      this.createWall(4.0, yc, 28, 15.6, wallH, t, mainWallMat, true, fl);        // -3.8..11.8

      // E. HAMPSHIRE ROOM FOR LOCAL HISTORY (x: -4..28, z: -40..-26 + North Bay x: 6..18, z: -42..-40)
      this.createWall(1.0, yc, -40, 9.6, wallH, t, mainWallMat, true, fl);        // -3.8..5.8
      this.createWall(23.0, yc, -40, 9.6, wallH, t, mainWallMat, true, fl);       // 18.2..27.8
      this.createWall(6, yc, -41.0, t, wallH, 2.4, mainWallMat, true, fl);        // -42.2..-39.8
      this.createWall(18, yc, -41.0, t, wallH, 2.4, mainWallMat, true, fl);       // -42.2..-39.8
      this.createWall(12, yc, -42, 11.6, wallH, t, mainWallMat, true, fl);        // 6.2..17.8

      // Entire z = -26 wall from x = -3.8 to 27.8 (disjoint collinear segments):
      this.createWall(0.0, ycFull, -26, 7.6, h, t, mainWallMat, true, fl);        // -3.8..3.8 (Stairwell N North)
      this.createWall(4.4, yc, -26, 0.4, wallH, t, mainWallMat, true, fl);        // 4.2..4.6 (West door jamb)
      this.createLintel(6.0, y0, -26, 2.8, t, ceilH, mainWallMat);                // 4.6..7.4
      this.createWall(12.0, yc, -26, 9.2, wallH, t, mainWallMat, true, fl);       // 7.4..16.6
      this.createLintel(18.2, y0, -26, 3.2, t, ceilH, mainWallMat);               // 16.6..19.8
      this.createWall(23.8, yc, -26, 8.0, wallH, t, mainWallMat, true, fl);       // 19.8..27.8

      // F. EAST MAIN HALL ("NON-FICTION / BOOKS / ARTS & MUSIC") (x: 4..28, z: -26..18)
      // Entire x = 28 wall from z = -40.2 to 28.2 (disjoint collinear segments):
      this.createWall(28, yc, -31.0, t, wallH, 18.4, mainWallMat, true, fl);      // -40.2..-21.8
      // Bay 1 (z: -22..-14, x: 28..33)
      this.createWall(30.5, yc, -22, 4.6, wallH, t, mainWallMat, true, fl);       // 28.2..32.8
      this.createWall(33, yc, -18, t, wallH, 8.4, mainWallMat, true, fl);         // -22.2..-13.8
      this.createWall(30.5, yc, -14, 4.6, wallH, t, mainWallMat, true, fl);       // 28.2..32.8
      // Between Bay 1 and Bay 2 (z: -13.8..-7.8)
      this.createWall(28, yc, -10.8, t, wallH, 6.0, mainWallMat, true, fl);       // -13.8..-7.8
      // Bay 2 (z: -8..0, x: 28..33)
      this.createWall(30.5, yc, -8, 4.6, wallH, t, mainWallMat, true, fl);        // 28.2..32.8
      this.createWall(33, yc, -4, t, wallH, 8.4, mainWallMat, true, fl);          // -8.2..0.2
      this.createWall(30.5, yc, 0, 4.6, wallH, t, mainWallMat, true, fl);         // 28.2..32.8
      // Between Bay 2 and Arts & Music Office (z: -0.2..7.8)
      this.createWall(28, yc, 3.8, t, wallH, 8.0, mainWallMat, true, fl);         // -0.2..7.8

      // G. ARTS AND MUSIC OFFICE (x: 19..33, z: 8..18)
      this.createWall(26.0, yc, 8, 13.6, wallH, t, accentWallMat, true, fl);      // 19.2..32.8
      this.createWall(33, yc, 13, t, wallH, 10.4, accentWallMat, true, fl);       // 7.8..18.2
      // West wall of Office (x = 19, z: 7.8..18.2) with doorway at z: 11.5..14.5
      this.createWall(19, yc, 9.65, t, wallH, 3.7, accentWallMat, true, fl);      // 7.8..11.5
      this.createWall(19, yc, 16.35, t, wallH, 3.7, accentWallMat, true, fl);     // 14.5..18.2
      this.createLintelZ(19, y0, 13.0, t, 3.0, ceilH, accentWallMat);             // 11.5..14.5
      // South wall of Office (z = 18, x: 19.2..32.8) with doorway at x: 21.5..24.5 into South-East Wing
      this.createWall(20.35, yc, 18, 2.3, wallH, t, accentWallMat, true, fl);     // 19.2..21.5
      this.createWall(28.65, yc, 18, 8.3, wallH, t, accentWallMat, true, fl);     // 24.5..32.8
      this.createLintel(23.0, y0, 18, 3.0, t, ceilH, accentWallMat);              // 21.5..24.5

      // H. SOUTH-EAST MEDIA & FEATURE FILMS WING (x: -4..28, z: 18..28) + ACCURATE ROTUNDA COLONNADE APSE
      this.createWall(28, yc, 23.2, t, wallH, 10.0, mainWallMat, true, fl);       // 18.2..28.2
      this.createWall(27.0, yc, 28, 1.6, wallH, t, mainWallMat, true, fl);        // 26.2..27.8

      // Accurate Semi-Circular Beaux-Arts Rotunda Apse & Colonnade (x: 12..26, z: 28..36)
      this.createAccurateRotunda(fl, y0, mats, ceilH, wallH);

      // --- ARCHITECTURAL SIGNAGE, BOOKSTACKS & PERIOD FURNITURE PER FLOOR ---
      this.populateFloorFurnitureAndSignage(fl, y0, mats);
    }

    populateFloorFurnitureAndSignage(fl, y0, mats) {
      const flTitle = [T('floor.1', '1ST FLOOR'), T('floor.2', '2ND FLOOR'), T('floor.3', '3RD FLOOR'), T('floor.4', '4TH FLOOR')][fl];
      const ceilH = CONFIG.FLOOR_HEIGHT - 0.06;

      // Room header signage above major doorways (offset 6cm from wall face with polygonOffset)
      const westSignTitle = fl === 0 ? T('sign.west_room.floor1', 'CLASSICAL ANTIQUITIES')
                          : fl === 1 ? T('sign.west_room.floor2', 'CALVIN COOLIDGE MUSEUM')
                          : fl === 2 ? T('sign.west_room.floor3', 'SURREALISM SALON')
                          : T('sign.west_room.floor4', 'QUARANTINED ART VAULT');
      this.createRoomSign(-15.72, y0 + 3.85, 6.0, Math.PI / 2, westSignTitle, flTitle);

      const neSignTitle = fl === 1 ? T('sign.north_room.floor2', 'HAMPSHIRE ROOM • LOCAL HISTORY')
                        : fl === 3 ? T('sign.north_room.floor4', 'RESTRICTED RELIQUARY VAULT')
                        : T('sign.north_room.floor1_and_3', 'SPECIAL COLLECTIONS ARCHIVE');
      this.createRoomSign(12.0, y0 + 3.85, -25.72, 0, neSignTitle, flTitle);

      // West Wing Exhibition Plinths & Display Cases (x: -26, z: 0 and z: 12)
      this.createExhibitionPlinth(-26, y0, 0, 2.4, 1.1, 2.4, fl < 3);
      this.createExhibitionPlinth(-26, y0, 12, 2.4, 1.1, 2.4, fl < 3);
      this.createMuseumBench(-26, y0, 6);

      // Coolidge Office / SW Office Desk (x: -29, z: 24)
      this.createInfoDesk(-29, y0, 24, mats.mahogany);

      // Restroom Suites & Archival Laboratories (Central Service Core z: -14..-6)
      this.createRealisticRestrooms(fl, y0, mats);

      // Period Study & Research Library (Central Core z: -6..2)
      this.createRealisticStudyRoom(fl, y0, mats);

      // Hosmer Gallery Benches (x: -10, z: 0 and z: 14)
      this.createMuseumBench(-10, y0, 0);
      this.createMuseumBench(-10, y0, 14);

      // Hampshire Room Display Plinths (x: 12, z: -39 and x: 4, z: -33 and x: 20, z: -33)
      this.createExhibitionPlinth(12, y0, -39, 2.2, 1.1, 2.2, fl === 3);
      this.createMuseumBench(12, y0, -33);

      // East Main Hall: Realistic 5-Range Bookstacks System with Ladders & Trolleys
      this.createRealisticMainStacks(fl, y0, mats);

      // Arts and Music Office Desk (x: 26, z: 13)
      this.createInfoDesk(26, y0, 13, mats.mahogany);

      // South-East Rotunda Circular Reference Desk at (23, 22)
      this.createCircularReferenceDesk(23, y0, 22, mats.mahogany, fl);

      // Distinct Floor-Specific Atmospheric Ceiling Lamps & Spotlights
      // Floor 0: Classical Antiquities Gallery — crisp white halogen (3200K)
      // Floor 1: Presidential Archives — warm amber gaslight (2700K)
      // Floor 2: Surrealist Salon — moody cyan/moonlight gallery (4500K)
      // Floor 3: Quarantined Art Vault — eerie emergency crimson
      const lightColor = fl === 0 ? 0xf4f4f4
                       : fl === 1 ? 0xffd27d
                       : fl === 2 ? 0x93c5fd
                       : 0xef4444;
      const lightInt = fl === 3 ? 0.48 : 0.42;
      const roomLightCoords = [
        [-26, 6],   // West Wing
        [-10, 6],   // Hosmer Gallery
        [12, -33],  // Hampshire Room
        [15, -10],  // East Main Hall Stacks Aisle
        [18, 24]    // South-East Media Wing
      ];
      roomLightCoords.forEach(([lx, lz], idx) => {
        const fix = new THREE.Mesh(
          new THREE.CylinderGeometry(0.4, 0.4, 0.10, 8),
          new THREE.MeshBasicMaterial({ color: lightColor })
        );
        fix.position.set(lx, y0 + ceilH - 0.06, lz);
        this.scene.add(fix);

        const pl = new THREE.PointLight(lightColor, lightInt, 18);
        pl.position.set(lx, y0 + ceilH - 0.35, lz);
        this.scene.add(pl);
      });
    }

    buildFourStoryStairwells(mats) {
      const totalH = CONFIG.NUM_FLOORS * CONFIG.FLOOR_HEIGHT;
      const midY = totalH / 2;
      const t = 0.4;
      const ceilH = CONFIG.FLOOR_HEIGHT - 0.06;

      // --- 1. NORTH-CENTRAL U-STAIRWELL (x: -4..4, z: -26..-14) ---
      // Note: Outer shaft walls at x=-4, x=4, z=-26 are built per-floor in buildSingleForbesFloor (full height h)
      // Center divider wall between West flight and East flight (x = 0, z: -23.2..-16.8)
      this.createWall(0, midY, -20.0, 0.34, totalH, 6.4, mats.wallConcrete, true, 'all');
      // Roof over Stairwell N (exact 8.0 x 12.0 shaft bounds — zero overlap with adjacent ceilings)
      this.createCeiling(0, totalH - 0.06, -20, 8.0, 12.0, mats.ceiling);

      // Build landings & steps for each floor in Stairwell N:
      for (let fl = 0; fl < CONFIG.NUM_FLOORS; fl++) {
        const y0 = fl * CONFIG.FLOOR_HEIGHT;
        // Solid South Landing box at Floor fl (x: -4.0..4.0, z: -16.8..-14.0) with thick vertical face to eliminate any gaps
        const landBox = new THREE.Mesh(new THREE.BoxGeometry(8.0, 0.28, 2.8), mats.stairStone);
        landBox.position.set(0, y0 - 0.14, -15.4);
        this.scene.add(landBox);

        if (fl > 0) {
          this.createCeiling(0, y0 - 0.06, -15.4, 7.6, 2.8, mats.ceiling);
        }

        // Stairwell Floor Number Sign on South wall of landing (z = -14.28)
        this.createRoomSign(0, y0 + 2.4, -14.28, Math.PI, T('sign.stairwell_b', 'STAIRWELL B • FLOOR {number}', { number: fl + 1 }), fl === 0 ? T('sign.stairwell_b.subtitle_floor1', 'EXIT LEVEL') : T('sign.stairwell_b.subtitle_upper', 'USE WEST FLIGHT UP / EAST FLIGHT DOWN'));

        if (fl < CONFIG.NUM_FLOORS - 1) {
          // Solid North Mid-Landing box at y0 + 2.6 (x: -4.0..4.0, z: -26.0..-23.2)
          const nLand = new THREE.Mesh(new THREE.BoxGeometry(8.0, 0.28, 2.8), mats.stairStone);
          nLand.position.set(0, y0 + 2.6 - 0.14, -24.6);
          this.scene.add(nLand);

          const numSteps = 12;
          const stepLen = 6.4 / numSteps;
          const stepH = 2.6 / numSteps;
          for (let s = 0; s < numSteps; s++) {
            const sz = -16.8 - (s + 0.5) * stepLen;
            // West Flight (x: -1.98, goes UP from y0 at z=-16.8 to y0+2.6 at z=-23.2)
            const wy = y0 + (s + 1) * stepH;
            const wStep = new THREE.Mesh(new THREE.BoxGeometry(3.64, stepH + 0.22, stepLen + 0.02), mats.stairStone);
            wStep.position.set(-1.98, wy - stepH / 2 - 0.06, sz);
            this.scene.add(wStep);

            // East Flight (x: 1.98, goes UP from y0+2.6 at z=-23.2 to y0+5.2 at z=-16.8)
            const ey = (y0 + 5.2) - s * stepH;
            const eStep = new THREE.Mesh(new THREE.BoxGeometry(3.64, stepH + 0.22, stepLen + 0.02), mats.stairStone);
            eStep.position.set(1.98, ey - stepH / 2 - 0.06, sz);
            this.scene.add(eStep);
          }
        }
      }
      // Guardrail on Floor 0 East Flight
      this.createWall(1.98, 1.22, -16.95, 3.64, 2.4, 0.24, mats.mahogany, true, 0);
      // Full floor-to-ceiling wooden barricade on Floor 3 West Flight (sealing upper shaft completely, zero gap)
      const blockNW = new THREE.Mesh(new THREE.BoxGeometry(3.64, ceilH, 0.30), mats.mahogany);
      blockNW.position.set(-1.98, 3 * CONFIG.FLOOR_HEIGHT + ceilH / 2, -16.95);
      this.scene.add(blockNW);
      this.colliders.push({ type: 'box', floor: 3, minX: -3.85, maxX: -0.15, minZ: -17.15, maxZ: -16.75 });

      // --- 2. SOUTH-WEST GRAND U-STAIRWELL (x: -24..-16, z: 18..28) ---
      this.createWall(-20, midY, 28, 7.6, totalH, t, mats.wallConcrete, true, 'all');       // South outer wall (-23.8..-16.2)
      this.createWall(-20, midY, 23.2, 0.34, totalH, 4.8, mats.wallConcrete, true, 'all');  // Center divider
      // Roof over Stairwell SW (exact 8.0 x 10.0 shaft bounds — zero overlap with adjacent ceilings)
      this.createCeiling(-20, totalH - 0.06, 23, 8.0, 10.0, mats.ceiling);

      for (let fl = 0; fl < CONFIG.NUM_FLOORS; fl++) {
        const y0 = fl * CONFIG.FLOOR_HEIGHT;
        // Solid North Landing box at Floor fl (x: -24.0..-16.0, z: 18.0..20.8)
        const landBoxSW = new THREE.Mesh(new THREE.BoxGeometry(8.0, 0.28, 2.8), mats.stairStone);
        landBoxSW.position.set(-20, y0 - 0.14, 19.4);
        this.scene.add(landBoxSW);

        if (fl > 0) {
          this.createCeiling(-20, y0 - 0.06, 19.4, 7.6, 2.8, mats.ceiling);
        }

        this.createRoomSign(-20, y0 + 2.4, 20.6, 0, T('sign.stairwell_a', 'STAIRWELL A • FLOOR {number}', { number: fl + 1 }), T('sign.stairwell_a.subtitle', 'WEST FLIGHT UP / EAST FLIGHT DOWN'));

        if (fl < CONFIG.NUM_FLOORS - 1) {
          // Solid South Mid-Landing box at y0 + 2.6 (x: -24.0..-16.0, z: 25.6..28.0)
          const sLand = new THREE.Mesh(new THREE.BoxGeometry(8.0, 0.28, 2.4), mats.stairStone);
          sLand.position.set(-20, y0 + 2.6 - 0.14, 26.8);
          this.scene.add(sLand);

          const numSteps = 10;
          const stepLen = 4.8 / numSteps;
          const stepH = 2.6 / numSteps;
          for (let s = 0; s < numSteps; s++) {
            const sz = 20.8 + (s + 0.5) * stepLen;
            // West Flight (x: -21.98, goes UP from y0 at z=20.8 to y0+2.6 at z=25.6)
            const wy = y0 + (s + 1) * stepH;
            const wStep = new THREE.Mesh(new THREE.BoxGeometry(3.64, stepH + 0.22, stepLen + 0.02), mats.stairStone);
            wStep.position.set(-21.98, wy - stepH / 2 - 0.06, sz);
            this.scene.add(wStep);

            // East Flight (x: -18.02, goes UP from y0+2.6 at z=25.6 to y0+5.2 at z=20.8)
            const ey = (y0 + 5.2) - s * stepH;
            const eStep = new THREE.Mesh(new THREE.BoxGeometry(3.64, stepH + 0.22, stepLen + 0.02), mats.stairStone);
            eStep.position.set(-18.02, ey - stepH / 2 - 0.06, sz);
            this.scene.add(eStep);
          }
        }
      }
      // Guardrail on Floor 0 East Flight of Stairwell SW
      this.createWall(-18.02, 1.22, 20.95, 3.64, 2.4, 0.24, mats.mahogany, true, 0);
      // Full floor-to-ceiling wooden barricade on Floor 3 West Flight (sealing upper shaft completely, zero gap)
      const blockSWW = new THREE.Mesh(new THREE.BoxGeometry(3.64, ceilH, 0.30), mats.mahogany);
      blockSWW.position.set(-21.98, 3 * CONFIG.FLOOR_HEIGHT + ceilH / 2, 20.95);
      this.scene.add(blockSWW);
      this.colliders.push({ type: 'box', floor: 3, minX: -23.85, maxX: -20.15, minZ: 20.75, maxZ: 21.15 });
    }

    // --- MULTI-STORY U-STAIRWELL ELEVATION SOLVER ---
    updateStairwellElevation(pos, stairState, currentFloor) {
      const H = CONFIG.FLOOR_HEIGHT;

      // 1. Check North-Central Stairwell (x: -4..4, z: -26..-14)
      if (pos.x >= -4.0 && pos.x <= 4.0 && pos.z >= -26.0 && pos.z <= -14.0) {
        if (pos.z < -16.8) {
          if (stairState.active !== 'N') {
            stairState.active = 'N';
            if (pos.x < 0) {
              // Entered West flight (going UP from currentFloor)
              stairState.baseFloor = Math.min(CONFIG.NUM_FLOORS - 2, currentFloor);
            } else {
              // Entered East flight (going DOWN from currentFloor)
              stairState.baseFloor = Math.max(0, currentFloor - 1);
            }
          }
          const L = stairState.baseFloor;
          if (pos.z <= -23.2) {
            return { y: L * H + 2.6, floor: pos.x < 0 ? L : L + 1 };
          }
          const t = Math.max(0, Math.min(1, (-16.8 - pos.z) / 6.4));
          if (pos.x < 0) {
            return { y: L * H + t * 2.6, floor: L };
          } else {
            return { y: (L + 1) * H - t * 2.6, floor: L + 1 };
          }
        } else {
          // On South Landing (z: -16.8..-14.0)
          if (stairState.active === 'N') {
            const newFloor = pos.x < 0 ? stairState.baseFloor : stairState.baseFloor + 1;
            stairState.active = null;
            return { y: newFloor * H, floor: newFloor };
          }
          return { y: currentFloor * H, floor: currentFloor };
        }
      }

      // 2. Check South-West Grand Stairwell (x: -24..-16, z: 18..28)
      if (pos.x >= -24.0 && pos.x <= -16.0 && pos.z >= 18.0 && pos.z <= 28.0) {
        if (pos.z > 20.8) {
          if (stairState.active !== 'SW') {
            stairState.active = 'SW';
            if (pos.x < -20.0) {
              stairState.baseFloor = Math.min(CONFIG.NUM_FLOORS - 2, currentFloor);
            } else {
              stairState.baseFloor = Math.max(0, currentFloor - 1);
            }
          }
          const L = stairState.baseFloor;
          if (pos.z >= 25.6) {
            return { y: L * H + 2.6, floor: pos.x < -20.0 ? L : L + 1 };
          }
          const t = Math.max(0, Math.min(1, (pos.z - 20.8) / 4.8));
          if (pos.x < -20.0) {
            return { y: L * H + t * 2.6, floor: L };
          } else {
            return { y: (L + 1) * H - t * 2.6, floor: L + 1 };
          }
        } else {
          // On North Landing (z: 18.0..20.8)
          if (stairState.active === 'SW') {
            const newFloor = pos.x < -20.0 ? stairState.baseFloor : stairState.baseFloor + 1;
            stairState.active = null;
            return { y: newFloor * H, floor: newFloor };
          }
          return { y: currentFloor * H, floor: currentFloor };
        }
      }

      stairState.active = null;
      return { y: currentFloor * H, floor: currentFloor };
    }

    createSlab(x, y0, z, w, d, floorMat, ceilMat, h) {
      this.createFloor(x, y0, z, w, d, floorMat);
      this.createCeiling(x, y0 + h, z, w, d, ceilMat);
    }

    createFloor(x, y, z, w, d, mat) {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x, y, z);
      this.scene.add(mesh);
    }

    createCeiling(x, y, z, w, d, mat) {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
      mesh.rotation.x = Math.PI / 2;
      mesh.position.set(x, y, z);
      this.scene.add(mesh);
    }

    createLintel(x, y0, z, w, d, ceilH, mat, doorH = 2.4) {
      const lintelH = ceilH - doorH;
      const mats6 = [this.hiddenCapMat, this.hiddenCapMat, this.hiddenCapMat, mat, mat, mat];
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, lintelH, d), mats6);
      mesh.position.set(x, y0 + doorH + lintelH / 2, z);
      this.scene.add(mesh);
    }

    createLintelZ(x, y0, z, w, d, ceilH, mat, doorH = 2.4) {
      const lintelH = ceilH - doorH;
      const mats6 = [mat, mat, this.hiddenCapMat, mat, this.hiddenCapMat, this.hiddenCapMat];
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, lintelH, d), mats6);
      mesh.position.set(x, y0 + doorH + lintelH / 2, z);
      this.scene.add(mesh);
    }

    createWall(x, y, z, w, h, d, mat, collide = true, floor = 'all') {
      // Hide top (+Y) and bottom (-Y) caps so walls never share a horizontal plane with floors, ceilings, or landings
      const mats6 = [mat, mat, this.hiddenCapMat, this.hiddenCapMat, mat, mat];
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats6);
      mesh.position.set(x, y, z);
      this.scene.add(mesh);

      if (collide) {
        this.colliders.push({
          type: 'box',
          floor: floor,
          minX: x - w / 2,
          maxX: x + w / 2,
          minZ: z - d / 2,
          maxZ: z + d / 2
        });
      }
      return mesh;
    }

    createRoomSign(x, y, z, rotY, title, subtitle = '') {
      // Area and room signage removed per user request
      return null;
    }

    createAccurateRotunda(fl, y0, mats, ceilH, wallH) {
      const cx = 19.0;
      const cz = 28.0;
      const R = 7.0;
      const t = 0.4;
      const yc = y0 + wallH / 2;
      const mainWallMat = fl === 0 ? mats.wallPlasterCool
                        : fl === 1 ? mats.wallPlasterWarm
                        : fl === 2 ? mats.wallPlasterSlate
                        : mats.wallConcrete;
      const accentMat = fl === 3 ? mats.wallBrick : mats.mahogany;

      // 8 faceted apse wall segments from -PI/2 to +PI/2
      const numFacets = 8;
      for (let i = 0; i < numFacets; i++) {
        const a1 = -Math.PI / 2 + (i / numFacets) * Math.PI;
        const a2 = -Math.PI / 2 + ((i + 1) / numFacets) * Math.PI;
        const x1 = cx + R * Math.sin(a1);
        const z1 = cz + R * Math.cos(a1);
        const x2 = cx + R * Math.sin(a2);
        const z2 = cz + R * Math.cos(a2);

        const mx = (x1 + x2) / 2;
        const mz = (z1 + z2) / 2;
        const dx = x2 - x1;
        const dz = z2 - z1;
        const segLen = Math.hypot(dx, dz);
        const rotY = Math.atan2(dx, dz);

        const segMesh = new THREE.Mesh(new THREE.BoxGeometry(t, wallH, segLen + 0.05), mainWallMat);
        segMesh.position.set(mx, yc, mz);
        segMesh.rotation.y = rotY;
        this.scene.add(segMesh);

        this.colliders.push({
          type: 'box',
          floor: fl,
          minX: Math.min(x1, x2) - 0.25,
          maxX: Math.max(x1, x2) + 0.25,
          minZ: Math.min(z1, z2) - 0.25,
          maxZ: Math.max(z1, z2) + 0.25
        });
      }

      // 8 Classical Corinthian / Fluted Columns along the inner colonnade
      const R_col = 6.0;
      for (let i = 0; i <= numFacets; i++) {
        const a = -Math.PI / 2 + (i / numFacets) * Math.PI;
        const colX = cx + R_col * Math.sin(a);
        const colZ = cz + R_col * Math.cos(a);

        const colGroup = new THREE.Group();
        colGroup.position.set(colX, y0, colZ);

        const baseMat = fl === 3 ? mats.wallConcrete : mats.floorMarble;
        const colBase = new THREE.Mesh(new THREE.BoxGeometry(0.70, 0.40, 0.70), baseMat);
        colBase.position.y = 0.20;
        colGroup.add(colBase);

        const colShaft = new THREE.Mesh(
          new THREE.CylinderGeometry(0.24, 0.28, wallH - 0.85, 16),
          baseMat
        );
        colShaft.position.y = 0.40 + (wallH - 0.85) / 2;
        colGroup.add(colShaft);

        const capital = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.45, 0.68), baseMat);
        capital.position.y = wallH - 0.225;
        colGroup.add(capital);

        this.scene.add(colGroup);

        this.colliders.push({
          type: 'cylinder',
          floor: fl,
          x: colX,
          z: colZ,
          radius: 0.38
        });
      }

      // Rotunda Central Exhibition Partition (mounts Artworks 33, 67, 101, 135 at z = 33.65)
      this.createWall(19.0, yc, 33.9, 4.2, wallH, 0.35, accentMat, true, fl);

      // Central Stepped Marble Dais / Medallion (x: 19.0, z: 30.5)
      const daisMat = fl === 3 ? mats.wallConcrete : mats.floorMarble;
      const daisTier1 = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.7, 0.14, 24), daisMat);
      daisTier1.position.set(cx, y0 + 0.07, 30.5);
      this.scene.add(daisTier1);

      const daisTier2 = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.9, 0.14, 24), accentMat);
      daisTier2.position.set(cx, y0 + 0.21, 30.5);
      this.scene.add(daisTier2);

      // Centerpiece on dais: Elegant waist-height exhibition pedestal matching the museum's display style
      if (fl === 3) {
        this.createExhibitionPlinth(cx, y0 + 0.28, 30.5, 1.2, 0.52, 1.2, false);
      } else {
        this.createExhibitionPlinth(cx, y0 + 0.28, 30.5, 1.2, 0.52, 1.2, fl < 2);
      }

      // Overhead Rotunda Chandelier & Rosette
      const chanGroup = new THREE.Group();
      chanGroup.position.set(cx, y0 + ceilH - 0.04, 30.5);

      const brassMat = new THREE.MeshLambertMaterial({ color: 0xd4af37 });
      const rosette = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.5, 0.08, 16), mats.ceiling);
      chanGroup.add(rosette);

      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.1, 8), brassMat);
      stem.position.y = -0.55;
      chanGroup.add(stem);

      const ring1 = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.05, 8, 20), brassMat);
      ring1.position.y = -1.1;
      ring1.rotation.x = Math.PI / 2;
      chanGroup.add(ring1);

      const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.65, 0.04, 8, 16), brassMat);
      ring2.position.y = -0.85;
      ring2.rotation.x = Math.PI / 2;
      chanGroup.add(ring2);

      this.scene.add(chanGroup);

      const chanColor = fl === 3 ? 0xff4422 : (fl === 1 ? 0xffdf99 : 0xfffae6);
      const chanLight = new THREE.PointLight(chanColor, fl === 3 ? 0.45 : 0.60, 14.0);
      chanLight.position.set(cx, y0 + ceilH - 1.3, 30.5);
      this.scene.add(chanLight);
    }

    createRealisticRestrooms(fl, y0, mats) {
      const tileMat = new THREE.MeshLambertMaterial({ color: 0x1e293b });
      const floorTileMat = new THREE.MeshLambertMaterial({ color: 0xd1d5db });
      const wainscotMat = new THREE.MeshLambertMaterial({ color: 0xe5e7eb });
      const porcelainMat = new THREE.MeshPhongMaterial({ color: 0xfcfcfc, specular: 0xffffff, shininess: 120 });
      const seatMat = new THREE.MeshLambertMaterial({ color: 0x111827 });
      const chromeMat = new THREE.MeshPhongMaterial({ color: 0xf1f5f9, specular: 0xffffff, shininess: 160 });
      const stallMat = new THREE.MeshLambertMaterial({ color: 0x334155 });
      const headrailMat = new THREE.MeshPhongMaterial({ color: 0x94a3b8, specular: 0xffffff, shininess: 140 });
      const mirrorMat = new THREE.MeshPhongMaterial({ color: 0xbfdbfe, specular: 0xffffff, shininess: 180 });
      const woodMat = mats.mahogany;
      const brassMat = new THREE.MeshLambertMaterial({ color: 0xd4af37 });

      // 1. DEDICATED CERAMIC TILE FLOOR SLAB (covering wood floor across x: -3.8..3.8, z: -14.0..-6.0)
      const rFloor = new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.05, 8.0), floorTileMat);
      rFloor.position.set(0, y0 + 0.025, -10.0);
      this.scene.add(rFloor);

      // 2. CEILING RECESSED LIGHTS & GLOWING FIXTURES
      // Men's ceiling light (z = -12.0)
      const mLight = new THREE.PointLight(0xfffaed, 0.75, 9.0);
      mLight.position.set(0, y0 + 3.8, -12.0);
      this.scene.add(mLight);
      const mFix = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.04, 1.4), new THREE.MeshBasicMaterial({ color: 0xfffaed }));
      mFix.position.set(0, y0 + 5.10, -12.0);
      this.scene.add(mFix);

      // Women's ceiling light (z = -8.0)
      const wLight = new THREE.PointLight(0xfffaed, 0.75, 9.0);
      wLight.position.set(0, y0 + 3.8, -8.0);
      this.scene.add(wLight);
      const wFix = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.04, 1.4), new THREE.MeshBasicMaterial({ color: 0xfffaed }));
      wFix.position.set(0, y0 + 5.10, -8.0);
      this.scene.add(wFix);

      // 3. CERAMIC WAINSCOTING PANELS ON PERIMETER WALLS (height 2.2m)
      const wainscotBack = new THREE.Mesh(new THREE.BoxGeometry(0.04, 2.2, 7.96), wainscotMat);
      wainscotBack.position.set(-3.76, y0 + 1.1, -10.0);
      this.scene.add(wainscotBack);

      const wainscotMid = new THREE.Mesh(new THREE.BoxGeometry(7.56, 2.2, 0.04), wainscotMat);
      wainscotMid.position.set(0, y0 + 1.1, -10.0);
      this.scene.add(wainscotMid);

      // 4. RESTROOM ENTRANCE DOORWAYS (x = 4.0, z = -12.0 Men's, z = -8.0 Women's)
      const createRestroomDoorway = (doorZ, signTitle, isMen) => {
        const frameW = 0.12;
        const frameH = 2.4;
        const frameD = 0.35;
        const leftJamb = new THREE.Mesh(new THREE.BoxGeometry(frameD, frameH, frameW), woodMat);
        leftJamb.position.set(3.95, y0 + frameH / 2, doorZ - 1.0);
        this.scene.add(leftJamb);

        const rightJamb = new THREE.Mesh(new THREE.BoxGeometry(frameD, frameH, frameW), woodMat);
        rightJamb.position.set(3.95, y0 + frameH / 2, doorZ + 1.0);
        this.scene.add(rightJamb);

        const lintelMesh = new THREE.Mesh(new THREE.BoxGeometry(frameD, 0.16, 2.0), woodMat);
        lintelMesh.position.set(3.95, y0 + frameH - 0.08, doorZ);
        this.scene.add(lintelMesh);

        // Door hung nicely ajar (30 deg inward)
        const doorGroup = new THREE.Group();
        doorGroup.position.set(3.95, y0, doorZ - 0.94);
        const doorPanel = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.3, 0.94), woodMat);
        doorPanel.position.set(0, 1.15, 0.47);
        doorGroup.add(doorPanel);

        // Brass push plate & handle
        const plate = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.45, 0.12), brassMat);
        plate.position.set(0, 1.10, 0.85);
        doorGroup.add(plate);

        doorGroup.rotation.y = isMen ? 0.40 : -0.40;
        this.scene.add(doorGroup);

        // Brass Room Plaque on hallway wall
        this.createRoomSign(4.18, y0 + 1.65, doorZ + 1.35, Math.PI / 2, signTitle);
      };

      createRestroomDoorway(-12.0, 'MEN • RESTROOM', true);
      createRestroomDoorway(-8.0, 'WOMEN • RESTROOM', false);

      // 5. HELPER: REALISTIC TOILET (positioned against back wall at x = -3.8)
      const buildToilet = (tx, tz, rotY) => {
        const group = new THREE.Group();
        group.position.set(tx, y0, tz);
        group.rotation.y = rotY;

        // Pedestal base
        const base = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.24, 0.54), porcelainMat);
        base.position.set(0, 0.12, 0.06);
        group.add(base);

        // Elongated porcelain bowl
        const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.15, 0.22, 16), porcelainMat);
        bowl.position.set(0, 0.31, 0.14);
        group.add(bowl);

        // Contoured commercial seat ring
        const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.04, 16), seatMat);
        seat.position.set(0, 0.43, 0.14);
        group.add(seat);

        // Porcelain flush tank against wall
        const tank = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.48, 0.22), porcelainMat);
        tank.position.set(0, 0.68, -0.16);
        group.add(tank);

        // Tank lid
        const lid = new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.05, 0.24), porcelainMat);
        lid.position.set(0, 0.93, -0.16);
        group.add(lid);

        // Chrome flush trip lever
        const lever = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.02, 0.02), chromeMat);
        lever.position.set(-0.25, 0.85, -0.16);
        group.add(lever);

        // Wall grab bar
        const grabBar = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.70, 8), chromeMat);
        grabBar.position.set(0.48, 0.85, 0.08);
        grabBar.rotation.x = Math.PI / 2;
        group.add(grabBar);

        // Dual toilet paper dispenser
        const tp = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.28), chromeMat);
        tp.position.set(0.48, 0.65, 0.12);
        group.add(tp);

        this.scene.add(group);
      };

      // 6. HELPER: CONTINUOUS ARCHITECTURAL STALL SUITE (NO GAPS)
      // Spans zMin to zMax along x = -3.75 (back) to x = -1.80 (front)
      const buildStallBank = (zNorth, zSouth, dividerZ, toiletZ1, toiletZ2) => {
        const totalW = Math.abs(zSouth - zNorth);
        const centerZ = (zNorth + zSouth) / 2;
        const stallDepth = 1.95;
        const midX = -3.75 + stallDepth / 2;

        // Solid side divider panels (anchored from back wall x = -3.75 to front x = -1.80)
        // North end panel
        const pNorth = new THREE.Mesh(new THREE.BoxGeometry(stallDepth, 2.0, 0.04), stallMat);
        pNorth.position.set(midX, y0 + 1.10, zNorth);
        this.scene.add(pNorth);

        // Center divider panel
        const pMid = new THREE.Mesh(new THREE.BoxGeometry(stallDepth, 2.0, 0.04), stallMat);
        pMid.position.set(midX, y0 + 1.10, dividerZ);
        this.scene.add(pMid);

        // South end panel
        const pSouth = new THREE.Mesh(new THREE.BoxGeometry(stallDepth, 2.0, 0.04), stallMat);
        pSouth.position.set(midX, y0 + 1.10, zSouth);
        this.scene.add(pSouth);

        // CONTINUOUS TOP ALUMINUM HEADRAIL (unifies the entire stall bank across the top at y = 2.15)
        const headrail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, totalW + 0.04), headrailMat);
        headrail.position.set(-1.80, y0 + 2.15, centerZ);
        this.scene.add(headrail);

        // Front facade pilasters and hung doors (flush, seamless interlocking layout):
        // North Pilaster (zNorth to zNorth + 0.30)
        const pil1 = new THREE.Mesh(new THREE.BoxGeometry(0.04, 2.0, 0.30), stallMat);
        pil1.position.set(-1.80, y0 + 1.10, zNorth + 0.15);
        this.scene.add(pil1);

        // Stall 1 Door (width 0.90, swung slightly ajar in one stall)
        const door1Group = new THREE.Group();
        door1Group.position.set(-1.80, y0, zNorth + 0.30);
        const d1Mesh = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.85, 0.90), stallMat);
        d1Mesh.position.set(0, 1.075, 0.45);
        door1Group.add(d1Mesh);
        const latch1 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.04), chromeMat);
        latch1.position.set(0, 1.05, 0.85);
        door1Group.add(latch1);
        door1Group.rotation.y = -0.32;
        this.scene.add(door1Group);

        // Center Pilaster (zNorth + 1.20 to dividerZ + 0.60, covers the middle gap)
        const midPilW = (zSouth - 1.20) - (zNorth + 1.20);
        const pilMid = new THREE.Mesh(new THREE.BoxGeometry(0.04, 2.0, midPilW > 0.30 ? midPilW : 0.60), stallMat);
        pilMid.position.set(-1.80, y0 + 1.10, dividerZ);
        this.scene.add(pilMid);

        // Stall 2 Door (width 0.90, closed flush)
        const door2Group = new THREE.Group();
        door2Group.position.set(-1.80, y0, zSouth - 1.20);
        const d2Mesh = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.85, 0.90), stallMat);
        d2Mesh.position.set(0, 1.075, 0.45);
        door2Group.add(d2Mesh);
        const latch2 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.04), chromeMat);
        latch2.position.set(0, 1.05, 0.85);
        door2Group.add(latch2);
        this.scene.add(door2Group);

        // South Pilaster
        const pil2 = new THREE.Mesh(new THREE.BoxGeometry(0.04, 2.0, 0.30), stallMat);
        pil2.position.set(-1.80, y0 + 1.10, zSouth - 0.15);
        this.scene.add(pil2);

        // Mount toilets flush against back wall
        buildToilet(-3.35, toiletZ1, 0);
        buildToilet(-3.35, toiletZ2, 0);
      };

      // Helper: Vanity Suite with Recessed Sinks & Mirrors
      const buildVanitySuite = (vx, vz, width, mirrorZOffset, isFacingSouth) => {
        const group = new THREE.Group();
        group.position.set(vx, y0, vz);

        // Espresso wood vanity cabinet
        const cabinet = new THREE.Mesh(new THREE.BoxGeometry(width, 0.82, 0.64), woodMat);
        cabinet.position.set(0, 0.41, 0);
        group.add(cabinet);

        // Quartz vanity countertop with bullnose bevel
        const counter = new THREE.Mesh(new THREE.BoxGeometry(width + 0.08, 0.06, 0.70), tileMat);
        counter.position.set(0, 0.84, 0);
        group.add(counter);

        // 2 Under-mount porcelain washbasins with sensor faucets
        const sinkSpacing = width * 0.26;
        [-sinkSpacing, sinkSpacing].forEach((ox) => {
          const basin = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.08, 0.44), porcelainMat);
          basin.position.set(ox, 0.85, 0);
          group.add(basin);

          // Chrome swan-neck sensor faucet
          const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.24, 10), chromeMat);
          stem.position.set(ox, 0.98, isFacingSouth ? 0.22 : -0.22);
          group.add(stem);

          const spout = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.14), chromeMat);
          spout.position.set(ox, 1.08, isFacingSouth ? 0.15 : -0.15);
          group.add(spout);

          // Polished wall mirror with brass frame
          const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.74, 1.25, 0.03), mirrorMat);
          mirror.position.set(ox, 1.75, mirrorZOffset);
          group.add(mirror);

          const frame = new THREE.Mesh(new THREE.BoxGeometry(0.78, 1.29, 0.02), woodMat);
          frame.position.set(ox, 1.75, mirrorZOffset - (isFacingSouth ? -0.01 : 0.01));
          group.add(frame);
        });

        // Wall-mounted stainless steel hand dryer
        const dryer = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.35, 0.18), chromeMat);
        dryer.position.set(width / 2 + 0.25, 1.30, 0);
        group.add(dryer);

        this.scene.add(group);
      };

      // Helper: Men's Commercial Vitreous China Urinals
      const buildUrinals = (zWall) => {
        [0.6, 2.0].forEach((ux) => {
          const uGroup = new THREE.Group();
          uGroup.position.set(ux, y0, zWall);

          // Urinal body
          const body = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.72, 0.32), porcelainMat);
          body.position.set(0, 0.76, -0.16);
          uGroup.add(body);

          // Rim contour
          const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.14, 0.30, 12), porcelainMat);
          rim.position.set(0, 0.65, -0.18);
          uGroup.add(rim);

          // Sloan chrome flushometer pipe & handle
          const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.40, 8), chromeMat);
          pipe.position.set(0, 1.30, -0.10);
          uGroup.add(pipe);

          const valve = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.08), chromeMat);
          valve.position.set(0, 1.30, -0.10);
          uGroup.add(valve);

          this.scene.add(uGroup);
        });

        // Urinal privacy screen partition between urinals
        const screen = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.20, 0.55), stallMat);
        screen.position.set(1.3, y0 + 1.10, zWall - 0.28);
        this.scene.add(screen);
      };

      // BUILD MEN'S RESTROOM (NORTH: z = -14.0 .. -10.0)
      // Stalls on West side
      buildStallBank(-13.8, -10.2, -12.0, -12.9, -11.1);
      // Vanity on North wall
      buildVanitySuite(1.4, -13.62, 2.8, -0.32, true);
      // Urinals on South divider wall
      buildUrinals(-10.05);

      // BUILD WOMEN'S RESTROOM (SOUTH: z = -10.0 .. -6.0)
      // Stalls on West side
      buildStallBank(-9.8, -6.2, -8.0, -8.9, -7.1);
      // Vanity on South wall
      buildVanitySuite(1.4, -6.38, 2.8, 0.32, false);

      // Colliders for Restrooms
      this.colliders.push(
        // Men's stalls & toilets
        { type: 'box', floor: fl, minX: -3.8, maxX: -1.75, minZ: -13.85, maxZ: -10.15 },
        // Men's vanity
        { type: 'box', floor: fl, minX: -0.1, maxX: 2.9, minZ: -14.0, maxZ: -13.2 },
        // Men's urinals
        { type: 'box', floor: fl, minX: 0.3, maxX: 2.3, minZ: -10.4, maxZ: -10.0 },
        // Women's stalls & toilets
        { type: 'box', floor: fl, minX: -3.8, maxX: -1.75, minZ: -9.85, maxZ: -6.15 },
        // Women's vanity
        { type: 'box', floor: fl, minX: -0.1, maxX: 2.9, minZ: -6.8, maxZ: -6.0 }
      );
    }

    createRealisticStudyRoom(fl, y0, mats) {
      const woodMat = mats.mahogany;
      const greenLampMat = new THREE.MeshPhongMaterial({ color: 0x065f46, specular: 0x6ee7b7, shininess: 80 });
      const brassMat = new THREE.MeshLambertMaterial({ color: 0xd4af37 });
      const paperMat = new THREE.MeshLambertMaterial({ color: 0xfef3c7 });
      const leatherChairMat = new THREE.MeshLambertMaterial({ color: 0x1c1917 });

      if (fl === 0 || fl === 2) {
        // 2 Double-Sided Study Carrels at z = -3.8 and z = -0.2
        [-3.8, -0.2].forEach((cz) => {
          const carrelGroup = new THREE.Group();
          carrelGroup.position.set(-0.6, y0, cz);

          const deskTop = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.08, 1.6), woodMat);
          deskTop.position.y = 0.76;
          carrelGroup.add(deskTop);

          const divider = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.55, 0.06), woodMat);
          divider.position.y = 1.05;
          carrelGroup.add(divider);

          [[-1.6, -0.7], [1.6, -0.7], [-1.6, 0.7], [1.6, 0.7]].forEach(([lx, lz]) => {
            const leg = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.74, 0.10), woodMat);
            leg.position.set(lx, 0.37, lz);
            carrelGroup.add(leg);
          });

          [-0.85, 0.85].forEach((ox) => {
            const lampBase = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.04, 8), brassMat);
            lampBase.position.set(ox, 0.82, 0);
            carrelGroup.add(lampBase);

            const lampShade = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.18, 8), greenLampMat);
            lampShade.position.set(ox, 1.05, 0);
            lampShade.rotation.z = Math.PI / 2;
            carrelGroup.add(lampShade);

            const book = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.03, 0.28), paperMat);
            book.position.set(ox, 0.81, 0.45);
            carrelGroup.add(book);
          });

          this.scene.add(carrelGroup);

          this.colliders.push({
            type: 'box',
            floor: fl,
            minX: -2.4,
            maxX: 1.2,
            minZ: cz - 0.85,
            maxZ: cz + 0.85
          });

          const bLight = new THREE.PointLight(0xffe8a3, 0.35, 3.8);
          bLight.position.set(-0.6, y0 + 1.2, cz);
          this.scene.add(bLight);
        });

        // West Wall Perimeter Bookcase (x = -3.55, z: -5.4..1.4)
        const wallBookshelf = new THREE.Mesh(new THREE.BoxGeometry(0.50, 3.4, 6.6), woodMat);
        wallBookshelf.position.set(-3.55, y0 + 1.7, -2.0);
        this.scene.add(wallBookshelf);

        this.colliders.push({
          type: 'box',
          floor: fl,
          minX: -3.8,
          maxX: -3.2,
          minZ: -5.4,
          maxZ: 1.4
        });

        // Card Catalog Cabinet
        const cardCatalog = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.3, 0.65), woodMat);
        cardCatalog.position.set(2.6, y0 + 0.65, 1.0);
        this.scene.add(cardCatalog);

        this.colliders.push({
          type: 'box',
          floor: fl,
          minX: 2.0,
          maxX: 3.2,
          minZ: 0.6,
          maxZ: 1.4
        });
      } else if (fl === 1) {
        // --- FLOOR 1: CALVIN COOLIDGE PRESIDENTIAL STUDY SUITE ---
        const presDesk = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.80, 1.8), woodMat);
        presDesk.position.set(-0.6, y0 + 0.40, -2.0);
        this.scene.add(presDesk);

        const blotter = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.02, 1.0), greenLampMat);
        blotter.position.set(-0.6, y0 + 0.81, -2.0);
        this.scene.add(blotter);

        const deskLamp = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.24, 8), brassMat);
        deskLamp.position.set(0.6, y0 + 0.94, -2.0);
        this.scene.add(deskLamp);

        const execChair = new THREE.Mesh(new THREE.BoxGeometry(0.70, 1.2, 0.70), leatherChairMat);
        execChair.position.set(-2.6, y0 + 0.60, -2.0);
        this.scene.add(execChair);

        this.colliders.push(
          { type: 'box', floor: fl, minX: -2.3, maxX: 1.1, minZ: -3.0, maxZ: -1.0 },
          { type: 'box', floor: fl, minX: -3.0, maxX: -2.2, minZ: -2.4, maxZ: -1.6 }
        );
      } else {
        // --- FLOOR 3: HISTORIC ARCHIVES & CURATOR VAULT ---
        const darkOakMat = mats.mahogany;
        const steelMat = new THREE.MeshLambertMaterial({ color: 0x334155 });
        const chromeMat = new THREE.MeshPhongMaterial({ color: 0xd1d5db, specular: 0xffffff, shininess: 120 });
        const paperMat = new THREE.MeshLambertMaterial({ color: 0xfef3c7 });

        // 1. Two 4-drawer heavy steel archival filing cabinets with modeled drawers & chrome pulls
        [-3.2, -0.8].forEach((cz) => {
          const cabGroup = new THREE.Group();
          cabGroup.position.set(-2.8, y0, cz);

          const cabBody = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.45, 0.65), steelMat);
          cabBody.position.y = 0.725;
          cabGroup.add(cabBody);

          for (let d = 0; d < 4; d++) {
            const dy = 0.20 + d * 0.35;
            const drawerFace = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.32, 0.02), steelMat);
            drawerFace.position.set(0, dy, 0.33);
            cabGroup.add(drawerFace);

            const pull = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.03, 0.03), chromeMat);
            pull.position.set(0, dy + 0.04, 0.35);
            cabGroup.add(pull);

            const labelSlot = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 0.01), paperMat);
            labelSlot.position.set(0, dy - 0.04, 0.34);
            cabGroup.add(labelSlot);
          }
          this.scene.add(cabGroup);
        });

        // 2. Curator Archive Desk with banker's lamp, ledger books, and chair
        const deskGroup = new THREE.Group();
        deskGroup.position.set(0.6, y0, -2.0);

        const deskTop = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.08, 1.3), darkOakMat);
        deskTop.position.y = 0.76;
        deskGroup.add(deskTop);

        [[-1.1, -0.55], [1.1, -0.55], [-1.1, 0.55], [1.1, 0.55]].forEach(([lx, lz]) => {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.72, 0.10), darkOakMat);
          leg.position.set(lx, 0.36, lz);
          deskGroup.add(leg);
        });

        // Open historic ledger books & map scrolls
        const ledger = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.04, 0.40), paperMat);
        ledger.position.set(-0.35, 0.82, 0.05);
        deskGroup.add(ledger);

        const scroll = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.65, 10), paperMat);
        scroll.position.set(0.45, 0.84, -0.25);
        scroll.rotation.z = Math.PI / 2;
        deskGroup.add(scroll);

        // Banker's lamp
        const bBase = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.03, 10), brassMat);
        bBase.position.set(0.70, 0.81, 0.35);
        deskGroup.add(bBase);

        const bShade = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.18, 8), greenLampMat);
        bShade.position.set(0.70, 1.05, 0.35);
        bShade.rotation.z = Math.PI / 2;
        deskGroup.add(bShade);

        // Warm reading lamp point light
        const deskLight = new THREE.PointLight(0xffdf88, 0.45, 4.5);
        deskLight.position.set(0.70, 1.15, 0.35);
        deskGroup.add(deskLight);

        this.scene.add(deskGroup);

        // 3. Wooden Archive Chair
        const chair = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.95, 0.65), darkOakMat);
        chair.position.set(0.6, y0 + 0.475, -0.9);
        this.scene.add(chair);

        this.colliders.push(
          { type: 'box', floor: fl, minX: -3.3, maxX: -2.3, minZ: -3.8, maxZ: -0.3 },
          { type: 'box', floor: fl, minX: -0.7, maxX: 1.9, minZ: -2.8, maxZ: -1.2 }
        );
      }
    }

    createRealisticMainStacks(fl, y0, mats) {
      if (fl < 3) {
        // --- DENSE 5-RANGE LIBRARY BOOKSTACKS (FLOORS 0, 1, 2) ---
        const rangeZCoords = [-20.0, -15.0, -10.0, -5.0, 0.0];
        const rangeH = 2.80;
        const rangeW = 12.0;
        const rangeD = 0.90;

        const shelfMat = mats.mahogany;

        rangeZCoords.forEach((rz, rIdx) => {
          const rangeGroup = new THREE.Group();
          rangeGroup.position.set(15.0, y0, rz);

          const stackCore = new THREE.Mesh(new THREE.BoxGeometry(rangeW, rangeH, rangeD), shelfMat);
          stackCore.position.y = rangeH / 2;
          rangeGroup.add(stackCore);

          [-rangeW / 2, rangeW / 2].forEach((ex) => {
            const endCap = new THREE.Mesh(new THREE.BoxGeometry(0.12, rangeH + 0.12, rangeD + 0.08), shelfMat);
            endCap.position.set(ex, (rangeH + 0.12) / 2, 0);
            rangeGroup.add(endCap);
          });

          const cornice = new THREE.Mesh(new THREE.BoxGeometry(rangeW + 0.24, 0.16, rangeD + 0.16), shelfMat);
          cornice.position.y = rangeH + 0.08;
          rangeGroup.add(cornice);

          this.scene.add(rangeGroup);

          this.colliders.push({
            type: 'box',
            floor: fl,
            minX: 15.0 - rangeW / 2 - 0.1,
            maxX: 15.0 + rangeW / 2 + 0.1,
            minZ: rz - rangeD / 2,
            maxZ: rz + rangeD / 2
          });

          const ladderX = rIdx % 2 === 0 ? 9.8 : 20.2;
          const ladder = new THREE.Mesh(new THREE.BoxGeometry(0.48, rangeH - 0.2, 0.12), shelfMat);
          ladder.position.set(ladderX, y0 + (rangeH - 0.2) / 2, rz + rangeD / 2 + 0.08);
          ladder.rotation.x = -0.15;
          this.scene.add(ladder);
        });

        // 2 Library Book Carts / Trolleys placed at aisle ends
        [[-17.5, 8.2], [-7.5, 21.8]].forEach(([cz, cx]) => {
          const cart = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.90, 0.55), mats.mahogany);
          cart.position.set(cx, y0 + 0.45, cz);
          this.scene.add(cart);

          this.colliders.push({
            type: 'box',
            floor: fl,
            minX: cx - 0.5,
            maxX: cx + 0.5,
            minZ: cz - 0.3,
            maxZ: cz + 0.3
          });
        });
      } else {
        // --- FLOOR 3: QUARANTINED STORAGE CRATES & CARGO PALLETS ---
        const crateCoords = [
          [11.0, -19.0, 2.4, 2.0, 2.4],
          [16.5, -19.0, 2.2, 1.8, 2.2],
          [19.5, -13.0, 2.6, 2.2, 2.6],
          [13.0, -11.0, 2.4, 1.6, 2.4],
          [17.0, -5.0, 2.8, 2.4, 2.8],
          [12.0, -3.0, 2.2, 1.9, 2.2],
          [15.5, 1.0, 2.5, 2.0, 2.5]
        ];
        crateCoords.forEach(([cx, cz, cw, ch, cd]) => {
          this.createStorageCrate(cx, y0, cz, cw, ch, cd, mats.mahogany, fl);
        });
      }
    }

    createCircularReferenceDesk(x, y, z, mat, floor) {
      const desk = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 1.1, 16), mat);
      desk.position.set(x, y + 0.57, z);
      this.scene.add(desk);

      this.colliders.push({
        type: 'cylinder',
        floor: floor,
        x: x,
        z: z,
        radius: 1.6
      });
    }

    createMuseumBench(x, y, z) {
      const benchGroup = new THREE.Group();
      benchGroup.position.set(x, y + 0.02, z);

      const leatherMat = new THREE.MeshLambertMaterial({ color: 0x181c24 });
      const woodMat = new THREE.MeshLambertMaterial({ color: 0x3d271d });
      const brassMat = new THREE.MeshLambertMaterial({ color: 0xc5a059 });

      // Beveled mahogany base plank
      const basePlank = new THREE.Mesh(new THREE.BoxGeometry(3.08, 0.08, 1.08), woodMat);
      basePlank.position.y = 0.40;
      benchGroup.add(basePlank);

      // Tufted leather seat cushion
      const seat = new THREE.Mesh(new THREE.BoxGeometry(2.96, 0.22, 0.96), leatherMat);
      seat.position.y = 0.54;
      benchGroup.add(seat);

      // 4 turned legs with brass ferrules
      const legOffsets = [[-1.25, -0.35], [1.25, -0.35], [-1.25, 0.35], [1.25, 0.35]];
      legOffsets.forEach(([lx, lz]) => {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.045, 0.38, 8), woodMat);
        leg.position.set(lx, 0.19, lz);
        benchGroup.add(leg);

        const ferrule = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.046, 0.08, 8), brassMat);
        ferrule.position.set(lx, 0.04, lz);
        benchGroup.add(ferrule);
      });

      this.scene.add(benchGroup);
    }

    createExhibitionPlinth(x, y, z, w, h, d, hasStanchions = false) {
      const group = new THREE.Group();
      group.position.set(x, y + 0.02, z);

      const stoneBaseMat = new THREE.MeshLambertMaterial({ color: 0x151922 });
      const plinthBodyMat = new THREE.MeshLambertMaterial({ color: 0x242c3a });
      const brassRevealMat = new THREE.MeshLambertMaterial({ color: 0xc5a059 });
      const velvetMat = new THREE.MeshLambertMaterial({ color: 0x22131b });

      // 1. Tiered Architectural Base (beveled foot)
      const baseH = 0.12;
      const baseMesh = new THREE.Mesh(new THREE.BoxGeometry(w + 0.16, baseH, d + 0.16), stoneBaseMat);
      baseMesh.position.y = baseH / 2;
      group.add(baseMesh);

      // 2. Main Museum Pedestal Column
      const bodyH = h - 0.22;
      const bodyMesh = new THREE.Mesh(new THREE.BoxGeometry(w, bodyH, d), plinthBodyMat);
      bodyMesh.position.y = baseH + bodyH / 2;
      group.add(bodyMesh);

      // 3. Polished Brass Reveal Trim Band
      const trimMesh = new THREE.Mesh(new THREE.BoxGeometry(w + 0.025, 0.035, d + 0.025), brassRevealMat);
      trimMesh.position.y = baseH + bodyH - 0.01;
      group.add(trimMesh);

      // 4. Crown Display Cap with recessed exhibition velvet pad
      const capH = 0.08;
      const capMesh = new THREE.Mesh(new THREE.BoxGeometry(w + 0.09, capH, d + 0.09), stoneBaseMat);
      capMesh.position.y = baseH + bodyH + capH / 2;
      group.add(capMesh);

      const padMesh = new THREE.Mesh(new THREE.BoxGeometry(w - 0.08, 0.015, d - 0.08), velvetMat);
      padMesh.position.y = baseH + bodyH + capH + 0.005;
      group.add(padMesh);

      this.scene.add(group);

      const fl = Math.round(y / CONFIG.FLOOR_HEIGHT);
      this.colliders.push({
        type: 'box',
        floor: fl,
        minX: x - w / 2,
        maxX: x + w / 2,
        minZ: z - d / 2,
        maxZ: z + d / 2
      });

      if (hasStanchions) {
        const brassMat = new THREE.MeshLambertMaterial({ color: 0xd4af37 });
        const ropeMat = new THREE.MeshLambertMaterial({ color: 0x6b1426 });
        const postOffsets = [
          [-w / 2 - 0.45, -d / 2 - 0.45],
          [w / 2 + 0.45, -d / 2 - 0.45],
          [-w / 2 - 0.45, d / 2 + 0.45],
          [w / 2 + 0.45, d / 2 + 0.45]
        ];
        postOffsets.forEach(([ox, oz]) => {
          const stBase = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.04, 12), brassMat);
          stBase.position.set(x + ox, y + 0.04, z + oz);
          this.scene.add(stBase);

          const post = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.95, 8), brassMat);
          post.position.set(x + ox, y + 0.50, z + oz);
          this.scene.add(post);

          const finial = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), brassMat);
          finial.position.set(x + ox, y + 0.99, z + oz);
          this.scene.add(finial);
        });

        const ropePairs = [
          [postOffsets[0], postOffsets[1]],
          [postOffsets[1], postOffsets[3]],
          [postOffsets[3], postOffsets[2]],
          [postOffsets[2], postOffsets[0]]
        ];
        ropePairs.forEach(([p1, p2]) => {
          const midX = x + (p1[0] + p2[0]) / 2;
          const midZ = z + (p1[1] + p2[1]) / 2;
          const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
          const angle = Math.atan2(p2[0] - p1[0], p2[1] - p1[1]);
          const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, len, 6), ropeMat);
          rope.position.set(midX, y + 0.82, midZ);
          rope.rotation.z = Math.PI / 2;
          rope.rotation.y = angle - Math.PI / 2;
          this.scene.add(rope);
        });
      }
    }

    createInfoDesk(x, y, z, mat) {
      const desk = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.1, 1.3), mat);
      desk.position.set(x, y + 0.57, z);
      this.scene.add(desk);

      const fl = Math.round(y / CONFIG.FLOOR_HEIGHT);
      this.colliders.push({
        type: 'box',
        floor: fl,
        minX: x - 1.4,
        maxX: x + 1.4,
        minZ: z - 0.65,
        maxZ: z + 0.65
      });
    }

    createStorageCrate(x, y, z, w, h, d, mat, floor) {
      const crate = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      crate.position.set(x, y + 0.02 + h / 2, z);
      this.scene.add(crate);

      this.colliders.push({
        type: 'box',
        floor: floor,
        minX: x - w / 2,
        maxX: x + w / 2,
        minZ: z - d / 2,
        maxZ: z + d / 2
      });
    }

    createExitDoors(x, y, z) {
      const group = new THREE.Group();
      group.position.set(x, y, z);

      const glassMat = new THREE.MeshLambertMaterial({
        color: 0x1e3a5f,
        transparent: true,
        opacity: 0.65
      });

      this.exitDoors = new THREE.Mesh(new THREE.BoxGeometry(4.8, 3.8, 0.18), glassMat);
      this.exitDoors.position.set(0, 1.9, 0);
      group.add(this.exitDoors);

      const lockMat = new THREE.MeshBasicMaterial({ color: 0x991b1b });
      this.exitLockMesh = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.18, 0.28), lockMat);
      this.exitLockMesh.position.set(0, 1.9, -0.15);
      group.add(this.exitLockMesh);

      this.scene.add(group);
      this.exitDoorCollider = { type: 'box', floor: 0, minX: x - 2.4, maxX: x + 2.4, minZ: z - 0.35, maxZ: z + 0.35 };
      this.colliders.push(this.exitDoorCollider);
    }

    populateCuratedArtworks(mats) {
      // Rich gilded walnut/gold frame material that stays warm and visible even with the flashlight off
      const frameMat = new THREE.MeshPhongMaterial({
        map: mats && mats.mahogany ? mats.mahogany.map : null,
        color: 0xc48f4a,
        emissive: 0x3a2510,
        specular: 0x665033,
        shininess: 38
      });
      const planeGeomCache = new Map();
      const hBarGeomCache = new Map();
      const vBarGeomCache = new Map();
      const plaqueGeom = new THREE.PlaneGeometry(0.85, 0.22);
      const border = 0.09;
      const depth = 0.05;

      CURATED_ARTWORKS.forEach((art) => {
        const group = new THREE.Group();
        const nx = Math.sin(art.rotY) * 0.06;
        const nz = Math.cos(art.rotY) * 0.06;
        group.position.set(art.x + nx, art.y, art.z + nz);
        group.rotation.y = art.rotY;

        const key = `${art.w}_${art.h}`;
        if (!planeGeomCache.has(key)) {
          planeGeomCache.set(key, new THREE.PlaneGeometry(art.w, art.h));
          hBarGeomCache.set(key, new THREE.BoxGeometry(art.w + border * 2, border, depth));
          vBarGeomCache.set(key, new THREE.BoxGeometry(border, art.h, depth));
        }

        // 4 non-overlapping perimeter molding bars (zero geometry behind the canvas -> zero Z-fighting!)
        const hBarGeom = hBarGeomCache.get(key);
        const vBarGeom = vBarGeomCache.get(key);

        const topBar = new THREE.Mesh(hBarGeom, frameMat);
        topBar.position.set(0, art.h / 2 + border / 2, 0);
        group.add(topBar);

        const botBar = new THREE.Mesh(hBarGeom, frameMat);
        botBar.position.set(0, -art.h / 2 - border / 2, 0);
        group.add(botBar);

        const leftBar = new THREE.Mesh(vBarGeom, frameMat);
        leftBar.position.set(-art.w / 2 - border / 2, 0, 0);
        group.add(leftBar);

        const rightBar = new THREE.Mesh(vBarGeom, frameMat);
        rightBar.position.set(art.w / 2 + border / 2, 0, 0);
        group.add(rightBar);

        const canvasMesh = new THREE.Mesh(
          planeGeomCache.get(key),
          new THREE.MeshLambertMaterial({
            color: 0xdedede,
            emissive: 0x000000,
            polygonOffset: true,
            polygonOffsetFactor: -2,
            polygonOffsetUnits: -2
          })
        );
        canvasMesh.position.z = 0.01;
        group.add(canvasMesh);

        this.texLoader.load(
          art.file,
          (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
            canvasMesh.material.map = tex;
            canvasMesh.material.needsUpdate = true;
          },
          undefined,
          () => {}
        );

        const plaqueTex = TextureFactory.createPlaqueTexture(art.title);
        const plaqueMesh = new THREE.Mesh(
          plaqueGeom,
          new THREE.MeshBasicMaterial({
            map: plaqueTex,
            polygonOffset: true,
            polygonOffsetFactor: -2,
            polygonOffsetUnits: -2
          })
        );
        plaqueMesh.position.set(0, -art.h / 2 - border - 0.14, 0.01);
        group.add(plaqueMesh);

        this.scene.add(group);

        this.paintings.push({
          id: art.id,
          title: art.title,
          file: art.file,
          wing: art.wing,
          x: art.x + nx,
          y: art.y,
          z: art.z + nz,
          floor: Math.floor(art.y / CONFIG.FLOOR_HEIGHT),
          mesh: group
        });
      });
    }

    // --- 3D MULTI-FLOOR NAVIGATION GRAPH (BFS/DIJKSTRA STALKER ROUTING) ---
    buildNavGraph() {
      this.navNodes = [];
      this.navAdj = [];

      const addNode = (x, y, z, floor, tag = '') => {
        const id = this.navNodes.length;
        this.navNodes.push({ id, x, y, z, floor, tag });
        this.navAdj.push([]);
        return id;
      };

      const connect = (a, b) => {
        const na = this.navNodes[a];
        const nb = this.navNodes[b];
        const dist = Math.hypot(na.x - nb.x, na.y - nb.y, na.z - nb.z);
        this.navAdj[a].push({ to: b, cost: dist });
        this.navAdj[b].push({ to: a, cost: dist });
      };

      const floorNodes = [];
      for (let fl = 0; fl < CONFIG.NUM_FLOORS; fl++) {
        const y = fl * CONFIG.FLOOR_HEIGHT;
        const fn = {};

        // 1. HOSMER GALLERY SPINE (x: -10, z: -16 to 26)
        fn.hosmer_n16 = addNode(-10.0, y, -16.0, fl, 'hosmer_n16');
        fn.hosmer_n10 = addNode(-10.0, y, -10.0, fl, 'hosmer_n10');
        fn.hosmer_n2  = addNode(-10.0, y,  -2.0, fl, 'hosmer_n2');
        fn.hosmer_p2  = addNode(-10.0, y,   2.0, fl, 'hosmer_p2');
        fn.hosmer_p6  = addNode(-10.0, y,   6.0, fl, 'hosmer_p6');
        fn.hosmer_p10 = addNode(-10.0, y,  10.0, fl, 'hosmer_p10');
        fn.hosmer_p14 = addNode(-10.0, y,  14.0, fl, 'hosmer_p14');
        fn.hosmer_p18 = addNode(-10.0, y,  18.0, fl, 'hosmer_p18');
        fn.hosmer_p22 = addNode(-10.0, y,  22.0, fl, 'hosmer_p22');
        fn.hosmer_p26 = addNode(-10.0, y,  26.0, fl, 'hosmer_p26');

        connect(fn.hosmer_n16, fn.hosmer_n10);
        connect(fn.hosmer_n10, fn.hosmer_n2);
        connect(fn.hosmer_n2,  fn.hosmer_p2);
        connect(fn.hosmer_p2,  fn.hosmer_p6);
        connect(fn.hosmer_p6,  fn.hosmer_p10);
        connect(fn.hosmer_p10, fn.hosmer_p14);
        connect(fn.hosmer_p14, fn.hosmer_p18);
        connect(fn.hosmer_p18, fn.hosmer_p22);
        connect(fn.hosmer_p22, fn.hosmer_p26);

        // 2. WEST WING (x: -36..-16, z: -6..18)
        // Three dedicated doorways into Hosmer with approach, portal, and inner nodes
        // Door North at z = -2.0
        fn.doorW_N_hos = addNode(-12.5, y, -2.0, fl, 'doorW_N_hos');
        fn.doorW_N_mid = addNode(-16.0, y, -2.0, fl, 'doorW_N_mid');
        fn.doorW_N_in  = addNode(-19.5, y, -2.0, fl, 'doorW_N_in');
        connect(fn.hosmer_n2, fn.doorW_N_hos);
        connect(fn.doorW_N_hos, fn.doorW_N_mid);
        connect(fn.doorW_N_mid, fn.doorW_N_in);

        // Door Center at z = 6.0
        fn.doorW_C_hos = addNode(-12.5, y, 6.0, fl, 'doorW_C_hos');
        fn.doorW_C_mid = addNode(-16.0, y, 6.0, fl, 'doorW_C_mid');
        fn.doorW_C_in  = addNode(-19.5, y, 6.0, fl, 'doorW_C_in');
        connect(fn.hosmer_p6, fn.doorW_C_hos);
        connect(fn.doorW_C_hos, fn.doorW_C_mid);
        connect(fn.doorW_C_mid, fn.doorW_C_in);

        // Door South at z = 14.0
        fn.doorW_S_hos = addNode(-12.5, y, 14.0, fl, 'doorW_S_hos');
        fn.doorW_S_mid = addNode(-16.0, y, 14.0, fl, 'doorW_S_mid');
        fn.doorW_S_in  = addNode(-19.5, y, 14.0, fl, 'doorW_S_in');
        connect(fn.hosmer_p14, fn.doorW_S_hos);
        connect(fn.doorW_S_hos, fn.doorW_S_mid);
        connect(fn.doorW_S_mid, fn.doorW_S_in);

        // West Wing Aisles: East Aisle (x = -20.5), Middle Plinth Cross (z = -3.5, 6, 15.5), Deep West Aisle (x = -32.0)
        fn.west_e_n3  = addNode(-20.5, y, -3.5, fl, 'west_e_n3');
        fn.west_e_p6  = addNode(-20.5, y,  6.0, fl, 'west_e_p6');
        fn.west_e_p15 = addNode(-20.5, y, 15.0, fl, 'west_e_p15');

        fn.west_w_n3  = addNode(-32.0, y, -3.5, fl, 'west_w_n3');
        fn.west_w_p6  = addNode(-32.0, y,  6.0, fl, 'west_w_p6');
        fn.west_w_p15 = addNode(-32.0, y, 15.0, fl, 'west_w_p15');

        // Intermediate nodes clear of plinths and bench
        fn.west_mid_n  = addNode(-26.0, y, -3.5, fl, 'west_mid_n');
        fn.west_mid_c1 = addNode(-26.0, y,  3.2, fl, 'west_mid_c1');
        fn.west_mid_c2 = addNode(-26.0, y,  8.8, fl, 'west_mid_c2');
        fn.west_mid_s  = addNode(-26.0, y, 15.5, fl, 'west_mid_s');

        connect(fn.doorW_N_in, fn.west_e_n3);
        connect(fn.doorW_C_in, fn.west_e_p6);
        connect(fn.doorW_S_in, fn.west_e_p15);

        connect(fn.west_e_n3, fn.west_e_p6);
        connect(fn.west_e_p6, fn.west_e_p15);

        connect(fn.west_w_n3, fn.west_w_p6);
        connect(fn.west_w_p6, fn.west_w_p15);

        connect(fn.west_e_n3, fn.west_mid_n);
        connect(fn.west_mid_n, fn.west_w_n3);

        connect(fn.west_e_p6, fn.west_mid_c1);
        connect(fn.west_mid_c1, fn.west_w_p6);
        connect(fn.west_e_p6, fn.west_mid_c2);
        connect(fn.west_mid_c2, fn.west_w_p6);

        connect(fn.west_e_p15, fn.west_mid_s);
        connect(fn.west_mid_s, fn.west_w_p15);

        // 3. COOLIDGE OFFICE (x: -34..-24, z: 18..28)
        // Door from West Wing at x = -30.0, z = 18.0
        fn.doorCool_w_n = addNode(-30.0, y, 16.0, fl, 'doorCool_w_n');
        fn.doorCool_w_m = addNode(-30.0, y, 18.0, fl, 'doorCool_w_m');
        fn.doorCool_w_s = addNode(-30.0, y, 20.0, fl, 'doorCool_w_s');
        connect(fn.west_w_p15, fn.doorCool_w_n);
        connect(fn.doorCool_w_n, fn.doorCool_w_m);
        connect(fn.doorCool_w_m, fn.doorCool_w_s);

        // Pathway inside office passes in front of desk at z = 21.0
        fn.coolOffice_front = addNode(-29.0, y, 21.0, fl, 'coolOffice_front');
        fn.coolOffice_side  = addNode(-26.0, y, 24.0, fl, 'coolOffice_side');
        connect(fn.doorCool_w_s, fn.coolOffice_front);
        connect(fn.coolOffice_front, fn.coolOffice_side);

        // Door between Coolidge Office and SW Stairwell at x = -24.0, z = 19.7
        fn.doorCool_st_w = addNode(-26.0, y, 19.7, fl, 'doorCool_st_w');
        fn.doorCool_st_m = addNode(-24.0, y, 19.7, fl, 'doorCool_st_m');
        fn.doorCool_st_e = addNode(-22.0, y, 19.7, fl, 'doorCool_st_e');
        connect(fn.coolOffice_front, fn.doorCool_st_w);
        connect(fn.doorCool_st_w, fn.doorCool_st_m);
        connect(fn.doorCool_st_m, fn.doorCool_st_e);

        // 4. SW STAIRWELL LANDING (x: -24..-16, z: 18..28)
        fn.stairSWLand = addNode(-20.0, y, 19.7, fl, 'stairSWLand');
        connect(fn.doorCool_st_e, fn.stairSWLand);

        // Door between SW Stairwell Landing and Hosmer at x = -16.0, z = 19.7
        fn.doorSW_hos_w = addNode(-18.0, y, 19.7, fl, 'doorSW_hos_w');
        fn.doorSW_hos_m = addNode(-16.0, y, 19.7, fl, 'doorSW_hos_m');
        fn.doorSW_hos_e = addNode(-13.5, y, 19.7, fl, 'doorSW_hos_e');
        connect(fn.stairSWLand, fn.doorSW_hos_w);
        connect(fn.doorSW_hos_w, fn.doorSW_hos_m);
        connect(fn.doorSW_hos_m, fn.doorSW_hos_e);
        connect(fn.doorSW_hos_e, fn.hosmer_p18);
        connect(fn.doorSW_hos_e, fn.hosmer_p22);

        // 5. STAIRWELL NORTH LANDING (x: -4..4, z: -26..-14)
        fn.stairNLand = addNode(0.0, y, -15.4, fl, 'stairNLand');

        // Door from Hosmer to Stairwell N at x = -4.0, z = -15.4
        fn.doorSN_hos_w = addNode(-7.0, y, -15.4, fl, 'doorSN_hos_w');
        fn.doorSN_hos_m = addNode(-4.0, y, -15.4, fl, 'doorSN_hos_m');
        fn.doorSN_hos_e = addNode(-1.8, y, -15.4, fl, 'doorSN_hos_e');
        connect(fn.hosmer_n16, fn.doorSN_hos_w);
        connect(fn.doorSN_hos_w, fn.doorSN_hos_m);
        connect(fn.doorSN_hos_m, fn.doorSN_hos_e);
        connect(fn.doorSN_hos_e, fn.stairNLand);

        // Door from Stairwell N to East Main Hall at x = 4.0, z = -15.4
        fn.doorSN_east_w = addNode(1.8, y, -15.4, fl, 'doorSN_east_w');
        fn.doorSN_east_m = addNode(4.0, y, -15.4, fl, 'doorSN_east_m');
        fn.doorSN_east_e = addNode(6.5, y, -15.4, fl, 'doorSN_east_e');
        connect(fn.stairNLand, fn.doorSN_east_w);
        connect(fn.doorSN_east_w, fn.doorSN_east_m);
        connect(fn.doorSN_east_m, fn.doorSN_east_e);

        // 6. CENTRAL CROSS-HALLWAY (x: -4..4, z: 2.5..7.5, center z = 5.0)
        fn.cross_w_hos = addNode(-6.5, y, 5.0, fl, 'cross_w_hos');
        fn.cross_w_mid = addNode(-4.0, y, 5.0, fl, 'cross_w_mid');
        fn.cross_center= addNode( 0.0, y, 5.0, fl, 'cross_center');
        fn.cross_e_mid = addNode( 4.0, y, 5.0, fl, 'cross_e_mid');
        fn.cross_e_east= addNode( 6.5, y, 5.0, fl, 'cross_e_east');
        connect(fn.hosmer_p6, fn.cross_w_hos);
        connect(fn.cross_w_hos, fn.cross_w_mid);
        connect(fn.cross_w_mid, fn.cross_center);
        connect(fn.cross_center, fn.cross_e_mid);
        connect(fn.cross_e_mid, fn.cross_e_east);

        // 7. SOUTH CROSS-PASSAGE (x: -4..4, z: 22.0)
        fn.crossS_w_hos = addNode(-6.5, y, 22.0, fl, 'crossS_w_hos');
        fn.crossS_w_mid = addNode(-4.0, y, 22.0, fl, 'crossS_w_mid');
        fn.crossS_center= addNode( 0.0, y, 22.0, fl, 'crossS_center');
        fn.crossS_e_mid = addNode( 4.0, y, 22.0, fl, 'crossS_e_mid');
        fn.crossS_e_se  = addNode( 6.5, y, 22.0, fl, 'crossS_e_se');
        connect(fn.hosmer_p22, fn.crossS_w_hos);
        connect(fn.crossS_w_hos, fn.crossS_w_mid);
        connect(fn.crossS_w_mid, fn.crossS_center);
        connect(fn.crossS_center, fn.crossS_e_mid);
        connect(fn.crossS_e_mid, fn.crossS_e_se);

        // 8. EAST MAIN HALL (x: 4..28, z: -26..18)
        // Bookstacks run from x = 8.9 to 21.1 at z = -20, -15, -10, -5, 0
        // West Aisle (x = 6.5) and East Aisle (x = 23.5) run continuously
        fn.east_w_n24 = addNode(6.5, y, -23.0, fl, 'east_w_n24');
        fn.east_w_n17 = addNode(6.5, y, -17.5, fl, 'east_w_n17');
        fn.east_w_n15 = fn.doorSN_east_e; // z = -15.4
        fn.east_w_n12 = addNode(6.5, y, -12.5, fl, 'east_w_n12');
        fn.east_w_n7  = addNode(6.5, y,  -7.5, fl, 'east_w_n7');
        fn.east_w_n2  = addNode(6.5, y,  -2.5, fl, 'east_w_n2');
        fn.east_w_p5  = fn.cross_e_east;  // z = 5.0
        fn.east_w_p10 = addNode(6.5, y,  10.0, fl, 'east_w_p10');
        fn.east_w_p15 = addNode(6.5, y,  15.0, fl, 'east_w_p15');

        connect(fn.east_w_n24, fn.east_w_n17);
        connect(fn.east_w_n17, fn.east_w_n15);
        connect(fn.east_w_n15, fn.east_w_n12);
        connect(fn.east_w_n12, fn.east_w_n7);
        connect(fn.east_w_n7,  fn.east_w_n2);
        connect(fn.east_w_n2,  fn.east_w_p5);
        connect(fn.east_w_p5,  fn.east_w_p10);
        connect(fn.east_w_p10, fn.east_w_p15);

        // East Aisle (x = 23.5)
        fn.east_e_n24 = addNode(23.5, y, -23.0, fl, 'east_e_n24');
        fn.east_e_n17 = addNode(23.5, y, -17.5, fl, 'east_e_n17');
        fn.east_e_n12 = addNode(23.5, y, -12.5, fl, 'east_e_n12');
        fn.east_e_n7  = addNode(23.5, y,  -7.5, fl, 'east_e_n7');
        fn.east_e_n2  = addNode(23.5, y,  -2.5, fl, 'east_e_n2');
        fn.east_e_p5  = addNode(23.5, y,   5.0, fl, 'east_e_p5');

        connect(fn.east_e_n24, fn.east_e_n17);
        connect(fn.east_e_n17, fn.east_e_n12);
        connect(fn.east_e_n12, fn.east_e_n7);
        connect(fn.east_e_n7,  fn.east_e_n2);
        connect(fn.east_e_n2,  fn.east_e_p5);

        // Transverse Aisles between bookstacks (connecting x = 6.5 to x = 23.5)
        connect(fn.east_w_n24, fn.east_e_n24);
        if (fl < 3) {
          connect(fn.east_w_n12, fn.east_e_n12);
          connect(fn.east_w_n2,  fn.east_e_n2);
        }
        connect(fn.east_w_p5,  fn.east_e_p5);

        // Center nodes in wide open southern area of East Hall (z = 10..15)
        fn.east_c_p10 = addNode(14.0, y, 10.0, fl, 'east_c_p10');
        fn.east_c_p15 = addNode(14.0, y, 15.0, fl, 'east_c_p15');
        connect(fn.east_w_p10, fn.east_c_p10);
        connect(fn.east_c_p10, fn.east_c_p15);
        connect(fn.east_w_p15, fn.east_c_p15);

        // 9. HAMPSHIRE ROOM (x: -4..28, z: -40..-26)
        // West Doorway at z = -26, x = 6.0
        fn.doorHamp_w_s = addNode(6.0, y, -23.0, fl, 'doorHamp_w_s');
        fn.doorHamp_w_m = addNode(6.0, y, -26.0, fl, 'doorHamp_w_m');
        fn.doorHamp_w_n = addNode(6.0, y, -29.0, fl, 'doorHamp_w_n');
        connect(fn.east_w_n24, fn.doorHamp_w_s);
        connect(fn.doorHamp_w_s, fn.doorHamp_w_m);
        connect(fn.doorHamp_w_m, fn.doorHamp_w_n);

        // East Doorway at z = -26, x = 18.2
        fn.doorHamp_e_s = addNode(18.2, y, -23.0, fl, 'doorHamp_e_s');
        fn.doorHamp_e_m = addNode(18.2, y, -26.0, fl, 'doorHamp_e_m');
        fn.doorHamp_e_n = addNode(18.2, y, -29.0, fl, 'doorHamp_e_n');
        connect(fn.east_e_n24, fn.doorHamp_e_s);
        connect(fn.doorHamp_e_s, fn.doorHamp_e_m);
        connect(fn.doorHamp_e_m, fn.doorHamp_e_n);

        // Hampshire Room Internal Grid
        fn.hamp_w_n33 = addNode( 2.0, y, -33.0, fl, 'hamp_w_n33');
        fn.hamp_c_n30 = addNode(12.0, y, -30.0, fl, 'hamp_c_n30');
        fn.hamp_c_n34 = addNode(12.0, y, -34.0, fl, 'hamp_c_n34');
        fn.hamp_e_n33 = addNode(22.0, y, -33.0, fl, 'hamp_e_n33');

        // Flanking the plinth at (12, -39) safely
        fn.hamp_plinth_w = addNode( 7.0, y, -39.0, fl, 'hamp_plinth_w');
        fn.hamp_plinth_e = addNode(17.0, y, -39.0, fl, 'hamp_plinth_e');

        connect(fn.doorHamp_w_n, fn.hamp_w_n33);
        connect(fn.doorHamp_w_n, fn.hamp_c_n30);
        connect(fn.doorHamp_e_n, fn.hamp_c_n30);
        connect(fn.doorHamp_e_n, fn.hamp_e_n33);

        connect(fn.hamp_w_n33, fn.hamp_c_n34);
        connect(fn.hamp_c_n30, fn.hamp_c_n34);
        connect(fn.hamp_e_n33, fn.hamp_c_n34);

        connect(fn.hamp_c_n34, fn.hamp_plinth_w);
        connect(fn.hamp_c_n34, fn.hamp_plinth_e);

        // Restrooms & Study Room (Central Core x: -4..4, z: -14..2)
        fn.doorMens_e      = addNode(4.0, y, -12.0, fl, 'doorMens_e');
        fn.mensRestroom_c  = addNode(2.0, y, -12.0, fl, 'mensRestroom_c');
        connect(fn.east_w_n12, fn.doorMens_e);
        connect(fn.doorMens_e, fn.mensRestroom_c);

        fn.doorWomens_e    = addNode(4.0, y, -8.0, fl, 'doorWomens_e');
        fn.womensRestroom_c= addNode(2.0, y, -8.0, fl, 'womensRestroom_c');
        connect(fn.east_w_n7, fn.doorWomens_e);
        connect(fn.doorWomens_e, fn.womensRestroom_c);

        if (fl < 3) {
          fn.doorStudy_e = addNode(4.0, y, -2.0, fl, 'doorStudy_e');
          fn.studyRoom_c = addNode(2.5, y, -2.0, fl, 'studyRoom_c');
          connect(fn.east_w_n2, fn.doorStudy_e);
          connect(fn.doorStudy_e, fn.studyRoom_c);
        }

        // 10. ARTS & MUSIC OFFICE (x: 19..33, z: 8..18)
        // Desk is at x: 26, z: 13
        // West Doorway at x = 19.0, z = 13.0
        fn.doorOff_w_out = addNode(16.0, y, 13.0, fl, 'doorOff_w_out');
        fn.doorOff_w_mid = addNode(19.0, y, 13.0, fl, 'doorOff_w_mid');
        fn.doorOff_w_in  = addNode(21.0, y, 13.0, fl, 'doorOff_w_in');
        connect(fn.east_c_p10, fn.doorOff_w_out);
        connect(fn.doorOff_w_out, fn.doorOff_w_mid);
        connect(fn.doorOff_w_mid, fn.doorOff_w_in);

        // Nodes flanking office desk (desk is at x: 26, z: 13)
        fn.artsOff_n = addNode(26.0, y, 10.5, fl, 'artsOff_n');
        fn.artsOff_e = addNode(29.5, y, 13.0, fl, 'artsOff_e');
        fn.artsOff_s = addNode(26.0, y, 15.5, fl, 'artsOff_s');
        connect(fn.doorOff_w_in, fn.artsOff_n);
        connect(fn.artsOff_n, fn.artsOff_e);
        connect(fn.artsOff_e, fn.artsOff_s);

        // South Doorway into SE Wing at z = 18.0, x = 23.0
        // Walk straight through doorway (z = 18.0 -> z = 19.2) before turning towards x = 19
        fn.doorOff_s_in  = addNode(22.0, y, 16.0, fl, 'doorOff_s_in');
        fn.doorOff_s_mid = addNode(23.0, y, 18.0, fl, 'doorOff_s_mid');
        fn.doorOff_s_ext = addNode(23.0, y, 19.2, fl, 'doorOff_s_ext');
        fn.doorOff_s_out = addNode(19.0, y, 19.5, fl, 'doorOff_s_out');
        connect(fn.doorOff_w_in, fn.doorOff_s_in);
        connect(fn.artsOff_s, fn.doorOff_s_in);
        connect(fn.doorOff_s_in, fn.doorOff_s_mid);
        connect(fn.doorOff_s_mid, fn.doorOff_s_ext);
        connect(fn.doorOff_s_ext, fn.doorOff_s_out);

        // 11. SOUTH-EAST WING (x: 4..28, z: 18..28) & ROTUNDA (z: 28..34)
        fn.se_w_p20 = addNode( 6.5, y, 20.0, fl, 'se_w_p20');
        fn.se_c_p20 = addNode(12.0, y, 20.0, fl, 'se_c_p20');
        fn.se_c_p23 = addNode(12.0, y, 23.0, fl, 'se_c_p23');

        connect(fn.east_w_p15, fn.se_w_p20);
        connect(fn.east_c_p15, fn.se_c_p20);
        connect(fn.se_w_p20, fn.crossS_e_se);
        connect(fn.se_w_p20, fn.se_c_p20);
        connect(fn.se_c_p20, fn.se_c_p23);
        connect(fn.crossS_e_se, fn.se_c_p23);

        connect(fn.doorOff_s_out, fn.se_c_p20);
        connect(fn.doorOff_s_out, fn.se_c_p23);

        // Rotunda entrance at z = 28.0 (Colonnade apse opening)
        fn.rot_approach = addNode(19.0, y, 26.5, fl, 'rot_approach');
        fn.rot_portal   = addNode(19.0, y, 28.5, fl, 'rot_portal');
        connect(fn.se_c_p23, fn.rot_approach);
        connect(fn.rot_approach, fn.rot_portal);

        // Flank the dais at (19, 30.5) safely
        fn.rot_flank_w  = addNode(16.5, y, 30.5, fl, 'rot_flank_w');
        fn.rot_flank_e  = addNode(21.5, y, 30.5, fl, 'rot_flank_e');
        fn.rot_in_front = addNode(19.0, y, 32.5, fl, 'rot_in_front');

        connect(fn.rot_portal, fn.rot_flank_w);
        connect(fn.rot_portal, fn.rot_flank_e);
        connect(fn.rot_flank_w, fn.rot_in_front);
        connect(fn.rot_flank_e, fn.rot_in_front);

        floorNodes.push(fn);
      }

      // Multi-floor Stairwell Connections
      for (let fl = 0; fl < CONFIG.NUM_FLOORS - 1; fl++) {
        const yMid = fl * CONFIG.FLOOR_HEIGHT + 2.6;
        // Stairwell N flights
        const nWestBase = addNode(-2.0, fl * CONFIG.FLOOR_HEIGHT, -15.4, fl, 'stairN_WBase');
        const nWestMid  = addNode(-2.0, yMid, -24.0, fl, 'stairN_WMid');
        const nEastMid  = addNode( 2.0, yMid, -24.0, fl + 1, 'stairN_EMid');
        const nEastBase = addNode( 2.0, (fl + 1) * CONFIG.FLOOR_HEIGHT, -15.4, fl + 1, 'stairN_EBase');

        connect(floorNodes[fl].stairNLand, nWestBase);
        connect(nWestBase, nWestMid);
        connect(nWestMid, nEastMid);
        connect(nEastMid, nEastBase);
        connect(nEastBase, floorNodes[fl + 1].stairNLand);

        // Stairwell SW flights
        const swWestBase = addNode(-22.0, fl * CONFIG.FLOOR_HEIGHT, 19.7, fl, 'stairSW_WBase');
        const swWestMid  = addNode(-22.0, yMid, 26.0, fl, 'stairSW_WMid');
        const swEastMid  = addNode(-18.0, yMid, 26.0, fl + 1, 'stairSW_EMid');
        const swEastBase = addNode(-18.0, (fl + 1) * CONFIG.FLOOR_HEIGHT, 19.7, fl + 1, 'stairSW_EBase');

        connect(floorNodes[fl].stairSWLand, swWestBase);
        connect(swWestBase, swWestMid);
        connect(swWestMid, swEastMid);
        connect(swEastMid, swEastBase);
        connect(swEastBase, floorNodes[fl + 1].stairSWLand);
      }
    }

    isInStairwell(pos) {
      if (!pos) return false;
      if (pos.x >= -4.2 && pos.x <= 4.2 && pos.z >= -26.5 && pos.z <= -13.5) return true;
      if (pos.x >= -24.5 && pos.x <= -15.5 && pos.z >= 17.5 && pos.z <= 28.5) return true;
      return false;
    }

    isNearStairwell(pos) {
      if (!pos) return false;
      if (pos.x >= -6.5 && pos.x <= 6.5 && pos.z >= -27.5 && pos.z <= -12.5) return true;
      if (pos.x >= -26.5 && pos.x <= -13.5 && pos.z >= 16.5 && pos.z <= 29.5) return true;
      return false;
    }

    findNearestNavNode(pos, floor) {
      let bestId = -1;
      let bestDist = Infinity;
      let fallbackId = -1;
      let fallbackDist = Infinity;

      // 1. Direct clear path with standard corridor clearance (0.12m margin)
      for (let i = 0; i < this.navNodes.length; i++) {
        const n = this.navNodes[i];
        if (n.floor !== floor) continue;
        const d = Math.hypot(pos.x - n.x, pos.z - n.z);
        if (d < bestDist && this.hasClearNavPath(pos, n, floor, 0.12)) {
          bestDist = d;
          bestId = i;
        }
      }
      if (bestId !== -1) return bestId;

      // 2. Direct line of sight without box expansion (margin = 0) so Smitty near a wall finds nodes in his room
      for (let i = 0; i < this.navNodes.length; i++) {
        const n = this.navNodes[i];
        if (n.floor !== floor) continue;
        const d = Math.hypot(pos.x - n.x, pos.z - n.z);
        if (d < bestDist && this.hasClearNavPath(pos, n, floor, 0.0)) {
          bestDist = d;
          bestId = i;
        }
      }
      if (bestId !== -1) return bestId;

      // 3. Fallback to closest node on same floor
      for (let i = 0; i < this.navNodes.length; i++) {
        const n = this.navNodes[i];
        if (n.floor !== floor) continue;
        const d = Math.hypot(pos.x - n.x, pos.z - n.z);
        if (d < fallbackDist) {
          fallbackDist = d;
          fallbackId = i;
        }
      }
      return fallbackId !== -1 ? fallbackId : 0;
    }

    findShortestPath(startId, goalId) {
      if (startId === goalId) return [this.navNodes[goalId]];
      const nCount = this.navNodes.length;
      const dist = new Float32Array(nCount).fill(Infinity);
      const prev = new Int32Array(nCount).fill(-1);
      const visited = new Uint8Array(nCount);

      dist[startId] = 0;

      for (let step = 0; step < nCount; step++) {
        let u = -1;
        let best = Infinity;
        for (let i = 0; i < nCount; i++) {
          if (!visited[i] && dist[i] < best) {
            best = dist[i];
            u = i;
          }
        }
        if (u === -1 || u === goalId) break;
        visited[u] = 1;

        const edges = this.navAdj[u];
        for (let e = 0; e < edges.length; e++) {
          const { to, cost } = edges[e];
          if (dist[u] + cost < dist[to]) {
            dist[to] = dist[u] + cost;
            prev[to] = u;
          }
        }
      }

      if (prev[goalId] === -1 && startId !== goalId) {
        return [this.navNodes[goalId]];
      }

      const path = [];
      let curr = goalId;
      while (curr !== -1) {
        path.push(this.navNodes[curr]);
        if (curr === startId) break;
        curr = prev[curr];
      }
      path.reverse();
      return path;
    }

    findNextStepNode(startId, goalId) {
      const path = this.findShortestPath(startId, goalId);
      return path.length > 1 ? path[1] : path[0];
    }

    hasClearNavPath(fromPos, toPos, floor, margin = 0.25) {
      const x0 = fromPos.x;
      const z0 = fromPos.z;
      const x1 = toPos.x;
      const z1 = toPos.z;

      for (let i = 0; i < this.colliders.length; i++) {
        const c = this.colliders[i];
        if (c.floor !== 'all' && c.floor !== floor) continue;
        if (c.type === 'box') {
          const bMinX = c.minX - margin;
          const bMaxX = c.maxX + margin;
          const bMinZ = c.minZ - margin;
          const bMaxZ = c.maxZ + margin;

          const inMarginX = (x0 >= bMinX && x0 <= bMaxX);
          const inMarginZ = (z0 >= bMinZ && z0 <= bMaxZ);
          if (inMarginX && inMarginZ) {
            // Origin is touching/near this wall. If line actually hits solid box, it is blocked.
            if (lineIntersectsBox(x0, z0, x1, z1, c.minX, c.maxX, c.minZ, c.maxZ)) {
              return false;
            }
            // Check if ray is moving closer to this box center
            const cMidX = (c.minX + c.maxX) * 0.5;
            const cMidZ = (c.minZ + c.maxZ) * 0.5;
            const d0 = Math.hypot(x0 - cMidX, z0 - cMidZ);
            const d1 = Math.hypot(x1 - cMidX, z1 - cMidZ);
            if (d1 < d0 && lineIntersectsBox(x0, z0, x1, z1, bMinX, bMaxX, bMinZ, bMaxZ)) {
              return false;
            }
          } else {
            if (lineIntersectsBox(x0, z0, x1, z1, bMinX, bMaxX, bMinZ, bMaxZ)) {
              return false;
            }
          }
        } else if (c.type === 'cylinder') {
          const cx = c.x, cz = c.z, r = c.radius + margin;
          const dx = x1 - x0, dz = z1 - z0;
          const lenSq = dx * dx + dz * dz;
          let u = 0;
          if (lenSq > 0.0001) {
            u = Math.max(0, Math.min(1, ((cx - x0) * dx + (cz - z0) * dz) / lenSq));
          }
          const closeX = x0 + u * dx;
          const closeZ = z0 + u * dz;
          if (Math.hypot(cx - closeX, cz - closeZ) < r) {
            return false;
          }
        }
      }
      return true;
    }

    buildWeaponViewmodel() {
      this.weaponRig = new THREE.Group();
      this.weaponRig.position.set(0.24, -0.29, -0.40);
      this.camera.add(this.weaponRig);

      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');
      const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
      grad.addColorStop(0, 'rgba(255, 240, 180, 1)');
      grad.addColorStop(0.3, 'rgba(255, 140, 20, 0.8)');
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 64, 64);

      const flashTex = new THREE.CanvasTexture(canvas);
      this.muzzleFlash = new THREE.Mesh(
        new THREE.PlaneGeometry(0.24, 0.24),
        new THREE.MeshBasicMaterial({ map: flashTex, transparent: true, opacity: 0 })
      );
      this.muzzleFlash.position.set(0.035, 0.22, -0.11);
      this.weaponRig.add(this.muzzleFlash);

      // Asynchronously load PlayerHand 3D viewmodel
      const loader = new THREE.GLTFLoader();
      const assetCacheKey = window._ASSET_VERSION || Date.now();
      loader.load(`assets/PlayerHand.glb?v=${assetCacheKey}`, (gltf) => {
        this.weaponHandMesh = gltf.scene;
        this.weaponHandMesh.rotation.set(-0.76, -0.16, -0.12);
        this.weaponHandMesh.scale.set(0.34, 0.34, 0.34);
        this.weaponHandMesh.position.set(0.04, -0.05, 0.04);
        this.weaponHandMesh.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = false;
            child.receiveShadow = false;
            child.frustumCulled = false;
            if (child.material) {
              child.material.depthTest = true;
              child.material.side = THREE.FrontSide;
            }
          }
        });
        this.weaponRig.add(this.weaponHandMesh);
      }, undefined, (err) => {
        console.warn('Could not load assets/PlayerHand.glb, attempting fallback:', err);
      });
    }

    buildLeftHandViewmodel() {
      this.leftArmRig = new THREE.Group();
      this.leftArmRig.position.set(-0.32, -0.28, -0.41);
      this.camera.add(this.leftArmRig);

      const loader = new THREE.GLTFLoader();
      const assetCacheKey = window._ASSET_VERSION || Date.now();
      loader.load(`assets/LeftHand.glb?v=${assetCacheKey}`, (gltf) => {
        this.leftHandMesh = gltf.scene;
        this.leftHandMesh.rotation.set(-0.48, 3.02, 0.04);
        this.leftHandMesh.scale.set(0.34, 0.34, 0.34);
        this.leftHandMesh.position.set(-0.03, -0.04, 0.03);
        this.leftHandMesh.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = false;
            child.receiveShadow = false;
            child.frustumCulled = false;
            if (child.material) {
              child.material.depthTest = true;
              child.material.side = THREE.FrontSide;
            }
          }
        });
        this.leftArmRig.add(this.leftHandMesh);
      }, undefined, (err) => {
        console.warn('Could not load assets/LeftHand.glb, attempting fallback:', err);
      });
    }

    triggerLeftHandGrab() {
      this.leftHandGrabTimer = 0.55;
      this.leftHandGrabDuration = 0.55;
    }

    spawnRelics() {
      const H = CONFIG.FLOOR_HEIGHT;

      const RELIC_TYPES = [
        { id: 1, file: 'assets/relics/AsceticSebring.glb', defaultName: 'Ascetic Sebring', color: 0xd946ef },
        { id: 2, file: 'assets/relics/BlackNose.glb', defaultName: 'Black Nose', color: 0xef4444 },
        { id: 3, file: 'assets/relics/ChickenLeg.glb', defaultName: 'Chicken Leg', color: 0xf59e0b },
        { id: 4, file: 'assets/relics/FighterBoots.glb', defaultName: 'Fighter Boots', color: 0x38bdf8 },
        { id: 5, file: 'assets/relics/HarbingersBoot.glb', defaultName: "Harbinger's Boot", color: 0xfacc15 },
        { id: 6, file: 'assets/relics/MonaLisa.glb', defaultName: 'Mona Lisa', color: 0x34d399 },
        { id: 7, file: 'assets/relics/PlushMonkey.glb', defaultName: 'Plush Monkey', color: 0xfb923c },
        { id: 8, file: 'assets/relics/R3E4ActionFigure.glb', defaultName: 'R3E4 Action Figure', color: 0xa855f7 },
        { id: 9, file: 'assets/relics/Scorpion.glb', defaultName: 'Scorpion', color: 0x6b6d4 },
        { id: 10, file: 'assets/relics/ShreffloHelm.glb', defaultName: 'Shrefflo Helm', color: 0xeab308 },
        { id: 11, file: 'assets/relics/SmittyDoll.glb', defaultName: 'Smitty Doll', color: 0x94a3b8 },
        { id: 12, file: 'assets/relics/Snake.glb', defaultName: 'Snake', color: 0x10b981 },
        { id: 13, file: 'assets/relics/StoneTablet.glb', defaultName: 'Stone Tablet', color: 0x38bdf8 },
        { id: 14, file: 'assets/relics/VictoryBust.glb', defaultName: 'Victory Bust', color: 0xf43f5e }
      ];

      // Dynamically set total relics to always accommodate any number of relics in the folder
      CONFIG.TOTAL_RELICS = RELIC_TYPES.length;

      // 24 Authentic Pedestal, Display Plinth, and Desk locations across the 4 museum floors
      const SPAWN_AREAS = [
        // Floor 0
        { floor: 0, x: -26, z: 0, baseY: 0 * H + 1.38 },
        { floor: 0, x: -26, z: 12, baseY: 0 * H + 1.38 },
        { floor: 0, x: -29, z: 24, baseY: 0 * H + 1.38 },
        { floor: 0, x: 19, z: 30.5, baseY: 0 * H + 1.38 },
        { floor: 0, x: 12, z: -39, baseY: 0 * H + 1.38 },
        { floor: 0, x: 26, z: 13, baseY: 0 * H + 1.38 },
        // Floor 1
        { floor: 1, x: -26, z: 0, baseY: 1 * H + 1.38 },
        { floor: 1, x: -26, z: 12, baseY: 1 * H + 1.38 },
        { floor: 1, x: -29, z: 24, baseY: 1 * H + 1.38 },
        { floor: 1, x: 19, z: 30.5, baseY: 1 * H + 1.38 },
        { floor: 1, x: 12, z: -39, baseY: 1 * H + 1.38 },
        { floor: 1, x: 26, z: 13, baseY: 1 * H + 1.38 },
        // Floor 2
        { floor: 2, x: -26, z: 0, baseY: 2 * H + 1.38 },
        { floor: 2, x: -26, z: 12, baseY: 2 * H + 1.38 },
        { floor: 2, x: -29, z: 24, baseY: 2 * H + 1.38 },
        { floor: 2, x: 19, z: 30.5, baseY: 2 * H + 1.38 },
        { floor: 2, x: 12, z: -39, baseY: 2 * H + 1.38 },
        { floor: 2, x: 26, z: 13, baseY: 2 * H + 1.38 },
        // Floor 3
        { floor: 3, x: -26, z: 0, baseY: 3 * H + 1.38 },
        { floor: 3, x: -26, z: 12, baseY: 3 * H + 1.38 },
        { floor: 3, x: -29, z: 24, baseY: 3 * H + 1.38 },
        { floor: 3, x: 19, z: 30.5, baseY: 3 * H + 1.38 },
        { floor: 3, x: 12, z: -39, baseY: 3 * H + 1.38 },
        { floor: 3, x: 26, z: 13, baseY: 3 * H + 1.38 }
      ];

      // Randomize which relic appears at which area on every playthrough
      const shuffledAreas = [...SPAWN_AREAS];
      for (let i = shuffledAreas.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffledAreas[i], shuffledAreas[j]] = [shuffledAreas[j], shuffledAreas[i]];
      }

      this.gltfLoader = this.gltfLoader || new THREE.GLTFLoader();
      this.relics = [];

      RELIC_TYPES.forEach((type, idx) => {
        const loc = shuffledAreas[idx];
        const relicName = T(`relic.${type.id}.name`, type.defaultName);

        const group = new THREE.Group();
        group.position.set(loc.x, loc.baseY, loc.z);

        // Soft ambient glow illuminating the relic and casting onto the plinth
        // Kept directly in scene with constant visibility so Three.js shader light count never changes
        const glowLight = new THREE.PointLight(type.color, (loc.floor === this.playerFloor) ? 0.45 : 0, 3.5);
        glowLight.position.set(loc.x, loc.baseY + 0.35, loc.z);
        this.scene.add(glowLight);

        // Immediate glowing crystal placeholder while GLB loads
        const placeholderMat = new THREE.MeshLambertMaterial({
          color: type.color,
          emissive: type.color,
          emissiveIntensity: 0.4
        });
        const placeholder = new THREE.Mesh(new THREE.OctahedronGeometry(0.20, 0), placeholderMat);
        placeholder.position.y = 0.25;
        group.add(placeholder);

        group.visible = (loc.floor === this.playerFloor);
        this.scene.add(group);

        const relicEntry = {
          id: type.id,
          name: relicName,
          mesh: group,
          glowLight: glowLight,
          x: loc.x,
          y: loc.baseY,
          z: loc.z,
          floor: loc.floor,
          collected: false
        };
        this.relics.push(relicEntry);

        // Update the Map & Objectives checklist for this relic (hidden as "Undiscovered" initially)
        const itemEl = document.getElementById(`relic-item-${type.id}`);
        if (itemEl) {
          itemEl.innerHTML = `<span class="relic-num">${type.id}.</span> <span class="relic-name">${T('relic.undiscovered', 'Undiscovered')}</span>`;
        }

        // Asynchronously load the 3D relic model
        const relicCacheKey = window._ASSET_VERSION || Date.now();
        this.gltfLoader.load(
          `${type.file}?v=${relicCacheKey}`,
          (gltf) => {
            if (relicEntry.collected) return;

            const model = gltf.scene;
            model.updateMatrixWorld(true);

            // Compute exact bounding box
            const box = new THREE.Box3().setFromObject(model);
            const size = new THREE.Vector3();
            box.getSize(size);
            const center = new THREE.Vector3();
            box.getCenter(center);

            const maxAxis = Math.max(size.x, size.y, size.z) || 1.0;
            const targetDim = 0.55; // 55cm uniform display scale
            const scale = targetDim / maxAxis;
            model.scale.set(scale, scale, scale);

            // Center horizontally (X=0, Z=0) and align lowest vertex exactly to local Y=0
            model.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);

            model.traverse((child) => {
              if (child.isMesh) {
                child.frustumCulled = true;
                if (child.geometry) {
                  child.geometry.computeBoundingSphere();
                }
                const oldMat = child.material;
                if (oldMat) {
                  // Replace heavy Cook-Torrance PBR MeshStandardMaterial (which forces
                  // expensive dFdx/dFdy screen-space tangent derivatives and multi-light
                  // GGX specular math across 500k-1.5M triangles) with a high-performance
                  // MeshPhongMaterial. Preserves the exact 4K photogrammetry texture map,
                  // geometry normals, and crisp museum specular highlights at 60 FPS locked
                  // without modifying a single vertex of the pristine 3D scans.
                  const optMat = new THREE.MeshPhongMaterial({
                    map: oldMat.map || null,
                    color: oldMat.color || 0xffffff,
                    specular: 0x333333,
                    shininess: 28,
                    side: THREE.FrontSide,
                    flatShading: false
                  });
                  if (optMat.map) {
                    optMat.map.generateMipmaps = true;
                    optMat.map.minFilter = THREE.LinearMipmapLinearFilter;
                    optMat.map.magFilter = THREE.LinearFilter;
                  }
                  child.material = optMat;
                }
                child.matrixAutoUpdate = false;
                child.updateMatrix();
              }
            });
            model.matrixAutoUpdate = false;
            model.updateMatrix();

            // Swap out placeholder mesh for the real 3D scan
            if (placeholder.parent) {
              group.remove(placeholder);
            }
            group.add(model);
          },
          undefined,
          (err) => {
            console.warn(`Could not load relic model ${type.file}, keeping fallback:`, err);
          }
        );
      });

      this.buildRelicChecklist();
    }

    buildRelicChecklist() {
      const list = document.getElementById('relic-checklist');
      if (list) {
        list.innerHTML = '';
        this.relics.forEach((relic) => {
          const li = document.createElement('li');
          li.id = `relic-item-${relic.id}`;
          if (relic.collected) {
            li.classList.add('completed');
            li.innerHTML = `<span class="relic-num">${relic.id}.</span> <span class="relic-name">${relic.name}</span>`;
          } else {
            li.innerHTML = `<span class="relic-num">${relic.id}.</span> <span class="relic-name">${T('relic.undiscovered', 'Undiscovered')}</span>`;
          }
          list.appendChild(li);
        });
      }

      const mapSub = document.getElementById('map-subtitle') || document.querySelector('.checklist-sub');
      if (mapSub) {
        mapSub.textContent = T('map.subtitle', `Recover all ${CONFIG.TOTAL_RELICS} relics to unlock the main door:`, { total: CONFIG.TOTAL_RELICS });
      }
    }

    updateRelicFloorVisibility() {
      for (let r of this.relics) {
        const show = (!r.collected && r.floor === this.playerFloor);
        if (r.mesh) {
          r.mesh.visible = show;
        }
        if (r.glowLight) {
          r.glowLight.intensity = show ? 0.45 : 0;
        }
      }
      for (let p of this.ammoPickups) {
        const show = (p.active && p.floor === this.playerFloor);
        if (p.mesh) {
          p.mesh.visible = show;
        }
        if (p.glowLight) {
          p.glowLight.intensity = show ? 0.55 : 0;
        }
      }
    }

    spawnAmmoPickups() {
      const H = CONFIG.FLOOR_HEIGHT;
      this.ammoPickups = [];

      // Exactly 1 floating rotating ammo pickup per level in the museum (Floors 0, 1, 2, 3)
      const AMMO_LOCS = [
        { floor: 0, x: 6.5, z: -10.0, baseY: 0 * H + 1.15 },
        { floor: 1, x: -21.0, z: 6.0, baseY: 1 * H + 1.15 },
        { floor: 2, x: 12.0, z: -35.0, baseY: 2 * H + 1.15 },
        { floor: 3, x: -10.0, z: 14.0, baseY: 3 * H + 1.15 }
      ];

      const boxMat = new THREE.MeshLambertMaterial({ color: 0x364832 }); // Tactical olive drab
      const lidMat = new THREE.MeshLambertMaterial({ color: 0x222e20 });
      const latchMat = new THREE.MeshLambertMaterial({ color: 0x1a202c });
      const brassMat = new THREE.MeshLambertMaterial({ color: 0xdfb15b }); // Brass cartridges

      AMMO_LOCS.forEach((loc, idx) => {
        const group = new THREE.Group();
        group.position.set(loc.x, loc.baseY, loc.z);

        // Ammunition can body
        const canBody = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.18, 0.16), boxMat);
        group.add(canBody);

        // Canister lid
        const canLid = new THREE.Mesh(new THREE.BoxGeometry(0.33, 0.035, 0.17), lidMat);
        canLid.position.y = 0.10;
        group.add(canLid);

        // Side carry latch
        const latch = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.08, 0.03), latchMat);
        latch.position.set(0.165, 0.02, 0);
        group.add(latch);

        // Two bright 9mm brass cartridges floating above the tin
        const round1 = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.07, 8), brassMat);
        round1.position.set(-0.06, 0.18, 0);
        round1.rotation.z = Math.PI / 6;
        group.add(round1);

        const round2 = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.07, 8), brassMat);
        round2.position.set(0.06, 0.18, 0);
        round2.rotation.z = -Math.PI / 6;
        group.add(round2);

        // Warm amber tactical glow kept directly in scene with constant visibility so Three.js shader light count never changes
        const glow = new THREE.PointLight(0xf59e0b, (loc.floor === this.playerFloor) ? 0.55 : 0, 3.2);
        glow.position.set(loc.x, loc.baseY + 0.22, loc.z);
        this.scene.add(glow);

        group.visible = (loc.floor === this.playerFloor);
        this.scene.add(group);

        this.ammoPickups.push({
          id: idx + 1,
          floor: loc.floor,
          x: loc.x,
          y: loc.baseY,
          z: loc.z,
          mesh: group,
          glowLight: glow,
          active: true,
          respawnTimer: 0
        });
      });
    }

    updateAmmoPickups(delta) {
      const time = performance.now() * 0.002;
      for (let p of this.ammoPickups) {
        if (p.active) {
          // Floating rotation and gentle bobbing
          p.mesh.rotation.y += delta * 1.4;
          p.mesh.position.y = p.y + Math.sin(time * 2.2 + p.id) * 0.08;
          // Only show pickup when on current floor
          const sameFloor = (p.floor === this.playerFloor);
          p.mesh.visible = sameFloor;
          if (p.glowLight) p.glowLight.intensity = sameFloor ? 0.55 : 0;
        } else {
          if (p.glowLight) p.glowLight.intensity = 0;
          // 3-minute respawn countdown (180s)
          p.respawnTimer -= delta;
          if (p.respawnTimer <= 0) {
            p.active = true;
            const sameFloor = (p.floor === this.playerFloor);
            p.mesh.visible = sameFloor;
            if (p.glowLight) p.glowLight.intensity = sameFloor ? 0.55 : 0;
          }
        }
      }
    }

    collectAmmoPickup(pickup) {
      if (!pickup.active) return;
      pickup.active = false;
      pickup.mesh.visible = false;
      if (pickup.glowLight) pickup.glowLight.intensity = 0;
      pickup.respawnTimer = CONFIG.AMMO_PICKUP.RESPAWN_TIME; // 180 seconds = 3 minutes

      this.reserveAmmo += CONFIG.AMMO_PICKUP.AMMO_AMOUNT;
      this.triggerLeftHandGrab();
      this.updateHud();
      this.audio.playReloadSound();
      this.dom.interactPrompt.classList.add('hidden');
    }

    async loadSmittyModel() {
      try {
        const smittyCacheKey = window._ASSET_VERSION || Date.now();
        const res = await fetch(`assets/smitty.glb?v=${smittyCacheKey}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buffer = await res.arrayBuffer();

        const loader = new THREE.GLTFLoader();
        loader.parse(
          buffer,
          '',
          (gltf) => {
            this.smittyMesh = gltf.scene;
            this.smittyMesh.position.copy(this.smittyPos);
            this.smittyMesh.position.y += 0.05;
            this.smittyMesh.visible = (this.smittyFloor === this.playerFloor);
            this.smittyMesh.scale.set(1.2, 1.2, 1.2);

            this.smittyBones = {};
            this.smittyMesh.traverse((child) => {
              if (child.isMesh) {
                if (child.geometry) {
                  child.geometry.computeBoundingSphere();
                  if (child.geometry.boundingSphere) {
                    child.geometry.boundingSphere.radius *= 1.6;
                  }
                }
                child.frustumCulled = true;
                if (child.material) {
                  const optimizeMat = (m) => {
                    const cloned = m.clone();
                    cloned.side = THREE.FrontSide;
                    return cloned;
                  };
                  if (Array.isArray(child.material)) {
                    child.material = child.material.map(optimizeMat);
                  } else {
                    child.material = optimizeMat(child.material);
                  }
                }
              }
              if (child.isBone) {
                this.smittyBones[child.name] = child;
              }
            });

            this.scene.add(this.smittyMesh);

            this.smittyMixer = new THREE.AnimationMixer(this.smittyMesh);
            gltf.animations.forEach((clip) => {
              const action = this.smittyMixer.clipAction(clip);
              const lower = clip.name.toLowerCase();
              if (lower.includes('walk')) this.smittyActions['Walk'] = action;
              else if (lower.includes('run')) this.smittyActions['Run'] = action;
              else if (lower.includes('jump') || lower.includes('attack')) this.smittyActions['Attack'] = action;
              else if (lower.includes('dance')) this.smittyActions['Dance'] = action;
              else if (lower.includes('idle')) this.smittyActions['Idle'] = action;
            });

            // Set Smitty to walk animation as he peruses toward his first patrol room
            this.playSmittyAnimation('Walk');
            this.pickNextPatrolNode();
          },
          (err) => console.error('Smitty parse error:', err)
        );
      } catch (e) {
        console.error('Failed to load Smitty GLB:', e);
      }
    }

    randomizeSmittySpawn() {
      // Pick a random room on upper floors (Floor 1, 2, or 3) so player isn't ambushed at start
      const upperNodes = this.navNodes.filter(
        (n) => n.floor >= 1 && !n.tag.includes('Mid') && !n.tag.includes('Stair') && !n.tag.includes('stair')
      );
      const pool = upperNodes.length > 0 ? upperNodes : this.navNodes;
      const spawnNode = pool[Math.floor(Math.random() * pool.length)];
      this.smittyFloor = spawnNode.floor;
      this.smittyPos.set(spawnNode.x, spawnNode.floor * CONFIG.FLOOR_HEIGHT, spawnNode.z);
      this.smittyStairState = { active: null, baseFloor: spawnNode.floor };
      if (this.smittyMesh) {
        this.smittyMesh.position.copy(this.smittyPos);
        this.smittyMesh.position.y += 0.05;
        this.smittyMesh.visible = (this.smittyFloor === this.playerFloor);
      }
      this.pickNextPatrolNode();
    }

    playSmittyAnimation(name, duration = 0.25) {
      if (!this.smittyActions[name] || this.currentActionName === name) return;
      const prev = this.smittyActions[this.currentActionName];
      const next = this.smittyActions[name];

      next.reset();
      next.setEffectiveTimeScale(1);
      next.setEffectiveWeight(1);
      next.play();

      if (prev && prev !== next) prev.crossFadeTo(next, duration, false);
      this.currentActionName = name;
    }

    pickNextPatrolNode() {
      // Pick an exhibition hall, office, rotunda, or gallery room on or adjacent to Smitty's current floor
      const roomNodes = this.navNodes.filter(
        (n) => !n.tag.includes('Mid') && !n.tag.includes('Stair') && !n.tag.includes('stair') &&
               !n.tag.includes('door') && !n.tag.includes('portal') && !n.tag.includes('Base') &&
               !n.tag.includes('ext')
      );
      let candidates = roomNodes.filter((n) => n.floor === this.smittyFloor);
      if (Math.random() < 0.35 || candidates.length === 0) {
        candidates = roomNodes.filter((n) => Math.abs(n.floor - this.smittyFloor) <= 1);
      }
      const pool = candidates.length > 0 ? candidates : roomNodes;
      const chosen = pool[Math.floor(Math.random() * pool.length)];
      this.smittyPatrolGoalNode = chosen.id;
      this.smittyPath = [];
      this.smittyPathIndex = 0;
      this.smittyPathGoalId = chosen.id;
    }

    requestNativeOrBrowserLock() {
      if (!this.gameStarted || this.isExaminingArt || this.isPaused || this.isGameOver || this.isVictory) return;
      document.body.classList.add('game-playing');
      try {
        if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.pointerLock) {
          window.webkit.messageHandlers.pointerLock.postMessage(true);
        }
      } catch (e) {}
      try {
        const el = this.canvas || document.body;
        if (el && el.requestPointerLock) {
          const p = el.requestPointerLock();
          if (p && typeof p.catch === 'function') p.catch(() => {});
        }
      } catch (e) {}
    }

    releaseNativeOrBrowserLock() {
      document.body.classList.remove('game-playing');
      this.lastClientX = null;
      this.lastClientY = null;
      try {
        if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.pointerLock) {
          window.webkit.messageHandlers.pointerLock.postMessage(false);
        }
      } catch (e) {}
      try {
        if (document.exitPointerLock) document.exitPointerLock();
      } catch (e) {}
    }

    applyMouseLook(rawMx, rawMy) {
      if (!this.gameStarted || this.isPaused || this.isGameOver || this.isVictory || this.isExaminingArt) return;
      const maxDelta = 85;
      const mx = Math.max(-maxDelta, Math.min(maxDelta, rawMx));
      const my = Math.max(-maxDelta, Math.min(maxDelta, rawMy));

      let sens = CONFIG.PLAYER.MOUSE_SENS;
      if (this.isAiming) sens *= 0.52;

      this.playerYaw -= mx * sens;
      this.playerPitch -= my * sens;
      this.playerPitch = Math.max(-1.42, Math.min(1.42, this.playerPitch));
    }

    setupEventListeners() {
      window._onNativeLockChange = (locked) => {
        this.isNativeLocked = !!locked;
        this.lastClientX = null;
        this.lastClientY = null;
        this.skipNextMouseMove = true;
      };

      window._onNativeMouseLook = (dx, dy) => {
        this.applyMouseLook(dx, dy);
      };

      this.dom.startBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.dom.startScreen.classList.add('hidden');
        this.gameStarted = true;
        this.startTime = Date.now();
        this.audio.init();
        this.showFloorNotification(this.playerFloor);
        this.requestNativeOrBrowserLock();
      });

      this.dom.resumeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.dom.pauseModal.classList.add('hidden');
        this.isPaused = false;
        this.requestNativeOrBrowserLock();
      });

      this.dom.artCloseBtn.addEventListener('click', () => {
        this.closeArtModal();
      });

      window.addEventListener('click', () => {
        if (this.gameStarted && !this.isExaminingArt && !this.isPaused && !this.isGameOver && !this.isVictory) {
          this.requestNativeOrBrowserLock();
        }
      });

      const restart = () => {
        this.releaseNativeOrBrowserLock();
        window.location.reload();
      };
      this.dom.restartBtn.addEventListener('click', restart);
      this.dom.winRestartBtn.addEventListener('click', restart);

      const onLockChange = () => {
        this.isPointerLocked = !!(document.pointerLockElement === this.canvas || document.pointerLockElement);
        this.lastClientX = null;
        this.lastClientY = null;
        this.skipNextMouseMove = true;
      };

      document.addEventListener('pointerlockchange', onLockChange);
      document.addEventListener('mozpointerlockchange', onLockChange);
      document.addEventListener('webkitpointerlockchange', onLockChange);
      document.addEventListener('pointerlockerror', () => {
        this.isPointerLocked = false;
        this.lastClientX = null;
        this.lastClientY = null;
      });

      window.addEventListener('mouseleave', () => {
        this.lastClientX = null;
        this.lastClientY = null;
      });

      window.addEventListener('blur', () => {
        this.lastClientX = null;
        this.lastClientY = null;
      });

      window.addEventListener('mousemove', (e) => {
        if (!this.gameStarted || this.isPaused || this.isGameOver || this.isVictory || this.isExaminingArt) {
          this.lastClientX = null;
          this.lastClientY = null;
          return;
        }

        if (this.isNativeLocked) return;

        if (this.skipNextMouseMove) {
          this.skipNextMouseMove = false;
          this.lastClientX = e.clientX;
          this.lastClientY = e.clientY;
          return;
        }

        let rawMx = 0;
        let rawMy = 0;

        if (this.isPointerLocked) {
          rawMx = e.movementX ?? e.mozMovementX ?? e.webkitMovementX ?? 0;
          rawMy = e.movementY ?? e.mozMovementY ?? e.webkitMovementY ?? 0;
          if (rawMx === 0 && rawMy === 0 && this.lastClientX !== null && this.lastClientY !== null) {
            rawMx = e.clientX - this.lastClientX;
            rawMy = e.clientY - this.lastClientY;
          }
        } else {
          if (this.lastClientX !== null && this.lastClientY !== null) {
            rawMx = e.clientX - this.lastClientX;
            rawMy = e.clientY - this.lastClientY;
          } else if (e.movementX !== undefined && (e.movementX !== 0 || e.movementY !== 0)) {
            rawMx = e.movementX;
            rawMy = e.movementY;
          }
        }

        this.lastClientX = e.clientX;
        this.lastClientY = e.clientY;
        this.applyMouseLook(rawMx, rawMy);
      });

      window.addEventListener('mousedown', (e) => {
        if (!this.gameStarted || this.isPaused || this.isGameOver || this.isVictory || this.isExaminingArt) return;
        this.requestNativeOrBrowserLock();

        if (e.button === 0) {
          this.shootPistol();
        } else if (e.button === 2) {
          this.isAiming = true;
        }
      });

      window.addEventListener('mouseup', (e) => {
        if (e.button === 2) {
          this.isAiming = false;
        }
      });

      window.addEventListener('contextmenu', (e) => e.preventDefault());

      window.addEventListener('keydown', (e) => {
        const isCmdOrCtrl = e.metaKey || e.ctrlKey;
        const isKeyN = (e.code === 'KeyN' || (e.key && e.key.toLowerCase() === 'n'));

        // Spectator Mode toggle: Command + N / Ctrl + N
        if (isCmdOrCtrl && isKeyN) {
          e.preventDefault();
          if (this.gameStarted) {
            this.toggleSpectatorMode();
          }
          return;
        }

        // No-Clip Mode toggle: pressing 'N' while in Spectator Mode
        if (this.isSpectatorMode && !isCmdOrCtrl && isKeyN) {
          e.preventDefault();
          if (this.gameStarted) {
            this.toggleNoClipMode();
          }
          return;
        }

        if (!e.metaKey) {
          e.preventDefault();
        }
        this.keys[e.code] = true;
        if (e.repeat) return;

        if (e.code === 'KeyP') {
          if (this.gameStarted) this.togglePause();
        } else if (e.code === 'Tab') {
          if (this.gameStarted) {
            this.drawFloorplanMinimap();
            this.dom.objModal.classList.remove('hidden');
          }
        } else if (e.code === 'KeyF') {
          if (this.gameStarted) this.toggleFlashlight();
        } else if (e.code === 'KeyR') {
          if (this.gameStarted) this.reloadPistol();
        } else if (e.code === 'KeyE') {
          if (this.isExaminingArt) {
            this.closeArtModal();
          } else if (this.gameStarted) {
            this.interact();
          }
        } else if (e.code === 'Escape') {
          if (this.isExaminingArt) {
            this.closeArtModal();
          } else if (this.gameStarted) {
            this.togglePause();
          }
        }
      });

      window.addEventListener('keypress', (e) => {
        if (!e.metaKey) e.preventDefault();
      });

      window.addEventListener('keyup', (e) => {
        if (!e.metaKey) e.preventDefault();
        this.keys[e.code] = false;
        if (e.code === 'Tab') {
          this.dom.objModal.classList.add('hidden');
        }
      });

      window.addEventListener('resize', () => {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
      });
    }

    drawFloorplanMinimap() {
      this.buildRelicChecklist();
      const cvs = this.dom.floorplanCanvas;
      if (!cvs) return;
      const ctx = cvs.getContext('2d');
      const W = cvs.width;
      const H = cvs.height;

      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#080b12';
      ctx.fillRect(0, 0, W, H);

      const mapX = (wx) => ((wx + 38) / 74) * (W - 24) + 12;
      const mapZ = (wz) => ((wz + 44) / 80) * (H - 24) + 12;

      // Draw museum blueprint rooms (clean geometry without room label clutter)
      const drawRoomBox = (x0, z0, x1, z1, label, isStair = false) => {
        const px0 = mapX(x0);
        const pz0 = mapZ(z0);
        const pw = mapX(x1) - px0;
        const ph = mapZ(z1) - pz0;

        ctx.fillStyle = isStair ? 'rgba(56, 189, 248, 0.14)' : 'rgba(30, 41, 59, 0.55)';
        ctx.fillRect(px0, pz0, pw, ph);
        ctx.strokeStyle = isStair ? '#38bdf8' : 'rgba(148, 163, 184, 0.45)';
        ctx.lineWidth = 1.2;
        ctx.strokeRect(px0, pz0, pw, ph);
      };

      drawRoomBox(-36, -6, -16, 18, T('map.label.west_museum', 'WEST MUSEUM'));
      drawRoomBox(-34, 18, -24, 28, T('map.label.west_office', 'OFFICE'));
      drawRoomBox(-24, 18, -16, 28, T('map.label.stair_a', 'STAIR A'), true);
      drawRoomBox(-16, -18, -4, 28, T('map.label.hosmer_gallery', 'HOSMER GALLERY'));
      drawRoomBox(-4, -26, 4, -14, T('map.label.stair_b', 'STAIR B'), true);
      drawRoomBox(-4, -14, 4, 2, T('map.label.study_wc', 'STUDY/WC'));
      drawRoomBox(-4, -40, 28, -26, T('map.label.hampshire_room', 'HAMPSHIRE ROOM'));
      drawRoomBox(4, -26, 28, 18, T('map.label.arts_music_stacks', 'ARTS & MUSIC STACKS'));
      drawRoomBox(19, 8, 33, 18, T('map.label.east_office', 'OFFICE'));
      drawRoomBox(4, 18, 28, 28, T('map.label.media_wing', 'MEDIA WING'));

      // Draw uncollected relics on current floor (bright gold) or other floors (dimmed)
      this.relics.forEach((r) => {
        if (r.collected) return;
        const rx = mapX(r.x);
        const rz = mapZ(r.z);
        ctx.beginPath();
        ctx.arc(rx, rz, r.floor === this.playerFloor ? 4.5 : 2.8, 0, Math.PI * 2);
        ctx.fillStyle = r.floor === this.playerFloor ? '#facc15' : 'rgba(250, 204, 21, 0.35)';
        ctx.fill();
      });

      // Draw Player position & view cone
      const px = mapX(this.playerPos.x);
      const pz = mapZ(this.playerPos.z);
      ctx.beginPath();
      ctx.arc(px, pz, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = '#34d399';
      ctx.fill();

      ctx.strokeStyle = '#34d399';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(px, pz);
      ctx.lineTo(px - Math.sin(this.playerYaw) * 11, pz - Math.cos(this.playerYaw) * 11);
      ctx.stroke();

      // Floor badge
      ctx.fillStyle = '#e2e8f0';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(T('map.current_level', 'CURRENT LEVEL: FLOOR {number} OF 4', { number: this.playerFloor + 1 }), 14, 22);
    }

    togglePause() {
      this.isPaused = !this.isPaused;
      if (this.isPaused) {
        this.releaseNativeOrBrowserLock();
        this.dom.pauseModal.classList.remove('hidden');
      } else {
        this.dom.pauseModal.classList.add('hidden');
        this.requestNativeOrBrowserLock();
      }
    }

    toggleFlashlight() {
      this.flashlightOn = !this.flashlightOn;
      this.flashlight.intensity = this.flashlightOn ? 1.65 : 0;
      this.audio.playFlashlightClick();
    }

    openArtModal(painting) {
      this.isExaminingArt = true;
      this.releaseNativeOrBrowserLock();
      this.dom.artModalImg.src = painting.file;
      this.dom.artModalTitle.textContent = painting.title;
      this.dom.artModalWing.textContent = painting.wing;
      this.dom.artModal.classList.remove('hidden');
    }

    closeArtModal() {
      this.isExaminingArt = false;
      this.dom.artModal.classList.add('hidden');
      this.requestNativeOrBrowserLock();
    }

    interact() {
      // 1. Check Relics
      for (let relic of this.relics) {
        if (relic.collected || relic.floor !== this.playerFloor) continue;
        const d = Math.hypot(this.playerPos.x - relic.x, this.playerPos.z - relic.z);
        if (d < 3.2) {
          relic.collected = true;
          if (relic.mesh) {
            relic.mesh.visible = false;
          }
          if (relic.glowLight) {
            relic.glowLight.intensity = 0;
          }
          this.relicsCollected++;
          this.triggerLeftHandGrab();
          this.audio.playRelicChime();
          this.showRelicNotification();
          this.setInteractPrompt(null);

          this.alertSmittySound(relic, relic.floor, 17.5);

          const itemEl = document.getElementById(`relic-item-${relic.id}`);
          if (itemEl) {
            itemEl.classList.add('completed');
            itemEl.innerHTML = `<span class="relic-num">${relic.id}.</span> <span class="relic-name">${relic.name}</span>`;
          }

          if (this.relicsCollected >= CONFIG.TOTAL_RELICS) {
            this.unsealExitDoors();
          }
          this.updateHud();
          return;
        }
      }

      // 2. Check Ammo Pickups
      for (let pickup of this.ammoPickups) {
        if (!pickup.active || pickup.floor !== this.playerFloor) continue;
        const d = Math.hypot(this.playerPos.x - pickup.x, this.playerPos.z - pickup.z);
        if (d < 2.5) {
          this.collectAmmoPickup(pickup);
          return;
        }
      }

      // 3. Check Paintings
      if (this.focusedPainting) {
        this.openArtModal(this.focusedPainting);
        return;
      }
    }

    unsealExitDoors() {
      this.exitUnlocked = true;
      this.audio.playLockdownDisengaged();

      if (this.exitDoors) {
        this.exitDoors.rotation.y = -Math.PI / 2.2;
        this.exitDoors.position.x = -2.2;
      }
      if (this.exitLockMesh) {
        this.exitLockMesh.position.y = -10;
      }
      if (this.exitDoorCollider) {
        this.exitDoorCollider.minX = 0;
        this.exitDoorCollider.maxX = 0;
      }

      this.dom.roomIndicator.textContent = T('hud.exit_unlocked', 'LOCKDOWN DISENGAGED — FLEE TO 1ST FLOOR SOUTH EXIT!');
      this.dom.roomIndicator.style.color = '#34d399';
    }

    updatePlayer(delta) {
      if (!this.gameStarted || this.isGameOver || this.isVictory || this.isPaused || this.isExaminingArt) return;

      if (this.isNoClipMode) {
        // Garry's Mod style 3D free flight
        const wantsBoost = !!(this.keys['ShiftLeft'] || this.keys['ShiftRight']);
        const flySpeed = wantsBoost ? 26.0 : 12.0;

        const cosPitch = Math.cos(this.playerPitch);
        const sinPitch = Math.sin(this.playerPitch);
        const cosYaw = Math.cos(this.playerYaw);
        const sinYaw = Math.sin(this.playerYaw);

        // 3D forward vector matching camera gaze:
        const fwdX = -sinYaw * cosPitch;
        const fwdY = sinPitch;
        const fwdZ = -cosYaw * cosPitch;

        // Horizontal strafe vector:
        const rgtX = cosYaw;
        const rgtZ = -sinYaw;

        let moveX = 0;
        let moveY = 0;
        let moveZ = 0;

        if (this.keys['KeyW'] || this.keys['ArrowUp']) {
          moveX += fwdX;
          moveY += fwdY;
          moveZ += fwdZ;
        }
        if (this.keys['KeyS'] || this.keys['ArrowDown']) {
          moveX -= fwdX;
          moveY -= fwdY;
          moveZ -= fwdZ;
        }
        if (this.keys['KeyD'] || this.keys['ArrowRight']) {
          moveX += rgtX;
          moveZ += rgtZ;
        }
        if (this.keys['KeyA'] || this.keys['ArrowLeft']) {
          moveX -= rgtX;
          moveZ -= rgtZ;
        }
        // Vertical world elevation (Space = ascend, C/Ctrl = descend)
        if (this.keys['Space']) {
          moveY += 1.0;
        }
        if (this.keys['KeyC'] || this.keys['ControlLeft'] || this.keys['ControlRight']) {
          moveY -= 1.0;
        }

        const moveLen = Math.hypot(moveX, moveY, moveZ);
        if (moveLen > 0.001) {
          this.playerPos.x += (moveX / moveLen) * flySpeed * delta;
          this.playerPos.y += (moveY / moveLen) * flySpeed * delta;
          this.playerPos.z += (moveZ / moveLen) * flySpeed * delta;
        }

        // Keep inside reasonable museum altitude bounds (-1m floor 0 to 22m roof level)
        this.playerPos.y = Math.max(-1.0, Math.min(22.0, this.playerPos.y));

        const approxFloor = Math.max(0, Math.min(CONFIG.NUM_FLOORS - 1, Math.round((this.playerPos.y - CONFIG.PLAYER.CAMERA_HEIGHT) / CONFIG.FLOOR_HEIGHT)));
        if (approxFloor !== this.playerFloor) {
          this.playerFloor = approxFloor;
          this.showFloorNotification(this.playerFloor);
        }

        this.camera.position.set(this.playerPos.x, this.playerPos.y, this.playerPos.z);
        this.camera.rotation.set(this.playerPitch, this.playerYaw, 0, 'YXZ');

        this.flashlightTarget.position.set(
          this.camera.position.x - Math.sin(this.playerYaw) * 10,
          this.camera.position.y + Math.tan(this.playerPitch) * 10,
          this.camera.position.z - Math.cos(this.playerYaw) * 10
        );

        this.updateWeaponViewmodel(delta, moveLen > 0.001);
        this.updateLeftHandViewmodel(delta, moveLen > 0.001);
        this.updateHud();
        return;
      }

      const isCrouching = !!(this.keys['ControlLeft'] || this.keys['ControlRight']);
      this.isCrouching = isCrouching;

      const wantsSprint = (this.keys['ShiftLeft'] || this.keys['ShiftRight']) && !isCrouching;
      if (wantsSprint && this.stamina > 5) {
        this.isSprinting = true;
        this.stamina = Math.max(0, this.stamina - delta * 22);
      } else {
        this.isSprinting = false;
        this.stamina = Math.min(CONFIG.PLAYER.MAX_STAMINA, this.stamina + delta * 16);
      }

      const moveSpeed = isCrouching
        ? CONFIG.PLAYER.CROUCH_SPEED
        : (this.isSprinting ? CONFIG.PLAYER.SPRINT_SPEED : CONFIG.PLAYER.WALK_SPEED);

      _tempForward.set(-Math.sin(this.playerYaw), 0, -Math.cos(this.playerYaw));
      _tempRight.set(Math.cos(this.playerYaw), 0, -Math.sin(this.playerYaw));
      _tempMoveDir.set(0, 0, 0);

      if (this.keys['KeyW'] || this.keys['ArrowUp']) _tempMoveDir.add(_tempForward);
      if (this.keys['KeyS'] || this.keys['ArrowDown']) _tempMoveDir.sub(_tempForward);
      if (this.keys['KeyD'] || this.keys['ArrowRight']) _tempMoveDir.add(_tempRight);
      if (this.keys['KeyA'] || this.keys['ArrowLeft']) _tempMoveDir.sub(_tempRight);

      const oldPx = this.playerPos.x;
      const oldPz = this.playerPos.z;

      const isMoving = _tempMoveDir.lengthSq() > 0.001;
      if (isMoving) {
        _tempMoveDir.normalize();

        const subSteps = 2;
        const stepDt = delta / subSteps;
        for (let s = 0; s < subSteps; s++) {
          this.playerPos.x += _tempMoveDir.x * moveSpeed * stepDt;
          this.playerPos.z += _tempMoveDir.z * moveSpeed * stepDt;
          this.resolveCollisions(this.playerPos, CONFIG.PLAYER.RADIUS, this.playerFloor);
        }

        if (delta > 0.0001) {
          this.playerVelocity.set((this.playerPos.x - oldPx) / delta, 0, (this.playerPos.z - oldPz) / delta);
        } else {
          this.playerVelocity.set(0, 0, 0);
        }

        const bobRate = isCrouching ? 6.5 : (this.isSprinting ? 14 : 9.5);
        this.headBobTimer += delta * bobRate;
        this.footstepTimer += delta * bobRate;

        if (this.footstepTimer > Math.PI) {
          this.footstepTimer = 0;
          this.audio.playMarbleFootstep();

          // Sneaking in crouch produces only 1.1m noise vs 4.4m walk vs 14.6m sprint
          const noiseRange = isCrouching ? 1.1 : (this.isSprinting ? 14.6 : 4.4);
          this.alertSmittySound(this.playerPos, this.playerFloor, noiseRange);
        }
      } else {
        this.playerVelocity.set(0, 0, 0);
      }

      // Jump mechanics (Space)
      const wantsJump = !!this.keys['Space'];
      if (wantsJump && this.isGrounded && !isCrouching) {
        this.jumpVelocity = CONFIG.PLAYER.JUMP_FORCE;
        this.isGrounded = false;
        this.audio.playMarbleFootstep();
      }

      if (!this.isGrounded) {
        this.jumpVelocity -= CONFIG.PLAYER.GRAVITY * delta;
        this.jumpOffset += this.jumpVelocity * delta;
        if (this.jumpOffset <= 0) {
          this.jumpOffset = 0;
          this.jumpVelocity = 0;
          this.isGrounded = true;
        }
      }

      const elev = this.updateStairwellElevation(this.playerPos, this.playerStairState, this.playerFloor);
      if (elev.floor !== this.playerFloor) {
        this.playerFloor = elev.floor;
        this.showFloorNotification(this.playerFloor);
      } else {
        this.playerFloor = elev.floor;
      }

      const targetEyeH = isCrouching ? CONFIG.PLAYER.CROUCH_HEIGHT : CONFIG.PLAYER.CAMERA_HEIGHT;
      this.currentCamHeight = THREE.MathUtils.lerp(this.currentCamHeight, targetEyeH, Math.min(1, delta * 12));

      const targetCamY = elev.y + this.currentCamHeight;
      if (this.isFalling) {
        this.fallVelocity = (this.fallVelocity || 0) + CONFIG.PLAYER.GRAVITY * 1.5 * delta;
        this.playerPos.y -= this.fallVelocity * delta;
        if (this.playerPos.y <= targetCamY) {
          this.playerPos.y = targetCamY;
          this.fallVelocity = 0;
          this.isFalling = false;
          this.isGrounded = true;
          this.audio.playMarbleFootstep();
        }
      } else {
        this.playerPos.y = THREE.MathUtils.lerp(this.playerPos.y, targetCamY, Math.min(1, delta * 14));
      }

      this.trackCurrentRoom();
      this.updateInteractionPrompt();

      if (this.exitUnlocked && this.playerFloor === 0 && this.playerPos.z > 27.3 && Math.abs(this.playerPos.x + 10.0) < 2.6) {
        this.triggerVictory();
      }

      const bobAmp = isCrouching ? 0.010 : (this.isSprinting ? 0.035 : 0.018);
      const bobY = isMoving ? Math.sin(this.headBobTimer) * bobAmp : 0;
      this.camera.position.set(this.playerPos.x, this.playerPos.y + bobY + this.jumpOffset, this.playerPos.z);
      this.camera.rotation.set(this.playerPitch, this.playerYaw, 0, 'YXZ');

      this.flashlightTarget.position.set(
        this.camera.position.x - Math.sin(this.playerYaw) * 10,
        this.camera.position.y + Math.tan(this.playerPitch) * 10,
        this.camera.position.z - Math.cos(this.playerYaw) * 10
      );

      this.updateWeaponViewmodel(delta, isMoving);
      this.updateLeftHandViewmodel(delta, isMoving);
      this.updateHud();
    }

    resolveCollisions(pos, radius, floorIdx) {
      for (let iter = 0; iter < 3; iter++) {
        for (let i = 0; i < this.colliders.length; i++) {
          const c = this.colliders[i];
          if (c.floor !== 'all' && c.floor !== floorIdx) continue;

          if (c.type === 'box') {
            if (c.minX === c.maxX || c.minZ === c.maxZ) continue;
            const closestX = Math.max(c.minX, Math.min(pos.x, c.maxX));
            const closestZ = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
            const dx = pos.x - closestX;
            const dz = pos.z - closestZ;
            const distSq = dx * dx + dz * dz;

            if (distSq === 0) {
              const penLeft = pos.x - c.minX;
              const penRight = c.maxX - pos.x;
              const penTop = pos.z - c.minZ;
              const penBottom = c.maxZ - pos.z;
              const minPen = Math.min(penLeft, penRight, penTop, penBottom);
              if (minPen === penLeft) pos.x = c.minX - radius;
              else if (minPen === penRight) pos.x = c.maxX + radius;
              else if (minPen === penTop) pos.z = c.minZ - radius;
              else pos.z = c.maxZ + radius;
            } else if (distSq < radius * radius) {
              const dist = Math.sqrt(distSq);
              const overlap = radius - dist;
              pos.x += (dx / dist) * overlap;
              pos.z += (dz / dist) * overlap;
            }
          } else if (c.type === 'cylinder') {
            const dx = pos.x - c.x;
            const dz = pos.z - c.z;
            const rTotal = radius + c.radius;
            const distSq = dx * dx + dz * dz;

            if (distSq < rTotal * rTotal && distSq > 0.000001) {
              const dist = Math.sqrt(distSq);
              const overlap = rTotal - dist;
              pos.x += (dx / dist) * overlap;
              pos.z += (dz / dist) * overlap;
            }
          }
        }
      }
    }

    setInteractPrompt(text) {
      if (text) {
        if (this._currentPromptText !== text) {
          this.dom.interactPrompt.textContent = text;
          this._currentPromptText = text;
        }
        if (this.dom.interactPrompt.classList.contains('hidden')) {
          this.dom.interactPrompt.classList.remove('hidden');
        }
      } else {
        if (!this.dom.interactPrompt.classList.contains('hidden')) {
          this.dom.interactPrompt.classList.add('hidden');
          this._currentPromptText = '';
        }
      }
    }

    updateInteractionPrompt() {
      // 1. Relics
      for (let relic of this.relics) {
        if (!relic.collected && relic.floor === this.playerFloor) {
          const d = Math.hypot(this.playerPos.x - relic.x, this.playerPos.z - relic.z);
          if (d < 3.2) {
            this.setInteractPrompt(T('hud.prompt_take_relic', '[E] TAKE RELIC: {relic}', { relic: relic.name.toUpperCase() }));
            this.focusedPainting = null;
            return;
          }
        }
      }

      // 2. Ammo Pickups
      for (let pickup of this.ammoPickups) {
        if (pickup.active && pickup.floor === this.playerFloor) {
          const d = Math.hypot(this.playerPos.x - pickup.x, this.playerPos.z - pickup.z);
          if (d < 2.5) {
            this.setInteractPrompt('[E] TAKE 9MM AMMO (+24 ROUNDS)');
            this.focusedPainting = null;
            return;
          }
        }
      }

      _tempForward.set(-Math.sin(this.playerYaw), 0, -Math.cos(this.playerYaw));
      let bestPainting = null;
      let minDotDist = Infinity;

      for (let p of this.paintings) {
        if (p.floor !== this.playerFloor) continue;
        const dist = Math.hypot(this.playerPos.x - p.x, this.playerPos.z - p.z);
        if (dist < 3.8) {
          _tempVec1.set(p.x - this.playerPos.x, 0, p.z - this.playerPos.z).normalize();
          const dot = _tempForward.dot(_tempVec1);
          if (dot > 0.72) {
            // Require clear line-of-sight so artworks are not interactive through bathroom or hallway walls
            if (this.hasClearNavPath(this.playerPos, p, this.playerFloor, 0.15)) {
              const score = dist / dot;
              if (score < minDotDist) {
                minDotDist = score;
                bestPainting = p;
              }
            }
          }
        }
      }

      if (bestPainting) {
        this.focusedPainting = bestPainting;
        this.setInteractPrompt(T('hud.prompt_examine_art', '[E] EXAMINE ARTWORK: "{title}"', { title: bestPainting.title.toUpperCase() }));
        return;
      }

      this.focusedPainting = null;
      this.setInteractPrompt(null);
    }

    showFloorNotification(floor) {
      this.updateRelicFloorVisibility();
      if (!this.dom.floorIndicator) return;
      const names = ['1ST FLOOR', '2ND FLOOR', '3RD FLOOR', '4TH FLOOR'];
      const text = names[floor] || `FLOOR ${floor + 1}`;
      this.dom.floorIndicator.textContent = text;
      this.dom.floorIndicator.style.opacity = '1';

      if (this.floorIndicatorTimeout) {
        clearTimeout(this.floorIndicatorTimeout);
      }
      this.floorIndicatorTimeout = setTimeout(() => {
        if (this.dom.floorIndicator) {
          this.dom.floorIndicator.style.opacity = '0';
        }
      }, 3500);
    }

    showRelicNotification() {
      if (!this.dom.relicNotification) return;
      const obtained = this.relicsCollected;
      const total = CONFIG.TOTAL_RELICS;
      const remaining = Math.max(0, total - obtained);
      this.dom.relicNotification.textContent = T(
        'hud.relic_notification',
        'RELIC RECOVERED: {obtained}/{total} ({remaining} LEFT)',
        { obtained, total, remaining }
      );
      this.dom.relicNotification.classList.add('visible');

      if (this.relicNotificationTimeout) {
        clearTimeout(this.relicNotificationTimeout);
      }
      this.relicNotificationTimeout = setTimeout(() => {
        if (this.dom.relicNotification) {
          this.dom.relicNotification.classList.remove('visible');
        }
      }, 3800);
    }

    showSystemNotification(text, duration = 3000) {
      if (!this.dom.systemNotification) return;
      this.dom.systemNotification.textContent = text;
      this.dom.systemNotification.classList.add('visible');

      if (this.systemNotificationTimeout) {
        clearTimeout(this.systemNotificationTimeout);
      }
      this.systemNotificationTimeout = setTimeout(() => {
        if (this.dom.systemNotification) {
          this.dom.systemNotification.classList.remove('visible');
        }
      }, duration);
    }

    toggleSpectatorMode() {
      this.isSpectatorMode = !this.isSpectatorMode;

      if (this.isSpectatorMode) {
        // Disengage Smitty if currently pursuing or stalking player
        if (this.smittyState === 'CHASE' || this.smittyState === 'STALK' || this.smittyState === 'INVESTIGATE') {
          this.smittyState = 'PATROL';
          this.playSmittyAnimation('Walk');
          this.pickNextPatrolNode();
        }
        this.audio.setHeartbeatBpm(45);

        if (this.dom.spectatorIndicator) {
          this.dom.spectatorIndicator.classList.remove('hidden');
          this.dom.spectatorIndicator.textContent = this.isNoClipMode
            ? T('hud.noclip_badge', 'SPECTATOR • NO-CLIP')
            : T('hud.spectator_badge', 'SPECTATOR MODE');
        }

        this.showSystemNotification(
          T('hud.spectator_enabled', 'SPECTATOR MODE ENABLED (PRESS N FOR NO-CLIP, CMD+N TO EXIT)')
        );
      } else {
        // Disengage no-clip if active when exiting spectator mode
        if (this.isNoClipMode) {
          this.toggleNoClipMode(false);
        }

        if (this.dom.spectatorIndicator) {
          this.dom.spectatorIndicator.classList.add('hidden');
        }

        this.showSystemNotification(
          T('hud.spectator_disabled', 'SPECTATOR MODE DISABLED')
        );
      }
    }

    toggleNoClipMode(forceState) {
      if (!this.isSpectatorMode) return;
      const targetState = (forceState !== undefined) ? forceState : !this.isNoClipMode;
      if (this.isNoClipMode === targetState) return;
      this.isNoClipMode = targetState;

      if (this.isNoClipMode) {
        if (this.dom.spectatorIndicator) {
          this.dom.spectatorIndicator.textContent = T('hud.noclip_badge', 'SPECTATOR • NO-CLIP');
        }
        this.showSystemNotification(
          T('hud.noclip_enabled', 'NO-CLIP ENABLED (WASD TO FLY, SPACE/C FOR VERTICAL, N TO EXIT)')
        );
      } else {
        if (this.dom.spectatorIndicator) {
          this.dom.spectatorIndicator.textContent = T('hud.spectator_badge', 'SPECTATOR MODE');
        }
        // Seamless drop to ground like Garry's Mod
        const footY = this.playerPos.y - CONFIG.PLAYER.CAMERA_HEIGHT;
        let groundFloor = Math.max(0, Math.min(CONFIG.NUM_FLOORS - 1, Math.floor((footY + 0.1) / CONFIG.FLOOR_HEIGHT)));
        this.playerFloor = groundFloor;
        this.playerStairState = { active: null, baseFloor: groundFloor };

        this.isGrounded = false;
        this.fallVelocity = 0;
        this.isFalling = true;

        this.showSystemNotification(
          T('hud.noclip_disabled', 'NO-CLIP DISABLED')
        );
      }
    }

    trackCurrentRoom() {
      // Room name labels removed per user request: only floor notification displays on floor changes.
    }

    updateWeaponViewmodel(delta, isMoving) {
      if (!this.weaponRig) return;

      this.recoilOffset.z = THREE.MathUtils.lerp(this.recoilOffset.z, 0, delta * 12);
      this.recoilOffset.rotX = THREE.MathUtils.lerp(this.recoilOffset.rotX, 0, delta * 14);

      let targetX = 0.24;
      let targetY = -0.29;
      let targetZ = -0.40;
      let targetFov = 74;

      if (this.isAiming) {
        targetX = -0.04;
        targetY = -0.22;
        targetZ = -0.32;
        targetFov = 58;
      } else if (isMoving) {
        const bobScale = this.isSprinting ? 0.02 : 0.01;
        targetX += Math.cos(this.headBobTimer * 0.5) * bobScale;
        targetY += Math.abs(Math.sin(this.headBobTimer)) * bobScale;
      }

      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, delta * 10);
      this.camera.updateProjectionMatrix();

      this.weaponRig.position.x = THREE.MathUtils.lerp(this.weaponRig.position.x, targetX, delta * 14);
      this.weaponRig.position.y = THREE.MathUtils.lerp(this.weaponRig.position.y, targetY, delta * 14);
      this.weaponRig.position.z = THREE.MathUtils.lerp(
        this.weaponRig.position.z,
        targetZ + this.recoilOffset.z,
        delta * 22
      );
      this.weaponRig.rotation.x = this.recoilOffset.rotX;
    }

    updateLeftHandViewmodel(delta, isMoving) {
      if (!this.leftArmRig) return;

      // Base idle position & rotation (Pose 1 from user reference screenshot)
      let targetX = -0.32;
      let targetY = -0.28;
      let targetZ = -0.41;
      let targetRotX = 0;
      let targetRotY = 0;
      let targetRotZ = 0;

      // Subtle breathing / organic hover movement when idle (Pose 1)
      this.leftHandHoverTimer += delta * 1.8;
      const hoverY = Math.sin(this.leftHandHoverTimer) * 0.005;
      const hoverX = Math.cos(this.leftHandHoverTimer * 0.75) * 0.003;
      const hoverRotZ = Math.sin(this.leftHandHoverTimer * 0.5) * 0.012;
      const hoverRotX = Math.cos(this.leftHandHoverTimer * 0.9) * 0.008;

      targetX += hoverX;
      targetY += hoverY;
      targetRotX += hoverRotX;
      targetRotZ += hoverRotZ;

      // Walking & Running radius of movement and tilt (Pose 2 from user reference screenshot)
      if (isMoving) {
        // Bob along the footstep / stride cycle
        const strideBob = (Math.sin(this.headBobTimer) + 1.0) * 0.5; // 0 to 1
        const speedScale = this.isSprinting ? 1.45 : 1.0;

        // Moves down and outward to the left, tilting forward/inward into Pose 2
        targetX += -0.045 * strideBob * speedScale;
        targetY += -0.055 * strideBob * speedScale;
        targetRotX += 0.12 * strideBob * speedScale;
        targetRotZ += -0.12 * strideBob * speedScale;
      }

      // Aiming down sights: slightly tuck left hand to prevent obscuring sightline
      if (this.isAiming) {
        targetX -= 0.04;
        targetY -= 0.08;
      }

      // Reaching & grabbing animation for relics and pickups (Pose 3 from user reference screenshot)
      if (this.leftHandGrabTimer > 0) {
        this.leftHandGrabTimer = Math.max(0, this.leftHandGrabTimer - delta);
        const p = 1.0 - (this.leftHandGrabTimer / this.leftHandGrabDuration); // 0 to 1

        let grabWeight = 0;
        if (p < 0.42) {
          // Rapid forward rise and reach
          grabWeight = Math.sin((p / 0.42) * (Math.PI / 2));
        } else if (p <= 0.58) {
          // Climax grab hold
          grabWeight = 1.0;
        } else {
          // Smooth retraction back to idle/walking pose
          const ret = (p - 0.58) / 0.42;
          grabWeight = 1.0 - (ret * ret * (3 - 2 * ret));
        }

        // Exact Pose 3 coordinates & rotations (arm horizontal, fingers grasping downward)
        const grabPoseX = -0.44;
        const grabPoseY = -0.17;
        const grabPoseZ = -0.37;
        const grabRotX = -1.20;
        const grabRotY = 0.10;
        const grabRotZ = -0.75;

        targetX = THREE.MathUtils.lerp(targetX, grabPoseX, grabWeight);
        targetY = THREE.MathUtils.lerp(targetY, grabPoseY, grabWeight);
        targetZ = THREE.MathUtils.lerp(targetZ, grabPoseZ, grabWeight);
        targetRotX = THREE.MathUtils.lerp(targetRotX, grabRotX, grabWeight);
        targetRotY = THREE.MathUtils.lerp(targetRotY, grabRotY, grabWeight);
        targetRotZ = THREE.MathUtils.lerp(targetRotZ, grabRotZ, grabWeight);
      }

      // Smooth physical interpolation towards target transforms
      const lerpFactor = this.leftHandGrabTimer > 0 ? delta * 18 : delta * 14;
      this.leftArmRig.position.x = THREE.MathUtils.lerp(this.leftArmRig.position.x, targetX, lerpFactor);
      this.leftArmRig.position.y = THREE.MathUtils.lerp(this.leftArmRig.position.y, targetY, lerpFactor);
      this.leftArmRig.position.z = THREE.MathUtils.lerp(this.leftArmRig.position.z, targetZ, lerpFactor);

      this.leftArmRig.rotation.x = THREE.MathUtils.lerp(this.leftArmRig.rotation.x, targetRotX, lerpFactor);
      this.leftArmRig.rotation.y = THREE.MathUtils.lerp(this.leftArmRig.rotation.y, targetRotY, lerpFactor);
      this.leftArmRig.rotation.z = THREE.MathUtils.lerp(this.leftArmRig.rotation.z, targetRotZ, lerpFactor);
    }

    shootPistol() {
      if (!this.gameStarted || this.isReloading || this.isGameOver || this.isPaused || this.isExaminingArt) return;

      const now = performance.now() / 1000;
      if (now - this.lastShotTime < CONFIG.WEAPON.FIRE_RATE) return;

      if (this.ammoInMag <= 0) {
        this.audio.playEmptyClick();
        this.dom.reloadWarning.classList.remove('hidden');
        return;
      }

      this.lastShotTime = now;
      this.ammoInMag--;
      this.shotsFired++;
      this.updateHud();

      this.audio.playPistolShot();

      this.recoilOffset.z = 0.08;
      this.recoilOffset.rotX = 0.16;
      if (this.gunSlideMesh) {
        this.gunSlideMesh.position.z = 0.02;
        setTimeout(() => {
          if (this.gunSlideMesh) this.gunSlideMesh.position.z = -0.03;
        }, 60);
      }

      this.muzzleFlash.material.opacity = 0.95;
      this.muzzleFlash.rotation.z = Math.random() * Math.PI;
      this.muzzleLight.intensity = 4.0;
      setTimeout(() => {
        this.muzzleFlash.material.opacity = 0;
        this.muzzleLight.intensity = 0;
      }, 45);

      this.alertSmittySound(this.playerPos, this.playerFloor, 47.5, true);
      this.raycastBullet();
    }

    raycastBullet() {
      if (!this.smittyMesh || this.smittyState === 'DEAD') return;

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);

      // Fast analytical AABB hitbox test around Smitty (avoids CPU-skinning 275,360 vertices on SkinnedMesh.raycast)
      const sx = this.smittyPos.x;
      const sy = this.smittyPos.y;
      const sz = this.smittyPos.z;
      const hitBox = new THREE.Box3(
        new THREE.Vector3(sx - 0.58, sy, sz - 0.58),
        new THREE.Vector3(sx + 0.58, sy + 2.35, sz + 0.58)
      );

      const hitPoint = new THREE.Vector3();
      const hit = raycaster.ray.intersectBox(hitBox, hitPoint);
      if (!hit) return;

      const dist = this.camera.position.distanceTo(hitPoint);
      if (dist > 38) return;

      // Verify no wall on the current floor blocks the shot
      const x0 = this.playerPos.x;
      const z0 = this.playerPos.z;
      for (let i = 0; i < this.colliders.length; i++) {
        const c = this.colliders[i];
        if (c.floor !== 'all' && c.floor !== this.playerFloor) continue;
        if (c.type === 'box') {
          if (lineIntersectsBox(x0, z0, sx, sz, c.minX, c.maxX, c.minZ, c.maxZ)) {
            return;
          }
        }
      }

      this.shotsHit++;
      this.damageSmitty(CONFIG.WEAPON.DAMAGE, hitPoint, raycaster.ray.direction);
    }

    spawnBloodPuddle(x, floorY, z, targetRadius = 0.38) {
      for (let i = 0; i < this.bloodPuddles.length; i++) {
        const p = this.bloodPuddles[i];
        if (Math.abs(p.floorY - floorY) < 0.2 && Math.hypot(p.x - x, p.z - z) < 0.45) {
          p.targetRadius = Math.min(1.65, Math.hypot(p.targetRadius, targetRadius * 0.55));
          return;
        }
      }

      if (this.bloodPuddles.length > 90) {
        const oldest = this.bloodPuddles.shift();
        this.scene.remove(oldest.mesh);
      }

      const puddleGeom = new THREE.CircleGeometry(1, 24);
      const mesh = new THREE.Mesh(puddleGeom, this.bloodPuddleMat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.rotation.z = Math.random() * Math.PI * 2;
      mesh.position.set(x, floorY + 0.008 + Math.random() * 0.004, z);
      mesh.scale.set(0.05, 0.05, 1);
      this.scene.add(mesh);

      this.bloodPuddles.push({
        mesh,
        x,
        z,
        floorY,
        currentRadius: 0.05,
        targetRadius
      });
    }

    spawnLiquidBlood(hitPoint, shotDir, count = 38) {
      if (!this.bloodDropGeom || !this.bloodDropMat) return;

      const floorY = this.smittyPos ? this.smittyPos.y : (this.playerFloor * CONFIG.FLOOR_HEIGHT);
      const dir = shotDir ? shotDir.clone().normalize() : new THREE.Vector3(0, 0, 1);

      for (let i = 0; i < count; i++) {
        const mesh = new THREE.Mesh(this.bloodDropGeom, this.bloodDropMat);
        const radius = 0.018 + Math.random() * 0.028;

        const jitterX = (Math.random() - 0.5) * 0.22;
        const jitterY = (Math.random() - 0.5) * 0.26;
        const jitterZ = (Math.random() - 0.5) * 0.22;
        mesh.position.set(
          hitPoint.x + jitterX,
          hitPoint.y + jitterY,
          hitPoint.z + jitterZ
        );

        // Cohesive arterial jet splash: some backward toward entry, majority spraying out & sideways with arc
        const sprayMode = Math.random() < 0.35 ? -0.6 : 1.0;
        const speed = 1.6 + Math.random() * 4.2;
        const vel = new THREE.Vector3(
          dir.x * sprayMode * speed + (Math.random() - 0.5) * 3.2,
          0.6 + Math.random() * 2.4,
          dir.z * sprayMode * speed + (Math.random() - 0.5) * 3.2
        );

        mesh.scale.set(radius, radius, radius * 2.4);
        this.scene.add(mesh);

        this.bloodDroplets.push({
          mesh,
          vel,
          radius,
          floorY,
          life: 2.2
        });
      }
    }

    updateLiquidBlood(delta) {
      for (let i = this.bloodDroplets.length - 1; i >= 0; i--) {
        const d = this.bloodDroplets[i];
        d.life -= delta;

        // Gravity & fluid drag
        d.vel.y -= 14.8 * delta;
        d.vel.x *= (1 - 0.6 * delta);
        d.vel.z *= (1 - 0.6 * delta);

        d.mesh.position.x += d.vel.x * delta;
        d.mesh.position.y += d.vel.y * delta;
        d.mesh.position.z += d.vel.z * delta;

        // Orient and elongate droplet along velocity vector for continuous liquid stream physics
        const speed = d.vel.length();
        const stretch = Math.max(1.2, Math.min(4.8, 1.0 + speed * 0.42));
        _tempVec1.copy(d.mesh.position).add(d.vel);
        d.mesh.lookAt(_tempVec1);
        d.mesh.scale.set(d.radius, d.radius, d.radius * stretch);

        if (d.mesh.position.y <= d.floorY + 0.015 || d.life <= 0) {
          if (d.mesh.position.y <= d.floorY + 0.05) {
            this.spawnBloodPuddle(
              d.mesh.position.x,
              d.floorY,
              d.mesh.position.z,
              0.14 + d.radius * 5.2
            );
          }
          this.scene.remove(d.mesh);
          this.bloodDroplets.splice(i, 1);
        }
      }

      for (let i = 0; i < this.bloodPuddles.length; i++) {
        const p = this.bloodPuddles[i];
        if (Math.abs(p.currentRadius - p.targetRadius) > 0.002) {
          p.currentRadius = THREE.MathUtils.lerp(p.currentRadius, p.targetRadius, Math.min(1, delta * 5.5));
          p.mesh.scale.set(p.currentRadius, p.currentRadius * 0.88, 1);
        }
      }
    }

    reloadPistol() {
      if (!this.gameStarted || this.isReloading || this.ammoInMag === CONFIG.WEAPON.MAG_CAPACITY || this.reserveAmmo <= 0) return;
      this.isReloading = true;
      this.dom.reloadWarning.classList.add('hidden');
      this.audio.playReloadSound();

      this.recoilOffset.z = 0.1;
      this.recoilOffset.rotX = -0.25;

      setTimeout(() => {
        const needed = CONFIG.WEAPON.MAG_CAPACITY - this.ammoInMag;
        const take = Math.min(needed, this.reserveAmmo);
        this.ammoInMag += take;
        this.reserveAmmo -= take;
        this.isReloading = false;
        this.updateHud();
      }, 1100);
    }

    damageSmitty(amount, hitPoint = null, shotDir = null) {
      this.audio.playSmittyGrowl();
      this.smittyHp -= amount;
      this.smittyStunTimer = 1.2;

      const bloodOrigin = hitPoint || new THREE.Vector3(this.smittyPos.x, this.smittyPos.y + 1.35, this.smittyPos.z);
      this.spawnLiquidBlood(bloodOrigin, shotDir, 38);

      if (this.smittyHp <= 0) {
        this.smittyState = 'DEAD';
        this.smittyDeadTimer = 0;
        this.smittyFallAngle = 0.01;
        this.audio.stopLingeringMonsterAudio();
        if (this.smittyMixer) {
          this.smittyMixer.stopAllAction();
        }
        // Pose arms outstretched wide perpendicular to torso (crucifix/T-pose)
        if (this.smittyBones) {
          if (this.smittyBones['LeftUpperArm']) this.smittyBones['LeftUpperArm'].rotation.set(0, 0, Math.PI / 2);
          if (this.smittyBones['RightUpperArm']) this.smittyBones['RightUpperArm'].rotation.set(0, 0, -Math.PI / 2);
          if (this.smittyBones['LeftLowerArm']) this.smittyBones['LeftLowerArm'].rotation.set(0, 0, 0);
          if (this.smittyBones['RightLowerArm']) this.smittyBones['RightLowerArm'].rotation.set(0, 0, 0);
          if (this.smittyBones['LeftHand']) this.smittyBones['LeftHand'].rotation.set(0, 0, 0);
          if (this.smittyBones['RightHand']) this.smittyBones['RightHand'].rotation.set(0, 0, 0);
        }
        // Extra arterial burst on fatal shot + pooling beneath body
        this.spawnLiquidBlood(bloodOrigin, shotDir, 68);
        const yaw = this.smittyMesh ? this.smittyMesh.rotation.y : 0;
        this.spawnBloodPuddle(
          this.smittyPos.x - Math.sin(yaw) * 0.95,
          this.smittyPos.y,
          this.smittyPos.z - Math.cos(yaw) * 0.95,
          1.45
        );
      } else {
        this.smittyState = 'CHASE';
        this.playSmittyAnimation('Run');
      }
    }

    checkSmittyVision() {
      if (this.isSpectatorMode) return false;
      const isChase = (this.smittyState === 'CHASE');
      const isStairSmitty = this.isInStairwell(this.smittyPos);
      const isStairPlayer = this.isInStairwell(this.playerPos);
      const isNearStairSmitty = isStairSmitty || this.isNearStairwell(this.smittyPos);
      const isNearStairPlayer = isStairPlayer || this.isNearStairwell(this.playerPos);

      // Floor check:
      if (this.smittyFloor !== this.playerFloor) {
        const playerFootY = this.playerPos.y - CONFIG.PLAYER.CAMERA_HEIGHT;
        const vertDist = Math.abs(playerFootY - this.smittyPos.y);

        if (!isChase) {
          // When patrolling / investigating / stalking, require both inside stairwell within ~4.5m vertical
          if (!isStairSmitty || !isStairPlayer) return false;
          if (vertDist > 4.5) return false;
        } else {
          // In CHASE: tenaciously track the player up/down the stairs!
          // Stairwells have open shafts allowing vertical line of sight across all floors
          if (isStairSmitty && isStairPlayer) {
            if (vertDist > 15.0) return false; // Full 4-story stair shaft tracking
          } else if (isNearStairSmitty && isNearStairPlayer) {
            // One is on landing/approach doorway, one is on flight
            if (vertDist > 6.0) return false;
          } else {
            // Different floors separated by solid floor slabs and not in/at stairwell
            return false;
          }
        }
      }

      const dist = Math.hypot(this.playerPos.x - this.smittyPos.x, this.playerPos.z - this.smittyPos.z);
      
      // Dynamic stealth vision range:
      // Base detection range is lowered by 27% to 29.2m for stealth when patrolling.
      // BUT WHEN IN CHASE, detection is massively elevated so Smitty stays locked onto prey!
      let maxRange = CONFIG.SMITTY.DETECT_RANGE;
      if (isChase) {
        maxRange = 54.0;
        if (this.flashlightOn) {
          maxRange = 68.0;
        } else if (this.isCrouching) {
          maxRange = 46.0;
        }
      } else {
        if (this.flashlightOn) {
          maxRange *= 1.30;
        } else if (this.isCrouching) {
          maxRange *= 0.55;
        }
      }

      if (dist > maxRange) return false;

      // Peripheral vision awareness:
      if (!isChase) {
        const immediateAwarenessDist = this.isCrouching ? 2.6 : 4.75;
        if (dist > immediateAwarenessDist) {
          const smittyRot = this.smittyMesh ? this.smittyMesh.rotation.y : 0;
          _tempForward.set(Math.sin(smittyRot), 0, Math.cos(smittyRot));
          _tempVec1.set(this.playerPos.x - this.smittyPos.x, 0, this.playerPos.z - this.smittyPos.z).normalize();
          const dot = _tempForward.dot(_tempVec1);

          // Realistic peripheral vision:
          // Standing: ~130 degree FOV (dot > -0.05)
          // Sneaking in shadows: narrower ~85 degree peripheral focus (dot > 0.35)
          const minDot = (!this.flashlightOn && this.isCrouching) ? 0.35 : -0.05;
          if (dot < minDot) return false;
        }
      }
      // When in CHASE, Smitty is in furious predator pursuit: 360 degree awareness of player within line of sight!

      // Raycast line of sight check
      // Offset starting point slightly along the ray towards player so it does not self-intersect
      // the wall collider Smitty might be standing right against
      const dirX = (this.playerPos.x - this.smittyPos.x) / (dist || 1);
      const dirZ = (this.playerPos.z - this.smittyPos.z) / (dist || 1);
      const x0 = this.smittyPos.x + dirX * 0.35;
      const z0 = this.smittyPos.z + dirZ * 0.35;
      const x1 = this.playerPos.x - dirX * 0.2;
      const z1 = this.playerPos.z - dirZ * 0.2;

      for (let i = 0; i < this.colliders.length; i++) {
        const c = this.colliders[i];
        if (c.floor !== 'all' && c.floor !== this.smittyFloor && c.floor !== this.playerFloor) continue;
        if (c.type === 'box') {
          if (lineIntersectsBox(x0, z0, x1, z1, c.minX, c.maxX, c.minZ, c.maxZ)) {
            return false;
          }
        }
      }
      return true;
    }

    alertSmittySound(soundPos, soundFloor, radius, isImmediateChase = false) {
      if (this.isSpectatorMode || this.smittyState === 'DEAD' || this.smittyState === 'RESPAWNING' || !this.gameStarted) return;
      const isStairSound = this.isInStairwell(soundPos) || this.isNearStairwell(soundPos);
      const isStairSmitty = this.isInStairwell(this.smittyPos) || this.isNearStairwell(this.smittyPos);
      const floorDiff = Math.abs(soundFloor - this.smittyFloor);
      const isChase = (this.smittyState === 'CHASE');

      let effectiveRadius = radius;
      if (isChase) {
        effectiveRadius *= 1.85; // Hyper-vigilant acoustic tracking while chasing
      }

      let floorPenalty = 0;
      if (floorDiff > 0) {
        if (isStairSound || isStairSmitty) {
          // Stairwells act as vertical acoustic echo chambers: sounds reverberate freely between floors!
          floorPenalty = floorDiff * 3.5;
        } else {
          // Solid concrete museum floors block normal footstep and running vibrations
          floorPenalty = floorDiff * (isChase ? 28.0 : 55.0);
        }
      }

      const dist = Math.hypot(this.smittyPos.x - soundPos.x, this.smittyPos.z - soundPos.z) + floorPenalty;

      if (dist <= effectiveRadius) {
        this.investigatePos.set(soundPos.x, soundFloor * CONFIG.FLOOR_HEIGHT, soundPos.z);
        this.investigateFloor = soundFloor;
        this.graceTimer = 0;

        if (isImmediateChase) {
          this.smittyState = 'CHASE';
          this.lastKnownPlayerPos.set(soundPos.x, soundFloor * CONFIG.FLOOR_HEIGHT, soundPos.z);
          this.lastKnownPlayerFloor = soundFloor;
          this.timeSincePlayerSeen = 0;
          this.smittyPath = [];
          this.playSmittyAnimation('Run');
          this.audio.playSmittyGrowl();
        } else if (this.smittyState === 'CHASE' || this.smittyState === 'STALK') {
          // Keep tracking footsteps even if visual LOS broke around a corner or onto stairs
          this.lastKnownPlayerPos.set(soundPos.x, soundFloor * CONFIG.FLOOR_HEIGHT, soundPos.z);
          this.lastKnownPlayerFloor = soundFloor;
          // Refresh chase persistence so Smitty doesn't give up while player is running on stairs!
          this.timeSincePlayerSeen = Math.min(this.timeSincePlayerSeen, 2.0);
        } else {
          this.smittyState = 'INVESTIGATE';
          this.smittySearchTimer = 8.0;
          this.smittyPath = []; // Clear stale waypoint path so Smitty redirects immediately
          this.playSmittyAnimation('Walk');
          this.audio.playSmittyGrowl();

          // Immediately swivel towards the sound origin
          if (this.smittyMesh && this.smittyFloor === soundFloor) {
            const dx = soundPos.x - this.smittyPos.x;
            const dz = soundPos.z - this.smittyPos.z;
            if (Math.hypot(dx, dz) > 0.1) {
              this.smittyMesh.rotation.y = Math.atan2(dx, dz);
            }
          }
        }
      }
    }

    moveSmittyAlongGraph(goalPos, goalFloor, speed, delta, directLOS = false) {
      let tx = goalPos.x;
      let tz = goalPos.z;

      if (!directLOS || goalFloor !== this.smittyFloor) {
        const goalId = this.findNearestNavNode(goalPos, goalFloor);
        if (
          !this.smittyPath ||
          this.smittyPath.length === 0 ||
          this.smittyPathGoalId !== goalId ||
          this.smittyPathIndex >= this.smittyPath.length
        ) {
          const startId = this.findNearestNavNode(this.smittyPos, this.smittyFloor);
          this.smittyPath = this.findShortestPath(startId, goalId);
          this.smittyPathGoalId = goalId;
          this.smittyPathIndex = 0;
          if (this.smittyPath.length > 1) {
            const dFirst = Math.hypot(this.smittyPos.x - this.smittyPath[0].x, this.smittyPos.z - this.smittyPath[0].z);
            if (dFirst < 1.1 || (this.smittyPath[0].floor === this.smittyPath[1].floor && this.hasClearNavPath(this.smittyPos, this.smittyPath[1], this.smittyFloor, 0.44))) {
              this.smittyPathIndex = 1;
            }
          }
        }

        let targetNode = this.smittyPath[this.smittyPathIndex] || goalPos;
        const distToTarget = Math.hypot(this.smittyPos.x - targetNode.x, this.smittyPos.z - targetNode.z);
        if (distToTarget < 1.1) {
          if (this.smittyPathIndex < this.smittyPath.length - 1) {
            this.smittyPathIndex++;
            targetNode = this.smittyPath[this.smittyPathIndex];
          } else {
            // Reached last waypoint. Check if direct path to goalPos is completely clear on same floor
            if (goalFloor === this.smittyFloor && this.hasClearNavPath(this.smittyPos, goalPos, this.smittyFloor, 0.48)) {
              targetNode = goalPos;
            } else {
              // Goal is behind a corner; replan next frame
              this.smittyPath = [];
            }
          }
        }

        tx = targetNode.x;
        tz = targetNode.z;
      } else {
        this.smittyPath = [];
      }

      const sx = this.smittyPos.x;
      const sz = this.smittyPos.z;
      const dx = tx - sx;
      const dz = tz - sz;
      const distToWaypoint = Math.hypot(dx, dz);

      if (distToWaypoint > 0.05 && this.smittyMesh) {
        let vx = dx / distToWaypoint;
        let vz = dz / distToWaypoint;

        const targetAngle = Math.atan2(vx, vz);
        let currentAngle = this.smittyMesh.rotation.y;
        let diff = targetAngle - currentAngle;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        const turnSpeed = speed > CONFIG.SMITTY.PATROL_SPEED ? 11.0 : 7.0;
        this.smittyMesh.rotation.y = currentAngle + diff * Math.min(1.0, delta * turnSpeed);

        const moveStep = Math.min(distToWaypoint, speed * delta);
        const oldX = this.smittyPos.x;
        const oldZ = this.smittyPos.z;

        // Sub-stepped movement with natural collider wall-sliding (just like player)
        const subSteps = 2;
        const stepDt = moveStep / subSteps;
        for (let s = 0; s < subSteps; s++) {
          this.smittyPos.x += vx * stepDt;
          this.smittyPos.z += vz * stepDt;
          this.resolveCollisions(this.smittyPos, 0.40, this.smittyFloor);
        }

        const movedDist = Math.hypot(this.smittyPos.x - oldX, this.smittyPos.z - oldZ);
        // Genuine obstruction check: if unable to move along current vector for >0.40s
        if (movedDist < moveStep * 0.15 && moveStep > 0.01) {
          this.smittyStuckTimer = (this.smittyStuckTimer || 0) + delta;
          if (this.smittyStuckTimer > 0.40) {
            // Replan from the nearest visible node — never skip waypoints through walls!
            this.smittyPath = [];
            this.smittyPathGoalId = null;
            if (this.smittyState === 'PATROL') {
              this.pickNextPatrolNode();
            }
            this.smittyStuckTimer = 0;
          }
        } else {
          this.smittyStuckTimer = 0;
        }
      }

      const elev = this.updateStairwellElevation(this.smittyPos, this.smittyStairState, this.smittyFloor);
      this.smittyFloor = elev.floor;
      this.smittyPos.y = elev.y;
      if (this.smittyMesh) {
        this.smittyMesh.position.set(this.smittyPos.x, this.smittyPos.y + 0.05, this.smittyPos.z);
      }
    }

    updateSmitty(delta) {
      if (!this.gameStarted) return;
      if (!this.smittyMesh) return;

      if (this.smittyState === 'DEAD') {
        this.audio.setHeartbeatBpm(45);
        this.smittyDeadTimer += delta;

        // Accelerating backward fall onto the floor
        if (this.smittyFallAngle < Math.PI / 2) {
          const fallSpeed = 2.4 + this.smittyFallAngle * 3.8;
          this.smittyFallAngle = Math.min(Math.PI / 2, this.smittyFallAngle + fallSpeed * delta);
          this.smittyMesh.rotation.order = 'YXZ';
          this.smittyMesh.rotation.x = -this.smittyFallAngle;
        }
        // Body lies flat on the ground
        this.smittyMesh.position.y = this.smittyPos.y + 0.12;

        // Lock arms outstretched wide in cross/T-pose
        if (this.smittyBones) {
          if (this.smittyBones['LeftUpperArm']) this.smittyBones['LeftUpperArm'].rotation.set(0, 0, Math.PI / 2);
          if (this.smittyBones['RightUpperArm']) this.smittyBones['RightUpperArm'].rotation.set(0, 0, -Math.PI / 2);
          if (this.smittyBones['LeftLowerArm']) this.smittyBones['LeftLowerArm'].rotation.set(0, 0, 0);
          if (this.smittyBones['RightLowerArm']) this.smittyBones['RightLowerArm'].rotation.set(0, 0, 0);
        }

        // Body remains flat on the floor for 20 seconds, then fades away over 3 seconds
        if (this.smittyDeadTimer >= 20.0 && this.smittyDeadTimer < 23.0) {
          const fadeProgress = (this.smittyDeadTimer - 20.0) / 3.0;
          const alpha = Math.max(0, 1.0 - fadeProgress);
          this.smittyMesh.traverse((child) => {
            if (child.isMesh && child.material) {
              if (Array.isArray(child.material)) {
                child.material.forEach((m) => {
                  m.transparent = true;
                  m.opacity = alpha;
                });
              } else {
                child.material.transparent = true;
                child.material.opacity = alpha;
              }
            }
          });
        } else if (this.smittyDeadTimer >= 23.0) {
          // Fade complete — hide corpse and start 60s respawn timer
          this.smittyMesh.visible = false;
          this.smittyState = 'RESPAWNING';
          this.smittyRespawnTimer = 60.0;
        }
        return;
      }

      if (this.smittyState === 'RESPAWNING') {
        this.smittyRespawnTimer -= delta;
        if (this.smittyRespawnTimer <= 0) {
          // Exactly 1 minute later, respawn on a DIFFERENT floor!
          const otherFloors = [0, 1, 2, 3].filter((f) => f !== this.playerFloor);
          const chosenFloor = otherFloors[Math.floor(Math.random() * otherFloors.length)];
          const candidateNodes = this.navNodes.filter(
            (n) => n.floor === chosenFloor && !n.tag.includes('Mid') && !n.tag.includes('Stair') && !n.tag.includes('stair')
          );
          const spawnNode = candidateNodes.length > 0
            ? candidateNodes[Math.floor(Math.random() * candidateNodes.length)]
            : { x: 12, z: -30, floor: chosenFloor };

          this.smittyFloor = chosenFloor;
          this.smittyPos.set(spawnNode.x, chosenFloor * CONFIG.FLOOR_HEIGHT, spawnNode.z);
          this.smittyMesh.position.copy(this.smittyPos);
          this.smittyMesh.position.y += 0.05;
          this.smittyMesh.rotation.set(0, 0, 0);
          this.smittyFallAngle = 0;

          // Reset bone rotations
          if (this.smittyBones) {
            if (this.smittyBones['LeftUpperArm']) this.smittyBones['LeftUpperArm'].rotation.set(0, 0, 0);
            if (this.smittyBones['RightUpperArm']) this.smittyBones['RightUpperArm'].rotation.set(0, 0, 0);
          }

          // Restore full opacity and visibility
          this.smittyMesh.traverse((child) => {
            if (child.isMesh && child.material) {
              if (Array.isArray(child.material)) {
                child.material.forEach((m) => {
                  m.transparent = false;
                  m.opacity = 1.0;
                });
              } else {
                child.material.transparent = false;
                child.material.opacity = 1.0;
              }
            }
          });
          this.smittyMesh.visible = (this.smittyFloor === this.playerFloor);

          // Reset health & patrol
          this.smittyHp = CONFIG.SMITTY.MAX_HP;
          this.smittyState = 'PATROL';
          this.smittyStunTimer = 0;
          this.audio.playSmittyGrowl();
          this.playSmittyAnimation('Walk');
          this.pickNextPatrolNode();
        }
        return;
      }

      // Multi-floor visibility culling:
      // Hide Smitty when on a different floor than the player unless in stairwell view.
      // This completely prevents Smitty's feet from protruding through ceilings into lower floors.
      const isStairSmitty = this.isInStairwell(this.smittyPos);
      const isStairPlayer = this.isInStairwell(this.playerPos);
      const isNearStairSmitty = isStairSmitty || this.isNearStairwell(this.smittyPos);
      const isNearStairPlayer = isStairPlayer || this.isNearStairwell(this.playerPos);
      const sameFloor = (this.smittyFloor === this.playerFloor);
      const stairVisible = (isNearStairSmitty || isNearStairPlayer);
      const standardVisibility = (sameFloor || (stairVisible && (this.smittyState === 'CHASE' || Math.abs(this.smittyFloor - this.playerFloor) <= 1)));
      this.smittyMesh.visible = this.isSpectatorMode ? (sameFloor || Math.abs(this.playerPos.y - this.smittyPos.y) < 7.5) : standardVisibility;

      if (this.graceTimer > 0) {
        this.graceTimer -= delta;
      }

      const dist3D = this.smittyPos.distanceTo(this.playerPos);

      if (this.isSpectatorMode) {
        this.audio.setHeartbeatBpm(45);
      } else if (this.smittyState === 'CHASE' || dist3D < 9) {
        this.audio.setHeartbeatBpm(165);
      } else if (this.smittyState === 'STALK' || dist3D < 18) {
        this.audio.setHeartbeatBpm(110);
      } else if (dist3D < 30) {
        this.audio.setHeartbeatBpm(75);
      } else {
        this.audio.setHeartbeatBpm(45);
      }

      if (!this.isSpectatorMode && this.flashlightOn && dist3D < 12 && Math.random() < 0.08) {
        this.flashlight.intensity = Math.random() < 0.5 ? 0.3 : 1.65;
      } else if (this.flashlightOn) {
        this.flashlight.intensity = 1.65;
      }

      this.smittyFootstepTimer -= delta;
      if (this.smittyFootstepTimer <= 0) {
        if (this.smittyState === 'CHASE') {
          this.smittyFootstepInterval = 0.28; // Rapid aggressive chase pounding
        } else if (this.smittyState === 'STALK') {
          this.smittyFootstepInterval = 0.72; // Slow, deliberate heavy stalking
        } else {
          this.smittyFootstepInterval = 0.60;
        }
        this.smittyFootstepTimer = this.smittyFootstepInterval;
        if (dist3D < 38) {
          this.audio.playSmittyFootstep(dist3D);
        }
      }

      if (this.smittyStunTimer > 0) {
        this.smittyStunTimer -= delta;
        return;
      }

      const canSeePlayer = !this.isSpectatorMode && (this.graceTimer <= 0) && this.checkSmittyVision();

      if (canSeePlayer) {
        this.lastKnownPlayerPos.copy(this.playerPos);
        this.lastKnownPlayerFloor = this.playerFloor;
        this.timeSincePlayerSeen = 0;

        if (
          this.smittyState === 'PATROL' ||
          this.smittyState === 'PATROL_DANCE' ||
          this.smittyState === 'PATROL_INSPECT' ||
          this.smittyState === 'INVESTIGATE' ||
          this.smittyState === 'SEARCH'
        ) {
          if (dist3D < 11 || this.isSprinting) {
            this.smittyState = 'CHASE';
            this.playSmittyAnimation('Run');
            this.audio.playJumpscareStinger();
          } else {
            this.smittyState = 'STALK';
            this.playSmittyAnimation('Walk');
            this.audio.playSmittyGrowl();
            this.smittyStalkFreezeTimer = 0;
          }
        }
      } else {
        this.timeSincePlayerSeen += delta;
      }

      if (this.smittyState === 'CHASE') {
        if (this.isSpectatorMode) {
          this.smittyState = 'PATROL';
          this.pickNextPatrolNode();
          this.playSmittyAnimation('Walk');
          return;
        }
        const speed = CONFIG.SMITTY.CHASE_SPEED;

        // Periodic predator snarls/growls during extended pursuit
        this.smittyChaseGrowlTimer = (this.smittyChaseGrowlTimer || 0) - delta;
        if (this.smittyChaseGrowlTimer <= 0) {
          this.smittyChaseGrowlTimer = 4.5 + Math.random() * 3.5;
          this.audio.playSmittyGrowl();
        }

        // Acoustic tracking in stairwells: when player is climbing/descending stairs,
        // Smitty tracks their reverberating steps through the stair shaft
        if (!this.isSpectatorMode && isNearStairPlayer && (isNearStairSmitty || Math.hypot(this.smittyPos.x - this.playerPos.x, this.smittyPos.z - this.playerPos.z) < 26.0)) {
          this.lastKnownPlayerPos.copy(this.playerPos);
          this.lastKnownPlayerFloor = this.playerFloor;
          this.timeSincePlayerSeen = 0;
        }

        // Predictive Interception: project player movement ahead when sprinting/running
        let targetPos = canSeePlayer ? this.playerPos : this.lastKnownPlayerPos;
        const targetFl = canSeePlayer ? this.playerFloor : this.lastKnownPlayerFloor;

        if (canSeePlayer && this.smittyFloor === this.playerFloor && this.playerVelocity && this.playerVelocity.lengthSq() > 3.0) {
          _tempVec2.copy(this.playerPos).addScaledVector(this.playerVelocity, 0.85);
          // Only intercept if clear nav path exists to predicted coordinate
          if (this.hasClearNavPath(this.smittyPos, _tempVec2, this.smittyFloor, 0.45)) {
            targetPos = _tempVec2;
          }
        }

        const canRush = canSeePlayer && (this.smittyFloor === this.playerFloor) && this.hasClearNavPath(this.smittyPos, targetPos, this.smittyFloor, 0.45);
        this.moveSmittyAlongGraph(targetPos, targetFl, speed, delta, canRush);

        // When line of sight is lost, switch to SEARCH only after reaching the destination floor & spot,
        // or after prolonged relentless pursuit (14.0 seconds)
        if (!canSeePlayer) {
          const distToLastKnown = Math.hypot(this.lastKnownPlayerPos.x - this.smittyPos.x, this.lastKnownPlayerPos.z - this.smittyPos.z);
          const reachedTargetFloor = (this.smittyFloor === this.lastKnownPlayerFloor);
          if ((reachedTargetFloor && distToLastKnown < 1.8) || this.timeSincePlayerSeen > 14.0) {
            this.smittyState = 'SEARCH';
            this.smittySearchTimer = 8.5;
            this.smittySearchStage = 'NAV';
            this.playSmittyAnimation('Walk');
          }
        }

        if (!this.isSpectatorMode && this.smittyFloor === this.playerFloor && dist3D < CONFIG.SMITTY.ATTACK_RANGE) {
          const now = performance.now() / 1000;
          if (now - this.smittyLastAttackTime > CONFIG.SMITTY.ATTACK_COOLDOWN) {
            this.smittyLastAttackTime = now;
            this.attackPlayer();
          }
        }
      } else if (this.smittyState === 'STALK') {
        if (this.isSpectatorMode) {
          this.smittyState = 'PATROL';
          this.pickNextPatrolNode();
          this.playSmittyAnimation('Walk');
          return;
        }
        // Creepy Stalking Dynamics:
        _tempForward.set(-Math.sin(this.playerYaw), 0, -Math.cos(this.playerYaw));
        _tempVec1.set(this.smittyPos.x - this.playerPos.x, 0, this.smittyPos.z - this.playerPos.z).normalize();
        const playerFacingSmitty = _tempForward.dot(_tempVec1) > 0.55;

        // If player shines flashlight directly at Smitty: Freeze in eerie stare!
        if (canSeePlayer && playerFacingSmitty && this.flashlightOn) {
          this.smittyStalkFreezeTimer = (this.smittyStalkFreezeTimer || 0) + delta;
          this.playSmittyAnimation('Idle');

          // Face the player directly, unblinking
          const dx = this.playerPos.x - this.smittyPos.x;
          const dz = this.playerPos.z - this.smittyPos.z;
          if (this.smittyMesh && Math.hypot(dx, dz) > 0.1) {
            this.smittyMesh.rotation.y = Math.atan2(dx, dz);
          }

          // If held in the beam for > 1.3s or player gets within 8.5m: Lunge into CHASE!
          if (this.smittyStalkFreezeTimer > 1.3 || dist3D < 8.5) {
            this.smittyState = 'CHASE';
            this.playSmittyAnimation('Run');
            this.audio.playJumpscareStinger();
          }
        } else {
          this.smittyStalkFreezeTimer = Math.max(0, (this.smittyStalkFreezeTimer || 0) - delta * 2);

          // If player's back is turned: creep significantly faster from behind!
          const stalkMultiplier = (!playerFacingSmitty) ? 1.35 : 1.0;
          const speed = CONFIG.SMITTY.STALK_SPEED * stalkMultiplier;
          this.playSmittyAnimation('Walk');

          const canRush = canSeePlayer && (this.smittyFloor === this.playerFloor) && this.hasClearNavPath(this.smittyPos, this.playerPos, this.smittyFloor, 0.45);
          this.moveSmittyAlongGraph(this.playerPos, this.playerFloor, speed, delta, canRush);

          if (dist3D < 9.5 || this.isSprinting) {
            this.smittyState = 'CHASE';
            this.playSmittyAnimation('Run');
            this.audio.playJumpscareStinger();
          } else if (!canSeePlayer) {
            this.smittyState = 'SEARCH';
            this.smittySearchTimer = 8.5;
            this.smittySearchStage = 'NAV';
            this.playSmittyAnimation('Walk');
          }
        }
      } else if (this.smittyState === 'SEARCH') {
        this.smittySearchTimer -= delta;
        const speed = CONFIG.SMITTY.SEARCH_SPEED;
        const d2D = Math.hypot(this.lastKnownPlayerPos.x - this.smittyPos.x, this.lastKnownPlayerPos.z - this.smittyPos.z);

        if (d2D > 1.8 && this.smittySearchStage === 'NAV') {
          this.playSmittyAnimation('Walk');
          this.moveSmittyAlongGraph(this.lastKnownPlayerPos, this.lastKnownPlayerFloor, speed, delta, false);
        } else {
          // Reached search zone: multi-stage corridor inspection
          if (this.smittySearchStage === 'NAV') {
            this.smittySearchStage = 'SCAN';
            this.smittySearchScanTimer = 3.0;
          }

          if (this.smittySearchStage === 'SCAN') {
            this.smittySearchScanTimer -= delta;
            this.playSmittyAnimation('Idle');
            // Deliberate head/body look-around scanning left and right
            const scanPhase = (3.0 - this.smittySearchScanTimer);
            if (scanPhase < 1.4) {
              this.smittyMesh.rotation.y += 0.8 * delta; // Look left
            } else if (scanPhase < 2.8) {
              this.smittyMesh.rotation.y -= 1.6 * delta; // Pan right
            }

            if (this.smittySearchScanTimer <= 0) {
              // Transition to Fake-Out Ambush stage!
              this.smittySearchStage = 'FAKEOUT';
              this.smittySearchScanTimer = 2.4;
              this.pickNextPatrolNode();
            }
          } else if (this.smittySearchStage === 'FAKEOUT') {
            this.smittySearchScanTimer -= delta;
            if (this.smittySearchScanTimer > 0.6) {
              // Walking away nonchalantly...
              this.playSmittyAnimation('Walk');
              const goalNode = this.navNodes[this.smittyPatrolGoalNode] || this.navNodes[0];
              this.moveSmittyAlongGraph(goalNode, goalNode.floor, CONFIG.SMITTY.PATROL_SPEED, delta, false);
            } else {
              // SUDDEN 180-DEGREE WHIP AROUND!
              this.playSmittyAnimation('Idle');
              this.smittyMesh.rotation.y += Math.PI * 4.0 * delta; // Rapid snap turnaround
            }
          }
        }

        if (this.smittySearchTimer <= 0) {
          this.smittyState = 'PATROL';
          this.pickNextPatrolNode();
          this.playSmittyAnimation('Walk');
        }
      } else if (this.smittyState === 'INVESTIGATE') {
        this.smittySearchTimer -= delta;
        const speed = CONFIG.SMITTY.SEARCH_SPEED;
        const d2D = Math.hypot(this.investigatePos.x - this.smittyPos.x, this.investigatePos.z - this.smittyPos.z);

        if (d2D > 1.8) {
          this.playSmittyAnimation('Walk');
          this.moveSmittyAlongGraph(this.investigatePos, this.investigateFloor, speed, delta, false);
        } else {
          // Standing at sound origin, scanning
          this.playSmittyAnimation('Idle');
          this.smittyMesh.rotation.y += Math.sin(performance.now() * 0.003) * 0.04;
        }

        if (this.smittySearchTimer <= 0) {
          this.smittyState = 'PATROL';
          this.pickNextPatrolNode();
          this.playSmittyAnimation('Walk');
        }
      } else if (this.smittyState === 'PATROL_INSPECT') {
        // Inspecting an artwork in the gallery
        this.smittyInspectTimer -= delta;
        this.playSmittyAnimation('Idle');

        // Subtle eerie bobbing / slow contemplative tilt
        if (this.smittyMesh) {
          this.smittyMesh.rotation.y += Math.sin(performance.now() * 0.0015) * 0.008;
        }

        if (this.smittyInspectTimer <= 0) {
          this.smittyState = 'PATROL';
          this.pickNextPatrolNode();
          this.playSmittyAnimation('Walk');
        }
      } else if (this.smittyState === 'PATROL_DANCE') {
        this.smittyDanceTimer -= delta;
        this.playSmittyAnimation('Dance');
        if (this.smittyDanceTimer <= 0) {
          this.smittyState = 'PATROL';
          this.pickNextPatrolNode();
          this.playSmittyAnimation('Walk');
        }
      } else {
        // PATROL STATE: perusing the museum
        this.playSmittyAnimation('Walk');
        const speed = CONFIG.SMITTY.PATROL_SPEED;
        const goalNode = this.navNodes[this.smittyPatrolGoalNode] || this.navNodes[0];
        const dGoal = Math.hypot(goalNode.x - this.smittyPos.x, goalNode.z - this.smittyPos.z);

        if (this.smittyFloor === goalNode.floor && dGoal < 1.8) {
          // Reached destination room! Choose between artwork inspection (45%), dancing (35%), or continue patrol (20%)
          const roll = Math.random();
          if (roll < 0.45) {
            this.smittyState = 'PATROL_INSPECT';
            this.smittyInspectTimer = 4.5 + Math.random() * 3.5;
            this.playSmittyAnimation('Idle');
          } else if (roll < 0.80) {
            this.smittyState = 'PATROL_DANCE';
            this.smittyDanceTimer = 5.0 + Math.random() * 4.0;
            this.playSmittyAnimation('Dance');
          } else {
            this.pickNextPatrolNode();
          }
        } else {
          this.moveSmittyAlongGraph(goalNode, goalNode.floor, speed, delta, false);
        }
      }
    }

    updateSmittyHeadBone(delta) {
      if (!this.smittyBones || !this.smittyBones['Head'] || this.smittyState === 'DEAD' || !this.smittyMesh || !this.smittyMesh.visible) return;

      const head = this.smittyBones['Head'];
      const neck = this.smittyBones['Neck'];

      if (this.smittyState === 'STALK' && this.smittyStalkFreezeTimer > 0) {
        // Uncanny inquisitive head tilt when staring down player's flashlight
        const t = performance.now() * 0.015;
        head.rotation.z = 0.36 + Math.sin(t) * 0.08;
        head.rotation.x = -0.15;
        if (neck) neck.rotation.z = 0.18;
      } else if (this.smittyState === 'CHASE') {
        // Aggressive forward lurch + vertical pitch tracking towards player on stairs/slopes
        const dy = (this.playerPos.y - CONFIG.PLAYER.CAMERA_HEIGHT * 0.5) - this.smittyPos.y;
        const dHoriz = Math.hypot(this.playerPos.x - this.smittyPos.x, this.playerPos.z - this.smittyPos.z) || 1;
        const pitchAngle = Math.atan2(dy, dHoriz);
        head.rotation.x = 0.25 - Math.max(-0.65, Math.min(0.65, pitchAngle * 0.65));
        head.rotation.z = Math.sin(performance.now() * 0.02) * 0.05;
        if (neck) neck.rotation.x = -Math.max(-0.35, Math.min(0.35, pitchAngle * 0.35));
      } else if (this.smittyState === 'PATROL_INSPECT') {
        // Slow contemplative upward glance at museum artwork
        head.rotation.x = -0.32 + Math.sin(performance.now() * 0.002) * 0.08;
        head.rotation.z = Math.sin(performance.now() * 0.001) * 0.12;
      } else {
        head.rotation.set(0, 0, 0);
        if (neck) neck.rotation.set(0, 0, 0);
      }
    }

    attackPlayer() {
      this.playSmittyAnimation('Attack');
      this.audio.playSmittyGrowl();

      this.dom.damageOverlay.style.opacity = '1';
      setTimeout(() => {
        this.dom.damageOverlay.style.opacity = '0';
      }, 350);

      this.health -= CONFIG.SMITTY.ATTACK_DAMAGE;
      this.updateHud();

      this.playerPitch += (Math.random() - 0.5) * 0.25;
      this.playerYaw += (Math.random() - 0.5) * 0.25;

      if (this.health <= 0) {
        this.triggerGameOver();
      } else {
        setTimeout(() => {
          if (this.smittyState === 'CHASE') this.playSmittyAnimation('Run');
        }, 750);
      }
    }

    triggerGameOver() {
      this.isGameOver = true;
      this.releaseNativeOrBrowserLock();

      this.dom.jumpscareOverlay.classList.add('active');
      this.audio.playJumpscareStinger();

      setTimeout(() => {
        this.dom.jumpscareOverlay.classList.remove('active');
        this.dom.deathKeys.textContent = this.relicsCollected;
        const totalEl = document.querySelector('[data-text="gameover.relics_out_of"]');
        if (totalEl) totalEl.textContent = `/ ${CONFIG.TOTAL_RELICS}`;
        this.dom.deathShots.textContent = this.shotsFired;
        this.dom.deathHits.textContent = this.shotsHit;
        this.dom.gameOverModal.classList.remove('hidden');
      }, 1300);
    }

    triggerVictory() {
      this.isVictory = true;
      this.releaseNativeOrBrowserLock();

      const elapsedSec = Math.floor((Date.now() - this.startTime) / 1000);
      const mins = Math.floor(elapsedSec / 60);
      const secs = elapsedSec % 60;
      this.dom.winTime.textContent = `${mins}:${secs < 10 ? '0' : ''}${secs}`;

      const accuracy = this.shotsFired > 0 ? Math.round((this.shotsHit / this.shotsFired) * 100) : 0;
      this.dom.winAccuracy.textContent = `${accuracy}%`;

      const allRelicsEl = document.querySelector('[data-text="victory.all_relics"]');
      if (allRelicsEl) {
        allRelicsEl.textContent = T('victory.all_relics', `All ${CONFIG.TOTAL_RELICS} Relics Recovered!`, { total: CONFIG.TOTAL_RELICS });
      }

      this.dom.victoryModal.classList.remove('hidden');
    }

    updateHud() {
      const hp = Math.max(0, this.health);
      this.dom.healthValue.textContent = `${hp}`;
      if (this.dom.healthFill) {
        const hpPct = Math.min(100, Math.max(0, (hp / CONFIG.PLAYER.MAX_HEALTH) * 100));
        this.dom.healthFill.style.width = `${hpPct}%`;
        if (hpPct <= 25) {
          this.dom.healthFill.style.background = '#dc2626';
          this.dom.healthFill.style.boxShadow = '0 0 8px rgba(220, 38, 38, 0.8)';
        } else {
          this.dom.healthFill.style.background = '#ef4444';
          this.dom.healthFill.style.boxShadow = '0 0 6px rgba(239, 68, 68, 0.5)';
        }
      }
      this.dom.staminaFill.style.width = `${Math.min(100, Math.max(0, this.stamina))}%`;
      this.dom.ammoValue.textContent = `${this.ammoInMag} / ${this.reserveAmmo}`;
    }

    animate() {
      requestAnimationFrame(() => this.animate());

      const delta = Math.min(this.clock.getDelta(), 0.05);

      if (this.gameStarted && !this.isPaused && !this.isGameOver && !this.isVictory && !this.isExaminingArt) {
        this.updatePlayer(delta);
        this.updateSmitty(delta);
        this.updateLiquidBlood(delta);
        this.updateAmmoPickups(delta);
        if (this.smittyMixer && this.smittyState !== 'DEAD') this.smittyMixer.update(delta);
        this.updateSmittyHeadBone(delta);

        const time = performance.now() * 0.002;
        this.relics.forEach((r) => {
          if (!r.collected && r.floor === this.playerFloor && r.mesh) {
            // Distance culling: only render & animate relics within 38m (maximum museum fog range).
            // Prevents rendering 500k-1.5M polygon relics across opposite wings through multiple walls.
            const dSq = (r.x - this.playerPos.x) ** 2 + (r.z - this.playerPos.z) ** 2;
            const inRange = dSq < 1444; // 38m * 38m
            r.mesh.visible = inRange;
            if (inRange) {
              r.mesh.rotation.y = time * 0.8;
              r.mesh.position.y = r.y + Math.sin(time * 2.2) * 0.035;
              if (r.glowLight) r.glowLight.intensity = (dSq < 625) ? 0.45 : 0;
            } else if (r.glowLight) {
              r.glowLight.intensity = 0;
            }
          }
        });
      }

      this.renderer.render(this.scene, this.camera);
    }
  }

  window.addEventListener('DOMContentLoaded', () => {
    window.gameInstance = new MuseumGame();
  });
})();
