with open("game.js", "r") as f:
    content = f.read()

# Add the mesh to buildSingleFloor inside the correct condition (fl === 0)
create_old = """      // 5. North Gallery Slab (x: -4..28, z: -40..-26) + North Bay (x: 6..18, z: -42..-40)
      this.createSlab(12, y0, -33, 32.0, 14.0, floorMat, mats.ceiling, ceilH);"""

create_new = """      // 5. North Gallery Slab (x: -4..28, z: -40..-26) + North Bay (x: 6..18, z: -42..-40)
      this.createSlab(12, y0, -33, 32.0, 14.0, floorMat, mats.ceiling, ceilH);

      if (fl === 0) {
        const mirrorGeom = new THREE.PlaneGeometry(2.0, 3.0);
        const mirrorMat = new THREE.MeshBasicMaterial({ map: this.mirrorRenderTarget.texture });
        this.hallwayMirror = new THREE.Mesh(mirrorGeom, mirrorMat);
        // Wall is at x=4, facing East => x=4.01, z=1.0
        this.hallwayMirror.position.set(4.01, y0 + 1.5, 1.0);
        this.hallwayMirror.rotation.y = Math.PI / 2; // Facing positive X
        this.hallwayMirror.visible = false; // Initially hidden
        this.scene.add(this.hallwayMirror);
      }"""

content = content.replace(create_old, create_new)

with open("game.js", "w") as f:
    f.write(content)
