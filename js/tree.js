// tree.js — GitHub-এর flat file list কে nested tree structure বানায়

export function buildTree(flatFiles) {
  const root = { name: "", path: "", type: "folder", children: {} };

  for (const file of flatFiles) {
    const parts = file.path.split("/");
    let node = root;
    let currentPath = "";

    parts.forEach((part, idx) => {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isLast = idx === parts.length - 1;

      if (isLast) {
        node.children[part] = {
          name: part,
          path: currentPath,
          type: "file",
          sha: file.sha,
          size: file.size,
        };
      } else {
        if (!node.children[part]) {
          node.children[part] = {
            name: part,
            path: currentPath,
            type: "folder",
            children: {},
          };
        }
        node = node.children[part];
      }
    });
  }

  return root;
}

// object-of-children কে sorted array-তে রূপান্তর (folder আগে, তারপর file, দুটোই a-z)
// .gitkeep ফাইল বাদ দেওয়া হয় — এটা শুধু GitHub-এ খালি ফোল্ডার রাখার কৌশল হিসেবে
// তৈরি হয়, ইউজারকে দেখানোর কোনো কারণ নেই।
export function sortedEntries(node) {
  const entries = Object.values(node.children || {}).filter(
    (n) => n.name !== ".gitkeep"
  );
  return entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name, "bn");
  });
}

export function fileExt(name) {
  const idx = name.lastIndexOf(".");
  return idx === -1 ? "" : name.slice(idx + 1).toLowerCase();
}

export function isMarkdown(name) {
  return fileExt(name) === "md";
}

export function isImage(name) {
  return ["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(fileExt(name));
}

export function isPdf(name) {
  return fileExt(name) === "pdf";
}
