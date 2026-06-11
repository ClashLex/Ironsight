import { 
  P1_COLOR, 
  P2_COLOR, 
  INK, 
  INK_DIM, 
  METAL_DARK, 
  METAL_FRAME, 
  ROUND_INTRO_T, 
  ROUND_END_T, 
  SHOOT_COOLDOWN, 
  FLASH_DURATION 
} from './js/constants.js';
import { AudioEngine } from './js/audio.js';
import { ParticleSystem } from './js/particles.js';
import { BulletManager } from './js/bullets.js';
import { GestureEngine } from './js/gesture.js';

// ---------- DOM Elements ----------
const video        = document.getElementById('video');
const gameCanvas   = document.getElementById('gameCanvas');
const uiCanvas     = document.getElementById('uiCanvas');
const startOverlay = document.getElementById('startOverlay');

const gctx = gameCanvas.getContext('2d', { willReadFrequently: true });
const uctx = uiCanvas.getContext('2d',   { willReadFrequently: true });

// ---------- Engines ----------
const audio         = new AudioEngine();
const particles     = new ParticleSystem();
const bullets       = new BulletManager(particles, audio, onHit);
let gestureEngine   = null;

let W = window.innerWidth;
let H = window.innerHeight;

// ---------- Game State ----------
const gameState = {
  lives:        { p1: 3, p2: 3 },
  rounds:       { p1: 0, p2: 0 },
  currentRound: 1,
  phase:        'idle',  // 'idle' | 'roundIntro' | 'playing' | 'roundEnd' | 'matchEnd'
  phaseTimer:   0,
  lastShot:     { p1: 0, p2: 0 },
  flashTimer:   0,
  shakeTimer:   0,       // screen shake duration remaining
  matchWinner:  null,
  lastRoundWinner: null,
  controlMode:  'webcam' // 'webcam' | 'keyboard'
};

// ---------- UI Dirty State Tracker ----------
let uiDirty = true;
const uiState = {
  phase: '', livesP1: -1, livesP2: -1,
  roundsP1: -1, roundsP2: -1, round: -1,
  p1Hands: null, p2Hands: null,
  matchWinner: null, lastRoundWinner: null
};

// ---------- Keyboard Fallback State ----------
const keysHeld = {};
const keyboardPlayers = {
  p1: { aim: { x: 0, y: 0 }, fire: false, isActive: false, isPinching: false },
  p2: { aim: { x: 0, y: 0 }, fire: false, isActive: false, isPinching: false }
};

// P2 Keyboard movement speed (pixels per second)
const KBD_SPEED = 700;

// ---------- Initialize & Resize ----------
function resizeAll() {
  W = window.innerWidth; H = window.innerHeight;
  for (const c of [gameCanvas, uiCanvas]) {
    c.width = W; c.height = H;
  }
  if (gestureEngine) {
    gestureEngine.resize(W, H);
  }
  
  // Set default initial aim spots for keyboard players
  if (!keyboardPlayers.p1.aim.x) {
    keyboardPlayers.p1.aim = { x: W * 0.25, y: H * 0.5 };
    keyboardPlayers.p2.aim = { x: W * 0.75, y: H * 0.5 };
  }
  uiDirty = true;
}
window.addEventListener('resize', resizeAll);

