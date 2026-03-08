/**
 * WorldBuilderSerial.mjs
 * Binary serialization helpers for the fsim world builder.
 */

const MAGIC = 0x46574C44;
const VERSION = 3;
const BLDG_FLOATS = 10;

/**
 * Serializes district buildings into a binary buffer.
 * @param {Array} buildings - List of buildings.
 * @returns {Buffer} Node.js Buffer containing the binary data.
 */
export function serializeChunk(buildings) {
    const headerInts = 6;
    const bldgBytes = buildings.length * BLDG_FLOATS * 4;

    // Header layout retained for backward compatibility:
    // [magic, version, numBuildings, numRoads, maskSize, maskOffset]
    const maskOffset = headerInts * 4 + bldgBytes;
    const byteLen = maskOffset;

    const buf = new ArrayBuffer(byteLen);
    const view = new DataView(buf);
    let off = 0;

    const wi32 = (v) => { view.setInt32(off, v, true); off += 4; };
    const wf32 = (v) => { view.setFloat32(off, v, true); off += 4; };

    wi32(MAGIC);
    wi32(VERSION);
    wi32(buildings.length);
    wi32(0);
    wi32(0);
    wi32(maskOffset);

    for (const b of buildings) {
        wf32(b.x); wf32(b.y); wf32(b.z);
        wf32(b.w); wf32(b.h); wf32(b.d);
        wf32(b.angle);
        wf32(b.classId);
        wf32(b.colorIdx);
        wf32(0);
    }

    return Buffer.from(buf);
}
