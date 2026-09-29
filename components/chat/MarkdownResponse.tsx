import { memo, useEffect, useRef, useState, type ReactNode } from 'react';
import { Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Clipboard from 'expo-clipboard';
import { AppIcon } from '@/components/chat/AppIcon';
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
import java from 'highlight.js/lib/languages/java';
import cpp from 'highlight.js/lib/languages/cpp';
import c from 'highlight.js/lib/languages/c';
import csharp from 'highlight.js/lib/languages/csharp';
import kotlin from 'highlight.js/lib/languages/kotlin';
import dart from 'highlight.js/lib/languages/dart';
import php from 'highlight.js/lib/languages/php';

Object.entries({
  javascript, typescript, python, json, xml, css, sql, bash,
  java, cpp, c, csharp, kotlin, dart, php,
}).forEach(([name, language]) =>
  hljs.registerLanguage(name, language)
);
const aliases: Record<string, string> = {
  js: 'javascript', ts: 'typescript', html: 'xml', shell: 'bash', sh: 'bash',
  py: 'python', cs: 'csharp', kt: 'kotlin', 'c++': 'cpp',
};

// Shared scroll offsets keep virtualized portions of one table/code block aligned.
const offsets = new Map<string, number>();
const listeners = new Map<string, Set<(x: number) => void>>();

function Horizontal({ group, children, isTable }: { group: string; children: ReactNode; isTable?: boolean }) {
  const ref = useRef<ScrollView>(null);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const contentWidthRef = useRef(0);
  const containerWidthRef = useRef(0);

  const checkScroll = (x: number, containerW = containerWidthRef.current, contentW = contentWidthRef.current) => {
    if (!isTable || containerW <= 0 || contentW <= 0) return;
    setCanScrollLeft(x > 6);
    setCanScrollRight(contentW > containerW + 4 && x + containerW < contentW - 6);
  };
  useEffect(() => {
    const update = (x: number) => {
      ref.current?.scrollTo({ x, animated: false });
      checkScroll(x);
    };
    const set = listeners.get(group) ?? new Set();
    set.add(update);
    listeners.set(group, set);
    return () => {
      set.delete(update);
      if (!set.size) listeners.delete(group);
    };
  }, [group]);

  return (
    <View style={styles.horizontalWrapper}>
      <ScrollView
        horizontal
        ref={ref}
        nestedScrollEnabled
        showsHorizontalScrollIndicator={true}
        persistentScrollbar={Platform.OS === 'android'}
        contentOffset={{ x: offsets.get(group) ?? 0, y: 0 }}
        onLayout={(e) => {
          containerWidthRef.current = e.nativeEvent.layout.width;
          checkScroll(offsets.get(group) ?? 0);
        }}
        onContentSizeChange={(w) => {
          contentWidthRef.current = w;
          checkScroll(offsets.get(group) ?? 0);
        }}
      onScroll={(event) => {
        const x = event.nativeEvent.contentOffset.x;
        checkScroll(x);
        if (Math.abs((offsets.get(group) ?? 0) - x) < 1) return;
        offsets.set(group, x);
        if (offsets.size > 100) offsets.delete(offsets.keys().next().value!);
        listeners.get(group)?.forEach((fn) => fn(x));
      }}
      scrollEventThrottle={32}>
      {children}
    </ScrollView>
      {isTable && canScrollLeft && (
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(250, 253, 251, 0.95)', 'rgba(250, 253, 251, 0)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.tableScrollLeftFade}
        />
      )}
      {isTable && canScrollRight && (
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(250, 253, 251, 0)', 'rgba(250, 253, 251, 0.95)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.tableScrollRightFade}
        />
      )}
    </View>
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
    keyword: '#C678DD',
    string: '#98C379',
    number: '#D19A66',
    comment: '#7F848E',
    title: '#61AFEF',
    attr: '#E5C07B',
    built_in: '#56B6C2',
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
    const color = colors[stack[stack.length - 1]];
    const isComment = stack[stack.length - 1] === 'comment';
    return (
      <Text
        key={i}
        style={{
          color: color ?? '#E6EDF3',
          fontStyle: isComment ? 'italic' : 'normal',
        }}>
        {decode(part)}
      </Text>
    );
  });
}

function Code({ node }: { node: MarkdownNode }) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const language = node.info.trim().split(/\s/)[0] || 'code';
  const full = node.fullCode ?? node.content;
  const width = Math.max(260, ...full.split('\n').map((line) => line.length * 8 + 28));

  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  const handleCopy = async () => {
    try {
      await Clipboard.setStringAsync(full);
      setCopied(true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      Alert.alert('Unable to copy code');
    }
  };

  return (
    <View style={styles.codeBox}>
      <View style={styles.codeHeader}>
        <Text style={styles.language}>{language}{node.continued ? ' · continued' : ''}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Copy code"
          onPress={() => void handleCopy()}
          style={({ pressed }) => [styles.copyButton, pressed && styles.copyButtonPressed]}>
          <AppIcon
            name={copied ? { ios: 'checkmark', android: 'check', web: 'check' } : { ios: 'doc.on.doc', android: 'content_copy', web: 'content_copy' }}
            fallback={copied ? '✓' : '⧉'}
            color={copied ? '#98C379' : '#B4B4B4'}
            size={13}
          />
          <Text style={[styles.copy, copied && styles.copied]}>{copied ? 'Copied!' : 'Copy code'}</Text>
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
        <Horizontal group={node.group ?? String(key)} isTable>
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
                      <View key={ci} style={[styles.cell, { width: node.widths?.[ci] ?? (ci === 0 ? 38 : 100) }]}>
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
    fontSize: 14.5,
    backgroundColor: '#EBEBEB',
    color: '#1E1E1E',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
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
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    overflow: 'hidden',
    marginVertical: 10,
    borderWidth: 1,
    borderColor: '#333333',
  },
  codeHeader: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#282828',
    borderBottomWidth: 1,
    borderColor: '#333333',
  },
  language: {
    fontFamily: Fonts.monoRegular,
    fontSize: 12,
    color: '#B4B4B4',
    textTransform: 'lowercase',
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  copyButtonPressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  copy: {
    color: '#B4B4B4',
    fontSize: 12,
    fontFamily: Fonts.sansMedium,
  },
  copied: {
    color: '#98C379',
  },
  code: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: Fonts.monoRegular,
    fontSize: 13.5,
    lineHeight: 20,
    color: '#E6EDF3',
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
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#E2EBE3',
    justifyContent: 'center',
  },
  cellText: {
    fontFamily: Fonts.sansMedium,
    fontSize: 14,
    lineHeight: 20,
    color: '#1F3427',
  },
  headerCellText: {
    fontFamily: Fonts.sansBold,
    fontSize: 14,
    lineHeight: 19,
    color: '#143821',
  },
  horizontalWrapper: {
    position: 'relative',
    width: '100%',
  },
  tableScrollLeftFade: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 20,
    zIndex: 2,
  },
  tableScrollRightFade: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 20,
    zIndex: 2,
  },
});
