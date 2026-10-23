'use strict';
module.exports = {
  componentName: 'OmniExtTrackingDef',
  rootNames: ['OmniExtTrackingDef'],
  // TrackingFrameworkInformation is not assumed to be JSON merely because it
  // is a text field. Add a target only after confirming its serialized format.
  targetTags: [],
  formatNotes: 'Pass-through; no confirmed JSON payload allowlist.',
};
