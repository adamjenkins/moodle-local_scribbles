// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// Moodle is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with Moodle.  If not, see <http://www.gnu.org/licenses/>.

/**
 * Scribbles: annotate any Moodle page on a transparent canvas and screenshot it.
 *
 * The drawing is kept as a list of operations (strokes, shapes, text) in CSS
 * pixels relative to the viewport and redrawn on every change, so undo and
 * window resizes are cheap. Screenshots come from the browser's own tab
 * capture (getDisplayMedia), which records exactly what is on screen, the
 * annotations included, whatever CSS the page uses. The capture stream is kept
 * open while the overlay is, so the browser asks to share the tab only once.
 *
 * @module     local_scribbles/scribbles
 * @copyright  2026 Adam Jenkins <adam@wisecat.net>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

import Ajax from 'core/ajax';
import Notification from 'core/notification';
import Pending from 'core/pending';
import Templates from 'core/templates';
import {getString} from 'core/str';

const SELECTORS = {
    OPEN: '[data-action="local_scribbles-open"]',
    ROOT: '[data-region="local_scribbles-root"]',
    CANVAS: '[data-region="canvas"]',
    TOOL: 'button[data-tool]',
    SWATCH: 'button[data-colour]',
    COLOURPICKER: '[data-region="colourpicker"]',
    SIZE: '[data-region="size"]',
    STATUS: '[data-region="status"]',
    ACTION: '[data-action]',
};

/** @var {Number} Longest data: URL sent to the server; larger captures are re-encoded smaller. */
const MAX_UPLOAD_LENGTH = 6 * 1024 * 1024;

/** @var {String[]} Tools drawn as a freehand stroke. */
const FREEHAND = ['pen', 'highlighter', 'eraser'];

/** @var {String[]} Every tool. */
const TOOLS = ['pen', 'highlighter', 'text', 'box', 'ellipse', 'eraser'];

/** @var {String} localStorage key of the remembered tool, colour and size. */
const STORAGE_KEY = 'local_scribbles/options';

/** @var {Object} Options used when nothing valid is remembered. */
const DEFAULT_OPTIONS = {tool: 'pen', colour: '#e03131', size: 4};

/** @var {Object|null} Page configuration from PHP. */
let config = null;

/** @var {Object|null} State of the open overlay, null when closed. */
let state = null;

/**
 * An error to show in the toolbar status line rather than as an exception.
 */
class StatusError extends Error {
    /**
     * @param {String} stringkey local_scribbles string to show
     */
    constructor(stringkey) {
        super(stringkey);
        this.stringkey = stringkey;
    }
}

/**
 * Wait for a number of milliseconds.
 *
 * @param {Number} ms
 * @returns {Promise}
 */
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Wait until the browser has painted the next frame.
 *
 * @returns {Promise}
 */
const nextPaint = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

/**
 * Font size in CSS pixels for a given brush size.
 *
 * @param {Number} size
 * @returns {Number}
 */
const textSize = (size) => 10 + size * 2;

/**
 * Stroke a smoothed path through a list of points.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array} points [[x, y], ...]
 */
const strokePoints = (ctx, points) => {
    if (points.length === 1) {
        ctx.beginPath();
        ctx.arc(points[0][0], points[0][1], ctx.lineWidth / 2, 0, Math.PI * 2);
        ctx.fill();
        return;
    }
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length - 1; i++) {
        const midx = (points[i][0] + points[i + 1][0]) / 2;
        const midy = (points[i][1] + points[i + 1][1]) / 2;
        ctx.quadraticCurveTo(points[i][0], points[i][1], midx, midy);
    }
    const last = points[points.length - 1];
    ctx.lineTo(last[0], last[1]);
    ctx.stroke();
};

/**
 * Draw one operation.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} op
 */
const drawOp = (ctx, op) => {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = op.colour;
    ctx.fillStyle = op.colour;
    ctx.lineWidth = op.size;

    switch (op.type) {
        case 'pen':
            strokePoints(ctx, op.points);
            break;
        case 'highlighter':
            // One path per stroke, so a stroke crossing itself does not darken.
            ctx.globalAlpha = 0.35;
            ctx.lineWidth = op.size * 4;
            strokePoints(ctx, op.points);
            break;
        case 'eraser':
            ctx.globalCompositeOperation = 'destination-out';
            ctx.lineWidth = op.size * 4;
            strokePoints(ctx, op.points);
            break;
        case 'box':
            ctx.strokeRect(Math.min(op.x0, op.x1), Math.min(op.y0, op.y1), Math.abs(op.x1 - op.x0), Math.abs(op.y1 - op.y0));
            break;
        case 'ellipse':
            ctx.beginPath();
            ctx.ellipse((op.x0 + op.x1) / 2, (op.y0 + op.y1) / 2, Math.abs(op.x1 - op.x0) / 2, Math.abs(op.y1 - op.y0) / 2,
                0, 0, Math.PI * 2);
            ctx.stroke();
            break;
        case 'text': {
            const fontsize = textSize(op.size);
            const lineheight = fontsize * 1.25;
            ctx.font = `${fontsize}px ${op.font}`;
            ctx.textBaseline = 'top';
            // Match the CSS half-leading of the textarea the text was typed in.
            op.text.split('\n').forEach((line, i) => {
                ctx.fillText(line, op.x, op.y + (lineheight - fontsize) / 2 + i * lineheight);
            });
            break;
        }
    }
    ctx.restore();
};

