# Mydian — প্রজেক্ট নোট (AI/ডেভেলপার কনটেক্সট ডকুমেন্ট)

> এই ফাইলটা কোনো ইউজার-ফেসিং ডকুমেন্টেশন না (সেটা `SETUP.md`)। **সংক্ষিপ্ত
> রাখা হয়** যাতে প্রতিবার কাজ শুরুতে কম পড়তে হয় — পুরনো bug-এর বিস্তারিত
> ইতিহাস ও প্রথম আলোচনার প্রেক্ষাপট এখন `HISTORY.md`-এ। এই ফাইলে শুধু
> **এখনকার** আর্কিটেকচার, নিয়ম, আর সাম্প্রতিক অবস্থা থাকে।

---

## ০. সর্বশেষ অবস্থা

**সর্বশেষ commit (২০২৬-০৮-০৯/১০):** পুরো অ্যাপের UI টেক্সট বাংলা থেকে ইংলিশে
অনুবাদ করা হয়েছে (ইউজারের স্পষ্ট নির্দেশে) — `index.html`, `app.js`,
`js/api.js`, `js/cache.js`, `worker/worker.js`-এর সব বাটন লেবেল, প্লেসহোল্ডার,
alert/confirm মেসেজ, error মেসেজ, `manifest.json`-এর নাম/বিবরণ। আইকনে
"মি"-এর বদলে এখন "M" (Inter Bold ফন্ট দিয়ে, আগের মতোই full-bleed/maskable-safe
ডিজাইন)। **কোড কমেন্ট বাংলাতেই রাখা হয়েছে** (ডেভেলপার-অনলি, ইউজার দেখেন না) —
শুধু UI-তে দেখা যায় এমন টেক্সট বদলানো হয়েছে।

> ⚠️ **`worker/worker.js`-এর ৩টা error মেসেজও ইংলিশ করা হয়েছে** ("ভুল PIN"
> → "Incorrect PIN" ইত্যাদি) — এটাও Worker-এর কোড, তাই লাইভ করতে
> `wrangler deploy` লাগবে (GitHub push যথেষ্ট না)। ইউজারকে এটা মনে করিয়ে
> দিতে হবে যদি এখনো deploy না হয়ে থাকে।

**তার আগের commit:** `js/editor.js` minify + `BUILD_ID` স্বয়ংক্রিয় করা।
Hind Siliguri (বাংলা ফন্ট) সম্পূর্ণ সরানো হয়েছিল — **এই অ্যাপে কোনো বাংলা
ফন্ট লাগবে না**, ইউজার স্পষ্ট করে বলেছেন। এখন UI টেক্সটও ইংলিশ হয়ে যাওয়ায়
এই নিয়মটা আরও গুরুত্বপূর্ণ: **নতুন কোনো ফিচার/UI-তে বাংলা টেক্সট বা ফন্ট
যোগ করা যাবে না যদি না ইউজার আবার স্পষ্টভাবে চান।** কোড কমেন্ট ব্যতিক্রম —
সেগুলো বাংলায় লেখা চলতে থাকবে (এটাই এই প্রজেক্টের ডকুমেন্টেশন ভাষা)।

**এখনো ফিক্স করা হয়নি (নোট করা আছে, কম গুরুত্বপূর্ণ):**
- নেট চলে গেলে sync-dot সাথে সাথে আপডেট হয় না, পরের `loadFileTree()`
  কলে হয়।
- Save ব্যর্থ হলে (network error) automatic retry হয় না নেট ফিরলেও —
  তবে `isDirty` ঠিক থাকে বলে ডেটা হারানোর ঝুঁকি নেই।
- iOS-এর `apple-mobile-web-app-capable` মেটা ট্যাগ নেই।
- `corsHeaders()`-এ `Origin` না থাকলে `*` fallback (worker.js)।

*প্রতিটা কাজের পর এই সেকশনটা আপডেট রাখা জরুরি — পুরনো এন্ট্রি জমে গেলে
`HISTORY.md`-এ সরিয়ে দিতে হবে।*

---

## ১. প্রজেক্ট কী

Mydian একটা ব্যক্তিগত, স্ব-হোস্টেড markdown নোট অ্যাপ — অনেকটা Obsidian-এর
মতো ধারণা, কিন্তু ব্রাউজার-ভিত্তিক এবং GitHub-কে storage backend হিসেবে
ব্যবহার করে।

**স্ট্যাক:**
- **Frontend:** Vanilla JS (কোনো framework/build step নেই), ES modules সরাসরি
  ব্রাউজারে লোড হয়। PWA হিসেবে ইনস্টলযোগ্য (`manifest.json` + `sw.js`)।
