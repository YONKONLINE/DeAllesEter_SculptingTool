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

    function pushUndo() {
        undoStack.push(VoxelGrid.snapshot());
        if (undoStack.length > MAX_UNDO) undoStack.shift();
        // Clear redo when a new action is performed
        redoStack.length = 0;
    }

    function undo() {
        if (undoStack.length === 0) return;
        // Save current state to redo stack
        redoStack.push(VoxelGrid.snapshot());
        const snap = undoStack.pop();
        VoxelGrid.restore(snap);
        Drawing.render();
        scheduleUpdateMesh();
    }

    function redo() {
        if (redoStack.length === 0) return;
        // Save current state to undo stack
        undoStack.push(VoxelGrid.snapshot());
        const snap = redoStack.pop();
        VoxelGrid.restore(snap);
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

    // ---- Custom drag-to-fill Size / Formaat control ----
    function initBrushSizeControl() {
        const pill = document.getElementById('brush-size');
        const fill = document.getElementById('brush-size-fill');
        const label = document.getElementById('brush-size-label');
        const MIN = 1, MAX = 10;
        let value = 6;

        function apply(v) {
            const clamped = Math.round(Math.max(MIN, Math.min(MAX, v)));
            if (clamped === value && parseFloat(fill.style.width) === ((clamped - MIN) / (MAX - MIN)) * 100) return;
            value = clamped;
            const pct = ((value - MIN) / (MAX - MIN)) * 100;
            fill.style.width = pct + '%';
            label.textContent = value;
            Drawing.setBrushSize(value);
        }
        apply(6);

        let pressing = false;
        function fromPointer(e) {
            const rect = pill.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const t = Math.max(0, Math.min(1, x / rect.width));
            apply(MIN + t * (MAX - MIN));
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

        // Keyboard fallback: ← / → tweak by 1
        pill.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); apply(value + 1); }
            else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); apply(value - 1); }
        });
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
            pushUndo();
            VoxelGrid.clear();
            Layers.init();
            renderLayerList();
            renderColorPalette();
            Drawing.render();
            Renderer.updateMesh();
            closeRestart();
        });
    }

    // ---- Send (main button kids use) ----
    function initSendButton() {
        const btnSend = document.getElementById('btn-send');
        const sendOverlay = document.getElementById('send-overlay');
        const sendNameInput = document.getElementById('send-name');
        const sendConfirm = document.getElementById('send-confirm');
        const sendCancel = document.getElementById('send-cancel');
        const sendStatus = document.getElementById('send-status');

        function openSend() {
            sendNameInput.value = '';
            sendStatus.textContent = '';
            sendConfirm.disabled = false;
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

        sendNameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') sendConfirm.click();
            if (e.key === 'Escape') closeSend();
        });

        sendConfirm.addEventListener('click', async () => {
            const name = sendNameInput.value.trim() || 'Artist';
            FileIO.setArtistName(name);
            sendConfirm.disabled = true;
            sendStatus.textContent = 'Sending... / Versturen...';
            // exportOBJ awaits the worker internally, so no manual delay needed.
            Renderer.updateMesh();
            const result = await FileIO.exportOBJ();
            sendStatus.textContent = result.message;
            if (result.ok) {
                setTimeout(closeSend, 1200);
            } else {
                sendConfirm.disabled = false;
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

            if (layers.length > 1) {
                const del = document.createElement('div');
                del.className = 'layer-delete';
                del.textContent = '\u00d7';
                // Prevent the layer's pointerdown handler from starting a drag
                // when the user hits the little \u00d7 in the corner.
                del.addEventListener('pointerdown', (e) => { e.stopPropagation(); });
                del.addEventListener('click', (e) => {
                    e.stopPropagation();
                    pushUndo();
                    Layers.removeLayer(layer.color);
                    scheduleUpdateMesh();
                });
                el.appendChild(del);
            }

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
                    // Center Y relative to the list, used to compute insertion.
                    center: (r.top - listRect.top) + r.height / 2,
                    height: r.height,
                });
                // Give siblings a transition so they slide as the phantom slot moves.
                n.style.transition = 'transform var(--pop) var(--bounce)';
            }
            // Uniform step \u2014 use the base layer height (48) + list gap (10).
            // Active layer being 2x taller doesn't matter for insertion feel;
            // the .dragging class collapses the dragged element back to 48.
            stepSize = 58;
            targetIndex = originalDomIndex;
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

            // Compute insertion index by finding which sibling center the
            // pointer is currently above (accounting for siblings' *natural*
            // untranslated positions \u2014 their shifts are visual only).
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
            el.classList.remove('dragging');
            el.style.transform = '';
            clearSiblings();

            if (finalIndex !== originalDomIndex) {
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
            swatch.addEventListener('click', () => {
                // Selection first — the re-render replaces this element, so the
                // fresh one is what we want the bounce animation to land on.
                Layers.setActiveColor(hex);
                if (currentTool === 'eraser') setTool('pencil');
                const fresh = palette.querySelector(`.color-swatch[data-hex="${hex}"]`) || swatch;
                fresh.classList.remove('bounce');
                void fresh.offsetWidth;
                fresh.classList.add('bounce');
                setTimeout(() => fresh.classList.remove('bounce'), 500);
            });
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
