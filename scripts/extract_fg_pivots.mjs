import fs from 'fs';

/**
 * UTILITY: FlightGear XML Pivot Extractor
 * 
 * Usage: node extract_fg_pivots.mjs <path_to_xml>
 * 
 * Description:
 * Scans a FlightGear `.xml` animation file and extracts explicit 
 * <center> (Pivot XYZ) and <axis> (Rotation Normal) coordinates
 * into JSON format natively compatible with `aircraft_config.js`.
 */

if (process.argv.length < 3) {
    console.log("Usage: node extract_fg_pivots.mjs <path_to_xml>");
    process.exit(1);
}

const filePath = process.argv[2];
const xml = fs.readFileSync(filePath, 'utf8');

const animBlocks = xml.split('<animation>');
const pivots = {};

animBlocks.forEach(block => {
    if (!block.includes('<type>rotate</type>')) return;

    const objMatches = [...block.matchAll(/<object-name>(.*?)<\/object-name>/g)];
    if (objMatches.length === 0) return;

    const centerXMatch = block.match(/<x-m>\s*([\-\d\.]+)\s*<\/x-m>/);
    const centerYMatch = block.match(/<y-m>\s*([\-\d\.]+)\s*<\/y-m>/);
    const centerZMatch = block.match(/<z-m>\s*([\-\d\.]+)\s*<\/z-m>/);

    if (!centerXMatch || !centerYMatch || !centerZMatch) return;

    const axisXMatch = block.match(/<x>\s*([\-\d\.]+)\s*<\/x>/);
    const axisYMatch = block.match(/<y>\s*([\-\d\.]+)\s*<\/y>/);
    const axisZMatch = block.match(/<z>\s*([\-\d\.]+)\s*<\/z>/);

    if (!axisXMatch || !axisYMatch || !axisZMatch) return;

    const cx = parseFloat(centerXMatch[1]);
    const cy = parseFloat(centerYMatch[1]);
    const cz = parseFloat(centerZMatch[1]);

    const ax = parseFloat(axisXMatch[1]);
    const ay = parseFloat(axisYMatch[1]);
    const az = parseFloat(axisZMatch[1]);

    objMatches.forEach(m => {
        const objName = m[1].trim();
        pivots[objName] = {
            center: [cx, cy, cz],
            axis: [ax, ay, az]
        };
    });
});

console.log(JSON.stringify(pivots, null, 4));
