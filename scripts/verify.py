#!/usr/bin/env python3
"""
verify.py — push করার আগে চালানোর জন্য স্বয়ংক্রিয় চেক-আপ।

উদ্দেশ্য: কোনো পরিবর্তনের পর bug যেন প্রথমেই ধরা পড়ে, ইউজার/লাইভ সাইটে
পৌঁছানোর আগে। এই প্রজেক্টে আগে যেসব bug পাওয়া গেছে (HISTORY.md সেকশন ৩
দ্রষ্টব্য) তার প্রায় সবগুলোই এমন ভুল যা এই ধরনের স্বয়ংক্রিয় চেক দিয়ে
আগেই ধরা যেত। প্রতিটা চেক ব্যর্থ হলে এই স্ক্রিপ্ট non-zero exit code
দিয়ে বন্ধ হয়ে যায় — অর্থাৎ "সব ঠিক আছে" না দেখা পর্যন্ত push করা উচিত না।

কীভাবে ব্যবহার করবেন (Claude-এর জন্য, প্রতি push-এর আগে):
    python3 scripts/verify.py
সব চেক পাস করলে "✅ সব ঠিক আছে" দেখাবে, exit code 0।
কোনো চেক ফেল করলে ঠিক কোথায় সমস্যা তা দেখিয়ে exit code 1 দেবে।
"""

import glob
import os
import re
import subprocess
import sys
from html.parser import HTMLParser

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(REPO_ROOT)

failures = []


def check(name):
    """একটা চেক শুরু হওয়ার সময় নাম প্রিন্ট করার জন্য ছোট helper।"""
    print(f"→ {name}")


def fail(msg):
    failures.append(msg)
    print(f"  ❌ {msg}")


def ok(msg):
    print(f"  ✅ {msg}")


# ============================================================
# ১. প্রতিটা JS ফাইলের syntax ঠিক আছে কিনা
# ============================================================
# গুরুত্বপূর্ণ নোট: `node -c file.js` সরাসরি চালালে কিছু নির্দিষ্ট
# ক্ষেত্রে (যেমন ফাইলের একদম শেষে অসম্পূর্ণ bracket/function) ES module
# সিনট্যাক্সযুক্ত (.js, import/export আছে) ফাইলে ভুল ধরতে ব্যর্থ হয় —
# টেস্ট করে এটা পাওয়া গেছে। `.mjs` extension জোর করে ব্যবহার করলে node
# নির্ভরযোগ্যভাবে strict ES module parsing করে, তাই প্রতিটা ফাইল একটা
# temp `.mjs` কপিতে চেক করা হচ্ছে।
import shutil
import tempfile

check("JavaScript syntax")
js_files = ["app.js"] + glob.glob("js/*.js") + glob.glob("worker/*.js") + glob.glob("scripts/*.js")
tmp_dir = tempfile.mkdtemp(prefix="mydian-verify-")
try:
    for f in js_files:
        if not os.path.isfile(f):
            continue
        tmp_path = os.path.join(tmp_dir, os.path.basename(f).rsplit(".", 1)[0] + ".mjs")
        shutil.copy(f, tmp_path)
        result = subprocess.run(["node", "-c", tmp_path], capture_output=True, text=True)
        if result.returncode != 0:
            err = result.stderr.replace(tmp_path, f).strip()
            fail(f"{f} — syntax error:\n{err}")
        else:
            ok(f)
finally:
    shutil.rmtree(tmp_dir, ignore_errors=True)


# ============================================================
# ২. CSS ফাইলে brace ({/}) সংখ্যা মিলছে কিনা (basic malformed-CSS ধরা)
# ============================================================
check("CSS brace balance (style.css)")
if os.path.isfile("style.css"):
    css = open("style.css", encoding="utf-8").read()
    open_count = css.count("{")
    close_count = css.count("}")
    if open_count != close_count:
        fail(f"style.css — {{ }} সংখ্যা মিলছে না ({{ = {open_count}, }} = {close_count})")
    else:
        ok(f"style.css ({open_count} rule block)")


# ============================================================
# ৩. HTML ট্যাগ ঠিকমতো বন্ধ হয়েছে কিনা (malformed HTML ধরা)
# ============================================================
check("HTML structure (index.html)")

VOID_TAGS = {"area", "base", "br", "col", "embed", "hr", "img", "input",
             "link", "meta", "param", "source", "track", "wbr"}


