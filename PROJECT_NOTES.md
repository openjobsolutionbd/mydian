# Mydian — প্রজেক্ট নোট (AI/ডেভেলপার কনটেক্সট ডকুমেন্ট)

> এই ফাইলটা কোনো ইউজার-ফেসিং ডকুমেন্টেশন না (সেটা `SETUP.md`)। এটা লেখা হয়েছে
> যাতে ভবিষ্যতে কোনো AI অ্যাসিস্ট্যান্ট (Claude বা অন্য কিছু) বা নতুন ডেভেলপার
> এই কোডবেসে কাজ করতে বসলে প্রজেক্টের ইতিহাস, আর্কিটেকচার, এবং ইতিমধ্যে সমাধান
> হওয়া সমস্যাগুলো দ্রুত বুঝে নিতে পারে — একই bug দ্বিতীয়বার "আবিষ্কার" করার
> সময় নষ্ট না করে।

---

## ০. সর্বশেষ অবস্থা (এই সেকশনটা প্রতিটা কাজের পর আপডেট হবে)

> ⚠️ **এখনো পেন্ডিং থাকতে পারে — যাচাই করে নেওয়া জরুরি:**
> `worker/worker.js`-এ একটা security fix করা হয়েছিল (repo allowlist),
> কিন্তু Cloudflare **Worker আলাদাভাবে deploy করতে হয়**
> (`wrangler deploy` দিয়ে) — GitHub push হলে Pages-এর মতো এটা
> auto-deploy হয় না। ইউজার এখনো নিশ্চিত করেননি যে `wrangler deploy`
> চালানো হয়েছে কিনা। যতক্ষণ না এটা করা হচ্ছে, ততক্ষণ পুরনো (repo
> allowlist ছাড়া) Worker কোডই লাইভ থাকবে। **পরবর্তী সেশনে এটা ইউজারকে
> মনে করিয়ে দেওয়া বা জিজ্ঞেস করে নেওয়া উচিত।**

**সর্বশেষ commit:** আরও ৩টা bug fix — filename path-traversal ঝুঁকি,
দুটো মোডাল একসাথে stack হওয়া, সেটিংস মোডালে Escape কাজ না করা
**তারিখ:** ২০২৬-০৮-০৮
**অবস্থা:** ইউজার আবার "bug fix koro" বলার পর আরও গভীরভাবে খোঁজা
হয়েছে, বিশেষভাবে user-input sanitization আর UI state-conflict এর
দিক থেকে। এই মুহূর্তে কোনো known bug pending নেই (উপরের wrangler
deploy ধাপ ছাড়া)।

**এই রাউন্ডে যা পাওয়া ও ঠিক হয়েছে:**
1. **🔴 [Security-adjacent] নতুন ফাইল/ফোল্ডারের নাম আর attachment
   filename sanitize হতো না (`app.js`):** "নতুন ফাইল" মোডালে বা
   attachment আপলোডে ইউজার/ফাইল-সিস্টেম থেকে আসা নামে `/` বা `../`
   থাকলে সেটা সরাসরি path-এ জোড়া লেগে যেত (যেমন
   `${targetFolder}/${file.name}`)। এতে টাইপ করে বা কোনো অস্বাভাবিক
   ফাইলনাম দিয়ে (কিছু OS/browser সোর্স থেকে বিরল ক্ষেত্রে সম্ভব)
   উদ্দিষ্ট ফোল্ডারের বাইরে গিয়ে vault-এর অন্য জায়গায় ফাইল কমিট করে
   ফেলা সম্ভব ছিল — একধরনের path-traversal bug। **সমাধান:**
   `sanitizeFilename()` হেল্পার যোগ করা হয়েছে (path separator বাদ
   দেয়, leading dots সরায়, filesystem-এ সমস্যাযুক্ত ক্যারেক্টার
   বদলে দেয়) — এখন নতুন ফাইল/ফোল্ডার তৈরির ৪টা call site এবং
   attachment upload — সবগুলোতেই প্রয়োগ করা হয়েছে।
