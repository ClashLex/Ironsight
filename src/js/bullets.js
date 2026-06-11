import { BULLET_SPEED, BULLET_LIFETIME, HIT_RADIUS, P1_COLOR, P2_COLOR } from './constants.js';

/* =========================================================================
   BulletManager
   - Tracks active bullets, updates their positions
   - Performs collision detection versus player aim targets
   - Triggers explosion particle bursts and sounds on hit
   ========================================================================= */

export class BulletManager {
  constructor(particles, audio, onHit) {
    this.bullets = [];
    this.particles = particles;
    this.audio = audio;
    this.onHit = onHit;
  }

  /**
   * Spawns a bullet from (sx, sy) heading toward target (tx, ty)
   * @param {string} owner - 'p1' or 'p2'
   * @param {number} sx - spawn x
   * @param {number} sy - spawn y
   * @param {number} tx - target x
   * @param {number} ty - target y
   */
  spawn(owner, sx, sy, tx, ty) {
    const dx = tx - sx;
    const dy = ty - sy;
    const distance = Math.sqrt(dx * dx + dy * dy) || 1;
    
    this.bullets.push({
      owner,
      x: sx,
      y: sy,
      px: sx,
      py: sy,
      vx: (dx / distance) * BULLET_SPEED,
      vy: (dy / distance) * BULLET_SPEED,
      life: BULLET_LIFETIME
    });
  }

  clear() {
    this.bullets.length = 0;
  }

  /**
   * Updates bullets, performs collision checks
   * @param {number} dt - delta time
   * @param {Object} players - gestureEngine or keyboard fallback player coordinates
   * @param {number} W - screen width
   * @param {number} H - screen height
   */
  update(dt, players, W, H) {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.px = b.x;
      b.py = b.y;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;

      // Cull bullet if off-screen
      if (b.x < -50 || b.x > W + 50 || b.y < -50 || b.y > H + 50) {
        this.bullets.splice(i, 1);
        continue;
      }

      // Check hits against opponent
      const targetKey = b.owner === 'p1' ? 'p2' : 'p1';
      const opponent = players[targetKey];

      // A player is valid if their hand is visible OR if they are active via keyboard fallback controls
      const isOpponentTargetable = opponent && (opponent.handsVisible || opponent.isActive);

      if (isOpponentTargetable) {
        const hx = b.x - opponent.aim.x;
        const hy = b.y - opponent.aim.y;
        if ((hx * hx + hy * hy) < HIT_RADIUS * HIT_RADIUS) {
          const particleColor = targetKey === 'p1' ? P1_COLOR : P2_COLOR;
          
          // Trigger particles, hit audio, damage callback
          this.particles.burst(opponent.aim.x, opponent.aim.y, particleColor);
          this.audio.hit();
          this.onHit(targetKey);
          
          this.bullets.splice(i, 1);
          continue;
        }
      }

      // Time-to-live expiration
      if (b.life <= 0) {
        this.bullets.splice(i, 1);
      }
    }
  }

  render(ctx) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineWidth = 3;
    
    for (const b of this.bullets) {
      const dx = b.vx;
      const dy = b.vy;
      const speed = Math.sqrt(dx * dx + dy * dy) || 1;
      const trailLength = 32;
      
      const tailX = b.x - (dx / speed) * trailLength;
      const tailY = b.y - (dy / speed) * trailLength;
      
      const gradient = ctx.createLinearGradient(tailX, tailY, b.x, b.y);
      const ownerColor = b.owner === 'p1' ? P1_COLOR : P2_COLOR;
      
      gradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
      gradient.addColorStop(0.5, ownerColor);
      gradient.addColorStop(1, '#ffffff');
      
      ctx.strokeStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(tailX, tailY);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();

      // Glowing tip core
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(Math.round(b.x) - 2, Math.round(b.y) - 2, 4, 4);
    }
    ctx.restore();
  }
}
