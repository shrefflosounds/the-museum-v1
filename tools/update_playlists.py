#!/usr/bin/env python3
"""
Syncs The Museum video installation playlists directly from YouTube.
Fetches all videos in order and updates both playlists.json and the embedded playlistVideoLists in game.js.
"""

import urllib.request
import json
import re
import os
import sys

PLAYLISTS = [
    'PLCmArB5wTc0SIKYXG2EQX3ZyHLuLbtlld', # Floor 1
    'PL6HPvbUV3y90GTk3elKRPsG8zTlm5t7kv', # Floor 2
    'PLxdcA8wIcZd1fsXxDiTDoIgaHPQRLiWUp', # Floor 3
    'PLqPry1bfNMgnYIhDUxlMWalX7IW-1JA_I'  # Floor 4
]

def fetch_playlist_videos(playlist_id):
    url = f'https://www.youtube.com/playlist?list={playlist_id}'
    req = urllib.request.Request(url, headers={
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    })
    html = urllib.request.urlopen(req, timeout=15).read().decode('utf-8')
    idx = html.find('ytInitialData = ')
    if idx == -1:
        raise ValueError(f"Could not find ytInitialData for playlist {playlist_id}")
    obj, _ = json.JSONDecoder().raw_decode(html[idx + len('ytInitialData = '):])
    
    vids = []
    def find_vids(node):
        if isinstance(node, dict):
            if 'lockupViewModel' in node:
                vm = node['lockupViewModel']
                vid = vm.get('contentId')
                if not vid:
                    try:
                        vid = vm['rendererContext']['commandContext']['onTap']['innertubeCommand']['watchEndpoint']['videoId']
                    except: pass
                if vid: vids.append(vid)
            elif 'playlistVideoRenderer' in node:
                vid = node['playlistVideoRenderer'].get('videoId')
                if vid: vids.append(vid)
            else:
                for k, v in node.items(): find_vids(v)
        elif isinstance(node, list):
            for v in node: find_vids(v)
            
    try:
        tabs = obj['contents']['twoColumnBrowseResultsRenderer']['tabs']
        tab_content = tabs[0]['tabRenderer']['content']
        find_vids(tab_content)
    except:
        find_vids(obj)
        
    seen = set()
    dedup = [x for x in vids if not (x in seen or seen.add(x))]
    return dedup

def main():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    playlists_file = os.path.join(base_dir, 'playlists.json')
    game_js_file = os.path.join(base_dir, 'game.js')

    results = {}
    print("Fetching YouTube playlists...")
    for pl in PLAYLISTS:
        try:
            vids = fetch_playlist_videos(pl)
            results[pl] = vids
            print(f"  {pl}: {len(vids)} videos found")
        except Exception as e:
            print(f"  Error fetching {pl}: {e}")
            if os.path.exists(playlists_file):
                with open(playlists_file) as f:
                    cached = json.load(f)
                    if pl in cached:
                        results[pl] = cached[pl]
                        print(f"  Using cached {pl} ({len(results[pl])} videos)")

    # 1. Update playlists.json
    with open(playlists_file, 'w') as f:
        json.dump(results, f, indent=2)
    print(f"Updated {playlists_file}")

    # 2. Update embedded fallback in game.js
    if os.path.exists(game_js_file):
        with open(game_js_file, 'r') as f:
            code = f.read()

        formatted_lines = []
        for pl in PLAYLISTS:
            formatted_lines.append(f"        '{pl}': {json.dumps(results.get(pl, []))},")
        block = "this.playlistVideoLists = {\n" + "\n".join(formatted_lines) + "\n      };"

        updated_code = re.sub(
            r'this\.playlistVideoLists\s*=\s*\{.*?\n      \};',
            block,
            code,
            flags=re.DOTALL
        )

        with open(game_js_file, 'w') as f:
            f.write(updated_code)
        print(f"Updated embedded playlistVideoLists in {game_js_file}")

if __name__ == '__main__':
    main()
