# NW-R02 — Greybox registries (generated)

Generated from `src/world/greybox/level.ts` by `tests/greybox/registry.test.ts`. Do not edit by hand.

Coordinates are metres: x east, z south (−z is north), floor at y = 0.

## 1. Room and corridor registry

| ID | Name | Zone | Kind | Rectangles [x0, x1, z0, z1] | Area m² | Ceiling m | Path | R01 ref | Connections |
|---|---|---|---|---|---|---|---|---|---|
| WC | West corridor | west | corridor | [-38, -6, -1.2, 1.2] | 76.8 | 3 | required | W | lobby-west, R104-door, W2-door, W3-door, W4-door, W8-door, W5-door, W6-door, W7-bay, W9-door |
| R104 | Room 104 | west | room | [-38, -32, 1.2, 7] | 34.8 | 2.8 | required | W1 | R104-door |
| W2 | Room 103 | west | room | [-32, -27, 1.2, 7] | 29 | 2.8 | optional | W2 | W2-door |
| W3 | Bay 105–108 | west | room | [-27, -17, 1.2, 7] | 58 | 2.8 | optional | W3 | W3-door |
| W4 | Bathroom | west | room | [-17, -13, 1.2, 7] | 23.2 | 2.8 | optional | W4 | W4-door |
| W8 | Linen cupboard | west | room | [-13, -10.6, 1.2, 4] | 6.7 | 2.8 | optional | W8 | W8-door |
| W5 | Examination room | west | room | [-38, -31, -7, -1.2] | 40.6 | 2.8 | optional | W5 | W5-door |
| W6 | Imaging | west | room | [-31, -24, -7, -1.2] | 40.6 | 2.8 | optional | W6 | W6-door, W6D-door |
| W6D | Darkroom | west | room | [-24, -21, -7, -3.5] | 10.5 | 2.8 | optional | W6 | W6D-door |
| W7 | West Sister's bay | west | room | [-21, -15, -5, -1.2] | 22.8 | 2.8 | optional | W7 | W7-bay |
| W9 | Clean utility | west | room | [-15, -9, -7, -1.2] | 34.8 | 2.8 | optional | — | W9-door |
| LOBBY | Central lobby | lobby | room | [-6, 6, -5, 5] | 120 | 3.4 | required | L | lobby-west, lobby-south, F1, office-lobby |
| OFFICE | Nurse's Office | office | room | [-3, 3, -10, -5] | 30 | 2.8 | required | O | office-lobby, office-north |
| SC | South corridor | south | corridor | [-1.2, 1.2, 5, 32.4] [1.2, 8, 30, 32.4] | 82.1 | 3 | required | S | lobby-south, S1-door, S3-door, S4-door, S2-door, S5-door, S6-door, ST1-door |
| S1 | Staff changing | south | room | [-7, -1.2, 6, 12] | 34.8 | 2.8 | optional | S1 | S1-door |
| S3 | Physiotherapy | south | room | [-8, -1.2, 12, 20] | 54.4 | 2.8 | optional | S3 | S3-door |
| S4 | Store cupboard | south | room | [-6, -1.2, 20, 25] | 24 | 2.8 | optional | — | S4-door |
| S2 | Dayroom | south | room | [1.2, 8, 6, 14] | 54.4 | 2.8 | optional | S2 | S2-door |
| S5 | Sluice | south | room | [1.2, 6, 14, 18] | 19.2 | 2.8 | optional | S5 | S5-door |
| S6 | Relatives' room | south | room | [1.2, 7, 18, 24] | 34.8 | 2.8 | optional | S6 | S6-door |
| ST1 | Main store | stores | room | [8, 20, 25, 37] | 144 | 3.2 | required | ST1 | ST1-door, ST2-door |
| ST2 | Porters' room | stores | room | [20, 26, 27, 35] | 48 | 2.8 | required | ST2 | ST2-door, hatch |
| CE | Crawlway entrance | crawl | crawl | [26, 27, 31.5, 32.5] | 1 | 1.2 (crouch) | required | V0 | hatch, cw-1 |
| V1W | V1 split (west spine) | crawl | crawl | [27, 28, 28, 39] | 11 | 1.2 (crouch) | required | V1 | cw-1, cw-a1, cw-b1 |
| V1A | Run (a): grille run | crawl | crawl | [28, 32, 28, 29] | 4 | 1.2 (crouch) | optional | V1a | cw-a1, cw-a2 |
| V1B | Run (b): steam run | crawl | crawl | [28, 32, 38, 39] | 4 | 1.2 (crouch) | optional | V1b | cw-b1, cw-b2 |
| V2E | V2 rejoin / V3 split (east spine) | crawl | crawl | [32, 33, 26, 39] | 13 | 1.2 (crouch) | required | V2/V3 | cw-a2, cw-b2, cw-c1, cw-d1 |
| V3C | Run (c): lower duct | crawl | crawl | [32, 33, 23.5, 26] | 2.5 | 1.2 (crouch) | optional | V3c | cw-c1, cw-c2 |
| V3S | Run (d): upper run (south) | crawl | crawl | [29, 32, 26, 27] | 3 | 1.2 (crouch) | optional | V3d | cw-d1, cw-d2 |
| V3W | Run (d): upper run (west) | crawl | crawl | [28, 29, 20, 27] | 7 | 1.2 (crouch) | optional | V3d | cw-d2, cw-d3 |
| V3N | Run (d): upper run (north) | crawl | crawl | [29, 32, 20, 21] | 3 | 1.2 (crouch) | optional | V3d | cw-d3, cw-d4 |
| V4 | V4 rejoin | crawl | crawl | [32, 33, 20, 23.5] | 3.5 | 1.2 (crouch) | required | V4 | cw-c2, cw-d4, cw-3 |
| CX | Crawlway exit duct | crawl | crawl | [33, 35, 22.5, 23.5] | 2 | 1.2 (crouch) | required | V4 | cw-3, grille |
| EC | East corridor | east | corridor | [6, 15, -1.5, 1.5] | 27 | 3 | optional | E | F1, EC1-door, EC2-door, EC-loop |
| EC1 | Ward clerk | east | room | [6, 11, -6, -1.5] | 22.5 | 2.8 | optional | — | EC1-door |
| EC2 | Interview room | east | room | [6, 11, 1.5, 6] | 22.5 | 2.8 | optional | — | EC2-door |
| LWC | Loop west corridor | loop | corridor | [15, 17.4, -15, 15] | 72 | 3 | optional | EL | EC-loop, ring-nw, ring-sw, LPW1-door, LPW2-door, LPW3-door, LPW4-door, LOFF-west, LOFF-win-w, LTR-door, LCU-door |
| LEC | Loop east corridor | loop | corridor | [26.6, 29, -15, 15] | 72 | 3 | required | EL | ring-ne, ring-se, loop-east, LPE1-door, LPE2-door, LPE3-door, LPE4-door, LOFF-east, LOFF-win-e, LLN-door, LEQ-door |
| LNC | Loop north corridor | loop | corridor | [17.4, 26.6, -15, -12.6] | 22.1 | 3 | optional | EL | ring-nw, ring-ne, LUS-door, LKT-door |
| LSC | Loop south corridor | loop | corridor | [17.4, 26.6, 12.6, 15] | 22.1 | 3 | optional | EL | ring-sw, ring-se, LISO-door, LBA-door, LST-door |
| LPW1 | Loop room W1 | loop | room | [11, 15, -15, -8.5] | 26 | 2.8 | optional | — | LPW1-door |
| LPW2 | Loop room W2 | loop | room | [11, 15, -8.5, -1.5] | 28 | 2.8 | optional | — | LPW2-door |
| LPW3 | Loop room W3 | loop | room | [11, 15, 1.5, 8.5] | 28 | 2.8 | optional | — | LPW3-door |
| LPW4 | Loop room W4 | loop | room | [11, 15, 8.5, 15] | 26 | 2.8 | optional | — | LPW4-door |
| LPE1 | Loop room E1 | loop | room | [29, 33, -15, -8.5] | 26 | 2.8 | optional | — | LPE1-door |
| LPE2 | Loop room E2 | loop | room | [29, 33, -8.5, -1.5] | 28 | 2.8 | optional | — | LPE2-door |
| LPE3 | Loop room E3 | loop | room | [29, 33, 1.5, 8.5] | 28 | 2.8 | optional | — | LPE3-door |
| LPE4 | Loop room E4 | loop | room | [29, 33, 8.5, 15] | 26 | 2.8 | optional | — | LPE4-door |
| LOFF | Ward office (core) | loop | room | [17.4, 26.6, -3, 3] | 55.2 | 2.8 | required | EL Office | LOFF-west, LOFF-east, LOFF-win-w, LOFF-win-e, LTR-office |
| LCU | Clean utility (core) | loop | room | [17.4, 22, -12.6, -3] | 44.2 | 2.8 | optional | — | LCU-door |
| LLN | Linen store (core) | loop | room | [22, 26.6, -12.6, -3] | 44.2 | 2.8 | optional | — | LLN-door |
| LTR | Treatment room (core) | loop | room | [17.4, 22, 3, 12.6] | 44.2 | 2.8 | optional | — | LTR-office, LTR-door |
| LEQ | Equipment store (core) | loop | room | [22, 26.6, 3, 12.6] | 44.2 | 2.8 | optional | — | LEQ-door |
| LUS | Loop sluice | loop | room | [15, 22, -19, -15] | 28 | 2.8 | optional | — | LUS-door |
| LKT | Ward kitchen | loop | room | [22, 29, -19, -15] | 28 | 2.8 | optional | — | LKT-door |
| LISO | ISOLATION | loop | room | [15, 21, 15, 19] | 24 | 2.8 | optional | EL-ISO | LISO-door |
| LBA | Loop bathroom | loop | room | [21, 25, 15, 19] | 16 | 2.8 | optional | — | LBA-door |
| LST | Loop store | loop | room | [25, 29, 15, 19] | 16 | 2.8 | optional | — | LST-door |
| EJ | East junction | east | corridor | [29, 39.4, -1.5, 1.5] | 31.2 | 3 | required | EJ | loop-east, EJ-south, EJ-north |
| SB | South branch | branch-s | corridor | [37, 39.4, 1.5, 22] | 49.2 | 3 | required | ES | EJ-south, ES1-door, ES3-door, ES4-door, ES5-door, ES2-door |
| ES1 | Branch bathroom | branch-s | room | [33, 37, 4, 10] | 24 | 2.8 | optional | — | ES1-door |
| ES3 | Side room (traction) | branch-s | room | [33, 37, 10, 16] | 24 | 2.8 | optional | ES3 | ES3-door |
| ES4 | Day bay | branch-s | room | [39.4, 45, 3, 10] | 39.2 | 2.8 | optional | — | ES4-door |
| ES5 | Branch store | branch-s | room | [39.4, 45, 10, 17] | 39.2 | 2.8 | optional | — | ES5-door |
| ES2 | Branch sluice (crawl exit) | branch-s | room | [35, 41, 22, 26] | 24 | 2.8 | required | ES2 | grille, ES2-door |
| NBR | North branch | branch-n | corridor | [37, 39.4, -26, -1.5] | 58.8 | 3 | required | EN | EJ-north, EN1-door, EN2-door, EN3-door, EN4-door, plant2-door |
| EN1 | On-call room | branch-n | room | [33, 37, -8, -3] | 20 | 2.8 | optional | EN1 | EN1-door |
| EN2 | Seminar room | branch-n | room | [33, 37, -16, -9] | 28 | 2.8 | optional | EN2 | EN2-door |
| EN3 | Staff room | branch-n | room | [39.4, 45, -10, -3] | 39.2 | 2.8 | optional | — | EN3-door |
| EN4 | Records | branch-n | room | [39.4, 45, -20, -12] | 44.8 | 2.8 | optional | — | EN4-door |
| M0 | Plant 2 | plant | service | [33, 43, -34, -26] | 80 | 3.2 | required | M0 | plant2-door, M0-M1 |
| M1A | M1 pipe corridor | maintenance | service | [37, 39.2, -44, -34] | 22 | 2.6 | required | M1 | M0-M1, M1-turn |
| M1B | M1 pipe corridor (narrows) | maintenance | service | [29, 37, -44, -42.4] | 12.8 | 2.6 | required | M1 | M1-turn, M1-M2 |
| M2 | M2 cable tunnel (1.4 m) | maintenance | service | [23, 29, -44, -42.4] | 9.6 | 1.4 (crouch) | required | M2 | M1-M2, M2-M3 |
| M3 | M3 pump chamber | maintenance | service | [15, 23, -47, -39] | 64 | 3 | required | M3 | M2-M3, steam |
| M4 | M4 transfer link | maintenance | service | [5, 15, -44, -42] | 20 | 2.6 | required | M4 | steam, M4-M5 |
| M5 | M5 bulkhead chamber | maintenance | service | [2, 5, -44.5, -41.5] | 9 | 2.6 | required | M5 | M4-M5, bulkhead |
| M6A | M6 pipe run (1) | chase | service | [-4, 2, -43.8, -42.2] | 9.6 | 2.6 | required | C1 | bulkhead, C1-1 |
| M6B | M6 pipe run (2) | chase | service | [-5.6, -4, -50, -42.2] | 12.5 | 2.6 | required | C1 | C1-1, C1-2 |
| M6C | M6 pipe run (3) | chase | service | [-14, -5.6, -50, -48.4] | 13.4 | 2.6 | required | C1 | C1-2, C1-3 |
| M6D | M6 pipe run (4) | chase | service | [-15.6, -14, -50, -44] | 9.6 | 2.6 | required | C1 | C1-3, C1-4 |
| M6E | M6 pipe run (5) | chase | service | [-22, -15.6, -45.6, -44] | 10.2 | 2.6 | required | C1 | C1-4, barred |
| M7 | M7 past the barred door | chase | service | [-28, -22, -45.6, -44] | 9.6 | 2.6 | required | C2 | barred, C5-in |
| M8 | M8 low duct (1.2 m) | chase | service | [-31, -28, -45.4, -44.2] | 3.6 | 1.2 (crouch) | required | C5 | C5-in, C5-out |
| M8C | M8 riser hall (service stair omitted) | chase | service | [-34.6, -31, -46, -33] | 46.8 | 2.6 | required | C6 | C5-out, M9 |
| NL | Old north corridor (NOT IN USE) | old-north | corridor | [-36, -16, -33, -30] | 60 | 3 | required | C8 | M9, NT |
| NB | North Wing corridor | north-wing | corridor | [-16, 1.2, -32.4, -30] | 41.3 | 3 | required | NB | NT, NB-NB1, NB-NB3, C2-east |
| NB1 | North Wing spine (to the office door) | north-wing | corridor | [-1.2, 1.2, -30, -10] | 48 | 3 | required | NB1 | office-north, NB-NB1 |
| NB3 | North Wing reception | north-wing | room | [-12, -4, -41, -32.4] | 68.8 | 3.2 | optional | NB3 | NB-NB3, C2-west |
| C2W | Chapter 2 stub (west) | chapter2 | stub | [-18, -12, -39, -35] | 24 | 3 | optional | — | C2-west |
| C2E | Chapter 2 stub (east) | chapter2 | stub | [1.2, 5, -32.4, -30] | 9.1 | 3 | optional | — | C2-east |

