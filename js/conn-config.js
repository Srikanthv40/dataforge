const K = { remember:'ff.pg.remember', host:'ff.pg.host', port:'ff.pg.port', db:'ff.pg.db', user:'ff.pg.user', pass:'ff.pg.pass' };
export function savePg(creds, remember) {
  const store = remember ? localStorage : sessionStorage;
  localStorage.setItem(K.remember, remember ? '1' : '0');
  store.setItem(K.host, creds.host || '');
  store.setItem(K.port, creds.port || '');
  store.setItem(K.db, creds.database || '');
  store.setItem(K.user, creds.user || '');
  store.setItem(K.pass, creds.password || '');
}
export function loadPg() {
  const remembered = localStorage.getItem(K.remember) === '1';
  const store = remembered ? localStorage : sessionStorage;
  return {
    remember: remembered,
    host: store.getItem(K.host) || '',
    port: store.getItem(K.port) || '5432',
    database: store.getItem(K.db) || '',
    user: store.getItem(K.user) || '',
    password: store.getItem(K.pass) || ''
  };
}
