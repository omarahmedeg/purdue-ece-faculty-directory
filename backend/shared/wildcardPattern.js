/**
 * Turn a glob-style pattern into a RegExp:
 * - * → any run of characters (including empty)
 * - ? → exactly one character
 * All other regex metacharacters are escaped so they match literally.
 */
export function wildcardQueryToRegex(query) {
  const q = typeof query === "string" ? query : "";
  if (!q.trim()) {
    return /(?!)/;
  }
  let source = "";
  for (let i = 0; i < q.length; i++) {
    const c = q[i];
    if (c === "*") {
      source += ".*";
    } else if (c === "?") {
      source += ".";
    } else if (/[.^$+()[\]{}|\\]/.test(c)) {
      source += "\\" + c;
    } else {
      source += c;
    }
  }
  try {
    return new RegExp(source, "i");
  } catch {
    return /(?!)/;
  }
}

