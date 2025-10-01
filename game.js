const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

// --- UI Elements ---
const livesSpan = document.getElementById('lives');
const moneySpan = document.getElementById('money');
const waveSpan = document.getElementById('wave');
const startWaveBtn = document.getElementById('start-wave-btn');
const shopPanel = document.getElementById('shop-panel');
const upgradePanel = document.getElementById('upgrade-panel');
const upgradeBtn = document.getElementById('upgrade-btn');
const sellBtn = document.getElementById('sell-btn');
const closeUpgradePanelBtn = document.getElementById('close-upgrade-panel-btn');

// --- Game State ---
let lives = 20;
let money = 150;
let wave = 0;
let selectedTowerType = null;
let inspectedTower = null;
let waveInProgress = false;

const enemies = [];
const towers = [];
const projectiles = [];

// --- TOWER CONFIGURATION ---
const TOWER_TYPES = {
    1: { name: 'Basic', color: '#0099cc', levels: [
        { cost: 50, damage: 25, range: 150, cooldown: 1000 },
        { cost: 40, damage: 50, range: 165, cooldown: 950 },
        { cost: 80, damage: 100, range: 180, cooldown: 900 }
    ]},
    2: { name: 'Machine Gun', color: '#f1c40f', levels: [
        { cost: 75, damage: 15, range: 125, cooldown: 400 },
        { cost: 60, damage: 25, range: 135, cooldown: 350 },
        { cost: 120, damage: 40, range: 145, cooldown: 300 }
    ]},
    3: { name: 'Cannon', color: '#34495e', levels: [
        { cost: 125, damage: 110, range: 175, cooldown: 2500 },
        { cost: 100, damage: 250, range: 190, cooldown: 2400 },
        { cost: 200, damage: 500, range: 210, cooldown: 2300 }
    ]},
    4: { name: 'Frost', color: '#3498db', levels: [
        { cost: 90, damage: 10, range: 140, cooldown: 1500, slow: { factor: 0.5, duration: 1500 } },
        { cost: 70, damage: 20, range: 150, cooldown: 1400, slow: { factor: 0.4, duration: 2000 } },
        { cost: 140, damage: 30, range: 160, cooldown: 1300, slow: { factor: 0.3, duration: 2500 } }
    ]},
    5: { name: 'Mortar', color: '#e67e22', levels: [
        { cost: 150, damage: 70, range: 250, cooldown: 4000, splash: 40 },
        { cost: 125, damage: 120, range: 275, cooldown: 3800, splash: 50 },
        { cost: 250, damage: 200, range: 300, cooldown: 3600, splash: 60 }
    ]},
};

// --- Game Board ---
const path = [
    { x: 0, y: 300 }, { x: 150, y: 300 }, { x: 150, y: 100 }, { x: 450, y: 100 }, 
    { x: 450, y: 500 }, { x: 650, y: 500 }, { x: 650, y: 200 }, { x: 800, y: 200 }
];

// --- CLASSES ---
class Enemy {
    constructor(health, speed) {
        this.x = path[0].x; this.y = path[0].y;
        this.pathIndex = 0;
        this.originalSpeed = speed; this.speed = speed;
        this.health = health; this.maxHealth = health;
        this.radius = 15; this.value = 10;
        this.slowedUntil = 0;
    }

    move() {
        if (Date.now() > this.slowedUntil) this.speed = this.originalSpeed;
        if (this.pathIndex >= path.length - 1) return;
        const target = path[this.pathIndex + 1];
        const dx = target.x - this.x, dy = target.y - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < this.speed) {
            this.pathIndex++; this.x = target.x; this.y = target.y;
        } else {
            this.x += (dx / distance) * this.speed;
            this.y += (dy / distance) * this.speed;
        }
    }

    draw() {
        ctx.fillStyle = this.speed < this.originalSpeed ? '#5dade2' : '#c0392b';
        ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2); ctx.fill();
        const healthBarWidth = this.radius * 2, healthPercentage = this.health / this.maxHealth;
        ctx.fillStyle = '#e74c3c'; ctx.fillRect(this.x - this.radius, this.y - this.radius - 10, healthBarWidth, 5);
        ctx.fillStyle = '#2ecc71'; ctx.fillRect(this.x - this.radius, this.y - this.radius - 10, healthBarWidth * healthPercentage, 5);
    }

    applySlow(effect) {
        this.speed = this.originalSpeed * effect.factor;
        this.slowedUntil = Date.now() + effect.duration;
    }
}

class Tower {
    constructor(x, y, type) {
        this.x = x; this.y = y; this.type = type;
        this.level = 1; this.radius = 20;
        this.lastShotTime = 0;
        this.updateStats();
    }

