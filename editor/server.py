#!/usr/bin/env python3
"""
Museum 3D Editor Server
Provides local REST API endpoints for:
- Serving editor web assets & game files
- Saving / loading scene overrides (assets/curated_overrides.json)
- Managing 3D model & texture assets (assets/relics, assets/textures, etc.)
- Ollama local LLM proxy (/api/ollama/tags, /api/ollama/chat) with full CORS support
"""

import sys
import os
import json
import urllib.request
import urllib.error
import urllib.parse
from http.server import HTTPServer, SimpleHTTPRequestHandler

PORT = 8099
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OVERRIDES_FILE = os.path.join(ROOT_DIR, 'assets', 'curated_overrides.json')
BACKUPS_DIR = os.path.join(ROOT_DIR, 'assets', 'overrides_backups')

OLLAMA_BASE_URL = os.environ.get('OLLAMA_HOST', 'http://127.0.0.1:11434')

class EditorHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT_DIR, **kwargs)

    def end_headers(self):
        # Enable CORS for local editing
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        url = urllib.parse.urlparse(self.path)
        path = url.path

        if path == '/api/editor/status':
            self.send_json_response({
                'status': 'ok',
                'rootDir': ROOT_DIR,
                'overridesFile': OVERRIDES_FILE,
                'ollamaBase': OLLAMA_BASE_URL
            })
            return

        elif path == '/api/editor/overrides':
            # Return current saved scene overrides
            if os.path.exists(OVERRIDES_FILE):
                try:
                    with open(OVERRIDES_FILE, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                    self.send_json_response(data)
                except Exception as e:
                    self.send_json_response({'objects': {}, 'customModels': [], 'error': str(e)}, 500)
            else:
                self.send_json_response({'objects': {}, 'customModels': []})
            return

        elif path == '/api/editor/assets':
            # List available 3D models and textures in the project
            assets = {
                'relics': [],
                'models': [],
                'textures': []
            }
            # Scan relics
            relics_dir = os.path.join(ROOT_DIR, 'assets', 'relics')
            if os.path.exists(relics_dir):
                for f in sorted(os.listdir(relics_dir)):
                    if f.endswith(('.glb', '.gltf', '.obj')):
                        assets['relics'].append({
                            'name': f,
                            'path': f'assets/relics/{f}',
                            'size': os.path.getsize(os.path.join(relics_dir, f))
                        })
            # Scan 3D_Source_Models
            source_dir = os.path.join(ROOT_DIR, '3D_Source_Models')
            if os.path.exists(source_dir):
                for f in sorted(os.listdir(source_dir)):
                    if f.endswith(('.glb', '.gltf', '.obj')):
                        assets['models'].append({
                            'name': f,
                            'path': f'3D_Source_Models/{f}',
                            'size': os.path.getsize(os.path.join(source_dir, f))
                        })
            # Scan textures
            tex_dir = os.path.join(ROOT_DIR, 'assets', 'textures')
            if os.path.exists(tex_dir):
                for f in sorted(os.listdir(tex_dir)):
                    if f.endswith(('.png', '.jpg', '.jpeg', '.webp')):
                        assets['textures'].append({
                            'name': f,
                            'path': f'assets/textures/{f}',
                            'size': os.path.getsize(os.path.join(tex_dir, f))
                        })
            self.send_json_response(assets)
            return

        elif path == '/api/ollama/tags':
            # Proxy Ollama /api/tags to query installed models
            target = f"{OLLAMA_BASE_URL}/api/tags"
            try:
                req = urllib.request.Request(target)
                with urllib.request.urlopen(req, timeout=3.0) as resp:
                    body = resp.read()
                    self.send_response(resp.status)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(body)
            except Exception as e:
                self.send_json_response({
                    'models': [],
                    'connected': False,
                    'error': f'Ollama is not running locally on {OLLAMA_BASE_URL}. Start Ollama (run `ollama serve` or open the Ollama app) to enable local AI assistance.'
                })
            return

        # Fallback to static file server
        super().do_GET()

    def do_POST(self):
        url = urllib.parse.urlparse(self.path)
        path = url.path

        if path == '/api/editor/save':
            try:
                length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(length)
                data = json.loads(body.decode('utf-8'))

                # Create backup of previous overrides if exists
                os.makedirs(BACKUPS_DIR, exist_ok=True)
                if os.path.exists(OVERRIDES_FILE):
                    import time
                    backup_path = os.path.join(BACKUPS_DIR, f"overrides_{int(time.time())}.json")
                    with open(OVERRIDES_FILE, 'r', encoding='utf-8') as src, open(backup_path, 'w', encoding='utf-8') as dst:
                        dst.write(src.read())

                # Write updated overrides file
                os.makedirs(os.path.dirname(OVERRIDES_FILE), exist_ok=True)
                with open(OVERRIDES_FILE, 'w', encoding='utf-8') as f:
                    json.dump(data, f, indent=2)

                self.send_json_response({'status': 'saved', 'message': 'Scene overrides successfully persisted to project!'})
            except Exception as e:
                self.send_json_response({'error': str(e)}, 500)
            return

        elif path == '/api/ollama/chat':
            # Proxy Ollama /api/chat
            try:
                length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(length)

                target = f"{OLLAMA_BASE_URL}/api/chat"
                req = urllib.request.Request(target, data=body, headers={'Content-Type': 'application/json'}, method='POST')
                with urllib.request.urlopen(req, timeout=60.0) as resp:
                    resp_body = resp.read()
                    self.send_response(resp.status)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(resp_body)
            except urllib.error.URLError as e:
                self.send_json_response({
                    'error': f'Could not connect to Ollama at {OLLAMA_BASE_URL}. Please ensure Ollama is installed and running (`ollama serve`).'
                }, 503)
            except Exception as e:
                self.send_json_response({'error': str(e)}, 500)
            return

        super().do_POST()

    def send_json_response(self, data, code=200):
        body = json.dumps(data).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

def run():
    global PORT
    while True:
        try:
            server = HTTPServer(('127.0.0.1', PORT), EditorHandler)
            print(f"[Museum Editor Server] Running on http://127.0.0.1:{PORT}")
            server.serve_forever()
            break
        except OSError:
            PORT += 1

if __name__ == '__main__':
    run()
