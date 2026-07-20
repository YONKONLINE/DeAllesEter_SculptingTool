/**
 * Mesh Worker for Vorm Jr.
 * Runs marching cubes + laplacian smoothing off the main thread.
 * Receives voxel data + layer info, returns mesh arrays.
 */

// ---- Constants (must match main thread) ----
const STEP = 2;
const LAYER_THICKNESS = 2;
const LAYER_GAP = 3;
const XY_PAD = 3;

// ---- Marching Cubes Tables (same as marching-cubes.js) ----
const edgeTable = new Uint16Array([
    0x0,0x109,0x203,0x30a,0x406,0x50f,0x605,0x70c,0x80c,0x905,0xa0f,0xb06,0xc0a,0xd03,0xe09,0xf00,
    0x190,0x99,0x393,0x29a,0x596,0x49f,0x795,0x69c,0x99c,0x895,0xb9f,0xa96,0xd9a,0xc93,0xf99,0xe90,
    0x230,0x339,0x33,0x13a,0x636,0x73f,0x435,0x53c,0xa3c,0xb35,0x83f,0x936,0xe3a,0xf33,0xc39,0xd30,
    0x3a0,0x2a9,0x1a3,0xaa,0x7a6,0x6af,0x5a5,0x4ac,0xbac,0xaa5,0x9af,0x8a6,0xfaa,0xea3,0xda9,0xca0,
    0x460,0x569,0x663,0x76a,0x66,0x16f,0x265,0x36c,0xc6c,0xd65,0xe6f,0xf66,0x86a,0x963,0xa69,0xb60,
    0x5f0,0x4f9,0x7f3,0x6fa,0x1f6,0xff,0x3f5,0x2fc,0xdfc,0xcf5,0xfff,0xef6,0x9fa,0x8f3,0xbf9,0xaf0,
    0x650,0x759,0x453,0x55a,0x256,0x35f,0x55,0x15c,0xe5c,0xf55,0xc5f,0xd56,0xa5a,0xb53,0x859,0x950,
    0x7c0,0x6c9,0x5c3,0x4ca,0x3c6,0x2cf,0x1c5,0xcc,0xfcc,0xec5,0xdcf,0xcc6,0xbca,0xac3,0x9c9,0x8c0,
    0x8c0,0x9c9,0xac3,0xbca,0xcc6,0xdcf,0xec5,0xfcc,0xcc,0x1c5,0x2cf,0x3c6,0x4ca,0x5c3,0x6c9,0x7c0,
    0x950,0x859,0xb53,0xa5a,0xd56,0xc5f,0xf55,0xe5c,0x15c,0x55,0x35f,0x256,0x55a,0x453,0x759,0x650,
    0xaf0,0xbf9,0x8f3,0x9fa,0xef6,0xfff,0xcf5,0xdfc,0x2fc,0x3f5,0xff,0x1f6,0x6fa,0x7f3,0x4f9,0x5f0,
    0xb60,0xa69,0x963,0x86a,0xf66,0xe6f,0xd65,0xc6c,0x36c,0x265,0x16f,0x66,0x76a,0x663,0x569,0x460,
    0xca0,0xda9,0xea3,0xfaa,0x8a6,0x9af,0xaa5,0xbac,0x4ac,0x5a5,0x6af,0x7a6,0xaa,0x1a3,0x2a9,0x3a0,
    0xd30,0xc39,0xf33,0xe3a,0x936,0x83f,0xb35,0xa3c,0x53c,0x435,0x73f,0x636,0x13a,0x33,0x339,0x230,
    0xe90,0xf99,0xc93,0xd9a,0xa96,0xb9f,0x895,0x99c,0x69c,0x795,0x49f,0x596,0x29a,0x393,0x99,0x190,
    0xf00,0xe09,0xd03,0xc0a,0xb06,0xa0f,0x905,0x80c,0x70c,0x605,0x50f,0x406,0x30a,0x203,0x109,0x0
]);

