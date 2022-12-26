import * as utils from "./util.js";
Object.entries(utils).forEach(([name, exported]) => window[name] = exported);
import { debug, SCREEN } from "./data.js";
import { init as resetGame } from "./game.js";

export let state = null;

const elemData = [
    // title
    {
        id: 'titleMenu',
        screen: SCREEN.TITLE,
    },
    {
        id: 'buttonStartLocalDebug',
        fn: startGame,
        screen: SCREEN.TITLE,
    },
    {
        id: 'buttonStartPvE',
        fn: startGame,
        screen: SCREEN.TITLE,
    },
    {
        id: 'buttonStartPvPLocal',
        fn: startGame,
        screen: SCREEN.TITLE,
    },
    // pause
    {
        id: 'pauseMenu',
        screen: SCREEN.PAUSE,
    },
    {
        id: 'buttonContinue',
        fn: unpause,
        screen: SCREEN.PAUSE,
    },
    // game over
    {
        id: 'gameOverMenu',
        screen: SCREEN.GAMEOVER,
    },
    {
        id: 'buttonBackToTitle',
        fn: backToTitle,
        screen: SCREEN.GAMEOVER,
    },
];

const screenElems = {};

function changeScreen(screen)
{
    const currScreen = state.screen;
    const newScreen = screen;
    for (const elem of screenElems[currScreen]) {
        elem.hidden = true;
    }
    for (const elem of screenElems[newScreen]) {
        elem.hidden = false;
    }

    state.screen = newScreen;
}

export function init()
{
    state = {
        screen: SCREEN.TITLE,
    };
    for (const screenName of Object.values(SCREEN)) {
        screenElems[screenName] = [];
    }
    for (const data of elemData) {
        const { id, screen } = data;
        const elem = document.getElementById(id);
        if (elem.nodeName == 'INPUT' && elem.type == 'button') {
            elem.onclick = data.fn;
        }
        // hide em all by default
        elem.hidden = true;
        screenElems[screen].push(elem);
    }

    changeScreen(SCREEN.TITLE);
    if (debug.skipAppMenu) {
        changeScreen(SCREEN.GAME);
    }

    const appUIElem = document.getElementById("appUI");
    appUIElem.hidden = false;
}

export function startGame()
{
    changeScreen(SCREEN.GAME);
}

export function gameOver(winnerName, color)
{
    changeScreen(SCREEN.GAMEOVER);
}

function backToTitle()
{
    changeScreen(SCREEN.TITLE);
    resetGame();
}

export function pause()
{
    changeScreen(SCREEN.PAUSE);
}

function unpause()
{
    changeScreen(SCREEN.GAME);
}