import * as utils from "./util.js";
Object.entries(utils).forEach(([name, exported]) => window[name] = exported);

import { debug, params, AISTATE, ATKSTATE, weapons, units, HITSTATE, sprites, unitHotKeys, SCREEN  } from "./data.js";
import { gameState, INVALID_ENTITY_INDEX, EntityRef, updateCameraSize, worldToCamera, worldVecToCamera, getLocalPlayer } from './state.js'
import { assets } from "./assets.js";
import * as App from './app.js';

let canvas = null;
let context = null;

/* Add to position to draw sprite centered */
function getDrawUnitPos(pos, width, height, centerOffset)
{
    return vecSub(pos, vecAddTo(vec(width*0.5, height*0.5), centerOffset));
}

function drawImage(imgAsset, pos)
{
    const drawWidth = imgAsset.width / gameState.camera.scale;
    const drawHeight = imgAsset.height / gameState.camera.scale;
    const drawPos = worldToCamera(pos.x, pos.y);

    if (imgAsset.loaded) {
        context.imageSmoothingEnabled = false;
        context.drawImage(imgAsset.img, drawPos.x, drawPos.y, drawWidth, drawHeight);
    } else {
        fillRectangleScreen(drawPos, drawWidth, drawHeight, "#000000");
    }
}

function drawSpriteScreen(sprite, row, col, pos)
{
    const asset = sprite.imgAsset;
    if (asset.loaded) {
        const sourceX = col * sprite.width;
        const sourceY = row * sprite.height;
        context.imageSmoothingEnabled = false;
        context.drawImage(
            asset.img,
            sourceX, sourceY,
            sprite.width, sprite.height,
            pos.x, pos.y,
            sprite.width, sprite.height);
    } else {
        fillRectangleScreen(pos, sprite.width, sprite.height, "#000000");
    }
}

function drawSprite(sprite, row, col, pos)
{
    const asset = sprite.imgAsset;
    const drawWidth = sprite.width / gameState.camera.scale;
    const drawHeight = sprite.height / gameState.camera.scale;
    const drawPos = worldToCamera(pos.x, pos.y);

    if (asset.loaded) {
        const sourceX = col * sprite.width;
        const sourceY = row * sprite.height;
        context.imageSmoothingEnabled = false;
        context.drawImage(
            asset.img,
            sourceX, sourceY,
            sprite.width, sprite.height,
            drawPos.x, drawPos.y,
            drawWidth, drawHeight);
    } else {
        fillRectangleScreen(drawPos, drawWidth, drawHeight, "#000000");
    }
}

function makeOffscreenCanvas(width, height)
{
    const c = new OffscreenCanvas(width, height);
    const ctx = c.getContext("2d");
    return [c, ctx];
}

function drawSpriteWithOverlay(sprite, row, col, pos, colorOverlay)
{
    // TODO
    drawSprite(sprite, row, col, pos);
}

function drawUnitAnim(i, alpha, colorOverlay)
{
    const { team, colorIdx, unit, pos, angle, animState } = gameState.entities;
    const { anim, frame, timer, loop } = animState[i];
    let flip = false;
    if (vecFromAngle(angle[i]).x < 0) {
        flip = true;
    }
    const sprite = unit[i].draw.sprite;
    const animObj = sprite.anims[anim];
    const col = animObj.col + frame;
    const flipOffset = flip ? sprite.rows : 0;
    const colorOffset = sprite.playerColors ? sprite.rows * 2 * colorIdx[i] : 0;
    const row = animObj.row + flipOffset + colorOffset;
    const drawUnitPos = getDrawUnitPos(pos[i], sprite.width, sprite.height, sprite.centerOffset);
    context.globalAlpha = alpha;
    if (colorOverlay != null) {
        drawSpriteWithOverlay(sprite, row, col, drawUnitPos, colorOverlay);
    } else {
        drawSprite(sprite, row, col, drawUnitPos);
    }
    context.globalAlpha = 1;
}

