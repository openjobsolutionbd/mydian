# Mydian — প্রজেক্ট নোট (AI/ডেভেলপার কনটেক্সট ডকুমেন্ট)

> এই ফাইলটা কোনো ইউজার-ফেসিং ডকুমেন্টেশন না (সেটা `SETUP.md`)। এটা লেখা হয়েছে
> যাতে ভবিষ্যতে কোনো AI অ্যাসিস্ট্যান্ট (Claude বা অন্য কিছু) বা নতুন ডেভেলপার
> এই কোডবেসে কাজ করতে বসলে প্রজেক্টের ইতিহাস, আর্কিটেকচার, এবং ইতিমধ্যে সমাধান
> হওয়া সমস্যাগুলো দ্রুত বুঝে নিতে পারে — একই bug দ্বিতীয়বার "আবিষ্কার" করার
> সময় নষ্ট না করে।

---

## ০. সর্বশেষ অবস্থা (এই সেকশনটা প্রতিটা কাজের পর আপডেট হবে)

> ✅ **আপডেট (২০২৬-০৮-০৯, নতুন সেশন):** ইউজার নিশ্চিত করেছেন যে
> `worker/worker.js`-এর security fix (repo allowlist) ইতিমধ্যে
> `wrangler deploy` চালিয়ে লাইভ করা হয়েছে। আর জিজ্ঞেস করার দরকার নেই।

**সর্বশেষ commit:** PWA-নির্দিষ্ট বাগ খোঁজার অনুরোধে ২টা বাগ পাওয়া ও ফিক্স
**তারিখ:** ২০২৬-০৮-০৯ (দ্বিতীয় সেশন, একই দিনে)

**এই রাউন্ডে যা ফিক্স হয়েছে (PWA bug hunt, ইউজারের অনুরোধে):**
1. **🔴 [Offline-এ অ্যাপ একদমই খুলত না] `sw.js`-এর `SHELL_FILES`
   (offline precache তালিকা) অসম্পূর্ণ ছিল:** `app.js` শুরুতেই ৪টা ফাইল
   top-level ES import করে — `js/api.js`, `js/cache.js`, `js/tree.js`,
   `js/editor.js`। কিন্তু `SHELL_FILES`-এ শুধু `index.html`/`style.css`/
   `app.js`/`manifest.json` ছিল, এই ৪টা ছিল না। ফলাফল: browser-এর নিজস্ব
   HTTP cache-ও যদি এই ফাইলগুলো evict করে ফেলে (মোবাইলে কিছুদিন অ্যাপ না
   খুললে, storage pressure-এ, ইত্যাদি) আর তখন সত্যিই কোনো নেট না থাকে —
   `app.js`-এর ভেতরের import ব্যর্থ হতো, আর top-level import ব্যর্থ হলে
   পুরো module load-ই ব্যর্থ হয় (ঠিক সেকশন ৩.৫-এ নথিভুক্ত CDN বাগের মতোই
   উপসর্গ) — তাই সম্পূর্ণ খালি সাদা স্ক্রিন দেখাত, "সংযোগ নেই" মেসেজ
   পর্যন্ত দেখাত না। এটা সরাসরি আগের সেশনের "offline-first IndexedDB
   cache" ফিচারের মূল উদ্দেশ্যকেই ব্যর্থ করে দিচ্ছিল — কারণ সেই ক্যাশ
   পড়ার কোড (`js/cache.js`) নিজেই লোড হতে ব্যর্থ হতো। **ফিক্স:** এই ৪টা
   js ফাইল আর দুটো আইকন ফাইল (`icons/icon-192.png`, `icons/icon-512.png`)
   `SHELL_FILES`-এ যোগ করা হয়েছে, `BUILD_ID` বাম্প করা হয়েছে
   (`2026-08-09-1`)।
2. **🟡 [App আইকনে ভাঙা/ফাঁকা চিহ্ন] `icons/icon-192.png` ও
   `icons/icon-512.png`-এ "মি"-এর বদলে missing-glyph "tofu box" (□)
   ছিল প্রথম commit থেকেই:** আইকন তৈরির সময় বাংলা-সাপোর্ট না থাকা ফন্ট
   ব্যবহার হয়েছিল, ফলে হোমস্ক্রিন/ব্রাউজার-ট্যাব আইকনে সবসময় একটা ভাঙা
   বাক্স দেখাত। এছাড়া পুরনো আইকনের কোণা transparent ছিল (baked-in
   rounded corners), যেটা manifest-এ ঘোষিত `"purpose": "any maskable"`-এর
   জন্য সঠিক না (maskable আইকন full-bleed square হওয়া উচিত, OS নিজেই
   shape/mask বসায়)। **ফিক্স:** অ্যাপের নিজস্ব ব্র্যান্ড ফন্ট (Hind
   Siliguri, weight 700) আর নিজস্ব রং (`--accent-strong`→`#b98a5c`
   gradient badge, `--bg-app` ব্যাকগ্রাউন্ড, `.login-mark`-এর মতোই
   0.25 border-radius অনুপাত) দিয়ে নতুন করে আইকন বানানো হয়েছে — এখন
   সঠিকভাবে "মি" দেখায়, এবং badge-টা 80% maskable safe-zone-এর
   ভেতরেই থাকে (circle mask দিয়ে টেস্ট করে যাচাই করা হয়েছে, কিছু কাটা
   পড়ে না), কোণাগুলো এখন solid/full-bleed (transparent না)।

