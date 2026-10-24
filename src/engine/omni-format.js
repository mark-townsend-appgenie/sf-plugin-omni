#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { formatJsonLexically } = require('./lib/lexical-json');
const { formatXmlTargets, rootElementName } = require('./lib/xml-targets');
const { formatXmlNodes } = require('./lib/xml-nodes');

const componentDir = path.join(__dirname, 'components');
const components = fs.readdirSync(componentDir)
  .filter((name) => name.endsWith('.js'))
  .sort()
  .map((name) => ({ file: name, ...require(path.join(componentDir, name)) }));

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
  const nodeFormatted = formatXmlNodes(xml);
  const formatted = expand === 'all'
    ? formatXmlTargets(nodeFormatted, component.targetTags, formatJsonLexically)
    : nodeFormatted;
  return { formatted, component, expand };
}

function usage() {
  console.log(
    'Usage: node omni-format.js [--expand node|all] <file.xml>\n' +
    '       cat file.xml | node omni-format.js [--expand node|all]\n' +
    '       node omni-format.js --list-types\n\n' +
    'Default mode reformats element-only XML structure while preserving text payloads.\n' +
    '--expand all also pretty-prints approved embedded JSON fields.'
  );
}

function listTypes() {
  for (const component of components) {
    console.log(`${component.componentName}\n  roots: ${component.rootNames.join(', ')}\n  targets: ${component.targetTags.length ? component.targetTags.join(', ') : '(pass-through; no approved targets)'}\n  file: src/components/${component.file}`);
  }
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) return usage();
  if (args.includes('--list-types')) return listTypes();

  let expand = 'node';
  const expandIndex = args.indexOf('--expand');
  if (expandIndex >= 0) {
    expand = args[expandIndex + 1];
    if (!['node', 'all'].includes(expand)) {
      console.error('Error: --expand must be either node or all.');
      process.exitCode = 1;
      return;
    }
    args.splice(expandIndex, 2);
  }
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
        const { formatted, component } = formatXml(input, { expand });
        process.stdout.write(formatted);
        if (component.targetTags.length === 0) {
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
  let original;
  try {
    original = fs.readFileSync(inputPath, 'utf8');
    const { formatted, component } = formatXml(original, { expand });
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
    if (component.targetTags.length === 0) {
      console.error('Note: this component is pass-through until JSON fields are explicitly approved.');
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();
module.exports = { formatXml, getComponent, components };
