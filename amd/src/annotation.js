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
 * One annotation: how to draw it, find it under the pointer and change it.
 *
 * An annotation is a plain object, treated as immutable: every change returns a
 * new object, so the undo history can share the ones that did not change.
 * Coordinates are CSS pixels. Moving and resizing change the coordinates
 * themselves, so line widths stay the same. A rotation is kept apart as "angle"
 * (radians, about the centre of the unrotated bounds).
 *
 * @module     local_scribbles/annotation
 * @copyright  2026 Adam Jenkins <adam@wisecat.net>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

/** @var {Number} Smallest width or height a resize can leave, in CSS pixels. */
const MIN_RESIZED = 8;

/** @var {String} Colour of the selection outline and handles. */
const SELECTION_COLOUR = '#0f6cbf';

/** @var {Number[][]} The corners, as [x, y] directions from the centre. */
const CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, 1]];

/**
 * Font size in CSS pixels for a given brush size.
 *
 * @param {Number} size
 * @returns {Number}
 */
export const textSize = (size) => 10 + size * 2;

/**
 * Rotate a point about a centre.
 *
 * @param {Number[]} point [x, y]
 * @param {Number[]} centre [x, y]
 * @param {Number} angle Radians
 * @returns {Number[]} [x, y]
 */
const rotatePoint = ([x, y], [cx, cy], angle) => {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return [cx + (x - cx) * cos - (y - cy) * sin, cy + (x - cx) * sin + (y - cy) * cos];
};

/**
 * Bounds of an annotation, before its rotation.
 *
 * @param {CanvasRenderingContext2D} ctx Used to measure text
 * @param {Object} item
 * @returns {Object} {minx, miny, maxx, maxy}
 */
const boundsOf = (ctx, item) => {
    if (item.points) {
        const xs = item.points.map((point) => point[0]);
        const ys = item.points.map((point) => point[1]);
        return {minx: Math.min(...xs), miny: Math.min(...ys), maxx: Math.max(...xs), maxy: Math.max(...ys)};
    }
    if (item.type === 'text') {
        const lines = item.text.split('\n');
        ctx.save();
        ctx.font = `${item.fontsize}px ${item.font}`;
        const width = Math.max(...lines.map((line) => ctx.measureText(line).width));
        ctx.restore();
        return {minx: item.x, miny: item.y, maxx: item.x + width, maxy: item.y + lines.length * item.fontsize * 1.25};
    }
    return {
        minx: Math.min(item.x0, item.x1),
        miny: Math.min(item.y0, item.y1),
        maxx: Math.max(item.x0, item.x1),
        maxy: Math.max(item.y0, item.y1),
    };
};

/**
 * The point an annotation rotates about.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} item
 * @returns {Number[]} [x, y]
 */
export const centreOf = (ctx, item) => {
    const bounds = boundsOf(ctx, item);
    return [(bounds.minx + bounds.maxx) / 2, (bounds.miny + bounds.maxy) / 2];
};

/**
 * Half the width of the line an annotation is drawn with.
 *
 * @param {Object} item
 * @returns {Number}
 */
const halfWidth = (item) => {
    if (item.type === 'text') {
        return 0;
    }
    return item.type === 'highlighter' ? item.size * 2 : item.size / 2;
};

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
 * Draw one annotation.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} item
 */
export const drawItem = (ctx, item) => {
    ctx.save();
    if (item.angle) {
        const [cx, cy] = centreOf(ctx, item);
        ctx.translate(cx, cy);
        ctx.rotate(item.angle);
        ctx.translate(-cx, -cy);
    }
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = item.colour;
    ctx.fillStyle = item.colour;
    ctx.lineWidth = item.size;

    switch (item.type) {
        case 'pen':
            strokePoints(ctx, item.points);
            break;
        case 'highlighter':
            // One path per stroke, so a stroke crossing itself does not darken.
            ctx.globalAlpha = 0.35;
            ctx.lineWidth = item.size * 4;
            strokePoints(ctx, item.points);
            break;
        case 'box':
            ctx.strokeRect(Math.min(item.x0, item.x1), Math.min(item.y0, item.y1),
                Math.abs(item.x1 - item.x0), Math.abs(item.y1 - item.y0));
            break;
        case 'ellipse':
            ctx.beginPath();
            ctx.ellipse((item.x0 + item.x1) / 2, (item.y0 + item.y1) / 2,
                Math.abs(item.x1 - item.x0) / 2, Math.abs(item.y1 - item.y0) / 2, 0, 0, Math.PI * 2);
            ctx.stroke();
            break;
        case 'text': {
            const lineheight = item.fontsize * 1.25;
            ctx.font = `${item.fontsize}px ${item.font}`;
            ctx.textBaseline = 'top';
            // Match the CSS half-leading of the textarea the text was typed in.
            item.text.split('\n').forEach((line, i) => {
                ctx.fillText(line, item.x, item.y + (lineheight - item.fontsize) / 2 + i * lineheight);
            });
            break;
        }
    }
    ctx.restore();
};