**এই রাউন্ডে নোট করা হয়েছে কিন্তু ফিক্স করা হয়নি (কম গুরুত্বপূর্ণ):**
- নেট চলে গেলে (offline event) সাথে সাথে sync-dot আপডেট হয় না — শুধু
  `loadFileTree()` কল হলে (app খোলার সময়, রিফ্রেশ বাটনে, বা
  সেভ/তৈরি/ডিলিট/রিনেমের পরে) status আপডেট হয়। ইউজার session-এর মাঝে
  নেট হারালে (যেমন শুধু একটা নোট পড়ছেন/লিখছেন অবস্থায়) sync-dot ভুলভাবে
  "সিঙ্ক হয়েছে" দেখাতে থাকতে পারে যতক্ষণ না কিছু একটা `loadFileTree()`
  ট্রিগার করে।
- Save ব্যর্থ হলে (409 conflict ছাড়া অন্য কোনো কারণে, যেমন অফলাইন থাকার
  কারণে network error) — শুধু ছোট "সেভ ব্যর্থ" টেক্সট দেখায়, কোনো
  automatic retry হয় না নেট ফিরে এলেও (কোনো `online` event listener
  নেই)। তবে `isDirty` ঠিকভাবে true থেকে যায় বলে ইউজার ভুল করে অন্য
  ফাইলে চলে গেলে/ট্যাব বন্ধ করলে/লগ আউট করলে সবসময় সতর্ক করা হয় —
  তাই ডেটা হারানোর ঝুঁকি নেই, শুধু "নেট ফিরলে আপনাআপনি সেভ হয়ে
  যাবে" ধরনের প্রত্যাশা ভুল প্রমাণ হতে পারে।
- iOS-এর জন্য `apple-mobile-web-app-capable` মেটা ট্যাগ নেই (নতুন iOS
  ভার্সনে কম গুরুত্বপূর্ণ, কিন্তু পুরনো iOS-এ standalone মোড আরও
  নির্ভরযোগ্য হতে পারত থাকলে)।


**তারিখ:** ২০২৬-০৮-০৯
**অবস্থা:** ইউজার জানিয়েছেন তার মূল লক্ষ্য হলো অ্যাপ যেন দ্রুত (fast)
হয় এবং .md ফাইল Obsidian-মানের এক্সপেরিয়েন্সে থাকে। ইউজার কোনো
কোডিং/টেকনিক্যাল জ্ঞান রাখেন না — কোনো ব্যাখ্যাই কোডিং-এর ভাষায় দেওয়া
ঠিক না, একদম সাধারণ ভাষায় (উদাহরণ দিয়ে) বলতে হবে, এবং শুধু কাজ করা
ফলাফল দেখাতে হবে।

**এই রাউন্ডে যা ফিক্স হয়েছে (৪টা যৌক্তিক বাগ, কোনো bug report ছাড়াই
কোড রিভিউ করে ধরা পড়েছে):**
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

