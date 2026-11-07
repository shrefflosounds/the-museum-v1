// The Museum - Robust High-Performance Multiplayer Engine (WebSocket Relay)
(function() {
  class MuseumMultiplayer {
    constructor(game) {
      this.game = game;
      this.client = null;
      this.isHost = false;
      this.roomCode = null;
      this.clientId = 'user_' + Math.random().toString(36).substr(2, 9);
      this.remotePlayers = new Map(); // clientId -> remote player object
      this.tickInterval = null;
      this.broadcastRate = 30; // 30Hz
      this.onPlayerJoined = null;
      this.characterData = [
        { name: 'The Animal', file: 'the-animal.glb' },
        { name: 'The Earth', file: 'the-man.glb' },
        { name: 'Sand', file: 'sand.glb' },
        { name: 'Cook', file: 'cook.glb' },
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

    generateCode(len = 4) {
      const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
      let code = '';
      for (let i = 0; i < len; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return code;
    }

    getTopic() {
      return 'museum/exhibition/' + this.roomCode;
    }

    initHost(onReady, onError) {
      this.cleanup();
      this.isHost = true;
      const code = this.generateCode(4);
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
      console.log('[Multiplayer] Connecting to broker:', brokerUrl, 'for room:', code);

      try {
        if (typeof mqtt === 'undefined') {
          console.error('[Multiplayer] MQTT library not loaded');
          if (onError) onError({ message: 'Multiplayer library missing.' });
          return;
        }

        const client = mqtt.connect(brokerUrl, {
          clientId: this.clientId + '_' + Math.random().toString(16).substr(2, 6),
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
              p.flashlight.visible = !!data.fl;
            }
          } else {
            this.spawnRemotePlayer(data.sender, data.charIdx || 0, { x: data.x, y: data.y, z: data.z });
          }
          break;
        }

        case 'relic_pickup':
          if (this.game && typeof this.game.onRemoteRelicCollected === 'function') {
            this.game.onRemoteRelicCollected(data.relicIndex);
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

        case 'ammo_pickup':
          if (this.game && typeof this.game.onRemoteAmmoPickup === 'function') {
            this.game.onRemoteAmmoPickup(data.index);
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
      this.publish({
        type: 'game_state_sync',
        relicStates: relicStates,
        relicsCollected: this.game.relicsCollected || 0
      });
    }

    startNetworkLoop() {
      if (this.tickInterval) clearInterval(this.tickInterval);
      this.sendHello();
      this.tickInterval = setInterval(() => {
        this.sendLocalTransform();
        if (this.isHost) {
          this.sendCuratorState();
          this.sendStatuesState();
          this.sendCratesState();
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
      if (this.game.isSprinting && (this.game.keys && (this.game.keys['KeyW'] || this.game.keys['KeyS'] || this.game.keys['KeyA'] || this.game.keys['KeyD']))) {
        anim = 'Run';
      } else if (this.game.keys && (this.game.keys['KeyW'] || this.game.keys['KeyS'] || this.game.keys['KeyA'] || this.game.keys['KeyD'])) {
        anim = 'Walk';
      }

      this.publish({
        type: 'transform',
        charIdx: this.game.selectedPlayerCharacter,
        x: Number(this.game.camera.position.x.toFixed(3)),
        y: Number((this.game.camera.position.y - 1.6).toFixed(3)),
        z: Number(this.game.camera.position.z.toFixed(3)),
        yaw: Number(this.game.camera.rotation.y.toFixed(3)),
        pitch: Number(this.game.camera.rotation.x.toFixed(3)),
        anim: anim,
        fl: this.game.flashlight ? this.game.flashlight.intensity > 0 : true
      });
    }

    sendCuratorState() {
      if (!this.isHost || !this.game || !this.game.smitty) return;
      const s = this.game.smitty;
      this.publish({
        type: 'curator_sync',
        x: Number(s.position.x.toFixed(3)),
        y: Number(s.position.y.toFixed(3)),
        z: Number(s.position.z.toFixed(3)),
        yaw: Number(s.rotation.y.toFixed(3)),
        state: this.game.smittyState || 'patrol',
        visible: s.visible
      });
    }

    notifyRelicCollected(relicIndex) {
      this.publish({
        type: 'relic_pickup',
        relicIndex: relicIndex
      });
    }

    sendStatuesState() {
      if (!this.isHost || !this.game || !this.game.statues || this.game.statues.length === 0) return;
      const statueData = [];
      this.game.statues.forEach((s, idx) => {
        statueData.push({
          i: idx,
          x: Number(s.x.toFixed(3)),
          y: Number(s.y.toFixed(3)),
          z: Number(s.z.toFixed(3)),
          yaw: Number(s.yaw.toFixed(3)),
          state: s.aiState || 'IDLE',
          anim: s.currentAnim || 'idle',
          playing: !!s.isPlayingAudio
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
        // Only send if moving, held, or collapsed to save bandwidth
        if (c.isHeld || c.isCollapsed || Math.abs(c.vx) > 0.02 || Math.abs(c.vz) > 0.02) {
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
        flashlight: null
      };

      group.position.copy(remoteData.targetPos);
      if (this.game.scene) {
        this.game.scene.add(group);
      }
      this.remotePlayers.set(id, remoteData);

      // Flashlight
      const spot = new THREE.SpotLight(0xfff1cf, 2.5, 30, Math.PI / 5, 0.45, 1.2);
      spot.position.set(0, 1.4, 0);
      const spotTarget = new THREE.Object3D();
      spotTarget.position.set(0, 1.4, -5);
      group.add(spot);
      group.add(spotTarget);
      spot.target = spotTarget;
      remoteData.flashlight = spot;

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
          remoteData.mixer = new THREE.AnimationMixer(model);

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

        // Update animation mixer
        if (p.mixer) {
          p.mixer.update(delta);
          const wantedAction = p.actions[p.anim] || p.actions.Idle;
          if (wantedAction && wantedAction !== p.currentAction) {
            if (p.currentAction) p.currentAction.fadeOut(0.2);
            wantedAction.reset().fadeIn(0.2).play();
            p.currentAction = wantedAction;
          }
        }
      });
    }
  }

  window.MuseumMultiplayer = MuseumMultiplayer;
})();
