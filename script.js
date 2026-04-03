/* ═══════════════════════════════════════════════
   EYPH — Earn Your Phase  |  script.js
   v3: + OKR progress rings · inline rename · JSON export
   Sections: CONFIG · DB · STATE · UTILS · RENDER · EVENTS · CRUD · INIT
═══════════════════════════════════════════════ */

const APP = (() => {
  'use strict';

  /* ══════════════════════════════════════════════
     SUPABASE CONFIG
  ══════════════════════════════════════════════ */
  const SUPABASE_URL = 'https://uzbdwuorvivmvradsnlz.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV6YmR3dW9ydml2bXZyYWRzbmx6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyNTQ1NTEsImV4cCI6MjA5MDgzMDU1MX0.yseg5uKtSqQrc4Pf76hzb_Zw2KFjWguWlJ1HKAg2huo';
  const HEADERS = {
    'Content-Type':  'application/json',
    'apikey':        SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Prefer':        'return=representation'
  };

  /* ══════════════════════════════════════════════
     IN-MEMORY STATE
  ══════════════════════════════════════════════ */
  let state = { okrs: [], focusKpiId: null };

  /* ══════════════════════════════════════════════
     SYNC STATUS
  ══════════════════════════════════════════════ */
  function setSyncStatus(status) {
    const dot   = document.getElementById('sync-dot');
    const label = document.getElementById('sync-label');
    if (!dot || !label) return;
    dot.className     = `sync-dot sync-dot--${status}`;
    label.textContent = { connecting: 'CONNECTING', synced: 'SYNCED', saving: 'SAVING...', error: 'OFFLINE' }[status] || status.toUpperCase();
  }

  /* ══════════════════════════════════════════════
     DATABASE LAYER
  ══════════════════════════════════════════════ */
  async function dbQuery(path, options = {}) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      ...options,
      headers: { ...HEADERS, ...(options.headers || {}) }
    });
    if (!res.ok) throw new Error(`DB [${res.status}]: ${await res.text()}`);
    if (res.status === 204) return null;
    return res.json();
  }

  async function dbLoadAll() {
    const [okrs, kpis, tasks, settings] = await Promise.all([
      dbQuery('okrs?select=*&order=created_at.asc'),
      dbQuery('kpis?select=*&order=created_at.asc'),
      dbQuery('tasks?select=*&order=created_at.asc'),
      dbQuery('app_settings?select=*')
    ]);
    state.okrs = okrs.map(okr => ({
      ...okr,
      kpis: kpis.filter(k => k.okr_id === okr.id).map(kpi => ({
        ...kpi,
        tasks: tasks.filter(t => t.kpi_id === kpi.id)
      }))
    }));
    const f = settings.find(s => s.key === 'focus_kpi_id');
    state.focusKpiId = f?.value || null;
  }

  /* ══════════════════════════════════════════════
     UTILS
  ══════════════════════════════════════════════ */
  function daysUntil(dateStr) {
    const today = new Date(); today.setHours(0,0,0,0);
    return Math.round((new Date(dateStr + 'T00:00:00') - today) / 86400000);
  }
  function urgencyClass(days) { return days < 0 ? 'overdue' : days <= 3 ? 'warning' : 'neutral'; }
  function urgencyLabel(days) {
    if (days < 0)   return `${Math.abs(days)}D OVERDUE`;
    if (days === 0) return 'DUE TODAY';
    if (days <= 3)  return `${days}D LEFT`;
    return `${days} DAYS LEFT`;
  }
  function findKpi(kpiId) {
    for (const okr of state.okrs) {
      const kpi = okr.kpis.find(k => k.id === kpiId);
      if (kpi) return { okr, kpi };
    }
    return null;
  }
  function kpiPercent(kpi) {
    if (kpi.type === 'hours') return kpi.target > 0 ? Math.min(100, Math.round((kpi.progress / kpi.target) * 100)) : 0;
    if (kpi.type === 'tasks') return kpi.tasks.length ? Math.round((kpi.tasks.filter(t=>t.done).length / kpi.tasks.length)*100) : 0;
    return 0;
  }
  function kpiDetail(kpi) {
    if (kpi.type === 'hours') return `${kpi.progress}h / ${kpi.target}h`;
    return `${kpi.tasks.filter(t=>t.done).length} / ${kpi.tasks.length} tasks`;
  }

  /** Compute overall OKR completion: average of all KPI percents, or 0 if no KPIs */
  function okrPercent(okr) {
    if (!okr.kpis.length) return 0;
    const sum = okr.kpis.reduce((acc, k) => acc + kpiPercent(k), 0);
    return Math.round(sum / okr.kpis.length);
  }

  /** Build an SVG ring given a 0–100 percent value */
  function ringsvg(pct, size = 28, strokeWidth = 3) {
    const r      = (size - strokeWidth) / 2;
    const circ   = 2 * Math.PI * r;
    const dash   = (pct / 100) * circ;
    const cx     = size / 2;
    const uCls   = pct >= 100 ? 'ring-complete' : 'ring-progress';
    return `<svg class="okr-ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
      <circle class="ring-track" cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke-width="${strokeWidth}"/>
      <circle class="${uCls}" cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke-width="${strokeWidth}"
        stroke-dasharray="${dash} ${circ}" stroke-dashoffset="0"
        transform="rotate(-90 ${cx} ${cx})"/>
      <text class="ring-text" x="${cx}" y="${cx}" text-anchor="middle" dominant-baseline="central"
        font-size="${size * 0.22}">${pct}</text>
    </svg>`;
  }

  function formatDate(d) {
    if (!d) return '';
    const [y, m, day] = d.split('-');
    return `${day} ${'JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC'.split(' ')[parseInt(m)-1]} ${y}`;
  }
  function escHtml(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  /* ══════════════════════════════════════════════
     CLOCK
  ══════════════════════════════════════════════ */
  function initClock() {
    const el = document.getElementById('clock');
    const tick = () => { el.textContent = [new Date().getHours(), new Date().getMinutes(), new Date().getSeconds()].map(n=>String(n).padStart(2,'0')).join(':'); };
    tick(); setInterval(tick, 1000);
  }

  /* ══════════════════════════════════════════════
     RENDER — SIDEBAR
  ══════════════════════════════════════════════ */
  function renderSidebar() {
    const list = document.getElementById('okr-list');
    if (!state.okrs.length) {
      list.innerHTML = `<div class="sidebar-empty">No OKRs yet.<br/>Click "+ OKR" to begin.</div>`;
      return;
    }
    list.innerHTML = state.okrs.map(okr => {
      const days = daysUntil(okr.deadline);
      const pct  = okrPercent(okr);

      const kpiRows = okr.kpis.map(kpi => {
        const isActive = kpi.id === state.focusKpiId;
        return `
          <div class="kpi-row ${isActive ? 'active' : ''}" role="listitem"
               data-kpi-id="${kpi.id}" aria-label="KPI: ${escHtml(kpi.title)}${isActive ? ', active' : ''}">
            <div class="kpi-info">
              <div class="kpi-name" data-action="rename-kpi" data-kpi-id="${kpi.id}"
                   title="Double-click to rename">${escHtml(kpi.title)}</div>
              <div class="kpi-summary">${kpiPercent(kpi)}% — ${kpiDetail(kpi)}</div>
            </div>
            <button class="btn-icon" data-action="delete-kpi"
                    data-kpi-id="${kpi.id}" data-okr-id="${okr.id}" aria-label="Delete KPI">✕</button>
          </div>`;
      }).join('');

      return `
        <div class="okr-item" role="listitem" data-okr-id="${okr.id}">
          <div class="okr-row">
            ${ringsvg(pct)}
            <div class="okr-info">
              <div class="okr-title" data-action="rename-okr" data-okr-id="${okr.id}"
                   title="Double-click to rename">${escHtml(okr.title)}</div>
              <div class="okr-deadline ${urgencyClass(days)}">${formatDate(okr.deadline)} · ${urgencyLabel(days)}</div>
            </div>
            <button class="btn-icon" data-action="delete-okr" data-okr-id="${okr.id}" aria-label="Delete OKR">✕</button>
          </div>
          <div class="kpi-list">${kpiRows}</div>
        </div>`;
    }).join('');
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
    if (!found) { state.focusKpiId = null; renderFocusPanel(); return; }

    const { okr, kpi } = found;
    const days = daysUntil(okr.deadline);
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
                   placeholder="0.0" min="0.1" step="0.5" max="24" aria-label="Hours to log"/>
            <button class="btn btn-accent" id="btn-log-hours">LOG HOURS</button>
          </div>
        </div>`;
    } else {
      const taskItems = kpi.tasks.length
        ? kpi.tasks.map(t => `
            <div class="task-item ${t.done ? 'done' : ''}" data-task-id="${t.id}" role="listitem">
              <div class="task-checkbox" data-action="toggle-task" data-task-id="${t.id}"
                   role="checkbox" aria-checked="${t.done}" tabindex="0"
                   aria-label="Toggle: ${escHtml(t.title)}">${t.done ? '✓' : ''}</div>
              <span class="task-title" data-action="toggle-task" data-task-id="${t.id}">${escHtml(t.title)}</span>
              <button class="btn-icon" data-action="rename-task" data-task-id="${t.id}"
                      aria-label="Rename task" title="Rename">✎</button>
              <button class="btn-icon" data-action="delete-task" data-task-id="${t.id}"
                      aria-label="Delete task">✕</button>
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
          <span class="meta-tag">${escHtml(okr.title)}</span>
          <span class="urgency-tag ${urgencyClass(days)}">${urgencyLabel(days)}</span>
        </div>
        <h1 class="focus-title">${escHtml(kpi.title)}</h1>
        <div class="focus-progress">
          <div class="progress-stats">
            <span class="progress-pct">${pct}%</span>
            <span class="progress-detail">${kpiDetail(kpi)}</span>
          </div>
          <div class="progress-bar-wrap" role="progressbar"
               aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
            <div class="progress-bar-fill" style="width:${pct}%"></div>
          </div>
        </div>
        ${actionHtml}
      </div>`;
  }

  function render() { renderSidebar(); renderFocusPanel(); }

  /* ══════════════════════════════════════════════
     LOADING OVERLAY
  ══════════════════════════════════════════════ */
  function showLoading(show) {
    let ov = document.getElementById('loading-overlay');
    if (show && !ov) {
      ov = document.createElement('div');
      ov.id = 'loading-overlay';
      ov.innerHTML = `<div class="loading-box"><span class="loading-label">LOADING DATA...</span></div>`;
      document.body.appendChild(ov);
    } else if (!show && ov) { ov.remove(); }
  }

  /* ══════════════════════════════════════════════
     MODAL SYSTEM
  ══════════════════════════════════════════════ */
  function openModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.removeAttribute('hidden');
    const first = el.querySelector('input, select, button:not(.modal-close)');
    if (first) setTimeout(() => first.focus(), 50);
  }
  function closeModal(id) { document.getElementById(id)?.setAttribute('hidden',''); clearFormErrors(); }
  function closeAllModals() { document.querySelectorAll('.modal-overlay').forEach(m => m.setAttribute('hidden','')); clearFormErrors(); }
  function clearFormErrors() {
    document.querySelectorAll('.form-error').forEach(e => e.textContent='');
    document.querySelectorAll('.form-input').forEach(i => i.classList.remove('has-error'));
  }
  function showError(inputId, errorId, msg) {
    document.getElementById(inputId)?.classList.add('has-error');
    const e = document.getElementById(errorId); if (e) e.textContent = msg;
  }

  function populateOkrSelect() {
    const sel = document.getElementById('kpi-okr');
    sel.innerHTML = '<option value="">— Select OKR —</option>';
    state.okrs.forEach(okr => { const o = document.createElement('option'); o.value=okr.id; o.textContent=okr.title; sel.appendChild(o); });
  }

  function populateFocusModal() {
    const list = document.getElementById('focus-list');
    const all  = state.okrs.flatMap(okr => okr.kpis.map(kpi => ({okr,kpi})));
    if (!all.length) { list.innerHTML = `<div class="focus-list-empty">No KPIs yet. Create one first.</div>`; return; }
    list.innerHTML = all.map(({okr,kpi}) => `
      <div class="focus-select-item ${kpi.id===state.focusKpiId?'selected':''}"
           data-action="set-focus" data-kpi-id="${kpi.id}" role="listitem" tabindex="0">
        <div class="focus-select-kpi">${escHtml(kpi.title)}</div>
        <div class="focus-select-okr">${escHtml(okr.title)}</div>
      </div>`).join('');
  }

  /* ══════════════════════════════════════════════
     CONFIRM DIALOG
  ══════════════════════════════════════════════ */
  let _confirmCallback = null;
  function showConfirm(msg, cb) { document.getElementById('confirm-message').textContent = msg; _confirmCallback = cb; openModal('modal-confirm'); }

  /* ══════════════════════════════════════════════
     RENAME MODAL — shared for OKR / KPI / Task
  ══════════════════════════════════════════════ */
  let _renameCallback = null;

  function openRename(label, currentValue, onSave) {
    document.getElementById('modal-rename-title').textContent = `RENAME ${label}`;
    document.getElementById('rename-label').textContent = `NEW ${label} NAME`;
    const input = document.getElementById('rename-input');
    input.value = currentValue;
    input.maxLength = 120;
    _renameCallback = onSave;
    clearFormErrors();
    openModal('modal-rename');
    setTimeout(() => { input.select(); }, 60);
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('form-rename').addEventListener('submit', async e => {
      e.preventDefault();
      const val = document.getElementById('rename-input').value.trim();
      if (!val) { showError('rename-input','rename-error','Name cannot be empty.'); return; }
      if (typeof _renameCallback === 'function') {
        closeModal('modal-rename');
        await _renameCallback(val);
        _renameCallback = null;
      }
    });
  });

  /* ══════════════════════════════════════════════
     JSON EXPORT
  ══════════════════════════════════════════════ */
  function exportData() {
    const payload = {
      exported_at: new Date().toISOString(),
      focus_kpi_id: state.focusKpiId,
      okrs: state.okrs.map(okr => ({
        id: okr.id, title: okr.title, deadline: okr.deadline,
        kpis: okr.kpis.map(kpi => ({
          id: kpi.id, title: kpi.title, type: kpi.type,
          target: kpi.target, progress: kpi.progress,
          tasks: kpi.tasks.map(t => ({ id: t.id, title: t.title, done: t.done }))
        }))
      }))
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `eyph-export-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /* ══════════════════════════════════════════════
     CRUD — OKR
  ══════════════════════════════════════════════ */
  async function createOkr(title, deadline) {
    setSyncStatus('saving');
    try {
      const [row] = await dbQuery('okrs', { method:'POST', body: JSON.stringify({title:title.trim(), deadline}) });
      state.okrs.push({...row, kpis:[]});
      render(); setSyncStatus('synced');
    } catch(e) { console.error(e); setSyncStatus('error'); }
  }

  async function deleteOkr(okrId) {
    setSyncStatus('saving');
    try {
      const okr = state.okrs.find(o => o.id === okrId);
      if (okr?.kpis.some(k => k.id === state.focusKpiId)) { state.focusKpiId = null; await saveFocus(null); }
      await dbQuery(`okrs?id=eq.${okrId}`, { method:'DELETE' });
      state.okrs = state.okrs.filter(o => o.id !== okrId);
      render(); setSyncStatus('synced');
    } catch(e) { console.error(e); setSyncStatus('error'); }
  }

  async function renameOkr(okrId, newTitle) {
    setSyncStatus('saving');
    try {
      await dbQuery(`okrs?id=eq.${okrId}`, { method:'PATCH', body: JSON.stringify({title: newTitle}) });
      const okr = state.okrs.find(o => o.id === okrId);
      if (okr) okr.title = newTitle;
      render(); setSyncStatus('synced');
    } catch(e) { console.error(e); setSyncStatus('error'); }
  }

  /* ══════════════════════════════════════════════
     CRUD — KPI
  ══════════════════════════════════════════════ */
  async function createKpi(okrId, title, type, target) {
    setSyncStatus('saving');
    try {
      const [row] = await dbQuery('kpis', { method:'POST', body: JSON.stringify({
        okr_id:okrId, title:title.trim(), type,
        target: type==='hours' ? Number(target) : 0, progress:0
      })});
      const okr = state.okrs.find(o => o.id === okrId);
      if (okr) okr.kpis.push({...row, tasks:[]});
      if (!state.focusKpiId) { state.focusKpiId = row.id; await saveFocus(row.id); }
      render(); setSyncStatus('synced');
    } catch(e) { console.error(e); setSyncStatus('error'); }
  }

  async function deleteKpi(okrId, kpiId) {
    setSyncStatus('saving');
    try {
      if (kpiId === state.focusKpiId) { state.focusKpiId = null; await saveFocus(null); }
      await dbQuery(`kpis?id=eq.${kpiId}`, { method:'DELETE' });
      const okr = state.okrs.find(o => o.id === okrId);
      if (okr) okr.kpis = okr.kpis.filter(k => k.id !== kpiId);
      render(); setSyncStatus('synced');
    } catch(e) { console.error(e); setSyncStatus('error'); }
  }

  async function renameKpi(kpiId, newTitle) {
    setSyncStatus('saving');
    try {
      await dbQuery(`kpis?id=eq.${kpiId}`, { method:'PATCH', body: JSON.stringify({title: newTitle}) });
      const found = findKpi(kpiId);
      if (found) found.kpi.title = newTitle;
      render(); setSyncStatus('synced');
    } catch(e) { console.error(e); setSyncStatus('error'); }
  }

  /* ══════════════════════════════════════════════
     CRUD — HOURS
  ══════════════════════════════════════════════ */
  async function logHours(hours) {
    const found = findKpi(state.focusKpiId);
    if (!found) return;
    setSyncStatus('saving');
    try {
      const newProg = Math.round((found.kpi.progress + hours) * 100) / 100;
      await dbQuery(`kpis?id=eq.${found.kpi.id}`, { method:'PATCH', body: JSON.stringify({progress:newProg}) });
      found.kpi.progress = newProg;
      render(); setSyncStatus('synced');
    } catch(e) { console.error(e); setSyncStatus('error'); }
  }

  /* ══════════════════════════════════════════════
     CRUD — TASKS
  ══════════════════════════════════════════════ */
  async function addTask(title) {
    const found = findKpi(state.focusKpiId);
    if (!found || found.kpi.type !== 'tasks') return;
    setSyncStatus('saving');
    try {
      const [row] = await dbQuery('tasks', { method:'POST', body: JSON.stringify({kpi_id:found.kpi.id, title:title.trim(), done:false}) });
      found.kpi.tasks.push(row);
      render(); setSyncStatus('synced');
    } catch(e) { console.error(e); setSyncStatus('error'); }
  }

  async function toggleTask(taskId) {
    const found = findKpi(state.focusKpiId);
    if (!found) return;
    const task = found.kpi.tasks.find(t => t.id === taskId);
    if (!task) return;
    setSyncStatus('saving');
    try {
      const newDone = !task.done;
      await dbQuery(`tasks?id=eq.${taskId}`, { method:'PATCH', body: JSON.stringify({done:newDone}) });
      task.done = newDone;
      found.kpi.progress = found.kpi.tasks.filter(t=>t.done).length;
      await dbQuery(`kpis?id=eq.${found.kpi.id}`, { method:'PATCH', body: JSON.stringify({progress:found.kpi.progress}) });
      render(); setSyncStatus('synced');
    } catch(e) { console.error(e); setSyncStatus('error'); }
  }

  async function renameTask(taskId, newTitle) {
    const found = findKpi(state.focusKpiId);
    if (!found) return;
    setSyncStatus('saving');
    try {
      await dbQuery(`tasks?id=eq.${taskId}`, { method:'PATCH', body: JSON.stringify({title:newTitle}) });
      const task = found.kpi.tasks.find(t => t.id === taskId);
      if (task) task.title = newTitle;
      render(); setSyncStatus('synced');
    } catch(e) { console.error(e); setSyncStatus('error'); }
  }

  async function deleteTask(taskId) {
    const found = findKpi(state.focusKpiId);
    if (!found) return;
    setSyncStatus('saving');
    try {
      await dbQuery(`tasks?id=eq.${taskId}`, { method:'DELETE' });
      found.kpi.tasks = found.kpi.tasks.filter(t => t.id !== taskId);
      found.kpi.progress = found.kpi.tasks.filter(t=>t.done).length;
      await dbQuery(`kpis?id=eq.${found.kpi.id}`, { method:'PATCH', body: JSON.stringify({progress:found.kpi.progress}) });
      render(); setSyncStatus('synced');
    } catch(e) { console.error(e); setSyncStatus('error'); }
  }

  /* ══════════════════════════════════════════════
     FOCUS
  ══════════════════════════════════════════════ */
  async function saveFocus(kpiId) {
    await dbQuery(`app_settings?key=eq.focus_kpi_id`, { method:'PATCH', body: JSON.stringify({value:kpiId}) });
  }
  async function setFocus(kpiId) {
    setSyncStatus('saving');
    try { state.focusKpiId = kpiId; await saveFocus(kpiId); render(); setSyncStatus('synced'); }
    catch(e) { console.error(e); setSyncStatus('error'); }
  }

  /* ══════════════════════════════════════════════
     FORM HANDLERS
  ══════════════════════════════════════════════ */
  async function handleOkrSubmit(e) {
    e.preventDefault(); clearFormErrors();
    const title    = document.getElementById('okr-title').value.trim();
    const deadline = document.getElementById('okr-deadline').value;
    let ok = true;
    if (!title)    { showError('okr-title','okr-title-error','Title is required.'); ok=false; }
    if (!deadline) { showError('okr-deadline','okr-deadline-error','Deadline is required.'); ok=false; }
    if (!ok) return;
    document.getElementById('form-okr').reset();
    closeModal('modal-okr');
    await createOkr(title, deadline);
  }

  async function handleKpiSubmit(e) {
    e.preventDefault(); clearFormErrors();
    const okrId  = document.getElementById('kpi-okr').value;
    const title  = document.getElementById('kpi-title').value.trim();
    const type   = document.getElementById('kpi-type').value;
    const target = document.getElementById('kpi-target').value;
    let ok = true;
    if (!okrId)  { showError('kpi-okr',  'kpi-okr-error',  'Select an OKR.'); ok=false; }
    if (!title)  { showError('kpi-title','kpi-title-error','KPI title is required.'); ok=false; }
    if (type==='hours' && (!target || Number(target)<=0)) { showError('kpi-target','kpi-target-error','Enter a positive target.'); ok=false; }
    if (!ok) return;
    document.getElementById('form-kpi').reset();
    document.getElementById('kpi-type').value = 'hours';
    document.querySelectorAll('.type-btn').forEach(b => b.classList.toggle('active', b.dataset.type==='hours'));
    document.getElementById('kpi-target-group').style.display = '';
    closeModal('modal-kpi');
    await createKpi(okrId, title, type, target);
  }

  async function handleTaskSubmit(e) {
    e.preventDefault(); clearFormErrors();
    const title = document.getElementById('task-title').value.trim();
    if (!title) { showError('task-title','task-title-error','Task description is required.'); return; }
    document.getElementById('form-task').reset();
    closeModal('modal-task');
    await addTask(title);
  }

  /* ══════════════════════════════════════════════
     EVENT DELEGATION
  ══════════════════════════════════════════════ */
  function initEvents() {

    // ── Header buttons ──
    document.getElementById('btn-open-okr-modal').addEventListener('click', () => {
      clearFormErrors(); document.getElementById('form-okr').reset(); openModal('modal-okr');
    });
    document.getElementById('btn-open-kpi-modal').addEventListener('click', () => {
      if (!state.okrs.length) { alert('Create at least one OKR first.'); return; }
      populateOkrSelect(); clearFormErrors(); document.getElementById('form-kpi').reset();
      document.getElementById('kpi-type').value = 'hours';
      document.querySelectorAll('.type-btn').forEach(b => b.classList.toggle('active', b.dataset.type==='hours'));
      document.getElementById('kpi-target-group').style.display = '';
      openModal('modal-kpi');
    });
    document.getElementById('btn-open-focus-modal').addEventListener('click', () => { populateFocusModal(); openModal('modal-focus'); });
    document.getElementById('btn-export').addEventListener('click', exportData);

    // ── Forms ──
    document.getElementById('form-okr').addEventListener('submit',  handleOkrSubmit);
    document.getElementById('form-kpi').addEventListener('submit',  handleKpiSubmit);
    document.getElementById('form-task').addEventListener('submit', handleTaskSubmit);

    // ── KPI type toggle ──
    document.querySelector('.type-toggle').addEventListener('click', e => {
      const btn = e.target.closest('.type-btn'); if (!btn) return;
      const type = btn.dataset.type;
      document.getElementById('kpi-type').value = type;
      document.querySelectorAll('.type-btn').forEach(b => b.classList.toggle('active', b===btn));
      document.getElementById('kpi-target-group').style.display = type==='hours' ? '' : 'none';
    });

    // ── Modal close (data-close attr + overlay + ESC) ──
    document.body.addEventListener('click', e => { const b=e.target.closest('[data-close]'); if(b) closeModal(b.dataset.close); });
    document.querySelectorAll('.modal-overlay').forEach(ov => ov.addEventListener('click', e => { if(e.target===ov) closeModal(ov.id); }));
    document.addEventListener('keydown', e => {
      if (e.key==='Escape') closeAllModals();
      if (e.key==='f' && !e.ctrlKey && !e.metaKey && !e.altKey && !['INPUT','SELECT','TEXTAREA'].includes(document.activeElement?.tagName)) {
        populateFocusModal(); openModal('modal-focus');
      }
    });

    // ── Confirm ──
    document.getElementById('btn-confirm-delete').addEventListener('click', () => {
      if (typeof _confirmCallback==='function') { _confirmCallback(); _confirmCallback=null; }
      closeModal('modal-confirm');
    });

    // ── SIDEBAR: OKR delete/rename + KPI delete/rename/focus ──
    document.getElementById('okr-list').addEventListener('click', e => {
      // Delete OKR
      const delOkr = e.target.closest('[data-action="delete-okr"]');
      if (delOkr) {
        const okr = state.okrs.find(o=>o.id===delOkr.dataset.okrId);
        if (okr) showConfirm(`Delete OKR "${okr.title}"? All KPIs will be removed.`, () => deleteOkr(okr.id));
        return;
      }
      // Delete KPI
      const delKpi = e.target.closest('[data-action="delete-kpi"]');
      if (delKpi) {
        const found = findKpi(delKpi.dataset.kpiId);
        if (found) showConfirm(`Delete KPI "${found.kpi.title}"?`, () => deleteKpi(delKpi.dataset.okrId, delKpi.dataset.kpiId));
        return;
      }
      // Focus via KPI row click
      const kpiRow = e.target.closest('.kpi-row');
      if (kpiRow && !e.target.closest('.btn-icon') && !e.target.closest('[data-action="rename-kpi"]')) {
        setFocus(kpiRow.dataset.kpiId);
      }
    });

    // ── SIDEBAR: Double-click to rename OKR or KPI ──
    document.getElementById('okr-list').addEventListener('dblclick', e => {
      const renOkr = e.target.closest('[data-action="rename-okr"]');
      if (renOkr) {
        const okr = state.okrs.find(o=>o.id===renOkr.dataset.okrId);
        if (okr) openRename('OKR', okr.title, newTitle => renameOkr(okr.id, newTitle));
        return;
      }
      const renKpi = e.target.closest('[data-action="rename-kpi"]');
      if (renKpi) {
        const found = findKpi(renKpi.dataset.kpiId);
        if (found) openRename('KPI', found.kpi.title, newTitle => renameKpi(found.kpi.id, newTitle));
      }
    });

    // ── FOCUS PANEL: log hours / task add+toggle+rename+delete ──
    document.getElementById('focus-panel').addEventListener('click', e => {
      if (e.target.id === 'btn-log-hours') {
        const input = document.getElementById('log-hours-input');
        const val   = parseFloat(input.value);
        if (!val || val<=0) { input.focus(); input.style.borderColor='var(--accent)'; setTimeout(()=>input.style.borderColor='',1000); return; }
        logHours(val); input.value=''; input.focus(); return;
      }
      if (e.target.id === 'btn-open-task-modal') {
        clearFormErrors(); document.getElementById('form-task').reset(); openModal('modal-task'); return;
      }
      const toggle = e.target.closest('[data-action="toggle-task"]');
      if (toggle) { toggleTask(toggle.dataset.taskId); return; }

      const renTask = e.target.closest('[data-action="rename-task"]');
      if (renTask) {
        const found = findKpi(state.focusKpiId);
        const task  = found?.kpi.tasks.find(t=>t.id===renTask.dataset.taskId);
        if (task) openRename('TASK', task.title, newTitle => renameTask(task.id, newTitle));
        return;
      }
      const delTask = e.target.closest('[data-action="delete-task"]');
      if (delTask) {
        const found = findKpi(state.focusKpiId);
        const task  = found?.kpi.tasks.find(t=>t.id===delTask.dataset.taskId);
        if (task) showConfirm(`Delete task "${task.title}"?`, () => deleteTask(task.id));
      }
    });

    document.getElementById('focus-panel').addEventListener('keydown', e => {
      if (e.key==='Enter' && e.target.id==='log-hours-input') { e.preventDefault(); document.getElementById('btn-log-hours')?.click(); }
      if ((e.key==='Enter'||e.key===' ') && e.target.closest('[data-action="toggle-task"]')) {
        e.preventDefault(); toggleTask(e.target.closest('[data-action="toggle-task"]').dataset.taskId);
      }
    });

    // ── Focus modal ──
    document.getElementById('focus-list').addEventListener('click', e => {
      const item = e.target.closest('[data-action="set-focus"]');
      if (item) { setFocus(item.dataset.kpiId); closeModal('modal-focus'); }
    });
    document.getElementById('focus-list').addEventListener('keydown', e => {
      if (e.key==='Enter'||e.key===' ') {
        const item=e.target.closest('[data-action="set-focus"]');
        if (item) { e.preventDefault(); setFocus(item.dataset.kpiId); closeModal('modal-focus'); }
      }
    });
  }

  /* ══════════════════════════════════════════════
     INIT
  ══════════════════════════════════════════════ */
  async function init() {
    initClock();
    initEvents();
    setSyncStatus('connecting');
    showLoading(true);
    try { await dbLoadAll(); setSyncStatus('synced'); }
    catch(e) { console.error('EYPH init:', e); setSyncStatus('error'); }
    finally { showLoading(false); }
    render();
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', APP.init);