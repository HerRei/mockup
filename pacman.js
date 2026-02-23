// main canvas setup
let board;
let ctx; // using ctx instead of context is more common

const tileSize = 32;
const speed = 4;
let isGameOver = false;

// The main entity class for pacman/ghosts/walls
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

    // only used by ghosts
    this.ai = undefined;
    this.pheromone = undefined; 
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

// helper to load images without callback hell
const loadImage = (src) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load: " + src));
    img.src = src;
  });
};

// X = wall, P = player
// G = A* ghost, B = BFS ghost, C = ACO ghost
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

const rows = tileMap.length;
const cols = Math.max(...tileMap.map(r => r.length));
const boardWidth = tileSize * cols;
const boardHeight = tileSize * rows;

const walls = new Set();
const ghosts = new Set();
let pacman = null;

// input handling
const keys = {
  ArrowUp: false,
  ArrowDown: false,
  ArrowLeft: false,
  ArrowRight: false
};
let lastKey = "";

window.addEventListener("keydown", (e) => {
  if (keys[e.key] !== undefined) {
    e.preventDefault();
    keys[e.key] = true;
    lastKey = e.key;
  }
  if (isGameOver && e.key === "Enter") location.reload();
}, { passive: false });

window.addEventListener("keyup", (e) => {
  if (keys[e.key] !== undefined) keys[e.key] = false;
});

window.onload = async () => {
  board = document.getElementById("board");
  board.width = boardWidth;
  board.height = boardHeight;

  ctx = board.getContext("2d");
  ctx.imageSmoothingEnabled = false; // keep it crispy

  try {
    const [playerImg, ghostPic, wallPic] = await Promise.all([
      loadImage("standing-up-man-.png"),
      loadImage("ghost.png"),
      loadImage("wall.png")
    ]);
    
    buildMap(playerImg, ghostPic, wallPic);
    // console.log("Loaded ghosts:", ghosts.size); // debug crumb
    
    gameLoop();
  } catch (err) {
    console.error("Error loading game assets", err);
  }
};

function buildMap(playerImg, ghostImg, wallImg) {
  walls.clear();
  ghosts.clear();
  pacman = null;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const char = tileMap[r][c] || " ";
      const x = c * tileSize;
      const y = r * tileSize;

      if (char === "X") {
        walls.add(new Block(wallImg, x, y, tileSize, tileSize));
      } else if (char === "P") {
        pacman = new Block(playerImg, x, y, tileSize, tileSize);
      } else if (["G", "B", "C"].includes(char)) {
        const g = new Block(ghostImg, x, y, tileSize, tileSize);
        // map chars to ai types
        g.ai = char === "G" ? "astar" : char === "B" ? "bfs" : "aco";
        if (g.ai === "aco") g.pheromone = new Map(); 
        ghosts.add(g);
      }
    }
  }

  // give ghosts a random initial nudge
  ghosts.forEach(g => {
    const opts = getValidMoves(g);
    if (opts.length > 0) {
      const pick = opts[Math.floor(Math.random() * opts.length)];
      g.velocityX = pick.x;
      g.velocityY = pick.y;
    }
  });
}

function gameLoop() {
  if (!isGameOver) {
    updatePlayer();
    
    ghosts.forEach(g => {
      moveGhost(g);
      if (pacman && checkCollision(pacman, g)) isGameOver = true;
    });
  }

  draw();

  if (!isGameOver) {
    setTimeout(gameLoop, 1000 / 20); // roughly 20fps
  }
}

function updatePlayer() {
  if (!pacman) return;

  if (keys.ArrowUp && lastKey === "ArrowUp") tryMove(pacman, 0, -speed);
  else if (keys.ArrowDown && lastKey === "ArrowDown") tryMove(pacman, 0, speed);
  else if (keys.ArrowLeft && lastKey === "ArrowLeft") tryMove(pacman, -speed, 0);
  else if (keys.ArrowRight && lastKey === "ArrowRight") tryMove(pacman, speed, 0);

  if (hitsWall(pacman, pacman.velocityX, pacman.velocityY)) {
    pacman.velocityX = 0;
    pacman.velocityY = 0;
  }

  pacman.x += pacman.velocityX;
  pacman.y += pacman.velocityY;
}

function getValidMoves(entity) {
  const dirs = [
    { x: speed, y: 0 },
    { x: -speed, y: 0 },
    { x: 0, y: speed },
    { x: 0, y: -speed }
  ];
  return dirs.filter(v => !hitsWall(entity, v.x, v.y));
}

function tryMove(entity, vx, vy) {
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

  if (!hitsWall(entity, vx, vy)) {
    entity.velocityX = vx;
    entity.velocityY = vy;
  }
}

