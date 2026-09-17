import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { GameView } from "../src/view.ts";
import { addLandscape } from "../src/landscape.ts";
import { defaultLayout, editLayout, index, createSimulation } from "../src/sim/model.ts";
import { summarize } from "../src/performance.ts";
import { addWaterscape, shoreline, riverCenter } from "../src/waterscape.ts";
import { updateRenderSize } from "../src/render-size.ts";
import { FireFeedback } from "../src/fire-feedback.ts";
import { LEVELS } from "../src/sim/levels.ts";
import { step } from "../src/sim/model.ts";

// Exercise real scene construction without a WebGL context. FPS is tested in browser.
function sceneHarness() {
  const view = Object.create(GameView.prototype) as GameView;
  const groups: THREE.Group[] = [];
  const board = new THREE.Group();
  Object.assign(view, { groups, board, routes: new THREE.Group(), ghost: new THREE.Group(),
    hover: new THREE.Mesh(), layout: [], tiles: [], bodies: [], flames: [], halos: [], water: [], spray: [],
    lastSimulation: null, hasCoverage: false, renderer: { shadowMap: {} } });
  return { view, groups, board };
}

test("five construction edits preserve untouched scene objects and release replaced geometry", () => {
  const { view, groups } = sceneHarness();
  let layout = defaultLayout(); view.setLayout(layout);
  for (const z of [1, 2, 4, 5, 6]) {
    const i = index(1, z), before = groups.slice();
    let disposed = 0;
    const tile = before[i].children[0] as THREE.Mesh;
    tile.geometry.addEventListener("dispose", () => disposed++);
    layout = editLayout(layout, i, "break").layout; view.setLayout(layout);
    assert.equal(disposed, 1);
    assert.equal(groups.filter((group, cell) => group !== before[cell]).length, 1);
    assert.equal(groups.length, 64);
  }
  const before = groups.slice(); view.setLayout(layout);
  assert.ok(groups.every((group, i) => group === before[i]), "unchanged build layout must allocate no new cell models");
});

test("leaving a simulation restores state without reallocating unchanged models", () => {
  const { view, groups } = sceneHarness();
  const layout = defaultLayout(); view.setLayout(layout);
  const before = groups.slice();
  const tile = groups[11].children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  tile.material.color.set("#000000");
  Object.assign(view, { lastSimulation: createSimulation(layout) });
  view.setLayout(layout);
  assert.equal(groups.filter((group, i) => group !== before[i]).length, 0);
  assert.equal(tile.material.color.getHexString(), "9eae78");
});

test("distant landscape stays within 24 static render batches", () => {
  const scene = new THREE.Scene(); addLandscape(scene);
  let meshes = 0, vertices = 0;
  scene.traverse(node => { if (node instanceof THREE.Mesh) {
    meshes++; vertices += node.geometry.getAttribute("position").count;
    assert.equal(node.matrixAutoUpdate, false);
  } });
  assert.ok(meshes > 0 && meshes <= 24, `landscape batches: ${meshes}`);
  assert.ok(vertices > 1000, "batching must preserve scenery, not remove it");
});

test("performance report keeps long frames and uses correct nearest-rank p95", () => {
  const samples = Array.from({ length: 100 }, (_, i) => ({ interval: i < 90 ? 16 : 80, cpu: 4, calls: 100, triangles: 500, geometries: 20 }));
  const report = summarize(samples);
  assert.equal(report.frameP95, 80);
  assert.equal(report.slowFrames, 10);
  assert.equal(report.cpuP95, 4);
  assert.equal(report.samples, 100);
});

test("water animation retains one unified mesh and fixed geometry across 600 frames", () => {
  const scene = new THREE.Scene();
  const update = addWaterscape(scene);
  const meshes = scene.children as THREE.Mesh[];
  const geometry = meshes.map(mesh => mesh.geometry);
  for (let frame = 0; frame < 600; frame++) update(frame / 60);
  assert.equal(scene.children.length, 1);
  meshes.forEach((mesh, i) => assert.equal(mesh.geometry, geometry[i]));
  assert.ok(8 > shoreline(riverCenter(8)), "river mouth must overlap the sea");
  for (let x = -4.5; x <= 4.5; x += .5) assert.ok(shoreline(x) > 4, "sea must stay outside playable hexes");
});

test("campaign threat and ember feedback reuses bounded geometry over repeated complete runs", () => {
  const feedback = new FireFeedback();
  const pool = feedback.group.children[2] as THREE.InstancedMesh;
  const instances = pool.instanceMatrix;
  const markerGeometry = pool.geometry;
  const positions = feedback.geometry.getAttribute("position");
  const colors = feedback.geometry.getAttribute("color");
  let visible = false;
  for (let run = 0; run < 3; run++) {
    const sim = createSimulation(LEVELS[7].layout, LEVELS[7]);
    while (!sim.done) {
      step(sim); feedback.update(sim); feedback.animate(.1, false);
      visible ||= feedback.geometry.drawRange.count > 0;
      assert.equal(feedback.geometry.getAttribute("position"), positions);
      assert.equal(feedback.geometry.getAttribute("color"), colors);
      assert.ok(feedback.geometry.drawRange.count <= positions.count);
      assert.equal(feedback.group.children.length, 3);
    }
  }
  assert.equal(visible, true);
  feedback.update(null);
  assert.equal(feedback.geometry.drawRange.count, 0);
  assert.equal(pool.count, 0);
});


test("eight-level rock and decoration batches keep visible board submissions under 100", () => {
  const { view, board } = sceneHarness();
  view.setScenario(LEVELS[7]); view.setLayout(LEVELS[7].layout);
  let meshes = 0, vertices = 0;
  board.traverseVisible(node => { if (node instanceof THREE.Mesh) { meshes++; vertices += node.geometry.getAttribute("position").count; } });
  assert.ok(meshes < 100, `visible board meshes: ${meshes}`);
  assert.ok(vertices > 7000, "batching must retain terrain and house geometry");
});

test("camera movement does not resize the GPU buffer; viewport and quality changes still do", () => {
  let resizes = 0, ratios = 0, ratio = 1;
  const renderer = { domElement: { width:1280, height:720 }, getPixelRatio: () => ratio,
    setPixelRatio: (next: number) => { ratio = next; ratios++; },
    setSize: (width: number, height: number) => { resizes++; renderer.domElement.width = width * ratio; renderer.domElement.height = height * ratio; } };
  for (let i=0;i<240;i++) updateRenderSize(renderer,1280,720,1);
  assert.equal(resizes,0); assert.equal(ratios,0);
  updateRenderSize(renderer,844,390,1);
  assert.equal(resizes,1);
  updateRenderSize(renderer,844,390,1.5);
  assert.equal(resizes,2); assert.equal(ratios,1);
  updateRenderSize(renderer,844,390,1.5);
  assert.equal(resizes,2); assert.equal(ratios,1);
});

test("hovering inside the same cell reuses the sprinkler ghost", () => {
  const { view, board } = sceneHarness();
  view.setLayout(defaultLayout());
  const ghost = new THREE.Group();
  Object.assign(view, { ghost });
  board.add(ghost);
  view.preview(9, true, true, "station");
  const shape = ghost.children[0] as THREE.Mesh;
  let disposed = 0;
  shape.geometry.addEventListener("dispose", () => disposed++);
  for (let i=0;i<120;i++) view.preview(9, true, true, "station");
  assert.equal(ghost.children[0], shape); assert.equal(disposed,0);
  view.preview(10, true, true, "station");
  assert.equal(disposed,1);
});
