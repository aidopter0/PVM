-- Core schema. All physical dimensions are integer millimetres.

CREATE TABLE categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  parent_id   uuid REFERENCES categories(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name, parent_id)
);

CREATE TABLE products (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku          text NOT NULL UNIQUE,
  gtin         text,
  name         text NOT NULL,
  brand        text,
  category_id  uuid REFERENCES categories(id) ON DELETE SET NULL,
  width        integer NOT NULL CHECK (width > 0),
  height       integer NOT NULL CHECK (height > 0),
  depth        integer NOT NULL CHECK (depth > 0),
  price        numeric(10, 2),
  color        text,
  image_url    text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX products_category_idx ON products (category_id);
CREATE INDEX products_name_idx ON products (lower(name));

CREATE TABLE stores (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text NOT NULL UNIQUE,
  name        text NOT NULL,
  format      text,
  region      text,
  address     text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE planograms (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  status        text NOT NULL DEFAULT 'DRAFT'
                CHECK (status IN ('DRAFT', 'APPROVED', 'PUBLISHED', 'ARCHIVED')),
  fixture_type  text NOT NULL DEFAULT 'SHELVING'
                CHECK (fixture_type IN ('SHELVING', 'CHILLER', 'FREEZER', 'PEGBOARD', 'END_CAP')),
  category_id   uuid REFERENCES categories(id) ON DELETE SET NULL,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE bays (
  id             uuid PRIMARY KEY,
  planogram_id   uuid NOT NULL REFERENCES planograms(id) ON DELETE CASCADE,
  idx            integer NOT NULL,
  width          integer NOT NULL CHECK (width > 0),
  height         integer NOT NULL CHECK (height > 0),
  depth          integer NOT NULL CHECK (depth > 0)
);
CREATE INDEX bays_planogram_idx ON bays (planogram_id);

CREATE TABLE shelves (
  id         uuid PRIMARY KEY,
  bay_id     uuid NOT NULL REFERENCES bays(id) ON DELETE CASCADE,
  idx        integer NOT NULL,
  y          integer NOT NULL CHECK (y >= 0),
  clearance  integer NOT NULL CHECK (clearance > 0),
  depth      integer NOT NULL CHECK (depth > 0)
);
CREATE INDEX shelves_bay_idx ON shelves (bay_id);

CREATE TABLE positions (
  id          uuid PRIMARY KEY,
  shelf_id    uuid NOT NULL REFERENCES shelves(id) ON DELETE CASCADE,
  product_id  uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  x           integer NOT NULL,
  facings     integer NOT NULL CHECK (facings > 0),
  stack       integer NOT NULL DEFAULT 1 CHECK (stack > 0)
);
CREATE INDEX positions_shelf_idx ON positions (shelf_id);
CREATE INDEX positions_product_idx ON positions (product_id);

CREATE TABLE store_planograms (
  store_id        uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  planogram_id    uuid NOT NULL REFERENCES planograms(id) ON DELETE CASCADE,
  effective_from  date NOT NULL DEFAULT CURRENT_DATE,
  PRIMARY KEY (store_id, planogram_id)
);
