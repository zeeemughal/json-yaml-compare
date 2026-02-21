import jsyaml from 'js-yaml';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { basicSetup } from 'codemirror';
import { indentWithTab } from '@codemirror/commands';
import { json } from '@codemirror/lang-json';
import { yaml } from '@codemirror/lang-yaml';
import { vscodeDark } from '@uiw/codemirror-theme-vscode';

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


// ===== CodeMirror Helper =====

function createEditor(parentEl, initialDoc, langExt, onChange = null) {
  const customTheme = EditorView.theme({
    "&": { height: "100%", backgroundColor: "transparent", color: "var(--text-primary)" },
    ".cm-scroller": { fontFamily: "var(--font-code)", fontSize: "13px", lineHeight: "1.6" },
    ".cm-content": { padding: "14px 0" },
    ".cm-gutters": {
      backgroundColor: "var(--bg-base)",
      color: "var(--text-muted)",
      borderRight: "1px solid var(--border)",
    },
    ".cm-lineNumbers .cm-gutterElement": { padding: "0 10px 0 14px", minWidth: "46px" },
    ".cm-cursor": { borderLeftColor: "var(--text-primary)" }
  }, { dark: true });

  const extensions = [
    basicSetup,
    langExt(),
    vscodeDark,
    customTheme,
    keymap.of([indentWithTab])
  ];

  if (onChange) {
    extensions.push(EditorView.updateListener.of((update) => {
      if (update.docChanged) onChange(update.state.doc.toString());
    }));
  }

  const state = EditorState.create({ doc: initialDoc, extensions });
  return new EditorView({ state, parent: parentEl });
}

function setEditorDoc(view, text) {
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: text }
  });
}


// ===== JSON Module =====

