// app.js — মূল অ্যাপ লজিক

import * as api from "./js/api.js";
import * as cache from "./js/cache.js";
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
const fileTitle = el("file-title");
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

const btnSettings = el("btn-settings");
const settingsModalOverlay = el("settings-modal-overlay");
const settingsVaultInfo = el("settings-vault-info");
const settingsClose = el("settings-close");
const settingsLogout = el("settings-logout");
const settingsClearCache = el("settings-clear-cache");

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
  // আগে ক্যাশে থাকা তালিকা থাকলে সেটা তাৎক্ষণিকভাবে দেখাই (network-এর
  // জন্য অপেক্ষা না করেই) — তারপর ব্যাকগ্রাউন্ডে GitHub থেকে আসল/সর্বশেষ
  // তালিকা এনে দরকার হলে আপডেট করি। এতে অ্যাপ খোলার সাথে সাথেই sidebar
  // দেখা যায়, নেটওয়ার্ক ধীর হলেও।
  const cachedFlat = await cache.getTree();
  if (cachedFlat && cachedFlat.length) {
    treeData = buildTree(cachedFlat);
    renderTree();
    setSyncStatus("offline", "Showing cached copy…");
  } else {
    setSyncStatus("syncing", "Syncing…");
  }

  try {
    const flatFiles = await api.fetchTree();
    treeData = buildTree(flatFiles);
    renderTree();
    setSyncStatus("online", "Synced");
    cache.setTree(flatFiles);
    // অটো ক্যাশ ম্যানেজমেন্ট: এখন যেসব ফাইল আসলেই GitHub-এ আছে তার
    // তালিকার সাথে না মেলা পুরনো ক্যাশ এন্ট্রি (ডিলিট/রিনেম হয়ে যাওয়া
    // ফাইলের) স্বয়ংক্রিয়ভাবে মুছে দেওয়া হয় — ম্যানুয়ালি কিছু করতে হয় না
    cache.pruneToPaths(flatFiles.map((f) => f.path));
  } catch (err) {
    console.error(err);
    if (cachedFlat && cachedFlat.length) {
      // ক্যাশ থেকে ইতিমধ্যে তালিকা দেখানো হয়ে গেছে — সেটাই থাকুক,
      // শুধু status জানিয়ে দিই যে এখন সর্বশেষ ডেটা আনা যায়নি
      setSyncStatus("error", "Offline — showing cached list");
    } else {
      setSyncStatus("error", "Sync failed");
      fileTreeEl.innerHTML = `<div class="tree-empty">Could not load.<br>Try refreshing, or check that the repo/PIN are correct.</div>`;
    }
  }
}

