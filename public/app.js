const state = {
  files: [],
  selectedFileId: null,
  selectedIds: new Set(),
  filteredFiles: [],
  techs: []
};

const elements = {
  form: document.getElementById('analysis-form'),
  urlInput: document.getElementById('url-input'),
  analyzeButton: document.getElementById('analyze-button'),
  statusPanel: document.getElementById('status-panel'),
  statusTitle: document.getElementById('status-title'),
  statusValue: document.getElementById('status-value'),
  statusMessage: document.getElementById('status-message'),
  progressBar: document.getElementById('progress-bar'),
  statFiles: document.getElementById('stat-files'),
  statSize: document.getElementById('stat-size'),
  statTech: document.getElementById('stat-tech'),
  statUrl: document.getElementById('stat-url'),
  techCount: document.getElementById('tech-count'),
  techList: document.getElementById('tech-list'),
  groupList: document.getElementById('group-list'),
  groupCount: document.getElementById('group-count'),
  fileList: document.getElementById('file-list'),
  viewer: document.getElementById('viewer'),
  fileSearch: document.getElementById('file-search'),
  selectAllBtn: document.getElementById('select-all-btn'),
  downloadSelectedBtn: document.getElementById('download-selected-btn'),
  downloadZipBtn: document.getElementById('download-zip-btn'),
  lastScanBtn: document.getElementById('last-scan-btn'),
  lastScanMeta: document.getElementById('last-scan-meta'),
};

const recentScanState = {
  url: '',
  time: '',
  size: 0
};

function setStatus(progress, title, message) {
  if (!elements.statusPanel) return;

  elements.statusPanel.classList.remove('hidden');
  if (elements.statusValue) elements.statusValue.textContent = `${progress}%`;
  if (elements.statusTitle) elements.statusTitle.textContent = title;
  if (elements.statusMessage) elements.statusMessage.textContent = message;
  if (elements.progressBar) elements.progressBar.style.width = `${progress}%`;
}

function formatBytes(size) {
  if (!size) return '0 KB';
  const kb = size / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

function renderTechs(techs) {
  if (!elements.techList) return;

  elements.techList.innerHTML = '';
  if (!techs || techs.length === 0) {
    elements.techList.innerHTML = '<span class="tech-pill">HTML5</span>';
    return;
  }

  techs.forEach((tech) => {
    const chip = document.createElement('span');
    chip.className = 'tech-pill';
    chip.textContent = tech;
    elements.techList.appendChild(chip);
  });
  if (elements.techCount) elements.techCount.textContent = techs.length;
}

function renderGroups(files) {
  if (!elements.groupList) return;

  const groups = {};
  files.forEach((file) => {
    groups[file.type] = (groups[file.type] || 0) + 1;
  });

  const items = Object.entries(groups).map(([type, count]) => ({ type, count }));
  elements.groupList.innerHTML = '';
  items.forEach(({ type, count }) => {
    const pill = document.createElement('span');
    pill.className = 'group-pill';
    pill.innerHTML = `<span>${type.toUpperCase()}</span><strong>${count}</strong>`;
    elements.groupList.appendChild(pill);
  });

  if (elements.groupCount) elements.groupCount.textContent = items.length;
}

function updateStats({ fileCount, totalSize, technologies, url }) {
  if (elements.statFiles) elements.statFiles.textContent = fileCount;
  if (elements.statSize) elements.statSize.textContent = formatBytes(totalSize);
  if (elements.statTech) elements.statTech.textContent = technologies.length;
  if (elements.statUrl) elements.statUrl.textContent = new URL(url).hostname;
}

function renderFileList() {
  if (!elements.fileSearch) return;

  const query = elements.fileSearch.value.trim().toLowerCase();
  state.filteredFiles = state.files.filter((file) => {
    const haystack = `${file.name} ${file.type} ${file.content || ''}`.toLowerCase();
    return haystack.includes(query);
  });

  if (!elements.fileList) return;

  elements.fileList.innerHTML = '';
  if (!state.filteredFiles.length) {
    elements.fileList.innerHTML = '<div class="viewer-empty"><p>No files match your search.</p></div>';
    return;
  }

  state.filteredFiles.forEach((file) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `file-item ${state.selectedFileId === file.id ? 'active' : ''} ${state.selectedIds.has(file.id) ? 'selected' : ''}`;
    button.innerHTML = `
      <div class="file-main">
        <span class="file-icon">${file.type.toUpperCase().slice(0, 2)}</span>
        <div class="file-meta">
          <span class="file-name">${file.name}</span>
          <small>${file.type.toUpperCase()} • ${formatBytes(file.size || file.content?.length || 0)}</small>
        </div>
      </div>
      <span class="file-check"></span>
    `;

    button.addEventListener('click', (event) => {
      if (event.target.closest('.file-check')) {
        toggleSelect(file.id);
        return;
      }
      state.selectedFileId = file.id;
      renderViewer(file);
      renderFileList();
    });

    elements.fileList.appendChild(button);
  });
}