function hitsWall(ent, vx, vy) {
  const nx = ent.x + vx;
  const ny = ent.y + vy;

  for (const w of walls) {
    if (
      nx < w.x + w.width &&
      nx + ent.width > w.x &&
      ny < w.y + w.height &&
      ny + ent.height > w.y
    ) return true;
  }
  return false;
}

function checkCollision(a, b) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

// grid helpers
function getTileAt(r, c) {
  return tileMap[r]?.[c] || "X";
}

function isWalkable(r, c) {
  return getTileAt(r, c) !== "X";
}

function getTileKey(r, c) {
  return `${r},${c}`; // cache key for maps
}

function getEntityTile(ent) {
  const c = Math.floor((ent.x + ent.width / 2) / tileSize);
  const r = Math.floor((ent.y + ent.height / 2) / tileSize);
  return { r, c };
}

function manhattan(a, b) {
  return Math.abs(a.r - b.r) + Math.abs(a.c - b.c);
}

function getNeighbors(t) {
  const out = [
    { r: t.r + 1, c: t.c },
    { r: t.r - 1, c: t.c },
    { r: t.r, c: t.c + 1 },
    { r: t.r, c: t.c - 1 }
  ];
  return out.filter(n => isWalkable(n.r, n.c));
}

function buildPath(cameFrom, goalKey) {
  const path = [];
  let current = goalKey;

  while (current) {
    const [r, c] = current.split(",").map(Number);
    path.push({ r, c });
    current = cameFrom.get(current);
  }

  return path.reverse();
}

// A* pathfinding
function findAStar(start, goal) {
  const startKey = getTileKey(start.r, start.c);
  const goalKey = getTileKey(goal.r, goal.c);
  
  if (startKey === goalKey) return [start];

  const openList = [startKey];
  const openSet = new Set([startKey]);

  const cameFrom = new Map();
  const gScore = new Map([[startKey, 0]]);
  const fScore = new Map([[startKey, manhattan(start, goal)]]);

  while (openList.length > 0) {
    let bestIdx = 0;
    let bestF = fScore.get(openList[0]) || Infinity;

    for (let i = 1; i < openList.length; i++) {
      const f = fScore.get(openList[i]) || Infinity;
      if (f < bestF) {
        bestF = f;
        bestIdx = i;
      }
    }

    const currentKey = openList.splice(bestIdx, 1)[0];
    openSet.delete(currentKey);

    if (currentKey === goalKey) return buildPath(cameFrom, goalKey);

    const [r, c] = currentKey.split(",").map(Number);
    const curG = gScore.get(currentKey) || Infinity;

    for (const nb of getNeighbors({r, c})) {
      const nbKey = getTileKey(nb.r, nb.c);
      const tentative = curG + 1;

      if (tentative < (gScore.get(nbKey) || Infinity)) {
        cameFrom.set(nbKey, currentKey);
        gScore.set(nbKey, tentative);
        fScore.set(nbKey, tentative + manhattan(nb, goal));

        if (!openSet.has(nbKey)) {
          openList.push(nbKey);
          openSet.add(nbKey);
        }
      }
    }
  }
  return null;
}

// Breadth First Search 
function findBfs(start, goal) {
  const startKey = getTileKey(start.r, start.c);
  const goalKey = getTileKey(goal.r, goal.c);
  if (startKey === goalKey) return [start];

  const queue = [start];
  let qIdx = 0; // faster than shift()

  const visited = new Set([startKey]);
  const cameFrom = new Map();

  while (qIdx < queue.length) {
    const cur = queue[qIdx++];
    const curKey = getTileKey(cur.r, cur.c);

    if (curKey === goalKey) return buildPath(cameFrom, goalKey);

    for (const nb of getNeighbors(cur)) {
      const nbKey = getTileKey(nb.r, nb.c);
      if (visited.has(nbKey)) continue;

      visited.add(nbKey);
      cameFrom.set(nbKey, curKey);
      queue.push(nb);
    }
  }
  return null;
}

