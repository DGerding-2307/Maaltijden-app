// Startdata: veelgebruikte Nederlandse ingrediënten en klassieke recepten.
// Voedingswaarden per 100 g zijn afgerond en gebaseerd op NEVO-gemiddelden (RIVM).
// Prijzen zijn schattingen van supermarktprijzen (Jumbo-niveau, 2026); pas ze aan via Ingrediënten → ✏️.
import { PHOTOS } from './photos.js';

const AGF = 'Aardappelen, groente & fruit';
const VV = 'Vlees, vis & vega';
const ZU = 'Zuivel, eieren & kaas';
const BR = 'Brood, ontbijt & beleg';
const WK = 'Pasta, rijst & wereldkeuken';
const CO = 'Conserven, soepen & sauzen';
const KR = 'Kruiden, specerijen & bakken';
const OL = 'Olie, azijn & smaakmakers';
const DV = 'Diepvries';
const DR = 'Dranken & overig';

export const CATEGORIES = [AGF, VV, ZU, BR, WK, CO, KR, OL, DV, DR, 'Overig'];

// Open Food Facts-categorieën (officiële taxonomie) per ingrediënt, voor prijzen uit Open Prices.
// Meerdere categorieën: van specifiek naar algemeen.
export const OFF_CATEGORY_BY_NAME = {
  'aardappelen kruimig': 'en:floury-potatoes,en:potatoes',
  'aardappelen vastkokend': 'en:waxy-potatoes,en:potatoes',
  'boerenkool gesneden': 'en:curly-kale',
  'zuurkool': 'en:sauerkrauts',
  'andijvie gesneden': 'en:endives',
  'wortel': 'en:carrots',
  'ui': 'en:onions',
  'rode ui': 'en:red-onions',
  'knoflook': 'en:garlics',
  'prei': 'en:leeks',
  'spruitjes': 'en:brussels-sprouts',
  'appel': 'en:apples',
  'banaan': 'en:bananas',
  'citroen': 'en:lemons',
  'paprika': 'en:sweet-peppers',
  'tomaat': 'en:tomatoes',
  'komkommer': 'en:cucumbers',
  'ijsbergsla': 'en:iceberg-lettuce',
  'champignons': 'en:champignon-mushrooms',
  'spinazie': 'en:spinachs',
  'sperziebonen': 'en:green-beans',
  'broccoli': 'en:broccoli',
  'bloemkool': 'en:cauliflowers',
  'courgette': 'en:zucchini',
  'peterselie': 'en:parsley',
  'gember': 'en:ginger',
  'rode peper': 'en:chili-peppers',
  'knolselderij': 'en:celeriac',
  'eieren': 'en:eggs',
  'halfvolle melk': 'en:semi-skimmed-milks',
  'volle melk': 'en:whole-milks',
  'roomboter': 'en:butters',
  'kipfilet': 'en:chicken-breasts',
  'kipdijfilet': 'en:chicken-thighs',
  'rookworst': 'en:smoked-sausages',
  'spekblokjes': 'en:lardons',
  'ontbijtspek': 'en:back-bacon',
  'zalmfilet': 'en:salmons',
  'garnalen': 'en:shrimps',
  'kabeljauwfilet': 'en:cods',
  'tofu': 'en:tofu',
  'witte rijst': 'en:white-rices',
  'zilvervliesrijst': 'en:brown-rices',
  'spaghetti': 'en:spaghetti',
  'penne': 'en:penne',
  'mie': 'en:egg-noodles',
  'havermout': 'en:rolled-oats',
  'bloem': 'en:wheat-flours',
  'suiker': 'en:sugars',
  'zout': 'en:salts',
  'kokosmelk': 'en:coconut-milks',
  'tomatenpuree': 'en:tomato-pastes',
  'passata': 'en:strained-tomatoes',
  'kikkererwten': 'en:chickpeas',
  'spliterwten': 'en:dried-split-peas',
  'doperwten': 'en:green-peas',
  'olijfolie': 'en:olive-oils',
  'zonnebloemolie': 'en:sunflower-oils',
  'pindakaas': 'en:peanut-butters',
  'magere kwark': 'en:quarks',
  'feta': 'en:feta',
  'mozzarella': 'en:mozzarella',
  'parmezaanse kaas': 'en:parmigiano-reggiano',
  'goudse kaas plakken': 'en:gouda',
  'volle yoghurt': 'en:yogurts',
  'mosterd': 'en:mustards',
  'mayonaise': 'en:mayonnaises',
  'sojasaus': 'en:soy-sauces',
  'sambal oelek': 'en:sambal',
  'pesto': 'en:green-pestos',
  'tortillawraps': 'en:wraps',
  'volkorenbrood': 'en:wholemeal-breads',
  'paneermeel': 'en:bread-crumbs',
  'maïs': 'en:corn',
  'appelmoes': 'en:apple-compotes',
  'cashewnoten': 'en:cashew-nuts',
  "pinda's": 'en:peanuts',
  'friet': 'en:potato-fries',
  'azijn': 'en:vinegars',
  'schenkstroop': 'en:syrups',
  'nootmuskaat': 'en:nutmeg',
  'kerriepoeder': 'en:curry-powders',
  'paprikapoeder': 'en:paprika',
  'laurierblad': 'en:bay-laurel',
  'kruidnagel': 'en:cloves',
  "patak's butter chicken saus": 'en:butter-chicken-sauces',
  'pandanrijst': 'en:white-rices',
  'lasagnebladen': 'en:lasagna-sheets',
  'groene currypasta': 'en:green-curry-pastes',
  'pompoen': 'en:butternut-squashes,en:pumpkins',
  'arboriorijst': 'en:arborio-rices',
  'kaneel': 'en:cinnamon',
  'zwarte olijven': 'en:black-olives',
  'komijn': 'en:cumin',
  'beenham': 'en:hams',
  'zwarte peper': 'en:black-peppers',
};