function drawUnit(i)
{
    const { team, color, unit, pos, vel, accel, angle, target, hp, aiState, atkState, physState, hitState, debugState } = gameState.entities;

    if (unit[i].draw.image) {
        const asset = assets.images[unit[i].draw.image];
        const drawUnitPos = getDrawUnitPos(pos[i], asset.width, asset.height, asset.centerOffset);
        drawImage(asset, drawUnitPos);
        return;
    }

    if (unit[i].draw.sprite) {
        let alpha = 1;
        let colorOverlay = null;
        if (hitState[i].state == HITSTATE.DEAD) {
            const f = hitState[i].deadTimer / params.deathTimeMs;
            alpha = f;
            if (hitState[i].fallTimer > 0) {
                //unitScale = (1 - params.fallSizeReduction) + (hitState[i].fallTimer / params.fallTimeMs) * params.fallSizeReduction;
            }
        } else {
            strokeCircle(pos[i], unit[i].radius, 1, color[i]);
        }
        // flash red when hit
        if (hitState[i].hitTimer > 0) {
            const f = clamp(hitState[i].hitTimer / params.hitFadeTimeMs, 0, 1);
            colorOverlay = `rgba(255, 0, 0, ${f})`
        }
        drawUnitAnim(i, alpha, colorOverlay);
    }
    // don't draw debug stuff for base
    if (unit[i] == units.base) {
        return;
    }
    // all this stuff is debug only, later we wanna draw sprites
    if (debug.drawCollision && physState[i].colliding) {
        strokeCircle(pos[i], unit[i].radius, 1, 'red');
    }
    if (debug.drawSightRange && unit[i].sightRange > 0)
    {
        strokeCircle(pos[i], unit[i].sightRange + unit[i].radius, 1, 'yellow');
    }
    if (debug.drawWeaponRange && unit[i].weapon.range > 0)
    {
        strokeCircle(pos[i], unit[i].weapon.range + unit[i].radius, 1, 'red');
    }
    // TODO remove
    if (debugState[i].velPreColl) {
        const arrowLine = vecMul(debugState[i].velPreColl, 10);
        drawArrow(pos[i], vecAdd(pos[i], arrowLine), 1, "#00ffff");
    }
    /*if (debugState[i].stopRange) {
        const arrowLine = debugState[i].stopRange;
        drawArrow(pos[i], vecAdd(pos[i], arrowLine), 1, debugState[i].stopping ? 'red' : '#00ff00');
    }*/
    if (debug.drawAngle) {
        const arrowLine = vecMulBy(vecFromAngle(angle[i]), 10);
        drawArrow(pos[i], vecAdd(pos[i], arrowLine), 1, 'white');
    }
    if (debug.drawVel) {
        const arrowLine = vecMul(vel[i], 10);
        drawArrow(pos[i], vecAdd(pos[i], arrowLine), 1, '#0066ff');
    }
    if (debug.drawAccel) {
        const arrowLine = vecMul(accel[i], 10);
        drawArrow(pos[i], vecAdd(pos[i], arrowLine), 1, '#ffdd00');
    }
    if (debug.drawAiState) {
        const color = aiState[i].state == AISTATE.PROCEED ? 'blue' : aiState[i].state == AISTATE.CHASE ? 'yellow' : 'red';
        const off = vecMulBy(vecFromAngle(angle[i]), -unit[i].radius*0.75);
        fillCircle(vecAdd(pos[i], off), unit[i].radius/3, color);
    }
    if (debug.drawSwing) {
        const t = target[i].getIndex();
        if (unit[i].weapon != weapons.none && atkState[i].state != ATKSTATE.NONE && t != INVALID_ENTITY_INDEX) {
            const dir = vecNormalize(vecSub(pos[t], pos[i]));
            const tangent = vecTangentRight(dir);
            const offTangent = vecMul(tangent, unit[i].radius*0.5);
            const off = vecMul(dir, unit[i].radius*0.75);
            let f = 0;
            let color = 'rgb(100,20,20)';
            vecAddTo(off, offTangent);
            const finalPos = vecAdd(pos[i], off);
            switch(atkState[i].state) {
                case ATKSTATE.AIM:
                    break;
                case ATKSTATE.SWING:
                {
                    const f = clamp(1 - atkState[i].timer / unit[i].weapon.swingMs, 0, 1);
                    const forwardOff = vecMul(dir, f*unit[i].weapon.range);
                    vecAddTo(finalPos, forwardOff);
                    color = `rgb(${100 + 155*f}, 20, 20)`;
                    break;
                }
                case ATKSTATE.RECOVER:
                {
                    const f = clamp(atkState[i].timer / unit[i].weapon.recoverMs, 0, 1);
                    const forwardOff = vecMul(dir, f*unit[i].weapon.range);
                    vecAddTo(finalPos, forwardOff);
                    break;
                }
            }
            fillEquilateralTriangle(finalPos, vecToAngle(dir), 5, 8, color);
        }
    }
}

