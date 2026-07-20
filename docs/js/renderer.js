/**
 * Three.js 3D Preview Renderer for Vorm Jr.
 * - Renders each layer as separate mesh with flat material
 * - Smart stacking: layers sit on top of whatever is below them
 * - Click-drag to rotate, auto-rotates when idle
 */
const Renderer = (() => {
    let scene, camera, renderer;
    let meshGroup = null;
    let animId = null;

    let rotX = -0.4, rotY = 0;
    let autoRotVelX = 0.002, autoRotVelY = 0.005;
    let isDragging = false;
    let lastPointerX = 0, lastPointerY = 0;
    let idleTimer = null;
    let isAutoRotating = true;

    // Momentum / inertia
    let velX = 0, velY = 0;          // current angular velocity
    const DRAG_FRICTION = 0.96;       // damping per frame (lower = stops faster)
    const MIN_VEL = 0.0003;           // threshold to stop momentum
    let depthFactor = 4;
    let meshWorker = null;
    let workerUpdateId = 0;

    // Cached per-layer indexed mesh from the last worker run — reused by
    // the OBJ exporter so preview and export always match, and so we don't
    // regenerate a whole second (non-indexed) mesh on export.
    let exportMeshCache = [];
    // Center offset applied to preview meshes; export uses the same offset
    // so the OBJ is centered at the origin like the preview.
    let exportCenter = { x: 0, y: 0, z: 0 };
    // Promise queue drained when the worker completes — lets exportOBJ await
    // an in-flight regeneration instead of racing it.
    let workerBusy = false;
    const pendingWorkerResolvers = [];

    // Dirty-flag rendering: rAF fires at native rate but we skip render() when
    // nothing has actually changed. With the wiggle shader gone, idle frames
    // are literally free — no shader run, no draw call.
    let needsRender = true;

    function setDepth(val) { depthFactor = val; needsRender = true; }

    function initWorker() {
        // Inline worker via Blob URL — works with file:// and http://
        const workerSrc = document.getElementById('mesh-worker-src').textContent;
        const blob = new Blob([workerSrc], { type: 'application/javascript' });
        meshWorker = new Worker(URL.createObjectURL(blob));

        meshWorker.onmessage = function(e) {
            const { id, results } = e.data;
            if (id !== workerUpdateId) return;

            while (meshGroup.children.length > 0) {
                const child = meshGroup.children[0];
                meshGroup.remove(child);
                if (child.geometry) child.geometry.dispose();
                if (child.material) child.material.dispose();
            }

            // Reset the export cache — refilled below with the same indexed
            // buffers the merged mesh uses (per-layer for OBJ, merged for GPU).
            exportMeshCache = [];

            // Two-pass merge: (a) sum up total sizes, (b) copy into one big
            // BufferGeometry with a Uint8-normalized color attribute. Rendering
            // then costs ONE draw call instead of N per frame.
            let totalV = 0, totalI = 0;
            const layerRuns = [];
            for (const r of results) {
                const positions = new Float32Array(r.positions);
                const normals   = new Float32Array(r.normals);
                const indices   = new Uint32Array(r.indices);
                if (positions.length === 0 || indices.length === 0) continue;
                const rgb = Layers.hexToRgb(r.color);
                layerRuns.push({ color: r.color, positions, normals, indices, rgb });
                exportMeshCache.push({ color: r.color, positions, normals, indices });
                totalV += positions.length / 3;
                totalI += indices.length;
            }

            if (totalV > 0) {
                const mPos = new Float32Array(totalV * 3);
                const mNrm = new Float32Array(totalV * 3);
                const mCol = new Uint8Array(totalV * 3);
                // Uint32 is safe up to ~4B verts; well past any real scene.
                const mIdx = new Uint32Array(totalI);
                let vOff = 0, iOff = 0;
                for (const run of layerRuns) {
                    const nV = run.positions.length / 3;
                    mPos.set(run.positions, vOff * 3);
                    mNrm.set(run.normals,   vOff * 3);
                    // Uint8 colors with normalized:true — 3 bytes/vertex vs 12
                    // for Float32, and Lambert handles the [0,255]→[0,1] map.
                    const r8 = (run.rgb.r * 255) | 0;
                    const g8 = (run.rgb.g * 255) | 0;
                    const b8 = (run.rgb.b * 255) | 0;
                    for (let v = 0; v < nV; v++) {
                        const c = (vOff + v) * 3;
                        mCol[c] = r8; mCol[c+1] = g8; mCol[c+2] = b8;
                    }
                    // Offset indices into the merged vertex space.
                    for (let j = 0; j < run.indices.length; j++) {
                        mIdx[iOff + j] = run.indices[j] + vOff;
                    }
                    vOff += nV;
                    iOff += run.indices.length;
                }
                const geometry = new THREE.BufferGeometry();
                geometry.setAttribute('position', new THREE.BufferAttribute(mPos, 3));
                geometry.setAttribute('normal',   new THREE.BufferAttribute(mNrm, 3));
                geometry.setAttribute('color',    new THREE.BufferAttribute(mCol, 3, true));
                geometry.setIndex(new THREE.BufferAttribute(mIdx, 1));

                const material = new THREE.MeshLambertMaterial({
                    vertexColors: true,
                    side: THREE.FrontSide,
                });
                meshGroup.add(new THREE.Mesh(geometry, material));
            }

            centerAndFit();
            needsRender = true;
            workerBusy = false;
            while (pendingWorkerResolvers.length) pendingWorkerResolvers.shift()();
        };
    }

    function init(canvasEl) {
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0xf5f0e8);

        camera = new THREE.PerspectiveCamera(30, 1, 0.1, 2000);
        camera.position.set(0, 0, 200);
        camera.lookAt(0, 0, 0);

        // On touch devices (iPad especially) MSAA + retina DPR is a big
        // fragment-shader tax. The scene is flat-shaded matte plastic, so
        // no AA + DPR=1 still looks clean while cutting fragment work by
        // ~4x on iPad Pro (DPR=2, 4x samples). Desktop keeps AA.
        const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
        renderer = new THREE.WebGLRenderer({
            canvas: canvasEl,
            antialias: !isTouch,
            powerPreference: 'high-performance',
        });
        renderer.setPixelRatio(isTouch ? 1 : Math.min(window.devicePixelRatio, 2));

        // One HemisphereLight replaces the ambient + 3 directionals: identical
        // matte look, but the fragment shader now samples one gradient instead
        // of accumulating four separate light contributions per pixel.
        scene.add(new THREE.HemisphereLight(0xffffff, 0x9c8f7f, 1.0));

        // One key light for a bit of directional shape so meshes don't look
        // fully flat. Any more and we're back to paying per-fragment costs.
        const key = new THREE.DirectionalLight(0xffffff, 0.35);
        key.position.set(50, 80, 60);
        scene.add(key);

        meshGroup = new THREE.Group();
        scene.add(meshGroup);

        const el = canvasEl.parentElement;
        el.addEventListener('pointerdown', onPointerDown);
        el.addEventListener('pointermove', onPointerMove);
        el.addEventListener('pointerup', onPointerUp);
        el.addEventListener('pointerleave', onPointerUp);

        initWorker();
        resize();
        animate();
    }

    function onPointerDown(e) {
        isDragging = true;
        isAutoRotating = false;
        velX = 0;
        velY = 0;
        lastPointerX = e.clientX;
        lastPointerY = e.clientY;
        if (idleTimer) clearTimeout(idleTimer);
        // Free the main thread while the user drags — the 2D wobble at 6fps
        // is enough overhead to visibly stutter iPad rotation.
        if (typeof Drawing !== 'undefined' && Drawing.suspendWobble) Drawing.suspendWobble();
    }

    function onPointerMove(e) {
        if (!isDragging) return;
        const dx = e.clientX - lastPointerX;
        const dy = e.clientY - lastPointerY;
        // Track velocity as the latest frame's movement
        velY = dx * 0.008;
        velX = dy * 0.008;
        rotY += velY;
        rotX += velX;
        lastPointerX = e.clientX;
        lastPointerY = e.clientY;
        needsRender = true;
    }

    function onPointerUp() {
        if (!isDragging) return;
        isDragging = false;
        // Momentum continues from current velocity — handled in animate().
        // Wobble stays suspended until momentum fully dies (see animate()) so
        // the coast phase isn't fighting the 2D repaint on the main thread.
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
            isAutoRotating = true;
            autoRotVelX = (Math.random() - 0.5) * 0.004;
            autoRotVelY = (Math.random() * 0.004) + 0.003;
            needsRender = true;
            // Auto-rotate is the "attract mode" state — the user's attention
            // is on the 3D preview, not the 2D drawing. Suspending the wobble
            // timer during this state frees the main thread so the spin runs
            // at native fps instead of jittering under wobble's ImageData load.
            if (typeof Drawing !== 'undefined' && Drawing.suspendWobble) Drawing.suspendWobble();
        }, 3000);
    }

    function resize() {
        if (!renderer) return;
        const container = renderer.domElement.parentElement;
        const w = container.clientWidth;
        const h = container.clientHeight;
        renderer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        needsRender = true;
    }

    /**
     * Compute per-column height maps for smart stacking.
     * Returns a Map: layerColor -> Float32Array[cols*cols] of per-column Y offsets.
     * Each column independently tracks how high the stack is.
     */
    /**
     * Blur a 2D height map (cols x cols) with a box filter.
     * Radius controls how many cells the blur extends.
     */
    function blurHeightMap(src, cols, radius) {
        const dst = new Float32Array(cols * cols);
        for (let cy = 0; cy < cols; cy++) {
            for (let cx = 0; cx < cols; cx++) {
                let sum = 0, count = 0;
                for (let dy = -radius; dy <= radius; dy++) {
                    for (let dx = -radius; dx <= radius; dx++) {
                        const nx = cx + dx, ny = cy + dy;
                        if (nx < 0 || nx >= cols || ny < 0 || ny >= cols) continue;
                        const w = 1.0 / (1 + Math.abs(dx) + Math.abs(dy)); // distance-weighted
                        sum += src[ny * cols + nx] * w;
                        count += w;
                    }
                }
                dst[cy * cols + cx] = sum / count;
            }
        }
        return dst;
    }

    function computeColumnHeights(layers, filledArr) {
        const S = VoxelGrid.SIZE;
        const STEP = MarchingCubes.STEP;
        const LT = MarchingCubes.LAYER_THICKNESS + MarchingCubes.LAYER_GAP;
        const cols = Math.ceil(S / STEP);

        const globalHeight = new Float32Array(cols * cols);
        const result = new Map();

        for (const layer of layers) {
            const layerCols = new Uint8Array(cols * cols);
            for (let y = 0; y < S; y++) {
                for (let x = 0; x < S; x++) {
                    const vi = layer.z * S * S + y * S + x;
                    if (filledArr[vi]) {
                        const cx = Math.floor(x / STEP);
                        const cy = Math.floor(y / STEP);
                        layerCols[cy * cols + cx] = 1;
                    }
                }
            }

            // Build raw per-column offsets
            const colOffsets = new Float32Array(cols * cols);
            for (let i = 0; i < cols * cols; i++) {
                if (layerCols[i]) {
                    colOffsets[i] = globalHeight[i];
                }
            }

            // Blur the height map for gradual transitions between stacked/unstacked areas
            const smoothed = blurHeightMap(colOffsets, cols, 3);
            // Only apply smoothed values where this layer has content
            for (let i = 0; i < cols * cols; i++) {
                if (!layerCols[i]) smoothed[i] = 0;
            }

            result.set(layer.color, smoothed);

            // Account for depth inflation in the height map
            const inflationMap = MarchingCubes.computeInflationMap(filledArr, layer.z, depthFactor);

            for (let i = 0; i < cols * cols; i++) {
                if (layerCols[i]) {
                    // Base layer height + inflation height (top half of symmetric inflation)
                    const inflateH = inflationMap ? inflationMap[i] : 0;
                    globalHeight[i] += LT + inflateH;
                }
            }
        }

        return result;
    }

    function updateMesh() {
        const layers = Layers.getAll();

        if (layers.length === 0) {
            while (meshGroup.children.length > 0) {
                const child = meshGroup.children[0];
                meshGroup.remove(child);
                if (child.geometry) child.geometry.dispose();
                if (child.material) child.material.dispose();
            }
            exportMeshCache = [];
            needsRender = true;
            return;
        }

        if (!meshWorker) return;

        // Snapshot voxel data and send to worker
        const filledSnap = new Uint8Array(VoxelGrid.filled);
        const layerData = layers.map(l => ({ color: l.color, z: l.z }));
        const id = ++workerUpdateId;
        workerBusy = true;

        meshWorker.postMessage({
            id,
            filledArr: filledSnap,
            layers: layerData,
            S: VoxelGrid.SIZE,
            depthFactor,
        }, [filledSnap.buffer]); // transfer buffer for speed
    }

    /**
     * Laplacian smoothing: averages vertex positions and normals with neighbors.
     * Produces much smoother surfaces, like in the VR sculpting app.
     */
    function laplacianSmooth(geometry, factor) {
        const positions = geometry.attributes.position.array;
        const normals = geometry.attributes.normal.array;
        const vertCount = positions.length / 3;

        // Build adjacency from triangles
        const adjacency = new Map();
        for (let i = 0; i < vertCount; i += 3) {
            const a = i, b = i + 1, c = i + 2;
            addAdj(adjacency, a, b); addAdj(adjacency, a, c);
            addAdj(adjacency, b, a); addAdj(adjacency, b, c);
            addAdj(adjacency, c, a); addAdj(adjacency, c, b);
        }

        // Also merge coincident vertices for cross-triangle smoothing
        const precision = 1000;
        const vertexMap = new Map();
        for (let i = 0; i < vertCount; i++) {
            const key = Math.round(positions[i*3]*precision) + ',' +
                        Math.round(positions[i*3+1]*precision) + ',' +
                        Math.round(positions[i*3+2]*precision);
            if (!vertexMap.has(key)) vertexMap.set(key, []);
            vertexMap.get(key).push(i);
        }

        // Extend adjacency across coincident vertices
        for (const group of vertexMap.values()) {
            if (group.length <= 1) continue;
            for (const vi of group) {
                for (const vj of group) {
                    if (vi !== vj) {
                        // Share each other's neighbors
                        const ni = adjacency.get(vi);
                        const nj = adjacency.get(vj);
                        if (ni && nj) {
                            for (const n of nj) ni.add(n);
                            for (const n of ni) nj.add(n);
                        }
                    }
                }
            }
        }

        const smoothPos = new Float32Array(positions.length);
        const smoothNorm = new Float32Array(normals.length);

        for (let i = 0; i < vertCount; i++) {
            const neighbors = adjacency.get(i);
            const bi = i * 3;

            if (neighbors && neighbors.size > 0) {
                let avgX = 0, avgY = 0, avgZ = 0;
                let avgNx = 0, avgNy = 0, avgNz = 0;

                for (const n of neighbors) {
                    const ni = n * 3;
                    avgX += positions[ni]; avgY += positions[ni+1]; avgZ += positions[ni+2];
                    avgNx += normals[ni]; avgNy += normals[ni+1]; avgNz += normals[ni+2];
                }

                const cnt = neighbors.size;
                smoothPos[bi]   = positions[bi]   * (1-factor) + (avgX/cnt) * factor;
                smoothPos[bi+1] = positions[bi+1] * (1-factor) + (avgY/cnt) * factor;
                smoothPos[bi+2] = positions[bi+2] * (1-factor) + (avgZ/cnt) * factor;

                // Normalize averaged normal
                const nLen = Math.sqrt(avgNx*avgNx + avgNy*avgNy + avgNz*avgNz) || 1;
                smoothNorm[bi]   = avgNx / nLen;
                smoothNorm[bi+1] = avgNy / nLen;
                smoothNorm[bi+2] = avgNz / nLen;
            } else {
                smoothPos[bi] = positions[bi]; smoothPos[bi+1] = positions[bi+1]; smoothPos[bi+2] = positions[bi+2];
                smoothNorm[bi] = normals[bi]; smoothNorm[bi+1] = normals[bi+1]; smoothNorm[bi+2] = normals[bi+2];
            }
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(smoothPos, 3));
        geometry.setAttribute('normal', new THREE.BufferAttribute(smoothNorm, 3));
    }

    function addAdj(map, a, b) {
        if (!map.has(a)) map.set(a, new Set());
        map.get(a).add(b);
    }

    /**
     * Center all meshes at origin and fit camera.
     */
    function centerAndFit() {
        if (meshGroup.children.length === 0) return;

        // Compute combined bounding box
        const box = new THREE.Box3();
        meshGroup.children.forEach(child => {
            child.geometry.computeBoundingBox();
            const childBox = child.geometry.boundingBox.clone();
            childBox.applyMatrix4(child.matrixWorld);
            box.union(childBox);
        });

        const center = new THREE.Vector3();
        box.getCenter(center);

        // Offset all meshes so combined center is at origin
        meshGroup.children.forEach(child => {
            child.position.sub(center);
        });

        // Record the center so exportOBJ can bake the same offset into vertex
        // coordinates — otherwise the OBJ would drift far from origin.
        exportCenter = { x: center.x, y: center.y, z: center.z };

        const size = new THREE.Vector3();
        box.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = camera.fov * (Math.PI / 180);
        const dist = (maxDim / 2) / Math.tan(fov / 2) * 1.3;

        camera.position.set(0, 0, Math.max(dist, 100));
        camera.lookAt(0, 0, 0);
        camera.near = 0.1;
        camera.far = Math.max(dist * 10, 5000);
        camera.updateProjectionMatrix();
    }

    // rAF fires at whatever the display refresh is (60/120Hz). We render only
    // when something visibly changes — drag, momentum, auto-rotate tick, or a
    // fresh mesh. Idle without auto-rotate = zero GPU work.
    let wasCoasting = false;
    function animate() {
        animId = requestAnimationFrame(animate);

        const inMomentum = Math.abs(velX) > MIN_VEL || Math.abs(velY) > MIN_VEL;

        let rotationChanged = false;
        if (isDragging) {
            // Rotation state was updated in onPointerMove; needsRender is set there.
        } else if (inMomentum) {
            rotX += velX;
            rotY += velY;
            velX *= DRAG_FRICTION;
            velY *= DRAG_FRICTION;
            rotationChanged = true;
        } else if (isAutoRotating) {
            rotX += autoRotVelX;
            rotY += autoRotVelY;
            rotationChanged = true;
        }

        // Only resume the 2D wobble once the user's drag AND its coast phase
        // are fully finished — pointerup fires before momentum decays, and
        // running both loops at once is the actual iPad-jank window.
        if (wasCoasting && !isDragging && !inMomentum) {
            if (typeof Drawing !== 'undefined' && Drawing.resumeWobble) Drawing.resumeWobble();
            wasCoasting = false;
        }
        if (isDragging || inMomentum) wasCoasting = true;

        if (!rotationChanged && !isDragging && !needsRender) return;

        needsRender = false;

        if (meshGroup) {
            meshGroup.rotation.set(rotX, rotY, 0);
        }

        renderer.render(scene, camera);
    }

    function dispose() {
        if (animId) cancelAnimationFrame(animId);
        if (renderer) renderer.dispose();
    }

    // Returns the indexed meshes the preview is currently displaying, plus
    // the center offset that was applied. exportOBJ subtracts the center so
    // the OBJ lands at the origin, matching what the user saw.
    // Waits for any in-flight worker run so the export never races the preview.
    function getExportMesh() {
        if (!workerBusy) {
            return Promise.resolve({ meshes: exportMeshCache, center: exportCenter });
        }
        return new Promise(resolve => {
            pendingWorkerResolvers.push(() => {
                resolve({ meshes: exportMeshCache, center: exportCenter });
            });
        });
    }

    return {
        init, resize, updateMesh, dispose,
        computeColumnHeights, laplacianSmooth, setDepth,
        getExportMesh,
        get depthFactor() { return depthFactor; },
    };
})();
