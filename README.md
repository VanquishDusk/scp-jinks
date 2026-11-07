# SCP: JINKS

A single-player, retro voxel **SCP Foundation facility simulation** that runs entirely in the
browser. It uses a low-resolution, dithered, PS2-era look with chunky voxel architecture, baked
lighting and pixel-art textures that are generated in code.

> **v0.8.0 — a living facility:** about forty people now live and work on site, every shift,
> with their own routines, habits, friendships and grudges. Researchers run their own tests,
> guards nap on post, custodians mop and gossip, Class-D play cards in the commons, and you can
> **talk to anyone** and get caught up in their problems.
>
> A replayable shift sandbox with two playable classes (Class-D Personnel and Security Guard),
> plus an **SCP tycoon layer** with **18 SCPs** (Safe, Euclid and Keter), each in its own
> purpose-built containment room. Buy SCPs, earn research grants, and survive the breaches.
> **Combat** adds melee and ranged weapons, and the guards know how to contain SCPs as a team.
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
| Interact            | `E` / `F`                        | `X`                        |
| Attack / fire       | Left click                       | `RT`                       |
| Reload              | `R`                              | `RB`                       |
| Switch weapon       | `1`–`4`, mouse wheel             | D-pad left/right           |
| Terminals & repairs | Hold `E`                         | Hold `X`                   |
| Switch pager task   | `Tab`                            | `Y`                        |
| Blink (hold = shut) | `Q`                              | `LT`                       |
| Pause               | `Esc` / `P`                      | `Start`                    |
| Menus               | Arrows/WASD, `Enter`, `Esc`      | D-pad, `A`, `B`            |
| Talk to someone     | `E` / `F` while looking at them  | `X`                        |
| Pick an answer      | `1`–`9`, or arrows + `Enter`     | D-pad + `A`                |
| Leave a conversation| `Esc`                            | `B`                        |

Click the game view to capture the mouse. Pressing `Esc` releases it and pauses the game.

**Phones and tablets** get on-screen controls automatically (they never appear on a computer with
a mouse). Drag on the left side of the screen to move (push the stick all the way forward to
sprint) and on the right side to look. Buttons: **FIRE**, **USE** (interact and talk; it lights up
when there is something to use, hold it for hold actions), **JUMP**, **DUCK** (toggle), **RLD**,
**BLINK** (hold), **WPN** (next weapon), **TASK** (switch pager task) and **II** (pause). Menus and
conversations are tapped directly; tap outside a conversation to leave it. Landscape works best.

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
- **Guards:** checkpoint guards and two roving patrols. If they see you somewhere you are not
  authorized, they chase you. Break line of sight or get back inside your authorized area to
  shake them off. If they catch you, the run is over. Not every guard is the same, though, and
  neither is everyone else: some staff will call security on you, some will pretend they never
  saw you.
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

## The people of Site-██

The site has a permanent staff of about forty: researchers, a psychologist, doctors and a nurse,
the Site Director and the office staff, custodians, technicians, a cook, the Head of Security and
the officers, and the Class-D in the cells (the Class-D player gets a cell of their own). They are
the **same people every shift**. They keep their names, their jobs, how they feel about each
other and how they feel about **you**, and the site remembers who died, who escaped and who was
walked out. When someone is gone for good, a new hire fills the position the next shift.

**Nobody's personality is ever shown to you.** You find out who people are by watching what they
do and listening to what they say:

