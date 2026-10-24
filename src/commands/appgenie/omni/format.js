import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { Args, Flags } from '@oclif/core';
import { SfCommand } from '@salesforce/sf-plugins-core';

const require = createRequire(import.meta.url);
const { formatXml, components } = require('../../../engine/omni-format.js');
const { DISCOVERY_SUFFIXES, discoverMetadataFiles, planFormatting, applyFormatting } = require('../../../engine/file-operations.js');

function readStdin() {
  return fs.readFileSync(0, 'utf8');
}

export default class OmniFormat extends SfCommand {
  static summary = 'Format embedded JSON in supported OmniStudio metadata XML.';
  static description = `By default, reformat element-only XML structure while preserving the content of each XML node.
Use --expand all to also pretty-print approved embedded JSON fields.

The formatter does not minify JSON, sort properties, reorder metadata elements, deploy metadata,
or normalise JSON values. Numeric spellings and JSON string tokens are preserved lexically.

When PATH is a directory, the command recursively discovers files ending in .os-meta.xml,
.oip-meta.xml, .ouc-meta.xml, or .rpt-meta.xml. Files are validated and formatted before any
writes begin; each changed file is replaced atomically. Directory updates are not a single
all-files transaction.`;
  static examples = [
    '<%= config.bin %> appgenie omni format force-app/main/default/omniScripts/MyScript.os-meta.xml',
    '<%= config.bin %> appgenie omni format force-app/main/default',
    '<%= config.bin %> appgenie omni format force-app/main/default --check',
    '<%= config.bin %> appgenie omni format force-app/main/default --expand all',
    'cat MyScript.os-meta.xml | <%= config.bin %> appgenie omni format',
    '<%= config.bin %> appgenie omni format --list-types',
  ];
  static args = {
    path: Args.string({
      required: false,
      description: 'Metadata XML file or directory. Omit PATH to read XML from stdin.',
    }),
  };
  static flags = {
    check: Flags.boolean({
      char: 'c',
      default: false,
      description: 'Check whether formatting is needed without modifying files; exit with an error if changes are required.',
    }),
    listTypes: Flags.boolean({
      default: false,
      description: 'List registered metadata roots and approved JSON target elements.',
    }),
    expand: Flags.string({
      options: ['node', 'all'],
      default: 'node',
      description: 'Expansion level: node reformats XML structure only; all also pretty-prints approved embedded JSON.',
    }),
  };

  async run() {
    const { args, flags } = await this.parse(OmniFormat);

    if (flags.listTypes) {
      const types = components.map((component) => ({
        component: component.componentName,
        roots: component.rootNames,
        targets: component.targetTags,
        mode: component.targetTags.length > 0 ? 'format' : 'pass-through',
        notes: component.formatNotes ?? '',
      }));
      if (!flags.json) {
        for (const item of types) {
          this.log(`${item.component}\n  roots: ${item.roots.join(', ')}\n  targets: ${item.targets.length ? item.targets.join(', ') : '(none; pass-through)'}\n  mode: ${item.mode}${item.notes ? `\n  notes: ${item.notes}` : ''}`);
        }
      }
      return { types };
    }

    if (!args.path) {
      if (process.stdin.isTTY) this.error('Provide a metadata file/directory path or pipe XML through stdin.');
      const original = readStdin();
      const { formatted, component } = formatXml(original, { expand: flags.expand });
      const changed = formatted !== original;
      if (flags.check && changed) this.error('Formatting is required for stdin input; no output was written because --check was specified.');
      if (flags.json) {
        return { input: 'stdin', formatted, component: component.componentName, changed, passThrough: component.targetTags.length === 0 };
      }
      if (!flags.check) process.stdout.write(formatted);
      return { input: 'stdin', component: component.componentName, changed, passThrough: component.targetTags.length === 0 };
    }

    const inputPath = path.resolve(args.path);
    if (!fs.existsSync(inputPath)) this.error(`Path does not exist: ${inputPath}`);
    const stat = fs.statSync(inputPath);
    let files;
    if (stat.isDirectory()) {
      files = discoverMetadataFiles(inputPath);
      if (files.length === 0) this.error(`No supported metadata files found under ${inputPath}. Expected suffixes: ${DISCOVERY_SUFFIXES.join(', ')}`);
    } else if (stat.isFile()) {
      files = [inputPath];
    } else {
      this.error(`Path is not a regular file or directory: ${inputPath}`);
    }

    // Validate and format every file first, so an invalid file cannot leave a
    // directory half-formatted merely because it appeared later in the walk.
    const plans = planFormatting(files, { expand: flags.expand });

    const changedPlans = plans.filter((plan) => plan.changed);
    if (flags.check) {
      if (!flags.json) {
        for (const plan of plans) {
          this.log(`${plan.changed ? 'NEEDS FORMATTING' : 'OK'} ${path.relative(process.cwd(), plan.path)} (${plan.component})`);
        }
      }
      if (changedPlans.length > 0) {
        this.error(`${changedPlans.length} of ${plans.length} file(s) need formatting. No files were modified.`);
      }
    } else {
      applyFormatting(plans);
      if (!flags.json) {
        for (const plan of plans) {
          this.log(`${plan.changed ? 'Formatted' : 'Unchanged'} ${path.relative(process.cwd(), plan.path)} (${plan.component})`);
        }
      }
    }

    return {
      path: inputPath,
      filesScanned: plans.length,
      filesChanged: changedPlans.length,
      filesUnchanged: plans.length - changedPlans.length,
      passThroughFiles: plans.filter((plan) => plan.passThrough).length,
      checkOnly: flags.check,
      expand: flags.expand,
      results: plans.map(({ path: filePath, component, changed, passThrough }) => ({
        path: filePath,
        component,
        changed,
        passThrough,
      })),
    };
  }
}
