const infoBtn = document.getElementById('infoBtn');
const instructionOverlay = document.getElementById('instructionOverlay');
const closeInstructionBtn = document.getElementById('closeInstructionBtn');
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const tauntOverlay = document.getElementById('tauntOverlay');
const closeTauntBtn = document.getElementById('closeTauntBtn');
const tauntVideo = document.getElementById('tauntVideo');
const tauntSound = document.getElementById('tauntSound');

const TILE_SIZE = 30; 
const COLS = 21;      
const ROWS = 21;      
canvas.width = COLS * TILE_SIZE;
canvas.height = ROWS * TILE_SIZE;

let map = [];
const VISION_RADIUS = 3.5; 
let isPaused = false; 
let currentLevel = 1; 
let actionAfterTaunt = null; // 記錄看完影片後要執行的動作

const player = { x: 1, y: 1, color: '#FF0000', hp: 5, isInvincible: false };

// 儲存隨機出口與陷阱的陣列
let levelExits = []; // 存放 5 個金黃色出口
let fakeExits = [];  // 存放 3 個隱形嘲諷陷阱

let monsters = [];
const MONSTER_COUNT = 5; 
let hearts = []; 
const MAX_HEARTS = 3; 

function initMap() {
    map = [];
    for (let y = 0; y < ROWS; y++) {
        let row = [];
        for (let x = 0; x < COLS; x++) { row.push(0); }
        map.push(row);
    }
}

function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

function generateMaze(cx, cy) {
    map[cy][cx] = 1;
    const directions = [ [0, -2], [2, 0], [0, 2], [-2, 0] ];
    shuffle(directions);

    for (let i = 0; i < directions.length; i++) {
        const dx = directions[i][0];
        const dy = directions[i][1];
        const nx = cx + dx;
        const ny = cy + dy;

        if (ny > 0 && ny < ROWS - 1 && nx > 0 && nx < COLS - 1 && map[ny][nx] === 0) {
            map[cy + dy / 2][cx + dx / 2] = 1;
            generateMaze(nx, ny);
        }
    }
}

// 核心配置：隨機配置 5 個出口與 3 個隱形陷阱
function spawnMapEntities() {
    levelExits = [];
    fakeExits = [];
    let deadEnds = [];
    
    for (let y = 1; y < ROWS - 1; y++) {
        for (let x = 1; x < COLS - 1; x++) {
            if (map[y][x] === 1 && !(x === 1 && y === 1)) {
                let paths = 0;
                if (map[y-1][x] === 1) paths++;
                if (map[y+1][x] === 1) paths++;
                if (map[y][x-1] === 1) paths++;
                if (map[y][x+1] === 1) paths++;

                if (paths === 1) deadEnds.push({x: x, y: y});
            }
        }
    }
    shuffle(deadEnds);

    // 定義 5 個金黃色出口的類型 (1真, 2換圖嘲諷, 2原地嘲諷)
    let exitTypes = ['true_exit', 'next_level_taunt', 'next_level_taunt', 'fake_taunt', 'fake_taunt'];
    
    for (let i = 0; i < 5; i++) {
        if (deadEnds.length > 0) {
            let pos = deadEnds.pop();
            levelExits.push({ x: pos.x, y: pos.y, type: exitTypes[i] });
        }
    }
    // 再打亂一次，讓真出口位置不可預測
    shuffle(levelExits);

    // 剩下的死胡同抽出 3 個作為隱形的嘲諷陷阱
    for (let i = 0; i < 3; i++) {
        if (deadEnds.length > 0) {
            let pos = deadEnds.pop();
            fakeExits.push({x: pos.x, y: pos.y});
        }
    }
}

function spawnMonsters() {
    monsters = [];
    while (monsters.length < MONSTER_COUNT) {
        let mx = Math.floor(Math.random() * COLS);
        let my = Math.floor(Math.random() * ROWS);
        let isExit = levelExits.some(e => e.x === mx && e.y === my);
        if (map[my][mx] === 1 && (Math.abs(mx - player.x) + Math.abs(my - player.y)) > 5 && !isExit) {
            monsters.push({ x: mx, y: my, color: '#00FF00' });
        }
    }
}

function spawnHeart() {
    if (isPaused || hearts.length >= MAX_HEARTS) return;
    let attempts = 0;
    while (attempts < 50) { 
        let hx = Math.floor(Math.random() * COLS);
        let hy = Math.floor(Math.random() * ROWS);
        let distance = Math.sqrt(Math.pow(hx - player.x, 2) + Math.pow(hy - player.y, 2));

        let isExit = levelExits.some(e => e.x === hx && e.y === hy);
        if (map[hy][hx] === 1 && distance > VISION_RADIUS && !isExit) {
            let occupied = hearts.some(h => h.x === hx && h.y === hy) || fakeExits.some(f => f.x === hx && f.y === hy);
            if (!occupied) {
                hearts.push({ x: hx, y: hy });
                break;
            }
        }
        attempts++;
    }
}

