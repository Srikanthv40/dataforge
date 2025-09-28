export function buildDbtFromSummary(sum) {
  const schema = sum.schema;
  const srcName = schema;
  const pkByTable = groupPk(sum.primaryKeys);

  const sources = [
    'version: 2',
    'sources:',
    `  - name: ${srcName}`,
    `    schema: ${schema}`,
    '    tables:'
  ];
  sum.tables.forEach((t) => {
    sources.push(`      - name: ${t.table}`);
  });

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

  const sqlBlocks = sum.tables.map((t) => {
    return [
      `-- models/${t.table}.sql`,
      `select *`,
      `from {{ source('${srcName}', '${t.table}') }};`
    ].join('\n');
  });

  return [
    '# dbt files',
    '## models/sources.yml',
    sources.join('\n'),
    '\n\n## models/schema.yml',
    modelsYaml.join('\n'),
    '\n\n## model SQL files (create one per table under models/)',
    sqlBlocks.join('\n\n')
  ].join('\n');
}

function groupPk(pkRows) {
  const map = new Map();
  for (const r of pkRows || []) {
    const key = r.table_name;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(r.column_name);
  }
  return map;
}
