// app.js — মূল অ্যাপ লজিক

import * as api from "./js/api.js";
import * as cache from "./js/cache.js";
import { buildTree, sortedEntries, isMarkdown, isImage, isPdf } from "./js/tree.js";
import { createEditor, setEditorContent, destroyEditor } from "./js/editor.js";

// ============================================================
// গ্লোবাল error log — অ্যাপে কোথাও uncaught exception বা unhandled
// promise rejection হলে স্বয়ংক্রিয়ভাবে IndexedDB-তে (cache.js-এর
// মাধ্যমে) লগ হয়ে যায়। ইউজার স্ক্রিনশট/বর্ণনা না দিলেও পরে Settings
// থেকে দেখা যায় কী হয়েছিল। ফাইলের একদম শুরুতে বসানো হয়েছে যাতে বাকি
// অ্যাপ init হওয়ার আগে ঘটা যেকোনো error-ও ধরা পড়ে।
// ============================================================

window.addEventListener("error", (event) => {
  cache.logError({
    message: event.message,
    stack: event.error && event.error.stack ? event.error.stack : null,
    source: event.filename ? `${event.filename}:${event.lineno}:${event.colno}` : null,
  });
});

window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason;
  cache.logError({
    message: reason && reason.message ? reason.message : String(reason),
    stack: reason && reason.stack ? reason.stack : null,
    source: "unhandled promise rejection",
  });
});

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
const btnThemeToggle = el("btn-theme-toggle");
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

const btnQuickSwitcher = el("btn-quick-switcher");
const quickSwitcherOverlay = el("quick-switcher-overlay");
const quickSwitcherInput = el("quick-switcher-input");
const quickSwitcherResults = el("quick-switcher-results");

const btnSettings = el("btn-settings");
const settingsModalOverlay = el("settings-modal-overlay");
const settingsVaultInfo = el("settings-vault-info");
const settingsClose = el("settings-close");
const settingsLogout = el("settings-logout");
const settingsClearCache = el("settings-clear-cache");
const settingsViewErrors = el("settings-view-errors");
const errorLogOverlay = el("error-log-overlay");
const errorLogList = el("error-log-list");
const errorLogClear = el("error-log-clear");
const errorLogClose = el("error-log-close");
const settingsThemeToggle = el("settings-theme-toggle");
const themeColorMeta = el("theme-color-meta");

const deleteConfirmOverlay = el("delete-confirm-overlay");
const deleteConfirmMessage = el("delete-confirm-message");
const deleteConfirmForm = el("delete-confirm-form");
const deleteConfirmPin = el("delete-confirm-pin");
const deleteConfirmError = el("delete-confirm-error");
const deleteConfirmCancel = el("delete-confirm-cancel");
const deleteConfirmSubmit = el("delete-confirm-submit");

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
  // আগের সেশনে অফলাইনে করা কোনো এডিট সিঙ্ক-বাকি থেকে গেলে (ট্যাব বন্ধ
  // হয়ে গিয়েছিল, নেট আসেনি) এখনই সেটা পাঠানোর চেষ্টা করা হয়
  flushOutbox();

  // মোবাইলে (৭৮০px-এর কম প্রশস্ত স্ক্রিনে) sidebar ডিফল্টভাবে বন্ধ থাকে
  // (hamburger মেনুতে ট্যাপ করলে খোলে) — কিন্তু অ্যাপ প্রথমবার চালু হলে
  // ইউজার সাধারণত সরাসরি ফাইল-লিস্টই দেখতে চান, তাই এখানে একবার
  // স্বয়ংক্রিয়ভাবে খুলে দেওয়া হচ্ছে। কোনো ফাইলে ট্যাপ করলে এমনিতেই
  // sidebar বন্ধ হয়ে এডিটর দেখাবে (row click handler-এ আগে থেকেই
  // closeMobileSidebar() কল করা আছে), তাই এটা যোগ করলেও ফাইল খোলার পরের
  // অভিজ্ঞতা একই থাকে — শুধু শুরুর extra ট্যাপটা বাদ যায়। ডেস্কটপে
  // (৭৮০px+) sidebar এমনিতেই সবসময় পাশে স্থায়ীভাবে দেখা যায় (আলাদা
  // "open"/overlay লজিক নেই), তাই সেখানে এই কোড কিছু করে না।
  if (window.matchMedia("(max-width: 780px)").matches) {
    sidebar.classList.add("open");
    sidebarOverlay.classList.add("show");
  }
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
    // ব্যাকগ্রাউন্ডে সব নোটের কনটেন্ট আগে থেকেই ক্যাশে নিয়ে আসা হচ্ছে —
    // এর ফলে অ্যাপ খোলার পরপরই যেকোনো ফাইলে ক্লিক করলে দ্বিতীয়বার ক্লিকের
    // মতোই তাৎক্ষণিক খুলবে (ইউজার লক্ষ্য করেছিলেন প্রথমবার ক্লিকে দেরি
    // হয়, দ্বিতীয়বার তাড়াতাড়ি হয় — এই prefetch সেই ফারাকটাই দূর করে)।
    // fire-and-forget: এটার জন্য অপেক্ষা করা হয় না, ব্যর্থ হলেও চুপচাপ।
    prefetchAllFiles(flatFiles);
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

// ============================================================
// ব্যাকগ্রাউন্ড prefetch — অ্যাপ খোলার পরপরই সব নোটের কনটেন্ট আগে থেকে
// ক্যাশে নিয়ে আসা, যাতে প্রথমবার কোনো ফাইলে ক্লিক করলেও দ্বিতীয়বারের
// মতোই তাৎক্ষণিক খোলে — নেটওয়ার্ক-রাউন্ডট্রিপের জন্য অপেক্ষা করতে না
// হয়। ছবি/PDF prefetch করা হয় না (সাধারণত বড় এবং তুলনামূলক কম-দরকারি,
// শুধু নোট/মার্কডাউন-ই মূল কনটেন্ট যা ইউজার বারবার খোলেন)।
// ============================================================

const PREFETCH_CONCURRENCY = 3; // একসাথে সর্বোচ্চ এতগুলো fetch — পুরো
// নেটওয়ার্ক/API-কে একবারে ভাসিয়ে না দিয়ে, তবু যথেষ্ট দ্রুত

