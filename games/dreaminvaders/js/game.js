import * as utils from "./util.js";
Object.entries(utils).forEach(([name, exported]) => window[name] = exported);

import { debug, params, AISTATE, HITSTATE, ATKSTATE, ANIM, weapons, units, unitHotKeys, SCREEN } from "./data.js";
import { gameState, INVALID_ENTITY_INDEX, EntityRef, spawnEntity, spawnEntityInLane, updateGameInput, initGameState, getLocalPlayer, cycleLocalPlayer } from './state.js';
import * as App from './app.js';

/*
 * Game init and update functions
 */

export function init()
{
    initGameState();
}

function forAllEntities(fn)
{
    const { exists } = gameState.entities;
    for (let i = 0; i < exists.length; ++i) {
        if (!exists[i]) {
            continue;
        }
        fn(i);
    }
}

function nearestUnit(i, minRange, filterFn)
{
    const { exists, unit, pos } = gameState.entities;
    let best = INVALID_ENTITY_INDEX;
    let minDist = minRange;
    // TODO broad phase
    for (let j = 0; j < exists.length; ++j) {
        if (!exists[j]) {
            continue;
        }
        if (!filterFn(i, j)) {
            continue;
        }
        const toUnit = vecSub(pos[j], pos[i]);
        const distToUnit = vecLen(toUnit);
        const distToUse = distToUnit - unit[j].radius - unit[i].radius;
        if (distToUse < minDist) {
            best = j;
            minDist = distToUse;
        }
    }
    return new EntityRef(best);
}

function canChaseOrAttack(myIdx, theirIdx)
{
    const { unit, pos, team, homeIsland, hitState } = gameState.entities;
    if (hitState[theirIdx].state != HITSTATE.ALIVE) {
        return false;
    }
    if (team[myIdx] == team[theirIdx]) {
        return false;
    }
    // ignore bases
    if (unit[theirIdx] == units.base) {
        return false;
    }
    // ignore if they're already too far into our island
    if (homeIsland[myIdx] && getDist(pos[theirIdx], homeIsland[myIdx].pos) < params.safePathDistFromBase) {
        return false;
    }
    return true;
}

function nearestEnemyInSightRange(i)
{
    const { unit } = gameState.entities;
    return nearestUnit(i, unit[i].sightRange, canChaseOrAttack);
}

function nearestEnemyInAttackRange(i)
{
    const { unit } = gameState.entities;
    return nearestUnit(i, unit[i].weapon.range, canChaseOrAttack);
}

// is unit i in range to attack unit j
function isInAttackRange(i, j)
{
    const { unit, pos } = gameState.entities;
    const toUnit = vecSub(pos[j], pos[i]);
    const distToUnit = vecLen(toUnit);
    const distForAttacking = Math.max(distToUnit - unit[j].radius - unit[i].radius, 0);
    return distForAttacking < unit[i].weapon.range;
}

function canAttackTarget(i)
{
    const { target, hitState } = gameState.entities;
    const targetRef = target[i];
    const t = targetRef.getIndex();
    if (t == INVALID_ENTITY_INDEX) {
        return false
    }
    return hitState[t].state == HITSTATE.ALIVE && isInAttackRange(i, t);
}

function getCollidingWith(i)
{
    const { exists, team, unit, hp, pos, vel, angle, angVel, state, lane, target, atkState, physState } = gameState.entities;
    const colls = [];
    if (!physState[i].canCollide) {
        return colls;
    }
    for (let j = 0; j < exists.length; ++j) {
        if (!exists[j]) {
            continue;
        }
        if (j == i || !physState[j].canCollide) {
            continue;
        }
        const dist = getDist(pos[i], pos[j]);
        if (dist < unit[i].radius + unit[j].radius) {
            colls.push(j);
        }
    }
    return colls;
}

