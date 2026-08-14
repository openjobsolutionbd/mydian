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

// কোন origin (browser-এ চলা ওয়েবসাইট) থেকে এই worker-এ request করা যাবে
// তার allowlist। env.ALLOWED_ORIGINS সেট থাকলে সেটা ব্যবহার হয় (কমা দিয়ে
// আলাদা করা, যেমন "https://mydian-tei.pages.dev,https://example.com")।
// না থাকলে অ্যাপের known লাইভ URL-ই ডিফল্ট।
//
// আগে corsHeaders() request-এ যেই Origin header আসত সেটাই হুবহু ফেরত
// দিত (Access-Control-Allow-Origin: <যা আসছে তাই>) — মানে টেকনিক্যালি
// অন্য যেকোনো ওয়েবসাইট থেকে browser দিয়ে এই worker-এ fetch() করা সম্ভব
// ছিল, ব্রাউজার সেই response পড়তেও দিত। session token কুকি না হওয়ায়
// এটা সরাসরি বিপজ্জনক ছিল না (অন্য সাইট token পড়তে পারত না), কিন্তু
// defense-in-depth হিসেবে এখন শুধু allowlist-এ থাকা origin-ই allow করা
// হচ্ছে — allowlist-এ না থাকলে Access-Control-Allow-Origin header-ই বসানো
// হয় না, ফলে ব্রাউজার response ব্লক করে দেয়।
const DEFAULT_ALLOWED_ORIGINS = ["https://mydian-tei.pages.dev"];

function isAllowedOrigin(origin, env) {
  if (!origin) return false;
  const list = env.ALLOWED_ORIGINS
    ? env.ALLOWED_ORIGINS.split(",").map((s) => s.trim())
    : DEFAULT_ALLOWED_ORIGINS;
  return list.includes(origin);
}

