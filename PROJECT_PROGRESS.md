# PROJECT_PROGRESS

## Release preparation update (2026-11-19)
- Added `tools/validate-project.py` for repeatable offline pre-upload checks (Node JS syntax, HTML local resource references, migration numbering, required deployment files).
- Added a deployment-secret preflight to GitHub Actions. It fails early if the required secrets are missing without printing their values.
- Added `QA_CHECKLIST.md` to distinguish offline checks from live Supabase validation.
- Offline validation run on this package: 37 JavaScript files syntax-checked; 34 HTML pages checked for local references; 31 migrations enumerated; no offline validation issues found.

## Important limitations / remaining live verification
- Live Supabase behavior, role permissions and end-to-end transaction workflows have not been exercised in this environment.
- CORS allowlist must be configured and confirmed for the production domain.
- File/document Storage workflow, receipts/printing, backup/restore and all multi-step business transactions need live tests.
- Do not treat offline validation as a production readiness certification.
