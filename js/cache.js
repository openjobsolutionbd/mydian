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
const DB_VERSION = 1;
const STORE_FILES = "files"; // key: path -> { path, content, sha, updatedAt }
const STORE_META = "meta"; // key: "tree" -> { key, value: flatFiles[], updatedAt }

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("IndexedDB সাপোর্ট নেই"));
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
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("IndexedDB খোলা যায়নি"));
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
// বানালে পুরনো ক্যাশ করা কনটেন্ট ভুলভাবে instant দেখিয়ে ফেলতে পারত
export async function deleteFile(path) {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_FILES, "readwrite");
    tx.objectStore(STORE_FILES).delete(path);
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