async function prefetchAllFiles(flatFiles) {
  const textFiles = flatFiles.filter((f) => !isImage(f.name) && !isPdf(f.name));
  let index = 0;

  async function worker() {
    while (index < textFiles.length) {
      const file = textFiles[index++];
      try {
        // openTextFile()-এ আগে একবার এই একই ধরনের বাগ ধরা পড়েছিল আর
        // ঠিক করা হয়েছিল: অফলাইনে করা এডিট এখনো GitHub-এ সিঙ্ক না
        // হয়ে থাকলে (pending outbox entry), সেই এডিটটাই ফাইলের আসল
        // সর্বশেষ কন্টেন্ট — network থেকে fresh fetch করে সেটা
        // ওভাররাইট করা উচিত না, বিশেষ করে যদি এর মধ্যে GitHub-এ কেউ
        // (বা অন্য কোনো ডিভাইস) একই ফাইল বদলে ফেলে থাকে, তাহলে সেই
        // conflicting ভার্সন দিয়ে local cache-এ থাকা pending edit-এর
        // অপ্টিমিস্টিক কপি নীরবে চাপা পড়ে যেত। `prefetchAllFiles()`
        // নতুন যোগ হওয়া ফাংশন হওয়ায় সেই আগের ফিক্স এখানে প্রয়োগ হয়নি
        // — এখন pending outbox থাকলে পুরোপুরি স্কিপ করা হচ্ছে।
        const pendingOutbox = await cache.getOutboxEntry(file.path);
        if (pendingOutbox) continue;
        // ইতিমধ্যে ক্যাশে থাকা কনটেন্টের sha যদি GitHub-এর বর্তমান
        // sha-র সাথে মিলে যায়, তার মানে ফাইলটা অপরিবর্তিত — আবার
        // নেটওয়ার্ক কল করার দরকার নেই, স্কিপ করা হচ্ছে। এই চেকের
        // কারণেই দ্বিতীয়বার অ্যাপ খোলা থেকে prefetch প্রায় কিছুই
        // করে না (সব ইতিমধ্যে cache-এ), শুধু প্রথমবার বা নতুন/বদলে
        // যাওয়া ফাইলের জন্যই আসল নেটওয়ার্ক কল হয়।
        const cached = await cache.getFile(file.path);
        if (cached && cached.sha === file.sha) continue;
        const fresh = await api.fetchFile(file.path);
        await cache.setFile(file.path, fresh);
      } catch (err) {
        // best-effort — একটা ফাইল প্রিফেচ ব্যর্থ হলেও (নেট সমস্যা,
        // rate limit ইত্যাদি) বাকিগুলো চলতে থাকে, আর যেই ফাইলটা ব্যর্থ
        // হলো সেটা ইউজার সরাসরি ক্লিক করলে তখন normal fetch পথেই খুলবে
      }
    }
  }

  const workers = Array.from({ length: PREFETCH_CONCURRENCY }, () => worker());
  await Promise.all(workers);
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
  row.dataset.type = node.type; // "folder"/"file" — ড্র্যাগ-ড্রপে টার্গেট ফোল্ডার বের করতে ব্যবহার হয়

  // sidebar-এর ভেতরেই একটা ফাইল/ফোল্ডার টেনে অন্য ফোল্ডারে সরানো
  // (move) যায় — OS থেকে ফাইল টেনে আনার draggable এর সাথে গুলিয়ে না
  // যায় সেজন্য আলাদা কাস্টম MIME টাইপ ("application/x-mydian-path")
  // ব্যবহার করা হচ্ছে, যাতে drop হ্যান্ডলার বুঝতে পারে এটা internal
  // move নাকি OS থেকে আসা আসল ফাইল।
  row.draggable = true;
  row.addEventListener("dragstart", (e) => {
    // dragover চলাকালীন dataTransfer.getData() ব্রাউজার নিরাপত্তার
    // কারণে পড়া যায় না (শুধু drop-এ পড়া যায়) — তাই হাইলাইট আপডেট
    // করার সময় কাজে লাগানোর জন্য এই path আলাদাভাবেও মনে রাখা হচ্ছে
    draggedNodePath = node.path;
    e.dataTransfer.setData("application/x-mydian-path", node.path);
    e.dataTransfer.effectAllowed = "move";
  });
  row.addEventListener("dragend", () => {
    draggedNodePath = null;
    clearDragHighlight();
  });

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
      openDeleteConfirm({
        message: `This will delete all files in "${node.name}". This cannot be undone.`,
        onConfirm: () => deleteFolder(node),
      });
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
      openDeleteConfirm({
        message: `"${node.name}" will be deleted. This cannot be undone.`,
        onConfirm: () => deleteFileNode(node),
      });
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

    // আগে অফলাইনে করা এডিট এখনো GitHub-এ সিঙ্ক হয়নি এমন কিছু থাকলে
    // (outbox-এ পেন্ডিং) — সেটাই এই মুহূর্তে ফাইলের প্রকৃত/সর্বশেষ অবস্থা।
    const pendingOutbox = await cache.getOutboxEntry(node.path);
    if (pendingOutbox) {
      // এইখানে আগে একটা bug ছিল: isDirty=true সেট করে এডিটর-কন্টেন্ট
      // protect করা হতো ঠিকই, কিন্তু নিচের fresh fetch + cache.setFile()
      // তারপরও নিঃশর্তে চলত — ফলে persistent cache-এ পুরনো (এডিটের
      // আগের) কন্টেন্ট বসে যেত। এডিটর তখনকার মতো ঠিক দেখাত (কারণ
      // isDirty প্রোটেক্ট করছিল), কিন্তু ট্যাব বন্ধ করে পরে আবার এই
      // ফাইল খুললে (sync ততক্ষণে সফল না হলে) cache থেকে সেই পুরনো/ভুল
      // কন্টেন্টই দেখাত — ইউজারের এডিট আসলে outbox-এ নিরাপদ থাকলেও
      // দেখে মনে হতো হারিয়ে গেছে। এখন pending edit থাকলে fresh fetch
      // সম্পূর্ণ স্কিপ করা হচ্ছে — network থেকে আনা পুরনো ভার্সন দিয়ে
      // ওভাররাইট করার কোনো কারণই নেই যখন সঠিক/সর্বশেষ কন্টেন্ট এমনিতেই
      // হাতে আছে।
      if (!shownFromCache) {
        // এটা সাধারণত ঘটার কথা না (flushSave() সবসময় "files" cache আর
        // outbox একসাথে লেখে), কিন্তু defensive: files-cache মিসিং হলেও
        // outbox-এর content সরাসরি দেখানো হচ্ছে, যাতে ভুলবশত খালি এডিটর
        // বা পুরনো fetch করা কন্টেন্ট না দেখায়।
        currentFile = { path: node.path, sha: pendingOutbox.baseSha, type };
        editorView = createEditor({
          parent: cmHost,
          doc: pendingOutbox.content,
          onChange: (c) => saveCurrentFile(c),
        });
        highlightActiveRow(node.path);
      }
      isDirty = true;
      if (currentFile && currentFile.path === node.path) {
        setSaveIndicator("offline", "This offline edit hasn't synced yet");
      }
      flushOutbox();
      return;
    }

    if (!shownFromCache) {
      // ক্যাশে/outbox-এ কিছুই পাওয়া যায়নি — এই মুহূর্ত থেকে নেটওয়ার্ক
      // fetch শেষ না হওয়া পর্যন্ত খালি স্ক্রিন দেখানোর বদলে একটা সংক্ষিপ্ত
      // ইঙ্গিত দেখানো হচ্ছে, যাতে মনে না হয় অ্যাপ আটকে গেছে।
      cmHost.innerHTML = `<div class="editor-loading">Loading…</div>`;
    }

    const fresh = await api.fetchFile(node.path);
    cache.setFile(node.path, fresh);

    // এই fetch চলাকালীন ইউজার অন্য ফাইলে চলে গেলে এই রেসপন্স আর প্রযোজ্য না
    if (!currentFile || currentFile.path !== node.path) return;

    if (!shownFromCache) {
      // ক্যাশে কিছুই ছিল না — এই প্রথমবার GitHub থেকেই দেখানো হচ্ছে।
      // createEditor() cmHost-এর ভেতরে নিজের DOM যোগ করে, কিন্তু ওপরে
      // বসানো "Loading…" ইঙ্গিতটা নিজে থেকে সরায় না (সেটা editor.js-এর
      // দায়িত্ব না) — তাই createEditor কল করার ঠিক আগে ম্যানুয়ালি
      // cmHost খালি করে দেওয়া হচ্ছে, নাহলে দুটো একসাথে দেখা যেত।
      cmHost.innerHTML = "";
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

  // প্রথমেই (network attempt শুরুর আগেই) এই এডিটটা লোকালি স্থায়ীভাবে
  // (IndexedDB) সংরক্ষণ করে রাখা হচ্ছে — দুই জায়গায়:
  //  ১) "files" ক্যাশ — যাতে ফাইলটা পরে খুললে (অফলাইনেও) এই সর্বশেষ
  //     টাইপ করা কনটেন্টই তাৎক্ষণিক দেখা যায়।
  //  ২) "outbox" — GitHub-এ এখনো না-পাঠানো এডিট হিসেবে চিহ্নিত থাকে,
  //     ট্যাব বন্ধ হয়ে গেলে বা নেট চলে গেলেও হারায় না, নেট ফিরলে
  //     স্বয়ংক্রিয়ভাবে পাঠানো হয় (flushOutbox দ্রষ্টব্য)।
  cache.setFile(targetFile.path, { content, sha: targetFile.sha });
  cache.queueOutboxEntry(targetFile.path, content, targetFile.sha);

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
    cache.clearOutboxEntry(targetFile.path); // GitHub-এ সফলভাবে পৌঁছে গেছে, আর পেন্ডিং না
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
    updatePendingBadge();
  } catch (err) {
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
      cache.clearOutboxEntry(targetFile.path); // ভুল base sha দিয়ে আর অটো-রিট্রাই করা হবে না
      if (currentFile === targetFile) {
        setSaveIndicator("error", err.message);
        alert(err.message);
      }
    } else {
      // নেটওয়ার্ক বা অন্য কোনো সাময়িক ব্যর্থতা — outbox এন্ট্রি ইচ্ছাকৃতভাবে
      // রাখা হচ্ছে (উপরেই queue করা হয়েছে), নেট ফিরলে/পরের চেষ্টায়
      // স্বয়ংক্রিয়ভাবে সিঙ্ক হবে। ইউজারকে "ব্যর্থ" না বলে অফলাইন অবস্থা
      // স্পষ্টভাবে জানানো হচ্ছে যাতে দুশ্চিন্তা না হয়।
      const looksOffline = !navigator.onLine || err.name === "TypeError";
      if (currentFile === targetFile) {
        setSaveIndicator(looksOffline ? "offline" : "error", err.message);
      }
      if (looksOffline) setSyncStatus("offline", "Offline — change saved locally, will sync when back online");
    }
    updatePendingBadge();
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
  const map = { saving: "Saving…", saved: "Saved ✓", error: "Save failed", offline: "Saved offline", "": "" };
  saveIndicator.textContent = map[state] ?? "";
  saveIndicator.title = detail || "";
}

