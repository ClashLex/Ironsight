import { PINCH_THRESHOLD } from './constants.js';

/* =========================================================================
   GestureEngine
   - Reads MediaPipe Hands landmarks
   - Uses distance-based tracking (coherent matching) to link hands to player slots
   - Low-pass filters the aim position for smoothness
   - Tracks pinch gesture transitions (thumb to index tip distance)
   ========================================================================= */

const TRACK_TIMEOUT = 2000; // ms before a player's hand track is considered lost

export class GestureEngine {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.handsResults = null;
    this.wasPinching = { p1: false, p2: false };
    
    // Player tracking states
    this.players = {
      p1: { 
        aim: { x: w * 0.25, y: h * 0.5 }, 
        fire: false, 
        handsVisible: false, 
        lastSeen: 0,
        isPinching: false 
      },
      p2: { 
        aim: { x: w * 0.75, y: h * 0.5 }, 
        fire: false, 
        handsVisible: false, 
        lastSeen: 0,
        isPinching: false 
      }
    };
  }

  resize(w, h) {
    this.w = w;
    this.h = h;
  }

  setHandsResults(r) {
    this.handsResults = r;
  }

  // Mirror-x conversion due to CSS mirrored video feed
  mx(nx) {
    return (1 - nx) * this.w;
  }

  my(ny) {
    return ny * this.h;
  }

  dist(x1, y1, x2, y2) {
    const dx = x1 - x2;
    const dy = y1 - y2;
    return Math.sqrt(dx * dx + dy * dy);
  }

  update(now) {
    // Reset transient, single-frame action flags
    this.players.p1.fire = false;
    this.players.p2.fire = false;
    this.players.p1.isPinching = false;
    this.players.p2.isPinching = false;

    const r = this.handsResults;
    if (!r || !r.multiHandLandmarks || r.multiHandLandmarks.length === 0) {
      // Clear pinch history when hands leave screen so players can shoot immediately upon returning
      this.wasPinching.p1 = false;
      this.wasPinching.p2 = false;
      this.players.p1.handsVisible = false;
      this.players.p2.handsVisible = false;
      return;
    }

    const p1Tracked = (now - this.players.p1.lastSeen) < TRACK_TIMEOUT;
    const p2Tracked = (now - this.players.p2.lastSeen) < TRACK_TIMEOUT;

    // Convert raw hand landmarks into screen coords
    const hands = r.multiHandLandmarks.map((lm) => {
      const wrist = lm[0];
      return {
        lm,
        x: this.mx(wrist.x),
        y: this.my(wrist.y)
      };
    });

    let assignedP1 = null;
    let assignedP2 = null;

    if (hands.length === 1) {
      const h = hands[0];
      if (p1Tracked && p2Tracked) {
        // Assign to the player whose last known aim position is closer
        const d1 = this.dist(h.x, h.y, this.players.p1.aim.x, this.players.p1.aim.y);
        const d2 = this.dist(h.x, h.y, this.players.p2.aim.x, this.players.p2.aim.y);
        if (d1 < d2) assignedP1 = h;
        else         assignedP2 = h;
      } else if (p1Tracked) {
        assignedP1 = h;
      } else if (p2Tracked) {
        assignedP2 = h;
      } else {
        // Direct screen split initialization fallback
        if (h.x < this.w / 2) assignedP1 = h;
        else                  assignedP2 = h;
      }
    } else if (hands.length >= 2) {
      // Calculate hand physical size/span to pick the 2 most distinct, close hands
      const sizedHands = hands.map((h) => {
        let minX = 1, maxX = 0, minY = 1, maxY = 0;
        for (const p of h.lm) {
          if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
          if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
        }
        h.span = (maxX - minX) + (maxY - minY);
        return h;
      }).sort((a, b) => b.span - a.span).slice(0, 2);

      const h1 = sizedHands[0];
      const h2 = sizedHands[1];

      if (p1Tracked && p2Tracked) {
        // Evaluate overall tracking cost for both configurations
        const costA = this.dist(h1.x, h1.y, this.players.p1.aim.x, this.players.p1.aim.y) +
                      this.dist(h2.x, h2.y, this.players.p2.aim.x, this.players.p2.aim.y);
        const costB = this.dist(h1.x, h1.y, this.players.p2.aim.x, this.players.p2.aim.y) +
                      this.dist(h2.x, h2.y, this.players.p1.aim.x, this.players.p1.aim.y);
        if (costA < costB) {
          assignedP1 = h1;
          assignedP2 = h2;
        } else {
          assignedP1 = h2;
          assignedP2 = h1;
        }
      } else {
        // Fallback to screen order: left hand is P1, right hand is P2
        if (h1.x < h2.x) {
          assignedP1 = h1;
          assignedP2 = h2;
        } else {
          assignedP1 = h2;
          assignedP2 = h1;
        }
      }
    }

    // Process gestures for matched player hands
    const processPlayer = (key, handObj) => {
      const p = this.players[key];
      if (!handObj) {
        p.handsVisible = false;
        this.wasPinching[key] = false;
        return;
      }
      p.handsVisible = true;
      p.lastSeen = now;

      // Low-pass filter to smooth aiming coordinates
      p.aim.x = p.aim.x + (handObj.x - p.aim.x) * 0.40;
      p.aim.y = p.aim.y + (handObj.y - p.aim.y) * 0.40;

      // Pinch distance calculation
      const lm = handObj.lm;
      const thumb = lm[4];
      const index = lm[8];
      const tx = this.mx(thumb.x), ty = this.my(thumb.y);
      const ix = this.mx(index.x), iy = this.my(index.y);
      const dist = this.dist(tx, ty, ix, iy);
      const pinching = dist < PINCH_THRESHOLD;

      // Edge trigger pinch activation
      if (pinching && !this.wasPinching[key]) {
        p.fire = true;
      }
      this.wasPinching[key] = pinching;
      p.isPinching = pinching;
    };

    processPlayer('p1', assignedP1);
    processPlayer('p2', assignedP2);
  }
}