function initJSON() {
  const inputContainer = document.getElementById('json-input');
  const outputContainer = document.getElementById('json-output');
  const statusBar = 'json-status-bar';
  const copyBtn = document.getElementById('json-copy-btn');
  const formatBtn = document.getElementById('json-format-btn');
  const minifyBtn = document.getElementById('json-minify-btn');
  const clearBtn = document.getElementById('json-clear-btn');
  const pasteBtn = document.getElementById('json-paste-btn');

  // Restore from localStorage
  const defaultInput = `{\n  "name": "DevFormat",\n  "awesome": true\n}`;
  let savedInput = localStorage.getItem(KEYS.jsonInput);
  if (savedInput === null) savedInput = defaultInput;
  const savedOutput = localStorage.getItem(KEYS.jsonOutput) || '';

  let debounceTimer;

  // Initialize CodeMirror Editors
  const inputEditor = createEditor(inputContainer, savedInput, json, (val) => {
    localStorage.setItem(KEYS.jsonInput, val);
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      if (val.trim()) processJSON(false);
    }, 600);
  });

  const outputEditor = createEditor(outputContainer, savedOutput, json, (val) => {
    localStorage.setItem(KEYS.jsonOutput, val);
  });

  function processJSON(minify = false) {
    const raw = inputEditor.state.doc.toString().trim();
    if (!raw) {
      setEditorDoc(outputEditor, '');
      localStorage.removeItem(KEYS.jsonOutput);
      setStatus(statusBar, 'idle', 'Ready · Paste JSON and click Format');
      return;
    }

    try {
      const parsed = JSON.parse(raw);
      const formatted = minify
        ? JSON.stringify(parsed)
        : JSON.stringify(parsed, null, 2);

      setEditorDoc(outputEditor, formatted);
      localStorage.setItem(KEYS.jsonOutput, formatted);

      const lines = formatted.split('\n').length;
      const size = new Blob([formatted]).size;
      const sizeStr = size > 1024 ? `${(size / 1024).toFixed(1)} KB` : `${size} B`;
      setStatus(statusBar, 'ok', `Valid JSON · ${lines} lines · ${sizeStr}`);
    } catch (err) {
      setEditorDoc(outputEditor, '');
      localStorage.removeItem(KEYS.jsonOutput);
      setStatus(statusBar, 'error', 'Invalid JSON', err.message);
    }
  }

  formatBtn.addEventListener('click', () => processJSON(false));
  minifyBtn.addEventListener('click', () => processJSON(true));

  clearBtn.addEventListener('click', () => {
    setEditorDoc(inputEditor, '');
    setEditorDoc(outputEditor, '');
    localStorage.removeItem(KEYS.jsonInput);
    localStorage.removeItem(KEYS.jsonOutput);
    setStatus(statusBar, 'idle', 'Ready · Paste JSON and click Format');
    inputEditor.focus();
  });

  pasteBtn.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      setEditorDoc(inputEditor, text);
      localStorage.setItem(KEYS.jsonInput, text);
      processJSON(false);
    } catch {
      showToast('Clipboard access denied', 'error-toast');
    }
  });

  copyBtn.addEventListener('click', () => {
    const text = outputEditor.state.doc.toString();
    if (!text) {
      showToast('Nothing to copy – format first', 'error-toast');
      return;
    }
    copyToClipboard(text, copyBtn);
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
  const inputContainer = document.getElementById('yaml-input');
  const outputContainer = document.getElementById('yaml-output');
  const statusBar = 'yaml-status-bar';
  const copyBtn = document.getElementById('yaml-copy-btn');
  const formatBtn = document.getElementById('yaml-format-btn');
  const clearBtn = document.getElementById('yaml-clear-btn');
  const pasteBtn = document.getElementById('yaml-paste-btn');

  // Restore from localStorage
  const defaultInput = `name: DevFormat\nawesome: true\nfeatures:\n  - format\n  - validate`;
  let savedInput = localStorage.getItem(KEYS.yamlInput);
  if (savedInput === null) savedInput = defaultInput;
  const savedOutput = localStorage.getItem(KEYS.yamlOutput) || '';

  let debounceTimer;

  const inputEditor = createEditor(inputContainer, savedInput, yaml, (val) => {
    localStorage.setItem(KEYS.yamlInput, val);
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      if (val.trim()) processYAML();
    }, 600);
  });

  const outputEditor = createEditor(outputContainer, savedOutput, yaml, (val) => {
    localStorage.setItem(KEYS.yamlOutput, val);
  });

  function processYAML() {
    const raw = inputEditor.state.doc.toString().trim();
    if (!raw) {
      setEditorDoc(outputEditor, '');
      localStorage.removeItem(KEYS.yamlOutput);
      setStatus(statusBar, 'idle', 'Ready · Paste YAML and click Format');
      return;
    }

    try {
      const docs = [];
      jsyaml.loadAll(raw, doc => docs.push(doc));

      let formatted;
      if (docs.length === 1) {
        formatted = jsyaml.dump(docs[0], { indent: 2, lineWidth: -1, noRefs: true, sortKeys: false });
      } else {
        formatted = docs.map(d => jsyaml.dump(d, { indent: 2, lineWidth: -1, noRefs: true, sortKeys: false })).join('---\n');
      }
      formatted = formatted.trimEnd();

      setEditorDoc(outputEditor, formatted);
      localStorage.setItem(KEYS.yamlOutput, formatted);

      const lines = formatted.split('\n').length;
      const size = new Blob([formatted]).size;
      const sizeStr = size > 1024 ? `${(size / 1024).toFixed(1)} KB` : `${size} B`;
      setStatus(statusBar, 'ok', `Valid YAML · ${lines} lines · ${sizeStr}`);
    } catch (err) {
      setEditorDoc(outputEditor, '');
      localStorage.removeItem(KEYS.yamlOutput);

      let detail = '';
      if (err.mark) detail = `Line ${err.mark.line + 1}, Col ${err.mark.column + 1}`;
      setStatus(statusBar, 'error', `Invalid YAML${detail ? ` · ${detail}` : ''}`, err.message);
    }
  }

  formatBtn.addEventListener('click', () => processYAML());

  clearBtn.addEventListener('click', () => {
    setEditorDoc(inputEditor, '');
    setEditorDoc(outputEditor, '');
    localStorage.removeItem(KEYS.yamlInput);
    localStorage.removeItem(KEYS.yamlOutput);
    setStatus(statusBar, 'idle', 'Ready · Paste YAML and click Format');
    inputEditor.focus();
  });

  pasteBtn.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      setEditorDoc(inputEditor, text);
      localStorage.setItem(KEYS.yamlInput, text);
      processYAML();
    } catch {
      showToast('Clipboard access denied', 'error-toast');
    }
  });

  copyBtn.addEventListener('click', () => {
    const text = outputEditor.state.doc.toString();
    if (!text) {
      showToast('Nothing to copy – format first', 'error-toast');
      return;
    }
    copyToClipboard(text, copyBtn);
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