/**
 * Redraw everything since the last "clear".
 */
const render = () => {
    const {ctx, canvas, ops} = state;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    let start = 0;
    ops.forEach((op, i) => {
        if (op.type === 'clear') {
            start = i + 1;
        }
    });
    ops.slice(start).forEach((op) => drawOp(ctx, op));
    if (state.current) {
        drawOp(ctx, state.current);
    }
};

/**
 * Size the canvas backing store to the viewport and device pixel ratio.
 */
const resizeCanvas = () => {
    const {canvas, ctx} = state;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(canvas.clientWidth * dpr);
    canvas.height = Math.round(canvas.clientHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    render();
};

/**
 * Pointer position relative to the canvas.
 *
 * @param {PointerEvent} e
 * @returns {Array} [x, y]
 */
const pointOf = (e) => {
    const rect = state.canvas.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
};

/**
 * Show a message in the toolbar status line for a few seconds.
 *
 * @param {String} stringkey local_scribbles string
 * @returns {Promise}
 */
const setStatus = async(stringkey) => {
    const message = await getString(stringkey, 'local_scribbles');
    if (!state) {
        return;
    }
    const status = state.root.querySelector(SELECTORS.STATUS);
    status.textContent = message;
    clearTimeout(state.statustimer);
    state.statustimer = setTimeout(() => {
        status.textContent = '';
    }, 5000);
};

/**
 * Commit the text being typed, if any, as a text operation.
 */
const commitText = () => {
    const input = state ? state.textinput : null;
    if (!input) {
        return;
    }
    state.textinput = null;
    const text = input.value.replace(/\s+$/, '');
    if (text !== '') {
        state.ops.push({
            type: 'text',
            colour: input.dataset.colour,
            size: Number(input.dataset.size),
            font: input.dataset.font,
            x: Number(input.dataset.x),
            y: Number(input.dataset.y),
            text: text,
        });
    }
    input.remove();
    render();
};

/**
 * Drop the text being typed, if any.
 */
const cancelText = () => {
    if (state.textinput) {
        state.textinput.remove();
        state.textinput = null;
    }
};

/**
 * Open a text box at a point.
 *
 * @param {Number} x
 * @param {Number} y
 */
const startText = (x, y) => {
    commitText();
    const font = window.getComputedStyle(document.body).fontFamily || 'sans-serif';
    const fontsize = textSize(state.size);
    const input = document.createElement('textarea');
    input.className = 'local_scribbles-textinput';
    input.rows = 1;
    input.cols = 1;
    input.setAttribute('aria-label', state.strings.tooltext);
    Object.assign(input.dataset, {colour: state.colour, size: state.size, font: font, x: x, y: y});
    Object.assign(input.style, {
        left: `${x}px`,
        top: `${y}px`,
        color: state.colour,
        fontFamily: font,
        fontSize: `${fontsize}px`,
    });
    const grow = () => {
        input.style.height = 'auto';
        input.style.height = `${input.scrollHeight}px`;
        input.style.width = 'auto';
        input.style.width = `${Math.max(input.scrollWidth + fontsize, fontsize * 4)}px`;
    };
    input.addEventListener('input', grow);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            commitText();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            cancelText();
        }
    });
    input.addEventListener('blur', commitText);
    state.root.appendChild(input);
    state.textinput = input;
    grow();
    input.focus();
};

/**
 * Start drawing.
 *
 * @param {PointerEvent} e
 */
const onPointerDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) {
        return;
    }
    const [x, y] = pointOf(e);
    if (state.tool === 'text') {
        // The text box opens on pointerup, once the gesture can no longer move focus away from it.
        e.preventDefault();
        commitText();
        state.textat = [x, y];
        return;
    }
    commitText();
    state.canvas.setPointerCapture(e.pointerId);
    const base = {type: state.tool, colour: state.colour, size: state.size};
    state.current = FREEHAND.includes(state.tool)
        ? {...base, points: [[x, y]]}
        : {...base, x0: x, y0: y, x1: x, y1: y};
    render();
};