    updateStats() {
        const config = TOWER_TYPES[this.type];
        const levelData = config.levels[this.level - 1];
        this.damage = levelData.damage;
        this.range = levelData.range;
        this.cooldown = levelData.cooldown;
        this.special = levelData.slow || (levelData.splash ? { splash: levelData.splash } : null);
        this.color = config.color;
    }

    upgrade() {
        const config = TOWER_TYPES[this.type];
        if (this.level >= config.levels.length) return; // Max level
        const upgradeCost = config.levels[this.level].cost;
        if (money >= upgradeCost) {
            money -= upgradeCost;
            this.level++;
            this.updateStats();
        }
    }

    getSellValue() { 
        const config = TOWER_TYPES[this.type];
        let totalCost = config.levels[0].cost;
        for(let i = 1; i < this.level; i++) totalCost += config.levels[i].cost;
        return Math.floor(totalCost * 0.7);
    }

    findTarget() {
        for (const enemy of enemies) {
            const dx = enemy.x - this.x, dy = enemy.y - this.y;
            if (Math.sqrt(dx * dx + dy * dy) < this.range) return enemy;
        }
        return null;
    }

    shoot(target) {
        const now = Date.now();
        if (now - this.lastShotTime > this.cooldown) {
            this.lastShotTime = now;
            projectiles.push(new Projectile(this.x, this.y, target, this.damage, this.special));
        }
    }

    draw() {
        ctx.fillStyle = this.color;
        ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2); ctx.fill();
        // Draw level indicator
        ctx.fillStyle = 'white'; ctx.font = '12px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(this.level, this.x, this.y);
        if (inspectedTower === this) {
            ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(this.x, this.y, this.range, 0, Math.PI * 2); ctx.stroke();
        }
    }
}

class Projectile {
    constructor(x, y, target, damage, special) {
        this.x = x; this.y = y;
        this.target = target;
        this.damage = damage;
        this.speed = 5; this.radius = 4;
        this.special = special;
    }

    move() {
        const dx = this.target.x - this.x, dy = this.target.y - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < this.speed) { this.x = this.target.x; this.y = this.target.y; } 
        else { this.x += (dx / distance) * this.speed; this.y += (dy / distance) * this.speed; }
    }

    draw() { ctx.fillStyle = '#2c3e50'; ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2); ctx.fill(); }
}

// --- GAME LOGIC ---
function spawnWave() {
    wave++; waveInProgress = true; startWaveBtn.disabled = true;
    const numEnemies = 10 + wave * 5;
    const health = 50 + wave * 20;
    const speed = 1 + wave * 0.1;
    for (let i = 0; i < numEnemies; i++) {
        setTimeout(() => enemies.push(new Enemy(health, speed)), i * 600);
    }
}

function handleProjectileHit(p, i) {
    if (p.special && p.special.splash) {
        // Splash damage
        for (const enemy of enemies) {
            const dx = p.x - enemy.x, dy = p.y - enemy.y;
            if (Math.sqrt(dx * dx + dy * dy) < p.special.splash) {
                enemy.health -= p.damage;
            }
        }
    } else {
        // Single target damage
        p.target.health -= p.damage;
        if (p.special && p.special.slow) {
            p.target.applySlow(p.special.slow);
        }
    }
    projectiles.splice(i, 1);
}

function update() {
    // Update enemies
    for (let i = enemies.length - 1; i >= 0; i--) {
        const enemy = enemies[i];
        enemy.move();
        if (enemy.health <= 0) {
            money += enemy.value;
            enemies.splice(i, 1);
        } else if (enemy.pathIndex >= path.length - 1) {
            enemies.splice(i, 1); lives--;
            if (lives <= 0) { alert('Game Over!'); document.location.reload(); }
        }
    }
    for (const tower of towers) {
        const target = tower.findTarget();
        if (target) tower.shoot(target);
    }
    // Update projectiles
    for (let i = projectiles.length - 1; i >= 0; i--) {
        const p = projectiles[i];
        p.move();
        const dx = p.x - p.target.x, dy = p.y - p.target.y;
        if (Math.sqrt(dx * dx + dy * dy) < p.target.radius || (p.target.health <= 0 && p.special && p.special.splash)) {
            handleProjectileHit(p, i);
        }
    }
    if (waveInProgress && enemies.length === 0) {
        waveInProgress = false; startWaveBtn.disabled = false;
    }
    draw(); updateUI(); requestAnimationFrame(update);
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawPath();
    for (const enemy of enemies) enemy.draw();
    for (const tower of towers) tower.draw();
    for (const p of projectiles) p.draw();
    if (selectedTowerType) drawPlacementPreview();
}

function drawPath() {
    ctx.strokeStyle = '#7f8c8d'; ctx.lineWidth = 40; ctx.beginPath();
    ctx.moveTo(path[0].x, path[0].y);
    for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
    ctx.stroke(); ctx.lineWidth = 1;
}

