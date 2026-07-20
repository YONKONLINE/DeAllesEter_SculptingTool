/**
 * Voxel Grid - 3D data model for Vorm Jr.
 * Grid is SIZE x SIZE x MAX_LAYERS
 * Each voxel stores: filled (0/1) and color [r, g, b] (0-1 floats)
 */
const VoxelGrid = (() => {
    const SIZE = 256;
    const MAX_LAYERS = 24;

    let filled;
    let colorR, colorG, colorB;
    // Monotonic version counter — bumped by every mutation (set/erase/restore/
    // clear/deserialize). Consumers cache derived data keyed by this number and
    // rebuild lazily when it changes. Avoids threading dirty flags through
    // undo/redo/import/moveLayer/etc.
    let generation = 0;

    function init() {
        const total = SIZE * SIZE * MAX_LAYERS;
        filled = new Uint8Array(total);
        colorR = new Float32Array(total);
        colorG = new Float32Array(total);
        colorB = new Float32Array(total);
        generation++;
    }

    function idx(x, y, z) {
        return z * SIZE * SIZE + y * SIZE + x;
    }

    function inBounds(x, y, z) {
        return x >= 0 && x < SIZE && y >= 0 && y < SIZE && z >= 0 && z < MAX_LAYERS;
    }

    function set(x, y, z, r, g, b) {
        if (!inBounds(x, y, z)) return;
        const i = idx(x, y, z);
        filled[i] = 1;
        colorR[i] = r;
        colorG[i] = g;
        colorB[i] = b;
        generation++;
    }

    function erase(x, y, z) {
        if (!inBounds(x, y, z)) return;
        filled[idx(x, y, z)] = 0;
        generation++;
    }

    function get(x, y, z) {
        if (!inBounds(x, y, z)) return null;
        const i = idx(x, y, z);
        if (!filled[i]) return null;
        return { r: colorR[i], g: colorG[i], b: colorB[i] };
    }

    function isFilled(x, y, z) {
        if (!inBounds(x, y, z)) return false;
        return filled[idx(x, y, z)] === 1;
    }

    function clear() {
        filled.fill(0);
        colorR.fill(0);
        colorG.fill(0);
        colorB.fill(0);
        generation++;
    }

    function serialize() {
        // RLE-encode for efficiency with large grids
        const voxels = [];
        for (let z = 0; z < MAX_LAYERS; z++) {
            for (let y = 0; y < SIZE; y++) {
                for (let x = 0; x < SIZE; x++) {
                    const i = idx(x, y, z);
                    if (filled[i]) {
                        voxels.push([x, y, z, colorR[i], colorG[i], colorB[i]]);
                    }
                }
            }
        }
        return voxels;
    }

    function deserialize(voxels) {
        clear();
        for (const [x, y, z, r, g, b] of voxels) {
            set(x, y, z, r, g, b);
        }
        generation++;
    }

    function snapshot() {
        return {
            filled: new Uint8Array(filled),
            colorR: new Float32Array(colorR),
            colorG: new Float32Array(colorG),
            colorB: new Float32Array(colorB),
        };
    }

    function restore(snap) {
        filled.set(snap.filled);
        colorR.set(snap.colorR);
        colorG.set(snap.colorG);
        colorB.set(snap.colorB);
        generation++;
    }

    init();

    return {
        SIZE, MAX_LAYERS,
        init, set, erase, get, isFilled, clear,
        serialize, deserialize,
        snapshot, restore,
        inBounds, idx,
        get filled() { return filled; },
        get colorR() { return colorR; },
        get colorG() { return colorG; },
        get colorB() { return colorB; },
        get generation() { return generation; },
    };
})();
