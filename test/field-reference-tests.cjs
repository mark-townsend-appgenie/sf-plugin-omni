'use strict';
// Field-reference conformance tests for OmniUiCard and OmniDataTransform.
//
// Field lists follow the Salesforce field reference for each type:
//   https://developer.salesforce.com/docs/platform/field-reference/references/field-reference/salesforce-field-reference-omniuicard.html
//   https://developer.salesforce.com/docs/platform/field-reference/references/field-reference/salesforce-field-reference-omnidatatransform.html
// The fixtures (AccountSummaryCard.ouc-meta.xml, AccountExtract.rpt-meta.xml) are
// hand-built to that schema; they are not retrieved from an org.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { formatXml, components } = require('../src/engine/omni-format');
const { decodeXmlEntities } = require('../src/engine/lib/lexical-json');
const { discoverMetadataFiles, planFormatting } = require('../src/engine/file-operations');

const SPEC = {
  OmniUiCard: {
    fields: ['authorName', 'dataSourceConfig', 'isActive', 'name', 'omniUiCardType', 'propertySetConfig', 'sampleDataSourceResponse', 'stylingConfiguration', 'versionNumber'],
    optionalFields: ['stylingConfiguration'],
    requiredJson: ['propertySetConfig', 'dataSourceConfig'],
    optionalJson: ['stylingConfiguration', 'sampleDataSourceResponse'],
  },
  OmniDataTransform: {
    fields: ['active', 'assignmentRulesUsed', 'deletedOnSuccess', 'description', 'errorIgnored', 'expectedInputJson', 'expectedOutputJson', 'fieldLevelSecurityEnabled', 'inputType', 'isManagedUsingStdDesigner', 'name', 'nullInputsIncludedInOutput', 'omniDataTransformItem', 'outputType', 'previewJsonData', 'processSuperBulk', 'responseCacheTtlMinutes', 'responseCacheType', 'rollbackOnError', 'sourceObject', 'sourceObjectDefault', 'synchronousProcessThreshold', 'targetOutputFileName', 'type', 'uniqueName', 'versionNumber', 'xmlDeclarationRemoved'],
    optionalFields: ['description', 'expectedInputJson', 'expectedOutputJson', 'isManagedUsingStdDesigner', 'previewJsonData', 'responseCacheType', 'targetOutputFileName'],
    itemFields: ['defaultValue', 'disabled', 'filterDataType', 'filterGroup', 'formulaConverted', 'formulaExpression', 'filterOperator', 'filterValue', 'formulaResultPath', 'formulaSequence', 'globalKey', 'inputFieldName', 'inputObjectName', 'inputObjectQuerySequence', 'linkedObjectSequence', 'migrationValue', 'name', 'outputCreationSequence', 'outputFieldFormat', 'outputFieldName', 'outputObjectName', 'requiredForUpsert', 'transformValuesMappings', 'upsertKey'],
    optionalItemFields: ['defaultValue', 'filterDataType', 'formulaConverted', 'formulaExpression', 'filterOperator', 'filterValue', 'formulaResultPath', 'formulaSequence', 'inputFieldName', 'inputObjectName', 'migrationValue', 'outputFieldFormat', 'transformValuesMappings'],
    requiredJson: [],
    optionalJson: ['expectedInputJson', 'expectedOutputJson', 'previewJsonData'],
  },
};

const read = (name) => fs.readFileSync(path.join(__dirname, name), 'utf8');
const cardFixture = read('AccountSummaryCard.ouc-meta.xml');
const dtFixture = read('AccountExtract.rpt-meta.xml');

// Leaf elements (text-only) in document order.
function leaves(xml) {
  return [...xml.matchAll(/<([A-Za-z_][\w.-]*)>([^<]*)<\/\1>/g)].map(([, tag, text]) => ({ tag, text }));
}

