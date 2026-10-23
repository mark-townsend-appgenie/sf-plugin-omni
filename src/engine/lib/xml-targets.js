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
  ];
  for (const [begin, end] of forms) {
    if (xml.startsWith(begin, start)) {
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
  const qname = match[2];
  const selfClosing = !closing && /\/\s*>$/.test(raw);
  return { closing, qname, localName: qname.split(':').pop(), selfClosing };
}

function findTargetRanges(xml, targetNames) {
  const targets = new Set(targetNames);
  const stack = [];
  const ranges = [];
  let i = 0;

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
      const frame = stack[stack.length - 1];
      if (frame && frame.qname === tag.qname) {
        stack.pop();
        if (frame.target) {
          ranges.push({ start: frame.contentStart, end: start, tagName: frame.localName });
        }
      }
      continue;
    }

    if (!tag.selfClosing) {
      stack.push({
        qname: tag.qname,
        localName: tag.localName,
        target: targets.has(tag.localName),
        contentStart: end,
      });
    }
  }

  return ranges;
}

function formatXmlTargets(xml, targetNames, formatJson) {
  if (!targetNames || targetNames.length === 0) return xml;
  const ranges = findTargetRanges(xml, targetNames);
  let result = xml;

  // Replace from the end so all recorded offsets remain valid.
  for (const range of ranges.sort((a, b) => b.start - a.start)) {
    const original = result.slice(range.start, range.end);
    if (!original.trim()) continue;

    const leading = original.match(/^\s*/)[0];
    const trailing = original.match(/\s*$/)[0];
    const payload = original.slice(leading.length, original.length - trailing.length);
    if (!payload) continue;

    const formatted = formatJson(payload);
    result = result.slice(0, range.start) + leading + formatted + trailing + result.slice(range.end);
  }

  return result;
}

function rootElementName(xml) {
  let i = 0;
  while (i < xml.length) {
    const start = xml.indexOf('<', i);
    if (start < 0) return null;
    const specialEnd = skipSpecialMarkup(xml, start);
    if (specialEnd !== null) {
      i = specialEnd;
      continue;
    }
    const end = findMarkupEnd(xml, start);
    const tag = parseTag(xml, start, end);
    if (tag && !tag.closing) return tag.localName;
    i = end;
  }
  return null;
}

module.exports = { formatXmlTargets, rootElementName, findTargetRanges };
