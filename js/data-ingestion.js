import { html, render } from 'lit-html';
import { asyncLLM } from "https://cdn.jsdelivr.net/npm/asyncllm@2";
import { parse } from "https://cdn.jsdelivr.net/npm/partial-json@0.1.7/+esm";

const SUPPORTED_SOURCES = [
  { value: 'csv', label: 'CSV File' },
  { value: 'excel', label: 'Excel File' },
  { value: 'sqlite3', label: 'SQLite Database' },
  { value: 'parquet', label: 'Parquet File' },
  { value: 'json', label: 'JSON File' }
];

const SUPPORTED_DESTINATIONS = [
  { value: 'csv', label: 'CSV File' },
  { value: 'excel', label: 'Excel File' },
  { value: 'sqlite3', label: 'SQLite Database' },
  { value: 'parquet', label: 'Parquet File' },
  { value: 'json', label: 'JSON File' }
];

let generatedFiles = {
  sourceScript: null,
  destScript: null
};
/**
 * Render the data ingestion interface
 * @param {Object} schemaData - Schema data for context
 */
export function renderDataIngestion(schemaData) {
  const ingestionContent = document.getElementById("ingestion-content");
  
  if (!ingestionContent) {
    console.warn("Ingestion content element not found");
    return;
  }

  const ingestionTemplate = html`
    <div class="card">
      <div class="card-header">
        <h5 class="mb-0">Data Ingestion Configuration</h5>
      </div>
      <div class="card-body">
        <div class="row">
          <div class="col-md-6">
            <div class="mb-3">
              <label for="source-type" class="form-label">Source Format</label>
              <select class="form-select" id="source-type">
                <option value="">Select source format...</option>
                ${SUPPORTED_SOURCES.map(source => html`
                  <option value="${source.value}">${source.label}</option>
                `)}
              </select>
            </div>
          </div>
          <div class="col-md-6">
            <div class="mb-3">
              <label for="dest-type" class="form-label">Destination Format</label>
              <select class="form-select" id="dest-type">
                <option value="">Select destination format...</option>
                ${SUPPORTED_DESTINATIONS.map(dest => html`
                  <option value="${dest.value}">${dest.label}</option>
                `)}
              </select>
            </div>
          </div>
        </div>
        
        <div class="mb-3">
          <label for="conversion-params" class="form-label">Conversion Parameters (Optional)</label>
          <textarea 
            class="form-control" 
            id="conversion-params" 
            rows="3" 
            placeholder="Enter any specific conversion parameters, filters, or transformations needed..."
          ></textarea>
          <div class="form-text">
            Examples: Filter specific columns, date range filtering, data type conversions, etc.
          </div>
        </div>
        
        <div class="d-flex gap-2 mb-3">
          <button type="button" class="btn btn-primary" @click=${() => handleGenerateConversion(schemaData)}>
            <span class="spinner-border spinner-border-sm d-none" id="generate-conversion-spinner"></span>
            Generate Conversion Scripts
          </button>
        </div>
        
        <div id="conversion-status"></div>
      </div>
    </div>
    
    <div class="mt-4" id="generated-scripts-section" style="display: none;">
      <!-- Scripts will be rendered here dynamically -->
    </div>
  `;
  
  render(ingestionTemplate, ingestionContent);
}

/**
 * Handle conversion script generation
 * @param {Object} schemaData - Schema data for context
 */