// ============================================================
// Offline outbox — সিঙ্ক-বাকি এডিট নেট ফিরলে/অ্যাপ খোলার সময় স্বয়ংক্রিয়ভাবে পাঠায়
// ============================================================

let outboxFlushing = false;

async function flushOutbox() {
  if (outboxFlushing) return;
  const entries = await cache.getAllOutboxEntries();
  if (!entries.length) {
    updatePendingBadge();
    return;
  }
  outboxFlushing = true;
  try {
    for (const entry of entries) {
      // বর্তমানে খোলা ফাইলের জন্য যদি সাধারণ সেভ-পাইপলাইন (flushSave)
      // ইতিমধ্যে in-flight/queued থাকে, তাহলে এখানে সমান্তরালে আরেকটা PUT
      // পাঠানো হচ্ছে না — নাহলে একই ফাইলে দুটো সেভ একসাথে গিয়ে ভুল sha
      // দিয়ে একে অপরকে 409 Conflict দিয়ে ব্যর্থ করতে পারত। এই এন্ট্রি
      // outbox-এই থেকে যাচ্ছে, flushSave নিজেই সফল হলে সেটা সরিয়ে দেবে।
      const isCurrentFile = currentFile && entry.path === currentFile.path;
      if (isCurrentFile && (isSaving || pendingSaveContent !== null)) {
        continue;
      }
      // currentFile-এর জন্য PUT পাঠানোর পুরো সময়টা isSaving true রাখা
      // হচ্ছে — এই সময়ের মধ্যে ইউজার টাইপ করলে সেটা flushSave-এর নিজস্ব
      // "একই সময়ে একটাই PUT" নিয়ম মেনে pendingSaveContent-এ সারিবদ্ধ হবে,
      // সরাসরি আরেকটা সমান্তরাল PUT পাঠাবে না।
      if (isCurrentFile) isSaving = true;
      try {
        const base64 = api.encodeBase64Utf8(entry.content);
        const result = await api.putFile(entry.path, base64, `Update ${entry.path}`, entry.baseSha);
        await cache.clearOutboxEntry(entry.path);
        await cache.setFile(entry.path, { content: entry.content, sha: result.content.sha });
        if (isCurrentFile) {
          currentFile.sha = result.content.sha;
          isDirty = false;
          setSaveIndicator("saved");
          setTimeout(() => setSaveIndicator(""), 2000);
        }
      } catch (err) {
        if (err.message && err.message.includes("has already been changed elsewhere")) {
          // conflict — auto-merge সম্ভব না, এই এন্ট্রিটা বাদ দিয়ে বাকিগুলো
          // চেষ্টা করা হচ্ছে। লোকাল ক্যাশে (files store) ইউজারের লেখা
          // এখনো আছে, শুধু auto-sync queue থেকে সরানো হলো।
          await cache.clearOutboxEntry(entry.path);
          if (isCurrentFile) {
            setSaveIndicator("error", err.message);
            alert(err.message);
          }
        } else {
          // নেটওয়ার্ক এখনো ফেরেনি (বা সাময়িক সমস্যা) — বাকি এন্ট্রিগুলোও
          // একই কারণে ব্যর্থ হবে, তাই এখানেই থেমে পরের সুযোগে (online
          // ইভেন্ট বা পরের অ্যাপ-লোড) আবার চেষ্টা করা হবে
          if (isCurrentFile) isSaving = false;
          break;
        }
      }
      if (isCurrentFile) {
        isSaving = false;
        // PUT চলাকালীন ইউজার নতুন করে টাইপ করে থাকলে সেটা এতক্ষণে
        // pendingSaveContent-এ জমা হয়ে থাকবে — flushSave নিজে যেভাবে
        // এই চেইন চালায়, এখানেও একইভাবে সেটা এখনই পাঠিয়ে দেওয়া হচ্ছে
        if (pendingSaveContent !== null) {
          const nextContent = pendingSaveContent;
          const nextTarget = pendingSaveTarget;
          pendingSaveContent = null;
          pendingSaveTarget = null;
          flushSave(nextTarget, nextContent);
        }
      }
    }
  } finally {
    outboxFlushing = false;
    updatePendingBadge();
  }
}

// sync-dot/status-এ কতগুলো পরিবর্তন এখনো সিঙ্ক হওয়া বাকি সেটা দেখায় —
// এটা flushOutbox শেষে এবং অ্যাপ চালু হওয়ার সময় কল হয়
async function updatePendingBadge() {
  const entries = await cache.getAllOutboxEntries();
  if (entries.length > 0) {
    setSyncStatus("offline", `${entries.length} change${entries.length > 1 ? "s" : ""} pending sync`);
  } else if (navigator.onLine) {
    setSyncStatus("online", "Synced");
  }
}

// ব্রাউজারের নেটওয়ার্ক স্ট্যাটাস বদলালেই (আগে পরের loadFileTree() কলের
// অপেক্ষা না করে) সাথে সাথে sync-dot আপডেট হয়, আর নেট ফিরলে outbox-এ
// জমে থাকা এডিট থাকলে সেগুলো স্বয়ংক্রিয়ভাবে পাঠানোর চেষ্টা হয়
window.addEventListener("online", () => {
  setSyncStatus("syncing", "Syncing…");
  flushOutbox();
});
window.addEventListener("offline", () => {
  setSyncStatus("offline", "Offline — no internet connection");
});

// ============================================================
// Create / delete
// ============================================================

