# SCP: JINKS

A single-player, retro voxel **SCP Foundation facility simulation** that runs entirely in the
browser. It uses a low-resolution, dithered, PS2-era look with chunky voxel architecture, baked
lighting and pixel-art textures that are generated in code.

> **v0.6.0:** a replayable shift sandbox with two playable classes (Class-D Personnel and
> Security Guard), plus an **SCP tycoon layer**. Buy SCPs, house them in the Heavy Containment
> Wing and earn research grants, at the risk of breaches. SCP-173 (line of sight and
> blinking) and SCP-096 (seeing its face, even on a camera feed or in a photo, means death)
> are in. **Combat** adds melee and ranged weapons, and the guards now know how to contain
> SCPs as a team. The game is silent by design (no audio).

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
| Interact            | `E` / `F`                        | `X`                        |
| Attack / fire       | Left click                       | `RT`                       |
| Reload              | `R`                              | `RB`                       |
| Switch weapon       | `1`–`4`, mouse wheel             | D-pad left/right           |
| Terminals & repairs | Hold `E`                         | Hold `X`                   |
| Switch pager task   | `Tab`                            | `Y`                        |
| Blink (hold = shut) | `Q`                              | `LT`                       |
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

## SCPs (tycoon layer)

The site owns a persistent **containment roster** that both classes share. It is saved in your
browser along with your Credits. The **Heavy Containment Wing** (east of the HCZ Checkpoint) has
six chambers.

| SCP     | Class  | Price   | Research grants | Breach risk | Notes |
|---------|--------|---------|-----------------|-------------|-------|
| SCP-500 | Safe   | 600 CR  | 10 CR/min       | none        | The chamber terminal dispenses one full-heal pill per shift |
| SCP-999 | Safe   | 1400 CR | 24 CR/min       | low         | Loose, it wanders the halls and heals anyone it hugs. The grid still fails open |
| SCP-173 | Euclid | 3500 CR | 75 CR/min       | very high   | Lethal. Containment integrity decays fast |
| SCP-096 | Euclid | 6500 CR | 130 CR/min      | extreme     | Lethal. Breaks out tearing doors apart. Hardest to recontain |

- **Earning:** task rewards pay 1.5× their base value (failure penalties are 0.75×). Ending a
  shift well pays a bonus of 100 CR + 2 CR per point of Standing: **shift pay** for Security,
  a **survival stipend** for Class-D back in their cell at lights out.
- **Buying:**
  - **Security** buys from the **Procurement terminal** on the south wall of the Security Office.
  - **Class-D** use the **jury-rigged black-market terminal** in the D-Block washroom, which
    charges a 15% markup. If a guard sees you on it, you are busted: you lose Compliance and the
    guard chases you. The world keeps running while the menu is open.
- **Delivery:** a bought SCP is transported into a free chamber partway through the shift.
- **Money vs risk:** contained SCPs pay Security research grants every minute. Each SCP's
  containment integrity decays, and dangerous ones decay faster. Low integrity raises the chance
  of a breach event, and at zero the SCP breaks out. Security gets *containment check* jobs to
  restore integrity. Class-D buy SCPs for the opposite reason: more breaches mean more chances to
  escape.

### SCP-173

- It **cannot move while anyone is looking at it**. That means you, while your eyes are open, it
  is in view, nothing blocks the line of sight and there is enough light, or any NPC facing it
  with their eyes open. Glass windows count as looking.
- The moment **nobody** is watching, it teleports behind anyone it can reach in a clear straight
  line and snaps their neck. Walls, glass and closed doors stop it, and it **cannot open doors**.
  Out of everyone's sight, it closes in fast through open doorways.
- **Blinking:** near SCP-173 a blink meter drains and you blink involuntarily when it runs out.
  Press `Q` to blink on your own terms, ideally while someone else is watching it. NPCs blink
  too. During a power failure it is too dark to see it unless it is right next to you.
- **When it breaches:** guards stop and stare it down, but they still blink. Security must find
  it and **cage it**: keep your eyes on it and hold `E` for three seconds. If you leave it, MTF
  eventually recontains it and the failure goes on your record.
- **Class-D order: clean SCP-173's chamber.** A containment officer watches the statue and calls
  out "Blinking!" before he blinks. When he does, *you* have to be looking at it. Scrub three
  marked spots, then back out.

### SCP-096

- It sits curled up in the corner of its chamber with its face hidden, and it does nothing until
  someone **sees its face**. That person can be you or any NPC. It counts if they see it
  directly, through a glass window, on the chamber terminal's **camera feed**, or in an
  **unmarked photograph** that sometimes turns up on a desk. The catalog shows no picture of it,
  for good reason.
- When that happens it screams for about 6 seconds, then **charges** at 7.4 m/s, faster than
  you can sprint. It paths around the facility, **tears doors out of their frames**, and kills
  anyone in its way. Anyone else who sees its face during the rampage is added to its list.