async function handleGenerateConversion(schemaData) {
  const sourceType = document.getElementById('source-type').value;
  const destType = document.getElementById('dest-type').value;
  const conversionParams = document.getElementById('conversion-params').value;
  const statusDiv = document.getElementById('conversion-status');

  if (!sourceType || !destType) {
    render(html`<div class="alert alert-warning">Please select both source and destination formats.</div>`, statusDiv);
    return;
  }

  // Show loading state with lit-html
  render(html`<div class="alert alert-info">
    <div class="d-flex align-items-center">
      <div class="spinner-border spinner-border-sm me-2" role="status">
        <span class="visually-hidden">Loading...</span>
      </div>
      Generating conversion scripts...
    </div>
  </div>`, statusDiv);

  try {
    // Get LLM config from main.js
    const llmConfig = window.getLLMConfig?.();
    if (!llmConfig) {
      render(html`<div class="alert alert-warning">Please configure LLM settings first by clicking 'Configure LLM Provider' in the upload section.</div>`, statusDiv);
      return;
    }

    // Generate conversion scripts using LLM with streaming
    const conversionData = await generateConversionScripts(
      schemaData, 
      sourceType, 
      destType, 
      conversionParams, 
      llmConfig,
      (partialData) => {
        // Update UI with streaming progress
        if (partialData) {
          updateConversionProgress(partialData);
        }
      }
    );

    // Store generated files
    generatedFiles = conversionData;
    
    // Make available globally for DBT local export
    window.generatedConversionFiles = conversionData;
    
    // Display the generated scripts
    displayGeneratedScripts(conversionData);
    
    render(html`<div class="alert alert-success">Conversion scripts generated successfully!</div>`, statusDiv);

  } catch (error) {
    console.error('Error generating conversion scripts:', error);
    render(html`<div class="alert alert-danger">Error: ${error.message}</div>`, statusDiv);
  }
}

/**
 * Generate conversion scripts using LLM with streaming
 * @param {Object} schemaData - Schema data for context
 * @param {String} sourceType - Source format type
 * @param {String} destType - Destination format type
 * @param {String} conversionParams - Additional conversion parameters
 * @param {Object} llmConfig - LLM configuration
 * @param {Function} onUpdate - Callback for streaming updates
 * @returns {Object} Generated scripts object
 */
async function generateConversionScripts(schemaData, sourceType, destType, conversionParams, llmConfig, onUpdate) {
  try {
    const prompt = createConversionPrompt(schemaData, sourceType, destType, conversionParams);
    
    const body = {
      model: window.getSelectedModel?.() || "gpt-4.1-mini",
      stream: true,
      messages: [
        {
          role: "system",
          content: "You are a Python expert specializing in data conversion scripts. Generate clean, efficient, and well-documented Python code."
        },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" }
    };

    let fullContent = "";
    let parsedContent = null;
    
    for await (const { content, error } of asyncLLM(`${llmConfig.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${llmConfig.apiKey}`
      },
      body: JSON.stringify(body),
    })) {
      if (error) throw new Error(`LLM API error: ${error}`);
      
      if (content) {
        fullContent = content;
        
        try {
          // Try to parse the partial JSON
          parsedContent = parse(fullContent);
          
          // Call the update callback with the latest parsed content
          if (onUpdate && typeof onUpdate === 'function') {
            onUpdate(parsedContent);
          }
        } catch (parseError) {
          // Ignore parse errors for partial content - we'll try again with the next chunk
        }
      }
    }
    
    // Final parse of the complete content
    return JSON.parse(fullContent);
  } catch (error) {
    throw new Error(`Conversion script generation failed: ${error.message}`);
  }
}

/**
 * Create prompt for conversion script generation
 * @param {Object} schemaData - Schema data
 * @param {String} sourceType - Source format
 * @param {String} destType - Destination format
 * @param {String} conversionParams - Additional parameters
 * @returns {String} Formatted prompt
 */
