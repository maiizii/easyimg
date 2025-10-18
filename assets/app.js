const storageKeys = {
  apiUrl: 'openimg:apiUrl',
  apiKey: 'openimg:apiKey',
  history: 'openimg:history',
  autoUpload: 'openimg:autoUpload'
};

const state = {
  apiUrl: '',
  apiKey: '',
  clientId: '',
  uploading: false,
  history: [],
  autoUpload: false
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
const clearPendingButton = el('#clear-pending');
const resetUploadButton = el('#reset-upload');
const navButtons = Array.from(document.querySelectorAll('.nav-button'));
const homeLinks = Array.from(document.querySelectorAll('[data-view-link="upload"]'));
const viewSections = new Map(
  Array.from(document.querySelectorAll('.view')).map((section) => [section.id.replace('view-', ''), section])
);
const warnings = {
  upload: el('#upload-warning'),
  history: el('#history-warning')
};
const generateApiKeyButton = el('#generate-api-key-button');
const autoUploadToggle = el('#auto-upload');

let statusTimer = null;
let pendingFiles = [];
let pendingPreviewUrls = [];

function getItemTimestamp(item) {
  if (!item || typeof item !== 'object') {
    return 0;
  }

  const source = item.uploadTime || item.createdAt || item.time || item.timestamp;
  if (!source) {
    return 0;
  }

  const date = new Date(source);
  const time = date.getTime();

  if (!Number.isNaN(time)) {
    return time;
  }

  const numeric = Number(source);
  return Number.isNaN(numeric) ? 0 : numeric;
}

function sortHistoryItems(items) {
  return [...(items || [])].sort((a, b) => {
    const diff = getItemTimestamp(b) - getItemTimestamp(a);
    if (diff !== 0) {
      return diff;
    }
    return (b?.name || '').localeCompare(a?.name || '');
  });
}

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

function generateRandomString(length = 8) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';

  if (window.crypto?.getRandomValues) {
    const values = new Uint8Array(length);
    window.crypto.getRandomValues(values);
    result = Array.from(values, (value) => alphabet[value % alphabet.length]).join('');
  } else {
    for (let index = 0; index < length; index += 1) {
      const randomIndex = Math.floor(Math.random() * alphabet.length);
      result += alphabet[randomIndex];
    }
  }

  return result;
}

function getFileExtension(file) {
  if (!file || typeof file.name !== 'string') {
    return '';
  }

  const match = file.name.match(/\.([a-zA-Z0-9]{1,10})$/);
  return match ? `.${match[1].toLowerCase()}` : '';
}

