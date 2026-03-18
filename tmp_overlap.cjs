const fs = require('fs');
const data = JSON.parse(fs.readFileSync('./tools/map.json'));
const roads = data.roads || [];

const pointMap = new Map();
let overlaps = 0;

for (let r=0; r<roads.length; r++) {
    const pts = roads[r].points || [];
    for (let p=0; p<pts.length; p++) {
        const key = `${Math.round(pts[p][0])},${Math.round(pts[p][1])}`;
        if (!pointMap.has(key)) pointMap.set(key, []);
        pointMap.get(key).push({ roadIdx: r, ptIdx: p });
    }
}

for (const [key, list] of pointMap.entries()) {
    if (list.length > 1) {
        overlaps++;
    }
}
console.log(`Total roads: ${roads.length}, shared points: ${overlaps}`);