2. **🟡 [UI bug] নতুন-ফাইল মোডাল আর সেটিংস মোডাল একসাথে stack হতে
   পারত:** দুটোই আলাদা `.modal-overlay` (একই z-index), কিন্তু কেউ
   কাউকে চেক/বন্ধ করত না। সেটিংস খোলা রেখে sidebar-এর "+"-এ ক্লিক
   করলে (বা উল্টোটা) দুটো overlay একসাথে দেখা যেত। **সমাধান:**
   `openModal()` আর সেটিংস `click` handler — দুটোই এখন অন্যটাকে বন্ধ
   করে দেয় প্রথমে।
3. **🟡 [UX inconsistency] সেটিংস মোডালে Escape কাজ করত না:**
   নতুন-ফাইল মোডালে Escape দিয়ে বন্ধ করা যেত, কিন্তু সেটিংস মোডালে
   শুধু ক্লিক/বাটনেই বন্ধ করা যেত। এখন একটা global `keydown` listener
   দিয়ে সেটিংস মোডালেও Escape কাজ করে।

**নোট করা কিন্তু ফিক্স করা হয়নি (আরও hardening সম্ভাবনা):**
`corsHeaders()`-এ এখনো `Origin` না থাকলে `*` fallback আছে (আগের
রাউন্ডেও নোট করা হয়েছিল)।

**আগের রাউন্ডগুলোতে যা ঠিক হয়েছিল (কালানুক্রমে, নতুন থেকে পুরনো):**
- 🔴 [Security] GitHub প্রক্সি সম্পূর্ণ open-ended ছিল, repo allowlist
  যোগ করা হয়েছে (⚠️ `wrangler deploy` লাগবে effective হতে)
- 🟠 SW auto-update টাইপ করা অবস্থায় জোর করে reload করত (data loss risk)
- 🟠 ডিলিট করার সময় pending save race condition (data loss risk)
- 🟠 `fetchTree()`-এ 409 কে ভুলভাবে "খালি repo" ধরা হতো
- 🟡 Save conflict (409) এ cryptic error + infinite retry loop ঝুঁকি
- সেটিংস বাটন dead ছিল + লগ আউট করার উপায় ছিল না
- এডিটর decoration crash risk (mark+replace overlap)
- `createFolder()` অদ্ভুতভাবে `.gitkeep` এডিটরে খুলে ফেলত
- `.gitkeep` sidebar-এ দেখা যেত
- Save race condition (প্রথম আংশিক ফিক্স)
- এডিটর area zero-height CSS bug + createFile race condition
- CodeMirror CDN থেকে local bundle-এ সরানো হয়েছে
- Obsidian-স্টাইল ফাইল টাইটেল যোগ
- অ্যাপ কোড আর নোট ডেটা আলাদা রিপোতে (`mydian-vault`)
- `WORKER_URL` placeholder ফিক্স
- `[hidden]` CSS specificity bug ফিক্স
- Service worker cache bug ফিক্স

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
- **⚠️ `worker/worker.js`-এ পরিবর্তন GitHub push-এ deploy হয় না:**
  Cloudflare Pages GitHub push হলেই auto-deploy করে, কিন্তু Cloudflare
  **Worker** সম্পূর্ণ আলাদা জিনিস — এটা deploy করতে ম্যানুয়ালি
  `wrangler deploy` চালাতে হয় (Worker-এর ডিরেক্টরি থেকে, `wrangler.toml`
  যেখানে আছে)। `worker.js`-এ যেকোনো ফিক্স/পরিবর্তন করার পর এটা মনে করিয়ে
  দেওয়া জরুরি, নাহলে ইউজার ভাবতে পারেন ফিক্স "হয়ে গেছে" কিন্তু আসলে
  পুরনো কোডই লাইভ থাকবে।
- **`isAllowedRepo()` allowlist ম্যানুয়ালি sync রাখতে হবে:**
  `worker/worker.js`-এর `DEFAULT_ALLOWED_REPOS`-এ এখন
  `openjobsolutionbd/mydian` আর `openjobsolutionbd/mydian-vault`
  hardcoded আছে। ভবিষ্যতে যদি vault repo-র নাম বদলায় বা নতুন কোনো repo
  (যেমন দ্বিতীয় vault) যোগ হয়, এই লিস্টও আপডেট করতে হবে — নাহলে proxy
  403 দিয়ে সব request প্রত্যাখ্যান করবে। বিকল্পভাবে `env.ALLOWED_REPOS`
  secret/var সেট করে override করা যায় কোড না ছুঁয়েই।

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

