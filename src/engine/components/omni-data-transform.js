'use strict';
module.exports = {
  componentName: 'OmniDataTransform',
  rootNames: ['OmniDataTransform'],
  discoverySuffixes: ['.rpt-meta.xml'],
  // The formatter's contract is intentionally limited to propertySetConfig
  // and elementTypeComponentMapping. Data Mapper sample JSON fields are out of
  // scope until a retrieved org fixture confirms their serialized format.
  targetTags: [],
  formatNotes: 'Pass-through for JSON; XML node layout only. Sample input/output JSON fields are pending a verified org fixture.',
};
