import {createNursePresentation} from '../encounters/nursePresentation';
import type {NursePerformance} from '../encounters/nursePresentation';
import type {GameEvents} from '../../contracts';
import {getStationStaging} from '../../world/stealth/nursesStation';
import type {StationActorPose} from '../encounters/nursesStation';
import {
  BoxGeometry, BufferAttribute, Color, DoubleSide, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial,
  Object3D, PerspectiveCamera, PlaneGeometry, Quaternion, Vector3,
} from 'three';
import type { BufferGeometry } from 'three';
import type { HospitalWorld, Vec3 } from '../../contracts';
import type { PhysicsAdapter } from '../../physics';
import { MODEL_MANIFESTS, MODEL_URLS } from '../../horror/entities/model/assets';
import { loadModelLibrary } from '../../horror/entities/model/library';
import { createModelVisual } from '../../horror/entities/model/modelVisual';
import type { EntityVisual } from '../../horror/entities/visual';
import { openingPosition } from './bindings';
import type { OpeningBindings } from './bindings';

export type OpeningFeedback = 'handle-104' | 'handle-106' | 'reader-denied' | 'reader-accepted';
export interface OpeningScene {
  directNurse(pose: StationActorPose): void;
  nursePerformance():NursePerformance;
  cancelNurse():void;
  setCardTaken(value: boolean): void;
  feedback(id: OpeningFeedback): void;
  update(deltaSeconds: number, playerPosition: Vec3, camera: PerspectiveCamera, unlocked: boolean): { sawNurse: boolean; atStation: boolean };
  restore(state: { readonly sightingSeen: boolean; readonly stationReached: boolean }): void;
  dispose(): void;
}
export interface OpeningSceneOptions {
  /** Optional NW007B adapter: receives semantic actions, not guessed animation names. */
  readonly events?:GameEvents;
  readonly onNurseAction?: (pose:StationActorPose)=>void;
  /** Tests may supply an owned visual. Production loads the existing Blender Nurse, never a proxy. */
  readonly loadNurse?: () => Promise<EntityVisual>;
}
interface HandleAnimation { update(angle: number): void; dispose(): void }

/** A local deformation of the visible hardware, not an empty marker rotation or moving door leaf. */
function animateHardware(door: Object3D, pivot: Vector3): HandleAnimation | null {
  door.updateWorldMatrix(true, true);
  const parts: { mesh: Mesh; original: BufferGeometry; clone: BufferGeometry; vertices: { index: number; point: Vector3; normal: Vector3 | null }[]; pivot: Vector3; axis: Vector3 }[] = [];
  const worldAxis = new Vector3(0, 0, 1).applyQuaternion(door.getWorldQuaternion(new Quaternion())).normalize();
  door.traverse(node => {
    const mesh = node as Mesh;
    if (!mesh.isMesh || !mesh.visible || !/hardware|chrome|handle|lever/i.test(mesh.name)) return;
    let visible = true;
    for (let parent: Object3D | null = mesh.parent; parent && parent !== door; parent = parent.parent) if (!parent.visible) visible = false;
    if (!visible) return;
    const original = mesh.geometry;
    const positions = original.getAttribute('position');
    const normals = original.getAttribute('normal');
    const vertices: { index: number; point: Vector3; normal: Vector3 | null }[] = [];
    const point = new Vector3();
    for (let i = 0; i < positions.count; i++) {
      point.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld);
      if (point.distanceToSquared(pivot) <= 0.19 ** 2) vertices.push({ index: i,
        point: new Vector3().fromBufferAttribute(positions, i),
        normal: normals ? new Vector3().fromBufferAttribute(normals, i) : null });
    }
    if (!vertices.length) return;
    const clone = original.clone();
    mesh.geometry = clone;
    parts.push({ mesh, original, clone, vertices, pivot: mesh.worldToLocal(pivot.clone()),
      axis: worldAxis.clone().transformDirection(mesh.matrixWorld.clone().invert()) });
  });
  if (!parts.length) return null;
  const rotation = new Quaternion();
  const point = new Vector3();
  return {
    update(angle) {
      for (const part of parts) {
        rotation.setFromAxisAngle(part.axis, angle);
        const positions = part.clone.getAttribute('position') as BufferAttribute;
        const normals = part.clone.getAttribute('normal') as BufferAttribute | undefined;
        for (const v of part.vertices) {
          point.copy(v.point).sub(part.pivot).applyQuaternion(rotation).add(part.pivot);
          positions.setXYZ(v.index, point.x, point.y, point.z);
          if (v.normal && normals) { point.copy(v.normal).applyQuaternion(rotation); normals.setXYZ(v.index, point.x, point.y, point.z); }
        }
        positions.needsUpdate = true;
        if (normals) normals.needsUpdate = true;
        // The press never leaves the tiny existing door bounds; no per-frame bounding or normal rebuild.
      }
    },
    dispose() { for (const part of parts) { if (part.mesh.geometry === part.clone) part.mesh.geometry = part.original; part.clone.dispose(); } },
  };
}

