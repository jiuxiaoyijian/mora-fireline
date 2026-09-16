import * as THREE from "three";

export const shoreline = (x: number) => 5.25 + Math.sin(x * 0.43) * 0.35 + Math.cos(x * 0.91) * 0.15;
export const riverCenter = (z: number) => 6.65 + Math.sin(z * 0.48) * 0.48;

/** Unified world-space water and banks: no overlapping river strip at the estuary. */
export function addWaterscape(scene: THREE.Scene): (seconds: number) => void {
  const time = { value: 0 };
  const pixels = new Uint8Array(64 * 64 * 4);
  let seed = 1729;
  for (let i = 0; i < 64 * 64; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const value = seed >>> 24;
    pixels.set([value, value, value, 255], i * 4);
  }
  const noiseMap = new THREE.DataTexture(pixels, 64, 64);
  noiseMap.wrapS = noiseMap.wrapT = THREE.RepeatWrapping;
  noiseMap.magFilter = noiseMap.minFilter = THREE.LinearFilter;
  noiseMap.needsUpdate = true;
  const geometry = new THREE.PlaneGeometry(200, 200);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.ShaderMaterial({
    uniforms: { time, noiseMap: { value: noiseMap } }, side: THREE.DoubleSide,
    vertexShader: `varying vec2 world;
      void main(){world=position.xz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `uniform float time; varying vec2 world;
      uniform sampler2D noiseMap;
      float noise(vec2 p){return texture2D(noiseMap,(p+.5)/64.).r;}
      void main(){
        vec2 p=world;
        float coast=5.25+sin(p.x*.43)*.35+cos(p.x*.91)*.15;
        float sea=p.y-coast;
        float center=6.65+sin(p.y*.48)*.48;
        float width=.48+clamp((p.y+14.)/22.,0.,1.)*.3;
        // Gradually widen the river into an estuary, using the same water field.
        width+=smoothstep(2.8,6.5,p.y)*.65;
        float river=min(width-abs(p.x-center),p.y+14.);
        float d=max(sea,river);
        float grain=noise(p*3.6);
        float bank=.32+noise(p*1.4)*.14;
        if(d < -bank) discard;
        vec3 dry=vec3(.58,.51,.32), wet=vec3(.37,.40,.29);
        vec3 shallow=vec3(.20,.43,.39), deep=vec3(.055,.23,.27);
        float ocean=smoothstep(-.3,2.,sea);
        float depth=mix(smoothstep(0.,.8,d)*.38,smoothstep(0.,7.,d),ocean);
        vec3 color=mix(shallow,deep,depth);
        float swell=noise(p*.75+vec2(time*.045,-time*.06));
        color+= (swell-.5)*.035;
        // Broken foam fronts advance shoreward, fading in and out instead of solid stripes.
        float cycle=fract(time*.16+noise(vec2(p.x*.18,0.))*.18);
        float front=(1.-cycle)*1.65;
        float distortion=(noise(p*2.+time*.07)-.5)*.28;
        float crest=1.-smoothstep(.025,.11,abs(d-front+distortion));
        float fragments=smoothstep(.38,.65,noise(p*4.+vec2(time*.11,0.)));
        float foam=crest*fragments*sin(cycle*3.14159)*smoothstep(-.1,.6,sea);
        float edge=(1.-smoothstep(.015,.13,abs(d-.025))) * smoothstep(.38,.7,grain)*.55;
        // Quiet, elongated current glints replace the diagonal ladder pattern.
        vec2 current=vec2((p.x-center)*7.,p.y*1.3-time*.35);
        float glint=smoothstep(.77,.87,noise(current))*smoothstep(.08,.3,d);
        color=mix(color,vec3(.68,.79,.68),clamp(foam*.72+edge+glint*.10*(1.-ocean),0.,.8));
        float wash=.025+sin(time*.9+p.x*.3)*.035;
        vec3 beach=mix(wet,dry,(1.-smoothstep(-bank,-.08,d)));
        beach+=(grain-.5)*.025;
        color=mix(beach,color,smoothstep(-.045+wash,.07+wash,d));
        gl_FragColor=vec4(color,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = -.035;
  mesh.updateMatrix();
  mesh.matrixAutoUpdate = false;
  mesh.name = "coastal-surf-and-snowmelt";
  scene.add(mesh);
  return seconds => { time.value = seconds; };
}
