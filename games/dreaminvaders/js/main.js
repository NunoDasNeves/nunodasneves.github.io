import * as App from './app.js';
import * as Game from "./game.js";
import * as State from "./state.js";
import * as Render from "./render.js";
import * as Assets from "./assets.js";
import { debug } from "./data.js";

window.onload = start;

const frameTime = 1000 / 60;

let timeSinceLastUpdate = 0;
let previousTimeMs = 0;
let ticks = 0;

function gameLoop(timeElapsed)
{
    window.requestAnimationFrame(gameLoop);

    let timeDelta = timeElapsed - previousTimeMs;
    timeSinceLastUpdate += timeDelta;
    previousTimeMs = timeElapsed;

    // if a lot of time has passed, just reset and do a single update
    if (timeSinceLastUpdate > frameTime * 3) {
        timeSinceLastUpdate = frameTime;
    }

    while (timeSinceLastUpdate >= frameTime) {
        timeSinceLastUpdate -= frameTime;
        ticks++;
        debug.numUpdates++;
        Game.update(timeElapsed, ticks * frameTime, frameTime);
    }
    Render.draw(timeElapsed, timeDelta);
}

function initEvents()
{
    document.addEventListener('mousemove', function (event) {
        State.updateMousePos(event, Render.getBoundingClientRect());
    });

    document.addEventListener('mousedown', function (event) {
        State.updateMousePos(event, Render.getBoundingClientRect());
        State.updateMouseClick(event.button, true);
    });

    document.addEventListener('mouseup', function (event) {
        State.updateMousePos(event, Render.getBoundingClientRect());
        State.updateMouseClick(event.button, false);
    });

    document.addEventListener('wheel', function (event) {
        // TODO this is just a random scaling value, it might not work everywhere
        State.updateMouseWheel(event.deltaY * 0.001);
    });

    document.addEventListener('keydown', function (event) {
        if (event.key == 'Tab') {
            event.preventDefault();
        }
        State.updateKey(event.key, true);
    });

    // Key up event
    document.addEventListener('keyup', function (event) {
        State.updateKey(event.key, false);
    });
}

function start()
{
    App.init();
    Game.init();
    Render.init();
    Assets.init();
    initEvents();

    window.requestAnimationFrame(gameLoop);
}
