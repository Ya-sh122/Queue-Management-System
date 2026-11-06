const main = document.querySelector('#main-content');
const loginView = document.querySelector('#login-view');
const appView = document.querySelector('#app-view');
let manager = null;
let currentQueue = null;
let pendingCancel = null;
let days = 7;
let search = '';
let toastTimer;
let routeVersion = 0;
let busy = false;
let refreshing = false;

function icon(name) {
  return `<svg class="icon" aria-hidden="true">
      <use href="#i-${name}"/>
      </svg>`;
}

// escape user text before placing it inside html
function escapeText(value) {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (letter) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[letter]
  );
}

function initials(name) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
}

function tokenNumber(number) {
  return `T-${String(number).padStart(3, '0')}`;
}

function minutesSince(date) {
  return Math.max(0, Math.floor((Date.now() - new Date(date)) / 60000));
}

function timeAgo(date) {
  const minutes = minutesSince(date);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 1440)}d ago`;
}

function duration(minutes) {
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function periodName() {
  return days === 1 ? 'last 24 hours' : `last ${days} days`;
}

function showToast(message, error = false) {
  const toast = document.querySelector('#toast');
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.toggle('error', error);
  toast.hidden = false;
  toastTimer = setTimeout(() => {
    toast.hidden = true;
  }, 4200);
}

async function api(url, method = 'GET', body) {
  const response = await fetch(`/api${url}`, {
    method,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401 && !['/auth/login', '/auth/register'].includes(url)) showLogin();
    throw new Error(data.message || 'Request failed. Please try again.');
  }
  return data;
}

function showLogin() {
  manager = null;
  routeVersion++;
  appView.hidden = true;
  loginView.hidden = false;
  setAuthMode('login');
  for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
}

function showApp(person) {
  manager = person;
  loginView.hidden = true;
  appView.hidden = false;
  document.querySelector('#profile-name').textContent = person.name;
  document.querySelector('#profile-avatar').textContent = initials(person.name);
  document.querySelector('#top-avatar').textContent = initials(person.name);
  document.querySelector('#login-form').reset();
  document.querySelector('#register-form').reset();
  document.querySelector('#password').type = 'password';
  document.querySelector('#register-password').type = 'password';
  document.querySelector('#show-password').textContent = 'Show';
  document.querySelector('#show-password').setAttribute('aria-label', 'Show password');
  document.querySelector('#show-register-password').textContent = 'Show';
  document
    .querySelector('#show-register-password')
    .setAttribute('aria-label', 'Show registration password');
  renderPage();
}

function periodSelect() {
  return `<select class="period-select" id="period-select" aria-label="Analytics time range">
      <option value="1" ${days === 1 ? 'selected' : ''}>Last 24 hours</option>
      <option value="7" ${days === 7 ? 'selected' : ''}>Last 7 days</option>
      <option value="30" ${days === 30 ? 'selected' : ''}>Last 30 days</option>
      </select>`;
}

function statsCards(stats) {
  return `<div class="stats-grid">
    <div class="stat-card">
      <div class="stat-head">People waiting <span class="stat-icon">${icon('people')}</span>
      </div>
      <div class="stat-value">${stats.waiting}</div>
      <div class="stat-foot">
      <span class="live-dot">
      </span> Across all queues · live</div>
      </div>
    <div class="stat-card">
      <div class="stat-head">Average wait time <span class="stat-icon amber">${icon('clock')}</span>
      </div>
      <div class="stat-value">${stats.averageWait}<small>min</small>
      </div>
      <div class="stat-foot">Before service · ${periodName()}</div>
      </div>
    <div class="stat-card">
      <div class="stat-head">People served <span class="stat-icon blue">${icon('check')}</span>
      </div>
      <div class="stat-value">${stats.completed}</div>
      <div class="stat-foot">
      <span class="positive">Completed</span> in the ${periodName()}</div>
      </div>
    <div class="stat-card">
      <div class="stat-head">Total queues <span class="stat-icon purple">${icon('queue')}</span>
      </div>
      <div class="stat-value">${stats.queues}</div>
      <div class="stat-foot">${stats.serving} currently serving</div>
      </div>
  </div>`;
}

function chart(trend) {
  const max = Math.max(4, ...trend.map((point) => point.count));
  const top = Math.ceil(max / 4) * 4;
  const x = (index) => 35 + (index * 555) / (trend.length - 1);
  const y = (value) => 164 - (value / top) * 135;
  const points = trend.map((point, index) => `${x(index)},${y(point.count)}`).join(' ');
  const path = `M ${points.replaceAll(' ', ' L ')}`;
  let lines = '';
  for (let index = 0; index < 5; index++) {
    const value = (top * index) / 4;
    lines += `<line x1="35" x2="590" y1="${y(value)}" y2="${y(value)}" stroke="#354454" stroke-dasharray="3 4"/>
      <text x="23" y="${y(value) + 3}" text-anchor="end">${value}</text>`;
  }
  const step = Math.ceil((trend.length - 1) / 6);
  const labels = trend
    .map((point, index) => {
      if (index % step !== 0 && index !== trend.length - 1) return '';
      const date = new Date(point.at);
      const label =
        days === 1
          ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
          : date.toLocaleDateString([], { month: 'short', day: 'numeric' });
      return `<text x="${x(index)}" y="188" text-anchor="${index === 0 ? 'start' : index === trend.length - 1 ? 'end' : 'middle'}">${label}</text>`;
    })
    .join('');
  return `<svg class="trend-chart" viewBox="0 0 610 205" role="img" aria-label="Queue length over the ${periodName()}. Current waiting count: ${trend[trend.length - 1].count}.">
      <defs>
      <linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#78e6b4" stop-opacity=".18"/>
      <stop offset="100%" stop-color="#78e6b4" stop-opacity=".015"/>
      </linearGradient>
      </defs>${lines}<path d="${path} L 590,164 L 35,164 Z" fill="url(#chart-fill)"/>
      <path d="${path}" fill="none" stroke="#78e6b4" stroke-width="2.6" stroke-linejoin="round"/>${trend
        .map(
          (
            point,
            index
          ) => `<circle cx="${x(index)}" cy="${y(point.count)}" r="3" fill="#161d26" stroke="#78e6b4" stroke-width="1.5">
      <title>${escapeText(new Date(point.at).toLocaleString())}: ${point.count} waiting</title>
      </circle>`
        )
        .join('')}${labels}</svg>`;
}

function trendPanel(data) {
  return `<section class="panel">
      <div class="panel-heading">
      <div>
      <h3>Queue length over time</h3>
      <p>Number of people waiting across all your queues.</p>
      </div>${periodSelect()}</div>
      <div class="chart-legend">
      <span>
      </span> People waiting</div>
      <div class="chart-container">${chart(data.trend)}</div>
      <div class="chart-footer">${icon('info')} Waiting counts at sampled times. Scroll the chart on small screens.</div>
      </section>`;
}

function activityPanel(recent) {
  const verbs = {
    joined: 'joined the queue',
    called: 'called for service',
    completed: 'service completed',
    cancelled: 'token cancelled'
  };
  const icons = { joined: 'plus', called: 'arrow', completed: 'check', cancelled: 'close' };
  return `<section class="panel activity-panel">
      <div class="panel-heading">
      <h3>Recent activity</h3>
      <span class="badge green">
      <span class="live-dot">
      </span> Live</span>
      </div>
      <div class="activity-list">${
        recent
          .slice(0, 5)
          .map(
            (item) =>
              `<div class="activity-item">
      <span class="activity-dot ${item.type}">${icon(icons[item.type])}</span>
      <div class="activity-detail">
      <div class="activity-title">
      <b>${tokenNumber(item.number)}</b> ${verbs[item.type]}</div>
      <div class="activity-subtitle">
      <span>${escapeText(item.queue)}</span>
      <span>${timeAgo(item.at)}</span>
      </div>
      </div>
      </div>`
          )
          .join('') || '<div class="empty-state"><p>Your queue activity will appear here.</p></div>'
      }</div>
      </section>`;
}

function queueCards(queues) {
  if (!queues.length)
    return `<div class="panel empty-state">${icon('queue')}<h3>No queues yet</h3>
      <p>Create a queue, then add people to start issuing tokens.</p>
      <button class="button primary" data-action="new-queue">${icon('plus')} Create a queue</button>
      </div>`;
  return `<div class="queues-grid">${queues
    .map(
      (queue, index) => `<article class="queue-card">
      <div class="queue-card-top">
      <span class="queue-card-icon ${['', 'blue', 'amber'][index % 3]}">${icon(['queue', 'people', 'check'][index % 3])}</span>
      <span class="badge ${queue.serving ? 'green' : 'gray'}">
      <span class="live-dot">
      </span> ${queue.serving ? 'Serving' : 'Ready'}</span>
      </div>
      <h3>${escapeText(queue.name)}</h3>
      <p>${escapeText(queue.description || 'Manage the waiting list and call the next person.')}</p>
      <div class="queue-card-stats">
      <div>
      <strong>${queue.waiting}</strong>
      <span>Waiting</span>
      </div>
      <div>
      <strong>${queue.serving ? '1' : '0'}</strong>
      <span>In service</span>
      </div>
      <div>
      <strong>${queue.completed}</strong>
      <span>Served</span>
      </div>
      </div>
      <div class="queue-card-bottom">
      <span>${queue.serving ? `Now serving ${tokenNumber(queue.serving.number)}` : 'Ready for the next person'}</span>
      <a class="text-button" href="#queue/${queue._id}">Manage queue ${icon('arrow')}</a>
      </div>
      </article>`
    )
    .join('')}</div>`;
}

async function renderPage(quiet = false) {
  if (!manager) return;
  const version = ++routeVersion;
  const route = location.hash.slice(1) || 'dashboard';
  const section = route.startsWith('queue/') ? 'queues' : route;
  const labels = { dashboard: 'Overview', queues: 'My queues', analytics: 'Analytics' };
  document
    .querySelectorAll('[data-nav]')
    .forEach((link) => link.classList.toggle('active', link.dataset.nav === section));
  document.querySelector('#breadcrumb-current').textContent = labels[section] || 'Overview';
  document.title = `${labels[section] || 'Queue'} · Queueflow`;
  if (!quiet)
    main.innerHTML =
      '<div class="loading"><span class="spinner"></span> Loading your workspace…</div>';
  try {
    if (route.startsWith('queue/')) {
      const id = route.split('/')[1];
      const [result, list] = await Promise.all([
        api(`/queues/${encodeURIComponent(id)}`),
        api('/queues')
      ]);
      if (version !== routeVersion || !manager) return;
      currentQueue = result.queue;
      document.querySelector('#queue-count').textContent = list.queues.length;
      renderQueue();
      return;
    }
    const [list, data] = await Promise.all([api('/queues'), api(`/analytics?days=${days}`)]);
    if (version !== routeVersion || !manager) return;
    currentQueue = null;
    document.querySelector('#queue-count').textContent = list.queues.length;
    if (route === 'analytics') {
      main.innerHTML = `<div class="page-heading">
      <div>
      <div class="greeting-label">PERFORMANCE</div>
      <h1>Queue analytics</h1>
      <p class="subtext">Track waiting times, completed service, and queue activity.</p>
      </div>
      <span class="badge green">
      <span class="live-dot">
      </span> Live data</span>
      </div>
      <div class="analytics-note">${icon('info')} Waiting and service counts are live. Completed, cancelled and average wait metrics use the selected period.</div>${statsCards(data.stats)}${trendPanel(data)}<div class="analytics-bottom">
      <div class="panel mini-stat">
      <p>Tokens created</p>
      <strong>${data.stats.arrivals}</strong>
      <small>In the ${periodName()}</small>
      </div>
      <div class="panel mini-stat">
      <p>Tokens cancelled</p>
      <strong>${data.stats.cancelled}</strong>
      <small>In the ${periodName()}</small>
      </div>
      <div class="panel mini-stat">
      <p>Currently in service</p>
      <strong>${data.stats.serving}</strong>
      <small>One service slot per queue</small>
      </div>
      </div>`;
    } else if (route === 'queues') {
      main.innerHTML = `<div class="page-heading">
      <div>
      <div class="greeting-label">QUEUE MANAGEMENT</div>
      <h1>My queues<span class="inline-count">${list.queues.length}</span>
      </h1>
      <p class="subtext">Create queues and manage each waiting list.</p>
      </div>
      <button class="button primary" data-action="new-queue">${icon('plus')} Create queue</button>
      </div>${queueCards(list.queues)}`;
    } else {
      const hour = new Date().getHours();
      const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
      main.innerHTML = `<div class="page-heading">
      <div>
      <div class="greeting-label">${greeting}, ${escapeText(manager.name.split(' ')[0])}</div>
      <h1>Queue overview</h1>
      <p class="subtext">Monitor waiting lists, manage service, and track queue activity.</p>
      </div>
      <div class="heading-actions">
      <span class="date-label">${icon('clock')}${new Date().toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</span>
      <button class="button primary" data-action="new-queue">${icon('plus')} Create queue</button>
      </div>
      </div>${statsCards(data.stats)}<div class="dashboard-middle">${trendPanel(data)}${activityPanel(data.recent)}</div>
      <div class="section-heading">
      <div>
      <h2>Your queues <span class="inline-count">${list.queues.length}</span>
      </h2>
      <p>Open a queue to add people or call the next token.</p>
      </div>
      <a class="text-button" href="#queues">View all queues ${icon('arrow')}</a>
      </div>${queueCards(list.queues)}`;
    }
  } catch (error) {
    if (version !== routeVersion || !manager) return;
    if (quiet) return;
    main.innerHTML = `<div class="page-error">${icon('info')}<h2>Let's try that again.</h2>
      <p>${escapeText(error.message)}</p>
      <button class="button secondary" data-action="retry">Refresh page</button> <a class="button primary" href="#dashboard">Back to overview</a>
      </div>`;
  }
}

function waitingList() {
  return currentQueue.tokens
    .filter((token) => token.status === 'waiting')
    .sort((a, b) => a.position - b.position);
}

function renderQueue() {
  const queue = currentQueue;
  const waiting = waitingList();
  const serving = queue.tokens.find((token) => token.status === 'in_service');
  const completed = queue.tokens.filter((token) => token.status === 'completed');
  const called = queue.tokens.filter((token) => token.startedAt);
  const average = called.length
    ? Math.round(
        called.reduce(
          (sum, token) => sum + (new Date(token.startedAt) - new Date(token.joinedAt)),
          0
        ) /
          called.length /
          60000
      )
    : 0;
  document.querySelector('#breadcrumb-current').textContent = queue.name;
  document.title = `${queue.name} · Queueflow`;
  main.innerHTML = `<div class="queue-detail-heading">
      <a href="#queues" class="back-link">${icon('back')} Back to my queues</a>
      <div class="page-heading">
      <div>
      <div class="queue-title-row">
      <h1>${escapeText(queue.name)}</h1>
      <span class="badge green">${serving ? 'In service' : 'Ready'}</span>
      </div>
      <p class="subtext">${escapeText(queue.description || 'Add people, update their order, and manage service.')}</p>
      </div>
      <div class="heading-actions">
      <button class="button primary" data-action="new-person">${icon('plus')} Add person</button>
      </div>
      </div>
      </div>
      <div class="queue-metrics">
      <div>${icon('people')}<strong>${waiting.length}</strong>
      <span>waiting now</span>
      </div>
      <div>${icon('clock')}<strong>${average}m</strong>
      <span>avg. wait · all time</span>
      </div>
      <div>${icon('check')}<strong>${completed.length}</strong>
      <span>served · all time</span>
      </div>
      <div>${icon('queue')}<strong>${queue.tokens.length}</strong>
      <span>tokens created</span>
      </div>
      </div>
      <section class="service-panel">
      <div>
      <div class="service-label">
      <span class="live-dot">
      </span> ${serving ? 'NOW SERVING' : 'SERVICE DESK'}</div>${
        serving
          ? `<div class="service-person">
      <span class="service-token">${tokenNumber(serving.number)}</span>
      <div>
      <strong>${escapeText(serving.name)}</strong>
      <small>In service for ${duration(minutesSince(serving.startedAt))}</small>
      </div>
      </div>`
          : '<div class="service-empty">Ready for your next person.</div>'
      }</div>
      <div class="service-actions">${serving ? `<button class="button primary" data-action="complete" data-id="${serving._id}">${icon('check')} Complete service</button>` : `<button class="button primary" data-action="next" ${!waiting.length ? 'disabled' : ''}>Call next person ${icon('arrow')}</button>`}</div>
      </section>
      <section class="panel">
      <div class="table-heading">
      <h3>Waiting list <span class="inline-count">${waiting.length}</span>
      </h3>
      <div class="search-field">${icon('search')}<input type="search" id="token-search" placeholder="Find a person…" aria-label="Find a waiting person" value="${escapeText(search)}">
      </div>
      </div>
      <div class="table-scroll">
      <table>
      <thead>
      <tr>
      <th>POSITION</th>
      <th>TOKEN</th>
      <th>PERSON</th>
      <th>WAIT TIME</th>
      <th>STATUS</th>
      <th>ACTIONS</th>
      </tr>
      </thead>
      <tbody id="waiting-body">
      </tbody>
      </table>
      </div>
      <div class="table-footer">
      <span id="waiting-total">${waiting.length} people in line</span>
      <span>Use the arrows to adjust the order.</span>
      </div>
      </section>${historyTable(queue.tokens)}`;
  renderWaitingRows();
}

function renderWaitingRows() {
  const waiting = waitingList();
  const filtered = waiting.filter((token) =>
    `${token.name} ${tokenNumber(token.number)}`.toLowerCase().includes(search.toLowerCase())
  );
  document.querySelector('#waiting-body').innerHTML =
    filtered
      .map(
        (token) =>
          `<tr>
      <td>${String(token.position).padStart(2, '0')}</td>
      <td class="token-number">${tokenNumber(token.number)}</td>
      <td>
      <div class="person-cell">
      <span class="person-avatar">${escapeText(initials(token.name))}</span>${escapeText(token.name)}</div>
      </td>
      <td>${duration(minutesSince(token.joinedAt))}</td>
      <td>
      <span class="badge amber">Waiting</span>
      </td>
      <td>
      <div class="row-actions">
      <button class="icon-button" data-action="move" data-direction="up" data-id="${token._id}" ${token.position === 1 ? 'disabled' : ''} aria-label="Move ${escapeText(token.name)} up" title="Move up">${icon('up')}</button>
      <button class="icon-button" data-action="move" data-direction="down" data-id="${token._id}" ${token.position === waiting.length ? 'disabled' : ''} aria-label="Move ${escapeText(token.name)} down" title="Move down">${icon('down')}</button>
      <button class="icon-button cancel-button" data-action="cancel" data-id="${token._id}" aria-label="Cancel ${escapeText(token.name)}" title="Cancel token">${icon('close')}<span>Cancel</span></button>
      </div>
      </td>
      </tr>`
      )
      .join('') ||
    `<tr>
      <td colspan="6">
      <div class="empty-state">${icon('people')}<h3>${search ? 'No matching people.' : 'No people waiting'}</h3>
      <p>${search ? 'Try a different name or token number.' : 'Add a person to generate the next token.'}</p>
      </div>
      </td>
      </tr>`;
  document.querySelector('#waiting-total').textContent = search
    ? `${filtered.length} of ${waiting.length} people shown`
    : `${waiting.length} ${waiting.length === 1 ? 'person' : 'people'} in line`;
}

function historyTable(tokens) {
  const history = tokens
    .filter((token) => ['completed', 'cancelled'].includes(token.status))
    .sort(
      (a, b) => new Date(b.completedAt || b.cancelledAt) - new Date(a.completedAt || a.cancelledAt)
    );
  return `<details class="history-section">
      <summary>Completed & cancelled tokens <span class="history-count">(${history.length})</span>
      </summary>
      <div class="panel table-scroll">
      <table>
      <thead>
      <tr>
      <th>TOKEN</th>
      <th>PERSON</th>
      <th>STATUS</th>
      <th>WAIT TIME</th>
      <th>FINISHED AT</th>
      </tr>
      </thead>
      <tbody>${
        history
          .slice(0, 100)
          .map(
            (token) =>
              `<tr>
      <td class="token-number">${tokenNumber(token.number)}</td>
      <td>${escapeText(token.name)}</td>
      <td>
      <span class="badge ${token.status === 'completed' ? 'green' : 'red'}">${token.status === 'completed' ? 'Completed' : 'Cancelled'}</span>
      </td>
      <td>${duration(Math.max(0, Math.floor((new Date(token.startedAt || token.cancelledAt) - new Date(token.joinedAt)) / 60000)))}</td>
      <td>${escapeText(new Date(token.completedAt || token.cancelledAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }))}</td>
      </tr>`
          )
          .join('') ||
        '<tr><td colspan="5" class="empty-state">Finished tokens will appear here.</td></tr>'
      }</tbody>
      </table>${history.length > 100 ? '<div class="table-footer">Showing the latest 100 records. Analytics includes all records.</div>' : ''}</div>
      </details>`;
}

function openDialog(id) {
  const dialog = document.getElementById(id);
  dialog.querySelector('form').reset();
  dialog.querySelector('.form-error').textContent = '';
  dialog.showModal();
}

// allow only one action at a time in this browser tab
async function queueAction(path, body, message) {
  if (busy || !currentQueue) return;
  busy = true;
  const id = currentQueue._id;
  main.querySelectorAll('button').forEach((button) => {
    button.disabled = true;
  });
  try {
    const result = await api(`/queues/${id}${path}`, 'POST', body);
    if (currentQueue && currentQueue._id === id && location.hash === `#queue/${id}`) {
      currentQueue = result.queue;
      renderQueue();
    }
    showToast(message);
  } catch (error) {
    showToast(error.message, true);
    await renderPage(true);
  } finally {
    busy = false;
  }
}

