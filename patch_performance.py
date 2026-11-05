with open("game.js", "r") as f:
    content = f.read()

content = content.replace('this.renderer.setPixelRatio(1);', 'this.renderer.setPixelRatio(window.devicePixelRatio * 0.85);')

with open("game.js", "w") as f:
    f.write(content)
