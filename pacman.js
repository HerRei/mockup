// ===== Canvas / Board =====
let board;
let context;

const tileSize = 32;
const speed = 4; // pixels per frame
let gameOver = false;

// ===== Images =====
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load: " + src));
    img.src = src;
  });
}

// ===== Map =====
// X = wall
// P = player
// G = ghost (A*)
// B = ghost (BFS)
// C = ghost (ACO)
const tileMap = [
  "XXXXXXXXXXXXXXXXXXX",
  "X        X        X",
  "X XX XXX X XXX XX X",
  "X        C        X",
  "X XX X XXXXX X XX X",
  "X    X       X    X",
  "XXXX XXXX XXXX XXXX",
  "OOOX X       X XOOO",
  "XXXX X XXrXX X XXXX",
  "X        G        X",
  "XXXX X XXXXX X XXXX",
  "XOO      B      OOX",
  "XXXX X XXXXX X XXXX",
  "X        X        X",
  "X XX XXX X XXX XX X",
  "X  X     P     X  X",
  "XX X X XXXXX X X XX",
  "X    X   X   X    X",
  "X XXXXXX X XXXXXX X",
  "X                 X",
  "XXXXXXXXXXXXXXXXXXX"
];

const rowCount = tileMap.length;
const columnCount = Math.max(...tileMap.map(r => r.length));
const boardWidth = tileSize * columnCount;
const boardHeight = tileSize * rowCount;

// ===== Entities =====
const walls = new Set();
const ghosts = new Set();
let pacman = null;

// ===== Input =====
const keys = {
  ArrowUp: { pressed: false },
  ArrowDown: { pressed: false },
  ArrowLeft: { pressed: false },
  ArrowRight: { pressed: false }
};
let lastKey = "";

addEventListener(
  "keydown",
  (e) => {
    if (e.key in keys) {
      e.preventDefault();
      keys[e.key].pressed = true;
      lastKey = e.key;
    }
    if (gameOver && e.key === "Enter") location.reload();
  },
  { passive: false }
);

addEventListener("keyup", (e) => {
  if (e.key in keys) keys[e.key].pressed = false;
});

// ===== Init =====
window.onload = async function () {
  board = document.getElementById("board");
  board.width = boardWidth;
  board.height = boardHeight;

  context = board.getContext("2d");
  context.imageSmoothingEnabled = false;

  let humanImg, ghostImg, wallImg;
  try {
    [humanImg, ghostImg, wallImg] = await Promise.all([
      loadImage("standing-up-man-.png"),
      loadImage("ghost.png"),
      loadImage("wall.png")
    ]);
  } catch (err) {
    console.error(err);
    return;
  }

  loadMap(humanImg, ghostImg, wallImg);

  // quick sanity check:
  // console.log("ghosts:", ghosts.size, [...ghosts].map(g => g.ai));

  update();
};

// ===== Map Loader =====
function loadMap(humanImg, ghostImg, wallImg) {
  walls.clear();
  ghosts.clear();
  pacman = null;

  for (let r = 0; r < rowCount; r++) {
    for (let c = 0; c < columnCount; c++) {
      const ch = tileMap[r][c] ?? " ";
      const x = c * tileSize;
      const y = r * tileSize;

      if (ch === "X") {
        walls.add(new Block(wallImg, x, y, tileSize, tileSize));
      } else if (ch === "P") {
        pacman = new Block(humanImg, x, y, tileSize, tileSize);
      } else if (ch === "G" || ch === "B" || ch === "C") {
        const g = new Block(ghostImg, x, y, tileSize, tileSize);
        g.ai = ch === "G" ? "astar" : ch === "B" ? "bfs" : "aco";
        g.pheromone = new Map(); // used by ACO ghost, harmless for others
        ghosts.add(g);
      }
    }
  }

  ghosts.forEach(g => {
    const opts = getValidVelocities(g);
    if (opts.length) {
      const pick = opts[Math.floor(Math.random() * opts.length)];
      g.velocityX = pick.x;
      g.velocityY = pick.y;
    }
  });
}

// ===== Game Loop =====
function update() {
  if (!gameOver) {
    updatePlayer();
    updateGhosts();
  }

  draw();

  if (!gameOver) setTimeout(update, 1000 / 20);
}

