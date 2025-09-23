// 🎮 TagZone – Lasertag Game
// This project uses Three.js for 3D rendering and scene management.
// https://threejs.org/

// 📦 Three.js is used to:
// - Create and manage the 3D scene
// - Render objects like players, lasers, and environment
// - Handle camera movement and lighting

// 💡 Note: Three.js is loaded via a CDN and partially from local files in index.html
let keyboardActive = false;
let controllerActive = false;

const glowColors = [0x00a2e8, 0x31ff6d, 0xff51fb];
let botGlowCubes = [];

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 0);
document.body.appendChild(renderer.domElement);

let playerModel = null;
let targetRotationY = 0;
let targetRotationX = 0;
let showHitboxes = false;
let botBoxHelpers = [];
let playerBoxHelper = null;
let mobileMove = {x:0, y:0};
let mobileLook = {x:0, y:0};
let isSprintingMobile = false;
let overlayText = '';
let overlayTimeout = null;
const wallHeight = 12;
const barrierEmissiveIntensity = 0.40;
const laserSpeed = 2.5;
let playerGlowCube = null;
let playerEliminated = false;

const loader = new THREE.GLTFLoader();
let loadedBotModels = 0;
loader.load('assets/glbs/player.glb', function(gltf) {
    playerModel = gltf.scene;
    playerModel.position.set(0, 0, 0);
    playerModel.rotation.set(0, Math.PI, 0);
    scene.add(playerModel);
    const playerGlowMaterial = new THREE.MeshStandardMaterial({ color: glowColors[0], emissive: glowColors[0], emissiveIntensity: 2, transparent: false, opacity: 1 });
    playerGlowCube = new THREE.Mesh(new THREE.SphereGeometry(0.7, 32, 32), playerGlowMaterial);
    playerGlowCube.visible = true;
    scene.add(playerGlowCube);
    window.bots.forEach((bot, idx) => {
        loader.load('assets/glbs/player.glb', function(botGltf) {
            const botModel = botGltf.scene.clone();
            botModel.position.set(bot.position.x, bot.position.y, bot.position.z);
            botModel.rotation.set(0, bot.angle, 0);
            scene.add(botModel);
            bot.model = botModel;
            const colorIdx = idx % glowColors.length;
            const botGlowMaterial = new THREE.MeshStandardMaterial({ color: glowColors[colorIdx], emissive: glowColors[colorIdx], emissiveIntensity: 2, transparent: false, opacity: 1 });
            const botGlowCube = new THREE.Mesh(new THREE.SphereGeometry(0.7, 32, 32), botGlowMaterial);
            botGlowCube.visible = true;
            scene.add(botGlowCube);
            botGlowCubes[idx] = botGlowCube;
            bot.glowColorIdx = colorIdx;
            loadedBotModels++;
            if (loadedBotModels === window.bots.length) {
                startGame();
            }
        }, undefined, function(error) {
            console.error('Fehler beim Laden von assets/glbs/player.glb für Bot:', error);
        });
    });
}, undefined, function(error) {
    console.error('Fehler beim Laden von assets/glbs/player.glb:', error);
});

function startGame() {
    window.bots.forEach(bot => {
        bot.canShoot = true;
        bot.cooldown = 0;
        if (bot.model) restoreModelMaterial(bot.model);
    });
    showOverlay('Bots are now active!');
}

scene.background = new THREE.Color(0x0a0a1a);
scene.fog = new THREE.Fog(0x0a0a1a, 40, 120);

const purpleColors = [0x8000ff, 0xb266ff, 0x9900cc, 0xcc66ff, 0x660099, 0x9933ff, 0x6600cc, 0x9900ff];
for (let i = 0; i < purpleColors.length; i++) {
    const spot = new THREE.SpotLight(purpleColors[i], 1.2, 120, Math.PI/4, 0.5, 1);
    const x = Math.random() * 80 - 40;
    const z = Math.random() * 80 - 40;
    spot.position.set(x, 30, z);
    spot.target.position.set(0, 0, 0);
    scene.add(spot);
    scene.add(spot.target);
}
const ambientLight = new THREE.AmbientLight(0x222244, 0.3);
scene.add(ambientLight);

camera.position.set(0, 10, 10);
camera.lookAt(0, 0, 0);

let world, groundBody, playerBody;
world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
const groundShape = new CANNON.Box(new CANNON.Vec3(50, 0.5, 50));
groundBody = new CANNON.Body({ mass: 0 });
groundBody.addShape(groundShape);
groundBody.position.set(0, -2, 0);
world.addBody(groundBody);

const playerShape = new CANNON.Sphere(0.5);
playerBody = new CANNON.Body({ mass: 1 });
playerBody.addShape(playerShape);
playerBody.position.set(0, 2, 0);
world.addBody(playerBody);

window.bots.forEach(bot => {
    const botShape = new CANNON.Sphere(0.5);
    const botBody = new CANNON.Body({ mass: 1 });
    botBody.addShape(botShape);
    botBody.position.set(bot.position.x, 2, bot.position.z);
    world.addBody(botBody);
    bot.body = botBody;
});

const wallThickness = 0.2;
const mapSize = 50;
const wallData = [
    { x: 0, y: wallHeight / 2 - 2, z: -mapSize, sx: mapSize * 2 + 0.25, sy: wallHeight, sz: wallThickness + 0.25 },
    { x: 0, y: wallHeight / 2 - 2, z: mapSize, sx: mapSize * 2 + 0.25, sy: wallHeight, sz: wallThickness + 0.25 },
    { x: -mapSize, y: wallHeight / 2 - 2, z: 0, sx: wallThickness + 0.25, sy: wallHeight, sz: mapSize * 2 + 0.25 },
    { x: mapSize, y: wallHeight / 2 - 2, z: 0, sx: wallThickness + 0.25, sy: wallHeight, sz: mapSize * 2 + 0.25 },
];
wallData.forEach(wall => {
    const wallShape = new CANNON.Box(new CANNON.Vec3(wall.sx / 2, wall.sy / 2, wall.sz / 2));
    const wallBody = new CANNON.Body({ mass: 0 });
    wallBody.addShape(wallShape);
    wallBody.position.set(wall.x, wall.y, wall.z);
    world.addBody(wallBody);
    const wallGeometry = new THREE.BoxGeometry(wall.sx - 0.25, wall.sy, wall.sz - 0.25);
    const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x6666ff });
    const wallMesh = new THREE.Mesh(wallGeometry, wallMaterial);
    wallMesh.position.copy(wallBody.position);
    scene.add(wallMesh);
});

const wallTextures = [];
const wallTextureFiles = ['assets/imgs/wall1.png', 'assets/imgs/wall2.png', 'assets/imgs/wall3.png', 'assets/imgs/wall4.png'];
let loadedWallTextures = 0;
wallTextureFiles.forEach((file, idx) => {
    const tex = new THREE.TextureLoader().load(file, () => {
        loadedWallTextures++;
    });
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, 1);
    wallTextures[idx] = tex;
});

