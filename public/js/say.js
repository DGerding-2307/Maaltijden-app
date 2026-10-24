// Het maatje zegt iets bovenaan een pagina (v4, stijl ‘Foto's & bubbels’).
import { esc } from './util.js';
import { buddySvg } from './buddy.js';

/** Hondje met een tekstballon. `html` mag opmaak bevatten (al ge-escaped door de aanroeper); anders `text`. */
export function say({ mood = 'rust', text = '', html = null, action = '' } = {}) {
  return `<div class="say">${buddySvg({ mood })}<div class="bubble">${html ?? esc(text)}${action ? ` ${action}` : ''}</div></div>`;
}

// Teksten voor pagina's zonder eigen, slimme tekst (Dagboek, Ingrediënten, Instellingen …)
const PAGE_LINES = {
  dagboek: ['rust', 'Hier zie je alles wat je at, dag voor dag, en hoe je gewicht gaat. 📈'],
  ingredienten: ['hongerig', 'Al je ingrediënten met voedingswaarden en prijzen. Scan een product om het toe te voegen!'],
  importeren: ['blij', 'Een nieuw recept? Plak een link, maak een foto of laat Claude iets lekkers bedenken ✨'],
  instellingen: ['rust', 'Hier stel je alles in. Ik blijf gewoon lekker naast je zitten 🐾'],
  account: ['blij', 'Jouw account en herinneringen. Zal ik je helpen onthouden om te loggen?'],
  meer: ['blij', 'Waar wil je naartoe? Ik loop met je mee 🐾'],
  recept: null,
};

/** Bubbel voor de algemene pagina's, of leeg als de pagina zelf iets zegt. */
export function pageSay(section) {
  const line = PAGE_LINES[section];
  return line ? say({ mood: line[0], text: line[1] }) : '';
}
