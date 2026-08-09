/**
 * Cloudflare Worker — GitHub API Proxy
 * ------------------------------------
 * এই Worker টা browser আর GitHub API-র মাঝখানে বসে থাকে।
 * GitHub Personal Access Token কখনো browser-এ যায় না — শুধু এখানে
 * (Cloudflare Worker secret হিসেবে) থাকে।
 *
 * Browser প্রথমে একটা PIN/password দিয়ে login করে, সেটা যাচাই হলে
 * একটা session token (JWT-এর মত সহজ signed token) দেয়া হয়।
 * এরপর প্রতিটা GitHub API কল এই session token দিয়ে authenticate হয়,
 * Worker সেটা GitHub token দিয়ে replace করে GitHub-এ পাঠায়।
 *
 * প্রয়োজনীয় Secrets (wrangler secret put দিয়ে সেট করতে হবে):
 *  - GITHUB_TOKEN   : আপনার GitHub Personal Access Token (repo scope)
 *  - APP_PIN        : অ্যাপ আনলক করার PIN/password (আপনি ঠিক করবেন)
 *  - SESSION_SECRET : session token সাইন করার জন্য যেকোনো লম্বা random string
 */

const GITHUB_API = "https://api.github.com";

// ---------- ছোট্ট helper: session token বানানো ও যাচাই করা ----------
// (external লাইব্রেরি ছাড়া, শুধু HMAC দিয়ে সহজ signed token)

async function hmacSign(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function createSessionToken(secret) {
  // 30 দিনের জন্য valid — চাইলে সময় কমানো/বাড়ানো যায়
  const expiry = Date.now() + 30 * 24 * 60 * 60 * 1000;
  const payload = `${expiry}`;
  const sig = await hmacSign(secret, payload);
  return `${payload}.${sig}`;
}

async function verifySessionToken(secret, token) {
  if (!token) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  const expected = await hmacSign(secret, payload);
  if (expected !== sig) return false;
  const expiry = Number(payload);
  if (Number.isNaN(expiry) || Date.now() > expiry) return false;
  return true;
}

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}

// GitHub প্রক্সি কোন কোন owner/repo-তে request পাস করতে পারবে তার allowlist।
// env.ALLOWED_REPOS সেট থাকলে সেটা ব্যবহার হয় (কমা দিয়ে আলাদা করা
// "owner/repo" এন্ট্রি, যেমন "openjobsolutionbd/mydian,openjobsolutionbd/mydian-vault")।
// না থাকলে এই দুটো known repo-ই ডিফল্ট হিসেবে allow করা হয়, যাতে বাড়তি
// কোনো secret সেট না করেও এই ফিক্স কাজ করে।
const DEFAULT_ALLOWED_REPOS = [
  "openjobsolutionbd/mydian",
  "openjobsolutionbd/mydian-vault",
];

function isAllowedRepo(owner, repo, env) {
  const list = (env.ALLOWED_REPOS
    ? env.ALLOWED_REPOS.split(",").map((s) => s.trim())
    : DEFAULT_ALLOWED_REPOS
  ).map((s) => s.toLowerCase());
  return list.includes(`${owner}/${repo}`.toLowerCase());
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");
    const cors = corsHeaders(origin);

    // Preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    // ---------- লগইন এন্ডপয়েন্ট (PIN যাচাই) ----------
    if (url.pathname === "/api/login" && request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      if (body.pin !== env.APP_PIN) {
        return json({ error: "Incorrect PIN" }, 401, cors);
      }
      const token = await createSessionToken(env.SESSION_SECRET);
      return json({ token }, 200, cors);
    }

    // ---------- বাকি সব রুটে session token যাচাই বাধ্যতামূলক ----------
    const authHeader = request.headers.get("Authorization") || "";
    const sessionToken = authHeader.replace("Bearer ", "");
    const valid = await verifySessionToken(env.SESSION_SECRET, sessionToken);
    if (!valid) {
      return json({ error: "Unauthorized — please log in again" }, 401, cors);
    }

    // ---------- GitHub API প্রক্সি ----------
    // Browser পাঠাবে: /api/github/<GitHub API path>
    // এটা GitHub token জুড়ে দিয়ে সরাসরি GitHub-এ পাঠিয়ে দেবে
    if (url.pathname.startsWith("/api/github/")) {
      const githubPath = url.pathname.replace("/api/github", "");

      // নিরাপত্তা: GITHUB_TOKEN-এর যে repo-গুলোতে access আছে (mydian কোড
      // repo + mydian-vault ডেটা repo), তার যেকোনো একটাতে এই proxy দিয়ে
      // পড়া/লেখা সম্ভব ছিল — session token একবার পেলেই যথেষ্ট, ইউজারের
      // নিজের vault-এর বাইরেও (এমনকি অ্যাপের নিজের কোড repo-তেও) request
      // পাঠানো যেত, কারণ কোনো repo allowlist ছিল না। এখন শুধু
      // ALLOWED_REPOS-এ থাকা owner/repo-র জন্যই request পাস করা হবে।
      const repoMatch = githubPath.match(/^\/repos\/([^/]+)\/([^/]+)\//);
      if (!repoMatch || !isAllowedRepo(repoMatch[1], repoMatch[2], env)) {
        return json({ error: "Proxying to this repo is not allowed" }, 403, cors);
      }

      const githubUrl = `${GITHUB_API}${githubPath}${url.search}`;

      const init = {
        method: request.method,
        headers: {
          Authorization: `Bearer ${env.GITHUB_TOKEN}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "personal-notes-app",
        },
      };

      if (request.method !== "GET" && request.method !== "HEAD") {
        init.headers["Content-Type"] = "application/json";
        init.body = await request.text();
      }

      const ghRes = await fetch(githubUrl, init);
      const ghBody = await ghRes.text();

      return new Response(ghBody, {
        status: ghRes.status,
        headers: { "Content-Type": "application/json", ...cors },
      });
    }

    return json({ error: "Not found" }, 404, cors);
  },
};