fetch('wall.json')
    .then(response => response.json())
    .then(walls => {
        function getChar(rowIdx, colIdx) {
            const row = walls[(rowIdx+1).toString()];
            if (!row) return '.';
            return row[colIdx] || '.';
        }
        const cellSize = 4;
        const offset = -48;
        const barrierThickness = 1.0;
        for (let rowIndex = 0; rowIndex < 25; rowIndex++) {
            const row = walls[(rowIndex+1).toString()];
            let col = 0;
            while (col < 25) {
                const char = row[col];
                const y = -1.5;
                if (char === '-') {
                    let width = cellSize;
                    let extend = 0;
                    let nextCol = col + 1;
                    while (nextCol < 25 && row[nextCol] === '-') {
                        width += cellSize;
                        extend++;
                        nextCol++;
                    }
                    let textureIdx = Math.floor(Math.random() * wallTextures.length);
                    let x = offset + col * cellSize + width/2 - cellSize/2;
                    if (col > 0 && row[col-1] === 'I') {
                        x -= barrierThickness / 2;
                        width += barrierThickness / 2;
                    }
                    const z = offset + rowIndex * cellSize - (barrierThickness / 2);
                    createBarrier(x, y, z, width, wallHeight, barrierThickness, 0, wallTextures[textureIdx]);
                    col += extend + 1;
                    continue;
                }
                if (char === 'I') {
                    let length = cellSize;
                    let extend = 0;
                    let nextRow = rowIndex + 1;
                    while (nextRow < 25 && getChar(nextRow, col) === 'I') {
                        length += cellSize;
                        extend++;
                        nextRow++;
                    }
                    let textureIdx = Math.floor(Math.random() * wallTextures.length);
                    let z = offset + rowIndex * cellSize + length/2 - cellSize/2;
                    if (rowIndex > 0 && getChar(rowIndex-1, col) === '-') {
                        z -= barrierThickness / 2;
                        length += barrierThickness / 2;
                    }
                    const x = offset + col * cellSize - (barrierThickness / 2);
                    createBarrier(x, y, z, barrierThickness, wallHeight, length, 0, wallTextures[textureIdx]);
                    col++;
                    continue;
                }
                col++;
            }
        }
    });

function createBarrier(x, y, z, width, height, length, rotY, texture) {
    const barrierShape = new CANNON.Box(new CANNON.Vec3(width/2, height/2, length/2));
    const barrierBody = new CANNON.Body({ mass: 0 });
    barrierBody.addShape(barrierShape);
    barrierBody.position.set(x, y, z);
    barrierBody.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), rotY);
    world.addBody(barrierBody);
    const barrierGeometry = new THREE.BoxGeometry(width, height, length);
    const barrierMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        metalness: 0.3,
        roughness: 0.5,
        map: texture
    });
    const barrierMesh = new THREE.Mesh(barrierGeometry, barrierMaterial);
    barrierMesh.position.copy(barrierBody.position);
    barrierMesh.rotation.y = rotY;
    scene.add(barrierMesh);
    barriers.push(barrierMesh);

    const glowColors = [0x00a2e8, 0x31ff6d, 0xff51fb];
    const glowColor = glowColors[Math.floor(Math.random() * glowColors.length)];
    const frameThickness = 0.22;
    if (width >length) {
        let leftGeometry = new THREE.BoxGeometry(frameThickness, height + frameThickness, length);
        let leftMaterial = new THREE.MeshStandardMaterial({
            color: glowColor,
            transparent: true,
            opacity: 0.7,
            emissive: glowColor,
            emissiveIntensity: 2.2
        });
        let leftMesh = new THREE.Mesh(leftGeometry, leftMaterial);
        leftMesh.position.set(x - width/2 - frameThickness/2, y, z);
        leftMesh.rotation.y = rotY;
        scene.add(leftMesh);
        let rightGeometry = new THREE.BoxGeometry(frameThickness, height + frameThickness, length);
        let rightMaterial = leftMaterial;
        let rightMesh = new THREE.Mesh(rightGeometry, rightMaterial);
        rightMesh.position.set(x + width/2 + frameThickness/2, y, z);
        rightMesh.rotation.y = rotY;
        scene.add(rightMesh);
    } else {
        let frontGeometry = new THREE.BoxGeometry(width, height + frameThickness, frameThickness);
        let frontMaterial = new THREE.MeshStandardMaterial({
            color: glowColor,
            transparent: true,
            opacity: 0.7,
            emissive: glowColor,
            emissiveIntensity: 2.2
        });
        let frontMesh = new THREE.Mesh(frontGeometry, frontMaterial);
        frontMesh.position.set(x, y, z - length/2 - frameThickness/2);
        frontMesh.rotation.y = rotY;
        scene.add(frontMesh);
        let backGeometry = new THREE.BoxGeometry(width, height + frameThickness, frameThickness);
        let backMaterial = frontMaterial;
        let backMesh = new THREE.Mesh(backGeometry, backMaterial);
        backMesh.position.set(x, y, z + length/2 + frameThickness/2);
        backMesh.rotation.y = rotY;
        scene.add(backMesh);
    }
}

let cameraOrbitAngle = 0;
let isRotatingCamera = false;
renderer.domElement.addEventListener('mousedown', function(event) {
    if (event.button === 2) {
        isRotatingCamera = true;
        renderer.domElement.requestPointerLock();
    }
    if (event.button === 0 && cameraMode === "first" && !pointerLockActive) {
        enablePointerLock();
        return;
    }
    if (event.button === 0 && window.playerInfo && window.playerInfo.canShoot && laserTemplate && playerModel) {
        const dir = new THREE.Vector3(Math.sin(playerAngle), 0, Math.cos(playerAngle)).normalize();
        const startPos = new THREE.Vector3(
            playerModel.position.x + dir.x * 1.2,
            playerModel.position.y + 2,
            playerModel.position.z + dir.z * 1.2
        );
        const laser = laserTemplate.clone();
        laser.traverse(function(child) { if (child.isMesh) child.material = new THREE.MeshBasicMaterial({ color: 0x00fffc }); });
        laser.position.copy(startPos);
        laser.lookAt(startPos.clone().add(dir));
        laser.userData = { direction: dir.clone(), life: 0, owner: window.playerInfo };
        scene.add(laser);
        lasers.push(laser);
        onPlayerShoot();
    }
});

renderer.domElement.addEventListener('mouseup', function(event) {
    if (event.button === 2) {
        document.exitPointerLock();
    }
});
renderer.domElement.addEventListener('mousemove', function(event) {
    if (isRotatingCamera && document.pointerLockElement === renderer.domElement) {
        cameraOrbitAngle -= event.movementX * 0.01;
        playerAngle -= event.movementX * 0.01;
        if (playerModel) {
            playerModel.rotation.y = playerAngle;
        }
    }
});
renderer.domElement.addEventListener('contextmenu', function(event) {
    event.preventDefault();
});

new THREE.TextureLoader().load(
    'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/pillars_1k.hdr',
    function(texture) {
        texture.mapping = THREE.EquirectangularReflectionMapping;
        scene.environment = texture;
        scene.background = texture;
    }
);

const groundTexture = new THREE.TextureLoader().load('assets/imgs/ground.png', function(texture) {
    const image = texture.image;
    if (image) {
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0);
        const imgData = ctx.getImageData(0, 0, image.width, image.height).data;
        const targetR = 92, targetG = 203, targetB = 0;
        for (let y = 0; y < image.height; y++) {
            for (let x = 0; x < image.width; x++) {
                const idx = (y * image.width + x) * 4;
                const r = imgData[idx];
                const g = imgData[idx + 1];
                const b = imgData[idx + 2];
                if (r === targetR && g === targetG && b === targetB) {
                    const px = (x / image.width) * 100 - 50;
                    const pz = (y / image.height) * 100 - 50;
                    for (let tx = 0; tx < 2; tx++) {
                        for (let tz = 0; tz < 2; tz++) {
                            const posX = px + tx * 100;
                            const posZ = pz + tz * 100;
                            const planeGeo = new THREE.CircleGeometry(0.7, 16);
                            const planeMat = new THREE.MeshStandardMaterial({
                                color: 0x5ccb00,
                                emissive: 0x5ccb00,
                                emissiveIntensity: 1.5,
                                metalness: 0.2,
                                roughness: 0.3
                            });
                            const planeMesh = new THREE.Mesh(planeGeo, planeMat);
                            planeMesh.position.set(posX, groundBody.position.y + 0.52, posZ);
                            planeMesh.rotation.x = -Math.PI / 2;
                            scene.add(planeMesh);
                        }
                    }
                }
            }
        }
    }
});

