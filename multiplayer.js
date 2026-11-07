// The Museum - Robust WebRTC Multiplayer Engine
(function() {
  class MuseumMultiplayer {
    constructor(game) {
      this.game = game;
      this.peer = null;
      this.isHost = false;
      this.roomCode = null;
      this.connections = new Map(); // peerId -> DataConnection
      this.remotePlayers = new Map(); // peerId -> remote player object
      this.peerId = null;
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

      // Robust STUN servers for WebRTC cross-network NAT punchthrough
      this.iceServers = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
        { urls: 'stun:stun.cloudflare.com:3478' }
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

    formatPeerId(code) {
      // Use clean standard alphanumeric identifier prefix
      return 'themuseum-' + code.toUpperCase().trim();
    }

    initHost(onReady, onError) {
      this.cleanup();
      this.isHost = true;
      const code = this.generateCode(4);
      this.roomCode = code;
      const peerId = this.formatPeerId(code);

      console.log('[Multiplayer Host] Initializing room:', code, 'with Peer ID:', peerId);

      try {
        this.peer = new Peer(peerId, {
          debug: 1,
          config: { iceServers: this.iceServers }
        });

        this.peer.on('open', (id) => {
          console.log('[Multiplayer Host] Peer server registered ID:', id);
          this.peerId = id;
          if (onReady) onReady(code);
        });

        this.peer.on('connection', (conn) => {
          console.log('[Multiplayer Host] Incoming connection from client:', conn.peer);
          this.setupConnection(conn);
          if (this.onPlayerJoined) {
            this.onPlayerJoined(conn.peer);
          }
        });

        this.peer.on('error', (err) => {
          console.warn('[Multiplayer Host Error]', err);
          if (err.type === 'unavailable-id') {
            console.log('[Multiplayer Host] ID unavailable, trying fresh code...');
            this.initHost(onReady, onError);
          } else if (onError) {
            onError(err);
          }
        });
      } catch (err) {
        console.error('[Multiplayer Host Exception]', err);
        if (onError) onError(err);
      }
    }

    initClient(code, onReady, onError) {
      this.cleanup();
      this.isHost = false;
      this.roomCode = code.toUpperCase().trim();
      const hostPeerId = this.formatPeerId(this.roomCode);

      console.log('[Multiplayer Client] Connecting to host:', hostPeerId);

      try {
        this.peer = new Peer({
          debug: 1,
          config: { iceServers: this.iceServers }
        });

        let finished = false;
        let connectionTimeout = setTimeout(() => {
          if (!finished) {
            finished = true;
            console.warn('[Multiplayer Client] Connection timed out after 14s.');
            if (onError) onError({ message: 'Host connection timed out. Make sure host is in lobby or in game.' });
          }
        }, 14000);

        this.peer.on('open', (id) => {
          console.log('[Multiplayer Client] Registered client ID:', id);
          this.peerId = id;

          const conn = this.peer.connect(hostPeerId, {
            reliable: false
          });

          conn.on('open', () => {
            if (finished) return;
            finished = true;
            clearTimeout(connectionTimeout);
            console.log('[Multiplayer Client] Connected successfully to host:', hostPeerId);
            this.setupConnection(conn);
            if (onReady) onReady(this.roomCode);
          });

          conn.on('error', (err) => {
            if (finished) return;
            finished = true;
            clearTimeout(connectionTimeout);
            console.warn('[Multiplayer Client Conn Error]', err);
            if (onError) onError(err);
          });

          conn.on('close', () => {
            console.log('[Multiplayer Client Conn Closed]');
          });
        });

        this.peer.on('error', (err) => {
          if (finished) return;
          finished = true;
          clearTimeout(connectionTimeout);
          console.warn('[Multiplayer Client Peer Error]', err);
          if (onError) onError(err);
        });
      } catch (err) {
        console.error('[Multiplayer Client Exception]', err);
        if (onError) onError(err);
      }
    }

    setupConnection(conn) {
      this.connections.set(conn.peer, conn);

      conn.on('data', (data) => {
        this.handleMessage(conn.peer, data);
      });

      conn.on('close', () => {
        console.log('[Conn Closed for peer]', conn.peer);
        this.removeRemotePlayer(conn.peer);
        this.connections.delete(conn.peer);
      });

      conn.on('error', (e) => {
        console.warn('[Conn Error for peer]', conn.peer, e);
        this.removeRemotePlayer(conn.peer);
        this.connections.delete(conn.peer);
      });

      // Send initial greeting
      this.sendHello(conn);

      // If host, send current world state to new player
      if (this.isHost) {
        this.syncFullGameState(conn);
      }
    }

    sendHello(targetConn = null) {
      const charIdx = this.game.selectedPlayerCharacter || 0;
      const packet = {
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
      };

      if (targetConn && targetConn.open) {
        try { targetConn.send(packet); } catch(e) {}
      } else {
        this.broadcast(packet);
      }
    }

    syncFullGameState(targetConn) {
      if (!this.game) return;
      const relicStates = [];
      if (this.game.relics) {
        this.game.relics.forEach((r) => {
          relicStates.push({ id: r.id, collected: !!r.collected });
        });
      }
      const packet = {
        type: 'game_state_sync',
        relicStates: relicStates,
        relicsCollected: this.game.relicsCollected || 0
      };
      if (targetConn && targetConn.open) {
        try { targetConn.send(packet); } catch(e) {}
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
                const targetConn = this.connections.get(senderId);
                if (targetConn && targetConn.open) {
                  try {
                    targetConn.send({
                      type: 'hello',
                      fromPeer: otherId,
                      characterIndex: p.characterIndex,
                      pos: p.targetPos,
                      rot: { yaw: p.targetYaw, pitch: p.targetPitch }
                    });
                  } catch(e) {}
                }
              }
            });
            // Also notify other clients of new arrival
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
      this.sendHello();
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
      if (this.game.scene) {
        this.game.scene.add(group);
      }
      this.remotePlayers.set(peerId, remoteData);

      // Flashlight
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
          console.warn('[Remote Player Load Error]', e);
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

    cleanup() {
      this.stopNetworkLoop();
      this.remotePlayers.forEach((p, peerId) => {
        this.removeRemotePlayer(peerId);
      });
      this.connections.forEach((conn) => {
        try { conn.close(); } catch(e) {}
      });
      this.connections.clear();
      if (this.peer) {
        try { this.peer.destroy(); } catch(e) {}
        this.peer = null;
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