// ---------- Input Listeners (Keyboard Fallback) ----------
document.addEventListener('keydown', (e) => {
  keysHeld[e.code] = true;

  if (gameState.phase === 'matchEnd' && e.code === 'Space') {
    startMatch();
  }

  // P2 shooting via keyboard (Enter key)
  if (gameState.controlMode === 'keyboard' && gameState.phase === 'playing') {
    if (e.code === 'Enter') {
      keyboardPlayers.p2.isPinching = true;
      const now = performance.now();
      if (now - gameState.lastShot.p2 >= SHOOT_COOLDOWN) {
        gameState.lastShot.p2 = now;
        bullets.spawn('p2', keyboardPlayers.p2.aim.x, keyboardPlayers.p2.aim.y, keyboardPlayers.p1.aim.x, keyboardPlayers.p1.aim.y);
        audio.shoot();
      }
    }
    // P1 shooting via Keyboard (Space key)
    if (e.code === 'Space') {
      keyboardPlayers.p1.isPinching = true;
      const now = performance.now();
      if (now - gameState.lastShot.p1 >= SHOOT_COOLDOWN) {
        gameState.lastShot.p1 = now;
        bullets.spawn('p1', keyboardPlayers.p1.aim.x, keyboardPlayers.p1.aim.y, keyboardPlayers.p2.aim.x, keyboardPlayers.p2.aim.y);
        audio.shoot();
      }
    }
  }
});

document.addEventListener('keyup', (e) => {
  keysHeld[e.code] = false;
  
  if (gameState.controlMode === 'keyboard') {
    if (e.code === 'Enter') {
      keyboardPlayers.p2.isPinching = false;
    }
    if (e.code === 'Space') {
      keyboardPlayers.p1.isPinching = false;
    }
  }
});

// P1 Mouse aiming & click fire fallback
document.addEventListener('mousemove', (e) => {
  if (gameState.controlMode === 'keyboard') {
    keyboardPlayers.p1.aim.x = e.clientX;
    keyboardPlayers.p1.aim.y = e.clientY;
  }
});

document.addEventListener('mousedown', (e) => {
  if (gameState.controlMode === 'keyboard' && gameState.phase === 'playing' && e.button === 0) {
    keyboardPlayers.p1.isPinching = true;
    const now = performance.now();
    if (now - gameState.lastShot.p1 >= SHOOT_COOLDOWN) {
      gameState.lastShot.p1 = now;
      bullets.spawn('p1', keyboardPlayers.p1.aim.x, keyboardPlayers.p1.aim.y, keyboardPlayers.p2.aim.x, keyboardPlayers.p2.aim.y);
      audio.shoot();
    }
  }
  
  // Unmute/resume audio context block safety
  if (audio.ctx && audio.ctx.state === 'suspended') {
    audio.ctx.resume().catch(() => {});
  }
});

document.addEventListener('mouseup', (e) => {
  if (gameState.controlMode === 'keyboard' && e.button === 0) {
    keyboardPlayers.p1.isPinching = false;
  }
});

// ---------- Game Mechanics ----------
function startMatch() {
  gameState.lives  = { p1: 3, p2: 3 };
  gameState.rounds = { p1: 0, p2: 0 };
  gameState.currentRound = 1;
  gameState.phase = 'roundIntro';
  gameState.phaseTimer = ROUND_INTRO_T;
  gameState.matchWinner = null;
  gameState.lastRoundWinner = null;
  bullets.clear();
  particles.particles.length = 0;
  
  audio.stopMusic();
  uiDirty = true;
}

function nextRoundOrMatchEnd() {
  audio.stopMusic();
  if (gameState.rounds.p1 >= 2) {
    gameState.matchWinner = 'p1';
    gameState.phase = 'matchEnd';
  } else if (gameState.rounds.p2 >= 2) {
    gameState.matchWinner = 'p2';
    gameState.phase = 'matchEnd';
  } else {
    gameState.currentRound++;
    gameState.lives.p1 = 3;
    gameState.lives.p2 = 3;
    gameState.phase = 'roundIntro';
    gameState.phaseTimer = ROUND_INTRO_T;
    bullets.clear();
  }
  uiDirty = true;
}

function onHit(targetKey) {
  if (gameState.phase !== 'playing') return;
  
  gameState.lives[targetKey] = Math.max(0, gameState.lives[targetKey] - 1);
  gameState.flashTimer = FLASH_DURATION;
  gameState.shakeTimer = 0.28; // set screen shake duration
  
  uiDirty = true;
  if (gameState.lives[targetKey] <= 0) {
    const winner = targetKey === 'p1' ? 'p2' : 'p1';
    gameState.rounds[winner]++;
    gameState.lastRoundWinner = winner;
    gameState.phase = 'roundEnd';
    gameState.phaseTimer = ROUND_END_T;
    audio.roundEnd();
  }
}

