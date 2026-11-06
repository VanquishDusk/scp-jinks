# SCP: JINKS

A single-player, retro voxel **SCP Foundation facility simulation** that runs entirely in the
browser. It uses a low-resolution, dithered, PS2-era look with chunky voxel architecture, baked
lighting and pixel-art textures that are generated in code.

> **Foundation build (v0.1.0):** main menu, role selection, a connected facility to explore,
> first-person movement, interactive doors with clearance levels, and a pause menu.
> Teams, weapons, money, SCPs and random events are planned for later updates.
> The game is silent by design (no audio).

## Play

### On GitHub Pages

1. Push this repository to GitHub.
2. Go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to *Deploy from a branch*, then choose your
   branch (for example `main`) and the **`/ (root)`** folder. Save.
4. After a minute the game is live at `https://<your-user>.github.io/scp-jinks/`.

There is no build step. Every path is relative, Three.js is vendored in `vendor/`, and the
`.nojekyll` file tells Pages to serve the files as they are.

### Locally

Browsers block JavaScript modules on `file://`, so serve the folder over HTTP rather than
double-clicking `index.html`:

```bash
# from the repository root, with any one of these:
python3 -m http.server 8000
npx serve .
php -S localhost:8000
```

Then open <http://localhost:8000>.

To get the debug helpers in the browser console (`__debug()` reports the game state,
`__tp(x, z, yawDeg)` teleports in voxel units), open <http://localhost:8000/?debug>.

**Requirements:** a recent desktop browser with WebGL, ES modules and import maps
(Chrome/Edge 89+, Firefox 108+, Safari 16.4+).

## Controls

| Action           | Keyboard & mouse             | Gamepad (standard mapping) |
|------------------|------------------------------|----------------------------|
| Move             | `W` `A` `S` `D`              | Left stick                 |
| Look             | Mouse, or the arrow keys     | Right stick                |
| Sprint           | `Shift`                      | `LB` / `L3`                |
| Crouch           | `C` (hold or toggle in settings) | `B`                    |
| Jump             | `Space`                      | `A`                        |
| Use doors        | `E`, `F` or left click       | `X` / `RB`                 |
| Pause            | `Esc` / `P`                  | `Start`                    |
| Menus            | Arrows/WASD, `Enter`, `Esc`  | D-pad, `A`, `B`            |

Click the game view to capture the mouse. Pressing `Esc` releases it and pauses the game.

## Roles

| Role               | Clearance | Starts in                 | Access                                   |
|--------------------|-----------|---------------------------|------------------------------------------|
| Class-D Personnel  | Level 0   | A random D-Block cell     | D-Block cells, commons and washroom only |
| Security Guard     | Level 3   | Security Office           | Most of the facility                     |
| Facility Personnel | Level 2   | Administration Lobby      | Research wing, offices, medical, common areas |

Doors show their required clearance on the keycard reader LED and in the interaction prompt.
The Heavy Containment gate needs Level 4, so it stays sealed for now, and the lobby elevators
are offline.

## The facility

The map is roughly 90 × 64 m and has these areas: the D-Class Containment Block (8 cells,
commons, washroom), Security Checkpoint Alpha with its guard booth, the Security Office, the
west/east/north/south corridors around the Central Junction, the Cafeteria and Kitchen, Storage,
the Heavy Containment Zone entrance, the Research Wing (Laboratory A, the Observation Room,
Test Chamber 01, the Server Room, the Archive, the Records and Research offices), the Medical
Bay, and the Administration Lobby with its offices and staff break room.

## Project structure

```
index.html                 Page shell: canvas, HUD, menus, import map
css/style.css              Retro terminal UI styling
vendor/three/              Three.js r160 (MIT), vendored for offline/Pages use
js/
  main.js                  Boot + state machine (loading → menu → briefing → playing ⇄ paused)
  config.js                Constants, roles, clearance levels
  settings.js              Persistent settings (localStorage)
  engine/
    RetroRenderer.js       Low-res render target + dithering / color-depth post pass
    Input.js               Keyboard, mouse (pointer lock) and gamepad input
  game/
    Game.js                Builds the world, runs player/doors/interaction/zones, menu flythrough
  player/
    Player.js              First-person movement, AABB collision, step-up, crouch, stamina, head bob
  ui/
    UI.js                  Menus (keyboard/mouse/gamepad navigation), briefing, HUD
  world/
    facilityLayout.js      The facility map: rooms, doors, lights, props, signs, spawns
    FacilityBuilder.js     Authoring API used by the layout (carve rooms, cut doors, place lights…)
    VoxelWorld.js          Voxel grid, room painting, baked lighting, chunk meshing, queries
    blocks.js              Block types and room paint styles
    textures.js            Procedural 16×16 pixel-art texture atlas
    Door.js                Sliding / split / vertical doors, keycard readers, clearance checks
    doorTextures.js        Pixel-art door and reader textures
    props.js               Micro-voxel furniture models, merged into one pre-lit mesh
    signs.js               Pixel-font wall signs and the Foundation emblem panel
    pixelFont.js           5×7 bitmap font
```

### How it works

- **World:** the facility is a 180 × 16 × 128 voxel grid (0.5 m voxels). It starts solid, and
  rooms are carved out of it. Each exposed face is textured according to its room's style (floor,
  ceiling, baseboard, stripe, upper wall).
- **Lighting** is baked once at load time. Each light casts voxel-traced shadows, and a diffusion
  pass adds soft bounce light. Faces get per-vertex smooth lighting and ambient occlusion. Doors,
  props and signs sample the same light field, so they match the rooms around them.
- **Retro look:** the scene renders to a small target (240p–720p, 360p by default). A post pass
  then reduces the color depth with 4×4 ordered dithering and adds a vignette, and CSS upscales the
  result with nearest-neighbour filtering. Fog and optional CRT scanlines finish the effect.
- **Extending:** add rooms, doors, lights and props in `js/world/facilityLayout.js`. Coordinates
  are in voxels, and the comments at the top of that file explain the conventions.

## Credits & licensing

- Based on the **SCP Foundation** (<https://scp-wiki.wikidot.com>), licensed under
  [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/). The SCP emblem is used under
  the same license. Content derived from the SCP Foundation should be shared under CC BY-SA 3.0.
- [three.js](https://threejs.org) r160, MIT License (see `vendor/three/LICENSE`).