function renderViewer(file) {
  if (!elements.viewer) return;

  if (!file) {
    elements.viewer.innerHTML = '<div class="viewer-empty"><p>Select a file to inspect its source code.</p></div>';
    return;
  }

  const isHtml = file.type === 'html';

  elements.viewer.innerHTML = `
    <div class="viewer-header">
      <h4>${file.name}</h4>
      <div class="viewer-actions">
        <button type="button" data-action="copy">Copy</button>
        <button type="button" data-action="download">Download</button>
      </div>
    </div>
    <pre class="code-block">${escapeHtml(file.content || '')}</pre>
  `;

  const copyBtn = elements.viewer.querySelector('[data-action="copy"]');
  const downloadBtn = elements.viewer.querySelector('[data-action="download"]');

  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(file.content || '');
        copyBtn.textContent = 'Copied';
        setTimeout(() => {
          copyBtn.textContent = 'Copy';
        }, 1400);
      } catch (error) {
        console.error(error);
      }
    });
  }

  if (downloadBtn) {
    downloadBtn.addEventListener('click', () => {
      const blob = new Blob([file.content || ''], { type: isHtml ? 'text/html' : 'text/plain' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.name.split('/').pop();
      link.click();
      URL.revokeObjectURL(url);
    });
  }
}

function escapeHtml(value = '') {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function toggleSelect(fileId) {
  if (state.selectedIds.has(fileId)) {
    state.selectedIds.delete(fileId);
  } else {
    state.selectedIds.add(fileId);
  }
  renderFileList();
}

function selectAllFiles() {
  const ids = state.filteredFiles.map((file) => file.id);
  if (ids.length === 0) return;

  const allSelected = ids.every((id) => state.selectedIds.has(id));
  if (allSelected) {
    ids.forEach((id) => state.selectedIds.delete(id));
  } else {
    ids.forEach((id) => state.selectedIds.add(id));
  }
  renderFileList();
}

async function analyzeWebsite(url) {
  setStatus(8, 'Preparing extraction', 'Validating URL and preparing analysis pipeline...');

  const response = await fetch('/api/analyze', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ url })
  });

  const payload = await response.json();

  if (!response.ok || !payload.ok) {
    throw new Error(payload.message || 'Unable to analyze this website.');
  }

  return payload.data;
}

function showProgressSequence() {
  const steps = [
    { progress: 18, title: 'Connecting to target URL', message: 'Checking public accessibility and resolving target website.' },
    { progress: 42, title: 'Fetching public source', message: 'Downloading HTML and referenced resources.' },
    { progress: 68, title: 'Parsing structure', message: 'Mapping project files, folders, and metadata.' },
    { progress: 86, title: 'Detecting technologies', message: 'Classifying frameworks, libraries, and stack signatures.' },
    { progress: 100, title: 'Analysis complete', message: 'Modeling the result set and preparing export.' }
  ];

  steps.forEach((step, index) => {
    setTimeout(() => {
      setStatus(step.progress, step.title, step.message);
    }, 250 * (index + 1));
  });
}

