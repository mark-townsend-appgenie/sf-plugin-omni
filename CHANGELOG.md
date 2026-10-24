# Changelog

## 0.1.0 — 2026-10-23

- Package the conservative OmniStudio embedded-JSON formatter as an `sf` CLI plugin.
- Add `sf appgenie omni format` for files, recursive metadata directories, stdin/stdout, `--check`, and `--list-types`.
- Add lexical preservation and fixture regression tests.
- Document known pass-through metadata types and pre-release verification steps.

## Unreleased

- Make `--expand node` the default: reformat element-only XML structure without expanding text content or embedded JSON.
- Add `--expand all` to retain the existing embedded-JSON expansion behaviour alongside XML node formatting.
- Add regression coverage for payload preservation and idempotence in both modes.
