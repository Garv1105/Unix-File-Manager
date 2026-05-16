/* ─── State ─────────────────────────────────────────── */
const state = {
  cwd: '/',
  sort: 'name',
  showHidden: false,
  viewMode: 'grid',  // grid | list
  selected: new Set(),
  clipboard: null,  // { paths, action: 'copy'|'cut' }
  currentFile: null, // for editor
  chmodTarget: null,
  cmdHistory: [],
  cmdHistoryIdx: -1,
};

/* ─── File Type Icons ───────────────────────────────── */
const ICONS = {
  directory: '📁',
  code: '📄',
  image: '🖼',
  video: '🎬',
  audio: '🎵',
  pdf: '📕',
  archive: '🗜',
  text: '📝',
  symlink: '🔗',
  file: '📃',
};

/* ─── API Helpers ───────────────────────────────────── */
async function api(url, opts = {}) {
  try {
    const res = await fetch(url, opts);
    return await res.json();
  } catch (e) {
    return { error: e.message };
  }
}

async function GET(url) { return api(url); }
async function POST(url, body) {
  return api(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/* ─── Toast ─────────────────────────────────────────── */
let toastTimer;
function toast(msg, type = 'info') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show ' + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, 3000);
}

/* ─── Disk Usage ────────────────────────────────────── */
async function loadDiskUsage() {
  const d = await GET('/api/diskusage?path=/');
  if (d.error) return;
  document.getElementById('diskLabel').textContent = `${d.used_human} / ${d.total_human}`;
  document.getElementById('diskFill').style.width = `${Math.min(d.percent, 100)}%`;
}

/* ─── Directory Listing ─────────────────────────────── */
async function loadDir(path = '/', push = true) {
  path = path || '/';
  state.cwd = path;
  state.selected.clear();
  updateSelectionUI();

  const data = await GET(`/api/ls?path=${encodeURIComponent(path)}&hidden=${state.showHidden}&sort=${state.sort}`);

  if (data.error) { toast(data.error, 'error'); return; }

  // Breadcrumb
  const bc = document.getElementById('breadcrumb');
  bc.innerHTML = data.breadcrumb.map((c, i, a) => {
    const isLast = i === a.length - 1;
    return `<span class="crumb" data-path="${c.path}">${c.name}</span>${isLast ? '' : '<span class="crumb-sep">/</span>'}`;
  }).join('');
  bc.querySelectorAll('.crumb').forEach(el => {
    el.addEventListener('click', () => loadDir(el.dataset.path));
  });

  // Update sidebar active
  document.querySelectorAll('.sidebar-item[data-path]').forEach(el => {
    el.classList.toggle('active', el.dataset.path === path);
  });

  // Terminal CWD prompt
  document.getElementById('termPrompt').textContent = `[${path}] $`;

  // Render entries
  const grid = document.getElementById('fileGrid');
  const empty = document.getElementById('emptyState');
  document.getElementById('fileCount').textContent = `${data.total} items`;

  if (data.entries.length === 0) {
    grid.innerHTML = '';
    empty.style.display = 'flex';
    grid.style.display = 'none';
    return;
  }

  empty.style.display = 'none';
  grid.style.display = '';
  grid.className = 'file-grid' + (state.viewMode === 'list' ? ' list-view' : '');

  grid.innerHTML = data.entries.map((e, i) => renderCard(e, i)).join('');

  grid.querySelectorAll('.file-card').forEach(card => {
    const path = card.dataset.path;
    const isDir = card.dataset.isdir === 'true';

    card.addEventListener('click', (ev) => handleCardClick(ev, card, path));
    card.addEventListener('dblclick', () => openEntry(path, isDir));
    card.addEventListener('contextmenu', (ev) => showContextMenu(ev, card));
  });

  loadDiskUsage();
}

function renderCard(e, i) {
  const icon = ICONS[e.type] || ICONS.file;
  const delay = Math.min(i * 0.02, 0.3);

  if (state.viewMode === 'list') {
    return `
    <div class="file-card ${state.selected.has(e.path) ? 'selected' : ''}"
         data-path="${e.path}" data-isdir="${e.is_dir}"
         style="animation-delay:${delay}s">
      <span class="file-icon">${icon}</span>
      <span class="file-name">${esc(e.name)}</span>
      <span class="list-perms">${e.permissions}</span>
      <span class="list-owner">${e.owner}</span>
      <span class="file-meta">${e.size_human}</span>
    </div>`;
  }

  return `
  <div class="file-card ${state.selected.has(e.path) ? 'selected' : ''}"
       data-path="${e.path}" data-isdir="${e.is_dir}"
       style="animation-delay:${delay}s">
    <div class="file-icon">${icon}</div>
    <div class="file-name">${esc(e.name)}</div>
    <div class="file-meta">${e.size_human}</div>
  </div>`;
}

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/* ─── Card Click / Selection ────────────────────────── */
function handleCardClick(ev, card, path) {
  if (ev.shiftKey || ev.ctrlKey || ev.metaKey) {
    // Multi-select
    if (state.selected.has(path)) {
      state.selected.delete(path);
      card.classList.remove('selected');
    } else {
      state.selected.add(path);
      card.classList.add('selected');
    }
    updateSelectionUI();
  } else {
    // Single click: show properties
    state.selected.clear();
    document.querySelectorAll('.file-card.selected').forEach(c => c.classList.remove('selected'));
    state.selected.add(path);
    card.classList.add('selected');
    updateSelectionUI();
    showProperties(path);
  }
}

function updateSelectionUI() {
  const info = document.getElementById('selectionInfo');
  const count = state.selected.size;
  if (count > 0) {
    info.style.display = 'block';
    document.getElementById('selCount').textContent = count;
  } else {
    info.style.display = 'none';
  }
}

/* ─── Open Entry ────────────────────────────────────── */
function openEntry(path, isDir) {
  if (isDir) {
    loadDir(path);
  } else {
    openEditor(path);
  }
}

/* ─── Properties Panel ──────────────────────────────── */
async function showProperties(path) {
  const panel = document.getElementById('rightPanel');
  panel.classList.add('open');

  const data = await GET(`/api/stat?path=${encodeURIComponent(path)}`);
  if (data.error) { toast(data.error, 'error'); return; }

  const icon = ICONS[data.type] || ICONS.file;
  document.getElementById('propContent').innerHTML = `
    <div class="prop-icon">${icon}</div>
    <div class="prop-name">${esc(data.name)}</div>
    <div class="prop-row"><span class="prop-key">Type</span><span class="prop-val">${data.type}</span></div>
    <div class="prop-row"><span class="prop-key">Size</span><span class="prop-val">${data.size_human} (${data.size} B)</span></div>
    <div class="prop-row"><span class="prop-key">Modified</span><span class="prop-val">${data.mtime}</span></div>
    <div class="prop-row"><span class="prop-key">Permissions</span><span class="prop-val prop-perms">${data.permissions}</span></div>
    <div class="prop-row"><span class="prop-key">Octal</span><span class="prop-val">${data.octal_permissions}</span></div>
    <div class="prop-row"><span class="prop-key">Owner</span><span class="prop-val">${data.owner}:${data.group}</span></div>
    <div class="prop-row"><span class="prop-key">Inode</span><span class="prop-val">${data.inode}</span></div>
    <div class="prop-row"><span class="prop-key">Hard Links</span><span class="prop-val">${data.hard_links}</span></div>
    <div class="prop-actions">
      ${!data.is_dir ? `<button class="btn-prop" onclick="openEditor('${data.path}')">✎ Edit</button>` : ''}
      ${!data.is_dir ? `<button class="btn-prop" onclick="window.location='/api/download?path=${encodeURIComponent(data.path)}'">⬇ Download</button>` : ''}
      <button class="btn-prop" onclick="openChmod('${data.path}', '${data.octal_permissions}')">⚙ Chmod</button>
      <button class="btn-prop" onclick="promptRename('${data.path}')">✎ Rename</button>
      <button class="btn-prop danger" onclick="confirmDelete('${data.path}')">✕ Delete</button>
    </div>
  `;
}

/* ─── Editor ────────────────────────────────────────── */
async function openEditor(path) {
  const data = await GET(`/api/read?path=${encodeURIComponent(path)}`);
  if (data.error) { toast(data.error, 'error'); return; }

  state.currentFile = path;
  const name = path.split('/').pop();
  document.getElementById('editorTitle').textContent = `✎ ${name}`;
  document.getElementById('editorArea').value = data.content;
  updateLineNumbers();
  showModal('editorModal');
}

function updateLineNumbers() {
  const ta = document.getElementById('editorArea');
  const ln = document.getElementById('lineNumbers');
  const lines = ta.value.split('\n').length;
  ln.textContent = Array.from({length: lines}, (_, i) => i+1).join('\n');
}

async function saveFile() {
  const content = document.getElementById('editorArea').value;
  const data = await POST('/api/write', { path: state.currentFile, content });
  if (data.error) toast(data.error, 'error');
  else { toast(data.message, 'success'); closeModal('editorModal'); }
}

/* ─── Chmod Modal ───────────────────────────────────── */
function openChmod(path, octal) {
  state.chmodTarget = path;
  // Parse octal like '0o755'
  const oct = octal.replace('0o', '');
  const [o, g, ot] = oct.padStart(3,'0').slice(-3).split('').map(Number);
  const sets = [
    ['owner', o], ['group', g], ['others', ot]
  ];
  document.querySelectorAll('.chmod-cb').forEach(cb => {
    const who = cb.dataset.who;
    const perm = cb.dataset.perm;
    const val = sets.find(s => s[0] === who)[1];
    if (perm === 'r') cb.checked = !!(val & 4);
    if (perm === 'w') cb.checked = !!(val & 2);
    if (perm === 'x') cb.checked = !!(val & 1);
  });
  updateOctalPreview();
  showModal('chmodModal');
}

function updateOctalPreview() {
  const val = (who) => {
    const r = document.querySelector(`[data-who="${who}"][data-perm="r"]`)?.checked ? 4 : 0;
    const w = document.querySelector(`[data-who="${who}"][data-perm="w"]`)?.checked ? 2 : 0;
    const x = document.querySelector(`[data-who="${who}"][data-perm="x"]`)?.checked ? 1 : 0;
    return r + w + x;
  };
  document.getElementById('octalPreview').textContent =
    `0${val('owner')}${val('group')}${val('others')}`;
}

async function applyChmod() {
  const mode = document.getElementById('octalPreview').textContent;
  const data = await POST('/api/chmod', { path: state.chmodTarget, mode });
  if (data.error) toast(data.error, 'error');
  else { toast(data.message, 'success'); closeModal('chmodModal'); loadDir(state.cwd, false); }
}

/* ─── Input Modal ───────────────────────────────────── */
let inputCallback = null;
function prompt(title, placeholder, cb) {
  document.getElementById('inputTitle').textContent = title;
  const inp = document.getElementById('inputField');
  inp.placeholder = placeholder || '';
  inp.value = '';
  inputCallback = cb;
  showModal('inputModal');
  setTimeout(() => inp.focus(), 80);
}

document.getElementById('inputConfirm').addEventListener('click', () => {
  const val = document.getElementById('inputField').value.trim();
  if (val && inputCallback) inputCallback(val);
  closeModal('inputModal');
});
document.getElementById('inputCancel').addEventListener('click', () => closeModal('inputModal'));
document.getElementById('inputField').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('inputConfirm').click();
  if (e.key === 'Escape') closeModal('inputModal');
});

