// cache.js — IndexedDB-ভিত্তিক লোকাল ক্যাশ, অফলাইন-ফার্স্ট আচরণের জন্য।
//
// লক্ষ্য: ফাইল-তালিকা আর নোটের কনটেন্ট ব্রাউজারের নিজস্ব IndexedDB-তে
// রাখা, যাতে অ্যাপ খোলার সাথে সাথেই (GitHub-এর নেটওয়ার্ক রেসপন্সের
// জন্য অপেক্ষা না করেই) sidebar আর ফাইলের লেখা তাৎক্ষণিকভাবে দেখানো
// যায় — ঠিক Obsidian যেভাবে লোকাল ডিস্ক থেকে instant খোলে।
//
// এই ক্যাশ সম্পূর্ণ "best-effort" — IndexedDB না থাকলে (private
// browsing, পুরনো ব্রাউজার, quota-এর সমস্যা ইত্যাদি) সব ফাংশন চুপচাপ
// null/false রিটার্ন করে, কোনো throw করে না। ফলে ক্যাশ ব্যর্থ হলেও
// অ্যাপ স্বাভাবিকভাবেই কাজ করবে — শুধু সরাসরি network-নির্ভর হয়ে যাবে
// (আগে যেমন ছিল)। ক্যাশ কখনো "একমাত্র" সোর্স অফ ট্রুথ না — GitHub-ই
// সবসময় আসল/চূড়ান্ত ডেটা, ক্যাশ শুধু গতি বাড়ানোর একটা layer।

const DB_NAME = "mydian-cache";
const DB_VERSION = 3;
const STORE_FILES = "files"; // key: path -> { path, content, sha, updatedAt }
const STORE_META = "meta"; // key: "tree" -> { key, value: flatFiles[], updatedAt }
const STORE_OUTBOX = "outbox"; // key: path -> { path, content, baseSha, queuedAt } — GitHub-এ এখনো না-পাঠানো অফলাইন এডিট
const STORE_ERRORS = "errors"; // key: auto-increment id -> { message, stack, source, timestamp }

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("IndexedDB is not supported"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_FILES)) {
        db.createObjectStore(STORE_FILES, { keyPath: "path" });
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(STORE_OUTBOX)) {
        db.createObjectStore(STORE_OUTBOX, { keyPath: "path" });
      }
      if (!db.objectStoreNames.contains(STORE_ERRORS)) {
        // auto-increment id — error-এর নিজস্ব কোনো natural key নেই (একই
        // মেসেজ বারবার ঘটতে পারে), তাই keyPath না দিয়ে autoIncrement।
        // timestamp-এ index রাখা হলো যাতে পুরনো এন্ট্রি ছাঁটাই (prune)
        // করার সময় পুরো store স্ক্যান না করে দ্রুত খুঁজে পাওয়া যায়।
        const errStore = db.createObjectStore(STORE_ERRORS, { keyPath: "id", autoIncrement: true });
        errStore.createIndex("timestamp", "timestamp");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("Could not open IndexedDB"));
  });
  return dbPromise;
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// একটা ফাইলের ক্যাশ করা content/sha ফেরত দেয়, না থাকলে null
export async function getFile(path) {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_FILES, "readonly");
    const result = await reqToPromise(tx.objectStore(STORE_FILES).get(path));
    return result || null;
  } catch (err) {
    return null;
  }
}

// ফাইলের content/sha ক্যাশে জমা রাখে (create বা update — দুটোতেই একই)
export async function setFile(path, { content, sha }) {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_FILES, "readwrite");
    tx.objectStore(STORE_FILES).put({ path, content, sha, updatedAt: Date.now() });
    return true;
  } catch (err) {
    return false;
  }
}

// ফাইল ডিলিট হলে ক্যাশ থেকেও সরিয়ে দেয় — নাহলে একই পাথে নতুন ফাইল
// বানালে পুরনো ক্যাশ করা কনটেন্ট ভুলভাবে instant দেখিয়ে ফেলতে পারত।
// সাথে outbox-এ (সিঙ্ক-বাকি অফলাইন এডিট) এই পাথের কোনো এন্ট্রি থাকলে
// সেটাও মুছে দেওয়া হয় — নাহলে ডিলিট হয়ে যাওয়া ফাইল পরে নেট ফিরলে
// আবার ভুলভাবে GitHub-এ তৈরি হয়ে যেতে পারত।
export async function deleteFile(path) {
  try {
    const db = await openDb();
    const tx = db.transaction([STORE_FILES, STORE_OUTBOX], "readwrite");
    tx.objectStore(STORE_FILES).delete(path);
    tx.objectStore(STORE_OUTBOX).delete(path);
    return true;
  } catch (err) {
    return false;
  }
}