---

## ৭. প্রজেক্টের শুরু — মূল আলোচনা ও ইউজার কনটেক্সট (claude.ai চ্যাট থেকে)

> এই সেকশনটা যোগ করা হয়েছে সেই মূল চ্যাট থেকে, যেখানে ইউজারের সাথে বসে
> স্ক্র্যাচ থেকে পুরো প্রজেক্টের স্কোপ ও আর্কিটেকচার ঠিক করা হয়েছিল, তারপর
> প্রথম ভার্সন কোড করে দেওয়া হয়েছিল। ভবিষ্যতে কাজ করার সময় এই কনটেক্সট
> মাথায় রাখা জরুরি।

### ৭.১ — ইউজারের টেকনিক্যাল লেভেল (সবচেয়ে গুরুত্বপূর্ণ)

**ইউজার প্রোগ্রামার না, এবং টার্মিনাল/কমান্ড লাইনে একদম নতুন।** কোনো
কমান্ড দেওয়ার সময় নিচের নিয়মগুলো মানা জরুরি:

- **কখনো ধরে নেওয়া যাবে না** ইউজার জানেন কোন ফোল্ডারে আছেন, `cd` কী করে,
  বা কোনো error message-এর মানে কী। প্রতিটা ধাপ literally কপি-পেস্ট
  করার মতো করে দিতে হবে।
- ইউজার ইতিমধ্যে **আটকে গিয়ে বলেছেন**: *"এসব ঝামেলা আমার চাইনা"*, *"এটা
  মনেহয় আমি করতে পারবনা তুমি করো"*, *"কি করছি আমি কিছু জানিনা"* — এই
  ধরনের হতাশা প্রকাশ পেলে সাথে সাথে সহজ ভাষায় (কেন এটা লাগছে, কী হবে)
  বুঝিয়ে, আরও ছোট ছোট ধাপে ভাঙতে হবে। প্রতিটা ধাপ পরবর্তী ধাপের আগে
  verify করে নিতে হবে (আউটপুট দেখে)।
- **টার্মিনাল হিসেবে Git Bash (Windows)** ব্যবহার করেন। Node.js প্রথমে
  ইনস্টল করা ছিল না, ইনস্টল করানো হয়েছিল (nodejs.org থেকে LTS)।
- সম্ভব হলে **console/browser-based fix** এর বদলে **কোড-লেভেল fix** (যেমন
  hardcode করে দেওয়া, ম্যানুয়াল ধাপ কমানো) প্রেফার করেন — repo owner/repo
  ম্যানুয়ালি বসাতে হচ্ছিল দেখে বিরক্ত হয়েছিলেন, তারপর কোডে hardcode করে
  দেওয়া হয়েছিল (সেকশন ২ দ্রষ্টব্য — এটাই পরে vault আলাদা করার সিদ্ধান্তেও
  ভূমিকা রেখেছে)।
- Deploy/setup সংক্রান্ত যেকোনো টেকনিক্যাল ধাপ (secrets, wrangler,
  git push, Cloudflare dashboard ক্লিক) ইউজার নিজে টার্মিনালে/ব্রাউজারে
  চালিয়েছেন, ধাপে ধাপে নির্দেশনা অনুসরণ করে — Claude-এর কোনো direct
  filesystem/deployment access তার মেশিনে বা তার Cloudflare/GitHub
  অ্যাকাউন্টে নেই।

### ৭.২ — মূল requirement (কেন এই আর্কিটেকচার বেছে নেওয়া হয়েছিল)

- ইউজার **Obsidian**-এর একটা স্ক্রিনশট দেখিয়েছিলেন (প্রথমে ভুল করে
  "Notion" বলেছিলেন) — চেয়েছিলেন sidebar-এ file tree, ক্লিক করলে পাশে
  content খোলা, ঠিক ওই ইন্টারফেসের ধরন।