function updatePlayer() {
  if (!pacman) return;

  if (keys.ArrowUp.pressed && lastKey === "ArrowUp") {
    trySetVelocity(pacman, 0, -speed);
  } else if (keys.ArrowDown.pressed && lastKey === "ArrowDown") {
    trySetVelocity(pacman, 0, speed);
  } else if (keys.ArrowLeft.pressed && lastKey === "ArrowLeft") {
    trySetVelocity(pacman, -speed, 0);
  } else if (keys.ArrowRight.pressed && lastKey === "ArrowRight") {
    trySetVelocity(pacman, speed, 0);
  }

  if (wouldHitWall(pacman, pacman.velocityX, pacman.velocityY)) {
    pacman.velocityX = 0;
    pacman.velocityY = 0;
  }

  pacman.x += pacman.velocityX;
  pacman.y += pacman.velocityY;
}

function updateGhosts() {
  ghosts.forEach(g => {
    moveGhost(g);
    if (pacman && rectsOverlap(pacman, g)) gameOver = true;
  });
}

// ===== Movement / Collision =====
function getValidVelocities(entity) {
  const dirs = [
    { x: speed, y: 0 },
    { x: -speed, y: 0 },
    { x: 0, y: speed },
    { x: 0, y: -speed }
  ];
  return dirs.filter(v => !wouldHitWall(entity, v.x, v.y));
}

function trySetVelocity(entity, vx, vy) {
  // snap-to-grid like the tutorial
  if (vx === 0) {
    const targetX = Math.round(entity.x / tileSize) * tileSize;
    if (Math.abs(entity.x - targetX) <= speed) entity.x = targetX;
    else return;
  } else {
    const targetY = Math.round(entity.y / tileSize) * tileSize;
    if (Math.abs(entity.y - targetY) <= speed) entity.y = targetY;
    else return;
  }

  if (!wouldHitWall(entity, vx, vy)) {
    entity.velocityX = vx;
    entity.velocityY = vy;
  }
}

function wouldHitWall(entity, vx, vy) {
  const nx = entity.x + vx;
  const ny = entity.y + vy;

  for (const w of walls) {
    if (
      nx < w.x + w.width &&
      nx + entity.width > w.x &&
      ny < w.y + w.height &&
      ny + entity.height > w.y
    ) return true;
  }
  return false;
}

function rectsOverlap(a, b) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

// ===== Tile helpers for pathfinding =====
function tileAt(r, c) {
  const row = tileMap[r];
  if (!row) return "X";
  return row[c] ?? "X";
}

function isWalkable(r, c) {
  return tileAt(r, c) !== "X";
}

function tileKey(r, c) {
  return `${r},${c}`;
}

function entityToTile(entity) {
  const c = Math.floor((entity.x + entity.width / 2) / tileSize);
  const r = Math.floor((entity.y + entity.height / 2) / tileSize);
  return { r, c };
}

function manhattan(a, b) {
  return Math.abs(a.r - b.r) + Math.abs(a.c - b.c);
}

function neighborsOf(t) {
  const out = [
    { r: t.r + 1, c: t.c },
    { r: t.r - 1, c: t.c },
    { r: t.r, c: t.c + 1 },
    { r: t.r, c: t.c - 1 }
  ];
  return out.filter(n => isWalkable(n.r, n.c));
}

function reconstructPath(cameFrom, goalK) {
  const path = [];
  let cur = goalK;

  while (cur) {
    const [r, c] = cur.split(",").map(Number);
    path.push({ r, c });
    cur = cameFrom.get(cur);
  }

  path.reverse();
  return path;
}

