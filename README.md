# Inventory-Audit-Dashboard

## Exporting completed audits

Choose **Export results** on a closed audit, then select **New version** for the current workbook or **TWC (old version)** for the reference workbook's Scan and Audit layout. Both use the same filename, so saving both to the same folder may overwrite the first file.

The TWC export includes cross-sheet formulas and one Scan row per unit. Location names appear in the unheaded column beside a blank separator row when the location changes. Item notes are attached to scan cells and the final note to the Audit UPC header as Excel comments. New inventory uploads capture sale price and sales-floor quantities when present; audits created before this change leave those cells blank if their snapshots lack the data.

## Cloudflare deployment

- Build command: `npm run build` (output: `dist`)
- Deploy command: `npx wrangler deploy` (production) or `npx wrangler preview` (branch builds)
- Configuration lives in `wrangler.jsonc` (static assets from `dist`, SPA routing, `previews` block)