91 spaces, 2903.1 m² of floor, 401 generated wall runs, 72 lintels, 2 sills.

### Zones

| Zone | Label | Spaces |
|---|---|---|
| west | West ward (Ward 4 West) | WC, R104, W2, W3, W4, W8, W5, W6, W6D, W7, W9 |
| lobby | Central lobby | LOBBY |
| office | Nurse's Office | OFFICE |
| south | South corridor | SC, S1, S3, S4, S2, S5, S6 |
| stores | Stores | ST1, ST2 |
| crawl | Service crawlway | CE, V1W, V1A, V1B, V2E, V3C, V3S, V3W, V3N, V4, CX |
| east | East corridor | EC, EC1, EC2, EJ |
| loop | East loop | LWC, LEC, LNC, LSC, LPW1, LPW2, LPW3, LPW4, LPE1, LPE2, LPE3, LPE4, LOFF, LCU, LLN, LTR, LEQ, LUS, LKT, LISO, LBA, LST |
| branch-s | East south branch | SB, ES1, ES3, ES4, ES5, ES2 |
| branch-n | East north branch | NBR, EN1, EN2, EN3, EN4 |
| plant | Plant 2 | M0 |
| maintenance | Maintenance passage | M1A, M1B, M2, M3, M4, M5 |
| chase | Chase run (M6–M9) | M6A, M6B, M6C, M6D, M6E, M7, M8, M8C |
| old-north | Old north corridor (NOT IN USE) | NL |
| north-wing | North Wing (1987) | NB, NB1, NB3 |
| chapter2 | Chapter 2 continuation (stub) | C2W, C2E |