// experimenting with Ant Colony Optimization here. 
// Note: not a true academic implementation, but "ant-like" exploration + pheromone memory.
// Falls back to BFS if it can't find a path quickly.
function findAco(ghost, start, goal) {
  const pher = ghost.pheromone || (ghost.pheromone = new Map());

  // tweak these constants later if needed
  const alpha = 1.0;   
  const beta = 2.8;    
  const rho = 0.22;    
  const Q = 35;        

  const startKey = getTileKey(start.r, start.c);
  const goalKey = getTileKey(goal.r, goal.c);
  
  if (startKey === goalKey) return [start];

  const edgeKey = (a, b) => `${a}|${b}`;
  const tau = (a, b) => pher.get(edgeKey(a, b)) || 1.0;

  function evaporate() {
    for (const [k, v] of pher.entries()) {
      const nv = v * (1 - rho);
      if (nv < 0.01) pher.delete(k); // cleanup
      else pher.set(k, nv);
    }
  }

  function deposit(path) {
    const cost = path.length - 1;
    if (cost <= 0) return;
    const add = Q / cost;

    for (let i = 0; i < path.length - 1; i++) {
      const aKey = getTileKey(path[i].r, path[i].c);
      const bKey = getTileKey(path[i+1].r, path[i+1].c);
      const key = edgeKey(aKey, bKey);
      pher.set(key, (pher.get(key) || 1.0) + add);
    }
  }

  function getWeightedNext(cur, tgt, seenSet) {
    const nbs = getNeighbors(cur);
    if (!nbs.length) return null;

    const curKey = getTileKey(cur.r, cur.c);
    let sum = 0;
    const items = [];

    for (const nb of nbs) {
      const nbKey = getTileKey(nb.r, nb.c);
      const eta = 1 / (manhattan(nb, tgt) + 1);

      let w = Math.pow(tau(curKey, nbKey), alpha) * Math.pow(eta, beta);
      if (seenSet.has(nbKey)) w *= 0.05; // punish backtracking

      items.push({ nb, w });
      sum += w;
    }

    if (sum <= 0) return nbs[Math.floor(Math.random() * nbs.length)];

    let rand = Math.random() * sum;
    for (const item of items) {
      rand -= item.w;
      if (rand <= 0) return item.nb;
    }
    return items[items.length - 1].nb;
  }

  let best = null;
  let bestCost = Infinity;

  for (let it = 0; it < 6; it++) {
    let bestIter = null;
    let bestIterCost = Infinity;

    for (let ant = 0; ant < 16; ant++) {
      let cur = start;
      const path = [cur];
      const seen = new Set([startKey]);
      let reached = false;

      for (let step = 0; step < 80; step++) {
        const curKey = getTileKey(cur.r, cur.c);
        if (curKey === goalKey) { reached = true; break; }

        const next = getWeightedNext(cur, goal, seen);
        if (!next) break;

        cur = next;
        const nk = getTileKey(cur.r, cur.c);
        path.push(cur);
        seen.add(nk);

        if (nk === goalKey) { reached = true; break; }
      }

      if (reached) {
        const cost = path.length - 1;
        if (cost < bestIterCost) {
          bestIterCost = cost;
          bestIter = [...path];
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

// figure out where the ghost is going based on its type
function moveGhost(ghost) {
  // wait until we are aligned with the grid to pick a new direction
  if (ghost.x % tileSize === 0 && ghost.y % tileSize === 0) {
    let handled = false;

    if (pacman) {
      const start = getEntityTile(ghost);
      const goal = getEntityTile(pacman);
      let path = null;

      if (ghost.ai === "bfs") {
        path = findBfs(start, goal);
      } else if (ghost.ai === "aco") {
        path = findAco(ghost, start, goal) || findBfs(start, goal);
      } else {
        path = findAStar(start, goal);
      }

      if (path && path.length > 1) {
        const next = path[1];
        const dx = next.c - start.c;
        const dy = next.r - start.r;

        tryMove(ghost, dx * speed, dy * speed);
        handled = true;
      }
    }

    // random fallback from the tutorial
    if (!handled) {
      const options = getValidMoves(ghost);

      if (options.length > 0) {
        const revX = -ghost.velocityX;
        const revY = -ghost.velocityY;

        let candidates = options;
        // try not to reverse direction unless it's a dead end
        if (options.length > 1) {
          const filtered = options.filter(v => !(v.x === revX && v.y === revY));
          if (filtered.length) candidates = filtered;
        }

        const pick = candidates[Math.floor(Math.random() * candidates.length)];
        tryMove(ghost, pick.x, pick.y);
      }
    }
  }

  if (hitsWall(ghost, ghost.velocityX, ghost.velocityY)) {
    ghost.velocityX = 0;
    ghost.velocityY = 0;
    return;
  }

  ghost.x += ghost.velocityX;
  ghost.y += ghost.velocityY;
}

// render loop
function draw() {
  ctx.fillStyle = "rgb(123, 112, 112)";
  ctx.fillRect(0, 0, boardWidth, boardHeight);

  walls.forEach(w => ctx.drawImage(w.image, w.x, w.y, w.width, w.height));
  ghosts.forEach(g => ctx.drawImage(g.image, g.x, g.y, g.width, g.height));
  if (pacman) ctx.drawImage(pacman.image, pacman.x, pacman.y, pacman.width, pacman.height);

  if (isGameOver) {
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(0, 0, boardWidth, boardHeight);

    ctx.fillStyle = "white";
    ctx.textAlign = "center";
    ctx.font = "48px sans-serif";
    ctx.fillText("GAME OVER", boardWidth / 2, boardHeight / 2);

    ctx.font = "20px sans-serif";
    ctx.fillText("Press Enter to restart", boardWidth / 2, boardHeight / 2 + 40);
  }
}