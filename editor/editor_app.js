// =========================================================================
// THE MUSEUM — 3D LEVEL & WORLD EDITOR ENGINE (editor_app.js)
// =========================================================================

(function() {
  'use strict';

  class MuseumEditor {
    constructor() {
      this.canvas = document.getElementById('editor-canvas');
      this.scene = null;
      this.camera = null;
      this.renderer = null;
      this.transformControls = null;
      this.raycaster = new THREE.Raycaster();
      this.mouse = new THREE.Vector2();

      // Selected Object & Editing State
      this.selectedObject = null;
      this.highlightBox = null;
      this.undoStack = [];
      this.redoStack = [];
      this.currentFloor = 0;

      // Noclip Free-Flight Camera Controls
      this.camPos = new THREE.Vector3(-10.0, 1.8, 20.0);
      this.camYaw = 0;
      this.camPitch = 0;
      this.camSpeed = 12.0;
      this.keys = {};
      this.isRightMouseDown = false;

      // Scene Overrides Manifest
      this.overrides = {
        objects: {},
        customModels: []
      };

      // Ollama AI Assistant State
      this.ollamaConnected = false;
      this.ollamaModels = [];
      this.currentModel = '';
      this.pendingAiAction = null;

      this.init();
    }

    async init() {
      this.setupRenderer();
      this.setupEditorScene();
      this.setupTransformGizmo();
      this.setupEventListeners();
      await this.loadOverridesManifest();
      await this.loadProjectAssets();
      await this.checkOllamaConnection();
      this.populateOutliner();
      this.animate();
      this.showToast('Museum 3D Editor Ready — Loaded Live Environment');
    }

    // --- THREE.JS RENDERER & VIEWPORT SETUP ---
    setupRenderer() {
      const w = this.canvas.clientWidth || window.innerWidth - 610;
      const h = this.canvas.clientHeight || window.innerHeight - 268;

      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: true,
        powerPreference: 'high-performance'
      });
      this.renderer.setSize(w, h);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.renderer.toneMapping = THREE.LinearToneMapping;
      this.renderer.toneMappingExposure = 1.0;

      this.camera = new THREE.PerspectiveCamera(74, w / h, 0.05, 200);
      this.camera.position.copy(this.camPos);

      window.addEventListener('resize', () => {
        const rw = this.canvas.clientWidth;
        const rh = this.canvas.clientHeight;
        if (rw && rh && this.camera && this.renderer) {
          this.camera.aspect = rw / rh;
          this.camera.updateProjectionMatrix();
          this.renderer.setSize(rw, rh);
        }
      });
    }

    // --- LOAD THE LIVE EXISTING GAME MUSEUM ---
    setupEditorScene() {
      // Provide editor renderer to game engine
      window._IS_EDITOR_MODE = true;
      window._EDITOR_RENDERER = this.renderer;

      const GameClass = window.MuseumGame || window.Game;
      if (typeof GameClass === 'function') {
        this.gameInstance = new GameClass(this.canvas);
        this.scene = this.gameInstance.scene;
      } else {
        console.error('The Museum Game class not found. Ensure game.js is loaded.');
        this.scene = new THREE.Scene();
      }

      // Add prominent editor ambient and directional illumination so entire museum is clearly visible
      const editorAmbient = new THREE.AmbientLight(0xffffff, 0.75);
      editorAmbient.name = 'EditorAmbientLight';
      this.scene.add(editorAmbient);

      const editorSun = new THREE.DirectionalLight(0xffffff, 0.85);
      editorSun.position.set(20, 50, 20);
      editorSun.name = 'EditorSunLight';
      this.scene.add(editorSun);

      // Disable fog in editor mode so distant wings and corridors are never pitch black
      this.scene.fog = null;

      // Add selection highlight helper box
      this.highlightBox = new THREE.BoxHelper(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1)), 0x58a6ff);
      this.highlightBox.visible = false;
      this.scene.add(this.highlightBox);

      // Add editor grid floor for spatial orientation
      const grid = new THREE.GridHelper(80, 80, 0x30363d, 0x161b22);
      grid.position.y = 0.002;
      this.scene.add(grid);
    }

    // --- BLENDER-STYLE 3D TRANSFORM GIZMO ---
    setupTransformGizmo() {
      if (THREE.TransformControls) {
        this.transformControls = new THREE.TransformControls(this.camera, this.renderer.domElement);
        this.transformControls.size = 0.85;
        this.transformControls.setSpace('world');

        this.transformControls.addEventListener('change', () => {
          if (this.selectedObject) {
            this.syncInspectorFromObject(this.selectedObject);
            if (this.highlightBox) this.highlightBox.update();
          }
        });

        this.transformControls.addEventListener('mouseDown', () => {
          if (this.selectedObject) {
            this.pushUndoSnapshot(this.selectedObject);
          }
        });

        this.transformControls.addEventListener('mouseUp', () => {
          if (this.selectedObject) {
            this.recordObjectChange(this.selectedObject);
          }
        });

        this.scene.add(this.transformControls);
      }
    }

    // --- EVENT LISTENERS & SHORTCUTS ---
    setupEventListeners() {
      // 1. Tool Mode Buttons
      document.getElementById('btn-mode-translate').addEventListener('click', () => this.setGizmoMode('translate'));
      document.getElementById('btn-mode-rotate').addEventListener('click', () => this.setGizmoMode('rotate'));
      document.getElementById('btn-mode-scale').addEventListener('click', () => this.setGizmoMode('scale'));

      // 2. Coordinate Space & Grid Snap
      document.getElementById('space-select').addEventListener('change', (e) => {
        if (this.transformControls) this.transformControls.setSpace(e.target.value);
      });
      document.getElementById('snap-toggle').addEventListener('change', (e) => {
        if (this.transformControls) {
          const snap = e.target.checked;
          this.transformControls.setTranslationSnap(snap ? 0.5 : null);
          this.transformControls.setRotationSnap(snap ? THREE.MathUtils.degToRad(15) : null);
          this.transformControls.setScaleSnap(snap ? 0.25 : null);
        }
      });

      // 3. Floor Quick-Jump Buttons
      document.querySelectorAll('.floor-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const fl = parseInt(btn.getAttribute('data-floor'), 10);
          this.jumpToFloor(fl);
        });
      });

      // 4. Persistence & History Actions
      document.getElementById('btn-save').addEventListener('click', () => this.saveSceneOverrides());
      document.getElementById('btn-revert').addEventListener('click', () => this.revertSceneOverrides());
      document.getElementById('btn-undo').addEventListener('click', () => this.undo());
      document.getElementById('btn-redo').addEventListener('click', () => this.redo());

      // 5. Playtest Preview Toggle
      document.getElementById('btn-gameplay-preview').addEventListener('click', () => {
        window.open('../index.html', '_blank');
      });

      // 6. Viewport Object Picking & Noclip Movement
      this.canvas.addEventListener('mousedown', (e) => {
        if (e.button === 2) {
          // Right click: start noclip look & flight
          this.isRightMouseDown = true;
          this.canvas.requestPointerLock();
        } else if (e.button === 0) {
          // Left click: Pick object if transform controls not hovered
          if (this.transformControls && this.transformControls.dragging) return;
          this.pickObjectFromScreen(e);
        }
      });

      window.addEventListener('mouseup', (e) => {
        if (e.button === 2) {
          this.isRightMouseDown = false;
          if (document.pointerLockElement === this.canvas) {
            document.exitPointerLock();
          }
        }
      });

      window.addEventListener('mousemove', (e) => {
        if (this.isRightMouseDown && document.pointerLockElement === this.canvas) {
          const sensitivity = 0.0024;
          this.camYaw -= e.movementX * sensitivity;
          this.camPitch -= e.movementY * sensitivity;
          this.camPitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, this.camPitch));
        }
      });

      window.addEventListener('keydown', (e) => {
        this.keys[e.code] = true;

        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        // Hotkeys: W/E/R for Move/Rotate/Scale
        if (e.code === 'KeyW' && !this.isRightMouseDown) this.setGizmoMode('translate');
        if (e.code === 'KeyE' && !this.isRightMouseDown) this.setGizmoMode('rotate');
        if (e.code === 'KeyR' && !this.isRightMouseDown) this.setGizmoMode('scale');

        // Focus selected object
        if (e.code === 'KeyQ') this.focusSelectedObject();

        // Undo / Redo
        if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') {
          e.preventDefault();
          if (e.shiftKey) this.redo();
          else this.undo();
        }
        if ((e.ctrlKey || e.metaKey) && e.code === 'KeyY') {
          e.preventDefault();
          this.redo();
        }

        // Delete object
        if (e.code === 'Delete' || e.code === 'Backspace') {
          if (this.selectedObject) this.deleteSelectedObject();
        }
      });

      window.addEventListener('keyup', (e) => {
        this.keys[e.code] = false;
      });

      // 7. Panel Tabs
      document.querySelectorAll('.panel-tabs .tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('.panel-tabs .tab-btn').forEach(b => b.classList.remove('active'));
          document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
          btn.classList.add('active');
          const targetId = btn.getAttribute('data-tab');
          document.getElementById(targetId).classList.add('active');
        });
      });

      // 8. Properties Form Binding
      this.setupInspectorFormBindings();

      // 9. AI Chat Assistant & Model Selection
      this.setupAiChat();
    }

    setGizmoMode(mode) {
      if (this.transformControls) {
        this.transformControls.setMode(mode);
        document.querySelectorAll('.tool-group .tool-btn').forEach(b => b.classList.remove('active'));
        const btn = document.getElementById(`btn-mode-${mode}`);
        if (btn) btn.classList.add('active');
      }
    }

    // --- NOCLIP FREE FLIGHT CAMERA UPDATE ---
    updateCamera(delta) {
      if (this.isRightMouseDown) {
        const forward = new THREE.Vector3(-Math.sin(this.camYaw), 0, -Math.cos(this.camYaw));
        const right = new THREE.Vector3(Math.cos(this.camYaw), 0, -Math.sin(this.camYaw));
        const moveDir = new THREE.Vector3();

        if (this.keys['KeyW']) moveDir.add(forward);
        if (this.keys['KeyS']) moveDir.sub(forward);
        if (this.keys['KeyD']) moveDir.add(right);
        if (this.keys['KeyA']) moveDir.sub(right);
        if (this.keys['Space']) moveDir.y += 1.0;
        if (this.keys['KeyC'] || this.keys['ControlLeft']) moveDir.y -= 1.0;

        const boost = (this.keys['ShiftLeft'] || this.keys['ShiftRight']) ? 2.5 : 1.0;
        if (moveDir.lengthSq() > 0.001) {
          moveDir.normalize();
          this.camPos.addScaledVector(moveDir, this.camSpeed * boost * delta);
        }
      }

      this.camera.position.copy(this.camPos);
      this.camera.rotation.set(this.camPitch, this.camYaw, 0, 'YXZ');

      // Update HUD Coordinates
      const floorH = (window.CONFIG && window.CONFIG.FLOOR_HEIGHT) || 5.2;
      this.currentFloor = Math.max(0, Math.min(3, Math.floor(this.camPos.y / floorH)));
      document.getElementById('cam-coords').textContent = `${this.camPos.x.toFixed(1)}, ${this.camPos.y.toFixed(1)}, ${this.camPos.z.toFixed(1)}`;
      document.getElementById('cam-floor').textContent = `${this.currentFloor + 1}${['ST', 'ND', 'RD', 'TH'][this.currentFloor]} FLOOR`;

      // Update active floor button
      document.querySelectorAll('.floor-btn').forEach(btn => {
        const fl = parseInt(btn.getAttribute('data-floor'), 10);
        btn.classList.toggle('active', fl === this.currentFloor);
      });
    }

    jumpToFloor(fl) {
      const floorH = (window.CONFIG && window.CONFIG.FLOOR_HEIGHT) || 5.2;
      this.camPos.set(-10.0, fl * floorH + 1.8, 6.0);
      this.camYaw = 0;
      this.camPitch = 0;
      this.showToast(`Jumped to Floor ${fl + 1}`);
    }

    // --- OBJECT SELECTION & PICKING ---
    pickObjectFromScreen(e) {
      const rect = this.canvas.getBoundingClientRect();
      this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      this.raycaster.setFromCamera(this.mouse, this.camera);

      // Collect selectable decor objects from the scene
      const candidates = [];
      if (this.gameInstance && this.gameInstance.decorObjects) {
        for (const [id, root] of this.gameInstance.decorObjects.entries()) {
          candidates.push(root);
        }
      }

      const intersects = this.raycaster.intersectObjects(candidates, true);
      if (intersects.length > 0) {
        // Find top-level decor root
        let topObj = intersects[0].object;
        while (topObj.parent && topObj.parent !== this.scene && !topObj.userData.isDecor) {
          topObj = topObj.parent;
        }
        this.selectObject(topObj);
      } else {
        this.selectObject(null);
      }
    }

    selectObject(obj) {
      this.selectedObject = obj;

      if (obj) {
        if (this.transformControls) this.transformControls.attach(obj);
        if (this.highlightBox) {
          this.highlightBox.setFromObject(obj);
          this.highlightBox.visible = true;
        }
        document.getElementById('selected-object-type').textContent = obj.userData.category || 'decor';
        this.syncInspectorFromObject(obj);
        document.getElementById('inspector-empty').classList.add('hidden');
        document.getElementById('inspector-form').classList.remove('hidden');

        // Highlight in outliner tree
        document.querySelectorAll('.tree-item').forEach(ti => {
          ti.classList.toggle('selected', ti.getAttribute('data-id') === obj.userData.id);
        });
      } else {
        if (this.transformControls) this.transformControls.detach();
        if (this.highlightBox) this.highlightBox.visible = false;
        document.getElementById('selected-object-type').textContent = 'None';
        document.getElementById('inspector-empty').classList.remove('hidden');
        document.getElementById('inspector-form').classList.add('hidden');
        document.querySelectorAll('.tree-item').forEach(ti => ti.classList.remove('selected'));
      }
    }

    focusSelectedObject() {
      if (!this.selectedObject) return;
      const target = this.selectedObject.position.clone();
      this.camPos.set(target.x, target.y + 1.2, target.z + 3.0);
      this.camYaw = 0;
      this.camPitch = -0.2;
      this.showToast(`Focused on ${this.selectedObject.userData.name || 'object'}`);
    }

    // --- PROPERTIES INSPECTOR BINDING ---
    setupInspectorFormBindings() {
      const bindNum = (id, prop, axis) => {
        document.getElementById(id).addEventListener('input', (e) => {
          if (!this.selectedObject) return;
          const val = parseFloat(e.target.value);
          if (!isNaN(val)) {
            if (prop === 'rotation') {
              this.selectedObject[prop][axis] = THREE.MathUtils.degToRad(val);
            } else {
              this.selectedObject[prop][axis] = val;
            }
            if (this.highlightBox) this.highlightBox.update();
            this.recordObjectChange(this.selectedObject);
          }
        });
      };

      bindNum('prop-pos-x', 'position', 'x');
      bindNum('prop-pos-y', 'position', 'y');
      bindNum('prop-pos-z', 'position', 'z');

      bindNum('prop-rot-x', 'rotation', 'x');
      bindNum('prop-rot-y', 'rotation', 'y');
      bindNum('prop-rot-z', 'rotation', 'z');

      bindNum('prop-scale-x', 'scale', 'x');
      bindNum('prop-scale-y', 'scale', 'y');
      bindNum('prop-scale-z', 'scale', 'z');

      document.getElementById('prop-name').addEventListener('input', (e) => {
        if (this.selectedObject) {
          this.selectedObject.userData.name = e.target.value;
          this.populateOutliner();
        }
      });

      document.getElementById('prop-visible').addEventListener('change', (e) => {
        if (this.selectedObject) {
          this.selectedObject.visible = e.target.checked;
          this.recordObjectChange(this.selectedObject);
        }
      });

      // Actions
      document.getElementById('btn-duplicate').addEventListener('click', () => {
        if (this.selectedObject) this.duplicateSelectedObject();
      });
      document.getElementById('btn-focus-obj').addEventListener('click', () => {
        this.focusSelectedObject();
      });
      document.getElementById('btn-delete-obj').addEventListener('click', () => {
        if (this.selectedObject) this.deleteSelectedObject();
      });
    }

    syncInspectorFromObject(obj) {
      if (!obj) return;
      document.getElementById('prop-id').value = obj.userData.id || '';
      document.getElementById('prop-name').value = obj.userData.name || '';
      document.getElementById('prop-visible').checked = obj.visible !== false;

      document.getElementById('prop-pos-x').value = obj.position.x.toFixed(2);
      document.getElementById('prop-pos-y').value = obj.position.y.toFixed(2);
      document.getElementById('prop-pos-z').value = obj.position.z.toFixed(2);

      document.getElementById('prop-rot-x').value = THREE.MathUtils.radToDeg(obj.rotation.x).toFixed(1);
      document.getElementById('prop-rot-y').value = THREE.MathUtils.radToDeg(obj.rotation.y).toFixed(1);
      document.getElementById('prop-rot-z').value = THREE.MathUtils.radToDeg(obj.rotation.z).toFixed(1);

      document.getElementById('prop-scale-x').value = obj.scale.x.toFixed(2);
      document.getElementById('prop-scale-y').value = obj.scale.y.toFixed(2);
      document.getElementById('prop-scale-z').value = obj.scale.z.toFixed(2);
    }

    // --- OUTLINER & ASSET BROWSER ---
    populateOutliner() {
      const treeEl = document.getElementById('outliner-tree');
      treeEl.innerHTML = '';

      if (!this.gameInstance || !this.gameInstance.decorObjects) return;

      for (const [id, obj] of this.gameInstance.decorObjects.entries()) {
        const item = document.createElement('div');
        item.className = 'tree-item';
        item.setAttribute('data-id', id);
        if (this.selectedObject && this.selectedObject.userData.id === id) {
          item.classList.add('selected');
        }

        const name = obj.userData.name || id;
        const fl = obj.userData.floor !== undefined ? `F${obj.userData.floor + 1}` : '';
        item.innerHTML = `
          <div class="tree-item-label">
            <span>${name}</span>
          </div>
          <span class="tree-item-cat">${fl}</span>
        `;

        item.addEventListener('click', () => {
          this.selectObject(obj);
        });

        treeEl.appendChild(item);
      }
    }

    async loadProjectAssets() {
      try {
        const res = await fetch('/api/editor/assets');
        if (!res.ok) return;
        const assets = await res.json();

        // 1. Populate Model Assets
        const modelList = document.getElementById('model-asset-list');
        modelList.innerHTML = '';
        (assets.relics || []).concat(assets.models || []).forEach(m => {
          const card = document.createElement('div');
          card.className = 'asset-card';
          card.innerHTML = `
            <div class="asset-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
            </div>
            <span class="asset-name">${m.name}</span>
          `;
          card.addEventListener('click', () => {
            this.placeAssetAtCamera(m);
          });
          modelList.appendChild(card);
        });

        // 2. Populate Texture Assets
        const texList = document.getElementById('texture-asset-list');
        texList.innerHTML = '';
        (assets.textures || []).forEach(t => {
          const card = document.createElement('div');
          card.className = 'asset-card';
          card.innerHTML = `
            <div class="asset-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            </div>
            <span class="asset-name">${t.name}</span>
          `;
          texList.appendChild(card);
        });
      } catch (e) {
        console.warn('Could not query project assets:', e);
      }
    }

    placeAssetAtCamera(asset) {
      const loader = new THREE.GLTFLoader();
      const placePos = this.camPos.clone().add(new THREE.Vector3(-Math.sin(this.camYaw), 0, -Math.cos(this.camYaw)).multiplyScalar(3.0));

      loader.load(`../${asset.path}`, (gltf) => {
        const root = gltf.scene;
        const newId = 'custom_' + Date.now();
        root.position.copy(placePos);
        root.userData = {
          id: newId,
          name: asset.name.replace(/\.[^/.]+$/, ''),
          category: 'custom',
          floor: this.currentFloor,
          isDecor: true,
          assetPath: asset.path
        };

        this.scene.add(root);
        if (this.gameInstance && this.gameInstance.registerDecorObject) {
          this.gameInstance.registerDecorObject(root, newId, root.userData.name, 'custom', this.currentFloor);
        }

        // Add to overrides manifest customModels list
        this.overrides.customModels.push({
          id: newId,
          name: root.userData.name,
          file: asset.path,
          floor: this.currentFloor,
          position: { x: placePos.x, y: placePos.y, z: placePos.z },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 }
        });

        this.selectObject(root);
        this.populateOutliner();
        this.showToast(`Placed ${asset.name} at cursor`);
      }, undefined, (err) => {
        this.showToast(`Error loading model ${asset.name}`);
      });
    }

    duplicateSelectedObject() {
      if (!this.selectedObject) return;
      const clone = this.selectedObject.clone(true);
      const newId = 'dup_' + Date.now();
      clone.position.x += 1.0;
      clone.userData = { ...this.selectedObject.userData, id: newId, name: (this.selectedObject.userData.name || 'Object') + ' (Copy)' };

      this.scene.add(clone);
      if (this.gameInstance && this.gameInstance.registerDecorObject) {
        this.gameInstance.registerDecorObject(clone, newId, clone.userData.name, clone.userData.category, clone.userData.floor);
      }

      this.recordObjectChange(clone);
      this.selectObject(clone);
      this.populateOutliner();
      this.showToast(`Duplicated ${clone.userData.name}`);
    }

    deleteSelectedObject() {
      if (!this.selectedObject) return;
      const id = this.selectedObject.userData.id;
      const name = this.selectedObject.userData.name || id;

      this.selectedObject.visible = false;
      this.recordObjectChange(this.selectedObject);
      this.selectObject(null);
      this.showToast(`Deleted ${name}`);
    }

    // --- PERSISTENCE: CURATED OVERRIDES SAVE / LOAD ---
    async loadOverridesManifest() {
      try {
        const res = await fetch('/api/editor/overrides');
        if (res.ok) {
          this.overrides = await res.json();
          this.overrides.objects = this.overrides.objects || {};
          this.overrides.customModels = this.overrides.customModels || [];
        }
      } catch (e) {
        console.warn('Failed to load scene overrides:', e);
      }
    }

    recordObjectChange(obj) {
      if (!obj || !obj.userData.id) return;
      const id = obj.userData.id;
      this.overrides.objects[id] = {
        name: obj.userData.name,
        visible: obj.visible,
        position: { x: obj.position.x, y: obj.position.y, z: obj.position.z },
        rotation: { x: obj.rotation.x, y: obj.rotation.y, z: obj.rotation.z },
        scale: { x: obj.scale.x, y: obj.scale.y, z: obj.scale.z }
      };
    }

    async saveSceneOverrides() {
      try {
        const res = await fetch('/api/editor/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(this.overrides, null, 2)
        });
        const result = await res.json();
        if (res.ok) {
          this.showToast('Scene overrides saved! Live game updated.');
        } else {
          this.showToast(`Save failed: ${result.error || 'Server error'}`);
        }
      } catch (e) {
        this.showToast('Save failed: ' + e.message);
      }
    }

    async revertSceneOverrides() {
      if (confirm('Revert all unsaved changes to original scene state?')) {
        window.location.reload();
      }
    }

    // --- UNDO / REDO SNAPSHOTS ---
    pushUndoSnapshot(obj) {
      this.undoStack.push({
        id: obj.userData.id,
        pos: obj.position.clone(),
        rot: obj.rotation.clone(),
        scale: obj.scale.clone(),
        visible: obj.visible
      });
      if (this.undoStack.length > 50) this.undoStack.shift();
      this.redoStack = [];
    }

    undo() {
      if (this.undoStack.length === 0) return;
      const snap = this.undoStack.pop();
      const obj = this.gameInstance && this.gameInstance.decorObjects.get(snap.id);
      if (obj) {
        this.redoStack.push({
          id: snap.id,
          pos: obj.position.clone(),
          rot: obj.rotation.clone(),
          scale: obj.scale.clone(),
          visible: obj.visible
        });
        obj.position.copy(snap.pos);
        obj.rotation.copy(snap.rot);
        obj.scale.copy(snap.scale);
        obj.visible = snap.visible;
        this.recordObjectChange(obj);
        if (this.selectedObject === obj) this.syncInspectorFromObject(obj);
        this.showToast('Undo performed');
      }
    }

    redo() {
      if (this.redoStack.length === 0) return;
      const snap = this.redoStack.pop();
      const obj = this.gameInstance && this.gameInstance.decorObjects.get(snap.id);
      if (obj) {
        this.undoStack.push({
          id: snap.id,
          pos: obj.position.clone(),
          rot: obj.rotation.clone(),
          scale: obj.scale.clone(),
          visible: obj.visible
        });
        obj.position.copy(snap.pos);
        obj.rotation.copy(snap.rot);
        obj.scale.copy(snap.scale);
        obj.visible = snap.visible;
        this.recordObjectChange(obj);
        if (this.selectedObject === obj) this.syncInspectorFromObject(obj);
        this.showToast('Redo performed');
      }
    }

    // --- LOCAL OLLAMA AI ASSISTANT & STRUCTURED TOOL CALLING ---
    async checkOllamaConnection() {
      const dot = document.getElementById('ai-conn-dot');
      const statusText = document.getElementById('ai-conn-status');
      const modelSelect = document.getElementById('ollama-model-select');

      try {
        const res = await fetch('/api/ollama/tags');
        const data = await res.json();

        if (data.models && data.models.length > 0) {
          this.ollamaConnected = true;
          this.ollamaModels = data.models;
          dot.className = 'ai-dot status-online';
          statusText.textContent = `Ollama Connected (${data.models.length} models)`;

          modelSelect.innerHTML = '';
          data.models.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.name;
            opt.textContent = m.name;
            modelSelect.appendChild(opt);
          });
          this.currentModel = data.models[0].name;
          modelSelect.value = this.currentModel;
        } else {
          this.ollamaConnected = false;
          dot.className = 'ai-dot status-offline';
          statusText.textContent = 'Ollama Offline';
          modelSelect.innerHTML = '<option value="">Start `ollama serve`</option>';
        }
      } catch (e) {
        this.ollamaConnected = false;
        dot.className = 'ai-dot status-offline';
        statusText.textContent = 'Ollama Offline';
      }
    }

    setupAiChat() {
      const input = document.getElementById('ai-prompt-input');
      const sendBtn = document.getElementById('btn-send-ai');
      const modelSelect = document.getElementById('ollama-model-select');

      modelSelect.addEventListener('change', (e) => {
        this.currentModel = e.target.value;
      });

      document.getElementById('btn-ai-refresh').addEventListener('click', () => {
        this.checkOllamaConnection();
      });

      document.getElementById('btn-toggle-ai-panel').addEventListener('click', () => {
        const panel = document.getElementById('bottom-panel');
        panel.classList.toggle('collapsed');
      });

      sendBtn.addEventListener('click', () => this.handleAiPrompt());
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') this.handleAiPrompt();
      });

      // Approval Box Handlers
      document.getElementById('btn-approve-ai').addEventListener('click', () => {
        if (this.pendingAiAction) {
          this.executeAiAction(this.pendingAiAction);
          document.getElementById('ai-approval-box').classList.add('hidden');
          this.pendingAiAction = null;
        }
      });
      document.getElementById('btn-reject-ai').addEventListener('click', () => {
        document.getElementById('ai-approval-box').classList.add('hidden');
        this.pendingAiAction = null;
        this.appendChatMessage('ai', 'Action rejected.');
      });
    }

    async handleAiPrompt() {
      const input = document.getElementById('ai-prompt-input');
      const prompt = input.value.trim();
      if (!prompt) return;

      input.value = '';
      this.appendChatMessage('user', prompt);

      if (!this.ollamaConnected) {
        this.appendChatMessage('ai', `⚠️ Ollama is not connected locally. Run <code>ollama serve</code> in your terminal and ensure a model is installed (e.g. <code>ollama run llama3.2</code> or <code>mistral</code>), then click refresh.`);
        return;
      }

      // Build rich context snapshot of the 3D scene around player camera
      const sceneContext = this.buildSceneContext();

      const systemPrompt = `You are the local 3D AI Architect for The Museum, an authentic Three.js first-person game environment.
Your job is to interpret user editing instructions and generate structured JSON tool calls that manipulate the 3D scene.

CURRENT SCENE CONTEXT:
- Editor Camera Position: [x: ${sceneContext.camera.x.toFixed(2)}, y: ${sceneContext.camera.y.toFixed(2)}, z: ${sceneContext.camera.z.toFixed(2)}]
- Current Floor: Floor ${sceneContext.currentFloor + 1}
- Selected Object: ${sceneContext.selected ? JSON.stringify(sceneContext.selected) : 'None'}
- Nearby Objects: ${JSON.stringify(sceneContext.nearby)}

AVAILABLE TOOLS (reply ONLY with a JSON object matching this schema):
{
  "thought": "Brief explanation of what change you are making",
  "tool": "move_object" | "rotate_object" | "scale_object" | "duplicate_object" | "delete_object" | "change_visibility",
  "parameters": {
    "objectId": string,
    "deltaPosition": { "x": number, "y": number, "z": number },
    "absolutePosition": { "x": number, "y": number, "z": number },
    "deltaRotation": { "x": number, "y": number, "z": number },
    "scaleFactor": number,
    "visible": boolean
  }
}

If the user asks a question or instructions are ambiguous, respond with:
{
  "thought": "Direct conversational answer to user",
  "message": "Answer text"
}`;

      try {
        this.appendChatMessage('ai', 'Thinking...');
        const res = await fetch('/api/ollama/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: this.currentModel,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: prompt }
            ],
            stream: false
          })
        });

        const data = await res.json();
        // Remove "Thinking..." message
        const msgs = document.getElementById('ai-messages');
        msgs.removeChild(msgs.lastChild);

        const replyContent = data.message ? data.message.content : '';
        this.processAiResponse(replyContent);
      } catch (e) {
        this.appendChatMessage('ai', `Error contacting Ollama: ${e.message}`);
      }
    }

    buildSceneContext() {
      const nearby = [];
      if (this.gameInstance && this.gameInstance.decorObjects) {
        for (const [id, obj] of this.gameInstance.decorObjects.entries()) {
          const dist = this.camPos.distanceTo(obj.position);
          if (dist < 18.0) {
            nearby.push({
              id: id,
              name: obj.userData.name || id,
              category: obj.userData.category,
              position: { x: obj.position.x, y: obj.position.y, z: obj.position.z },
              distance: dist.toFixed(1)
            });
          }
        }
      }
      return {
        camera: { x: this.camPos.x, y: this.camPos.y, z: this.camPos.z },
        currentFloor: this.currentFloor,
        selected: this.selectedObject ? {
          id: this.selectedObject.userData.id,
          name: this.selectedObject.userData.name,
          category: this.selectedObject.userData.category,
          position: { x: this.selectedObject.position.x, y: this.selectedObject.position.y, z: this.selectedObject.position.z }
        } : null,
        nearby: nearby.slice(0, 8)
      };
    }

    processAiResponse(raw) {
      try {
        // Extract JSON if wrapped in markdown code blocks
        let clean = raw;
        const jsonMatch = raw.match(/```json([\s\S]*?)```/) || raw.match(/```([\s\S]*?)```/);
        if (jsonMatch) clean = jsonMatch[1].trim();

        const parsed = JSON.parse(clean);

        if (parsed.message) {
          this.appendChatMessage('ai', parsed.message);
          return;
        }

        if (parsed.tool) {
          // Show proposal in approval box
          this.pendingAiAction = parsed;
          document.getElementById('approval-desc').textContent = `${parsed.thought || parsed.tool} on ${parsed.parameters ? parsed.parameters.objectId : 'target'}`;
          document.getElementById('ai-approval-box').classList.remove('hidden');
          this.appendChatMessage('ai', `Proposed action: <b>${parsed.tool}</b>. Please approve or reject.`);
        } else {
          this.appendChatMessage('ai', parsed.thought || raw);
        }
      } catch (e) {
        this.appendChatMessage('ai', raw);
      }
    }

    executeAiAction(action) {
      const p = action.parameters || {};
      const targetId = p.objectId || (this.selectedObject && this.selectedObject.userData.id);
      const obj = this.gameInstance && this.gameInstance.decorObjects.get(targetId);

      if (!obj) {
        this.showToast(`Error: Object ${targetId} not found`);
        return;
      }

      this.pushUndoSnapshot(obj);

      if (action.tool === 'move_object') {
        if (p.deltaPosition) {
          obj.position.x += p.deltaPosition.x || 0;
          obj.position.y += p.deltaPosition.y || 0;
          obj.position.z += p.deltaPosition.z || 0;
        } else if (p.absolutePosition) {
          obj.position.set(p.absolutePosition.x, p.absolutePosition.y, p.absolutePosition.z);
        }
      } else if (action.tool === 'rotate_object') {
        if (p.deltaRotation) {
          obj.rotation.x += THREE.MathUtils.degToRad(p.deltaRotation.x || 0);
          obj.rotation.y += THREE.MathUtils.degToRad(p.deltaRotation.y || 0);
          obj.rotation.z += THREE.MathUtils.degToRad(p.deltaRotation.z || 0);
        }
      } else if (action.tool === 'scale_object') {
        if (p.scaleFactor) {
          obj.scale.multiplyScalar(p.scaleFactor);
        }
      } else if (action.tool === 'delete_object') {
        obj.visible = false;
      } else if (action.tool === 'duplicate_object') {
        this.selectObject(obj);
        this.duplicateSelectedObject();
        return;
      }

      this.recordObjectChange(obj);
      if (this.selectedObject === obj) this.syncInspectorFromObject(obj);
      if (this.highlightBox) this.highlightBox.update();
      this.appendChatMessage('ai', `Successfully executed: ${action.tool} on ${obj.userData.name || targetId}`);
      this.showToast(`AI executed ${action.tool}`);
    }

    appendChatMessage(role, html) {
      const msgs = document.getElementById('ai-messages');
      const msg = document.createElement('div');
      msg.className = `chat-msg ${role}-msg`;
      msg.innerHTML = `
        <div class="msg-header">${role === 'user' ? 'YOU' : 'MUSEUM ARCHITECT AI'}</div>
        <div class="msg-content">${html}</div>
      `;
      msgs.appendChild(msg);
      msgs.scrollTop = msgs.scrollHeight;
    }

    showToast(msg) {
      const toast = document.getElementById('editor-toast');
      toast.textContent = msg;
      toast.classList.remove('hidden');
      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => toast.classList.add('hidden'), 3500);
    }

    // --- MAIN RENDER LOOP ---
    animate() {
      requestAnimationFrame(() => this.animate());
      const delta = 0.016; // 60fps nominal
      this.updateCamera(delta);
      if (this.renderer && this.scene && this.camera) {
        this.renderer.render(this.scene, this.camera);
      }
    }
  }

  // Launch Editor on Window Load
  window.addEventListener('DOMContentLoaded', () => {
    window.editor = new MuseumEditor();
  });
})();
