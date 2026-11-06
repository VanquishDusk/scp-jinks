# SCP: JINKS

A single-player, retro voxel **SCP Foundation facility simulation** that runs entirely in the
browser. It uses a low-resolution, dithered, PS2-era look with chunky voxel architecture, baked
lighting and pixel-art textures that are generated in code.

> **v0.3.0:** a replayable shift sandbox with two playable classes (Class-D Personnel and
> Security Guard). Randomized concurrent tasks with deadlines, random facility events, guards
> that hunt down Class-D who are out of bounds, Standing, Credits, and many ways to fail.
> The game is silent by design (no audio).

## Play

### On GitHub Pages

1. Push this repository to GitHub.
2. Go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to *Deploy from a branch*, then choose your
   branch and the **`/ (root)`** folder. Save.
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

**Requirements:** a recent desktop browser with WebGL, ES modules and import maps
(Chrome/Edge 89+, Firefox 108+, Safari 16.4+).

## Controls

| Action              | Keyboard & mouse                 | Gamepad (standard mapping) |
|---------------------|----------------------------------|----------------------------|
| Move                | `W` `A` `S` `D`                  | Left stick                 |
| Look                | Mouse, or the arrow keys         | Right stick                |
| Sprint              | `Shift`                          | `LB` / `L3`                |
| Crouch              | `C` (hold or toggle in settings) | `B`                        |
| Jump                | `Space`                          | `A`                        |
| Interact            | `E`, `F` or left click           | `X` / `RB`                 |
| Terminals & repairs | Hold `E`                         | Hold `X`                   |
| Switch pager task   | `Tab`                            | `Y`                        |
| Pause               | `Esc` / `P`                      | `Start`                    |
| Menus               | Arrows/WASD, `Enter`, `Esc`      | D-pad, `A`, `B`            |

Click the game view to capture the mouse. Pressing `Esc` releases it and pauses the game.

## How a shift works

There is no story script. Every shift is a randomized sandbox on a 15-minute clock (06:00 to 14:00 site time):

- **Tasks arrive over time** from a weighted random pool, announced over the intercom or radio.
  Several can be open at once, and you choose the order. Most have deadlines, and the pager shows
  the countdowns. Press `Tab` (or `Y` on a gamepad) to switch which task the marker points to.
- **Facility events strike at random times:** a containment breach (from Heavy Containment or
  Test Chamber 01), a security grid failure, a power failure (heavy doors seal and the site goes
  dark), or a D-Block riot. Each event changes the facility and brings new tasks or
  opportunities. If nobody deals with it, the site's response teams eventually resolve it
  themselves.
- **Standing:** Compliance for Class-D, Performance for guards. It goes up when you finish tasks
  and down when you miss deadlines or fail. **At zero you lose:** a Class-D is hunted by every
  guard, and a guard is dismissed.
- **Credits** are paid for completed work and bonuses, and taken away for failures. Your total is
  saved in the browser.
- The shift ends when you **survive to the end** of the clock, **escape** (Class-D),
  **die**, are **detained** by guards, are **dismissed**, or are not in your cell at lights out.

Failure is easy: deadlines overlap, guards are fast, and anomalies, floor fields, discharges and
rioters all hurt you.

### Class-D Personnel (Level 0)

You start in a random cell. You may only be in D-Block (corridor, cells, commons, washroom).

- **Orders** (one at a time, chosen at random) authorize a route for a limited time:
  - **Testing:** a random experiment in Test Chamber 01 or Laboratory A. It is either a field
    endurance test, an object retrieval, or a specimen sequence test.
  - **Work details:** mop a spill (random location), or haul a crate from Storage (you can't sprint
    while carrying it).
  - **Headcount, meal time** and a **medical check**.
  - **Lights out** near the end of the shift.
- **Guards:** checkpoint guards and two roving patrols on routes that change every shift. If they
  see you somewhere you are not authorized, they chase you. Break line of sight or get back
  inside your authorized area to shake them off. If they catch you, the run is over.
- **Choices during events:** obey the lockdown order and sit it out in your cell, or take the
  **escape opportunity** while the security grid is down. To escape, find a Level 2 keycard, get
  through the maintenance access in Storage and climb to the surface. Once the grid comes back,
  that chance is gone. Some shifts, a careless staff member leaves a keycard lying around, and you
  might overhear where. A keycard you steal now carries over to the next emergency.

### Security Guard (Level 3)

Jobs fill your pager: two at a time early in the shift, then three. They are drawn at random
from this pool:

- patrol 2–3 random sectors
- verify a checkpoint log
- escort a researcher to a random destination
- hand-deliver a report
- reset a malfunctioning door reader, then test the door
- transfer a Class-D subject to testing

Events add emergencies on top of these. Handle them before the response teams have to, or the
emergency counts as failed:

- **Breach:** re-engage the containment locks while anomalies roam, evacuate the sheltering
  researchers, and reboot the grid.
- **Grid failure:** reboot the grid.
- **Power failure:** reset the main breaker in Storage, in the dark.
- **Riot:** order the rioters back to their cells. Get too close and they hit you.

Losing researchers on your watch costs Performance.

### Health

Health recovers slowly, and wall-mounted **first aid stations** heal you faster. The test
chamber floor, anomalies, specimen discharges, resonance pulses and rioters all deal damage.

## Project structure

```
index.html                 Page shell: canvas, HUD, menus, import map
css/style.css              Retro terminal UI styling
vendor/three/              Three.js r160 (MIT), vendored for offline/Pages use
js/
  main.js                  Boot + state machine (menu → briefing → playing ⇄ paused → result)
  config.js                Constants, the two playable classes, clearance levels
  settings.js              Persistent settings (localStorage)
  engine/
    RetroRenderer.js       Low-res render target, dithering post pass, alarm lighting tint
    Input.js               Keyboard, mouse (pointer lock) and gamepad input
  game/
    Game.js                Session: world, player, NPCs, doors, interactables, hazards, events
    objectives.js          Steps (reach, use, pick up, patrol, escort, timed…), Task, TaskManager
                           (concurrent tasks, deadlines, pager data, notifications, Credits)
    directors/
      Director.js          Shift sandbox: clock, Standing, weighted task pool, event scheduler, NPCs
      ClassDDirector.js    Class-D orders, experiments, guard detection/pursuit, escape opportunities
      SecurityDirector.js  Security job pool and emergency responses
    Events.js              Breach, grid failure, power failure, riot; auto-resolution and alarms
    NPC.js                 Voxel humanoids: walk, open doors, wander, lead, follow, board, die
    NavGrid.js             Walkability grid, A* pathfinding and path smoothing
    Interactables.js       Terminals, pickups, first aid stations, specimen stands, triggers
    Hazards.js             Test chamber floor field and roaming anomalies
    Profile.js             Saved Credits and shift statistics
  player/
    Player.js              Movement, collision, step-up, crouch, stamina, health, head bob
  ui/
    UI.js                  Menus, briefing, HUD, tracker, notifications, radio, result screen
  world/
    facilityLayout.js      The facility map plus gameplay points, terminals and first aid
    FacilityBuilder.js     Authoring API used by the layout
    VoxelWorld.js          Voxel grid, room painting, baked lighting, chunk meshing, queries
    Door.js                Doors, keycard readers, clearance, emergency release, seals, faults
    blocks.js, textures.js, doorTextures.js, props.js, signs.js, pixelFont.js
```

### Adding tasks and events

Each director has a `templates` pool:
`{ weight, cooldown, can(), make() → Task }`. A `Task` is a short chain of steps, all completed by
gameplay. Each task can have a `deadline`, a `reward`, a `penalty`, a `standing: [gain, loss]`
pair, and `grants` (zones and doors that a Class-D order temporarily authorizes):

```js
logCheck: { weight: 3, cooldown: 60, make: () => new Task({
  title: 'Verify the log at the HCZ Checkpoint', giver: 'Dispatch', deadline: 130,
  reward: 50, penalty: 20, standing: [5, 8],
  steps: [new ActionStep({ text: 'Verify the checkpoint log', object: g.terminals.get('log-hcz'),
                           action: { text: 'Verify log', hold: 2.5 } })],
}) },
```

Events live in `js/game/Events.js` (`start('breach' | 'grid' | 'power' | 'riot')`), and directors
react to them in `onFacilityEvent`.

### Debug helpers

When you open the game with `?debug`, the browser console gets these helpers:

- `__debug()`: the current game state.
- `__tp(x, z, yawDeg)`: teleport, in voxel units.
- `__event('breach' | 'grid' | 'power' | 'riot', origin?)`: trigger an event.
- `__clock(seconds)`: jump the shift clock.
- `__objective()`: the pager data.
- `__speed(n)`: fast-forward the simulation.

## Credits & licensing

- Based on the **SCP Foundation** (<https://scp-wiki.wikidot.com>), licensed under
  [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/). The SCP emblem is used under
  the same license. Content derived from the SCP Foundation should be shared under CC BY-SA 3.0.
- [three.js](https://threejs.org) r160, MIT License (see `vendor/three/LICENSE`).
