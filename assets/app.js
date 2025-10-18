const storageKeys = {
  apiUrl: 'openimg:apiUrl',
  apiKey: 'openimg:apiKey',
  history: 'openimg:history'
};

const state = {
  apiUrl: '',
  apiKey: '',
  clientId: '',
  uploading: false,
  history: []
};

const el = (selector) => document.querySelector(selector);

const statusBox = el('#status');
const resultsContainer = el('#upload-results');
const historyContainer = el('#history-list');
const pendingContainer = el('#selected-files');
const dropzone = el('#upload-dropzone');
const fileInput = el('#imageFiles');
const uploadButton = el('#upload-button');
const triggerFileButton = el('#trigger-file');
const refreshButton = el('#refresh-history');
const clearHistoryButton = el('#clear-history');
const navButtons = Array.from(document.querySelectorAll('.nav-button'));
const viewSections = new Map(
  Array.from(document.querySelectorAll('.view')).map((section) => [section.id.replace('view-', ''), section])
);
const warnings = {
  upload: el('#upload-warning'),
  history: el('#history-warning')
};
const generateApiKeyButton = el('#generate-api-key-button');

let statusTimer = null;
let pendingFiles = [];
let pendingPreviewUrls = [];

function showStatus(message, type = 'success') {
  if (!statusBox) return;
  statusBox.textContent = message;
  statusBox.className = `toast show ${type}`;
  if (statusTimer) {
    clearTimeout(statusTimer);
  }
  statusTimer = setTimeout(hideStatus, 3200);
}

function hideStatus() {
  if (!statusBox) return;
  statusBox.className = 'toast';
  statusBox.textContent = '';
  if (statusTimer) {
    clearTimeout(statusTimer);
    statusTimer = null;
  }
}

function normalizeBaseUrl(url) {
  if (!url) return '';
  try {
    const normalized = new URL(url.trim());
    normalized.pathname = normalized.pathname.replace(/\/+$/, '');
    return normalized.toString().replace(/\/+$/, '');
  } catch (error) {
    return url.trim().replace(/\/+$/, '');
  }
}

function uint8ArrayToHex(buffer) {
  return Array.from(buffer)
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

async function computeClientId() {
  const entropy = [
    navigator.userAgent || '',
    navigator.language || '',
    navigator.platform || '',
    String(navigator.hardwareConcurrency || ''),
    typeof screen !== 'undefined' ? `${screen.width}x${screen.height}` : '',
    typeof screen !== 'undefined' ? String(screen.colorDepth || '') : '',
    String(window.devicePixelRatio || ''),
    (() => {
      try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
      } catch (error) {
        return '';
      }
    })()
  ].join('|');

  if (window.crypto?.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(entropy);
    const digest = await window.crypto.subtle.digest('SHA-256', data);
    return uint8ArrayToHex(new Uint8Array(digest));
  }

  let hash = 0;
  for (let index = 0; index < entropy.length; index += 1) {
    const char = entropy.charCodeAt(index);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }

  const fallback = Math.abs(hash).toString(16).padStart(32, '0');
  return fallback.repeat(2).slice(0, 64);
}

function loadPersistedState() {
  const storedUrl = localStorage.getItem(storageKeys.apiUrl) || '';
  const normalizedStoredUrl = normalizeBaseUrl(storedUrl);
  const defaultUrl = normalizeBaseUrl(window.location.origin);

  state.apiUrl = normalizedStoredUrl || defaultUrl;
  state.apiKey = localStorage.getItem(storageKeys.apiKey) || '';

  try {
    const savedHistory = JSON.parse(localStorage.getItem(storageKeys.history) || '[]');
    if (Array.isArray(savedHistory)) {
      state.history = savedHistory;
    }
  } catch (error) {
    state.history = [];
  }

  applySettingsToForm();
  renderHistory(state.history);
  renderPendingFiles(pendingFiles);
  updateAvailability();
}