- **হোস্টিং:** Cloudflare Pages, রিপো থেকে সরাসরি deploy (GitHub push হলেই
  auto-deploy হয়)। লাইভ URL: `mydian-tei.pages.dev`
- **Backend/proxy:** একটা ছোট Cloudflare Worker (`worker/worker.js`), যেটা
  browser আর GitHub API-র মাঝে বসে — GitHub token কখনো browser-এ প্রকাশ হয়
  না। Worker-এর URL: `https://notes-app-worker.openjobsolutionbd.workers.dev`
- **Auth:** সাধারণ PIN-ভিত্তিক লগইন। Worker-এ `APP_PIN` আর `SESSION_SECRET`
  secret হিসেবে সেট করা থাকে (`wrangler secret put`)।
- **Editor:** CodeMirror 6, Notion/Obsidian-স্টাইল live-preview markdown
  editing (cursor-এর লাইনে syntax marker দেখা যায়, অন্য লাইনে হালকা/লুকানো)।
- **ডেটা স্টোরেজ:** GitHub repo, প্রতিটা নোট একটা `.md` ফাইল, GitHub REST
  API (`contents`, `git/trees`) দিয়ে read/write হয়।

---

## ২. গুরুত্বপূর্ণ আর্কিটেকচারাল সিদ্ধান্ত: কোড আর ডেটা আলাদা রিপোতে

**এটা এই প্রজেক্টের সবচেয়ে গুরুত্বপূর্ণ নিয়ম — কখনো ভাঙা যাবে না:**

- **`openjobsolutionbd/mydian`** — শুধু অ্যাপের কোড (এই রিপো)। Cloudflare
  Pages এখান থেকেই deploy হয়।
- **`openjobsolutionbd/mydian-vault`** — শুধু ইউজারের নোট/ডেটা। এখানে কোনো
  অ্যাপ কোড থাকবে না। `js/api.js`-এর `getConfig()` ফাংশন এই রিপোকে
  hardcode করে পয়েন্ট করে (owner/repo/branch)।

শুরুতে দুটোই একই রিপোতে ছিল (`mydian`), ফলে sidebar-এ নোটের পাশাপাশি
`app.js`, `style.css` ইত্যাদি অ্যাপ কোডও দেখাত — এটা ইউজারের কাছে ভীষণ
বিভ্রান্তিকর এবং অগ্রহণযোগ্য ছিল (দেখতে হয়েছিল ঠিক Obsidian-এর মতো, যেখানে
vault শুধু ডেটার জন্য, কোনো কোড না)। তাই vault আলাদা করা হয়েছে।

**যদি ভবিষ্যতে কোনো নতুন ফিচার এমন কিছু করে যেটা repo config সরিয়ে
ইউজারকে বেছে নিতে দেয়** — তাহলেও এই আলাদা-রিপো নীতিটা বজায় রাখা উচিত,
ডিফল্ট আচরণ হিসেবে অন্তত।

### GitHub token permission নোট
Worker-এর `GITHUB_TOKEN` (fine-grained personal access token) কে
**দুটো রিপোতেই** (`mydian` এবং `mydian-vault`) `Contents: Read and write`
অ্যাক্সেস দেওয়া থাকতে হবে। GitHub token settings থেকে token খুলে
"Repository access" সেকশনে গিয়ে repo যোগ করা যায় —
`https://github.com/settings/tokens?type=beta`

---

## ৩. গুরুত্বপূর্ণ নিয়ম ও সীমাবদ্ধতা (পুরো ইতিহাস `HISTORY.md`-এ)

- **`BUILD_ID` স্বয়ংক্রিয়:** আগে হাতে বদলাতে হতো, এখন
  `scripts/bump-build-id.sh` চালালেই বর্তমান তারিখ+সময় দিয়ে `sw.js`-এর
  `BUILD_ID` আপডেট হয়ে যায় (না বদলালে নতুন deploy পুরনো ভার্সন সার্ভ করতে
  থাকে)। **নিয়ম: প্রতিবার push করার আগে Claude এই স্ক্রিপ্টটা রুটিন
  হিসেবে চালাবে**, তারপর commit-এ `sw.js`-এর পরিবর্তনও যোগ হবে।
- **`[hidden]` attribute:** `style.css`-এর শুরুতে
  `[hidden] { display: none !important; }` রুলটা কখনো সরানো/override
  করা যাবে না — নাহলে একাধিক স্ক্রিন একসাথে দেখা যেতে পারে।