// ===== A* =====
function aStar(start, goal) {
  const startK = tileKey(start.r, start.c);
  const goalK = tileKey(goal.r, goal.c);
  if (startK === goalK) return [start];

  const open = [startK];
  const openSet = new Set([startK]);

  const cameFrom = new Map();
  const gScore = new Map([[startK, 0]]);
  const fScore = new Map([[startK, manhattan(start, goal)]]);

  function parseKey(k) {
    const [r, c] = k.split(",").map(Number);
    return { r, c };
  }

  while (open.length) {
    let bestIdx = 0;
    let bestF = fScore.get(open[0]) ?? Infinity;

    for (let i = 1; i < open.length; i++) {
      const f = fScore.get(open[i]) ?? Infinity;
      if (f < bestF) {
        bestF = f;
        bestIdx = i;
      }
    }

    const currentK = open.splice(bestIdx, 1)[0];
    openSet.delete(currentK);

    if (currentK === goalK) return reconstructPath(cameFrom, goalK);

    const cur = parseKey(currentK);
    const curG = gScore.get(currentK) ?? Infinity;

    for (const nb of neighborsOf(cur)) {
      const nbK = tileKey(nb.r, nb.c);
      const tentative = curG + 1;

      if (tentative < (gScore.get(nbK) ?? Infinity)) {
        cameFrom.set(nbK, currentK);
        gScore.set(nbK, tentative);
        fScore.set(nbK, tentative + manhattan(nb, goal));

        if (!openSet.has(nbK)) {
          open.push(nbK);
          openSet.add(nbK);
        }
      }
    }
  }

  return null;
}

// ===== BFS =====
function bfs(start, goal) {
  const startK = tileKey(start.r, start.c);
  const goalK = tileKey(goal.r, goal.c);
  if (startK === goalK) return [start];

  const q = [start];
  let qi = 0;

  const visited = new Set([startK]);
  const cameFrom = new Map();

  while (qi < q.length) {
    const cur = q[qi++];
    const curK = tileKey(cur.r, cur.c);

    if (curK === goalK) return reconstructPath(cameFrom, goalK);

    for (const nb of neighborsOf(cur)) {
      const nbK = tileKey(nb.r, nb.c);
      if (visited.has(nbK)) continue;

      visited.add(nbK);
      cameFrom.set(nbK, curK);
      q.push(nb);
    }
  }

  return null;
}

// ===== ACO (heuristic / lightweight) =====
// Not a full academic ACO, but "ant-like" exploration + pheromone memory.
// Falls back to BFS if it doesn't find a goal path quickly.
function acoFindPath(ghost, start, goal) {
  const pher = ghost.pheromone ?? (ghost.pheromone = new Map());

  const alpha = 1.0;   // pheromone weight
  const beta = 2.8;    // heuristic (distance) weight
  const rho = 0.22;    // evaporation
  const Q = 35;        // deposit strength

  const ants = 16;
  const iterations = 6;
  const maxSteps = 80;

  const startK = tileKey(start.r, start.c);
  const goalK = tileKey(goal.r, goal.c);
  if (startK === goalK) return [start];

  const edgeKey = (aK, bK) => `${aK}|${bK}`;
  const tau = (aK, bK) => pher.get(edgeKey(aK, bK)) ?? 1.0;

  function evaporate() {
    for (const [k, v] of pher.entries()) {
      const nv = v * (1 - rho);
      if (nv < 0.01) pher.delete(k);
      else pher.set(k, nv);
    }
  }

  function deposit(path) {
    const cost = path.length - 1;
    if (cost <= 0) return;
    const add = Q / cost;

    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i];
      const b = path[i + 1];
      const aK = tileKey(a.r, a.c);
      const bK = tileKey(b.r, b.c);
      const k = edgeKey(aK, bK);
      pher.set(k, (pher.get(k) ?? 1.0) + add);
    }
  }

  function weightedNext(cur, goal, seen) {
    const nbs = neighborsOf(cur);
    if (!nbs.length) return null;

    const curK2 = tileKey(cur.r, cur.c);

    let sum = 0;
    const items = [];

    for (const nb of nbs) {
      const nbK = tileKey(nb.r, nb.c);
      const eta = 1 / (manhattan(nb, goal) + 1);

      let w = Math.pow(tau(curK2, nbK), alpha) * Math.pow(eta, beta);
      if (seen.has(nbK)) w *= 0.05; // avoid loops

      items.push({ nb, w });
      sum += w;
    }

    if (sum <= 0) return nbs[Math.floor(Math.random() * nbs.length)];

    let r = Math.random() * sum;
    for (const it of items) {
      r -= it.w;
      if (r <= 0) return it.nb;
    }
    return items[items.length - 1].nb;
  }

  let best = null;
  let bestCost = Infinity;

  for (let it = 0; it < iterations; it++) {
    let bestIter = null;
    let bestIterCost = Infinity;

    for (let a = 0; a < ants; a++) {
      let cur = start;
      const path = [cur];
      const seen = new Set([startK]);

      let reached = false;

      for (let step = 0; step < maxSteps; step++) {
        const curK2 = tileKey(cur.r, cur.c);
        if (curK2 === goalK) { reached = true; break; }

        const nxt = weightedNext(cur, goal, seen);
        if (!nxt) break;

        cur = nxt;
        const nk = tileKey(cur.r, cur.c);
        path.push(cur);
        seen.add(nk);

        if (nk === goalK) { reached = true; break; }
      }

      if (reached) {
        const cost = path.length - 1;
        if (cost < bestIterCost) {
          bestIterCost = cost;
          bestIter = path.slice();
        }
      }
    }

    evaporate();
    if (bestIter) deposit(bestIter);

    if (bestIter && bestIterCost < bestCost) {
      bestCost = bestIterCost;
      best = bestIter;
    }
  }

  return best;
}

