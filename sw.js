// sw.js — app shell cache করে, কিন্তু সবসময় সর্বশেষ ডিপ্লয়টাই দেখায়।
// নোট ডেটা সবসময় লাইভ GitHub API থেকে আসে — সেটা offline-এ কাজ করবে না,
// কিন্তু অ্যাপ শেল খুলে "সংযোগ নেই" দেখাতে পারবে।
//
// গুরুত্বপূর্ণ: CACHE_NAME-এ একটা বিল্ড টাইমস্ট্যাম্প বসানো আছে।
// প্রতিবার এই ফাইলটা ডিপ্লয় হলে (মানে কনটেন্ট বদলালে), ব্রাউজার নতুন sw.js
// ফাইলটা byte-for-byte compare করে নতুন version হিসেবে ধরবে, এবং পুরনো
// ক্যাশ activate ধাপে মুছে ফেলবে। শেল ফাইলগুলো এখন network-first — মানে
// নেট থাকলে সবসময় লেটেস্ট ভার্সন আনবে, শুধু network fail হলে cache fallback।

const BUILD_ID = "2026-08-08-1"; // ডিপ্লয় করার সময় এই স্ট্রিং বদলে দিলেই cache invalidate হবে
const CACHE_NAME = `mydian-shell-${BUILD_ID}`;
const SHELL_FILES = ["/", "/index.html", "/style.css", "/app.js", "/manifest.json"];

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
  // বাকি সব (GitHub API ইত্যাদি) — সবসময় network থেকে। js/editor.js এখন
  // local bundle (আর কোনো CDN নির্ভরতা নেই), সেটাও network-first-এর বাইরে
  // স্বাভাবিক browser HTTP cache দিয়ে সার্ভ হয়, যেটা যথেষ্ট নিরাপদ।
});
