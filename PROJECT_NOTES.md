# Mydian — প্রজেক্ট নোট (AI/ডেভেলপার কনটেক্সট ডকুমেন্ট)

> এই ফাইলটা কোনো ইউজার-ফেসিং ডকুমেন্টেশন না (সেটা `SETUP.md`)। **সংক্ষিপ্ত
> রাখা হয়** যাতে প্রতিবার কাজ শুরুতে কম পড়তে হয় — পুরনো bug-এর বিস্তারিত
> ইতিহাস ও প্রথম আলোচনার প্রেক্ষাপট এখন `HISTORY.md`-এ। এই ফাইলে শুধু
> **এখনকার** আর্কিটেকচার, নিয়ম, আর সাম্প্রতিক অবস্থা থাকে।

> 🛡️ **অবশ্যপালনীয় নিয়ম — প্রতিবার commit/push করার ঠিক আগে:**
> ```bash
> bash scripts/verify.sh
> ```
> চালাতে হবে (প্রথমবার হলে আগে `npm install` — ESLint লাগবে)। এটা প্রথমে
> `scripts/archive-notes.py` চালিয়ে এই ফাইলের সেকশন ০ (সর্বশেষ অবস্থা)
> সর্বোচ্চ ৩টা এন্ট্রিতে রাখে (পুরনোগুলো `HISTORY.md`-এ স্বয়ংক্রিয়ভাবে
> সরিয়ে দেয়), তারপর ৯ স্তরে চেক করে: নিজের স্ক্রিপ্ট ঠিক আছে কিনা, JS
> syntax, ESLint (undefined variable ইত্যাদি গভীর ভুল), import/export
> path মিল, CSS/HTML গঠন, JSON/TOML/YAML config validity, DOM id মিল,
> আর আগে যেসব bug একবার হয়ে গেছে তার regression। প্রতিটা চেক দেখেশুনে
> টেস্ট করা হয়েছে — ইচ্ছাকৃতভাবে ভুল ঢুকিয়ে যাচাই করা হয়েছে যে সত্যিই
> ধরে, শুধু চোখে ভালো লাগার জন্য বসানো না। **"✅ সব ঠিক আছে" না দেখা
> পর্যন্ত push করা যাবে না।** ইউজার নিজে এটা চালাবেন না বা এটা সম্পর্কে
> জানতে চাইবেন না — এটা সম্পূর্ণ Claude-এর নিজের কাজের অংশ, ইউজারকে শুধু
> ফলাফল জানাতে হবে।

---

## ০. সর্বশেষ অবস্থা

**সর্বশেষ commit (২০২৬-০৮-১৫):** "দুই মোডাল stack" বাগের মূল কারণ
(root cause) ঠিক করা হলো — আগের কয়েকটা ফিক্স (Error Log vs Settings,
Quick Switcher-এর প্রথম ফিক্স) প্রতিটাই এক-একটা নির্দিষ্ট জোড়ার জন্য
আলাদা প্যাচ ছিল, যেটা প্যাটার্ন হিসেবেই ভঙ্গুর — নতুন মোডাল যোগ হলে
পুরনো চেক-লিস্ট stale হয়ে যায় (ঠিক যেমনটা Error Log যোগ হওয়ার সময়
হয়েছিল)। যাচাই করে দেখা গেছে **এই একই ফাঁক তখনো ছিল**:
`openQuickSwitcher()`-এর guard-এ `modalOverlay`/`settingsModalOverlay`/
`deleteConfirmOverlay` হাতে করে লেখা ছিল, কিন্তু নতুন `errorLogOverlay`
সেই লিস্টে যোগ হয়নি — তাই Error Log মোডাল খোলা অবস্থায় Ctrl+K চাপলে
তার উপর Quick Switcher আবার স্ট্যাক হয়ে যেত।
- প্রতিটা মোডাল একই `.modal-overlay` ক্লাস শেয়ার করে বলে এখন একটা
  শেয়ার্ড `closeOtherModals(exceptOverlay)` হেল্পার বসানো হয়েছে —
  `document.querySelectorAll(".modal-overlay:not([hidden])")` দিয়ে
  খোলা মোডাল খুঁজে বন্ধ করে দেয়। `openModal()`, `openDeleteConfirm()`,
  `btnSettings` click, `settingsViewErrors` click — এই ৪ জায়গার
  হাতে-লেখা নির্দিষ্ট-মোডাল-বন্ধ-করা কোড সরিয়ে এই একটা হেল্পারে
  একত্র করা হয়েছে। `openQuickSwitcher()`-এও একই generic query (তবে
  বন্ধ করা না, শুধু "অন্য কিছু খোলা থাকলে no-op" আচরণ, যাতে টাইপ করা
  অবস্থায় ভুলবশত Ctrl+K চাপলে সেই ইনপুট হারিয়ে না যায়)।
