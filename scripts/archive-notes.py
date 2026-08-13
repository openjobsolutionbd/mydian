#!/usr/bin/env python3
"""
archive-notes.py — PROJECT_NOTES.md-এর "০. সর্বশেষ অবস্থা" সেকশনে সর্বোচ্চ
৩টা commit-এন্ট্রি রাখে; তার বেশি জমলে পুরনোগুলো স্বয়ংক্রিয়ভাবে HISTORY.md-এর
"পুরনো সর্বশেষ অবস্থা" সেকশনের উপরে (নতুন-থেকে-পুরনো ক্রম বজায় রেখে) সরিয়ে
দেয়। উদ্দেশ্য: PROJECT_NOTES.md ছোট রাখা — প্রতি সেশনে এই ফাইলটা পুরো পড়তে
হয়, তাই এটা বড় হতে থাকলে প্রতিটা কাজের টোকেন-খরচ চুপচাপ বাড়তেই থাকে।

ব্যবহার: python3 scripts/archive-notes.py
(এটা bump-build-id.sh-এর মতোই commit করার আগে চালাতে হবে — verify.sh-এর
অংশ হিসেবে স্বয়ংক্রিয়ভাবে চলে, আলাদা করে মনে রাখার দরকার নেই)।

এন্ট্রি-বাউন্ডারি ধরা হয় "**সর্বশেষ commit (...):**" বা
"**তার আগের commit (...):**" দিয়ে শুরু হওয়া লাইন থেকে — পরের একই-প্যাটার্নের
লাইন বা সেকশনের শেষের italic নোট প্যারাগ্রাফ (*এই সেকশনে...*) পর্যন্ত।
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
NOTES_PATH = ROOT / "PROJECT_NOTES.md"
HISTORY_PATH = ROOT / "HISTORY.md"

MAX_ENTRIES = 3

SECTION_HEADER = "## ০. সর্বশেষ অবস্থা"
ENTRY_START_RE = re.compile(r"^\*\*(?:সর্বশেষ|তার আগের) commit[^\n]*\n", re.MULTILINE)
HISTORY_MARKER = '## পুরনো "সর্বশেষ অবস্থা" changelog এন্ট্রি (কালানুক্রমে, নতুন থেকে পুরনো)\n\n'


def main():
    notes = NOTES_PATH.read_text(encoding="utf-8")

    if SECTION_HEADER not in notes:
        print("সেকশন '০. সর্বশেষ অবস্থা' পাওয়া যায়নি — কিছু করা হয়নি।")
        return 0

    section_start = notes.index(SECTION_HEADER)
    # পরের "## " দিয়ে শুরু হওয়া সেকশন হেডার পর্যন্ত এই সেকশনের সীমানা
    next_section_match = re.search(r"\n## ", notes[section_start + len(SECTION_HEADER):])
    if next_section_match:
        section_end = section_start + len(SECTION_HEADER) + next_section_match.start() + 1
    else:
        section_end = len(notes)

    section_text = notes[section_start:section_end]

    # সেকশনের ভেতরে প্রতিটা এন্ট্রির শুরুর অবস্থান বের করা
    starts = [m.start() for m in ENTRY_START_RE.finditer(section_text)]

    if len(starts) <= MAX_ENTRIES:
        print(f"এখন {len(starts)}টা এন্ট্রি আছে (সীমা {MAX_ENTRIES}) — আর্কাইভ করার দরকার নেই।")
        return 0

    # প্রতিটা এন্ট্রির টেক্সট আলাদা করা (পরের এন্ট্রির শুরু পর্যন্ত, শেষটার
    # ক্ষেত্রে সেকশনের শেষ পর্যন্ত)
    entries = []
    for i, start in enumerate(starts):
        end = starts[i + 1] if i + 1 < len(starts) else len(section_text)
        entries.append(section_text[start:end])

    keep = entries[:MAX_ENTRIES]
    archive = entries[MAX_ENTRIES:]

    # label-সামঞ্জস্য: শুধু প্রথম রাখা এন্ট্রিই "সর্বশেষ commit" বলবে,
    # বাকিগুলো (যদি কোনো কারণে "সর্বশেষ" দিয়ে শুরু হয়ে থাকে) "তার আগের
    # commit"-এ বদলে দেওয়া হয় — নাহলে একাধিক এন্ট্রি নিজেদের "সর্বশেষ"
    # দাবি করলে পড়তে বিভ্রান্তিকর হবে।
    for i in range(1, len(keep)):
        keep[i] = re.sub(r"^\*\*সর্বশেষ commit", "**তার আগের commit", keep[i], count=1)

    # শেষ archived এন্ট্রির পরের non-entry অংশ (italic নোট) বের করা:
    # সেটা archive-এর শেষ উপাদানের ভেতরেই আছে যদি সেটাই section-এর শেষ
    # entry হয় — তাই archive-এর শেষ item থেকে সেই লেজটুকু আলাদা করে নিতে হবে।
    last_archived = archive[-1]
    # শেষ archived এন্ট্রির ভেতরে যদি পরের কোনো entry না থাকে (মানে এটাই
    # ছিল section-এর শেষ entry), তাহলে এর মধ্যে italic নোট প্যারাগ্রাফও
    # মিশে আছে। সেটা আলাদা করি "*এই সেকশনে" মার্কার দিয়ে খুঁজে।
    note_marker = "\n*এই সেকশনে"
    if note_marker in last_archived:
        split_idx = last_archived.index(note_marker)
        archive[-1] = last_archived[:split_idx].rstrip("\n") + "\n"
        note_tail = last_archived[split_idx:]
    else:
        note_tail = ""

    new_section = SECTION_HEADER + "\n\n" + "".join(keep).rstrip("\n") + "\n\n" + note_tail.lstrip("\n")

    new_notes = notes[:section_start] + new_section + notes[section_end:]
    NOTES_PATH.write_text(new_notes, encoding="utf-8")

    # HISTORY.md-এর মার্কারের ঠিক পরে archived এন্ট্রিগুলো (নতুন-থেকে-পুরনো
    # ক্রম বজায় রেখে) বসানো
    history = HISTORY_PATH.read_text(encoding="utf-8")
    if HISTORY_MARKER not in history:
        print("সতর্কতা: HISTORY.md-এ প্রত্যাশিত মার্কার পাওয়া যায়নি — আর্কাইভ করা এন্ট্রি"
              " নিচে দেখানো হলো, ম্যানুয়ালি বসাতে হবে:\n")
        print("".join(archive))
        return 1

    archive_block = "".join(e.rstrip("\n") + "\n" for e in archive) + "\n"
    # "তার আগের"/"সর্বশেষ" prefix HISTORY.md-এ প্রসঙ্গহীন — প্রথম archived
    # এন্ট্রিটাকে (যেটা এখন HISTORY.md-এ সবচেয়ে উপরে বসবে) সাধারণ "commit"
    # হিসেবে দেখাই, বাকিগুলো "তার আগের commit" হিসেবেই রেখে দিই (সেগুলো
    # HISTORY.md-এর ভেতরেও কালানুক্রমিক ধারাবাহিকতা বজায় রাখে)।
    archive_block = re.sub(
        r"^\*\*(?:সর্বশেষ|তার আগের) commit", "**commit", archive_block, count=1
    )

    idx = history.index(HISTORY_MARKER) + len(HISTORY_MARKER)
    new_history = history[:idx] + archive_block + history[idx:]
    HISTORY_PATH.write_text(new_history, encoding="utf-8")

    print(f"✅ {len(archive)}টা পুরনো এন্ট্রি PROJECT_NOTES.md থেকে HISTORY.md-এ সরানো হয়েছে "
          f"({len(keep)}টা এন্ট্রি PROJECT_NOTES.md-এ রয়ে গেছে)।")
    return 0


if __name__ == "__main__":
    sys.exit(main())
