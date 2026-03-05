import fs from 'fs';
const buf = fs.readFileSync('world/chunks/city_a/city.bin');
const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
const maskOffset = view.getInt32(20, true);
const maskSize = view.getInt32(16, true);
const data = new Uint8Array(buf.buffer, buf.byteOffset + maskOffset, maskSize * maskSize);
let max = 0, countPavement = 0, countRoad = 0;
for (let i = 0; i < data.length; i++) {
    if (data[i] > max) max = data[i];
    if (data[i] > 20 && data[i] < 100) countPavement++;
    if (data[i] >= 100) countRoad++;
}
console.log(`Mask Size: ${maskSize}^2`);
console.log(`Max: ${max}`);
console.log(`Pavement Pixels (>20 & <100): ${countPavement}`);
console.log(`Road Pixels (>=100): ${countRoad}`);
