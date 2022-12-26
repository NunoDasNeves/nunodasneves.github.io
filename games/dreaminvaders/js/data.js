import * as utils from "./util.js";
Object.entries(utils).forEach(([name, exported]) => window[name] = exported);

/*
 * Static data
 */

export const debug = {
    skipAppMenu: false, // launch straight into a game
    enableControls: true,
    paused: false,
    drawAiState: true,
    drawCollision: false,
    drawSightRange: false,
    drawWeaponRange: false,
    drawAngle: false,
    drawVel: true,
    drawAccel: true,
    drawSwing: true,
    drawLaneSegs: false,
    drawBezierPoints: false,
    drawClickBridgeDebugArrow: false,
    clickedPoint: vec(),
    closestLanePoint: vec(),
    drawFPS: true,
    fps: 0,
    fpsCounter: 0,
    fpsTime: 0,
    drawNumUpdates: true,
    numUpdates: 0,
    avgUpdates: 0,
}

export const params = Object.freeze(
    function() {
        const obj = {
            numLanes: 3, // min 1, max ~6
            minNumLaneSegs: 8,
            minUnitVelocity: 0.5,
            backgroundColor: "#1f1f1f",
            baseFadeColor: "#101010",
            laneColor: "#888888",
            laneSelectedColor: "#cccccc",
            laneWidth: 60,
            laneSelectDist: 80,
            pathWidth: 40,
            pathColor: "#443322",
            lighthouseRadius: 50,
            islandRadius: 200,
            playerColors: [ "#ff9933", "#3399ff" ],
            hpBarTimeMs: 2000,
            hitFadeTimeMs: 300,
            deathTimeMs: 1000,
            fallTimeMs: 500,
            fallSizeReduction: 0.75,
            startingGold: 10,
            startingGoldPerSec: 1,
        }
        obj.laneDistFromBase = obj.islandRadius - 15;
        obj.safePathDistFromBase = obj.laneDistFromBase - obj.laneWidth*0.5;
        return obj;
    }()
);

export const TEAM = Object.freeze({
    NONE: 0,
});
export const AISTATE = Object.freeze({
    DO_NOTHING: 0,
    PROCEED: 1,
    CHASE: 2,
    ATTACK: 3,
});
export const ATKSTATE = Object.freeze({
    NONE: 0,
    AIM: 1,
    SWING: 2,
    RECOVER: 3,
});
export const HITSTATE = Object.freeze({
    ALIVE: 0,
    DEAD: 1,
});
export const ANIM = Object.freeze({
    IDLE: 0,
    WALK: 1,
    ATK_AIM: 2,
    ATK_SWING: 3,
    ATK_RECOVER: 4,
    DIE: 5,
    FALL: 6,
});

// not frozen because it'll get updated when assets are loaded
export const sprites = (()=>{
const obj = {
    chogoringu: {
        filename: "chogoringu.png",
        imgAsset: null, // not really needed here; populated by assets.js
        // dimensions of one frame of animation
        width: 16,
        height: 24,
        centerOffset: vec(0,8), // additional offset so we draw it in the right spot in relation to entity position
        rows: 2, // not including flipped/recolored frames; used to get flip offset
        playerColors: true,
        anims: {
            // all the animations will be populated by defaults if not specified
            [ANIM.IDLE]: {
                // start at this row and col in the spritesheet
                row: 0, // defaults to 0; one animation per row
                col: 0, // defaults to 0; one frame per col
                // used by game logic to loop the anim etc
                frames: 2, // defaults to 1
                frameDur: 400, // defaults to 1000
            },
            // omitting optional fields in these
            [ANIM.WALK]: {
                row: 1,
                frames: 4,
                frameDur: 100,
            },
            [ANIM.ATK_SWING]: {
                frames: 2,
                frameDur: 400,
            },
        },
    },
    tank: {
        filename: "tank.png",
        width: 64,
        height: 64,
        centerOffset: vec(0,16),
        rows: 1,
        anims: { /* use defaults; see above */ },
    },
};
// put in the default anims and stuff
const defaultAnim = {
    row: 0,
    col: 0,
    frames: 1,
    frameDur: 1000,
};
for (const sprite of Object.values(obj)) {
    sprite.imgAsset = null;
    if (!sprite.playerColors) {
        sprite.playerColors = false;
    }
    // add all the missing anims
    for (const animName of Object.values(ANIM)) {
        if (!sprite.anims[animName]) {
            sprite.anims[animName] = {};
        }
    }
    // add all the missing anim properties
    for (const anim of Object.values(sprite.anims)) {
        for (const [key, defaultVal] of Object.entries(defaultAnim)) {
            if (!anim[key]) {
                anim[key] = defaultVal;
            }
        }
    }
}
return obj;
})();

export const weapons = Object.freeze({
    none: {
        range: 0,
        aimMs: Infinity,
        swingMs: Infinity,
        recoverMs: Infinity,
        damage: 0,
        missChance: 1,
    },
    elbow: {
        range: 10,       // range starts at edge of unit radius, so the weapon 'radius' is unit.radius + weapon.range
        aimMs: 300,      // time from deciding to attack until starting attack
        swingMs: 200,    // time from starting attack til attack hits
        recoverMs: 400,  // time after attack hits til can attack again
        damage: 1,
        missChance: 0.3,
    },
    tentacle: {
        range: 30,
        aimMs: 300,
        swingMs: 300,
        recoverMs: 500,
        damage: 3,
        missChance: 0.25,
    },
});

export const units = Object.freeze({
    base: {
        weapon: weapons.none,
        maxSpeed: 0,
        accel: 0,
        angSpeed: 0,
        maxHp: 50,
        sightRange: 0,
        radius: params.lighthouseRadius,
        collides: false,
        canFall: false,
        defaultAiState: AISTATE.DO_NOTHING,
        lighthouseDamage: 0,
        goldCost: Infinity,
        draw: {
            image: "lighthouse",
        }
    },
    chogoringu: {
        weapon: weapons.elbow,
        maxSpeed: 3,
        accel: 0.4,
        angSpeed: 1,
        maxHp: 3,
        sightRange: params.laneWidth*0.5,
        radius: 10,
        collides: true,
        canFall: true,
        defaultAiState: AISTATE.PROCEED,
        lighthouseDamage: 5,
        goldCost: 5,
        draw: {
            sprite: sprites.chogoringu,
        },
    },
    tank: {
        weapon: weapons.tentacle,
        maxSpeed: 2,
        accel: 0.1,
        angSpeed: 1,
        maxHp: 10,
        sightRange: params.laneWidth*2,
        radius: 20,
        collides: true,
        canFall: true,
        defaultAiState: AISTATE.PROCEED,
        lighthouseDamage: 5,
        goldCost: 20,
        draw: {
            sprite: sprites.tank,
        },
    }
});

export const unitHotKeys = {
    'q': units.chogoringu,
    'w': units.tank,
};

/* App stuff */
export const SCREEN = Object.freeze({
    TITLE: 0,
    GAME: 1,
    GAMEOVER: 2,
    PAUSE: 3,
});