// ---------- Update Loop ----------
let lastTime = performance.now();

function gameLoop(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;

  // ---- Update Particles ----
  particles.update(dt);

  // ---- Get Current Player Aiming Positions Reference ----
  let currentPlayers;
  if (gameState.controlMode === 'webcam') {
    gestureEngine.update(now);
    currentPlayers = gestureEngine.players;
  } else {
    // Process keyboard inputs for P1/P2 aiming positions
    updateKeyboardAiming(dt);
    currentPlayers = keyboardPlayers;
  }

  // ---- State Machine Logic ----
  if (gameState.phase === 'playing') {
    // Keep background arpeggio music running
    if (!audio.isPlayingMusic) {
      audio.startMusic();
    }

    bullets.update(dt, currentPlayers, W, H);

    if (gameState.controlMode === 'webcam') {
      // Fire weapons on pinch transitions
      for (const key of ['p1', 'p2']) {
        const p = currentPlayers[key];
        const oppKey = key === 'p1' ? 'p2' : 'p1';
        const op = currentPlayers[oppKey];
        if (p.fire && p.handsVisible && (now - gameState.lastShot[key] >= SHOOT_COOLDOWN)) {
          gameState.lastShot[key] = now;
          bullets.spawn(key, p.aim.x, p.aim.y, op.aim.x, op.aim.y);
          audio.shoot();
        }
      }
    }
  } else if (gameState.phase === 'roundIntro') {
    gameState.phaseTimer -= dt;
    if (gameState.phaseTimer <= 0) {
      gameState.phase = 'playing';
      uiDirty = true;
    }
  } else if (gameState.phase === 'roundEnd') {
    gameState.phaseTimer -= dt;
    bullets.update(dt, currentPlayers, W, H);
    if (gameState.phaseTimer <= 0) {
      nextRoundOrMatchEnd();
    }
  }

  // Manage timers
  if (gameState.flashTimer > 0) gameState.flashTimer -= dt;
  if (gameState.shakeTimer > 0) gameState.shakeTimer -= dt;

  // ---- Screen Shake Setup ----
  let shakeX = 0, shakeY = 0;
  if (gameState.shakeTimer > 0) {
    const intensity = 9;
    shakeX = (Math.random() * 2 - 1) * intensity;
    shakeY = (Math.random() * 2 - 1) * intensity;
  }

  // ---- Render Scene ----
  gctx.save();
  if (shakeX || shakeY) gctx.translate(shakeX, shakeY);
  renderGame(currentPlayers);
  gctx.restore();

  // Redraw UI when dirty or in dynamic phase transitions
  if (checkUIDirty() || gameState.phase === 'roundIntro' || gameState.phase === 'roundEnd' || gameState.phase === 'matchEnd') {
    uctx.save();
    if (shakeX || shakeY) uctx.translate(shakeX, shakeY);
    renderUI(currentPlayers);
    uctx.restore();
    uiDirty = false;
  }

  requestAnimationFrame(gameLoop);
}

