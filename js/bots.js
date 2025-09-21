const botNames = ["James", "John", "Robert", "Michael", "William", "David", "Richard", "Joseph", "Thomas", "Charles"];
const bots = [];
const BOT_COUNT = 3;
const arenaMin = -45;
const arenaMax = 45;
for (let i = 0; i < BOT_COUNT; i++) {
    const name = botNames[i % botNames.length];
    const x = Math.random() * (arenaMax - arenaMin) + arenaMin;
    const z = Math.random() * (arenaMax - arenaMin) + arenaMin;
    bots.push({
        name,
        position: { x, y: 2, z },
        angle: Math.random() * Math.PI * 2,
        canShoot: true,
        cooldown: 0,
        shootOffset: Math.floor(Math.random() * 40),
        score: 0,
        model: null,
        tagMesh: null,
        target: null,
        moveCooldown: Math.floor(Math.random() * 120) + 60,
        standCooldown: 0,
        personality: {
            aggression: Math.random(),
            wander: Math.random(),
            reaction: Math.random() * 0.5 + 0.5
        },
        body: null,
        lastHitBy: {}
    });
}
const playerInfo = {
    name: "Player",
    score: 0,
    cooldown: 0,
    canShoot: true,
    position: { x: 0, y: 2, z: 0 },
    lastHitBy: {}
};
window.bots = bots;
window.playerInfo = playerInfo;
