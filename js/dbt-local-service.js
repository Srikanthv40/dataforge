import yaml from 'https://cdn.jsdelivr.net/npm/js-yaml@4.1.0/+esm';

function getConversionScripts() {
  return window.generatedConversionFiles || { sourceScript: null, destScript: null };
}

export function exportDbtLocalZip(schemaData, dbtRulesData, updateStatus, fileData) {
  if (!dbtRulesData) return updateStatus?.("DBT rules are required for local development. Please generate DBT rules first.", "danger");
  if (!fileData?._originalFileContent) return updateStatus?.("Original dataset file is required for local development.", "danger");

  if (typeof JSZip === 'undefined') {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
    script.onload = () => createDbtLocalZip(schemaData, dbtRulesData, updateStatus, fileData);
    document.head.appendChild(script);
  } else {
    createDbtLocalZip(schemaData, dbtRulesData, updateStatus, fileData);
  }
}

function createDbtLocalZip(schemaData, dbtRulesData, updateStatus, fileData) {
  const zip = new JSZip();
  const notify = msg => updateStatus?.(msg.text, msg.type);
  
  try {
    const datasetName = fileData.name.replace(/\.(csv|xlsx?)$/i, '').replace(/^dataset-/, '')
      .replace(/[^a-zA-Z0-9_]/g, '_').replace(/^[0-9]+/, 'data_$&').replace(/_{2,}/g, '_').replace(/^_+|_+$/g, '');
    const datasetFileName = `dataset-${fileData.name}`;
    
    zip.file(datasetFileName, fileData._originalFileContent, { binary: true });
    createDbtProjectStructure(zip, datasetName, dbtRulesData, schemaData);
    zip.file("setup_dbt.sh", createSetupScript(datasetFileName, datasetName));
    zip.file("convert.py", createConvertPyScript(datasetFileName));
    
    const conversionScripts = getConversionScripts();
    if (conversionScripts.sourceScript) zip.file("convert_to_source.py", conversionScripts.sourceScript);
    if (conversionScripts.destScript) zip.file("convert_to_destination.py", conversionScripts.destScript);
    
    addDocumentationFiles(zip, schemaData, dbtRulesData);
    zip.file("README.md", createReadmeFile(datasetName, conversionScripts));

    zip.generateAsync({type: "blob"})
      .then(content => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(content);
        a.download = `dbt_local_project_${datasetName}_${new Date().toISOString().slice(0, 10)}.zip`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(a.href); }, 0);
        notify({text: "DBT local project exported successfully!", type: "success"});
      })
      .catch(() => notify({text: "Error generating DBT local project", type: "danger"}));
  } catch (error) {
    console.error("Error creating DBT local project:", error);
    notify({text: "Error creating DBT local project structure", type: "danger"});
  }
}