## 2. Door and connection registry

| ID | Between | Kind | Wall | Centre | Width m | Opening (bottom–top) m | Initial | Requires | Swing into | Rule / note |
|---|---|---|---|---|---|---|---|---|---|---|
| lobby-west | LOBBY ↔ WC | open | x = -6 | 0 | 2.4 | 0–3 | — | — | — | Archway to the west ward |
| lobby-south | LOBBY ↔ SC | open | z = 5 | 0 | 2.4 | 0–3 | — | — | — | Archway to the south corridor |
| F1 | LOBBY ↔ EC | door (double) | x = 6 | 0 | 2.6 | 0–2.1 | closed | f1-open | LOBBY | F1 fire doors: push-bar from the east only (optional shortcut) |
| office-lobby | LOBBY ↔ OFFICE | door | z = -5 | 0 | 1.2 | 0–2.1 | closed | — | OFFICE | Office door 1 of 2 (lobby side): open |
| office-north | OFFICE ↔ NB1 | door | z = -10 | 0 | 1.2 | 0–2.1 | locked | — | NB1 | Office door 2 of 2 (North Wing side): barricaded from the North Wing side, never opens in Chapter 1 |
| R104-door | WC ↔ R104 | door | z = 1.2 | -33.2 | 1.2 | 0–2.1 | open | — | R104 |  |
| W2-door | WC ↔ W2 | door | z = 1.2 | -28.2 | 1.2 | 0–2.1 | closed | — | W2 |  |
| W3-door | WC ↔ W3 | door | z = 1.2 | -22 | 1.4 | 0–2.1 | open | — | W3 |  |
| W4-door | WC ↔ W4 | door | z = 1.2 | -14.2 | 1 | 0–2.1 | closed | — | W4 |  |
| W8-door | WC ↔ W8 | door | z = 1.2 | -11.8 | 1 | 0–2.1 | closed | — | W8 |  |
| W5-door | WC ↔ W5 | door | z = -1.2 | -32.2 | 1.2 | 0–2.1 | closed | — | W5 |  |
| W6-door | WC ↔ W6 | door | z = -1.2 | -25.2 | 1.2 | 0–2.1 | closed | — | W6 |  |
| W6D-door | W6 ↔ W6D | door | x = -24 | -5.4 | 1 | 0–2.1 | closed | — | W6D |  |
| W7-bay | WC ↔ W7 | open | z = -1.2 | -18 | 4 | 0–2.8 | — | — | — | Sister's bay (open counter) |
| W9-door | WC ↔ W9 | door | z = -1.2 | -10.2 | 1.2 | 0–2.1 | closed | — | W9 |  |
| S1-door | SC ↔ S1 | door | x = -1.2 | 9 | 1.2 | 0–2.1 | closed | — | S1 |  |
| S3-door | SC ↔ S3 | door | x = -1.2 | 16 | 1.4 | 0–2.1 | closed | — | S3 |  |
| S4-door | SC ↔ S4 | door | x = -1.2 | 22.5 | 1 | 0–2.1 | closed | — | S4 |  |
| S2-door | SC ↔ S2 | door | x = 1.2 | 10 | 1.4 | 0–2.1 | closed | — | S2 |  |
| S5-door | SC ↔ S5 | door | x = 1.2 | 16 | 1.2 | 0–2.1 | closed | — | S5 |  |
| S6-door | SC ↔ S6 | door | x = 1.2 | 21 | 1.2 | 0–2.1 | closed | — | S6 |  |
| ST1-door | SC ↔ ST1 | door | x = 8 | 31.2 | 1.6 | 0–2.1 | open | — | ST1 | Stores: locked by Shaw only if the player is inside (E2 placeholder) |
| ST2-door | ST1 ↔ ST2 | door | x = 20 | 31 | 1.2 | 0–2.1 | open | — | ST2 |  |
| hatch | ST2 ↔ CE | hatch | x = 26 | 32 | 0.9 | 0–1.2 | — | — | — | Crawlway hatch: 4 wing nuts, about 5 s crouched (placeholder: always open) |
| cw-1 | CE ↔ V1W | open | x = 27 | 32 | 1 | 0–1.2 | — | — | — |  |
| cw-a1 | V1W ↔ V1A | open | x = 28 | 28.5 | 1 | 0–1.2 | — | — | — |  |
| cw-a2 | V1A ↔ V2E | open | x = 32 | 28.5 | 1 | 0–1.2 | — | — | — |  |
| cw-b1 | V1W ↔ V1B | open | x = 28 | 38.5 | 1 | 0–1.2 | — | — | — |  |
| cw-b2 | V1B ↔ V2E | open | x = 32 | 38.5 | 1 | 0–1.2 | — | — | — |  |
| cw-c1 | V2E ↔ V3C | open | z = 26 | 32.5 | 1 | 0–1.2 | — | — | — | V3 split: run (c) lower duct |
| cw-c2 | V3C ↔ V4 | open | z = 23.5 | 32.5 | 1 | 0–1.2 | — | — | — |  |
| cw-d1 | V2E ↔ V3S | open | x = 32 | 26.5 | 1 | 0–1.2 | — | — | — | V3 split: run (d) upper run |
| cw-d2 | V3S ↔ V3W | open | x = 29 | 26.5 | 1 | 0–1.2 | — | — | — |  |
| cw-d3 | V3W ↔ V3N | open | x = 29 | 20.5 | 1 | 0–1.2 | — | — | — |  |
| cw-d4 | V3N ↔ V4 | open | x = 32 | 20.5 | 1 | 0–1.2 | — | — | — |  |
| cw-3 | V4 ↔ CX | open | x = 33 | 23 | 1 | 0–1.2 | — | — | — |  |
| grille | CX ↔ ES2 | hatch | x = 35 | 23 | 0.9 | 0–1.2 | — | — | — | ES2 grille: kicked out, one way, stays open (placeholder: always open) |
| EC1-door | EC ↔ EC1 | door | z = -1.5 | 8.5 | 1.2 | 0–2.1 | closed | — | EC1 |  |
| EC2-door | EC ↔ EC2 | door | z = 1.5 | 8.5 | 1.2 | 0–2.1 | closed | — | EC2 |  |
| EC-loop | EC ↔ LWC | open | x = 15 | 0 | 3 | 0–3 | — | — | — |  |
| ring-nw | LWC ↔ LNC | open | x = 17.4 | -13.8 | 2.4 | 0–3 | — | — | — |  |
| ring-ne | LNC ↔ LEC | open | x = 26.6 | -13.8 | 2.4 | 0–3 | — | — | — |  |
| ring-sw | LWC ↔ LSC | open | x = 17.4 | 13.8 | 2.4 | 0–3 | — | — | — |  |
| ring-se | LSC ↔ LEC | open | x = 26.6 | 13.8 | 2.4 | 0–3 | — | — | — |  |
| loop-east | LEC ↔ EJ | open | x = 29 | 0 | 3 | 0–3 | — | — | — | The loop rejoins the east corridor here |
| LPW1-door | LWC ↔ LPW1 | door | x = 15 | -11.8 | 1.2 | 0–2.1 | open | — | LPW1 |  |
| LPW2-door | LWC ↔ LPW2 | door | x = 15 | -5 | 1.2 | 0–2.1 | open | — | LPW2 |  |
| LPW3-door | LWC ↔ LPW3 | door | x = 15 | 5 | 1.2 | 0–2.1 | open | — | LPW3 |  |
| LPW4-door | LWC ↔ LPW4 | door | x = 15 | 11.8 | 1.2 | 0–2.1 | open | — | LPW4 |  |
| LPE1-door | LEC ↔ LPE1 | door | x = 29 | -11.8 | 1.2 | 0–2.1 | open | — | LPE1 |  |
| LPE2-door | LEC ↔ LPE2 | door | x = 29 | -5 | 1.2 | 0–2.1 | open | — | LPE2 |  |
| LPE3-door | LEC ↔ LPE3 | door | x = 29 | 5 | 1.2 | 0–2.1 | open | — | LPE3 |  |
| LPE4-door | LEC ↔ LPE4 | door | x = 29 | 11.8 | 1.2 | 0–2.1 | open | — | LPE4 |  |
| LOFF-west | LWC ↔ LOFF | door | x = 17.4 | -1.6 | 1.2 | 0–2.1 | open | — | LOFF |  |
| LOFF-east | LEC ↔ LOFF | door | x = 26.6 | 1.6 | 1.2 | 0–2.1 | open | — | LOFF |  |
| LOFF-win-w | LWC ↔ LOFF | window | x = 17.4 | 1.4 | 2.4 | 1–2 | — | — | — | Observation window (west long side) |
| LOFF-win-e | LEC ↔ LOFF | window | x = 26.6 | -1.4 | 2.4 | 1–2 | — | — | — | Observation window (east long side) |
| LTR-office | LOFF ↔ LTR | door | z = 3 | 19.7 | 1 | 0–2.1 | open | — | LTR | Treatment room to office: approach C waiting position |
| LTR-door | LWC ↔ LTR | door | x = 17.4 | 8 | 1.2 | 0–2.1 | closed | — | LTR |  |
| LCU-door | LWC ↔ LCU | door | x = 17.4 | -8 | 1.2 | 0–2.1 | closed | — | LCU |  |
| LLN-door | LEC ↔ LLN | door | x = 26.6 | -8 | 1.2 | 0–2.1 | closed | — | LLN |  |
| LEQ-door | LEC ↔ LEQ | door | x = 26.6 | 8 | 1.2 | 0–2.1 | closed | — | LEQ |  |
| LUS-door | LNC ↔ LUS | door | z = -15 | 19.5 | 1.2 | 0–2.1 | closed | — | LUS |  |
| LKT-door | LNC ↔ LKT | door | z = -15 | 24.5 | 1.2 | 0–2.1 | closed | — | LKT |  |
| LISO-door | LSC ↔ LISO | door | z = 15 | 19 | 1.2 | 0–2.1 | closed | — | LISO | ISOLATION: door glass faces the south side |
| LBA-door | LSC ↔ LBA | door | z = 15 | 23 | 1 | 0–2.1 | closed | — | LBA |  |
| LST-door | LSC ↔ LST | door | z = 15 | 25.8 | 1 | 0–2.1 | closed | — | LST |  |
| EJ-south | EJ ↔ SB | open | z = 1.5 | 38.2 | 2.4 | 0–3 | — | — | — |  |
| EJ-north | EJ ↔ NBR | open | z = -1.5 | 38.2 | 2.4 | 0–3 | — | — | — |  |
| ES1-door | SB ↔ ES1 | door | x = 37 | 7 | 1.2 | 0–2.1 | closed | — | ES1 |  |
| ES3-door | SB ↔ ES3 | door | x = 37 | 13 | 1.2 | 0–2.1 | closed | — | ES3 |  |
| ES4-door | SB ↔ ES4 | door | x = 39.4 | 6.5 | 1.2 | 0–2.1 | closed | — | ES4 |  |
| ES5-door | SB ↔ ES5 | door | x = 39.4 | 13.5 | 1.2 | 0–2.1 | closed | — | ES5 |  |
| ES2-door | SB ↔ ES2 | door | z = 22 | 38.2 | 1.2 | 0–2.1 | open | — | ES2 |  |
| EN1-door | NBR ↔ EN1 | door | x = 37 | -5.5 | 1.2 | 0–2.1 | closed | — | EN1 |  |
| EN2-door | NBR ↔ EN2 | door | x = 37 | -12.5 | 1.2 | 0–2.1 | closed | — | EN2 |  |
| EN3-door | NBR ↔ EN3 | door | x = 39.4 | -6.5 | 1.2 | 0–2.1 | closed | — | EN3 |  |
| EN4-door | NBR ↔ EN4 | door | x = 39.4 | -16 | 1.2 | 0–2.1 | closed | — | EN4 |  |
| plant2-door | NBR ↔ M0 | door | z = -26 | 38.2 | 1.2 | 0–2.1 | closed | shaw-keys | M0 | Plant 2: needs the key; opens freely from inside (greybox: key required both ways) |
| M0-M1 | M0 ↔ M1A | open | z = -34 | 38.1 | 2.2 | 0–2.6 | — | — | — |  |
| M1-turn | M1A ↔ M1B | open | x = 37 | -43.2 | 1.6 | 0–2.6 | — | — | — |  |
| M1-M2 | M1B ↔ M2 | open | x = 29 | -43.2 | 1.6 | 0–1.4 | — | — | — | Forced crouch: 1.4 m tunnel for 6 m |
| M2-M3 | M2 ↔ M3 | open | x = 23 | -43.2 | 1.6 | 0–1.4 | — | — | — |  |
| steam | M3 ↔ M4 | door | x = 15 | -43 | 1.6 | 0–2.1 | closed | valve-open | M4 | Valve puzzle: steam blocks the way (placeholder gate) |
| M4-M5 | M4 ↔ M5 | open | x = 5 | -43 | 2 | 0–2.6 | — | — | — |  |
| bulkhead | M5 ↔ M6A | door | x = 2 | -43 | 1.2 | 0–2.1 | closed | bulkhead-cranked | M6A | Bulkhead: one way, after the bell (CP7) |
| C1-1 | M6A ↔ M6B | open | x = -4 | -43 | 1.6 | 0–2.6 | — | — | — |  |
| C1-2 | M6B ↔ M6C | open | x = -5.6 | -49.2 | 1.6 | 0–2.6 | — | — | — |  |
| C1-3 | M6C ↔ M6D | open | x = -14 | -49.2 | 1.6 | 0–2.6 | — | — | — |  |
| C1-4 | M6D ↔ M6E | open | x = -15.6 | -44.8 | 1.6 | 0–2.6 | — | — | — |  |
| barred | M6E ↔ M7 | door | x = -22 | -44.8 | 1.2 | 0–2.1 | open | — | M7 | Barred door: slammed and barred by the player (bar placeholder) |
| C5-in | M7 ↔ M8 | open | x = -28 | -44.8 | 1.2 | 0–1.2 | — | — | — | Low duct: forced crouch for 3 m |
| C5-out | M8 ↔ M8C | open | x = -31 | -44.8 | 1.2 | 0–1.2 | — | — | — |  |
| M9 | M8C ↔ NL | door | z = -33 | -32.8 | 1.2 | 0–2.1 | closed | — | NL | M9: shouldered open (tap or at a run) |
| NT | NL ↔ NB | door (double) | x = -16 | -31.2 | 2 | 0–2.1 | closed | — | NB | NT doors (NOT IN USE): push, swing shut; Shaw won't open them |
| NB-NB1 | NB ↔ NB1 | open | z = -30 | 0 | 2.4 | 0–3 | — | — | — |  |
| NB-NB3 | NB ↔ NB3 | open | z = -32.4 | -8 | 4 | 0–3 | — | — | — |  |
| C2-west | NB3 ↔ C2W | door (double) | x = -12 | -37 | 2.4 | 0–2.1 | locked | — | C2W | Chapter 2 continuation (locked in Chapter 1) |
| C2-east | NB ↔ C2E | door | x = 1.2 | -31.2 | 1.6 | 0–2.1 | locked | — | C2E | Chapter 2 continuation (locked in Chapter 1) |