function updateAllCollidingPairs(pairs)
{
    const { exists, team, unit, hp, pos, vel, angle, angVel, state, lane, target, atkState, physState } = gameState.entities;
    pairs.length = 0;

    for (let i = 0; i < exists.length; ++i) {
        if (!exists[i]) {
            continue;
        }
        if (!physState[i].canCollide) {
            continue;
        }
        for (let j = i + 1; j < exists.length; ++j) {
            if (!exists[j]) {
                continue;
            }
            if (j == i || !physState[j].canCollide) {
                continue;
            }
            const dist = getDist(pos[i], pos[j]);
            if (dist < unit[i].radius + unit[j].radius) {
                pairs.push([i, j]);
            }
        }
    }
    return pairs;
}

function getAvoidanceForce(i, seekForce)
{
    const { exists, team, unit, hp, pos, vel, angle, angVel, state, lane, target, atkState, physState, boidState } = gameState.entities;
    const bState = boidState[i];

    vecClear(bState.avoidanceForce);
    if (vecAlmostZero(vel[i])) {
        bState.avoidDir = 0;
        bState.avoiding = false;
        return bState.avoidanceForce;
    }
    const goingDir = seekForce;
    // find closest thing to avoid
    let minAvoid = -1; // boid to avoid
    let minDist = Infinity; // dist to edge of boid to avoid
    let minToBoid = vec(); // vector to boid to avoid
    const lineDir = vecNorm(goingDir);
    // the capsule that is our avoidance 'sight'
    const capsuleLen = unit[i].sightRange;
    //  the line in the center of the capsule, from our center to the center of the circle on the end
    const lineLen = capsuleLen - unit[i].radius;
    for (let j = 0; j < exists.length; ++j) {
        if (!exists[j]) {
            continue;
        }
        if (unit[j] != units.boid) {
            continue;
        }
        if (i == j) {
            continue;
        }
        const toBoid = vecSub(pos[j], pos[i]);
        // len from our center to their edge
        const len = vecLen(toBoid) - unit[j].radius;
        // TODO don't try to avoid target[i]; we wanna go straight towards it
        // can see it
        if (len > unit[i].sightRange) {
            continue;
        }
        // it's in front
        if (vecDot(lineDir, toBoid) < 0) {
            continue;
        }
        // half capsule check - capsule has unit[i].radius
        // project toBoid onto line forward
        const distAlongLine = vecDot(toBoid, lineDir);
        if (distAlongLine > lineLen) {
            // its in the capsule end
            const endOfLine = vecMul(lineDir, lineLen);
            if (getDist(endOfLine, toBoid) > (unit[i].radius + unit[j].radius)) {
                continue;
            }
        } else {
            // its in the line part, not the end part
            const closestPointOnLine = vecMul(lineDir, distAlongLine);
            if (getDist(closestPointOnLine, toBoid) > unit[i].radius + unit[j].radius) {
                continue;
            }
        }
        if (len < minDist) {
            minAvoid = j;
            minDist = len;
            minToBoid = toBoid;
        }
    }
    // time to avoid
    if (minAvoid != -1) {
        bState.avoiding = true;
        // get the direction
        const avoidForce = vecTangentRight(lineDir);
        // use old avoid direction so we don't pingpong frame-to-frame
        if (bState.avoidDir == 0) {
            bState.avoidDir = vecScalarCross(minToBoid, lineDir) > 0 ? -1 : 1;
        }
        vecMulBy(avoidForce, bState.avoidDir);
        // force is inversely proportional to forward dist (further away = avoid less)
        vecMulBy(avoidForce, 1 - minDist/capsuleLen);
        vecCopyTo(bState.avoidanceForce, avoidForce);
    } else {
        bState.avoiding = false;
        bState.avoidDir = 0;
    }
    return vecMulBy(bState.avoidanceForce, unit[i].speed);
}