function createDbtProjectStructure(zip, datasetName, dbtRulesData, schemaData) {
  const configs = {
    'dbt_project.yml': { name: `${datasetName}_analysis`, version: '1.0.0', 'config-version': 2, profile: `${datasetName}_profile`, 'model-paths': ['models'], 'analysis-paths': ['analyses'], 'test-paths': ['tests'], 'seed-paths': ['seeds'], 'macro-paths': ['macros'], 'snapshot-paths': ['snapshots'], 'target-path': 'target', 'clean-targets': ['target', 'dbt_packages'], models: { [`${datasetName}_analysis`]: { materialized: 'table' } } },
    'profiles.yml': { [`${datasetName}_profile`]: { target: 'dev', outputs: { dev: { type: 'duckdb', path: `${datasetName}.duckdb`, threads: 1 } } } },
    'packages.yml': { packages: [{ package: 'dbt-labs/dbt_utils', version: '1.1.1' }] }
  };
  
  Object.entries(configs).forEach(([file, config]) => zip.file(file, yaml.dump(config)));
  
  const modelsDir = zip.folder("models");
  if (dbtRulesData.dbtRules) {
    dbtRulesData.dbtRules.forEach(rule => {
      if (rule.modelSql) {
        const seedRef = `{{ ref('${datasetName}') }}`;
        const updatedSql = rule.modelSql.replace(/\{\{\s*ref\(['"]\w+['"]\)\s*\}\}/gi, seedRef)
          .replace(/FROM\s+[\w_]+(?![\w_])/gi, `FROM ${seedRef}`)
          .replace(/(LEFT\s+JOIN|RIGHT\s+JOIN|INNER\s+JOIN|JOIN)\s+[\w_]+(?![\w_])/gi, `$1 ${seedRef}`);
        modelsDir.file(`${rule.tableName}.sql`, `-- Model for ${rule.tableName}\n${updatedSql.includes('SELECT') ? updatedSql : `SELECT * FROM ${seedRef}`}`);
      }
    });
    modelsDir.file("schema.yml", createSchemaYml(dbtRulesData, datasetName, schemaData));
  }
  zip.folder("seeds");
}

function createSchemaYml(dbtRulesData, datasetName, schemaData) {
  const schemaObj = { version: 2, models: [], seeds: [] };
  const actualColumns = new Set(schemaData.schemas?.flatMap(tbl => tbl.columns?.map(col => col.name) || []) || []);
  const modelColumnTests = new Set();

  dbtRulesData.dbtRules.forEach(rule => {
    const model = { name: rule.tableName, description: `Model derived from seed: ${datasetName}`, columns: [] };
    rule.tests?.forEach(test => {
      if (!actualColumns.has(test.column)) return;
      modelColumnTests.add(test.column);
      const col = { name: test.column, tests: [] };
      test.tests?.forEach(t => col.tests.push(typeof t === 'string' ? t : { [Object.keys(t)[0]]: Array.isArray(t[Object.keys(t)[0]]) || typeof t[Object.keys(t)[0]] === 'object' ? t[Object.keys(t)[0]] : String(t[Object.keys(t)[0]]) }));
      test.relationships?.forEach(rel => col.tests.push({ [rel.test]: { to: rel.to, field: rel.field } }));
      col.tests = [...new Set(col.tests.map(t => typeof t === 'string' ? t : JSON.stringify(t)))].map(t => t.startsWith('{') ? JSON.parse(t) : t);
      if (col.tests.length > 0) model.columns.push(col);
    });
    if (model.columns.length > 0) schemaObj.models.push(model);
  });

  const seed = { name: datasetName, description: "Source data for analysis", columns: [] };
  schemaData.schemas?.forEach(tbl => {
    tbl.columns?.forEach(col => {
      const seedCol = { name: col.name, description: col.description || '' };
      if (!modelColumnTests.has(col.name)) {
        const tests = [...new Set([...(col.isPrimaryKey ? ['not_null', 'unique'] : []), ...(col.constraints?.filter(c => c.toLowerCase().includes('not null')).map(() => 'not_null') || []), ...(col.constraints?.filter(c => c.toLowerCase().includes('unique')).map(() => 'unique') || [])])];
        if (tests.length) seedCol.tests = tests;
      }
      seed.columns.push(seedCol);
    });
  });
  
  schemaObj.seeds.push(seed);
  return yaml.dump(schemaObj, { noRefs: true, lineWidth: -1 });
}

function createSetupScript(datasetFileName, datasetName) {
  return `#!/bin/bash
set -e
LOG_FILE="schemaforge.$(date +%Y-%m-%d-%H-%M-%S).log"
log_and_echo() { echo "$1" | tee -a "$LOG_FILE"; }
{ echo "=== SchemaForge DBT Setup Log ==="; echo "Started at: $(date)"; echo "Dataset: ${datasetName}"; echo "==============================="; echo; } > "$LOG_FILE"
log_and_echo "🔧 Setting up DBT local development environment..."
if ! command -v uv &> /dev/null; then log_and_echo "❌ Error: uv is not installed. Please install it first."; exit 1; fi
log_and_echo "🔄 Converting dataset to CSV format..."; uv run convert.py 2>&1 | tee -a "$LOG_FILE"
log_and_echo "🎯 Initializing DBT project..."; export DBT_PROFILES_DIR=$(pwd); export dbt='uvx --with dbt-core,dbt-duckdb dbt'
log_and_echo "📦 Installing DBT dependencies..."; $dbt deps 2>&1 | tee -a "$LOG_FILE"
log_and_echo "🔗 Testing DBT connection..."; $dbt debug 2>&1 | tee -a "$LOG_FILE"
log_and_echo "🌱 Loading seeds into database..."; $dbt seed 2>&1 | tee -a "$LOG_FILE"
log_and_echo "🏗️ Running DBT models..."; $dbt run 2>&1 | tee -a "$LOG_FILE"
log_and_echo "🧪 Running DBT tests..."; $dbt test 2>&1 | tee -a "$LOG_FILE"
log_and_echo "📖 Generating DBT documentation..."; $dbt docs generate 2>&1 | tee -a "$LOG_FILE"
{ echo; echo "==============================="; echo "Completed at: $(date)"; echo "==============================="; } >> "$LOG_FILE"
log_and_echo "🎉 DBT local development setup complete!"
log_and_echo "📁 Project structure created with ${datasetName}.duckdb database"
log_and_echo "🚀 Run 'dbt docs serve' to view documentation"
log_and_echo "📝 Full log saved to: $LOG_FILE"`;
}

function createConvertPyScript(datasetFileName) {
  return `# /// script
# requires-python = '>=3.12'
# dependencies = ['pandas', 'openpyxl', 'duckdb']
# ///
import pandas as pd, os, re
dataset_file = '${datasetFileName}'
sanitized_name = re.sub(r'_{2,}', '_', re.sub(r'^[0-9]+', r'data_\\g<0>', re.sub(r'[^a-zA-Z0-9_]', '_', dataset_file.replace('dataset-', '').replace('.xlsx', '').replace('.csv', '')))).strip('_')
output_csv = f'seeds/{sanitized_name}.csv'
print(f'Converting {dataset_file} to {output_csv}...')
os.makedirs('seeds', exist_ok=True)
df = pd.read_csv(dataset_file) if dataset_file.lower().endswith('.csv') else pd.read_excel(dataset_file) if dataset_file.lower().endswith(('.xlsx', '.xls')) else (_ for _ in ()).throw(ValueError(f'Unsupported file format: {dataset_file}'))
df.to_csv(output_csv, index=False)
print(f'✅ Dataset converted and saved to {output_csv}')
print(f'📊 Dataset shape: {df.shape[0]} rows, {df.shape[1]} columns')`;
}

function addDocumentationFiles(zip, schemaData, dbtRulesData) {
  const generateDoc = (title, generator) => { let md = `# ${title}\n\n`; generator(md); return md; };
  const files = {
    "docs/schema_overview.md": generateDoc("Schema Overview", md => schemaData.schemas.forEach(s => md += `## ${s.tableName}\n\n${s.description || 'No description available'}\n\n${s.primaryKey ? `**Primary Key:** ${s.primaryKey.columns.join(', ')}\n\n` : ''}### Columns\n\n| Name | Type | Description | Flags |\n|------|------|-------------|-------|\n${s.columns?.map(c => `| ${c.name} | ${c.dataType} | ${c.description || 'No description'} | ${[c.isPrimaryKey && 'PK', c.isForeignKey && 'FK', c.isPII && 'PII'].filter(Boolean).join(', ')} |`).join('\n') || ''}\n\n`)),
    "docs/column_descriptions.md": generateDoc("Column Descriptions", md => schemaData.schemas.forEach(s => { md += `## ${s.tableName}\n\n`; s.columns?.forEach(c => md += `### ${c.name}\n\n**Type:** ${c.dataType}\n\n**Description:** ${c.description || 'No description available'}\n\n${[c.isPrimaryKey && 'Primary Key', c.isForeignKey && 'Foreign Key', c.isPII && 'PII/Sensitive'].filter(Boolean).length ? `**Flags:** ${[c.isPrimaryKey && 'Primary Key', c.isForeignKey && 'Foreign Key', c.isPII && 'PII/Sensitive'].filter(Boolean).join(', ')}\n\n` : ''}${c.foreignKeyReference ? `**Foreign Key Reference:** ${c.foreignKeyReference.referencedTable}.${c.foreignKeyReference.referencedColumn}\n\n` : ''}`); })),
    "docs/relationships.md": `# Table Relationships\n\n${!schemaData.relationships?.length ? 'No relationships defined.\n' : schemaData.relationships.map(r => `## ${r.fromTable} → ${r.toTable}\n\n**Relationship Type:** ${r.relationshipType}\n\n**Join:** ${r.fromTable}.${r.fromColumn} → ${r.toTable}.${r.toColumn}\n\n`).join('')}`,
    "docs/joins_and_modeling.md": `# Joins & Modeling\n\n${schemaData.suggestedJoins?.length ? `## Suggested Join Patterns\n\n${schemaData.suggestedJoins.map(j => `### ${j.description}\n\n**Use Case:** ${j.useCase}\n\n**Tables:** ${j.tables.join(', ')}\n\n**SQL Pattern:**\n\n\`\`\`sql\n${j.sqlPattern}\n\`\`\`\n\n`).join('')}` : ''}${schemaData.modelingRecommendations?.length ? `## Data Modeling Recommendations\n\n${schemaData.modelingRecommendations.map(r => `- ${r}`).join('\n')}\n` : ''}`,
    "docs/dbt_rules.md": `# DBT Rules\n\n${dbtRulesData.globalRecommendations?.length ? `## Global DBT Project Recommendations\n\n${dbtRulesData.globalRecommendations.map(r => `- ${r}`).join('\n')}\n\n` : ''}${!dbtRulesData.dbtRules?.length ? '' : dbtRulesData.dbtRules.map(r => `## ${r.tableName}\n\n${r.modelSql ? `### SQL\n\n\`\`\`sql\n${r.modelSql}\n\`\`\`\n\n` : ''}${r.tests?.length ? `### Tests\n\n| Column | Tests |\n|-----------|-------|\n${r.tests.map(t => `| ${t.column} | ${t.tests?.join(', ') || ''} |`).join('\n')}\n\n` : ''}`).join('')}`
  };
  Object.entries(files).forEach(([name, content]) => zip.file(name, content));
}

function createReadmeFile(datasetName, conversionScripts = {}) {
  const hasConversionScripts = conversionScripts.sourceScript && conversionScripts.destScript;
  return `# DBT Local Development Project

This project was generated by SchemaForge for local DBT development with your dataset: **${datasetName}**.

## Quick Start

1. Extract all files from this ZIP to a directory
2. Open a terminal in the extracted directory  
3. Run: \`chmod +x setup_dbt.sh && ./setup_dbt.sh\`

## Project Structure

\`\`\`
├── dbt_project.yml      # DBT project configuration
├── profiles.yml         # Database connection settings
├── models/              # DBT models (SQL files)
├── seeds/               # CSV data files  
├── docs/                # Additional documentation
├── setup_dbt.sh         # Automated setup script
├── convert.py           # Dataset conversion utility${hasConversionScripts ? `
├── convert_to_source.py # Source format conversion script
├── convert_to_destination.py # Destination format conversion script` : ''}
└── README.md           # This file
\`\`\`

## Commands

- \`dbt run\` - Execute all models
- \`dbt test\` - Run data quality tests
- \`dbt seed\` - Load CSV files into database
- \`dbt docs serve\` - Start documentation server${hasConversionScripts ? `

## Data Conversion Scripts

This package includes additional conversion scripts generated from the Data Ingestion feature:

- \`convert_to_source.py\` - Converts uploaded file to source format
- \`convert_to_destination.py\` - Converts from source to destination format

### Running Conversion Scripts
\`\`\`bash
# Run with uv (recommended)
uv run convert_to_source.py input_file.ext
uv run convert_to_destination.py source_file.ext output_file.ext
\`\`\`` : ''}

Generated by SchemaForge on ${new Date().toISOString().split('T')[0]}
`;
}