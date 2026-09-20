# Security policy

## Supported version

Security fixes are applied to the current A2CA development/release line. Older ZIP snapshots are not maintained.

## Reporting a vulnerability

Please do **not** open a public issue for a vulnerability that could expose user data, execute code, bypass the local proxy restrictions, or permit injection through imported files.

When GitHub private vulnerability reporting is enabled for the repository, use that channel. Otherwise contact the repository owner privately and include:

- the affected A2CA version;
- the page or endpoint involved;
- steps to reproduce;
- impact;
- a minimal proof of concept when appropriate.

## Local-server security model

A2CA online mode binds to `127.0.0.1` only. The local proxy uses a fixed allow-list for supported external-service parameters and performs Host/Origin checks. It is not intended to be exposed directly to a public network.

## User-provided data

Treat sequence files, structures, and `.a2ca` sessions as potentially sensitive. Do not attach private scientific data to public GitHub issues.