function createConversionPrompt(schemaData, sourceType, destType, conversionParams) {
  const schemas = schemaData?.schemas || [];
  const relationships = schemaData?.relationships || [];
  
  const schemaInfo = schemas.map(schema => ({
    tableName: schema.tableName,
    columns: schema.columns?.map(col => ({
      name: col.name,
      dataType: col.dataType,
      isPII: col.isPII
    })) || []
  }));

  return `Generate Python conversion scripts for data ingestion with the following requirements:

**Source Format**: ${sourceType}
**Destination Format**: ${destType}
**Additional Parameters**: ${conversionParams || 'None specified'}

**Schema Information**:
${JSON.stringify(schemaInfo, null, 2)}

**Relationships**:
${JSON.stringify(relationships, null, 2)}

Please generate two Python scripts:
1. **convert_to_source.py** - Converts uploaded file to the source format
2. **convert_to_destination.py** - Converts from source to destination format

Requirements:
- Use uv-style inline script requirements at the top of each file in this format:
  # /// script
  # requires-python = '>=3.12'
  # dependencies = ['pandas>=2.0.0', 'numpy>=1.24.0', 'other-package>=version', 'openpyxl>=3.1.5' ]
  # ///
- Always add all the dependencies to the script (inline).
- For Excel files, automatically handle multiple sheets using sheet names as table names
- DO NOT require a --table parameter; automatically process all sheets in Excel files
- Use argparse with only the input file as a required positional argument
- For single-sheet files (CSV, JSON, etc.), use the filename (without extension) as the table name
- Include proper error handling and logging
- Add data validation where appropriate
- Handle different file encodings
- Add clear documentation and usage examples
- Strictly follow the source and destination formats
- Consider PII data handling for sensitive columns
- Optimize for performance with large datasets
- Include progress indicators for large files
- Use modern Python features and type hints
- Make scripts runnable with: uv run script.py

Return the response as JSON with this structure:
{
  "sourceScript": "# /// script\\n# requires-python = '>=3.12'\\n# dependencies = ['pandas>=2.0.0', 'numpy>=1.24.0']\\n# ///\\n\\n# Python code for convert_to_source.py...",
  "destScript": "# /// script\\n# requires-python = '>=3.12'\\n# dependencies = ['pandas>=2.0.0', 'numpy>=1.24.0']\\n# ///\\n\\n# Python code for convert_to_destination.py...",
  "usage": {
    "sourceScript": "uv run convert_to_source.py input_file.ext",
    "destScript": "uv run convert_to_destination.py source_file.ext output_file.ext"
  }
}`;
}

/**
 * Update conversion progress with streaming data
 * @param {Object} partialData - Partial conversion data from streaming
 */
function updateConversionProgress(partialData) {
  // Show the scripts section early if we have any partial data
  const scriptsSection = document.getElementById('generated-scripts-section');
  if (scriptsSection && partialData) {
    // Render the scripts template with partial data
    render(getScriptsTemplate(partialData), scriptsSection);
    scriptsSection.style.display = 'block';
  }

  // Update status with progress information
  const statusDiv = document.getElementById('conversion-status');
  if (statusDiv) {
    let progressMessage = 'Generating conversion scripts...';
    
    if (partialData.sourceScript && partialData.destScript) {
      progressMessage = 'Finalizing both conversion scripts...';
    } else if (partialData.sourceScript) {
      progressMessage = 'Source script generated, working on destination script...';
    } else if (partialData.destScript) {
      progressMessage = 'Destination script generated, working on source script...';
    }
    
    render(html`<div class="alert alert-info">${progressMessage}</div>`, statusDiv);
  }
}

/**
 * Get scripts template for rendering
 * @param {Object} conversionData - Conversion data with scripts
 * @returns {TemplateResult} Scripts template
 */
