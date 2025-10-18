const storageKeys = {
  token: 'easyimg:adminToken'
};

const state = {
  token: '',
  page: 1,
  pageSize: 24,
  total: 0,
  totalPages: 0,
  files: [],
  loading: false
};

const selectors = {
  loginSection: document.querySelector('#admin-login'),
  dashboardSection: document.querySelector('#admin-dashboard'),
  loginForm: document.querySelector('#admin-login-form'),
  passwordInput: document.querySelector('#admin-password'),
  loginButton: document.querySelector('#admin-login-button'),
  refreshButton: document.querySelector('#admin-refresh'),
  logoutButton: document.querySelector('#admin-logout'),
  prevButton: document.querySelector('#admin-prev-page'),
  nextButton: document.querySelector('#admin-next-page'),
  pageInfo: document.querySelector('#admin-page-info'),
  pageSizeSelect: document.querySelector('#admin-page-size'),
  summary: document.querySelector('#admin-summary'),
  list: document.querySelector('#admin-image-list'),
  status: document.querySelector('#admin-status')
};

let statusTimer = null;

function showStatus(message, type = 'success') {
  if (!selectors.status) return;
  selectors.status.textContent = message;
  selectors.status.className = `toast show ${type}`;
  if (statusTimer) {
    clearTimeout(statusTimer);
  }
  statusTimer = setTimeout(() => {
    selectors.status.className = 'toast';
    selectors.status.textContent = '';
    statusTimer = null;
  }, 3200);
}

function clearStatus() {
  if (!selectors.status) return;
  selectors.status.className = 'toast';
  selectors.status.textContent = '';
  if (statusTimer) {
    clearTimeout(statusTimer);
    statusTimer = null;
  }
}

function persistToken(token) {
  if (!token) {
    sessionStorage.removeItem(storageKeys.token);
    return;
  }
  sessionStorage.setItem(storageKeys.token, token);
}

function restoreToken() {
  return sessionStorage.getItem(storageKeys.token) || '';
}

function setView(view) {
  const isDashboard = view === 'dashboard';
  selectors.loginSection?.classList.toggle('active', !isDashboard);
  selectors.dashboardSection?.classList.toggle('active', isDashboard);
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

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    showStatus('已复制链接', 'success');
  } catch (error) {
    console.error('复制失败', error);
    showStatus('复制失败，请手动复制', 'error');
  }
}

