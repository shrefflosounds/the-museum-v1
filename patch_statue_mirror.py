with open("game.js", "r") as f:
    content = f.read()

# I need to insert BATHROOM_MIRROR logic in updateStatues loop.
logic_old = """        } else if (s.aiState === "WANDER") {
          if (s.aiTimer <= 0 || !s.navPath || s.navIndex >= s.navPath.length) {
            s.aiState = "IDLE";
            s.aiTimer = 1.5 + Math.random() * 3.5;
            s.idleLookYaw = s.yaw + (Math.random() - 0.5) * 1.6;
            s.statueRoot.position.y = s.baseY;
            s.statueRoot.rotation.set(0, 0, 0);
            return;
          }"""

logic_new = """        } else if (s.aiState === "BATHROOM_MIRROR") {
          if (s.aiTimer <= 0) {
            s.aiState = "IDLE";
            s.aiTimer = 1.0;
          } else {
            // Stand facing the mirror. Mirrors are typically on the East wall (x=4.0) or West.
            // Restroom centers are around x=2.0. So face East.
            s.yaw = THREE.MathUtils.lerp(s.yaw, Math.PI / 2, 8.0 * delta);
            s.model.rotation.y = s.yaw + s.cfg.faceOffset;
          }
        } else if (s.aiState === "WANDER") {
          if (s.aiTimer <= 0 || !s.navPath || s.navIndex >= s.navPath.length) {
            const lastNode = s.navPath ? s.navPath[s.navPath.length - 1] : null;
            if (lastNode && (lastNode.tag === 'mensRestroom_c' || lastNode.tag === 'womensRestroom_c')) {
              s.aiState = "BATHROOM_MIRROR";
              s.aiTimer = 5.0 + Math.random() * 5.0; // Wait 5-10s
            } else {
              s.aiState = "IDLE";
              s.aiTimer = 1.5 + Math.random() * 3.5;
              s.idleLookYaw = s.yaw + (Math.random() - 0.5) * 1.6;
            }
            s.statueRoot.position.y = s.baseY;
            s.statueRoot.rotation.set(0, 0, 0);
            return;
          }"""

content = content.replace(logic_old, logic_new)

with open("game.js", "w") as f:
    f.write(content)
