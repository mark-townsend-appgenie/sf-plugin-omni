#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { formatJsonLexically } = require('./lib/lexical-json');
const { formatXmlTargets, rootElementName } = require('./lib/xml-targets');
const { formatXmlNodes, detectLineEnding, resolveIndent } = require('./lib/xml-nodes');

const componentDir = path.join(__dirname, 'components');
const components = fs.readdirSync(componentDir)
  .filter((name) => name.endsWith('.js'))
  .sort()
  .map((name) => ({ file: name, discoverySuffixes: [], optionalTargetTags: [], ...require(path.join(componentDir, name)) }));

function isPassThrough(component) {
  return component.targetTags.length === 0 && component.optionalTargetTags.length === 0;
}

function getComponent(xml) {
  const root = rootElementName(xml);
  const component = components.find((candidate) => candidate.rootNames.includes(root));
  if (!component) {
    const supported = [...new Set(components.flatMap((item) => item.rootNames))].sort();
    throw new Error(`Unsupported XML root <${root || '(unknown)'}>. Supported roots: ${supported.join(', ')}`);
  }
  return component;
}

function formatXml(xml, options = {}) {
  const component = getComponent(xml);
  const expand = options.expand || 'node';
  if (!['node', 'all'].includes(expand)) throw new Error(`Unsupported expand mode '${expand}'. Expected 'node' or 'all'.`);
  const indent = resolveIndent(options.indent, xml);
  // New line breaks follow the file's existing line ending so CRLF files stay CRLF.
  const eol = detectLineEnding(xml);
  const nodeFormatted = formatXmlNodes(xml, { indent, eol });
  if (expand !== 'all') return { formatted: nodeFormatted, component, expand };

  const formatJson = (payload) => formatJsonLexically(payload, undefined, eol);
  // Required targets must hold valid JSON; invalid content stops the run. Check
  // the original text first so reported line numbers match the file on disk.
  formatXmlTargets(xml, component.targetTags, formatJson);
  const strict = formatXmlTargets(nodeFormatted, component.targetTags, formatJson);
  // Optional targets (sample/preview payloads) are expanded only when valid JSON.
  const formatted = formatXmlTargets(strict, component.optionalTargetTags, (payload) => {
    try {
      return formatJson(payload);
    } catch {
      return payload;
    }
  });
  return { formatted, component, expand };
}

function usage() {
  console.log(
    'Usage: node omni-format.js [--expand node|all] [--indent 4|2|tab|preserve] <file.xml>\n' +
    '       cat file.xml | node omni-format.js [--expand node|all] [--indent 4|2|tab|preserve]\n' +
    '       node omni-format.js --list-types\n\n' +
    'Default mode reformats element-only XML structure while preserving text payloads.\n' +
    '--expand all also pretty-prints approved embedded JSON fields.\n' +
    '--indent sets the XML element indent (default 4 spaces, matching Salesforce retrieves).'
  );
}

function listTypes() {
  for (const component of components) {
    const targets = component.targetTags.length ? component.targetTags.join(', ') : '(none)';
    const optional = component.optionalTargetTags.length ? component.optionalTargetTags.join(', ') : '(none)';
    const scan = component.discoverySuffixes.length ? component.discoverySuffixes.join(', ') : 'no (format by explicit file path)';
    console.log(`${component.componentName}${isPassThrough(component) ? ' (pass-through)' : ''}\n  roots: ${component.rootNames.join(', ')}\n  targets: ${targets}\n  optional targets (only if valid JSON): ${optional}\n  folder scan: ${scan}\n  file: src/engine/components/${component.file}`);
  }
}

function takeOption(args, name) {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  args.splice(index, 2);
  return value;
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) return usage();
  if (args.includes('--list-types')) return listTypes();

  const expand = takeOption(args, '--expand') ?? 'node';
  if (!['node', 'all'].includes(expand)) {
    console.error('Error: --expand must be either node or all.');
    process.exitCode = 1;
    return;
  }
  const indent = takeOption(args, '--indent');
  const files = args.filter((arg) => !arg.startsWith('-'));
  if (files.length > 1) {
    console.error('Error: provide one input file at a time.');
    process.exitCode = 1;
    return;
  }

  if (files.length === 0) {
    let input = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { input += chunk; });
    process.stdin.on('end', () => {
      try {
        const { formatted, component } = formatXml(input, { expand, indent });
        process.stdout.write(formatted);
        if (isPassThrough(component)) {
          console.error(`Note: ${component.componentName} is currently configured as pass-through.`);
        }
      } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exitCode = 1;
      }
    });
    return;
  }

  const inputPath = path.resolve(files[0]);
  try {
    const original = fs.readFileSync(inputPath, 'utf8');
    let formatted;
    let component;
    try {
      ({ formatted, component } = formatXml(original, { expand, indent }));
    } catch (error) {
      throw new Error(`${inputPath}: ${error.message}`);
    }
    if (formatted === original) {
      console.error(`No changes: ${component.componentName}`);
      return;
    }

    const stat = fs.statSync(inputPath);
    const tempPath = `${inputPath}.${process.pid}.tmp`;
    try {
      fs.writeFileSync(tempPath, formatted, { encoding: 'utf8', mode: stat.mode });
      fs.chmodSync(tempPath, stat.mode);
      fs.renameSync(tempPath, inputPath);
    } catch (error) {
      try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch { /* keep original error */ }
      throw error;
    }
    console.error(`Formatted ${path.basename(inputPath)} (${component.componentName})`);
    if (isPassThrough(component)) {
      console.error('Note: this component is pass-through until JSON fields are explicitly approved.');
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();
module.exports = { formatXml, getComponent, components, isPassThrough };