class BalanceChecker(HTMLParser):
    def __init__(self):
        super().__init__()
        self.stack = []
        self.errors = []

    def handle_starttag(self, tag, attrs):
        if tag not in VOID_TAGS:
            self.stack.append(tag)

    def handle_startendtag(self, tag, attrs):
        pass  # self-closing (<tag />), কোনো সমস্যা না

    def handle_endtag(self, tag):
        if tag in VOID_TAGS:
            return
        if not self.stack:
            self.errors.append(f"অতিরিক্ত বন্ধনী </{tag}> — কোনো খোলা ট্যাগ নেই")
            return
        if self.stack[-1] == tag:
            self.stack.pop()
        elif tag in self.stack:
            # ভুল ক্রমে বন্ধ হয়েছে, কিন্তু কোথাও না কোথাও আছে
            self.errors.append(f"ট্যাগ ক্রম ঠিক নেই: </{tag}> এর আগে <{self.stack[-1]}> বন্ধ হয়নি")
            while self.stack and self.stack[-1] != tag:
                self.stack.pop()
            if self.stack:
                self.stack.pop()
        # অজানা/mismatched tag হলে নীরবে ignore — HTML parser অনেক edge
        # case-এ false positive দেয়, তাই শুধু স্পষ্ট ভুলগুলোই ধরা হচ্ছে


if os.path.isfile("index.html"):
    html_content = open("index.html", encoding="utf-8").read()
    parser = BalanceChecker()
    parser.feed(html_content)
    if parser.errors:
        for e in parser.errors:
            fail(f"index.html — {e}")
    elif parser.stack:
        fail(f"index.html — এই ট্যাগগুলো বন্ধ হয়নি: {', '.join(parser.stack)}")
    else:
        ok("index.html")


# ============================================================
# ৪. app.js-এ el("xxx") দিয়ে যেসব DOM id রেফারেন্স করা হয়েছে, সেগুলো
#    আসলেই index.html-এ আছে কিনা — এটাই সবচেয়ে সাধারণ bug-এর কারণ:
#    কোনো এলিমেন্টের id বদলানো/মোছা হলে JS-এ রেফারেন্স করা থেকে যায়,
#    আর app সাইলেন্টলি ভেঙে যায় (কোনো error console-এ নাও দেখা যেতে পারে)।
# ============================================================
check("DOM id references (app.js ↔ index.html)")
if os.path.isfile("app.js") and os.path.isfile("index.html"):
    app_js = open("app.js", encoding="utf-8").read()
    html_content = open("index.html", encoding="utf-8").read()

    referenced_ids = set(re.findall(r'el\(\s*["\']([\w-]+)["\']\s*\)', app_js))
    html_ids = set(re.findall(r'\bid=["\']([\w-]+)["\']', html_content))

    missing = referenced_ids - html_ids
    if missing:
        for mid in sorted(missing):
            fail(f'app.js-এ el("{mid}") আছে, কিন্তু index.html-এ id="{mid}" নেই')
    else:
        ok(f"{len(referenced_ids)}টা id রেফারেন্স, সবগুলো index.html-এ আছে")


# ============================================================
# ৫. পুরনো, একবার ভেঙে যাওয়া জিনিসগুলোর জন্য "canary" চেক — এই নির্দিষ্ট
#    জায়গাগুলো আগে একবার ভেঙেছিল বলে এখানে বাড়তি সতর্কতা রাখা হলো।
# ============================================================
check("পুরনো bug-এর জায়গায় regression চেক")

if os.path.isfile("style.css"):
    css = open("style.css", encoding="utf-8").read()
    if re.search(r'\[hidden\]\s*\{[^}]*display:\s*none\s*!important', css):
        ok("[hidden] { display: none !important; } এখনো ঠিক আছে (একাধিক স্ক্রিন একসাথে দেখানোর bug এখান থেকেই হয়েছিল)")
    else:
        fail("[hidden] { display: none !important; } রুলটা style.css-এ পাওয়া যাচ্ছে না — আগে এটা সরানোর কারণে একাধিক স্ক্রিন একসাথে দেখা যেত")

if os.path.isfile("js/api.js"):
    api_js = open("js/api.js", encoding="utf-8").read()
    m = re.search(r'WORKER_URL\s*=\s*["\']([^"\']*)["\']', api_js)
    if m:
        url = m.group(1)
        if "workers.dev" in url or url.startswith("https://"):
            ok(f"WORKER_URL বাস্তব URL দেখাচ্ছে ({url[:50]}...)")
        else:
            fail(f"WORKER_URL সন্দেহজনক দেখাচ্ছে (placeholder থেকে গেছে কিনা চেক করুন): {url}")
    else:
        fail("js/api.js-এ WORKER_URL খুঁজে পাওয়া যায়নি")

if os.path.isfile("js/editor.js"):
    size_kb = os.path.getsize("js/editor.js") / 1024
    if size_kb > 700:
        fail(f"js/editor.js হঠাৎ বড় হয়ে গেছে ({size_kb:.0f}KB) — accidentally unminified সোর্স বসে যায়নি তো?")
    else:
        ok(f"js/editor.js সাইজ স্বাভাবিক ({size_kb:.0f}KB, minified)")


# ============================================================
# ফলাফল
# ============================================================
print()
if failures:
    print(f"❌ {len(failures)}টা সমস্যা পাওয়া গেছে — এগুলো ঠিক না করে push করা উচিত না।")
    sys.exit(1)
else:
    print("✅ সব ঠিক আছে — push করা নিরাপদ।")
    sys.exit(0)
