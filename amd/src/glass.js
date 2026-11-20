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
 * Broken glass: the cracks a hammer blow ("smash") or a bullet ("shot") leaves.
 *
 * A glass annotation is stored like a box, two corners, plus a random seed. The
 * crack pattern is made from the seed in a unit circle and stretched to fill the
 * box, so the same annotation always looks the same: after an undo, a move or a
 * resize, and when a saved page is opened again. It is drawn in white with a dark
 * edge so it shows on light and dark pages, and ignores the annotation's colour.
 *
 * @module     local_scribbles/glass
 * @copyright  2026 Adam Jenkins <adam@wisecat.net>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

/** @var {String[]} The glass annotation types. */
export const GLASS = ['smash', 'shot'];

/** @var {Number} Largest seed, so that it fits a signed 32 bit integer. */
const MAX_SEED = 2147483647;

/**
 * @var {Object} How a hammer break looks, in a circle of radius 1.
 *
 * rays: how many cracks run out from the centre; reach: how far they go; wobble:
 * how much they bend; rings: how many rings of cracks cross them; ringchance: how
 * many ring pieces are there; bow: how far ring pieces sag towards the centre;
 * branches: side cracks per ray; hole: radius of the hole in the middle; frost:
 * radius of the white crushed zone; facets: how many pieces are shaded; crush:
 * tiny cracks in the crushed zone.
 */
const STYLES = {
    smash: {rays: [14, 20], reach: [0.6, 1], wobble: 0.06, rings: [3, 5], ringchance: 0.7, bow: [0.93, 1.03],
        branches: 0.8, hole: 0.035, frost: 0.2, facets: 0.3, crush: 30},
};

/** @var {Number} Radius of the hole a bullet leaves, in a break of radius 1. */
const SHOT_HOLE = 0.16;

/** @var {Map} Patterns already made, by type and seed: rendering happens on every pointer move. */
const patterns = new Map();

/**
 * A new random seed for a glass annotation.
 *
 * @returns {Number}
 */
export const newSeed = () => Math.floor(Math.random() * MAX_SEED);

/**
 * Radius in CSS pixels of a new break for a brush size.
 *
 * @param {String} type smash or shot
 * @param {Number} size 1 to 20
 * @returns {Number}
 */
export const radiusOf = (type, size) => (type === 'smash' ? 120 + size * 20 : 60 + size * 10);

/**
 * A repeatable random number generator (Park-Miller). Every product stays below
 * 2^53, so it is exact in floating point.
 *
 * @param {Number} seed 0 to MAX_SEED
 * @returns {Function} Returns a number from 0 up to 1 at each call
 */
const generator = (seed) => {
    let state = (seed % (MAX_SEED - 1)) + 1;
    return () => {
        state = (state * 48271) % MAX_SEED;
        return (state - 1) / (MAX_SEED - 1);
    };
};

/**
 * A point from polar coordinates.
 *
 * @param {Number} r
 * @param {Number} angle
 * @returns {Number[]} [x, y]
 */
const polar = (r, angle) => [r * Math.cos(angle), r * Math.sin(angle)];

/**
 * Make the crack pattern of a hammer break, in a circle of radius 1 around 0,0.
 *
 * @param {String} type smash
 * @param {Number} seed
 * @returns {Object} {rays, branches, rings, facets, crush, hole, style}
 */
