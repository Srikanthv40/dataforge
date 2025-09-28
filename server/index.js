import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import pkg from 'pg';

dotenv.config();
const { Pool } = pkg;

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:8000',
    credentials: false
  })
);
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    limit: 120,
    standardHeaders: true,
    legacyHeaders: false
  })
);

const makePool = (body) => {
  const { host, port, database, user, password } = body || {};
  return new Pool({
    host: host || process.env.PGHOST,
    port: Number(port || process.env.PGPORT || 5432),
    database: database || process.env.PGDATABASE,
    user: user || process.env.PGUSER,
    password: password || process.env.PGPASSWORD,
    ssl: false,
    max: 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000
  });
};

app.post('/pg/test', async (req, res) => {
  const pool = makePool(req.body);
  try {
    const r = await pool.query('select version()');
    res.json({ ok: true, version: r.rows?.[0]?.version || null });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  } finally {
    await pool.end();
  }
});

app.post('/pg/schemas', async (req, res) => {
  const pool = makePool(req.body);
  try {
    const q = `
      select schema_name
      from information_schema.schemata
      where schema_name not in ('pg_catalog','information_schema')
      order by schema_name
    `;
    const r = await pool.query(q);
    res.json({ ok: true, schemas: r.rows.map(x => x.schema_name) });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  } finally {
    await pool.end();
  }
});

// One-shot summary over an entire schema (tables, columns, samples, FKs, PKs)
app.post('/pg/summary', async (req, res) => {
  const pool = makePool(req.body);
  const client = await pool.connect();
  try {
    const { schema, sampleLimit = 100 } = req.body;
    if (!schema) throw new Error('schema is required');

    const tablesQ = `
      select table_name
      from information_schema.tables
      where table_schema = $1 and table_type='BASE TABLE'
      order by table_name
    `;
    const tablesR = await client.query(tablesQ, [schema]);
    const tableNames = tablesR.rows.map(r => r.table_name);

    const fkQ = `
      select
        tc.constraint_name,
        tc.table_schema as fk_schema,
        tc.table_name   as fk_table,
        kcu.column_name as fk_column,
        ccu.table_schema as pk_schema,
        ccu.table_name  as pk_table,
        ccu.column_name as pk_column
      from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu
        on tc.constraint_name = kcu.constraint_name
       and tc.table_schema = kcu.table_schema
      join information_schema.constraint_column_usage ccu
        on ccu.constraint_name = tc.constraint_name
       and ccu.table_schema = tc.table_schema
      where tc.constraint_type = 'FOREIGN KEY'
        and tc.table_schema = $1
      order by fk_table, fk_column
    `;
    const fkR = await client.query(fkQ, [schema]);

    const pkQ = `
      select
        tc.table_schema, tc.table_name, kcu.column_name, kcu.ordinal_position
      from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu
        on tc.constraint_name = kcu.constraint_name
       and tc.table_schema = kcu.table_schema
      where tc.constraint_type = 'PRIMARY KEY'
        and tc.table_schema = $1
      order by tc.table_name, kcu.ordinal_position
    `;
    const pkR = await client.query(pkQ, [schema]);

    const safeLimit = Math.min(Number(sampleLimit) || 100, 500);
    const perTable = await Promise.all(
      tableNames.map(async (t) => {
        const colsQ = `
          select column_name, data_type, is_nullable, ordinal_position
          from information_schema.columns
          where table_schema = $1 and table_name = $2
          order by ordinal_position
        `;
        const colsR = await client.query(colsQ, [schema, t]);

        let rows = [];
        try {
          const sampleQ = `select * from "${schema}"."${t}" limit ${safeLimit}`;
          const sampleR = await client.query(sampleQ);
          rows = sampleR.rows;
        } catch {
          rows = [];
        }
        return { schema, table: t, columns: colsR.rows, sample: rows };
      })
    );

    res.json({
      ok: true,
      schema,
      tables: perTable,
      relationships: fkR.rows,
      primaryKeys: pkR.rows
    });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  } finally {
    client.release();
    await pool.end();
  }
});

// ADDED: safe SELECT-only query with enforced LIMIT
app.post('/pg/query', async (req, res) => {
  const pool = makePool(req.body);
  const client = await pool.connect();
  try {
    const { sql, params = [], maxRows = 1000 } = req.body;
    if (!sql || typeof sql !== 'string') throw new Error('sql is required');

    const first = sql.trim().slice(0, 6).toLowerCase();
    if (first !== 'select') throw new Error('Only SELECT is allowed');

    // Force a LIMIT no matter what was provided
    const limit = Math.min(Number(maxRows) || 200, 1000);

    // Disallow semicolons to prevent batching; keep it a single statement
    if (sql.includes(';')) throw new Error('Multiple statements not allowed');

    // Wrap the user SQL to enforce LIMIT safely
    const wrapped = `select * from (${sql}) as _sub limit $1`;
    const r = await client.query(wrapped, [limit, ...params]);
    res.json({ ok: true, rows: r.rows });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  } finally {
    client.release();
    await pool.end();
  }
});


const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`Postgres API listening on http://localhost:${port}`);
});
