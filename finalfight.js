/**
 * FinalFight — companion protector (internal name only; never shown in-game).
 * Spawns beside the player after the "All Relics Found" cutscene, roams freely and
 * spontaneously around the museum while generally heading toward the front doors,
 * fights off statues in the way, kills The Curator, and behaves like a lively creature
 * (hopping on/off benches & plinths, scouting far ahead, wandering into side wings/rooms,
 * taking the lead, doing spontaneous hops and spins).
 * Uses the game's nav graph + obstacle grid so it understands the map (rooms, furniture, stairs).
 */
(function () {
  'use strict';

  const EXIT = { x: -10.0, z: 26.2, floor: 0 };   // just inside the front doors
  const RADIUS = 0.44;
  const WALK_SPEED = 3.8;
  const RUN_SPEED = 10.2;
  const TALL_MULTIPLIER = 1.68;                   // towering protector (~4.6m tall)

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
      this.mode = 'ROAM';
      this.modeTimer = 0;
      this.path = [];
      this.pathIdx = 0;
      this.pathGoalKey = null;
      this.replanTimer = 0;
      this.stuckTimer = 0;
      this.route = null;           // player -> exit route (refined points)
      this.routeTimer = 0;
      this.hopCooldown = rand(3.5, 7);
      this.scoutCooldown = rand(6, 12);
      this.roamCooldown = rand(4, 9);
      this.leadCooldown = rand(5, 11);
      this.quirkCooldown = rand(5, 10);
      this.attack = null;          // { target, kind, t, struck }
      this.statueCooldowns = new Map();
      this.jump = null;            // ballistic jump state
      this.roamGoal = null;
      this.roamPause = 0;
      this.roamRun = false;
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
            c.castShadow = false;
            c.frustumCulled = false;
          }
        });
        this.root = new THREE.Group();
        this.root.name = 'FinalFight';
        this.root.add(model);
        this.model = model;

        // Measure unposed mesh height
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
        const s = (curatorH * TALL_MULTIPLIER) / modelH;
        model.scale.setScalar(s);
        model.position.y = -box.min.y * s;
        this.baseScale = s;
        this.height = curatorH * TALL_MULTIPLIER;

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
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      const rx = Math.cos(yaw), rz = -Math.sin(yaw);
      const candidates = [
        [fx * 3.0 + rx * 1.4, fz * 3.0 + rz * 1.4],
        [fx * 3.0 - rx * 1.4, fz * 3.0 - rz * 1.4],
        [rx * 2.5, rz * 2.5], [-rx * 2.5, -rz * 2.5],
        [fx * 2.2, fz * 2.2], [-fx * 2.4, -fz * 2.4]
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
      this.modeTimer = 1.2;
      this._startJump(this.pos.x, this.pos.z, this.pos.y, 0.75, 0.52);
      this._play('Idle');
    }

    // ------------------------------------------------------------------ helpers
    _dist2D(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }

    _refreshRoute() {
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

    // Point along route `d` metres ahead of the player
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

    // Pick a spontaneous roam destination: either a nearby room/hallway nav node on this floor,
    // or a node ahead along the route toward the exit (including down the stairs!)
    _pickRoamGoal() {
      const g = this.g;
      if (!g.navNodes || !g.navNodes.length) return null;
      const roll = Math.random();

      // 45% chance: pick a waypoint 10–30m ahead along the route to the front door (even across stairs)
      if (roll < 0.45 && this.route && this.route.length > 1) {
        const ahead = this._routePointAhead(rand(10, 28));
        if (ahead) {
          const free = this._freeNear(ahead.floor, ahead.x + rand(-2.5, 2.5), ahead.z + rand(-2.5, 2.5));
          return { x: free.x, z: free.z, floor: ahead.floor, run: Math.random() < 0.65 };
        }
      }

      // 55% chance: pick an interesting nav node on our floor or the player's floor (galleries, wings, offices, halls)
      const targetFloor = (Math.random() < 0.75) ? g.playerFloor : this.floor;
      const candidates = g.navNodes.filter((n) => {
        if (n.floor !== targetFloor) return false;
        if (n.tag && (n.tag.includes('Mid') || n.tag.includes('Base'))) return false;
        const dSelf = Math.hypot(n.x - this.pos.x, n.z - this.pos.z);
        const dPlayer = Math.hypot(n.x - g.playerPos.x, n.z - g.playerPos.z);
        return dSelf > 5.0 && dSelf < 34.0 && dPlayer < 32.0;
      });
      if (candidates.length > 0) {
        // Weight slightly toward nodes closer to the exit or unexplored directions
        const pick = candidates[Math.floor(Math.random() * candidates.length)];
        const free = this._freeNear(pick.floor, pick.x, pick.z);
        return { x: free.x, z: free.z, floor: pick.floor, run: Math.random() < 0.55 };
      }
      return null;
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
      const inStairSelf = g.isInStairwell(this.pos) || !!this.stairState.active;
      const inStairGoal = g.isInStairwell(goal);
      const sameFloor = goalFloor === this.floor;
      // Never shortcut straight across a stairwell divider wall!
      const direct = sameFloor && !inStairSelf && !inStairGoal && g.gridLOS(this.floor, this.pos, goal);

      if (!direct) {
        this.replanTimer -= delta;
        const key = goalFloor + ':' + Math.round(goal.x / 2) + ':' + Math.round(goal.z / 2);
        if (!this.path.length || this.pathIdx >= this.path.length || (this.replanTimer <= 0 && key !== this.pathGoalKey)) {
          const s = g.findNearestNavNode(this.pos, this.floor);
          const e = g.findNearestNavNode(goal, goalFloor);
          this.path = g.refineNavPath(g.findShortestPath(s, e), this.pos, this.floor) || [];
          if (sameFloor && !inStairGoal) {
            this.path.push({ x: goal.x, z: goal.z, floor: goalFloor, refined: true });
          }
          this.pathIdx = 0;
          this.pathGoalKey = key;
          this.replanTimer = 0.7;
          // Only skip first node when completely outside stairwells
          if (this.path.length > 1 && !inStairSelf && !g.isInStairwell(this.path[0]) && !g.isInStairwell(this.path[1]) &&
              this.path[1].floor === this.floor && g.gridLOS(this.floor, this.pos, this.path[1])) {
            this.pathIdx = 1;
          }
        }
        let wp = this.path[this.pathIdx];
        if (wp) {
          // String-pull look-ahead ONLY outside stairwells so stairwell U-turns are followed faithfully
          while (this.pathIdx < this.path.length - 1) {
            const nxt = this.path[this.pathIdx + 1];
            if (!inStairSelf && !g.isInStairwell(wp) && !g.isInStairwell(nxt) &&
                nxt.floor === this.floor && wp.floor === this.floor &&
                g.gridLOS(this.floor, this.pos, nxt)) {
              this.pathIdx++;
              wp = nxt;
            } else break;
          }
          const reach = g.isInStairwell(wp) ? 0.60 : (wp.refined ? 0.55 : 0.95);
          if (Math.hypot(this.pos.x - wp.x, this.pos.z - wp.z) < reach && this.pathIdx < this.path.length - 1) {
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
        const turnPenalty = 1 - Math.min(0.55, Math.abs(angDiff(this.yaw, targetYaw)) / Math.PI);
        const step = Math.min(d, speed * turnPenalty * delta);
        const ox = this.pos.x, oz = this.pos.z;
        for (let i = 0; i < 2; i++) {
          this.pos.x += vx * step / 2;
          this.pos.z += vz * step / 2;
          // Use 2.35 collision height so standard 2.4m doorways never block a tall character
          g.resolveCollisions(this.pos, RADIUS, this.floor, this.pos.y + 0.05, 2.35);
        }
        moved = Math.hypot(this.pos.x - ox, this.pos.z - oz);
        if (step > 0.01 && moved < step * 0.15) {
          this.stuckTimer += delta;
          if (this.stuckTimer > 0.5) {
            this.path = [];
            this.stuckTimer = 0;
            if (this.mode === 'ROAM' || this.mode === 'SCOUT') this.roamGoal = null;
          }
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
    _startJump(toX, toZ, toY, height, dur, spin = 0) {
      this.jump = {
        fx: this.pos.x, fz: this.pos.z, fy: this.pos.y,
        tx: toX, tz: toZ, ty: toY, h: height, dur, t: 0,
        spin, startYaw: this.yaw
      };
    }

    _updateJump(delta) {
      const j = this.jump;
      j.t += delta;
      const k = Math.min(1, j.t / j.dur);
      this.pos.x = j.fx + (j.tx - j.fx) * k;
      this.pos.z = j.fz + (j.tz - j.fz) * k;
      this.pos.y = j.fy + (j.ty - j.fy) * k + 4 * j.h * k * (1 - k);
      if (j.spin) {
        this.yaw = j.startYaw + j.spin * k;
      } else if (Math.hypot(j.tx - j.fx, j.tz - j.fz) > 0.2) {
        this._faceTowards(j.tx, j.tz, delta, 10);
      }
      const lean = Math.sin(k * Math.PI) * 0.25;
      this.model.rotation.x = lean;
      if (k >= 1) {
        this.jump = null;
        this.model.rotation.x = 0;
        this.landSquash = 0.18;
      }
    }

    // Find a bench / plinth / desk top near us
    _findPlatform() {
      const g = this.g;
      if (g.isInStairwell(this.pos)) return null;
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
        if (dSelf > 14 || dPlayer > 24 || dSelf < 1.0) continue;
        // Skip covered vitrines / tall stacks
        let covered = false;
        for (const o of g.colliders) {
          if (o === c || o.type !== 'box' || o.floor !== this.floor || o.minY === undefined) continue;
          if (o.minY > c.maxY - 0.05 && o.minY < c.maxY + 2.4 &&
              o.minX < cx + 0.3 && o.maxX > cx - 0.3 && o.minZ < cz + 0.3 && o.maxZ > cz - 0.3) { covered = true; break; }
        }
        if (covered) continue;
        const score = dSelf + dPlayer * 0.25 + rand(-1.5, 1.5);
        if (score < bestScore) { bestScore = score; best = { c, cx, cz, top: c.maxY }; }
      }
      if (!best) return null;
      const c = best.c;
      const sides = [
        { x: c.minX - 0.65, z: best.cz }, { x: c.maxX + 0.65, z: best.cz },
        { x: best.cx, z: c.minZ - 0.65 }, { x: best.cx, z: c.maxZ + 0.65 }
      ].filter(p => !g.gridBlocked(this.floor, p.x, p.z));
      if (sides.length < 2) return null;
      sides.sort((a, b) => Math.hypot(a.x - this.pos.x, a.z - this.pos.z) - Math.hypot(b.x - this.pos.x, b.z - this.pos.z));
      const approach = sides[0];
      const off = sides[1 + Math.floor(Math.random() * (sides.length - 1))];
      const ox = off.x + (off.x - best.cx) * 0.45, oz = off.z + (off.z - best.cz) * 0.45;
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
      if (g.smittyFloor === this.floor && (dSelf < 28 || dPlayer < 24)) return g.smittyPos;
      if (g.smittyFloor === g.playerFloor && dPlayer < 18) return g.smittyPos;
      return null;
    }

    _statueThreat() {
      const g = this.g;
      if (!g.statues || !g.statuesEnabled) return null;
      const now = performance.now() / 1000;
      const ahead = this._routePointAhead(8) || g.playerPos;
      let best = null, bestD = Infinity;
      for (const s of g.statues) {
        if (!s.group || !s.group.visible || s.cfg.isSilverSmitty) continue;
        if (s.floor !== g.playerFloor && s.floor !== this.floor) continue;
        if ((this.statueCooldowns.get(s) || 0) > now) continue;
        const dPlayer = (s.floor === g.playerFloor) ? Math.hypot(s.x - g.playerPos.x, s.z - g.playerPos.z) : 999;
        const dSelf = (s.floor === this.floor) ? Math.hypot(s.x - this.pos.x, s.z - this.pos.z) : 999;
        const ax = g.playerPos.x, az = g.playerPos.z, bx = ahead.x, bz = ahead.z;
        const abx = bx - ax, abz = bz - az, L2 = abx * abx + abz * abz || 1;
        const t = Math.max(0, Math.min(1, ((s.x - ax) * abx + (s.z - az) * abz) / L2));
        const dRoute = Math.hypot(s.x - (ax + abx * t), s.z - (az + abz * t));
        // Fight statues near the player, on the route ahead, or right in FinalFight's own path while roaming!
        const inWay = dPlayer < 4.5 || (dRoute < 2.4 && dPlayer < 12) || dSelf < 3.5;
        if (!inWay) continue;
        const score = Math.min(dPlayer, dSelf);
        if (score < bestD) { bestD = score; best = s; }
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
      const shove = { x: s.x, y: s.y, z: s.z, _ignoreCollider: s.collider };
      for (let i = 0; i < 14; i++) {
        shove.x += dir.x * 0.28; shove.z += dir.z * 0.28;
        g.resolveCollisions(shove, 0.48, s.floor, s.y, 2.35);
      }
      s.x = shove.x; s.z = shove.z;
      s.group.position.set(s.x, s.y, s.z);
      if (s.collider) { s.collider.x = s.x; s.collider.z = s.z; }
      s.navPath = null;
      s.aiState = 'IDLE';
      s.aiTimer = 4 + Math.random() * 3;
      s.idleLookYaw = Math.atan2(dir.x, dir.z);
      this.statueCooldowns.set(s, performance.now() / 1000 + 8);
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
        this.model.scale.y = this.baseScale * sq;
      } else if (this.model.scale.y !== this.baseScale) {
        this.model.scale.y = this.baseScale;
      }

      // Loose leash: let FinalFight roam freely up to 65m away or a floor ahead/behind before catching up
      const dP = this._dist2D(this.pos, g.playerPos);
      const floorGap = Math.abs(this.floor - g.playerFloor);
      if (!this.jump && (dP > 68 || floorGap > 1 || (floorGap === 1 && !g.isInStairwell(this.pos) && !g.isInStairwell(g.playerPos) && dP > 44))) {
        this._teleportBehindPlayer();
      }

      this.routeTimer -= delta;
      if (this.routeTimer <= 0) { this._refreshRoute(); this.routeTimer = 1.4; }

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
      this.roamCooldown -= delta;
      this.leadCooldown -= delta;
      this.quirkCooldown -= delta;

      // ---------------- attack resolution (wind-up -> strike -> recover)
      if (this.attack) {
        const a = this.attack;
        a.t += delta;
        const tgt = a.kind === 'curator' ? g.smittyPos : a.target;
        this._faceTowards(tgt.x, tgt.z, delta, 14);
        const k = a.t / 0.65;
        this.model.rotation.x = k < 0.45 ? -0.18 * (k / 0.45) : 0.38 * Math.max(0, 1 - (k - 0.45) / 0.55);
        if (!a.struck && a.t > 0.30) {
          a.struck = true;
          if (a.kind === 'curator') this._strikeCurator(); else this._strikeStatue(a.target);
          const fx = Math.sin(this.yaw) * 0.55, fz = Math.cos(this.yaw) * 0.55;
          this.pos.x += fx; this.pos.z += fz;
          g.resolveCollisions(this.pos, RADIUS, this.floor, this.pos.y + 0.05, 2.35);
        }
        this._play('Run', 2.1);
        if (a.t > 0.65) {
          this.attack = null;
          this.model.rotation.x = 0;
          // Victory hop after knocking out a threat!
          if (Math.random() < 0.6) {
            this._startJump(this.pos.x, this.pos.z, this.pos.y, 0.65, 0.45);
          }
          this.mode = 'ROAM';
          this.modeTimer = rand(3, 6);
        }
        this._commit();
        return;
      }

      // ---------------- priorities: Curator > Statue in the way > spontaneous roam/escort
      const isCoopClient = g.mp && !g.mp.isHost && g.mp.client && g.mp.client.connected;
      this.threatScanTimer = (this.threatScanTimer || 0) - delta;
      if (this.threatScanTimer <= 0 || this.mode === 'HUNT' || this.mode === 'FIGHT') {
        this.threatScanTimer = (this.mode === 'HUNT' || this.mode === 'FIGHT') ? 0 : 0.08;
        this._cachedCurator = isCoopClient ? null : this._curatorThreat();
        this._cachedStatue = (isCoopClient || this._cachedCurator) ? null : this._statueThreat();
      }
      const curator = this._cachedCurator;
      if (curator) {
        this.mode = 'HUNT';
        const d = this._dist2D(this.pos, curator);
        if (d < 2.4 && g.smittyFloor === this.floor) {
          this.attack = { kind: 'curator', t: 0, struck: false };
        } else {
          const sp = this._moveTo(curator, g.smittyFloor, RUN_SPEED * 1.08, delta);
          this._animForSpeed(sp);
        }
        this._separateFromPlayer();
        this._commit();
        return;
      }

      const statue = this._cachedStatue;
      if (statue && this.mode !== 'ON_PLATFORM') {
        this.mode = 'FIGHT';
        const d = Math.hypot(statue.x - this.pos.x, statue.z - this.pos.z);
        if (d < 2.0 && statue.floor === this.floor) {
          this.attack = { kind: 'statue', target: statue, t: 0, struck: false };
        } else {
          const sp = this._moveTo({ x: statue.x, z: statue.z }, statue.floor, RUN_SPEED, delta);
          this._animForSpeed(sp);
        }
        this._separateFromPlayer();
        this._commit();
        return;
      }
      if (this.mode === 'HUNT' || this.mode === 'FIGHT') {
        this.mode = 'ROAM';
        this.modeTimer = rand(3, 7);
      }

      this._behave(delta);
      this._separateFromPlayer();
      this._commit();
    }

    _behave(delta) {
      const g = this.g;
      const dP = this._dist2D(this.pos, g.playerPos);
      const playerMoving = g.keys && (g.keys['KeyW'] || g.keys['KeyA'] || g.keys['KeyS'] || g.keys['KeyD'] ||
        g.keys['ArrowUp'] || g.keys['ArrowDown'] || g.keys['ArrowLeft'] || g.keys['ArrowRight']);
      const sameFloor = this.floor === g.playerFloor;
      const inStair = g.isInStairwell(this.pos) || !!this.stairState.active;

      if (this.mode === 'GREET') {
        this._faceTowards(g.playerPos.x, g.playerPos.z, delta);
        this._play('Idle');
        if (this.modeTimer <= 0) {
          this.mode = 'LEAD';
          this.modeTimer = rand(5, 9);
        }
        return;
      }

      // If the player got far away (>26m) or changed floors while we're in a room, head back toward them / their route
      if ((dP > 26 || (!sameFloor && !inStair && dP > 16)) && this.mode !== 'ON_PLATFORM' && this.mode !== 'REJOIN') {
        this.mode = 'REJOIN';
        this.modeTimer = rand(6, 10);
      }

      // Spontaneous mid-stride hop or 360 spin while roaming in open galleries
      if (!inStair && this.quirkCooldown <= 0 && (this.mode === 'ROAM' || this.mode === 'LEAD' || this.mode === 'SCOUT')) {
        this.quirkCooldown = rand(7, 15);
        if (Math.random() < 0.55) {
          const fx = Math.sin(this.yaw) * 1.4, fz = Math.cos(this.yaw) * 1.4;
          const tx = this.pos.x + fx, tz = this.pos.z + fz;
          if (!g.gridBlocked(this.floor, tx, tz)) {
            this._startJump(tx, tz, this.pos.y, rand(0.6, 0.95), 0.48, Math.random() < 0.35 ? Math.PI * 2 : 0);
            return;
          }
        }
      }

      // Spontaneous transitions between Roam, Scout Ahead, Platform Hop, Lead, and Brief Check-In
      if (!inStair && (this.mode === 'ROAM' || this.mode === 'LEAD' || this.mode === 'CHECK_IN')) {
        if (this.hopCooldown <= 0) {
          const plat = this._findPlatform();
          this.hopCooldown = plat ? rand(9, 17) : rand(3, 6);
          if (plat) {
            this.mode = 'TO_PLATFORM';
            this.platform = plat;
            this.modeTimer = 8;
          }
        } else if (this.scoutCooldown <= 0 && this.route && this.route.length > 1) {
          const p = this._routePointAhead(rand(15, 28));
          if (p) {
            this.mode = 'SCOUT';
            this.scoutTarget = { ...this._freeNear(p.floor, p.x, p.z), floor: p.floor };
            this.modeTimer = 11;
            this.scoutLook = 0;
            this.scoutCooldown = rand(14, 24);
          }
        } else if (this.roamCooldown <= 0 && this.mode !== 'ROAM') {
          this.roamGoal = this._pickRoamGoal();
          if (this.roamGoal) {
            this.mode = 'ROAM';
            this.modeTimer = rand(8, 15);
            this.roamPause = 0;
            this.roamCooldown = rand(8, 15);
          }
        }
      }

      switch (this.mode) {
        case 'SCOUT': {
          if (!this.scoutTarget || this.modeTimer <= 0) {
            this.mode = 'ROAM';
            this.roamGoal = this._pickRoamGoal();
            this.modeTimer = rand(6, 12);
            break;
          }
          const d = this._dist2D(this.pos, this.scoutTarget);
          if ((d > 1.0 || this.floor !== this.scoutTarget.floor) && this.scoutLook === 0) {
            this._animForSpeed(this._moveTo(this.scoutTarget, this.scoutTarget.floor, RUN_SPEED, delta));
          } else {
            this.scoutLook += delta;
            this.yaw += Math.sin(this.scoutLook * 3.0) * delta * 2.5;
            this._play('Idle', 1.6);
            if (this.scoutLook > 2.2) {
              this.mode = 'ROAM';
              this.roamGoal = this._pickRoamGoal();
              this.modeTimer = rand(6, 11);
            }
          }
          return;
        }

        case 'TO_PLATFORM': {
          const p = this.platform;
          if (!p || this.modeTimer <= 0 || this.floor !== p.c.floor) {
            this.mode = 'ROAM';
            break;
          }
          const d = this._dist2D(this.pos, p.approach);
          if (d > 0.42) {
            this._animForSpeed(this._moveTo(p.approach, this.floor, RUN_SPEED * 0.85, delta));
          } else {
            this.mode = 'ON_PLATFORM';
            this.modeTimer = rand(1.4, 3.0);
            this._startJump(p.cx, p.cz, p.top, 0.85 + (p.top - this.pos.y) * 0.4, 0.52);
          }
          return;
        }

        case 'ON_PLATFORM': {
          const p = this.platform;
          this._faceTowards(g.playerPos.x, g.playerPos.z, delta, 3);
          this.yaw += Math.sin(performance.now() * 0.0045) * delta * 1.1;
          this._play('Idle', 1.35);
          if (this.modeTimer <= 0 || dP > 18) {
            this.mode = 'HOP_OFF';
            this._startJump(p.land.x, p.land.z, this.floor * CONFIG_FH(), 1.0, 0.58);
            this.platform = null;
          }
          return;
        }

        case 'HOP_OFF': {
          this.mode = Math.random() < 0.65 ? 'ROAM' : 'LEAD';
          this.roamGoal = this._pickRoamGoal();
          this.modeTimer = rand(6, 11);
          break;
        }

        case 'REJOIN': {
          // Run back until within ~9m of the player or ahead of them on the route, then resume roaming/leading
          const ahead = this._routePointAhead(6) || g.playerPos;
          const goalFloor = ahead.floor !== undefined ? ahead.floor : g.playerFloor;
          const sp = this._moveTo(ahead, goalFloor, RUN_SPEED, delta);
          this._animForSpeed(sp);
          if ((this.floor === g.playerFloor && dP < 9.5) || this.modeTimer <= 0) {
            this.mode = Math.random() < 0.5 ? 'LEAD' : 'ROAM';
            this.roamGoal = this._pickRoamGoal();
            this.modeTimer = rand(6, 12);
          }
          return;
        }

        case 'ROAM': {
          if (!this.roamGoal || this.modeTimer <= 0) {
            this.roamGoal = this._pickRoamGoal();
            this.roamPause = 0;
            this.modeTimer = rand(7, 14);
            if (!this.roamGoal) { this.mode = 'LEAD'; this.modeTimer = rand(5, 9); break; }
          }
          const d = this._dist2D(this.pos, this.roamGoal);
          if (d > 1.1 || this.floor !== this.roamGoal.floor) {
            const spd = this.roamGoal.run ? RUN_SPEED * 0.92 : WALK_SPEED * 1.25;
            this._animForSpeed(this._moveTo(this.roamGoal, this.roamGoal.floor, spd, delta));
          } else {
            // Reached roam spot: look around curiously for a moment, then pick a new adventure
            this.roamPause = (this.roamPause || 0) + delta;
            this.yaw += Math.sin(this.roamPause * 2.4) * delta * 1.8;
            this._play('Idle', 1.3);
            if (this.roamPause > rand(1.0, 2.2)) {
              const nextRoll = Math.random();
              if (nextRoll < 0.50) {
                this.roamGoal = this._pickRoamGoal();
                this.roamPause = 0;
              } else if (nextRoll < 0.82) {
                this.mode = 'LEAD';
                this.modeTimer = rand(5, 10);
              } else {
                this.mode = 'CHECK_IN';
                this.modeTimer = rand(3, 5);
              }
            }
          }
          return;
        }
      }

      // ---------------- LEAD (out in front toward the exit) or brief CHECK_IN near player
      let target, floor;
      if (this.mode === 'LEAD') {
        if (this.modeTimer <= 0) {
          this.mode = 'ROAM';
          this.roamGoal = this._pickRoamGoal();
          this.modeTimer = rand(7, 13);
        }
        const leadDist = playerMoving ? 8.5 : 6.0;
        const p = this._routePointAhead(leadDist) || g.playerPos;
        floor = p.floor !== undefined ? p.floor : g.playerFloor;
        target = this._freeNear(floor, p.x, p.z);
      } else {
        // Brief check-in: swing by ~4m from the player, then take off roaming again
        if (this.modeTimer <= 0) {
          this.mode = Math.random() < 0.65 ? 'ROAM' : 'LEAD';
          this.roamGoal = this._pickRoamGoal();
          this.modeTimer = rand(6, 12);
        }
        const yaw = g.playerYaw || 0;
        const side = (this._side = this._side || (Math.random() < 0.5 ? 1 : -1));
        const ox = Math.cos(yaw) * 3.2 * side - Math.sin(yaw) * 2.0;
        const oz = -Math.sin(yaw) * 3.2 * side - Math.cos(yaw) * 2.0;
        target = this._freeNear(g.playerFloor, g.playerPos.x + ox, g.playerPos.z + oz);
        floor = g.playerFloor;
      }

      const dT = this._dist2D(this.pos, target);
      if (floor === this.floor && dT < 1.1) {
        // Instead of standing tethered next to the player, immediately branch into a roam or platform hop!
        this.roamGoal = this._pickRoamGoal();
        if (this.roamGoal) {
          this.mode = 'ROAM';
          this.roamPause = 0;
          this.modeTimer = rand(7, 13);
        } else {
          const lookPt = this._routePointAhead(12) || g.playerPos;
          this._faceTowards(lookPt.x, lookPt.z, delta, 4);
          this._play('Idle');
        }
        return;
      }
      const far = dT > 5.5 || floor !== this.floor || (g.isSprinting && playerMoving);
      const speed = far ? Math.min(RUN_SPEED, 5.5 + dT * 0.45) : WALK_SPEED + Math.min(2.2, dT * 0.45);
      this._animForSpeed(this._moveTo(target, floor, speed, delta));
    }

    _animForSpeed(sp) {
      if (sp < 0.25) this._play('Idle');
      else if (sp < 4.8) this._play('Walk', Math.max(0.65, sp / 2.8));
      else this._play('Run', Math.max(0.85, sp / 6.8));
    }

    _separateFromPlayer() {
      const g = this.g;
      if (this.floor !== g.playerFloor || this.jump) return;
      const dx = this.pos.x - g.playerPos.x, dz = this.pos.z - g.playerPos.z;
      const d = Math.hypot(dx, dz);
      // Keep a comfortable 1.35m personal space bubble so FinalFight never crowds the player on stairs
      if (d < 1.35 && d > 0.001) {
        this.pos.x += (dx / d) * (1.35 - d);
        this.pos.z += (dz / d) * (1.35 - d);
        g.resolveCollisions(this.pos, RADIUS, this.floor, this.pos.y + 0.05, 2.35);
      }
    }

    _teleportBehindPlayer() {
      const g = this.g;
      const yaw = g.playerYaw || 0;
      const fl = g.playerFloor;
      for (const dist of [6, 5, 4, 7, 3]) {
        const x = g.playerPos.x + Math.sin(yaw) * dist, z = g.playerPos.z + Math.cos(yaw) * dist;
        if (!g.gridBlocked(fl, x, z) && g.gridLOS(fl, g.playerPos, { x, z })) {
          this.pos.set(x, fl * CONFIG_FH(), z);
          this.floor = fl;
          this.stairState = { active: null, baseFloor: fl };
          this.path = [];
          this.mode = 'ROAM';
          this.roamGoal = this._pickRoamGoal();
          return;
        }
      }
    }

    _commit() {
      this.root.position.set(this.pos.x, this.pos.y, this.pos.z);
      this.root.rotation.y = this.yaw;
      const g = this.g;
      const nearStair = g.isInStairwell(this.pos) || g.isNearStairwell(this.pos) ||
                        g.isInStairwell(g.playerPos) || g.isNearStairwell(g.playerPos);
      this.root.visible = g.isSpectatorMode || this.floor === g.playerFloor ||
                          (nearStair && Math.abs(this.floor - g.playerFloor) <= 1);
    }
  }

  function CONFIG_FH() { return 7.5; }
  function CONFIG_SMITTY_HP() { return 100; }

  window.FinalFightCompanion = FinalFightCompanion;
})();