groundTexture.wrapS = THREE.RepeatWrapping;
groundTexture.wrapT = THREE.RepeatWrapping;
groundTexture.repeat.set(2, 2);
const groundMaterial = new THREE.MeshStandardMaterial({ map: groundTexture });
const groundGeometry = new THREE.BoxGeometry(100, 1, 100);
const groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
groundMesh.position.copy(groundBody.position);
groundMesh.receiveShadow = false;
scene.add(groundMesh);
const aroundWallTexture = new THREE.TextureLoader().load('assets/imgs/aroundG.png', undefined, () => {

});
aroundWallTexture.wrapS = THREE.RepeatWrapping;
aroundWallTexture.wrapT = THREE.RepeatWrapping;
aroundWallTexture.repeat.set(1, 1);
const groundWallData = [
    { x: 0, y: wallHeight / 2 - 2, z: -mapSize, sx: mapSize * 2 + 0.25, sy: wallHeight, sz: wallThickness + 0.25 }, // vorne
    { x: 0, y: wallHeight / 2 - 2, z: mapSize, sx: mapSize * 2 + 0.25, sy: wallHeight, sz: wallThickness + 0.25 }, // hinten
    { x: -mapSize, y: wallHeight / 2 - 2, z: 0, sx: wallThickness + 0.25, sy: wallHeight, sz: mapSize * 2 + 0.25 }, // links
    { x: mapSize, y: wallHeight / 2 - 2, z: 0, sx: wallThickness + 0.25, sy: wallHeight, sz: mapSize * 2 + 0.25 }  // rechts
];
groundWallData.forEach((wall) => {
    const wallShape = new CANNON.Box(new CANNON.Vec3(wall.sx / 2, wall.sy / 2, wall.sz / 2));
    const wallBody = new CANNON.Body({ mass: 0 });
    wallBody.addShape(wallShape);
    wallBody.position.set(wall.x, wall.y, wall.z);
    world.addBody(wallBody);
    const wallGeometry = new THREE.BoxGeometry(wall.sx - 0.25, wall.sy, wall.sz - 0.25);
    let wallMaterial;
    if (aroundWallTexture && aroundWallTexture.image) {
        wallMaterial = new THREE.MeshStandardMaterial({ map: aroundWallTexture, color: 0xffffff });
    } else {
        wallMaterial = new THREE.MeshStandardMaterial({ color: 0x6666ff });
    }
    const wallMesh = new THREE.Mesh(wallGeometry, wallMaterial);
    wallMesh.position.copy(wallBody.position);
    scene.add(wallMesh);
});

const keys = { w: false, a: false, s: false, d: false, space: false, shift: false };
window.addEventListener('keydown', (e) => {
    if (e.key === 'w' || e.key === 'W') keys.w = true;
    if (e.key === 'a' || e.key === 'A') keys.a = true;
    if (e.key === 's' || e.key === 'S') keys.s = true;
    if (e.key === 'd' || e.key === 'D') keys.d = true;
    if (e.key === ' ' || e.code === 'Space') keys.space = true;
    if (e.key === 'Shift') keys.shift = true;
    if (e.key === 'F5') {
        cameraMode = cameraMode === "third" ? "first" : "third";
        e.preventDefault();
        if (cameraMode === "first") {
            enablePointerLock();
        } else {
            disablePointerLock();
        }
    }
    keyboardActive = true;
    controllerActive = false;
});
window.addEventListener('keyup', (e) => {
    if (e.key === 'w' || e.key === 'W') keys.w = false;
    if (e.key === 'a' || e.key === 'A') keys.a = false;
    if (e.key === 's' || e.key === 'S') keys.s = false;
    if (e.key === 'd' || e.key === 'D') keys.d = false;
    if (e.key === ' ' || e.code === 'Space') keys.space = false;
    if (e.key === 'Shift') keys.shift = false;
    keyboardActive = true;
    controllerActive = false;
});

let playerAngle = 0;
let cameraMode = "third";
let pointerLockActive = false;
let cameraPitch = 0;

cameraMode = cameraMode === "third" ? "first" : "third";
        e.preventDefault();
        if (cameraMode === "first") {
            enablePointerLock();
        } else {
            disablePointerLock();
        }

function enablePointerLock() {
    if (!pointerLockActive) {
        renderer.domElement.requestPointerLock();
    }
}
function disablePointerLock() {
    if (pointerLockActive && cameraMode !== "first" ) {
        document.exitPointerLock();
    }
}
document.addEventListener('pointerlockchange', function() {
    pointerLockActive = document.pointerLockElement === renderer.domElement;
});

function updatePlayerAngle(event) {
    if (cameraMode === "first" && pointerLockActive) {
        playerAngle -= event.movementX * 0.01;
        cameraPitch -= event.movementY * 0.01;
        const maxPitch = Math.PI / 2 * 0.89;
        if (cameraPitch > maxPitch) cameraPitch = maxPitch;
        if (cameraPitch < -maxPitch) cameraPitch = -maxPitch;
        if (playerModel) {
            playerModel.rotation.y = playerAngle;
        }
    } else if (!isRotatingCamera) {
        const rect = renderer.domElement.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const dx = event.clientX - centerX;
        const dy = event.clientY - centerY;
        playerAngle = Math.atan2(dx, dy);
        cameraPitch = 0;
        if (playerModel) {
            playerModel.rotation.y = playerAngle;
        }
    }
}
renderer.domElement.addEventListener('mousemove', updatePlayerAngle);

let laserTemplate = null;
const laserLoader = new THREE.GLTFLoader();
laserLoader.load('assets/glbs/laser.glb', function(gltf) {
    laserTemplate = gltf.scene;
}, undefined, function(error) {
});

const lasers = [];
const barriers = [];

renderer.domElement.addEventListener('mousedown', function(event) {
    if (event.button === 0 && cameraMode === "first" && !pointerLockActive) {
        enablePointerLock();
        return;
    }
    if (event.button === 0 && window.playerInfo && window.playerInfo.canShoot && laserTemplate && playerModel) {
        const dir = new THREE.Vector3(Math.sin(playerAngle), 0, Math.cos(playerAngle)).normalize();
        const startPos = new THREE.Vector3(
            playerModel.position.x + dir.x * 2.0,
            playerModel.position.y + 2,
            playerModel.position.z + dir.z * 2.0
        );
        const laser = laserTemplate.clone();
        laser.traverse(function(child) { if (child.isMesh) child.material = new THREE.MeshBasicMaterial({ color: 0x00fffc }); });
        laser.position.copy(startPos);
        laser.lookAt(startPos.clone().add(dir));
        laser.userData = { direction: dir.clone(), life: 0, owner: window.playerInfo };
        const playerBox = new THREE.Box3().setFromCenterAndSize(playerModel.position, new THREE.Vector3(2,4,2));
        if (!playerBox.containsPoint(laser.position)) {
            scene.add(laser);
            lasers.push(laser);
            onPlayerShoot();
        }
    }
});

function onPlayerShoot() {
    if (window.playerInfo && window.playerInfo.canShoot) {
        window.playerInfo.shotsFired++;
        // window.playerInfo.canShoot = false;
        // window.playerInfo.cooldown = Math.round(0.25 * 60);
    }
}
function onPlayerLaserHit(target) {
    if (window.playerInfo) {
        window.playerInfo.hits++;
    }
}

