# Roadmap

What's built is the core planogramming loop. Suggested next steps, roughly in priority order:

## 1. Authentication and roles
There is no login yet, so run it on a trusted network or behind an authenticating reverse proxy (for example oauth2-proxy). Next up:
- Local users plus OIDC/SSO.
- Roles: *admin*, *category manager* (edit), *approver*, and *store* (read-only access to its own assigned planograms).
- An audit trail of who changed or approved each planogram.

## 2. Sales-driven analytics
- Import sales and margin by SKU and store (CSV or scheduled from the ERP/POS).
- Compare space share with sales share, and flag over- and under-spaced SKUs.
- Days of supply: capacity ÷ average daily units sold. Flag positions that will run out before the next delivery.
- Sales and margin per linear metre, by shelf and by bay.

## 3. Smarter merchandising
- Auto-fill: fill a shelf or bay from a ranked SKU list using brand, size or price blocking rules.
- Rebalance facings to hit a target days of supply.
- Shelf-edge price labels, promo tags and product images on the canvas.
- Pegboard hook positions and chest-freezer (top-down) views.

## 4. Store execution
- Store-specific variants that come from a master planogram (for example a narrower bay count for small formats).
- Store compliance: staff upload a photo of the shelf and confirm it's done, with managers seeing completion rates.
- PDF export generated on the server, plus mobile-friendly views for store staff.

## 5. Store floor plans
- Draw a store layout with fixtures and link each fixture to its planogram.
- Heatmaps of space, sales and margin across the floor.

## 6. Integrations
- Product master sync (GS1 / GDSN dimensions, images).
- Webhooks when a planogram is published.
