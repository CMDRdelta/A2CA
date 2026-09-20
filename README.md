# A2CA – Amino Acid Cluster Analysis

![A2CA overview](resources/assets/introduction.png)

**A2CA** is a browser-based application for examining amino-acid variation in a phylogenetic and structural context. It combines multiple-sequence alignments, phylogenetic trees, physicochemical amino-acid properties, optional protein structures, and pairwise coevolution analyses in one interactive workflow.

This repository contains **A2CA 2.0.40**, prepared as the first GitHub-oriented release of the current standalone application.

## Features

- Start from a **single protein sequence or protein structure**, retrieve homologs with NCBI BLAST, then continue through alignment and tree inference.
- Start from **unaligned FASTA sequences** and generate an alignment with MAFFT and a phylogeny with FastTree.
- Start from a **prepared alignment and Newick tree** entirely offline.
- Select a reference sequence and map amino-acid positions across the alignment.
- Visualize residue conservation and optional amino-acid properties on a phylogenetic tree.
- Upload or fetch PDB structures and interactively map selected residues in 3D.
- Explore pairwise residue coevolution with similarity-aware and phylogeny-adjusted views.
- Save and restore portable `.a2ca` analysis sessions.
- Export figures and raw tables from the analysis interface.

## Quick start

### Offline mode

No Python installation is required.

1. Download or clone the repository.
2. Open `run_A2CA_offline.html` in a modern browser.
3. Use the **Alignment & Tree** workflow.

Offline mode is intentionally limited because browser security prevents direct access to some external scientific web services.

### Online mode

Online mode enables NCBI BLAST, NCBI Protein retrieval, RCSB PDB retrieval, MAFFT, and the full workflow.

Requirements:

- Python **3.10 or newer**
- a modern browser with JavaScript and WebGL
- internet access

No third-party Python packages are required.

**Windows:** double-click `run_A2CA_online_Windows.bat`  
**macOS:** double-click `run_A2CA_online_Mac.command`

The launcher starts a loopback-only server on `127.0.0.1`, opens A2CA in the browser, and stops after the A2CA browser session closes.

Python downloads: <https://www.python.org/downloads/>


## First GitHub upload

Create the GitHub repository as an **empty repository** (do not initialize it with another README, `.gitignore`, or license), then from this project folder run:

```bash
git init
git branch -M main
git add .
git commit -m "Initial A2CA 2.0.40 release"
git remote add origin https://github.com/CMDRdelta/A2CA.git
git push -u origin main
```

Alternatively, the files can be uploaded through GitHub's web interface, but using Git locally is recommended for subsequent development.

## Repository structure

```text
A2CA/
├── README.md
├── VERSION
├── CITATION.cff
├── SECURITY.md
├── CONTRIBUTING.md
├── CHANGELOG.md
├── requirements.txt
├── run_A2CA_offline.html
├── run_A2CA_online_Windows.bat
├── run_A2CA_online_Mac.command
├── resources/
│   ├── run_A2CA.py
│   ├── upload.html
│   ├── upload_single.html
│   ├── upload_fasta.html
│   ├── upload_precomputed.html
│   ├── reference.html
│   ├── analysis.html
│   ├── alignment.html
│   ├── sequences.html
│   ├── tree.html
│   ├── parameters.html
│   ├── a2ca-core.js
│   ├── *.js
│   ├── styles.css
│   └── assets/
├── tools/
│   └── validate_repo.py
└── .github/
    └── workflows/
        └── validate.yml
```

## External software and services

A2CA uses or communicates with the following software/services in online mode:

- **MAFFT** through the EMBL-EBI Job Dispatcher for multiple-sequence alignment.
- **FastTree 2.1.11** through BioWasm/Aioli for browser-side phylogenetic inference.
- **NCBI BLAST Common URL API** and **NCBI Protein EFetch** for homolog discovery and protein-sequence retrieval.
- **RCSB Protein Data Bank** for retrieval of structures by PDB identifier.
- **3Dmol.js 2.5.5** for interactive WebGL structure visualization.

External services are subject to their own availability, usage policies, and terms.

## Data and privacy

The offline workflow runs locally in the browser. Online workflows may send user-provided sequence/accession/structure-related data to the scientific services listed above. A2CA's local Python launcher acts as a narrowly scoped same-origin proxy and does not intentionally persist these requests on disk.

Before deploying A2CA as a public hosted service, add an explicit privacy/data-processing notice appropriate to the deployment environment.

## Validation

The repository includes a lightweight validation workflow that checks:

- Python syntax;
- JavaScript syntax;
- duplicate HTML element IDs;
- local HTML/CSS/JavaScript/resource references;
- version consistency;
- absence of generated Python cache files.

Run the repository checks locally with:

```bash
python tools/validate_repo.py
```

GitHub Actions runs the same checks automatically on pushes and pull requests.

## Citation

The original R/Shiny implementation of A2CA is archived as:

> D. Eggerichs, D. Tischler; Science Data Bank (2023). DOI: [10.57760/sciencedb.09549](https://doi.org/10.57760/sciencedb.09549)

A machine-readable citation is provided in [`CITATION.cff`](CITATION.cff).

## Versioning

The application version is stored in [`VERSION`](VERSION). Git tags for releases should use the form `v2.0.40`.

## License and reuse

Copyright © 2026 Daniel Eggerichs.

A2CA is currently distributed with the stated permission that it may be freely used for research purposes. An OSI-approved open-source license has **not** yet been selected. Before making the repository broadly public or accepting external contributions, the reuse, modification, redistribution, and commercial-use terms should be formalized in a dedicated `LICENSE` file.

## Security

Please see [`SECURITY.md`](SECURITY.md). Do not publish sensitive sequence data, credentials, or private `.a2ca` session files in GitHub issues.
