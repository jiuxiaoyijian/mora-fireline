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
      "火线街区三维地图；可使用下方无障碍网格进行键盘操作",
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
      this.hover.visible = buildable(i);
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
          group.add(window);
        }
        const chimney = this.box(0.1, 0.25, 0.1, "#f4e2c4");
        chimney.position.set(0.2, 0.78, -0.12);
        group.add(chimney);
      } else if (kind === "station") {
        body = this.box(0.76, 0.54, 0.69, "#417b72");
        body.position.y = 0.32;
        const roof = this.box(0.85, 0.09, 0.8, "#e8e1c9");
        roof.position.y = 0.62;
        const door = this.box(0.4, 0.32, 0.025, "#264f4b");
        door.position.set(0, 0.23, 0.36);
        const signA = this.box(0.22, 0.05, 0.07, "#f3b757");
        signA.position.set(0, 0.7, 0);
        const signB = this.box(0.07, 0.05, 0.22, "#f3b757");
        signB.position.set(0, 0.7, 0);
        group.add(body, roof, door, signA, signB);
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
      this.halos.push(halo);
      this.flames.push(flame);
      this.bodies.push(body);
      this.groups.push(group);
      this.board.add(group);
    });
    this.coverage(this.hasCoverage);
  }
  coverage(show: boolean): void {
    this.hasCoverage = show;
    this.halos.forEach((halo, i) => {
      halo.visible =
        show &&
        buildable(i) &&
        this.layout.some(
          (kind, j) =>
            kind === "station" && distance(i, j) <= RULES.stationRadius,
        );
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
              child === this.flames[i]
            )
              return;
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
    const span = Math.max(4.1, 6.2 / aspect);
    this.camera.left = -span * aspect;
    this.camera.right = span * aspect;
    this.camera.top = span;
    this.camera.bottom = -span;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }
}
