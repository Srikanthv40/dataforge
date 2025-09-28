import { saveProvider, loadProvider } from './provider-config.js';
import { pgTest, pgSchemas, pgSummary } from './postgres-service.js';
import { describeColumnsWithLLM, schemaChat, generateSqlFromQuestion } from './llm-service.js';
import { buildDbtFromSummary } from './dbt-generation.js';
import { bindTabs, setStatus, renderOverview, renderRelationships, renderColumnDescriptions, renderDbt, renderSql, appendChat, resetChat, activateTab } from './ui.js';

const $ = (s) => document.querySelector(s);

let creds = null;
let lastSummary = null;

function readCreds() {
  return {
    host: $('#pg-host').value.trim(),
    port: $('#pg-port').value.trim(),
    database: $('#pg-db').value.trim(),
    user: $('#pg-user').value.trim(),
    password: $('#pg-pass').value
  };
}

function loadProviderIntoForm() {
  const p = loadProvider();
  $('#llm-base').value = p.baseUrl;
  $('#llm-key').value = p.apiKey;
  $('#llm-model').value = p.model;
}

function bindProviderControls() {
  $('#open-llm')?.addEventListener('click', () => { $('#llm-base')?.focus(); });
  $('#save-llm')?.addEventListener('click', () => {
    saveProvider({
      baseUrl: $('#llm-base').value.trim(),
      apiKey: $('#llm-key').value,
      model: $('#llm-model').value.trim()
    });
    setStatus('LLM provider saved');
  });
}

async function onTestAndLoad() {
  try {
    creds = readCreds();
    setStatus('Testing connection...');
    await pgTest(creds);
    setStatus('Connected. Loading schemas...');
    const s = await pgSchemas(creds);
    const sel = $('#pg-schema');
    sel.innerHTML = '';
    s.schemas.forEach((name) => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      sel.appendChild(opt);
    });
    setStatus('Pick a schema and click Analyze Schema + Generate');
  } catch (e) {
    setStatus(`Error: ${e.message}`);
  }
}

async function onAnalyzeSchema() {
  resetChat();
  try {
    creds = readCreds();
    const schema = $('#pg-schema').value.trim();
    if (!schema) { setStatus('Choose a schema first'); return; }

    setStatus('Scanning schema...');
    const summary = await pgSummary(creds, { schema, sampleLimit: 100 });
    lastSummary = summary;
    renderOverview(summary);
    renderRelationships(summary);

    setStatus('Generating AI column descriptions...');
    const desc = await describeColumnsWithLLM(summary);
    renderColumnDescriptions(desc);

    setStatus('Generating DBT files...');
    const dbtText = buildDbtFromSummary(summary);
    renderDbt(dbtText);

    setStatus('Done');
  } catch (e) {
    setStatus(`Error: ${e.message}`);
  }
}

async function onChatSend() {
  const q = $('#chat-input').value.trim();
  if (!q) return;
  appendChat(`\n> ${q}\n\n`);
  try {
    if (!lastSummary) { appendChat('(Analyze a schema first)\n'); return; }

    const looksAnalytical = /how many|count|total|sum|average|avg|max|min|top|trend|distribution/i.test(q);

    if (looksAnalytical) {
      setStatus('Drafting SQL from question...');
      const sql = await generateSqlFromQuestion(lastSummary, q);
      activateTab('sql');
      renderSql(sql, []);
      appendChat(`SQL: ${sql}\n`);

      setStatus('Running SQL...');
      const resp = await fetch('http://localhost:3000/pg/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...creds, sql, params: [], maxRows: 500 })
      });
      const json = await resp.json();
      if (!json.ok) throw new Error(json.error);

      renderSql(sql, json.rows);

      setStatus('Summarizing results...');
      const summary = await schemaChat(
        { ...lastSummary, preview: json.rows.slice(0, 50) },
        `Summarize these ${json.rows.length} result rows for the question: ${q}.
        If aggregated, state the metric clearly; otherwise show a compact list.`
      );
      activateTab('chat');
      appendChat(`${summary}\n`);
      setStatus('Done');
    } else {
      const answer = await schemaChat(lastSummary, q);
      appendChat(`${answer}\n`);
    }
  } catch (e) {
    appendChat(`Error: ${e.message}\n`);
    setStatus(`Error: ${e.message}`);
  }
}

function bindApp() {
  bindTabs();
  bindProviderControls();
  loadProviderIntoForm();

  $('#pg-test')?.addEventListener('click', onTestAndLoad);
  $('#analyze')?.addEventListener('click', onAnalyzeSchema);
  $('#chat-send')?.addEventListener('click', onChatSend);
}

document.addEventListener('DOMContentLoaded', bindApp);
