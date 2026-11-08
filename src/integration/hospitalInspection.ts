/** Text outcomes for the hospital's existing inspection markers; no inventory/combat items. */
const outcomes: Readonly<Record<string, string>> = {
  'nw:drawer:station-drawer': 'Empty. A shift note reads: “Use the service passage. Keep out of sight.”',
  'nw:cabinet:drug-cupboard': 'The medication trays have been cleared out. Nothing useful remains.',
  'nw:cabinet:treatment-cabinet': 'Stained instruments. Nothing you can use.',
  'nw:inspect:ward-board': 'Ward 4 West. The service passage connects the west connector to the east corridor.',
  'nw:inspect:lift': 'The lift has no power. Try the service passage.',
  'nw:inspect:stairwell-notice': 'STAIRWELL B — chained shut. Find another route.',
};
export function hospitalInspectionText(targetId: string): string | undefined { return outcomes[targetId]; }