// 尋路檢測：確保 5 個出口「都沒有被堵死」
function isPathClear() {
    let queue = [{ x: player.x, y: player.y }];
    let visited = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
    visited[player.y][player.x] = true;
    const dirs = [ [0, -1], [1, 0], [0, 1], [-1, 0] ];
    
    let exitsFound = 0;

    while (queue.length > 0) {
        let curr = queue.shift();
        
        if (levelExits.some(e => e.x === curr.x && e.y === curr.y)) {
            exitsFound++;
            if (exitsFound === levelExits.length) return true; 
        }

        for (let d of dirs) {
            let nx = curr.x + d[0];
            let ny = curr.y + d[1];
            if (ny > 0 && ny < ROWS - 1 && nx > 0 && nx < COLS - 1) {
                if (map[ny][nx] === 1 && !visited[ny][nx]) {
                    visited[ny][nx] = true;
                    queue.push({ x: nx, y: ny });
                }
            }
        }
    }
    return exitsFound === levelExits.length; 
}

function mutateMaze() {
    if (isPaused) return; 
    let mutations = 0;
    let attempts = 0;
    while (mutations < 3 && attempts < 100) {
        let mx = Math.floor(Math.random() * (COLS - 2)) + 1;
        let my = Math.floor(Math.random() * (ROWS - 2)) + 1;
        let dist = Math.sqrt(Math.pow(mx - player.x, 2) + Math.pow(my - player.y, 2));

        if (dist > VISION_RADIUS) {
            if (map[my][mx] === 0) {
                map[my][mx] = 1;
                mutations++;
            } else if (map[my][mx] === 1) {
                let isOccupied = monsters.some(m => m.x === mx && m.y === my) ||
                                 hearts.some(h => h.x === mx && h.y === my) ||
                                 fakeExits.some(f => f.x === mx && f.y === my) ||
                                 levelExits.some(e => e.x === mx && e.y === my);
                
                if (!isOccupied) {
                    map[my][mx] = 0; 
                    if (isPathClear()) mutations++;
                    else map[my][mx] = 1; 
                }
            }
        }
        attempts++;
    }
}

function moveMonsters() {
    if (isPaused) return; 
    monsters.forEach(m => {
        const dirs = [ [0, -1], [1, 0], [0, 1], [-1, 0] ];
        const validDirs = dirs.filter(d => map[m.y + d[1]] !== undefined && map[m.y + d[1]][m.x + d[0]] === 1);
        if (validDirs.length > 0) {
            const move = validDirs[Math.floor(Math.random() * validDirs.length)];
            m.x += move[0];
            m.y += move[1];
        }
    });
    checkCollision();
}

function checkCollision() {
    if (player.isInvincible || isPaused) return; 

    for (let m of monsters) {
        if (m.x === player.x && m.y === player.y) {
            player.hp -= 1;
            if (player.hp <= 0) {
                alert("你死掉了！遊戲將從第一關重來。");
                resetGame();
                return;
            }
            player.isInvincible = true;
            setTimeout(() => { player.isInvincible = false; }, 1500);
            break; 
        }
    }
}

function checkItems() {
    for (let i = 0; i < hearts.length; i++) {
        if (hearts[i].x === player.x && hearts[i].y === player.y) {
            if (player.hp < 5) player.hp += 1;
            hearts.splice(i, 1);
            break;
        }
    }
}

function nextLevelSilently() {
    currentLevel++;
    player.x = 1;
    player.y = 1;
    hearts = [];
    isPaused = false; // 強制解除暫停
    initMap();
    generateMaze(1, 1);
    spawnMapEntities();
    spawnMonsters();
}

function checkExit() {
    for (let i = 0; i < levelExits.length; i++) {
        let ex = levelExits[i];
        if (player.x === ex.x && player.y === ex.y) {
            if (ex.type === 'true_exit') {
                window.location.href = "congratulations.html"; // 跳轉到破關頁面
            } else if (ex.type === 'next_level_taunt') {
                actionAfterTaunt = 'next_level'; 
                triggerTaunt();
                levelExits.splice(i, 1);
            } else if (ex.type === 'fake_taunt') {
                actionAfterTaunt = 'none'; 
                triggerTaunt();
                levelExits.splice(i, 1);
            }
            return; 
        }
    }
}

function checkFakeExits() {
    for (let i = 0; i < fakeExits.length; i++) {
        if (player.x === fakeExits[i].x && player.y === fakeExits[i].y) {
            actionAfterTaunt = 'none'; 
            triggerTaunt();
            fakeExits.splice(i, 1);
            break;
        }
    }
}

