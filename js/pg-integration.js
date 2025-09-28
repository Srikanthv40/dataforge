// js/pg-integration.js  (FULL FILE)
import { pgTest, pgSchemas, PG_API } from './postgres-service.js';

// Extend service with the new summary endpoint
const pgSummary = PG_API('/pg/summary');

const $ = (sel) => document.querySelector(sel);

function bindPgUi() {
  $('#pg-list-schemas-btn')?.addEventListener('click', onListSchemas);
  $('#pg-analyze-schema-btn')?.addEventListener('click', onAnalyzeSchema);
}

async function onListSchemas() {
  const creds = readCreds();
  const status = $('#pg-status');
  status.textContent = 'Testing connection...';
  try {
    await pgTest(creds);
    status.textContent = 'Connected. Loading schemas...';
    const s = await pgSchemas(creds);
    const sel = $('#pg-schema');
    sel.innerHTML = '';
    s.schemas.forEach((name) => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      sel.appendChild(opt);
    });
    status.textContent = 'Pick a schema, then click Analyze Schema + Generate DBT.';
  } catch (e) {
    status.textContent = `Error: ${e.message}`;
  }
}

async function onAnalyzeSchema() {
  const creds = readCreds();
  const schema = $('#pg-schema').value.trim();
  const status = $('#pg-status');
  const overview = $('#pg-overview');
  const out = $('#pg-dbt-output');

  if (!schema) {
    status.textContent = 'Please choose a schema from the dropdown.';
    return;
  }

  status.textContent = 'Scanning schema (tables, columns, FKs, PKs)...';
  out.textContent = '';

  try {
    const sum = await pgSummary(creds, { schema, sampleLimit: 100 });

    // Show a compact overview for confirmation
    overview.textContent = JSON.stringify(
      {
        schema: sum.schema,
        tableCount: sum.tables.length,
        relationships: sum.relationships.length,
        pkDefs: sum.primaryKeys.length,
        sampled: sum.tables.map((t) => ({ table: t.table, sampleRows: t.sample.length }))
      },
      null,
      2
    );

    status.textContent = 'Generating dbt sources and models...';

    const generated = buildDbtFromSummary(sum);
    out.textContent = generated;

    status.textContent = 'Done. Copy the YAML and SQL blocks into your dbt project.';
  } catch (e) {
    status.textContent = `Error: ${e.message}`;
  }
}

function readCreds() {
  return {
    host: $('#pg-host').value.trim(),
    port: $('#pg-port').value.trim(),
    database: $('#pg-db').value.trim(),
    user: $('#pg-user').value.trim(),
    password: $('#pg-pass').value
  };
}

/**
 * Build a single text blob containing:
 * - sources.yml for all tables in the schema
 * - one <table>.sql model per table that selects from the source
 * - basic tests (unique+not_null) on primary key columns if present
 */
function buildDbtFromSummary(sum) {
  const schema = sum.schema;
  const srcName = schema; // simple mapping: use schema name as dbt source name
  const pkByTable = groupPk(sum.primaryKeys);

  // sources.yml
  const sources = [
    'version: 2',
    'sources:',
    `  - name: ${srcName}`,
    '    tables:'
  ];
  sum.tables.forEach((t) => {
    sources.push(`      - name: ${t.table}`);
  });

  // models YAML with tests
  const modelsYaml = ['version: 2', 'models:'];
  sum.tables.forEach((t) => {
    const pks = pkByTable.get(t.table) || [];
    modelsYaml.push(`  - name: ${t.table}`);
    if (pks.length) {
      modelsYaml.push('    columns:');
      pks.forEach((col) => {
        modelsYaml.push(`      - name: ${col}`);
        modelsYaml.push('        tests:');
        modelsYaml.push('          - not_null');
        modelsYaml.push('          - unique');
      });
    }
  });

  // model SQL stubs
  const sqlBlocks = sum.tables.map((t) => {
    return [
      `-- models/${t.table}.sql`,
      `select *`,
      `from {{ source('${srcName}', '${t.table}') }};`
    ].join('\n');
  });

  return [
    '# dbt_project files to copy\n',
    '## models/sources.yml',
    sources.join('\n'),
    '\n\n## models/schema.yml',
    modelsYaml.join('\n'),
    '\n\n## model SQL files (create one file per table under models/)\n',
    sqlBlocks.join('\n\n')
  ].join('\n');
}

function groupPk(pkRows) {
  const map = new Map();
  for (const r of pkRows) {
    const key = r.table_name;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(r.column_name);
  }
  return map;
}

document.addEventListener('DOMContentLoaded', bindPgUi);