// Compact tri table (same 256 entries)
const triTable = [[-1],
[0,8,3,-1],[0,1,9,-1],[1,8,3,9,8,1,-1],[1,2,10,-1],[0,8,3,1,2,10,-1],[9,2,10,0,2,9,-1],[2,8,3,2,10,8,10,9,8,-1],
[3,11,2,-1],[0,11,2,8,11,0,-1],[1,9,0,2,3,11,-1],[1,11,2,1,9,11,9,8,11,-1],[3,10,1,11,10,3,-1],[0,10,1,0,8,10,8,11,10,-1],
[3,9,0,3,11,9,11,10,9,-1],[9,8,10,10,8,11,-1],[4,7,8,-1],[4,3,0,7,3,4,-1],[0,1,9,8,4,7,-1],[4,1,9,4,7,1,7,3,1,-1],
[1,2,10,8,4,7,-1],[3,4,7,3,0,4,1,2,10,-1],[9,2,10,9,0,2,8,4,7,-1],[2,10,9,2,9,7,2,7,3,7,9,4,-1],
[8,4,7,3,11,2,-1],[11,4,7,11,2,4,2,0,4,-1],[9,0,1,8,4,7,2,3,11,-1],[4,7,11,9,4,11,9,11,2,9,2,1,-1],
[3,10,1,3,11,10,7,8,4,-1],[1,11,10,1,4,11,1,0,4,7,11,4,-1],[4,7,8,9,0,11,9,11,10,11,0,3,-1],[4,7,11,4,11,9,9,11,10,-1],
[9,5,4,-1],[9,5,4,0,8,3,-1],[0,5,4,1,5,0,-1],[8,5,4,8,3,5,3,1,5,-1],[1,2,10,9,5,4,-1],[3,0,8,1,2,10,4,9,5,-1],
[5,2,10,5,4,2,4,0,2,-1],[2,10,5,3,2,5,3,5,4,3,4,8,-1],[9,5,4,2,3,11,-1],[0,11,2,0,8,11,4,9,5,-1],
[0,5,4,0,1,5,2,3,11,-1],[2,1,5,2,5,8,2,8,11,4,8,5,-1],[10,3,11,10,1,3,9,5,4,-1],[4,9,5,0,8,1,8,10,1,8,11,10,-1],
[5,4,0,5,0,11,5,11,10,11,0,3,-1],[5,4,8,5,8,10,10,8,11,-1],[9,7,8,5,7,9,-1],[9,3,0,9,5,3,5,7,3,-1],
[0,7,8,0,1,7,1,5,7,-1],[1,5,3,3,5,7,-1],[9,7,8,9,5,7,10,1,2,-1],[10,1,2,9,5,0,5,3,0,5,7,3,-1],
[8,0,2,8,2,5,8,5,7,10,5,2,-1],[2,10,5,2,5,3,3,5,7,-1],[7,9,5,7,8,9,3,11,2,-1],[9,5,7,9,7,2,9,2,0,2,7,11,-1],
[2,3,11,0,1,8,1,7,8,1,5,7,-1],[11,2,1,11,1,7,7,1,5,-1],[9,5,8,8,5,7,10,1,3,10,3,11,-1],[5,7,0,5,0,9,7,11,0,1,0,10,11,10,0,-1],
[11,10,0,11,0,3,10,5,0,8,0,7,5,7,0,-1],[11,10,5,7,11,5,-1],[10,6,5,-1],[0,8,3,5,10,6,-1],[9,0,1,5,10,6,-1],
[1,8,3,1,9,8,5,10,6,-1],[1,6,5,2,6,1,-1],[1,6,5,1,2,6,3,0,8,-1],[9,6,5,9,0,6,0,2,6,-1],[5,9,8,5,8,2,5,2,6,3,2,8,-1],
[2,3,11,10,6,5,-1],[11,0,8,11,2,0,10,6,5,-1],[0,1,9,2,3,11,5,10,6,-1],[5,10,6,1,9,2,9,11,2,9,8,11,-1],
[6,3,11,6,5,3,5,1,3,-1],[0,8,11,0,11,5,0,5,1,5,11,6,-1],[3,11,6,0,3,6,0,6,5,0,5,9,-1],[6,5,9,6,9,11,11,9,8,-1],
[5,10,6,4,7,8,-1],[4,3,0,4,7,3,6,5,10,-1],[1,9,0,5,10,6,8,4,7,-1],[10,6,5,1,9,7,1,7,3,7,9,4,-1],
[6,1,2,6,5,1,4,7,8,-1],[1,2,5,5,2,6,3,0,4,3,4,7,-1],[8,4,7,9,0,5,0,6,5,0,2,6,-1],[7,3,9,7,9,4,3,2,9,5,9,6,2,6,9,-1],
[3,11,2,7,8,4,10,6,5,-1],[5,10,6,4,7,2,4,2,0,2,7,11,-1],[0,1,9,4,7,8,2,3,11,5,10,6,-1],[9,2,1,9,11,2,9,4,11,7,11,4,5,10,6,-1],
[8,4,7,3,11,5,3,5,1,5,11,6,-1],[5,1,11,5,11,6,1,0,11,7,11,4,0,4,11,-1],[0,5,9,0,6,5,0,3,6,11,6,3,8,4,7,-1],
[6,5,9,6,9,11,4,7,9,7,11,9,-1],[10,4,9,6,4,10,-1],[4,10,6,4,9,10,0,8,3,-1],[10,0,1,10,6,0,6,4,0,-1],
[8,3,1,8,1,6,8,6,4,6,1,10,-1],[1,4,9,1,2,4,2,6,4,-1],[3,0,8,1,2,9,2,4,9,2,6,4,-1],[0,2,4,4,2,6,-1],
[8,3,2,8,2,4,4,2,6,-1],[10,4,9,10,6,4,11,2,3,-1],[0,8,2,2,8,11,4,9,10,4,10,6,-1],[3,11,2,0,1,6,0,6,4,6,1,10,-1],
[6,4,1,6,1,10,4,8,1,2,1,11,8,11,1,-1],[9,6,4,9,3,6,9,1,3,11,6,3,-1],[8,11,1,8,1,0,11,6,1,9,1,4,6,4,1,-1],
[3,11,6,3,6,0,0,6,4,-1],[6,4,8,11,6,8,-1],[7,10,6,7,8,10,8,9,10,-1],[0,7,3,0,10,7,0,9,10,6,7,10,-1],
[10,6,7,1,10,7,1,7,8,1,8,0,-1],[10,6,7,10,7,1,1,7,3,-1],[1,2,6,1,6,8,1,8,9,8,6,7,-1],[2,6,9,2,9,1,6,7,9,0,9,3,7,3,9,-1],
[7,8,0,7,0,6,6,0,2,-1],[7,3,2,6,7,2,-1],[2,3,11,10,6,8,10,8,9,8,6,7,-1],[2,0,7,2,7,11,0,9,7,6,7,10,9,10,7,-1],
[1,8,0,1,7,8,1,10,7,6,7,10,2,3,11,-1],[11,2,1,11,1,7,10,6,1,6,7,1,-1],[8,9,6,8,6,7,9,1,6,11,6,3,1,3,6,-1],
[0,9,1,11,6,7,-1],[7,8,0,7,0,6,3,11,0,11,6,0,-1],[7,11,6,-1],[7,6,11,-1],[3,0,8,11,7,6,-1],[0,1,9,11,7,6,-1],
[8,1,9,8,3,1,11,7,6,-1],[10,1,2,6,11,7,-1],[1,2,10,3,0,8,6,11,7,-1],[2,9,0,2,10,9,6,11,7,-1],
[6,11,7,2,10,3,10,8,3,10,9,8,-1],[7,2,3,6,2,7,-1],[7,0,8,7,6,0,6,2,0,-1],[2,7,6,2,3,7,0,1,9,-1],
[1,6,2,1,8,6,1,9,8,8,7,6,-1],[10,7,6,10,1,7,1,3,7,-1],[10,7,6,1,7,10,1,8,7,1,0,8,-1],
[0,3,7,0,7,10,0,10,9,6,10,7,-1],[7,6,10,7,10,8,8,10,9,-1],[6,8,4,11,8,6,-1],[3,6,11,3,0,6,0,4,6,-1],
[8,6,11,8,4,6,9,0,1,-1],[9,4,6,9,6,3,9,3,1,11,3,6,-1],[6,8,4,6,11,8,2,10,1,-1],[1,2,10,3,0,11,0,6,11,0,4,6,-1],
[4,11,8,4,6,11,0,2,9,2,10,9,-1],[10,9,3,10,3,2,9,4,3,11,3,6,4,6,3,-1],[8,2,3,8,4,2,4,6,2,-1],[0,4,2,4,6,2,-1],
[1,9,0,2,3,4,2,4,6,4,3,8,-1],[1,9,4,1,4,2,2,4,6,-1],[8,1,3,8,6,1,8,4,6,6,10,1,-1],[10,1,0,10,0,6,6,0,4,-1],
[4,6,3,4,3,8,6,10,3,0,3,9,10,9,3,-1],[10,9,4,6,10,4,-1],[4,9,5,7,6,11,-1],[0,8,3,4,9,5,11,7,6,-1],
[5,0,1,5,4,0,7,6,11,-1],[11,7,6,8,3,4,3,5,4,3,1,5,-1],[9,5,4,10,1,2,7,6,11,-1],[6,11,7,1,2,10,0,8,3,4,9,5,-1],
[7,6,11,5,4,10,4,2,10,4,0,2,-1],[3,4,8,3,5,4,3,2,5,10,5,2,11,7,6,-1],[7,2,3,7,6,2,5,4,9,-1],
[9,5,4,0,8,6,0,6,2,6,8,7,-1],[3,6,2,3,7,6,1,5,0,5,4,0,-1],[6,2,8,6,8,7,2,1,8,4,8,5,1,5,8,-1],
[9,5,4,10,1,6,1,7,6,1,3,7,-1],[1,6,10,1,7,6,1,0,7,8,7,0,9,5,4,-1],[4,0,10,4,10,5,0,3,10,6,10,7,3,7,10,-1],
[7,6,10,7,10,8,5,4,10,4,8,10,-1],[6,9,5,6,11,9,11,8,9,-1],[3,6,11,0,6,3,0,5,6,0,9,5,-1],
[0,11,8,0,5,11,0,1,5,5,6,11,-1],[6,11,3,6,3,5,5,3,1,-1],[1,2,10,9,5,11,9,11,8,11,5,6,-1],
[0,11,3,0,6,11,0,9,6,5,6,9,1,2,10,-1],[11,8,5,11,5,6,8,0,5,10,5,2,0,2,5,-1],[6,11,3,6,3,5,2,10,3,10,5,3,-1],
[5,8,9,5,2,8,5,6,2,3,8,2,-1],[9,5,6,9,6,0,0,6,2,-1],[1,5,8,1,8,0,5,6,8,3,8,2,6,2,8,-1],[1,5,6,2,1,6,-1],
[1,3,6,1,6,10,3,8,6,5,6,9,8,9,6,-1],[10,1,0,10,0,6,9,5,0,5,6,0,-1],[0,3,8,5,6,10,-1],[10,5,6,-1],
[11,5,10,7,5,11,-1],[11,5,10,11,7,5,8,3,0,-1],[5,11,7,5,10,11,1,9,0,-1],[10,7,5,10,11,7,9,8,1,8,3,1,-1],
[11,1,2,11,7,1,7,5,1,-1],[0,8,3,1,2,7,1,7,5,7,2,11,-1],[9,7,5,9,2,7,9,0,2,2,11,7,-1],
[7,5,2,7,2,11,5,9,2,3,2,8,9,8,2,-1],[2,5,10,2,3,5,3,7,5,-1],[8,2,0,8,5,2,8,7,5,10,2,5,-1],
[9,0,1,5,10,3,5,3,7,3,10,2,-1],[9,8,2,9,2,1,8,7,2,10,2,5,7,5,2,-1],[1,3,5,3,7,5,-1],[0,8,7,0,7,1,1,7,5,-1],
[9,0,3,9,3,5,5,3,7,-1],[9,8,7,5,9,7,-1],[5,8,4,5,10,8,10,11,8,-1],[5,0,4,5,11,0,5,10,11,11,3,0,-1],
[0,1,9,8,4,10,8,10,11,10,4,5,-1],[10,11,4,10,4,5,11,3,4,9,4,1,3,1,4,-1],[2,5,1,2,8,5,2,11,8,4,5,8,-1],
[0,4,11,0,11,3,4,5,11,2,11,1,5,1,11,-1],[0,2,5,0,5,9,2,11,5,4,5,8,11,8,5,-1],[9,4,5,2,11,3,-1],
[2,5,10,3,5,2,3,4,5,3,8,4,-1],[5,10,2,5,2,4,4,2,0,-1],[3,10,2,3,5,10,3,8,5,4,5,8,0,1,9,-1],
[5,10,2,5,2,4,1,9,2,9,4,2,-1],[8,4,5,8,5,3,3,5,1,-1],[0,4,5,1,0,5,-1],[8,4,5,8,5,3,9,0,5,0,3,5,-1],
[9,4,5,-1],[4,11,7,4,9,11,9,10,11,-1],[0,8,3,4,9,7,9,11,7,9,10,11,-1],[1,10,11,1,11,4,1,4,0,7,4,11,-1],
[3,1,4,3,4,8,1,10,4,7,4,11,10,11,4,-1],[4,11,7,9,11,4,9,2,11,9,1,2,-1],[9,7,4,9,11,7,9,1,11,2,11,1,0,8,3,-1],
[11,7,4,11,4,2,2,4,0,-1],[11,7,4,11,4,2,8,3,4,3,2,4,-1],[2,9,10,2,7,9,2,3,7,7,4,9,-1],
[9,10,7,9,7,4,10,2,7,8,7,0,2,0,7,-1],[3,7,10,3,10,2,7,4,10,1,10,0,4,0,10,-1],[1,10,2,8,7,4,-1],
[4,9,1,4,1,7,7,1,3,-1],[4,9,1,4,1,7,0,8,1,8,7,1,-1],[4,0,3,7,4,3,-1],[4,8,7,-1],
[9,10,8,10,11,8,-1],[3,0,9,3,9,11,11,9,10,-1],[0,1,10,0,10,8,8,10,11,-1],[3,1,10,11,3,10,-1],
[1,2,11,1,11,9,9,11,8,-1],[3,0,9,3,9,11,1,2,9,2,11,9,-1],[0,2,11,8,0,11,-1],[3,2,11,-1],
[2,3,8,2,8,10,10,8,9,-1],[9,10,2,0,9,2,-1],[2,3,8,2,8,10,0,1,8,1,10,8,-1],[1,10,2,-1],
[1,3,8,9,1,8,-1],[0,9,1,-1],[0,3,8,-1],[-1]];

