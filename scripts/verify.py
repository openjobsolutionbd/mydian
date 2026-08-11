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
# ০. এই চেক-আপ স্ক্রিপ্টগুলো নিজেরাই ঠিক আছে কিনা ("test the test") —
#    verify.py-তেই যদি ভুল থাকে, বাকি সব চেক অর্থহীন হয়ে যায়।
# ============================================================
check("চেক-আপ স্ক্রিপ্ট নিজেই ঠিক আছে কিনা")
result = subprocess.run(
    [sys.executable, "-m", "py_compile", "scripts/verify.py"],
    capture_output=True, text=True,
)
if result.returncode != 0:
    fail(f"scripts/verify.py-তেই সমস্যা:\n{result.stderr.strip()}")
else:
    ok("scripts/verify.py")

for shf in glob.glob("scripts/*.sh"):
    result = subprocess.run(["bash", "-n", shf], capture_output=True, text=True)
    if result.returncode != 0:
        fail(f"{shf} — bash syntax error:\n{result.stderr.strip()}")
    else:
        ok(shf)


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
# ২. ESLint — গভীর static analysis (undefined variable, ব্যবহার না
#    হওয়া import, ইত্যাদি ধরে যা শুধু syntax check ধরে না)
# ============================================================
check("ESLint (গভীর কোড analysis)")
eslint_bin = "node_modules/.bin/eslint"
lint_targets = ["app.js", "js/api.js", "js/cache.js", "js/tree.js", "worker/worker.js"]
lint_targets = [f for f in lint_targets if os.path.isfile(f)]
if os.path.isfile(eslint_bin) and lint_targets:
    result = subprocess.run([eslint_bin, "--no-warn-ignored"] + lint_targets, capture_output=True, text=True)
    if result.returncode != 0:
        fail("ESLint সমস্যা পেয়েছে:\n" + result.stdout.strip())
    else:
        ok(f"{len(lint_targets)}টা ফাইল — কোনো undefined variable/undefined reference নেই")
else:
    print("  (ESLint ইনস্টল করা নেই — `npm install` চালিয়ে যোগ করা যায়, স্কিপ করা হলো)")


# ============================================================
# ৩. import/export মিল আছে কিনা — একটা ফাইল অন্য ফাইল থেকে যা import
#    করছে, টার্গেট ফাইলে সেটা আসলেই export করা আছে কিনা, আর path-টা
#    আদৌ resolve হয় কিনা (টাইপো করা ফাইলের নাম)। এটা গুরুত্বপূর্ণ কারণ
#    `node -c` শুধু একটা ফাইলের ভেতরের syntax দেখে — import path ভুল
#    থাকলেও (যেমন ভুল বানানে ফাইলের নাম) সেটা ধরে না, টেস্ট করে
#    নিশ্চিত হওয়া গেছে।
# ============================================================
check("Import/export মিল ও path resolution")


def get_exported_names(filepath):
    """একটা JS ফাইল থেকে সব export-করা নাম বের করে।"""
    content = open(filepath, encoding="utf-8").read()
    names = set()
    names.update(re.findall(r'export\s+(?:async\s+)?function\s+(\w+)', content))
    names.update(re.findall(r'export\s+(?:const|let|var)\s+(\w+)', content))
    names.update(re.findall(r'export\s+class\s+(\w+)', content))
    for block in re.findall(r'export\s*\{([^}]+)\}', content):
        for item in block.split(","):
            item = item.strip()
            if not item:
                continue
            # "name as alias" হলে বাইরের দুনিয়ার কাছে exported নাম হলো alias
            parts = re.split(r'\s+as\s+', item)
            names.add(parts[-1].strip())
    return names