async function createFile(path, initialContent = "", openAfterCreate = true) {
  // renameFile()-এ আগে থেকেই একই নামের ফাইল আছে কিনা চেক করা হতো
  // (সুন্দর বার্তা দিয়ে), কিন্তু নতুন ফাইল তৈরির এই পথে সেই চেকটা ছিল
  // না — একই নামের ফাইল থাকলে GitHub-এর raw টেকনিক্যাল এরর (sha না
  // দেওয়ার কারণে) দেখাত, বোধগম্য কিছু না। এখন সামঞ্জস্যপূর্ণভাবে একই
  // চেক এখানেও বসানো হলো।
  if (findNodeByPath(path)) {
    alert("A file with this name already exists.");
    return;
  }
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
  // ফোল্ডার আগে থেকেই থাকলে (এই অ্যাপ দিয়ে খালি অবস্থায় তৈরি করা হলে
  // .gitkeep পাওয়া যাবে) সুন্দর বার্তা দেখানো হচ্ছে — নাহলে নিচের
  // createFile()-এর ভেতরের চেকই এটা ধরত, কিন্তু বার্তাটা "ফাইল" বলত,
  // "ফোল্ডার" বলত না, যেটা বিভ্রান্তিকর হতো।
  if (findNodeByPath(`${path}/.gitkeep`)) {
    alert("A folder with this name already exists.");
    return;
  }
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

function uniquifyPath(path) {
  // একই নামের ফাইল আগে থেকে থাকলে "-1", "-2" ... জুড়ে একটা খালি নাম
  // খুঁজে বের করে — attachment-এর ক্ষেত্রে (যেমন বারবার পেস্ট করা
  // স্ক্রিনশট, প্রায়ই একই জেনেরিক নামে আসে) ব্লক করে বিরক্ত করার বদলে
  // স্বয়ংক্রিয়ভাবে আলাদা নাম দেওয়াই বেশি সহায়ক।
  if (!findNodeByPath(path)) return path;
  const slashIndex = path.lastIndexOf("/");
  const dotIndex = path.lastIndexOf(".");
  const hasExt = dotIndex > slashIndex;
  const base = hasExt ? path.slice(0, dotIndex) : path;
  const ext = hasExt ? path.slice(dotIndex) : "";
  let i = 1;
  let candidate;
  do {
    candidate = `${base}-${i}${ext}`;
    i++;
  } while (findNodeByPath(candidate));
  return candidate;
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

  // অফলাইনে করা এডিট এখনও সিঙ্ক না হয়ে থাকলে (pending outbox entry),
  // সেই এডিটটাই আসল/সর্বশেষ কন্টেন্ট — কিন্তু আগে এখানে সরাসরি GitHub
  // থেকে fresh fetch করা হতো, যেটা এডিটের *আগের* পুরনো ভার্সন নিয়ে
  // আসত। ফলে নতুন নামের ফাইলে পুরনো কন্টেন্ট কপি হয়ে যেত, ইউজারের
  // এডিট হারিয়ে যেত — এবং পুরনো path মুছে যাওয়ার পর outbox entry-টাও
  // চিরকালের জন্য অনাথ (আর কখনো সিঙ্ক করা সম্ভব না এমন) হয়ে যেত।
  const pendingOutbox = await cache.getOutboxEntry(node.path);

  let base64, putResult;
  try {
    base64 = pendingOutbox
      ? api.encodeBase64Utf8(pendingOutbox.content)
      : (await api.fetchFileRaw(node.path)).base64;
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
  // pendingOutbox থাকলে সেটার content ইতিমধ্যে উপরের putFile()-এ
  // newPath-এ পাঠানো হয়ে গেছে — কিন্তু পুরনো path-এর outbox entry নিজে
  // থেকে মোছে না, আর flushOutbox() শুধু cache.getAllOutboxEntries()
  // থেকে পাওয়া এন্ট্রি নিয়েই কাজ করে, rename() সেই লিস্ট touch করে না।
  // এই entry মুছে না দিলে (৯৫৬-৯৫৭ লাইনের কমেন্টে এই ঝুঁকিটাই আগে থেকে
  // লেখা ছিল, কিন্তু আসল clear() call বসানো বাদ পড়ে গিয়েছিল) পরে
  // flushOutbox() পুরনো (এখন GitHub-এ ডিলিট হয়ে যাওয়া) path-এ PUT
  // পাঠানোর চেষ্টা করত — সেটা ব্যর্থ হয়ে বিভ্রান্তিকর "changed
  // elsewhere" এরর দেখাত, যদিও rename আসলে সফলই হয়েছিল।
  if (pendingOutbox) cache.clearOutboxEntry(node.path);
  if (!isImage(newName) && !isPdf(newName)) {
    try {
      // pendingOutbox থাকলে সেটার content সরাসরি ব্যবহার করা হচ্ছে (আগেই
      // plain text আকারে আছে) — base64 থেকে আবার decode করার দরকার নেই।
      // rename-এর এই PUT কলটাই pending edit-এর জন্য প্রকৃত সিঙ্ক হিসেবে
      // কাজ করল (GitHub-এ এখন নতুন path-এ সঠিক/সর্বশেষ কন্টেন্ট আছে),
      // তাই নতুন করে outbox-এ queue করার দরকার নেই।
      const content = pendingOutbox ? pendingOutbox.content : api.decodeBase64Utf8(base64);
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

btnRefresh.addEventListener("click", () => {
  loadFileTree();
  flushOutbox();
});

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
  openDeleteConfirm({
    message: `"${currentFile.path}" will be deleted. This cannot be undone.`,
    onConfirm: () => deleteFileNode({ path: currentFile.path, sha: currentFile.sha }),
  });
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
        // একই নামের attachment আগে থেকে থাকলে (স্ক্রিনশট পেস্ট করলে প্রায়ই
        // একই জেনেরিক নাম আসে) ব্লক করে বিরক্ত করার বদলে স্বয়ংক্রিয়ভাবে
        // আলাদা নাম (image-1.png ইত্যাদি) দেওয়া হচ্ছে — আগে এটা GitHub-এ
        // raw টেকনিক্যাল এরর দিয়ে ব্যর্থ হতো।
        const path = uniquifyPath(`${targetFolder}/${safeName}`);
        await api.putFile(path, base64, `Add attachment ${path.split("/").pop()}`);
        resolve();
      } catch (err) {
        alert("Upload failed: " + err.message);
        reject(err);
      }
    };
    reader.readAsDataURL(file);
  });
}

// ---------- Sidebar drag & drop (OS ফাইল/ফোল্ডার আনা, এবং sidebar-এর
// ভেতরেই ফাইল/ফোল্ডার টেনে অন্য ফোল্ডারে সরানো) ----------

let dragHighlightEl = null;
let draggedNodePath = null; // internal move-drag এর সোর্স path (dragover-এ getData() পড়া যায় না বলে এভাবে ট্র্যাক করা হয়)

fileTreeEl.addEventListener("dragover", (e) => {
  const isInternal = e.dataTransfer.types.includes("application/x-mydian-path");
  const isExternal = e.dataTransfer.types.includes("Files");
  if (!isInternal && !isExternal) return; // অ্যাপের বাইরের কোনো অপ্রাসঙ্গিক drag (যেমন টেক্সট সিলেকশন) হলে কিছু করা হচ্ছে না
  e.preventDefault(); // এটা না করলে ব্রাউজার ডিফল্ট আচরণ (ফাইল নতুন ট্যাবে খোলা) করে ফেলবে, drop ইভেন্টই আসবে না
  e.dataTransfer.dropEffect = isInternal ? "move" : "copy";
  updateDragHighlight(e);
});

fileTreeEl.addEventListener("dragleave", (e) => {
  // sidebar-এর ভেতরের একটা child থেকে আরেকটা child-এ গেলেও dragleave
  // ফায়ার হয় — তাই সত্যিই sidebar-এর বাইরে বেরিয়ে গেছে কিনা সেটা চেক
  // করেই হাইলাইট সরানো হচ্ছে, নাহলে হাইলাইট ঝিকিমিকি করত
  if (!fileTreeEl.contains(e.relatedTarget)) clearDragHighlight();
});

fileTreeEl.addEventListener("drop", async (e) => {
  const isInternal = e.dataTransfer.types.includes("application/x-mydian-path");
  const isExternal = e.dataTransfer.types.includes("Files");
  if (!isInternal && !isExternal) return;
  e.preventDefault();
  const targetFolder = dropTargetFolder(e);
  clearDragHighlight();

  if (isInternal) {
    const sourcePath = e.dataTransfer.getData("application/x-mydian-path") || draggedNodePath;
    draggedNodePath = null;
    const node = sourcePath && findNodeByPath(sourcePath);
    if (node) await moveNode(node, targetFolder);
    return;
  }

  const dropped = await readDroppedEntries(e.dataTransfer);
  if (!dropped.length) return;
  const skipped = [];
  const failed = [];
  for (const { file, relPath } of dropped) {
    try {
      await uploadDroppedFile(file, targetFolder, relPath);
    } catch (err) {
      if (err.message === "EXISTS") skipped.push(relPath || file.name);
      else failed.push(`${relPath || file.name}: ${err.message}`);
    }
  }
  await loadFileTree();
  if (skipped.length || failed.length) {
    let msg = "";
    if (skipped.length) msg += `Already exists, skipped:\n${skipped.join("\n")}`;
    if (failed.length) msg += (msg ? "\n\n" : "") + `Failed to import:\n${failed.join("\n")}`;
    alert(msg);
  }
});

// মাউস কোন row-এর উপর আছে সেটা দেখে সেই ফোল্ডারকে হাইলাইট করা হয়
// (ফাইলের উপর হলে তার প্যারেন্ট ফোল্ডারের row-টাই হাইলাইট হয়, রুট হলে
// পুরো sidebar)
function updateDragHighlight(e) {
  const targetPath = dropTargetFolder(e);
  let target;
  if (targetPath === "") {
    target = "root";
  } else {
    target = fileTreeEl.querySelector(`.tree-row[data-type="folder"][data-path="${CSS.escape(targetPath)}"]`);
  }
  if (target === dragHighlightEl) return;
  clearDragHighlight();
  if (target === "root") {
    fileTreeEl.classList.add("drag-over-root");
    dragHighlightEl = "root";
  } else if (target) {
    target.classList.add("drag-over");
    dragHighlightEl = target;
  }
}

function clearDragHighlight() {
  fileTreeEl.querySelectorAll(".tree-row.drag-over").forEach((r) => r.classList.remove("drag-over"));
  fileTreeEl.classList.remove("drag-over-root");
  dragHighlightEl = null;
}

