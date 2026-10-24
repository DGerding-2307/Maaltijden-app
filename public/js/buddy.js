// Het maatje: een getekend hondje (SVG) met stemmingen. De animaties staan in css/buddy.css.
// Elke stemming heeft eigen ogen, een eigen mond en een eigen extraatje:
//   rust      gewone oogjes, glimlach, rustig kwispelen
//   blij      ^^-oogjes, open mond met tong, springt, hartjes
//   trots     ogen dicht van trots, kin omhoog, medaille, sterretjes
//   bezorgd   grote puppy-ogen, wenkbrauwen omhoog, golvend mondje, zweetdruppel, oren omlaag
//   slaperig  ogen dicht, kopje zakt, snotbelletje, zzz
//   hongerig  tong langs de snoet, kwijldruppel, denkwolkje met een bot

export const MOODS = ['rust', 'blij', 'trots', 'bezorgd', 'slaperig', 'hongerig'];

const INK = '#3a2a22';

/** SVG van het hondje. `mood` zet de beginstemming; wijzigen kan met setMood(). */
export function buddySvg({ mood = 'rust', label = 'Je maatje' } = {}) {
  return `<div class="buddy mood-${MOODS.includes(mood) ? mood : 'rust'}" role="img" aria-label="${label}">
  <svg viewBox="0 0 200 215" xmlns="http://www.w3.org/2000/svg">
    <ellipse class="b-shadow" cx="100" cy="207" rx="56" ry="7" />
    <g class="b-jump">
      <path class="b-tail" d="M138 172 C162 170 172 152 173 134 C174 124 163 122 161 131 C158 147 150 156 134 158 Z" fill="#d9955a"/>
      <g class="b-body">
        <ellipse cx="100" cy="166" rx="48" ry="38" fill="#fbe9cf"/>
        <ellipse cx="100" cy="174" rx="27" ry="23" fill="#fff8ee"/>
        <ellipse cx="79" cy="199" rx="15" ry="9" fill="#fff8ee"/>
        <ellipse cx="121" cy="199" rx="15" ry="9" fill="#fff8ee"/>
        <path d="M75 196 v5 M83 196 v5 M117 196 v5 M125 196 v5" stroke="#e6cfae" stroke-width="2" stroke-linecap="round"/>
        <path class="b-collar" d="M62 125 Q100 144 138 125 L138 134 Q100 153 62 134 Z"/>
        <circle class="b-tag" cx="100" cy="146" r="7" fill="#ffc94d" stroke="#e8a92b" stroke-width="2"/>
        <g class="b-medal">
          <path d="M92 140 L88 128 L96 128 L100 138 L104 128 L112 128 L108 140 Z" fill="#7cc68d"/>
          <circle cx="100" cy="152" r="12" fill="#ffc94d" stroke="#e8a92b" stroke-width="2.5"/>
          <path d="M100 145 l2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5-3.6-3.5 5-.7z" fill="#fff6d6"/>
        </g>
      </g>
      <g class="b-head">
        <path d="M88 33 Q90 19 100 23 Q106 13 113 26 Q107 27 105 33 Z" fill="#d9955a"/>
        <ellipse cx="100" cy="82" rx="62" ry="55" fill="#fbe9cf"/>
        <ellipse cx="126" cy="73" rx="21" ry="19" fill="#efc99b"/>
        <path class="b-ear b-ear-l" d="M46 46 C26 48 15 80 24 108 C28 121 44 120 50 105 C57 88 61 63 46 46 Z" fill="#d9955a"/>
        <path class="b-ear b-ear-r" d="M154 46 C174 48 185 80 176 108 C172 121 156 120 150 105 C143 88 139 63 154 46 Z" fill="#d9955a"/>
        <g class="b-cheeks" fill="#f7a1a1"><ellipse cx="61" cy="104" rx="10" ry="6"/><ellipse cx="139" cy="104" rx="10" ry="6"/></g>
        <g class="b-face b-brows" fill="none" stroke="${INK}" stroke-width="3.2" stroke-linecap="round">
          <path d="M67 70 Q75 68 85 61"/><path d="M133 70 Q125 68 115 61"/>
        </g>
        <!-- ogen -->
        <g class="b-face b-eyes-open">
          <g class="b-eye"><ellipse cx="78" cy="85" rx="8.5" ry="10.5" fill="${INK}"/><circle cx="81" cy="80.5" r="3.2" fill="#fff"/><circle cx="75.5" cy="89" r="1.4" fill="#fff"/></g>
          <g class="b-eye"><ellipse cx="122" cy="85" rx="8.5" ry="10.5" fill="${INK}"/><circle cx="125" cy="80.5" r="3.2" fill="#fff"/><circle cx="119.5" cy="89" r="1.4" fill="#fff"/></g>
        </g>
        <g class="b-face b-eyes-big">
          <g class="b-eye"><ellipse cx="78" cy="86" rx="11.5" ry="13" fill="${INK}"/><circle cx="82" cy="80" r="4.6" fill="#fff"/><circle cx="74" cy="91" r="2.4" fill="#fff"/><path d="M68 95 Q78 101 88 95" stroke="#9fd3f5" stroke-width="2.2" fill="none" stroke-linecap="round"/></g>
          <g class="b-eye"><ellipse cx="122" cy="86" rx="11.5" ry="13" fill="${INK}"/><circle cx="126" cy="80" r="4.6" fill="#fff"/><circle cx="118" cy="91" r="2.4" fill="#fff"/><path d="M112 95 Q122 101 132 95" stroke="#9fd3f5" stroke-width="2.2" fill="none" stroke-linecap="round"/></g>
        </g>
        <g class="b-face b-eyes-happy" fill="none" stroke="${INK}" stroke-width="4.2" stroke-linecap="round">
          <path d="M68 89 Q78 75 88 89"/><path d="M112 89 Q122 75 132 89"/>
        </g>
        <g class="b-face b-eyes-closed" fill="none" stroke="${INK}" stroke-width="3.6" stroke-linecap="round">
          <path d="M69 86 Q78 93 87 86"/><path d="M113 86 Q122 93 131 86"/>
        </g>
        <!-- snoet -->
        <ellipse cx="100" cy="106" rx="23" ry="16" fill="#fff8ee"/>
        <path d="M91 98 Q100 93 109 98 Q108 106 100 108 Q92 106 91 98 Z" fill="${INK}"/>
        <ellipse cx="97" cy="98" rx="3" ry="1.6" fill="#fff" opacity=".6"/>
        <!-- monden -->
        <path class="b-face b-mouth-smile" d="M100 108 V113 M90 112 Q95 118 100 113 Q105 118 110 112" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
        <g class="b-face b-mouth-open">
          <path d="M100 108 V111" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>
          <path d="M87 111 Q100 115 113 111 Q111 129 100 130 Q89 129 87 111 Z" fill="#7a3434" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>
          <path d="M92 123 Q100 117 108 123 Q106 130 100 130 Q94 130 92 123 Z" fill="#f2879a"/>
        </g>
        <path class="b-face b-mouth-proud" d="M100 108 V112 M88 111 Q100 122 112 111" fill="none" stroke="${INK}" stroke-width="2.8" stroke-linecap="round"/>
        <path class="b-face b-mouth-worry" d="M100 108 V113 M89 120 Q92 115 96 119 Q100 122 104 119 Q108 115 111 120" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
        <path class="b-face b-mouth-sleep" d="M100 108 V112 M95 115 Q100 118 105 115" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>
        <g class="b-face b-mouth-lick">
          <path d="M100 108 V113 M90 112 Q95 118 100 113 Q105 118 110 112" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
          <path class="b-lick" d="M103 114 Q115 113 116 123 Q114 130 108 126 Q105 121 103 114 Z" fill="#f2879a" stroke="#d96a7e" stroke-width="1.5"/>
          <path class="b-drool" d="M93 116 q3 6 0 9 q-3-3 0-9z" fill="#9fd3f5"/>
        </g>
        <circle class="b-face b-bubble" cx="111" cy="104" r="7" fill="#cfeafc" stroke="#9fd3f5" stroke-width="1.5" opacity=".9"/>
      </g>
    </g>
    <!-- extraatjes -->
    <g class="b-fx b-hearts" fill="#ff7a8a">
      <path d="M40 40 c-4-6-13-2-10 5 l10 9 l10-9 c3-7-6-11-10-5z"/>
      <path d="M160 30 c-3-5-10-2-8 4 l8 7 l8-7 c2-6-5-9-8-4z"/>
      <path d="M170 70 c-2-4-8-1-6 3 l6 6 l6-6 c2-4-4-7-6-3z"/>
    </g>
    <g class="b-fx b-stars" fill="#ffc94d">
      <path d="M30 46 l4 9 9 1.2-6.6 6.4 1.6 9-8-4.3-8 4.3 1.6-9-6.6-6.4 9-1.2z"/>
      <path d="M168 30 l3 7 7 1-5 5 1.2 7-6.2-3.4-6.2 3.4 1.2-7-5-5 7-1z"/>
      <path d="M178 82 l2 4.6 5 .7-3.6 3.5.9 5-4.3-2.3-4.3 2.3.9-5-3.6-3.5 5-.7z"/>
    </g>
    <g class="b-fx b-zzz" fill="#7d93c4" font-family="Nunito, Fredoka, system-ui, sans-serif" font-weight="900">
      <text x="146" y="48" font-size="24">Z</text><text x="164" y="30" font-size="18">z</text><text x="178" y="16" font-size="13">z</text>
    </g>
    <g class="b-fx b-sweat"><path d="M162 50 q8 13 0 18 q-8-5 0-18z" fill="#9fd3f5" stroke="#7cbde6" stroke-width="1.2"/></g>
    <g class="b-fx b-think">
      <circle cx="150" cy="52" r="3.5" fill="#fff" stroke="#e6d6c4" stroke-width="1.5"/>
      <circle cx="158" cy="40" r="5.5" fill="#fff" stroke="#e6d6c4" stroke-width="1.5"/>
      <ellipse cx="178" cy="18" rx="24" ry="17" fill="#fff" stroke="#e6d6c4" stroke-width="1.5"/>
      <path d="M166 22 L190 14" stroke="#f3dcc0" stroke-width="5" stroke-linecap="round"/>
      <g fill="#f3dcc0"><circle cx="165" cy="19" r="4"/><circle cx="167" cy="26" r="4"/><circle cx="189" cy="10" r="4"/><circle cx="191" cy="17" r="4"/></g>
    </g>
  </svg>
</div>`;
}

/** Stemming van een maatje wijzigen. */
export function setMood(el, mood) {
  const buddy = el.classList.contains('buddy') ? el : el.querySelector('.buddy');
  if (!buddy) return;
  for (const m of MOODS) buddy.classList.remove(`mood-${m}`);
  buddy.classList.add(`mood-${MOODS.includes(mood) ? mood : 'rust'}`);
}

/** Even aaien: hartjes en een sprongetje, daarna terug naar de vorige stemming. */
export function pet(el) {
  const buddy = el.classList.contains('buddy') ? el : el.querySelector('.buddy');
  if (!buddy || buddy.classList.contains('petting')) return;
  buddy.classList.add('petting');
  setTimeout(() => buddy.classList.remove('petting'), 1400);
}
