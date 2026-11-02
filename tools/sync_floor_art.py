#!/usr/bin/env python3
"""
THE MUSEUM - Floor Artwork Synchronization Tool

Synchronizes artwork from the 4 floor folders:
  - Floor 1/  (33 artworks)
  - Floor 2/  (34 artworks)
  - Floor 3/  (34 artworks)
  - Floor 4/  (34 artworks)
directly into The Museum game codebase (assets/gallery, game.js, GAME_TEXT.txt, manifests).

Usage:
  python3 tools/sync_floor_art.py [path_to_Museum_Art_By_Floor]
Defaults to ~/Desktop/Museum_Art_By_Floor
"""

import os
import sys
import shutil
import json
import re
import struct

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)
DEFAULT_SOURCE = os.path.expanduser("~/Desktop/Museum_Art_By_Floor")
DEST_GALLERY = os.path.join(PROJECT_DIR, "assets", "gallery")
GAME_JS = os.path.join(PROJECT_DIR, "game.js")
GAME_TEXT = os.path.join(PROJECT_DIR, "GAME_TEXT.txt")
DESKTOP_TEXT = os.path.expanduser("~/Desktop/Museum_Text_Files/05_FULL_GAME_TEXT.txt")
MANIFEST_JSON = os.path.join(PROJECT_DIR, "assets", "gallery_manifest.json")
PLACEMENTS_JSON = os.path.join(PROJECT_DIR, "assets", "curated_placements.json")

def get_image_dimensions(filepath):
    """Read image dimensions without external dependencies."""
    try:
        from PIL import Image
        with Image.open(filepath) as img:
            return img.size
    except Exception:
        pass

    try:
        with open(filepath, "rb") as f:
            header = f.read(30)
            # PNG
            if header[:8] == b"\x89PNG\r\n\x1a\n":
                w, h = struct.unpack(">LL", header[16:24])
                return int(w), int(h)
            # GIF
            elif header[:6] in (b"GIF87a", b"GIF89a"):
                w, h = struct.unpack("<HH", header[6:10])
                return int(w), int(h)
            # JPEG
            elif header[:2] == b"\xff\xd8":
                f.seek(0)
                f.read(2)
                b = f.read(1)
                while b:
                    while b != b"\xff":
                        b = f.read(1)
                    while b == b"\xff":
                        b = f.read(1)
                    if 0xc0 <= ord(b) <= 0xc3:
                        f.read(3)
                        h, w = struct.unpack(">HH", f.read(4))
                        return int(w), int(h)
                    else:
                        f.read(int(struct.unpack(">H", f.read(2))[0]) - 2)
                    b = f.read(1)
    except Exception:
        pass
    return 800, 600

def format_title_from_filename(filename):
    name = os.path.splitext(filename)[0]
    name = re.sub(r'^\d+[\s_-]*', '', name)
    name = name.replace('-', ' ').replace('_', ' ')
    return ' '.join(word.capitalize() for word in name.split())

def main():
    source_dir = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_SOURCE
    if not os.path.exists(source_dir):
        print(f"Source directory not found: {source_dir}")
        sys.exit(1)

    floor_folders = [
        ("Floor 1", 0, "1ST FLOOR"),
        ("Floor 2", 1, "2ND FLOOR"),
        ("Floor 3", 2, "3RD FLOOR"),
        ("Floor 4", 3, "4TH FLOOR")
    ]

    # Pre-load known curated titles from GAME_TEXT.txt if available
    known_titles = {}
    if os.path.exists(GAME_TEXT):
        with open(GAME_TEXT, "r", encoding="utf-8") as f:
            text = f.read()
        for fn, title in re.findall(r'# image: (.*?)\s*\nart\.\d+ = (.*?)\s*\n', text):
            known_titles[fn.strip()] = title.strip()

    os.makedirs(DEST_GALLERY, exist_ok=True)
    all_arts = []
    art_id = 1
    titles_map = {}

    valid_exts = {'.jpg', '.jpeg', '.png', '.webp', '.gif'}

    for folder_name, floor_idx, wing_label in floor_folders:
        folder_path = os.path.join(source_dir, folder_name)
        if not os.path.exists(folder_path):
            print(f"Warning: Folder not found: {folder_path}")
            continue

        files = sorted([f for f in os.listdir(folder_path) if os.path.splitext(f.lower())[1] in valid_exts])

        for fname in files:
            src_file = os.path.join(folder_path, fname)
            dest_file = os.path.join(DEST_GALLERY, fname)

            # Copy file to assets/gallery if not present or changed
            if not os.path.exists(dest_file) or os.path.getsize(src_file) != os.path.getsize(dest_file):
                shutil.copy2(src_file, dest_file)

            img_w, img_h = get_image_dimensions(src_file)
            aspect = (img_w / img_h) if img_h > 0 else 1.333
            if aspect >= 1.0:
                frame_w = 2.15
                frame_h = round(2.15 / aspect, 3)
            else:
                frame_h = 2.15
                frame_w = round(2.15 * aspect, 3)

            title = known_titles.get(fname, format_title_from_filename(fname))
            rel_file = f"assets/gallery/{fname}"

            all_arts.append({
                "id": art_id,
                "floor": floor_idx,
                "title": title,
                "file": rel_file,
                "wing": wing_label,
                "w": frame_w,
                "h": frame_h
            })
            titles_map[art_id] = (fname, title)
            art_id += 1

    print(f"Synced {len(all_arts)} artworks across 4 floors:")
    for f in range(4):
        count = len([a for a in all_arts if a['floor'] == f])
        print(f"  Floor {f+1}: {count} artworks")

    # Update game.js CURATED_ARTWORKS array
    with open(GAME_JS, "r", encoding="utf-8") as f:
        game_code = f.read()

    arts_json = json.dumps(all_arts, indent=2)
    game_code = re.sub(
        r'const CURATED_ARTWORKS = \[.*?\];',
        f'const CURATED_ARTWORKS = {arts_json};',
        game_code,
        flags=re.DOTALL
    )

    with open(GAME_JS, "w", encoding="utf-8") as f:
        f.write(game_code)
    print("Updated game.js with new artwork definitions.")

    # Update manifests
    with open(MANIFEST_JSON, "w", encoding="utf-8") as f:
        json.dump(all_arts, f, indent=2)
    with open(PLACEMENTS_JSON, "w", encoding="utf-8") as f:
        json.dump(all_arts, f, indent=2)
    print("Updated gallery manifests.")

    # Update GAME_TEXT.txt and desktop text file
    titles_text = "[ ARTWORK TITLES ]\n# Shown on the wall plaque, in the [E] prompt, and in the artwork popup.\n# The image file for each one is noted in the line above it.\n"
    for aid in sorted(titles_map.keys()):
        fn, t = titles_map[aid]
        titles_text += f"# image: {fn}\nart.{aid:03d} = {t}\n\n"

    for path in [GAME_TEXT, DESKTOP_TEXT]:
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                content = f.read()
            m = re.search(r'\[ ARTWORK TITLES \].*', content, re.DOTALL)
            if m:
                content = content[:m.start()] + titles_text
                with open(path, "w", encoding="utf-8") as f:
                    f.write(content)

    print("Artwork sync complete!")

if __name__ == "__main__":
    main()