// --- UI & INTERACTION ---
function updateUI() {
    livesSpan.textContent = lives; moneySpan.textContent = money; waveSpan.textContent = wave;
    if (inspectedTower) {
        const config = TOWER_TYPES[inspectedTower.type];
        const isMaxLevel = inspectedTower.level >= config.levels.length;
        document.getElementById('tower-type').textContent = config.name;
        document.getElementById('tower-level').textContent = inspectedTower.level;
        document.getElementById('tower-damage').textContent = inspectedTower.damage;
        document.getElementById('tower-range').textContent = inspectedTower.range;
        document.getElementById('tower-cooldown').textContent = inspectedTower.cooldown + 'ms';
        if (isMaxLevel) {
            upgradeBtn.disabled = true;
            upgradeBtn.textContent = 'Max Level';
        } else {
            upgradeBtn.disabled = false;
            upgradeBtn.textContent = `Upgrade (${config.levels[inspectedTower.level].cost} M)`;
        }
        sellBtn.textContent = `Sell (${inspectedTower.getSellValue()} M)`;
    }
}

function showUpgradeUI() { upgradePanel.classList.remove('hidden'); }
function hideUpgradeUI() { upgradePanel.classList.add('hidden'); inspectedTower = null; }
function showShopUI() { shopPanel.classList.remove('hidden'); }
function hideShopUI() { shopPanel.classList.add('hidden'); }

let mouse = { x: 0, y: 0 };

function selectTower(type) {
    hideUpgradeUI(); showShopUI();
    if (selectedTowerType && selectedTowerType.type === type) {
        selectedTowerType = null;
    } else {
        const towerConfig = TOWER_TYPES[type];
        if (money >= towerConfig.levels[0].cost) selectedTowerType = { type: type, cost: towerConfig.levels[0].cost };
        else selectedTowerType = null;
    }
    document.querySelectorAll('.tower-selection').forEach(el => {
        const towerType = parseInt(el.dataset.towerType, 10);
        if (selectedTowerType && selectedTowerType.type === towerType) el.classList.add('selected');
        else el.classList.remove('selected');
    });
}

function placeTower() {
    if (!selectedTowerType || money < selectedTowerType.cost || !isValidPlacement(mouse.x, mouse.y)) return;
    money -= selectedTowerType.cost;
    towers.push(new Tower(mouse.x, mouse.y, selectedTowerType.type));
    selectedTowerType = null;
    document.querySelectorAll('.tower-selection').forEach(el => el.classList.remove('selected'));
}

function handleCanvasClick() {
    if (selectedTowerType) { placeTower(); return; }
    const clickedTower = towers.find(t => Math.sqrt((mouse.x - t.x)**2 + (mouse.y - t.y)**2) < t.radius);
    if (clickedTower) {
        inspectedTower = clickedTower;
        hideShopUI(); showUpgradeUI();
    } else {
        if (inspectedTower) { hideUpgradeUI(); showShopUI(); }
    }
}

function isValidPlacement(x, y) {
    if (x < 20 || x > canvas.width - 20 || y < 20 || y > canvas.height - 20) return false;
    for (let i = 0; i < path.length - 1; i++) {
        const p1 = path[i], p2 = path[i+1];
        if (x > Math.min(p1.x, p2.x) - 35 && x < Math.max(p1.x, p2.x) + 35 &&
            y > Math.min(p1.y, p2.y) - 35 && y < Math.max(p1.y, p2.y) + 35) return false;
    }
    for(const t of towers) {
        if (Math.sqrt((x - t.x)**2 + (y - t.y)**2) < 40) return false;
    }
    return true;
}

function drawPlacementPreview() {
    const config = TOWER_TYPES[selectedTowerType.type];
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = isValidPlacement(mouse.x, mouse.y) ? '#2ecc71' : '#e74c3c';
    ctx.beginPath(); ctx.arc(mouse.x, mouse.y, 20, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'black';
    ctx.beginPath(); ctx.arc(mouse.x, mouse.y, config.levels[0].range, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1.0;
}

// --- Event Listeners ---
canvas.addEventListener('mousemove', e => { const rect = canvas.getBoundingClientRect(); mouse.x = e.clientX - rect.left; mouse.y = e.clientY - rect.top; });
canvas.addEventListener('click', handleCanvasClick);
startWaveBtn.addEventListener('click', () => { if (!waveInProgress) spawnWave(); });
upgradeBtn.addEventListener('click', () => { if (inspectedTower) inspectedTower.upgrade(); });
sellBtn.addEventListener('click', () => {
    if (!inspectedTower) return;
    money += inspectedTower.getSellValue();
    towers.splice(towers.indexOf(inspectedTower), 1);
    hideUpgradeUI(); showShopUI();
});
closeUpgradePanelBtn.addEventListener('click', () => { hideUpgradeUI(); showShopUI(); });

// --- Start Game ---
update();