/**
 * Continue drawing.
 *
 * @param {PointerEvent} e
 */
const onPointerMove = (e) => {
    const op = state.current;
    if (!op) {
        return;
    }
    if (op.points) {
        const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
        (events.length ? events : [e]).forEach((ev) => op.points.push(pointOf(ev)));
    } else {
        let [x, y] = pointOf(e);
        if (e.shiftKey) {
            // Shift draws a square or a circle.
            const side = Math.max(Math.abs(x - op.x0), Math.abs(y - op.y0));
            x = op.x0 + Math.sign(x - op.x0 || 1) * side;
            y = op.y0 + Math.sign(y - op.y0 || 1) * side;
        }
        op.x1 = x;
        op.y1 = y;
    }
    render();
};

/**
 * Finish drawing.
 */
const onPointerUp = () => {
    if (state.textat) {
        const [x, y] = state.textat;
        state.textat = null;
        startText(x, y);
        return;
    }
    const op = state.current;
    if (!op) {
        return;
    }
    state.current = null;
    // A click with a shape tool would leave an invisible shape behind.
    if (op.points || Math.abs(op.x1 - op.x0) > 2 || Math.abs(op.y1 - op.y0) > 2) {
        state.ops.push(op);
    }
    render();
};

/**
 * The tool, colour and size last used in this browser, or the defaults.
 *
 * Storage may be blocked or hold anything, so each value is checked.
 *
 * @returns {Object} {tool, colour, size}
 */
const loadOptions = () => {
    let saved = {};
    try {
        saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY)) || {};
    } catch (error) {
        saved = {};
    }
    const size = Number(saved.size);
    return {
        tool: TOOLS.includes(saved.tool) ? saved.tool : DEFAULT_OPTIONS.tool,
        colour: /^#[0-9a-f]{6}$/i.test(saved.colour) ? saved.colour.toLowerCase() : DEFAULT_OPTIONS.colour,
        size: Number.isInteger(size) && size >= 1 && size <= 20 ? size : DEFAULT_OPTIONS.size,
    };
};

/**
 * Remember the current tool, colour and size for the next page.
 */
const saveOptions = () => {
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify({tool: state.tool, colour: state.colour, size: state.size}));
    } catch (error) {
        // Storage blocked (private window, site data disabled): options just aren't remembered.
    }
};

/**
 * Select a tool.
 *
 * @param {String} tool
 */
const selectTool = (tool) => {
    commitText();
    state.tool = tool;
    state.root.dataset.activeTool = tool;
    state.root.querySelectorAll(SELECTORS.TOOL).forEach((button) => {
        button.setAttribute('aria-pressed', button.dataset.tool === tool ? 'true' : 'false');
    });
    saveOptions();
};

/**
 * Set the brush size.
 *
 * @param {Number} size 1 to 20
 */
const selectSize = (size) => {
    state.size = size;
    state.root.querySelector(SELECTORS.SIZE).value = size;
    saveOptions();
};

/**
 * Select a colour.
 *
 * @param {String} colour CSS hex colour
 */
const selectColour = (colour) => {
    state.colour = colour;
    state.root.querySelectorAll(SELECTORS.SWATCH).forEach((swatch) => {
        swatch.setAttribute('aria-pressed', swatch.dataset.colour === colour ? 'true' : 'false');
    });
    state.root.querySelector(SELECTORS.COLOURPICKER).value = colour;
    if (state.textinput) {
        state.textinput.style.color = colour;
        state.textinput.dataset.colour = colour;
    }
    saveOptions();
};

/**
 * Undo the last operation (a "clear" included).
 */
const undo = () => {
    commitText();
    state.ops.pop();
    render();
};

/**
 * Clear the drawing. Undo brings it back.
 */
const clear = () => {
    commitText();
    if (state.ops.length && state.ops[state.ops.length - 1].type !== 'clear') {
        state.ops.push({type: 'clear'});
        render();
    }
};

/**
 * Wait for the capture stream to deliver a frame, or give up after a while
 * (a tab that is not changing may not produce new frames).
 *
 * @param {HTMLVideoElement} video
 * @returns {Promise}
 */
const nextVideoFrame = (video) => {
    if (!video.requestVideoFrameCallback) {
        return delay(200);
    }
    return Promise.race([
        new Promise((resolve) => video.requestVideoFrameCallback(() => resolve())),
        delay(500),
    ]);
};

