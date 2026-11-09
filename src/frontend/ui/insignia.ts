/**
 * The Halden Vale Infirmary seal: an original institutional insignia for NIGHT WARD.
 *
 * A double ring carrying the hospital's name, a crescent (the night shift) over a cardiogram trace
 * that flattens, then splits into the branching veins of the rot, and the patient's bed number.
 * It is drawn as inline SVG so it scales crisply and takes the theme colours. It deliberately avoids
 * the red cross / crescent emblems, which are protected symbols.
 */
export function insigniaSvg(idPrefix = 'nw-seal'): string {
  const ring = `${idPrefix}-ring`;
  return `
<svg class="nw-seal" viewBox="0 0 200 200" role="img" aria-label="Halden Vale Infirmary seal, Ward 4 West, Night Shift" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <path id="${ring}" d="M100,100 m-78,0 a78,78 0 1,1 156,0 a78,78 0 1,1 -156,0" />
    <filter id="${idPrefix}-wear" x="-10%" y="-10%" width="120%" height="120%">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="n" />
      <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.6 1.25" result="mask" />
      <feComposite in="SourceGraphic" in2="mask" operator="in" />
    </filter>
  </defs>
  <g filter="url(#${idPrefix}-wear)" fill="none" stroke="currentColor">
    <circle cx="100" cy="100" r="96" stroke-width="1.2" opacity=".55" />
    <circle cx="100" cy="100" r="91" stroke-width="3" />
    <circle cx="100" cy="100" r="64" stroke-width="1.2" />
    <text fill="currentColor" stroke="none" font-family="'IBM Plex Mono', monospace" font-size="10.6" letter-spacing="3.1">
      <textPath href="#${ring}" startOffset="0">HALDEN VALE INFIRMARY · NIGHT SHIFT · WARD 4 WEST ·</textPath>
    </text>
    <path d="M118,56 a34,34 0 1,0 18,62 a27,27 0 1,1 -18,-62 z" fill="currentColor" stroke="none" opacity=".9" />
    <path d="M48,118 h26 l6,-14 l7,26 l6,-18 l5,6 h12 c8,0 10,-4 16,-9 m-16,9 c6,2 9,8 16,10 m-30,-10 c4,5 3,11 8,15" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
    <text x="100" y="152" fill="currentColor" stroke="none" text-anchor="middle" font-family="'Barlow Condensed', sans-serif" font-weight="600" font-size="17" letter-spacing="5">104</text>
    <path d="M58,160 h84" stroke-width="1" opacity=".6" />
  </g>
</svg>`;
}
