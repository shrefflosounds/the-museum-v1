#!/usr/bin/env python3
"""
THE MUSEUM — Unified 3D Model Synchronization & Optimization Tool
Scans '3D_Source_Models' and '3D_Source_Models/Models for game relics' for .glb files,
detects when any source model has been created or modified (via mtime/size),
optimizes/decimates models using Blender (or copies directly as fallback),
and updates asset files, manifests, and game declarations so the game is always up to date.
"""

import os
import sys
import re
import json
import shutil
import subprocess
import time

PROJECT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE_DIR = os.path.join(PROJECT_DIR, '3D_Source_Models')
RELICS_SOURCE_DIR = os.path.join(SOURCE_DIR, 'Models for game relics')

ASSETS_DIR = os.path.join(PROJECT_DIR, 'assets')
RELICS_DEST_DIR = os.path.join(ASSETS_DIR, 'relics')
RELICS_RAW_DIR = os.path.join(ASSETS_DIR, 'relics_original_raw')

MANIFEST_PATH = os.path.join(ASSETS_DIR, 'relics_manifest.json')
GAME_JS_PATH = os.path.join(PROJECT_DIR, 'game.js')
GAME_TEXT_PATH = os.path.join(PROJECT_DIR, 'GAME_TEXT.txt')

PALETTE = [
    0xd946ef, 0xef4444, 0xf59e0b, 0x38bdf8, 0xfacc15, 0x34d399,
    0xfb923c, 0xa855f7, 0x06b6d4, 0xeab308, 0x94a3b8, 0x10b981,
    0x38bdf8, 0xf43f5e, 0xec4899, 0x6366f1, 0x14b8a6, 0x84cc16
]

def clean_camel(name):
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

def optimize_model(blender_bin, src_path, dest_path, raw_dest_path=None, model_type="generic"):
    print(f"  [OPTIMIZING] {os.path.basename(src_path)} -> {os.path.relpath(dest_path, PROJECT_DIR)} ({model_type})...")
    
    # Always keep raw backup
    if raw_dest_path:
        os.makedirs(os.path.dirname(raw_dest_path), exist_ok=True)
        shutil.copyfile(src_path, raw_dest_path)
    
    os.makedirs(os.path.dirname(dest_path), exist_ok=True)

    if not blender_bin:
        shutil.copyfile(src_path, dest_path)
        print(f"  [COPIED] {os.path.basename(dest_path)} (Blender not found)")
        return True

    # Configure decimation & texture limits based on model type
    if model_type == "hand":
        decimate_code = """
    orig_faces = len(mesh_obj.data.polygons)
    if orig_faces > 20000:
        mod = mesh_obj.modifiers.new(name='Decimate', type='DECIMATE')
        mod.ratio = 0.35
        with bpy.context.temp_override(object=mesh_obj, active_object=mesh_obj):
            bpy.ops.object.modifier_apply(modifier=mod.name)
"""
        max_tex = 2048
    elif model_type == "relic":
        decimate_code = """
    orig_faces = len(mesh_obj.data.polygons)
    if orig_faces > 36000:
        mod = mesh_obj.modifiers.new(name='Decimate', type='DECIMATE')
        mod.ratio = 35000.0 / orig_faces
        with bpy.context.temp_override(object=mesh_obj, active_object=mesh_obj):
            bpy.ops.object.modifier_apply(modifier=mod.name)
"""
        max_tex = 1024
    else:  # monster / smitty / generic
        decimate_code = """
    orig_faces = len(mesh_obj.data.polygons)
    if orig_faces > 36000:
        mod = mesh_obj.modifiers.new(name='Decimate', type='DECIMATE')
        mod.ratio = 35000.0 / orig_faces
        with bpy.context.temp_override(object=mesh_obj, active_object=mesh_obj):
            bpy.ops.object.modifier_apply(modifier=mod.name)
"""
        max_tex = 2048

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
{decimate_code}