// Direct child element names of the root, or of each element named `parent`.
function childNames(xml, parent) {
  const blocks = parent
    ? [...xml.matchAll(new RegExp(`<${parent}>([\\s\\S]*?)</${parent}>`, 'g'))].map((m) => m[1])
    : [xml.replace(/^[\s\S]*?<[A-Za-z]\w*[^>]*>/, '').replace(/<\/[A-Za-z]\w*>\s*$/, '')];
  return blocks.map((block) => {
    const names = [];
    let depth = 0;
    for (const [, close, name, selfClose] of block.matchAll(/<(\/?)([A-Za-z_][\w.-]*)[^>]*?(\/?)>/g)) {
      if (close) depth--;
      else {
        if (depth === 0) names.push(name);
        if (!selfClose) depth++;
      }
    }
    return names;
  });
}

const parseEmbedded = (text) => JSON.parse(decodeXmlEntities(text));

function assertOnlyTargetsChanged(original, formatted, targets, label) {
  const before = leaves(original);
  const after = leaves(formatted);
  assert.equal(after.length, before.length, `${label}: same number of leaf elements`);
  before.forEach((leaf, i) => {
    assert.equal(after[i].tag, leaf.tag, `${label}: element order preserved at ${leaf.tag}`);
    if (targets.includes(leaf.tag)) {
      assert.deepEqual(parseEmbedded(after[i].text), parseEmbedded(leaf.text), `${label}: <${leaf.tag}> JSON is semantically unchanged`);
    } else {
      assert.equal(after[i].text, leaf.text, `${label}: <${leaf.tag}> text is byte-identical`);
    }
  });
}

const card = components.find((c) => c.rootNames.includes('OmniUiCard'));
const dt = components.find((c) => c.rootNames.includes('OmniDataTransform'));

// 1. The component registry matches the field reference.
for (const [component, spec, label] of [[card, SPEC.OmniUiCard, 'OmniUiCard'], [dt, SPEC.OmniDataTransform, 'OmniDataTransform']]) {
  assert.deepEqual([...component.targetTags].sort(), [...spec.requiredJson].sort(), `${label}: required JSON targets match the field reference`);
  assert.deepEqual([...component.optionalTargetTags].sort(), [...spec.optionalJson].sort(), `${label}: optional JSON targets match the field reference`);
  for (const tag of [...component.targetTags, ...component.optionalTargetTags]) {
    assert.ok(spec.fields.includes(tag), `${label}: target <${tag}> is a documented field`);
  }
}
assert.ok(!card.targetTags.includes('elementTypeComponentMapping') && !card.optionalTargetTags.includes('elementTypeComponentMapping'), 'OmniUiCard has no elementTypeComponentMapping field');
assert.ok(!dt.optionalTargetTags.includes('transformValuesMappings'), 'transformValuesMappings is outside the formatter contract');
assert.ok(!dt.optionalTargetTags.some((tag) => tag.startsWith('formula')), 'formula fields are never treated as JSON');

// 2. The fixtures are faithful to the field reference.
const [cardChildren] = childNames(cardFixture);
assert.deepEqual(cardChildren, [...SPEC.OmniUiCard.fields], 'card fixture has every OmniUiCard field, in reference order');
const [dtChildren] = childNames(dtFixture);
for (const name of dtChildren) assert.ok(SPEC.OmniDataTransform.fields.includes(name), `<${name}> is a documented OmniDataTransform field`);
for (const name of SPEC.OmniDataTransform.fields) {
  if (!SPEC.OmniDataTransform.optionalFields.includes(name) && !['responseCacheType', 'targetOutputFileName'].includes(name)) {
    assert.ok(dtChildren.includes(name), `data transform fixture includes required field <${name}>`);
  }
}
for (const item of childNames(dtFixture, 'omniDataTransformItem')) {
  for (const name of item) assert.ok(SPEC.OmniDataTransform.itemFields.includes(name), `<${name}> is a documented omniDataTransformItem field`);
  for (const name of SPEC.OmniDataTransform.itemFields) {
    if (!SPEC.OmniDataTransform.optionalItemFields.includes(name)) assert.ok(item.includes(name), `omniDataTransformItem includes required field <${name}>`);
  }
}

