'use strict';
module.exports = {
  componentName: 'OmniUiCard (standard/legacy metadata)',
  rootNames: ['OmniUiCard'],
  discoverySuffixes: ['.ouc-meta.xml'],
  // OmniUiCard has no elementTypeComponentMapping field. dataSourceConfig,
  // sampleDataSourceResponse and stylingConfiguration stay untouched until a
  // retrieved org fixture confirms their serialized JSON format.
  targetTags: ['propertySetConfig'],
  formatNotes: 'Formats propertySetConfig only; other card configuration and sample fields are untouched pending a verified org fixture.',
};