// ড্রপ কোন row-এর উপর হয়েছে সেটা থেকে target ফোল্ডার বের করে —
// ফোল্ডারের উপর ড্রপ হলে সেই ফোল্ডার, ফাইলের উপর হলে তার প্যারেন্ট
// ফোল্ডার, আর কোনো row না হলে (খালি জায়গায়) vault-এর root
function dropTargetFolder(e) {
  const row = e.target.closest && e.target.closest(".tree-row[data-path]");
  if (!row) return "";
  const path = row.dataset.path;
  if (row.dataset.type === "folder") return path;
  const idx = path.lastIndexOf("/");
  return idx === -1 ? "" : path.slice(0, idx);
}

// sidebar-এর ভেতরেই একটা ফাইল/ফোল্ডার অন্য ফোল্ডারে সরানো — GitHub
// Contents API-তে সরাসরি "move" বলে কিছু নেই, তাই renameFile()-এর মতোই
// দুই ধাপে করা হয় (নতুন পাথে কপি, তারপর পুরনোটা ডিলিট); ফোল্ডার হলে
// তার ভেতরের প্রতিটা ফাইলের জন্য আলাদাভাবে এই একই প্রক্রিয়া চলে,
// সাব-ফোল্ডার গঠন অক্ষত রেখে।
async function moveNode(node, targetFolder) {
  const parentPath = node.path.split("/").slice(0, -1).join("/");
  if (parentPath === targetFolder || targetFolder === node.path) return; // ইতিমধ্যে সেখানেই আছে, বা নিজের উপরেই ড্রপ হয়েছে — নিঃশব্দে কিছু করার দরকার নেই

  if (node.type === "folder" && (targetFolder === node.path || targetFolder.startsWith(node.path + "/"))) {
    alert("Can't move a folder into itself or one of its own subfolders.");
    return;
  }

  const baseName = node.path.split("/").pop();
  const newBasePath = targetFolder ? `${targetFolder}/${baseName}` : baseName;
  if (findNodeByPath(newBasePath)) {
    alert(`"${baseName}" already exists in that folder.`);
    return;
  }

  const filesToMove = node.type === "folder" ? collectAllFiles(node) : [node];
  if (!filesToMove.length) return; // থিওরিটিক্যালি অসম্ভব (খালি ফোল্ডারেও .gitkeep থাকে), তবু নিরাপত্তার জন্য গার্ড

  const wasOpenPath = currentFile ? currentFile.path : null;
  if (wasOpenPath && filesToMove.some((f) => f.path === wasOpenPath)) cancelPendingSave();

  const moved = []; // সফলভাবে সরানো ফাইলের { oldPath, newPath } হিসাব
  const duplicated = []; // নতুন জায়গায় কপি সফল হয়েছে কিন্তু পুরনোটা ডিলিট করা যায়নি — ম্যানুয়াল সাফাই লাগবে
  const failed = []; // সম্পূর্ণ ব্যর্থ (নতুন জায়গায় কপি-ই হয়নি) — পুরনো জায়গায় অপরিবর্তিত আছে
  for (const f of filesToMove) {
    const relative = f.path.slice(node.path.length); // ফোল্ডার হলে "/sub/file.md", প্লেইন ফাইল হলে ""
    const newPath = node.type === "folder" ? `${newBasePath}${relative}` : newBasePath;
    // renameFile()-এর মতোই — অফলাইনে করা এডিট সিঙ্ক-বাকি থাকলে
    // (pending outbox), সেটাই আসল কন্টেন্ট। fresh GitHub fetch এখানে
    // পুরনো ভার্সন এনে দিত, move-এর পর এডিট হারিয়ে যেত।
    const pendingOutbox = await cache.getOutboxEntry(f.path);
    let base64, putResult;
    try {
      base64 = pendingOutbox
        ? api.encodeBase64Utf8(pendingOutbox.content)
        : (await api.fetchFileRaw(f.path)).base64;
      putResult = await api.putFile(newPath, base64, `Move ${f.path} → ${newPath}`);
    } catch (err) {
      // নতুন জায়গায় কপিই হয়নি — পুরনো ফাইল অক্ষত আছে, এই একটা ফাইল
      // failed হিসেবে গণ্য করে বাকি ফাইলগুলোর জন্য loop চালিয়ে যাওয়া
      // হচ্ছে (আগে একটা ফাইল ব্যর্থ হলে গোটা batch থেমে যেত, যদিও বাকি
      // ফাইলগুলো সফল হতে পারত)।
      failed.push(f.path);
      continue;
    }
    // এই পয়েন্টে নতুন জায়গায় কপি সফল — এখন থেকে যদি delete ব্যর্থ হয়,
    // ফাইলটা দুই জায়গাতেই থেকে যাবে (duplicate)। একবার রিট্রাই করা
    // হচ্ছে (network blip-এর মতো ক্ষণস্থায়ী সমস্যা প্রায়ই একবার আবার
    // চেষ্টা করলেই ঠিক হয়ে যায়), তারপরও ব্যর্থ হলে duplicate হিসেবে
    // স্পষ্টভাবে রিপোর্ট করা হচ্ছে — যাতে ইউজার জানেন ম্যানুয়ালি পুরনো
    // কপি মুছতে হবে, বিভ্রান্তিকরভাবে "সব ঠিক আছে" মনে না করেন।
    let deleted = false;
    for (let attempt = 0; attempt < 2 && !deleted; attempt++) {
      try {
        await api.deleteFile(f.path, f.sha, `Move: remove old path ${f.path}`);
        deleted = true;
      } catch (err) {
        if (attempt === 1) duplicated.push({ oldPath: f.path, newPath });
      }
    }
    if (!deleted) continue; // পুরনো কপি রয়ে গেছে — নিচের cache/moved আপডেট এড়িয়ে যাওয়া হচ্ছে, কারণ পুরনো path-এর cache entry এখনো বৈধ
    cache.deleteFile(f.path);
    // pendingOutbox থাকলে সেটার কনটেন্ট ইতিমধ্যে newPath-এ putFile()
    // দিয়ে পাঠানো হয়ে গেছে (উপরে) — কিন্তু পুরনো path-এর outbox entry
    // নিজে থেকে মোছে না, কারণ flushOutbox() শুধু cache.getAllOutboxEntries()
    // থেকে পাওয়া এন্ট্রি নিয়ে কাজ করে, moveNode() সেই লিস্ট touch করে না।
    // এই entry মুছে না দিলে পরে flushOutbox() পুরনো (এখন GitHub-এ
    // ডিলিট হয়ে যাওয়া) path-এ PUT পাঠানোর চেষ্টা করত — সেটা GitHub-এ
    // conflict-এর মতো ব্যর্থ হয়ে ইউজারকে বিভ্রান্তিকর "changed elsewhere"
    // এরর দেখাত, যদিও move আসলে সফলই হয়েছিল। (deleted না হলে/duplicate
    // হলে এই clear করা হয় না — তখন পুরনো path GitHub-এ এখনো বৈধভাবে
    // আছে, outbox entry তখনো প্রাসঙ্গিক।)
    if (pendingOutbox) cache.clearOutboxEntry(f.path);
    if (!isImage(newPath) && !isPdf(newPath)) {
      try {
        const content = pendingOutbox ? pendingOutbox.content : api.decodeBase64Utf8(base64);
        cache.setFile(newPath, { content, sha: putResult.content.sha });
      } catch (e) {
        // decode ব্যর্থ হলেও move নিজে সফল হয়েছে — cache miss হলে পরের
        // ওপেনে স্বাভাবিকভাবেই network থেকে আনবে, কোনো ক্ষতি নেই
      }
    }
    moved.push({ oldPath: f.path, newPath });
  }

  if (duplicated.length || failed.length) {
    let msg = "";
    if (moved.length) msg += `${moved.length} of ${filesToMove.length} file(s) moved successfully.\n\n`;
    if (duplicated.length) {
      msg += `These were copied to the new location but the old copy could NOT be removed — please delete the old copy manually:\n${duplicated.map((d) => d.oldPath).join("\n")}\n\n`;
    }
    if (failed.length) {
      msg += `These failed to move (unchanged, still in the old location):\n${failed.join("\n")}`;
    }
    alert(msg.trim());
  }

  await loadFileTree();
  if (wasOpenPath) {
    const movedEntry = moved.find((m) => m.oldPath === wasOpenPath);
    if (movedEntry) {
      const newNode = findNodeByPath(movedEntry.newPath);
      if (newNode) openFile(newNode);
    } else if (!findNodeByPath(wasOpenPath)) {
      closeEditor();
    }
  }
}

