// Meer (telefoon): alles wat niet in de onderbalk past.
import { esc } from '../util.js';

const ITEMS = [
  ['#/boodschappen', '🛒', 'Boodschappen', 'je lijst voor deze week'],
  ['#/dagboek', '🔥', 'Dagboek & gewicht', 'eerdere dagen, grafieken en je gewicht'],
  ['#/ingredienten', '🥕', 'Ingrediënten', 'voedingswaarden, prijzen, product scannen'],
  ['#/importeren', '✨', 'Recept toevoegen', 'van een website, foto of met Claude'],
  ['#/account', '👤', 'Account & herinneringen', 'inloggen, wachtwoord, meldingen'],
  ['#/instellingen', '⚙️', 'Instellingen', 'huishouden, Claude, Home Assistant, updates'],
];

export async function render(root) {
  root.innerHTML = `<div class="view">
    <div class="page-head"><h1>Meer</h1></div>
    <nav class="more-list">${ITEMS.map(([href, ico, title, sub]) => `<a href="${href}"><span class="ico">${ico}</span><span>${esc(title)}<small>${esc(sub)}</small></span></a>`).join('')}</nav>
  </div>`;
}
