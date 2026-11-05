import re

with open("game.js", "r") as f:
    content = f.read()

# Multiply all targetHeight values by 0.9 within the STATUES_CONFIG array
def repl(match):
    val = float(match.group(1)) * 0.9
    # Format to 3 decimal places max
    return f"targetHeight: {val:g},"

new_content = re.sub(r'targetHeight:\s*([\d.]+),', repl, content)

with open("game.js", "w") as f:
    f.write(new_content)