// [naam, categorie, kcal, eiwit, koolh, suikers, vet, verz.vet, vezels, zout, stuksgewicht, verpakking g, prijs ct, voorraad, aliassen, dichtheid, verpakkingslabel]
const I = [
  ['aardappelen kruimig', AGF, 86, 2.0, 18, 0.6, 0.1, 0, 1.6, 0, 150, 3000, 399, 0, 'aardappel,aardappelen,kruimige aardappelen', 1, '3 kg'],
  ['aardappelen vastkokend', AGF, 82, 2.0, 17, 0.6, 0.1, 0, 1.6, 0, 120, 1500, 279, 0, 'vastkokende aardappelen,krieltjes,kriel', 1, '1,5 kg'],
  ['boerenkool gesneden', AGF, 34, 2.9, 2.6, 1.0, 0.6, 0.1, 3.5, 0.03, null, 500, 199, 0, 'boerenkool', 1, '500 g'],
  ['zuurkool', AGF, 20, 1.1, 1.9, 0.5, 0.2, 0, 2.5, 1.4, null, 520, 129, 0, 'zuurkool naturel', 1, '520 g'],
  ['andijvie gesneden', AGF, 15, 1.3, 1.0, 0.3, 0.2, 0, 2.4, 0.05, null, 400, 189, 0, 'andijvie', 1, '400 g'],
  ['wortel', AGF, 34, 0.7, 6.3, 5.8, 0.2, 0, 2.7, 0.1, 80, 1000, 129, 0, 'wortels,winterpeen,peen,wortelen,winterwortel', 1, '1 kg'],
  ['ui', AGF, 32, 1.2, 5.9, 4.0, 0.1, 0, 1.7, 0, 100, 1000, 139, 0, 'uien,gele ui,gele uien,sjalot,sjalotten', 1, '1 kg'],
  ['rode ui', AGF, 34, 1.1, 6.5, 4.5, 0.1, 0, 1.7, 0, 100, 500, 129, 0, 'rode uien', 1, '500 g'],
  ['knoflook', AGF, 135, 6.4, 27, 1.0, 0.5, 0.1, 2.1, 0, 5, 150, 129, 0, 'teentje knoflook,knoflookteen,knoflookteentjes', 1, '3 bollen'],
  ['prei', AGF, 27, 1.6, 3.6, 2.6, 0.3, 0, 2.9, 0, 200, 400, 149, 0, 'preien', 1, '2 stuks'],
  ['spruitjes', AGF, 43, 3.9, 4.1, 1.9, 0.4, 0.1, 4.4, 0, null, 500, 179, 0, 'spruiten', 1, '500 g'],
  ['rode kool', AGF, 27, 1.4, 4.5, 3.5, 0.2, 0, 2.5, 0, null, 500, 149, 0, 'rodekool', 1, '500 g'],
  ['appel', AGF, 52, 0.3, 12, 10, 0.2, 0, 2.0, 0, 180, 1000, 249, 0, 'appels,goudreinet,elstar', 1, '1 kg'],
  ['banaan', AGF, 89, 1.1, 20, 12, 0.3, 0.1, 2.6, 0, 120, 1000, 199, 0, 'bananen', 1, '1 kg'],
  ['citroen', AGF, 29, 1.1, 2.5, 2.5, 0.3, 0, 2.8, 0, 120, 360, 169, 0, 'citroenen,citroensap', 1, '3 stuks'],
  ['paprika', AGF, 27, 1.0, 4.8, 4.2, 0.3, 0, 1.8, 0, 160, 480, 229, 0, 'rode paprika,paprika\'s,groene paprika,gele paprika', 1, '3 stuks'],
  ['tomaat', AGF, 20, 0.8, 2.9, 2.6, 0.2, 0, 1.2, 0, 100, 500, 169, 0, 'tomaten,trostomaten,cherrytomaten', 1, '500 g'],
  ['komkommer', AGF, 12, 0.6, 1.9, 1.6, 0.1, 0, 0.7, 0, 350, 350, 89, 0, 'komkommers', 1, '1 stuk'],
  ['ijsbergsla', AGF, 13, 1.0, 1.5, 1.4, 0.2, 0, 1.3, 0, 400, 400, 99, 0, 'sla,krop sla,ijsberg', 1, '1 krop'],
  ['champignons', AGF, 22, 3.1, 0.5, 0.2, 0.3, 0, 2.0, 0, 15, 250, 129, 0, 'champignon,kastanjechampignons', 1, '250 g'],
  ['spinazie', AGF, 23, 2.9, 1.1, 0.4, 0.4, 0.1, 2.2, 0.2, null, 300, 199, 0, 'verse spinazie,babyspinazie', 1, '300 g'],
  ['sperziebonen', AGF, 31, 1.8, 4.3, 2.3, 0.2, 0, 3.0, 0, null, 400, 199, 0, 'boontjes,sperzieboontjes', 1, '400 g'],
  ['broccoli', AGF, 34, 3.0, 2.7, 1.7, 0.4, 0.1, 3.0, 0, 400, 500, 179, 0, '', 1, '500 g'],
  ['bloemkool', AGF, 25, 2.0, 2.5, 2.0, 0.3, 0, 2.4, 0, 700, 700, 219, 0, '', 1, '1 stuk'],
  ['courgette', AGF, 17, 1.2, 2.2, 1.7, 0.3, 0.1, 1.1, 0, 300, 300, 99, 0, 'courgettes', 1, '1 stuk'],
  ['taugé', AGF, 30, 3.0, 4.0, 2.0, 0.2, 0, 1.8, 0, null, 300, 99, 0, 'tauge', 1, '300 g'],
  ['bosui', AGF, 32, 1.8, 4.7, 2.3, 0.2, 0, 2.6, 0, 15, 100, 79, 0, 'lente-ui,lenteui,bosuitjes', 1, '1 bos'],
  ['peterselie', AGF, 36, 3.0, 3.6, 0.9, 0.8, 0.1, 3.3, 0.1, 30, 30, 99, 0, 'verse peterselie,platte peterselie', 1, '1 bosje'],
  ['basilicum', AGF, 23, 3.2, 1.0, 0.3, 0.6, 0, 1.6, 0, 15, 15, 99, 0, 'verse basilicum', 1, '15 g'],
  ['gember', AGF, 80, 1.8, 15.8, 1.7, 0.8, 0.2, 2.0, 0, 30, 100, 99, 0, 'verse gember,gemberwortel', 1, '100 g'],
  ['rode peper', AGF, 40, 1.9, 8.8, 5.3, 0.4, 0, 1.5, 0, 10, 50, 79, 0, 'chilipeper,rode chilipeper,peper vers', 1, '50 g'],
  ['knolselderij', AGF, 18, 1.5, 2.3, 2.0, 0.3, 0, 3.9, 0.1, 600, 600, 139, 0, 'selderijknol', 1, '1 stuk'],
  ['soepgroente', AGF, 25, 1.2, 3.6, 2.5, 0.2, 0, 2.0, 0.05, null, 300, 149, 0, 'soepgroenten,verse soepgroente', 1, '300 g'],

  ['rookworst', VV, 290, 13, 2, 1, 26, 10, 0, 2.1, 275, 275, 279, 0, 'gelderse rookworst,rookworsten', 1, '275 g'],
  ['rundergehakt', VV, 220, 19, 0, 0, 16, 7, 0, 0.15, null, 500, 549, 0, 'gehakt rund', 1, '500 g'],
  ['half-om-half gehakt', VV, 240, 18, 0, 0, 19, 7.5, 0, 0.15, null, 500, 449, 0, 'gehakt,half om half gehakt,varkens- en rundergehakt', 1, '500 g'],
  ['kipfilet', VV, 108, 23, 0, 0, 1.6, 0.4, 0, 0.1, 130, 500, 599, 0, 'kipfilets,kippenborst,kipreepjes,kipblokjes', 1, '500 g'],
  ['kipdijfilet', VV, 160, 18, 0, 0, 9.8, 2.8, 0, 0.2, 100, 500, 649, 0, 'kippendij,kipdij,dijfilet', 1, '500 g'],
  ['riblappen', VV, 170, 21, 0, 0, 9.6, 4.0, 0, 0.15, null, 500, 899, 0, 'runderlappen,sukadelappen,stoofvlees,draadjesvlees', 1, '500 g'],
  ['klapstuk', VV, 200, 19, 0, 0, 14, 6, 0, 0.15, null, 600, 1099, 0, 'runderklapstuk', 1, '600 g'],
  ['spekblokjes', VV, 300, 15, 0.5, 0.5, 27, 10, 0, 2.5, null, 150, 199, 0, 'spekjes,gerookte spekblokjes,ontbijtspekblokjes', 1, '150 g'],
  ['ontbijtspek', VV, 290, 16, 0, 0, 25, 9.5, 0, 2.6, 12, 150, 199, 0, 'bacon,plakjes spek', 1, '150 g'],
  ['speklappen', VV, 300, 17, 0, 0, 26, 9.6, 0, 0.2, 100, 500, 499, 0, 'speklap', 1, '500 g'],
  ['varkenshaas', VV, 120, 21, 0, 0, 4, 1.4, 0, 0.1, null, 400, 749, 0, 'varkenshaasje', 1, '400 g'],
  ['kabeljauwfilet', VV, 80, 18, 0, 0, 0.7, 0.2, 0, 0.2, 125, 400, 899, 0, 'kabeljauw,witvis,koolvis', 1, '400 g'],
  ['zalmfilet', VV, 200, 20, 0, 0, 13, 2.5, 0, 0.1, 125, 250, 549, 0, 'zalm,zalmmoot', 1, '2 stuks'],
  ['garnalen', VV, 75, 17, 0, 0, 0.8, 0.2, 0, 1.0, null, 200, 449, 0, 'gepelde garnalen,scampi', 1, '200 g'],
  ['vegetarisch gehakt', VV, 190, 19, 5, 1, 10, 1, 4.5, 1.2, null, 300, 349, 0, 'vega gehakt,vegagehakt', 1, '300 g'],
  ['tofu', VV, 120, 12, 1.5, 0.5, 7, 1.1, 1, 0.03, null, 375, 249, 0, '', 1, '375 g'],

  ['halfvolle melk', ZU, 46, 3.5, 4.7, 4.7, 1.5, 1.0, 0, 0.1, null, 1030, 109, 0, 'melk', 1.03, '1 liter'],
  ['volle melk', ZU, 63, 3.4, 4.6, 4.6, 3.5, 2.3, 0, 0.1, null, 1030, 129, 0, '', 1.03, '1 liter'],
  ['roomboter', ZU, 740, 0.6, 0.6, 0.6, 82, 52, 0, 0.03, null, 250, 299, 1, 'boter,ongezouten roomboter', 1, '250 g'],
  ['eieren', ZU, 140, 12.5, 0.3, 0.3, 10, 2.8, 0, 0.35, 60, 600, 319, 0, 'ei,eier,scharreleieren', 1, '10 stuks'],
  ['slagroom', ZU, 340, 2.0, 3.0, 3.0, 35, 23, 0, 0.05, null, 250, 179, 0, 'room,kookroom', 1, '250 ml'],
  ['crème fraîche', ZU, 290, 2.3, 3.0, 3.0, 30, 20, 0, 0.1, null, 200, 149, 0, 'creme fraiche,zure room', 1, '200 ml'],
  ['griekse yoghurt', ZU, 120, 4.5, 4.0, 4.0, 10, 7, 0, 0.1, null, 500, 229, 0, 'turkse yoghurt', 1, '500 g'],
  ['volle yoghurt', ZU, 63, 3.6, 4.3, 4.3, 3.4, 2.2, 0, 0.1, null, 1000, 129, 0, 'yoghurt', 1, '1 liter'],
  ['magere kwark', ZU, 60, 9, 3.7, 3.7, 0.1, 0, 0, 0.1, null, 500, 149, 0, 'kwark', 1, '500 g'],
  ['geraspte kaas', ZU, 360, 24, 0, 0, 29, 19, 0, 1.8, null, 175, 249, 0, 'geraspte jonge kaas,geraspte belegen kaas,kaas geraspt', 1, '175 g'],
  ['goudse kaas plakken', ZU, 370, 25, 0, 0, 30, 19, 0, 1.9, 20, 200, 299, 0, 'kaas,plakjes kaas,belegen kaas,jonge kaas', 1, '200 g'],
  ['parmezaanse kaas', ZU, 400, 33, 0, 0, 29, 19, 0, 1.6, null, 100, 299, 0, 'parmezaan,parmigiano', 1, '100 g'],
  ['mozzarella', ZU, 250, 18, 1, 1, 19, 13, 0, 0.5, 125, 125, 99, 0, 'buffelmozzarella', 1, '125 g'],
  ['feta', ZU, 265, 14, 1.5, 1.5, 22, 15, 0, 2.7, null, 200, 249, 0, 'fetakaas', 1, '200 g'],

  ['volkorenbrood', BR, 230, 10, 39, 3, 2.9, 0.5, 6.5, 1.0, 35, 800, 229, 0, 'brood,boterham,boterhammen,sneetje brood,sneetjes brood', 1, '800 g'],
  ['tortillawraps', BR, 300, 8.5, 50, 3, 7, 3, 2.6, 1.2, 62, 370, 179, 0, 'wraps,tortilla,tortilla\'s', 1, '6 stuks'],
  ['havermout', BR, 370, 13, 59, 1, 7, 1.3, 10, 0, null, 500, 129, 0, 'havervlokken', 1, '500 g'],
  ['pindakaas', BR, 620, 25, 13, 6, 50, 9, 6, 0.9, null, 350, 229, 1, '', 1, '350 g'],
  ['schenkstroop', BR, 300, 0.5, 75, 70, 0, 0, 0, 0.1, null, 450, 199, 1, 'stroop,pannenkoekenstroop', 1.35, '450 g'],

  ['spaghetti', WK, 355, 12.5, 71, 3, 1.5, 0.3, 3, 0, null, 500, 109, 0, 'pasta', 1, '500 g'],
  ['macaroni', WK, 355, 12.5, 71, 3, 1.5, 0.3, 3, 0, null, 500, 109, 0, 'elleboogjes', 1, '500 g'],
  ['penne', WK, 355, 12.5, 71, 3, 1.5, 0.3, 3, 0, null, 500, 109, 0, 'penne rigate', 1, '500 g'],
  ['zilvervliesrijst', WK, 355, 7.5, 74, 0.7, 2.6, 0.6, 3.5, 0, null, 1000, 229, 0, 'volkorenrijst,bruine rijst', 1, '1 kg'],
  ['witte rijst', WK, 350, 7, 79, 0.2, 0.6, 0.2, 1, 0, null, 1000, 199, 0, 'rijst,basmatirijst,jasmijnrijst', 1, '1 kg'],
  ['mie', WK, 360, 13, 68, 2, 3, 1, 3, 0.3, 62.5, 250, 129, 0, 'eiermie,mie nestjes,bami', 1, '250 g'],
  ['ketjap manis', WK, 275, 2.5, 65, 60, 0, 0, 0, 5.5, null, 310, 199, 1, 'ketjap,ketjap manis zoet', 1.25, '250 ml'],
  ['sojasaus', WK, 60, 8, 6, 1, 0.1, 0, 0.8, 14, null, 170, 189, 1, 'ketjap asin,soja saus', 1.15, '150 ml'],
  ['sambal oelek', WK, 60, 1.5, 6, 3, 1.5, 0.2, 3, 6, null, 200, 149, 1, 'sambal', 1, '200 g'],
  ['nasi-bami kruiden', WK, 300, 10, 50, 10, 6, 1, 15, 8, 25, 25, 89, 0, 'nasi kruiden,bami kruiden,kruidenmix nasi,boemboe', 1, '1 zakje'],
  ['kokosmelk', WK, 190, 1.8, 3, 2, 19, 17, 0, 0.05, 400, 400, 169, 0, 'kokosmelk blik', 1, '400 ml'],

  ['tomatenpuree', CO, 90, 4.5, 15, 13, 0.5, 0.1, 3.5, 0.2, 70, 140, 79, 0, 'tomatenpuree blikje', 1, '2 x 70 g'],
  ['tomatenblokjes', CO, 22, 1.2, 3.5, 3.2, 0.2, 0, 1, 0.1, 400, 400, 89, 0, 'gepelde tomaten,tomaten blik,tomatenblokjes blik', 1, '400 g'],
  ['passata', CO, 30, 1.4, 5, 4.5, 0.2, 0, 1.3, 0.3, null, 500, 129, 0, 'gezeefde tomaten,tomatensaus', 1, '500 g'],
  ['kidneybonen', CO, 100, 7, 13, 1, 0.5, 0.1, 6.5, 0.5, 250, 250, 89, 0, 'kidney bonen,rode bonen,bruine bonen', 1, '400 g (250 g uitgelekt)'],
  ['kikkererwten', CO, 120, 7, 15, 0.5, 2.5, 0.3, 5, 0.4, 240, 240, 89, 0, '', 1, '400 g (240 g uitgelekt)'],
  ['maïs', CO, 80, 2.7, 14, 4, 1.2, 0.2, 3, 0.4, 140, 140, 79, 0, 'mais,maiskorrels', 1, '1 blikje'],
  ['spliterwten', CO, 340, 24, 50, 2, 1.6, 0.2, 23, 0, null, 500, 129, 0, 'groene spliterwten,erwten gedroogd', 1, '500 g'],
  ['appelmoes', CO, 75, 0.2, 17, 15, 0, 0, 1.2, 0, null, 360, 109, 0, '', 1, '360 g'],
  ['pesto', CO, 450, 5, 5, 3, 45, 6, 2, 2.5, null, 190, 229, 0, 'groene pesto,pesto genovese', 1, '190 g'],
  ['bouillonblokje', CO, 250, 10, 20, 5, 15, 8, 1, 45, 10, 120, 129, 1, 'bouillon,runderbouillon,kippenbouillon,groentebouillon,bouillonblokjes', 1, '12 stuks'],
  ['mayonaise', CO, 700, 1, 2, 2, 77, 6, 0, 1.2, null, 450, 199, 1, 'mayo', 1, '450 ml'],
  ['mosterd', CO, 150, 7, 6, 3, 10, 0.6, 3, 5.0, null, 370, 129, 1, 'grove mosterd,zaanse mosterd', 1, '370 g'],

  ['bloem', KR, 350, 10, 72, 1, 1.2, 0.2, 3, 0, null, 1000, 99, 1, 'tarwebloem,meel,patentbloem', 0.55, '1 kg'],
  ['paneermeel', KR, 380, 12, 74, 4, 2.8, 0.5, 4, 1.1, null, 400, 99, 1, '', 0.5, '400 g'],
  ['suiker', KR, 400, 0, 100, 100, 0, 0, 0, 0, null, 1000, 129, 1, 'kristalsuiker,basterdsuiker', 0.85, '1 kg'],
  ['zout', KR, 0, 0, 0, 0, 0, 0, 0, 100, null, 500, 59, 1, 'zeezout,keukenzout', 1.2, '500 g'],
  ['zwarte peper', KR, 250, 10, 38, 0.6, 3.3, 1.4, 25, 0, null, 40, 129, 1, 'peper,gemalen peper,versgemalen peper', 0.5, '40 g'],
  ['nootmuskaat', KR, 525, 6, 28, 3, 36, 26, 21, 0, null, 30, 159, 1, 'nootmuskaat gemalen', 0.5, '30 g'],
  ['paprikapoeder', KR, 290, 14, 20, 10, 13, 2, 35, 0.2, null, 40, 119, 1, 'paprikapoeder gerookt,edelzoet', 0.5, '40 g'],
  ['kerriepoeder', KR, 325, 14, 25, 3, 14, 2, 53, 0.1, null, 40, 119, 1, 'kerrie,currypoeder', 0.5, '40 g'],
  ['italiaanse kruiden', KR, 265, 9, 27, 4, 4, 1.5, 42, 0, null, 15, 99, 1, 'oregano,gedroogde oregano,tijm,provençaalse kruiden', 0.3, '15 g'],
  ['laurierblad', KR, 313, 7.6, 48, 0, 8, 2.3, 26, 0, 0.2, 5, 109, 1, 'laurierblaadjes,laurier', 1, '5 g'],
  ['kruidnagel', KR, 274, 6, 31, 2, 13, 4, 34, 0.6, 0.1, 20, 129, 1, 'kruidnagels,kruidnagelen', 1, '20 g'],

  ['olijfolie', OL, 900, 0, 0, 0, 100, 14, 0, 0, null, 460, 549, 1, 'olijfolie extra vierge', 0.92, '500 ml'],
  ['zonnebloemolie', OL, 900, 0, 0, 0, 100, 11, 0, 0, null, 920, 299, 1, 'olie,bakolie,arachideolie,frituurolie', 0.92, '1 liter'],
  ['azijn', OL, 20, 0, 0.6, 0, 0, 0, 0, 0, null, 1000, 79, 1, 'natuurazijn,witte wijnazijn', 1, '1 liter'],
  ['water', OL, 0, 0, 0, 0, 0, 0, 0, 0, null, 1000, 0, 1, 'kraanwater', 1, 'kraan'],

  ['doperwten', DV, 70, 5.5, 9, 4, 0.5, 0.1, 5, 0, null, 450, 149, 0, 'erwtjes,diepvries doperwten', 1, '450 g'],
  ['friet', DV, 150, 2.6, 23, 0.5, 5, 0.6, 2.5, 0.1, null, 1000, 249, 0, 'patat,frites,ovenfriet', 1, '1 kg'],

  ['cashewnoten', DR, 600, 18, 26, 6, 48, 9, 3.3, 0, null, 200, 299, 0, 'cashews', 1, '200 g'],
  ['pinda\'s', DR, 600, 25, 12, 4, 49, 7, 8, 0, null, 300, 199, 0, 'pinda,ongezouten pinda\'s', 1, '300 g'],

  // v2.4: extra ingrediënten voor de uitgebreide receptenset
  ["patak's butter chicken saus", CO, 120, 1.4, 9, 7, 8.5, 3.5, 1.2, 1.0, 450, 450, 329, 0, "butter chicken saus,patak's,patak's butter chicken,butter chicken pot", 1, '450 g'],
  ['pandanrijst', WK, 350, 7, 79, 0.2, 0.6, 0.2, 1, 0, null, 1000, 249, 0, 'pandan rijst,geurige rijst', 1, '1 kg'],
  ['koriander', AGF, 23, 2.1, 3.7, 0.9, 0.5, 0, 2.8, 0.1, 30, 30, 99, 0, 'verse koriander,koriandergroen', 1, '1 bosje'],
  ['lasagnebladen', WK, 355, 12.5, 70, 3, 1.5, 0.3, 3, 0, null, 250, 129, 0, 'lasagne bladen,lasagnevellen', 1, '250 g'],
  ['knoflooksaus', CO, 380, 1, 8, 6, 38, 3, 0, 1.6, null, 500, 199, 1, 'knoflook saus', 1, '500 ml'],
  ['groene currypasta', WK, 120, 2, 10, 5, 8, 1, 4, 7, null, 110, 219, 1, 'thaise groene curry,currypasta groen', 1, '110 g'],
  ['pompoen', AGF, 45, 1, 9.5, 2.2, 0.1, 0, 2, 0, 1200, 1200, 199, 0, 'flespompoen,butternut', 1, '1 stuk'],
  ['arboriorijst', WK, 350, 7, 78, 0.5, 0.6, 0.2, 1.4, 0, null, 500, 229, 0, 'risottorijst,arborio', 1, '500 g'],
  ['couscous', WK, 360, 12.8, 72, 0.5, 1.9, 0.3, 5, 0, null, 500, 149, 0, '', 1, '500 g'],
  ['beenham', VV, 110, 19, 1, 1, 3.5, 1.2, 0, 2.0, 20, 150, 229, 0, 'ham,plakjes ham,achterham', 1, '150 g'],
  ['kaneel', KR, 247, 4, 81, 2, 1.2, 0.3, 53, 0, null, 35, 129, 1, 'kaneelpoeder', 0.5, '35 g'],
  ['vermicelli', WK, 355, 12.5, 71, 3, 1.5, 0.3, 3, 0, null, 250, 89, 0, '', 1, '250 g'],
  ['zwarte olijven', CO, 145, 1, 3, 0, 15, 2, 3, 2.2, null, 150, 179, 0, 'olijven,kalamata olijven', 1, '150 g (uitgelekt)'],
  ['komijn', KR, 375, 18, 44, 2, 22, 1.5, 11, 0.4, null, 35, 129, 1, 'komijnpoeder,djinten,cumin', 0.5, '35 g'],
  ['honing', BR, 304, 0.3, 82, 82, 0, 0, 0, 0, null, 350, 299, 1, '', 1.4, '350 g'],
  // v2.8: vlees en vis om bij een maaltijd te kiezen
  ['gehaktbal', VV, 230, 16, 6, 1, 16, 6.5, 0.5, 1.3, 100, 400, 449, 0, 'gehaktballen', 1, '4 stuks'],
  ['slavink', VV, 260, 14, 4, 1, 21, 8, 0, 1.6, 100, 400, 399, 0, 'slavinken', 1, '4 stuks'],
  ['schnitzel', VV, 230, 18, 12, 1, 12, 3, 0.5, 1.0, 125, 250, 399, 0, 'varkensschnitzel,schnitzels', 1, '2 stuks'],
  ['kipschnitzel', VV, 210, 18, 13, 1, 9, 1.5, 0.5, 1.1, 125, 250, 379, 0, 'kipschnitzels', 1, '2 stuks'],
  ['hamburger', VV, 230, 18, 2, 1, 17, 7, 0, 1.2, 100, 400, 449, 0, 'hamburgers,burger', 1, '4 stuks'],
  ['biefstuk', VV, 130, 23, 0, 0, 4, 1.7, 0, 0.1, 150, 300, 749, 0, 'biefstukken,steak', 1, '2 stuks'],
  ['karbonade', VV, 200, 20, 0, 0, 13, 5, 0, 0.1, 175, 700, 649, 0, 'karbonades,schouderkarbonade,haaskarbonade', 1, '4 stuks'],
  ['kipdrumsticks', VV, 170, 19, 0, 0, 10, 3, 0, 0.2, 110, 1000, 549, 0, 'drumsticks,kippenpoten,kippenboutjes', 1, '1 kg'],
  ['braadworst', VV, 290, 13, 2, 1, 26, 10, 0, 1.8, 100, 400, 399, 0, 'braadworsten,saucijs', 1, '4 stuks'],
  ['vegaburger', VV, 200, 15, 8, 1, 11, 1.5, 4, 1.2, 90, 360, 399, 0, 'vegetarische burger,vega burger,plantaardige burger', 1, '4 stuks'],
];

