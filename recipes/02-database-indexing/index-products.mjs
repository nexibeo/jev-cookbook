// Recipe 02: database indexing. Turn free-text rows into typed, indexed columns.
//
// A products table has only a title, a description and a price. One Jev call per row
// fills in a category, an audience, and a set of tags, which go into ordinary indexed
// columns and a join table. After that, plain SQL can answer questions the raw text
// could not: "eco-friendly gift ideas under $40", "everything for pet owners".
//
//   node --env-file=.env --disable-warning=ExperimentalWarning recipes/02-database-indexing/index-products.mjs
//
// Uses node:sqlite (built into Node 22+), so there is nothing to install. Re-running only
// indexes rows that have not been indexed yet, so it is safe to schedule.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, ask, choice, noul, pickLabels, mapLimit, pct, summary, saveResult } from '../../lib/jev.mjs';

const products = JSON.parse(readFileSync(new URL('./products.json', import.meta.url), 'utf8'));
mkdirSync(join(ROOT, 'out'), { recursive: true });
const file = join(ROOT, 'out', 'shop.db');
if (process.argv.includes('--fresh')) rmSync(file, { force: true });
const db = new DatabaseSync(file);

// 1. The source table, as it might already exist in your app.
db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY, title TEXT NOT NULL, description TEXT, price_cents INTEGER NOT NULL
  );
  -- 2. The columns Jev fills in, plus a join table for the multi-label tags.
  CREATE TABLE IF NOT EXISTS product_facets (
    product_id INTEGER PRIMARY KEY REFERENCES products(id),
    category TEXT NOT NULL, category_confidence REAL NOT NULL,
    audience TEXT NOT NULL, indexed_by TEXT NOT NULL, indexed_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS product_tags (
    product_id INTEGER REFERENCES products(id), tag TEXT NOT NULL, p REAL NOT NULL,
    PRIMARY KEY (product_id, tag)
  );
  CREATE INDEX IF NOT EXISTS idx_facets_category ON product_facets(category);
  CREATE INDEX IF NOT EXISTS idx_facets_audience ON product_facets(audience);
  CREATE INDEX IF NOT EXISTS idx_tags_tag ON product_tags(tag);
`);
const insertProduct = db.prepare('INSERT OR IGNORE INTO products (id, title, description, price_cents) VALUES (?, ?, ?, ?)');
for (const p of products) insertProduct.run(p.id, p.title, p.description, p.price_cents);

const CATEGORIES = {
  'electronics': 'Gadgets and devices that use power or batteries: audio, phones, computers, smart home, chargers',
  'home-kitchen': 'Cooking, dining, food storage and things for the home',
  'outdoor-sports': 'Camping, hiking, running, cycling, gym and fitness gear',
  'fashion': 'Clothing, shoes and accessories people wear',
  'beauty-personal-care': 'Skincare, haircare, oral care and personal grooming',
  'toys-kids': 'Toys, games and products made for babies and children',
  'books-media': 'Books, music, films and other media',
  'office': 'Work and study: desks, chairs, stationery, art supplies, laptop accessories',
  'pets': 'Food, beds, toys and equipment for animals',
  'food-drink': 'Things to eat or drink',
};
const AUDIENCES = {
  kids: 'Babies and children under 13',
  teens: 'Teenagers',
  adults: 'Adults buying for themselves',
  professionals: 'People buying for their work',
  'pet-owners': 'People buying for their animals',
  everyone: 'Anyone; no particular group',
};
// Tags are a closed vocabulary. Jev cannot invent tags; it says yes or no to each one.
const TAGS = {
  'eco-friendly': 'made from sustainable, organic, reusable or plastic-free materials',
  'handmade': 'made by hand or by a small studio or artisan',
  'gift-idea': 'presented or packaged as a gift, or an obvious present',
  'portable': 'designed to be carried around or used on the go',
  'smart-home': 'connects to Wi-Fi, an app or a voice assistant',
  'fitness': 'for exercise, training or sport',
  'sleep': 'helps with sleeping',
  'learning': 'teaches a skill or supports learning',
};
const QUESTIONS = {
  category: choice('Which store category does the product in `product` belong to?', CATEGORIES),
  audience: choice('Who is the product in `product` mainly for?', AUDIENCES),
  ...Object.fromEntries(Object.entries(TAGS).map(([tag, meaning]) =>
    [`tag:${tag}`, noul(`The product in \`product\` is ${meaning}`)])),
};