- **এখন থেকে নতুন কোনো মোডাল যোগ হলে এই কোনো ফাংশন ছোঁয়ার দরকার
  নেই** — `.modal-overlay` ক্লাস দিলেই স্বয়ংক্রিয়ভাবে বাকি সবার
  stacking-প্রোটেকশনে অন্তর্ভুক্ত হয়ে যাবে।

**তার আগের commit (২০২৬-০৮-১৫): আরেকটা "দুই মোডাল একসাথে খোলা থাকা" বাগ
ফিক্স (Error Log মোডাল)।** ইউজারের অনুরোধে ("পরের বাগ খুঁজ") অ্যাপ
রিভিউ করে পাওয়া — Settings-এ "View Error Log" ক্লিক করলে settings
মোডাল বন্ধ না করেই error log মোডাল খুলত, ফলে দুটো `.modal-overlay`
(একই z-index:50, position:fixed) একসাথে stack হয়ে থাকত (openModal()/
openDeleteConfirm()-এ যে নিয়ম মানা হয়, এখানে মিস হয়ে গিয়েছিল — এই
কোডবেসে একই প্যাটার্নের বাগ এর আগেও হয়েছিল, settings মোডালেও)।
Playwright দিয়ে reproduce করে নিশ্চিত হয়ে ফিক্স করা হয়েছে:
`settingsViewErrors` ক্লিক হ্যান্ডলারে এখন আগে `closeSettingsModal()`
কল হয়। সাথে error log মোডালে Escape দিয়ে বন্ধ করার সাপোর্টও যোগ করা
হলো। নতুন কোনো ফিচার না, শুধু বাগ ফিক্স।

**তার আগের commit (২০২৬-০৮-১৫):** সব নোটের কনটেন্ট background prefetch
যোগ হয়েছে — ইউজার লক্ষ্য করেছিলেন প্রথমবার কোনো নোটে ক্লিক করলে দেরি
হয়, দ্বিতীয়বার তাড়াতাড়ি হয় (cache-first architecture ঠিকই কাজ করছিল,
সমস্যা ছিল প্রথমবারের genuine network round-trip-এ)।
- `loadFileTree()`-এ `api.fetchTree()` সফল হওয়ার পরপরই নতুন
  `prefetchAllFiles(flatFiles)` কল হয় (fire-and-forget, await করা হয়
  না) — `PREFETCH_CONCURRENCY=3` দিয়ে worker-pool প্যাটার্নে সব
  markdown/text ফাইলের কনটেন্ট cache-এ নিয়ে আসে (ছবি/PDF বাদ,
  `isImage`/`isPdf` দিয়ে ফিল্টার করে)।
- প্রতিটা ফাইলের জন্য আগে `cache.getFile(path)` চেক করে — cached sha
  আর tree-এর বর্তমান sha মিললে skip করে (নেটওয়ার্ক কল ছাড়াই) — এই
  কারণে দ্বিতীয়বার অ্যাপ খোলা থেকে prefetch প্রায় কিছুই করে না (সব
  আগে থেকেই cache-এ), শুধু নতুন/বদলে যাওয়া ফাইলেই আসল fetch হয়।
