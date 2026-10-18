export function unwrapDetails(md: string): string {
  const pattern = /<details\b[^>]*>\s*<summary\b[^>]*>([\s\S]*?)<\/summary\b[^>]*>([\s\S]*?)<\/details\b[^>]*>/gi;
  return md.replace(pattern, (_match, summary: string, body: string) => {
    const label = summary.replace(/<[^>]*>/g, "").trim();
    return `**${label}**\n\n${body.trim()}`;
  });
}

interface MdNode {
  type: string;
  value?: string;
  url?: string;
  children?: MdNode[];
}

const REF_PATTERN = /#[1-9]\d*|[0-9a-f]{40}/giu;
const WORD_CHAR = /[A-Za-z0-9_]/u;
const COMMIT_PREFIX = /[\s([{]/u;
const SKIP_NODE = new Set([
  "code",
  "inlineCode",
  "link",
  "linkReference",
  "image",
  "imageReference",
  "html",
  "definition",
]);

function prLinkNode(matched: string, base: string): MdNode {
  if (matched.startsWith("#")) {
    return {
      type: "link",
      url: `${base}/issues/${matched.slice(1)}`,
      children: [{ type: "text", value: matched }],
    };
  }
  return {
    type: "link",
    url: `${base}/commit/${matched}`,
    children: [{ type: "text", value: matched.slice(0, 7) }],
  };
}

function splitRefText(value: string, base: string): MdNode[] {
  const out: MdNode[] = [];
  const pattern = new RegExp(REF_PATTERN.source, REF_PATTERN.flags);
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(value)) !== null) {
    const matched = match[0];
    const before = value[match.index - 1];
    const after = value[match.index + matched.length];
    const beforeOk =
      before === undefined ||
      (matched.startsWith("#") ? !WORD_CHAR.test(before) : COMMIT_PREFIX.test(before));
    const afterOk = after === undefined || !WORD_CHAR.test(after);
    if (!beforeOk || !afterOk) continue;
    if (match.index > cursor) out.push({ type: "text", value: value.slice(cursor, match.index) });
    out.push(prLinkNode(matched, base));
    cursor = match.index + matched.length;
  }
  if (cursor === 0) return [{ type: "text", value }];
  if (cursor < value.length) out.push({ type: "text", value: value.slice(cursor) });
  return out;
}

function autolinkChildren(parent: MdNode, base: string): void {
  if (!parent.children) return;
  const next: MdNode[] = [];
  for (const child of parent.children) {
    if (child.type === "text" && typeof child.value === "string") {
      next.push(...splitRefText(child.value, base));
    } else {
      if (!SKIP_NODE.has(child.type)) autolinkChildren(child, base);
      next.push(child);
    }
  }
  parent.children = next;
}

/**
 * GitHub-style same-repo references for PR prose: `#123` links to the issue,
 * a 40-hex SHA links short to the commit. Code spans, raw HTML, and authored
 * links stay untouched.
 */
export function remarkPrAutolinks(options: { repositoryUrl: string }) {
  const base = options.repositoryUrl.replace(/\/+$/u, "");
  return (tree: MdNode) => {
    autolinkChildren(tree, base);
  };
}
