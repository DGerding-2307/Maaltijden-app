// Nagebootste Open Food Facts-server voor de UAT (echte OFF is vanuit deze omgeving geblokkeerd).
import http from 'node:http';
let n = 0;
const hash = (s) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 997, 7);
http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
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