main.addEventListener('click', (event) => {
  const button = event.target.closest('[data-action]');
  if (!button || button.disabled) return;
  const { action, id, direction } = button.dataset;
  if (action === 'new-queue') openDialog('queue-dialog');
  if (action === 'retry') renderPage();
  if (action === 'new-person') openDialog('person-dialog');
  if (action === 'move') queueAction(`/tokens/${id}/move`, { direction }, 'Queue order updated.');
  if (action === 'complete')
    queueAction(`/tokens/${id}/complete`, {}, 'Service completed. Ready for the next person.');
  if (action === 'next') {
    const first = waitingList()[0];
    if (first)
      queueAction(
        '/next',
        { tokenId: first._id },
        `${tokenNumber(first.number)} called for service.`
      );
  }
  if (action === 'cancel') {
    pendingCancel = id;
    const token = currentQueue.tokens.find((token) => token._id === id);
    document.querySelector('#cancel-description').textContent =
      `${tokenNumber(token.number)} · ${token.name} will be removed from the waiting list. Their record will stay in history.`;
    openDialog('cancel-dialog');
  }
});

main.addEventListener('input', (event) => {
  if (event.target.id === 'token-search') {
    search = event.target.value;
    renderWaitingRows();
  }
});

main.addEventListener('change', (event) => {
  if (event.target.id === 'period-select') {
    days = Number(event.target.value);
    renderPage(true);
  }
});

