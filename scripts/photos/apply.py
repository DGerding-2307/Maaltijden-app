# Zet de gekozen kandidaatfoto's om naar public/img/recipes/<sleutel>.jpg (4:3, 960×720)
# en schrijft de bronvermeldingen naar server/photos.js.
# Gebruik: python3 scripts/photos/apply.py <kandidatenmap> <keuzes.json> [--ingredienten]
#   --ingredienten: vierkant 480×480 naar public/img/ingredients en server/ingredient-photos.js
#   keuzes.json: { "<sleutel>": <kandidaatnummer>, ... } of { "<sleutel>": { "n": 1, "crop": [x0, y0, x1, y1] } }
#   (crop in fracties van de breedte/hoogte, om een deel van de foto te gebruiken)
import json, os, sys
from PIL import Image, ImageOps

src, choices_file = sys.argv[1], sys.argv[2]
ingredients = '--ingredienten' in sys.argv
root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
meta = json.load(open(os.path.join(src, 'meta.json')))
choices = json.load(open(choices_file))
out_dir = os.path.join(root, 'public', 'img', 'ingredients' if ingredients else 'recipes')
size = (480, 480) if ingredients else (960, 720)
os.makedirs(out_dir, exist_ok=True)

photos = {}
for key, choice in sorted(choices.items()):
    n = choice['n'] if isinstance(choice, dict) else choice
    cand = next(c for c in meta[key] if c['n'] == n)
    im = Image.open(os.path.join(src, key, cand['file']))
    im = ImageOps.exif_transpose(im).convert('RGB')
    if isinstance(choice, dict) and choice.get('crop'):
        x0, y0, x1, y1 = choice['crop']
        im = im.crop((int(x0 * im.width), int(y0 * im.height), int(x1 * im.width), int(y1 * im.height)))
    im = ImageOps.fit(im, size, Image.LANCZOS, centering=(0.5, 0.5))
    im.save(os.path.join(out_dir, f'{key}.jpg'), 'JPEG', quality=78, optimize=True, progressive=True)
    photos[key] = {k: cand.get(k) for k in ('author', 'license', 'license_url', 'page', 'source', 'title')}

body = json.dumps(photos, ensure_ascii=False, indent=2)
what = 'ingrediënten' if ingredients else 'standaardrecepten'
folder = 'ingredients' if ingredients else 'recipes'
with open(os.path.join(root, 'server', 'ingredient-photos.js' if ingredients else 'photos.js'), 'w') as f:
    f.write(f'// Gegenereerd door scripts/photos/apply.py – foto\'s bij de {what} (vrije licenties).\n')
    f.write(f'// Bestanden staan in public/img/{folder}/<sleutel>.jpg.\n')
    f.write(f'export const {"INGREDIENT_PHOTOS" if ingredients else "PHOTOS"} = {body};\n')
print(f'{len(photos)} foto\'s verwerkt')