// Recepten: [naam ingrediënt (of alias), hoeveelheid, eenheid, notitie, optioneel]
const RECIPES = [
  {
    title: 'Boerenkoolstamppot met rookworst',
    description: 'Dé Hollandse wintertopper: romige stamppot van boerenkool en kruimige aardappelen met spekjes en een rookworst.',
    servings: 4, prep_minutes: 15, cook_minutes: 25, category: 'Hoofdgerecht', tags: ['stamppot', 'winter', 'klassieker'],
    ingredients: [
      ['aardappelen kruimig', 1200, 'g', 'geschild, in stukken'],
      ['boerenkool gesneden', 500, 'g'],
      ['rookworst', 1, 'stuk'],
      ['spekblokjes', 150, 'g'],
      ['halfvolle melk', 150, 'ml', 'warm'],
      ['roomboter', 30, 'g'],
      ['mosterd', 1, 'el', '', 1],
      ['nootmuskaat', 1, 'snufje'],
      ['zout', 1, 'tl'],
      ['zwarte peper', 1, 'snufje'],
    ],
    steps: [
      'Schil de aardappelen, snijd ze in gelijke stukken en zet ze op met water en een snufje zout.',
      'Leg de boerenkool bovenop de aardappelen en kook alles in ca. 20 minuten gaar.',
      'Verwarm de rookworst volgens de verpakking in heet (niet kokend) water.',
      'Bak de spekblokjes in een droge koekenpan knapperig.',
      'Giet de aardappelen en boerenkool af en stamp fijn met de warme melk en boter.',
      'Roer de spekjes erdoor en breng op smaak met zout, peper, nootmuskaat en eventueel mosterd.',
      'Serveer met plakken rookworst en een kuiltje jus.',
    ],
  },
  {
    title: 'Hutspot met klapstuk',
    description: 'Traditionele hutspot van wortel, ui en aardappel met mals gestoofd klapstuk – Leids ontzet-recept.',
    servings: 4, prep_minutes: 20, cook_minutes: 180, category: 'Hoofdgerecht', tags: ['stamppot', 'winter', 'klassieker', 'stoofvlees'],
    ingredients: [
      ['klapstuk', 600, 'g'],
      ['bouillonblokje', 1, 'stuk'],
      ['laurierblad', 2, 'stuk'],
      ['kruidnagel', 2, 'stuk'],
      ['aardappelen kruimig', 1000, 'g'],
      ['wortel', 1000, 'g', 'winterpeen'],
      ['ui', 500, 'g'],
      ['roomboter', 30, 'g'],
      ['halfvolle melk', 100, 'ml'],
      ['zout', 1, 'tl'],
      ['zwarte peper', 1, 'snufje'],
    ],
    steps: [
      'Breng 1 liter water met het bouillonblokje, laurier en kruidnagel aan de kook.',
      'Leg het klapstuk erin en laat het ca. 2,5 uur zachtjes trekken tot het uit elkaar valt.',
      'Schil aardappelen, wortel en ui en snijd ze in stukken.',
      'Kook de groenten met een deel van het kookvocht van het vlees in ca. 25 minuten gaar.',
      'Giet af (vang wat vocht op) en stamp grof met boter en warme melk.',
      'Breng op smaak met zout en peper en serveer met het vlees in plakken.',
    ],
  },
  {
    title: 'Erwtensoep (snert)',
    description: 'Dikke Hollandse snert met speklap en rookworst. Lekkerder als hij een dag heeft gestaan.',
    servings: 6, prep_minutes: 20, cook_minutes: 150, category: 'Soep', tags: ['soep', 'winter', 'klassieker', 'meal-prep'],
    ingredients: [
      ['spliterwten', 500, 'g', 'afgespoeld'],
      ['water', 2, 'l'],
      ['speklappen', 300, 'g'],
      ['bouillonblokje', 2, 'stuk'],
      ['knolselderij', 300, 'g'],
      ['prei', 2, 'stuk'],
      ['wortel', 2, 'stuk'],
      ['ui', 1, 'stuk'],
      ['aardappelen kruimig', 300, 'g'],
      ['rookworst', 1, 'stuk'],
      ['zout', 1, 'tl'],
      ['zwarte peper', 1, 'snufje'],
    ],
    steps: [
      'Breng de spliterwten met water, bouillonblokjes en de speklappen aan de kook. Schep het schuim eraf.',
      'Laat ca. 1 uur zachtjes koken en roer regelmatig.',
      'Snijd knolselderij, prei, wortel, ui en aardappel in blokjes en voeg toe. Kook nog 45 minuten.',
      'Haal de speklappen eruit, snijd in stukjes en doe terug in de pan.',
      'Verwarm de rookworst in de soep in de laatste 15 minuten en snijd in plakjes.',
      'Breng op smaak met zout en peper. De soep moet zo dik zijn dat er een lepel in kan blijven staan.',
    ],
  },
  {
    title: 'Andijviestamppot met spekjes',
    description: 'Snelle stamppot met rauwe andijvie, knapperige spekjes en een beetje kaas.',
    servings: 4, prep_minutes: 10, cook_minutes: 20, category: 'Hoofdgerecht', tags: ['stamppot', 'snel', 'klassieker'],
    ingredients: [
      ['aardappelen kruimig', 1200, 'g'],
      ['andijvie gesneden', 400, 'g', 'fijngesneden'],
      ['spekblokjes', 200, 'g'],
      ['halfvolle melk', 150, 'ml'],
      ['roomboter', 20, 'g'],
      ['geraspte kaas', 100, 'g', '', 1],
      ['zout', 1, 'tl'],
      ['zwarte peper', 1, 'snufje'],
    ],
    steps: [
      'Kook de aardappelen in ca. 20 minuten gaar.',
      'Bak ondertussen de spekjes knapperig.',
      'Stamp de aardappelen met warme melk en boter.',
      'Schep de rauwe andijvie, spekjes (met bakvet) en eventueel de kaas erdoor.',
      'Breng op smaak met zout en peper en serveer direct.',
    ],
  },
  {
    title: 'Zuurkoolstamppot met rookworst',
    description: 'Frisse zuurkoolstamppot – lekker met een klodder mosterd.',
    servings: 4, prep_minutes: 10, cook_minutes: 25, category: 'Hoofdgerecht', tags: ['stamppot', 'winter', 'klassieker'],
    ingredients: [
      ['aardappelen kruimig', 1000, 'g'],
      ['zuurkool', 520, 'g'],
      ['rookworst', 1, 'stuk'],
      ['halfvolle melk', 100, 'ml'],
      ['roomboter', 20, 'g'],
      ['mosterd', 1, 'el', '', 1],
      ['zwarte peper', 1, 'snufje'],
    ],
    steps: [
      'Kook de aardappelen gaar met de zuurkool erbovenop (ca. 20 minuten).',
      'Verwarm de rookworst.',
      'Giet af en stamp met warme melk en boter.',
      'Breng op smaak met peper (zuurkool is al zout) en serveer met rookworst en mosterd.',
    ],
  },
  {
    title: 'Hachee met rode kool',
    description: 'Oma\'s hachee: langzaam gestoofd rundvlees met veel ui, laurier en kruidnagel, met rode kool en aardappelen.',
    servings: 4, prep_minutes: 20, cook_minutes: 180, category: 'Hoofdgerecht', tags: ['stoofvlees', 'winter', 'klassieker'],
    ingredients: [
      ['riblappen', 750, 'g', 'in blokken'],
      ['ui', 750, 'g', 'in ringen'],
      ['roomboter', 50, 'g'],
      ['bloem', 2, 'el'],
      ['laurierblad', 3, 'stuk'],
      ['kruidnagel', 3, 'stuk'],
      ['azijn', 2, 'el'],
      ['bouillonblokje', 1, 'stuk'],
      ['water', 500, 'ml'],
      ['aardappelen kruimig', 1000, 'g'],
      ['rode kool', 500, 'g'],
      ['appel', 1, 'stuk'],
      ['zout', 1, 'tl'],
      ['zwarte peper', 1, 'snufje'],
    ],
    steps: [
      'Bestrooi het vlees met zout, peper en bloem en bruin het rondom in de boter in een braadpan.',
      'Voeg de uien toe en bak ze 10 minuten mee tot ze zacht en goudbruin zijn.',
      'Voeg water, bouillonblokje, laurier, kruidnagel en azijn toe.',
      'Laat met de deksel op de pan ca. 3 uur heel zachtjes stoven, tot het vlees uit elkaar valt.',
      'Kook de rode kool met de appel in stukjes en een scheutje water ca. 30 minuten.',
      'Kook de aardappelen gaar en serveer alles samen.',
    ],
  },
  {
    title: 'Hollandse pannenkoeken',
    description: 'Dunne Hollandse pannenkoeken met stroop. Voor ca. 12 stuks.',
    servings: 4, prep_minutes: 10, cook_minutes: 30, category: 'Hoofdgerecht', tags: ['vegetarisch', 'kinderen', 'zoet'],
    ingredients: [
      ['bloem', 400, 'g'],
      ['halfvolle melk', 800, 'ml'],
      ['eieren', 3, 'stuk'],
      ['zout', 1, 'snufje'],
      ['roomboter', 40, 'g', 'om in te bakken'],
      ['schenkstroop', 100, 'g'],
    ],
    steps: [
      'Doe de bloem en een snufje zout in een kom en maak een kuiltje.',
      'Voeg de eieren en de helft van de melk toe en klop tot een glad beslag. Voeg dan de rest van de melk toe.',
      'Laat het beslag 15 minuten rusten.',
      'Smelt een klontje boter in een koekenpan en bak dunne pannenkoeken, ca. 1–2 minuten per kant.',
      'Serveer met stroop (of poedersuiker, spek, kaas of appel).',
    ],
  },
  {
    title: 'Nasi goreng',
    description: 'Indisch-Nederlandse gebakken rijst met kip, prei en een gebakken ei.',
    servings: 4, prep_minutes: 15, cook_minutes: 25, category: 'Hoofdgerecht', tags: ['indisch', 'rijst', 'restjes'],
    ingredients: [
      ['witte rijst', 300, 'g', 'liefst een dag van tevoren gekookt'],
      ['kipdijfilet', 400, 'g', 'in reepjes'],
      ['ui', 2, 'stuk'],
      ['knoflook', 2, 'teen'],
      ['prei', 1, 'stuk'],
      ['nasi-bami kruiden', 1, 'zakje'],
      ['ketjap manis', 3, 'el'],
      ['sambal oelek', 1, 'tl', '', 1],
      ['eieren', 4, 'stuk'],
      ['zonnebloemolie', 2, 'el'],
      ['komkommer', 0.5, 'stuk', 'voor erbij'],
    ],
    steps: [
      'Kook de rijst en laat hem goed afkoelen (bij voorkeur een dag van tevoren).',
      'Bak de kip in de olie in een wok bruin en zet apart.',
      'Fruit ui en knoflook, voeg de kruidenmix en sambal toe en bak 1 minuut.',
      'Voeg de prei in ringen toe en roerbak 3 minuten.',
      'Voeg de rijst en kip toe en roerbak tot alles heet is. Breng op smaak met ketjap.',
      'Bak 4 spiegeleieren en serveer bovenop de nasi met plakjes komkommer.',
    ],
  },
  {
    title: 'Macaroni met gehakt en kaas',
    description: 'Ouderwetse macaroni uit de oven met gehakt, paprika en een korstje kaas.',
    servings: 4, prep_minutes: 15, cook_minutes: 30, category: 'Hoofdgerecht', tags: ['pasta', 'ovenschotel', 'kinderen'],
    ingredients: [
      ['macaroni', 400, 'g'],
      ['half-om-half gehakt', 400, 'g'],
      ['ui', 1, 'stuk'],
      ['paprika', 1, 'stuk'],
      ['tomatenpuree', 1, 'blik', '70 g'],
      ['passata', 500, 'g'],
      ['italiaanse kruiden', 1, 'tl'],
      ['geraspte kaas', 150, 'g'],
      ['olijfolie', 1, 'el'],
      ['zout', 0.5, 'tl'],
    ],
    steps: [
      'Verwarm de oven voor op 200 °C. Kook de macaroni beetgaar.',
      'Bak het gehakt rul in de olie. Voeg ui en paprika in blokjes toe en bak 5 minuten mee.',
      'Roer tomatenpuree, passata en kruiden erdoor en laat 5 minuten pruttelen.',
      'Meng de saus met de macaroni en schep in een ovenschaal.',
      'Bestrooi met kaas en bak 15 minuten in de oven tot de kaas goudbruin is.',
    ],
  },
  {
    title: 'Spruitjes met gehaktballen en aardappelen',
    description: 'Hollandse pot: spruitjes, gekookte aardappelen en zelfgedraaide gehaktballen met jus.',
    servings: 4, prep_minutes: 20, cook_minutes: 30, category: 'Hoofdgerecht', tags: ['klassieker', 'winter'],
    ingredients: [
      ['half-om-half gehakt', 500, 'g'],
      ['eieren', 1, 'stuk'],
      ['paneermeel', 30, 'g'],
      ['nootmuskaat', 1, 'snufje'],
      ['roomboter', 60, 'g'],
      ['spruitjes', 750, 'g'],
      ['aardappelen kruimig', 1000, 'g'],
      ['zout', 1, 'tl'],
      ['zwarte peper', 1, 'snufje'],
    ],
    steps: [
      'Meng het gehakt met ei, paneermeel, zout, peper en nootmuskaat en draai er 4 ballen van.',
      'Bruin de gehaktballen rondom in de boter, voeg een scheut water toe en laat ze 25 minuten zachtjes garen met de deksel op de pan.',
      'Kook de aardappelen en de schoongemaakte spruitjes (ca. 8–10 minuten) gaar.',
      'Serveer met de jus uit de pan.',
    ],
  },
  {
    title: 'Zalm uit de oven met broccoli en krieltjes',
    description: 'Gezond en snel: zalm met citroen, geroosterde krieltjes en broccoli.',
    servings: 4, prep_minutes: 10, cook_minutes: 25, category: 'Hoofdgerecht', tags: ['vis', 'gezond', 'snel', 'eiwitrijk'],
    ingredients: [
      ['zalmfilet', 4, 'stuk'],
      ['aardappelen vastkokend', 800, 'g', 'krieltjes'],
      ['broccoli', 2, 'stuk'],
      ['citroen', 1, 'stuk'],
      ['olijfolie', 2, 'el'],
      ['zout', 1, 'tl'],
      ['zwarte peper', 1, 'snufje'],
    ],
    steps: [
      'Verwarm de oven voor op 200 °C.',
      'Halveer de krieltjes, meng met 1 el olie, zout en peper en rooster 25 minuten op een bakplaat.',
      'Leg na 10 minuten de zalm op de bakplaat, besprenkel met olie, citroensap, zout en peper.',
      'Kook of stoom de broccoliroosjes 5 minuten.',
      'Serveer met partjes citroen.',
    ],
  },
  {
    title: 'Kip kerrie met rijst',
    description: 'Romige kip kerrie met paprika en kokosmelk, een Hollandse favoriet.',
    servings: 4, prep_minutes: 10, cook_minutes: 25, category: 'Hoofdgerecht', tags: ['kip', 'rijst', 'snel'],
    ingredients: [
      ['kipfilet', 500, 'g', 'in blokjes'],
      ['ui', 1, 'stuk'],
      ['paprika', 2, 'stuk'],
      ['kerriepoeder', 2, 'el'],
      ['kokosmelk', 400, 'ml'],
      ['zilvervliesrijst', 300, 'g'],
      ['sperziebonen', 400, 'g'],
      ['zonnebloemolie', 1, 'el'],
      ['zout', 0.5, 'tl'],
    ],
    steps: [
      'Kook de rijst volgens de verpakking.',
      'Bak de kip in de olie bruin. Voeg ui en paprika toe en bak 5 minuten mee.',
      'Strooi de kerriepoeder erover en bak 1 minuut.',
      'Schenk de kokosmelk erbij en laat 10 minuten zachtjes pruttelen.',
      'Kook de sperziebonen 8 minuten en serveer alles samen.',
    ],
  },
  {
    title: 'Wraps met kip en groenten',
    description: 'Makkelijke wraps met gekruide kip, paprika, maïs en crème fraîche.',
    servings: 4, prep_minutes: 15, cook_minutes: 10, category: 'Hoofdgerecht', tags: ['snel', 'kinderen', 'kip'],
    ingredients: [
      ['tortillawraps', 8, 'stuk'],
      ['kipfilet', 400, 'g', 'in reepjes'],
      ['paprika', 2, 'stuk'],
      ['rode ui', 1, 'stuk'],
      ['maïs', 1, 'blik'],
      ['ijsbergsla', 0.5, 'stuk'],
      ['crème fraîche', 125, 'ml'],
      ['paprikapoeder', 2, 'tl'],
      ['zonnebloemolie', 1, 'el'],
    ],
    steps: [
      'Bestrooi de kip met paprikapoeder en zout en bak in de olie gaar.',
      'Bak de paprika en rode ui in reepjes 3 minuten mee.',
      'Verwarm de wraps kort in een droge pan of magnetron.',
      'Beleg de wraps met sla, kip, groenten, maïs en een lepel crème fraîche en rol op.',
    ],
  },
  {
    title: 'Groentesoep met balletjes',
    description: 'Heldere Hollandse groentesoep met soepballetjes en vermicelli.',
    servings: 4, prep_minutes: 20, cook_minutes: 30, category: 'Soep', tags: ['soep', 'kinderen'],
    ingredients: [
      ['rundergehakt', 250, 'g'],
      ['paneermeel', 15, 'g'],
      ['nootmuskaat', 1, 'snufje'],
      ['water', 1.5, 'l'],
      ['bouillonblokje', 2, 'stuk'],
      ['soepgroente', 300, 'g'],
      ['prei', 1, 'stuk'],
      ['wortel', 2, 'stuk'],
      ['spaghetti', 50, 'g', 'of vermicelli, in stukjes gebroken'],
    ],
    steps: [
      'Breng het water met de bouillonblokjes aan de kook.',
      'Meng het gehakt met paneermeel, zout en nootmuskaat en draai er kleine balletjes van.',
      'Voeg de balletjes en de groenten toe en laat 20 minuten zachtjes koken.',
      'Voeg de laatste 8 minuten de pasta toe.',
    ],
  },
  {
    title: 'Havermout met banaan en pindakaas',
    description: 'Vullend ontbijt met havermout, melk, banaan en een lepel pindakaas.',
    servings: 2, prep_minutes: 2, cook_minutes: 5, category: 'Ontbijt', tags: ['ontbijt', 'vegetarisch', 'snel'],
    ingredients: [
      ['havermout', 80, 'g'],
      ['halfvolle melk', 400, 'ml'],
      ['banaan', 1, 'stuk'],
      ['pindakaas', 1, 'el'],
    ],
    steps: [
      'Breng de melk met de havermout al roerend aan de kook.',
      'Laat 3–4 minuten zachtjes koken tot het dik wordt.',
      'Verdeel over 2 kommen en top met plakjes banaan en pindakaas.',
    ],
  },
  {
    title: 'Uitsmijter met kaas',
    description: 'De Hollandse lunchklassieker: brood met gebakken eieren en kaas.',
    servings: 2, prep_minutes: 5, cook_minutes: 5, category: 'Lunch', tags: ['lunch', 'snel', 'eiwitrijk'],
    ingredients: [
      ['volkorenbrood', 4, 'stuk', 'sneetjes'],
      ['eieren', 4, 'stuk'],
      ['goudse kaas plakken', 4, 'plak'],
      ['tomaat', 1, 'stuk'],
      ['roomboter', 10, 'g'],
      ['zout', 1, 'snufje'],
    ],
    steps: [
      'Besmeer het brood en beleg met kaas.',
      'Bak de eieren in boter tot het wit gestold is.',
      'Leg de eieren op het brood en bestrooi met zout en peper. Serveer met plakjes tomaat.',
    ],
  },
  {
    title: 'Butter chicken met pandanrijst',
    description: "Romige butter chicken met een pot Patak's Butter Chicken-saus en geurige pandanrijst. Klaar in een half uur.",
    servings: 4, prep_minutes: 10, cook_minutes: 20, category: 'Hoofdgerecht', cuisine: 'Indiaas', tags: ['indiaas', 'kip', 'rijst', 'snel'],
    ingredients: [
      ['kipdijfilet', 600, 'g', 'in blokjes'],
      ["patak's butter chicken saus", 1, 'pot', '450 g'],
      ['ui', 1, 'stuk', 'fijngesneden'],
      ['roomboter', 15, 'g'],
      ['slagroom', 50, 'ml', 'voor een extra romige saus', 1],
      ['pandanrijst', 300, 'g'],
      ['koriander', 0.5, 'bos', 'grof gehakt', 1],
    ],
    steps: [
      'Spoel de pandanrijst af en kook hem volgens de verpakking (ca. 12 minuten), of in een rijstkoker.',
      'Smelt de boter in een hapjespan en fruit de ui 3 minuten.',
      'Voeg de kip toe en bak 5–6 minuten tot hij rondom bruin is.',
      "Schenk de pot Patak's Butter Chicken-saus erbij, spoel de pot om met een scheutje water en laat 10–12 minuten zachtjes pruttelen tot de kip gaar is.",
      'Roer eventueel de slagroom erdoor.',
      'Serveer met de pandanrijst en bestrooi met koriander.',
    ],
  },
  {
    title: 'Bami goreng',
    description: 'Gebakken mie met kip, prei, wortel en taugé – het broertje van nasi goreng.',
    servings: 4, prep_minutes: 15, cook_minutes: 20, category: 'Hoofdgerecht', tags: ['indisch', 'kip', 'snel'],
    ingredients: [
      ['mie', 250, 'g'],
      ['kipdijfilet', 400, 'g', 'in reepjes'],
      ['prei', 1, 'stuk', 'in ringen'],
      ['wortel', 2, 'stuk', 'in reepjes'],
      ['taugé', 200, 'g'],
      ['ui', 1, 'stuk'],
      ['knoflook', 2, 'teen'],
      ['nasi-bami kruiden', 1, 'zakje'],
      ['ketjap manis', 3, 'el'],
      ['sambal oelek', 1, 'tl', '', 1],
      ['zonnebloemolie', 2, 'el'],
    ],
    steps: [
      'Kook de mie volgens de verpakking, spoel af met koud water en laat uitlekken.',
      'Bak de kip in de olie in een wok bruin en zet apart.',
      'Fruit ui en knoflook, voeg de kruidenmix en sambal toe en bak 1 minuut.',
      'Roerbak wortel en prei 4 minuten, voeg de taugé toe.',
      'Voeg de mie en kip toe, roerbak tot alles heet is en breng op smaak met ketjap.',
    ],
  },
  {
    title: 'Chili con carne',
    description: 'Pittige stoofpot van gehakt, bonen en maïs met rijst.',
    servings: 4, prep_minutes: 15, cook_minutes: 35, category: 'Hoofdgerecht', cuisine: 'Mexicaans', tags: ['meal-prep', 'pittig'],
    ingredients: [
      ['rundergehakt', 400, 'g'],
      ['ui', 1, 'stuk'],
      ['knoflook', 2, 'teen'],
      ['paprika', 1, 'stuk'],
      ['tomatenblokjes', 1, 'blik'],
      ['tomatenpuree', 1, 'blik'],
      ['kidneybonen', 1, 'blik'],
      ['maïs', 1, 'blik'],
      ['komijn', 1, 'tl'],
      ['paprikapoeder', 2, 'tl'],
      ['rode peper', 1, 'stuk', '', 1],
      ['witte rijst', 300, 'g'],
      ['olijfolie', 1, 'el'],
      ['crème fraîche', 100, 'ml', 'om erbij te geven', 1],
    ],
    steps: [
      'Kook de rijst volgens de verpakking.',
      'Bak het gehakt rul in de olie. Voeg ui, knoflook en paprika toe en bak 5 minuten mee.',
      'Roer komijn, paprikapoeder, rode peper en tomatenpuree erdoor en bak 1 minuut.',
      'Voeg tomatenblokjes, uitgelekte bonen en maïs toe en laat 20 minuten zachtjes stoven.',
      'Serveer met rijst en een lepel crème fraîche.',
    ],
  },
  {
    title: 'Spaghetti bolognese',
    description: 'De favoriet van jong en oud: spaghetti met een rijke saus van gehakt, wortel en tomaat.',
    servings: 4, prep_minutes: 10, cook_minutes: 30, category: 'Hoofdgerecht', cuisine: 'Italiaans', tags: ['pasta', 'kinderen'],
    ingredients: [
      ['spaghetti', 400, 'g'],
      ['rundergehakt', 400, 'g'],
      ['ui', 1, 'stuk'],
      ['wortel', 1, 'stuk', 'fijn geraspt'],
      ['knoflook', 2, 'teen'],
      ['tomatenblokjes', 1, 'blik'],
      ['tomatenpuree', 1, 'blik'],
      ['italiaanse kruiden', 2, 'tl'],
      ['olijfolie', 1, 'el'],
      ['parmezaanse kaas', 40, 'g', 'geraspt'],
    ],
    steps: [
      'Bak het gehakt rul in de olie. Voeg ui, wortel en knoflook toe en bak 5 minuten.',
      'Roer de tomatenpuree erdoor en bak 1 minuut mee.',
      'Voeg tomatenblokjes en kruiden toe en laat de saus minstens 20 minuten zachtjes pruttelen.',
      'Kook de spaghetti beetgaar.',
      'Serveer met de saus en geraspte Parmezaanse kaas.',
    ],
  },
  {
    title: 'Lasagne',
    description: 'Ovenlasagne met gehaktsaus, zelfgemaakte bechamel en een goudbruin kaaskorstje.',
    servings: 6, prep_minutes: 30, cook_minutes: 45, category: 'Hoofdgerecht', cuisine: 'Italiaans', tags: ['pasta', 'ovenschotel', 'meal-prep'],
    ingredients: [
      ['lasagnebladen', 250, 'g'],
      ['half-om-half gehakt', 500, 'g'],
      ['ui', 1, 'stuk'],
      ['wortel', 1, 'stuk', 'fijn geraspt'],
      ['knoflook', 2, 'teen'],
      ['tomatenblokjes', 1, 'blik'],
      ['passata', 500, 'g'],
      ['italiaanse kruiden', 2, 'tl'],
      ['roomboter', 50, 'g', 'voor de bechamel'],
      ['bloem', 50, 'g'],
      ['halfvolle melk', 600, 'ml'],
      ['nootmuskaat', 1, 'snufje'],
      ['geraspte kaas', 150, 'g'],
    ],
    steps: [
      'Verwarm de oven voor op 190 °C.',
      'Bak het gehakt rul met ui, wortel en knoflook. Voeg tomatenblokjes, passata en kruiden toe en laat 15 minuten pruttelen.',
      'Smelt de boter, roer de bloem erdoor en voeg al roerend de melk toe tot een gladde, dikke saus. Breng op smaak met nootmuskaat.',
      'Maak in een ovenschaal laagjes: gehaktsaus, lasagnebladen, bechamel. Eindig met bechamel.',
      'Bestrooi met kaas en bak 40–45 minuten tot de bladen gaar zijn en de bovenkant goudbruin is.',
    ],
  },
  {
    title: 'Pasta pesto met kip en spinazie',
    description: 'Snelle pasta met groene pesto, kip, spinazie en tomaatjes.',
    servings: 4, prep_minutes: 10, cook_minutes: 15, category: 'Hoofdgerecht', cuisine: 'Italiaans', tags: ['pasta', 'snel', 'kip'],
    ingredients: [
      ['penne', 400, 'g'],
      ['kipfilet', 400, 'g', 'in blokjes'],
      ['pesto', 190, 'g', '1 potje'],
      ['spinazie', 200, 'g'],
      ['tomaat', 250, 'g', 'cherrytomaatjes, gehalveerd'],
      ['olijfolie', 1, 'el'],
      ['parmezaanse kaas', 30, 'g', '', 1],
    ],
    steps: [
      'Kook de penne beetgaar.',
      'Bak de kip in de olie gaar en goudbruin.',
      'Laat de spinazie in dezelfde pan slinken.',
      'Meng de pasta met kip, spinazie, pesto en tomaatjes.',
      'Serveer met Parmezaanse kaas.',
    ],
  },
  {
    title: 'Penne arrabbiata',
    description: 'Pittige Italiaanse tomatensaus met knoflook en rode peper. Vegetarisch en goedkoop.',
    servings: 4, prep_minutes: 5, cook_minutes: 20, category: 'Hoofdgerecht', cuisine: 'Italiaans', tags: ['pasta', 'vegetarisch', 'snel', 'pittig'],
    ingredients: [
      ['penne', 400, 'g'],
      ['tomatenblokjes', 2, 'blik'],
      ['knoflook', 3, 'teen'],
      ['rode peper', 1, 'stuk'],
      ['olijfolie', 3, 'el'],
      ['basilicum', 0.5, 'bos', '', 1],
      ['parmezaanse kaas', 30, 'g', '', 1],
    ],
    steps: [
      'Verwarm de olie en bak knoflook en rode peper 1 minuut zachtjes.',
      'Voeg de tomatenblokjes toe en laat 15 minuten indikken. Breng op smaak met zout.',
      'Kook de penne beetgaar en meng met de saus.',
      'Serveer met basilicum en Parmezaanse kaas.',
    ],
  },
  {
    title: 'Pasta carbonara',
    description: 'Echte carbonara zonder room: spaghetti met spekjes, ei en Parmezaanse kaas.',
    servings: 4, prep_minutes: 10, cook_minutes: 15, category: 'Hoofdgerecht', cuisine: 'Italiaans', tags: ['pasta', 'snel'],
    ingredients: [
      ['spaghetti', 400, 'g'],
      ['spekblokjes', 200, 'g'],
      ['eieren', 4, 'stuk'],
      ['parmezaanse kaas', 80, 'g', 'fijn geraspt'],
      ['zwarte peper', 1, 'tl', 'versgemalen'],
    ],
    steps: [
      'Kook de spaghetti beetgaar en bewaar een kopje kookvocht.',
      'Bak de spekjes knapperig.',
      'Klop eieren en kaas los met veel zwarte peper.',
      'Haal de pan van het vuur, meng spaghetti en spekjes en roer het eimengsel erdoor met een scheutje kookvocht tot een romige saus.',
    ],
  },
  {
    title: 'Pasta met zalm en spinazie',
    description: 'Romige pasta met zalm, spinazie en een vleugje citroen.',
    servings: 4, prep_minutes: 10, cook_minutes: 15, category: 'Hoofdgerecht', tags: ['pasta', 'vis', 'snel'],
    ingredients: [
      ['penne', 400, 'g'],
      ['zalmfilet', 2, 'stuk', 'in blokjes'],
      ['spinazie', 300, 'g'],
      ['crème fraîche', 200, 'ml'],
      ['knoflook', 1, 'teen'],
      ['citroen', 0.5, 'stuk', 'rasp en sap'],
      ['olijfolie', 1, 'el'],
    ],
    steps: [
      'Kook de penne beetgaar.',
      'Fruit de knoflook in de olie, voeg de spinazie toe en laat slinken.',
      'Roer de crème fraîche erdoor en leg de zalm erin. Laat 4–5 minuten garen.',
      'Breng op smaak met citroen, zout en peper en meng met de pasta.',
    ],
  },
  {
    title: 'Shakshuka',
    description: 'Eieren gegaard in een gekruide saus van tomaat en paprika. Lekker met brood.',
    servings: 4, prep_minutes: 10, cook_minutes: 25, category: 'Hoofdgerecht', cuisine: 'Midden-Oosten', tags: ['vegetarisch', 'eiwitrijk'],
    ingredients: [
      ['eieren', 6, 'stuk'],
      ['tomatenblokjes', 2, 'blik'],
      ['paprika', 2, 'stuk'],
      ['ui', 1, 'stuk'],
      ['knoflook', 2, 'teen'],
      ['komijn', 1, 'tl'],
      ['paprikapoeder', 1, 'tl'],
      ['olijfolie', 2, 'el'],
      ['feta', 100, 'g', 'verkruimeld', 1],
      ['volkorenbrood', 4, 'stuk', 'sneetjes, om erbij te eten'],
    ],
    steps: [
      'Fruit ui, paprika en knoflook 8 minuten in de olie.',
      'Voeg de specerijen en tomatenblokjes toe en laat 10 minuten indikken.',
      'Maak kuiltjes in de saus, breek de eieren erin en laat met de deksel op de pan 6–8 minuten garen.',
      'Bestrooi met feta en serveer met brood.',
    ],
  },
  {
    title: 'Kapsalon met kip',
    description: 'Rotterdamse klassieker uit de oven: friet, gekruide kip, kaas en frisse sla.',
    servings: 4, prep_minutes: 15, cook_minutes: 25, category: 'Hoofdgerecht', tags: ['kip', 'kinderen'],
    ingredients: [
      ['friet', 800, 'g'],
      ['kipdijfilet', 500, 'g', 'in reepjes'],
      ['kerriepoeder', 1, 'el'],
      ['paprikapoeder', 1, 'el'],
      ['geraspte kaas', 150, 'g'],
      ['ijsbergsla', 0.5, 'stuk'],
      ['tomaat', 2, 'stuk'],
      ['komkommer', 0.5, 'stuk'],
      ['knoflooksaus', 100, 'ml'],
      ['sambal oelek', 1, 'tl', '', 1],
      ['zonnebloemolie', 1, 'el'],
    ],
    steps: [
      'Bak de friet in de oven volgens de verpakking.',
      'Bestrooi de kip met kerrie, paprikapoeder en zout en bak in de olie gaar.',
      'Verdeel de friet over een ovenschaal, leg de kip erop en bestrooi met kaas. Gratineer 5 minuten.',
      'Leg er sla, tomaat en komkommer op en serveer met knoflooksaus en sambal.',
    ],
  },
  {
    title: 'Broccoli-ovenschotel met kip',
    description: 'Aardappel, broccoli en kip in een romige saus met een kaaskorst.',
    servings: 4, prep_minutes: 20, cook_minutes: 30, category: 'Hoofdgerecht', tags: ['ovenschotel', 'kip', 'kinderen'],
    ingredients: [
      ['aardappelen vastkokend', 800, 'g', 'in plakjes'],
      ['broccoli', 1, 'stuk', 'in roosjes'],
      ['kipfilet', 400, 'g', 'in blokjes'],
      ['crème fraîche', 200, 'ml'],
      ['halfvolle melk', 100, 'ml'],
      ['geraspte kaas', 125, 'g'],
      ['nootmuskaat', 1, 'snufje'],
      ['zonnebloemolie', 1, 'el'],
    ],
    steps: [
      'Verwarm de oven voor op 200 °C. Kook de aardappelplakjes 8 minuten en de broccoli 3 minuten.',
      'Bak de kip in de olie bruin.',
      'Meng crème fraîche, melk, nootmuskaat, zout en peper.',
      'Doe aardappel, broccoli en kip in een ovenschaal, giet de saus erover en bestrooi met kaas.',
      'Bak 20 minuten tot de kaas goudbruin is.',
    ],
  },
  {
    title: 'Kipsaté met pindasaus en rijst',
    description: 'Gemarineerde kipspiesjes met zelfgemaakte pindasaus, rijst en komkommer.',
    servings: 4, prep_minutes: 20, cook_minutes: 20, category: 'Hoofdgerecht', tags: ['indisch', 'kip', 'rijst'],
    ingredients: [
      ['kipdijfilet', 600, 'g', 'in blokjes'],
      ['ketjap manis', 4, 'el', '2 voor de marinade, 2 voor de saus'],
      ['knoflook', 2, 'teen'],
      ['pindakaas', 150, 'g'],
      ['kokosmelk', 200, 'ml'],
      ['sambal oelek', 1, 'tl'],
      ['witte rijst', 300, 'g'],
      ['komkommer', 1, 'stuk'],
      ['zonnebloemolie', 1, 'el'],
    ],
    steps: [
      'Marineer de kip minstens 15 minuten in 2 el ketjap met 1 geperste teen knoflook.',
      'Kook de rijst.',
      'Rijg de kip aan spiesjes en bak of grill ze rondom 10–12 minuten.',
      'Verwarm pindakaas, kokosmelk, 2 el ketjap, sambal en de rest van de knoflook al roerend tot een gladde saus.',
      'Serveer met rijst, pindasaus en plakjes komkommer.',
    ],
  },
  {
    title: 'Kip ketjap met sperziebonen',
    description: 'Zoete, kleverige kip in ketjap met gember, sperziebonen en rijst.',
    servings: 4, prep_minutes: 10, cook_minutes: 25, category: 'Hoofdgerecht', tags: ['indisch', 'kip', 'rijst', 'snel'],
    ingredients: [
      ['kipdijfilet', 600, 'g', 'in stukken'],
      ['ketjap manis', 5, 'el'],
      ['ui', 1, 'stuk'],
      ['knoflook', 2, 'teen'],
      ['gember', 1, 'stuk', '2 cm, geraspt'],
      ['sperziebonen', 400, 'g'],
      ['witte rijst', 300, 'g'],
      ['zonnebloemolie', 1, 'el'],
    ],
    steps: [
      'Kook de rijst en de sperziebonen (8 minuten).',
      'Bak de kip in de olie bruin. Voeg ui, knoflook en gember toe en bak 3 minuten mee.',
      'Voeg ketjap en een scheut water toe en laat 10 minuten sudderen tot de saus stroperig is.',
      'Serveer met rijst en sperziebonen.',
    ],
  },
  {
    title: 'Thaise groene curry met kip',
    description: 'Romige groene curry met kokosmelk, paprika en sperziebonen, met pandanrijst.',
    servings: 4, prep_minutes: 10, cook_minutes: 20, category: 'Hoofdgerecht', cuisine: 'Thais', tags: ['kip', 'rijst', 'pittig'],
    ingredients: [
      ['kipfilet', 500, 'g', 'in reepjes'],
      ['groene currypasta', 3, 'el'],
      ['kokosmelk', 1, 'blik'],
      ['paprika', 1, 'stuk'],
      ['sperziebonen', 200, 'g', 'gehalveerd'],
      ['pandanrijst', 300, 'g'],
      ['basilicum', 0.5, 'bos', '', 1],
      ['zonnebloemolie', 1, 'el'],
    ],
    steps: [
      'Kook de pandanrijst.',
      'Bak de currypasta 1 minuut in de olie, voeg de kip toe en bak rondom wit.',
      'Schenk de kokosmelk erbij en voeg paprika en sperziebonen toe. Laat 10 minuten zachtjes koken.',
      'Serveer met rijst en basilicum.',
    ],
  },
  {
    title: 'Gado-gado',
    description: 'Indonesische groenteschotel met aardappel, ei, tofu en pindasaus. Vegetarisch.',
    servings: 4, prep_minutes: 20, cook_minutes: 20, category: 'Hoofdgerecht', tags: ['indisch', 'vegetarisch'],
    ingredients: [
      ['aardappelen vastkokend', 600, 'g'],
      ['sperziebonen', 300, 'g'],
      ['taugé', 200, 'g'],
      ['eieren', 4, 'stuk'],
      ['tofu', 200, 'g', 'in blokjes'],
      ['komkommer', 0.5, 'stuk'],
      ['pindakaas', 150, 'g'],
      ['ketjap manis', 2, 'el'],
      ['sambal oelek', 1, 'tl'],
      ['knoflook', 1, 'teen'],
      ['zonnebloemolie', 1, 'el'],
    ],
    steps: [
      'Kook de aardappelen gaar en snijd in stukken. Kook de eieren hard (8 minuten).',
      'Kook de sperziebonen 6 minuten en de taugé 1 minuut.',
      'Bak de tofu goudbruin in de olie.',
      'Verwarm pindakaas met ketjap, sambal, knoflook en een scheut water tot een gladde saus.',
      'Schik alles op een schaal met komkommer en giet de pindasaus erover.',
    ],
  },
  {
    title: 'Tomatensoep met balletjes',
    description: 'Hollandse tomatensoep met soepballetjes, net als vroeger.',
    servings: 4, prep_minutes: 15, cook_minutes: 30, category: 'Soep', tags: ['soep', 'kinderen'],
    ingredients: [
      ['tomatenblokjes', 2, 'blik'],
      ['passata', 500, 'g'],
      ['ui', 1, 'stuk'],
      ['wortel', 1, 'stuk'],
      ['bouillonblokje', 2, 'stuk'],
      ['water', 750, 'ml'],
      ['rundergehakt', 200, 'g'],
      ['paneermeel', 15, 'g'],
      ['crème fraîche', 100, 'ml', '', 1],
      ['olijfolie', 1, 'el'],
    ],
    steps: [
      'Fruit ui en wortel 5 minuten in de olie.',
      'Voeg tomatenblokjes, passata, water en bouillonblokjes toe en kook 15 minuten. Pureer glad.',
      'Meng het gehakt met paneermeel, zout en peper en draai er kleine balletjes van.',
      'Laat de balletjes 8 minuten in de soep garen. Serveer met een lepel crème fraîche.',
    ],
  },
  {
    title: 'Pompoensoep',
    description: 'Fluweelzachte soep van flespompoen met kokosmelk en een vleugje kerrie.',
    servings: 4, prep_minutes: 15, cook_minutes: 25, category: 'Soep', tags: ['soep', 'vegetarisch', 'herfst'],
    ingredients: [
      ['pompoen', 1, 'stuk', 'geschild, in blokjes'],
      ['ui', 1, 'stuk'],
      ['wortel', 2, 'stuk'],
      ['gember', 1, 'stuk', '2 cm'],
      ['kerriepoeder', 1, 'tl'],
      ['bouillonblokje', 2, 'stuk', 'groentebouillon'],
      ['water', 1, 'l'],
      ['kokosmelk', 200, 'ml'],
      ['olijfolie', 1, 'el'],
    ],
    steps: [
      'Fruit ui, gember en kerrie in de olie.',
      'Voeg pompoen, wortel, water en bouillonblokjes toe en kook 20 minuten.',
      'Pureer de soep glad en roer de kokosmelk erdoor. Breng op smaak met zout en peper.',
    ],
  },
  {
    title: 'Champignonsoep',
    description: 'Romige champignonsoep met verse peterselie.',
    servings: 4, prep_minutes: 10, cook_minutes: 25, category: 'Soep', tags: ['soep', 'vegetarisch'],
    ingredients: [
      ['champignons', 500, 'g'],
      ['ui', 1, 'stuk'],
      ['roomboter', 30, 'g'],
      ['bloem', 2, 'el'],
      ['bouillonblokje', 2, 'stuk'],
      ['water', 1, 'l'],
      ['slagroom', 100, 'ml'],
      ['peterselie', 0.5, 'bos'],
    ],
    steps: [
      'Fruit ui in de boter en bak de champignons 5 minuten mee.',
      'Strooi de bloem erover en roer 1 minuut.',
      'Voeg water en bouillonblokjes toe en kook 15 minuten. Pureer half.',
      'Roer de slagroom erdoor en serveer met peterselie.',
    ],
  },
  {
    title: 'Kippensoep met vermicelli',
    description: 'Troostrijke heldere kippensoep met groenten en vermicelli.',
    servings: 4, prep_minutes: 15, cook_minutes: 35, category: 'Soep', tags: ['soep', 'kinderen'],
    ingredients: [
      ['kipfilet', 300, 'g'],
      ['soepgroente', 300, 'g'],
      ['prei', 1, 'stuk'],
      ['wortel', 1, 'stuk'],
      ['bouillonblokje', 2, 'stuk', 'kippenbouillon'],
      ['water', 1.5, 'l'],
      ['vermicelli', 75, 'g'],
      ['peterselie', 0.5, 'bos', '', 1],
    ],
    steps: [
      'Breng water met bouillonblokjes aan de kook en laat de kipfilet er 15 minuten in garen.',
      'Haal de kip eruit en trek hem in draadjes.',
      'Kook de groenten 10 minuten in de bouillon, voeg vermicelli toe en kook nog 5 minuten.',
      'Doe de kip terug en serveer met peterselie.',
    ],
  },
  {
    title: "Vegetarische burrito's",
    description: 'Wraps gevuld met rijst, bonen, maïs, paprika en kaas.',
    servings: 4, prep_minutes: 15, cook_minutes: 20, category: 'Hoofdgerecht', cuisine: 'Mexicaans', tags: ['vegetarisch', 'kinderen'],
    ingredients: [
      ['tortillawraps', 8, 'stuk'],
      ['witte rijst', 150, 'g'],
      ['kidneybonen', 1, 'blik'],
      ['maïs', 1, 'blik'],
      ['paprika', 2, 'stuk'],
      ['ui', 1, 'stuk'],
      ['komijn', 1, 'tl'],
      ['paprikapoeder', 1, 'tl'],
      ['geraspte kaas', 100, 'g'],
      ['crème fraîche', 125, 'ml'],
      ['tomaat', 2, 'stuk'],
      ['olijfolie', 1, 'el'],
    ],
    steps: [
      'Kook de rijst.',
      'Bak ui en paprika 5 minuten in de olie, voeg specerijen, bonen en maïs toe en warm door.',
      'Verdeel rijst, bonenmengsel, tomaat, kaas en crème fraîche over de wraps en rol op.',
      'Bak de burrito’s eventueel kort in een droge pan voor een krokant laagje.',
    ],
  },
  {
    title: 'Kabeljauw uit de oven met groenten',
    description: 'Kabeljauw op een bedje van courgette, paprika en tomaat, met krieltjes.',
    servings: 4, prep_minutes: 15, cook_minutes: 25, category: 'Hoofdgerecht', tags: ['vis', 'gezond', 'eiwitrijk'],
    ingredients: [
      ['kabeljauwfilet', 4, 'stuk'],
      ['courgette', 1, 'stuk'],
      ['paprika', 1, 'stuk'],
      ['tomaat', 3, 'stuk'],
      ['citroen', 1, 'stuk'],
      ['italiaanse kruiden', 1, 'tl'],
      ['olijfolie', 3, 'el'],
      ['aardappelen vastkokend', 800, 'g', 'krieltjes'],
    ],
    steps: [
      'Verwarm de oven voor op 200 °C. Rooster de krieltjes met 1 el olie 30 minuten.',
      'Snijd courgette, paprika en tomaat in stukken, meng met olie, kruiden, zout en peper en verdeel over een ovenschaal.',
      'Leg de vis erop, besprenkel met citroensap en bak 15–18 minuten.',
    ],
  },
  {
    title: 'Spinaziestamppot met gebakken ei',
    description: 'Snelle vegetarische stamppot met spinazie en een spiegelei.',
    servings: 4, prep_minutes: 10, cook_minutes: 20, category: 'Hoofdgerecht', tags: ['stamppot', 'vegetarisch', 'snel'],
    ingredients: [
      ['aardappelen kruimig', 1200, 'g'],
      ['spinazie', 400, 'g'],
      ['halfvolle melk', 150, 'ml'],
      ['roomboter', 30, 'g'],
      ['eieren', 4, 'stuk'],
      ['nootmuskaat', 1, 'snufje'],
      ['geraspte kaas', 80, 'g', '', 1],
    ],
    steps: [
      'Kook de aardappelen gaar.',
      'Laat de spinazie in een pan slinken en knijp uit.',
      'Stamp de aardappelen met warme melk en boter, schep de spinazie (en kaas) erdoor en breng op smaak met nootmuskaat.',
      'Bak 4 spiegeleieren en serveer op de stamppot.',
    ],
  },
  {
    title: 'Speklapjes met sperziebonen en krieltjes',
    description: 'Knapperige speklapjes met boontjes en gebakken krieltjes – zondags eten.',
    servings: 4, prep_minutes: 10, cook_minutes: 30, category: 'Hoofdgerecht', tags: ['klassieker'],
    ingredients: [
      ['speklappen', 4, 'stuk'],
      ['sperziebonen', 500, 'g'],
      ['aardappelen vastkokend', 800, 'g', 'krieltjes'],
      ['roomboter', 30, 'g'],
      ['zout', 1, 'tl'],
      ['zwarte peper', 1, 'snufje'],
    ],
    steps: [
      'Kook de krieltjes 10 minuten voor en bak ze daarna in de helft van de boter goudbruin.',
      'Bestrooi de speklappen met zout en peper en bak ze in een droge pan 6–8 minuten per kant knapperig.',
      'Kook de sperziebonen 8 minuten en schep er de rest van de boter door.',
    ],
  },
  {
    title: 'Varkenshaas met champignonroomsaus',
    description: 'Malse varkenshaas met een romige champignonsaus, broccoli en krieltjes.',
    servings: 4, prep_minutes: 15, cook_minutes: 25, category: 'Hoofdgerecht', tags: ['feestelijk'],
    ingredients: [
      ['varkenshaas', 500, 'g'],
      ['champignons', 250, 'g'],
      ['ui', 1, 'stuk'],
      ['slagroom', 200, 'ml'],
      ['roomboter', 30, 'g'],
      ['italiaanse kruiden', 1, 'tl'],
      ['aardappelen vastkokend', 800, 'g', 'krieltjes'],
      ['broccoli', 1, 'stuk'],
    ],
    steps: [
      'Kook of rooster de krieltjes en kook de broccoli 5 minuten.',
      'Snijd de varkenshaas in medaillons, bestrooi met zout en peper en bak 3 minuten per kant in de boter. Houd warm.',
      'Bak ui en champignons in hetzelfde vet, blus met de slagroom en laat 5 minuten inkoken met de kruiden.',
      'Leg het vlees terug in de saus en serveer.',
    ],
  },
  {
    title: 'Draadjesvlees met sperziebonen',
    description: 'Urenlang gestoofd rundvlees dat uit elkaar valt, met aardappelen, boontjes en appelmoes.',
    servings: 4, prep_minutes: 20, cook_minutes: 180, category: 'Hoofdgerecht', tags: ['stoofvlees', 'klassieker', 'winter'],
    ingredients: [
      ['riblappen', 750, 'g'],
      ['ui', 2, 'stuk'],
      ['roomboter', 40, 'g'],
      ['laurierblad', 2, 'stuk'],
      ['kruidnagel', 2, 'stuk'],
      ['bouillonblokje', 1, 'stuk'],
      ['water', 500, 'ml'],
      ['aardappelen kruimig', 1000, 'g'],
      ['sperziebonen', 500, 'g'],
      ['appelmoes', 360, 'g'],
    ],
    steps: [
      'Bruin het vlees rondom in de boter en bak de uien mee.',
      'Voeg water, bouillonblokje, laurier en kruidnagel toe en laat 3 uur heel zacht stoven.',
      'Kook de aardappelen en de sperziebonen.',
      'Trek het vlees met twee vorken in draadjes en serveer met de jus en appelmoes.',
    ],
  },
  {
    title: 'Risotto met champignons',
    description: 'Romige risotto met gebakken champignons en Parmezaanse kaas.',
    servings: 4, prep_minutes: 10, cook_minutes: 30, category: 'Hoofdgerecht', cuisine: 'Italiaans', tags: ['vegetarisch', 'rijst'],
    ingredients: [
      ['arboriorijst', 300, 'g'],
      ['champignons', 400, 'g'],
      ['ui', 1, 'stuk'],
      ['knoflook', 2, 'teen'],
      ['bouillonblokje', 2, 'stuk', 'groentebouillon'],
      ['water', 1, 'l', 'heet'],
      ['roomboter', 40, 'g'],
      ['parmezaanse kaas', 60, 'g'],
      ['peterselie', 0.5, 'bos', '', 1],
    ],
    steps: [
      'Los de bouillonblokjes op in het hete water.',
      'Bak de champignons in de helft van de boter goudbruin en zet apart.',
      'Fruit ui en knoflook, voeg de rijst toe en roer 1 minuut.',
      'Voeg steeds een scheut bouillon toe en roer tot hij is opgenomen; herhaal 18–20 minuten tot de rijst romig en net gaar is.',
      'Roer champignons, de rest van de boter en de kaas erdoor en serveer met peterselie.',
    ],
  },
  {
    title: 'Griekse salade met feta',
    description: 'Frisse salade met komkommer, tomaat, paprika, olijven en feta.',
    servings: 4, prep_minutes: 15, cook_minutes: 0, category: 'Salade', cuisine: 'Grieks', tags: ['vegetarisch', 'snel', 'zomer'],
    ingredients: [
      ['komkommer', 1, 'stuk'],
      ['tomaat', 4, 'stuk'],
      ['rode ui', 1, 'stuk'],
      ['paprika', 1, 'stuk'],
      ['feta', 200, 'g'],
      ['zwarte olijven', 100, 'g'],
      ['olijfolie', 3, 'el'],
      ['italiaanse kruiden', 1, 'tl', 'oregano'],
      ['volkorenbrood', 4, 'stuk', 'sneetjes, om erbij te eten', 1],
    ],
    steps: [
      'Snijd komkommer, tomaat, paprika en ui in stukken.',
      'Meng met de olijven en leg de feta in blokken erop.',
      'Besprenkel met olijfolie en oregano en breng op smaak met peper.',
    ],
  },
  {
    title: 'Couscoussalade met kip',
    description: 'Lauwwarme couscous met kip, groente, feta en citroen. Ook lekker als lunch voor de volgende dag.',
    servings: 4, prep_minutes: 20, cook_minutes: 10, category: 'Salade', tags: ['kip', 'meal-prep', 'lunch'],
    ingredients: [
      ['couscous', 250, 'g'],
      ['bouillonblokje', 1, 'stuk'],
      ['kipfilet', 400, 'g'],
      ['komkommer', 0.5, 'stuk'],
      ['tomaat', 2, 'stuk'],
      ['paprika', 1, 'stuk'],
      ['rode ui', 0.5, 'stuk'],
      ['feta', 100, 'g', '', 1],
      ['peterselie', 0.5, 'bos'],
      ['citroen', 1, 'stuk'],
      ['olijfolie', 3, 'el'],
    ],
    steps: [
      'Giet 300 ml kokend water met het bouillonblokje over de couscous en laat 5 minuten wellen. Maak los met een vork.',
      'Bak de kip in 1 el olie gaar en snijd in stukjes.',
      'Meng couscous, kip, gesneden groenten, peterselie, citroensap en de rest van de olie.',
      'Verkruimel de feta erover.',
    ],
  },
  {
    title: 'Wentelteefjes',
    description: 'Oud brood in een jasje van ei, melk en kaneel, gebakken in boter.',
    servings: 4, prep_minutes: 5, cook_minutes: 15, category: 'Ontbijt', tags: ['ontbijt', 'zoet', 'kinderen', 'restjes'],
    ingredients: [
      ['volkorenbrood', 8, 'stuk', 'sneetjes, liefst oud'],
      ['eieren', 3, 'stuk'],
      ['halfvolle melk', 250, 'ml'],
      ['kaneel', 1, 'tl'],
      ['suiker', 2, 'el'],
      ['roomboter', 30, 'g'],
    ],
    steps: [
      'Klop eieren, melk, kaneel en 1 el suiker los in een diep bord.',
      'Haal de sneetjes er kort doorheen.',
      'Bak ze in boter aan beide kanten goudbruin en bestrooi met de rest van de suiker.',
    ],
  },
  {
    title: 'Overnight oats met appel en kaneel',
    description: 'Avond van tevoren klaarzetten, ’s ochtends direct een vullend ontbijt.',
    servings: 2, prep_minutes: 5, cook_minutes: 0, category: 'Ontbijt', tags: ['ontbijt', 'vegetarisch', 'meal-prep', 'snel'],
    ingredients: [
      ['havermout', 100, 'g'],
      ['volle yoghurt', 200, 'ml'],
      ['halfvolle melk', 150, 'ml'],
      ['appel', 1, 'stuk', 'geraspt'],
      ['kaneel', 1, 'snufje'],
      ['honing', 1, 'el', '', 1],
    ],
    steps: [
      'Meng havermout, yoghurt, melk, kaneel en de helft van de appel in twee potjes.',
      'Zet een nacht in de koelkast.',
      'Top met de rest van de appel en eventueel honing.',
    ],
  },
  {
    title: 'Omelet met groenten en kaas',
    description: 'Gevulde omelet met paprika, champignons en kaas – snelle lunch.',
    servings: 2, prep_minutes: 5, cook_minutes: 10, category: 'Lunch', tags: ['lunch', 'vegetarisch', 'snel', 'eiwitrijk'],
    ingredients: [
      ['eieren', 4, 'stuk'],
      ['paprika', 0.5, 'stuk'],
      ['champignons', 100, 'g'],
      ['ui', 0.5, 'stuk'],
      ['geraspte kaas', 40, 'g'],
      ['roomboter', 10, 'g'],
      ['volkorenbrood', 2, 'stuk', 'sneetjes', 1],
    ],
    steps: [
      'Bak ui, paprika en champignons 4 minuten in de boter.',
      'Klop de eieren los met zout en peper en giet over de groenten.',
      'Laat op laag vuur stollen, strooi de kaas erover en vouw dubbel.',
    ],
  },
  {
    title: 'Tosti ham-kaas',
    description: 'De Nederlandse lunchklassieker uit het tosti-ijzer of de koekenpan.',
    servings: 2, prep_minutes: 5, cook_minutes: 5, category: 'Lunch', tags: ['lunch', 'snel', 'kinderen'],
    ingredients: [
      ['volkorenbrood', 4, 'stuk', 'sneetjes'],
      ['beenham', 4, 'plak'],
      ['goudse kaas plakken', 4, 'plak'],
      ['roomboter', 10, 'g'],
    ],
    steps: [
      'Beleg twee sneetjes met kaas en ham en dek af met de andere sneetjes.',
      'Besmeer de buitenkant dun met boter.',
      'Bak in een tosti-ijzer of koekenpan 3–4 minuten tot goudbruin en de kaas gesmolten is.',
    ],
  },
  {
    title: 'Appelcrumble',
    description: 'Warme appels met kaneel onder een krokante kruimellaag. Lekker met yoghurt of ijs.',
    servings: 6, prep_minutes: 15, cook_minutes: 30, category: 'Nagerecht', tags: ['zoet', 'vegetarisch', 'herfst'],
    ingredients: [
      ['appel', 4, 'stuk', 'goudreinetten, in partjes'],
      ['kaneel', 1, 'tl'],
      ['bloem', 100, 'g'],
      ['havermout', 50, 'g'],
      ['roomboter', 100, 'g', 'koud, in blokjes'],
      ['suiker', 80, 'g'],
    ],
    steps: [
      'Verwarm de oven voor op 190 °C.',
      'Meng de appel met kaneel en 1 el suiker in een ovenschaal.',
      'Wrijf bloem, havermout, boter en de rest van de suiker tot kruimels en verdeel over de appel.',
      'Bak 30 minuten tot de bovenkant goudbruin is.',
    ],
  },
];

