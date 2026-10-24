# AppGenie OmniStudio CLI plugin

**Package:** `@appgenie/sf-plugin-omni`  
**Command:** `sf appgenie omni format`  
**Status:** Initial plugin implementation; engine regression tests pass. Salesforce CLI runtime and org round-trip tests remain to be run in an environment with dependencies and a test org.

This plugin exposes the AppGenie OmniStudio metadata formatter through the Salesforce Unified CLI (`sf`). By default, it reformats element-only XML structure while preserving node text content. Use `--expand all` to also pretty-print approved embedded JSON fields.

## Requirements

- Salesforce CLI (`sf`), current supported release.
- Node.js 22 or later, matching the current Salesforce CLI runtime line.
- npm or Yarn to install dependencies.

## Install for local development

From this package directory:

```bash
npm install
npm test
npm run manifest
sf plugins link .
sf appgenie omni format --help
```

To unlink it after testing:

```bash
sf plugins unlink @appgenie/sf-plugin-omni
```

For a direct local run without linking:

```bash
npm run dev -- appgenie omni format --help
```

The package is configured for the `@appgenie` npm scope, but it is not published by this project build. Publishing requires the AppGenie npm scope to be owned/configured and release approval.

## Command usage

### Expansion modes

- `--expand node` (default): formats XML node layout only. Text inside elements is preserved; embedded JSON that is on one line stays on one line.
- `--expand all`: formats XML node layout and pretty-prints embedded JSON in explicitly approved fields.

### Indentation and line endings

- `--indent 4` (default): indents XML elements with 4 spaces, matching files retrieved by `sf project retrieve`, so freshly retrieved metadata is already clean.
- `--indent <1-8>`: use that many spaces.
- `--indent tab`: use tabs.
- `--indent preserve`: keep the file's existing indent unit (tab, or the smallest space indent found), falling back to 4 spaces.

New line breaks always follow the line ending already used between the file's elements (LF or CRLF), so a CRLF file is never left with mixed endings. Expanded JSON in `--expand all` mode uses the same line ending. Embedded JSON is indented with 2 spaces from column 0, matching the OmniStudio designer.

This repository's `.gitattributes` normalises `*-meta.xml` to LF. Consider adding the same rule (`*-meta.xml text eol=lf`) to Salesforce project repositories that run this formatter, so Windows and Linux checkouts agree.

### Format one file in place

```bash
sf appgenie omni format force-app/main/default/omniScripts/MyScript.os-meta.xml

# Also expand approved embedded JSON fields
sf appgenie omni format force-app/main/default/omniScripts/MyScript.os-meta.xml --expand all
```

The command validates and formats the file, then replaces it atomically only if it changed. File permissions are retained.

### Format a directory recursively

```bash
sf appgenie omni format force-app/main/default
```

Directory mode discovers files ending in:

- `.os-meta.xml` (OmniScript)
- `.oip-meta.xml` (OmniIntegrationProcedure)
- `.ouc-meta.xml` (OmniUiCard / FlexCard)
- `.rpt-meta.xml` (OmniDataTransform)

Only these 4 of the 13 registered types are picked up by a directory scan. The other 9 types (for example `OmniInteractionConfig` or `OmniStudioSettings`) are only formatted when you pass the file path explicitly; `--list-types` shows which types are folder-scanned.

If any file contains malformed XML (mismatched, stray or unclosed tags) or invalid embedded JSON, the run stops before writing anything and the error message names the file.

It skips symlinks and the `.git`, `node_modules`, `.sf`, and `.sfdx` directories. Every candidate file is read and validated before the command begins writing. Each file is replaced atomically; the whole directory operation is not a single transaction.

### Check without writing

```bash
sf appgenie omni format force-app/main/default --check
```

The command reports every candidate file and exits with an error if any file needs formatting. It does not modify files. This is suitable for CI checks.

### Read from stdin

```bash
cat MyScript.os-meta.xml | sf appgenie omni format
```

Formatted XML is written to stdout. Diagnostic output is handled by the CLI. With `--check`, stdin is checked without writing formatted output; the command fails if formatting is needed.

### List component mappings

```bash
sf appgenie omni format --list-types
```

This lists the registered XML roots, approved JSON target tags, pass-through handlers, and whether each type is included in a directory scan.

### JSON output

The Salesforce CLI's standard `--json` flag is supported. Successful runs return a structured result including counts and per-file outcomes.

## Formatting contract

The formatter is deliberately conservative:

- In default `node` mode, only whitespace between child XML elements is normalized; element text payloads are preserved. Mixed-content parents are left untouched.
- In `all` mode, JSON is formatted only inside the approved target elements for each root (see the component map below).
- New line breaks match the file's existing line ending; indentation follows `--indent` (default 4 spaces).
- Preserves original JSON primitive tokens, including numeric spellings such as `12.0`, `0.0`, and `1e3`.
- Preserves JSON string token text, string escapes, property order, array order, and XML entity spellings.
- Preserves text payloads in `node` mode and preserves XML structure outside approved JSON target fields in `all` mode.
- Does not minify JSON, sort keys, reorder XML elements, normalize metadata, deploy metadata, rewrite versions, or call a Salesforce org.
- Rejects malformed XML element structure (mismatched, stray or unclosed tags, or a second root), malformed JSON in a configured target field, and unknown root elements.
- Re-running the formatter should produce no further changes.

## Current component map

| Metadata root | Fields formatted | Status |
|---|---|---|
| `OmniScript` | `propertySetConfig`, `elementTypeComponentMapping` | Configured |
| `OmniIntegrationProcedure` | `propertySetConfig`, `elementTypeComponentMapping` | Configured |
| `OmniDataTransform` | None | XML layout only; sample input/output JSON pending a verified org fixture |
| `OmniUiCard` | `propertySetConfig` | Configured; `dataSourceConfig`, `sampleDataSourceResponse` and `stylingConfiguration` pending a verified org fixture |
| `OmniscriptDefinition`, `OmniScriptDefinition` | None | Pass-through pending verified retrieved fixtures |
| `IntegrationProcDefinition` | None | Pass-through pending verified retrieved fixtures |
| `FlexcardDefinition`, `FlexCardDefinition` | None | Pass-through pending verified retrieved fixtures |
| `DataMapperDefinition` | None | Pass-through pending verified field mapping |
| `OmniExtTrackingDef` | None | Pass-through pending verified field mapping |
| `OmniInteractionAccessConfig` | None | Pass-through |
| `OmniInteractionConfig` | None | Pass-through |
| `OmniStudioSettings` | None | Pass-through |
| `OmniTrackingGroup` | None | Pass-through |

"Configured" means a target allowlist is implemented; it does not by itself certify every Salesforce API version or every metadata variant. Pass-through types are intentionally not modified. Do not add fields to an allowlist based only on a generic text/textarea field type; verify the serialized payload against a retrieved fixture first.

## Tests and verification status

Run the offline formatter regression suite:

```bash
npm test
```

The suite covers lexical token preservation, nested objects/arrays, XML target discovery, CDATA/comment handling, invalid JSON rejection, malformed XML rejection, unknown roots, node-only text preservation, both expansion modes, idempotence, CRLF and LF line endings, 4-space/2-space/tab/preserve indentation, OmniScript, Integration Procedure, Data Transform and Card samples, folder-scan coverage, file paths in error messages, and the supplied `Base Discovery Framework` fixture. CI runs the suite on both Ubuntu and Windows.

Before release, also run these environment-dependent checks:

1. `npm install` and `npm test` from a clean checkout.
2. `npm run manifest` to generate the oclif command manifest.
3. `npm run dev -- appgenie omni format --help`.
4. `sf plugins link .` followed by `sf appgenie omni format --help` and `sf appgenie omni format --list-types`.
5. Test file, directory, `--check`, stdin, and `--json` command paths.
6. Retrieve representative metadata from a Salesforce test org, format it, verify semantic and lexical preservation, deploy where supported, then retrieve and compare again.
7. Run `npm pack --dry-run` and inspect the tarball contents.

The current environment did not complete an npm registry request, so dependency installation and execution through the actual `sf` plugin loader have not been claimed as verified here. The formatter engine test suite is independent of external dependencies.

## Design notes

The formatter uses a deliberately constrained XML markup scanner rather than a general XML parser because rebuilding an XML document could normalize unrelated source text. It is not a general-purpose XML validator. Only the target fields and roots listed above are in scope.

## Salesforce references

- [Salesforce CLI plugin overview](https://developer.salesforce.com/docs/atlas.en-us.sfdx_cli_plugins.meta/sfdx_cli_plugins)
- [Generate a Salesforce CLI plugin](https://developer.salesforce.com/docs/platform/salesforce-cli-plugin/guide/gs-generate-plugin.html)
- [Salesforce plugin core API documentation](https://salesforcecli.github.io/sf-plugins-core/)
- [Salesforce CLI plugin installation overview](https://developer.salesforce.com/docs/platform/sfdx-setup/guide/sfdx-setup-plugins-overview.html)
