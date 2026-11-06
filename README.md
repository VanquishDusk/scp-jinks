# SCP: JINKS

A single-player, retro voxel **SCP Foundation facility simulation** that runs entirely in the
browser. It uses a low-resolution, dithered, PS2-era look with chunky voxel architecture, baked
lighting and pixel-art textures that are generated in code.

> **v0.2.0:** two playable classes (Class-D Personnel and Security Guard), a full objective and
> assignment system with Credits, NPC staff, randomized experiments and duties, and containment
> breaches that change your objectives mid-shift. The game is silent by design (no audio).

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
| Pause               | `Esc` / `P`                      | `Start`                    |
| Menus               | Arrows/WASD, `Enter`, `Esc`      | D-pad, `A`, `B`            |

Click the game view to capture the mouse. Pressing `Esc` releases it and pauses the game.

## Classes

There are exactly two playable classes. Facility staff (researchers, doctors, other guards)
appear as NPCs.

| Class             | Clearance | Starts in             | Shift                                                       |
|-------------------|-----------|-----------------------|-------------------------------------------------------------|
| Class-D Personnel | Level 0   | A random D-Block cell | Report for testing, follow the scientist's instructions, survive the experiment, then escape when containment fails |
| Security Guard    | Level 3   | Security Office       | Patrol, inspect checkpoint logs, escort personnel, handle facility jobs, then respond to the breach, evacuate staff and restore security systems |

## Objectives, assignments and Credits

Work arrives the way it would on site: over the intercom, on the security radio, or from the
person standing in front of you. Each **assignment** has a sequence of **objectives**, and every
objective completes only through gameplay. You reach places, hold E at terminals, pick things up,
follow or escort NPCs, and survive hazards. Nothing completes by clicking a popup.

- **Objective tracker** (top right) shows the current assignment, who gave it, the completed and
  current objectives, progress such as `2/4` or seconds remaining, checklists and optional side
  objectives.
- **Objective marker:** a diamond with the distance to the target. You can turn it off in Settings.
  Search objectives, such as a dropped keycard, only show the marker when you are close.
- **Notifications** slide in under the tracker for new assignments, completed objectives,
  failures and Credit rewards.
- **Credits** are paid for every objective, plus a completion bonus for each assignment. You can
  also earn bonuses, for example for a flawless test or for exploring restricted areas. Failing an
  escort costs Credits. Your Credit total is saved in the browser and shown on the title screen.

### Class-D shift

1. The intercom calls your designation for testing. Stand by at your cell door.
2. A guard escorts you through the facility, opening each door on the route. Follow them to the
   testing area.
3. One randomized experiment, run by a scientist over the intercom:
   - **Field Endurance** (Test Chamber 01): survive 30 s on a floor of panels that warn in amber,
     then activate in red. You get a bonus if you take no damage.
   - **Object Retrieval** (Test Chamber 01): carry the anomalous object to the containment
     receptacle while the floor is active.
   - **Sequence Response** (Laboratory A): touch the glowing specimens in the announced order. A
     wrong touch gives you a discharge and resets the sequence. Then hold position in the shielded
     area through the resonance pulses.
4. While you are being walked back, a **containment breach** suspends the assignment. Doors up to
   Level 2 fail open, and your new emergency objectives are to find a dropped Level 2 keycard (its
   location is randomized), reach the maintenance access in Storage and climb to the surface. An
   optional side objective pays you for exploring areas that the emergency has opened.

### Security Guard shift

1. Chief Mercer tells you to log in at the duty terminal.
2. **Patrol route** (randomized): four random patrol points, plus two randomly chosen checkpoint
   log terminals to verify.
3. Two random facility jobs, issued over the radio:
   - **VIP Escort:** a researcher with a random origin and destination follows you there.
   - **Document Delivery:** collect a report from a random office and hand it to a specific person.
   - **Reader Fault:** reset a random door's malfunctioning reader, then test the door.
4. A **containment breach** in Heavy Containment or Test Chamber 01 (random) interrupts the
   shift. You re-engage two randomly chosen containment locks while anomalies roam the area. Then,
   in random order, you escort sheltering researchers to the evacuation elevator and reboot the
   security grid in the Server Room.

### Health and danger

Anomalies and test hazards deal damage, and so do wrong moves in experiments. Health recovers
slowly on its own, and wall-mounted **first aid stations** heal you. If you are killed, the shift
ends with a *Terminated* summary. Escaped NPCs board the evacuation elevator. NPCs can also be
killed, and if a person you are escorting dies, that objective fails.

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
    objectives.js          Steps (reach, use, pick up, patrol, escort, follow, timed…), assignments,
                           ObjectiveManager (tracker data, notifications, Credits)
    directors/
      Director.js          Game-time scripting base (waits, dialogue, abortable scripts, ambient NPCs)
      ClassDDirector.js    Class-D shift script and the three experiments
      SecurityDirector.js  Security Guard shift script, randomized jobs and breach response
    Events.js              Containment breach: door release, anomalies, alarms, recovery
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

### Adding objectives

Directors write each shift as a script that runs on game time:

```js
await this.say('Chief Mercer', 'Check the HCZ log, officer.', 'radio');
await this.assign(new Assignment({
  title: 'Spot Check', giver: 'Chief Mercer', bonus: 50,
  steps: [
    new ReachStep({ text: 'Go to the HCZ Checkpoint', zone: 'HEAVY CONTAINMENT ZONE — ENTRANCE', reward: 20 }),
    new ActionStep({ text: 'Verify the checkpoint log', object: g.terminals.get('log-hcz'),
                     action: { text: 'Verify log', hold: 2 }, reward: 40 }),
  ],
}), gen);
```

Gameplay locations, terminals and first aid stations are defined in
`js/world/facilityLayout.js`. To start a facility event from a script, call
`director.breach('hcz' | 'research')`. The current assignment is suspended and the director
switches to its emergency script.

### Debug helpers

When you open the game with `?debug`, the browser console gets these helpers:

- `__debug()`: the current game state.
- `__tp(x, z, yawDeg)`: teleport, in voxel units.
- `__breach('hcz' | 'research')`: trigger a breach.
- `__objective()`: the tracker data.
- `__speed(n)`: fast-forward the simulation.

## Credits & licensing

- Based on the **SCP Foundation** (<https://scp-wiki.wikidot.com>), licensed under
  [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/). The SCP emblem is used under
  the same license. Content derived from the SCP Foundation should be shared under CC BY-SA 3.0.
- [three.js](https://threejs.org) r160, MIT License (see `vendor/three/LICENSE`).