const makePattern = (type, seed) => {
    const random = generator(seed);
    const between = (min, max) => min + random() * (max - min);
    const style = STYLES[type];

    // Rays: jagged lines from the hole outwards, kept as [r, angle] points.
    const count = Math.round(between(...style.rays));
    const offset = random() * Math.PI * 2;
    const rays = [];
    for (let i = 0; i < count; i++) {
        let angle = offset + (i + between(-0.3, 0.3)) * Math.PI * 2 / count;
        const length = between(...style.reach);
        const points = [];
        for (let r = style.hole; r < length; r += between(0.04, 0.1)) {
            points.push([r, angle]);
            angle += between(-style.wobble, style.wobble);
        }
        points.push([length, angle]);
        rays.push({length, points});
    }

    // The angle of a ray where it crosses a radius.
    const angleAt = (ray, r) => (ray.points.find((point) => point[0] >= r) || ray.points[ray.points.length - 1])[1];

    // Branches: shorter cracks splitting off a ray, further out.
    const branches = [];
    rays.forEach((ray) => {
        const n = Math.floor(style.branches + random());
        for (let b = 0; b < n && ray.points.length > 3; b++) {
            const start = ray.points[1 + Math.floor(random() * (ray.points.length - 2))];
            let direction = start[1] + (random() < 0.5 ? -1 : 1) * between(0.3, 0.7);
            let [x, y] = polar(...start);
            const steps = 2 + Math.floor(random() * 3);
            const step = between(0.05, 0.1) * (1.2 - start[0]);
            const line = [[x, y]];
            for (let s = 0; s < steps; s++) {
                direction += between(-0.25, 0.25);
                x += step * Math.cos(direction);
                y += step * Math.sin(direction);
                line.push([x, y]);
            }
            branches.push({r: start[0], points: line});
        }
    });

    // Rings: pieces of crack between neighbouring rays, at a few radii.
    const ringcount = Math.round(between(...style.rings));
    const radii = [];
    for (let j = 0; j < ringcount; j++) {
        radii.push(style.frost + (j + between(0.2, 1)) / ringcount * (0.8 - style.frost));
    }
    const rings = [];
    const facets = [];
    rays.forEach((ray, i) => {
        const next = rays[(i + 1) % count];
        // Unwrap so the next ray's angle is just ahead of this one.
        const unwrap = (angle) => angle + (i === count - 1 ? Math.PI * 2 : 0);
        let inner = null;
        [style.hole, ...radii].forEach((r, j) => {
            if (ray.length < r || next.length < r) {
                inner = null;
                return;
            }
            const from = polar(r * between(0.85, 1.15), angleAt(ray, r));
            const to = polar(r * between(0.85, 1.15), unwrap(angleAt(next, r)));
            const bow = between(...style.bow);
            const control = [(from[0] + to[0]) / 2 * bow, (from[1] + to[1]) / 2 * bow];
            if (j > 0 && random() < style.ringchance) {
                rings.push({r, from, control, to});
            }
            if (inner && random() < style.facets) {
                const light = random() < 0.55;
                facets.push({
                    points: [inner.from, inner.to, to, from],
                    fill: light ? `rgba(255, 255, 255, ${between(0.06, 0.16).toFixed(2)})`
                        : `rgba(0, 0, 0, ${between(0.03, 0.08).toFixed(2)})`,
                });
            }
            inner = {from, to};
        });
    });

    // Tiny cracks in the crushed zone round the impact.
    const crush = [];
    for (let c = 0; c < style.crush; c++) {
        const r = between(style.hole, style.frost);
        const angle = random() * Math.PI * 2;
        const turn = angle + Math.PI / 2 + between(-0.8, 0.8);
        const length = between(0.015, 0.05);
        const [x, y] = polar(r, angle);
        crush.push([[x, y], [x + length * Math.cos(turn), y + length * Math.sin(turn)]]);
    }

    // The hole itself, a ragged polygon.
    const hole = [];
    const corners = 9 + Math.floor(random() * 5);
    for (let k = 0; k < corners; k++) {
        hole.push(polar(style.hole * between(0.6, 1.3), (k + between(-0.3, 0.3)) * Math.PI * 2 / corners));
    }

    return {rays, branches, rings, facets, crush, hole, style};
};

/**
 * Make the pattern of a bullet hole, in a circle of radius 1 around 0,0.
 *
 * A round hole with a chipped white rim, a ring of fine streaks packed so close
 * round it that they look frosted, then broken rings, slivers of glass catching
 * the light and long cracks, all fading outwards.
 *
 * @param {Number} seed
 * @returns {Object} {lines, shards, hole, rim}; each line is {points, width, alpha}
 */
