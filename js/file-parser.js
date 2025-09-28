import * as XLSX from "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm";
import Papa from "https://cdn.jsdelivr.net/npm/papaparse@5.4.1/+esm";

export async function parseFile(file) {
  if (!file) throw new Error("No file provided");
  
  const fileExtension = file.name.split('.').pop().toLowerCase();
  const supportedFormats = ['csv', 'xlsx', 'txt', 'json', 'log'];
  
  if (!supportedFormats.includes(fileExtension)) 
    throw new Error(`Unsupported file format. Supported: ${supportedFormats.join(', ')}`);
  
  try {
    const content = await readFile(file, fileExtension === 'xlsx' ? 'arraybuffer' : 'text');
    return createParsedData(content, file.name, fileExtension);
  } catch (error) {
    throw new Error(`Failed to parse file: ${error.message}`);
  }
}

function readFile(file, type = 'text') {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = () => reject(new Error("Error reading file"));
    type === 'arraybuffer' ? reader.readAsArrayBuffer(file) : reader.readAsText(file);
  });
}

function createParsedData(content, fileName, fileExtension) {
  const originalContent = typeof content === 'string' ? new TextEncoder().encode(content) : content;
  
  switch (fileExtension) {
    case 'csv':
      const parsed = Papa.parse(content, { header: false });
      return {
        name: fileName,
        type: fileExtension,
        sheets: [{
          name: 'Sheet1',
          headers: parsed.data[0] || [],
          sampleRows: parsed.data.slice(1, 11)
        }],
        _originalFileContent: originalContent
      };
      
    case 'xlsx':
      const workbook = XLSX.read(content, { type: "array" });
      const sheets = workbook.SheetNames.map(sheetName => {
        const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });
        return {
          name: sheetName,
          headers: jsonData[0] || [],
          sampleRows: jsonData.slice(1, 11)
        };
      });
      return { name: fileName, type: fileExtension, sheets, _originalFileContent: originalContent };
      
    case 'json':
      try {
        const jsonData = JSON.parse(content);
        const isArray = Array.isArray(jsonData) && jsonData.length > 0;
        return {
          name: fileName,
          type: fileExtension,
          sheets: [{
            name: fileName,
            headers: isArray ? Object.keys(jsonData[0] || {}) : ['JSON Object'],
            sampleRows: isArray ? jsonData.slice(0, 10).map(obj => Object.values(obj)) : [[JSON.stringify(jsonData, null, 2).slice(0, 1000)]]
          }],
          _originalFileContent: originalContent
        };
      } catch (e) {
        return createTextFileData(content, fileName, fileExtension, originalContent);
      }
      
    default:
      return createTextFileData(content, fileName, fileExtension, originalContent);
  }
}

function createTextFileData(content, fileName, fileExtension, originalContent) {
  return {
    name: fileName,
    type: fileExtension,
    sheets: [{
      name: fileName,
      headers: ['Content'],
      sampleRows: content.split('\n').slice(0, 50).map(line => [line])
    }],
    _originalFileContent: originalContent
  };
}

export async function parseFileFromUrl(url, fileName) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch data: ${response.status} ${response.statusText}`);
    }
    
    const fileExtension = url.split('.').pop()?.toLowerCase() || 'csv';
    if (!['csv', 'xlsx'].includes(fileExtension)) {
      throw new Error("Unsupported file format. Please use CSV or Excel files.");
    }
    
    const content = fileExtension === 'csv' ? await response.text() : await response.arrayBuffer();
    return createParsedData(content, fileName, fileExtension);
  } catch (error) {
    throw new Error(`Failed to parse file from URL: ${error.message}`);
  }
}