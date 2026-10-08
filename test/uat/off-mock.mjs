// Nagebootste Open Food Facts- en Jumbo-server voor de UAT (de echte diensten zijn vanuit de testomgeving niet bereikbaar).
// Start de app met OFF_BASE=http://localhost:3999 en JUMBO_API_BASE=http://localhost:3999/v17
import http from 'node:http';
let n = 0;
const hash = (s) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 997, 7);
let basket = { id: 'b1', products: [{ sku: '999PAK', unit: 'pieces', quantity: 1 }], vagueTerms: [] };
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  let body = '';
  for await (const c of req) body += c;
  // --- Jumbo ---
  if (url.pathname === '/v17/users/login') {
    let b = JSON.parse(body); if (typeof b === 'string') b = JSON.parse(b);
    res.setHeader('Content-Type', 'application/json');
    if (b.password !== 'geheim') { res.statusCode = 401; return res.end('{}'); }
    res.setHeader('x-jumbo-token', 'uat-token');
    return res.end('{}');
  }
  if (url.pathname === '/v17/basket') {
    res.setHeader('Content-Type', 'application/json');
    if (req.headers['x-jumbo-token'] !== 'uat-token') { res.statusCode = 401; return res.end('{}'); }
    if (req.method === 'PUT') basket = { ...basket, products: JSON.parse(body).items };
    console.log('BASKET', JSON.stringify(basket.products));
    return res.end(JSON.stringify(basket));
  }
  if (url.pathname === '/v17/search') {
    res.setHeader('Content-Type', 'application/json');
    const q = url.searchParams.get('q');
    const id = `${hash(q)}PAK`;
    return res.end(JSON.stringify({ products: { data: [{ id, title: `Jumbo ${q}`, quantity: '500 g', imageInfo: { primaryView: [] }, prices: { price: { amount: 199 }, unitPrice: { unit: 'kg', price: { amount: 398 } } } }] } }));
  }
  res.setHeader('Content-Type', 'application/json');
  n++;
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