const cornerOffsets = [[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]];
const edgeConnections = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];

// ---- Field + Marching Cubes ----

function buildFieldForLayer(filledArr, S, layerZ) {
    const fw = Math.ceil(S / STEP) + XY_PAD * 2;
    const fh = Math.ceil(S / STEP) + XY_PAD * 2;
    const fd = 11;
    const field = new Float32Array(fw * fh * fd);

    for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
            const vi = layerZ * S * S + y * S + x;
            if (!filledArr[vi]) continue;
            const fx = Math.floor(x / STEP) + XY_PAD;
            const fy = Math.floor(y / STEP) + XY_PAD;
            for (let fz = 3; fz <= 7; fz++) {
                field[fz * fw * fh + fy * fw + fx] += 1.0;
            }
        }
    }

    for (let i = 0; i < field.length; i++) {
        if (field[i] > 0) field[i] = Math.min(1.0, field[i]);
    }

    let src = field;
    let dst = new Float32Array(field.length);
    for (let pass = 0; pass < 3; pass++) {
        for (let z = 0; z < fd; z++) {
            for (let y = 0; y < fh; y++) {
                for (let x = 0; x < fw; x++) {
                    let sum = 0, wTotal = 0;
                    for (let dz = -1; dz <= 1; dz++) {
                        for (let dy = -1; dy <= 1; dy++) {
                            for (let dx = -1; dx <= 1; dx++) {
                                const nx = x+dx, ny = y+dy, nz = z+dz;
                                if (nx<0||nx>=fw||ny<0||ny>=fh||nz<0||nz>=fd) continue;
                                const dist = Math.abs(dx)+Math.abs(dy)+Math.abs(dz);
                                const w = dist===0?4:dist===1?2:1;
                                sum += src[nz*fw*fh+ny*fw+nx]*w;
                                wTotal += w;
                            }
                        }
                    }
                    dst[z*fw*fh+y*fw+x] = sum/wTotal;
                }
            }
        }
        const tmp=src; src=dst; dst=tmp;
    }
    return { field: src, width: fw, height: fh, depth: fd };
}

