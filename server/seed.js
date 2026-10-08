// Startdata: veelgebruikte Nederlandse ingrediënten en klassieke recepten.
// Voedingswaarden per 100 g zijn afgerond en gebaseerd op NEVO-gemiddelden (RIVM).
// Prijzen zijn schattingen van supermarktprijzen (Jumbo-niveau, 2026); pas ze aan via Ingrediënten → ✏️.

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
  ['witte rijst', WK, 350, 7, 79, 0.2, 0.6, 0.2, 1, 0, null, 1000, 199, 0, 'rijst,pandanrijst,basmatirijst,jasmijnrijst', 1, '1 kg'],
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
];

export function seedDatabase(db) {
  db.exec('BEGIN');
  try {
    const insIng = db.prepare(`INSERT INTO ingredients
      (name, category, kcal, protein, carbs, sugar, fat, sat_fat, fiber, salt, unit_weight_g, package_grams, price_cents, pantry, aliases, density, package_label, price_source, price_updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'schatting', date('now'))`);
    for (const row of I) insIng.run(...row);
    const setCat = db.prepare('UPDATE ingredients SET off_category = ? WHERE name = ?');
    for (const [name, tag] of Object.entries(OFF_CATEGORY_BY_NAME)) setCat.run(tag, name);

    const byName = new Map();
    for (const r of db.prepare('SELECT id, name, aliases FROM ingredients').all()) {
      byName.set(r.name.toLowerCase(), r.id);
    }
    const insRecipe = db.prepare(`INSERT INTO recipes (title, description, servings, prep_minutes, cook_minutes, category, cuisine, tags, steps)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const insRow = db.prepare(`INSERT INTO recipe_ingredients (recipe_id, ingredient_id, name, quantity, unit, note, optional, position)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    const recipeIds = [];
    for (const r of RECIPES) {
      const { lastInsertRowid } = insRecipe.run(
        r.title, r.description, r.servings, r.prep_minutes, r.cook_minutes, r.category,
        r.tags.includes('indisch') ? 'Indisch' : 'Nederlands', JSON.stringify(r.tags), JSON.stringify(r.steps),
      );
      recipeIds.push(Number(lastInsertRowid));
      r.ingredients.forEach(([name, qty, unit, note = '', optional = 0], i) => {
        const id = byName.get(name.toLowerCase());
        if (!id) throw new Error(`Seed: onbekend ingrediënt ${name}`);
        insRow.run(lastInsertRowid, id, name, qty, unit, note, optional, i);
      });
    }

    // Voorbeeldplanning voor de huidige week (diner)
    const monday = mondayOf(new Date());
    const insPlan = db.prepare('INSERT INTO meal_plan (date, meal, recipe_id, servings) VALUES (?, ?, ?, ?)');
    [0, 7, 11, 8, 12].forEach((idx, day) => insPlan.run(addDays(monday, day), 'diner', recipeIds[idx], 4));
    insPlan.run(addDays(monday, 5), 'diner', recipeIds[6], 4);

    const setS = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
    setS.run('default_servings', JSON.stringify(4));
    setS.run('meals', JSON.stringify(['ontbijt', 'lunch', 'diner']));
    setS.run('household', JSON.stringify(''));
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
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
