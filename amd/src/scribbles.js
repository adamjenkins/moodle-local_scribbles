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
 * The drawing is kept as a list of annotations (strokes, shapes, text) in CSS
 * pixels relative to the viewport and redrawn on every change. Each can be
 * selected and changed afterwards, and the whole list can be saved on the server
 * as an annotation page and opened again. Undo steps back through earlier copies
 * of the list. Screenshots come from the browser's own tab
 * capture (getDisplayMedia), which records exactly what is on screen, the
 * annotations included, whatever CSS the page uses. The capture stream is kept
 * open while the overlay is, so the browser asks to share the tab only once.
 *
 * @module     local_scribbles/scribbles
 * @copyright  2026 Adam Jenkins <adam@wisecat.net>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

import {
    centreOf,
    cornerAt,
    drawItem,
    drawSelection,
    hitItem,
    insideSelection,
    moveItem,
    resizeCursor,
    resizeItem,
    textSize,
} from 'local_scribbles/annotation';
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
    TOOLBAR: '[data-region="toolbar"]',
    PAGES: '[data-region="pages"]',
    PAGESBUTTON: '[data-action="pages"]',
    CLOSE: '[data-action="close"]',
    NAVBARBUTTON: '.local_scribbles-navbar [data-action="local_scribbles-open"]',
    ACTION: '[data-action]',
};

/** @var {Number} Longest data: URL sent to the server; larger captures are re-encoded smaller. */
const MAX_UPLOAD_LENGTH = 6 * 1024 * 1024;

/** @var {String[]} Tools drawn as a freehand stroke. */
const FREEHAND = ['pen', 'highlighter'];

/** @var {String[]} Every tool. */
const TOOLS = ['select', 'pen', 'highlighter', 'text', 'box', 'ellipse', 'eraser'];

/** @var {String} localStorage key of the remembered tool, colour and size. */
const STORAGE_KEY = 'local_scribbles/options';

/** @var {Object} Options used when nothing valid is remembered. */
const DEFAULT_OPTIONS = {tool: 'pen', colour: '#e03131', size: 4};

/** @var {Number} How far the pointer must move before a press counts as a drag, in CSS pixels. */
const DRAG_THRESHOLD = 3;

/** @var {RegExp} URL fragment that opens an annotation page when the Moodle page loads. */
const OPEN_FRAGMENT = /^#local_scribbles_page-(\d+)$/;

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
 * The selected annotation, if any.
 *
 * @returns {Object|undefined}
 */
const selectedItem = () => state.items.find((item) => item.id === state.selected);

/**
 * A copy of a new annotation with an id of its own.
 *
 * @param {Object} item
 * @returns {Object}
 */
const withId = (item) => ({...item, id: state.nextid++});

/**
 * Remember the current annotations so that undo can come back to them. Call
 * this before changing them.
 */
const pushHistory = () => {
    state.history.push(state.items);
    state.recoloured = null;
};

/**
 * Replace an annotation with a changed copy of it.
 *
 * @param {Object} changed
 */
const replaceItem = (changed) => {
    state.items = state.items.map((item) => (item.id === changed.id ? changed : item));
};

/**
 * Redraw every annotation and, except in a screenshot, the selection.
 */
const render = () => {
    const {ctx, canvas, items} = state;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    items.forEach((item) => drawItem(ctx, item));
    if (state.current) {
        drawItem(ctx, state.current);
    }
    const selected = selectedItem();
    if (selected && !state.capturing) {
        drawSelection(ctx, selected, state.selectmode);
    }
};

/**
 * Put the close button exactly over the navbar button that opens scribbles, so
 * the same spot turns it on and off, and keep the toolbar clear of it. With no
 * navbar button on the page, the close button stays in the top right corner.
 */
