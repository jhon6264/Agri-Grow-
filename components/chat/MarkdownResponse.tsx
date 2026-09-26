import { memo, useEffect, useRef, useState, type ReactNode } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { parseMarkdown, type MarkdownNode } from '@/src/chat/markdown';
import { Fonts } from '@/constants/Typography';
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import json from 'highlight.js/lib/languages/json';
import xml from 'highlight.js/lib/languages/xml';
import css from 'highlight.js/lib/languages/css';
import sql from 'highlight.js/lib/languages/sql';
import bash from 'highlight.js/lib/languages/bash';

Object.entries({ javascript, typescript, python, json, xml, css, sql, bash }).forEach(([name, language]) =>
  hljs.registerLanguage(name, language)
);
const aliases: Record<string, string> = { js: 'javascript', ts: 'typescript', html: 'xml', shell: 'bash', sh: 'bash' };

// Shared scroll offsets keep virtualized portions of one table/code block aligned.
const offsets = new Map<string, number>();
const listeners = new Map<string, Set<(x: number) => void>>();

function Horizontal({ group, children }: { group: string; children: ReactNode }) {
  const ref = useRef<ScrollView>(null);
  useEffect(() => {
    const update = (x: number) => ref.current?.scrollTo({ x, animated: false });
    const set = listeners.get(group) ?? new Set();
    set.add(update);
    listeners.set(group, set);
    return () => {
      set.delete(update);
      if (!set.size) listeners.delete(group);
    };
  }, [group]);

  return (
    <ScrollView
      horizontal
      ref={ref}
      nestedScrollEnabled
      contentOffset={{ x: offsets.get(group) ?? 0, y: 0 }}
      onScroll={(event) => {
        const x = event.nativeEvent.contentOffset.x;
        if (Math.abs((offsets.get(group) ?? 0) - x) < 1) return;
        offsets.set(group, x);
        if (offsets.size > 100) offsets.delete(offsets.keys().next().value!);
        listeners.get(group)?.forEach((fn) => fn(x));
      }}
      scrollEventThrottle={32}>
      {children}
    </ScrollView>
  );
}

const decode = (value: string) =>
  value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&');

function highlight(code: string, language: string): ReactNode {
  const lang = aliases[language] ?? language;
  if (!hljs.getLanguage(lang) || code.length > 12000) return code;
  const html = hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
  const colors: Record<string, string> = {
    keyword: '#8250A0',
    string: '#237B4B',
    number: '#A25821',
    comment: '#717B76',
    title: '#2455A5',
    attr: '#8250A0',
    built_in: '#2455A5',
  };
  const stack: string[] = [];
  return html.split(/(<span class="[^"]+">|<\/span>)/g).map((part, i) => {
    if (part.startsWith('<span')) {
      stack.push(part.match(/hljs-([a-z_]+)/)?.[1] ?? '');
      return null;
    }
    if (part === '</span>') {
      stack.pop();
      return null;
    }
    return <Text key={i} style={{ color: colors[stack[stack.length - 1]] ?? '#24332A' }}>{decode(part)}</Text>;
  });
}

function Code({ node }: { node: MarkdownNode }) {
  const [copied, setCopied] = useState(false);
  const language = node.info.trim().split(/\s/)[0] || 'text';
  const full = node.fullCode ?? node.content;
  const width = Math.max(260, ...full.split('\n').map((line) => line.length * 8 + 24));
  return (
    <View style={styles.codeBox}>
      <View style={styles.codeHeader}>
        <Text style={styles.language}>{language}{node.continued ? ' · continued' : ''}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Copy code"
          onPress={() =>
            void Clipboard.setStringAsync(full)
              .then(() => setCopied(true))
              .catch(() => Alert.alert('Unable to copy code'))
          }>
          <Text style={styles.copy}>{copied ? 'Copied' : 'Copy code'}</Text>
        </Pressable>
      </View>
      <Horizontal group={node.group ?? full}>
        <Text selectable style={[styles.code, { width }]}>{highlight(node.content, language)}</Text>
      </Horizontal>
    </View>
  );
}