**আগের রাউন্ডে যা যোগ হয়েছিল:**
1. **🚀 [Performance] অফলাইন-ফার্স্ট IndexedDB ক্যাশ (নতুন `js/cache.js`):**
   - `loadFileTree()` এখন cache-first — sidebar-এর ফাইল-তালিকা আগে
     লোকাল ক্যাশ থেকে তাৎক্ষণিকভাবে দেখায়, তারপর ব্যাকগ্রাউন্ডে GitHub
     থেকে যাচাই/আপডেট করে। নতুন `.sync-dot.offline` স্ট্যাটাস (হলুদ) এই
     অবস্থা বোঝাতে যোগ হয়েছে।
   - `openFile()`/নতুন `openTextFile()` হেল্পার — markdown/text ফাইল
     আগে cache থেকে থাকলে instant দেখায় (Obsidian-এর মতো), তারপর
     ব্যাকগ্রাউন্ডে GitHub-এর সর্বশেষ ভার্সনের সাথে মিলিয়ে নেয়। ইউজার
     টাইপ করা শুরু করে থাকলে (isDirty true) ব্যাকগ্রাউন্ড sync কখনো
     এডিটর কনটেন্ট ওভাররাইট করে না — চলমান এডিট কখনো হারায় না।
   - সেভ, তৈরি, ডিলিট, রিনেম — সবগুলোতেই cache সিঙ্ক রাখা হয় (নিচে দেখুন)।
   - Media ফাইল (ছবি/PDF) ইচ্ছাকৃতভাবে এই ক্যাশের বাইরে রাখা হয়েছে
     (স্কোপ সীমিত রাখতে, যেহেতু ইউজার প্রধানত .md ফাইল রাখবেন বলেছেন) —
     এগুলো এখনো সবসময় নেটওয়ার্ক থেকেই আসে, আগের মতোই।
   - সেটিংসে "ক্যাশ পরিষ্কার করুন" (link-style বাটন) যোগ করা হয়েছে —
     ট্রাবলশুটিং-এর জন্য, শুধু IndexedDB মোছে, GitHub-এর ডেটা ছোঁয় না।
   - ক্যাশ সম্পূর্ণ best-effort: IndexedDB না থাকলে (private browsing,
     পুরনো ব্রাউজার) সব ফাংশন silently null/false রিটার্ন করে, অ্যাপ
     স্বয়ংক্রিয়ভাবে আগের মতো pure-network মোডে চলে যায়, কখনো ভাঙে না।
2. **🔀 [Merge] GitHub-এ সরাসরি আপলোড করা "নাম পরিবর্তন" (rename)
   ফিচার merge করা হয়েছে:** ইউজারের পক্ষ থেকে GitHub ওয়েব UI দিয়ে
   সরাসরি `app.js`-এ push করা দুটো commit (`62c412b`, `a5d6235`) পাওয়া
   গিয়েছিল push করতে গিয়ে — সেখানে ফাইল রিনেম বাটন (২-ধাপে: নতুন নামে
   কপি + পুরনোটা ডিলিট) এবং নতুন ফাইলে এক্সটেনশন না দিলে অটো `.md`
   জোড়ার (`ensureMdExtension()`) ফিচার ছিল। এগুলো আমার cache ফিচারের
   সাথে conflict-free merge হয়েছে, তবে merge-এর পর একটা gap ধরা পড়ে —
   `renameFile()` cache layer সম্পর্কে জানত না বলে rename করার পর
   পুরনো path-এর cache entry স্থায়ীভাবে থেকে যেত (leak) আর নতুন
   path-এ কোনো cache entry তৈরি হতো না। এখন `renameFile()`-এ
   `cache.deleteFile()` (পুরনো path) আর টেক্সট/মার্কডাউন ফাইলের জন্য
   `cache.setFile()` (নতুন path, base64 decode করে) যোগ করা হয়েছে।

**নোট করা কিন্তু ফিক্স করা হয়নি:**
`corsHeaders()`-এ `Origin` না থাকলে `*` fallback — আগের রাউন্ডেও নোট
করা হয়েছিল।

**আগের রাউন্ডগুলোতে যা ঠিক হয়েছিল (কালানুক্রমে, নতুন থেকে পুরনো):**
- filename path-traversal sanitization, মোডাল stacking, Escape key fix
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
| `js/cache.js` | IndexedDB-ভিত্তিক অফলাইন-ফার্স্ট লোকাল ক্যাশ (ফাইল-তালিকা + কনটেন্ট), best-effort — ব্যর্থ হলে চুপচাপ network-only মোডে চলে যায় |
| `js/editor.js` | **Bundled** CodeMirror 6 (esbuild দিয়ে বান্ডলড, ~24k লাইন) — লাইভ-প্রিভিউ markdown এডিটর |
| `sw.js` | Service worker — app shell cache + auto-update মেকানিজম |
| `manifest.json` | PWA manifest |
| `_headers` | Cloudflare Pages HTTP header rules (no-cache for shell files) |
| `worker/worker.js` | Cloudflare Worker — PIN auth + GitHub API প্রক্সি (token নিরাপদে রাখে) |
| `worker/wrangler.toml` | Worker deploy config |
| `SETUP.md` | ইউজার-ফেসিং সেটআপ গাইড (PAT বানানো, Worker deploy, ইত্যাদি) |
| `icons/` | PWA আইকন (192/512px) — Hind Siliguri ফন্ট দিয়ে বানানো "মি" মার্ক, full-bleed (maskable-safe) |
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
