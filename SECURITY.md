# Security policy

## Supported version

Security fixes are applied to the current hosted A2CA release line. Older ZIP snapshots are not maintained.

## Reporting a vulnerability

Please do **not** open a public issue for a vulnerability that could expose user data, permit injection through imported files, bypass request restrictions, or abuse the hosted scientific-service proxy.

When GitHub private vulnerability reporting is enabled, use that channel. Otherwise contact the repository owner privately and include the affected version, reproduction steps, impact, and a minimal proof of concept where appropriate.

## Hosted-server security model

The public web server exposes only the A2CA resources and narrowly scoped service routes:

- `/api/ncbi/blast`
- `/api/ncbi/efetch`
- `/api/rcsb/pdb`
- `/api/mafft`
- `/api/fasttree`
- `/api/meta` and `/api/status` for application/runtime diagnostics

The proxy uses parameter allow-lists, request/response size limits, same-origin browser checks, a custom request header, conservative rate limits, and inert `text/plain` responses for upstream scientific-service content. The repository source and server files are not served through the website.

Railway terminates public HTTPS in front of the application. The A2CA process listens on the Railway-provided port.

## User-provided data

Treat uploaded sequences, structures, and `.a2ca` sessions as potentially sensitive. A2CA does not intentionally persist them server-side, but relevant data can be transmitted to external scientific services when those workflows are used. Do not attach private scientific data to public GitHub issues.

## Server-side scientific executables

The hosted FASTA workflow executes MAFFT and FastTree in the A2CA container with fixed argument lists and no shell interpolation. Inputs are validated, size/rate limited, jobs have hard runtime timeouts, and a bounded compute gate prevents unrestricted concurrent scientific processes. `/health` fails when either executable is missing from the runtime.
