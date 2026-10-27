'use strict';

// ===== 설정 =====
const COLS = 20, ROWS = 20;
const CELL = 24;            // 캔버스 한 칸 크기
const PX = CELL / 8;        // 한 칸 = 8x8 도트
const TICK_MS = 130;        // 내 뱀이 한 칸 움직이는 간격
const FOE_EVERY = 500;      // 이 점수마다 장애물 뱀 +1
const FOE_LEN = 5;          // 장애물 뱀 길이 (고정)
const GOLD_LIFE = 48;       // 노란 알이 사라지기까지의 틱 수 (약 6초)

const EGGS = [
  { key: 'white', name: '흰 알',   points: 10, weight: 60, fill: '#f8f3e6', shade: '#c9bda4', hi: '#ffffff' },
  { key: 'lime',  name: '연두 알', points: 25, weight: 30, fill: '#b2dd62', shade: '#6e9c2f', hi: '#e4f7b8' },
  { key: 'gold',  name: '노란 알', points: 50, weight: 10, fill: '#f6c929', shade: '#bf8410', hi: '#fff3b0' },
];
const INK = '#2a211b';
const PLAYER_PAL = { body: '#2f8f6b', light: '#63c79c', dark: '#1c5a43', belly: '#e8c860', eye: '#f6c929' };
const FOE_PALS = [
  { body: '#5a3f6e', light: '#86699c', dark: '#35243f', belly: '#c9b2d6', eye: '#e8433a' },
  { body: '#9a3229', light: '#c95c4a', dark: '#5e1c17', belly: '#e9b39a', eye: '#f6c929' },
  { body: '#2d4f8a', light: '#5a7fbf', dark: '#1a2f55', belly: '#a9c0e6', eye: '#e8433a' },
  { body: '#5c4632', light: '#8a6d50', dark: '#36281c', belly: '#d8bf96', eye: '#e8433a' },
];
const DIRS = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
const DIR_LIST = Object.values(DIRS);
const STATUS_TEXT = { ready: '준비', playing: '진행 중', danger: '위험! 접근 중', paused: '일시정지', over: '게임 오버' };
const DEATH_TEXT = { wall: '벽에 부딪혔어요', foe: '장애물 뱀에 닿았어요', self: '내 몸에 부딪혔어요' };

const EGG_SPRITE = [
  '..oooo..',
  '.ohhffo.',
  'ohfffffo',
  'ohfffffo',
  'offffffo',
  'offfffso',
  '.offsso.',
  '..oooo..',
];

// ===== DOM =====
const $ = id => document.getElementById(id);
const canvas = $('board');
canvas.width = COLS * CELL;
canvas.height = ROWS * CELL;
const ctx = canvas.getContext('2d');
const boardWrap = $('boardWrap');

// ===== 상태 =====
let state = 'ready';        // ready | playing | paused | over
let player, foes, egg, score, eaten, queue, ticks;
let floats = [];
let best = loadBest();
let toastTimer = 0;

function loadBest() { try { return Number(localStorage.getItem('cheongsa-best')) || 0; } catch { return 0; } }
function saveBest() { try { localStorage.setItem('cheongsa-best', String(best)); } catch { /* 저장 불가 */ } }

const rand = n => Math.floor(Math.random() * n);
const inside = (x, y) => x >= 0 && y >= 0 && x < COLS && y < ROWS;
const dirOf = (dx, dy) => DIR_LIST.find(d => d.x === dx && d.y === dy);
const isReverse = (a, b) => a.x === -b.x && a.y === -b.y;

function bodyHas(body, x, y, skipTail = false) {
  const n = skipTail ? body.length - 1 : body.length;
  for (let i = 0; i < n; i++) if (body[i].x === x && body[i].y === y) return true;
  return false;
}
function anySnakeAt(x, y) {
  return bodyHas(player.body, x, y) || foes.some(f => bodyHas(f.body, x, y));
}
function cellFree(x, y) {
  return inside(x, y) && !anySnakeAt(x, y) && !(egg && egg.x === x && egg.y === y);
}

