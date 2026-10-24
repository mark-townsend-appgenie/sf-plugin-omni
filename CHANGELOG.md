# Changelog

## Unreleased

- Make `--expand node` the default: reformat element-only XML structure without expanding text content or embedded JSON.
- Add `--expand all` to retain the existing embedded-JSON expansion behaviour alongside XML node formatting.
- Add regression coverage for payload preservation and idempotence in both modes.
- Default XML indentation is now 4 spaces, matching Salesforce retrieves. Add `--indent` (1-8 spaces, `tab`, or `preserve`).
- New line breaks, including expanded JSON, follow the file's existing line ending, so CRLF files no longer end up with mixed endings.
- Reject malformed XML (mismatched, stray or unclosed tags, or a second root) instead of passing it through silently.
- Error messages now name the file that failed during file and directory runs.
- Folder-scan suffixes are declared per component; `--list-types` and the README state which types a directory scan covers.
- Remove the unused `elementTypeComponentMapping` target from `OmniUiCard`.
- Align `OmniUiCard` and `OmniDataTransform` to the Salesforce field reference. Cards expand `propertySetConfig` and `dataSourceConfig` (required, must be valid JSON) plus `stylingConfiguration` and `sampleDataSourceResponse` (optional, expanded only when valid JSON). Data Transforms expand `expectedInputJson`, `expectedOutputJson` and `previewJsonData` (optional); formula fields and `transformValuesMappings` are untouched.
- Add optional JSON targets: expanded when the content is valid JSON, otherwise left unchanged without stopping the run.
- Invalid JSON errors now name the field and its line in the original file.
- Add field-reference conformance tests and schema-faithful card and data transform fixtures.
- Fix the `--list-types` flag, which was registered as `--listTypes`.
- Add `.gitattributes` (`*-meta.xml text eol=lf`), run CI on Ubuntu and Windows, and add `typescript` as a dev dependency to silence the oclif development-mode warning.

## 0.1.0 - 2026-10-23

- Package the conservative OmniStudio embedded-JSON formatter as an `sf` CLI plugin.
- Add `sf appgenie omni format` for files, recursive metadata directories, stdin/stdout, `--check`, and `--list-types`.
- Add lexical preservation and fixture regression tests.
- Document known pass-through metadata types and pre-release verification steps.
