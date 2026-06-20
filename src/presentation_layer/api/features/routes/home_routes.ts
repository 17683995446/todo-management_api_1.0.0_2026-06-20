import { Hono } from 'hono'
import type { Logger } from '../../../../core_layer/logic/logger.js'

/**
 * 创建首页 HTML 路由（SPA 入口）
 * 支持优先级、截止日期、标签、搜索、排序、筛选
 * @param logger - 日志记录器实例
 * @returns Hono 子路由
 */
export function createHomeRoutes(logger: Logger) {
  const router = new Hono()

  router.get('/', (c) => {
    logger.trace('GET / called', {}, 11, 'homeRoutes')

    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>待办事项管理</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; padding: 20px; }
    .container { max-width: 720px; margin: 0 auto; background: white; border-radius: 16px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); overflow: hidden; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; }
    .header h1 { font-size: 28px; margin-bottom: 8px; }
    .header p { opacity: 0.9; font-size: 14px; }
    .content { padding: 24px; }
    .auth-form { display: flex; flex-direction: column; gap: 12px; max-width: 350px; margin: 0 auto; }
    .auth-form input { padding: 12px 16px; border: 2px solid #e0e0e0; border-radius: 8px; font-size: 14px; transition: border-color 0.2s; }
    .auth-form input:focus { outline: none; border-color: #667eea; }
    .auth-form button { padding: 12px 24px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; transition: transform 0.2s; }
    .auth-form button:hover { transform: translateY(-1px); }
    .auth-toggle { text-align: center; margin-top: 15px; font-size: 13px; color: #666; }
    .auth-toggle a { color: #667eea; cursor: pointer; text-decoration: none; }
    .user-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
    .user-bar span { font-size: 14px; color: #666; }
    .btn-logout { background: #e0e0e0; color: #333; border: none; padding: 6px 16px; border-radius: 6px; font-size: 13px; cursor: pointer; }
    .btn-logout:hover { background: #d0d0d0; }
    .add-form { background: #f8f9fa; padding: 16px; border-radius: 10px; margin-bottom: 16px; display: flex; flex-direction: column; gap: 10px; }
    .add-form-row1 { display: flex; gap: 10px; }
    .add-form-row1 input[type="text"] { flex: 1; padding: 10px 14px; border: 2px solid #e0e0e0; border-radius: 8px; font-size: 14px; }
    .add-form-row1 input[type="text"]:focus { outline: none; border-color: #667eea; }
    .add-form-row2 { display: flex; gap: 10px; flex-wrap: wrap; }
    .add-form-row2 select, .add-form-row2 input { padding: 8px 12px; border: 2px solid #e0e0e0; border-radius: 6px; font-size: 13px; }
    .add-form-row2 input[type="date"] { min-width: 140px; }
    .add-form-row2 input[type="text"] { flex: 1; min-width: 120px; }
    .btn-add { padding: 10px 24px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; transition: transform 0.2s; align-self: flex-start; }
    .btn-add:hover { transform: translateY(-1px); }
    .filter-bar { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; align-items: center; }
    .filter-bar input, .filter-bar select { padding: 8px 12px; border: 2px solid #e0e0e0; border-radius: 6px; font-size: 13px; }
    .filter-bar input[type="search"] { flex: 1; min-width: 150px; }
    .todo-list { list-style: none; }
    .todo-item { display: flex; align-items: flex-start; gap: 10px; padding: 14px 16px; background: #f8f9fa; border-radius: 8px; margin-bottom: 8px; transition: background 0.2s; flex-wrap: wrap; }
    .todo-item:hover { background: #e9ecef; }
    .todo-item input[type="checkbox"] { width: 20px; height: 20px; cursor: pointer; margin-top: 2px; }
    .todo-main { flex: 1; min-width: 0; }
    .todo-title { font-size: 15px; color: #333; word-break: break-word; }
    .todo-title.completed { text-decoration: line-through; color: #999; }
    .todo-meta { display: flex; gap: 8px; margin-top: 6px; flex-wrap: wrap; align-items: center; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
    .badge-low { background: #e3f2fd; color: #1565c0; }
    .badge-medium { background: #fff3e0; color: #e65100; }
    .badge-high { background: #fce4ec; color: #c62828; }
    .badge-urgent { background: #ffebee; color: #b71c1c; border: 1px solid #ef9a9a; }
    .badge-due { background: #f3e5f5; color: #6a1b9a; }
    .badge-due.overdue { background: #ffebee; color: #b71c1c; }
    .badge-tag { background: #e8f5e9; color: #2e7d32; }
    .btn-delete { background: #f44336; color: white; border: none; padding: 6px 12px; border-radius: 6px; font-size: 12px; cursor: pointer; transition: background 0.2s; height: fit-content; }
    .btn-delete:hover { background: #d32f2f; }
    .btn-edit { background: #2196f3; color: white; border: none; padding: 6px 12px; border-radius: 6px; font-size: 12px; cursor: pointer; height: fit-content; }
    .btn-edit:hover { background: #1976d2; }
    .empty { text-align: center; color: #999; padding: 40px 20px; font-size: 14px; }
    .stats { margin-top: 16px; padding-top: 16px; border-top: 1px solid #e0e0e0; text-align: center; color: #666; font-size: 13px; display: flex; justify-content: center; gap: 20px; }
    .stats span { display: flex; gap: 4px; }
    .stats .num { font-weight: 700; color: #333; }
    .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: none; justify-content: center; align-items: center; z-index: 1000; }
    .modal-overlay.active { display: flex; }
    .modal { background: white; border-radius: 12px; padding: 24px; width: 90%; max-width: 420px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); }
    .modal h3 { margin-bottom: 16px; font-size: 18px; color: #333; }
    .modal-field { margin-bottom: 14px; }
    .modal-field label { display: block; font-size: 13px; color: #666; margin-bottom: 4px; }
    .modal-field input, .modal-field select { width: 100%; padding: 10px 14px; border: 2px solid #e0e0e0; border-radius: 8px; font-size: 14px; }
    .modal-field input:focus, .modal-field select:focus { outline: none; border-color: #667eea; }
    .modal-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px; }
    .modal-actions button { padding: 10px 20px; border: none; border-radius: 8px; font-size: 14px; cursor: pointer; }
    .btn-save { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; }
    .btn-cancel { background: #e0e0e0; color: #333; }
    .msg { position: fixed; top: 20px; right: 20px; padding: 12px 20px; background: #4caf50; color: white; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); display: none; z-index: 2000; }
    .msg.error { background: #f44336; }
    .hidden { display: none !important; }
    .loading-overlay { position: relative; min-height: 60px; opacity: 0.6; pointer-events: none; }
    .loading-overlay::after { content: '加载中...'; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: #667eea; font-size: 14px; font-weight: 600; }
    .btn-add:disabled, .btn-save:disabled, .btn-delete:disabled, .btn-edit:disabled, #authBtn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
    .field-error { color: #f44336; font-size: 12px; margin-top: 4px; display: none; }
    .field-error.visible { display: block; }
    .input-error { border-color: #f44336 !important; }
    .modal:focus-within { outline: 2px solid #667eea; }
    .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); border: 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📝 待办事项管理</h1>
      <p>优先级 · 截止日期 · 标签 · 搜索 · 排序</p>
    </div>
    <div class="content">
      <!-- 认证区域 -->
      <div id="authSection">
        <form class="auth-form" onsubmit="handleAuth(); return false;">
          <h2 id="authTitle" style="text-align:center;margin-bottom:10px;">登录</h2>
          <input type="text" id="usernameInput" placeholder="用户名" aria-label="用户名" autocomplete="username">
          <div class="field-error" id="usernameError"></div>
          <input type="password" id="passwordInput" placeholder="密码" aria-label="密码" autocomplete="current-password">
          <div class="field-error" id="passwordError"></div>
          <input type="text" id="displayNameInput" placeholder="显示名称（可选）" class="hidden" aria-label="显示名称（可选）">
          <button type="submit" id="authBtn">登录</button>
          <div class="auth-toggle">
            <span id="toggleText">还没有账号？</span>
            <a id="toggleLink" onclick="toggleAuthMode()" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();toggleAuthMode()}" tabindex="0" role="button">注册</a>
          </div>
        </form>
      </div>
      <!-- Todo 区域 -->
      <div id="todoSection" class="hidden">
        <div class="user-bar">
          <span id="welcomeText"></span>
          <button class="btn-logout" onclick="logout()">退出</button>
        </div>
        <!-- 添加表单 -->
        <form class="add-form" onsubmit="addTodo(event)">
          <div class="add-form-row1">
            <input type="text" id="todoInput" placeholder="添加新的待办事项..." autofocus aria-label="待办事项标题">
          </div>
          <div class="field-error" id="todoInputError"></div>
          <div class="add-form-row2">
            <select id="addPriority" aria-label="优先级">
              <option value="medium">中优先级</option>
              <option value="low">低优先级</option>
              <option value="high">高优先级</option>
              <option value="urgent">紧急</option>
            </select>
            <input type="date" id="addDueDate" aria-label="截止日期">
            <input type="text" id="addTags" placeholder="标签（逗号分隔）" aria-label="标签">
          </div>
          <button type="submit" class="btn-add">添加</button>
        </form>
        <!-- 筛选栏 -->
        <div class="filter-bar">
          <input type="search" id="searchInput" placeholder="搜索..." oninput="debouncedLoad()" aria-label="搜索待办事项">
          <select id="filterStatus" onchange="loadTodos()" aria-label="按状态筛选">
            <option value="">全部状态</option>
            <option value="pending">待办</option>
            <option value="completed">已完成</option>
          </select>
          <select id="filterPriority" onchange="loadTodos()" aria-label="按优先级筛选">
            <option value="">全部优先级</option>
            <option value="low">低</option>
            <option value="medium">中</option>
            <option value="high">高</option>
            <option value="urgent">紧急</option>
          </select>
          <select id="filterTag" onchange="loadTodos()" aria-label="按标签筛选">
            <option value="">全部标签</option>
          </select>
          <select id="sortBy" onchange="loadTodos()" aria-label="排序字段">
            <option value="createdAt">创建时间</option>
            <option value="updatedAt">更新时间</option>
            <option value="dueDate">截止日期</option>
            <option value="priority">优先级</option>
            <option value="title">标题</option>
          </select>
          <select id="sortOrder" onchange="loadTodos()" aria-label="排序方向">
            <option value="asc">升序</option>
            <option value="desc">降序</option>
          </select>
        </div>
        <ul class="todo-list" id="todoList" aria-label="待办事项列表"></ul>
        <div class="stats" id="statsText" aria-live="polite"></div>
      </div>
    </div>
  </div>
  <!-- 编辑弹窗 -->
  <div class="modal-overlay" id="editModal" role="dialog" aria-modal="true" aria-labelledby="editModalTitle">
    <div class="modal">
      <h3 id="editModalTitle">编辑待办事项</h3>
      <div class="modal-field">
        <label for="editTitle">标题</label>
        <input type="text" id="editTitle" aria-label="标题">
        <div class="field-error" id="editTitleError"></div>
      </div>
      <div class="modal-field">
        <label for="editPriority">优先级</label>
        <select id="editPriority" aria-label="优先级">
          <option value="low">低</option>
          <option value="medium">中</option>
          <option value="high">高</option>
          <option value="urgent">紧急</option>
        </select>
      </div>
      <div class="modal-field">
        <label for="editDueDate">截止日期</label>
        <input type="date" id="editDueDate" aria-label="截止日期">
      </div>
      <div class="modal-field">
        <label for="editTags">标签（逗号分隔）</label>
        <input type="text" id="editTags" aria-label="标签（逗号分隔）">
      </div>
      <div class="modal-actions">
        <button class="btn-cancel" onclick="closeEditModal()">取消</button>
        <button class="btn-save" onclick="saveEdit()">保存</button>
      </div>
    </div>
  </div>
  <div id="msg" class="msg"></div>
  <script>
    let isRegisterMode = false;
    let token = localStorage.getItem('token');
    let allTags = new Set();
    let editingId = null;
    let debounceTimer = null;

    function getToken() { return localStorage.getItem('token'); }
    function showMsg(text, isError) {
      const msg = document.getElementById('msg');
      msg.textContent = text;
      msg.className = 'msg' + (isError ? ' error' : '');
      msg.style.display = 'block';
      setTimeout(() => { msg.style.display = 'none'; }, 3000);
    }
    // 加载状态管理：防止重复提交，提供视觉反馈
    let isLoading = false;
    function setLoading(loading) {
      isLoading = loading;
      const list = document.getElementById('todoList');
      if (loading) { list.classList.add('loading-overlay'); }
      else { list.classList.remove('loading-overlay'); }
    }
    // 表单校验：统一显示/清除字段级错误
    function showFieldError(inputId, errorId, message) {
      const input = document.getElementById(inputId);
      const err = document.getElementById(errorId);
      if (input) input.classList.add('input-error');
      if (err) { err.textContent = message; err.classList.add('visible'); }
    }
    function clearFieldError(inputId, errorId) {
      const input = document.getElementById(inputId);
      const err = document.getElementById(errorId);
      if (input) input.classList.remove('input-error');
      if (err) { err.textContent = ''; err.classList.remove('visible'); }
    }
    function clearAllAuthErrors() {
      clearFieldError('usernameInput', 'usernameError');
      clearFieldError('passwordInput', 'passwordError');
    }
    function toggleAuthMode() {
      isRegisterMode = !isRegisterMode;
      document.getElementById('authTitle').textContent = isRegisterMode ? '注册' : '登录';
      document.getElementById('authBtn').textContent = isRegisterMode ? '注册' : '登录';
      document.getElementById('toggleText').textContent = isRegisterMode ? '已有账号？' : '还没有账号？';
      document.getElementById('toggleLink').textContent = isRegisterMode ? '登录' : '注册';
      document.getElementById('displayNameInput').classList.toggle('hidden', !isRegisterMode);
      clearAllAuthErrors();
    }
    async function handleAuth() {
      if (isLoading) return;
      clearAllAuthErrors();
      const username = document.getElementById('usernameInput').value.trim();
      const password = document.getElementById('passwordInput').value;
      const displayName = document.getElementById('displayNameInput').value.trim();
      let hasError = false;
      if (!username) { showFieldError('usernameInput', 'usernameError', '请输入用户名'); hasError = true; }
      if (!password) { showFieldError('passwordInput', 'passwordError', '请输入密码'); hasError = true; }
      if (hasError) return;
      const btn = document.getElementById('authBtn');
      btn.disabled = true;
      btn.textContent = '处理中...';
      const endpoint = isRegisterMode ? '/api/auth/register' : '/api/auth/login';
      const body = isRegisterMode ? { username, password, displayName: displayName || undefined } : { username, password };
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        const data = await res.json();
        if (res.ok && data.success) {
          localStorage.setItem('token', data.data.token);
          localStorage.setItem('username', data.data.user.username);
          localStorage.setItem('displayName', data.data.user.displayName);
          token = data.data.token;
          showTodoSection();
          loadTodos();
        } else {
          showMsg(data.error || '操作失败', true);
        }
      } catch(err) { showMsg('网络错误', true); }
      finally {
        btn.disabled = false;
        btn.textContent = isRegisterMode ? '注册' : '登录';
      }
    }
    function logout() {
      localStorage.removeItem('token');
      localStorage.removeItem('username');
      localStorage.removeItem('displayName');
      token = null;
      showAuthSection();
    }
    function showAuthSection() {
      document.getElementById('authSection').classList.remove('hidden');
      document.getElementById('todoSection').classList.add('hidden');
    }
    function showTodoSection() {
      document.getElementById('authSection').classList.add('hidden');
      document.getElementById('todoSection').classList.remove('hidden');
      const displayName = localStorage.getItem('displayName') || localStorage.getItem('username');
      document.getElementById('welcomeText').textContent = '欢迎，' + displayName + '！';
    }
    function buildQueryString() {
      const params = new URLSearchParams();
      const search = document.getElementById('searchInput').value.trim();
      const status = document.getElementById('filterStatus').value;
      const priority = document.getElementById('filterPriority').value;
      const tag = document.getElementById('filterTag').value;
      const sort = document.getElementById('sortBy').value;
      const order = document.getElementById('sortOrder').value;
      if (search) params.set('search', search);
      if (status) params.set('status', status);
      if (priority) params.set('priority', priority);
      if (tag) params.set('tag', tag);
      if (sort) params.set('sort', sort);
      if (order) params.set('order', order);
      params.set('limit', '200');
      const qs = params.toString();
      return qs ? '?' + qs : '';
    }
    function debouncedLoad() {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(loadTodos, 300);
    }
    async function loadTodos() {
      if (isLoading) return;
      setLoading(true);
      try {
        const qs = buildQueryString();
        const res = await fetch('/api/todos' + qs, {
          headers: { 'Authorization': 'Bearer ' + getToken() }
        });
        if (res.status === 401) { logout(); return; }
        const data = await res.json();
        if (data.success) {
          renderTodos(data.data);
          updateStats(data.data, data.total);
          updateTagFilter(data.data);
        }
      } catch(err) { showMsg('加载失败', true); }
      finally { setLoading(false); }
    }
    function updateTagFilter(todos) {
      const newTags = new Set();
      todos.forEach(t => { if (t.tags) t.tags.forEach(tag => newTags.add(tag)); });
      allTags = newTags;
      const select = document.getElementById('filterTag');
      const currentVal = select.value;
      select.innerHTML = '<option value="">全部标签</option>';
      Array.from(newTags).sort().forEach(tag => {
        const opt = document.createElement('option');
        opt.value = tag;
        opt.textContent = tag;
        select.appendChild(opt);
      });
      select.value = currentVal;
    }
    function priorityBadgeClass(p) { return 'badge badge-' + (p || 'medium'); }
    function priorityLabel(p) {
      const m = { low: '低', medium: '中', high: '高', urgent: '紧急' };
      return m[p] || '中';
    }
    function formatDate(d) {
      if (!d) return '';
      const date = new Date(d);
      return (date.getMonth()+1) + '/' + date.getDate();
    }
    function isOverdue(d) {
      if (!d) return false;
      return new Date(d) < new Date(new Date().toDateString());
    }
    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }
    function renderTodos(todos) {
      const list = document.getElementById('todoList');
      if (todos.length === 0) {
        list.innerHTML = '<li class="empty">暂无待办事项，快来添加一个吧！</li>';
        return;
      }
      list.innerHTML = todos.map(t => {
        let meta = '<div class="todo-meta">';
        meta += '<span class="' + priorityBadgeClass(t.priority) + '">' + priorityLabel(t.priority) + '</span>';
        if (t.dueDate) {
          const od = isOverdue(t.dueDate) && !t.completed ? ' overdue' : '';
          meta += '<span class="badge badge-due' + od + '">📅 ' + formatDate(t.dueDate) + '</span>';
        }
        if (t.tags && t.tags.length > 0) {
          t.tags.forEach(tag => {
            meta += '<span class="badge badge-tag">#' + escapeHtml(tag) + '</span>';
          });
        }
        meta += '</div>';
        return '<li class="todo-item">' +
          '<input type="checkbox" ' + (t.completed ? 'checked' : '') +
          ' onchange="toggleTodo(\\'' + t.id + '\\', this.checked)">' +
          '<div class="todo-main">' +
          '<span class="todo-title ' + (t.completed ? 'completed' : '') + '">' + escapeHtml(t.title) + '</span>' +
          meta +
          '</div>' +
          '<button onclick="openEditModal(\\'' + t.id + '\\')" class="btn-edit">编辑</button>' +
          '<button onclick="deleteTodo(\\'' + t.id + '\\')" class="btn-delete">删除</button>' +
          '</li>';
      }).join('');
    }
    function updateStats(todos, total) {
      const completed = todos.filter(t => t.completed).length;
      const pending = todos.length - completed;
      document.getElementById('statsText').innerHTML =
        '<span>共 <span class="num">' + total + '</span> 项</span>' +
        '<span>已完成 <span class="num">' + completed + '</span></span>' +
        '<span>待办 <span class="num">' + pending + '</span></span>';
    }
    function parseTags(text) {
      if (!text || !text.trim()) return [];
      return Array.from(new Set(text.split(',').map(t => t.trim()).filter(t => t.length > 0 && t.length <= 50))).slice(0, 20);
    }
    async function addTodo(e) {
      e.preventDefault();
      if (isLoading) return;
      clearFieldError('todoInput', 'todoInputError');
      const input = document.getElementById('todoInput');
      const title = input.value.trim();
      if (!title) { showFieldError('todoInput', 'todoInputError', '标题不能为空'); input.focus(); return; }
      const priority = document.getElementById('addPriority').value;
      const dueDate = document.getElementById('addDueDate').value;
      const tags = parseTags(document.getElementById('addTags').value);
      const body = { title, priority, tags };
      if (dueDate) body.dueDate = new Date(dueDate).toISOString();
      const btn = document.querySelector('.btn-add');
      btn.disabled = true;
      try {
        const res = await fetch('/api/todos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() },
          body: JSON.stringify(body)
        });
        if (res.ok) {
          input.value = '';
          document.getElementById('addDueDate').value = '';
          document.getElementById('addTags').value = '';
          loadTodos();
        } else if (res.status === 401) { logout(); }
        else { const d = await res.json(); showMsg(d.error || '添加失败', true); }
      } catch(err) { showMsg('网络错误', true); }
      finally { btn.disabled = false; }
    }
    async function toggleTodo(id, completed) {
      if (isLoading) return;
      try {
        const res = await fetch('/api/todos/' + id, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() },
          body: JSON.stringify({ completed })
        });
        if (res.ok) loadTodos();
        else if (res.status === 401) { logout(); }
        else showMsg('更新失败', true);
      } catch(err) { showMsg('网络错误', true); }
    }
    async function deleteTodo(id) {
      if (isLoading) return;
      if (!confirm('确定删除这个待办事项吗？')) return;
      try {
        const res = await fetch('/api/todos/' + id, {
          method: 'DELETE',
          headers: { 'Authorization': 'Bearer ' + getToken() }
        });
        if (res.ok || res.status === 204) loadTodos();
        else if (res.status === 401) { logout(); }
        else showMsg('删除失败', true);
      } catch(err) { showMsg('网络错误', true); }
    }
    let todoCache = [];
    let lastFocusedElement = null;
    async function openEditModal(id) {
      if (isLoading) return;
      // 从当前列表获取数据
      try {
        const res = await fetch('/api/todos', {
          headers: { 'Authorization': 'Bearer ' + getToken() }
        });
        if (res.status === 401) { logout(); return; }
        const data = await res.json();
        if (data.success) {
          const todo = data.data.find(t => t.id === id);
          if (!todo) { showMsg('未找到待办事项', true); return; }
          editingId = id;
          clearFieldError('editTitle', 'editTitleError');
          document.getElementById('editTitle').value = todo.title;
          document.getElementById('editPriority').value = todo.priority || 'medium';
          if (todo.dueDate) {
            const d = new Date(todo.dueDate);
            document.getElementById('editDueDate').value = d.toISOString().split('T')[0];
          } else {
            document.getElementById('editDueDate').value = '';
          }
          document.getElementById('editTags').value = (todo.tags || []).join(', ');
          // 焦点管理：记录当前焦点，打开弹窗后聚焦标题输入框
          lastFocusedElement = document.activeElement;
          document.getElementById('editModal').classList.add('active');
          document.getElementById('editTitle').focus();
        }
      } catch(err) { showMsg('网络错误', true); }
    }
    function closeEditModal() {
      editingId = null;
      clearFieldError('editTitle', 'editTitleError');
      document.getElementById('editModal').classList.remove('active');
      // 焦点管理：关闭弹窗后恢复焦点
      if (lastFocusedElement) { lastFocusedElement.focus(); lastFocusedElement = null; }
    }
    async function saveEdit() {
      if (!editingId || isLoading) return;
      clearFieldError('editTitle', 'editTitleError');
      const titleInput = document.getElementById('editTitle');
      const title = titleInput.value.trim();
      if (!title) { showFieldError('editTitle', 'editTitleError', '标题不能为空'); titleInput.focus(); return; }
      const priority = document.getElementById('editPriority').value;
      const dueDateVal = document.getElementById('editDueDate').value;
      const tags = parseTags(document.getElementById('editTags').value);
      const body = { title, priority, tags };
      body.dueDate = dueDateVal ? new Date(dueDateVal).toISOString() : null;
      const btn = document.querySelector('.btn-save');
      btn.disabled = true;
      try {
        const res = await fetch('/api/todos/' + editingId, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() },
          body: JSON.stringify(body)
        });
        if (res.ok) { closeEditModal(); loadTodos(); }
        else if (res.status === 401) { logout(); }
        else { const d = await res.json(); showMsg(d.error || '保存失败', true); }
      } catch(err) { showMsg('网络错误', true); }
      finally { btn.disabled = false; }
    }
    // 点击遮罩关闭弹窗
    document.getElementById('editModal').addEventListener('click', function(e) {
      if (e.target === this) closeEditModal();
    });
    // 键盘可访问性：Escape 关闭编辑弹窗
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && document.getElementById('editModal').classList.contains('active')) {
        closeEditModal();
      }
    });
    // 初始化：检查 token
    if (token) { showTodoSection(); loadTodos(); }
    else { showAuthSection(); }
  </script>
</body>
</html>`

    logger.trace('GET / returning SPA', {}, 290, 'homeRoutes')
    return c.html(html)
  })

  return router
}
