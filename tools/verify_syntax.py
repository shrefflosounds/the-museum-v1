import os

script_dir = os.path.dirname(os.path.abspath(__file__))
game_js_path = os.path.join(script_dir, '..', 'game.js')

with open(game_js_path) as f:
    code = f.read()

stack = []
pairs = {'(': ')', '{': '}', '[': ']'}
inv = {v: k for k, v in pairs.items()}

in_str = None
escape = False
line = 1
col = 0
in_line_comment = False
in_block_comment = False

i = 0
n = len(code)
while i < n:
    ch = code[i]
    if ch == '\n':
        line += 1
        col = 0
        in_line_comment = False
    else:
        col += 1

    if in_line_comment:
        i += 1
        continue
    if in_block_comment:
        if ch == '*' and i + 1 < n and code[i+1] == '/':
            in_block_comment = False
            i += 2
            continue
        i += 1
        continue

    if in_str:
        if escape:
            escape = False
        elif ch == '\\':
            escape = True
        elif ch == in_str:
            in_str = None
        i += 1
        continue

    if ch == '/' and i + 1 < n:
        if code[i+1] == '/':
            in_line_comment = True
            i += 2
            continue
        elif code[i+1] == '*':
            in_block_comment = True
            i += 2
            continue

    if ch in ('"', "'", '`'):
        in_str = ch
        i += 1
        continue

    if ch in pairs:
        stack.append((ch, line, col))
    elif ch in inv:
        if not stack:
            print(f'Unmatched closing {ch} at line {line}:{col}')
            exit(1)
        top, tl, tc = stack.pop()
        if pairs[top] != ch:
            print(f'Mismatched {top} from line {tl}:{tc} closed by {ch} at line {line}:{col}')
            exit(1)
    i += 1

if stack:
    print(f'Unclosed {stack[-1][0]} from line {stack[-1][1]}:{stack[-1][2]}')
    exit(1)

print('JavaScript syntax balance check: 100% PERFECT! (0 unmatched braces/brackets)')
