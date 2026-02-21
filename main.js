import YAML from 'yaml';
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap, Decoration, ViewPlugin } from '@codemirror/view';
import { basicSetup } from 'codemirror';
import { indentWithTab, undo, redo } from '@codemirror/commands';
import { HighlightStyle, syntaxHighlighting, syntaxTree } from '@codemirror/language';
import { json } from '@codemirror/lang-json';
import { yaml } from '@codemirror/lang-yaml';
import { vscodeDark, vscodeLight } from '@uiw/codemirror-theme-vscode';
import { tags } from '@lezer/highlight';

// Custom YAML highlight style — @lezer/yaml uses these specific tags:
//   tags.content              → unquoted scalars (strings, booleans, numbers, nulls)
//   tags.string               → quoted string literals
//   tags.definition(tags.propertyName) → keys
//   tags.separator            → : , - separators
//   tags.labelName            → anchors & aliases
//   tags.lineComment          → comments
//   tags.keyword              → directive names (%YAML, %TAG)
//   tags.attributeValue       → directive content
//   tags.meta                 → --- / ... markers
//   tags.typeName             → !! tags
const yamlHighlight = syntaxHighlighting(
  HighlightStyle.define([
    { tag: tags.definition(tags.propertyName), color: 'var(--yaml-key)' }, // keys
    { tag: tags.propertyName, color: 'var(--yaml-key)' }, // keys fallback
    { tag: tags.content, color: 'var(--yaml-string)' }, // unquoted values
    { tag: tags.string, color: 'var(--yaml-string)' }, // quoted strings
    { tag: tags.attributeValue, color: 'var(--yaml-string)' }, // directive values
    { tag: tags.special(tags.string), color: 'var(--yaml-string)' }, // block literal headers
    { tag: tags.separator, color: 'var(--yaml-punct)' }, // : , -
    { tag: tags.lineComment, color: 'var(--yaml-comment)', fontStyle: 'italic' },
    { tag: tags.keyword, color: 'var(--yaml-bool)' }, // directives
    { tag: tags.meta, color: 'var(--yaml-punct)' }, // --- ...
    { tag: tags.typeName, color: 'var(--yaml-number)' }, // !! tags
    { tag: tags.labelName, color: 'var(--yaml-bool)' }, // anchors & aliases
    { tag: tags.squareBracket, color: 'var(--yaml-punct)' },
    { tag: tags.brace, color: 'var(--yaml-punct)' },
    { tag: tags.punctuation, color: 'var(--yaml-punct)' },
  ])
);

const yamlValueDecorations = ViewPlugin.fromClass(class {
  constructor(view) {
    this.decorations = this.buildDecorations(view);
  }
  update(update) {
    if (update.docChanged || update.viewportChanged) {
      this.decorations = this.buildDecorations(update.view);
    }
  }
  buildDecorations(view) {
    const builder = [];
    const doc = view.state.doc;
    for (const { from, to } of view.visibleRanges) {
      syntaxTree(view.state).iterate({
        from, to,
        enter(node) {
          if (node.name === "Literal") {
            const text = doc.sliceString(node.from, node.to);
            if (/^(?:true|false)$/.test(text)) {
              builder.push(Decoration.mark({ class: "cm-yaml-bool" }).range(node.from, node.to));
            } else if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(text)) {
              builder.push(Decoration.mark({ class: "cm-yaml-number" }).range(node.from, node.to));
            } else if (text === "null" || text === "~") {
              builder.push(Decoration.mark({ class: "cm-yaml-null" }).range(node.from, node.to));
            }
          }
        }
      });
    }
    // builder array needs to be sorted for Decoration.set, but iterate goes in order
    return Decoration.set(builder);
  }
}, {
  decorations: v => v.decorations
});

// ===== Storage Keys =====
const KEYS = {
  jsonInput: 'devformat_json_input',
  jsonOutput: 'devformat_json_output',
  yamlInput: 'devformat_yaml_input',
  yamlOutput: 'devformat_yaml_output',
  activeTab: 'devformat_active_tab',
  themePref: 'devformat_theme',
};