function updateKeyboardAiming(dt) {
  // Move Player 2 using Arrow Keys
  if (keysHeld['ArrowUp'])    keyboardPlayers.p2.aim.y = Math.max(40, keyboardPlayers.p2.aim.y - KBD_SPEED * dt);
  if (keysHeld['ArrowDown'])  keyboardPlayers.p2.aim.y = Math.min(H - 40, keyboardPlayers.p2.aim.y + KBD_SPEED * dt);
  if (keysHeld['ArrowLeft'])  keyboardPlayers.p2.aim.x = Math.max(W * 0.5 + 40, keyboardPlayers.p2.aim.x - KBD_SPEED * dt);
  if (keysHeld['ArrowRight']) keyboardPlayers.p2.aim.x = Math.min(W - 40, keyboardPlayers.p2.aim.x + KBD_SPEED * dt);

  // Move Player 1 fallback using WASD keys (if not using mouse)
  if (keysHeld['KeyW']) keyboardPlayers.p1.aim.y = Math.max(40, keyboardPlayers.p1.aim.y - KBD_SPEED * dt);
  if (keysHeld['KeyS']) keyboardPlayers.p1.aim.y = Math.min(H - 40, keyboardPlayers.p1.aim.y + KBD_SPEED * dt);
  if (keysHeld['KeyA']) keyboardPlayers.p1.aim.x = Math.max(40, keyboardPlayers.p1.aim.x - KBD_SPEED * dt);
  if (keysHeld['KeyD']) keyboardPlayers.p1.aim.x = Math.min(W * 0.5 - 40, keyboardPlayers.p1.aim.x + KBD_SPEED * dt);
}

function checkUIDirty() {
  let p1Active, p2Active;
  if (gameState.controlMode === 'webcam') {
    p1Active = gestureEngine.players.p1.handsVisible;
    p2Active = gestureEngine.players.p2.handsVisible;
  } else {
    p1Active = keyboardPlayers.p1.isActive;
    p2Active = keyboardPlayers.p2.isActive;
  }

  if (uiDirty
      || uiState.phase     !== gameState.phase
      || uiState.livesP1   !== gameState.lives.p1
      || uiState.livesP2   !== gameState.lives.p2
      || uiState.roundsP1  !== gameState.rounds.p1
      || uiState.roundsP2  !== gameState.rounds.p2
      || uiState.round     !== gameState.currentRound
      || uiState.p1Hands   !== p1Active
      || uiState.p2Hands   !== p2Active
      || uiState.matchWinner !== gameState.matchWinner
      || uiState.lastRoundWinner !== gameState.lastRoundWinner) {
    
    uiState.phase    = gameState.phase;
    uiState.livesP1  = gameState.lives.p1;
    uiState.livesP2  = gameState.lives.p2;
    uiState.roundsP1 = gameState.rounds.p1;
    uiState.roundsP2 = gameState.rounds.p2;
    uiState.round    = gameState.currentRound;
    uiState.p1Hands  = p1Active;
    uiState.p2Hands  = p2Active;
    uiState.matchWinner = gameState.matchWinner;
    uiState.lastRoundWinner = gameState.lastRoundWinner;
    return true;
  }
  return false;
}

// ---------- Game Canvas Renderer ----------
function renderGame(players) {
  gctx.clearRect(0, 0, W, H);

  // White dynamic flash on player damage
  if (gameState.flashTimer > 0) {
    const alpha = (gameState.flashTimer / FLASH_DURATION) * 0.45;
    gctx.fillStyle = `rgba(255, 255, 255, ${alpha.toFixed(3)})`;
    gctx.fillRect(0, 0, W, H);
  }

  // Draw Reticles & Laser guides (during gameplay/transitions)
  const drawHud = gameState.phase === 'playing' || gameState.phase === 'roundIntro' || gameState.phase === 'roundEnd';
  if (drawHud) {
    if (players.p1.handsVisible || players.p1.isActive) {
      drawLaserSight(gctx, players.p1.aim.x, players.p1.aim.y, P1_COLOR, players.p1.isPinching);
      drawCrosshair(gctx, players.p1.aim.x, players.p1.aim.y, P1_COLOR);
      drawNameTag(gctx, 'P1', players.p1.aim.x, players.p1.aim.y, P1_COLOR);
    }
    if (players.p2.handsVisible || players.p2.isActive) {
      drawLaserSight(gctx, players.p2.aim.x, players.p2.aim.y, P2_COLOR, players.p2.isPinching);
      drawCrosshair(gctx, players.p2.aim.x, players.p2.aim.y, P2_COLOR);
      drawNameTag(gctx, 'P2', players.p2.aim.x, players.p2.aim.y, P2_COLOR);
    }
  }

  bullets.render(gctx);
  particles.render(gctx);
}