function getSeparationForce(i)
{
    const { exists, team, unit, hp, pos, vel, angle, angVel, state, lane, target, atkState, physState } = gameState.entities;
    const separationForce = vec();
    let separationCount = 0;
    for (let j = 0; j < exists.length; ++j) {
        if (!exists[j]) {
            continue;
        }
        if (!physState[i].canCollide) {
            continue;
        }
        if (i == j) {
            continue;
        }
        const separationRadius = unit[i].radius + unit[j].radius + 10;
        const dist = getDist(pos[i], pos[j]);
        if (dist > separationRadius) {
            continue;
        }
        const dir = vecMul(vecSub(pos[i], pos[j]), 1/dist);
        const force = vecMul(dir, separationRadius - dist);
        vecAddTo(separationForce, force);
        separationCount++;
    }
    if (separationCount > 0) {
        vecMulBy(separationForce, 1/separationCount);
    }

    return separationForce;
}

function decel(i)
{
    const { unit, vel, accel } = gameState.entities;
    // friction: decelerate automatically if velocity with no acceleration
    const velLen = vecLen(vel[i]);
    // accel to inverse of velLen; ensures we don't undershoot and go backwards
    vecClear(accel[i])
    vecCopyTo(accel[i], vel[i]);
    vecNegate(accel[i]);
    // common case; reduce vel by acceleration rate
    if (unit[i].accel < velLen) {
        vecSetMag(accel[i], unit[i].accel);
    }
}

function accelAwayFromEdge(i)
{
    const { unit, lane, team, pos, accel } = gameState.entities;
    const bridgePoints = lane[i].bridgePoints;
    const { dir, dist } = pointNearLineSegs(pos[i], bridgePoints);
    const distUntilFall = params.laneWidth*0.5 - dist;
    if (distUntilFall < unit[i].radius) {
        const x =  clamp(distUntilFall / unit[i].radius, 0, 1);
        // smoothstep
        const a = x * x * (3 - 2 * x);
        const fullIn = vecMul(dir, -unit[i].accel);
        const inVec = vecMul(fullIn, 1 - a);
        const stayVec = vecMul(accel[i], a);
        const result = vecAdd(inVec, stayVec);
        vecCopyTo(accel[i], result);
        vecClampMag(accel[i], 0, unit[i].accel);
    }
}

