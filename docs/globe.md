# Globe implementation notes

## Approach

| Concern | Choice |
| --- | --- |
| Drawing | `@shopify/react-native-skia` (included in Expo Go) |
| Country data | Natural Earth 1:110m via `world-atlas/countries-110m.json` (177 countries) |
| Preprocessing | `topojson-client` → GeoJSON, `topojson-simplify` for a lighter copy, `d3-geo` for centroids (and hit-testing from milestone 3) |
| Projection | Orthographic, hand-written as a Reanimated **worklet** (`src/globe/projection.ts`) |
| Orientation | Unit quaternion (`src/globe/rotation.ts`). No up-lock: spins freely over the poles and upside down |
| Gestures | `react-native-gesture-handler` v3 hooks; callbacks run on the UI thread. Trackball drag: axis in the screen plane perpendicular to the finger, angle = distance / radius |
| Momentum | Reanimated `withDecay` on a "spin distance", applied as continued trackball drag along the release direction |

The renderer uses the quaternion's rotation matrix directly. It doesn't convert to
d3-geo rotate angles, which would bring back gimbal problems near the poles.

### Why the projection isn't d3-geo's `geoOrthographic`

d3-geo isn't written as worklets, so calling it every frame would mean running it on
the JS thread and sending the path across, which is the usual source of jank. Instead
d3-geo does the one-off work at startup, and a small custom orthographic projection
runs on the UI thread each frame:

1. Each border point is precomputed as a 3D unit vector.
2. Each frame: rotate by the view centre (lon/lat), skip rings whose bounding cap is
   wholly on the far side, clip rings at the horizon, and close the gap with an arc
   along the globe edge.
3. Emit one SVG path string; Skia parses and draws it in a single native call.

## Performance measurements (milestone 1)

Measured in Node on a desktop CPU. `--jitless` disables the JIT and gives a rough
proxy for Hermes on the phone, which also has no JIT. Phone figures will differ;
read them from the on-device overlay (see below).

| Version | Points | JIT ms/frame | Interpreter ms/frame |
| --- | --- | --- | --- |
| First version (decimal coords, absolute `L`) | 12,034 | 2.96 | 9.34 |
| Integer quarter-pixel coords, relative `l` | 12,034 | 1.26 | 4.97 |
| + shared-border simplification, 5° densify | 5,487 | 0.77 | **2.47** |
| Full detail (for zoomed-in views, milestone 2) | 10,308 | 1.13 | 4.53 |

The budget is 16.7 ms per frame at 60 fps, and Skia's drawing has to fit inside it too.

### On-device overlay

While `SHOW_PERF` is on, the globe shows a small green readout:
`fps · path ms`. **fps** is the UI-thread frame rate and **path** is the average time
spent building the globe path each frame. Turn it off with `SHOW_PERF` in
`src/components/globe/Globe.tsx`.

Expo Go runs a development JS bundle, which is slower than a release build. For
realistic numbers run `npx expo start --no-dev --minify`.

## Zoom (milestone 2)

- Zoom multiplies the globe radius (`src/globe/zoom.ts`): 1× to 6×. Pinching past a
  limit rubber-bands, gives a light haptic (`expo-haptics`), and springs back on release.
- The point between the fingers stays put while pinching (the globe rotates to compensate).
- Two-finger twist rolls the globe about the line of sight. Drag, pinch and twist all run
  at once.
- From 2× up the globe draws the full-detail outlines instead of the simplified copy.
- Rings wholly outside the canvas are skipped, so zoomed in is cheaper, not dearer:

| Zoom | Outlines | JIT ms/frame | Interpreter ms/frame |
| --- | --- | --- | --- |
| 1× | simplified | 0.38 | 1.69 |
| 2× | detailed | 0.40 | 2.03 |
| 6× | detailed | 0.13 | 0.71 |