import_export_checked = 0
import_export_failures_before = len(failures)
for src in js_files:
    if not os.path.isfile(src) or "editor.js" in src:
        continue  # editor.js third-party bundle, নিজেদের import structure না
    content = open(src, encoding="utf-8").read()
    src_dir = os.path.dirname(src)

    for m in re.finditer(r'import\s+\*\s+as\s+\w+\s+from\s+["\']([^"\']+)["\']', content):
        target = m.group(1)
        if not target.startswith("."):
            continue  # npm প্যাকেজ ইত্যাদি, স্কিপ
        resolved = os.path.normpath(os.path.join(src_dir, target))
        import_export_checked += 1
        if not os.path.isfile(resolved):
            fail(f'{src} — import path "{target}" resolve হচ্ছে না (ফাইল নেই: {resolved})')

    for m in re.finditer(r'import\s*\{([^}]+)\}\s*from\s*["\']([^"\']+)["\']', content):
        names_part, target = m.group(1), m.group(2)
        if not target.startswith("."):
            continue
        resolved = os.path.normpath(os.path.join(src_dir, target))
        import_export_checked += 1
        if not os.path.isfile(resolved):
            fail(f'{src} — import path "{target}" resolve হচ্ছে না (ফাইল নেই: {resolved})')
            continue
        exported = get_exported_names(resolved)
        for item in names_part.split(","):
            item = item.strip()
            if not item:
                continue
            # "X as Y" হলে টার্গেট ফাইলে exported নাম X (Y স্থানীয় নাম)
            parts = re.split(r'\s+as\s+', item)
            wanted = parts[0].strip()
            if wanted not in exported:
                fail(f'{src} — "{wanted}" import করা হয়েছে "{target}" থেকে, কিন্তু ওই ফাইলে এই নামে কোনো export নেই')

if import_export_checked and len(failures) == import_export_failures_before:
    ok(f"{import_export_checked}টা import statement — সব path আর নাম মিলেছে")


# ============================================================
# ৪. CSS ফাইলে brace ({/}) সংখ্যা মিলছে কিনা (basic malformed-CSS ধরা)
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
# ৫. JSON/TOML কনফিগ ফাইল আসলেই valid কিনা — একটা কমা/quote ভুল
#    থাকলেও পুরো ফাইল silently ভেঙে যেতে পারে (manifest.json ভাঙা
#    থাকলে PWA install নাও হতে পারে, wrangler.toml ভাঙা থাকলে
#    deploy-ই ব্যর্থ হবে)।
# ============================================================
check("Config ফাইল validity (JSON/TOML/YAML)")
import json

for jf in ["manifest.json", "package.json"]:
    if os.path.isfile(jf):
        try:
            json.loads(open(jf, encoding="utf-8").read())
            ok(f"{jf} — valid JSON")
        except json.JSONDecodeError as e:
            fail(f"{jf} — invalid JSON: {e}")

toml_file = "worker/wrangler.toml"
if os.path.isfile(toml_file):
    try:
        import tomllib
        with open(toml_file, "rb") as fh:
            tomllib.load(fh)
        ok(f"{toml_file} — valid TOML")
    except Exception as e:
        fail(f"{toml_file} — invalid TOML: {e}")

for yml in glob.glob(".github/workflows/*.yml") + glob.glob(".github/workflows/*.yaml"):
    try:
        import yaml
        with open(yml, encoding="utf-8") as fh:
            yaml.safe_load(fh)
        ok(f"{yml} — valid YAML")
    except ImportError:
        pass  # PyYAML না থাকলে চুপচাপ স্কিপ, বাধ্যতামূলক না
    except Exception as e:
        fail(f"{yml} — invalid YAML: {e}")


# ============================================================
# ৬. HTML ট্যাগ ঠিকমতো বন্ধ হয়েছে কিনা (malformed HTML ধরা)
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
# ৭. app.js-এ el("xxx") দিয়ে যেসব DOM id রেফারেন্স করা হয়েছে, সেগুলো
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
# ৮. পুরনো, একবার ভেঙে যাওয়া জিনিসগুলোর জন্য "canary" চেক — এই নির্দিষ্ট
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