function updateAiState()
{
    const { exists, team, unit, hp, pos, vel, accel, angle, angVel, state, lane, target, aiState, atkState, physState, debugState } = gameState.entities;

    for (let i = 0; i < exists.length; ++i) {
        if (!exists[i]) {
            continue;
        }
        if (aiState[i].state == AISTATE.DO_NOTHING) {
            continue;
        }
        const enemyIslandPos = gameState.players[lane[i].otherPlayerIdx].island.pos;
        const toEnemyBase = vecSub(enemyIslandPos, pos[i]);
        const distToEnemyBase = vecLen(toEnemyBase);
        const nearestAtkTarget = nearestEnemyInAttackRange(i);
        const nearestChaseTarget = nearestEnemyInSightRange(i);
        switch (aiState[i].state) {
            case AISTATE.PROCEED:
            {
                if (distToEnemyBase < unit[i].radius) {
                    aiState[i].state = AISTATE.DO_NOTHING;
                    decel(i); // stand still
                    break;
                }
                if (distToEnemyBase < params.safePathDistFromBase) {
                    // keep proceeding
                } else if (nearestAtkTarget.isValid()) {
                    aiState[i].state = AISTATE.ATTACK;
                    target[i] = nearestAtkTarget;
                } else if (nearestChaseTarget.isValid()) {
                    aiState[i].state = AISTATE.CHASE;
                    target[i] = nearestChaseTarget;
                }
                break;
            }
            case AISTATE.CHASE:
            {
                // switch to attack if in range (and mostly stopped)
                // units can get stuck partially off the edge without
                // their vel going to almostZero, so this kinda fixes that
                const mostlyStopped = vecLen(vel[i]) < (unit[i].maxSpeed * 0.5);
                if (nearestAtkTarget.isValid() && mostlyStopped) {
                    aiState[i].state = AISTATE.ATTACK;
                    target[i] = nearestAtkTarget;
                    atkState[i].timer = unit[i].weapon.aimMs;
                    atkState[i].state = ATKSTATE.AIM;

                // otherwise always chase nearest
                } else if (nearestChaseTarget.isValid()) {
                    target[i] = nearestChaseTarget;

                // otherwise... continue on
                } else {
                    aiState[i].state = AISTATE.PROCEED;
                }
                break;
            }
            case AISTATE.ATTACK:
            {
                // check we can still attack the current target
                if (!canAttackTarget(i)) {
                    target[i].invalidate();
                }
                /*
                 * If we can't attack the current target, target[i] is invalid;
                 * Try to pick a new target, or start chasing
                 */
                if (!target[i].isValid()) {
                    if (nearestAtkTarget.isValid()) {
                        target[i] = nearestAtkTarget;
                        atkState[i].timer = unit[i].weapon.aimMs;
                        atkState[i].state = ATKSTATE.AIM;

                    } else if (nearestChaseTarget.isValid()) {
                        aiState[i].state = AISTATE.CHASE;
                        target[i] = nearestChaseTarget;

                    } else {
                        aiState[i].state = AISTATE.PROCEED;
                    }
                }
                break;
            }
        }
        // make decisions based on state
        switch (aiState[i].state) {
            case AISTATE.PROCEED:
            {
                const bridgePoints = lane[i].bridgePoints;
                const { baseIdx, point, dir, dist } = pointNearLineSegs(pos[i], bridgePoints);
                let currIdx = baseIdx;
                let nextIdx = baseIdx+1;
                // if close to next point, go there instead
                if (getDist(pos[i], bridgePoints[baseIdx+1]) < params.laneWidth*0.5) {
                    currIdx++;
                    nextIdx++;
                }
                const currPoint = bridgePoints[currIdx];
                const nextPoint = vec();
                // little bit of a hack, just check if we're on the island to go straight to the base
                let goToPoint = false
                if (nextIdx >= bridgePoints.length || getDist(pos[i], enemyIslandPos) < params.islandRadius) {
                    goToPoint = true;
                    vecCopyTo(nextPoint, enemyIslandPos);
                } else {
                    vecCopyTo(nextPoint, bridgePoints[nextIdx]);
                }
                let goDir = null
                if (goToPoint) {
                    // go to the point
                    goDir = vecNormalize(vecSub(nextPoint, pos[i]))
                } else {
                    // go parallel to the bridge line
                    goDir = vecNormalize(vecSub(nextPoint, currPoint));
                }
                accel[i] = vecMul(goDir, unit[i].accel);
                if (!isOnIsland(i)) {
                    accelAwayFromEdge(i);
                }
                target[i].invalidate();
                atkState[i].state = ATKSTATE.NONE;
                break;
            }
            case AISTATE.CHASE:
            {
                const t = target[i].getIndex();
                console.assert(t != INVALID_ENTITY_INDEX);
                const toTarget = vecSub(pos[t], pos[i]);
                const distToTarget = vecLen(toTarget);
                if (almostZero(distToTarget)) {
                    decel(i);
                    accelAwayFromEdge(i);
                    break;
                }
                const rangeToTarget = distToTarget - unit[i].radius - unit[t].radius;
                const desiredRange = unit[i].weapon.range;
                const distToDesired = rangeToTarget - desiredRange;
                if (distToDesired < 0) {
                    decel(i);
                    accelAwayFromEdge(i);
                    break;
                }
                const dirToTarget = vecNorm(toTarget, 1/distToTarget);
                const velTowardsTarget = vecDot(vel[i], dirToTarget);
                // compute the approximate stopping distance
                // ...these are kinematic equations of motion!
                // underestimate the time it takes to stop by a frame
                const stopFrames = Math.ceil(velTowardsTarget / unit[i].accel - 1); // v = v_0 + at, solve for t
                const stopRange = ( velTowardsTarget + 0.5*unit[i].accel*stopFrames ) * stopFrames; // dx = v_0t + 1/2at^2
                debugState[i].stopRange = vecMul(dirToTarget, stopRange);
                if ( distToDesired > stopRange ) {
                    accel[i] = vecMul(dirToTarget, Math.min(unit[i].accel, distToDesired));
                    debugState[i].stopping = false;
                } else {
                    debugState[i].stopping = true;
                    decel(i);
                }
                accelAwayFromEdge(i);
                break;
            }
            case AISTATE.ATTACK:
            {
                const t = target[i].getIndex();
                console.assert(t != INVALID_ENTITY_INDEX);
                decel(i); // stand still
            }
            break;
        }
    }
}