function corsHeaders(origin, env) {
  const headers = {
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
  if (isAllowedOrigin(origin, env)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
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
    const cors = corsHeaders(origin, env);

    // Preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    // ---------- লগইন এন্ডপয়েন্ট (PIN যাচাই) ----------
    if (url.pathname === "/api/login" && request.method === "POST") {
      // নিরাপত্তা: আগে PIN ভুল হলে সাথে সাথেই "Incorrect PIN" ফেরত
      // দেওয়া হতো, কোনো বাধা ছাড়াই — মানে যে কেউ script দিয়ে হাজার হাজার
      // PIN সেকেন্ডে সেকেন্ডে try করে ভেঙে ফেলতে পারত (PIN ছোট/সংখ্যার
      // হলে এটা বিশেষভাবে ঝুঁকিপূর্ণ)। এখন দুই স্তরের সুরক্ষা:
      //   ১) প্রতিটা ভুল চেষ্টায় সামান্য delay (RATE_LIMIT_KV বাঁধা না
      //      থাকলেও এটা কাজ করে) — সেকেন্ডে হাজারো try করা অসম্ভব করে।
      //   ২) KV থাকলে: একই IP থেকে ১৫ মিনিটে ৫ বারের বেশি ভুল হলে লকআউট,
      //      সঠিক PIN দিলেও ততক্ষণ ঢুকতে দেওয়া হবে না।
      // KV binding (RATE_LIMIT_KV) সেট করা না থাকলে শুধু ১ নং সুরক্ষা
      // কাজ করবে, ক্র্যাশ করবে না — কিন্তু SETUP.md অনুযায়ী KV বেঁধে
      // দিলে সম্পূর্ণ সুরক্ষা পাওয়া যাবে।
      const ip = request.headers.get("CF-Connecting-IP") || "unknown";
      const rateLimitKey = `login_fail:${ip}`;
      const MAX_ATTEMPTS = 5;
      const WINDOW_SECONDS = 15 * 60; // ১৫ মিনিট

      if (env.RATE_LIMIT_KV) {
        const current = parseInt((await env.RATE_LIMIT_KV.get(rateLimitKey)) || "0", 10);
        if (current >= MAX_ATTEMPTS) {
          return json(
            { error: `Too many attempts. Try again in a few minutes.` },
            429,
            cors
          );
        }
      }

      const body = await request.json().catch(() => ({}));
      if (body.pin !== env.APP_PIN) {
        // ভুল PIN — ছোট delay (brute force ধীর করার জন্য, KV ছাড়াও কাজ করে)
        await new Promise((resolve) => setTimeout(resolve, 800));
        if (env.RATE_LIMIT_KV) {
          const current = parseInt((await env.RATE_LIMIT_KV.get(rateLimitKey)) || "0", 10);
          await env.RATE_LIMIT_KV.put(rateLimitKey, String(current + 1), {
            expirationTtl: WINDOW_SECONDS,
          });
        }
        return json({ error: "Incorrect PIN" }, 401, cors);
      }

      // PIN সঠিক — এই IP-এর জন্য ভুল-চেষ্টার হিসাব মুছে ফেলা হলো
      if (env.RATE_LIMIT_KV) {
        await env.RATE_LIMIT_KV.delete(rateLimitKey);
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

      // নিরাপত্তা (স্তর ১ — কোন repo): GITHUB_TOKEN-এর যে repo-গুলোতে
      // access আছে (mydian কোড repo + mydian-vault ডেটা repo), তার
      // যেকোনো একটাতে এই proxy দিয়ে পড়া/লেখা সম্ভব ছিল — session token
      // একবার পেলেই যথেষ্ট, ইউজারের নিজের vault-এর বাইরেও (এমনকি
      // অ্যাপের নিজের কোড repo-তেও) request পাঠানো যেত, কারণ কোনো repo
      // allowlist ছিল না। এখন শুধু ALLOWED_REPOS-এ থাকা owner/repo-র
      // জন্যই request পাস করা হবে।
      const repoMatch = githubPath.match(/^\/repos\/([^/]+)\/([^/]+)(\/.*)?$/);
      if (!repoMatch || !isAllowedRepo(repoMatch[1], repoMatch[2], env)) {
        return json({ error: "Proxying to this repo is not allowed" }, 403, cors);
      }

      // নিরাপত্তা (স্তর ২ — কোন operation): repo সঠিক হলেই যথেষ্ট ছিল না —
      // এতদিন `/repos/{owner}/{repo}/` দিয়ে শুরু হওয়া ANY GitHub API
      // path (webhook বদলানো, collaborator যোগ করা, repo settings, এমনকি
      // trailing slash দিলে repo delete করার endpoint পর্যন্ত) পাস হয়ে
      // যেত — কারণ path-টা যাচাই না করেই সরাসরি full-access GITHUB_TOKEN
      // দিয়ে GitHub-এ ফরওয়ার্ড করা হতো। অ্যাপ বাস্তবে শুধু দুই ধরনের
      // request পাঠায় (js/api.js দ্রষ্টব্য): ফাইল ট্রি পড়া
      // (`GET .../git/trees/{branch}`) আর ফাইল পড়া/লেখা/ডিলিট করা
      // (`.../contents/{path}`)। এখন এই দুইটা ছাড়া আর কিছু পাস হবে না —
      // session token কোনোভাবে বাইরে গেলেও, সেটা দিয়ে GitHub-এর অন্য কোনো
      // ক্ষমতাশালী API (repo delete, webhook, ইত্যাদি) ছোঁয়া যাবে না।
      const rest = repoMatch[3] || "";
      const isTreesRead = request.method === "GET" && /^\/git\/trees\/[^/]+$/.test(rest);
      const isContentsOp =
        (request.method === "GET" || request.method === "PUT" || request.method === "DELETE") &&
        /^\/contents\/.+$/.test(rest);
      if (!isTreesRead && !isContentsOp) {
        return json({ error: "This GitHub API operation is not allowed through this proxy" }, 403, cors);
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
