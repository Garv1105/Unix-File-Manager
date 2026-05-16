import os
import shutil
import stat
import time
import platform

# pwd and grp are Unix-only modules
try:
    import pwd
    import grp
    UNIX = True
except ImportError:
    UNIX = False  # Windows
import subprocess
import mimetypes
from datetime import datetime
from flask import Flask, render_template, request, jsonify, send_file, abort
from pathlib import Path
import json

app = Flask(__name__)
app.config['SECRET_KEY'] = 'unix-file-manager-secret'

# Safe root directory for file operations (sandbox)
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), 'uploads'))
os.makedirs(BASE_DIR, exist_ok=True)

def safe_path(path):
    """Resolve path safely within BASE_DIR sandbox."""
    if not path or path == '/':
        return BASE_DIR
    # Strip leading slash
    path = path.lstrip('/')
    full = os.path.abspath(os.path.join(BASE_DIR, path))
    if not full.startswith(BASE_DIR):
        abort(403)
    return full

def relative_path(abs_path):
    """Return path relative to BASE_DIR."""
    rel = os.path.relpath(abs_path, BASE_DIR)
    if rel == '.':
        return '/'
    return '/' + rel.replace('\\', '/')

def get_file_info(filepath):
    """Get detailed Unix file info."""
    try:
        st = os.stat(filepath)
        mode = st.st_mode
        perms = stat.filemode(mode)
        size = st.st_size
        mtime = datetime.fromtimestamp(st.st_mtime).strftime('%Y-%m-%d %H:%M:%S')
        
        if UNIX:
            try:
                owner = pwd.getpwuid(st.st_uid).pw_name
            except:
                owner = str(st.st_uid)
            try:
                group = grp.getgrgid(st.st_gid).gr_name
            except:
                group = str(st.st_gid)
        else:
            # Windows: no uid/gid concept, use current user
            import getpass
            owner = getpass.getuser()
            group = 'N/A'

        is_dir = os.path.isdir(filepath)
        is_link = os.path.islink(filepath)
        name = os.path.basename(filepath)
        ext = os.path.splitext(name)[1].lower()

        # File type classification
        if is_dir:
            ftype = 'directory'
        elif is_link:
            ftype = 'symlink'
        elif ext in ['.py', '.js', '.ts', '.html', '.css', '.sh', '.c', '.cpp', '.java', '.rb', '.go']:
            ftype = 'code'
        elif ext in ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.webp']:
            ftype = 'image'
        elif ext in ['.mp4', '.avi', '.mkv', '.mov', '.wmv']:
            ftype = 'video'
        elif ext in ['.mp3', '.wav', '.flac', '.ogg', '.aac']:
            ftype = 'audio'
        elif ext in ['.pdf']:
            ftype = 'pdf'
        elif ext in ['.zip', '.tar', '.gz', '.bz2', '.rar', '.7z']:
            ftype = 'archive'
        elif ext in ['.txt', '.md', '.log', '.csv', '.json', '.xml', '.yaml', '.yml']:
            ftype = 'text'
        else:
            ftype = 'file'

        return {
            'name': name,
            'path': relative_path(filepath),
            'type': ftype,
            'is_dir': is_dir,
            'is_link': is_link,
            'permissions': perms,
            'octal_permissions': oct(mode & 0o777),
            'size': size,
            'size_human': human_size(size),
            'mtime': mtime,
            'owner': owner,
            'group': group,
            'inode': st.st_ino,
            'hard_links': st.st_nlink,
            'extension': ext,
        }
    except Exception as e:
        return None

def human_size(size):
    """Convert bytes to human readable."""
    for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
        if size < 1024:
            return f"{size:.1f} {unit}"
        size /= 1024
    return f"{size:.1f} PB"

def run_command(cmd, cwd=None):
    """Run a shell command safely and return output."""
    try:
        result = subprocess.run(
            cmd, shell=True, capture_output=True, text=True,
            timeout=10, cwd=cwd or BASE_DIR
        )
        return {
            'stdout': result.stdout,
            'stderr': result.stderr,
            'returncode': result.returncode
        }
    except subprocess.TimeoutExpired:
        return {'stdout': '', 'stderr': 'Command timed out', 'returncode': -1}
    except Exception as e:
        return {'stdout': '', 'stderr': str(e), 'returncode': -1}