// 3. Index only rows without facets: the job is incremental and idempotent.
const todo = db.prepare(`
  SELECT p.id, p.title, p.description FROM products p
  LEFT JOIN product_facets f ON f.product_id = p.id WHERE f.product_id IS NULL
`).all();
console.log(`${todo.length} products to index (${products.length} in the table).`);

const answers = await mapLimit(todo, 8, async (row) => ({
  row,
  // The price stays out of the state: prices are numbers, and numbers are code's job.
  a: await ask({ product: { title: row.title, description: row.description } }, QUESTIONS),
}));

const saveFacets = db.prepare('INSERT INTO product_facets VALUES (?, ?, ?, ?, ?, ?)');
const saveTag = db.prepare('INSERT OR REPLACE INTO product_tags VALUES (?, ?, ?)');
const now = new Date().toISOString();
db.exec('BEGIN');
for (const { row, a } of answers) {
  saveFacets.run(row.id, a.category.choice, a.category.confidence, a.audience.choice, 'jev', now);
  for (const tag of pickLabels(a, 'tag:', { threshold: 0.6 })) saveTag.run(row.id, tag, a[`tag:${tag}`].noul);
}
db.exec('COMMIT');

// 4. Now the database answers questions the free text could not.
const show = (title, sql, ...params) => {
  console.log(`\n${title}\n  ${sql.replace(/\s+/g, ' ').trim()}`);
  for (const r of db.prepare(sql).all(...params)) console.log('  ', Object.values(r).join(' | '));
};
show('Products per category:',
  'SELECT category, COUNT(*) AS n FROM product_facets GROUP BY category ORDER BY n DESC');
show('Eco-friendly gift ideas under $40:', `
  SELECT p.title, printf('$%.2f', p.price_cents / 100.0) FROM products p
  JOIN product_tags g ON g.product_id = p.id AND g.tag = 'gift-idea'
  JOIN product_tags e ON e.product_id = p.id AND e.tag = 'eco-friendly'
  WHERE p.price_cents < ? ORDER BY p.price_cents`, 4000);
show('Everything for pet owners:', `
  SELECT p.title FROM products p JOIN product_facets f ON f.product_id = p.id
  WHERE f.audience = 'pet-owners' ORDER BY p.title`);
show('Rows to check by hand (category confidence below 0.8):', `
  SELECT p.title, f.category, round(f.category_confidence, 2) FROM products p
  JOIN product_facets f ON f.product_id = p.id WHERE f.category_confidence < 0.8`);

// 5. How well did it do? Compare with the hand labels in products.json.
const byId = Object.fromEntries(products.map((p) => [p.id, p]));
const rows = db.prepare('SELECT product_id, category, category_confidence FROM product_facets').all();
const ok = rows.filter((r) => (byId[r.product_id].label.acceptable ?? [byId[r.product_id].label.category]).includes(r.category));
const misses = rows.filter((r) => !ok.includes(r)).map((r) => `${byId[r.product_id].title}: ${r.category} (expected ${byId[r.product_id].label.category})`);
console.log(`\nCategory: ${ok.length}/${rows.length} match the hand labels (${pct(ok.length, rows.length)})${misses.length ? '\n  ' + misses.join('\n  ') : ''}`);
console.log(`${db.prepare('SELECT COUNT(*) n FROM product_tags').get().n} tags stored; database at out/shop.db`);
console.log(summary());
if (todo.length) saveResult('02-database-indexing', {
  metrics: { category_accuracy: ok.length / rows.length, rows: rows.length, tags: db.prepare('SELECT COUNT(*) n FROM product_tags').get().n },
  misses,
  facets: db.prepare(`SELECT p.title, f.category, round(f.category_confidence, 3) AS confidence, f.audience,
    (SELECT group_concat(tag, ', ') FROM product_tags t WHERE t.product_id = p.id) AS tags
    FROM products p JOIN product_facets f ON f.product_id = p.id ORDER BY p.id`).all(),
});
