// SCP-500 and SCP-999 (the original Safe-class pair).

import { ScpBase } from './ScpBase.js';

/** SCP-500: a jar of red pills on a pedestal. */
export class Scp500 extends ScpBase {
  constructor(game, chamber) {
    super(game, chamber, '500');
    this.addModel([
      [-5, 0, -5, 5, 14, 5, 0x8a9098],
      [-6, 14, -6, 6, 15, 6, 0x5a5e66],
      [-2.5, 15, -2.5, 2.5, 21, 2.5, 0xc8d8e0],
      [-2.7, 21, -2.7, 2.7, 22.5, 2.7, 0xe8e8e8],
      [-1.5, 15.5, -2.6, -0.5, 16.5, -2.5, 0xd02020, true],
      [0.5, 16.5, -2.6, 1.5, 17.5, -2.5, 0xd02020, true],
      [-0.5, 18, -2.6, 0.5, 19, -2.5, 0xd02020, true],
    ]);
    this.returnToChamber();
  }

  install() {
    this.collider = this.game.addCollider([this.pos.x - 0.38, 0.5, this.pos.z - 0.38, this.pos.x + 0.38, 1.9, this.pos.z + 0.38]);
  }

  uninstall() {
    if (this.collider) this.game.removeCollider(this.collider);
  }
}

/** SCP-999: a friendly orange blob that bounces around and heals people. */
export class Scp999 extends ScpBase {
  constructor(game, chamber) {
    super(game, chamber, '999');
    const O = 0xe8862a;
    const L = 0xf5a84a;
    this.body = this.addModel([
      [-6, 0, -5, 6, 5, 5, O],
      [-5, 5, -4.5, 5, 9, 4.5, O],
      [-3.5, 9, -3.5, 3.5, 11, 3.5, L],
      [-3, 6, -4.7, -1.5, 8, -4.5, 0x2a1a10],
      [1.5, 6, -4.7, 3, 8, -4.5, 0x2a1a10],
      [-2, 3.5, -4.7, 2, 4.5, -4.5, 0x8a3a1a],
    ]);
    this.size = [0.4, 0.7];
    this.lightBoost = 1.15;
    this.returnToChamber();
  }

  update(dt) {
    const g = this.game;
    this.t += dt;
    this.body.position.y = Math.abs(Math.sin(this.t * 3)) * 0.12;
    this.body.scale.set(1 + Math.sin(this.t * 6) * 0.05, 1 - Math.sin(this.t * 6) * 0.05, 1);
    let chasing = false;
    if (!this.contained && !g.player.dead) {
      // Loose: drawn to people, hugs and heals them.
      const d = Math.hypot(g.player.pos.x - this.pos.x, g.player.pos.z - this.pos.z);
      if (d < 7 && d > 0.9 && g.nav.lineWalkable(this.pos.x, this.pos.z, g.player.pos.x, g.player.pos.z)) {
        chasing = true;
        this.moveToward(dt, g.player.pos.x, g.player.pos.z, 1.3, { repath: 1 });
      }
      if (d < 1.1) {
        if (g.player.hp < g.player.maxHp) g.player.heal(12 * dt);
        if (!this.hugged) {
          this.hugged = true;
          g.ui.toast('SCP-999 HUGS YOU. YOU FEEL WONDERFUL.', false);
        }
      } else if (d > 3) this.hugged = false;
    }
    if (!chasing) this.wander(dt, 1.1, { radius: 10, pause: 2 + Math.random() * 3 });
    this.place();
  }
}
