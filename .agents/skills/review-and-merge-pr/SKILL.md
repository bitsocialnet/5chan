---
name: review-and-merge-pr
description: Review a PR, monitor or babysit its checks and reviews, apply requested fixes, or complete an authorized merge.
---

# Review and Merge a PR

Identify the requested PR, current head, target branch, and task scope. Use `gh` for GitHub operations. Carry existing authorization through the necessary work; the skill name does not itself authorize publication.

| Requested outcome | Work to perform |
|---|---|
| Review or readiness assessment | Assess the current head once and return findings locally, including any pending checks or reviews. |
| Watch, monitor, or babysit | Recheck pending CI and reviews until the requested condition is met or progress requires intervention. Reassess a changed head. Report blockers or readiness locally. Fixes, publication, and merge require authorization. |
| Fix review findings | Apply supported fixes within the requested scope, preserving unrelated work; commit/push only when included in the authorization |
| Merge | Resolve relevant findings and complete the authorized merge once readiness is established; honor any explicit no-push or other limit |

Read [feedback review](references/feedback.md) when collecting bot/human feedback. Read [merge and cleanup](references/merge.md) only when a merge is requested. Use the same PR head for authorized fixes; avoid switching branches beneath another task or opening a replacement PR.

Judge comments against the actual source and current diff. Report real defects, declined claims, and relevant deferred work with evidence. Do not repeatedly reopen a resolved finding without new evidence. If a material requirement is unresolved, finish independent checks and identify the missing decision.

Use `docs/agent-playbooks/verification.md` for the affected checks, reusing evidence for an unchanged final state. Summarize the outcome in the conversation. Posting a PR comment or changing its metadata requires that action to be within the requested scope; neither is a mandatory finishing ritual.
