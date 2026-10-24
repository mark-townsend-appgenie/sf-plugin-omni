'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { formatXml, components } = require('./omni-format');

// Directory scanning only covers types whose file suffix is unambiguous. Other
// registered types are formatted when passed as an explicit file path.
const DISCOVERY_SUFFIXES = [...new Set(components.flatMap((component) => component.discoverySuffixes))].sort();
const IGNORED_DIRECTORY_NAMES = new Set(['.git', 'node_modules', '.sf', '.sfdx']);

function discoverMetadataFiles(directory) {
  const found = [];
  const pending = [path.resolve(directory)];

  while (pending.length > 0) {
    const current = pending.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORY_NAMES.has(entry.name)) pending.push(fullPath);
      } else if (entry.isFile() && DISCOVERY_SUFFIXES.some((suffix) => entry.name.endsWith(suffix))) {
        found.push(fullPath);
      }
    }
  }

  return found.sort((a, b) => a.localeCompare(b));
}

function writeAtomically(filePath, content) {
  const stat = fs.statSync(filePath);
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(tempPath, content, { encoding: 'utf8', mode: stat.mode });
    fs.chmodSync(tempPath, stat.mode);
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    try {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    } catch {
      // Preserve the original write/rename error.
    }
    throw error;
  }
}

function planFormatting(files, options = {}) {
  return files.map((filePath) => {
    let original;
    let formatted;
    let component;
    try {
      original = fs.readFileSync(filePath, 'utf8');
      ({ formatted, component } = formatXml(original, options));
    } catch (error) {
      throw new Error(`${filePath}: ${error.message}`, { cause: error });
    }
    return {
      path: filePath,
      original,
      formatted,
      component: component.componentName,
      passThrough: component.targetTags.length === 0,
      changed: formatted !== original,
    };
  });
}

function applyFormatting(plans) {
  const changed = plans.filter((plan) => plan.changed);
  for (const plan of changed) writeAtomically(plan.path, plan.formatted);
  return changed.length;
}

module.exports = {
  DISCOVERY_SUFFIXES,
  discoverMetadataFiles,
  writeAtomically,
  planFormatting,
  applyFormatting,
};
