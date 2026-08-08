// app.js — মূল অ্যাপ লজিক

import * as api from "./js/api.js";
import { buildTree, sortedEntries, isMarkdown, isImage, isPdf } from "./js/tree.js";
import { createEditor, setEditorContent, destroyEditor } from "./js/editor.js";

// ---------- DOM references ----------
const el = (id) => document.getElementById(id);

const loginScreen = el("login-screen");
const loginForm = el("login-form");
const pinInput = el("pin-input");
const loginError = el("login-error");

const appRoot = el("app");
const fileTreeEl = el("file-tree");
const syncDot = el("sync-dot");
const syncText = el("sync-text");
const breadcrumb = el("breadcrumb");
const emptyState = el("empty-state");
const editorWrap = el("editor-wrap");
const cmHost = el("cm-editor");
const saveIndicator = el("save-indicator");

const btnMenu = el("btn-menu");
const sidebar = el("sidebar");
const sidebarOverlay = el("sidebar-overlay");
const btnNewFile = el("btn-new-file");
const btnNewFolder = el("btn-new-folder");
const btnRefresh = el("btn-refresh");
const btnDownload = el("btn-download");
const btnDelete = el("btn-delete");
const btnAttach = el("btn-attach");
const fileInput = el("file-input");

const modalOverlay = el("modal-overlay");
const modalTitle = el("modal-title");
const modalInput = el("modal-input");
const modalHint = el("modal-hint");
const modalConfirm = el("modal-confirm");
const modalCancel = el("modal-cancel");

// ---------- App state ----------
let treeData = null;
let expandedFolders = new Set(JSON.parse(localStorage.getItem("mydian_expanded") || "[]"));
let currentFile = null; // { path, sha }
let editorView = null;
let isDirty = false;
let pendingModalAction = null;

// ============================================================
// Login
// ============================================================

if (api.getSession()) {
  showApp();
} else {
  loginScreen.hidden = false;
}

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.hidden = true;
  const pin = pinInput.value.trim();
  if (!pin) return;
  try {
    await api.login(pin);
    showApp();
  } catch (err) {
    loginError.textContent = err.message;
    loginError.hidden = false;
    pinInput.value = "";
    pinInput.focus();
  }
});

function showApp() {
  loginScreen.hidden = true;
  appRoot.hidden = false;
  loadFileTree();
}

// ============================================================
// Sync status UI
// ============================================================

function setSyncStatus(status, text) {
  syncDot.className = "sync-dot " + status;
  syncText.textContent = text;
}

// ============================================================
// File tree loading & rendering
// ============================================================

async function loadFileTree() {
  setSyncStatus("syncing", "সিঙ্ক হচ্ছে…");
  try {
    const flatFiles = await api.fetchTree();
    treeData = buildTree(flatFiles);
    renderTree();
    setSyncStatus("online", "সিঙ্ক হয়েছে");
  } catch (err) {
    console.error(err);
    setSyncStatus("error", "সিঙ্ক ব্যর্থ হয়েছে");
    fileTreeEl.innerHTML = `<div class="tree-empty">লোড করা যায়নি।<br>রিফ্রেশ চেষ্টা করুন, অথবা রিপো/PIN ঠিক আছে কিনা দেখুন।</div>`;
  }
}

function renderTree() {
  fileTreeEl.innerHTML = "";
  const entries = sortedEntries(treeData);

  if (entries.length === 0) {
    fileTreeEl.innerHTML = `<div class="tree-empty">এখনো কোনো ফাইল নেই।<br>উপরের + বাটনে নতুন ফাইল তৈরি করুন।</div>`;
    return;
  }

  const list = renderNodeChildren(entries);
  fileTreeEl.appendChild(list);
}

function renderNodeChildren(entries) {
  const container = document.createDocumentFragment();
  const wrapper = document.createElement("div");

  entries.forEach((node) => {
    wrapper.appendChild(renderNode(node));
  });

  container.appendChild(wrapper);
  return wrapper;
}

