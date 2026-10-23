'use strict';

const INDENT = '  ';

function decodeXmlEntities(text) {
  // Decode for JSON validation only. Never use the decoded text as output.
  // Decode ampersands last so an encoded literal such as &amp;quot; isn't
  // accidentally decoded twice.
  return text
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(x[0-9a-f]+|[0-9]+);/gi, (_, n) => {
      const codePoint = n[0].toLowerCase() === 'x'
        ? Number.parseInt(n.slice(1), 16)
        : Number.parseInt(n, 10);
      return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : _;
    })
    .replace(/&amp;/g, '&');
}

function validateJson(raw) {
  try {
    JSON.parse(decodeXmlEntities(raw));
  } catch (error) {
    throw new Error(`Invalid embedded JSON: ${error.message}`);
  }
}

function stringTokenEnd(raw, start) {
  const delimiter = raw.startsWith('&quot;', start) ? '&quot;' : '"';
  if (raw[start] !== '"' && delimiter !== '&quot;') {
    throw new Error(`Expected JSON string at position ${start}`);
  }

  let i = start + delimiter.length;
  let backslashes = 0;
  while (i < raw.length) {
    if (delimiter === '&quot;' && raw.startsWith('&quot;', i)) {
      if (backslashes % 2 === 0) return i + delimiter.length;
      i += delimiter.length;
      backslashes = 0;
      continue;
    }

    const ch = raw[i];
    if (delimiter === '"' && ch === '"') {
      if (backslashes % 2 === 0) return i + 1;
      i++;
      backslashes = 0;
      continue;
    }

    if (ch === '\\') backslashes++;
    else backslashes = 0;
    i++;
  }

  throw new Error(`Unterminated JSON string at position ${start}`);
}

function formatJsonLexically(raw, indent = INDENT) {
  validateJson(raw);

  let output = '';
  let i = 0;
  const stack = [];

  function markParentContent() {
    if (stack.length) stack[stack.length - 1].hasContent = true;
  }

  function newline(depth) {
    output += '\n' + indent.repeat(Math.max(0, depth));
  }

  while (i < raw.length) {
    const ch = raw[i];

    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    if (raw.startsWith('&quot;', i) || ch === '"') {
      const end = stringTokenEnd(raw, i);
      output += raw.slice(i, end);
      markParentContent();
      i = end;
      continue;
    }

    if (ch === '{' || ch === '[') {
      markParentContent();
      output += ch;
      stack.push({ open: ch, hasContent: false });
      i++;

      let next = i;
      while (next < raw.length && /\s/.test(raw[next])) next++;
      const close = ch === '{' ? '}' : ']';
      if (raw[next] !== close) newline(stack.length);
      continue;
    }

    if (ch === '}' || ch === ']') {
      const frame = stack.pop();
      const expected = ch === '}' ? '{' : '[';
      if (!frame || frame.open !== expected) {
        throw new Error(`Mismatched JSON delimiter '${ch}' at position ${i}`);
      }
      if (frame.hasContent) newline(stack.length);
      output += ch;
      i++;
      continue;
    }

    if (ch === ',') {
      output += ',';
      newline(stack.length);
      i++;
      continue;
    }

    if (ch === ':') {
      output += ': ';
      i++;
      continue;
    }

    const start = i;
    while (i < raw.length) {
      if (/\s/.test(raw[i]) || /[{}\[\],:]/.test(raw[i]) || raw[i] === '"' || raw.startsWith('&quot;', i)) break;
      i++;
    }
    if (i === start) throw new Error(`Unexpected character at position ${i}`);
    output += raw.slice(start, i); // preserve primitive tokens exactly (e.g. 12.0)
    markParentContent();
  }

  if (stack.length) throw new Error('Unclosed JSON structure');
  return output;
}

module.exports = { formatJsonLexically, validateJson, decodeXmlEntities };