function drawLaserSight(ctx, ax, ay, color, active) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = active ? 0.65 : 0.15;
  ctx.lineWidth = active ? 4 : 2;
  ctx.setLineDash([8, 8]);
  ctx.beginPath();
  
  // Lasers project out from bottom corners of the arcade cabinet window
  const startX = color === P1_COLOR ? 0 : W;
  ctx.moveTo(startX, H);
  ctx.lineTo(ax, ay);
  ctx.stroke();
  ctx.restore();
}

function drawCrosshair(ctx, x, y, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth   = 2;
  ctx.beginPath();
  
  // Center cross markings
  ctx.moveTo(x - 14, y);
  ctx.lineTo(x - 5,  y);
  ctx.moveTo(x + 5,  y);
  ctx.lineTo(x + 14, y);
  ctx.moveTo(x, y - 14);
  ctx.lineTo(x, y - 5);
  ctx.moveTo(x, y + 5);
  ctx.lineTo(x, y + 14);
  ctx.stroke();
  
  // Center glowing dot
  ctx.fillStyle = color;
  ctx.fillRect(x - 1, y - 1, 3, 3);
  
  // Reticle corner ticks
  ctx.fillRect(x - 15, y - 15, 2, 2);
  ctx.fillRect(x + 13, y - 15, 2, 2);
  ctx.fillRect(x - 15, y + 13, 2, 2);
  ctx.fillRect(x + 13, y + 13, 2, 2);
  ctx.restore();
}

function drawNameTag(ctx, text, x, y, color) {
  ctx.save();
  ctx.font = '10px "Press Start 2P", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  
  // Label plate backdrop
  const width = ctx.measureText(text).width;
  ctx.fillStyle = 'rgba(10, 8, 6, 0.75)';
  ctx.fillRect(x - width / 2 - 6, y - 34, width + 12, 16);
  ctx.strokeStyle = METAL_FRAME;
  ctx.lineWidth = 1;
  ctx.strokeRect(x - width / 2 - 6, y - 34, width + 12, 16);
  
  ctx.fillStyle = color;
  ctx.fillText(text, x, y - 22);
  ctx.restore();
}