// 3. OmniUiCard: node mode is a no-op on a clean 4-space file; all mode expands
//    exactly the four JSON fields and nothing else.
assert.equal(formatXml(cardFixture).formatted, cardFixture, 'card fixture is already clean in node mode');
const cardAll = formatXml(cardFixture, { expand: 'all' }).formatted;
assertOnlyTargetsChanged(cardFixture, cardAll, [...SPEC.OmniUiCard.requiredJson, ...SPEC.OmniUiCard.optionalJson], 'card all mode');
for (const tag of [...SPEC.OmniUiCard.requiredJson, ...SPEC.OmniUiCard.optionalJson]) {
  assert.match(cardAll, new RegExp(`<${tag}>\\{\\n  &quot;`), `card <${tag}> is expanded`);
}
assert.ok(cardAll.includes('&quot;AnnualRevenue&quot;: 1250000.00'), 'card sample numeric spelling preserved');
assert.ok(cardAll.includes('&quot;mergeField&quot;: &quot;%3Cdiv%3E{Name}%3C/div%3E&quot;'), 'card merge-field string token preserved');
assert.ok(cardAll.includes('&quot;customStyles&quot;: &quot;.card-header { padding: 0.5rem; }&quot;'), 'braces inside styling string tokens are not expanded');
assert.equal(formatXml(cardAll, { expand: 'all' }).formatted, cardAll, 'card all mode is idempotent');
assert.equal(formatXml(cardAll).formatted, cardAll, 'node mode leaves an expanded card unchanged');

// 4. OmniUiCard required JSON fields reject invalid JSON and name the field.
for (const tag of SPEC.OmniUiCard.requiredJson) {
  const broken = cardFixture.replace(new RegExp(`<${tag}>[^<]*</${tag}>`), `<${tag}>{&quot;broken&quot;:</${tag}>`);
  assert.throws(() => formatXml(broken, { expand: 'all' }), new RegExp(`<${tag}> at line \\d+: Invalid embedded JSON`), `invalid <${tag}> is rejected with the field name`);
  assert.doesNotThrow(() => formatXml(broken), `node mode does not parse <${tag}>`);
}

