/* =========================================================================
   ParticleSystem
   - Manages retro particle bursts upon hit events
   - Custom-themed particle coloring matching each player
   ========================================================================= */

export class ParticleSystem {
  constructor() {
    this.particles = [];
  }

  /**
   * Spawns a burst of particles at (x, y) with a specific color
   * @param {number} x - x coordinate
   * @param {number} y - y coordinate
   * @param {string} color - CSS color code for particles
   */
  burst(x, y, color = '#ffffff') {
    const count = 12 + Math.floor(Math.random() * 8); // more particles for satisfying punch
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 100 + Math.random() * 240;
      const size = 3 + Math.floor(Math.random() * 4); // varying sizes from 3px to 6px
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.5 + Math.random() * 0.3, // lifetime 0.5s to 0.8s
        maxLife: 0.8,
        color,
        size
      });
    }
  }

  update(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x  += p.vx * dt;
      p.y  += p.vy * dt;
      p.vy += 350 * dt;     // gravity pulling particles down
      p.vx *= 0.94;         // air drag/friction slowing them down
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }

  render(ctx) {
    ctx.save();
    for (const p of this.particles) {
      const alpha = Math.max(0, Math.min(1, p.life / p.maxLife));
      ctx.fillStyle = p.color;
      ctx.globalAlpha = alpha;
      
      const px = Math.round(p.x) - Math.floor(p.size / 2);
      const py = Math.round(p.y) - Math.floor(p.size / 2);
      
      // Draw square arcade particles
      ctx.fillRect(px, py, p.size, p.size);
    }
    ctx.restore();
  }
}
