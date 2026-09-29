import MarkdownIt from 'markdown-it';
type Token = ReturnType<InstanceType<typeof MarkdownIt>['parse']>[number];

export type MarkdownNode = {
  type: string;
  tag: string;
  content: string;
  attrs: Record<string, string>;
  children: MarkdownNode[];
  map?: [number, number];
  info: string;
  group?: string;
  fullCode?: string;
  widths?: number[];
  continued?: boolean;
};

const parser = new MarkdownIt({ html: false, linkify: false, breaks: true });
const textOf = (node: MarkdownNode): string => node.content || node.children.map(textOf).join('');

export function calculateTableWidths(header?: MarkdownNode, rows: MarkdownNode[] = [], fallback?: MarkdownNode): number[] {
  const allRows = [...(header?.children ?? []), ...rows];
  const count = Math.max(0, ...allRows.map((row) => row.children.length));
  return Array.from({ length: count }, (_, col) => {
    const lens = allRows.map((row) =>
      textOf(row.children[col] ?? fallback ?? ({ content: '', children: [] } as unknown as MarkdownNode)).length
    );
    const maxLen = Math.max(1, ...lens);
    if (col === 0 && maxLen <= 3) return 38;
    if (maxLen <= 5) return 56;
    if (maxLen <= 8) return 72;
    if (maxLen <= 12) return 96;
    return Math.min(200, Math.max(70, maxLen * 7.5 + 20));
  });
}

export function tokenTree(tokens: Token[]): MarkdownNode[] {
  const roots: MarkdownNode[] = [];
  const stack: MarkdownNode[] = [];
  for (const token of tokens) {
    if (token.nesting === -1) {
      const finished = stack.pop();
      if (finished && finished.type === 'table') {
        const header = finished.children.find((node) => node.type === 'thead');
        const rows = finished.children.find((node) => node.type === 'tbody')?.children ?? [];
        finished.widths = calculateTableWidths(header, rows, finished);
      }
      continue;
    }
    const node: MarkdownNode = {
      type: token.type.replace(/_open$/, ''),
      tag: token.tag,
      content: token.content,
      attrs: Object.fromEntries((token.attrs ?? []).map(([key, value]) => [key, String(value)])),
      children: token.children ? tokenTree(token.children) : [],
      map: token.map ?? undefined,
      info: token.info,
    };
    (stack.length ? stack[stack.length - 1].children : roots).push(node);
    if (token.nesting === 1) stack.push(node);
  }
  return roots;
}

export function parseMarkdown(source: string) {
  return tokenTree(parser.parse(source, {}));
}

export function markdownSegments(source: string, messageId: string) {
  const roots = parseMarkdown(source);
  const lines = source.split('\n');
  return roots.flatMap((root, index) => {
    const group = `${messageId}:md:${index}`;
    if (root.type === 'fence' || root.type === 'code_block') {
      const codeLines = root.content.match(/[^\n]*\n|[^\n]+$/g) ?? [''];
      const blocks: MarkdownNode[] = [];
      for (let i = 0; i < codeLines.length; i += 40) {
        blocks.push({
          ...root,
          content: codeLines.slice(i, i + 40).join(''),
          group,
          fullCode: root.content,
          continued: i > 0,
        });
      }
      return blocks.map((node, i) => ({ key: `${group}:${i}`, nodes: [node], text: node.content }));
    }
    if (root.type === 'table') {
      const header = root.children.find((node) => node.type === 'thead');
      const rows = root.children.find((node) => node.type === 'tbody')?.children ?? [];
      const widths = root.widths ?? calculateTableWidths(header, rows, root);
      const chunks: { key: string; nodes: MarkdownNode[]; text: string }[] = [];
      for (let i = 0; i < Math.max(1, rows.length); i += 20) {
        const body: MarkdownNode = { ...root, type: 'tbody', children: rows.slice(i, i + 20) };
        chunks.push({
          key: `${group}:${i}`,
          nodes: [{ ...root, group, widths, children: [...(header ? [header] : []), body] }],
          text: '',
        });
      }
      return chunks;
    }
    const start = root.map?.[0] ?? 0;
    const end = roots[index + 1]?.map?.[0] ?? lines.length;
    return [{ key: group, nodes: [root], text: lines.slice(start, end).join('\n') }];
  });
}