// পুরো ফাইল-তালিকা (flat, GitHub tree API-র মতো ফরম্যাটে) ফেরত দেয়
export async function getTree() {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_META, "readonly");
    const result = await reqToPromise(tx.objectStore(STORE_META).get("tree"));
    return result ? result.value : null;
  } catch (err) {
    return null;
  }
}

export async function setTree(flatFiles) {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_META, "readwrite");
    tx.objectStore(STORE_META).put({ key: "tree", value: flatFiles, updatedAt: Date.now() });
    return true;
  } catch (err) {
    return false;
  }
}

// সেটিংস থেকে ইউজার ম্যানুয়ালি ক্যাশ পরিষ্কার করতে চাইলে (ট্রাবলশুটিং-এর
// জন্য) — এটা GitHub-এর ডেটা মুছে না, শুধু লোকাল কপি সরায়
export async function clearAll() {
  try {
    const db = await openDb();
    const tx = db.transaction([STORE_FILES, STORE_META], "readwrite");
    tx.objectStore(STORE_FILES).clear();
    tx.objectStore(STORE_META).clear();
    return true;
  } catch (err) {
    return false;
  }
}

// অটো ক্যাশ ম্যানেজমেন্ট — GitHub থেকে সর্বশেষ ফাইল-তালিকা সফলভাবে আনার
// পর প্রতিবার এটা কল করলে, যেসব ফাইল আর GitHub-এ নেই (ডিলিট/রিনেম হয়ে
// গেছে) তাদের পুরনো ক্যাশ এন্ট্রি নিজে থেকেই মুছে যায়। এতে ইউজারকে
// কখনো ম্যানুয়ালি "ক্যাশ পরিষ্কার করুন" চাপতে হয় না — ক্যাশ সবসময়
// স্বয়ংক্রিয়ভাবে বর্তমান ফাইল-তালিকার সাথে সিঙ্ক থাকে।
//
// একটা গুরুত্বপূর্ণ ব্যতিক্রম: এইমাত্র (কয়েক সেকেন্ড আগে) তৈরি/রিনেম হওয়া
// ফাইল সাথে সাথে মোছা হয় না। কারণ, GitHub-এর recursive tree API নতুন
// commit হওয়ার পরপরই সবসময় আপডেটেড তালিকা নাও দিতে পারে (eventual
// consistency lag) — সেই সাময়িক পুরনো তালিকা দিয়ে prune চালালে এইমাত্র
// তৈরি হওয়া ফাইলের ক্যাশ এন্ট্রি ভুল করে মুছে যেত, যদিও ফাইলটা আসলে
// GitHub-এ ঠিকই আছে।
const PRUNE_GRACE_MS = 15000;

export async function pruneToPaths(validPaths, graceMs = PRUNE_GRACE_MS) {
  try {
    const db = await openDb();
    const validSet = new Set(validPaths);
    const now = Date.now();
    const tx = db.transaction(STORE_FILES, "readwrite");
    const store = tx.objectStore(STORE_FILES);
    const allRecords = await reqToPromise(store.getAll());
    for (const record of allRecords) {
      if (validSet.has(record.path)) continue;
      if (now - (record.updatedAt || 0) < graceMs) continue; // এখনো grace period-এর মধ্যে — এখনই ছোঁয়া হচ্ছে না
      store.delete(record.path);
    }
    return true;
  } catch (err) {
    return false;
  }
}

// ============================================================
// Outbox — অফলাইনে/নেটওয়ার্ক-ব্যর্থতায় GitHub-এ এখনো পাঠানো যায়নি এমন
// এডিট সংরক্ষণ করে রাখে (IndexedDB-তে, তাই ট্যাব বন্ধ করলে/রিফ্রেশ করলেও
// হারায় না)। নেট ফিরলেই app.js এই এন্ট্রিগুলো একে একে GitHub-এ পাঠানোর
// চেষ্টা করে। সফল হলে এন্ট্রি মুছে যায়; ব্যর্থ হলে (এখনো অফলাইন) থেকে
// যায়, পরের সুযোগে আবার চেষ্টা হয়।
// ============================================================

// একটা ফাইলের জন্য পেন্ডিং এডিট queue/আপডেট করে (একই path হলে ওভাররাইট —
// শুধু সর্বশেষ কনটেন্টটাই দরকার, পুরনো পেন্ডিং ভার্সন রাখার দরকার নেই)
export async function queueOutboxEntry(path, content, baseSha) {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_OUTBOX, "readwrite");
    tx.objectStore(STORE_OUTBOX).put({ path, content, baseSha, queuedAt: Date.now() });
    return true;
  } catch (err) {
    return false;
  }
}

export async function getOutboxEntry(path) {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_OUTBOX, "readonly");
    const result = await reqToPromise(tx.objectStore(STORE_OUTBOX).get(path));
    return result || null;
  } catch (err) {
    return null;
  }
}

