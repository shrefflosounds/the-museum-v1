#!/usr/bin/env python3
"""
THE MUSEUM — Dynamic Relic Synchronization Tool
Scans '3D_Source_Models/Models for game relics' for .glb files,
optimizes/decimates any un-optimized models using Blender,
and synchronizes the game files (assets/relics_manifest.json, game.js, GAME_TEXT.txt)
so the game automatically accommodates any number of relics.
"""

import os
import sys
import re
import json
import shutil
import subprocess

PROJECT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE_DIR = os.path.join(PROJECT_DIR, '3D_Source_Models', 'Models for game relics')
DEST_DIR = os.path.join(PROJECT_DIR, 'assets', 'relics')
MANIFEST_PATH = os.path.join(PROJECT_DIR, 'assets', 'relics_manifest.json')
GAME_JS_PATH = os.path.join(PROJECT_DIR, 'game.js')
GAME_TEXT_PATH = os.path.join(PROJECT_DIR, 'GAME_TEXT.txt')

PALETTE = [
    0xd946ef, 0xef4444, 0xf59e0b, 0x38bdf8, 0xfacc15, 0x34d399,
    0xfb923c, 0xa855f7, 0x06b6d4, 0xeab308, 0x94a3b8, 0x10b981,
    0x38bdf8, 0xf43f5e, 0xec4899, 0x6366f1, 0x14b8a6, 0x84cc16
]

def clean_camel(name):
    # e.g. "R3E4 Action Figure.glb" -> "R3E4ActionFigure.glb"
    base = os.path.splitext(name)[0]
    base = re.sub(r"['\.\-]", '', base)
    words = base.split()
    return ''.join(words) + '.glb'

def get_blender_path():
    candidates = [
        '/Applications/Blender.app/Contents/MacOS/Blender',
        shutil.which('blender')
    ]
    for c in candidates:
        if c and os.path.exists(c):
            return c
    return None

def decimate_model(blender_bin, src_path, dest_path):
    print(f"  [DECIMATING] {os.path.basename(src_path)} -> {os.path.basename(dest_path)}...")
    py_script = f"""
import bpy, os
src = {repr(src_path)}
dest = {repr(dest_path)}

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)

mesh_obj = None
for obj in bpy.context.scene.objects:
    if obj.type == 'MESH':
        mesh_obj = obj
        break

if mesh_obj:
    orig_faces = len(mesh_obj.data.polygons)
    if orig_faces > 36000:
        mod = mesh_obj.modifiers.new(name='Decimate', type='DECIMATE')
        mod.ratio = 35000.0 / orig_faces
        with bpy.context.temp_override(object=mesh_obj, active_object=mesh_obj):
            bpy.ops.object.modifier_apply(modifier=mod.name)

for img in bpy.data.images:
    w, h = img.size[:]
    if w > 1024 or h > 1024:
        img.scale(1024, 1024)

bpy.ops.export_scene.gltf(
    filepath=dest,
    export_format='GLB',
    use_selection=False,
    export_apply=True
)
"""
    cmd = [blender_bin, '--background', '--python-expr', py_script]
    res = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if res.returncode == 0 and os.path.exists(dest_path):
        sz = os.path.getsize(dest_path) / 1024 / 1024
        print(f"  [DONE] Optimized: {sz:.2f} MB")
    else:
        print(f"  [ERROR] Blender decimation failed for {src_path}")

def sync():
    print(f"=== THE MUSEUM RELIC SYNC ===")
    os.makedirs(DEST_DIR, exist_ok=True)

    source_files = sorted([f for f in os.listdir(SOURCE_DIR) if f.endswith('.glb')])
    print(f"Found {len(source_files)} source relics in '{SOURCE_DIR}':")

    blender_bin = get_blender_path()
    relics_list = []

    for idx, fname in enumerate(source_files):
        src_path = os.path.join(SOURCE_DIR, fname)
        raw_name = os.path.splitext(fname)[0]
        dest_filename = clean_camel(fname)
        dest_path = os.path.join(DEST_DIR, dest_filename)

        if not os.path.exists(dest_path) or os.path.getsize(dest_path) == 0:
            if blender_bin:
                decimate_model(blender_bin, src_path, dest_path)
            else:
                shutil.copyfile(src_path, dest_path)
                print(f"  [COPIED] {dest_filename}")

        color = PALETTE[idx % len(PALETTE)]
        relics_list.append({
            "id": idx + 1,
            "file": f"assets/relics/{dest_filename}",
            "defaultName": raw_name,
            "color": color
        })
        print(f"  {idx + 1:2d}. {raw_name:22s} -> assets/relics/{dest_filename}")

    # Write manifest
    with open(MANIFEST_PATH, 'w') as f:
        json.dump(relics_list, f, indent=2)
    print(f"\nSaved manifest to {MANIFEST_PATH}")

    # Update game.js RELIC_TYPES
    if os.path.exists(GAME_JS_PATH):
        with open(GAME_JS_PATH, 'r') as f:
            content = f.read()

        js_relics = "const RELIC_TYPES = [\n"
        for r in relics_list:
            js_relics += f"        {{ id: {r['id']}, file: '{r['file']}', defaultName: {repr(r['defaultName'])}, color: {hex(r['color'])} }},\n"
        js_relics = js_relics.rstrip(',\n') + "\n      ];"

        pattern = r"const RELIC_TYPES = \[[\s\S]*?\];"
        new_content = re.sub(pattern, js_relics, content, count=1)
        if new_content != content:
            with open(GAME_JS_PATH, 'w') as f:
                f.write(new_content)
            print(f"Updated RELIC_TYPES in game.js ({len(relics_list)} relics, CONFIG.TOTAL_RELICS = {len(relics_list)})")

    # Update GAME_TEXT.txt
    if os.path.exists(GAME_TEXT_PATH):
        with open(GAME_TEXT_PATH, 'r') as f:
            gt_content = f.read()

        lines = gt_content.splitlines()
        new_lines = []
        i = 0
        while i < len(lines):
            line = lines[i]
            if line.strip().startswith('relic.1.name ='):
                # Replace relic block
                for r in relics_list:
                    new_lines.append(f"relic.{r['id']}.name = {r['defaultName']}")
                # Skip until next comment or blank
                while i < len(lines) and (lines[i].strip().startswith('relic.') and '.name' in lines[i]):
                    i += 1
                continue
            new_lines.append(line)
            i += 1

        with open(GAME_TEXT_PATH, 'w') as f:
            f.write('\n'.join(new_lines) + '\n')
        print(f"Updated relic names in GAME_TEXT.txt")

    print(f"\n=== SYNC COMPLETE: {len(relics_list)} ACTIVE RELICS IN THE MUSEUM ===")

if __name__ == '__main__':
    sync()
