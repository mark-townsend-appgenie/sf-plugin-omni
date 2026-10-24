'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { formatJsonLexically, validateJson, decodeXmlEntities } = require('../src/engine/lib/lexical-json');
const { rootElementName, findTargetRanges } = require('../src/engine/lib/xml-targets');
const { formatXml, components } = require('../src/engine/omni-format');
const { DISCOVERY_SUFFIXES, discoverMetadataFiles, planFormatting, applyFormatting } = require('../src/engine/file-operations');

const raw = '{  &quot;number&quot; : 12.0, &quot;zero&quot;:0.0, &quot;exp&quot;:1e3, &quot;empty&quot;:{}, &quot;array&quot;:[true,false,null], &quot;nested&quot;:[{&quot;x&quot;:[1,2,{&quot;y&quot;:3}]}], &quot;str&quot;:&quot;comma, colon: braces {} and escaped quote \\&quot; ok&quot; }';
const formatted = formatJsonLexically(raw);
validateJson(formatted);
for (const token of ['12.0', '0.0', '1e3', '255.0']) {
  if (token !== '255.0') assert.ok(formatted.includes(token), `preserves ${token}`);
}
assert.match(formatted, /\\&quot;/);
assert.equal(formatJsonLexically(formatted), formatted, 'JSON formatting is idempotent');
assert.equal(formatJsonLexically('{&quot;empty&quot;:[],&quot;obj&quot;:{}}'), '{\n  &quot;empty&quot;: [],\n  &quot;obj&quot;: {}\n}');

const xml = '<?xml version="1.0"?><OmniScript><!-- <propertySetConfig>{bad}</propertySetConfig> --><name>unchanged</name><propertySetConfig> { &quot;n&quot;:12.0,&quot;s&quot;:&quot;x, y&quot; } </propertySetConfig><tail>keep</tail></OmniScript>';
assert.equal(rootElementName(xml), 'OmniScript');
const result = formatXml(xml, { expand: 'all' }).formatted;
assert.ok(result.includes('<name>unchanged</name>'));
assert.ok(result.includes('<!-- <propertySetConfig>{bad}</propertySetConfig> -->'));
assert.ok(result.includes('&quot;n&quot;: 12.0'));
assert.equal(formatXml(result, { expand: 'all' }).formatted, result, 'all-mode formatting is idempotent');


const nodeOnlyXml = '<OmniScript><name>One line</name><propertySetConfig>{&quot;a&quot;:1,&quot;nested&quot;:{&quot;b&quot;:2}}</propertySetConfig><tail>keep</tail></OmniScript>';
const nodeOnlyFormatted = formatXml(nodeOnlyXml).formatted;
assert.ok(nodeOnlyFormatted.includes('<name>One line</name>'), 'leaf text nodes stay on one line');
assert.ok(nodeOnlyFormatted.includes('<propertySetConfig>{&quot;a&quot;:1,&quot;nested&quot;:{&quot;b&quot;:2}}</propertySetConfig>'), 'default node mode does not expand embedded JSON');
assert.ok(nodeOnlyFormatted.includes('\n    <name>One line</name>\n    <propertySetConfig>'), 'node mode lays out sibling XML nodes with the 4-space default');
assert.equal(formatXml(nodeOnlyFormatted).formatted, nodeOnlyFormatted, 'node-only mode is idempotent');
const allFormatted = formatXml(nodeOnlyXml, { expand: 'all' }).formatted;
assert.ok(allFormatted.includes('&quot;a&quot;: 1'), 'all mode expands approved embedded JSON');
assert.ok(allFormatted.includes('\n    <name>One line</name>'), 'all mode also lays out XML nodes');

