# AppGenie OmniStudio CLI plugin

**Package:** `@appgenie/sf-plugin-omni`  
**Command:** `sf appgenie omni format`  
**Status:** Initial plugin implementation; engine regression tests pass. Salesforce CLI runtime and org round-trip tests remain to be run in an environment with dependencies and a test org.

This plugin exposes the AppGenie OmniStudio metadata formatter through the Salesforce Unified CLI (`sf`). It formats approved embedded JSON fields while preserving XML outside those fields.

## Requirements

- Salesforce CLI (`sf`), current supported release.
- Node.js 22 or later, matching the current Salesforce CLI runtime line.
- npm or Yarn to install dependencies.

## Install from GitHub for evaluation

The plugin is currently distributed as source from the GitHub repository; it has **not** been published to npm. You need Git access to the repository, Node.js 22 or later, npm, and the Salesforce CLI (`sf`). If the repository is private, GitHub must authenticate your account and grant you access before cloning.

From a terminal, clone the repository and install its dependencies:

```bash
git clone https://github.com/mark-townsend-appgenie/sf-plugin-omni.git
cd sf-plugin-omni
npm ci
npm test
npm run manifest
sf plugins link .
```

Confirm that Salesforce CLI can discover the command:

```bash
sf appgenie omni format --help
sf appgenie omni format --list-types
```

`npm ci` uses the committed `package-lock.json` to install the locked dependency tree. If the lock file has not yet been committed to the repository, use `npm install` temporarily instead; commit the generated lock file before relying on clean external builds.

### Uninstall the linked development plugin

When you have finished evaluating it, run:

```bash
sf plugins unlink @appgenie/sf-plugin-omni
```

Unlinking removes the local plugin registration from Salesforce CLI; it does not delete the repository or its files.

## Install for local development

If you already have a checkout, run these commands from the repository directory:

```bash
npm ci
npm test
npm run manifest
sf plugins link .
sf appgenie omni format --help
```

For a direct local run without linking:

```bash
npm run dev -- appgenie omni format --help
```

The package is configured for the `@appgenie` npm scope, but it is not published to npm. Until an approved package release is published, use the source-install instructions above rather than `sf plugins install @appgenie/sf-plugin-omni`.

## Command usage

### Format one file in place

```bash
sf appgenie omni format force-app/main/default/omniScripts/MyScript.os-meta.xml
```

The command validates and formats the file, then replaces it atomically only if it changed. File permissions are retained.

### Format a directory recursively

```bash
sf appgenie omni format force-app/main/default
```

Directory mode discovers files ending in:

- `.os-meta.xml`
- `.oip-meta.xml`
- `.ouc-meta.xml`
- `.rpt-meta.xml`

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

This lists the registered XML roots, approved JSON target tags, and pass-through handlers.

### JSON output

The Salesforce CLI's standard `--json` flag is supported. Successful runs return a structured result including counts and per-file outcomes.

## Formatting contract

The formatter is deliberately conservative:

- Formats JSON only inside `<propertySetConfig>` and `<elementTypeComponentMapping>`, and only for registered roots.
- Preserves original JSON primitive tokens, including numeric spellings such as `12.0`, `0.0`, and `1e3`.
- Preserves JSON string token text, string escapes, property order, array order, and XML entity spellings.
- Leaves XML content outside target elements unchanged as UTF-8 text.
- Does not minify JSON, sort keys, reorder XML elements, normalize metadata, deploy metadata, rewrite versions, or call a Salesforce org.
- Rejects malformed JSON in a configured target field and unknown root elements.
- Re-running the formatter should produce no further changes.

## Current component map

| Metadata root | Fields formatted | Status |
|---|---|---|
| `OmniScript` | `propertySetConfig`, `elementTypeComponentMapping` | Configured |
| `OmniIntegrationProcedure` | `propertySetConfig`, `elementTypeComponentMapping` | Configured |
| `OmniDataTransform` | None | Pass-through; sample input/output JSON is out of scope |
| `OmniUiCard` | `propertySetConfig`, `elementTypeComponentMapping` | Configured for approved tags only |
| `OmniscriptDefinition`, `OmniScriptDefinition` | None | Pass-through pending verified retrieved fixtures |
| `IntegrationProcDefinition` | None | Pass-through pending verified retrieved fixtures |
| `FlexcardDefinition`, `FlexCardDefinition` | None | Pass-through pending verified retrieved fixtures |
| `DataMapperDefinition` | None | Pass-through pending verified field mapping |
| `OmniExtTrackingDef` | None | Pass-through pending verified field mapping |
| `OmniInteractionAccessConfig` | None | Pass-through |
| `OmniInteractionConfig` | None | Pass-through |
| `OmniStudioSettings` | None | Pass-through |
| `OmniTrackingGroup` | None | Pass-through |

“Configured” means a target allowlist is implemented; it does not by itself certify every Salesforce API version or every metadata variant. Pass-through types are intentionally not modified. Do not add fields to an allowlist based only on a generic text/textarea field type; verify the serialized payload against a retrieved fixture first.

## Tests and verification status

Run the offline formatter regression suite:

```bash
npm test
```

The suite covers lexical token preservation, nested objects/arrays, XML target discovery, CDATA/comment handling, invalid JSON rejection, unknown roots, idempotence, pass-through behavior, and the supplied `Base Discovery Framework` fixture.

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