- একটা ফাইল fetch ব্যর্থ হলে (নেট সমস্যা, rate limit) চুপচাপ স্কিপ করে
  বাকিগুলো চালিয়ে যায় — best-effort, কখনো throw করে না, ইউজার সেই
  ফাইলে সরাসরি ক্লিক করলে normal fetch পথেই খুলবে।
- worker-pool concurrency লজিক নতুন হওয়ায় (এই কোডবেসে প্রথমবার এই
  প্যাটার্ন) `node -e`-এ isolated mock টেস্ট করা হয়েছে ১০টা ফাইলের
  সিমুলেশনে (কিছু cache-এ already, একটা ইচ্ছাকৃত fetch-failure) —
  concurrency সীমা, skip-লজিক, আর error-isolation তিনটাই সঠিক প্রমাণিত
  হওয়ার পরই মূল কোডে বসানো হয়েছে।

**তার আগের commit (২০২৬-০৮-১৫):** ইউজারের নির্দেশে ("বাগ খুঁজ pin
সম্পর্কিত") PIN-সংশ্লিষ্ট কোড (login flow, delete-confirm PIN flow,
worker-এর rate-limit লজিক) ঘুরে দেখা হয়েছে। পাওয়া বাগ: `js/api.js`-এর
`login()`-এ network-error মেসেজ বাংলায় লেখা ছিল
("নেট সংযোগ পাওয়া যায়নি...") — এটা `loginError.textContent` (মূল লগইন
স্ক্রিন) আর `deleteConfirmError.textContent` (ডিলিট-কনফার্ম PIN মোডাল)
দুই জায়গাতেই সরাসরি দেখা যেত, ভাঙছিল ইংরেজি-only UI নিয়মকে (যেটা এই
সেশনের একটু আগেই অন্য একটা parallel session ৮ জায়গায় ঠিক করেছিল, কিন্তু
এই স্পটটা মিস হয়ে গিয়েছিল কারণ এটা শুধু offline অবস্থায় ট্রিগার হয়)।
ইংরেজি করে ঠিক করা হয়েছে। rate-limit লজিক (worker.js) আর PIN
trim()-এর edge case-ও যাচাই করা হয়েছে, ঝুঁকিপূর্ণ কিছু পাওয়া যায়নি
(rate-limit-এর KV read-then-write-এ তাত্ত্বিক race condition আছে,
কিন্তু per-attempt 800ms delay-এর কারণে বাস্তবে low-risk — ঠিক করা
হয়নি, শুধু নোট রাখা হলো)।

*এই সেকশনে সবসময় সর্বশেষ ৩টা commit-এন্ট্রি রাখা হয় — তার বেশি জমলেই
সবচেয়ে পুরনোটা(গুলো) `HISTORY.md`-এর "পুরনো সর্বশেষ অবস্থা" সেকশনের
একদম উপরে (নতুন-থেকে-পুরনো ক্রম বজায় রেখে) সরিয়ে দিতে হবে। উদ্দেশ্য:
এই ফাইলটা (এবং তাই প্রতি সেশনের শুরুতে যা পড়তে হয়) ছোট রাখা — টোকেন/খরচ
কম রাখতে। এটা প্রতিবার push-এর ডকুমেন্টেশন-আপডেট ধাপেই করতে হবে, আলাদা
করে কখনো মনে করিয়ে দেওয়া লাগবে না।*

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

