export class FloorPlane {
  constructor(THREE) {
    this.group = new THREE.Group();

    // Floor
    const floorGeo = new THREE.PlaneGeometry(2000, 2000);
    const floorMat = new THREE.MeshPhongMaterial({ color: 0x333333, side: THREE.DoubleSide });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.group.add(floor);

    // Grid
    const grid = new THREE.GridHelper(2000, 100, 0x555555, 0x444444);
    grid.position.y = 0.01;
    this.group.add(grid);

    // Origin axes
    const axisLen = 200;
    const xMat = new THREE.LineBasicMaterial({ color: 0xff4444 });
    const yMat = new THREE.LineBasicMaterial({ color: 0x44ff44 });
    const zMat = new THREE.LineBasicMaterial({ color: 0x4444ff });

    const xGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0.05,0), new THREE.Vector3(axisLen,0.05,0)]);
    const yGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0), new THREE.Vector3(0,axisLen,0)]);
    const zGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0.05,0), new THREE.Vector3(0,0.05,-axisLen)]);

    this.group.add(new THREE.Line(xGeo, xMat));
    this.group.add(new THREE.Line(yGeo, yMat));
    this.group.add(new THREE.Line(zGeo, zMat));
  }
}