99 connections: 59 doors (3 double), 36 open, 2 hatches, 2 windows.

## 3. Features (hiding, cover, controls, markers)

| ID | Space | Kind | Position (x, z) | Detail |
|---|---|---|---|---|
| r104-bed | R104 | bed | -36.6, 4.4 | bed, under-bed hiding |
| r104-chair | R104 | marker | -35.2, 5.8 | story: Mum's chair (empty) · glasses · crossword |
| r104-window | R104 | marker | -37.6, 2.4 | story: Storm window (frozen storm, 15–16 Oct 1987) |
| w2-bed | W2 | bed | -30.6, 4.4 | bed |
| w2-call | W2 | control | -31.6, 6.4 | sets `call-taught` · production estimate 2 s · Call button (teaches approach B) |
| w3-bed-a | W3 | bed | -25.6, 4.6 | bed, under-bed hiding |
| w3-bed-b | W3 | bed | -23, 4.6 | bed, under-bed hiding |
| w3-bed-c | W3 | bed | -20.4, 4.6 | bed, under-bed hiding |
| w3-bed-d | W3 | bed | -18, 4.6 | bed, under-bed hiding |
| w8-locker | W8 | locker | -11.8, 3.4 | locker hiding |
| w5-couch | W5 | block | -36.5, -4.6 | 0.8 × 2 × 0.8 m · Exam couch |
| w6-xray | W6 | block | -28, -5.2 | 1 × 2.2 × 0.8 m · X-ray table |
| w7-counter | W7 | block | -18, -3.9 | 4 × 0.6 × 1.1 m (cover) · Sister's counter |
| w7-roundsheet | W7 | marker | -16, -4.4 | story: Round sheet: 104 is the only name left |
| e1-start | WC | marker | -37, 0 | encounter: E1 Lights Out: beam starts (west-most doorway) |
| e1-trigger | WC | marker | -15, 0.6 | encounter: E1 trigger: past W7 heading east (placeholder) |
| e1-end | WC | marker | -6.6, -0.8 | encounter: E1 ends: beam fades at the lobby threshold |
| payphone | LOBBY | control | -5.4, 3.6 | sets `payphone` · production estimate 45 s · Payphone (answer) |
| lobby-lifts | LOBBY | marker | -5.4, -4.4 | guidance: Lifts / stairwell: never open (signage only) |
| lobby-sign-south | LOBBY | marker | 1.8, 4.4 | guidance: Sign: STORES · PORTERS ↓ |
| lobby-sign-east | LOBBY | marker | 5.4, 2.2 | guidance: F1 fire doors: push-bar from the east only |
| lobby-desk | LOBBY | block | 3.6, -3.2 | 2.4 × 0.8 × 1.1 m · Reception counter |
| office-desk | OFFICE | block | -1.6, -7.6 | 1.6 × 0.8 × 0.8 m · Shaw's desk |
| office-notice | OFFICE | control | 2.4, -6.4 | sets `route-stores` · production estimate 20 s · Transfer notice ("via Porters — Stores") |
| office-barricade-view | OFFICE | marker | 0, -9.3 | story: North door: look through the glass (wheelchair beat) |
| s1-locker-a | S1 | locker | -6.5, 8 | locker hiding |
| s1-locker-b | S1 | locker | -6.5, 9 | locker (not a hiding spot) |
| s2-tv | S2 | block | 7.4, 10 | 0.6 × 1 × 1.2 m · TV on a stand (frozen storm warning) |
| s3-bars | S3 | block | -5, 15.5 | 4 × 0.7 × 1 m · Parallel bars |
| s5-knockcode | S5 | marker | 5.4, 16 | story: Crawlway panel: knock code chalked |
| s6-coat | S6 | marker | 4, 23.2 | story: Your coat · visitors’ book 22:40 |
| sc-sign | SC | marker | 0.6, 28.4 | guidance: Sign: STORES → |
| st1-rack | ST1 | block | 14, 31 | 3 × 2.8 × 2.2 m (cover) · Central rack (aisle loop) |
| st1-cage-n | ST1 | block | 10.2, 26 | 1.6 × 0.9 × 1.8 m (cover) · Linen cage |
| st1-cage-s | ST1 | block | 17.6, 36 | 1.6 × 0.9 × 1.8 m (cover) · Linen cage |
| st1-bench | ST1 | bench | 11.4, 35.8 | bench, under-bench hiding (bed-type) |
| st1-trolley-bay | ST1 | marker | 9, 33.6 | encounter: E2: Shaw's trolley parks at the store door |
| st1-radio | ST1 | marker | 18.8, 26 | placeholder: Radio (lure placeholder) |
| porters-docket | ST2 | control | 23, 27.6 | sets `route-plant2` · production estimate 30 s · Docket + sign-out sheet (Plant 2 — Sr Shaw) |
| st2-phone | ST2 | marker | 21.2, 28.2 | encounter: E2 trigger: telephone rings on first entry (placeholder) |
| st2-desk | ST2 | block | 22, 27.8 | 1.6 × 0.8 × 0.8 m · Porters' desk |
| st2-locker | ST2 | locker | 25.4, 34.2 | locker hiding |
| st2-cage | ST2 | block | 21, 34.2 | 1.2 × 0.8 × 1.8 m (cover) · Linen cage (dark gap behind) |
| e2-shaw | ST1 | marker | 8.8, 30.4 | encounter: E2: Shaw's entrance (from the south corridor) |
| e2-stores-locked | SC | marker | 7.4, 31.2 | placeholder: Stores locked by Shaw if player inside (placeholder) |
| cw-v1 | V1W | marker | 27.5, 31 | guidance: V1 split · knock code |
| cw-steam | V1B | marker | 30, 38.5 | placeholder: Steam burst every 6 s (placeholder) |
| cw-grilles | V1A | marker | 30, 28.5 | placeholder: Ceiling grilles over the south corridor (vertical layering deferred) |
| cw-grate | V3C | marker | 32.5, 24.6 | encounter: V3 grate: Shaw stops beneath (placeholder) |
| cw-v4 | V4 | marker | 32.5, 21 | story: V4: the knocker (torch, Okafor badge, "7") |
| f1-pushbar | EC | control | 6.6, -1.1 | sets `f1-open` · production estimate 1.5 s · F1 push-bar (opens the lobby shortcut) |
| lpw1-bed | LPW1 | bed | 12.6, -11.8 | bed, under-bed hiding |
| lpw2-bed | LPW2 | bed | 12.6, -5 | bed, under-bed hiding |
| lpw3-bed | LPW3 | bed | 12.6, 5 | bed, under-bed hiding |
| lpw4-bed | LPW4 | bed | 12.6, 11.8 | bed, under-bed hiding |
| lpe1-bed | LPE1 | bed | 31.4, -11.8 | bed, under-bed hiding |
| lpe2-bed | LPE2 | bed | 31.4, -5 | bed, under-bed hiding |
| lpe3-bed | LPE3 | bed | 31.4, 5 | bed, under-bed hiding |
| lpe4-bed | LPE4 | bed | 31.4, 11.8 | bed, under-bed hiding |
| loff-desk | LOFF | block | 22, 0 | 2.4 × 1 × 0.8 m (cover) · Bed-state board desk |
| key-theft | LOFF | control | 23.6, -2.3 | sets `shaw-keys` · production estimate 285 s · [DEV PLACEHOLDER] Take Shaw's keys (stands in for approaches A/B/C) |
| approach-c-hook | LOFF | marker | 24.4, -2.6 | approach: Approach C: office key hook (reserved) |
| approach-c-wait | LTR | marker | 19.7, 3.8 | approach: Approach C: waiting position (treatment room door) |
| approach-b-call-w | LPW1 | marker | 11.6, -9.2 | approach: Approach B: call button (far side, west) |
| approach-b-call-e | LPE4 | marker | 32.4, 14.2 | approach: Approach B: call button (far side, east) |
| approach-a-stop-w | LWC | marker | 16.6, -11.8 | approach: Approach A: trolley stop (patient room) |
| approach-a-stop-e | LEC | marker | 27.4, 5 | approach: Approach A: trolley stop (patient room) |
| mirror-nw | LWC | marker | 15.3, -14.7 | mirror: Convex mirror (NW) |
| mirror-ne | LEC | marker | 28.7, -14.7 | mirror: Convex mirror (NE) |
| mirror-sw | LWC | marker | 15.3, 14.7 | mirror: Convex mirror (SW) |
| mirror-se | LEC | marker | 28.7, 14.7 | mirror: Convex mirror (SE) |
| loop-iso | LISO | marker | 18, 17.4 | encounter: ISOLATION: Shaw skips it (safe room) |
| liso-bed | LISO | bed | 16.4, 17 | bed, under-bed hiding |
| llu-locker | LCU | locker | 21.4, -12 | locker hiding |
| es3-bed | ES3 | bed | 34.6, 13 | bed, under-bed hiding |
| es3-figure | ES3 | marker | 35.8, 11 | story: A figure faces the wall |
| es2-exit | ES2 | marker | 36.2, 23 | guidance: CP4 · crawlway exit grille |
| plant2-plate | NBR | marker | 37.6, -24.8 | story: Plant 2: engraved plate matches the empty hook |
| en1-pager | EN1 | marker | 34.2, -5.5 | story: On-call: the pager shows 317 |
| en2-slide | EN2 | marker | 34.2, -12.5 | story: Seminar: "North Wing — Commissioning Schedule" |
| m0-boiler | M0 | block | 35.6, -30 | 2.4 × 3.2 × 2.6 m · Boiler |
| m0-log | M0 | marker | 41.2, -27.2 | story: Boiler log stops at 03:17 |
| m2-crouch | M1B | marker | 30, -43.2 | guidance: CROUCH: 1.4 m cable tunnel ahead |
| m3-pump | M3 | block | 19, -43 | 2.2 × 2 × 1.4 m (cover) · Pump housing (line-of-sight cover) |
| m3-alcove | M3 | locker | 22.4, -46.4 | locker hiding |
| valve | M3 | control | 16, -39.6 | sets `valve-open` · production estimate 45 s · Valve (silver-and-red banded pipe) |
| m3-shaw | M3 | marker | 22, -40 | encounter: E5 phase 5: Shaw searches the pump chamber (~20 s) |
| m4-lamps | M4 | marker | 10, -42.4 | story: Seven call lamps (go out as you pass) |
| m4-evidence | M4 | marker | 7, -43.6 | story: Transfer trolley · slipper · incident slip |
| bulkhead-crank | M5 | control | 3, -42 | sets `bulkhead-cranked` · production estimate 4 s · Bulkhead crank (hold ~4 s in production) |
| c1 | M6B | marker | -4.8, -46 | encounter: C1: pipe run, 4 turns (Shaw enters behind at ~12 m) |
| c2-bar | M7 | marker | -23, -44.4 | placeholder: C2: drop the bar (placeholder) |
| c5 | M7 | marker | -27, -45.2 | guidance: C5: CROUCH, low duct 3 m |
| c6 | M8C | marker | -32.8, -40 | placeholder: C6: service stair omitted (single-level greybox) |
| nl-bed-1 | NL | block | -30, -32.4 | 2 × 0.9 × 0.9 m · Dust-sheeted bed |
| nl-bed-2 | NL | block | -24, -32.4 | 2 × 0.9 × 0.9 m · Dust-sheeted bed |
| nl-trolley | NL | block | -20, -32.6 | 1.2 × 0.6 × 1.4 m · C8: linen trolley (pull-down placeholder) |
| c9 | NL | marker | -16.8, -32.6 | encounter: C9: Shaw stops at the glass (NOT IN USE) |
| nb1-barricade-a | NB1 | block | -0.5, -10.7 | 0.6 × 0.6 × 0.9 m · Barricade (chairs) |
| nb1-barricade-b | NB1 | block | 0.4, -10.9 | 0.7 × 0.6 × 1.2 m · Barricade (cabinet) |
| barricade | NB1 | control | 0, -12.2 | sets `chapter-end` · production estimate 90 s · Examine the barricade (chapter end, step 15) |
| nb3-knitting | NB3 | marker | -8, -38 | story: Ruth's red knitting · 3:18 clock |
| c2-sign | NB3 | marker | -11.4, -34.4 | guidance: Chapter 2 continues (locked) |