- **⚠️ নতুন নিয়ম (২০২৬-০৮-০৯, ইউজারের স্পষ্ট নির্দেশে): প্রতিবার push
  করার পরপরই `CHANGELOG.md`-এ একটা নতুন এন্ট্রি যোগ করতে হবে।** এই
  ফাইলটা `PROJECT_NOTES.md`/`HISTORY.md`-এর মতো টেকনিক্যাল না — সম্পূর্ণ
  সাদামাটা ভাষায়, ইউজার নিজে পড়বেন এরকম ধরে লিখতে হবে (কী বদলেছে, কেন,
  কী প্রভাব পড়বে)। নতুন এন্ট্রি সবসময় ফাইলের **উপরে** যোগ হবে (সর্বশেষ
  আগে)। এটা বাদ দেওয়া যাবে না — commit/push workflow-এর একটা বাধ্যতামূলক
  ধাপ হিসেবে গণ্য করতে হবে।

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
- **`js/editor.js` bundled + minified (৫১৬KB, এক-লাইন)** — **কখনো এই
  ফাইল `view`/`cat` দিয়ে পুরোটা পড়া বা ম্যানুয়ালি এডিট করার চেষ্টা করা
  যাবে না** — এতে বিশাল টোকেন অপচয় হবে আর ফাইলটা মানুষের পড়ার মতো না।
  বদলাতে/আপডেট করতে হলে:
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
  **আপডেট (২০২৬-০৮-১১):** ইউজার নিজে `npx wrangler deploy` চালিয়ে
  repo-allowlist security fix লাইভ করেছেন (Version ID
  `d2735080-d5a9-4378-a0c8-348250957352`)। এই নির্দিষ্ট পেন্ডিং আইটেমটা
  এখন সমাধান — পরবর্তী সেশনে আর জিজ্ঞেস করার দরকার নেই। তবে ভবিষ্যতে
  `worker.js`-এ নতুন কোনো পরিবর্তন হলে আবার মনে করিয়ে দিতে হবে (deploy
  প্রতিবার আলাদাভাবে করতে হয়)।
- **`isAllowedRepo()` allowlist ম্যানুয়ালি sync রাখতে হবে:**
  `worker/worker.js`-এর `DEFAULT_ALLOWED_REPOS`-এ এখন
  `openjobsolutionbd/mydian` আর `openjobsolutionbd/mydian-vault`
  hardcoded আছে। নতুন repo যোগ হলে এই লিস্টও আপডেট করতে হবে — নাহলে
  proxy 403 দিয়ে সব request প্রত্যাখ্যান করবে। বিকল্পভাবে
  `env.ALLOWED_REPOS` secret/var সেট করে override করা যায়।

### টোকেন-সচেতন workflow নিয়ম (ইউজারের স্পষ্ট নির্দেশে, ২০২৬-০৮-১৩)

ইউজার টোকেন খরচ নিয়ে সচেতন — তাই প্রতিটা কাজে এই অভ্যাসগুলো মেনে চলা:

- **ছোট ফিক্স = সংক্ষিপ্ত এন্ট্রি।** এক-দুই লাইনের CSS/কনফিগ বদল বা
  সহজ বাগ ফিক্সে `PROJECT_NOTES.md`/`CHANGELOG.md`-এ ৩-৫ লাইনের বেশি
  ব্যাখ্যা লাগবে না (কী বদলাল + কেন, এটুকুই)। শুধু architecture বদলানো
  বা bug-এর root cause জটিল হলে (যেমন merge conflict resolve করা,
  নতুন সিস্টেম যোগ করা) বিস্তারিত ব্যাখ্যা প্রাপ্য।
- **অপ্রয়োজনীয় দ্বিতীয় `git fetch` এড়িয়ে চলা।** Commit করার ঠিক
  আগে একবার fetch করাই যথেষ্ট যদি তার পরে আর কোনো নেটওয়ার্ক-নির্ভর
  বিলম্ব না থাকে (যেমন ইউজার শুধু টেক্সট মেসেজ পাঠাচ্ছেন, অন্য কোনো
  session সমান্তরালে চলছে এমন সন্দেহ নেই)। push-এর ঠিক আগে সবসময়
  একবার fetch বাধ্যতামূলক থাকবে (parallel session-এর ঝুঁকি এড়াতে) —
  শুধু মাঝখানের অতিরিক্ত fetch-গুলো বাদ দেওয়া যায় যখন স্পষ্টতই দরকার
  নেই।
- **নতুন স্ক্রিপ্ট/জটিল লজিকেই শুধু isolated টেস্ট কপি বানানো** (যেমন
  `archive-notes.py`-এর জন্য `/tmp`-এ টেস্ট করা হয়েছিল) — ছোট,
  স্পষ্ট, কম-ঝুঁকির পরিবর্তনে (যেমন একটা CSS variable বদল) এটার দরকার
  নেই, সরাসরি `verify.sh` দিয়েই যথেষ্ট যাচাই হয়।
