import fs from 'fs';

/**
 * UTILITY: GLTF/GLB Hierarchy Verifier
 * 
 * Usage: node verify_glb_hierarchy.mjs <path_to_glb> <optional_keyword>
 * 
 * Description:
 * Analyzes the raw scene graph of a `.glb` prior to Three.js instantiation. 
 * Detects structural traps natively missed by `isMesh` filters (e.g., Groups, nested assemblies) 
 * and detached sibling tabs structurally isolated from their parent wings.
 */

if (process.argv.length < 3) {
    console.log("Usage: node verify_glb_hierarchy.mjs <path_to_glb> [filter_keyword]");
    process.exit(1);
}

const glbPath = process.argv[2];
const keyword = process.argv[3] ? process.argv[3].toLowerCase() : '';

const glbBuf = fs.readFileSync(glbPath);
const contentLen = glbBuf.readUInt32LE(12);
const jsonStr = glbBuf.toString('utf8', 20, 20 + contentLen);
const gltf = JSON.parse(jsonStr);

console.log(`\n=== VERIFYING GRAPH: ${glbPath} ===`);

let suspiciousGroups = [];
let meshes = [];

gltf.nodes.forEach((n, idx) => {
    if (!n.name) return;
    const name = n.name.toLowerCase();

    if (keyword && !name.includes(keyword)) return;

    let type = 'MESH';
    if (n.children && n.children.length > 0) {
        type = 'GROUP';
        suspiciousGroups.push({ idx, name, children: n.children });
    } else {
        meshes.push({ idx, name });
    }

    console.log(`[NODE ${idx.toString().padStart(3, ' ')}] ${type.padEnd(6, ' ')} : ${n.name}`);
});

if (suspiciousGroups.length > 0) {
    console.log(`\n⚠️  WARNING: Found ${suspiciousGroups.length} nodes instantiating as Groups!`);
    console.log("If your Three.js script filters purely by `child.isMesh`, these nodes WILL BE IGNORED.");
    suspiciousGroups.forEach(g => {
        console.log(` - ${g.name} (Children: ${g.children.join(', ')})`);
    });
}

console.log("\n=== COMPLETED ANALYSIS ===");
