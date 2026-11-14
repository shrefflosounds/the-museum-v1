/**
 * FinalFight — companion protector (internal name only; never shown in-game).
 * Spawns beside the player after the "All Relics Found" cutscene, escorts them to the
 * front doors, fights off statues in the way, kills The Curator, and behaves like a
 * lively creature (hopping on/off benches & plinths, scouting ahead, taking the lead).
 * Uses the game's nav graph + obstacle grid so it understands the map (rooms, furniture, stairs).
 */
(function () {
  'use strict';

  const EXIT = { x: -10.0, z: 26.2, floor: 0 };   // just inside the front doors
  const RADIUS = 0.45;
  const WALK_SPEED = 3.2;
  const RUN_SPEED = 9.4;          // must keep up with a sprinting player (8.6)
  const GRAVITY = 22;

  const rand = (a, b) => a + Math.random() * (b - a);
  const angDiff = (a, b) => {
    let d = b - a;
    while (d < -Math.PI) d += Math.PI * 2;
    while (d > Math.PI) d -= Math.PI * 2;
    return d;
  };

  class FinalFightCompanion {
    constructor(game) {
      this.g = game;
      this.loaded = false;
      this.active = false;
      this.pos = new THREE.Vector3();
      this.floor = 0;
      this.yaw = 0;
      this.stairState = { active: null, baseFloor: 0 };
      this.mode = 'FOLLOW';
      this.modeTimer = 0;
      this.path = [];
      this.pathIdx = 0;
      this.pathGoalKey = null;
      this.replanTimer = 0;
      this.stuckTimer = 0;
      this.route = null;           // player -> exit route (refined points)
      this.routeTimer = 0;
      this.hopCooldown = rand(6, 12);
      this.scoutCooldown = rand(14, 22);
      this.leadCooldown = rand(5, 10);
      this.attack = null;          // { target, kind, t, struck }
      this.statueCooldowns = new Map();
      this.jump = null;            // ballistic jump state
      this.lookTimer = 0;
      this.platformTop = null;     // y of platform we're standing on
      this.currentAnim = null;
      this.actions = {};
      this._load();
    }

    // ------------------------------------------------------------------ loading
    _load() {
      const loader = new THREE.GLTFLoader();
      const v = window._ASSET_VERSION || Date.now();
      loader.load(`assets/finalfight.glb?v=${v}`, (gltf) => {
        const model = gltf.scene;
        model.traverse((c) => {
          if (c.isMesh) {
            c.castShadow = true;
            c.frustumCulled = false;
          }
        });
        // Wrapper so we can scale/rotate freely
        this.root = new THREE.Group();
        this.root.name = 'FinalFight';
        this.root.add(model);
        this.model = model;

        // Height: a bit taller than The Curator
        const box = new THREE.Box3().setFromObject(model);
        const modelH = Math.max(0.1, box.max.y - box.min.y);
        let curatorH = 2.3 * 1.2;
        if (this.g.smittyMesh) {
          const xr = this.g.smittyXrayGroup;
          const wasVis = xr ? xr.visible : false;
          if (xr) this.g.smittyMesh.remove(xr);
          const sb = new THREE.Box3().setFromObject(this.g.smittyMesh);
          if (xr) { this.g.smittyMesh.add(xr); xr.visible = wasVis; }
          const h = sb.max.y - sb.min.y;
          if (h > 0.8 && h < 6) curatorH = h;
        }
        const s = (curatorH * 1.15) / modelH;
        model.scale.setScalar(s);
        model.position.y = -box.min.y * s;
        this.height = curatorH * 1.15;

        this.mixer = new THREE.AnimationMixer(model);
        gltf.animations.forEach((clip) => {
          const n = clip.name.toLowerCase();
          const a = this.mixer.clipAction(clip);
          if (n.includes('run')) this.actions.Run = a;
          else if (n.includes('walk')) this.actions.Walk = a;
          else if (n.includes('idle') || n.includes('slither')) this.actions.Idle = a;
        });
        this.root.visible = false;
        this.g.scene.add(this.root);
        this.loaded = true;
        if (this._pendingSpawn) this.spawn();
      }, undefined, (err) => console.error('[FinalFight] load failed', err));
    }

    _play(name, timeScale = 1) {
      const a = this.actions[name];
      if (!a) return;
      a.timeScale = timeScale;
      if (this.currentAnim === name) return;
      const prev = this.actions[this.currentAnim];
      a.reset().play();
      if (prev) prev.crossFadeTo(a, 0.22, false);
      this.currentAnim = name;
    }

    // ------------------------------------------------------------------ spawn
    spawn() {
      if (!this.loaded) { this._pendingSpawn = true; return; }
      this._pendingSpawn = false;
      const g = this.g;
      if (!g.navGrid && g.navNodes && g.navNodes.length) g.buildObstacleGrid();
      const fl = g.playerFloor;
      const yaw = g.playerYaw || 0;
      // forward vector of camera: (-sin, -cos)
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      const rx = Math.cos(yaw), rz = -Math.sin(yaw);
      const candidates = [
        [fx * 2.6 + rx * 1.2, fz * 2.6 + rz * 1.2],
        [fx * 2.6 - rx * 1.2, fz * 2.6 - rz * 1.2],
        [rx * 2.2, rz * 2.2], [-rx * 2.2, -rz * 2.2],
        [fx * 1.8, fz * 1.8], [-fx * 2.0, -fz * 2.0]
      ];
      let spot = null;
      for (const [ox, oz] of candidates) {
        const p = { x: g.playerPos.x + ox, z: g.playerPos.z + oz };
        if (!g.gridBlocked(fl, p.x, p.z) && g.gridLOS(fl, g.playerPos, p)) { spot = p; break; }
      }
      if (!spot) {
        const f = g.gridNearestFree(fl, g.playerPos.x + fx * 2, g.playerPos.z + fz * 2, 10);
        spot = f ? { x: g.navGrid.minX + f.i * g.navGrid.CELL, z: g.navGrid.minZ + f.j * g.navGrid.CELL }
                 : { x: g.playerPos.x + rx * 1.5, z: g.playerPos.z + rz * 1.5 };
      }
      this.floor = fl;
      this.stairState = { active: null, baseFloor: fl };
      this.pos.set(spot.x, fl * CONFIG_FH(), spot.z);
      this.yaw = Math.atan2(g.playerPos.x - spot.x, g.playerPos.z - spot.z);
      this.root.position.copy(this.pos);
      this.root.rotation.y = this.yaw;
      this.root.visible = true;
      this.active = true;
      this.mode = 'GREET';
      this.modeTimer = 1.4;
      // little "arrival" hop
      this._startJump(this.pos.x, this.pos.z, this.pos.y, 0.55, 0.5);
      this._play('Idle');
    }

    // ------------------------------------------------------------------ helpers
    _playerFootY() {
      const g = this.g;
      return g.playerFloor * CONFIG_FH();
    }

    _dist2D(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }

    _refreshRoute() {
      // Route the PLAYER should take to the exit; used for leading & scouting
      const g = this.g;
      try {
        const s = g.findNearestNavNode(g.playerPos, g.playerFloor);
        const e = g.findNearestNavNode(EXIT, EXIT.floor);
        const nodes = g.findShortestPath(s, e);
        const pts = g.refineNavPath(nodes, g.playerPos, g.playerFloor) || [];
        this.route = pts.length ? pts : [EXIT];
      } catch (err) {
        this.route = [EXIT];
      }
    }

    // point along route `d` metres ahead of the player
    _routePointAhead(d) {
      const g = this.g;
      if (!this.route || !this.route.length) return null;
      let prev = { x: g.playerPos.x, z: g.playerPos.z, floor: g.playerFloor };
      let acc = 0;
      for (const p of this.route) {
        const fl = (p.floor !== undefined) ? p.floor : prev.floor;
        const seg = Math.hypot(p.x - prev.x, p.z - prev.z);
        if (acc + seg >= d) {
          const t = seg > 0 ? (d - acc) / seg : 0;
          return { x: prev.x + (p.x - prev.x) * t, z: prev.z + (p.z - prev.z) * t, floor: fl };
        }
        acc += seg;
        prev = { x: p.x, z: p.z, floor: fl };
      }
      return { x: prev.x, z: prev.z, floor: prev.floor };
    }

    _freeNear(fl, x, z) {
      const g = this.g;
      if (!g.gridBlocked(fl, x, z)) return { x, z };
      const f = g.gridNearestFree(fl, x, z, 8);
      if (!f) return { x, z };
      return { x: g.navGrid.minX + f.i * g.navGrid.CELL, z: g.navGrid.minZ + f.j * g.navGrid.CELL };
    }

    // ------------------------------------------------------------------ movement
    _moveTo(goal, goalFloor, speed, delta) {
      const g = this.g;
      let tx = goal.x, tz = goal.z;
      const sameFloor = goalFloor === this.floor;
      const direct = sameFloor && !g.isInStairwell(this.pos) && g.gridLOS(this.floor, this.pos, goal);

      if (!direct) {
        this.replanTimer -= delta;
        const key = goalFloor + ':' + Math.round(goal.x / 2) + ':' + Math.round(goal.z / 2);
        if (!this.path.length || this.pathIdx >= this.path.length || (this.replanTimer <= 0 && key !== this.pathGoalKey)) {
          const s = g.findNearestNavNode(this.pos, this.floor);
          const e = g.findNearestNavNode(goal, goalFloor);
          this.path = g.refineNavPath(g.findShortestPath(s, e), this.pos, this.floor) || [];
          if (sameFloor) this.path.push({ x: goal.x, z: goal.z, floor: goalFloor, refined: true });
          this.pathIdx = 0;
          this.pathGoalKey = key;
          this.replanTimer = 0.7;
          // skip a first node that lies behind us
          if (this.path.length > 1 && this.path[1].floor === this.floor &&
              g.gridLOS(this.floor, this.pos, this.path[1])) this.pathIdx = 1;
        }
        let wp = this.path[this.pathIdx];
        if (wp) {
          // look-ahead string pulling
          while (this.pathIdx < this.path.length - 1) {
            const nxt = this.path[this.pathIdx + 1];
            if (nxt.floor === this.floor && wp.floor === this.floor && !g.isInStairwell(this.pos) &&
                g.gridLOS(this.floor, this.pos, nxt)) { this.pathIdx++; wp = nxt; } else break;
          }
          if (Math.hypot(this.pos.x - wp.x, this.pos.z - wp.z) < (wp.refined ? 0.55 : 0.95) && this.pathIdx < this.path.length - 1) {
            this.pathIdx++;
            wp = this.path[this.pathIdx];
          }
          tx = wp.x; tz = wp.z;
        }
      } else {
        this.path = [];
      }

      const dx = tx - this.pos.x, dz = tz - this.pos.z;
      const d = Math.hypot(dx, dz);
      let moved = 0;
      if (d > 0.04) {
        const vx = dx / d, vz = dz / d;
        const targetYaw = Math.atan2(vx, vz);
        this.yaw += angDiff(this.yaw, targetYaw) * Math.min(1, delta * (speed > 5 ? 10 : 7));
        // slow down while turning sharply (natural)
        const turnPenalty = 1 - Math.min(0.6, Math.abs(angDiff(this.yaw, targetYaw)) / Math.PI);
        const step = Math.min(d, speed * turnPenalty * delta);
        const ox = this.pos.x, oz = this.pos.z;
        for (let i = 0; i < 2; i++) {
          this.pos.x += vx * step / 2;
          this.pos.z += vz * step / 2;
          g.resolveCollisions(this.pos, RADIUS, this.floor, this.pos.y + 0.05, 2.6);
        }
        moved = Math.hypot(this.pos.x - ox, this.pos.z - oz);
        if (step > 0.01 && moved < step * 0.15) {
          this.stuckTimer += delta;
          if (this.stuckTimer > 0.5) { this.path = []; this.stuckTimer = 0; }
        } else this.stuckTimer = 0;
      }
      const elev = g.updateStairwellElevation(this.pos, this.stairState, this.floor, this.pos.y);
      this.floor = elev.floor;
      this.pos.y = elev.y;
      return moved / Math.max(delta, 1e-4);
    }

    _faceTowards(x, z, delta, rate = 6) {
      const t = Math.atan2(x - this.pos.x, z - this.pos.z);
      this.yaw += angDiff(this.yaw, t) * Math.min(1, delta * rate);
    }

    // ------------------------------------------------------------------ jumping
    _startJump(toX, toZ, toY, height, dur) {
      this.jump = {
        fx: this.pos.x, fz: this.pos.z, fy: this.pos.y,
        tx: toX, tz: toZ, ty: toY, h: height, dur, t: 0
      };
    }

    _updateJump(delta) {
      const j = this.jump;
      j.t += delta;
      const k = Math.min(1, j.t / j.dur);
      this.pos.x = j.fx + (j.tx - j.fx) * k;
      this.pos.z = j.fz + (j.tz - j.fz) * k;
      this.pos.y = j.fy + (j.ty - j.fy) * k + 4 * j.h * k * (1 - k);
      if (Math.hypot(j.tx - j.fx, j.tz - j.fz) > 0.2) this._faceTowards(j.tx, j.tz, delta, 10);
      // tuck pose: lean forward mid-air, squash on landing
      const lean = Math.sin(k * Math.PI) * 0.25;
      this.model.rotation.x = lean;
      if (k >= 1) {
        this.jump = null;
        this.model.rotation.x = 0;
        this.landSquash = 0.18;
      }
    }

    // find a bench / plinth / desk top near us and near the player's route
    _findPlatform() {
      const g = this.g;
      const base = this.floor * CONFIG_FH();
      let best = null, bestScore = Infinity;
      for (const c of g.colliders) {
        if (c.type !== 'box' || c.disabled || c.isCrate || c.floor !== this.floor) continue;
        if (c.maxY === undefined || c.minY === undefined) continue;
        const h = c.maxY - base;
        if (h < 0.4 || h > 1.35 || c.minY > base + 0.1) continue;
        const w = c.maxX - c.minX, dpt = c.maxZ - c.minZ;
        if (w < 0.6 || dpt < 0.6 || w > 6 || dpt > 6) continue;
        const cx = (c.minX + c.maxX) / 2, cz = (c.minZ + c.maxZ) / 2;
        const dSelf = Math.hypot(cx - this.pos.x, cz - this.pos.z);
        const dPlayer = Math.hypot(cx - g.playerPos.x, cz - g.playerPos.z);
        if (dSelf > 9 || dPlayer > 11 || dSelf < 1.2) continue;
        // something overhead (shelf/vitrine glass)? skip tall stacks: ensure no collider above top
        let covered = false;
        for (const o of g.colliders) {
          if (o === c || o.type !== 'box' || o.floor !== this.floor || o.minY === undefined) continue;
          if (o.minY > c.maxY - 0.05 && o.minY < c.maxY + 2.4 &&
              o.minX < cx + 0.3 && o.maxX > cx - 0.3 && o.minZ < cz + 0.3 && o.maxZ > cz - 0.3) { covered = true; break; }
        }
        if (covered) continue;
        const score = dSelf + dPlayer * 0.6;
        if (score < bestScore) { bestScore = score; best = { c, cx, cz, top: c.maxY }; }
      }
      if (!best) return null;
      // approach point: free cell on the side of the platform facing us
      const c = best.c;
      const sides = [
        { x: c.minX - 0.65, z: best.cz }, { x: c.maxX + 0.65, z: best.cz },
        { x: best.cx, z: c.minZ - 0.65 }, { x: best.cx, z: c.maxZ + 0.65 }
      ].filter(p => !g.gridBlocked(this.floor, p.x, p.z));
      if (sides.length < 2) return null;
      sides.sort((a, b) => Math.hypot(a.x - this.pos.x, a.z - this.pos.z) - Math.hypot(b.x - this.pos.x, b.z - this.pos.z));
      const approach = sides[0];
      // jump-off: side closest to the player that differs from approach
      const off = sides.slice(1).sort((a, b) =>
        Math.hypot(a.x - g.playerPos.x, a.z - g.playerPos.z) - Math.hypot(b.x - g.playerPos.x, b.z - g.playerPos.z))[0];
      // land a bit further out
      const ox = off.x + (off.x - best.cx) * 0.35, oz = off.z + (off.z - best.cz) * 0.35;
      const land = g.gridBlocked(this.floor, ox, oz) ? off : { x: ox, z: oz };
      return { ...best, approach, land };
    }

    // ------------------------------------------------------------------ threats
    _curatorThreat() {
      const g = this.g;
      if (!g.smittyEnabled || !g.smittyMesh || !g.smittyPos) return null;
      if (g.smittyState === 'DEAD' || g.smittyState === 'RESPAWNING') return null;
      if (g.smittyFloor !== this.floor && g.smittyFloor !== g.playerFloor) return null;
      const dSelf = this._dist2D(this.pos, g.smittyPos);
      const dPlayer = this._dist2D(g.playerPos, g.smittyPos);
      if (g.smittyFloor === this.floor && (dSelf < 24 || dPlayer < 20)) return g.smittyPos;
      if (g.smittyFloor === g.playerFloor && dPlayer < 14) return g.smittyPos;
      return null;
    }

    _statueThreat() {
      const g = this.g;
      if (!g.statues || !g.statuesEnabled) return null;
      const now = performance.now() / 1000;
      const ahead = this._routePointAhead(6) || g.playerPos;
      let best = null, bestD = Infinity;
      for (const s of g.statues) {
        if (!s.group || !s.group.visible || s.cfg.isSilverSmitty) continue;
        if (s.floor !== g.playerFloor || s.floor !== this.floor) continue;
        if ((this.statueCooldowns.get(s) || 0) > now) continue;
        const dPlayer = Math.hypot(s.x - g.playerPos.x, s.z - g.playerPos.z);
        // distance from the statue to the player's next stretch of route
        const ax = g.playerPos.x, az = g.playerPos.z, bx = ahead.x, bz = ahead.z;
        const abx = bx - ax, abz = bz - az, L2 = abx * abx + abz * abz || 1;
        const t = Math.max(0, Math.min(1, ((s.x - ax) * abx + (s.z - az) * abz) / L2));
        const dRoute = Math.hypot(s.x - (ax + abx * t), s.z - (az + abz * t));
        const inWay = dPlayer < 3.2 || (dRoute < 1.6 && dPlayer < 9);
        if (!inWay) continue;
        if (dPlayer < bestD) { bestD = dPlayer; best = s; }
      }
      return best;
    }

    _strikeStatue(s) {
      const g = this.g;
      const dx = s.x - this.pos.x, dz = s.z - this.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      const dir = new THREE.Vector3(dx / d, 0, dz / d);
      const hit = new THREE.Vector3(s.x, s.y + 1.2, s.z);
      if (g.hitStatue) g.hitStatue(s, hit, dir);
      // shove it well out of the way (with collision so it never clips into walls)
      const shove = { x: s.x, y: s.y, z: s.z, _ignoreCollider: s.collider };
      for (let i = 0; i < 12; i++) {
        shove.x += dir.x * 0.28; shove.z += dir.z * 0.28;
        g.resolveCollisions(shove, 0.48, s.floor, s.y, 2.35);
      }
      s.x = shove.x; s.z = shove.z;
      s.group.position.set(s.x, s.y, s.z);
      if (s.collider) { s.collider.x = s.x; s.collider.z = s.z; }
      // send it off sulking in another direction
      s.navPath = null;
      s.aiState = 'IDLE';
      s.aiTimer = 4 + Math.random() * 3;
      s.idleLookYaw = Math.atan2(dir.x, dir.z);
      this.statueCooldowns.set(s, performance.now() / 1000 + 9);
      if (g.audio && g.audio.playSmittyGrowl && Math.random() < 0.35) { /* keep curator growl exclusive */ }
    }

    _strikeCurator() {
      const g = this.g;
      if (g.smittyState === 'DEAD' || g.smittyState === 'RESPAWNING') return;
      const dx = g.smittyPos.x - this.pos.x, dz = g.smittyPos.z - this.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      const dir = new THREE.Vector3(dx / d, 0, dz / d);
      const hit = new THREE.Vector3(g.smittyPos.x, g.smittyPos.y + 1.4, g.smittyPos.z);
      g.smittyHasBeenShot = true;
      g.damageSmitty((g.smittyHp || CONFIG_SMITTY_HP()) + 999, hit, dir);
      if (g.mp && g.mp.isHost && typeof g.mp.notifyCrateStatueHit === 'function') {
        // curator state propagates through normal host sync
      }
    }

    // ------------------------------------------------------------------ main update
    update(delta) {
      if (!this.active || !this.loaded) return;
      const g = this.g;
      if (g.isPlayingCutscene) return;
      if (!g.navGrid) return;

      if (this.mixer) this.mixer.update(delta);
      if (this.landSquash) {
        this.landSquash = Math.max(0, this.landSquash - delta);
        const sq = 1 - this.landSquash * 0.6;
        this.model.scale.y = this.model.scale.x * sq;
      } else if (this.model.scale.y !== this.model.scale.x) {
        this.model.scale.y = this.model.scale.x;
      }

      // Too far / lost: reappear just behind the player out of sight (keeps things natural)
      const dP = this._dist2D(this.pos, g.playerPos);
      if (!this.jump && (dP > 48 || (this.floor !== g.playerFloor && !g.isInStairwell(this.pos) && dP > 30))) {
        this._teleportBehindPlayer();
      }

      this.routeTimer -= delta;
      if (this.routeTimer <= 0) { this._refreshRoute(); this.routeTimer = 1.2; }

      // mid-air
      if (this.jump) {
        this._updateJump(delta);
        this._play(this.mode === 'HOP_OFF' ? 'Run' : 'Idle', 1.4);
        this._commit();
        return;
      }

      this.modeTimer -= delta;
      this.hopCooldown -= delta;
      this.scoutCooldown -= delta;
      this.leadCooldown -= delta;

      // ---------------- attack resolution (wind-up -> strike -> recover)
      if (this.attack) {
        const a = this.attack;
        a.t += delta;
        const tgt = a.kind === 'curator' ? g.smittyPos : a.target;
        this._faceTowards(tgt.x, tgt.z, delta, 14);
        // lunge animation via root offsets
        const k = a.t / 0.7;
        this.model.rotation.x = k < 0.45 ? -0.15 * (k / 0.45) : 0.35 * Math.max(0, 1 - (k - 0.45) / 0.55);
        if (!a.struck && a.t > 0.32) {
          a.struck = true;
          if (a.kind === 'curator') this._strikeCurator(); else this._strikeStatue(a.target);
          // small forward lunge
          const fx = Math.sin(this.yaw) * 0.5, fz = Math.cos(this.yaw) * 0.5;
          this.pos.x += fx; this.pos.z += fz;
          g.resolveCollisions(this.pos, RADIUS, this.floor, this.pos.y + 0.05, 2.6);
        }
        this._play('Run', 2.0);
        if (a.t > 0.7) { this.attack = null; this.model.rotation.x = 0; this.mode = 'FOLLOW'; this.modeTimer = rand(1, 2); }
        this._commit();
        return;
      }

      // ---------------- priorities: Curator > Statue in the way > escort behaviours
      const isCoopClient = g.mp && !g.mp.isHost && g.mp.client && g.mp.client.connected;
      const curator = isCoopClient ? null : this._curatorThreat();
      if (curator) {
        this.mode = 'HUNT';
        const d = this._dist2D(this.pos, curator);
        if (d < 2.3 && g.smittyFloor === this.floor) {
          this.attack = { kind: 'curator', t: 0, struck: false };
        } else {
          const sp = this._moveTo(curator, g.smittyFloor, RUN_SPEED * 1.05, delta);
          this._animForSpeed(sp);
        }
        this._separateFromPlayer();
        this._commit();
        return;
      }

      const statue = isCoopClient ? null : this._statueThreat();
      if (statue && this.mode !== 'ON_PLATFORM') {
        this.mode = 'FIGHT';
        const d = Math.hypot(statue.x - this.pos.x, statue.z - this.pos.z);
        if (d < 1.9) {
          this.attack = { kind: 'statue', target: statue, t: 0, struck: false };
        } else {
          const sp = this._moveTo({ x: statue.x, z: statue.z }, statue.floor, RUN_SPEED, delta);
          this._animForSpeed(sp);
        }
        this._separateFromPlayer();
        this._commit();
        return;
      }
      if (this.mode === 'HUNT' || this.mode === 'FIGHT') { this.mode = 'FOLLOW'; this.modeTimer = rand(2, 4); }

      this._escort(delta);
      this._separateFromPlayer();
      this._commit();
    }

    _escort(delta) {
      const g = this.g;
      const dP = this._dist2D(this.pos, g.playerPos);
      const playerMoving = g.keys && (g.keys['KeyW'] || g.keys['KeyA'] || g.keys['KeyS'] || g.keys['KeyD'] ||
        g.keys['w'] || g.keys['a'] || g.keys['s'] || g.keys['d'] || g.keys['ArrowUp']);
      const sameFloor = this.floor === g.playerFloor;

      // transition logic for lively behaviours
      if (this.mode === 'GREET') {
        this._faceTowards(g.playerPos.x, g.playerPos.z, delta);
        this._play('Idle');
        if (this.modeTimer <= 0) { this.mode = 'LEAD'; this.modeTimer = rand(5, 8); }
        return;
      }

      if ((this.mode === 'FOLLOW' || this.mode === 'LEAD') && sameFloor && dP < 9) {
        if (this.scoutCooldown <= 0 && playerMoving && this.route && this.route.length > 2) {
          const p = this._routePointAhead(rand(13, 19));
          if (p && p.floor === this.floor) {
            this.mode = 'SCOUT'; this.scoutTarget = this._freeNear(p.floor, p.x, p.z);
            this.modeTimer = 9; this.scoutLook = 0;
          }
          this.scoutCooldown = rand(22, 36);
        } else if (this.hopCooldown <= 0) {
          const plat = this._findPlatform();
          this.hopCooldown = plat ? rand(16, 28) : rand(4, 7);
          if (plat) { this.mode = 'TO_PLATFORM'; this.platform = plat; this.modeTimer = 7; }
        } else if (this.mode === 'FOLLOW' && this.leadCooldown <= 0 && playerMoving) {
          this.mode = 'LEAD'; this.modeTimer = rand(6, 12); this.leadCooldown = rand(10, 18);
        }
      }

      switch (this.mode) {
        case 'SCOUT': {
          if (dP > 24 || this.modeTimer <= 0) { this.mode = 'FOLLOW'; break; }
          const d = this._dist2D(this.pos, this.scoutTarget);
          if (d > 0.8 && this.scoutLook === 0) {
            this._animForSpeed(this._moveTo(this.scoutTarget, this.floor, RUN_SPEED, delta));
          } else {
            // look around: sweep left/right checking for danger
            this.scoutLook += delta;
            this.yaw += Math.sin(this.scoutLook * 2.6) * delta * 2.2;
            this._play('Idle', 1.6);
            if (this.scoutLook > 2.4 || dP < 3.5) { this.mode = 'LEAD'; this.modeTimer = rand(4, 7); }
          }
          return;
        }
        case 'TO_PLATFORM': {
          const p = this.platform;
          if (!p || this.modeTimer <= 0 || dP > 14) { this.mode = 'FOLLOW'; break; }
          const d = this._dist2D(this.pos, p.approach);
          if (d > 0.35) {
            this._animForSpeed(this._moveTo(p.approach, this.floor, RUN_SPEED * 0.8, delta));
          } else {
            this.mode = 'ON_PLATFORM';
            this.modeTimer = rand(1.2, 2.6);
            this._startJump(p.cx, p.cz, p.top, 0.75 + (p.top - this.pos.y) * 0.4, 0.5);
          }
          return;
        }
        case 'ON_PLATFORM': {
          // perched: survey the room, then leap off toward the player
          this._faceTowards(g.playerPos.x, g.playerPos.z, delta, 3);
          this.yaw += Math.sin(performance.now() * 0.004) * delta * 0.8;
          this._play('Idle', 1.3);
          if (this.modeTimer <= 0 || dP > 10) {
            const p = this.platform;
            this.mode = 'HOP_OFF';
            this._startJump(p.land.x, p.land.z, this.floor * CONFIG_FH(), 0.9, 0.6);
            this.platform = null;
          }
          return;
        }
        case 'HOP_OFF':
          this.mode = 'FOLLOW'; this.modeTimer = rand(2, 4);
          break;
      }

      // ---------------- FOLLOW / LEAD
      let target, floor;
      if (this.mode === 'LEAD') {
        if (this.modeTimer <= 0) { this.mode = 'FOLLOW'; this.modeTimer = rand(4, 8); }
        const p = this._routePointAhead(playerMoving ? 4.5 : 3.0) || g.playerPos;
        target = this._freeNear(p.floor !== undefined ? p.floor : g.playerFloor, p.x, p.z);
        floor = p.floor !== undefined ? p.floor : g.playerFloor;
      } else {
        // walk at the player's flank, slightly behind
        const yaw = g.playerYaw || 0;
        const side = (this._side = this._side || (Math.random() < 0.5 ? 1 : -1));
        const ox = Math.cos(yaw) * 1.5 * side + Math.sin(yaw) * 1.4;
        const oz = -Math.sin(yaw) * 1.5 * side + Math.cos(yaw) * 1.4;
        target = this._freeNear(g.playerFloor, g.playerPos.x + ox, g.playerPos.z + oz);
        floor = g.playerFloor;
      }

      const dT = this._dist2D(this.pos, target);
      if (floor === this.floor && dT < 0.9 && dP < 5) {
        this._faceTowards(this.mode === 'LEAD' ? (this._routePointAhead(8) || g.playerPos).x : g.playerPos.x,
                          this.mode === 'LEAD' ? (this._routePointAhead(8) || g.playerPos).z : g.playerPos.z, delta, 4);
        this._play('Idle');
        return;
      }
      // pace to match the player: walk when close, run when far
      const far = dP > 6 || floor !== this.floor || (g.isSprinting && playerMoving);
      const speed = far ? Math.min(RUN_SPEED, 5 + dP * 0.45) : WALK_SPEED + Math.min(2, dT * 0.5);
      this._animForSpeed(this._moveTo(target, floor, speed, delta));
    }

    _animForSpeed(sp) {
      if (sp < 0.25) this._play('Idle');
      else if (sp < 4.6) this._play('Walk', Math.max(0.6, sp / 2.6));
      else this._play('Run', Math.max(0.8, sp / 6.5));
    }

    _separateFromPlayer() {
      const g = this.g;
      if (this.floor !== g.playerFloor || this.jump) return;
      const dx = this.pos.x - g.playerPos.x, dz = this.pos.z - g.playerPos.z;
      const d = Math.hypot(dx, dz);
      if (d < 1.0 && d > 0.001) {
        this.pos.x += (dx / d) * (1.0 - d);
        this.pos.z += (dz / d) * (1.0 - d);
        g.resolveCollisions(this.pos, RADIUS, this.floor, this.pos.y + 0.05, 2.6);
      }
    }

    _teleportBehindPlayer() {
      const g = this.g;
      const yaw = g.playerYaw || 0;
      const fl = g.playerFloor;
      for (const dist of [5, 4, 3, 6, 2.5]) {
        const x = g.playerPos.x + Math.sin(yaw) * dist, z = g.playerPos.z + Math.cos(yaw) * dist;
        if (!g.gridBlocked(fl, x, z) && g.gridLOS(fl, g.playerPos, { x, z })) {
          this.pos.set(x, fl * CONFIG_FH(), z);
          this.floor = fl;
          this.stairState = { active: null, baseFloor: fl };
          this.path = [];
          this.mode = 'FOLLOW';
          return;
        }
      }
    }

    _commit() {
      this.root.position.set(this.pos.x, this.pos.y, this.pos.z);
      this.root.rotation.y = this.yaw;
      const g = this.g;
      this.root.visible = g.isSpectatorMode || this.floor === g.playerFloor || g.isInStairwell(this.pos) || g.isInStairwell(g.playerPos);
    }
  }

  function CONFIG_FH() { return 7.5; }
  function CONFIG_SMITTY_HP() { return 100; }

  window.FinalFightCompanion = FinalFightCompanion;
})();
