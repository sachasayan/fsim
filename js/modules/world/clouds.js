import * as THREE from 'three';

export function createCloudSystem({ scene }) {
  // Realistic Procedural Cloud Texture
  const cloudCanvas = document.createElement('canvas');
  cloudCanvas.width = 128;
  cloudCanvas.height = 128;
  const cCtx = cloudCanvas.getContext('2d');
  const cGrad = cCtx.createRadialGradient(64, 64, 0, 64, 64, 64);
  cGrad.addColorStop(0, 'rgba(255,255,255,1)');
  cGrad.addColorStop(0.6, 'rgba(255,255,255,0.3)');
  cGrad.addColorStop(1, 'rgba(255,255,255,0)');
  cCtx.fillStyle = cGrad;
  cCtx.fillRect(0, 0, 128, 128);
  const realCloudTex = new THREE.CanvasTexture(cloudCanvas);

  // Clouds System (Volumetric Billboard approach)
  const cloudGeo = new THREE.PlaneGeometry(2500, 2500); // Much larger, softer clouds
  const cloudMat = new THREE.MeshBasicMaterial({
    map: realCloudTex,
    transparent: true,
    opacity: 0.15,
    depthWrite: false,
    color: 0xffffff,
    blending: THREE.AdditiveBlending
  });

  const clouds = new THREE.Group();
  for (let i = 0; i < 200; i++) {
    const mesh = new THREE.Mesh(cloudGeo, cloudMat);
    mesh.position.set((Math.random() - 0.5) * 40000, 1000 + Math.random() * 4000, (Math.random() - 0.5) * 40000);
    mesh.rotation.z = Math.random() * Math.PI;
    clouds.add(mesh);
  }

  scene.add(clouds);
  return { clouds };
}
