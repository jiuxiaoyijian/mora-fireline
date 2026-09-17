import * as THREE from "three";
import { hexPosition } from "./sim/hex.ts";
import type { Simulation } from "./sim/model.ts";

// One bounded buffer for ground threats, stopped edges, ember arcs and landing rings.
// Updated at simulation ticks, not recreated on every animation frame.
export class FireFeedback {
  readonly group = new THREE.Group();
  readonly geometry = new THREE.BufferGeometry();
  private positions = new Float32Array(4096 * 3);
  private colors = new Float32Array(4096 * 3);
  private used = 0;
  private orange = new THREE.Color("#e77826");
  private green = new THREE.Color("#279370");
  private blue = new THREE.Color("#38b9db");
  private ring = new THREE.Mesh(new THREE.RingGeometry(.38, .46, 24), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: .9, depthWrite: false, side: THREE.DoubleSide }));
  private remaining = 0;
  private markers = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 6, 4), new THREE.MeshBasicMaterial({ color: "#ffffff", depthTest: false }), 128);
  private transform = new THREE.Object3D();
  private amber = new THREE.Color("#eab653");
  private marker(x: number, y: number, z: number, color: THREE.Color, scale = .11): void {
    const i = this.markers.count;
    if (i >= 128) return;
    this.transform.position.set(x, y, z);
    this.transform.scale.set(scale, scale * 1.8, scale);
    this.transform.updateMatrix();
    this.markers.setMatrixAt(i, this.transform.matrix);
    this.markers.setColorAt(i, color);
    this.markers.count++;
  }
  constructor() {
    this.geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute("color", new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setDrawRange(0, 0);
    const lines = new THREE.LineSegments(this.geometry, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: .95, depthTest: false }));
    lines.frustumCulled = false;
    lines.renderOrder = 3;
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.visible = false;
    this.markers.count = 0;
    this.markers.frustumCulled = false;
    this.markers.renderOrder = 4;
    this.group.add(lines, this.ring, this.markers);
  }
  private line(ax: number, ay: number, az: number, bx: number, by: number, bz: number, color: THREE.Color): void {
    if (this.used + 2 > 4096) return;
    this.positions.set([ax, ay, az, bx, by, bz], this.used * 3);
    for (let j = 0; j < 2; j++) this.colors.set([color.r, color.g, color.b], (this.used + j) * 3);
    this.used += 2;
  }
  update(sim: Simulation | null): void {
    this.used = 0;
    this.markers.count = 0;
    if (sim && !sim.done) {
      sim.cells.forEach((cell, i) => {
        if (cell.kind !== "house" || cell.burned || cell.burning || (!cell.wet && !sim.supplies.some(supply => supply.covered.includes(i)))) return;
        const p = hexPosition(i), color = cell.wet ? this.blue : this.amber;
        this.marker(p.x, 1.55, p.z, color, .14);
        // Roof-height streams remain legible above building silhouettes.
        for (const side of [-1, 1]) {
          this.line(p.x + side * .32, 1.35, p.z, p.x + side * .44, .85, p.z, color);
          this.line(p.x, 1.75, p.z, p.x + side * .13, 1.48, p.z, color);
        }
      });
      for (const event of sim.events.slice(-24)) {
        if ((event.type !== "ember-block" && event.type !== "ember-hit") || sim.tick - event.tick > 5) continue;
        const p = hexPosition(event.target), color = event.type === "ember-block" ? this.blue : this.orange;
        const radius = .2 + (sim.tick - event.tick) * .1;
        for (let j = 0; j < 8; j++) {
          const a = j * Math.PI / 4;
          this.line(p.x + Math.cos(a) * radius, 1.3, p.z + Math.sin(a) * radius,
            p.x + Math.cos(a) * (radius + .2), 1.55, p.z + Math.sin(a) * (radius + .2), color);
        }
      }
      for (const threat of sim.threats) {
        const a = hexPosition(threat.source), b = hexPosition(threat.target);
        const end = threat.blocked ? .5 : .8;
        this.line(a.x, .17, a.z, a.x + (b.x - a.x) * end, .17, a.z + (b.z - a.z) * end, threat.blocked ? this.green : this.orange);
        if (threat.blocked) {
          const x = (a.x + b.x) / 2, z = (a.z + b.z) / 2;
          const dx = (b.z - a.z) * .24, dz = (b.x - a.x) * .24;
          this.line(x - dx, .2, z + dz, x + dx, .2, z - dz, this.green);
        }
      }
      for (const ember of sim.embers) {
        const a = hexPosition(ember.source), b = hexPosition(ember.target);
        const progress = (sim.tick - ember.launched) / (ember.lands - ember.launched);
        const color = this.orange;
        this.marker(a.x + (b.x-a.x)*progress, .7 + Math.sin(progress*Math.PI)*1.5, a.z+(b.z-a.z)*progress, color);
        this.marker(a.x + (b.x-a.x)*Math.max(0, progress-.08), .7 + Math.sin(Math.max(0, progress-.08)*Math.PI)*1.5, a.z+(b.z-a.z)*Math.max(0, progress-.08), color, .055);
        for (let j = 0; j < 16; j++) {
          const t = j / 16, u = (j + 1) / 16;
          if (u < progress) continue;
          this.line(a.x + (b.x-a.x)*t, .7 + Math.sin(t*Math.PI)*1.5, a.z+(b.z-a.z)*t, a.x+(b.x-a.x)*u, .7+Math.sin(u*Math.PI)*1.5, a.z+(b.z-a.z)*u, color);
        }
        for (let j = 0; j < 24; j++) {
          const a = j * Math.PI / 12, c = (j+1)*Math.PI/12, radius = .5 + (1-progress)*.25;
          this.line(b.x+Math.cos(a)*radius, 1.03, b.z+Math.sin(a)*radius, b.x+Math.cos(c)*radius, 1.03, b.z+Math.sin(c)*radius, color);
        }
      }
    }
    this.markers.instanceMatrix.needsUpdate = true;
    if (this.markers.instanceColor) this.markers.instanceColor.needsUpdate = true;
    this.geometry.setDrawRange(0, this.used);
    this.geometry.getAttribute("position").needsUpdate = true;
    this.geometry.getAttribute("color").needsUpdate = true;
  }
  click(i: number, valid: boolean): void {
    const p = hexPosition(i);
    this.ring.position.set(p.x, .21, p.z);
    this.ring.material.color.set(valid ? "#68c5b0" : "#df543b");
    this.remaining = .6;
  }
  animate(elapsed: number, reducedMotion: boolean): void {
    this.remaining = Math.max(0, this.remaining - elapsed);
    this.ring.visible = this.remaining > 0;
    this.ring.scale.setScalar(reducedMotion ? 1 : 1 + (.6 - this.remaining) * .8);
    this.ring.material.opacity = this.remaining / .6;
  }
}
