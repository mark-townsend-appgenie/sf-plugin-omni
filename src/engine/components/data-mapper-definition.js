'use strict';
module.exports = {
  componentName: 'DataMapperDefinition',
  rootNames: ['DataMapperDefinition'],
  // The supplied Metadata API reference does not establish a safe JSON field
  // allowlist for this serialized type. Deliberately leave it unchanged until
  // a retrieved fixture confirms exact field names and payload formats.
  targetTags: [],
  formatNotes: 'Pass-through pending a verified JSON-field allowlist.',
};
