# Mydian — প্রজেক্ট নোট (AI/ডেভেলপার কনটেক্সট ডকুমেন্ট)

> এই ফাইলটা কোনো ইউজার-ফেসিং ডকুমেন্টেশন না (সেটা `SETUP.md`)। **সংক্ষিপ্ত
> রাখা হয়** যাতে প্রতিবার কাজ শুরুতে কম পড়তে হয় — পুরনো bug-এর বিস্তারিত
> ইতিহাস ও প্রথম আলোচনার প্রেক্ষাপট এখন `HISTORY.md`-এ। এই ফাইলে শুধু
> **এখনকার** আর্কিটেকচার, নিয়ম, আর সাম্প্রতিক অবস্থা থাকে।

> 🛡️ **অবশ্যপালনীয় নিয়ম — প্রতিবার commit/push করার ঠিক আগে:**
> ```bash
> bash scripts/verify.sh
> ```
> চালাতে হবে (প্রথমবার হলে আগে `npm install` — ESLint লাগবে)। এটা ৯ স্তরে
> চেক করে: নিজের স্ক্রিপ্ট ঠিক আছে কিনা, JS syntax, ESLint (undefined
> variable ইত্যাদি গভীর ভুল), import/export path মিল, CSS/HTML গঠন,
> JSON/TOML/YAML config validity, DOM id মিল, আর আগে যেসব bug একবার
> হয়ে গেছে তার regression। প্রতিটা চেক দেখেশুনে টেস্ট করা হয়েছে —
> ইচ্ছাকৃতভাবে ভুল ঢুকিয়ে যাচাই করা হয়েছে যে সত্যিই ধরে, শুধু চোখে ভালো
> লাগার জন্য বসানো না। **"✅ সব ঠিক আছে" না দেখা পর্যন্ত push করা যাবে
> না।** ইউজার নিজে এটা চালাবেন না বা এটা সম্পর্কে জানতে চাইবেন না — এটা
> সম্পূর্ণ Claude-এর নিজের কাজের অংশ, ইউজারকে শুধু ফলাফল জানাতে হবে।

---

## ০. সর্বশেষ অবস্থা

**সর্বশেষ commit (২০২৬-০৮-১১):** Sidebar-এ Obsidian-এর মতো OS থেকে
সরাসরি ফাইল/ফোল্ডার drag-and-drop করে import করার ফিচার যোগ হয়েছে।
- `#file-tree`-এ `dragover`/`dragleave`/`drop` লিসেনার — কোন row-এর
  উপর ড্রপ হয়েছে সেটা দেখে টার্গেট ফোল্ডার ঠিক করে (ফোল্ডারের উপর হলে
  সেটাই, ফাইলের উপর হলে তার প্যারেন্ট, খালি জায়গায় হলে vault root)।
  ড্র্যাগ করার সময় হাইলাইট (dashed outline) দেখায়।
- `webkitGetAsEntry()` সাপোর্ট থাকলে (Chrome/Edge/নতুন Firefox) পুরো
  ফোল্ডার সাব-ফোল্ডার-সহ recursively import হয় (readEntries()-এর
  ১০০-এন্ট্রি-per-call সীমা মাথায় রেখে লুপ করে সব এন্ট্রি জোগাড় করা
  হয়)। সাপোর্ট না থাকলে (Safari/পুরনো ব্রাউজার) শুধু আলাদা ফাইলগুলো
  fallback হিসেবে import হয়, ফোল্ডার স্কিপ হয়।
- `sanitizeFilename()`-এর পাশে নতুন `sanitizeRelPath()` — সাব-ফোল্ডার
  গঠন ঠিক রেখে প্রতিটা path segment আলাদাভাবে sanitize করে (আগের
  `sanitizeFilename` শুধু শেষ অংশ নিত, পুরো ফোল্ডার import-এ সেটা
  সাব-ফোল্ডার হারিয়ে ফেলত)।
- একই path-এ ইতিমধ্যে ফাইল থাকলে (কোনো sha না পাঠানোয়) GitHub স্বাভাবিক
  422 error দেয়, সেটাই ফাইলের নাম-সহ alert-এ দেখানো হয় — বিদ্যমান
  attach-বাটনের আচরণের সাথে সামঞ্জস্যপূর্ণ, আলাদা করে overwrite-protection
  যোগ করা হয়নি।
- এটা মূলত ডেস্কটপ ব্রাউজারের ফিচার (OS থেকে ফাইল টেনে আনা) — মোবাইলে
  প্রাসঙ্গিক না, তাই মোবাইল UI-তে আলাদা কিছু যোগ করা হয়নি।