- **`js/api.js`-এর `WORKER_URL`:** হার্ডকোড করা আছে
  (`https://notes-app-worker.openjobsolutionbd.workers.dev`)। Worker
  নতুন করে deploy করে URL বদলালে এখানে ম্যানুয়ালি আপডেট করতে হবে।
- **কোড আর ডেটা রিপো আলাদা** — বিস্তারিত উপরে সেকশন ২-এ, কখনো ভাঙা
  যাবে না।
- **`js/editor.js` bundled + minified** — কখনো ম্যানুয়ালি এডিট করা যাবে
  না (পড়া প্রায় অসম্ভব)। বদলাতে/আপডেট করতে হলে:
  ```bash
  mkdir editor-build && cd editor-build
  npm init -y
  npm install --save-exact @codemirror/view@6.34.1 @codemirror/state@6.4.1 \
    @codemirror/commands@6.7.1 @codemirror/lang-markdown@6.3.1 \
    @codemirror/language@6.10.6
  npm install --save-dev esbuild terser
  # editor-src.js এ import গুলো npm প্যাকেজ নাম দিয়ে লিখুন (CDN URL না)
  npx esbuild editor-src.js --bundle --format=esm --outfile=editor.bundle.js
  npx terser editor.bundle.js -c -m -o editor.min.js --comments false
  cp editor.min.js ../mydian/js/editor.js
  ```
  **কোনো runtime CDN নির্ভরতা রাখা যাবে না** — আগে esm.sh থেকে live
  import করায় এডিটর সাইলেন্টলি ফেইল করত (খালি স্ক্রিন, কোনো error না)।
- **GitHub token permission:** fine-grained token-টা `mydian` এবং
  `mydian-vault` — দুটো নির্দিষ্ট repo-তে scope করা আছে। নতুন কোনো repo
  যোগ হলে token permission-এও ম্যানুয়ালি সেই repo যোগ করতে হবে, নাহলে
  403/404 error আসবে।
- **কোনো automated test নেই** — পরিবর্তনের পর ম্যানুয়ালি ব্রাউজারে
  verify করাই একমাত্র উপায়।
- **⚠️ `worker/worker.js`-এ পরিবর্তন GitHub push-এ deploy হয় না:**
  Cloudflare Pages GitHub push হলেই auto-deploy করে, কিন্তু Cloudflare
  **Worker** সম্পূর্ণ আলাদা — deploy করতে ম্যানুয়ালি `wrangler deploy`
  চালাতে হয় (`worker/` ডিরেক্টরি থেকে)। `worker.js`-এ কোনো ফিক্স করার
  পর এটা মনে করিয়ে দেওয়া জরুরি, নাহলে ইউজার ভাবতে পারেন ফিক্স হয়ে গেছে
  কিন্তু পুরনো কোডই লাইভ থাকবে।
- **`isAllowedRepo()` allowlist ম্যানুয়ালি sync রাখতে হবে:**
  `worker/worker.js`-এর `DEFAULT_ALLOWED_REPOS`-এ এখন
  `openjobsolutionbd/mydian` আর `openjobsolutionbd/mydian-vault`
  hardcoded আছে। নতুন repo যোগ হলে এই লিস্টও আপডেট করতে হবে — নাহলে
  proxy 403 দিয়ে সব request প্রত্যাখ্যান করবে। বিকল্পভাবে
  `env.ALLOWED_REPOS` secret/var সেট করে override করা যায়।

---

## ৪. ফাইল-বাই-ফাইল সংক্ষিপ্ত বিবরণ

