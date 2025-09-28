// schemaforge-main/js/provider-config.js
export function saveProvider({ baseUrl, apiKey, model }) {
  localStorage.setItem('llm.baseUrl', baseUrl || '');
  localStorage.setItem('llm.apiKey', apiKey || '');
  localStorage.setItem('llm.model', model || '');
}
export function loadProvider() {
  return {
    baseUrl: localStorage.getItem('llm.baseUrl') || '',
    apiKey: localStorage.getItem('llm.apiKey') || '',
    model: localStorage.getItem('llm.model') || ''
  };
}
