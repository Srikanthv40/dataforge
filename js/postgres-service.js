// Postgres API client (browser → server/)
export const PG_API = (path) => (creds, body = {}) =>
  fetch(`http://localhost:3000${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...creds, ...body })
  }).then(async (r) => {
    const json = await r.json();
    if (!r.ok || !json.ok) throw new Error(json.error || `HTTP ${r.status}`);
    return json;
  });

export const pgTest = PG_API('/pg/test');
export const pgSchemas = PG_API('/pg/schemas');
export const pgSummary = PG_API('/pg/summary');
