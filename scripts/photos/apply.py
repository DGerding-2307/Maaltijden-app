# Zet de gekozen kandidaatfoto's om naar public/img/recipes/<sleutel>.jpg (4:3, 960×720)
# en schrijft de bronvermeldingen naar server/photos.js.
# Gebruik: python3 scripts/photos/apply.py <kandidatenmap> <keuzes.json>
#   keuzes.json: { "<sleutel>": <kandidaatnummer>, ... }
import json, os, sys
from PIL import Image, ImageOps

src, choices_file = sys.argv[1], sys.argv[2]
root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
meta = json.load(open(os.path.join(src, 'meta.json')))
choices = json.load(open(choices_file))
out_dir = os.path.join(root, 'public', 'img', 'recipes')
os.makedirs(out_dir, exist_ok=True)

photos = {}
for key, n in sorted(choices.items()):
    cand = next(c for c in meta[key] if c['n'] == n)
    im = Image.open(os.path.join(src, key, cand['file']))
    im = ImageOps.exif_transpose(im).convert('RGB')
    im = ImageOps.fit(im, (960, 720), Image.LANCZOS, centering=(0.5, 0.5))
    im.save(os.path.join(out_dir, f'{key}.jpg'), 'JPEG', quality=78, optimize=True, progressive=True)
    photos[key] = {k: cand.get(k) for k in ('author', 'license', 'license_url', 'page', 'source', 'title')}

body = json.dumps(photos, ensure_ascii=False, indent=2)
with open(os.path.join(root, 'server', 'photos.js'), 'w') as f:
    f.write('// Gegenereerd door scripts/photos/apply.py – foto\'s bij de standaardrecepten (vrije licenties).\n')
    f.write('// Bestanden staan in public/img/recipes/<sleutel>.jpg.\n')
    f.write(f'export const PHOTOS = {body};\n')
print(f'{len(photos)} foto\'s verwerkt')