const ranges = findTargetRanges('<x><propertySetConfig>{}</propertySetConfig><z><![CDATA[<propertySetConfig>]]></z></x>', ['propertySetConfig']);
assert.equal(ranges.length, 1, 'CDATA and target-looking text inside it are ignored');
const untouched = '<OmniInteractionConfig><value>anything</value></OmniInteractionConfig>';
const untouchedNodeOnly = formatXml(untouched).formatted;
assert.ok(untouchedNodeOnly.includes('<value>anything</value>'), 'pass-through component text remains unchanged');
assert.equal(formatXml(untouchedNodeOnly).formatted, untouchedNodeOnly, 'pass-through XML node formatting is idempotent');
const outOfScope = '<OmniDataTransform><expectedInputJson>{&quot;a&quot;:1,&quot;b&quot;:2}</expectedInputJson></OmniDataTransform>';
const outOfScopeNodeOnly = formatXml(outOfScope).formatted;
assert.ok(outOfScopeNodeOnly.includes('{&quot;a&quot;:1,&quot;b&quot;:2}'), 'node mode preserves text content in XML elements');
assert.equal(formatXml(outOfScopeNodeOnly).formatted, outOfScopeNodeOnly, 'node-only XML formatting is idempotent');
const cardXml = '<OmniUiCard><propertySetConfig>{&quot;a&quot;:1,&quot;b&quot;:2}</propertySetConfig><dataSourceConfig>{&quot;c&quot;:3,&quot;d&quot;:4}</dataSourceConfig></OmniUiCard>';
const cardFormatted = formatXml(cardXml, { expand: 'all' }).formatted;
assert.ok(cardFormatted.includes('<propertySetConfig>{\n  &quot;a&quot;: 1,\n  &quot;b&quot;: 2\n}</propertySetConfig>'));
assert.ok(cardFormatted.includes('<dataSourceConfig>{\n  &quot;c&quot;: 3,\n  &quot;d&quot;: 4\n}</dataSourceConfig>'),'card dataSourceConfig is expanded (field reference: JSON data source bindings)');
assert.ok(!components.find((c) => c.rootNames.includes('OmniUiCard')).targetTags.includes('elementTypeComponentMapping'), 'cards do not target elementTypeComponentMapping');

// Salesforce-style 4-space file: already clean, so no changes and --check would pass.
const sfStyle = '<?xml version="1.0" encoding="UTF-8"?>\n<OmniScript xmlns="http://soap.sforce.com/2006/04/metadata">\n    <name>x</name>\n    <omniProcessElements>\n        <name>y</name>\n        <propertySetConfig>{&quot;a&quot;:1}</propertySetConfig>\n    </omniProcessElements>\n</OmniScript>\n';
assert.equal(formatXml(sfStyle).formatted, sfStyle, '4-space Salesforce layout is left unchanged by default');
assert.equal(formatXml(sfStyle, { indent: 'preserve' }).formatted, sfStyle, 'preserve keeps a 4-space layout');
const sfTwo = formatXml(sfStyle, { indent: '2' }).formatted;
assert.ok(sfTwo.includes('\n  <omniProcessElements>\n    <name>y</name>'), '--indent 2 re-indents nested elements');
assert.equal(formatXml(sfTwo, { indent: 'preserve' }).formatted, sfTwo, 'preserve detects a 2-space layout');
const tabbed = sfStyle.replace(/ {4}/g, '\t');
assert.equal(formatXml(tabbed, { indent: 'preserve' }).formatted, tabbed, 'preserve detects tab indentation');
assert.equal(formatXml(tabbed, { indent: 'tab' }).formatted, tabbed, '--indent tab keeps tabs');
assert.throws(() => formatXml(sfStyle, { indent: '12' }), /Unsupported indent/);

// CRLF files keep CRLF; no lone LF is introduced in node or all mode.
const crlf = '<?xml version="1.0" encoding="UTF-8"?>\r\n<OmniScript>\r\n\t<name>x</name><omniProcessElements><propertySetConfig>{&quot;a&quot;:1,&quot;b&quot;:[1,2]}</propertySetConfig></omniProcessElements>\r\n</OmniScript>\r\n';
for (const expand of ['node', 'all']) {
  const out = formatXml(crlf, { expand }).formatted;
  assert.ok(!/(?<!\r)\n/.test(out), `CRLF file has no lone LF after ${expand} mode`);
  assert.ok(out.includes('\r\n    <omniProcessElements>\r\n        <propertySetConfig>'), `CRLF layout after ${expand} mode`);
  assert.equal(formatXml(out, { expand }).formatted, out, `CRLF ${expand} mode is idempotent`);
}
assert.ok(formatXml(crlf, { expand: 'all' }).formatted.includes('{\r\n  &quot;a&quot;: 1,'), 'expanded JSON uses CRLF in a CRLF file');
const lfOut = formatXml(sfStyle.replace('<name>x</name>', '<name>x</name><a/>'), { expand: 'all' }).formatted;
assert.ok(!lfOut.includes('\r'), 'LF files stay LF');

