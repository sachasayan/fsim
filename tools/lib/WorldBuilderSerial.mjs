/**
 * WorldBuilderSerial.mjs
 * Binary serialization helpers for the fsim world builder.
 */

const MAGIC = 0x46574C44;
const VERSION = 2;
const BLDG_FLOATS = 10;
const ROAD_FLOATS = 8;

/**
 * Serializes city buildings and road segments into a binary buffer.
 * @param {Array} buildings - List of buildings.
 * @param {Array} roadSegments - List of road segments.
 * @param {Uint8Array} maskData - 2D road mask data.
 * @param {number} maskSize - Size of the square mask.
 * @returns {Buffer} Node.js Buffer containing the binary data.
 */
export function serializeChunk(buildings, roadSegments, maskData, maskSize) {
    const headerInts = 6;
    const bldgBytes = buildings.length * BLDG_FLOATS * 4;
    const roadBytes = roadSegments.length * ROAD_FLOATS * 4;
    const maskBytes = maskSize * maskSize;

    const maskOffset = headerInts * 4 + bldgBytes + roadBytes;
    const byteLen = maskOffset + maskBytes;

    const buf = new ArrayBuffer(byteLen);
    const view = new DataView(buf);
    let off = 0;

    const wi32 = (v) => { view.setInt32(off, v, true); off += 4; };
    const wf32 = (v) => { view.setFloat32(off, v, true); off += 4; };

    wi32(MAGIC);
    wi32(VERSION);
    wi32(buildings.length);
    wi32(roadSegments.length);
    wi32(maskSize);
    wi32(maskOffset);

    for (const b of buildings) {
        wf32(b.x); wf32(b.y); wf32(b.z);
        wf32(b.w); wf32(b.h); wf32(b.d);
        wf32(b.angle);
        wf32(b.classId);
        wf32(b.colorIdx);
        wf32(0);
    }

    for (const r of roadSegments) {
        wf32(r.x1); wf32(r.y1); wf32(r.z1);
        wf32(r.x2); wf32(r.y2); wf32(r.z2);
        wf32(r.halfWidth);
        wf32(r.classId);
    }

    const dstArray = new Uint8Array(buf, maskOffset);
    dstArray.set(maskData);

    return Buffer.from(buf);
}