// ---------- UI Canvas Renderer ----------
function renderUI(players) {
  uctx.clearRect(0, 0, W, H);

  drawHealthBar(uctx, 'p1', P1_COLOR, true);
  drawHealthBar(uctx, 'p2', P2_COLOR, false);
  drawTallies(uctx);
  drawMatchHeader(uctx);

  // Warning overlays if player hands are missing in webcam mode
  if (gameState.phase === 'playing' && gameState.controlMode === 'webcam') {
    if (!players.p1.handsVisible) {
      drawWarning(uctx, 'RAISE HAND', 30, 110, 'left');
    }
    if (!players.p2.handsVisible) {
      drawWarning(uctx, 'RAISE HAND', W - 30, 110, 'right');
    }
  }

  // Round transitions HUD overlays
  if (gameState.phase === 'roundIntro') {
    uctx.fillStyle = 'rgba(10, 8, 6, 0.7)';
    uctx.fillRect(0, H / 2 - 80, W, 160);
    uctx.fillStyle = METAL_FRAME;
    uctx.fillRect(0, H / 2 - 80, W, 3);
    uctx.fillRect(0, H / 2 + 77, W, 3);
    
    uctx.fillStyle = INK;
    uctx.font = `${Math.min(70, Math.floor(W / 15))}px "Press Start 2P", monospace`;
    uctx.textAlign = 'center';
    uctx.textBaseline = 'middle';
    uctx.fillText(`ROUND ${gameState.currentRound}`, W / 2, H / 2);
  }

  if (gameState.phase === 'roundEnd') {
    uctx.fillStyle = 'rgba(10, 8, 6, 0.7)';
    uctx.fillRect(0, H / 2 - 70, W, 140);
    uctx.fillStyle = METAL_FRAME;
    uctx.fillRect(0, H / 2 - 70, W, 3);
    uctx.fillRect(0, H / 2 + 67, W, 3);
    
    const winnerKey = gameState.lastRoundWinner;
    const color = winnerKey === 'p1' ? P1_COLOR : P2_COLOR;
    uctx.fillStyle = color;
    uctx.font = `${Math.min(38, Math.floor(W / 26))}px "Press Start 2P", monospace`;
    uctx.textAlign = 'center';
    uctx.textBaseline = 'middle';
    uctx.fillText(`${winnerKey ? winnerKey.toUpperCase() : ''} TAKES THE ROUND`, W / 2, H / 2);
  }

  if (gameState.phase === 'matchEnd') {
    uctx.fillStyle = 'rgba(8, 6, 4, 0.9)';
    uctx.fillRect(0, 0, W, H);
    
    uctx.fillStyle = METAL_DARK;
    uctx.fillRect(0, H / 2 - 130, W, 260);
    uctx.strokeStyle = METAL_FRAME;
    uctx.lineWidth = 3;
    uctx.strokeRect(40, H / 2 - 130, W - 80, 260);

    const winnerKey = gameState.matchWinner;
    const color = winnerKey === 'p1' ? P1_COLOR : P2_COLOR;
    
    uctx.fillStyle = color;
    uctx.font = `${Math.min(70, Math.floor(W / 14))}px "Press Start 2P", monospace`;
    uctx.textAlign = 'center';
    uctx.textBaseline = 'middle';
    uctx.fillText(`${winnerKey ? winnerKey.toUpperCase() : ''} WINS`, W / 2, H / 2 - 30);

    uctx.fillStyle = INK_DIM;
    uctx.font = '14px "Press Start 2P", monospace';
    uctx.fillText('PRESS SPACE TO RESTART', W / 2, H / 2 + 50);

    uctx.fillStyle = INK_DIM;
    uctx.font = '10px "Press Start 2P", monospace';
    uctx.fillText('— INSERT COIN TO PLAY AGAIN —', W / 2, H / 2 + 90);
  }
}

function drawHealthBar(ctx, key, color, leftSide) {
  const lives = gameState.lives[key];
  const segW = 22, segH = 32, gap = 6;
  const total = 3 * segW + 2 * gap;
  const margin = 30;
  const yTop = 36;
  const x = leftSide ? margin : W - margin - total;

  ctx.save();
  ctx.fillStyle = METAL_DARK;
  ctx.fillRect(x - 8, yTop - 8, total + 16, segH + 16);
  ctx.strokeStyle = METAL_FRAME;
  ctx.lineWidth = 2;
  ctx.strokeRect(x - 8, yTop - 8, total + 16, segH + 16);

  // Simulating metallic frame scratches
  ctx.strokeStyle = 'rgba(232, 216, 184, 0.08)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    const sx = x - 6 + Math.random() * (total + 12);
    const sy = yTop - 6 + Math.random() * (segH + 12);
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + 6 + Math.random() * 8, sy + (Math.random() * 2 - 1));
    ctx.stroke();
  }

  // Draw individual retro health blocks (CRT matrix lines styled inside blocks)
  for (let i = 0; i < 3; i++) {
    const sx = x + i * (segW + gap);
    ctx.fillStyle = '#15100c';
    ctx.fillRect(sx, yTop, segW, segH);
    ctx.strokeStyle = '#3a2f24';
    ctx.lineWidth = 1;
    ctx.strokeRect(sx + 0.5, yTop + 0.5, segW - 1, segH - 1);

    if (i < lives) {
      ctx.fillStyle = color;
      ctx.fillRect(sx + 2, yTop + 2, segW - 4, segH - 4);
      
      // LCD matrix pixel gap lines simulation
      ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
      for (let yy = yTop + 3; yy < yTop + segH - 3; yy += 3) {
        ctx.fillRect(sx + 2, yy, segW - 4, 1);
      }
    }
  }

  // Draw Labels (Player details)
  ctx.fillStyle = INK;
  ctx.font = '10px "Press Start 2P", monospace';
  ctx.textAlign = leftSide ? 'left' : 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(key.toUpperCase(), leftSide ? x - 6 : x + total + 6, yTop - 14);

  ctx.restore();
}

