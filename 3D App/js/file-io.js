/**
 * File I/O for Vorm Jr.
 * Save/Load .vormjr files and export OBJ with smooth normals,
 * separate objects per color, centered at origin.
 */
const FileIO = (() => {

    // =================================================================
    // HARDCODED UPLOAD SERVER URL
    // Edit this to match the address of the PC running upload-server.py.
    // Leave empty ('') to download files locally instead of uploading.
    // Kids cannot see or change this — only via the hidden settings popup
    // (tap the logo 5 times within 2 seconds to reveal extra tools).
    // =================================================================
    const DEFAULT_UPLOAD_URL = 'http://192.168.1.100:8080';


    function save() {
        const data = {
            version: 2,
            app: 'Vorm Jr.',
            gridSize: VoxelGrid.SIZE,
            voxels: VoxelGrid.serialize(),
            layers: Layers.serialize(),
        };
        const json = JSON.stringify(data);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'drawing.vormjr';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function open(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                try {
                    const data = JSON.parse(reader.result);
                    if (data.app !== 'Vorm Jr.') {
                        reject(new Error('Not a Vorm Jr. file'));
                        return;
                    }
                    VoxelGrid.deserialize(data.voxels);
                    Layers.deserialize(data.layers);
                    resolve();
                } catch (e) {
                    reject(e);
                }
            };
            reader.onerror = reject;
            reader.readAsText(file);
        });
    }

    async function exportOBJ() {
        const layers = Layers.getAll();
        if (layers.length === 0) {
            return { ok: false, message: 'Nothing to export — draw something first.' };
        }

        // Use the already-generated indexed meshes from the preview instead of
        // regenerating a whole second (non-indexed) mesh. This makes the OBJ:
        //   - visually identical to the on-screen preview,
        //   - roughly 3x smaller (shared verts vs three-per-triangle),
        //   - much faster to serialize (no second marching-cubes pass).
        // getExportMesh() awaits any in-flight worker run so we never race it.
        const { meshes: layerMeshes, center } = await Renderer.getExportMesh();

        if (!layerMeshes || layerMeshes.length === 0) {
            return Promise.resolve({ ok: false, message: 'Nothing to export — draw something first.' });
        }

        const cx = center.x, cy = center.y, cz = center.z;

        // Build a color -> layer map so we can look up display name + rgb
        // without depending on array order.
        const layerByColor = new Map();
        for (const l of layers) layerByColor.set(l.color, l);

        // Precision knobs: 3 decimals of world-unit position is well below the
        // MC grid resolution, and 3 decimals on normals is more than enough
        // for shading; going from 6→3 nearly halves the OBJ size.
        const P = 3;
        const N = 3;

        // Build the file as an array of chunks and join at the end — string
        // concatenation with += is O(n^2) at these sizes and drops to seconds
        // on iPad for a big drawing.
        const objParts = ['# Vorm Jr. OBJ Export\nmtllib VormJr_Export.mtl\n\n'];
        const mtlParts = ['# Vorm Jr. Materials\n\n'];

        let globalVertexOffset = 0;

        for (const m of layerMeshes) {
            const layer = layerByColor.get(m.color);
            if (!layer) continue;

            const colorName = Layers.getColorName(m.color);
            const materialName = 'M_' + colorName;
            const rgb = Layers.hexToRgb(m.color);

            mtlParts.push(
                `newmtl ${materialName}\n`,
                `Ka ${(rgb.r*0.2).toFixed(4)} ${(rgb.g*0.2).toFixed(4)} ${(rgb.b*0.2).toFixed(4)}\n`,
                `Kd ${rgb.r.toFixed(4)} ${rgb.g.toFixed(4)} ${rgb.b.toFixed(4)}\n`,
                `Ks 0.1000 0.1000 0.1000\nNs 10.0\nd 1.0\n\n`,
            );

            const positions = m.positions;
            const normals = m.normals;
            const indices = m.indices;
            const vertCount = positions.length / 3;

            objParts.push(`o ${materialName}\nusemtl ${materialName}\n`);

            for (let i = 0; i < positions.length; i += 3) {
                objParts.push(
                    'v ',
                    (positions[i] - cx).toFixed(P), ' ',
                    (positions[i+1] - cy).toFixed(P), ' ',
                    (positions[i+2] - cz).toFixed(P), '\n',
                );
            }
            for (let i = 0; i < normals.length; i += 3) {
                objParts.push(
                    'vn ',
                    normals[i].toFixed(N), ' ',
                    normals[i+1].toFixed(N), ' ',
                    normals[i+2].toFixed(N), '\n',
                );
            }
            // Each face uses shared vertex/normal indices — the whole point
            // of using the indexed mesh.
            for (let i = 0; i < indices.length; i += 3) {
                const a = indices[i]   + 1 + globalVertexOffset;
                const b = indices[i+1] + 1 + globalVertexOffset;
                const c = indices[i+2] + 1 + globalVertexOffset;
                objParts.push('f ', a, '//', a, ' ', b, '//', b, ' ', c, '//', c, '\n');
            }
            objParts.push('\n');

            globalVertexOffset += vertCount;
        }

        const obj = objParts.join('');
        const mtl = mtlParts.join('');

        // Check if upload URL is configured
        const uploadUrl = getUploadUrl();
        const artistName = getArtistName();

        if (uploadUrl) {
            // Try upload; fall back to local download if unreachable
            const result = await uploadToServer(uploadUrl, artistName, obj, mtl);
            if (result.ok) return result;
            downloadFile(artistName + '_Export.obj', obj, 'model/obj');
            downloadFile(artistName + '_Export.mtl', mtl, 'model/mtl');
            return { ok: true, message: 'Upload unreachable — saved locally.' };
        }
        downloadFile(artistName + '_Export.obj', obj, 'model/obj');
        downloadFile(artistName + '_Export.mtl', mtl, 'model/mtl');
        return { ok: true, message: 'Saved locally.' };
    }

    function getUploadUrl() {
        // localStorage override (set via hidden settings) wins; otherwise hardcoded default
        const stored = localStorage.getItem('vormjr_upload_url');
        if (stored !== null) return stored;
        return DEFAULT_UPLOAD_URL;
    }

    function setUploadUrl(url) {
        localStorage.setItem('vormjr_upload_url', url);
    }

    function getArtistName() {
        return localStorage.getItem('vormjr_artist_name') || 'Artist';
    }

    function setArtistName(name) {
        localStorage.setItem('vormjr_artist_name', name);
    }

    async function uploadToServer(url, name, objContent, mtlContent) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2500);
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: name,
                    files: [
                        { filename: name + '_Export.obj', content: objContent },
                        { filename: name + '_Export.mtl', content: mtlContent },
                    ]
                }),
                signal: controller.signal,
            });
            clearTimeout(timeoutId);

            if (response.ok) {
                return { ok: true, message: 'Sent! / Verstuurd!' };
            }
            return { ok: false, message: 'Upload failed (HTTP ' + response.status + ').' };
        } catch (e) {
            clearTimeout(timeoutId);
            return { ok: false, message: 'Cannot reach upload server.' };
        }
    }

    function downloadFile(filename, content, type) {
        const blob = new Blob([content], { type: type || 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    return { save, open, exportOBJ, getUploadUrl, setUploadUrl, getArtistName, setArtistName };
})();
