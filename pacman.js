// ======= board / canvas =======
let board;
const tileSize = 32;
let context;

// ======= images =======
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load: " + src));
    img.src = src;
  });
}

// ======= map =======
// Legend:
// X = wall
// P = player
// G = ghost (A*)
// B = ghost (BFS)
const tileMap = [
  "XXXXXXXXXXXXXXXXXXX",
  "X        X        X",
  "X XX XXX X XXX XX X",
  "X                 X",
  "X XX X XXXXX X XX X",
  "X    X   G    X    X",
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

// ======= entities =======
const walls = new Set();
const ghosts = new Set();
let pacman;

// ======= input =======
const keys = {
  ArrowUp: { pressed: false },
  ArrowDown: { pressed: false },
  ArrowLeft: { pressed: false },
  ArrowRight: { pressed: false }
};
let lastKey = "";

// movement speed in pixels per frame
const speed = 4;

let gameOver = false;

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

// ======= init =======
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
  } catch (e) {
    console.error(e);
    return;
  }

  loadMap(humanImg, ghostImg, wallImg);

  update(); // 20fps via setTimeout below
};

// ======= map loading =======
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
      } else if (ch === "G") {
        const g = new Block(ghostImg, x, y, tileSize, tileSize);
        g.velocityX = 0;
        g.velocityY = 0;
        g.ai = "astar";
        ghosts.add(g);
      } else if (ch === "B") {
        const g = new Block(ghostImg, x, y, tileSize, tileSize);
        g.velocityX = 0;
        g.velocityY = 0;
        g.ai = "bfs";
        ghosts.add(g);
      } else if (ch === "P") {
        pacman = new Block(humanImg, x, y, tileSize, tileSize);
        pacman.velocityX = 0;
        pacman.velocityY = 0;
      }
    }
  }

  // give ghosts an initial direction (they'll re-decide at next tile)
  ghosts.forEach(g => {
    const opts = getValidVelocities(g);
    if (opts.length) {
      const pick = opts[Math.floor(Math.random() * opts.length)];
      g.velocityX = pick.x;
      g.velocityY = pick.y;
    }
  });
}

// ======= game loop =======
function update() {
  if (!gameOver) {
    // --- player movement ---
    if (pacman) {
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

    // --- ghosts movement ---
    ghosts.forEach(g => {
      moveGhost(g);
      if (pacman && rectsOverlap(pacman, g)) gameOver = true;
    });
  }

  draw();

  if (!gameOver) setTimeout(update, 1000 / 20);
}

// ======= tile helpers (for pathfinding) =======
function tileAt(r, c) {
  const row = tileMap[r];
  if (!row) return "X";
  const ch = row[c];
  return ch ?? "X";
}

function isWalkable(r, c) {
  // everything except X is walkable
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

function reconstructPath(cameFrom, goalKey) {
  const out = [];
  let cur = goalKey;
  while (cur) {
    const [r, c] = cur.split(",").map(Number);
    out.push({ r, c });
    cur = cameFrom.get(cur);
  }
  out.reverse();
  return out;
}

// ======= A* (4-neighbor) =======
function aStar(start, goal) {
  const startK = tileKey(start.r, start.c);
  const goalK = tileKey(goal.r, goal.c);

  if (startK === goalK) return [start];

  const open = [startK];
  const openSet = new Set([startK]);

  const cameFrom = new Map(); // key -> previousKey
  const gScore = new Map([[startK, 0]]);
  const fScore = new Map([[startK, manhattan(start, goal)]]);

  const parseKey = (k) => {
    const [r, c] = k.split(",").map(Number);
    return { r, c };
  };

  while (open.length) {
    // pick node with lowest fScore (linear scan ok for small grid)
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

    if (currentK === goalK) {
      return reconstructPath(cameFrom, goalK);
    }

    const cur = parseKey(currentK);
    const curG = gScore.get(currentK) ?? Infinity;

    const neighbors = [
      { r: cur.r + 1, c: cur.c },
      { r: cur.r - 1, c: cur.c },
      { r: cur.r, c: cur.c + 1 },
      { r: cur.r, c: cur.c - 1 }
    ];

    for (const nb of neighbors) {
      if (!isWalkable(nb.r, nb.c)) continue;

      const nbK = tileKey(nb.r, nb.c);
      const tentativeG = curG + 1;

      if (tentativeG < (gScore.get(nbK) ?? Infinity)) {
        cameFrom.set(nbK, currentK);
        gScore.set(nbK, tentativeG);
        fScore.set(nbK, tentativeG + manhattan(nb, goal));

        if (!openSet.has(nbK)) {
          open.push(nbK);
          openSet.add(nbK);
        }
      }
    }
  }

  return null;
}

// ======= BFS (4-neighbor shortest path) =======
function bfs(start, goal) {
  const startK = tileKey(start.r, start.c);
  const goalK = tileKey(goal.r, goal.c);
  if (startK === goalK) return [start];

  const queue = [start];
  let qi = 0;

  const visited = new Set([startK]);
  const cameFrom = new Map(); // key -> previousKey

  while (qi < queue.length) {
    const cur = queue[qi++];
    const curK = tileKey(cur.r, cur.c);

    if (curK === goalK) {
      return reconstructPath(cameFrom, goalK);
    }

    const neighbors = [
      { r: cur.r + 1, c: cur.c },
      { r: cur.r - 1, c: cur.c },
      { r: cur.r, c: cur.c + 1 },
      { r: cur.r, c: cur.c - 1 }
    ];

    for (const nb of neighbors) {
      if (!isWalkable(nb.r, nb.c)) continue;

      const nbK = tileKey(nb.r, nb.c);
      if (visited.has(nbK)) continue;

      visited.add(nbK);
      cameFrom.set(nbK, curK);
      queue.push(nb);
    }
  }

  return null;
}

// ======= ghost movement (A* or BFS) =======
function moveGhost(g) {
  // decide only on tile centers
  if (g.x % tileSize === 0 && g.y % tileSize === 0) {
    let usedPathing = false;

    if (pacman) {
      const start = entityToTile(g);
      const goal = entityToTile(pacman);

      const path = (g.ai === "bfs") ? bfs(start, goal) : aStar(start, goal);

      if (path && path.length >= 2) {
        const next = path[1];
        const dx = next.c - start.c;
        const dy = next.r - start.r;
        trySetVelocity(g, dx * speed, dy * speed);
        usedPathing = true;
      }
    }

    // fallback random movement
    if (!usedPathing) {
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

// ======= movement helpers =======
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
  // snap-to-grid for clean turns
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

// ======= drawing =======
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

// ======= Block class =======
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

    // "astar" or "bfs" (set during map load for ghosts)
    this.ai = undefined;
  }

  updateDirection() {
    this.direction = this.direction;
    this.updateVelocity();
  }

  updateVelocity() {
    if (this.direction == "U") {
      this.velocityX = 0;
      this.velocityY = -speed;
    } else if (this.direction == "D") {
      this.velocityX = 0;
      this.velocityY = speed;
    } else if (this.direction == "L") {
      this.velocityX = -speed;
      this.velocityY = 0;
    } else if (this.direction == "R") {
      this.velocityX = speed;
      this.velocityY = 0;
    }
  }
}