/**
 * Capture the visible tab, annotations included, toolbar hidden.
 *
 * @returns {Promise<HTMLCanvasElement>}
 */
const captureViewport = async() => {
    if (!window.isSecureContext) {
        throw new StatusError('captureinsecure');
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        throw new StatusError('captureunsupported');
    }
    commitText();

    let firstcapture = false;
    if (!state.stream || !state.stream.active) {
        let stream;
        try {
            stream = await navigator.mediaDevices.getDisplayMedia({
                video: {displaySurface: 'browser'},
                audio: false,
                preferCurrentTab: true,
                selfBrowserSurface: 'include',
                surfaceSwitching: 'exclude',
                monitorTypeSurfaces: 'exclude',
            });
        } catch (error) {
            throw new StatusError('capturedenied');
        }
        if (!state) {
            stream.getTracks().forEach((track) => track.stop());
            throw new StatusError('capturedenied');
        }
        const video = document.createElement('video');
        video.muted = true;
        video.playsInline = true;
        video.srcObject = stream;
        await video.play();
        stream.getVideoTracks()[0].addEventListener('ended', () => {
            if (state && state.stream === stream) {
                state.stream = null;
                state.video = null;
            }
        });
        state.stream = stream;
        state.video = video;
        firstcapture = true;
    }

    const root = state.root;
    const video = state.video;
    root.classList.add('local_scribbles-capturing');
    try {
        // The first time, let the browser's share picker and banner settle.
        await delay(firstcapture ? 700 : 100);
        await nextPaint();
        await nextVideoFrame(video);
        const shot = document.createElement('canvas');
        shot.width = video.videoWidth;
        shot.height = video.videoHeight;
        shot.getContext('2d').drawImage(video, 0, 0);
        return shot;
    } finally {
        root.classList.remove('local_scribbles-capturing');
    }
};

/**
 * Encode a capture as a data: URL small enough to upload.
 *
 * @param {HTMLCanvasElement} shot
 * @returns {String}
 */
const encodeForUpload = (shot) => {
    let data = shot.toDataURL('image/png');
    if (data.length <= MAX_UPLOAD_LENGTH) {
        return data;
    }
    data = shot.toDataURL('image/jpeg', 0.85);
    if (data.length <= MAX_UPLOAD_LENGTH) {
        return data;
    }
    const scale = Math.sqrt(MAX_UPLOAD_LENGTH / data.length) * 0.9;
    const small = document.createElement('canvas');
    small.width = Math.round(shot.width * scale);
    small.height = Math.round(shot.height * scale);
    small.getContext('2d').drawImage(shot, 0, 0, small.width, small.height);
    return small.toDataURL('image/jpeg', 0.85);
};

/**
 * Show an error: a status line message, or the standard exception dialogue.
 *
 * @param {Error} error
 * @returns {Promise}
 */
const showError = (error) => {
    if (error instanceof StatusError) {
        return setStatus(error.stringkey);
    }
    return Notification.exception(error);
};

/**
 * Run a capture action once at a time.
 *
 * @param {String} name
 * @param {Function} action async function to run
 */
const runBusy = async(name, action) => {
    if (state.busy) {
        return;
    }
    state.busy = true;
    const pending = new Pending(`local_scribbles/${name}`);
    try {
        await action();
    } catch (error) {
        await showError(error);
    } finally {
        if (state) {
            state.busy = false;
        }
        pending.resolve();
    }
};

/**
 * Screenshot and save to the user's scribbles on the server.
 */
const save = () => runBusy('save', async() => {
    const shot = await captureViewport();
    await setStatus('saving');
    await Ajax.call([{
        methodname: 'local_scribbles_save_screenshot',
        args: {
            contextid: config.contextid,
            pageurl: window.location.href,
            pagetitle: document.title,
            image: encodeForUpload(shot),
        },
    }])[0];
    await setStatus('saved');
});

/**
 * Screenshot and download to the user's computer.
 */