function renderNode(node) {
  const nodeEl = document.createElement("div");
  nodeEl.className = "tree-node";

  const row = document.createElement("div");
  row.className = "tree-row";
  row.dataset.path = node.path;

  if (node.type === "folder") {
    const isOpen = expandedFolders.has(node.path);
    if (isOpen) row.classList.add("open");

    row.innerHTML = `
      <span class="chevron">${chevronSvg()}</span>
      <span class="node-icon">${folderSvg()}</span>
      <span class="node-label">${escapeHtml(node.name)}</span>
      <span class="tree-row-actions">
        <button data-action="new-file" title="নতুন ফাইল">${plusSvg()}</button>
        <button data-action="delete" title="ডিলিট">${trashSvg()}</button>
      </span>
    `;

    row.addEventListener("click", (e) => {
      if (e.target.closest("[data-action]")) return;
      toggleFolder(node.path);
    });

    nodeEl.appendChild(row);

    const childrenEl = document.createElement("div");
    childrenEl.className = "tree-children";
    childrenEl.hidden = !isOpen;
    const childEntries = sortedEntries(node);
    childEntries.forEach((child) => childrenEl.appendChild(renderNode(child)));
    nodeEl.appendChild(childrenEl);

    row.querySelector('[data-action="new-file"]')?.addEventListener("click", (e) => {
      e.stopPropagation();
      openModal({
        title: "নতুন ফাইল",
        placeholder: "নাম.md",
        onConfirm: (name) => createFile(`${node.path}/${name}`),
      });
    });
    row.querySelector('[data-action="delete"]')?.addEventListener("click", (e) => {
      e.stopPropagation();
      if (confirm(`"${node.name}" ফোল্ডারের সব ফাইল ডিলিট হবে। নিশ্চিত?`)) {
        deleteFolder(node);
      }
    });
  } else {
    row.innerHTML = `
      <span class="chevron"></span>
      <span class="node-icon">${fileIconSvg(node.name)}</span>
      <span class="node-label">${escapeHtml(node.name)}</span>
      <span class="tree-row-actions">
        <button data-action="delete" title="ডিলিট">${trashSvg()}</button>
      </span>
    `;

    if (currentFile && currentFile.path === node.path) {
      row.classList.add("active");
    }

    row.addEventListener("click", (e) => {
      if (e.target.closest("[data-action]")) return;
      openFile(node);
      closeMobileSidebar();
    });

    row.querySelector('[data-action="delete"]')?.addEventListener("click", (e) => {
      e.stopPropagation();
      if (confirm(`"${node.name}" ডিলিট করবেন?`)) {
        deleteFileNode(node);
      }
    });

    nodeEl.appendChild(row);
  }

  return nodeEl;
}

function toggleFolder(path) {
  if (expandedFolders.has(path)) {
    expandedFolders.delete(path);
  } else {
    expandedFolders.add(path);
  }
  localStorage.setItem("mydian_expanded", JSON.stringify([...expandedFolders]));
  renderTree();
}

// ============================================================
// File open / edit / save
// ============================================================

async function openFile(node) {
  if (isDirty) {
    const proceed = confirm("সেভ না করা পরিবর্তন আছে। এগোলে হারিয়ে যাবে। এগোবেন?");
    if (!proceed) return;
  }

  breadcrumb.textContent = node.path;
  emptyState.hidden = true;
  editorWrap.hidden = false;
  btnDownload.hidden = false;
  btnDelete.hidden = false;

  destroyEditor(editorView);
  editorView = null;

  if (isMarkdown(node.name)) {
    cmHost.hidden = false;
    removeMediaPreview();
    setSaveIndicator("");
    try {
      const { content, sha } = await api.fetchFile(node.path);
      currentFile = { path: node.path, sha, type: "md" };
      editorView = createEditor({
        parent: cmHost,
        doc: content,
        onChange: (newContent) => saveCurrentFile(newContent),
      });
      isDirty = false;
      highlightActiveRow(node.path);
    } catch (err) {
      alert("ফাইল খোলা যায়নি: " + err.message);
    }
  } else if (isImage(node.name) || isPdf(node.name)) {
    cmHost.hidden = true;
    setSaveIndicator("");
    try {
      const { base64, sha } = await api.fetchFileRaw(node.path);
      currentFile = { path: node.path, sha, type: "media" };
      showMediaPreview(node.name, base64);
      highlightActiveRow(node.path);
    } catch (err) {
      alert("ফাইল খোলা যায়নি: " + err.message);
    }
  } else {
    cmHost.hidden = false;
    removeMediaPreview();
    try {
      const { content, sha } = await api.fetchFile(node.path);
      currentFile = { path: node.path, sha, type: "text" };
      editorView = createEditor({
        parent: cmHost,
        doc: content,
        onChange: (newContent) => saveCurrentFile(newContent),
      });
      isDirty = false;
      highlightActiveRow(node.path);
    } catch (err) {
      alert("ফাইল খোলা যায়নি: " + err.message);
    }
  }
}

function highlightActiveRow(path) {
  document.querySelectorAll(".tree-row").forEach((r) => r.classList.remove("active"));
  const row = document.querySelector(`.tree-row[data-path="${cssEscape(path)}"]`);
  if (row) row.classList.add("active");
}

