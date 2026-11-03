/**
 * THE MUSEUM — FOUR-STORY EXHIBITION EDITION
 * Photorealistic multi-floor architectural layout,
 * featuring 4 interconnected floors, dual 4-story U-stairwells, 136 curated gallery artworks,
 * realistic Web Audio synthesis, and a multi-floor graph-navigating Stalker AI.
 */

(() => {
  'use strict';

  const APP_VERSION = 'v1.1.0';
  window.APP_VERSION = APP_VERSION;

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
      this.gameplayActive = false;
      this.menuMusicActive = false;
      this.pendingMenuMusic = false;
      this.menuMusicSource = null;
      this.menuMusicGain = null;
      this.roomToneSource = null;
      this.roomToneGain = null;
      this.musicEnabled = (localStorage.getItem('the_museum_music') !== 'false');
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
        'relic_chime.wav', 'lockdown_disengaged.wav', 'lockdown_disengaged_death_scream.wav',
        'smitty_growl.wav', 'jumpscare_stinger.wav', 'heartbeat_pulse.wav',
        'room_tone_ambience.wav', 'MainMenu-byR3E4.wav'
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
              if (name === 'MainMenu-byR3E4.wav') {
                if (this.menuMusicActive || this.pendingMenuMusic) {
                  this.playMenuMusic();
                }
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
        gain.gain.value = this.gameplayActive ? 0.56 : 0.0001; // Silent during menus
        src.connect(gain);
        gain.connect(this.masterGain);
        src.start();
        this.roomToneSource = src;
        this.roomToneGain = gain;
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
      gain.gain.value = this.gameplayActive ? 0.18 : 0.0001; // Silent during menus

      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);
      src.start();
      this.roomToneSource = src;
      this.roomToneGain = gain;
    }

    startGameplayAudio() {
      this.gameplayActive = true;
      if (!this.roomToneSource) {
        this.startRoomTone();
      } else if (this.roomToneGain && this.ctx) {
        const now = this.ctx.currentTime;
        const targetVol = (this.customBuffers && this.customBuffers['room_tone_ambience.wav']) ? 0.56 : 0.18;
        this.roomToneGain.gain.cancelScheduledValues(now);
        this.roomToneGain.gain.setValueAtTime(this.roomToneGain.gain.value, now);
        this.roomToneGain.gain.linearRampToValueAtTime(targetVol, now + 0.3);
      }
    }

    pauseGameplayAudio() {
      this.gameplayActive = false;
      if (this.roomToneGain && this.ctx) {
        const now = this.ctx.currentTime;
        this.roomToneGain.gain.cancelScheduledValues(now);
        this.roomToneGain.gain.setValueAtTime(this.roomToneGain.gain.value, now);
        this.roomToneGain.gain.linearRampToValueAtTime(0.0001, now + 0.2);
      }
    }

    resumeGameplayAudio() {
      this.gameplayActive = true;
      if (!this.roomToneSource) {
        this.startRoomTone();
      } else if (this.roomToneGain && this.ctx) {
        const now = this.ctx.currentTime;
        const targetVol = (this.customBuffers && this.customBuffers['room_tone_ambience.wav']) ? 0.56 : 0.18;
        this.roomToneGain.gain.cancelScheduledValues(now);
        this.roomToneGain.gain.setValueAtTime(this.roomToneGain.gain.value, now);
        this.roomToneGain.gain.linearRampToValueAtTime(targetVol, now + 0.3);
      }
    }

    setMusicEnabled(enabled) {
      this.musicEnabled = !!enabled;
      try {
        localStorage.setItem('the_museum_music', this.musicEnabled ? 'true' : 'false');
      } catch (e) {}
      if (!this.musicEnabled) {
        this.fadeOutMenuMusic(0.2);
      }
    }

    playMenuMusic() {
      if (!this.musicEnabled) {
        this.menuMusicActive = false;
        this.pendingMenuMusic = false;
        return;
      }
      this.menuMusicActive = true;
      if (!this.ctx) {
        this.init();
      }
      if (!this.ctx) return;
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }

      const buf = this.customBuffers['MainMenu-byR3E4.wav'];
      if (!buf) {
        this.pendingMenuMusic = true;
        return;
      }
      this.pendingMenuMusic = false;

      if (this.menuMusicSource && this.menuMusicGain) {
        const now = this.ctx.currentTime;
        this.menuMusicGain.gain.cancelScheduledValues(now);
        this.menuMusicGain.gain.setValueAtTime(this.menuMusicGain.gain.value, now);
        this.menuMusicGain.gain.linearRampToValueAtTime(1.0, now + 0.25);
        return;
      }

      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.01, this.ctx.currentTime);
      gain.gain.linearRampToValueAtTime(1.0, this.ctx.currentTime + 0.25);

      src.connect(gain);
      gain.connect(this.masterGain);

      src.start();
      this.menuMusicSource = src;
      this.menuMusicGain = gain;
    }

    fadeOutMenuMusic(duration = 0.45) {
      this.menuMusicActive = false;
      this.pendingMenuMusic = false;
      if (!this.menuMusicSource || !this.menuMusicGain || !this.ctx) {
        return;
      }

      const now = this.ctx.currentTime;
      const currentGain = this.menuMusicGain.gain.value;
      this.menuMusicGain.gain.cancelScheduledValues(now);
      this.menuMusicGain.gain.setValueAtTime(currentGain, now);
      this.menuMusicGain.gain.linearRampToValueAtTime(0.0001, now + duration);

      const oldSource = this.menuMusicSource;
      const oldGain = this.menuMusicGain;
      this.menuMusicSource = null;
      this.menuMusicGain = null;

      setTimeout(() => {
        try {
          oldSource.stop();
          oldSource.disconnect();
          oldGain.disconnect();
        } catch (e) {}
      }, duration * 1000 + 50);
    }

    startHeartbeatLoop() {
      const beat = () => {
        if (this.initialized && this.gameplayActive && this.ctx && this.ctx.state === 'running') {
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

    playCrateImpact() {
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(160, now);
      osc.frequency.exponentialRampToValueAtTime(40, now + 0.08);
      gain.gain.setValueAtTime(0.28, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.10);
    }

    playCratePickup() {
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(360, now + 0.07);
      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.09);
    }

    playCrateCreak() {
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(85, now);
      osc.frequency.linearRampToValueAtTime(110, now + 0.06);
      osc.frequency.linearRampToValueAtTime(75, now + 0.12);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.14);
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
      if (this.playCustom('lockdown_disengaged_death_scream.wav', null, 1.36) ||
          this.playCustom('lockdown_disengaged.wav', null, 1.36)) return;
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

    playSmittyDeath() {
      if (!this.ctx) return;
      if (this.playCustom('lockdown_disengaged_death_scream.wav', null, 1.55) ||
          this.playCustom('lockdown_disengaged.wav', null, 1.55)) return;
      this.playLockdownDisengaged();
    }

    playSmittyGrowl() {
      if (!this.ctx) return;
      const nowAudio = performance.now() / 1000;
      if (this.lastGrowlTime && (nowAudio - this.lastGrowlTime < 4.0)) return;
      this.lastGrowlTime = nowAudio;
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
      const nowAudio = performance.now() / 1000;
      if (this.lastStingerAudioTime && (nowAudio - this.lastStingerAudioTime < 12.0)) return;
      this.lastStingerAudioTime = nowAudio;
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

    playSlidingDoor() {
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      if (this.lastDoorSlideAudio && (now - this.lastDoorSlideAudio < 0.75)) return;
      this.lastDoorSlideAudio = now;

      // Soft pneumatic sliding door whisper
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(160, now);
      osc.frequency.exponentialRampToValueAtTime(110, now + 0.45);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(320, now);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.05, now + 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.50);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);

      osc.start(now);
      osc.stop(now + 0.52);

      // Subtle mechanical pneumatic hiss
      if (this.noiseBuffer) {
        const noise = this.ctx.createBufferSource();
        noise.buffer = this.noiseBuffer;
        const nFilter = this.ctx.createBiquadFilter();
        nFilter.type = 'bandpass';
        nFilter.frequency.setValueAtTime(950, now);
        nFilter.Q.value = 1.2;
        const nGain = this.ctx.createGain();
        nGain.gain.setValueAtTime(0.001, now);
        nGain.gain.linearRampToValueAtTime(0.025, now + 0.05);
        nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.48);
        noise.connect(nFilter);
        nFilter.connect(nGain);
        nGain.connect(this.masterGain);
        noise.start(now, 0, 0.50);
      }
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
    TOTAL_RELICS: 14,
    FLOOR_HEIGHT: 5.2,
    NUM_FLOORS: 4,
    AMMO_PICKUP: {
      RESPAWN_TIME: 180.0, // 3 minutes respawn timer
      AMMO_AMOUNT: 5
    },
    PLAYER: {
      WALK_SPEED: 5.0,
      SPRINT_SPEED: 8.6,
      CROUCH_SPEED: 2.4,
      CAMERA_HEIGHT: 1.72,
      CROUCH_HEIGHT: 0.95,
      JUMP_FORCE: 6.6,
      GRAVITY: 16.0,
      RADIUS: 0.36,
      MOUSE_SENS: 0.0024,
      MAX_HEALTH: 100,
      MAX_STAMINA: 100
    },
    WEAPON: {
      MAG_CAPACITY: 5,
      RESERVE_AMMO: 5,
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

    // 135 Wall Frame Mount Locations across 4 floors (Smitty Dirt pillar slot removed)
  const WALL_FRAME_SLOTS = [
  {
    "floor": 0,
    "x": -35.65,
    "y": 2.35,
    "z": -2.0,
    "rotY": 1.5708
  },
  {
    "floor": 0,
    "x": -35.65,
    "y": 2.35,
    "z": 3.0,
    "rotY": 1.5708
  },
  {
    "floor": 0,
    "x": -35.65,
    "y": 2.35,
    "z": 8.0,
    "rotY": 1.5708
  },
  {
    "floor": 0,
    "x": -35.65,
    "y": 2.35,
    "z": 13.0,
    "rotY": 1.5708
  },
  {
    "floor": 0,
    "x": -32.0,
    "y": 2.35,
    "z": -5.65,
    "rotY": 0.0
  },
  {
    "floor": 0,
    "x": -20.0,
    "y": 2.35,
    "z": -5.65,
    "rotY": 0.0
  },
  {
    "floor": 0,
    "x": -16.35,
    "y": 2.35,
    "z": 2.0,
    "rotY": -1.5708
  },
  {
    "floor": 0,
    "x": -16.35,
    "y": 2.35,
    "z": 10.0,
    "rotY": -1.5708
  },
  {
    "floor": 0,
    "x": -12.5,
    "y": 2.35,
    "z": -17.65,
    "rotY": 0.0
  },
  {
    "floor": 0,
    "x": -7.5,
    "y": 2.35,
    "z": -17.65,
    "rotY": 0.0
  },
  {
    "floor": 0,
    "x": -15.65,
    "y": 2.35,
    "z": -12.0,
    "rotY": 1.5708
  },
  {
    "floor": 0,
    "x": -15.65,
    "y": 2.35,
    "z": 2.0,
    "rotY": 1.5708
  },
  {
    "floor": 0,
    "x": -15.65,
    "y": 2.35,
    "z": 10.0,
    "rotY": 1.5708
  },
  {
    "floor": 0,
    "x": -4.35,
    "y": 2.35,
    "z": -2.0,
    "rotY": -1.5708
  },
  {
    "floor": 0,
    "x": -4.35,
    "y": 2.35,
    "z": 13.0,
    "rotY": -1.5708
  },
  {
    "floor": 0,
    "x": 1.0,
    "y": 2.35,
    "z": -39.65,
    "rotY": 0.0
  },
  {
    "floor": 0,
    "x": 23.0,
    "y": 2.35,
    "z": -39.65,
    "rotY": 0.0
  },
  {
    "floor": 0,
    "x": 9.5,
    "y": 2.35,
    "z": -41.65,
    "rotY": 0.0
  },
  {
    "floor": 0,
    "x": 14.5,
    "y": 2.35,
    "z": -41.65,
    "rotY": 0.0
  },
  {
    "floor": 0,
    "x": -3.65,
    "y": 2.35,
    "z": -33.0,
    "rotY": 1.5708
  },
  {
    "floor": 0,
    "x": 27.65,
    "y": 2.35,
    "z": -33.0,
    "rotY": -1.5708
  },
  {
    "floor": 0,
    "x": 11.0,
    "y": 2.35,
    "z": -26.35,
    "rotY": 3.1416
  },
  {
    "floor": 0,
    "x": 11.0,
    "y": 2.35,
    "z": -25.65,
    "rotY": 0.0
  },
  {
    "floor": 0,
    "x": 24.5,
    "y": 2.35,
    "z": -25.65,
    "rotY": 0.0
  },
  {
    "floor": 0,
    "x": 32.65,
    "y": 2.35,
    "z": -18.0,
    "rotY": -1.5708
  },
  {
    "floor": 0,
    "x": 32.65,
    "y": 2.35,
    "z": -4.0,
    "rotY": -1.5708
  },
  {
    "floor": 0,
    "x": 27.65,
    "y": 2.35,
    "z": -11.0,
    "rotY": -1.5708
  },
  {
    "floor": 0,
    "x": 27.65,
    "y": 2.35,
    "z": 4.0,
    "rotY": -1.5708
  },
  {
    "floor": 0,
    "x": -33.65,
    "y": 2.35,
    "z": 23.0,
    "rotY": 1.5708
  },
  {
    "floor": 0,
    "x": 32.65,
    "y": 2.35,
    "z": 13.0,
    "rotY": -1.5708
  },
  {
    "floor": 0,
    "x": 4.0,
    "y": 2.35,
    "z": 27.65,
    "rotY": 3.1416
  },
  {
    "floor": 0,
    "x": 19.0,
    "y": 2.35,
    "z": 33.65,
    "rotY": 3.1416
  },
  {
    "floor": 0,
    "x": 27.65,
    "y": 2.35,
    "z": 23.0,
    "rotY": -1.5708
  },
  {
    "floor": 1,
    "x": -35.65,
    "y": 7.55,
    "z": -2.0,
    "rotY": 1.5708
  },
  {
    "floor": 1,
    "x": -35.65,
    "y": 7.55,
    "z": 3.0,
    "rotY": 1.5708
  },
  {
    "floor": 1,
    "x": -35.65,
    "y": 7.55,
    "z": 8.0,
    "rotY": 1.5708
  },
  {
    "floor": 1,
    "x": -35.65,
    "y": 7.55,
    "z": 13.0,
    "rotY": 1.5708
  },
  {
    "floor": 1,
    "x": -32.0,
    "y": 7.55,
    "z": -5.65,
    "rotY": 0.0
  },
  {
    "floor": 1,
    "x": -20.0,
    "y": 7.55,
    "z": -5.65,
    "rotY": 0.0
  },
  {
    "floor": 1,
    "x": -16.35,
    "y": 7.55,
    "z": 2.0,
    "rotY": -1.5708
  },
  {
    "floor": 1,
    "x": -16.35,
    "y": 7.55,
    "z": 10.0,
    "rotY": -1.5708
  },
  {
    "floor": 1,
    "x": -12.5,
    "y": 7.55,
    "z": -17.65,
    "rotY": 0.0
  },
  {
    "floor": 1,
    "x": -7.5,
    "y": 7.55,
    "z": -17.65,
    "rotY": 0.0
  },
  {
    "floor": 1,
    "x": -15.65,
    "y": 7.55,
    "z": -12.0,
    "rotY": 1.5708
  },
  {
    "floor": 1,
    "x": -15.65,
    "y": 7.55,
    "z": 2.0,
    "rotY": 1.5708
  },
  {
    "floor": 1,
    "x": -15.65,
    "y": 7.55,
    "z": 10.0,
    "rotY": 1.5708
  },
  {
    "floor": 1,
    "x": -4.35,
    "y": 7.55,
    "z": -10.0,
    "rotY": -1.5708
  },
  {
    "floor": 1,
    "x": -4.35,
    "y": 7.55,
    "z": -2.0,
    "rotY": -1.5708
  },
  {
    "floor": 1,
    "x": -4.35,
    "y": 7.55,
    "z": 13.0,
    "rotY": -1.5708
  },
  {
    "floor": 1,
    "x": 1.0,
    "y": 7.55,
    "z": -39.65,
    "rotY": 0.0
  },
  {
    "floor": 1,
    "x": 23.0,
    "y": 7.55,
    "z": -39.65,
    "rotY": 0.0
  },
  {
    "floor": 1,
    "x": 9.5,
    "y": 7.55,
    "z": -41.65,
    "rotY": 0.0
  },
  {
    "floor": 1,
    "x": 14.5,
    "y": 7.55,
    "z": -41.65,
    "rotY": 0.0
  },
  {
    "floor": 1,
    "x": -3.65,
    "y": 7.55,
    "z": -33.0,
    "rotY": 1.5708
  },
  {
    "floor": 1,
    "x": 27.65,
    "y": 7.55,
    "z": -33.0,
    "rotY": -1.5708
  },
  {
    "floor": 1,
    "x": 11.0,
    "y": 7.55,
    "z": -26.35,
    "rotY": 3.1416
  },
  {
    "floor": 1,
    "x": 11.0,
    "y": 7.55,
    "z": -25.65,
    "rotY": 0.0
  },
  {
    "floor": 1,
    "x": 24.5,
    "y": 7.55,
    "z": -25.65,
    "rotY": 0.0
  },
  {
    "floor": 1,
    "x": 32.65,
    "y": 7.55,
    "z": -18.0,
    "rotY": -1.5708
  },
  {
    "floor": 1,
    "x": 32.65,
    "y": 7.55,
    "z": -4.0,
    "rotY": -1.5708
  },
  {
    "floor": 1,
    "x": 27.65,
    "y": 7.55,
    "z": -11.0,
    "rotY": -1.5708
  },
  {
    "floor": 1,
    "x": 27.65,
    "y": 7.55,
    "z": 4.0,
    "rotY": -1.5708
  },
  {
    "floor": 1,
    "x": -33.65,
    "y": 7.55,
    "z": 23.0,
    "rotY": 1.5708
  },
  {
    "floor": 1,
    "x": 32.65,
    "y": 7.55,
    "z": 13.0,
    "rotY": -1.5708
  },
  {
    "floor": 1,
    "x": 4.0,
    "y": 7.55,
    "z": 27.65,
    "rotY": 3.1416
  },
  {
    "floor": 1,
    "x": 19.0,
    "y": 7.55,
    "z": 33.65,
    "rotY": 3.1416
  },
  {
    "floor": 1,
    "x": 27.65,
    "y": 7.55,
    "z": 23.0,
    "rotY": -1.5708
  },
  {
    "floor": 2,
    "x": -35.65,
    "y": 12.75,
    "z": -2.0,
    "rotY": 1.5708
  },
  {
    "floor": 2,
    "x": -35.65,
    "y": 12.75,
    "z": 3.0,
    "rotY": 1.5708
  },
  {
    "floor": 2,
    "x": -35.65,
    "y": 12.75,
    "z": 8.0,
    "rotY": 1.5708
  },
  {
    "floor": 2,
    "x": -35.65,
    "y": 12.75,
    "z": 13.0,
    "rotY": 1.5708
  },
  {
    "floor": 2,
    "x": -32.0,
    "y": 12.75,
    "z": -5.65,
    "rotY": 0.0
  },
  {
    "floor": 2,
    "x": -20.0,
    "y": 12.75,
    "z": -5.65,
    "rotY": 0.0
  },
  {
    "floor": 2,
    "x": -16.35,
    "y": 12.75,
    "z": 2.0,
    "rotY": -1.5708
  },
  {
    "floor": 2,
    "x": -16.35,
    "y": 12.75,
    "z": 10.0,
    "rotY": -1.5708
  },
  {
    "floor": 2,
    "x": -12.5,
    "y": 12.75,
    "z": -17.65,
    "rotY": 0.0
  },
  {
    "floor": 2,
    "x": -7.5,
    "y": 12.75,
    "z": -17.65,
    "rotY": 0.0
  },
  {
    "floor": 2,
    "x": -15.65,
    "y": 12.75,
    "z": -12.0,
    "rotY": 1.5708
  },
  {
    "floor": 2,
    "x": -15.65,
    "y": 12.75,
    "z": 2.0,
    "rotY": 1.5708
  },
  {
    "floor": 2,
    "x": -15.65,
    "y": 12.75,
    "z": 10.0,
    "rotY": 1.5708
  },
  {
    "floor": 2,
    "x": -4.35,
    "y": 12.75,
    "z": -10.0,
    "rotY": -1.5708
  },
  {
    "floor": 2,
    "x": -4.35,
    "y": 12.75,
    "z": -2.0,
    "rotY": -1.5708
  },
  {
    "floor": 2,
    "x": -4.35,
    "y": 12.75,
    "z": 13.0,
    "rotY": -1.5708
  },
  {
    "floor": 2,
    "x": 1.0,
    "y": 12.75,
    "z": -39.65,
    "rotY": 0.0
  },
  {
    "floor": 2,
    "x": 23.0,
    "y": 12.75,
    "z": -39.65,
    "rotY": 0.0
  },
  {
    "floor": 2,
    "x": 9.5,
    "y": 12.75,
    "z": -41.65,
    "rotY": 0.0
  },
  {
    "floor": 2,
    "x": 14.5,
    "y": 12.75,
    "z": -41.65,
    "rotY": 0.0
  },
  {
    "floor": 2,
    "x": -3.65,
    "y": 12.75,
    "z": -33.0,
    "rotY": 1.5708
  },
  {
    "floor": 2,
    "x": 27.65,
    "y": 12.75,
    "z": -33.0,
    "rotY": -1.5708
  },
  {
    "floor": 2,
    "x": 11.0,
    "y": 12.75,
    "z": -26.35,
    "rotY": 3.1416
  },
  {
    "floor": 2,
    "x": 11.0,
    "y": 12.75,
    "z": -25.65,
    "rotY": 0.0
  },
  {
    "floor": 2,
    "x": 24.5,
    "y": 12.75,
    "z": -25.65,
    "rotY": 0.0
  },
  {
    "floor": 2,
    "x": 32.65,
    "y": 12.75,
    "z": -18.0,
    "rotY": -1.5708
  },
  {
    "floor": 2,
    "x": 32.65,
    "y": 12.75,
    "z": -4.0,
    "rotY": -1.5708
  },
  {
    "floor": 2,
    "x": 27.65,
    "y": 12.75,
    "z": -11.0,
    "rotY": -1.5708
  },
  {
    "floor": 2,
    "x": 27.65,
    "y": 12.75,
    "z": 4.0,
    "rotY": -1.5708
  },
  {
    "floor": 2,
    "x": -33.65,
    "y": 12.75,
    "z": 23.0,
    "rotY": 1.5708
  },
  {
    "floor": 2,
    "x": 32.65,
    "y": 12.75,
    "z": 13.0,
    "rotY": -1.5708
  },
  {
    "floor": 2,
    "x": 4.0,
    "y": 12.75,
    "z": 27.65,
    "rotY": 3.1416
  },
  {
    "floor": 2,
    "x": 19.0,
    "y": 12.75,
    "z": 33.65,
    "rotY": 3.1416
  },
  {
    "floor": 2,
    "x": 27.65,
    "y": 12.75,
    "z": 23.0,
    "rotY": -1.5708
  },
  {
    "floor": 3,
    "x": -35.65,
    "y": 17.95,
    "z": -2.0,
    "rotY": 1.5708
  },
  {
    "floor": 3,
    "x": -35.65,
    "y": 17.95,
    "z": 3.0,
    "rotY": 1.5708
  },
  {
    "floor": 3,
    "x": -35.65,
    "y": 17.95,
    "z": 8.0,
    "rotY": 1.5708
  },
  {
    "floor": 3,
    "x": -35.65,
    "y": 17.95,
    "z": 13.0,
    "rotY": 1.5708
  },
  {
    "floor": 3,
    "x": -32.0,
    "y": 17.95,
    "z": -5.65,
    "rotY": 0.0
  },
  {
    "floor": 3,
    "x": -20.0,
    "y": 17.95,
    "z": -5.65,
    "rotY": 0.0
  },
  {
    "floor": 3,
    "x": -16.35,
    "y": 17.95,
    "z": 2.0,
    "rotY": -1.5708
  },
  {
    "floor": 3,
    "x": -16.35,
    "y": 17.95,
    "z": 10.0,
    "rotY": -1.5708
  },
  {
    "floor": 3,
    "x": -12.5,
    "y": 17.95,
    "z": -17.65,
    "rotY": 0.0
  },
  {
    "floor": 3,
    "x": -7.5,
    "y": 17.95,
    "z": -17.65,
    "rotY": 0.0
  },
  {
    "floor": 3,
    "x": -15.65,
    "y": 17.95,
    "z": -12.0,
    "rotY": 1.5708
  },
  {
    "floor": 3,
    "x": -15.65,
    "y": 17.95,
    "z": 2.0,
    "rotY": 1.5708
  },
  {
    "floor": 3,
    "x": -15.65,
    "y": 17.95,
    "z": 10.0,
    "rotY": 1.5708
  },
  {
    "floor": 3,
    "x": -4.35,
    "y": 17.95,
    "z": -10.0,
    "rotY": -1.5708
  },
  {
    "floor": 3,
    "x": -4.35,
    "y": 17.95,
    "z": -2.0,
    "rotY": -1.5708
  },
  {
    "floor": 3,
    "x": -4.35,
    "y": 17.95,
    "z": 13.0,
    "rotY": -1.5708
  },
  {
    "floor": 3,
    "x": 1.0,
    "y": 17.95,
    "z": -39.65,
    "rotY": 0.0
  },
  {
    "floor": 3,
    "x": 23.0,
    "y": 17.95,
    "z": -39.65,
    "rotY": 0.0
  },
  {
    "floor": 3,
    "x": 9.5,
    "y": 17.95,
    "z": -41.65,
    "rotY": 0.0
  },
  {
    "floor": 3,
    "x": 14.5,
    "y": 17.95,
    "z": -41.65,
    "rotY": 0.0
  },
  {
    "floor": 3,
    "x": -3.65,
    "y": 17.95,
    "z": -33.0,
    "rotY": 1.5708
  },
  {
    "floor": 3,
    "x": 27.65,
    "y": 17.95,
    "z": -33.0,
    "rotY": -1.5708
  },
  {
    "floor": 3,
    "x": 11.0,
    "y": 17.95,
    "z": -26.35,
    "rotY": 3.1416
  },
  {
    "floor": 3,
    "x": 11.0,
    "y": 17.95,
    "z": -25.65,
    "rotY": 0.0
  },
  {
    "floor": 3,
    "x": 24.5,
    "y": 17.95,
    "z": -25.65,
    "rotY": 0.0
  },
  {
    "floor": 3,
    "x": 32.65,
    "y": 17.95,
    "z": -18.0,
    "rotY": -1.5708
  },
  {
    "floor": 3,
    "x": 32.65,
    "y": 17.95,
    "z": -4.0,
    "rotY": -1.5708
  },
  {
    "floor": 3,
    "x": 27.65,
    "y": 17.95,
    "z": -11.0,
    "rotY": -1.5708
  },
  {
    "floor": 3,
    "x": 27.65,
    "y": 17.95,
    "z": 4.0,
    "rotY": -1.5708
  },
  {
    "floor": 3,
    "x": -33.65,
    "y": 17.95,
    "z": 23.0,
    "rotY": 1.5708
  },
  {
    "floor": 3,
    "x": 32.65,
    "y": 17.95,
    "z": 13.0,
    "rotY": -1.5708
  },
  {
    "floor": 3,
    "x": 4.0,
    "y": 17.95,
    "z": 27.65,
    "rotY": 3.1416
  },
  {
    "floor": 3,
    "x": 19.0,
    "y": 17.95,
    "z": 33.65,
    "rotY": 3.1416
  },
  {
    "floor": 3,
    "x": 27.65,
    "y": 17.95,
    "z": 23.0,
    "rotY": -1.5708
  }
];

  // Curated Exhibition Artworks organized by floor (randomized per floor at runtime)
  const CURATED_ARTWORKS = [
  {
    "id": 1,
    "floor": 0,
    "title": "Smitty Silly",
    "file": "assets/gallery/001_Smitty-silly.gif",
    "wing": "1ST FLOOR",
    "w": 2.024,
    "h": 2.15
  },
  {
    "id": 2,
    "floor": 0,
    "title": "Emoji Movie",
    "file": "assets/gallery/002_Emoji-movie.jpg",
    "wing": "1ST FLOOR",
    "w": 2.15,
    "h": 2.15
  },
  {
    "id": 3,
    "floor": 0,
    "title": "Pinkthing",
    "file": "assets/gallery/003_pinkthing.jpg",
    "wing": "1ST FLOOR",
    "w": 2.15,
    "h": 1.391
  },
  {
    "id": 4,
    "floor": 0,
    "title": "Iwanttolivebythesea",
    "file": "assets/gallery/004_iwanttolivebythesea.jpg",
    "wing": "1ST FLOOR",
    "w": 2.15,
    "h": 1.613
  },
  {
    "id": 5,
    "floor": 0,
    "title": "Frenchhouse",
    "file": "assets/gallery/005_frenchhouse.jpg",
    "wing": "1ST FLOOR",
    "w": 2.15,
    "h": 2.15
  },
  {
    "id": 6,
    "floor": 0,
    "title": "Curator S Assets",
    "file": "assets/gallery/006_Curator_s_Assets.jpg",
    "wing": "1ST FLOOR",
    "w": 2.15,
    "h": 1.391
  },
  {
    "id": 7,
    "floor": 0,
    "title": "Painting Grey Face",
    "file": "assets/gallery/007_painting-grey-face.jpg",
    "wing": "1ST FLOOR",
    "w": 1.683,
    "h": 2.15
  },
  {
    "id": 8,
    "floor": 0,
    "title": "Smitty Wild Animal Framed",
    "file": "assets/gallery/008_Smitty-wild-animal-framed.jpg",
    "wing": "1ST FLOOR",
    "w": 2.15,
    "h": 1.609
  },
  {
    "id": 9,
    "floor": 0,
    "title": "Leadership Lemon",
    "file": "assets/gallery/009_leadership-lemon.jpg",
    "wing": "1ST FLOOR",
    "w": 2.15,
    "h": 1.613
  },
  {
    "id": 10,
    "floor": 0,
    "title": "Star Ez Duz It",
    "file": "assets/gallery/010_star-ez-duz-it.jpg",
    "wing": "1ST FLOOR",
    "w": 2.15,
    "h": 2.15
  },
  {
    "id": 11,
    "floor": 0,
    "title": "Smitty Cola Melt Shirtless",
    "file": "assets/gallery/011_smitty-cola-melt-shirtless.jpg",
    "wing": "1ST FLOOR",
    "w": 2.15,
    "h": 2.15
  },
  {
    "id": 12,
    "floor": 0,
    "title": "Shocksites",
    "file": "assets/gallery/012_shocksites.jpg",
    "wing": "1ST FLOOR",
    "w": 2.15,
    "h": 1.433
  },
  {
    "id": 13,
    "floor": 0,
    "title": "Gemini",
    "file": "assets/gallery/013_gemini.jpg",
    "wing": "1ST FLOOR",
    "w": 1.661,
    "h": 2.15
  },
  {
    "id": 14,
    "floor": 0,
    "title": "E9e",
    "file": "assets/gallery/015_E9e.jpg",
    "wing": "1ST FLOOR",
    "w": 2.15,
    "h": 2.15
  },
  {
    "id": 15,
    "floor": 0,
    "title": "Bathbomb",
    "file": "assets/gallery/016_bathbomb.jpg",
    "wing": "1ST FLOOR",
    "w": 2.15,
    "h": 2.15
  },
  {
    "id": 16,
    "floor": 0,
    "title": "Crate Challenge",
    "file": "assets/gallery/017_crate-challenge.jpg",
    "wing": "1ST FLOOR",
    "w": 2.15,
    "h": 1.391
  },
  {
    "id": 17,
    "floor": 0,
    "title": "Elderly Portrait",
    "file": "assets/gallery/018_elderly-portrait.jpg",
    "wing": "1ST FLOOR",
    "w": 1.437,
    "h": 2.15
  },
  {
    "id": 18,
    "floor": 0,
    "title": "Astonishment",
    "file": "assets/gallery/019_astonishment.jpg",
    "wing": "1ST FLOOR",
    "w": 2.15,
    "h": 1.252
  },
  {
    "id": 19,
    "floor": 0,
    "title": "Sf Astonishment Ad",
    "file": "assets/gallery/020_sf-astonishment-ad.jpg",
    "wing": "1ST FLOOR",
    "w": 2.15,
    "h": 2.141
  },
  {
    "id": 20,
    "floor": 0,
    "title": "Heknah Wallpaper As",
    "file": "assets/gallery/021_heknah-wallpaper-AS.jpg",
    "wing": "1ST FLOOR",
    "w": 2.15,
    "h": 1.209
  },
  {
    "id": 21,
    "floor": 0,
    "title": "Spongeclownbob",
    "file": "assets/gallery/022_spongeclownbob.jpg",
    "wing": "1ST FLOOR",
    "w": 2.15,
    "h": 1.641
  },
  {
    "id": 22,
    "floor": 0,
    "title": "Smittys Room Toon",
    "file": "assets/gallery/023_smittys-room-toon.jpg",
    "wing": "1ST FLOOR",
    "w": 2.15,
    "h": 1.391
  },
  {
    "id": 23,
    "floor": 0,
    "title": "Smittys Room Live Action",
    "file": "assets/gallery/024_smittys-room-live-action.jpg",
    "wing": "1ST FLOOR",
    "w": 2.15,
    "h": 1.39
  },
  {
    "id": 24,
    "floor": 0,
    "title": "Pinocchio",
    "file": "assets/gallery/025_pinocchio.jpg",
    "wing": "1ST FLOOR",
    "w": 2.053,
    "h": 2.15
  },
  {
    "id": 25,
    "floor": 0,
    "title": "Shawtys Mix",
    "file": "assets/gallery/026_shawtys-mix.jpg",
    "wing": "1ST FLOOR",
    "w": 1.661,
    "h": 2.15
  },
  {
    "id": 26,
    "floor": 0,
    "title": "2008 Red Fox",
    "file": "assets/gallery/027_2008-red-fox.jpg",
    "wing": "1ST FLOOR",
    "w": 2.15,
    "h": 1.47
  },
  {
    "id": 27,
    "floor": 0,
    "title": "Rip Odi",
    "file": "assets/gallery/028_rip-odi.jpg",
    "wing": "1ST FLOOR",
    "w": 2.15,
    "h": 2.135
  },
  {
    "id": 28,
    "floor": 0,
    "title": "Shrefflo Smittyfantastic",
    "file": "assets/gallery/029_Shrefflo-SmittyFantastic.jpg",
    "wing": "1ST FLOOR",
    "w": 2.15,
    "h": 1.727
  },
  {
    "id": 29,
    "floor": 0,
    "title": "Cherry Drink",
    "file": "assets/gallery/030_cherry-drink.jpg",
    "wing": "1ST FLOOR",
    "w": 2.15,
    "h": 1.474
  },
  {
    "id": 30,
    "floor": 0,
    "title": "Trumpa",
    "file": "assets/gallery/031_trumpa.jpg",
    "wing": "1ST FLOOR",
    "w": 1.969,
    "h": 2.15
  },
  {
    "id": 31,
    "floor": 0,
    "title": "Dynamic",
    "file": "assets/gallery/032_dynamic.jpg",
    "wing": "1ST FLOOR",
    "w": 2.15,
    "h": 1.209
  },
  {
    "id": 32,
    "floor": 0,
    "title": "Work Breakroom",
    "file": "assets/gallery/033_work-breakroom.jpg",
    "wing": "1ST FLOOR",
    "w": 1.721,
    "h": 2.15
  },
  {
    "id": 33,
    "floor": 0,
    "title": "Mocha Slip",
    "file": "assets/gallery/034_mocha-slip.jpg",
    "wing": "1ST FLOOR",
    "w": 2.15,
    "h": 2.15
  },
  {
    "id": 34,
    "floor": 1,
    "title": "Spotify Ad",
    "file": "assets/gallery/035_spotify-ad.jpg",
    "wing": "2ND FLOOR",
    "w": 2.15,
    "h": 2.021
  },
  {
    "id": 35,
    "floor": 1,
    "title": "Shake It For Me",
    "file": "assets/gallery/036_shake-it-for-me.jpg",
    "wing": "2ND FLOOR",
    "w": 2.15,
    "h": 1.391
  },
  {
    "id": 36,
    "floor": 1,
    "title": "Misty Morning",
    "file": "assets/gallery/037_misty-morning.jpg",
    "wing": "2ND FLOOR",
    "w": 2.15,
    "h": 1.209
  },
  {
    "id": 37,
    "floor": 1,
    "title": "Omelette On Paper",
    "file": "assets/gallery/038_omelette-on_paper.jpg",
    "wing": "2ND FLOOR",
    "w": 1.661,
    "h": 2.15
  },
  {
    "id": 38,
    "floor": 1,
    "title": "Bird Mouth",
    "file": "assets/gallery/039_bird-mouth.jpg",
    "wing": "2ND FLOOR",
    "w": 2.15,
    "h": 2.15
  },
  {
    "id": 39,
    "floor": 1,
    "title": "4who",
    "file": "assets/gallery/040_4Who.jpg",
    "wing": "2ND FLOOR",
    "w": 2.15,
    "h": 2.15
  },
  {
    "id": 40,
    "floor": 1,
    "title": "Joyous Protection",
    "file": "assets/gallery/041_Joyous_Protection.jpg",
    "wing": "2ND FLOOR",
    "w": 2.15,
    "h": 2.15
  },
  {
    "id": 41,
    "floor": 1,
    "title": "Made U A Bird",
    "file": "assets/gallery/042_made-u-a-bird.jpg",
    "wing": "2ND FLOOR",
    "w": 1.768,
    "h": 2.15
  },
  {
    "id": 42,
    "floor": 1,
    "title": "Dog Drawing",
    "file": "assets/gallery/043_dog-drawing.jpg",
    "wing": "2ND FLOOR",
    "w": 2.15,
    "h": 2.15
  },
  {
    "id": 43,
    "floor": 1,
    "title": "Smitty Pixels Mussel Heart",
    "file": "assets/gallery/044_Smitty-pixels-mussel-heart.jpg",
    "wing": "2ND FLOOR",
    "w": 2.15,
    "h": 1.86
  },
  {
    "id": 44,
    "floor": 1,
    "title": "Hans",
    "file": "assets/gallery/045_Hans.jpg",
    "wing": "2ND FLOOR",
    "w": 1.53,
    "h": 2.15
  },
  {
    "id": 45,
    "floor": 1,
    "title": "Blip Vision Pizza Reach",
    "file": "assets/gallery/046_blip-vision-pizza-reach.jpg",
    "wing": "2ND FLOOR",
    "w": 2.15,
    "h": 2.15
  },
  {
    "id": 46,
    "floor": 1,
    "title": "Lake Excursion Ad",
    "file": "assets/gallery/047_lake-excursion-ad.jpg",
    "wing": "2ND FLOOR",
    "w": 2.15,
    "h": 1.209
  },
  {
    "id": 47,
    "floor": 1,
    "title": "Sand",
    "file": "assets/gallery/048_Sand.jpg",
    "wing": "2ND FLOOR",
    "w": 2.15,
    "h": 1.474
  },
  {
    "id": 48,
    "floor": 1,
    "title": "Floating Boxer Ad",
    "file": "assets/gallery/049_floating-boxer-ad.jpg",
    "wing": "2ND FLOOR",
    "w": 1.919,
    "h": 2.15
  },
  {
    "id": 49,
    "floor": 1,
    "title": "Peter Griffin Tribute",
    "file": "assets/gallery/050_peter-griffin-tribute.jpg",
    "wing": "2ND FLOOR",
    "w": 2.15,
    "h": 1.474
  },
  {
    "id": 50,
    "floor": 1,
    "title": "Imagen",
    "file": "assets/gallery/051_imagen.jpg",
    "wing": "2ND FLOOR",
    "w": 2.15,
    "h": 1.991
  },
  {
    "id": 51,
    "floor": 1,
    "title": "Spew",
    "file": "assets/gallery/052_spew.jpg",
    "wing": "2ND FLOOR",
    "w": 2.15,
    "h": 1.474
  },
  {
    "id": 52,
    "floor": 1,
    "title": "Purple Smile",
    "file": "assets/gallery/053_purple-smile.jpg",
    "wing": "2ND FLOOR",
    "w": 2.15,
    "h": 1.378
  },
  {
    "id": 53,
    "floor": 1,
    "title": "Smitty Ocean Storm",
    "file": "assets/gallery/054_Smitty-ocean-storm.jpg",
    "wing": "2ND FLOOR",
    "w": 2.15,
    "h": 1.818
  },
  {
    "id": 54,
    "floor": 1,
    "title": "Liberal Lawn Sign",
    "file": "assets/gallery/055_liberal-lawn-sign.jpg",
    "wing": "2ND FLOOR",
    "w": 2.15,
    "h": 1.546
  },
  {
    "id": 55,
    "floor": 1,
    "title": "Smitty Cow",
    "file": "assets/gallery/056_smitty-cow.jpg",
    "wing": "2ND FLOOR",
    "w": 2.15,
    "h": 2.15
  },
  {
    "id": 56,
    "floor": 1,
    "title": "Ancient Predators",
    "file": "assets/gallery/057_ancient-predators.jpg",
    "wing": "2ND FLOOR",
    "w": 2.15,
    "h": 1.561
  },
  {
    "id": 57,
    "floor": 1,
    "title": "Hey Guy Tv",
    "file": "assets/gallery/058_hey-guy-tv.jpg",
    "wing": "2ND FLOOR",
    "w": 2.15,
    "h": 1.715
  },
  {
    "id": 58,
    "floor": 1,
    "title": "Yellow Guy Cute",
    "file": "assets/gallery/059_yellow-guy-cute.jpg",
    "wing": "2ND FLOOR",
    "w": 2.15,
    "h": 2.15
  },
  {
    "id": 59,
    "floor": 1,
    "title": "Smitty Blackbox Sigil Tee",
    "file": "assets/gallery/060_Smitty-BlackBox_Sigil_Tee.jpg",
    "wing": "2ND FLOOR",
    "w": 2.15,
    "h": 2.15
  },
  {
    "id": 60,
    "floor": 1,
    "title": "Annoyeornej",
    "file": "assets/gallery/061_annoyeornej.jpg",
    "wing": "2ND FLOOR",
    "w": 2.15,
    "h": 1.207
  },
  {
    "id": 61,
    "floor": 1,
    "title": "Dogandghostthings",
    "file": "assets/gallery/062_dogandghostthings.jpg",
    "wing": "2ND FLOOR",
    "w": 2.15,
    "h": 1.474
  },
  {
    "id": 62,
    "floor": 1,
    "title": "Thin Blue Line",
    "file": "assets/gallery/063_thin-blue-line.jpg",
    "wing": "2ND FLOOR",
    "w": 2.15,
    "h": 2.012
  },
  {
    "id": 63,
    "floor": 1,
    "title": "Space Planet",
    "file": "assets/gallery/064_Space-planet.jpg",
    "wing": "2ND FLOOR",
    "w": 2.15,
    "h": 2.15
  },
  {
    "id": 64,
    "floor": 1,
    "title": "Messages From God",
    "file": "assets/gallery/065_messages-from-God.jpg",
    "wing": "2ND FLOOR",
    "w": 1.683,
    "h": 2.15
  },
  {
    "id": 65,
    "floor": 1,
    "title": "Beach Video",
    "file": "assets/gallery/066_beach-video.jpg",
    "wing": "2ND FLOOR",
    "w": 2.15,
    "h": 2.15
  },
  {
    "id": 66,
    "floor": 1,
    "title": "Grafeetee",
    "file": "assets/gallery/067_grafeetee.jpg",
    "wing": "2ND FLOOR",
    "w": 2.15,
    "h": 1.209
  },
  {
    "id": 67,
    "floor": 1,
    "title": "Sf Penguin 1",
    "file": "assets/gallery/068_SF-penguin-1.jpg",
    "wing": "2ND FLOOR",
    "w": 2.15,
    "h": 2.15
  },
  {
    "id": 68,
    "floor": 2,
    "title": "Penguin 2",
    "file": "assets/gallery/069_penguin-2.jpg",
    "wing": "3RD FLOOR",
    "w": 2.15,
    "h": 1.209
  },
  {
    "id": 69,
    "floor": 2,
    "title": "Sf Beach Photo Drawn Eyebrows",
    "file": "assets/gallery/070_SF_beach_photo_drawn_eyebrows.jpg",
    "wing": "3RD FLOOR",
    "w": 2.15,
    "h": 2.15
  },
  {
    "id": 70,
    "floor": 2,
    "title": "Yellow Ball Face",
    "file": "assets/gallery/071_yellow-ball-face.jpg",
    "wing": "3RD FLOOR",
    "w": 2.15,
    "h": 1.474
  },
  {
    "id": 71,
    "floor": 2,
    "title": "Evil Purple Pixelated Face",
    "file": "assets/gallery/072_evil-purple-pixelated-face.jpg",
    "wing": "3RD FLOOR",
    "w": 1.93,
    "h": 2.15
  },
  {
    "id": 72,
    "floor": 2,
    "title": "Fancy",
    "file": "assets/gallery/073_fancy.jpg",
    "wing": "3RD FLOOR",
    "w": 2.15,
    "h": 2.15
  },
  {
    "id": 73,
    "floor": 2,
    "title": "Cow Flag",
    "file": "assets/gallery/074_cow-flag.jpg",
    "wing": "3RD FLOOR",
    "w": 2.15,
    "h": 1.209
  },
  {
    "id": 74,
    "floor": 2,
    "title": "The Big Man",
    "file": "assets/gallery/075_the-big-man.jpg",
    "wing": "3RD FLOOR",
    "w": 2.15,
    "h": 1.7
  },
  {
    "id": 75,
    "floor": 2,
    "title": "Consumer Sculpture",
    "file": "assets/gallery/076_consumer-sculpture.jpg",
    "wing": "3RD FLOOR",
    "w": 2.15,
    "h": 1.463
  },
  {
    "id": 76,
    "floor": 2,
    "title": "Green Guy With Wings",
    "file": "assets/gallery/077_green-guy-with-wings.jpg",
    "wing": "3RD FLOOR",
    "w": 2.15,
    "h": 1.535
  },
  {
    "id": 77,
    "floor": 2,
    "title": "Pointy World Car Fire",
    "file": "assets/gallery/078_pointy-world-car-fire.jpg",
    "wing": "3RD FLOOR",
    "w": 2.15,
    "h": 1.613
  },
  {
    "id": 78,
    "floor": 2,
    "title": "Paint Red House",
    "file": "assets/gallery/079_paint-red-house.jpg",
    "wing": "3RD FLOOR",
    "w": 2.15,
    "h": 1.402
  },
  {
    "id": 79,
    "floor": 2,
    "title": "The Harbinger",
    "file": "assets/gallery/080_the-harbinger.jpg",
    "wing": "3RD FLOOR",
    "w": 1.794,
    "h": 2.15
  },
  {
    "id": 80,
    "floor": 2,
    "title": "Monkey Full Body",
    "file": "assets/gallery/081_monkey-full-body.jpg",
    "wing": "3RD FLOOR",
    "w": 2.033,
    "h": 2.15
  },
  {
    "id": 81,
    "floor": 2,
    "title": "Now Watch Me Whip",
    "file": "assets/gallery/082_now-watch-me-whip.jpg",
    "wing": "3RD FLOOR",
    "w": 2.15,
    "h": 2.15
  },
  {
    "id": 82,
    "floor": 2,
    "title": "Luv Graffiti Shirt Ad",
    "file": "assets/gallery/083_luv-graffiti-shirt-ad.jpg",
    "wing": "3RD FLOOR",
    "w": 2.15,
    "h": 2.15
  },
  {
    "id": 83,
    "floor": 2,
    "title": "Sf Mini Drawing Red",
    "file": "assets/gallery/084_sf-mini-drawing-red.jpg",
    "wing": "3RD FLOOR",
    "w": 2.15,
    "h": 1.669
  },
  {
    "id": 84,
    "floor": 2,
    "title": "Painting With A Bed",
    "file": "assets/gallery/085_painting-with-a-bed.jpg",
    "wing": "3RD FLOOR",
    "w": 2.143,
    "h": 2.15
  },
  {
    "id": 85,
    "floor": 2,
    "title": "Person With Mask Behind",
    "file": "assets/gallery/086_person-with-mask-behind.jpg",
    "wing": "3RD FLOOR",
    "w": 2.15,
    "h": 1.295
  },
  {
    "id": 86,
    "floor": 2,
    "title": "Photo Turned Drawing Creatureg",
    "file": "assets/gallery/087_photo-turned-drawing-creatureg.jpg",
    "wing": "3RD FLOOR",
    "w": 1.444,
    "h": 2.15
  },
  {
    "id": 87,
    "floor": 2,
    "title": "Goblin Drawing",
    "file": "assets/gallery/088_goblin-drawing.jpg",
    "wing": "3RD FLOOR",
    "w": 2.15,
    "h": 2.15
  },
  {
    "id": 88,
    "floor": 2,
    "title": "Snapchat Athlete Gun Woman Boo",
    "file": "assets/gallery/089_snapchat-athlete-gun-woman-boo.jpg",
    "wing": "3RD FLOOR",
    "w": 2.15,
    "h": 2.15
  },
  {
    "id": 89,
    "floor": 2,
    "title": "Smitty Shirt Handmade",
    "file": "assets/gallery/090_smitty-shirt-handmade.jpg",
    "wing": "3RD FLOOR",
    "w": 1.949,
    "h": 2.15
  },
  {
    "id": 90,
    "floor": 2,
    "title": "Painted Smitty Red",
    "file": "assets/gallery/091_painted-smitty-red.jpg",
    "wing": "3RD FLOOR",
    "w": 2.15,
    "h": 1.383
  },
  {
    "id": 91,
    "floor": 2,
    "title": "Three Creatures",
    "file": "assets/gallery/092_three-creatures.jpg",
    "wing": "3RD FLOOR",
    "w": 2.15,
    "h": 1.22
  },
  {
    "id": 92,
    "floor": 2,
    "title": "Saxophone Fight",
    "file": "assets/gallery/093_saxophone-fight.jpg",
    "wing": "3RD FLOOR",
    "w": 1.612,
    "h": 2.15
  },
  {
    "id": 93,
    "floor": 2,
    "title": "Escapism By Medication",
    "file": "assets/gallery/094_escapism-by-medication.jpg",
    "wing": "3RD FLOOR",
    "w": 2.15,
    "h": 1.666
  },
  {
    "id": 94,
    "floor": 2,
    "title": "Minnesota Fish Painting",
    "file": "assets/gallery/095_Minnesota-fish-painting.jpg",
    "wing": "3RD FLOOR",
    "w": 2.15,
    "h": 1.614
  },
  {
    "id": 95,
    "floor": 2,
    "title": "Dr Coach Incubation",
    "file": "assets/gallery/096_dr-coach-incubation.jpg",
    "wing": "3RD FLOOR",
    "w": 2.15,
    "h": 2.15
  },
  {
    "id": 96,
    "floor": 2,
    "title": "Ascetic Sebring Ad",
    "file": "assets/gallery/097_Ascetic_Sebring_ad.jpg",
    "wing": "3RD FLOOR",
    "w": 2.15,
    "h": 2.15
  },
  {
    "id": 97,
    "floor": 2,
    "title": "Hairy Guy Drawing",
    "file": "assets/gallery/098_hairy-guy-drawing.jpg",
    "wing": "3RD FLOOR",
    "w": 2.15,
    "h": 2.15
  },
  {
    "id": 98,
    "floor": 2,
    "title": "Lake Blue Violet",
    "file": "assets/gallery/099_lake-blue-violet.jpg",
    "wing": "3RD FLOOR",
    "w": 2.15,
    "h": 1.613
  },
  {
    "id": 99,
    "floor": 2,
    "title": "Orange Stick Figure",
    "file": "assets/gallery/100_orange-stick-figure.jpg",
    "wing": "3RD FLOOR",
    "w": 2.15,
    "h": 2.15
  },
  {
    "id": 100,
    "floor": 2,
    "title": "Green Beanie Ad",
    "file": "assets/gallery/101_green-beanie-ad.jpg",
    "wing": "3RD FLOOR",
    "w": 2.15,
    "h": 2.143
  },
  {
    "id": 101,
    "floor": 2,
    "title": "Person On Fire",
    "file": "assets/gallery/102_person-on-fire.jpg",
    "wing": "3RD FLOOR",
    "w": 2.15,
    "h": 1.46
  },
  {
    "id": 102,
    "floor": 3,
    "title": "Painting Red Abstract",
    "file": "assets/gallery/103_painting-red-abstract.jpg",
    "wing": "4TH FLOOR",
    "w": 2.15,
    "h": 1.443
  },
  {
    "id": 103,
    "floor": 3,
    "title": "Clown Fast Food",
    "file": "assets/gallery/104_clown-fast-food.jpg",
    "wing": "4TH FLOOR",
    "w": 2.15,
    "h": 1.474
  },
  {
    "id": 104,
    "floor": 3,
    "title": "Shirt Ad Flight",
    "file": "assets/gallery/105_shirt-ad-flight.jpg",
    "wing": "4TH FLOOR",
    "w": 2.15,
    "h": 2.141
  },
  {
    "id": 105,
    "floor": 3,
    "title": "Simple Drawing Flower",
    "file": "assets/gallery/106_simple-drawing-flower.jpg",
    "wing": "4TH FLOOR",
    "w": 1.746,
    "h": 2.15
  },
  {
    "id": 106,
    "floor": 3,
    "title": "Framed Sf Animal 2",
    "file": "assets/gallery/107_framed-sf-animal-2.jpg",
    "wing": "4TH FLOOR",
    "w": 2.15,
    "h": 1.609
  },
  {
    "id": 107,
    "floor": 3,
    "title": "Darling Actor Drawing",
    "file": "assets/gallery/108_darling-actor-drawing.jpg",
    "wing": "4TH FLOOR",
    "w": 1.781,
    "h": 2.15
  },
  {
    "id": 108,
    "floor": 3,
    "title": "Beekeeper",
    "file": "assets/gallery/109_beekeeper.jpg",
    "wing": "4TH FLOOR",
    "w": 2.15,
    "h": 2.15
  },
  {
    "id": 109,
    "floor": 3,
    "title": "Run Your Shit 1",
    "file": "assets/gallery/110_run-your-shit-1.jpg",
    "wing": "4TH FLOOR",
    "w": 2.15,
    "h": 2.132
  },
  {
    "id": 110,
    "floor": 3,
    "title": "Run Your Shit 2",
    "file": "assets/gallery/111_run-your-shit-2.jpg",
    "wing": "4TH FLOOR",
    "w": 2.13,
    "h": 2.15
  },
  {
    "id": 111,
    "floor": 3,
    "title": "Hundred Percent Can",
    "file": "assets/gallery/112_hundred-percent-can.jpg",
    "wing": "4TH FLOOR",
    "w": 1.612,
    "h": 2.15
  },
  {
    "id": 112,
    "floor": 3,
    "title": "Early Memorial 2",
    "file": "assets/gallery/113_early-memorial-2.jpg",
    "wing": "4TH FLOOR",
    "w": 2.15,
    "h": 2.15
  },
  {
    "id": 113,
    "floor": 3,
    "title": "Cheetah In Space",
    "file": "assets/gallery/114_cheetah-in-space.jpg",
    "wing": "4TH FLOOR",
    "w": 2.15,
    "h": 1.842
  },
  {
    "id": 114,
    "floor": 3,
    "title": "Shrefflo Ocean Cap Ad",
    "file": "assets/gallery/115_Shrefflo-ocean-cap-ad.jpg",
    "wing": "4TH FLOOR",
    "w": 2.15,
    "h": 2.15
  },
  {
    "id": 115,
    "floor": 3,
    "title": "Cartoon Ampersand Face",
    "file": "assets/gallery/116_cartoon-ampersand-face.jpg",
    "wing": "4TH FLOOR",
    "w": 2.15,
    "h": 2.15
  },
  {
    "id": 116,
    "floor": 3,
    "title": "Painted Sheet Mouse Shapes",
    "file": "assets/gallery/117_painted-sheet-mouse-shapes.jpg",
    "wing": "4TH FLOOR",
    "w": 2.15,
    "h": 1.487
  },
  {
    "id": 117,
    "floor": 3,
    "title": "Orange Kitchen Visions",
    "file": "assets/gallery/118_orange-kitchen-visions.jpg",
    "wing": "4TH FLOOR",
    "w": 1.662,
    "h": 2.15
  },
  {
    "id": 118,
    "floor": 3,
    "title": "Intense Face Clown",
    "file": "assets/gallery/119_intense-face-clown.jpg",
    "wing": "4TH FLOOR",
    "w": 2.15,
    "h": 2.15
  },
  {
    "id": 119,
    "floor": 3,
    "title": "Yoda Smoking Weed",
    "file": "assets/gallery/120_yoda-smoking-weed.jpg",
    "wing": "4TH FLOOR",
    "w": 2.15,
    "h": 1.892
  },
  {
    "id": 120,
    "floor": 3,
    "title": "Agressive Defensive Stance",
    "file": "assets/gallery/121_Agressive-Defensive-Stance.jpg",
    "wing": "4TH FLOOR",
    "w": 2.15,
    "h": 1.639
  },
  {
    "id": 121,
    "floor": 3,
    "title": "Meg Chain Sf Crate Challenge",
    "file": "assets/gallery/122_meg-chain-sf-crate-challenge.jpg",
    "wing": "4TH FLOOR",
    "w": 2.15,
    "h": 2.15
  },
  {
    "id": 122,
    "floor": 3,
    "title": "Bird",
    "file": "assets/gallery/123_Bird.jpg",
    "wing": "4TH FLOOR",
    "w": 2.15,
    "h": 1.476
  },
  {
    "id": 123,
    "floor": 3,
    "title": "Gaiter Mask Dr Coach Ad",
    "file": "assets/gallery/124_gaiter-mask-dr-coach-ad.jpg",
    "wing": "4TH FLOOR",
    "w": 2.15,
    "h": 2.15
  },
  {
    "id": 124,
    "floor": 3,
    "title": "Tissue",
    "file": "assets/gallery/125_tissue.jpg",
    "wing": "4TH FLOOR",
    "w": 2.15,
    "h": 2.15
  },
  {
    "id": 125,
    "floor": 3,
    "title": "Older Bald Drawing",
    "file": "assets/gallery/126_older-bald-drawing.jpg",
    "wing": "4TH FLOOR",
    "w": 2.15,
    "h": 1.878
  },
  {
    "id": 126,
    "floor": 3,
    "title": "Selfie In The Woods",
    "file": "assets/gallery/127_selfie-in-the-woods.jpg",
    "wing": "4TH FLOOR",
    "w": 1.741,
    "h": 2.15
  },
  {
    "id": 127,
    "floor": 3,
    "title": "Curly Hair Low Res Guy",
    "file": "assets/gallery/128_curly-hair-low-res-guy.jpg",
    "wing": "4TH FLOOR",
    "w": 2.044,
    "h": 2.15
  },
  {
    "id": 128,
    "floor": 3,
    "title": "Winter 2022 Ad",
    "file": "assets/gallery/129_winter-2022-ad.jpg",
    "wing": "4TH FLOOR",
    "w": 2.15,
    "h": 1.357
  },
  {
    "id": 129,
    "floor": 3,
    "title": "Dr Coach Full Face",
    "file": "assets/gallery/130_dr-coach-full-face.jpg",
    "wing": "4TH FLOOR",
    "w": 2.15,
    "h": 2.15
  },
  {
    "id": 130,
    "floor": 3,
    "title": "Auto Shop Nightmare",
    "file": "assets/gallery/131_Auto-shop-nightmare.jpg",
    "wing": "4TH FLOOR",
    "w": 2.15,
    "h": 2.134
  },
  {
    "id": 131,
    "floor": 3,
    "title": "Pink Slime Thing",
    "file": "assets/gallery/132_pink-slime-thing.jpg",
    "wing": "4TH FLOOR",
    "w": 2.15,
    "h": 2.137
  },
  {
    "id": 132,
    "floor": 3,
    "title": "2 Hands Drawing At Once",
    "file": "assets/gallery/133_2-hands-drawing-at-once.jpg",
    "wing": "4TH FLOOR",
    "w": 2.15,
    "h": 2.15
  },
  {
    "id": 133,
    "floor": 3,
    "title": "No Weather Data",
    "file": "assets/gallery/134_no-weather-data.jpg",
    "wing": "4TH FLOOR",
    "w": 2.15,
    "h": 1.655
  },
  {
    "id": 134,
    "floor": 3,
    "title": "Most Famous Cover",
    "file": "assets/gallery/135_Most-Famous-cover.jpg",
    "wing": "4TH FLOOR",
    "w": 2.15,
    "h": 2.15
  },
  {
    "id": 135,
    "floor": 3,
    "title": "Big Party Weather",
    "file": "assets/gallery/136_big-party-weather.jpg",
    "wing": "4TH FLOOR",
    "w": 2.15,
    "h": 2.15
  }
];

  // Apply custom artwork titles and floor labels from GAME_TEXT.txt
  (() => {
    CURATED_ARTWORKS.forEach(a => {
      a.title = T('art.' + String(a.id).padStart(3, '0'), a.title);
      a.wing = T('floor.' + (a.floor + 1), a.wing);
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

  // 2D Line-Segment to Circle/Cylinder Intersection (Occlusion by Columns & Rotunda Pillars)
  function lineIntersectsCircle(x0, z0, x1, z1, cx, cz, r) {
    const dx = x1 - x0;
    const dz = z1 - z0;
    const lenSq = dx * dx + dz * dz;
    if (lenSq < 0.0001) return Math.hypot(x0 - cx, z0 - cz) <= r;
    const t = Math.max(0, Math.min(1, ((cx - x0) * dx + (cz - z0) * dz) / lenSq));
    const closeX = x0 + t * dx;
    const closeZ = z0 + t * dz;
    const distSq = (cx - closeX) * (cx - closeX) + (cz - closeZ) * (cz - closeZ);
    return distSq <= r * r;
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

      // Player State: Spawns on 1st Floor South Gallery facing North (-Z) down the grand promenade
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
      this.currentRoom = T('hud.room_format', '{floor} • {area}', { floor: T('floor.1', '1ST FLOOR'), area: T('area.buffoon_gallery', 'BUFFOON GALLERY') });

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
      this.physicsCrates = [];
      this.aquariumFish = [];
      this.heldCrate = null;
      this.lastAnnouncedFloor = null;
      this.floorIndicatorTimeout = null;
      this.navNodes = [];
      this.navAdj = [];
      this.exitDoors = null;
      this.exitUnlocked = false;
      this.exitDoorsOpening = false;
      this.leftDoorPivot = null;
      this.rightDoorPivot = null;
      this.slidingDoors = [];
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
      this.isSmittyXray = false;
      this.smittyXrayGroup = null;
      this.smittyXrayFillMat = null;
      this.smittyXrayWireMat = null;
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
      this.lastChaseStingerTime = 0;
      this.smittySawPlayerStairsTimer = 0;
      this.timeSincePlayerSeenInStalk = 0;
      this.smittySearchStage = 'NAV';
      this.smittySearchScanTimer = 0;
      this.smittyInspectTimer = 0;

      this.smittyEnabled = true;
      this.smittyHasBeenShot = false;
      this.leftHandShakeTimer = 0;
      this.isObjectiveModalOpen = false;
      this.isOptionsModalOpen = false;
      this.isSettingsModalOpen = false;
      this.isAboutModalOpen = false;
      this.isSpectatorHudHidden = false;
      this.isQuitting = false;
      this.musicEnabled = (localStorage.getItem('the_museum_music') !== 'false');

      this.dom = {
        hud: document.getElementById('hud'),
        startScreen: document.getElementById('start-screen'),
        startBtn: document.getElementById('start-btn'),
        startQuitBtn: document.getElementById('start-quit-btn'),
        pauseModal: document.getElementById('pause-modal'),
        resumeBtn: document.getElementById('resume-btn'),
        pauseOptionsBtn: document.getElementById('pause-options-btn'),
        pauseSettingsBtn: document.getElementById('pause-settings-btn'),
        pauseAboutBtn: document.getElementById('pause-about-btn'),
        pauseQuitBtn: document.getElementById('pause-quit-btn'),
        objModal: document.getElementById('objective-modal'),
        objectiveCloseBtn: document.getElementById('objective-close-btn'),
        floorplanCanvas: document.getElementById('floorplan-canvas'),
        gameOverModal: document.getElementById('game-over-modal'),
        restartBtn: document.getElementById('restart-btn'),
        gameoverQuitBtn: document.getElementById('gameover-quit-btn'),
        victoryModal: document.getElementById('victory-modal'),
        winRestartBtn: document.getElementById('win-restart-btn'),
        victoryAboutBtn: document.getElementById('victory-about-btn'),
        victoryQuitBtn: document.getElementById('victory-quit-btn'),
        artModal: document.getElementById('art-modal'),
        artModalImg: document.getElementById('art-modal-img'),
        artModalTitle: document.getElementById('art-modal-title'),
        artModalWing: document.getElementById('art-modal-wing'),
        artCloseBtn: document.getElementById('art-close-btn'),
        optionsModal: document.getElementById('options-modal'),
        optionsBubbleBtn: document.getElementById('options-bubble-btn'),
        optionsCloseBtn: document.getElementById('options-close-btn'),
        optionsBackBtn: document.getElementById('options-back-btn'),
        settingsModal: document.getElementById('settings-modal'),
        settingsBubbleBtn: document.getElementById('settings-bubble-btn'),
        settingsCloseBtn: document.getElementById('settings-close-btn'),
        settingsBackBtn: document.getElementById('settings-back-btn'),
        aboutModal: document.getElementById('about-modal'),
        aboutBubbleBtn: document.getElementById('about-bubble-btn'),
        aboutCloseBtn: document.getElementById('about-close-btn'),
        aboutBackBtn: document.getElementById('about-back-btn'),
        aboutBuildTag: document.getElementById('about-build-tag'),
        smittyOnBtn: document.getElementById('smitty-on-btn'),
        smittyOffBtn: document.getElementById('smitty-off-btn'),
        optionsSmittyOnBtn: document.getElementById('options-smitty-on-btn'),
        optionsSmittyOffBtn: document.getElementById('options-smitty-off-btn'),
        optionsMusicOnBtn: document.getElementById('options-music-on-btn'),
        optionsMusicOffBtn: document.getElementById('options-music-off-btn'),
        vignetteOverlay: document.getElementById('vignette-overlay'),
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
        winTime: document.getElementById('win-time')
      };

      window.game = this;
      this.floorLights = [[], [], [], []];

      console.log('%c[THE MUSEUM]%c Ready', 'color:#00ff88;font-weight:bold;background:#111;padding:3px 6px;border-radius:3px', 'color:#fff;background:#222;padding:3px 6px');

      this.initThree();
      this.buildMuseum();
      this.buildNavGraph();
      this.randomizeSmittySpawn();
      this.buildWeaponViewmodel();
      this.buildLeftHandViewmodel();
      this.spawnRelics();
      this.spawnAmmoPickups();
      this.updateRelicFloorVisibility();
      this.loadSmittyModel();
      if (this.renderer && this.scene && this.camera) {
        this.renderer.compile(this.scene, this.camera);
      }
      this.setupEventListeners();
      this.updateSmittyModeUI();
      this.updateMusicModeUI();
      if (this.dom.aboutBuildTag) {
        this.dom.aboutBuildTag.textContent = `Build ${APP_VERSION}`;
      }
      this.audio.init();
      if (this.musicEnabled) {
        this.audio.playMenuMusic();
      }
      this.animate();
    }

    initThree() {
      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(0x05070c);
      this.scene.fog = new THREE.FogExp2(0x05070c, 0.032);

      this.camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.04, 150);
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
      this.ambientLight = new THREE.AmbientLight(0x2d3648, 0.50);
      this.scene.add(this.ambientLight);

      this.hemiLight = new THREE.HemisphereLight(0x4a5a78, 0x1a1612, 0.30);
      this.scene.add(this.hemiLight);

      // Warm directional sunlight used when daytime mode (Smitty: OFF) is active
      this.daytimeSunLight = new THREE.DirectionalLight(0xfff7ed, 0.95);
      this.daytimeSunLight.position.set(20, 45, 15);
      this.daytimeSunLight.visible = false;
      this.scene.add(this.daytimeSunLight);

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

    buildMuseum() {
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

      // Build all 4 floors of the Museum
      for (let fl = 0; fl < CONFIG.NUM_FLOORS; fl++) {
        this.buildSingleFloor(fl, mats);
      }

      // Build the two continuous 4-story U-stairwells (Stairwell N and Stairwell SW)
      this.buildFourStoryStairwells(mats);

      // Populate all 136 curated gallery artworks across the 4 floors
      this.populateCuratedArtworks(mats);
    }

    buildSingleFloor(fl, mats) {
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
      // 2. West Office Slab (x: -34..-24, z: 18..28)
      this.createSlab(-29, y0, 23, 10.0, 10.0, mats.floorDarkWood, mats.ceiling, ceilH);
      // 3. Main Gallery + North Magazine Alcove Slab (x: -16..-4, z: -18..28)
      this.createSlab(-10, y0, 5, 12.0, 46.0, floorMat, mats.ceiling, ceilH);
      // 4. Central Core South of Stairwell N (x: -4..4, z: -14..28)
      this.createSlab(0, y0, 7, 8.0, 42.0, floorMat, mats.ceiling, ceilH);
      // 5. North Gallery Slab (x: -4..28, z: -40..-26) + North Bay (x: 6..18, z: -42..-40)
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

      // A. WEST WING: EXHIBITION GALLERY (x: -36..-16, z: -6..18)
      this.createWall(-36, yc, 6, t, wallH, 24.4, mainWallMat, true, fl);         // -6.2..18.2
      this.createWall(-26, yc, -6, 19.6, wallH, t, mainWallMat, true, fl);        // -35.8..-16.2
      this.createWall(-26, yc, -5.0, 3.6, wallH, 1.4, accentWallMat, true, fl);   // -5.7..-4.3 (flush against z=-5.8)
      // South wall of West Wing (z = 18, x: -35.8..-16.2) with 2 doorways:
      // Door 1 into West Office: x = -31.5..-28.5; Door 2 into SW Stairwell Landing: x = -21.5..-18.5
      this.createWall(-33.65, yc, 18, 4.3, wallH, t, mainWallMat, true, fl);      // -35.8..-31.5
      this.createWall(-25.0, ycFull, 18, 7.0, h, t, mainWallMat, true, fl);       // -28.5..-21.5 (borders SW Stairwell)
      this.createWall(-17.35, ycFull, 18, 2.3, h, t, mainWallMat, true, fl);      // -18.5..-16.2 (borders SW Stairwell)
      this.createLintel(-30.0, y0, 18, 3.0, t, ceilH, mainWallMat);
      this.createLintel(-20.0, y0, 18, 3.0, t, ceilH, mainWallMat);

      // B. WEST OFFICE (x: -34..-24, z: 18..28)
      this.createWall(-34, yc, 23.2, t, wallH, 10.0, accentWallMat, true, fl);    // 18.2..28.2
      this.createWall(-29, yc, 28, 9.6, wallH, t, accentWallMat, true, fl);       // -33.8..-24.2
      // East wall of West Office (x = -24, z: 18.2..28.2) with doorway at z: 18.6..20.8 into SW Stairwell Landing
      this.createWall(-24, ycFull, 18.4, t, h, 0.4, accentWallMat, true, fl);     // North jamb (18.2..18.6)
      this.createWall(-24, ycFull, 24.5, t, h, 7.4, accentWallMat, true, fl);     // South segment (20.8..28.2)
      this.createLintelZ(-24, y0, 19.7, t, 2.2, ceilH, accentWallMat);

      // C. MAIN GALLERY & NORTH MAGAZINE ALCOVE (x: -16..-4, z: -18..28)
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

      // South wall of Main Gallery (z = 28, x: -15.8..-4.2)
      if (fl === 0) {
        this.createWall(-14.1, yc, 28, 3.4, wallH, t, mainWallMat, true, fl);     // -15.8..-12.4
        this.createWall(-5.9, yc, 28, 3.4, wallH, t, mainWallMat, true, fl);      // -7.6..-4.2
        this.createLintel(-10.0, y0, 28, 4.8, t, ceilH, mainWallMat, 4.68);       // High lintel above grand stone arch
        this.createExitDoors(-10.0, 0, 28, mats);
      } else {
        this.createWall(-10, yc, 28, 11.6, wallH, t, mainWallMat, true, fl);      // -15.8..-4.2
      }

      // Entire x = -4 wall from z = -40.2 to 28.2 (disjoint collinear segments):
      this.createWall(-4, yc, -33.1, t, wallH, 14.2, mainWallMat, true, fl);      // -40.2..-26.0 (North Gallery West)
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
      // Fully wall off the South corridor opening at z = 18 with a continuous gallery wall (no dead-end void)
      this.createWall(0.0, yc, 18.0, 7.6, wallH, t, mainWallMat, true, fl);       // -3.8..3.8

      // South wall of South Cross-Passage (z = 28, x: -3.8..11.8)
      this.createWall(4.0, yc, 28, 15.6, wallH, t, mainWallMat, true, fl);        // -3.8..11.8

      // E. NORTH GALLERY (x: -4..28, z: -40..-26 + North Bay x: 6..18, z: -42..-40)
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
                          : fl === 1 ? T('sign.west_room.floor2', 'COOL DUDE CENTRAL')
                          : fl === 2 ? T('sign.west_room.floor3', 'SURREALISM SALON')
                          : T('sign.west_room.floor4', 'QUARANTINED ART VAULT');
      this.createRoomSign(-15.72, y0 + 3.85, 6.0, Math.PI / 2, westSignTitle, flTitle);

      const neSignTitle = fl === 1 ? T('sign.north_room.floor2', 'LOCAL HISTORY')
                        : fl === 3 ? T('sign.north_room.floor4', 'RESTRICTED RELIQUARY VAULT')
                        : T('sign.north_room.floor1_and_3', 'SPECIAL COLLECTIONS ARCHIVE');
      this.createRoomSign(12.0, y0 + 3.85, -25.72, 0, neSignTitle, flTitle);

      // West Wing Exhibition Plinths & Display Cases (x: -26, z: 0 and z: 12)
      this.createExhibitionPlinth(-26, y0, 0, 2.4, 1.1, 2.4, fl < 3);
      this.createExhibitionPlinth(-26, y0, 12, 2.4, 1.1, 2.4, fl < 3);
      this.createMuseumBench(-26, y0, 6);

      // West Office / SW Office Desk (x: -29, z: 24)
      this.createInfoDesk(-29, y0, 24, mats.mahogany);

      // Restroom Suites & Archival Laboratories (Central Service Core z: -14..-6)
      this.createRealisticRestrooms(fl, y0, mats);

      // Period Study & Research Library (Central Core z: -6..2)
      this.createRealisticStudyRoom(fl, y0, mats);

      // Main Gallery Benches (x: -10, z: 0 and z: 14)
      this.createMuseumBench(-10, y0, 0);
      this.createMuseumBench(-10, y0, 14);

      // North Gallery Display Plinths (x: 12, z: -39 and x: 4, z: -33 and x: 20, z: -33)
      this.createExhibitionPlinth(12, y0, -39, 2.2, 1.1, 2.2, fl === 3);
      this.createMuseumBench(12, y0, -33);

      // East Main Hall: Realistic 5-Range Bookstacks System with Ladders & Trolleys
      this.createRealisticMainStacks(fl, y0, mats);

      // Arts and Music Office Desk (x: 26, z: 13)
      this.createInfoDesk(26, y0, 13, mats.mahogany);

      // South-East Rotunda Circular Reference Desk at (23, 22)
      this.createCircularReferenceDesk(23, y0, 22, mats.mahogany, fl);
      this.populateFloorExhibits(fl, y0, mats);

      // Distinct Floor-Specific Atmospheric Ceiling Lamps & Spotlights
      const lightColor = fl === 0 ? 0xf4f4f4
                       : fl === 1 ? 0xffd27d
                       : fl === 2 ? 0x93c5fd
                       : 0xef4444;
      const lightInt = fl === 3 ? 0.48 : 0.42;
      const roomLightCoords = [
        [-26, 6],   // West Wing
        [-10, 6],   // Main Gallery
        [12, -33],  // North Gallery
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

        const pl = new THREE.PointLight(lightColor, fl === this.playerFloor ? lightInt : 0, 18);
        pl._origIntensity = lightInt;
        pl.position.set(lx, y0 + ceilH - 0.35, lz);
        this.scene.add(pl);
        if (this.floorLights[fl]) this.floorLights[fl].push(pl);
      });
    }

    buildFourStoryStairwells(mats) {
      const totalH = CONFIG.NUM_FLOORS * CONFIG.FLOOR_HEIGHT;
      const midY = totalH / 2;
      const t = 0.4;
      const ceilH = CONFIG.FLOOR_HEIGHT - 0.06;

      // --- 1. NORTH-CENTRAL U-STAIRWELL (x: -4..4, z: -26..-14) ---
      // Note: Outer shaft walls at x=-4, x=4, z=-26 are built per-floor in buildSingleFloor (full height h)
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
      if (mat) mat.side = THREE.DoubleSide;
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x, y, z);
      this.scene.add(mesh);
    }

    createCeiling(x, y, z, w, d, mat) {
      if (mat) mat.side = THREE.DoubleSide;
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
      mesh.rotation.x = Math.PI / 2;
      mesh.position.set(x, y, z);
      this.scene.add(mesh);
    }

    createLintel(x, y0, z, w, d, ceilH, mat, doorH = 2.4) {
      const lintelH = ceilH - doorH;
      if (mat) mat.side = THREE.DoubleSide;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, lintelH, d), mat);
      mesh.position.set(x, y0 + doorH + lintelH / 2, z);
      this.scene.add(mesh);
    }

    createLintelZ(x, y0, z, w, d, ceilH, mat, doorH = 2.4) {
      const lintelH = ceilH - doorH;
      if (mat) mat.side = THREE.DoubleSide;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, lintelH, d), mat);
      mesh.position.set(x, y0 + doorH + lintelH / 2, z);
      this.scene.add(mesh);
    }

    createWall(x, y, z, w, h, d, mat, collide = true, floor = 'all') {
      if (mat) mat.side = THREE.DoubleSide;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
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
        // Skip column 4 at (19.0, 34.0) — the central exhibition partition wall is located here,
        // which completely eliminates the visual glitch where the column base and shaft poked through below the painting
        if (i === 4) continue;

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
      const chanInt = fl === 3 ? 0.45 : 0.60;
      const chanLight = new THREE.PointLight(chanColor, fl === this.playerFloor ? chanInt : 0, 14.0);
      chanLight._origIntensity = chanInt;
      chanLight.position.set(cx, y0 + ceilH - 1.3, 30.5);
      this.scene.add(chanLight);
      if (this.floorLights[fl]) this.floorLights[fl].push(chanLight);
    }

    createRealisticRestrooms(fl, y0, mats) {
      const ceilH = CONFIG.FLOOR_HEIGHT - 0.06;
      const tileMat = new THREE.MeshLambertMaterial({ color: 0x1e293b });
      const floorTileMat = new THREE.MeshLambertMaterial({ color: 0xd1d5db });
      const wainscotMat = new THREE.MeshLambertMaterial({ color: 0xe5e7eb });
      const porcelainMat = new THREE.MeshPhongMaterial({ color: 0xf5f5f7, specular: 0xcccccc, shininess: 85 });
      const seatMat = new THREE.MeshPhongMaterial({ color: 0xe8e8ea, specular: 0x999999, shininess: 60 });
      const waterMat = new THREE.MeshPhongMaterial({ color: 0x1e3a5f, specular: 0xffffff, shininess: 140, transparent: true, opacity: 0.85 });
      const dispenserCasingMat = new THREE.MeshPhongMaterial({ color: 0x181a1d, specular: 0x555555, shininess: 80 });
      const paperRollMat = new THREE.MeshLambertMaterial({ color: 0xf6f6f3 });
      const paperTailMat = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
      const pipeMat = new THREE.MeshLambertMaterial({ color: 0xa1a6af });
      const chromeMat = new THREE.MeshPhongMaterial({ color: 0xf1f5f9, specular: 0xffffff, shininess: 160 });
      const stallMat = new THREE.MeshLambertMaterial({ color: 0x334155 });
      const headrailMat = new THREE.MeshPhongMaterial({ color: 0x94a3b8, specular: 0xffffff, shininess: 140 });
      const mirrorMat = new THREE.MeshPhongMaterial({ color: 0xbfdbfe, specular: 0xffffff, shininess: 180 });
      const woodMat = mats.mahogany;
      const brassMat = new THREE.MeshLambertMaterial({ color: 0xd4af37 });

      // Out of order stall door poster sign texture
      const stallSignTex = this.texLoader.load('assets/textures/stall_sign.jpg', (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
      });
      const stallSignMat = new THREE.MeshStandardMaterial({
        map: stallSignTex,
        roughness: 0.45,
        metalness: 0.05,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1
      });

      // Bold OSHA-grade Black & Yellow diagonal hazard caution tape (high-res texture)
      let hazardTapeTex;
      {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#facc15';
        ctx.fillRect(0, 0, 512, 128);
        ctx.fillStyle = '#111827';
        const stripeW = 64;
        for (let x = -128; x < 640; x += stripeW * 2) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x + stripeW, 0);
          ctx.lineTo(x + stripeW - 128, 128);
          ctx.lineTo(x - 128, 128);
          ctx.closePath();
          ctx.fill();
        }
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, 512, 5);
        ctx.fillRect(0, 123, 512, 5);
        hazardTapeTex = new THREE.CanvasTexture(canvas);
        hazardTapeTex.wrapS = THREE.RepeatWrapping;
        hazardTapeTex.wrapT = THREE.ClampToEdgeWrapping;
        hazardTapeTex.colorSpace = THREE.SRGBColorSpace;
      }
      const hazardTapeMat = new THREE.MeshStandardMaterial({
        map: hazardTapeTex,
        roughness: 0.35,
        metalness: 0.1,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2
      });

      // Commercial sliding glass door materials
      const slidingGlassMat = new THREE.MeshPhongMaterial({
        color: 0xc8e6f0,
        transparent: true,
        opacity: 0.38,
        specular: 0xffffff,
        shininess: 140,
        depthWrite: false
      });
      const doorAlumMat = new THREE.MeshStandardMaterial({
        color: 0x334155,
        metalness: 0.85,
        roughness: 0.25
      });
      const frostedDecalMat = new THREE.MeshLambertMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.65,
        depthWrite: true
      });
      const sensorPodMat = new THREE.MeshStandardMaterial({
        color: 0x0f172a,
        metalness: 0.5,
        roughness: 0.5
      });

      // 1. DEDICATED CERAMIC TILE FLOOR SLAB (covering wood floor across x: -3.8..3.8, z: -14.0..-6.0)
      const rFloor = new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.05, 8.0), floorTileMat);
      rFloor.position.set(0, y0 + 0.025, -10.0);
      this.scene.add(rFloor);

      // 2. CEILING RECESSED LIGHTS & GLOWING FIXTURES
      // Men's ceiling light (z = -12.0)
      const mLight = new THREE.PointLight(0xfffaed, fl === this.playerFloor ? 0.75 : 0, 9.0);
      mLight._origIntensity = 0.75;
      mLight.position.set(0, y0 + 3.8, -12.0);
      this.scene.add(mLight);
      const mFix = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.04, 1.4), new THREE.MeshBasicMaterial({ color: 0xfffaed }));
      mFix.position.set(0, y0 + 5.10, -12.0);
      this.scene.add(mFix);

      // Women's ceiling light (z = -8.0)
      const wLight = new THREE.PointLight(0xfffaed, fl === this.playerFloor ? 0.75 : 0, 9.0);
      wLight._origIntensity = 0.75;
      wLight.position.set(0, y0 + 3.8, -8.0);
      this.scene.add(wLight);
      const wFix = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.04, 1.4), new THREE.MeshBasicMaterial({ color: 0xfffaed }));
      wFix.position.set(0, y0 + 5.10, -8.0);
      this.scene.add(wFix);

      if (this.floorLights[fl]) this.floorLights[fl].push(mLight, wLight);

      // 3. CERAMIC WAINSCOTING PANELS ON PERIMETER WALLS (height 2.2m)
      const wainscotBack = new THREE.Mesh(new THREE.BoxGeometry(0.04, 2.2, 7.96), wainscotMat);
      wainscotBack.position.set(-3.76, y0 + 1.1, -10.0);
      this.scene.add(wainscotBack);

      const wainscotMid = new THREE.Mesh(new THREE.BoxGeometry(7.56, 2.2, 0.04), wainscotMat);
      wainscotMid.position.set(0, y0 + 1.1, -10.0);
      this.scene.add(wainscotMid);

      // 4. RESTROOM ENTRANCE AUTOMATIC SLIDING GLASS DOORS (x = 4.0, z = -12.0 Men's, z = -8.0 Women's)
      const createSlidingRestroomDoor = (doorZ, signTitle, isMen) => {
        const frameW = 0.08;
        const frameH = 2.40;
        const frameD = 0.38; // Contained cleanly within the 0.40m wall thickness

        // Recessed pocket jamb frames on North and South sides of doorway opening
        const leftJamb = new THREE.Mesh(new THREE.BoxGeometry(frameD, frameH, frameW), doorAlumMat);
        leftJamb.position.set(4.0, y0 + frameH / 2, doorZ - 0.96);
        this.scene.add(leftJamb);

        const rightJamb = new THREE.Mesh(new THREE.BoxGeometry(frameD, frameH, frameW), doorAlumMat);
        rightJamb.position.set(4.0, y0 + frameH / 2, doorZ + 0.96);
        this.scene.add(rightJamb);

        // Commercial aluminum overhead track operator housing (spans exactly within 2.0m doorway opening without protruding into drywall)
        const trackHeader = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.18, 2.00), doorAlumMat);
        trackHeader.position.set(4.0, y0 + frameH - 0.09, doorZ);
        this.scene.add(trackHeader);

        // Floor guide threshold groove
        const floorGuide = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 1.92), doorAlumMat);
        floorGuide.position.set(4.0, y0 + 0.01, doorZ);
        this.scene.add(floorGuide);

        // Dual motion sensor housings mounted directly on vertical faces of track header within opening
        const sensorLEDMat = new THREE.MeshBasicMaterial({ color: 0x00e5ff });
        [-0.20, 0.20].forEach((ox) => {
          const pod = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.22), sensorPodMat);
          pod.position.set(4.0 + ox, y0 + frameH - 0.09, doorZ);
          this.scene.add(pod);

          const led = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.012, 0.04), sensorLEDMat);
          led.position.set(4.0 + ox + (ox > 0 ? 0.016 : -0.016), y0 + frameH - 0.09, doorZ);
          this.scene.add(led);
        });

        // Helper to construct one sliding glass door leaf (width: 1.04m, height: 2.26m)
        const createLeaf = (isLeft) => {
          const leafGroup = new THREE.Group();
          const leafW = 1.04;
          const leafH = 2.26;
          const glassThick = 0.02;

          // Main tempered glass panel
          const glass = new THREE.Mesh(new THREE.BoxGeometry(glassThick, leafH, leafW), slidingGlassMat);
          glass.position.set(0, leafH / 2, 0);
          leafGroup.add(glass);

          // Top & bottom aluminum rails
          const railTop = new THREE.Mesh(new THREE.BoxGeometry(glassThick + 0.025, 0.08, leafW), doorAlumMat);
          railTop.position.set(0, leafH - 0.04, 0);
          leafGroup.add(railTop);

          const railBot = new THREE.Mesh(new THREE.BoxGeometry(glassThick + 0.025, 0.12, leafW), doorAlumMat);
          railBot.position.set(0, 0.06, 0);
          leafGroup.add(railBot);

          // Vertical perimeter stiles
          const stileOuter = new THREE.Mesh(new THREE.BoxGeometry(glassThick + 0.02, leafH, 0.045), doorAlumMat);
          stileOuter.position.set(0, leafH / 2, isLeft ? -leafW / 2 + 0.0225 : leafW / 2 - 0.0225);
          leafGroup.add(stileOuter);

          const stileInner = new THREE.Mesh(new THREE.BoxGeometry(glassThick + 0.015, leafH, 0.035), doorAlumMat);
          stileInner.position.set(0, leafH / 2, isLeft ? leafW / 2 - 0.0175 : -leafW / 2 + 0.0175);
          leafGroup.add(stileInner);

          // Meeting edge rubber bumper
          const bumper = new THREE.Mesh(new THREE.BoxGeometry(glassThick + 0.005, leafH - 0.04, 0.015), sensorPodMat);
          bumper.position.set(0, leafH / 2, isLeft ? leafW / 2 : -leafW / 2);
          leafGroup.add(bumper);

          // Dual horizontal frosted safety decals across the glass (standard grocery/convenience store pattern)
          [-0.06, 0.06].forEach((dy) => {
            const decal = new THREE.Mesh(new THREE.BoxGeometry(glassThick + 0.004, 0.035, leafW - 0.09), frostedDecalMat);
            decal.position.set(0, 1.15 + dy, 0);
            leafGroup.add(decal);
          });

          return leafGroup;
        };

        const leftLeaf = createLeaf(true);
        const rightLeaf = createLeaf(false);

        // Closed positions: leaves meet at doorZ in center
        const closedZLeft = doorZ - 0.51;
        const closedZRight = doorZ + 0.51;

        // Open positions: leaves retreat inside the wall pockets without reaching stairwell
        const openZLeft = doorZ - 1.35;
        const openZRight = doorZ + 1.35;

        leftLeaf.position.set(4.0, y0, closedZLeft);
        rightLeaf.position.set(4.0, y0, closedZRight);
        this.scene.add(leftLeaf);
        this.scene.add(rightLeaf);

        // Active collider across doorway when glass is closed
        const collider = {
          type: 'box',
          floor: fl,
          minX: 3.82,
          maxX: 4.18,
          minZ: doorZ - 0.98,
          maxZ: doorZ + 0.98
        };
        this.colliders.push(collider);

        // Register sliding door for animation & proximity triggers
        this.slidingDoors.push({
          floor: fl,
          x: 4.0,
          doorZ: doorZ,
          leftLeaf: leftLeaf,
          rightLeaf: rightLeaf,
          closedZLeft: closedZLeft,
          closedZRight: closedZRight,
          openZLeft: openZLeft,
          openZRight: openZRight,
          openProgress: 0.0,
          sensorLEDMat: sensorLEDMat,
          collider: collider,
          isOpen: false
        });

        // Hallway room plaque
        this.createRoomSign(4.24, y0 + 1.65, doorZ + 1.35, Math.PI / 2, signTitle);
      };

      createSlidingRestroomDoor(-12.0, 'MEN • RESTROOM', true);
      createSlidingRestroomDoor(-8.0, 'WOMEN • RESTROOM', false);

      // 5. HELPER: REALISTIC AMERICAN COMMERCIAL ONE-PIECE TOILET (Matching Reference Image 4)
      // Positioned against West perimeter wall (x = -3.76), facing East into stall with rotY = Math.PI / 2
      const buildToilet = (tx, tz, rotY, wallDistX = 0.88) => {
        const group = new THREE.Group();
        group.position.set(tx, y0, tz);
        group.rotation.y = rotY;

        // 1. SKIRTED PEDESTAL FOOTPRINT: Smooth, curved modern base resting flat on the tile floor
        const footBase = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.19, 0.08, 24), porcelainMat);
        footBase.scale.set(1.0, 1.0, 1.45);
        footBase.position.set(0, 0.04, 0.08);
        group.add(footBase);

        // Skirted waist column tapering up to the bowl (smooth monolithic shroud)
        const skirtWaist = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.175, 0.22, 24), porcelainMat);
        skirtWaist.scale.set(0.95, 1.0, 1.35);
        skirtWaist.position.set(0, 0.19, 0.06);
        group.add(skirtWaist);

        // Porcelain floor bolt caps on left and right sides of the skirt
        [-0.155, 0.155].forEach((bx) => {
          const boltCap = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.017, 0.024, 12), porcelainMat);
          boltCap.position.set(bx, 0.09, 0.04);
          group.add(boltCap);
        });

        // 2. ELONGATED VITREOUS CHINA BOWL
        const outerBowl = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.15, 0.18, 28), porcelainMat);
        outerBowl.scale.set(1.0, 1.0, 1.35);
        outerBowl.position.set(0, 0.35, 0.14);
        group.add(outerBowl);

        // Molded bowl rim (smooth rounded top perimeter)
        const bowlRim = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.20, 0.035, 28), porcelainMat);
        bowlRim.scale.set(1.0, 1.0, 1.35);
        bowlRim.position.set(0, 0.41, 0.14);
        group.add(bowlRim);

        // Inner hollow bowl cavity
        const innerBowl = new THREE.Mesh(new THREE.CylinderGeometry(0.165, 0.09, 0.15, 24), porcelainMat);
        innerBowl.scale.set(0.95, 1.0, 1.35);
        innerBowl.position.set(0, 0.35, 0.14);
        group.add(innerBowl);

        // Water pool inside bowl
        const water = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.01, 20), waterMat);
        water.scale.set(0.95, 1.0, 1.30);
        water.position.set(0, 0.30, 0.14);
        group.add(water);

        // 3. CONTOURED CLOSED-FRONT SEAT (Matching Image 4: contoured oval with inner opening, down)
        const seatShape = new THREE.Shape();
        seatShape.absellipse(0, 0, 0.19, 0.24, 0, Math.PI * 2, false, 0);
        const seatHole = new THREE.Path();
        seatHole.absellipse(0, 0.015, 0.118, 0.168, 0, Math.PI * 2, true, 0);
        seatShape.holes.push(seatHole);

        const seatGeom = new THREE.ExtrudeGeometry(seatShape, {
          depth: 0.022,
          bevelEnabled: true,
          bevelSegments: 3,
          steps: 1,
          bevelSize: 0.008,
          bevelThickness: 0.008
        });
        const seatMesh = new THREE.Mesh(seatGeom, seatMat);
        seatMesh.rotation.x = Math.PI / 2;
        seatMesh.position.set(0, 0.435, 0.13);
        group.add(seatMesh);

        // Chrome hinge posts connecting seat and lid to the rear porcelain shelf
        [-0.08, 0.08].forEach((hx) => {
          const hingePost = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.038, 14), chromeMat);
          hingePost.position.set(hx, 0.445, -0.04);
          group.add(hingePost);

          const hingeCap = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.012, 14), chromeMat);
          hingeCap.position.set(hx, 0.465, -0.04);
          group.add(hingeCap);
        });

        // 4. OPEN UPRIGHT TOILET LID (Authentic contoured porcelain/resin lid resting cleanly back against tank front)
        // Clean contoured lid with rounded top and clean hinge base (no protruding eyes or awkward geometry)
        const lidShape = new THREE.Shape();
        lidShape.moveTo(-0.13, 0);
        lidShape.lineTo(-0.165, 0.16);
        lidShape.bezierCurveTo(-0.165, 0.35, -0.09, 0.44, 0, 0.44);
        lidShape.bezierCurveTo(0.09, 0.44, 0.165, 0.35, 0.165, 0.16);
        lidShape.lineTo(0.13, 0);
        lidShape.bezierCurveTo(0.08, -0.01, -0.08, -0.01, -0.13, 0);

        const lidGeom = new THREE.ExtrudeGeometry(lidShape, {
          depth: 0.018,
          bevelEnabled: true,
          bevelSegments: 3,
          steps: 1,
          bevelSize: 0.006,
          bevelThickness: 0.006
        });
        const lidMesh = new THREE.Mesh(lidGeom, seatMat);
        // Pivot from chrome hinge line (y = 0.448, z = -0.045), angled back ~7 degrees so back face rests smoothly flush against the tank face
        lidMesh.rotation.x = -0.12;
        lidMesh.position.set(0, 0.448, -0.045);
        group.add(lidMesh);

        // 5. STREAMLINED VITREOUS CHINA WATER TANK & LID
        // Tank front face is at -0.19 + 0.18/2 = -0.10. Height is 0.48, so bottom is 0.68 - 0.24 = 0.44 (meets porcelain shelf).
        const tank = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.48, 0.18), porcelainMat);
        tank.position.set(0, 0.68, -0.19);
        group.add(tank);

        // Rounded side panels for tank
        [-0.22, 0.22].forEach((tx) => {
          const tRound = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.48, 16), porcelainMat);
          tRound.position.set(tx, 0.68, -0.19);
          group.add(tRound);
        });

        // Tank lid with smooth beveled edge
        const lidTop = new THREE.Mesh(new THREE.BoxGeometry(0.47, 0.035, 0.20), porcelainMat);
        lidTop.position.set(0, 0.935, -0.19);
        group.add(lidTop);

        // Chrome flush trip lever handle on left side of tank (as in Image 2 & 4)
        const leverMount = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.022, 12), chromeMat);
        leverMount.rotation.z = Math.PI / 2;
        leverMount.position.set(-0.24, 0.86, -0.15);
        group.add(leverMount);

        const leverHandle = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.016, 0.075), chromeMat);
        leverHandle.position.set(-0.252, 0.86, -0.12);
        group.add(leverHandle);

        // 6. COMMERCIAL DUAL JUMBO-ROLL DISPENSER (Flush on side wall at wallDistX, matching Image 2)
        const dispW = 0.52; // Width along the wall (Z axis)
        const dispH = 0.27; // Height
        const dispD = 0.13; // Depth outward into the stall (X axis)
        const dispY = 0.78; // Reach height
        const dispZ = 0.22; // Centered forward of tank, alongside bowl
        const wallX = wallDistX; // Back of dispenser is flush with wallX

        const dispGroup = new THREE.Group();
        dispGroup.position.set(wallX - dispD / 2, dispY, dispZ);

        // Main central body of dispenser
        const dispBody = new THREE.Mesh(new THREE.BoxGeometry(dispD, dispH, 0.26), dispenserCasingMat);
        dispGroup.add(dispBody);

        // Rounded cylindrical ends (front and back along Z) giving the stadium/capsule shape
        const endRadius = dispH / 2;
        [-0.13, 0.13].forEach((ez) => {
          const roundEnd = new THREE.Mesh(new THREE.CylinderGeometry(endRadius, endRadius, dispD, 20), dispenserCasingMat);
          roundEnd.rotation.z = Math.PI / 2;
          roundEnd.position.set(0, 0, ez);
          dispGroup.add(roundEnd);
        });

        // Flush wall mounting backplate
        const backPlate = new THREE.Mesh(new THREE.BoxGeometry(0.015, dispH + 0.01, dispW + 0.01), dispenserCasingMat);
        backPlate.position.set(dispD / 2, 0, 0);
        dispGroup.add(backPlate);

        // Dual circular inspection windows on front face (showing the 2 jumbo rolls inside)
        const windowRadius = 0.075;
        [-0.12, 0.12].forEach((wz) => {
          const winDisc = new THREE.Mesh(new THREE.CylinderGeometry(windowRadius, windowRadius, 0.005, 18), new THREE.MeshBasicMaterial({ color: 0x0a0c0e }));
          winDisc.rotation.z = Math.PI / 2;
          winDisc.position.set(-dispD / 2 - 0.002, 0, wz);
          dispGroup.add(winDisc);

          const rollMesh = new THREE.Mesh(new THREE.CylinderGeometry(windowRadius * 0.85, windowRadius * 0.85, 0.006, 16), paperRollMat);
          rollMesh.rotation.z = Math.PI / 2;
          rollMesh.position.set(-dispD / 2 - 0.003, 0, wz);
          dispGroup.add(rollMesh);
        });

        // Keyhole lock mechanism at bottom center
        const lockLatch = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.02, 0.035), chromeMat);
        lockLatch.position.set(-dispD / 2 - 0.003, -dispH / 2 + 0.03, 0);
        dispGroup.add(lockLatch);

        // Two white paper strips hanging down from the bottom dispenser slots (as in Image 2!)
        const paperTailLeft = new THREE.Mesh(new THREE.PlaneGeometry(0.10, 0.13), paperTailMat);
        paperTailLeft.rotation.y = Math.PI / 2;
        paperTailLeft.position.set(-0.02, -dispH / 2 - 0.065, -0.12);
        dispGroup.add(paperTailLeft);

        const paperTailRight = new THREE.Mesh(new THREE.PlaneGeometry(0.10, 0.17), paperTailMat);
        paperTailRight.rotation.y = Math.PI / 2 + 0.08;
        paperTailRight.position.set(-0.02, -dispH / 2 - 0.085, 0.12);
        dispGroup.add(paperTailRight);

        group.add(dispGroup);

        // 7. CORNER PLUMBING DRAIN/VENT STACK EXTENDING ALL THE WAY INTO CEILING
        const pipeH = ceilH; // Extends through full floor height into the ceiling!
        const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, pipeH, 16), pipeMat);
        pipe.position.set(wallX - 0.06, pipeH / 2, -0.22);
        group.add(pipe);

        // Heavy industrial wall mounting pipe clamps up the vertical stack
        [0.70, 1.60, 2.80, 4.20].forEach((py) => {
          const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.05, 16), pipeMat);
          collar.position.set(wallX - 0.06, py, -0.22);
          group.add(collar);

          const wallStrap = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.03, 0.12), pipeMat);
          wallStrap.position.set(wallX - 0.02, py, -0.22);
          group.add(wallStrap);
        });

        // Top ceiling escutcheon collar plate at the ceiling penetration
        const ceilFlange = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.04, 16), pipeMat);
        ceilFlange.position.set(wallX - 0.06, ceilH - 0.02, -0.22);
        group.add(ceilFlange);

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

        // Stall 1 Door (width 0.90, closed flush and shut down)
        const door1Group = new THREE.Group();
        door1Group.position.set(-1.80, y0, zNorth + 0.30);
        const d1Mesh = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.85, 0.90), stallMat);
        d1Mesh.position.set(0, 1.075, 0.45);
        door1Group.add(d1Mesh);
        const latch1 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.04), chromeMat);
        latch1.position.set(0, 1.05, 0.85);
        door1Group.add(latch1);

        // Out-of-order poster sign on Door 1 (2x larger: 0.76m wide x 1.14m tall)
        const signGeom = new THREE.PlaneGeometry(0.76, 1.14);
        const sign1 = new THREE.Mesh(signGeom, stallSignMat);
        sign1.position.set(0.017, 1.075, 0.45);
        sign1.rotation.y = Math.PI / 2;
        door1Group.add(sign1);

        door1Group.rotation.y = 0;
        this.scene.add(door1Group);

        // Center Pilaster (zNorth + 1.20 to dividerZ + 0.60, covers the middle gap)
        const midPilW = (zSouth - 1.20) - (zNorth + 1.20);
        const pilMid = new THREE.Mesh(new THREE.BoxGeometry(0.04, 2.0, midPilW > 0.30 ? midPilW : 0.60), stallMat);
        pilMid.position.set(-1.80, y0 + 1.10, dividerZ);
        this.scene.add(pilMid);

        // Stall 2 Door (width 0.90, closed flush and shut down)
        const door2Group = new THREE.Group();
        door2Group.position.set(-1.80, y0, zSouth - 1.20);
        const d2Mesh = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.85, 0.90), stallMat);
        d2Mesh.position.set(0, 1.075, 0.45);
        door2Group.add(d2Mesh);
        const latch2 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.04), chromeMat);
        latch2.position.set(0, 1.05, 0.85);
        door2Group.add(latch2);

        // Out-of-order poster sign on Door 2 (2x larger: 0.76m wide x 1.14m tall)
        // Tilted slightly (~4.6 degrees, 0.08 rad) so it looks hastily put on
        const sign2 = new THREE.Mesh(signGeom, stallSignMat);
        sign2.position.set(0.017, 1.075, 0.45);
        sign2.rotation.set(0, Math.PI / 2, 0.08);
        door2Group.add(sign2);

        door2Group.rotation.y = 0;
        this.scene.add(door2Group);

        // South Pilaster
        const pil2 = new THREE.Mesh(new THREE.BoxGeometry(0.04, 2.0, 0.30), stallMat);
        pil2.position.set(-1.80, y0 + 1.10, zSouth - 0.15);
        this.scene.add(pil2);

        // Bold Black & Yellow OSHA Hazard Caution Tape across both shut-down stall doors
        // Skinnier width (0.08m) so posters behind remain clearly visible while keeping full length
        // Layered with distinct X-offsets to completely eliminate coplanar Z-fighting glitches
        const addTapeStrip = (y1, z1, y2, z2, tapeW = 0.08, layer = 0) => {
          const dy = y2 - y1;
          const dz = z2 - z1;
          const len = Math.hypot(dy, dz);
          if (len < 0.001) return;
          const ny = -dz / len * (tapeW / 2);
          const nz = dy / len * (tapeW / 2);

          const geom = new THREE.BufferGeometry();
          // Layer offset in X prevents tape strips from intersecting or z-fighting each other
          const posX = -1.770 + layer * 0.003;
          const positions = new Float32Array([
            posX, y1 + ny, z1 + nz,
            posX, y1 - ny, z1 - nz,
            posX, y2 - ny, z2 - nz,

            posX, y1 + ny, z1 + nz,
            posX, y2 - ny, z2 - nz,
            posX, y2 + ny, z2 + nz,
          ]);
          const uMax = len * 4.0; // repeats stripes cleanly along the skinnier tape
          const uvs = new Float32Array([
            0, 1,
            0, 0,
            uMax, 0,

            0, 1,
            uMax, 0,
            uMax, 1,
          ]);
          const normals = new Float32Array([
            1, 0, 0,
            1, 0, 0,
            1, 0, 0,
            1, 0, 0,
            1, 0, 0,
            1, 0, 0,
          ]);
          geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
          geom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
          geom.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
          const tapeMesh = new THREE.Mesh(geom, hazardTapeMat);
          this.scene.add(tapeMesh);
        };

        // Stall 1 Caution Tape (skinnier 0.08m width, same length, layered to prevent any visual glitching)
        const s1_zA = zNorth + 0.12;
        const s1_zB = zNorth + 1.38;
        addTapeStrip(y0 + 1.62, s1_zA, y0 + 0.62, s1_zB, 0.08, 0); // Diagonal 1
        addTapeStrip(y0 + 0.62, s1_zA, y0 + 1.62, s1_zB, 0.08, 1); // Diagonal 2
        addTapeStrip(y0 + 1.05, s1_zA - 0.06, y0 + 1.05, s1_zB + 0.06, 0.08, 2); // Middle horizontal
        addTapeStrip(y0 + 1.45, s1_zA - 0.06, y0 + 1.45, s1_zB + 0.06, 0.08, 3); // Upper horizontal

        // Stall 2 Caution Tape (skinnier 0.08m width, same length, layered to prevent any visual glitching)
        const s2_zA = zSouth - 1.38;
        const s2_zB = zSouth - 0.12;
        addTapeStrip(y0 + 1.62, s2_zA, y0 + 0.62, s2_zB, 0.08, 0); // Diagonal 1
        addTapeStrip(y0 + 0.62, s2_zA, y0 + 1.62, s2_zB, 0.08, 1); // Diagonal 2
        addTapeStrip(y0 + 1.05, s2_zA - 0.06, y0 + 1.05, s2_zB + 0.06, 0.08, 2); // Middle horizontal
        addTapeStrip(y0 + 1.45, s2_zA - 0.06, y0 + 1.45, s2_zB + 0.06, 0.08, 3); // Upper horizontal

        // Mount toilets flush against back wall: tank against West perimeter wall (x = -3.76), facing East into stall
        buildToilet(-3.45, toiletZ1, Math.PI / 2);
        buildToilet(-3.45, toiletZ2, Math.PI / 2);
      };

      // Helper: Modern Luxury Vanity Suite with Recessed Rectangular Sinks & Deck-Mounted Matte Black Faucets
      const buildVanitySuite = (vx, vz, width, wallDirZ) => {
        const group = new THREE.Group();
        group.position.set(vx, y0, vz);

        const forwardDir = -wallDirZ; // Direction from wall into the room (+1 for Men's, -1 for Women's)
        const counterDepth = 0.62;
        const counterH = 0.85;

        // Espresso wood vanity cabinet
        const cabinet = new THREE.Mesh(new THREE.BoxGeometry(width, 0.80, 0.58), woodMat);
        cabinet.position.set(0, 0.40, forwardDir * 0.02);
        group.add(cabinet);

        // Dark quartz / graphite vanity countertop
        const counterMat = new THREE.MeshLambertMaterial({ color: 0x1e242b });
        const counter = new THREE.Mesh(new THREE.BoxGeometry(width + 0.04, 0.05, counterDepth), counterMat);
        counter.position.set(0, counterH - 0.025, 0);
        group.add(counter);

        // 4-inch backsplash against the wall
        const backsplash = new THREE.Mesh(new THREE.BoxGeometry(width + 0.04, 0.10, 0.02), counterMat);
        backsplash.position.set(0, counterH + 0.05, wallDirZ * (counterDepth / 2 - 0.01));
        group.add(backsplash);

        // Modern Matte Black Faucet & Drain Materials (matching reference design)
        const faucetMat = new THREE.MeshPhongMaterial({
          color: 0x1a1a1c,
          specular: 0x555558,
          shininess: 45
        });
        const basinInnerMat = new THREE.MeshLambertMaterial({ color: 0xedf2f7 });
        const drainMat = new THREE.MeshLambertMaterial({ color: 0x111827 });
        const mirrorMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.05, metalness: 0.95 });

        const sinkSpacing = width * 0.26;

        // Deck positions (measured from wall face: wallDirZ * (counterDepth / 2))
        // Faucet is mounted on the counter deck behind the basin, with clean clearance from the backsplash!
        const wallFaceZ = wallDirZ * (counterDepth / 2);
        const faucetZ = wallFaceZ + forwardDir * 0.10;
        const basinCenterZ = wallFaceZ + forwardDir * 0.36;
        const mirrorZ = wallFaceZ + forwardDir * 0.012;

        [-sinkSpacing, sinkSpacing].forEach((ox) => {
          // --- 1. RECESSED RECTANGULAR SINK BASIN (True under-mount / drop-in cavity) ---
          const basinW = 0.52;
          const basinL = 0.36;
          const basinFloorY = 0.72;
          const basinRimY = counterH;

          // Sunken bottom floor of basin
          const basinFloor = new THREE.Mesh(new THREE.BoxGeometry(basinW - 0.02, 0.02, basinL - 0.02), basinInnerMat);
          basinFloor.position.set(ox, basinFloorY + 0.01, basinCenterZ);
          group.add(basinFloor);

          // Inner vertical basin walls (creating the sunken rectangular box)
          // Back inner wall
          const backWall = new THREE.Mesh(new THREE.BoxGeometry(basinW, basinRimY - basinFloorY, 0.02), basinInnerMat);
          backWall.position.set(ox, (basinFloorY + basinRimY) / 2, basinCenterZ - forwardDir * (basinL / 2 - 0.01));
          group.add(backWall);

          // Front inner wall
          const frontWall = new THREE.Mesh(new THREE.BoxGeometry(basinW, basinRimY - basinFloorY, 0.02), basinInnerMat);
          frontWall.position.set(ox, (basinFloorY + basinRimY) / 2, basinCenterZ + forwardDir * (basinL / 2 - 0.01));
          group.add(frontWall);

          // Left inner wall
          const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.02, basinRimY - basinFloorY, basinL), basinInnerMat);
          leftWall.position.set(ox - (basinW / 2 - 0.01), (basinFloorY + basinRimY) / 2, basinCenterZ);
          group.add(leftWall);

          // Right inner wall
          const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.02, basinRimY - basinFloorY, basinL), basinInnerMat);
          rightWall.position.set(ox + (basinW / 2 - 0.01), (basinFloorY + basinRimY) / 2, basinCenterZ);
          group.add(rightWall);

          // Top perimeter lip / bevel
          const basinBezel = new THREE.Mesh(new THREE.BoxGeometry(basinW + 0.04, 0.01, basinL + 0.04), basinInnerMat);
          basinBezel.position.set(ox, basinRimY + 0.005, basinCenterZ);
          group.add(basinBezel);

          // Drain flange & perforated strainer at the bottom center of the basin
          const drainFlange = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.006, 16), faucetMat);
          drainFlange.position.set(ox, basinFloorY + 0.022, basinCenterZ);
          group.add(drainFlange);

          const drainHole = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.008, 12), drainMat);
          drainHole.position.set(ox, basinFloorY + 0.024, basinCenterZ);
          group.add(drainHole);

          // --- 2. SLEEK MODERN MATTE BLACK FAUCET WITH WATER HANDLE (Reference design) ---
          // Faucet Base / Escutcheon mounted ON THE COUNTERTOP DECK behind the basin
          const faucetBase = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.030, 0.014, 16), faucetMat);
          faucetBase.position.set(ox, counterH + 0.007, faucetZ);
          group.add(faucetBase);

          // Vertical riser post / column
          const riser = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.18, 16), faucetMat);
          riser.position.set(ox, counterH + 0.014 + 0.09, faucetZ);
          group.add(riser);

          // Horizontal rectangular spout extending forward over the basin
          const spoutLength = 0.17;
          const spout = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.018, spoutLength), faucetMat);
          spout.position.set(ox, counterH + 0.17, faucetZ + forwardDir * (spoutLength / 2 - 0.01));
          group.add(spout);

          // Downward water aerator outlet nozzle at the end of the spout
          const aerator = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.010, 0.025, 12), faucetMat);
          aerator.position.set(ox, counterH + 0.15, faucetZ + forwardDir * (spoutLength - 0.025));
          group.add(aerator);

          // Single-lever mixer handle on top of the faucet riser (tilt lever)
          const handleHub = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.024, 14), faucetMat);
          handleHub.position.set(ox, counterH + 0.20, faucetZ);
          group.add(handleHub);

          const handleLever = new THREE.Mesh(new THREE.BoxGeometry(0.020, 0.010, 0.08), faucetMat);
          handleLever.position.set(ox, counterH + 0.21, faucetZ + forwardDir * 0.025);
          group.add(handleLever);

          // --- 3. COMMERCIAL TOUCHLESS AUTOMATIC SOAP DISPENSER ---
          // Seamless commercial electronic dispenser beside the faucet on the back deck (ox + 0.18)
          const dispX = ox + 0.18;

          // Circular escutcheon base flange flush against deck surface
          const soapFlange = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.028, 0.010, 16), faucetMat);
          soapFlange.position.set(dispX, counterH + 0.005, faucetZ);
          group.add(soapFlange);

          // Tapered vertical riser body
          const soapBody = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.023, 0.08, 16), faucetMat);
          soapBody.position.set(dispX, counterH + 0.05, faucetZ);
          group.add(soapBody);

          // Upper collar cap
          const soapCap = new THREE.Mesh(new THREE.SphereGeometry(0.019, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), faucetMat);
          soapCap.position.set(dispX, counterH + 0.09, faucetZ);
          group.add(soapCap);

          // Curved forward swan-neck spout reaching over the sink bowl
          const soapSpout = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.012, 0.075, 14), faucetMat);
          soapSpout.rotation.x = forwardDir * 0.55;
          soapSpout.position.set(dispX, counterH + 0.088, faucetZ + forwardDir * 0.030);
          group.add(soapSpout);

          // Downward discharge nozzle tip
          const soapNozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.008, 0.018, 12), faucetMat);
          soapNozzle.position.set(dispX, counterH + 0.068, faucetZ + forwardDir * 0.052);
          group.add(soapNozzle);

          // Optical infrared proximity sensor window underneath spout nozzle
          const sensorEyeMat = new THREE.MeshBasicMaterial({ color: 0x111827 });
          const sensorEye = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.004, 10), sensorEyeMat);
          sensorEye.position.set(dispX, counterH + 0.060, faucetZ + forwardDir * 0.046);
          group.add(sensorEye);

          // Status LED indicator dot on top of dispenser head
          const ledDispMat = new THREE.MeshBasicMaterial({ color: 0x00e5ff });
          const statusLed = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.003, 10), ledDispMat);
          statusLed.position.set(dispX, counterH + 0.106, faucetZ);
          group.add(statusLed);

          // --- 4. FLUSH WALL MIRROR & VANITY LIGHTING ---
          // Mirror mounted directly on the wall face
          const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.72, 1.25, 0.02), mirrorMat);
          mirror.position.set(ox, 1.70, mirrorZ);
          group.add(mirror);

          const mirrorFrame = new THREE.Mesh(new THREE.BoxGeometry(0.76, 1.29, 0.01), woodMat);
          mirrorFrame.position.set(ox, 1.70, mirrorZ - forwardDir * 0.008);
          group.add(mirrorFrame);

          // Modern linear LED vanity sconce bar above the mirror
          const sconceBar = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.035, 0.06), faucetMat);
          sconceBar.position.set(ox, 2.38, mirrorZ + forwardDir * 0.03);
          group.add(sconceBar);
        });

        this.scene.add(group);
      };

      // Helper: Commercial Sculpted Stainless Steel Wall-Mounted Hand Dryer (Flush against wall tiles)
      const buildWallMountedHandDryer = (x, zWall, wallDirZ) => {
        const forward = -wallDirZ; // Direction out from wall face into restroom
        const dGroup = new THREE.Group();
        dGroup.position.set(x, y0 + 1.25, zWall);

        const dryerMat = new THREE.MeshStandardMaterial({
          color: 0xe2e8f0,
          metalness: 0.90,
          roughness: 0.20
        });
        const backplateMat = new THREE.MeshLambertMaterial({ color: 0x1e293b });
        const ledBlueMat = new THREE.MeshBasicMaterial({ color: 0x00e5ff });
        const nozzleMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.6 });

        // 1. Flush mounting backplate pinned directly against wall tiles
        const backPlate = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.40, 0.015), backplateMat);
        backPlate.position.set(0, 0, forward * 0.008);
        dGroup.add(backPlate);

        // 2. Main commercial sculpted stainless casing
        const casing = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.35, 0.15), dryerMat);
        casing.position.set(0, 0, forward * 0.085);
        dGroup.add(casing);

        // 3. Top contoured hood cowl
        const topCowl = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.15, 16), dryerMat);
        topCowl.rotation.z = Math.PI / 2;
        topCowl.position.set(0, 0.175, forward * 0.085);
        dGroup.add(topCowl);

        // 4. Downward high-speed air nozzle outlet
        const nozzle = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.03, 0.06), nozzleMat);
        nozzle.position.set(0, -0.165, forward * 0.095);
        dGroup.add(nozzle);

        // 5. Active optical sensor glow indicator
        const sensorLED = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.012, 0.01), ledBlueMat);
        sensorLED.position.set(0, -0.06, forward * 0.162);
        dGroup.add(sensorLED);

        this.scene.add(dGroup);
      };

      // Helper: Men's Commercial Vitreous China Urinals
      const buildUrinals = (zWall) => {
        // Divider wall north face is at zWall = -10.20
        // Urinals hang on this wall and project into Men's restroom in the -Z direction
        [0.6, 2.0].forEach((ux) => {
          const uGroup = new THREE.Group();
          uGroup.position.set(ux, y0, zWall);

          // Vitreous china back wall plate flush against wall face
          const backPlate = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.92, 0.04), porcelainMat);
          backPlate.position.set(0, 0.95, -0.02);
          uGroup.add(backPlate);

          // Contoured side privacy wings projecting in -Z direction
          const leftWing = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.68, 0.26), porcelainMat);
          leftWing.position.set(-0.20, 0.92, -0.15);
          uGroup.add(leftWing);

          const rightWing = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.68, 0.26), porcelainMat);
          rightWing.position.set(0.20, 0.92, -0.15);
          uGroup.add(rightWing);

          // Projected lower bowl & basin projecting in -Z direction
          const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.12, 0.26, 16), porcelainMat);
          bowl.position.set(0, 0.65, -0.18);
          uGroup.add(bowl);

          // Chrome beehive strainer drain in bowl
          const strainer = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.01, 12), chromeMat);
          strainer.position.set(0, 0.60, -0.18);
          uGroup.add(strainer);

          // Sloan Chrome Flushometer Valve mounted above bowl
          const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.42, 10), chromeMat);
          pipe.position.set(0, 1.50, -0.06);
          uGroup.add(pipe);

          const coupling = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.06, 10), chromeMat);
          coupling.position.set(0, 1.44, -0.06);
          uGroup.add(coupling);

          const valve = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.07), chromeMat);
          valve.position.set(0, 1.58, -0.06);
          uGroup.add(valve);

          const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.09, 8), chromeMat);
          handle.rotation.z = Math.PI / 2;
          handle.position.set(-0.08, 1.58, -0.06);
          uGroup.add(handle);

          // Vertical supply pipe extending straight up into the ceiling slab
          const supplyH = ceilH - 1.61;
          const supplyPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, supplyH, 10), chromeMat);
          supplyPipe.position.set(0, 1.61 + supplyH / 2, -0.06);
          uGroup.add(supplyPipe);

          const supplyFlange = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.025, 12), chromeMat);
          supplyFlange.position.set(0, ceilH - 0.015, -0.06);
          uGroup.add(supplyFlange);

          this.scene.add(uGroup);
        });

        // Urinal privacy screen partition between urinals with chrome wall brackets
        const screen = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.25, 0.65), stallMat);
        screen.position.set(1.3, y0 + 1.15, zWall - 0.33);
        this.scene.add(screen);

        const bracketTop = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.06), chromeMat);
        bracketTop.position.set(1.3, y0 + 1.60, zWall - 0.03);
        this.scene.add(bracketTop);

        const bracketBot = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.06), chromeMat);
        bracketBot.position.set(1.3, y0 + 0.70, zWall - 0.03);
        this.scene.add(bracketBot);
      };

      // BUILD MEN'S RESTROOM (NORTH: z = -14.0 .. -10.0)
      // Stalls on West side
      buildStallBank(-13.8, -10.2, -12.0, -12.9, -11.1);
      // Vanity on North wall face (z = -13.80, wallDirZ = -1, counter center vz = -13.49)
      buildVanitySuite(1.4, -13.49, 2.8, -1);
      // Flush wall-mounted hand dryer on North wall beside vanity (x = 3.15, z = -13.80)
      buildWallMountedHandDryer(3.15, -13.80, -1);
      // Urinals on South divider wall face (z = -10.20)
      buildUrinals(-10.20);

      // BUILD WOMEN'S RESTROOM (SOUTH: z = -10.0 .. -6.0)
      // Stalls on West side
      buildStallBank(-9.8, -6.2, -8.0, -8.9, -7.1);
      // Vanity on South wall face (z = -6.20, wallDirZ = 1, counter center vz = -6.51)
      buildVanitySuite(1.4, -6.51, 2.8, 1);
      // Flush wall-mounted hand dryer on South wall beside vanity (x = 3.15, z = -6.20)
      buildWallMountedHandDryer(3.15, -6.20, 1);

      // Colliders for Restrooms
      this.colliders.push(
        // Men's stalls & toilets
        { type: 'box', floor: fl, minX: -3.8, maxX: -1.75, minZ: -13.85, maxZ: -10.15 },
        // Men's vanity
        { type: 'box', floor: fl, minX: -0.1, maxX: 2.9, minZ: -13.85, maxZ: -13.15, minY: y0, maxY: y0 + 0.90 },
        // Men's urinals
        { type: 'box', floor: fl, minX: 0.3, maxX: 2.3, minZ: -10.6, maxZ: -10.15 },
        // Women's stalls & toilets
        { type: 'box', floor: fl, minX: -3.8, maxX: -1.75, minZ: -9.85, maxZ: -6.15 },
        // Women's vanity
        { type: 'box', floor: fl, minX: -0.1, maxX: 2.9, minZ: -6.85, maxZ: -6.15, minY: y0, maxY: y0 + 0.90 }
      );
    }

    createRealisticStudyRoom(fl, y0, mats) {
      const woodMat = mats.mahogany;
      const darkWoodMat = new THREE.MeshLambertMaterial({ color: 0x27160c });
      const polishedBrassMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.85, roughness: 0.25 });
      const darkMetalMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.80, roughness: 0.35 });
      const emeraldGlassMat = new THREE.MeshPhongMaterial({ color: 0x054f36, specular: 0x86efac, shininess: 90 });
      const opalGlassMat = new THREE.MeshLambertMaterial({ color: 0xf8fafc });
      const tuftedLeatherMat = new THREE.MeshStandardMaterial({ color: 0x2b170e, roughness: 0.45, metalness: 0.10 });
      const leatherButtonMat = new THREE.MeshLambertMaterial({ color: 0x150b07 });
      const greenBlotterMat = new THREE.MeshLambertMaterial({ color: 0x064e3b });
      const paperMat = new THREE.MeshLambertMaterial({ color: 0xfef3c7 });
      const bookRedMat = new THREE.MeshLambertMaterial({ color: 0x7f1d1d });
      const bookBlueMat = new THREE.MeshLambertMaterial({ color: 0x1e3a8a });
      const bookGreenMat = new THREE.MeshLambertMaterial({ color: 0x14532d });
      const bookGoldMat = new THREE.MeshLambertMaterial({ color: 0xb45309 });
      const feltMat = new THREE.MeshLambertMaterial({ color: 0x14532d });
      const inkGlassMat = new THREE.MeshPhongMaterial({ color: 0x0f172a, specular: 0xffffff, shininess: 100 });

      // Modern pen & pencil cup materials
      const penCupMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5, metalness: 0.3 });
      const cupInnerMat = new THREE.MeshBasicMaterial({ color: 0x0f172a });
      const pencilYellowMat = new THREE.MeshLambertMaterial({ color: 0xeab308 });
      const pencilFerruleMat = new THREE.MeshStandardMaterial({ color: 0xc0c0c0, metalness: 0.85, roughness: 0.3 });
      const eraserMat = new THREE.MeshLambertMaterial({ color: 0xf472b6 });
      const penBlueMat = new THREE.MeshLambertMaterial({ color: 0x1d4ed8 });
      const penRedMat = new THREE.MeshLambertMaterial({ color: 0xdc2626 });
      const penBlackMat = new THREE.MeshLambertMaterial({ color: 0x111827 });
      const penSilverMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.8, roughness: 0.25 });

      // --- REUSABLE 3D ASSET BUILDERS ---

      // 1. AUTHENTIC PERIOD BANKER'S LAMP
      // Round tiered brass base, vertical stem, curved gooseneck arm, swivel axle with finials,
      // downward-facing emerald cased-glass shade with white inner reflector, brass end-caps, pull chain with bead
      const buildBankersLamp = (x, y, z, rotY = 0, addLight = false) => {
        const lampGroup = new THREE.Group();
        lampGroup.position.set(x, y, z);
        lampGroup.rotation.y = rotY;

        // Tiered cast-brass base with felt underpad
        const feltPad = new THREE.Mesh(new THREE.CylinderGeometry(0.082, 0.082, 0.005, 20), feltMat);
        feltPad.position.y = 0.0025;
        lampGroup.add(feltPad);

        const baseLower = new THREE.Mesh(new THREE.CylinderGeometry(0.076, 0.082, 0.015, 20), polishedBrassMat);
        baseLower.position.y = 0.0125;
        lampGroup.add(baseLower);

        const baseRiser = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.068, 0.018, 18), polishedBrassMat);
        baseRiser.position.y = 0.029;
        lampGroup.add(baseRiser);

        const baseCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.038, 0.016, 16), polishedBrassMat);
        baseCollar.position.y = 0.046;
        lampGroup.add(baseCollar);

        // Vertical brass stem
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.012, 0.14, 12), polishedBrassMat);
        stem.position.set(0, 0.12, 0);
        lampGroup.add(stem);

        // Adjustment knob
        const adjKnob = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.014, 12), polishedBrassMat);
        adjKnob.position.set(0, 0.19, 0);
        adjKnob.rotation.z = Math.PI / 2;
        lampGroup.add(adjKnob);

        // Curved arching gooseneck arm reaching forward
        const armLower = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.10, 10), polishedBrassMat);
        armLower.position.set(0, 0.235, 0.025);
        armLower.rotation.x = 0.52;
        lampGroup.add(armLower);

        const armUpper = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.08, 10), polishedBrassMat);
        armUpper.position.set(0, 0.275, 0.065);
        armUpper.rotation.x = 0.95;
        lampGroup.add(armUpper);

        // Horizontal shade axle with finial ball caps
        const shadeAxle = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.22, 12), polishedBrassMat);
        shadeAxle.position.set(0, 0.29, 0.10);
        shadeAxle.rotation.z = Math.PI / 2;
        lampGroup.add(shadeAxle);

        [-0.11, 0.11].forEach((ax) => {
          const ballCap = new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 10), polishedBrassMat);
          ballCap.position.set(ax, 0.29, 0.10);
          lampGroup.add(ballCap);
        });

        // Downward-facing emerald cased-glass shade
        const shadeGeom = new THREE.CylinderGeometry(0.065, 0.065, 0.20, 24, 1, false, 0, Math.PI);
        const outerShade = new THREE.Mesh(shadeGeom, emeraldGlassMat);
        outerShade.position.set(0, 0.29, 0.10);
        outerShade.rotation.z = Math.PI / 2;
        outerShade.rotation.x = Math.PI;
        lampGroup.add(outerShade);

        const innerShadeGeom = new THREE.CylinderGeometry(0.060, 0.060, 0.196, 24, 1, false, 0, Math.PI);
        const innerShade = new THREE.Mesh(innerShadeGeom, opalGlassMat);
        innerShade.position.set(0, 0.29, 0.10);
        innerShade.rotation.z = Math.PI / 2;
        innerShade.rotation.x = Math.PI;
        lampGroup.add(innerShade);

        // Molded brass end caps
        [-0.101, 0.101].forEach((cx) => {
          const endCap = new THREE.Mesh(new THREE.CylinderGeometry(0.066, 0.066, 0.006, 24, 1, false, 0, Math.PI), polishedBrassMat);
          endCap.position.set(cx, 0.29, 0.10);
          endCap.rotation.z = Math.PI / 2;
          endCap.rotation.x = Math.PI;
          lampGroup.add(endCap);
        });

        // Pull chain with brass bead
        const socket = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.02, 10), polishedBrassMat);
        socket.position.set(0.03, 0.28, 0.10);
        lampGroup.add(socket);

        const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.0018, 0.0018, 0.11, 6), polishedBrassMat);
        chain.position.set(0.03, 0.215, 0.10);
        lampGroup.add(chain);

        const chainBead = new THREE.Mesh(new THREE.SphereGeometry(0.0065, 8, 8), polishedBrassMat);
        chainBead.position.set(0.03, 0.155, 0.10);
        lampGroup.add(chainBead);

        if (addLight) {
          const lampLight = new THREE.PointLight(0xffea9f, 0.45, 2.4, 1.8);
          lampLight.position.set(0, 0.24, 0.12);
          lampGroup.add(lampLight);
        }

        return lampGroup;
      };

      // 2. TRADITIONAL AMERICAN LIBRARY SLAT-BACK CHAIR
      // 4 turned tapered legs, brass glides, H-stretchers, contoured saddle seat with waterfall front edge,
      // curved steam-bent crest rail, lumbar rail, and 5 vertical slats
      const buildLibraryChair = (x, y, z, rotY = 0, chairWoodMat = woodMat) => {
        const chairGroup = new THREE.Group();
        chairGroup.position.set(x, y, z);
        chairGroup.rotation.y = rotY;

        // Contoured saddle seat (0.48m wide, 0.46m deep, 0.44m high from floor)
        const seat = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.036, 0.46), chairWoodMat);
        seat.position.set(0, 0.44, 0);
        chairGroup.add(seat);

        const seatFront = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.48, 12), chairWoodMat);
        seatFront.position.set(0, 0.43, 0.23);
        seatFront.rotation.z = Math.PI / 2;
        chairGroup.add(seatFront);

        // 4 Tapered turned wooden legs extending clean straight to the floor
        [[-0.19, 0.18], [0.19, 0.18], [-0.17, -0.17], [0.17, -0.17]].forEach(([lx, lz], i) => {
          const isRear = i >= 2;
          const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.012, 0.42, 10), chairWoodMat);
          leg.position.set(lx, 0.21, lz);
          if (isRear) leg.rotation.x = -0.06;
          chairGroup.add(leg);
        });

        // H-stretcher system
        [-0.18, 0.18].forEach((sx) => {
          const sideStretcher = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.35, 8), chairWoodMat);
          sideStretcher.position.set(sx, 0.16, 0);
          sideStretcher.rotation.x = Math.PI / 2;
          chairGroup.add(sideStretcher);
        });

        const crossStretcher = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.36, 8), chairWoodMat);
        crossStretcher.position.set(0, 0.16, 0);
        crossStretcher.rotation.z = Math.PI / 2;
        chairGroup.add(crossStretcher);

        // Backrest stiles
        [-0.18, 0.18].forEach((rx) => {
          const stile = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.018, 0.44, 10), chairWoodMat);
          stile.position.set(rx, 0.67, -0.20);
          stile.rotation.x = -0.07;
          chairGroup.add(stile);
        });

        // Top curved crest rail
        const crestRail = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.07, 0.026), chairWoodMat);
        crestRail.position.set(0, 0.88, -0.22);
        crestRail.rotation.x = -0.07;
        chairGroup.add(crestRail);

        // Lower lumbar rail
        const lumbarRail = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.035, 0.022), chairWoodMat);
        lumbarRail.position.set(0, 0.54, -0.19);
        lumbarRail.rotation.x = -0.07;
        chairGroup.add(lumbarRail);

        // 5 Contoured vertical back slats
        [-0.13, -0.065, 0, 0.065, 0.13].forEach((bx) => {
          const slat = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.28, 0.012), chairWoodMat);
          slat.position.set(bx, 0.70, -0.205);
          slat.rotation.x = -0.07;
          chairGroup.add(slat);
        });

        return chairGroup;
      };

      // 3. STATELY EXECUTIVE LEATHER SWIVEL CHAIR
      // 5-star swivel base with dual rolling casters, steel pedestal, thick button-tufted leather seat,
      // tall winged backrest with diamond tufting and headrest roll, mahogany armrests with brass nailheads
      const buildExecutiveLeatherChair = (x, y, z, rotY = 0) => {
        const chairGroup = new THREE.Group();
        chairGroup.position.set(x, y, z);
        chairGroup.rotation.y = rotY;

        // 5-star swivel base
        const baseCenter = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.05, 16), polishedBrassMat);
        baseCenter.position.y = 0.10;
        chairGroup.add(baseCenter);

        for (let a = 0; a < 5; a++) {
          const angle = (a * Math.PI * 2) / 5;
          const rad = 0.32;
          const armX = Math.cos(angle) * (rad / 2);
          const armZ = Math.sin(angle) * (rad / 2);

          const legArm = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.035, rad), darkWoodMat);
          legArm.position.set(armX, 0.085, armZ);
          legArm.rotation.y = -angle + Math.PI / 2;
          chairGroup.add(legArm);

          const tipX = Math.cos(angle) * rad;
          const tipZ = Math.sin(angle) * rad;

          const casterStem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.035, 8), darkMetalMat);
          casterStem.position.set(tipX, 0.055, tipZ);
          chairGroup.add(casterStem);

          const casterWheel = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.022, 12), darkMetalMat);
          casterWheel.position.set(tipX, 0.024, tipZ);
          casterWheel.rotation.z = Math.PI / 2;
          chairGroup.add(casterWheel);
        }

        // Hydraulic steel pedestal column
        const pColumn = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.038, 0.22, 16), darkMetalMat);
        pColumn.position.y = 0.22;
        chairGroup.add(pColumn);

        const tiltMechBox = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.07, 0.24), darkMetalMat);
        tiltMechBox.position.set(0, 0.34, 0);
        chairGroup.add(tiltMechBox);

        // Deep button-tufted leather seat cushion
        const seatBase = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.06, 0.54), darkWoodMat);
        seatBase.position.set(0, 0.40, 0);
        chairGroup.add(seatBase);

        const seatCushion = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.10, 0.52), tuftedLeatherMat);
        seatCushion.position.set(0, 0.46, 0);
        chairGroup.add(seatCushion);

        [-0.14, 0.14].forEach((tx) => {
          [-0.12, 0.12].forEach((tz) => {
            const btn = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 8), leatherButtonMat);
            btn.position.set(tx, 0.512, tz);
            chairGroup.add(btn);
          });
        });

        // Winged backrest with diamond tufting and headrest
        const backRestGroup = new THREE.Group();
        backRestGroup.position.set(0, 0.51, -0.22);
        backRestGroup.rotation.x = -0.08;

        const backWoodShell = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.68, 0.04), darkWoodMat);
        backWoodShell.position.set(0, 0.34, -0.02);
        backRestGroup.add(backWoodShell);

        const backLeatherPillow = new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.66, 0.08), tuftedLeatherMat);
        backLeatherPillow.position.set(0, 0.34, 0.025);
        backRestGroup.add(backLeatherPillow);

        const headrest = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.48, 16), tuftedLeatherMat);
        headrest.position.set(0, 0.68, 0.03);
        headrest.rotation.z = Math.PI / 2;
        backRestGroup.add(headrest);

        [-0.15, 0, 0.15].forEach((bx) => {
          [0.18, 0.34, 0.50].forEach((by) => {
            const btn = new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 8), leatherButtonMat);
            btn.position.set(bx, by, 0.068);
            backRestGroup.add(btn);
          });
        });

        chairGroup.add(backRestGroup);

        // Mahogany armrests with padded leather tops & brass nailheads
        [-0.29, 0.29].forEach((ax) => {
          const isLeft = ax < 0;
          const armPost = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.22, 0.045), darkWoodMat);
          armPost.position.set(ax, 0.53, 0.08);
          chairGroup.add(armPost);

          const armRail = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.035, 0.40), darkWoodMat);
          armRail.position.set(ax, 0.64, -0.04);
          chairGroup.add(armRail);

          const armPad = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.025, 0.36), tuftedLeatherMat);
          armPad.position.set(ax, 0.665, -0.04);
          chairGroup.add(armPad);

          [-0.15, -0.05, 0.05, 0.15].forEach((nz) => {
            const stud = new THREE.Mesh(new THREE.SphereGeometry(0.005, 6, 6), polishedBrassMat);
            stud.position.set(ax + (isLeft ? -0.03 : 0.03), 0.64, nz);
            chairGroup.add(stud);
          });
        });

        return chairGroup;
      };

      // 4. DESK ACCESSORY HELPERS
      const buildBookStack = (x, y, z, rotY = 0) => {
        const stackGroup = new THREE.Group();
        stackGroup.position.set(x, y, z);
        stackGroup.rotation.y = rotY;

        const colors = [bookRedMat, bookBlueMat, bookGoldMat];
        const sizes = [[0.32, 0.045, 0.24], [0.30, 0.04, 0.22], [0.27, 0.035, 0.20]];
        let curY = 0;

        for (let i = 0; i < 3; i++) {
          const [bw, bh, bd] = sizes[i];
          const book = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), colors[i]);
          book.position.set(0, curY + bh / 2, 0);
          if (i === 1) book.rotation.y = 0.08;
          if (i === 2) book.rotation.y = -0.05;
          stackGroup.add(book);

          const pages = new THREE.Mesh(new THREE.BoxGeometry(bw - 0.015, bh - 0.006, bd - 0.01), paperMat);
          pages.position.set(0.005, curY + bh / 2, 0);
          if (i === 1) pages.rotation.y = 0.08;
          if (i === 2) pages.rotation.y = -0.05;
          stackGroup.add(pages);

          curY += bh;
        }

        return stackGroup;
      };

      const buildOpenBook = (x, y, z, rotY = 0) => {
        const bookGroup = new THREE.Group();
        bookGroup.position.set(x, y, z);
        bookGroup.rotation.y = rotY;

        const cover = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.01, 0.30), bookGreenMat);
        cover.position.y = 0.005;
        bookGroup.add(cover);

        // Left page angled slightly
        const leftPage = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.018, 0.28), paperMat);
        leftPage.position.set(-0.10, 0.016, 0);
        leftPage.rotation.z = -0.04;
        bookGroup.add(leftPage);

        // Right page angled slightly
        const rightPage = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.018, 0.28), paperMat);
        rightPage.position.set(0.10, 0.016, 0);
        rightPage.rotation.z = 0.04;
        bookGroup.add(rightPage);

        // Center spine crease
        const spine = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.29, 8), darkWoodMat);
        spine.position.set(0, 0.018, 0);
        spine.rotation.x = Math.PI / 2;
        bookGroup.add(spine);

        return bookGroup;
      };

      // 4. MODERN CUP OF PENS & PENCILS
      // Modern desk cup filled with classic yellow #2 pencils with pink erasers,
      // and modern blue, red, black, and silver ballpoint/gel pens
      const buildPenAndPencilCup = (x, y, z) => {
        const group = new THREE.Group();
        group.position.set(x, y, z);

        // Cylindrical pen cup (radius 0.042, height 0.10)
        const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.038, 0.10, 20), penCupMat);
        cup.position.y = 0.05;
        group.add(cup);

        const cupRim = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.044, 0.008, 20), penCupMat);
        cupRim.position.y = 0.098;
        group.add(cupRim);

        const interior = new THREE.Mesh(new THREE.CylinderGeometry(0.039, 0.039, 0.005, 18), cupInnerMat);
        interior.position.y = 0.093;
        group.add(interior);

        // Helper: add pencil
        const addPencil = (px, pz, rotX, rotZ) => {
          const pGroup = new THREE.Group();
          pGroup.position.set(px, 0.04, pz);
          pGroup.rotation.x = rotX;
          pGroup.rotation.z = rotZ;

          const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.12, 6), pencilYellowMat);
          shaft.position.y = 0.07;
          pGroup.add(shaft);

          const ferrule = new THREE.Mesh(new THREE.CylinderGeometry(0.0042, 0.0042, 0.012, 10), pencilFerruleMat);
          ferrule.position.y = 0.134;
          pGroup.add(ferrule);

          const eraser = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.008, 10), eraserMat);
          eraser.position.y = 0.142;
          pGroup.add(eraser);

          group.add(pGroup);
        };

        // Helper: add pen
        const addPen = (px, pz, rotX, rotZ, bodyMat, capMat) => {
          const penGroup = new THREE.Group();
          penGroup.position.set(px, 0.04, pz);
          penGroup.rotation.x = rotX;
          penGroup.rotation.z = rotZ;

          const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0042, 0.125, 12), bodyMat);
          barrel.position.y = 0.072;
          penGroup.add(barrel);

          const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.0046, 0.0046, 0.020, 12), capMat || bodyMat);
          cap.position.y = 0.138;
          penGroup.add(cap);

          const clip = new THREE.Mesh(new THREE.BoxGeometry(0.0015, 0.035, 0.003), pencilFerruleMat);
          clip.position.set(0.0055, 0.125, 0);
          penGroup.add(clip);

          group.add(penGroup);
        };

        // Populate with modern pens and pencils
        addPencil(-0.012, -0.008, -0.12, -0.10);
        addPencil(0.014, 0.010, 0.14, 0.08);
        addPen(0.016, -0.012, -0.06, 0.16, penBlueMat, penBlueMat);
        addPen(-0.015, 0.014, 0.15, -0.12, penRedMat, penRedMat);
        addPen(0.002, -0.016, -0.16, 0.04, penBlackMat, pencilFerruleMat);
        addPen(-0.018, 0.002, 0.04, -0.18, penSilverMat, penSilverMat);

        return group;
      };

      if (fl === 0 || fl === 2) {
        // =========================================================================
        // FLOORS 0 & 2: PERIOD RESEARCH LIBRARY & DOUBLE-SIDED STUDY CARRELS
        // =========================================================================

        // 2 Double-Sided Study Carrels at z = -3.8 and z = -0.2
        [-3.8, -0.2].forEach((cz) => {
          const carrelGroup = new THREE.Group();
          carrelGroup.position.set(-0.6, y0, cz);

          // Solid hardwood desktop (3.4m long x 1.6m wide)
          const deskTop = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.08, 1.6), woodMat);
          deskTop.position.y = 0.76;
          carrelGroup.add(deskTop);

          // Center privacy divider with molded top cap
          const divider = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.52, 0.06), woodMat);
          divider.position.y = 1.05;
          carrelGroup.add(divider);

          const divCap = new THREE.Mesh(new THREE.BoxGeometry(3.44, 0.03, 0.09), woodMat);
          divCap.position.y = 1.32;
          carrelGroup.add(divCap);

          // Side privacy end-wings
          [-1.7, 1.7].forEach((wx) => {
            const wing = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.52, 1.6), woodMat);
            wing.position.set(wx, 1.05, 0);
            carrelGroup.add(wing);
          });

          // Center partition cross-fin separating left and right bays
          const crossFin = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.44, 1.54), woodMat);
          crossFin.position.set(0, 1.01, 0);
          carrelGroup.add(crossFin);

          // 4 Sturdy turned legs with floor base stretchers
          [[-1.6, -0.72], [1.6, -0.72], [-1.6, 0.72], [1.6, 0.72]].forEach(([lx, lz]) => {
            const leg = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.72, 0.10), woodMat);
            leg.position.set(lx, 0.36, lz);
            carrelGroup.add(leg);
          });

          // 4 Study Stations: 2 North (facing South) and 2 South (facing North)
          // North stations (z = -0.45, looking South rotY = 0)
          [-0.85, 0.85].forEach((ox) => {
            // Authentic banker's lamp mounted on divider/desk facing user
            const lamp = buildBankersLamp(ox, 0.80, -0.06, 0, false);
            carrelGroup.add(lamp);

            // Open book for research
            const openBk = buildOpenBook(ox - 0.25, 0.80, -0.42, 0.05);
            carrelGroup.add(openBk);

            // Stack of reference books
            const bStack = buildBookStack(ox + 0.35, 0.80, -0.40, -0.10);
            carrelGroup.add(bStack);
          });

          // South stations (z = 0.45, looking North rotY = Math.PI)
          [-0.85, 0.85].forEach((ox) => {
            const lamp = buildBankersLamp(ox, 0.80, 0.06, Math.PI, false);
            carrelGroup.add(lamp);

            const openBk = buildOpenBook(ox + 0.25, 0.80, 0.42, Math.PI - 0.05);
            carrelGroup.add(openBk);

            const bStack = buildBookStack(ox - 0.35, 0.80, 0.40, Math.PI + 0.10);
            carrelGroup.add(bStack);
          });

          this.scene.add(carrelGroup);

          // Place 4 authentic slat-back library chairs tucked neatly at the carrel stations
          [-0.85, 0.85].forEach((ox) => {
            // North chairs facing South toward desk
            const chairN = buildLibraryChair(-0.6 + ox, y0, cz - 1.15, 0, woodMat);
            this.scene.add(chairN);

            // South chairs facing North toward desk
            const chairS = buildLibraryChair(-0.6 + ox, y0, cz + 1.15, Math.PI, woodMat);
            this.scene.add(chairS);
          });

          // Colliders for carrel and chairs
          this.colliders.push({
            type: 'box',
            floor: fl,
            minX: -2.4,
            maxX: 1.2,
            minZ: cz - 0.85,
            maxZ: cz + 0.85,
            minY: y0,
            maxY: y0 + 0.85
          });
        });

        // West Wall Perimeter Bookcase with individual shelves and book rows (x = -3.55, z: -5.4..1.4)
        const wallBookshelfGroup = new THREE.Group();
        wallBookshelfGroup.position.set(-3.55, y0, -2.0);

        // Outer case frame
        const bCaseFrame = new THREE.Mesh(new THREE.BoxGeometry(0.50, 3.4, 6.6), woodMat);
        bCaseFrame.position.y = 1.7;
        wallBookshelfGroup.add(bCaseFrame);

        // 5 Inset open shelves populated with books
        const shelfColors = [bookRedMat, bookBlueMat, bookGreenMat, bookGoldMat];
        for (let s = 0; s < 5; s++) {
          const sy = 0.50 + s * 0.60;
          const shelfPlank = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.04, 6.4), darkWoodMat);
          shelfPlank.position.set(0.02, sy, 0);
          wallBookshelfGroup.add(shelfPlank);

          // Row of books on this shelf
          for (let b = -3.0; b < 3.0; b += 0.28) {
            const bMat = shelfColors[Math.abs(Math.round(b * 5 + s)) % 4];
            const bHeight = 0.38 + ((b + 3.0) % 0.15);
            const bookRow = new THREE.Mesh(new THREE.BoxGeometry(0.38, bHeight, 0.24), bMat);
            bookRow.position.set(0.04, sy + bHeight / 2 + 0.02, b);
            wallBookshelfGroup.add(bookRow);
          }
        }
        this.scene.add(wallBookshelfGroup);

        this.colliders.push({
          type: 'box',
          floor: fl,
          minX: -3.8,
          maxX: -3.2,
          minZ: -5.4,
          maxZ: 1.4
        });

        // Detailed 12-Drawer Vintage Card Catalog Cabinet with brass pulls & label frames
        const cardCatalogGroup = new THREE.Group();
        cardCatalogGroup.position.set(2.6, y0, 1.0);

        const cardBody = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.3, 0.65), woodMat);
        cardBody.position.y = 0.65;
        cardCatalogGroup.add(cardBody);

        // 12 Drawers (4 columns x 3 rows) on front face
        for (let row = 0; row < 3; row++) {
          for (let col = 0; col < 4; col++) {
            const dx = -0.42 + col * 0.28;
            const dy = 0.30 + row * 0.32;

            const drawerFace = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.26, 0.02), darkWoodMat);
            drawerFace.position.set(dx, dy, -0.33);
            cardCatalogGroup.add(drawerFace);

            const labelFrame = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 0.01), polishedBrassMat);
            labelFrame.position.set(dx, dy + 0.03, -0.342);
            cardCatalogGroup.add(labelFrame);

            const cardPaper = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.04, 0.005), paperMat);
            cardPaper.position.set(dx, dy + 0.03, -0.346);
            cardCatalogGroup.add(cardPaper);

            const cupPull = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.025, 0.02), polishedBrassMat);
            cupPull.position.set(dx, dy - 0.05, -0.345);
            cardCatalogGroup.add(cupPull);
          }
        }
        this.scene.add(cardCatalogGroup);

        this.colliders.push({
          type: 'box',
          floor: fl,
          minX: 2.0,
          maxX: 3.2,
          minZ: 0.6,
          maxZ: 1.4,
          minY: y0,
          maxY: y0 + 1.30
        });

      } else if (fl === 1) {
        // =========================================================================
        // FLOOR 1: EXECUTIVE STUDY SUITE
        // =========================================================================

        const deskGroup = new THREE.Group();
        deskGroup.position.set(-0.6, y0, -2.0);

        // Classical Partner's Desk Top with molded bullnose edge (2.8m wide x 1.4m deep)
        const deskTop = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.08, 1.4), woodMat);
        deskTop.position.y = 0.74;
        deskGroup.add(deskTop);

        const edgeTrim = new THREE.Mesh(new THREE.BoxGeometry(2.84, 0.03, 1.44), woodMat);
        edgeTrim.position.y = 0.72;
        deskGroup.add(edgeTrim);

        // Center Kneehole Opening (0.86m wide, 0.68m high)
        // Recessed modesty panel at back of kneehole
        const modestyPanel = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.52, 0.04), woodMat);
        modestyPanel.position.set(0, 0.44, 0.20);
        deskGroup.add(modestyPanel);

        // Center pencil drawer
        const pencilDrawer = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.08, 0.02), darkWoodMat);
        pencilDrawer.position.set(0, 0.66, -0.69);
        deskGroup.add(pencilDrawer);

        const pencilPull = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 8), polishedBrassMat);
        pencilPull.position.set(0, 0.66, -0.71);
        deskGroup.add(pencilPull);

        // Left & Right Pedestals with molded base plinths and 3 stacked drawers
        [-0.96, 0.96].forEach((px) => {
          // Plinth base
          const plinth = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.06, 1.36), woodMat);
          plinth.position.set(px, 0.03, 0);
          deskGroup.add(plinth);

          // Pedestal body
          const pedBody = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.62, 1.30), woodMat);
          pedBody.position.set(px, 0.37, 0);
          deskGroup.add(pedBody);

          // 3 Paneled Drawers facing the desk user (West side, looking East)
          for (let d = 0; d < 3; d++) {
            const dy = 0.16 + d * 0.18;
            const drawerFace = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.15, 0.02), darkWoodMat);
            drawerFace.position.set(px, dy, -0.66);
            deskGroup.add(drawerFace);

            // Brass drop handle pulls
            [-0.20, 0.20].forEach((hx) => {
              const handle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 0.015), polishedBrassMat);
              handle.position.set(px + hx, dy, -0.675);
              deskGroup.add(handle);
            });

            // Keyhole escutcheon on top drawer
            if (d === 2) {
              const escutcheon = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.005, 8), polishedBrassMat);
              escutcheon.position.set(px, dy + 0.04, -0.672);
              escutcheon.rotation.x = Math.PI / 2;
              deskGroup.add(escutcheon);
            }
          }
        });

        // Inlaid vintage leather writing blotter with gold corner tabs
        const blotter = new THREE.Mesh(new THREE.BoxGeometry(1.30, 0.012, 0.75), greenBlotterMat);
        blotter.position.set(0, 0.786, -0.10);
        deskGroup.add(blotter);

        // Gold corner brackets on blotter
        [[-0.64, -0.46], [0.64, -0.46], [-0.64, 0.26], [0.64, 0.26]].forEach(([bx, bz]) => {
          const goldTab = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.014, 0.06), polishedBrassMat);
          goldTab.position.set(bx, 0.787, bz);
          deskGroup.add(goldTab);
        });

        // Authentic brass Banker's Lamp on right side of desk with warm amber glow
        const deskLamp = buildBankersLamp(0.85, 0.78, -0.15, -Math.PI / 2 + 0.2, true);
        deskGroup.add(deskLamp);

        // Modern cup of pens and pencils on side of desk, clear of blotter
        const penCup = buildPenAndPencilCup(-0.90, 0.78, -0.32);
        deskGroup.add(penCup);

        // Stack of vintage leather-bound volumes
        const bookStack = buildBookStack(0.82, 0.78, 0.25, 0.15);
        deskGroup.add(bookStack);

        this.scene.add(deskGroup);

        // Stately Executive Swivel Chair behind the desk
        const execChair = buildExecutiveLeatherChair(-0.6, y0, -3.1, 0);
        this.scene.add(execChair);

        // 2 Library Guest Chairs placed facing the President's desk
        const guestChair1 = buildLibraryChair(-1.3, y0, -0.85, Math.PI, woodMat);
        const guestChair2 = buildLibraryChair(0.1, y0, -0.85, Math.PI, woodMat);
        this.scene.add(guestChair1);
        this.scene.add(guestChair2);

        this.colliders.push(
          { type: 'box', floor: fl, minX: -2.1, maxX: 0.9, minZ: -2.8, maxZ: -1.2, minY: y0, maxY: y0 + 0.85 },
          { type: 'box', floor: fl, minX: -1.0, maxX: -0.2, minZ: -3.4, maxZ: -2.8, minY: y0, maxY: y0 + 1.20 }
        );

      } else {
        // =========================================================================
        // FLOOR 3: HISTORIC ARCHIVES & CURATOR VAULT
        // =========================================================================

        const darkOakMat = mats.mahogany;
        const steelMat = new THREE.MeshLambertMaterial({ color: 0x334155 });
        const chromeMat = new THREE.MeshPhongMaterial({ color: 0xd1d5db, specular: 0xffffff, shininess: 120 });

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

        // 2. Curator Archive Desk with kneehole, drawers, banker's lamp, ledger books, and accessories
        const deskGroup = new THREE.Group();
        deskGroup.position.set(0.6, y0, -2.0);

        const deskTop = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.08, 1.3), darkOakMat);
        deskTop.position.y = 0.76;
        deskGroup.add(deskTop);

        // Modesty panel
        const modesty = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.50, 0.03), darkOakMat);
        modesty.position.set(0, 0.46, -0.25);
        deskGroup.add(modesty);

        // Sturdy legs
        [[-1.1, -0.55], [1.1, -0.55], [-1.1, 0.55], [1.1, 0.55]].forEach(([lx, lz]) => {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.72, 0.10), darkOakMat);
          leg.position.set(lx, 0.36, lz);
          deskGroup.add(leg);
        });

        // Open historic ledger book with marbled edges (centered on working area)
        const ledger = buildOpenBook(-0.15, 0.80, 0.05, 0.08);
        deskGroup.add(ledger);

        // Rolled antique parchment map scroll with red ribbon tie (placed on far left side of desk)
        const scroll = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.65, 12), paperMat);
        scroll.position.set(-0.75, 0.84, -0.25);
        scroll.rotation.x = Math.PI / 2;
        deskGroup.add(scroll);

        const ribbon = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.04, 12), bookRedMat);
        ribbon.position.set(-0.75, 0.84, -0.25);
        ribbon.rotation.x = Math.PI / 2;
        deskGroup.add(ribbon);

        // Authentic brass Banker's Lamp on front-right of desk
        const bLamp = buildBankersLamp(0.75, 0.80, 0.32, Math.PI / 2, true);
        deskGroup.add(bLamp);

        // Modern cup of pens and pencils on rear-right of desk (clear of scroll, lamp, and ledger)
        const penCup = buildPenAndPencilCup(0.75, 0.80, -0.25);
        deskGroup.add(penCup);

        this.scene.add(deskGroup);

        // 3. Stately Wooden Curator Library Chair
        const chair = buildLibraryChair(0.6, y0, -0.9, Math.PI, darkOakMat);
        this.scene.add(chair);

        this.colliders.push(
          { type: 'box', floor: fl, minX: -3.3, maxX: -2.3, minZ: -3.8, maxZ: -0.3, minY: y0, maxY: y0 + 1.35 },
          { type: 'box', floor: fl, minX: -0.7, maxX: 1.9, minZ: -2.8, maxZ: -1.2, minY: y0, maxY: y0 + 0.82 }
        );
      }
    }

    createRealisticMainStacks(fl, y0, mats) {
      if (fl === 0) {
        // Floor 0 Gallery Stacks: Elegant runner rug and central gallery bench
        this.createGalleryRunnerRug(15.0, y0, -9.0, 3.2, 22.0, 0xb47488, 0xc6bc99);
        this.createMuseumBench(15.0, y0, -13.0);
      } else if (fl === 1) {
        // =========================================================================
        // FLOOR 1 (fl = 1): REALISTIC DETAILED LIBRARY BOOKSTACKS & LADDERS
        // =========================================================================
        const rangeZCoords = [-20.0, -15.0, -10.0, -5.0, 0.0];
        const rangeH = 2.80;
        const rangeW = 12.0;
        const rangeD = 0.90;

        const shelfMat = mats.mahogany;
        const brassMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.88, roughness: 0.22 });
        const ladderWoodMat = new THREE.MeshStandardMaterial({ color: 0x3d271d, roughness: 0.55 });

        // Realistic antique leather and cloth bindings (burgundy, forest calfskin, dark navy, saddle brown)
        const bookColors = [0x421b1f, 0x1c3024, 0x1a2636, 0x4d321d, 0x241812, 0x302018, 0x223042, 0x58262b];
        const bookMats = bookColors.map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.65, metalness: 0.08 }));
        const paperPageMat = new THREE.MeshLambertMaterial({ color: 0xf5eedc });

        rangeZCoords.forEach((rz, rIdx) => {
          const rangeGroup = new THREE.Group();
          rangeGroup.position.set(15.0, y0, rz);

          // Center spine divider
          const divider = new THREE.Mesh(new THREE.BoxGeometry(rangeW, rangeH, 0.06), shelfMat);
          divider.position.y = rangeH / 2;
          rangeGroup.add(divider);

          // Both endcaps (East and West) with framed brass Dewey placard
          [-rangeW / 2, rangeW / 2].forEach((ex, eIdx) => {
            const endCap = new THREE.Mesh(new THREE.BoxGeometry(0.10, rangeH + 0.12, rangeD + 0.06), shelfMat);
            endCap.position.set(ex, (rangeH + 0.12) / 2, 0);
            rangeGroup.add(endCap);

            // Framed brass Dewey decimal placard
            const placard = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.18, 0.55), brassMat);
            placard.position.set(ex + (eIdx === 0 ? -0.055 : 0.055), 1.85, 0);
            rangeGroup.add(placard);
          });

          // Molded cornice overhang
          const cornice = new THREE.Mesh(new THREE.BoxGeometry(rangeW + 0.24, 0.16, rangeD + 0.16), shelfMat);
          cornice.position.y = rangeH + 0.08;
          rangeGroup.add(cornice);

          // 5 shelving bays along width
          const numBays = 5;
          const bayW = (rangeW - 0.20) / numBays;
          for (let b = 0; b <= numBays; b++) {
            const bx = -rangeW / 2 + 0.10 + b * bayW;
            const upright = new THREE.Mesh(new THREE.BoxGeometry(0.04, rangeH, rangeD - 0.02), shelfMat);
            upright.position.set(bx, rangeH / 2, 0);
            rangeGroup.add(upright);
          }

          // 5 tiers of horizontal shelves on North (-Z) and South (+Z) sides
          const numTiers = 5;
          const tierH = (rangeH - 0.25) / numTiers;
          for (let t = 0; t < numTiers; t++) {
            const sy = 0.15 + t * tierH;
            [-1, 1].forEach((sideDir) => {
              const shelfBoard = new THREE.Mesh(new THREE.BoxGeometry(rangeW - 0.10, 0.035, (rangeD - 0.10) / 2), shelfMat);
              shelfBoard.position.set(0, sy, sideDir * rangeD / 4);
              rangeGroup.add(shelfBoard);

              // Populate each bay with rows of vintage colorful books
              for (let b = 0; b < numBays; b++) {
                const bayCenterX = -rangeW / 2 + 0.10 + (b + 0.5) * bayW;
                const bookCount = 9;
                for (let k = 0; k < bookCount; k++) {
                  const bkW = 0.035 + (k % 3) * 0.015;
                  const bkH = tierH * 0.72 + (k % 4) * 0.035;
                  const bkD = 0.26 + (k % 2) * 0.03;
                  const bkX = bayCenterX - bayW / 2 + 0.08 + k * (bayW - 0.16) / bookCount;
                  const bkMat = bookMats[(rIdx * 3 + b * 2 + k) % bookMats.length];

                  const book = new THREE.Mesh(new THREE.BoxGeometry(bkW, bkH, bkD), bkMat);

                  // Realistic exposed cream paper pages inside the binding
                  const pages = new THREE.Mesh(new THREE.BoxGeometry(bkW - 0.006, bkH - 0.014, bkD * 0.88), paperPageMat);
                  pages.position.set(0, 0, -sideDir * 0.016);
                  book.add(pages);

                  // Gilded gold foil tooling bands along the spine
                  if (k % 2 === 0) {
                    const goldLine = new THREE.Mesh(new THREE.BoxGeometry(bkW + 0.002, 0.008, 0.012), brassMat);
                    goldLine.position.set(0, bkH * 0.22, sideDir * (bkD / 2 - 0.004));
                    book.add(goldLine);
                  }

                  if (k === bookCount - 1 && b % 2 === 0) {
                    book.rotation.z = -0.16;
                    book.position.set(bkX + 0.02, sy + 0.02 + bkH / 2, sideDir * (rangeD / 4));
                  } else {
                    book.position.set(bkX, sy + 0.02 + bkH / 2, sideDir * (rangeD / 4));
                  }
                  rangeGroup.add(book);
                }
              }
            });
          }

          // Brass tracking rail along top of South side (+Z) at y = 2.65, z = 0.49
          const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, rangeW, 12), brassMat);
          rail.rotation.z = Math.PI / 2;
          rail.position.set(0, rangeH - 0.15, rangeD / 2 + 0.04);
          rangeGroup.add(rail);

          // Rolling wooden library ladder mounted firmly on tracking rail and grounded on floor
          const ladX = rIdx % 2 === 0 ? -2.8 : 2.8;
          const ladGroup = new THREE.Group();
          // Anchored on floor tiles at z = 1.01, angled back 11 degrees (-0.194 rad) to meet rail at z = 0.49, y = 2.65
          ladGroup.position.set(ladX, 0, rangeD / 2 + 0.56);
          ladGroup.rotation.x = -0.194;

          const ladderLength = 2.72;
          [-0.22, 0.22].forEach((lx) => {
            const stilt = new THREE.Mesh(new THREE.BoxGeometry(0.045, ladderLength, 0.06), ladderWoodMat);
            stilt.position.set(lx, ladderLength / 2, 0);
            ladGroup.add(stilt);

            // Hook curved over tracking rail
            const hook = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.012, 8, 14, Math.PI * 1.2), brassMat);
            hook.rotation.y = Math.PI / 2;
            hook.position.set(lx, ladderLength - 0.02, -0.02);
            ladGroup.add(hook);

            // Rolling brass wheel assembly resting flat on floor tiles
            const wheelBracket = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.05, 0.04), brassMat);
            wheelBracket.position.set(lx, 0.05, 0);
            ladGroup.add(wheelBracket);

            const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.025, 12), brassMat);
            wheel.rotation.z = Math.PI / 2;
            wheel.position.set(lx, 0.035, 0);
            ladGroup.add(wheel);
          });

          for (let r = 1; r < 9; r++) {
            const rung = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.40, 8), ladderWoodMat);
            rung.rotation.z = Math.PI / 2;
            rung.position.set(0, r * (ladderLength / 9.5) + 0.10, 0);
            ladGroup.add(rung);
          }
          rangeGroup.add(ladGroup);

          this.scene.add(rangeGroup);

          this.colliders.push({
            type: 'box',
            floor: 1,
            minX: 15.0 - rangeW / 2 - 0.10,
            maxX: 15.0 + rangeW / 2 + 0.10,
            minZ: rz - rangeD / 2 - 0.08,
            maxZ: rz + rangeD / 2 + 0.08,
            minY: y0,
            maxY: y0 + rangeH + 0.10
          });
        });

        // 2 Library Book Carts / Trolleys with stacked books at aisle ends
        [[-17.5, 8.2], [-7.5, 21.8]].forEach(([cz, cx]) => {
          const cartGroup = new THREE.Group();
          cartGroup.position.set(cx, y0, cz);

          const cartBase = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.05, 0.55), shelfMat);
          cartBase.position.y = 0.12;
          cartGroup.add(cartBase);

          const cartMid = new THREE.Mesh(new THREE.BoxGeometry(0.90, 0.035, 0.50), shelfMat);
          cartMid.position.y = 0.47;
          cartGroup.add(cartMid);

          const cartTop = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.04, 0.55), shelfMat);
          cartTop.position.y = 0.82;
          cartGroup.add(cartTop);

          // 4 Solid vertical tubular steel/brass corner uprights connecting all 3 shelves
          [[-0.44, -0.23], [0.44, -0.23], [-0.44, 0.23], [0.44, 0.23]].forEach(([lx, lz]) => {
            const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.74, 10), brassMat);
            leg.position.set(lx, 0.47, lz);
            cartGroup.add(leg);
          });

          // Tubular handle uprights rising from the left corner legs up to the push bar
          [-0.23, 0.23].forEach((hz) => {
            const handleRiser = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.14, 10), brassMat);
            handleRiser.position.set(-0.47, 0.89, hz);
            cartGroup.add(handleRiser);

            const cornerJoint = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 8), brassMat);
            cornerJoint.position.set(-0.47, 0.96, hz);
            cartGroup.add(cornerJoint);
          });

          // Push handle bar firmly welded between the handle uprights (zero floating!)
          const hBar = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.46, 10), brassMat);
          hBar.rotation.x = Math.PI / 2;
          hBar.position.set(-0.47, 0.96, 0);
          cartGroup.add(hBar);

          // 4 Industrial swivel casters on cart base
          [[-0.38, -0.22], [0.38, -0.22], [-0.38, 0.22], [0.38, 0.22]].forEach(([wx, wz]) => {
            const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 12), brassMat);
            wh.rotation.z = Math.PI / 2;
            wh.position.set(wx, 0.05, wz);
            cartGroup.add(wh);
          });

          // Realistic stacks of vintage leather-bound volumes with gilded spine bands on middle shelf
          [-0.26, 0.08].forEach((bx, bi) => {
            const bStackGroup = new THREE.Group();
            bStackGroup.position.set(bx, 0.49, 0);

            for (let v = 0; v < 4; v++) {
              const vy = v * 0.045;
              const vMat = bookMats[(bi * 3 + v) % bookMats.length];
              const volMesh = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.042, 0.34), vMat);
              volMesh.position.y = vy + 0.021;
              if (v === 3) volMesh.rotation.y = 0.06;
              bStackGroup.add(volMesh);

              // Exposed cream pages
              const vPages = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.034, 0.32), paperPageMat);
              vPages.position.set(0.008, vy + 0.021, 0);
              bStackGroup.add(vPages);

              // Gilded spine line
              const vGold = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.006, 0.342), brassMat);
              vGold.position.set(-0.118, vy + 0.021, 0);
              bStackGroup.add(vGold);
            }
            cartGroup.add(bStackGroup);
          });

          this.scene.add(cartGroup);

          this.colliders.push({
            type: 'box',
            floor: 1,
            minX: cx - 0.55,
            maxX: cx + 0.55,
            minZ: cz - 0.35,
            maxZ: cz + 0.35,
            minY: y0,
            maxY: y0 + 0.92
          });
        });
      } else if (fl === 2) {
        // Floor 2 Stacks: Soft seafoam runner rug and central gallery bench
        this.createGalleryRunnerRug(15.0, y0, -9.0, 3.2, 22.0, 0x53aa93, 0xc6bc99);
        this.createMuseumBench(15.0, y0, -13.0);
      } else {
        // =========================================================================
        // FLOOR 3 (fl = 3): THE MILK CRATE CHALLENGE & HALF-LIFE 2 PROP PHYSICS
        // =========================================================================
        this.spawnMilkCrates(y0);
      }
    }

    spawnMilkCrates(y0) {
      this.physicsCrates = [];
      this.aquariumFish = [];
      const crateW = 0.38;
      const crateH = 0.31;
      const crateD = 0.38;

      // Mix of authentic colors: black, brown, maroon, and navy blue
      const palette = [0x18181b, 0x4a2c16, 0x6b1d24, 0x1a2b42];
      let crateCounter = 0;

      const addSingleCrate = (cx, cy, cz, tier = 1) => {
        const colorHex = palette[crateCounter % palette.length];
        crateCounter++;

        const mesh = this.buildMilkCrateMesh(colorHex, crateW, crateH, crateD);
        mesh.position.set(cx, cy + crateH / 2, cz);
        this.scene.add(mesh);

        const col = {
          type: 'box',
          floor: 3,
          minX: cx - crateW / 2,
          maxX: cx + crateW / 2,
          minZ: cz - crateD / 2,
          maxZ: cz + crateD / 2,
          minY: cy,
          maxY: cy + crateH
        };
        this.colliders.push(col);

        const crateEntry = {
          id: crateCounter,
          mesh: mesh,
          w: crateW,
          h: crateH,
          d: crateD,
          colorHex: colorHex,
          tier: tier,
          x: cx,
          y: cy,
          z: cz,
          baseY: cy,
          vx: 0,
          vy: 0,
          vz: 0,
          rotX: 0,
          rotY: 0,
          rotZ: 0,
          angVx: 0,
          angVy: 0,
          angVz: 0,
          isHeld: false,
          isCollapsed: false,
          collider: col,
          supportedCrates: []
        };
        this.physicsCrates.push(crateEntry);
        return crateEntry;
      };

      // 1. Build the Iconic Milk Crate Challenge Stepped Pyramid at x = 15.0 along Z (-17.5 to -7.5)
      // Stepped pyramid: [1, 2, 3, 4, 5, 4, 3, 2, 1] matching authentic viral challenge reference
      const heights = [1, 2, 3, 4, 5, 4, 3, 2, 1];
      const spacingZ = 0.40;
      const startZ = -12.5 - (4 * spacingZ); // Peak (height 5) at z = -12.5

      for (let col = 0; col < heights.length; col++) {
        const cz = startZ + col * spacingZ;
        const cx = 15.0;
        const hCount = heights[col];
        let lowerCrate = null;
        for (let t = 0; t < hCount; t++) {
          const cy = y0 + t * crateH;
          const crateObj = addSingleCrate(cx, cy, cz, t + 1);
          if (lowerCrate) {
            lowerCrate.supportedCrates.push(crateObj);
          }
          lowerCrate = crateObj;
        }
      }

      // 2. Extra Stacks and Towers for Fun
      // 4-crate vertical stack at (19.0, y0, -6.0)
      let prevCrate = null;
      for (let t = 0; t < 4; t++) {
        const cy = y0 + t * crateH;
        const c = addSingleCrate(19.0, cy, -6.0, t + 1);
        if (prevCrate) prevCrate.supportedCrates.push(c);
        prevCrate = c;
      }

      // 3-crate stack at (11.0, y0, -11.0)
      prevCrate = null;
      for (let t = 0; t < 3; t++) {
        const cy = y0 + t * crateH;
        const c = addSingleCrate(11.0, cy, -11.0, t + 1);
        if (prevCrate) prevCrate.supportedCrates.push(c);
        prevCrate = c;
      }

      // 3. Loose Scattered Crates on the floor (ready for player to pick up, carry with E, and place/throw)
      const looseCoords = [
        [12.0, -3.0],
        [18.0, -16.0],
        [15.0, 0.0],
        [13.2, -14.0],
        [16.8, -8.0],
        [10.5, -5.0],
        [19.5, -2.0]
      ];
      looseCoords.forEach(([lx, lz]) => {
        addSingleCrate(lx, y0, lz, 1);
      });
    }

    buildMilkCrateMesh(colorHex, w = 0.38, h = 0.31, d = 0.38) {
      const group = new THREE.Group();
      const plasticMat = new THREE.MeshStandardMaterial({
        color: colorHex,
        roughness: 0.38,
        metalness: 0.08
      });

      // 4 Heavy-duty corner posts (span exact crate height -h/2..h/2)
      const postW = 0.038;
      const cornerOffsets = [
        [-w / 2 + postW / 2, -d / 2 + postW / 2],
        [w / 2 - postW / 2, -d / 2 + postW / 2],
        [-w / 2 + postW / 2, d / 2 - postW / 2],
        [w / 2 - postW / 2, d / 2 - postW / 2]
      ];
      cornerOffsets.forEach(([ox, oz]) => {
        const post = new THREE.Mesh(new THREE.BoxGeometry(postW, h, postW), plasticMat);
        post.position.set(ox, 0, oz);
        group.add(post);
      });

      // Top reinforced perimeter rim
      const rimH = 0.038;
      const rimThick = 0.032;
      [-d / 2 + rimThick / 2, d / 2 - rimThick / 2].forEach((rz) => {
        const rimBar = new THREE.Mesh(new THREE.BoxGeometry(w, rimH, rimThick), plasticMat);
        rimBar.position.set(0, h / 2 - rimH / 2, rz);
        group.add(rimBar);
      });
      [-w / 2 + rimThick / 2, w / 2 - rimThick / 2].forEach((rx) => {
        const rimBar = new THREE.Mesh(new THREE.BoxGeometry(rimThick, rimH, d - rimThick * 2), plasticMat);
        rimBar.position.set(rx, h / 2 - rimH / 2, 0);
        group.add(rimBar);
      });

      // Bottom perimeter base frame (rests exactly at y = -h/2, zero ground penetration)
      const botH = 0.034;
      [-d / 2 + rimThick / 2, d / 2 - rimThick / 2].forEach((rz) => {
        const bBar = new THREE.Mesh(new THREE.BoxGeometry(w, botH, rimThick), plasticMat);
        bBar.position.set(0, -h / 2 + botH / 2, rz);
        group.add(bBar);
      });
      [-w / 2 + rimThick / 2, w / 2 - rimThick / 2].forEach((rx) => {
        const bBar = new THREE.Mesh(new THREE.BoxGeometry(rimThick, botH, d - rimThick * 2), plasticMat);
        bBar.position.set(rx, -h / 2 + botH / 2, 0);
        group.add(bBar);
      });

      // Molded bottom honeycomb grid plate (resting flat inside the base rim)
      const botPlate = new THREE.Mesh(new THREE.BoxGeometry(w - 0.04, 0.016, d - 0.04), plasticMat);
      botPlate.position.set(0, -h / 2 + 0.018, 0);
      group.add(botPlate);

      // Molded side walls with handle openings and structural lattice grid
      // North & South walls (Z = ±(d/2 - 0.012))
      [-d / 2 + 0.012, d / 2 - 0.012].forEach((sz) => {
        // Lower solid molded panel
        const lowPanel = new THREE.Mesh(new THREE.BoxGeometry(w - 0.06, 0.055, 0.014), plasticMat);
        lowPanel.position.set(0, -h / 2 + botH + 0.0275, sz);
        group.add(lowPanel);

        // Molded center handle cutout frame (width: 0.16m, height: 0.05m)
        const leftHandleJamb = new THREE.Mesh(new THREE.BoxGeometry((w - 0.06 - 0.16) / 2, 0.052, 0.014), plasticMat);
        leftHandleJamb.position.set(-(w - 0.06 + 0.16) / 4, h / 2 - rimH - 0.032, sz);
        group.add(leftHandleJamb);

        const rightHandleJamb = new THREE.Mesh(new THREE.BoxGeometry((w - 0.06 - 0.16) / 2, 0.052, 0.014), plasticMat);
        rightHandleJamb.position.set((w - 0.06 + 0.16) / 4, h / 2 - rimH - 0.032, sz);
        group.add(rightHandleJamb);

        // Smooth rounded cylindrical handle grip bar along top of handle opening
        const gripBar = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.010, 0.155, 12), plasticMat);
        gripBar.rotation.z = Math.PI / 2;
        gripBar.position.set(0, h / 2 - rimH - 0.010, sz);
        group.add(gripBar);

        // 3 Horizontal molded lattice ribs
        for (let r = 0; r < 3; r++) {
          const ry = -h / 2 + 0.10 + r * 0.042;
          const rib = new THREE.Mesh(new THREE.BoxGeometry(w - 0.06, 0.012, 0.014), plasticMat);
          rib.position.set(0, ry, sz);
          group.add(rib);
        }

        // 5 Vertical molded lattice ribs
        for (let c = -2; c <= 2; c++) {
          const vx = c * 0.058;
          const vRib = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.125, 0.014), plasticMat);
          vRib.position.set(vx, -0.015, sz);
          group.add(vRib);
        }
      });

      // East & West walls (X = ±(w/2 - 0.012))
      [-w / 2 + 0.012, w / 2 - 0.012].forEach((sx) => {
        // Lower solid molded panel
        const lowPanel = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.055, d - 0.06), plasticMat);
        lowPanel.position.set(sx, -h / 2 + botH + 0.0275, 0);
        group.add(lowPanel);

        // Molded center handle cutout frame
        const leftHandleJamb = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.052, (d - 0.06 - 0.16) / 2), plasticMat);
        leftHandleJamb.position.set(sx, h / 2 - rimH - 0.032, -(d - 0.06 + 0.16) / 4);
        group.add(leftHandleJamb);

        const rightHandleJamb = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.052, (d - 0.06 - 0.16) / 2), plasticMat);
        rightHandleJamb.position.set(sx, h / 2 - rimH - 0.032, (d - 0.06 + 0.16) / 4);
        group.add(rightHandleJamb);

        // Smooth rounded cylindrical handle grip bar
        const gripBar = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.010, 0.155, 12), plasticMat);
        gripBar.rotation.x = Math.PI / 2;
        gripBar.position.set(sx, h / 2 - rimH - 0.010, 0);
        group.add(gripBar);

        // 3 Horizontal molded lattice ribs
        for (let r = 0; r < 3; r++) {
          const ry = -h / 2 + 0.10 + r * 0.042;
          const rib = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.012, d - 0.06), plasticMat);
          rib.position.set(sx, ry, 0);
          group.add(rib);
        }

        // 5 Vertical molded lattice ribs
        for (let c = -2; c <= 2; c++) {
          const vz = c * 0.058;
          const vRib = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.125, 0.012), plasticMat);
          vRib.position.set(sx, -0.015, vz);
          group.add(vRib);
        }
      });

      return group;
    }

    tryPickupCrate() {
      if (this.playerFloor !== 3 || !this.physicsCrates || this.physicsCrates.length === 0) return false;
      const cosPitch = Math.cos(this.playerPitch);
      const sinPitch = Math.sin(this.playerPitch);
      const cosYaw = Math.cos(this.playerYaw);
      const sinYaw = Math.sin(this.playerYaw);

      const fwd = new THREE.Vector3(-sinYaw * cosPitch, sinPitch, -cosYaw * cosPitch);
      const camPos = this.camera.position;

      let bestCrate = null;
      let bestDist = 2.85;

      for (let i = 0; i < this.physicsCrates.length; i++) {
        const crate = this.physicsCrates[i];
        if (crate.isHeld) continue;

        const toCrate = new THREE.Vector3(crate.x - camPos.x, (crate.y + crate.h / 2) - camPos.y, crate.z - camPos.z);
        const dist = toCrate.length();
        if (dist > bestDist) continue;

        toCrate.normalize();
        const dot = toCrate.dot(fwd);
        if (dot > 0.78) {
          bestCrate = crate;
          bestDist = dist;
        }
      }

      if (bestCrate) {
        this.heldCrate = bestCrate;
        bestCrate.isHeld = true;
        bestCrate.isCollapsed = true;
        // Keep collider completely disabled while held to prevent shoving or launching the player!
        bestCrate.collider.disabled = true;
        bestCrate.collider.minX = 0;
        bestCrate.collider.maxX = 0;
        bestCrate.collider.minZ = 0;
        bestCrate.collider.maxZ = 0;
        bestCrate.collider.minY = -999;
        bestCrate.collider.maxY = -999;

        if (bestCrate.supportedCrates && bestCrate.supportedCrates.length > 0) {
          bestCrate.supportedCrates.forEach(child => {
            this.triggerCrateStackCollapse(child);
          });
          bestCrate.supportedCrates = [];
        }

        this.audio.playCratePickup();
        return true;
      }
      return false;
    }

    dropHeldCrate() {
      if (!this.heldCrate) return;
      const crate = this.heldCrate;
      const y0 = 3 * CONFIG.FLOOR_HEIGHT;
      const cosPitch = Math.cos(this.playerPitch);
      const sinPitch = Math.sin(this.playerPitch);
      const cosYaw = Math.cos(this.playerYaw);
      const sinYaw = Math.sin(this.playerYaw);
      const fwd = new THREE.Vector3(-sinYaw * cosPitch, sinPitch, -cosYaw * cosPitch);

      crate.isHeld = false;
      crate.collider.disabled = false;
      crate.isCollapsed = true;

      // Half-Life 2 style gentle release forward with slight player momentum
      crate.vx = fwd.x * 1.5;
      crate.vy = Math.max(-0.5, fwd.y * 1.5);
      crate.vz = fwd.z * 1.5;
      crate.angVx = (Math.random() - 0.5) * 1.5;
      crate.angVy = (Math.random() - 0.5) * 1.5;
      crate.angVz = (Math.random() - 0.5) * 1.5;

      this.heldCrate = null;
      this.audio.playCrateImpact();
    }

    throwHeldCrate() {
      if (!this.heldCrate) return;
      const crate = this.heldCrate;
      const y0 = 3 * CONFIG.FLOOR_HEIGHT;
      const ceilY = y0 + CONFIG.FLOOR_HEIGHT - 0.12;
      const cosPitch = Math.cos(this.playerPitch);
      const sinPitch = Math.sin(this.playerPitch);
      const cosYaw = Math.cos(this.playerYaw);
      const sinYaw = Math.sin(this.playerYaw);
      const fwd = new THREE.Vector3(-sinYaw * cosPitch, sinPitch, -cosYaw * cosPitch);

      crate.isHeld = false;
      crate.collider.disabled = false;
      crate.isCollapsed = true;

      // Safe clamp below ceiling before launching
      crate.y = Math.min(crate.y, ceilY - crate.h - 0.08);

      // Half-Life 2 style punchy throw impulse
      crate.vx = fwd.x * 11.0;
      crate.vy = fwd.y * 11.0 + 1.0;
      crate.vz = fwd.z * 11.0;
      crate.angVx = (Math.random() - 0.5) * 6.0;
      crate.angVz = (Math.random() - 0.5) * 6.0;
      crate.angVy = (Math.random() - 0.5) * 4.0;

      this.heldCrate = null;
      this.audio.playCrateImpact();
    }
    triggerCrateStackCollapse(baseCrate) {
      if (!baseCrate || baseCrate.isCollapsed) return;
      baseCrate.isCollapsed = true;
      baseCrate.vx += (Math.random() - 0.5) * 4.2;
      baseCrate.vz += (Math.random() - 0.5) * 4.2;
      baseCrate.vy += 0.8 + Math.random() * 0.5;
      baseCrate.angVx = (Math.random() - 0.5) * 12.0;
      baseCrate.angVz = (Math.random() - 0.5) * 12.0;

      if (baseCrate.supportedCrates && baseCrate.supportedCrates.length > 0) {
        baseCrate.supportedCrates.forEach(child => {
          this.triggerCrateStackCollapse(child);
        });
        baseCrate.supportedCrates = [];
      }

      this.audio.playCrateImpact();
    }

    updatePhysicsCrates(delta) {
      if (this.playerFloor !== 3 || !this.physicsCrates || this.physicsCrates.length === 0) return;

      const y0 = 3 * CONFIG.FLOOR_HEIGHT; // Floor 3 elevation (15.60m)
      const cosPitch = Math.cos(this.playerPitch);
      const sinPitch = Math.sin(this.playerPitch);
      const cosYaw = Math.cos(this.playerYaw);
      const sinYaw = Math.sin(this.playerYaw);
      const fwd = new THREE.Vector3(-sinYaw * cosPitch, sinPitch, -cosYaw * cosPitch);

      // Handle held crate position and viewmodel
      if (this.heldCrate) {
        const hc = this.heldCrate;
        const targetX = this.camera.position.x + fwd.x * 1.45;
        const targetY = this.camera.position.y + fwd.y * 1.45 - 0.22;
        const targetZ = this.camera.position.z + fwd.z * 1.45;

        // Keep held crate clamped safely within room boundaries
        const clampedX = Math.max(6.5, Math.min(23.5, targetX));
        const clampedZ = Math.max(-23.5, Math.min(3.5, targetZ));
        const clampedY = Math.max(y0 + 0.1, Math.min(y0 + CONFIG.FLOOR_HEIGHT - 0.5, targetY));

        hc.x = THREE.MathUtils.lerp(hc.x, clampedX, Math.min(1, delta * 22));
        hc.y = THREE.MathUtils.lerp(hc.y, clampedY, Math.min(1, delta * 22));
        hc.z = THREE.MathUtils.lerp(hc.z, clampedZ, Math.min(1, delta * 22));
        hc.rotY = THREE.MathUtils.lerp(hc.rotY, this.playerYaw, Math.min(1, delta * 16));
        hc.rotX = THREE.MathUtils.lerp(hc.rotX, 0, Math.min(1, delta * 16));
        hc.rotZ = THREE.MathUtils.lerp(hc.rotZ, 0, Math.min(1, delta * 16));

        hc.mesh.position.set(hc.x, hc.y + hc.h / 2, hc.z);
        hc.mesh.rotation.set(hc.rotX, hc.rotY, hc.rotZ);

        // Keep collider completely disabled while held to prevent shoving or launching the player!
        hc.collider.disabled = true;
        hc.collider.minX = 0;
        hc.collider.maxX = 0;
        hc.collider.minZ = 0;
        hc.collider.maxZ = 0;
        hc.collider.minY = -999;
        hc.collider.maxY = -999;
      }

      // Check if player is standing on any crate in the stacks
      let standingCrate = null;
      if (this.isGrounded) {
        const footY = (this.playerPos.y - this.currentCamHeight) + this.jumpOffset;
        for (let i = 0; i < this.physicsCrates.length; i++) {
          const crate = this.physicsCrates[i];
          if (crate.isHeld || crate.isCollapsed) continue;
          if (Math.abs(this.playerPos.x - crate.x) <= crate.w / 2 + 0.08 &&
              Math.abs(this.playerPos.z - crate.z) <= crate.d / 2 + 0.08 &&
              Math.abs(footY - (crate.y + crate.h)) < 0.35) {
            standingCrate = crate;
            break;
          }
        }
      }

      if (standingCrate) {
        const offX = this.playerPos.x - standingCrate.x;
        const offZ = this.playerPos.z - standingCrate.z;
        const leverage = Math.max(1, standingCrate.tier) * 0.95;

        standingCrate.angVz -= (offX / 0.19) * 14.0 * leverage * delta;
        standingCrate.angVx += (offZ / 0.19) * 14.0 * leverage * delta;

        const isMoving = this.playerVelocity.lengthSq() > 0.01;
        if (isMoving) {
          standingCrate.angVx += (Math.random() - 0.5) * 8.0 * delta;
          standingCrate.angVz += (Math.random() - 0.5) * 8.0 * delta;
          if (Math.random() < 0.035) this.audio.playCrateCreak();
        }

        const totalTilt = Math.hypot(standingCrate.rotX, standingCrate.rotZ);
        if (totalTilt > 0.28 || Math.hypot(standingCrate.angVx, standingCrate.angVz) > 4.8) {
          this.triggerCrateStackCollapse(standingCrate);
          this.isGrounded = false;
          this.fallVelocity = 0;
          this.isFalling = true;
        }
      }

      const ceilY = y0 + CONFIG.FLOOR_HEIGHT - 0.12;

      // Update all non-held crates
      for (let i = 0; i < this.physicsCrates.length; i++) {
        const c = this.physicsCrates[i];
        if (c.isHeld) continue;

        if (c.isCollapsed) {
          c.vy -= 14.0 * delta;
          c.x += c.vx * delta;
          c.y += c.vy * delta;
          c.z += c.vz * delta;

          c.rotX += c.angVx * delta;
          c.rotY += c.angVy * delta;
          c.rotZ += c.angVz * delta;

          // CEILING COLLISION: Bounces downward, NEVER noclipping through ceilings into upper floors
          if (c.y + c.h >= ceilY) {
            c.y = ceilY - c.h;
            c.vy = -Math.abs(c.vy) * 0.40;
            c.angVx += (Math.random() - 0.5) * 8.0;
            c.angVz += (Math.random() - 0.5) * 8.0;
            if (Math.abs(c.vy) > 0.6) this.audio.playCrateImpact();
          }
          if (c.y + c.h > ceilY) c.y = ceilY - c.h;

          // Oriented bounding drop prevents any corner/edge of tilted or rolling crate from penetrating the floor
          const drop = (c.h / 2) * Math.abs(Math.cos(c.rotX) * Math.cos(c.rotZ)) +
                       (c.d / 2) * Math.abs(Math.sin(c.rotX)) +
                       (c.w / 2) * Math.abs(Math.sin(c.rotZ));
          const groundY = y0 + drop - c.h / 2;

          // STACKING & LANDING: Check if landing on top of any resting crate
          let landingY = groundY;
          let landedCrate = null;
          for (let j = 0; j < this.physicsCrates.length; j++) {
            const other = this.physicsCrates[j];
            if (other === c || other.isHeld) continue;
            if (Math.abs(c.x - other.x) < c.w * 0.75 && Math.abs(c.z - other.z) < c.d * 0.75) {
              const topY = other.y + other.h;
              if (c.y >= topY - 0.22 && topY > landingY) {
                landingY = topY;
                landedCrate = other;
              }
            }
          }

          if (c.y <= landingY) {
            c.y = landingY;
            if (Math.abs(c.vy) > 0.5) {
              c.vy = -c.vy * 0.25;
              c.vx *= 0.70;
              c.vz *= 0.70;
              c.angVx *= 0.60;
              c.angVz *= 0.60;
              this.audio.playCrateImpact();
            } else {
              c.vy = 0;
              c.vx *= Math.max(0, 1 - delta * 8.0);
              c.vz *= Math.max(0, 1 - delta * 8.0);
              c.angVx *= Math.max(0, 1 - delta * 8.0);
              c.angVy *= Math.max(0, 1 - delta * 8.0);
              c.angVz *= Math.max(0, 1 - delta * 8.0);
              if (Math.abs(c.vx) < 0.02) c.vx = 0;
              if (Math.abs(c.vz) < 0.02) c.vz = 0;
              // Settle resting angle smoothly toward flat
              c.rotX = THREE.MathUtils.lerp(c.rotX, 0, Math.min(1, delta * 6.0));
              c.rotZ = THREE.MathUtils.lerp(c.rotZ, 0, Math.min(1, delta * 6.0));
            }
          }

          if (c.x < 6.2) { c.x = 6.2; c.vx = Math.abs(c.vx) * 0.5; }
          if (c.x > 23.8) { c.x = 23.8; c.vx = -Math.abs(c.vx) * 0.5; }
          if (c.z < -23.8) { c.z = -23.8; c.vz = Math.abs(c.vz) * 0.5; }
          if (c.z > 3.8) { c.z = 3.8; c.vz = -Math.abs(c.vz) * 0.5; }
        } else {
          // Stable resting in stack or on floor: spring restore minor tilts from stepping
          c.y = c.baseY;
          c.angVx += (-c.rotX * 32.0 - c.angVx * 9.0) * delta;
          c.angVz += (-c.rotZ * 32.0 - c.angVz * 9.0) * delta;
          c.rotX += c.angVx * delta;
          c.rotZ += c.angVz * delta;
        }

        c.mesh.position.set(c.x, c.y + c.h / 2, c.z);
        c.mesh.rotation.set(c.rotX, c.rotY, c.rotZ);

        c.collider.disabled = false;
        c.collider.minX = c.x - c.w / 2;
        c.collider.maxX = c.x + c.w / 2;
        c.collider.minZ = c.z - c.d / 2;
        c.collider.maxZ = c.z + c.d / 2;
        c.collider.minY = c.y;
        c.collider.maxY = c.isCollapsed ? (c.y + 0.16) : (c.y + c.h);
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
        radius: 1.6,
        minY: y,
        maxY: y + 1.15
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

      // Solid physical obstacle collider for the bench across its floor (height: 0.65m)
      const fl = Math.round(y / CONFIG.FLOOR_HEIGHT);
      this.colliders.push({
        type: 'box',
        floor: fl,
        minX: x - 1.54,
        maxX: x + 1.54,
        minZ: z - 0.54,
        maxZ: z + 0.54,
        minY: y,
        maxY: y + 0.65
      });
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
        maxZ: z + d / 2,
        minY: y,
        maxY: y + h
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
        maxZ: z + 0.65,
        minY: y,
        maxY: y + 1.15
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
        maxZ: z + d / 2,
        minY: y,
        maxY: y + h
      });
    }

    // =========================================================================
    // BEAUTY PASS & COMPREHENSIVE PROCEDURAL EXHIBIT BUILDERS
    // =========================================================================

    createGalleryRunnerRug(x, y0, z, w, d, mainColorHex = 0xb47488, borderGoldHex = 0xc6bc99) {
      const rugGroup = new THREE.Group();
      rugGroup.position.set(x, y0 + 0.006, z);

      const carpetMat = new THREE.MeshStandardMaterial({
        color: mainColorHex,
        roughness: 0.88,
        metalness: 0.02
      });
      const goldBorderMat = new THREE.MeshStandardMaterial({
        color: borderGoldHex,
        roughness: 0.55,
        metalness: 0.35
      });
      const fringeMat = new THREE.MeshStandardMaterial({
        color: 0xfef08a,
        roughness: 0.95
      });

      // Main woven textile field
      const field = new THREE.Mesh(new THREE.BoxGeometry(w, 0.005, d), carpetMat);
      rugGroup.add(field);

      // Gold ornamental border frame (4 border strips inset 8cm from edge)
      const bThick = 0.06;
      [-d / 2 + 0.10, d / 2 - 0.10].forEach(bz => {
        const bStrip = new THREE.Mesh(new THREE.BoxGeometry(w - 0.16, 0.006, bThick), goldBorderMat);
        bStrip.position.set(0, 0.001, bz);
        rugGroup.add(bStrip);
      });
      [-w / 2 + 0.10, w / 2 - 0.10].forEach(bx => {
        const bStrip = new THREE.Mesh(new THREE.BoxGeometry(bThick, 0.006, d - 0.20), goldBorderMat);
        bStrip.position.set(bx, 0.001, 0);
        rugGroup.add(bStrip);
      });

      // Decorative end fringes at both short ends
      [-d / 2, d / 2].forEach(fz => {
        const fringe = new THREE.Mesh(new THREE.BoxGeometry(w + 0.04, 0.004, 0.04), fringeMat);
        fringe.position.set(0, 0, fz);
        rugGroup.add(fringe);
      });

      this.scene.add(rugGroup);
    }

    createPottedMuseumPlant(x, y0, z, fl) {
      const plantGroup = new THREE.Group();
      plantGroup.position.set(x, y0, z);

      const potMat = new THREE.MeshStandardMaterial({ color: fl === 0 ? 0xb4533c : 0x27272a, roughness: 0.65 });
      const soilMat = new THREE.MeshStandardMaterial({ color: 0x1c1917, roughness: 0.98 });
      const frondMat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.45, side: THREE.DoubleSide });

      // Sleek fluted terracotta/charcoal ceramic planter
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.18, 0.48, 12), potMat);
      pot.position.y = 0.24;
      plantGroup.add(pot);

      const potRim = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.24, 0.05, 12), potMat);
      potRim.position.y = 0.48;
      plantGroup.add(potRim);

      const soil = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.02, 12), soilMat);
      soil.position.y = 0.47;
      plantGroup.add(soil);

      // 5 Compact stylized palm fronds
      for (let f = 0; f < 5; f++) {
        const ang = (f * Math.PI * 2) / 5;
        const frond = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.55, 0.015), frondMat);
        frond.position.set(Math.cos(ang) * 0.14, 0.68, Math.sin(ang) * 0.14);
        frond.rotation.y = -ang;
        frond.rotation.x = 0.45;
        plantGroup.add(frond);
      }

      this.scene.add(plantGroup);

      this.colliders.push({
        type: 'cylinder',
        floor: fl,
        x: x,
        z: z,
        radius: 0.32,
        minY: y0,
        maxY: y0 + 0.55
      });
    }

    createAquariumTank(x, y0, z, fl, rotY = 0) {
      const group = new THREE.Group();
      group.position.set(x, y0, z);
      group.rotation.y = rotY;

      // Realistic materials
      const cabinetMat = new THREE.MeshStandardMaterial({ color: 0x1f2328, roughness: 0.35, metalness: 0.10 });
      const gravelMat = new THREE.MeshStandardMaterial({ color: 0xd6c4b2, roughness: 0.92 });
      const rockMat = new THREE.MeshStandardMaterial({ color: 0x52525b, roughness: 0.85 });
      const seaGrassMat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.45, side: THREE.DoubleSide });

      // Ultra-clear glass panels (index of refraction ~1.5)
      const tankGlassMat = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.16,
        roughness: 0.02,
        metalness: 0.05,
        transmission: 0.98,
              });

      // Shimmering clear aquatic water volume
      const waterMat = new THREE.MeshPhysicalMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.22,
        roughness: 0.05,
        transmission: 0.94,
              });

      // 1. Sleek museum gallery stand
      const stand = new THREE.Mesh(new THREE.BoxGeometry(1.60, 0.72, 0.75), cabinetMat);
      stand.position.y = 0.36;
      group.add(stand);

      // 2. Clear glass tank (1.54m wide x 0.70m high x 0.70m deep)
      const glassTank = new THREE.Mesh(new THREE.BoxGeometry(1.54, 0.70, 0.70), tankGlassMat);
      glassTank.position.y = 0.72 + 0.35;
      group.add(glassTank);

      // 3. Sandy bottom substrate bed
      const sand = new THREE.Mesh(new THREE.BoxGeometry(1.50, 0.08, 0.66), gravelMat);
      sand.position.y = 0.72 + 0.04;
      group.add(sand);

      // 4. Natural river pebbles and stones
      [[-0.45, -0.12, 0.09], [0.42, 0.15, 0.10], [-0.08, 0.05, 0.07], [0.12, -0.18, 0.06]].forEach(([rx, rz, rad]) => {
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(rad, 1), rockMat);
        rock.position.set(rx, 0.76 + rad * 0.7, rz);
        group.add(rock);
      });

      // 5. Living sea plants / swaying kelp fronds
      const kelpBlades = [];
      [-0.52, -0.28, 0.22, 0.50].forEach((kx, ki) => {
        const h = 0.42 + (ki % 2) * 0.12;
        const blade = new THREE.Mesh(new THREE.PlaneGeometry(0.06, h, 1, 4), seaGrassMat);
        blade.position.set(kx, 0.76 + h / 2, (ki % 2 === 0 ? -0.16 : 0.16));
        blade.rotation.y = (ki * 0.7);
        group.add(blade);
        kelpBlades.push(blade);
      });

      // 6. Transparent water volume
      const water = new THREE.Mesh(new THREE.BoxGeometry(1.50, 0.62, 0.66), waterMat);
      water.position.y = 0.76 + 0.31;
      group.add(water);

      // 7. Top sleek aquarium light canopy
      const canopy = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.05, 0.72), cabinetMat);
      canopy.position.y = 0.72 + 0.70;
      group.add(canopy);

      this.scene.add(group);

      // 8. Dynamic Living Fish with realistic organic morphology (Head, Torpedo Body, Swishing Tail, Fins, Glossy Eyes)
      const fishProfiles = [
        {
          type: 'clownfish',
          scale: 0.16,
          baseSpeed: 0.48,
          bodyColor: 0xf97316,
          stripeColor: 0xffffff,
          finColor: 0xfb923c,
          yOffset: 0.24,
          zLane: -0.12
        },
        {
          type: 'tetra',
          scale: 0.14,
          baseSpeed: 0.65,
          bodyColor: 0x0ea5e9,
          stripeColor: 0xef4444,
          finColor: 0x38bdf8,
          yOffset: 0.36,
          zLane: 0.14
        },
        {
          type: 'angelfish',
          scale: 0.18,
          baseSpeed: 0.38,
          bodyColor: 0xf8fafc,
          stripeColor: 0xf59e0b,
          finColor: 0xe2e8f0,
          yOffset: 0.48,
          zLane: 0.02
        }
      ];

      fishProfiles.forEach((fp, idx) => {
        const fishRoot = new THREE.Group();

        const bMat = new THREE.MeshStandardMaterial({ color: fp.bodyColor, roughness: 0.30, metalness: 0.15 });
        const sMat = new THREE.MeshStandardMaterial({ color: fp.stripeColor, roughness: 0.35 });
        const fMat = new THREE.MeshStandardMaterial({ color: fp.finColor, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
        const eyeMat = new THREE.MeshBasicMaterial({ color: 0x09090b });
        const pupilMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

        // Organic Torpedo Body
        const s = fp.scale;
        const body = new THREE.Mesh(new THREE.ConeGeometry(s * 0.35, s * 1.1, 12), bMat);
        body.rotation.z = -Math.PI / 2;
        fishRoot.add(body);

        // Rounded Head Dome
        const head = new THREE.Mesh(new THREE.SphereGeometry(s * 0.34, 10, 10), bMat);
        head.position.x = s * 0.50;
        head.scale.set(1.2, 0.9, 0.8);
        fishRoot.add(head);

        // Striking Stripes / Markings
        const band = new THREE.Mesh(new THREE.CylinderGeometry(s * 0.30, s * 0.33, s * 0.22, 10), sMat);
        band.rotation.z = -Math.PI / 2;
        band.position.x = s * 0.12;
        fishRoot.add(band);

        // Eyes on both sides of head
        [-s * 0.22, s * 0.22].forEach(ez => {
          const eye = new THREE.Mesh(new THREE.SphereGeometry(s * 0.08, 8, 8), eyeMat);
          eye.position.set(s * 0.65, s * 0.10, ez);
          fishRoot.add(eye);

          const pupil = new THREE.Mesh(new THREE.SphereGeometry(s * 0.035, 6, 6), pupilMat);
          pupil.position.set(s * 0.68, s * 0.12, ez + (ez > 0 ? 0.02 : -0.02));
          fishRoot.add(pupil);
        });

        // Top Dorsal Fin
        const dorsalGeom = new THREE.BufferGeometry();
        const dVerts = new Float32Array([
          -s * 0.2, s * 0.25, 0,
           s * 0.1, s * 0.65, 0,
           s * 0.4, s * 0.28, 0
        ]);
        dorsalGeom.setAttribute('position', new THREE.BufferAttribute(dVerts, 3));
        dorsalGeom.computeVertexNormals();
        const dorsal = new THREE.Mesh(dorsalGeom, fMat);
        fishRoot.add(dorsal);

        // Pectoral side fins
        const pecLeft = new THREE.Mesh(new THREE.PlaneGeometry(s * 0.32, s * 0.18), fMat);
        pecLeft.position.set(s * 0.30, -s * 0.05, s * 0.25);
        pecLeft.rotation.set(0.4, -0.6, 0.2);
        fishRoot.add(pecLeft);

        const pecRight = new THREE.Mesh(new THREE.PlaneGeometry(s * 0.32, s * 0.18), fMat);
        pecRight.position.set(s * 0.30, -s * 0.05, -s * 0.25);
        pecRight.rotation.set(-0.4, 0.6, -0.2);
        fishRoot.add(pecRight);

        // Dynamic swishing caudal tail (articulated pivot)
        const tailPivot = new THREE.Group();
        tailPivot.position.x = -s * 0.55;

        const tailGeom = new THREE.BufferGeometry();
        const tVerts = new Float32Array([
          0, 0, 0,
          -s * 0.65,  s * 0.48, 0,
          -s * 0.45,  0, 0,
          -s * 0.65, -s * 0.48, 0
        ]);
        const tIndices = [0, 1, 2, 0, 2, 3];
        tailGeom.setIndex(tIndices);
        tailGeom.setAttribute('position', new THREE.BufferAttribute(tVerts, 3));
        tailGeom.computeVertexNormals();
        const tailFin = new THREE.Mesh(tailGeom, fMat);
        tailPivot.add(tailFin);
        fishRoot.add(tailPivot);

        // Initial placement inside tank volume
        const startX = (idx - 1) * 0.38;
        const startY = 0.76 + fp.yOffset;
        const startZ = fp.zLane;
        fishRoot.position.set(startX, startY, startZ);
        group.add(fishRoot);

        this.aquariumFish.push({
          root: fishRoot,
          tailPivot: tailPivot,
          pecLeft: pecLeft,
          pecRight: pecRight,
          tankPos: { x: x, y: y0, z: z },
          floor: fl,
          rotY: rotY,
          localX: startX,
          localY: startY,
          localZ: startZ,
          baseY: startY,
          speed: fp.baseSpeed,
          heading: (idx % 2 === 0 ? 1 : -1),
          phase: Math.random() * Math.PI * 2,
          minX: -0.58,
          maxX: 0.58,
          minZ: -0.24,
          maxZ: 0.24
        });
      });

      this.colliders.push({
        type: 'box',
        floor: fl,
        minX: x - (rotY !== 0 ? 0.42 : 0.82),
        maxX: x + (rotY !== 0 ? 0.42 : 0.82),
        minZ: z - (rotY !== 0 ? 0.82 : 0.42),
        maxZ: z + (rotY !== 0 ? 0.82 : 0.42),
        minY: y0,
        maxY: y0 + 1.48
      });
    }

    updateAquariumFish(delta) {
      if (!this.aquariumFish || this.aquariumFish.length === 0) return;
      for (let i = 0; i < this.aquariumFish.length; i++) {
        const fish = this.aquariumFish[i];
        if (fish.floor !== this.playerFloor) continue;

        // Tail and fin stroke animation frequencies
        fish.phase += delta * 10.0;
        fish.tailPivot.rotation.y = Math.sin(fish.phase) * 0.58;
        fish.pecLeft.rotation.z = Math.sin(fish.phase * 0.8) * 0.35;
        fish.pecRight.rotation.z = -Math.sin(fish.phase * 0.8) * 0.35;

        // Realistic swimming patrol with smooth turning at tank walls
        fish.localX += fish.speed * fish.heading * delta;
        if (fish.localX > fish.maxX) {
          fish.localX = fish.maxX;
          fish.heading = -1;
        } else if (fish.localX < fish.minX) {
          fish.localX = fish.minX;
          fish.heading = 1;
        }

        fish.root.position.x = fish.localX;
        const targetRotY = (fish.heading > 0 ? 0 : Math.PI);
        fish.root.rotation.y = THREE.MathUtils.lerp(fish.root.rotation.y, targetRotY, Math.min(1, delta * 12));

        // Gentle natural undulation and buoyancy bob
        fish.root.position.y = fish.baseY + Math.sin(fish.phase * 0.4) * 0.025;
        fish.root.rotation.z = Math.sin(fish.phase * 0.5) * 0.05 * fish.heading;
      }
    }

    createClassicalSculpturePedestal(x, y0, z, statueType, fl, hasStanchions = false) {
      const group = new THREE.Group();
      group.position.set(x, y0, z);

      const marbleMat = new THREE.MeshStandardMaterial({ color: 0xedebe6, roughness: 0.35, metalness: 0.05 });
      const darkBaseMat = new THREE.MeshStandardMaterial({ color: 0x1f2328, roughness: 0.50 });
      const goldPlacardMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.88, roughness: 0.22 });
      const bronzeMat = new THREE.MeshStandardMaterial({ color: 0x5a4328, metalness: 0.78, roughness: 0.32 });
      const velvetRopeMat = new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.85 });

      // Stepped Pedestal Base Plinth
      const base1 = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.12, 0.92), darkBaseMat);
      base1.position.y = 0.06;
      group.add(base1);

      // Fluted Marble Shaft Column
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 1.05, 16), marbleMat);
      shaft.position.y = 0.12 + 0.525;
      group.add(shaft);

      // Carved Capital Crown
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.12, 0.84), darkBaseMat);
      cap.position.y = 1.23;
      group.add(cap);

      // Descriptive brass museum placard on pedestal face
      const placard = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.14, 0.02), goldPlacardMat);
      placard.position.set(0, 0.75, 0.36);
      group.add(placard);

      // Sculpture atop pedestal
      if (statueType === 'winged_victory') {
        const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 0.65, 12), marbleMat);
        torso.position.set(0, 1.29 + 0.325, 0);
        group.add(torso);
        [-0.30, 0.30].forEach((wx, wi) => {
          const wing = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.55, 0.38), marbleMat);
          wing.position.set(wx, 1.80, -0.12);
          wing.rotation.z = (wi === 0 ? 0.35 : -0.35);
          wing.rotation.y = (wi === 0 ? -0.25 : 0.25);
          group.add(wing);
        });
      } else if (statueType === 'venus') {
        const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.72, 14), marbleMat);
        torso.position.set(0, 1.29 + 0.36, 0);
        group.add(torso);
        const drape = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.35, 14), marbleMat);
        drape.position.set(0, 1.29 + 0.175, 0);
        group.add(drape);
      } else if (statueType === 'bronze_urn') {
        const urn = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.16, 0.52, 14), bronzeMat);
        urn.position.set(0, 1.29 + 0.26, 0);
        group.add(urn);
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.035, 8, 16), bronzeMat);
        rim.rotation.x = Math.PI / 2;
        rim.position.set(0, 1.29 + 0.52, 0);
        group.add(rim);
      } else if (statueType === 'bronze_philosopher') {
        const bustShoulders = new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.24, 0.26), bronzeMat);
        bustShoulders.position.set(0, 1.29 + 0.12, 0);
        group.add(bustShoulders);
        const bustHead = new THREE.Mesh(new THREE.SphereGeometry(0.18, 14, 14), bronzeMat);
        bustHead.scale.set(0.9, 1.2, 0.95);
        bustHead.position.set(0, 1.29 + 0.36, 0);
        group.add(bustHead);
      } else {
        // Bust Augustus with laurel wreath
        const bustShoulders = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.26, 0.28), marbleMat);
        bustShoulders.position.set(0, 1.29 + 0.13, 0);
        group.add(bustShoulders);
        const bustHead = new THREE.Mesh(new THREE.SphereGeometry(0.19, 16, 16), marbleMat);
        bustHead.scale.set(0.9, 1.2, 0.95);
        bustHead.position.set(0, 1.29 + 0.38, 0);
        group.add(bustHead);
        const laurel = new THREE.Mesh(new THREE.TorusGeometry(0.20, 0.022, 8, 20), goldPlacardMat);
        laurel.rotation.x = Math.PI / 2 + 0.15;
        laurel.position.set(0, 1.29 + 0.45, 0.02);
        group.add(laurel);
      }

      this.scene.add(group);

      this.colliders.push({
        type: 'cylinder',
        floor: fl,
        x: x,
        z: z,
        radius: 0.48,
        minY: y0,
        maxY: y0 + 1.30
      });

      if (hasStanchions) {
        const sOffsets = [[-0.85, -0.85], [0.85, -0.85], [0.85, 0.85], [-0.85, 0.85]];
        sOffsets.forEach(([sox, soz]) => {
          const sBase = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.035, 12), goldPlacardMat);
          sBase.position.set(x + sox, y0 + 0.02, z + soz);
          this.scene.add(sBase);
          const sPost = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.90, 8), goldPlacardMat);
          sPost.position.set(x + sox, y0 + 0.47, z + soz);
          this.scene.add(sPost);
          const sBall = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), goldPlacardMat);
          sBall.position.set(x + sox, y0 + 0.94, z + soz);
          this.scene.add(sBall);
        });

        for (let r = 0; r < 4; r++) {
          const p1 = sOffsets[r];
          const p2 = sOffsets[(r + 1) % 4];
          const midX = x + (p1[0] + p2[0]) / 2;
          const midZ = z + (p1[1] + p2[1]) / 2;
          const rLen = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
          const rAng = Math.atan2(p2[0] - p1[0], p2[1] - p1[1]);
          const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, rLen, 8), velvetRopeMat);
          rope.rotation.x = Math.PI / 2;
          rope.rotation.z = -rAng;
          rope.position.set(midX, y0 + 0.86, midZ);
          this.scene.add(rope);
        }
      }
    }

    createEgyptianSarcophagusDais(x, y0, z, fl) {
      const daisGroup = new THREE.Group();
      daisGroup.position.set(x, y0, z);

      const basaltMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.40 });
      const goldMat = new THREE.MeshStandardMaterial({ color: 0xeab308, metalness: 0.88, roughness: 0.22 });
      const turquoiseMat = new THREE.MeshStandardMaterial({ color: 0x06b6d4, roughness: 0.35 });
      const velvetMat = new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.85 });

      // Stepped Basalt Dais (Tier 1 & Tier 2)
      const t1 = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.16, 2.6), basaltMat);
      t1.position.y = 0.08;
      daisGroup.add(t1);

      const t2 = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.16, 2.0), basaltMat);
      t2.position.y = 0.24;
      daisGroup.add(t2);

      // Gilded Sarcophagus / Pharaoh Mask display
      const sarc = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.65, 0.95), goldMat);
      sarc.position.y = 0.32 + 0.325;
      daisGroup.add(sarc);

      // Nemes royal headdress bands
      const headdress = new THREE.Mesh(new THREE.BoxGeometry(0.70, 0.45, 0.98), turquoiseMat);
      headdress.position.set(-0.75, 0.75, 0);
      daisGroup.add(headdress);

      // Golden Pharaoh Mask face
      const maskFace = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 16), goldMat);
      maskFace.scale.set(1.1, 0.8, 1.0);
      maskFace.position.set(-0.72, 0.98, 0);
      daisGroup.add(maskFace);

      // Crossed Crook & Flail royal regalia
      const regalia1 = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.62, 8), turquoiseMat);
      regalia1.rotation.z = Math.PI / 4;
      regalia1.position.set(-0.15, 0.99, 0);
      daisGroup.add(regalia1);

      const regalia2 = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.62, 8), turquoiseMat);
      regalia2.rotation.z = -Math.PI / 4;
      regalia2.position.set(-0.15, 0.99, 0);
      daisGroup.add(regalia2);

      this.scene.add(daisGroup);

      this.colliders.push({
        type: 'box',
        floor: fl,
        minX: x - 2.2,
        maxX: x + 2.2,
        minZ: z - 1.3,
        maxZ: z + 1.3,
        minY: y0,
        maxY: y0 + 1.00
      });

      // 4 Brass Stanchions and velvet ropes enclosing the sarcophagus
      const sOffsets = [[-2.4, -1.5], [2.4, -1.5], [2.4, 1.5], [-2.4, 1.5]];
      sOffsets.forEach(([ox, oz]) => {
        const sBase = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.04, 12), goldMat);
        sBase.position.set(x + ox, y0 + 0.02, z + oz);
        this.scene.add(sBase);
        const sPost = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.94, 8), goldMat);
        sPost.position.set(x + ox, y0 + 0.49, z + oz);
        this.scene.add(sPost);
        const sBall = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), goldMat);
        sBall.position.set(x + ox, y0 + 0.98, z + oz);
        this.scene.add(sBall);
      });

      for (let r = 0; r < 4; r++) {
        const p1 = sOffsets[r];
        const p2 = sOffsets[(r + 1) % 4];
        const midX = x + (p1[0] + p2[0]) / 2;
        const midZ = z + (p1[1] + p2[1]) / 2;
        const rLen = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
        const rAng = Math.atan2(p2[0] - p1[0], p2[1] - p1[1]);
        const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, rLen, 8), velvetMat);
        rope.rotation.x = Math.PI / 2;
        rope.rotation.z = -rAng;
        rope.position.set(midX, y0 + 0.90, midZ);
        this.scene.add(rope);
      }
    }

    createKnightArmorDisplay(x, y0, z, fl) {
      const armorGroup = new THREE.Group();
      armorGroup.position.set(x, y0, z);

      const stonePlinthMat = new THREE.MeshStandardMaterial({ color: 0x27272a, roughness: 0.60 });
      const steelArmorMat = new THREE.MeshStandardMaterial({ color: 0xd1d5db, metalness: 0.92, roughness: 0.18 });
      const goldTrimMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.88, roughness: 0.22 });
      const shieldMat = new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.45 });

      // Stepped Stone Display Plinth
      const plinth = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.28, 1.4), stonePlinthMat);
      plinth.position.y = 0.14;
      armorGroup.add(plinth);

      // Steel Sabatons (feet) & Greaves (shins)
      [-0.18, 0.18].forEach(lx => {
        const foot = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.26), steelArmorMat);
        foot.position.set(lx, 0.32, 0.06);
        armorGroup.add(foot);

        const greave = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.44, 10), steelArmorMat);
        greave.position.set(lx, 0.58, 0);
        armorGroup.add(greave);

        const poleyn = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 8), goldTrimMat);
        poleyn.position.set(lx, 0.80, 0.03);
        armorGroup.add(poleyn);

        const cuisse = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.075, 0.42, 10), steelArmorMat);
        cuisse.position.set(lx, 1.01, 0);
        armorGroup.add(cuisse);
      });

      // Steel Breastplate Torso & Fauld
      const breastplate = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.21, 0.58, 12), steelArmorMat);
      breastplate.scale.set(1.2, 1.0, 0.85);
      breastplate.position.set(0, 1.48, 0);
      armorGroup.add(breastplate);

      // Pauldrons (shoulder guards)
      [-0.32, 0.32].forEach((px, pi) => {
        const pauldron = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 10), goldTrimMat);
        pauldron.position.set(px, 1.72, 0);
        armorGroup.add(pauldron);

        const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.055, 0.52, 10), steelArmorMat);
        arm.position.set(px, 1.42, 0.06);
        arm.rotation.x = -0.25;
        armorGroup.add(arm);
      });

      // Close Helm Helmet & Visor
      const helmet = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.15, 0.30, 12), steelArmorMat);
      helmet.position.set(0, 1.94, 0);
      armorGroup.add(helmet);

      const visor = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.10, 0.12), goldTrimMat);
      visor.position.set(0, 1.94, 0.10);
      armorGroup.add(visor);

      // Heraldic Heater Shield held on left arm
      const shield = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.72, 0.46), shieldMat);
      shield.position.set(-0.38, 1.35, 0.18);
      shield.rotation.y = 0.35;
      armorGroup.add(shield);

      const shieldBoss = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), goldTrimMat);
      shieldBoss.position.set(-0.39, 1.35, 0.18);
      armorGroup.add(shieldBoss);

      // Steel Broadsword held in right hand pointing down
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.02, 1.10, 0.08), steelArmorMat);
      blade.position.set(0.38, 0.95, 0.15);
      armorGroup.add(blade);

      const crossguard = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, 0.28), goldTrimMat);
      crossguard.position.set(0.38, 1.50, 0.15);
      armorGroup.add(crossguard);

      this.scene.add(armorGroup);

      this.colliders.push({
        type: 'box',
        floor: fl,
        minX: x - 0.85,
        maxX: x + 0.85,
        minZ: z - 0.75,
        maxZ: z + 0.75,
        minY: y0,
        maxY: y0 + 1.50
      });
    }

    createMuseumEasel(x, y0, z, fl, rotY = 0) {
      const easelGroup = new THREE.Group();
      easelGroup.position.set(x, y0, z);
      easelGroup.rotation.y = rotY;

      const woodMat = new THREE.MeshStandardMaterial({ color: 0x3d271d, roughness: 0.60 });
      const goldMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.85, roughness: 0.25 });
      const paperMat = new THREE.MeshLambertMaterial({ color: 0xfef08a });

      // Tripod Legs
      [-0.24, 0.24].forEach((lx, li) => {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.70, 8), woodMat);
        leg.position.set(lx, 0.84, 0.05);
        leg.rotation.z = (li === 0 ? 0.12 : -0.12);
        easelGroup.add(leg);
      });
      const rearLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.70, 8), woodMat);
      rearLeg.position.set(0, 0.84, -0.35);
      rearLeg.rotation.x = -0.22;
      easelGroup.add(rearLeg);

      // Crossbar support
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.04, 0.06), woodMat);
      bar.position.set(0, 0.95, 0.08);
      easelGroup.add(bar);

      // Framed Gallery Floorplan Board
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.78, 0.035), goldMat);
      frame.position.set(0, 1.35, 0.08);
      easelGroup.add(frame);

      const planPaper = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.72, 0.01), paperMat);
      planPaper.position.set(0, 1.35, 0.10);
      easelGroup.add(planPaper);

      this.scene.add(easelGroup);

      this.colliders.push({
        type: 'box',
        floor: fl,
        minX: x - 0.40,
        maxX: x + 0.40,
        minZ: z - 0.40,
        maxZ: z + 0.40,
        minY: y0,
        maxY: y0 + 1.20
      });
    }

    createPalletRackStorage(x, y0, z, fl) {
      const rackGroup = new THREE.Group();
      rackGroup.position.set(x, y0, z);

      const steelMat = new THREE.MeshStandardMaterial({ color: 0x1e3a8a, metalness: 0.85, roughness: 0.35 });
      const beamMat = new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.75, roughness: 0.40 });
      const crateMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.70 });
      const cartonMat = new THREE.MeshLambertMaterial({ color: 0xb45309 });

      // 4 Industrial steel upright posts (height 3.2m)
      [[-1.10, -0.45], [1.10, -0.45], [-1.10, 0.45], [1.10, 0.45]].forEach(([px, pz]) => {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, 3.2, 0.06), steelMat);
        post.position.set(px, 1.6, pz);
        rackGroup.add(post);
      });

      // 3 Tiers of heavy orange load beams
      [0.85, 1.85, 2.85].forEach(by => {
        [-0.45, 0.45].forEach(bz => {
          const beam = new THREE.Mesh(new THREE.BoxGeometry(2.26, 0.08, 0.04), beamMat);
          beam.position.set(0, by, bz);
          rackGroup.add(beam);
        });
        const deck = new THREE.Mesh(new THREE.BoxGeometry(2.20, 0.02, 0.86), steelMat);
        deck.position.set(0, by + 0.04, 0);
        rackGroup.add(deck);
      });

      // Wooden storage crates on lower level
      [-0.55, 0.55].forEach((cx, ci) => {
        const crate = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.72, 0.70), crateMat);
        crate.position.set(cx, 0.40, 0);
        rackGroup.add(crate);
      });

      // Archival record cartons on mid level
      [-0.75, -0.25, 0.25, 0.75].forEach(cx => {
        const box = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.38, 0.55), cartonMat);
        box.position.set(cx, 1.10, 0);
        rackGroup.add(box);
      });

      this.scene.add(rackGroup);

      this.colliders.push({
        type: 'box',
        floor: fl,
        minX: x - 1.20,
        maxX: x + 1.20,
        minZ: z - 0.55,
        maxZ: z + 0.55,
        minY: y0,
        maxY: y0 + 2.80
      });
    }

    populateFloorExhibits(fl, y0, mats) {
      if (fl === 0) {
        // =========================================================================
        // FLOOR 0: RUNNER RUGS, 2 AQUARIUM TANKS, AND CORNER PLANTS ONLY
        // =========================================================================
        // Main Concourse Rugs (Lighter, soft pastel hues)
        this.createGalleryRunnerRug(-10.0, y0, -9.0, 3.2, 14.0, 0xb47488, 0xc6bc99);
        this.createGalleryRunnerRug(-10.0, y0,  7.0, 3.2, 10.0, 0xb47488, 0xc6bc99);
        this.createGalleryRunnerRug(-10.0, y0, 21.0, 3.2, 10.0, 0xb47488, 0xc6bc99);

        // West Wing Rug
        this.createGalleryRunnerRug(-26.0, y0, 6.0, 4.4, 20.0, 0x7e8bb2, 0xc6bc99);

        // South-East Concourse Rug
        this.createGalleryRunnerRug(16.0, y0, 23.0, 16.0, 3.2, 0xb47488, 0xc6bc99);

        // Exactly 2 Live Aquatic Glass Aquarium Tanks on Floor 0 (recessed alcoves)
        this.createAquariumTank(-14.2, y0, -5.0, 0, Math.PI / 2);
        this.createAquariumTank( -5.8, y0, 14.0, 0, -Math.PI / 2);

        // Non-clipping, unobstructed corner potted plants
        this.createPottedMuseumPlant(-34.5, y0, 16.5, 0);
        this.createPottedMuseumPlant( 22.0, y0, -38.5, 0);

      } else if (fl === 1) {
        // =========================================================================
        // FLOOR 1: RUNNER RUGS, 2 AQUARIUM TANKS, AND CORNER PLANTS ONLY
        // =========================================================================
        this.createGalleryRunnerRug(-10.0, y0, -9.0, 3.0, 14.0, 0x7e8bb2, 0xc6bc99);
        this.createGalleryRunnerRug(-10.0, y0,  7.0, 3.0, 10.0, 0x7e8bb2, 0xc6bc99);
        this.createGalleryRunnerRug(-10.0, y0, 21.0, 3.0, 10.0, 0x7e8bb2, 0xc6bc99);
        this.createGalleryRunnerRug(-26.0, y0, 6.0, 4.4, 20.0, 0x7e8bb2, 0xc6bc99);

        // Exactly 2 Live Aquatic Glass Aquarium Tanks on Floor 1
        this.createAquariumTank(-14.2, y0, -5.0, 1, Math.PI / 2);
        this.createAquariumTank( -5.8, y0, 14.0, 1, -Math.PI / 2);

        // Non-clipping, unobstructed corner potted plants
        this.createPottedMuseumPlant(-34.5, y0, 16.5, 1);
        this.createPottedMuseumPlant( 20.0, y0, -38.5, 1);

      } else if (fl === 2) {
        // =========================================================================
        // FLOOR 2: RUNNER RUGS, 2 AQUARIUM TANKS, AND CORNER PLANTS ONLY
        // =========================================================================
        this.createGalleryRunnerRug(-10.0, y0, -9.0, 3.0, 14.0, 0x53aa93, 0xc6bc99);
        this.createGalleryRunnerRug(-10.0, y0,  7.0, 3.0, 10.0, 0x53aa93, 0xc6bc99);
        this.createGalleryRunnerRug(-10.0, y0, 21.0, 3.0, 10.0, 0x53aa93, 0xc6bc99);
        this.createGalleryRunnerRug(-26.0, y0, 6.0, 4.4, 20.0, 0x53aa93, 0xc6bc99);

        // Exactly 2 Live Aquatic Glass Aquarium Tanks on Floor 2
        this.createAquariumTank(-14.2, y0, -5.0, 2, Math.PI / 2);
        this.createAquariumTank( -5.8, y0, 14.0, 2, -Math.PI / 2);

        // Non-clipping, unobstructed corner potted plants
        this.createPottedMuseumPlant(-34.5, y0, 16.5, 2);
        this.createPottedMuseumPlant( 20.0, y0, -38.5, 2);

      } else {
        // FLOOR 3: Top floor challenge room - keep floor clear for milk crate stacking
      }
    }

    createExitDoors(x, y, z, mats) {
      const group = new THREE.Group();
      group.position.set(x, y, z);

      // Photographic internet-accurate textures from the reference arched door (Image 3)
      const doorLeftTex = this.texLoader.load('assets/textures/exit_door_left.jpg', (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
      });
      const doorRightTex = this.texLoader.load('assets/textures/exit_door_right.jpg', (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
      });
      const woodTex = this.texLoader.load('assets/textures/exit_doors_wood.jpg', (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.wrapS = THREE.RepeatWrapping;
        t.wrapT = THREE.RepeatWrapping;
      });

      // Rich antique dark oak wood materials with specular highlights
      const doorLeftMat = new THREE.MeshPhongMaterial({
        map: doorLeftTex,
        color: 0xffffff,
        specular: 0x33261a,
        shininess: 18
      });
      const doorRightMat = new THREE.MeshPhongMaterial({
        map: doorRightTex,
        color: 0xffffff,
        specular: 0x33261a,
        shininess: 18
      });
      const darkOakMat = new THREE.MeshPhongMaterial({
        map: woodTex,
        color: 0x5a3e28,
        specular: 0x221a10,
        shininess: 12
      });

      // Museum carved limestone portal arch materials
      const stoneMat = new THREE.MeshPhongMaterial({
        color: 0xe2ded6,
        specular: 0x1f1f1f,
        shininess: 8
      });
      const stoneAccentMat = new THREE.MeshPhongMaterial({
        color: 0xd0cbc2,
        specular: 0x282828,
        shininess: 10
      });

      // Antique dark bronze / wrought iron door hardware
      const ironMat = new THREE.MeshPhongMaterial({
        color: 0x1c1917,
        specular: 0x887766,
        shininess: 48
      });

      const doorW = 1.40;
      const straightH = 3.10;
      const totalH = 4.50;
      const doorDepth = 0.09;

      const extrudeSettings = {
        depth: doorDepth,
        bevelEnabled: true,
        bevelThickness: 0.012,
        bevelSize: 0.012,
        bevelSegments: 2,
        curveSegments: 36
      };

      // --- 1. LEFT DOOR LEAF (Pivots on outer left hinge: x = -1.40) ---
      const leftShape = new THREE.Shape();
      leftShape.moveTo(0, 0);
      leftShape.lineTo(doorW, 0);
      leftShape.lineTo(doorW, totalH);
      leftShape.absarc(doorW, straightH, doorW, Math.PI / 2, Math.PI, false);
      leftShape.lineTo(0, 0);

      const leftGeom = new THREE.ExtrudeGeometry(leftShape, extrudeSettings);
      leftGeom.translate(0, 0, -doorDepth / 2);

      // Normalize UVs so photographic texture maps seamlessly [0, 1] across the door leaf
      const leftPos = leftGeom.attributes.position;
      const leftUv = leftGeom.attributes.uv;
      for (let i = 0; i < leftPos.count; i++) {
        const px = leftPos.getX(i);
        const py = leftPos.getY(i);
        leftUv.setXY(i, Math.max(0, Math.min(1, px / doorW)), Math.max(0, Math.min(1, py / totalH)));
      }
      leftUv.needsUpdate = true;

      const leftDoorMesh = new THREE.Mesh(leftGeom, [doorLeftMat, darkOakMat]);

      this.leftDoorPivot = new THREE.Group();
      this.leftDoorPivot.position.set(-doorW, 0, 0);
      this.leftDoorPivot.add(leftDoorMesh);

      // --- 2. RIGHT DOOR LEAF (Pivots on outer right hinge: x = +1.40) ---
      const rightShape = new THREE.Shape();
      rightShape.moveTo(0, 0);
      rightShape.lineTo(-doorW, 0);
      rightShape.lineTo(-doorW, totalH);
      rightShape.absarc(-doorW, straightH, doorW, Math.PI / 2, 0, true);
      rightShape.lineTo(0, 0);

      const rightGeom = new THREE.ExtrudeGeometry(rightShape, extrudeSettings);
      rightGeom.translate(0, 0, -doorDepth / 2);

      // Normalize UVs so photographic texture maps seamlessly [0, 1] across the right leaf
      const rightPos = rightGeom.attributes.position;
      const rightUv = rightGeom.attributes.uv;
      for (let i = 0; i < rightPos.count; i++) {
        const px = rightPos.getX(i);
        const py = rightPos.getY(i);
        rightUv.setXY(i, Math.max(0, Math.min(1, (px + doorW) / doorW)), Math.max(0, Math.min(1, py / totalH)));
      }
      rightUv.needsUpdate = true;

      const rightDoorMesh = new THREE.Mesh(rightGeom, [doorRightMat, darkOakMat]);

      this.rightDoorPivot = new THREE.Group();
      this.rightDoorPivot.position.set(doorW, 0, 0);
      this.rightDoorPivot.add(rightDoorMesh);

      // --- 3. ASTRAGAL & CAST-IRON HARDWARE (Right Leaf) ---
      // Vertical meeting stile astragal bead
      const astragal = new THREE.Mesh(new THREE.BoxGeometry(0.045, totalH, 0.024), darkOakMat);
      astragal.position.set(-doorW + 0.02, totalH / 2, -doorDepth / 2 - 0.01);
      this.rightDoorPivot.add(astragal);

      // Decorative cast-iron escutcheon backplate & handle (matching Image 3)
      const escutcheon = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.44, 0.016), ironMat);
      escutcheon.position.set(-doorW + 0.08, 1.35, -doorDepth / 2 - 0.012);
      this.rightDoorPivot.add(escutcheon);

      const handlePivot = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.05, 12), ironMat);
      handlePivot.rotation.x = Math.PI / 2;
      handlePivot.position.set(-doorW + 0.08, 1.40, -doorDepth / 2 - 0.035);
      this.rightDoorPivot.add(handlePivot);

      const handleGrip = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.02, 0.02), ironMat);
      handleGrip.position.set(-doorW + 0.15, 1.40, -doorDepth / 2 - 0.06);
      this.rightDoorPivot.add(handleGrip);

      // Keyhole slot
      const keyhole = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.035, 0.005), new THREE.MeshBasicMaterial({ color: 0x0a0a0a }));
      keyhole.position.set(-doorW + 0.08, 1.25, -doorDepth / 2 - 0.022);
      this.rightDoorPivot.add(keyhole);

      // Heavy architectural iron hinges (outer edges)
      for (const yHinge of [0.45, 1.80, 3.10]) {
        // Left hinge
        const lHinge = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.16, 12), ironMat);
        lHinge.position.set(0.01, yHinge, -doorDepth / 2 - 0.005);
        this.leftDoorPivot.add(lHinge);
        // Right hinge
        const rHinge = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.16, 12), ironMat);
        rHinge.position.set(-0.01, yHinge, -doorDepth / 2 - 0.005);
        this.rightDoorPivot.add(rHinge);
      }

      group.add(this.leftDoorPivot);
      group.add(this.rightDoorPivot);
      this.exitDoors = group;

      // --- 4. CARVED STONE ARCH SURROUND & PORTAL (Matching Image 3) ---
      const portalGroup = new THREE.Group();

      // Left Stone Jamb (x: -2.40 .. -1.40)
      const leftPlinth = new THREE.Mesh(new THREE.BoxGeometry(1.04, 0.45, 0.54), stoneMat);
      leftPlinth.position.set(-1.90, 0.225, 0);
      portalGroup.add(leftPlinth);

      const leftShaft = new THREE.Mesh(new THREE.BoxGeometry(1.00, 2.55, 0.48), stoneMat);
      leftShaft.position.set(-1.90, 1.725, 0);
      portalGroup.add(leftShaft);

      const leftInnerReveal = new THREE.Mesh(new THREE.BoxGeometry(0.20, 2.55, 0.42), stoneAccentMat);
      leftInnerReveal.position.set(-1.50, 1.725, -0.02);
      portalGroup.add(leftInnerReveal);

      const leftImpost = new THREE.Mesh(new THREE.BoxGeometry(1.08, 0.15, 0.54), stoneMat);
      leftImpost.position.set(-1.90, 3.075, 0);
      portalGroup.add(leftImpost);

      // Right Stone Jamb (x: +1.40 .. +2.40)
      const rightPlinth = new THREE.Mesh(new THREE.BoxGeometry(1.04, 0.45, 0.54), stoneMat);
      rightPlinth.position.set(1.90, 0.225, 0);
      portalGroup.add(rightPlinth);

      const rightShaft = new THREE.Mesh(new THREE.BoxGeometry(1.00, 2.55, 0.48), stoneMat);
      rightShaft.position.set(1.90, 1.725, 0);
      portalGroup.add(rightShaft);

      const rightInnerReveal = new THREE.Mesh(new THREE.BoxGeometry(0.20, 2.55, 0.42), stoneAccentMat);
      rightInnerReveal.position.set(1.50, 1.725, -0.02);
      portalGroup.add(rightInnerReveal);

      const rightImpost = new THREE.Mesh(new THREE.BoxGeometry(1.08, 0.15, 0.54), stoneMat);
      rightImpost.position.set(1.90, 3.075, 0);
      portalGroup.add(rightImpost);

      // Semicircular Stone Arch Ring (Inner R: 1.40m, Outer R: 1.85m)
      const archShape = new THREE.Shape();
      archShape.absarc(0, 0, 1.85, 0, Math.PI, false);
      archShape.lineTo(-1.40, 0);
      archShape.absarc(0, 0, 1.40, Math.PI, 0, true);
      archShape.closePath();

      const archGeom = new THREE.ExtrudeGeometry(archShape, {
        depth: 0.46,
        bevelEnabled: true,
        bevelThickness: 0.018,
        bevelSize: 0.018,
        bevelSegments: 2,
        curveSegments: 36
      });
      archGeom.translate(0, 0, -0.23);
      const archMesh = new THREE.Mesh(archGeom, stoneMat);
      archMesh.position.set(0, straightH, 0);
      portalGroup.add(archMesh);

      // Outer Arch Moulding Ring (Outer R: 1.98m)
      const outerMouldShape = new THREE.Shape();
      outerMouldShape.absarc(0, 0, 1.98, 0, Math.PI, false);
      outerMouldShape.lineTo(-1.85, 0);
      outerMouldShape.absarc(0, 0, 1.85, Math.PI, 0, true);
      outerMouldShape.closePath();
      const outerMouldGeom = new THREE.ExtrudeGeometry(outerMouldShape, { depth: 0.50, bevelEnabled: false, curveSegments: 36 });
      outerMouldGeom.translate(0, 0, -0.25);
      const outerMouldMesh = new THREE.Mesh(outerMouldGeom, stoneAccentMat);
      outerMouldMesh.position.set(0, straightH, 0);
      portalGroup.add(outerMouldMesh);

      // Carved Keystone at Arch Apex (matching Image 3)
      const keystone = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.44, 0.56), stoneAccentMat);
      keystone.position.set(0, straightH + 1.85, 0);
      portalGroup.add(keystone);

      // Upper Spandrel Blocks (filling from arch ring up to lintel at y=4.68m)
      const leftSpandrel = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.55, 0.42), stoneMat);
      leftSpandrel.position.set(-1.90, straightH + 0.775, 0);
      portalGroup.add(leftSpandrel);

      const rightSpandrel = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.55, 0.42), stoneMat);
      rightSpandrel.position.set(1.90, straightH + 0.775, 0);
      portalGroup.add(rightSpandrel);

      group.add(portalGroup);

      // --- 5. EXTERIOR STONE PORCH / STEPS (Outside museum at z > 28) ---
      const porchStep1 = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.12, 1.8), stoneMat);
      porchStep1.position.set(0, -0.06, 0.9);
      group.add(porchStep1);

      const porchStep2 = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.12, 1.4), stoneAccentMat);
      porchStep2.position.set(0, -0.18, 1.9);
      group.add(porchStep2);

      // Subtle atmospheric exterior warm lantern glow outside the exit doors
      const exitLantern = new THREE.PointLight(0xffecd0, 0.65, 8.5);
      exitLantern.position.set(0, 3.6, 1.2);
      group.add(exitLantern);

      this.scene.add(group);

      // Solid impassable collider across the doors when locked
      this.exitDoorCollider = {
        type: 'box',
        floor: 0,
        minX: x - 1.45,
        maxX: x + 1.45,
        minZ: z - 0.35,
        maxZ: z + 0.35
      };
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
      const frameGeomCache = new Map();
      const plaqueGeom = new THREE.PlaneGeometry(0.85, 0.22);
      const border = 0.08;
      const depth = 0.04;

      const floorNames = ['1ST FLOOR', '2ND FLOOR', '3RD FLOOR', '4TH FLOOR'];

      // Randomize artworks per floor across available wall frame slots on every playthrough
      for (let f = 0; f < 4; f++) {
        const slots = WALL_FRAME_SLOTS.filter(s => s.floor === f);
        const arts = CURATED_ARTWORKS.filter(a => a.floor === f);

        // Fisher-Yates shuffle the artworks for this floor
        const shuffledArts = [...arts];
        for (let i = shuffledArts.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffledArts[i], shuffledArts[j]] = [shuffledArts[j], shuffledArts[i]];
        }

        slots.forEach((slot, idx) => {
          if (idx >= shuffledArts.length) return;
          const art = shuffledArts[idx];
          art.x = slot.x;
          art.y = slot.y;
          art.z = slot.z;
          art.rotY = slot.rotY;
          art.wing = T('floor.' + (f + 1), floorNames[f]);

          const group = new THREE.Group();
          const nx = Math.sin(slot.rotY) * 0.06;
          const nz = Math.cos(slot.rotY) * 0.06;
          group.position.set(slot.x + nx, slot.y, slot.z + nz);
          group.rotation.y = slot.rotY;

          const key = `${art.w}_${art.h}`;
          if (!planeGeomCache.has(key)) {
            planeGeomCache.set(key, new THREE.PlaneGeometry(art.w, art.h));
            frameGeomCache.set(key, new THREE.BoxGeometry(art.w + border * 2, art.h + border * 2, depth));
          }

          // Single unified museum frame backboard (reduces draw calls by 4x per painting!)
          const frameMesh = new THREE.Mesh(frameGeomCache.get(key), frameMat);
          frameMesh.position.set(0, 0, 0);
          group.add(frameMesh);

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
          canvasMesh.position.z = depth / 2 + 0.005;
          group.add(canvasMesh);

          this.texLoader.load(
            art.file,
            (tex) => {
              tex.colorSpace = THREE.SRGBColorSpace;
              canvasMesh.material.map = tex;
              canvasMesh.material.needsUpdate = true;
              if (this.renderer) {
                this.renderer.initTexture(tex);
              }
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
          plaqueMesh.position.set(0, -art.h / 2 - border - 0.14, depth / 2 + 0.005);
          group.add(plaqueMesh);

          this.scene.add(group);

          this.paintings.push({
            id: art.id,
            title: art.title,
            file: art.file,
            wing: art.wing,
            x: slot.x + nx,
            y: slot.y,
            z: slot.z + nz,
            floor: f,
            mesh: group
          });
        });
      }
      this.updateRelicFloorVisibility();
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

        // 1. MAIN GALLERY SPINE (x: -10, z: -16 to 26) with bench flanking bypasses
        fn.gallery_n16 = addNode(-10.0, y, -16.0, fl, 'gallery_n16');
        fn.gallery_n10 = addNode(-10.0, y, -10.0, fl, 'gallery_n10');
        fn.gallery_n2  = addNode(-10.0, y,  -2.0, fl, 'gallery_n2');
        // Flank North Bench at (-10, 0)
        fn.gallery_b0_w = addNode(-13.0, y,   0.0, fl, 'gallery_b0_w');
        fn.gallery_b0_e = addNode( -7.0, y,   0.0, fl, 'gallery_b0_e');
        fn.gallery_p2   = addNode(-10.0, y,   2.0, fl, 'gallery_p2');
        fn.gallery_p6   = addNode(-10.0, y,   6.0, fl, 'gallery_p6');
        fn.gallery_p10  = addNode(-10.0, y,  10.0, fl, 'gallery_p10');
        // Flank South Bench at (-10, 14)
        fn.gallery_b14_w= addNode(-13.0, y,  14.0, fl, 'gallery_b14_w');
        fn.gallery_b14_e= addNode( -7.0, y,  14.0, fl, 'gallery_b14_e');
        fn.gallery_p18  = addNode(-10.0, y,  18.0, fl, 'gallery_p18');
        fn.gallery_p22  = addNode(-10.0, y,  22.0, fl, 'gallery_p22');
        fn.gallery_p26  = addNode(-10.0, y,  26.0, fl, 'gallery_p26');

        connect(fn.gallery_n16, fn.gallery_n10);
        connect(fn.gallery_n10, fn.gallery_n2);

        // North Bench bypass:
        connect(fn.gallery_n2, fn.gallery_b0_w);
        connect(fn.gallery_n2, fn.gallery_b0_e);
        connect(fn.gallery_b0_w, fn.gallery_p2);
        connect(fn.gallery_b0_e, fn.gallery_p2);

        connect(fn.gallery_p2,  fn.gallery_p6);
        connect(fn.gallery_p6,  fn.gallery_p10);

        // South Bench bypass:
        connect(fn.gallery_p10, fn.gallery_b14_w);
        connect(fn.gallery_p10, fn.gallery_b14_e);
        connect(fn.gallery_b14_w, fn.gallery_p18);
        connect(fn.gallery_b14_e, fn.gallery_p18);

        connect(fn.gallery_p18, fn.gallery_p22);
        connect(fn.gallery_p22, fn.gallery_p26);

        // 2. WEST WING (x: -36..-16, z: -6..18)
        // Three dedicated doorways into Main Gallery with approach, portal, and inner nodes
        // Door North at z = -2.0
        fn.doorW_N_gal = addNode(-12.5, y, -2.0, fl, 'doorW_N_gal');
        fn.doorW_N_mid = addNode(-16.0, y, -2.0, fl, 'doorW_N_mid');
        fn.doorW_N_in  = addNode(-19.5, y, -2.0, fl, 'doorW_N_in');
        connect(fn.gallery_n2, fn.doorW_N_gal);
        connect(fn.doorW_N_gal, fn.doorW_N_mid);
        connect(fn.doorW_N_mid, fn.doorW_N_in);

        // Door Center at z = 6.0
        fn.doorW_C_gal = addNode(-12.5, y, 6.0, fl, 'doorW_C_gal');
        fn.doorW_C_mid = addNode(-16.0, y, 6.0, fl, 'doorW_C_mid');
        fn.doorW_C_in  = addNode(-19.5, y, 6.0, fl, 'doorW_C_in');
        connect(fn.gallery_p6, fn.doorW_C_gal);
        connect(fn.doorW_C_gal, fn.doorW_C_mid);
        connect(fn.doorW_C_mid, fn.doorW_C_in);

        // Door South at z = 14.0
        fn.doorW_S_gal = addNode(-12.5, y, 14.0, fl, 'doorW_S_gal');
        fn.doorW_S_mid = addNode(-16.0, y, 14.0, fl, 'doorW_S_mid');
        fn.doorW_S_in  = addNode(-19.5, y, 14.0, fl, 'doorW_S_in');
        connect(fn.gallery_b14_w, fn.doorW_S_gal);
        connect(fn.doorW_S_gal, fn.doorW_S_mid);
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

        // 3. WEST OFFICE (x: -34..-24, z: 18..28)
        // Door from West Wing at x = -30.0, z = 18.0
        fn.doorWOff_w_n = addNode(-30.0, y, 16.0, fl, 'doorWOff_w_n');
        fn.doorWOff_w_m = addNode(-30.0, y, 18.0, fl, 'doorWOff_w_m');
        fn.doorWOff_w_s = addNode(-30.0, y, 20.0, fl, 'doorWOff_w_s');
        connect(fn.west_w_p15, fn.doorWOff_w_n);
        connect(fn.doorWOff_w_n, fn.doorWOff_w_m);
        connect(fn.doorWOff_w_m, fn.doorWOff_w_s);

        // Pathway inside office passes in front of desk at z = 21.0
        fn.wOffice_front = addNode(-29.0, y, 21.0, fl, 'wOffice_front');
        fn.wOffice_side  = addNode(-26.0, y, 24.0, fl, 'wOffice_side');
        connect(fn.doorWOff_w_s, fn.wOffice_front);
        connect(fn.wOffice_front, fn.wOffice_side);

        // Door between West Office and SW Stairwell at x = -24.0, z = 19.7
        fn.doorWOff_st_w = addNode(-26.0, y, 19.7, fl, 'doorWOff_st_w');
        fn.doorWOff_st_m = addNode(-24.0, y, 19.7, fl, 'doorWOff_st_m');
        fn.doorWOff_st_e = addNode(-22.0, y, 19.7, fl, 'doorWOff_st_e');
        connect(fn.wOffice_front, fn.doorWOff_st_w);
        connect(fn.doorWOff_st_w, fn.doorWOff_st_m);
        connect(fn.doorWOff_st_m, fn.doorWOff_st_e);

        // 4. SW STAIRWELL LANDING (x: -24..-16, z: 18..28)
        fn.stairSWLand = addNode(-20.0, y, 19.7, fl, 'stairSWLand');
        connect(fn.doorWOff_st_e, fn.stairSWLand);

        // Door between SW Stairwell Landing and Main Gallery at x = -16.0, z = 19.7
        fn.doorSW_gal_w = addNode(-18.0, y, 19.7, fl, 'doorSW_gal_w');
        fn.doorSW_gal_m = addNode(-16.0, y, 19.7, fl, 'doorSW_gal_m');
        fn.doorSW_gal_e = addNode(-13.5, y, 19.7, fl, 'doorSW_gal_e');
        connect(fn.stairSWLand, fn.doorSW_gal_w);
        connect(fn.doorSW_gal_w, fn.doorSW_gal_m);
        connect(fn.doorSW_gal_m, fn.doorSW_gal_e);
        connect(fn.doorSW_gal_e, fn.gallery_p18);
        connect(fn.doorSW_gal_e, fn.gallery_p22);

        // 5. STAIRWELL NORTH LANDING (x: -4..4, z: -26..-14)
        fn.stairNLand = addNode(0.0, y, -15.4, fl, 'stairNLand');

        // Door from Main Gallery to Stairwell N at x = -4.0, z = -15.4
        fn.doorSN_gal_w = addNode(-7.0, y, -15.4, fl, 'doorSN_gal_w');
        fn.doorSN_gal_m = addNode(-4.0, y, -15.4, fl, 'doorSN_gal_m');
        fn.doorSN_gal_e = addNode(-1.8, y, -15.4, fl, 'doorSN_gal_e');
        connect(fn.gallery_n16, fn.doorSN_gal_w);
        connect(fn.doorSN_gal_w, fn.doorSN_gal_m);
        connect(fn.doorSN_gal_m, fn.doorSN_gal_e);
        connect(fn.doorSN_gal_e, fn.stairNLand);

        // Door from Stairwell N to East Main Hall at x = 4.0, z = -15.4
        fn.doorSN_east_w = addNode(1.8, y, -15.4, fl, 'doorSN_east_w');
        fn.doorSN_east_m = addNode(4.0, y, -15.4, fl, 'doorSN_east_m');
        fn.doorSN_east_e = addNode(6.5, y, -15.4, fl, 'doorSN_east_e');
        connect(fn.stairNLand, fn.doorSN_east_w);
        connect(fn.doorSN_east_w, fn.doorSN_east_m);
        connect(fn.doorSN_east_m, fn.doorSN_east_e);

        // 6. CENTRAL CROSS-HALLWAY (x: -4..4, z: 2.5..7.5, center z = 5.0)
        fn.cross_w_gal = addNode(-6.5, y, 5.0, fl, 'cross_w_gal');
        fn.cross_w_mid = addNode(-4.0, y, 5.0, fl, 'cross_w_mid');
        fn.cross_center= addNode( 0.0, y, 5.0, fl, 'cross_center');
        fn.cross_e_mid = addNode( 4.0, y, 5.0, fl, 'cross_e_mid');
        fn.cross_e_east= addNode( 6.5, y, 5.0, fl, 'cross_e_east');
        connect(fn.gallery_p6, fn.cross_w_gal);
        connect(fn.cross_w_gal, fn.cross_w_mid);
        connect(fn.cross_w_mid, fn.cross_center);
        connect(fn.cross_center, fn.cross_e_mid);
        connect(fn.cross_e_mid, fn.cross_e_east);

        // 7. SOUTH CROSS-PASSAGE (x: -4..4, z: 22.0)
        fn.crossS_w_gal = addNode(-6.5, y, 22.0, fl, 'crossS_w_gal');
        fn.crossS_w_mid = addNode(-4.0, y, 22.0, fl, 'crossS_w_mid');
        fn.crossS_center= addNode( 0.0, y, 22.0, fl, 'crossS_center');
        fn.crossS_e_mid = addNode( 4.0, y, 22.0, fl, 'crossS_e_mid');
        fn.crossS_e_se  = addNode( 6.5, y, 22.0, fl, 'crossS_e_se');
        connect(fn.gallery_p22, fn.crossS_w_gal);
        connect(fn.crossS_w_gal, fn.crossS_w_mid);
        connect(fn.crossS_w_mid, fn.cross_center);
        connect(fn.cross_center, fn.crossS_e_mid);
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

        // Doorways through automatic sliding glass doors into Restrooms
        fn.doorM_rest_mid = addNode(4.0, y, -12.0, fl, 'doorM_rest_mid');
        fn.doorM_rest_in  = addNode(1.5, y, -12.0, fl, 'doorM_rest_in');
        connect(fn.east_w_n12, fn.doorM_rest_mid);
        connect(fn.doorM_rest_mid, fn.doorM_rest_in);

        // Doorway into Women's Restroom at x = 4.0, z = -8.0
        fn.doorW_rest_mid = addNode(4.0, y, -8.0, fl, 'doorW_rest_mid');
        fn.doorW_rest_in  = addNode(1.5, y, -8.0, fl, 'doorW_rest_in');
        connect(fn.east_w_n7, fn.doorW_rest_mid);
        connect(fn.doorW_rest_mid, fn.doorW_rest_in);

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

        // 9. NORTH GALLERY (x: -4..28, z: -40..-26)
        // West Doorway at z = -26, x = 6.0
        fn.doorNGal_w_s = addNode(6.0, y, -23.0, fl, 'doorNGal_w_s');
        fn.doorNGal_w_m = addNode(6.0, y, -26.0, fl, 'doorNGal_w_m');
        fn.doorNGal_w_n = addNode(6.0, y, -29.0, fl, 'doorNGal_w_n');
        connect(fn.east_w_n24, fn.doorNGal_w_s);
        connect(fn.doorNGal_w_s, fn.doorNGal_w_m);
        connect(fn.doorNGal_w_m, fn.doorNGal_w_n);

        // East Doorway at z = -26, x = 18.2
        fn.doorNGal_e_s = addNode(18.2, y, -23.0, fl, 'doorNGal_e_s');
        fn.doorNGal_e_m = addNode(18.2, y, -26.0, fl, 'doorNGal_e_m');
        fn.doorNGal_e_n = addNode(18.2, y, -29.0, fl, 'doorNGal_e_n');
        connect(fn.east_e_n24, fn.doorNGal_e_s);
        connect(fn.doorNGal_e_s, fn.doorNGal_e_m);
        connect(fn.doorNGal_e_m, fn.doorNGal_e_n);

        // North Gallery Internal Grid with bench flanking bypasses
        fn.nGal_w_n33 = addNode( 2.0, y, -33.0, fl, 'nGal_w_n33');
        fn.nGal_c_n30 = addNode(12.0, y, -30.0, fl, 'nGal_c_n30');
        // Flank North Gallery Bench at (12, -33)
        fn.nGal_b_w   = addNode( 8.5, y, -33.0, fl, 'nGal_b_w');
        fn.nGal_b_e   = addNode(15.5, y, -33.0, fl, 'nGal_b_e');
        fn.nGal_c_n35 = addNode(12.0, y, -35.0, fl, 'nGal_c_n35');
        fn.nGal_e_n33 = addNode(22.0, y, -33.0, fl, 'nGal_e_n33');

        // Flanking the plinth at (12, -39) safely
        fn.nGal_plinth_w = addNode( 7.0, y, -39.0, fl, 'nGal_plinth_w');
        fn.nGal_plinth_e = addNode(17.0, y, -39.0, fl, 'nGal_plinth_e');

        connect(fn.doorNGal_w_n, fn.nGal_w_n33);
        connect(fn.doorNGal_w_n, fn.nGal_c_n30);
        connect(fn.doorNGal_e_n, fn.nGal_c_n30);
        connect(fn.doorNGal_e_n, fn.nGal_e_n33);

        connect(fn.nGal_w_n33, fn.nGal_b_w);
        connect(fn.nGal_e_n33, fn.nGal_b_e);

        // Bench bypass connections
        connect(fn.nGal_c_n30, fn.nGal_b_w);
        connect(fn.nGal_c_n30, fn.nGal_b_e);
        connect(fn.nGal_b_w, fn.nGal_c_n35);
        connect(fn.nGal_b_e, fn.nGal_c_n35);

        connect(fn.nGal_c_n35, fn.nGal_plinth_w);
        connect(fn.nGal_c_n35, fn.nGal_plinth_e);

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

        // Immediate glowing crystal placeholder with vibrant emissive aura
        const placeholderMat = new THREE.MeshLambertMaterial({
          color: type.color,
          emissive: type.color,
          emissiveIntensity: 0.75
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
          glowLight: null,
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

      const startGoalEl = document.querySelector('[data-text="start.goal"]');
      if (startGoalEl) {
        startGoalEl.textContent = T('start.goal', `Recover all ${CONFIG.TOTAL_RELICS} relics to unlock the exit.`, { total: CONFIG.TOTAL_RELICS });
      }
    }

    updateRelicFloorVisibility() {
      for (let r of this.relics) {
        const show = (!r.collected && r.floor === this.playerFloor);
        if (r.mesh) {
          r.mesh.visible = show;
        }
      }
      for (let p of this.ammoPickups) {
        const show = (p.active && p.floor === this.playerFloor);
        if (p.mesh) {
          p.mesh.visible = show;
        }
        if (p.glowLight) {
          p.glowLight.visible = show;
          p.glowLight.intensity = show ? 0.80 : 0;
        }
      }
      // Major Performance Optimization: cull all paintings on inactive floors
      // Only render artworks on the player's current floor, eliminating hundreds of draw calls & texture lookups!
      if (this.paintings) {
        for (let p of this.paintings) {
          if (p.mesh) {
            p.mesh.visible = (p.floor === this.playerFloor);
          }
        }
      }
      // Light Culling: Only render point lights for the current active floor!
      // Because every floor has EXACTLY 8 point lights, the active light count is constant.
      // Three.js shader light count NEVER changes, so ZERO shader recompilations occur!
      // And the GPU only processes 8 lights per fragment instead of 55, maintaining locked 60 FPS!
      if (this.floorLights) {
        for (let f = 0; f < 4; f++) {
          const isCurFloor = (f === this.playerFloor);
          if (this.floorLights[f]) {
            for (let l of this.floorLights[f]) {
              l.visible = isCurFloor;
              l.intensity = isCurFloor ? (l._origIntensity ?? 0.5) : 0;
            }
          }
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

      this.gltfLoader = this.gltfLoader || new THREE.GLTFLoader();

      AMMO_LOCS.forEach((loc, idx) => {
        const group = new THREE.Group();
        group.position.set(loc.x, loc.baseY, loc.z);

        // Immediate lightweight placeholder while GLB loads
        const placeholderMat = new THREE.MeshLambertMaterial({ color: 0x22c55e, emissive: 0x16a34a, emissiveIntensity: 0.45 });
        const placeholder = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.22, 0.28), placeholderMat);
        placeholder.position.y = 0.12;
        group.add(placeholder);

        // Radioactive shaky green tactical glow kept directly in scene with constant visibility so Three.js shader light count never changes
        const glow = new THREE.PointLight(0x22ff55, (loc.floor === this.playerFloor) ? 0.80 : 0, 3.8);
        glow._origIntensity = 0.80;
        glow.position.set(loc.x, loc.baseY + 0.22, loc.z);
        this.scene.add(glow);

        group.visible = (loc.floor === this.playerFloor);
        this.scene.add(group);

        const pickupEntry = {
          id: idx + 1,
          floor: loc.floor,
          x: loc.x,
          y: loc.baseY,
          z: loc.z,
          mesh: group,
          glowLight: glow,
          active: true,
          respawnTimer: 0
        };
        this.ammoPickups.push(pickupEntry);

        // Load cushioning.glb as the 3D ammo pickup model
        const ammoCacheKey = window._ASSET_VERSION || Date.now();
        this.gltfLoader.load(
          `assets/cushioning.glb?v=${ammoCacheKey}`,
          (gltf) => {
            if (!pickupEntry.active) return;
            const model = gltf.scene;
            model.updateMatrixWorld(true);

            // Compute exact bounding box and center
            const box = new THREE.Box3().setFromObject(model);
            const size = new THREE.Vector3();
            box.getSize(size);
            const center = new THREE.Vector3();
            box.getCenter(center);

            const maxAxis = Math.max(size.x, size.y, size.z) || 1.0;
            const targetDim = 0.52; // 52cm uniform scale for comfortable world visibility
            const scale = targetDim / maxAxis;
            model.scale.set(scale, scale, scale);

            // Center horizontally and vertically around local origin
            model.position.set(-center.x * scale, -center.y * scale + 0.12, -center.z * scale);

            model.traverse((child) => {
              if (child.isMesh) {
                child.frustumCulled = true;
                if (child.geometry) {
                  child.geometry.computeBoundingSphere();
                }
                const oldMat = child.material;
                if (oldMat) {
                  const optMat = new THREE.MeshPhongMaterial({
                    map: oldMat.map || null,
                    color: oldMat.color || 0xffffff,
                    emissive: 0x00cc44,
                    emissiveIntensity: 0.22,
                    specular: 0x44aa44,
                    shininess: 35,
                    side: THREE.FrontSide
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

            if (placeholder.parent) {
              group.remove(placeholder);
            }
            group.add(model);
          },
          undefined,
          (err) => {
            console.warn('Could not load cushioning.glb for ammo pickup', err);
          }
        );
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
          if (p.glowLight) {
            p.glowLight.visible = sameFloor;
            if (sameFloor) {
              const shake = (Math.random() - 0.5) * 0.24;
              const flicker = Math.sin(time * 36.0 + p.id * 7.3) * 0.16 + Math.cos(time * 54.0 + p.id * 3.1) * 0.10;
              p.glowLight.intensity = Math.max(0.25, 0.80 + flicker + shake);
              p.glowLight.position.x = p.x + (Math.random() - 0.5) * 0.06;
              p.glowLight.position.z = p.z + (Math.random() - 0.5) * 0.06;
              p.glowLight.position.y = (p.mesh.position.y + 0.22) + (Math.random() - 0.5) * 0.04;
            } else {
              p.glowLight.intensity = 0;
            }
          }
        } else {
          if (p.glowLight) {
            p.glowLight.intensity = 0;
            p.glowLight.visible = false;
          }
          // 3-minute respawn countdown (180s)
          p.respawnTimer -= delta;
          if (p.respawnTimer <= 0) {
            p.active = true;
            const sameFloor = (p.floor === this.playerFloor);
            p.mesh.visible = sameFloor;
            if (p.glowLight) {
              p.glowLight.visible = sameFloor;
              p.glowLight.intensity = sameFloor ? 0.80 : 0;
            }
          }
        }
      }
    }

    collectAmmoPickup(pickup) {
      if (!pickup.active) return;
      pickup.active = false;
      pickup.mesh.visible = false;
      if (pickup.glowLight) {
        pickup.glowLight.intensity = 0;
        pickup.glowLight.visible = false;
      }
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
            this.smittyMesh.visible = !this.smittyEnabled ? false : (this.isSmittyXray ? true : (this.smittyFloor === this.playerFloor));
            this.smittyMesh.scale.set(1.2, 1.2, 1.2);

            this.smittyBones = {};
            this.smittyXrayGroup = new THREE.Group();
            this.smittyXrayGroup.visible = this.isSmittyXray;

            this.smittyXrayFillMat = new THREE.MeshBasicMaterial({
              color: 0xff1e38,
              transparent: true,
              opacity: 0.50,
              depthTest: true,
              depthFunc: THREE.GreaterDepth,
              depthWrite: false,
              polygonOffset: true,
              polygonOffsetFactor: -1.0,
              polygonOffsetUnits: -1.0,
              side: THREE.DoubleSide
            });

            this.smittyXrayWireMat = new THREE.MeshBasicMaterial({
              color: 0xff3b52,
              wireframe: true,
              transparent: true,
              opacity: 0.85,
              depthTest: true,
              depthFunc: THREE.GreaterDepth,
              depthWrite: false,
              polygonOffset: true,
              polygonOffsetFactor: -1.0,
              polygonOffsetUnits: -1.0
            });

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

                // Build X-ray occluded wall-hack overlay meshes
                if (child.isSkinnedMesh) {
                  const fillMesh = new THREE.SkinnedMesh(child.geometry, this.smittyXrayFillMat);
                  fillMesh.bind(child.skeleton, child.bindMatrix);
                  fillMesh.renderOrder = 999;
                  fillMesh.frustumCulled = false;
                  fillMesh.position.copy(child.position);
                  fillMesh.quaternion.copy(child.quaternion);
                  fillMesh.scale.copy(child.scale);
                  this.smittyXrayGroup.add(fillMesh);

                  const wireMesh = new THREE.SkinnedMesh(child.geometry, this.smittyXrayWireMat);
                  wireMesh.bind(child.skeleton, child.bindMatrix);
                  wireMesh.renderOrder = 1000;
                  wireMesh.frustumCulled = false;
                  wireMesh.position.copy(child.position);
                  wireMesh.quaternion.copy(child.quaternion);
                  wireMesh.scale.copy(child.scale);
                  this.smittyXrayGroup.add(wireMesh);
                } else {
                  const fillMesh = new THREE.Mesh(child.geometry, this.smittyXrayFillMat);
                  fillMesh.renderOrder = 999;
                  fillMesh.frustumCulled = false;
                  fillMesh.position.copy(child.position);
                  fillMesh.quaternion.copy(child.quaternion);
                  fillMesh.scale.copy(child.scale);
                  this.smittyXrayGroup.add(fillMesh);

                  const wireMesh = new THREE.Mesh(child.geometry, this.smittyXrayWireMat);
                  wireMesh.renderOrder = 1000;
                  wireMesh.frustumCulled = false;
                  wireMesh.position.copy(child.position);
                  wireMesh.quaternion.copy(child.quaternion);
                  wireMesh.scale.copy(child.scale);
                  this.smittyXrayGroup.add(wireMesh);
                }
              }
              if (child.isBone) {
                this.smittyBones[child.name] = child;
              }
            });

            this.smittyMesh.add(this.smittyXrayGroup);

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
            if (!this.smittyEnabled) {
              if (this.smittyMesh) this.smittyMesh.visible = false;
              if (this.smittyXrayGroup) this.smittyXrayGroup.visible = false;
            }
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
        this.smittyMesh.visible = !this.smittyEnabled ? false : (this.isSmittyXray ? true : (this.smittyFloor === this.playerFloor));
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
      document.documentElement.classList.add('game-playing');
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
          if (p && typeof p.catch === 'function') {
            p.catch(() => {
              if (document.body && document.body.requestPointerLock && el !== document.body) {
                try {
                  const p2 = document.body.requestPointerLock();
                  if (p2 && typeof p2.catch === 'function') p2.catch(() => {});
                } catch (e2) {}
              }
            });
          }
        }
      } catch (e) {}
    }

    releaseNativeOrBrowserLock() {
      document.documentElement.classList.remove('game-playing');
      document.body.classList.remove('game-playing');
      document.documentElement.classList.remove('pointer-locked');
      document.body.classList.remove('pointer-locked');
      this.lastClientX = null;
      this.lastClientY = null;
      try {
        if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.pointerLock) {
          window.webkit.messageHandlers.pointerLock.postMessage(false);
        }
      } catch (e) {}
      try {
        if (document.exitPointerLock && (document.pointerLockElement || this.isPointerLocked)) {
          document.exitPointerLock();
        }
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
        if (this.isNativeLocked) {
          document.documentElement.classList.add('pointer-locked');
          document.body.classList.add('pointer-locked');
        } else {
          document.documentElement.classList.remove('pointer-locked');
          document.body.classList.remove('pointer-locked');
        }
      };

      window._onNativeMouseLook = (dx, dy) => {
        this.applyMouseLook(dx, dy);
      };

      const unlockAudio = () => {
        if (this.audio) {
          if (!this.audio.initialized) this.audio.init();
          if (this.audio.ctx && this.audio.ctx.state === 'suspended') {
            this.audio.ctx.resume().catch(() => {});
          }
          if (!this.gameStarted || this.isPaused || this.isVictory) {
            this.audio.playMenuMusic();
          }
        }
      };
      window.addEventListener('pointerdown', unlockAudio);
      window.addEventListener('keydown', unlockAudio);

      this.dom.startBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.dom.startScreen.classList.add('hidden');
        this.gameStarted = true;
        this.startTime = Date.now();
        this.keys = {};
        this.isSprinting = false;
        this.stamina = CONFIG.PLAYER.MAX_STAMINA;
        this.audio.init();
        this.audio.startGameplayAudio();
        this.audio.fadeOutMenuMusic(0.45);
        this.setSmittyMode(this.smittyEnabled);
        this.showFloorNotification(this.playerFloor);
        this.updateHud();
        this.requestNativeOrBrowserLock();
      });

      this.dom.resumeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.resumeGame();
      });

      if (this.dom.pauseModal) {
        this.dom.pauseModal.addEventListener('click', (e) => {
          if (e.target === this.dom.pauseModal) {
            e.stopPropagation();
          }
        });
      }

      if (this.dom.pauseOptionsBtn) {
        this.dom.pauseOptionsBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.dom.pauseModal.classList.add('hidden');
          this.openOptionsModal();
        });
      }

      if (this.dom.pauseSettingsBtn) {
        this.dom.pauseSettingsBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.dom.pauseModal.classList.add('hidden');
          this.openSettingsModal();
        });
      }

      if (this.dom.pauseAboutBtn) {
        this.dom.pauseAboutBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.dom.pauseModal.classList.add('hidden');
          this.openAboutModal();
        });
      }

      if (this.dom.victoryAboutBtn) {
        this.dom.victoryAboutBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.openAboutModal();
        });
      }

      this.dom.artCloseBtn.addEventListener('click', () => {
        this.closeArtModal();
      });
      if (this.dom.artModal) {
        this.dom.artModal.addEventListener('click', (e) => {
          if (e.target === this.dom.artModal) {
            e.stopPropagation();
            this.closeArtModal();
          }
        });
      }

      // Start Screen Options & Settings Bubbles
      if (this.dom.optionsBubbleBtn) {
        this.dom.optionsBubbleBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.openOptionsModal();
        });
      }
      if (this.dom.optionsCloseBtn) {
        this.dom.optionsCloseBtn.addEventListener('click', () => this.closeOptionsModal());
      }
      if (this.dom.optionsBackBtn) {
        this.dom.optionsBackBtn.addEventListener('click', () => this.closeOptionsModal());
      }
      if (this.dom.optionsModal) {
        this.dom.optionsModal.addEventListener('click', (e) => {
          if (e.target === this.dom.optionsModal) {
            e.stopPropagation();
            this.closeOptionsModal();
          }
        });
      }

      if (this.dom.settingsBubbleBtn) {
        this.dom.settingsBubbleBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.openSettingsModal();
        });
      }
      if (this.dom.settingsCloseBtn) {
        this.dom.settingsCloseBtn.addEventListener('click', () => this.closeSettingsModal());
      }
      if (this.dom.settingsBackBtn) {
        this.dom.settingsBackBtn.addEventListener('click', () => this.closeSettingsModal());
      }
      if (this.dom.settingsModal) {
        this.dom.settingsModal.addEventListener('click', (e) => {
          if (e.target === this.dom.settingsModal) {
            e.stopPropagation();
            this.closeSettingsModal();
          }
        });
      }

      if (this.dom.aboutBubbleBtn) {
        this.dom.aboutBubbleBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.openAboutModal();
        });
      }
      if (this.dom.aboutCloseBtn) {
        this.dom.aboutCloseBtn.addEventListener('click', () => this.closeAboutModal());
      }
      if (this.dom.aboutBackBtn) {
        this.dom.aboutBackBtn.addEventListener('click', () => this.closeAboutModal());
      }
      if (this.dom.aboutModal) {
        this.dom.aboutModal.addEventListener('click', (e) => {
          if (e.target === this.dom.aboutModal) {
            e.stopPropagation();
            this.closeAboutModal();
          }
        });
      }

      // Smitty Mode Toggles: Survival Horror vs Daytime Museum Tour
      const handleSmittyToggle = (enabled) => {
        this.setSmittyMode(enabled);
      };

      if (this.dom.smittyOnBtn) this.dom.smittyOnBtn.addEventListener('click', () => handleSmittyToggle(true));
      if (this.dom.smittyOffBtn) this.dom.smittyOffBtn.addEventListener('click', () => handleSmittyToggle(false));
      if (this.dom.optionsSmittyOnBtn) this.dom.optionsSmittyOnBtn.addEventListener('click', () => handleSmittyToggle(true));
      if (this.dom.optionsSmittyOffBtn) this.dom.optionsSmittyOffBtn.addEventListener('click', () => handleSmittyToggle(false));

      // Music Mode Toggles
      if (this.dom.optionsMusicOnBtn) {
        this.dom.optionsMusicOnBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.setMusicMode(true);
        });
      }
      if (this.dom.optionsMusicOffBtn) {
        this.dom.optionsMusicOffBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.setMusicMode(false);
        });
      }

      // Quit Buttons
      const quitBtns = [
        this.dom.startQuitBtn,
        this.dom.pauseQuitBtn,
        this.dom.gameoverQuitBtn,
        this.dom.victoryQuitBtn
      ];
      quitBtns.forEach((btn) => {
        if (btn) {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.quitGame();
          });
        }
      });

      // Objective Modal Close Button & Backdrop Click
      if (this.dom.objectiveCloseBtn) {
        this.dom.objectiveCloseBtn.addEventListener('click', () => this.closeObjectiveModal());
      }
      if (this.dom.objModal) {
        this.dom.objModal.addEventListener('click', (e) => {
          if (e.target === this.dom.objModal) this.closeObjectiveModal();
        });
      }

      // Browser safety: prevent accidental page unload during active gameplay
      window.addEventListener('beforeunload', (e) => {
        if (this.isQuitting) return;
        if (this.gameStarted && !this.isGameOver && !this.isVictory) {
          e.preventDefault();
          e.returnValue = '';
        }
      });

      window.addEventListener('click', () => {
        if (this.gameStarted && !this.isExaminingArt && !this.isObjectiveModalOpen && !this.isOptionsModalOpen && !this.isSettingsModalOpen && !this.isAboutModalOpen && !this.isPaused && !this.isGameOver && !this.isVictory) {
          if (!this.isPointerLocked && !this.isNativeLocked) {
            this.requestNativeOrBrowserLock();
          }
        }
      });

      const restart = () => {
        this.releaseNativeOrBrowserLock();
        window.location.reload();
      };
      this.dom.restartBtn.addEventListener('click', restart);
      this.dom.winRestartBtn.addEventListener('click', restart);

      const onLockChange = () => {
        const wasLocked = this.isPointerLocked;
        this.isPointerLocked = !!(document.pointerLockElement === this.canvas || document.pointerLockElement);
        this.lastClientX = null;
        this.lastClientY = null;
        this.skipNextMouseMove = true;

        if (this.isPointerLocked) {
          const wasPaused = this.isPaused;
          document.documentElement.classList.add('pointer-locked');
          document.body.classList.add('pointer-locked');
          if (this.dom.pauseModal) this.dom.pauseModal.classList.add('hidden');
          if (this.dom.optionsModal) this.dom.optionsModal.classList.add('hidden');
          if (this.dom.settingsModal) this.dom.settingsModal.classList.add('hidden');
          if (this.dom.aboutModal) this.dom.aboutModal.classList.add('hidden');
          this.isPaused = false;
          this.isOptionsModalOpen = false;
          this.isSettingsModalOpen = false;
          this.isAboutModalOpen = false;
          if (wasPaused && this.audio) {
            this.audio.fadeOutMenuMusic(0.45);
            this.audio.resumeGameplayAudio();
          }
        } else {
          document.documentElement.classList.remove('pointer-locked');
          document.body.classList.remove('pointer-locked');
        }

        // If pointer lock was lost while actively playing and no menu is open, pause the game
        if (wasLocked && !this.isPointerLocked) {
          // Suppress re-pausing immediately after unpausing (transient browser lock exit)
          if (performance.now() - (this.lastResumeTime || 0) < 400) {
            return;
          }
          if (this.gameStarted && !this.isGameOver && !this.isVictory && !this.isExaminingArt &&
              !this.isObjectiveModalOpen && !this.isOptionsModalOpen && !this.isSettingsModalOpen && !this.isAboutModalOpen && !this.isPaused) {
            this.pauseGame();
            this.lastPointerLockExitTime = performance.now();
          }
        }
      };

      document.addEventListener('pointerlockchange', onLockChange);
      document.addEventListener('mozpointerlockchange', onLockChange);
      document.addEventListener('webkitpointerlockchange', onLockChange);
      document.addEventListener('pointerlockerror', () => {
        this.isPointerLocked = false;
        document.documentElement.classList.remove('pointer-locked');
        document.body.classList.remove('pointer-locked');
        if (this.isPaused || !this.gameStarted) {
          document.documentElement.classList.remove('game-playing');
          document.body.classList.remove('game-playing');
        }
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
        this.keys = {};
        this.isSprinting = false;
      });

      window.addEventListener('focus', () => {
        this.keys = {};
        this.isSprinting = false;
      });

      window.addEventListener('mousemove', (e) => {
        if (!this.gameStarted || this.isPaused || this.isGameOver || this.isVictory || this.isExaminingArt || this.isObjectiveModalOpen || this.isOptionsModalOpen || this.isSettingsModalOpen || this.isAboutModalOpen) {
          this.lastClientX = null;
          this.lastClientY = null;
          return;
        }

        if (this.isNativeLocked) return;

        let rawMx = e.movementX ?? e.mozMovementX ?? e.webkitMovementX ?? 0;
        let rawMy = e.movementY ?? e.mozMovementY ?? e.webkitMovementY ?? 0;
        if (rawMx === 0 && rawMy === 0 && this.lastClientX !== null && this.lastClientY !== null) {
          rawMx = e.clientX - this.lastClientX;
          rawMy = e.clientY - this.lastClientY;
        }

        this.lastClientX = e.clientX;
        this.lastClientY = e.clientY;
        this.applyMouseLook(rawMx, rawMy);
      });

      window.addEventListener('mousedown', (e) => {
        if (!this.gameStarted || this.isPaused || this.isGameOver || this.isVictory || this.isExaminingArt || this.isObjectiveModalOpen || this.isOptionsModalOpen || this.isSettingsModalOpen || this.isAboutModalOpen) return;

        // Ensure browser lock is requested if not locked, without blocking gameplay action
        if (!this.isPointerLocked && !this.isNativeLocked) {
          this.requestNativeOrBrowserLock();
        }

        if (e.button === 0) {
          if (this.heldCrate) {
            this.throwHeldCrate();
          } else {
            this.shootPistol();
          }
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
        const isKeyB = (e.code === 'KeyB' || (e.key && e.key.toLowerCase() === 'b'));
        const isKeyV = (e.code === 'KeyV' || (e.key && e.key.toLowerCase() === 'v'));
        const isKeyH = (e.code === 'KeyH' || (e.key && e.key.toLowerCase() === 'h'));
        const isSpectatorToggle = (
          e.code === 'Backquote' ||
          e.key === '`' ||
          e.key === '~' ||
          e.code === 'F2' ||
          (isCmdOrCtrl && isKeyB)
        );

        // Prevent browser tab close (Ctrl+W on Windows/Linux or Cmd+W) while crouching and holding W
        if (isCmdOrCtrl && (e.code === 'KeyW' || (e.key && e.key.toLowerCase() === 'w'))) {
          e.preventDefault();
        }

        // Spectator Mode toggle: Backquote (` or ~) / F2 (replaces Cmd+N so Chrome does not open a new tab/window)
        if (isSpectatorToggle) {
          e.preventDefault();
          if (this.gameStarted) {
            this.toggleSpectatorMode();
          }
          return;
        }

        // In Spectator Mode:
        if (this.isSpectatorMode && !isCmdOrCtrl) {
          // Flight / No-Clip Mode toggle: pressing 'V'
          if (isKeyV) {
            e.preventDefault();
            if (this.gameStarted) {
              this.toggleNoClipMode();
            }
            return;
          }

          // Curator Red Outline toggle: pressing 'B'
          if (isKeyB) {
            e.preventDefault();
            if (this.gameStarted) {
              this.toggleSmittyXray();
            }
            return;
          }

          // Hide HUD, examine/pickup notifications, and arms: pressing 'H'
          if (isKeyH) {
            e.preventDefault();
            if (this.gameStarted) {
              this.toggleSpectatorHud();
            }
            return;
          }
        }

        if (!e.metaKey) {
          e.preventDefault();
        }
        this.keys[e.code] = true;
        if (e.repeat) return;

        // Ensure pointer lock is re-acquired immediately whenever player touches any movement/action key after unpausing
        const isMovementOrActionKey = (
          e.code === 'KeyW' || e.code === 'KeyA' || e.code === 'KeyS' || e.code === 'KeyD' ||
          e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight' ||
          e.code === 'ArrowUp' || e.code === 'ArrowDown' || e.code === 'ArrowLeft' || e.code === 'ArrowRight'
        );
        if (isMovementOrActionKey && this.gameStarted && !this.isPaused && !this.isExaminingArt &&
            !this.isObjectiveModalOpen && !this.isOptionsModalOpen && !this.isSettingsModalOpen && !this.isGameOver && !this.isVictory) {
          if (!this.isPointerLocked && !this.isNativeLocked) {
            this.requestNativeOrBrowserLock();
          }
        }

        if (e.code === 'KeyP') {
          if (this.gameStarted) this.togglePause();
        } else if (e.code === 'Tab') {
          if (this.gameStarted) {
            this.toggleObjectiveModal();
          }
        } else if (e.code === 'KeyF') {
          if (this.gameStarted) this.toggleFlashlight();
        } else if (e.code === 'KeyR') {
          if (this.gameStarted) {
            this.reloadPistol();
          }
        } else if (e.code === 'KeyE') {
          if (this.isExaminingArt) {
            this.closeArtModal();
          } else if (this.isObjectiveModalOpen) {
            this.closeObjectiveModal();
          } else if (this.gameStarted) {
            if (!this.heldCrate && this.tryPickupCrate()) {
              return;
            }
            this.interact();
          }
        } else if (e.code === 'Escape') {
          e.preventDefault();
          if (performance.now() - (this.lastPointerLockExitTime || 0) < 300) {
            return;
          }
          if (this.isExaminingArt) {
            this.closeArtModal();
          } else if (this.isObjectiveModalOpen) {
            this.closeObjectiveModal();
          } else if (this.isOptionsModalOpen) {
            this.closeOptionsModal();
          } else if (this.isSettingsModalOpen) {
            this.closeSettingsModal();
          } else if (this.isAboutModalOpen) {
            this.closeAboutModal();
          } else if (this.gameStarted) {
            // Escape only pauses the game, never unpauses
            if (!this.isPaused) {
              this.pauseGame();
            }
          }
        }
      });

      window.addEventListener('keypress', (e) => {
        if (!e.metaKey && ['Space'].includes(e.code)) e.preventDefault();
      });

      window.addEventListener('keyup', (e) => {
        this.keys[e.code] = false;
        if (e.code === 'KeyE') {
          if (this.heldCrate) {
            this.dropHeldCrate();
          }
        }
        if (e.key === 'Shift') {
          this.keys['ShiftLeft'] = false;
          this.keys['ShiftRight'] = false;
          this.isSprinting = false;
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
      drawRoomBox(-16, -18, -4, 28, T('map.label.buffoon_gallery', 'BUFFOON GALLERY'));
      drawRoomBox(-4, -26, 4, -14, T('map.label.stair_b', 'STAIR B'), true);
      drawRoomBox(-4, -14, 4, 2, T('map.label.study_wc', 'STUDY/WC'));
      drawRoomBox(-4, -40, 28, -26, T('map.label.north_gallery', 'NORTH GALLERY'));
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

    pauseGame() {
      if (this.isPaused) return;
      this.isPaused = true;
      document.documentElement.classList.remove('game-playing');
      document.body.classList.remove('game-playing');
      this.releaseNativeOrBrowserLock();
      this.dom.pauseModal.classList.remove('hidden');
      if (this.audio) {
        this.audio.pauseGameplayAudio();
        this.audio.playMenuMusic();
      }
    }

    resumeGame() {
      this.isPaused = false;
      this.isOptionsModalOpen = false;
      this.isSettingsModalOpen = false;
      this.isAboutModalOpen = false;
      this.keys = {};
      this.isSprinting = false;
      this.lastResumeTime = performance.now();
      document.documentElement.classList.add('game-playing');
      document.body.classList.add('game-playing');
      if (this.dom.pauseModal) this.dom.pauseModal.classList.add('hidden');
      if (this.dom.optionsModal) this.dom.optionsModal.classList.add('hidden');
      if (this.dom.settingsModal) this.dom.settingsModal.classList.add('hidden');
      if (this.dom.aboutModal) this.dom.aboutModal.classList.add('hidden');
      if (this.audio) {
        this.audio.fadeOutMenuMusic(0.45);
        this.audio.resumeGameplayAudio();
      }
      this.requestNativeOrBrowserLock();
    }

    togglePause() {
      if (!this.isPaused) {
        this.pauseGame();
      }
    }

    openObjectiveModal() {
      this.isObjectiveModalOpen = true;
      this.releaseNativeOrBrowserLock();
      this.drawFloorplanMinimap();
      this.dom.objModal.classList.remove('hidden');
    }

    closeObjectiveModal() {
      this.isObjectiveModalOpen = false;
      this.dom.objModal.classList.add('hidden');
      if (this.gameStarted && !this.isExaminingArt && !this.isOptionsModalOpen && !this.isSettingsModalOpen && !this.isPaused && !this.isGameOver && !this.isVictory) {
        this.requestNativeOrBrowserLock();
      }
    }

    toggleObjectiveModal() {
      if (this.isObjectiveModalOpen) {
        this.closeObjectiveModal();
      } else {
        this.openObjectiveModal();
      }
    }

    openOptionsModal() {
      this.isOptionsModalOpen = true;
      this.dom.optionsModal.classList.remove('hidden');
    }

    closeOptionsModal() {
      this.isOptionsModalOpen = false;
      this.dom.optionsModal.classList.add('hidden');
      if (this.isPaused) {
        this.dom.pauseModal.classList.remove('hidden');
      } else if (this.gameStarted && !this.isExaminingArt && !this.isObjectiveModalOpen && !this.isGameOver && !this.isVictory) {
        this.requestNativeOrBrowserLock();
      }
    }

    openSettingsModal() {
      this.isSettingsModalOpen = true;
      this.dom.settingsModal.classList.remove('hidden');
    }

    closeSettingsModal() {
      this.isSettingsModalOpen = false;
      this.dom.settingsModal.classList.add('hidden');
      if (this.isPaused) {
        this.dom.pauseModal.classList.remove('hidden');
      } else if (this.gameStarted && !this.isExaminingArt && !this.isObjectiveModalOpen && !this.isGameOver && !this.isVictory) {
        this.requestNativeOrBrowserLock();
      }
    }

    openAboutModal() {
      this.isAboutModalOpen = true;
      if (this.dom.aboutModal) this.dom.aboutModal.classList.remove('hidden');
    }

    closeAboutModal() {
      this.isAboutModalOpen = false;
      if (this.dom.aboutModal) this.dom.aboutModal.classList.add('hidden');
      if (this.isPaused) {
        if (this.dom.pauseModal) this.dom.pauseModal.classList.remove('hidden');
      } else if (this.gameStarted && !this.isExaminingArt && !this.isObjectiveModalOpen && !this.isGameOver && !this.isVictory) {
        this.requestNativeOrBrowserLock();
      }
    }

    setSmittyMode(enabled) {
      this.smittyEnabled = !!enabled;
      this.updateSmittyModeUI();

      if (this.ambientLight && this.hemiLight) {
        if (!this.smittyEnabled) {
          // Daytime Museum Tour: Natural warm gallery illumination, soft ceiling bounce
          this.ambientLight.color.setHex(0x9a8f82);
          this.ambientLight.intensity = 0.62;
          this.hemiLight.color.setHex(0xc8bdaf);
          this.hemiLight.groundColor.setHex(0x5a483a);
          this.hemiLight.intensity = 0.35;
          if (this.daytimeSunLight) this.daytimeSunLight.visible = false;
          this.renderer.toneMappingExposure = 0.98;

          if (this.smittyMesh) {
            this.smittyMesh.visible = false;
          }
          if (this.smittyXrayGroup) {
            this.smittyXrayGroup.visible = false;
          }
          if (this.dom.vignetteOverlay) {
            this.dom.vignetteOverlay.style.opacity = '0.04';
          }
          this.audio.setHeartbeatBpm(0);
        } else {
          // Survival Horror Mode: Dark atmospheric lighting
          this.ambientLight.color.setHex(0x2d3648);
          this.ambientLight.intensity = 0.50;
          this.hemiLight.color.setHex(0x4a5a78);
          this.hemiLight.groundColor.setHex(0x1a1612);
          this.hemiLight.intensity = 0.30;
          if (this.daytimeSunLight) this.daytimeSunLight.visible = false;
          this.renderer.toneMappingExposure = 1.0;

          if (this.dom.vignetteOverlay) {
            this.dom.vignetteOverlay.style.opacity = '';
          }
        }
      }
    }

    updateSmittyModeUI() {
      const onBtns = [this.dom.smittyOnBtn, this.dom.optionsSmittyOnBtn];
      const offBtns = [this.dom.smittyOffBtn, this.dom.optionsSmittyOffBtn];

      onBtns.forEach((btn) => {
        if (!btn) return;
        if (this.smittyEnabled) {
          btn.classList.add('active');
          btn.setAttribute('aria-pressed', 'true');
        } else {
          btn.classList.remove('active');
          btn.setAttribute('aria-pressed', 'false');
        }
      });

      offBtns.forEach((btn) => {
        if (!btn) return;
        if (!this.smittyEnabled) {
          btn.classList.add('active');
          btn.setAttribute('aria-pressed', 'true');
        } else {
          btn.classList.remove('active');
          btn.setAttribute('aria-pressed', 'false');
        }
      });
    }

    setMusicMode(enabled) {
      this.musicEnabled = !!enabled;
      if (this.audio) {
        this.audio.setMusicEnabled(this.musicEnabled);
        if (this.musicEnabled && (!this.gameStarted || this.isPaused || this.isVictory)) {
          this.audio.playMenuMusic();
        }
      }
      this.updateMusicModeUI();
    }

    updateMusicModeUI() {
      const onBtn = this.dom.optionsMusicOnBtn;
      const offBtn = this.dom.optionsMusicOffBtn;
      if (onBtn) {
        if (this.musicEnabled) {
          onBtn.classList.add('active');
          onBtn.setAttribute('aria-pressed', 'true');
        } else {
          onBtn.classList.remove('active');
          onBtn.setAttribute('aria-pressed', 'false');
        }
      }
      if (offBtn) {
        if (!this.musicEnabled) {
          offBtn.classList.add('active');
          offBtn.setAttribute('aria-pressed', 'true');
        } else {
          offBtn.classList.remove('active');
          offBtn.setAttribute('aria-pressed', 'false');
        }
      }
    }

    openControlsModal() {
      this.openSettingsModal();
    }

    closeControlsModal() {
      this.closeSettingsModal();
    }

    quitGame() {
      this.isQuitting = true;
      try {
        if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.quit) {
          window.webkit.messageHandlers.quit.postMessage(true);
        }
      } catch (e) {}

      try {
        window.open('', '_self', '');
      } catch (e) {}
      try {
        window.close();
      } catch (e) {}
      try {
        self.close();
      } catch (e) {}
      try {
        window.top.close();
      } catch (e) {}

      setTimeout(() => {
        try {
          window.location.href = 'about:blank';
        } catch (e) {}
      }, 150);
    }

    toggleFlashlight() {
      this.flashlightOn = !this.flashlightOn;
      this.flashlight.intensity = this.flashlightOn ? 1.65 : 0;
      this.audio.playFlashlightClick();
      this.leftHandShakeTimer = 0.35; // Tactile hand tremor/shake when toggling flashlight
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
      this.exitDoorsOpening = true;
      this.audio.playLockdownDisengaged();

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

      _tempForward.set(-Math.sin(this.playerYaw), 0, -Math.cos(this.playerYaw));
      _tempRight.set(Math.cos(this.playerYaw), 0, -Math.sin(this.playerYaw));
      _tempMoveDir.set(0, 0, 0);

      if (this.keys['KeyW'] || this.keys['ArrowUp']) _tempMoveDir.add(_tempForward);
      if (this.keys['KeyS'] || this.keys['ArrowDown']) _tempMoveDir.sub(_tempForward);
      if (this.keys['KeyD'] || this.keys['ArrowRight']) _tempMoveDir.add(_tempRight);
      if (this.keys['KeyA'] || this.keys['ArrowLeft']) _tempMoveDir.sub(_tempRight);

      const isMoving = _tempMoveDir.lengthSq() > 0.001;
      const isCrouching = !!(this.keys['KeyC'] || this.keys['ControlLeft'] || this.keys['ControlRight']);
      this.isCrouching = isCrouching;

      const wantsSprint = isMoving && (this.keys['ShiftLeft'] || this.keys['ShiftRight']) && !isCrouching;
      if (wantsSprint && this.stamina > 5) {
        this.isSprinting = true;
        this.stamina = Math.max(0, this.stamina - delta * 22);
      } else {
        this.isSprinting = false;
        this.stamina = Math.min(CONFIG.PLAYER.MAX_STAMINA, this.stamina + delta * 16);
      }

      const baseSpeed = isCrouching
        ? CONFIG.PLAYER.CROUCH_SPEED
        : (this.isSprinting ? CONFIG.PLAYER.SPRINT_SPEED : CONFIG.PLAYER.WALK_SPEED);

      // Sprint-jump momentum boost: extra speed while airborne during a running jump
      const moveSpeed = (this.isSprinting && !this.isGrounded && !isCrouching)
        ? baseSpeed * 1.18
        : baseSpeed;

      const oldPx = this.playerPos.x;
      const oldPz = this.playerPos.z;

      if (isMoving) {
        _tempMoveDir.normalize();

        const subSteps = 2;
        const stepDt = delta / subSteps;
        for (let s = 0; s < subSteps; s++) {
          this.playerPos.x += _tempMoveDir.x * moveSpeed * stepDt;
          this.playerPos.z += _tempMoveDir.z * moveSpeed * stepDt;
          const currentFootElevation = (this.playerPos.y - this.currentCamHeight) + this.jumpOffset;
          this.resolveCollisions(this.playerPos, CONFIG.PLAYER.RADIUS, this.playerFloor, currentFootElevation);
        }

        if (isNaN(this.playerPos.x) || isNaN(this.playerPos.z)) {
          this.playerPos.x = oldPx;
          this.playerPos.z = oldPz;
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

      const elev = this.updateStairwellElevation(this.playerPos, this.playerStairState, this.playerFloor);
      if (elev.floor !== this.playerFloor) {
        this.playerFloor = elev.floor;
        this.showFloorNotification(this.playerFloor);
      } else {
        this.playerFloor = elev.floor;
      }

      // Check platform standing surface (benches, plinths, desks, crates)
      const platformSurfaceY = this.getPlatformSurfaceY(this.playerPos.x, this.playerPos.z, this.playerFloor);
      const groundY = Math.max(elev.y, platformSurfaceY);

      const targetEyeH = isCrouching ? CONFIG.PLAYER.CROUCH_HEIGHT : CONFIG.PLAYER.CAMERA_HEIGHT;
      this.currentCamHeight = THREE.MathUtils.lerp(this.currentCamHeight, targetEyeH, Math.min(1, delta * 12));

      const targetCamY = groundY + this.currentCamHeight;

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
      } else if (!this.isGrounded) {
        this.jumpVelocity -= CONFIG.PLAYER.GRAVITY * delta;
        this.jumpOffset += this.jumpVelocity * delta;
        const currentFootY = (this.playerPos.y - this.currentCamHeight) + this.jumpOffset;
        if (currentFootY <= groundY) {
          // Landed on floor or platform!
          this.jumpOffset = 0;
          this.jumpVelocity = 0;
          this.isGrounded = true;
          this.playerPos.y = targetCamY;
          this.audio.playMarbleFootstep();
        }
      } else {
        // Player is grounded. Check if they walked off an elevated edge (e.g. walked off bench or crate to floor below)
        const currentFootY = this.playerPos.y - this.currentCamHeight;
        if (!this.playerStairState.active && currentFootY > groundY + 0.18) {
          // Walked off an edge into the air!
          this.isGrounded = false;
          this.jumpVelocity = 0;
          this.jumpOffset = currentFootY - groundY;
          this.playerPos.y = targetCamY;
        } else {
          // Smoothly adapt to stairs, slopes, or platform surface
          this.jumpOffset = 0;
          this.playerPos.y = THREE.MathUtils.lerp(this.playerPos.y, targetCamY, Math.min(1, delta * 16));
        }
      }

      this.trackCurrentRoom();
      this.updateInteractionPrompt();

      if (this.exitUnlocked && this.playerFloor === 0 && this.playerPos.z > 27.8 && Math.abs(this.playerPos.x + 10.0) < 1.6) {
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

    getPlatformSurfaceY(x, z, floorIdx) {
      if (floorIdx === 3 && this.physicsCrates && this.physicsCrates.length > 0) {
        let crateSurfaceY = 0;
        for (let i = 0; i < this.physicsCrates.length; i++) {
          const crate = this.physicsCrates[i];
          if (crate.isHeld) continue;
          const halfW = crate.w / 2 + 0.04;
          const halfD = crate.d / 2 + 0.04;
          if (x >= crate.x - halfW && x <= crate.x + halfW && z >= crate.z - halfD && z <= crate.z + halfD) {
            const topY = crate.isCollapsed ? (crate.y + 0.15) : (crate.y + crate.h);
            if (topY > crateSurfaceY) crateSurfaceY = topY;
          }
        }
        if (crateSurfaceY > 0) return crateSurfaceY;
      }

      // If player is inside or navigating a stairwell, elevation is governed exclusively by the stairwell solver
      if (this.playerStairState && this.playerStairState.active) {
        return 0;
      }
      if ((x >= -4.2 && x <= 4.2 && z >= -26.2 && z <= -13.8) ||
          (x >= -24.2 && x <= -15.8 && z >= 17.8 && z <= 28.2)) {
        return 0;
      }

      let maxSurfaceY = 0;
      for (let i = 0; i < this.colliders.length; i++) {
        const c = this.colliders[i];
        if (c.floor !== 'all' && c.floor !== floorIdx) continue;
        if (c.maxY === undefined) continue;
        if (c.type === 'box') {
          if (x >= c.minX && x <= c.maxX && z >= c.minZ && z <= c.maxZ) {
            if (c.maxY > maxSurfaceY) maxSurfaceY = c.maxY;
          }
        } else if (c.type === 'cylinder') {
          const dx = x - c.x;
          const dz = z - c.z;
          if (dx * dx + dz * dz <= c.radius * c.radius) {
            if (c.maxY > maxSurfaceY) maxSurfaceY = c.maxY;
          }
        }
      }
      return maxSurfaceY;
    }

    resolveCollisions(pos, radius, floorIdx, footElevation = -999) {
      for (let iter = 0; iter < 3; iter++) {
        for (let i = 0; i < this.colliders.length; i++) {
          const c = this.colliders[i];
          if (c.disabled) continue;
          if (c.floor !== 'all' && c.floor !== floorIdx) continue;

          // If this collider is a low obstacle/platform (bench, plinth, crate, desk) and feet are high enough to stand on top, allow passing over top
          if (c.maxY !== undefined && footElevation >= (c.maxY - 0.12)) continue;

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
      if (this.isSpectatorMode && this.isSpectatorHudHidden) {
        if (this.dom.interactPrompt && !this.dom.interactPrompt.classList.contains('hidden')) {
          this.dom.interactPrompt.classList.add('hidden');
        }
        this._currentPromptText = '';
        return;
      }
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
      // Held crate status prompt
      if (this.heldCrate) {
        this.setInteractPrompt('[E] RELEASE TO PLACE / DROP  •  [LMB] THROW');
        return;
      }

      // Crate pickup prompt on 4th floor
      if (this.playerFloor === 3 && this.physicsCrates && this.physicsCrates.length > 0) {
        const cosPitch = Math.cos(this.playerPitch);
        const sinPitch = Math.sin(this.playerPitch);
        const cosYaw = Math.cos(this.playerYaw);
        const sinYaw = Math.sin(this.playerYaw);
        const fwd = new THREE.Vector3(-sinYaw * cosPitch, sinPitch, -cosYaw * cosPitch);
        const camPos = this.camera.position;

        for (let i = 0; i < this.physicsCrates.length; i++) {
          const c = this.physicsCrates[i];
          if (c.isHeld) continue;
          const toC = new THREE.Vector3(c.x - camPos.x, (c.y + c.h / 2) - camPos.y, c.z - camPos.z);
          if (toC.length() < 2.85 && toC.normalize().dot(fwd) > 0.78) {
            this.setInteractPrompt('HOLD [E] LIFT & CARRY CRATE  •  [LMB] THROW');
            return;
          }
        }
      }

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
            this.setInteractPrompt(`[E] TAKE AMMO (+${CONFIG.AMMO_PICKUP.AMMO_AMOUNT} ROUNDS)`);
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
      if (this.isSpectatorMode && this.isSpectatorHudHidden) return;
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
      if (this.isSpectatorMode && this.isSpectatorHudHidden) return;
      if (!this.dom.relicNotification) return;
      const obtained = this.relicsCollected;
      const total = CONFIG.TOTAL_RELICS;
      const remaining = Math.max(0, total - obtained);
      this.dom.relicNotification.textContent = T(
        'hud.relic_notification',
        'relic found: {obtained}/{total} ({remaining} to go)',
        { obtained, total, remaining }
      );
      this.dom.relicNotification.classList.add('visible');
      this.dom.relicNotification.style.transform = 'translateX(-50%) scale(1.06)';
      setTimeout(() => {
        if (this.dom.relicNotification) {
          this.dom.relicNotification.style.transform = 'translateX(-50%) scale(1.0)';
        }
      }, 220);

      if (this.relicNotificationTimeout) {
        clearTimeout(this.relicNotificationTimeout);
      }
      this.relicNotificationTimeout = setTimeout(() => {
        if (this.dom.relicNotification) {
          this.dom.relicNotification.classList.remove('visible');
        }
      }, 4000);
    }

    showSystemNotification(text, duration = 3000) {
      if (this.isSpectatorMode && this.isSpectatorHudHidden) return;
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

    updateSpectatorBadge() {
      if (!this.dom.spectatorIndicator) return;
      if (!this.isSpectatorMode || this.isSpectatorHudHidden) {
        this.dom.spectatorIndicator.classList.add('hidden');
        return;
      }
      this.dom.spectatorIndicator.classList.remove('hidden');
      const parts = ['SPECTATOR'];
      if (this.isNoClipMode) parts.push('NO-CLIP');
      if (this.isSmittyXray) parts.push('OUTLINE');
      this.dom.spectatorIndicator.textContent = parts.join(' • ');
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

        this.updateSpectatorBadge();

        this.showSystemNotification(
          T('hud.spectator_enabled', 'Spectator Controls: V - Flight, B - Curator Outline, H - HUD'),
          10000
        );
      } else {
        // Disengage no-clip, X-ray, and unhide HUD/arms if active when exiting spectator mode
        if (this.isSpectatorHudHidden) {
          this.toggleSpectatorHud(false);
        }
        if (this.isNoClipMode) {
          this.toggleNoClipMode(false);
        }
        if (this.isSmittyXray) {
          this.toggleSmittyXray(false);
        }

        this.updateSpectatorBadge();

        this.showSystemNotification(
          T('hud.spectator_disabled', 'SPECTATOR MODE DISABLED')
        );
      }
    }

    toggleSmittyXray(forceState) {
      if (!this.isSpectatorMode && forceState !== false) return;
      const targetState = (forceState !== undefined) ? forceState : !this.isSmittyXray;
      if (this.isSmittyXray === targetState) return;
      this.isSmittyXray = targetState;

      if (this.smittyXrayGroup) {
        this.smittyXrayGroup.visible = this.isSmittyXray;
      }

      // If turning on X-ray, ensure Smitty's mesh is visible even across different floors
      if (this.isSmittyXray && this.smittyMesh && this.smittyState !== 'DEAD' && this.smittyEnabled) {
        this.smittyMesh.visible = true;
      }

      this.updateSpectatorBadge();

      if (this.isSmittyXray) {
        this.showSystemNotification(
          T('hud.xray_enabled', 'CURATOR RED OUTLINE ENABLED')
        );
      } else {
        this.showSystemNotification(
          T('hud.xray_disabled', 'CURATOR RED OUTLINE DISABLED')
        );
      }
    }

    toggleNoClipMode(forceState) {
      if (!this.isSpectatorMode && forceState !== false) return;
      const targetState = (forceState !== undefined) ? forceState : !this.isNoClipMode;
      if (this.isNoClipMode === targetState) return;
      this.isNoClipMode = targetState;

      this.updateSpectatorBadge();

      if (this.isNoClipMode) {
        this.showSystemNotification(
          T('hud.noclip_enabled', 'NO-CLIP ENABLED (V TO EXIT)')
        );
      } else {
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

    toggleSpectatorHud(forceState) {
      if (!this.isSpectatorMode && forceState !== false) return;
      const targetState = (forceState !== undefined) ? !!forceState : !this.isSpectatorHudHidden;
      if (this.isSpectatorHudHidden === targetState) return;
      this.isSpectatorHudHidden = targetState;

      if (this.dom.hud) {
        if (this.isSpectatorHudHidden) {
          this.dom.hud.classList.add('hud-hidden');
        } else {
          this.dom.hud.classList.remove('hud-hidden');
        }
      }

      if (this.weaponRig) {
        this.weaponRig.visible = !this.isSpectatorHudHidden;
      }
      if (this.leftArmRig) {
        this.leftArmRig.visible = !this.isSpectatorHudHidden;
      }

      if (this.isSpectatorHudHidden) {
        if (this.dom.interactPrompt) this.dom.interactPrompt.classList.add('hidden');
        if (this.dom.relicNotification) this.dom.relicNotification.classList.remove('visible');
        if (this.dom.systemNotification) this.dom.systemNotification.classList.remove('visible');
        if (this.dom.floorIndicator) this.dom.floorIndicator.style.opacity = '0';
        if (this.dom.spectatorIndicator) this.dom.spectatorIndicator.classList.add('hidden');
      } else {
        this.updateSpectatorBadge();
        this.showSystemNotification(
          T('hud.hud_shown', 'HUD & ARMS VISIBLE')
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

      if (this.heldCrate) {
        targetY = -0.75;
      } else if (this.isAiming) {
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
      let targetY = this.heldCrate ? -0.75 : -0.28;
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

      // Tactile hand tremor/shake upon toggling flashlight on or off
      if (this.leftHandShakeTimer > 0) {
        this.leftHandShakeTimer = Math.max(0, this.leftHandShakeTimer - delta);
        const shakeT = this.leftHandShakeTimer / 0.35; // 1 down to 0
        const freq = 52.0;
        const shakeX = Math.sin(this.leftHandShakeTimer * freq) * 0.024 * shakeT;
        const shakeY = Math.cos(this.leftHandShakeTimer * freq * 1.3) * 0.020 * shakeT;
        const shakeRotZ = Math.sin(this.leftHandShakeTimer * freq * 0.9) * 0.09 * shakeT;
        const shakeRotX = Math.cos(this.leftHandShakeTimer * freq * 1.1) * 0.07 * shakeT;
        targetX += shakeX;
        targetY += shakeY;
        targetRotX += shakeRotX;
        targetRotZ += shakeRotZ;
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

      // Smitty only freezes/stuns upon the very first shot
      if (!this.smittyHasBeenShot) {
        this.smittyHasBeenShot = true;
        this.smittyStunTimer = 1.2;
      } else {
        this.smittyStunTimer = 0;
      }

      const bloodOrigin = hitPoint || new THREE.Vector3(this.smittyPos.x, this.smittyPos.y + 1.35, this.smittyPos.z);
      this.spawnLiquidBlood(bloodOrigin, shotDir, 38);

      if (this.smittyHp <= 0) {
        this.smittyState = 'DEAD';
        this.smittyDeadTimer = 0;
        this.smittyFallAngle = 0.01;
        this.audio.stopLingeringMonsterAudio();
        this.audio.playSmittyDeath();
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
        this.enterSmittyChase('damage');
      }
    }

    enterSmittyChase(triggerType = 'sight') {
      const wasInChase = (this.smittyState === 'CHASE');
      this.smittyState = 'CHASE';
      this.smittyChaseMinDuration = 4.5; // Stay locked in chase for at least 4.5 seconds to prevent rapid flickering
      this.playSmittyAnimation('Run');

      const now = performance.now() / 1000;
      if (!this.lastChaseStingerTime) this.lastChaseStingerTime = 0;

      // Only play the intense jumpscare stinger if transitioning into CHASE
      // AND enforce a 15-second cooldown so rapid re-acquiring / re-locking never repeats the stinger
      if (!wasInChase && (now - this.lastChaseStingerTime > 15.0)) {
        this.lastChaseStingerTime = now;
        this.audio.playJumpscareStinger();
      } else if (!wasInChase && (now - (this.lastChaseGrowlTime || 0) > 6.0)) {
        this.lastChaseGrowlTime = now;
        this.audio.playSmittyGrowl();
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

        if (isChase) {
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
        } else {
          // NOT in chase: Smitty CANNOT detect the player if not on the same floor,
          // UNLESS Smitty saw the player run down/up stairs, or directly catches sight of player on the stairs
          const playerIsOnStairs = isStairPlayer || (this.playerStairState && this.playerStairState.active !== null);
          const sawPlayerUseStairs = (this.smittySawPlayerStairsTimer > 0);

          if (!sawPlayerUseStairs && !playerIsOnStairs) {
            return false;
          }

          // Must be directly in/at the stairwell with direct open flight view
          if (!isNearStairSmitty || !isNearStairPlayer) {
            return false;
          }

          // Only within direct visual range of adjacent stair flight (< 4.2m)
          if (vertDist > 4.2) {
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
      // Minimal safe epsilon (0.02m) ensures starting and ending points never jump through thin walls
      const dirX = (this.playerPos.x - this.smittyPos.x) / (dist || 1);
      const dirZ = (this.playerPos.z - this.smittyPos.z) / (dist || 1);
      const x0 = this.smittyPos.x + dirX * 0.02;
      const z0 = this.smittyPos.z + dirZ * 0.02;
      const x1 = this.playerPos.x - dirX * 0.02;
      const z1 = this.playerPos.z - dirZ * 0.02;

      for (let i = 0; i < this.colliders.length; i++) {
        const c = this.colliders[i];
        if (c.floor !== 'all' && c.floor !== this.smittyFloor && c.floor !== this.playerFloor) continue;
        if (c.type === 'box') {
          // Low obstacles (benches with height <= 0.75m) do not block sight when player is standing
          if (c.maxY !== undefined) {
            const fl = c.floor === 'all' ? this.smittyFloor : c.floor;
            const y0 = fl * CONFIG.FLOOR_HEIGHT;
            const obstacleHeight = c.maxY - y0;
            if (obstacleHeight <= 0.75 && !this.isCrouching) {
              continue; // Smitty sees clearly over bench tops
            }
          }
          if (lineIntersectsBox(x0, z0, x1, z1, c.minX, c.maxX, c.minZ, c.maxZ)) {
            return false;
          }
        } else if (c.type === 'cylinder') {
          if (lineIntersectsCircle(x0, z0, x1, z1, c.x, c.z, c.radius || 0.40)) {
            return false;
          }
        }
      }
      return true;
    }

    alertSmittySound(soundPos, soundFloor, radius, isImmediateChase = false) {
      if (this.isSpectatorMode || this.smittyState === 'DEAD' || this.smittyState === 'RESPAWNING' || !this.gameStarted) return;

      // Smitty CANNOT hear or detect sounds from another floor unless he is ALREADY in CHASE
      if (soundFloor !== this.smittyFloor && this.smittyState !== 'CHASE') {
        return;
      }

      // Wall acoustic obstruction: solid museum walls (like bathroom or gallery walls) block footstep sounds.
      // Only gunshots (isImmediateChase = true) penetrate walls!
      if (!isImmediateChase && soundFloor === this.smittyFloor) {
        const hasAcousticLOS = this.hasClearNavPath(soundPos, this.smittyPos, soundFloor, 0.05);
        if (!hasAcousticLOS) {
          // Footsteps on the other side of a solid wall cannot be heard by Smitty
          return;
        }
      }

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
          this.enterSmittyChase('sound');
          this.lastKnownPlayerPos.set(soundPos.x, soundFloor * CONFIG.FLOOR_HEIGHT, soundPos.z);
          this.lastKnownPlayerFloor = soundFloor;
          this.timeSincePlayerSeen = 0;
          this.smittyPath = [];
        } else if (this.smittyState === 'CHASE' || this.smittyState === 'STALK') {
          // Keep tracking footsteps even if visual LOS broke around a corner or onto stairs
          this.lastKnownPlayerPos.set(soundPos.x, soundFloor * CONFIG.FLOOR_HEIGHT, soundPos.z);
          this.lastKnownPlayerFloor = soundFloor;
          // Refresh chase persistence so Smitty doesn't give up while player is running on stairs!
          this.timeSincePlayerSeen = Math.min(this.timeSincePlayerSeen, 2.0);
        } else {
          const wasPatrol = (this.smittyState === 'PATROL' || this.smittyState === 'PATROL_DANCE' || this.smittyState === 'PATROL_INSPECT');
          this.smittyState = 'INVESTIGATE';
          this.smittySearchTimer = 8.0;
          this.smittyPath = []; // Clear stale waypoint path so Smitty redirects immediately
          this.playSmittyAnimation('Walk');
          if (wasPatrol) {
            this.audio.playSmittyGrowl();
          }

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
            // Reached last waypoint. If within striking range of player (even on a bench/platform) or path is clear, close in directly
            const distToGoal = Math.hypot(this.smittyPos.x - goalPos.x, this.smittyPos.z - goalPos.z);
            if (goalFloor === this.smittyFloor && (distToGoal <= CONFIG.SMITTY.ATTACK_RANGE + 0.35 || this.hasClearNavPath(this.smittyPos, goalPos, this.smittyFloor, 0.48))) {
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
      if (!this.smittyEnabled) {
        this.smittyMesh.visible = false;
        if (this.smittyXrayGroup) this.smittyXrayGroup.visible = false;
        return;
      }

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
          this.smittyMesh.visible = this.isSmittyXray ? true : (this.smittyFloor === this.playerFloor);

          // Reset health & patrol
          this.smittyHp = CONFIG.SMITTY.MAX_HP;
          this.smittyState = 'PATROL';
          this.smittyStunTimer = 0;
          this.smittyHasBeenShot = false;
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
      this.smittyMesh.visible = this.isSmittyXray ? true : (this.isSpectatorMode ? (sameFloor || Math.abs(this.playerPos.y - this.smittyPos.y) < 7.5) : standardVisibility);

      // Dynamic subtle pulse for X-ray materials
      if (this.isSmittyXray && this.smittyXrayFillMat && this.smittyXrayWireMat) {
        const pulse = 0.88 + 0.12 * Math.sin(performance.now() * 0.005);
        this.smittyXrayFillMat.opacity = 0.50 * pulse;
        this.smittyXrayWireMat.opacity = 0.85 * pulse;
      }

      if (this.graceTimer > 0) {
        this.graceTimer -= delta;
      }
      if (this.smittySawPlayerStairsTimer > 0) {
        this.smittySawPlayerStairsTimer -= delta;
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

      // Record Smitty coordinate before movement to verify actual ground locomotion
      const prevSmittyX = this.smittyPos.x;
      const prevSmittyZ = this.smittyPos.z;

      if (this.smittyStunTimer > 0) {
        this.smittyStunTimer -= delta;
        return;
      }

      const canSeePlayer = !this.isSpectatorMode && (this.graceTimer <= 0) && this.checkSmittyVision();

      if (canSeePlayer) {
        this.lastKnownPlayerPos.copy(this.playerPos);
        this.lastKnownPlayerFloor = this.playerFloor;
        this.timeSincePlayerSeen = 0;

        // If player is on or entering stairs while visible to Smitty, record that Smitty saw them take stairs
        const playerOnOrAtStair = this.isInStairwell(this.playerPos) || this.isNearStairwell(this.playerPos) || (this.playerStairState && this.playerStairState.active !== null);
        if (playerOnOrAtStair) {
          this.smittySawPlayerStairsTimer = 7.0;
        }

        if (
          this.smittyState === 'PATROL' ||
          this.smittyState === 'PATROL_DANCE' ||
          this.smittyState === 'PATROL_INSPECT' ||
          this.smittyState === 'INVESTIGATE' ||
          this.smittyState === 'SEARCH'
        ) {
          if (dist3D < 11 || this.isSprinting) {
            this.enterSmittyChase('sight');
          } else {
            this.smittyState = 'STALK';
            this.playSmittyAnimation('Walk');
            this.audio.playSmittyGrowl();
            this.smittyStalkFreezeTimer = 0;
            this.timeSincePlayerSeenInStalk = 0;
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
        if (this.smittyChaseMinDuration > 0) {
          this.smittyChaseMinDuration -= delta;
        }
        const speed = CONFIG.SMITTY.CHASE_SPEED;

        // Periodic predator snarls/growls during extended pursuit (enforce minimum 6s cooldown)
        this.smittyChaseGrowlTimer = (this.smittyChaseGrowlTimer || 0) - delta;
        if (this.smittyChaseGrowlTimer <= 0) {
          this.smittyChaseGrowlTimer = 6.0 + Math.random() * 4.0;
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

        // When line of sight is lost, switch to SEARCH only after reaching the destination floor & spot with hysteresis,
        // or after prolonged pursuit AND after minimum chase duration has elapsed
        if (!canSeePlayer && (this.smittyChaseMinDuration <= 0)) {
          const distToLastKnown = Math.hypot(this.lastKnownPlayerPos.x - this.smittyPos.x, this.lastKnownPlayerPos.z - this.smittyPos.z);
          const reachedTargetFloor = (this.smittyFloor === this.lastKnownPlayerFloor);
          if ((reachedTargetFloor && distToLastKnown < 1.8 && this.timeSincePlayerSeen > 3.0) || this.timeSincePlayerSeen > 12.0) {
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
            this.enterSmittyChase('stalk_freeze');
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
            this.enterSmittyChase('stalk_proximity');
          } else if (!canSeePlayer) {
            this.timeSincePlayerSeenInStalk = (this.timeSincePlayerSeenInStalk || 0) + delta;
            if (this.timeSincePlayerSeenInStalk > 2.0) {
              this.smittyState = 'SEARCH';
              this.smittySearchTimer = 8.5;
              this.smittySearchStage = 'NAV';
              this.playSmittyAnimation('Walk');
              this.timeSincePlayerSeenInStalk = 0;
            }
          } else {
            this.timeSincePlayerSeenInStalk = 0;
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

      // Smitty Footstep Audio: Strictly emit footsteps when Smitty is actively traversing the ground
      const movedDist = Math.hypot(this.smittyPos.x - prevSmittyX, this.smittyPos.z - prevSmittyZ);
      const isWalkingAnim = (this.currentActionName === 'Walk' || this.currentActionName === 'Run');
      const isSmittyLocomoting = isWalkingAnim && (movedDist > 0.005) && (this.smittyStunTimer <= 0) && (this.smittyState !== 'DEAD');

      if (isSmittyLocomoting) {
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
      } else {
        // Not walking — hold timer primed so when he begins walking, the first step occurs naturally
        this.smittyFootstepTimer = Math.min(this.smittyFootstepTimer, 0.25);
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
      if (!this.smittyEnabled) return;
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
      if (!this.smittyEnabled) return;
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

      const allRelicsEl = document.querySelector('[data-text="victory.all_relics"]');
      if (allRelicsEl) {
        allRelicsEl.textContent = T('victory.all_relics', `All ${CONFIG.TOTAL_RELICS} Relics Recovered!`, { total: CONFIG.TOTAL_RELICS });
      }

      this.dom.victoryModal.classList.remove('hidden');
      if (this.audio) {
        this.audio.pauseGameplayAudio();
        this.audio.playMenuMusic();
      }
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
      this.dom.ammoValue.textContent = `${this.ammoInMag}/${this.reserveAmmo}`;
    }

    animate() {
      requestAnimationFrame(() => this.animate());

      const delta = Math.min(this.clock.getDelta(), 0.05);

      if (this.gameStarted && !this.isPaused && !this.isGameOver && !this.isVictory && !this.isExaminingArt) {
        this.updatePlayer(delta);
        this.updatePhysicsCrates(delta);
        this.updateAquariumFish(delta);
        this.updateSmitty(delta);
        this.updateLiquidBlood(delta);
        this.updateAmmoPickups(delta);
        if (this.smittyMixer && this.smittyState !== 'DEAD') this.smittyMixer.update(delta);
        this.updateSmittyHeadBone(delta);

        const time = performance.now() * 0.002;

        // Dynamic distance culling for paintings: only render artworks within 36m fog envelope on current floor
        if (this.paintings) {
          const px = this.playerPos.x;
          const pz = this.playerPos.z;
          for (let p of this.paintings) {
            if (p.floor !== this.playerFloor) {
              if (p.mesh.visible) p.mesh.visible = false;
            } else {
              const dSq = (p.x - px) ** 2 + (p.z - pz) ** 2;
              p.mesh.visible = (dSq < 1296); // 36m * 36m
            }
          }
        }

        this.relics.forEach((r) => {
          if (!r.collected && r.floor === this.playerFloor && r.mesh) {
            // Distance culling: only render & animate relics within 22m (room/hall envelope).
            // Eliminates rendering 500k-1.5M polygon relics across opposite wings through multiple walls.
            const dSq = (r.x - this.playerPos.x) ** 2 + (r.z - this.playerPos.z) ** 2;
            const inRange = dSq < 484; // 22m * 22m
            r.mesh.visible = inRange;
            if (inRange) {
              r.mesh.rotation.y = time * 0.8;
              r.mesh.position.y = r.y + Math.sin(time * 2.2) * 0.035;
            }
          }
        });
      }

      if (this.exitDoorsOpening && this.leftDoorPivot && this.rightDoorPivot) {
        // Swing outward toward exterior porch (+Z)
        const targetL = -Math.PI * 0.48;
        const targetR = Math.PI * 0.48;
        const step = Math.min(1.0, delta * 2.5);
        this.leftDoorPivot.rotation.y = THREE.MathUtils.lerp(this.leftDoorPivot.rotation.y, targetL, step);
        this.rightDoorPivot.rotation.y = THREE.MathUtils.lerp(this.rightDoorPivot.rotation.y, targetR, step);
        if (Math.abs(this.leftDoorPivot.rotation.y - targetL) < 0.005) {
          this.leftDoorPivot.rotation.y = targetL;
          this.rightDoorPivot.rotation.y = targetR;
          this.exitDoorsOpening = false;
        }
      }

      // Automatic sliding glass doors (Restrooms)
      if (this.slidingDoors && this.slidingDoors.length > 0) {
        const playerX = this.playerPos.x;
        const playerZ = this.playerPos.z;
        const smittyX = this.smittyPos ? this.smittyPos.x : 999;
        const smittyZ = this.smittyPos ? this.smittyPos.z : 999;
        const smittyFloor = this.smittyPos ? Math.round(this.smittyPos.y / CONFIG.FLOOR_HEIGHT) : -1;
        const smittyActive = (this.smittyState !== 'DEAD');

        for (let i = 0; i < this.slidingDoors.length; i++) {
          const d = this.slidingDoors[i];
          const distPlayer = (this.playerFloor === d.floor) ? Math.hypot(playerX - d.x, playerZ - d.doorZ) : 999;
          const distSmitty = (smittyActive && smittyFloor === d.floor) ? Math.hypot(smittyX - d.x, smittyZ - d.doorZ) : 999;
          const shouldOpen = (distPlayer < 3.4 || distSmitty < 3.4);

          // Audio whisper when door begins to slide open
          if (shouldOpen && !d.isOpen && d.openProgress < 0.05) {
            d.isOpen = true;
            if (this.playerFloor === d.floor && this.audio && this.audio.playSlidingDoor) {
              this.audio.playSlidingDoor();
            }
          } else if (!shouldOpen && d.isOpen && d.openProgress > 0.95) {
            d.isOpen = false;
          }

          const targetProgress = shouldOpen ? 1.0 : 0.0;
          const speed = shouldOpen ? 3.2 : 1.8; // Opens promptly when approached, closes smoothly
          d.openProgress = THREE.MathUtils.lerp(d.openProgress, targetProgress, Math.min(1.0, delta * speed));

          // Slide glass panels into the wall pockets
          d.leftLeaf.position.z = THREE.MathUtils.lerp(d.closedZLeft, d.openZLeft, d.openProgress);
          d.rightLeaf.position.z = THREE.MathUtils.lerp(d.closedZRight, d.openZRight, d.openProgress);

          // Sensor indicator LED: green when motion detected / door active, blue when idle
          if (d.sensorLEDMat) {
            d.sensorLEDMat.color.setHex(d.openProgress > 0.08 ? 0x00ff88 : 0x0088ff);
          }

          // Dynamic collider: clear obstruction once glass is 35% open so you can walk through
          if (d.collider) {
            if (d.openProgress > 0.35) {
              d.collider.minX = 0;
              d.collider.maxX = 0;
            } else {
              d.collider.minX = 3.82;
              d.collider.maxX = 4.18;
            }
          }
        }
      }

      this.renderer.render(this.scene, this.camera);
    }
  }

  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', () => {
      window.gameInstance = new MuseumGame();
    });
  } else {
    window.gameInstance = new MuseumGame();
  }
})();