/** Derives the latch-side hardware from the door's own mesh, with no hospital coordinates. */
function room104Handle(door: Object3D, stand: Vec3 | undefined, fallback: Vector3): Vector3 {
  const points: Vector3[] = [];
  door.updateWorldMatrix(true, true);
  const inverse = door.matrixWorld.clone().invert();
  door.traverse(node => {
    const mesh = node as Mesh;
    if (!mesh.isMesh || !mesh.visible || !/hardware|chrome|handle|lever/i.test(mesh.name)) return;
    const positions = mesh.geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      const p = new Vector3().fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse);
      if (p.y > 0.94 && p.y < 1.06 && Math.abs(p.x) > 0.3) points.push(p);
    }
  });
  if (!points.length) return fallback.clone();
  const facing = stand ? Math.sign(new Vector3(stand.x, stand.y, stand.z).applyMatrix4(inverse).z) || 1 : 1;
  const x = points.reduce((a, b) => Math.abs(a.x) > Math.abs(b.x) ? a : b).x;
  const face = points.filter(p => Math.sign(p.z) === facing);
  const z = (face.length ? face : points).reduce((a, b) => Math.abs(a.z) > Math.abs(b.z) ? a : b).z;
  return new Vector3(x - Math.sign(x) * 0.045, 1, z).applyMatrix4(door.matrixWorld);
}

async function loadNurse(): Promise<EntityVisual> {
  const library = await loadModelLibrary({ urls: { nurse: MODEL_URLS.nurse }, manifests: { nurse: MODEL_MANIFESTS.nurse } });
  const model = library.get('nurse');
  if (!model) { const reason = library.failures.nurse; library.dispose(); throw new Error(`Opening Nurse model could not load: ${reason}`); }
  try {
    const visual = createModelVisual('nurse', model, { seed: 104 });
    return Object.defineProperties({}, {...Object.getOwnPropertyDescriptors(visual),dispose:{value:()=>{visual.dispose();library.dispose();},enumerable:true}}) as EntityVisual;
  } catch (error) { library.dispose(); throw error; }
}