function inline(nodes: MarkdownNode[]): ReactNode[] {
  return nodes.map((node, index) => {
    if (node.type === 'softbreak' || node.type === 'hardbreak') return '\n';
    if (node.type === 'image') return node.content || '[Image]';
    if (node.type === 'link') {
      const href = node.attrs.href ?? '';
      return (
        <Text
          key={index}
          accessibilityRole="link"
          style={styles.link}
          onPress={() => {
            if (/^https?:\/\//i.test(href)) void Linking.openURL(href).catch(() => Alert.alert('Unable to open this link'));
          }}>
          {inline(node.children)}
        </Text>
      );
    }
    const style =
      node.type === 'strong'
        ? styles.bold
        : node.type === 'em'
        ? styles.italic
        : node.type === 's'
        ? styles.strike
        : node.type === 'code_inline'
        ? styles.inlineCode
        : undefined;
    return <Text key={index} style={style}>{node.children.length ? inline(node.children) : node.content}</Text>;
  });
}

function render(node: MarkdownNode, key: number | string): ReactNode {
  if (node.type === 'fence' || node.type === 'code_block') return <Code key={key} node={node} />;
  if (node.type === 'inline') return <Text key={key} style={styles.body}>{inline(node.children)}</Text>;

  if (node.type === 'heading') {
    const level = Number(node.tag.slice(1)) || 2;
    const content = node.children.flatMap((child) => inline(child.children));
    if (level === 1) {
      return (
        <View key={key} style={styles.h1Wrapper}>
          <Text selectable accessibilityRole="header" style={styles.h1}>
            {content}
          </Text>
        </View>
      );
    }
    if (level === 2) {
      return (
        <View key={key} style={styles.h2Wrapper}>
          <View style={styles.h2Bar} />
          <Text selectable accessibilityRole="header" style={styles.h2}>
            {content}
          </Text>
        </View>
      );
    }
    if (level === 3) {
      return (
        <View key={key} style={styles.h3Wrapper}>
          <Text selectable accessibilityRole="header" style={styles.h3}>
            {content}
          </Text>
        </View>
      );
    }
    return (
      <View key={key} style={styles.h4Wrapper}>
        <Text selectable accessibilityRole="header" style={styles.h4}>
          {content}
        </Text>
      </View>
    );
  }

  if (node.type === 'paragraph') {
    return (
      <Text key={key} selectable style={[styles.body, styles.paragraph]}>
        {node.children.flatMap((child) => inline(child.children))}
      </Text>
    );
  }

  if (node.type === 'hr') return <View key={key} style={styles.rule} />;

  if (node.type === 'bullet_list' || node.type === 'ordered_list') {
    const isBullet = node.type === 'bullet_list';
    return (
      <View key={key} style={styles.list}>
        {node.children.map((item, i) => {
          const indexNum = Number(node.attrs.start ?? 1) + i;
          return (
            <View key={i} style={styles.listRow}>
              <View style={isBullet ? styles.bulletContainer : styles.orderedBadge}>
                {isBullet ? (
                  <View style={styles.bulletDot} />
                ) : (
                  <Text style={styles.orderedNumber}>{indexNum}</Text>
                )}
              </View>
              <View style={styles.listContent}>{item.children.map(render)}</View>
            </View>
          );
        })}
      </View>
    );
  }

  if (node.type === 'blockquote') {
    return (
      <View key={key} style={styles.quote}>
        <View style={styles.quoteBar} />
        <View style={styles.quoteContent}>{node.children.map(render)}</View>
      </View>
    );
  }

  if (node.type === 'table') {
    return (
      <View key={key} style={styles.table}>
        <Horizontal group={node.group ?? String(key)}>
          <View>
            {node.children.flatMap((section) =>
              section.children.map((row, ri) => {
                const isHeader = section.type === 'thead';
                const isEven = ri % 2 === 0;
                return (
                  <View
                    key={`${section.type}-${ri}`}
                    style={[
                      styles.tableRow,
                      isHeader ? styles.tableHeader : isEven ? styles.tableRowEven : styles.tableRowOdd,
                    ]}>
                    {row.children.map((cell, ci) => (
                      <View key={ci} style={[styles.cell, { width: node.widths?.[ci] ?? 155 }]}>
                        <Text
                          selectable
                          style={[
                            styles.cellText,
                            isHeader && styles.headerCellText,
                            {
                              textAlign: cell.attrs.style?.includes('right')
                                ? 'right'
                                : cell.attrs.style?.includes('center')
                                ? 'center'
                                : 'left',
                            },
                          ]}>
                          {cell.children.flatMap((child) => inline(child.children))}
                        </Text>
                      </View>
                    ))}
                  </View>
                );
              })
            )}
          </View>
        </Horizontal>
      </View>
    );
  }

  return (
    <View key={key}>
      {node.children.length ? node.children.map(render) : <Text style={styles.body}>{node.content}</Text>}
    </View>
  );
}

export const MarkdownResponse = memo(function MarkdownResponse({
  source,
  nodes,
}: {
  source: string;
  nodes?: MarkdownNode[];
  isStreaming?: boolean;
}) {
  return <View style={styles.root}>{(nodes ?? parseMarkdown(source)).map(render)}</View>;
});

const styles = StyleSheet.create({
  root: { width: '100%' },
  body: {
    fontFamily: Fonts.sansMedium,
    color: '#192A20',
    fontSize: 17,
    lineHeight: 26,
  },
  paragraph: {
    marginVertical: 6,
  },
  bold: {
    fontFamily: Fonts.sansBold,
  },
  italic: {
    fontStyle: 'italic',
  },
  strike: {
    textDecorationLine: 'line-through',
  },
  inlineCode: {
    fontFamily: Fonts.monoMedium,
    fontSize: 15,
    backgroundColor: '#E7ECE8',
    color: '#163E26',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  link: {
    color: '#256C47',
    textDecorationLine: 'underline',
    fontFamily: Fonts.sansSemiBold,
  },
  rule: {
    height: 1,
    backgroundColor: '#D9E0DB',
    marginVertical: 14,
  },
  h1Wrapper: {
    marginTop: 16,
    marginBottom: 8,
  },
  h1: {
    fontFamily: Fonts.sansBold,
    fontSize: 24,
    lineHeight: 30,
    color: '#0F2E1B',
  },
  h2Wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 15,
    marginBottom: 7,
  },
  h2Bar: {
    width: 4,
    height: '100%',
    minHeight: 22,
    backgroundColor: '#2D8A4E',
    borderRadius: 2,
    marginRight: 9,
  },
  h2: {
    flex: 1,
    fontFamily: Fonts.sansBold,
    fontSize: 20,
    lineHeight: 27,
    color: '#16482B',
  },
  h3Wrapper: {
    marginTop: 12,
    marginBottom: 5,
  },
  h3: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 18,
    lineHeight: 25,
    color: '#1E623A',
  },
  h4Wrapper: {
    marginTop: 10,
    marginBottom: 5,
  },
  h4: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 16.5,
    lineHeight: 23,
    color: '#245D39',
  },
  list: {
    marginVertical: 5,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 7,
    gap: 10,
  },
  bulletContainer: {
    width: 22,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bulletDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#2D8A4E',
  },
  orderedBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#E5F0E7',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  orderedNumber: {
    fontFamily: Fonts.sansBold,
    fontSize: 13,
    color: '#1E5834',
    textAlign: 'center',
  },
  listContent: {
    flex: 1,
  },
  quote: {
    flexDirection: 'row',
    backgroundColor: '#F0F7F2',
    borderRadius: 9,
    marginVertical: 9,
    overflow: 'hidden',
  },
  quoteBar: {
    width: 4.5,
    backgroundColor: '#2D8A4E',
  },
  quoteContent: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  codeBox: {
    backgroundColor: '#ECF0ED',
    borderRadius: 10,
    overflow: 'hidden',
    marginVertical: 9,
    borderWidth: 1,
    borderColor: '#D7DFD9',
  },
  codeHeader: {
    paddingHorizontal: 13,
    paddingVertical: 9,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#E1E7E2',
    borderBottomWidth: 1,
    borderColor: '#D4DDD6',
  },
  language: {
    fontFamily: Fonts.monoRegular,
    fontSize: 13,
    color: '#34453A',
  },
  copy: {
    color: '#245D39',
    fontSize: 13,
    fontFamily: Fonts.sansSemiBold,
  },
  code: {
    padding: 13,
    fontFamily: Fonts.monoRegular,
    fontSize: 14,
    lineHeight: 21,
    color: '#24332A',
  },
  table: {
    borderWidth: 1,
    borderColor: '#C6D7C9',
    borderRadius: 10,
    marginVertical: 10,
    backgroundColor: '#FAFDFB',
    overflow: 'hidden',
  },
  tableRow: {
    flexDirection: 'row',
  },
  tableHeader: {
    backgroundColor: '#E2EBE4',
    borderBottomWidth: 1.5,
    borderColor: '#CBD9CE',
  },
  tableRowEven: {
    backgroundColor: '#FFFFFF',
  },
  tableRowOdd: {
    backgroundColor: '#F6FAF7',
  },
  cell: {
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#E2EBE3',
    justifyContent: 'center',
  },
  cellText: {
    fontFamily: Fonts.sansMedium,
    fontSize: 15.5,
    lineHeight: 22,
    color: '#1F3427',
  },
  headerCellText: {
    fontFamily: Fonts.sansBold,
    fontSize: 15,
    lineHeight: 20,
    color: '#143821',
  },
});