function isTargetDirectlyInFront(bot, target, maxDist = 4, angleThreshold = Math.PI/4) {
    if (!bot || !target || !bot.body || !target.position) return false;
    const botPos = bot.body.position;
    const targetPos = target.body ? target.body.position : target.position;
    const dx = targetPos.x - botPos.x;
    const dz = targetPos.z - botPos.z;
    const dist = Math.sqrt(dx*dx + dz*dz);
    if (dist > maxDist) return false;
    const dirToTarget = Math.atan2(dx, dz);
    let botAngle = bot.angle;
    let angleDiff = Math.abs(dirToTarget - botAngle);
    if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;
    return angleDiff < angleThreshold;
}
function isBotBeingChased(bot, chasers, chaseDist = 10) {
    // Prüft, ob einer der chasers sich schnell nähert und in Richtung des Bots läuft
    for (const chaser of chasers) {
        if (!chaser.body || !bot.body) continue;
        const dx = bot.body.position.x - chaser.body.position.x;
        const dz = bot.body.position.z - chaser.body.position.z;
        const dist = Math.sqrt(dx*dx + dz*dz);
        if (dist < chaseDist) {
            // Richtung prüfen
            const dirToBot = Math.atan2(dx, dz);
            let chaserAngle = chaser.angle;
            let angleDiff = Math.abs(dirToBot - chaserAngle);
            if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;
            if (angleDiff < Math.PI/3) {
                // Chaser läuft auf Bot zu
                return true;
            }
        }
    }
    return false;
}
function updateBotsAndPlayers() {
    window.bots.forEach((bot, i) => {
        if (bot.model && bot.body) {
            const groundMinX = groundBody.position.x - 50;
            const groundMaxX = groundBody.position.x + 50;
            const groundMinZ = groundBody.position.z - 50;
            const groundMaxZ = groundBody.position.z + 50;
            const botRadius = 0.5;
            const groundTop = groundBody.position.y + 0.5;
            let isOnGround = false;
            if (
                bot.body.position.x - botRadius >= groundMinX &&
                bot.body.position.x + botRadius <= groundMaxX &&
                bot.body.position.z - botRadius >= groundMinZ &&
                bot.body.position.z + botRadius <= groundMaxZ &&
                bot.body.position.y - botRadius <= groundTop + 0.01
            ) {
                bot.body.position.y = groundTop + botRadius;
                bot.body.velocity.y = 0;
                isOnGround = true;
            } else {
                bot.body.velocity.y -= 0.5;
            }
            bot.model.position.copy(bot.body.position);
            bot.model.rotation.y = bot.angle;
        }
    });
    if (playerModel) {
        playerModel.position.copy(playerBody.position);
        playerModel.position.y = playerBody.position.y;
        playerModel.rotation.y = playerAngle;
    }
}