/** Opening presentation only: no AI, collisions, independent clock or frame loop. */
export async function createOpeningScene(world: HospitalWorld, bindings: OpeningBindings,
  physics: Pick<PhysicsAdapter, 'hasLineOfSight'>, options: OpeningSceneOptions = {}): Promise<OpeningScene> {
  const staging=world.root.getObjectByName('nw:station:nurse-panel')?getStationStaging(world):null;
  const nurse = await (options.loadNurse ?? loadNurse)();
  const performance=createNursePresentation(nurse,options.events,staging?.callConsole??openingPosition(bindings['station-approach']));
  const owned = new Group(); owned.name = 'nw:opening:gameplay-presentation';
  world.root.add(owned);
  const resources: { dispose(): void }[] = [];
  let disposed = false;
  let directed = false;
  let seen = false;
  let elapsed = 0;
  let readerUntil = 0;
  const card = world.root.getObjectByName('nw:opening:access-card-prop');
  const cardVisible = card?.visible ?? false;
  const press = { 'handle-104': -1, 'handle-106': -1 };
  const handles = new Map<'handle-104' | 'handle-106', HandleAnimation>();
  try {
    const sight = bindings['nurse-first-sight'].node;
    owned.add(nurse.object);
    nurse.object.position.copy(owned.worldToLocal(openingPosition(bindings['nurse-first-sight'])));
    nurse.object.quaternion.copy(owned.getWorldQuaternion(new Quaternion()).invert().multiply(sight.getWorldQuaternion(new Quaternion())));
    nurse.object.name = 'nw:opening:nurse-sighting';
    nurse.object.userData.nwOpeningSighting = true;
    nurse.object.visible = false;
    nurse.forceState('idle');
    nurse.update(0, { behaviour: 'idle', speed: 0, observed: false });
    resources.push(nurse,performance);

    const indicatorMaterial = new MeshBasicMaterial({ color: 0x75653d, side: DoubleSide, depthWrite: false });
    const indicatorGeometry = new PlaneGeometry(0.026, 0.012);
    const indicator = new Mesh(indicatorGeometry, indicatorMaterial);
    indicator.name = 'nw:opening:reader-indicator';
    bindings['card-reader'].node.add(indicator);
    indicator.position.set(0, 0.035, -0.04);
    resources.push(indicatorGeometry, indicatorMaterial, { dispose: () => indicator.removeFromParent() });

    for (const key of ['handle-104', 'handle-106'] as const) {
      const anchor = bindings[key === 'handle-104' ? 'room-104-door' : 'room-106-door'];
      const door = world.doors.find(candidate => candidate.id === anchor.doorId)?.object;
      const position = key === 'handle-104' && door
        ? room104Handle(door, anchor.stand, openingPosition(anchor))
        : openingPosition(bindings['room-106-handle']);
      const animation = door ? animateHardware(door, position) : null;
      if (animation) { handles.set(key, animation); resources.push(animation); }
      else {
        // Isolated development fixtures may lack any authored hardware. Production dressed leaves
        // use the local geometry adapter above, so no doubled levers are added to the Blender set.
        const hinge = new Group(); hinge.name = `nw:opening:${key}:fixture-lever`;
        owned.add(hinge); hinge.position.copy(owned.worldToLocal(position));
        const material = new MeshStandardMaterial({ color: 0x858780, metalness: 0.7, roughness: 0.34 });
        const geometry = new BoxGeometry(0.13, 0.018, 0.022);
        const lever = new Mesh(geometry, material); lever.position.x = -0.055; hinge.add(lever);
        const fixture: HandleAnimation = { update: angle => { hinge.rotation.z = angle; }, dispose() { geometry.dispose(); material.dispose(); hinge.removeFromParent(); } };
        handles.set(key, fixture); resources.push(fixture);
      }
    }
    return {
      directNurse(pose) {
        directed = true;
        options.onNurseAction?.(pose);
        nurse.object.visible = pose.visible !== false;
        nurse.object.position.copy(owned.worldToLocal(new Vector3().copy(pose.actor.position)));
        nurse.object.quaternion.copy(owned.getWorldQuaternion(new Quaternion()).invert()).multiply(new Quaternion().setFromAxisAngle(new Vector3(0,1,0),pose.yaw));
        performance.present(pose);
      },
      nursePerformance:()=>performance.read(),
      cancelNurse:()=>performance.cancel(),
      setCardTaken(value) { if (!disposed && card) card.visible = value ? false : cardVisible; },
      feedback(id) {
        if (disposed) return;
        if (id === 'handle-104' || id === 'handle-106') { if (press[id] < 0) press[id] = 0; }
        else { indicatorMaterial.color.copy(new Color(id === 'reader-accepted' ? 0x769a72 : 0xa45d47)); readerUntil = elapsed + 0.65; }
      },
      update(dt, playerPosition, camera, unlocked) {
        if (disposed) return { sawNurse: false, atStation: false };
        const step = Math.max(0, Math.min(Number.isFinite(dt) ? dt : 0, 0.1));
        elapsed += step;
        for (const key of ['handle-104', 'handle-106'] as const) if (press[key] >= 0) {
          press[key] += step;
          const progress = Math.min(1, press[key] / 0.55);
          handles.get(key)?.update(-0.24 * Math.sin(Math.PI * progress) ** 2);
          if (progress === 1) press[key] = -1;
        }
        if (readerUntil > 0 && elapsed >= readerUntil) { indicatorMaterial.color.set(0x75653d); readerUntil = 0; }
        // Only the Encounter Director presents Shaw. The empty corridor has no ambient sighting.
        camera.updateWorldMatrix(true,false);
        const target=nurse.object.getWorldPosition(new Vector3());target.y+=1.35;
        const projected=target.clone().project(camera);
        const sawNurse=directed&&nurse.object.visible&&!seen&&projected.z>=-1&&projected.z<=1&&Math.abs(projected.x)<1&&Math.abs(projected.y)<1&&physics.hasLineOfSight(camera.position,target);
        if(sawNurse)seen=true;
        void playerPosition;void camera;void unlocked;
        return {sawNurse,atStation:false};
      },
      restore(state) {
        if(disposed)return;
        seen=state.sightingSeen;
        if(!directed)nurse.object.visible=false;
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        if (card) card.visible = cardVisible;
        for (const resource of resources.reverse()) resource.dispose();
        owned.removeFromParent();
      },
    };
  } catch (error) {
    if (!resources.includes(nurse)) nurse.dispose();
    for (const resource of resources.reverse()) resource.dispose();
    owned.removeFromParent();
    throw error;
  }
}
