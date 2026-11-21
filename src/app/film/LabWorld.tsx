"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { modeAmplitude } from "./plateModel";

export interface FilmChapter {
  title: string;
  timeframe: string;
  text: string;
  camera: [number, number, number];
  target: [number, number, number];
  mode: [number, number];
  showModel: boolean;
  screen: string | null;
}

// The story describes a possible workflow, not an actual inspection.
export const chapters: FilmChapter[] = [
  { timeframe: "THE RESPONSE", title: "A pattern in motion", text: "A surface moves. Lines appear where motion falls still. This opening image is an idealized simulation—not a measurement.", camera: [1.0, 4.5, 2.8], target: [0, 1.15, 0], mode: [2, 2], showModel: true, screen: null },
  { timeframe: "BEFORE THE TEST", title: "An inspection begins", text: "Earlier, an inspector brings a workpiece to the bench and prepares to explore its response with Harmonix AR.", camera: [9, 5.5, 10], target: [-.4, 1.2, -.5], mode: [1, 1], showModel: false, screen: null },
  { timeframe: "BEFORE THE TEST", title: "Open the scanner", text: "The inspector holds the phone over the workpiece and slowly sweeps the surface. The captured scan screen shows the app's sample PCB, not a live view.", camera: [5.6, 3.9, 7.2], target: [-.8, 1.65, .5], mode: [1, 1], showModel: false, screen: "scan" },
  { timeframe: "BEFORE THE TEST", title: "Define the boundary", text: "The automated workflow advances through the scan. The captured boundary is example data; an operator must check the outline and calibration in a real inspection.", camera: [3.2, 3.4, 4.8], target: [0, 1.1, 0], mode: [1, 1], showModel: false, screen: "scan" },
  { timeframe: "BEFORE THE TEST", title: "Choose the material", text: "The guided workflow continues to material settings. This captured example selects aluminium; the separate model uses an ideal 240 × 180 × 1.6 mm plate.", camera: [-3.3, 3.6, 4.6], target: [-.2, 1.2, 0], mode: [1, 1], showModel: false, screen: "material" },
  { timeframe: "THE TEST", title: "Drive the plate", text: "The staged workflow advances to the resonance view as the plate is driven. The captured app screen and equipment are illustrative.", camera: [-4.8, 2.8, 2.3], target: [-1, 1.3, .25], mode: [2, 2], showModel: true, screen: "viewport" },
  { timeframe: "THE RESPONSE", title: "A mode emerges", text: "The film returns to the opening pattern. Its movement is slowed and exaggerated; it is not a camera measurement.", camera: [2.4, 5.2, 3.5], target: [0, 1.1, 0], mode: [2, 2], showModel: true, screen: "viewport" },
  { timeframe: "THE TEST", title: "Listen for a note", text: "The pitch screen offers a way to explore sound input. This captured screen has no microphone input and is not a measured result.", camera: [-2, 5.4, 3.1], target: [0, 1.1, 0], mode: [2, 1], showModel: true, screen: "tuner" },
  { timeframe: "THE INTERPRETATION", title: "Compare the shapes", text: "The inspector opens the vibration-shape gallery to compare modes. The screen is an example from the real app, not a diagnosis.", camera: [3.8, 4.6, -2.8], target: [0, 1.15, 0], mode: [2, 2], showModel: true, screen: "modes" },
  { timeframe: "THE INTERPRETATION", title: "A question, not a verdict", text: "A theoretical pattern can support investigation. Conclusions require calibrated measurements, a valid baseline and a qualified inspector.", camera: [5.1, 3.4, -4], target: [.7, 1.4, -.2], mode: [2, 2], showModel: true, screen: "modes" },
  { timeframe: "AFTER THE TEST", title: "Document what remains", text: "The inspector records the setup and observations, then decides whether additional testing is needed. This film does not verify a part's condition.", camera: [8, 5, 9], target: [-.3, 1.4, 0], mode: [1, 1], showModel: false, screen: null },
];