**তার আগের commit (২০২৬-০৮-১১):** Offline cache-এ একটা প্রকৃত "write
outbox" যোগ করা হয়েছে (`js/cache.js`-এ নতুন IndexedDB store,
DB_VERSION ১→২)। সংক্ষেপে:
- এখন থেকে টাইপ করা সাথে সাথেই (debounce-এর পর, GitHub PUT পাঠানোর
  *আগেই*) কনটেন্ট IndexedDB-তে দুই জায়গায় সংরক্ষিত হয় — `files` ক্যাশ
  আর নতুন `outbox` স্টোর। ট্যাব বন্ধ হয়ে গেলে বা রিফ্রেশ করলেও এডিট আর
  হারায় না।
- PUT ব্যর্থ হলে (অফলাইন/নেটওয়ার্ক এরর) outbox-এ এন্ট্রি থেকে যায়;
  ব্রাউজারের `online` ইভেন্টে, অ্যাপ চালু হওয়ার সময়ে, এবং ম্যানুয়াল
  রিফ্রেশ বাটনে — এই তিন জায়গা থেকে `flushOutbox()` স্বয়ংক্রিয়ভাবে
  আবার পাঠানোর চেষ্টা করে।
- `window.addEventListener("online"/"offline", …)` দিয়ে sync-dot এখন
  নেট চলে যাওয়া/ফেরার সাথে সাথেই আপডেট হয় (আগে পরের `loadFileTree()`
  কলের অপেক্ষা করতে হতো)। pending থাকলে sync-dot-এ কতগুলো এডিট
  সিঙ্ক-বাকি সেটাও দেখায়।
- একই ফাইলে সাধারণ save-flow (`flushSave`) আর ব্যাকগ্রাউন্ড
  `flushOutbox()` যেন কখনো একসাথে দুটো PUT না পাঠায় (409 এড়াতে), সেজন্য
  `isSaving`/`pendingSaveContent` guard শেয়ার করা হয়েছে দুটোর মধ্যে।
- ফাইল খোলার সময় (`openTextFile`) outbox-এ পেন্ডিং এন্ট্রি থাকলে
  `isDirty = true` রাখা হয় যাতে নেটওয়ার্ক থেকে আসা পুরনো ভার্সন এই
  অসিঙ্ক-করা এডিটকে ভুল করে ওভাররাইট না করে।
- Settings-এর "Clear cache" বাটন এখন pending outbox থাকলে থামিয়ে দেয়
  (আগে সিঙ্ক না হয়ে ক্যাশ মুছে গেলে সেই এডিট হারানোর ঝুঁকি ছিল)।
  Logout ওয়ার্নিং মেসেজও আপডেট হয়েছে (এখন আর বলে না যে সব হারিয়ে
  যাবে, যেহেতু outbox পরের লগইনেও টিকে থাকে)।
- Conflict (409, অন্য জায়গা থেকে বদলে যাওয়া) হলে আগের মতোই অটো-রিট্রাই
  হয় না, শুধু outbox থেকে সেই এন্ট্রি বাদ দেওয়া হয় (লোকাল কনটেন্ট
  `files` ক্যাশে থেকেই যায়, ইউজার চাইলে কপি করতে পারেন)।
- নতুন `.save-indicator.offline` স্টেট ("Saved offline") যোগ হয়েছে,
  বিদ্যমান `.sync-dot.offline`-এর মতোই হার্ডকোডেড অ্যাম্বার রঙ ব্যবহার
  করে (থিম-নিরপেক্ষ warning রঙ — এটা আগে থেকেই একটা ইচ্ছাকৃত ব্যতিক্রম,
  নতুন করা হয়নি)।
- `bash scripts/verify.sh` চালিয়ে সব চেক পাস করা নিশ্চিত করা হয়েছে
  push করার আগে।

