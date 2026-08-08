// api.js — Worker-এর মাধ্যমে GitHub API-র সাথে কথা বলে।
// Worker-এর URL নিচে বসাতে হবে (deploy করার পর wrangler যেটা দেবে)।

const WORKER_URL = "https://notes-app-worker.openjobsolutionbd.workers.dev";

const SESSION_KEY = "mydian_session";
const CONFIG_KEY = "mydian_config"; // { owner, repo, branch }

export function getSession() {
  return localStorage.getItem(SESSION_KEY);
}

export function setSession(token) {
  localStorage.setItem(SESSION_KEY, token);
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

export function getConfig() {
  const raw = localStorage.getItem(CONFIG_KEY);
  if (raw) return JSON.parse(raw);
  // ডিফল্ট repo — এটাই সবসময় ব্যবহার হবে, popup/console লাগবে না
  return { owner: "openjobsolutionbd", repo: "mydian", branch: "main" };
}

export function setConfig(cfg) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
}

async function request(path, options = {}) {
  const token = getSession();
  const res = await fetch(`${WORKER_URL}${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: token ? `Bearer ${token}` : "",
    },
  });

  if (res.status === 401) {
    clearSession();
    window.location.reload();
    throw new Error("Session শেষ হয়ে গেছে — আবার লগইন করুন");
  }

  return res;
}

export async function login(pin) {
  const res = await fetch(`${WORKER_URL}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "লগইন ব্যর্থ হয়েছে");
  }
  const data = await res.json();
  setSession(data.token);
  return data.token;
}

// ---------- GitHub REST API helpers (Worker প্রক্সির মাধ্যমে) ----------

function repoBase() {
  const cfg = getConfig();
  if (!cfg || !cfg.owner || !cfg.repo) {
    throw new Error("GitHub repo সেট করা হয়নি");
  }
  return `/api/github/repos/${cfg.owner}/${cfg.repo}`;
}

// পুরো repo tree একবারে আনে (recursive) — file tree বানানোর জন্য
export async function fetchTree() {
  const cfg = getConfig();
  const branch = cfg.branch || "main";
  const res = await request(`${repoBase()}/git/trees/${branch}?recursive=1`);
  if (!res.ok) {
    if (res.status === 409 || res.status === 404) {
      // খালি repo বা branch নেই
      return [];
    }
    throw new Error("ফাইল তালিকা আনা যায়নি");
  }
  const data = await res.json();
  return (data.tree || []).filter((item) => item.type === "blob");
}

// একটা ফাইলের content আনে (text)
export async function fetchFile(path) {
  const res = await request(`${repoBase()}/contents/${encodeURIPath(path)}`);
  if (!res.ok) throw new Error("ফাইল পড়া যায়নি");
  const data = await res.json();
  const content = decodeBase64Utf8(data.content);
  return { content, sha: data.sha };
}

// একটা ফাইলের raw binary/base64 content আনে (ছবি/PDF দেখানোর জন্য)
export async function fetchFileRaw(path) {
  const res = await request(`${repoBase()}/contents/${encodeURIPath(path)}`);
  if (!res.ok) throw new Error("ফাইল পড়া যায়নি");
  const data = await res.json();
  return { base64: data.content.replace(/\n/g, ""), sha: data.sha };
}

// ফাইল তৈরি বা আপডেট (create/update — GitHub API একই endpoint ব্যবহার করে)
export async function putFile(path, contentBase64, message, sha = null) {
  const body = { message, content: contentBase64 };
  if (sha) body.sha = sha;
  const res = await request(`${repoBase()}/contents/${encodeURIPath(path)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || "সেভ করা যায়নি");
  }
  return res.json();
}

export async function deleteFile(path, sha, message) {
  const res = await request(`${repoBase()}/contents/${encodeURIPath(path)}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, sha }),
  });
  if (!res.ok) throw new Error("ডিলিট করা যায়নি");
  return res.json();
}

// ---------- ছোট utility ----------

function encodeURIPath(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}

export function encodeBase64Utf8(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

export function decodeBase64Utf8(base64) {
  const binary = atob(base64.replace(/\n/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder("utf-8").decode(bytes);
}
