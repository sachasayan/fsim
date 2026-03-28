// @ts-check

import * as THREE from 'three';

export function buildRoadNetworkGraph(roads) {
    if (!roads || roads.length === 0) return { nodes: [], edges: [] };

    // 1. Identify all unique points and their connection degree
    const pointMap = new Map();
    const getPointKey = (x, z) => `${Math.round(x)},${Math.round(z)}`;

    for (const road of roads) {
        if (!road.points || road.points.length < 2) continue;
        for (let i = 0; i < road.points.length; i++) {
            const [x, z] = road.points[i];
            const key = getPointKey(x, z);
            
            // Endpoints add 1 to degree. Internal points add 2 (pass-through).
            // But if multiple roads share an endpoint, it adds up.
            const isEnd = (i === 0 || i === road.points.length - 1);
            if (!pointMap.has(key)) {
                pointMap.set(key, { coords: [x, z], degree: 0, isEnd: false });
            }
            const nodeInfo = pointMap.get(key);
            nodeInfo.degree += isEnd ? 1 : 2;
            if (isEnd) nodeInfo.isEnd = true;
        }
    }

    // A node is a graph Node if it is an intersection (degree > 2) or a dead end (degree === 1)
    // or an explicitly shared endpoint of two roads (say, two roads meeting end-to-end, degree = 2, but isEnd = true for both)
    const keyNodes = new Map();
    let nodeIdCounter = 0;

    for (const [key, info] of pointMap.entries()) {
        if (info.degree !== 2 || info.isEnd) {
            keyNodes.set(key, {
                id: `node_${nodeIdCounter++}`,
                x: info.coords[0],
                z: info.coords[1],
                connections: [] // will populate with edges
            });
        }
    }

    const graph = { nodes: Array.from(keyNodes.values()), edges: [] };
    const MAX_SEG_LEN = 2.0;

    function subdividePoints(points) {
        const cleaned = [];
        for (let i = 0; i < points.length; i++) {
            const pt = points[i];
            if (cleaned.length > 0) {
                const lastPoint = cleaned[cleaned.length - 1];
                if (lastPoint[0] === pt[0] && lastPoint[1] === pt[1]) continue;
                
                const dx = pt[0] - lastPoint[0];
                const dz = pt[1] - lastPoint[1];
                const dist = Math.hypot(dx, dz);
                
                if (dist > MAX_SEG_LEN) {
                    const segments = Math.ceil(dist / MAX_SEG_LEN);
                    for (let s = 1; s <= segments; s++) {
                        const t = s / segments;
                        cleaned.push([lastPoint[0] + dx * t, lastPoint[1] + dz * t]);
                    }
                    continue;
                }
            }
            cleaned.push([pt[0], pt[1]]);
        }
        return cleaned;
    }

    let edgeIdCounter = 0;

    // 2. Extract edges between key nodes
    for (const road of roads) {
        if (!road.points || road.points.length < 2) continue;
        
        let currentEdgePoints = [];
        let startNode = null;
        
        for (let i = 0; i < road.points.length; i++) {
            const pt = road.points[i];
            const key = getPointKey(pt[0], pt[1]);
            currentEdgePoints.push(pt);
            
            if (keyNodes.has(key)) {
                const node = keyNodes.get(key);
                
                if (startNode === null) {
                    // Start of a new edge
                    startNode = node;
                } else {
                    // End of the current edge
                    if (currentEdgePoints.length >= 2) {
                        const edgeId = `edge_${edgeIdCounter++}`;
                        const points = subdividePoints(currentEdgePoints);
                        
                        const edge = {
                            id: edgeId,
                            startNodeId: startNode.id,
                            endNodeId: node.id,
                            baseRoad: road,
                            points: points,
                            width: road.width || 24
                        };
                        graph.edges.push(edge);
                        
                        startNode.connections.push({ edgeId, otherNodeId: node.id, isStart: true });
                        node.connections.push({ edgeId, otherNodeId: startNode.id, isStart: false });
                    }
                    
                    // The end of this edge might be the start of the next piece of this road
                    currentEdgePoints = [pt];
                    startNode = node;
                }
            }
        }
    }

    return graph;
}