/* ─── Modal Helpers ─────────────────────────────────── */
function showModal(id) {
  document.getElementById('overlay').classList.add('show');
  document.getElementById(id).classList.add('open');
  // Force reflow for animation
  document.getElementById(id).offsetHeight;
}
function closeModal(id) {
  document.getElementById(id).classList.remove('open');
  document.getElementById('overlay').classList.remove('show');
}

/* ─── Context Menu ──────────────────────────────────── */
let ctxTarget = null;
function showContextMenu(ev, card) {
  ev.preventDefault();
  ctxTarget = card;
  const menu = document.getElementById('contextMenu');
  menu.style.left = ev.clientX + 'px';
  menu.style.top = Math.min(ev.clientY, window.innerHeight - 200) + 'px';
  menu.classList.add('show');

  const isDir = card.dataset.isdir === 'true';
  document.getElementById('cmOpen').textContent = isDir ? '📁 Open' : '✎ Edit';
  document.getElementById('cmDownload').style.display = isDir ? 'none' : '';
}

document.getElementById('cmOpen').addEventListener('click', () => {
  if (!ctxTarget) return;
  openEntry(ctxTarget.dataset.path, ctxTarget.dataset.isdir === 'true');
  hideContextMenu();
});
document.getElementById('cmRename').addEventListener('click', () => {
  if (!ctxTarget) return;
  promptRename(ctxTarget.dataset.path);
  hideContextMenu();
});
document.getElementById('cmCopy').addEventListener('click', () => {
  if (!ctxTarget) return;
  navigator.clipboard?.writeText(ctxTarget.dataset.path);
  toast('Path copied to clipboard');
  hideContextMenu();
});
document.getElementById('cmDownload').addEventListener('click', () => {
  if (!ctxTarget) return;
  window.location = `/api/download?path=${encodeURIComponent(ctxTarget.dataset.path)}`;
  hideContextMenu();
});
document.getElementById('cmChmod').addEventListener('click', async () => {
  if (!ctxTarget) return;
  const info = await GET(`/api/stat?path=${encodeURIComponent(ctxTarget.dataset.path)}`);
  openChmod(ctxTarget.dataset.path, info.octal_permissions);
  hideContextMenu();
});
document.getElementById('cmDelete').addEventListener('click', () => {
  if (!ctxTarget) return;
  confirmDelete(ctxTarget.dataset.path);
  hideContextMenu();
});

