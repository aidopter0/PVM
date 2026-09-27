# PVM: Plano-Visual-Merch

A self-hosted planogram and visual merchandising tool for grocery retailers. Category and space managers use it to design shelf layouts, check that products physically fit, measure space share, and publish planograms to stores.

It covers the same core workflow as SaaS tools like PlanoHero: product catalogue → fixture layout → drag-and-drop merchandising → validation and analytics → approval → store rollout. It runs on your own infrastructure as a single container plus Postgres.

## Features

- **Product catalogue**: SKUs with GTIN, brand, category, real dimensions (mm), price and planogram colour. Bulk CSV import/upsert.
- **Fixtures**: gondola shelving, multideck chillers, freezers, end caps and pegboards, built from bays with adjustable shelves (height, depth, width).
- **Visual editor**: an SVG canvas drawn to scale. Drag products from the palette onto shelves, drag them between shelves and bays, and set facings and stack height. Includes undo/redo, zoom, keyboard nudging and collision-free snapping.
- **Live validation**: flags overhang, overlap, products too tall for the shelf clearance, and products deeper than the shelf. A planogram can't be approved or published while it has issues.
- **Analytics**: shelf fill, linear metres, facings, units of capacity (facings × stack × units deep), and linear space share by brand and by category.
- **Workflow**: Draft → Approved → Published → Archived. Published planograms are read-only; duplicate one to start the next revision. Saving checks for conflicts, so two people editing the same planogram can't silently overwrite each other.
- **Store rollout**: assign planograms to stores and see each store's planogram set.
- **Print**: a landscape execution sheet with the fixture drawing and a shelf-by-shelf pick list (SKU, position from left, facings, capacity) for store teams.

## Quick start (Docker)

```bash
cp .env.example .env            # change POSTGRES_PASSWORD
docker compose up -d --build
docker compose exec app node apps/api/dist/db/seed.js   # optional demo data
```

Open http://localhost:8080. Database migrations run automatically when the app starts.

## Development

Requirements: Node 22+ and a PostgreSQL 14+ database.

```bash
npm install
cp .env.example .env            # point DATABASE_URL at your database
export $(grep -v '^#' .env | xargs)
npm run db:migrate
npm run db:seed                 # demo categories, 26 grocery products, 3 stores, 1 cereal planogram
npm run dev                     # API on :3000, web on :5173 (proxies /api)
```

| Command             | What it does                                       |
| ------------------- | -------------------------------------------------- |
| `npm run dev`       | API (tsx watch) + Vite dev server                  |
| `npm test`          | Unit tests (planogram geometry, validation, CSV)   |
| `npm run typecheck` | TypeScript across all workspaces                   |
| `npm run build`     | Production bundles for the web app and API         |

## Project layout

```
apps/
  api/        Fastify + PostgreSQL REST API; also serves the built web app
    migrations/   Plain SQL migrations, applied in order at startup
    src/routes/   catalog (products, categories, CSV import), stores, planograms
  web/        React + Vite single-page app
    src/components/PlanogramCanvas.tsx   the SVG editor
packages/
  shared/     Domain types and pure planogram logic (validation, capacity,
              space share, snapping), used by both the API and the web app
```

Every dimension is stored as whole millimetres. A shelf's `y` is the height of its surface from the floor. A position's `x` is measured from the left edge of the bay.

## API overview

| Method & path                          | Purpose                                       |
| -------------------------------------- | --------------------------------------------- |
| `GET/POST /api/products`               | List (`?q=`, `?categoryId=`) / create          |
| `PUT/DELETE /api/products/:id`         | Update / delete (blocked while on a planogram) |
| `POST /api/products/import`            | `text/csv` body; upserts by SKU                |
| `GET/POST /api/categories`             | Categories                                     |
| `GET/POST/PUT/DELETE /api/stores[/:id]` | Stores                                         |
| `GET /api/stores/:id/planograms`       | Planograms assigned to a store                 |
| `GET/POST /api/planograms`             | List / create from a fixture template          |
| `GET/PUT /api/planograms/:id`          | Load / save the full layout                    |
| `PATCH /api/planograms/:id/status`     | Workflow transition (validated)                |
| `POST /api/planograms/:id/duplicate`   | New draft revision                             |
| `GET /api/planograms/:id/report`       | Summary, issues, space share                   |
| `GET/PUT /api/planograms/:id/stores`   | Store assignment                               |

## Configuration

| Variable           | Default | Notes                                              |
| ------------------ | ------- | -------------------------------------------------- |
| `DATABASE_URL`     | none (required) | Postgres connection string                 |
| `API_PORT`         | `3000`  |                                                    |
| `WEB_DIST`         | none    | Folder with the built web app to serve at `/`      |
| `MIGRATE_ON_START` | `true`  | Set `false` to run `db:migrate` yourself           |
| `CORS_ORIGIN`      | off     | Only needed if the web app is served from elsewhere |
| `LOG_LEVEL`        | `info`  |                                                    |

## Roadmap

See [docs/ROADMAP.md](docs/ROADMAP.md).