function drawHpBar(i)
{
    const { team, unit, pos, vel, angle, target, hp, atkState, physState, hitState } = gameState.entities;
    // hp bar
    if (hitState[i].hpBarTimer > 0) {
        const hpBarWidth = unit[i].radius*2;
        const hpBarHeight = 3;
        const hpOff = vec(-hpBarWidth*0.5, -(unit[i].radius + unit[i].radius*0.75)); // idk
        const hpPos = vecAdd(pos[i], hpOff);
        const hpPercent = hp[i]/unit[i].maxHp;
        const filledWidth = hpPercent * hpBarWidth;
        const emptyWidth = (1 - hpPercent) * hpBarWidth;
        const emptyPos = vecAdd(hpPos, vec(filledWidth, 0))
        const hpAlpha = clamp(hitState[i].hpBarTimer / (params.hpBarTimeMs*0.5), 0, 1); // fade after half the time expired
        fillRectangle(hpPos, filledWidth, hpBarHeight, `rgba(0,255,0,${hpAlpha})`);
        fillRectangle(emptyPos, emptyWidth, hpBarHeight, `rgba(255,0,0,${hpAlpha})`);
    }
}

function strokeCircle(worldPos, radius, width, strokeStyle)
{
    const coords = worldToCamera(worldPos.x, worldPos.y);
    context.beginPath();
    context.arc(coords.x, coords.y, radius / gameState.camera.scale, 0, 2 * Math.PI);
    context.setLineDash([]);
    context.lineWidth = width / gameState.camera.scale;
    context.strokeStyle = strokeStyle;
    context.stroke();
}

function fillCircle(worldPos, radius, fillStyle)
{
    const coords = worldToCamera(worldPos.x, worldPos.y);
    context.beginPath();
    context.arc(coords.x, coords.y, radius / gameState.camera.scale, 0, 2 * Math.PI);
    context.fillStyle = fillStyle;
    context.fill();
}

function strokeCapsule(worldPos, length, radius, angle, width, strokeStyle, half=false)
{
    const dir = vecFromAngle(angle);
    const line = vecMul(dir, length);
    const worldEnd = vecAdd(worldPos, line);
    const endCoords = worldToCamera(worldEnd.x, worldEnd.y); // where the circle center will be
    const originCoords = worldToCamera(worldPos.x, worldPos.y); // start of the line
    vecRotateBy(dir, Math.PI/2); // get the direction where we'll offset to get the side lines of the capsule
    const offset = vecMul(dir, radius);
    const left = vecAdd(worldPos, offset);
    vecNegate(offset);
    const right = vecAdd(worldPos, offset);
    const leftOrigCoords = worldVecToCamera(left);
    const rightOrigCoords = worldVecToCamera(right);
    vecAddTo(left, line);
    vecAddTo(right, line);
    const leftEndCoords = worldVecToCamera(left);
    const rightEndCoords = worldVecToCamera(right);

    context.setLineDash([]);
    context.lineWidth = width / gameState.camera.scale;
    context.strokeStyle = strokeStyle;

    context.beginPath();
    context.moveTo(leftOrigCoords.x, leftOrigCoords.y);
    context.lineTo(leftEndCoords.x, leftEndCoords.y);
    context.moveTo(rightOrigCoords.x, rightOrigCoords.y);
    context.lineTo(rightEndCoords.x, rightEndCoords.y);
    context.arc(endCoords.x, endCoords.y, radius / gameState.camera.scale, angle - Math.PI/2, angle + Math.PI/2);
    context.stroke();
    if (!half) {
        context.beginPath();
        context.arc(originCoords.x, originCoords.y, radius / gameState.camera.scale, angle + Math.PI/2, angle - Math.PI/2);
        context.stroke();
    }
}