function animate() {
    requestAnimationFrame(animate);
    world.step(1/60);
    if (playerModel && playerBody) {
        const forward = new THREE.Vector3(Math.sin(playerAngle), 0, Math.cos(playerAngle));
        const right = new THREE.Vector3(Math.cos(playerAngle), 0, -Math.sin(playerAngle));
        let move = new CANNON.Vec3(0, 0, 0);
        let speed = 5;
        if (keys.shift || isSprintingMobile) speed = 10;
        let usingKeyboard = keys.w || keys.a || keys.s || keys.d;
        if (usingKeyboard) {
            if (keys.w) {
                move.x += forward.x * speed;
                move.z += forward.z * speed;
            }
            if (keys.s) {
                move.x -= forward.x * speed;
                move.z -= forward.z * speed;
            }
            if (keys.a) {
                move.x += right.x * speed;
                move.z += right.z * speed;
            }
            if (keys.d) {
                move.x -= right.x * speed;
                move.z -= right.z * speed;
            }
            playerBody.velocity.x = move.x;
            playerBody.velocity.z = move.z;
        } else if (isMobileDevice() && typeof mobileMove === 'object' && (mobileMove.x !== 0 || mobileMove.y !== 0)) {
            let mobileSpeed = isSprintingMobile ? 16 : 8;
            mobileSpeed *= 1.5;
            const moveX = mobileMove.x;
            const moveY = mobileMove.y;
            playerBody.velocity.x = forward.x * (-moveY) * mobileSpeed + right.x * (-moveX) * mobileSpeed;
            playerBody.velocity.z = forward.z * (-moveY) * mobileSpeed + right.z * (-moveX) * mobileSpeed;
        } else {
            playerBody.velocity.x = 0;
            playerBody.velocity.z = 0;
        }
        const groundMinX = groundBody.position.x - 50;
        const groundMaxX = groundBody.position.x + 50;
        const groundMinZ = groundBody.position.z - 50;
        const groundMaxZ = groundBody.position.z + 50;
        const playerRadius = 0.5;
        const groundTop = groundBody.position.y + 0.5;
        let isOnGround = false;
        if (
            playerBody.position.x - playerRadius >= groundMinX &&
            playerBody.position.x + playerRadius <= groundMaxX &&
            playerBody.position.z - playerRadius >= groundMinZ &&
            playerBody.position.z + playerRadius <= groundMaxZ &&
            playerBody.position.y - playerRadius <= groundTop + 0.01
        ) {
            playerBody.position.y = groundTop + playerRadius;
            playerBody.velocity.y = 0;
            isOnGround = true;
        } else {
            playerBody.velocity.y -= 0.5;
        }
        if (keys.space && isOnGround) {
            playerBody.velocity.y = 16;
            keys.space = false;
        }
        playerModel.position.copy(playerBody.position);
        playerModel.position.y = playerBody.position.y;
        playerModel.rotation.y = playerAngle;
        if (cameraMode === "third") {
            playerModel.visible = true;
            const camRadius = 10;
            const camHeight = 5;
            camera.position.x = playerModel.position.x + Math.sin(cameraOrbitAngle) * camRadius;
            camera.position.z = playerModel.position.z + Math.cos(cameraOrbitAngle) * camRadius;
            camera.position.y = playerModel.position.y + camHeight;
            camera.lookAt(playerModel.position);
        } else {
            playerModel.visible = false;
            camera.position.x = playerModel.position.x;
            camera.position.z = playerModel.position.z;
            camera.position.y = playerModel.position.y + 3.5;
            const lookDir = new THREE.Vector3(
                Math.sin(playerAngle) * Math.cos(cameraPitch),
                Math.sin(cameraPitch),
                Math.cos(playerAngle) * Math.cos(cameraPitch)
            );
            const lookAt = new THREE.Vector3(
                playerModel.position.x + lookDir.x,
                camera.position.y + lookDir.y,
                playerModel.position.z + lookDir.z
            );
            camera.lookAt(lookAt);
        }
    }
    const kopfOffset = 4.5;
    if (playerModel && playerGlowCube) {
        playerGlowCube.visible = !playerEliminated && cameraMode !== "first";
        playerGlowCube.position.set(
            playerModel.position.x,
            playerModel.position.y + kopfOffset,
            playerModel.position.z
        );
    }
    window.bots.forEach((bot, idx) => {
        if (bot.model && botGlowCubes[idx]) {
            botGlowCubes[idx].visible = !bot.eliminated;
            botGlowCubes[idx].position.set(
                bot.model.position.x,
                bot.model.position.y + kopfOffset,
                bot.model.position.z
            );
        }
    });
    for (let i = lasers.length - 1; i >= 0; i--) {
        const laser = lasers[i];
        laser.position.add(laser.userData.direction.clone().multiplyScalar(laserSpeed));
        laser.userData.life += laserSpeed;
        let hit = false;
        for (const bot of window.bots) {
            if (bot.model && laser.userData.owner !== bot) {
                const botBox = new THREE.Box3().setFromCenterAndSize(bot.model.position, new THREE.Vector3(2.5,5,2.5));
                if (botBox.containsPoint(laser.position)) {
                    const attackerName = laser.userData.owner.name;
                    const now = performance.now();
                    const lastHit = bot.lastHitBy[attackerName] || 0;
                    if (now - lastHit > 3500) {
                        bot.lastHitBy[attackerName] = now;
                        bot.canShoot = false;
                        bot.cooldown = 180;
                        laser.userData.owner.score += 100;
                        updateRankingHTML();
                        showOverlay(`${bot.name} was hit! (+100)`);
                        setModelGray(bot.model);
                        setTimeout(() => restoreModelMaterial(bot.model), 3000);
                        scene.remove(laser);
                        lasers.splice(i, 1);
                        hit = true;
                        break;
                    } else {
                        showOverlay(`${bot.name} is still protected from ${attackerName}`);
                    }
                }
            }else if(bot.model && laser.userData.owner !== bot){

            }
        }
        if (hit) continue;
        if (playerModel && laser.userData.owner !== window.playerInfo) {
            const playerBox = new THREE.Box3().setFromCenterAndSize(playerModel.position, new THREE.Vector3(2,4,2));
            // Laser vom eigenen Spieler: nur entfernen, keine Deaktivierung/Cooldown/Punkte
            if (playerBox.containsPoint(laser.position) && laser.userData.owner === window.playerInfo && laser.userData.life > 2) {
                scene.remove(laser);
                lasers.splice(i, 1);
                continue;
            }
            // Laser von anderen: wie bisher
            if (
                playerBox.containsPoint(laser.position) &&
                laser.userData.owner &&
                laser.userData.owner !== window.playerInfo &&
                window.playerInfo.canShoot &&
                laser.userData.life > 2
            ) {
                window.playerInfo.canShoot = false;
                window.playerInfo.cooldown = 180;
                laser.userData.owner.score += 100;
                updateRankingHTML();
                showOverlay(`MAXI was hit!`);
                setModelGray(playerModel);
                setTimeout(() => restoreModelMaterial(playerModel), 3000);
                scene.remove(laser);
                lasers.splice(i, 1);
                continue;
            }
        }
        let barrierHit = false;
        for (let j = barriers.length - 1; j >= 0; j--) {
            const barrier = barriers[j];
            const dist = laser.position.distanceTo(barrier.position);
            if (dist < 2.0) {
                showOverlay('Laser collides with barrier');
                scene.remove(laser);
                lasers.splice(i, 1);
                barrierHit = true;
                break;
            }
        }
        if (barrierHit) continue;
        if (laser.userData.life > 120) {
            scene.remove(laser);
            lasers.splice(i, 1);
            continue;
        }
    }
    groundMesh.position.copy(groundBody.position);
    updateBotsAndPlayers();
    if (showHitboxes) {
        window.bots.forEach((bot, idx) => {
            if (bot.model && botBoxHelpers[idx]) {
                botBoxHelpers[idx].update();
            }
        });
        if (playerModel && playerBoxHelper) {
            playerBoxHelper.update();
        }
    }
    let mobileSpeed = isSprintingMobile ? 10 : 5;
    if (typeof mobileMove === 'object' && (mobileMove.x !== 0 || mobileMove.y !== 0)) {
        const moveX = mobileMove.x;
        const moveY = mobileMove.y;
        const angle = playerAngle;
        const forward = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
        const right = new THREE.Vector3(Math.cos(angle), 0, -Math.sin(angle));
        playerBody.velocity.x = forward.x * (-moveY) * mobileSpeed + right.x * (-moveX) * mobileSpeed;
        playerBody.velocity.z = forward.z * (-moveY) * mobileSpeed + right.z * (-moveX) * mobileSpeed;
    }
    if (typeof mobileLook === 'object' && (mobileLook.x !== 0 || mobileLook.y !== 0)) {
        if (cameraMode === "third") {
            cameraOrbitAngle -= mobileLook.x * 0.15;
            playerAngle -= mobileLook.x * 0.15;
        } else {
            playerAngle -= mobileLook.x * 0.15;
            cameraPitch -= mobileLook.y * 0.15;
            const maxPitch = Math.PI / 2 * 0.89;
            if (cameraPitch > maxPitch) cameraPitch = maxPitch;
            if (cameraPitch < -maxPitch) cameraPitch = -maxPitch;
        }
        if (playerModel) playerModel.rotation.y = playerAngle;
    }
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = gamepads[0];
    if (gp) {
        const lx = gp.axes[0];
        const ly = gp.axes[1];
        const rx = gp.axes[2];
        const ry = gp.axes[3];
        const anyMove = Math.abs(lx) > 0.2 || Math.abs(ly) > 0.2;
        const anyLook = Math.abs(rx) > 0.1 || Math.abs(ry) > 0.1;
        const anyButton = gp.buttons.some(btn => btn.pressed);
        if (anyMove || anyLook || anyButton) {
            controllerActive = true;
            keyboardActive = false;
        }
        let newKeys = {
            w: ly < -0.2,
            s: ly > 0.2,
            a: lx < -0.2,
            d: lx > 0.2,
            shift: gp.buttons[6]?.pressed || gp.buttons[7]?.pressed
        };
        // Spieler sofort stoppen, wenn kein Stick bewegt wird
        if (!anyMove) {
            playerBody.velocity.x = 0;
            playerBody.velocity.z = 0;
        }
        if (gp.buttons[0]?.pressed) {
            if (!window.gamepadJumpPressed) {
                const playerRadius = 0.5;
                const groundTop = groundBody.position.y + 0.5;
                if (playerBody.position.y - playerRadius <= groundTop + 0.01) {
                    playerBody.velocity.y = 16;
                }
                window.gamepadJumpPressed = true;
            }
        } else {
            window.gamepadJumpPressed = false;
        }
        if (controllerActive && !keyboardActive) {
            for (const k of ['w','a','s','d','shift']) {
                keys[k] = newKeys[k];
            }
            window.prevKeys = { ...newKeys };
        }
        if (!controllerActive) {
            // Controller ist nicht aktiv, Tastatur kann wieder steuern
            // Setze keine keys, lasse Tastatur-Input unberührt
        }
        if (Math.abs(rx) > 0.1) playerAngle -= rx * 0.04;
        if (typeof cameraPitch !== 'undefined' && Math.abs(ry) > 0.1) cameraPitch -= ry * 0.03;
        if (!window.lastZRPressTime) window.lastZRPressTime = 0;
        const now = performance.now();
        const zrPressed = gp.buttons[7]?.pressed;
        if (
            zrPressed &&
            now - window.lastZRPressTime > 500 &&
            window.playerInfo && window.playerInfo.canShoot && laserTemplate && playerModel
        ) {
            window.lastZRPressTime = now;
            const dir = new THREE.Vector3(Math.sin(playerAngle), 0, Math.cos(playerAngle)).normalize();
            const startPos = new THREE.Vector3(
                playerModel.position.x + dir.x * 2.0,
                playerModel.position.y + 2,
                playerModel.position.z + dir.z * 2.0
            );
            const laser = laserTemplate.clone();
            laser.traverse(function(child) { if (child.isMesh) child.material = new THREE.MeshBasicMaterial({ color: 0x00fffc }); });
            laser.position.copy(startPos);
            laser.lookAt(startPos.clone().add(dir));
            laser.userData = { direction: dir.clone(), life: 0, owner: window.playerInfo };
            const playerBox = new THREE.Box3().setFromCenterAndSize(playerModel.position, new THREE.Vector3(2,4,2));
            if (!playerBox.containsPoint(laser.position)) {
                scene.add(laser);
                lasers.push(laser);
                onPlayerShoot();
            }
        }
    } else {
        // Wenn kein Controller aktiv, setze prevKeys zurück
        window.prevKeys = { w: false, a: false, s: false, d: false, shift: false };
    }

    let usingKeyboard = keyboardActive && (keys.w || keys.a || keys.s || keys.d);
    let usingController = controllerActive && !keyboardActive;
    let usingMobile = isMobileDevice() && (typeof mobileMove === 'object') && (mobileMove.x !== 0 || mobileMove.y !== 0);
    if (!usingKeyboard && !usingMobile && !usingController) {
        playerBody.velocity.x = 0;
        playerBody.velocity.z = 0;
    }
    renderer.render(scene, camera);
}
animate();