/** Foto en bronvermelding van een standaardrecept, of null. */
export function builtinPhoto(key) {
  const p = PHOTOS[key];
  if (!p) return null;
  return {
    url: `img/recipes/${key}.jpg`,
    credit: JSON.stringify({ author: p.author, license: p.license, license_url: p.license_url, page: p.page, source: p.source }),
  };
}

/** Vaste sleutel van een standaardrecept, zodat updates het kunnen herkennen (ook als je de titel aanpast). */
export function builtinKey(title) {
  return String(title).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function getList(db, key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? JSON.parse(row.value) : null;
}

function setList(db, key, list) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, JSON.stringify(list));
}

// Tot en met v2.3 bestonden de eerste 16 recepten en de ingrediënten vóór "patak's butter chicken saus".
const LEGACY_RECIPES = 16;
const LEGACY_INGREDIENTS = () => I.findIndex((r) => r[0] === "patak's butter chicken saus");

/**
 * Standaardingrediënten en -recepten bijwerken. Bij een nieuwe database wordt alles ingevuld;
 * bij een bestaande database (na een update) komen alleen nieuwe standaardonderdelen erbij.
 * Wat je zelf hebt verwijderd of aangepast, blijft zoals het is.
 * @returns { ingredients, recipes } aantal toegevoegde onderdelen
 */
