# Mydian — প্রজেক্ট নোট (AI/ডেভেলপার কনটেক্সট ডকুমেন্ট)

> এই ফাইলটা কোনো ইউজার-ফেসিং ডকুমেন্টেশন না (সেটা `SETUP.md`)। এটা লেখা হয়েছে
> যাতে ভবিষ্যতে কোনো AI অ্যাসিস্ট্যান্ট (Claude বা অন্য কিছু) বা নতুন ডেভেলপার
> এই কোডবেসে কাজ করতে বসলে প্রজেক্টের ইতিহাস, আর্কিটেকচার, এবং ইতিমধ্যে সমাধান
> হওয়া সমস্যাগুলো দ্রুত বুঝে নিতে পারে — একই bug দ্বিতীয়বার "আবিষ্কার" করার
> সময় নষ্ট না করে।

---

## ০. সর্বশেষ অবস্থা (এই সেকশনটা প্রতিটা কাজের পর আপডেট হবে)

**সর্বশেষ commit:** `c4f227d` — docs: PROJECT_NOTES.md যোগ করা হয়েছে
**তারিখ:** ২০২৬-০৮-০৮
**অবস্থা:** vault separation, login, editor — সবকিছু ঠিকভাবে কাজ করছে
বলে নিশ্চিত হওয়া গেছে। এই মুহূর্তে কোনো known bug pending নেই।

**এর ঠিক আগে যা হয়েছিল (কালানুক্রমে, নতুন থেকে পুরনো):**
1. `PROJECT_NOTES.md` তৈরি — এই ডকুমেন্ট
2. CodeMirror এডিটর CDN থেকে সরিয়ে local bundle করা হয়েছে (`js/editor.js`
   এখন esbuild দিয়ে বান্ডলড, কোনো runtime CDN নির্ভরতা নেই) — কারণ CDN
   import সাইলেন্টলি ফেইল করে এডিটর area খালি দেখাচ্ছিল
3. Obsidian-স্টাইল ফাইল টাইটেল (বড় হেডিং, ফাইলের নাম) যোগ করা হয়েছে
4. অ্যাপ কোড আর নোট ডেটা আলাদা করা হয়েছে — নতুন `mydian-vault` রিপো
   তৈরি করে ডেটা storage হিসেবে সেট করা হয়েছে
5. `WORKER_URL` placeholder ঠিক করে আসল Worker URL বসানো হয়েছে (লগইন
   কাজ করছিল না এই কারণে)
6. `[hidden]` CSS specificity bug ঠিক করা হয়েছে (মোডাল/লগইন স্ক্রিন
   একসাথে দেখাচ্ছিল)
7. Service worker cache bug ঠিক করা হয়েছে (নতুন deploy পুরনো cache-এর
   কারণে দেখা যাচ্ছিল না)

বিস্তারিত প্রতিটা সমস্যার জন্য নিচে সেকশন ৩ দেখুন।

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

## ৩. যেসব bug পাওয়া গেছে এবং যেভাবে ঠিক হয়েছে (কালানুক্রমিকভাবে)

### ৩.১ — Service worker স্থায়ীভাবে পুরনো ভার্সন cache করে রাখছিল
**উপসর্গ:** নতুন deploy করার পরও ব্রাউজারে পুরনো bug/UI দেখা যাচ্ছিল।
**কারণ:** `sw.js`-এ `CACHE_NAME` হার্ডকোড করা ছিল (`"mydian-shell-v1"`),
কখনো বদলাতো না। Cache strategy ছিল cache-first। ফলে প্রথম visit-এ যা
cache হয়েছে, তাই চিরকাল সার্ভ হতো — নতুন deploy সত্ত্বেও।
**সমাধান (commit `089efb1`):**
- `CACHE_NAME`-এ একটা `BUILD_ID` স্ট্রিং যোগ করা হয়েছে যেটা প্রতি deploy-এ
  বদলানো উচিত (এখন ম্যানুয়াল — ভবিষ্যতে git commit hash দিয়ে automate করা
  যায়)।
- Strategy পাল্টে network-first করা হয়েছে (network fail হলেই শুধু cache
  fallback)।
- `app.js`-এ auto-update লজিক যোগ করা হয়েছে: নতুন SW পাওয়া গেলে
  `SKIP_WAITING` message পাঠিয়ে সাথে সাথে activate করে, `controllerchange`
  event-এ পেজ reload করে। প্রতি ১ মিনিটে এবং ট্যাব focus ফিরে এলে
  `reg.update()` কল হয়।