function getScriptsTemplate(conversionData) {
  const sourceScript = conversionData.sourceScript || 'Generating source script...';
  const destScript = conversionData.destScript || 'Generating destination script...';
  
  // Use consistent IDs for the ingestion scripts
  const tabId = 'ingestion-scripts';
  const sourceTabId = `${tabId}-source`;
  const destTabId = `${tabId}-dest`;

  return html`
    <div class="card">
      <div class="card-header d-flex justify-content-between align-items-center">
        <h5 class="mb-0">Generated Conversion Scripts</h5>
        <button type="button" class="btn btn-success" @click=${handleExportWithConversionScripts}>
          Download Python Scripts
        </button>
      </div>
      <div class="card-body">
        <ul class="nav nav-tabs" id="${tabId}-tabs" role="tablist">
          <li class="nav-item" role="presentation">
            <button class="nav-link active" id="${sourceTabId}-tab" data-bs-toggle="tab" data-bs-target="#${sourceTabId}" type="button" role="tab" aria-controls="${sourceTabId}" aria-selected="true">
              Source Converter
            </button>
          </li>
          <li class="nav-item" role="presentation">
            <button class="nav-link" id="${destTabId}-tab" data-bs-toggle="tab" data-bs-target="#${destTabId}" type="button" role="tab" aria-controls="${destTabId}" aria-selected="false">
              Destination Converter
            </button>
          </li>
        </ul>
        
        <div class="tab-content mt-3" id="${tabId}-content">
          <div class="tab-pane fade show active" id="${sourceTabId}" role="tabpanel" aria-labelledby="${sourceTabId}-tab">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <h6>convert_to_source.py</h6>
              <button class="btn btn-sm btn-outline-secondary" @click=${() => copyToClipboard(sourceTabId + '-content')}>Copy</button>
            </div>
            <pre><code id="${sourceTabId}-content">${sourceScript}</code></pre>
          </div>
          <div class="tab-pane fade" id="${destTabId}" role="tabpanel" aria-labelledby="${destTabId}-tab">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <h6>convert_to_destination.py</h6>
              <button class="btn btn-sm btn-outline-secondary" @click=${() => copyToClipboard(destTabId + '-content')}>Copy</button>
            </div>
            <pre><code id="${destTabId}-content">${destScript}</code></pre>
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Display generated scripts in the UI
 * @param {Object} conversionData - Generated conversion data
 */
function displayGeneratedScripts(conversionData) {
  const scriptsSection = document.getElementById('generated-scripts-section');
  
  if (scriptsSection) {
    render(getScriptsTemplate(conversionData), scriptsSection);
    scriptsSection.style.display = 'block';
  }
}

/**
 * Copy script content to clipboard
 * @param {String} elementId - ID of element containing script content
 */
function copyToClipboard(elementId) {
  const element = document.getElementById(elementId);
  if (element) {
    navigator.clipboard.writeText(element.textContent).then(() => {
      // Show success message using status update
      const statusDiv = document.getElementById('conversion-status');
      if (statusDiv) {
        render(html`<div class="alert alert-success">Script copied to clipboard!</div>`, statusDiv);
        
        // Clear message after 2 seconds
        setTimeout(() => {
          render(html``, statusDiv);
        }, 2000);
      }
    }).catch(err => {
      console.error('Failed to copy to clipboard:', err);
      const statusDiv = document.getElementById('conversion-status');
      if (statusDiv) {
        render(html`<div class="alert alert-danger">Failed to copy to clipboard</div>`, statusDiv);
      }
    });
  }
}

/**
 * Handle export of conversion scripts as Python files
 */
function handleExportWithConversionScripts() {
  if (!generatedFiles.sourceScript || !generatedFiles.destScript) {
    const statusDiv = document.getElementById('conversion-status');
    if (statusDiv) {
      render(html`<div class="alert alert-warning">Please generate conversion scripts first.</div>`, statusDiv);
    }
    return;
  }

  const statusDiv = document.getElementById('conversion-status');
  render(html`<div class="alert alert-info">Downloading Python scripts...</div>`, statusDiv);
  
  // Download the Python files directly
  downloadFile('convert_to_source.py', generatedFiles.sourceScript);
  downloadFile('convert_to_destination.py', generatedFiles.destScript);

  setTimeout(() => {
    render(html`<div class="alert alert-success">Python scripts downloaded successfully!</div>`, statusDiv);
    
    // Clear success message after 3 seconds
    setTimeout(() => {
      render(html``, statusDiv);
    }, 3000);
  }, 500);
}

/**
 * Download a single file
 * @param {String} filename - Name of the file
 * @param {String} content - File content
 */
function downloadFile(filename, content) {
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}