function generateStoredFilename(file) {
  const timestamp = Date.now().toString(36);
  const random = generateRandomString(6);
  const extension = getFileExtension(file);
  return `img_${timestamp}_${random}${extension}`;
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
  state.autoUpload = localStorage.getItem(storageKeys.autoUpload) === '1';

  try {
    const savedHistory = JSON.parse(localStorage.getItem(storageKeys.history) || '[]');
    if (Array.isArray(savedHistory)) {
      state.history = sortHistoryItems(savedHistory);
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
  localStorage.setItem(storageKeys.autoUpload, state.autoUpload ? '1' : '0');
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

  if (autoUploadToggle) {
    autoUploadToggle.checked = Boolean(state.autoUpload);
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

function formatTimestamp(value) {
  if (!value) {
    return '时间未知';
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '时间未知';
  }
  return date.toLocaleString('zh-CN', { hour12: false });
}

function fileIdentity(file) {
  return `${file.name}__${file.size}__${file.lastModified}`;
}

function mergeFileCollections(existing, incoming) {
  const merged = [...existing];
  const seen = new Set(existing.map(fileIdentity));

  incoming.forEach((file) => {
    const key = fileIdentity(file);
    if (!seen.has(key)) {
      merged.push(file);
      seen.add(key);
    }
  });

  return merged;
}

function clearFileSelection() {
  if (!fileInput) return;
  fileInput.value = '';
  if (typeof DataTransfer !== 'undefined') {
    try {
      const transfer = new DataTransfer();
      fileInput.files = transfer.files;
    } catch (error) {
      console.warn('DataTransfer 不可用，已跳过文件输入重置', error);
    }
  }
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

  const escapedNameForHtml = String(name || '').replace(/"/g, '&quot;');

  const tabs = [
    { key: 'url', label: 'URL', value: directUrl },
    { key: 'markdown', label: 'Markdown', value: `![${name}](${directUrl})` },
    { key: 'bbcode', label: 'BBCode', value: `[img]${directUrl}[/img]` },
    { key: 'html', label: 'HTML', value: `<img src="${directUrl}" alt="${escapedNameForHtml}" />` }
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
    card.className = 'result-item history-card';

    const direct = buildFullUrl(item.url);

    const previewLink = document.createElement('a');
    previewLink.className = 'thumb-link';
    previewLink.href = direct;
    previewLink.target = '_blank';
    previewLink.rel = 'noopener noreferrer';
    previewLink.title = '点击查看大图';

    const preview = document.createElement('img');
    preview.className = 'history-thumb';
    preview.src = direct;
    preview.alt = item.name;
    preview.loading = 'lazy';

    previewLink.append(preview);

    const content = document.createElement('div');
    content.className = 'history-content';

    const info = document.createElement('div');
    info.className = 'history-info';

    const meta = document.createElement('div');
    meta.className = 'history-meta';

    const name = document.createElement('div');
    name.className = 'history-name';
    name.textContent = item.name;

    const details = document.createElement('div');
    details.className = 'history-details';
    const timestamp = formatTimestamp(item.uploadTime || item.createdAt || item.time);
    const timeText = document.createElement('span');
    timeText.textContent = `上传时间：${timestamp}`;
    details.append(timeText);

    const sizeLabel = formatSize(item.size);
    if (sizeLabel) {
      const sizeBadge = document.createElement('span');
      sizeBadge.className = 'badge';
      sizeBadge.textContent = sizeLabel;
      details.append(sizeBadge);
    }

    meta.append(name, details);
    info.append(meta);

    const storedName = (item.url || '').split('/').pop();
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.classList.add('danger');
    deleteBtn.textContent = '删除图片';
    deleteBtn.addEventListener('click', () => deleteImage(storedName || item.name));

    info.append(deleteBtn);

    const tabs = createLinkTabs(item.name, direct);
    tabs.classList.add('history-tabs');

    content.append(info, tabs);

    card.append(previewLink, content);
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
      const sorted = sortHistoryItems(payload.files);
      state.history = sorted;
      persistHistory();
      renderHistory(sorted);
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
    if (!pendingFiles.length) {
      clearFileSelection();
      renderPendingFiles(pendingFiles);
    }
    showStatus('请选择图片文件', 'error');
    return;
  }

  pendingFiles = mergeFileCollections(pendingFiles, files);

  if (typeof DataTransfer !== 'undefined' && fileInput) {
    try {
      const transfer = new DataTransfer();
      pendingFiles.forEach((file) => transfer.items.add(file));
      fileInput.files = transfer.files;
    } catch (error) {
      console.warn('DataTransfer 不可用，已回退到内存存储', error);
    }
  }

  renderPendingFiles(pendingFiles);
  showStatus(`已添加 ${files.length} 张图片，共 ${pendingFiles.length} 张待上传`, 'success');

  if (state.autoUpload) {
    if (state.uploading) {
      showStatus('已加入队列，将在当前上传完成后继续处理', 'success');
      return;
    }
    window.requestAnimationFrame(() => handleUpload());
  }
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

  if (state.uploading) {
    showStatus('正在上传，请稍后', 'error');
    return;
  }

  const files = getSelectedFiles();
  if (!files || files.length === 0) {
    showStatus('请选择需要上传的图片', 'error');
    return;
  }

  const uploadingKeys = new Set(files.map(fileIdentity));

  const formData = new FormData();
  files.forEach((file) => {
    const storedName = generateStoredFilename(file);
    formData.append('images', file, storedName);
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

    const now = new Date().toISOString();
    const uploaded = (payload.files || []).map((item) => ({
      ...item,
      uploadTime: item.uploadTime || now
    }));
    const updatedHistory = sortHistoryItems([...uploaded, ...state.history]);
    state.history = updatedHistory;
    persistHistory();
    renderResults(uploaded);
    renderHistory(updatedHistory);
    showStatus(`成功上传 ${uploaded.length} 个文件`, 'success');
    clearFileSelection();
    pendingFiles = pendingFiles.filter((file) => !uploadingKeys.has(fileIdentity(file)));

    if (pendingFiles.length > 0) {
      if (typeof DataTransfer !== 'undefined' && fileInput) {
        try {
          const transfer = new DataTransfer();
          pendingFiles.forEach((file) => transfer.items.add(file));
          fileInput.files = transfer.files;
        } catch (error) {
          console.warn('DataTransfer 不可用，已回退到内存存储', error);
        }
      }
    }

    renderPendingFiles(pendingFiles);

    if (state.autoUpload && pendingFiles.length > 0) {
      window.requestAnimationFrame(() => handleUpload());
    }
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
    card.className = 'result-item history-card upload-card';

    const previewLink = document.createElement('a');
    previewLink.className = 'thumb-link';
    previewLink.href = direct;
    previewLink.target = '_blank';
    previewLink.rel = 'noopener noreferrer';
    previewLink.title = '点击查看大图';

    const preview = document.createElement('img');
    preview.className = 'history-thumb';
    preview.src = direct;
    preview.alt = item.name;
    preview.loading = 'lazy';

    previewLink.append(preview);

    const content = document.createElement('div');
    content.className = 'history-content';

    const info = document.createElement('div');
    info.className = 'history-info';

    const meta = document.createElement('div');
    meta.className = 'history-meta';

    const name = document.createElement('div');
    name.className = 'history-name';
    name.textContent = item.name;

    const details = document.createElement('div');
    details.className = 'history-details';
    const rawTimestamp = item.uploadTime || item.createdAt || item.time;
    const timestamp = formatTimestamp(rawTimestamp);
    const timeText = document.createElement('span');
    timeText.textContent = rawTimestamp ? `上传时间：${timestamp}` : '上传时间：刚刚';
    details.append(timeText);

    const sizeBadge = document.createElement('span');
    sizeBadge.className = 'badge';
    sizeBadge.textContent = formatSize(item.size);
    details.append(sizeBadge);

    meta.append(name, details);
    info.append(meta);

    const tabs = createLinkTabs(item.name, direct);

    content.append(info, tabs);

    card.append(previewLink, content);
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

  if (autoUploadToggle) {
    autoUploadToggle.addEventListener('change', (event) => {
      state.autoUpload = event.target.checked;
      persistSettings();
      showStatus(state.autoUpload ? '已开启自动上传' : '已关闭自动上传', 'success');
      if (state.autoUpload && pendingFiles.length > 0 && !state.uploading) {
        window.requestAnimationFrame(() => handleUpload());
      }
    });
  }

  homeLinks.forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      setActiveView('upload');
    });
  });

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

  if (clearPendingButton) {
    clearPendingButton.addEventListener('click', () => {
      pendingFiles = [];
      clearFileSelection();
      renderPendingFiles(pendingFiles);
      showStatus('已清空待上传文件', 'success');
    });
  }

  if (resetUploadButton) {
    resetUploadButton.addEventListener('click', () => {
      pendingFiles = [];
      clearFileSelection();
      renderPendingFiles(pendingFiles);
      if (resultsContainer) {
        resultsContainer.innerHTML = '';
        resultsContainer.classList.add('hidden');
      }
      showStatus('已重新开始上传流程', 'success');
    });
  }

  if (refreshButton) {
    refreshButton.addEventListener('click', refreshHistory);
  }

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