- `_headers` ফাইল যোগ করা হয়েছে (Cloudflare Pages headers) — `/`,
  `/index.html`, `/sw.js` কে `no-cache, no-store, must-revalidate` করে
  দেওয়া হয়েছে, যাতে HTTP-level caching নতুন deploy detect হতে দেরি না
  করায়।

### ৩.২ — `[hidden]` attribute কাজ করছিল না, একসাথে একাধিক স্ক্রিন দেখাত
**উপসর্গ:** লগইন স্ক্রিনের উপরেই "নতুন ফাইল" মোডাল খোলা অবস্থায় দেখা
যাচ্ছিল, প্রবেশ করা যাচ্ছিল না।
**কারণ:** `.login-screen`, `.app`, `.modal-overlay` — এই ক্লাসগুলোতে
`display: flex` সেট ছিল, যেটার CSS specificity (0,1,0) ঠিক `[hidden]`
selector-এর সমান। Specificity টাই হলে **cascade-এ পরের রুল জেতে** —
তাই `hidden` attribute থাকা সত্ত্বেও element-গুলো দৃশ্যমান থেকে যাচ্ছিল।
**সমাধান (commit `c1b89ab`):**
```css
[hidden] { display: none !important; }
```
এই রুল `style.css`-এর একদম শুরুর দিকে (login-screen রুলের ঠিক আগে) যোগ
করা হয়েছে, যাতে এটা সবসময় জিতে যায়। **ভবিষ্যতে নতুন কোনো element/ক্লাসে
`hidden` attribute ব্যবহার করলে এই রুলের কারণে নিশ্চিন্তে কাজ করবে —
তবে নতুন কোনো `!important` override যোগ করলে সাবধান থাকা উচিত।**

### ৩.৩ — `WORKER_URL` placeholder-ই থেকে গিয়েছিল, লগইন সবসময় ব্যর্থ হতো
**উপসর্গ:** সঠিক PIN দিলেও লগইন হচ্ছিল না।
**কারণ:** `js/api.js`-এ `WORKER_URL = "__WORKER_URL__"` — এটা
SETUP.md-এর ৩নং ধাপ অনুযায়ী deploy-এর পর ম্যানুয়ালি বসানোর কথা, কিন্তু
বসানো হয়নি। ফলে সব API call ভুল/অস্তিত্বহীন URL-এ যাচ্ছিল।
**সমাধান (commit `ab025b9`):**
```js
const WORKER_URL = "https://notes-app-worker.openjobsolutionbd.workers.dev";
```
**নোট:** এই মান হার্ডকোড করা আছে। যদি কখনো Worker নতুন করে deploy করে
ভিন্ন subdomain/নাম পাওয়া যায়, `js/api.js`-এর এই লাইনটা আপডেট করতে হবে।

### ৩.৪ — অ্যাপ কোড আর নোট ডেটা একই রিপোতে মেশানো ছিল
বিস্তারিত উপরে সেকশন ২-এ। **সমাধান (commit `fadad24`):** নতুন প্রাইভেট
রিপো `mydian-vault` তৈরি করে `js/api.js`-এর `getConfig()`-এ repo নাম
বদলে দেওয়া হয়েছে।