// সব পেন্ডিং এন্ট্রি ফেরত দেয় (queuedAt অনুযায়ী পুরনোটা আগে — একই ক্রমে
// সিঙ্ক করলে আগে করা এডিট আগে GitHub-এ যায়)
export async function getAllOutboxEntries() {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_OUTBOX, "readonly");
    const all = await reqToPromise(tx.objectStore(STORE_OUTBOX).getAll());
    return (all || []).sort((a, b) => (a.queuedAt || 0) - (b.queuedAt || 0));
  } catch (err) {
    return [];
  }
}

export async function clearOutboxEntry(path) {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_OUTBOX, "readwrite");
    tx.objectStore(STORE_OUTBOX).delete(path);
    return true;
  } catch (err) {
    return false;
  }
}

// ============================================================
// Error log — অ্যাপে JS error (uncaught exception, unhandled promise
// rejection) হলে app.js-এর গ্লোবাল হ্যান্ডলার এখানে লগ করে। উদ্দেশ্য:
// ইউজার নিজে থেকে বাগ রিপোর্ট/স্ক্রিনশট না দিলেও পরে Settings থেকে
// দেখা যায় ঠিক কী error হয়েছিল, কখন, এবং কোথায় (স্ট্যাক ট্রেস)।
//
// এই ডেটা শুধুই লোকাল IndexedDB-তে থাকে — কোথাও পাঠানো হয় না (GitHub-এ
// না, কোনো তৃতীয় পক্ষের সার্ভারেও না)। ইচ্ছাকৃতভাবে, কারণ স্ট্যাক
// ট্রেসে মাঝেমধ্যে ইন্টারনাল ফাইল পাথ/স্টেট চলে আসতে পারে, যেটা GitHub-এর
// মতো shared জায়গায় রাখা অপ্রয়োজনীয় ঝুঁকি।
// ============================================================

const MAX_ERROR_ENTRIES = 200; // এর বেশি জমলে সবচেয়ে পুরনোগুলো ছাঁটাই হয়ে যায়

export async function logError({ message, stack, source }) {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_ERRORS, "readwrite");
    tx.objectStore(STORE_ERRORS).add({
      message: String(message || "Unknown error").slice(0, 2000),
      stack: stack ? String(stack).slice(0, 4000) : null,
      source: source || null,
      timestamp: Date.now(),
    });
    return true;
  } catch (err) {
    // লগিং নিজেই ব্যর্থ হলে চুপচাপ থেমে যাওয়া — একটা logging bug যেন
    // মূল অ্যাপকে আরেকটা error লুপে না ফেলে
    return false;
  } finally {
    pruneErrors(); // fire-and-forget — প্রতিটা লগের পর await করার দরকার নেই
  }
}

// সবচেয়ে নতুন এন্ট্রি আগে (নতুন-থেকে-পুরনো), Settings-এর লিস্টে
// দেখানোর জন্য সবচেয়ে প্রাসঙ্গিক ক্রম
export async function getAllErrors() {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_ERRORS, "readonly");
    const all = await reqToPromise(tx.objectStore(STORE_ERRORS).getAll());
    return (all || []).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  } catch (err) {
    return [];
  }
}

export async function clearErrors() {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_ERRORS, "readwrite");
    tx.objectStore(STORE_ERRORS).clear();
    return true;
  } catch (err) {
    return false;
  }
}

// MAX_ERROR_ENTRIES-এর বেশি জমলে সবচেয়ে পুরনো এন্ট্রিগুলো মুছে ফেলে —
// একটা বাগ যদি বারবার (লুপে) error ছুঁড়তে থাকে, সেটা যেন IndexedDB-কে
// অসীমভাবে বড় করে না ফেলে।
async function pruneErrors() {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_ERRORS, "readwrite");
    const store = tx.objectStore(STORE_ERRORS);
    const count = await reqToPromise(store.count());
    if (count <= MAX_ERROR_ENTRIES) return;
    const index = store.index("timestamp");
    let toDelete = count - MAX_ERROR_ENTRIES;
    // timestamp index-এ পুরনো-থেকে-নতুন ক্রমে (ডিফল্ট) cursor দিয়ে হেঁটে
    // সবচেয়ে পুরনো toDelete-সংখ্যক এন্ট্রি মুছে ফেলা
    await new Promise((resolve) => {
      const cursorReq = index.openCursor();
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor || toDelete <= 0) {
          resolve();
          return;
        }
        cursor.delete();
        toDelete--;
        cursor.continue();
      };
      cursorReq.onerror = () => resolve();
    });
  } catch (err) {
    // ছাঁটাই ব্যর্থ হলেও চুপচাপ — এটা কোনো critical path না
  }
}
