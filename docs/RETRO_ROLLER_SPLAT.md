# Retro Roller splat banner

The home page banner (`src/components/home/FeaturedProductBanner.tsx`) renders a Gaussian splat of the Retro Roller with a small WebGL2 renderer of our own (`src/lib/splat/`, about 3 KB gzipped, loaded only when the banner nears the viewport). Copy, colourways and file paths live in `src/content/pages/home.json` under `featured`. Each colourway can set its own `motion`: `"spin"` turns all the way round, and `"sway"` rocks about ±35° and eases back after a drag.

## What's there now

| Colourway | Splat | Motion |
| --- | --- | --- |
| Grey | Real 360° capture (video, Nov 2026), ~112k splats, 1.8 MB | `spin` |
| Purple, Yellow | Placeholders inflated from the single front product photo | `sway` |

The placeholders have a real front, but their depth, rim and plain back are made up, which is why they only sway. Rebuild one with:

```bash
npm run splat:build -- --photo public/assets/products/retro-roller-purple.jpg --out public/assets/home/splats/retro-roller-purple.srsp
```

## Capturing a colourway (how the grey one was made)

No splat app is needed. Everything runs on a Mac with Xcode, using Apple's built-in Object Capture.

1. **Shoot a video.** Hang the cover on a dowel through its opening so it stays perfectly still. Walk a slow loop around it, 30–40 s at 1080p or better, taking in the front, both sides, the back, and a pass over the top and underside. Keep it in frame and in focus, and keep the lighting even. One video beats mixed photo sets, because photos at different exposures leave blotches.
2. **Pull sharp frames** (4 per second, then drop the blurriest quarter):

   ```bash
   mkdir -p capture/frames && ffmpeg -i capture.mp4 -vf fps=4 -q:v 2 capture/frames/f%04d.jpg
   ```

   Delete obviously blurred frames by eye, or keep them all. Object Capture copes with around 100–150 frames.
3. **Reconstruct a textured mesh** with Object Capture (takes about 1 minute on an M3 Pro):

   ```bash
   swiftc -O scripts/object-capture.swift -o /tmp/object-capture
   /tmp/object-capture capture/frames capture/mesh medium sequential
   ```

   It reconstructs the whole scene (counter, hands), not just the cover.
4. **Convert to splats, cropping to the cover:**

   ```bash
   npm run splat:build -- --obj capture/mesh --out public/assets/home/splats/retro-roller-grey.srsp \
     --max 1300000 --crop 0,0.1,0.1,0.2 --crop2 0,0.2,0.08,0.34 \
     --auto-orient --drop-stick --gain 1.14 --saturation 1.12
   ```

   - `--crop` / `--crop2` keep spheres (`x,y,z,radius`) in the scene's normalised units. The second applies inside the frame the first leaves. Every capture needs its own numbers: run once without `--crop`, find the cover in the views, then tighten. The grey numbers above won't fit a new video.
   - `--max` is the splat budget for the whole scene before cropping. The cover keeps roughly a tenth of it.
   - `--auto-orient` turns the thinnest axis toward the camera and uses the yellow screen to pick the front and the top.
   - `--drop-stick` removes the dowel. `--gain` / `--saturation` lift a dim video.
5. Set `"motion": "spin"` on that colourway in `home.json`.

A real 3DGS `.ply` (from Scaniverse, Polycam, Postshot or Brush) also works: `npm run splat:build -- --ply file.ply --out … --max 150000`, plus `--rotate-x/-y/-z` degrees to fix orientation.
