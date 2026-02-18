import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { FloorPlane } from './FloorPlane.js';

export class Renderer3D {
  constructor(container, doc) {
    this.container = container;
    this.doc = doc;
    this.running = false;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xcccccc);
    this.scene.fog = new THREE.Fog(0xcccccc, 500, 2000);

    this.camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 5000);
    this.camera.position.set(200, 300, 200);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = true;
    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;

    // Lights
    const amb = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(amb);
    const dir1 = new THREE.DirectionalLight(0xffffff, 0.8);
    dir1.position.set(100, 200, 100);
    dir1.castShadow = true;
    this.scene.add(dir1);
    const dir2 = new THREE.DirectionalLight(0xffffff, 0.3);
    dir2.position.set(-100, 150, -50);
    this.scene.add(dir2);

    this.floor = new FloorPlane(THREE);
    this.scene.add(this.floor.group);

    this.entityMeshes = new Map();
  }

  start() {
    this.running = true;
    this.rebuild();
    this._frame();
  }

  stop() {
    this.running = false;
    this.renderer.domElement.remove();
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  rebuild() {
    // Remove old meshes
    for (const mesh of this.entityMeshes.values()) this.scene.remove(mesh);
    this.entityMeshes.clear();

    for (const entity of this.doc.entities.values()) {
      const layer = this.doc.getLayer(entity.layer);
      if (!layer.visible) continue;
      const mesh = entity.to3DMesh(THREE);
      if (mesh) {
        this.scene.add(mesh);
        this.entityMeshes.set(entity.id, mesh);
      }
    }
  }

  _frame() {
    if (!this.running) return;
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(() => this._frame());
  }
}