// Global Store for Theme Compartments to live-swap the Editor theme
const themeCompartments = [];

// Get active CodeMirror theme based on current mode
function getActiveEditorTheme() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark' ||
    (document.documentElement.getAttribute('data-theme') === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  return isDark ? vscodeDark : vscodeLight;
}

// ===== Theme Initialization =====
function initTheme() {
  const themeToggle = document.getElementById('theme-toggle');

  const ICONS = {
    dark: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`,
    light: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`,
    auto: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>`
  };

  const THEMES = ['auto', 'dark', 'light'];
  let currentPref = localStorage.getItem(KEYS.themePref) || 'auto';

  function applyTheme(pref) {
    if (pref === 'auto') {
      const isSystemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.setAttribute('data-theme', isSystemDark ? 'dark' : 'light');
    } else {
      document.documentElement.setAttribute('data-theme', pref);
    }
    themeToggle.innerHTML = ICONS[pref];

    // Live switch existing editors
    const newTheme = getActiveEditorTheme();
    themeCompartments.forEach(({ view, compartment }) => {
      view.dispatch({ effects: compartment.reconfigure(newTheme) });
    });
  }

  themeToggle.addEventListener('click', () => {
    const nextIdx = (THEMES.indexOf(currentPref) + 1) % THEMES.length;
    currentPref = THEMES[nextIdx];
    localStorage.setItem(KEYS.themePref, currentPref);
    applyTheme(currentPref);
  });

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (localStorage.getItem(KEYS.themePref) === 'auto' || !localStorage.getItem(KEYS.themePref)) {
      applyTheme('auto');
    }
  });

  applyTheme(currentPref);
}

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
  }, { dark: false }); // Let the base theme (vscodeDark/vscodeLight) handle general dark/light tokens

  const isYaml = langExt === yaml;
  const themeCompartment = new Compartment();

  const extensions = [
    basicSetup,
    langExt(),
    themeCompartment.of(getActiveEditorTheme()),
    ...(isYaml ? [yamlHighlight, yamlValueDecorations] : []),
    customTheme,
    keymap.of([indentWithTab])
  ];

  if (onChange) {
    extensions.push(EditorView.updateListener.of((update) => {
      // only trigger onChange for explicit user edits, not formatting replacements
      if (update.docChanged && update.transactions.some(tr => tr.isUserEvent("input") || tr.isUserEvent("delete") || tr.isUserEvent("undo") || tr.isUserEvent("redo") || tr.isUserEvent("paste"))) {
        onChange(update.state.doc.toString());
      }
    }));
  }

  const state = EditorState.create({ doc: initialDoc, extensions });
  const view = new EditorView({ state, parent: parentEl });

  themeCompartments.push({ view, compartment: themeCompartment });
  return view;
}

function setEditorDoc(view, text, isUserAction = false) {
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: text },
    userEvent: isUserAction ? "input" : undefined
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
  let isSyncing = false;

  // Initialize CodeMirror Editors
  const inputEditor = createEditor(inputContainer, savedInput, json, (val) => {
    if (isSyncing) return;
    localStorage.setItem(KEYS.jsonInput, val);
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      if (val.trim()) processJSON(false, true);
    }, 600);
  });

  const outputEditor = createEditor(outputContainer, savedOutput, json, (val) => {
    if (isSyncing) return;
    localStorage.setItem(KEYS.jsonOutput, val);
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      if (!val.trim()) {
        isSyncing = true;
        setEditorDoc(inputEditor, '', true);
        isSyncing = false;
        return;
      }
      try {
        JSON.parse(val); // only sync back if valid
        isSyncing = true;
        setEditorDoc(inputEditor, val, true);
        isSyncing = false;
      } catch (e) { }
    }, 600);
  });

  function processJSON(minify = false, fromInput = true) {
    const raw = fromInput ? inputEditor.state.doc.toString().trim() : outputEditor.state.doc.toString().trim();
    if (!raw) {
      if (fromInput) {
        isSyncing = true;
        setEditorDoc(outputEditor, '');
        isSyncing = false;
        localStorage.removeItem(KEYS.jsonOutput);
      }
      setStatus(statusBar, 'idle', 'Ready · Paste JSON and click Format');
      return;
    }

    try {
      const parsed = JSON.parse(raw);
      const formatted = minify
        ? JSON.stringify(parsed)
        : JSON.stringify(parsed, null, 2);

      isSyncing = true;
      if (fromInput) setEditorDoc(outputEditor, formatted);
      else setEditorDoc(inputEditor, formatted, true);
      isSyncing = false;
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
    isSyncing = true;
    setEditorDoc(inputEditor, '', true);
    setEditorDoc(outputEditor, '');
    isSyncing = false;
    localStorage.removeItem(KEYS.jsonInput);
    localStorage.removeItem(KEYS.jsonOutput);
    setStatus(statusBar, 'idle', 'Ready · Paste JSON and click Format');
    inputEditor.focus();
  });

  pasteBtn.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      isSyncing = true;
      setEditorDoc(inputEditor, text, true);
      isSyncing = false;
      localStorage.setItem(KEYS.jsonInput, text);
      processJSON(false, true);
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
  let isSyncing = false;

  const inputEditor = createEditor(inputContainer, savedInput, yaml, (val) => {
    if (isSyncing) return;
    localStorage.setItem(KEYS.yamlInput, val);
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      if (val.trim()) processYAML(true);
    }, 600);
  });

  const outputEditor = createEditor(outputContainer, savedOutput, yaml, (val) => {
    if (isSyncing) return;
    localStorage.setItem(KEYS.yamlOutput, val);
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      if (!val.trim()) {
        isSyncing = true;
        setEditorDoc(inputEditor, '', true);
        isSyncing = false;
        return;
      }
      try {
        YAML.parse(val); // dry run to validate
        isSyncing = true;
        setEditorDoc(inputEditor, val, true);
        isSyncing = false;
      } catch (e) { }
    }, 600);
  });

  function processYAML(fromInput = true) {
    const raw = fromInput ? inputEditor.state.doc.toString().trim() : outputEditor.state.doc.toString().trim();
    if (!raw) {
      if (fromInput) {
        isSyncing = true;
        setEditorDoc(outputEditor, '');
        isSyncing = false;
        localStorage.removeItem(KEYS.yamlOutput);
      }
      setStatus(statusBar, 'idle', 'Ready · Paste YAML and click Format');
      return;
    }

    try {
      // The `yaml` package preserves comments by default when document stringifying
      const docs = YAML.parseAllDocuments(raw);
      let formatted = docs.map(doc => doc.toString({ indent: 2, lineWidth: 0 })).join('\n---\n');
      formatted = formatted.trimEnd();

      isSyncing = true;
      if (fromInput) setEditorDoc(outputEditor, formatted);
      else setEditorDoc(inputEditor, formatted, true);
      isSyncing = false;
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

  formatBtn.addEventListener('click', () => processYAML(true));

  clearBtn.addEventListener('click', () => {
    isSyncing = true;
    setEditorDoc(inputEditor, '', true);
    setEditorDoc(outputEditor, '');
    isSyncing = false;
    localStorage.removeItem(KEYS.yamlInput);
    localStorage.removeItem(KEYS.yamlOutput);
    setStatus(statusBar, 'idle', 'Ready · Paste YAML and click Format');
    inputEditor.focus();
  });

  pasteBtn.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      isSyncing = true;
      setEditorDoc(inputEditor, text, true);
      isSyncing = false;
      localStorage.setItem(KEYS.yamlInput, text);
      processYAML(true);
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
  initTheme();
  initTabs();
  initJSON();
  initYAML();
});
