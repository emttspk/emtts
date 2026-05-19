# Local Operations Documentation Policy

This document defines how operational, audit, and rollout documentation is managed in this repository.

## Quick Summary

| Type | Location | Versioned? | Examples |
|------|----------|-----------|----------|
| **Product Docs** | `docs/`, root `.md` files (feature docs) | ✅ YES | `complaintengine.md`, `invoice-pdf-download.md`, `bank-transfer-billing.md` |
| **Local Operations** | `.local-docs/` | ❌ NO | bootstrap reports, rollout phases, audit findings, deployment logs |

## What Goes in Version Control?

✅ **Belongs in git** (documented and tracked):
- Feature documentation (`docs/`, root `.md` files for user-facing features)
- Architecture documentation (`docs/architecture/system-map.md`, `docs/architecture/complaint-architecture.md`)
- Setup guides (`docs/operations/local-bootstrap.md`, `README.md`)
- Technical specifications and runbooks (`docs/architecture/mos-render-logic.md`, etc.)
- Policy and process documentation (this file)

These files describe **WHAT** the system does and **HOW** to use it.

## What Stays Machine-Local?

❌ **Belongs in `.local-docs/` (NOT tracked)**:

**Bootstrap & Infrastructure**
- Infrastructure readiness findings
- Bootstrap execution reports
- Local environment verification logs

**Rollout & Phase Reports**
- Phase implementation reports
- Rollout execution summaries
- Canary/staging validation outputs
- Feature flag enablement records

**Audit & Forensic**
- Audit trail summaries
- Forensic recovery documentation
- Validation checklists and results
- Performance benchmark reports

**Implementation Details**
- Fix implementation details (how a specific bug was resolved)
- Deployment-specific configurations
- Machine-specific runtime patches
- Temporary migration notes

**Operator Runbooks** (generated during rollout)
- Deploy commands executed on specific dates
- Infrastructure recovery sequences
- Manual fix procedures (ad-hoc)
- Troubleshooting notes from support calls

These files document **WHEN**, **WHERE**, and **HOW** a specific machine was modified, recovered, or tested.

## Why This Distinction?

### Version Control (docs/)
These files define product behavior and should be identical across all environments. They're part of the product definition.

### Machine-Local (.local-docs/)
These files document specific operational events on a specific machine. They:
- Contain execution timestamps (not relevant to other machines)
- Reference environment-specific paths and configurations
- May contain sensitive details (IP addresses, internal configs)
- Become outdated as soon as the next phase/rollout happens
- Are useful for **this** machine's operator, not the team

Example: If you bootstrap PostgreSQL on May 18, 2026, and someone else bootstraps on May 25, both will have different reports. Only your May 18 report is relevant to your machine.

## How to Avoid Accidental Commits

### Rule 1: Check Before Committing
```bash
git status
```
If you see `.local-docs/` or any temporary report files, **do not commit them**.

### Rule 2: Use Intentional Adds
```bash
# ✅ GOOD - explicit and safe
git add docs/
git add README.md
git add package.json

# ❌ RISKY - might add local-docs accidentally
git add .  # (assumes .gitignore is correct)
```

### Rule 3: When in Doubt
- Feature/product docs → `docs/` or root `.md` (versioned)
- Operational/audit/rollout docs → `.local-docs/` (local-only)

### Rule 4: Naming Conventions
Use CLEAR naming to indicate operational docs:
- `*REPORT*.md` → Likely operational → `.local-docs/`
- `*AUDIT*.md` → Likely operational → `.local-docs/`
- `*RECOVERY*.md` → Likely operational → `.local-docs/`
- `*FINDINGS*.md` → Likely operational → `.local-docs/`
- Feature name (e.g., `complaintengine.md`) → Likely product → `docs/` or root

## Examples

### ✅ These Should Be Versioned

```
docs/operations/local-bootstrap.md          → Setup guide (same everywhere)
docs/architecture/system-map.md             → Architecture (same everywhere)
README.md                         → Project intro (same everywhere)
complaintengine.md               → Feature documentation
```

### ❌ These Should Be Local-Only

```
.local-docs/FINAL_EXECUTION_REPORT_MAY10.md
.local-docs/PHASE-5-IMPLEMENTATION-REPORT.md
.local-docs/LABEL_GENERATION_AUDIT_REPORT.md
.local-docs/RAILWAY_DEPLOYMENT_GUIDE.md
.local-docs/bootstrap-execution-findings.md
```

## When Should I Create a New Document?

### In `docs/` (or root `.md` as product doc):
- "I want to explain how this feature works to the next developer"
- "I need to document the architecture for team reference"
- "This is setup/troubleshooting guidance for all users"

### In `.local-docs/`:
- "I just executed a bootstrap and want to record what happened"
- "I ran an audit and found these issues on MY machine"
- "I just deployed this feature and here's the rollout report"
- "Here's how I fixed this specific production issue"

## Checking What's Tracked

```bash
# See which docs are tracked in git
git ls-files | grep -E '\.md$|docs/'

# Verify .local-docs is NOT tracked
git ls-files | grep local-docs
# (should return nothing - empty result is good!)
```

## For New Team Members

When you clone this repo:
- ✅ You'll get all product documentation in `docs/` 
- ❌ You won't get `.local-docs/` (it's excluded from git)

This is **intentional and correct**. Each machine's operator keeps their own local operational notes.

When you do local operations (bootstrap, deploy, test):
- Put findings in `.local-docs/` to keep them local
- Never commit `.local-docs/` to the team repo

## FAQ

**Q: I found a bug during deployment. Should I document the fix?**
A: Yes! Put detailed findings in `.local-docs/BUG-NAME-RECOVERY.md` so your team can understand what happened. Once the team decides on the permanent fix, it goes to `docs/` as a runbook.

**Q: I want to document a new feature. Where?**
A: If it's a product feature, document it in `docs/` or as a root `.md` file. If it's implementation details of rollout phase, use `.local-docs/`.

**Q: What if .gitignore breaks and `.local-docs/` gets committed?**
A: No problem! The files in `.local-docs/` are useful reference but don't hurt if versioned. However, it's cleaner to keep them local-only.

**Q: Can I move a file from `.local-docs/` to `docs/`?**
A: Yes! If you discover that an operational document should become team documentation, move it to `docs/` and commit it. Example: temporary troubleshooting guide becomes permanent runbook.

---

**Policy Last Updated**: May 18, 2026
**Policy Applies To**: All `.local-docs/` directories in this project