function sampleField(field, fw, fh, fd, x, y, z) {
    const x0=Math.floor(x),y0=Math.floor(y),z0=Math.floor(z);
    const fx=x-x0,fy=y-y0,fz=z-z0;
    function g(gx,gy,gz){if(gx<0||gx>=fw||gy<0||gy>=fh||gz<0||gz>=fd)return 0;return field[gz*fw*fh+gy*fw+gx];}
    const c00=g(x0,y0,z0)*(1-fx)+g(x0+1,y0,z0)*fx;
    const c10=g(x0,y0+1,z0)*(1-fx)+g(x0+1,y0+1,z0)*fx;
    const c01=g(x0,y0,z0+1)*(1-fx)+g(x0+1,y0,z0+1)*fx;
    const c11=g(x0,y0+1,z0+1)*(1-fx)+g(x0+1,y0+1,z0+1)*fx;
    return (c00*(1-fy)+c10*fy)*(1-fz)+(c01*(1-fy)+c11*fy)*fz;
}

function marchFieldFlat(data) {
    const {field,width:fw,height:fh,depth:fd}=data;
    const iso=0.25;
    const positions=[], normals=[];
    function getVal(x,y,z){if(x<0||x>=fw||y<0||y>=fh||z<0||z>=fd)return 0;return field[z*fw*fh+y*fw+x];}
    function interp(x1,y1,z1,v1,x2,y2,z2,v2){
        if(Math.abs(v1-v2)<0.00001)return[x1,y1,z1];
        const t=Math.max(0,Math.min(1,(iso-v1)/(v2-v1)));
        return[x1+t*(x2-x1),y1+t*(y2-y1),z1+t*(z2-z1)];
    }
    for(let z=0;z<fd-1;z++){for(let y=0;y<fh-1;y++){for(let x=0;x<fw-1;x++){
        const vals=[];
        for(let i=0;i<8;i++){const[dx,dy,dz]=cornerOffsets[i];vals.push(getVal(x+dx,y+dy,z+dz));}
        let ci=0;for(let i=0;i<8;i++){if(vals[i]>=iso)ci|=(1<<i);}
        if(edgeTable[ci]===0)continue;
        const ev=new Array(12);
        for(let i=0;i<12;i++){if(edgeTable[ci]&(1<<i)){
            const[c0,c1]=edgeConnections[i];
            const[dx0,dy0,dz0]=cornerOffsets[c0];const[dx1,dy1,dz1]=cornerOffsets[c1];
            ev[i]=interp(x+dx0,y+dy0,z+dz0,vals[c0],x+dx1,y+dy1,z+dz1,vals[c1]);
        }}
        const row=triTable[ci];
        for(let i=0;row[i]!==-1;i+=3){for(let j=0;j<3;j++){
            const v=ev[row[i+j]];
            positions.push((v[0]-XY_PAD)*STEP,(v[2]-5)*LAYER_THICKNESS,(v[1]-XY_PAD)*STEP);
            // Gradient normal
            const eps=0.5;
            const gx=sampleField(field,fw,fh,fd,v[0]+eps,v[1],v[2])-sampleField(field,fw,fh,fd,v[0]-eps,v[1],v[2]);
            const gy=sampleField(field,fw,fh,fd,v[0],v[1]+eps,v[2])-sampleField(field,fw,fh,fd,v[0],v[1]-eps,v[2]);
            const gz=sampleField(field,fw,fh,fd,v[0],v[1],v[2]+eps)-sampleField(field,fw,fh,fd,v[0],v[1],v[2]-eps);
            const len=Math.sqrt(gx*gx+gy*gy+gz*gz);
            if(len>0.001){normals.push(-gx/len,-gz/len,-gy/len);}else{normals.push(0,1,0);}
        }}
    }}}
    return{positions:new Float32Array(positions),normals:new Float32Array(normals)};
}

