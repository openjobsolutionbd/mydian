# Mydian — সেটআপ গাইড

এটা আপনার ব্যক্তিগত মার্কডাউন নোট অ্যাপ। GitHub repo-কে ডেটা স্টোরেজ হিসেবে
ব্যবহার করে, Cloudflare Pages-এ হোস্ট হয়, PWA হিসেবে যেকোনো ডিভাইসে ইনস্টল করা যায়।

নিচের ধাপগুলো **একবারই** করতে হবে। এরপর থেকে সবকিছু অ্যাপের ভেতর থেকেই হবে।

---

## ধাপ ১ — GitHub Personal Access Token তৈরি করুন

1. GitHub-এ যান: **Settings → Developer settings → Personal access tokens → Fine-grained tokens**
   (সরাসরি লিংক: https://github.com/settings/tokens?type=beta)
2. "Generate new token" ক্লিক করুন
3. **Repository access** → শুধু `openjobsolutionbd/mydian` repo বেছে নিন
4. **Permissions → Repository permissions → Contents** → **Read and write** সেট করুন
5. Token তৈরি করুন এবং **কপি করে নিরাপদ জায়গায় রাখুন** (এটা একবারই দেখাবে)

---

## ধাপ ২ — Cloudflare Worker deploy করুন (token-এর নিরাপদ প্রক্সি)

Worker-টা browser আর GitHub-এর মাঝে বসে থাকবে, যাতে GitHub token কখনো
browser-এ প্রকাশ না হয়।

টার্মিনালে (এই প্রজেক্টের `worker/` ফোল্ডারে গিয়ে):

```bash
cd worker
npm install -g wrangler   # যদি আগে থেকে না থাকে
wrangler login             # ব্রাউজারে Cloudflare অ্যাকাউন্ট দিয়ে লগইন হবে
```

এবার তিনটা secret সেট করুন (প্রতিটা কমান্ডের পর টার্মিনালে মান বসাতে বলবে):

```bash
wrangler secret put GITHUB_TOKEN
# উপরে যে token কপি করেছিলেন সেটা পেস্ট করুন

wrangler secret put APP_PIN
# একটা PIN/password ঠিক করুন (যেমন: 4-6 সংখ্যা), এটা দিয়ে অ্যাপে লগইন করবেন

wrangler secret put SESSION_SECRET
# যেকোনো লম্বা random string (যেমন: openssl rand -hex 32 দিয়ে বানাতে পারেন)
```

এবার deploy করুন:

```bash
wrangler deploy
```

Deploy শেষে একটা URL দেখাবে, যেমন:
`https://notes-app-worker.<your-subdomain>.workers.dev`

**এই URL-টা কপি করে রাখুন — পরের ধাপে লাগবে।**

---

## ধাপ ৩ — Worker URL অ্যাপে বসান

`js/api.js` ফাইলে এই লাইনটা খুঁজুন:

```js
const WORKER_URL = "__WORKER_URL__";
```

`__WORKER_URL__` এর জায়গায় ধাপ ২-এ পাওয়া Worker URL বসান (শেষে `/` দেবেন না), যেমন:

```js
const WORKER_URL = "https://notes-app-worker.yourname.workers.dev";
```

---

## ধাপ ৪ — GitHub-এ পুরো প্রজেক্ট push করুন

```bash
cd mydian   # এই প্রজেক্ট ফোল্ডারে
git init
git add .
git commit -m "Initial commit — Mydian notes app"
git branch -M main
git remote add origin https://github.com/openjobsolutionbd/mydian.git
git push -u origin main
```

> নোট: `worker/` ফোল্ডারটা শুধু Worker deploy করার জন্য, Cloudflare Pages এটা
> ব্যবহার করবে না — তাই রাখলে সমস্যা নেই, চাইলে push না-ও করতে পারেন।

---

## ধাপ ৫ — Cloudflare Pages-এ repo connect করুন

1. Cloudflare Dashboard → **Workers & Pages → Create → Pages → Connect to Git**
2. `openjobsolutionbd/mydian` repo বেছে নিন
3. Build settings:
   - **Framework preset:** None
   - **Build command:** (ফাঁকা রাখুন)
   - **Build output directory:** `/`
4. **Save and Deploy**

কিছুক্ষণের মধ্যে একটা URL পাবেন (যেমন `mydian.pages.dev`) — এটাই আপনার অ্যাপের লিংক।

---

## ধাপ ৬ — প্রথমবার অ্যাপ খুলুন

1. Cloudflare Pages URL-এ যান
2. ধাপ ২-এ ঠিক করা PIN দিয়ে লগইন করুন
3. জিজ্ঞেস করবে GitHub username আর repo নাম — লিখুন:
   - Owner: `openjobsolutionbd`
   - Repo: `mydian`
4. মোবাইলে "Add to Home Screen" করে PWA হিসেবে ইনস্টল করে নিন

---

## গুরুত্বপূর্ণ নোট

- **নোট ফাইল কোথায় রাখব?** `vault/` ফোল্ডারের ভেতরে রাখাই ভালো (কোড থেকে আলাদা থাকবে) — অ্যাপ থেকে নতুন ফাইল বানানোর সময় `vault/আমার-নোট.md` এভাবে path দিলেই হবে।
- **প্রতিটা সেভ একটা commit।** তাই GitHub-এ পুরো এডিট হিস্ট্রি জমা থাকবে — চাইলে যেকোনো সময় পুরোনো ভার্সনে ফিরে যেতে পারবেন (GitHub-এর commit history থেকে)।
- **PIN ভুলে গেলে?** `wrangler secret put APP_PIN` আবার চালিয়ে নতুন PIN সেট করতে পারবেন।
- **একাধিক ডিভাইস।** প্রতিটা ডিভাইসে শুধু Cloudflare Pages URL খুলে PIN দিয়ে লগইন করলেই হবে — token কখনো device-এ যায় না, তাই কোনো ঝুঁকি নেই।
