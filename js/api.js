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
  // vault (নোট/ডেটা) সবসময় আলাদা রিপোতে থাকে — অ্যাপের কোড আর ডেটা কখনো মিশবে না
  return { owner: "openjobsolutionbd", repo: "mydian-vault", branch: "main" };
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
    throw new Error("Your session has expired — please log in again");
  }

  return res;
}

export async function login(pin) {
  let res;
  try {
    res = await fetch(`${WORKER_URL}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    });
  } catch (networkErr) {
    // fetch() নিজেই throw করে তখনই যখন request-টা সার্ভার পর্যন্ত
    // পৌঁছায়ইনি (অফলাইন/নেট সমস্যা) — এটাকে ভুল PIN-এর সাথে গুলিয়ে
    // ফেলা যাবে না, কারণ এখানে সার্ভার PIN যাচাই করারই সুযোগ পায়নি।
    // আগে দুটোই একই "Wrong PIN" বার্তা হিসেবে দেখানো হতো (দেখুন
    // submitDeleteConfirm-এর পুরনো কোড, app.js), যেটা অফলাইনে থাকা
    // ইউজারকে বিভ্রান্ত করত।
    throw new Error("No network connection — check your connection and try again", { cause: networkErr });
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    // 401 (ভুল PIN) আর 429 (বারবার ভুল চেষ্টা — নতুন rate-limit) দুটোই
    // এখানে সার্ভারের আসল বার্তা নিয়ে আসে, আলাদা করে দেখানো হয় caller-এ।
    throw new Error(err.error || "Login failed");
  }
  const data = await res.json();
  setSession(data.token);
  return data.token;
}

// ---------- GitHub REST API helpers (Worker প্রক্সির মাধ্যমে) ----------

function repoBase() {
  const cfg = getConfig();
  if (!cfg || !cfg.owner || !cfg.repo) {
    throw new Error("No GitHub repo has been configured");
  }
  return `/api/github/repos/${cfg.owner}/${cfg.repo}`;
}

// পুরো repo tree একবারে আনে (recursive) — file tree বানানোর জন্য
export async function fetchTree() {
  const cfg = getConfig();
  const branch = cfg.branch || "main";
  const res = await request(`${repoBase()}/git/trees/${branch}?recursive=1`);
  if (!res.ok) {
    if (res.status === 404) {
      // খালি repo/branch — GitHub-এর git/trees API খালি repo-তে 404 দেয়,
      // মেসেজে সাধারণত "Git Repository is empty." থাকে। এটাই একমাত্র
      // status যেটা নিরাপদে "কোনো ফাইল নেই" হিসেবে ধরা যায়।
      return [];
    }
    // ৪০৯ (Conflict) সহ অন্য যেকোনো status কে "খালি" ধরে নেওয়া হচ্ছে না —
    // আগে 409-কেও empty ধরা হতো, যেটা genuine error-কে "কোনো ফাইল নেই"
    // হিসেবে দেখাতে পারত। এটা বিপজ্জনক: ইউজার ভাবতে পারতেন তার সব নোট
    // হারিয়ে গেছে, যেখানে আসলে শুধু একটা network/API সমস্যা হয়েছিল।
    throw new Error(`Could not fetch the file list (HTTP ${res.status})`);
  }
  const data = await res.json();
  if (data.truncated) {
    console.warn("GitHub tree response truncated — not all files may show in the sidebar (repo has too many files).");
  }
  return (data.tree || []).filter((item) => item.type === "blob");
}

// একটা ফাইলের content আনে (text)
export async function fetchFile(path) {
  const res = await request(`${repoBase()}/contents/${encodeURIPath(path)}`);
  if (!res.ok) throw new Error("Could not read file");
  const data = await res.json();
  // fetchFileRaw()-এর মতোই একই কারণ — GitHub-এর Contents API বড় ফাইলের
  // জন্য `content` ফিল্ড খালি রাখে, আগে সরাসরি decode করতে গিয়ে cryptic
  // এরর ছুঁড়ত।
  if (!data.content) {
    throw new Error("This file is too large to open (GitHub's size limit for this view)");
  }
  const content = decodeBase64Utf8(data.content);
  return { content, sha: data.sha };
}

// একটা ফাইলের raw binary/base64 content আনে (ছবি/PDF দেখানোর জন্য)
export async function fetchFileRaw(path) {
  const res = await request(`${repoBase()}/contents/${encodeURIPath(path)}`);
  if (!res.ok) throw new Error("Could not read file");
  const data = await res.json();
  // GitHub-এর Contents API বড় ফাইলের জন্য (~1MB-এর বেশি) `content` ফিল্ড
  // খালি/অনুপস্থিত রাখে (base64-in-JSON রেসপন্সে সরাসরি বসানো সম্ভব না) —
  // আগে এখানে সরাসরি `data.content.replace(...)` কল করা হতো, যেটা এমন
  // হলে "Cannot read properties of undefined" এর মতো একটা cryptic
  // JavaScript এরর ছুঁড়ত, ইউজারকে বিভ্রান্ত করে (একটা বড় ছবি/PDF খোলার
  // সময় ঘটতে পারত)। এখন স্পষ্ট, বোধগম্য বার্তা দেওয়া হচ্ছে।
  if (!data.content) {
    throw new Error("This file is too large to open (GitHub's size limit for this view)");
  }
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
    if (res.status === 409) {
      // ফাইলটা এই মুহূর্তে GitHub-এ যেই sha-তে আছে, সেটা আমাদের কাছে থাকা
      // sha-র সাথে মেলেনি — মানে অন্য কোনো ডিভাইস/ট্যাব থেকে ফাইলটা এর
      // মধ্যে বদলে গেছে। raw GitHub error মেসেজ (ইংরেজি, cryptic) না
      // দেখিয়ে স্পষ্ট নির্দেশনা দেওয়া হচ্ছে।
      throw new Error(
        "This file has already been changed elsewhere. Please refresh and " +
        "try again — otherwise this change of yours will not be saved."
      );
    }
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || "Could not save");
  }
  return res.json();
}

export async function deleteFile(path, sha, message) {
  const res = await request(`${repoBase()}/contents/${encodeURIPath(path)}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, sha }),
  });
  if (!res.ok) throw new Error("Could not delete");
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
