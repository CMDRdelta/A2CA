# Contributing to A2CA

A2CA is an open-beta scientific web application. Contributions should preserve reproducibility, browser compatibility, data safety, and the scientific meaning of the analysis outputs.

## Development workflow

1. Create a branch from the current default branch.
2. Make focused changes.
3. Run `python tools/validate_repo.py`.
4. Start the web edition with `python main.py` and exercise the affected workflow in a browser.
5. Do not commit user `.a2ca` sessions, unpublished sequence data, temporary BLAST results, credentials, or cache files.
6. Open a pull request describing the scientific and user-interface impact of the change.

## Coding notes

- Keep NCBI/RCSB access behind the narrowly scoped same-origin backend.
- Validate imported/session-derived values before inserting them into HTML, SVG, filenames, or exported tables.
- Keep alignment/tree identifiers exact; avoid substring-based sequence matching.
- Add computational limits to algorithms with quadratic memory or runtime.
- Do not introduce persistent server-side storage of user sequence/structure data without an explicit design and privacy review.
- Keep the hosted web edition separate from desktop/offline distributions.

## Licensing

A2CA does not yet have a conventional open-source license. External contributions should not be accepted until contribution/relicensing terms have been finalized by the repository owner.