function triggerTaunt() {
    isPaused = true;
    tauntOverlay.classList.remove('hidden');
    if (tauntVideo) {
        tauntVideo.currentTime = 0; 
        tauntVideo.play().catch(e => console.log("影片被阻擋:", e));
    }
    if (tauntSound) {
        tauntSound.currentTime = 0; 
        tauntSound.play().catch(e => console.log("音效被阻擋:", e));
    }
}

// 統一的關閉與結算邏輯
function closeTauntUI() {
    if (!isPaused) return; 
    
    tauntOverlay.classList.add('hidden');
    if (tauntVideo) tauntVideo.pause();
    if (tauntSound) tauntSound.pause();

    let action = actionAfterTaunt;
    actionAfterTaunt = null; 

    if (action === 'next_level') {
        nextLevelSilently();
    } 
    
    isPaused = false; 
    window.focus(); // ⚠️ 強制奪回焦點，解決鍵盤失效問題
}

closeTauntBtn.addEventListener('click', closeTauntUI);
if (tauntVideo) {
    tauntVideo.addEventListener('ended', closeTauntUI); // 影片播完自動關閉
}
// --- 遊玩教學面板的控制邏輯 ---

// 點擊驚嘆號開啟教學
infoBtn.addEventListener('click', () => {
    isPaused = true; // 暫停遊戲（怪物停止移動）
    instructionOverlay.classList.remove('hidden');
});

// 點擊按鈕關閉教學
closeInstructionBtn.addEventListener('click', () => {
    instructionOverlay.classList.add('hidden');
    isPaused = false; // 恢復遊戲
    window.focus();   // 強制奪回焦點，確保 WASD 能立刻運作
});


function resetGame() {
    currentLevel = 1; 
    player.hp = 5;
    player.x = 1;
    player.y = 1;
    player.isInvincible = false;
    isPaused = false;
    tauntOverlay.classList.add('hidden');
    hearts = []; 
    initMap();
    generateMaze(1, 1);
    spawnMapEntities();
    spawnMonsters();
}

window.addEventListener('keydown', (e) => {
    // 遊戲暫停時，空白鍵或 Enter 可以直接關閉影片 UI
    if (isPaused) {
        if (e.key === 'Enter' || e.key === ' ') {
            closeTauntUI();
        }
        return; 
    }

    let nextX = player.x;
    let nextY = player.y;

    switch (e.key.toLowerCase()) {
        case 'w': nextY--; break;
        case 'a': nextX--; break;
        case 's': nextY++; break;
        case 'd': nextX++; break;
    }

    if (map[nextY] !== undefined && map[nextY][nextX] === 1) {
        player.x = nextX;
        player.y = nextY;
        
        checkItems();     
        checkCollision(); 
        checkExit();      
        checkFakeExits(); 
    }
});

function draw() {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
            const dx = Math.abs(x - player.x);
            const dy = Math.abs(y - player.y);
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance <= VISION_RADIUS) {
                if (map[y][x] === 0) {
                    ctx.fillStyle = '#222222'; 
                } else {
                    ctx.fillStyle = '#FFFFFF'; 
                }
                ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);

                // 畫出 5 個金黃色出口
                for (let ex of levelExits) {
                    if (x === ex.x && y === ex.y) {
                        ctx.fillStyle = '#FFD700';
                        let pulse = (Math.sin(Date.now() / 150) + 1) * 2; 
                        ctx.fillRect(x * TILE_SIZE + pulse, y * TILE_SIZE + pulse, TILE_SIZE - pulse * 2, TILE_SIZE - pulse * 2);
                    }
                }

                for (let h of hearts) {
                    if (h.x === x && h.y === y) {
                        ctx.fillStyle = '#FF69B4'; 
                        let pulse = (Math.sin(Date.now() / 200) + 1) * 2; 
                        ctx.fillRect(x * TILE_SIZE + pulse, y * TILE_SIZE + pulse, TILE_SIZE - pulse * 2, TILE_SIZE - pulse * 2);
                    }
                }

                for (let m of monsters) {
                    if (m.x === x && m.y === y) {
                        ctx.fillStyle = m.color;
                        ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                    }
                }
            }
        }
    }

    if (!player.isInvincible || Math.floor(Date.now() / 200) % 2 === 0) {
        ctx.fillStyle = player.color;
        ctx.fillRect(player.x * TILE_SIZE, player.y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    }

    ctx.fillStyle = "#FF4444";
    ctx.font = "20px Arial";
    ctx.fillText("HP: " + player.hp + "   關卡: " + currentLevel, 10, 25);
}

function gameLoop() {
    draw();
    requestAnimationFrame(gameLoop);
}

// 啟動遊戲
initMap();
generateMaze(1, 1); 
spawnMapEntities();
spawnMonsters();

setInterval(moveMonsters, 400); 
setInterval(spawnHeart, 5000); 
setInterval(mutateMaze, 3000); 

gameLoop();