// ---- Distance field + inflation ----

function computeDistanceField(filledArr, S, layerZ) {
    const cols = Math.ceil(S / STEP);
    const mask = new Uint8Array(cols * cols);
    for (let y=0;y<S;y++) for (let x=0;x<S;x++) {
        if (filledArr[layerZ*S*S+y*S+x]) mask[Math.floor(y/STEP)*cols+Math.floor(x/STEP)]=1;
    }
    const dist = new Float32Array(cols*cols);
    const INF = cols*2;
    for (let i=0;i<cols*cols;i++) dist[i]=mask[i]?INF:0;
    for(let y=0;y<cols;y++)for(let x=0;x<cols;x++){
        const i=y*cols+x;if(!dist[i])continue;
        if(x>0)dist[i]=Math.min(dist[i],dist[i-1]+1);
        if(y>0)dist[i]=Math.min(dist[i],dist[(y-1)*cols+x]+1);
        if(x>0&&y>0)dist[i]=Math.min(dist[i],dist[(y-1)*cols+(x-1)]+1.414);
        if(x<cols-1&&y>0)dist[i]=Math.min(dist[i],dist[(y-1)*cols+(x+1)]+1.414);
    }
    for(let y=cols-1;y>=0;y--)for(let x=cols-1;x>=0;x--){
        const i=y*cols+x;if(!dist[i])continue;
        if(x<cols-1)dist[i]=Math.min(dist[i],dist[i+1]+1);
        if(y<cols-1)dist[i]=Math.min(dist[i],dist[(y+1)*cols+x]+1);
        if(x<cols-1&&y<cols-1)dist[i]=Math.min(dist[i],dist[(y+1)*cols+(x+1)]+1.414);
        if(x>0&&y<cols-1)dist[i]=Math.min(dist[i],dist[(y+1)*cols+(x-1)]+1.414);
    }
    let maxD=0;for(let i=0;i<dist.length;i++)if(dist[i]>maxD)maxD=dist[i];
    if(maxD>0)for(let i=0;i<dist.length;i++)dist[i]/=maxD;
    return dist;
}