## 4. Checkpoints (developer teleports)

| CP | Label | Position | Flags restored |
|---|---|---|---|
| CP0 | Start (Room 104) | -35.4, 4.4 (R104) | — |
| CP1 | After E1 (lobby threshold) | -7.6, 0 (WC) | — |
| CP2 | Stores entrance | 6.2, 31.2 (SC) | route-stores |
| CP3 | Crawlway entrance | 24.8, 32 (ST2) | route-stores, route-plant2 |
| CP4 | ES2 exit | 37.2, 24.2 (ES2) | route-stores, route-plant2 |
| CP5 | Loop entry | 31, 0 (EJ) | route-stores, route-plant2 |
| CP6 | Plant 2 interior | 38.2, -28 (M0) | route-stores, route-plant2, shaw-keys |
| CP7 | Bulkhead | 4.2, -43 (M5) | route-stores, route-plant2, shaw-keys, valve-open |
| CP8 | Through the NT doors | -13.6, -31.2 (NB) | route-stores, route-plant2, shaw-keys, valve-open, bulkhead-cranked |

## 5. Encounter areas

| ID | Area [x0, x1, z0, z1] | Spaces | Note |
|---|---|---|---|
| E1 Lights Out | [-38, -6, -7, 7] | WC, R104, W2, W3, W4, W5, W6, W6D, W7, W8, W9 | Beam route east along the west corridor; hide under Bay beds or in the W8 locker; stay ahead to the lobby |
| E2 Stores | [8, 26, 25, 37] | ST1, ST2, CE | Shaw enters from the south corridor; aisle loop around the rack; locker, bench, cage cover; hatch exit |
| E3 Crawlway | [26, 35, 20, 39] | CE, V1W, V1A, V1B, V2E, V3C, V3S, V3W, V3N, V4, CX | Two splits that rejoin; crouched only; Shaw cannot enter |
| E4 Final Round | [11, 33, -19, 19] | LWC, LEC, LNC, LSC, LOFF, LTR, LPW1, LPW2, LPW3, LPW4, LPE1, LPE2, LPE3, LPE4, LISO | Ring corridor with two routes; office windows on both long sides; mirrors at the corners |
| E5 Maintenance | [2, 43, -47, -26] | M0, M1A, M1B, M2, M3, M4, M5 | Plant 2 → constriction → pump chamber (hiding) → link → bulkhead |
| E6 Chase | [-36, 2, -50, -30] | M6A, M6B, M6C, M6D, M6E, M7, M8, M8C, NL | Single line from the bulkhead to the NT doors; Shaw always behind |
