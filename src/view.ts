import * as THREE from "three";
import { batchDecorations, mergeColoredMeshes } from "./board-batches.ts";
import { FireFeedback } from "./fire-feedback.ts";
import { updateRenderSize } from "./render-size.ts";
import { PointerGesture } from "./input/gesture.ts";
import type { Point } from "./input/gesture.ts";
import { sprinklerRules, buildable, distance } from "./sim/model.ts";
import { HEX_RADIUS, hexPosition } from "./sim/hex.ts";
import { addLandscape } from "./landscape.ts";
import { addWaterscape } from "./waterscape.ts";
import { performanceRecorder } from "./performance.ts";
import type { Layout, Simulation, Tool, Scenario } from "./sim/model.ts";

type SelectHandler = (index: number) => void;
export class GameView {
  private scenario?: Scenario;
  private rockBatch?: THREE.Mesh;
  private previewKey = "";
  private fireFeedback = new FireFeedback();
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.1, 160);
  private zoomLevel = 1;
  private pitch = 50;
  private azimuth = 25;
  private guides = new THREE.Group();
  private hasGuides = false;
  private ghost = new THREE.Group();
  private renderer: THREE.WebGLRenderer;
  private groups: THREE.Group[] = [];
  private tiles: THREE.Mesh[] = [];
  private bodies: (THREE.Mesh | null)[] = [];
  private flames: THREE.Group[] = [];
  private halos: THREE.Mesh[] = [];
  private water: THREE.Mesh[] = [];
  private spray: (THREE.Group | null)[] = [];
  private previewCell = -1;
  private board = new THREE.Group();
  private routes = new THREE.Group();
  private raycaster = new THREE.Raycaster();
  private hover: THREE.Mesh;
  private layout: Layout = [];
  private hovered = -1;
  private clock = 0;
  private animateWater: (seconds: number) => void = () => {};
  private hasCoverage = false;
  private hasRoutes = false;
  private eventCount = -1;
  private lastSimulation: Simulation | null = null;
  private lastTick = -1;
  private heatColor = new THREE.Color("#e77a38");
  private pickables: THREE.Object3D[] = [];
  private performanceQuality = false;
  private reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)")
    .matches;
  private resizeObserver: ResizeObserver;
  private host: HTMLElement;

  constructor(
    host: HTMLElement,
    onSelect: SelectHandler,
    onHover: SelectHandler,
  ) {
    this.host = host;
    this.scene.background = new THREE.Color("#cfdfdf");
    this.scene.fog = new THREE.Fog("#cfdfdf", 32, 70);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.setAttribute(
      "aria-label",
      "火线街区三维地图；可打开键盘建造网格进行操作",
    );
    this.host.appendChild(this.renderer.domElement);
    this.scene.add(new THREE.HemisphereLight("#fff7e8", "#5e8275", 2.6));
    const sun = new THREE.DirectionalLight("#fff4dc", 3.3);
    sun.position.set(-5, 12, 7);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, {
      left: -9,
      right: 9,
      top: 9,
      bottom: -9,
    });
    sun.shadow.bias = -0.001;
    this.scene.add(sun);
    addLandscape(this.scene);
    this.animateWater = addWaterscape(this.scene);
    this.scene.add(this.board, this.routes, this.guides, this.ghost, this.fireFeedback.group);
    this.guides.visible = false;
    for (let i = 0; i < 64; i++) {
      const p = hexPosition(i);
      const points = Array.from({ length: 7 }, (_, n) => {
        const angle = Math.PI / 6 + n * Math.PI / 3;
        return new THREE.Vector3(p.x + Math.cos(angle) * HEX_RADIUS, 0.075, p.z + Math.sin(angle) * HEX_RADIUS);
      });
      this.guides.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),
        new THREE.LineBasicMaterial({ color: "#526c50", transparent: true, opacity: 0.45 })));
      this.label(`${String.fromCharCode(65 + i % 8)}${Math.floor(i / 8) + 1}`, p.x, p.z + 0.37);
    }
    this.hover = new THREE.Mesh(
      new THREE.CylinderGeometry(HEX_RADIUS, HEX_RADIUS, 0.025, 6),
      new THREE.MeshBasicMaterial({
        color: "#f0aa49",
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
      }),
    );
    this.hover.visible = false;
    this.scene.add(this.hover);
    let drag: PointerGesture | null = null;
    const point = (event: PointerEvent): Point => ({ x: event.clientX, y: event.clientY });
    const applyStroke = (points: Point[]) => {
      for (const p of points) {
        // Captured pointers still travel over the HUD: never paint behind controls.
        const target = document.elementFromPoint(p.x, p.y);
        if (!target || !this.host.contains(target)) continue;
        const i = this.pick({ clientX: p.x, clientY: p.y });
        if (buildable(i) && drag?.visit(i)) onSelect(i);
      }
    };
    const cancel = () => {
      const id = drag?.pointerId;
      drag = null;
      if (id !== undefined && this.host.hasPointerCapture(id)) this.host.releasePointerCapture(id);
    };
    this.host.addEventListener("pointerdown", (event) => {
      if (drag || !event.isPrimary || (event.button !== 0 && event.button !== 2)) return;
      if (event.button === 0 && this.host.closest<HTMLElement>("[data-phase]")?.dataset.phase !== "build") return;
      const mode = event.button === 2 ? "orbit" : this.host.dataset.activeTool === "break" ? "paint" : "tap";
      drag = new PointerGesture(event.pointerId, mode, point(event));
      this.host.setPointerCapture(event.pointerId);
    });
    this.host.addEventListener("pointermove", (event) => {
      if (!event.isPrimary || (drag && drag.pointerId !== event.pointerId)) return;
      if (drag) {
        const movement = drag.move(event.pointerId, point(event));
        if (movement.dx || movement.dy) {
          this.azimuth -= movement.dx * 0.25;
          this.pitch = THREE.MathUtils.clamp(this.pitch + movement.dy * 0.2, 30, 70);
          this.resize();
          return;
        }
        applyStroke(movement.points);
      }
      const i = this.pick(event);
      if (i !== this.hovered) { this.hovered = i; onHover(i); }
      if (i >= 0) {
        const { x, z } = hexPosition(i);
        this.hover.position.set(x, 0.085, z);
      }
    });
    this.host.addEventListener("pointerleave", () => {
      this.hover.visible = false;
      this.ghost.visible = false;
      this.hovered = -1;
      onHover(-1);
    });
    this.host.addEventListener("pointerup", (event) => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      applyStroke(drag.end(event.pointerId, point(event)));
      cancel();
    });
    this.host.addEventListener("pointercancel", event => { if (drag?.pointerId === event.pointerId) cancel(); });
    this.host.addEventListener("lostpointercapture", event => { if (drag?.pointerId === event.pointerId) drag = null; });
    this.host.addEventListener("cancel-gesture", cancel);
    window.addEventListener("blur", cancel);
    this.host.addEventListener("wheel", (event) => {
      event.preventDefault();
      this.adjustCamera(event.deltaY < 0 ? "in" : "out");
    }, { passive: false });
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    window.addEventListener("stage-resize", () => this.resize());
    this.resize();
  }

  private box(x: number, y: number, z: number, color: string): THREE.Mesh {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(x, y, z),
      new THREE.MeshStandardMaterial({ color, roughness: 0.85 }),
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }
  private label(text: string, x: number, z: number): void {
    const canvas = document.createElement("canvas");
    canvas.width = 96;
    canvas.height = 96;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#253b2d";
    context.font = "700 42px sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text, 48, 48);
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: new THREE.CanvasTexture(canvas),
        transparent: true,
        depthWrite: false,
        depthTest: false,
      }),
    );
    sprite.position.set(x, 0.16, z);
    sprite.renderOrder = 2;
    sprite.scale.set(0.38, 0.38, 0.38);
    this.guides.add(sprite);
  }
  private disposeObject(object: THREE.Object3D): void {
    object.traverse((child) => {
      if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
        child.geometry.dispose();
        const materials = Array.isArray(child.material)
          ? child.material
          : [child.material];
        materials.forEach((material: THREE.Material) => material.dispose());
      }
    });
  }
  setScenario(scenario: Scenario): void {
    this.scenario = scenario;
    this.layout = []; // Same kind can have different house material in the next level.
  }
  feedback(i: number, valid: boolean): void { this.fireFeedback.click(i, valid); }
  setLayout(layout: Layout): void {
    const started = performance.now();
    const oldLayout = this.layout;
    const reset = this.lastSimulation !== null;
    this.lastSimulation = null;
    this.lastTick = -1;
    this.layout = layout.slice();
    this.previewCell = -1;
    this.previewKey = "";
    this.hover.visible = false;
    this.ghost.visible = false;
    this.clearRoutes();
    this.fireFeedback?.update(null);
    const rocksChanged = !this.rockBatch || layout.some((kind, i) => (kind === "stone" || oldLayout[i] === "stone") && kind !== oldLayout[i]);
    layout.forEach((kind, i) => {
      if (oldLayout[i] === kind) {
        if (reset) {
          const body = this.bodies[i];
          if (body && kind === "house") (body.material as THREE.MeshStandardMaterial).color.set(this.scenario?.houseTypes[i] === "brick" ? "#b5b9b4" : "#f5e4c5");
          (this.tiles[i].material as THREE.MeshStandardMaterial).color.set(kind === "stone" ? "#aaa894" : kind === "break" ? "#dbccb4" : "#9eae78");
          this.flames[i].visible = kind === "source" && !this.scenario?.sourceStarts?.[i];
          this.water[i].visible = false;
          if (this.spray[i]) this.spray[i]!.visible = false;
          this.groups[i].userData.burned = false;
          this.groups[i].traverse(child => {
            if (child.userData.originalY !== undefined) child.position.y = child.userData.originalY;
            if (child.userData.originalScaleY !== undefined) child.scale.y = child.userData.originalScaleY;
            if (child.userData.window && child instanceof THREE.Mesh) {
              const mat = child.material as THREE.MeshStandardMaterial;
              mat.color.set("#456960"); mat.emissive.set("#000000");
            }
          });
        }
        return;
      }
      if (this.groups[i]) {
        this.disposeObject(this.groups[i]);
        this.board.remove(this.groups[i]);
      }
      const { x, z } = hexPosition(i);
      const group = new THREE.Group();
      group.position.set(x, 0, z);
      group.userData.index = i;
      const tileColor =
        kind === "stone"
          ? "#aaa894"
          : kind === "break"
            ? "#dbccb4"
            : "#9eae78";
      const tile = new THREE.Mesh(new THREE.CylinderGeometry(HEX_RADIUS + 0.002, HEX_RADIUS + 0.002, 0.06, 6),
        new THREE.MeshStandardMaterial({ color: tileColor, roughness: 1 }));
      tile.receiveShadow = true;
      tile.position.y = 0;
      group.add(tile);
      this.tiles[i] = tile;
      let body: THREE.Mesh | null = null;
      let spray: THREE.Group | null = null;
      if (kind === "house") {
        body = this.box(0.65, 0.52, 0.61, this.scenario?.houseTypes[i] === "brick" ? "#b5b9b4" : "#f5e4c5");
        body.position.y = 0.31;
        group.add(body);
        const foundation = this.box(0.72, 0.12, 0.68, "#9b9d8e");
        foundation.position.y = 0.11;
        group.add(foundation);
        for (const side of [-0.29, 0.29]) {
          const beam = this.box(0.045, 0.48, 0.035, "#8b6348");
          beam.position.set(side, 0.34, 0.321);
          group.add(beam);
        }
        const door = this.box(0.11, 0.24, 0.03, "#805d45");
        door.position.set(0, 0.25, 0.324);
        group.add(door);
        const porch = this.box(0.24, 0.06, 0.12, "#bab29b");
        porch.position.set(0, 0.08, 0.37);
        group.add(porch);
        const roof = new THREE.Mesh(
          new THREE.CylinderGeometry(0, 0.52, 0.34, 4),
          new THREE.MeshStandardMaterial({
            color: this.scenario ? (this.scenario.houseTypes[i] === "brick" ? "#546b7e" : "#ac6241") : ["#a9583c", "#677b70", "#b38a50", "#9e5547"][i % 4],
            roughness: 0.9,
          }),
        );
        roof.rotation.y = Math.PI / 4;
        roof.position.y = 0.74;
        roof.castShadow = true;
        group.add(roof);
        for (const offset of [-0.17, 0.17]) {
          const window = this.box(0.13, 0.17, 0.025, "#456960");
          window.position.set(offset, 0.36, 0.317);
          window.userData.window = true;
          group.add(window);
        }
        const chimney = this.box(0.1, 0.25, 0.1, "#f4e2c4");
        chimney.position.set(0.2, 0.78, -0.12);
        group.add(chimney);
      } else if (kind === "station") {
        body = this.box(0.66, 0.24, 0.62, "#9b9d8e");
        body.position.y = 0.18;
        const tank = new THREE.Mesh(
          new THREE.CylinderGeometry(0.24, 0.24, 0.48, 12),
          new THREE.MeshStandardMaterial({ color: "#417b72", roughness: 0.7 }),
        );
        tank.position.set(0, 0.52, -0.03);
        const rim = this.box(0.54, 0.06, 0.51, "#d9e2d1");
        rim.position.y = 0.78;
        const pipe = this.box(0.055, 0.4, 0.055, "#d2be89");
        pipe.position.set(0.23, 0.75, 0.19);
        const nozzle = this.box(0.24, 0.055, 0.055, "#d2be89");
        nozzle.position.set(0.15, 0.95, 0.19);
        group.add(body, tank, rim, pipe, nozzle);
        spray = new THREE.Group();
        for (let j = 0; j < 6; j++) {
          const angle = j * Math.PI / 3;
          const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0.15, 0.95, 0.19),
            new THREE.Vector3(Math.cos(angle) * 0.7, 1.25, Math.sin(angle) * 0.7),
            new THREE.Vector3(Math.cos(angle) * 1.2, 0.12, Math.sin(angle) * 1.2));
          spray.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(10)),
            new THREE.LineBasicMaterial({ color: "#9ce4e8", transparent: true, opacity: 0.65 })));
        }
        spray.visible = false;
        group.add(spray);
      } else if (kind === "break") {
        for (let j = 0; j < 5; j++) {
          const pebble = new THREE.Mesh(new THREE.DodecahedronGeometry(0.025 + j * 0.005),
            new THREE.MeshStandardMaterial({ color: "#a89779", roughness: 1 }));
          pebble.position.set(Math.sin(i + j * 2) * 0.35, 0.045, Math.cos(i * 2 + j) * 0.36);
          group.add(pebble);
        }
      } else if (kind === "grass") {
        for (let j = 0; j < 3; j++) {
          const shrub = new THREE.Mesh(
            new THREE.DodecahedronGeometry(0.105 + (i % 3) * 0.015),
            new THREE.MeshStandardMaterial({
              color: i % 8 === 0 ? "#b18b42" : "#718b51",
              roughness: 1,
            }),
          );
          shrub.position.set(
            -0.24 + j * 0.22,
            0.15,
            (((j + i) % 3) - 1) * 0.23,
          );
          group.add(shrub);
        }
      } else if (kind === "source") {
        for (let j = 0; j < 3; j++) {
          const trunk = this.box(0.09, 0.55 + j * 0.15, 0.09, "#493f30");
          trunk.position.set((j - 1) * 0.25, 0.3, (j % 2) * 0.2);
          trunk.rotation.z = (j - 1) * 0.2;
          group.add(trunk);
          const smoke = new THREE.Mesh(new THREE.DodecahedronGeometry(0.2 + j * 0.09),
            new THREE.MeshStandardMaterial({ color: "#828379", transparent: true, opacity: 0.45, depthWrite: false }));
          smoke.position.set(0.15 + j * 0.14, 0.9 + j * 0.42, 0);
          group.add(smoke);
        }
      } else if (kind === "stone") {
        for (let j = 0; j < 2; j++) {
          const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.17 + (i % 3) * 0.04),
            new THREE.MeshStandardMaterial({ color: i % 2 ? "#999b88" : "#b2b09c", roughness: 1 }));
          rock.position.set((j - 0.5) * 0.42, 0.09, Math.sin(i + j) * 0.16);
          rock.scale.y = 0.5;
          group.add(rock);
        }
      }
      // Vary the home within its own footprint; the hex itself remains aligned.
      if (kind === "house") {
        const home = new THREE.Group();
        for (const child of [...group.children]) if (child !== tile) home.add(child);
        home.rotation.y = ((i % 3) - 1) * 0.16;
        home.position.set(Math.sin(i * 3) * 0.065, 0, Math.cos(i * 2) * 0.045);
        home.scale.setScalar(0.88 + (i % 3) * 0.05);
        batchDecorations(home, body ? [body] : []);
        group.add(home);
        const path = this.box(0.17, 0.008, 0.2, "#c6ba91");
        path.position.set(home.position.x, 0.035, 0.47);
        group.add(path);
      }
      if (kind !== "house" && kind !== "stone") batchDecorations(group, [tile, ...(body ? [body] : [])]);
      const flame = new THREE.Group();
      for (let j = 0; j < 3; j++) {
        const cone = new THREE.Mesh(
          new THREE.ConeGeometry(0.13 + j * 0.025, 0.55 + j * 0.13, 5),
          new THREE.MeshBasicMaterial({ color: j % 2 ? "#ffba4c" : "#ed6339" }),
        );
        cone.position.set((j - 1) * 0.16, 0.45 + j * 0.07, (j % 2) * 0.16);
        flame.add(cone);
      }
      batchDecorations(flame, [], true);
      flame.position.y = kind === "house" ? 0.32 : 0;
      flame.visible = kind === "source" && !this.scenario?.sourceStarts?.[i];
      group.add(flame);
      const halo = new THREE.Mesh(
        new THREE.CircleGeometry(HEX_RADIUS * 0.96, 6, Math.PI / 6),
        new THREE.MeshBasicMaterial({
          color: "#3bbaab",
          opacity: 0.27,
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      halo.rotation.x = -Math.PI / 2;
      halo.position.y = 0.055;
      halo.visible = false;
      group.add(halo);
      const water = new THREE.Mesh(
        new THREE.RingGeometry(0.34, 0.4, 16),
        new THREE.MeshBasicMaterial({
          color: "#65d5e5",
          transparent: true,
          opacity: 0.8,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      water.rotation.x = -Math.PI / 2;
      water.position.y = 0.13;
      water.visible = false;
      group.add(water);
      this.water[i] = water;
      this.spray[i] = spray;
      this.halos[i] = halo;
      this.flames[i] = flame;
      this.bodies[i] = body;
      this.groups[i] = group;
      this.board.add(group);
    });
    // Immutable rock cells (terrain + pebbles) share one draw call per level.
    if (rocksChanged) {
      if (this.rockBatch) { this.disposeObject(this.rockBatch); this.board.remove(this.rockBatch); }
      const rocks: THREE.Mesh[] = [];
      this.groups.forEach((group, i) => {
        if (layout[i] !== "stone") return;
        group.traverse(node => { if (node instanceof THREE.Mesh && node.material instanceof THREE.MeshStandardMaterial) rocks.push(node); });
        group.visible = false;
      });
      this.rockBatch = mergeColoredMeshes(this.board, rocks) ?? undefined;
      if (this.rockBatch) this.board.add(this.rockBatch);
    }
    this.coverage(this.hasCoverage);
    this.pickables = [...this.tiles, ...this.bodies.filter((body): body is THREE.Mesh => body !== null)];
    this.renderer.shadowMap.needsUpdate = true;
    performanceRecorder.layout(performance.now() - started);
  }
  metrics() { return { calls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles, geometries: this.renderer.info.memory.geometries }; }
  preview(i: number, valid: boolean, station: boolean, tool: Tool = "break"): void {
    const key = `${i}/${valid}/${station}/${tool}`;
    if (this.previewKey === key) return;
    this.previewKey = key;
    this.hover.visible = i >= 0;
    if (i >= 0) {
      const { x, z } = hexPosition(i);
      this.hover.position.set(x, 0.085, z);
      (this.hover.material as THREE.MeshBasicMaterial).color.set(
        valid ? "#efb85b" : "#d75242",
      );
    }
    this.disposeObject(this.ghost);
    this.ghost.clear();
    this.ghost.visible = i >= 0 && valid && (tool === "house" || tool === "station") && this.layout[i] === "grass";
    if (this.ghost.visible) {
      this.ghost.position.copy(this.hover.position);
      const shape = new THREE.Mesh(tool === "house" ? new THREE.BoxGeometry(0.65, 0.55, 0.6) : new THREE.CylinderGeometry(0.25, 0.25, 0.8, 12),
        new THREE.MeshBasicMaterial({ color: "#f4df91", transparent: true, opacity: 0.48, wireframe: true }));
      shape.position.y = 0.32;
      this.ghost.add(shape);
    }
    this.previewCell = station && valid ? i : -1;
    this.coverage(this.hasCoverage);
  }
  coverage(show: boolean): void {
    this.hasCoverage = show;
    this.halos.forEach((halo, i) => {
      halo.visible =
        (buildable(i) || this.layout[i] === "house") &&
        ((this.previewCell >= 0 &&
          distance(i, this.previewCell) <= sprinklerRules(this.scenario).radius) ||
          (show &&
            this.layout.some(
              (kind, j) =>
                kind === "station" && distance(i, j) <= sprinklerRules(this.scenario).radius,
            )));
    });
  }
  showRoutes(show: boolean): void {
    this.hasRoutes = show;
    this.routes.visible = show;
  }
  private clearRoutes(): void {
    this.disposeObject(this.routes);
    this.routes.clear();
    this.eventCount = -1;
  }
  update(sim: Simulation | null, elapsed: number): void {
    this.clock += elapsed;
    this.animateWater(this.reducedMotion ? 0 : this.clock);
    const stateChanged = sim !== this.lastSimulation || (sim?.tick ?? -1) !== this.lastTick;
    if (stateChanged) this.fireFeedback?.update(sim);
    this.fireFeedback?.animate(elapsed, this.reducedMotion);
    this.lastSimulation = sim;
    this.lastTick = sim?.tick ?? -1;
    if (sim)
      sim.cells.forEach((cell, i) => {
        const spray = this.spray[i];
        if (spray) {
          if (stateChanged) spray.visible = !sim.done && !!sim.supplies.find(supply => supply.cell === i)?.covered.some(j => sim.cells[j].cooling > 0);
          if (!this.reducedMotion) spray.rotation.y = this.clock * 0.4;
        }
        if (stateChanged) this.flames[i].visible = cell.burning;
        if (stateChanged) this.water[i].visible =
          !sim.done && (cell.cooling > 0 || cell.wet) && !cell.burning && !cell.burned;
        if (stateChanged) (this.water[i].material as THREE.MeshBasicMaterial).color.set(cell.kind === "house" && !cell.wet ? "#d9a854" : "#65d5e5");
        const pulse = this.reducedMotion
          ? 1
          : 0.92 + Math.sin(this.clock * 5 + i) * 0.08;
        if (this.water[i].visible) this.water[i].scale.setScalar(pulse);
        if (cell.burning && !this.reducedMotion)
          this.flames[i].scale.y = 0.9 + Math.sin(this.clock * 8 + i) * 0.16;
        const body = this.bodies[i];
        if (stateChanged && body && cell.kind === "house") {
          if (this.groups[i].userData.burned !== cell.burned) {
            this.groups[i].userData.burned = cell.burned;
            this.renderer.shadowMap.needsUpdate = true;
          }
          const material = body.material as THREE.MeshStandardMaterial;
          material.color.set(cell.burned ? "#514f44" : this.scenario?.houseTypes[i] === "brick" ? "#b5b9b4" : "#f5e4c5");
          if (!cell.burned)
            material.color.lerp(
              this.heatColor,
              Math.min(0.85, cell.heat / cell.threshold),
            );
          this.groups[i].traverse((child) => {
            if (child.userData.window && child instanceof THREE.Mesh) {
              const material = child.material as THREE.MeshStandardMaterial;
              const lit = sim.done && !cell.burning && !cell.burned;
              material.color.set(lit ? "#ffd386" : "#456960");
              material.emissive.set(lit ? "#b87424" : "#000000");
            }
          });
          // Keep terrain full-sized; only the building collapses.
          this.groups[i].children.forEach((child) => {
            if (
              child === this.tiles[i] ||
              child === this.halos[i] ||
              child === this.flames[i] ||
              child === this.water[i]
            )
              return;
            if (child.userData.window && child instanceof THREE.Mesh) {
              const mat = child.material as THREE.MeshStandardMaterial;
              const lit = sim.done && !cell.burning && !cell.burned;
              mat.color.set(lit ? "#ffd386" : "#456960");
              mat.emissive.set(lit ? "#b87424" : "#000000");
            }
            child.userData.originalY ??= child.position.y;
            child.userData.originalScaleY ??= child.scale.y;
            child.scale.y = child.userData.originalScaleY * (cell.burned ? 0.2 : 1);
            child.position.y =
              child.userData.originalY * (cell.burned ? 0.2 : 1);
          });
        }
        if (stateChanged && (cell.burned || cell.burning))
          (this.tiles[i].material as THREE.MeshStandardMaterial).color.set(
            cell.burned ? "#666354" : "#bf864b",
          );
      });
    if (sim && this.hasRoutes && this.eventCount !== sim.events.length) {
      this.clearRoutes();
      const points: THREE.Vector3[] = [];
      for (const event of sim.events) {
        if (event.type !== "ignite" || event.source < 0) continue;
        const a = hexPosition(event.source),
          b = hexPosition(event.target);
        points.push(
          new THREE.Vector3(a.x, 0.98, a.z),
          new THREE.Vector3(b.x, 0.98, b.z),
        );
      }
      if (points.length) this.routes.add(
          new THREE.LineSegments(
            new THREE.BufferGeometry().setFromPoints(points),
            new THREE.LineBasicMaterial({
              color: "#f04c24",
              transparent: true,
              opacity: 0.85,
            }),
          ),
        );
      this.eventCount = sim.events.length;
    }
    this.routes.visible = this.hasRoutes;
    this.renderer.render(this.scene, this.camera);
  }
  private pick(event: { clientX: number; clientY: number }): number {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.raycaster.setFromCamera(
      new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        (-(event.clientY - rect.top) / rect.height) * 2 + 1,
      ),
      this.camera,
    );
    const hits = this.raycaster.intersectObjects(this.pickables, false);
    for (const hit of hits) {
      let node: THREE.Object3D | null = hit.object;
      while (node && node !== this.board) {
        if (typeof node.userData.index === "number") return node.userData.index;
        node = node.parent;
      }
    }
    return -1;
  }
  showGuides(show: boolean): void {
    this.hasGuides = show;
    this.guides.visible = show;
  }
  adjustCamera(action: "in" | "out" | "up" | "down" | "reset"): void {
    if (action === "reset") { this.zoomLevel = 1; this.pitch = 50; this.azimuth = 25; }
    if (action === "in") this.zoomLevel = Math.min(1.65, this.zoomLevel + 0.1);
    if (action === "out") this.zoomLevel = Math.max(0.7, this.zoomLevel - 0.1);
    if (action === "up") this.pitch = Math.min(70, this.pitch + 8);
    if (action === "down") this.pitch = Math.max(30, this.pitch - 8);
    this.hover.visible = false;
    this.ghost.visible = false;
    this.hovered = -1;
    this.resize();
  }
  setPerformanceQuality(enabled: boolean): void {
    this.performanceQuality = enabled;
    this.renderer.shadowMap.enabled = !enabled;
    this.renderer.shadowMap.needsUpdate = true;
    this.resize();
  }
  private resize(): void {
    const width = this.host.clientWidth, height = this.host.clientHeight;
    if (!width || !height) return;
    const pitch = THREE.MathUtils.degToRad(this.pitch);
    const yaw = THREE.MathUtils.degToRad(this.azimuth);
    const distance = 21.5 / this.zoomLevel * Math.max(1, 0.95 / (width / height));
    this.camera.position.set(Math.sin(yaw) * Math.cos(pitch) * distance,
      Math.sin(pitch) * distance, Math.cos(yaw) * Math.cos(pitch) * distance);
    this.camera.lookAt(0, 0.1, 0);
    this.camera.aspect = width / height;
    this.camera.setViewOffset(width, height, -width * 0.045, height * 0.02, width, height);
    this.camera.updateProjectionMatrix();
    this.guides.visible = this.hasGuides;
    const scale = this.host.getBoundingClientRect().width / width;
    const pixelRatio = Math.min(window.devicePixelRatio, this.performanceQuality ? 1 : 1.5) * scale;
    updateRenderSize(this.renderer, width, height, pixelRatio);
  }
}