function bilinearSample(map, cols, wx, wz) {
    const fx=wx/STEP,fy=wz/STEP;
    const x0=Math.max(0,Math.min(cols-1,Math.floor(fx)));
    const y0=Math.max(0,Math.min(cols-1,Math.floor(fy)));
    const x1=Math.min(cols-1,x0+1),y1=Math.min(cols-1,y0+1);
    const tx=Math.max(0,Math.min(1,fx-x0)),ty=Math.max(0,Math.min(1,fy-y0));
    return map[y0*cols+x0]*(1-tx)*(1-ty)+map[y0*cols+x1]*tx*(1-ty)+map[y1*cols+x0]*(1-tx)*ty+map[y1*cols+x1]*tx*ty;
}

// ---- Laplacian Smoothing (plain arrays, no Three.js) ----

function laplacianSmooth(positions, normals, factor) {
    const count = positions.length / 3;
    const precision = 1000;
    const vertexMap = new Map();
    for (let i=0;i<count;i++){
        const key=Math.round(positions[i*3]*precision)+','+Math.round(positions[i*3+1]*precision)+','+Math.round(positions[i*3+2]*precision);
        if(!vertexMap.has(key))vertexMap.set(key,[]);
        vertexMap.get(key).push(i);
    }
    const adj = new Map();
    function addA(a,b){if(!adj.has(a))adj.set(a,new Set());adj.get(a).add(b);}
    for(let i=0;i<count;i+=3){addA(i,i+1);addA(i,i+2);addA(i+1,i);addA(i+1,i+2);addA(i+2,i);addA(i+2,i+1);}
    for(const group of vertexMap.values()){if(group.length<=1)continue;
        for(const vi of group)for(const vj of group){if(vi!==vj){const ni=adj.get(vi),nj=adj.get(vj);if(ni&&nj){for(const n of nj)ni.add(n);for(const n of ni)nj.add(n);}}}
    }
    const sp=new Float32Array(positions.length);
    const sn=new Float32Array(normals.length);
    for(let i=0;i<count;i++){
        const nb=adj.get(i);const bi=i*3;
        if(nb&&nb.size>0){
            let ax=0,ay=0,az=0,nx=0,ny=0,nz=0;
            for(const n of nb){const ni=n*3;ax+=positions[ni];ay+=positions[ni+1];az+=positions[ni+2];nx+=normals[ni];ny+=normals[ni+1];nz+=normals[ni+2];}
            const c=nb.size;
            sp[bi]=positions[bi]*(1-factor)+(ax/c)*factor;sp[bi+1]=positions[bi+1]*(1-factor)+(ay/c)*factor;sp[bi+2]=positions[bi+2]*(1-factor)+(az/c)*factor;
            const nl=Math.sqrt(nx*nx+ny*ny+nz*nz)||1;sn[bi]=nx/nl;sn[bi+1]=ny/nl;sn[bi+2]=nz/nl;
        } else {
            sp[bi]=positions[bi];sp[bi+1]=positions[bi+1];sp[bi+2]=positions[bi+2];
            sn[bi]=normals[bi];sn[bi+1]=normals[bi+1];sn[bi+2]=normals[bi+2];
        }
    }
    return { positions: sp, normals: sn };
}

