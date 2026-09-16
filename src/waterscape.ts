import * as THREE from "three";

export const shoreline = (x: number) => 5.25 + Math.sin(x * 0.43) * 0.35 + Math.cos(x * 0.91) * 0.15;
export const riverCenter = (z: number) => 6.65 + Math.sin(z * 0.48) * 0.48;

/** Two persistent meshes; animation only changes one uniform, never allocates geometry. */
export function addWaterscape(scene: THREE.Scene): (seconds: number) => void {
  const time = { value: 0 };
  function ribbon(sea: boolean) {
    const positions: number[] = [], uv: number[] = [], indices: number[] = [];
    const segments = sea ? 400 : 96;
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      if (sea) {
        const x = -100 + t * 200, edge = shoreline(x);
        positions.push(x, -0.045, edge, x, -0.045, 100);
        uv.push(x, 0, x, 100 - edge);
      } else {
        const z = -14 + t * 22, x = riverCenter(z), width = 0.48 + t * 0.3;
        positions.push(x - width, -0.035, z, x + width, -0.035, z);
        uv.push(0, z, 1, z);
      }
      if (i < segments) { const a = i * 2; indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geometry.setIndex(indices);
    const material = new THREE.ShaderMaterial({
      uniforms: { time, sea: { value: sea ? 1 : 0 } }, side: THREE.DoubleSide,
      vertexShader: `varying vec2 vUv;
        void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `uniform float time; uniform float sea; varying vec2 vUv;
        void main(){
          float d = sea > .5 ? vUv.y : min(vUv.x,1.-vUv.x)*2.;
          vec3 shallow=vec3(.27,.65,.66), deep=vec3(.10,.37,.48);
          vec3 color=mix(shallow,deep,smoothstep(0.,sea>.5?8.:.9,d));
          float foam;
          if(sea>.5){
            float surge=.65+.38*sin(time*1.2+vUv.x*.16);
            float wave=sin(d*7.+time*2.2+sin(vUv.x*1.8)*.4);
            foam=smoothstep(.88,1.,wave)*(1.-smoothstep(.2,2.5,d));
            foam+= (1.-smoothstep(.025,.12,abs(d-surge)))*.55;
          }else{
            float flow=sin(vUv.y*8.-time*3.+vUv.x*17.);
            foam=smoothstep(.93,1.,flow)*.12 + (1.-smoothstep(.01,.09,d))*.4;
          }
          color=mix(color,vec3(.88,.96,.88),clamp(foam,0.,.85));
          gl_FragColor=vec4(color,1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = sea ? "coastal-surf" : "snowmelt-river";
    mesh.matrixAutoUpdate = false;
    scene.add(mesh);
  }
  ribbon(true); ribbon(false);
  return seconds => { time.value = seconds; };
}