⚠️ **এই কমিটটা `git reset --hard origin/main` করে রিমোট-এর সর্বশেষ
অবস্থার উপর আবার প্রয়োগ করতে হয়েছিল** — কাজ শুরুর সময় লোকাল রিপো একটা
পুরনো commit-এ ছিল (ইংলিশ UI অনুবাদ, থিম টগল, delete-এ PIN confirm,
verify.sh — এই সবগুলো তখনো টানা হয়নি), অথচ push করার ঠিক আগে fetch
করতে গিয়ে দেখা যায় রিমোটে ৮টা নতুন কমিট চলে এসেছে অন্য একটা সেশন থেকে।
প্রথম দফার কাজ (তখনো পুরনো বাংলা UI-এর উপর করা) `backup-offline-outbox`
ব্র্যাঞ্চে সংরক্ষিত আছে (রেফারেন্সের জন্য, merge করার দরকার নেই — এই
নতুন কমিটেই একই ফিচার ইংলিশ UI কনভেনশন মেনে পুনরায় প্রয়োগ করা হয়েছে)।
**শিক্ষা:** কাজ শুরুর আগে fetch করলেও, দীর্ঘ কাজের মাঝে (বিশেষত অন্য
সেশন সমান্তরালে চলতে পারে জানা থাকলে) push-এর ঠিক আগে আরেকবার fetch
করে remote এগিয়ে গেছে কিনা দেখে নেওয়াটা জরুরি — এই নিয়মটা আগে থেকেই
ছিল, এবারও ঠিকভাবে কাজ করেছে (silently overwrite হয়নি)।

**তার আগের commit (২০২৬-০৮-১০):** Push-চেকের সিস্টেম অনেক শক্তিশালী করা
হয়েছে। আগে শুধু syntax/id-মিল/৩টা canary চেক ছিল — এখন `scripts/verify.py`
৯ স্তরে চেক করে:
1. নিজের চেক-স্ক্রিপ্টগুলোই ঠিক আছে কিনা ("test the test")
2. JS syntax (আগে যেভাবে `.mjs` trick ব্যবহার করে fix করা হয়েছিল)
3. **ESLint** (নতুন dependency, `npm install` লাগে) — undefined variable,
   ব্যবহার না হওয়া কোড ইত্যাদি ধরে যা শুধু syntax check ধরে না
4. **import/export path resolution** (নতুন) — একটা বড় ফাঁক পাওয়া গিয়েছিল:
   `node -c` টাইপো করা import path (যেমন ভুল ফাইলের নাম) বা ভুল named
   import একদমই ধরত না, কারণ এটা module resolve করে না, শুধু ভেতরের
   syntax দেখে। টেস্ট করে নিশ্চিত হওয়া গেছে এই bug class-টা এতদিন অরক্ষিত
   ছিল।
5. CSS brace balance
6. **JSON/TOML/YAML config validity** (নতুন) — `manifest.json`,
   `worker/wrangler.toml`, আর ভবিষ্যতে কোনো GitHub Actions workflow
   ফাইল যোগ হলে সেটাও (এখনো কোনো workflow ফাইল push করা যায়নি, নিচে
   দ্রষ্টব্য)
7. HTML গঠন
8. DOM id মিল (`el()` ↔ `id=`)
9. আগের ৩টা bug-এর regression canary

**প্রতিটা চেক ইচ্ছাকৃতভাবে ভুল ঢুকিয়ে টেস্ট করা হয়েছে** (তারপর restore) —
শুধু "থাকলে ভালো" না, সত্যিই ধরে এটা যাচাই করা হয়েছে।

> ⏸️ **GitHub Actions তৈরি করা হয়েছিল কিন্তু push করা যায়নি:**
> `.github/workflows/verify.yml` লিখে টেস্ট করা হয়েছিল (push হওয়ার পর
> GitHub-এর সার্ভারে স্বাধীনভাবে আবার একই চেক চালানোর জন্য), কিন্তু
> GitHub নিজেই push আটকে দিয়েছে — বর্তমান token-এ `.github/workflows/`
> ফাইল বদলানোর জন্য আলাদা একটা "Workflows" অনুমতি লাগে যা এখনকার
> fine-grained PAT-এ নেই (শুধু "Contents: Read and write" আছে)। ফাইলটা
> `/tmp/workflow-backup/verify.yml`-এ (Claude-এর নিজের temp container-এ,
> সেশন শেষ হলে হারিয়ে যায়) এবং conversation history-তে সংরক্ষিত আছে।
> ইউজার যদি token-এ "Workflows: Read and write" অনুমতি যোগ করে দেন
> (GitHub token settings-এ fine-grained token এডিট করে), তাহলে এই
> ফাইলটা আবার লিখে push করা যাবে। এই স্তর ছাড়াই বাকি ৯টা চেক পুরোপুরি
> কাজ করছে ও প্রতি push-এর আগে Claude লোকালি চালায় — এটা শুধু একটা
> *অতিরিক্ত/দ্বিতীয় স্তরের* নিরাপত্তা ছিল, মূল সুরক্ষা এতে নির্ভর করে না।