// ---- Column Heights ----

function blurHeightMap(src, cols, radius) {
    const dst = new Float32Array(cols*cols);
    for(let cy=0;cy<cols;cy++)for(let cx=0;cx<cols;cx++){
        let sum=0,count=0;
        for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){
            const nx=cx+dx,ny=cy+dy;
            if(nx<0||nx>=cols||ny<0||ny>=cols)continue;
            const w=1/(1+Math.abs(dx)+Math.abs(dy));
            sum+=src[ny*cols+nx]*w;count+=w;
        }
        dst[cy*cols+cx]=sum/count;
    }
    return dst;
}

function computeColumnHeights(layers, filledArr, S, depthFactor) {
    const LT = LAYER_THICKNESS + LAYER_GAP;
    const cols = Math.ceil(S / STEP);
    const globalHeight = new Float32Array(cols*cols);
    const result = {};
    for (const layer of layers) {
        const layerCols = new Uint8Array(cols*cols);
        for(let y=0;y<S;y++)for(let x=0;x<S;x++){
            if(filledArr[layer.z*S*S+y*S+x])layerCols[Math.floor(y/STEP)*cols+Math.floor(x/STEP)]=1;
        }
        const colOffsets = new Float32Array(cols*cols);
        for(let i=0;i<cols*cols;i++)if(layerCols[i])colOffsets[i]=globalHeight[i];
        const smoothed = blurHeightMap(colOffsets, cols, 3);
        for(let i=0;i<cols*cols;i++)if(!layerCols[i])smoothed[i]=0;
        result[layer.color] = smoothed;
        // Inflation
        let inflationMap = null;
        if (depthFactor > 0) {
            const df = computeDistanceField(filledArr, S, layer.z);
            inflationMap = new Float32Array(cols*cols);
            for(let i=0;i<cols*cols;i++)inflationMap[i]=Math.sqrt(df[i])*depthFactor;
        }
        for(let i=0;i<cols*cols;i++){
            if(layerCols[i]){globalHeight[i]+=LT+(inflationMap?inflationMap[i]:0);}
        }
    }
    return result;
}

