/**
 * Layer Management for Vorm Jr.
 * Layers are auto-created when a color is selected.
 * Each color gets its own layer (z-level).
 */
const Layers = (() => {
    // MS Paint style robust colors
    const PALETTE = [
        { hex: '#000000', name: 'Black' },
        { hex: '#7F7F7F', name: 'Grey' },
        { hex: '#FFFFFF', name: 'White' },
        { hex: '#ED1C24', name: 'Red' },
        { hex: '#FF7F27', name: 'Orange' },
        { hex: '#FFF200', name: 'Yellow' },
        { hex: '#22B14C', name: 'Green' },
        { hex: '#00A2E8', name: 'Cyan' },
        { hex: '#3F48CC', name: 'Blue' },
        { hex: '#A349A4', name: 'Purple' },
        { hex: '#FFAEC9', name: 'Pink' },
        { hex: '#B97A57', name: 'Brown' },
    ];

    // Map from color hex -> layer info
    let colorToLayer = {};
    let nextZ = 0;
    let activeColorHex = PALETTE[0].hex;
    let onChangeCallback = null;

    function init() {
        colorToLayer = {};
        nextZ = 0;
        // Default to Red so the first stroke creates a colored layer rather than black
        const defaultColor = PALETTE.find(p => p.name === 'Red') || PALETTE[0];
        activeColorHex = defaultColor.hex;
        // Note: no layer is created until the user actually draws something
    }

    function ensureLayerForColor(hex) {
        if (colorToLayer[hex]) return colorToLayer[hex];
        if (nextZ >= VoxelGrid.MAX_LAYERS) return null;

        const info = PALETTE.find(p => p.hex === hex);
        const name = info ? info.name : 'Color';
        const layer = { color: hex, name: name, z: nextZ };
        colorToLayer[hex] = layer;
        nextZ++;
        if (onChangeCallback) onChangeCallback();
        return layer;
    }

    function setActiveColor(hex) {
        activeColorHex = hex;
        // Do NOT create a layer yet — only on actual draw
        if (onChangeCallback) onChangeCallback();
    }

    function getActive() {
        // Returns existing layer for active color, or null if no draw yet.
        return colorToLayer[activeColorHex] || null;
    }

    // Called from drawing tools when the user actually paints
    function getOrCreateActive() {
        return colorToLayer[activeColorHex] || ensureLayerForColor(activeColorHex);
    }

    function getActiveColorHex() {
        return activeColorHex;
    }

    function getAll() {
        // Return all created layers sorted by z
        return Object.values(colorToLayer).sort((a, b) => a.z - b.z);
    }

    function getLayerByColor(hex) {
        return colorToLayer[hex] || null;
    }

    function removeLayer(hex) {
        const layer = colorToLayer[hex];
        if (!layer) return;

        // Clear voxels on this layer
        const z = layer.z;
        for (let y = 0; y < VoxelGrid.SIZE; y++) {
            for (let x = 0; x < VoxelGrid.SIZE; x++) {
                VoxelGrid.erase(x, y, z);
            }
        }

        delete colorToLayer[hex];

        // If we deleted the active color, switch to first available (or keep selection if none left)
        if (hex === activeColorHex) {
            const remaining = getAll();
            if (remaining.length > 0) {
                activeColorHex = remaining[0].color;
            }
            // If none remain, leave the active color as-is; a new layer will form on next draw.
        }

        if (onChangeCallback) onChangeCallback();
    }

    function hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16) / 255,
            g: parseInt(result[2], 16) / 255,
            b: parseInt(result[3], 16) / 255,
        } : { r: 1, g: 0, b: 0 };
    }

    function getActiveColorRGB() {
        return hexToRgb(activeColorHex);
    }

    function getColorName(hex) {
        const info = PALETTE.find(p => p.hex === hex);
        return info ? info.name : 'Unknown';
    }

    function isLightColor(hex) {
        const rgb = hexToRgb(hex);
        const luminance = 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;
        return luminance > 0.6;
    }

    /**
     * Move a layer (hexSource) to be directly above hexTarget in the stack.
     * Reassigns z-levels for all layers and moves voxel data accordingly.
     */
    function moveLayer(hexSource, hexTarget) {
        if (hexSource === hexTarget) return;
        const all = getAll(); // sorted by z
        const srcIdx = all.findIndex(l => l.color === hexSource);
        const tgtIdx = all.findIndex(l => l.color === hexTarget);
        if (srcIdx === -1 || tgtIdx === -1) return;

        // Remove source from array and insert above target
        const [src] = all.splice(srcIdx, 1);
        const newTgtIdx = all.findIndex(l => l.color === hexTarget);
        // Insert above the target (higher in stack = after in array)
        all.splice(newTgtIdx + 1, 0, src);

        // Now reassign z-levels 0,1,2,... and move voxel data
        const S = VoxelGrid.SIZE;
        const sliceSize = S * S;

        // Back up all voxel data
        const backupFilled = new Uint8Array(VoxelGrid.filled);
        const backupR = new Float32Array(VoxelGrid.colorR);
        const backupG = new Float32Array(VoxelGrid.colorG);
        const backupB = new Float32Array(VoxelGrid.colorB);

        // Reassign: copy each layer's old z data to its new z position
        for (let i = 0; i < all.length; i++) {
            const layer = all[i];
            const oldZ = layer.z;
            const newZ = i;
            const oldOff = oldZ * sliceSize;
            const newOff = newZ * sliceSize;

            VoxelGrid.filled.set(backupFilled.subarray(oldOff, oldOff + sliceSize), newOff);
            VoxelGrid.colorR.set(backupR.subarray(oldOff, oldOff + sliceSize), newOff);
            VoxelGrid.colorG.set(backupG.subarray(oldOff, oldOff + sliceSize), newOff);
            VoxelGrid.colorB.set(backupB.subarray(oldOff, oldOff + sliceSize), newOff);

            layer.z = newZ;
        }

        if (onChangeCallback) onChangeCallback();
    }

    /**
     * Reassign z-levels to match the given hex order (index 0 = lowest z / bottom
     * of the stack). Voxel data moves with each layer. This is the drag-drop
     * commit path; unlike moveLayer(src, tgt) it takes the full desired order,
     * which is easier to derive from the DOM after a reorder gesture.
     */
    function setLayerOrder(orderedHexesLowToHigh) {
        const all = getAll();
        if (orderedHexesLowToHigh.length !== all.length) return;
        for (const h of orderedHexesLowToHigh) {
            if (!colorToLayer[h]) return;
        }

        const S = VoxelGrid.SIZE;
        const sliceSize = S * S;

        // Backup once, then write each layer to its new slot from the backup —
        // avoids clobbering data mid-loop when new/old z-slots overlap.
        const backupFilled = new Uint8Array(VoxelGrid.filled);
        const backupR = new Float32Array(VoxelGrid.colorR);
        const backupG = new Float32Array(VoxelGrid.colorG);
        const backupB = new Float32Array(VoxelGrid.colorB);

        let changed = false;
        for (let i = 0; i < orderedHexesLowToHigh.length; i++) {
            const layer = colorToLayer[orderedHexesLowToHigh[i]];
            const oldZ = layer.z;
            const newZ = i;
            if (oldZ === newZ) continue;
            changed = true;
            const oldOff = oldZ * sliceSize;
            const newOff = newZ * sliceSize;
            VoxelGrid.filled.set(backupFilled.subarray(oldOff, oldOff + sliceSize), newOff);
            VoxelGrid.colorR.set(backupR.subarray(oldOff, oldOff + sliceSize), newOff);
            VoxelGrid.colorG.set(backupG.subarray(oldOff, oldOff + sliceSize), newOff);
            VoxelGrid.colorB.set(backupB.subarray(oldOff, oldOff + sliceSize), newOff);
            layer.z = newZ;
        }

        if (changed) {
            // Voxel data moved between planes — bump the generation so any
            // cached mesh/canvas keyed to the old layout invalidates.
            VoxelGrid.bumpGeneration();
        }

        if (onChangeCallback) onChangeCallback();
    }

    function onChange(cb) {
        onChangeCallback = cb;
    }

    function serialize() {
        return {
            colorToLayer,
            nextZ,
            activeColorHex,
        };
    }

    function deserialize(data) {
        colorToLayer = data.colorToLayer;
        nextZ = data.nextZ;
        activeColorHex = data.activeColorHex;
        if (onChangeCallback) onChangeCallback();
    }

    return {
        PALETTE,
        init, setActiveColor, getActive, getOrCreateActive, getActiveColorHex,
        getActiveColorRGB, getAll, getLayerByColor,
        ensureLayerForColor, removeLayer,
        hexToRgb, getColorName, isLightColor,
        moveLayer, setLayerOrder, onChange, serialize, deserialize,
    };
})();
