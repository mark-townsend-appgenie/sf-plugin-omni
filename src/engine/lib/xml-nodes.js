'use strict';

function findMarkupEnd(xml, start) {
  let quote = null;
  for (let i = start + 1; i < xml.length; i++) {
    const ch = xml[i];
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '>') {
      return i + 1;
    }
  }
  throw new Error(`Unterminated XML markup at position ${start}`);
}

function skipSpecialMarkup(xml, start) {
  const forms = [
    ['<!--', '-->'],
    ['<![CDATA[', ']]>'],
    ['<?', '?>'],
    ['<!DOCTYPE', '>'],
  ];
  for (const [begin, end] of forms) {
    if (xml.startsWith(begin, start)) {
      // DOCTYPE may contain an internal subset; scan it while respecting quotes and brackets.
      if (begin === '<!DOCTYPE') {
        let quote = null;
        let subsetDepth = 0;
        for (let i = start + begin.length; i < xml.length; i++) {
          const ch = xml[i];
          if (quote) {
            if (ch === quote) quote = null;
          } else if (ch === '"' || ch === "'") {
            quote = ch;
          } else if (ch === '[') {
            subsetDepth++;
          } else if (ch === ']') {
            subsetDepth = Math.max(0, subsetDepth - 1);
          } else if (ch === '>' && subsetDepth === 0) {
            return i + 1;
          }
        }
        throw new Error(`Unterminated XML section beginning at position ${start}`);
      }
      const at = xml.indexOf(end, start + begin.length);
      if (at < 0) throw new Error(`Unterminated XML section beginning at position ${start}`);
      return at + end.length;
    }
  }
  return null;
}

function parseTag(xml, start, end) {
  const raw = xml.slice(start, end);
  const match = raw.match(/^<\s*(\/?)\s*([A-Za-z_][\w:.-]*)\b([\s\S]*?)>$/);
  if (!match) return null;
  const closing = match[1] === '/';
  const selfClosing = !closing && /\/\s*>$/.test(raw);
  return { closing, qname: match[2], selfClosing };
}

/**
 * Reformat element-only XML content by placing child elements on their own lines.
 * Text payloads are never rewritten. Parents containing non-whitespace direct text
 * (mixed content) are left untouched to avoid changing meaningful whitespace.
 */
function formatXmlNodes(xml, indent = '  ') {
  const stack = [];
  const edits = [];
  let i = 0;

  function recordChild(child) {
    const parent = stack[stack.length - 1];
    if (parent) parent.children.push(child);
  }

  while (i < xml.length) {
    const start = xml.indexOf('<', i);
    if (start < 0) break;
    const specialEnd = skipSpecialMarkup(xml, start);
    if (specialEnd !== null) {
      i = specialEnd;
      continue;
    }
    const end = findMarkupEnd(xml, start);
    const tag = parseTag(xml, start, end);
    i = end;
    if (!tag) continue;

    if (tag.closing) {
      const frame = stack.pop();
      if (!frame || frame.qname !== tag.qname) {
        // Leave malformed/unmatched structure for the existing component/XML validation path.
        if (frame) stack.push(frame);
        continue;
      }
      if (frame.children.length > 0) {
        const gaps = [];
        let cursor = frame.contentStart;
        for (const child of frame.children) {
          gaps.push({ start: cursor, end: child.start, text: xml.slice(cursor, child.start), depth: frame.depth + 1 });
          cursor = child.end;
        }
        gaps.push({ start: cursor, end: start, text: xml.slice(cursor, start), depth: frame.depth });
        if (gaps.every((gap) => /^\s*$/.test(gap.text))) {
          for (const gap of gaps) {
            const replacement = `\n${indent.repeat(gap.depth)}`;
            if (gap.text !== replacement) edits.push({ start: gap.start, end: gap.end, replacement });
          }
        }
      }
      recordChild({ start: frame.start, end, qname: frame.qname });
      continue;
    }

    if (tag.selfClosing) {
      recordChild({ start, end, qname: tag.qname });
      continue;
    }

    stack.push({
      qname: tag.qname,
      start,
      contentStart: end,
      depth: stack.length,
      children: [],
    });
  }

  let result = xml;
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    result = result.slice(0, edit.start) + edit.replacement + result.slice(edit.end);
  }
  return result;
}

module.exports = { formatXmlNodes };