const download = () => runBusy('download', async() => {
    const shot = await captureViewport();
    const blob = await new Promise((resolve) => shot.toBlob(resolve, 'image/png'));
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
    link.href = url;
    link.download = `scribble-${stamp}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    await setStatus('downloaded');
});

/**
 * Close the overlay and stop any capture.
 */
const close = () => {
    if (!state) {
        return;
    }
    const {root, stream, trigger, onResize, onKeyDown} = state;
    if (stream) {
        stream.getTracks().forEach((track) => track.stop());
    }
    clearTimeout(state.statustimer);
    window.removeEventListener('resize', onResize);
    document.removeEventListener('keydown', onKeyDown);
    state = null;
    root.remove();
    if (trigger && document.body.contains(trigger)) {
        trigger.focus();
    }
};

/**
 * Toolbar clicks.
 *
 * @param {MouseEvent} e
 */
const onToolbarClick = (e) => {
    const tool = e.target.closest(SELECTORS.TOOL);
    if (tool) {
        selectTool(tool.dataset.tool);
        return;
    }
    const swatch = e.target.closest(SELECTORS.SWATCH);
    if (swatch) {
        selectColour(swatch.dataset.colour);
        return;
    }
    const action = e.target.closest(SELECTORS.ACTION);
    if (!action) {
        return;
    }
    const actions = {undo, clear, download, save, close};
    if (actions[action.dataset.action]) {
        e.preventDefault();
        actions[action.dataset.action]();
    }
};

/**
 * Keyboard shortcuts: Escape closes, Ctrl/Cmd+Z undoes.
 *
 * @param {KeyboardEvent} e
 */
const onKeyDown = (e) => {
    if (state.textinput && e.target === state.textinput) {
        return;
    }
    if (e.key === 'Escape') {
        e.preventDefault();
        close();
    } else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
    }
};

/**
 * Close Boost's footer help popover when scribbles was opened from it, so it is
 * not left under the transparent overlay and in the screenshots.
 *
 * @param {HTMLElement} trigger
 */
const closeFooterPopover = (trigger) => {
    if (!trigger.closest('.popover')) {
        return;
    }
    const button = document.querySelector('[data-action="footer-popover"]');
    if (button && button.getAttribute('aria-describedby')) {
        button.click();
    }
};

/**
 * Open the overlay.
 *
 * @param {HTMLElement} trigger The element that opened it, focused again on close
 */
const open = async(trigger) => {
    if (state) {
        return;
    }
    const pending = new Pending('local_scribbles/open');
    closeFooterPopover(trigger);
    try {
        const [{html, js}, tooltext] = await Promise.all([
            Templates.renderForPromise('local_scribbles/overlay', {listurl: config.listurl}),
            getString('tooltext', 'local_scribbles'),
        ]);
        if (state) {
            return;
        }
        Templates.appendNodeContents(document.body, html, js);
        const roots = document.querySelectorAll(SELECTORS.ROOT);
        const root = roots[roots.length - 1];
        const canvas = root.querySelector(SELECTORS.CANVAS);

        state = {
            root,
            canvas,
            ctx: canvas.getContext('2d'),
            ops: [],
            current: null,
            tool: 'pen',
            colour: '#e03131',
            size: 4,
            textinput: null,
            textat: null,
            stream: null,
            video: null,
            busy: false,
            statustimer: null,
            trigger,
            strings: {tooltext},
            onResize: () => resizeCanvas(),
            onKeyDown,
        };

        const options = loadOptions();
        selectTool(options.tool);
        selectColour(options.colour);
        selectSize(options.size);

        root.addEventListener('click', onToolbarClick);
        root.querySelector(SELECTORS.COLOURPICKER).addEventListener('input', (e) => selectColour(e.target.value));
        root.querySelector(SELECTORS.SIZE).addEventListener('input', (e) => selectSize(Number(e.target.value)));
        canvas.addEventListener('pointerdown', onPointerDown);
        canvas.addEventListener('pointermove', onPointerMove);
        canvas.addEventListener('pointerup', onPointerUp);
        canvas.addEventListener('pointercancel', onPointerUp);
        // Annotations are pinned to the viewport, so the page must not scroll under them.
        root.addEventListener('wheel', (e) => e.preventDefault(), {passive: false});
        window.addEventListener('resize', state.onResize);
        document.addEventListener('keydown', onKeyDown);

        resizeCanvas();
        root.querySelector(`${SELECTORS.TOOL}[aria-pressed="true"]`).focus();
    } catch (error) {
        Notification.exception(error);
    } finally {
        pending.resolve();
    }
};

/**
 * Listen for clicks on any "open scribbles" trigger on the page.
 *
 * Delegated from the document because Boost's footer help popover shows a
 * copy of the footer HTML, so the footer link is created after page load.
 *
 * @param {Object} pageconfig
 * @param {Number} pageconfig.contextid Context of the current page
 * @param {String} pageconfig.listurl URL of the saved scribbles page
 */
export const init = (pageconfig) => {
    if (config) {
        return;
    }
    config = pageconfig;
    document.addEventListener('click', (e) => {
        const trigger = e.target.closest(SELECTORS.OPEN);
        if (trigger) {
            e.preventDefault();
            open(trigger);
        }
    });
};
