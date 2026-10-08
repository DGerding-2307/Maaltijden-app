// Nagebootste Open Food Facts-server voor de UAT (de echte dienst is vanuit de testomgeving niet bereikbaar).
// Bootst ook Open Prices na. Start de app met OFF_BASE=http://localhost:3999 OPEN_PRICES_BASE=http://localhost:3999
import http from 'node:http';
let n = 0;
const hash = (s) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 997, 7);
http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/api/v1/prices') {
    // Een paar Nederlandse prijzen voor losse groente en verpakte producten
    const tag = url.searchParams.get('category_tag');
    const prodTag = url.searchParams.get('product__categories_tags__contains');
    const day = new Date(Date.now() - 10 * 86400000).toISOString().slice(0, 10);
    const stores = ['Albert Heijn', 'Jumbo', 'Lidl', 'Plus'];
    let items = [];
    if (tag && /carrots|onions|potatoes|leeks|curly-kale|sweet-peppers/.test(tag)) {
      items = stores.map((st, i) => ({ id: hash(tag) * 10 + i, type: 'CATEGORY', category_tag: tag, price: (0.8 + (hash(tag) % 20) / 10 + i * 0.1).toFixed(2), price_per: 'KILOGRAM', currency: 'EUR', date: day, location: { osm_address_country_code: 'NL', osm_brand: st, osm_name: st, osm_address_city: 'Utrecht' } }));
    } else if (prodTag && /milks|chicken-breasts|white-rices/.test(prodTag)) {
      items = stores.slice(0, 3).map((st, i) => ({ id: hash(prodTag) * 10 + i, type: 'PRODUCT', product_code: `87${i}`, price: (1 + (hash(prodTag) % 50) / 10 + i * 0.2).toFixed(2), currency: 'EUR', date: day, location: { osm_address_country_code: 'NL', osm_brand: st, osm_name: st }, product: { product_name: prodTag.replace('en:', ''), product_quantity: 1000, product_quantity_unit: 'g' } }));
    }
    return res.end(JSON.stringify({ items, page: 1, pages: 1, size: 100, total: items.length }));
  }
  if (url.pathname === '/cgi/search.pl') {
    const q = url.searchParams.get('search_terms');
    const base = 20 + hash(q) % 300;
    const products = ['Jumbo', 'AH', 'Merk'].map((b, i) => ({
      code: `87${hash(q)}${i}000000`.slice(0, 13), product_name: `${q} ${['naturel', 'vers', 'biologisch'][i]}`, brands: b, quantity: '500 g',
      nutriscore_grade: 'abcde'[hash(q) % 5], countries_tags: ['en:netherlands'],
      nutriments: { 'energy-kcal_100g': base + i * 4, proteins_100g: 2 + i, carbohydrates_100g: 5, sugars_100g: 2, fat_100g: 1, 'saturated-fat_100g': 0.2, fiber_100g: 2, salt_100g: 0.1 },
    }));
    return res.end(JSON.stringify({ count: 3, products }));
  }
  if (url.pathname.startsWith('/api/v2/product/')) {
    return res.end(JSON.stringify({ status: 1, product: { code: '8710400000001', product_name: 'Halfvolle melk', brands: 'Jumbo', quantity: '1 l', nutriscore_grade: 'a', nutriments: { 'energy-kcal_100g': 46, proteins_100g: 3.5, carbohydrates_100g: 4.8, sugars_100g: 4.8, fat_100g: 1.5, 'saturated-fat_100g': 1, salt_100g: 0.1 } } }));
  }
  res.statusCode = 404; res.end('{}');
}).listen(3999, () => console.log('off-mock op 3999'));