function hideContextMenu() {
  document.getElementById('contextMenu').classList.remove('show');
  ctxTarget = null;
}
document.addEventListener('click', () => hideContextMenu());

/* ─── File Operations ───────────────────────────────── */
async function confirmDelete(path) {
  const name = path.split('/').pop();
  if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
  const data = await POST('/api/delete', { path });
  if (data.error) toast(data.error, 'error');
  else { toast(data.message, 'success'); loadDir(state.cwd, false); }
}

function promptRename(path) {
  const old = path.split('/').pop();
  prompt(`Rename "${old}"`, 'New name', async (name) => {
    const data = await POST('/api/rename', { old_path: path, new_name: name });
    if (data.error) toast(data.error, 'error');
    else { toast(data.message, 'success'); loadDir(state.cwd, false); }
  });
}

async function deleteSelected() {
  if (state.selected.size === 0) return;
  if (!confirm(`Delete ${state.selected.size} item(s)?`)) return;
  for (const path of state.selected) {
    await POST('/api/delete', { path });
  }
  toast(`Deleted ${state.selected.size} items`, 'success');
  state.selected.clear();
  updateSelectionUI();
  loadDir(state.cwd, false);
}

/* ─── Terminal ──────────────────────────────────────── */
function toggleTerminal() {
  document.getElementById('terminalDrawer').classList.toggle('open');
  if (document.getElementById('terminalDrawer').classList.contains('open')) {
    document.getElementById('termInput').focus();
    termPrint('Unix File Manager Terminal', 'info');
    termPrint(`Type any Unix command. CWD: ${state.cwd}`, 'info');
    termPrint('', 'info');
  }
}

