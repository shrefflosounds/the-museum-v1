1. **Enable Spectator + Third Person Mode:**
   - In `game.js`, update `isThirdPersonView()` to simply return `this.viewMode === 'third-person';`. This removes the restriction `&& !this.isSpectatorMode`.

2. **Make Statues 10% Shorter:**
   - Locate the `STATUES_CONFIG` array in `game.js` (around line 850) and modify every `targetHeight` value to be 90% of its current value (e.g., `2.25` becomes `2.025`, `2.15` becomes `1.935`, `2.10` becomes `1.89`).

3. **Improve Framerate Performance:**
   - In `game.js`'s `initThree()` method, reduce the renderer pixel ratio to improve performance when many models are visible. Instead of `this.renderer.setPixelRatio(1);` (at line 4121), use `this.renderer.setPixelRatio(window.devicePixelRatio * 0.85);`.

4. **Bathroom Statues Interaction & Doors:**
   - Modify `isRoomNavNode(n)` in `game.js` to allow restroom nodes. Add an explicit allowance: `if (t === 'doorMens_e' || t === 'doorWomens_e' || t === 'mensRestroom_c' || t === 'womensRestroom_c') return true;` before the restrictive return statement.
   - Update `this.slidingDoors` logic in `animate()` (around line 15383) so that statues' distance check triggers the doors. We need to iterate over `this.statues` as well and check distance to `d.doorZ` and `d.x`.
   - Update the statue wander logic (`updateStatues`) so that when a statue reaches a restroom center node (`mensRestroom_c` or `womensRestroom_c`), it changes its `aiState` to `BATHROOM_MIRROR` and waits for 5-10 seconds before reverting to `WANDER`.
   - Add verification step using `cat` or `grep` to ensure these specific AI modifications are correctly implemented.

5. **First Floor Full-Body Mirror (Third Person Only):**
   - Add a `WebGLRenderTarget` (e.g., 512x1024) and a `mirrorCamera` to `game.js` inside `initThree()`.
   - Based on line 4339 `this.createWall(4, yc, 1.0, t, wallH, 3.0, mainWallMat, true, fl);`, there is a solid wall at `x = 4` between `z = -0.5` and `z = 2.5` facing the East Main Hall. I will create a `THREE.Mesh` with a `THREE.MeshBasicMaterial` that uses the render target's texture and place it at `x = 4.21, y = y0 + 1.25, z = 1.0` facing East (positive X direction), inside `buildSingleFloor()` when `fl === 0`.
   - In the `animate()` loop, if `this.isThirdPersonView()` is true and player is on floor 0, calculate the mirrored position and rotation of the player's camera relative to the mirror's plane. Update `mirrorCamera`, render the scene to the `WebGLRenderTarget`, and make the mirror mesh visible. If false, hide the mirror mesh to save performance.
   - Add a verification step to ensure the rendering loop updates were successfully injected.

6. **Pre-commit Steps:**
   - Complete pre-commit steps to ensure proper testing, verification, review, and reflection are done.

7. **Run all relevant tests:**
   - Run all relevant tests (unit, integration, etc.) to ensure the changes are correct and have not introduced regressions.