// ---- Main message handler ----

self.onmessage = function(e) {
    const { id, filledArr, layers, S, depthFactor } = e.data;

    const columnHeightsMap = computeColumnHeights(layers, filledArr, S, depthFactor);
    const results = [];
    const cols = Math.ceil(S / STEP);

    for (const layer of layers) {
        const colHeights = columnHeightsMap[layer.color];
        const data = buildFieldForLayer(filledArr, S, layer.z);
        const raw = marchFieldFlat(data);
        let positions = raw.positions;
        let normals = raw.normals;

        if (positions.length === 0) continue;

        // Depth inflation
        const depth = depthFactor || 0;
        let distField = null;
        if (depth > 0) distField = computeDistanceField(filledArr, S, layer.z);

        let minY=Infinity, maxY=-Infinity;
        for(let i=1;i<positions.length;i+=3){if(positions[i]<minY)minY=positions[i];if(positions[i]>maxY)maxY=positions[i];}
        const yRange=maxY-minY||1, yCenter=(minY+maxY)/2;

        for (let i=0;i<positions.length;i+=3) {
            const wx=positions[i],wy=positions[i+1],wz=positions[i+2];
            positions[i+1] += bilinearSample(colHeights, cols, wx, wz);
            if (distField && depth > 0) {
                const d = bilinearSample(distField, cols, wx, wz);
                const inflate = Math.sqrt(d) * depth;
                const t = (wy - yCenter) / (yRange / 2);
                positions[i+1] += t * inflate;
            }
        }

        // Laplacian smoothing (2 passes)
        let s1 = laplacianSmooth(positions, normals, 0.3);
        let s2 = laplacianSmooth(s1.positions, s1.normals, 0.2);
        positions = s2.positions;
        normals = s2.normals;

        results.push({
            color: layer.color,
            positions: positions.buffer,
            normals: normals.buffer,
        });
    }

    // Transfer buffers for zero-copy
    const transfers = [];
    for (const r of results) { transfers.push(r.positions, r.normals); }

    self.postMessage({ id, results }, transfers);
};
