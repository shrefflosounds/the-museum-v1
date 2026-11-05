with open("game.js", "r") as f:
    content = f.read()

nav_patch = """    isRoomNavNode(n) {
      const t = n.tag || '';
      if (t === 'doorMens_e' || t === 'doorWomens_e' || t === 'mensRestroom_c' || t === 'womensRestroom_c') return true;
      return !t.includes('Mid') && !t.includes('Stair') && !t.includes('stair') &&
             !t.includes('door') && !t.includes('portal') && !t.includes('Base') && !t.includes('ext');
    }"""

content = content.replace("""    isRoomNavNode(n) {
      const t = n.tag || '';
      return !t.includes('Mid') && !t.includes('Stair') && !t.includes('stair') &&
             !t.includes('door') && !t.includes('portal') && !t.includes('Base') && !t.includes('ext');
    }""", nav_patch)

with open("game.js", "w") as f:
    f.write(content)