// ===== 게임 준비 =====
function reset() {
  player = { body: [{ x: 5, y: 10 }, { x: 4, y: 10 }, { x: 3, y: 10 }], dir: DIRS.right, dead: false };
  foes = [];
  egg = null;
  score = 0;
  eaten = { white: 0, lime: 0, gold: 0 };
  queue = [];
  ticks = 0;
  floats = [];
  spawnFoe();
  spawnEgg();
  updateHud();
}

function spawnEgg() {
  const free = [];
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (!anySnakeAt(x, y)) free.push({ x, y });
  if (!free.length) { egg = null; return; }
  const cell = free[rand(free.length)];
  let roll = rand(EGGS.reduce((s, e) => s + e.weight, 0));
  const type = EGGS.find(e => (roll -= e.weight) < 0);
  egg = { x: cell.x, y: cell.y, type, ttl: type.key === 'gold' ? GOLD_LIFE : Infinity };
}

// 내 뱀 머리에서 멀리 떨어진 곳에 길이 FOE_LEN짜리 장애물 뱀을 만든다
function spawnFoe() {
  const head = player.body[0];
  for (let attempt = 0; attempt < 400; attempt++) {
    const x = rand(COLS), y = rand(ROWS);
    if (Math.abs(x - head.x) + Math.abs(y - head.y) < 8 || !cellFree(x, y)) continue;
    const body = [{ x, y }];
    while (body.length < FOE_LEN) {
      const last = body[body.length - 1];
      const opts = DIR_LIST.map(d => ({ x: last.x + d.x, y: last.y + d.y }))
        .filter(c => cellFree(c.x, c.y) && !bodyHas(body, c.x, c.y));
      if (!opts.length) break;
      body.push(opts[rand(opts.length)]);
    }
    if (body.length < FOE_LEN) continue;
    foes.push({ body, dir: dirOf(body[0].x - body[1].x, body[0].y - body[1].y), pal: FOE_PALS[foes.length % FOE_PALS.length] });
    return true;
  }
  return false;
}

// ===== 한 칸 진행 =====
function step() {
  ticks++;
  if (queue.length) player.dir = queue.shift();

  const head = player.body[0];
  const nx = head.x + player.dir.x, ny = head.y + player.dir.y;
  if (!inside(nx, ny)) return gameOver('wall');
  const eating = egg && egg.x === nx && egg.y === ny;
  // 알을 먹지 않으면 꼬리가 비켜나므로 꼬리 칸은 부딪힘에서 제외
  if (bodyHas(player.body, nx, ny, !eating)) return gameOver('self');
  if (foes.some(f => bodyHas(f.body, nx, ny))) return gameOver('foe');

  player.body.unshift({ x: nx, y: ny });
  if (eating) eat(); else player.body.pop();

  // 장애물 뱀은 내 뱀보다 조금 느리게 (3틱 중 2틱 이동)
  if (ticks % 3 !== 0) foes.forEach(moveFoe);

  if (egg && egg.ttl !== Infinity && --egg.ttl <= 0) spawnEgg();
  updateHud();
}

function eat() {
  const t = egg.type;
  score += t.points;
  eaten[t.key]++;
  floats.push({ x: egg.x, y: egg.y, text: '+' + t.points, color: t.fill, born: performance.now() });

  const target = 1 + Math.floor(score / FOE_EVERY);
  let added = 0;
  while (foes.length < target && spawnFoe()) added++;
  if (added) showToast(`장애물 뱀 등장! (${foes.length}마리)`);
  spawnEgg();
}

// 장애물 뱀: 벽·다른 뱀·알·내 뱀 바로 앞 칸을 피해 떠돈다
function moveFoe(f) {
  const head = f.body[0];
  const ph = player.body[0];
  const ahead = { x: ph.x + player.dir.x, y: ph.y + player.dir.y };
  const canGo = (x, y) => inside(x, y)
    && !(egg && egg.x === x && egg.y === y)
    && !(x === ahead.x && y === ahead.y)
    && !bodyHas(player.body, x, y)
    && foes.every(o => !bodyHas(o.body, x, y, o === f));

  const opts = DIR_LIST.filter(d => !isReverse(d, f.dir) && canGo(head.x + d.x, head.y + d.y));
  if (!opts.length) {
    // 갇히면 머리와 꼬리를 바꿔 반대로 돌아선다
    f.body.reverse();
    f.dir = dirOf(f.body[0].x - f.body[1].x, f.body[0].y - f.body[1].y);
    return;
  }
  const d = opts.includes(f.dir) && Math.random() < 0.7 ? f.dir : opts[rand(opts.length)];
  f.dir = d;
  f.body.unshift({ x: head.x + d.x, y: head.y + d.y });
  f.body.pop();
}

