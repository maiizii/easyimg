const storageKeys = {
  apiUrl: 'openimg:apiUrl',
  apiKey: 'openimg:apiKey',
  history: 'openimg:history'
};

const state = {
  apiUrl: '',
  apiKey: '',
  clientId: '',
  generatedKey: '',
  uploading: false,
  history: []
};

const el = (selector) => document.querySelector(selector);

const statusBox = el('#status');
const resultsContainer = el('#upload-results');
const historyContainer = el('#history-list');
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
const currentApi = el('#current-api');
const currentKey = el('#current-key');
const exampleUpload = el('#example-upload');
const exampleHistory = el('#example-history');
const apiPasswordInput = el('#apiPassword');
const apiKeyForm = el('#api-key-form');
const generatedKeyRow = el('#generated-key-row');
const generatedKeyCode = el('#generated-key');
const copyGeneratedKeyButton = el('#copy-generated-key');
const useGeneratedKeyButton = el('#use-generated-key');
const generatorStatus = el('#api-generator-status');
const clientIdDisplay = el('#client-id');
const copyClientIdButton = el('#copy-client-id');

let statusTimer = null;
let pendingFiles = [];

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

function updateClientIdDisplay() {
  if (!clientIdDisplay) return;
  clientIdDisplay.textContent = state.clientId || '未获取';
}