function createLinkTabs(name, directUrl) {
  const wrapper = document.createElement('div');
  wrapper.className = 'link-tabs';

  const escapedName = String(name || '').replace(/"/g, '&quot;');
  const tabs = [
    { key: 'url', label: 'URL', value: directUrl },
    { key: 'markdown', label: 'Markdown', value: `![${name}](${directUrl})` },
    { key: 'bbcode', label: 'BBCode', value: `[img]${directUrl}[/img]` },
    { key: 'html', label: 'HTML', value: `<img src="${directUrl}" alt="${escapedName}" />` }
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

function renderEmptyState() {
  if (!selectors.list) return;
  selectors.list.innerHTML = '';
  const empty = document.createElement('div');
  empty.className = 'empty-state';
  empty.textContent = '暂无上传记录';
  selectors.list.append(empty);
}

function updatePaginationControls() {
  if (!selectors.pageInfo) return;
  const totalPages = state.totalPages || (state.total > 0 ? 1 : 0);

  if (totalPages <= 0) {
    selectors.pageInfo.textContent = '暂无数据';
  } else {
    selectors.pageInfo.textContent = `第 ${state.page} / ${totalPages} 页`;
  }

  if (selectors.summary) {
    selectors.summary.textContent = state.total > 0
      ? `共 ${state.total} 张图片`
      : '暂无图片数据';
  }

  if (selectors.prevButton) {
    selectors.prevButton.disabled = state.page <= 1 || totalPages <= 0;
  }
  if (selectors.nextButton) {
    selectors.nextButton.disabled = totalPages <= 0 || state.page >= totalPages;
  }
  if (selectors.pageSizeSelect) {
    selectors.pageSizeSelect.disabled = state.loading;
  }
  if (selectors.refreshButton) {
    selectors.refreshButton.disabled = state.loading;
  }
}

function renderFiles(files) {
  if (!selectors.list) return;

  selectors.list.innerHTML = '';

  if (!files || files.length === 0) {
    renderEmptyState();
    return;
  }

  files.forEach((item) => {
    const card = document.createElement('div');
    card.className = 'result-item history-card admin-card';

    const previewLink = document.createElement('a');
    previewLink.className = 'thumb-link';
    previewLink.href = item.fullUrl || item.url;
    previewLink.target = '_blank';
    previewLink.rel = 'noopener noreferrer';
    previewLink.title = '点击查看原图';

    const preview = document.createElement('img');
    preview.className = 'history-thumb';
    preview.src = item.fullUrl || item.url;
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
    details.innerHTML = `
      <span>所属客户端：<code>${item.clientId}</code></span>
      <span>大小：${formatSize(item.size)}</span>
      <span>上传时间：${formatTimestamp(item.uploadTime)}</span>
    `;

    const actions = document.createElement('div');
    actions.className = 'history-actions';

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'danger';
    deleteButton.textContent = '删除';
    deleteButton.addEventListener('click', () => handleDelete(item));

    actions.append(deleteButton);

    meta.append(name, details);
    info.append(meta, actions);

    const links = createLinkTabs(item.name, item.fullUrl || item.url);

    content.append(info, links);

    card.append(previewLink, content);
    selectors.list.append(card);
  });
}

function setLoading(loading) {
  state.loading = loading;
  if (selectors.loginButton) {
    selectors.loginButton.disabled = loading && selectors.loginSection?.classList.contains('active');
  }
  if (selectors.refreshButton) {
    selectors.refreshButton.disabled = loading;
  }
  if (selectors.prevButton) {
    selectors.prevButton.disabled = loading || state.page <= 1;
  }
  if (selectors.nextButton) {
    selectors.nextButton.disabled = loading || state.page >= (state.totalPages || 0);
  }
  updatePaginationControls();
}

async function handleDelete(item) {
  if (!state.token) {
    showStatus('未登录，无法执行操作', 'error');
    return;
  }

  const confirmed = window.confirm(`确定要删除 ${item.name} 吗？`);
  if (!confirmed) {
    return;
  }

  try {
    const response = await fetch(`/api/admin/images/${encodeURIComponent(item.clientId)}/${encodeURIComponent(item.name)}`, {
      method: 'DELETE',
      headers: {
        'X-Admin-Token': state.token
      }
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.success) {
      throw new Error(payload.error || '删除失败');
    }

    showStatus('删除成功', 'success');
    await fetchAndRender();
  } catch (error) {
    console.error('删除失败', error);
    showStatus(error.message || '删除失败，请稍后重试', 'error');
  }
}

async function fetchImages() {
  const params = new URLSearchParams({
    page: String(state.page),
    pageSize: String(state.pageSize)
  });

  const response = await fetch(`/api/admin/images?${params.toString()}`, {
    headers: {
      'X-Admin-Token': state.token
    }
  });

  if (response.status === 401) {
    throw new Error('登录已过期，请重新登录');
  }

  const payload = await response.json().catch(() => ({}));

  if (!response.ok || !payload.success) {
    throw new Error(payload.error || '获取数据失败');
  }

  state.page = payload.pagination?.page || state.page;
  state.pageSize = payload.pagination?.pageSize || state.pageSize;
  state.total = payload.pagination?.total ?? 0;
  state.totalPages = payload.pagination?.totalPages ?? 0;
  state.files = payload.files || [];
}

async function fetchAndRender(forceRefresh = false) {
  if (!state.token) {
    return;
  }

  if (forceRefresh) {
    state.page = 1;
  }

  setLoading(true);
  clearStatus();

  try {
    await fetchImages();
    renderFiles(state.files);
    updatePaginationControls();
  } catch (error) {
    console.error('获取数据失败', error);
    if (error.message && error.message.includes('登录已过期')) {
      handleLogout(true);
      showStatus('登录已过期，请重新登录', 'error');
    } else {
      renderEmptyState();
      showStatus(error.message || '获取数据失败', 'error');
    }
  } finally {
    setLoading(false);
  }
}

async function handleLogin(event) {
  event.preventDefault();
  if (state.loading) return;

  const password = selectors.passwordInput?.value?.trim();
  if (!password) {
    showStatus('请输入管理员密码', 'error');
    return;
  }

  setLoading(true);

  try {
    const response = await fetch('/api/admin/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ password })
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok || !payload.success) {
      throw new Error(payload.error || '登录失败');
    }

    state.token = payload.token;
    persistToken(state.token);
    if (selectors.passwordInput) {
      selectors.passwordInput.value = '';
    }
    setView('dashboard');
    showStatus('登录成功', 'success');
    await fetchAndRender(true);
  } catch (error) {
    console.error('登录失败', error);
    showStatus(error.message || '登录失败，请稍后再试', 'error');
  } finally {
    setLoading(false);
  }
}

async function handleLogout(silent = false) {
  const token = state.token;
  state.token = '';
  state.page = 1;
  state.total = 0;
  state.totalPages = 0;
  state.files = [];
  persistToken('');
  setView('login');
  renderEmptyState();
  updatePaginationControls();

  if (!silent && token) {
    try {
      await fetch('/api/admin/logout', {
        method: 'POST',
        headers: {
          'X-Admin-Token': token
        }
      });
    } catch (error) {
      console.warn('退出登录请求失败', error);
    }
  }
}

async function verifyExistingSession() {
  const token = restoreToken();
  if (!token) {
    setView('login');
    renderEmptyState();
    updatePaginationControls();
    return;
  }

  state.token = token;
  setLoading(true);

  try {
    const response = await fetch('/api/admin/session', {
      headers: {
        'X-Admin-Token': token
      }
    });

    if (!response.ok) {
      throw new Error('登录状态已失效');
    }

    const payload = await response.json().catch(() => ({}));
    if (!payload.success) {
      throw new Error('登录状态已失效');
    }

    setView('dashboard');
    await fetchAndRender(true);
  } catch (error) {
    console.warn('校验登录状态失败', error);
    handleLogout(true);
  } finally {
    setLoading(false);
  }
}

function bindEvents() {
  selectors.loginForm?.addEventListener('submit', handleLogin);

  selectors.refreshButton?.addEventListener('click', () => {
    fetchAndRender();
  });

  selectors.logoutButton?.addEventListener('click', () => {
    handleLogout(false);
    showStatus('已退出登录', 'success');
  });

  selectors.prevButton?.addEventListener('click', () => {
    if (state.loading || state.page <= 1) return;
    state.page = Math.max(1, state.page - 1);
    fetchAndRender();
  });

  selectors.nextButton?.addEventListener('click', () => {
    if (state.loading || state.totalPages <= 0 || state.page >= state.totalPages) return;
    state.page += 1;
    fetchAndRender();
  });

  selectors.pageSizeSelect?.addEventListener('change', (event) => {
    const value = Number.parseInt(event.target.value, 10);
    if (!Number.isNaN(value) && value > 0) {
      state.pageSize = value;
      state.page = 1;
      fetchAndRender(true);
    }
  });
}

bindEvents();
verifyExistingSession();