- Notion-এর মতো ভারী/বহু-ফিচার সমৃদ্ধ কিছু চাননি — **নির্দিষ্ট কয়েকটা
  ফিচার সহ হালকা কাস্টম টুল**।
- **বাজেট: শূন্য** — সম্পূর্ণ ফ্রি টিয়ারে চলতে হবে (GitHub free +
  Cloudflare Pages/Workers free tier)।
- **মাল্টি-ডিভাইস দরকার** — অফিসের কম্পিউটার ও ব্যক্তিগত মোবাইল, দুই
  জায়গা থেকেই কাজ করেন, তাই অনলাইন সিঙ্ক আবশ্যক (PWA + GitHub backend
  দিয়ে সমাধান করা হয়েছে)।
- **.md ফাইল সবচেয়ে বেশি দরকার**, পাশাপাশি ছবি/PDF attachment-ও লাগবে।
- **ডাউনলোড অপশন** স্পষ্টভাবে চেয়েছিলেন (যেকোনো ফাইল, ইমেজ/PDF/টেক্সট,
  ডাউনলোড করার বাটন) — এটা `app.js`-এর `btnDownload` হ্যান্ডলারে আছে।
- **GitHub-কে source of truth** হিসেবে বেছে নিয়েছিলেন সচেতনভাবে (প্রথমে
  Cloudflare D1/KV-এর বিকল্পও আলোচনা হয়েছিল, কিন্তু ইউজার নিজে থেকে
  GitHub পছন্দ করেছেন — কারণ ওনার আগে থেকেই একটা মিলজুলা প্রজেক্ট
  ছিল, `github.com/openjobsolutionbd/githubfilemanager`, plain
  HTML/CSS/JS দিয়ে বানানো, কোনো build step ছাড়া — সেটাই এই প্রজেক্টের
  vanilla-JS approach-এর অনুপ্রেরণা)।
- **Claude ইন্টিগ্রেশন** (ইউজার বেশি কাজ Claude দিয়ে করেন, .md ফাইল
  দ্রুত Claude দিয়ে এডিট করানোর ইচ্ছা প্রকাশ করেছিলেন) — এই সিদ্ধান্ত
  **স্থগিত রাখা হয়েছিল** ("পরে আলোচনা করে ঠিক করব")। এখনো implement করা
  হয়নি। ভবিষ্যতে এই ফিচার চাইলে যোগ করার কথা ভাবা যেতে পারে (যেমন:
  অ্যাপের ভেতর একটা বাটন যেটা Claude API কল করে সিলেক্টেড ফাইল এডিট
  করে দেয়) — কিন্তু এটা এখনো ইউজারের সাথে confirm করা হয়নি ঠিক কীভাবে
  চান।
- **Single-user অ্যাপ**, PIN-ভিত্তিক auth যথেষ্ট মনে করেছেন (OAuth-এর
  জটিলতা লাগবে না)।

### ৭.৩ — ডিপ্লয়মেন্ট ইতিহাস (এই চ্যাটে যা করা হয়েছিল)

1. GitHub personal access token বানানো (fine-grained, repo-scoped)
2. Cloudflare Worker deploy করা (`wrangler login` → `wrangler secret put`
   ×৩ → `wrangler deploy`) — Worker URL:
   `https://notes-app-worker.openjobsolutionbd.workers.dev`
3. প্রথম কোডবেস zip আকারে দিয়ে, ইউজার নিজে `git init` → `git add` →
   `git commit` → `git remote add origin` → `git push` করেছেন
4. Cloudflare Pages ড্যাশবোর্ড থেকে GitHub repo connect করা হয়েছে,
   auto-deploy সেটআপ — লাইভ URL: `mydian-tei.pages.dev`
5. প্রথম দিকে দুটো bug ধরা পড়েছিল এই চ্যাটে: repo config prompt না
   আসা (hardcode করে সমাধান), এবং "নতুন ফাইল" মোডাল এমনি এমনি খোলা
   (তখন কারণ নিশ্চিত হয়নি — পরের সেশনে এটা `[hidden]` CSS specificity
   bug হিসেবে চিহ্নিত ও সমাধান হয়েছে, সেকশন ৩.২ দ্রষ্টব্য)

---