function foeIsNear() {
  const h = player.body[0];
  return foes.some(f => f.body.some(c => Math.abs(c.x - h.x) + Math.abs(c.y - h.y) <= 2));
}

// ===== 진행 상태 전환 =====
function start() {
  if (state === 'playing') return;
  reset();
  state = 'playing';
  hideOverlay();
  setStatus('playing');
}
function pause() {
  if (state !== 'playing') return;
  state = 'paused';
  setStatus('paused');
  showOverlay('pausePanel');
}
function resume() {
  if (state !== 'paused') return;
  state = 'playing';
  hideOverlay();
  setStatus(foeIsNear() ? 'danger' : 'playing');
}
function gameOver(cause) {
  state = 'over';
  player.dead = true;
  const isRecord = score > best;
  if (isRecord) { best = score; saveBest(); }

  $('overReason').textContent = DEATH_TEXT[cause];
  $('overScore').textContent = score;
  $('overRecord').classList.toggle('hidden', !isRecord);
  $('overLength').textContent = player.body.length;
  $('overFoes').textContent = foes.length;
  $('overWhite').textContent = eaten.white;
  $('overLime').textContent = eaten.lime;
  $('overGold').textContent = eaten.gold;
  $('overBest').textContent = best;
  setStatus('over');
  updateHud();
  // 부딪힌 장면을 잠깐 보여준 뒤 결과 창
  setTimeout(() => { if (state === 'over') showOverlay('overPanel'); }, 700);
}

function showOverlay(panelId) {
  $('overlay').classList.remove('hidden');
  for (const id of ['startPanel', 'pausePanel', 'overPanel']) $(id).classList.toggle('hidden', id !== panelId);
}
function hideOverlay() { $('overlay').classList.add('hidden'); }

function setStatus(name) {
  $('status').className = 'status ' + name;
  $('statusText').textContent = STATUS_TEXT[name];
  boardWrap.dataset.state = name;
}

function updateHud() {
  $('score').textContent = score;
  $('best').textContent = Math.max(best, score);
  $('length').textContent = player.body.length;
  $('foes').textContent = foes.length;
  const left = FOE_EVERY - (score % FOE_EVERY);
  $('nextText').textContent = `다음 장애물 뱀까지 ${left}점`;
  $('nextBar').style.width = ((score % FOE_EVERY) / FOE_EVERY * 100) + '%';
  if (state === 'playing') {
    const name = foeIsNear() ? 'danger' : 'playing';
    if (boardWrap.dataset.state !== name) setStatus(name);
  }
}

function showToast(text) {
  const el = $('toast');
  el.textContent = text;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 1800);
}

// ===== 그리기 =====
const bg = makeBackground();

// 한지 느낌의 바둑판 배경을 한 번만 그려 둔다
function makeBackground() {
  const c = document.createElement('canvas');
  c.width = canvas.width; c.height = canvas.height;
  const b = c.getContext('2d');
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    b.fillStyle = (x + y) % 2 ? '#f1e3c0' : '#ebdab2';
    b.fillRect(x * CELL, y * CELL, CELL, CELL);
  }
  let seed = 7;
  const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 700; i++) {
    b.fillStyle = r() < 0.6 ? '#dfca98' : '#f8eed6';
    b.fillRect(Math.floor(r() * c.width / PX) * PX, Math.floor(r() * c.height / PX) * PX, PX, PX);
  }
  return c;
}

// 칸(cx,cy) 안의 도트 좌표(i,j)에 w x h 크기 사각형
function dot(g, cx, cy, i, j, w, h, color) {
  g.fillStyle = color;
  g.fillRect(cx * CELL + i * PX, cy * CELL + j * PX, w * PX, h * PX);
}