function renderTree() {
  fileTreeEl.innerHTML = "";
  const entries = sortedEntries(treeData);

  if (entries.length === 0) {
    fileTreeEl.innerHTML = `<div class="tree-empty">No files yet.<br>Use the + button above to create a new file.</div>`;
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
        <button data-action="new-file" title="New file">${plusSvg()}</button>
        <button data-action="delete" title="Delete">${trashSvg()}</button>
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
        title: "New File",
        placeholder: "name.md",
        onConfirm: (name) => createFile(`${node.path}/${sanitizeFilename(ensureMdExtension(name))}`),
      });
    });
    row.querySelector('[data-action="delete"]')?.addEventListener("click", (e) => {
      e.stopPropagation();
      if (confirm(`This will delete all files in "${node.name}". Are you sure?`)) {
        deleteFolder(node);
      }
    });
  } else {
    row.innerHTML = `
      <span class="chevron"></span>
      <span class="node-icon">${fileIconSvg(node.name)}</span>
      <span class="node-label">${escapeHtml(node.name)}</span>
      <span class="tree-row-actions">
        <button data-action="rename" title="Rename">${editSvg()}</button>
        <button data-action="delete" title="Delete">${trashSvg()}</button>
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

    row.querySelector('[data-action="rename"]')?.addEventListener("click", (e) => {
      e.stopPropagation();
      openModal({
        title: "Rename",
        placeholder: "New name",
        initialValue: node.name,
        onConfirm: (newName) => renameFile(node, ensureMdExtension(sanitizeFilename(newName))),
      });
    });
    row.querySelector('[data-action="delete"]')?.addEventListener("click", (e) => {
      e.stopPropagation();
      if (confirm(`Delete "${node.name}"?`)) {
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

async function openFile(node, preloaded = null) {
  if (isDirty) {
    const proceed = confirm("You have unsaved changes. They will be lost if you continue. Continue anyway?");
    if (!proceed) return;
  }
  cancelPendingSave();

  breadcrumb.textContent = node.path;
  emptyState.hidden = true;
  editorWrap.hidden = false;
  btnDownload.hidden = false;
  btnDelete.hidden = false;

  destroyEditor(editorView);
  editorView = null;

  if (isMarkdown(node.name)) {
    fileTitle.hidden = false;
    fileTitle.textContent = fileNameWithoutExt(node.name);
    cmHost.hidden = false;
    removeMediaPreview();
    setSaveIndicator("");
    await openTextFile(node, "md", preloaded);
  } else if (isImage(node.name) || isPdf(node.name)) {
    fileTitle.hidden = true;
    cmHost.hidden = true;
    setSaveIndicator("");
    try {
      const { base64, sha } = await api.fetchFileRaw(node.path);
      currentFile = { path: node.path, sha, type: "media" };
      showMediaPreview(node.name, base64);
      highlightActiveRow(node.path);
    } catch (err) {
      alert("Could not open file: " + err.message);
    }
  } else {
    fileTitle.hidden = false;
    fileTitle.textContent = fileNameWithoutExt(node.name);
    cmHost.hidden = false;
    removeMediaPreview();
    await openTextFile(node, "text", preloaded);
  }
}

// markdown আর generic text — দুটোরই ওপেন-লজিক একই: আগে ক্যাশ থেকে থাকলে
// তাৎক্ষণিকভাবে দেখাই (instant, Obsidian-এর মতো), তারপর ব্যাকগ্রাউন্ডে
// GitHub থেকে সর্বশেষ ভার্সন এনে — ইউজার তখনো টাইপ করা শুরু না করে
// থাকলে (isDirty false) — চুপচাপ আপডেট করে দিই। ইউজার টাইপ শুরু করে
// থাকলে তার চলমান এডিট কখনো ওভাররাইট করা হয় না।
async function openTextFile(node, type, preloaded) {
  try {
    let shownFromCache = false;

    if (preloaded) {
      // createFile()-এর পর সরাসরি এই ফাইলে আসা — এটা putFile()-এর
      // রেসপন্স থেকে পাওয়া, ইতিমধ্যেই GitHub-এর সর্বশেষ ভার্সন, তাই
      // আলাদা করে network fetch বা cache lookup-এর দরকার নেই
      currentFile = { path: node.path, sha: preloaded.sha, type };
      editorView = createEditor({
        parent: cmHost,
        doc: preloaded.content,
        onChange: (c) => saveCurrentFile(c),
      });
      isDirty = false;
      highlightActiveRow(node.path);
      cache.setFile(node.path, preloaded);
      return;
    }

    const cached = await cache.getFile(node.path);
    if (cached) {
      currentFile = { path: node.path, sha: cached.sha, type };
      editorView = createEditor({
        parent: cmHost,
        doc: cached.content,
        onChange: (c) => saveCurrentFile(c),
      });
      isDirty = false;
      highlightActiveRow(node.path);
      shownFromCache = true;
    }

    const fresh = await api.fetchFile(node.path);
    cache.setFile(node.path, fresh);

    // এই fetch চলাকালীন ইউজার অন্য ফাইলে চলে গেলে এই রেসপন্স আর প্রযোজ্য না
    if (!currentFile || currentFile.path !== node.path) return;

    if (!shownFromCache) {
      // ক্যাশে কিছুই ছিল না — এই প্রথমবার GitHub থেকেই দেখানো হচ্ছে
      currentFile = { path: node.path, sha: fresh.sha, type };
      editorView = createEditor({
        parent: cmHost,
        doc: fresh.content,
        onChange: (c) => saveCurrentFile(c),
      });
      isDirty = false;
      highlightActiveRow(node.path);
    } else if (fresh.sha !== currentFile.sha && !isDirty) {
      // ক্যাশ পুরনো ছিল (অন্য কোনো ডিভাইস থেকে বদলেছে), কিন্তু ইউজার
      // এখনো এখানে টাইপ শুরু করেননি — নিরাপদে সর্বশেষ ভার্সন বসিয়ে দিই
      currentFile.sha = fresh.sha;
      setEditorContent(editorView, fresh.content);
    }
    // isDirty true হলে টাচ করা হচ্ছে না — ইউজারের চলমান এডিট কখনো হারানো হবে না
  } catch (err) {
    if (!currentFile || currentFile.path !== node.path || !editorView) {
      // ক্যাশ বা নেটওয়ার্ক — কোনোটা থেকেই কিছু দেখানো গেল না
      console.error("openTextFile error:", err);
      cmHost.innerHTML = `<div style="padding:20px;color:#e88;">Could not load editor: ${escapeHtml(err.message || String(err))}</div>`;
      alert("Could not open file: " + err.message);
    }
    // ক্যাশ থেকে ইতিমধ্যে দেখানো হয়ে থাকলে সেটাই থাকুক — শুধু
    // ব্যাকগ্রাউন্ড sync ব্যর্থ হয়েছে, ইউজারকে বিরক্ত করার দরকার নেই
  }
}

function fileNameWithoutExt(name) {
  const idx = name.lastIndexOf(".");
  return idx === -1 ? name : name.slice(0, idx);
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
let isSaving = false;
let pendingSaveContent = null;
let pendingSaveTarget = null;

async function saveCurrentFile(content) {
  if (!currentFile) return;
  isDirty = true;
  setSaveIndicator("saving");

  // এই সেভটা ঠিক কোন ফাইলের জন্য শুরু হচ্ছে, সেটা এখনই (object reference
  // হিসেবে) ধরে রাখা হচ্ছে। PUT request GitHub-এ পাঠানো অবস্থায় (কয়েক
  // সেকেন্ড লাগতে পারে) ইউজার যদি অন্য ফাইলে চলে যান, ততক্ষণে global
  // currentFile বদলে যাবে — কিন্তু এই সেভের ফলাফল যেন তখনও সঠিক (পুরনো)
  // ফাইলেই প্রয়োগ হয়, ভুল করে নতুন খোলা ফাইলে না বসে, সেটা নিশ্চিত করতেই
  // এই আলাদা রেফারেন্স রাখা।
  const targetFile = currentFile;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => flushSave(targetFile, content), 300);
}

async function flushSave(targetFile, content) {
  if (!targetFile) return;
  if (isSaving) {
    // আগের save এখনো GitHub-এর দিকে in-flight — একই সাথে দুটো PUT পাঠালে
    // পুরনো sha দিয়ে দ্বিতীয়টা 409 Conflict দিয়ে ব্যর্থ হতে পারে। তাই এখন
    // শুধু সর্বশেষ content মনে রাখা হচ্ছে, চলমান save শেষ হলে সেটাই সেভ হবে।
    pendingSaveContent = content;
    pendingSaveTarget = targetFile;
    return;
  }
  isSaving = true;
  try {
    const base64 = api.encodeBase64Utf8(content);
    const result = await api.putFile(
      targetFile.path,
      base64,
      `Update ${targetFile.path}`,
      targetFile.sha
    );
    targetFile.sha = result.content.sha;
    cache.setFile(targetFile.path, { content, sha: targetFile.sha });
    // এই সেভ যে ফাইলের জন্য শুরু হয়েছিল, ইউজার তখনো সেই ফাইলেই আছেন কিনা
    // চেক করেই isDirty/সেভ-ইন্ডিকেটর আপডেট করা হচ্ছে — এই চেক ছাড়া, ইউজার
    // ততক্ষণে অন্য একটা ফাইল খুলে ফেললে সেই নতুন ফাইলের স্ট্যাটাস ভুলভাবে
    // "সেভ হয়েছে"/isDirty=false দেখাত, যেখানে আসলে এই সেভটা তার সাথে
    // সম্পর্কিতই না।
    if (currentFile === targetFile) {
      isDirty = false;
      setSaveIndicator("saved");
      setTimeout(() => setSaveIndicator(""), 2000);
    }
  } catch (err) {
    if (currentFile === targetFile) {
      setSaveIndicator("error", err.message);
    }
    console.error(err);
    // sha conflict (409) হলে পুরনো sha দিয়ে আবার চেষ্টা করলে সেটাও একই
    // কারণে ব্যর্থ হবে — pending queue-তে থাকা content থাকলেও সেটা দিয়ে
    // আবার চেষ্টা না করে থামিয়ে দেওয়া হচ্ছে, নাহলে ইউজার টাইপ করতে থাকলে
    // প্রতিটা keystroke একটা নিশ্চিত-ব্যর্থ retry ট্রিগার করত (infinite
    // retry loop)। ইউজারকে স্পষ্টভাবে জানানো হচ্ছে যাতে ম্যানুয়ালি
    // রিফ্রেশ করে আবার লিখতে পারেন।
    if (err.message && err.message.includes("has already been changed elsewhere")) {
      pendingSaveContent = null;
      pendingSaveTarget = null;
      if (currentFile === targetFile) alert(err.message);
    }
  } finally {
    isSaving = false;
    if (pendingSaveContent !== null) {
      const nextContent = pendingSaveContent;
      const nextTarget = pendingSaveTarget;
      pendingSaveContent = null;
      pendingSaveTarget = null;
      flushSave(nextTarget, nextContent);
    }
  }
}

function cancelPendingSave() {
  clearTimeout(saveTimer);
  saveTimer = null;
  pendingSaveContent = null;
  pendingSaveTarget = null;
  // isSaving ইচ্ছাকৃতভাবে touch করা হচ্ছে না — যদি একটা PUT ইতিমধ্যে GitHub-এর
  // দিকে in-flight থাকে সেটা থামানো সম্ভব না, শুধু নিশ্চিত করা হচ্ছে যে সেই
  // request শেষ হওয়ার পর আর কোনো "পরের" save চেইন হবে না। (সেই in-flight
  // save নিজেই এখন targetFile ধরে রাখে বলে ততদিনে অন্য ফাইলে চলে গেলেও
  // ভুল ফাইলে প্রয়োগ হবে না — উপরে flushSave দ্রষ্টব্য।)
}

function setSaveIndicator(state, detail = "") {
  saveIndicator.className = "save-indicator " + state;
  const map = { saving: "Saving…", saved: "Saved ✓", error: "Save failed", "": "" };
  saveIndicator.textContent = map[state] ?? "";
  saveIndicator.title = detail || "";
}

// ============================================================
// Create / delete
// ============================================================

async function createFile(path, initialContent = "", openAfterCreate = true) {
  try {
    const base64 = api.encodeBase64Utf8(initialContent);
    const result = await api.putFile(path, base64, `Create ${path}`);
    // sidebar list ব্যাকগ্রাউন্ডে রিফ্রেশ হোক — কিন্তু এডিটর খোলার জন্য এটার
    // উপর নির্ভর করা হচ্ছে না, কারণ GitHub-এ কমিটের পরপরই recursive tree
    // API সবসময় নতুন ফাইলটা তাৎক্ষণিকভাবে ফেরত না-ও দিতে পারে — সেক্ষেত্রে
    // findNodeByPath() null পেত, আর ফাইলটা কখনো খুলতই না।
    loadFileTree();
    if (!openAfterCreate) return;
    const name = path.split("/").pop();
    // এইমাত্র যে content/sha পাওয়া গেছে (putFile-এর রেসপন্স থেকে) সেটাই
    // সরাসরি এডিটরে বসানো হচ্ছে — আলাদা করে fetchFile() কল করে ফাইলটা আবার
    // GitHub থেকে আনার দরকার নেই, এবং সেই বাড়তি রাউন্ড-ট্রিপ ব্যর্থ/দেরি হলে
    // এডিটর মাউন্টই হতো না (ফাইল "খোলা" দেখাত কিন্তু ভেতরে কিছু লেখার
    // জায়গা থাকত না)।
    openFile({ path, name }, { content: initialContent, sha: result.content.sha });
  } catch (err) {
    alert("Could not create file: " + err.message);
  }
}

async function createFolder(path) {
  // GitHub-এ খালি ফোল্ডার রাখা যায় না — একটা .gitkeep ফাইল দিয়ে ফোল্ডার তৈরি করি।
  // openAfterCreate=false — নাহলে ইউজার "নতুন ফোল্ডার" চাপলে অদ্ভুতভাবে
  // একটা .gitkeep ফাইল এডিটরে খুলে যেত।
  await createFile(`${path}/.gitkeep`, "", false);
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
    if (currentFile && currentFile.path === node.path) {
      cancelPendingSave();
    }
    await api.deleteFile(node.path, node.sha, `Delete ${node.path}`);
    cache.deleteFile(node.path);
    if (currentFile && currentFile.path === node.path) {
      closeEditor();
    }
    await loadFileTree();
  } catch (err) {
    alert("Could not delete: " + err.message);
  }
}

// ফাইলের নাম পরিবর্তন — GitHub Contents API-তে সরাসরি "rename" বলে কিছু
// নেই, তাই এটা করা হয় দুই ধাপে: নতুন নামে হুবহু একই content দিয়ে ফাইল
// তৈরি (raw base64 কপি — টেক্সট/বাইনারি দুটোর জন্যই নিরাপদ), তারপর
// পুরনো নামের ফাইলটা ডিলিট।
async function renameFile(node, newName) {
  if (!newName || newName === node.name) return;

  const parentPath = node.path.split("/").slice(0, -1).join("/");
  const newPath = parentPath ? `${parentPath}/${newName}` : newName;

  if (findNodeByPath(newPath)) {
    alert("A file with this name already exists.");
    return;
  }

  const wasOpen = currentFile && currentFile.path === node.path;
  if (wasOpen) cancelPendingSave();

  let base64, putResult;
  try {
    ({ base64 } = await api.fetchFileRaw(node.path));
    putResult = await api.putFile(newPath, base64, `Rename ${node.path} → ${newPath}`);
  } catch (err) {
    alert("Could not rename: " + err.message);
    return;
  }

  // নতুন নামে কপি তৈরি সফল হয়ে গেছে — এখন পুরনোটা মোছার চেষ্টা। এটা ব্যর্থ
  // হলে দুইটা কপি (পুরনো + নতুন নাম) থেকে যাবে, তাই সাথে সাথে নতুন কপিটা
  // রোলব্যাক (মুছে) করার চেষ্টা করা হচ্ছে — যাতে ডুপ্লিকেট ফাইল তৈরি না হয়
  // এবং ইউজার একটা পরিষ্কার, ভবিষ্যদ্বাণীযোগ্য ফলাফল পান: হয় সম্পূর্ণ সফল,
  // নয়তো সম্পূর্ণ আগের অবস্থায়।
  try {
    await api.deleteFile(node.path, node.sha, `Rename: remove old path ${node.path}`);
  } catch (deleteErr) {
    try {
      await api.deleteFile(newPath, putResult.content.sha, `Rollback failed rename: remove ${newPath}`);
      alert("Could not complete rename (failed to delete the old file) — no changes were made, everything is as it was.");
    } catch (rollbackErr) {
      // রোলব্যাকও ব্যর্থ — এখন সত্যিই দুইটা কপি থেকে গেছে, ইউজারকে স্পষ্টভাবে জানানো জরুরি
      alert(
        `Rename did not complete — both "${node.path}" and "${newPath}" ` +
        `now exist in your vault. Please delete one manually.`
      );
    }
    await loadFileTree();
    return;
  }

  // ক্যাশও সিঙ্ক রাখা হচ্ছে — পুরনো পাথের এন্ট্রি মুছে দেওয়া হচ্ছে (নাহলে
  // চিরকাল অপ্রয়োজনীয়ভাবে থেকে যেত), আর টেক্সট/মার্কডাউন ফাইল হলে নতুন
  // পাথেই আগে থেকে content বসিয়ে রাখা হচ্ছে যাতে পরেরবার instant খোলে।
  // বাইনারি ফাইল (ছবি/PDF) ক্যাশ করা হয় না বলে সেগুলোর জন্য শুধু পুরনো
  // এন্ট্রি মুছলেই যথেষ্ট।
  cache.deleteFile(node.path);
  if (!isImage(newName) && !isPdf(newName)) {
    try {
      const content = api.decodeBase64Utf8(base64);
      cache.setFile(newPath, { content, sha: putResult.content.sha });
    } catch (e) {
      // decode ব্যর্থ হলেও rename নিজে সফল হয়েছে — cache miss হলে
      // পরের ওপেনে স্বাভাবিকভাবেই network থেকে আনবে, কোনো ক্ষতি নেই
    }
  }

  await loadFileTree();
  if (wasOpen) {
    const newNode = findNodeByPath(newPath);
    if (newNode) openFile(newNode);
  }
}

async function deleteFolder(folderNode) {
  const files = collectAllFiles(folderNode);
  if (currentFile && files.some((f) => f.path === currentFile.path)) {
    cancelPendingSave();
  }
  try {
    for (const f of files) {
      await api.deleteFile(f.path, f.sha, `Delete ${f.path}`);
      cache.deleteFile(f.path);
    }
  } catch (err) {
    // ফোল্ডারের কিছু ফাইল ততক্ষণে সত্যিই মুছে গিয়ে থাকতে পারে, বাকিগুলো
    // না — সেই আংশিক অবস্থা যেন sidebar-এ সঠিকভাবে প্রতিফলিত হয়, তাই এই
    // catch-এর পরও (নিচে finally-তে) সবসময় তালিকা রিফ্রেশ করা হচ্ছে
    alert("Folder delete did not fully complete (some files may remain) — refreshing the list: " + err.message);
  } finally {
    await loadFileTree();
    // ওপেন থাকা ফাইলটা যদি (সম্পূর্ণ বা আংশিক ডিলিটে) সত্যিই আর না থাকে,
    // তাহলেই এডিটর বন্ধ করা হচ্ছে — আসল অবস্থা (রিফ্রেশ করা treeData)
    // অনুযায়ী চেক করে, শুধু ধরে না নিয়ে
    if (currentFile && !findNodeByPath(currentFile.path)) {
      closeEditor();
    }
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
  cancelPendingSave();
  currentFile = null;
  destroyEditor(editorView);
  editorView = null;
  removeMediaPreview();
  editorWrap.hidden = true;
  emptyState.hidden = false;
  breadcrumb.textContent = "Select a file";
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
    title: "New File (in root)",
    placeholder: "name.md",
    onConfirm: (name) => createFile(sanitizeFilename(ensureMdExtension(name))),
  });
});

btnNewFolder.addEventListener("click", () => {
  openModal({
    title: "New Folder (in root)",
    placeholder: "Folder name",
    onConfirm: (name) => createFolder(sanitizeFilename(name)),
  });
});

btnDelete.addEventListener("click", () => {
  if (!currentFile) return;
  if (confirm(`Delete "${currentFile.path}"?`)) {
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
    alert("Download failed: " + err.message);
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
        // file.name সরাসরি path-এ বসানোর আগে sanitize করা হচ্ছে — এতে '/' বা
        // '..' থাকলে সেটা targetFolder-এর বাইরে গিয়ে অন্য কোথাও (এমনকি
        // vault-এর অন্য ফোল্ডারে) ফাইল কমিট করে ফেলতে পারত, ইউজারের অজান্তে।
        const safeName = sanitizeFilename(file.name);
        const path = `${targetFolder}/${safeName}`;
        await api.putFile(path, base64, `Add attachment ${safeName}`);
        resolve();
      } catch (err) {
        alert("Upload failed: " + err.message);
        reject(err);
      }
    };
    reader.readAsDataURL(file);
  });
}

function sanitizeFilename(name) {
  // path separator ('/', '\'), leading dots (hidden file/'..'), এবং
  // অন্যান্য filesystem-এ সমস্যাযুক্ত ক্যারেক্টার সরিয়ে দেওয়া হয়
  const base = name.split(/[/\\]/).pop() || "file";
  const cleaned = base.replace(/^\.+/, "").replace(/[\x00-\x1f<>:"|?*]/g, "_").trim();
  return cleaned || "file";
}

// নতুন নোট ফাইল বানানোর সময় ইউজার এক্সটেনশন লিখতে ভুলে গেলে (যেমন শুধু
// "আমার-নোট" লিখলেন, ".md" বাদ পড়ে গেল) — তাতে ফাইলটা extension ছাড়া
// তৈরি হয়ে যেত, এবং ডাউনলোড করলে ব্রাউজার সেটাকে .txt ধরে নিত। এখন যদি
// নামে কোনো এক্সটেনশনই (কোনো ডট-এর পরে অক্ষর) না থাকে, স্বয়ংক্রিয়ভাবে
// ".md" জুড়ে দেওয়া হয়। ইউজার ইচ্ছাকৃতভাবে অন্য এক্সটেনশন (.txt, .json
// ইত্যাদি) দিলে সেটা অক্ষত থাকে — শুধু একদম কোনো এক্সটেনশন না থাকলেই এটা কাজ করে।
function ensureMdExtension(name) {
  const hasExtension = /\.[a-zA-Z0-9]+$/.test(name);
  return hasExtension ? name : `${name}.md`;
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

function openModal({ title, placeholder, hint, initialValue = "", onConfirm }) {
  // দুটো আলাদা মোডাল (নতুন ফাইল/ফোল্ডার আর সেটিংস) একই সময়ে খোলা থাকলে
  // ওভারল্যাপ করে stack হয়ে যেত — একটা খোলার সময় অন্যটা বন্ধ করে দেওয়া হচ্ছে
  settingsModalOverlay.hidden = true;
  modalTitle.textContent = title;
  modalInput.placeholder = placeholder || "";
  modalHint.textContent = hint || "";
  modalInput.value = initialValue;
  pendingModalAction = onConfirm;
  modalOverlay.hidden = false;
  setTimeout(() => {
    modalInput.focus();
    // rename-এর সময় নাম সিলেক্ট করে রাখি, যাতে ইউজার সরাসরি টাইপ করে পুরোটা বদলাতে পারেন
    if (initialValue) modalInput.select();
  }, 50);
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
// Settings modal (vault info + logout)
// ============================================================
// আগে "সেটিংস" বাটনের কোনো click listener ছিল না (dead button), এবং
// পুরো অ্যাপে লগ আউট করার কোনো উপায়ই ছিল না — সেশন টোকেন localStorage-এ
// থেকে যেত, ইউজার চাইলেও বের হতে পারতেন না।

btnSettings.addEventListener("click", () => {
  // এখানেও একই কারণে অন্য মোডালটা বন্ধ করে দেওয়া হচ্ছে
  closeModal();
  const cfg = api.getConfig();
  settingsVaultInfo.textContent = `Vault: ${cfg.owner}/${cfg.repo} (${cfg.branch || "main"})`;
  settingsModalOverlay.hidden = false;
});

function closeSettingsModal() {
  settingsModalOverlay.hidden = true;
}

settingsClose.addEventListener("click", closeSettingsModal);

settingsModalOverlay.addEventListener("click", (e) => {
  if (e.target === settingsModalOverlay) closeSettingsModal();
});

document.addEventListener("keydown", (e) => {
  // মূল নতুন-ফাইল মোডালে নিজস্ব Escape handler আছে (modalInput-এ), কিন্তু
  // সেটিংস মোডালে কোনো Escape সাপোর্টই ছিল না — শুধু ক্লিক বা "বন্ধ করুন"
  // বাটনেই বন্ধ করা যেত। এখন consistency-র জন্য global Escape যোগ করা হলো।
  if (e.key === "Escape" && !settingsModalOverlay.hidden) {
    closeSettingsModal();
  }
});

settingsLogout.addEventListener("click", () => {
  // isDirty চেক না থাকলে: এডিটরে টাইপ করে সাথে সাথেই এখানে এসে লগ আউট
  // চাপলে সেভ (300ms debounce, বা flushSave ইতিমধ্যে GitHub-এর দিকে
  // in-flight/queued থাকলে) সম্পূর্ণ না হতেই reload হয়ে সেই পরিবর্তন
  // চিরতরে হারিয়ে যেত — কোনো সতর্কতা ছাড়াই।
  const msg = isDirty
    ? "You have unsaved changes — logging out will lose them. Log out anyway?"
    : "Log out? You'll need your PIN to log back in.";
  if (!confirm(msg)) return;
  api.clearSession();
  window.location.reload();
});

settingsClearCache.addEventListener("click", async () => {
  // এটা শুধু লোকাল offline ক্যাশ (IndexedDB) মোছে — GitHub-এর কোনো
  // ডেটা মোছে না। sidebar/ফাইল কোনো কারণে পুরনো/অসামঞ্জস্যপূর্ণ মনে
  // হলে ট্রাবলশুটিং-এর জন্য এটা ব্যবহার করা যায়।
  if (!confirm("Clear the local cache? This won't delete any of your notes, it only resets the fast-loading copy.")) return;
  await cache.clearAll();
  window.location.reload();
});

// ট্যাব বন্ধ করা, রিফ্রেশ, বা অন্য পেজে চলে যাওয়ার সময়ও একই ঝুঁকি ছিল —
// সেভ না হওয়া পরিবর্তন থাকলে ব্রাউজারের নিজস্ব "আপনি কি নিশ্চিত?" ওয়ার্নিং
// দেখানো হবে, যেটা আগে কোথাও ছিল না।
window.addEventListener("beforeunload", (e) => {
  if (!isDirty) return;
  e.preventDefault();
  e.returnValue = "";
});

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
function editSvg() {
  return `<svg viewBox="0 0 24 24" width="13" height="13"><path d="M12 20h9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

// ============================================================
// PWA: service worker registration + auto-update
// ============================================================
// নতুন ডিপ্লয় হলে ব্যবহারকারীকে ম্যানুয়ালি cache clear করতে হবে না —
// নতুন service worker পাওয়া গেলেই সেটাকে activate করে পেজ auto-reload করে দেওয়া হয়।

if ("serviceWorker" in navigator) {
  let refreshing = false;

  // একই ট্যাবে নতুন SW activate হলে (controllerchange) — একবারই reload করো।
  // গুরুত্বপূর্ণ: unsaved বা in-flight save থাকলে সাথে সাথে reload করলে সেই
  // পরিবর্তন হারিয়ে যেতে পারে (নতুন deploy ঠিক ইউজার টাইপ করার মুহূর্তে
  // এলে)। তাই আগে চলমান save শেষ হওয়ার জন্য অল্প অপেক্ষা করা হয়, আর এখনো
  // unsaved change থাকলে ইউজারকে জিজ্ঞেস করে নেওয়া হয়।
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) return;
    refreshing = true;
    safeReloadForUpdate();
  });

  async function safeReloadForUpdate() {
    // চলমান/pending save শেষ হওয়ার জন্য সর্বোচ্চ ৫ সেকেন্ড অপেক্ষা করা হয়
    const deadline = Date.now() + 5000;
    while ((isSaving || pendingSaveContent !== null) && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 150));
    }
    if (isDirty) {
      const proceed = confirm(
        "An update is available, but you have unsaved changes. " +
        "Updating now could lose them. Update now anyway?"
      );
      if (!proceed) {
        refreshing = false; // পরে আবার visibilitychange/interval-এ update() ট্রাই হবে
        return;
      }
    }
    window.location.reload();
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        // পেজ খোলা অবস্থায় থাকতেই মাঝেমধ্যে নতুন ভার্সন আছে কিনা চেক করো
        setInterval(() => reg.update(), 60 * 1000); // প্রতি ১ মিনিটে

        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener("statechange", () => {
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              // নতুন ভার্সন ইনস্টল হয়ে গেছে, পুরনোটা এখনো চালু আছে — নতুনটাকে
              // এখনই activate হতে বলো, তারপর controllerchange event reload করবে
              newWorker.postMessage("SKIP_WAITING");
            }
          });
        });

        // পেজ ফোকাসে ফিরলে (ট্যাব বদলে আবার আসা) আপডেট চেক করো
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") reg.update();
        });
      })
      .catch((err) => console.warn("SW registration failed", err));
  });
}
