/* ═══════════════════════════════════════════════
   EYPH — Earn Your Phase
   script.js — Single APP object architecture
   Sections: STATE · PERSISTENCE · UTILS · RENDER · EVENTS · CRUD · INIT
═══════════════════════════════════════════════ */

const APP = (() => {
  'use strict';

  /* ══════════════════════════════════════════════
     STATE
  ══════════════════════════════════════════════ */
  const STORAGE_KEY = 'eyph_v1';

  let state = {
    okrs: [],
    focusKpiId: null
  };

  /* ══════════════════════════════════════════════
     PERSISTENCE
  ══════════════════════════════════════════════ */
  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('EYPH: localStorage write failed.', e);
    }
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        state.okrs = Array.isArray(parsed.okrs) ? parsed.okrs : [];
        state.focusKpiId = parsed.focusKpiId || null;
      }
    } catch (e) {
      console.warn('EYPH: localStorage read failed, starting fresh.', e);
    }
  }

  /* ══════════════════════════════════════════════
     UTILS
  ══════════════════════════════════════════════ */

  /** Generate a simple unique ID */
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  /** Calculate days until deadline (negative = overdue) */
  function daysUntil(dateStr) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(dateStr + 'T00:00:00');
    return Math.round((target - today) / 86400000);
  }

  /** Return urgency class string based on days */
  function urgencyClass(days) {
    if (days < 0)  return 'overdue';
    if (days <= 3) return 'warning';
    return 'neutral';
  }

  /** Return urgency label text */
  function urgencyLabel(days) {
    if (days < 0)  return `${Math.abs(days)}D OVERDUE`;
    if (days === 0) return 'DUE TODAY';
    if (days <= 3) return `${days}D LEFT`;
    return `${days} DAYS LEFT`;
  }

  /** Find KPI by id across all OKRs, returns { okr, kpi } or null */
  function findKpi(kpiId) {
    for (const okr of state.okrs) {
      const kpi = okr.kpis.find(k => k.id === kpiId);
      if (kpi) return { okr, kpi };
    }
    return null;
  }

  /** Compute KPI progress percentage (0–100) */
  function kpiPercent(kpi) {
    if (kpi.type === 'hours') {
      if (!kpi.target || kpi.target <= 0) return 0;
      return Math.min(100, Math.round((kpi.progress / kpi.target) * 100));
    }
    if (kpi.type === 'tasks') {
      const total = kpi.tasks.length;
      if (!total) return 0;
      const done = kpi.tasks.filter(t => t.done).length;
      return Math.round((done / total) * 100);
    }
    return 0;
  }

  /** KPI progress detail string */
  function kpiDetail(kpi) {
    if (kpi.type === 'hours') return `${kpi.progress}h / ${kpi.target}h`;
    const done = kpi.tasks.filter(t => t.done).length;
    return `${done} / ${kpi.tasks.length} tasks`;
  }

  /* ══════════════════════════════════════════════
     CLOCK
  ══════════════════════════════════════════════ */
  function initClock() {
    const el = document.getElementById('clock');
    function tick() {
      const now = new Date();
      const h = String(now.getHours()).padStart(2, '0');
      const m = String(now.getMinutes()).padStart(2, '0');
      const s = String(now.getSeconds()).padStart(2, '0');
      el.textContent = `${h}:${m}:${s}`;
    }
    tick();
    setInterval(tick, 1000);
  }

  /* ══════════════════════════════════════════════
     RENDER — SIDEBAR
  ══════════════════════════════════════════════ */
  function renderSidebar() {
    const list = document.getElementById('okr-list');

    if (state.okrs.length === 0) {
      list.innerHTML = `<div class="sidebar-empty">No OKRs yet.<br/>Click "+ OKR" to begin.</div>`;
      return;
    }

    list.innerHTML = state.okrs.map(okr => {
      const days  = daysUntil(okr.deadline);
      const uCls  = urgencyClass(days);
      const uLbl  = urgencyLabel(days);

      const kpiRows = okr.kpis.map(kpi => {
        const isActive = kpi.id === state.focusKpiId;
        const pct      = kpiPercent(kpi);
        const detail   = kpiDetail(kpi);
        return `
          <div class="kpi-row ${isActive ? 'active' : ''}"
               role="listitem"
               data-kpi-id="${kpi.id}"
               aria-label="KPI: ${escHtml(kpi.title)}, ${detail}${isActive ? ', active focus' : ''}">
            <div class="kpi-info">
              <div class="kpi-name">${escHtml(kpi.title)}</div>
              <div class="kpi-summary">${pct}% — ${detail}</div>
            </div>
            <button class="btn-icon" data-action="delete-kpi" data-kpi-id="${kpi.id}" data-okr-id="${okr.id}" aria-label="Delete KPI ${escHtml(kpi.title)}" title="Delete KPI">✕</button>
          </div>`;
      }).join('');

      return `
        <div class="okr-item" role="listitem" data-okr-id="${okr.id}">
          <div class="okr-row">
            <div class="okr-info">
              <div class="okr-title" title="${escHtml(okr.title)}">${escHtml(okr.title)}</div>
              <div class="okr-deadline ${uCls}">${formatDate(okr.deadline)} · ${uLbl}</div>
            </div>
            <button class="btn-icon" data-action="delete-okr" data-okr-id="${okr.id}" aria-label="Delete OKR ${escHtml(okr.title)}" title="Delete OKR">✕</button>
          </div>
          <div class="kpi-list">${kpiRows}</div>
        </div>`;
    }).join('');
  }

  /** Format YYYY-MM-DD to short readable */
  function formatDate(d) {
    if (!d) return '';
    const [y, m, day] = d.split('-');
    const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    return `${day} ${months[parseInt(m, 10) - 1]} ${y}`;
  }

  /** Escape HTML special chars */
  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /* ══════════════════════════════════════════════
     RENDER — FOCUS PANEL
  ══════════════════════════════════════════════ */
  function renderFocusPanel() {
    const panel = document.getElementById('focus-panel');

    if (!state.focusKpiId) {
      panel.innerHTML = `
        <div class="focus-empty">
          <div class="focus-empty-label">NO TARGET LOCKED</div>
          <div class="focus-empty-sub">Select a KPI to begin execution.</div>
        </div>`;
      return;
    }

    const found = findKpi(state.focusKpiId);
    if (!found) {
      // Focus KPI was deleted; clear gracefully
      state.focusKpiId = null;
      saveState();
      renderFocusPanel();
      return;
    }

    const { okr, kpi } = found;
    const days = daysUntil(okr.deadline);
    const uCls = urgencyClass(days);
    const pct  = kpiPercent(kpi);

    let actionHtml;
    if (kpi.type === 'hours') {
      actionHtml = `
        <div class="focus-action">
          <div class="action-header">
            <span class="action-label">LOG HOURS</span>
          </div>
          <div class="hours-form">
            <input type="number" class="hours-input" id="log-hours-input"
                   placeholder="0.0" min="0.1" step="0.5" max="24"
                   aria-label="Hours to log" />
            <button class="btn btn-accent" id="btn-log-hours">LOG HOURS</button>
          </div>
        </div>`;
    } else {
      const taskItems = kpi.tasks.length
        ? kpi.tasks.map(t => `
            <div class="task-item ${t.done ? 'done' : ''}" data-task-id="${t.id}" role="listitem">
              <div class="task-checkbox" data-action="toggle-task" data-task-id="${t.id}" role="checkbox"
                   aria-checked="${t.done}" aria-label="Toggle task: ${escHtml(t.title)}" tabindex="0">
                ${t.done ? '✓' : ''}
              </div>
              <span class="task-title" data-action="toggle-task" data-task-id="${t.id}">${escHtml(t.title)}</span>
              <button class="btn-icon" data-action="delete-task" data-task-id="${t.id}" aria-label="Delete task">✕</button>
            </div>`).join('')
        : `<div class="tasks-empty">No tasks yet. Add one above.</div>`;

      actionHtml = `
        <div class="focus-action">
          <div class="action-header">
            <span class="action-label">TASKS</span>
            <button class="btn btn-ghost btn-sm" id="btn-open-task-modal">+ TASK</button>
          </div>
          <div class="task-list" id="task-list" role="list">${taskItems}</div>
        </div>`;
    }

    panel.innerHTML = `
      <div class="focus-content">
        <div class="focus-meta">
          <span class="meta-tag" id="focus-okr">OKR:${escHtml(okr.title)}</span>
          <span class="urgency-tag ${uCls}" id="focus-urgency">${urgencyLabel(days)}</span>
        </div>
        <h1 class="focus-title">${escHtml(kpi.title)}</h1>
        <div class="focus-progress">
          <div class="progress-stats">
            <span class="progress-pct">${pct}%</span>
            <span class="progress-detail">${kpiDetail(kpi)}</span>
          </div>
          <div class="progress-bar-wrap" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
            <div class="progress-bar-fill" style="width: ${pct}%"></div>
          </div>
        </div>
        ${actionHtml}
      </div>`;
  }

  /* ══════════════════════════════════════════════
     RENDER — MASTER (sidebar + focus)
  ══════════════════════════════════════════════ */
  function render() {
    renderSidebar();
    renderFocusPanel();
  }

  /* ══════════════════════════════════════════════
     MODAL SYSTEM
  ══════════════════════════════════════════════ */
  function openModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.removeAttribute('hidden');
    // Focus first focusable element
    const first = el.querySelector('input, select, button:not(.modal-close)');
    if (first) setTimeout(() => first.focus(), 50);
  }

  function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.setAttribute('hidden', '');
    clearFormErrors();
  }

  function closeAllModals() {
    document.querySelectorAll('.modal-overlay').forEach(m => m.setAttribute('hidden', ''));
    clearFormErrors();
  }

  function clearFormErrors() {
    document.querySelectorAll('.form-error').forEach(e => e.textContent = '');
    document.querySelectorAll('.form-input').forEach(i => i.classList.remove('has-error'));
  }

  function showError(inputId, errorId, msg) {
    const input = document.getElementById(inputId);
    const error = document.getElementById(errorId);
    if (input) input.classList.add('has-error');
    if (error) error.textContent = msg;
  }

  /* ══════════════════════════════════════════════
     POPULATE MODALS
  ══════════════════════════════════════════════ */

  /** Populate OKR <select> inside KPI modal */
  function populateOkrSelect() {
    const sel = document.getElementById('kpi-okr');
    sel.innerHTML = '<option value="">— Select OKR —</option>';
    state.okrs.forEach(okr => {
      const opt = document.createElement('option');
      opt.value = okr.id;
      opt.textContent = okr.title;
      sel.appendChild(opt);
    });
  }

  /** Populate focus selection modal */
  function populateFocusModal() {
    const list = document.getElementById('focus-list');
    const allKpis = [];
    state.okrs.forEach(okr => {
      okr.kpis.forEach(kpi => {
        allKpis.push({ okr, kpi });
      });
    });

    if (allKpis.length === 0) {
      list.innerHTML = `<div class="focus-list-empty">No KPIs available. Create one first.</div>`;
      return;
    }

    list.innerHTML = allKpis.map(({ okr, kpi }) => `
      <div class="focus-select-item ${kpi.id === state.focusKpiId ? 'selected' : ''}"
           data-action="set-focus" data-kpi-id="${kpi.id}" role="listitem"
           tabindex="0" aria-label="Select focus: ${escHtml(kpi.title)}">
        <div class="focus-select-kpi">${escHtml(kpi.title)}</div>
        <div class="focus-select-okr">${escHtml(okr.title)}</div>
      </div>`).join('');
  }

  /* ══════════════════════════════════════════════
     CRUD — OKR
  ══════════════════════════════════════════════ */
  function createOkr(title, deadline) {
    state.okrs.push({
      id: uid(),
      title: title.trim(),
      deadline,
      kpis: []
    });
    saveState();
    render();
  }

  function deleteOkr(okrId) {
    // If active focus belongs to this OKR, clear it
    const okr = state.okrs.find(o => o.id === okrId);
    if (okr && okr.kpis.some(k => k.id === state.focusKpiId)) {
      state.focusKpiId = null;
    }
    state.okrs = state.okrs.filter(o => o.id !== okrId);
    saveState();
    render();
  }

  /* ══════════════════════════════════════════════
     CRUD — KPI
  ══════════════════════════════════════════════ */
  function createKpi(okrId, title, type, target) {
    const okr = state.okrs.find(o => o.id === okrId);
    if (!okr) return;
    const kpi = {
      id: uid(),
      title: title.trim(),
      type,
      progress: 0,
      target: type === 'hours' ? Number(target) : 0,
      tasks: []
    };
    okr.kpis.push(kpi);
    // Auto-focus if no focus set
    if (!state.focusKpiId) state.focusKpiId = kpi.id;
    saveState();
    render();
  }

  function deleteKpi(okrId, kpiId) {
    const okr = state.okrs.find(o => o.id === okrId);
    if (!okr) return;
    if (kpiId === state.focusKpiId) state.focusKpiId = null;
    okr.kpis = okr.kpis.filter(k => k.id !== kpiId);
    saveState();
    render();
  }

  /* ══════════════════════════════════════════════
     CRUD — HOURS
  ══════════════════════════════════════════════ */
  function logHours(hours) {
    const found = findKpi(state.focusKpiId);
    if (!found) return;
    found.kpi.progress = Math.round((found.kpi.progress + hours) * 100) / 100;
    saveState();
    render();
  }

  /* ══════════════════════════════════════════════
     CRUD — TASKS
  ══════════════════════════════════════════════ */
  function addTask(title) {
    const found = findKpi(state.focusKpiId);
    if (!found || found.kpi.type !== 'tasks') return;
    found.kpi.tasks.push({ id: uid(), title: title.trim(), done: false });
    saveState();
    render();
  }

  function toggleTask(taskId) {
    const found = findKpi(state.focusKpiId);
    if (!found) return;
    const task = found.kpi.tasks.find(t => t.id === taskId);
    if (task) {
      task.done = !task.done;
      // Update progress count
      found.kpi.progress = found.kpi.tasks.filter(t => t.done).length;
      saveState();
      render();
    }
  }

  function deleteTask(taskId) {
    const found = findKpi(state.focusKpiId);
    if (!found) return;
    found.kpi.tasks = found.kpi.tasks.filter(t => t.id !== taskId);
    found.kpi.progress = found.kpi.tasks.filter(t => t.done).length;
    saveState();
    render();
  }

  /* ══════════════════════════════════════════════
     FOCUS
  ══════════════════════════════════════════════ */
  function setFocus(kpiId) {
    state.focusKpiId = kpiId;
    saveState();
    render();
  }

  /* ══════════════════════════════════════════════
     CONFIRM DIALOG
  ══════════════════════════════════════════════ */
  let _confirmCallback = null;

  function showConfirm(message, onConfirm) {
    document.getElementById('confirm-message').textContent = message;
    _confirmCallback = onConfirm;
    openModal('modal-confirm');
  }

  /* ══════════════════════════════════════════════
     FORM HANDLERS
  ══════════════════════════════════════════════ */
  function handleOkrSubmit(e) {
    e.preventDefault();
    clearFormErrors();
    const title    = document.getElementById('okr-title').value.trim();
    const deadline = document.getElementById('okr-deadline').value;
    let valid = true;

    if (!title) {
      showError('okr-title', 'okr-title-error', 'Title is required.');
      valid = false;
    }
    if (!deadline) {
      showError('okr-deadline', 'okr-deadline-error', 'Deadline is required.');
      valid = false;
    }
    if (!valid) return;

    createOkr(title, deadline);
    document.getElementById('form-okr').reset();
    closeModal('modal-okr');
  }

  function handleKpiSubmit(e) {
    e.preventDefault();
    clearFormErrors();
    const okrId  = document.getElementById('kpi-okr').value;
    const title  = document.getElementById('kpi-title').value.trim();
    const type   = document.getElementById('kpi-type').value;
    const target = document.getElementById('kpi-target').value;
    let valid = true;

    if (!okrId) {
      showError('kpi-okr', 'kpi-okr-error', 'Select an OKR.');
      valid = false;
    }
    if (!title) {
      showError('kpi-title', 'kpi-title-error', 'KPI title is required.');
      valid = false;
    }
    if (type === 'hours') {
      if (!target || Number(target) <= 0) {
        showError('kpi-target', 'kpi-target-error', 'Enter a positive target hours value.');
        valid = false;
      }
    }
    if (!valid) return;

    createKpi(okrId, title, type, target);
    document.getElementById('form-kpi').reset();
    document.getElementById('kpi-type').value = 'hours';
    document.querySelectorAll('.type-btn').forEach(b => b.classList.toggle('active', b.dataset.type === 'hours'));
    document.getElementById('kpi-target-group').style.display = '';
    closeModal('modal-kpi');
  }

  function handleTaskSubmit(e) {
    e.preventDefault();
    clearFormErrors();
    const title = document.getElementById('task-title').value.trim();
    if (!title) {
      showError('task-title', 'task-title-error', 'Task description is required.');
      return;
    }
    addTask(title);
    document.getElementById('form-task').reset();
    closeModal('modal-task');
  }

  /* ══════════════════════════════════════════════
     EVENT DELEGATION
  ══════════════════════════════════════════════ */
  function initEvents() {

    // ── Header buttons ──
    document.getElementById('btn-open-okr-modal').addEventListener('click', () => {
      clearFormErrors();
      document.getElementById('form-okr').reset();
      openModal('modal-okr');
    });

    document.getElementById('btn-open-kpi-modal').addEventListener('click', () => {
      if (state.okrs.length === 0) {
        alert('Create at least one OKR first.');
        return;
      }
      populateOkrSelect();
      clearFormErrors();
      document.getElementById('form-kpi').reset();
      document.getElementById('kpi-type').value = 'hours';
      document.querySelectorAll('.type-btn').forEach(b => b.classList.toggle('active', b.dataset.type === 'hours'));
      document.getElementById('kpi-target-group').style.display = '';
      openModal('modal-kpi');
    });

    document.getElementById('btn-open-focus-modal').addEventListener('click', () => {
      populateFocusModal();
      openModal('modal-focus');
    });

    // ── Form submissions ──
    document.getElementById('form-okr').addEventListener('submit', handleOkrSubmit);
    document.getElementById('form-kpi').addEventListener('submit', handleKpiSubmit);
    document.getElementById('form-task').addEventListener('submit', handleTaskSubmit);

    // ── KPI type toggle ──
    document.querySelector('.type-toggle').addEventListener('click', e => {
      const btn = e.target.closest('.type-btn');
      if (!btn) return;
      const type = btn.dataset.type;
      document.getElementById('kpi-type').value = type;
      document.querySelectorAll('.type-btn').forEach(b => b.classList.toggle('active', b === btn));
      const targetGroup = document.getElementById('kpi-target-group');
      targetGroup.style.display = type === 'hours' ? '' : 'none';
    });

    // ── Modal close buttons (data-close) ──
    document.body.addEventListener('click', e => {
      const btn = e.target.closest('[data-close]');
      if (btn) closeModal(btn.dataset.close);
    });

    // ── Modal overlay click to close ──
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', e => {
        if (e.target === overlay) closeModal(overlay.id);
      });
    });

    // ── ESC key ──
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeAllModals();
    });

    // ── Confirm delete ──
    document.getElementById('btn-confirm-delete').addEventListener('click', () => {
      if (typeof _confirmCallback === 'function') {
        _confirmCallback();
        _confirmCallback = null;
      }
      closeModal('modal-confirm');
    });

    // ── Sidebar delegation: KPI click to focus + delete buttons ──
    document.getElementById('okr-list').addEventListener('click', e => {
      // Delete OKR
      const delOkrBtn = e.target.closest('[data-action="delete-okr"]');
      if (delOkrBtn) {
        const okrId = delOkrBtn.dataset.okrId;
        const okr   = state.okrs.find(o => o.id === okrId);
        if (!okr) return;
        showConfirm(`Delete OKR "${okr.title}"? All KPIs will be removed.`, () => deleteOkr(okrId));
        return;
      }

      // Delete KPI
      const delKpiBtn = e.target.closest('[data-action="delete-kpi"]');
      if (delKpiBtn) {
        const { kpiId, okrId } = delKpiBtn.dataset;
        const found = findKpi(kpiId);
        if (!found) return;
        showConfirm(`Delete KPI "${found.kpi.title}"?`, () => deleteKpi(okrId, kpiId));
        return;
      }

      // Set focus via KPI row click (not on delete button)
      const kpiRow = e.target.closest('.kpi-row');
      if (kpiRow && !e.target.closest('.btn-icon')) {
        setFocus(kpiRow.dataset.kpiId);
      }
    });

    // ── Focus panel delegation ──
    document.getElementById('focus-panel').addEventListener('click', e => {
      // Log hours
      if (e.target.id === 'btn-log-hours') {
        const input = document.getElementById('log-hours-input');
        const val   = parseFloat(input.value);
        if (!val || val <= 0) {
          input.focus();
          input.style.borderColor = 'var(--accent)';
          setTimeout(() => input.style.borderColor = '', 1000);
          return;
        }
        logHours(val);
        input.value = '';
        input.focus();
        return;
      }

      // Log hours on Enter key handled separately
      // Open task modal
      if (e.target.id === 'btn-open-task-modal') {
        clearFormErrors();
        document.getElementById('form-task').reset();
        openModal('modal-task');
        return;
      }

      // Toggle task
      const toggleEl = e.target.closest('[data-action="toggle-task"]');
      if (toggleEl) {
        toggleTask(toggleEl.dataset.taskId);
        return;
      }

      // Delete task
      const delTask = e.target.closest('[data-action="delete-task"]');
      if (delTask) {
        const found = findKpi(state.focusKpiId);
        const task = found && found.kpi.tasks.find(t => t.id === delTask.dataset.taskId);
        if (task) {
          showConfirm(`Delete task "${task.title}"?`, () => deleteTask(delTask.dataset.taskId));
        }
      }
    });

    // ── Hours input: Enter to log ──
    document.getElementById('focus-panel').addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.target.id === 'log-hours-input') {
        e.preventDefault();
        document.getElementById('btn-log-hours')?.click();
      }
    });

    // ── Focus modal delegation ──
    document.getElementById('focus-list').addEventListener('click', e => {
      const item = e.target.closest('[data-action="set-focus"]');
      if (item) {
        setFocus(item.dataset.kpiId);
        closeModal('modal-focus');
      }
    });

    // Keyboard accessibility for focus list
    document.getElementById('focus-list').addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        const item = e.target.closest('[data-action="set-focus"]');
        if (item) {
          e.preventDefault();
          setFocus(item.dataset.kpiId);
          closeModal('modal-focus');
        }
      }
    });

    // Keyboard accessibility for task checkboxes
    document.getElementById('focus-panel').addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        const cb = e.target.closest('[data-action="toggle-task"]');
        if (cb && cb.classList.contains('task-checkbox')) {
          e.preventDefault();
          toggleTask(cb.dataset.taskId);
        }
      }
    });
  }

  /* ══════════════════════════════════════════════
     INIT
  ══════════════════════════════════════════════ */
  function init() {
    loadState();
    initClock();
    initEvents();
    render();
  }

  return { init };
})();

// Boot
document.addEventListener('DOMContentLoaded', APP.init);