- Everyone has a routine on the 06:00–14:00 clock. They work at their own desk, lab bench,
  server rack, kitchen or post, queue for coffee in the morning, eat lunch in the cafeteria or the
  break room, take naps on the couches, sneak cigarettes in quiet corners, wander over to the
  observation windows, chat with friends (and argue with people they can't stand). The Class-D
  sleep, do push-ups, play cards, eat and pace. Custodians mop. Technicians kneel at the server
  racks and the HCZ generators. The Head of Security does rounds and catches people slacking.
- **Tests run without you.** Every few minutes a researcher books a test: a guard fetches a
  Class-D from their cell and walks them across the site to Laboratory A, the test chamber or one
  of the SCPs you own (SCP-914, 330, 207, 999, 294, 173), or the researcher interviews SCP-049,
  SCP-079 or checks on SCP-529. The PA announces each one. Anyone can stand at the gallery and
  watch; guards get a small stipend for it. Tests don't always go well, and how a test goes
  depends on who is running it, who is guarding and who is being tested.
- **Emergencies** send people running for safe rooms. Some hide under desks, some keep working,
  some go and look. Evacuated staff come back once it's over, and someone always comes to cover
  the bodies.
- People notice what you do in front of them, and **word gets around** among their friends.

### Talking

Look at anyone and press `E` to talk. The world keeps running while you talk; you just stand
still. What people say, what they will do for you and what they ask of you depends on who they
are, who you are (Class-D or Security) and your history with them. You can ask how they are,
ask for rumours (useful ones, sometimes), and react to what you hear.

Some people have something on their mind. Hear them out and you may end up in a **personal
plot**, shown on the pager as **PERSONAL**: errands and favors, things that get you paid, things
that get you in trouble, ways out of D-Block, and offers you should maybe have refused. Not
everyone who asks for help is being honest with you. Plots never cost you Standing just for
ignoring them, but what you do in them has consequences.

Class-D can try to bribe a guard (credits come from your orders), ask staff for help, or deal
with the other inmates. Guards can take side jobs from colleagues, ask the Class-D what they've
heard, and report what they know to the Head of Security.

Your designation (`D-####` or `SEC-####`) carries over between shifts, so people remember you,
until you die, escape, get caught or get dismissed. Then the next shift you are somebody new.

## SCPs (tycoon layer)

The site owns a persistent **containment roster** that both classes share. It is saved in your
browser along with your Credits. There are **18 SCPs** across three object classes, and **every
SCP has its own purpose-built containment room**: a steel cube for SCP-096, an acid tank for
SCP-682, a cell suspended on pillars for SCP-106, a playroom for SCP-999, a machine hall for
SCP-914, and so on. Rooms for SCPs the site does not own yet are **sealed construction sites**
(scaffolding, tarps, cement, a locked door). Buying an SCP commissions its room: the
construction gear is cleared, the furniture goes in, the door unseals and the SCP is delivered.

The facility is about **three times larger** than before:

- **Heavy Containment Wing** (Euclid), past the HCZ Checkpoint: SCP-173, 049, 012, 079, 151 and
  096, plus a security post, MTF staging, decontamination, Euclid records and a generator room.
- **Keter Sector**, through a **Level 4** door at the end of the wing: SCP-682, 106 and 939, an
  observation room and a security post. A spine corridor runs south to Light Containment.
- **Light Containment Sector** (Safe), east of the Research Wing past the LCZ Checkpoint
  (Level 2): SCP-914, 999, 131, 529, 500, 330, 207, 005 and 294, plus a lounge, a lab and a
  security post.
- **The pocket dimension**: a place you do not want to see (SCP-106).

| SCP | Name | Class | Price | Grants | Breach risk | What it does |
|-----|------|-------|-------|--------|-------------|--------------|
| SCP-529 | Josie the Half-Cat | Safe | 450 CR | 6/min | never | Pet her: some health and full stamina |
| SCP-500 | Panacea | Safe | 600 CR | 10/min | never | Security: one full-heal pill per shift from its terminal |
| SCP-330 | Take Only Two | Safe | 800 CR | 12/min | never | Two sweets heal you. A third costs you your hands (no weapons for the rest of the shift) |
| SCP-207 | Cola Bottles | Safe | 900 CR | 14/min | never | 75 s of 40% more speed and unlimited stamina. Drinking another while it works hurts your heart |
| SCP-131 | The Eye Pods | Safe | 1000 CR | 15/min | never | They follow you if you ask. Their eyes never close, so **SCP-173 cannot move while they see it** |
| SCP-999 | The Tickle Monster | Safe | 1400 CR | 24/min | low | Loose, it wanders the halls and heals anyone it hugs |
| SCP-005 | Skeleton Key | Safe | 2000 CR | 28/min | never | Borrow it once per shift: two minutes of opening any door |
| SCP-914 | The Clockworks | Safe | 2600 CR | 36/min | never | Refine keycards and weapons (see below) |
| SCP-294 | The Coffee Machine | Euclid | 1800 CR | 30/min | never | A random drink every 30 s: mostly healing, sometimes acid |
| SCP-151 | The Painting | Euclid | 2200 CR | 38/min | never | Kept under a cloth. Looking at it starts drowning you; first aid stops it. When integrity is low, the cloth slips |
| SCP-079 | Old AI | Euclid | 3000 CR | 55/min | moderate | Breach: slams and locks doors around you, flickers the lights, taunts you |
| SCP-012 | A Bad Composition | Euclid | 3200 CR | 60/min | moderate | Breach: looking at it pulls you in to finish it in your own blood. **Close your eyes (`Q`)** to break free |
| SCP-173 | The Sculpture | Euclid | 3500 CR | 75/min | high | See below |
| SCP-049 | The Plague Doctor | Euclid | 4800 CR | 95/min | high | Breach: its touch kills, and its victims rise as **SCP-049-2**. Bullets only stagger it |
| SCP-096 | The Shy Guy | Euclid | 6500 CR | 130/min | high | See below |
| SCP-939 | With Many Voices | Keter | 8000 CR | 160/min | very high | Two blind predators that **hunt by sound** and imitate the voices of the dead |
| SCP-106 | The Old Man | Keter | 10000 CR | 200/min | very high | Walks through walls. Its prey is dragged into the **pocket dimension** |
| SCP-682 | Hard-to-Destroy Reptile | Keter | 14000 CR | 260/min | extreme | Rampages, tears doors apart, regenerates. Can only be knocked down |

- **Earning:** task rewards pay 1.5× their base value (failure penalties are 0.75×). Ending a
  shift well pays a bonus of 100 CR + 2 CR per point of Standing: **shift pay** for Security,
  a **survival stipend** for Class-D back in their cell at lights out.
- **Buying:**
  - **Security** buys from the **Procurement terminal** on the south wall of the Security Office.
  - **Class-D** use the **jury-rigged black-market terminal** in the D-Block washroom, which
    charges a 15% markup. If a guard sees you on it, you are busted: you lose Compliance and the
    guard chases you. The world keeps running while the menu is open.
- **Delivery:** the transport arrives partway through the shift. Until then the room's door reads
  *IN TRANSIT — ROOM BEING FITTED*.
- **Money vs risk:** contained SCPs pay Security research grants every minute. SCPs that need
  maintenance lose containment integrity over time, and dangerous ones lose it faster. Low
  integrity raises the chance of a breach event, and at zero an SCP that can breach does. Security
  gets *containment check* jobs to restore integrity. Class-D buy SCPs for the opposite reason:
  more breaches mean more chances to escape.
- **Keter emergencies** grant Security temporary Level 4 access to the Keter Sector.

### How each breach is recontained

| SCP | Recontainment |
|-----|---------------|
| SCP-173 | Keep it in sight, take turns blinking, cage it (hold `E`, 3 s) |
| SCP-096 | Wait until it sits down, bag it **from behind** (hold `E`, 4 s) |
| SCP-049 | Shoot it to stagger it, then escort it back (hold `E`, 3 s, while it is staggered). Put down the 049-2 |
| SCP-012 | Walk up with your eyes shut (hold `Q`) and close the case (hold `E`, 3 s) |
| SCP-079 | Cut it off at three **network terminals**: Server Room, HCZ Security Post, LCZ Security Post |
| SCP-106 | Run the **Recall Protocol** at the terminal outside its chamber (needs main power) |
| SCP-939 | Move quietly: crouch or walk, never sprint. Gunfire draws them. Put both down |
| SCP-682 | Concentrate fire until it collapses, then restrain it (hold `E`, 5 s) within 45 seconds |
| SCP-999 | Pick it up |

The guards know every procedure too (see *How the guards fight and contain* below).

### SCP-914

Stand at the control panel: the **dial** cycles ROUGH → COARSE → 1:1 → FINE → VERY FINE, and
the **key** starts the machine. Put your **keycard** (or the weapon in your hand, if you have no
card) in the **intake booth** on the left. After a few seconds of grinding gears, the result
waits in the **output booth** on the right.

- Keycards: ROUGH destroys it, COARSE lowers the level, 1:1 copies it, FINE raises it one level,
  VERY FINE raises it two levels, but often turns it to dust.
- Weapons: a pipe can become a baton, a baton a sidearm, a sidearm a rifle. On FINE or VERY FINE
  it comes out fully loaded.

### SCP-106 and the pocket dimension

It rises out of the floor near someone, walks straight at them through walls and doors at a slow
walk, and leaves black corrosion behind. Gunfire slows it. If it touches you, you fall into the
**pocket dimension**: a rotting room with four passages. Only one leads back. Each passage ends in
a faint shape, and the one that leads out flickers differently. Your health drains while you are
there.

### SCP-939

Both instances are blind. They hear you **sprinting** from 17 m, walking from 8 m, crouching
from 2 m, and **gunfire** from over 30 m. Officers moving and shooting attract them too. While
they are loose, you may hear voices on the radio from people you know are already dead. Don't
answer them.

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
- **When it breaches:** a watch group of guards keeps it in sight and cages it. Security can do it
  first: keep your eyes on it and hold `E` for three seconds. SCP-131 never blinks, so bringing
  the eye pods along helps a lot.
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
- **SCP-012:** the same eyes-down discipline; one officer walks up blind and closes the case.
- **SCP-049:** officers shoot to stagger it, never letting it touch them; while it reels, one of
  them takes it by the arm and walks it home. They put down any SCP-049-2 on sight.
- **SCP-079:** an officer cuts the three network segments (after giving a Security player about
  90 seconds to do it).
- **SCP-106:** officers shoot to slow it while one runs to the recall terminal.
- **SCP-682 / SCP-939:** concentrated fire. Once 682 collapses, an officer restrains it; once
  both 939 are down, they are dragged back to their pen.
- **SCP-999 / SCP-131:** an officer walks up and carries it home.
- **Riots:** after a short delay to gear up, officers move in with batons.
- **MTF Epsilon-11:** about 40 seconds into a breach (or a loose 173, 096, 049, 012, 939, 106 or
  682), a three-man squad with rifles and armour arrives at the lobby elevator.

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
    life/
      Life.js              The life simulation: needs, routines at activity spots, NPC chats,
                           greetings, reactions to the player, emergencies, deaths and clean-up
      roster.js            The ~40 positions on site and the persistent people who fill them
                           (hidden traits, personal situations, relationships, memorial)
      traits.js            Trait generation, how traits shape speech, name pools
      spots.js             Activity spots derived from the furniture (desks, beds, benches...)
      lines.js             Everything people say to each other and to you
      experiments.js       Staff-run tests with Class-D subjects, visible to every class
      talk.js              Conversations with the player and the personal plots
    combat/
      weapons.js           Weapon stats and voxel models
      Combat.js            Player weapons, hitscan/melee, NPC fire, tracers/blood/bullet holes
      Viewmodel.js         First-person hands and weapons (overlay pass)
    NPC.js                 Voxel humanoids: walk, open (and close) doors, wander, lead, follow,
                           poses (sit, eat, type, sleep, smoke, kneel, cower...), held items,
                           speech bubbles, board, die
    NavGrid.js             Walkability grid, A* pathfinding and path smoothing
    Interactables.js       Terminals, pickups, first aid stations, specimen stands, triggers
    Hazards.js             Test chamber floor field and roaming anomalies
    Profile.js             Saved Credits, shift statistics, the SCP roster, the staff roster and
                           the player's designation
    scp/
      catalog.js           SCP prices, research grants, integrity decay, breach risk (18 SCPs)
      ScpManager.js        Roster, rooms (construction → commissioned), deliveries, income,
                           integrity, observation rules, breach / recontainment
      ScpBase.js           Shared SCP entity plumbing: movement, chamber helpers, recon spec
      Scp173.js            SCP-173 model and behavior
      Scp096.js            SCP-096 model, poses and rage behavior
      SimpleScps.js        SCP-500 and SCP-999
      SafeScps.js          SCP-529, 330, 207, 131, 005, 914
      EuclidScps.js        SCP-294, 151, 079, 012, 049 (+049-2)
      KeterScps.js         SCP-939, 106 (+ pocket dimension), 682
      voxelModel.js        Box-model geometry helper
  player/
    Player.js              Movement, collision, step-up, crouch, stamina, health, head bob
  ui/
    UI.js                  Menus, briefing, HUD, tracker, notifications, radio, result screen
  world/
    facilityLayout.js      The facility map plus gameplay points, terminals and first aid
    containmentLayout.js   HCZ Wing, Keter Sector, Light Containment Sector, pocket dimension:
                           one purpose-built room per SCP
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
- `__event('scp', id)`: breach a specific SCP (for example `'682'`).
- `__speed(n)`: fast-forward the simulation.
- `__game.life`: the life simulation (`people`, `experiments`, `talk`).

## Credits & licensing

- Based on the **SCP Foundation** (<https://scp-wiki.wikidot.com>), licensed under
  [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/). The SCP emblem is used under
  the same license. Content derived from the SCP Foundation should be shared under CC BY-SA 3.0.
- The SCPs in this game are adapted (loosely, for gameplay) from these SCP Wiki articles. The
  authors of each are credited on the article pages: SCP-005, SCP-012, SCP-049, SCP-079,
  SCP-096, SCP-106, SCP-131, SCP-151, SCP-173, SCP-207, SCP-294, SCP-330, SCP-500, SCP-529,
  SCP-682, SCP-914, SCP-939 and SCP-999
  (`https://scp-wiki.wikidot.com/scp-XXX`). All models, rooms and behaviour in the game are
  original voxel work. No images from the wiki are used.
- [three.js](https://threejs.org) r160, MIT License (see `vendor/three/LICENSE`).