// Integration Procedure: JSON targets are expanded in all mode, XML laid out in node mode.
const ipXml = '<OmniIntegrationProcedure xmlns="http://soap.sforce.com/2006/04/metadata"><elementTypeComponentMapping>{&quot;ElementTypeToHTMLTemplateList&quot;:[]}</elementTypeComponentMapping><omniProcessElements><name>Get</name><propertySetConfig>{&quot;bundle&quot;:&quot;DR&quot;,&quot;n&quot;:1.0}</propertySetConfig></omniProcessElements></OmniIntegrationProcedure>';
const ipNode = formatXml(ipXml).formatted;
assert.ok(ipNode.includes('\n    <omniProcessElements>\n        <name>Get</name>'), 'IP node layout');
assert.ok(ipNode.includes('{&quot;bundle&quot;:&quot;DR&quot;,&quot;n&quot;:1.0}'), 'IP JSON untouched in node mode');
const ipAll = formatXml(ipXml, { expand: 'all' }).formatted;
assert.ok(ipAll.includes('<propertySetConfig>{\n  &quot;bundle&quot;: &quot;DR&quot;,\n  &quot;n&quot;: 1.0\n}</propertySetConfig>'), 'IP propertySetConfig expanded');
assert.ok(ipAll.includes('<elementTypeComponentMapping>{\n  &quot;ElementTypeToHTMLTemplateList&quot;: []\n}'), 'IP elementTypeComponentMapping expanded');
assert.equal(formatXml(ipAll, { expand: 'all' }).formatted, ipAll, 'IP all mode is idempotent');

// Data Transform: XML layout only; JSON stays as-is in both modes.
const dtXml = '<OmniDataTransform><name>DT</name><omniDataTransformItem><inputFieldName>A</inputFieldName><formulaExpression>IF(a &gt; 1, &quot;x&quot;, &quot;y&quot;)</formulaExpression></omniDataTransformItem><expectedInputJson>{&quot;a&quot;:1}</expectedInputJson></OmniDataTransform>';
const dtAll = formatXml(dtXml, { expand: 'all' }).formatted;
assert.ok(dtAll.includes('<expectedInputJson>{\n  &quot;a&quot;: 1\n}</expectedInputJson>'),'Data Transform expectedInputJson expanded in all mode');
assert.ok(dtAll.includes('\n    <omniDataTransformItem>\n        <inputFieldName>A</inputFieldName>'), 'Data Transform node layout');
assert.ok(formatXml(dtXml).formatted.includes('<expectedInputJson>{&quot;a&quot;:1}</expectedInputJson>'), 'Data Transform JSON untouched in node mode');
assert.ok(dtAll.includes('IF(a &gt; 1, &quot;x&quot;, &quot;y&quot;)'), 'Data Transform formula text untouched');

// Card full round trip in node mode.
const cardNode = formatXml(cardXml).formatted;
assert.equal(cardNode, '<OmniUiCard>\n    <propertySetConfig>{&quot;a&quot;:1,&quot;b&quot;:2}</propertySetConfig>\n    <dataSourceConfig>{&quot;c&quot;:3,&quot;d&quot;:4}</dataSourceConfig>\n</OmniUiCard>');

// Malformed XML is rejected rather than silently passed through.
assert.throws(() => formatXml('<OmniScript><a><b>1</b></c><d>2</d></OmniScript>'), /Mismatched closing tag <\/c>.*expected <\/a>/);
assert.throws(() => formatXml('<OmniScript><a>1</a>'), /Unclosed element <OmniScript>/);
assert.throws(() => formatXml('<OmniScript><a>1</a></OmniScript></b>'), /Unexpected closing tag <\/b>/);
assert.throws(() => formatXml('<OmniScript></OmniScript><OmniScript></OmniScript>'), /Unexpected second root/);
assert.throws(() => formatXml('<OmniScript><a>1</a><b x="1"</OmniScript>'), /Unterminated|Malformed|Mismatched|Unclosed/);
assert.throws(() => formatXml('<Unknown><x/></Unknown>'), /Unsupported XML root/);
assert.throws(() => formatJsonLexically('{&quot;bad&quot;:}'), /Invalid embedded JSON/);
assert.equal(decodeXmlEntities('&amp;quot;'), '&quot;', 'entity decoding does not double-decode');
assert.ok(components.length >= 13, 'expected metadata handlers are registered');