function termPrint(text, cls = 'out') {
  const out = document.getElementById('termOutput');
  const line = document.createElement('div');
  line.className = `term-line ${cls}`;
  line.textContent = text;
  out.appendChild(line);
  out.scrollTop = out.scrollHeight;
}

async function runTermCmd(cmd) {
  termPrint(`${state.cwd} $ ${cmd}`, 'cmd');
  state.cmdHistory.unshift(cmd);
  state.cmdHistoryIdx = -1;

  // Handle `cd` locally
  if (cmd.startsWith('cd ')) {
    const target = cmd.slice(3).trim();
    let newPath = target.startsWith('/') ? target : `${state.cwd}/${target}`.replace(/\/+/g, '/');
    await loadDir(newPath);
    termPrint(`Changed to ${newPath}`, 'info');
    return;
  }
  if (cmd === 'cd') {
    await loadDir('/');
    return;
  }
  if (cmd === 'clear') {
    document.getElementById('termOutput').innerHTML = '';
    return;
  }

  const data = await POST('/api/terminal', { command: cmd, cwd: state.cwd });
  if (data.stdout) data.stdout.split('\n').forEach(l => termPrint(l, 'out'));
  if (data.stderr) data.stderr.split('\n').forEach(l => termPrint(l, 'err'));

  // Refresh listing after potential file changes
  const mutating = ['mkdir','touch','rm','mv','cp','chmod','chown','echo','cat >','wget','unzip','tar'];
  if (mutating.some(m => cmd.includes(m))) loadDir(state.cwd, false);
}

document.getElementById('termInput').addEventListener('keydown', async (e) => {
  const hist = state.cmdHistory;
  if (e.key === 'Enter') {
    const cmd = e.target.value.trim();
    if (!cmd) return;
    e.target.value = '';
    await runTermCmd(cmd);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (state.cmdHistoryIdx < hist.length - 1) {
      state.cmdHistoryIdx++;
      e.target.value = hist[state.cmdHistoryIdx];
    }
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (state.cmdHistoryIdx > 0) {
      state.cmdHistoryIdx--;
      e.target.value = hist[state.cmdHistoryIdx];
    } else {
      state.cmdHistoryIdx = -1;
      e.target.value = '';
    }
  }
});

