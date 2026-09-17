import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/** Bake colors and local transforms, retaining dynamic bodies/windows as separate meshes. */
export function mergeColoredMeshes(root: THREE.Object3D, meshes: THREE.Mesh[], basic = false): THREE.Mesh | null {
  if (!meshes.length) return null;
  root.updateMatrixWorld(true);
  const inverse = root.matrixWorld.clone().invert();
  const geometries = meshes.map(mesh => {
    const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld));
    geometry.deleteAttribute("uv");
    const color = (mesh.material as THREE.MeshStandardMaterial).color;
    const colors = new Float32Array(geometry.getAttribute("position").count * 3);
    for (let i = 0; i < colors.length; i += 3) { colors[i] = color.r; colors[i + 1] = color.g; colors[i + 2] = color.b; }
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return geometry;
  });
  const geometry = mergeGeometries(geometries);
  geometries.forEach(g => g.dispose());
  if (!geometry) throw new Error("Board geometry attributes must match");
  const material = basic ? new THREE.MeshBasicMaterial({ vertexColors: true }) : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .95 });
  const merged = new THREE.Mesh(geometry, material);
  merged.castShadow = meshes.some(m => m.castShadow);
  merged.receiveShadow = meshes.some(m => m.receiveShadow);
  return merged;
}

export function batchDecorations(root: THREE.Group, excluded: THREE.Object3D[], basic = false): void {
  const meshes: THREE.Mesh[] = [];
  root.traverse(node => {
    if (node instanceof THREE.Mesh && !excluded.includes(node) && !node.userData.window
      && !Array.isArray(node.material) && !node.material.transparent
      && (basic ? node.material instanceof THREE.MeshBasicMaterial : node.material instanceof THREE.MeshStandardMaterial)) meshes.push(node);
  });
  const merged = mergeColoredMeshes(root, meshes, basic);
  if (!merged) return;
  for (const mesh of meshes) { mesh.removeFromParent(); mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); }
  root.add(merged);
}