- The outer glow fades out by 1.6× (it's off-screen by then, and a large blur is costly).

## Selection and visited state (milestone 3)

- **Tap → country:** the tap worklet undoes the projection (screen point → point on the
  sphere, using the current orientation and zoom) and sends lon/lat to the JS thread,
  where `src/globe/hitTest.ts` uses d3-geo's spherical point-in-polygon. Under 1 ms per
  tap. Antimeridian countries (Russia, Fiji) work because the test is spherical.
- **Generous targets:** every country can be hit within 10 px of its anchor (so Luxembourg
  is tappable at full-globe size), and taps up to 8 px off a coast pick that country.
  Tapping open ocean or off the globe deselects.
- **Anchor:** each country's anchor is the centroid of its largest polygon, so France
  centres on France rather than between it and French Guiana.
- **Centring:** the globe slerps to the smallest rotation that brings the anchor to the
  front (it keeps the user's twist; it doesn't force north up). Any touch cancels it.
- **Visited:** one store (`src/state/visitedCountries.tsx`) holds the visited ids, saved
  with AsyncStorage. The globe draws all visited countries as one green path; the country
  being toggled is drawn on its own with an animated grey ↔ green colour.

## Known compromises

- At full-globe size small neighbours win taps near their borders (e.g. Paris picks
  Belgium at 1×, France when zoomed in). Zoom in for precise picks.
- The selected country stays highlighted when the user drags away, but the globe doesn't
  stop them dragging it off-centre. The name bubble follows the country and hides when
  it turns away.
- Visited state isn't shown for the mock current location (Thailand) yet.

- Natural Earth 1:110m is coarse; at 6× coastlines look angular. The terrain map
  (PRD step 5) takes over for closer views.

- Countries cut at the ±180° antimeridian (eastern Russia, Fiji) show a faint border
  line along the cut.
- Polygon holes are drawn with even-odd fill.
- Low-detail geometry: tiny islands and microstates may be missing or very small. This
  matters for tapping in milestone 3.
## Visual polish

All colours, sizes and effect strengths live in `globeStyle` in `src/theme/index.ts`
(shared with the future map view).

**Checking a look without a phone:** the same Skia tree can be rendered headlessly in
Node with `@shopify/react-native-skia/lib/commonjs/headless` and `canvaskit-wasm`
(the real Skia engine), then viewed as a PNG.

**No adaptive quality:** every effect is always drawn, moving or not, so what you see
while spinning is what you see at rest.

### What's drawn, bottom to top

Light comes from the top-left of the screen.

| Layer | How | Cost per frame |
| --- | --- | --- |
| Backdrop spotlight, atmosphere halo, ocean | Radial gradients | ~3 gradient fills |
| **Land layer** | Grey tops (top-to-bottom gradient), green visited tops and the fading country, drawn into one layer. The layer's image filter adds, underneath: two blurred tinted copies (shallow-water glow) and `slab.steps` darkened copies shifted down-right (the raised sides). Clipped to the sphere | 3 path fills + GPU filter passes (no extra path work) |
| Borders, lit edges | Land path stroked; again 1 px up-left in faint white; visited border in green | 3 strokes |
| Shading, rim shadow, rim light, rim line | Gradients over the sphere | ~4 gradient fills |

**Sides are darkened copies of the tops**, so grey land gets a dark grey side and green
land a dark green one (`slab.shade`). Because the tops are drawn last in the layer, the
sides only show over the sea; they never cover a neighbouring country.

**Land texture was tried three ways and dropped.** A noise overlay is in screen space
(it stays put while the land slides under it, like a dirty screen). Hand-drawn marks
(hills, mountains, waves) stamped with a Skia `Atlas` at fixed lat/lon points did stick
to the globe, but looked poor at this size. Keeping them in step with the land meant
handing ~500 transforms to Skia every frame, which dropped fps into the 20s. Lessons
kept for any future attempt:
- `useRSXformBuffer`'s mapper declares no outputs, so Reanimated can run Skia's redraw
  before it and the stamps lag the land by a frame.
- A zero-size atlas transform makes Skia stop drawing every sprite after it.

**Paths are parsed once per frame.** The projection builds SVG strings; each is turned
into an `SkPath` in its derived value and shared by every layer that draws it. Passing a
string to `<Path>` makes Skia's native recorder re-parse it for each layer every frame.

**Why the earlier version was slow when partly zoomed in:** every side copy and the two
wide shallow-water strokes were separate path draws, and Skia re-triangulates a path
each time it's drawn. With the detailed outlines on screen that was ~15 large path draws
per frame. The layer filter replaces them with image passes on the GPU.

Making visited countries taller was tried twice (deeper sides spilled over neighbours;
lifted tops looked janky) and dropped.

## Flat map

The map button on the Visited screen switches to a flat world map
(`src/components/map/WorldMap.tsx`). Both views stay mounted and stacked, so each keeps
its position; the hidden one is transparent and ignores touches (an idle Skia canvas
doesn't redraw, so it costs little). Don't hide a Skia canvas with `display: 'none'`: it
loses its drawing and comes back blank, because nothing triggers a redraw.

| Concern | Choice |
| --- | --- |
| Projection | d3-geo Natural Earth (`src/globe/flatMap.ts`), the rounded atlas-style world map. Antarctica stays a sensible size |
| Outlines | Built once on the JS thread with `geoPath` and parsed into Skia paths once. Moving and zooming only change one transform, so nothing is rebuilt per frame |
| Look | Same theme and land layer as the globe (`landLayer.ts`): raised sides, shallow-water glow, borders, lit edges, green visited countries. Map-only colours are in `globeStyle.map` |
| View | Zoom 1 = whole world fits the width (`MAP_ZOOM` 1–12); it opens zoomed to fill the height. The view is the map point at the screen's middle, clamped so the map always covers the screen |
| Gestures | Drag with momentum, pinch about the fingers, tap to select (slides the country to the middle) |
| Tapping | Screen → map units → `projection.invert` → lon/lat → the same `countryAt` as the globe, with map units per radian × zoom as the scale |

The land layer's filter has to work in screen px, so inside the map transform the layer
sits in a group that undoes the transform, and the land tops inside it re-apply it.
Side copies grow with depth (at most 1.25 px apart) so deep sides don't look stepped.

Not done yet: horizontal wrap-around (the map stops at ±180°), the mock current
location, and activity markers.

## Textured globe: texture pipeline (stage 1)

`npm run build:globe-textures` (`scripts/build-globe-textures.mjs`, about 45 s) builds the
textured globe's images. Sources and licences are in `docs/ASSETS.md`. The first run
downloads ETOPO 2022 (466 MB) into `data-raw/`, which is not committed.

| File | Contents |
| --- | --- |
| `assets/globe/earth-{4096,2048}.jpg` | Three greyscale layers in one image (saves graphics memory): red = shaded relief (0.5 = flat), green = land mask, blue = ocean depth (√ scaled, 1 = 7 km) |
| `assets/globe/countries-{4096,2048}.png` | Country id per pixel, no anti-aliasing: 0 = sea, app country index + 1, 255 = land not in the app's list (microstates) |
| `assets/globe/clouds-2048.jpg` | Cloud cover, generated on the sphere so it has no seam at ±180° |
| `assets/globe/country-ids.json` | Id → app country id/name, and pixel counts (for small-country dots) |
| `docs/preview/*` | Previews and `id-check.md` (texture ids vs the app's tap test at known places) |

- Relief: ETOPO surface elevation averaged 2:1 to 10800×5400, shaded from four
  directions (NW strongest) with 24× height exaggeration, then scaled down.
- Land mask and ids come from Natural Earth 50m outlines; ids follow the app's 110m
  country list, so the 63 microstates only in 50m are "unassigned" (255) for now.
- At exact coastlines the 50m texture and the app's 110m tap outlines can disagree by a
  few km (Rio and Suva on the shore, Taveuni missing from 110m). Inland they agree.
- Gotchas: geotiff's `readRasters({ width, height })` skips pixels instead of averaging;
  sharp turns a one-channel image into three when resizing unless you `extractChannel(0)`.

## Textured globe: renderer (stages 2–3)

`GLOBE_RENDERER` in `src/theme/index.ts` picks the globe: `'texture'` (default) or
`'vector'` (the raised-country globe). Gestures, selection, the name bubble and visited
state are shared; only the drawing differs. The texture renderer falls back to vector
(with a console warning) if its shader won't compile or a texture fails to load, and
shows the vector globe while the first texture loads.

- `globeShader.ts`: SkSL. Each pixel → point on the sphere in view space → world space
  (transpose of the rotation matrix, passed as three row uniforms) → lon/lat → texture.
- `TextureGlobeLayers.tsx`: the shader on a circle, texture loading (`useGlobeTextures`)
  and the starfield. The 2048 earth texture loads at start; the 4096 one loads the first
  time zoom passes `textureGlobeStyle.hiResZoom`, and is used above it.
- `GLOBE_MAPPING_TEST` swaps in the stage 2 checkerboard (London and Sydney markers,
  vector outlines on top) to check the mapping.
- Lighting is in screen space (top-left), with ambient light so the shadow side stays
  readable, a broad sun highlight on the sea, and a blue fresnel rim. All values are in
  `textureGlobeStyle`.

## Textured globe: countries (stage 4)

- The shader reads the country id texture (`countries-*.png`, nearest sampling) at four
  points around each pixel. It averages their colours, so colour boundaries look soft,
  and draws a border where the ids differ (`textureGlobeStyle.borders`).
- Visited colours come from a 256 × 1 palette image rebuilt when the visited set changes:
  pixel `id` = that country's colour, alpha 1 if visited. The country being toggled is
  passed as uniforms (`fadeId`, `fadeAmount`, `fadeColor`), so it fades over 500 ms, with
  a light haptic.
- Visited land = colour × (0.6 + 0.8 × relief), so the terrain shows through.
- `visitedColorFor()` in the theme picks each country's colour: an override table
  (rainforest, desert, highland, Mediterranean, boreal, ice), then latitude, then a ±6%
  lightness variation from a hash of the name so neighbours differ. Antarctica is icy
  white and Greenland pale ice.
- Selection: the selected id is brightened, and a ring of 8 id samples `glowWidth` px out
  gives a soft glow that hugs the outline (only computed while something is selected).
- Countries under `smallCountryDots.maxPixels` in the 2048 id texture (Luxembourg,
  Cyprus, Brunei…) get a glowing dot at their anchor when visited.
- `DEBUG_ALL_VISITED` shows every country visited without touching the saved list.
- On the textured globe the vector outlines aren't built at all (`vectorShown`), which
  saves the path-building time each frame.


## Textured flat map, forest greens, layout (after stage 4)

- **Flat map** now uses the same land as the textured globe: a shader (`MAP` in
  `globeShader.ts`) covers the canvas, turns each pixel into map units → lon/lat
  (inverse Mercator) and draws relief, borders, visited colours and the selection glow
  with the shared `LAND` code. No sea: off land is see-through. The vector map is the
  fallback if the shader fails.
- The map is **Mercator cropped to 84°N–57°S** (`src/globe/flatMap.ts`), about 1.5:1,
  instead of the whole-world Natural Earth map. Zoom 1 fills the canvas height, so there
  is never empty space above or below; `MAP_ZOOM` is 1–8. Antarctica is left out.
- **Textures are loaded once** by the Visited screen (`useGlobeTextures` in
  `globeTextures.ts`) and shared by both views; each picks 2048 or 4096 by its own zoom
  (`useTextureSet`). The colour table is rebuilt only when the visited set changes.
- **Visited colours** are a narrow family of forest greens (`visitedPalette.forest`),
  one per country from a hash of its name, ±4% lightness. Antarctica and Greenland stay
  ice.
- **Borders and colour edges** are sampled about a screen pixel apart
  (`borders.softness`), so they stay thin at any zoom. Zoomed far in, edges still follow
  the texture's pixel grid (most visible far north on the map, where Mercator stretches
  the texture most).
- **Globe zoom** goes to 12× (`MAX_ZOOM`). Past about 6× the relief softens: 4096 is the
  textures' full detail.
- **Layout:** the globe/map area runs edge to edge, and the top row (visited count and
  speech bubble) floats over it. Before, expanding or collapsing the bubble resized the
  globe's canvas, which glitched and could leave the globe grey.


## Textured globe: clouds, ocean detail and performance (stage 5)

- **Clouds** (`clouds-2048.jpg`, globe only) are still, and fade out between zoom
  `clouds.fadeFrom` and `fadeTo` (they look blurry close up); once faded they aren't
  sampled at all. A slow drift was tried and dropped: it looked wrong while zooming.
- **Ocean ripples**: value noise in texture space (so it sticks to the globe), stretched
  east-west into wave glints, strongest in the sun highlight, plus a faint grain over all
  sea. Never finer than about two screen pixels, so it doesn't shimmer when small.
- **Taps** read the 4096 country texture first (after the tiny-country targets), so
  islands and coastline missing from the coarse 110m outlines can be tapped. The texture
  is read back once (`readPixels`, one byte per pixel, or colour as a fallback).
- **Borders zoomed in** are vector lines: thin white lines from the Natural Earth 1:50m
  shared borders (`buildBorderLines`: each border once, no coastlines, cut into 32-point
  pieces so only pieces near the screen are projected; `buildGlobeLines` in
  projection.ts). The globe fades from texture borders to lines between
  `borders.linesFrom` and `linesFull`. ~20k points; about 0.7 ms per frame (JIT) at 3×,
  0.2 ms at 12×. The map always draws them as one static path (three copies for the
  wrap-around). An 8192 country texture was tried first and dropped: its 32 MB upload
  stalled frames when zooming in, and it was still stepped at 12×.
- **Map zoom** goes from the whole map (zoom 1, fits the width) to 18×; it opens zoomed
  to fill the height. The map **wraps round** east–west: the view's centre is kept in
  0…map.width, the shader samples past the edges (the textures repeat), and taps, the
  bubble and dots use the nearest copy.
- **Hidden-tab fix**: Expo Router hides the inactive tab with `display: 'none'`, which
  loses the Skia canvases' drawing (the globe came back grey, then black). The app
  layout gives `TabSlot` its own `renderFn` that keeps opened tabs laid out and makes the
  inactive one transparent and untouchable instead (`src/app/_layout.tsx`).

### Performance

Measured by reasoning about the work, not on a phone; check the readout on device.

| Effect | Per pixel (GPU) | Per frame (UI thread) | Memory |
| --- | --- | --- | --- |
| Earth (relief, mask, depth) | 1 texture read | uniforms only | 2048: ~11 MB; 4096: ~43 MB (with mipmaps) |
| Countries (soft edges, borders, visited colour) | 4 id reads + 4 palette reads | — | ids 2048 / 4096: ~2 / 8 MB (one byte per pixel); palette 1 KB |
| Selection glow | 8 more id reads, only while something is selected | — | — |
| Clouds | 1 texture read (none once faded out) | — | ~3 MB |
| Border lines (zoomed in) | stroke | ~0.2–0.7 ms path build (JIT) | ~20k points |
| Ripples and grain | ~2 noise evaluations (arithmetic only) | — | — |
| Lighting, sun, rim | arithmetic only | — | — |
| Tap lookup | — | — (once per tap, JS thread) | 8 MB copy of the 4096 ids |

- The vector outlines aren't built at all on the textured globe, so path-building time
  is ~0 ms (it was ~2 ms per frame on the vector globe).
- The costliest case is a full-screen view with something selected: about 18 texture
  reads per pixel. If that drops frames, the first things to cut are the glow ring
  (8 reads) and the 4-sample soft edges (down to 1).
- Texture memory with everything loaded: ~70 MB of graphics memory (4096 and 2048
  earth and ids, clouds).

## Every country, cleaner globe, one-piece map

- **Country list = all 241 Natural Earth 1:50m countries and territories** (Andorra,
  Monaco, Malta, Singapore, every island territory), in `src/globe/countryList.json`
  with precomputed anchors (computing them took ~0.2 s, too slow for startup). The
  texture script writes it (`buildCountryList`), and the country texture's ids follow
  its order, so every piece of land belongs to a selectable country. Ids are ISO codes
  (made unique: Ashmore and Cartier Is. shares Australia's, so it uses its name);
  existing saved visits keep working. Tapping uses the 50m outlines; the vector globe
  (fallback) still draws the 110m outlines, matched to the list by id or name.
- **Microstates** (Vatican, Monaco…) are smaller than a texture pixel. Once zoomed in
  (globe radius or map px-per-radian ≥ 500) each gets a 7 px tap target round its
  anchor, and a glowing dot when visited.
- **No seam at 180°**: the globe samples its textures without mipmaps (`LINEAR`); with
  mipmaps the jump in texture position at ±180° drew a line from pole to pole. The flat
  map, which has no jump, keeps mipmaps.
- **Ocean ripples removed**: sized by zoom, their pattern re-formed while pinching and
  looked like an overlay swirling over the globe. Clouds stay (still, fading out with zoom).
- **Coastal pixels** the land mask covers but no country id reaches take their country
  from a little further out, and the visited share counts only land samples, so
  visited coasts aren't fringed with grey.
- **Borders**: thicker white vector lines (1.4 px) from zoom 1.6, covering the
  texture's stepped colour edges; on the map they're thinner when zoomed out.
- **Globe max zoom 7.**
- **Flat map**: one map (no wrap-around). Zoom 1 fits the whole map inside the screen
  with `mapMargin` to spare, and it opens like that; zoom to 16×. Cropped to 84°N–70°S
  so Antarctica's coast is on it. Its vector outlines are only built if the fallback
  is ever drawn.


## Sharp close-up land, deeper zoom, map edges

- **Zoom**: globe to 30×, map to 80×, enough to tap Andorra, Aruba or Grenada
  comfortably. Zoom buttons double or halve the zoom.
- **Close-up vector land** (`CloseUpLand.tsx`, `MapCloseUpLand.tsx`): from
  `textureGlobeStyle.closeUp` (globe 5.5×, map 6×, switching back 0.4 below) land is no
  longer read from the textures, which turn blocky when magnified. Instead every
  country is pre-cut into 5° squares (`src/globe/landCells.json`, written by the
  texture script; ~4,100 pieces) and each frame only the pieces near the screen are
  projected into four paths in one pass: all land, visited, the country fading in or
  out, and the selected country. They're filled with the same globe/map shader in a
  `landMode` (1 grey, 2 visited) so relief, lighting and colours match the textured
  view; the sphere then draws only the sea (`oceanOnly`), and the map's texture layer
  draws nothing (`landHidden`).
  - Relief is sampled with a smooth (cubic B-spline) filter in this mode, so the
    texture's pixel grid doesn't show as creases. It's still 4096-pixel data, so close
    up it's soft rather than detailed.
  - Visited colour comes from the country texture with the vector shape deciding
    where it's drawn; pixels whose id is wrong (coasts, unvisited neighbours) look
    a little further round. Row 1 of the palette holds every country's colour, opaque.
  - Pieces are cut with d3's rectangle clipping after cutting outlines at the
    antimeridian (Russia's far east crosses it), and overlap their neighbours by 0.25°
    (inside the country, so it can't be seen) so no hairline shows between them.
  - Selection close up: a "plus" brighten fill plus a soft glow and crisp line along
    the country's real outline (`countryOutlineLines` / `getFlatMapCountryLines`, which
    skip the data's cuts along 180° and the South Pole).
  - Cost (Node, desktop; a phone is several times slower): globe 0.2–2 ms per frame,
    map 0.05–2.5 ms, dearest over Europe right at the switch zoom, cheaper further in.
- **Flat map**: starts at 169°W (just east of Russia's far tip), so Russia is whole on
  the right and Alaska on the left; the shader adds `mapLonOrigin`. Cropped to
  84°N–60°S: Antarctica is left off for now (South Georgia and the South Sandwich
  Islands stay on). Drawing is clipped to the map's rectangle (`mapClipPath`).
- **No visited dots** on tiny countries any more: with the deeper zoom you can see and
  tap the country itself.
- **Challenge bubble** starts collapsed (just the monkey badge); tapping it opens the
  bubble, which now has a set width (in the floating top row it had none, so its text
  wrapped into a tall, narrow strip).
- **Starfield** (`Starfield.tsx`, theme `starfield`, reference
  `docs/design/stars-ref-1.jpeg`): faint blue galaxy dust along a diagonal band with a
  soft glow, plain stars, and a few bright stars with halos. Points and gradients only
  (no blur), since the canvas redraws every frame while the globe moves.
