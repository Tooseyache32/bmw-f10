import * as THREE from '../vendor/engine/three.module.js';

export function createEngineScene(canvas, options = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.3;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(33, 1, .1, 100);
  const root = new THREE.Group();
  scene.add(root);
  const materials = {
    silver: new THREE.MeshStandardMaterial({ color: 0xc8cece, metalness: .91, roughness: .25 }),
    bright: new THREE.MeshStandardMaterial({ color: 0xe1e4df, metalness: .88, roughness: .19 }),
    cast: new THREE.MeshStandardMaterial({ color: 0x636e75, metalness: .76, roughness: .43 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x252b30, metalness: .64, roughness: .37 }),
    black: new THREE.MeshStandardMaterial({ color: 0x0d1115, metalness: .35, roughness: .5 }),
    red: new THREE.MeshStandardMaterial({ color: 0xb72d25, metalness: .48, roughness: .34 }),
    stripe: new THREE.MeshStandardMaterial({ color: 0xf26553, metalness: .4, roughness: .29 }),
    sleeve: new THREE.MeshStandardMaterial({ color: 0x647278, metalness: .92, roughness: .27, side: THREE.DoubleSide })
  };
  const hemisphere = new THREE.HemisphereLight(0xe1e9ed, 0x343238, 2.3);
  scene.add(hemisphere);
  const key = new THREE.DirectionalLight(0xfff5e3, 4.5);
  key.position.set(-3, 7, 6);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xb5d0e6, 2.2);
  fill.position.set(5, 2, -4);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffffff, 3.2);
  rim.position.set(-5, 1, -1);
  scene.add(rim);

  const environmentScene = new THREE.Scene();
  environmentScene.background = new THREE.Color(0x3b4148);
  const panelGeometry = new THREE.PlaneGeometry(1, 1);
  const panelMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.2, 2.1), side: THREE.DoubleSide });
  [[0, 7, 0, 10, 4], [-6, 1, 4, 3, 8], [5, 3, -4, 5, 7]].forEach(([x, y, z, width, height]) => {
    const panel = new THREE.Mesh(panelGeometry, panelMaterial);
    panel.position.set(x, y, z);
    panel.scale.set(width, height, 1);
    panel.lookAt(0, 0, 0);
    environmentScene.add(panel);
  });
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(environmentScene, .05, .1, 50);
  scene.environment = environment.texture;
  pmrem.dispose();
  panelGeometry.dispose();
  panelMaterial.dispose();

  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = 256;
  shadowCanvas.height = 128;
  const shadowContext = shadowCanvas.getContext('2d');
  const gradient = shadowContext.createRadialGradient(128, 64, 5, 128, 64, 123);
  gradient.addColorStop(0, 'rgba(0,0,0,.8)');
  gradient.addColorStop(.45, 'rgba(0,0,0,.35)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  shadowContext.fillStyle = gradient;
  shadowContext.fillRect(0, 0, 256, 128);
  const shadowTexture = new THREE.CanvasTexture(shadowCanvas);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(12, 6), new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false, opacity: .75 }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -1.9;
  scene.add(shadow);

  let cylinders = 6;
  let rpm = 2400;
  let targetExploded = 0;
  let explodeAmount = 0;
  let paused = false;
  let reducedMotion = false;
  let visible = true;
  let destroyed = false;
  let frame = 0;
  let lastTime = 0;
  let phase = .5;
  let firstFrame = true;
  let engine;
  let head;
  let deck;
  let crank;
  let flywheel;
  let pistons = [];
  let pointerX = 0;
  let pointerY = 0;
  let rotationX = 0;
  let rotationY = 0;
  let scrollProgress = .35;
  let targetScrollProgress = .35;
  let sceneTime = 0;
  let entry = 0;
  let modelTransition = 1;
  let enteringModel = false;
  function updateTheme() {
    const light = document.documentElement.dataset.theme === 'light';
    materials.red.color.set(light ? 0x167cb5 : 0xb72d25);
    materials.stripe.color.set(light ? 0x53c4ff : 0xf26553);
    rim.color.set(light ? 0xbce9ff : 0xffd5c5);
    requestFrame();
  }
  const themeObserver = new MutationObserver(updateTheme);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  const axisY = new THREE.Vector3(0, 1, 0);
  const direction = new THREE.Vector3();
  const cameraDirection = new THREE.Vector3(.42, .36, 1).normalize();
  const target = new THREE.Vector3(0, .25, 0);
  const cameraCorners = [];
  const boltTransform = new THREE.Object3D();

  function mesh(parent, geometry, material, x = 0, y = 0, z = 0) {
    const object = new THREE.Mesh(geometry, material);
    object.position.set(x, y, z);
    parent.add(object);
    return object;
  }
  function box(parent, width, height, depth, material, x, y, z) {
    return mesh(parent, new THREE.BoxGeometry(width, height, depth), material, x, y, z);
  }
  function cylinder(parent, radius, height, material, x, y, z, segments = 32) {
    return mesh(parent, new THREE.CylinderGeometry(radius, radius, height, segments), material, x, y, z);
  }
  function torus(parent, radius, tube, material, x, y, z, arc = Math.PI * 2) {
    return mesh(parent, new THREE.TorusGeometry(radius, tube, 8, 40, arc), material, x, y, z);
  }
  function roundedShape(width, depth, radius) {
    const shape = new THREE.Shape();
    const x = -width / 2;
    const y = -depth / 2;
    shape.moveTo(x + radius, y);
    shape.lineTo(x + width - radius, y);
    shape.quadraticCurveTo(x + width, y, x + width, y + radius);
    shape.lineTo(x + width, y + depth - radius);
    shape.quadraticCurveTo(x + width, y + depth, x + width - radius, y + depth);
    shape.lineTo(x + radius, y + depth);
    shape.quadraticCurveTo(x, y + depth, x, y + depth - radius);
    shape.lineTo(x, y + radius);
    shape.quadraticCurveTo(x, y, x + radius, y);
    return shape;
  }
  function plate(parent, width, depth, height, radius, material, y, holes = []) {
    const shape = roundedShape(width, depth, radius);
    holes.forEach(x => {
      const hole = new THREE.Path();
      hole.absarc(x, 0, .455, 0, Math.PI * 2, true);
      shape.holes.push(hole);
    });
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: .025, bevelThickness: .025, curveSegments: 16 });
    geometry.rotateX(-Math.PI / 2);
    return mesh(parent, geometry, material, 0, y, 0);
  }
  function disposeGeometry(group) {
    const geometries = new Set();
    group.traverse(object => { if (object.geometry) geometries.add(object.geometry); });
    geometries.forEach(geometry => geometry.dispose());
  }

  function buildEngine() {
    if (engine) { root.remove(engine); disposeGeometry(engine); }
    engine = new THREE.Group();
    root.add(engine);
    pistons = [];
    boltTransform.rotation.set(0, 0, 0);
    const spacing = 1.12;
    const length = cylinders * spacing;
    const centers = Array.from({ length: cylinders }, (_, index) => (index - (cylinders - 1) / 2) * spacing);
    const crankPhases = cylinders === 6 ? [0, Math.PI * 2 / 3, Math.PI * 4 / 3, Math.PI * 4 / 3, Math.PI * 2 / 3, 0] : [0, Math.PI, Math.PI, 0];
    plate(engine, length + .15, 1.5, .24, .16, materials.cast, -1.72);
    plate(engine, length + .24, 1.58, .08, .14, materials.silver, -1.45);
    [-.7, .7].forEach(z => {
      box(engine, length + .15, .24, .16, materials.cast, 0, -1.25, z);
      box(engine, length + .05, .04, .035, materials.bright, 0, -1.15, z + Math.sign(z) * .09);
    });
    for (let index = 0; index < cylinders + 1; index++) {
      const x = (index - cylinders / 2) * spacing;
      const support = cylinder(engine, .24, .16, materials.cast, x, -.95, 0, 24);
      support.rotation.z = Math.PI / 2;
      box(engine, .14, .36, 1.35, materials.cast, x, -1.23, 0);
    }

    deck = new THREE.Group();
    engine.add(deck);
    plate(deck, length + .13, 1.51, .14, .17, materials.silver, 1.4, centers);
    const sleeveGeometry = new THREE.CylinderGeometry(.468, .468, 1.08, 32, 1, true, Math.PI / 2, Math.PI);
    centers.forEach(x => {
      mesh(engine, sleeveGeometry, materials.sleeve, x, .86, 0);
      const ring = torus(deck, .484, .035, materials.bright, x, 1.54, 0);
      ring.rotation.x = Math.PI / 2;
      box(engine, .12, .98, .12, materials.cast, x, .73, -.55);
    });
    box(engine, length + .1, .19, .18, materials.cast, 0, 1.13, -.61);
    box(engine, length + .1, .1, .08, materials.silver, 0, .22, -.62);

    head = new THREE.Group();
    engine.add(head);
    plate(head, length + .2, 1.51, .14, .19, materials.cast, 1.78);
    plate(head, length + .15, 1.43, .33, .3, materials.dark, 1.94);
    plate(head, length - .1, .93, .08, .23, materials.black, 2.3);
    box(head, length - .35, .04, .065, materials.stripe, 0, 2.4, .36);
    box(head, length - .35, .035, .065, materials.silver, 0, 2.395, -.36);
    centers.forEach((x, index) => {
      plate(head, .73, .68, .055, .17, index % 2 ? materials.dark : materials.cast, 2.36).position.x = x;
      box(head, .45, .025, .025, materials.silver, x, 2.445, -.2);
      box(head, .45, .025, .025, materials.silver, x, 2.445, -.11);
      cylinder(head, .082, .115, materials.black, x, 2.44, .05, 12);
    });
    cylinder(head, .2, .08, materials.black, centers[0] - .3, 2.44, .19, 24);

    const bolts = new THREE.InstancedMesh(new THREE.CylinderGeometry(.057, .057, .063, 6), materials.bright, (cylinders + 1) * 2);
    for (let index = 0; index <= cylinders; index++) {
      [-.63, .63].forEach((z, side) => {
        boltTransform.position.set((index - cylinders / 2) * spacing, 1.56, z);
        boltTransform.updateMatrix();
        bolts.setMatrixAt(index * 2 + side, boltTransform.matrix);
      });
    }
    deck.add(bolts);

    crank = new THREE.Group();
    crank.position.y = -.95;
    engine.add(crank);
    const shaft = cylinder(crank, .125, length + .8, materials.silver, 0, 0, 0, 24);
    shaft.rotation.z = Math.PI / 2;
    const counterGeometry = new THREE.CylinderGeometry(.41, .41, .105, 24, 1, false, -.35, Math.PI * 1.5);
    const journalGeometry = new THREE.CylinderGeometry(.105, .105, .3, 20);
    const pistonGeometry = new THREE.LatheGeometry([
      new THREE.Vector2(.28, -.29), new THREE.Vector2(.36, -.26), new THREE.Vector2(.415, -.16),
      new THREE.Vector2(.415, .13), new THREE.Vector2(.422, .16), new THREE.Vector2(.422, .22),
      new THREE.Vector2(.428, .24), new THREE.Vector2(.428, .3), new THREE.Vector2(.38, .325),
      new THREE.Vector2(.3, .32), new THREE.Vector2(.25, .275), new THREE.Vector2(0, .275)
    ], 40);
    const grooveGeometry = new THREE.TorusGeometry(.423, .014, 6, 40);
    const connectingGeometry = new THREE.CylinderGeometry(.056, .074, 1, 10);
    const rodEndGeometry = new THREE.TorusGeometry(.13, .045, 8, 20);

    centers.forEach((x, index) => {
      const offset = crankPhases[index];
      const pinY = Math.cos(offset) * .39;
      const pinZ = Math.sin(offset) * .39;
      [-.22, .22].forEach(dx => {
        const counter = mesh(crank, counterGeometry, materials.cast, x + dx, 0, 0);
        counter.rotation.set(offset, 0, Math.PI / 2);
        const rim = torus(crank, .19, .04, materials.silver, x + dx, 0, 0);
        rim.rotation.y = Math.PI / 2;
      });
      const journal = mesh(crank, journalGeometry, materials.silver, x, pinY, pinZ);
      journal.rotation.z = Math.PI / 2;
      const piston = new THREE.Group();
      piston.position.x = x;
      engine.add(piston);
      mesh(piston, pistonGeometry, materials.silver);
      [.12, .2, .26].forEach(y => {
        const groove = mesh(piston, grooveGeometry, materials.black, 0, y, 0);
        groove.rotation.x = Math.PI / 2;
      });
      const pin = cylinder(piston, .079, .855, materials.bright, 0, -.09, 0, 16);
      pin.rotation.z = Math.PI / 2;
      const ring = torus(piston, .076, .016, materials.dark, .435, -.09, 0);
      ring.rotation.y = Math.PI / 2;
      const rod = mesh(engine, connectingGeometry, materials.silver, x, 0, 0);
      const rodWeb = box(engine, .095, 1, .074, materials.cast, x, 0, 0);
      const bigEnd = mesh(engine, rodEndGeometry, materials.silver, x, 0, 0);
      bigEnd.rotation.y = Math.PI / 2;
      pistons.push({ x, offset, piston, rod, rodWeb, bigEnd });
    });

    flywheel = new THREE.Group();
    flywheel.position.x = length / 2 + .45;
    crank.add(flywheel);
    const disc = cylinder(flywheel, .73, .19, materials.cast, 0, 0, 0, 56);
    disc.rotation.z = Math.PI / 2;
    const friction = cylinder(flywheel, .59, .22, materials.silver, 0, 0, 0, 56);
    friction.rotation.z = Math.PI / 2;
    const inner = cylinder(flywheel, .4, .25, materials.dark, 0, 0, 0, 40);
    inner.rotation.z = Math.PI / 2;
    const hub = cylinder(flywheel, .17, .34, materials.bright, 0, 0, 0, 24);
    hub.rotation.z = Math.PI / 2;
    const accent = torus(flywheel, .47, .022, materials.red, .13, 0, 0);
    accent.rotation.y = Math.PI / 2;
    const teeth = new THREE.InstancedMesh(new THREE.BoxGeometry(.19, .078, .075), materials.silver, 42);
    for (let index = 0; index < 42; index++) {
      const angle = index / 42 * Math.PI * 2;
      boltTransform.position.set(0, Math.sin(angle) * .739, Math.cos(angle) * .739);
      boltTransform.rotation.set(angle, 0, 0);
      boltTransform.updateMatrix();
      teeth.setMatrixAt(index, boltTransform.matrix);
    }
    flywheel.add(teeth);
    const pulley = cylinder(crank, .43, .2, materials.black, -length / 2 - .36, 0, 0, 40);
    pulley.rotation.z = Math.PI / 2;
    [-.48, -.39, -.31].forEach(offset => {
      const ring = torus(crank, .409, .035, materials.silver, -length / 2 + offset, 0, 0);
      ring.rotation.y = Math.PI / 2;
    });
    const connector = cylinder(engine, .17, .32, materials.dark, length / 2 - .13, 1.9, .9, 24);
    connector.rotation.x = Math.PI / 2;
    shadow.scale.x = cylinders === 4 ? .78 : 1;
    cameraCorners.length = 0;
    [-length / 2 - .75, length / 2 + 1.15].forEach(x => {
      [-1.85, 3.5].forEach(y => { [-.9, 1].forEach(z => cameraCorners.push(new THREE.Vector3(x, y, z))); });
    });
    fitCamera();
  }

  function fitCamera() {
    let distance = 11;
    const point = new THREE.Vector3();
    for (let iteration = 0; iteration < 3; iteration++) {
      camera.position.copy(cameraDirection).multiplyScalar(distance).add(target);
      camera.lookAt(target);
      camera.updateMatrixWorld();
      let extentX = 0;
      let extentY = 0;
      cameraCorners.forEach(corner => {
        point.copy(corner).project(camera);
        extentX = Math.max(extentX, Math.abs(point.x));
        extentY = Math.max(extentY, Math.abs(point.y));
      });
      distance *= Math.max(extentX / .86, extentY / .89);
    }
    camera.position.copy(cameraDirection).multiplyScalar(distance).add(target);
    camera.lookAt(target);
    camera.updateMatrixWorld();
  }

  function updateMechanism() {
    crank.rotation.x = phase;
    head.position.y = explodeAmount * .92 + (1 - entry) * 1.05;
    head.rotation.z = (1 - entry) * .045;
    deck.position.y = explodeAmount * .31 + (1 - entry) * .35;
    pistons.forEach(item => {
      const angle = phase + item.offset;
      const pinY = -.95 + Math.cos(angle) * .39;
      const pinZ = Math.sin(angle) * .39;
      const pistonY = -.95 + Math.cos(angle) * .39 + Math.sqrt(1.45 ** 2 - pinZ ** 2);
      item.piston.position.y = pistonY + explodeAmount * .07;
      const wristY = item.piston.position.y - .09;
      direction.set(0, wristY - pinY, -pinZ);
      const length = direction.length();
      direction.normalize();
      item.rod.position.set(item.x, (wristY + pinY) / 2, pinZ / 2);
      item.rod.quaternion.setFromUnitVectors(axisY, direction);
      item.rod.scale.y = length;
      item.rodWeb.position.copy(item.rod.position);
      item.rodWeb.quaternion.copy(item.rod.quaternion);
      item.rodWeb.scale.y = length * .77;
      item.bigEnd.position.set(item.x, pinY, pinZ);
    });
  }

  function requestFrame() {
    if (!frame && !destroyed && visible && !document.hidden) frame = requestAnimationFrame(render);
  }
  function render(time) {
    frame = 0;
    if (destroyed || !visible || document.hidden) return;
    const delta = lastTime ? Math.min((time - lastTime) / 1000, .05) : 1 / 60;
    lastTime = time;
    const still = paused || reducedMotion;
    if (!still) {
      phase = (phase + delta * (.65 + rpm / 1400)) % (Math.PI * 2);
      sceneTime += delta;
    }
    const interpolation = still ? 1 : 1 - Math.exp(-delta * 6);
    scrollProgress += (targetScrollProgress - scrollProgress) * interpolation;
    entry += (1 - entry) * (still ? 1 : 1 - Math.exp(-delta * 2.4));
    if (enteringModel) {
      modelTransition += delta * 1.4;
      if (modelTransition >= 1) { modelTransition = 1; enteringModel = false; }
    }
    const assembly = still ? targetExploded : Math.min(1, targetExploded + Math.max(0, scrollProgress - .47) * 1.7);
    explodeAmount += (assembly - explodeAmount) * interpolation;
    const idleX = still ? 0 : Math.sin(sceneTime * .45) * .035;
    const idleY = still ? 0 : Math.sin(sceneTime * .31) * .075;
    rotationX += ((still ? 0 : pointerY * .17 + idleX) - rotationX) * interpolation;
    rotationY += ((still ? 0 : pointerX * .48 + idleY) - rotationY) * interpolation;
    const entryTurn = (1 - entry) * -.65;
    const modelTurn = enteringModel && !still ? Math.sin(modelTransition * Math.PI) * .22 : 0;
    const scrollTurn = still ? 0 : (scrollProgress - .4) * .42;
    root.rotation.set(rotationX + (1 - entry) * .13, -.075 + rotationY + scrollTurn + entryTurn + modelTurn, 0);
    root.position.y = still ? 0 : Math.sin(sceneTime * .65) * .045;
    root.scale.setScalar(.96 + entry * .04);
    shadow.material.opacity = .63 + (still ? 0 : Math.sin(sceneTime * .65) * .07);
    updateMechanism();
    renderer.render(scene, camera);
    if (firstFrame) { firstFrame = false; options.onReady?.(); }
    if (!still) requestFrame();
  }

  function resize() {
    if (destroyed) return;
    const bounds = canvas.parentElement.getBoundingClientRect();
    if (bounds.width < 1 || bounds.height < 1) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, bounds.width < 500 ? 1.35 : 1.65));
    renderer.setSize(Math.round(bounds.width), Math.round(bounds.height), false);
    camera.aspect = bounds.width / bounds.height;
    camera.updateProjectionMatrix();
    if (engine) fitCamera();
    requestFrame();
  }
  function pointerMove(event) {
    if (event.pointerType === 'touch' || reducedMotion || paused) return;
    const rect = canvas.getBoundingClientRect();
    pointerX = Math.max(-1, Math.min(1, (event.clientX - rect.left) / rect.width * 2 - 1));
    pointerY = Math.max(-1, Math.min(1, (event.clientY - rect.top) / rect.height * 2 - 1));
    requestFrame();
  }
  function pointerLeave() { pointerX = 0; pointerY = 0; requestFrame(); }
  function visibilityChange() {
    cancelAnimationFrame(frame);
    frame = 0;
    lastTime = 0;
    requestFrame();
  }
  function contextLost(event) {
    event.preventDefault();
    cancelAnimationFrame(frame);
    frame = 0;
    options.onError?.(new Error('WebGL context lost'));
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas.parentElement);
  canvas.addEventListener('pointermove', pointerMove, { passive: true });
  canvas.addEventListener('pointerleave', pointerLeave, { passive: true });
  canvas.addEventListener('webglcontextlost', contextLost);
  document.addEventListener('visibilitychange', visibilityChange);
  buildEngine();
  updateTheme();
  resize();
  requestFrame();

  return {
    setRpm(value) { rpm = Math.max(800, Math.min(7000, Number(value) || 2400)); requestFrame(); },
    setCylinders(count) {
      const value = count === 4 ? 4 : 6;
      if (value !== cylinders) {
        cylinders = value;
        buildEngine();
        modelTransition = 0;
        enteringModel = true;
        requestFrame();
      }
    },
    setScrollProgress(value) { targetScrollProgress = Math.max(0, Math.min(1, Number(value) || 0)); requestFrame(); },
    setExploded(value) { targetExploded = value ? 1 : 0; requestFrame(); },
    setPaused(value) { paused = Boolean(value); lastTime = 0; requestFrame(); },
    setReducedMotion(value) { reducedMotion = Boolean(value); lastTime = 0; requestFrame(); },
    setVisible(value) { visible = Boolean(value); lastTime = 0; if (!visible) { cancelAnimationFrame(frame); frame = 0; } else requestFrame(); },
    resize,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      themeObserver.disconnect();
      canvas.removeEventListener('pointermove', pointerMove);
      canvas.removeEventListener('pointerleave', pointerLeave);
      canvas.removeEventListener('webglcontextlost', contextLost);
      document.removeEventListener('visibilitychange', visibilityChange);
      disposeGeometry(scene);
      Object.values(materials).forEach(material => material.dispose());
      shadow.material.dispose();
      shadowTexture.dispose();
      environment.dispose();
      renderer.dispose();
    }
  };
}
