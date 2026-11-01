# Go Dharaa Farm — isometric acres sim

A canon-driven isometric sim of one acre: the farmer walks the paths, the pond
ring runs round the water, the 5 × 5 bed takes till / plant / water, and the
clock grows what was watered.

**Where it lives.** After the sandbox lost the first copy, this app was rebuilt
inside the studio repo at `farm/`, so git tracks it. The canon stays read-only
at `farm/canon/canon-v1.json` (a verbatim copy of
`living-acre-studio/canon/canon-v1.json`; `canon.test.ts` recomputes every
derived value from it).

```
farm/
  canon/canon-v1.json      read-only canon
  data/sim_overrides.json  everything the canon does not fix (labelled)
  src/sim/                 pure rules: world, paths, walkable, A*, plot, clock, water, i18n
  src/render/              three.js only: world, paths, pond, plot, actor, camera
  src/ui/                  plain HTML/CSS HUD and toolbar
  tests/                   src/sim only
  scripts/report-network.ts  prints the network, routes and ratios
```

## The hectare world (v2), step 1: data, schema, validator

Two inputs are saved verbatim and loaded at build time (not fetched):

- `data/farm-layout-v2.json` (22 zones, 9 gravel paths, 4 channels, 100 m square)
- `data/orchard-5layer.json` (five layers, 3 alleys, own seed)

Both are PLACEHOLDER: zones eyeballed from the reference blueprint, species and
counts from general knowledge. The orchard file also flags `names.hi` and
`names.kn` as `needs_review`.

**World switch:** `sim_overrides.overrides.world` is `"hectare_v2"` (the default
the brief asks for); `"acre_v1"` is the other accepted value. `WORLD_ID` and
`parseWorldId()` in `src/sim/canon.ts` read and refuse values. The acre world is
still the one the app builds (`WORLD`), so the 157 acre tests keep passing; the
hectare world becomes the app's world in step 3, when the renderer can draw it.

**Validator** (`scripts/validate-layout.ts`, logic in `src/sim/layout.ts` and a
small JSON Schema subset in `src/sim/json-schema.ts` — no new dependency):

```
clean: 22 zones, no violations
50 m..95 m interior honoured by every zone; no zone overlaps a zone or a path
four crop plots 22 x 24 m; ids unique; every declared *_ft column equals m x 3.28084
orchard alleys and the south-centre entrance inside the orchard; L1..L5 once each
```

Four faults are injected **in memory** (the files are never rewritten, so the
revert is the clean second run) and each is caught by its own check:

| fault | check that caught it |
| --- | --- |
| two zones overlapping | `zone.overlap` (plot_sunflower / plot_groundnut, 216 m2) |
| a zone outside the interior | `zone.interior` (solar_dryer x 92..101 m) and `zone.path_overlap` |
| a parcel that is not 100 m | `parcel.square` (side_m 90) |
| an alley outside the orchard | `alley.inside` (ns_2 x 80..85 ft of 82.02) |

`reports/step1-layout.json` carries per-zone areas (m2 and ft2), totals per kind
(8 building, 4 crop plot, 3 livestock, 1 orchard, 3 rotational strip,
1 vegetables, 1 water, 1 yard), the empty violation list and the fault results.

## The path network (M4)

One shared graph, built from canon geometry. **61 nodes, 63 edges, 6 junctions,
768.14 ft of trail.**

| node | feet | role |
| --- | --- | --- |
| gate | 3.50, 204.80 | entrance: gate |
| compost | 16.72, 178.81 | entrance: compost |
| beds_sw | 25.08, 144.99 | entrance: vegetable beds |
| goshala_door | 75.52, 40.66 | entrance: goshala (door gap) |
| farmhouse_door | 34.94, 34.50 | entrance: farmhouse (front door) |
| orchard_sw | 125.40, 103.83 | entrance: orchard (west edge) |
| ring_30 | 153.95, 145.04 | entrance: pond ring |
| beds_to_goshala / beds_to_farmhouse / beds_to_orchard | 75.52,74.99 · 34.94,74.99 · 105.08,103.83 | meets |
| beds_nw / beds_se / beds_ne | 25.08,74.99 · 105.08,144.99 · 105.08,74.99 | corners |
| orchard_fork | 116.95, 113.84 | the fork of the Y |
| ring_0 … ring_47 | r 27.6 ft around 173.47, 164.56 | ring |

