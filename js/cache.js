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
