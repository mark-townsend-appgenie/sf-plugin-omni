'use strict';
// Field names follow the OmniDataTransform Metadata API field reference. The
// JSON-bearing header fields are expectedInputJson, expectedOutputJson and
// previewJsonData. omniDataTransformItem formula fields (formulaExpression,
// formulaConverted) are formula text, not JSON, and are never touched.
module.exports = {
  componentName: 'OmniDataTransform',
  rootNames: ['OmniDataTransform'],
  discoverySuffixes: ['.rpt-meta.xml'],
  targetTags: [],
  // Sample and preview payloads are user-supplied and may be empty, plain text or
  // partial JSON, so they are expanded only when the content is valid JSON.
  optionalTargetTags: ['expectedInputJson', 'expectedOutputJson', 'previewJsonData'],
  formatNotes: 'expectedInputJson, expectedOutputJson and previewJsonData are expanded only when they hold valid JSON; formula and mapping fields are untouched.',
};
