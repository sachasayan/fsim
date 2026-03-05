import fs from 'fs';

const files = [
    '/Users/sacha/Projects/fsim/models/737-800-master/Models/NoseGear.xml',
    '/Users/sacha/Projects/fsim/models/737-800-master/Models/LWing.xml',
    '/Users/sacha/Projects/fsim/models/737-800-master/Models/RWing.xml'
];

files.forEach(filePath => {
    const xml = fs.readFileSync(filePath, 'utf8');
    const animBlocks = xml.split('<animation>');
    console.log(`\n=== Scanning ${filePath} ===`);

    animBlocks.forEach(block => {
        if (!block.includes('<type>rotate</type>') && !block.includes('<property>gear')) return;
        if (!block.includes('gear')) return; // Ensure it's related to gear animation

        const objMatches = [...block.matchAll(/<object-name>(.*?)<\/object-name>/g)];
        if (objMatches.length === 0) return;

        const factorMatch = block.match(/<factor>\s*([\-\d\.]+)\s*<\/factor>/);
        const factor = factorMatch ? factorMatch[1] : "UNKNOWN";

        console.log(`Objects: ${objMatches.map(m => m[1].trim()).join(', ')} -> Factor (degrees): ${factor}`);
    });
});
