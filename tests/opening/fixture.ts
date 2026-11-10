import { AmbientLight, BoxGeometry, DirectionalLight, Group, Mesh, MeshStandardMaterial, Object3D, PointLight, Quaternion, Vector3 } from 'three';
import type { ColliderDefinition, DoorMarker, GameModule, HospitalWorld, InteractableMarker, Pose, Vec3 } from '../../src/contracts';
import type { OpeningKey } from '../../src/gameplay/opening/bindings';

/**
 * Small synthetic room/corridor for the opening's integration tests.
 * These coordinates are deliberately unrelated to Claude's hospital. Production
 * code consumes the same named/data contract and does not import this fixture.
 */
export function createOpeningFixture(): { world: HospitalWorld; dispose(): void } {
  const root = new Group();
  root.name = 'nw005b:isolated-opening-fixture';
  const geometry = new BoxGeometry(1, 1, 1);
  const materials: MeshStandardMaterial[] = [];
  const colliders: ColliderDefinition[] = [];
  const doors: DoorMarker[] = [];
  const interactables: InteractableMarker[] = [];
  const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
  const identity = new Quaternion();
  const room104 = 'nw005b:fixture:room-104';
  const room106 = 'nw005b:fixture:room-106';
  const corridor = 'nw005b:fixture:corridor';
  const station = 'nw005b:fixture:station';

  function material(color: string, emissive?: string): MeshStandardMaterial {
    const value = new MeshStandardMaterial({ color, roughness: .82,
      ...(emissive ? { emissive, emissiveIntensity: .5 } : {}) });
    materials.push(value);
    return value;
  }
  const wallMaterial = material('#87928b');
  const floorMaterial = material('#56605b');
  const woodMaterial = material('#62574a');
  const paleMaterial = material('#b4b6a7');
  const darkMaterial = material('#27302e');
  const metalMaterial = material('#7a8580');
  const lightMaterial = material('#d1e0cd', '#c0d8bb');

  function box(id: string, position: Vec3, size: Vec3, surface: MeshStandardMaterial,
    solid = true, owner: Group = root): Mesh {
    const mesh = new Mesh(geometry, surface);
    mesh.name = id;
    mesh.position.set(position.x, position.y, position.z);
    mesh.scale.set(size.x, size.y, size.z);
    owner.add(mesh);
    if (solid) colliders.push({ id, bodyType: 'fixed', sensor: false,
      shape: { type: 'box', halfExtents: v(size.x / 2, size.y / 2, size.z / 2) },
      pose: { position, rotation: identity.clone() } });
    return mesh;
  }
  box('fixture:floor', v(4, -.1, 0), v(16.4, .2, 10.4), floorMaterial);
  box('fixture:wall:west', v(-4.1, 1.5, 0), v(.2, 3, 10.2), wallMaterial);
  box('fixture:wall:east', v(12.1, 1.5, 0), v(.2, 3, 10.2), wallMaterial);
  box('fixture:wall:north', v(4, 1.5, -5.1), v(16.2, 3, .2), wallMaterial);
  box('fixture:wall:south', v(4, 1.5, 5.1), v(16.2, 3, .2), wallMaterial);
  // Broken at the two doorways. The door colliders close these gaps physically.
  // Eight centimetres of jamb clearance accommodates a rotating thick leaf at its hinge.
  box('fixture:wall:104-front-west', v(-2.84, 1.5, 0), v(2.32, 3, .16), wallMaterial);
  box('fixture:wall:104-front-east', v(.8, 1.5, 0), v(2.24, 3, .16), wallMaterial);
  box('fixture:wall:106-front-east', v(7.64, 1.5, 0), v(8.72, 3, .16), wallMaterial);
  box('fixture:wall:104-door-lintel', v(-1, 2.56, 0), v(1.2, .88, .16), wallMaterial);
  box('fixture:wall:106-door-lintel', v(2.6, 2.56, 0), v(1.2, .88, .16), wallMaterial);
  box('fixture:wall:104-divider', v(.1, 1.5, 2.55), v(.2, 3, 5), wallMaterial);
  box('fixture:wall:106-divider', v(5.1, 1.5, 2.55), v(.2, 3, 5), wallMaterial);
  // Station opens off the north side; a clear view remains down the corridor.
  box('fixture:wall:corridor-north', v(1.9, 1.5, -2.1), v(12.2, 3, .2), wallMaterial);
  box('fixture:wall:station-west', v(8.1, 1.5, -3.6), v(.2, 3, 3), wallMaterial);
  box('fixture:ceiling:104', v(-2, 3.05, 2.5), v(4, .1, 5), paleMaterial, false);
  box('fixture:ceiling:corridor', v(4, 3.05, -1), v(16, .1, 2), paleMaterial, false);

  box('fixture:bed:base', v(-3.25, .4, 3.3), v(.95, .8, 2.15), paleMaterial);
  box('fixture:bed:mattress', v(-3.25, .86, 3.3), v(.94, .13, 2.12), material('#a5b4af'), false);
  box('fixture:bed:pillow', v(-3.25, .98, 3.95), v(.74, .17, .45), paleMaterial, false);
  box('fixture:bed:head', v(-3.25, .83, 4.45), v(1.04, 1.2, .08), metalMaterial, false);
  box('fixture:bedside', v(-2.7, .34, 1), v(.8, .68, .65), woodMaterial);
  box('fixture:station:counter', v(10.3, .55, -3.8), v(2.8, 1.1, .7), woodMaterial);
  box('fixture:station:monitor', v(10.3, 1.38, -3.8), v(.5, .45, .1), darkMaterial, false);
  box('fixture:station:monitor-screen', v(10.3, 1.38, -3.73), v(.43, .37, .02), lightMaterial, false);
  box('fixture:104:lamp', v(-2, 2.94, 2.6), v(1.1, .03, .23), lightMaterial, false);
  box('fixture:corridor:lamp', v(2.2, 2.94, -1), v(1.1, .03, .23), lightMaterial, false);
  box('fixture:station:lamp', v(9.6, 2.94, -2.8), v(1.1, .03, .23), lightMaterial, false);

  function door(id: string, hinge: Vec3, initiallyOpen: boolean): DoorMarker {
    const object = new Group(); object.name = id;
    object.position.copy(hinge);
    const rotation = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -Math.PI / 2);
    const closedPose: Pose = { position: { ...hinge }, rotation: identity.clone() };
    const openPose: Pose = { position: { ...hinge }, rotation };
    if (initiallyOpen) object.quaternion.copy(rotation);
    root.add(object);
    box(`${id}:leaf`, v(.6, 1.05, 0), v(1.2, 2.1, .08), woodMaterial, false, object);
    box(`${id}:glass`, v(.6, 1.55, -.045), v(.38, .42, .012), darkMaterial, false, object);
    const colliderId = `${id}:collider`;
    const center = new Vector3(.6, 1.05, 0).applyQuaternion(object.quaternion).add(object.position);
    colliders.push({ id: colliderId, bodyType: 'kinematic', sensor: false,
      interactableId: id, shape: { type: 'box', halfExtents: v(.6, 1.05, .04) },
      pose: { position: center, rotation: object.quaternion.clone() } });
    const marker: DoorMarker = { id, type: 'door', object, prompt: 'Open', range: 2,
      colliderIds: [colliderId], initialState: initiallyOpen ? 'open' : 'closed',
      closedPose, openPose, durationSeconds: .8 };
    doors.push(marker); interactables.push(marker);
    return marker;
  }
  const door104 = door('nw:door:room-104', v(-1.6, 0, 0), true);
  const door106 = door('nw:door:room-106', v(2, 0, 0), false);

  // These are visible but non-solid props, just like the producer's dressing.
  box('fixture:reader', v(-.25, 1.15, .15), v(.19, .28, .07), darkMaterial, false);
  box('fixture:intercom', v(-1, 2.43, .15), v(.34, .24, .07), metalMaterial, false);
  const card = new Group(); card.name = 'nw:opening:access-card-prop'; root.add(card);
  box('fixture:staff-card', v(-2.7, .692, 1), v(.19, .015, .12), paleMaterial, false, card);
  box('fixture:staff-card:print', v(-2.7, .701, .98), v(.14, .002, .025), material('#48615d'), false, card);
  box('fixture:staff-card:lanyard', v(-2.7, .69, 1.17), v(.025, .012, .25), material('#485e63'), false, card);

  interface Row {
    key: OpeningKey; id: string; kind: string; roomId: string; node: string;
    position: Vec3; yaw?: number; doorId?: string; stand?: Vec3; target?: Vec3; points?: Vec3[];
  }
  const spawn = v(-2.2, .005, 3.3);
  const rows: Row[] = [];
  function anchor(key: OpeningKey, kind: string, roomId: string, position: Vec3,
    extra: Partial<Pick<Row, 'yaw' | 'doorId' | 'stand' | 'target' | 'points'>> = {}): Object3D {
    const node = new Object3D(); node.name = `nw:opening:${key}`;
    node.position.copy(position);
    if (extra.yaw !== undefined) node.rotation.y = extra.yaw;
    node.userData.nwOpening = { key, id: node.name, kind, roomId,
      ...(extra.doorId ? { doorId: extra.doorId } : {}) };
    root.add(node);
    rows.push({ key, id: node.name, kind, roomId, node: node.name, position: { ...position }, ...extra });
    return node;
  }
  anchor('player-spawn', 'pose', room104, spawn, { yaw: 0 });
  anchor('room-104-door', 'door', room104, v(-1, 1.05, 0), { doorId: door104.id, stand: v(-1, .005, .85) });
  anchor('card-reader', 'prop', room104, v(-.25, 1.15, .2), { yaw: Math.PI, doorId: door104.id, stand: v(-.7, .005, 1) });
  anchor('access-card', 'prop', room104, v(-2.7, .705, 1), { stand: v(-2.4, .005, 1.8) });
  anchor('intercom-speaker', 'audio', room104, v(-1, 2.43, .2), { yaw: Math.PI });
  anchor('room-106-door', 'door', room106, v(2.6, 1.05, 0), { doorId: door106.id, stand: v(2.6, .005, -.85) });
  const handle = anchor('room-106-handle', 'prop', corridor, v(3, 1, -.09), { doorId: door106.id, stand: v(3, .005, -.85) });
  // Keep the reference a true child of the moving door, as in NW-005A.
  door106.object.attach(handle);
  anchor('nurse-first-sight', 'entity', corridor, v(9.4, 0, -1), { yaw: Math.PI / 2 });
  anchor('nurse-first-sight-view', 'camera', corridor, v(-1, 1.65, -1), { yaw: -Math.PI / 2, target: v(9.4, 1.5, -1) });
  anchor('station-approach', 'path', corridor, v(7, 0, -1), {
    points: [{ ...spawn }, v(-1, .005, 1), v(-1, .005, -1), v(7, .005, -1)],
  });
  const eye = new Object3D(); eye.name = 'nw:opening:awakening-eye';
  eye.position.set(-3.25, 1.06, 3.45); eye.rotation.set(1.05, 0, 0, 'YXZ'); root.add(eye);
  root.userData.nightWardHospital = { opening: rows };
  root.add(new AmbientLight('#adc3b3', .75));
  const fill = new DirectionalLight('#e7e0c8', 1.6); fill.position.set(-2, 7, 5); root.add(fill);
  const stationLight = new PointLight('#e9edc9', 18, 8, 2); stationLight.position.set(9.5, 2.5, -2); root.add(stationLight);
  root.updateMatrixWorld(true);

  const bounds = (min: Vec3, max: Vec3) => ({ min, max });
  const world: HospitalWorld = {
    id: 'nw005b:isolated-opening-fixture', root,
    bounds: bounds(v(-4.2, -.2, -5.2), v(12.2, 3.2, 5.2)),
    rooms: [
      { id: room104, name: 'Synthetic Room 104', bounds: bounds(v(-4, 0, 0), v(0, 3, 5)), tags: ['patient-room', 'player-start'] },
      { id: room106, name: 'Synthetic Room 106', bounds: bounds(v(.2, 0, 0), v(5, 3, 5)), tags: ['patient-room'] },
      { id: corridor, name: 'Synthetic corridor', bounds: bounds(v(-4, 0, -2), v(12, 3, 0)), tags: ['corridor'] },
      { id: station, name: 'Synthetic station approach', bounds: bounds(v(8.2, 0, -5), v(12, 3, -2)), tags: ['nurses-station'] },
    ],
    colliders, doors, interactables, hidingLocations: [], entitySpawns: [], patrolRoutes: [],
    playerSpawn: { position: spawn, yaw: 0 },
  };
  let disposed = false;
  return { world, dispose() {
    if (disposed) return;
    disposed = true;
    geometry.dispose();
    for (const value of materials) value.dispose();
    root.clear();
  } };
}

/** The test harness uses the real module registry/application lifecycle. */
export const openingFixtureModule: GameModule = {
  id: 'nw005b:opening-fixture-world', kind: 'world',
  setup() { const fixture = createOpeningFixture(); return { world: fixture.world, dispose: () => fixture.dispose() }; },
};
