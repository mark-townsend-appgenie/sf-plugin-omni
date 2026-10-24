'use strict';
// Field names follow the OmniUiCard Metadata API field reference: authorName,
// dataSourceConfig, isActive, name, omniUiCardType, propertySetConfig,
// sampleDataSourceResponse, stylingConfiguration, versionNumber.
module.exports = {
  componentName: 'OmniUiCard (standard/legacy metadata)',
  rootNames: ['OmniUiCard'],
  discoverySuffixes: ['.ouc-meta.xml'],
  // Designer-generated configuration: must be valid JSON, otherwise the run stops.
  targetTags: ['propertySetConfig', 'dataSourceConfig'],
  // Optional or user-supplied payloads: expanded only when the content is valid
  // JSON, otherwise left byte-for-byte unchanged.
  optionalTargetTags: ['stylingConfiguration', 'sampleDataSourceResponse'],
  formatNotes: 'propertySetConfig and dataSourceConfig must be valid JSON; stylingConfiguration and sampleDataSourceResponse are expanded only when they hold valid JSON. OmniUiCard has no elementTypeComponentMapping field.',
};