function strokeHalfCapsule(worldPos, length, radius, angle, width, strokeStyle)
{
    strokeCapsule(worldPos, length - radius, radius, angle, width, strokeStyle, true);
}

function fillEquilateralTriangle(worldPos, angle, base, height, fillStyle)
{
    const coords = worldToCamera(worldPos.x, worldPos.y);
    const scaledBase = base / gameState.camera.scale;
    const scaledHeight = height / gameState.camera.scale;
    // points right - so angle == 0
    const triPoints = [
        vec(-scaledHeight/2, -scaledBase/2),
        vec(scaledHeight/2, 0),
        vec(-scaledHeight/2, scaledBase/2),
    ];

    // rotate to angle
    triPoints.forEach((v) => vecRotateBy(v, angle));

    // move to coords
    triPoints.forEach((v) => vecAddTo(v, coords));

    context.beginPath();
    context.moveTo(triPoints[2].x, triPoints[2].y);
    for (let i = 0; i < triPoints.length; ++i) {
        context.lineTo(triPoints[i].x, triPoints[i].y);
    }

    context.fillStyle = fillStyle;
    context.fill();

}

function fillRectangleScreen(pos, width, height, fillStyle, fromCenter=false)
{
    let coords = pos;
    if (fromCenter) {
        coords = vec(pos.x - width * 0.5, pos.y - height * 0.5);
    }
    context.beginPath();
    context.rect(coords.x, coords.y, width, height);
    context.fillStyle = fillStyle;
    context.fill();
}

function fillRectangle(worldPos, width, height, fillStyle, fromCenter=false) {
    let coords = worldToCamera(worldPos.x, worldPos.y);
    const scaledWidth = width / gameState.camera.scale;
    const scaledHeight = height / gameState.camera.scale;
    fillRectangleScreen(coords, scaledWidth, scaledHeight, fillStyle, fromCenter);
}

function drawIsland(team, island)
{
    const teamColor = params.playerColors[team];
    const coords = worldToCamera(island.pos.x, island.pos.y);
    var gradient = context.createRadialGradient(coords.x, coords.y, (params.islandRadius - 50) / gameState.camera.scale, coords.x, coords.y, params.islandRadius / gameState.camera.scale);
    gradient.addColorStop(0, teamColor);
    gradient.addColorStop(1, params.baseFadeColor);

    context.fillStyle = gradient;
    context.beginPath();
    context.arc(coords.x, coords.y, params.islandRadius / gameState.camera.scale, 0, 2 * Math.PI);
    context.fill();


    context.strokeStyle = params.pathColor;
    context.setLineDash([]);
    context.lineWidth = params.pathWidth / gameState.camera.scale;

    for (const path of island.paths) {
        const points = path.map(v => worldVecToCamera(v));
        context.beginPath();
        context.moveTo(points[0].x, points[0].y);
        context.lineTo(points[1].x, points[1].y);
        context.stroke();
    }
}

function drawArrow(start, end, width, strokeStyle)
{
    const startCoords = worldVecToCamera(start);
    const endCoords = worldVecToCamera(end);
    // arrow as a vector in screen space
    const arrowDir = vecSub(endCoords, startCoords);
    const arrowLen = vecLen(arrowDir);
    const barbX = arrowLen - (5 / gameState.camera.scale);
    const barby = 5 / gameState.camera.scale; // always make head visible
    // arrow points to rotate
    const arrowPoints = [
        vec(),              // start
        vec(arrowLen, 0),   // end
        vec(barbX, barby),  // right
        vec(barbX, -barby), // left
    ];
    const arrowAngle = vecToAngle(arrowDir);
    arrowPoints.forEach(v => vecRotateBy(v, arrowAngle));
    arrowPoints.forEach(v => vecAddTo(v, startCoords));

    context.strokeStyle = strokeStyle;
    context.setLineDash([]);
    context.lineWidth = width / gameState.camera.scale;

    context.beginPath();
    // shaft
    context.moveTo(arrowPoints[0].x, arrowPoints[0].y);
    context.lineTo(arrowPoints[1].x, arrowPoints[1].y);
    // barbs
    context.moveTo(arrowPoints[2].x, arrowPoints[2].y);
    context.lineTo(arrowPoints[1].x, arrowPoints[1].y);
    context.lineTo(arrowPoints[3].x, arrowPoints[3].y);
    context.stroke();
}