### ৩.৫ — CodeMirror এডিটর সাইলেন্টলি লোড হচ্ছিল না (খালি স্ক্রিন)
**উপসর্গ:** ফাইল খুললে breadcrumb/title দেখা যেত, কিন্তু এডিটর এলাকা
সম্পূর্ণ খালি — টাইপ করার কোনো জায়গা নেই, কোনো error message পর্যন্ত না।
**কারণ:** `js/editor.js` CodeMirror-এর প্যাকেজগুলো **লাইভ CDN
(`esm.sh`)** থেকে import করছিল, প্রতিটা আলাদা URL থেকে, কিছু URL-এ
`?deps=` query param ছিল কিছুতে ছিল না (inconsistent dependency
resolution — esm.sh ভিন্ন internal instance resolve করতে পারে, যেটা
CodeMirror-এর মতো reference-equality-sensitive লাইব্রেরিতে সমস্যা করে)।
আরও গুরুত্বপূর্ণ: এটা **top-level ES module import**, তাই import
resolve ব্যর্থ হলে পুরো module load-ই ব্যর্থ হয় — এটা কোনো try/catch
দিয়ে ধরা যায় না, তাই কোনো error console-এও স্পষ্টভাবে না আসতে পারে বা
পুরো `app.js`-এর execution থেমে যেতে পারে।
**প্রথম চেষ্টা (commit `22ea1cd`, অসম্পূর্ণ সমাধান):** সব CDN import-এ
সামঞ্জস্যপূর্ণ `?deps=` param বসানো হয়েছিল, আর `openFile`-এ visible
error message দেখানোর কোড যোগ করা হয়েছিল। এটা যথেষ্ট ছিল না — সমস্যা
থেকেই গিয়েছিল।
**চূড়ান্ত সমাধান (commit `9ebb89b`):** CodeMirror সম্পূর্ণভাবে
**local npm packages দিয়ে esbuild ব্যবহার করে bundle** করা হয়েছে, এবং
সেই bundle সরাসরি `js/editor.js`-এ বসানো হয়েছে। এখন **কোনো runtime CDN
নির্ভরতা নেই** — এডিটর কোড repo-র ভেতরেই সম্পূর্ণ সেলফ-কন্টেইনড।

**Bundle regenerate করার প্রক্রিয়া (ভবিষ্যতে দরকার হলে):**
```bash
mkdir editor-build && cd editor-build
npm init -y
npm install --save-exact @codemirror/view@6.34.1 @codemirror/state@6.4.1 \
  @codemirror/commands@6.7.1 @codemirror/lang-markdown@6.3.1 \
  @codemirror/language@6.10.6
npm install --save-dev esbuild
# editor-src.js এ import গুলো npm প্যাকেজ নাম দিয়ে লিখুন (CDN URL না):
#   import { EditorView, ... } from "@codemirror/view";
npx esbuild editor-src.js --bundle --format=esm --outfile=editor.bundle.js
cp editor.bundle.js ../mydian/js/editor.js
```
**সতর্কতা:** এই bundle ফাইলটা ~24,000 লাইনের (CodeMirror-এর পুরো কোড এর
ভেতরে আছে)। এটা ম্যানুয়ালি এডিট করার চেষ্টা করা ঠিক না — যেকোনো এডিটর
লজিক পরিবর্তনের জন্য `editor-src.js`-এর মতো একটা source ফাইলে বদল করে
পুনরায় bundle করতে হবে, তারপর bundle output-টা `js/editor.js`-এ কপি
করতে হবে।

### ৩.৬ — Obsidian-স্টাইল ফাইল টাইটেল যোগ করা হয়েছে (ফিচার, bug না)
**অনুরোধ:** ফাইল খুললে উপরে বড় করে ফাইলের নাম (extension ছাড়া) হেডিং
হিসেবে দেখাবে, নিচে content — Obsidian যেভাবে করে।
**বাস্তবায়ন (commit `e3bf895`):**
- `index.html`-এ `editor-wrap`-এর ভেতরে `<h1 id="file-title">` যোগ করা
  হয়েছে, `cm-host`-এর ঠিক উপরে।
- `style.css`-এ `.editor-wrap`-কে flex column করে `.file-title`-এর জন্য
  বড় ফন্ট স্টাইল যোগ করা হয়েছে, `.cm-host`-কে `flex: 1 1 auto` করা
  হয়েছে (আগে `height: 100%` ছিল, যেটা title যোগ হওয়ার পর overflow করত)।
- `app.js`-এর `openFile()`-এ markdown/text ফাইলের জন্য
  `fileTitle.textContent = fileNameWithoutExt(node.name)` সেট করা হয়,
  media (image/pdf) ফাইলের জন্য title হাইড করা হয়।

---

## ৪. ফাইল-বাই-ফাইল সংক্ষিপ্ত বিবরণ

