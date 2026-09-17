import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { GameView } from "../src/view.ts";
import { addLandscape } from "../src/landscape.ts";
import { defaultLayout, editLayout, index, createSimulation } from "../src/sim/model.ts";
import { summarize } from "../src/performance.ts";
import { addWaterscape, shoreline, riverCenter } from "../src/waterscape.ts";
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

test("leaving a simulation resets all cell models, even with unchanged layout", () => {
  const { view, groups } = sceneHarness();
  const layout = defaultLayout(); view.setLayout(layout);
  const before = groups.slice();
  Object.assign(view, { lastSimulation: createSimulation(layout) });
  view.setLayout(layout);
  assert.equal(groups.filter((group, i) => group !== before[i]).length, 64);
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
      assert.equal(feedback.group.children.length, 2);
    }
  }
  assert.equal(visible, true);
  feedback.update(null);
  assert.equal(feedback.geometry.drawRange.count, 0);
});