function showMediaPreview(name, base64) {
  removeMediaPreview();
  const container = document.createElement("div");
  container.id = "media-preview";
  container.style.cssText = "height:100%;display:flex;align-items:center;justify-content:center;padding:24px;";

  if (isImage(name)) {
    const mime = name.endsWith(".svg") ? "image/svg+xml" : `image/${name.split(".").pop()}`;
    container.innerHTML = `<img src="data:${mime};base64,${base64}" style="max-width:100%;max-height:100%;border-radius:8px;" />`;
  } else if (isPdf(name)) {
    container.innerHTML = `<iframe src="data:application/pdf;base64,${base64}" style="width:100%;height:100%;border:none;border-radius:8px;"></iframe>`;
  }
  editorWrap.appendChild(container);
}

function removeMediaPreview() {
  document.getElementById("media-preview")?.remove();
}

let saveTimer = null;
async function saveCurrentFile(content) {
  if (!currentFile) return;
  isDirty = true;
  setSaveIndicator("saving");

  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      const base64 = api.encodeBase64Utf8(content);
      const result = await api.putFile(
        currentFile.path,
        base64,
        `Update ${currentFile.path}`,
        currentFile.sha
      );
      currentFile.sha = result.content.sha;
      isDirty = false;
      setSaveIndicator("saved");
      setTimeout(() => setSaveIndicator(""), 2000);
    } catch (err) {
      setSaveIndicator("error");
      console.error(err);
    }
  }, 300);
}

function setSaveIndicator(state) {
  saveIndicator.className = "save-indicator " + state;
  const map = { saving: "সেভ হচ্ছে…", saved: "সেভ হয়েছে ✓", error: "সেভ ব্যর্থ", "": "" };
  saveIndicator.textContent = map[state] ?? "";
}

// ============================================================
// Create / delete
// ============================================================

async function createFile(path, initialContent = "") {
  try {
    const base64 = api.encodeBase64Utf8(initialContent);
    await api.putFile(path, base64, `Create ${path}`);
    await loadFileTree();
    const node = findNodeByPath(path);
    if (node) openFile(node);
  } catch (err) {
    alert("ফাইল তৈরি করা যায়নি: " + err.message);
  }
}

async function createFolder(path) {
  // GitHub-এ খালি ফোল্ডার রাখা যায় না — একটা .gitkeep ফাইল দিয়ে ফোল্ডার তৈরি করি
  await createFile(`${path}/.gitkeep`, "");
}

function findNodeByPath(path) {
  const parts = path.split("/");
  let node = treeData;
  for (const part of parts) {
    if (!node.children || !node.children[part]) return null;
    node = node.children[part];
  }
  return node;
}

async function deleteFileNode(node) {
  try {
    await api.deleteFile(node.path, node.sha, `Delete ${node.path}`);
    if (currentFile && currentFile.path === node.path) {
      closeEditor();
    }
    await loadFileTree();
  } catch (err) {
    alert("ডিলিট করা যায়নি: " + err.message);
  }
}

async function deleteFolder(folderNode) {
  const files = collectAllFiles(folderNode);
  try {
    for (const f of files) {
      await api.deleteFile(f.path, f.sha, `Delete ${f.path}`);
    }
    if (currentFile && files.some((f) => f.path === currentFile.path)) {
      closeEditor();
    }
    await loadFileTree();
  } catch (err) {
    alert("ফোল্ডার ডিলিট করা যায়নি: " + err.message);
  }
}

function collectAllFiles(node) {
  let result = [];
  const entries = Object.values(node.children || {});
  for (const e of entries) {
    if (e.type === "file") result.push(e);
    else result = result.concat(collectAllFiles(e));
  }
  return result;
}

function closeEditor() {
  currentFile = null;
  destroyEditor(editorView);
  editorView = null;
  removeMediaPreview();
  editorWrap.hidden = true;
  emptyState.hidden = false;
  breadcrumb.textContent = "একটি ফাইল বেছে নিন";
  btnDownload.hidden = true;
  btnDelete.hidden = true;
  setSaveIndicator("");
}

// ============================================================
// Toolbar actions
// ============================================================

btnRefresh.addEventListener("click", loadFileTree);

btnNewFile.addEventListener("click", () => {
  openModal({
    title: "নতুন ফাইল (root-এ)",
    placeholder: "নাম.md",
    onConfirm: (name) => createFile(name),
  });
});