/* ─── Search ────────────────────────────────────────── */
let searchDebounce;
function toggleSearch() {
  const panel = document.getElementById('searchPanel');
  panel.classList.toggle('show');
  if (panel.classList.contains('show')) document.getElementById('searchInput').focus();
}

document.getElementById('searchInput').addEventListener('input', (e) => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => doSearch(e.target.value), 300);
});

async function doSearch(q) {
  if (q.length < 2) { document.getElementById('searchResults').innerHTML = ''; return; }
  const data = await GET(`/api/search?q=${encodeURIComponent(q)}&path=${encodeURIComponent(state.cwd)}`);
  const res = document.getElementById('searchResults');
  if (!data.results?.length) {
    res.innerHTML = '<div style="color:var(--text2);padding:8px;font-size:11px">No results found</div>';
    return;
  }
  res.innerHTML = data.results.map(r => `
    <div class="search-result-item" onclick="navigateToResult('${r.path}', ${r.is_dir})">
      <span class="sr-icon">${ICONS[r.type] || ICONS.file}</span>
      <div>
        <div class="sr-name">${esc(r.name)}</div>
        <div class="sr-path">${r.path}</div>
      </div>
    </div>
  `).join('');
}

function navigateToResult(path, isDir) {
  document.getElementById('searchPanel').classList.remove('show');
  if (isDir) {
    loadDir(path);
  } else {
    const parent = path.substring(0, path.lastIndexOf('/')) || '/';
    loadDir(parent).then(() => showProperties(path));
  }
}

/* ─── Upload ────────────────────────────────────────── */
document.getElementById('btnUpload').addEventListener('click', () => {
  document.getElementById('fileUploadInput').click();
});
document.getElementById('fileUploadInput').addEventListener('change', async (e) => {
  const files = e.target.files;
  for (const file of files) {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('path', state.cwd);
    const res = await fetch('/api/upload', { method: 'POST', body: fd });
    const data = await res.json();
    if (data.error) toast(data.error, 'error');
    else toast(data.message, 'success');
  }
  e.target.value = '';
  loadDir(state.cwd, false);
});

// Drag & Drop upload
const filePanel = document.querySelector('.file-panel');
filePanel.addEventListener('dragover', (e) => { e.preventDefault(); filePanel.classList.add('dragover'); });
filePanel.addEventListener('dragleave', () => filePanel.classList.remove('dragover'));
filePanel.addEventListener('drop', async (e) => {
  e.preventDefault();
  filePanel.classList.remove('dragover');
  const files = e.dataTransfer.files;
  for (const file of files) {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('path', state.cwd);
    await fetch('/api/upload', { method: 'POST', body: fd });
  }
  toast(`Uploaded ${files.length} file(s)`, 'success');
  loadDir(state.cwd, false);
});

/* ─── Zip ───────────────────────────────────────────── */
async function zipSelected() {
  if (state.selected.size === 0) { toast('Select files first', 'warn'); return; }
  prompt('Archive name', 'archive', async (name) => {
    const data = await POST('/api/zip', {
      paths: [...state.selected],
      name,
      dest: state.cwd,
    });
    if (data.error) toast(data.error, 'error');
    else { toast(data.message, 'success'); loadDir(state.cwd, false); }
  });
}

/* ─── View Toggle ───────────────────────────────────── */
document.getElementById('viewGrid').addEventListener('click', () => {
  state.viewMode = 'grid';
  document.getElementById('viewGrid').classList.add('active');
  document.getElementById('viewList').classList.remove('active');
  loadDir(state.cwd, false);
});
document.getElementById('viewList').addEventListener('click', () => {
  state.viewMode = 'list';
  document.getElementById('viewList').classList.add('active');
  document.getElementById('viewGrid').classList.remove('active');
  loadDir(state.cwd, false);
});

/* ─── Sidebar Wiring ────────────────────────────────── */
document.querySelectorAll('.sidebar-item[data-path]').forEach(el => {
  el.addEventListener('click', () => loadDir(el.dataset.path));
});
document.querySelectorAll('.sort-item').forEach(el => {
  el.addEventListener('click', () => {
    state.sort = el.dataset.sort;
    document.querySelectorAll('.sort-item').forEach(s => s.classList.remove('active'));
    el.classList.add('active');
    loadDir(state.cwd, false);
  });
});