function strokePoints(arr, width, strokeStyle)
{
    // line segments
    context.strokeStyle = strokeStyle;
    context.setLineDash([]);
    context.lineWidth = width / gameState.camera.scale;
    context.beginPath();
    const points = arr.map(v => worldVecToCamera(v));
    context.moveTo(points[0].x, points[0].y);

    for (let i = 1; i < points.length; ++i) {
        context.lineTo(points[i].x, points[i].y);
    }
    context.stroke();
}

function capsulePoints(arr, radius, strokeWidth, strokeStyle)
{
    for (let i = 0; i < arr.length - 1; ++i) {
        const v = vecSub(arr[i+1], arr[i]);
        const angle = vecToAngle(v);
        strokeCapsule(arr[i], vecLen(v), radius, angle, strokeWidth, strokeStyle);
    }
}

function dotPoints(arr, radius, fillStyle)
{
    for (let i = 0; i < arr.length; ++i) {
        fillCircle(arr[i], radius, fillStyle);
    }
}

function drawLane(lane, selected)
{
    // lanes; bezier curves
    context.setLineDash([]);
    context.lineWidth = params.laneWidth / gameState.camera.scale;
    context.strokeStyle = selected ? params.laneSelectedColor : params.laneColor;
    context.beginPath();
    const bezPoints = lane.bezierPoints.map(v => worldVecToCamera(v));
    context.moveTo(bezPoints[0].x, bezPoints[0].y);
    context.bezierCurveTo(bezPoints[1].x, bezPoints[1].y, bezPoints[2].x, bezPoints[2].y, bezPoints[3].x, bezPoints[3].y);
    context.stroke();

    if (debug.drawBezierPoints) {
        strokePoints(lane.bezierPoints, 3, "#00ff00");
    }

    if (debug.drawLaneSegs) {
        const bridgePoints = lane.playerLanes[0].bridgePoints[0];
        strokePoints(bridgePoints, 5, "#ff0000");
        capsulePoints(bridgePoints, params.laneWidth*0.5, 4, "#ffff00");
        dotPoints(bridgePoints, 7, "#0000ff");
        fillCircle(lane.playerLanes[0].spawnPos, 8, "#00ff00");
        fillCircle(lane.playerLanes[1].spawnPos, 8, "#00ff00");
    }
}

export function getBoundingClientRect()
{
    return canvas.getBoundingClientRect();
}

function drawUI()
{
    const buttonDims = vec(64,64);
    const buttonStart = vec(32, canvas.height-32-buttonDims.y);
    const buttonXGap = 16;
    let xoff = 0;
    const localPlayer = getLocalPlayer();
    for (const [key, unit] of Object.entries(unitHotKeys)) {
        const pos = vec(
            buttonStart.x + xoff,
            buttonStart.y
        );
        fillRectangleScreen(pos, buttonDims.x, buttonDims.y, "#444444");
        // draw sprite
        if (unit.draw.sprite) {
            const sprite = unit.draw.sprite;
            const spriteDrawPos = vecAdd(pos, vecMul(buttonDims, 0.5))
            vecSubFrom(spriteDrawPos, vecMulBy(vec(sprite.width, sprite.height), 0.5));
            drawSpriteScreen(sprite, 0, 0, spriteDrawPos);
        }
        // draw key
        drawDebugUIText(`$${unit.goldCost}`, vec(pos.x,pos.y + 58), '#ffdd22');
        // draw cost
        drawDebugUIText(`[${key}]`, vec(pos.x + 32,pos.y + 20), 'white');
        // overlay if can't afford
        if (localPlayer.gold < unit.goldCost) {
            fillRectangleScreen(pos, buttonDims.x, buttonDims.y, "rgba(20,20,20,0.6)");
        }
        xoff += buttonDims.x + buttonXGap;
    }
}