function updateBotsAndPlayers() {
    window.bots.forEach((bot, i) => {
        if (bot.model && bot.body) {
            const groundMinX = groundBody.position.x - 50;
            const groundMaxX = groundBody.position.x + 50;
            const groundMinZ = groundBody.position.z - 50;
            const groundMaxZ = groundBody.position.z + 50;
            const botRadius = 0.5;
            const groundTop = groundBody.position.y + 0.5;
            let isOnGround = false;
            if (
                bot.body.position.x - botRadius >= groundMinX &&
                bot.body.position.x + botRadius <= groundMaxX &&
                bot.body.position.z - botRadius >= groundMinZ &&
                bot.body.position.z + botRadius <= groundMaxZ &&
                bot.body.position.y - botRadius <= groundTop + 0.01
            ) {
                bot.body.position.y = groundTop + botRadius;
                bot.body.velocity.y = 0;
                isOnGround = true;
            } else {
                bot.body.velocity.y -= 0.5;
            }
            bot.model.position.copy(bot.body.position);
            bot.model.rotation.y = bot.angle;
        }
    });
    if (playerModel) {
        playerModel.position.copy(playerBody.position);
        playerModel.position.y = playerBody.position.y;
        playerModel.rotation.y = playerAngle;
    }
}

function showOverlay(text) {
    overlayText = text;
    if (overlayTimeout) clearTimeout(overlayTimeout);
    overlayTimeout = setTimeout(() => { overlayText = ''; }, 3000);
}
function renderOverlay() {
    const ctx = renderer.domElement.getContext('2d');
    ctx.save();
    ctx.font = 'bold 32px Arial';
    ctx.fillStyle = 'rgba(255,0,0,0.8)';
    ctx.textAlign = 'center';
    if (overlayText) ctx.fillText(overlayText, window.innerWidth/2, 80);
    ctx.restore();
}
function renderLeaderboard() {
    const ctx = renderer.domElement.getContext('2d');
    ctx.save();
    ctx.font = 'bold 22px Arial';
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(10, 10, 220, 32 + 32 * (window.bots.length + 1));
    ctx.fillStyle = '#fff';
    ctx.fillText('Rangliste', 120, 38);
    let all = [...window.bots, window.playerInfo];
    all.sort((a, b) => b.score - a.score);
    all.forEach((b, i) => {
        ctx.fillText(`${i+1}. ${b.name}: ${b.score}`, 30, 70 + i * 32);
    });
    ctx.restore();
}

function updateRankingHTML() {
    const rankingList = document.getElementById('rankingList');
    if (!rankingList) return;
    let all = [playerInfo, ...bots];
    all.sort((a, b) => b.score - a.score);
    rankingList.innerHTML = '';
    all.forEach((b, i) => {
        const li = document.createElement('li');
        li.textContent = `${i+1}. ${b.name}: ${b.score}`;
        rankingList.appendChild(li);
    });
}

function showRespawnOverlay(seconds) {
    const overlay = document.getElementById('respawnOverlay');
    const timer = document.getElementById('respawnTimer');
    if (!overlay || !timer) return;
    overlay.style.display = 'flex';
    timer.textContent = `Active again in ${seconds}s`;
}
function hideRespawnOverlay() {
    const overlay = document.getElementById('respawnOverlay');
    if (overlay) overlay.style.display = 'none';
}