**Edges.** Eight radial trunks: gate–compost 29.16, gate–beds 63.59,
beds–goshala door 34.32, beds–farmhouse door 40.49, and the Y — beds–fork
15.53, fork–orchard 13.10, fork–ring 48.40, orchard–ring 50.14. Seven beds-perimeter runs closing the
block (80.00, 41.16, 28.84, 29.56, 40.58, 9.86, 70.00), and 48 ring arcs of
3.61 ft. Every trunk is a single edge; no pair of nodes is joined twice.

Three cycles: the pond ring, the beds perimeter, and the orchard triangle
(fork–orchard–ring–fork). Five bridges: the four dead ends (gate–compost,
gate–beds, beds–goshala, beds–farmhouse) and the orchard fork trunk, which now
carries both the orchard and the ring. Cutting the orchard link is the proof
below.

**The bed.** 5 x 5 cells of **4 ft** (`plot.cell_ft` in
`data/sim_overrides.json`, default 4 ft), so the planted block is 20 x 20 ft,
centred in the canon 80 x 70 ft `vegetable_beds`. The size lives in data: no
literal 4 appears in `src/sim` or `src/render`.

**The tank.** `water.capacity` is 24 in `data/sim_overrides.json`, and the HUD
prints `tank.level / tank.capacity` — the only source. Mounting the real HUD
against a stub DOM prints `"24 / 24"`; the same HUD handed a world configured
for 10 prints `"10 / 10"`, so the number is read, not written into the UI.

**Routes from the gate** (A*, 1 ft grid), against the straight line:

| section | route | straight | ratio |
| --- | --- | --- | --- |
| compost | 29.07 ft | 29.16 | 1.00 |
| vegetable beds | 63.91 ft | 63.59 | 1.01 |
| goshala | 183.19 ft | 179.24 | 1.02 |
| farmhouse | 173.64 ft | 173.18 | 1.00 |
| orchard | 180.60 ft | 158.29 | 1.14 |
| pond ring | 220.60 ft | 161.89 | 1.36 |

**Pond ring.** `pond_ring: {gap 2, width 4, segments 48}`. Centreline radius
20 + 3.6 + 2 + 2 = 27.6 ft; inner edge 25.6 = the keep-out, so the body never
reaches a rim stone (furthest ≈ 24.1). Clears the orchard by 33.13 ft, the beds
by 43.54 ft. Pond collision is the canon circle, untouched.

**Door data.** `doors.farmhouse` (south face, 22.4 ft from the west edge) and
`doors.goshala` (south face, 17 ft, 8 ft gap) place both entrance nodes; the
renderer draws the farmhouse door and the goshala posts from the same data, so
the node and the art agree.

## The movement rule

`movement: {mode: "paths_only", free_zones: [goshala, vegetable_beds, compost,
orchard], path_width_ft: 5, spawn: "gate"}`. Walkable = free zones + corridors
of width/2 − farmer radius around the network. `"free"` still works and the
free-roam tests run under it. `src/sim/collision.ts` names no zone.

Click-to-move: A* on a 1 ft grid, string-pulled; a blocked click snaps to the
nearest walkable cell within 6 ft, otherwise it is refused with
"Stay on the path". Keyboard movement slides along corridor edges.

Two details that matter:

- Diagonal steps need **one** open orthogonal neighbour, not both: at 1 ft
  resolution the 4 ft ring is one cell wide, and the strict rule turns the loop
  into islands.
- Corridors rasterise at 0.9 cells minimum; narrower bands cannot be chained.

**HUD label.** Standing on a trail between zones reads **Path** — from
`src/data/strings.json` (`place.path`, en `Path`, hi `रास्ता`, kn `ಹಾದಿ`), with
`languages.hi` and `.kn` marked `needs_review` and the HUD saying so. Open
ground still reads "open ground"; a zone keeps its canon name.

## The polish pass