const makeShot = (seed) => {
    const random = generator(seed);
    const between = (min, max) => min + random() * (max - min);
    const lines = [];
    const shards = [];

    // The frosted ring: many short, slightly curved streaks.
    for (let i = 0; i < 260; i++) {
        const angle = random() * Math.PI * 2;
        const drift = between(-0.12, 0.12);
        const from = SHOT_HOLE * between(1, 1.2);
        const to = from + between(0.06, 0.2) + between(0, 0.25);
        const points = [];
        for (let k = 0; k <= 3; k++) {
            points.push(polar(from + (to - from) * k / 3, angle + drift * k / 3));
        }
        lines.push({points, width: between(0.3, 0.8), alpha: between(0.35, 0.9)});
    }

    // Long cracks running out to the edge, some splitting.
    for (let i = 0; i < 22; i++) {
        let angle = random() * Math.PI * 2;
        const length = between(0.55, 1);
        const points = [];
        for (let r = SHOT_HOLE; r < length; r += between(0.04, 0.09)) {
            points.push(polar(r, angle));
            angle += between(-0.05, 0.05);
        }
        points.push(polar(length, angle));
        lines.push({points, width: between(0.8, 1.4), alpha: between(0.6, 0.95)});
        if (points.length > 4 && random() < 0.6) {
            let [x, y] = points[2 + Math.floor(random() * (points.length - 3))];
            let direction = Math.atan2(y, x) + (random() < 0.5 ? -1 : 1) * between(0.3, 0.8);
            const branch = [[x, y]];
            for (let k = 0; k < 3; k++) {
                direction += between(-0.2, 0.2);
                x += between(0.04, 0.08) * Math.cos(direction);
                y += between(0.04, 0.08) * Math.sin(direction);
                branch.push([x, y]);
            }
            lines.push({points: branch, width: 0.7, alpha: 0.6});
        }
    }

    // Pieces of ring crack, closer together near the hole.
    for (let i = 0; i < 65; i++) {
        const r = 0.22 + 0.75 * Math.pow(random(), 1.6);
        const start = random() * Math.PI * 2;
        const span = between(0.15, 0.9) * (1.2 - r * 0.5);
        const steps = Math.max(2, Math.ceil(span / 0.07));
        let radius = r;
        const points = [];
        for (let k = 0; k <= steps; k++) {
            radius += between(-0.012, 0.012);
            points.push(polar(radius, start + span * k / steps));
        }
        lines.push({points, width: between(0.5, 1.1), alpha: Math.max(0.25, 0.95 - r * 0.6) * between(0.7, 1)});
    }

    // Thin slivers of glass catching the light, most along a ring, some outwards.
    for (let i = 0; i < 70; i++) {
        const r = 0.2 + 0.7 * Math.pow(random(), 1.3);
        const angle = random() * Math.PI * 2;
        const along = random() < 0.65;
        const span = along ? between(0.12, 0.45) * (1 - r * 0.4) : between(0.01, 0.035);
        const depth = along ? between(0.008, 0.03) : between(0.08, 0.22);
        const steps = along ? Math.ceil(span / 0.06) : 1;
        const inner = [];
        const outer = [];
        for (let k = 0; k <= steps; k++) {
            const a = angle + span * k / steps;
            // Tapered at both ends, like a splinter.
            const taper = steps > 1 ? Math.sin(Math.PI * k / steps) : 1;
            inner.push(polar(r, a));
            outer.push(polar(r + depth * Math.max(taper, 0.15), a));
        }
        const alpha = between(0.15, 0.55) * (1.1 - r * 0.7);
        shards.push({points: [...inner, ...outer.reverse()], alpha});
        lines.push({points: random() < 0.5 ? inner : outer, width: between(0.5, 1.1), alpha: Math.min(1, alpha * 2)});
    }

    // The hole: round but not quite, and a chipped rim of crushed glass round it.
    const hole = [];
    const rim = [];
    const phases = [random(), random()].map((phase) => phase * Math.PI * 2);
    const corners = 56;
    for (let k = 0; k < corners; k++) {
        const angle = (k + between(-0.3, 0.3)) * Math.PI * 2 / corners;
        const r = SHOT_HOLE * (1 + 0.025 * Math.sin(3 * angle + phases[0]) + 0.02 * Math.sin(5 * angle + phases[1]) +
            between(-0.02, 0.02));
        hole.push(polar(r, angle));
        rim.push(polar(r * between(1.08, 1.35), angle));
    }

    return {lines, shards, hole, rim};
};

/**
 * The crack pattern of a break, made once per type and seed.
 *
 * @param {String} type
 * @param {Number} seed
 * @returns {Object}
 */
const patternOf = (type, seed) => {
    const key = `${type}:${seed}`;
    if (!patterns.has(key)) {
        if (patterns.size > 500) {
            patterns.clear();
        }
        patterns.set(key, type === 'shot' ? makeShot(seed) : makePattern(type, seed));
    }
    return patterns.get(key);
};

/**
 * Draw a bullet hole.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} pattern From makeShot()
 * @param {Function} map From unit coordinates to CSS pixels
 * @param {Number[]} centre [x, y] in CSS pixels
 * @param {Number[]} radii [rx, ry] in CSS pixels
 * @param {Number} width Base line width in CSS pixels
 */
