// sw.js — শুধু app shell cache করে (HTML/CSS/JS), যাতে অ্যাপ দ্রুত খোলে
// এবং ইন্টারনেট সাময়িক না থাকলেও UI-টা অন্তত লোড হয়।
// নোট ডেটা সবসময় লাইভ GitHub API থেকে আসে — সেটা offline-এ কাজ করবে না,
// কিন্তু অ্যাপ শেল খুলে "সংযোগ নেই" দেখাতে পারবে।

const CACHE_NAME = "mydian-shell-v1";
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

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // শুধু নিজের origin-এর static shell ফাইলের জন্য cache-first
  if (url.origin === location.origin && SHELL_FILES.includes(url.pathname)) {
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request))
    );
  }
  // বাকি সব (GitHub API, CDN থেকে CodeMirror ইত্যাদি) — সবসময় network থেকে
});