export function syncBuiltins(db, { fresh = false, restore = false } = {}) {
  db.exec('BEGIN');
  try {
    // Elk standaardonderdeel wordt één keer aangeboden. Wat je daarna verwijdert of hernoemt, komt niet terug.
    // Databases van vóór dit mechanisme hebben de oude onderdelen al gekregen.
    const offeredIng = new Set(getList(db, 'builtin_ingredients_offered')
      ?? (fresh ? [] : I.slice(0, LEGACY_INGREDIENTS()).map((r) => r[0].toLowerCase())));
    const offeredRec = new Set(getList(db, 'builtin_recipes_offered')
      ?? (fresh ? [] : RECIPES.slice(0, LEGACY_RECIPES).map((r) => builtinKey(r.title))));
    const existingIng = new Set(db.prepare('SELECT name FROM ingredients').all().map((r) => r.name.toLowerCase()));
    const insIng = db.prepare(`INSERT INTO ingredients
      (name, category, kcal, protein, carbs, sugar, fat, sat_fat, fiber, salt, unit_weight_g, package_grams, price_cents, pantry, aliases, density, package_label, price_source, price_updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'schatting', date('now'))`);
    let addedIng = 0;
    for (const row of I) {
      const name = row[0].toLowerCase();
      if (existingIng.has(name) || offeredIng.has(name)) continue;
      insIng.run(...row);
      addedIng++;
    }
    const setCat = db.prepare('UPDATE ingredients SET off_category = ? WHERE name = ? AND off_category IS NULL');
    for (const [name, tag] of Object.entries(OFF_CATEGORY_BY_NAME)) setCat.run(tag, name);

    const byName = new Map(db.prepare('SELECT id, name FROM ingredients').all().map((r) => [r.name.toLowerCase(), r.id]));
    // Recepten uit eerdere versies (zonder sleutel) herkennen aan hun titel
    const setKey = db.prepare('UPDATE recipes SET builtin_key = ? WHERE id = ?');
    const keyed = new Set();
    for (const r of db.prepare('SELECT id, title, builtin_key FROM recipes').all()) {
      if (r.builtin_key) { keyed.add(r.builtin_key); continue; }
      const key = builtinKey(r.title);
      if (RECIPES.some((b) => builtinKey(b.title) === key) && !keyed.has(key)) {
        setKey.run(key, r.id);
        keyed.add(key);
      }
    }
    const insRecipe = db.prepare(`INSERT INTO recipes (title, description, servings, prep_minutes, cook_minutes, category, cuisine, tags, steps, builtin_key, image_url, image_credit)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const insRow = db.prepare(`INSERT INTO recipe_ingredients (recipe_id, ingredient_id, name, quantity, unit, note, optional, position)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    const recipeIds = [];
    let addedRec = 0;
    for (const r of RECIPES) {
      const key = builtinKey(r.title);
      // Met restore komen ook verwijderde standaardrecepten terug
      if (keyed.has(key) || (!restore && offeredRec.has(key))) continue;
      const { lastInsertRowid } = insRecipe.run(
        r.title, r.description, r.servings, r.prep_minutes, r.cook_minutes, r.category,
        r.cuisine || (r.tags.includes('indisch') ? 'Indisch' : 'Nederlands'), JSON.stringify(r.tags), JSON.stringify(r.steps), key,
        builtinPhoto(key)?.url ?? null, builtinPhoto(key)?.credit ?? null,
      );
      recipeIds.push(Number(lastInsertRowid));
      addedRec++;
      r.ingredients.forEach(([name, qty, unit, note = '', optional = 0], i) => {
        if (fresh && !byName.has(name.toLowerCase())) throw new Error(`Seed: onbekend ingrediënt ${name}`);
        insRow.run(lastInsertRowid, byName.get(name.toLowerCase()) ?? null, name, qty, unit, note, optional, i);
      });
    }

    // Bestaande standaardrecepten zonder foto krijgen één keer de meegeleverde foto (een eigen foto blijft staan)
    const offeredPhotos = new Set(getList(db, 'builtin_photos_offered') ?? []);
    const setPhoto = db.prepare("UPDATE recipes SET image_url = ?, image_credit = ? WHERE builtin_key = ? AND (image_url IS NULL OR image_url = '')");
    for (const key of Object.keys(PHOTOS)) {
      if (offeredPhotos.has(key)) continue;
      const p = builtinPhoto(key);
      setPhoto.run(p.url, p.credit, key);
    }
    setList(db, 'builtin_photos_offered', Object.keys(PHOTOS));

    setList(db, 'builtin_ingredients_offered', I.map((r) => r[0].toLowerCase()));
    setList(db, 'builtin_recipes_offered', RECIPES.map((r) => builtinKey(r.title)));

    if (fresh) {
      // Voorbeeldplanning voor de huidige week (diner)
      const monday = mondayOf(new Date());
      const insPlan = db.prepare('INSERT INTO meal_plan (date, meal, recipe_id, servings) VALUES (?, ?, ?, ?)');
      [0, 7, 11, 8, 12].forEach((idx, day) => insPlan.run(addDays(monday, day), 'diner', recipeIds[idx], 4));
      insPlan.run(addDays(monday, 5), 'diner', recipeIds[16], 4); // butter chicken op zaterdag
      const setS = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
      setS.run('default_servings', JSON.stringify(4));
      setS.run('meals', JSON.stringify(['ontbijt', 'lunch', 'diner']));
      setS.run('household', JSON.stringify(''));
    }
    db.exec('COMMIT');
    return { ingredients: addedIng, recipes: addedRec, fresh };
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/** Aantal standaardrecepten dat niet (meer) in de database staat. */
export function missingBuiltinRecipes(db) {
  const keys = new Set(db.prepare('SELECT builtin_key FROM recipes WHERE builtin_key IS NOT NULL').all().map((r) => r.builtin_key));
  return RECIPES.filter((r) => !keys.has(builtinKey(r.title))).length;
}

/** Verwijderde standaardrecepten terugzetten. */
export function restoreBuiltinRecipes(db) {
  return syncBuiltins(db, { restore: true }).recipes;
}

/** Nieuwe database vullen (blijft bestaan voor compatibiliteit). */
export function seedDatabase(db) {
  return syncBuiltins(db, { fresh: true });
}

export function mondayOf(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

export function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