> ⚠️ **সীমাবদ্ধতা:** এই sandbox environment-এ headless browser
> (Playwright/Puppeteer) ইনস্টল করা যায়নি (network egress ব্লক করা,
> browser binary download হয় না) — তাই সত্যিকারের অ্যাপ চালিয়ে
> ক্লিক-করে-টেস্ট করা (E2E) সম্ভব হয়নি, শুধু static analysis। GitHub
> Actions-এর নিজস্ব পরিবেশে Playwright চলতে পারে (সম্পূর্ণ internet
> access আছে), কিন্তু login flow-এর জন্য real credential/worker লাগে
> বলে সেটা এখনো যোগ করা হয়নি — ভুল/flaky automated test যোগ করার চেয়ে
> না করাই ভালো মনে হয়েছে।

**তার আগের commit (২০২৬-০৮-১০):** Dark/Light থিম টগল যোগ করা হয়েছে।
`style.css`-এর `:root`-এ সব রঙ CSS variable আকারে ছিল বলে বাস্তবায়ন সহজ
হয়েছে — `[data-theme="light"]` সিলেক্টরে আলাদা রঙ সেট করে দেওয়া হয়েছে,
বাকি পুরো CSS (editor, modal, sidebar) স্বয়ংক্রিয়ভাবে সেই অনুযায়ী বদলে
যায়। টগল বাটন Settings মোডালে (🌙/☀️), পছন্দ `localStorage`-এ
(`mydian-theme` key) সংরক্ষিত থাকে, ডিফল্ট dark। `index.html`-এর
`<head>`-এ একটা early inline script আছে যেটা CSS লোড হওয়ার আগেই থিম সেট
করে দেয় (flash এড়াতে)। **নতুন কোনো রঙ/উপাদান যোগ করলে সবসময় CSS variable
ব্যবহার করতে হবে** (hardcoded hex না) — নাহলে সেটা একটা থিমে ভাঙবে।

**তার আগের commit (২০২৬-০৮-০৯/১০):** পুরো অ্যাপের UI টেক্সট বাংলা থেকে
ইংলিশে অনুবাদ করা হয়েছে (আইকনে "মি"→"M" সহ), সাথে `worker/worker.js`-এর
৩টা error মেসেজও ("ভুল PIN" → "Incorrect PIN" ইত্যাদি)। **নতুন কোনো
ফিচার/UI-তে বাংলা টেক্সট বা ফন্ট যোগ করা যাবে না** যদি না ইউজার আবার
স্পষ্টভাবে চান — কোড কমেন্ট ব্যতিক্রম, সেগুলো বাংলায় লেখা চলতে থাকবে।

✅ **worker.js-এর এই ইংলিশ error মেসেজ + আগের সিকিউরিটি ফিক্স —
দুটোই `wrangler deploy` দিয়ে লাইভ করা হয়েছে** (২০২৬-০৮-১০, ইউজার
নিজে Git Bash থেকে চালিয়েছেন)। GitHub push আর লাইভ Worker এখন সিঙ্কে
আছে।

**তার আগের commit:** ডিলিট করার আগে এখন PIN দিয়ে নিশ্চিত করতে হয় (এক
ক্লিকে ডিলিট বন্ধ)। ফাইল ডিলিট (sidebar-এর row থেকে বা টপবারের ডিলিট
বাটন থেকে) আর ফোল্ডার ডিলিট — এই তিন জায়গাতেই আগে শুধু ব্রাউজারের
এক-ক্লিক `confirm()` ছিল। এখন একটা নতুন মোডাল খোলে
(`#delete-confirm-overlay`) যেখানে লগইন PIN দিতে হয়; PIN সঠিক না হলে
ডিলিট হয় না। PIN যাচাই হয় বিদ্যমান `/api/login` এন্ডপয়েন্ট দিয়েই
(`api.login(pin)`) — আলাদা কোনো নতুন Worker এন্ডপয়েন্ট বানাতে হয়নি;
সফল হলে সেশন টোকেন রিফ্রেশ হয় (পার্শ্ব-প্রতিক্রিয়া হিসেবে, ক্ষতিকর
না)। মূল লজিক: `app.js`-এ `openDeleteConfirm()` /
`submitDeleteConfirm()`, HTML মোডাল `index.html`-এ (`settings-modal`
-এর ঠিক পরে)। UI ইংরেজি অনুবাদের সাথে মিলিয়ে মেসেজগুলো ইংরেজিতেই
রাখা হয়েছে।

