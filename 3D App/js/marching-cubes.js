/**
 * Marching Cubes with vertex colors for Vorm Jr.
 * Downsamples the voxel grid into a coarser field for mesh generation,
 * then runs marching cubes for smooth results.
 *
 * generate() accepts a filledOverride array and a zOffset for stacking layers.
 */
const MarchingCubes = (() => {

    const edgeTable = [
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
    ];

    const triTable = [
        [-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
        [0,8,3,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
        [0,1,9,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
        [1,8,3,9,8,1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
        [1,2,10,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
        [0,8,3,1,2,10,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
        [9,2,10,0,2,9,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
        [2,8,3,2,10,8,10,9,8,-1,-1,-1,-1,-1,-1,-1],
        [3,11,2,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
        [0,11,2,8,11,0,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
        [1,9,0,2,3,11,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
        [1,11,2,1,9,11,9,8,11,-1,-1,-1,-1,-1,-1,-1],
        [3,10,1,11,10,3,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
        [0,10,1,0,8,10,8,11,10,-1,-1,-1,-1,-1,-1,-1],
        [3,9,0,3,11,9,11,10,9,-1,-1,-1,-1,-1,-1,-1],
        [9,8,10,10,8,11,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
        [4,7,8,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
        [4,3,0,7,3,4,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
        [0,1,9,8,4,7,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
        [4,1,9,4,7,1,7,3,1,-1,-1,-1,-1,-1,-1,-1],
        [1,2,10,8,4,7,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
        [3,4,7,3,0,4,1,2,10,-1,-1,-1,-1,-1,-1,-1],
        [9,2,10,9,0,2,8,4,7,-1,-1,-1,-1,-1,-1,-1],
        [2,10,9,2,9,7,2,7,3,7,9,4,-1,-1,-1,-1],
        [8,4,7,3,11,2,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
        [11,4,7,11,2,4,2,0,4,-1,-1,-1,-1,-1,-1,-1],
        [9,0,1,8,4,7,2,3,11,-1,-1,-1,-1,-1,-1,-1],
        [4,7,11,9,4,11,9,11,2,9,2,1,-1,-1,-1,-1],
        [3,10,1,3,11,10,7,8,4,-1,-1,-1,-1,-1,-1,-1],
        [1,11,10,1,4,11,1,0,4,7,11,4,-1,-1,-1,-1],
        [4,7,8,9,0,11,9,11,10,11,0,3,-1,-1,-1,-1],
        [4,7,11,4,11,9,9,11,10,-1,-1,-1,-1,-1,-1,-1],
        [9,5,4,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
        [9,5,4,0,8,3,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
        [0,5,4,1,5,0,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
        [8,5,4,8,3,5,3,1,5,-1,-1,-1,-1,-1,-1,-1],
        [1,2,10,9,5,4,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
        [3,0,8,1,2,10,4,9,5,-1,-1,-1,-1,-1,-1,-1],
        [5,2,10,5,4,2,4,0,2,-1,-1,-1,-1,-1,-1,-1],
        [2,10,5,3,2,5,3,5,4,3,4,8,-1,-1,-1,-1],
        [9,5,4,2,3,11,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
        [0,11,2,0,8,11,4,9,5,-1,-1,-1,-1,-1,-1,-1],
        [0,5,4,0,1,5,2,3,11,-1,-1,-1,-1,-1,-1,-1],
        [2,1,5,2,5,8,2,8,11,4,8,5,-1,-1,-1,-1],
        [10,3,11,10,1,3,9,5,4,-1,-1,-1,-1,-1,-1,-1],
        [4,9,5,0,8,1,8,10,1,8,11,10,-1,-1,-1,-1],
        [5,4,0,5,0,11,5,11,10,11,0,3,-1,-1,-1,-1],
        [5,4,8,5,8,10,10,8,11,-1,-1,-1,-1,-1,-1,-1],
        [9,7,8,5,7,9,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
        [9,3,0,9,5,3,5,7,3,-1,-1,-1,-1,-1,-1,-1],
        [0,7,8,0,1,7,1,5,7,-1,-1,-1,-1,-1,-1,-1],
        [1,5,3,3,5,7,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
        [9,7,8,9,5,7,10,1,2,-1,-1,-1,-1,-1,-1,-1],
        [10,1,2,9,5,0,5,3,0,5,7,3,-1,-1,-1,-1],
        [8,0,2,8,2,5,8,5,7,10,5,2,-1,-1,-1,-1],
        [2,10,5,2,5,3,3,5,7,-1,-1,-1,-1,-1,-1,-1],
        [7,9,5,7,8,9,3,11,2,-1,-1,-1,-1,-1,-1,-1],
        [9,5,7,9,7,2,9,2,0,2,7,11,-1,-1,-1,-1],
        [2,3,11,0,1,8,1,7,8,1,5,7,-1,-1,-1,-1],
        [11,2,1,11,1,7,7,1,5,-1,-1,-1,-1,-1,-1,-1],
        [9,5,8,8,5,7,10,1,3,10,3,11,-1,-1,-1,-1],
        [5,7,0,5,0,9,7,11,0,1,0,10,11,10,0,-1],
        [11,10,0,11,0,3,10,5,0,8,0,7,5,7,0,-1],
        [11,10,5,7,11,5,-1,-1,-1,-1,-1,-1,-1,-1,-1],
        [10,6,5,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
        [0,8,3,5,10,6,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
        [9,0,1,5,10,6,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
        [1,8,3,1,9,8,5,10,6,-1,-1,-1,-1,-1,-1,-1],
        [1,6,5,2,6,1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
        [1,6,5,1,2,6,3,0,8,-1,-1,-1,-1,-1,-1,-1],
        [9,6,5,9,0,6,0,2,6,-1,-1,-1,-1,-1,-1,-1],
        [5,9,8,5,8,2,5,2,6,3,2,8,-1,-1,-1,-1],
        [2,3,11,10,6,5,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
        [11,0,8,11,2,0,10,6,5,-1,-1,-1,-1,-1,-1,-1],
        [0,1,9,2,3,11,5,10,6,-1,-1,-1,-1,-1,-1,-1],
        [5,10,6,1,9,2,9,11,2,9,8,11,-1,-1,-1,-1],
        [6,3,11,6,5,3,5,1,3,-1,-1,-1,-1,-1,-1,-1],
        [0,8,11,0,11,5,0,5,1,5,11,6,-1,-1,-1,-1],
        [3,11,6,0,3,6,0,6,5,0,5,9,-1,-1,-1,-1],
        [6,5,9,6,9,11,11,9,8,-1,-1,-1,-1,-1,-1,-1],
        [5,10,6,4,7,8,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
        [4,3,0,4,7,3,6,5,10,-1,-1,-1,-1,-1,-1,-1],
        [1,9,0,5,10,6,8,4,7,-1,-1,-1,-1,-1,-1,-1],
        [10,6,5,1,9,7,1,7,3,7,9,4,-1,-1,-1,-1],
        [6,1,2,6,5,1,4,7,8,-1,-1,-1,-1,-1,-1,-1],
        [1,2,5,5,2,6,3,0,4,3,4,7,-1,-1,-1,-1],
        [8,4,7,9,0,5,0,6,5,0,2,6,-1,-1,-1,-1],
        [7,3,9,7,9,4,3,2,9,5,9,6,2,6,9,-1],
        [3,11,2,7,8,4,10,6,5,-1,-1,-1,-1,-1,-1,-1],
        [5,10,6,4,7,2,4,2,0,2,7,11,-1,-1,-1,-1],
        [0,1,9,4,7,8,2,3,11,5,10,6,-1,-1,-1,-1],
        [9,2,1,9,11,2,9,4,11,7,11,4,5,10,6,-1],
        [8,4,7,3,11,5,3,5,1,5,11,6,-1,-1,-1,-1],
        [5,1,11,5,11,6,1,0,11,7,11,4,0,4,11,-1],
        [0,5,9,0,6,5,0,3,6,11,6,3,8,4,7,-1],
        [6,5,9,6,9,11,4,7,9,7,11,9,-1,-1,-1,-1],
        [10,4,9,6,4,10,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
        [4,10,6,4,9,10,0,8,3,-1,-1,-1,-1,-1,-1,-1],
        [10,0,1,10,6,0,6,4,0,-1,-1,-1,-1,-1,-1,-1],
        [8,3,1,8,1,6,8,6,4,6,1,10,-1,-1,-1,-1],
        [1,4,9,1,2,4,2,6,4,-1,-1,-1,-1,-1,-1,-1],
        [3,0,8,1,2,9,2,4,9,2,6,4,-1,-1,-1,-1],
        [0,2,4,4,2,6,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
        [8,3,2,8,2,4,4,2,6,-1,-1,-1,-1,-1,-1,-1],
        [10,4,9,10,6,4,11,2,3,-1,-1,-1,-1,-1,-1,-1],
        [0,8,2,2,8,11,4,9,10,4,10,6,-1,-1,-1,-1],
        [3,11,2,0,1,6,0,6,4,6,1,10,-1,-1,-1,-1],
        [6,4,1,6,1,10,4,8,1,2,1,11,8,11,1,-1],
        [9,6,4,9,3,6,9,1,3,11,6,3,-1,-1,-1,-1],
        [8,11,1,8,1,0,11,6,1,9,1,4,6,4,1,-1],
        [3,11,6,3,6,0,0,6,4,-1,-1,-1,-1,-1,-1,-1],
        [6,4,8,11,6,8,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
        [7,10,6,7,8,10,8,9,10,-1,-1,-1,-1,-1,-1,-1],
        [0,7,3,0,10,7,0,9,10,6,7,10,-1,-1,-1,-1],
        [10,6,7,1,10,7,1,7,8,1,8,0,-1,-1,-1,-1],
        [10,6,7,10,7,1,1,7,3,-1,-1,-1,-1,-1,-1,-1],
        [1,2,6,1,6,8,1,8,9,8,6,7,-1,-1,-1,-1],
        [2,6,9,2,9,1,6,7,9,0,9,3,7,3,9,-1],
        [7,8,0,7,0,6,6,0,2,-1,-1,-1,-1,-1,-1,-1],
        [7,3,2,6,7,2,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
        [2,3,11,10,6,8,10,8,9,8,6,7,-1,-1,-1,-1],
        [2,0,7,2,7,11,0,9,7,6,7,10,9,10,7,-1],
        [1,8,0,1,7,8,1,10,7,6,7,10,2,3,11,-1],
        [11,2,1,11,1,7,10,6,1,6,7,1,-1,-1,-1,-1],
        [8,9,6,8,6,7,9,1,6,11,6,3,1,3,6,-1],
        [0,9,1,11,6,7,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
        [7,8,0,7,0,6,3,11,0,11,6,0,-1,-1,-1,-1],
        [7,11,6,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
        [7,6,11,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
        [3,0,8,11,7,6,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
        [0,1,9,11,7,6,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
        [8,1,9,8,3,1,11,7,6,-1,-1,-1,-1,-1,-1,-1],
        [10,1,2,6,11,7,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
        [1,2,10,3,0,8,6,11,7,-1,-1,-1,-1,-1,-1,-1],
        [2,9,0,2,10,9,6,11,7,-1,-1,-1,-1,-1,-1,-1],
        [6,11,7,2,10,3,10,8,3,10,9,8,-1,-1,-1,-1],
        [7,2,3,6,2,7,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
        [7,0,8,7,6,0,6,2,0,-1,-1,-1,-1,-1,-1,-1],
        [2,7,6,2,3,7,0,1,9,-1,-1,-1,-1,-1,-1,-1],
        [1,6,2,1,8,6,1,9,8,8,7,6,-1,-1,-1,-1],
        [10,7,6,10,1,7,1,3,7,-1,-1,-1,-1,-1,-1,-1],
        [10,7,6,1,7,10,1,8,7,1,0,8,-1,-1,-1,-1],
        [0,3,7,0,7,10,0,10,9,6,10,7,-1,-1,-1,-1],
        [7,6,10,7,10,8,8,10,9,-1,-1,-1,-1,-1,-1,-1],
        [6,8,4,11,8,6,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
        [3,6,11,3,0,6,0,4,6,-1,-1,-1,-1,-1,-1,-1],
        [8,6,11,8,4,6,9,0,1,-1,-1,-1,-1,-1,-1,-1],
        [9,4,6,9,6,3,9,3,1,11,3,6,-1,-1,-1,-1],
        [6,8,4,6,11,8,2,10,1,-1,-1,-1,-1,-1,-1,-1],
        [1,2,10,3,0,11,0,6,11,0,4,6,-1,-1,-1,-1],
        [4,11,8,4,6,11,0,2,9,2,10,9,-1,-1,-1,-1],
        [10,9,3,10,3,2,9,4,3,11,3,6,4,6,3,-1],
        [8,2,3,8,4,2,4,6,2,-1,-1,-1,-1,-1,-1,-1],
        [0,4,2,4,6,2,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
        [1,9,0,2,3,4,2,4,6,4,3,8,-1,-1,-1,-1],
        [1,9,4,1,4,2,2,4,6,-1,-1,-1,-1,-1,-1,-1],
        [8,1,3,8,6,1,8,4,6,6,10,1,-1,-1,-1,-1],
        [10,1,0,10,0,6,6,0,4,-1,-1,-1,-1,-1,-1,-1],
        [4,6,3,4,3,8,6,10,3,0,3,9,10,9,3,-1],
        [10,9,4,6,10,4,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
        [4,9,5,7,6,11,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
        [0,8,3,4,9,5,11,7,6,-1,-1,-1,-1,-1,-1,-1],
        [5,0,1,5,4,0,7,6,11,-1,-1,-1,-1,-1,-1,-1],
        [11,7,6,8,3,4,3,5,4,3,1,5,-1,-1,-1,-1],
        [9,5,4,10,1,2,7,6,11,-1,-1,-1,-1,-1,-1,-1],
        [6,11,7,1,2,10,0,8,3,4,9,5,-1,-1,-1,-1],
        [7,6,11,5,4,10,4,2,10,4,0,2,-1,-1,-1,-1],
        [3,4,8,3,5,4,3,2,5,10,5,2,11,7,6,-1],
        [7,2,3,7,6,2,5,4,9,-1,-1,-1,-1,-1,-1,-1],
        [9,5,4,0,8,6,0,6,2,6,8,7,-1,-1,-1,-1],
        [3,6,2,3,7,6,1,5,0,5,4,0,-1,-1,-1,-1],
        [6,2,8,6,8,7,2,1,8,4,8,5,1,5,8,-1],
        [9,5,4,10,1,6,1,7,6,1,3,7,-1,-1,-1,-1],
        [1,6,10,1,7,6,1,0,7,8,7,0,9,5,4,-1],
        [4,0,10,4,10,5,0,3,10,6,10,7,3,7,10,-1],
        [7,6,10,7,10,8,5,4,10,4,8,10,-1,-1,-1,-1],
        [6,9,5,6,11,9,11,8,9,-1,-1,-1,-1,-1,-1,-1],
        [3,6,11,0,6,3,0,5,6,0,9,5,-1,-1,-1,-1],
        [0,11,8,0,5,11,0,1,5,5,6,11,-1,-1,-1,-1],
        [6,11,3,6,3,5,5,3,1,-1,-1,-1,-1,-1,-1,-1],
        [1,2,10,9,5,11,9,11,8,11,5,6,-1,-1,-1,-1],
        [0,11,3,0,6,11,0,9,6,5,6,9,1,2,10,-1],
        [11,8,5,11,5,6,8,0,5,10,5,2,0,2,5,-1],
        [6,11,3,6,3,5,2,10,3,10,5,3,-1,-1,-1,-1],
        [5,8,9,5,2,8,5,6,2,3,8,2,-1,-1,-1,-1],
        [9,5,6,9,6,0,0,6,2,-1,-1,-1,-1,-1,-1,-1],
        [1,5,8,1,8,0,5,6,8,3,8,2,6,2,8,-1],
        [1,5,6,2,1,6,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
        [1,3,6,1,6,10,3,8,6,5,6,9,8,9,6,-1],
        [10,1,0,10,0,6,9,5,0,5,6,0,-1,-1,-1,-1],
        [0,3,8,5,6,10,-1,-1,-1,-1,-1,-1,-1,-1,-1],
        [10,5,6,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
        [11,5,10,7,5,11,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
        [11,5,10,11,7,5,8,3,0,-1,-1,-1,-1,-1,-1,-1],
        [5,11,7,5,10,11,1,9,0,-1,-1,-1,-1,-1,-1,-1],
        [10,7,5,10,11,7,9,8,1,8,3,1,-1,-1,-1,-1],
        [11,1,2,11,7,1,7,5,1,-1,-1,-1,-1,-1,-1,-1],
        [0,8,3,1,2,7,1,7,5,7,2,11,-1,-1,-1,-1],
        [9,7,5,9,2,7,9,0,2,2,11,7,-1,-1,-1,-1],
        [7,5,2,7,2,11,5,9,2,3,2,8,9,8,2,-1],
        [2,5,10,2,3,5,3,7,5,-1,-1,-1,-1,-1,-1,-1],
        [8,2,0,8,5,2,8,7,5,10,2,5,-1,-1,-1,-1],
        [9,0,1,5,10,3,5,3,7,3,10,2,-1,-1,-1,-1],
        [9,8,2,9,2,1,8,7,2,10,2,5,7,5,2,-1],
        [1,3,5,3,7,5,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
        [0,8,7,0,7,1,1,7,5,-1,-1,-1,-1,-1,-1,-1],
        [9,0,3,9,3,5,5,3,7,-1,-1,-1,-1,-1,-1,-1],
        [9,8,7,5,9,7,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
        [5,8,4,5,10,8,10,11,8,-1,-1,-1,-1,-1,-1,-1],
        [5,0,4,5,11,0,5,10,11,11,3,0,-1,-1,-1,-1],
        [0,1,9,8,4,10,8,10,11,10,4,5,-1,-1,-1,-1],
        [10,11,4,10,4,5,11,3,4,9,4,1,3,1,4,-1],
        [2,5,1,2,8,5,2,11,8,4,5,8,-1,-1,-1,-1],
        [0,4,11,0,11,3,4,5,11,2,11,1,5,1,11,-1],
        [0,2,5,0,5,9,2,11,5,4,5,8,11,8,5,-1],
        [9,4,5,2,11,3,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
        [2,5,10,3,5,2,3,4,5,3,8,4,-1,-1,-1,-1],
        [5,10,2,5,2,4,4,2,0,-1,-1,-1,-1,-1,-1,-1],
        [3,10,2,3,5,10,3,8,5,4,5,8,0,1,9,-1],
        [5,10,2,5,2,4,1,9,2,9,4,2,-1,-1,-1,-1],
        [8,4,5,8,5,3,3,5,1,-1,-1,-1,-1,-1,-1,-1],
        [0,4,5,1,0,5,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
        [8,4,5,8,5,3,9,0,5,0,3,5,-1,-1,-1,-1],
        [9,4,5,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
        [4,11,7,4,9,11,9,10,11,-1,-1,-1,-1,-1,-1,-1],
        [0,8,3,4,9,7,9,11,7,9,10,11,-1,-1,-1,-1],
        [1,10,11,1,11,4,1,4,0,7,4,11,-1,-1,-1,-1],
        [3,1,4,3,4,8,1,10,4,7,4,11,10,11,4,-1],
        [4,11,7,9,11,4,9,2,11,9,1,2,-1,-1,-1,-1],
        [9,7,4,9,11,7,9,1,11,2,11,1,0,8,3,-1],
        [11,7,4,11,4,2,2,4,0,-1,-1,-1,-1,-1,-1,-1],
        [11,7,4,11,4,2,8,3,4,3,2,4,-1,-1,-1,-1],
        [2,9,10,2,7,9,2,3,7,7,4,9,-1,-1,-1,-1],
        [9,10,7,9,7,4,10,2,7,8,7,0,2,0,7,-1],
        [3,7,10,3,10,2,7,4,10,1,10,0,4,0,10,-1],
        [1,10,2,8,7,4,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
        [4,9,1,4,1,7,7,1,3,-1,-1,-1,-1,-1,-1,-1],
        [4,9,1,4,1,7,0,8,1,8,7,1,-1,-1,-1,-1],
        [4,0,3,7,4,3,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
        [4,8,7,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
        [9,10,8,10,11,8,-1,-1,-1,-1,-1,-1,-1,-1,-1],
        [3,0,9,3,9,11,11,9,10,-1,-1,-1,-1,-1,-1,-1],
        [0,1,10,0,10,8,8,10,11,-1,-1,-1,-1,-1,-1,-1],
        [3,1,10,11,3,10,-1,-1,-1,-1,-1,-1,-1,-1,-1],
        [1,2,11,1,11,9,9,11,8,-1,-1,-1,-1,-1,-1,-1],
        [3,0,9,3,9,11,1,2,9,2,11,9,-1,-1,-1,-1],
        [0,2,11,8,0,11,-1,-1,-1,-1,-1,-1,-1,-1,-1],
        [3,2,11,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
        [2,3,8,2,8,10,10,8,9,-1,-1,-1,-1,-1,-1,-1],
        [9,10,2,0,9,2,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
        [2,3,8,2,8,10,0,1,8,1,10,8,-1,-1,-1,-1],
        [1,10,2,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
        [1,3,8,9,1,8,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
        [0,9,1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
        [0,3,8,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
        [-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1]
    ];

    const cornerOffsets = [
        [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
        [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]
    ];

    const edgeConnections = [
        [0, 1], [1, 2], [2, 3], [3, 0],
        [4, 5], [5, 6], [6, 7], [7, 4],
        [0, 4], [1, 5], [2, 6], [3, 7]
    ];

    const STEP = 2;
    const LAYER_THICKNESS = 2; // world units per layer height
    const LAYER_GAP = 3;      // extra gap between stacked layers

    /**
     * Build a scalar field from filled voxels for one layer.
     * Uses 7 z-slices: 2 padding + 3 content + 2 padding for fully closed mesh.
     */
    const XY_PAD = 3; // padding cells on each XY side to prevent edge see-through

    function buildFieldForLayer(filledArr, layerZ) {
        const S = VoxelGrid.SIZE;
        const fw = Math.ceil(S / STEP) + XY_PAD * 2;
        const fh = Math.ceil(S / STEP) + XY_PAD * 2;
        const fd = 11; // 3 pad + 5 content + 3 pad — enough to survive blur passes

        const field = new Float32Array(fw * fh * fd);

        for (let y = 0; y < S; y++) {
            for (let x = 0; x < S; x++) {
                const vi = layerZ * S * S + y * S + x;
                if (!filledArr[vi]) continue;

                const fx = Math.floor(x / STEP) + XY_PAD;
                const fy = Math.floor(y / STEP) + XY_PAD;

                // Fill z-slices 3-7 (5 solid slices)
                for (let fz = 3; fz <= 7; fz++) {
                    field[fz * fw * fh + fy * fw + fx] += 1.0;
                }
            }
        }

        // Normalize: clamp to 1.0 so even a single voxel in a cell is fully solid.
        // This preserves small details (2px brush strokes) that would otherwise
        // get divided down and smoothed away.
        for (let i = 0; i < field.length; i++) {
            if (field[i] > 0) field[i] = Math.min(1.0, field[i]);
        }

        // Multiple blur passes for much smoother surfaces
        let src = field;
        let dst = new Float32Array(field.length);
        const BLUR_PASSES = 3;

        for (let pass = 0; pass < BLUR_PASSES; pass++) {
            for (let z = 0; z < fd; z++) {
                for (let y = 0; y < fh; y++) {
                    for (let x = 0; x < fw; x++) {
                        let sum = 0, wTotal = 0;
                        for (let dz = -1; dz <= 1; dz++) {
                            for (let dy = -1; dy <= 1; dy++) {
                                for (let dx = -1; dx <= 1; dx++) {
                                    const nx = x + dx, ny = y + dy, nz = z + dz;
                                    if (nx < 0 || nx >= fw || ny < 0 || ny >= fh || nz < 0 || nz >= fd) continue;
                                    const ni = nz * fw * fh + ny * fw + nx;
                                    const dist = Math.abs(dx) + Math.abs(dy) + Math.abs(dz);
                                    const w = dist === 0 ? 4.0 : dist === 1 ? 2.0 : 1.0;
                                    sum += src[ni] * w;
                                    wTotal += w;
                                }
                            }
                        }
                        dst[z * fw * fh + y * fw + x] = sum / wTotal;
                    }
                }
            }
            // Swap src/dst for next pass
            const tmp = src;
            src = dst;
            dst = tmp;
        }

        return { field: src, width: fw, height: fh, depth: fd };
    }

    /**
     * Trilinear interpolation sample of the scalar field.
     */
    function sampleField(field, fw, fh, fd, x, y, z) {
        const x0 = Math.floor(x), y0 = Math.floor(y), z0 = Math.floor(z);
        const x1 = x0 + 1, y1 = y0 + 1, z1 = z0 + 1;
        const fx = x - x0, fy = y - y0, fz = z - z0;

        function getF(gx, gy, gz) {
            if (gx < 0 || gx >= fw || gy < 0 || gy >= fh || gz < 0 || gz >= fd) return 0;
            return field[gz * fw * fh + gy * fw + gx];
        }

        const c000 = getF(x0,y0,z0), c100 = getF(x1,y0,z0);
        const c010 = getF(x0,y1,z0), c110 = getF(x1,y1,z0);
        const c001 = getF(x0,y0,z1), c101 = getF(x1,y0,z1);
        const c011 = getF(x0,y1,z1), c111 = getF(x1,y1,z1);

        const c00 = c000*(1-fx)+c100*fx, c01 = c001*(1-fx)+c101*fx;
        const c10 = c010*(1-fx)+c110*fx, c11 = c011*(1-fx)+c111*fx;
        const c0 = c00*(1-fy)+c10*fy, c1 = c01*(1-fy)+c11*fy;
        return c0*(1-fz)+c1*fz;
    }

    /**
     * Compute gradient-based normal at a field-space position using central differences
     * with trilinear interpolation. Returns normalized [-nx, -ny, -nz].
     */
    function gradientNormal(field, fw, fh, fd, fx, fy, fz) {
        const eps = 0.5;
        const gx = sampleField(field, fw, fh, fd, fx+eps, fy, fz) - sampleField(field, fw, fh, fd, fx-eps, fy, fz);
        const gy = sampleField(field, fw, fh, fd, fx, fy+eps, fz) - sampleField(field, fw, fh, fd, fx, fy-eps, fz);
        const gz = sampleField(field, fw, fh, fd, fx, fy, fz+eps) - sampleField(field, fw, fh, fd, fx, fy, fz-eps);
        const len = Math.sqrt(gx*gx + gy*gy + gz*gz);
        if (len > 0.001) return [-gx/len, -gy/len, -gz/len];
        return [0, 1, 0];
    }

    /**
     * Run marching cubes on a field.
     * Returns { positions, normals, fieldCoords } — normals computed from field gradient.
     */
    function marchFieldFlat(data) {
        const { field, width: fw, height: fh, depth: fd } = data;
        const iso = 0.25;
        const positions = [];
        const normals = [];

        function getVal(x, y, z) {
            if (x < 0 || x >= fw || y < 0 || y >= fh || z < 0 || z >= fd) return 0;
            return field[z * fw * fh + y * fw + x];
        }

        function interp(x1, y1, z1, v1, x2, y2, z2, v2) {
            if (Math.abs(v1 - v2) < 0.00001) return [x1, y1, z1];
            const t = Math.max(0, Math.min(1, (iso - v1) / (v2 - v1)));
            return [x1 + t * (x2 - x1), y1 + t * (y2 - y1), z1 + t * (z2 - z1)];
        }

        for (let z = 0; z < fd - 1; z++) {
            for (let y = 0; y < fh - 1; y++) {
                for (let x = 0; x < fw - 1; x++) {
                    const vals = [];
                    for (let i = 0; i < 8; i++) {
                        const [dx, dy, dz] = cornerOffsets[i];
                        vals.push(getVal(x + dx, y + dy, z + dz));
                    }

                    let cubeIndex = 0;
                    for (let i = 0; i < 8; i++) {
                        if (vals[i] >= iso) cubeIndex |= (1 << i);
                    }
                    if (edgeTable[cubeIndex] === 0) continue;

                    const edgeVerts = new Array(12);
                    for (let i = 0; i < 12; i++) {
                        if (edgeTable[cubeIndex] & (1 << i)) {
                            const [c0, c1] = edgeConnections[i];
                            const [dx0, dy0, dz0] = cornerOffsets[c0];
                            const [dx1, dy1, dz1] = cornerOffsets[c1];
                            edgeVerts[i] = interp(
                                x+dx0, y+dy0, z+dz0, vals[c0],
                                x+dx1, y+dy1, z+dz1, vals[c1]
                            );
                        }
                    }

                    const row = triTable[cubeIndex];
                    for (let i = 0; row[i] !== -1; i += 3) {
                        for (let j = 0; j < 3; j++) {
                            const v = edgeVerts[row[i + j]];
                            // World position
                            positions.push(
                                (v[0] - XY_PAD) * STEP,
                                (v[2] - 5) * LAYER_THICKNESS,
                                (v[1] - XY_PAD) * STEP
                            );
                            // Gradient normal from field (field coords: x, y, z)
                            const n = gradientNormal(field, fw, fh, fd, v[0], v[1], v[2]);
                            // Remap axes: field x->world X, field z->world Y, field y->world Z
                            normals.push(n[0], n[2], n[1]);
                        }
                    }
                }
            }
        }

        return {
            positions: new Float32Array(positions),
            normals: new Float32Array(normals),
        };
    }

    /**
     * Compute a 2D distance field for a layer at column resolution.
     * Returns Float32Array[cols*cols] where each filled cell has its distance
     * to the nearest empty cell (0 at edges, higher toward center).
     * Uses a fast two-pass approximation (chamfer distance).
     */
    function computeDistanceField(filledArr, layerZ) {
        const S = VoxelGrid.SIZE;
        const cols = Math.ceil(S / STEP);

        // Build binary mask at column resolution
        const mask = new Uint8Array(cols * cols);
        for (let y = 0; y < S; y++) {
            for (let x = 0; x < S; x++) {
                const vi = layerZ * S * S + y * S + x;
                if (filledArr[vi]) {
                    const cx = Math.floor(x / STEP);
                    const cy = Math.floor(y / STEP);
                    mask[cy * cols + cx] = 1;
                }
            }
        }

        // Chamfer distance transform (two-pass)
        const dist = new Float32Array(cols * cols);
        const INF = cols * 2;

        // Initialize: 0 for empty, INF for filled
        for (let i = 0; i < cols * cols; i++) {
            dist[i] = mask[i] ? INF : 0;
        }

        // Forward pass (top-left to bottom-right)
        for (let y = 0; y < cols; y++) {
            for (let x = 0; x < cols; x++) {
                const i = y * cols + x;
                if (dist[i] === 0) continue;
                if (x > 0) dist[i] = Math.min(dist[i], dist[i - 1] + 1);
                if (y > 0) dist[i] = Math.min(dist[i], dist[(y-1) * cols + x] + 1);
                if (x > 0 && y > 0) dist[i] = Math.min(dist[i], dist[(y-1) * cols + (x-1)] + 1.414);
                if (x < cols-1 && y > 0) dist[i] = Math.min(dist[i], dist[(y-1) * cols + (x+1)] + 1.414);
            }
        }

        // Backward pass (bottom-right to top-left)
        for (let y = cols - 1; y >= 0; y--) {
            for (let x = cols - 1; x >= 0; x--) {
                const i = y * cols + x;
                if (dist[i] === 0) continue;
                if (x < cols-1) dist[i] = Math.min(dist[i], dist[i + 1] + 1);
                if (y < cols-1) dist[i] = Math.min(dist[i], dist[(y+1) * cols + x] + 1);
                if (x < cols-1 && y < cols-1) dist[i] = Math.min(dist[i], dist[(y+1) * cols + (x+1)] + 1.414);
                if (x > 0 && y < cols-1) dist[i] = Math.min(dist[i], dist[(y+1) * cols + (x-1)] + 1.414);
            }
        }

        // Find max for normalization
        let maxDist = 0;
        for (let i = 0; i < dist.length; i++) {
            if (dist[i] > maxDist) maxDist = dist[i];
        }

        // Normalize to 0-1
        if (maxDist > 0) {
            for (let i = 0; i < dist.length; i++) {
                dist[i] = dist[i] / maxDist;
            }
        }

        return dist;
    }

    /**
     * Bilinear sample from a cols*cols map at world position.
     */
    function bilinearSample(map, cols, wx, wz) {
        const fx = wx / STEP;
        const fy = wz / STEP;
        const x0 = Math.max(0, Math.min(cols - 1, Math.floor(fx)));
        const y0 = Math.max(0, Math.min(cols - 1, Math.floor(fy)));
        const x1 = Math.min(cols - 1, x0 + 1);
        const y1 = Math.min(cols - 1, y0 + 1);
        const tx = Math.max(0, Math.min(1, fx - x0));
        const ty = Math.max(0, Math.min(1, fy - y0));

        return map[y0*cols+x0]*(1-tx)*(1-ty) + map[y0*cols+x1]*tx*(1-ty)
             + map[y1*cols+x0]*(1-tx)*ty + map[y1*cols+x1]*tx*ty;
    }

    /**
     * Generate mesh for a single layer, then deform Y per-column based on heightMap
     * and optionally inflate based on distance field (depth factor).
     * Returns { positions, normals }.
     */
    /**
     * Compute the max inflation height per column for a layer's distance field.
     * Used by the stacking system to push upper layers above inflated lower layers.
     */
    function computeInflationMap(filledArr, layerZ, depthFactor) {
        if (!depthFactor || depthFactor <= 0) return null;
        const cols = Math.ceil(VoxelGrid.SIZE / STEP);
        const distField = computeDistanceField(filledArr, layerZ);
        const inflationMap = new Float32Array(cols * cols);
        for (let i = 0; i < cols * cols; i++) {
            inflationMap[i] = Math.sqrt(distField[i]) * depthFactor;
        }
        return inflationMap;
    }

    function generateForLayer(filledArr, layerZ, columnHeights, depthFactor) {
        const data = buildFieldForLayer(filledArr, layerZ);
        const result = marchFieldFlat(data);
        const positions = result.positions;
        const normals = result.normals;
        if (positions.length === 0) return { positions, normals };

        const cols = Math.ceil(VoxelGrid.SIZE / STEP);
        const depth = depthFactor || 0;

        let distField = null;
        if (depth > 0) {
            distField = computeDistanceField(filledArr, layerZ);
        }

        // Find the Y extent of the flat mesh for normalization
        let minY = Infinity, maxY = -Infinity;
        for (let i = 1; i < positions.length; i += 3) {
            if (positions[i] < minY) minY = positions[i];
            if (positions[i] > maxY) maxY = positions[i];
        }
        const yRange = maxY - minY || 1;
        const yCenter = (minY + maxY) / 2;

        for (let i = 0; i < positions.length; i += 3) {
            const wx = positions[i];
            const wy = positions[i + 1];
            const wz = positions[i + 2];

            // Stack offset from column heights
            const stackH = bilinearSample(columnHeights, cols, wx, wz);
            positions[i + 1] += stackH;

            // Symmetric depth inflation: both top and bottom expand outward
            if (distField && depth > 0) {
                const d = bilinearSample(distField, cols, wx, wz);
                const inflate = Math.sqrt(d) * depth;

                // How far is this vertex from the center of the layer (normalized -1 to 1)
                const t = (wy - yCenter) / (yRange / 2);
                // Scale Y outward from center: vertices above center go up, below go down
                positions[i + 1] += t * inflate;
            }
        }

        return { positions, normals };
    }

    /**
     * Legacy generate() for backwards compat (uses all filled voxels, all layers combined).
     */
    function generate() {
        const S = VoxelGrid.SIZE;
        const L = VoxelGrid.MAX_LAYERS;
        const filled = VoxelGrid.filled;

        const fw = Math.ceil(S / STEP) + 2;
        const fh = Math.ceil(S / STEP) + 2;
        const fd = L + 2;
        const field = new Float32Array(fw * fh * fd);

        for (let z = 0; z < L; z++) {
            for (let y = 0; y < S; y++) {
                for (let x = 0; x < S; x++) {
                    const vi = z * S * S + y * S + x;
                    if (!filled[vi]) continue;
                    const fx = Math.floor(x / STEP) + 1;
                    const fy = Math.floor(y / STEP) + 1;
                    const fz = z + 1;
                    field[fz * fw * fh + fy * fw + fx] += 1.0;
                }
            }
        }

        const maxPerCell = STEP * STEP;
        for (let i = 0; i < field.length; i++) {
            if (field[i] > 0) field[i] /= maxPerCell;
        }

        const blurred = new Float32Array(field.length);
        for (let z = 0; z < fd; z++) {
            for (let y = 0; y < fh; y++) {
                for (let x = 0; x < fw; x++) {
                    let sum = 0, wTotal = 0;
                    for (let dz = -1; dz <= 1; dz++) {
                        for (let dy = -1; dy <= 1; dy++) {
                            for (let dx = -1; dx <= 1; dx++) {
                                const nx = x + dx, ny = y + dy, nz = z + dz;
                                if (nx < 0 || nx >= fw || ny < 0 || ny >= fh || nz < 0 || nz >= fd) continue;
                                const dist = Math.abs(dx) + Math.abs(dy) + Math.abs(dz);
                                const w = dist === 0 ? 6.0 : dist === 1 ? 2.0 : 1.0;
                                sum += field[nz * fw * fh + ny * fw + nx] * w;
                                wTotal += w;
                            }
                        }
                    }
                    blurred[z * fw * fh + y * fw + x] = sum / wTotal;
                }
            }
        }

        return { positions: marchField({ field: blurred, width: fw, height: fh, depth: fd }, 0), colors: new Float32Array(0) };
    }

    return { generate, generateForLayer, computeInflationMap, STEP, LAYER_THICKNESS, LAYER_GAP };
})();
