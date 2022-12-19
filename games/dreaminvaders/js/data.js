/*
 * Static data
 */

export const debug = {
    drawState: false,
    drawRadii: false,
    drawSight: false,
    drawAngle: false,
    drawCapsule: true,
    drawForces: true,
    drawSwing: true,
    drawLaneSegs: false,
    drawBezierPoints: false,
    drawClickBridgeDebugArrow: false,
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
            pathWidth: 40,
            pathColor: "#443322",
            lighthouseRadius: 50,
            islandRadius: 200,
            teamColors: [ "#6f6f6f", "#ff9933", "#3399ff" ], // first one is 'no team'
            hpBarTimeMs: 2000,
            hitFadeTimeMs: 300,
            deathTimeMs: 1000,
            fallTimeMs: 500,
            fallSizeReduction: 0.75,
        }
        obj.laneDistFromBase = obj.islandRadius - 15;
        obj.safePathDistFromBase = obj.laneDistFromBase - obj.laneWidth*0.5;
        return obj;
    }()
);

export const TEAM = Object.freeze({
    NONE: 0,
    ORANGE: 1,
    BLUE: 2,
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
        range: 5,        // range starts at edge of unit radius, so the weapon 'radius' is unit.radius + weapon.range
        aimMs: 300,      // time from deciding to attack until starting attack
        swingMs: 200,    // time from starting attack til attack hits
        recoverMs: 400,  // time after attack hits til can attack again
        damage: 1,
        missChance: 0.3,
    }
});

export const units = Object.freeze({
    base: {
        weapon: weapons.none,
        speed: 0,
        angSpeed: 0,
        maxHp: 1000,
        sightRadius: 0,
        radius: params.lighthouseRadius,
        collides: false,
        canFall: false,
        defaultAiState: AISTATE.DO_NOTHING,
        lighthouseDamage: 0,
        draw: {
            shape: "circle",
            strokeColor: "red",
        }
    },
    circle: {
        weapon: weapons.elbow,
        speed: 3,
        angSpeed: 1,
        maxHp: 3,
        sightRadius: params.laneWidth*0.75,
        radius: 10,
        collides: true,
        canFall: true,
        defaultAiState: AISTATE.PROCEED,
        lighthouseDamage: 5,
        draw: {
            shape: "circle",
            fillColor: "TEAM",
        }
    },
    boid: {
        weapon: weapons.none,
        speed: 1,
        angspeed: 0.5,
        maxHp: 1,
        sightRadius: params.laneWidth,
        radius:10,
        collides: true,
        canFall: false,
        defaultAiState: AISTATE.DO_NOTHING,
        lighthouseDamage: 0,
        draw: {
            shape: "triangle",
            fillColor: "TEAM",
        }
    }
});