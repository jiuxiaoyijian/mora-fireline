import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/** Bake the immutable landscape only. Mutable buildings never enter these batches. */
export function batchLandscape(root: THREE.Group): void {
  root.updateMatrixWorld(true);
  const buckets = new Map<string, { geometries: THREE.BufferGeometry[]; material: THREE.MeshStandardMaterial; cast: boolean; receive: boolean }>();
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  root.traverse(node => {
    if (!(node instanceof THREE.Mesh) || !(node.material instanceof THREE.MeshStandardMaterial)) return;
    const mat = node.material;
    const key = `${mat.color.getHex()}/${mat.roughness}/${mat.flatShading}/${node.castShadow}/${node.receiveShadow}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { geometries: [], material: mat.clone(), cast: node.castShadow, receive: node.receiveShadow };
      buckets.set(key, bucket);
    }
    const geometry = node.geometry.index ? node.geometry.toNonIndexed() : node.geometry.clone();
    geometry.applyMatrix4(node.matrixWorld);
    bucket.geometries.push(geometry);
    geometries.add(node.geometry); materials.add(mat);
  });
  root.clear();
  for (const bucket of buckets.values()) {
    const geometry = mergeGeometries(bucket.geometries);
    if (!geometry) throw new Error("Landscape geometry attributes must match");
    const mesh = new THREE.Mesh(geometry, bucket.material);
    mesh.castShadow = bucket.cast; mesh.receiveShadow = bucket.receive;
    mesh.matrixAutoUpdate = false;
    root.add(mesh);
    bucket.geometries.forEach(g => g.dispose());
  }
  geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
}
