---
name: review-and-merge-pr
description: Review an open GitHub pull request, inspect feedback from Cursor Bugbot, CodeRabbit, CI, and human reviewers, decide which findings are valid, implement fixes on the PR branch, merge the PR into master when it is ready, and finalize the linked GitHub issue and project status after merge. Use when the user says "check the PR", "address bugbot comments", "handle CodeRabbit feedback", "review PR feedback", or "merge this PR".
---

# Review And Merge Pr

## Overview

Use this skill after a feature branch already has an open PR into `master`.
Stay on the PR branch, treat review bots as input rather than authority, and only merge once the branch is verified and the remaining comments are either fixed or explicitly declined with a reason.

## Workflow

### 1. Identify the target PR

Prefer the PR for the current branch when the branch is not `master`.
If the current branch is `master`, inspect open PRs and choose the one that matches the user request.
If there is no open PR yet, stop and use `make-closed-issue` first.

Useful commands:

```bash
gh pr status
gh pr list --repo bitsocialnet/5chan --state open
gh pr view <pr-number> --repo bitsocialnet/5chan --json number,title,url,headRefName,baseRefName,isDraft,reviewDecision,mergeStateStatus
```

### 2. Gather all review signals before changing code

Read the PR state, checks, issue comments, review summaries, and inline review comments before deciding what to change.
Do not merge based only on the top-level review verdict.

Useful commands:

```bash
gh pr view <pr-number> --repo bitsocialnet/5chan --json number,title,url,headRefName,baseRefName,isDraft,reviewDecision,mergeStateStatus
gh pr checks <pr-number>
gh api "repos/bitsocialnet/5chan/issues/<pr-number>/comments?per_page=100"
gh api "repos/bitsocialnet/5chan/pulls/<pr-number>/reviews?per_page=100"
gh api "repos/bitsocialnet/5chan/pulls/<pr-number>/comments?per_page=100"
```

Focus on comments from:

- Cursor Bugbot
- CodeRabbit
- human reviewers
- failing CI checks

### 3. Triage findings instead of blindly applying them

Sort feedback into these buckets:

- `must-fix`: correctness bugs, broken behavior, crashes, security issues, test failures, reproducible regressions
- `should-fix`: clear maintainability or edge-case issues with concrete evidence
- `decline`: false positives, stale comments, duplicate findings, speculative style-only suggestions, or feedback already addressed in newer commits

Rules:

- Never merge with unresolved `must-fix` findings.
- Do not accept a bot finding without reading the relevant code and diff.
- If a finding is ambiguous but high-risk, ask the user before merging.
- If a comment is wrong or stale, explain why in the PR rather than silently ignoring it.

### 4. Work on the PR branch and keep the PR updated

Switch to the PR branch if needed, apply the valid fixes, and push new commits to the same branch.
Do not open a replacement PR unless the user explicitly asks for that.

Useful commands:

```bash
git switch <head-branch>
git fetch origin <head-branch>
git status --short --branch
git add <files>
git commit -m "fix(scope): address review feedback"
git push
```

After code changes, follow repo verification rules from `AGENTS.md`:

- run `yarn build`, `yarn lint`, and `yarn type-check`
- run `yarn test` after adding or changing tests
- run `yarn doctor` after React UI logic changes
- use `playwright-cli` for UI/visual changes on desktop and mobile

### 5. Report back on the PR before merging

Summarize what was fixed and what was declined.
Use `gh pr comment` for a concise PR update when the branch changed because of review feedback.

Example:

```bash
gh pr comment <pr-number> --repo bitsocialnet/5chan --body "Addressed the valid review findings in the latest commit. Remaining bot comments are stale or not applicable for the reasons checked locally."
```

### 6. Merge only when the PR is actually ready

Merge only if all of these are true:

- the PR is not draft
- required checks are passing
- the branch is mergeable into `master`
- no unresolved `must-fix` reviewer findings remain
- the latest code was verified locally after the last review-driven change

Preferred merge command:

```bash
gh pr merge <pr-number> --repo bitsocialnet/5chan --squash --delete-branch
```

### 7. Finalize the linked issue and project item

After merge, inspect the PR's linked closing issue.
If the merge did not close the issue automatically, close it manually.
Then ensure the linked issue is on the `5chan` project and its status is `Done`.

Useful commands:

```bash
ISSUE_NUMBER=$(gh pr view <pr-number> --repo bitsocialnet/5chan --json closingIssuesReferences --jq '.closingIssuesReferences[0].number // empty')

if [ -n "$ISSUE_NUMBER" ]; then
  ISSUE_STATE=$(gh issue view "$ISSUE_NUMBER" --repo bitsocialnet/5chan --json state --jq '.state')
  if [ "$ISSUE_STATE" != "CLOSED" ]; then
    gh issue close "$ISSUE_NUMBER" --repo bitsocialnet/5chan
  fi

  ITEM_ID=$(gh project item-list 1 --owner bitsocialnet --limit 1000 --format json --jq ".items[] | select(.content.number == $ISSUE_NUMBER) | .id" | head -n1)
  if [ -z "$ITEM_ID" ]; then
    ITEM_JSON=$(gh project item-add 1 --owner bitsocialnet --url "https://github.com/bitsocialnet/5chan/issues/$ISSUE_NUMBER" --format json)
    ITEM_ID=$(echo "$ITEM_JSON" | jq -r '.id')
  fi

  FIELD_JSON=$(gh project field-list 1 --owner bitsocialnet --format json)
  STATUS_FIELD_ID=$(echo "$FIELD_JSON" | jq -r '.fields[] | select(.name=="Status") | .id')
  DONE_OPTION_ID=$(echo "$FIELD_JSON" | jq -r '.fields[] | select(.name=="Status") | .options[] | select(.name=="Done") | .id')

  gh project item-edit --id "$ITEM_ID" --project-id PVT_kwDODohK7M4BM4wg --field-id "$STATUS_FIELD_ID" --single-select-option-id "$DONE_OPTION_ID"
fi
```

### 8. Clean up local state after merge

After the PR is merged:

```bash
git switch master
git pull --ff-only
git branch -D <head-branch> 2>/dev/null || true
git branch -D "pr/<pr-number>" 2>/dev/null || true
```

If the PR branch lived in a dedicated worktree, remove that worktree after leaving it:

```bash
git worktree list
git worktree remove /path/to/worktree
```

### 9. Report the outcome

Tell the user:

- which findings were fixed
- which findings were declined and why
- which verification commands ran
- whether the PR was merged
- whether the linked issue was confirmed closed
- whether the linked project item was confirmed `Done`
- whether the feature branch, local `pr/<number>` alias, and any worktree were cleaned up
