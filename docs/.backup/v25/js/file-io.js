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

    function exportOBJ() {
        const layers = Layers.getAll();
        if (layers.length === 0) {
            return Promise.resolve({ ok: false, message: 'Nothing to export — draw something first.' });
        }

        const filledArr = VoxelGrid.filled;
        const columnHeightsMap = Renderer.computeColumnHeights(layers, filledArr);

        // Generate all layer meshes with gradient normals + Laplacian smoothing
        const layerMeshes = [];
        for (const layer of layers) {
            const colHeights = columnHeightsMap.get(layer.color);
            const { positions, normals } = MarchingCubes.generateForLayer(filledArr, layer.z, colHeights, Renderer.depthFactor);
            if (positions.length === 0) continue;

            // Apply Laplacian smoothing (same as preview) via a temp Three.js geometry
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
            Renderer.laplacianSmooth(geometry, 0.3);
            Renderer.laplacianSmooth(geometry, 0.2);

            layerMeshes.push({
                layer,
                positions: geometry.attributes.position.array,
                normals: geometry.attributes.normal.array,
            });
            geometry.dispose();
        }

        if (layerMeshes.length === 0) {
            return Promise.resolve({ ok: false, message: 'Nothing to export — draw something first.' });
        }

        // Center at origin
        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
        for (const { positions } of layerMeshes) {
            for (let i = 0; i < positions.length; i += 3) {
                minX = Math.min(minX, positions[i]);   minY = Math.min(minY, positions[i+1]); minZ = Math.min(minZ, positions[i+2]);
                maxX = Math.max(maxX, positions[i]);   maxY = Math.max(maxY, positions[i+1]); maxZ = Math.max(maxZ, positions[i+2]);
            }
        }
        const cx = (minX+maxX)/2, cy = (minY+maxY)/2, cz = (minZ+maxZ)/2;

        let mtl = '# Vorm Jr. Materials\n\n';
        let obj = '# Vorm Jr. OBJ Export\n';
        obj += 'mtllib VormJr_Export.mtl\n\n';

        let globalVertexOffset = 0;
        let globalNormalOffset = 0;

        for (const { layer, positions, normals } of layerMeshes) {
            const colorName = Layers.getColorName(layer.color);
            const materialName = 'M_' + colorName;
            const rgb = Layers.hexToRgb(layer.color);

            mtl += `newmtl ${materialName}\n`;
            mtl += `Ka ${(rgb.r*0.2).toFixed(4)} ${(rgb.g*0.2).toFixed(4)} ${(rgb.b*0.2).toFixed(4)}\n`;
            mtl += `Kd ${rgb.r.toFixed(4)} ${rgb.g.toFixed(4)} ${rgb.b.toFixed(4)}\n`;
            mtl += `Ks 0.1000 0.1000 0.1000\n`;
            mtl += `Ns 10.0\n`;
            mtl += `d 1.0\n\n`;

            const vertCount = positions.length / 3;

            obj += `o ${colorName}\n`;
            obj += `usemtl ${materialName}\n`;

            for (let i = 0; i < positions.length; i += 3) {
                obj += `v ${(positions[i]-cx).toFixed(6)} ${(positions[i+1]-cy).toFixed(6)} ${(positions[i+2]-cz).toFixed(6)}\n`;
            }

            for (let i = 0; i < normals.length; i += 3) {
                obj += `vn ${normals[i].toFixed(6)} ${normals[i+1].toFixed(6)} ${normals[i+2].toFixed(6)}\n`;
            }

            for (let i = 0; i < vertCount; i += 3) {
                const a = globalVertexOffset+i+1, b = globalVertexOffset+i+2, c = globalVertexOffset+i+3;
                obj += `f ${a}//${globalNormalOffset+i+1} ${b}//${globalNormalOffset+i+2} ${c}//${globalNormalOffset+i+3}\n`;
            }

            obj += '\n';
            globalVertexOffset += vertCount;
            globalNormalOffset += vertCount;
        }

        // Check if upload URL is configured
        const uploadUrl = getUploadUrl();
        const artistName = getArtistName();

        if (uploadUrl) {
            // Upload to server
            return uploadToServer(uploadUrl, artistName, obj, mtl);
        } else {
            // Download locally
            downloadFile(artistName + '_Export.obj', obj, 'model/obj');
            downloadFile(artistName + '_Export.mtl', mtl, 'model/mtl');
            return Promise.resolve({ ok: true, message: 'Saved locally.' });
        }
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
            });

            if (response.ok) {
                return { ok: true, message: 'Sent! / Verstuurd!' };
            }
            return { ok: false, message: 'Upload failed (HTTP ' + response.status + ').' };
        } catch (e) {
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
