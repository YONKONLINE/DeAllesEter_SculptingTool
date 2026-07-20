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
    const WOBBLE_FPS = 8;      // low fps for hand-drawn stop-motion feel
    let wobbleFrame = 0;
    let wobbleTimer = null;

    function startWobble() {
        if (wobbleTimer) return;
        wobbleTimer = setInterval(() => {
            wobbleFrame++;
            render();
        }, 1000 / WOBBLE_FPS);
    }

    function stopWobble() {
        if (wobbleTimer) {
            clearInterval(wobbleTimer);
            wobbleTimer = null;
        }
    }

    // Cheap noise for 2D wobble
    function wobbleNoise(x, y, seed) {
        return Math.sin(x * 1.7 + seed * 2.3) * 0.4
             + Math.sin(y * 2.3 + seed * 1.7) * 0.3
             + Math.sin((x + y) * 0.9 + seed * 3.1) * 0.3;
    }

    function render() {
        if (!ctx) return;
        const S = VoxelGrid.SIZE;
        const w = canvas.width;
        const h = canvas.height;

        const imgData = ctx.createImageData(w, h);
        const pixels = imgData.data;

        // White background
        for (let i = 0; i < pixels.length; i += 4) {
            pixels[i] = 255;
            pixels[i+1] = 255;
            pixels[i+2] = 255;
            pixels[i+3] = 255;
        }

        const cellW = w / S;
        const cellH = h / S;
        // Layers are sorted by z (bottom → top). Render strictly in z-order
        // so higher layers visually cover lower ones regardless of selection.
        const sortedLayers = Layers.getAll();
        const t = wobbleFrame;

        // Direct typed-array access avoids the {r,g,b} object allocation
        // VoxelGrid.get() does on every cell — important since the outer loop
        // runs SIZE*SIZE per layer.
        const filledArr = VoxelGrid.filled;
        const colorR = VoxelGrid.colorR;
        const colorG = VoxelGrid.colorG;
        const colorB = VoxelGrid.colorB;
        const planeStride = S * S;

        for (const layer of sortedLayers) {
            const z = layer.z;
            const planeStart = z * planeStride;
            for (let gy = 0; gy < S; gy++) {
                const rowStart = planeStart + gy * S;
                for (let gx = 0; gx < S; gx++) {
                    const i = rowStart + gx;
                    if (!filledArr[i]) continue;

                    const r = (colorR[i] * 255) | 0;
                    const g = (colorG[i] * 255) | 0;
                    const b = (colorB[i] * 255) | 0;

                    // Wobble offset: shift each cell slightly based on noise
                    const ox = wobbleNoise(gx * 0.15, gy * 0.15, t * 0.7) * WOBBLE_AMP;
                    const oy = wobbleNoise(gx * 0.15 + 17.3, gy * 0.15 + 31.7, t * 0.7) * WOBBLE_AMP;

                    // Render slightly oversized to prevent white gaps from wobble offsets
                    const px0 = Math.floor(gx * cellW + ox) - 1;
                    const py0 = Math.floor(gy * cellH + oy) - 1;
                    const px1 = Math.ceil((gx + 1) * cellW + ox) + 1;
                    const py1 = Math.ceil((gy + 1) * cellH + oy) + 1;

                    for (let py = Math.max(0, py0); py < Math.min(h, py1); py++) {
                        for (let px = Math.max(0, px0); px < Math.min(w, px1); px++) {
                            const idx = (py * w + px) * 4;
                            pixels[idx] = r;
                            pixels[idx+1] = g;
                            pixels[idx+2] = b;
                            pixels[idx+3] = 255;
                        }
                    }
                }
            }
        }

        ctx.putImageData(imgData, 0, 0);
    }

    return {
        init, resize, render,
        setTool, setBrushSize,
        startWobble, stopWobble,
        get tool() { return tool; },
        set onStrokeEnd(cb) { onStrokeEnd = cb; },
        set onStrokeStart(cb) { onStrokeStart = cb; },
    };
})();
