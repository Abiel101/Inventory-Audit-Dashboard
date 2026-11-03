# Inventory-Audit-Dashboard
## Cloudflare deployment

- Build command: `npm run build` (output: `dist`)
- Deploy command: `npx wrangler deploy` (production) or `npx wrangler preview` (branch builds)
- Configuration lives in `wrangler.jsonc` (static assets from `dist`, SPA routing, `previews` block)