function botCanSee(bot, target) {
    if (!bot || !bot.position || !target || !target.position) return false;
    const dx = target.position.x - bot.position.x;
    const dz = target.position.z - bot.position.z;
    const dist = Math.sqrt(dx*dx + dz*dz);
    if (dist > 60) return false;
    return true;
}
function shootBotLaser(bot, target) {
    if (!laserTemplate || !bot.canShoot) return;
    bot.canShoot = false;
    bot.cooldown = 40;
    bot.shootOffset = Math.floor(Math.random() * 40);
    const burstCount = 1;
    for (let i = 0; i < burstCount; i++) {
        setTimeout(() => {
            const botPos = bot.body && bot.body.position ? bot.body.position : bot.position;
            let leadX = target.position.x;
            let leadZ = target.position.z;
            if (target.body && target.body.velocity) {
                leadX += target.body.velocity.x * 0.5;
                leadZ += target.body.velocity.z * 0.5;
            }
            const dx = leadX - botPos.x;
            const dz = leadZ - botPos.z;
            let angle = Math.atan2(dx, dz);
            const spread = (Math.random() - 0.5) * (Math.PI / 90);
            angle += spread;
            const dir = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle)).normalize();
            const laser = laserTemplate.clone();
            laser.traverse(function(child) { if (child.isMesh) child.material = new THREE.MeshBasicMaterial({ color: 0xff0000 }); });
            laser.position.copy(new THREE.Vector3(botPos.x, botPos.y + 2, botPos.z));
            laser.lookAt(laser.position.clone().add(dir));
            laser.userData = { direction: dir.clone(), life: 0, owner: bot };
            scene.add(laser);
            lasers.push(laser);
        }, i * 60);
    }
}
function updateBotAI() {
    window.bots.forEach(bot => {
        if (!bot.state) bot.state = { mode: 'normal', timer: 0, lastAttacked: 0 };
        // Fluchtverhalten, wenn verfolgt
        const chasers = [...window.bots.filter(b => b !== bot), window.playerInfo];
        if (isBotBeingChased(bot, chasers)) {
            bot.state.mode = 'fliehen';
            // Fluchtpunkt berechnen (vom nächsten Chaser weg)
            let nearest = null, minDist = Infinity;
            for (const chaser of chasers) {
                const cPos = chaser.body ? chaser.body.position : chaser.position;
                const bPos = bot.body.position;
                const dx = bPos.x - cPos.x;
                const dz = bPos.z - cPos.z;
                const dist = Math.sqrt(dx*dx + dz*dz);
                if (dist < minDist) { minDist = dist; nearest = cPos; }
            }
            if (nearest) {
                // Fluchtpunkt: in entgegengesetzte Richtung, aber im Arena-Bereich
                const bPos = bot.body.position;
                const dx = bPos.x - nearest.x;
                const dz = bPos.z - nearest.z;
                const norm = Math.sqrt(dx*dx + dz*dz) || 1;
                const escapeX = bPos.x + (dx/norm)*10;
                const escapeZ = bPos.z + (dz/norm)*10;
                bot.target = { x: Math.max(-45, Math.min(45, escapeX)), y: 2, z: Math.max(-45, Math.min(45, escapeZ)) };
                bot.state.timer = Math.floor(Math.random() * 40) + 20;
            }
        }
        // Sofortschuss bei Kontakt
        const closeTargets = [...window.bots.filter(b => b !== bot), window.playerInfo];
        for (const target of closeTargets) {
            if (isTargetDirectlyInFront(bot, target)) {
                if (bot.canShoot && Math.random() < 0.5) {
                    shootBotLaser(bot, target);
                    bot.canShoot = false;
                    bot.cooldown = 40;
                    bot.shootOffset = Math.floor(Math.random() * 40);
                    break;
                }
            }
        }
        // Verfolgungsmodus: Bot verfolgt zufällig einen anderen Bot oder Spieler
        if (bot.state.timer <= 0) {
            const rnd = Math.random();
            if (rnd < 0.18) {
                bot.state.mode = 'verfolgen';
                let possibleTargets = [...window.bots.filter(b => b !== bot), window.playerInfo];
                let t = possibleTargets[Math.floor(Math.random()*possibleTargets.length)];
                if (t) bot.target = { x: t.position.x, y: 2, z: t.position.z };
                bot.state.timer = Math.floor(Math.random() * 120) + 40;
            } else if (rnd < 0.25) {
                bot.state.mode = 'kreis';
                bot.state.angle = Math.random() * Math.PI * 2;
                bot.state.radius = Math.random() * 8 + 2;
                bot.state.center = {
                    x: bot.body.position.x,
                    z: bot.body.position.z
                };
                bot.state.timer = Math.floor(Math.random() * 60) + 30;
            } else if (rnd < 0.35) {
                bot.state.mode = 'tanzen';
                bot.state.timer = Math.floor(Math.random() * 20) + 5;
            } else {
                bot.state.mode = 'normal';
                bot.state.timer = Math.floor(Math.random() * 400) + 20;
                let farX = Math.random() < 0.5 ? -40 : 40;
                let farZ = Math.random() < 0.5 ? -40 : 40;
                bot.target = {
                    x: farX + Math.random()*10-5,
                    y: 2,
                    z: farZ + Math.random()*10-5
                };
            }
        }
        bot.state.timer--;
        if (bot.state.mode === 'kreis') {
            bot.state.angle += 0.18 + Math.random() * 0.15;
            const x = bot.state.center.x + Math.cos(bot.state.angle) * bot.state.radius;
            const z = bot.state.center.z + Math.sin(bot.state.angle) * bot.state.radius;
            bot.target = { x, y: 2, z };
        }
        if (bot.state.mode === 'tanzen') {
            bot.body.velocity.x = 0;
            bot.body.velocity.z = 0;
            return;
        }
        if (bot.target) {
            const bx = bot.body.position.x;
            const bz = bot.body.position.z;
            const dx = bot.target.x - bx;
            const dz = bot.target.z - bz;
            const dist = Math.sqrt(dx*dx + dz*dz);
            if (dist > 0.5) {
                let playerSpeed;
                if (bot.state.mode === 'fliehen') {
                    playerSpeed = 20;
                } else if (bot.state.mode === 'verfolgen') {
                    playerSpeed = 7;
                } else {
                    playerSpeed = 5;
                }
                bot.body.velocity.x = (dx/dist) * playerSpeed + (Math.random()-0.5)*1.2;
                bot.body.velocity.z = (dz/dist) * playerSpeed + (Math.random()-0.5)*1.2;
                bot.angle = Math.atan2(dx, dz);
                bot.body.position.x = Math.max(-45, Math.min(45, bot.body.position.x));
                bot.body.position.z = Math.max(-45, Math.min(45, bot.body.position.z));
            } else {
                bot.target = null;
            }
        }
        if (bot.cooldown > 0) bot.cooldown--;
        if (bot.shootOffset > 0) bot.shootOffset--;
        if (bot.cooldown === 0 && bot.shootOffset === 0) bot.canShoot = true;
        // Normales Schießen auf zufälliges Ziel
        let targets = window.bots.filter(b => b !== bot);
        targets.push(window.playerInfo);
        let target = targets[Math.floor(Math.random() * targets.length)];
        if (botCanSee(bot, target) && bot.canShoot && Math.random() < 0.05) {
            shootBotLaser(bot, target);
        }
    });
    if (window.playerInfo.cooldown > 0) window.playerInfo.cooldown--;
    if (window.playerInfo.cooldown === 0) window.playerInfo.canShoot = true;
    window.playerInfo.canRespawn = false;
}

function checkLaserHits() {
}

const oldAnimate = animate;
animate = function() {
    updateBotAI();
    checkLaserHits();
    updateRankingHTML();
    if (!playerInfo.canShoot && playerInfo.cooldown > 0) {
        let seconds = Math.ceil(playerInfo.cooldown / 60);
        showRespawnOverlay(seconds);
    } else {
        hideRespawnOverlay();
    }
    updateGunOverlay();
    oldAnimate();
};

window.addEventListener('keydown', function(e) {
    if (e.code === 'F6') {
        showHitboxes = !showHitboxes;
        botBoxHelpers.forEach(helper => scene.remove(helper));
        botBoxHelpers = [];
        if (playerBoxHelper) {
            scene.remove(playerBoxHelper);
            playerBoxHelper = null;
        }
        if (showHitboxes) {
            window.bots.forEach(bot => {
                if (bot.model) {
                    const helper = new THREE.BoxHelper(bot.model, 0xff0000);
                    scene.add(helper);
                    botBoxHelpers.push(helper);
                }
            });
            if (playerModel) {
                playerBoxHelper = new THREE.BoxHelper(playerModel, 0x00ff00);
                scene.add(playerBoxHelper);
            }
        }
    }
});

function setModelGray(model) {
    if (model === playerModel && playerGlowCube) {
        playerGlowCube.visible = false;
        playerEliminated = true;
    }
    window.bots.forEach((bot, idx) => {
        if (bot.model === model && botGlowCubes[idx]) {
            botGlowCubes[idx].visible = false;
            bot.eliminated = true;
        }
    });
}
function restoreModelMaterial(model) {
    if (model === playerModel && playerGlowCube) {
        playerGlowCube.material.color.set(glowColors[0]);
        playerGlowCube.material.emissive.set(glowColors[0]);
        playerEliminated = false;
    }
    window.bots.forEach((bot, idx) => {
        if (bot.model === model && botGlowCubes[idx]) {
            const colorIdx = bot.glowColorIdx || 0;
            botGlowCubes[idx].material.color.set(glowColors[colorIdx]);
            botGlowCubes[idx].material.emissive.set(glowColors[colorIdx]);
            bot.eliminated = false;
        }
    });
}

let joystickLeftActive = false, joystickRightActive = false;
let joystickLeftStart = {x:0, y:0}, joystickRightStart = {x:0, y:0};
let joystickLeftDelta = {x:0, y:0}, joystickRightDelta = {x:0, y:0};
let lastLeftTouchId = null, lastRightTouchId = null;
let mobileShootReady = false;

function getTouchPos(e, el) {
    const rect = el.getBoundingClientRect();
    let t = e.touches ? Array.from(e.touches).find(t => t.target === el || el.contains(t.target)) : e;
    if (!t) return {x:0, y:0};
    return {x: t.clientX - rect.left, y: t.clientY - rect.top};
}

const joystickLeft = document.getElementById('joystickLeft');
const joystickLeftKnob = document.getElementById('joystickLeftKnob');
const joystickRight = document.getElementById('joystickRight');
const joystickRightKnob = document.getElementById('joystickRightKnob');
const perspectiveBtn = document.getElementById('perspectiveBtn');
const lighterBtn = document.getElementById('lighterBtn');
const sprintBnt = document.getElementById('sprintBtn');
let isLighter = false;
let originalSceneBg = null;
let originalAmbientIntensity = null;
let originalSpotIntensities = [];
let originalWallColors = [];

