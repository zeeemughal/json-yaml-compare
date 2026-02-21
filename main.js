import jsyaml from 'js-yaml';

// ===== Utilities =====

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

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
  textarea.addEventListener('input', () => buildLineNumbers(textarea.value, lineNumId));
  textarea.addEventListener('scroll', () => {
    const ln = document.getElementById(lineNumId);
    if (ln) ln.scrollTop = textarea.scrollTop;
  });
  buildLineNumbers(textarea.value, lineNumId);
}

// ===== JSON Syntax Highlighter =====

function highlightJSON(str) {
  // Tokenize JSON into highlighted HTML
  const tokenRegex = /("(\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+\.?\d*(?:[eE][+\-]?\d+)?|[{}\[\],:])/g;
  let result = '';
  let lastIndex = 0;

  str.replace(tokenRegex, (match, _full, _inner, _colon, _keyword, offset) => {
    // Append anything before this match (whitespace etc.)
    result += escapeHtml(str.slice(lastIndex, offset));
    lastIndex = offset + match.length;

    let cls = 'token-punct';
    if (/^"/.test(match)) {
      if (/:$/.test(match)) {
        cls = 'token-key';
      } else {
        cls = 'token-string';
      }
    } else if (/true|false/.test(match)) {
      cls = 'token-bool';
    } else if (/null/.test(match)) {
      cls = 'token-null';
    } else if (/^-?\d/.test(match)) {
      cls = 'token-number';
    }

    result += `<span class="${cls}">${escapeHtml(match)}</span>`;
  });

  result += escapeHtml(str.slice(lastIndex));
  return result;
}

// ===== YAML Syntax Highlighter =====

function highlightYAML(str) {
  const lines = str.split('\n');
  return lines.map(line => {
    // Comment
    if (/^\s*#/.test(line)) {
      return `<span class="token-yaml-comment">${escapeHtml(line)}</span>`;
    }
    // Key: value
    const kvMatch = line.match(/^(\s*)([\w\-./]+)(\s*:\s*)(.*)/);
    if (kvMatch) {
      const [, indent, key, colon, val] = kvMatch;
      let valHtml = '';
      const trimVal = val.trim();
      if (trimVal === 'true' || trimVal === 'false') {
        valHtml = `<span class="token-bool">${escapeHtml(val)}</span>`;
      } else if (trimVal === 'null' || trimVal === '~') {
        valHtml = `<span class="token-null">${escapeHtml(val)}</span>`;
      } else if (/^-?\d+\.?\d*$/.test(trimVal)) {
        valHtml = `<span class="token-number">${escapeHtml(val)}</span>`;
      } else if (trimVal !== '') {
        valHtml = `<span class="token-yaml-val">${escapeHtml(val)}</span>`;
      }
      return `${escapeHtml(indent)}<span class="token-yaml-key">${escapeHtml(key)}</span><span class="token-punct">${escapeHtml(colon)}</span>${valHtml}`;
    }
    // List item
    const listMatch = line.match(/^(\s*)(- )(.*)/);
    if (listMatch) {
      const [, indent, dash, rest] = listMatch;
      return `${escapeHtml(indent)}<span class="token-yaml-dash">${escapeHtml(dash)}</span><span class="token-yaml-val">${escapeHtml(rest)}</span>`;
    }
    return escapeHtml(line);
  }).join('\n');
}


// ===== Status Bar =====

function setStatus(barId, type, message, detail = '') {
  const bar = document.getElementById(barId);
  if (!bar) return;
  let inner = '';
  if (type === 'idle') {
    inner = `<span class="status-idle">${escapeHtml(message)}</span>`;
  } else if (type === 'ok') {
    inner = `<span class="status-ok">${escapeHtml(message)}</span>`;
  } else if (type === 'error') {
    inner = `<span class="status-error">${escapeHtml(message)}</span>`;
    if (detail) inner += `<span class="err-detail">${escapeHtml(detail)}</span>`;
  }
  bar.innerHTML = inner;
}

// ===== Output Render =====

function renderOutput(outputEl, lineNumId, html, rawText) {
  outputEl.innerHTML = html;
  buildLineNumbers(rawText, lineNumId);
  // Sync scroll
  outputEl.scrollTop = 0;
}

function renderError(outputEl, lineNumId, message) {
  outputEl.innerHTML = `<span style="color:var(--error)">${escapeHtml(message)}</span>`;
  buildLineNumbers('', lineNumId);
}


// ===== JSON Module =====

function initJSON() {
  const input      = document.getElementById('json-input');
  const output     = document.getElementById('json-output');
  const statusBar  = 'json-status-bar';
  const copyBtn    = document.getElementById('json-copy-btn');
  const formatBtn  = document.getElementById('json-format-btn');
  const minifyBtn  = document.getElementById('json-minify-btn');
  const clearBtn   = document.getElementById('json-clear-btn');
  const pasteBtn   = document.getElementById('json-paste-btn');

  let lastFormatted = '';

  // Line numbers
  syncLineNumbers(input, 'json-line-numbers');

  function processJSON(minify = false) {
    const raw = input.value.trim();
    if (!raw) {
      renderError(output, 'json-output-line-numbers', '');
      setStatus(statusBar, 'idle', 'Ready · Paste JSON and click Format');
      return;
    }

    try {
      const parsed = JSON.parse(raw);
      let formatted;
      if (minify) {
        formatted = JSON.stringify(parsed);
      } else {
        formatted = JSON.stringify(parsed, null, 2);
      }
      lastFormatted = formatted;
      const highlighted = highlightJSON(formatted);
      renderOutput(output, 'json-output-line-numbers', highlighted, formatted);

      const lines = formatted.split('\n').length;
      const size = new Blob([formatted]).size;
      const sizeStr = size > 1024 ? `${(size / 1024).toFixed(1)} KB` : `${size} B`;
      setStatus(statusBar, 'ok', `Valid JSON · ${lines} lines · ${sizeStr}`);
    } catch (err) {
      lastFormatted = '';
      renderError(output, 'json-output-line-numbers', err.message);

      // Parse line/col from error message
      const match = err.message.match(/line (\d+)/i) || err.message.match(/position (\d+)/i);
      setStatus(statusBar, 'error', 'Invalid JSON', err.message);

      // Try to highlight the error line in the input
      highlightErrorLine(input, err.message);
    }
  }

  function highlightErrorLine(textarea, errMsg) {
    textarea.classList.add('has-error');
    // Only remove after next successful parse
  }

  formatBtn.addEventListener('click', () => processJSON(false));
  minifyBtn.addEventListener('click', () => processJSON(true));

  // Auto-validate on input (debounced)
  let debounceTimer;
  input.addEventListener('input', () => {
    input.classList.remove('has-error');
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      if (input.value.trim()) processJSON(false);
    }, 600);
  });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    output.innerHTML = '';
    lastFormatted = '';
    input.classList.remove('has-error');
    buildLineNumbers('', 'json-line-numbers');
    buildLineNumbers('', 'json-output-line-numbers');
    setStatus(statusBar, 'idle', 'Ready · Paste JSON and click Format');
    input.focus();
  });

  pasteBtn.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      input.value = text;
      buildLineNumbers(text, 'json-line-numbers');
      input.dispatchEvent(new Event('input'));
    } catch {
      showToast('Clipboard access denied', 'error-toast');
    }
  });

  copyBtn.addEventListener('click', () => {
    if (!lastFormatted) {
      showToast('Nothing to copy – format first', 'error-toast');
      return;
    }
    copyToClipboard(lastFormatted, copyBtn);
  });

  // Tab key support
  input.addEventListener('keydown', e => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const s = input.selectionStart;
      input.value = input.value.slice(0, s) + '  ' + input.value.slice(input.selectionEnd);
      input.selectionStart = input.selectionEnd = s + 2;
      buildLineNumbers(input.value, 'json-line-numbers');
    }
  });
}


