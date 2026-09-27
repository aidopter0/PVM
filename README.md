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

## Getting started

You need **Node.js 22+** ([download](https://nodejs.org/en/download)) and a **PostgreSQL 14+** database. The setup script can provide Postgres for you through Docker or a local install.

```bash
npm run setup     # checks Node, creates .env, starts Postgres, creates the database, loads demo data
npm start         # builds and runs the app at http://localhost:3000
```

`npm run setup` is safe to re-run. It works through these steps:

1. **`.env`**: generated from `.env.example` with a random database password, unless the file already exists. The app reads it automatically.
2. **Postgres**: uses the database in `DATABASE_URL` if it can already reach it. Otherwise it starts one with Docker (`docker compose up -d db`), or with a local PostgreSQL install (Debian/Ubuntu packages or Homebrew), and creates the user and database from `.env`.
3. **Schema and data**: runs the migrations and loads demo data: 26 grocery products, 3 stores and a merchandised cereal planogram. Pass `--no-demo` to skip the demo data: `npm run setup -- --no-demo`.

To use an existing Postgres server instead, copy `.env.example` to `.env`, set `DATABASE_URL`, then run `npm run setup`.

## Deploying with Docker

Docker is all you need on the server; you don't need Node or Postgres installed:

```bash
cp .env.example .env            # set a strong POSTGRES_PASSWORD
docker compose up -d --build
docker compose exec app node apps/api/dist/db/seed.js   # optional demo data
```

Open http://localhost:8080. Migrations run automatically when the app starts. Postgres data lives in the `pgdata` volume.

## Development

```bash
npm run dev                     # API on :3000 with reload, web on :5173 (proxies /api)
```

| Command             | What it does                                       |
| ------------------- | -------------------------------------------------- |
| `npm run setup`     | One-time setup (see above)                         |
| `npm start`         | Build and run the production app on :3000          |
| `npm run db:up`     | Start only Postgres, in Docker                     |
| `npm run db:migrate`| Apply pending SQL migrations                       |
| `npm run db:seed`   | Load demo data into an empty database              |
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
| `DATABASE_URL`     | none (required) | Postgres connection string; set in `.env`  |
| `API_PORT`         | `3000`  |                                                    |
| `WEB_DIST`         | `apps/web/dist` | Folder with the built web app to serve at `/` |
| `SEED_DEMO`        | `false` | `true` loads demo data into an empty database at startup |
| `MIGRATE_ON_START` | `true`  | Set `false` to run `db:migrate` yourself           |
| `CORS_ORIGIN`      | off     | Only needed if the web app is served from elsewhere |
| `LOG_LEVEL`        | `info`  |                                                    |

## Roadmap

See [docs/ROADMAP.md](docs/ROADMAP.md).
