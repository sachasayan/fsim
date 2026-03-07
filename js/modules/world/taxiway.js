import * as THREE from 'three';

export function createTaxiwaySystem({ scene, renderer, getTerrainHeight }) {
    const taxiwayGroup = new THREE.Group();

    function createTaxiwayTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');

        // Asphalt base
        ctx.fillStyle = '#3c4149';
        ctx.fillRect(0, 0, 128, 512);

        // Noise
        for (let i = 0; i < 2000; i++) {
            ctx.fillStyle = Math.random() > 0.5 ? '#4a515a' : '#2e343c';
            ctx.fillRect(Math.random() * 128, Math.random() * 512, 1, 1);
        }

        // Yellow centerline
        ctx.fillStyle = '#f1c40f';
        ctx.fillRect(62, 0, 4, 512);

        const tex = new THREE.CanvasTexture(canvas);
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
        tex.colorSpace = THREE.SRGBColorSpace;
        return tex;
    }

    const taxiwayTex = createTaxiwayTexture();
    const taxiwayMat = new THREE.MeshStandardMaterial({
        map: taxiwayTex,
        roughness: 0.9,
        metalness: 0.0,
        envMapIntensity: 0.3
    });

    function createTaxiwayFromSpline(points, width = 20) {
        const curve = new THREE.CatmullRomCurve3(points);
        const segments = 40;
        const curvePoints = curve.getPoints(segments);

        // Generate geometry manually to follow the curve and keep it flat
        const vertices = [];
        const uvs = [];
        const indices = [];

        for (let i = 0; i <= segments; i++) {
            const p = curvePoints[i];
            const t = curve.getUtoTmapping(i / segments);
            const tangent = curve.getTangentAt(t).normalize();
            const normal = new THREE.Vector3(0, 1, 0); // Always up
            const side = new THREE.Vector3().crossVectors(tangent, normal).normalize();

            const left = p.clone().add(side.clone().multiplyScalar(width / 2));
            const right = p.clone().add(side.clone().multiplyScalar(-width / 2));

            // Sample terrain height at each point
            const tyL = getTerrainHeight(left.x, left.z) + 0.16;
            const tyR = getTerrainHeight(right.x, right.z) + 0.16;

            vertices.push(left.x, tyL, left.z);
            vertices.push(right.x, tyR, right.z);

            uvs.push(0, i * 2); // V tiles along the length
            uvs.push(1, i * 2);
        }

        for (let i = 0; i < segments; i++) {
            const i2 = i * 2;
            indices.push(i2, i2 + 1, i2 + 2);
            indices.push(i2 + 1, i2 + 3, i2 + 2);
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geo.setIndex(indices);
        geo.computeVertexNormals();

        const mesh = new THREE.Mesh(geo, taxiwayMat);
        mesh.receiveShadow = true;
        taxiwayGroup.add(mesh);
        return mesh;
    }

    // Taxiway 1: South Runway to Apron
    createTaxiwayFromSpline([
        new THREE.Vector3(0, 0, 1800),
        new THREE.Vector3(-80, 0, 1400),
        new THREE.Vector3(-190, 0, -200)
    ]);

    // Taxiway 2: North Runway to Apron
    createTaxiwayFromSpline([
        new THREE.Vector3(0, 0, -1800),
        new THREE.Vector3(-80, 0, -1400),
        new THREE.Vector3(-190, 0, -400)
    ]);

    scene.add(taxiwayGroup);

    function updateLOD(cameraPos, dist) {
        if (dist > 25000) {
            taxiwayGroup.visible = false;
        } else {
            taxiwayGroup.visible = true;
        }
    }

    return { taxiwayGroup, updateLOD, position: new THREE.Vector3(-100, 0, 0) };
}
