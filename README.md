# the news ticker

## Customization

### Keyword filters

Edit `FILTERS` in `scripts/fetch-feeds.mjs`. Each entry is a regex applied
case-insensitively against title + description. Filtered stories never reach
`stories.json`.

Note: The filters written here are not intended as value judgements, but rather as a way to reduce the noise of the feed.
They are not very good at this task but seem to help.

### Ticker speed

`TICKER_DURATION_SEC` at the top of `index.html`. Higher = slower. Defaults to
300 (5 minutes per loop). Hover the ticker to pause.

### Feeds

Edit `FEEDS` in `scripts/fetch-feeds.mjs` to add/remove sources.

### Update frequency

`.github/workflows/update-feeds.yml`, the `cron` line. `*/30 * * * *` is every
30 minutes. GitHub's scheduler is best-effort -- expect some skew.

## Running locally

```
node scripts/fetch-feeds.mjs
```

Writes `stories.json`. Then open `index.html` in a browser (via a local server
-- `python3 -m http.server` works -- because `fetch()` won't read from `file://`).