export function draw(realTimeMs, timeDeltaMs)
{
    const localPlayer = getLocalPlayer();
    updateCameraSize(canvas.width, canvas.height);

    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    context.clearRect(0, 0, canvas.width, canvas.height);

    context.fillStyle = params.backgroundColor;
    context.fillRect(0, 0, canvas.width, canvas.height);

    for (const [team, base] of Object.entries(gameState.islands)) {
        drawIsland(team, base);
    }

    for (let i = 0; i < gameState.lanes.length; ++i) {
        drawLane(gameState.lanes[i], localPlayer.laneSelected == i);
    }

    const { exists, team, unit, pos, angle, physState, hitState } = gameState.entities;
    // TODO bit of hack to draw alive units on top of dead ones
    // draw dead
    for (let i = 0; i < exists.length; ++i) {
        if (!exists[i] || (hitState[i].state != HITSTATE.DEAD)) {
            continue;
        }
        drawUnit(i);
    }
    //draw alive
    for (let i = 0; i < exists.length; ++i) {
        if (!exists[i] || (hitState[i].state != HITSTATE.ALIVE)) {
            continue;
        }
        drawUnit(i);
    }
    // only draw UI while game is running
    if (App.state.screen == SCREEN.GAME) {
        // health bars on top!
        for (let i = 0; i < exists.length; ++i) {
            if (!exists[i]) {
                continue;
            }
            drawHpBar(i);
        }
        if (debug.drawClickBridgeDebugArrow) {
            drawArrow(
                debug.closestLanePoint,
                debug.clickedPoint,
                1,
                "#ff0000"
            );
        }
        // compute fps and updates
        debug.fpsTime += timeDeltaMs;
        debug.fpsCounter++;
        if (debug.fpsTime >= 1000) {
            debug.fps = 1000*debug.fpsCounter/debug.fpsTime;
            debug.avgUpdates = debug.numUpdates/debug.fpsCounter;
            debug.fpsTime = 0;
            debug.fpsCounter = 0;
            debug.numUpdates = 0;
        }
        drawDebugUIText(`debug mode [${debug.paused ? 'paused' : 'running'}]`, vec(10,20), 'white');
        drawDebugUIText(" '`'   debug pause", vec(10,45), 'white');
        drawDebugUIText(" '.'   frame advance", vec(10,70), 'white');
        drawDebugUIText(" 'Tab' switch player", vec(10,95), 'white');
        drawDebugUIText(" 'm'   +100 gold", vec(10,120), 'white');
        drawDebugUIText(" ']'   reset game", vec(10,145), 'white');
        if (debug.drawFPS) {
            const fpsStr = `FPS: ${Number(debug.fps).toFixed(2)}`;
            drawDebugUIText(fpsStr, vec(canvas.width - 10,20), 'white', 'right');
        }
        if (debug.drawNumUpdates) {
            const updatesStr= `updates/frame: ${Number(debug.avgUpdates).toFixed(2)}`;
            drawDebugUIText(updatesStr, vec(canvas.width - 10,40), 'white', 'right');
        }
        drawDebugUIText("curr player (Tab to switch)", vec(10,200), localPlayer.color);
        for (let i = 0; i < gameState.players.length; ++i) {
            const player = gameState.players[i];
            drawDebugUIText(`$${Math.floor(player.gold)}`, vec(10, 220 + i*20), player.color);
        }

        drawUI();
    }
}

function drawDebugUIText(string, screenPos, fillStyle, align='left')
{
    context.font = "20px sans-serif";
    // draw stroke behind text so we can make a nice outline
    context.strokeStyle = 'black';
    context.setLineDash([]);
    context.lineWidth = 3;
    context.textAlign = align;
    context.strokeText(string, screenPos.x, screenPos.y);
    context.fillStyle = fillStyle;
    context.fillText(string, screenPos.x, screenPos.y);
}

export function init()
{
    canvas = document.getElementById("gamecanvas");
    context = canvas.getContext("2d");
}
