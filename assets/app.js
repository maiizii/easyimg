const storageKeys = {
  apiUrl: 'openimg:apiUrl',
  apiKey: 'openimg:apiKey',
  history: 'openimg:history'
};

const state = {
  apiUrl: '',
  apiKey: '',
  uploading: false,
  history: []
};

const el = (selector) => document.querySelector(selector);

const statusBox = el('#status');
const resultsContainer = el('#upload-results');
const historyContainer = el('#history-list');
const uploadSection = el('#upload-section');
const historySection = el('#history-section');

function showStatus(message, type = 'success') {
  statusBox.textContent = message;
  statusBox.className = `status show ${type}`;
}

function hideStatus() {
  statusBox.className = 'status';
  statusBox.textContent = '';
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

function loadPersistedState() {
  state.apiUrl = localStorage.getItem(storageKeys.apiUrl) || '';
  state.apiKey = localStorage.getItem(storageKeys.apiKey) || '';
  try {
    const savedHistory = JSON.parse(localStorage.getItem(storageKeys.history) || '[]');
    if (Array.isArray(savedHistory)) {
      state.history = savedHistory;
    }
  } catch (error) {
    state.history = [];
  }

  el('#apiUrl').value = state.apiUrl;
  el('#apiKey').value = state.apiKey;
  renderHistory(state.history);
  toggleSections();
}

function persistSettings() {
  localStorage.setItem(storageKeys.apiUrl, state.apiUrl);
  localStorage.setItem(storageKeys.apiKey, state.apiKey);
}

function persistHistory() {
  localStorage.setItem(storageKeys.history, JSON.stringify(state.history));
}

function toggleSections() {
  const configured = Boolean(state.apiUrl && state.apiKey);
  uploadSection.classList.toggle('hidden', !configured);
  historySection.classList.toggle('hidden', !configured);
  el('#empty-config').classList.toggle('hidden', configured);
}

function buildFullUrl(path) {
  if (!state.apiUrl) return path;
  return `${state.apiUrl}${path.startsWith('/') ? '' : '/'}${path}`;
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    showStatus('已复制到剪贴板', 'success');
  } catch (error) {
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

    const actions = document.createElement('div');
    actions.className = 'result-actions';

    const copyDirect = document.createElement('button');
    copyDirect.type = 'button';
    copyDirect.textContent = '复制直链';
    copyDirect.addEventListener('click', () => copyToClipboard(direct));

    const copyMarkdown = document.createElement('button');
    copyMarkdown.type = 'button';
    copyMarkdown.className = 'secondary';
    copyMarkdown.textContent = '复制 Markdown';
    copyMarkdown.addEventListener('click', () => copyToClipboard(markdown.textContent));

    const copyBBCode = document.createElement('button');
    copyBBCode.type = 'button';
    copyBBCode.className = 'secondary';
    copyBBCode.textContent = '复制 BBCode';
    copyBBCode.addEventListener('click', () => copyToClipboard(bbcode.textContent));

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'danger';
    deleteBtn.textContent = '删除图片';
    deleteBtn.addEventListener('click', () => deleteImage(item.name));

    actions.append(copyDirect, copyMarkdown, copyBBCode, deleteBtn);
    linkList.append(fullLink, markdown, bbcode);
    card.append(header, linkList, actions);

    historyContainer.append(card);
  });
}

async function deleteImage(filename) {
  if (!state.apiUrl || !state.apiKey) {
    showStatus('请先在配置中填写 API 地址与密钥', 'error');
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
    showStatus('请先在配置中填写 API 地址与密钥', 'error');
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

async function handleUpload(event) {
  event.preventDefault();

  if (!state.apiUrl || !state.apiKey) {
    showStatus('请先在配置中填写 API 地址与密钥', 'error');
    return;
  }

  const fileInput = el('#imageFiles');
  if (!fileInput.files || fileInput.files.length === 0) {
    showStatus('请选择需要上传的图片', 'error');
    return;
  }

  const formData = new FormData();
  Array.from(fileInput.files).forEach((file) => {
    formData.append('images', file, file.name);
  });

  state.uploading = true;
  el('#upload-button').disabled = true;
  el('#upload-button').textContent = '上传中...';
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

    const files = payload.files || [];
    state.history = [...files, ...state.history];
    persistHistory();
    renderResults(files);
    renderHistory(state.history);
    showStatus(`成功上传 ${files.length} 个文件`, 'success');
    fileInput.value = '';
  } catch (error) {
    console.error(error);
    showStatus(error.message || '上传失败，请稍后重试', 'error');
  } finally {
    state.uploading = false;
    el('#upload-button').disabled = false;
    el('#upload-button').textContent = '开始上传';
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
    copyMarkdown.className = 'secondary';
    copyMarkdown.textContent = '复制 Markdown';
    copyMarkdown.addEventListener('click', () => copyToClipboard(markdownCode.textContent));

    const copyBBCode = document.createElement('button');
    copyBBCode.type = 'button';
    copyBBCode.className = 'secondary';
    copyBBCode.textContent = '复制 BBCode';
    copyBBCode.addEventListener('click', () => copyToClipboard(bbcode.textContent));

    actions.append(copyDirect, copyMarkdown, copyBBCode);
    linkList.append(directCode, markdownCode, bbcode);
    card.append(title, preview, linkList, actions);

    resultsContainer.append(card);
  });
}

function setupEventListeners() {
  el('#settings-form').addEventListener('submit', (event) => {
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
    toggleSections();
    showStatus('配置已保存', 'success');
  });

  el('#upload-form').addEventListener('submit', handleUpload);
  el('#refresh-history').addEventListener('click', refreshHistory);
  el('#clear-history').addEventListener('click', () => {
    state.history = [];
    persistHistory();
    renderHistory(state.history);
    showStatus('已清空本地历史记录', 'success');
  });
}

document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  loadPersistedState();
  hideStatus();
});
