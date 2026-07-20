/**
 * 2D Drawing Canvas for Vorm Jr.
 * Handles touch and mouse input. High-res grid for fluid drawing.
 */
const Drawing = (() => {
    let canvas, ctx;
    let cellSize = 0;
    let isDrawing = false;
    let tool = 'pencil'; // 'pencil', 'eraser', or 'fill'
    let brushSize = 2; // default slightly larger for 128 grid
    let onStrokeEnd = null;
    let onStrokeStart = null;
    let lastX = -1, lastY = -1; // for line interpolation

    function init(canvasEl) {
        canvas = canvasEl;
        ctx = canvas.getContext('2d');

        canvas.addEventListener('pointerdown', handleStart, { passive: false });
        canvas.addEventListener('pointermove', handleMove, { passive: false });
        canvas.addEventListener('pointerup', handleEnd);
        canvas.addEventListener('pointercancel', handleEnd);
        canvas.addEventListener('pointerleave', handleEnd);
        canvas.addEventListener('contextmenu', e => e.preventDefault());

        resize();
    }

    function resize() {
        const container = canvas.parentElement;
        // Square canvas based on available height
        const size = Math.max(200, container.parentElement.clientHeight);

        container.style.width = size + 'px';
        canvas.width = size;
        canvas.height = size;
        canvas.style.width = size + 'px';
        canvas.style.height = size + 'px';

        cellSize = size / VoxelGrid.SIZE;
        render();
    }

    function setTool(t) { tool = t; }
    function setBrushSize(s) { brushSize = Math.max(1, Math.min(10, s)); }

    function handleStart(e) {
        e.preventDefault();
        canvas.setPointerCapture(e.pointerId);

        if (tool === 'fill') {
            if (onStrokeStart) onStrokeStart();
            fillAt(e);
            if (onStrokeEnd) onStrokeEnd();
            return;
        }

        isDrawing = true;
        lastX = -1;
        lastY = -1;
        if (onStrokeStart) onStrokeStart();
        applyAt(e);
    }

    function handleMove(e) {
        e.preventDefault();
        if (!isDrawing) return;
        applyAt(e);
    }

    function handleEnd() {
        if (!isDrawing) return;
        isDrawing = false;
        lastX = -1;
        lastY = -1;
        if (onStrokeEnd) onStrokeEnd();
    }

    /**
     * Flood fill from the clicked cell on the active layer.
     */
    function fillAt(e) {
        const rect = canvas.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        const startX = Math.floor(px / cellSize);
        const startY = Math.floor(py / cellSize);
        const S = VoxelGrid.SIZE;

        if (startX < 0 || startX >= S || startY < 0 || startY >= S) return;

        const layer = Layers.getOrCreateActive();
        if (!layer) return;
        const z = layer.z;
        const rgb = Layers.getActiveColorRGB();

        // Check what we're filling over
        const targetFilled = VoxelGrid.isFilled(startX, startY, z);

        // Don't fill if clicking on an already-filled cell with the same color
        if (targetFilled) return;

        // BFS flood fill on empty cells
        const visited = new Uint8Array(S * S);
        const queue = [[startX, startY]];
        visited[startY * S + startX] = 1;

        while (queue.length > 0) {
            const [cx, cy] = queue.shift();
            VoxelGrid.set(cx, cy, z, rgb.r, rgb.g, rgb.b);

            // 4-connected neighbors
            const neighbors = [[cx-1,cy],[cx+1,cy],[cx,cy-1],[cx,cy+1]];
            for (const [nx, ny] of neighbors) {
                if (nx < 0 || nx >= S || ny < 0 || ny >= S) continue;
                if (visited[ny * S + nx]) continue;
                if (VoxelGrid.isFilled(nx, ny, z)) continue;
                visited[ny * S + nx] = 1;
                queue.push([nx, ny]);
            }
        }

        render();
    }

    // Bresenham line between two grid points for smooth strokes
    function lineBetween(x0, y0, x1, y1, callback) {
        const dx = Math.abs(x1 - x0);
        const dy = Math.abs(y1 - y0);
        const sx = x0 < x1 ? 1 : -1;
        const sy = y0 < y1 ? 1 : -1;
        let err = dx - dy;
        while (true) {
            callback(x0, y0);
            if (x0 === x1 && y0 === y1) break;
            const e2 = 2 * err;
            if (e2 > -dy) { err -= dy; x0 += sx; }
            if (e2 < dx) { err += dx; y0 += sy; }
        }
    }

    function applyAt(e) {
        const rect = canvas.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        const gx = Math.floor(px / cellSize);
        const gy = Math.floor(py / cellSize);

        const layer = (tool === 'pencil') ? Layers.getOrCreateActive() : Layers.getActive();
        if (!layer) return;
        const z = layer.z;
        const rgb = Layers.getActiveColorRGB();
        const half = Math.floor(brushSize / 2);

        function applyBrush(cx, cy) {
            for (let dy = -half; dy <= half; dy++) {
                for (let dx = -half; dx <= half; dx++) {
                    // Circular brush
                    if (dx * dx + dy * dy > half * half + half) continue;
                    const bx = cx + dx;
                    const by = cy + dy;
                    if (tool === 'pencil') {
                        VoxelGrid.set(bx, by, z, rgb.r, rgb.g, rgb.b);
                    } else {
                        VoxelGrid.erase(bx, by, z);
                    }
                }
            }
        }

        // Interpolate between last point and current for smooth lines
        if (lastX >= 0 && lastY >= 0 && (lastX !== gx || lastY !== gy)) {
            lineBetween(lastX, lastY, gx, gy, applyBrush);
        } else {
            applyBrush(gx, gy);
        }

        lastX = gx;
        lastY = gy;

        render();
    }

    // Wobble animation state
    const WOBBLE_AMP = 0.6;    // pixel offset amount per cell
    // 6fps: still reads as stop-motion when it runs.
    const WOBBLE_FPS = 6;
    let wobbleFrame = 0;
    let wobbleTimer = null;

    // The wobble is a "life sign" — nice-to-have when the app is truly idle,
    // but a main-thread thief whenever the 3D preview is drawing frames (drag,
    // momentum, auto-rotate). The renderer calls suspend/resume as those states
    // change; we tear DOWN the setInterval on suspend so there are no wakeups
    // and no rAF contention while auto-rotate is spinning.
    function _spawnTimer() {
        if (wobbleTimer) return;
        wobbleTimer = setInterval(() => {
            if (typeof document !== 'undefined' && document.hidden) return;
            wobbleFrame++;
            render();
        }, 1000 / WOBBLE_FPS);
    }
    function _killTimer() {
        if (wobbleTimer) { clearInterval(wobbleTimer); wobbleTimer = null; }
    }

    // Public API. startWobble is now a no-op — the wobble is off by default
    // (because auto-rotate is on by default) and only wakes up via resumeWobble
    // when the renderer detects the truly-idle window after a drag+coast ends.
    function startWobble() {}
    function stopWobble() { _killTimer(); }
    function suspendWobble() { _killTimer(); }
    function resumeWobble() { _spawnTimer(); }

    // Cheap noise for 2D wobble
    function wobbleNoise(x, y, seed) {
        return Math.sin(x * 1.7 + seed * 2.3) * 0.4
             + Math.sin(y * 2.3 + seed * 1.7) * 0.3
             + Math.sin((x + y) * 0.9 + seed * 3.1) * 0.3;
    }

    // Deferred render via rAF — coalesces high-rate pointer events
    // (iPad ProMotion fires pointermove up to 120Hz; without this,
    // every event would trigger a full multi-MB ImageData paint).
    let renderScheduled = false;
    function render() {
        if (renderScheduled) return;
        renderScheduled = true;
        requestAnimationFrame(() => {
            renderScheduled = false;
            renderNow();
        });
    }

    // Reused ImageData buffer — avoids allocating a fresh multi-MB
    // typed array on every paint, which causes heavy GC churn on iPad.
    // reusablePixels32 is a Uint32Array view over the same buffer so the pixel
    // loop can write ONE packed RGBA word per pixel instead of four bytes —
    // ~4× less inner-loop work in the wobble path.
    let reusableImageData = null;
    let reusablePixels32 = null;

    // Sparse cell cache: for each layer we keep just the packed (y*S+x) indices
    // of filled cells, keyed by VoxelGrid.generation. Wobble ticks that don't
    // touch voxel data reuse the cache and skip the SIZE*SIZE scan entirely —
    // on a 20%-filled 256×256 canvas with 3 layers that's ~13k iterations per
    // tick instead of ~196k, and no per-cell branch on filledArr.
    let cellCache = [];        // Array<{z, colorRGB:[r,g,b], cells:Uint32Array}>
    let cachedGeneration = -1;
    let cachedLayerKey = '';   // reflects z-order + color set

    function rebuildCellCache() {
        const S = VoxelGrid.SIZE;
        const layers = Layers.getAll();
        const filledArr = VoxelGrid.filled;
        const colorR = VoxelGrid.colorR;
        const colorG = VoxelGrid.colorG;
        const colorB = VoxelGrid.colorB;
        const planeStride = S * S;
        cellCache.length = 0;

        // Sparse per-layer packed indices. Two-pass: first count, then fill,
        // so we allocate the exact Uint32Array size (no doubling / GC).
        for (const layer of layers) {
            const planeStart = layer.z * planeStride;
            let count = 0;
            for (let i = planeStart; i < planeStart + planeStride; i++) {
                if (filledArr[i]) count++;
            }
            if (count === 0) continue;
            const cells = new Uint32Array(count);
            let firstColorIndex = -1;
            let w = 0;
            for (let gy = 0; gy < S; gy++) {
                const rowStart = planeStart + gy * S;
                for (let gx = 0; gx < S; gx++) {
                    const i = rowStart + gx;
                    if (filledArr[i]) {
                        cells[w++] = gy * S + gx;
                        if (firstColorIndex < 0) firstColorIndex = i;
                    }
                }
            }
            // Colors within a layer are uniform (Layers.setActiveColor writes
            // the same RGB to every cell), so one sample is enough — this
            // avoids per-cell color reads in the hot loop.
            const r = (colorR[firstColorIndex] * 255) | 0;
            const g = (colorG[firstColorIndex] * 255) | 0;
            const b = (colorB[firstColorIndex] * 255) | 0;
            cellCache.push({ cells, r, g, b });
        }

        cachedGeneration = VoxelGrid.generation;
        cachedLayerKey = layers.map(l => l.color + ':' + l.z).join('|');
    }

    function renderNow() {
        if (!ctx) return;
        const S = VoxelGrid.SIZE;
        const w = canvas.width;
        const h = canvas.height;

        if (!reusableImageData || reusableImageData.width !== w || reusableImageData.height !== h) {
            reusableImageData = ctx.createImageData(w, h);
            reusablePixels32 = new Uint32Array(reusableImageData.data.buffer);
        }
        const pixels32 = reusablePixels32;

        // Rebuild cache when voxel data OR layer topology (z-order/colors) has
        // changed. Layer changes without voxel changes (e.g. reordering) also
        // bump because getAll() returns a different order.
        const layers = Layers.getAll();
        const layerKey = layers.map(l => l.color + ':' + l.z).join('|');
        if (cachedGeneration !== VoxelGrid.generation || cachedLayerKey !== layerKey) {
            rebuildCellCache();
        }

        // 0xFFFFFFFF = opaque white as an ABGR packed word (little-endian byte
        // order matches ImageData's RGBA memory layout: [R,G,B,A] bytes → the
        // low byte of the u32 is R, high byte is A). Uint32Array.fill(word)
        // clears in ~1/4 the writes of a byte-level 255-fill.
        pixels32.fill(0xFFFFFFFF);

        // Empty grid → single memset + upload, then bail. Idle wobble ticks
        // on a fresh canvas become essentially free.
        if (cellCache.length === 0) {
            ctx.putImageData(reusableImageData, 0, 0);
            return;
        }

        const cellW = w / S;
        const cellH = h / S;
        const t = wobbleFrame;
        const tSeed = t * 0.7;

        // Iterate sparse cells only, in z-order (cache is already sorted).
        for (const layer of cellCache) {
            const cells = layer.cells;
            const r = layer.r, g = layer.g, b = layer.b;
            // Pack once per layer. Little-endian: byte0=R, byte1=G, byte2=B,
            // byte3=A=0xFF. Result stored as an ABGR u32.
            const packedColor = (0xFF << 24) | (b << 16) | (g << 8) | r;
            const n = cells.length;
            for (let ci = 0; ci < n; ci++) {
                const packed = cells[ci];
                const gx = packed % S;
                const gy = (packed / S) | 0;

                // Wobble offset: shift each cell slightly based on noise
                const ox = wobbleNoise(gx * 0.15, gy * 0.15, tSeed) * WOBBLE_AMP;
                const oy = wobbleNoise(gx * 0.15 + 17.3, gy * 0.15 + 31.7, tSeed) * WOBBLE_AMP;

                // Render slightly oversized to prevent white gaps from wobble offsets
                let px0 = (gx * cellW + ox) - 1; px0 = px0 < 0 ? 0 : px0 | 0;
                let py0 = (gy * cellH + oy) - 1; py0 = py0 < 0 ? 0 : py0 | 0;
                let px1 = ((gx + 1) * cellW + ox) + 1; px1 = px1 > w ? w : Math.ceil(px1);
                let py1 = ((gy + 1) * cellH + oy) + 1; py1 = py1 > h ? h : Math.ceil(py1);

                // One u32 write per pixel instead of four byte writes.
                for (let py = py0; py < py1; py++) {
                    const rowStart = py * w;
                    for (let px = px0; px < px1; px++) {
                        pixels32[rowStart + px] = packedColor;
                    }
                }
            }
        }

        ctx.putImageData(reusableImageData, 0, 0);
    }

    return {
        init, resize, render,
        setTool, setBrushSize,
        startWobble, stopWobble,
        suspendWobble, resumeWobble,
        get tool() { return tool; },
        set onStrokeEnd(cb) { onStrokeEnd = cb; },
        set onStrokeStart(cb) { onStrokeStart = cb; },
    };
})();