document.getElementById('btnNewDir').addEventListener('click', () => {
  prompt('New folder name', 'folder_name', async (name) => {
    const data = await POST('/api/mkdir', { path: state.cwd, name });
    if (data.error) toast(data.error, 'error');
    else { toast(data.message, 'success'); loadDir(state.cwd, false); }
  });
});

document.getElementById('btnNewFile').addEventListener('click', () => {
  prompt('New file name', 'filename.txt', async (name) => {
    const data = await POST('/api/touch', { path: state.cwd, name });
    if (data.error) toast(data.error, 'error');
    else { toast(data.message, 'success'); loadDir(state.cwd, false); }
  });
});

document.getElementById('btnZip').addEventListener('click', zipSelected);
document.getElementById('btnDeleteSelected').addEventListener('click', deleteSelected);

/* ─── Toggle Buttons ────────────────────────────────── */
document.getElementById('btnToggleHidden').addEventListener('click', () => {
  state.showHidden = !state.showHidden;
  const btn = document.getElementById('btnToggleHidden');
  btn.style.color = state.showHidden ? 'var(--accent)' : '';
  loadDir(state.cwd, false);
});
document.getElementById('btnTerminal').addEventListener('click', toggleTerminal);
document.getElementById('closeTerminal').addEventListener('click', () => {
  document.getElementById('terminalDrawer').classList.remove('open');
});
document.getElementById('btnSearch').addEventListener('click', toggleSearch);
document.getElementById('closeSearch').addEventListener('click', () => {
  document.getElementById('searchPanel').classList.remove('show');
});
document.getElementById('closeProps').addEventListener('click', () => {
  document.getElementById('rightPanel').classList.remove('open');
});

/* ─── Editor Wiring ─────────────────────────────────── */
document.getElementById('btnSaveFile').addEventListener('click', saveFile);
document.getElementById('closeEditor').addEventListener('click', () => closeModal('editorModal'));
document.getElementById('editorArea').addEventListener('input', updateLineNumbers);
document.getElementById('editorArea').addEventListener('keydown', (e) => {
  if (e.key === 'Tab') {
    e.preventDefault();
    const ta = e.target;
    const start = ta.selectionStart;
    ta.value = ta.value.slice(0,start) + '  ' + ta.value.slice(ta.selectionEnd);
    ta.selectionStart = ta.selectionEnd = start + 2;
    updateLineNumbers();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    saveFile();
  }
});

/* ─── Chmod Wiring ──────────────────────────────────── */
document.querySelectorAll('.chmod-cb').forEach(cb => {
  cb.addEventListener('change', updateOctalPreview);
});
document.getElementById('chmodConfirm').addEventListener('click', applyChmod);
document.getElementById('chmodCancel').addEventListener('click', () => closeModal('chmodModal'));
document.getElementById('closeChmod').addEventListener('click', () => closeModal('chmodModal'));

/* ─── Keyboard Shortcuts ────────────────────────────── */
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  if (e.ctrlKey && e.key === '`') { e.preventDefault(); toggleTerminal(); }
  if (e.ctrlKey && e.key === 'f') { e.preventDefault(); toggleSearch(); }
  if (e.key === 'F5') { e.preventDefault(); loadDir(state.cwd, false); }
  if (e.key === 'Escape') {
    hideContextMenu();
    document.getElementById('searchPanel').classList.remove('show');
    document.getElementById('terminalDrawer').classList.remove('open');
  }
  if (e.key === 'Backspace' && !document.getElementById('editorModal').classList.contains('open')) {
    e.preventDefault();
    const parent = state.cwd.substring(0, state.cwd.lastIndexOf('/')) || '/';
    loadDir(parent);
  }
  if (e.key === 'Delete') {
    if (state.selected.size > 0) deleteSelected();
  }
});

/* ─── Init ──────────────────────────────────────────── */
loadDir('/');
loadDiskUsage();

// Show keyboard hint in terminal on load
setTimeout(() => {
  document.getElementById('toast').textContent = 'Press Ctrl+` for terminal, Ctrl+F to search';
  document.getElementById('toast').className = 'toast show';
  setTimeout(() => document.getElementById('toast').className = 'toast', 3500);
}, 1000);
