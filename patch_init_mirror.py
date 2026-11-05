with open("game.js", "r") as f:
    content = f.read()

# Add to initThree
init_old = """      // Atmospheric museum ambient illumination + subtle hemisphere bounce (balanced so artwork never washes out)
      this.ambientLight = new THREE.AmbientLight(0x2d3648, 0.50);"""

init_new = """      // Full-body Mirror Setup
      this.mirrorRenderTarget = new THREE.WebGLRenderTarget(512, 1024, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat
      });
      this.mirrorCamera = new THREE.PerspectiveCamera(74, 512/1024, 0.1, 150);
      this.scene.add(this.mirrorCamera);

      // Atmospheric museum ambient illumination + subtle hemisphere bounce (balanced so artwork never washes out)
      this.ambientLight = new THREE.AmbientLight(0x2d3648, 0.50);"""

content = content.replace(init_old, init_new)

with open("game.js", "w") as f:
    f.write(content)
