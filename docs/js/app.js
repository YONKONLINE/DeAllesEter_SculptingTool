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
        const brushSizeInput = document.getElementById('brush-size');
        const brushSizeLabel = document.getElementById('brush-size-label');
        const fileInput = document.getElementById('file-input');

        btnPencil.addEventListener('click', () => setTool('pencil'));
        btnEraser.addEventListener('click', () => setTool('eraser'));
        btnFill.addEventListener('click', () => setTool('fill'));
        btnUndo.addEventListener('click', undo);
        btnRedo.addEventListener('click', redo);

        brushSizeInput.min = 6;
        brushSizeInput.max = 10;
        brushSizeInput.value = 6;
        brushSizeLabel.textContent = '6';
        Drawing.setBrushSize(6);

        brushSizeInput.addEventListener('input', () => {
            const s = parseInt(brushSizeInput.value);
            Drawing.setBrushSize(s);
            brushSizeLabel.textContent = s;
        });


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

    // ---- Layer UI with drag-to-reorder ----

    let dragSourceHex = null;
    let prevLayerHexes = new Set();

    function renderLayerList() {
        const list = document.getElementById('layer-list');
        list.innerHTML = '';

        const layers = Layers.getAll();
        const activeHex = Layers.getActiveColorHex();
        const currentHexes = new Set(layers.map(l => l.color));

        for (let i = layers.length - 1; i >= 0; i--) {
            const layer = layers[i];
            const isActive = layer.color === activeHex;
            const isNew = !prevLayerHexes.has(layer.color);
            const el = document.createElement('div');
            el.className = 'layer-item' + (isActive ? ' active' : '') + (isNew ? ' pop-in' : '');
            el.className += Layers.isLightColor(layer.color) ? ' light-color' : ' dark-color';
            el.style.backgroundColor = layer.color;
            el.draggable = true;
            el.dataset.hex = layer.color;

            el.addEventListener('click', () => {
                Layers.setActiveColor(layer.color);
            });

            el.addEventListener('dragstart', (e) => {
                dragSourceHex = layer.color;
                el.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
            });

            el.addEventListener('dragend', () => {
                el.classList.remove('dragging');
                dragSourceHex = null;
                list.querySelectorAll('.drag-over').forEach(x => x.classList.remove('drag-over'));
            });

            el.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                el.classList.add('drag-over');
            });

            el.addEventListener('dragleave', () => {
                el.classList.remove('drag-over');
            });

            el.addEventListener('drop', (e) => {
                e.preventDefault();
                el.classList.remove('drag-over');
                if (dragSourceHex && dragSourceHex !== layer.color) {
                    pushUndo();
                    Layers.moveLayer(dragSourceHex, layer.color);
                    scheduleUpdateMesh();
                }
            });

            if (layers.length > 1) {
                const del = document.createElement('div');
                del.className = 'layer-delete';
                del.textContent = '\u00d7';
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
            if (!Layers.isLightColor(hex)) swatch.className += ' dark-swatch';
            swatch.style.backgroundColor = hex;
            swatch.title = name;
            swatch.addEventListener('click', () => {
                Layers.setActiveColor(hex);
                // If in eraser mode, auto-switch to pencil when picking a color
                if (currentTool === 'eraser') {
                    setTool('pencil');
                }
            });
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