function drawTallies(ctx) {
  ctx.save();
  ctx.textBaseline = 'alphabetic';

  // Round tally markers
  const cyTally = 64;
  drawChalkTally(ctx, gameState.rounds.p1, W / 2 - 110, cyTally, P1_COLOR);
  drawChalkTally(ctx, gameState.rounds.p2, W / 2 + 110, cyTally, P2_COLOR);

  ctx.fillStyle = P1_COLOR;
  ctx.font = '10px "Press Start 2P", monospace';
  ctx.textAlign = 'center';
  ctx.fillText('P1', W / 2 - 110, 32);
  ctx.fillStyle = P2_COLOR;
  ctx.fillText('P2', W / 2 + 110, 32);

  ctx.restore();
}

function drawChalkTally(ctx, count, cx, cy, color) {
  const slotW = 16;
  const totalW = slotW * 2;
  const startX = cx - totalW / 2 + slotW / 2;
  
  ctx.save();
  ctx.lineCap = 'round';
  for (let i = 0; i < 2; i++) {
    const sx = startX + i * slotW;
    if (i < count) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      
      // Imprecise retro tally markings
      ctx.beginPath();
      ctx.moveTo(sx - 1, cy - 14);
      ctx.lineTo(sx + 3, cy + 14);
      ctx.stroke();
      
      // Light overlay brush cross scratches
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sx - 4, cy - 4);
      ctx.lineTo(sx + 6, cy - 8);
      ctx.stroke();
    } else {
      ctx.fillStyle = 'rgba(232, 216, 184, 0.18)';
      ctx.fillRect(sx - 1, cy - 1, 2, 2);
    }
  }
  ctx.restore();
}

function drawMatchHeader(ctx) {
  ctx.save();
  ctx.fillStyle = INK_DIM;
  ctx.font = '10px "Press Start 2P", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(`ROUND ${gameState.currentRound} / 3`, W / 2, 32);
  ctx.fillStyle = INK_DIM;
  ctx.fillRect(W / 2 - 80, 38, 160, 1);
  ctx.restore();

  // Decorative border cabinet brands
  ctx.save();
  ctx.fillStyle = INK_DIM;
  ctx.font = '8px "Press Start 2P", monospace';
  ctx.textAlign = 'left';
  ctx.fillText('IRON SIGHT v2.0', 30, H - 26);
  ctx.textAlign = 'right';
  ctx.fillText('CAB-1987-SUPER', W - 30, H - 26);
  ctx.restore();
}

function drawWarning(ctx, text, x, y, align) {
  ctx.save();
  ctx.font = '10px "Press Start 2P", monospace';
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';

  const width = ctx.measureText(text).width + 12;
  const bx = align === 'left' ? x - 6 : x - width + 6;
  
  ctx.fillStyle = 'rgba(42, 18, 10, 0.8)';
  ctx.fillRect(bx, y - 12, width, 18);
  ctx.strokeStyle = '#8a4020';
  ctx.lineWidth = 1;
  ctx.strokeRect(bx + 0.5, y - 11.5, width - 1, 17);

  // Pulsing warning text
  const pulseVal = 0.55 + 0.45 * Math.abs(Math.sin(performance.now() / 200));
  ctx.fillStyle = `rgba(235, 130, 60, ${pulseVal.toFixed(3)})`;
  ctx.fillText(text, x, y);
  ctx.restore();
}