function loadPersistedState() {
  const storedUrl = localStorage.getItem(storageKeys.apiUrl) || '';
  const normalizedStoredUrl = normalizeBaseUrl(storedUrl);
  const defaultUrl = normalizeBaseUrl(window.location.origin);

  state.apiUrl = normalizedStoredUrl || defaultUrl;
  state.apiKey = localStorage.getItem(storageKeys.apiKey) || '';
  state.generatedKey = '';

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
  updateAvailability();
  updateApiPreview();
  updateGeneratedKeyUI();
  setGeneratorStatus('');
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

function buildApiBase() {
  if (!state.apiUrl) {
    return 'https://api.example.com/api';
  }
  return `${state.apiUrl.replace(/\/+$/, '')}/api`;
}

function updateApiPreview() {
  const apiBase = buildApiBase();
  if (currentApi) {
    currentApi.textContent = state.apiUrl || '未配置';
  }
  if (currentKey) {
    currentKey.textContent = state.apiKey || '未配置';
  }
  if (exampleUpload) {
    exampleUpload.textContent = `curl -X POST "${apiBase}/upload" \\
  -H "X-API-Key: ${state.apiKey || 'YOUR_API_KEY'}" \\
  -F "images=@/path/to/image.jpg"`;
  }
  if (exampleHistory) {
    exampleHistory.textContent = `curl "${apiBase}/images" \\
  -H "X-API-Key: ${state.apiKey || 'YOUR_API_KEY'}"`;
  }
}

function updateGeneratedKeyUI() {
  if (!generatedKeyRow || !generatedKeyCode) {
    return;
  }

  if (state.generatedKey) {
    generatedKeyCode.textContent = state.generatedKey;
    generatedKeyRow.classList.remove('hidden');
  } else {
    generatedKeyCode.textContent = '';
    generatedKeyRow.classList.add('hidden');
  }
}

function setGeneratorStatus(message) {
  if (!generatorStatus) return;
  generatorStatus.textContent = message || '';
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

function renderHistory(items) {
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
    header.innerHTML = `<strong>${item.name}</strong><span class="badge">${(item.size / 1024).toFixed(1)} KB</span>`;

    const linkList = document.createElement('div');
    linkList.className = 'result-links';

    const direct = buildFullUrl(item.url);

    const fullLink = document.createElement('code');
    fullLink.textContent = direct;

    const markdown = document.createElement('code');
    markdown.textContent = `![${item.name}](${direct})`;

    const bbcode = document.createElement('code');
    bbcode.textContent = `[img]${direct}[/img]`;

    const storedName = (item.url || '').split('/').pop();

    const actions = document.createElement('div');
    actions.className = 'result-actions';

    const copyDirect = document.createElement('button');
    copyDirect.type = 'button';
    copyDirect.textContent = '复制直链';
    copyDirect.addEventListener('click', () => copyToClipboard(direct));

    const copyMarkdown = document.createElement('button');
    copyMarkdown.type = 'button';
    copyMarkdown.classList.add('ghost');
    copyMarkdown.textContent = '复制 Markdown';
    copyMarkdown.addEventListener('click', () => copyToClipboard(markdown.textContent));

    const copyBBCode = document.createElement('button');
    copyBBCode.type = 'button';
    copyBBCode.classList.add('ghost');
    copyBBCode.textContent = '复制 BBCode';
    copyBBCode.addEventListener('click', () => copyToClipboard(bbcode.textContent));

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.classList.add('danger');
    deleteBtn.textContent = '删除图片';
    deleteBtn.addEventListener('click', () => deleteImage(storedName || item.name));

    actions.append(copyDirect, copyMarkdown, copyBBCode, deleteBtn);
    linkList.append(fullLink, markdown, bbcode);
    card.append(header, linkList, actions);

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
    showStatus('请选择图片文件', 'error');
    return;
  }

  pendingFiles = files;

  if (typeof DataTransfer !== 'undefined') {
    try {
      const transfer = new DataTransfer();
      files.forEach((file) => transfer.items.add(file));
      fileInput.files = transfer.files;
    } catch (error) {
      console.warn('DataTransfer 不可用，已回退到内存存储', error);
    }
  }

  showStatus(`已选择 ${files.length} 张图片`, 'success');
}

function getSelectedFiles() {
  if (fileInput.files && fileInput.files.length > 0) {
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
    fileInput.value = '';
    pendingFiles = [];
  } catch (error) {
    console.error(error);
    showStatus(error.message || '上传失败，请稍后重试', 'error');
  } finally {
    state.uploading = false;
    uploadButton.disabled = false;
    uploadButton.textContent = '开始上传';
  }
}

function renderResults(files) {
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

    const title = document.createElement('div');
    title.innerHTML = `<strong>${item.name}</strong> <span class="badge">${(item.size / 1024).toFixed(1)} KB</span>`;

    const preview = document.createElement('img');
    preview.src = direct;
    preview.alt = item.name;
    preview.loading = 'lazy';
    preview.style.maxHeight = '240px';

    const linkList = document.createElement('div');
    linkList.className = 'result-links';

    const directCode = document.createElement('code');
    directCode.textContent = direct;

    const markdownCode = document.createElement('code');
    markdownCode.textContent = `![${item.name}](${direct})`;

    const bbcode = document.createElement('code');
    bbcode.textContent = `[img]${direct}[/img]`;

    const actions = document.createElement('div');
    actions.className = 'result-actions';

    const copyDirect = document.createElement('button');
    copyDirect.type = 'button';
    copyDirect.textContent = '复制直链';
    copyDirect.addEventListener('click', () => copyToClipboard(direct));

    const copyMarkdown = document.createElement('button');
    copyMarkdown.type = 'button';
    copyMarkdown.classList.add('ghost');
    copyMarkdown.textContent = '复制 Markdown';
    copyMarkdown.addEventListener('click', () => copyToClipboard(markdownCode.textContent));

    const copyBBCode = document.createElement('button');
    copyBBCode.type = 'button';
    copyBBCode.classList.add('ghost');
    copyBBCode.textContent = '复制 BBCode';
    copyBBCode.addEventListener('click', () => copyToClipboard(bbcode.textContent));

    actions.append(copyDirect, copyMarkdown, copyBBCode);
    linkList.append(directCode, markdownCode, bbcode);
    card.append(title, preview, linkList, actions);

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
      updateApiPreview();
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

  document.querySelectorAll('[data-copy]').forEach((button) => {
    button.addEventListener('click', () => {
      const target = document.getElementById(button.dataset.copy);
      if (target) {
        copyToClipboard(target.textContent.trim());
      }
    });
  });

  if (copyClientIdButton) {
    copyClientIdButton.addEventListener('click', () => {
      if (!state.clientId) {
        showStatus('客户端标识尚未生成，请稍后再试', 'error');
        return;
      }
      copyToClipboard(state.clientId);
    });
  }

  if (copyGeneratedKeyButton) {
    copyGeneratedKeyButton.addEventListener('click', () => {
      if (!state.generatedKey) {
        showStatus('请先生成 API 密钥', 'error');
        return;
      }
      copyToClipboard(state.generatedKey);
    });
  }

  if (useGeneratedKeyButton) {
    useGeneratedKeyButton.addEventListener('click', () => {
      if (!state.generatedKey) {
        showStatus('请先生成 API 密钥', 'error');
        return;
      }

      state.apiKey = state.generatedKey;
      persistSettings();
      applySettingsToForm();
      updateAvailability();
      updateApiPreview();
      showStatus('已保存生成的 API 密钥', 'success');
      setGeneratorStatus('密钥已保存到设置中，可立即使用。');
    });
  }

  if (apiKeyForm) {
    apiKeyForm.addEventListener('submit', handleGenerateApiKey);
  }
}

async function handleGenerateApiKey(event) {
  event.preventDefault();

  if (!state.apiUrl) {
    showStatus('请先在设置中填写 API 地址', 'error');
    return;
  }

  if (!state.clientId) {
    showStatus('客户端标识尚未生成，请稍后再试', 'error');
    return;
  }

  const password = (apiPasswordInput?.value || '').trim();
  if (!password) {
    showStatus('请输入访问密码', 'error');
    return;
  }

  setGeneratorStatus('正在生成专属 API 密钥...');
  state.generatedKey = '';
  updateGeneratedKeyUI();

  try {
    const response = await fetch(`${state.apiUrl}/api/auth/api-key`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        password,
        clientId: state.clientId
      })
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok || !payload.success || !payload.apiKey) {
      throw new Error(payload.error || '生成 API 密钥失败');
    }

    state.generatedKey = payload.apiKey;
    updateGeneratedKeyUI();
    setGeneratorStatus('生成成功，请复制或直接保存到设置中。');
    showStatus('已生成专属 API 密钥', 'success');
  } catch (error) {
    console.error(error);
    setGeneratorStatus(error.message || '生成失败，请稍后再试');
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

  updateClientIdDisplay();
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