const placeCloseButton = () => {
    const close = state.root.querySelector(SELECTORS.CLOSE);
    const toolbar = state.root.querySelector(SELECTORS.TOOLBAR);
    const button = document.querySelector(SELECTORS.NAVBARBUTTON);
    const rect = button ? button.getBoundingClientRect() : null;
    if (!rect || !rect.width) {
        close.removeAttribute('style');
        toolbar.style.top = '';
        return;
    }
    Object.assign(close.style, {
        top: `${rect.top}px`,
        left: `${rect.left}px`,
        right: 'auto',
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        borderRadius: window.getComputedStyle(button).borderRadius,
    });
    toolbar.style.top = '';
    const bar = toolbar.getBoundingClientRect();
    if (bar.left < rect.right && bar.right > rect.left && bar.top < rect.bottom && bar.bottom > rect.top) {
        toolbar.style.top = `${rect.bottom + 4}px`;
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
        pushHistory();
        state.items = [...state.items, withId({
            type: 'text',
            colour: input.dataset.colour,
            fontsize: Number(input.dataset.fontsize),
            font: state.font,
            x: Number(input.dataset.x),
            y: Number(input.dataset.y),
            text: text,
        })];
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
    const fontsize = textSize(state.size);
    const input = document.createElement('textarea');
    input.className = 'local_scribbles-textinput';
    input.rows = 1;
    input.cols = 1;
    input.setAttribute('aria-label', state.strings.tooltext);
    Object.assign(input.dataset, {colour: state.colour, fontsize: fontsize, x: x, y: y});
    Object.assign(input.style, {
        left: `${x}px`,
        top: `${y}px`,
        color: state.colour,
        fontFamily: state.font,
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
 * How near the pointer must be to touch something: fingers are less exact than mice.
 *
 * @param {PointerEvent} e
 * @returns {Number[]} [annotation tolerance, handle radius] in CSS pixels
 */
const reachOf = (e) => (e.pointerType === 'touch' ? [12, 18] : [5, 9]);

/**
 * The topmost annotation under a point.
 *
 * @param {Number} x
 * @param {Number} y
 * @param {Number} tolerance
 * @returns {Object|undefined}
 */
const itemAt = (x, y, tolerance) => [...state.items].reverse().find((item) => hitItem(state.ctx, item, x, y, tolerance));

/**
 * Select an annotation, or nothing. The toolbar shows the colour of the
 * selection without changing the colour drawn with next.
 *
 * @param {Number|null} id
 */
const selectItem = (id) => {
    if (id !== state.selected) {
        state.recoloured = null;
        state.selectmode = 'resize';
    }
    state.selected = id;
    const selected = selectedItem();
    showColour(selected ? selected.colour : state.colour);
};

/**
 * Press with the select tool: on a handle, on the selection, on another
 * annotation or on nothing.
 *
 * @param {PointerEvent} e
 * @param {Number} x
 * @param {Number} y
 */
const startSelectGesture = (e, x, y) => {
    const [tolerance, radius] = reachOf(e);
    const selected = selectedItem();
    const base = {start: [x, y], moved: false};

    const corner = selected ? cornerAt(state.ctx, selected, x, y, radius) : null;
    if (corner) {
        state.gesture = {...base, kind: state.selectmode, corner, item: selected};
        return;
    }
    if (selected && hitItem(state.ctx, selected, x, y, tolerance)) {
        // A click without a drag swaps the resize and rotate handles.
        state.gesture = {...base, kind: 'move', item: selected, toggles: true};
        return;
    }
    const other = itemAt(x, y, tolerance);
    if (other) {
        selectItem(other.id);
        state.gesture = {...base, kind: 'move', item: other};
        return;
    }
    if (selected && insideSelection(state.ctx, selected, x, y)) {
        state.gesture = {...base, kind: 'move', item: selected, toggles: true};
        return;
    }
    selectItem(null);
};

/**
 * Continue moving, resizing or rotating the selection.
 *
 * @param {PointerEvent} e
 * @param {Number} x
 * @param {Number} y
 */
const continueSelectGesture = (e, x, y) => {
    const gesture = state.gesture;
    const dx = x - gesture.start[0];
    const dy = y - gesture.start[1];
    if (!gesture.moved) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) {
            return;
        }
        gesture.moved = true;
        pushHistory();
    }
    const {item} = gesture;
    if (gesture.kind === 'move') {
        replaceItem(moveItem(item, dx, dy));
    } else if (gesture.kind === 'resize') {
        replaceItem(resizeItem(state.ctx, item, gesture.corner, dx, dy, e.shiftKey));
    } else {
        const [cx, cy] = centreOf(state.ctx, item);
        let angle = (item.angle || 0) + Math.atan2(y - cy, x - cx) - Math.atan2(gesture.start[1] - cy, gesture.start[0] - cx);
        if (e.shiftKey) {
            // Shift snaps to 15 degree steps.
            angle = Math.round(angle / (Math.PI / 12)) * (Math.PI / 12);
        }
        replaceItem({...item, angle});
    }
    render();
};

/**
 * Show what pressing here would do, with the select tool.
 *
 * @param {PointerEvent} e
 * @param {Number} x
 * @param {Number} y
 */
const updateSelectCursor = (e, x, y) => {
    const [tolerance, radius] = reachOf(e);
    const selected = selectedItem();
    const corner = selected ? cornerAt(state.ctx, selected, x, y, radius) : null;
    let cursor = '';
    if (corner) {
        cursor = state.selectmode === 'rotate' ? 'grab' : resizeCursor(state.ctx, selected, corner);
    } else if (itemAt(x, y, tolerance) || (selected && insideSelection(state.ctx, selected, x, y))) {
        cursor = 'move';
    }
    state.canvas.style.cursor = cursor;
};

/**
 * Remove every annotation the eraser touches between two points.
 *
 * @param {Number[]} from [x, y]
 * @param {Number[]} to [x, y]
 */
const eraseAlong = (from, to) => {
    // Fast strokes leave gaps between pointer events, wide enough to miss a thin line.
    const steps = Math.ceil(Math.hypot(to[0] - from[0], to[1] - from[1]) / 4) || 1;
    const touches = (item) => {
        for (let i = 0; i <= steps; i++) {
            const x = from[0] + (to[0] - from[0]) * i / steps;
            const y = from[1] + (to[1] - from[1]) * i / steps;
            if (hitItem(state.ctx, item, x, y, state.size * 2)) {
                return true;
            }
        }
        return false;
    };
    const remaining = state.items.filter((item) => !touches(item));
    if (remaining.length < state.items.length) {
        pushHistory();
        state.items = remaining;
        render();
    }
};

/**
 * Start drawing, erasing or editing.
 *
 * @param {PointerEvent} e
 */
const onPointerDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) {
        return;
    }
    closePages();
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
    if (state.tool === 'select') {
        startSelectGesture(e, x, y);
        render();
        return;
    }
    if (state.tool === 'eraser') {
        state.erasing = [x, y];
        eraseAlong([x, y], [x, y]);
        return;
    }
    const base = {type: state.tool, colour: state.colour, size: state.size};
    state.current = FREEHAND.includes(state.tool)
        ? {...base, points: [[x, y]]}
        : {...base, x0: x, y0: y, x1: x, y1: y};
    render();
};