document.querySelectorAll('[data-close]').forEach((button) => {
  button.addEventListener('click', () => document.getElementById(button.dataset.close).close());
});

function setAuthMode(mode) {
  const registering = mode === 'register';
  document.querySelector('#login-form').hidden = registering;
  document.querySelector('#register-form').hidden = !registering;
  document.querySelector('#sign-in-option').classList.toggle('active', !registering);
  document.querySelector('#create-account-option').classList.toggle('active', registering);
  document.querySelector('#sign-in-option').setAttribute('aria-pressed', String(!registering));
  document
    .querySelector('#create-account-option')
    .setAttribute('aria-pressed', String(registering));
  document.querySelector('#auth-title').textContent = registering
    ? 'Create your account'
    : 'Welcome back';
  document.querySelector('#auth-description').textContent = registering
    ? 'Register as a manager. Your queues stay separate from other accounts.'
    : 'Sign in to manage your queues and service desk.';
  document.querySelector('#login-error').textContent = '';
  document.querySelector('#register-error').textContent = '';
  document.title = registering ? 'Create account · Queueflow' : 'Sign in · Queueflow';
}

document.querySelector('#sign-in-option').addEventListener('click', () => setAuthMode('login'));
document
  .querySelector('#create-account-option')
  .addEventListener('click', () => setAuthMode('register'));

