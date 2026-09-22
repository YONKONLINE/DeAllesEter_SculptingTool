/**
 * Vorm Jr. - Main App
 * Wires together all modules and handles UI.
 */
(function() {
    'use strict';

    // Undo/Redo stacks
    const undoStack = [];
    const redoStack = [];
    const MAX_UNDO = 20;

    // A snapshot bundles BOTH voxel data AND the layer table — otherwise
    // undoing an action that created a new layer (e.g. picking a fresh color
    // and drawing) would restore the voxels but leave the empty layer in place.
    function takeSnapshot() {
        return {
            voxels: VoxelGrid.snapshot(),
            layers: Layers.snapshot(),
        };
    }
    function applySnapshot(snap) {
        VoxelGrid.restore(snap.voxels);
        Layers.restore(snap.layers);
    }

    function pushUndo() {
        undoStack.push(takeSnapshot());
        if (undoStack.length > MAX_UNDO) undoStack.shift();
        // Clear redo when a new action is performed
        redoStack.length = 0;
    }

    function undo() {
        if (undoStack.length === 0) return;
        redoStack.push(takeSnapshot());
        applySnapshot(undoStack.pop());
        Drawing.render();
        scheduleUpdateMesh();
    }

    function redo() {
        if (redoStack.length === 0) return;
        undoStack.push(takeSnapshot());
        applySnapshot(redoStack.pop());
        Drawing.render();
        scheduleUpdateMesh();
    }

    let meshUpdateTimer = null;
    function scheduleUpdateMesh() {
        if (meshUpdateTimer) clearTimeout(meshUpdateTimer);
        meshUpdateTimer = setTimeout(() => {
            Renderer.updateMesh();
        }, 200);
    }

    // ---- Current tool state (shared) ----
    let currentTool = 'pencil';

    function setTool(tool) {
        currentTool = tool;
        Drawing.setTool(tool);
        document.getElementById('btn-pencil').classList.toggle('active', tool === 'pencil');
        document.getElementById('btn-eraser').classList.toggle('active', tool === 'eraser');
        document.getElementById('btn-fill').classList.toggle('active', tool === 'fill');
    }

    // ---- UI Setup ----

    function initToolbar() {
        const btnPencil = document.getElementById('btn-pencil');
        const btnEraser = document.getElementById('btn-eraser');
        const btnFill = document.getElementById('btn-fill');
        const btnUndo = document.getElementById('btn-undo');
        const btnRedo = document.getElementById('btn-redo');
        const btnSave = document.getElementById('btn-save');
        const btnOpen = document.getElementById('btn-open');
        const btnExport = document.getElementById('btn-export');
        const fileInput = document.getElementById('file-input');

        const bounce = (btn) => {
            btn.classList.remove('bounce');
            void btn.offsetWidth;
            btn.classList.add('bounce');
        };

        btnPencil.addEventListener('click', () => { bounce(btnPencil); setTool('pencil'); });
        btnEraser.addEventListener('click', () => { bounce(btnEraser); setTool('eraser'); });
        btnFill.addEventListener('click',   () => { bounce(btnFill);   setTool('fill'); });

        // Bucket is one-shot: once it has poured, hand control straight back to the
        // pen so the next touch draws instead of flooding the drawing again. The
        // bounce is what tells a kid the tool moved on without them pressing anything.
        Drawing.onFillComplete = () => { setTool('pencil'); bounce(btnPencil); };
        btnUndo.addEventListener('click',   () => { bounce(btnUndo);   undo(); });
        btnRedo.addEventListener('click',   () => { bounce(btnRedo);   redo(); });

        initBrushSizeControl();


        btnSave.addEventListener('click', () => FileIO.save());
        btnOpen.addEventListener('click', () => fileInput.click());

        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            try {
                await FileIO.open(file);
                renderLayerList();
                renderColorPalette();
                Drawing.render();
                Renderer.updateMesh();
            } catch (err) {
                alert('Could not open file: ' + err.message);
            }
            fileInput.value = '';
        });

        btnExport.addEventListener('click', () => {
            Renderer.updateMesh();
            FileIO.exportOBJ();
        });

        initSendButton();
        initRestartButton();
        initSecretReveal();
        initSettingsPanel();
    }

    // Brush size = drag to fill the pill. Fill fraction is written to CSS via
    // transform: scaleX() (not width) so iPad Safari doesn't leave 1-px
    // vertical seams while dragging.
    const BRUSH_MIN = 3, BRUSH_MAX = 10, BRUSH_DEFAULT = 5;
    let brushValue = BRUSH_DEFAULT;
    let brushFillEl = null;

    function applyBrushSize(v) {
        const clamped = Math.round(Math.max(BRUSH_MIN, Math.min(BRUSH_MAX, v)));
        brushValue = clamped;
        const frac = (clamped - BRUSH_MIN) / (BRUSH_MAX - BRUSH_MIN);
        if (brushFillEl) brushFillEl.style.transform = `scaleX(${frac})`;
        Drawing.setBrushSize(clamped);
    }
    function resetBrushSize() { applyBrushSize(BRUSH_DEFAULT); }

    function initBrushSizeControl() {
        const pill = document.getElementById('brush-size');
        brushFillEl = document.getElementById('brush-size-fill');
        applyBrushSize(BRUSH_DEFAULT);

        let pressing = false;
        function fromPointer(e) {
            const rect = pill.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const t = Math.max(0, Math.min(1, x / rect.width));
            applyBrushSize(BRUSH_MIN + t * (BRUSH_MAX - BRUSH_MIN));
        }

        pill.addEventListener('pointerdown', (e) => {
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            pressing = true;
            pill.setPointerCapture(e.pointerId);
            fromPointer(e);
        });
        pill.addEventListener('pointermove', (e) => { if (pressing) fromPointer(e); });
        const release = () => { pressing = false; };
        pill.addEventListener('pointerup', release);
        pill.addEventListener('pointercancel', release);

        pill.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowUp')   { e.preventDefault(); applyBrushSize(brushValue + 1); }
            else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); applyBrushSize(brushValue - 1); }
        });
    }

    // Shared "wipe and start fresh" — pushes an undo snapshot, clears voxels,
    // reinitializes layers/brush, and repaints the UI. Called from Restart
    // confirm and also from a successful Feed so the next kid sees a blank
    // canvas.
    function clearCanvas() {
        pushUndo();
        VoxelGrid.clear();
        Layers.init();
        resetBrushSize();
        renderLayerList();
        renderColorPalette();
        Drawing.render();
        Renderer.updateMesh();
    }

    // ---- Restart (clear everything) ----
    function initRestartButton() {
        const btnRestart = document.getElementById('btn-restart');
        const overlay = document.getElementById('restart-overlay');
        const cancel = document.getElementById('restart-cancel');
        const confirm = document.getElementById('restart-confirm');

        function openRestart() {
            overlay.hidden = false;
        }
        function closeRestart() {
            overlay.hidden = true;
        }

        btnRestart.addEventListener('click', openRestart);
        cancel.addEventListener('click', closeRestart);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeRestart();
        });
        confirm.addEventListener('click', () => {
            clearCanvas();
            closeRestart();
        });
    }

    // ---- Confetti burst (fires after a successful Feed) ----
    // Full-screen 2D canvas that self-removes when every particle has
    // finished its life. Colors are taken from Layers.PALETTE so the burst
    // always matches whatever palette the app is currently using.
    function fireConfetti() {
        const canvas = document.createElement('canvas');
        canvas.style.cssText =
            'position:fixed;inset:0;pointer-events:none;z-index:9999;';
        // devicePixelRatio backing so shapes look crisp on iPad Retina.
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = window.innerWidth * dpr;
        canvas.height = window.innerHeight * dpr;
        canvas.style.width = window.innerWidth + 'px';
        canvas.style.height = window.innerHeight + 'px';
        document.body.appendChild(canvas);
        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);

        const colors = (Layers.PALETTE || []).map(p => p.hex);
        if (colors.length === 0) colors.push('#ED1C24', '#FFF200', '#22B14C');

        const N = 90;
        const cx = window.innerWidth / 2;
        const cy = window.innerHeight / 2;
        const particles = [];
        for (let i = 0; i < N; i++) {
            // Full 360° spread, upward-biased so most go up-and-out.
            const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.6;
            const speed = 280 + Math.random() * 520;
            particles.push({
                x: cx + (Math.random() - 0.5) * 40,
                y: cy + (Math.random() - 0.5) * 40,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                size: 6 + Math.random() * 9,
                rot: Math.random() * Math.PI * 2,
                vrot: (Math.random() - 0.5) * 12,
                color: colors[Math.floor(Math.random() * colors.length)],
                life: 0,
                maxLife: 1.6 + Math.random() * 0.9,
                shape: Math.random() < 0.5 ? 'rect' : 'circle',
            });
        }

        const GRAVITY = 1100;
        let last = performance.now();
        function frame(now) {
            const dt = Math.min(0.05, (now - last) / 1000);
            last = now;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            let alive = 0;
            for (const p of particles) {
                if (p.life >= p.maxLife) continue;
                alive++;
                p.life += dt;
                p.vy += GRAVITY * dt;
                p.x += p.vx * dt;
                p.y += p.vy * dt;
                p.rot += p.vrot * dt;
                // Fade in for a tick, then out over the last third of the life.
                const t = p.life / p.maxLife;
                const alpha = t < 0.7 ? 1 : Math.max(0, 1 - (t - 0.7) / 0.3);
                ctx.save();
                ctx.globalAlpha = alpha;
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rot);
                ctx.fillStyle = p.color;
                if (p.shape === 'rect') {
                    ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.55);
                } else {
                    ctx.beginPath();
                    ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.restore();
            }
            if (alive > 0) {
                requestAnimationFrame(frame);
            } else {
                canvas.remove();
            }
        }
        requestAnimationFrame(frame);
    }

    // ---- Send (main button kids use) ----
    function initSendButton() {
        const btnSend = document.getElementById('btn-send');
        const sendOverlay = document.getElementById('send-overlay');
        const sendNameInput = document.getElementById('send-name');
        const sendConfirm = document.getElementById('send-confirm');
        const sendCancel = document.getElementById('send-cancel');
        const sendStatus = document.getElementById('send-status');

        function refreshConfirmEnabled() {
            // Non-whitespace character required to send. Keeps kids from
            // firing an empty "Artist" upload just by mashing enter.
            sendConfirm.disabled = sendNameInput.value.trim().length === 0;
        }

        function openSend() {
            sendNameInput.value = '';
            sendStatus.textContent = '';
            refreshConfirmEnabled();
            sendOverlay.hidden = false;
            setTimeout(() => sendNameInput.focus(), 50);
        }

        function closeSend() {
            sendOverlay.hidden = true;
        }

        btnSend.addEventListener('click', openSend);
        sendCancel.addEventListener('click', closeSend);
        sendOverlay.addEventListener('click', (e) => {
            if (e.target === sendOverlay) closeSend();
        });

        sendNameInput.addEventListener('input', refreshConfirmEnabled);
        sendNameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !sendConfirm.disabled) sendConfirm.click();
            if (e.key === 'Escape') closeSend();
        });

        sendConfirm.addEventListener('click', async () => {
            if (sendConfirm.disabled) return;
            const name = sendNameInput.value.trim();
            if (!name) return;
            FileIO.setArtistName(name);
            sendConfirm.disabled = true;
            sendStatus.textContent = 'Feeding... / Voeren...';
            // exportOBJ awaits the worker internally, so no manual delay needed.
            Renderer.updateMesh();
            const result = await FileIO.exportOBJ();
            sendStatus.textContent = result.message;
            if (result.ok) {
                setTimeout(() => {
                    closeSend();
                    fireConfetti();
                    // Clear the canvas so the next drawer starts fresh.
                    clearCanvas();
                }, 1200);
            } else {
                refreshConfirmEnabled();
            }
        });
    }

    // ---- Hidden reveal: tap logo 5x within 2s to show extras ----
    function initSecretReveal() {
        const logo = document.getElementById('logo');
        const extras = document.getElementById('extras-toolbar');
        let taps = [];
        const NEEDED = 5;
        const WINDOW_MS = 2000;

        logo.addEventListener('click', () => {
            // If extras are visible, a single tap closes them.
            if (!extras.hidden) {
                extras.hidden = true;
                taps = [];
                return;
            }
            // Otherwise require 5 taps within WINDOW_MS to open.
            const now = Date.now();
            taps = taps.filter(t => now - t < WINDOW_MS);
            taps.push(now);
            if (taps.length >= NEEDED) {
                taps = [];
                extras.hidden = false;
            }
        });
    }

    // ---- Settings panel (hidden behind secret reveal) ----
    function initSettingsPanel() {
        const btnSettings = document.getElementById('btn-settings');
        const settingsOverlay = document.getElementById('settings-overlay');
        const uploadUrlInput = document.getElementById('upload-url');
        const settingsSave = document.getElementById('settings-save');
        const settingsCancel = document.getElementById('settings-cancel');

        btnSettings.addEventListener('click', () => {
            uploadUrlInput.value = FileIO.getUploadUrl();
            settingsOverlay.hidden = false;
        });

        settingsSave.addEventListener('click', () => {
            FileIO.setUploadUrl(uploadUrlInput.value.trim());
            settingsOverlay.hidden = true;
        });

        settingsCancel.addEventListener('click', () => {
            settingsOverlay.hidden = true;
        });

        settingsOverlay.addEventListener('click', (e) => {
            if (e.target === settingsOverlay) settingsOverlay.hidden = true;
        });

        document.getElementById('settings-test').addEventListener('click', async () => {
            const url = uploadUrlInput.value.trim();
            const result = document.getElementById('settings-test-result');
            if (!url) { result.textContent = 'Enter a URL first'; return; }
            result.textContent = 'Testing...';
            try {
                const resp = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(5000) });
                result.textContent = resp.ok ? 'Connected!' : 'Server error: ' + resp.status;
            } catch (e) {
                result.textContent = 'Cannot reach server';
            }
        });

        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z') {
                e.preventDefault();
                redo();
            } else if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
                e.preventDefault();
                undo();
            } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
                e.preventDefault();
                redo();
            }
        });
    }

    // ---- Layer UI with pointer-based drag reorder ----

    let prevLayerHexes = new Set();
    // Set to a hex right before Layers.setLayerOrder() so the re-render can
    // add the drop-bounce class to the same layer at its new DOM position.
    let justDroppedHex = null;
    // Set to a hex whose element should NOT get the pop-in "new layer"
    // animation (used when we drop into a same-slot no-op so the layer
    // doesn't re-mount into a from-scratch animation).
    let suppressPopInFor = null;

    function renderLayerList() {
        const list = document.getElementById('layer-list');
        list.innerHTML = '';

        const layers = Layers.getAll();
        const activeHex = Layers.getActiveColorHex();
        const currentHexes = new Set(layers.map(l => l.color));

        // DOM order top-down = highest z first, so we iterate backward.
        for (let i = layers.length - 1; i >= 0; i--) {
            const layer = layers[i];
            const isActive = layer.color === activeHex;
            const isNew = !prevLayerHexes.has(layer.color) && layer.color !== suppressPopInFor;
            const isDropped = layer.color === justDroppedHex;

            const el = document.createElement('div');
            let cls = 'layer-item';
            if (isActive) cls += ' active';
            if (isDropped) cls += ' dropping';
            else if (isNew) cls += ' pop-in';
            el.className = cls;
            el.style.backgroundColor = layer.color;
            el.dataset.hex = layer.color;

            attachLayerDrag(el, layer, list);
            list.appendChild(el);
        }

        prevLayerHexes = currentHexes;
        justDroppedHex = null;
        suppressPopInFor = null;
    }

    // Pointer-based drag reorder for a single layer element.
    //   - Under threshold movement = click \u2192 select layer
    //   - Beyond threshold           = drag; siblings shift to open a slot at
    //     the closest insertion index, dragged element follows finger.
    //   - Drop                       = commit new order via Layers.setLayerOrder,
    //     bounce the settled element via .dropping animation.
    function attachLayerDrag(el, layer, list) {
        let pressing = false;
        let dragging = false;
        let startClientY = 0;
        let siblings = [];       // [{el, natIndex, top, height}] excluding the dragged one
        let stepSize = 0;        // approximate row-to-row distance
        let originalDomIndex = 0;
        let targetIndex = 0;

        el.addEventListener('pointerdown', onDown);

        function onDown(e) {
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            pressing = true;
            startClientY = e.clientY;
            el.setPointerCapture(e.pointerId);
            el.addEventListener('pointermove', onMove);
            el.addEventListener('pointerup', onUp);
            el.addEventListener('pointercancel', onCancel);
        }

        let overBin = false;
        const panel = document.getElementById('layer-panel');
        const bin = document.getElementById('layer-delete-bin');

        function beginDrag() {
            dragging = true;
            el.classList.add('dragging');
            const items = Array.from(list.children);
            originalDomIndex = items.indexOf(el);
            const listRect = list.getBoundingClientRect();
            siblings = [];
            for (let i = 0; i < items.length; i++) {
                const n = items[i];
                if (n === el) continue;
                const r = n.getBoundingClientRect();
                siblings.push({
                    el: n,
                    natIndex: i,
                    center: (r.top - listRect.top) + r.height / 2,
                    height: r.height,
                });
                n.style.transition = 'transform var(--pop) var(--bounce)';
            }
            // 44px item + 10px list gap.
            stepSize = 54;
            targetIndex = originalDomIndex;

            // Wake the delete bin at the bottom of the panel \u2014 it labels
            // itself and becomes a drop target for removal. Also drop the
            // list's scroll clip so the dragged element can paint on top of
            // (rather than getting cut off behind) the bin as it moves down.
            if (panel) panel.classList.add('drag-active');
            if (bin) bin.textContent = 'Delete Layer / Laag';
            list.classList.add('no-clip');
            overBin = false;
        }

        function onMove(e) {
            if (!pressing) return;
            const dy = e.clientY - startClientY;
            if (!dragging) {
                if (Math.abs(dy) < 6) return;
                beginDrag();
            }
            // Move dragged element with the finger.
            el.style.transform = `translateY(${dy}px) scale(1.04)`;

            // Delete-bin hit test \u2014 if the pointer is over the bin, hovering
            // reorder logic pauses and we highlight the bin instead.
            if (bin) {
                const br = bin.getBoundingClientRect();
                const inside =
                    e.clientX >= br.left && e.clientX <= br.right &&
                    e.clientY >= br.top && e.clientY <= br.bottom;
                if (inside !== overBin) {
                    overBin = inside;
                    bin.classList.toggle('hovered', inside);
                }
                if (overBin) return;
            }

            // Compute insertion index by finding which sibling center the
            // pointer is currently above (siblings' natural untranslated
            // positions \u2014 their visual shifts don't move the anchors).
            const listRect = list.getBoundingClientRect();
            const pointerY = e.clientY - listRect.top;
            let newIndex = siblings.length; // past the last slot = end
            for (let i = 0; i < siblings.length; i++) {
                if (pointerY < siblings[i].center) {
                    newIndex = siblings[i].natIndex;
                    if (newIndex > originalDomIndex) newIndex--;
                    break;
                }
            }
            newIndex = Math.max(0, Math.min(list.children.length - 1, newIndex));

            if (newIndex !== targetIndex) {
                targetIndex = newIndex;
                shiftSiblingsFor(newIndex);
            }
        }

        // Given the dragged item's target DOM index, shift each sibling up or
        // down by one row so an empty slot appears at newIndex.
        function shiftSiblingsFor(newIndex) {
            for (const s of siblings) {
                const nat = s.natIndex;
                let shift = 0;
                if (newIndex > originalDomIndex && nat > originalDomIndex && nat <= newIndex) {
                    shift = -stepSize;
                } else if (newIndex < originalDomIndex && nat < originalDomIndex && nat >= newIndex) {
                    shift = stepSize;
                }
                s.el.style.transform = shift ? `translateY(${shift}px)` : '';
            }
        }

        function clearSiblings() {
            for (const s of siblings) {
                s.el.style.transform = '';
                // Let the next full render own its transition again.
                s.el.style.transition = '';
            }
            siblings = [];
        }

        function onUp(e) {
            pressing = false;
            el.removeEventListener('pointermove', onMove);
            el.removeEventListener('pointerup', onUp);
            el.removeEventListener('pointercancel', onCancel);

            if (!dragging) {
                // A tap \u2014 select this layer and bounce it.
                Layers.setActiveColor(layer.color);
                return;
            }

            const finalIndex = targetIndex;
            const droppedInBin = overBin;
            el.classList.remove('dragging');
            el.style.transform = '';
            clearSiblings();
            list.classList.remove('no-clip');
            if (panel) panel.classList.remove('drag-active');
            if (bin) {
                bin.classList.remove('hovered');
                bin.textContent = '';
            }

            if (droppedInBin) {
                // Delete this layer instead of reordering, and give the bin a
                // brief bounce so the user sees the drop landed.
                pushUndo();
                Layers.removeLayer(layer.color);
                scheduleUpdateMesh();
                if (bin) {
                    bin.classList.remove('deleted');
                    void bin.offsetWidth;
                    bin.classList.add('deleted');
                    setTimeout(() => bin.classList.remove('deleted'), 560);
                }
            } else if (finalIndex !== originalDomIndex) {
                // Compute new hex order and commit.
                const items = Array.from(list.children);
                items.splice(items.indexOf(el), 1);
                items.splice(finalIndex, 0, el);
                // DOM top-down = highest-z first, so lowest-z-first is reversed.
                const order = items.map(n => n.dataset.hex).reverse();
                pushUndo();
                justDroppedHex = layer.color;
                Layers.setLayerOrder(order);
                scheduleUpdateMesh();
            } else {
                // Same slot \u2014 still bounce the dropped item for feedback.
                el.classList.remove('dropping');
                void el.offsetWidth;
                el.classList.add('dropping');
                setTimeout(() => el.classList.remove('dropping'), 560);
            }
            dragging = false;
        }

        function onCancel() {
            pressing = false;
            if (dragging) {
                el.classList.remove('dragging');
                el.style.transform = '';
                clearSiblings();
                list.classList.remove('no-clip');
                if (panel) panel.classList.remove('drag-active');
                if (bin) {
                    bin.classList.remove('hovered');
                    bin.textContent = '';
                }
                dragging = false;
            }
        }
    }

    function initLayers() {
        Layers.init();

        Layers.onChange(() => {
            renderLayerList();
            renderColorPalette();
            Drawing.render();
        });

        const addBtn = document.getElementById('btn-add-layer');
        if (addBtn) addBtn.style.display = 'none';

        renderLayerList();
    }

    // ---- Color Palette ----

    function renderColorPalette() {
        const palette = document.getElementById('color-palette');
        palette.innerHTML = '';

        const activeHex = Layers.getActiveColorHex();

        Layers.PALETTE.forEach(({ hex, name }) => {
            const swatch = document.createElement('div');
            swatch.className = 'color-swatch' + (hex === activeHex ? ' active' : '');
            swatch.style.backgroundColor = hex;
            swatch.title = name;

            // Fire on pointerdown, not click. On iPad, a quick tap-then-drag
            // to the canvas can skip the click event (the pointer left the
            // swatch before release), leaving activeColor unchanged and
            // making the user re-tap. pointerdown always fires the instant
            // the finger touches, guaranteeing the color/layer is set before
            // the canvas ever sees a pointerdown.
            const selectColor = (e) => {
                if (e && e.pointerType === 'mouse' && e.button !== 0) return;
                const hadLayer = !!Layers.getLayerByColor(hex);
                if (!hadLayer) pushUndo();
                Layers.setActiveColor(hex);
                Layers.ensureLayerForColor(hex);
                if (currentTool === 'eraser') setTool('pencil');
                // Re-render replaces this DOM node — bounce the fresh one.
                const fresh = palette.querySelector(`.color-swatch[data-hex="${hex}"]`) || swatch;
                fresh.classList.remove('bounce');
                void fresh.offsetWidth;
                fresh.classList.add('bounce');
                setTimeout(() => fresh.classList.remove('bounce'), 500);
            };
            swatch.addEventListener('pointerdown', selectColor);
            swatch.dataset.hex = hex;
            palette.appendChild(swatch);
        });
    }

    // ---- Init ----

    function init() {
        VoxelGrid.init();
        initLayers();
        Drawing.init(document.getElementById('draw-canvas'));
        Renderer.init(document.getElementById('preview-canvas'));
        initToolbar();
        renderColorPalette();

        Drawing.onStrokeStart = () => { pushUndo(); };
        Drawing.onStrokeEnd = () => { scheduleUpdateMesh(); };

        let resizeTimer;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                Drawing.resize();
                Renderer.resize();
            }, 100);
        });

        Renderer.updateMesh();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