// 오른쪽을 보는 기준 도트 좌표를 실제 진행 방향으로 돌린다
function rot(i, j, dir) {
  if (dir === DIRS.left) return [7 - i, j];
  if (dir === DIRS.down) return [7 - j, i];
  if (dir === DIRS.up) return [j, 7 - i];
  return [i, j];
}

function drawEggAt(g, ox, oy, type, px) {
  const colors = { o: INK, f: type.fill, s: type.shade, h: type.hi };
  EGG_SPRITE.forEach((row, j) => {
    for (let i = 0; i < 8; i++) {
      const c = colors[row[i]];
      if (!c) continue;
      g.fillStyle = c;
      g.fillRect(ox + i * px, oy + j * px, px, px);
    }
  });
}

function drawEgg(t) {
  if (!egg) return;
  if (egg.ttl < 16 && Math.floor(t / 120) % 2) return; // 사라지기 직전 깜빡임
  const bob = Math.floor(t / 400) % 2 ? 0 : -PX;
  drawEggAt(ctx, egg.x * CELL, egg.y * CELL + bob, egg.type, PX);
  if (egg.type.key === 'gold' && Math.floor(t / 250) % 2) {
    dot(ctx, egg.x, egg.y, 7, 0, 1, 1, '#fff7c2');
    dot(ctx, egg.x, egg.y, 0, 6, 1, 1, '#fff7c2');
  }
}

function drawSnake(body, dir, pal, isPlayer, t) {
  const dead = isPlayer && player.dead;
  const fill = dead ? '#8f857c' : pal.body;
  for (let k = body.length - 1; k >= 0; k--) {
    const s = body[k];
    const links = [];
    if (k > 0) links.push(body[k - 1]);
    if (k < body.length - 1) links.push(body[k + 1]);

    if (k === 0) { drawHead(s, dir, pal, isPlayer, dead, t); continue; }

    // 몸통: 먹색 외곽선 + 이웃 칸 쪽으로 이어지는 연결부
    const tail = k === body.length - 1;
    const a = tail ? 2 : 1, n = tail ? 4 : 6;
    dot(ctx, s.x, s.y, a, a, n, n, INK);
    dot(ctx, s.x, s.y, a + 1, a + 1, n - 2, n - 2, fill);
    for (const o of links) {
      const dx = o.x - s.x, dy = o.y - s.y;
      if (dx === 1)  { dot(ctx, s.x, s.y, a + n - 1, a, 8 - (a + n - 1), n, INK); dot(ctx, s.x, s.y, a + n - 1, a + 1, 8 - (a + n - 1), n - 2, fill); }
      if (dx === -1) { dot(ctx, s.x, s.y, 0, a, a + 1, n, INK); dot(ctx, s.x, s.y, 0, a + 1, a + 1, n - 2, fill); }
      if (dy === 1)  { dot(ctx, s.x, s.y, a, a + n - 1, n, 8 - (a + n - 1), INK); dot(ctx, s.x, s.y, a + 1, a + n - 1, n - 2, 8 - (a + n - 1), fill); }
      if (dy === -1) { dot(ctx, s.x, s.y, a, 0, n, a + 1, INK); dot(ctx, s.x, s.y, a + 1, 0, n - 2, a + 1, fill); }
    }
    // 비늘 무늬
    if (!dead && !tail) {
      if (k % 2) { dot(ctx, s.x, s.y, 3, 3, 1, 1, pal.light); dot(ctx, s.x, s.y, 4, 4, 1, 1, pal.dark); }
      else dot(ctx, s.x, s.y, 3, 4, 2, 1, pal.belly);
    }
  }
}