// 5. OmniUiCard optional fields: absent, empty, or non-JSON content is left as-is.
const withoutStyling = cardFixture.replace(/\s*<stylingConfiguration>[^<]*<\/stylingConfiguration>/, '');
assert.ok(!formatXml(withoutStyling, { expand: 'all' }).formatted.includes('stylingConfiguration'), 'stylingConfiguration is optional');
for (const [tag, content] of [
  ['stylingConfiguration', ''],
  ['stylingConfiguration', '.slds-card { color: red; }'],
  ['sampleDataSourceResponse', ''],
  ['sampleDataSourceResponse', 'Sample data not captured'],
  ['sampleDataSourceResponse', '{&quot;truncated&quot;:'],
]) {
  const variant = cardFixture.replace(new RegExp(`<${tag}>[^<]*</${tag}>`), `<${tag}>${content}</${tag}>`);
  const out = formatXml(variant, { expand: 'all' }).formatted;
  assert.ok(out.includes(`<${tag}>${content}</${tag}>`), `non-JSON <${tag}> '${content}' is left unchanged`);
  assert.match(out, /<dataSourceConfig>\{\n {2}&quot;/, `required fields still expand when <${tag}> is not JSON`);
}

// 6. A field outside the reference is never treated as JSON on a card.
const cardWithExtra = cardFixture.replace('<versionNumber>', '<elementTypeComponentMapping>{&quot;a&quot;:1}</elementTypeComponentMapping>\n    <versionNumber>');
assert.ok(formatXml(cardWithExtra, { expand: 'all' }).formatted.includes('<elementTypeComponentMapping>{&quot;a&quot;:1}</elementTypeComponentMapping>'), 'undocumented card field is untouched');

// 7. OmniDataTransform: node mode is a no-op; all mode expands only the three
//    sample/preview JSON fields. Formula and mapping text is never touched.
assert.equal(formatXml(dtFixture).formatted, dtFixture, 'data transform fixture is already clean in node mode');
const dtAll = formatXml(dtFixture, { expand: 'all' }).formatted;
assertOnlyTargetsChanged(dtFixture, dtAll, SPEC.OmniDataTransform.optionalJson, 'data transform all mode');
for (const tag of SPEC.OmniDataTransform.optionalJson) {
  assert.match(dtAll, new RegExp(`<${tag}>\\{\\n  &quot;`), `data transform <${tag}> is expanded`);
}
assert.ok(dtAll.includes('&quot;Revenue&quot;: 1250000.00'), 'data transform numeric spelling preserved');
assert.ok(dtAll.includes('<formulaExpression>CONCAT(&quot;{&quot;,Account:Name,&quot;}&quot;)</formulaExpression>'), 'formulaExpression is untouched');
assert.ok(dtAll.includes('<formulaConverted>| CONCAT(&quot;{&quot;, var:Account:Name, &quot;}&quot;)</formulaConverted>'), 'formulaConverted is untouched');
assert.ok(dtAll.includes('<transformValuesMappings>{&quot;Gold&quot;:&quot;gold&quot;,&quot;Silver&quot;:&quot;silver&quot;}</transformValuesMappings>'), 'transformValuesMappings is untouched');
assert.equal(formatXml(dtAll, { expand: 'all' }).formatted, dtAll, 'data transform all mode is idempotent');

// 8. OmniDataTransform sample fields are optional and may hold non-JSON text.
for (const tag of SPEC.OmniDataTransform.optionalJson) {
  for (const content of ['', 'n/a', '{&quot;partial&quot;:', '[1,2']) {
    const variant = dtFixture.replace(new RegExp(`<${tag}>[^<]*</${tag}>`), `<${tag}>${content}</${tag}>`);
    let out;
    assert.doesNotThrow(() => { out = formatXml(variant, { expand: 'all' }).formatted; }, `non-JSON <${tag}> does not stop the run`);
    assert.ok(out.includes(`<${tag}>${content}</${tag}>`), `non-JSON <${tag}> '${content}' is left unchanged`);
  }
  const removed = dtFixture.replace(new RegExp(`\\s*<${tag}>[^<]*</${tag}>`), '');
  assert.doesNotThrow(() => formatXml(removed, { expand: 'all' }), `<${tag}> may be absent`);
}

// 9. CRLF copies of both fixtures stay CRLF, including expanded JSON.
for (const [label, fixture] of [['card', cardFixture], ['data transform', dtFixture]]) {
  const crlf = fixture.replace(/\n/g, '\r\n');
  const out = formatXml(crlf, { expand: 'all' }).formatted;
  assert.ok(!/(?<!\r)\n/.test(out), `${label} CRLF copy has no lone LF after all mode`);
  assert.equal(out, (label === 'card' ? cardAll : dtAll).replace(/\n/g, '\r\n'), `${label} CRLF output matches the LF output`);
}

// 10. Both fixture suffixes are folder-scanned and clean under --check (node mode).
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'appgenie-omni-spec-'));
try {
  fs.writeFileSync(path.join(tempRoot, 'AccountSummaryCard.ouc-meta.xml'), cardFixture);
  fs.writeFileSync(path.join(tempRoot, 'AccountExtract.rpt-meta.xml'), dtFixture);
  const files = discoverMetadataFiles(tempRoot);
  assert.deepEqual(files.map((f) => path.basename(f)), ['AccountExtract.rpt-meta.xml', 'AccountSummaryCard.ouc-meta.xml'], 'card and data transform files are folder-scanned');
  assert.ok(planFormatting(files).every((plan) => !plan.changed && !plan.passThrough), 'both fixtures pass --check and are not pass-through');
  assert.ok(planFormatting(files, { expand: 'all' }).every((plan) => plan.changed), 'both fixtures change under --expand all');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log('Field-reference tests passed (OmniUiCard, OmniDataTransform).');
