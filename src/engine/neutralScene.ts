import {
  AmbientLight, BoxGeometry, Color, DirectionalLight, GridHelper, Group,
  Mesh, MeshStandardMaterial, PlaneGeometry,
} from 'three';
import type { EngineServices } from '../contracts';

/** Only a renderer smoke fixture. No rooms, world metadata, player, or gameplay. */
export function createNeutralScene(engine: EngineServices): { dispose(): void } {
  const root = new Group();
  root.name = 'nw-000-neutral-renderer-fixture';
  const cubeGeometry = new BoxGeometry(1, 1, 1);
  const cubeMaterial = new MeshStandardMaterial({ color: '#8ea6b5', roughness: 0.7 });
  const cube = new Mesh(cubeGeometry, cubeMaterial);
  cube.position.y = 0.5;
  root.add(cube);
  const planeGeometry = new PlaneGeometry(12, 12);
  const planeMaterial = new MeshStandardMaterial({ color: '#25313a', roughness: 1 });
  const plane = new Mesh(planeGeometry, planeMaterial);
  plane.rotation.x = -Math.PI / 2;
  plane.position.y = -0.015;
  root.add(plane);
  const grid = new GridHelper(12, 12, '#637786', '#354650');
  root.add(grid);
  root.add(new AmbientLight('#d7e5ec', 1.6));
  const light = new DirectionalLight('#ffffff', 2.5);
  light.position.set(3, 5, 4);
  root.add(light);
  const previousBackground = engine.scene.background;
  engine.scene.background = new Color('#141a20');
  engine.scene.add(root);
  engine.camera.position.set(4, 3, 5);
  engine.camera.lookAt(0, 0.35, 0);
  let disposed = false;
  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      root.removeFromParent();
      engine.scene.background = previousBackground;
      cubeGeometry.dispose();
      cubeMaterial.dispose();
      planeGeometry.dispose();
      planeMaterial.dispose();
      grid.geometry.dispose();
      const materials = Array.isArray(grid.material) ? grid.material : [grid.material];
      for (const material of materials) material.dispose();
    },
  };
}