function mouseLeftPressed()
{
    return gameState.input.mouseLeft && !gameState.lastInput.mouseLeft;
}

function keyPressed(k)
{
    return gameState.input.keyMap[k] && !gameState.lastInput.keyMap[k];
}

function updatePhysicsState()
{
    const { exists, team, unit, hp, pos, vel, accel, angle, angVel, state, lane, target, aiState, atkState, physState, hitState, debugState } = gameState.entities;

    // very simple collisions, just reset position
    const pairs = [];
    // move, collide
    for (let i = 0; i < exists.length; ++i) {
        if (!exists[i]) {
            continue;
        }
        physState[i].colliding = false;
        vecAddTo(vel[i], accel[i]);
        vecClampMag(vel[i], 0, unit[i].maxSpeed);
        if (vecAlmostZero(vel[i])) {
            vecClear(vel[i]);
        }
        debugState[i].velPreColl = vecClone(vel[i]);
        vecAddTo(pos[i], vel[i]);
    };

    updateAllCollidingPairs(pairs);
    for (let k = 0; k < pairs.length; ++k) {
        const [i, j] = pairs[k];
        physState[i].colliding = true;
        physState[j].colliding = true;
        const dir = vecSub(pos[j],pos[i]);
        const len = vecLen(dir);
        if ( almostZero(len) ) {
            dir = vec(1,0);
        } else {
            vecMulBy(dir, 1/len);
        }
        const veliLen = vecLen(vel[i])
        const veljLen = vecLen(vel[j])
        const velSum = veliLen + veljLen;
        let velif = 0.5;
        let veljf = 0.5;
        if (!almostZero(velSum)) {
            velif = veliLen / velSum;
            veljf = veljLen / velSum;
        }
        const correctioni = (unit[i].radius + unit[j].radius - len) * velif;
        const correctionj = (unit[i].radius + unit[j].radius - len) * veljf;
        const corrPos = vecMul(dir, correctionj);
        const dirNeg = vecMul(dir, -1);
        const corrNeg = vecMul(dirNeg, correctioni);

        vecAddTo(pos[i], corrNeg);
        vecAddTo(pos[j], corrPos);

        // fix the velocity; slide by removing component normal to collision
        // only if it's > 0, otherwise we'll go toward the collision!
        const veliNormLen = vecDot(vel[i], dir);
        if (veliNormLen > 0) {
            vecSubFrom(vel[i], vecMul(dir, veliNormLen));
        }
        const veljNormLen = vecDot(vel[j], dirNeg);
        if (veljNormLen > 0) {
            vecSubFrom(vel[j], vecMul(dirNeg, veljNormLen));
        }
    }

    // rotate to face vel
    forAllEntities((i) => {
        if (vecLen(vel[i]) > params.minUnitVelocity) {
            angle[i] = vecToAngle(vel[i]);
        }
    });
}

function hitEntity(i, damage)
{
    const { unit, hp, hitState } = gameState.entities;
    hp[i] -= damage;
    hitState[i].hitTimer = params.hitFadeTimeMs;
    hitState[i].hpBarTimer = params.hpBarTimeMs;
}

function isOnIsland(i)
{
    const { pos } = gameState.entities;
    for (const island of Object.values(gameState.islands)) {
        if (getDist(pos[i], island.pos) < params.islandRadius) {
            return true;
        }
    }
    return false;
}

