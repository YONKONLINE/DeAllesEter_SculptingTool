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

    function setDepth(val) { depthFactor = val; }

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

            for (const r of results) {
                const positions = new Float32Array(r.positions);
                const normals = new Float32Array(r.normals);
                if (positions.length === 0) continue;

                const geometry = new THREE.BufferGeometry();
                geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
                geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));

                const rgb = Layers.hexToRgb(r.color);
                const material = new THREE.MeshStandardMaterial({
                    color: new THREE.Color(rgb.r, rgb.g, rgb.b),
                    metalness: 0.05,
                    roughness: 0.4,
                    side: THREE.DoubleSide,
                    flatShading: false,
                });

                const mesh = new THREE.Mesh(geometry, material);
                mesh.userData.basePositions = new Float32Array(positions);
                meshGroup.add(mesh);
            }

            centerAndFit();
        };
    }

    function init(canvasEl) {
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0xf5f0e8);

        camera = new THREE.PerspectiveCamera(30, 1, 0.1, 2000);
        camera.position.set(0, 0, 200);
        camera.lookAt(0, 0, 0);

        renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

        scene.add(new THREE.AmbientLight(0xffffff, 0.5));

        const key = new THREE.DirectionalLight(0xffffff, 0.7);
        key.position.set(50, 80, 60);
        scene.add(key);

        const fill = new THREE.DirectionalLight(0xffffff, 0.35);
        fill.position.set(-40, 20, -40);
        scene.add(fill);

        const rim = new THREE.DirectionalLight(0xffffff, 0.2);
        rim.position.set(0, -30, -50);
        scene.add(rim);

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
    }

    function onPointerUp() {
        if (!isDragging) return;
        isDragging = false;
        // Momentum continues from current velocity — handled in animate()
        // After momentum dies down, restart auto-rotate
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
            isAutoRotating = true;
            autoRotVelX = (Math.random() - 0.5) * 0.004;
            autoRotVelY = (Math.random() * 0.004) + 0.003;
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
            return;
        }

        if (!meshWorker) return;

        // Snapshot voxel data and send to worker
        const filledSnap = new Uint8Array(VoxelGrid.filled);
        const layerData = layers.map(l => ({ color: l.color, z: l.z }));
        const id = ++workerUpdateId;

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

    /**
     * Cheap 3D noise using layered sines — no library needed.
     * Returns a value roughly in -1..1.
     */
    function cheapNoise(x, y, z, t) {
        return Math.sin(x * 1.7 + t * 2.3) * 0.3
             + Math.sin(y * 2.3 + t * 1.7) * 0.3
             + Math.sin(z * 1.3 + t * 3.1) * 0.2
             + Math.sin((x + y) * 0.9 + t * 1.9) * 0.2;
    }

    const WIGGLE_AMP = 0.7;   // how far vertices wobble
    const WIGGLE_FREQ = 0.08; // spatial frequency (lower = bigger wobbles)
    const WIGGLE_SPEED = 3.0; // animation speed
    const WIGGLE_FPS = 8;     // match 2D wobble frame rate
    let lastWiggleTime = 0;
    let wiggleT = 0;          // stepped time value

    function animate() {
        animId = requestAnimationFrame(animate);

        if (isDragging) {
            // Dragging — rotation handled in onPointerMove
        } else if (Math.abs(velX) > MIN_VEL || Math.abs(velY) > MIN_VEL) {
            // Momentum: coast after release
            rotX += velX;
            rotY += velY;
            velX *= DRAG_FRICTION;
            velY *= DRAG_FRICTION;
        } else if (isAutoRotating) {
            rotX += autoRotVelX;
            rotY += autoRotVelY;
        }

        if (meshGroup) {
            meshGroup.rotation.set(rotX, rotY, 0);

            // Wiggly vertex animation at stepped frame rate (matches 2D wobble).
            // Only recompute vertices when wiggleT actually advances (e.g. 8fps)
            // — not every requestAnimationFrame tick. This is the big perf win
            // for many-layer scenes since the inner loop touches every vertex.
            const now = performance.now();
            if (now - lastWiggleTime > 1000 / WIGGLE_FPS) {
                lastWiggleTime = now;
                wiggleT = now * 0.001 * WIGGLE_SPEED;
                const t = wiggleT;
                for (const child of meshGroup.children) {
                    if (!child.isMesh || !child.userData.basePositions) continue;
                    const base = child.userData.basePositions;
                    const pos = child.geometry.attributes.position.array;
                    const count = base.length;

                    for (let i = 0; i < count; i += 3) {
                        const bx = base[i], by = base[i+1], bz = base[i+2];
                        const fx = bx * WIGGLE_FREQ, fy = by * WIGGLE_FREQ, fz = bz * WIGGLE_FREQ;
                        pos[i]   = bx + cheapNoise(fx, fy, fz, t) * WIGGLE_AMP;
                        pos[i+1] = by + cheapNoise(fx + 31.7, fy + 17.3, fz + 7.1, t) * WIGGLE_AMP;
                        pos[i+2] = bz + cheapNoise(fx + 11.3, fy + 41.7, fz + 23.9, t) * WIGGLE_AMP;
                    }

                    child.geometry.attributes.position.needsUpdate = true;
                }
            }
        }

        renderer.render(scene, camera);
    }

    function dispose() {
        if (animId) cancelAnimationFrame(animId);
        if (renderer) renderer.dispose();
    }

    return { init, resize, updateMesh, dispose, computeColumnHeights, laplacianSmooth, setDepth, get depthFactor() { return depthFactor; } };
})();