// ---------- Mode Setup Callbacks ----------
function startKeyboardMatch() {
  keyboardPlayers.p1.isActive = true;
  keyboardPlayers.p2.isActive = true;
  
  // Set default initial position on screen
  keyboardPlayers.p1.aim = { x: W * 0.25, y: H * 0.5 };
  keyboardPlayers.p2.aim = { x: W * 0.75, y: H * 0.5 };
  
  // Hide video feed as we don't need webcam
  video.style.display = 'none';

  startMatch();
  lastTime = performance.now();
  requestAnimationFrame(gameLoop);
}

let processingFrame = false;
let handsObject = null;

async function startWebcamMatch() {
  resizeAll();

  // Show fatal overlay error if MediaPipe script didn't load
  if (typeof Hands === 'undefined') {
    showFatal('FAILED TO LOAD MEDIAPIPE SCRIPT');
    return;
  }

  // 1) Initialize Webcam Feed
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
      audio: false
    });
  } catch (e) {
    showFatal('CAMERA ACCESS DENIED');
    return;
  }

  video.srcObject = stream;
  await new Promise((resolve) => {
    if (video.readyState >= 2) return resolve();
    video.onloadedmetadata = () => resolve();
  });
  
  try {
    await video.play();
  } catch (e) {
    console.error('Failed to autoplay video:', e);
  }

  // 2) Initialize MediaPipe Hands
  gestureEngine = new GestureEngine(W, H);
  handsObject = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${file}`
  });
  
  handsObject.setOptions({
    maxNumHands: 4,
    modelComplexity: 1,
    minDetectionConfidence: 0.6,
    minTrackingConfidence: 0.5
  });

  handsObject.onResults((results) => {
    gestureEngine.setHandsResults(results);
  });

  // 3) Background Camera Capture Thread
  const targetCamInterval = 33; // limit camera tracking to ~30 FPS to conserve CPU
  let lastCameraSent = 0;
  
  const camProcess = async () => {
    const t = performance.now();
    if (!processingFrame && video.readyState >= 2 && (t - lastCameraSent) >= targetCamInterval) {
      processingFrame = true;
      lastCameraSent = t;
      try {
        await handsObject.send({ image: video });
      } catch (err) {
        console.warn('MediaPipe send error:', err);
      }
      processingFrame = false;
    }
    requestAnimationFrame(camProcess);
  };
  requestAnimationFrame(camProcess);

  // 4) Launch Game Loop
  startMatch();
  lastTime = performance.now();
  requestAnimationFrame(gameLoop);
}

function showFatal(message) {
  startOverlay.style.display = 'flex';
  startOverlay.innerHTML = `
    <h1>IRON SIGHT</h1>
    <h2>// SYSTEM FAULT //</h2>
    <p style="color:#c85a3a">${message}</p>
    <p style="margin-top:35px;color:#8a7a5e">PLEASE DOCK KEYBOARD CONTROL OR RE-GRANT CAMERA ACCESS</p>
    <div class="mode-buttons" style="margin-top:25px;">
      <button class="btn-arcade green-theme" onclick="window.location.reload()">RELOAD</button>
    </div>
  `;
}

// ---------- Mode Selection Bootstrap Buttons ----------
export function bootstrapGame() {
  resizeAll();
  
  // Set up click handlers on overlay select buttons
  const webcamBtn = document.getElementById('webcamModeBtn');
  const keyboardBtn = document.getElementById('keyboardModeBtn');

  if (webcamBtn) {
    webcamBtn.addEventListener('click', () => {
      audio.unlock();
      gameState.controlMode = 'webcam';
      startOverlay.style.display = 'none';
      startWebcamMatch();
    }, { once: true });
  }

  if (keyboardBtn) {
    keyboardBtn.addEventListener('click', () => {
      audio.unlock();
      gameState.controlMode = 'keyboard';
      startOverlay.style.display = 'none';
      startKeyboardMatch();
    }, { once: true });
  }
}
