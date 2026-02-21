import jsyaml from 'js-yaml';

// ===== Storage Keys =====
const KEYS = {
  jsonInput: 'devformat_json_input',
  jsonOutput: 'devformat_json_output',
  yamlInput: 'devformat_yaml_input',
  yamlOutput: 'devformat_yaml_output',
  activeTab: 'devformat_active_tab',
};

// ===== Utilities =====

function showToast(msg, type = 'default') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = 'toast show' + (type !== 'default' ? ` ${type}` : '');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.className = 'toast';
  }, 2400);
}

async function copyToClipboard(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
    const orig = btn.innerHTML;
    btn.classList.add('copied');
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`;
    setTimeout(() => {
      btn.classList.remove('copied');
      btn.innerHTML = orig;
    }, 1800);
    showToast('Copied to clipboard!', 'success');
  } catch {
    showToast('Copy failed – check clipboard permissions', 'error-toast');
  }
}

// ===== Line Numbers =====

function buildLineNumbers(text, containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const lines = text ? text.split('\n').length : 1;
  el.textContent = Array.from({ length: lines }, (_, i) => i + 1).join('\n');
}

function syncLineNumbers(textarea, lineNumId) {
  textarea.addEventListener('input', () => {
    buildLineNumbers(textarea.value, lineNumId);
  });
  textarea.addEventListener('scroll', () => {
    const ln = document.getElementById(lineNumId);
    if (ln) ln.scrollTop = textarea.scrollTop;
  });
  buildLineNumbers(textarea.value, lineNumId);
}

// ===== Status Bar =====

function setStatus(barId, type, message, detail = '') {
  const bar = document.getElementById(barId);
  if (!bar) return;
  const safeMsg = message.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const safeDetail = detail.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  let inner = '';
  if (type === 'idle') {
    inner = `<span class="status-idle">${safeMsg}</span>`;
  } else if (type === 'ok') {
    inner = `<span class="status-ok">${safeMsg}</span>`;
  } else if (type === 'error') {
    inner = `<span class="status-error">${safeMsg}</span>`;
    if (detail) inner += `<span class="err-detail">${safeDetail}</span>`;
  }
  bar.innerHTML = inner;
}

// ===== Render helpers =====

function setOutput(outputEl, lineNumId, text) {
  outputEl.value = text;
  buildLineNumbers(text, lineNumId);
  outputEl.scrollTop = 0;
}

function clearOutput(outputEl, lineNumId) {
  outputEl.value = '';
  buildLineNumbers('', lineNumId);
}


// ===== JSON Module =====

function initJSON() {
  const input = document.getElementById('json-input');
  const output = document.getElementById('json-output');
  const statusBar = 'json-status-bar';
  const copyBtn = document.getElementById('json-copy-btn');
  const formatBtn = document.getElementById('json-format-btn');
  const minifyBtn = document.getElementById('json-minify-btn');
  const clearBtn = document.getElementById('json-clear-btn');
  const pasteBtn = document.getElementById('json-paste-btn');

  // Restore from localStorage
  const savedInput = localStorage.getItem(KEYS.jsonInput);
  const savedOutput = localStorage.getItem(KEYS.jsonOutput);
  if (savedInput) input.value = savedInput;
  if (savedOutput) output.value = savedOutput;
  buildLineNumbers(input.value, 'json-line-numbers');
  buildLineNumbers(output.value, 'json-output-line-numbers');

  // Line numbers
  syncLineNumbers(input, 'json-line-numbers');
  syncLineNumbers(output, 'json-output-line-numbers');

  // Persist output edits
  output.addEventListener('input', () => {
    localStorage.setItem(KEYS.jsonOutput, output.value);
    buildLineNumbers(output.value, 'json-output-line-numbers');
  });

  function processJSON(minify = false) {
    const raw = input.value.trim();

    localStorage.setItem(KEYS.jsonInput, input.value);

    if (!raw) {
      clearOutput(output, 'json-output-line-numbers');
      localStorage.removeItem(KEYS.jsonOutput);
      setStatus(statusBar, 'idle', 'Ready · Paste JSON and click Format');
      return;
    }

    try {
      const parsed = JSON.parse(raw);
      const formatted = minify
        ? JSON.stringify(parsed)
        : JSON.stringify(parsed, null, 2);

      setOutput(output, 'json-output-line-numbers', formatted);
      localStorage.setItem(KEYS.jsonOutput, formatted);

      const lines = formatted.split('\n').length;
      const size = new Blob([formatted]).size;
      const sizeStr = size > 1024 ? `${(size / 1024).toFixed(1)} KB` : `${size} B`;
      setStatus(statusBar, 'ok', `Valid JSON · ${lines} lines · ${sizeStr}`);
      input.classList.remove('has-error');
    } catch (err) {
      input.classList.add('has-error');
      clearOutput(output, 'json-output-line-numbers');
      localStorage.removeItem(KEYS.jsonOutput);
      setStatus(statusBar, 'error', 'Invalid JSON', err.message);
    }
  }

  formatBtn.addEventListener('click', () => processJSON(false));
  minifyBtn.addEventListener('click', () => processJSON(true));

  // Auto-validate on input (debounced)
  let debounceTimer;
  input.addEventListener('input', () => {
    input.classList.remove('has-error');
    localStorage.setItem(KEYS.jsonInput, input.value);
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      if (input.value.trim()) processJSON(false);
    }, 600);
  });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    output.value = '';
    input.classList.remove('has-error');
    buildLineNumbers('', 'json-line-numbers');
    buildLineNumbers('', 'json-output-line-numbers');
    localStorage.removeItem(KEYS.jsonInput);
    localStorage.removeItem(KEYS.jsonOutput);
    setStatus(statusBar, 'idle', 'Ready · Paste JSON and click Format');
    input.focus();
  });

  pasteBtn.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      input.value = text;
      localStorage.setItem(KEYS.jsonInput, text);
      buildLineNumbers(text, 'json-line-numbers');
      input.dispatchEvent(new Event('input'));
    } catch {
      showToast('Clipboard access denied', 'error-toast');
    }
  });

  copyBtn.addEventListener('click', () => {
    const text = output.value;
    if (!text) {
      showToast('Nothing to copy – format first', 'error-toast');
      return;
    }
    copyToClipboard(text, copyBtn);
  });

  // Tab key support in both panes
  [input, output].forEach(ta => {
    ta.addEventListener('keydown', e => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const s = ta.selectionStart;
        ta.value = ta.value.slice(0, s) + '  ' + ta.value.slice(ta.selectionEnd);
        ta.selectionStart = ta.selectionEnd = s + 2;
        buildLineNumbers(ta.value, ta === input ? 'json-line-numbers' : 'json-output-line-numbers');
      }
    });
  });

  // Restore status based on saved content
  if (savedOutput) {
    const lines = savedOutput.split('\n').length;
    const size = new Blob([savedOutput]).size;
    const sizeStr = size > 1024 ? `${(size / 1024).toFixed(1)} KB` : `${size} B`;
    setStatus(statusBar, 'ok', `Restored · ${lines} lines · ${sizeStr}`);
  } else if (savedInput) {
    setStatus(statusBar, 'idle', 'Input restored · Click Format to validate');
  }
}


// ===== YAML Module =====

function initYAML() {
  const input = document.getElementById('yaml-input');
  const output = document.getElementById('yaml-output');
  const statusBar = 'yaml-status-bar';
  const copyBtn = document.getElementById('yaml-copy-btn');
  const formatBtn = document.getElementById('yaml-format-btn');
  const clearBtn = document.getElementById('yaml-clear-btn');
  const pasteBtn = document.getElementById('yaml-paste-btn');

  // Restore from localStorage
  const savedInput = localStorage.getItem(KEYS.yamlInput);
  const savedOutput = localStorage.getItem(KEYS.yamlOutput);
  if (savedInput) input.value = savedInput;
  if (savedOutput) output.value = savedOutput;
  buildLineNumbers(input.value, 'yaml-line-numbers');
  buildLineNumbers(output.value, 'yaml-output-line-numbers');

  syncLineNumbers(input, 'yaml-line-numbers');
  syncLineNumbers(output, 'yaml-output-line-numbers');

  // Persist output edits
  output.addEventListener('input', () => {
    localStorage.setItem(KEYS.yamlOutput, output.value);
    buildLineNumbers(output.value, 'yaml-output-line-numbers');
  });

  function processYAML() {
    const raw = input.value.trim();

    localStorage.setItem(KEYS.yamlInput, input.value);

    if (!raw) {
      clearOutput(output, 'yaml-output-line-numbers');
      localStorage.removeItem(KEYS.yamlOutput);
      setStatus(statusBar, 'idle', 'Ready · Paste YAML and click Format');
      return;
    }

    try {
      const docs = [];
      jsyaml.loadAll(raw, doc => docs.push(doc));

      let formatted;
      if (docs.length === 1) {
        formatted = jsyaml.dump(docs[0], {
          indent: 2,
          lineWidth: -1,
          noRefs: true,
          sortKeys: false,
        });
      } else {
        formatted = docs.map(d => jsyaml.dump(d, {
          indent: 2,
          lineWidth: -1,
          noRefs: true,
          sortKeys: false,
        })).join('---\n');
      }
      formatted = formatted.trimEnd();

      setOutput(output, 'yaml-output-line-numbers', formatted);
      localStorage.setItem(KEYS.yamlOutput, formatted);

      const lines = formatted.split('\n').length;
      const size = new Blob([formatted]).size;
      const sizeStr = size > 1024 ? `${(size / 1024).toFixed(1)} KB` : `${size} B`;
      setStatus(statusBar, 'ok', `Valid YAML · ${lines} lines · ${sizeStr}`);
      input.classList.remove('has-error');
    } catch (err) {
      input.classList.add('has-error');
      clearOutput(output, 'yaml-output-line-numbers');
      localStorage.removeItem(KEYS.yamlOutput);

      let detail = '';
      if (err.mark) detail = `Line ${err.mark.line + 1}, Col ${err.mark.column + 1}`;
      setStatus(statusBar, 'error', `Invalid YAML${detail ? ` · ${detail}` : ''}`, err.message);
    }
  }

  formatBtn.addEventListener('click', () => processYAML());

  let debounceTimer;
  input.addEventListener('input', () => {
    input.classList.remove('has-error');
    localStorage.setItem(KEYS.yamlInput, input.value);
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      if (input.value.trim()) processYAML();
    }, 600);
  });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    output.value = '';
    input.classList.remove('has-error');
    buildLineNumbers('', 'yaml-line-numbers');
    buildLineNumbers('', 'yaml-output-line-numbers');
    localStorage.removeItem(KEYS.yamlInput);
    localStorage.removeItem(KEYS.yamlOutput);
    setStatus(statusBar, 'idle', 'Ready · Paste YAML and click Format');
    input.focus();
  });

  pasteBtn.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      input.value = text;
      localStorage.setItem(KEYS.yamlInput, text);
      buildLineNumbers(text, 'yaml-line-numbers');
      input.dispatchEvent(new Event('input'));
    } catch {
      showToast('Clipboard access denied', 'error-toast');
    }
  });

  copyBtn.addEventListener('click', () => {
    const text = output.value;
    if (!text) {
      showToast('Nothing to copy – format first', 'error-toast');
      return;
    }
    copyToClipboard(text, copyBtn);
  });

  [input, output].forEach(ta => {
    ta.addEventListener('keydown', e => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const s = ta.selectionStart;
        ta.value = ta.value.slice(0, s) + '  ' + ta.value.slice(ta.selectionEnd);
        ta.selectionStart = ta.selectionEnd = s + 2;
        buildLineNumbers(ta.value, ta === input ? 'yaml-line-numbers' : 'yaml-output-line-numbers');
      }
    });
  });

  // Restore status
  if (savedOutput) {
    const lines = savedOutput.split('\n').length;
    const size = new Blob([savedOutput]).size;
    const sizeStr = size > 1024 ? `${(size / 1024).toFixed(1)} KB` : `${size} B`;
    setStatus(statusBar, 'ok', `Restored · ${lines} lines · ${sizeStr}`);
  } else if (savedInput) {
    setStatus(statusBar, 'idle', 'Input restored · Click Format to validate');
  }
}


// ===== Tab Switching =====

function initTabs() {
  const tabs = document.querySelectorAll('.tab');
  const panels = document.querySelectorAll('.panel');

  // Restore last active tab
  const savedTab = localStorage.getItem(KEYS.activeTab) || 'json';

  function activateTab(mode) {
    tabs.forEach(t => {
      const active = t.dataset.mode === mode;
      t.classList.toggle('active', active);
      t.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    panels.forEach(p => p.classList.toggle('active', p.id === `panel-${mode}`));
    localStorage.setItem(KEYS.activeTab, mode);
  }

  tabs.forEach(tab => {
    tab.addEventListener('click', () => activateTab(tab.dataset.mode));
  });

  activateTab(savedTab);
}


// ===== Favicon =====

function setFavicon() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
    <rect width="32" height="32" rx="8" fill="#13161d"/>
    <text x="16" y="22" text-anchor="middle" font-family="monospace" font-size="18" fill="#63b3ed">⚡</text>
  </svg>`;
  const link = document.querySelector('link[rel="icon"]');
  if (link) link.href = `data:image/svg+xml,${encodeURIComponent(svg)}`;
}


// ===== Bootstrap =====

document.addEventListener('DOMContentLoaded', () => {
  setFavicon();
  initTabs();
  initJSON();
  initYAML();
});