| ফাইল | কাজ |
|---|---|
| `index.html` | পুরো অ্যাপের DOM কাঠামো — লগইন স্ক্রিন, sidebar/file tree, editor area, মোডাল |
| `app.js` | মূল অ্যাপ লজিক — file tree রেন্ডার, ফাইল open/save/delete, মোডাল হ্যান্ডলিং, SW registration + auto-update |
| `style.css` | সব স্টাইল, dark theme, CodeMirror override |
| `js/api.js` | Worker-এর মাধ্যমে GitHub REST API কল, session/config localStorage-এ রাখা |
| `js/tree.js` | GitHub-এর flat file list-কে nested tree বানানো, sort করা, file-type হেল্পার (isMarkdown ইত্যাদি) |
| `js/editor.js` | **Bundled** CodeMirror 6 (esbuild দিয়ে বান্ডলড, ~24k লাইন) — লাইভ-প্রিভিউ markdown এডিটর |
| `sw.js` | Service worker — app shell cache + auto-update মেকানিজম |
| `manifest.json` | PWA manifest |
| `_headers` | Cloudflare Pages HTTP header rules (no-cache for shell files) |
| `worker/worker.js` | Cloudflare Worker — PIN auth + GitHub API প্রক্সি (token নিরাপদে রাখে) |
| `worker/wrangler.toml` | Worker deploy config |
| `SETUP.md` | ইউজার-ফেসিং সেটআপ গাইড (PAT বানানো, Worker deploy, ইত্যাদি) |
| `PROJECT_NOTES.md` | **এই ফাইল** — AI/ডেভেলপার কনটেক্সট |

---

## ৫. জানা সীমাবদ্ধতা / ভবিষ্যতে যা খেয়াল রাখা উচিত

- **`BUILD_ID` ম্যানুয়াল:** `sw.js`-এর `BUILD_ID` স্ট্রিং প্রতি deploy-এ
  হাতে বদলাতে হয় cache invalidate করার জন্য। এটা git commit hash বা
  timestamp দিয়ে automate করা যেতে পারে (যেমন CI/CD পাইপলাইনে বিল্ড টাইমে
  inject করে), কিন্তু এখন এই প্রজেক্টে কোনো build step নেই বলে ম্যানুয়াল
  রাখা হয়েছে।
- **`WORKER_URL` হার্ডকোড:** `js/api.js`-এ সরাসরি বসানো। Worker URL
  বদলালে এটা ম্যানুয়ালি আপডেট করতে হবে।
- **`js/editor.js` bundle পুরনো হয়ে যেতে পারে:** CodeMirror-এর নতুন
  ভার্সন/security fix এলে bundle regenerate করে replace করতে হবে (উপরে
  ৩.৫ সেকশনে প্রক্রিয়া দেওয়া আছে)। npm-ভিত্তিক dependency versions:
  `@codemirror/view@6.34.1`, `@codemirror/state@6.4.1`,
  `@codemirror/commands@6.7.1`, `@codemirror/lang-markdown@6.3.1`,
  `@codemirror/language@6.10.6`।
- **GitHub token permission:** fine-grained token-টা `mydian` এবং
  `mydian-vault` — দুটো নির্দিষ্ট repo-তে scope করা আছে। নতুন কোনো repo
  (যেমন ভবিষ্যতে multi-vault ফিচার হলে) যোগ হলে token permission-এও
  ম্যানুয়ালি সেই repo যোগ করতে হবে, নাহলে 403/404 error আসবে।
- **কোনো automated test নেই:** এই প্রজেক্টে unit/integration test সেটআপ
  করা নেই। পরিবর্তনের পর ম্যানুয়ালি ব্রাউজারে verify করাই একমাত্র উপায়।

---

## ৬. সাধারণ ডিবাগিং চেকলিস্ট (ভবিষ্যতে সমস্যা হলে)

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
   আছে কিনা যাচাই করুন (৩.৫ সেকশন দ্রষ্টব্য) — এই bundle যেন কখনো আবার
   লাইভ CDN import-এ ফিরিয়ে না দেওয়া হয়।
5. **UI element hidden attribute সত্ত্বেও দেখা যাচ্ছে:** `style.css`-এ
   `[hidden] { display: none !important; }` রুলটা এখনো আছে কিনা, এবং
   নতুন কোনো CSS রুল সেটাকে override করছে কিনা (`!important` দিয়ে) চেক
   করুন।

---

*এই ডকুমেন্টটা ২০২৬ সালের আগস্টে একটা Claude-সহায়তায় debugging সেশনের
সময় লেখা হয়েছে। ভবিষ্যতে এই প্রজেক্টে বড় পরিবর্তন হলে এই ফাইলটাও আপডেট
রাখা উচিত, যাতে পরবর্তী AI/ডেভেলপার সেশন দ্রুত কনটেক্সট পায়।*