- **Beds.** `beds_look.soil_tint` (#6b3a28, PLACEHOLDER) replaces the old green
  slab. Under the 5 x 5 grid sits an earth pad, and one instanced mesh carries
  the ridges on every row boundary plus the four edging strips — the positions
  are `cellFt` arithmetic, so they follow the plot grid. Two draws for the pad
  and the ridges, one for the soil tiles, one for the crops. Orchard stays
  green: its slab and canopies are untouched.
- **Orchard density.** 7 hand-placed trees became **16 seeded ones** in
  `src/sim/orchard.ts`: a 4 x 4 staggered grid, jitter clipped so a canopy can
  never leave the canon orchard box, sizes from `orchard_look`.
  Determinism, in-bounds, count (12–20) and “no two trees overlap” are tested.
  Two instanced draws for the whole orchard (trunks, canopies) instead of 14.
- **The Y wedge.** The beds corner used to send two long legs out at a wide
  angle — to the orchard (20.32 ft) and to the ring (63.93 ft) — leaving a
  wedge of open ground. Now one trunk runs 15.53 ft along the line to the ring
  and the orchard peels off at the foot of its perpendicular (13.10 ft); the
  ring branch carries on 48.40 ft. Drawn wedge 101.8 sq ft instead of 209.4,
  approach 77.03 ft instead of 84.25, cycle rank still 3. Cost, stated plainly:
  the trunk is now a **bridge** — cut it and the orchard and the ring are both
  stranded — where the old two legs each had a way round.
- **Labels.** `labels.setZoom(zoom)` scales the sprites by `zoom^-0.65`, so the
  names stay readable at the whole-acre view without swallowing the map when
  the camera closes in.
- **Light.** One warm directional sun with `PCFSoftShadowMap`, plus a cool
  ambient fill. Both presets live in `lighting.presets` (morning / evening,
  azimuth + elevation, sky, sun and ambient colours, intensities), with the
  shadow map size and extent in data. `lighting.default_preset` picks one; there
  is **no key binding** — flipping the value is the switch, because a new key
  would be a feature nobody asked for.

## Buffer belt and perimeter walk: fit check (before building)

Both were specified with numbers that do not fit the canon parcel. Measured
clearance from each zone to the parcel boundary (feet):

| side | closest zones | belt 14 ft | walk centreline 18.5 ft |
| --- | --- | --- | --- |
| west | gate 3.00 · farmhouse 12.54 · compost 16.72 | farmhouse 1.46 ft inside | farmhouse 5.96 ft short |
| north | farmhouse 12.50 · goshala 16.66 | farmhouse 1.50 ft inside | 6.00 ft short |
| east | pond 15.53 · orchard 17.60 | ok, 1.53 ft spare | pond 2.97 ft short |
| south | gate 3.00 · pond 23.74 | gate (the gap) | 15.50 ft short |

The pond ring is the harder one: its outer edge reaches 5.93 ft from the east
boundary and 14.14 ft from the south, so it sits 8.07 ft inside a 14 ft belt on
the east.

## The buffer belt, as built

Data: `sim_overrides.buffer_zone` — per-side width **12 W / 12 N / 5 E / 14 S**
(the user's choice after the fit check), spacing 9 ft, 2 rows, jitter 2 ft, seed
20261101, gate gap 10 ft, canopy top limit 34 ft, species weights 3:1. Widths,
spacing, seed and the canopy limit are PLACEHOLDER: eyeballed from the hero
image, not canon.

`src/sim/belt.ts` walks every candidate in seeded order, jitters it, clips it
into its own band, then drops it if it is within the gate aperture, a path
corridor (the garden walk included), a zone footprint, the pond water, or the
pond ring. **184 candidates → 145 trees** (`round_canopy` 110, `tall_slender`
35, west 39 / north 44 / east 24 / south 38); drops: overlaps a neighbour 19,
path corridor 16, gate gap 4. Heights
18.0–30.3 ft, under the 34 ft cap, so the farmer and the labels stay visible at
default zoom. **The trees are decoration: no collision, no zone moves, no
gameplay.** `src/render/belt.ts` draws them as two `InstancedMesh`es, one per
species, with a per-instance scale and tint from the same seed.

## The perimeter walk, as built

Data: `sim_overrides.perimeter_walk` — width 5 ft, offset 2 ft in from the
belt's inner edge, corner radius 12 ft, six connectors, node spacing 4 ft,
clearance 2 ft. All PLACEHOLDER.

The loop is the inset rectangle with **notches** (the user's choice) round the
farmhouse's north-west corner and the pond ring's south-east arc, inset 16.5 ft
west / north, 199.5 ft east, 189.8 ft south: **197 legs, 760.73 ft, one closed
cycle**, no leg inside a zone, no node inside the keep-out. Spurs are routed to
the nearest point ON the loop (not the nearest node) so a door can leave square
to its own wall, and a spur is scored by bends then length:

| section | spur ft | leaves the loop at |
| --- | --- | --- |
| gate | 34.24 | `walk_join_gate` (20.62, 187.68) |
| compost | 0.11 | `walk_join_compost` (16.61, 178.82) |
| goshala | 4.50 | `walk_join_goshala` (75.52, 45.16) |
| farmhouse | 4.50 | `walk_join_farmhouse` (34.94, 39.00) |
| orchard | 40.60 | `walk_109` (139.37, 130.46) |
| pond_ring | 14.58 | `walk_join_pond_ring` (153.95, 130.46) |

A spur may cross the trunk **once** — that is a junction — and never twice, which
is what used to leave a lens. Where a spur leaves the same node its own trunk
does (the orchards, the gate), a crossing there is left unsplit on purpose: the
two already meet at the door, so a junction would only add a second way between
the same two nodes. That is why **no two edges now share a pair of nodes at
all** (the network test asserts it outright) and why there are 2 `walk_junction`
nodes rather than the 6 an earlier revision produced.

6/6 kept, none dropped. Where the loop crosses a trunk in open ground the
crossing is split into a real `walk_junction_N` node, so it is walkable, not
just drawn: 2 such junctions.

Movement is unchanged: the loop is painted onto the same 1 ft walkable grid as
every other path, so `P` shows it walkable and A* may use it; the boundary still
blocks and the belt still has no collision. Routes from the gate to the six
joined sections, with the loop on and off: gate 0.00/0.00, compost 29.07/29.07,
goshala 183.57/183.19, farmhouse 173.78/173.64, orchard 178.26/180.60,
pond_ring 219.89/220.60. The orchard (2.34 ft) and the pond ring (0.71 ft) are
shorter with the loop; the goshala (+0.38 ft) and farmhouse (+0.14 ft) are a
hair longer, which is A* choosing between equal-cost cell paths now that there
are more walkable cells — inside the 2 % tie-break slack the route test allows,
and every ratio is still under the 1.6 limit. No benches or lamps were added: the brief called them
optional and they would need new geometry and a new data block.

## Render budget

Counted the way the renderer counts, in node, with the same script before and
after the polish pass:

| | draw calls | triangles |
| --- | --- | --- |
| polish pass, before (commit 529ce43) | 60 | 8,317 |
| polish pass, after (commit 1fe83c6), visible | 50 | 9,387 |
| polish pass, after, + shadow pass (42 casters) | 92 | 18,305 |
| **belt + walk (this step)**, visible | **55** | **27,691** |
| **belt + walk (this step)**, + shadow pass (47 casters) | **102** | **55,366** |

`scripts/report-render.ts` rebuilds the same groups `createView` builds, walks
the scene and counts one call per drawable (an `InstancedMesh` is one call
whatever its count) plus one per shadow caster. Run against a worktree of
commit `1fe83c6` it reproduces that commit's 50 calls / 9,387 visible triangles
exactly; its shadow-pass figure for the same commit is 18,758 triangles, 453
more than the number recorded during the polish pass, because the two counts
tallied the shadow pass slightly differently. Both sides of the new table come
from the one script. The belt adds **4 draws / 15,080 triangles** (two trunk
`InstancedMesh`es and two canopy ones, one pair per species); the walk adds
**1 draw / 4,014 triangles** to the paths group (the loop ribbon, its lighter
edge strip and the six spurs). No thin fence was built: the brief allowed one
"only if it fits" on the north-east, and the 12 ft north / 5 ft east bands are
already full of trees, so it was left out rather than crowded in. Budget 300
calls / 150,000 triangles.

Triangles went up because 16 instanced canopies replaced 7 loose ones; calls
went down because the orchard is two instanced draws and the labels are sprites.
Budget 300 / 150,000. `renderer.info` needs a live GL context, so this mirrors
its accounting (sprites counted as one call, shadow casters drawn twice) rather
than reading the GPU.

## Controls

`WASD` / arrows walk · click to walk · `1`–`5` tools · `L` language ·
`V` zoom · `P` walkable overlay · `O` map outlines.

## Commands

```bash
npm install
npm run dev        # dev server on 0.0.0.0:5173
npm run build      # tsc --noEmit && vite build
npm test           # vitest run (120 tests)
npm run typecheck
npx tsx scripts/report-network.ts   # node/edge list, routes, ratios
```

Pinned exactly: `three@0.186.1`, `vite@8.3.4`, `vitest@5.0.5`,
`typescript@7.0.2`, `@types/three@0.186.0`.

## Status

- M1 – M1.3, Step C, look pass: rebuilt in `farm/` after the sandbox lost the
  original tree (the old commits `694ae2a`…`ffce550` lived in a separate local
  repo that was never pushed).
- **M3**: paths-only movement, A*, pond ring, P overlay.
- **M4**: network completion — seven sections connected, beds–orchard direct,
  beds–farmhouse, beds perimeter loop, ring keep-out, "Path" HUD label.
- **Buffer belt + perimeter walk**: 145 decorative trees in four bands, a closed
  760.73 ft garden walk with six spurs joined to the network at real junctions.
  **157 tests across 12 files**, typecheck and build clean.