for img in bpy.data.images:
    w, h = img.size[:]
    if w > {max_tex} or h > {max_tex}:
        img.scale(max(512, w // 2), max(512, h // 2))

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
        print(f"  [DONE] Optimized {os.path.basename(dest_path)}: {sz:.2f} MB")
        return True
    else:
        print(f"  [FALLBACK] Blender decimation failed for {src_path}, copying directly...")
        shutil.copyfile(src_path, dest_path)
        return True

def needs_update(src_path, dest_path):
    if not os.path.exists(src_path):
        return False
    if not os.path.exists(dest_path) or os.path.getsize(dest_path) == 0:
        return True
    return os.path.getmtime(src_path) > os.path.getmtime(dest_path)

def sync_models(force=False, verbose=True):
    blender_bin = get_blender_path()
    updated_any = False

    if verbose:
        print("=== THE MUSEUM 3D MODEL SYNCHRONIZATION ===")
        print(f"Blender: {blender_bin if blender_bin else 'NOT FOUND (direct copy mode)'}")

    # Standard model mappings
    standard_models = [
        {
            "name": "LeftHand",
            "type": "hand",
            "src": os.path.join(SOURCE_DIR, "LeftHand.glb"),
            "dest": os.path.join(ASSETS_DIR, "LeftHand.glb"),
            "raw": os.path.join(ASSETS_DIR, "LeftHand_original_raw.glb")
        },
        {
            "name": "PlayerHand",
            "type": "hand",
            "src": os.path.join(SOURCE_DIR, "PlayerHand.glb"),
            "dest": os.path.join(ASSETS_DIR, "PlayerHand.glb"),
            "raw": os.path.join(ASSETS_DIR, "PlayerHand_original_raw.glb")
        },
        {
            "name": "SMITTY",
            "type": "monster",
            "src": os.path.join(SOURCE_DIR, "SMITTY-Model.glb"),
            "dest": os.path.join(ASSETS_DIR, "smitty.glb"),
            "raw": os.path.join(ASSETS_DIR, "smitty_original_raw.glb")
        }
    ]

    for m in standard_models:
        if os.path.exists(m["src"]):
            if force or needs_update(m["src"], m["dest"]):
                if verbose:
                    print(f"\n[Detected change] {m['name']} ({m['src']})")
                optimize_model(blender_bin, m["src"], m["dest"], m["raw"], m["type"])
                # Set mtime to match or exceed source
                now = time.time()
                os.utime(m["dest"], (now, now))
                updated_any = True
            elif verbose:
                print(f"  [OK] {m['name']} is up-to-date.")

    # Relics synchronization
    if os.path.exists(RELICS_SOURCE_DIR):
        os.makedirs(RELICS_DEST_DIR, exist_ok=True)
        os.makedirs(RELICS_RAW_DIR, exist_ok=True)
        relic_sources = sorted([f for f in os.listdir(RELICS_SOURCE_DIR) if f.endswith('.glb')])
        
        relics_list = []
        relic_updated = False

        for idx, fname in enumerate(relic_sources):
            src_path = os.path.join(RELICS_SOURCE_DIR, fname)
            raw_name = os.path.splitext(fname)[0]
            dest_filename = clean_camel(fname)
            dest_path = os.path.join(RELICS_DEST_DIR, dest_filename)
            raw_path = os.path.join(RELICS_RAW_DIR, dest_filename)

            if force or needs_update(src_path, dest_path):
                if verbose:
                    print(f"\n[Detected change] Relic: {raw_name}")
                optimize_model(blender_bin, src_path, dest_path, raw_path, "relic")
                now = time.time()
                os.utime(dest_path, (now, now))
                relic_updated = True
                updated_any = True

            color = PALETTE[idx % len(PALETTE)]
            relics_list.append({
                "id": idx + 1,
                "file": f"assets/relics/{dest_filename}",
                "defaultName": raw_name,
                "color": color
            })

        # Check if manifest needs update
        manifest_needed = relic_updated or (not os.path.exists(MANIFEST_PATH))
        if not manifest_needed and os.path.exists(MANIFEST_PATH):
            try:
                with open(MANIFEST_PATH, 'r') as f:
                    curr_manifest = json.load(f)
                if len(curr_manifest) != len(relics_list) or curr_manifest != relics_list:
                    manifest_needed = True
            except Exception:
                manifest_needed = True

        if manifest_needed:
            with open(MANIFEST_PATH, 'w') as f:
                json.dump(relics_list, f, indent=2)
            if verbose:
                print(f"Saved relics manifest ({len(relics_list)} relics)")

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
                    if verbose:
                        print(f"Updated RELIC_TYPES in game.js ({len(relics_list)} relics)")

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
                        for r in relics_list:
                            new_lines.append(f"relic.{r['id']}.name = {r['defaultName']}")
                        while i < len(lines) and (lines[i].strip().startswith('relic.') and '.name' in lines[i]):
                            i += 1
                        continue
                    new_lines.append(line)
                    i += 1

                with open(GAME_TEXT_PATH, 'w') as f:
                    f.write('\n'.join(new_lines) + '\n')
                if verbose:
                    print("Updated relic names in GAME_TEXT.txt")

    if verbose:
        if updated_any:
            print("\n=== SYNCHRONIZATION COMPLETE: ASSETS UPDATED ===")
        else:
            print("\n=== ALL 3D MODELS ARE UP TO DATE ===")

    return updated_any

if __name__ == '__main__':
    force_flag = '--force' in sys.argv
    quiet_flag = '--quiet' in sys.argv
    sync_models(force=force_flag, verbose=(not quiet_flag))
