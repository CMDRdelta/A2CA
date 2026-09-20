# Contributing to A2CA

A2CA is currently an open-beta scientific application. Contributions should preserve reproducibility, browser compatibility, and the distinction between offline and online workflows.

## Development workflow

1. Create a branch from the current default branch.
2. Make focused changes.
3. Run `python tools/validate_repo.py`.
4. Test both `run_A2CA_offline.html` and the Python-backed online launcher when the change touches networking or routing.
5. Do not commit user `.a2ca` sessions, unpublished sequence data, temporary BLAST results, credentials, or cache files.
6. Open a pull request describing the scientific and user-interface impact of the change.

## Coding notes

- Keep external-service access behind the narrowly scoped local proxy.
- Validate all imported/session-derived values before inserting them into HTML, SVG, filenames, or exported tables.
- Keep alignment/tree identifiers exact; avoid substring-based sequence matching.
- Add computational limits to algorithms with quadratic memory or runtime.
- Prefer browser-native functionality and the Python standard library unless a new dependency provides a clear scientific or maintenance benefit.

## Licensing

A2CA does not yet have a conventional open-source license. External contributions should not be accepted until contribution/relicensing terms have been finalized by the repository owner.