export default function LabWorld({ chapter, progress, guided, onInteract, onMarker, onError }: {
  chapter: number; progress: number; guided: boolean;
  onInteract: () => void; onMarker: (chapter: number) => void; onError: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const state = useRef({ chapter, progress, guided, onInteract, onMarker, onError });
  state.current = { chapter, progress, guided, onInteract, onMarker, onError };

  useEffect(() => {
    const node = host.current;
    if (!node) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "low-power" }); }
    catch { state.current.onError(); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
    renderer.setSize(node.clientWidth, node.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    node.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x83928f);
    scene.fog = new THREE.Fog(0x83928f, 18, 34);
    const camera = new THREE.PerspectiveCamera(43, node.clientWidth / node.clientHeight, .1, 80);
    camera.position.set(...chapters[0].camera);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(...chapters[0].target); controls.enableDamping = true; controls.dampingFactor = .08;
    controls.minDistance = .55; controls.maxDistance = 20; controls.maxPolarAngle = Math.PI * .49;
    let previous = -1, moving = true;
    const interact = () => { moving = false; if (state.current.guided) state.current.onInteract(); };
    controls.addEventListener("start", interact);
    scene.add(new THREE.HemisphereLight(0xdcebea, 0x59675c, 2.1));
    const sun = new THREE.DirectionalLight(0xffe4c2, 2.25); sun.position.set(3, 9, 6); scene.add(sun);
    const fill = new THREE.DirectionalLight(0xc2e9df, .75); fill.position.set(-6, 4, -3); scene.add(fill);

    const material = (color: number, roughness = .75, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
    const mats = {
      floor: material(0x788886), wall: material(0xb8c8c2), wallDark: material(0x617975), frame: material(0x374f50),
      black: material(0x17282b), rubber: material(0x202a2b), steel: material(0x94aaa5, .32, .7),
      aluminum: material(0xa9bbb6, .45, .65), wood: material(0x99896f), teal: material(0x148e7b, .4, .25),
      pale: material(0xe2e5d9), amber: material(0xd9a34f), shirt: material(0x416b70), pants: material(0x33474c),
      skin: material(0xb58769), gloves: material(0xd2d9d2), hair: material(0x333633),
    };
    const unitBox = new THREE.BoxGeometry(1, 1, 1);
    const unitSphere = new THREE.SphereGeometry(1, 16, 12);
    const unitCylinder = new THREE.CylinderGeometry(1, 1, 1, 16);
    function box(w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number) {
      const mesh = new THREE.Mesh(unitBox, m); mesh.scale.set(w, h, d); mesh.position.set(x, y, z); scene.add(mesh); return mesh;
    }
    function sphere(w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number) {
      const mesh = new THREE.Mesh(unitSphere, m); mesh.scale.set(w, h, d); mesh.position.set(x, y, z); scene.add(mesh); return mesh;
    }
    function cylinder(radius: number, height: number, m: THREE.Material, x: number, y: number, z: number) {
      const mesh = new THREE.Mesh(unitCylinder, m); mesh.scale.set(radius, height, radius); mesh.position.set(x, y, z); scene.add(mesh); return mesh;
    }
    function cable(points: [number, number, number][], m: THREE.Material, radius = .025) {
      const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
      const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, radius, 7, false), m); scene.add(mesh);
    }
    // Workshop architecture. The grid is a floor joint, not a measurement grid.
    box(28, .2, 25, mats.floor, 0, -.12, 0);
    const floorGrid = new THREE.GridHelper(28, 28, 0x6d7d7a, 0x71827e); floorGrid.position.y = -.015; scene.add(floorGrid);
    box(20, 7, .2, mats.wall, 0, 3.4, -7);
    box(.2, 7, 16, mats.wall, -9.9, 3.4, 1);
    for (const x of [-8,-4,0,4,8]) box(.12, 7, .1, mats.wallDark, x, 3.4, -6.85);
    box(20, .14, .25, mats.frame, 0, 5.6, -6.78);
    // Windows and skylight slats; no real-world imagery or app screens.
    for (const x of [-6, -2, 2, 6]) {
      box(3.2, 1.7, .07, mats.frame, x, 4.15, -6.82);
      box(3.04, 1.54, .035, material(0x9bbec1, .45), x, 4.15, -6.75);
      box(.06, 1.54, .04, mats.frame, x, 4.15, -6.7);
    }
    for (const x of [-5, 0, 5]) { box(3.5,.09,.55,mats.pale,x,6.3,-1.3); box(3.5,.07,.55,mats.pale,x,6.3,3.5); }
    // The inspection bench.
    box(5.5,.22,3.45,mats.wood,0,1.03,0); box(5.55,.07,3.5,mats.steel,0,1.17,0);
    for (const x of [-2.4,2.4]) for (const z of [-1.45,1.45]) { box(.16,1,.16,mats.frame,x,.5,z); box(.3,.08,.3,mats.rubber,x,.04,z); }
    for (const z of [-1.45,1.45]) box(4.8,.1,.1,mats.frame,0,.35,z);
    for (const x of [-2.55,2.55]) for (const z of [-1.55,1.55]) cylinder(.045,.015,mats.rubber,x,1.215,z);
    // Simple edge rails, not a simulation of the real fixture's mechanics.
    for (const x of [-1.25,1.25]) box(.11,.14,2.03,mats.black,x,1.24,0);
    for (const z of [-.97,.97]) box(2.5,.14,.11,mats.black,0,1.24,z);
    const geometry = new THREE.PlaneGeometry(2.4, 1.8, 32, 24);
    const positions = geometry.getAttribute("position") as THREE.BufferAttribute;
    const base = new Float32Array(positions.array as ArrayLike<number>);
    const colors = new Float32Array(positions.count * 3);
    geometry.setAttribute("color", new THREE.BufferAttribute(colors,3));
    const plate = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({vertexColors:true, roughness:.45, metalness:.35, side:THREE.DoubleSide}));
    plate.rotation.x = -Math.PI/2; plate.position.y = 1.32; scene.add(plate);
    // Actuator and cable are props. Their mass and support effects are not in the analytical plate model.
    cylinder(.27,.23,mats.black,-1.9,1.35,.58); cylinder(.18,.1,mats.steel,-1.9,1.52,.58);
    box(.52,.06,.09,mats.steel,-1.55,1.52,.58); cylinder(.035,.3,mats.steel,-1.28,1.38,.58);
    box(.85,.38,.65,mats.frame,1.85,1.43,.6); box(.69,.18,.02,mats.black,1.85,1.43,.94);
    for (let i=0;i<3;i++) cylinder(.035,.025,i===0 ? mats.teal : mats.pale,1.62+i*.18,1.63,.57);
    cable([[1.8,1.24,1],[1,1.24,1.4],[-.7,1.24,1.4],[-1.9,1.25,.9]],mats.rubber);
    // Secondary details provide a real work context, without app mockups or simulated readouts.
    box(.64,.045,.46,mats.pale,1.8,1.23,-1.25);
    for (let i=0;i<4;i++) box(.38,.003,.007,mats.frame,1.8,1.255,-1.37+i*.07);
    box(1.35,.025,.15,mats.pale,.05,1.23,-1.48);
    for(let i=0;i<14;i++) box(.008,.004,i%5===0?.1:.055,mats.frame,-.57+i*.085,1.248,-1.48);
    box(.75,.06,.52,mats.black,-2.05,1.23,-1.25); cylinder(.035,1.8,mats.steel,-2.05,2.16,-1.25);
    cylinder(.25,.15,mats.frame,-2.05,3.09,-1.25);
    for (const y of [.8,1.8,2.8]) box(3,.09,.7,mats.wood,-5.1,y,-6.35);
    for (const x of [-6.5,-3.7]) box(.1,3.1,.1,mats.frame,x,1.5,-6.35);
    for(let i=0;i<5;i++) box(.38,.35+(i%2)*.15,.4,i%2 ? mats.frame : mats.teal,-6.2+i*.5,1.04+(i%2)*.075,-6.35);
    // Industrial cabinets, spare parts and a wheeled trolley fill out the workshop.
    box(2.6,1.5,.85,mats.wallDark,5.2,.75,-6.2);
    for (const x of [4.25,5.2,6.15]) { box(.72,1.25,.04,mats.frame,x,.82,-5.75); box(.04,.22,.04,mats.steel,x+.23,.85,-5.71); }
    box(1.5,.12,.9,mats.steel,4.5,.95,2.4);
    for (const x of [3.85,5.15]) for (const z of [2.05,2.75]) { box(.08,.9,.08,mats.frame,x,.48,z); sphere(.11,.11,.11,mats.rubber,x,.1,z); }
    for(let i=0;i<3;i++) box(.9,.05,.58,mats.aluminum,4.5,1.03+i*.06,2.4);
    // Inspector: intentionally stylized, with arms moving between inspection poses.
    sphere(.4,.6,.24,mats.shirt,-1.55,2.08,2.15);
    sphere(.2,.26,.19,mats.skin,-1.55,3.0,2.1); sphere(.205,.12,.195,mats.hair,-1.55,3.17,2.1);
    box(.36,.07,.24,mats.shirt,-1.55,2.62,2.12);
    function limb(m: THREE.Material, radius: number) {
      const mesh = new THREE.Mesh(unitCylinder,m); scene.add(mesh);
      const up = new THREE.Vector3(0,1,0);
      return (a: THREE.Vector3,b: THREE.Vector3) => { const delta=b.clone().sub(a); mesh.position.copy(a).add(b).multiplyScalar(.5); mesh.scale.set(radius,delta.length(),radius); mesh.quaternion.setFromUnitVectors(up,delta.normalize()); };
    }
    const legL=limb(mats.pants,.14), legR=limb(mats.pants,.14);
    legL(new THREE.Vector3(-1.75,1.6,2.15),new THREE.Vector3(-1.8,.23,2.2)); legR(new THREE.Vector3(-1.35,1.6,2.15),new THREE.Vector3(-1.3,.23,2.2));
    sphere(.17,.09,.27,mats.black,-1.8,.1,2.08); sphere(.17,.09,.27,mats.black,-1.3,.1,2.08);
    const upperR=limb(mats.shirt,.105), lowerR=limb(mats.shirt,.09), upperL=limb(mats.shirt,.105), lowerL=limb(mats.shirt,.09);
    // Separate palms and fingers keep a consistent grip around the phone edges.
    function hand(side: number) {
      const group = new THREE.Group(); scene.add(group);
      const palm = new THREE.Mesh(unitSphere, mats.gloves); palm.scale.set(.095,.045,.115); group.add(palm);
      for (let i=0;i<4;i++) {
        const finger = new THREE.Mesh(unitSphere,mats.gloves);
        finger.scale.set(.024,.025,.073); finger.position.set(side*.035, .006, -.075+i*.048); finger.rotation.y=side*.45; group.add(finger);
      }
      const thumb = new THREE.Mesh(unitSphere,mats.gloves); thumb.scale.set(.026,.027,.073);
      thumb.position.set(-side*.055,.014,.05); thumb.rotation.y=-side*.75; group.add(thumb);
      return group;
    }
    const handR=hand(1), handL=hand(-1);
    const shoulderR=new THREE.Vector3(-1.2,2.4,2.1), shoulderL=new THREE.Vector3(-1.9,2.4,2.1);
    const elbowR=new THREE.Vector3(), elbowL=new THREE.Vector3();
    // Two-link IK gives the elbows a consistent bend as the hands move.
    function bendElbow(shoulder: THREE.Vector3, hand: THREE.Vector3, side: number, result: THREE.Vector3) {
      const direction=hand.clone().sub(shoulder), distance=direction.length();
      direction.normalize();
      const upper=.82, lower=.82, reach=Math.min(distance,upper+lower-.001);
      const along=(upper*upper-lower*lower+reach*reach)/(2*reach);
      const height=Math.sqrt(Math.max(0,upper*upper-along*along));
      const pole=new THREE.Vector3(side*.35,-1,.35);
      pole.addScaledVector(direction,-pole.dot(direction)).normalize();
      result.copy(shoulder).addScaledVector(direction,along).addScaledVector(pole,height);
    }
    // Captures come from the real app running with example data. The film does not
    // embed a live app instance or claim the images are sensor measurements.
    const phone = new THREE.Group(); scene.add(phone);
    const shell = new THREE.Mesh(new THREE.BoxGeometry(.38,.045,.78),mats.black); phone.add(shell);
    const displayMaterial = new THREE.MeshBasicMaterial({color:0x344e4a});
    const display = new THREE.Mesh(new THREE.PlaneGeometry(.342,.742),displayMaterial);
    display.rotation.x=-Math.PI/2; display.position.y=.024; phone.add(display);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(.025,.025,.008,12),mats.rubber);
    lens.position.set(-.12,-.026,-.3); phone.add(lens);
    const screenTextures=new Map<string, THREE.Texture>();
    const textureLoader=new THREE.TextureLoader(); let disposed=false; let lastScreen: string | null=null;
    for (const name of ["scan","material","viewport","tuner","modes"]) {
      textureLoader.load(`/film-screens/${name}.png`, texture => {
        if (disposed) { texture.dispose(); return; }
        texture.colorSpace=THREE.SRGBColorSpace; texture.minFilter=THREE.LinearFilter; texture.generateMipmaps=false;
        screenTextures.set(name,texture);
        if (chapters[state.current.chapter].screen===name) {displayMaterial.map=texture;displayMaterial.color.setHex(0xffffff);displayMaterial.needsUpdate=true;}
      });
    }
    const phonePosition=new THREE.Vector3(-1.35,1.95,1.4);

    // Explore markers are visible only in free-camera mode.
    const markers: THREE.Mesh[] = [];
    const markerPoints: Array<[number,number,number,number]> = [[-2.25,3.5,2.3,2],[0,1.7,0,3],[-1.9,1.9,.58,5],[.5,1.75,-.3,7],[1.85,1.9,.6,9]];
    markerPoints.forEach(([x,y,z,idx]) => { const marker=new THREE.Mesh(new THREE.SphereGeometry(.11,16,12),new THREE.MeshBasicMaterial({color:0xffdf8f})); marker.position.set(x,y,z); marker.userData.chapter=idx; scene.add(marker); markers.push(marker); });
    const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2(); let px=0,py=0;
    const down=(e:PointerEvent) => {px=e.clientX;py=e.clientY;};
    const up=(e:PointerEvent) => { if(state.current.guided || Math.hypot(e.clientX-px,e.clientY-py)>5) return; const r=renderer.domElement.getBoundingClientRect(); pointer.set((e.clientX-r.left)/r.width*2-1,-((e.clientY-r.top)/r.height)*2+1); raycaster.setFromCamera(pointer,camera); const hit=raycaster.intersectObjects(markers)[0]; if(hit) state.current.onMarker(hit.object.userData.chapter); };
    renderer.domElement.addEventListener("pointerdown",down); renderer.domElement.addEventListener("pointerup",up);
    const resize=() => { if (!node.clientWidth || !node.clientHeight) return; camera.aspect=node.clientWidth/node.clientHeight; camera.updateProjectionMatrix(); renderer.setSize(node.clientWidth,node.clientHeight); };
    const observer=new ResizeObserver(resize); observer.observe(node);
    const lost=(event:Event) => { event.preventDefault(); state.current.onError(); };
    renderer.domElement.addEventListener("webglcontextlost",lost);
    let raf=0,last=0,phase=0, lastMode="";
    const amplitudes=new Float32Array(positions.count);
    const loop=(now:number) => {
      raf=requestAnimationFrame(loop);
      if(document.hidden) { last=0; return; }
      if(now-last<1000/30) return;
      const dt=last ? Math.min((now-last)/1000,.5) : 0; last=now; phase+=dt*1.5;
      const current=state.current, c=chapters[current.chapter];
      if(previous!==current.chapter) { previous=current.chapter; moving=true; }
      if(current.guided || moving) {
        const pos=new THREE.Vector3(...c.camera), target=new THREE.Vector3(...c.target);
        if(current.guided) {
          const p=current.progress, drift=p-.5; pos.x+=drift*.65; pos.y+=drift*.12; pos.z-=drift*.25;
          if(c.screen) {
            // Move into a close-up of the physical handset, then return to the workshop.
            const blend=THREE.MathUtils.smoothstep(p,.08,.28)*(1-THREE.MathUtils.smoothstep(p,.72,.92));
            pos.lerp(phonePosition.clone().add(new THREE.Vector3(.12,1.12,.58)),blend);
            target.lerp(phonePosition,blend);
          }
        }
        const t=1-Math.exp(-dt*2.5); camera.position.lerp(pos,t); controls.target.lerp(target,t);
        if(camera.position.distanceTo(pos)<.025 && controls.target.distanceTo(target)<.025) moving=false;
      }
      controls.update();
      markers.forEach(m => {m.visible=!current.guided;});
      phone.visible=Boolean(c.screen);
      if (lastScreen !== c.screen) {
        lastScreen=c.screen; displayMaterial.map=c.screen ? screenTextures.get(c.screen) ?? null : null;
        displayMaterial.color.setHex(displayMaterial.map ? 0xffffff : 0x344e4a); displayMaterial.needsUpdate=true;
      }
      // One continuous, slow sweep over the near half of the plate across both scan chapters.
      // The lens faces down; the handset stays above the fixture and the operator keeps a two-hand grip.
      const scanning=current.chapter===2 || current.chapter===3;
      const scanProgress=(current.chapter-2+current.progress)/2;
      const sweep=THREE.MathUtils.smoothstep(THREE.MathUtils.clamp(scanProgress,0,1),0,1);
      const desiredPhone=scanning
        ? new THREE.Vector3(-1.05+.3*sweep,1.92,1.02-.16*Math.sin(sweep*Math.PI))
        : new THREE.Vector3(-1.35,1.95,1.4);
      phonePosition.lerp(desiredPhone,1-Math.exp(-dt*2)); phone.position.copy(phonePosition);
      const desiredRotation=scanning ? -.06+.12*sweep : 0;
      phone.rotation.z=THREE.MathUtils.lerp(phone.rotation.z,desiredRotation,1-Math.exp(-dt*2));
      const handPosition=c.screen ? phone.localToWorld(new THREE.Vector3(.205,-.035,.12)) : new THREE.Vector3(-1.05,1.8,1.75);
      const otherPosition=c.screen ? phone.localToWorld(new THREE.Vector3(-.205,-.035,.12)) : new THREE.Vector3(-1.85,1.8,1.75);
      handR.position.lerp(handPosition,1-Math.exp(-dt*5)); handL.position.lerp(otherPosition,1-Math.exp(-dt*5));
      handR.quaternion.slerp(c.screen ? phone.quaternion : new THREE.Quaternion(),1-Math.exp(-dt*5));
      handL.quaternion.copy(handR.quaternion);
      bendElbow(shoulderR,handR.position,1,elbowR); bendElbow(shoulderL,handL.position,-1,elbowL);
      upperR(shoulderR,elbowR); lowerR(elbowR,handR.position); upperL(shoulderL,elbowL); lowerL(elbowL,handL.position);
      const [m,n]=c.mode, modeKey=`${m},${n},${c.showModel}`;
      const modeChanged=lastMode!==modeKey;
      if(modeChanged) {
        lastMode=modeKey;
        for(let i=0;i<positions.count;i++) {
          const u=base[i*3]/2.4+.5, v=base[i*3+1]/1.8+.5;
          const amp=modeAmplitude(u,v,m,n), a=Math.abs(amp);
          amplitudes[i]=amp;
          colors[i*3]=c.showModel ? .08+a*.08 : .55;
          colors[i*3+1]=c.showModel ? .30+a*.38 : .61;
          colors[i*3+2]=c.showModel ? .27+a*.27 : .58;
        }
        geometry.getAttribute("color").needsUpdate=true;
      }
      if(c.showModel || modeChanged) {
        const displacement=c.showModel ? Math.sin(phase)*.13 : 0;
        for(let i=0;i<positions.count;i++) positions.setZ(i,amplitudes[i]*displacement);
        positions.needsUpdate=true; geometry.computeVertexNormals();
      }
      renderer.render(scene,camera);
    };
    raf=requestAnimationFrame(loop);
    return () => { disposed=true; screenTextures.forEach(t => t.dispose()); cancelAnimationFrame(raf); observer.disconnect(); controls.dispose(); renderer.domElement.removeEventListener("pointerdown",down); renderer.domElement.removeEventListener("pointerup",up); renderer.domElement.removeEventListener("webglcontextlost",lost); scene.traverse(o => { if(o instanceof THREE.Mesh) { o.geometry.dispose(); const list=Array.isArray(o.material)?o.material:[o.material]; list.forEach(m=>m.dispose()); } }); renderer.dispose(); renderer.domElement.remove(); };
  }, []);
  return <div className="film-canvas" ref={host} />;
}
