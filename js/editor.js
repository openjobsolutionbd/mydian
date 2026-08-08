// editor.js — CodeMirror 6 দিয়ে Notion/Obsidian-স্টাইল live-preview markdown editor
// CDN থেকে ES module import করা হচ্ছে, কোনো build step লাগছে না

import { EditorView, keymap, Decoration, ViewPlugin } from "https://esm.sh/@codemirror/view@6.34.1";
import { EditorState } from "https://esm.sh/@codemirror/state@6.4.1";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "https://esm.sh/@codemirror/commands@6.7.1";
import { markdown } from "https://esm.sh/@codemirror/lang-markdown@6.3.1?deps=@codemirror/view@6.34.1,@codemirror/state@6.4.1";
import { syntaxTree } from "https://esm.sh/@codemirror/language@6.10.6?deps=@codemirror/view@6.34.1,@codemirror/state@6.4.1";

// ---------- Live-preview decoration ----------
// লজিক: cursor যেই লাইনে নেই, সেই লাইনের markdown syntax marker (যেমন ##, **, _)
// হালকা/লুকানো দেখাবে এবং heading/bold স্টাইল প্রয়োগ হবে — অনেকটা Obsidian-এর মত।
//
// Decoration.set() নিজে থেকেই overlapping/unsorted range সামলাতে পারে (sort:true
// দিলে), তাই RangeSetBuilder-এর কড়া non-overlap শর্তে আটকে ক্র্যাশ করার
// ঝুঁকি নেই — এটা markdown-এর nested node (bold-এর ভেতরে mark ইত্যাদি)
// -এর জন্য জরুরি।

const MARK_NAMES = new Set([
  "HeaderMark",
  "EmphasisMark",
  "StrikethroughMark",
  "CodeMark",
  "LinkMark",
  "URL",
]);

function buildDecorations(view) {
  const cursorLine = view.state.doc.lineAt(view.state.selection.main.head).number;
  const tree = syntaxTree(view.state);

  const lineDecos = []; // Decoration.line — এক লাইনে একবারই যোগ করা যাবে
  const markDecos = []; // Decoration.mark / replace — একাধিক ওভারল্যাপ চলবে
  const seenLines = new Set();

  function addLineDeco(pos, cls) {
    const line = view.state.doc.lineAt(pos);
    const key = `${line.number}:${cls}`;
    if (seenLines.has(key)) return;
    seenLines.add(key);
    lineDecos.push({ from: line.from, to: line.from, deco: Decoration.line({ class: cls }) });
  }

  tree.iterate({
    enter(node) {
      const line = view.state.doc.lineAt(node.from);
      const isActiveLine = line.number === cursorLine;

      switch (node.name) {
        case "ATXHeading1":
          addLineDeco(node.from, "cm-heading1");
          break;
        case "ATXHeading2":
          addLineDeco(node.from, "cm-heading2");
          break;
        case "ATXHeading3":
        case "ATXHeading4":
        case "ATXHeading5":
        case "ATXHeading6":
          addLineDeco(node.from, "cm-heading3");
          break;
        case "StrongEmphasis":
          markDecos.push({ from: node.from, to: node.to, deco: Decoration.mark({ class: "cm-strong" }) });
          break;
        case "Emphasis":
          markDecos.push({ from: node.from, to: node.to, deco: Decoration.mark({ class: "cm-emphasis" }) });
          break;
        case "Strikethrough":
          markDecos.push({ from: node.from, to: node.to, deco: Decoration.mark({ class: "cm-strikethrough" }) });
          break;
        case "InlineCode":
          markDecos.push({ from: node.from, to: node.to, deco: Decoration.mark({ class: "cm-monospace" }) });
          break;
        case "FencedCode":
        case "CodeBlock":
          addLineDeco(node.from, "cm-monospace-block");
          break;
        case "Blockquote":
          addLineDeco(node.from, "cm-quote");
          break;
        case "ListMark":
          markDecos.push({ from: node.from, to: node.to, deco: Decoration.mark({ class: "cm-list" }) });
          break;
        case "Link":
          markDecos.push({ from: node.from, to: node.to, deco: Decoration.mark({ class: "cm-link" }) });
          break;
        default:
          break;
      }

      // syntax marker গুলো active line না হলে হালকা/লুকানো দেখাই
      if (MARK_NAMES.has(node.name) && !isActiveLine && node.to > node.from) {
        markDecos.push({ from: node.from, to: node.to, deco: Decoration.replace({}) });
      }
    },
  });

  const all = [...lineDecos, ...markDecos].filter((d) => d.to >= d.from);
  try {
    return Decoration.set(
      all.map((d) => d.deco.range(d.from, d.to)),
      true // sort — automatically handles ordering, avoids RangeSetBuilder crashes
    );
  } catch (err) {
    console.warn("Decoration build skipped:", err);
    return Decoration.none;
  }
}

const livePreviewPlugin = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.decorations = buildDecorations(view);
    }
    update(update) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations }
);

// ---------- Editor তৈরি করার প্রধান ফাংশন ----------

export function createEditor({ parent, doc, onChange }) {
  let changeTimer = null;

  const updateListener = EditorView.updateListener.of((update) => {
    if (update.docChanged) {
      clearTimeout(changeTimer);
      changeTimer = setTimeout(() => {
        onChange(update.state.doc.toString());
      }, 400);
    }
  });

  const state = EditorState.create({
    doc,
    extensions: [
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
      markdown(),
      livePreviewPlugin,
      updateListener,
      EditorView.lineWrapping,
      EditorView.theme({
        "&": { fontSize: "15.5px" },
      }),
    ],
  });

  const view = new EditorView({ state, parent });
  return view;
}

export function setEditorContent(view, content) {
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: content },
  });
}

export function destroyEditor(view) {
  if (view) view.destroy();
}
