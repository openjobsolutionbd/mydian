#!/usr/bin/env bash
# প্রতিবার push করার আগে চালানোর জন্য চেক-আপ স্ক্রিপ্ট।
# ব্যবহার: bash scripts/verify.sh
# সব ঠিক থাকলে exit code 0, কোনো সমস্যা থাকলে exit code 1 (এবং কোথায়
# সমস্যা তা দেখাবে) — non-zero exit code পেলে push করা উচিত না, আগে
# সমস্যাটা ঠিক করতে হবে।

set -euo pipefail
cd "$(dirname "$0")/.."

# PROJECT_NOTES.md-এর "সর্বশেষ অবস্থা" সেকশন বড় হতে থাকলে প্রতি সেশনে পড়ার
# টোকেন-খরচ চুপচাপ বাড়তে থাকে — তাই verify-এর অংশ হিসেবেই স্বয়ংক্রিয়ভাবে
# পুরনো এন্ট্রি HISTORY.md-এ সরিয়ে ছোট রাখা হয়, আলাদা করে মনে রাখতে হয় না।
python3 scripts/archive-notes.py

python3 scripts/verify.py
