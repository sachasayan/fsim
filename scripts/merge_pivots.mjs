import fs from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const configPath = path.join(__dirname, '../js/modules/world/aircraft_config.js');

// Helper to get pivots from XML using our extraction script
function getPivots(xmlPath) {
    const output = execSync(`node ${path.join(__dirname, 'extract_fg_pivots.mjs')} ${xmlPath}`).toString();
    return JSON.parse(output);
}

const nosePivots = getPivots(path.join(__dirname, '../models/737-800-master/Models/NoseGear.xml'));
const leftPivots = getPivots(path.join(__dirname, '../models/737-800-master/Models/LWing.xml'));
const rightPivots = getPivots(path.join(__dirname, '../models/737-800-master/Models/RWing.xml'));

// Import existing config
import { AIRCRAFT_CONFIG } from '../js/modules/world/aircraft_config.js';

// Merge pivots
const mergedPivots = {
    ...AIRCRAFT_CONFIG.pivots,
    ...nosePivots,
    ...leftPivots,
    ...rightPivots
};

// Filter out duplicates that might be exactly the same or unneeded, though it's fine to just keep all
AIRCRAFT_CONFIG.pivots = mergedPivots;

// Write back to aircraft_config.js
const fileContent = `export const AIRCRAFT_CONFIG = ${JSON.stringify(AIRCRAFT_CONFIG, null, 4)};\n`;
fs.writeFileSync(configPath, fileContent, 'utf8');

console.log("Successfully merged new gear pivots into aircraft_config.js");
