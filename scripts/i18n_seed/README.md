# i18n seed catalogs

Flat JSON catalogs (`{key: value}`) extracted from the mobile app's
hardcoded `t("key", "fallback")` calls. There are 321 keys in 25
namespaces.

These are imported into the `i18n_messages` DB table on first deploy
via the `seed_i18n.py` script (which now reads from these JSON files
instead of parsing the TypeScript files).

## Usage

```bash
docker exec backend python -m scripts.seed_i18n
```

Or via the admin UI in app.opsflux.com → Settings → Configuration →
Traductions → Importer JSON.

## Updating

When a new `t("...")` is added to the mobile code:

1. Run `python3 scripts/extract-i18n-keys.py` to regenerate the
   `fr.json` / `en.json` / `es.json` / `pt.json` files.
2. Edit the new keys in the admin UI (or directly here for bulk).
3. Re-import via the admin UI.
