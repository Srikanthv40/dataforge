// js/llm-service.js — NON-STREAMING, SIMPLE, PARSER-SAFE VERSION

import { loadProvider } from './provider-config.js';

// Core helper: call an OpenAI-compatible Chat Completions endpoint without streaming.
async function callChat(messages) {
  const { baseUrl, apiKey, model } = loadProvider();
  if (!baseUrl || !apiKey || !model) {
    throw new Error('LLM provider is not configured');
  }

  const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.2,
      stream: false
    })
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`LLM HTTP ${resp.status} ${text || ''}`.trim());
  }

  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content || '';
  return content;
}

// Public: free-form Q&A over a schema summary.
export async function schemaChat(summary, question) {
  const sys = `You are a helpful analytics assistant answering questions about a Postgres schema.
Use only the provided schema summary and relationships. Be concise and avoid SQL unless asked.`;

  const ctx = JSON.stringify(
    {
      schema: summary.schema,
      tables: summary.tables.map(t => ({
        table: t.table,
        columns: t.columns.map(c => ({ name: c.column_name, type: c.data_type, nullable: c.is_nullable }))
      })),
      relationships: summary.relationships
    },
    null,
    2
  );

  const messages = [
    { role: 'system', content: sys },
    { role: 'user', content: `Context:\n${ctx}\n\nQuestion: ${question}` }
  ];

  return await callChat(messages);
}

// Public: generate concise column descriptions with a JSON result shape.
// Returns { tables: [ { table, columns: [ {name, description, pii} ] } ] }
export async function describeColumnsWithLLM(summary) {
  const sys = `You are a helpful data documentation assistant.
Given a database schema summary (tables, columns, data types, foreign keys, and a small sample of rows per table),
write concise, non-technical descriptions for each column. Return STRICT JSON:
{
  "tables": [
    {
      "table": "table_name",
      "columns": [
        {"name":"col","description":"...","pii":false}
      ]
    }
  ]
}`;

  const user = JSON.stringify(
    {
      schema: summary.schema,
      tables: summary.tables.map(t => ({
        table: t.table,
        columns: t.columns,
        sampleHead: (t.sample || []).slice(0, 5)
      })),
      relationships: summary.relationships
    },
    null,
    2
  );

  const messages = [
    { role: 'system', content: sys },
    { role: 'user', content: user }
  ];

  const raw = await callChat(messages);

  // Extract and parse JSON safely even if the model includes prose around it.
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  const jsonText = start >= 0 && end > start ? raw.slice(start, end + 1) : '{"tables": []}';

  try {
    const parsed = JSON.parse(jsonText);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.tables)) {
      return { tables: [] };
    }
    return parsed;
  } catch {
    return { tables: [] };
  }
}

export async function generateSqlFromQuestion(summary, question) {
  const sys = `You are a careful data assistant that writes a SINGLE SELECT query for PostgreSQL.
Rules: 
- Only SELECT; no DDL/DML; no semicolons.
- Use fully qualified names "schema"."table" if needed.
- Keep results small and include LIMIT 200 at the end.
- Prefer aggregates (count, sum) for “how many” questions.`;

  const ctx = JSON.stringify({
    schema: summary.schema,
    tables: summary.tables.map(t => ({
      table: t.table,
      columns: t.columns.map(c => ({ name: c.column_name, type: c.data_type }))
    })),
    relationships: summary.relationships
  }, null, 2);

  const prompt = `Context:\n${ctx}\n\nQuestion: ${question}\n\nReturn ONLY the SQL, nothing else.`;

  const sql = await callChat([
    { role: 'system', content: sys },
    { role: 'user', content: prompt }
  ]);

  // Extract plain SQL line (no prose)
  const line = sql.split('\n').map(s => s.trim()).filter(Boolean).join(' ');
  return line.replace(/;+/g, '').replace(/\blimit\b\s+\d+/i, 'LIMIT 200'); // normalize LIMIT
}