export function generateRoadNetworkGeometries(graph, sampler, yOffset = 0.35) {
    const surfacePositions = [];
    const surfaceIndices = [];
    const surfaceColors = [];
    let surfaceVertexBase = 0;

    // Default color logic or map based on kind?
    const defaultColor = new THREE.Color(0x3a3a3a); 

    // Helper to add quad
    function addQuad(p1, p2, p3, p4, color, isIntersection = false) {
        const y1 = sampler.getAltitudeAt(p1[0], p1[1]) + yOffset;
        const y2 = sampler.getAltitudeAt(p2[0], p2[1]) + yOffset;
        let y3 = y2;
        let y4 = y1;
        if (p3 && p4) {
             y3 = sampler.getAltitudeAt(p3[0], p3[1]) + yOffset;
             y4 = sampler.getAltitudeAt(p4[0], p4[1]) + yOffset;
        } else {
            // triangles if p4 is undefined
            y3 = sampler.getAltitudeAt(p3[0], p3[1]) + yOffset;
        }
        
        const base = surfaceVertexBase;
        
        surfacePositions.push(p1[0], y1, p1[1]);
        surfacePositions.push(p2[0], y2, p2[1]);
        surfacePositions.push(p3[0], y3, p3[1]);
        
        surfaceColors.push(color.r, color.g, color.b);
        surfaceColors.push(color.r, color.g, color.b);
        surfaceColors.push(color.r, color.g, color.b);

        if (p4) {
            surfacePositions.push(p4[0], y4, p4[1]);
            surfaceColors.push(color.r, color.g, color.b);
            surfaceIndices.push(base, base + 1, base + 2, base, base + 2, base + 3);
            surfaceVertexBase += 4;
        } else {
            surfaceIndices.push(base, base + 1, base + 2);
            surfaceVertexBase += 3;
        }
    }

    // 1. Process Edges (Segments)
    // To handle intersections, we shrink the the start/end of the geometry slightly 
    // by half the width of the road, so they don't overlap in the center of the node.
    const nodeRadii = new Map();
    for (const node of graph.nodes) {
        // Find max width among connected edges to serve as intersection radius
        let maxW = 0;
        for (const conn of node.connections) {
            const edge = graph.edges.find(e => e.id === conn.edgeId);
            if (edge && edge.width > maxW) maxW = edge.width;
        }
        nodeRadii.set(node.id, maxW * 0.5);
    }

    // Store edge corner points for intersection building later
    const edgeEnds = new Map(); 

    for (const edge of graph.edges) {
        const pts = edge.points;
        if (pts.length < 2) continue;
        
        const startRad = nodeRadii.get(edge.startNodeId) || 0;
        const endRad = nodeRadii.get(edge.endNodeId) || 0;
        
        // Find safe indices that are outside the intersection radius
        let startIndex = 0;
        let startDist = 0;
        while (startIndex < pts.length - 2) {
            startDist = Math.hypot(pts[startIndex][0] - pts[0][0], pts[startIndex][1] - pts[0][1]);
            if (startDist >= startRad * 0.8) break; 
            startIndex++;
        }
        
        let endIndex = pts.length - 1;
        let endDist = 0;
        const lastPt = pts[pts.length - 1];
        while (endIndex > startIndex + 1) {
            endDist = Math.hypot(pts[endIndex][0] - lastPt[0], pts[endIndex][1] - lastPt[1]);
            if (endDist >= endRad * 0.8) break;
            endIndex--;
        }

        // Add segment geometry
        let prevLeft = null;
        let prevRight = null;
        
        for (let i = startIndex; i <= endIndex; i++) {
            const p = pts[i];
            const prev = i > 0 ? pts[i - 1] : p;
            const next = i < pts.length - 1 ? pts[i + 1] : p;
            
            let dx = next[0] - prev[0];
            let dz = next[1] - prev[1];
            let len = Math.hypot(dx, dz);
            
            if (len < 1e-3) {
                 // fallback if same point
                 if (i > 0) {
                     dx = p[0] - pts[0][0];
                     dz = p[1] - pts[0][1];
                 }
                 len = Math.hypot(dx, dz) || 1;
            }
            
            const nx = -dz / len;
            const nz = dx / len;
            const halfWidth = edge.width * 0.5;
            
            const left = [p[0] + nx * halfWidth, p[1] + nz * halfWidth];
            const right = [p[0] - nx * halfWidth, p[1] - nz * halfWidth];
            
            if (prevLeft && prevRight) {
                addQuad(prevLeft, left, right, prevRight, defaultColor);
            }
            
            prevLeft = left;
            prevRight = right;
            
            if (i === startIndex) {
                if (!edgeEnds.has(edge.startNodeId)) edgeEnds.set(edge.startNodeId, []);
                // Store angle relative to node to sort clockwise later
                const angle = Math.atan2(p[1] - pts[0][1], p[0] - pts[0][0]);
                edgeEnds.get(edge.startNodeId).push({ left, right, angle, isStart: true });
            }
            if (i === endIndex) {
                if (!edgeEnds.has(edge.endNodeId)) edgeEnds.set(edge.endNodeId, []);
                const angle = Math.atan2(p[1] - lastPt[1], p[0] - lastPt[0]);
                // swapped left/right for end node perspective
                edgeEnds.get(edge.endNodeId).push({ left: right, right: left, angle, isStart: false });
            }
        }
    }

    // 2. Process Intersections
    for (const [nodeId, ends] of edgeEnds.entries()) {
        const node = graph.nodes.find(n => n.id === nodeId);
        if (!node || ends.length < 2) continue;
        
        // Sort incoming segments clockwise around the node
        ends.sort((a, b) => a.angle - b.angle);
        
        const centerParams = [node.x, node.z];
        
        for (let i = 0; i < ends.length; i++) {
            const curr = ends[i];
            const next = ends[(i + 1) % ends.length];
            
            // Fill gap between current edge's right corner and next edge's left corner
            // using the node center to form a triangle
            addQuad(centerParams, curr.right, next.left, undefined, defaultColor, true);
        }
    }

    if (surfacePositions.length < 9) return null;

    const surfaceGeometry = new THREE.BufferGeometry();
    surfaceGeometry.setAttribute('position', new THREE.Float32BufferAttribute(surfacePositions, 3));
    surfaceGeometry.setAttribute('color', new THREE.Float32BufferAttribute(surfaceColors, 3));
    surfaceGeometry.setIndex(surfaceIndices);
    surfaceGeometry.computeVertexNormals();

    return { surfaceGeometry };
}