// ===== Ghost movement dispatcher =====
function moveGhost(g) {
  // choose direction only when aligned to tile grid
  if (g.x % tileSize === 0 && g.y % tileSize === 0) {
    let didPick = false;

    if (pacman) {
      const start = entityToTile(g);
      const goal = entityToTile(pacman);

      let path = null;

      if (g.ai === "bfs") {
        path = bfs(start, goal);
      } else if (g.ai === "aco") {
        path = acoFindPath(g, start, goal);
        if (!path) path = bfs(start, goal);
      } else {
        path = aStar(start, goal);
      }

      if (path && path.length >= 2) {
        const next = path[1];
        const dx = next.c - start.c;
        const dy = next.r - start.r;

        trySetVelocity(g, dx * speed, dy * speed);
        didPick = true;
      }
    }

    // fallback (keeps the vibe from the tutorial)
    if (!didPick) {
      const options = getValidVelocities(g);

      if (options.length) {
        const revX = -g.velocityX;
        const revY = -g.velocityY;

        let candidates = options;
        if (options.length > 1) {
          const filtered = options.filter(v => !(v.x === revX && v.y === revY));
          if (filtered.length) candidates = filtered;
        }

        const pick = candidates[Math.floor(Math.random() * candidates.length)];
        trySetVelocity(g, pick.x, pick.y);
      }
    }
  }

  if (wouldHitWall(g, g.velocityX, g.velocityY)) {
    g.velocityX = 0;
    g.velocityY = 0;
    return;
  }

  g.x += g.velocityX;
  g.y += g.velocityY;
}

// ===== Draw =====
function draw() {
  context.fillStyle = "rgb(123, 112, 112)";
  context.fillRect(0, 0, boardWidth, boardHeight);

  walls.forEach(w => context.drawImage(w.image, w.x, w.y, w.width, w.height));
  ghosts.forEach(g => context.drawImage(g.image, g.x, g.y, g.width, g.height));
  if (pacman) context.drawImage(pacman.image, pacman.x, pacman.y, pacman.width, pacman.height);

  if (gameOver) {
    context.fillStyle = "rgba(0,0,0,0.6)";
    context.fillRect(0, 0, boardWidth, boardHeight);

    context.fillStyle = "white";
    context.textAlign = "center";
    context.font = "48px sans-serif";
    context.fillText("GAME OVER", boardWidth / 2, boardHeight / 2);

    context.font = "20px sans-serif";
    context.fillText("Press Enter to restart", boardWidth / 2, boardHeight / 2 + 40);
  }
}

// ===== Block class (from the tutorial vibe) =====
class Block {
  constructor(image, x, y, width, height) {
    this.image = image;
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;

    this.startX = x;
    this.startY = y;

    this.direction = "R";
    this.velocityX = 0;
    this.velocityY = 0;

    // ghost-only
    this.ai = undefined;
    this.pheromone = undefined;
  }

  updateDirection() {
    this.direction = this.direction;
    this.updateVelocity();
  }

  updateVelocity() {
    if (this.direction === "U") {
      this.velocityX = 0;
      this.velocityY = -speed;
    } else if (this.direction === "D") {
      this.velocityX = 0;
      this.velocityY = speed;
    } else if (this.direction === "L") {
      this.velocityX = -speed;
      this.velocityY = 0;
    } else if (this.direction === "R") {
      this.velocityX = speed;
      this.velocityY = 0;
    }
  }
}