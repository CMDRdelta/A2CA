# Changelog

## 2.0.42 – 2026-09-20

- Replaced the hosted EMBL-EBI MAFFT Job Dispatcher workflow with server-side `mafft --auto` execution on Railway to eliminate remote queue delays.
- Added a same-origin `/api/mafft` endpoint with size, rate, timeout, and concurrency safeguards.
- Added Railpack runtime installation of the MAFFT binary.
- Removed the obsolete MAFFT contact-email requirement from the FASTA workflow.
- Removed the hosted-web Requirements subsection from the landing-page Resources panel.
- Harmonized the heights of the query-file and query-fetch controls on the single-query page.

## 2.0.41 – 2026-09-20

- Split the hosted web edition from the desktop/offline distribution.
- Added a persistent Railway-compatible web server bound to the deployment `PORT`.
- Removed browser lifecycle shutdown, local launchers, and online/offline UI states.
- Enabled all three input workflows in the hosted application.
- Routed NCBI and RCSB requests through hardened same-origin API endpoints.
- Added Railway configuration and a deployment health check.

All notable repository releases should be documented here.

## 2.0.40 – 2026-09-20

### Repository preparation

- Prepared the standalone application for GitHub version control.
- Added `README.md`, `CITATION.cff`, `SECURITY.md`, `CONTRIBUTING.md`, `.gitignore`, `.gitattributes`, and repository validation.
- Added a single `VERSION` file.
- Renamed active image assets to stable, version-independent names.
- Removed obsolete generated cache files and unused legacy pages/assets.
- Added GitHub Actions syntax/reference validation.

### Application baseline

- Based on the A2CA 2.0.39 standalone application.