# ─── Routes ──────────────────────────────────────────────────────────────────

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/ls', methods=['GET'])
def list_dir():
    path = request.args.get('path', '/')
    show_hidden = request.args.get('hidden', 'false') == 'true'
    sort_by = request.args.get('sort', 'name')
    
    abs_path = safe_path(path)
    if not os.path.isdir(abs_path):
        return jsonify({'error': 'Not a directory'}), 400

    entries = []
    try:
        for name in os.listdir(abs_path):
            if not show_hidden and name.startswith('.'):
                continue
            fp = os.path.join(abs_path, name)
            info = get_file_info(fp)
            if info:
                entries.append(info)
    except PermissionError:
        return jsonify({'error': 'Permission denied'}), 403

    # Sort
    if sort_by == 'size':
        entries.sort(key=lambda x: (not x['is_dir'], x['size']))
    elif sort_by == 'mtime':
        entries.sort(key=lambda x: (not x['is_dir'], x['mtime']), reverse=True)
    elif sort_by == 'type':
        entries.sort(key=lambda x: (x['type'], x['name'].lower()))
    else:
        entries.sort(key=lambda x: (not x['is_dir'], x['name'].lower()))

    # Breadcrumb
    crumbs = []
    parts = path.strip('/').split('/') if path.strip('/') else []
    crumbs.append({'name': '~', 'path': '/'})
    built = ''
    for p in parts:
        if p:
            built += '/' + p
            crumbs.append({'name': p, 'path': built})

    return jsonify({
        'path': path,
        'entries': entries,
        'breadcrumb': crumbs,
        'total': len(entries)
    })

@app.route('/api/stat', methods=['GET'])
def file_stat():
    path = request.args.get('path', '/')
    abs_path = safe_path(path)
    info = get_file_info(abs_path)
    if not info:
        return jsonify({'error': 'File not found'}), 404
    return jsonify(info)

@app.route('/api/read', methods=['GET'])
def read_file():
    path = request.args.get('path')
    abs_path = safe_path(path)
    if not os.path.isfile(abs_path):
        return jsonify({'error': 'Not a file'}), 400
    if os.path.getsize(abs_path) > 1_000_000:  # 1MB limit for text read
        return jsonify({'error': 'File too large to display (>1MB)'}), 400
    try:
        with open(abs_path, 'r', errors='replace') as f:
            content = f.read()
        return jsonify({'content': content, 'path': path})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/write', methods=['POST'])
