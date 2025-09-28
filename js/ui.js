export function bindTabs() {
  const tabs = Array.from(document.querySelectorAll('.tab'));
  const sections = Array.from(document.querySelectorAll('.section'));
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      sections.forEach(s => s.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(tab.dataset.tab).classList.add('active');
    });
  });
}

export function activateTab(id) {
  const tab = document.querySelector(`.tab[data-tab="${id}"]`);
  const section = document.getElementById(id);
  if (!tab || !section) return;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  tab.classList.add('active');
  section.classList.add('active');
}

export function setStatus(msg) {
  document.getElementById('status').textContent = msg;
}

export function renderOverview(summary) {
  const data = {
    schema: summary.schema,
    tables: summary.tables.map(t => ({
      table: t.table,
      columnCount: t.columns.length,
      sampleRows: t.sample?.length || 0
    })),
  };
  document.getElementById('overview-pre').textContent = JSON.stringify(data, null, 2);
}

export function renderRelationships(summary) {
  document.getElementById('relations-pre').textContent =
    JSON.stringify(summary.relationships, null, 2);
}

export function renderColumnDescriptions(descJson) {
  document.getElementById('columns-pre').textContent =
    JSON.stringify(descJson, null, 2);
}

export function renderDbt(text) {
  document.getElementById('dbt-pre').textContent = text;
}

export function renderSql(sql, rows) {
  document.getElementById('sql-sql').textContent = sql || '';
  const preview = Array.isArray(rows) ? rows.slice(0, 50) : [];
  document.getElementById('sql-rows').textContent = JSON.stringify(preview, null, 2);
}

export function appendChat(text) {
  const pre = document.getElementById('chat-pre');
  pre.textContent += text;
  pre.scrollTop = pre.scrollHeight;
}
export function resetChat() {
  document.getElementById('chat-pre').textContent = '';
}