document.querySelector('#register-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.target;
  const button = form.querySelector('[type="submit"]');
  const errorText = document.querySelector('#register-error');
  const body = Object.fromEntries(new FormData(form));
  errorText.textContent = '';
  if (body.password !== body.confirmPassword) {
    errorText.textContent = 'The passwords do not match.';
    return;
  }
  if (new TextEncoder().encode(body.password).length > 72) {
    errorText.textContent = 'Your password must be no more than 72 bytes. Try a shorter password.';
    return;
  }
  button.disabled = true;
  try {
    const result = await api('/auth/register', 'POST', body);
    // open the new manager workspace instead of an old queue bookmark
    history.replaceState(null, '', '#dashboard');
    search = '';
    showApp(result.manager);
    showToast('Account created. You can now create your first queue.');
  } catch (error) {
    errorText.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

document.querySelector('#show-register-password').addEventListener('click', (event) => {
  const input = document.querySelector('#register-password');
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  event.target.textContent = show ? 'Hide' : 'Show';
  event.target.setAttribute(
    'aria-label',
    show ? 'Hide registration password' : 'Show registration password'
  );
});

async function loadDemoDetails() {
  try {
    const data = await api('/auth/demo');
    document.querySelector('#demo-note').hidden = !data.enabled;
    if (data.enabled) {
      document.querySelector('#demo-email').textContent = data.email;
      document.querySelector('#demo-password').textContent = data.password;
    }
  } catch (error) {
    document.querySelector('#demo-note').hidden = true;
  }
}

document.querySelector('#login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = event.target.querySelector('[type="submit"]');
  button.disabled = true;
  document.querySelector('#login-error').textContent = '';
  try {
    const result = await api('/auth/login', 'POST', Object.fromEntries(new FormData(event.target)));
    showApp(result.manager);
  } catch (error) {
    document.querySelector('#login-error').textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

document.querySelector('#show-password').addEventListener('click', (event) => {
  const input = document.querySelector('#password');
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  event.target.textContent = show ? 'Hide' : 'Show';
  event.target.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
});

document.querySelector('#logout').addEventListener('click', async () => {
  try {
    await api('/auth/logout', 'POST', {});
    showLogin();
    location.hash = 'dashboard';
  } catch (error) {
    showToast(error.message, true);
  }
});

async function submitDialog(event, action) {
  event.preventDefault();
  if (busy) return;
  busy = true;
  const form = event.target;
  const button = form.querySelector('[type="submit"]');
  const errorText = form.querySelector('.form-error');
  button.disabled = true;
  errorText.textContent = '';
  try {
    await action(Object.fromEntries(new FormData(form)));
    form.closest('dialog').close();
  } catch (error) {
    errorText.textContent = error.message;
  } finally {
    button.disabled = false;
    busy = false;
  }
}

document.querySelector('#queue-form').addEventListener('submit', (event) =>
  submitDialog(event, async (body) => {
    const result = await api('/queues', 'POST', body);
    search = '';
    location.hash = `queue/${result.queue._id}`;
    showToast('Your new queue is ready.');
  })
);

document.querySelector('#person-form').addEventListener('submit', (event) =>
  submitDialog(event, async (body) => {
    if (!currentQueue) throw new Error('Open a queue first.');
    const result = await api(`/queues/${currentQueue._id}/tokens`, 'POST', body);
    currentQueue = result.queue;
    search = '';
    renderQueue();
    const token = result.queue.tokens[result.queue.tokens.length - 1];
    showToast(`${tokenNumber(token.number)} created for ${token.name}.`);
  })
);

document.querySelector('#cancel-form').addEventListener('submit', (event) =>
  submitDialog(event, async () => {
    if (!currentQueue || !pendingCancel) throw new Error('Select a token first.');
    const result = await api(
      `/queues/${currentQueue._id}/tokens/${pendingCancel}/cancel`,
      'POST',
      {}
    );
    currentQueue = result.queue;
    renderQueue();
    showToast('Token cancelled. History preserved.');
    pendingCancel = null;
  })
);

window.addEventListener('hashchange', () => {
  search = '';
  renderPage();
});

// refresh quietly without interrupting forms, searches or expanded history
setInterval(async () => {
  if (
    !manager ||
    busy ||
    refreshing ||
    document.hidden ||
    document.querySelector('dialog[open]') ||
    main.contains(document.activeElement) ||
    document.querySelector('.history-section[open]')
  )
    return;
  refreshing = true;
  try {
    await renderPage(true);
  } finally {
    refreshing = false;
  }
}, 20000);

async function start() {
  loadDemoDetails();
  try {
    const data = await api('/auth/me');
    showApp(data.manager);
  } catch (error) {
    showLogin();
    if (error.message !== 'Please log in to continue.')
      document.querySelector('#login-error').textContent = error.message;
  }
}

start();