def write_file():
    data = request.json
    path = data.get('path')
    content = data.get('content', '')
    abs_path = safe_path(path)
    try:
        with open(abs_path, 'w') as f:
            f.write(content)
        return jsonify({'success': True, 'message': f'Saved {os.path.basename(abs_path)}'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/mkdir', methods=['POST'])
def make_dir():
    data = request.json
    path = data.get('path')
    name = data.get('name')
    abs_path = safe_path(os.path.join(path, name))
    try:
        os.makedirs(abs_path, exist_ok=True)
        return jsonify({'success': True, 'message': f'Directory "{name}" created'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/touch', methods=['POST'])
def touch_file():
    data = request.json
    path = data.get('path')
    name = data.get('name')
    abs_path = safe_path(os.path.join(path, name))
    try:
        Path(abs_path).touch()
        return jsonify({'success': True, 'message': f'File "{name}" created'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/delete', methods=['POST'])
def delete_entry():
    data = request.json
    path = data.get('path')
    abs_path = safe_path(path)
    try:
        if os.path.isdir(abs_path):
            shutil.rmtree(abs_path)
        else:
            os.remove(abs_path)
        return jsonify({'success': True, 'message': f'Deleted successfully'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/rename', methods=['POST'])
def rename_entry():
    data = request.json
    old_path = data.get('old_path')
    new_name = data.get('new_name')
    abs_old = safe_path(old_path)
    parent = os.path.dirname(abs_old)
    abs_new = safe_path(os.path.join(relative_path(parent), new_name))
    try:
        os.rename(abs_old, abs_new)
        return jsonify({'success': True, 'message': f'Renamed to "{new_name}"'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/copy', methods=['POST'])
def copy_entry():
    data = request.json
    src = data.get('src')
    dst_dir = data.get('dst')
    abs_src = safe_path(src)
    abs_dst = safe_path(os.path.join(dst_dir, os.path.basename(src)))
    try:
        if os.path.isdir(abs_src):
            shutil.copytree(abs_src, abs_dst)
        else:
            shutil.copy2(abs_src, abs_dst)
        return jsonify({'success': True, 'message': 'Copied successfully'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/move', methods=['POST'])
def move_entry():
    data = request.json
    src = data.get('src')
    dst_dir = data.get('dst')
    abs_src = safe_path(src)
    abs_dst = safe_path(os.path.join(dst_dir, os.path.basename(src)))
    try:
        shutil.move(abs_src, abs_dst)
        return jsonify({'success': True, 'message': 'Moved successfully'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/chmod', methods=['POST'])
def chmod_file():
    data = request.json
    path = data.get('path')
    mode = data.get('mode')
    abs_path = safe_path(path)
    try:
        os.chmod(abs_path, int(mode, 8))
        return jsonify({'success': True, 'message': f'Permissions changed to {mode}'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/search', methods=['GET'])
def search_files():
    query = request.args.get('q', '')
    path = request.args.get('path', '/')
    abs_path = safe_path(path)
    results = []
    try:
        for root, dirs, files in os.walk(abs_path):
            # Skip hidden dirs
            dirs[:] = [d for d in dirs if not d.startswith('.')]
            for name in dirs + files:
                if query.lower() in name.lower():
                    fp = os.path.join(root, name)
                    info = get_file_info(fp)
                    if info:
                        results.append(info)
            if len(results) >= 100:
                break
    except:
        pass
    return jsonify({'results': results, 'count': len(results)})

@app.route('/api/terminal', methods=['POST'])
def terminal():
    data = request.json
    cmd = data.get('command', '').strip()
    cwd = data.get('cwd', '/')

    # Security: block dangerous commands
    blocked = ['rm -rf /', 'mkfs', 'dd if=', 'fork bomb', ':(){ :|:& };:',
               'shutdown', 'reboot', 'halt', 'init 0']
    for b in blocked:
        if b in cmd:
            return jsonify({'stdout': '', 'stderr': f'Command blocked for safety: {b}', 'returncode': -1})

    abs_cwd = safe_path(cwd)
    result = run_command(cmd, cwd=abs_cwd)
    return jsonify(result)

@app.route('/api/upload', methods=['POST'])
def upload_file():
    path = request.form.get('path', '/')
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    file = request.files['file']
    abs_dir = safe_path(path)
    try:
        dest = os.path.join(abs_dir, file.filename)
        file.save(dest)
        return jsonify({'success': True, 'message': f'Uploaded "{file.filename}"'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/download', methods=['GET'])
def download_file():
    path = request.args.get('path')
    abs_path = safe_path(path)
    if not os.path.isfile(abs_path):
        abort(404)
    return send_file(abs_path, as_attachment=True)

@app.route('/api/diskusage', methods=['GET'])
def disk_usage():
    path = request.args.get('path', '/')
    abs_path = safe_path(path)
    try:
        total, used, free = shutil.disk_usage(abs_path)
        return jsonify({
            'total': total,
            'used': used,
            'free': free,
            'total_human': human_size(total),
            'used_human': human_size(used),
            'free_human': human_size(free),
            'percent': round(used / total * 100, 1)
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/zip', methods=['POST'])
def zip_files():
    data = request.json
    paths = data.get('paths', [])
    name = data.get('name', 'archive')
    dest_dir = data.get('dest', '/')
    abs_dest = safe_path(dest_dir)
    zip_path = os.path.join(abs_dest, f"{name}.zip")
    try:
        import zipfile
        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
            for p in paths:
                ap = safe_path(p)
                if os.path.isdir(ap):
                    for root, dirs, files in os.walk(ap):
                        for file in files:
                            fp = os.path.join(root, file)
                            zf.write(fp, os.path.relpath(fp, os.path.dirname(ap)))
                else:
                    zf.write(ap, os.path.basename(ap))
        return jsonify({'success': True, 'message': f'Created {name}.zip'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/unzip', methods=['POST'])
def unzip_file():
    data = request.json
    path = data.get('path')
    dest = data.get('dest', os.path.dirname(path))
    abs_path = safe_path(path)
    abs_dest = safe_path(dest)
    try:
        import zipfile
        with zipfile.ZipFile(abs_path, 'r') as zf:
            zf.extractall(abs_dest)
        return jsonify({'success': True, 'message': 'Extracted successfully'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    # Create some demo files
    demo_dirs = ['documents', 'images', 'scripts', 'archives']
    for d in demo_dirs:
        os.makedirs(os.path.join(BASE_DIR, d), exist_ok=True)
    
    demo_files = {
        'documents/readme.txt': '# Unix File Manager\n\nWelcome to the Unix File Manager!\nThis is a full-featured web-based file manager.\n\nFeatures:\n- Browse directories\n- Create/delete files and folders\n- Edit text files\n- Change permissions (chmod)\n- Built-in terminal\n- Search files\n- Upload/download files\n',
        'scripts/hello.sh': '#!/bin/bash\n# A simple hello world script\necho "Hello from Unix File Manager!"\necho "Current date: $(date)"\necho "Current user: $(whoami)"\nls -la\n',
        'scripts/disk_info.py': '#!/usr/bin/env python3\n"""Disk information script"""\nimport shutil\nimport os\n\ndef get_disk_info(path="/"):\n    total, used, free = shutil.disk_usage(path)\n    print(f"Total: {total // (2**30)} GB")\n    print(f"Used:  {used // (2**30)} GB")\n    print(f"Free:  {free // (2**30)} GB")\n\nif __name__ == "__main__":\n    get_disk_info()\n',
        'documents/notes.md': '# My Notes\n\n## Unix Commands\n\n- `ls -la` — list all files with details\n- `chmod 755 file` — change permissions\n- `find . -name "*.py"` — find python files\n- `grep -r "text" .` — search in files\n- `tar -czf archive.tar.gz dir/` — create archive\n',
    }
    for rel_path, content in demo_files.items():
        full = os.path.join(BASE_DIR, rel_path)
        os.makedirs(os.path.dirname(full), exist_ok=True)
        if not os.path.exists(full):
            with open(full, 'w') as f:
                f.write(content)
    
    print("=" * 50)
    print("  Unix File Manager")
    print("  Running at http://localhost:5000")
    print("=" * 50)
    app.run(debug=True, port=5000)
