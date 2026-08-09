#!/usr/bin/env bash
# sw.js-এর BUILD_ID স্বয়ংক্রিয়ভাবে আপডেট করে — বর্তমান তারিখ + git commit hash
# (short) দিয়ে। প্রতিবার deploy/push করার আগে এই স্ক্রিপ্টটা চালালেই যথেষ্ট,
# BUILD_ID হাতে বদলানোর দরকার নেই।
#
# ব্যবহার: bash scripts/bump-build-id.sh
# (এটা commit করার আগে চালাতে হবে, যাতে নতুন BUILD_ID-ও commit-এ যায়)

set -euo pipefail
cd "$(dirname "$0")/.."

# তারিখ + সময় (মিনিট পর্যন্ত) দিয়ে সবসময় ইউনিক একটা আইডি হয় —
# git hash ব্যবহার করা হয়নি, কারণ commit-এর আগে/পরে চালানো নিয়ে
# hash mismatch হওয়ার ঝামেলা এড়াতে।
NEW_ID=$(date +%Y-%m-%d-%H%M)

sed -i.bak -E "s/const BUILD_ID = \"[^\"]*\"/const BUILD_ID = \"${NEW_ID}\"/" sw.js
rm -f sw.js.bak

echo "BUILD_ID → ${NEW_ID}"