async function handleSubmit(event) {
  event.preventDefault();
  const url = elements.urlInput.value.trim();

  if (!url) {
    alert('The URL field is required.');
    return;
  }

  try {
    showProgressSequence();
    const data = await analyzeWebsite(url);

    state.files = data.files || [];
    state.selectedFileId = state.files[0]?.id || null;
    state.selectedIds = new Set();
    elements.fileSearch.value = '';

    recentScanState.url = data.url;
    recentScanState.size = data.totalSize || 0;
    recentScanState.time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    updateRecentScanMeta();

    updateStats({
      fileCount: data.fileCount,
      totalSize: data.totalSize,
      technologies: data.technologies,
      url: data.url
    });

    renderTechs(data.technologies);
    renderGroups(state.files);
    renderFileList();
    const firstFile = state.filteredFiles[0] || null;
    renderViewer(firstFile || null);
    if (firstFile) {
      state.selectedFileId = firstFile.id;
      renderFileList();
    }

    setStatus(100, 'Analysis complete', `Found ${data.fileCount} files and ${data.technologies.length} technologies.`);
  } catch (error) {
    setStatus(0, 'Analysis failed', error.message || 'The URL could not be processed.');
    alert(error.message || 'The URL could not be processed.');
  }
}

async function downloadZip() {
  const selected = state.files.filter((file) => state.selectedIds.has(file.id));
  const payload = selected.length ? selected : state.files;

  if (!payload.length) {
    alert('No files available for ZIP export.');
    return;
  }

  const response = await fetch('/api/download-zip', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ files: payload.map((file) => ({ name: file.name, content: file.content || '' })) })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'ZIP export failed.' }));
    alert(error.message || 'ZIP export failed.');
    return;
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'fenc-all-code.zip';
  a.click();
  URL.revokeObjectURL(url);
}

async function downloadSelected() {
  const selected = state.files.filter((file) => state.selectedIds.has(file.id));
  if (!selected.length) {
    alert('Select at least one file to download.');
    return;
  }

  selected.forEach((file) => {
    const blob = new Blob([file.content || ''], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = file.name.split('/').pop();
    link.click();
    URL.revokeObjectURL(url);
  });
}

function updateRecentScanMeta() {
  if (!recentScanState.url) {
    if (elements.lastScanMeta) elements.lastScanMeta.textContent = 'No data yet';
    if (elements.workspaceUrl) elements.workspaceUrl.textContent = 'Waiting for a site scan';
    return;
  }

  const host = new URL(recentScanState.url).hostname;
  const timeLabel = recentScanState.time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (elements.lastScanMeta) elements.lastScanMeta.textContent = `${timeLabel} • ${formatBytes(recentScanState.size)} • ${host}`;
  if (elements.workspaceUrl) elements.workspaceUrl.textContent = recentScanState.url;
}

function openRecentSite() {
  if (!recentScanState.url) {
    alert('There is no website to open yet. Run a scan first.');
    return;
  }

  window.open(recentScanState.url, '_blank', 'noopener,noreferrer');
}


function handleLastScanClick() {
  if (!recentScanState.url) {
    return;
  }

  elements.urlInput.value = recentScanState.url;
  elements.urlInput.focus();
  elements.urlInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function bindEvents() {
  elements.form?.addEventListener('submit', handleSubmit);
  elements.fileSearch?.addEventListener('input', renderFileList);
  elements.selectAllBtn?.addEventListener('click', selectAllFiles);
  elements.downloadZipBtn?.addEventListener('click', downloadZip);
  elements.downloadSelectedBtn?.addEventListener('click', downloadSelected);
  elements.lastScanBtn?.addEventListener('click', handleLastScanClick);
}

bindEvents();
setStatus(0, 'Ready for analysis', 'Enter a public URL to begin source extraction.');
updateRecentScanMeta();
renderTechs([]);
renderGroups([]);
renderViewer(null);
renderFileList();