/**
 * Distance from a point to a line segment.
 *
 * @param {Number} x
 * @param {Number} y
 * @param {Number[]} a [x, y]
 * @param {Number[]} b [x, y]
 * @returns {Number}
 */
const distanceToSegment = (x, y, a, b) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const length = dx * dx + dy * dy;
    const t = length ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / length)) : 0;
    return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy);
};

/**
 * A point in an annotation's own unrotated coordinates.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} item
 * @param {Number} x
 * @param {Number} y
 * @returns {Number[]} [x, y]
 */
const toLocal = (ctx, item, x, y) => (item.angle ? rotatePoint([x, y], centreOf(ctx, item), -item.angle) : [x, y]);

/**
 * Whether a point touches what is drawn. Boxes and ellipses are outlines, so
 * another annotation inside one can still be reached.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} item
 * @param {Number} x
 * @param {Number} y
 * @param {Number} tolerance How near counts as touching, in CSS pixels
 * @returns {Boolean}
 */
export const hitItem = (ctx, item, x, y, tolerance) => {
    const [px, py] = toLocal(ctx, item, x, y);
    const reach = tolerance + halfWidth(item);
    const bounds = boundsOf(ctx, item);
    if (px < bounds.minx - reach || px > bounds.maxx + reach || py < bounds.miny - reach || py > bounds.maxy + reach) {
        return false;
    }
    switch (item.type) {
        case 'pen':
        case 'highlighter':
            return item.points.some((point, i) => {
                const next = item.points[Math.min(i + 1, item.points.length - 1)];
                return distanceToSegment(px, py, point, next) <= reach;
            });
        case 'box':
            // Inside the outer edge (checked above), so only the inner edge is left.
            return Math.min(px - bounds.minx, bounds.maxx - px, py - bounds.miny, bounds.maxy - py) <= reach;
        case 'ellipse': {
            const rx = Math.max((bounds.maxx - bounds.minx) / 2, 1);
            const ry = Math.max((bounds.maxy - bounds.miny) / 2, 1);
            const dx = px - (bounds.minx + bounds.maxx) / 2;
            const dy = py - (bounds.miny + bounds.maxy) / 2;
            const scale = Math.hypot(dx / rx, dy / ry);
            return scale === 0 ? Math.min(rx, ry) <= reach : Math.abs(1 - 1 / scale) * Math.hypot(dx, dy) <= reach;
        }
        default:
            return true;
    }
};

/**
 * Whether a point is inside the selection outline of an annotation.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} item
 * @param {Number} x
 * @param {Number} y
 * @returns {Boolean}
 */
export const insideSelection = (ctx, item, x, y) => {
    const [px, py] = toLocal(ctx, item, x, y);
    const bounds = boundsOf(ctx, item);
    const pad = halfWidth(item) + 4;
    return px >= bounds.minx - pad && px <= bounds.maxx + pad && py >= bounds.miny - pad && py <= bounds.maxy + pad;
};

/**
 * A copy of an annotation with a function applied to all its coordinates.
 *
 * @param {Object} item
 * @param {Function} fn Takes and returns [x, y]
 * @returns {Object}
 */
const mapPoints = (item, fn) => {
    if (item.points) {
        return {...item, points: item.points.map(fn)};
    }
    if (item.type === 'text') {
        const [x, y] = fn([item.x, item.y]);
        return {...item, x, y};
    }
    const [x0, y0] = fn([item.x0, item.y0]);
    const [x1, y1] = fn([item.x1, item.y1]);
    return {...item, x0, y0, x1, y1};
};

/**
 * Move an annotation.
 *
 * @param {Object} item
 * @param {Number} dx
 * @param {Number} dy
 * @returns {Object}
 */
export const moveItem = (item, dx, dy) => mapPoints(item, ([x, y]) => [x + dx, y + dy]);

/**
 * Resize an annotation by dragging one corner, the opposite corner staying put.
 *
 * Text always keeps its proportions, because only its font size can change. A
 * straight horizontal or vertical line has no height or width to scale, so it
 * only resizes along its length.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} item The annotation as it was when the drag began
 * @param {Number[]} corner The dragged corner, as a direction from the centre
 * @param {Number} dx How far the pointer has moved
 * @param {Number} dy
 * @param {Boolean} keepaspect
 * @returns {Object}
 */