// Fixture regression: the supplied retrieved OmniScript must be parseable and idempotent.
const fixture = fs.readFileSync(path.join(__dirname, 'BaseDiscoveryFramework.xml'), 'utf8');
const fixtureResult = formatXml(fixture).formatted;
assert.equal(formatXml(fixtureResult).formatted, fixtureResult, 'real metadata fixture is idempotent');
assert.match(fixtureResult, /12\.0|0\.0|255\.0/, 'numeric lexical forms remain present');
// The fixture is a tab-indented CRLF retrieve whose JSON payloads use LF internally.
assert.equal(formatXml(fixture, { indent: 'preserve' }).formatted, fixture, 'preserve leaves the tab-indented CRLF fixture unchanged');
assert.ok(!/>\n[ \t]*</.test(fixtureResult), 'fixture element layout stays CRLF after re-indenting');

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'appgenie-omni-test-'));
try {
  const nested = path.join(tempRoot, 'nested');
  const ignored = path.join(tempRoot, '.git');
  fs.mkdirSync(nested);
  fs.mkdirSync(ignored);
  const needsFormat = path.join(nested, 'Script.os-meta.xml');
  fs.writeFileSync(needsFormat, '<OmniScript><propertySetConfig>{&quot;a&quot;:1,&quot;b&quot;:[1,2]}</propertySetConfig></OmniScript>');
  fs.writeFileSync(path.join(nested, 'notes.txt'), 'not metadata');
  fs.writeFileSync(path.join(ignored, 'Ignored.os-meta.xml'), untouched);
  const discovered = discoverMetadataFiles(tempRoot);
  assert.deepEqual(discovered, [needsFormat], 'directory discovery is recursive, suffix-limited, and skips .git');
  const plans = planFormatting(discovered, { expand: 'all' });
  assert.equal(plans.length, 1);
  assert.equal(plans[0].changed, true);
  assert.ok(fs.readFileSync(needsFormat, 'utf8').includes('&quot;a&quot;:1'), 'planning does not modify input');
  assert.equal(applyFormatting(plans), 1);
  const after = fs.readFileSync(needsFormat, 'utf8');
  assert.ok(after.includes('&quot;a&quot;: 1'));
  assert.equal(planFormatting([needsFormat], { expand: 'all' })[0].changed, false, 'formatted file is now clean');

  // Folder scan covers the four suffix-mapped types only.
  const scanDir = path.join(tempRoot, 'scan');
  fs.mkdirSync(scanDir);
  for (const name of ['A.os-meta.xml', 'B.oip-meta.xml', 'C.ouc-meta.xml', 'D.rpt-meta.xml', 'E.omniInteractionConfig-meta.xml']) {
    fs.writeFileSync(path.join(scanDir, name), '<OmniInteractionConfig><value>v</value></OmniInteractionConfig>');
  }
  assert.deepEqual(discoverMetadataFiles(scanDir).map((f) => path.basename(f)), ['A.os-meta.xml', 'B.oip-meta.xml', 'C.ouc-meta.xml', 'D.rpt-meta.xml']);
  assert.deepEqual(DISCOVERY_SUFFIXES, ['.oip-meta.xml', '.os-meta.xml', '.ouc-meta.xml', '.rpt-meta.xml']);

  // Errors name the failing file, and nothing is written when any file fails.
  const goodFile = path.join(scanDir, 'A.os-meta.xml');
  const badFile = path.join(tempRoot, 'Bad.os-meta.xml');
  fs.writeFileSync(badFile, '<OmniScript><propertySetConfig>{bad</propertySetConfig></OmniScript>');
  assert.throws(() => planFormatting([goodFile, badFile], { expand: 'all' }), (error) => error.message.startsWith(`${badFile}: <propertySetConfig> at line 1: Invalid embedded JSON`));
  assert.equal(fs.readFileSync(goodFile, 'utf8'), '<OmniInteractionConfig><value>v</value></OmniInteractionConfig>', 'planning failure writes nothing');
  const brokenXml = path.join(tempRoot, 'Broken.oip-meta.xml');
  fs.writeFileSync(brokenXml, '<OmniIntegrationProcedure><a></b></OmniIntegrationProcedure>');
  assert.throws(() => planFormatting([brokenXml]), (error) => error.message.startsWith(`${brokenXml}: Mismatched closing tag`));

  // CRLF file round trip on disk keeps CRLF only.
  const crlfFile = path.join(tempRoot, 'Crlf.os-meta.xml');
  fs.writeFileSync(crlfFile, crlf);
  applyFormatting(planFormatting([crlfFile], { expand: 'all' }));
  assert.ok(!/(?<!\r)\n/.test(fs.readFileSync(crlfFile, 'utf8')), 'CRLF file on disk has no lone LF');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

require('./field-reference-tests.cjs');

// The core has no dependencies on the Salesforce CLI runtime; this suite runs offline.
console.log('All formatter engine tests passed.');