function updateHitState(timeDeltaMs)
{
    const { freeable, unit, color, pos, vel, accel, hp, lane, team, aiState, atkState, hitState, physState } = gameState.entities;
    forAllEntities((i) => {
        hitState[i].hitTimer = Math.max(hitState[i].hitTimer - timeDeltaMs, 0);
        hitState[i].hpBarTimer = Math.max(hitState[i].hpBarTimer - timeDeltaMs, 0);

        switch (hitState[i].state) {
            case HITSTATE.ALIVE:
            {
                const onIsland = isOnIsland(i);
                // die from damage
                if (hp[i] <= 0) {
                    // fade hpTimer fast
                    if (hitState[i].hpBarTimer > 0) {
                        hitState[i].hpBarTimer = params.deathTimeMs*0.5;
                    }
                    hitState[i].deadTimer = params.deathTimeMs;
                    hitState[i].state = HITSTATE.DEAD;
                    aiState[i].state = AISTATE.DO_NOTHING;
                    atkState[i].state = ATKSTATE.NONE;
                    physState[i].canCollide = false;
                    vecClear(vel[i]);
                    vecClear(accel[i]);
                // die from falling
                } else if (!onIsland && physState[i].canFall && hitState[i].state == HITSTATE.ALIVE) {
                    const { baseIdx, point, dir, dist } = pointNearLineSegs(pos[i], lane[i].bridgePoints);
                    if (dist >= params.laneWidth*0.5) {
                        // TODO push it with a force, don't just teleport
                        vecAddTo(pos[i], vecMulBy(dir, unit[i].radius));
                        // fade hpTimer fast
                        if (hitState[i].hpBarTimer > 0) {
                            hitState[i].hpBarTimer = params.deathTimeMs*0.5;
                        }
                        hitState[i].fallTimer = params.fallTimeMs;
                        hitState[i].deadTimer = params.fallTimeMs; // same as fall time!
                        hitState[i].state = HITSTATE.DEAD;
                        aiState[i].state = AISTATE.DO_NOTHING;
                        atkState[i].state = ATKSTATE.NONE;
                        physState[i].canCollide = false;
                        vecClear(vel[i]);
                        vecClear(accel[i]);
                    }
                // 'die' by scoring
                } else {
                    for (const player of gameState.players) {
                        if (player.team == team[i]) {
                            continue;
                        }
                        const enemyLighthouse = player.island;
                        if (onIsland && getDist(pos[i], enemyLighthouse.pos) < params.lighthouseRadius) {
                            hitEntity(enemyLighthouse.idx, unit[i].lighthouseDamage);
                            if ( hp[enemyLighthouse.idx] <= 0 ) {
                                App.gameOver(team[i], color[i]);
                            }
                            // instantly disappear this frame
                            freeable[i] = true;
                        }
                    }
                }
                break;
            }
            case HITSTATE.DEAD:
            {
                if (hitState[i].fallTimer > 0) {
                    hitState[i].fallTimer -= timeDeltaMs;
                }
                hitState[i].deadTimer -= timeDeltaMs;
                if (hitState[i].deadTimer <= 0) {
                    freeable[i] = true;
                }
                break;
            }
        }
    });
}