const drawShot = (ctx, pattern, map, [cx, cy], [rx, ry], width) => {
    const trace = (points) => points.map(map).forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));

    // Nothing is drawn in the hole, so the page shows through it. A clip rather
    // than erasing afterwards, which would also wipe annotations underneath.
    ctx.save();
    ctx.beginPath();
    ctx.rect(cx - rx * 2, cy - ry * 2, rx * 4, ry * 4);
    trace(pattern.hole);
    ctx.closePath();
    ctx.clip('evenodd');

    // The frost round the hole.
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(rx, ry);
    const frost = ctx.createRadialGradient(0, 0, SHOT_HOLE, 0, 0, 0.6);
    frost.addColorStop(0, 'rgba(255, 255, 255, 0.7)');
    frost.addColorStop(0.35, 'rgba(255, 255, 255, 0.3)');
    frost.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = frost;
    ctx.beginPath();
    ctx.arc(0, 0, 0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    pattern.shards.forEach((shard) => {
        ctx.beginPath();
        trace(shard.points);
        ctx.closePath();
        ctx.fillStyle = `rgba(255, 255, 255, ${shard.alpha.toFixed(3)})`;
        ctx.fill();
    });

    // Every crack twice: a dark edge just below, then the bright crack.
    [[0, 0, 0, 0.5, 1, 0.6], [255, 255, 255, 1, 0, 0]].forEach(([r, g, b, opacity, extra, shift]) => {
        pattern.lines.forEach((line) => {
            ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${(line.alpha * opacity).toFixed(3)})`;
            ctx.lineWidth = Math.max(line.width * width, 0.35) + extra;
            ctx.beginPath();
            line.points.map(map).forEach(([x, y], i) => (i ? ctx.lineTo(x + shift, y + shift) : ctx.moveTo(x + shift, y + shift)));
            ctx.stroke();
        });
    });

    // The chipped rim round the hole, with a thin edge where the glass ends.
    ctx.beginPath();
    trace(pattern.rim);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.fill();
    ctx.beginPath();
    trace(pattern.hole);
    ctx.closePath();
    ctx.strokeStyle = 'rgba(110, 110, 110, 0.8)';
    ctx.lineWidth = Math.max(width * 1.6, 1);
    ctx.stroke();
    ctx.restore();
};

/**
 * Draw a glass annotation filling its bounds. The caller has already applied its rotation.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} item {type, seed}
 * @param {Object} bounds {minx, miny, maxx, maxy}
 */
export const drawGlass = (ctx, item, bounds) => {
    const pattern = patternOf(item.type, item.seed);
    const cx = (bounds.minx + bounds.maxx) / 2;
    const cy = (bounds.miny + bounds.maxy) / 2;
    const rx = Math.max((bounds.maxx - bounds.minx) / 2, 1);
    const ry = Math.max((bounds.maxy - bounds.miny) / 2, 1);
    const scale = Math.min(rx, ry);
    const width = Math.min(Math.max(scale / 140, 0.7), 2.2);
    const map = ([x, y]) => [cx + x * rx, cy + y * ry];

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (item.type === 'shot') {
        drawShot(ctx, pattern, map, [cx, cy], [rx, ry], width);
        return;
    }

    // Shaded pieces of glass, then the frosted crush round the impact.
    pattern.facets.forEach((facet) => {
        ctx.beginPath();
        facet.points.map(map).forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();
        ctx.fillStyle = facet.fill;
        ctx.fill();
    });
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(rx, ry);
    const frost = ctx.createRadialGradient(0, 0, 0, 0, 0, pattern.style.frost);
    frost.addColorStop(0, 'rgba(255, 255, 255, 0.75)');
    frost.addColorStop(0.5, 'rgba(255, 255, 255, 0.35)');
    frost.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = frost;
    ctx.beginPath();
    ctx.arc(0, 0, pattern.style.frost, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Each crack as [from, to, line width] segments; rays and branches thin out with distance.
    const segments = [];
    pattern.rays.forEach((ray) => {
        for (let i = 1; i < ray.points.length; i++) {
            const taper = 1.4 - ray.points[i][0];
            segments.push([polar(...ray.points[i - 1]), polar(...ray.points[i]), width * taper]);
        }
    });
    pattern.branches.forEach((branch) => {
        for (let i = 1; i < branch.points.length; i++) {
            segments.push([branch.points[i - 1], branch.points[i], width * (0.9 - branch.r * 0.4)]);
        }
    });
    pattern.crush.forEach(([from, to]) => segments.push([from, to, width * 0.6]));

    // Twice: a dark edge just below, then the bright crack itself.
    [['rgba(0, 0, 0, 0.45)', 1.4, 0.7], ['rgba(255, 255, 255, 0.95)', 0, 0]].forEach(([colour, extra, shift]) => {
        ctx.strokeStyle = colour;
        segments.forEach(([from, to, segmentwidth]) => {
            const [x0, y0] = map(from);
            const [x1, y1] = map(to);
            ctx.lineWidth = Math.max(segmentwidth, 0.4) + extra;
            ctx.beginPath();
            ctx.moveTo(x0 + shift, y0 + shift);
            ctx.lineTo(x1 + shift, y1 + shift);
            ctx.stroke();
        });
        ctx.lineWidth = width * 0.75 + extra;
        ctx.beginPath();
        pattern.rings.forEach((ring) => {
            const [x0, y0] = map(ring.from);
            const [qx, qy] = map(ring.control);
            const [x1, y1] = map(ring.to);
            ctx.moveTo(x0 + shift, y0 + shift);
            ctx.quadraticCurveTo(qx + shift, qy + shift, x1 + shift, y1 + shift);
        });
        ctx.stroke();
    });

    // The hole: dark, with a bright broken rim.
    ctx.beginPath();
    pattern.hole.map(map).forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fillStyle = 'rgba(30, 30, 30, 0.75)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = width;
    ctx.stroke();
};
