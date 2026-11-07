// The Museum - Peer-to-Peer WebRTC Multiplayer Engine
(function() {
  class MuseumMultiplayer {
    constructor(game) {
      this.game = game;
      this.peer = null;
      this.isHost = false;
      this.roomCode = null;
      this.connections = new Map(); // peerId -> DataConnection
      this.remotePlayers = new Map(); // peerId -> { modelRoot, model, mixer, actions, currentAction, flashlight, targetPos, targetRot, ... }
      this.peerId = null;
      this.tickInterval = null;
      this.broadcastRate = 30; // 30Hz
      this.characterData = [
        { name: 'The Animal', file: 'the-animal.glb' },
        { name: 'The Man', file: 'the-man.glb' },
        { name: 'Sand', file: 'sand.glb' },
        { name: 'Cook', file: 'cook.glb' },
        { name: 'The Arse', file: 'the-tundra.glb' },
        { name: 'The Clown', file: 'the-clown.glb' },
        { name: 'The Student', file: 'the-student.glb' }
      ];
    }

    generateCode(len = 4) {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let code = '';
      for (let i = 0; i < len; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return code;
    }

    initHost(onReady, onError) {
      this.isHost = true;
      const code = this.generateCode(4);
      const peerId = 'museum-' + code;
      this.roomCode = code;

      try {
        this.peer = new Peer(peerId, {
          debug: 1,
          config: {
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:global.stun.twilio.com:3478' }
            ]
          }
        });

        this.peer.on('open', (id) => {
          this.peerId = id;
          if (onReady) onReady(code);
        });

        this.peer.on('connection', (conn) => {
          this.setupConnection(conn);
        });

        this.peer.on('error', (err) => {
          console.warn('[Multiplayer Host Error]', err);
          if (err.type === 'unavailable-id') {
            // Retry with new code
            this.initHost(onReady, onError);
          } else if (onError) {
            onError(err);
          }
        });
      } catch (err) {
        if (onError) onError(err);
      }
    }

    initClient(code, onReady, onError) {
      this.isHost = false;
      this.roomCode = code.toUpperCase().trim();
      const hostPeerId = 'museum-' + this.roomCode;

      try {
        this.peer = new Peer({
          debug: 1,
          config: {
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:global.stun.twilio.com:3478' }
            ]
          }
        });

        this.peer.on('open', (id) => {
          this.peerId = id;
          const conn = this.peer.connect(hostPeerId, { reliable: false });
          conn.on('open', () => {
            this.setupConnection(conn);
            if (onReady) onReady(this.roomCode);
          });
          conn.on('error', (err) => {
            console.warn('[Multiplayer Join Error]', err);
            if (onError) onError(err);
          });
        });

        this.peer.on('error', (err) => {
          console.warn('[Multiplayer Peer Error]', err);
          if (onError) onError(err);
        });
      } catch (err) {
        if (onError) onError(err);
      }
    }

    setupConnection(conn) {
      this.connections.set(conn.peer, conn);

      conn.on('data', (data) => {
        this.handleMessage(conn.peer, data);
      });

      conn.on('close', () => {
        this.removeRemotePlayer(conn.peer);
        this.connections.delete(conn.peer);
      });

      conn.on('error', (e) => {
        console.warn('[Conn Error]', e);
        this.removeRemotePlayer(conn.peer);
        this.connections.delete(conn.peer);
      });

      // Send initial hello with chosen character
      conn.send({
        type: 'hello',
        characterIndex: this.game.selectedPlayerCharacter,
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

      // If host, send current relic state & curator state
      if (this.isHost) {
        this.syncFullGameState(conn);
      }
    }

    syncFullGameState(targetConn) {
      if (!this.game) return;
      const relicStates = [];
      if (this.game.pedestals) {
        this.game.pedestals.forEach((p, index) => {
          relicStates.push({ index, hasRelic: !!p.hasRelic });
        });
      }
      const packet = {
        type: 'game_state_sync',
        relicStates: relicStates,
        keysCollected: this.game.keysCollected || 0,
        doorsUnlocked: this.game.doorsUnlocked || false
      };
      if (targetConn) {
        targetConn.send(packet);
      } else {
        this.broadcast(packet);
      }
    }

    broadcast(data, excludePeerId = null) {
      this.connections.forEach((conn, peerId) => {
        if (peerId !== excludePeerId && conn.open) {
          try {
            conn.send(data);
          } catch(e) {}
        }
      });
    }

    handleMessage(senderId, data) {
      if (!data || !data.type) return;

      switch(data.type) {
        case 'hello':
          this.spawnRemotePlayer(senderId, data.characterIndex || 0, data.pos, data.rot);
          if (this.isHost) {
            // Forward existing players to the new player
            this.remotePlayers.forEach((p, otherId) => {
              if (otherId !== senderId && this.connections.has(senderId)) {
                this.connections.get(senderId).send({
                  type: 'hello',
                  fromPeer: otherId,
                  characterIndex: p.characterIndex,
                  pos: p.targetPos,
                  rot: p.targetRot
                });
              }
            });
            // Also notify others of this new player
            this.broadcast({
              type: 'hello',
              fromPeer: senderId,
              characterIndex: data.characterIndex || 0,
              pos: data.pos,
              rot: data.rot
            }, senderId);
          }
          break;

        case 'transform': {
          const p = this.remotePlayers.get(senderId);
          if (p) {
            p.targetPos.set(data.x, data.y, data.z);
            p.targetYaw = data.yaw;
            p.targetPitch = data.pitch;
            p.anim = data.anim || 'Idle';
            if (p.flashlight) {
              p.flashlight.visible = !!data.fl;
            }
          } else {
            this.spawnRemotePlayer(senderId, data.charIdx || 0, { x: data.x, y: data.y, z: data.z });
          }

          if (this.isHost) {
            // Host forwards transform to other clients
            data.fromPeer = senderId;
            this.broadcast(data, senderId);
          }
          break;
        }

        case 'relic_pickup':
          if (this.game && typeof this.game.onRemoteRelicCollected === 'function') {
            this.game.onRemoteRelicCollected(data.relicIndex);
          }
          if (this.isHost) {
            this.broadcast(data, senderId);
          }
          break;

        case 'curator_sync':
          if (!this.isHost && this.game && typeof this.game.onCuratorSync === 'function') {
            this.game.onCuratorSync(data);
          }
          break;

        case 'game_state_sync':
          if (!this.isHost && this.game && typeof this.game.onFullGameStateSync === 'function') {
            this.game.onFullGameStateSync(data);
          }
          break;
      }
    }

    startNetworkLoop() {
      if (this.tickInterval) clearInterval(this.tickInterval);
      this.tickInterval = setInterval(() => {
        this.sendLocalTransform();
        if (this.isHost) {
          this.sendCuratorState();
        }
      }, 1000 / this.broadcastRate);
    }

    stopNetworkLoop() {
      if (this.tickInterval) clearInterval(this.tickInterval);
      this.tickInterval = null;
    }

    sendLocalTransform() {
      if (!this.game || !this.game.camera || this.connections.size === 0) return;
      
      let anim = 'Idle';
      if (this.game.isSprinting && (this.game.keys && (this.game.keys['KeyW'] || this.game.keys['KeyS'] || this.game.keys['KeyA'] || this.game.keys['KeyD']))) {
        anim = 'Run';
      } else if (this.game.keys && (this.game.keys['KeyW'] || this.game.keys['KeyS'] || this.game.keys['KeyA'] || this.game.keys['KeyD'])) {
        anim = 'Walk';
      }

      const packet = {
        type: 'transform',
        charIdx: this.game.selectedPlayerCharacter,
        x: Number(this.game.camera.position.x.toFixed(3)),
        y: Number((this.game.camera.position.y - 1.6).toFixed(3)),
        z: Number(this.game.camera.position.z.toFixed(3)),
        yaw: Number(this.game.camera.rotation.y.toFixed(3)),
        pitch: Number(this.game.camera.rotation.x.toFixed(3)),
        anim: anim,
        fl: this.game.flashlight ? this.game.flashlight.intensity > 0 : true
      };

      this.broadcast(packet);
    }

    sendCuratorState() {
      if (!this.isHost || !this.game || !this.game.smitty) return;
      const s = this.game.smitty;
      const packet = {
        type: 'curator_sync',
        x: Number(s.position.x.toFixed(3)),
        y: Number(s.position.y.toFixed(3)),
        z: Number(s.position.z.toFixed(3)),
        yaw: Number(s.rotation.y.toFixed(3)),
        state: this.game.smittyState || 'patrol',
        visible: s.visible
      };
      this.broadcast(packet);
    }

    notifyRelicCollected(relicIndex) {
      const packet = {
        type: 'relic_pickup',
        relicIndex: relicIndex
      };
      this.broadcast(packet);
    }

    spawnRemotePlayer(peerId, characterIndex, initialPos, initialRot) {
      if (this.remotePlayers.has(peerId)) return;

      const group = new THREE.Group();
      group.name = 'remote-player-' + peerId;
      
      const char = this.characterData[characterIndex] || this.characterData[0];
      const remoteData = {
        peerId,
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
      this.game.scene.add(group);
      this.remotePlayers.set(peerId, remoteData);

      // Add remote player flashlight spotlight
      const spot = new THREE.SpotLight(0xfff1cf, 2.5, 30, Math.PI / 5, 0.45, 1.2);
      spot.position.set(0, 1.4, 0);
      const spotTarget = new THREE.Object3D();
      spotTarget.position.set(0, 1.4, -5);
      group.add(spot);
      group.add(spotTarget);
      spot.target = spotTarget;
      remoteData.flashlight = spot;

      // Load model
      const loader = new THREE.GLTFLoader();
      const cacheKey = window._ASSET_VERSION || '1.0';
      loader.load(`assets/playermodels/${char.file}?v=${cacheKey}`, (gltf) => {
        try {
          const box = new THREE.Box3().setFromObject(gltf.scene);
          const size = box.getSize(new THREE.Vector3());
          const model = gltf.scene;
          model.scale.setScalar(1.75 / size.y);
          model.position.y = -box.min.y * model.scale.y;

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
          console.warn('[Remote Player Model Load Error]', e);
        }
      });
    }

    removeRemotePlayer(peerId) {
      const p = this.remotePlayers.get(peerId);
      if (p) {
        if (p.group && this.game.scene) {
          this.game.scene.remove(p.group);
        }
        this.remotePlayers.delete(peerId);
      }
    }

    update(delta) {
      this.remotePlayers.forEach((p) => {
        if (!p.group) return;

        // Smooth position interpolation (lerp)
        p.group.position.lerp(p.targetPos, Math.min(1, delta * 14));

        // Smooth yaw rotation interpolation
        let diffYaw = p.targetYaw - p.group.rotation.y;
        while (diffYaw < -Math.PI) diffYaw += Math.PI * 2;
        while (diffYaw > Math.PI) diffYaw -= Math.PI * 2;
        p.group.rotation.y += diffYaw * Math.min(1, delta * 12);

        // Update animation
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
