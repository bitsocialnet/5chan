# Skills and Tools

Use this playbook when setting up/adjusting skills and external tooling.

## Recommended Skills

### Context7 (library docs)

For up-to-date docs on libraries.

```bash
npx skills add https://github.com/intellectronica/agent-skills --skill context7
```

### Vercel React Best Practices

For deeper React/Next performance guidance.

```bash
npx skills add https://github.com/vercel-labs/agent-skills --skill vercel-react-best-practices
```

### Find Skills

Discover/install skills from the open ecosystem.

```bash
npx skills add https://github.com/vercel-labs/skills --skill find-skills
```

### Playwright CLI

Use `playwright-cli` for browser automation (navigation, interaction, screenshots, tests, extraction).

```bash
npm install -g @playwright/cli@latest
playwright-cli install --skills
```

Skill install locations:

- `.cursor/skills/playwright-cli/`
- `.claude/skills/playwright-cli/`

## MCP Policy Rationale

Avoid GitHub MCP and browser MCP servers for this project because they add significant tool-schema/context overhead.

- GitHub operations: use `gh` CLI.
- Browser operations: use `playwright-cli`.
