with open("game.js", "r") as f:
    content = f.read()

door_old = """          const d = this.slidingDoors[i];
          const distPlayer = (this.playerFloor === d.floor) ? Math.hypot(playerX - d.x, playerZ - d.doorZ) : 999;
          const distSmitty = (smittyActive && smittyFloor === d.floor) ? Math.hypot(smittyX - d.x, smittyZ - d.doorZ) : 999;
          const shouldOpen = (distPlayer < 3.4 || distSmitty < 3.4);"""

door_new = """          const d = this.slidingDoors[i];
          const distPlayer = (this.playerFloor === d.floor) ? Math.hypot(playerX - d.x, playerZ - d.doorZ) : 999;
          const distSmitty = (smittyActive && smittyFloor === d.floor) ? Math.hypot(smittyX - d.x, smittyZ - d.doorZ) : 999;
          let statueNear = false;
          if (this.statues) {
            for (let s of this.statues) {
              if (s.floor === d.floor && Math.hypot(s.x - d.x, s.z - d.doorZ) < 3.4) {
                statueNear = true;
                break;
              }
            }
          }
          const shouldOpen = (distPlayer < 3.4 || distSmitty < 3.4 || statueNear);"""

content = content.replace(door_old, door_new)

with open("game.js", "w") as f:
    f.write(content)