function updateAtkState(timeDeltaMs)
{
    const { exists, team, unit, hp, pos, vel, angle, angVel, state, lane, target, atkState, physState } = gameState.entities;

    forAllEntities((i) => {
        const newTime = atkState[i].timer - timeDeltaMs;
        if (newTime > 0) {
            atkState[i].timer = newTime;
            return;
        }
        // timer has expired
        switch (atkState[i].state) {
            case ATKSTATE.NONE:
            {
                atkState[i].timer = 0;
                break;
            }
            case ATKSTATE.AIM:
            {
                atkState[i].state = ATKSTATE.SWING;
                atkState[i].timer = newTime + unit[i].weapon.swingMs; // there may be remaining negative time; remove that from the timer by adding here
                break;
            }
            case ATKSTATE.SWING:
            {
                atkState[i].state = ATKSTATE.RECOVER;
                atkState[i].timer = newTime + unit[i].weapon.recoverMs;
                // hit!
                if (canAttackTarget(i) && Math.random() > unit[i].weapon.missChance) {
                    const t = target[i].getIndex();
                    console.assert(t != INVALID_ENTITY_INDEX);
                    hitEntity(t, unit[i].weapon.damage);
                }
                break;
            }
            case ATKSTATE.RECOVER:
            {
                atkState[i].state = ATKSTATE.AIM;
                atkState[i].timer = newTime + unit[i].weapon.aimMs;
                break;
            }
        }
    });
}

function updateAnimState(timeDeltaMs)
{
    const { exists, unit, aiState, atkState, animState } = gameState.entities;

    forAllEntities((i) => {
        const aState = animState[i];
        const sprite = unit[i].draw.sprite;
        if (!sprite) {
            return;
        }
        aState.timer -= timeDeltaMs;
        // TODO this properly... this is all placeholder
        switch (aiState[i].state) {
            case AISTATE.PROCEED:
            case AISTATE.CHASE:
            {
                aState.anim = ANIM.WALK;
                break;
            }
            case AISTATE.ATTACK:
            {
                aState.anim = ANIM.IDLE;
                break;
            }
            default:
            {
                aState.anim = ANIM.IDLE;
                break;
            }
        }
        const anim = sprite.anims[aState.anim];
        if (aState.timer <= 0) {
            aState.timer += anim.frameDur;
            aState.frame = (aState.frame + 1) % anim.frames;
        }
    });
}

function updatePlayerState(timeDeltaMs)
{
    const timeDeltaSec = 0.001 * timeDeltaMs;
    for (const player of gameState.players) {
        player.gold += player.goldPerSec * timeDeltaSec;
    }
}

function updateGame(timeDeltaMs)
{
    const { exists, freeable } = gameState.entities;

    // order here matters!
    updatePhysicsState();
    updateAtkState(timeDeltaMs);
    updateAiState();
    updateAnimState(timeDeltaMs);

    // this should come right before reap
    updateHitState(timeDeltaMs);
    // reap freeable entities
    for (let i = 0; i < exists.length; ++i) {
        if (exists[i] && freeable[i]) {
            exists[i] = false;
            // add to free list
            gameState.entities.nextFree[i] = gameState.freeSlot;
            gameState.freeSlot = i;
        }
    };

    updatePlayerState(timeDeltaMs);
}

/*
 * Get info about relationship between point and the closest point on lineSegs;
 * lineSegs is a list of points treated as joined line segments.
 * Returns: {
 *      baseIdx,    // index in lineSegs of 'base' of line which point is closest to
 *      point,      // point on lineSegs which is closest to point argument
 *      dir,        // direction from point on lineSegs to point argument. null if point is very close to the line
 *      dist,       // distance from point arg to closest point on lineSegs
 * }
 */
