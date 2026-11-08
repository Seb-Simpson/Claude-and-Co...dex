import { CapsuleGeometry, Group, Mesh, MeshStandardMaterial, SphereGeometry } from 'three';
import type { BufferGeometry, Material } from 'three';

export interface PatientProxy {
  readonly object: Group;
  dispose(): void;
}

/** Temporary, deliberately simple silhouette. A final model belongs to its attaching module. */
export function createPatientProxy(): PatientProxy {
  const object = new Group();
  object.name = 'night-ward:patient:temporary-proxy';
  object.userData.nwTemporaryProxy = true;
  const gown = new MeshStandardMaterial({ color: 0x89978b, roughness: 0.95, emissive: 0x273129, emissiveIntensity: 0.32 });
  const skin = new MeshStandardMaterial({ color: 0xa59d8c, roughness: 1, emissive: 0x302b25, emissiveIntensity: 0.24 });
  const dark = new MeshStandardMaterial({ color: 0x181e1b, roughness: 1 });
  const resources: (BufferGeometry | Material)[] = [gown, skin, dark];
  function limb(name: string, radius: number, length: number, x: number, y: number, z: number, material: Material): Mesh {
    const geometry = new CapsuleGeometry(radius, length, 3, 6);
    resources.push(geometry);
    const mesh = new Mesh(geometry, material);
    mesh.name = name;
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    object.add(mesh);
    return mesh;
  }
  // Feet pose at y=0; total height is 1.8m, matching the authoritative capsule.
  limb('gown', 0.23, 0.58, 0, 1.03, 0, gown).scale.set(1, 1, 0.72);
  limb('left-leg', 0.075, 0.52, -0.11, 0.34, 0, dark);
  limb('right-leg', 0.075, 0.52, 0.11, 0.34, 0, dark);
  limb('left-arm', 0.055, 0.69, -0.29, 0.99, -0.015, skin).rotation.z = -0.08;
  limb('right-arm', 0.055, 0.69, 0.29, 0.99, -0.015, skin).rotation.z = 0.08;
  const headGeometry = new SphereGeometry(0.145, 10, 8);
  resources.push(headGeometry);
  const head = new Mesh(headGeometry, skin);
  head.name = 'head';
  head.scale.set(0.85, 1.17, 0.9);
  head.position.set(0, 1.62, -0.025);
  head.castShadow = true;
  object.add(head);
  let disposed = false;
  return {
    object,
    dispose() {
      if (disposed) return;
      disposed = true;
      object.removeFromParent();
      for (const resource of resources) resource.dispose();
    },
  };
}
