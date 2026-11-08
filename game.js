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
          // Heartbeat pulse only plays during genuine danger / active escalation (BPM >= 95)
          // Completely suppresses repetitive background thumping during calm exploration
          if (this.currentBpm >= 95) {
            const intensity = Math.min(1.0, (this.currentBpm - 90) / 75);
            if (this.customBuffers && this.customBuffers['heartbeat_pulse.wav']) {
              this.triggerThump(0, 52, 0.38 * intensity);
            } else {
              // Procedural two-part anatomical pulse (lub-dub)
              this.triggerThump(0, 52, 0.36 * intensity);
              this.triggerThump(0.14, 44, 0.22 * intensity);
            }
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
          g.gain.setValueAtTime(vol * 1.25, now);
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
      if (this.lastCrateImpactTime && (now - this.lastCrateImpactTime) < 0.08) return;
      this.lastCrateImpactTime = now;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(160, now);
      osc.frequency.exponentialRampToValueAtTime(40, now + 0.08);
      gain.gain.setValueAtTime(0.22, now);
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
      if (this.lastCrateCreakTime && (now - this.lastCrateCreakTime) < 0.12) return;
      this.lastCrateCreakTime = now;
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
      if (!this.ctx || distance > 24) return;
      const atten = Math.max(0, 1 - distance / 24);
      const vol = atten * atten * 0.45; // Gentle muffled footfall to prevent repetitive thumping
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

  // =========================================================================
  // LIVING INTERACTIVE STATUES & SILVER SMITTY CONFIGURATION
  // =========================================================================
  const STATUES_CONFIG = [
    {
      id: "heknah",
      name: "Heknah",
      floor: 0,
      x: -10.0,
      z: 5.0,
      rotY: 0,
      faceOffset: -Math.PI / 2,
      model: "3D_Source_Models/statues/statue-heknah.glb",
      fallbackModel: "assets/statues/statue-heknah.glb",
      audio: "assets/audio/statue audio/heknah-song1.mp3",
      songTitle: "Heknah - At The Whim",
      duration: 86.73,
      targetHeight: 2.025,
      walkSpeed: 1.55
    },
    {
      id: "jlb3",
      name: "JLB3",
      floor: 1,
      x: -21.0,
      z: 6.0,
      rotY: 0,
      faceOffset: -Math.PI / 2,
      model: "3D_Source_Models/statues/statue-jlb3.glb",
      fallbackModel: "assets/statues/statue-jlb3.glb",
      audio: "assets/audio/statue audio/JLB3-song1.mp3",
      songTitle: "Joe Lee Bridges III - Back To Joe",
      duration: 102.92,
      targetHeight: 2.025,
      walkSpeed: 1.50
    },
    {
      id: "r3e4",
      name: "R3E4",
      floor: 3,
      x: -10.0,
      z: 5.0,
      rotY: 0,
      faceOffset: -Math.PI / 2,
      model: "3D_Source_Models/statues/statue-R3E4.glb",
      fallbackModel: "assets/statues/statue-R3E4.glb",
      audio: "assets/audio/statue audio/R3E4-song1.mp3",
      songTitle: "R3E4 - Pantone 448 C",
      songTitleAlt: "R3E4 - Beat And Boxx",
      duration: 234.42,
      audioAlt: "assets/audio/statue audio/R3E4-song2.mp3",
      durationAlt: 21.29,
      altChance: 0.05,
      targetHeight: 2.025,
      walkSpeed: 1.55
    },
    {
      id: "rat_hat_toing",
      name: "Rat Hat Toing",
      floor: 3,
      x: 14.0,
      z: 10.0,
      rotY: 0,
      faceOffset: -Math.PI / 2,
      model: "assets/statues/statue-Rat Hat Toing.glb",
      audio: "assets/audio/statue audio/Rat Hat Toing-song1.mp3",
      songTitle: "Smitty Fantastic - Hexagram 27",
      duration: 165.49,
      targetHeight: 2.025,
      walkSpeed: 1.50,
      stayOnFloor: true
    },
    {
      id: "tourist",
      name: "Tourist",
      floor: 3,
      x: 12.0,
      z: 23.0,
      rotY: 0,
      faceOffset: -Math.PI / 2,
      model: "assets/statues/statue-Tourist.glb",
      targetHeight: 2.025,
      walkSpeed: 1.50,
      stayOnFloor: true
    },
    {
      id: "bird_squid",
      name: "Bird",
      floor: 0,
      x: 12.0,
      z: -33.0,
      rotY: 0,
      faceOffset: -Math.PI / 2,
      model: "3D_Source_Models/statues/statue-bird-squid.glb",
      fallbackModel: "assets/statues/statue-bird-squid.glb",
      audio: "assets/audio/statue audio/Bird-sound1.mp3",
      duration: 5.67,
      targetHeight: 2.025,
      walkSpeed: 1.60
    },
    {
      id: "pumppump",
      name: "Pumpump",
      floor: 1,
      x: 12.0,
      z: -30.0,
      rotY: 0,
      faceOffset: -Math.PI / 2,
      model: "3D_Source_Models/statues/statue-pumppump.glb",
      fallbackModel: "assets/statues/statue-pumpump.glb",
      audio: "assets/audio/statue audio/Pumpump-Sound1.mp3",
      duration: 96.00,
      targetHeight: 2.025,
      walkSpeed: 1.48
    },
    {
      id: "silver_smitty",
      name: "Silver Smitty",
      floor: 2, // 3rd floor — never walks; only teleports (unseen, random 60-105s intervals)
      x: 12.0,
      z: 10.0,
      rotY: Math.PI,
      faceOffset: 0,
      model: "3D_Source_Models/statues/Silver Smitty.glb",
      fallbackModel: "assets/statues/Silver Smitty.glb",
      audioPool: [
        { src: "assets/audio/statue audio/silversmitty1.mp3", duration: 2.22 },
        { src: "assets/audio/statue audio/silversmitty2.mp3", duration: 1.36 },
        { src: "assets/audio/statue audio/silversmitty3.mp3", duration: 1.46 },
        { src: "assets/audio/statue audio/silversmitty4.mp3", duration: 1.57 },
        { src: "assets/audio/statue audio/silversmitty5.mp3", duration: 1.46 },
        { src: "assets/audio/statue audio/silversmitty6.mp3", duration: 2.30 }
      ],
      duration: 2.30,
      targetHeight: 1.935,
      walkSpeed: 1.50,
      noAnimation: true,
      isSilverSmitty: true
    }
  ];

  // --- CONFIGURATION ---
  const CONFIG = {
    TOTAL_RELICS: 14,
    FLOOR_HEIGHT: 7.5,
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
    "y": 2.75,
    "z": -2.0,
    "rotY": 1.5708,
    "maxW": 2.8
  },
  {
    "floor": 0,
    "x": -35.65,
    "y": 2.75,
    "z": 3.0,
    "rotY": 1.5708,
    "maxW": 2.8
  },
  {
    "floor": 0,
    "x": -35.65,
    "y": 2.75,
    "z": 13.0,
    "rotY": 1.5708,
    "maxW": 2.8
  },
  {
    "floor": 0,
    "x": -31.5,
    "y": 2.75,
    "z": -5.65,
    "rotY": 0.0,
    "maxW": 2.8
  },
  {
    "floor": 0,
    "x": -26.0,
    "y": 2.75,
    "z": -5.65,
    "rotY": 0.0,
    "maxW": 2.8
  },
  {
    "floor": 0,
    "x": -20.5,
    "y": 2.75,
    "z": -5.65,
    "rotY": 0.0,
    "maxW": 2.8
  },
  {
    "floor": 0,
    "x": -16.35,
    "y": 2.75,
    "z": 2.0,
    "rotY": -1.5708,
    "maxW": 2.4
  },
  {
    "floor": 0,
    "x": -16.35,
    "y": 2.75,
    "z": 10.0,
    "rotY": -1.5708,
    "maxW": 2.4
  },
  {
    "floor": 0,
    "x": -33.65,
    "y": 2.75,
    "z": 23.0,
    "rotY": 1.5708,
    "maxW": 2.8
  },
  {
    "floor": 0,
    "x": -12.5,
    "y": 2.75,
    "z": -17.65,
    "rotY": 0.0,
    "maxW": 2.8
  },
  {
    "floor": 0,
    "x": -7.5,
    "y": 2.75,
    "z": -17.65,
    "rotY": 0.0,
    "maxW": 2.8
  },
  {
    "floor": 0,
    "x": -15.65,
    "y": 2.75,
    "z": -12.5,
    "rotY": 1.5708,
    "maxW": 2.8
  },
  {
    "floor": 0,
    "x": -15.65,
    "y": 2.75,
    "z": 2.0,
    "rotY": 1.5708,
    "maxW": 2.4
  },
  {
    "floor": 0,
    "x": -15.65,
    "y": 2.75,
    "z": 10.0,
    "rotY": 1.5708,
    "maxW": 2.4
  },
  {
    "floor": 0,
    "x": 4.35,
    "y": 2.75,
    "z": -23.0,
    "rotY": 1.5708,
    "maxW": 2.8
  },
  {
    "floor": 0,
    "x": 4.35,
    "y": 2.75,
    "z": -19.2,
    "rotY": 1.5708,
    "maxW": 2.8
  },
  {
    "floor": 0,
    "x": -4.35,
    "y": 2.75,
    "z": -10.0,
    "rotY": -1.5708,
    "maxW": 2.8
  },
  {
    "floor": 0,
    "x": -4.35,
    "y": 2.75,
    "z": -3.0,
    "rotY": -1.5708,
    "maxW": 2.4
  },
  {
    "floor": 0,
    "x": -4.35,
    "y": 2.75,
    "z": 11.5,
    "rotY": -1.5708,
    "maxW": 2.8
  },
  {
    "floor": 0,
    "x": -4.35,
    "y": 2.75,
    "z": 16.0,
    "rotY": -1.5708,
    "maxW": 2.8
  },
  {
    "floor": 0,
    "x": -3.65,
    "y": 2.75,
    "z": -33.0,
    "rotY": 1.5708,
    "maxW": 2.8
  },
  {
    "floor": 0,
    "x": 1.0,
    "y": 2.75,
    "z": -39.65,
    "rotY": 0.0,
    "maxW": 2.8
  },
  {
    "floor": 0,
    "x": 23.0,
    "y": 2.75,
    "z": -39.65,
    "rotY": 0.0,
    "maxW": 2.8
  },
  {
    "floor": 0,
    "x": 9.5,
    "y": 2.75,
    "z": -41.65,
    "rotY": 0.0,
    "maxW": 2.6
  },
  {
    "floor": 0,
    "x": 14.5,
    "y": 2.75,
    "z": -41.65,
    "rotY": 0.0,
    "maxW": 2.6
  },
  {
    "floor": 0,
    "x": 27.65,
    "y": 2.75,
    "z": -33.0,
    "rotY": -1.5708,
    "maxW": 2.8
  },
  {
    "floor": 0,
    "x": 12.0,
    "y": 2.75,
    "z": -25.65,
    "rotY": 0.0,
    "maxW": 2.8
  },
  {
    "floor": 0,
    "x": 23.8,
    "y": 2.75,
    "z": -25.65,
    "rotY": 0.0,
    "maxW": 2.8
  },
  {
    "floor": 0,
    "x": 4.35,
    "y": 2.75,
    "z": -5.25,
    "rotY": 1.5708,
    "maxW": 2.3
  },
  {
    "floor": 0,
    "x": 4.35,
    "y": 2.75,
    "z": 1.0,
    "rotY": 1.5708,
    "maxW": 2.2
  },
  {
    "floor": 0,
    "x": 4.35,
    "y": 2.75,
    "z": 9.5,
    "rotY": 1.5708,
    "maxW": 2.85
  },
  {
    "floor": 0,
    "x": 4.35,
    "y": 2.75,
    "z": 13.0,
    "rotY": 1.5708,
    "maxW": 2.85
  },
  {
    "floor": 0,
    "x": 4.35,
    "y": 2.75,
    "z": 16.5,
    "rotY": 1.5708,
    "maxW": 2.85
  },
  {
    "floor": 0,
    "x": 32.65,
    "y": 2.75,
    "z": -18.0,
    "rotY": -1.5708,
    "maxW": 2.8
  },
  {
    "floor": 0,
    "x": 32.65,
    "y": 2.75,
    "z": -4.0,
    "rotY": -1.5708,
    "maxW": 2.8
  },
  {
    "floor": 0,
    "x": 27.65,
    "y": 2.75,
    "z": -11.0,
    "rotY": -1.5708,
    "maxW": 2.8
  },
  {
    "floor": 0,
    "x": 27.65,
    "y": 2.75,
    "z": 4.0,
    "rotY": -1.5708,
    "maxW": 2.8
  },
  {
    "floor": 0,
    "x": 27.65,
    "y": 2.75,
    "z": 23.0,
    "rotY": -1.5708,
    "maxW": 2.8
  },
  {
    "floor": 0,
    "x": 19.0,
    "y": 2.75,
    "z": 33.65,
    "rotY": 3.1416,
    "maxW": 2.8
  },
  {
    "floor": 1,
    "x": -35.65,
    "y": 7.95,
    "z": -2.0,
    "rotY": 1.5708,
    "maxW": 2.8
  },
  {
    "floor": 1,
    "x": -35.65,
    "y": 7.95,
    "z": 3.0,
    "rotY": 1.5708,
    "maxW": 2.8
  },
  {
    "floor": 1,
    "x": -35.65,
    "y": 7.95,
    "z": 13.0,
    "rotY": 1.5708,
    "maxW": 2.8
  },
  {
    "floor": 1,
    "x": -31.5,
    "y": 7.95,
    "z": -5.65,
    "rotY": 0.0,
    "maxW": 2.8
  },
  {
    "floor": 1,
    "x": -26.0,
    "y": 7.95,
    "z": -5.65,
    "rotY": 0.0,
    "maxW": 2.8
  },
  {
    "floor": 1,
    "x": -20.5,
    "y": 7.95,
    "z": -5.65,
    "rotY": 0.0,
    "maxW": 2.8
  },
  {
    "floor": 1,
    "x": -16.35,
    "y": 7.95,
    "z": 2.0,
    "rotY": -1.5708,
    "maxW": 2.4
  },
  {
    "floor": 1,
    "x": -16.35,
    "y": 7.95,
    "z": 10.0,
    "rotY": -1.5708,
    "maxW": 2.4
  },
  {
    "floor": 1,
    "x": -33.65,
    "y": 7.95,
    "z": 23.0,
    "rotY": 1.5708,
    "maxW": 2.8
  },
  {
    "floor": 1,
    "x": -12.5,
    "y": 7.95,
    "z": -17.65,
    "rotY": 0.0,
    "maxW": 2.8
  },
  {
    "floor": 1,
    "x": -7.5,
    "y": 7.95,
    "z": -17.65,
    "rotY": 0.0,
    "maxW": 2.8
  },
  {
    "floor": 1,
    "x": -15.65,
    "y": 7.95,
    "z": -12.5,
    "rotY": 1.5708,
    "maxW": 2.8
  },
  {
    "floor": 1,
    "x": -15.65,
    "y": 7.95,
    "z": 2.0,
    "rotY": 1.5708,
    "maxW": 2.4
  },
  {
    "floor": 1,
    "x": -15.65,
    "y": 7.95,
    "z": 10.0,
    "rotY": 1.5708,
    "maxW": 2.4
  },
  {
    "floor": 1,
    "x": 4.35,
    "y": 7.95,
    "z": -23.0,
    "rotY": 1.5708,
    "maxW": 2.8
  },
  {
    "floor": 1,
    "x": 4.35,
    "y": 7.95,
    "z": -19.2,
    "rotY": 1.5708,
    "maxW": 2.8
  },
  {
    "floor": 1,
    "x": -4.35,
    "y": 7.95,
    "z": -10.0,
    "rotY": -1.5708,
    "maxW": 2.8
  },
  {
    "floor": 1,
    "x": -4.35,
    "y": 7.95,
    "z": -3.0,
    "rotY": -1.5708,
    "maxW": 2.4
  },
  {
    "floor": 1,
    "x": -4.35,
    "y": 7.95,
    "z": 11.5,
    "rotY": -1.5708,
    "maxW": 2.8
  },
  {
    "floor": 1,
    "x": -4.35,
    "y": 7.95,
    "z": 16.0,
    "rotY": -1.5708,
    "maxW": 2.8
  },
  {
    "floor": 1,
    "x": -3.65,
    "y": 7.95,
    "z": -33.0,
    "rotY": 1.5708,
    "maxW": 2.8
  },
  {
    "floor": 1,
    "x": 1.0,
    "y": 7.95,
    "z": -39.65,
    "rotY": 0.0,
    "maxW": 2.8
  },
  {
    "floor": 1,
    "x": 23.0,
    "y": 7.95,
    "z": -39.65,
    "rotY": 0.0,
    "maxW": 2.8
  },
  {
    "floor": 1,
    "x": 9.5,
    "y": 7.95,
    "z": -41.65,
    "rotY": 0.0,
    "maxW": 2.6
  },
  {
    "floor": 1,
    "x": 14.5,
    "y": 7.95,
    "z": -41.65,
    "rotY": 0.0,
    "maxW": 2.6
  },
  {
    "floor": 1,
    "x": 27.65,
    "y": 7.95,
    "z": -33.0,
    "rotY": -1.5708,
    "maxW": 2.8
  },
  {
    "floor": 1,
    "x": 12.0,
    "y": 7.95,
    "z": -25.65,
    "rotY": 0.0,
    "maxW": 2.8
  },
  {
    "floor": 1,
    "x": 23.8,
    "y": 7.95,
    "z": -25.65,
    "rotY": 0.0,
    "maxW": 2.8
  },
  {
    "floor": 1,
    "x": 4.35,
    "y": 7.95,
    "z": -5.25,
    "rotY": 1.5708,
    "maxW": 2.3
  },
  {
    "floor": 1,
    "x": 4.35,
    "y": 7.95,
    "z": 1.0,
    "rotY": 1.5708,
    "maxW": 2.2
  },
  {
    "floor": 1,
    "x": 4.35,
    "y": 7.95,
    "z": 9.5,
    "rotY": 1.5708,
    "maxW": 2.85
  },
  {
    "floor": 1,
    "x": 4.35,
    "y": 7.95,
    "z": 13.0,
    "rotY": 1.5708,
    "maxW": 2.85
  },
  {
    "floor": 1,
    "x": 4.35,
    "y": 7.95,
    "z": 16.5,
    "rotY": 1.5708,
    "maxW": 2.85
  },
  {
    "floor": 1,
    "x": 32.65,
    "y": 7.95,
    "z": -18.0,
    "rotY": -1.5708,
    "maxW": 2.8
  },
  {
    "floor": 1,
    "x": 32.65,
    "y": 7.95,
    "z": -4.0,
    "rotY": -1.5708,
    "maxW": 2.8
  },
  {
    "floor": 1,
    "x": 27.65,
    "y": 7.95,
    "z": -11.0,
    "rotY": -1.5708,
    "maxW": 2.8
  },
  {
    "floor": 1,
    "x": 27.65,
    "y": 7.95,
    "z": 4.0,
    "rotY": -1.5708,
    "maxW": 2.8
  },
  {
    "floor": 1,
    "x": 27.65,
    "y": 7.95,
    "z": 23.0,
    "rotY": -1.5708,
    "maxW": 2.8
  },
  {
    "floor": 1,
    "x": 19.0,
    "y": 7.95,
    "z": 33.65,
    "rotY": 3.1416,
    "maxW": 2.8
  },
  {
    "floor": 2,
    "x": -35.65,
    "y": 13.15,
    "z": -2.0,
    "rotY": 1.5708,
    "maxW": 2.8
  },
  {
    "floor": 2,
    "x": -35.65,
    "y": 13.15,
    "z": 3.0,
    "rotY": 1.5708,
    "maxW": 2.8
  },
  {
    "floor": 2,
    "x": -35.65,
    "y": 13.15,
    "z": 13.0,
    "rotY": 1.5708,
    "maxW": 2.8
  },
  {
    "floor": 2,
    "x": -31.5,
    "y": 13.15,
    "z": -5.65,
    "rotY": 0.0,
    "maxW": 2.8
  },
  {
    "floor": 2,
    "x": -26.0,
    "y": 13.15,
    "z": -5.65,
    "rotY": 0.0,
    "maxW": 2.8
  },
  {
    "floor": 2,
    "x": -20.5,
    "y": 13.15,
    "z": -5.65,
    "rotY": 0.0,
    "maxW": 2.8
  },
  {
    "floor": 2,
    "x": -16.35,
    "y": 13.15,
    "z": 2.0,
    "rotY": -1.5708,
    "maxW": 2.4
  },
  {
    "floor": 2,
    "x": -16.35,
    "y": 13.15,
    "z": 10.0,
    "rotY": -1.5708,
    "maxW": 2.4
  },
  {
    "floor": 2,
    "x": -33.65,
    "y": 13.15,
    "z": 23.0,
    "rotY": 1.5708,
    "maxW": 2.8
  },
  {
    "floor": 2,
    "x": -12.5,
    "y": 13.15,
    "z": -17.65,
    "rotY": 0.0,
    "maxW": 2.8
  },
  {
    "floor": 2,
    "x": -7.5,
    "y": 13.15,
    "z": -17.65,
    "rotY": 0.0,
    "maxW": 2.8
  },
  {
    "floor": 2,
    "x": -15.65,
    "y": 13.15,
    "z": -12.5,
    "rotY": 1.5708,
    "maxW": 2.8
  },
  {
    "floor": 2,
    "x": -15.65,
    "y": 13.15,
    "z": 2.0,
    "rotY": 1.5708,
    "maxW": 2.4
  },
  {
    "floor": 2,
    "x": -15.65,
    "y": 13.15,
    "z": 10.0,
    "rotY": 1.5708,
    "maxW": 2.4
  },
  {
    "floor": 2,
    "x": 4.35,
    "y": 13.15,
    "z": -23.0,
    "rotY": 1.5708,
    "maxW": 2.8
  },
  {
    "floor": 2,
    "x": 4.35,
    "y": 13.15,
    "z": -19.2,
    "rotY": 1.5708,
    "maxW": 2.8
  },
  {
    "floor": 2,
    "x": -4.35,
    "y": 13.15,
    "z": -10.0,
    "rotY": -1.5708,
    "maxW": 2.8
  },
  {
    "floor": 2,
    "x": -4.35,
    "y": 13.15,
    "z": -3.0,
    "rotY": -1.5708,
    "maxW": 2.4
  },
  {
    "floor": 2,
    "x": -4.35,
    "y": 13.15,
    "z": 11.5,
    "rotY": -1.5708,
    "maxW": 2.8
  },
  {
    "floor": 2,
    "x": -4.35,
    "y": 13.15,
    "z": 16.0,
    "rotY": -1.5708,
    "maxW": 2.8
  },
  {
    "floor": 2,
    "x": -3.65,
    "y": 13.15,
    "z": -33.0,
    "rotY": 1.5708,
    "maxW": 2.8
  },
  {
    "floor": 2,
    "x": 1.0,
    "y": 13.15,
    "z": -39.65,
    "rotY": 0.0,
    "maxW": 2.8
  },
  {
    "floor": 2,
    "x": 23.0,
    "y": 13.15,
    "z": -39.65,
    "rotY": 0.0,
    "maxW": 2.8
  },
  {
    "floor": 2,
    "x": 9.5,
    "y": 13.15,
    "z": -41.65,
    "rotY": 0.0,
    "maxW": 2.6
  },
  {
    "floor": 2,
    "x": 14.5,
    "y": 13.15,
    "z": -41.65,
    "rotY": 0.0,
    "maxW": 2.6
  },
  {
    "floor": 2,
    "x": 27.65,
    "y": 13.15,
    "z": -33.0,
    "rotY": -1.5708,
    "maxW": 2.8
  },
  {
    "floor": 2,
    "x": 12.0,
    "y": 13.15,
    "z": -25.65,
    "rotY": 0.0,
    "maxW": 2.8
  },
  {
    "floor": 2,
    "x": 23.8,
    "y": 13.15,
    "z": -25.65,
    "rotY": 0.0,
    "maxW": 2.8
  },
  {
    "floor": 2,
    "x": 4.35,
    "y": 13.15,
    "z": -5.25,
    "rotY": 1.5708,
    "maxW": 2.3
  },
  {
    "floor": 2,
    "x": 4.35,
    "y": 13.15,
    "z": 1.0,
    "rotY": 1.5708,
    "maxW": 2.2
  },
  {
    "floor": 2,
    "x": 4.35,
    "y": 13.15,
    "z": 9.5,
    "rotY": 1.5708,
    "maxW": 2.85
  },
  {
    "floor": 2,
    "x": 4.35,
    "y": 13.15,
    "z": 13.0,
    "rotY": 1.5708,
    "maxW": 2.85
  },
  {
    "floor": 2,
    "x": 4.35,
    "y": 13.15,
    "z": 16.5,
    "rotY": 1.5708,
    "maxW": 2.85
  },
  {
    "floor": 2,
    "x": 32.65,
    "y": 13.15,
    "z": -18.0,
    "rotY": -1.5708,
    "maxW": 2.8
  },
  {
    "floor": 2,
    "x": 32.65,
    "y": 13.15,
    "z": -4.0,
    "rotY": -1.5708,
    "maxW": 2.8
  },
  {
    "floor": 2,
    "x": 27.65,
    "y": 13.15,
    "z": -11.0,
    "rotY": -1.5708,
    "maxW": 2.8
  },
  {
    "floor": 2,
    "x": 27.65,
    "y": 13.15,
    "z": 4.0,
    "rotY": -1.5708,
    "maxW": 2.8
  },
  {
    "floor": 2,
    "x": 27.65,
    "y": 13.15,
    "z": 23.0,
    "rotY": -1.5708,
    "maxW": 2.8
  },
  {
    "floor": 2,
    "x": 19.0,
    "y": 13.15,
    "z": 33.65,
    "rotY": 3.1416,
    "maxW": 2.8
  },
  {
    "floor": 3,
    "x": -35.65,
    "y": 18.35,
    "z": -2.0,
    "rotY": 1.5708,
    "maxW": 2.8
  },
  {
    "floor": 3,
    "x": -35.65,
    "y": 18.35,
    "z": 3.0,
    "rotY": 1.5708,
    "maxW": 2.8
  },
  {
    "floor": 3,
    "x": -35.65,
    "y": 18.35,
    "z": 13.0,
    "rotY": 1.5708,
    "maxW": 2.8
  },
  {
    "floor": 3,
    "x": -31.5,
    "y": 18.35,
    "z": -5.65,
    "rotY": 0.0,
    "maxW": 2.8
  },
  {
    "floor": 3,
    "x": -26.0,
    "y": 18.35,
    "z": -5.65,
    "rotY": 0.0,
    "maxW": 2.8
  },
  {
    "floor": 3,
    "x": -20.5,
    "y": 18.35,
    "z": -5.65,
    "rotY": 0.0,
    "maxW": 2.8
  },
  {
    "floor": 3,
    "x": -16.35,
    "y": 18.35,
    "z": 2.0,
    "rotY": -1.5708,
    "maxW": 2.4
  },
  {
    "floor": 3,
    "x": -16.35,
    "y": 18.35,
    "z": 10.0,
    "rotY": -1.5708,
    "maxW": 2.4
  },
  {
    "floor": 3,
    "x": -33.65,
    "y": 18.35,
    "z": 23.0,
    "rotY": 1.5708,
    "maxW": 2.8
  },
  {
    "floor": 3,
    "x": -12.5,
    "y": 18.35,
    "z": -17.65,
    "rotY": 0.0,
    "maxW": 2.8
  },
  {
    "floor": 3,
    "x": -7.5,
    "y": 18.35,
    "z": -17.65,
    "rotY": 0.0,
    "maxW": 2.8
  },
  {
    "floor": 3,
    "x": -15.65,
    "y": 18.35,
    "z": -12.5,
    "rotY": 1.5708,
    "maxW": 2.8
  },
  {
    "floor": 3,
    "x": -15.65,
    "y": 18.35,
    "z": 2.0,
    "rotY": 1.5708,
    "maxW": 2.4
  },
  {
    "floor": 3,
    "x": -15.65,
    "y": 18.35,
    "z": 10.0,
    "rotY": 1.5708,
    "maxW": 2.4
  },
  {
    "floor": 3,
    "x": 4.35,
    "y": 18.35,
    "z": -23.0,
    "rotY": 1.5708,
    "maxW": 2.8
  },
  {
    "floor": 3,
    "x": 4.35,
    "y": 18.35,
    "z": -19.2,
    "rotY": 1.5708,
    "maxW": 2.8
  },
  {
    "floor": 3,
    "x": -4.35,
    "y": 18.35,
    "z": -10.0,
    "rotY": -1.5708,
    "maxW": 2.8
  },
  {
    "floor": 3,
    "x": -4.35,
    "y": 18.35,
    "z": -3.0,
    "rotY": -1.5708,
    "maxW": 2.4
  },
  {
    "floor": 3,
    "x": -4.35,
    "y": 18.35,
    "z": 11.5,
    "rotY": -1.5708,
    "maxW": 2.8
  },
  {
    "floor": 3,
    "x": -4.35,
    "y": 18.35,
    "z": 16.0,
    "rotY": -1.5708,
    "maxW": 2.8
  },
  {
    "floor": 3,
    "x": -3.65,
    "y": 18.35,
    "z": -33.0,
    "rotY": 1.5708,
    "maxW": 2.8
  },
  {
    "floor": 3,
    "x": 1.0,
    "y": 18.35,
    "z": -39.65,
    "rotY": 0.0,
    "maxW": 2.8
  },
  {
    "floor": 3,
    "x": 23.0,
    "y": 18.35,
    "z": -39.65,
    "rotY": 0.0,
    "maxW": 2.8
  },
  {
    "floor": 3,
    "x": 9.5,
    "y": 18.35,
    "z": -41.65,
    "rotY": 0.0,
    "maxW": 2.6
  },
  {
    "floor": 3,
    "x": 14.5,
    "y": 18.35,
    "z": -41.65,
    "rotY": 0.0,
    "maxW": 2.6
  },
  {
    "floor": 3,
    "x": 27.65,
    "y": 18.35,
    "z": -33.0,
    "rotY": -1.5708,
    "maxW": 2.8
  },
  {
    "floor": 3,
    "x": 12.0,
    "y": 18.35,
    "z": -25.65,
    "rotY": 0.0,
    "maxW": 2.8
  },
  {
    "floor": 3,
    "x": 23.8,
    "y": 18.35,
    "z": -25.65,
    "rotY": 0.0,
    "maxW": 2.8
  },
  {
    "floor": 3,
    "x": 4.35,
    "y": 18.35,
    "z": -5.25,
    "rotY": 1.5708,
    "maxW": 2.3
  },
  {
    "floor": 3,
    "x": 4.35,
    "y": 18.35,
    "z": 1.0,
    "rotY": 1.5708,
    "maxW": 2.2
  },
  {
    "floor": 3,
    "x": 4.35,
    "y": 18.35,
    "z": 9.5,
    "rotY": 1.5708,
    "maxW": 2.85
  },
  {
    "floor": 3,
    "x": 4.35,
    "y": 18.35,
    "z": 13.0,
    "rotY": 1.5708,
    "maxW": 2.85
  },
  {
    "floor": 3,
    "x": 4.35,
    "y": 18.35,
    "z": 16.5,
    "rotY": 1.5708,
    "maxW": 2.85
  },
  {
    "floor": 3,
    "x": 32.65,
    "y": 18.35,
    "z": -18.0,
    "rotY": -1.5708,
    "maxW": 2.8
  },
  {
    "floor": 3,
    "x": 32.65,
    "y": 18.35,
    "z": -4.0,
    "rotY": -1.5708,
    "maxW": 2.8
  },
  {
    "floor": 3,
    "x": 27.65,
    "y": 18.35,
    "z": -11.0,
    "rotY": -1.5708,
    "maxW": 2.8
  },
  {
    "floor": 3,
    "x": 27.65,
    "y": 18.35,
    "z": 4.0,
    "rotY": -1.5708,
    "maxW": 2.8
  },
  {
    "floor": 3,
    "x": 27.65,
    "y": 18.35,
    "z": 23.0,
    "rotY": -1.5708,
    "maxW": 2.8
  },
  {
    "floor": 3,
    "x": 19.0,
    "y": 18.35,
    "z": 33.65,
    "rotY": 3.1416,
    "maxW": 2.8
  }
];

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
  },
  {
    "id": 136,
    "floor": 0,
    "title": "Piano Chase",
    "file": "assets/gallery/137_piano-chase.jpg",
    "wing": "1ST FLOOR",
    "w": 2.2,
    "h": 1.93
  },
  {
    "id": 137,
    "floor": 0,
    "title": "Tiffin Spacelint",
    "file": "assets/gallery/138_Tiffin_Spacelint_render1.jpg",
    "wing": "1ST FLOOR",
    "w": 2.1,
    "h": 2.1
  },
  {
    "id": 138,
    "floor": 0,
    "title": "Chloe Bailey Portrait",
    "file": "assets/gallery/139_Chloe-Bailey-portrait.jpg",
    "wing": "1ST FLOOR",
    "w": 1.95,
    "h": 2.1
  },
  {
    "id": 139,
    "floor": 0,
    "title": "Pre Watered Drawing",
    "file": "assets/gallery/140_pre-watered-drawing.jpg",
    "wing": "1ST FLOOR",
    "w": 2.1,
    "h": 2.1
  },
  {
    "id": 140,
    "floor": 0,
    "title": "Rat YMCA",
    "file": "assets/gallery/141_rat-ymca.jpg",
    "wing": "1ST FLOOR",
    "w": 2.3,
    "h": 1.78
  },
  {
    "id": 141,
    "floor": 1,
    "title": "Est FNI First Cover",
    "file": "assets/gallery/142_est-fni-first-cover.jpg",
    "wing": "2ND FLOOR",
    "w": 2.1,
    "h": 2.1
  },
  {
    "id": 142,
    "floor": 1,
    "title": "Scooby Fan",
    "file": "assets/gallery/143_scooby-fan.jpg",
    "wing": "2ND FLOOR",
    "w": 2.05,
    "h": 2.1
  },
  {
    "id": 143,
    "floor": 1,
    "title": "Coach Nun",
    "file": "assets/gallery/144_coach-nun.jpg",
    "wing": "2ND FLOOR",
    "w": 1.65,
    "h": 2.2
  },
  {
    "id": 144,
    "floor": 1,
    "title": "Smitty 0 Bigman Shirt",
    "file": "assets/gallery/145_smitty-0-bigman-shirt.jpg",
    "wing": "2ND FLOOR",
    "w": 1.65,
    "h": 2.2
  },
  {
    "id": 145,
    "floor": 1,
    "title": "I Love Watching You",
    "file": "assets/gallery/146_i-love-watching-you.jpg",
    "wing": "2ND FLOOR",
    "w": 2.0,
    "h": 2.1
  },
  {
    "id": 146,
    "floor": 2,
    "title": "Smitty QR Code",
    "file": "assets/gallery/147_smitty-qr-code.jpg",
    "wing": "3RD FLOOR",
    "w": 2.1,
    "h": 2.1
  },
  {
    "id": 147,
    "floor": 2,
    "title": "Smittys First Appearance",
    "file": "assets/gallery/148_smittys-first-appearance.jpg",
    "wing": "3RD FLOOR",
    "w": 1.65,
    "h": 2.2
  },
  {
    "id": 148,
    "floor": 2,
    "title": "Harbinger Smitty Live Action",
    "file": "assets/gallery/149_Harbinger-Smitty-Live-Action.jpg",
    "wing": "3RD FLOOR",
    "w": 1.65,
    "h": 2.2
  },
  {
    "id": 149,
    "floor": 2,
    "title": "Smitty Colorful Mask Edit",
    "file": "assets/gallery/150_129_smitty-colorful-mask-edit.jpg",
    "wing": "3RD FLOOR",
    "w": 2.4,
    "h": 1.8
  },
  {
    "id": 150,
    "floor": 2,
    "title": "Smitty Crouching Disco Colors",
    "file": "assets/gallery/151_smitty-crouching-disco-colors.jpg",
    "wing": "3RD FLOOR",
    "w": 2.1,
    "h": 2.1
  },
  {
    "id": 151,
    "floor": 3,
    "title": "2019 Red Phone Face Drawing",
    "file": "assets/gallery/152_2019-red-phone-face-drawing.jpg",
    "wing": "4TH FLOOR",
    "w": 1.5,
    "h": 2.25
  },
  {
    "id": 152,
    "floor": 3,
    "title": "Smitty Face Headshot New",
    "file": "assets/gallery/153_smitty-face-headshot-new.jpg",
    "wing": "4TH FLOOR",
    "w": 2.05,
    "h": 2.1
  },
  {
    "id": 153,
    "floor": 3,
    "title": "Shrefflo Store 2025 Ad",
    "file": "assets/gallery/154_Shrefflo-store-2025-ad.jpg",
    "wing": "4TH FLOOR",
    "w": 2.4,
    "h": 1.8
  },
  {
    "id": 154,
    "floor": 3,
    "title": "Shrefflo Symbol",
    "file": "assets/gallery/155_shrefflo-symbol.gif",
    "wing": "4TH FLOOR",
    "w": 2.4,
    "h": 1.18
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

  // High-performance BufferGeometry combiner for low draw-call count
  function mergeBufferGeometries(geometries) {
    if (!geometries || geometries.length === 0) return new THREE.BufferGeometry();
    let totalPositions = 0;
    let totalIndices = 0;
    const prepared = [];

    for (let i = 0; i < geometries.length; i++) {
      let g = geometries[i];
      if (!g || !g.attributes || !g.attributes.position) continue;
      if (!g.attributes.normal) g.computeVertexNormals();
      if (!g.index) {
        const count = g.attributes.position.count;
        const idx = new Uint32Array(count);
        for (let k = 0; k < count; k++) idx[k] = k;
        g = g.clone();
        g.setIndex(new THREE.BufferAttribute(idx, 1));
      }
      totalPositions += g.attributes.position.array.length;
      totalIndices += g.index.array.length;
      prepared.push(g);
    }

    if (prepared.length === 0) return new THREE.BufferGeometry();

    const positions = new Float32Array(totalPositions);
    const normals = new Float32Array(totalPositions);
    const uvs = new Float32Array((totalPositions / 3) * 2);
    const indices = new Uint32Array(totalIndices);

    let posOffset = 0;
    let uvOffset = 0;
    let indexOffset = 0;
    let vertexOffset = 0;

    for (let i = 0; i < prepared.length; i++) {
      const g = prepared[i];
      const pos = g.attributes.position.array;
      positions.set(pos, posOffset);

      if (g.attributes.normal) {
        normals.set(g.attributes.normal.array, posOffset);
      }
      if (g.attributes.uv) {
        uvs.set(g.attributes.uv.array, uvOffset);
      }

      const idx = g.index.array;
      for (let j = 0; j < idx.length; j++) {
        indices[indexOffset + j] = idx[j] + vertexOffset;
      }
      indexOffset += idx.length;

      posOffset += pos.length;
      uvOffset += (pos.length / 3) * 2;
      vertexOffset += pos.length / 3;
    }

    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    merged.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    merged.setIndex(new THREE.BufferAttribute(indices, 1));
    return merged;
  }

  class MuseumGame {
    constructor() {
      this.canvas = document.getElementById('game-canvas');
      this.audio = new MuseumAudioEngine();

      this.renderer = null;
      this.scene = null;
      this.camera = null;
      this.clock = new THREE.Clock();
      this.videoInstallationRooms = [];
      this.activeVideoRoom = null;
      this.focusedVideoControl = null;
      this.ytPlayer = null;
      this.ytReady = false;
      this.ytPendingCmds = [];
      this.ytCurrentPlaylist = null;
      this.ytIsMuted = false;
      this.ytIsPaused = false;
      this.initYouTubeAPI();
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
      this.sprintExhausted = false;
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
      this.viewMode = 'first-person';
      const savedCharacter = Number(localStorage.getItem('the_museum_player_character'));
      this.selectedPlayerCharacter = Number.isInteger(savedCharacter) && savedCharacter >= 0 && savedCharacter < 7 ? savedCharacter : 0;
      this.playerModelRoot = null;
      this.playerModel = null;
      this.playerMixer = null;
      this.playerBones = {};
      this.playerActions = {};
      this.playerCurrentAction = null;
      this.playerModelLoadId = 0;
      this.thirdPersonCameraReady = false;
      const savedCameraDistance = localStorage.getItem('the_museum_camera_distance');
      const parsedCameraDistance = Number(savedCameraDistance);
      this.thirdPersonCameraDistance = savedCameraDistance !== null && Number.isFinite(parsedCameraDistance)
        ? THREE.MathUtils.clamp(parsedCameraDistance, 0.6, 2.6)
        : 2.0;
      this.headBobTimer = 0;
      this.footstepTimer = 0;
      this.recoilOffset = { z: 0, rotX: 0 };
      this.leftHandHoverTimer = 0;
      this.leftHandGrabTimer = 0;
      this.leftHandGrabDuration = 0.55;
      this.isPlayerDancing = false;
      this.playerDanceTimer = 0;
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
      this.aquariumFX = [];
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
        firstPersonViewBtn: document.getElementById('view-first-person-btn'),
        thirdPersonViewBtn: document.getElementById('view-third-person-btn'),
        playerCharacterSelectBtn: document.getElementById('player-character-select-btn'),
        optionsCharCurrentName: document.getElementById('options-char-current-name'),
        hostGameBtn: document.getElementById('host-game-btn'),
        joinGameBtn: document.getElementById('join-game-btn'),
        joinCodeModal: document.getElementById('join-code-modal'),
        joinCodeCloseBtn: document.getElementById('join-code-close-btn'),
        joinRoomInput: document.getElementById('join-room-input'),
        joinSubmitBtn: document.getElementById('join-submit-btn'),
        joinErrorMsg: document.getElementById('join-error-msg'),
        hostLobbyModal: document.getElementById('host-lobby-modal'),
        hostLobbyCloseBtn: document.getElementById('host-lobby-close-btn'),
        hostRoomCodeDisplay: document.getElementById('host-room-code-display'),
        hostPlayersList: document.getElementById('host-players-list'),
        hostProceedBtn: document.getElementById('host-proceed-btn'),
        pauseCoopCodeBar: document.getElementById('pause-coop-code-bar'),
        pauseCoopCodeVal: document.getElementById('pause-coop-code-val'),
        playerCharacterStatus: document.getElementById('player-character-status'),
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
      this.createPlayerModelRig();
      this.spawnRelics();
      this.spawnAmmoPickups();
      this.updateRelicFloorVisibility();
      this.loadSmittyModel();

      if (window.CharacterSelectUI) {
        this.charSelectUI = new window.CharacterSelectUI(this);
      }
      if (window.MuseumMultiplayer) {
        this.mp = new window.MuseumMultiplayer(this);
      }
      if (this.renderer && this.scene && this.camera) {
        this.renderer.compile(this.scene, this.camera);
      }
      this.setupEventListeners();
      this.updateSmittyModeUI();
      this.updateMusicModeUI();
      this.updatePlayerViewUI();
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
        alpha: true,
        powerPreference: 'high-performance'
      });
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.renderer.setPixelRatio(Math.min(1.0, window.devicePixelRatio) * 0.85);
      this.renderer.shadowMap.enabled = false;
      this.renderer.toneMapping = THREE.LinearToneMapping;
      this.renderer.toneMappingExposure = 1.0;

      // WebGL context loss recovery (Option 3): prevents graphics stalls or canvas freezes
      this.canvas.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        console.warn('WebGL context lost. Handling recovery...');
      }, false);
      this.canvas.addEventListener('webglcontextrestored', () => {
        console.warn('WebGL context restored. Re-syncing renderer...');
        this.renderer.setSize(window.innerWidth, window.innerHeight);
      }, false);

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
        ceiling: TextureFactory.loadPhotorealTexture(this.texLoader, 'assets/textures/ceiling_plaster.jpg', 12, 12, 0xf6f3eb),
        stairStone: TextureFactory.loadPhotorealTexture(this.texLoader, 'assets/textures/vault_concrete.jpg', 4, 4, 0x9aa0a8)
      };

      mats.ceiling.emissive = new THREE.Color(0x322f28);
      mats.ceiling.shininess = 16;
      mats.ceiling.specular = new THREE.Color(0x222222);

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

      this.createHallwayMirror(9, 3, y0);
      this.createHallwayMirror(-26, -3, y0);
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
      this.createWall(4.2, yc, -26, 0.8, wallH, t, mainWallMat, true, fl);        // 3.8..4.6 (West door jamb connecting to Stairwell N)
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

      // Classical Beaux-Arts Coved Ceilings, Skylight Laylights & Stepped Portal Architraves
      this.createClassicalBeauxArtsArchitecture(fl, y0, mats, ceilH, wallH);

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

      // Video Installation Room & Interactive Playlist Deck (x: -29, z: 18..28)
      this.createVideoInstallationRoom(fl, y0, mats);

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
      this.buildStatues(fl, y0, mats);
      this.buildSilverSmitty(fl, y0, mats);

      // Arts and Music Office Desk (x: 26, z: 13)
      this.createInfoDesk(26, y0, 13, mats.mahogany);

      // South-East Rotunda Circular Reference Desk at (23, 22)
      this.createCircularReferenceDesk(23, y0, 22, mats.mahogany, fl);
      this.populateFloorExhibits(fl, y0, mats);

      // Cohesive Warm Gallery Ceiling Lamps & Spotlights (Uniform across all floors - no color shift)
      const lightColor = 0xfff6eb;
      const lightInt = 0.58;
      const roomLightCoords = [
        [-26, -1],  // West Wing North
        [-26, 13],  // West Wing South
        [-29, 23],  // West Office
        [-10, -10], // Main Gallery North
        [-10, 5],   // Main Gallery Center
        [-10, 20],  // Main Gallery South
        [4, -33],   // North Gallery West
        [12, -33],  // North Gallery Center
        [20, -33],  // North Gallery East
        [12, -14],  // East Main Hall North
        [22, -14],  // East Main Hall North-East
        [12, -2],   // East Main Hall Mid
        [22, -2],   // East Main Hall Mid-East
        [26, 13],   // Arts & Music Office
        [16, 23]    // South-East Media Wing
      ];
      roomLightCoords.forEach(([lx, lz], idx) => {
        const fix = new THREE.Mesh(
          new THREE.CylinderGeometry(0.35, 0.35, 0.08, 12),
          new THREE.MeshBasicMaterial({ color: lightColor })
        );
        fix.position.set(lx, y0 + ceilH - 0.04, lz);
        this.scene.add(fix);

        const pl = new THREE.PointLight(lightColor, fl === this.playerFloor ? lightInt : 0, 24.0, 1.25);
        pl._origIntensity = lightInt;
        pl.position.set(lx, y0 + ceilH - 0.45, lz);
        this.scene.add(pl);
        if (this.floorLights[fl]) this.floorLights[fl].push(pl);
      });
    }

    buildFourStoryStairwells(mats) {
      const totalH = CONFIG.NUM_FLOORS * CONFIG.FLOOR_HEIGHT;
      const midY = totalH / 2;
      const t = 0.4;
      const ceilH = CONFIG.FLOOR_HEIGHT - 0.06;

      // Helper to build a solid sloped under-carriage stringer slab beneath a stair flight
      const addFlightCarriage = (cx, yStart, zStart, yEnd, zEnd, width) => {
        const dz = zEnd - zStart;
        const dy = yEnd - yStart;
        const len = Math.hypot(dz, dy);
        const angleX = Math.atan2(dy, dz);
        const slab = new THREE.Mesh(new THREE.BoxGeometry(width, 0.26, len + 0.25), mats.stairStone);
        slab.position.set(cx, (yStart + yEnd) / 2 - 0.22, (zStart + zEnd) / 2);
        slab.rotation.x = -angleX;
        this.scene.add(slab);
      };

      // --- 1. NORTH-CENTRAL U-STAIRWELL (x: -4..4, z: -26..-14) ---
      // Stop the divider short of both landings so the player can turn between flights.
      this.createWall(0, midY, -20.0, 0.34, totalH, 5.56, mats.wallConcrete, true, 'all');
      this.createCeiling(0, totalH - 0.06, -20, 8.0, 12.0, mats.ceiling);

      for (let fl = 0; fl < CONFIG.NUM_FLOORS; fl++) {
        const y0 = fl * CONFIG.FLOOR_HEIGHT;
        // Solid South Landing box at Floor fl (x: -4.0..4.0, z: -16.8..-14.0)
        const landBox = new THREE.Mesh(new THREE.BoxGeometry(8.0, 0.32, 2.84), mats.stairStone);
        landBox.position.set(0, y0 - 0.16, -15.4);
        this.scene.add(landBox);

        if (fl > 0) {
          this.createCeiling(0, y0 - 0.06, -15.4, 7.6, 2.8, mats.ceiling);
        }

        this.createRoomSign(0, y0 + 2.4, -14.28, Math.PI, T('sign.stairwell_b', 'STAIRWELL B • FLOOR {number}', { number: fl + 1 }), fl === 0 ? T('sign.stairwell_b.subtitle_floor1', 'EXIT LEVEL') : T('sign.stairwell_b.subtitle_upper', 'USE WEST FLIGHT UP / EAST FLIGHT DOWN'));

        if (fl < CONFIG.NUM_FLOORS - 1) {
          const halfH = CONFIG.FLOOR_HEIGHT / 2;
          // Solid North Mid-Landing box at y0 + halfH (x: -4.0..4.0, z: -26.0..-23.2)
          const nLand = new THREE.Mesh(new THREE.BoxGeometry(8.0, 0.32, 2.84), mats.stairStone);
          nLand.position.set(0, y0 + halfH - 0.16, -24.6);
          this.scene.add(nLand);

          // Sloped structural stringer carriages for 7.5m floor height
          addFlightCarriage(-1.98, y0, -16.8, y0 + halfH, -23.2, 3.62);
          addFlightCarriage( 1.98, y0 + halfH, -23.2, y0 + CONFIG.FLOOR_HEIGHT, -16.8, 3.62);

          const numSteps = 22;
          const stepLen = 6.4 / numSteps;
          const stepH = halfH / numSteps;
          const boxH = stepH + 0.30;
          for (let s = 0; s < numSteps; s++) {
            const sz = -16.8 - (s + 0.5) * stepLen;
            // West Flight: top surface flush with mathematical slope y0 + (s + 0.5) * stepH
            const wTopY = y0 + (s + 0.5) * stepH;
            const wStep = new THREE.Mesh(new THREE.BoxGeometry(3.64, boxH, stepLen + 0.04), mats.stairStone);
            wStep.position.set(-1.98, wTopY - boxH / 2, sz);
            this.scene.add(wStep);

            // East Flight: top surface flush with mathematical slope (y0 + H) - (s + 0.5) * stepH
            const eTopY = (y0 + CONFIG.FLOOR_HEIGHT) - (s + 0.5) * stepH;
            const eStep = new THREE.Mesh(new THREE.BoxGeometry(3.64, boxH, stepLen + 0.04), mats.stairStone);
            eStep.position.set(1.98, eTopY - boxH / 2, sz);
            this.scene.add(eStep);
          }
        }
      }
      // Guardrail on Floor 0 East Flight
      this.createWall(1.98, 1.22, -16.95, 3.96, 2.4, 0.35, mats.mahogany, true, 0);
      // Full floor-to-ceiling wooden barricade on Floor 3 West Flight
      const blockNW = new THREE.Mesh(new THREE.BoxGeometry(3.64, ceilH, 0.30), mats.mahogany);
      blockNW.position.set(-1.98, 3 * CONFIG.FLOOR_HEIGHT + ceilH / 2, -16.95);
      this.scene.add(blockNW);
      this.colliders.push({
        type: 'box',
        floor: 3,
        minX: -3.85,
        maxX: -0.15,
        minZ: -17.15,
        maxZ: -16.75,
        minY: 3 * CONFIG.FLOOR_HEIGHT,
        maxY: 3 * CONFIG.FLOOR_HEIGHT + ceilH,
        isWall: true
      });

      // --- 2. SOUTH-WEST GRAND U-STAIRWELL (x: -24..-16, z: 18..28) ---
      this.createWall(-20, midY, 28, 7.6, totalH, t, mats.wallConcrete, true, 'all');
      // Leave the same turning clearance at each end of the second stairwell divider.
      this.createWall(-20, midY, 23.2, 0.34, totalH, 3.96, mats.wallConcrete, true, 'all');
      this.createCeiling(-20, totalH - 0.06, 23, 8.0, 10.0, mats.ceiling);

      for (let fl = 0; fl < CONFIG.NUM_FLOORS; fl++) {
        const y0 = fl * CONFIG.FLOOR_HEIGHT;
        // Solid North Landing box at Floor fl (x: -24.0..-16.0, z: 18.0..20.8)
        const landBoxSW = new THREE.Mesh(new THREE.BoxGeometry(8.0, 0.32, 2.84), mats.stairStone);
        landBoxSW.position.set(-20, y0 - 0.16, 19.4);
        this.scene.add(landBoxSW);

        if (fl > 0) {
          this.createCeiling(-20, y0 - 0.06, 19.4, 7.6, 2.8, mats.ceiling);
        }

        this.createRoomSign(-20, y0 + 2.4, 20.6, 0, T('sign.stairwell_a', 'STAIRWELL A • FLOOR {number}', { number: fl + 1 }), T('sign.stairwell_a.subtitle', 'WEST FLIGHT UP / EAST FLIGHT DOWN'));

        if (fl < CONFIG.NUM_FLOORS - 1) {
          const halfH = CONFIG.FLOOR_HEIGHT / 2;
          // Solid South Mid-Landing box at y0 + halfH (x: -24.0..-16.0, z: 25.6..28.0)
          const sLand = new THREE.Mesh(new THREE.BoxGeometry(8.0, 0.32, 2.44), mats.stairStone);
          sLand.position.set(-20, y0 + halfH - 0.16, 26.8);
          this.scene.add(sLand);

          // Sloped structural stringer carriages for 7.5m floor height
          addFlightCarriage(-21.98, y0, 20.8, y0 + halfH, 25.6, 3.62);
          addFlightCarriage(-18.02, y0 + halfH, 25.6, y0 + CONFIG.FLOOR_HEIGHT, 20.8, 3.62);

          const numSteps = 20;
          const stepLen = 4.8 / numSteps;
          const stepH = halfH / numSteps;
          const boxH = stepH + 0.32;
          for (let s = 0; s < numSteps; s++) {
            const sz = 20.8 + (s + 0.5) * stepLen;
            // West Flight: top surface flush with mathematical slope y0 + (s + 0.5) * stepH
            const wTopY = y0 + (s + 0.5) * stepH;
            const wStep = new THREE.Mesh(new THREE.BoxGeometry(3.64, boxH, stepLen + 0.04), mats.stairStone);
            wStep.position.set(-21.98, wTopY - boxH / 2, sz);
            this.scene.add(wStep);

            // East Flight: top surface flush with mathematical slope (y0 + H) - (s + 0.5) * stepH
            const eTopY = (y0 + CONFIG.FLOOR_HEIGHT) - (s + 0.5) * stepH;
            const eStep = new THREE.Mesh(new THREE.BoxGeometry(3.64, boxH, stepLen + 0.04), mats.stairStone);
            eStep.position.set(-18.02, eTopY - boxH / 2, sz);
            this.scene.add(eStep);
          }
        }
      }
      // Guardrail on Floor 0 East Flight of Stairwell SW
      this.createWall(-18.02, 1.22, 20.95, 3.96, 2.4, 0.35, mats.mahogany, true, 0);
      // Full floor-to-ceiling wooden barricade on Floor 3 West Flight
      const blockSWW = new THREE.Mesh(new THREE.BoxGeometry(3.64, ceilH, 0.30), mats.mahogany);
      blockSWW.position.set(-21.98, 3 * CONFIG.FLOOR_HEIGHT + ceilH / 2, 20.95);
      this.scene.add(blockSWW);
      this.colliders.push({
        type: 'box',
        floor: 3,
        minX: -23.85,
        maxX: -20.15,
        minZ: 20.75,
        maxZ: 21.15,
        minY: 3 * CONFIG.FLOOR_HEIGHT,
        maxY: 3 * CONFIG.FLOOR_HEIGHT + ceilH,
        isWall: true
      });
    }

    // --- MULTI-STORY U-STAIRWELL CONTINUOUS SURFACE ELEVATION SOLVER ---
    updateStairwellElevation(pos, stairState, currentFloor, currentFootY = undefined) {
      const H = CONFIG.FLOOR_HEIGHT;
      const halfH = H / 2;
      const numFloors = CONFIG.NUM_FLOORS || 4;
      const footRef = (typeof currentFootY === 'number' && !isNaN(currentFootY))
        ? currentFootY
        : (currentFloor * H);
      const getLockedStairFloor = (stairName) => (
        stairState.active === stairName &&
        Number.isInteger(stairState.baseFloor) &&
        stairState.baseFloor >= 0 &&
        stairState.baseFloor < numFloors - 1
          ? stairState.baseFloor
          : null
      );

      // 1. Check North-Central Stairwell Interior Shaft (interior x: -3.85..3.85, z: -25.8..-14.2)
      if (pos.x >= -3.85 && pos.x <= 3.85 && pos.z >= -25.8 && pos.z <= -14.2) {
        // A) South Main Landing (z: -16.8..-14.2)
        if (pos.z >= -16.8) {
          let landingFloor;
          const lockedFloor = getLockedStairFloor('N');
          if (lockedFloor !== null) {
            landingFloor = pos.x < 0 ? lockedFloor : lockedFloor + 1;
          } else {
            landingFloor = currentFloor;
            let bestDist = Infinity;
            for (let fl = 0; fl < numFloors; fl++) {
              const d = Math.abs(footRef - fl * H);
              if (d < bestDist) {
                bestDist = d;
                landingFloor = fl;
              }
            }
          }
          stairState.active = null;
          stairState.baseFloor = landingFloor;
          return { y: landingFloor * H, floor: landingFloor };
        }

        // B) North Mid-Landing (z <= -23.2)
        if (pos.z <= -23.2) {
          let bestL = getLockedStairFloor('N');
          if (bestL === null) {
            bestL = Math.max(0, Math.min(numFloors - 2, currentFloor));
            let bestDist = Infinity;
            for (let l = 0; l < numFloors - 1; l++) {
              const d = Math.abs(footRef - (l * H + halfH));
              if (d < bestDist) {
                bestDist = d;
                bestL = l;
              }
            }
          }
          stairState.active = 'N';
          stairState.baseFloor = bestL;
          return { y: bestL * H + halfH, floor: currentFloor };
        }

        // C) Active Flights (z: -23.2..-16.8, length = 6.4)
        const t = Math.max(0, Math.min(1, (-16.8 - pos.z) / 6.4));

        if (pos.x < 0) {
          // West Flight: connects Main Landing (y = L * H at t = 0) to Mid-Landing (y = L * H + halfH at t = 1)
          let bestL = getLockedStairFloor('N');
          if (bestL === null) {
            bestL = Math.max(0, Math.min(numFloors - 2, currentFloor));
            let bestDist = Infinity;
            for (let l = 0; l < numFloors - 1; l++) {
              const candY = l * H + t * halfH;
              const d = Math.abs(footRef - candY);
              if (d < bestDist) {
                bestDist = d;
                bestL = l;
              }
            }
          }
          stairState.active = 'N';
          stairState.baseFloor = bestL;
          return { y: bestL * H + t * halfH, floor: currentFloor };
        } else {
          // East Flight: connects Mid-Landing (y = L * H + halfH at t = 1) to Upper Main Landing (y = (L + 1) * H at t = 0)
          let bestL = getLockedStairFloor('N');
          let bestDist = Infinity;
          if (bestL === null) {
            bestL = 0;
            for (let l = 0; l < numFloors - 1; l++) {
              const candY = (l + 1) * H - t * halfH;
              const d = Math.abs(footRef - candY);
              if (d < bestDist) {
                bestDist = d;
                bestL = l;
              }
            }
          }
          // If player is on ground floor below the first East flight
          if (getLockedStairFloor('N') === null && footRef < 1.85 && Math.abs(footRef) < bestDist) {
            stairState.active = null;
            stairState.baseFloor = 0;
            return { y: 0, floor: 0 };
          }
          stairState.active = 'N';
          stairState.baseFloor = bestL;
          return { y: (bestL + 1) * H - t * halfH, floor: currentFloor };
        }
      }

      // 2. Check South-West Grand Stairwell Interior Shaft (interior x: -23.85..-16.15, z: 18.2..27.8)
      if (pos.x >= -23.85 && pos.x <= -16.15 && pos.z >= 18.2 && pos.z <= 27.8) {
        // A) North Main Landing (z: 18.2..20.8)
        if (pos.z <= 20.8) {
          let landingFloor;
          const lockedFloor = getLockedStairFloor('SW');
          if (lockedFloor !== null) {
            landingFloor = pos.x < -20.0 ? lockedFloor : lockedFloor + 1;
          } else {
            landingFloor = currentFloor;
            let bestDist = Infinity;
            for (let fl = 0; fl < numFloors; fl++) {
              const d = Math.abs(footRef - fl * H);
              if (d < bestDist) {
                bestDist = d;
                landingFloor = fl;
              }
            }
          }
          stairState.active = null;
          stairState.baseFloor = landingFloor;
          return { y: landingFloor * H, floor: landingFloor };
        }

        // B) South Mid-Landing (z >= 25.6)
        if (pos.z >= 25.6) {
          let bestL = getLockedStairFloor('SW');
          if (bestL === null) {
            bestL = Math.max(0, Math.min(numFloors - 2, currentFloor));
            let bestDist = Infinity;
            for (let l = 0; l < numFloors - 1; l++) {
              const d = Math.abs(footRef - (l * H + halfH));
              if (d < bestDist) {
                bestDist = d;
                bestL = l;
              }
            }
          }
          stairState.active = 'SW';
          stairState.baseFloor = bestL;
          return { y: bestL * H + halfH, floor: currentFloor };
        }

        // C) Active Flights (z: 20.8..25.6, length = 4.8)
        const t = Math.max(0, Math.min(1, (pos.z - 20.8) / 4.8));

        if (pos.x < -20.0) {
          // West Flight: connects Main Landing (y = L * H at t = 0) to Mid-Landing (y = L * H + halfH at t = 1)
          let bestL = getLockedStairFloor('SW');
          if (bestL === null) {
            bestL = Math.max(0, Math.min(numFloors - 2, currentFloor));
            let bestDist = Infinity;
            for (let l = 0; l < numFloors - 1; l++) {
              const candY = l * H + t * halfH;
              const d = Math.abs(footRef - candY);
              if (d < bestDist) {
                bestDist = d;
                bestL = l;
              }
            }
          }
          stairState.active = 'SW';
          stairState.baseFloor = bestL;
          return { y: bestL * H + t * halfH, floor: currentFloor };
        } else {
          // East Flight: connects Mid-Landing (y = L * H + halfH at t = 1) to Upper Main Landing (y = (L + 1) * H at t = 0)
          let bestL = getLockedStairFloor('SW');
          let bestDist = Infinity;
          if (bestL === null) {
            bestL = 0;
            for (let l = 0; l < numFloors - 1; l++) {
              const candY = (l + 1) * H - t * halfH;
              const d = Math.abs(footRef - candY);
              if (d < bestDist) {
                bestDist = d;
                bestL = l;
              }
            }
          }
          if (getLockedStairFloor('SW') === null && footRef < 1.85 && Math.abs(footRef) < bestDist) {
            stairState.active = null;
            stairState.baseFloor = 0;
            return { y: 0, floor: 0 };
          }
          stairState.active = 'SW';
          stairState.baseFloor = bestL;
          return { y: (bestL + 1) * H - t * halfH, floor: currentFloor };
        }
      }

      // OUTSIDE STAIRWELLS: Strictly lock to current floor. Zero floor-jumping glitches!
      stairState.active = null;
      stairState.baseFloor = currentFloor;
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
          maxZ: z + d / 2,
          minY: y - h / 2,
          maxY: y + h / 2,
          isWall: true
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
          maxZ: Math.max(z1, z2) + 0.25,
          isWall: true
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

      const chanColor = 0xfffae6;
      const chanInt = fl === 3 ? 0.45 : 0.60;
      const chanLight = new THREE.PointLight(chanColor, fl === this.playerFloor ? chanInt : 0, 14.0);
      chanLight._origIntensity = chanInt;
      chanLight.position.set(cx, y0 + ceilH - 1.3, 30.5);
      this.scene.add(chanLight);
      if (this.floorLights[fl]) this.floorLights[fl].push(chanLight);
    }

    createClassicalBeauxArtsArchitecture(fl, y0, mats, ceilH, wallH) {
      // Classical Beaux-Arts architectural moldings & coffered laylights
      const corniceMat = new THREE.MeshLambertMaterial({
        color: fl === 3 ? 0x828b96 : (fl === 1 ? 0xfbf8f1 : (fl === 2 ? 0xeee9dd : 0xf6f3eb))
      });
      const dentilMat = new THREE.MeshLambertMaterial({
        color: fl === 3 ? 0x64707e : (fl === 1 ? 0xeae4d6 : (fl === 2 ? 0xdfd9cb : 0xe7e2d4))
      });

      const skylightGlassMat = new THREE.MeshLambertMaterial({
        color: 0xdff0fc,
        emissive: 0x3b5870,
        emissiveIntensity: 0.52,
        transparent: true,
        opacity: 0.92,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1
      });
      const mullionMat = new THREE.MeshLambertMaterial({ color: 0x1e242d });

      // 1. Helper: Room-Bounded Classical Entablature & Crown Molding Cornice
      // Cleanly fitted along the top of each enclosed room perimeter - zero wall penetration, zero voids
      const addRoomPerimeterCornice = (minX, maxX, minZ, maxZ) => {
        const group = new THREE.Group();
        const rw = maxX - minX;
        const rd = maxZ - minZ;
        const cx = (minX + maxX) / 2;
        const cz = (minZ + maxZ) / 2;

        // Band 1: Top Projection Fillet (flush with ceiling plane at y = y0 + ceilH)
        const fH = 0.05;
        const fD = 0.12;
        const fy = y0 + ceilH - fH / 2;
        const fN = new THREE.Mesh(new THREE.BoxGeometry(rw, fH, fD), corniceMat);
        fN.position.set(cx, fy, minZ + fD / 2);
        group.add(fN);
        const fS = new THREE.Mesh(new THREE.BoxGeometry(rw, fH, fD), corniceMat);
        fS.position.set(cx, fy, maxZ - fD / 2);
        group.add(fS);
        const fW = new THREE.Mesh(new THREE.BoxGeometry(fD, fH, rd - fD * 2), corniceMat);
        fW.position.set(minX + fD / 2, fy, cz);
        group.add(fW);
        const fE = new THREE.Mesh(new THREE.BoxGeometry(fD, fH, rd - fD * 2), corniceMat);
        fE.position.set(maxX - fD / 2, fy, cz);
        group.add(fE);

        // Band 2: Cyma-Reversa Crown Cove Bed Molding (beneath fillet)
        const cH = 0.08;
        const cD = 0.08;
        const cy = y0 + ceilH - fH - cH / 2;
        const cN = new THREE.Mesh(new THREE.BoxGeometry(rw, cH, cD), corniceMat);
        cN.position.set(cx, cy, minZ + cD / 2);
        group.add(cN);
        const cS = new THREE.Mesh(new THREE.BoxGeometry(rw, cH, cD), corniceMat);
        cS.position.set(cx, cy, maxZ - cD / 2);
        group.add(cS);
        const cW = new THREE.Mesh(new THREE.BoxGeometry(cD, cH, rd - cD * 2), corniceMat);
        cW.position.set(minX + cD / 2, cy, cz);
        group.add(cW);
        const cE = new THREE.Mesh(new THREE.BoxGeometry(cD, cH, rd - cD * 2), corniceMat);
        cE.position.set(maxX - cD / 2, cy, cz);
        group.add(cE);

        // Band 3: Classical Dentil / Bed Fascia Trim (beneath cove)
        const dH = 0.06;
        const dD = 0.05;
        const dy = y0 + ceilH - fH - cH - dH / 2;
        const dN = new THREE.Mesh(new THREE.BoxGeometry(rw, dH, dD), dentilMat);
        dN.position.set(cx, dy, minZ + dD / 2);
        group.add(dN);
        const dS = new THREE.Mesh(new THREE.BoxGeometry(rw, dH, dD), dentilMat);
        dS.position.set(cx, dy, maxZ - dD / 2);
        group.add(dS);
        const dW = new THREE.Mesh(new THREE.BoxGeometry(dD, dH, rd - dD * 2), dentilMat);
        dW.position.set(minX + dD / 2, dy, cz);
        group.add(dW);
        const dE = new THREE.Mesh(new THREE.BoxGeometry(dD, dH, rd - dD * 2), dentilMat);
        dE.position.set(maxX - dD / 2, dy, cz);
        group.add(dE);



        this.scene.add(group);
      };

      // 2. Helper: Grand Beaux-Arts Coffered Laylight / Skylight Grid (flush ceiling integration)
      const addCofferedSkylight = (cx, cz, w, d, rows = 8, cols = 4) => {
        const skylightGroup = new THREE.Group();
        skylightGroup.position.set(cx, y0 + ceilH - 0.02, cz);

        // Outer stepped architrave border
        const outerFrame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.36, 0.05, d + 0.36), corniceMat);
        outerFrame.position.set(0, -0.01, 0);
        skylightGroup.add(outerFrame);

        // Diffuse luminous glazed sky panel
        const glassPanel = new THREE.Mesh(new THREE.PlaneGeometry(w, d), skylightGlassMat);
        glassPanel.rotation.x = Math.PI / 2;
        glassPanel.position.set(0, 0.005, 0);
        skylightGroup.add(glassPanel);

        // Classical architectural bronze glazing mullions
        const barH = 0.030;
        const barW = 0.040;
        for (let c = 1; c < cols; c++) {
          const mx = -w / 2 + (w / cols) * c;
          const bar = new THREE.Mesh(new THREE.BoxGeometry(barW, barH, d), mullionMat);
          bar.position.set(mx, -0.012, 0);
          skylightGroup.add(bar);
        }
        for (let r = 1; r < rows; r++) {
          const mz = -d / 2 + (d / rows) * r;
          const bar = new THREE.Mesh(new THREE.BoxGeometry(w, barH, barW), mullionMat);
          bar.position.set(0, -0.012, mz);
          skylightGroup.add(bar);
        }

        // Soft ambient daylight glow radiating down from the laylight
        const skyLight = new THREE.PointLight(0xdff0fc, fl === this.playerFloor ? 0.40 : 0, 20.0, 1.3);
        skyLight._origIntensity = 0.40;
        skyLight.position.set(0, -0.75, 0);
        skylightGroup.add(skyLight);
        if (this.floorLights && this.floorLights[fl]) this.floorLights[fl].push(skyLight);

        this.scene.add(skylightGroup);
      };

      // Apply classical room-bounded entablature cornices to all exhibition wings
      addRoomPerimeterCornice(-35.8, -16.2, -5.8, 17.8); // West Wing Exhibition Gallery
      addRoomPerimeterCornice(-15.8, -4.2, -17.8, 27.8); // Main Gallery Concourse
      addRoomPerimeterCornice(4.2, 27.8, -25.8, 7.8);    // East Main Hall
      addRoomPerimeterCornice(-3.8, 27.8, -39.8, -26.2); // North Antiquities Gallery
      addRoomPerimeterCornice(19.2, 32.8, 8.2, 17.8);   // Arts & Music Office
      addRoomPerimeterCornice(4.2, 27.8, 18.2, 27.8);    // South-East Media Wing
      addRoomPerimeterCornice(-33.8, -24.2, 18.2, 27.8);// West Office

      // Apply grand coffered laylights to the elevated ceilings of the monumental halls
      addCofferedSkylight(-26.0, 6.0, 11.0, 15.0, 6, 4);   // West Wing Salon laylight
      addCofferedSkylight(-10.0, 5.0, 5.6, 30.0, 10, 4);   // Main Gallery central spine
      addCofferedSkylight(16.0, -9.0, 14.0, 22.0, 8, 6);   // East Main Hall grand skylight
      addCofferedSkylight(12.0, -33.0, 18.0, 7.0, 4, 8);   // North Gallery central laylight
      addCofferedSkylight(16.0, 23.0, 12.0, 5.4, 4, 6);    // South-East Media Wing laylight
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
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1
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
        const frameD = 0.36; // 36cm frame depth leaves clean 2cm gap from 40cm wall faces, eliminating coplanar Z-fighting

        // Recessed pocket jamb frames on North and South sides of doorway opening
        const leftJamb = new THREE.Mesh(new THREE.BoxGeometry(frameD, frameH, frameW), doorAlumMat);
        leftJamb.position.set(4.0, y0 + frameH / 2, doorZ - 0.96);
        this.scene.add(leftJamb);

        const rightJamb = new THREE.Mesh(new THREE.BoxGeometry(frameD, frameH, frameW), doorAlumMat);
        rightJamb.position.set(4.0, y0 + frameH / 2, doorZ + 0.96);
        this.scene.add(rightJamb);

        // Commercial aluminum overhead track operator housing (spans within 2.0m doorway opening without drywall intersection)
        const trackHeader = new THREE.Mesh(new THREE.BoxGeometry(frameD, 0.18, 1.96), doorAlumMat);
        trackHeader.position.set(4.0, y0 + frameH - 0.09, doorZ);
        this.scene.add(trackHeader);

        // Floor guide threshold groove
        const floorGuide = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 1.84), doorAlumMat);
        floorGuide.position.set(4.0, y0 + 0.01, doorZ);
        this.scene.add(floorGuide);

        // Dual motion sensor housings mounted directly on vertical faces of track header within opening
        const sensorLEDMat = new THREE.MeshBasicMaterial({ color: 0x00e5ff });
        [-0.19, 0.19].forEach((ox) => {
          const pod = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.22), sensorPodMat);
          pod.position.set(4.0 + ox, y0 + frameH - 0.09, doorZ);
          this.scene.add(pod);

          const led = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.012, 0.04), sensorLEDMat);
          led.position.set(4.0 + ox + (ox > 0 ? 0.016 : -0.016), y0 + frameH - 0.09, doorZ);
          this.scene.add(led);
        });

        // Helper to construct one sliding glass door leaf (width: 0.96m, height: 2.26m)
        // Perfectly sized to seal the 1.84m clear opening with a 4cm center meeting overlap without ever penetrating jambs or walls
        const createLeaf = (isLeft) => {
          const leafGroup = new THREE.Group();
          const leafW = 0.96;
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

          // Vertical perimeter stiles (contained cleanly within leaf bounds)
          const stileOuter = new THREE.Mesh(new THREE.BoxGeometry(glassThick + 0.02, leafH, 0.04), doorAlumMat);
          stileOuter.position.set(0, leafH / 2, isLeft ? -leafW / 2 + 0.02 : leafW / 2 - 0.02);
          leafGroup.add(stileOuter);

          const stileInner = new THREE.Mesh(new THREE.BoxGeometry(glassThick + 0.015, leafH, 0.035), doorAlumMat);
          stileInner.position.set(0, leafH / 2, isLeft ? leafW / 2 - 0.0175 : -leafW / 2 + 0.0175);
          leafGroup.add(stileInner);

          // Meeting edge rubber bumper
          const bumper = new THREE.Mesh(new THREE.BoxGeometry(glassThick + 0.005, leafH - 0.04, 0.015), sensorPodMat);
          bumper.position.set(0, leafH / 2, isLeft ? leafW / 2 : -leafW / 2);
          leafGroup.add(bumper);

          // Dual horizontal frosted safety decals across the glass (clear of stiles with polygonOffset)
          [-0.06, 0.06].forEach((dy) => {
            const decal = new THREE.Mesh(new THREE.BoxGeometry(glassThick + 0.004, 0.035, leafW - 0.10), frostedDecalMat);
            decal.position.set(0, 1.15 + dy, 0);
            leafGroup.add(decal);
          });

          return leafGroup;
        };

        const leftLeaf = createLeaf(true);
        const rightLeaf = createLeaf(false);

        // Closed positions: leaves meet at doorZ in center with 4cm overlap; outer edges stop cleanly at ±0.94m (6cm before wall!)
        const closedZLeft = doorZ - 0.46;
        const closedZRight = doorZ + 0.46;

        // Open positions: leaves retreat safely inside opening
        const openZLeft = doorZ - 1.25;
        const openZRight = doorZ + 1.25;

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
          minZ: doorZ - 0.94,
          maxZ: doorZ + 0.94
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

      // Authentic antique library bindings (deep leather, morocco, dark cloth, gilt tooling)
      const antiqueBindings = [
        new THREE.MeshLambertMaterial({ color: 0x3d1c1f }), // Deep Morocco Red
        new THREE.MeshLambertMaterial({ color: 0x241812 }), // Antique Calfskin Brown
        new THREE.MeshLambertMaterial({ color: 0x162330 }), // Oxford Navy Cloth
        new THREE.MeshLambertMaterial({ color: 0x15281b }), // Archival Forest Green
        new THREE.MeshLambertMaterial({ color: 0x301d14 }), // Dark Chocolate Leather
        new THREE.MeshLambertMaterial({ color: 0x3b3024 }), // Aged Vellum
        new THREE.MeshLambertMaterial({ color: 0x281926 }), // Deep Aubergine
        new THREE.MeshLambertMaterial({ color: 0x48291a })  // Antique Russet
      ];
      const giltMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.8, roughness: 0.3 });
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

        const colors = [antiqueBindings[0], antiqueBindings[2], antiqueBindings[4]];
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

        const cover = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.01, 0.30), antiqueBindings[3]);
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

        // West Wall Perimeter Bookcase: Authentic open casing with visible shelves and book rows (x = -3.55, z: -5.4..1.4)
        const wallBookshelfGroup = new THREE.Group();
        wallBookshelfGroup.position.set(-3.55, y0, -2.0);

        // 1. Back panel resting flush against West wall
        const backPanel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 3.40, 6.60), woodMat);
        backPanel.position.set(-0.23, 1.70, 0);
        wallBookshelfGroup.add(backPanel);

        // 2. Top crown cornice and bottom base plinth
        const topCornice = new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.08, 6.60), woodMat);
        topCornice.position.set(0, 3.36, 0);
        wallBookshelfGroup.add(topCornice);

        const basePlinth = new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.08, 6.60), woodMat);
        basePlinth.position.set(0, 0.04, 0);
        wallBookshelfGroup.add(basePlinth);

        // 3. Left and right outer side gable uprights
        const leftGable = new THREE.Mesh(new THREE.BoxGeometry(0.48, 3.24, 0.05), woodMat);
        leftGable.position.set(0.01, 1.70, -3.275);
        wallBookshelfGroup.add(leftGable);

        const rightGable = new THREE.Mesh(new THREE.BoxGeometry(0.48, 3.24, 0.05), woodMat);
        rightGable.position.set(0.01, 1.70, 3.275);
        wallBookshelfGroup.add(rightGable);

        // 4. Intermediate vertical bay dividers (creating 4 handsome bookcase bays)
        [-1.65, 0.0, 1.65].forEach((divZ) => {
          const divider = new THREE.Mesh(new THREE.BoxGeometry(0.44, 3.24, 0.04), woodMat);
          divider.position.set(0.01, 1.70, divZ);
          wallBookshelfGroup.add(divider);
        });

        // 5. Five inset open horizontal shelves across all bays
        for (let s = 0; s < 5; s++) {
          const sy = 0.50 + s * 0.60;
          const shelfPlank = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.04, 6.50), darkWoodMat);
          shelfPlank.position.set(0.01, sy, 0);
          wallBookshelfGroup.add(shelfPlank);

          // Populate shelf with realistic individual book volumes with varied heights & gold spine ribbing
          for (let b = -3.05; b < 3.05; b += 0.054) {
            // Leave a small gap near dividers
            if (Math.abs(b - (-1.65)) < 0.06 || Math.abs(b) < 0.06 || Math.abs(b - 1.65) < 0.06) continue;
            // Occasional book gap / natural book stack spacing
            if (Math.sin(b * 12.3 + s * 4.7) > 0.82) continue;
            const bIdx = Math.abs(Math.round(b * 19 + s * 7)) % antiqueBindings.length;
            const bMat = antiqueBindings[bIdx];
            const bWidth = 0.038 + ((Math.abs(b * 3 + s) % 3) * 0.008);
            const bHeight = 0.30 + ((Math.abs(b * 7 + s) % 5) * 0.024);
            const bookDepth = 0.22;
            const book = new THREE.Mesh(new THREE.BoxGeometry(bookDepth, bHeight, bWidth), bMat);
            book.position.set(-0.06, sy + bHeight / 2 + 0.02, b);
            wallBookshelfGroup.add(book);

            // Subtle gold-embossed spine ribbing on select volumes
            if (bIdx % 2 === 0) {
              const spineRib = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.010, bWidth * 0.88), giltMat);
              spineRib.position.set(-0.06 + bookDepth / 2 + 0.002, sy + bHeight * 0.7 + 0.02, b);
              wallBookshelfGroup.add(spineRib);
            }
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

        const ribbon = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.04, 12), antiqueBindings[0]);
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
        const bookMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.65, metalness: 0.08 });
        const cartBookMats = bookColors.map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.65, metalness: 0.08 }));
        const bookColorValues = bookColors.map(c => new THREE.Color(c));
        const paperPageMat = new THREE.MeshLambertMaterial({ color: 0xf5eedc });
        const bookGeometryCache = new Map();
        const bookTransform = new THREE.Object3D();
        const bookOffsetMatrix = new THREE.Matrix4();

        rangeZCoords.forEach((rz, rIdx) => {
          const bookInstanceBatches = new Map();
          const addBookInstance = (
            key, geometryKey, material, createGeometry, matrix,
            regionIndex, regionCenterX, regionRadius, instanceColor = null
          ) => {
            const batchKey = `${regionIndex}_${key}`;
            let batch = bookInstanceBatches.get(batchKey);
            if (!batch) {
              const regionalGeometryKey = `${regionIndex}_${geometryKey}`;
              let geometry = bookGeometryCache.get(regionalGeometryKey);
              if (!geometry) {
                geometry = createGeometry();
                geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(regionCenterX, rangeH / 2, 0), regionRadius);
                bookGeometryCache.set(regionalGeometryKey, geometry);
              }
              batch = { geometry, material, matrices: [], colors: [] };
              bookInstanceBatches.set(batchKey, batch);
            }
            batch.matrices.push(matrix);
            if (instanceColor) batch.colors.push(instanceColor);
          };

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
                const regionIndex = b;
                const regionCenterX = bayCenterX;
                const regionRadius = Math.sqrt(
                  (bayW / 2 + 0.15) ** 2 +
                  (rangeH / 2 + 0.15) ** 2 +
                  (rangeD / 2 + 0.15) ** 2
                );
                const bookCount = 9;
                for (let k = 0; k < bookCount; k++) {
                  const bkW = 0.035 + (k % 3) * 0.015;
                  const bkH = tierH * 0.72 + (k % 4) * 0.035;
                  const bkD = 0.26 + (k % 2) * 0.03;
                  const bkX = bayCenterX - bayW / 2 + 0.08 + k * (bayW - 0.16) / bookCount;
                  const materialIndex = (rIdx * 3 + b * 2 + k) % bookColors.length;
                  const angled = k === bookCount - 1 && b % 2 === 0;
                  bookTransform.position.set(
                    bkX + (angled ? 0.02 : 0),
                    sy + 0.02 + bkH / 2,
                    sideDir * (rangeD / 4)
                  );
                  bookTransform.rotation.set(0, 0, angled ? -0.16 : 0);
                  bookTransform.updateMatrix();

                  const bodyGeometryKey = `body_${bkW}_${bkH}_${bkD}`;
                  addBookInstance(
                    bodyGeometryKey,
                    bodyGeometryKey,
                    bookMat,
                    () => new THREE.BoxGeometry(bkW, bkH, bkD),
                    bookTransform.matrix.clone(),
                    regionIndex,
                    regionCenterX,
                    regionRadius,
                    bookColorValues[materialIndex]
                  );

                  const pagesGeometryKey = `pages_${bkW}_${bkH}_${bkD}`;
                  bookOffsetMatrix.makeTranslation(0, 0, -sideDir * 0.016);
                  addBookInstance(
                    pagesGeometryKey,
                    pagesGeometryKey,
                    paperPageMat,
                    () => new THREE.BoxGeometry(bkW - 0.006, bkH - 0.014, bkD * 0.88),
                    bookTransform.matrix.clone().multiply(bookOffsetMatrix),
                    regionIndex,
                    regionCenterX,
                    regionRadius
                  );

                  if (k % 2 === 0) {
                    const goldGeometryKey = `gold_${bkW}`;
                    bookOffsetMatrix.makeTranslation(0, bkH * 0.22, sideDir * (bkD / 2 - 0.004));
                    addBookInstance(
                      goldGeometryKey,
                      goldGeometryKey,
                      brassMat,
                      () => new THREE.BoxGeometry(bkW + 0.002, 0.008, 0.012),
                      bookTransform.matrix.clone().multiply(bookOffsetMatrix),
                      regionIndex,
                      regionCenterX,
                      regionRadius
                    );
                  }
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

          for (const batch of bookInstanceBatches.values()) {
            const instancedBooks = new THREE.InstancedMesh(batch.geometry, batch.material, batch.matrices.length);
            instancedBooks.instanceMatrix.setUsage(THREE.StaticDrawUsage);
            batch.matrices.forEach((matrix, index) => {
              instancedBooks.setMatrixAt(index, matrix);
              if (batch.colors.length > 0) instancedBooks.setColorAt(index, batch.colors[index]);
            });
            if (instancedBooks.instanceColor) {
              instancedBooks.instanceColor.setUsage(THREE.StaticDrawUsage);
              instancedBooks.instanceColor.needsUpdate = true;
            }
            instancedBooks.frustumCulled = true;
            rangeGroup.add(instancedBooks);
          }

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
              const vMat = cartBookMats[(bi * 3 + v) % cartBookMats.length];
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
          maxY: cy + crateH,
          isCrate: true,
          crate: null
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
        col.crate = crateEntry;
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
        roughness: 0.42,
        metalness: 0.05
      });

      // 4 Heavy-duty reinforced corner columns with outer corner radius/caps
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

        // Molded corner vertical rib flutes for authentic industrial milk crate strength
        const flute = new THREE.Mesh(new THREE.BoxGeometry(postW * 1.08, h * 0.94, postW * 1.08), plasticMat);
        flute.position.set(ox, 0, oz);
        group.add(flute);
      });

      // Top reinforced perimeter rim band with molded outer lip
      const rimH = 0.042;
      const rimThick = 0.032;
      [-d / 2 + rimThick / 2, d / 2 - rimThick / 2].forEach((rz) => {
        const rimBar = new THREE.Mesh(new THREE.BoxGeometry(w, rimH, rimThick), plasticMat);
        rimBar.position.set(0, h / 2 - rimH / 2, rz);
        group.add(rimBar);

        // Top stacking lip
        const lip = new THREE.Mesh(new THREE.BoxGeometry(w, 0.010, rimThick * 1.15), plasticMat);
        lip.position.set(0, h / 2 - 0.005, rz);
        group.add(lip);
      });
      [-w / 2 + rimThick / 2, w / 2 - rimThick / 2].forEach((rx) => {
        const rimBar = new THREE.Mesh(new THREE.BoxGeometry(rimThick, rimH, d - rimThick * 2), plasticMat);
        rimBar.position.set(rx, h / 2 - rimH / 2, 0);
        group.add(rimBar);

        // Top stacking lip
        const lip = new THREE.Mesh(new THREE.BoxGeometry(rimThick * 1.15, 0.010, d - rimThick * 2), plasticMat);
        lip.position.set(rx, h / 2 - 0.005, 0);
        group.add(lip);
      });

      // Bottom perimeter base frame (rests flat at y = -h/2 with zero ground penetration)
      const botH = 0.036;
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

      // Interlocking bottom floor grid (latticed square matrix with central reinforcement)
      for (let gx = -3; gx <= 3; gx++) {
        const barX = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.014, d - rimThick * 2), plasticMat);
        barX.position.set(gx * 0.046, -h / 2 + 0.018, 0);
        group.add(barX);
      }
      for (let gz = -3; gz <= 3; gz++) {
        const barZ = new THREE.Mesh(new THREE.BoxGeometry(w - rimThick * 2, 0.014, 0.014), plasticMat);
        barZ.position.set(0, -h / 2 + 0.018, gz * 0.046);
        group.add(barZ);
      }

      // Molded side walls with handle openings, solid horizontal blockage bar, and fully enclosed lattice grid
      // North & South walls (Z = ±(d/2 - 0.012))
      [-d / 2 + 0.012, d / 2 - 0.012].forEach((sz) => {
        // Lower solid molded label/reinforcement panel (spans y: -0.119 to -0.079)
        const lowPanel = new THREE.Mesh(new THREE.BoxGeometry(w - 0.06, 0.040, 0.014), plasticMat);
        lowPanel.position.set(0, -h / 2 + botH + 0.020, sz);
        group.add(lowPanel);

        // Handle cutout flanks (width: 0.15m handle opening in center)
        const handleCutoutW = 0.15;
        const flankW = (w - 0.06 - handleCutoutW) / 2;
        const handleH = 0.059; // from y = 0.054 up to top rim (0.113)
        const leftHandleFlank = new THREE.Mesh(new THREE.BoxGeometry(flankW, handleH, 0.014), plasticMat);
        leftHandleFlank.position.set(-(w - 0.06 + handleCutoutW) / 4, 0.054 + handleH / 2, sz);
        group.add(leftHandleFlank);

        const rightHandleFlank = new THREE.Mesh(new THREE.BoxGeometry(flankW, handleH, 0.014), plasticMat);
        rightHandleFlank.position.set((w - 0.06 + handleCutoutW) / 4, 0.054 + handleH / 2, sz);
        group.add(rightHandleFlank);

        // Smooth molded ergonomic rounded grip bar over handle opening
        const gripBar = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, handleCutoutW - 0.005, 12), plasticMat);
        gripBar.rotation.z = Math.PI / 2;
        gripBar.position.set(0, h / 2 - rimH - 0.008, sz);
        group.add(gripBar);

        // Continuous full-width horizontal blockage beam directly beneath handle opening
        // Caps all vertical support beams so no lattice line is left open or floating in air
        const handleLedge = new THREE.Mesh(new THREE.BoxGeometry(w - 0.06, 0.016, 0.014), plasticMat);
        handleLedge.position.set(0, 0.046, sz);
        group.add(handleLedge);

        // Intermediate horizontal lattice ribs evenly spaced between bottom plate and handle ledge
        for (let r = 0; r < 3; r++) {
          const ry = -0.079 + 0.031 * (r + 1);
          const hRib = new THREE.Mesh(new THREE.BoxGeometry(w - 0.06, 0.012, 0.014), plasticMat);
          hRib.position.set(0, ry, sz);
          group.add(hRib);
        }

        // Vertical support ribs: run solidly from bottom panel to the top horizontal blockage bar
        const vRibH = 0.135;
        const vRibY = -0.0165;
        for (let c = -3; c <= 3; c++) {
          const vx = c * 0.042;
          const vRib = new THREE.Mesh(new THREE.BoxGeometry(0.012, vRibH, 0.014), plasticMat);
          vRib.position.set(vx, vRibY, sz);
          group.add(vRib);
        }
      });

      // East & West walls (X = ±(w/2 - 0.012))
      [-w / 2 + 0.012, w / 2 - 0.012].forEach((sx) => {
        // Lower solid molded label/reinforcement panel (spans y: -0.119 to -0.079)
        const lowPanel = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.040, d - 0.06), plasticMat);
        lowPanel.position.set(sx, -h / 2 + botH + 0.020, 0);
        group.add(lowPanel);

        // Handle cutout flanks
        const handleCutoutW = 0.15;
        const flankD = (d - 0.06 - handleCutoutW) / 2;
        const handleH = 0.059;
        const leftHandleFlank = new THREE.Mesh(new THREE.BoxGeometry(0.014, handleH, flankD), plasticMat);
        leftHandleFlank.position.set(sx, 0.054 + handleH / 2, -(d - 0.06 + handleCutoutW) / 4);
        group.add(leftHandleFlank);

        const rightHandleFlank = new THREE.Mesh(new THREE.BoxGeometry(0.014, handleH, flankD), plasticMat);
        rightHandleFlank.position.set(sx, 0.054 + handleH / 2, (d - 0.06 + handleCutoutW) / 4);
        group.add(rightHandleFlank);

        // Smooth molded ergonomic rounded grip bar
        const gripBar = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, handleCutoutW - 0.005, 12), plasticMat);
        gripBar.rotation.x = Math.PI / 2;
        gripBar.position.set(sx, h / 2 - rimH - 0.008, 0);
        group.add(gripBar);

        // Continuous full-width horizontal blockage beam directly beneath handle opening
        const handleLedge = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.016, d - 0.06), plasticMat);
        handleLedge.position.set(sx, 0.046, 0);
        group.add(handleLedge);

        // Intermediate horizontal lattice ribs evenly spaced
        for (let r = 0; r < 3; r++) {
          const ry = -0.079 + 0.031 * (r + 1);
          const hRib = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.012, d - 0.06), plasticMat);
          hRib.position.set(sx, ry, 0);
          group.add(hRib);
        }

        // Vertical support ribs: run solidly from bottom panel to the top horizontal blockage bar
        const vRibH = 0.135;
        const vRibY = -0.0165;
        for (let c = -3; c <= 3; c++) {
          const vz = c * 0.042;
          const vRib = new THREE.Mesh(new THREE.BoxGeometry(0.014, vRibH, 0.012), plasticMat);
          vRib.position.set(sx, vRibY, vz);
          group.add(vRib);
        }
      });

      return group;
    }

    tryPickupCrate() {
      if (!this.physicsCrates || this.physicsCrates.length === 0) return false;
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
      const cosPitch = Math.cos(this.playerPitch);
      const sinPitch = Math.sin(this.playerPitch);
      const cosYaw = Math.cos(this.playerYaw);
      const sinYaw = Math.sin(this.playerYaw);
      const fwd = new THREE.Vector3(-sinYaw * cosPitch, sinPitch, -cosYaw * cosPitch);

      crate.isHeld = false;
      crate.collider.disabled = false;
      crate.isCollapsed = true;

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

    resolveCrateStaticCollisions(crate, floorIdx, previousY = crate.y) {
      const cosY = Math.abs(Math.cos(crate.rotY));
      const sinY = Math.abs(Math.sin(crate.rotY));
      const halfX = (cosY * crate.w + sinY * crate.d) / 2;
      const halfZ = (sinY * crate.w + cosY * crate.d) / 2;
      let impact = false;

      const resolveObstacle = (obstacle) => {
        if (obstacle.disabled || obstacle.isCrate ||
            (obstacle.floor !== 'all' && obstacle.floor !== floorIdx)) return;
        if (obstacle.type !== 'box' && obstacle.type !== 'cylinder') return;
        if (obstacle.type === 'box' &&
            (obstacle.minX === obstacle.maxX || obstacle.minZ === obstacle.maxZ)) return;

        const floorY = floorIdx * CONFIG.FLOOR_HEIGHT;
        const hasVerticalBounds = obstacle.minY !== undefined || obstacle.maxY !== undefined;
        const obstacleMinY = obstacle.minY === undefined ? floorY : obstacle.minY;
        const obstacleMaxY = obstacle.maxY === undefined
          ? floorY + CONFIG.FLOOR_HEIGHT
          : obstacle.maxY;
        const overlapY = Math.min(crate.y + crate.h, obstacleMaxY) -
                         Math.max(crate.y, obstacleMinY);

        let nx = 0;
        let nz = 0;
        let horizontalPenetration = 0;

        if (obstacle.type === 'box') {
          const minX = obstacle.minX - halfX;
          const maxX = obstacle.maxX + halfX;
          const minZ = obstacle.minZ - halfZ;
          const maxZ = obstacle.maxZ + halfZ;
          if (crate.x <= minX || crate.x >= maxX || crate.z <= minZ || crate.z >= maxZ) return;

          const penLeft = crate.x - minX;
          const penRight = maxX - crate.x;
          const penNear = crate.z - minZ;
          const penFar = maxZ - crate.z;
          horizontalPenetration = Math.min(penLeft, penRight, penNear, penFar);
          if (horizontalPenetration === penLeft) nx = -1;
          else if (horizontalPenetration === penRight) nx = 1;
          else if (horizontalPenetration === penNear) nz = -1;
          else nz = 1;
        } else {
          const closestX = Math.max(crate.x - halfX, Math.min(obstacle.x, crate.x + halfX));
          const closestZ = Math.max(crate.z - halfZ, Math.min(obstacle.z, crate.z + halfZ));
          let dx = closestX - obstacle.x;
          let dz = closestZ - obstacle.z;
          const distance = Math.hypot(dx, dz);
          if (distance >= obstacle.radius) return;
          if (distance > 0.0001) {
            nx = dx / distance;
            nz = dz / distance;
          } else {
            const marginX = halfX - Math.abs(obstacle.x - crate.x);
            const marginZ = halfZ - Math.abs(obstacle.z - crate.z);
            if (marginX <= marginZ) {
              nx = crate.x >= obstacle.x ? 1 : -1;
              horizontalPenetration = obstacle.radius + marginX;
            } else {
              nz = crate.z >= obstacle.z ? 1 : -1;
              horizontalPenetration = obstacle.radius + marginZ;
            }
          }
          if (distance > 0.0001) horizontalPenetration = obstacle.radius - distance;
        }

        const landedOnObstacle = hasVerticalBounds && crate.vy <= 0 &&
          previousY >= obstacleMaxY && crate.y < obstacleMaxY;
        const hitObstacleUnderside = hasVerticalBounds && crate.vy > 0 &&
          previousY + crate.h <= obstacleMinY && crate.y + crate.h > obstacleMinY;
        if (landedOnObstacle) {
          crate.y = obstacleMaxY;
          if (Math.abs(crate.vy) > 1.4) {
            crate.vy = -crate.vy * 0.18;
            crate.vx *= 0.55;
            crate.vz *= 0.55;
            impact = true;
          } else {
            crate.vy = 0;
          }
        } else if (hitObstacleUnderside) {
          crate.y = obstacleMinY - crate.h;
          if (crate.vy > 1.4) {
            crate.vy = -crate.vy * 0.18;
            impact = true;
          } else {
            crate.vy = 0;
          }
        } else if (overlapY <= 0) {
          return;
        } else {
          crate.x += nx * horizontalPenetration;
          crate.z += nz * horizontalPenetration;
          const horizontalNormalVelocity = crate.vx * nx + crate.vz * nz;
          if (horizontalNormalVelocity < 0) {
            const impulse = (1 + 0.35) * horizontalNormalVelocity;
            crate.vx -= impulse * nx;
            crate.vz -= impulse * nz;
            if (Math.abs(horizontalNormalVelocity) > 2.0) impact = true;
          }
        }
      };

      for (const obstacle of this.colliders) {
        resolveObstacle(obstacle);
      }

      const playerFootY = this.playerPos.y - this.currentCamHeight + this.jumpOffset;
      if (this.playerFloor === floorIdx) {
        resolveObstacle({
          type: 'cylinder',
          floor: this.playerFloor,
          x: this.playerPos.x,
          z: this.playerPos.z,
          radius: CONFIG.PLAYER.RADIUS || 0.35,
          minY: playerFootY,
          maxY: playerFootY + this.currentCamHeight
        });
      }

      if (this.smittyPos && this.smittyFloor === floorIdx &&
          this.smittyState !== 'DEAD' && this.smittyState !== 'RESPAWNING' &&
          this.smittyEnabled) {
        resolveObstacle({
          type: 'cylinder',
          floor: this.smittyFloor,
          x: this.smittyPos.x,
          z: this.smittyPos.z,
          radius: 0.40,
          minY: this.smittyPos.y,
          maxY: this.smittyPos.y + 2.35
        });
      }

      return impact;
    }

    triggerCrateStackCollapse(baseCrate, impactVx = 0, impactVz = 0) {
      if (!baseCrate || baseCrate.isCollapsed) return;
      baseCrate.isCollapsed = true;

      // Realistic Half-Life 2 prop impulse: absorb incoming momentum + scatter burst
      baseCrate.vx = impactVx * 0.65 + (Math.random() - 0.5) * 3.2;
      baseCrate.vz = impactVz * 0.65 + (Math.random() - 0.5) * 3.2;
      baseCrate.vy = Math.max(0.6, Math.abs(impactVx + impactVz) * 0.25) + Math.random() * 0.8;
      baseCrate.angVx = (Math.random() - 0.5) * 14.0;
      baseCrate.angVz = (Math.random() - 0.5) * 14.0;
      baseCrate.angVy = (Math.random() - 0.5) * 8.0;

      if (baseCrate.supportedCrates && baseCrate.supportedCrates.length > 0) {
        baseCrate.supportedCrates.forEach((child, idx) => {
          // Propagate cascade toppling upwards through the stack
          this.triggerCrateStackCollapse(child, baseCrate.vx * 0.85, baseCrate.vz * 0.85);
        });
        baseCrate.supportedCrates = [];
      }

      if (Math.hypot(baseCrate.vx, baseCrate.vz, baseCrate.vy) > 1.8) {
        this.audio.playCrateImpact();
      }
    }

    updatePhysicsCrates(delta) {
      if (!this.physicsCrates || this.physicsCrates.length === 0) return;

      const cosPitch = Math.cos(this.playerPitch);
      const sinPitch = Math.sin(this.playerPitch);
      const cosYaw = Math.cos(this.playerYaw);
      const sinYaw = Math.sin(this.playerYaw);
      const fwd = new THREE.Vector3(-sinYaw * cosPitch, sinPitch, -cosYaw * cosPitch);

      // 1. Handle held crate position and viewmodel anywhere on map
      if (this.heldCrate) {
        const hc = this.heldCrate;
        const targetX = this.camera.position.x + fwd.x * 1.45;
        const targetY = this.camera.position.y + fwd.y * 1.45 - 0.22;
        const targetZ = this.camera.position.z + fwd.z * 1.45;

        // Follow player smoothly anywhere in the museum without single-room boundaries
        hc.x = THREE.MathUtils.lerp(hc.x, targetX, Math.min(1, delta * 22));
        hc.y = THREE.MathUtils.lerp(hc.y, targetY, Math.min(1, delta * 22));
        hc.z = THREE.MathUtils.lerp(hc.z, targetZ, Math.min(1, delta * 22));
        hc.rotY = THREE.MathUtils.lerp(hc.rotY, this.playerYaw, Math.min(1, delta * 16));
        hc.rotX = THREE.MathUtils.lerp(hc.rotX, 0, Math.min(1, delta * 16));
        hc.rotZ = THREE.MathUtils.lerp(hc.rotZ, 0, Math.min(1, delta * 16));

        hc.mesh.position.set(hc.x, hc.y + hc.h / 2, hc.z);
        hc.mesh.rotation.set(hc.rotX, hc.rotY, hc.rotZ);

        hc.collider.disabled = true;
        hc.collider.minX = 0;
        hc.collider.maxX = 0;
        hc.collider.minZ = 0;
        hc.collider.maxZ = 0;
        hc.collider.minY = -999;
        hc.collider.maxY = -999;
      }

      // 2. Player stepping ON TOP of stacks (leverage wobble / tipping)
      let standingCrate = null;
      const footY = (this.playerPos.y - this.currentCamHeight) + this.jumpOffset;
      if (this.isGrounded) {
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

      // 3. Player STEPPING AGAINST / WALKING INTO Crates (dynamic pushing & stack toppling)
      const pRad = CONFIG.PLAYER.RADIUS || 0.35;
      for (let i = 0; i < this.physicsCrates.length; i++) {
        const c = this.physicsCrates[i];
        if (c.isHeld) continue;

        // Verify player is on the same vertical elevation and pushing against crate side
        if (footY < c.y + c.h - 0.06 && footY + 1.8 > c.y) {
          const pdx = c.x - this.playerPos.x;
          const pdz = c.z - this.playerPos.z;
          const pdist = Math.hypot(pdx, pdz);
          const contactDist = pRad + c.w * 0.55;

          if (pdist < contactDist) {
            if (!c.isCollapsed) {
              this.triggerCrateStackCollapse(c);
            }
            const pnx = pdx / (pdist || 0.001);
            const pnz = pdz / (pdist || 0.001);
            const overlap = contactDist - pdist;

            // Displace crate outward so it glides away from player
            c.x += pnx * overlap * 0.90;
            c.z += pnz * overlap * 0.90;

            const pSpeed = this.playerVelocity.length();
            const pushImpulse = Math.max(3.8, pSpeed * 1.6) * (this.isSprinting ? 1.5 : 1.0);
            c.vx += pnx * pushImpulse;
            c.vz += pnz * pushImpulse;
            c.vy += 0.8; // realistic hop from foot contact
            c.angVx += (Math.random() - 0.5) * 6.0;
            c.angVz += (Math.random() - 0.5) * 6.0;
            c.angVy += (Math.random() - 0.5) * 4.0;

            if (Math.random() < 0.25) this.audio.playCrateCreak();
          }
        }
      }

      // 4. Update Movement & Gravity for All Collapsed / Dynamic Crates
      for (let i = 0; i < this.physicsCrates.length; i++) {
        const c = this.physicsCrates[i];
        if (c.isHeld) continue;

        if (c.isCollapsed) {
          // Dynamic floor elevation based on crate position anywhere in museum
          const cFloor = Math.max(0, Math.min(3, Math.floor((c.y + 0.2) / CONFIG.FLOOR_HEIGHT)));
          const cGroundBase = cFloor * CONFIG.FLOOR_HEIGHT;
          const cCeilY = cGroundBase + CONFIG.FLOOR_HEIGHT - 0.12;

          // Realistic gravity acceleration
          const previousY = c.y;
          c.vy -= 15.0 * delta;
          c.y += c.vy * delta;

          // Substep horizontal motion so fast throws cannot tunnel through thin wall colliders.
          const horizontalSteps = Math.min(64, Math.max(
            1,
            Math.ceil(Math.max(Math.abs(c.vx), Math.abs(c.vz)) * delta / 0.08)
          ));
          const stepDelta = delta / horizontalSteps;
          let collisionImpact = false;
          for (let step = 0; step < horizontalSteps; step++) {
            c.x += c.vx * stepDelta;
            c.z += c.vz * stepDelta;
            if (this.resolveCrateStaticCollisions(c, cFloor, previousY)) collisionImpact = true;
          }
          if (collisionImpact) this.audio.playCrateImpact();

          c.rotX += c.angVx * delta;
          c.rotY += c.angVy * delta;
          c.rotZ += c.angVz * delta;

          // Ceiling bounce
          if (c.y + c.h >= cCeilY && cCeilY > 0) {
            c.y = cCeilY - c.h;
            c.vy = -Math.abs(c.vy) * 0.45;
            c.angVx += (Math.random() - 0.5) * 6.0;
            c.angVz += (Math.random() - 0.5) * 6.0;
            if (Math.abs(c.vy) > 0.6) this.audio.playCrateImpact();
          }

          // Floor landing & sliding friction
          const drop = (c.h / 2) * Math.abs(Math.cos(c.rotX) * Math.cos(c.rotZ)) +
                       (c.d / 2) * Math.abs(Math.sin(c.rotX)) +
                       (c.w / 2) * Math.abs(Math.sin(c.rotZ));
          const groundY = cGroundBase + drop - c.h / 2;

          if (c.y <= groundY) {
            c.y = groundY;
            if (Math.abs(c.vy) > 1.4) {
              c.vy = -c.vy * 0.18;
              c.vx *= 0.55;
              c.vz *= 0.55;
              c.angVx *= 0.45;
              c.angVz *= 0.45;
              this.audio.playCrateImpact();
            } else {
              c.vy = 0;
              // Half-Life 2 style snappy ground friction: prevents ice-skating across polished floor
              const fDamp = Math.max(0, 1 - delta * 24.0);
              c.vx *= fDamp;
              c.vz *= fDamp;
              const angDamp = Math.max(0, 1 - delta * 26.0);
              c.angVx *= angDamp;
              c.angVy *= angDamp;
              c.angVz *= angDamp;

              // Immediately freeze micro-velocities to prevent perpetual jitter/sliding
              if (Math.hypot(c.vx, c.vz) < 0.08) {
                c.vx = 0;
                c.vz = 0;
              }
              if (Math.hypot(c.angVx, c.angVy, c.angVz) < 0.12) {
                c.angVx = 0;
                c.angVy = 0;
                c.angVz = 0;
              }

              // Settle resting angle smoothly toward flat
              c.rotX = THREE.MathUtils.lerp(c.rotX, 0, Math.min(1, delta * 12.0));
              c.rotZ = THREE.MathUtils.lerp(c.rotZ, 0, Math.min(1, delta * 12.0));
            }
          }

          // Museum outer perimeter boundary containment
          if (c.x < -36.5) { c.x = -36.5; if (Math.abs(c.vx) > 2.0) this.audio.playCrateImpact(); c.vx = Math.abs(c.vx) * 0.4; }
          if (c.x > 32.5) { c.x = 32.5; if (Math.abs(c.vx) > 2.0) this.audio.playCrateImpact(); c.vx = -Math.abs(c.vx) * 0.4; }
          if (c.z < -42.5) { c.z = -42.5; if (Math.abs(c.vz) > 2.0) this.audio.playCrateImpact(); c.vz = Math.abs(c.vz) * 0.4; }
          if (c.z > 37.5) { c.z = 37.5; if (Math.abs(c.vz) > 2.0) this.audio.playCrateImpact(); c.vz = -Math.abs(c.vz) * 0.4; }
        } else {
          // Stable resting in stack: spring restore minor tilts
          c.y = c.baseY;
          c.angVx += (-c.rotX * 32.0 - c.angVx * 9.0) * delta;
          c.angVz += (-c.rotZ * 32.0 - c.angVz * 9.0) * delta;
          c.rotX += c.angVx * delta;
          c.rotZ += c.angVz * delta;
        }

        c.mesh.position.set(c.x, c.y + c.h / 2, c.z);
        c.mesh.rotation.set(c.rotX, c.rotY, c.rotZ);

        c.collider.disabled = false;
        c.collider.floor = Math.max(0, Math.min(3, Math.floor((c.y + 0.2) / CONFIG.FLOOR_HEIGHT)));
        c.collider.minX = c.x - c.w / 2;
        c.collider.maxX = c.x + c.w / 2;
        c.collider.minZ = c.z - c.d / 2;
        c.collider.maxZ = c.z + c.d / 2;
        c.collider.minY = c.y;
        c.collider.maxY = c.isCollapsed ? (c.y + 0.16) : (c.y + c.h);
      }

      // 5. CRATE-ON-CRATE 3D Collisions & Momentum Exchange ("Half-Life 2 style prop physics")
      for (let i = 0; i < this.physicsCrates.length; i++) {
        const c1 = this.physicsCrates[i];
        if (c1.isHeld) continue;

        for (let j = i + 1; j < this.physicsCrates.length; j++) {
          const c2 = this.physicsCrates[j];
          if (c2.isHeld) continue;

          // If BOTH crates are intact in their stacks, skip: intact stacks never self-destruct!
          if (!c1.isCollapsed && !c2.isCollapsed) continue;

          const dx = c2.x - c1.x;
          const dz = c2.z - c1.z;
          const dy = (c2.y + c2.h / 2) - (c1.y + c1.h / 2);

          const halfW = (c1.w + c2.w) * 0.5;
          const halfD = (c1.d + c2.d) * 0.5;
          const halfH = (c1.h + c2.h) * 0.5;

          const overlapX = halfW - Math.abs(dx);
          const overlapZ = halfD - Math.abs(dz);
          const overlapY = halfH - Math.abs(dy);

          // Require physical 2cm penetration threshold
          if (overlapX > 0.02 && overlapZ > 0.02 && overlapY > 0.02) {
            // Half-Life 2 style prop reaction: when a moving/thrown crate strikes an intact crate,
            // the intact crate and its entire stack topples and absorbs the impact momentum!
            const impactVx1 = c1.vx;
            const impactVz1 = c1.vz;
            const impactVx2 = c2.vx;
            const impactVz2 = c2.vz;

            if (!c1.isCollapsed) this.triggerCrateStackCollapse(c1, impactVx2 * 0.8, impactVz2 * 0.8);
            if (!c2.isCollapsed) this.triggerCrateStackCollapse(c2, impactVx1 * 0.8, impactVz1 * 0.8);

            if (overlapY < overlapX && overlapY < overlapZ) {
              // Vertical collision (landing or stacking)
              if (dy > 0) {
                c2.y += overlapY;
                c2.vy = Math.max(0, c2.vy);
                c1.vy = Math.min(0, c1.vy);
              } else {
                c1.y += overlapY;
                c1.vy = Math.max(0, c1.vy);
                c2.vy = Math.min(0, c2.vy);
              }
            } else {
              // Horizontal collision (sides)
              const distXZ = Math.hypot(dx, dz) || 0.001;
              const nx = dx / distXZ;
              const nz = dz / distXZ;
              const hOverlap = Math.min(overlapX, overlapZ);

              // Separate crates along contact normal
              c1.x -= nx * hOverlap * 0.5;
              c1.z -= nz * hOverlap * 0.5;
              c2.x += nx * hOverlap * 0.5;
              c2.z += nz * hOverlap * 0.5;

              // Compute relative velocity along collision normal
              const relVx = c2.vx - c1.vx;
              const relVz = c2.vz - c1.vz;
              const normVel = relVx * nx + relVz * nz;

              if (normVel < 0) {
                const restitution = 0.40; // snappy plastic bounce
                const impulse = -(1 + restitution) * normVel * 0.5;

                c2.vx += impulse * nx;
                c2.vz += impulse * nz;
                c1.vx -= impulse * nx;
                c1.vz -= impulse * nz;

                // Angular tumble impulse
                c1.angVy -= impulse * 2.2;
                c2.angVy += impulse * 2.2;
                c1.angVx += (Math.random() - 0.5) * impulse * 1.8;
                c2.angVz += (Math.random() - 0.5) * impulse * 1.8;

                if (Math.abs(impulse) > 1.5) {
                  this.audio.playCrateImpact();
                }
              }
            }
          }
        }
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

    // Free-standing full-length mirror (1st floor, east hall, left of the pink runner rug).
    // True planar reflector (port of three.js r128 Reflector): renders the scene from the
    // reflected camera each frame, so first-person arms (children of the camera) and the
    // third-person player model both show up naturally.
    createHallwayMirror(mx, mz, y0) {
      const MX = mx, MZ = mz;          // world position of the mirror
      const W = 2.015, H = 2.1;            // reflective surface size
      const bottom = 0.18;               // gap between floor and glass

      const group = new THREE.Group();
      group.position.set(MX, y0, MZ);
      group.rotation.y = 0;              // glass faces +Z (toward the south / hall entrance)
      this.scene.add(group);

      const frameMat = new THREE.MeshStandardMaterial({ color: 0x3b2a1a, roughness: 0.55, metalness: 0.15 });
      const brassMat = new THREE.MeshStandardMaterial({ color: 0xb08d57, roughness: 0.35, metalness: 0.8 });
      const fw = 0.08, fd = 0.08;
      const addBox = (w, h, d, x, y, z, m) => {
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
        b.position.set(x, y, z); group.add(b); return b;
      };
      const cy = bottom + H / 2;
      addBox(W + fw * 2, fw, fd, 0, bottom + H + fw / 2, -0.02, frameMat);   // top
      addBox(W + fw * 2, fw, fd, 0, bottom - fw / 2, -0.02, frameMat);       // bottom
      addBox(fw, H, fd, -(W / 2 + fw / 2), cy, -0.02, frameMat);             // left
      addBox(fw, H, fd, (W / 2 + fw / 2), cy, -0.02, frameMat);              // right
      addBox(W, H, 0.02, 0, cy, -0.05, frameMat);                            // back panel
      // Stand feet
      addBox(0.08, 0.06, 0.7, -(W / 2 + fw / 2), 0.03, -0.1, frameMat);
      addBox(0.08, 0.06, 0.7, (W / 2 + fw / 2), 0.03, -0.1, frameMat);
      addBox(W + fw * 2 + 0.02, 0.02, 0.02, 0, bottom + H + fw + 0.01, 0.02, brassMat);

      // ---- Reflector ----
      const rtSize = 1024;
      const renderTarget = new THREE.WebGLRenderTarget(rtSize, Math.round(rtSize * H / W), {
        minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBFormat
      });
      const textureMatrix = new THREE.Matrix4();
      const material = new THREE.ShaderMaterial({
        uniforms: {
          tDiffuse: { value: renderTarget.texture },
          textureMatrix: { value: textureMatrix },
          tint: { value: new THREE.Color(0xe8eef2) }
        },
        vertexShader: `
          uniform mat4 textureMatrix;
          varying vec4 vUv;
          void main() {
            vUv = textureMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: `
          uniform sampler2D tDiffuse;
          uniform vec3 tint;
          varying vec4 vUv;
          void main() {
            vec4 base = texture2DProj(tDiffuse, vUv);
            gl_FragColor = vec4(base.rgb * tint, 1.0);
          }`
      });
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(W, H), material);
      glass.position.set(0, cy, 0.021);
      group.add(glass);
      this.hallwayMirror = glass;

      const reflectorPlane = new THREE.Plane();
      const normal = new THREE.Vector3();
      const reflectorWorldPosition = new THREE.Vector3();
      const cameraWorldPosition = new THREE.Vector3();
      const rotationMatrix = new THREE.Matrix4();
      const lookAtPosition = new THREE.Vector3(0, 0, -1);
      const clipPlane = new THREE.Vector4();
      const view = new THREE.Vector3();
      const target = new THREE.Vector3();
      const q = new THREE.Vector4();
      const virtualCamera = new THREE.PerspectiveCamera();
      const clipBias = 0.003;

      let isRenderingReflection = false;

      glass.onBeforeRender = (renderer, scene, camera) => {
        // Recursion guard: never render mirrors inside other mirrors
        if (isRenderingReflection) return;

        reflectorWorldPosition.setFromMatrixPosition(glass.matrixWorld);
        cameraWorldPosition.setFromMatrixPosition(camera.matrixWorld);

        // Only update when viewer is on the same floor and within visible corridor range
        if (Math.abs(cameraWorldPosition.y - reflectorWorldPosition.y) > 3.0 ||
            cameraWorldPosition.distanceTo(reflectorWorldPosition) > 18.0) return;

        rotationMatrix.extractRotation(glass.matrixWorld);
        normal.set(0, 0, 1).applyMatrix4(rotationMatrix);
        view.subVectors(reflectorWorldPosition, cameraWorldPosition);
        if (view.dot(normal) > 0) return;  // camera is behind the mirror

        view.reflect(normal).negate();
        view.add(reflectorWorldPosition);

        rotationMatrix.extractRotation(camera.matrixWorld);
        lookAtPosition.set(0, 0, -1).applyMatrix4(rotationMatrix);
        lookAtPosition.add(cameraWorldPosition);
        target.subVectors(reflectorWorldPosition, lookAtPosition);
        target.reflect(normal).negate();
        target.add(reflectorWorldPosition);

        virtualCamera.position.copy(view);
        virtualCamera.up.set(0, 1, 0).applyMatrix4(rotationMatrix).reflect(normal);
        virtualCamera.lookAt(target);
        virtualCamera.far = camera.far;
        virtualCamera.updateMatrixWorld();
        virtualCamera.projectionMatrix.copy(camera.projectionMatrix);

        textureMatrix.set(0.5, 0.0, 0.0, 0.5, 0.0, 0.5, 0.0, 0.5, 0.0, 0.0, 0.5, 0.5, 0.0, 0.0, 0.0, 1.0);
        textureMatrix.multiply(virtualCamera.projectionMatrix);
        textureMatrix.multiply(virtualCamera.matrixWorldInverse);
        textureMatrix.multiply(glass.matrixWorld);

        // Oblique near-plane clipping so nothing behind the glass leaks into the reflection
        reflectorPlane.setFromNormalAndCoplanarPoint(normal, reflectorWorldPosition);
        reflectorPlane.applyMatrix4(virtualCamera.matrixWorldInverse);
        clipPlane.set(reflectorPlane.normal.x, reflectorPlane.normal.y, reflectorPlane.normal.z, reflectorPlane.constant);
        const projectionMatrix = virtualCamera.projectionMatrix;
        q.x = (Math.sign(clipPlane.x) + projectionMatrix.elements[8]) / projectionMatrix.elements[0];
        q.y = (Math.sign(clipPlane.y) + projectionMatrix.elements[9]) / projectionMatrix.elements[5];
        q.z = -1.0;
        q.w = (1.0 + projectionMatrix.elements[10]) / projectionMatrix.elements[14];
        clipPlane.multiplyScalar(2.0 / clipPlane.dot(q));
        projectionMatrix.elements[2] = clipPlane.x;
        projectionMatrix.elements[6] = clipPlane.y;
        projectionMatrix.elements[10] = clipPlane.z + 1.0 - clipBias;
        projectionMatrix.elements[14] = clipPlane.w;

        if (this.playerModel) this.playerModel.traverse((c) => { if (c.isMesh && c.material) { c.material.opacity = 1; } });
        glass.visible = false;
        isRenderingReflection = true;
        const currentRenderTarget = renderer.getRenderTarget();
        renderer.setRenderTarget(renderTarget);
        renderer.state.buffers.depth.setMask(true);
        if (renderer.autoClear === false) renderer.clear();
        renderer.render(scene, virtualCamera);
        renderer.setRenderTarget(currentRenderTarget);
        isRenderingReflection = false;
        glass.visible = true;
        const fade2 = THREE.MathUtils.clamp((this.thirdPersonCameraDistance - 0.4) / 0.2, 0, 1);
        if (this.playerModel) this.playerModel.traverse((c) => { if (c.isMesh && c.material) { c.material.opacity = fade2; } });
      };

      // Collision so the player/NPCs can't walk through the mirror stand
      if (this.colliders) {
        this.colliders.push({
          type: 'box', floor: 0,
          minX: MX - W / 2 - 0.15, maxX: MX + W / 2 + 0.15,
          minZ: MZ - 0.45, maxZ: MZ + 0.12,
          minY: y0, maxY: y0 + bottom + H + 0.2
        });
      }
    }

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

    getPlantMaterials() {
      if (!this._plantMats) {
        this._plantMats = {
          potTerracotta: new THREE.MeshStandardMaterial({
            color: 0x9a3412,
            roughness: 0.55,
            metalness: 0.08
          }),
          potGranite: new THREE.MeshStandardMaterial({
            color: 0x27272a,
            roughness: 0.55,
            metalness: 0.08
          }),
          brassTrim: new THREE.MeshStandardMaterial({
            color: 0xd4af37,
            metalness: 0.85,
            roughness: 0.25
          }),
          soil: new THREE.MeshStandardMaterial({
            color: 0x1c1917,
            roughness: 0.96
          }),
          foliage: new THREE.MeshStandardMaterial({
            color: 0x166534,
            roughness: 0.32,
            metalness: 0.04,
            side: THREE.DoubleSide
          })
        };
      }
      return this._plantMats;
    }

    getPlantGeometries() {
      if (!this._plantGeoms) {
        // Pot Body (Base + Waist + Fluted Rim)
        const potBase = new THREE.CylinderGeometry(0.24, 0.28, 0.08, 14);
        potBase.translate(0, 0.04, 0);

        const potWaist = new THREE.CylinderGeometry(0.32, 0.20, 0.48, 14);
        potWaist.translate(0, 0.32, 0);

        const potRim = new THREE.TorusGeometry(0.32, 0.032, 8, 18);
        potRim.rotateX(Math.PI / 2);
        potRim.translate(0, 0.56, 0);

        const potGeom = mergeBufferGeometries([potBase, potWaist, potRim]);

        // Polished Brass Accent Ring
        const goldBand = new THREE.TorusGeometry(0.28, 0.016, 6, 18);
        goldBand.rotateX(Math.PI / 2);
        goldBand.translate(0, 0.44, 0);

        // Potting Soil
        const soilGeom = new THREE.CylinderGeometry(0.30, 0.30, 0.03, 14);
        soilGeom.translate(0, 0.54, 0);

        // Full Botanical Foliage Canopy: Pre-merged into 1 single BufferGeometry!
        const leafParts = [];
        const frondCount = 10;
        for (let f = 0; f < frondCount; f++) {
          const ang = (f * Math.PI * 2) / frondCount + (f % 2) * 0.12;
          const stemLength = 0.85 + (f % 3) * 0.15;
          const droopAngle = 0.55 + (f % 2) * 0.18;

          const frondMat = new THREE.Matrix4();
          frondMat.makeRotationY(ang);
          frondMat.setPosition(0, 0.55, 0);

          const stem = new THREE.CylinderGeometry(0.012, 0.022, stemLength, 6);
          const sPos = new THREE.Vector3(Math.sin(droopAngle) * stemLength * 0.5, Math.cos(droopAngle) * stemLength * 0.5, 0);
          const sRot = new THREE.Euler(0, 0, -droopAngle);
          const sMat = new THREE.Matrix4().makeRotationFromEuler(sRot);
          sMat.setPosition(sPos);
          sMat.premultiply(frondMat);
          stem.applyMatrix4(sMat);
          leafParts.push(stem);

          const leafPairs = 5;
          for (let l = 1; l <= leafPairs; l++) {
            const t = l / leafPairs;
            const lx = Math.sin(droopAngle) * stemLength * t;
            const ly = Math.cos(droopAngle) * stemLength * t;
            const leafScale = (0.7 + Math.sin(t * Math.PI) * 0.5) * 0.22;

            [-1, 1].forEach(side => {
              const leaf = new THREE.ConeGeometry(leafScale * 0.65, leafScale * 1.8, 5);
              leaf.scale(1.0, 1.0, 0.15);
              const lPos = new THREE.Vector3(lx, ly, side * (leafScale * 0.5));
              const lRot = new THREE.Euler(side * 0.35, side * 0.45, -droopAngle - 0.25);
              const lMat = new THREE.Matrix4().makeRotationFromEuler(lRot);
              lMat.setPosition(lPos);
              lMat.premultiply(frondMat);
              leaf.applyMatrix4(lMat);
              leafParts.push(leaf);
            });
          }

          const tipX = Math.sin(droopAngle) * stemLength;
          const tipY = Math.cos(droopAngle) * stemLength;
          const tipLeaf = new THREE.ConeGeometry(0.09, 0.32, 5);
          tipLeaf.scale(1.0, 1.0, 0.15);
          const tPos = new THREE.Vector3(tipX, tipY, 0);
          const tRot = new THREE.Euler(0, 0, -droopAngle - 0.35);
          const tMat = new THREE.Matrix4().makeRotationFromEuler(tRot);
          tMat.setPosition(tPos);
          tMat.premultiply(frondMat);
          tipLeaf.applyMatrix4(tMat);
          leafParts.push(tipLeaf);
        }

        const foliageGeom = mergeBufferGeometries(leafParts);

        this._plantGeoms = {
          pot: potGeom,
          goldBand: goldBand,
          soil: soilGeom,
          foliage: foliageGeom
        };
      }
      return this._plantGeoms;
    }

    createPottedMuseumPlant(x, y0, z, fl) {
      const geoms = this.getPlantGeometries();
      const mats = this.getPlantMaterials();

      const plantGroup = new THREE.Group();
      plantGroup.position.set(x, y0, z);
      // Scaled 40% smaller (0.60x) per curator feedback
      plantGroup.scale.set(0.60, 0.60, 0.60);

      const potMat = (fl === 0 || fl === 2) ? mats.potTerracotta : mats.potGranite;
      plantGroup.add(new THREE.Mesh(geoms.pot, potMat));
      plantGroup.add(new THREE.Mesh(geoms.goldBand, mats.brassTrim));
      plantGroup.add(new THREE.Mesh(geoms.soil, mats.soil));
      plantGroup.add(new THREE.Mesh(geoms.foliage, mats.foliage));

      this.scene.add(plantGroup);

      this.colliders.push({
        type: 'cylinder',
        floor: fl,
        x: x,
        z: z,
        radius: 0.36 * 0.60,
        minY: y0,
        maxY: y0 + 0.60 * 0.60
      });
    }

    getAquariumMaterials() {
      if (!this._aquaMats) {
        this._aquaMats = {
          cabinet: new THREE.MeshStandardMaterial({
            color: 0x18181b,
            roughness: 0.35,
            metalness: 0.15,
            emissive: 0x0284c7,
            emissiveIntensity: 0.12
          }),
          frame: new THREE.MeshStandardMaterial({ color: 0x27272a, roughness: 0.25, metalness: 0.80 }),
          sand: new THREE.MeshStandardMaterial({ color: 0xdfd3c3, roughness: 0.95 }),
          pebble: new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.85 }),
          kelp: new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.40, side: THREE.DoubleSide }),
          glass: new THREE.MeshStandardMaterial({
            color: 0xdef3f6,
            transparent: true,
            opacity: 0.28,
            roughness: 0.08,
            metalness: 0.15,
            depthWrite: false,
            side: THREE.DoubleSide
          }),
          water: new THREE.MeshStandardMaterial({
            color: 0x0284c7,
            transparent: true,
            opacity: 0.32,
            roughness: 0.08,
            metalness: 0.05,
            emissive: 0x0284c7,
            emissiveIntensity: 0.22,
            depthWrite: false,
            side: THREE.DoubleSide
          }),
          waterSurface: new THREE.MeshStandardMaterial({
            color: 0x38bdf8,
            transparent: true,
            opacity: 0.55,
            roughness: 0.05,
            metalness: 0.20,
            emissive: 0x38bdf8,
            emissiveIntensity: 0.35,
            depthWrite: false,
            side: THREE.DoubleSide
          }),
          bubble: new THREE.MeshBasicMaterial({ color: 0xe0f2fe, transparent: true, opacity: 0.75 })
        };
      }
      return this._aquaMats;
    }

    getAquariumGeometries() {
      if (!this._aquaGeoms) {
        const tW = 1.54, tH = 0.70, tD = 0.70;
        const edgeThick = 0.024;
        const tankCenterY = 0.72 + tH / 2;

        const frameParts = [];
        [[-tW/2, -tD/2], [tW/2, -tD/2], [-tW/2, tD/2], [tW/2, tD/2]].forEach(([ex, ez]) => {
          const post = new THREE.BoxGeometry(edgeThick, tH, edgeThick);
          post.translate(ex, tankCenterY, ez);
          frameParts.push(post);
        });
        const topRim = new THREE.BoxGeometry(tW + 0.02, 0.03, tD + 0.02);
        topRim.translate(0, 0.72 + tH, 0);
        frameParts.push(topRim);
        const botRim = new THREE.BoxGeometry(tW + 0.02, 0.03, tD + 0.02);
        botRim.translate(0, 0.72, 0);
        frameParts.push(botRim);
        const sBase = new THREE.BoxGeometry(1.54, 0.06, 0.69);
        sBase.translate(0, 0.03, 0);
        frameParts.push(sBase);

        const glassThick = 0.012;
        const glassParts = [];
        [-tD / 2 + glassThick / 2, tD / 2 - glassThick / 2].forEach(pz => {
          const pane = new THREE.BoxGeometry(tW, tH, glassThick);
          pane.translate(0, tankCenterY, pz);
          glassParts.push(pane);
        });
        [-tW / 2 + glassThick / 2, tW / 2 - glassThick / 2].forEach(px => {
          const pane = new THREE.BoxGeometry(glassThick, tH, tD - glassThick * 2);
          pane.translate(px, tankCenterY, 0);
          glassParts.push(pane);
        });

        const decorParts = [];
        [[-0.45, -0.12, 0.09], [0.42, 0.15, 0.10], [-0.08, 0.05, 0.07], [0.12, -0.18, 0.06], [-0.25, 0.18, 0.05]].forEach(([rx, rz, rad]) => {
          const rock = new THREE.DodecahedronGeometry(rad, 1);
          rock.translate(rx, 0.76 + rad * 0.7, rz);
          decorParts.push(rock);
        });
        const woodBranch = new THREE.CylinderGeometry(0.03, 0.05, 0.65, 8);
        const bRot = new THREE.Euler(0.4, 0.8, 1.1);
        const bMat = new THREE.Matrix4().makeRotationFromEuler(bRot);
        bMat.setPosition(0.15, 0.88, -0.05);
        woodBranch.applyMatrix4(bMat);
        decorParts.push(woodBranch);

        this._aquaGeoms = {
          stand: new THREE.BoxGeometry(1.60, 0.72, 0.75),
          canopy: new THREE.BoxGeometry(1.56, 0.05, 0.72),
          frame: mergeBufferGeometries(frameParts),
          glass: mergeBufferGeometries(glassParts),
          sand: new THREE.BoxGeometry(1.48, 0.08, 0.64),
          seabed: mergeBufferGeometries(decorParts),
          water: new THREE.BoxGeometry(1.48, 0.60, 0.64),
          waterSurface: new THREE.PlaneGeometry(1.48, 0.64, 4, 4)
        };
      }
      return this._aquaGeoms;
    }

    createAquariumTank(x, y0, z, fl, rotY = 0) {
      const group = new THREE.Group();
      group.position.set(x, y0, z);
      group.rotation.y = rotY;

      const mats = this.getAquariumMaterials();
      const geoms = this.getAquariumGeometries();

      // 1. Sleek museum gallery stand
      const stand = new THREE.Mesh(geoms.stand, mats.cabinet);
      stand.position.y = 0.36;
      group.add(stand);

      // 2. Merged metal frame & stand base (1 draw call)
      const frameMesh = new THREE.Mesh(geoms.frame, mats.frame);
      group.add(frameMesh);

      // 3. Merged crystal glass tank panels (1 draw call)
      const glassMesh = new THREE.Mesh(geoms.glass, mats.glass);
      group.add(glassMesh);

      // 4. Sandy riverbed & decorative seabed rocks
      const sand = new THREE.Mesh(geoms.sand, mats.sand);
      sand.position.y = 0.72 + 0.04;
      group.add(sand);

      const seabed = new THREE.Mesh(geoms.seabed, mats.pebble);
      group.add(seabed);

      // 5. Swaying underwater plants (3 lush blades)
      const kelpBlades = [];
      [-0.45, -0.05, 0.40].forEach((kx, ki) => {
        const h = 0.42 + (ki % 2) * 0.10;
        const blade = new THREE.Mesh(new THREE.PlaneGeometry(0.065, h, 1, 3), mats.kelp);
        blade.position.set(kx, 0.76 + h / 2, (ki % 2 === 0 ? -0.15 : 0.15));
        blade.rotation.y = ki * 0.85;
        group.add(blade);
        kelpBlades.push({ mesh: blade, phase: ki * 1.4, baseY: 0.76 + h / 2 });
      });

      // 6. Transparent Water Volume & Shimmering Surface
      const water = new THREE.Mesh(geoms.water, mats.water);
      water.position.y = 0.76 + 0.30;
      group.add(water);

      const waterSurface = new THREE.Mesh(geoms.waterSurface, mats.waterSurface);
      waterSurface.rotation.x = -Math.PI / 2;
      waterSurface.position.y = 0.76 + 0.59;
      group.add(waterSurface);

      // 7. Rising Bubbler Column (3 streamlined bubbles)
      const bubbles = [];
      for (let b = 0; b < 3; b++) {
        const bMesh = new THREE.Mesh(new THREE.SphereGeometry(0.015, 6, 6), mats.bubble);
        const bY = 0.78 + b * 0.18;
        bMesh.position.set(-0.45 + (b % 2) * 0.03, bY, 0.10);
        group.add(bMesh);
        bubbles.push({ mesh: bMesh, speed: 0.28 + b * 0.06, startX: -0.45, startZ: 0.10 });
      }

      // Top sleek aquarium canopy with integrated LED gallery strip and downward blue glow
      const canopy = new THREE.Mesh(geoms.canopy, mats.cabinet);
      canopy.position.y = 0.72 + 0.70;
      group.add(canopy);

      // Luminous blue LED fixture bar mounted inside lid
      const blueBarMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
      const blueLightBar = new THREE.Mesh(new THREE.BoxGeometry(1.40, 0.02, 0.14), blueBarMat);
      blueLightBar.position.set(0, 0.72 + 0.69, 0);
      group.add(blueLightBar);

      // Downward aquatic blue glow radiating from the lid down through the water and tank
      const aquaBlueLight = new THREE.PointLight(0x38bdf8, fl === this.playerFloor ? 0.95 : 0, 4.2, 1.2);
      aquaBlueLight._origIntensity = 0.95;
      aquaBlueLight.position.set(0, 0.72 + 0.65, 0);
      group.add(aquaBlueLight);
      if (this.floorLights && this.floorLights[fl]) this.floorLights[fl].push(aquaBlueLight);

      this.scene.add(group);

      // 8. Dynamic Living Fish (Clownfish, Neon Tetra, Golden Angelfish)
      const fishProfiles = [
        { species: 'clownfish', scale: 0.18, speed: 0.52, bodyColor: 0xea580c, finColor: 0xf97316, yOffset: 0.22, zLane: -0.12, dir: 1 },
        { species: 'tetra', scale: 0.15, speed: 0.68, bodyColor: 0x0284c7, finColor: 0xbae6fd, yOffset: 0.35, zLane: 0.14, dir: -1 },
        { species: 'angelfish', scale: 0.20, speed: 0.42, bodyColor: 0xfacc15, finColor: 0xfef9c3, yOffset: 0.46, zLane: 0.02, dir: 1 }
      ];

      if (!this.aquariumFish) this.aquariumFish = [];

      fishProfiles.forEach((fp, idx) => {
        const fishRoot = new THREE.Group();
        const s = fp.scale;

        const bodyMat = new THREE.MeshStandardMaterial({ color: fp.bodyColor, roughness: 0.28, metalness: 0.18 });
        const finMat = new THREE.MeshStandardMaterial({ color: fp.finColor, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
        const eyeMat = new THREE.MeshBasicMaterial({ color: 0x09090b });

        // Tapered Streamlined Fish Body & Head
        const bodyGeom = new THREE.ConeGeometry(s * 0.38, s * 1.15, 10);
        bodyGeom.rotateZ(-Math.PI / 2);
        const headGeom = new THREE.SphereGeometry(s * 0.36, 10, 8);
        headGeom.scale(1.2, 0.95, 0.75);
        headGeom.translate(s * 0.52, 0, 0);
        const fullFishBodyGeom = mergeBufferGeometries([bodyGeom, headGeom]);
        fishRoot.add(new THREE.Mesh(fullFishBodyGeom, bodyMat));

        // Eyes
        [-s * 0.20, s * 0.20].forEach(ez => {
          const pupil = new THREE.Mesh(new THREE.SphereGeometry(s * 0.05, 6, 6), eyeMat);
          pupil.position.set(s * 0.66, s * 0.08, ez);
          fishRoot.add(pupil);
        });

        // Top Dorsal Fin
        const dorsalShape = new THREE.Shape();
        dorsalShape.moveTo(-s * 0.30, 0);
        dorsalShape.lineTo(s * 0.05, s * 0.55);
        dorsalShape.lineTo(s * 0.35, 0);
        dorsalShape.closePath();
        const dorsal = new THREE.Mesh(new THREE.ShapeGeometry(dorsalShape), finMat);
        dorsal.position.set(0, s * 0.25, 0);
        fishRoot.add(dorsal);

        // Fluttering Pectoral Side Fins
        const pecLeft = new THREE.Mesh(new THREE.PlaneGeometry(s * 0.30, s * 0.16), finMat);
        pecLeft.position.set(s * 0.30, -s * 0.05, s * 0.24);
        pecLeft.rotation.set(0.4, -0.6, 0.2);
        fishRoot.add(pecLeft);

        const pecRight = new THREE.Mesh(new THREE.PlaneGeometry(s * 0.30, s * 0.16), finMat);
        pecRight.position.set(s * 0.30, -s * 0.05, -s * 0.24);
        pecRight.rotation.set(-0.4, 0.6, -0.2);
        fishRoot.add(pecRight);

        // Dynamic Swishing Caudal Tail with Articulated Pivot
        const tailPivot = new THREE.Group();
        tailPivot.position.x = -s * 0.55;

        const tailShape = new THREE.Shape();
        tailShape.moveTo(0, 0);
        tailShape.lineTo(-s * 0.65, s * 0.45);
        tailShape.lineTo(-s * 0.45, 0);
        tailShape.lineTo(-s * 0.65, -s * 0.45);
        tailShape.closePath();
        const tailFin = new THREE.Mesh(new THREE.ShapeGeometry(tailShape), finMat);
        tailPivot.add(tailFin);
        fishRoot.add(tailPivot);

        const startX = (idx - 1) * 0.36;
        const startY = 0.76 + fp.yOffset;
        const startZ = fp.zLane;
        fishRoot.position.set(startX, startY, startZ);
        group.add(fishRoot);

        this.aquariumFish.push({
          root: fishRoot,
          tailPivot: tailPivot,
          pecLeft: pecLeft,
          pecRight: pecRight,
          floor: fl,
          localX: startX,
          localY: startY,
          localZ: startZ,
          baseY: startY,
          speed: fp.speed,
          heading: fp.dir,
          phase: idx * 2.1,
          minX: -0.56,
          maxX: 0.56,
          minZ: -0.22,
          maxZ: 0.22
        });
      });

      if (!this.aquariumFX) this.aquariumFX = [];
      this.aquariumFX.push({
        floor: fl,
        waterSurface: waterSurface,
        bubbles: bubbles,
        kelpBlades: kelpBlades
      });

      const isZAligned = Math.abs(Math.sin(rotY)) > 0.5;
      const halfW = isZAligned ? 0.42 : 0.82;
      const halfD = isZAligned ? 0.82 : 0.42;
      this.colliders.push({
        type: 'box',
        floor: fl,
        minX: x - halfW,
        maxX: x + halfW,
        minZ: z - halfD,
        maxZ: z + halfD,
        minY: y0,
        maxY: y0 + 1.48
      });
    }

    updateAquariumFish(delta) {
      // 1. Animate Aquarium Water, Bubbles, and Swaying Plants
      if (this.aquariumFX && this.aquariumFX.length > 0) {
        for (let a = 0; a < this.aquariumFX.length; a++) {
          const fx = this.aquariumFX[a];
          if (fx.floor !== this.playerFloor) continue;

          // Rising bubbles
          if (fx.bubbles) {
            for (let b = 0; b < fx.bubbles.length; b++) {
              const bub = fx.bubbles[b];
              bub.mesh.position.y += bub.speed * delta;
              bub.mesh.position.x = bub.startX + Math.sin(bub.mesh.position.y * 14.0) * 0.015;
              if (bub.mesh.position.y > 1.34) {
                bub.mesh.position.y = 0.78;
              }
            }
          }

          // Gentle swaying sea kelp / grass
          if (fx.kelpBlades) {
            for (let k = 0; k < fx.kelpBlades.length; k++) {
              const kb = fx.kelpBlades[k];
              kb.phase += delta * 2.5;
              kb.mesh.rotation.z = Math.sin(kb.phase) * 0.12;
            }
          }
        }
      }

      // 2. Animate Living Swimming Fish
      if (!this.aquariumFish || this.aquariumFish.length === 0) return;
      for (let i = 0; i < this.aquariumFish.length; i++) {
        const fish = this.aquariumFish[i];
        if (fish.floor !== this.playerFloor) continue;

        fish.phase += delta * 9.5;
        fish.tailPivot.rotation.y = Math.sin(fish.phase) * 0.65;
        fish.pecLeft.rotation.z = Math.sin(fish.phase * 1.2) * 0.40;
        fish.pecRight.rotation.z = -Math.sin(fish.phase * 1.2) * 0.40;

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
        fish.root.rotation.y = THREE.MathUtils.lerp(fish.root.rotation.y, targetRotY, Math.min(1, delta * 14));

        fish.root.position.y = fish.baseY + Math.sin(fish.phase * 0.35) * 0.035;
        fish.root.rotation.z = Math.sin(fish.phase * 0.45) * 0.06 * fish.heading;
      }
    }

    getVitrineMaterials(fl) {
      if (!this._vitrineMats) {
        this._vitrineMats = {
          wood: new THREE.MeshStandardMaterial({ color: 0x3d271d, roughness: 0.55 }),
          gold: new THREE.MeshStandardMaterial({ color: 0xeab308, metalness: 0.88, roughness: 0.20 }),
          velvetBlue: new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.85 }),
          velvetBurgundy: new THREE.MeshStandardMaterial({ color: 0x881337, roughness: 0.85 }),
          glass: new THREE.MeshStandardMaterial({
            color: 0xe2f3f5,
            transparent: true,
            opacity: 0.30,
            roughness: 0.08,
            metalness: 0.12,
            depthWrite: false
          }),
          bronze: new THREE.MeshStandardMaterial({ color: 0x644a2c, metalness: 0.75, roughness: 0.35 }),
          terracotta: new THREE.MeshStandardMaterial({ color: 0xb4533c, roughness: 0.72 }),
          parchment: new THREE.MeshLambertMaterial({ color: 0xfef08a })
        };
      }
      return this._vitrineMats;
    }

    getVitrineGeometries() {
      if (!this._vitrineGeoms) {
        const vWoodParts = [];
        [[-0.68, -0.42], [0.68, -0.42], [-0.68, 0.42], [0.68, 0.42]].forEach(([lx, lz]) => {
          const leg = new THREE.CylinderGeometry(0.038, 0.030, 0.74, 8);
          leg.translate(lx, 0.37, lz);
          vWoodParts.push(leg);
        });
        const apron = new THREE.BoxGeometry(1.48, 0.09, 0.96);
        apron.translate(0, 0.71, 0);
        vWoodParts.push(apron);
        const deck = new THREE.BoxGeometry(1.54, 0.04, 1.02);
        deck.translate(0, 0.76, 0);
        vWoodParts.push(deck);

        const vBrassParts = [];
        [[-0.68, -0.42], [0.68, -0.42], [-0.68, 0.42], [0.68, 0.42]].forEach(([lx, lz]) => {
          const ferrule = new THREE.CylinderGeometry(0.032, 0.032, 0.06, 8);
          ferrule.translate(lx, 0.03, lz);
          vBrassParts.push(ferrule);
        });
        const gFrame = new THREE.BoxGeometry(1.44, 0.03, 0.92);
        gFrame.translate(0, 0.78 + 0.70, 0);
        vBrassParts.push(gFrame);

        this._vitrineGeoms = {
          woodBody: mergeBufferGeometries(vWoodParts),
          brassTrim: mergeBufferGeometries(vBrassParts),
          cushion: new THREE.BoxGeometry(1.24, 0.08, 0.76),
          glass: new THREE.BoxGeometry(1.42, 0.70, 0.90)
        };
      }
      return this._vitrineGeoms;
    }

    createVitrineTable(x, y0, z, relicType, fl, rotY = 0) {
      const group = new THREE.Group();
      group.position.set(x, y0, z);
      group.rotation.y = rotY;

      const mats = this.getVitrineMaterials(fl);
      const geoms = this.getVitrineGeometries();

      // Merged wood structure (4 legs, apron, deck)
      const woodMesh = new THREE.Mesh(geoms.woodBody, mats.wood);
      group.add(woodMesh);

      // Merged brass trim (4 ferrules, perimeter glass frame)
      const brassMesh = new THREE.Mesh(geoms.brassTrim, mats.gold);
      group.add(brassMesh);

      // Velvet display cushion
      const velvetMat = fl === 1 ? mats.velvetBlue : mats.velvetBurgundy;
      const cushion = new THREE.Mesh(geoms.cushion, velvetMat);
      cushion.position.y = 0.82;
      group.add(cushion);

      // Vitrine Glass Box
      const vitrineGlass = new THREE.Mesh(geoms.glass, mats.glass);
      vitrineGlass.position.y = 0.78 + 0.35;
      group.add(vitrineGlass);

      // Relic content inside case
      if (relicType === 'coins') {
        for (let c = 0; c < 6; c++) {
          const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.008, 10), mats.gold);
          coin.position.set(-0.20 + (c % 3) * 0.16, 0.865 + (c > 2 ? 0.008 : 0), -0.06 + Math.floor(c / 3) * 0.14);
          group.add(coin);
        }
        const med = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.012, 12), mats.gold);
        med.position.set(0.24, 0.868, 0.05);
        group.add(med);
      } else if (relicType === 'chalice') {
        const chBase = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.12, 0.04, 12), mats.gold);
        chBase.position.y = 0.88;
        group.add(chBase);
        const chStem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.16, 10), mats.gold);
        chStem.position.y = 0.98;
        group.add(chStem);
        const chCup = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.07, 0.18, 12), mats.gold);
        chCup.position.y = 1.15;
        group.add(chCup);
      } else if (relicType === 'amphora') {
        const amp = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 12), mats.terracotta);
        amp.scale.set(1.0, 1.4, 1.0);
        amp.position.y = 1.05;
        group.add(amp);
        const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.16, 10), mats.terracotta);
        neck.position.y = 1.25;
        group.add(neck);
      } else if (relicType === 'scroll') {
        const scroll1 = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.60, 10), mats.parchment);
        scroll1.rotation.z = Math.PI / 2;
        scroll1.position.set(0, 0.89, -0.10);
        group.add(scroll1);
        const ribbon = new THREE.Mesh(new THREE.CylinderGeometry(0.043, 0.043, 0.06, 10), velvetMat);
        ribbon.rotation.z = Math.PI / 2;
        ribbon.position.set(0, 0.89, -0.10);
        group.add(ribbon);
      } else {
        const aBase = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.04, 12), mats.bronze);
        aBase.position.y = 0.88;
        group.add(aBase);
        const ring1 = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.014, 6, 16), mats.gold);
        ring1.position.y = 1.08;
        group.add(ring1);
        const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.014, 6, 16), mats.bronze);
        ring2.rotation.x = Math.PI / 2;
        ring2.position.y = 1.08;
        group.add(ring2);
      }

      this.scene.add(group);

      this.colliders.push({
        type: 'box',
        floor: fl,
        minX: x - (rotY !== 0 ? 0.55 : 0.82),
        maxX: x + (rotY !== 0 ? 0.55 : 0.82),
        minZ: z - (rotY !== 0 ? 0.82 : 0.55),
        maxZ: z + (rotY !== 0 ? 0.82 : 0.55),
        minY: y0,
        maxY: y0 + 1.48
      });
    }

    getPedestalMaterials() {
      if (!this._pedMats) {
        this._pedMats = {
          marble: new THREE.MeshStandardMaterial({ color: 0xedebe6, roughness: 0.35, metalness: 0.05 }),
          goldPlacard: new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.88, roughness: 0.22 }),
          bronze: new THREE.MeshStandardMaterial({ color: 0x5a4328, metalness: 0.78, roughness: 0.32 }),
          velvetRope: new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.85 })
        };
      }
      return this._pedMats;
    }

    getPedestalGeometries() {
      if (!this._pedGeoms) {
        // Multi-tiered classical pedestal: stepped plinth, fluted cylindrical column shaft, and carved torus/capital
        const plinthBase = new THREE.BoxGeometry(0.88, 0.10, 0.88);
        plinthBase.translate(0, 0.05, 0);

        const plinthSub = new THREE.BoxGeometry(0.78, 0.08, 0.78);
        plinthSub.translate(0, 0.14, 0);

        const baseTorus = new THREE.CylinderGeometry(0.36, 0.38, 0.08, 20);
        baseTorus.translate(0, 0.22, 0);

        const colShaft = new THREE.CylinderGeometry(0.30, 0.33, 0.86, 24);
        colShaft.translate(0, 0.26 + 0.43, 0);

        const capCollar = new THREE.CylinderGeometry(0.35, 0.30, 0.06, 20);
        capCollar.translate(0, 1.15, 0);

        const capAbacus = new THREE.BoxGeometry(0.80, 0.10, 0.80);
        capAbacus.translate(0, 1.23, 0);

        this._pedGeoms = {
          pedestal: mergeBufferGeometries([plinthBase, plinthSub, baseTorus, colShaft, capCollar, capAbacus]),
          placard: new THREE.BoxGeometry(0.34, 0.13, 0.02)
        };
      }
      return this._pedGeoms;
    }

    createClassicalSculpturePedestal(x, y0, z, statueType, fl, hasStanchions = false) {
      const group = new THREE.Group();
      group.position.set(x, y0, z);

      const mats = this.getPedestalMaterials();
      const geoms = this.getPedestalGeometries();

      // Merged Fluted Pedestal (base, shaft, cap)
      const pedestal = new THREE.Mesh(geoms.pedestal, mats.marble);
      group.add(pedestal);

      // Placard
      const placard = new THREE.Mesh(geoms.placard, mats.goldPlacard);
      placard.position.set(0, 0.75, 0.36);
      group.add(placard);

      // Sculpture atop pedestal: Clean resting plane at y = 1.28m atop pedestal abacus cap
      const capTop = 1.28;

      if (statueType === 'winged_victory') {
        // Nike of Samothrace inspired classical drapery and sculpted wings
        const socle = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.28, 0.05, 18), mats.marble);
        socle.position.set(0, capTop + 0.025, 0);
        group.add(socle);

        const gownLower = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.25, 0.48, 16), mats.marble);
        gownLower.position.set(0, capTop + 0.05 + 0.24, 0);
        group.add(gownLower);

        const gownTorso = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.19, 0.36, 16), mats.marble);
        gownTorso.position.set(0, capTop + 0.05 + 0.48 + 0.18, 0.02);
        gownTorso.rotation.x = 0.08;
        group.add(gownTorso);

        const chest = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 14), mats.marble);
        chest.scale.set(1.0, 1.15, 0.88);
        chest.position.set(0, capTop + 0.05 + 0.78, 0.04);
        group.add(chest);

        // Swept back classical sculpted wings
        [-0.24, 0.24].forEach((wx, wi) => {
          const wing = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.56, 0.34), mats.marble);
          wing.position.set(wx, capTop + 0.72, -0.14);
          wing.rotation.z = (wi === 0 ? 0.42 : -0.42);
          wing.rotation.y = (wi === 0 ? -0.32 : 0.32);
          wing.rotation.x = -0.16;
          group.add(wing);
        });
      } else if (statueType === 'venus') {
        // Venus de Milo classical draped contrapposto silhouette
        const socle = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.27, 0.05, 18), mats.marble);
        socle.position.set(0, capTop + 0.025, 0);
        group.add(socle);

        const lowerDrape = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.24, 0.52, 16), mats.marble);
        lowerDrape.position.set(0, capTop + 0.05 + 0.26, 0);
        group.add(lowerDrape);

        const waistFold = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.04, 8, 18), mats.marble);
        waistFold.rotation.x = Math.PI / 2;
        waistFold.position.set(0, capTop + 0.05 + 0.52, 0);
        group.add(waistFold);

        const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.17, 0.38, 16), mats.marble);
        torso.position.set(0, capTop + 0.05 + 0.52 + 0.19, 0);
        torso.rotation.z = 0.04;
        group.add(torso);

        const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 14), mats.marble);
        head.scale.set(0.88, 1.15, 0.95);
        head.position.set(0.01, capTop + 0.05 + 0.52 + 0.43, 0);
        group.add(head);
      } else if (statueType === 'bronze_urn') {
        // Classical Roman Amphora / Bronze Crater Urn
        const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.06, 18), mats.bronze);
        foot.position.set(0, capTop + 0.03, 0);
        group.add(foot);

        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.12, 0.10, 16), mats.bronze);
        stem.position.set(0, capTop + 0.06 + 0.05, 0);
        group.add(stem);

        const belly = new THREE.Mesh(new THREE.SphereGeometry(0.24, 18, 16), mats.bronze);
        belly.scale.set(1.0, 1.22, 1.0);
        belly.position.set(0, capTop + 0.16 + 0.24, 0);
        group.add(belly);

        const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.18, 18), mats.bronze);
        neck.position.set(0, capTop + 0.16 + 0.48 + 0.09, 0);
        group.add(neck);

        const lip = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.03, 8, 20), mats.bronze);
        lip.rotation.x = Math.PI / 2;
        lip.position.set(0, capTop + 0.16 + 0.48 + 0.18, 0);
        group.add(lip);

        // Fluted amphora handles
        [-0.23, 0.23].forEach((hx) => {
          const handle = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.024, 8, 16, Math.PI), mats.bronze);
          handle.rotation.y = (hx < 0 ? -Math.PI / 2 : Math.PI / 2);
          handle.position.set(hx, capTop + 0.50, 0);
          group.add(handle);
        });
      } else if (statueType === 'bronze_philosopher') {
        // Classical Roman philosopher bronze portrait bust on circular socle
        const socle = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.20, 0.08, 16), mats.bronze);
        socle.position.set(0, capTop + 0.04, 0);
        group.add(socle);

        const bustChest = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.18, 0.32, 16), mats.bronze);
        bustChest.scale.set(1.30, 1.0, 0.85);
        bustChest.position.set(0, capTop + 0.08 + 0.16, 0);
        group.add(bustChest);

        const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 16), mats.bronze);
        head.scale.set(0.92, 1.20, 1.0);
        head.position.set(0, capTop + 0.08 + 0.32 + 0.15, 0.02);
        group.add(head);

        const beard = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.16, 12), mats.bronze);
        beard.rotation.x = -0.30;
        beard.position.set(0, capTop + 0.08 + 0.32 + 0.06, 0.10);
        group.add(beard);
      } else {
        // Augustus of Prima Porta classical marble bust on carved pedestal socle
        const socle = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.20, 0.08, 16), mats.marble);
        socle.position.set(0, capTop + 0.04, 0);
        group.add(socle);

        const bustChest = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.19, 0.32, 16), mats.marble);
        bustChest.scale.set(1.32, 1.0, 0.86);
        bustChest.position.set(0, capTop + 0.08 + 0.16, 0);
        group.add(bustChest);

        const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 16), mats.marble);
        head.scale.set(0.92, 1.20, 0.98);
        head.position.set(0, capTop + 0.08 + 0.32 + 0.15, 0);
        group.add(head);

        // Gilded laurel wreath
        const laurel = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.022, 8, 20), mats.goldPlacard);
        laurel.rotation.x = Math.PI / 2 + 0.16;
        laurel.position.set(0, capTop + 0.08 + 0.32 + 0.20, 0.02);
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
        const stanchionParts = [];
        sOffsets.forEach(p => {
          const sBase = new THREE.CylinderGeometry(0.12, 0.14, 0.035, 8);
          sBase.translate(p[0], 0.02, p[1]);
          stanchionParts.push(sBase);

          const sPost = new THREE.CylinderGeometry(0.022, 0.022, 0.90, 6);
          sPost.translate(p[0], 0.47, p[1]);
          stanchionParts.push(sPost);

          const sBall = new THREE.SphereGeometry(0.04, 6, 6);
          sBall.translate(p[0], 0.94, p[1]);
          stanchionParts.push(sBall);
        });

        const mergedStanchions = new THREE.Mesh(mergeBufferGeometries(stanchionParts), mats.goldPlacard);
        mergedStanchions.position.set(x, y0, z);
        this.scene.add(mergedStanchions);

        for (let r = 0; r < 4; r++) {
          const p1 = sOffsets[r];
          const p2 = sOffsets[(r + 1) % 4];
          const midX = x + (p1[0] + p2[0]) / 2;
          const midZ = z + (p1[1] + p2[1]) / 2;
          const rLen = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
          const rAng = Math.atan2(p2[0] - p1[0], p2[1] - p1[1]);
          const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, rLen, 6), mats.velvetRope);
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

      const marblePlinthMat = new THREE.MeshStandardMaterial({ color: 0xf4f1eb, roughness: 0.35 });
      const walnutMat = new THREE.MeshStandardMaterial({ color: 0x2e1a12, roughness: 0.45 });
      const goldMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.88, roughness: 0.24 });
      const lapisMat = new THREE.MeshStandardMaterial({ color: 0x1d3557, roughness: 0.40 });
      const velvetMat = new THREE.MeshStandardMaterial({ color: 0x881337, roughness: 0.85 });

      // 1. Stepped Museum Gallery Plinth (Tier 1 Honed White Stone & Tier 2 Inset Riser matching reference photo)
      const t1 = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.14, 2.6), marblePlinthMat);
      t1.position.y = 0.07;
      daisGroup.add(t1);

      const t2 = new THREE.Mesh(new THREE.BoxGeometry(3.9, 0.12, 2.1), marblePlinthMat);
      t2.position.y = 0.20;
      daisGroup.add(t2);

      // 2. Classical Carved Antiquities Cassone / Sarcophagus Chest
      // Molded Walnut Base Molding
      const baseMold = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.08, 1.25), walnutMat);
      baseMold.position.y = 0.30;
      daisGroup.add(baseMold);

      // Main Sarcophagus Chest Body
      const chestBody = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.54, 1.1), walnutMat);
      chestBody.position.y = 0.61;
      daisGroup.add(chestBody);

      // Gold-Leaf Fluted Corner Pilasters & Base Accents
      const pilW = 0.10;
      const pilH = 0.54;
      [
        [-1.25 + pilW / 2, -0.55 + pilW / 2],
        [1.25 - pilW / 2, -0.55 + pilW / 2],
        [-1.25 + pilW / 2, 0.55 - pilW / 2],
        [1.25 - pilW / 2, 0.55 - pilW / 2]
      ].forEach(([px, pz]) => {
        const pilaster = new THREE.Mesh(new THREE.BoxGeometry(pilW, pilH, pilW), goldMat);
        pilaster.position.set(px, 0.61, pz);
        daisGroup.add(pilaster);
      });

      // Carved Gilded Frieze Relief Panels on North and South faces
      [-0.56, 0.56].forEach(fz => {
        const frieze = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.36, 0.04), goldMat);
        frieze.position.set(0, 0.61, fz);
        daisGroup.add(frieze);

        const lapisMedallion = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.05, 16), lapisMat);
        lapisMedallion.rotation.x = Math.PI / 2;
        lapisMedallion.position.set(0, 0.61, fz + (fz > 0 ? 0.02 : -0.02));
        daisGroup.add(lapisMedallion);
      });

      // Classical Beveled Tiered Lid with Corner Acroteria & Finials
      const lidTier1 = new THREE.Mesh(new THREE.BoxGeometry(2.62, 0.08, 1.18), walnutMat);
      lidTier1.position.y = 0.92;
      daisGroup.add(lidTier1);

      const lidTier2 = new THREE.Mesh(new THREE.BoxGeometry(2.40, 0.14, 0.96), walnutMat);
      lidTier2.position.y = 1.03;
      daisGroup.add(lidTier2);

      const lidCrest = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.06, 0.65), goldMat);
      lidCrest.position.y = 1.13;
      daisGroup.add(lidCrest);

      // Corner Gilded Finial Ornaments on Lid
      [[-1.15, -0.42], [1.15, -0.42], [-1.15, 0.42], [1.15, 0.42]].forEach(([fx, fz]) => {
        const finial = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 10), goldMat);
        finial.position.set(fx, 1.15, fz);
        daisGroup.add(finial);
      });

      // 3. Angled Museum Didactic Placard Stanchion (matching the reference photo stand)
      const labelStandGroup = new THREE.Group();
      labelStandGroup.position.set(2.1, 0, -1.1);

      const standBase = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.04, 0.24), marblePlinthMat);
      standBase.position.y = 0.02;
      labelStandGroup.add(standBase);

      const standPole = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.86, 0.04), marblePlinthMat);
      standPole.position.y = 0.47;
      labelStandGroup.add(standPole);

      const angledDesk = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.03, 0.24), marblePlinthMat);
      angledDesk.position.set(0, 0.92, 0);
      angledDesk.rotation.x = 0.45;
      labelStandGroup.add(angledDesk);

      const plaqueTex = TextureFactory.createPlaqueTexture('ROYAL SARCOPHAGUS', 'EGYPTIAN ANTIQUITIES • 1250 BCE');
      const plaqueMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(0.28, 0.18),
        new THREE.MeshBasicMaterial({ map: plaqueTex, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })
      );
      plaqueMesh.position.set(0, 0.935, 0.005);
      plaqueMesh.rotation.x = -Math.PI / 2 + 0.45;
      labelStandGroup.add(plaqueMesh);

      daisGroup.add(labelStandGroup);

      this.scene.add(daisGroup);

      this.colliders.push({
        type: 'box',
        floor: fl,
        minX: x - 2.4,
        maxX: x + 2.4,
        minZ: z - 1.4,
        maxZ: z + 1.4,
        minY: y0,
        maxY: y0 + 1.25
      });

      // 4 Brass Stanchions and velvet ropes enclosing the sarcophagus
      const sOffsets = [[-2.5, -1.6], [2.5, -1.6], [2.5, 1.6], [-2.5, 1.6]];
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
      const standGroup = new THREE.Group();
      standGroup.position.set(x, y0, z);
      standGroup.rotation.y = rotY;

      // Authentic museum-grade brass and rich mahogany materials
      const darkMahogany = new THREE.MeshStandardMaterial({ color: 0x22130c, roughness: 0.45, metalness: 0.05 });
      const brassMat = new THREE.MeshStandardMaterial({ color: 0xc5a059, metalness: 0.85, roughness: 0.28 });
      const goldFrameMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.80, roughness: 0.25 });
      const backingMat = new THREE.MeshLambertMaterial({ color: 0x18181b });

      // 1. Heavy Weighted Architectural Plinth Base (circular stepped cast brass & mahogany, rock solid on floor)
      const baseTier1 = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.26, 0.035, 24), brassMat);
      baseTier1.position.y = 0.0175;
      standGroup.add(baseTier1);

      const baseTier2 = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.20, 0.030, 24), darkMahogany);
      baseTier2.position.y = 0.045;
      standGroup.add(baseTier2);

      const baseCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.065, 0.040, 16), brassMat);
      baseCollar.position.y = 0.075;
      standGroup.add(baseCollar);

      // 2. Upright Stanchion Post (solid seamless brass display column)
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.96, 16), brassMat);
      post.position.y = 0.55;
      standGroup.add(post);

      // Decorative central collar ring
      const midRing = new THREE.Mesh(new THREE.TorusGeometry(0.034, 0.007, 8, 20), brassMat);
      midRing.rotation.x = Math.PI / 2;
      midRing.position.y = 0.55;
      standGroup.add(midRing);

      // Stanchion capital collar below mount
      const capital = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.030, 0.05, 16), brassMat);
      capital.position.y = 1.04;
      standGroup.add(capital);

      // 3. Ergonomic Angled Reading Head Bracket (tilted 18 degrees back for natural eye-level viewing)
      const headGroup = new THREE.Group();
      headGroup.position.set(0, 1.05, 0);
      headGroup.rotation.x = -0.28; // ~16 deg tilt

      // Heavy mounting knuckle fixture clamped directly atop the stanchion post
      const mountKnuckle = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.07), brassMat);
      mountKnuckle.position.set(0, 0.025, 0);
      headGroup.add(mountKnuckle);

      // Rigid backing support plate connecting mount to frame
      const backPlate = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.50, 0.018), backingMat);
      backPlate.position.set(0, 0.38, -0.012);
      headGroup.add(backPlate);

      // 4. Framed Gallery Floorplan / Directory Board (clean, solid, perfectly unified)
      const frameW = 0.58;
      const frameH = 0.74;
      const frameD = 0.032;

      // Outer Gilded Exhibition Frame
      const frameMesh = new THREE.Mesh(new THREE.BoxGeometry(frameW, frameH, frameD), goldFrameMat);
      frameMesh.position.set(0, 0.38, 0.012);
      headGroup.add(frameMesh);

      // Inner Mat Board
      const matBoard = new THREE.Mesh(new THREE.BoxGeometry(frameW - 0.08, frameH - 0.08, 0.008), backingMat);
      matBoard.position.set(0, 0.38, 0.026);
      headGroup.add(matBoard);

      // Face1 stand portrait print
      const face1Texture = this.texLoader.load('assets/textures/museum-sign.jpeg', (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
      });
      const face1 = new THREE.Mesh(
        new THREE.PlaneGeometry(frameW - 0.12, frameH - 0.12),
        new THREE.MeshBasicMaterial({ map: face1Texture })
      );
      face1.position.set(0, 0.38, 0.035);
      headGroup.add(face1);

      // Bottom Ledge Lip (cradles the frame)
      const bottomLedge = new THREE.Mesh(new THREE.BoxGeometry(frameW + 0.04, 0.026, 0.045), brassMat);
      bottomLedge.position.set(0, 0.015, 0.022);
      headGroup.add(bottomLedge);

      standGroup.add(headGroup);
      this.scene.add(standGroup);

      // Accurate compact cylinder obstacle collider for the pedestal sign stand
      this.colliders.push({
        type: 'cylinder',
        floor: fl,
        x: x,
        z: z,
        radius: 0.28,
        minY: y0,
        maxY: y0 + 1.25
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

      // 3 Tiers of heavy orange load beams spanning strictly between inner faces of the blue upright posts
      // Inner face of posts at px = -1.10 + 0.03 = -1.07 and +1.10 - 0.03 = +1.07 -> span = 2.14m
      // Mounting cleanly between posts with zero intersection/overlap eliminates any orange glitchy squares on blue posts
      [0.85, 1.85, 2.85].forEach(by => {
        [-0.45, 0.45].forEach(bz => {
          const beam = new THREE.Mesh(new THREE.BoxGeometry(2.14, 0.08, 0.04), beamMat);
          beam.position.set(0, by, bz);
          rackGroup.add(beam);
        });
        const deck = new THREE.Mesh(new THREE.BoxGeometry(2.14, 0.02, 0.86), steelMat);
        deck.position.set(0, by + 0.04, 0);
        rackGroup.add(deck);
      });

      // Wooden storage crates on lower level (seated cleanly on floor)
      [-0.55, 0.55].forEach((cx) => {
        const crate = new THREE.Mesh(new THREE.BoxGeometry(0.80, 0.70, 0.70), crateMat);
        crate.position.set(cx, 0.35, 0);
        rackGroup.add(crate);
      });

      // Archival record cartons on mid level (seated cleanly on shelf deck)
      [-0.75, -0.25, 0.25, 0.75].forEach(cx => {
        const box = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.35, 0.55), cartonMat);
        box.position.set(cx, 1.075, 0);
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
        // FLOOR 0 ("1ST FLOOR"): GRAND CLASSICAL ANTIQUITIES & CONCOURSE
        // =========================================================================

        // 1. MAIN GALLERY (x: -16..-4, z: -18..28): 46m Grand Concourse
        this.createGalleryRunnerRug(-10.0, y0, -9.0, 3.2, 14.0, 0xb47488, 0xc6bc99);
        this.createGalleryRunnerRug(-10.0, y0,  7.0, 3.2, 10.0, 0xb47488, 0xc6bc99);
        this.createGalleryRunnerRug(-10.0, y0, 21.0, 3.2, 10.0, 0xb47488, 0xc6bc99);

        // Entrance potted plants flanking the entrance archway (scaled 40% smaller)
        [
          [-14.8,  25.5], [-5.2,  25.5]
        ].forEach(([px, pz]) => {
          this.createPottedMuseumPlant(px, y0, pz, fl);
        });

        // Polished Mahogany Easel stand moved to the left of the south entrance door
        this.createMuseumEasel(-10.0, y0, -16.5, fl, 0);
        this.createMuseumEasel(-12.8, y0,  26.0, fl, Math.PI);

        // 2. WEST WING (x: -36..-16, z: -6..18): Classical Antiquities Salon
        this.createGalleryRunnerRug(-26.0, y0, 6.0, 4.4, 20.0, 0x7e8bb2, 0xc6bc99);
        this.createVitrineTable(-31.0, y0,  0.0, 'amphora', fl);
        this.createVitrineTable(-21.0, y0,  0.0, 'jewelry', fl);
        this.createVitrineTable(-31.0, y0, 12.0, 'coins', fl);
        this.createVitrineTable(-21.0, y0, 12.0, 'chalice', fl);

        // (Floor 0 West Wing sculptures removed per curator request)

        [[-34.5, -5.0], [-17.5, -5.0], [-34.5, 17.0]].forEach(([px, pz]) => {
          this.createPottedMuseumPlant(px, y0, pz, fl);
        });

        // 3. NORTH GALLERY (x: -4..28, z: -40..-26): Egyptian Antiquities Pavilion
        this.createEgyptianSarcophagusDais(12.0, y0, -33.0, fl);

        // (Limestone Obelisks flanking North Gallery entry removed per curator feedback)

        this.createVitrineTable(2.0, y0, -33.0, 'scroll', fl);
        this.createVitrineTable(22.0, y0, -33.0, 'jewelry', fl);

        [[1.0, -27.5], [23.0, -27.5], [4.0, -38.5], [20.0, -38.5]].forEach(([px, pz]) => {
          this.createPottedMuseumPlant(px, y0, pz, fl);
        });

        // 4. SOUTH-EAST WING (x: 4..28, z: 18..28): Rotunda Concourse
        // Pink rug aligned with room entrance at z = 18 and leading under the round wooden platform at (19, 30.5)
        this.createGalleryRunnerRug(19.0, y0, 24.5, 3.0, 13.0, 0xb47488, 0xc6bc99);
        // (Floor 0 South-East Wing sculptures removed per curator request)

        // Living aquatic exhibition tank (South-East Wing exhibition alcove with blue lid glow)
        this.createAquariumTank(8.5, y0, 27.4, fl, Math.PI);

      } else if (fl === 1) {
        // =========================================================================
        // FLOOR 1 ("2ND FLOOR"): THE GREAT LIBRARY & CARTOGRAPHY
        // =========================================================================
        this.createGalleryRunnerRug(-10.0, y0, -9.0, 3.0, 14.0, 0x7e8bb2, 0xc6bc99);
        this.createGalleryRunnerRug(-10.0, y0,  7.0, 3.0, 10.0, 0x7e8bb2, 0xc6bc99);
        this.createGalleryRunnerRug(-10.0, y0, 21.0, 3.0, 10.0, 0x7e8bb2, 0xc6bc99);

        // Entrance potted plants flanking archway
        [
          [-14.8,  25.5], [-5.2,  25.5]
        ].forEach(([px, pz]) => {
          this.createPottedMuseumPlant(px, y0, pz, fl);
        });

        // West Wing Folio Reading Room (Reading vitrines, rugs)
        this.createGalleryRunnerRug(-26.0, y0, 6.0, 4.4, 20.0, 0x7e8bb2, 0xc6bc99);
        this.createVitrineTable(-31.0, y0,  0.0, 'scroll', fl);
        this.createVitrineTable(-21.0, y0,  0.0, 'astrolabe', fl);
        this.createVitrineTable(-31.0, y0, 12.0, 'scroll', fl);
        this.createVitrineTable(-21.0, y0, 12.0, 'astrolabe', fl);

        // North Gallery Map Archives
        this.createVitrineTable(6.0, y0, -33.0, 'scroll', fl);
        this.createVitrineTable(18.0, y0, -33.0, 'astrolabe', fl);
        [[4.0, -28.0], [20.0, -28.0], [4.0, -38.5], [20.0, -38.5]].forEach(([px, pz]) => {
          this.createPottedMuseumPlant(px, y0, pz, fl);
        });

        // (Floor 1 Library section sculptures removed per curator request)

        // Living aquatic exhibition tank (South-East Gallery exhibition alcove with blue lid glow)
        this.createAquariumTank(8.5, y0, 27.4, fl, Math.PI);

      } else if (fl === 2) {
        // =========================================================================
        // FLOOR 2 ("3RD FLOOR"): SURREALISM SALON & RENAISSANCE ARMORY
        // =========================================================================
        this.createGalleryRunnerRug(-10.0, y0, -9.0, 3.0, 14.0, 0x53aa93, 0xc6bc99);
        this.createGalleryRunnerRug(-10.0, y0,  7.0, 3.0, 10.0, 0x53aa93, 0xc6bc99);
        this.createGalleryRunnerRug(-10.0, y0, 21.0, 3.0, 10.0, 0x53aa93, 0xc6bc99);

        // (Floor 2 Main Gallery sculptures removed per curator request)

        // Entrance potted plants flanking archway
        [
          [-14.8,  25.5], [-5.2,  25.5]
        ].forEach(([px, pz]) => {
          this.createPottedMuseumPlant(px, y0, pz, fl);
        });

        // West Wing (Knight statue removed per request)
        this.createGalleryRunnerRug(-26.0, y0, 6.0, 4.4, 20.0, 0x53aa93, 0xc6bc99);

        this.createVitrineTable(-31.0, y0,  0.0, 'chalice', fl);
        this.createVitrineTable(-21.0, y0,  0.0, 'jewelry', fl);
        this.createVitrineTable(-31.0, y0, 12.0, 'chalice', fl);
        this.createVitrineTable(-21.0, y0, 12.0, 'jewelry', fl);

        // Potted plants in West Wing corners
        [[-34.5, -5.0], [-17.5, -5.0], [-34.5, 17.0]].forEach(([px, pz]) => {
          this.createPottedMuseumPlant(px, y0, pz, fl);
        });

        // North Gallery Wunderkammer
        this.createVitrineTable(6.0, y0, -33.0, 'astrolabe', fl);
        this.createVitrineTable(18.0, y0, -33.0, 'chalice', fl);
        [[4.0, -28.0], [20.0, -28.0], [4.0, -38.5], [20.0, -38.5]].forEach(([px, pz]) => {
          this.createPottedMuseumPlant(px, y0, pz, fl);
        });

        // Living aquatic exhibition tank (South-East Gallery exhibition alcove with blue lid glow)
        this.createAquariumTank(8.5, y0, 27.4, fl, Math.PI);

      } else {
        // =========================================================================
        // FLOOR 3 ("4TH FLOOR"): RESTRICTED ARCHIVAL STORAGE & MILK CRATES
        // Storage pallet racks are strictly positioned in the large East Main Hall
        // with the milk crates, and nowhere else.
        // =========================================================================
        this.createPalletRackStorage(10.0, y0, -21.0, fl);
        this.createPalletRackStorage(20.0, y0, -21.0, fl);
        this.createPalletRackStorage(10.0, y0,   1.0, fl);
        this.createPalletRackStorage(20.0, y0,   1.0, fl);

        // Living aquatic exhibition tank (South-East Gallery exhibition alcove with blue lid glow)
        this.createAquariumTank(8.5, y0, 27.4, fl, Math.PI);
      }
    }

    initYouTubeAPI() {
      const PLAYLISTS_BY_FLOOR = [
        'PLCmArB5wTc0SIKYXG2EQX3ZyHLuLbtlld', // Floor 1 (User's Curated Playlist)
        'PLxdcA8wIcZd1fsXxDiTDoIgaHPQRLiWUp', // Floor 2 (User's Floor 2 Curated Playlist)
        'PL8HAkqKX065CROqCONrVtjJBl-p9sNsxj', // Floor 3 (Women and Art Exhibition)
        'PL8HAkqKX065DVI9NdnlT8HztJiftU9QSZ'  // Floor 4 (Met Modern Perspectives)
      ];
      this.videoPlaylists = PLAYLISTS_BY_FLOOR;

      const mountPlayer = () => {
        if (!window.YT || !window.YT.Player) {
          setTimeout(mountPlayer, 200);
          return;
        }
        try {
          this.ytPlayer = new window.YT.Player('yt-player', {
            height: '100%',
            width: '100%',
            playerVars: {
              autoplay: 1,
              controls: 0,
              disablekb: 1,
              enablejsapi: 1,
              fs: 0,
              iv_load_policy: 3,
              modestbranding: 1,
              rel: 0,
              origin: window.location.origin
            },
            events: {
              onReady: (event) => {
                this.ytReady = true;
                if (this.ytPendingCmds && this.ytPendingCmds.length > 0) {
                  this.ytPendingCmds.forEach(cmd => cmd());
                  this.ytPendingCmds = [];
                }
              },
              onError: (err) => {
                console.warn('YouTube Player Event:', err);
              }
            }
          });
        } catch (e) {
          console.warn('YouTube init exception:', e);
        }
      };

      if (window.YT && window.YT.Player) {
        mountPlayer();
      } else {
        window.onYouTubeIframeAPIReady = () => mountPlayer();
        setTimeout(mountPlayer, 800);
      }
    }

    createVideoInstallationRoom(fl, y0, mats) {
      // 1. South Back Wall Video Projection Screen (Image 2 Red Rectangle)
      // Room bounds: x: -34..-24, z: 18..28. Back south wall is at z = 28.
      const screenW = 6.4;
      const screenH = 3.6;
      const screenX = -29.0;
      const screenY = y0 + 2.70;
      const screenZ = 27.70;

      const screenGroup = new THREE.Group();
      screenGroup.position.set(screenX, screenY, screenZ);

      // Matte dark outer frame / bezel
      const frameThickness = 0.08;
      const frameDepth = 0.06;
      const frameMat = new THREE.MeshStandardMaterial({
        color: 0x11161d,
        roughness: 0.45,
        metalness: 0.85
      });

      // Top & Bottom border rails
      const topRail = new THREE.Mesh(new THREE.BoxGeometry(screenW + frameThickness * 2, frameThickness, frameDepth), frameMat);
      topRail.position.set(0, screenH / 2 + frameThickness / 2, 0);
      screenGroup.add(topRail);

      const botRail = new THREE.Mesh(new THREE.BoxGeometry(screenW + frameThickness * 2, frameThickness, frameDepth), frameMat);
      botRail.position.set(0, -screenH / 2 - frameThickness / 2, 0);
      screenGroup.add(botRail);

      // Left & Right border rails
      const leftRail = new THREE.Mesh(new THREE.BoxGeometry(frameThickness, screenH, frameDepth), frameMat);
      leftRail.position.set(-screenW / 2 - frameThickness / 2, 0, 0);
      screenGroup.add(leftRail);

      const rightRail = new THREE.Mesh(new THREE.BoxGeometry(frameThickness, screenH, frameDepth), frameMat);
      rightRail.position.set(screenW / 2 + frameThickness / 2, 0, 0);
      screenGroup.add(rightRail);

      // Screen mesh backdrop: Punches an alpha=0 transparent hole in the WebGL canvas
      // while writing depth (depthWrite: true). Because the video layer is directly behind
      // the canvas (z-index: 1 vs 2), the video shines through this wall quad, while any
      // foreground 3D geometry (player character, hands, weapons, console desk) passes depth testing
      // and renders opaque pixels directly on top of the video, creating true 3D physical occlusion!
      const screenHoleMat = new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0,
        blending: THREE.CustomBlending,
        blendSrc: THREE.ZeroFactor,
        blendDst: THREE.ZeroFactor,
        blendSrcAlpha: THREE.ZeroFactor,
        blendDstAlpha: THREE.ZeroFactor,
        depthWrite: true,
        side: THREE.DoubleSide
      });
      const screenMesh = new THREE.Mesh(new THREE.PlaneGeometry(screenW, screenH), screenHoleMat);
      screenMesh.position.set(0, 0, frameDepth * 0.4);
      screenMesh.rotation.y = Math.PI; // Face north into room
      screenMesh.renderOrder = -1; // Render before foreground objects
      screenGroup.add(screenMesh);

      // Subtle projector ambient glow directed back into room
      const screenLight = new THREE.PointLight(0x7dd3fc, 0.45, 12.0, 1.6);
      screenLight.position.set(0, 0, -1.2);
      screenGroup.add(screenLight);

      this.scene.add(screenGroup);

      // 2. Control Console Deck (Replacing brown center box at x: -29, z: 24)
      const deckGroup = new THREE.Group();
      deckGroup.position.set(-29.0, y0, 24.0);

      const deckBaseMat = mats.mahogany;
      const consoleMetalMat = new THREE.MeshStandardMaterial({
        color: 0x181e24,
        roughness: 0.35,
        metalness: 0.85
      });
      const topPlateMat = new THREE.MeshStandardMaterial({
        color: 0x0f172a,
        roughness: 0.25,
        metalness: 0.90
      });

      // Heavy museum plinth base
      const plinthBase = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.16, 1.1), consoleMetalMat);
      plinthBase.position.set(0, 0.08, 0);
      deckGroup.add(plinthBase);

      // Sculpted mahogany pedestal body
      const pedestalBody = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.80, 0.85), deckBaseMat);
      pedestalBody.position.set(0, 0.54, 0);
      deckGroup.add(pedestalBody);

      // Angled console top wedge tilted towards north doorway so controls face the entering player
      const consoleHead = new THREE.Group();
      consoleHead.position.set(0, 0.94, 0);
      consoleHead.rotation.x = -0.38; // Tilted back towards player entering from north

      const consolePlate = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.08, 0.72), topPlateMat);
      consoleHead.add(consolePlate);

      // Helper to generate dynamic button textures styled after tactile colorful remote controls (Image 2)
      // Transformed so text and symbols are oriented upright and read left-to-right (un-mirrored) from the player's perspective
      const makeButtonTexture = (label, symbol, colorCfg) => {
        const can = document.createElement('canvas');
        can.width = 256;
        can.height = 256;
        const ctx = can.getContext('2d');

        // Button face background color
        ctx.fillStyle = colorCfg.bg;
        ctx.fillRect(0, 0, 256, 256);

        // Tactile outer bevel ring
        ctx.beginPath();
        ctx.arc(128, 128, 110, 0, Math.PI * 2);
        ctx.lineWidth = 14;
        ctx.strokeStyle = colorCfg.border;
        ctx.stroke();

        // Inner bevel highlight
        ctx.beginPath();
        ctx.arc(128, 128, 100, 0, Math.PI * 2);
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.stroke();

        // Transform coordinate system to cancel CylinderGeometry top-cap reflection
        // and orient text/symbols cleanly upright and reading left-to-right from the player perspective
        ctx.save();
        ctx.translate(128, 128);
        ctx.transform(0, 1, -1, 0, 0, 0); // Flips horizontally and aligns upright

        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 96px sans-serif';
        ctx.fillText(symbol, 0, -12);

        ctx.font = 'bold 26px sans-serif';
        ctx.fillStyle = colorCfg.textColor || '#ffffff';
        ctx.fillText(label, 0, 64);
        ctx.restore();

        const tex = new THREE.CanvasTexture(can);
        tex.anisotropy = 4;
        return tex;
      };

      // Button definitions with vibrant color palette inspired by the EZclicker remote:
      // PREV & NEXT: Vibrant Sky Blue (like channel buttons)
      // PLAY / PAUSE: Vibrant Emerald Green (like action buttons)
      // MUTE: Warm Sun Yellow (like mute button)
      // Ordered Left-to-Right from player's view: PREV (left) -> PLAY -> NEXT -> MUTE (right)
      const btnDefs = [
        {
          id: 'prev',
          label: 'PREV',
          symbol: '◀',
          relX: 0.54, // Leftmost from player's viewpoint
          prompt: '[E] PREVIOUS VIDEO',
          colorCfg: { bg: '#0284c7', border: '#38bdf8', side: 0x0369a1, emissive: 0x0284c7 }
        },
        {
          id: 'play',
          label: 'PLAY',
          symbol: '▶❚❚',
          relX: 0.18, // Second from left
          prompt: '[E] PAUSE / PLAY',
          colorCfg: { bg: '#16a34a', border: '#4ade80', side: 0x15803d, emissive: 0x16a34a }
        },
        {
          id: 'next',
          label: 'NEXT',
          symbol: '▶',
          relX: -0.18, // Third from left
          prompt: '[E] NEXT VIDEO',
          colorCfg: { bg: '#0284c7', border: '#38bdf8', side: 0x0369a1, emissive: 0x0284c7 }
        },
        {
          id: 'mute',
          label: 'MUTE',
          symbol: '🔊',
          relX: -0.54, // Rightmost from player's viewpoint
          prompt: '[E] MUTE / UNMUTE',
          colorCfg: { bg: '#eab308', border: '#fef08a', side: 0xb45309, textColor: '#1e293b', emissive: 0xd97706 }
        }
      ];

      const interactiveButtons = [];

      btnDefs.forEach(b => {
        const btnGeo = new THREE.CylinderGeometry(0.12, 0.13, 0.05, 32);
        const tex = makeButtonTexture(b.label, b.symbol, b.colorCfg);
        const capMat = new THREE.MeshStandardMaterial({
          map: tex,
          roughness: 0.35,
          metalness: 0.25,
          emissive: b.colorCfg.emissive,
          emissiveIntensity: 0.25
        });
        const sideMat = new THREE.MeshStandardMaterial({
          color: b.colorCfg.side,
          roughness: 0.45,
          metalness: 0.3
        });
        const btnMesh = new THREE.Mesh(btnGeo, [sideMat, capMat, sideMat]);
        btnMesh.rotation.x = 0;
        btnMesh.position.set(b.relX, 0.05, 0.0);
        consoleHead.add(btnMesh);

        interactiveButtons.push({
          id: b.id,
          prompt: b.prompt,
          mesh: btnMesh,
          origY: 0.05,
          material: capMat,
          floor: fl,
          worldPos: new THREE.Vector3(-29.0 + b.relX, y0 + 0.99, 23.98)
        });
      });

      deckGroup.add(consoleHead);
      this.scene.add(deckGroup);

      // Solid physical collider matching new console
      this.colliders.push({
        type: 'box',
        floor: fl,
        minX: -29.0 - 1.1,
        maxX: -29.0 + 1.1,
        minZ: 24.0 - 0.55,
        maxZ: 24.0 + 0.55,
        minY: y0,
        maxY: y0 + 1.25
      });

      // Register video installation room metadata
      const roomMeta = {
        floor: fl,
        playlistId: this.videoPlaylists[fl],
        screenCenter: new THREE.Vector3(screenX, screenY, screenZ),
        screenNormal: new THREE.Vector3(0, 0, -1),
        screenW: screenW,
        screenH: screenH,
        screenMesh: screenMesh,
        screenLight: screenLight,
        buttons: interactiveButtons,
        minX: -34.5,
        maxX: -23.5,
        minZ: 16.5,
        maxZ: 28.8
      };

      this.videoInstallationRooms.push(roomMeta);
    }

    sendYouTubeCommand(cmdFn) {
      if (!this.ytPlayer || !this.ytReady) {
        if (!this.ytPendingCmds) this.ytPendingCmds = [];
        this.ytPendingCmds.push(cmdFn);
        return;
      }
      try {
        cmdFn(this.ytPlayer);
      } catch (e) {
        console.warn('YouTube command error:', e);
      }
    }

    loadPlaylistForFloor(fl, initialIndex = 0, initialTime = 0) {
      const room = this.videoInstallationRooms.find(r => r.floor === fl);
      if (!room || !room.playlistId) return;
      if (this.ytCurrentPlaylist === room.playlistId) return;

      this.ytCurrentPlaylist = room.playlistId;
      this.sendYouTubeCommand(player => {
        if (typeof player.loadPlaylist === 'function') {
          player.loadPlaylist({
            list: room.playlistId,
            listType: 'playlist',
            index: initialIndex || 0,
            startSeconds: initialTime || 0,
            suggestedQuality: 'hd720'
          });
          if (this.ytIsMuted && typeof player.mute === 'function') {
            player.mute();
          } else if (typeof player.unMute === 'function') {
            player.unMute();
          }
        }
      });
    }

    getVideoSyncState() {
      const player = this.ytPlayer;
      let currentIndex = 0;
      let currentTime = 0;
      if (player && this.ytReady) {
        try {
          if (typeof player.getPlaylistIndex === 'function') currentIndex = player.getPlaylistIndex() || 0;
          if (typeof player.getCurrentTime === 'function') currentTime = player.getCurrentTime() || 0;
        } catch (e) {}
      }
      return {
        currentFloor: this.activeVideoRoom ? this.activeVideoRoom.floor : this.playerFloor,
        playlistId: this.ytCurrentPlaylist,
        index: currentIndex,
        time: currentTime,
        paused: this.ytIsPaused,
        muted: this.ytIsMuted
      };
    }

    onRemoteVideoStateSync(data) {
      if (!data) return;
      this.ytIsPaused = !!data.paused;
      this.ytIsMuted = !!data.muted;
      this.sendYouTubeCommand(player => {
        if (data.playlistId && this.ytCurrentPlaylist !== data.playlistId) {
          this.ytCurrentPlaylist = data.playlistId;
          if (typeof player.loadPlaylist === 'function') {
            player.loadPlaylist({
              list: data.playlistId,
              listType: 'playlist',
              index: data.index || 0,
              startSeconds: data.time || 0,
              suggestedQuality: 'hd720'
            });
          }
        } else {
          if (typeof player.getPlaylistIndex === 'function' && typeof player.playVideoAt === 'function') {
            const curIdx = player.getPlaylistIndex();
            if (data.index !== undefined && curIdx !== data.index) {
              player.playVideoAt(data.index);
            }
          }
          if (data.time !== undefined && typeof player.getCurrentTime === 'function' && typeof player.seekTo === 'function') {
            const curTime = player.getCurrentTime() || 0;
            if (Math.abs(curTime - data.time) > 2.5) {
              player.seekTo(data.time, true);
            }
          }
        }

        if (this.ytIsPaused) {
          if (typeof player.pauseVideo === 'function') player.pauseVideo();
        } else {
          if (typeof player.playVideo === 'function') player.playVideo();
        }

        if (this.ytIsMuted) {
          if (typeof player.mute === 'function') player.mute();
        } else {
          if (typeof player.unMute === 'function') player.unMute();
        }
      });
    }

    triggerVideoControl(controlId, fl = null, isRemote = false, remoteData = null) {
      const targetFloor = fl !== null ? fl : this.playerFloor;
      if (!this.audio) return;

      if (this.audio.playEmptyClick) {
        this.audio.playEmptyClick();
      }

      // Visual button press bounce
      const room = this.videoInstallationRooms.find(r => r.floor === targetFloor);
      if (room && room.buttons) {
        const btnObj = room.buttons.find(b => b.id === controlId);
        if (btnObj && btnObj.mesh) {
          btnObj.mesh.position.y = btnObj.origY - 0.025;
          if (btnObj.material && btnObj.material.emissive) {
            btnObj.material.emissiveIntensity = 0.95;
          }
          setTimeout(() => {
            if (btnObj.mesh) btnObj.mesh.position.y = btnObj.origY;
            if (btnObj.material && btnObj.material.emissive) {
              btnObj.material.emissiveIntensity = 0.25;
            }
          }, 140);
        }
      }

      // Execute YouTube API action
      switch (controlId) {
        case 'prev':
          this.sendYouTubeCommand(p => {
            if (typeof p.previousVideo === 'function') p.previousVideo();
          });
          break;
        case 'next':
          this.sendYouTubeCommand(p => {
            if (typeof p.nextVideo === 'function') p.nextVideo();
          });
          break;
        case 'play':
          if (remoteData && remoteData.paused !== undefined) {
            this.ytIsPaused = !!remoteData.paused;
          } else {
            this.ytIsPaused = !this.ytIsPaused;
          }
          this.sendYouTubeCommand(p => {
            if (remoteData && remoteData.time !== undefined && typeof p.seekTo === 'function') {
              p.seekTo(remoteData.time, true);
            }
            if (this.ytIsPaused) {
              if (typeof p.pauseVideo === 'function') p.pauseVideo();
            } else {
              if (typeof p.playVideo === 'function') p.playVideo();
            }
          });
          break;
        case 'mute':
          if (remoteData && remoteData.muted !== undefined) {
            this.ytIsMuted = !!remoteData.muted;
          } else {
            this.ytIsMuted = !this.ytIsMuted;
          }
          this.sendYouTubeCommand(p => {
            if (this.ytIsMuted) {
              if (typeof p.mute === 'function') p.mute();
            } else {
              if (typeof p.unMute === 'function') p.unMute();
            }
          });
          break;
      }

      // Sync across multiplayer
      if (!isRemote && this.mp && typeof this.mp.notifyVideoControl === 'function') {
        let currentTime = 0;
        let currentIndex = 0;
        if (this.ytPlayer && this.ytReady) {
          try {
            if (typeof this.ytPlayer.getCurrentTime === 'function') currentTime = this.ytPlayer.getCurrentTime() || 0;
            if (typeof this.ytPlayer.getPlaylistIndex === 'function') currentIndex = this.ytPlayer.getPlaylistIndex() || 0;
          } catch (e) {}
        }
        this.mp.notifyVideoControl(targetFloor, controlId, {
          paused: this.ytIsPaused,
          muted: this.ytIsMuted,
          time: currentTime,
          index: currentIndex
        });
      }
    }

    onRemoteVideoControl(floor, action, extra = null) {
      this.triggerVideoControl(action, floor, true, extra);
    }

    updateVideoInstallation(delta) {
      if (!this.videoInstallationRooms || this.videoInstallationRooms.length === 0) return;

      const px = this.playerPos.x;
      const pz = this.playerPos.z;
      const pfl = this.playerFloor;

      // Find if player is currently in or directly viewing any video installation room
      const currentRoom = this.videoInstallationRooms.find(r =>
        r.floor === pfl && px >= r.minX && px <= r.maxX && pz >= r.minZ && pz <= r.maxZ
      );

      const overlayContainer = document.getElementById('video-screen-container');

      if (!currentRoom) {
        if (this.activeVideoRoom) {
          this.activeVideoRoom = null;
          if (overlayContainer) overlayContainer.style.display = 'none';
          this.sendYouTubeCommand(p => {
            if (typeof p.pauseVideo === 'function') p.pauseVideo();
          });
        }
        return;
      }

      // Player entered or is inside room
      if (this.activeVideoRoom !== currentRoom) {
        this.activeVideoRoom = currentRoom;
        this.loadPlaylistForFloor(currentRoom.floor);
        this.sendYouTubeCommand(p => {
          if (!this.ytIsPaused && typeof p.playVideo === 'function') p.playVideo();
        });
      }

      if (!overlayContainer || !this.camera) return;

      // Check if screen is in front of camera
      const camPos = this.camera.position;
      const toScreen = new THREE.Vector3().subVectors(currentRoom.screenCenter, camPos);
      const camFwd = new THREE.Vector3();
      this.camera.getWorldDirection(camFwd);

      // Facing screen check
      if (toScreen.dot(camFwd) < 0.2) {
        overlayContainer.style.display = 'none';
        return;
      }

      // Compute exact 3D camera and viewport transformation
      const w2 = currentRoom.screenW / 2;
      const h2 = currentRoom.screenH / 2;
      const sy = currentRoom.screenCenter.y;
      const sz = currentRoom.screenCenter.z;
      const sx = currentRoom.screenCenter.x;

      // Check if all screen corners are in front of near plane
      const pTopLeft = new THREE.Vector3(sx + w2, sy + h2, sz).project(this.camera);
      const pTopRight = new THREE.Vector3(sx - w2, sy + h2, sz).project(this.camera);
      const pBotLeft = new THREE.Vector3(sx + w2, sy - h2, sz).project(this.camera);
      const pBotRight = new THREE.Vector3(sx - w2, sy - h2, sz).project(this.camera);

      if (pTopLeft.z > 1.0 || pTopRight.z > 1.0 || pBotLeft.z > 1.0 || pBotRight.z > 1.0 ||
          pTopLeft.z < -1.0 || pTopRight.z < -1.0 || pBotLeft.z < -1.0 || pBotRight.z < -1.0) {
        overlayContainer.style.display = 'none';
        return;
      }

      const screenWidthPx = window.innerWidth;
      const screenHeightPx = window.innerHeight;
      const basisW = 960;
      const basisH = 540;

      // 3D coordinates for quad corners facing into room (North / -Z direction):
      // When looking at south wall (+Z):
      // Top-Left (u=0, v=0) is at sx + w2 (player left)
      // Top-Right (u=1, v=0) is at sx - w2 (player right)
      // Bot-Left (u=0, v=1) is at sx + w2, sy - h2
      const P00 = new THREE.Vector3(sx + w2, sy + h2, sz);
      const P10 = new THREE.Vector3(sx - w2, sy + h2, sz);
      const P01 = new THREE.Vector3(sx + w2, sy - h2, sz);

      const dX = new THREE.Vector3().subVectors(P10, P00).multiplyScalar(1 / basisW);
      const dY = new THREE.Vector3().subVectors(P01, P00).multiplyScalar(1 / basisH);
      const dZ = new THREE.Vector3().crossVectors(dX, dY).normalize();

      const M_quad = new THREE.Matrix4().set(
        dX.x, dY.x, dZ.x, P00.x,
        dX.y, dY.y, dZ.y, P00.y,
        dX.z, dY.z, dZ.z, P00.z,
        0,    0,    0,    1
      );

      const viewProj = new THREE.Matrix4().multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);

      const M_screen = new THREE.Matrix4().set(
        screenWidthPx / 2, 0,                  0,   screenWidthPx / 2,
        0,                 -screenHeightPx / 2, 0,   screenHeightPx / 2,
        0,                 0,                  0.5, 0.5,
        0,                 0,                  0,   1
      );

      const M_total = new THREE.Matrix4();
      M_total.multiplyMatrices(M_screen, viewProj);
      M_total.multiply(M_quad);

      const m = M_total.elements;
      const wNorm = m[15];
      if (Math.abs(wNorm) < 1e-6) {
        overlayContainer.style.display = 'none';
        return;
      }

      const cssMatrix = 'matrix3d(' +
        (m[0] / wNorm).toFixed(7) + ',' + (m[1] / wNorm).toFixed(7) + ',' + (m[2] / wNorm).toFixed(7) + ',' + (m[3] / wNorm).toFixed(7) + ',' +
        (m[4] / wNorm).toFixed(7) + ',' + (m[5] / wNorm).toFixed(7) + ',' + (m[6] / wNorm).toFixed(7) + ',' + (m[7] / wNorm).toFixed(7) + ',' +
        (m[8] / wNorm).toFixed(7) + ',' + (m[9] / wNorm).toFixed(7) + ',' + (m[10] / wNorm).toFixed(7) + ',' + (m[11] / wNorm).toFixed(7) + ',' +
        (m[12] / wNorm).toFixed(7) + ',' + (m[13] / wNorm).toFixed(7) + ',' + (m[14] / wNorm).toFixed(7) + ',1)';

      overlayContainer.style.display = 'block';
      overlayContainer.style.transform = cssMatrix;
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

      // Complete Solid Masonry Spandrels (100% gapless seal between jambs, arch ring, wall, and lintel)
      // Left Spandrel solid block: seamlessly spans x: -2.42 to -1.35, y: straightH to straightH + 1.62
      const leftSpandrelOuter = new THREE.Mesh(new THREE.BoxGeometry(1.08, 1.62, 0.48), stoneMat);
      leftSpandrelOuter.position.set(-1.88, straightH + 0.81, 0);
      portalGroup.add(leftSpandrelOuter);

      // Right Spandrel solid block: seamlessly spans x: +1.35 to +2.42, y: straightH to straightH + 1.62
      const rightSpandrelOuter = new THREE.Mesh(new THREE.BoxGeometry(1.08, 1.62, 0.48), stoneMat);
      rightSpandrelOuter.position.set(1.88, straightH + 0.81, 0);
      portalGroup.add(rightSpandrelOuter);

      // Top Lintel Infill: solid stone spanning above arch to lintel
      const topLintelFill = new THREE.Mesh(new THREE.BoxGeometry(3.20, 0.28, 0.48), stoneMat);
      topLintelFill.position.set(0, straightH + 1.68, 0);
      portalGroup.add(topLintelFill);

      // Solid Portal Wall Backing Plate: airtight seal flush against the museum doorway cutout
      const backingPlate = new THREE.Mesh(new THREE.BoxGeometry(4.88, 1.72, 0.16), stoneMat);
      backingPlate.position.set(0, straightH + 0.84, 0.18);
      portalGroup.add(backingPlate);

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
      // Rich gilded walnut/gold frame material that stays warm and visible even with flashlight off
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
        const arts = CURATED_ARTWORKS.filter(a => a.floor === f).slice(0, 38);

        slots.forEach((slot, idx) => {
          const art = arts[idx % arts.length];

          // Proportional museum sizing: larger grand scale on open walls, clamped on narrower piers to never hang over walkways
          const maxW = (slot.maxW || 2.85) * 1.12;
          const maxH = 2.70;
          let renderW = art.w * 1.22;
          let renderH = art.h * 1.22;
          const aspect = renderW / renderH;
          if (renderW > maxW) {
            renderW = maxW;
            renderH = renderW / aspect;
          }
          if (renderH > maxH) {
            renderH = maxH;
            renderW = renderH * aspect;
          }
          renderW = +renderW.toFixed(3);
          renderH = +renderH.toFixed(3);

          const slotY = slot.floor * CONFIG.FLOOR_HEIGHT + 2.75;
          slot.y = slotY;
          art.x = slot.x;
          art.y = slotY;
          art.z = slot.z;
          art.rotY = slot.rotY;
          art.wing = T('floor.' + (f + 1), floorNames[f]);

          const group = new THREE.Group();
          const nx = Math.sin(slot.rotY) * 0.06;
          const nz = Math.cos(slot.rotY) * 0.06;
          group.position.set(slot.x + nx, slotY, slot.z + nz);
          group.rotation.y = slot.rotY;

          const key = `${renderW}_${renderH}`;
          if (!planeGeomCache.has(key)) {
            planeGeomCache.set(key, new THREE.PlaneGeometry(renderW, renderH));
            frameGeomCache.set(key, new THREE.BoxGeometry(renderW + border * 2, renderH + border * 2, depth));
          }

          // Unified museum frame
          const frameMesh = new THREE.Mesh(frameGeomCache.get(key), frameMat);
          frameMesh.position.set(0, 0, 0);
          group.add(frameMesh);

          // Standard artwork canvas (pure non-emissive natural lighting, no artificial illumination or frame lamps)
          const canvasMesh = new THREE.Mesh(
            planeGeomCache.get(key),
            new THREE.MeshLambertMaterial({
              color: 0xffffff,
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
          plaqueMesh.position.set(0, -renderH / 2 - border - 0.16, depth / 2 + 0.005);
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
        const yMid = fl * CONFIG.FLOOR_HEIGHT + CONFIG.FLOOR_HEIGHT / 2;
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

    // =========================================================================
    // OBSTACLE-AWARE NAVIGATION GRID (shared by The Curator, Silver Smitty & statues)
    // Rasterizes every static collider (walls, benches, vitrines, plinths, desks,
    // racks...) into a per-floor occupancy grid so NPCs path AROUND furniture
    // instead of walking straight into it between nav-graph waypoints.
    // =========================================================================
    buildObstacleGrid() {
      const CELL = 0.4;
      const AGENT_R = 0.42;
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const n of this.navNodes) {
        if (n.x < minX) minX = n.x;
        if (n.x > maxX) maxX = n.x;
        if (n.z < minZ) minZ = n.z;
        if (n.z > maxZ) maxZ = n.z;
      }
      minX -= 12; maxX += 12; minZ -= 12; maxZ += 12;
      const w = Math.ceil((maxX - minX) / CELL) + 1;
      const h = Math.ceil((maxZ - minZ) / CELL) + 1;
      const NF = CONFIG.NUM_FLOORS;
      const grids = [];
      for (let fl = 0; fl < NF; fl++) grids.push(new Uint8Array(w * h));

      const markBox = (g, x0, x1, z0, z1) => {
        const i0 = Math.max(0, Math.ceil((x0 - minX) / CELL));
        const i1 = Math.min(w - 1, Math.floor((x1 - minX) / CELL));
        const j0 = Math.max(0, Math.ceil((z0 - minZ) / CELL));
        const j1 = Math.min(h - 1, Math.floor((z1 - minZ) / CELL));
        for (let j = j0; j <= j1; j++) {
          const row = j * w;
          for (let i = i0; i <= i1; i++) g[row + i] = 1;
        }
      };
      const markCyl = (g, cx, cz, r) => {
        const i0 = Math.max(0, Math.ceil((cx - r - minX) / CELL));
        const i1 = Math.min(w - 1, Math.floor((cx + r - minX) / CELL));
        const j0 = Math.max(0, Math.ceil((cz - r - minZ) / CELL));
        const j1 = Math.min(h - 1, Math.floor((cz + r - minZ) / CELL));
        const r2 = r * r;
        for (let j = j0; j <= j1; j++) {
          const z = minZ + j * CELL - cz;
          for (let i = i0; i <= i1; i++) {
            const x = minX + i * CELL - cx;
            if (x * x + z * z <= r2) g[j * w + i] = 1;
          }
        }
      };

      for (const c of this.colliders) {
        if (c.disabled || c.isCrate) continue;
        const floors = (c.floor === 'all') ? [0, 1, 2, 3].slice(0, NF) : [c.floor];
        for (const fl of floors) {
          if (typeof fl !== 'number' || fl < 0 || fl >= NF) continue;
          const base = fl * CONFIG.FLOOR_HEIGHT;
          if (c.minY !== undefined && c.minY > base + 2.0) continue;   // overhead
          if (c.maxY !== undefined && c.maxY < base + 0.25) continue;  // flush with floor
          if (c.type === 'box') {
            if (c.minX === c.maxX || c.minZ === c.maxZ) continue;
            markBox(grids[fl], c.minX - AGENT_R, c.maxX + AGENT_R, c.minZ - AGENT_R, c.maxZ + AGENT_R);
          } else if (c.type === 'cylinder') {
            markCyl(grids[fl], c.x, c.z, (c.radius || 0.3) + AGENT_R);
          }
        }
      }
      this.navGrid = { CELL, minX, minZ, w, h, grids };
      this.navSegCache = new Map();
    }

    gridBlocked(fl, x, z) {
      const G = this.navGrid;
      const i = Math.round((x - G.minX) / G.CELL);
      const j = Math.round((z - G.minZ) / G.CELL);
      if (i < 0 || j < 0 || i >= G.w || j >= G.h) return true;
      return G.grids[fl][j * G.w + i] === 1;
    }

    gridLOS(fl, a, b) {
      const dx = b.x - a.x, dz = b.z - a.z;
      const len = Math.hypot(dx, dz);
      const steps = Math.max(1, Math.ceil(len / (this.navGrid.CELL * 0.5)));
      for (let k = 1; k < steps; k++) {
        const t = k / steps;
        if (this.gridBlocked(fl, a.x + dx * t, a.z + dz * t)) return false;
      }
      return true;
    }

    gridNearestFree(fl, x, z, maxRing = 8) {
      const G = this.navGrid;
      const ci = Math.round((x - G.minX) / G.CELL);
      const cj = Math.round((z - G.minZ) / G.CELL);
      const g = G.grids[fl];
      const ok = (i, j) => i >= 0 && j >= 0 && i < G.w && j < G.h && g[j * G.w + i] === 0;
      if (ok(ci, cj)) return { i: ci, j: cj };
      for (let r = 1; r <= maxRing; r++) {
        let best = null, bestD = Infinity;
        for (let dj = -r; dj <= r; dj++) {
          for (let di = -r; di <= r; di++) {
            if (Math.abs(di) !== r && Math.abs(dj) !== r) continue;
            if (!ok(ci + di, cj + dj)) continue;
            const d = di * di + dj * dj;
            if (d < bestD) { bestD = d; best = { i: ci + di, j: cj + dj }; }
          }
        }
        if (best) return best;
      }
      return null;
    }

    gridAStar(fl, from, to) {
      const G = this.navGrid;
      const s = this.gridNearestFree(fl, from.x, from.z);
      const e = this.gridNearestFree(fl, to.x, to.z);
      if (!s || !e) return null;
      const w = G.w, g = G.grids[fl];
      const N = w * G.h;
      const startIdx = s.j * w + s.i, goalIdx = e.j * w + e.i;
      if (!this._astarBufs || this._astarBufs.N !== N) {
        this._astarBufs = {
          N,
          gScore: new Float32Array(N),
          came: new Int32Array(N),
          stamp: new Uint32Array(N),
          closed: new Uint32Array(N),
          gen: 0
        };
      }
      const B = this._astarBufs;
      B.gen++;
      const gen = B.gen;
      const heapIdx = [], heapF = [];
      const push = (idx, f) => {
        heapIdx.push(idx); heapF.push(f);
        let c = heapIdx.length - 1;
        while (c > 0) {
          const p = (c - 1) >> 1;
          if (heapF[p] <= heapF[c]) break;
          [heapF[p], heapF[c]] = [heapF[c], heapF[p]];
          [heapIdx[p], heapIdx[c]] = [heapIdx[c], heapIdx[p]];
          c = p;
        }
      };
      const pop = () => {
        const top = heapIdx[0];
        const li = heapIdx.pop(), lf = heapF.pop();
        if (heapIdx.length > 0) {
          heapIdx[0] = li; heapF[0] = lf;
          let c = 0;
          for (;;) {
            const l = c * 2 + 1, r = l + 1;
            let m = c;
            if (l < heapF.length && heapF[l] < heapF[m]) m = l;
            if (r < heapF.length && heapF[r] < heapF[m]) m = r;
            if (m === c) break;
            [heapF[m], heapF[c]] = [heapF[c], heapF[m]];
            [heapIdx[m], heapIdx[c]] = [heapIdx[c], heapIdx[m]];
            c = m;
          }
        }
        return top;
      };
      const hfn = (i, j) => {
        const dx = Math.abs(i - e.i), dz = Math.abs(j - e.j);
        return (dx + dz) + (Math.SQRT2 - 2) * Math.min(dx, dz);
      };
      B.gScore[startIdx] = 0; B.stamp[startIdx] = gen; B.came[startIdx] = -1;
      push(startIdx, hfn(s.i, s.j));
      const DIRS = [[1,0,1],[-1,0,1],[0,1,1],[0,-1,1],[1,1,Math.SQRT2],[1,-1,Math.SQRT2],[-1,1,Math.SQRT2],[-1,-1,Math.SQRT2]];
      let found = false, expansions = 0;
      const maxExpansions = Math.min(N, 1800); // Prevent catastrophic main thread freeze on unreachable goals
      while (heapIdx.length > 0 && expansions < maxExpansions) {
        const cur = pop();
        if (B.closed[cur] === gen) continue;
        B.closed[cur] = gen;
        expansions++;
        if (cur === goalIdx) { found = true; break; }
        const ci = cur % w, cj = (cur - ci) / w;
        for (const [di, dj, cost] of DIRS) {
          const ni = ci + di, nj = cj + dj;
          if (ni < 0 || nj < 0 || ni >= w || nj >= G.h) continue;
          const nIdx = nj * w + ni;
          if (g[nIdx] === 1 || B.closed[nIdx] === gen) continue;
          if (di !== 0 && dj !== 0 && (g[cj * w + ni] === 1 || g[nj * w + ci] === 1)) continue; // no corner cutting
          const ng = B.gScore[cur] + cost;
          if (B.stamp[nIdx] !== gen || ng < B.gScore[nIdx]) {
            B.stamp[nIdx] = gen;
            B.gScore[nIdx] = ng;
            B.came[nIdx] = cur;
            push(nIdx, ng + hfn(ni, nj));
          }
        }
      }
      if (!found) return null;
      const cells = [];
      let backtrackSteps = 0;
      for (let c = goalIdx; c !== -1 && backtrackSteps < N; c = B.came[c]) {
        backtrackSteps++;
        const ci = c % w, cj = (c - ci) / w;
        cells.push({ x: G.minX + ci * G.CELL, z: G.minZ + cj * G.CELL });
        if (c === startIdx) break;
      }
      cells.reverse();
      // String-pull smoothing so NPCs walk natural straight lines around furniture
      const out = [];
      let anchor = { x: from.x, z: from.z };
      let k = 0;
      while (k < cells.length) {
        let far = k;
        for (let m = cells.length - 1; m > k; m--) {
          if (this.gridLOS(fl, anchor, cells[m])) { far = m; break; }
        }
        out.push(cells[far]);
        anchor = cells[far];
        k = Math.max(k + 1, far + 1);
      }
      return out;
    }

    // Returns intermediate obstacle-free waypoints from `from` to `to` on floor `fl` (ending at `to`)
    gridSegment(fl, from, to) {
      if (!this.navGrid) this.buildObstacleGrid();
      const endBlocked = this.gridBlocked(fl, to.x, to.z);
      let endPt = to;
      if (endBlocked && !to.isStairNode) {
        const ef = this.gridNearestFree(fl, to.x, to.z);
        if (ef) {
          endPt = Object.assign({}, to, {
            x: this.navGrid.minX + ef.i * this.navGrid.CELL,
            z: this.navGrid.minZ + ef.j * this.navGrid.CELL
          });
        }
      }
      if (this.gridLOS(fl, from, endPt)) return [endPt];
      const pts = this.gridAStar(fl, from, endPt);
      if (!pts || pts.length === 0) return [endPt];
      const out = [];
      for (let p = 0; p < pts.length - 1; p++) {
        out.push({ x: pts[p].x, y: endPt.y, z: pts[p].z, floor: fl, refined: true });
      }
      out.push(endPt);
      return out;
    }

    // Expands a nav-node path into an obstacle-aware waypoint list
    refineNavPath(nodes, startPos, startFloor) {
      if (!nodes || nodes.length === 0) return nodes;
      if (!this.navGrid) this.buildObstacleGrid();
      const out = [];
      let prev = { x: startPos.x, z: startPos.z, floor: startFloor };
      for (let k = 0; k < nodes.length; k++) {
        const n = nodes[k];
        if (n.floor === prev.floor && !this.isInStairwell(prev) && !this.isInStairwell(n)) {
          let seg;
          const key = (prev.id !== undefined) ? (prev.id + '_' + n.id) : null;
          if (key && this.navSegCache.has(key)) {
            seg = this.navSegCache.get(key);
          } else {
            seg = this.gridSegment(n.floor, prev, n);
            if (key) this.navSegCache.set(key, seg);
          }
          for (const p of seg) out.push(p);
        } else {
          out.push(n);
        }
        prev = n;
      }
      return out;
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

    createPlayerModelRig() {
      this.playerModelRoot = new THREE.Group();
      this.playerModelRoot.name = 'player-character';
      this.playerModelRoot.visible = false;
      this.scene.add(this.playerModelRoot);
      if (this.viewMode === 'third-person') this.loadPlayerCharacter();
      this.updatePlayerViewVisibility();
    }

    isThirdPersonView() {
      return this.viewMode === 'third-person';
    }

    updatePlayerViewUI() {
      const firstPerson = this.viewMode === 'first-person';
      [[this.dom.firstPersonViewBtn, firstPerson], [this.dom.thirdPersonViewBtn, !firstPerson]].forEach(([button, active]) => {
        if (!button) return;
        button.classList.toggle('active', active);
        button.classList.toggle('mode-on', active);
        button.classList.toggle('mode-off', !active);
        button.setAttribute('aria-pressed', String(active));
      });
      if (this.dom.playerCharacterSelect) {
        this.dom.playerCharacterSelect.value = String(this.selectedPlayerCharacter);
      }
      if (this.dom.optionsCharCurrentName) {
        const charNames = ['The Animal', 'The Earth', 'Sand', 'The Cook', 'The Arse', 'The Clown', 'The Student'];
        this.dom.optionsCharCurrentName.textContent = charNames[this.selectedPlayerCharacter] || 'The Animal';
      }
      this.updatePlayerViewVisibility();
    }

    updatePlayerViewVisibility() {
      const thirdPerson = this.isThirdPersonView();
      const showHands = !thirdPerson && !this.isSpectatorHudHidden;
      if (this.weaponRig) this.weaponRig.visible = showHands;
      if (this.leftArmRig) this.leftArmRig.visible = showHands;
      if (this.playerModelRoot) this.playerModelRoot.visible = thirdPerson && !!this.playerModel;
    }

    setPlayerViewMode(mode) {
      if (mode !== 'first-person' && mode !== 'third-person') return;
      this.viewMode = mode;
      this.thirdPersonCameraReady = false;
      this.updatePlayerViewUI();
      if (mode === 'third-person' && !this.playerModel) this.loadPlayerCharacter();
      if (this.dom.playerCharacterStatus) {
        this.dom.playerCharacterStatus.textContent = mode === 'third-person'
          ? 'Third-person camera and character enabled.'
          : 'First-person view restored.';
      }
    }

    setPlayerCharacter(index) {
      const next = Number(index);
      if (!Number.isInteger(next) || next < 0 || next > 6) return;
      this.selectedPlayerCharacter = next;
      localStorage.setItem('the_museum_player_character', String(next));
      this.updatePlayerViewUI();
      if (this.viewMode === 'third-person') this.loadPlayerCharacter();
    }

    disposePlayerModel(model) {
      if (!model) return;
      model.traverse((child) => {
        if (!child.isMesh) return;
        if (child.geometry) child.geometry.dispose();
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((material) => {
          if (!material) return;
          Object.keys(material).forEach((key) => {
            const value = material[key];
            if (value && value.isTexture) value.dispose();
          });
          material.dispose();
        });
      });
    }

    loadPlayerCharacter() {
      const characters = [
        { name: 'The Animal', file: 'the-animal.glb' },
        { name: 'The Earth', file: 'the-man.glb' },
        { name: 'Sand', file: 'sand.glb' },
        { name: 'The Cook', file: 'cook.glb' },
        { name: 'The Arse', file: 'the-tundra.glb' },
        { name: 'The Clown', file: 'the-clown.glb' },
        { name: 'The Student', file: 'the-student.glb' }
      ];
      const character = characters[this.selectedPlayerCharacter];
      if (!character || !this.playerModelRoot) return;
      const loadId = ++this.playerModelLoadId;
      if (this.dom.playerCharacterStatus) this.dom.playerCharacterStatus.textContent = `Loading ${character.name}…`;
      const loader = new THREE.GLTFLoader();
      const cacheKey = window._ASSET_VERSION || APP_VERSION;
      loader.load(`assets/playermodels/${character.file}?v=${cacheKey}`, (gltf) => {
        if (loadId !== this.playerModelLoadId) {
          this.disposePlayerModel(gltf.scene);
          return;
        }

        try {
          const box = new THREE.Box3().setFromObject(gltf.scene);
          const size = box.getSize(new THREE.Vector3());
          if (!Number.isFinite(size.y) || size.y <= 0) {
            throw new Error(`Player model "${character.name}" has invalid bounds.`);
          }

          this.disposePlayerModel(this.playerModel);
          this.playerModelRoot.clear();
          this.playerModel = gltf.scene;
          this.playerModel.scale.setScalar(1.75 / size.y);
          this.playerModel.position.y = -box.min.y * this.playerModel.scale.y;
          this.playerModel.traverse((child) => {
            if (!child.isMesh) return;
            child.castShadow = false;
            child.receiveShadow = false;
            child.frustumCulled = false;
            if (child.isSkinnedMesh) this.validatePlayerSkin(child, character.name);
          });
          this.playerModelRoot.add(this.playerModel);
          this.playerBones = {};
          this.playerModel.traverse((child) => {
            if (child.isBone && child.name) {
              this.playerBones[child.name] = child;
            }
          });
          this.playerMixer = new THREE.AnimationMixer(this.playerModel);
          this.playerActions = {};
          gltf.animations.forEach((clip) => {
            const action = this.playerMixer.clipAction(clip);
            action.setEffectiveTimeScale(1);
            action.setEffectiveWeight(1);
            const name = clip.name.toLowerCase();
            if (name.includes('jump')) this.playerActions.Jump = action;
            else if (name.includes('run')) this.playerActions.Run = action;
            else if (name.includes('walk')) this.playerActions.Walk = action;
            else if (name.includes('idle')) this.playerActions.Idle = action;
          });
          this.playerCurrentAction = null;
          this.playPlayerAnimation('Idle');
          this.playerModelRoot.visible = this.isThirdPersonView();
          if (this.dom.playerCharacterStatus) this.dom.playerCharacterStatus.textContent = `${character.name} loaded.`;
        } catch (error) {
          this.disposePlayerModel(gltf.scene);
          this.playerModel = null;
          this.playerMixer = null;
          this.playerBones = {};
          this.playerModelRoot.clear();
          this.playerModelRoot.visible = false;
          console.error(`Could not prepare player model "${character.name}".`, error);
          if (this.dom.playerCharacterStatus) this.dom.playerCharacterStatus.textContent = `Could not prepare ${character.name}. See console for details.`;
        }
      }, undefined, (error) => {
        if (loadId !== this.playerModelLoadId) return;
        console.error(`Could not load player model "${character.name}".`, error);
        if (this.dom.playerCharacterStatus) this.dom.playerCharacterStatus.textContent = `Could not load ${character.name}. Check the model asset.`;
      });
    }

    validatePlayerSkin(mesh, characterName) {
      const geometry = mesh.geometry;
      const joints = geometry && geometry.attributes && geometry.attributes.skinIndex;
      const weights = geometry && geometry.attributes && geometry.attributes.skinWeight;
      const positions = geometry && geometry.attributes && geometry.attributes.position;
      if (!positions || !joints || !weights || joints.count !== weights.count || positions.count !== joints.count ||
          joints.itemSize !== 4 || weights.itemSize !== 4) {
        throw new Error(`Player model "${characterName}" has incomplete skin attributes.`);
      }

      const jointCount = mesh.skeleton ? mesh.skeleton.bones.length : 0;
      const jointData = joints.array;
      const weightData = weights.array;
      const normalizedWeightScale = weights.normalized && weightData instanceof Uint16Array ? 65535
        : (weights.normalized && weightData instanceof Uint8Array ? 255 : 1);
      let weightsChanged = false;
      for (let i = 0; i < joints.count; i++) {
        let totalWeight = 0;
        for (let c = 0; c < 4; c++) {
          const attributeIndex = i * 4 + c;
          const weight = weightData[attributeIndex] / normalizedWeightScale;
          const joint = jointData[attributeIndex];
          if (!Number.isFinite(weight) || weight < 0 || !Number.isInteger(joint) || joint < 0 || joint >= jointCount) {
            throw new Error(`Player model "${characterName}" has invalid skin data at vertex ${i}.`);
          }
          totalWeight += weight;
        }
        if (totalWeight <= 0) {
          throw new Error(`Player model "${characterName}" has an unweighted vertex at ${i}.`);
        }
        if (Math.abs(totalWeight - 1) > 0.001) {
          for (let c = 0; c < 4; c++) {
            const attributeIndex = i * 4 + c;
            weightData[attributeIndex] = Math.round(weightData[attributeIndex] / totalWeight);
          }
          weightsChanged = true;
        }
      }
      if (weightsChanged) weights.needsUpdate = true;
    }

    playPlayerAnimation(name) {
      const next = this.playerActions[name] || this.playerActions.Idle;
      if (!next || next === this.playerCurrentAction) return;
      const previous = this.playerCurrentAction;
      next.reset();
      next.setEffectiveTimeScale(1);
      next.setEffectiveWeight(1);
      next.play();
      if (previous) previous.crossFadeTo(next, 0.18, false);
      this.playerCurrentAction = next;
    }

    updatePlayerCharacter(delta, isMoving) {
      if (this.isPlayerDancing) {
        this.playerDanceTimer += delta;
      }
      if (!this.playerModelRoot) return;
      const footY = this.playerPos.y - this.currentCamHeight + this.jumpOffset;
      this.playerModelRoot.position.set(this.playerPos.x, footY, this.playerPos.z);
      this.playerModelRoot.rotation.y = this.playerYaw + Math.PI;
      this.updatePlayerViewVisibility();
      if (!this.playerModel || !this.isThirdPersonView()) return;

      const animation = !this.isGrounded
        ? 'Jump'
        : (isMoving ? (this.isSprinting ? 'Run' : 'Walk') : 'Idle');
      this.playPlayerAnimation(animation);
      if (this.playerMixer) this.playerMixer.update(delta);

      // Procedural dance overlay on player humanoid skeleton
      if (this.isPlayerDancing && this.playerBones) {
        const t = this.playerDanceTimer;
        const b = this.playerBones;

        // Rhythmic hip sway & groove
        if (b.hips) {
          b.hips.position.y += Math.sin(t * 9.5) * 0.055;
          b.hips.position.x += Math.cos(t * 4.75) * 0.045;
          b.hips.rotation.z += Math.sin(t * 4.75) * 0.14;
        }

        // Torso & spine counter-sway
        if (b.spine) {
          b.spine.rotation.z += Math.sin(t * 4.75 + Math.PI) * 0.12;
          b.spine.rotation.y += Math.sin(t * 4.75) * 0.10;
        }
        if (b.chest) {
          b.chest.rotation.x += Math.sin(t * 9.5) * 0.08;
          b.chest.rotation.z += Math.cos(t * 4.75) * 0.10;
        }

        // Head bob & nodding to the beat
        if (b.neck) {
          b.neck.rotation.x += Math.sin(t * 9.5) * 0.10;
        }
        if (b.head) {
          b.head.rotation.x += Math.sin(t * 9.5) * 0.14;
          b.head.rotation.y += Math.sin(t * 4.75) * 0.16;
        }

        // Left arm groove & wave
        if (b['shoulder.L']) {
          b['shoulder.L'].rotation.z += Math.sin(t * 4.75) * 0.12;
        }
        if (b['upperArm.L']) {
          b['upperArm.L'].rotation.z += -0.55 + Math.sin(t * 4.75) * 0.28;
          b['upperArm.L'].rotation.x += Math.cos(t * 4.75) * 0.35;
        }
        if (b['lowerArm.L']) {
          b['lowerArm.L'].rotation.y += 0.45 + Math.sin(t * 9.5) * 0.32;
        }

        // Right arm raised celebratory disco wave / pump
        if (b['shoulder.R']) {
          b['shoulder.R'].rotation.z -= Math.sin(t * 4.75) * 0.12;
        }
        if (b['upperArm.R']) {
          b['upperArm.R'].rotation.z += 0.85 + Math.sin(t * 4.75) * 0.24;
          b['upperArm.R'].rotation.x += Math.sin(t * 9.5) * 0.35;
        }
        if (b['lowerArm.R']) {
          b['lowerArm.R'].rotation.z += 0.70 + Math.sin(t * 9.5) * 0.45;
          b['lowerArm.R'].rotation.x += Math.cos(t * 9.5) * 0.30;
        }
      }
    }

    updateThirdPersonCamera(delta) {
      const footY = this.playerPos.y - this.currentCamHeight + this.jumpOffset;
      const target = new THREE.Vector3(
        this.playerPos.x,
        footY + 1.3,
        this.playerPos.z
      );
      const distance = this.thirdPersonCameraDistance;
      const cosPitch = Math.cos(this.playerPitch);
      const sinPitch = Math.sin(this.playerPitch);
      const sinYaw = Math.sin(this.playerYaw);
      const cosYaw = Math.cos(this.playerYaw);
      const desired = new THREE.Vector3(
        target.x + sinYaw * cosPitch * distance,
        Math.max(footY + 0.35, target.y - sinPitch * distance),
        target.z + cosYaw * cosPitch * distance
      );
      if (!this.thirdPersonCameraReady) {
        this.camera.position.copy(desired);
        this.thirdPersonCameraReady = true;
      } else {
        this.camera.position.lerp(desired, Math.min(1, delta * 8));
      }
      const lookAhead = new THREE.Vector3(
        target.x - sinYaw * cosPitch * 5,
        target.y + sinPitch * 5,
        target.z - cosYaw * cosPitch * 5
      );
      if (this.camera.position.y < footY + 0.35) this.camera.position.y = footY + 0.35;
      this.camera.lookAt(lookAhead);
      const fade = THREE.MathUtils.clamp((this.thirdPersonCameraDistance - 0.4) / 0.2, 0, 1);
      if (this.playerModel) this.playerModel.traverse((c) => { if (c.isMesh && c.material) { c.material.transparent = true; c.material.opacity = fade; } });
    }

    zoomThirdPersonCamera(deltaY) {
      if (!Number.isFinite(deltaY) || deltaY === 0) return;
      const zoomStep = Math.sign(deltaY) * Math.min(0.65, Math.max(0.025, Math.abs(deltaY) * 0.012));
      this.thirdPersonCameraDistance = THREE.MathUtils.clamp(this.thirdPersonCameraDistance + zoomStep, 0.4, 2.6);
      localStorage.setItem('the_museum_camera_distance', String(this.thirdPersonCameraDistance));
    }

    triggerLeftHandGrab() {
      this.leftHandGrabTimer = 0.55;
      this.leftHandGrabDuration = 0.55;
    }

    togglePlayerDance() {
      this.isPlayerDancing = !this.isPlayerDancing;
      if (this.isPlayerDancing) {
        this.playerDanceTimer = 0;
      }
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
        { floor: 0, x: 19, z: 30.5, baseY: 0 * H + 1.38 },
        { floor: 0, x: 12, z: -39, baseY: 0 * H + 1.38 },
        { floor: 0, x: 26, z: 13, baseY: 0 * H + 1.38 },
        // Floor 1
        { floor: 1, x: -26, z: 0, baseY: 1 * H + 1.38 },
        { floor: 1, x: -26, z: 12, baseY: 1 * H + 1.38 },
        { floor: 1, x: 19, z: 30.5, baseY: 1 * H + 1.38 },
        { floor: 1, x: 12, z: -39, baseY: 1 * H + 1.38 },
        { floor: 1, x: 26, z: 13, baseY: 1 * H + 1.38 },
        // Floor 2
        { floor: 2, x: -26, z: 0, baseY: 2 * H + 1.38 },
        { floor: 2, x: -26, z: 12, baseY: 2 * H + 1.38 },
        { floor: 2, x: 19, z: 30.5, baseY: 2 * H + 1.38 },
        { floor: 2, x: 12, z: -39, baseY: 2 * H + 1.38 },
        { floor: 2, x: 26, z: 13, baseY: 2 * H + 1.38 },
        // Floor 3
        { floor: 3, x: -26, z: 0, baseY: 3 * H + 1.38 },
        { floor: 3, x: -26, z: 12, baseY: 3 * H + 1.38 },
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
      if (this.mp) {
        const pIndex = this.ammoPickups.indexOf(pickup);
        if (pIndex !== -1) {
          this.mp.notifyAmmoPickup(pIndex);
        }
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
      const pitchLimit = this.isThirdPersonView() ? 1.05 : 1.42;
      this.playerPitch = Math.max(-pitchLimit, Math.min(pitchLimit, this.playerPitch));
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
        this.sprintExhausted = false;
        this.stamina = CONFIG.PLAYER.MAX_STAMINA;
        this.audio.init();
        this.audio.startGameplayAudio();
        this.audio.fadeOutMenuMusic(0.45);
        this.setSmittyMode(this.smittyEnabled);
        this.showFloorNotification(this.playerFloor);
        this.updateHud();
        this.requestNativeOrBrowserLock();
      });

      // Multiplayer Host Flow
      if (this.dom.hostGameBtn) {
        this.dom.hostGameBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (!this.mp) return;
          this.dom.startScreen.classList.add('hidden');
          if (this.dom.hostLobbyModal) {
            this.dom.hostLobbyModal.classList.remove('hidden');
            if (this.dom.hostRoomCodeDisplay) this.dom.hostRoomCodeDisplay.textContent = '...';
            if (this.dom.hostPlayersList) this.dom.hostPlayersList.textContent = 'Generating room code...';
          }

          this.mp.initHost((code) => {
            if (this.dom.hostRoomCodeDisplay) this.dom.hostRoomCodeDisplay.textContent = code;
            if (this.dom.hostPlayersList) this.dom.hostPlayersList.textContent = 'Room active! Waiting for players...';
            if (this.mp) {
              this.mp.onPlayerJoined = (peerId) => {
                if (this.dom.hostPlayersList) {
                  this.dom.hostPlayersList.textContent = 'Player connected! Click PROCEED to enter.';
                }
              };
            }
          }, (err) => {
            if (this.dom.hostPlayersList) this.dom.hostPlayersList.textContent = 'Connection error: ' + (err.message || err.type || 'Failed');
          });
        });
      }

      if (this.dom.hostProceedBtn) {
        this.dom.hostProceedBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (this.dom.hostLobbyModal) this.dom.hostLobbyModal.classList.add('hidden');
          // Open FighterZ-style Character Selection
          const roomCode = (this.mp && this.mp.roomCode) ? this.mp.roomCode : null;
          if (this.charSelectUI) {
            this.charSelectUI.show('HOST CO-OP', (selectedIdx) => {
              this.selectedPlayerCharacter = selectedIdx;
              this.loadPlayerCharacter();
              this.startMultiplayerGame();
            }, roomCode);
          } else {
            this.startMultiplayerGame();
          }
        });
      }

      if (this.dom.hostLobbyCloseBtn) {
        this.dom.hostLobbyCloseBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (this.dom.hostLobbyModal) this.dom.hostLobbyModal.classList.add('hidden');
          if (this.dom.startScreen) this.dom.startScreen.classList.remove('hidden');
        });
      }

      // Multiplayer Join Flow
      if (this.dom.joinGameBtn) {
        this.dom.joinGameBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.dom.startScreen.classList.add('hidden');
          if (this.dom.joinCodeModal) {
            this.dom.joinCodeModal.classList.remove('hidden');
            if (this.dom.joinRoomInput) {
              this.dom.joinRoomInput.value = '';
              this.dom.joinRoomInput.focus();
            }
            if (this.dom.joinErrorMsg) this.dom.joinErrorMsg.classList.add('hidden');
          }
        });
      }

      if (this.dom.joinCodeCloseBtn) {
        this.dom.joinCodeCloseBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (this.dom.joinCodeModal) this.dom.joinCodeModal.classList.add('hidden');
          if (this.dom.startScreen) this.dom.startScreen.classList.remove('hidden');
        });
      }

      if (this.dom.joinSubmitBtn) {
        this.dom.joinSubmitBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const code = this.dom.joinRoomInput ? this.dom.joinRoomInput.value.trim().toUpperCase() : '';
          if (!code || code.length < 3) {
            if (this.dom.joinErrorMsg) {
              this.dom.joinErrorMsg.textContent = 'Please enter a valid room code.';
              this.dom.joinErrorMsg.classList.remove('hidden');
            }
            return;
          }

          if (this.dom.joinErrorMsg) {
            this.dom.joinErrorMsg.textContent = 'Connecting to host...';
            this.dom.joinErrorMsg.classList.remove('hidden');
          }

          this.mp.initClient(code, (connectedCode) => {
            if (this.dom.joinCodeModal) this.dom.joinCodeModal.classList.add('hidden');
            // Open Character Selection
            const roomCode = (this.mp && this.mp.roomCode) ? this.mp.roomCode : connectedCode;
            if (this.charSelectUI) {
              this.charSelectUI.show('JOIN CO-OP', (selectedIdx) => {
                this.selectedPlayerCharacter = selectedIdx;
                this.loadPlayerCharacter();
                this.startMultiplayerGame();
              }, roomCode);
            } else {
              this.startMultiplayerGame();
            }
          }, (err) => {
            if (this.dom.joinErrorMsg) {
              this.dom.joinErrorMsg.textContent = 'Could not connect. Check the code.';
              this.dom.joinErrorMsg.classList.remove('hidden');
            }
          });
        });
      }

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
      if (this.dom.firstPersonViewBtn) {
        this.dom.firstPersonViewBtn.addEventListener('click', () => this.setPlayerViewMode('first-person'));
      }
      if (this.dom.thirdPersonViewBtn) {
        this.dom.thirdPersonViewBtn.addEventListener('click', () => this.setPlayerViewMode('third-person'));
      }
      if (this.dom.playerCharacterSelectBtn) {
        this.dom.playerCharacterSelectBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          // Hide Options Modal temporarily and open the Character Select showcase screen
          if (this.dom.optionsModal) this.dom.optionsModal.classList.add('hidden');
          if (this.charSelectUI) {
            this.charSelectUI.show('PLAYER VIEW', (chosenIndex) => {
              this.setPlayerCharacter(chosenIndex);
              if (this.dom.optionsModal) this.dom.optionsModal.classList.remove('hidden');
            });
          }
        });
      }
      if (this.dom.playerCharacterSelect) {
        this.dom.playerCharacterSelect.addEventListener('change', (e) => this.setPlayerCharacter(e.target.value));
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

      window.addEventListener('wheel', (e) => {
        if (!this.gameStarted || !this.isThirdPersonView() || this.isPaused || this.isGameOver || this.isVictory ||
            this.isExaminingArt || this.isObjectiveModalOpen || this.isOptionsModalOpen || this.isSettingsModalOpen || this.isAboutModalOpen) return;
        e.preventDefault();
        this.zoomThirdPersonCamera(e.deltaY);
      }, { passive: false });

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
        // If user is focused inside an input element (such as the Join Room Code box), do not capture or preventDefault
        if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
          if (e.code === 'Enter' && e.target === this.dom.joinRoomInput) {
            e.preventDefault();
            if (this.dom.joinSubmitBtn) this.dom.joinSubmitBtn.click();
          } else if (e.code === 'Escape' && this.dom.joinCodeCloseBtn) {
            e.preventDefault();
            this.dom.joinCodeCloseBtn.click();
          }
          return;
        }

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

        if (e.code === 'KeyX') {
          if (this.gameStarted && !this.isPaused && !this.isGameOver && !this.isVictory && !this.isExaminingArt) {
            this.togglePlayerDance();
          }
        } else if (e.code === 'KeyP') {
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
        if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
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
      
      // Show Co-Op Join Code in yellow if active
      if (this.dom.pauseCoopCodeBar && this.dom.pauseCoopCodeVal) {
        if (this.mp && this.mp.roomCode) {
          this.dom.pauseCoopCodeVal.textContent = this.mp.roomCode;
          this.dom.pauseCoopCodeBar.classList.remove('hidden');
        } else {
          this.dom.pauseCoopCodeBar.classList.add('hidden');
        }
      }

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
      // 0. Check Interactive Statues
      if (this.statues && this.statues.length > 0) {
        const nearS = this.getNearestStatue(3.8);
        if (nearS) {
          this.interactStatue(nearS);
          return;
        }
      }
      // Check Video Installation Console
      if (this.focusedVideoControl) {
        this.triggerVideoControl(this.focusedVideoControl.id);
        return;
      }

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
          if (this.mp) {
            this.mp.notifyRelicCollected(relic.id);
          }
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

        // Keep no-clip movement within the full museum height, including the fourth floor.
        const maxMuseumY = CONFIG.NUM_FLOORS * CONFIG.FLOOR_HEIGHT;
        this.playerPos.y = Math.max(-1.0, Math.min(maxMuseumY, this.playerPos.y));

        const approxFloor = Math.max(0, Math.min(CONFIG.NUM_FLOORS - 1, Math.floor(this.playerPos.y / CONFIG.FLOOR_HEIGHT)));
        if (approxFloor !== this.playerFloor) {
          this.playerFloor = approxFloor;
          this.showFloorNotification(this.playerFloor);
        }

        const thirdPerson = this.isThirdPersonView();
        if (!thirdPerson) {
          this.camera.position.set(this.playerPos.x, this.playerPos.y, this.playerPos.z);
          this.camera.rotation.set(this.playerPitch, this.playerYaw, 0, 'YXZ');
        }
        this.updatePlayerCharacter(delta, moveLen > 0.001);
        if (thirdPerson) this.updateThirdPersonCamera(delta);

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
      const isCrouching = !!this.keys['KeyC'];
      this.isCrouching = isCrouching;

      if (isMoving || isCrouching || !this.isGrounded) {
        this.isPlayerDancing = false;
      }

      const wantsSprint = isMoving && (this.keys['ShiftLeft'] || this.keys['ShiftRight']) && !isCrouching;
      if (!wantsSprint) this.sprintExhausted = false;
      if (wantsSprint && !this.sprintExhausted && this.stamina > 5) {
        this.isSprinting = true;
        this.stamina = Math.max(0, this.stamina - delta * 11); // halved drain = 2x sprint duration
        if (this.stamina <= 5) this.sprintExhausted = true;
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
          this.resolveCollisions(this.playerPos, CONFIG.PLAYER.RADIUS, this.playerFloor, currentFootElevation, this.currentCamHeight);
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

        const bobRate = isCrouching ? 4.5 : (this.isSprinting ? 9.2 : 5.8);
        this.headBobTimer += delta * bobRate;

        // Only play footstep sounds when feet are touching the ground
        if (this.isGrounded && !this.isFalling) {
          this.footstepTimer += delta * bobRate;
          if (this.footstepTimer > Math.PI) {
            this.footstepTimer = 0;
            this.audio.playMarbleFootstep();

            // Sneaking in crouch produces only 1.1m noise vs 4.4m walk vs 14.6m sprint
            const noiseRange = isCrouching ? 1.1 : (this.isSprinting ? 14.6 : 4.4);
            this.alertSmittySound(this.playerPos, this.playerFloor, noiseRange);
          }
        } else {
          this.footstepTimer = 0;
        }
      } else {
        this.playerVelocity.set(0, 0, 0);
        this.footstepTimer = 0;
      }

      // Jump mechanics (Space)
      const wantsJump = !!this.keys['Space'];
      if (wantsJump && this.isGrounded && !isCrouching) {
        this.jumpVelocity = CONFIG.PLAYER.JUMP_FORCE;
        this.isGrounded = false;
        this.footstepTimer = 0;
      }

      const currentFootElevation = (this.playerPos.y - this.currentCamHeight) + this.jumpOffset;
      const elev = this.updateStairwellElevation(this.playerPos, this.playerStairState, this.playerFloor, currentFootElevation);
      
      // Strict floor transition protection: Player can only change floors if their physical foot elevation
      // is genuinely within 1.4m of the target floor elevation plane
      const targetFloorBaseY = elev.floor * CONFIG.FLOOR_HEIGHT;
      if (elev.floor !== this.playerFloor && Math.abs(currentFootElevation - targetFloorBaseY) < 1.4) {
        this.playerFloor = elev.floor;
        this.showFloorNotification(this.playerFloor);
      } else if (elev.floor === this.playerFloor) {
        this.playerFloor = elev.floor;
      }

      // Check platform standing surface (benches, plinths, desks, crates)
      const platformSurfaceY = this.getPlatformSurfaceY(
        this.playerPos.x,
        this.playerPos.z,
        this.playerFloor,
        currentFootElevation,
        this.isGrounded ? 0.85 : 0.18
      );
      let groundY = Math.max(elev.y, platformSurfaceY);

      // Antigravity Step Protection (outside stairwells): Prevent sudden vertical launch > 0.85m above current feet
      if (this.isGrounded && !this.playerStairState.active && groundY > (currentFootElevation + 0.85)) {
        groundY = currentFootElevation;
      }

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
          // Smoothly and tightly adapt to stairs, slopes, or platform surface (zero stair clipping)
          this.jumpOffset = 0;
          const verticalFollowRate = this.playerStairState.active ? 42 : 18;
          this.playerPos.y = THREE.MathUtils.lerp(this.playerPos.y, targetCamY, Math.min(1, delta * verticalFollowRate));
        }
      }

      this.trackCurrentRoom();
      this.updateInteractionPrompt();

      if (this.exitUnlocked && this.playerFloor === 0 && this.playerPos.z > 27.8 && Math.abs(this.playerPos.x + 10.0) < 1.6) {
        this.triggerVictory();
      }

      const bobAmp = isCrouching ? 0.010 : (this.isSprinting ? 0.035 : 0.018);
      const bobY = isMoving ? Math.sin(this.headBobTimer) * bobAmp : 0;
      const thirdPerson = this.isThirdPersonView();
      if (!thirdPerson) {
        this.camera.position.set(this.playerPos.x, this.playerPos.y + bobY + this.jumpOffset, this.playerPos.z);
        this.camera.rotation.set(this.playerPitch, this.playerYaw, 0, 'YXZ');
      }
      this.updatePlayerCharacter(delta, isMoving);
      if (thirdPerson) this.updateThirdPersonCamera(delta);

      this.flashlightTarget.position.set(
        this.camera.position.x - Math.sin(this.playerYaw) * 10,
        this.camera.position.y + Math.tan(this.playerPitch) * 10,
        this.camera.position.z - Math.cos(this.playerYaw) * 10
      );

      this.updateWeaponViewmodel(delta, isMoving);
      this.updateLeftHandViewmodel(delta, isMoving);
      this.updateHud();
    }

    getPlatformSurfaceY(x, z, floorIdx, footElevation = Infinity, maxStepUp = 0.18) {
      const floorBaseY = floorIdx * CONFIG.FLOOR_HEIGHT;
      // Stacked floors and overhead platforms must not count as jump landing surfaces.
      const floorCeilingY = floorBaseY + CONFIG.FLOOR_HEIGHT - 0.06;

      if (this.physicsCrates && this.physicsCrates.length > 0) {
        let crateSurfaceY = floorBaseY;
        for (let i = 0; i < this.physicsCrates.length; i++) {
          const crate = this.physicsCrates[i];
          if (crate.isHeld) continue;
          const halfW = crate.w / 2 + 0.04;
          const halfD = crate.d / 2 + 0.04;
          if (x >= crate.x - halfW && x <= crate.x + halfW && z >= crate.z - halfD && z <= crate.z + halfD) {
            const topY = crate.isCollapsed ? (crate.y + 0.15) : (crate.y + crate.h);
            if (topY > crateSurfaceY && topY < floorCeilingY && topY <= footElevation + maxStepUp) {
              crateSurfaceY = topY;
            }
          }
        }
        if (crateSurfaceY > floorBaseY) return crateSurfaceY;
      }

      // If player is inside or navigating a stairwell, elevation is governed exclusively by the stairwell solver
      if (this.playerStairState && this.playerStairState.active) {
        return 0;
      }
      if ((x >= -4.2 && x <= 4.2 && z >= -26.2 && z <= -13.8) ||
          (x >= -24.2 && x <= -15.8 && z >= 17.8 && z <= 28.2)) {
        return 0;
      }

      let maxSurfaceY = floorBaseY;
      for (let i = 0; i < this.colliders.length; i++) {
        const c = this.colliders[i];
        if (c.isWall || (c.floor !== 'all' && c.floor !== floorIdx)) continue;
        if (c.maxY === undefined || c.maxY < floorBaseY || c.maxY >= floorCeilingY ||
            c.maxY > footElevation + maxStepUp) continue;
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

    resolveCollisions(pos, radius, floorIdx, footElevation = -999, bodyHeight = 2.4) {
      for (let iter = 0; iter < 3; iter++) {
        for (let i = 0; i < this.colliders.length; i++) {
          const c = this.colliders[i];
          if (c.disabled || (pos._ignoreCollider && c === pos._ignoreCollider)) continue;
          if (c.floor !== 'all' && c.floor !== floorIdx) continue;

          if (footElevation !== -999 && c.minY !== undefined && c.maxY !== undefined &&
              (footElevation >= c.maxY || footElevation + bodyHeight <= c.minY)) continue;

          // If this collider is a low obstacle/platform (bench, plinth, crate, desk) and feet are high enough to stand on top, allow passing over top
          if (!c.isWall && c.maxY !== undefined && footElevation >= (c.maxY - 0.12)) continue;

          // Dynamic physics crates are pushed realistically by player contact in updatePhysicsCrates
          if (c.isCrate && c.crate) continue;

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

      // Crate pickup prompt across any floor
      if (this.physicsCrates && this.physicsCrates.length > 0) {
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

      // Check Video Installation Control Console Deck
      if (this.videoInstallationRooms && this.videoInstallationRooms.length > 0) {
        const room = this.videoInstallationRooms.find(r => r.floor === this.playerFloor);
        if (room && room.buttons) {
          const cosPitch = Math.cos(this.playerPitch);
          const sinPitch = Math.sin(this.playerPitch);
          const cosYaw = Math.cos(this.playerYaw);
          const sinYaw = Math.sin(this.playerYaw);
          const camFwd = new THREE.Vector3(-sinYaw * cosPitch, sinPitch, -cosYaw * cosPitch);
          const camPos = this.camera ? this.camera.position : this.playerPos;

          let bestBtn = null;
          let bestDot = 0.88;

          for (let b of room.buttons) {
            const toB = new THREE.Vector3().subVectors(b.worldPos, camPos);
            const dist = toB.length();
            if (dist < 2.6) {
              const dot = toB.normalize().dot(camFwd);
              if (dot > bestDot) {
                bestDot = dot;
                bestBtn = b;
              }
            }
          }

          if (bestBtn) {
            this.focusedVideoControl = bestBtn;
            this.setInteractPrompt(bestBtn.prompt);
            this.focusedPainting = null;
            return;
          }
        }
      }
      this.focusedVideoControl = null;

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

      // Check near interactive statues
      if (this.statues && this.statues.length > 0) {
        const nearS = this.getNearestStatue ? this.getNearestStatue(3.8) : null;
        if (nearS) {
          this.setInteractPrompt(nearS.isPlayingAudio
            ? `[E] STOP: ${nearS.cfg.name.toUpperCase()}`
            : `[E] COMMUNE: ${nearS.cfg.name.toUpperCase()}`);
          return;
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
      this.updatePlayerViewVisibility();

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
      } else if (this.isPlayerDancing) {
        const danceT = this.playerDanceTimer;
        targetX += Math.cos(danceT * 8.0) * 0.025;
        targetY += Math.abs(Math.sin(danceT * 9.5)) * 0.035;
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

      // First-person rhythmic arm groove when dancing
      if (this.isPlayerDancing) {
        const danceT = this.playerDanceTimer;
        targetX += Math.sin(danceT * 8.0) * 0.05;
        targetY += Math.abs(Math.sin(danceT * 9.5)) * 0.045;
        targetRotZ += Math.sin(danceT * 8.0) * 0.22;
        targetRotX += Math.cos(danceT * 8.0) * 0.14;
      }

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
      this.isPlayerDancing = false;

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

      if (this.mp && typeof this.mp.notifyWeaponFired === 'function') {
        const camPos = this.camera ? this.camera.position : this.playerPos;
        const camRot = this.camera ? this.camera.rotation : { y: this.playerYaw, x: this.playerPitch };
        this.mp.notifyWeaponFired(camPos.x, camPos.y, camPos.z, camRot.y, camRot.x);
      }

      this.alertSmittySound(this.playerPos, this.playerFloor, 47.5, true);
      this.raycastBullet();
    }

    raycastBullet() {
      this.camera.updateMatrixWorld(true);
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
      const candidates = [];

      // Fast analytical AABB hitbox test around Smitty (avoids CPU-skinning 275,360 vertices on SkinnedMesh.raycast)
      if (this.smittyMesh && this.smittyState !== 'DEAD') {
        const sx = this.smittyPos.x;
        const sy = this.smittyPos.y;
        const sz = this.smittyPos.z;
        const hitBox = new THREE.Box3(
          new THREE.Vector3(sx - 0.58, sy, sz - 0.58),
          new THREE.Vector3(sx + 0.58, sy + 2.35, sz + 0.58)
        );
        const hitPoint = new THREE.Vector3();
        if (raycaster.ray.intersectBox(hitBox, hitPoint)) {
          candidates.push({
            target: this.smittyPos,
            hitPoint,
            hit: () => this.damageSmitty(CONFIG.WEAPON.DAMAGE, hitPoint, raycaster.ray.direction)
          });
        }
      }

      if (this.statues) {
        this.statues.forEach(statue => {
          if (statue.cfg.isSilverSmitty || !statue.group.visible || statue.floor !== this.playerFloor) return;
          const hitPoint = new THREE.Vector3();
          const hitBox = new THREE.Box3(
            new THREE.Vector3(statue.x - 0.85, statue.y, statue.z - 0.85),
            new THREE.Vector3(statue.x + 0.85, statue.y + (statue.cfg.targetHeight || 2.25), statue.z + 0.85)
          );
          if (raycaster.ray.intersectBox(hitBox, hitPoint)) {
            candidates.push({
              target: statue,
              hitPoint,
              hit: () => this.hitStatue(statue, hitPoint, raycaster.ray.direction)
            });
          }
        });
      }

      const visibleHits = candidates
        .map(candidate => ({
          ...candidate,
          distance: this.camera.position.distanceTo(candidate.hitPoint)
        }))
        .filter(candidate => candidate.distance <= 38)
        .filter(candidate => {
          const blockedByCollider = this.colliders.some(c => {
            if ((c.floor !== 'all' && c.floor !== this.playerFloor) || c.type !== 'box') return false;
            if (c.minY === undefined || c.maxY === undefined) return false;
            const colliderBox = new THREE.Box3(
              new THREE.Vector3(c.minX, c.minY, c.minZ),
              new THREE.Vector3(c.maxX, c.maxY, c.maxZ)
            );
            const obstructionPoint = raycaster.ray.intersectBox(colliderBox, new THREE.Vector3());
            return obstructionPoint &&
              this.camera.position.distanceTo(obstructionPoint) < candidate.distance - 0.05;
          });
          return !blockedByCollider;
        })
        .sort((a, b) => a.distance - b.distance);

      if (visibleHits.length > 0) {
        this.shotsHit++;
        visibleHits[0].hit();
      }
    }

    hitStatue(statue, hitPoint, shotDir) {
      const recoilDistance = 0.42;
      const yaw = statue.group.rotation.y;
      const pushX = shotDir.x * recoilDistance;
      const pushZ = shotDir.z * recoilDistance;
      statue.hitRecoil = {
        x: Math.cos(yaw) * pushX - Math.sin(yaw) * pushZ,
        z: Math.sin(yaw) * pushX + Math.cos(yaw) * pushZ,
        timer: 0.42,
        duration: 0.42
      };
      this.spawnLiquidBlood(hitPoint, shotDir, 24, statue.y);
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
      const puddleMat = this.bloodPuddleMat.clone();
      const mesh = new THREE.Mesh(puddleGeom, puddleMat);
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
        targetRadius,
        age: 0,
        maxLife: 60.0
      });
    }

    spawnLiquidBlood(hitPoint, shotDir, count = 38, floorY = null) {
      if (!this.bloodDropGeom || !this.bloodDropMat) return;

      const bloodFloorY = floorY === null
        ? (this.smittyPos ? this.smittyPos.y : (this.playerFloor * CONFIG.FLOOR_HEIGHT))
        : floorY;
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
          floorY: bloodFloorY,
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

      for (let i = this.bloodPuddles.length - 1; i >= 0; i--) {
        const p = this.bloodPuddles[i];
        p.age = (p.age || 0) + delta;

        if (Math.abs(p.currentRadius - p.targetRadius) > 0.002) {
          p.currentRadius = THREE.MathUtils.lerp(p.currentRadius, p.targetRadius, Math.min(1, delta * 5.5));
          p.mesh.scale.set(p.currentRadius, p.currentRadius * 0.88, 1);
        }

        // Fades away completely after 1 minute (60s total lifespan with smooth 10s fadeout from 50s to 60s)
        const maxLife = p.maxLife || 60.0;
        if (p.age >= maxLife) {
          this.scene.remove(p.mesh);
          if (p.mesh.geometry) p.mesh.geometry.dispose();
          if (p.mesh.material) p.mesh.material.dispose();
          this.bloodPuddles.splice(i, 1);
        } else if (p.age > (maxLife - 10.0)) {
          const fadeProgress = (maxLife - p.age) / 10.0; // 1.0 down to 0.0
          if (p.mesh.material) {
            p.mesh.material.opacity = Math.max(0, fadeProgress);
          }
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

      // Only rush straight at the goal if the obstacle grid confirms no furniture is in the way
      if (directLOS && goalFloor === this.smittyFloor) {
        if (!this.navGrid) this.buildObstacleGrid();
        const closeIn = Math.hypot(this.smittyPos.x - goalPos.x, this.smittyPos.z - goalPos.z) < 1.6;
        if (!closeIn && !this.gridLOS(this.smittyFloor, this.smittyPos, goalPos)) directLOS = false;
      }

      if (!directLOS || goalFloor !== this.smittyFloor) {
        const goalId = this.findNearestNavNode(goalPos, goalFloor);
        if (
          !this.smittyPath ||
          this.smittyPath.length === 0 ||
          this.smittyPathGoalId !== goalId ||
          this.smittyPathIndex >= this.smittyPath.length
        ) {
          const startId = this.findNearestNavNode(this.smittyPos, this.smittyFloor);
          this.smittyPath = this.refineNavPath(this.findShortestPath(startId, goalId), this.smittyPos, this.smittyFloor);
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
        if (distToTarget < (targetNode.refined ? 0.6 : 1.1)) {
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
          this.resolveCollisions(this.smittyPos, 0.40, this.smittyFloor, this.smittyPos.y, 2.35);
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

      const elev = this.updateStairwellElevation(this.smittyPos, this.smittyStairState, this.smittyFloor, this.smittyPos.y);
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

      const floorDiff = Math.abs(this.smittyFloor - this.playerFloor);
      const horizontalDist = Math.hypot(this.smittyPos.x - this.playerPos.x, this.smittyPos.z - this.playerPos.z);
      const dist3D = this.smittyPos.distanceTo(this.playerPos);

      // Heartbeat dynamics: only escalate when player is genuinely in danger on the SAME floor or actively chased
      if (this.isSpectatorMode) {
        this.audio.setHeartbeatBpm(45);
      } else if (this.smittyState === 'CHASE') {
        if (floorDiff === 0) {
          if (horizontalDist < 8) this.audio.setHeartbeatBpm(165);
          else if (horizontalDist < 16) this.audio.setHeartbeatBpm(135);
          else this.audio.setHeartbeatBpm(105);
        } else {
          // In active pursuit across floors (e.g. entering stairwells)
          const inStairs = this.isInStairwell(this.playerPos) || this.isInStairwell(this.smittyPos);
          if (inStairs) this.audio.setHeartbeatBpm(120);
          else this.audio.setHeartbeatBpm(45);
        }
      } else if (this.smittyState === 'STALK') {
        if (floorDiff === 0) {
          if (horizontalDist < 10) this.audio.setHeartbeatBpm(115);
          else if (horizontalDist < 18) this.audio.setHeartbeatBpm(85);
          else this.audio.setHeartbeatBpm(45);
        } else {
          this.audio.setHeartbeatBpm(45);
        }
      } else {
        // Calm patrol/inspect/dance/search:
        if (floorDiff === 0 && horizontalDist < 7.5) {
          // Immediate close proximity on same floor
          this.audio.setHeartbeatBpm(75);
        } else {
          // Peaceful resting rate (completely silent, no thumping!)
          this.audio.setHeartbeatBpm(45);
        }
      }

      if (!this.isSpectatorMode && this.flashlightOn && floorDiff === 0 && horizontalDist < 12 && Math.random() < 0.08) {
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
          if (floorDiff === 0) {
            if (horizontalDist < 34) {
              this.audio.playSmittyFootstep(horizontalDist);
            }
          } else if (floorDiff === 1) {
            // Immediately adjacent floor: muffled reverberation through concrete ceiling
            if (horizontalDist < 14) {
              this.audio.playSmittyFootstep(horizontalDist * 2.2 + 16);
            }
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
        try {
          this.updatePlayer(delta);
        } catch (e) {
          console.error("Player update error:", e);
        }
        try {
          this.updatePhysicsCrates(delta);
          this.updateAquariumFish(delta);
          if (!this.navGrid && this.navNodes && this.navNodes.length > 0) {
            this.buildObstacleGrid();
          }
          this.updateSmitty(delta);
          // In multiplayer, Host simulates wandering statue AI and syncs to clients; in solo, simulate locally
          const isClientInCoop = (this.mp && !this.mp.isHost && this.mp.client && this.mp.client.connected);
          if (!isClientInCoop) {
            if (this.updateStatues) this.updateStatues(delta);
            if (this.updateSilverSmitty) this.updateSilverSmitty(delta);
          }
          this.updateLiquidBlood(delta);
          this.updateAmmoPickups(delta);
          this.updateVideoInstallation(delta);
          if (this.smittyMixer && this.smittyState !== 'DEAD') this.smittyMixer.update(delta);
          this.updateSmittyHeadBone(delta);

          const time = performance.now() * 0.002;

          // Dynamic distance culling for paintings: generous render distance on current floor
          if (this.paintings) {
            const px = this.playerPos.x;
            const pz = this.playerPos.z;
            for (let p of this.paintings) {
              if (p.floor !== this.playerFloor) {
                if (p.mesh.visible) p.mesh.visible = false;
              } else {
                const dSq = (p.x - px) ** 2 + (p.z - pz) ** 2;
                p.mesh.visible = (dSq < 9604); // 98m * 98m (broad museum-wide corridor visibility)
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
        } catch (e) {
          console.error("Game loop non-fatal error:", e);
        }
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
          let statueNear = false;
          if (this.statues) {
            for (let s of this.statues) {
              if (s.floor === d.floor && Math.hypot(s.x - d.x, s.z - d.doorZ) < 3.4) {
                statueNear = true;
                break;
              }
            }
          }
          let remotePlayerNear = false;
          if (this.mp && this.mp.remotePlayers) {
            this.mp.remotePlayers.forEach(rp => {
              if (rp.group && Math.hypot(rp.group.position.x - d.x, rp.group.position.z - d.doorZ) < 3.4) {
                remotePlayerNear = true;
              }
            });
          }
          const shouldOpen = (distPlayer < 3.4 || distSmitty < 3.4 || statueNear || remotePlayerNear);

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

      // Update WebRTC Multiplayer remote players and networking
      if (this.mp) {
        this.mp.update(delta);
      }

      // Hallway mirror renders itself via onBeforeRender (see createHallwayMirror)

      try {
        this.renderer.render(this.scene, this.camera);
      } catch (e) {
        console.error("Renderer error:", e);
      }
    }


    // =========================================================================
    // LIVING INTERACTIVE STATUES & SILVER SMITTY (Minecraft-Pig Wandering + Eye Contact + Audio)
    // =========================================================================
    buildStatues(fl, y0, mats) {
      if (!this.statues) this.statues = [];
      if (typeof STATUES_CONFIG === "undefined") return;

      const gltfLoader = new THREE.GLTFLoader();

      STATUES_CONFIG.filter(cfg => cfg.floor === fl).forEach(cfg => {
        const group = new THREE.Group();
        group.position.set(cfg.x, y0, cfg.z);
        group.rotation.y = cfg.rotY || 0;

        // Statues include their own modeled platforms — rest flush on the floor at y = 0.0!
        const statueRoot = new THREE.Group();
        statueRoot.position.set(0, 0, 0);
        group.add(statueRoot);

        const colliderObj = {
          type: "cylinder",
          floor: fl,
          x: cfg.x,
          z: cfg.z,
          radius: 0.62,
          minY: y0,
          maxY: y0 + 2.35,
          isStatue: true
        };
        if (this.colliders) {
          this.colliders.push(colliderObj);
        }

        const statueObj = {
          cfg: cfg,
          group: group,
          statueRoot: statueRoot,
          collider: colliderObj,
          floor: fl,
          x: cfg.x,
          y: y0,
          z: cfg.z,
          yaw: cfg.rotY || 0,
          baseY: 0,
          isPlayingAudio: false,
          isDancing: false,
          danceStartTime: 0,
          activeDuration: cfg.duration || 10.0,
          activeAudioEl: null,
          audioEl: null,
          audioElAlt: null,
          audioPoolEls: null,
          lastPoolIdx: -1,
          // Minecraft-pig living AI state (completely independent NPC until player interacts)
          aiState: "IDLE",
          aiTimer: 0.4 + Math.random() * 1.2,
          idleLookYaw: cfg.rotY || 0,
          navPath: null,
          navIndex: 0,
          walkPhase: Math.random() * Math.PI * 2,
          stairState: { active: null, baseFloor: fl },
          teleportCooldown: 45.0 + Math.random() * 40.0
        };

        const resetStatuePose = () => {
          statueObj.isPlayingAudio = false;
          statueObj.isDancing = false;
          statueRoot.scale.set(1, 1, 1);
          statueRoot.position.y = 0;
          statueRoot.rotation.set(0, 0, 0);
          statueObj.aiState = "IDLE";
          statueObj.aiTimer = 0.6 + Math.random() * 1.8;
        };

        if (cfg.audioPool && cfg.audioPool.length > 0) {
          statueObj.audioPoolEls = cfg.audioPool.map(item => {
            const a = new Audio(encodeURI(item.src));
            a.preload = "auto";
            a.onended = resetStatuePose;
            return { el: a, duration: item.duration || 2.0 };
          });
        } else if (cfg.audio) {
          const audio = new Audio(encodeURI(cfg.audio));
          audio.preload = "auto";
          audio.onended = resetStatuePose;
          statueObj.audioEl = audio;

          if (cfg.audioAlt) {
            const audioAlt = new Audio(encodeURI(cfg.audioAlt));
            audioAlt.preload = "auto";
            audioAlt.onended = resetStatuePose;
            statueObj.audioElAlt = audioAlt;
          }
        }

        const onModelLoaded = (gltf) => {
          const model = gltf.scene;
          model.traverse(child => {
            if (child.isMesh && child.material) {
              const matsList = Array.isArray(child.material) ? child.material : [child.material];
              matsList.forEach(m => {
                m.side = THREE.DoubleSide;
                if (typeof m.metalness === 'number' && m.metalness > 0.28) m.metalness = 0.22;
                if (typeof m.roughness === 'number' && m.roughness < 0.35) m.roughness = 0.45;
              });
            }
          });

          // Turn statue 90 degrees so the face points along local +Z (forward movement & eye contact axis)
          if (typeof cfg.faceOffset === 'number') {
            model.rotation.y += cfg.faceOffset;
          } else {
            model.rotation.y -= Math.PI / 2;
          }

          // Normalize bounding box so statue rests flush on the floor at y = 0
          model.updateMatrixWorld(true);
          const box = new THREE.Box3().setFromObject(model);
          const size = new THREE.Vector3();
          box.getSize(size);
          const currentH = Math.max(0.001, size.y);
          const targetH = cfg.targetHeight || 2.25;
          const normScale = targetH / currentH;
          model.scale.set(normScale, normScale, normScale);
          model.updateMatrixWorld(true);

          const box2 = new THREE.Box3().setFromObject(model);
          const center2 = new THREE.Vector3();
          box2.getCenter(center2);
          model.position.x -= center2.x;
          model.position.z -= center2.z;
          model.position.y -= box2.min.y;

          statueRoot.add(model);
        };

        gltfLoader.load(
          encodeURI(cfg.model),
          onModelLoaded,
          undefined,
          () => {
            if (cfg.fallbackModel) {
              gltfLoader.load(encodeURI(cfg.fallbackModel), onModelLoaded, undefined, () => {});
            }
          }
        );

        this.scene.add(group);
        this.statues.push(statueObj);
      });
    }

    buildSilverSmitty(fl, y0, mats) {
      // Handled inside unified STATUES_CONFIG & buildStatues
    }

    pickStatueWanderPath(s) {
      if (!this.navNodes || this.navNodes.length === 0 || !this.findShortestPath || !this.findNearestNavNode) return null;
      // 70% chance to wander across rooms on current floor, 30% chance to travel to another floor via the stairwells
      const stayOnFloor = s.cfg.stayOnFloor || (Math.random() < 0.70);
      const candidates = this.navNodes.filter(n => {
        if (!this.isRoomNavNode(n)) return false;
        if (stayOnFloor && n.floor !== s.floor) return false;
        const d = Math.hypot(n.x - s.x, n.z - s.z);
        return stayOnFloor ? (d > 5.0 && d < 32.0) : (n.floor !== s.floor);
      });
      if (candidates.length === 0) return null;
      const targetNode = candidates[Math.floor(Math.random() * candidates.length)];
      const startId = this.findNearestNavNode({ x: s.x, z: s.z }, s.floor);
      const goalId = targetNode.id;
      if (startId < 0 || goalId < 0) return null;
      const path = this.refineNavPath(this.findShortestPath(startId, goalId), { x: s.x, z: s.z }, s.floor);
      return (path && path.length > 0) ? path : null;
    }

    isRoomNavNode(n) {
      const t = n.tag || '';
      if (t === 'doorMens_e' || t === 'doorWomens_e' || t === 'mensRestroom_c' || t === 'womensRestroom_c') return true;
      return !t.includes('Mid') && !t.includes('Stair') && !t.includes('stair') &&
             !t.includes('door') && !t.includes('portal') && !t.includes('Base') && !t.includes('ext');
    }

    // Silver Smitty never walks/glides. He only teleports — and only while the player can't see him —
    // to a random room on a random floor, at random 60–105 second intervals.
    updateSilverSmittyTeleport(s, delta) {
      if (!this.navNodes || this.navNodes.length === 0) return;
      if (!this.navGrid) this.buildObstacleGrid();

      const placeAt = (n) => {
        let x = n.x, z = n.z;
        const free = this.gridNearestFree(n.floor, x, z);
        if (free) {
          x = this.navGrid.minX + free.i * this.navGrid.CELL;
          z = this.navGrid.minZ + free.j * this.navGrid.CELL;
        }
        s.x = x; s.z = z; s.floor = n.floor;
        s.y = n.floor * CONFIG.FLOOR_HEIGHT;
        s.group.position.set(s.x, s.y, s.z);
        // Face the player the moment he appears somewhere new
        s.yaw = Math.atan2(this.playerPos.x - s.x, this.playerPos.z - s.z);
        s.group.rotation.y = s.yaw;
        if (s.collider) {
          s.collider.x = s.x; s.collider.z = s.z; s.collider.floor = s.floor;
          s.collider.minY = s.y; s.collider.maxY = s.y + 2.35;
        }
      };

      if (!s.placedInitially) {
        // Start out on the 3rd floor in a random room
        const startPool = this.navNodes.filter(n => n.floor === s.cfg.floor && this.isRoomNavNode(n) && !this.isNearStairwell(n));
        if (startPool.length > 0) placeAt(startPool[Math.floor(Math.random() * startPool.length)]);
        s.placedInitially = true;
        s.teleportCooldown = 50.0 + Math.random() * 40.0;
        return;
      }

      if (s.isPlayingAudio) return;
      s.teleportCooldown -= delta;
      if (s.teleportCooldown > 0) return;

      if (!this._ssFrustum) {
        this._ssFrustum = new THREE.Frustum();
        this._ssMatrix = new THREE.Matrix4();
        this._ssVec = new THREE.Vector3();
      }
      this.camera.updateMatrixWorld();
      this._ssMatrix.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
      this._ssFrustum.setFromProjectionMatrix(this._ssMatrix);
      const inView = (x, y, z) => {
        this._ssVec.set(x, y, z);
        return this._ssFrustum.containsPoint(this._ssVec);
      };

      // Only relocate if the player cannot currently see him
      if (inView(s.x, s.y + 1.2, s.z)) return;

      const pool = this.navNodes.filter(n => {
        if (!this.isRoomNavNode(n) || this.isNearStairwell(n)) return false;
        if (n.floor === s.floor && Math.hypot(n.x - s.x, n.z - s.z) < 6.0) return false;
        if (n.floor === this.playerFloor && Math.hypot(n.x - this.playerPos.x, n.z - this.playerPos.z) < 7.0) return false;
        return !inView(n.x, n.floor * CONFIG.FLOOR_HEIGHT + 1.2, n.z);
      });
      if (pool.length === 0) return;
      placeAt(pool[Math.floor(Math.random() * pool.length)]);
      s.teleportCooldown = 60.0 + Math.random() * 45.0; // Random interval: 60 to 105 seconds
    }

    lerpStatueAngle(a, b, t) {
      let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
      if (diff < -Math.PI) diff += Math.PI * 2;
      return a + diff * t;
    }

    updateStatues(delta) {
      if (!this.statues || this.statues.length === 0) return;
      const now = performance.now() / 1000;

      this.statues.forEach(s => {
        if (s.hitRecoil) {
          s.hitRecoil.timer -= delta;
          if (s.hitRecoil.timer <= 0) {
            s.hitRecoil = null;
            s.statueRoot.position.x = 0;
            s.statueRoot.position.z = 0;
          } else {
            const progress = 1 - s.hitRecoil.timer / s.hitRecoil.duration;
            const strength = Math.sin(progress * Math.PI);
            s.statueRoot.position.x = s.hitRecoil.x * strength;
            s.statueRoot.position.z = s.hitRecoil.z * strength;
          }
        }

        // Silver Smitty never walks — he only teleports (unless he's playing audio for the player)
        if (s.cfg.isSilverSmitty) {
          this.updateSilverSmittyTeleport(s, delta);
          if (!s.isPlayingAudio) return;
        }

        // 1. IF CURRENTLY PLAYING AUDIO: Stop walking & maintain locked eye contact with the player!
        if (s.isPlayingAudio) {
          const elapsed = now - s.danceStartTime;
          if (elapsed > s.activeDuration || (s.activeAudioEl && s.activeAudioEl.ended)) {
            s.isPlayingAudio = false;
            s.isDancing = false;
            s.statueRoot.scale.set(1, 1, 1);
            s.statueRoot.position.y = s.baseY;
            s.statueRoot.rotation.set(0, 0, 0);
            if (s.activeAudioEl && !s.activeAudioEl.paused) s.activeAudioEl.pause();
            s.aiState = "IDLE";
            s.aiTimer = 0.6 + Math.random() * 1.5;
            return;
          }

          // Other statues track the player during audio; Silver Smitty holds his interaction pose.
          const dxPlayer = this.playerPos.x - s.x;
          const dzPlayer = this.playerPos.z - s.z;
          if (!s.cfg.isSilverSmitty && Math.hypot(dxPlayer, dzPlayer) > 0.05) {
            const targetYaw = Math.atan2(dxPlayer, dzPlayer);
            s.yaw = this.lerpStatueAngle(s.yaw, targetYaw, Math.min(1, delta * 18));
            s.group.rotation.y = s.yaw;
          }

          // Silver Smitty does NOT animate when playing audio; the other 5 statues bounce & dance!
          if (s.cfg.noAnimation) {
            s.statueRoot.scale.set(1, 1, 1);
            s.statueRoot.position.y = s.baseY;
            s.statueRoot.rotation.set(0, 0, 0);
          } else if (s.isDancing) {
            const freq = 9.2;
            const phase = elapsed * freq;
            const osc = Math.sin(phase);
            const squash = 1.0 + 0.30 * osc;
            const stretch = 1.0 / Math.sqrt(Math.max(0.4, squash));

            s.statueRoot.scale.set(stretch, squash, stretch);
            s.statueRoot.position.y = s.baseY + Math.max(0, osc) * 0.42;
            s.statueRoot.rotation.z = Math.sin(phase * 0.5) * 0.14;
            s.statueRoot.rotation.y = 0; // Keep root aligned with group.rotation.y for locked eye contact!
          }
          return;
        }

        // 2. NOT PLAYING AUDIO: Independent Minecraft-Pig Living AI (never locks onto player before interaction)
        s.aiTimer -= delta;

        if (s.aiState === "IDLE") {
          s.statueRoot.scale.set(1, 1, 1);
          s.statueRoot.position.y = s.baseY;
          s.statueRoot.rotation.set(0, 0, 0);

          // Completely independent idle look direction — ignores player position until interacted with
          s.yaw = this.lerpStatueAngle(s.yaw, s.idleLookYaw, Math.min(1, delta * 4.5));
          s.group.rotation.y = s.yaw;

          if (s.aiTimer <= 0) {
            if (Math.random() < 0.85) {
              const path = this.pickStatueWanderPath(s);
              if (path && path.length > 0) {
                s.navPath = path;
                s.navIndex = 0;
                s.aiState = "WANDER";
                s.aiTimer = 18.0 + Math.random() * 25.0;
              } else {
                s.idleLookYaw = s.yaw + (Math.random() - 0.5) * 2.2;
                s.aiTimer = 1.5 + Math.random() * 2.5;
              }
            } else {
              s.idleLookYaw = s.yaw + (Math.random() - 0.5) * 2.4;
              s.aiTimer = 1.5 + Math.random() * 3.0;
            }
          }
        } else if (s.aiState === "BATHROOM_MIRROR") {
          if (s.aiTimer <= 0) {
            s.aiState = "IDLE";
            s.aiTimer = 1.0;
          } else {
            // Stand facing the mirror. Mirrors are typically on the East wall (x=4.0) or West.
            // Restroom centers are around x=2.0. So face East.
            s.yaw = THREE.MathUtils.lerp(s.yaw, Math.PI / 2, 8.0 * delta);
            s.model.rotation.y = s.yaw + s.cfg.faceOffset;
          }
        } else if (s.aiState === "WANDER") {
          if (s.aiTimer <= 0 || !s.navPath || s.navIndex >= s.navPath.length) {
            const lastNode = s.navPath ? s.navPath[s.navPath.length - 1] : null;
            if (lastNode && (lastNode.tag === 'mensRestroom_c' || lastNode.tag === 'womensRestroom_c')) {
              s.aiState = "BATHROOM_MIRROR";
              s.aiTimer = 5.0 + Math.random() * 5.0; // Wait 5-10s
            } else {
              s.aiState = "IDLE";
              s.aiTimer = 1.5 + Math.random() * 3.5;
              s.idleLookYaw = s.yaw + (Math.random() - 0.5) * 1.6;
            }
            s.statueRoot.position.y = s.baseY;
            s.statueRoot.rotation.set(0, 0, 0);
            return;
          }

          const wp = s.navPath[s.navIndex];
          const dx = wp.x - s.x;
          const dz = wp.z - s.z;
          const dist = Math.hypot(dx, dz);

          if (dist < 0.55) {
            s.navIndex++;
            return;
          }

          const speed = s.cfg.walkSpeed || 1.50;
          let stepX = (dx / dist) * speed * delta;
          let stepZ = (dz / dist) * speed * delta;

          // Sidestep around the player if on the same floor without locking onto the player
          if (s.floor === this.playerFloor) {
            const pdx = s.x + stepX - this.playerPos.x;
            const pdz = s.z + stepZ - this.playerPos.z;
            const pDist = Math.hypot(pdx, pdz);
            if (pDist < 1.15 && pDist > 0.001) {
              stepX += (pdx / pDist) * (1.15 - pDist);
              stepZ += (pdz / pDist) * (1.15 - pDist);
            }
          }

          const tempPos = { x: s.x + stepX, y: s.y, z: s.z + stepZ, _ignoreCollider: s.collider };
          this.resolveCollisions(tempPos, 0.48, s.floor, s.y, 2.35);

          // Avoid overlapping other statues
          for (let other of this.statues) {
            if (other === s || other.floor !== s.floor) continue;
            const odx = tempPos.x - other.x;
            const odz = tempPos.z - other.z;
            const od = Math.hypot(odx, odz);
            if (od < 1.25 && od > 0.001) {
              tempPos.x += (odx / od) * (1.25 - od);
              tempPos.z += (odz / od) * (1.25 - od);
            }
          }

          // Stuck detection: if blocked by something for ~0.7s, replan a fresh obstacle-aware route
          const intended = Math.hypot(stepX, stepZ);
          const actual = Math.hypot(tempPos.x - s.x, tempPos.z - s.z);
          if (intended > 0.001 && actual < intended * 0.25) {
            s.stuckTimer = (s.stuckTimer || 0) + delta;
            if (s.stuckTimer > 0.7) {
              s.stuckTimer = 0;
              const np = this.pickStatueWanderPath(s);
              if (np && np.length > 0) { s.navPath = np; s.navIndex = 0; }
              else { s.aiState = "IDLE"; s.aiTimer = 1.0; }
            }
          } else {
            s.stuckTimer = 0;
          }

          s.x = tempPos.x;
          s.z = tempPos.z;

          // Update elevation & floor if walking up/down stairwells
          const elev = this.updateStairwellElevation(s, s.stairState, s.floor, s.y);
          s.y = elev.y;
          s.floor = elev.floor;

          s.group.position.set(s.x, s.y, s.z);

          // Update live collider position
          if (s.collider) {
            s.collider.x = s.x;
            s.collider.z = s.z;
            s.collider.floor = s.floor;
            s.collider.minY = s.y;
            s.collider.maxY = s.y + 2.35;
          }

          // Smoothly face movement direction
          const moveYaw = Math.atan2(dx, dz);
          s.yaw = this.lerpStatueAngle(s.yaw, moveYaw, Math.min(1, delta * 8.0));
          s.group.rotation.y = s.yaw;

          // Cute subtle waddle while walking (except Silver Smitty who glides smoothly)
          if (!s.cfg.noAnimation) {
            s.walkPhase += delta * 9.5;
            s.statueRoot.position.y = s.baseY + Math.abs(Math.sin(s.walkPhase)) * 0.055;
            s.statueRoot.rotation.z = Math.sin(s.walkPhase) * 0.035;
          }
        }
      });
    }

    updateSilverSmitty(delta) {
      // Handled inside updateStatues
    }

    getNearestStatue(maxDist) {
      if (!this.statues) return null;
      let best = null;
      let bestD = maxDist;
      for (let s of this.statues) {
        if (!s.group.visible || (!this.isSpectatorMode && s.floor !== this.playerFloor)) continue;
        const d = this.isSpectatorMode
          ? Math.hypot(
            this.playerPos.x - s.x,
            this.playerPos.y - (s.y + (s.cfg.targetHeight || 2.25) / 2),
            this.playerPos.z - s.z
          )
          : Math.hypot(this.playerPos.x - s.x, this.playerPos.z - s.z);
        if (d < bestD) { bestD = d; best = s; }
      }
      return best;
    }

    stopStatueAudio(s) {
      if (s.activeAudioEl) {
        s.activeAudioEl.pause();
        s.activeAudioEl.currentTime = 0;
      }
      if (this.activeStatueAudio === s.activeAudioEl) this.activeStatueAudio = null;
      s.activeAudioEl = null;
      s.isPlayingAudio = false;
      s.isDancing = false;
      s.statueRoot.scale.set(1, 1, 1);
      s.statueRoot.position.y = s.baseY;
      s.statueRoot.rotation.set(0, 0, 0);
      s.aiState = "IDLE";
      s.aiTimer = 0.8 + Math.random() * 1.5;
    }

    interactStatue(s) {
      // Pressing E on a statue that's already playing stops its audio & animation
      if (s.isPlayingAudio) {
        this.stopStatueAudio(s);
        return;
      }

      // Stop any other currently playing statue
      this.statues.forEach(other => {
        if (other !== s && other.isPlayingAudio) this.stopStatueAudio(other);
      });

      // Select audio track:
      // - Silver Smitty: random track from his 6-track pool
      // - R3E4: 5% chance for 2nd track (R3E4-song2.mp3), 95% chance for 1st track (R3E4-song1.mp3)
      // - Others: primary track
      let chosenAudio = s.audioEl;
      let chosenDuration = s.cfg.duration || 10.0;

      if (s.audioPoolEls && s.audioPoolEls.length > 0) {
        let idx = Math.floor(Math.random() * s.audioPoolEls.length);
        if (s.audioPoolEls.length > 1 && idx === s.lastPoolIdx) {
          idx = (idx + 1) % s.audioPoolEls.length;
        }
        s.lastPoolIdx = idx;
        chosenAudio = s.audioPoolEls[idx].el;
        chosenDuration = s.audioPoolEls[idx].duration;
      } else if (s.audioElAlt && typeof s.cfg.altChance === "number") {
        if (Math.random() < s.cfg.altChance) {
          chosenAudio = s.audioElAlt;
          chosenDuration = s.cfg.durationAlt || 21.29;
        }
      }

      s.isPlayingAudio = true;
      s.isDancing = !s.cfg.noAnimation;
      s.danceStartTime = performance.now() / 1000;
      s.activeDuration = chosenDuration;
      s.activeAudioEl = chosenAudio;
      this.activeStatueAudio = chosenAudio;

      // Immediately snap eye contact toward player
      const dx = this.playerPos.x - s.x;
      const dz = this.playerPos.z - s.z;
      if (Math.hypot(dx, dz) > 0.05) {
        s.yaw = Math.atan2(dx, dz);
        s.group.rotation.y = s.yaw;
      }

      if (chosenAudio) {
        chosenAudio.currentTime = 0;
        chosenAudio.volume = 0.88;
        chosenAudio.play().catch(() => {});
      }
      // Song title notification only for statues with a song title (JLB3, Heknah, R3E4)
      const title = (chosenAudio && chosenAudio === s.audioElAlt) ? s.cfg.songTitleAlt : s.cfg.songTitle;
      if (title) this.showSystemNotification(title);
      if (this.triggerLeftHandGrab) this.triggerLeftHandGrab();
    }

    exportLevelJSON() {
      try {
        const sceneData = this.scene.toJSON();
        const jsonStr = JSON.stringify(sceneData);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'The_Museum_Level.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        console.log('Successfully exported The_Museum_Level.json for https://threejs.org/editor/');
      } catch (err) {
        console.error('Failed to export level JSON:', err);
      }
    }

    startMultiplayerGame() {
      this.gameStarted = true;
      this.startTime = Date.now();
      this.keys = {};
      this.isSprinting = false;
      this.sprintExhausted = false;
      this.stamina = CONFIG.PLAYER.MAX_STAMINA;
      this.audio.init();
      this.audio.startGameplayAudio();
      this.audio.fadeOutMenuMusic(0.45);
      this.setSmittyMode(this.smittyEnabled);
      this.showFloorNotification(this.playerFloor);
      this.updateHud();
      this.requestNativeOrBrowserLock();
      if (this.mp) {
        this.mp.startNetworkLoop();
      }
    }

    onRemoteRelicCollected(relicId) {
      const relic = this.relics.find(r => r.id === relicId);
      if (relic && !relic.collected) {
        relic.collected = true;
        if (relic.mesh) relic.mesh.visible = false;
        if (relic.glowLight) relic.glowLight.intensity = 0;
        this.relicsCollected++;
        this.audio.playRelicChime();
        this.showRelicNotification();
        const itemEl = document.getElementById(`relic-item-${relic.id}`);
        if (itemEl) {
          itemEl.classList.add('completed');
          itemEl.innerHTML = `<span class="relic-num">${relic.id}.</span> <span class="relic-name">${relic.name}</span>`;
        }
        if (this.relicsCollected >= CONFIG.TOTAL_RELICS) {
          this.unsealExitDoors();
        }
        this.updateHud();
      }
    }

    onCuratorSync(data) {
      if (!this.smitty) return;
      this.smitty.position.set(data.x, data.y, data.z);
      this.smitty.rotation.y = data.yaw;
      this.smittyState = data.state;
      this.smitty.visible = data.visible;
    }

    onStatuesSync(statueList) {
      if (!this.statues || !Array.isArray(statueList)) return;
      statueList.forEach(item => {
        const s = this.statues[item.i];
        if (!s) return;
        s.x = item.x;
        s.y = item.y;
        s.z = item.z;
        s.yaw = item.yaw;
        if (s.group) {
          s.group.position.set(s.x, s.y, s.z);
          s.group.rotation.y = s.yaw;
        }
        if (s.setAnim && item.anim && s.currentAnim !== item.anim) {
          s.setAnim(item.anim);
        }
      });
    }

    onCratesSync(crateList) {
      if (!this.physicsCrates || !Array.isArray(crateList)) return;
      crateList.forEach(item => {
        const c = this.physicsCrates[item.i];
        if (!c) return;
        c.x = item.x;
        c.y = item.y;
        c.z = item.z;
        c.rotY = item.rotY;
        c.rotX = item.rotX || 0;
        c.rotZ = item.rotZ || 0;
        c.isHeld = !!item.held;
        if (c.mesh) {
          c.mesh.position.set(c.x, c.y + c.h / 2, c.z);
          c.mesh.rotation.set(c.rotX, c.rotY, c.rotZ);
        }
        if (c.collider) {
          c.collider.x = c.x;
          c.collider.z = c.z;
        }
      });
    }

    onRemoteAmmoPickup(index) {
      const p = this.ammoPickups[index];
      if (p && p.active) {
        p.active = false;
        if (p.mesh) p.mesh.visible = false;
        if (p.glowLight) {
          p.glowLight.intensity = 0;
          p.glowLight.visible = false;
        }
      }
    }

    onRemoteWeaponFire(data) {
      if (!data) return;
      if (this.mp && typeof this.mp.triggerRemoteWeaponMuzzle === 'function') {
        this.mp.triggerRemoteWeaponMuzzle(data.sender, data);
      }
      if (this.audio && typeof this.audio.playPistolShot === 'function') {
        this.audio.playPistolShot();
      }
    }

    onFullGameStateSync(data) {
      if (data.keysCollected !== undefined) {
        this.relicsCollected = data.keysCollected;
      }
      if (data.doorsUnlocked) {
        this.unsealExitDoors();
      }
      if (data.relicStates && Array.isArray(data.relicStates)) {
        data.relicStates.forEach(rs => {
          const relic = this.relics.find(r => r.id === rs.index);
          if (relic && !rs.hasRelic) {
            relic.collected = true;
            if (relic.mesh) relic.mesh.visible = false;
            if (relic.glowLight) relic.glowLight.intensity = 0;
          }
        });
      }
      if (data.videoState) {
        this.onRemoteVideoStateSync(data.videoState);
      }
      this.updateHud();
    }
  }

  window.exportMuseumScene = () => {
    if (window.gameInstance) {
      window.gameInstance.exportLevelJSON();
    } else {
      console.warn('MuseumGame instance not ready yet.');
    }
  };

  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', () => {
      window.gameInstance = new MuseumGame();
    });
  } else {
    window.gameInstance = new MuseumGame();
  }
})();
