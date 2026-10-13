# Contributing to 5chan

5chan is a classic imageboard client running on the decentralized Bitsocial protocol. It is meant to replace 4chan for people who already use it, so the interface deliberately keeps the raw, old-school look and behavior those users know. The improvement is underneath: anyone can create, own, and moderate a board without global admins. The interface itself is not up for modernization.

Before proposing a change, read:

- [PRODUCT.md](PRODUCT.md): who 5chan is for and why it stays classic.
- [DESIGN.md](DESIGN.md): the full visual rules, including the Do's and Don'ts.
- [README.md](README.md#contributor-setup) for setup, and [AGENTS.md](AGENTS.md) for code conventions.

## Settled design decisions

These are maintainer decisions, not open questions. Issues and pull requests that change them for taste will be closed. DESIGN.md is the complete list; the most common ones are:

- **Native buttons stay native.** Buttons use the browser's default appearance, with no custom colors, backgrounds, borders, or rounding, and no color-coded actions such as green for confirm and red for cancel.
- **No modern UI.** No rounded cards, pills or badges, gradients, soft shadows, hover background fills, or animations.
- **No emoji tooling.** No picker, shortcodes, or Twemoji; emoji pass through as plain Unicode.
- **Familiar behavior wins.** Boards, threads, catalogs, and posting work the way imageboard users already expect.

Fixes for real accessibility or usability problems are welcome. Keep them as small as possible and in the existing style; see [PRODUCT.md](PRODUCT.md#accessibility--inclusion).

## If you want a different look

5chan is free software under the [GPL-3.0](LICENSE). If you disagree with these choices, fork it and style it however you like, or restyle your own copy with a userscript or browser extension, the way 4chan X does for 4chan. Production CSS class names are generated from each stylesheet's contents, so a userscript or extension may need updating when 5chan updates.
