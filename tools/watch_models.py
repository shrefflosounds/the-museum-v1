#!/usr/bin/env python3
"""
THE MUSEUM — 3D Model Real-Time File Watcher Daemon
Continuously monitors '3D_Source_Models' and '3D_Source_Models/Models for game relics'
for any modifications, replacements, or additions to .glb files, and triggers
sync_models.py immediately upon detection.
"""

import os
import sys
import time
from sync_models import sync_models, SOURCE_DIR, RELICS_SOURCE_DIR

CHECK_INTERVAL = 1.5  # seconds

def get_source_state():
    state = {}
    if os.path.exists(SOURCE_DIR):
        for f in os.listdir(SOURCE_DIR):
            if f.endswith('.glb'):
                p = os.path.join(SOURCE_DIR, f)
                try:
                    state[p] = os.path.getmtime(p)
                except OSError:
                    pass
    if os.path.exists(RELICS_SOURCE_DIR):
        for f in os.listdir(RELICS_SOURCE_DIR):
            if f.endswith('.glb'):
                p = os.path.join(RELICS_SOURCE_DIR, f)
                try:
                    state[p] = os.path.getmtime(p)
                except OSError:
                    pass
    return state

def watch():
    print("=== THE MUSEUM MODEL WATCHER STARTED ===")
    print(f"Watching: {SOURCE_DIR}")
    print(f"Interval: {CHECK_INTERVAL}s")
    
    # Run an initial sync pass to ensure everything is current
    sync_models(verbose=False)
    
    last_state = get_source_state()

    while True:
        try:
            time.sleep(CHECK_INTERVAL)
            current_state = get_source_state()
            
            # Check if any file was modified, added, or deleted
            changed = False
            for path, mtime in current_state.items():
                if path not in last_state or mtime > last_state[path]:
                    print(f"[{time.strftime('%X')}] File changed: {os.path.basename(path)}")
                    changed = True
                    break
            
            if not changed and set(current_state.keys()) != set(last_state.keys()):
                changed = True

            if changed:
                # Debounce slightly so any large file write has finished
                time.sleep(0.5)
                sync_models(verbose=True)
                last_state = get_source_state()

        except KeyboardInterrupt:
            print("\nModel watcher stopped.")
            break
        except Exception as e:
            print(f"Watcher error: {e}")
            time.sleep(2)

if __name__ == '__main__':
    watch()