| ফাইল | কাজ |
|---|---|
| `index.html` | পুরো অ্যাপের DOM কাঠামো — লগইন স্ক্রিন, sidebar/file tree, editor area, মোডাল |
| `app.js` | মূল অ্যাপ লজিক — file tree রেন্ডার, ফাইল open/save/delete, মোডাল হ্যান্ডলিং, SW registration + auto-update |
| `style.css` | সব স্টাইল, dark theme, CodeMirror override |
| `js/api.js` | Worker-এর মাধ্যমে GitHub REST API কল, session/config localStorage-এ রাখা |
| `js/tree.js` | GitHub-এর flat file list-কে nested tree বানানো, sort করা, file-type হেল্পার (isMarkdown ইত্যাদি) |
| `js/cache.js` | IndexedDB-ভিত্তিক অফলাইন-ফার্স্ট লোকাল ক্যাশ (ফাইল-তালিকা + কনটেন্ট), best-effort — ব্যর্থ হলে চুপচাপ network-only মোডে চলে যায় |
| `js/editor.js` | **Bundled + minified** CodeMirror 6 (esbuild দিয়ে বান্ডলড, তারপর terser দিয়ে minify করা — সোর্স ~24k লাইন ছিল, এখন এক-লাইন compact ফাইল) — লাইভ-প্রিভিউ markdown এডিটর |
| `sw.js` | Service worker — app shell cache + auto-update মেকানিজম |
| `manifest.json` | PWA manifest |
| `_headers` | Cloudflare Pages HTTP header rules (no-cache for shell files) |
| `worker/worker.js` | Cloudflare Worker — PIN auth + GitHub API প্রক্সি (token নিরাপদে রাখে) |
| `worker/wrangler.toml` | Worker deploy config |
| `SETUP.md` | ইউজার-ফেসিং সেটআপ গাইড (PAT বানানো, Worker deploy, ইত্যাদি) |
| `icons/` | PWA আইকন (192/512px) — "M" মার্ক (Inter Bold), full-bleed (maskable-safe) |
| `scripts/bump-build-id.sh` | প্রতি push-এর আগে চালানো হয়, `sw.js`-এর `BUILD_ID` অটো-আপডেট করে |
| `PROJECT_NOTES.md` | **এই ফাইল** — এখনকার আর্কিটেকচার/অবস্থার সংক্ষিপ্ত কনটেক্সট |
| `HISTORY.md` | পুরনো bug ইতিহাস ও প্রথম আলোচনার বিস্তারিত প্রেক্ষাপট (রোজকার কাজে পড়ার দরকার নেই) |

---

## ৫. সাধারণ ডিবাগিং চেকলিস্ট (ভবিষ্যতে সমস্যা হলে)

1. **কিছুই আপডেট হচ্ছে না মনে হলে:** হার্ড রিফ্রেশ (Ctrl+Shift+R) করে
   দেখুন প্রথমে — SW auto-update থাকলেও browser tab bfcache ইত্যাদির
   কারণে দেরি হতে পারে।
2. **লগইন কাজ করছে না:** `js/api.js`-এর `WORKER_URL` ঠিক আছে কিনা, আর
   Worker actually deploy করা আছে কিনা (browser dev tools → Network ট্যাব
   → `/api/login` request-এর response দেখুন)।
3. **ফাইল/ফোল্ডার লিস্ট আসছে না বা লেখা/সেভ হচ্ছে না:** GitHub token
   permission চেক করুন — যে repo ব্যবহার হচ্ছে (`getConfig()` অনুযায়ী)
   সেটাতে token-এর `Contents: Read and write` আছে কিনা।
4. **এডিটর area খালি:** browser console-এ error দেখুন প্রথমে। যদি কোনো
   module resolution/import error দেখেন, `js/editor.js` bundle ঠিকমতো
   আছে কিনা যাচাই করুন (সেকশন ৩ দ্রষ্টব্য) — এই bundle যেন কখনো আবার
   লাইভ CDN import-এ ফিরিয়ে না দেওয়া হয়।
5. **UI element hidden attribute সত্ত্বেও দেখা যাচ্ছে:** `style.css`-এ
   `[hidden] { display: none !important; }` রুলটা এখনো আছে কিনা, এবং
   নতুন কোনো CSS রুল সেটাকে override করছে কিনা (`!important` দিয়ে) চেক
   করুন।

---

## ৬. ইউজার সম্পর্কে জরুরি প্রেক্ষাপট (সংক্ষিপ্ত — পূর্ণ বিবরণ `HISTORY.md`)

- ইউজার প্রোগ্রামার না, টার্মিনালে নতুন। **লম্বা টেকনিক্যাল ব্যাখ্যা
  না দিয়ে সরাসরি কাজ করা ফলাফল দেখানো** — এটাই মূল নিয়ম।
- ডিপ্লয়মেন্ট: কোড repo → Cloudflare Pages (auto-deploy GitHub push
  হলেই), Worker আলাদা করে `wrangler deploy` লাগে (push-এ deploy হয় না)।
- ভবিষ্যতে সম্ভাব্য ফিচার (এখনো implement হয়নি, ইউজারের সাথে confirm
  করা হয়নি): অ্যাপের ভেতর Claude API দিয়ে সরাসরি .md ফাইল এডিট করার
  বাটন।

*এই ডকুমেন্টটা সংক্ষিপ্ত রাখা হয় যাতে প্রতিবার কাজ শুরুতে কম পড়তে হয়।
পুরনো bug-এর বিস্তারিত কারণ/সমাধান বা প্রথম আলোচনার পুরো প্রেক্ষাপট
দরকার হলে `HISTORY.md` দেখুন। প্রতিটা কাজের পর সেকশন ০ (সর্বশেষ অবস্থা)
আপডেট রাখা জরুরি।*