function pointNearLineSegs(point, lineSegs)
{
    let minBaseIdx = 0;
    let minPoint = null;
    let minDir = null;
    let minDist = Infinity;
    for (let i = 0; i < lineSegs.length - 1; ++i) {
        const capsuleLine = vecSub(lineSegs[i+1], lineSegs[i]);
        const lineLen = vecLen(capsuleLine);
        const baseToPoint = vecSub(point, lineSegs[i]);
        if (almostZero(lineLen)) {
            const d = vecLen(baseToPoint);
            if (d < minDist) {
                minDist = d;
                minBaseIdx = i;
                minPoint = vecClone(lineSegs[i]);
                minDir = almostZero(d) ? null : vecMul(baseToPoint, 1/d);
            }
            continue;
        }
        const lineDir = vecMul(capsuleLine, 1/lineLen);
        const distAlongLine = vecDot(lineDir, baseToPoint);
        if (distAlongLine < 0) {
            const d = vecLen(baseToPoint);
            if (d < minDist) {
                minDist = d;
                minBaseIdx = i;
                minPoint = vecClone(lineSegs[i]);
                minDir = almostZero(d) ? null : vecMul(baseToPoint, 1/d);
            }
        } else if (distAlongLine > lineLen) {
            const dir = vecSub(point, lineSegs[i+1]);
            const d = vecLen(dir);
            if (d < minDist) {
                minDist = d;
                minBaseIdx = i; // its the 'base' of the segment, so it is i and not i+1
                minPoint = vecClone(lineSegs[i+1]);
                minDir = almostZero(d) ? null : vecMul(dir, 1/d);
            }
        } else {
            const pointOnLine = vecAddTo(vecMul(lineDir, distAlongLine), lineSegs[i]);
            const dir = vecSub(point, pointOnLine);
            const d = vecLen(dir);
            if (d < minDist) {
                minDist = d;
                minBaseIdx = i;
                minPoint = pointOnLine;
                minDir = almostZero(d) ? null : vecMul(dir, 1/d);
            }
        }
    }
    return { baseIdx: minBaseIdx, point: minPoint, dir: minDir, dist: minDist };
}

function processLocalPlayerInput()
{
    // select lane
    const localPlayer = getLocalPlayer();
    localPlayer.laneSelected = -1;
    let minLane = 0;
    let minDist = Infinity;
    let minStuff = null;
    for (let i = 0; i < gameState.lanes.length; ++i) {
        const lane = gameState.lanes[i].playerLanes[0];
        const stuff = pointNearLineSegs(gameState.input.mousePos, lane.bridgePoints);
        if (stuff.dist < minDist) {
            minLane = i;
            minDist = stuff.dist;
            minStuff = stuff;
        }
    }
    if (minDist < params.laneSelectDist) {
        localPlayer.laneSelected = minLane;
    }
    if (localPlayer.laneSelected >= 0) {
        for (const [key, unit] of Object.entries(unitHotKeys)) {
            if (keyPressed(key)) {
                if (localPlayer.gold >= unit.goldCost) {
                    localPlayer.gold -= unit.goldCost;
                    spawnEntityInLane(localPlayer.laneSelected, gameState.localPlayerIdx, unit);
                }
            }
        }
    }
    // camera controls
    gameState.camera.scale = clamp(gameState.camera.scale + gameState.input.mouseScrollDelta, 0.1, 5);
    if (gameState.input.mouseMiddle) {
        const delta = vecMul(vecSub(gameState.input.mouseScreenPos, gameState.lastInput.mouseScreenPos), gameState.camera.scale);
        if (vecLen(delta)) {
            vecSubFrom(gameState.camera.pos, delta);
        }
    }

    if (debug.enableControls) {
        if (mouseLeftPressed()) {
            debug.clickedPoint = vecClone(gameState.input.mousePos);
            debug.closestLanePoint = minStuff.point;
        }
    }
}

export function update(realTimeMs, __ticksMs /* <- don't use this unless we fix debug pause */, timeDeltaMs)
{
    if (App.state.screen != SCREEN.GAME) {
        return;
    }

    if (debug.enableControls) {
        // TODO this will mess up ticksMs if we ever use it for anything, so don't for now
        if (keyPressed('`')) {
            debug.paused = !debug.paused;
        }
        if (keyPressed(']')) {
            init();
        }
        if (keyPressed('Tab')) {
            cycleLocalPlayer();
        }
        if (keyPressed('m')) {
            getLocalPlayer().gold += 100;
        }
    }
    if (keyPressed('p')) {
        App.pause();
    } else {
        // keep getting input while debug paused
        processLocalPlayerInput();
        if (!debug.enableControls || !debug.paused || keyPressed('.')) {
            updateGame(timeDeltaMs);
        }
    }
    updateGameInput();
}