- **`js/editor.js` (৫১৬KB, minified) কখনো `view`/`cat` দিয়ে পুরো পড়া
  যাবে না** — এটা ইতিমধ্যে সেকশনের উপরে লেখা আছে, কিন্তু টোকেন-খরচের
  সবচেয়ে বড় ঝুঁকি এটাই বলে এখানেও উল্লেখ থাকল।
- **PROJECT_NOTES.md + CHANGELOG.md-এ একই কথা দুইবার বিস্তারিত না
  লেখা।** টেকনিক্যাল বিস্তারিত `PROJECT_NOTES.md`-এ থাকুক,
  `CHANGELOG.md`-এ শুধু ইউজার-বোধগম্য সংক্ষিপ্ত সারাংশ (২-৪ বাক্য)
  — একই ব্যাখ্যা দুই জায়গায় প্রায় অবিকল কপি-পেস্ট করা অপ্রয়োজনীয়।

---

## ৪. ফাইল-বাই-ফাইল সংক্ষিপ্ত বিবরণ

| ফাইল | কাজ |
|---|---|
| `index.html` | পুরো অ্যাপের DOM কাঠামো — লগইন স্ক্রিন, sidebar/file tree, editor area, মোডাল |
| `app.js` | মূল অ্যাপ লজিক — file tree রেন্ডার, ফাইল open/save/delete, মোডাল হ্যান্ডলিং, SW registration + auto-update |
| `style.css` | সব স্টাইল, dark+light থিম (CSS variable ভিত্তিক), CodeMirror override |
| `js/api.js` | Worker-এর মাধ্যমে GitHub REST API কল, session/config localStorage-এ রাখা |
| `js/tree.js` | GitHub-এর flat file list-কে nested tree বানানো, sort করা, file-type হেল্পার (isMarkdown ইত্যাদি) |
| `js/cache.js` | IndexedDB-ভিত্তিক অফলাইন-ফার্স্ট লোকাল ক্যাশ (ফাইল-তালিকা + কনটেন্ট) + write-outbox (সিঙ্ক-বাকি অফলাইন এডিট), best-effort — ব্যর্থ হলে চুপচাপ network-only মোডে চলে যায় |
| `js/editor.js` | **Bundled + minified** CodeMirror 6 (esbuild দিয়ে বান্ডলড, তারপর terser দিয়ে minify করা — সোর্স ~24k লাইন ছিল, এখন এক-লাইন compact ফাইল) — লাইভ-প্রিভিউ markdown এডিটর |
| `sw.js` | Service worker — app shell cache + auto-update মেকানিজম |
| `manifest.json` | PWA manifest |
| `_headers` | Cloudflare Pages HTTP header rules (no-cache for shell files) |
| `worker/worker.js` | Cloudflare Worker — PIN auth + GitHub API প্রক্সি (token নিরাপদে রাখে) |
| `worker/wrangler.toml` | Worker deploy config |
| `SETUP.md` | ইউজার-ফেসিং সেটআপ গাইড (PAT বানানো, Worker deploy, ইত্যাদি) |
| `icons/` | PWA আইকন (192/512px) — "M" মার্ক (Inter Bold), full-bleed (maskable-safe) |
| `scripts/bump-build-id.sh` | প্রতি push-এর আগে চালানো হয়, `sw.js`-এর `BUILD_ID` অটো-আপডেট করে |
| `scripts/verify.sh` / `verify.py` | প্রতি push-এর আগে বাধ্যতামূলক — ৯ স্তরের চেক (উপরে সেকশন ০-এ বিস্তারিত) |
| `eslint.config.mjs` | ESLint নিয়ম — শুধু bug ধরার জন্য, style/formatting নিয়ম নেই |
| `package.json` / `package-lock.json` | শুধু ESLint dependency-র জন্য, অ্যাপের নিজের কোনো build step নেই |
| `CHANGELOG.md` | সাদামাটা ভাষায় লেখা পরিবর্তনের ইতিহাস — **প্রতি push-এর পর আপডেট করা বাধ্যতামূলক** |
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
