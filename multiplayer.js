// The Museum - Robust High-Performance Multiplayer Engine (WebSocket Relay)
(function() {
  class MuseumMultiplayer {
    constructor(game) {
      this.game = game;
      this.client = null;
      this.isHost = false;
      this.roomCode = null;
      const idBytes = new Uint8Array(9);
      if (globalThis.crypto && typeof globalThis.crypto.getRandomValues === 'function') {
        globalThis.crypto.getRandomValues(idBytes);
      } else {
        for (let i = 0; i < idBytes.length; i++) idBytes[i] = Math.floor(Math.random() * 256);
      }
      this.clientId = 'user_' + Array.from(idBytes, value => value.toString(36).padStart(2, '0')).join('');
      this.remotePlayers = new Map(); // clientId -> remote player object
      this.tickInterval = null;
      this.broadcastRate = 30; // 30Hz
      this.onPlayerJoined = null;
      this.characterData = [
        { name: 'The Animal', file: 'the-animal.glb' },
        { name: 'The Earth', file: 'the-man.glb' },
        { name: 'Sand', file: 'sand.glb' },
        { name: 'The Cook', file: 'cook.glb' },
        { name: 'The Arse', file: 'the-tundra.glb' },
        { name: 'The Clown', file: 'the-clown.glb' },
        { name: 'The Student', file: 'the-student.glb' }
      ];

      // Free, high-speed, enterprise-grade public WebSocket brokers
      this.brokerUrls = [
        'wss://broker.hivemq.com:8884/mqtt',
        'wss://broker.emqx.io:8084/mqtt',
        'wss://test.mosquitto.org:8081'
      ];
    }

    generateCode(len = 8) {
      const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
      const values = new Uint8Array(len);
      if (globalThis.crypto && typeof globalThis.crypto.getRandomValues === 'function') {
        globalThis.crypto.getRandomValues(values);
      } else {
        for (let i = 0; i < values.length; i++) values[i] = Math.floor(Math.random() * 256);
      }
      let code = '';
      for (let i = 0; i < len; i++) {
        code += chars.charAt(values[i] % chars.length);
      }
      return code;
    }

    getTopic() {
      return 'museum/exhibition/' + this.roomCode;
    }

    initHost(onReady, onError) {
      this.cleanup();
      this.isHost = true;
      const code = this.generateCode(8);
      this.roomCode = code;
      this.connectToBroker(code, () => {
        // Send host beacon
        this.publish({
          type: 'host_ready',
          sender: this.clientId
        });
        if (onReady) onReady(code);
      }, onError);
    }

    initClient(code, onReady, onError) {
      this.cleanup();
      this.isHost = false;
      this.roomCode = code.toUpperCase().trim();

      let connected = false;
      let hostVerified = false;

      let timeoutTimer = setTimeout(() => {
        if (!hostVerified) {
          this.cleanup();
          if (onError) onError({ message: 'Room code not found. Make sure host is waiting.' });
        }
      }, 10000);

      this.connectToBroker(this.roomCode, () => {
        connected = true;
        // Ping for host
        this.publish({
          type: 'client_ping',
          sender: this.clientId
        });
      }, (err) => {
        clearTimeout(timeoutTimer);
        if (onError) onError(err);
      });

      // Hook incoming message to verify host responds
      this.onHostBeacon = () => {
        if (!hostVerified) {
          hostVerified = true;
          clearTimeout(timeoutTimer);
          if (onReady) onReady(this.roomCode);
        }
      };
    }

    connectToBroker(code, onSuccess, onError, brokerIndex = 0) {
      if (brokerIndex >= this.brokerUrls.length) {
        if (onError) onError({ message: 'Could not connect to online network.' });
        return;
      }

      const brokerUrl = this.brokerUrls[brokerIndex];

      try {
        if (typeof mqtt === 'undefined') {
          console.error('[Multiplayer] MQTT library not loaded');
          if (onError) onError({ message: 'Multiplayer library missing.' });
          return;
        }

        const client = mqtt.connect(brokerUrl, {
          clientId: this.clientId,
          clean: true,
          connectTimeout: 5000,
          reconnectPeriod: 3000
        });

        this.client = client;

        client.on('connect', () => {
          console.log('[Multiplayer] Connected to WebSocket broker successfully!');
          const topic = this.getTopic();
          client.subscribe(topic, { qos: 0 }, (err) => {
            if (err) {
              console.warn('[Multiplayer] Subscribe error:', err);
              if (onError) onError(err);
              return;
            }
            if (onSuccess) onSuccess();
          });
        });

        client.on('message', (topic, payload) => {
          try {
            const data = JSON.parse(payload.toString());
            if (data.sender === this.clientId) return; // Ignore own echoes
            this.handleMessage(data);
          } catch(e) {}
        });

        client.on('error', (err) => {
          console.warn('[Multiplayer] Broker error, trying fallback...', err);
          client.end(true);
          this.connectToBroker(code, onSuccess, onError, brokerIndex + 1);
        });
      } catch (err) {
        this.connectToBroker(code, onSuccess, onError, brokerIndex + 1);
      }
    }

    publish(data) {
      if (!this.client || !this.client.connected) return;
      data.sender = this.clientId;
      try {
        const payload = JSON.stringify(data);
        this.client.publish(this.getTopic(), payload, { qos: 0 });
      } catch (e) {}
    }

    handleMessage(data) {
      if (!data || !data.type) return;

      switch(data.type) {
        case 'host_ready':
          if (!this.isHost && this.onHostBeacon) {
            this.onHostBeacon();
          }
          break;

        case 'client_ping':
          if (this.isHost) {
            // Reply with host announcement and trigger UI callback
            this.publish({ type: 'host_ready' });
            if (this.onPlayerJoined) {
              this.onPlayerJoined(data.sender);
            }
          }
          break;

        case 'hello':
          this.spawnRemotePlayer(data.sender, data.characterIndex || 0, data.pos, data.rot);
          if (this.isHost) {
            // Reply to new player with host position
            this.sendHello();
            // Sync relics
            this.syncFullGameState();
          }
          break;

        case 'transform': {
          let p = this.remotePlayers.get(data.sender);
          if (p) {
            p.targetPos.set(data.x, data.y, data.z);
            p.targetYaw = data.yaw;
            p.targetPitch = data.pitch;
            p.anim = data.anim || 'Idle';
            if (p.flashlight) {
              const prevFl = p.flashlight.visible;
              const nextFl = !!data.fl;
              p.flashlight.visible = nextFl;
              // Play spatialized 3D flashlight click when remote player toggles flashlight
              if (prevFl !== nextFl && this.game && this.game.audio && typeof this.game.audio.playFlashlightClick === 'function') {
                const myPos = this.game.camera ? this.game.camera.position : this.game.playerPos;
                const d = myPos ? myPos.distanceTo(p.group.position) : 0;
                if (d < 30) {
                  this.game.audio.playFlashlightClick();
                }
              }
            }
          } else {
            this.spawnRemotePlayer(data.sender, data.charIdx || 0, { x: data.x, y: data.y, z: data.z });
          }
          break;
        }

        case 'video_control':
          if (this.game && typeof this.game.onRemoteVideoControl === 'function') {
            this.game.onRemoteVideoControl(data.floor, data.action, data);
          }
          break;

        case 'video_state_sync':
          if (this.game && typeof this.game.onRemoteVideoStateSync === 'function') {
            this.game.onRemoteVideoStateSync(data);
          }
          break;

        case 'relic_pickup':
          if (this.game && typeof this.game.onRemoteRelicCollected === 'function') {
            this.game.onRemoteRelicCollected(data.relicIndex);
          }
          break;

        case 'all_relics_found_cutscene':
          if (this.game && typeof this.game.playAllRelicsFoundCutscene === 'function') {
            this.game.playAllRelicsFoundCutscene(false);
          }
          break;

        case 'curator_sync':
          if (!this.isHost && this.game && typeof this.game.onCuratorSync === 'function') {
            this.game.onCuratorSync(data);
          }
          break;

        case 'statues_sync':
          if (!this.isHost && this.game && typeof this.game.onStatuesSync === 'function') {
            this.game.onStatuesSync(data.statues);
          }
          break;

        case 'crates_sync':
          if (!this.isHost && this.game && typeof this.game.onCratesSync === 'function') {
            this.game.onCratesSync(data.crates);
          }
          break;

        case 'crate_throw':
          if (this.isHost && this.game && typeof this.game.onRemoteCrateThrown === 'function') {
            this.game.onRemoteCrateThrown(data);
          }
          break;

        case 'crate_statue_hit':
          if (this.game && typeof this.game.onRemoteCrateStatueHit === 'function') {
            this.game.onRemoteCrateStatueHit(data);
          }
          break;

        case 'ammo_pickup':
          if (this.game && typeof this.game.onRemoteAmmoPickup === 'function') {
            this.game.onRemoteAmmoPickup(data.index);
          }
          break;

        case 'weapon_fire':
          if (this.game && typeof this.game.onRemoteWeaponFire === 'function') {
            this.game.onRemoteWeaponFire(data);
          }
          break;

        case 'player_hit':
          if (this.game && typeof this.game.onRemotePlayerHit === 'function') {
            this.game.onRemotePlayerHit(data);
          }
          break;

        case 'statue_trigger':
          if (this.game && typeof this.game.onRemoteStatueTrigger === 'function') {
            this.game.onRemoteStatueTrigger(data);
          }
          break;

        case 'mode_sync':
          if (!this.isHost && this.game && typeof this.game.onRemoteModeSync === 'function') {
            this.game.onRemoteModeSync(data);
          }
          break;

        case 'game_state_sync':
          if (!this.isHost && this.game && typeof this.game.onFullGameStateSync === 'function') {
            this.game.onFullGameStateSync(data);
          }
          break;
      }
    }

    sendHello() {
      const charIdx = this.game.selectedPlayerCharacter || 0;
      this.publish({
        type: 'hello',
        characterIndex: charIdx,
        pos: {
          x: this.game.camera ? this.game.camera.position.x : 0,
          y: this.game.camera ? this.game.camera.position.y : 0,
          z: this.game.camera ? this.game.camera.position.z : 0
        },
        rot: {
          yaw: this.game.camera ? this.game.camera.rotation.y : 0,
          pitch: this.game.camera ? this.game.camera.rotation.x : 0
        }
      });
    }

    syncFullGameState() {
      if (!this.game) return;
      const relicStates = [];
      if (this.game.relics) {
        this.game.relics.forEach((r) => {
          relicStates.push({ id: r.id, collected: !!r.collected });
        });
      }
      const videoState = typeof this.game.getVideoSyncState === 'function' ? this.game.getVideoSyncState() : null;
      this.publish({
        type: 'game_state_sync',
        relicStates: relicStates,
        relicsCollected: this.game.relicsCollected || 0,
        videoState: videoState,
        curatorEnabled: this.game.smittyEnabled !== undefined ? !!this.game.smittyEnabled : true,
        statuesEnabled: this.game.statuesEnabled !== undefined ? !!this.game.statuesEnabled : true
      });
    }

    startNetworkLoop() {
      if (this.tickInterval) clearInterval(this.tickInterval);
      this.sendHello();
      let tickCount = 0;
      this.tickInterval = setInterval(() => {
        this.sendLocalTransform();
        if (this.isHost) {
          tickCount++;
          // Send curator every tick (fast chase tracking)
          this.sendCuratorState();
          // Send statue AI state at 15Hz (every 2nd tick) - prevents network saturation and JSON parse thrashing
          if (tickCount % 2 === 0) {
            this.sendStatuesState();
          }
          if (tickCount % 3 === 0) {
            this.sendCratesState();
          }
        }
      }, 1000 / this.broadcastRate);
    }

    stopNetworkLoop() {
      if (this.tickInterval) clearInterval(this.tickInterval);
      this.tickInterval = null;
    }

    sendLocalTransform() {
      if (!this.game || !this.game.camera || !this.client || !this.client.connected) return;

      let anim = 'Idle';
      if (!this.game.isGrounded) {
        anim = 'Jump';
      } else if (this.game.isSprinting && (this.game.keys && (this.game.keys['KeyW'] || this.game.keys['KeyS'] || this.game.keys['KeyA'] || this.game.keys['KeyD']))) {
        anim = 'Run';
      } else if (this.game.keys && (this.game.keys['KeyW'] || this.game.keys['KeyS'] || this.game.keys['KeyA'] || this.game.keys['KeyD'])) {
        anim = 'Walk';
      } else if (this.game.isPlayerDancing) {
        anim = 'Dance';
      }

      const footY = (this.game.playerPos ? this.game.playerPos.y : this.game.camera.position.y) - (this.game.currentCamHeight || 1.72) + (this.game.jumpOffset || 0);

      this.publish({
        type: 'transform',
        charIdx: this.game.selectedPlayerCharacter,
        x: Number(this.game.camera.position.x.toFixed(3)),
        y: Number(footY.toFixed(3)),
        z: Number(this.game.camera.position.z.toFixed(3)),
        yaw: Number(this.game.camera.rotation.y.toFixed(3)),
        pitch: Number(this.game.camera.rotation.x.toFixed(3)),
        anim: anim,
        fl: this.game.flashlight ? this.game.flashlight.intensity > 0 : !!this.game.flashlightOn
      });
    }

    sendCuratorState() {
      if (!this.isHost || !this.game) return;
      const s = this.game.smittyMesh || this.game.smitty;
      if (!s) return;
      const pos = this.game.smittyPos || s.position;
      const rotY = s.rotation ? s.rotation.y : 0;
      this.publish({
        type: 'curator_sync',
        x: Number(pos.x.toFixed(3)),
        y: Number(pos.y.toFixed(3)),
        z: Number(pos.z.toFixed(3)),
        yaw: Number(rotY.toFixed(3)),
        state: this.game.smittyState || 'patrol',
        visible: this.game.smittyEnabled ? !!s.visible : false
      });
    }

    notifyVideoControl(floor, action, extra = {}) {
      this.publish({
        type: 'video_control',
        floor: floor,
        action: action,
        ...extra
      });
    }

    notifyVideoState(videoState) {
      if (!videoState) return;
      this.publish({
        type: 'video_state_sync',
        ...videoState
      });
    }

    notifyRelicCollected(relicIndex) {
      this.publish({
        type: 'relic_pickup',
        relicIndex: relicIndex
      });
    }

    notifyAllRelicsFoundCutscene() {
      this.publish({
        type: 'all_relics_found_cutscene'
      });
    }

    sendStatuesState() {
      if (!this.isHost || !this.game || !this.game.statues || this.game.statues.length === 0) return;
      const statueData = [];
      this.game.statues.forEach((s, idx) => {
        statueData.push({
          i: idx,
          id: s.cfg.id,
          x: Number(s.x.toFixed(3)),
          y: Number(s.y.toFixed(3)),
          z: Number(s.z.toFixed(3)),
          yaw: Number(s.yaw.toFixed(3)),
          state: s.aiState || 'IDLE',
          anim: s.currentAnim || 'idle',
          playing: !!s.isPlayingAudio,
          poolIdx: s.lastPoolIdx !== undefined ? s.lastPoolIdx : -1,
          isAlt: !!(s.activeAudioEl && s.activeAudioEl === s.audioElAlt),
          danceStart: s.danceStartTime ? Number(s.danceStartTime.toFixed(2)) : 0,
          dur: s.activeDuration ? Number(s.activeDuration.toFixed(2)) : 0,
          vis: !!(s.group && s.group.visible)
        });
      });
      this.publish({
        type: 'statues_sync',
        statues: statueData
      });
    }

    sendCratesState() {
      if (!this.isHost || !this.game || !this.game.physicsCrates || this.game.physicsCrates.length === 0) return;
      const crateData = [];
      this.game.physicsCrates.forEach((c, idx) => {
        const moving = Math.abs(c.vx) > 0.02 || Math.abs(c.vy || 0) > 0.02 || Math.abs(c.vz) > 0.02;
        if (c.isHeld || moving || c._syncDirty) {
          crateData.push({
            i: idx,
            x: Number(c.x.toFixed(3)),
            y: Number(c.y.toFixed(3)),
            z: Number(c.z.toFixed(3)),
            rotY: Number(c.rotY.toFixed(3)),
            rotX: Number(c.rotX.toFixed(3)),
            rotZ: Number(c.rotZ.toFixed(3)),
            held: !!c.isHeld
          });
          if (!moving && !c.isHeld) c._syncDirty = false;
        }
      });
      if (crateData.length > 0) {
        this.publish({
          type: 'crates_sync',
          crates: crateData
        });
      }
    }

    notifyAmmoPickup(pickupIndex) {
      this.publish({
        type: 'ammo_pickup',
        index: pickupIndex
      });
    }

    notifyWeaponFired(x, y, z, yaw, pitch) {
      this.publish({
        type: 'weapon_fire',
        x: Number(x.toFixed(3)),
        y: Number(y.toFixed(3)),
        z: Number(z.toFixed(3)),
        yaw: Number(yaw.toFixed(3)),
        pitch: Number(pitch.toFixed(3))
      });
    }

    notifyPlayerHit(targetId, hitPoint, shotDir, damage = 25, knockback = 0) {
      this.publish({
        type: 'player_hit',
        targetId: targetId,
        x: Number(hitPoint.x.toFixed(3)),
        y: Number(hitPoint.y.toFixed(3)),
        z: Number(hitPoint.z.toFixed(3)),
        dirX: Number(shotDir.x.toFixed(3)),
        dirY: Number(shotDir.y.toFixed(3)),
        dirZ: Number(shotDir.z.toFixed(3)),
        damage: damage,
        knockback: knockback
      });
    }

    notifyCrateThrown(index, body, thrower) {
      if (!body) return;
      this.publish({
        type: 'crate_throw',
        i: index,
        x: body.position.x, y: body.position.y, z: body.position.z,
        qx: body.quaternion.x, qy: body.quaternion.y,
        qz: body.quaternion.z, qw: body.quaternion.w,
        vx: body.velocity.x, vy: body.velocity.y, vz: body.velocity.z,
        wx: body.angularVelocity.x, wy: body.angularVelocity.y, wz: body.angularVelocity.z,
        thrower: thrower
      });
    }

    notifyCrateStatueHit(statueId, hitPoint, direction) {
      this.publish({
        type: 'crate_statue_hit',
        statueId: statueId,
        x: hitPoint.x, y: hitPoint.y, z: hitPoint.z,
        dx: direction.x, dy: direction.y, dz: direction.z
      });
    }

    notifyStatueTrigger(statueId, action, trackIdx = 0) {
      this.publish({
        type: 'statue_trigger',
        statueId: statueId,
        action: action, // 'play' or 'stop'
        trackIdx: trackIdx
      });
    }

    notifyModeSync(curatorEnabled, statuesEnabled) {
      if (!this.isHost) return;
      this.publish({
        type: 'mode_sync',
        curatorEnabled: !!curatorEnabled,
        statuesEnabled: !!statuesEnabled
      });
    }

    spawnRemotePlayer(id, characterIndex, initialPos, initialRot) {
      if (this.remotePlayers.has(id)) return;

      const group = new THREE.Group();
      group.name = 'remote-player-' + id;

      const char = this.characterData[characterIndex] || this.characterData[0];
      const remoteData = {
        id,
        characterIndex,
        group,
        model: null,
        mixer: null,
        actions: {},
        currentAction: null,
        targetPos: new THREE.Vector3(initialPos ? initialPos.x : 0, initialPos ? initialPos.y : 0, initialPos ? initialPos.z : 0),
        targetYaw: initialRot ? initialRot.yaw : 0,
        targetPitch: initialRot ? initialRot.pitch : 0,
        anim: 'Idle',
        danceTimer: 0,
        bones: {},
        flashlight: null
      };

      group.position.copy(remoteData.targetPos);
      if (this.game.scene) {
        this.game.scene.add(group);
      }
      this.remotePlayers.set(id, remoteData);

      // Flashlight (Warm wide cone matching player's flashlight with target tracking)
      const spot = new THREE.SpotLight(0xfff6e8, 2.2, 38, Math.PI / 4.4, 0.42, 1.05);
      spot.position.set(0, 1.45, 0);
      spot.castShadow = false;
      const spotTarget = new THREE.Object3D();
      spotTarget.position.set(0, 1.45, -10);
      group.add(spot);
      group.add(spotTarget);
      spot.target = spotTarget;
      remoteData.flashlight = spot;
      remoteData.flashlightTarget = spotTarget;

      // Remote Muzzle Flash light & spark sprite
      const muzzleLight = new THREE.PointLight(0xffaa33, 0, 12);
      muzzleLight.position.set(0.18, 1.35, -0.6);
      group.add(muzzleLight);
      remoteData.muzzleLight = muzzleLight;

      // Canvas spark texture for weapon muzzle flash
      const flashCanvas = document.createElement('canvas');
      flashCanvas.width = 64;
      flashCanvas.height = 64;
      const fctx = flashCanvas.getContext('2d');
      const grad = fctx.createRadialGradient(32, 32, 2, 32, 32, 30);
      grad.addColorStop(0, 'rgba(255, 240, 180, 1)');
      grad.addColorStop(0.3, 'rgba(255, 140, 20, 0.85)');
      grad.addColorStop(1, 'transparent');
      fctx.fillStyle = grad;
      fctx.fillRect(0, 0, 64, 64);
      const flashTex = new THREE.CanvasTexture(flashCanvas);
      const muzzleSprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: flashTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending })
      );
      muzzleSprite.scale.set(0.65, 0.65, 0.65);
      muzzleSprite.position.set(0.18, 1.35, -0.6);
      group.add(muzzleSprite);
      remoteData.muzzleSprite = muzzleSprite;

      // Load 3D model
      const loader = new THREE.GLTFLoader();
      const cacheKey = window._ASSET_VERSION || '1.0';
      loader.load(`assets/playermodels/${char.file}?v=${cacheKey}`, (gltf) => {
        try {
          const box = new THREE.Box3().setFromObject(gltf.scene);
          const size = box.getSize(new THREE.Vector3());
          const model = gltf.scene;
          model.scale.setScalar(1.75 / size.y);
          model.position.y = -box.min.y * model.scale.y;
          model.rotation.y = Math.PI; // Correct GLTF model forward orientation (+Z to -Z)

          model.traverse((child) => {
            if (child.isMesh) {
              child.castShadow = true;
              child.receiveShadow = false;
            }
          });

          group.add(model);
          remoteData.model = model;
          remoteData.bones = {};
          model.traverse((child) => {
            if (child.isBone && child.name) {
              remoteData.bones[child.name] = child;
            }
          });
          remoteData.mixer = new THREE.AnimationMixer(model);

          // Add X-Ray Spectator outline meshes to remote player
          if (this.game && this.game.smittyXrayFillMat && this.game.smittyXrayWireMat) {
            const xrayGroup = new THREE.Group();
            xrayGroup.visible = !!this.game.isSmittyXray;
            model.traverse((child) => {
              if (child.isMesh && child.geometry) {
                if (child.isSkinnedMesh) {
                  const fillMesh = new THREE.SkinnedMesh(child.geometry, this.game.smittyXrayFillMat);
                  fillMesh.bind(child.skeleton, child.bindMatrix);
                  fillMesh.renderOrder = 999;
                  fillMesh.frustumCulled = false;
                  xrayGroup.add(fillMesh);

                  const wireMesh = new THREE.SkinnedMesh(child.geometry, this.game.smittyXrayWireMat);
                  wireMesh.bind(child.skeleton, child.bindMatrix);
                  wireMesh.renderOrder = 1000;
                  wireMesh.frustumCulled = false;
                  xrayGroup.add(wireMesh);
                } else {
                  const fillMesh = new THREE.Mesh(child.geometry, this.game.smittyXrayFillMat);
                  fillMesh.renderOrder = 999;
                  fillMesh.frustumCulled = false;
                  xrayGroup.add(fillMesh);

                  const wireMesh = new THREE.Mesh(child.geometry, this.game.smittyXrayWireMat);
                  wireMesh.renderOrder = 1000;
                  wireMesh.frustumCulled = false;
                  xrayGroup.add(wireMesh);
                }
              }
            });
            model.add(xrayGroup);
            remoteData.xrayGroup = xrayGroup;
          }

          gltf.animations.forEach((clip) => {
            const action = remoteData.mixer.clipAction(clip);
            action.setEffectiveTimeScale(1);
            action.setEffectiveWeight(1);
            const name = clip.name.toLowerCase();
            if (name.includes('jump')) remoteData.actions.Jump = action;
            else if (name.includes('run')) remoteData.actions.Run = action;
            else if (name.includes('walk')) remoteData.actions.Walk = action;
            else if (name.includes('idle')) remoteData.actions.Idle = action;
          });

          if (remoteData.actions.Idle) {
            remoteData.actions.Idle.play();
            remoteData.currentAction = remoteData.actions.Idle;
          }
        } catch (e) {
          console.warn('[Remote Player Load Error]', e);
        }
      });
    }

    removeRemotePlayer(id) {
      const p = this.remotePlayers.get(id);
      if (p) {
        if (p.group && this.game.scene) {
          this.game.scene.remove(p.group);
        }
        this.remotePlayers.delete(id);
      }
    }

    cleanup() {
      this.stopNetworkLoop();
      this.remotePlayers.forEach((p, id) => {
        this.removeRemotePlayer(id);
      });
      if (this.client) {
        try { this.client.end(true); } catch(e) {}
        this.client = null;
      }
    }

    update(delta) {
      this.remotePlayers.forEach((p) => {
        if (!p.group) return;

        // Smooth position lerp
        p.group.position.lerp(p.targetPos, Math.min(1, delta * 14));

        // Smooth yaw rotation lerp
        let diffYaw = p.targetYaw - p.group.rotation.y;
        while (diffYaw < -Math.PI) diffYaw += Math.PI * 2;
        while (diffYaw > Math.PI) diffYaw -= Math.PI * 2;
        p.group.rotation.y += diffYaw * Math.min(1, delta * 12);

        // Update remote player flashlight target direction (pitch & yaw)
        if (p.flashlightTarget) {
          const pitch = p.targetPitch || 0;
          p.flashlightTarget.position.set(
            -Math.sin(0) * Math.cos(pitch) * 10,
            1.45 + Math.sin(pitch) * 10,
            -Math.cos(0) * Math.cos(pitch) * 10
          );
        }

        // Sync X-ray outline visibility with game spectator mode
        if (p.xrayGroup && this.game) {
          p.xrayGroup.visible = !!this.game.isSmittyXray;
        }

        // Update animation mixer
        if (p.mixer) {
          p.mixer.update(delta);
          const wantedAction = p.actions[p.anim] || p.actions.Idle;
          if (wantedAction && wantedAction !== p.currentAction) {
            if (p.currentAction) p.currentAction.fadeOut(0.14);
            wantedAction.reset().fadeIn(0.14).play();
            p.currentAction = wantedAction;
          }

          // Procedural dance overlay on remote player bones
          if (p.anim === 'Dance') {
            p.danceTimer = (p.danceTimer || 0) + delta;
            const t = p.danceTimer;
            const b = p.bones;
            if (b) {
              if (b.hips) {
                b.hips.position.y += Math.sin(t * 9.5) * 0.055;
                b.hips.position.x += Math.cos(t * 4.75) * 0.045;
                b.hips.rotation.z += Math.sin(t * 4.75) * 0.14;
              }
              if (b.spine) {
                b.spine.rotation.z += Math.sin(t * 4.75 + Math.PI) * 0.12;
                b.spine.rotation.y += Math.sin(t * 4.75) * 0.10;
              }
              if (b.chest) {
                b.chest.rotation.x += Math.sin(t * 9.5) * 0.08;
                b.chest.rotation.z += Math.cos(t * 4.75) * 0.10;
              }
              if (b.neck) {
                b.neck.rotation.x += Math.sin(t * 9.5) * 0.10;
              }
              if (b.head) {
                b.head.rotation.x += Math.sin(t * 9.5) * 0.14;
                b.head.rotation.y += Math.sin(t * 4.75) * 0.16;
              }
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
        }
      });
    }

    triggerRemoteWeaponMuzzle(senderId, shotData) {
      const p = this.remotePlayers.get(senderId);
      if (p) {
        if (p.muzzleLight) {
          p.muzzleLight.intensity = 4.0;
          setTimeout(() => {
            if (p.muzzleLight) p.muzzleLight.intensity = 0;
          }, 60);
        }
        if (p.muzzleSprite) {
          p.muzzleSprite.material.opacity = 0.95;
          p.muzzleSprite.material.rotation = Math.random() * Math.PI * 2;
          setTimeout(() => {
            if (p.muzzleSprite) p.muzzleSprite.material.opacity = 0;
          }, 50);
        }
      }
    }
  }

  window.MuseumMultiplayer = MuseumMultiplayer;
})();
