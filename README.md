# Unix File Manager
### A Full-Featured Web-Based Unix File Manager (College Project)

---

## Project Overview

A Python/Flask-powered Unix File Manager with a terminal-inspired UI. Demonstrates core OS concepts:
- File system operations (CRUD)
- Unix permissions (chmod/stat)
- Process execution (subprocess/terminal)
- Directory traversal and search

---

## Project Structure

```
unix-file-manager/
├── app.py               ← Flask backend (all API routes)
├── requirements.txt     ← Python dependencies
├── uploads/             ← Sandboxed working directory (created on first run)
│   ├── documents/
│   ├── images/
│   └── scripts/
├── templates/
│   └── index.html       ← Single-page HTML UI
└── static/
    ├── css/
    │   └── style.css    ← Terminal-themed styles
    └── js/
        └── app.js       ← Frontend logic (vanilla JS)
```

---

## Setup & Installation

### Step 1: Install Python 3.8+
```bash
python3 --version   # Should be 3.8 or newer
```

### Step 2: Clone / Place the project folder
```bash
cd ~/Desktop
# If using git:
git clone <repo-url> unix-file-manager
# Or just place the folder here
cd unix-file-manager
```

### Step 3: Create a virtual environment
```bash
python3 -m venv venv
source venv/bin/activate        # Linux/Mac
# venv\Scripts\activate         # Windows
```

### Step 4: Install dependencies
```bash
pip install -r requirements.txt
```

### Step 5: Run the app
```bash
python app.py
```

### Step 6: Open in browser
```
http://localhost:5000
```

---

## Features

| Feature | Description | Unix Concept |
|---------|-------------|--------------|
| Browse Files | Navigate directories with grid/list view | `ls`, `opendir()` |
| Create Files | Create empty files | `touch` |
| Create Folders | Create directories | `mkdir` |
| Edit Files | Built-in text editor with line numbers | `vi`, `nano` |
| Delete | Remove files and directories | `rm`, `rmdir` |
| Rename | Rename files/folders | `mv` |
| Copy/Move | Copy or move files | `cp`, `mv` |
| Permissions | Visual chmod editor (rwx grid + octal) | `chmod`, `stat()` |
| File Info | Inode, hard links, owner, group, size | `stat`, `ls -la` |
| Terminal | Built-in bash terminal with history | `bash`, `subprocess` |
| Search | Recursive file search | `find` |
| Upload | Drag & drop or click to upload | `write()` |
| Download | Download any file | `read()` |
| Zip/Unzip | Create and extract ZIP archives | `zip`, `tar` |
| Disk Usage | Visual disk usage bar | `df` |
| Hidden Files | Toggle dot-files visibility | `ls -a` |
| Sort | Sort by name, size, type, modified | `ls --sort` |

---

## API Endpoints

```
GET  /api/ls?path=/&hidden=false&sort=name   List directory
GET  /api/stat?path=/file.txt                File info (stat)
GET  /api/read?path=/file.txt                Read file content
POST /api/write                              Save file content
POST /api/mkdir                              Create directory
POST /api/touch                              Create empty file
POST /api/delete                             Delete file/dir
POST /api/rename                             Rename file/dir
POST /api/copy                               Copy file/dir
POST /api/move                               Move file/dir
POST /api/chmod                              Change permissions
GET  /api/search?q=query&path=/              Search files
POST /api/terminal                           Execute command
POST /api/upload                             Upload file
GET  /api/download?path=/file.txt            Download file
GET  /api/diskusage?path=/                   Disk usage info
POST /api/zip                                Create ZIP archive
POST /api/unzip                              Extract ZIP archive
```

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl + \`` | Toggle terminal |
| `Ctrl + F` | Open search |
| `F5` | Refresh directory |
| `Backspace` | Go up one directory |
| `Delete` | Delete selected files |
| `Ctrl + S` | Save file (in editor) |
| `Tab` | Indent in editor |
| `↑ / ↓` | Navigate terminal history |
| `Escape` | Close panels/menus |

---

## Unix Concepts Demonstrated

### 1. File Permissions (chmod)
```python
st = os.stat(filepath)
mode = st.st_mode
perms = stat.filemode(mode)        # e.g. -rwxr-xr-x
octal = oct(mode & 0o777)          # e.g. 0o755
os.chmod(path, int('755', 8))      # Apply new perms
```

### 2. File Metadata (stat)
```python
st = os.stat(path)
st.st_ino    # Inode number
st.st_nlink  # Hard link count
st.st_uid    # Owner UID
st.st_gid    # Group GID
st.st_size   # Size in bytes
st.st_mtime  # Last modified time
```

### 3. Process Execution (Terminal)
```python
result = subprocess.run(
    cmd, shell=True, capture_output=True,
    text=True, timeout=10, cwd=working_dir
)
```

### 4. Directory Walking
```python
for root, dirs, files in os.walk(path):
    for name in files:
        # Process each file
```

---

## Security Features

- **Sandboxed filesystem**: All operations restricted to `uploads/` directory
- **Path traversal prevention**: `safe_path()` validates all paths
- **Command blocking**: Dangerous commands (`rm -rf /`, `shutdown`, etc.) blocked in terminal
- **Timeout**: Commands limited to 10 seconds
- **File size limit**: Text editor limited to 1MB files

---

## Viva Questions & Answers

**Q: What is an inode?**  
A: An inode is a data structure that stores metadata about a file (permissions, size, timestamps, owner) but NOT its name or content. The directory maps filenames to inodes.

**Q: What does chmod 755 mean?**  
A: Owner has read+write+execute (7), group has read+execute (5), others have read+execute (5).

**Q: What is the difference between hard links and symbolic links?**  
A: A hard link points to the same inode (same file, different name). A symbolic link points to a path (can cross filesystems, can be broken).

**Q: How does `os.walk()` work?**  
A: It recursively traverses a directory tree, yielding (root, dirs, files) tuples for each directory.

**Q: What is subprocess?**  
A: Python's module for spawning child processes, running shell commands, and capturing their output.
