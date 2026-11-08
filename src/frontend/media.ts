/**
 * Title-screen and loading-screen imagery. Every image is rendered in Blender from the game's own
 * assets: the Room 104 / west-corridor set and the shipped entity models, posed on their own
 * animation clips (src/frontend/media/pipeline/render_media.py). They are hosted with the build,
 * with no external image service.
 */
const url = (name: string): string => new URL(`./media/${name}.webp`, import.meta.url).href;

export const MENU_SCENE = {
  lit: url('menu_lit'),
  dark: url('menu_dark'),
  figure: url('menu_figure'),
  alt: 'The west corridor of Ward 4 at night: green wainscot, a wooden handrail, a blue guide line on the floor, one fluorescent panel buzzing overhead and darkness at the far end.',
} as const;

export interface Plate {
  readonly src: string;
  readonly alt: string;
  readonly caption: string;
}

export const LOADING_PLATES: readonly Plate[] = [
  { src: url('load_room104'), alt: 'Room 104: an unmade hospital bed, its sheets dragged to the floor, an overturned drip stand and a wheelchair facing the wall.', caption: 'Room 104. You wake here.' },
  { src: url('load_patient_doorway'), alt: 'A tall, emaciated figure in a hospital gown leans into the doorway of Room 104, one hand high on the frame.', caption: 'The Patient keeps to doorways.' },
  { src: url('load_rot'), alt: 'Black branching veins spread from the corner behind the bed head, glowing faintly cyan at their tips, beside four long scratches in the paint.', caption: 'It grows from the corner behind the bed.' },
  { src: url('load_crawler'), alt: 'A thin, prone figure crawls along the corridor floor on splayed arms, low beneath the handrail.', caption: 'Something keeps low in the west corridor.' },
  { src: url('load_reflection'), alt: 'A washbasin mirror shows a pale, still figure standing in the room behind the viewer; the room itself is empty.', caption: 'Only the mirror shows her.' },
  { src: url('load_nurse'), alt: 'A nurse in a starched white uniform with bandaged eyes walks the corridor, hands clasped.', caption: 'The night nurse hunts by sound.' },
  { src: url('load_clock'), alt: 'A hospital wall clock stopped at seventeen minutes past three.', caption: 'Every clock on the ward stopped at 3:17.' },
];

/** Ward records shown while loading: fragments of the night the ward went quiet. */
export const RECORDS: readonly { readonly ref: string; readonly text: string }[] = [
  { ref: 'NIGHT REPORT · 02:40', text: 'Bed 104 restless. Asked again who keeps standing in the doorway. Nobody on the corridor. Settled with water.' },
  { ref: 'MAINTENANCE · TICKET 4417', text: 'Black growth in the corner behind 104’s bed head. Treated twice. Returns overnight in the same shape.' },
  { ref: 'NIGHT REPORT · 03:05', text: 'Sister requests the mirrors on the ward be covered. Refused pending estates approval.' },
  { ref: 'INCIDENT LOG', text: 'All ward clocks stopped at 03:17. The battery clocks too. The emergency lighting held.' },
  { ref: 'PATIENT NOTES · 104', text: '“It doesn’t come in while the light is on. It waits for the flicker.”' },
  { ref: 'STAFF ROTA · WARD 4 WEST', text: 'Night nurse: — (no name entered). Shift continues.' },
  { ref: 'ESTATES MEMO', text: 'Stairwell B to remain chained until further notice. Do not use the lift after midnight.' },
];
