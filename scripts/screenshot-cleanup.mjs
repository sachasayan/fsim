import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const screenshotsDir = path.join(ROOT, 'screenshots');

if (!fs.existsSync(screenshotsDir)) {
    console.log('Screenshots directory does not exist. Nothing to clean.');
    process.exit(0);
}

const items = fs.readdirSync(screenshotsDir);
let deletedCount = 0;

console.log(`🧹 Cleaning up ${items.length} items in ${screenshotsDir}...`);

items.forEach(item => {
    if (item === '.DS_Store' || item === 'vantage_points.json') return; // Double protection for vantage_points.json if it was ever there

    const fullPath = path.join(screenshotsDir, item);
    try {
        if (fs.lstatSync(fullPath).isDirectory()) {
            fs.rmSync(fullPath, { recursive: true, force: true });
        } else {
            fs.unlinkSync(fullPath);
        }
        deletedCount++;
    } catch (err) {
        console.error(`Failed to delete ${item}: ${err.message}`);
    }
});

console.log(`✅ Cleanup complete. Deleted ${deletedCount} items.`);