/**
 * Continue drawing, erasing or editing.
 *
 * @param {PointerEvent} e
 */
const onPointerMove = (e) => {
    const [px, py] = pointOf(e);
    if (state.gesture) {
        continueSelectGesture(e, px, py);
        return;
    }
    if (state.erasing) {
        eraseAlong(state.erasing, [px, py]);
        state.erasing = [px, py];
        return;
    }
    const op = state.current;
    if (!op) {
        if (state.tool === 'select') {
            updateSelectCursor(e, px, py);
        }
        return;
    }
    if (op.points) {
        const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
        (events.length ? events : [e]).forEach((ev) => op.points.push(pointOf(ev)));
    } else {
        let [x, y] = [px, py];
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
 * Finish drawing, erasing or editing.
 */
const onPointerUp = () => {
    if (state.textat) {
        const [x, y] = state.textat;
        state.textat = null;
        startText(x, y);
        return;
    }
    state.erasing = null;
    if (state.gesture) {
        const {moved, toggles} = state.gesture;
        state.gesture = null;
        if (!moved && toggles) {
            state.selectmode = state.selectmode === 'resize' ? 'rotate' : 'resize';
        }
        render();
        return;
    }
    const op = state.current;
    if (!op) {
        return;
    }
    state.current = null;
    // A click with a shape tool would leave an invisible shape behind.
    if (op.points || Math.abs(op.x1 - op.x0) > 2 || Math.abs(op.y1 - op.y0) > 2) {
        pushHistory();
        state.items = [...state.items, withId(op)];
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
    selectItem(null);
    state.canvas.style.cursor = '';
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
 * Show a colour as the current one in the toolbar.
 *
 * @param {String} colour CSS hex colour
 */
const showColour = (colour) => {
    state.root.querySelectorAll(SELECTORS.SWATCH).forEach((swatch) => {
        swatch.setAttribute('aria-pressed', swatch.dataset.colour === colour ? 'true' : 'false');
    });
    state.root.querySelector(SELECTORS.COLOURPICKER).value = colour;
};

/**
 * Select a colour, for what is drawn next and for the selected annotation.
 *
 * @param {String} colour CSS hex colour
 */
const selectColour = (colour) => {
    state.colour = colour;
    showColour(colour);
    if (state.textinput) {
        state.textinput.style.color = colour;
        state.textinput.dataset.colour = colour;
    }
    const selected = selectedItem();
    if (selected) {
        // The colour picker fires continuously: trying colours on one annotation is one undo step.
        if (state.recoloured !== selected.id) {
            pushHistory();
            state.recoloured = selected.id;
        }
        replaceItem({...selected, colour});
        render();
    }
    saveOptions();
};

/**
 * Undo the last change (a "clear" included).
 */
const undo = () => {
    commitText();
    if (state.gesture || !state.history.length) {
        return;
    }
    state.items = state.history.pop();
    state.recoloured = null;
    selectItem(selectedItem() ? state.selected : null);
    render();
};

/**
 * Clear the drawing. Undo brings it back.
 */
const clear = () => {
    commitText();
    if (state.items.length) {
        pushHistory();
        state.items = [];
        selectItem(null);
        render();
    }
};

/**
 * Delete the selected annotation.
 */
const deleteSelected = () => {
    pushHistory();
    state.items = state.items.filter((item) => item.id !== state.selected);
    selectItem(null);
    render();
};

/**
 * Wait for a frame captured after a given time, or give up after a while (a tab
 * that is not changing may not produce new frames). The stream can lag well
 * behind the page, so any older frame could still show the toolbar.
 *
 * @param {HTMLVideoElement} video
 * @param {Number} since performance.now() time
 * @returns {Promise}
 */
const videoFrameAfter = (video, since) => {
    if (!video.requestVideoFrameCallback) {
        return delay(200);
    }
    return Promise.race([
        new Promise((resolve) => {
            const check = (now, metadata) => {
                if ((metadata.captureTime || now) >= since) {
                    resolve();
                } else {
                    video.requestVideoFrameCallback(check);
                }
            };
            video.requestVideoFrameCallback(check);
        }),
        delay(2000),
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
    closePages();
    root.classList.add('local_scribbles-capturing');
    state.capturing = true;
    render();
    try {
        // The first time, let the browser's share picker and banner settle.
        await delay(firstcapture ? 700 : 100);
        await nextPaint();
        await videoFrameAfter(video, performance.now());
        const shot = document.createElement('canvas');
        shot.width = video.videoWidth;
        shot.height = video.videoHeight;
        shot.getContext('2d').drawImage(video, 0, 0);
        return shot;
    } finally {
        root.classList.remove('local_scribbles-capturing');
        if (state) {
            state.capturing = false;
            render();
        }
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
 * The elements that scroll this Moodle page. Boost scrolls #page, other themes the window.
 *
 * @returns {Element[]} The window's scroller first
 */
const scrollers = () => [document.scrollingElement, document.getElementById('page')];

/**
 * The annotations as data to save: coordinates rounded, in-memory details left out.
 *
 * @returns {String} JSON
 */
const pageData = () => {
    const round = (value) => Math.round(value * 10) / 10;
    const items = state.items.map((item) => {
        const saved = {...item};
        delete saved.id;
        delete saved.font;
        ['x', 'y', 'x0', 'y0', 'x1', 'y1', 'fontsize'].filter((key) => key in saved).forEach((key) => {
            saved[key] = round(saved[key]);
        });
        if (saved.points) {
            saved.points = saved.points.map(([x, y]) => [round(x), round(y)]);
        }
        return saved;
    });
    const [windowscroller, pagescroller] = scrollers();
    return JSON.stringify({
        items,
        scrolltop: windowscroller ? Math.round(windowscroller.scrollTop) : 0,
        pagescrolltop: pagescroller ? Math.round(pagescroller.scrollTop) : 0,
    });
};

/**
 * Close the annotation pages panel.
 */
const closePages = () => {
    state.root.querySelector(SELECTORS.PAGES).hidden = true;
};

/**
 * Fill the annotation pages panel with the saved pages and show it.
 *
 * @returns {Promise}
 */
const showPages = async() => {
    const panel = state.root.querySelector(SELECTORS.PAGES);
    const {pages} = await Ajax.call([{methodname: 'local_scribbles_get_pages', args: {}}])[0];
    const {html, js} = await Templates.renderForPromise('local_scribbles/pages_panel', {
        name: state.pagename || document.title,
        canupdate: !!state.pageid,
        pages,
        haspages: pages.length > 0,
    });
    Templates.replaceNodeContents(panel, html, js);
    panel.style.top = `${state.root.querySelector(SELECTORS.TOOLBAR).getBoundingClientRect().bottom + 4}px`;
    panel.hidden = false;
    panel.querySelector('input').select();
};

/**
 * Open or close the annotation pages panel: save this drawing, or open or delete a saved one.
 */
const togglePages = () => {
    if (state.root.querySelector(SELECTORS.PAGES).hidden) {
        runBusy('pages', showPages);
    } else {
        closePages();
    }
};

/**
 * Delete a saved annotation page, once confirmed. What is on screen stays, but
 * saving it afterwards makes a new page, as the one it came from is gone.
 *
 * @param {HTMLElement} button The page's delete button
 * @returns {Promise}
 */
const deletePage = async(button) => {
    const id = Number(button.dataset.pageid);
    // The dialogue body is HTML.
    const name = document.createElement('span');
    name.textContent = button.dataset.pagename;
    try {
        await Notification.deleteCancelPromise(
            getString('delete', 'core'),
            getString('confirmdeletepage', 'local_scribbles', name.innerHTML),
            getString('delete', 'core')
        );
    } catch (error) {
        return;
    }
    if (!state) {
        return;
    }
    await runBusy('deletepage', async() => {
        await Ajax.call([{methodname: 'local_scribbles_delete_page', args: {id}}])[0];
        if (state.pageid === id) {
            state.pageid = 0;
            state.pagename = '';
        }
        await showPages();
        await setStatus('pagedeleted');
    });
};

/**
 * Save the annotations as an annotation page.
 *
 * @param {Boolean} asnew Save a new page, even when one is open
 */
const savePage = (asnew) => {
    commitText();
    if (!state.items.length) {
        setStatus('nothingtosave');
        return;
    }
    const name = state.root.querySelector(`${SELECTORS.PAGES} input`).value;
    runBusy('savepage', async() => {
        const result = await Ajax.call([{
            methodname: 'local_scribbles_save_page',
            args: {
                id: asnew ? 0 : state.pageid,
                contextid: config.contextid,
                pageurl: window.location.href,
                pagetitle: document.title,
                name,
                data: pageData(),
            },
        }])[0];
        state.pageid = result.id;
        state.pagename = result.name;
        closePages();
        await setStatus('pagesaved');
    });
};

/**
 * Bring a saved annotation page back. Undo returns to what was drawn before.
 *
 * Scroll positions only mean something on the Moodle page it was drawn on.
 *
 * @param {Number} id
 */
const openPage = (id) => runBusy('openpage', async() => {
    commitText();
    const page = await Ajax.call([{methodname: 'local_scribbles_get_page', args: {id}}])[0];
    const data = JSON.parse(page.data);
    pushHistory();
    selectItem(null);
    state.items = data.items.map((item) => withId(item.type === 'text' ? {...item, font: state.font} : item));
    state.pageid = page.id;
    state.pagename = page.name;

    const saved = new URL(page.pageurl || '/', window.location.href);
    if (saved.pathname === window.location.pathname && saved.search === window.location.search) {
        const [windowscroller, pagescroller] = scrollers();
        if (windowscroller) {
            windowscroller.scrollTop = data.scrolltop;
        }
        if (pagescroller) {
            pagescroller.scrollTop = data.pagescrolltop;
        }
    }
    closePages();
    placeCloseButton();
    render();
    await setStatus('pageopened');
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
        if (tool.dataset.tool === 'select') {
            setStatus('selecthint');
        }
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
    const actions = {
        undo,
        clear,
        download,
        save,
        close,
        pages: togglePages,
        savepagenew: () => savePage(true),
        openpage: () => openPage(Number(action.dataset.pageid)),
        deletepage: () => deletePage(action),
    };
    if (actions[action.dataset.action]) {
        e.preventDefault();
        actions[action.dataset.action]();
    }
};

/**
 * Keyboard shortcuts: Escape steps back out (panel, then selection, then the
 * overlay), Ctrl/Cmd+Z undoes, Delete removes the selected annotation.
 *
 * @param {KeyboardEvent} e
 */
const onKeyDown = (e) => {
    // An error dialogue sits above the overlay and handles its own keys.
    if ((state.textinput && e.target === state.textinput) || e.target.closest('.modal')) {
        return;
    }
    const panel = state.root.querySelector(SELECTORS.PAGES);
    if (e.key === 'Escape') {
        e.preventDefault();
        if (!panel.hidden) {
            closePages();
            state.root.querySelector(SELECTORS.PAGESBUTTON).focus();
        } else if (selectedItem()) {
            selectItem(null);
            render();
        } else {
            close();
        }
        return;
    }
    // Typing a page name must not change the drawing.
    if (e.target.matches('input[type="text"]')) {
        return;
    }
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedItem()) {
        e.preventDefault();
        deleteSelected();
    }
};

/**
 * Close Boost's footer help popover when scribbles was opened from it, so it is
 * not left under the transparent overlay and in the screenshots.
 *
 * @param {HTMLElement} trigger
 */
const closeFooterPopover = (trigger) => {
    if (!trigger || !trigger.closest('.popover')) {
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
 * @param {HTMLElement|null} trigger The element that opened it, focused again on close
 * @returns {Promise}
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
            items: [],
            history: [],
            nextid: 1,
            current: null,
            gesture: null,
            erasing: null,
            selected: null,
            selectmode: 'resize',
            recoloured: null,
            capturing: false,
            pageid: 0,
            pagename: '',
            font: window.getComputedStyle(document.body).fontFamily || 'sans-serif',
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
            onResize: () => {
                resizeCanvas();
                placeCloseButton();
            },
            onKeyDown,
        };

        const options = loadOptions();
        selectTool(options.tool);
        selectColour(options.colour);
        selectSize(options.size);

        root.addEventListener('click', onToolbarClick);
        root.addEventListener('submit', (e) => {
            e.preventDefault();
            savePage(false);
        });
        root.querySelector(SELECTORS.COLOURPICKER).addEventListener('input', (e) => selectColour(e.target.value));
        root.querySelector(SELECTORS.SIZE).addEventListener('input', (e) => selectSize(Number(e.target.value)));
        canvas.addEventListener('pointerdown', onPointerDown);
        canvas.addEventListener('pointermove', onPointerMove);
        canvas.addEventListener('pointerup', onPointerUp);
        canvas.addEventListener('pointercancel', onPointerUp);
        // Annotations are pinned to the viewport, so the page must not scroll under them.
        root.addEventListener('wheel', (e) => {
            if (!e.target.closest(SELECTORS.PAGES)) {
                e.preventDefault();
            }
        }, {passive: false});
        window.addEventListener('resize', state.onResize);
        document.addEventListener('keydown', onKeyDown);

        resizeCanvas();
        placeCloseButton();
        root.querySelector(`${SELECTORS.TOOL}[aria-pressed="true"]`).focus();
    } catch (error) {
        Notification.exception(error);
    } finally {
        pending.resolve();
    }
};

/**
 * Open an annotation page when My scribbles linked here to bring it back, once
 * the page has its full height, so that the scroll position can be restored.
 */
const openFromFragment = () => {
    const match = OPEN_FRAGMENT.exec(window.location.hash);
    if (!match) {
        return;
    }
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    const start = async() => {
        await open(null);
        if (state) {
            await openPage(Number(match[1]));
        }
    };
    if (document.readyState === 'complete') {
        start();
    } else {
        window.addEventListener('load', start, {once: true});
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
    openFromFragment();
};
