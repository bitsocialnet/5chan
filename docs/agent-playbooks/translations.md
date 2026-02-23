# Translations Workflow

This project uses i18next translation files in `public/translations/{lang}/default.json`.

## Rule

Do not manually edit every language file. Use `scripts/update-translations.js`.

## Add or Update a Key

1. Create a temporary dictionary file, e.g. `translations-temp.json`:

```json
{
  "en": "English text",
  "es": "Spanish text",
  "fr": "French text",
  "de": "German text"
}
```

2. Apply the translation map:

```bash
node scripts/update-translations.js --key my_new_key --map translations-temp.json --include-en --write
```

3. Delete the temporary dictionary file.

## Other Useful Commands

```bash
# Copy a key from English to all languages (dry run then write)
node scripts/update-translations.js --key some_key --from en --dry
node scripts/update-translations.js --key some_key --from en --write

# Delete a key from all languages
node scripts/update-translations.js --key obsolete_key --delete --write

# Audit for unused translation keys
node scripts/update-translations.js --audit --dry
node scripts/update-translations.js --audit --write
```