function setArenaLighting(lighter) {
    if (!scene || !ambientLight) return;
    if (lighter) {
        if (!originalSceneBg) originalSceneBg = scene.background.clone();
        if (!originalAmbientIntensity) originalAmbientIntensity = ambientLight.intensity;
        scene.background = new THREE.Color(0xffffff);
        ambientLight.intensity = 2.5;
        scene.children.forEach(obj => {
            if (obj.isSpotLight) obj.intensity = 3.5;
        });
        scene.traverse(obj => {
            if (obj.isMesh && obj.material && obj.material.color) {
                originalWallColors.push(obj.material.color.clone());
                obj.material.color.set(0xffffff);
            }
        });
    } else {
        if (originalSceneBg) scene.background = originalSceneBg;
        if (originalAmbientIntensity) ambientLight.intensity = originalAmbientIntensity;
        let i = 0;
        scene.children.forEach(obj => {
            if (obj.isSpotLight) obj.intensity = 1.2;
        });
        scene.traverse(obj => {
            if (obj.isMesh && obj.material && obj.material.color && originalWallColors[i]) {
                obj.material.color.copy(originalWallColors[i]);
                i++;
            }
        });
        originalWallColors = [];
    }
}
if (lighterBtn) {
    let lighterActive = false;
    const lighterIcon = document.getElementById('lighterIcon');
    lighterBtn.addEventListener('click', function() {
        lighterActive = !lighterActive;
        setArenaLighting(lighterActive);
        if (lighterIcon) lighterIcon.innerHTML = lighterActive ? '&#9790;' : '&#9728;';
    });
}
window.addEventListener('DOMContentLoaded', function() {
    if (isMobileDevice()) {
        if (joystickLeft) joystickLeft.style.display = 'block';
        if (joystickRight) joystickRight.style.display = 'block';
        if (perspectiveBtn) perspectiveBtn.style.display = 'block';
        if (sprintBnt) sprintBnt.style.display = 'block';
    } else {
        if (joystickLeft) joystickLeft.style.display = 'none';
        if (joystickRight) joystickRight.style.display = 'none';
        if (perspectiveBtn) perspectiveBtn.style.display = 'none';
        if (sprintBnt) sprintBnt.style.display = 'none';
    }
});
window.addEventListener('DOMContentLoaded', function() {
    const sprintBtn = document.getElementById('sprintBtn');
    if (sprintBtn) {
        let sprintActive = false;
        sprintBtn.addEventListener('click', function() {
            sprintActive = !sprintActive;
            isSprintingMobile = sprintActive;
            sprintBtn.style.background = sprintActive ? '#ffd700' : '#ffecb3';
        });
    }
    const btn = document.getElementById('lighterBtn');
    if (isMobileDevice()) {
        if (btn) btn.style.display = 'block';
    } else {
        if (btn) btn.style.display = 'none';
    }
});
if (joystickLeft && joystickLeftKnob) {
    joystickLeft.addEventListener('touchstart', function(e) {
        joystickLeftActive = true;
        lastLeftTouchId = e.changedTouches[0].identifier;
        const pos = getTouchPos(e.changedTouches[0], joystickLeft);
        joystickLeftStart = pos;
        joystickLeftKnob.style.left = (pos.x-24)+"px";
        joystickLeftKnob.style.top = (pos.y-24)+"px";
        mobileShootReady = true;
    });
    joystickLeft.addEventListener('touchmove', function(e) {
        if (!joystickLeftActive) return;
        let t = Array.from(e.touches).find(t => t.identifier === lastLeftTouchId);
        if (!t) return;
        const pos = getTouchPos(t, joystickLeft);
        joystickLeftDelta = {x: pos.x - joystickLeftStart.x, y: pos.y - joystickLeftStart.y};
        let len = Math.sqrt(joystickLeftDelta.x**2 + joystickLeftDelta.y**2);
        if (len > 40) {
            joystickLeftDelta.x *= 40/len;
            joystickLeftDelta.y *= 40/len;
        }
        joystickLeftKnob.style.left = (joystickLeftStart.x + joystickLeftDelta.x - 24)+"px";
        joystickLeftKnob.style.top = (joystickLeftStart.y + joystickLeftDelta.y - 24)+"px";
        mobileMove = {x: joystickLeftDelta.x/40, y: joystickLeftDelta.y/40};
    });
    joystickLeft.addEventListener('touchend', function(e) {
        joystickLeftActive = false;
        joystickLeftKnob.style.left = "36px";
        joystickLeftKnob.style.top = "36px";
        mobileMove = {x:0, y:0};
        if (mobileShootReady) {
            if (window.playerInfo && window.playerInfo.canShoot && laserTemplate && playerModel) {
                const dir = new THREE.Vector3(Math.sin(playerAngle), 0, Math.cos(playerAngle)).normalize();
                const startPos = new THREE.Vector3(
                    playerModel.position.x + dir.x * 2.0,
                    playerModel.position.y + 2,
                    playerModel.position.z + dir.z * 2.0
                );
                const laser = laserTemplate.clone();
                laser.traverse(function(child) { if (child.isMesh) child.material = new THREE.MeshBasicMaterial({ color: 0x00fffc }); });
                laser.position.copy(startPos);
                laser.lookAt(startPos.clone().add(dir));
                laser.userData = { direction: dir.clone(), life: 0, owner: window.playerInfo };
                scene.add(laser);
                lasers.push(laser);
                onPlayerShoot();
            }
        }
        mobileShootReady = false;
    });
}
if (joystickRight && joystickRightKnob) {
    joystickRight.addEventListener('touchstart', function(e) {
        joystickRightActive = true;
        lastRightTouchId = e.changedTouches[0].identifier;
        const pos = getTouchPos(e.changedTouches[0], joystickRight);
        joystickRightStart = pos;
        joystickRightKnob.style.left = (pos.x-24)+"px";
        joystickRightKnob.style.top = (pos.y-24)+"px";
    });
    joystickRight.addEventListener('touchmove', function(e) {
        if (!joystickRightActive) return;
        let t = Array.from(e.touches).find(t => t.identifier === lastRightTouchId);
        if (!t) return;
        const pos = getTouchPos(t, joystickRight);
        joystickRightDelta = {x: pos.x - joystickRightStart.x, y: pos.y - joystickRightStart.y};
        let len = Math.sqrt(joystickRightDelta.x**2 + joystickRightDelta.y**2);
        if (len > 40) {
            joystickRightDelta.x *= 40/len;
            joystickRightDelta.y *= 40/len;
        }
        joystickRightKnob.style.left = (joystickRightStart.x + joystickRightDelta.x - 24)+"px";
        joystickRightKnob.style.top = (joystickRightStart.y + joystickRightDelta.y - 24)+"px";
        mobileLook = {x: joystickRightDelta.x/40, y: joystickRightDelta.y/40};
    });
    joystickRight.addEventListener('touchend', function(e) {
        joystickRightActive = false;
        joystickRightKnob.style.left = "36px";
        joystickRightKnob.style.top = "36px";
        mobileLook = {x:0, y:0};
    });
}
function updateGunOverlay() {
    const gunOverlay = document.getElementById('gunOverlay');
    if (!gunOverlay) return;
    if (cameraMode === "first" && !isMobileDevice()) {
        gunOverlay.style.display = 'block';
    } else {
        gunOverlay.style.display = 'none';
    }
}

// Kamerawechsel-Button
if (perspectiveBtn) {
    perspectiveBtn.addEventListener('click', function() {
        cameraMode = cameraMode === "third" ? "first" : "third";
        if (cameraMode === "first") {
            enablePointerLock();
        } else {
            disablePointerLock();
        }
        updateGunOverlay();
    });
}

window.addEventListener('DOMContentLoaded', function() {
    updateGunOverlay();
});

function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.matchMedia("(pointer: coarse)").matches;
    //  return true
}
