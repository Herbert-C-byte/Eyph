/* ═══════════════════════════════════════════════
   EYPH — Earn Your Phase  |  script.js  v5
   + Velocity indicator · Ghost ring · Completed OKR archive
═══════════════════════════════════════════════ */
 
const APP = (() => {
  'use strict';
 
  /* ══════════════════════════════════════════════
     CONFIG
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
     STATE
  ══════════════════════════════════════════════ */
  let state = { okrs: [], focusKpiId: null };
  let currentView = 'focus';
  let completedOpen = false;
 
  /* ══════════════════════════════════════════════
     DB LAYER
  ══════════════════════════════════════════════ */
  async function dbQuery(path, options = {}) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      ...options, headers: { ...HEADERS, ...(options.headers || {}) }
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
        ...kpi, tasks: tasks.filter(t => t.kpi_id === kpi.id)
      }))
    }));
    const f = settings.find(s => s.key === 'focus_kpi_id');
    state.focusKpiId = f?.value || null;
  }
 
  /* ══════════════════════════════════════════════
     SYNC STATUS
  ══════════════════════════════════════════════ */
  function setSyncStatus(s) {
    const dot = document.getElementById('sync-dot');
    const lbl = document.getElementById('sync-label');
    if (!dot || !lbl) return;
    dot.className = `sync-dot sync-dot--${s}`;
    lbl.textContent = { connecting:'CONNECTING', synced:'SYNCED', saving:'SAVING...', error:'OFFLINE' }[s] || s.toUpperCase();
  }
 
  /* ══════════════════════════════════════════════
     UTILS
  ══════════════════════════════════════════════ */
  function daysUntil(d) {
    const t = new Date(); t.setHours(0,0,0,0);
    return Math.round((new Date(d+'T00:00:00') - t) / 86400000);
  }
  function urgencyClass(days) { return days < 0 ? 'overdue' : days <= 3 ? 'warning' : 'neutral'; }
  function urgencyLabel(days) {
    if (days < 0)   return `${Math.abs(days)}D OVERDUE`;
    if (days === 0) return 'DUE TODAY';
    if (days <= 3)  return `${days}D LEFT`;
    return `${days} DAYS LEFT`;
  }
  function findKpi(id) {
    for (const okr of state.okrs) { const k = okr.kpis.find(k => k.id === id); if (k) return { okr, kpi: k }; }
    return null;
  }
  function kpiPercent(kpi) {
    if (kpi.type === 'hours') return kpi.target > 0 ? Math.min(100, Math.round((kpi.progress/kpi.target)*100)) : 0;
    if (kpi.type === 'tasks') return kpi.tasks.length ? Math.round((kpi.tasks.filter(t=>t.done).length/kpi.tasks.length)*100) : 0;
    return 0;
  }
  function kpiDetail(kpi) {
    if (kpi.type === 'hours') return `${kpi.progress}h / ${kpi.target}h`;
    return `${kpi.tasks.filter(t=>t.done).length} / ${kpi.tasks.length} tasks`;
  }
  function okrPercent(okr) {
    if (!okr.kpis.length) return 0;
    return Math.round(okr.kpis.reduce((a,k) => a + kpiPercent(k), 0) / okr.kpis.length);
  }
  function ringsvg(pct, size=32, sw=3) {
    const r = (size-sw)/2, circ = 2*Math.PI*r, dash = (pct/100)*circ, cx = size/2;
    const cls = pct >= 100 ? 'ring-complete' : 'ring-progress';
    return `<svg class="okr-ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
      <circle class="ring-track" cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke-width="${sw}"/>
      <circle class="${cls}" cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke-width="${sw}"
        stroke-dasharray="${dash} ${circ}" transform="rotate(-90 ${cx} ${cx})"/>
      <text class="ring-text" x="${cx}" y="${cx}" text-anchor="middle" dominant-baseline="central"
        font-size="${Math.round(size*.22)}">${pct}</text>
    </svg>`;
  }
  function formatDate(d) {
    if (!d) return '';
    const [y,m,day] = d.split('-');
    return `${day} ${'JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC'.split(' ')[parseInt(m)-1]} ${y}`;
  }
  function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }
 
  /* ══════════════════════════════════════════════
     VELOCITY ENGINE
     Calculates pace for hours-KPIs and projects
     whether the target will be hit by deadline.
  ══════════════════════════════════════════════ */
  function calcVelocity(kpi, okr) {
    if (kpi.type !== 'hours') return null;
    if (kpi.progress <= 0)   return null;
 
    const createdAt  = new Date(kpi.created_at);
    const now        = new Date();
    const daysElapsed = Math.max(1, (now - createdAt) / 86400000);
    const weeksElapsed = daysElapsed / 7;
    const hrsPerWeek   = kpi.progress / weeksElapsed;
 
    const remaining    = kpi.target - kpi.progress;
    const daysLeft     = daysUntil(okr.deadline);
 
    // Already done
    if (kpi.progress >= kpi.target) {
      return { type: 'done', hrsPerWeek };
    }
 
    // No time left
    if (daysLeft <= 0) {
      return { type: 'danger', hrsPerWeek, projectedDate: null, daysOff: Math.abs(daysLeft) };
    }
 
    const weeksLeft      = daysLeft / 7;
    const hrsNeededPerWk = remaining / weeksLeft;
    const projectedDays  = remaining / (hrsPerWeek / 7); // days to finish at current pace
    const projectedDate  = new Date(now.getTime() + projectedDays * 86400000);
    const daysEarly      = daysLeft - projectedDays;
 
    let type;
    if (daysEarly >= 7)        type = 'ahead';
    else if (daysEarly >= 0)   type = 'ahead';  // barely ahead = still green
    else if (daysEarly >= -14) type = 'behind';
    else                       type = 'danger';
 
    return { type, hrsPerWeek, hrsNeededPerWk, projectedDate, daysEarly: Math.round(daysEarly) };
  }
 
  function renderVelocity(kpi, okr) {
    const v = calcVelocity(kpi, okr);
    if (!v) return '';
 
    const paceStr = `${v.hrsPerWeek.toFixed(1)}H/WK`;
 
    if (v.type === 'done') {
      return `<div class="velocity-bar vel-done">
        <span class="vel-icon">◉</span>
        <span class="vel-text">TARGET REACHED · <span class="vel-pace">${paceStr} AVG</span></span>
      </div>`;
    }
 
    if (v.type === 'danger' && !v.projectedDate) {
      return `<div class="velocity-bar vel-danger">
        <span class="vel-icon">▲</span>
        <span class="vel-text">DEADLINE PASSED · <span class="vel-pace">${paceStr} AVG</span></span>
      </div>`;
    }
 
    const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    const pd     = v.projectedDate;
    const pdStr  = `${String(pd.getDate()).padStart(2,'0')} ${months[pd.getMonth()]}`;
 
    if (v.type === 'ahead') {
      const label = v.daysEarly > 0
        ? `ON TRACK · FINISH ~${pdStr} · ${Math.abs(v.daysEarly)}D EARLY`
        : `ON TRACK · FINISH ~${pdStr}`;
      return `<div class="velocity-bar vel-ahead">
        <span class="vel-icon">▲</span>
        <span class="vel-text">${label} · <span class="vel-pace">${paceStr}</span></span>
      </div>`;
    }
 
    if (v.type === 'behind') {
      const gap = Math.abs(v.daysEarly);
      return `<div class="velocity-bar vel-behind">
        <span class="vel-icon">▼</span>
        <span class="vel-text">BEHIND · FINISH ~${pdStr} · ${gap}D LATE · NEED <span class="vel-pace">${v.hrsNeededPerWk.toFixed(1)}H/WK</span></span>
      </div>`;
    }
 
    return `<div class="velocity-bar vel-danger">
      <span class="vel-icon">▼</span>
      <span class="vel-text">OFF PACE · FINISH ~${pdStr} · NEED <span class="vel-pace">${v.hrsNeededPerWk.toFixed(1)}H/WK</span></span>
    </div>`;
  }
 
  /* ══════════════════════════════════════════════
     GHOST RING — injected into focus panel
  ══════════════════════════════════════════════ */
  function injectGhostRing(pct) {
    // Remove existing
    document.querySelector('.focus-ghost-ring')?.remove();
 
    const panel  = document.getElementById('focus-panel');
    if (!panel) return;
 
    const size   = Math.min(panel.offsetWidth, panel.offsetHeight) * 1.1;
    const sw     = Math.max(18, size * 0.045);
    const r      = (size - sw) / 2;
    const circ   = 2 * Math.PI * r;
    const dash   = (pct / 100) * circ;
    const cx     = size / 2;
    const cls    = pct >= 100 ? 'gf-complete' : 'gf-progress';
 
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('focus-ghost-ring');
    svg.setAttribute('width',   size);
    svg.setAttribute('height',  size);
    svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
    svg.setAttribute('aria-hidden', 'true');
 
    // Position centered in panel
    svg.style.cssText = `
      position:absolute;
      top:50%; left:50%;
      transform:translate(-50%,-50%);
      pointer-events:none;
      z-index:0;
    `;
 
    svg.innerHTML = `
      <circle class="ghost-track" cx="${cx}" cy="${cx}" r="${r}"
        fill="none" stroke-width="${sw}"/>
      <circle class="ghost-fill ${cls}" cx="${cx}" cy="${cx}" r="${r}"
        fill="none" stroke-width="${sw}"
        stroke-dasharray="${dash} ${circ}"
        transform="rotate(-90 ${cx} ${cx})"/>`;
 
    panel.appendChild(svg);
  }
 
  /* ══════════════════════════════════════════════
     CLOCK
  ══════════════════════════════════════════════ */
  function initClock() {
    const el = document.getElementById('clock');
    const tick = () => { const n=new Date(); el.textContent=[n.getHours(),n.getMinutes(),n.getSeconds()].map(v=>String(v).padStart(2,'0')).join(':'); };
    tick(); setInterval(tick, 1000);
  }
 
  /* ══════════════════════════════════════════════
     VIEW SWITCHER
  ══════════════════════════════════════════════ */
  function switchView(view) {
    currentView = view;
    document.getElementById('view-focus').hidden     = (view !== 'focus');
    document.getElementById('view-dashboard').hidden = (view !== 'dashboard');
    document.getElementById('btn-view-focus').classList.toggle('active',     view === 'focus');
    document.getElementById('btn-view-dashboard').classList.toggle('active', view === 'dashboard');
    if (view === 'dashboard') renderDashboard();
  }
 
  /* ══════════════════════════════════════════════
     RENDER — SIDEBAR (active OKRs only)
  ══════════════════════════════════════════════ */
  function renderSidebar() {
    const list   = document.getElementById('okr-list');
    const active = state.okrs.filter(o => !o.completed);
    const done   = state.okrs.filter(o => o.completed);
 
    if (!active.length) {
      list.innerHTML = `<div class="sidebar-empty">${done.length ? 'All objectives completed.' : 'No OKRs yet.<br/>Click "+ OKR" to begin.'}</div>`;
    } else {
      list.innerHTML = active.map(okr => {
        const days = daysUntil(okr.deadline);
        const kpiRows = okr.kpis.map(kpi => {
          const isActive = kpi.id === state.focusKpiId;
          return `<div class="kpi-row ${isActive?'active':''}" role="listitem" data-kpi-id="${kpi.id}">
            <div class="kpi-info">
              <div class="kpi-name" data-action="rename-kpi" data-kpi-id="${kpi.id}">${escHtml(kpi.title)}</div>
              <div class="kpi-summary">${kpiPercent(kpi)}% — ${kpiDetail(kpi)}</div>
            </div>
            <button class="btn-icon" data-action="delete-kpi" data-kpi-id="${kpi.id}" data-okr-id="${okr.id}">✕</button>
          </div>`;
        }).join('');
 
        return `<div class="okr-item" role="listitem" data-okr-id="${okr.id}">
          <div class="okr-row">
            ${ringsvg(okrPercent(okr))}
            <div class="okr-info">
              <div class="okr-title" data-action="rename-okr" data-okr-id="${okr.id}" title="Double-click to rename">${escHtml(okr.title)}</div>
              <div class="okr-deadline ${urgencyClass(days)}">${formatDate(okr.deadline)} · ${urgencyLabel(days)}</div>
            </div>
            <div class="okr-actions">
              <button class="btn-icon complete-btn" data-action="complete-okr" data-okr-id="${okr.id}" title="Mark as completed">◉</button>
              <button class="btn-icon" data-action="delete-okr" data-okr-id="${okr.id}" title="Delete OKR">✕</button>
            </div>
          </div>
          <div class="kpi-list">${kpiRows}</div>
        </div>`;
      }).join('');
    }
 
    // Completed archive
    const section       = document.getElementById('sidebar-completed');
    const completedList = document.getElementById('completed-list');
    const countEl       = document.getElementById('completed-count');
 
    if (done.length) {
      section.removeAttribute('hidden');
      countEl.textContent = done.length;
 
      completedList.innerHTML = done.map(okr => {
        const completedDate = okr.completed_at ? formatDate(okr.completed_at.slice(0,10)) : '';
        return `<div class="completed-okr-row" data-okr-id="${okr.id}">
          ${ringsvg(100, 26, 2.5)}
          <div class="completed-okr-info">
            <div class="completed-okr-title" title="${escHtml(okr.title)}">${escHtml(okr.title)}</div>
            ${completedDate ? `<div class="completed-okr-date">COMPLETED ${completedDate}</div>` : ''}
          </div>
          <button class="btn-icon restore-btn" data-action="restore-okr" data-okr-id="${okr.id}" title="Restore to active">↩</button>
          <button class="btn-icon" data-action="delete-okr" data-okr-id="${okr.id}" title="Delete permanently">✕</button>
        </div>`;
      }).join('');
    } else {
      section.setAttribute('hidden', '');
    }
  }
 
  /* ══════════════════════════════════════════════
     RENDER — FOCUS PANEL
  ══════════════════════════════════════════════ */
  function renderFocusPanel() {
    const panel = document.getElementById('focus-panel');
 
    if (!state.focusKpiId) {
      panel.innerHTML = `<div class="focus-empty"><div class="focus-empty-label">NO TARGET LOCKED</div><div class="focus-empty-sub">Select a KPI to begin execution.</div></div>`;
      document.querySelector('.focus-ghost-ring')?.remove();
      return;
    }
 
    const found = findKpi(state.focusKpiId);
    if (!found) { state.focusKpiId = null; renderFocusPanel(); return; }
 
    const { okr, kpi } = found;
    const days = daysUntil(okr.deadline);
    const pct  = kpiPercent(kpi);
    const pctComplete = pct >= 100;
 
    let actionHtml;
    if (kpi.type === 'hours') {
      actionHtml = `<div class="focus-action">
        <div class="action-header"><span class="action-label">LOG HOURS</span></div>
        <div class="hours-form">
          <input type="number" class="hours-input" id="log-hours-input"
                 placeholder="0.0" min="0.1" step="0.5" max="24"/>
          <button class="btn btn-accent" id="btn-log-hours">LOG HOURS</button>
        </div>
      </div>`;
    } else {
      const items = kpi.tasks.length
        ? kpi.tasks.map(t => {
            const descHtml = t.description ? `<div class="task-desc-text">${escHtml(t.description)}</div>` : '';
            return `<div class="task-item ${t.done?'done':''}" data-task-id="${t.id}" role="listitem">
              <div class="task-checkbox" data-action="toggle-task" data-task-id="${t.id}" role="checkbox" aria-checked="${t.done}" tabindex="0">${t.done?'✓':''}</div>
              <div class="task-body">
                <div class="task-title-text" data-action="toggle-task" data-task-id="${t.id}">${escHtml(t.title)}</div>
                ${descHtml}
              </div>
              <div class="task-actions">
                <button class="btn-icon" data-action="rename-task" data-task-id="${t.id}" title="Edit">✎</button>
                <button class="btn-icon" data-action="delete-task" data-task-id="${t.id}" title="Delete">✕</button>
              </div>
            </div>`;
          }).join('')
        : `<div class="tasks-empty">No tasks yet. Add one above.</div>`;
      actionHtml = `<div class="focus-action">
        <div class="action-header">
          <span class="action-label">TASKS</span>
          <button class="btn btn-ghost btn-sm" id="btn-open-task-modal">+ TASK</button>
        </div>
        <div class="task-list" id="task-list" role="list">${items}</div>
      </div>`;
    }
 
    const velocityHtml = renderVelocity(kpi, okr);
 
    panel.innerHTML = `<div class="focus-content">
      <div class="focus-meta">
        <span class="meta-tag">${escHtml(okr.title)}</span>
        <span class="urgency-tag ${urgencyClass(days)}">${urgencyLabel(days)}</span>
      </div>
      <h1 class="focus-title">${escHtml(kpi.title)}</h1>
      <div class="focus-progress">
        <div class="progress-stats">
          <span class="progress-pct ${pctComplete?'complete':''}">${pct}%</span>
          <span class="progress-detail">${kpiDetail(kpi)}</span>
        </div>
        <div class="progress-bar-wrap" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
          <div class="progress-bar-fill ${pctComplete?'complete':''}" style="width:${pct}%"></div>
        </div>
        ${velocityHtml}
      </div>
      ${actionHtml}
    </div>`;
 
    // Inject ghost ring after DOM settles
    requestAnimationFrame(() => injectGhostRing(pct));
  }
 
  /* ══════════════════════════════════════════════
     RENDER — DASHBOARD
  ══════════════════════════════════════════════ */
  function renderDashboard() {
    const container = document.getElementById('dashboard-inner');
    if (!state.okrs.length) {
      container.innerHTML = `<div class="sidebar-empty" style="padding:60px 0;font-size:14px">No data yet. Create an OKR to see your dashboard.</div>`;
      return;
    }
 
    const allOkrs    = state.okrs;
    const activeOkrs = allOkrs.filter(o => !o.completed);
    const doneOkrs   = allOkrs.filter(o => o.completed);
    const totalKpis  = allOkrs.reduce((a,o) => a + o.kpis.length, 0);
    const totalHours = allOkrs.reduce((a,o) => a + o.kpis.filter(k=>k.type==='hours').reduce((b,k)=>b+k.progress,0), 0);
    const totalTasks = allOkrs.reduce((a,o) => a + o.kpis.filter(k=>k.type==='tasks').reduce((b,k)=>b+k.tasks.filter(t=>t.done).length,0), 0);
    const overallPct = allOkrs.length ? Math.round(allOkrs.reduce((a,o)=>a+okrPercent(o),0)/allOkrs.length) : 0;
 
    const macroHtml = `<div class="dash-macro">
      <div class="dash-stat">
        <div class="dash-stat-label">OVERALL PROGRESS</div>
        <div class="dash-stat-value">${overallPct}<span>%</span></div>
        <div class="dash-stat-sub">${allOkrs.length} objective${allOkrs.length!==1?'s':''} · ${doneOkrs.length} completed</div>
      </div>
      <div class="dash-stat">
        <div class="dash-stat-label">HOURS LOGGED</div>
        <div class="dash-stat-value">${Math.round(totalHours*10)/10}<span>h</span></div>
        <div class="dash-stat-sub">${totalKpis} KPI${totalKpis!==1?'s':''} tracked</div>
      </div>
      <div class="dash-stat">
        <div class="dash-stat-label">TASKS COMPLETED</div>
        <div class="dash-stat-value">${totalTasks}</div>
        <div class="dash-stat-sub">tasks done</div>
      </div>
      <div class="dash-stat">
        <div class="dash-stat-label">OKRs ON TRACK</div>
        <div class="dash-stat-value">${activeOkrs.filter(o=>daysUntil(o.deadline)>=0).length}<span>/${activeOkrs.length}</span></div>
        <div class="dash-stat-sub">${activeOkrs.filter(o=>daysUntil(o.deadline)<0).length} overdue · ${doneOkrs.length} archived</div>
      </div>
    </div>`;
 
    const okrCards = allOkrs.map(okr => {
      const days  = daysUntil(okr.deadline);
      const pct   = okrPercent(okr);
      const isDone = okr.completed;
 
      const kpiListHtml = okr.kpis.length
        ? okr.kpis.map(kpi => {
            const p   = kpiPercent(kpi);
            const cls = p >= 100 ? 'complete' : p > 0 ? 'progress' : 'empty';
            return `<div class="dash-kpi-item">
              <div class="dash-kpi-row">
                <div class="dash-kpi-name" title="${escHtml(kpi.title)}">${escHtml(kpi.title)}</div>
                <div class="dash-kpi-pct">${p}%</div>
              </div>
              <div class="dash-kpi-bar-wrap">
                <div class="dash-kpi-bar-fill ${cls}" style="width:${p}%"></div>
              </div>
              <div class="dash-kpi-detail">${kpiDetail(kpi)}</div>
            </div>`;
          }).join('')
        : `<div class="dash-kpi-empty">No KPIs yet</div>`;
 
      const deadlineLabel = isDone
        ? `COMPLETED ${okr.completed_at ? formatDate(okr.completed_at.slice(0,10)) : ''}`
        : `${formatDate(okr.deadline)} · ${urgencyLabel(days)}`;
      const deadlineCls = isDone ? 'done' : urgencyClass(days);
 
      return `<div class="dash-okr-card ${isDone?'is-complete':''}">
        <div class="dash-okr-head">
          <div class="dash-okr-ring">${ringsvg(pct, 52, 4)}</div>
          <div class="dash-okr-meta">
            <div class="dash-okr-name">${escHtml(okr.title)}</div>
            <div class="dash-okr-deadline ${deadlineCls}">${deadlineLabel}</div>
          </div>
        </div>
        <div class="dash-kpi-list">${kpiListHtml}</div>
      </div>`;
    }).join('');
 
    container.innerHTML = `
      ${macroHtml}
      <div class="dash-year-section">
        <div class="dash-section-title">OKR COMPLETION OVERVIEW</div>
        <div class="dash-chart-wrap">${buildBarChart()}</div>
      </div>
      <div>
        <div class="dash-section-title">OBJECTIVE BREAKDOWN</div>
        <div class="dash-okr-grid">${okrCards}</div>
      </div>`;
  }
 
  function buildBarChart() {
    if (!state.okrs.length) return '';
    const rowH=36, labelW=180, barW=360, padX=16, padY=12;
    const totalH = state.okrs.length * rowH + padY * 2;
    const totalW = labelW + barW + 56 + padX * 2;
 
    const rows = state.okrs.map((okr, i) => {
      const pct   = okrPercent(okr);
      const y     = padY + i * rowH + rowH / 2;
      const fill  = okr.completed ? 'var(--green)' : pct >= 100 ? 'var(--green)' : 'var(--accent)';
      const bFill = Math.round((pct / 100) * barW);
      const days  = daysUntil(okr.deadline);
      const lblClr = okr.completed ? 'var(--green)' : days < 0 ? 'var(--accent)' : 'var(--text-sec)';
      const label  = okr.title.length > 22 ? okr.title.slice(0,21)+'…' : okr.title;
      return `
        <text x="${padX}" y="${y+5}" font-size="11" fill="${lblClr}" font-family="var(--font-mono)">${escHtml(label)}</text>
        <rect x="${padX+labelW}" y="${y-7}" width="${barW}" height="14" rx="2" fill="var(--elevated)" stroke="var(--border)" stroke-width="1"/>
        ${bFill>0?`<rect x="${padX+labelW}" y="${y-7}" width="${bFill}" height="14" rx="2" fill="${fill}" opacity=".9"/>`:''}
        <text x="${padX+labelW+barW+10}" y="${y+5}" font-size="11" font-family="var(--font-mono)" font-weight="700"
          fill="${pct>=100?'var(--green)':'var(--text-pri)'}">${pct}%</text>`;
    }).join('');
 
    return `<svg viewBox="0 0 ${totalW} ${totalH}" xmlns="http://www.w3.org/2000/svg"
      style="width:100%;max-width:${totalW}px;display:block;overflow:visible">${rows}</svg>`;
  }
 
  /* ══════════════════════════════════════════════
     MASTER RENDER
  ══════════════════════════════════════════════ */
  function render() {
    renderSidebar();
    renderFocusPanel();
    if (currentView === 'dashboard') renderDashboard();
  }
 
  /* ══════════════════════════════════════════════
     LOADING OVERLAY
  ══════════════════════════════════════════════ */
  function showLoading(show) {
    let ov = document.getElementById('loading-overlay');
    if (show && !ov) {
      ov = document.createElement('div'); ov.id='loading-overlay';
      ov.innerHTML=`<div class="loading-box"><span class="loading-label">LOADING DATA...</span></div>`;
      document.body.appendChild(ov);
    } else if (!show && ov) ov.remove();
  }
 
  /* ══════════════════════════════════════════════
     MODAL SYSTEM
  ══════════════════════════════════════════════ */
  function openModal(id) {
    const el=document.getElementById(id); if(!el) return;
    el.removeAttribute('hidden');
    const f=el.querySelector('input,select,textarea,button:not(.modal-close)');
    if(f) setTimeout(()=>f.focus(),50);
  }
  function closeModal(id) { document.getElementById(id)?.setAttribute('hidden',''); clearFormErrors(); }
  function closeAllModals() { document.querySelectorAll('.modal-overlay').forEach(m=>m.setAttribute('hidden','')); clearFormErrors(); }
  function clearFormErrors() {
    document.querySelectorAll('.form-error').forEach(e=>e.textContent='');
    document.querySelectorAll('.form-input').forEach(i=>i.classList.remove('has-error'));
  }
  function showError(inputId, errId, msg) {
    document.getElementById(inputId)?.classList.add('has-error');
    const e=document.getElementById(errId); if(e) e.textContent=msg;
  }
  function populateOkrSelect() {
    const sel=document.getElementById('kpi-okr');
    sel.innerHTML='<option value="">— Select OKR —</option>';
    state.okrs.filter(o=>!o.completed).forEach(o=>{const opt=document.createElement('option');opt.value=o.id;opt.textContent=o.title;sel.appendChild(opt);});
  }
  function populateFocusModal() {
    const list=document.getElementById('focus-list');
    const all=state.okrs.filter(o=>!o.completed).flatMap(o=>o.kpis.map(k=>({okr:o,kpi:k})));
    if(!all.length){list.innerHTML=`<div class="focus-list-empty">No active KPIs.</div>`;return;}
    list.innerHTML=all.map(({okr,kpi})=>`
      <div class="focus-select-item ${kpi.id===state.focusKpiId?'selected':''}"
           data-action="set-focus" data-kpi-id="${kpi.id}" role="listitem" tabindex="0">
        <div class="focus-select-kpi">${escHtml(kpi.title)}</div>
        <div class="focus-select-okr">${escHtml(okr.title)}</div>
      </div>`).join('');
  }
 
  /* ══════════════════════════════════════════════
     CONFIRM + RENAME
  ══════════════════════════════════════════════ */
  let _confirmCb=null;
  function showConfirm(msg,cb){document.getElementById('confirm-message').textContent=msg;_confirmCb=cb;openModal('modal-confirm');}
 
  let _renameCb=null;
  function openRename(label,current,onSave){
    document.getElementById('modal-rename-title').textContent=`RENAME ${label}`;
    document.getElementById('rename-label').textContent=`NEW ${label} NAME`;
    const inp=document.getElementById('rename-input');
    inp.value=current; _renameCb=onSave; clearFormErrors();
    openModal('modal-rename'); setTimeout(()=>inp.select(),60);
  }
 
  /* ══════════════════════════════════════════════
     EXPORT
  ══════════════════════════════════════════════ */
  function exportData() {
    const blob=new Blob([JSON.stringify({
      exported_at:new Date().toISOString(), focus_kpi_id:state.focusKpiId,
      okrs:state.okrs.map(o=>({id:o.id,title:o.title,deadline:o.deadline,completed:o.completed,completed_at:o.completed_at,
        kpis:o.kpis.map(k=>({id:k.id,title:k.title,type:k.type,target:k.target,progress:k.progress,
          tasks:k.tasks.map(t=>({id:t.id,title:t.title,description:t.description||'',done:t.done}))}))}))}
    ,null,2)],{type:'application/json'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);
    a.download=`eyph-export-${new Date().toISOString().slice(0,10)}.json`;a.click();
    URL.revokeObjectURL(a.href);
  }
 
  /* ══════════════════════════════════════════════
     CRUD — OKR
  ══════════════════════════════════════════════ */
  async function createOkr(title,deadline){
    setSyncStatus('saving');
    try{const[row]=await dbQuery('okrs',{method:'POST',body:JSON.stringify({title:title.trim(),deadline,completed:false})});
    state.okrs.push({...row,kpis:[]});render();setSyncStatus('synced');}
    catch(e){console.error(e);setSyncStatus('error');}
  }
  async function deleteOkr(okrId){
    setSyncStatus('saving');
    try{
      const okr=state.okrs.find(o=>o.id===okrId);
      if(okr?.kpis.some(k=>k.id===state.focusKpiId)){state.focusKpiId=null;await saveFocus(null);}
      await dbQuery(`okrs?id=eq.${okrId}`,{method:'DELETE'});
      state.okrs=state.okrs.filter(o=>o.id!==okrId);render();setSyncStatus('synced');
    }catch(e){console.error(e);setSyncStatus('error');}
  }
  async function renameOkr(id,title){
    setSyncStatus('saving');
    try{await dbQuery(`okrs?id=eq.${id}`,{method:'PATCH',body:JSON.stringify({title})});
    const o=state.okrs.find(o=>o.id===id);if(o)o.title=title;render();setSyncStatus('synced');}
    catch(e){console.error(e);setSyncStatus('error');}
  }
  async function completeOkr(okrId){
    setSyncStatus('saving');
    try{
      const now=new Date().toISOString();
      await dbQuery(`okrs?id=eq.${okrId}`,{method:'PATCH',body:JSON.stringify({completed:true,completed_at:now})});
      const okr=state.okrs.find(o=>o.id===okrId);
      if(okr){okr.completed=true;okr.completed_at=now;}
      // Clear focus if it belonged to this OKR
      if(okr?.kpis.some(k=>k.id===state.focusKpiId)){state.focusKpiId=null;await saveFocus(null);}
      render();setSyncStatus('synced');
    }catch(e){console.error(e);setSyncStatus('error');}
  }
  async function restoreOkr(okrId){
    setSyncStatus('saving');
    try{
      await dbQuery(`okrs?id=eq.${okrId}`,{method:'PATCH',body:JSON.stringify({completed:false,completed_at:null})});
      const okr=state.okrs.find(o=>o.id===okrId);
      if(okr){okr.completed=false;okr.completed_at=null;}
      render();setSyncStatus('synced');
    }catch(e){console.error(e);setSyncStatus('error');}
  }
 
  /* ══════════════════════════════════════════════
     CRUD — KPI
  ══════════════════════════════════════════════ */
  async function createKpi(okrId,title,type,target){
    setSyncStatus('saving');
    try{const[row]=await dbQuery('kpis',{method:'POST',body:JSON.stringify({okr_id:okrId,title:title.trim(),type,target:type==='hours'?Number(target):0,progress:0})});
    const okr=state.okrs.find(o=>o.id===okrId);if(okr)okr.kpis.push({...row,tasks:[]});
    if(!state.focusKpiId){state.focusKpiId=row.id;await saveFocus(row.id);}
    render();setSyncStatus('synced');}catch(e){console.error(e);setSyncStatus('error');}
  }
  async function deleteKpi(okrId,kpiId){
    setSyncStatus('saving');
    try{if(kpiId===state.focusKpiId){state.focusKpiId=null;await saveFocus(null);}
    await dbQuery(`kpis?id=eq.${kpiId}`,{method:'DELETE'});
    const okr=state.okrs.find(o=>o.id===okrId);if(okr)okr.kpis=okr.kpis.filter(k=>k.id!==kpiId);
    render();setSyncStatus('synced');}catch(e){console.error(e);setSyncStatus('error');}
  }
  async function renameKpi(id,title){
    setSyncStatus('saving');
    try{await dbQuery(`kpis?id=eq.${id}`,{method:'PATCH',body:JSON.stringify({title})});
    const f=findKpi(id);if(f)f.kpi.title=title;render();setSyncStatus('synced');}
    catch(e){console.error(e);setSyncStatus('error');}
  }
 
  /* ══════════════════════════════════════════════
     CRUD — HOURS
  ══════════════════════════════════════════════ */
  async function logHours(hours){
    const f=findKpi(state.focusKpiId);if(!f)return;
    setSyncStatus('saving');
    try{const p=Math.round((f.kpi.progress+hours)*100)/100;
    await dbQuery(`kpis?id=eq.${f.kpi.id}`,{method:'PATCH',body:JSON.stringify({progress:p})});
    f.kpi.progress=p;render();setSyncStatus('synced');}catch(e){console.error(e);setSyncStatus('error');}
  }
 
  /* ══════════════════════════════════════════════
     CRUD — TASKS
  ══════════════════════════════════════════════ */
  async function addTask(title,description){
    const f=findKpi(state.focusKpiId);if(!f||f.kpi.type!=='tasks')return;
    setSyncStatus('saving');
    try{const[row]=await dbQuery('tasks',{method:'POST',body:JSON.stringify({kpi_id:f.kpi.id,title:title.trim(),description:description||'',done:false})});
    f.kpi.tasks.push(row);render();setSyncStatus('synced');}catch(e){console.error(e);setSyncStatus('error');}
  }
  async function toggleTask(taskId){
    const f=findKpi(state.focusKpiId);if(!f)return;
    const task=f.kpi.tasks.find(t=>t.id===taskId);if(!task)return;
    setSyncStatus('saving');
    try{const done=!task.done;
    await dbQuery(`tasks?id=eq.${taskId}`,{method:'PATCH',body:JSON.stringify({done})});
    task.done=done;f.kpi.progress=f.kpi.tasks.filter(t=>t.done).length;
    await dbQuery(`kpis?id=eq.${f.kpi.id}`,{method:'PATCH',body:JSON.stringify({progress:f.kpi.progress})});
    render();setSyncStatus('synced');}catch(e){console.error(e);setSyncStatus('error');}
  }
  async function renameTask(taskId,title){
    const f=findKpi(state.focusKpiId);if(!f)return;
    setSyncStatus('saving');
    try{await dbQuery(`tasks?id=eq.${taskId}`,{method:'PATCH',body:JSON.stringify({title})});
    const t=f.kpi.tasks.find(t=>t.id===taskId);if(t)t.title=title;render();setSyncStatus('synced');}
    catch(e){console.error(e);setSyncStatus('error');}
  }
  async function deleteTask(taskId){
    const f=findKpi(state.focusKpiId);if(!f)return;
    setSyncStatus('saving');
    try{await dbQuery(`tasks?id=eq.${taskId}`,{method:'DELETE'});
    f.kpi.tasks=f.kpi.tasks.filter(t=>t.id!==taskId);
    f.kpi.progress=f.kpi.tasks.filter(t=>t.done).length;
    await dbQuery(`kpis?id=eq.${f.kpi.id}`,{method:'PATCH',body:JSON.stringify({progress:f.kpi.progress})});
    render();setSyncStatus('synced');}catch(e){console.error(e);setSyncStatus('error');}
  }
 
  /* ══════════════════════════════════════════════
     FOCUS
  ══════════════════════════════════════════════ */
  async function saveFocus(kpiId){await dbQuery(`app_settings?key=eq.focus_kpi_id`,{method:'PATCH',body:JSON.stringify({value:kpiId})});}
  async function setFocus(kpiId){
    setSyncStatus('saving');
    try{state.focusKpiId=kpiId;await saveFocus(kpiId);render();setSyncStatus('synced');}
    catch(e){console.error(e);setSyncStatus('error');}
  }
 
  /* ══════════════════════════════════════════════
     FORM HANDLERS
  ══════════════════════════════════════════════ */
  async function handleOkrSubmit(e){
    e.preventDefault();clearFormErrors();
    const title=document.getElementById('okr-title').value.trim();
    const deadline=document.getElementById('okr-deadline').value;
    let ok=true;
    if(!title){showError('okr-title','okr-title-error','Title is required.');ok=false;}
    if(!deadline){showError('okr-deadline','okr-deadline-error','Deadline is required.');ok=false;}
    if(!ok)return;
    document.getElementById('form-okr').reset();closeModal('modal-okr');
    await createOkr(title,deadline);
  }
  async function handleKpiSubmit(e){
    e.preventDefault();clearFormErrors();
    const okrId=document.getElementById('kpi-okr').value;
    const title=document.getElementById('kpi-title').value.trim();
    const type=document.getElementById('kpi-type').value;
    const target=document.getElementById('kpi-target').value;
    let ok=true;
    if(!okrId){showError('kpi-okr','kpi-okr-error','Select an OKR.');ok=false;}
    if(!title){showError('kpi-title','kpi-title-error','KPI title is required.');ok=false;}
    if(type==='hours'&&(!target||Number(target)<=0)){showError('kpi-target','kpi-target-error','Enter a positive target.');ok=false;}
    if(!ok)return;
    document.getElementById('form-kpi').reset();
    document.getElementById('kpi-type').value='hours';
    document.querySelectorAll('.type-btn').forEach(b=>b.classList.toggle('active',b.dataset.type==='hours'));
    document.getElementById('kpi-target-group').style.display='';
    closeModal('modal-kpi');
    await createKpi(okrId,title,type,target);
  }
  async function handleTaskSubmit(e){
    e.preventDefault();clearFormErrors();
    const title=document.getElementById('task-title').value.trim();
    const desc=document.getElementById('task-desc').value.trim();
    if(!title){showError('task-title','task-title-error','Task title is required.');return;}
    document.getElementById('form-task').reset();closeModal('modal-task');
    await addTask(title,desc);
  }
 
  /* ══════════════════════════════════════════════
     EVENTS
  ══════════════════════════════════════════════ */
  function initEvents(){
    // View toggle
    document.getElementById('btn-view-focus').addEventListener('click',()=>switchView('focus'));
    document.getElementById('btn-view-dashboard').addEventListener('click',()=>switchView('dashboard'));
 
    // Header
    document.getElementById('btn-open-okr-modal').addEventListener('click',()=>{clearFormErrors();document.getElementById('form-okr').reset();openModal('modal-okr');});
    document.getElementById('btn-open-kpi-modal').addEventListener('click',()=>{
      if(!state.okrs.filter(o=>!o.completed).length){alert('Create at least one active OKR first.');return;}
      populateOkrSelect();clearFormErrors();document.getElementById('form-kpi').reset();
      document.getElementById('kpi-type').value='hours';
      document.querySelectorAll('.type-btn').forEach(b=>b.classList.toggle('active',b.dataset.type==='hours'));
      document.getElementById('kpi-target-group').style.display='';
      openModal('modal-kpi');
    });
    document.getElementById('btn-open-focus-modal').addEventListener('click',()=>{populateFocusModal();openModal('modal-focus');});
    document.getElementById('btn-export').addEventListener('click',exportData);
 
    // Forms
    document.getElementById('form-okr').addEventListener('submit',handleOkrSubmit);
    document.getElementById('form-kpi').addEventListener('submit',handleKpiSubmit);
    document.getElementById('form-task').addEventListener('submit',handleTaskSubmit);
    document.getElementById('form-rename').addEventListener('submit',async e=>{
      e.preventDefault();
      const val=document.getElementById('rename-input').value.trim();
      if(!val){showError('rename-input','rename-error','Name cannot be empty.');return;}
      if(typeof _renameCb==='function'){closeModal('modal-rename');await _renameCb(val);_renameCb=null;}
    });
 
    // KPI type toggle
    document.querySelector('.type-toggle').addEventListener('click',e=>{
      const btn=e.target.closest('.type-btn');if(!btn)return;
      const type=btn.dataset.type;
      document.getElementById('kpi-type').value=type;
      document.querySelectorAll('.type-btn').forEach(b=>b.classList.toggle('active',b===btn));
      document.getElementById('kpi-target-group').style.display=type==='hours'?'':'none';
    });
 
    // Modal close
    document.body.addEventListener('click',e=>{const b=e.target.closest('[data-close]');if(b)closeModal(b.dataset.close);});
    document.querySelectorAll('.modal-overlay').forEach(ov=>ov.addEventListener('click',e=>{if(e.target===ov)closeModal(ov.id);}));
    document.addEventListener('keydown',e=>{
      if(e.key==='Escape')closeAllModals();
      if(e.key==='f'&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!['INPUT','SELECT','TEXTAREA'].includes(document.activeElement?.tagName)){
        populateFocusModal();openModal('modal-focus');
      }
    });
 
    // Confirm
    document.getElementById('btn-confirm-delete').addEventListener('click',()=>{
      if(typeof _confirmCb==='function'){_confirmCb();_confirmCb=null;}closeModal('modal-confirm');
    });
 
    // Completed archive toggle
    document.getElementById('btn-toggle-completed').addEventListener('click',()=>{
      completedOpen=!completedOpen;
      const list=document.getElementById('completed-list');
      const chev=document.getElementById('completed-chevron');
      const btn=document.getElementById('btn-toggle-completed');
      list.hidden=!completedOpen;
      chev.classList.toggle('open',completedOpen);
      btn.setAttribute('aria-expanded',completedOpen);
    });
 
    // Sidebar delegation
    document.getElementById('okr-list').addEventListener('click',e=>{
      const dOkr=e.target.closest('[data-action="delete-okr"]');
      if(dOkr){const o=state.okrs.find(o=>o.id===dOkr.dataset.okrId);if(o)showConfirm(`Delete OKR "${o.title}"? All KPIs will be removed.`,()=>deleteOkr(o.id));return;}
      const dKpi=e.target.closest('[data-action="delete-kpi"]');
      if(dKpi){const f=findKpi(dKpi.dataset.kpiId);if(f)showConfirm(`Delete KPI "${f.kpi.title}"?`,()=>deleteKpi(dKpi.dataset.okrId,dKpi.dataset.kpiId));return;}
      const cOkr=e.target.closest('[data-action="complete-okr"]');
      if(cOkr){const o=state.okrs.find(o=>o.id===cOkr.dataset.okrId);if(o)showConfirm(`Mark "${o.title}" as completed? It will move to the archive.`,()=>completeOkr(o.id));return;}
      const kpiRow=e.target.closest('.kpi-row');
      if(kpiRow&&!e.target.closest('.btn-icon')&&!e.target.closest('[data-action]'))setFocus(kpiRow.dataset.kpiId);
    });
 
    // Completed list delegation (restore + delete)
    document.getElementById('completed-list').addEventListener('click',e=>{
      const restore=e.target.closest('[data-action="restore-okr"]');
      if(restore){restoreOkr(restore.dataset.okrId);return;}
      const del=e.target.closest('[data-action="delete-okr"]');
      if(del){const o=state.okrs.find(o=>o.id===del.dataset.okrId);if(o)showConfirm(`Permanently delete "${o.title}"?`,()=>deleteOkr(o.id));}
    });
 
    // Sidebar double-click rename
    document.getElementById('okr-list').addEventListener('dblclick',e=>{
      const rOkr=e.target.closest('[data-action="rename-okr"]');
      if(rOkr){const o=state.okrs.find(o=>o.id===rOkr.dataset.okrId);if(o)openRename('OKR',o.title,t=>renameOkr(o.id,t));return;}
      const rKpi=e.target.closest('[data-action="rename-kpi"]');
      if(rKpi){const f=findKpi(rKpi.dataset.kpiId);if(f)openRename('KPI',f.kpi.title,t=>renameKpi(f.kpi.id,t));}
    });
 
    // Focus panel
    document.getElementById('focus-panel').addEventListener('click',e=>{
      if(e.target.id==='btn-log-hours'){
        const inp=document.getElementById('log-hours-input'),val=parseFloat(inp.value);
        if(!val||val<=0){inp.focus();inp.style.borderColor='var(--accent)';setTimeout(()=>inp.style.borderColor='',1000);return;}
        logHours(val);inp.value='';inp.focus();return;
      }
      if(e.target.id==='btn-open-task-modal'){clearFormErrors();document.getElementById('form-task').reset();openModal('modal-task');return;}
      const tog=e.target.closest('[data-action="toggle-task"]');if(tog){toggleTask(tog.dataset.taskId);return;}
      const ren=e.target.closest('[data-action="rename-task"]');
      if(ren){const f=findKpi(state.focusKpiId);const t=f?.kpi.tasks.find(t=>t.id===ren.dataset.taskId);if(t)openRename('TASK',t.title,nv=>renameTask(t.id,nv));return;}
      const del=e.target.closest('[data-action="delete-task"]');
      if(del){const f=findKpi(state.focusKpiId);const t=f?.kpi.tasks.find(t=>t.id===del.dataset.taskId);if(t)showConfirm(`Delete task "${t.title}"?`,()=>deleteTask(t.id));}
    });
    document.getElementById('focus-panel').addEventListener('keydown',e=>{
      if(e.key==='Enter'&&e.target.id==='log-hours-input'){e.preventDefault();document.getElementById('btn-log-hours')?.click();}
      if((e.key==='Enter'||e.key===' ')&&e.target.closest('[data-action="toggle-task"]')){e.preventDefault();toggleTask(e.target.closest('[data-action="toggle-task"]').dataset.taskId);}
    });
 
    // Focus modal
    document.getElementById('focus-list').addEventListener('click',e=>{const i=e.target.closest('[data-action="set-focus"]');if(i){setFocus(i.dataset.kpiId);closeModal('modal-focus');}});
    document.getElementById('focus-list').addEventListener('keydown',e=>{
      if(e.key==='Enter'||e.key===' '){const i=e.target.closest('[data-action="set-focus"]');if(i){e.preventDefault();setFocus(i.dataset.kpiId);closeModal('modal-focus');}}
    });
 
    // Recompute ghost ring on window resize
    window.addEventListener('resize',()=>{
      if(state.focusKpiId){const f=findKpi(state.focusKpiId);if(f)injectGhostRing(kpiPercent(f.kpi));}
    });
  }
 
  /* ══════════════════════════════════════════════
     INIT
  ══════════════════════════════════════════════ */
  async function init(){
    initClock();initEvents();
    setSyncStatus('connecting');showLoading(true);
    try{await dbLoadAll();setSyncStatus('synced');}
    catch(e){console.error('EYPH init:',e);setSyncStatus('error');}
    finally{showLoading(false);}
    render();
  }
 
  return{init};
})();
 
document.addEventListener('DOMContentLoaded',APP.init);
 