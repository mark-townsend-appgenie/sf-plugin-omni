'use strict';

const DEFAULT_INDENT = '    ';

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

function lineAndColumn(xml, position) {
  const before = xml.slice(0, position);
  const line = before.split('\n').length;
  return `line ${line}, column ${position - before.lastIndexOf('\n')}`;
}

function countLineEndings(text) {
  const crlf = (text.match(/\r\n/g) || []).length;
  return { crlf, lf: (text.match(/\n/g) || []).length - crlf };
}

/**
 * Return the newline sequence the file predominantly uses between elements, so
 * new line breaks match the existing file rather than introducing mixed endings.
 * Element layout is preferred over text payloads, which may embed their own LF
 * line breaks (for example pretty-printed JSON in a CRLF file).
 */
function detectLineEnding(xml) {
  const structural = (xml.match(/>\r?\n[ \t]*</g) || []).join('');
  let { crlf, lf } = countLineEndings(structural);
  if (crlf + lf === 0) ({ crlf, lf } = countLineEndings(xml));
  return crlf > 0 && crlf >= lf ? '\r\n' : '\n';
}

/**
 * Return the indent unit used by the file's element lines: a tab, or the
 * smallest positive run of leading spaces. Falls back to Salesforce's 4 spaces.
 */
function detectIndent(xml) {
  let smallest = 0;
  for (const match of xml.matchAll(/\n([ \t]+)</g)) {
    const leading = match[1];
    if (leading[0] === '\t') return '\t';
    if (!smallest || leading.length < smallest) smallest = leading.length;
  }
  return smallest ? ' '.repeat(smallest) : DEFAULT_INDENT;
}

/**
 * Resolve an --indent option: a space count (1-8), 'tab', or 'preserve'.
 */
function resolveIndent(option, xml) {
  if (option === undefined || option === null || option === '') return DEFAULT_INDENT;
  const value = String(option).toLowerCase();
  if (value === 'tab') return '\t';
  if (value === 'preserve') return detectIndent(xml);
  if (/^[1-8]$/.test(value)) return ' '.repeat(Number(value));
  throw new Error(`Unsupported indent '${option}'. Expected a number of spaces (1-8), 'tab', or 'preserve'.`);
}

/**
 * Reformat element-only XML content by placing child elements on their own lines.
 * Text payloads are never rewritten. Parents containing non-whitespace direct text
 * (mixed content) are left untouched to avoid changing meaningful whitespace.
 * Mismatched, stray, or unclosed element tags are rejected rather than skipped.
 */
function formatXmlNodes(xml, options = {}) {
  const indent = options.indent ?? DEFAULT_INDENT;
  const eol = options.eol ?? detectLineEnding(xml);
  const stack = [];
  const edits = [];
  let rootClosed = false;
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
    if (!tag) throw new Error(`Malformed XML markup at ${lineAndColumn(xml, start)}`);
    i = end;

    if (tag.closing) {
      const frame = stack.pop();
      if (!frame) {
        throw new Error(`Unexpected closing tag </${tag.qname}> at ${lineAndColumn(xml, start)}`);
      }
      if (frame.qname !== tag.qname) {
        throw new Error(`Mismatched closing tag </${tag.qname}> at ${lineAndColumn(xml, start)}; expected </${frame.qname}> for the element opened at ${lineAndColumn(xml, frame.start)}`);
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
            const replacement = `${eol}${indent.repeat(gap.depth)}`;
            if (gap.text !== replacement) edits.push({ start: gap.start, end: gap.end, replacement });
          }
        }
      }
      recordChild({ start: frame.start, end, qname: frame.qname });
      if (stack.length === 0) rootClosed = true;
      continue;
    }

    if (stack.length === 0 && rootClosed) {
      throw new Error(`Unexpected second root element <${tag.qname}> at ${lineAndColumn(xml, start)}`);
    }

    if (tag.selfClosing) {
      recordChild({ start, end, qname: tag.qname });
      if (stack.length === 0) rootClosed = true;
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

  if (stack.length > 0) {
    const frame = stack[stack.length - 1];
    throw new Error(`Unclosed element <${frame.qname}> opened at ${lineAndColumn(xml, frame.start)}`);
  }

  let result = xml;
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    result = result.slice(0, edit.start) + edit.replacement + result.slice(edit.end);
  }
  return result;
}

module.exports = { formatXmlNodes, detectLineEnding, detectIndent, resolveIndent, DEFAULT_INDENT };
