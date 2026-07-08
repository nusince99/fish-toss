(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  const scoreEl = document.getElementById('score');
  const timerEl = document.getElementById('timer');
  const levelEl = document.getElementById('level');
  const startScreen = document.getElementById('startScreen');
  const gameOverScreen = document.getElementById('gameOverScreen');
  const startBtn = document.getElementById('startBtn');
  const restartBtn = document.getElementById('restartBtn');
  const finalScoreEl = document.getElementById('finalScore');
  const bestScoreEl = document.getElementById('bestScore');

  const FISH_TYPES = [
    { emoji: '🐟', points: 10, weight: 1.0, r: 22, chance: 40 },
    { emoji: '🐠', points: 20, weight: 1.15, r: 24, chance: 26 },
    { emoji: '🐡', points: -15, weight: 0.9, r: 26, chance: 12 },
    { emoji: '🦈', points: 50, weight: 1.6, r: 34, chance: 10 },
    { emoji: '🥾', points: -10, weight: 1.3, r: 24, chance: 8 },
    { emoji: '⭐', points: 100, weight: 0.85, r: 20, chance: 4 },
  ];
  const TOTAL_CHANCE = FISH_TYPES.reduce((s, f) => s + f.chance, 0);

  function pickFish() {
    let r = Math.random() * TOTAL_CHANCE;
    for (const f of FISH_TYPES) {
      if (r < f.chance) return f;
      r -= f.chance;
    }
    return FISH_TYPES[0];
  }

  const GRAVITY = 1500;
  const POWER_SCALE = 5.5;
  const MAX_PULL = 170;

  let W = 0, H = 0, DPR = 1;
  let anchor = { x: 0, y: 0 };
  let ground = 0;

  let state = null;

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = W * DPR;
    canvas.height = H * DPR;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    ground = H - 70;
    anchor.x = W * 0.16;
    anchor.y = ground - 10;

    if (state && state.bucket) {
      state.bucket.baseX = W * 0.62;
    }
  }

  function newBucket(level) {
    return {
      baseX: W * 0.62,
      x: W * 0.62,
      y: ground - 8,
      w: Math.max(56, 100 - level * 4),
      h: 62,
      amp: Math.min(W * 0.26, 70 + level * 14),
      freq: 0.55 + level * 0.07,
      t: Math.random() * 10,
      bump: 0,
    };
  }

  function newState() {
    const best = Number(localStorage.getItem('fishToss.best') || 0);
    return {
      running: true,
      score: 0,
      best,
      timeLeft: 60,
      level: 1,
      bucket: newBucket(1),
      currentFish: pickFish(),
      projectiles: [],
      floaters: [],
      drag: null, // { x, y }
      lastTime: performance.now(),
    };
  }

  function levelForScore(score) {
    return 1 + Math.floor(Math.max(0, score) / 100);
  }

  function addFloater(x, y, text, color) {
    state.floaters.push({ x, y, text, color, life: 1.0 });
  }

  // ---------- Input ----------
  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    const p = e.touches ? e.touches[0] : e;
    return { x: p.clientX - rect.left, y: p.clientY - rect.top };
  }

  function onDown(e) {
    if (!state || !state.running) return;
    const p = getPos(e);
    state.drag = { x: p.x, y: p.y };
    e.preventDefault();
  }

  function onMove(e) {
    if (!state || !state.drag) return;
    const p = getPos(e);
    state.drag.x = p.x;
    state.drag.y = p.y;
    e.preventDefault();
  }

  function onUp(e) {
    if (!state || !state.drag) return;
    const d = state.drag;
    state.drag = null;

    let dx = anchor.x - d.x;
    let dy = anchor.y - d.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 12) return; // too small a flick, ignore

    const clamped = Math.min(dist, MAX_PULL);
    const scale = clamped / (dist || 1);
    dx *= scale;
    dy *= scale;

    const type = state.currentFish;
    state.projectiles.push({
      x: anchor.x,
      y: anchor.y,
      vx: dx * POWER_SCALE / (type.weight),
      vy: dy * POWER_SCALE / (type.weight),
      type,
      caught: false,
    });

    state.currentFish = pickFish();
    if (e.preventDefault) e.preventDefault();
  }

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', () => { if (state) state.drag = null; });

  // ---------- Update ----------
  function update(dt) {
    if (!state.running) return;

    state.timeLeft -= dt;
    if (state.timeLeft <= 0) {
      state.timeLeft = 0;
      endGame();
      return;
    }

    const newLevel = levelForScore(state.score);
    if (newLevel !== state.level) {
      state.level = newLevel;
      const b = state.bucket;
      b.w = Math.max(56, 100 - state.level * 4);
      b.amp = Math.min(W * 0.26, 70 + state.level * 14);
      b.freq = 0.55 + state.level * 0.07;
    }

    const b = state.bucket;
    b.t += dt;
    b.x = b.baseX + Math.sin(b.t * b.freq) * b.amp;
    b.bump = Math.max(0, b.bump - dt * 4);

    for (let i = state.projectiles.length - 1; i >= 0; i--) {
      const p = state.projectiles[i];
      p.vy += GRAVITY * p.type.weight * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      const bucketTop = b.y - b.h * 0.35;
      if (
        p.vy > 0 &&
        p.y >= bucketTop &&
        p.y <= b.y + b.h * 0.5 &&
        p.x >= b.x - b.w / 2 &&
        p.x <= b.x + b.w / 2
      ) {
        state.score += p.type.points;
        scoreEl.textContent = `Score: ${state.score}`;
        addFloater(p.x, bucketTop, (p.type.points > 0 ? '+' : '') + p.type.points,
          p.type.points > 0 ? '#7CFF9B' : '#FF7C7C');
        b.bump = 1;
        state.projectiles.splice(i, 1);
        continue;
      }

      if (p.y - p.type.r > H + 40 || p.x < -80 || p.x > W + 80) {
        state.projectiles.splice(i, 1);
      }
    }

    for (let i = state.floaters.length - 1; i >= 0; i--) {
      const f = state.floaters[i];
      f.y -= 40 * dt;
      f.life -= dt * 0.9;
      if (f.life <= 0) state.floaters.splice(i, 1);
    }

    timerEl.textContent = Math.ceil(state.timeLeft);
    levelEl.textContent = `Level ${state.level}`;
  }

  // ---------- Draw ----------
  function drawBackground() {
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#0a3d63');
    sky.addColorStop(0.55, '#0e5c86');
    sky.addColorStop(0.551, '#0b4a72');
    sky.addColorStop(1, '#062f4d');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    ctx.beginPath();
    ctx.arc(W * 0.84, H * 0.16, 46, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 233, 170, 0.85)';
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const y = H * (0.62 + i * 0.1);
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= W; x += 40) {
        ctx.lineTo(x, y + Math.sin(x * 0.02 + i) * 4);
      }
      ctx.stroke();
    }

    ctx.fillStyle = '#3a2415';
    ctx.fillRect(0, ground, W, H - ground);
    ctx.fillStyle = '#4d3018';
    ctx.fillRect(0, ground, W, 6);
  }

  function drawAnchor() {
    ctx.fillStyle = '#6b4226';
    ctx.fillRect(anchor.x - 6, anchor.y - 40, 12, 50);
    ctx.beginPath();
    ctx.ellipse(anchor.x, anchor.y + 8, 30, 10, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#5a3a22';
    ctx.fill();

    if (state.currentFish) {
      ctx.save();
      ctx.font = `${state.currentFish.r * 2}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const bob = Math.sin(performance.now() / 300) * 3;
      ctx.fillText(state.currentFish.emoji, anchor.x, anchor.y - 55 + bob);
      ctx.restore();
    }
  }

  function drawBucket() {
    const b = state.bucket;
    const bump = 1 + b.bump * 0.12;
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.scale(bump, 1);

    const topW = b.w;
    const botW = b.w * 0.72;
    const h = b.h;

    const grad = ctx.createLinearGradient(-topW / 2, -h, topW / 2, 0);
    grad.addColorStop(0, '#c9d6df');
    grad.addColorStop(0.5, '#8fa5b3');
    grad.addColorStop(1, '#c9d6df');

    ctx.beginPath();
    ctx.moveTo(-topW / 2, -h);
    ctx.lineTo(topW / 2, -h);
    ctx.lineTo(botW / 2, 0);
    ctx.lineTo(-botW / 2, 0);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = '#5c707d';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(0, -h, topW / 2, 10, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#3f5a6b';
    ctx.fill();
    ctx.strokeStyle = '#2c4150';
    ctx.stroke();

    ctx.restore();
  }

  function drawProjectiles() {
    for (const p of state.projectiles) {
      ctx.save();
      const tilt = Math.max(-0.6, Math.min(0.6, Math.atan2(p.vy, Math.abs(p.vx)) * 0.4));
      ctx.translate(p.x, p.y);
      ctx.rotate(tilt);
      ctx.font = `${p.type.r * 2}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.type.emoji, 0, 0);
      ctx.restore();
    }
  }

  function drawAimLine() {
    if (!state.drag) return;
    const d = state.drag;
    let dx = anchor.x - d.x;
    let dy = anchor.y - d.y;
    const dist = Math.hypot(dx, dy);
    const clamped = Math.min(dist, MAX_PULL);
    const scale = clamped / (dist || 1);
    const pullX = anchor.x - dx * scale;
    const pullY = anchor.y - dy * scale;

    ctx.save();
    ctx.setLineDash([8, 8]);
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(anchor.x, anchor.y - 55);
    ctx.lineTo(pullX, pullY - 55);
    ctx.stroke();
    ctx.restore();

    const vx = dx * scale * POWER_SCALE / state.currentFish.weight;
    const vy = dy * scale * POWER_SCALE / state.currentFish.weight;
    let sx = anchor.x, sy = anchor.y - 55, svx = vx, svy = vy;
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    for (let i = 0; i < 18; i++) {
      svy += GRAVITY * state.currentFish.weight * 0.05;
      sx += svx * 0.05;
      sy += svy * 0.05;
      if (sy > ground) break;
      ctx.beginPath();
      ctx.arc(sx, sy, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawFloaters() {
    for (const f of state.floaters) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, f.life);
      ctx.fillStyle = f.color;
      ctx.font = 'bold 26px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(f.text, f.x, f.y);
      ctx.restore();
    }
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    drawBackground();
    drawBucket();
    drawProjectiles();
    drawAnchor();
    drawAimLine();
    drawFloaters();
  }

  // ---------- Loop ----------
  function loop(now) {
    if (state) {
      const dt = Math.min(0.05, (now - state.lastTime) / 1000);
      state.lastTime = now;
      update(dt);
      draw();
    }
    requestAnimationFrame(loop);
  }

  // ---------- Game flow ----------
  function startGame() {
    state = newState();
    state.bucket.baseX = W * 0.62;
    state.bucket.x = state.bucket.baseX;
    startScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');
    scoreEl.textContent = 'Score: 0';
    timerEl.textContent = '60';
    levelEl.textContent = 'Level 1';
  }

  function endGame() {
    state.running = false;
    const best = Math.max(state.score, state.best);
    localStorage.setItem('fishToss.best', String(best));
    finalScoreEl.textContent = `Score: ${state.score}`;
    bestScoreEl.textContent = `Best: ${best}`;
    gameOverScreen.classList.remove('hidden');
  }

  startBtn.addEventListener('click', startGame);
  restartBtn.addEventListener('click', startGame);

  window.addEventListener('resize', resize);
  resize();
  requestAnimationFrame(loop);
})();
