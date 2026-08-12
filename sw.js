// sw.js — app shell cache করে, কিন্তু সবসময় সর্বশেষ ডিপ্লয়টাই দেখায়।
// নোট ডেটা সবসময় লাইভ GitHub API থেকে আসে — সেটা offline-এ কাজ করবে না,
// কিন্তু অ্যাপ শেল খুলে "সংযোগ নেই" দেখাতে পারবে।
//
// গুরুত্বপূর্ণ: CACHE_NAME-এ একটা বিল্ড টাইমস্ট্যাম্প বসানো আছে।
// প্রতিবার এই ফাইলটা ডিপ্লয় হলে (মানে কনটেন্ট বদলালে), ব্রাউজার নতুন sw.js
// ফাইলটা byte-for-byte compare করে নতুন version হিসেবে ধরবে, এবং পুরনো
// ক্যাশ activate ধাপে মুছে ফেলবে। শেল ফাইলগুলো এখন network-first — মানে
// নেট থাকলে সবসময় লেটেস্ট ভার্সন আনবে, শুধু network fail হলে cache fallback।

const BUILD_ID = "2026-08-12-1055"; // ডিপ্লয় করার সময় এই স্ট্রিং বদলে দিলেই cache invalidate হবে
const CACHE_NAME = `mydian-shell-${BUILD_ID}`;

// গুরুত্বপূর্ণ (বাগ ফিক্স ২০২৬-০৮-০৯): app.js শুরুতেই js/api.js, js/cache.js,
// js/tree.js, js/editor.js — এই ৪টা ফাইল import করে (top-level ES module
// import)। আগে এই তালিকায় শুধু index.html/style.css/app.js ছিল, এই js/*
// ফাইলগুলো ছিল না — মানে offline অবস্থায় (network fail + browser-এর নিজস্ব
// HTTP cache-এও না থাকলে, যেটা মোবাইলে কিছুদিন অ্যাপ না খুললে বা storage
// pressure-এ চুপচাপ হতে পারে) app.js লোড হলেও এর ভেতরের import গুলো ব্যর্থ
// হতো — আর top-level import ব্যর্থ হলে পুরো app.js-ই লোড হতে ব্যর্থ হয়, তাই
// সম্পূর্ণ খালি সাদা স্ক্রিন দেখাত, "সংযোগ নেই" মেসেজ পর্যন্ত না (ঠিক
// সেকশন ৩.৫-এ নথিভুক্ত CDN বাগের মতোই উপসর্গ, কিন্তু ট্রিগার এখানে অফলাইন
// হওয়া)। আইকন দুটোও যোগ করা হয়েছে, যাতে ইনস্টল করা অ্যাপ অফলাইনেও নিজের
// আইকন ঠিকমতো দেখাতে পারে।
const SHELL_FILES = [
  "/",
  "/index.html",
  "/style.css",
  "/app.js",
  "/manifest.json",
  "/js/api.js",
  "/js/cache.js",
  "/js/tree.js",
  "/js/editor.js",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // শুধু নিজের origin-এর static shell ফাইলের জন্য network-first,
  // network fail করলে cache থেকে fallback (offline support)
  if (url.origin === location.origin && SHELL_FILES.includes(url.pathname)) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
  }
  // বাকি সব (GitHub API, Google Fonts ইত্যাদি) — সবসময় সরাসরি network থেকে,
  // এই SW কোনো হাত দেয় না। js/editor.js (CodeMirror bundle) এখন উপরের
  // SHELL_FILES-এর ভেতরেই আছে বলে সেটাও precache + offline fallback পায়।
});