function drawHead(s, dir, pal, isPlayer, dead, t) {
  const p = (i, j, color) => { const [x, y] = rot(i, j, dir); dot(ctx, s.x, s.y, x, y, 1, 1, color); };
  // 외곽선 (모서리를 깎은 8x8) 과 머리 색
  for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) {
    const corner = (i === 0 || i === 7) && (j === 0 || j === 7);
    if (corner) continue;
    const edge = i === 0 || i === 7 || j === 0 || j === 7;
    p(i, j, edge ? INK : (dead ? '#8f857c' : pal.body));
  }
  if (!dead) {
    p(2, 3, pal.light); p(3, 3, pal.light); p(2, 4, pal.dark);
    if (isPlayer) { p(1, 1, pal.belly); p(1, 6, pal.belly); p(2, 1, pal.belly); p(2, 6, pal.belly); } // 금빛 뿔
    p(4, 1, pal.eye); p(5, 1, INK); p(4, 6, pal.eye); p(5, 6, INK);
    if (Math.floor(t / 300) % 4 === 0) { p(7, 3, '#d8322a'); p(7, 4, '#d8322a'); } // 혀 날름
  } else {
    p(4, 1, INK); p(5, 2, INK); p(5, 1, INK); p(4, 2, INK);
    p(4, 5, INK); p(5, 6, INK); p(5, 5, INK); p(4, 6, INK);
  }
}

function drawFloats(t) {
  ctx.font = `${CELL * 0.7}px Silkscreen, monospace`;
  ctx.textAlign = 'center';
  floats = floats.filter(f => t - f.born < 800);
  for (const f of floats) {
    const age = (t - f.born) / 800;
    const x = f.x * CELL + CELL / 2, y = f.y * CELL - age * CELL;
    ctx.globalAlpha = 1 - age;
    ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.strokeText(f.text, x, y);
    ctx.fillStyle = f.color; ctx.fillText(f.text, x, y);
    ctx.globalAlpha = 1;
  }
}

function draw(t) {
  ctx.drawImage(bg, 0, 0);
  drawEgg(t);
  for (const f of foes) drawSnake(f.body, f.dir, f.pal, false, t);
  drawSnake(player.body, player.dir, PLAYER_PAL, true, t);
  drawFloats(t);
}

// ===== 루프 =====
let last = performance.now(), acc = 0;
function frame(t) {
  requestAnimationFrame(frame);
  if (state === 'playing') {
    acc += Math.min(t - last, 250);
    while (acc >= TICK_MS && state === 'playing') { acc -= TICK_MS; step(); }
  } else acc = 0;
  last = t;
  draw(t);
}

// ===== 입력 =====
function turn(name) {
  if (state !== 'playing') return;
  const d = DIRS[name];
  const prev = queue.length ? queue[queue.length - 1] : player.dir;
  if (d === prev || isReverse(d, prev)) return;
  if (queue.length < 2) queue.push(d);
}

const KEYMAP = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
};
document.addEventListener('keydown', e => {
  if (KEYMAP[e.code]) { e.preventDefault(); turn(KEYMAP[e.code]); return; }
  if (e.code === 'Space' || e.code === 'KeyP' || e.code === 'Escape') {
    e.preventDefault();
    if (state === 'playing') pause();
    else if (state === 'paused') resume();
    else if (e.code === 'Space') start();
  } else if (e.code === 'Enter') {
    e.preventDefault();
    if (state === 'paused') resume(); else start();
  }
});

document.querySelectorAll('.pad[data-dir]').forEach(btn => {
  btn.addEventListener('pointerdown', e => { e.preventDefault(); turn(btn.dataset.dir); });
});
$('pauseBtn').addEventListener('pointerdown', e => {
  e.preventDefault();
  if (state === 'playing') pause(); else if (state === 'paused') resume();
});

// 게임판 위에서 밀어서(스와이프) 방향 바꾸기
let swipe = null;
canvas.addEventListener('pointerdown', e => { swipe = { x: e.clientX, y: e.clientY }; });
canvas.addEventListener('pointermove', e => {
  if (!swipe) return;
  const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
  turn(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  swipe = { x: e.clientX, y: e.clientY };
});
window.addEventListener('pointerup', () => { swipe = null; });

for (const [id, fn] of [['startBtn', start], ['retryBtn', start], ['resumeBtn', resume]]) {
  $(id).addEventListener('click', e => { e.currentTarget.blur(); fn(); });
}
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

// 알 안내 아이콘
document.querySelectorAll('.legend canvas').forEach(c => {
  const g = c.getContext('2d');
  drawEggAt(g, 0, 0, EGGS[Number(c.dataset.egg)], 3);
});

reset();
updateHud();
requestAnimationFrame(frame);
