// The Museum - Dragon Ball Sparking / FighterZ Style Character Select Screen
(function() {
  class CharacterSelectUI {
    constructor(game) {
      this.game = game;
      this.characters = [
        { id: 0, name: 'The Animal', file: 'The Animal.glb', portrait: 'assets/ui/portraits/1.png' },
        { id: 1, name: 'The Earth', file: 'The Earth.glb', portrait: 'assets/ui/portraits/2.png' },
        { id: 2, name: 'The Cook', file: 'The Cook.glb', portrait: 'assets/ui/portraits/3.png' },
        { id: 3, name: 'The Arse', file: 'The Arse.glb', portrait: 'assets/ui/portraits/4.png' },
        { id: 4, name: 'Sand', file: 'Sand.glb', portrait: 'assets/ui/portraits/5.png' },
        { id: 5, name: 'The Clown', file: 'The Clown.glb', portrait: 'assets/ui/portraits/6.png' },
        { id: 6, name: 'The Student', file: 'The Student.glb', portrait: 'assets/ui/portraits/7.png' },
        { id: 7, name: 'Heknah', file: 'Heknah.glb', portrait: 'assets/ui/portraits/8.png' },
        { id: 8, name: 'REem8', file: 'REem8.glb', portrait: 'assets/ui/portraits/9.png', isUnlockable: true },
        { id: 9, name: 'The Being', file: 'The Being.glb', portrait: 'assets/ui/portraits/10.png', isUnlockable: true }
      ];

      this.selectedIndex = this.game.selectedPlayerCharacter || 0;
      this.onConfirmCallback = null;
      this.previewScene = null;
      this.previewCamera = null;
      this.previewRenderer = null;
      this.previewModel = null;
      this.previewMixer = null;
      this.animReqId = null;
      this.rotationY = 0;
      this.loadToken = 0;

      // Mouse drag rotation controls
      this.isDragging = false;
      this.lastMouseX = 0;

      this.initDOM();
      this.init3DStage();
      this.setupMouseControls();
    }

    isCharacterUnlocked(char) {
      if (!char || !char.isUnlockable) return true;
      return localStorage.getItem('the_museum_game_completed') === 'true';
    }

    initDOM() {
      this.modal = document.getElementById('char-select-modal');
      this.grid = document.getElementById('char-roster-grid');
      this.nameCallout = document.getElementById('char-selected-name');
      this.confirmBtn = document.getElementById('char-confirm-btn');
      this.backBtn = document.getElementById('char-back-btn');
      this.closeBtn = document.getElementById('char-select-close-btn');
      this.badge = document.getElementById('char-select-mode-tag');
      this.codeBadge = document.getElementById('char-select-code-badge');
      this.codeVal = document.getElementById('char-select-code-val');
      this.loadingEl = document.getElementById('char-preview-loading');

      this.renderRosterGrid();

      this.confirmBtn.addEventListener('click', () => {
        this.confirmSelection();
      });

      if (this.backBtn) {
        this.backBtn.addEventListener('click', () => {
          this.cancelSelection();
        });
      }

      if (this.closeBtn) {
        this.closeBtn.addEventListener('click', () => {
          this.cancelSelection();
        });
      }
    }

    renderRosterGrid() {
      if (!this.grid) return;
      this.grid.innerHTML = '';
      this.characters.forEach((char, index) => {
        const unlocked = this.isCharacterUnlocked(char);
        const card = document.createElement('div');
        card.className = 'char-card' + (index === this.selectedIndex ? ' selected' : '') + (!unlocked ? ' locked' : '');
        card.dataset.index = index;

        const img = document.createElement('img');
        img.src = unlocked ? char.portrait : 'assets/ui/portraits/char_mystery.png';
        img.alt = unlocked ? char.name : 'LOCKED';
        img.loading = 'eager';

        const label = document.createElement('div');
        label.className = 'char-card-label';
        label.textContent = unlocked ? char.name : 'LOCKED';

        card.appendChild(img);
        card.appendChild(label);

        card.addEventListener('click', () => {
          this.selectCharacter(index);
        });

        this.grid.appendChild(card);
      });
    }

    init3DStage() {
      const canvas = document.getElementById('char-preview-canvas');
      if (!canvas) return;

      this.previewRenderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
      this.previewRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.previewRenderer.outputEncoding = THREE.sRGBEncoding;

      this.previewScene = new THREE.Scene();
      // Framing: Camera positioned further back to avoid cutting off top/bottom
      this.previewCamera = new THREE.PerspectiveCamera(36, canvas.clientWidth / canvas.clientHeight, 0.1, 50);

      // Studio Lighting
      const keyLight = new THREE.DirectionalLight(0xfff3d0, 2.0);
      keyLight.position.set(2, 3, 2.5);
      this.previewScene.add(keyLight);

      const fillLight = new THREE.DirectionalLight(0x4070ff, 1.2);
      fillLight.position.set(-2, 1, 1.5);
      this.previewScene.add(fillLight);

      const rimLight = new THREE.DirectionalLight(0x00ffff, 1.6);
      rimLight.position.set(0, 2, -3);
      this.previewScene.add(rimLight);

      const ambient = new THREE.AmbientLight(0xffffff, 1.3);
      this.previewScene.add(ambient);
    }

    setupMouseControls() {
      const canvas = document.getElementById('char-preview-canvas');
      if (!canvas) return;

      canvas.addEventListener('mousedown', (e) => {
        this.isDragging = true;
        this.lastMouseX = e.clientX;
      });

      window.addEventListener('mousemove', (e) => {
        if (!this.isDragging || !this.previewModel) return;
        const deltaX = e.clientX - this.lastMouseX;
        this.lastMouseX = e.clientX;
        this.rotationY += deltaX * 0.012;
        this.previewModel.rotation.y = this.rotationY;
      });

      window.addEventListener('mouseup', () => {
        this.isDragging = false;
      });

      // Touch support
      canvas.addEventListener('touchstart', (e) => {
        if (e.touches.length > 0) {
          this.isDragging = true;
          this.lastMouseX = e.touches[0].clientX;
        }
      });

      window.addEventListener('touchmove', (e) => {
        if (!this.isDragging || !this.previewModel || e.touches.length === 0) return;
        const deltaX = e.touches[0].clientX - this.lastMouseX;
        this.lastMouseX = e.touches[0].clientX;
        this.rotationY += deltaX * 0.015;
        this.previewModel.rotation.y = this.rotationY;
      });

      window.addEventListener('touchend', () => {
        this.isDragging = false;
      });
    }

    show(modeLabel, onConfirm, roomCode = null, onCancel = null) {
      this.onConfirmCallback = onConfirm;
      this.onCancelCallback = onCancel;
      if (this.badge) this.badge.textContent = modeLabel || 'COOPERATIVE';
      if (this.codeBadge && this.codeVal) {
        if (roomCode) {
          this.codeVal.textContent = roomCode;
          this.codeBadge.classList.remove('hidden');
        } else {
          this.codeBadge.classList.add('hidden');
        }
      }
      this.renderRosterGrid();
      this.modal.classList.remove('hidden');
      this.resizeCanvas();
      this.selectCharacter(this.selectedIndex, true);
      this.startLoop();
    }

    hide() {
      this.modal.classList.add('hidden');
      this.stopLoop();
      if (this.previewModel && this.previewScene) {
        this.previewScene.remove(this.previewModel);
        this.previewModel = null;
      }
    }

    resizeCanvas() {
      const canvas = document.getElementById('char-preview-canvas');
      if (!canvas || !this.previewRenderer || !this.previewCamera) return;
      const rect = canvas.parentElement.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      if (w > 0 && h > 0) {
        this.previewRenderer.setSize(w, h, false);
        this.previewCamera.aspect = w / h;
        this.previewCamera.updateProjectionMatrix();
      }
    }

    selectCharacter(index, force = false) {
      const char = this.characters[index];
      const unlocked = this.isCharacterUnlocked(char);
      if (!unlocked) {
        // Locked mystery slot cannot be selected
        return;
      }

      if (index === this.selectedIndex && !force && this.previewModel) return;
      this.selectedIndex = index;

      // Update grid selection highlights
      const cards = this.grid.querySelectorAll('.char-card');
      cards.forEach((card, i) => {
        card.classList.toggle('selected', i === index);
      });

      if (this.nameCallout) {
        this.nameCallout.textContent = char.name;
      }

      this.loadModelPreview(char);
    }

    loadModelPreview(char) {
      const token = ++this.loadToken;
      const loader = new THREE.GLTFLoader();
      const cacheKey = window._ASSET_VERSION || '1.0';

      if (this.loadingEl) {
        this.loadingEl.textContent = `LOADING ${char.name.toUpperCase()}...`;
        this.loadingEl.classList.remove('hidden');
      }

      loader.load(`assets/playermodels/${char.file}?v=${cacheKey}`, (gltf) => {
        if (token !== this.loadToken) return;

        if (this.loadingEl) {
          this.loadingEl.classList.add('hidden');
        }

        if (this.previewModel && this.previewScene) {
          this.previewScene.remove(this.previewModel);
        }

        const box = new THREE.Box3().setFromObject(gltf.scene);
        const size = box.getSize(new THREE.Vector3());
        const model = gltf.scene;

        // Scale normalized to 1.75m height
        model.scale.setScalar(1.75 / size.y);
        model.position.y = -box.min.y * model.scale.y;

        // Initial orientation facing the viewer
        this.rotationY = 0;
        model.rotation.y = this.rotationY;

        model.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = false;
          }
        });

        this.previewModel = model;
        this.previewScene.add(model);

        this.previewMixer = new THREE.AnimationMixer(model);
        if (gltf.animations && gltf.animations.length > 0) {
          let idleClip = gltf.animations.find(c => c.name.toLowerCase().includes('idle')) || gltf.animations[0];
          if (idleClip) {
            const action = this.previewMixer.clipAction(idleClip);
            action.play();
          }
        }

        // Camera perfectly framed with safe padding top and bottom (zoomed out)
        this.previewCamera.position.set(0, 0.88, 3.1);
        this.previewCamera.lookAt(0, 0.88, 0);
      });
    }

    confirmSelection() {
      this.game.selectedPlayerCharacter = this.selectedIndex;
      localStorage.setItem('the_museum_player_character', String(this.selectedIndex));
      if (this.game.dom.playerCharacterSelect) {
        this.game.dom.playerCharacterSelect.value = String(this.selectedIndex);
      }
      this.hide();
      if (this.onConfirmCallback) {
        this.onConfirmCallback(this.selectedIndex);
      }
    }

    cancelSelection() {
      this.hide();
      if (typeof this.onCancelCallback === 'function') {
        this.onCancelCallback();
      }
    }

    startLoop() {
      let lastTime = performance.now();
      const tick = (now) => {
        const delta = Math.min((now - lastTime) / 1000, 0.1);
        lastTime = now;

        if (this.previewMixer) {
          this.previewMixer.update(delta);
        }

        // Model does NOT auto rotate, stays as rotated by user drag

        if (this.previewRenderer && this.previewScene && this.previewCamera) {
          this.previewRenderer.render(this.previewScene, this.previewCamera);
        }

        this.animReqId = requestAnimationFrame(tick);
      };
      this.animReqId = requestAnimationFrame(tick);
    }

    stopLoop() {
      if (this.animReqId) {
        cancelAnimationFrame(this.animReqId);
        this.animReqId = null;
      }
    }
  }

  window.CharacterSelectUI = CharacterSelectUI;
})();