**তার আগের রাউন্ডে যা ফিক্স হয়েছে (৪টা যৌক্তিক বাগ):**
1. **🔴 [Data corruption risk] সেভ চলাকালীন ফাইল বদলালে ভুল ফাইলে ফলাফল
   বসত:** `flushSave()` সেভ শেষ হওয়ার সময় global `currentFile`-এর উপর
   নির্ভর করত। টাইপ করার পর GitHub-এ PUT পাঠানো অবস্থায় (নেটওয়ার্ক
   ধীর হলে কয়েক সেকেন্ড) ইউজার যদি অন্য ফাইল খুলে ফেলতেন (অসেভড
   পরিবর্তন-হারানোর confirm-এ "হ্যাঁ" চেপে), তাহলে পুরনো ফাইলের সেভ শেষ
   হওয়ার সময় সেই ফলাফল (sha, cache entry, "সেভ হয়েছে" স্ট্যাটাস) ভুল
   করে **নতুন** ফাইলে বসে যেত — নতুন ফাইলের cache পুরনো ফাইলের content
   দিয়ে ওভাররাইট, sha ভুল হয়ে পরের সেভে false 409, isDirty ভুলভাবে
   false হয়ে যাওয়া। **ফিক্স:** `saveCurrentFile()`-এ সেভ শুরুর মুহূর্তেই
   `currentFile`-এর object reference (`targetFile`) ধরে রাখা হয়, পুরো
   `flushSave()` চেইন সেই নির্দিষ্ট file object নিয়েই কাজ করে (sha
   আপডেট, cache write সবসময় সঠিক পাথে হয়), আর UI-side effect
   (`isDirty`, save indicator, alert) শুধু তখনই প্রয়োগ হয় যখন
   `currentFile === targetFile` — মানে ইউজার তখনো সেই ফাইলেই আছেন।
2. **🟠 [Data integrity] নাম পরিবর্তন মাঝপথে ব্যর্থ হলে ডুপ্লিকেট ফাইল
   থেকে যেত:** `renameFile()`-এ নতুন নামে কপি তৈরি (ধাপ ১) সফল হয়ে
   পুরনোটা ডিলিট (ধাপ ২) ব্যর্থ হলে দুইটা কপি GitHub-এ থেকে যেত, শুধু
   জেনেরিক এরর দেখাত, sidebar-ও রিফ্রেশ হতো না। **ফিক্স:** ধাপ ২ ব্যর্থ
   হলে এখন নতুন কপিটা রোলব্যাক (ডিলিট) করার চেষ্টা করা হয়; রোলব্যাকও
   ব্যর্থ হলে ইউজারকে স্পষ্টভাবে বলা হয় যে দুইটা কপিই এখন আছে,
   ম্যানুয়ালি একটা মুছতে হবে। দুই ক্ষেত্রেই শেষে `loadFileTree()` কল
   হয় যাতে sidebar আসল অবস্থা দেখায়।
3. **🟡 [UI consistency] ফোল্ডার ডিলিট মাঝপথে ব্যর্থ হলে sidebar পুরনো
   (ভুল) তালিকা দেখাত:** একাধিক ফাইলের loop-এ কোনো একটাতে এরর হলে,
   তার আগে যেগুলো GitHub থেকে সত্যিই মুছে গেছে সেটা sidebar-এ প্রতিফলিত
   হতো না (রিফ্রেশ কল হতো না)। **ফিক্স:** `try/finally` দিয়ে সফল হোক বা
   ব্যর্থ, সবসময় `loadFileTree()` চলে; খোলা থাকা ফাইলটা রিফ্রেশ করা
   treeData-তে সত্যিই না থাকলে তখনই এডিটর বন্ধ হয় (আগে থেকে ধরে না নিয়ে)।
4. **🟡 [Cache correctness] নতুন তৈরি করা ফাইলের instant-cache ভুল করে
   মুছে যেতে পারত:** ফাইল তৈরির পর ব্যাকগ্রাউন্ডে চলা `loadFileTree()`
   GitHub-এর recursive tree API নতুন ফাইলটা এখনো না দেখালে (eventual
   consistency lag — এই সমস্যাটা `createFile()`-এর অন্য জায়গায় আগে
   থেকেই নোট করা ছিল), `pruneToPaths()` সেই "না-থাকা" ফাইলের সদ্য বসানো
   cache entry মুছে ফেলত। **ফিক্স:** `cache.js`-এর `pruneToPaths()`
   এখন প্রতিটা এন্ট্রির `updatedAt` চেক করে — গত ১৫ সেকেন্ডের মধ্যে
   লেখা/আপডেট হওয়া এন্ট্রি এখনই prune করা হয় না (grace period), শুধু
   সত্যিই পুরনো (delete/rename হয়ে যাওয়া) এন্ট্রিই মোছা হয়।

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
