'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { formatJsonLexically, validateJson, decodeXmlEntities } = require('../src/engine/lib/lexical-json');
const { rootElementName, findTargetRanges } = require('../src/engine/lib/xml-targets');
const { formatXml, components } = require('../src/engine/omni-format');
const { discoverMetadataFiles, planFormatting, applyFormatting } = require('../src/engine/file-operations');

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
const result = formatXml(xml).formatted;
assert.ok(result.includes('<name>unchanged</name>'));
assert.ok(result.includes('<!-- <propertySetConfig>{bad}</propertySetConfig> -->'));
assert.ok(result.includes('&quot;n&quot;: 12.0'));
assert.equal(formatXml(result).formatted, result, 'XML formatting is idempotent');

const ranges = findTargetRanges('<x><propertySetConfig>{}</propertySetConfig><z><![CDATA[<propertySetConfig>]]></z></x>', ['propertySetConfig']);
assert.equal(ranges.length, 1, 'CDATA and target-looking text inside it are ignored');
const untouched = '<OmniInteractionConfig><value>anything</value></OmniInteractionConfig>';
assert.equal(formatXml(untouched).formatted, untouched, 'pass-through component is unchanged');
const outOfScope = '<OmniDataTransform><expectedInputJson>{&quot;a&quot;:1,&quot;b&quot;:2}</expectedInputJson></OmniDataTransform>';
assert.equal(formatXml(outOfScope).formatted, outOfScope, 'only propertySetConfig and elementTypeComponentMapping are in scope');
const cardXml = '<OmniUiCard><propertySetConfig>{&quot;a&quot;:1,&quot;b&quot;:2}</propertySetConfig><dataSourceConfig>{&quot;c&quot;:3,&quot;d&quot;:4}</dataSourceConfig></OmniUiCard>';
const cardFormatted = formatXml(cardXml).formatted;
assert.ok(cardFormatted.includes('<propertySetConfig>{\n  &quot;a&quot;: 1,\n  &quot;b&quot;: 2\n}</propertySetConfig>'));
assert.ok(cardFormatted.includes('<dataSourceConfig>{&quot;c&quot;:3,&quot;d&quot;:4}</dataSourceConfig>'), 'non-allowlisted card fields remain unchanged');
assert.throws(() => formatXml('<Unknown><x/></Unknown>'), /Unsupported XML root/);
assert.throws(() => formatJsonLexically('{&quot;bad&quot;:}'), /Invalid embedded JSON/);
assert.equal(decodeXmlEntities('&amp;quot;'), '&quot;', 'entity decoding does not double-decode');
assert.ok(components.length >= 13, 'expected metadata handlers are registered');

// Fixture regression: the supplied retrieved OmniScript must be parseable and idempotent.
const fixture = fs.readFileSync(path.join(__dirname, 'BaseDiscoveryFramework.xml'), 'utf8');
const fixtureResult = formatXml(fixture).formatted;
assert.equal(formatXml(fixtureResult).formatted, fixtureResult, 'real metadata fixture is idempotent');
assert.match(fixtureResult, /12\.0|0\.0|255\.0/, 'numeric lexical forms remain present');

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
  const plans = planFormatting(discovered);
  assert.equal(plans.length, 1);
  assert.equal(plans[0].changed, true);
  assert.ok(fs.readFileSync(needsFormat, 'utf8').includes('&quot;a&quot;:1'), 'planning does not modify input');
  assert.equal(applyFormatting(plans), 1);
  const after = fs.readFileSync(needsFormat, 'utf8');
  assert.ok(after.includes('&quot;a&quot;: 1'));
  assert.equal(planFormatting([needsFormat])[0].changed, false, 'formatted file is now clean');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

// The core has no dependencies on the Salesforce CLI runtime; this suite runs offline.
console.log('All formatter engine tests passed.');
