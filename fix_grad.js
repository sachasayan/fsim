const fs = require('fs');
let code = fs.readFileSync('js/modules/noise.js', 'utf8');

// Generate the original grad function's array manually to make sure it matches identically.
let g3 = [];
for (let h = 0; h < 16; h++) {
    let cX = 0, cY = 0, cZ = 0;

    let signU = (h & 1) === 0 ? 1 : -1;
    let signV = (h & 2) === 0 ? 1 : -1;

    if (h < 8) cX += signU; else cY += signU;

    if (h < 4) cY += signV;
    else if (h === 12 || h === 14) cX += signV;
    else cZ += signV;

    g3.push(cX, cY, cZ);
}

// Convert to string
let gradStr = `  grad3: new Float32Array([\n    `;
for (let i = 0; i < 4; i++) {
    let row = [];
    for(let j = 0; j < 4; j++) {
        let idx = (i*4+j)*3;
        let p = (v) => v >= 0 ? ` ${v}` : `${v}`;
        row.push(`${p(g3[idx])}, ${p(g3[idx+1])}, ${p(g3[idx+2])}`);
    }
    gradStr += row.join(",  ") + (i < 3 ? ",\n    " : "\n  ]),");
}

let replaced = code.replace(/grad3: new Float32Array\([\s\S]*?\),/, gradStr.trim());
fs.writeFileSync('js/modules/noise.js', replaced);