btnNewFolder.addEventListener("click", () => {
  openModal({
    title: "নতুন ফোল্ডার (root-এ)",
    placeholder: "ফোল্ডারের নাম",
    onConfirm: (name) => createFolder(name),
  });
});

btnDelete.addEventListener("click", () => {
  if (!currentFile) return;
  if (confirm(`"${currentFile.path}" ডিলিট করবেন?`)) {
    deleteFileNode({ path: currentFile.path, sha: currentFile.sha });
  }
});

btnDownload.addEventListener("click", async () => {
  if (!currentFile) return;
  try {
    if (currentFile.type === "media") {
      const { base64 } = await api.fetchFileRaw(currentFile.path);
      const name = currentFile.path.split("/").pop();
      downloadBase64(base64, name);
    } else {
      const content = editorView.state.doc.toString();
      downloadText(content, currentFile.path.split("/").pop());
    }
  } catch (err) {
    alert("ডাউনলোড ব্যর্থ: " + err.message);
  }
});

function downloadText(text, filename) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  triggerDownload(url, filename);
}

function downloadBase64(base64, filename) {
  const url = `data:application/octet-stream;base64,${base64}`;
  triggerDownload(url, filename);
}

function triggerDownload(url, filename) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// ---------- Attachment upload ----------
btnAttach.hidden = false;
btnAttach.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", async () => {
  const files = Array.from(fileInput.files || []);
  for (const file of files) {
    await uploadAttachment(file);
  }
  fileInput.value = "";
  await loadFileTree();
});

function uploadAttachment(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64 = reader.result.split(",")[1];
        const folder = currentFile ? currentFile.path.split("/").slice(0, -1).join("/") : "attachments";
        const targetFolder = folder || "attachments";
        const path = `${targetFolder}/${file.name}`;
        await api.putFile(path, base64, `Add attachment ${file.name}`);
        resolve();
      } catch (err) {
        alert("আপলোড ব্যর্থ: " + err.message);
        reject(err);
      }
    };
    reader.readAsDataURL(file);
  });
}

// ============================================================
// Mobile sidebar
// ============================================================

btnMenu.addEventListener("click", () => {
  sidebar.classList.add("open");
  sidebarOverlay.classList.add("show");
});

sidebarOverlay.addEventListener("click", closeMobileSidebar);

function closeMobileSidebar() {
  sidebar.classList.remove("open");
  sidebarOverlay.classList.remove("show");
}

// ============================================================
// Modal (নতুন ফাইল/ফোল্ডার)
// ============================================================

function openModal({ title, placeholder, hint, onConfirm }) {
  modalTitle.textContent = title;
  modalInput.placeholder = placeholder || "";
  modalHint.textContent = hint || "";
  modalInput.value = "";
  pendingModalAction = onConfirm;
  modalOverlay.hidden = false;
  setTimeout(() => modalInput.focus(), 50);
}

function closeModal() {
  modalOverlay.hidden = true;
  pendingModalAction = null;
}

modalCancel.addEventListener("click", closeModal);
modalOverlay.addEventListener("click", (e) => {
  if (e.target === modalOverlay) closeModal();
});

modalConfirm.addEventListener("click", submitModal);
modalInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") submitModal();
  if (e.key === "Escape") closeModal();
});

function submitModal() {
  const value = modalInput.value.trim();
  if (!value) return;
  const action = pendingModalAction;
  closeModal();
  if (action) action(value);
}

// ============================================================
// Helpers: icons, escaping
// ============================================================

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function cssEscape(str) {
  return str.replace(/["\\]/g, "\\$&");
}

function chevronSvg() {
  return `<svg viewBox="0 0 24 24" width="12" height="12"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
function folderSvg() {
  return `<svg viewBox="0 0 24 24" width="15" height="15"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`;
}
function fileIconSvg(name) {
  if (isImage(name)) {
    return `<svg viewBox="0 0 24 24" width="15" height="15"><rect x="3" y="3" width="18" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"/><path d="M21 15l-5-5L5 21" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`;
  }
  if (isPdf(name)) {
    return `<svg viewBox="0 0 24 24" width="15" height="15"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M14 2v6h6" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`;
  }
  return `<svg viewBox="0 0 24 24" width="15" height="15"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M14 2v6h6" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 13h8M8 17h5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`;
}
function plusSvg() {
  return `<svg viewBox="0 0 24 24" width="13" height="13"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
}
function trashSvg() {
  return `<svg viewBox="0 0 24 24" width="13" height="13"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16z" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`;
}

// ============================================================
// PWA: service worker registration
// ============================================================

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => console.warn("SW registration failed", err));
  });
}
