---
name: issue-format
description: Formats GitHub issue titles and descriptions for tracking problems that were fixed. Use when proposing or implementing code changes, creating GitHub issues, or when the user asks for issue suggestions.
---

# Issue Format

## Template (copy this structure exactly)

Raw markdown:
```
> **GitHub issue:**
> - **Title:** `Short issue title here`
> - **Description:** Description sentence one. Sentence two with `codeRef()` references.
```

## Rules

1. Use markdown blockquote (`>` prefix) — no exceptions
2. Title goes after `**Title:**` wrapped in exactly ONE backtick pair
3. NEVER put backticks inside the title — the whole title is one code span, no nesting
4. Description uses backticks for code references — title does NOT
5. Title: as short as possible
6. Description: 2-3 sentences about the problem (not the solution), present tense

## Wrong vs Right

❌ WRONG — missing backticks around title:
```
> - **Title:** Mod queue should use /modqueue instead of /queue
```

❌ WRONG — backticks around individual words instead of whole title:
```
> - **Title:** Mod queue should use `/modqueue` instead of `/queue`
```

✅ CORRECT — entire title in one backtick pair, no backticks inside:
```
> - **Title:** `Mod queue should use /modqueue instead of /queue`
```

## Self-check

Before outputting, verify:
- [ ] Lines start with `>`
- [ ] Title is wrapped in exactly one backtick pair: `` `like this` ``
- [ ] No backticks inside the title text
- [ ] Code references in description (not title) use backticks