// dataTransfer থেকে { file, relPath } এন্ট্রির লিস্ট বের করে। Chrome/Edge/
// নতুন Firefox-এ webkitGetAsEntry() সাপোর্ট থাকলে পুরো ফোল্ডার (সাব-ফোল্ডার
// সহ, Obsidian-এর মতো) ড্র্যাগ করে আনা যায়; না থাকলে (পুরনো ব্রাউজার/Safari)
// শুধু আলাদা আলাদা ফাইলগুলো fallback হিসেবে import হয়, ফোল্ডার স্কিপ হয়ে যায়।
async function readDroppedEntries(dataTransfer) {
  const items = Array.from(dataTransfer.items || []);
  const supportsEntries = items.length > 0 && typeof items[0].webkitGetAsEntry === "function";

  if (!supportsEntries) {
    return Array.from(dataTransfer.files || []).map((file) => ({ file, relPath: file.name }));
  }

  const results = [];
  async function walk(entry, prefix) {
    if (entry.isFile) {
      const file = await new Promise((resolve, reject) => entry.file(resolve, reject));
      results.push({ file, relPath: prefix + entry.name });
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      // Chrome-এ readEntries() একবারে সর্বোচ্চ ১০০টা এন্ট্রি দেয় — খালি
      // array না পাওয়া পর্যন্ত বারবার কল করে সবগুলো জোগাড় করা হচ্ছে
      let children = [];
      let batch;
      do {
        batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
        children = children.concat(batch);
      } while (batch.length > 0);
      for (const child of children) {
        await walk(child, prefix + entry.name + "/");
      }
    }
  }

  for (const item of items) {
    const entry = item.webkitGetAsEntry && item.webkitGetAsEntry();
    if (entry) await walk(entry, "");
  }
  return results;
}