export const resizeItem = (ctx, item, corner, dx, dy, keepaspect) => {
    const angle = item.angle || 0;
    const bounds = boundsOf(ctx, item);
    const centre = centreOf(ctx, item);
    const width = bounds.maxx - bounds.minx;
    const height = bounds.maxy - bounds.miny;
    const [localdx, localdy] = rotatePoint([dx, dy], [0, 0], -angle);
    const anchor = [corner[0] > 0 ? bounds.minx : bounds.maxx, corner[1] > 0 ? bounds.miny : bounds.maxy];

    const scaleOf = (length, delta) => (length > 1 ? Math.max(MIN_RESIZED / length, (length + delta) / length) : 1);
    let scalex = scaleOf(width, corner[0] * localdx);
    let scaley = scaleOf(height, corner[1] * localdy);
    if ((keepaspect || item.type === 'text') && width > 1 && height > 1) {
        scalex = Math.max(scalex, scaley);
        scaley = scalex;
    }

    let resized = mapPoints(item, ([x, y]) => [anchor[0] + (x - anchor[0]) * scalex, anchor[1] + (y - anchor[1]) * scaley]);
    if (item.type === 'text') {
        resized = {...resized, fontsize: item.fontsize * scaley};
    }
    if (!angle) {
        return resized;
    }
    // The centre of rotation has moved, which would swing the anchor away: move it back.
    const wanted = rotatePoint(anchor, centre, angle);
    const actual = rotatePoint(anchor, centreOf(ctx, resized), angle);
    return moveItem(resized, wanted[0] - actual[0], wanted[1] - actual[1]);
};

/**
 * The corner handle of an annotation under a point, if any.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} item
 * @param {Number} x
 * @param {Number} y
 * @param {Number} radius How near counts as on the handle, in CSS pixels
 * @returns {Number[]|null} The corner, as a direction from the centre
 */
export const cornerAt = (ctx, item, x, y, radius) => {
    const [px, py] = toLocal(ctx, item, x, y);
    const bounds = boundsOf(ctx, item);
    const pad = halfWidth(item) + 4;
    const near = (px1, px2) => Math.abs(px1 - px2) <= radius;
    return CORNERS.find(([cornerx, cornery]) =>
        near(px, cornerx > 0 ? bounds.maxx + pad : bounds.minx - pad) &&
        near(py, cornery > 0 ? bounds.maxy + pad : bounds.miny - pad)) || null;
};

/**
 * The CSS cursor for resizing from a corner, allowing for rotation.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} item
 * @param {Number[]} corner
 * @returns {String}
 */
export const resizeCursor = (ctx, item, corner) => {
    const bounds = boundsOf(ctx, item);
    const direction = Math.atan2(corner[1] * (bounds.maxy - bounds.miny + 8), corner[0] * (bounds.maxx - bounds.minx + 8));
    const steps = Math.round((direction + (item.angle || 0)) / (Math.PI / 4));
    return ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'][((steps % 4) + 4) % 4];
};

/**
 * Draw the selection outline and corner handles over an annotation.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} item
 * @param {String} mode "resize" shows square handles, "rotate" round ones with an arrow
 */
export const drawSelection = (ctx, item, mode) => {
    const bounds = boundsOf(ctx, item);
    const pad = halfWidth(item) + 4;
    const left = bounds.minx - pad;
    const top = bounds.miny - pad;
    const right = bounds.maxx + pad;
    const bottom = bounds.maxy + pad;
    const [cx, cy] = centreOf(ctx, item);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(item.angle || 0);
    ctx.translate(-cx, -cy);
    ctx.lineWidth = 1;
    ctx.strokeStyle = SELECTION_COLOUR;
    ctx.fillStyle = '#fff';
    // White under the dashes, so the outline shows on dark and light pages alike.
    ctx.strokeStyle = '#fff';
    ctx.strokeRect(left, top, right - left, bottom - top);
    ctx.strokeStyle = SELECTION_COLOUR;
    ctx.setLineDash([5, 4]);
    ctx.strokeRect(left, top, right - left, bottom - top);
    ctx.setLineDash([]);

    CORNERS.forEach(([cornerx, cornery]) => {
        const x = cornerx > 0 ? right : left;
        const y = cornery > 0 ? bottom : top;
        ctx.beginPath();
        if (mode === 'rotate') {
            ctx.arc(x, y, 7, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(x, y, 3.5, -Math.PI / 2, Math.PI);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(x - 3.5, y - 2);
            ctx.lineTo(x - 3.5, y + 1);
            ctx.lineTo(x - 6, y - 1);
            ctx.stroke();
        } else {
            ctx.rect(x - 5, y - 5, 10, 10);
            ctx.fill();
            ctx.stroke();
        }
    });
    if (mode === 'rotate') {
        ctx.beginPath();
        ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = SELECTION_COLOUR;
        ctx.fill();
    }
    ctx.restore();
};