function persistSettings() {
  localStorage.setItem(storageKeys.apiUrl, state.apiUrl);
  localStorage.setItem(storageKeys.apiKey, state.apiKey);
}

function persistHistory() {
  localStorage.setItem(storageKeys.history, JSON.stringify(state.history));
}

function applySettingsToForm() {
  const urlInput = el('#apiUrl');
  if (urlInput) {
    urlInput.value = state.apiUrl;
  }

  const keyInput = el('#apiKey');
  if (keyInput) {
    keyInput.value = state.apiKey;
  }
}

function setActiveView(view) {
  navButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.view === view);
  });
  viewSections.forEach((section, key) => {
    section.classList.toggle('active', key === view);
  });
}

function updateAvailability() {
  const configured = Boolean(state.apiUrl && state.apiKey);
  if (warnings.upload) warnings.upload.classList.toggle('hidden', configured);
  if (warnings.history) warnings.history.classList.toggle('hidden', configured);
  navButtons.forEach((button) => {
    if (button.dataset.view === 'history') {
      button.disabled = !configured;
    }
  });
}

function buildFullUrl(path) {
  if (!state.apiUrl) return path;
  return `${state.apiUrl}${path.startsWith('/') ? '' : '/'}${path}`;
}

function formatSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '未知大小';
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / 1024).toFixed(1)} KB`;
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    showStatus('已复制到剪贴板', 'success');
  } catch (error) {
    console.error(error);
    showStatus('复制失败，请手动复制', 'error');
  }
}

function renderPendingFiles(files) {
  pendingPreviewUrls.forEach((url) => {
    try {
      URL.revokeObjectURL(url);
    } catch (error) {
      console.warn('无法释放预览资源', error);
    }
  });
  pendingPreviewUrls = [];

  if (!pendingContainer) return;

  pendingContainer.innerHTML = '';

  if (!files || files.length === 0) {
    pendingContainer.classList.add('hidden');
    return;
  }

  pendingContainer.classList.remove('hidden');

  const header = document.createElement('div');
  header.className = 'flex-row pending-header';
  header.innerHTML = `<strong>待上传文件</strong><span class="badge">${files.length} 个</span>`;
  pendingContainer.append(header);

  const grid = document.createElement('div');
  grid.className = 'pending-grid';

  files.forEach((file) => {
    const item = document.createElement('div');
    item.className = 'pending-item';

    let previewUrl = '';
    if (typeof URL !== 'undefined' && URL.createObjectURL) {
      try {
        previewUrl = URL.createObjectURL(file);
        pendingPreviewUrls.push(previewUrl);
      } catch (error) {
        previewUrl = '';
      }
    }

    if (previewUrl) {
      const preview = document.createElement('img');
      preview.className = 'pending-thumb';
      preview.src = previewUrl;
      preview.alt = file.name;
      preview.loading = 'lazy';
      item.append(preview);
    } else {
      const placeholder = document.createElement('div');
      placeholder.className = 'pending-thumb placeholder';
      placeholder.textContent = '预览不可用';
      item.append(placeholder);
    }

    const meta = document.createElement('div');
    meta.className = 'pending-meta';

    const name = document.createElement('div');
    name.className = 'pending-name';
    name.textContent = file.name;

    const size = document.createElement('div');
    size.className = 'pending-size';
    size.textContent = formatSize(file.size);

    meta.append(name, size);
    item.append(meta);
    grid.append(item);
  });

  pendingContainer.append(grid);
}

function createLinkTabs(name, directUrl) {
  const wrapper = document.createElement('div');
  wrapper.className = 'link-tabs';

  const tabs = [
    { key: 'direct', label: '直链', value: directUrl },
    { key: 'markdown', label: 'Markdown', value: `![${name}](${directUrl})` },
    { key: 'bbcode', label: 'BBCode', value: `[img]${directUrl}[/img]` }
  ];

  const nav = document.createElement('div');
  nav.className = 'link-tabs-nav';

  const inputGroup = document.createElement('div');
  inputGroup.className = 'link-tabs-input';

  const field = document.createElement('input');
  field.type = 'text';
  field.readOnly = true;
  field.className = 'link-tabs-field';
  field.value = tabs[0].value;
  field.setAttribute('aria-label', '图片链接');

  const copyButton = document.createElement('button');
  copyButton.type = 'button';
  copyButton.className = 'icon-button';
  copyButton.setAttribute('aria-label', '复制链接');
  copyButton.innerText = '📋';

  const buttons = [];

  const setActive = (index) => {
    buttons.forEach((button, idx) => {
      button.classList.toggle('active', idx === index);
    });
    field.value = tabs[index].value;
  };

  tabs.forEach((tab, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tab-button';
    if (index === 0) {
      button.classList.add('active');
    }
    button.textContent = tab.label;
    button.addEventListener('click', () => {
      if (!button.classList.contains('active')) {
        setActive(index);
      }
    });
    buttons.push(button);
    nav.append(button);
  });

  const handleCopy = () => {
    field.select();
    copyToClipboard(field.value);
  };

  field.addEventListener('click', handleCopy);
  copyButton.addEventListener('click', handleCopy);

  inputGroup.append(field, copyButton);
  wrapper.append(nav, inputGroup);

  return wrapper;
}

function renderHistory(items) {
  if (!historyContainer) return;
  historyContainer.innerHTML = '';

  if (!items || items.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = '没有上传记录，快去上传第一张图片吧！';
    historyContainer.append(empty);
    return;
  }

  items.forEach((item) => {
    const card = document.createElement('div');
    card.className = 'result-item';

    const header = document.createElement('div');
    header.className = 'flex-row';
    const sizeLabel = formatSize(item.size);
    header.innerHTML = `<strong>${item.name}</strong><span class="badge">${sizeLabel}</span>`;

    const direct = buildFullUrl(item.url);

    const preview = document.createElement('img');
    preview.className = 'image-preview';
    preview.src = direct;
    preview.alt = item.name;
    preview.loading = 'lazy';

    const tabs = createLinkTabs(item.name, direct);

    const actions = document.createElement('div');
    actions.className = 'result-actions';

    const storedName = (item.url || '').split('/').pop();
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.classList.add('danger');
    deleteBtn.textContent = '删除图片';
    deleteBtn.addEventListener('click', () => deleteImage(storedName || item.name));

    actions.append(deleteBtn);
    card.append(header, preview, tabs, actions);
    historyContainer.append(card);
  });
}

async function deleteImage(filename) {
  if (!state.apiUrl || !state.apiKey) {
    showStatus('请先在设置中填写 API 地址与密钥', 'error');
    return;
  }

  if (!filename) {
    showStatus('无法删除未知文件，请刷新后重试', 'error');
    return;
  }

  const confirmed = confirm(`确定要删除 ${filename} 吗？`);
  if (!confirmed) return;

  try {
    const response = await fetch(`${state.apiUrl}/api/images/${encodeURIComponent(filename)}`, {
      method: 'DELETE',
      headers: {
        'X-API-Key': state.apiKey
      }
    });

    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      throw new Error(detail.error || '删除失败');
    }

    showStatus('图片删除成功', 'success');
    await refreshHistory();
  } catch (error) {
    console.error(error);
    showStatus(error.message || '删除失败', 'error');
  }
}

async function refreshHistory() {
  if (!state.apiUrl || !state.apiKey) {
    showStatus('请先在设置中填写 API 地址与密钥', 'error');
    return;
  }

  try {
    const response = await fetch(`${state.apiUrl}/api/images`, {
      headers: {
        'X-API-Key': state.apiKey
      }
    });

    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      throw new Error(detail.error || '获取列表失败');
    }

    const payload = await response.json();
    if (payload.success && Array.isArray(payload.files)) {
      state.history = payload.files;
      persistHistory();
      renderHistory(state.history);
      showStatus('已刷新图片列表', 'success');
    } else {
      throw new Error('返回数据格式不正确');
    }
  } catch (error) {
    console.error(error);
    showStatus(error.message || '获取列表失败', 'error');
  }
}

function handleFiles(fileList) {
  const files = Array.from(fileList || []).filter((file) => file.type.startsWith('image/'));
  if (files.length === 0) {
    pendingFiles = [];
    if (fileInput) {
      fileInput.value = '';
    }
    renderPendingFiles(pendingFiles);
    showStatus('请选择图片文件', 'error');
    return;
  }

  pendingFiles = files;

  if (typeof DataTransfer !== 'undefined' && fileInput) {
    try {
      const transfer = new DataTransfer();
      files.forEach((file) => transfer.items.add(file));
      fileInput.files = transfer.files;
    } catch (error) {
      console.warn('DataTransfer 不可用，已回退到内存存储', error);
    }
  }

  renderPendingFiles(pendingFiles);
  showStatus(`已选择 ${files.length} 张图片`, 'success');
}

function getSelectedFiles() {
  if (fileInput?.files && fileInput.files.length > 0) {
    return Array.from(fileInput.files);
  }
  return pendingFiles;
}

async function handleUpload(event) {
  event?.preventDefault();

  if (!state.apiUrl || !state.apiKey) {
    showStatus('请先在设置中填写 API 地址与密钥', 'error');
    return;
  }

  const files = getSelectedFiles();
  if (!files || files.length === 0) {
    showStatus('请选择需要上传的图片', 'error');
    return;
  }

  const formData = new FormData();
  files.forEach((file) => {
    formData.append('images', file, file.name);
  });

  state.uploading = true;
  uploadButton.disabled = true;
  uploadButton.textContent = '上传中...';
  hideStatus();

  try {
    const response = await fetch(`${state.apiUrl}/api/upload`, {
      method: 'POST',
      headers: {
        'X-API-Key': state.apiKey
      },
      body: formData
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok || !payload.success) {
      throw new Error(payload.error || '上传失败');
    }

    const uploaded = payload.files || [];
    state.history = [...uploaded, ...state.history];
    persistHistory();
    renderResults(uploaded);
    renderHistory(state.history);
    showStatus(`成功上传 ${uploaded.length} 个文件`, 'success');
    if (fileInput) {
      fileInput.value = '';
    }
    pendingFiles = [];
    renderPendingFiles(pendingFiles);
  } catch (error) {
    console.error(error);
    showStatus(error.message || '上传失败，请稍后重试', 'error');
  } finally {
    state.uploading = false;
    uploadButton.disabled = false;
    uploadButton.textContent = '开始上传';
  }
}

function handlePaste(event) {
  const target = event.target;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
    return;
  }

  const files = Array.from(event.clipboardData?.files || []).filter((file) => file.type.startsWith('image/'));
  if (files.length === 0) {
    return;
  }

  event.preventDefault();
  handleFiles(files);
}

function renderResults(files) {
  if (!resultsContainer) return;
  resultsContainer.innerHTML = '';

  if (!files || files.length === 0) {
    resultsContainer.classList.add('hidden');
    return;
  }

  resultsContainer.classList.remove('hidden');

  files.forEach((item) => {
    const direct = buildFullUrl(item.url);
    const card = document.createElement('div');
    card.className = 'result-item';

    const header = document.createElement('div');
    header.className = 'flex-row';
    const sizeLabel = formatSize(item.size);
    header.innerHTML = `<strong>${item.name}</strong><span class="badge">${sizeLabel}</span>`;

    const preview = document.createElement('img');
    preview.className = 'image-preview';
    preview.src = direct;
    preview.alt = item.name;
    preview.loading = 'lazy';

    const tabs = createLinkTabs(item.name, direct);

    card.append(header, preview, tabs);
    resultsContainer.append(card);
  });
}

function setupEventListeners() {
  const settingsForm = el('#settings-form');
  if (settingsForm) {
    settingsForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const url = normalizeBaseUrl(el('#apiUrl').value);
      const key = (el('#apiKey').value || '').trim();

      if (!url) {
        showStatus('请输入有效的 API 地址', 'error');
        return;
      }

      if (!key) {
        showStatus('请输入 API 密钥，或在后端关闭密钥校验', 'error');
        return;
      }

      state.apiUrl = url;
      state.apiKey = key;
      persistSettings();
      updateAvailability();
      applySettingsToForm();
      showStatus('配置已保存', 'success');
    });
  }

  navButtons.forEach((button) => {
    button.addEventListener('click', () => {
      if (button.disabled) {
        showStatus('请先在设置中保存 API 配置', 'error');
        return;
      }
      const { view } = button.dataset;
      setActiveView(view);
      if (view === 'history') {
        renderHistory(state.history);
      }
    });
  });

  dropzone.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      fileInput.click();
    }
  });

  ['dragenter', 'dragover'].forEach((type) => {
    dropzone.addEventListener(type, (event) => {
      event.preventDefault();
      dropzone.classList.add('dragover');
    });
  });

  ['dragleave', 'dragend'].forEach((type) => {
    dropzone.addEventListener(type, (event) => {
      event.preventDefault();
      dropzone.classList.remove('dragover');
    });
  });

  dropzone.addEventListener('drop', (event) => {
    event.preventDefault();
    dropzone.classList.remove('dragover');
    if (event.dataTransfer?.files) {
      handleFiles(event.dataTransfer.files);
    }
  });

  fileInput.addEventListener('change', (event) => handleFiles(event.target.files));
  triggerFileButton.addEventListener('click', () => fileInput.click());
  uploadButton.addEventListener('click', handleUpload);
  refreshButton.addEventListener('click', refreshHistory);
  clearHistoryButton.addEventListener('click', () => {
    state.history = [];
    persistHistory();
    renderHistory(state.history);
    showStatus('已清空本地历史记录', 'success');
  });

  document.addEventListener('paste', handlePaste);

  if (generateApiKeyButton) {
    generateApiKeyButton.addEventListener('click', handleGenerateApiKeyFromSettings);
  }
}

async function handleGenerateApiKeyFromSettings() {
  if (!state.apiUrl) {
    showStatus('请先在设置中填写 API 地址', 'error');
    return;
  }

  if (!state.clientId) {
    showStatus('客户端标识尚未生成，请稍后再试', 'error');
    return;
  }

  const password = window.prompt('请输入访问密码');
  if (password === null) {
    return;
  }

  const trimmedPassword = password.trim();
  if (!trimmedPassword) {
    showStatus('访问密码不能为空', 'error');
    return;
  }

  try {
    const response = await fetch(`${state.apiUrl}/api/auth/api-key`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        password: trimmedPassword,
        clientId: state.clientId
      })
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok || !payload.success || !payload.apiKey) {
      throw new Error(payload.error || '生成 API 密钥失败');
    }

    state.apiKey = payload.apiKey;
    persistSettings();
    applySettingsToForm();
    updateAvailability();
    showStatus('已生成并填入 API 密钥', 'success');
  } catch (error) {
    console.error(error);
    showStatus(error.message || '生成失败，请稍后再试', 'error');
  }
}

async function initializeApp() {
  try {
    state.clientId = await computeClientId();
  } catch (error) {
    console.error('生成客户端标识失败:', error);
    state.clientId = '';
  }

  setActiveView('upload');
  setupEventListeners();
  loadPersistedState();
  hideStatus();
}

document.addEventListener('DOMContentLoaded', () => {
  initializeApp().catch((error) => {
    console.error(error);
    showStatus('初始化应用时出现错误，请刷新页面', 'error');
  });
});
