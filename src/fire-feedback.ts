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
  constructor() {
    this.geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute("color", new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setDrawRange(0, 0);
    const lines = new THREE.LineSegments(this.geometry, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: .95, depthTest: false }));
    lines.frustumCulled = false;
    lines.renderOrder = 3;
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.visible = false;
    this.group.add(lines, this.ring);
  }
  private line(ax: number, ay: number, az: number, bx: number, by: number, bz: number, color: THREE.Color): void {
    if (this.used + 2 > 4096) return;
    this.positions.set([ax, ay, az, bx, by, bz], this.used * 3);
    for (let j = 0; j < 2; j++) this.colors.set([color.r, color.g, color.b], (this.used + j) * 3);
    this.used += 2;
  }
  update(sim: Simulation | null): void {
    this.used = 0;
    if (sim && !sim.done) {
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
        const color = sim.cells[ember.target].wet ? this.blue : this.orange;
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