function uploadDroppedFile(file, targetFolder, relPath) {
  return new Promise((resolve, reject) => {
    const safeRelPath = sanitizeRelPath(relPath || file.name);
    const path = targetFolder ? `${targetFolder}/${safeRelPath}` : safeRelPath;
    // আগে থেকে এই path-এ ফাইল থাকলে GitHub-এ পাঠিয়ে raw টেকনিক্যাল এরর
    // (sha না দেওয়ার কারণে) পাওয়ার বদলে এখানেই আগে থেকে ধরে ফেলা হচ্ছে।
    // একাধিক ফাইল একসাথে ড্র্যাগ করলে প্রতিটার জন্য আলাদা alert()
    // বিরক্তিকর হতো, তাই এখানে শুধু reject করা হচ্ছে — drop
    // হ্যান্ডলার পুরো ব্যাচ শেষে একটা সারাংশ দেখাবে।
    if (findNodeByPath(path)) {
      reject(new Error("EXISTS"));
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64 = reader.result.split(",")[1];
        await api.putFile(path, base64, `Add ${path} (drag & drop)`);
        resolve();
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function sanitizePathSegment(seg) {
  return seg.replace(/^\.+/, "").replace(/[\x00-\x1f<>:"|?*]/g, "_").trim();
}

function sanitizeFilename(name) {
  // path separator ('/', '\'), leading dots (hidden file/'..'), এবং
  // অন্যান্য filesystem-এ সমস্যাযুক্ত ক্যারেক্টার সরিয়ে দেওয়া হয়
  const base = name.split(/[/\\]/).pop() || "file";
  const cleaned = sanitizePathSegment(base);
  return cleaned || "file";
}

// drag-drop দিয়ে পুরো ফোল্ডার import করার সময় সাব-ফোল্ডার গঠন ঠিক
// রাখতে হয় — তাই sanitizeFilename-এর মতো শুধু শেষ অংশ না নিয়ে,
// প্রতিটা অংশ আলাদা করে sanitize করে আবার জোড়া দেওয়া হচ্ছে
function sanitizeRelPath(relPath) {
  const cleaned = relPath
    .split(/[/\\]/)
    .map(sanitizePathSegment)
    .filter(Boolean)
    .join("/");
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

// কোনো মোডাল খোলার আগে অন্য যেকোনো খোলা মোডাল বন্ধ করে দেয় — দুটো
// একসাথে stack হওয়া ঠেকাতে। আগে প্রতিটা open___() ফাংশনে নির্দিষ্ট করে
// কয়েকটা মোডাল ভ্যারিয়েবল হাতে লেখা ছিল (যেমন শুধু
// `settingsModalOverlay.hidden = true`), যেটা নতুন মোডাল যোগ হলে (যেমন
// পরে error-log-overlay) stale হয়ে যেত — ঠিক এই কারণেই quick
// switcher-এ একটা বাগ হয়েছিল (Ctrl+K চাপলে Error Log-এর উপর স্ট্যাক
// হয়ে যেত, কারণ সেই মোডালের কথা লিস্টে ছিল না)। সব মোডাল একই
// `.modal-overlay` ক্লাস শেয়ার করে বলে এখন generic query দিয়ে খোঁজা
// হচ্ছে — ভবিষ্যতে নতুন মোডাল যোগ হলে এই ফাংশন না ছুঁয়েও কাজ করবে।
function closeOtherModals(exceptOverlay) {
  document.querySelectorAll(".modal-overlay:not([hidden])").forEach((el) => {
    if (el !== exceptOverlay) el.hidden = true;
  });
}

function openModal({ title, placeholder, hint, initialValue = "", onConfirm }) {
  closeOtherModals(modalOverlay);
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
// Theme (dark/light)
// ============================================================
// index.html-এর <head>-এ একটা ছোট inline script আগেই localStorage থেকে
// পড়ে <html data-theme="..."> বসিয়ে দেয় (flash এড়াতে, CSS লোড হওয়ার
// আগেই)। এখানে শুধু toggle বাটনের লজিক আর টেক্সট/meta sync করা হচ্ছে।

const THEME_KEY = "mydian-theme";
const THEME_COLORS = { dark: "#151517", light: "#f2efe9" };

function getCurrentTheme() {
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

function applyTheme(theme) {
  if (theme === "light") {
    document.documentElement.setAttribute("data-theme", "light");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
  themeColorMeta.setAttribute("content", THEME_COLORS[theme]);
  // বাটনের টেক্সট সবসময় "এখন যা চলছে" দেখায় (আইকন সহ), ট্যাপ করলে উল্টো
  // মোডে চলে যাবে — এটা settings মোডাল বন্ধ থাকা অবস্থাতেও sync রাখা
  // দরকার, কারণ পরের বার খোলার সময় যেন সঠিক টেক্সট দেখায়।
  settingsThemeToggle.textContent = theme === "light" ? "☀️ Light mode" : "🌙 Dark mode";
  // sidebar-এর icon-বাটনও একই স্টেট দেখায় (title + আইকন), যাতে settings
  // মোডাল না খুলেও হোমপেজ থেকে এক ক্লিকে টগল করা যায়।
  btnThemeToggle.title = theme === "light" ? "Switch to dark mode" : "Switch to light mode";
  btnThemeToggle.setAttribute("aria-label", btnThemeToggle.title);
  btnThemeToggle.textContent = theme === "light" ? "☀️" : "🌙";
}

applyTheme(getCurrentTheme());

function toggleTheme() {
  const next = getCurrentTheme() === "light" ? "dark" : "light";
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
}

settingsThemeToggle.addEventListener("click", toggleTheme);
btnThemeToggle.addEventListener("click", toggleTheme);

// ============================================================
// Settings modal (vault info + logout)
// ============================================================
// আগে "সেটিংস" বাটনের কোনো click listener ছিল না (dead button), এবং
// পুরো অ্যাপে লগ আউট করার কোনো উপায়ই ছিল না — সেশন টোকেন localStorage-এ
// থেকে যেত, ইউজার চাইলেও বের হতে পারতেন না।

btnSettings.addEventListener("click", () => {
  closeOtherModals(settingsModalOverlay);
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
  // error log মোডালেও একই ফাঁক ছিল (পরে যোগ হওয়া ফিচার, একই প্যাটার্ন
  // মিস হয়ে গিয়েছিল) — এখন settings-এর মতোই Escape কাজ করে
  if (e.key === "Escape" && !errorLogOverlay.hidden) {
    errorLogOverlay.hidden = true;
  }
});

settingsLogout.addEventListener("click", () => {
  // isDirty চেক না থাকলে: এডিটরে টাইপ করে সাথে সাথেই এখানে এসে লগ আউট
  // চাপলে সেভ (300ms debounce, বা flushSave ইতিমধ্যে GitHub-এর দিকে
  // in-flight/queued থাকলে) সম্পূর্ণ না হতেই reload হয়ে সেই পরিবর্তন
  // চিরতরে হারিয়ে যেত — কোনো সতর্কতা ছাড়াই।
  //
  // নোট: offline outbox থাকায় ৩০০ms debounce পার হয়ে যাওয়া যেকোনো এডিট
  // এখন লগ আউটের পরও IndexedDB-তে (এই ব্রাউজারেই, session-নিরপেক্ষভাবে)
  // থেকে যায় এবং পরের বার লগইন করলেই স্বয়ংক্রিয়ভাবে সিঙ্ক হয়ে যাবে —
  // তাই বার্তাটা এখন আর "will lose them" না বলে বাস্তবসম্মতভাবে জানাচ্ছে।
  const msg = isDirty
    ? "Some recent changes haven't synced to GitHub yet — anything typed in the last few seconds could be lost if it hasn't saved yet. The rest is stored in this browser and will sync automatically next time you log in. Log out anyway?"
    : "Log out? You'll need your PIN to log back in.";
  if (!confirm(msg)) return;
  api.clearSession();
  window.location.reload();
});

settingsClearCache.addEventListener("click", async () => {
  // এটা শুধু লোকাল offline ক্যাশ (IndexedDB) মোছে — GitHub-এর কোনো
  // ডেটা মোছে না। sidebar/ফাইল কোনো কারণে পুরনো/অসামঞ্জস্যপূর্ণ মনে
  // হলে ট্রাবলশুটিং-এর জন্য এটা ব্যবহার করা যায়।
  //
  // নিরাপত্তা চেক: যদি অফলাইনে করা কোনো এডিট এখনো GitHub-এ সিঙ্ক না হয়ে
  // outbox-এ পেন্ডিং থাকে, ক্যাশ পরিষ্কার করার আগে সেটা স্পষ্টভাবে জানানো
  // হচ্ছে এবং থামিয়ে দেওয়া হচ্ছে — নাহলে সিঙ্ক-বাকি লেখা বিভ্রান্তিকরভাবে
  // হারিয়ে যেতে পারত (সেভ হয়েছে বলে মনে হলেও আসলে GitHub-এ পৌঁছায়নি)।
  const pending = await cache.getAllOutboxEntries();
  if (pending.length > 0) {
    alert(
      `${pending.length} change${pending.length > 1 ? "s" : ""} haven't synced to GitHub yet (waiting on an internet connection). ` +
      `Please connect to the internet and let the sync finish, then clear the cache.`
    );
    return;
  }
  if (!confirm("Clear the local cache? This won't delete any of your notes, it only resets the fast-loading copy.")) return;
  await cache.clearAll();
  window.location.reload();
});

// ============================================================
// Error log viewer — Settings > "View Error Log"
// ============================================================

function formatErrorTime(timestamp) {
  try {
    return new Date(timestamp).toLocaleString();
  } catch (err) {
    return "";
  }
}

async function renderErrorLog() {
  const errors = await cache.getAllErrors();
  if (errors.length === 0) {
    errorLogList.innerHTML = `<div class="error-log-empty">No errors logged — good news!</div>`;
    return;
  }
  errorLogList.innerHTML = errors
    .map((e) => {
      const stackBlock = e.stack
        ? `<details><summary>Stack trace</summary><div class="error-log-item-stack">${escapeHtml(e.stack)}</div></details>`
        : "";
      const sourceLine = e.source ? `<div class="error-log-item-source">${escapeHtml(e.source)}</div>` : "";
      return `<div class="error-log-item">
        <div class="error-log-item-time">${escapeHtml(formatErrorTime(e.timestamp))}</div>
        <div class="error-log-item-message">${escapeHtml(e.message)}</div>
        ${sourceLine}
        ${stackBlock}
      </div>`;
    })
    .join("");
}

settingsViewErrors.addEventListener("click", async () => {
  closeOtherModals(errorLogOverlay);
  errorLogOverlay.hidden = false;
  await renderErrorLog();
});

errorLogClear.addEventListener("click", async () => {
  if (!confirm("Clear the entire error log? This can't be undone.")) return;
  await cache.clearErrors();
  await renderErrorLog();
});

errorLogClose.addEventListener("click", () => {
  errorLogOverlay.hidden = true;
});

errorLogOverlay.addEventListener("click", (e) => {
  if (e.target === errorLogOverlay) errorLogOverlay.hidden = true;
});

// ============================================================
// ডিলিট কনফার্ম মোডাল — PIN দিয়ে
// ============================================================
// আগে ডিলিট শুধু এক ক্লিকের browser confirm() দিয়ে হতো — ভুল করে চাপ
// লেগে গেলেও ডিলিট হয়ে যেত। এখন ফাইল/ফোল্ডার ডিলিট করতে গেলে লগইন PIN
// দিতে হয়; PIN ভুল হলে ডিলিট হয় না। PIN যাচাই হয় /api/login এন্ডপয়েন্ট
// দিয়েই (আলাদা কোনো নতুন backend endpoint লাগেনি)।

let pendingDeleteAction = null;
let deleteVerifying = false;

function openDeleteConfirm({ message, onConfirm }) {
  closeOtherModals(deleteConfirmOverlay);
  deleteConfirmMessage.textContent = message;
  deleteConfirmError.hidden = true;
  deleteConfirmPin.value = "";
  pendingDeleteAction = onConfirm;
  deleteConfirmOverlay.hidden = false;
  setTimeout(() => deleteConfirmPin.focus(), 50);
}

function closeDeleteConfirm() {
  deleteConfirmOverlay.hidden = true;
  deleteConfirmPin.value = "";
  deleteConfirmError.hidden = true;
  pendingDeleteAction = null;
  deleteVerifying = false;
  deleteConfirmSubmit.disabled = false;
}

deleteConfirmCancel.addEventListener("click", closeDeleteConfirm);
deleteConfirmOverlay.addEventListener("click", (e) => {
  if (e.target === deleteConfirmOverlay) closeDeleteConfirm();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !deleteConfirmOverlay.hidden) closeDeleteConfirm();
});

// input-টা আসলে একটা <form>-এর ভেতরে (submit/Enter সমর্থনের জন্য) — কিন্তু
// এটা যেন পেজ রিলোড না করে, তাই submit event নিজে হ্যান্ডল করা হচ্ছে
deleteConfirmForm.addEventListener("submit", (e) => {
  e.preventDefault();
  submitDeleteConfirm();
});
deleteConfirmSubmit.addEventListener("click", submitDeleteConfirm);

async function submitDeleteConfirm() {
  if (deleteVerifying) return; // একই সাথে দুইবার সাবমিট ঠেকাতে
  const pin = deleteConfirmPin.value.trim();
  if (!pin) return;
  const action = pendingDeleteAction;
  if (!action) return;

  deleteVerifying = true;
  deleteConfirmSubmit.disabled = true;
  deleteConfirmError.hidden = true;
  try {
    // PIN সঠিক কিনা যাচাই করতে লগইন এন্ডপয়েন্টই ব্যবহার করা হচ্ছে — ভুল
    // হলে এটা এরর দেবে, এবং ডিলিট অ্যাকশন চালানো হবে না
    await api.login(pin);
  } catch (err) {
    // আগে এখানে যেকোনো এরর হলেই (নেট সমস্যা সহ) সবসময় "Wrong PIN"
    // দেখানো হতো — ফলে অফলাইনে ডিলিট করতে গেলে ইউজার ভাবতেন নিজের
    // PIN-ই ভুলে গেছেন, যদিও আসল কারণ ছিল সংযোগ। এখন api.login()
    // যা বলে (ভুল PIN / বারবার চেষ্টা / নেট সমস্যা) সেটাই দেখানো
    // হচ্ছে — মূল লগইন স্ক্রিনে যেভাবে দেখানো হয়, এটাও সেভাবেই।
    deleteConfirmError.textContent = err.message + " — nothing was deleted.";
    deleteConfirmError.hidden = false;
    deleteConfirmPin.value = "";
    deleteConfirmPin.focus();
    deleteVerifying = false;
    deleteConfirmSubmit.disabled = false;
    return;
  }

  closeDeleteConfirm();
  action();
}

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
// Quick switcher (Ctrl/Cmd+K) — Obsidian-এর quick switcher-এর মতো:
// টাইপ করে ফাইল খোঁজা, ↑↓ দিয়ে নেভিগেট, Enter দিয়ে খোলা
// ============================================================

let qsResults = [];
let qsActiveIndex = -1;

// treeData (nested tree) থেকে recursively সব ফাইল (folder বাদ) বের করে
// একটা flat array বানায় — quick switcher এই লিস্টের উপরেই filter করে।
function flattenTreeFiles(node) {
  const out = [];
  const walk = (n) => {
    for (const child of sortedEntries(n)) {
      if (child.type === "folder") {
        walk(child);
      } else {
        out.push(child);
      }
    }
  };
  if (node) walk(node);
  return out;
}

// খুব সাধারণ fuzzy match: query-র প্রতিটা অক্ষর টার্গেটে (path, ছোট হাতের)
// একই ক্রমে থাকলেই ম্যাচ ধরা হয় — Obsidian-এর quick switcher-এর মতোই
// আক্ষরিক ক্রমে-না-থাকা অক্ষর মেলানোর দরকার নেই, শুধু ক্রম ঠিক থাকলেই হয়।
// রিটার্ন করে matched অক্ষরের index-গুলো (bold করে দেখানোর জন্য) অথবা
// null যদি না মেলে।
function fuzzyMatch(query, target) {
  if (!query) return [];
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  const matchedIndices = [];
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      matchedIndices.push(ti);
      qi++;
    }
  }
  return qi === q.length ? matchedIndices : null;
}

// matched অক্ষরগুলো <span class="qs-match"> দিয়ে wrap করে HTML বানায়
function highlightMatch(text, matchedIndices) {
  if (!matchedIndices || matchedIndices.length === 0) return escapeHtml(text);
  let html = "";
  let lastIdx = 0;
  for (const idx of matchedIndices) {
    html += escapeHtml(text.slice(lastIdx, idx));
    html += `<span class="qs-match">${escapeHtml(text[idx])}</span>`;
    lastIdx = idx + 1;
  }
  html += escapeHtml(text.slice(lastIdx));
  return html;
}

function openQuickSwitcher() {
  if (!treeData) return; // ফাইল ট্রি এখনো লোড হয়নি
  // অন্য কোনো মোডাল আগে থেকে খোলা থাকলে তার উপর quick switcher স্ট্যাক
  // করা হবে না। আগে এখানে নির্দিষ্ট কয়েকটা মোডাল ভ্যারিয়েবল হাতে করে
  // লিস্ট করা ছিল (modalOverlay/settingsModalOverlay/deleteConfirmOverlay)
  // — কিন্তু পরে error-log-overlay যোগ হওয়ার সময় এই লিস্টটা আপডেট করা
  // হয়নি, ফলে Error Log মোডাল খোলা অবস্থায় Ctrl+K চাপলে আবার একই বাগ
  // (দুটো মোডাল স্ট্যাক) ফিরে এসেছিল। প্রতিটা মোডাল-ই একই `.modal-overlay`
  // ক্লাস শেয়ার করে, তাই এখন সেটা দিয়েই সরাসরি খুঁজে বের করা হচ্ছে — এর
  // পর নতুন কোনো মোডাল যোগ হলেও (এই ফাংশন না ছুঁয়েও) স্বয়ংক্রিয়ভাবে
  // এখানে ধরা পড়বে।
  const anyModalOpen = document.querySelector(".modal-overlay:not([hidden])");
  if (anyModalOpen) return;
  quickSwitcherOverlay.hidden = false;
  quickSwitcherInput.value = "";
  quickSwitcherInput.focus();
  renderQuickSwitcherResults("");
}

function closeQuickSwitcher() {
  quickSwitcherOverlay.hidden = true;
  qsResults = [];
  qsActiveIndex = -1;
}

function renderQuickSwitcherResults(query) {
  const allFiles = flattenTreeFiles(treeData);
  const q = query.trim();

  let matched;
  if (!q) {
    // কোনো query না থাকলে সাম্প্রতিক sort ছাড়াই প্রথম ২০টা ফাইল দেখানো হয়,
    // যাতে খালি অবস্থাতেও কিছু একটা দেখা যায়, পুরোপুরি ফাঁকা না লাগে
    matched = allFiles.slice(0, 20).map((f) => ({ file: f, indices: null }));
  } else {
    matched = allFiles
      .map((f) => ({ file: f, indices: fuzzyMatch(q, f.path) }))
      .filter((m) => m.indices !== null)
      // যত কম matched span (মানে যত "টাইট" মিল), তত উপরে — সাধারণ
      // fuzzy-finder heuristic, Obsidian-এও কাছাকাছি সাজানো হয়
      .sort((a, b) => {
        const spanA = a.indices[a.indices.length - 1] - a.indices[0];
        const spanB = b.indices[b.indices.length - 1] - b.indices[0];
        return spanA - spanB;
      })
      .slice(0, 30);
  }

  qsResults = matched;
  qsActiveIndex = matched.length > 0 ? 0 : -1;
  renderQuickSwitcherList();
}

function renderQuickSwitcherList() {
  if (qsResults.length === 0) {
    quickSwitcherResults.innerHTML = `<div class="qs-empty">No files found</div>`;
    return;
  }
  quickSwitcherResults.innerHTML = qsResults
    .map((m, i) => {
      const name = fileNameWithoutExt(m.file.name);
      return `<div class="qs-item${i === qsActiveIndex ? " active" : ""}" data-index="${i}">
        <span class="qs-item-name">${escapeHtml(name)}</span>
        <span class="qs-item-path">${highlightMatch(m.file.path, m.indices)}</span>
      </div>`;
    })
    .join("");
  // ফলাফলের লিস্টের height সীমিত (scrollable) — নোট বেশি থাকলে ↑↓ দিয়ে
  // সিলেক্টেড আইটেম দৃশ্যপটের বাইরে চলে যেতে পারত (লিস্ট নিজে থেকে স্ক্রল
  // হতো না)। "nearest" ব্যবহার করা হচ্ছে যাতে প্রতিবার কেন্দ্রে না নিয়ে
  // গিয়ে শুধু প্রয়োজনমতোই স্ক্রল করে, বেশি ঝাঁকুনি না লাগে।
  quickSwitcherResults.querySelector(".qs-item.active")?.scrollIntoView({ block: "nearest" });
}

function selectQuickSwitcherResult(index) {
  const match = qsResults[index];
  if (!match) return;
  closeQuickSwitcher();
  openFile(match.file);
}

quickSwitcherInput.addEventListener("input", () => {
  renderQuickSwitcherResults(quickSwitcherInput.value);
});

quickSwitcherResults.addEventListener("click", (e) => {
  const item = e.target.closest(".qs-item");
  if (!item) return;
  selectQuickSwitcherResult(Number(item.dataset.index));
});

quickSwitcherInput.addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown") {
    e.preventDefault();
    if (qsResults.length === 0) return;
    qsActiveIndex = (qsActiveIndex + 1) % qsResults.length;
    renderQuickSwitcherList();
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    if (qsResults.length === 0) return;
    qsActiveIndex = (qsActiveIndex - 1 + qsResults.length) % qsResults.length;
    renderQuickSwitcherList();
  } else if (e.key === "Enter") {
    e.preventDefault();
    selectQuickSwitcherResult(qsActiveIndex);
  } else if (e.key === "Escape") {
    e.preventDefault();
    closeQuickSwitcher();
  }
});

quickSwitcherOverlay.addEventListener("click", (e) => {
  if (e.target === quickSwitcherOverlay) closeQuickSwitcher();
});

btnQuickSwitcher.addEventListener("click", openQuickSwitcher);

// গ্লোবাল শর্টকাট: Ctrl+K (Windows/Linux) বা Cmd+K (Mac) — Obsidian-এর
// quick switcher শর্টকাট থেকে অনুপ্রাণিত (Obsidian ডিফল্ট Ctrl/Cmd+O
// ব্যবহার করে, কিন্তু Ctrl+K এখন অনেক অ্যাপে (VS Code, Linear, Notion)
// "কমান্ড/সার্চ" হিসেবে বহুল পরিচিত, তাই সেটাই বেছে নেওয়া হলো)।
// ব্রাউজারের ডিফল্ট Ctrl+K (address bar-এ সার্চ ফোকাস) override করতে
// preventDefault লাগবে।
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    // openQuickSwitcher()-এর ভেতরেই অন্য মোডাল খোলা থাকলে no-op করে —
    // তাই এখানে আলাদা করে চেক করার দরকার নেই, নিরাপদেই কিছু হবে না।
    if (quickSwitcherOverlay.hidden) {
      openQuickSwitcher();
    } else {
      closeQuickSwitcher();
    }
  }
});

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
