with open("game.js", "r") as f:
    content = f.read()

render_old = """      this.renderer.render(this.scene, this.camera);
    }"""

render_new = """      // Third-person Hallway Mirror logic
      if (this.hallwayMirror) {
        if (this.isThirdPersonView() && this.playerFloor === 0) {
          this.hallwayMirror.visible = true;

          // Position the mirror camera opposite the player camera relative to the mirror plane (x=4.01)
          const camPos = this.camera.position.clone();
          // Reflect X coordinate across the mirror plane (mirror is at x=4.01, pointing +X)
          const mirrorX = 4.01;
          const distToMirror = camPos.x - mirrorX;
          this.mirrorCamera.position.set(mirrorX - distToMirror, camPos.y, camPos.z);

          // The view direction needs to be reflected
          const camDir = new THREE.Vector3();
          this.camera.getWorldDirection(camDir);
          camDir.x = -camDir.x; // Reflect X direction

          const lookTarget = this.mirrorCamera.position.clone().add(camDir);
          this.mirrorCamera.lookAt(lookTarget);

          // Render scene to mirror
          this.hallwayMirror.visible = false; // Hide mirror mesh itself so it doesn't render inside the mirror
          this.renderer.setRenderTarget(this.mirrorRenderTarget);
          this.renderer.render(this.scene, this.mirrorCamera);

          // Restore main renderer
          this.renderer.setRenderTarget(null);
          this.hallwayMirror.visible = true;
        } else {
          this.hallwayMirror.visible = false;
        }
      }

      this.renderer.render(this.scene, this.camera);
    }"""

content = content.replace(render_old, render_new)

with open("game.js", "w") as f:
    f.write(content)
