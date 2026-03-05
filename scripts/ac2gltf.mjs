#!/usr/bin/env node

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

/**
 * UTILITY: AC3D to GLB/GLTF Converter
 * 
 * Usage: node scripts/ac2gltf.mjs <input.ac> [output.glb]
 * 
 * Description:
 * Converts FlightGear `.ac` models directly to structural `.glb` binaries.
 * Built on top of the native Open-Asset-Importer (Assimp).
 */

if (process.argv.length < 3) {
    console.log("Usage: node scripts/ac2gltf.mjs <input.ac> [output.glb]");
    process.exit(1);
}

const inputPath = process.argv[2];
if (!fs.existsSync(inputPath)) {
    console.error(`Error: File '${inputPath}' not found.`);
    process.exit(1);
}

let outputPath = process.argv[3];
if (!outputPath) {
    const ext = path.extname(inputPath);
    outputPath = inputPath.slice(0, -ext.length) + '.glb';
}

// 1. Check for Assimp dependency
try {
    execSync('which assimp', { stdio: 'ignore' });
} catch (err) {
    console.error("=========================================");
    console.error("🚨 DEPENDENCY ERROR: 'assimp' not found");
    console.error("This converter requires the Open-Asset-Importer library.");
    console.error("\nPlease install it by running:");
    console.error("  brew install assimp");
    console.error("=========================================\n");
    process.exit(1);
}

// 2. Perform Conversion
console.log(`\n⚙️  Converting '${path.basename(inputPath)}' to GLB format...`);
try {
    const cmd = `assimp export "${inputPath}" "${outputPath}"`;
    execSync(cmd, { stdio: 'inherit' });

    console.log(`\n✅ Successfully generated: ${outputPath} `);
    console.log("To verify the exported geometry graph natively, run:");
    console.log(`  node scripts / verify_glb_hierarchy.mjs ${outputPath} `);
} catch (err) {
    console.error(`\n❌ Conversion failed.`);
    process.exit(1);
}