- With every target dead it **sits back down where it is**. If that is outside its chamber, it
  is now a breach.
- **Recontainment (Security):** wait until it is sitting, come up **from behind**, and hold `E`
  for four seconds to bag its head. If you see its face, you are dead. The marker leads you to
  the safe side.
- **Class-D order: SCP-096's meal tray.** Walk into its chamber, put the tray on the marker by
  the door with your eyes down, and back out. It faces the corner, so keep it that way.
- When a breach event picks SCP-096, a monitor glitch shows its face to someone on site, and it
  goes after them.

## Combat

Both classes can fight, but violence has consequences.

| Weapon     | Kind   | Who has it                                     | Notes                                       |
|------------|--------|------------------------------------------------|---------------------------------------------|
| Fists      | Melee  | Class-D                                        | Weak, short stun                            |
| Lead Pipe  | Melee  | Two lie somewhere in the facility every shift  | Heavy hits                                  |
| Baton      | Melee  | Security                                       | Two hits send a rioting Class-D to a cell   |
| Sidearm    | Ranged | Security (12 + 36 rounds), dropped by officers | Semi-automatic                              |
| Rifle      | Ranged | Dropped by MTF operatives                      | Automatic                                   |

- Walls, glass and closed doors stop bullets. Headshots deal extra damage.
- **Breach anomalies can be shot down.** SCP-173, SCP-096 and SCP-999 shrug off gunfire.
- Security restocks ammunition at the **armory lockers** in the Security Office (once every
  45 seconds).
- **Class-D:** hitting staff, or being seen with a gun drawn, makes you **hostile**. Officers
  stop trying to cuff you and shoot on sight. Picking up a gun is fine; drawing it is not.
- **Security:** shooting compliant Class-D or staff costs Performance. Kill a colleague, or keep
  hitting them, and you are a **rogue officer**: everyone opens fire. Lethal force on rioters is
  frowned upon; use the baton.

### How the guards fight and contain

Guards (and the MTF) run their own AI:

- **Anomalies:** they shoot from range, back off when one gets close and hold fire when a
  colleague is in the line of fire. When the anomalies are down, an officer re-engages the
  containment locks (Security players get roughly 100 seconds to do it first).
- **SCP-173:** a watch group walks in with their eyes on the statue, takes turns blinking with
  a "Blinking!" callout, and never blinks together. A lone officer keeps their eyes open as long
  as they can and calls for help. Once two people have it covered, one officer cages it.
- **SCP-096:** officers keep their eyes on the floor near it. Very rarely one glances up, and
  that can be fatal. Anyone in its charge path dives aside. Once it sits down, an officer bags it
  from behind.
- **SCP-999:** an officer walks up and carries it home.
- **Riots:** after a short delay to gear up, officers move in with batons.
- **MTF Epsilon-11:** about 40 seconds into a breach (or a loose SCP-173 or SCP-096), a
  three-man squad with rifles and armour arrives at the lobby elevator.

When the team finishes an emergency before you do, the task closes without a penalty. If you
were there helping, you get half the reward.

### Health

Health recovers slowly, and wall-mounted **first aid stations** heal you faster. The test
chamber floor, anomalies, specimen discharges, resonance pulses, rioters and gunfire all deal
damage.

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
    GuardAI.js             Officer/MTF combat and team containment (173 watch, 096 bag, riots)
    combat/
      weapons.js           Weapon stats and voxel models
      Combat.js            Player weapons, hitscan/melee, NPC fire, tracers/blood/bullet holes
      Viewmodel.js         First-person hands and weapons (overlay pass)
    NPC.js                 Voxel humanoids: walk, open doors, wander, lead, follow, board, die
    NavGrid.js             Walkability grid, A* pathfinding and path smoothing
    Interactables.js       Terminals, pickups, first aid stations, specimen stands, triggers
    Hazards.js             Test chamber floor field and roaming anomalies
    Profile.js             Saved Credits, shift statistics and the SCP roster
    scp/
      catalog.js           SCP prices, research grants, integrity decay, breach risk
      ScpManager.js        Roster, chambers, deliveries, income, integrity, observation rules
      Scp173.js            SCP-173 model and behavior
      Scp096.js            SCP-096 model, poses and rage behavior
      SimpleScps.js        SCP-500 and SCP-999
      voxelModel.js        Box-model geometry helper
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
- `__credits(n)`: add Credits.
- `__giveScp(id)`: install an SCP instantly.
- `__resetScps()`: clear the roster.
- `__event('scp', '173' | '096')`: breach a specific SCP.
- `__speed(n)`: fast-forward the simulation.

## Credits & licensing

- Based on the **SCP Foundation** (<https://scp-wiki.wikidot.com>), licensed under
  [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/). The SCP emblem is used under
  the same license. Content derived from the SCP Foundation should be shared under CC BY-SA 3.0.
- [three.js](https://threejs.org) r160, MIT License (see `vendor/three/LICENSE`).