// ===== YAML Module =====

function initYAML() {
  const input      = document.getElementById('yaml-input');
  const output     = document.getElementById('yaml-output');
  const statusBar  = 'yaml-status-bar';
  const copyBtn    = document.getElementById('yaml-copy-btn');
  const formatBtn  = document.getElementById('yaml-format-btn');
  const clearBtn   = document.getElementById('yaml-clear-btn');
  const pasteBtn   = document.getElementById('yaml-paste-btn');

  let lastFormatted = '';

  syncLineNumbers(input, 'yaml-line-numbers');

  function processYAML() {
    const raw = input.value.trim();
    if (!raw) {
      renderError(output, 'yaml-output-line-numbers', '');
      setStatus(statusBar, 'idle', 'Ready · Paste YAML and click Format');
      return;
    }

    try {
      // Parse all documents (support multi-doc YAML)
      const docs = [];
      jsyaml.loadAll(raw, doc => docs.push(doc));

      // Re-dump for canonical formatting
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

      // Remove trailing newline from dump
      formatted = formatted.trimEnd();
      lastFormatted = formatted;

      const highlighted = highlightYAML(formatted);
      renderOutput(output, 'yaml-output-line-numbers', highlighted, formatted);

      const lines = formatted.split('\n').length;
      const size = new Blob([formatted]).size;
      const sizeStr = size > 1024 ? `${(size / 1024).toFixed(1)} KB` : `${size} B`;
      setStatus(statusBar, 'ok', `Valid YAML · ${lines} lines · ${sizeStr}`);
      input.classList.remove('has-error');
    } catch (err) {
      lastFormatted = '';
      input.classList.add('has-error');

      let errMsg = err.message || 'Unknown YAML error';
      // js-yaml provides mark with line/col
      let detail = '';
      if (err.mark) {
        detail = `Line ${err.mark.line + 1}, Col ${err.mark.column + 1}`;
      }

      renderError(output, 'yaml-output-line-numbers', errMsg);
      setStatus(statusBar, 'error', `Invalid YAML${detail ? ` · ${detail}` : ''}`, errMsg);
    }
  }

  formatBtn.addEventListener('click', () => processYAML());

  let debounceTimer;
  input.addEventListener('input', () => {
    input.classList.remove('has-error');
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      if (input.value.trim()) processYAML();
    }, 600);
  });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    output.innerHTML = '';
    lastFormatted = '';
    input.classList.remove('has-error');
    buildLineNumbers('', 'yaml-line-numbers');
    buildLineNumbers('', 'yaml-output-line-numbers');
    setStatus(statusBar, 'idle', 'Ready · Paste YAML and click Format');
    input.focus();
  });

  pasteBtn.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      input.value = text;
      buildLineNumbers(text, 'yaml-line-numbers');
      input.dispatchEvent(new Event('input'));
    } catch {
      showToast('Clipboard access denied', 'error-toast');
    }
  });

  copyBtn.addEventListener('click', () => {
    if (!lastFormatted) {
      showToast('Nothing to copy – format first', 'error-toast');
      return;
    }
    copyToClipboard(lastFormatted, copyBtn);
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const s = input.selectionStart;
      input.value = input.value.slice(0, s) + '  ' + input.value.slice(input.selectionEnd);
      input.selectionStart = input.selectionEnd = s + 2;
      buildLineNumbers(input.value, 'yaml-line-numbers');
    }
  });
}


// ===== Tab Switching =====

function initTabs() {
  const tabs = document.querySelectorAll('.tab');
  const panels = document.querySelectorAll('.panel');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const mode = tab.dataset.mode;

      tabs.forEach(t => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      panels.forEach(p => p.classList.remove('active'));

      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
      const panel = document.getElementById(`panel-${mode}`);
      if (panel) panel.classList.add('active');
    });
  });
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
