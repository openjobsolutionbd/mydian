#!/usr/bin/env bash
# প্রতিবার push করার আগে চালানোর জন্য চেক-আপ স্ক্রিপ্ট।
# ব্যবহার: bash scripts/verify.sh
# সব ঠিক থাকলে exit code 0, কোনো সমস্যা থাকলে exit code 1 (এবং কোথায়
# সমস্যা তা দেখাবে) — non-zero exit code পেলে push করা উচিত না, আগে
# সমস্যাটা ঠিক করতে হবে।

set -euo pipefail
cd "$(dirname "$0")/.."
python3 scripts/verify.py
