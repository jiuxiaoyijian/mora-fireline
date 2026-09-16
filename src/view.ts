import * as THREE from "three";
import { RULES, coords, buildable, distance } from "./sim/model.ts";
import type { Layout, Simulation } from "./sim/model.ts";

type SelectHandler = (index: number) => void;
export class GameView {
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-6, 6, 6, -6, 0.1, 100);
  private renderer: THREE.WebGLRenderer;
  private groups: THREE.Group[] = [];
  private tiles: THREE.Mesh[] = [];
  private bodies: (THREE.Mesh | null)[] = [];
  private flames: THREE.Group[] = [];
  private halos: THREE.Mesh[] = [];
  private water: THREE.Mesh[] = [];
  private previewCell = -1;
  private board = new THREE.Group();
  private routes = new THREE.Group();
  private raycaster = new THREE.Raycaster();
  private hover: THREE.Mesh;
  private layout: Layout = [];
  private hovered = -1;
  private clock = 0;
  private hasCoverage = false;
  private hasRoutes = false;
  private eventCount = -1;
  private reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)")
    .matches;
  private resizeObserver: ResizeObserver;

  constructor(
    private host: HTMLElement,
    onSelect: SelectHandler,
    onHover: SelectHandler,
  ) {
    this.scene.background = new THREE.Color("#e4e9dc");
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.setAttribute(
      "aria-label",
      "火线街区三维地图；可打开键盘建造网格进行操作",
    );
    this.host.appendChild(this.renderer.domElement);
    this.camera.position.set(10, 12, 14);
    this.camera.lookAt(0, 0, 0);
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
    const ground = this.box(200, 0.1, 200, "#e4e9dc");
    ground.position.y = -0.66;
    ground.receiveShadow = true;
    this.scene.add(ground);
    const plinth = this.box(8.5, 0.48, 8.5, "#577c6a");
    plinth.position.y = -0.31;
    plinth.receiveShadow = true;
    this.scene.add(plinth, this.board, this.routes);
    // Decorative forest sits outside the rule grid; it is never a fire obstacle.
    for (let i = 0; i < 7; i++) {
      const tree = new THREE.Group();
      const trunk = this.box(0.12, 0.55, 0.12, "#826347");
      trunk.position.y = -0.05;
      tree.add(trunk);
      for (let tier = 0; tier < 2; tier++) {
        const crown = new THREE.Mesh(
          new THREE.ConeGeometry(0.34 - tier * 0.08, 0.75, 7),
          new THREE.MeshStandardMaterial({
            color: i % 2 ? "#69816a" : "#829373",
            roughness: 1,
          }),
        );
        crown.position.y = 0.35 + tier * 0.3;
        crown.castShadow = true;
        tree.add(crown);
      }
      tree.position.set(-4.65 - (i % 2) * 0.25, 0, i - 3);
      this.scene.add(tree);
    }
    for (let i = 0; i < 8; i++) {
      this.label(String.fromCharCode(65 + i), i - 3.5, 4.6);
      this.label(String(i + 1), 4.6, i - 3.5);
    }
    this.hover = new THREE.Mesh(
      new THREE.BoxGeometry(0.97, 0.025, 0.97),
      new THREE.MeshBasicMaterial({
        color: "#f0aa49",
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
      }),
    );
    this.hover.visible = false;
    this.scene.add(this.hover);
    this.host.addEventListener("pointermove", (event) => {
      const i = this.pick(event);
      if (i !== this.hovered) {
        this.hovered = i;
        onHover(i);
      }

      if (i >= 0) {
        const { x, z } = coords(i);
        this.hover.position.set(x - 3.5, 0.085, z - 3.5);
      }
    });
    this.host.addEventListener("pointerleave", () => {
      this.hover.visible = false;
      this.hovered = -1;
      onHover(-1);
    });
    this.host.addEventListener("click", (event) => {
      const i = this.pick(event);
      if (i >= 0) onSelect(i);
    });
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
    context.fillStyle = "#657d60";
    context.font = "500 48px sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text, 48, 48);
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: new THREE.CanvasTexture(canvas),
        transparent: true,
        depthWrite: false,
      }),
    );
    sprite.position.set(x, 0.05, z);
    sprite.scale.set(0.38, 0.38, 0.38);
    this.scene.add(sprite);
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
  setLayout(layout: Layout): void {
    this.disposeObject(this.board);
    this.board.clear();
    this.layout = layout.slice();
    this.groups = [];
    this.tiles = [];
    this.bodies = [];
    this.flames = [];
    this.halos = [];
    this.water = [];
    this.previewCell = -1;
    this.hover.visible = false;
    this.clearRoutes();
    layout.forEach((kind, i) => {
      const { x, z } = coords(i);
      const group = new THREE.Group();
      group.position.set(x - 3.5, 0, z - 3.5);
      group.userData.index = i;
      const tileColor =
        kind === "stone"
          ? "#b4beb2"
          : kind === "break"
            ? "#dbccb4"
            : (x + z) % 2
              ? "#a4b888"
              : "#adbf93";
      const tile = this.box(0.965, 0.09, 0.965, tileColor);
      tile.position.y = 0;
      group.add(tile);
      this.tiles.push(tile);
      let body: THREE.Mesh | null = null;
      if (kind === "house") {
        body = this.box(0.65, 0.52, 0.61, "#f5e4c5");
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
            color: i % 3 ? "#c76845" : "#ad523c",
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
      } else if (kind === "break") {
        for (let j = 0; j < 3; j++) {
          const stripe = this.box(0.08, 0.015, 0.78, "#b6a48a");
          stripe.position.set(-0.25 + j * 0.25, 0.06, 0);
          group.add(stripe);
        }
      } else if (kind === "grass") {
        for (let j = 0; j < 3; j++) {
          const shrub = new THREE.Mesh(
            new THREE.DodecahedronGeometry(0.105 + (i % 3) * 0.015),
            new THREE.MeshStandardMaterial({
              color: x === 0 ? "#b18b42" : "#718b51",
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
        const marker = new THREE.Mesh(
          new THREE.CylinderGeometry(0.36, 0.36, 0.04, 24),
          new THREE.MeshStandardMaterial({ color: "#e37b44" }),
        );
        marker.position.y = 0.08;
        const stake = this.box(0.055, 0.58, 0.055, "#875c3e");
        stake.position.y = 0.33;
        const flag = this.box(0.3, 0.2, 0.025, "#b23e2c");
        flag.position.set(0.14, 0.55, 0);
        group.add(marker, stake, flag);
      }
      const flame = new THREE.Group();
      for (let j = 0; j < 3; j++) {
        const cone = new THREE.Mesh(
          new THREE.ConeGeometry(0.13 + j * 0.025, 0.55 + j * 0.13, 5),
          new THREE.MeshBasicMaterial({ color: j % 2 ? "#ffba4c" : "#ed6339" }),
        );
        cone.position.set((j - 1) * 0.16, 0.45 + j * 0.07, (j % 2) * 0.16);
        flame.add(cone);
      }
      flame.position.y = kind === "house" ? 0.32 : 0;
      flame.visible = false;
      group.add(flame);
      const halo = new THREE.Mesh(
        new THREE.PlaneGeometry(0.91, 0.91),
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
      this.water.push(water);
      this.halos.push(halo);
      this.flames.push(flame);
      this.bodies.push(body);
      this.groups.push(group);
      this.board.add(group);
    });
    this.coverage(this.hasCoverage);
  }
  preview(i: number, valid: boolean, station: boolean): void {
    this.hover.visible = i >= 0;
    if (i >= 0) {
      const { x, z } = coords(i);
      this.hover.position.set(x - 3.5, 0.085, z - 3.5);
      (this.hover.material as THREE.MeshBasicMaterial).color.set(
        valid ? "#efb85b" : "#d75242",
      );
    }
    this.previewCell = station && valid ? i : -1;
    this.coverage(this.hasCoverage);
  }
  coverage(show: boolean): void {
    this.hasCoverage = show;
    this.halos.forEach((halo, i) => {
      halo.visible =
        buildable(i) &&
        ((this.previewCell >= 0 &&
          distance(i, this.previewCell) <= RULES.stationRadius) ||
          (show &&
            this.layout.some(
              (kind, j) =>
                kind === "station" && distance(i, j) <= RULES.stationRadius,
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
    if (sim)
      sim.cells.forEach((cell, i) => {
        this.flames[i].visible = cell.burning;
        this.water[i].visible =
          !sim.done && cell.cooling > 0 && !cell.burning && !cell.burned;
        const pulse = this.reducedMotion
          ? 1
          : 0.92 + Math.sin(this.clock * 5 + i) * 0.08;
        this.water[i].scale.setScalar(pulse);
        if (cell.burning && !this.reducedMotion)
          this.flames[i].scale.y = 0.9 + Math.sin(this.clock * 8 + i) * 0.16;
        const body = this.bodies[i];
        if (body && cell.kind === "house") {
          const material = body.material as THREE.MeshStandardMaterial;
          material.color.set(cell.burned ? "#514f44" : "#f5e4c5");
          if (!cell.burned)
            material.color.lerp(
              new THREE.Color("#e77a38"),
              Math.min(0.85, cell.heat / 75),
            );
          // Keep the land square full-sized; only the building collapses.
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
            child.scale.y = cell.burned ? 0.2 : 1;
            child.position.y =
              child.userData.originalY * (cell.burned ? 0.2 : 1);
          });
        }
        if (cell.burned || cell.burning)
          (this.tiles[i].material as THREE.MeshStandardMaterial).color.set(
            cell.burned ? "#666354" : "#bf864b",
          );
      });
    if (sim && this.eventCount !== sim.events.length) {
      this.clearRoutes();
      for (const event of sim.events) {
        if (event.type !== "ignite" || event.source < 0) continue;
        const a = coords(event.source),
          b = coords(event.target);
        const points = [
          new THREE.Vector3(a.x - 3.5, 0.98, a.z - 3.5),
          new THREE.Vector3(b.x - 3.5, 0.98, b.z - 3.5),
        ];
        this.routes.add(
          new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(points),
            new THREE.LineBasicMaterial({
              color: "#f04c24",
              transparent: true,
              opacity: 0.85,
            }),
          ),
        );
      }
      this.eventCount = sim.events.length;
    }
    this.routes.visible = this.hasRoutes;
    this.renderer.render(this.scene, this.camera);
  }
  private pick(event: MouseEvent | PointerEvent): number {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.raycaster.setFromCamera(
      new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        (-(event.clientY - rect.top) / rect.height) * 2 + 1,
      ),
      this.camera,
    );
    const hits = this.raycaster.intersectObjects(this.groups, true);
    for (const hit of hits) {
      let node: THREE.Object3D | null = hit.object;
      while (node && node !== this.board) {
        if (typeof node.userData.index === "number") return node.userData.index;
        node = node.parent;
      }
    }
    return -1;
  }
  private resize(): void {
    const width = this.host.clientWidth,
      height = this.host.clientHeight;
    if (!width || !height) return;
    const aspect = width / height;
    // Reserve top/bottom HUD space. Fit the board, house height and edge labels,
    // never the enormous decorative ground plane, into the game safe area.
    const safe = { left: 420, top: 210, width: 1260, height: 610 };
    this.camera.updateMatrixWorld(true);
    const bounds = new THREE.Box2();
    for (const x of [-4.35, 4.95])
      for (const y of [-0.55, 1.65])
        for (const z of [-4.35, 4.95]) {
          const point = new THREE.Vector3(x, y, z).applyMatrix4(this.camera.matrixWorldInverse);
          bounds.expandByPoint(new THREE.Vector2(point.x, point.y));
        }
    const size = bounds.getSize(new THREE.Vector2());
    const center = bounds.getCenter(new THREE.Vector2());
    const span = Math.max(size.x / (aspect * 2 * safe.width / width), size.y / (2 * safe.height / height)) * 1.025;
    const centerX = center.x - (2 * (safe.left + safe.width / 2) / width - 1) * span * aspect;
    const centerY = center.y - (1 - 2 * (safe.top + safe.height / 2) / height) * span;
    this.camera.left = centerX - span * aspect;
    this.camera.right = centerX + span * aspect;
    this.camera.top = centerY + span;
    this.camera.bottom = centerY - span;
    this.camera.updateProjectionMatrix();
    const scale = this.host.getBoundingClientRect().width / width;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio * scale, 2));
    this.renderer.setSize(width, height, false);
  }
}
