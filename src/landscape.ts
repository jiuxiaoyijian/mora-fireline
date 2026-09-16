import * as THREE from "three";
import { batchLandscape } from "./render-batches.ts";

const material = (color: string) => new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true });
/** Scenery outside the playable hexes never participates in fire simulation. */
export function addLandscape(target: THREE.Scene): void {
  const scene = new THREE.Group();
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), material("#c8b68a"));
  sand.rotation.x = -Math.PI / 2;
  sand.position.y = -0.16;
  sand.receiveShadow = true;
  scene.add(sand);
  const ground = new THREE.CircleGeometry(9, 64);
  ground.rotateX(-Math.PI / 2);
  const positions = ground.getAttribute("position");
  for (let i = 1; i < positions.count; i++) {
    const scale = 1 + Math.sin(i * 1.7) * 0.08 + Math.cos(i * 0.7) * 0.05;
    positions.setXYZ(i, positions.getX(i) * scale, -0.09, positions.getZ(i) * scale * 0.8);
  }
  ground.computeVertexNormals();
  const meadow = new THREE.Mesh(ground, material("#9eae78"));
  meadow.receiveShadow = true;
  scene.add(meadow);
  // Faceted distant ridge, with snow caps behind the warm inhabited valley.
  for (let i = 0; i < 17; i++) {
    const height = 2.2 + (Math.sin(i * 13.4) + 1) * 2.8;
    const x = (i - 8) * 2.7, z = -11 - (i % 3) * 2;
    const mountain = new THREE.Mesh(new THREE.ConeGeometry(2.8, height, 5), material(i % 2 ? "#8eaaa3" : "#82999a"));
    mountain.position.set(x, height / 2 - 0.15, z);
    mountain.rotation.y = i * 0.7;
    scene.add(mountain);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(1.12, height * 0.4, 5), material("#e4e9df"));
    cap.position.set(x, height * 0.8 - 0.13, z);
    cap.rotation.y = mountain.rotation.y;
    scene.add(cap);
  }
  // Sandy foothills on the outer flanks, kept clear of selectable ground.
  for (let i = 0; i < 16; i++) {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.6 + (i % 3) * 0.3), material(i % 2 ? "#bca47e" : "#aa9577"));
    rock.scale.set(1.4, 0.6, 1);
    rock.position.set((i % 2 ? 1 : -1) * (7.6 + i % 4), 0.1, -6 + Math.floor(i / 2) * 1.7);
    rock.rotation.set(i * 0.2, i, 0.2);
    rock.castShadow = true;
    scene.add(rock);
  }
  for (let i = 0; i < 42; i++) {
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.09, 0.8, 5), material("#725740"));
    trunk.position.y = 0.3;
    tree.add(trunk);
    for (let tier = 0; tier < 3; tier++) {
      const crown = new THREE.Mesh(new THREE.ConeGeometry(0.42 - tier * 0.08, 0.85, 7), material(i % 3 ? "#637c52" : "#89935e"));
      crown.position.y = 0.65 + tier * 0.3;
      crown.castShadow = true;
      tree.add(crown);
    }
    const left = i < 20;
    tree.position.set(left ? -5.2 - (i % 4) * 0.55 : -5 + (i - 20) * 0.5,
      -0.04, left ? -4.7 + Math.floor(i / 4) * 1.8 : -5.3 - (i % 3) * 0.55);
    tree.scale.setScalar(0.65 + (i % 5) * 0.12);
    scene.add(tree);
  }
  batchLandscape(scene);
  target.add(scene);
}
