import {stationRecordPoint,STATION_RECORD_ID} from '../encounters/storyBindings';
import { BoxGeometry, Mesh, MeshBasicMaterial } from 'three';
import type { HospitalWorld, InteractableMarker } from '../../contracts';
import type { OpeningBindings } from './bindings';

export const OPENING_INTERACTIONS = {
  card: 'nw:opening:take-staff-card', reader: 'nw:opening:use-card-reader', intercom: 'nw:opening:inspect-intercom',
} as const;
/** Raycast-only targets at producer-owned anchors. World geometry/resources are never replaced. */
export function createOpeningInteractionAdapter(world: HospitalWorld, bindings: OpeningBindings): { world: HospitalWorld; dispose(): void } {
  const record = stationRecordPoint(world);
  if(world.root.getObjectByName('nw:stealth:observation')&&!record)throw new Error('The station needs its night-register binding before play.');
  const material = new MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  const owned: Mesh[] = [];
  function marker(key: 'access-card' | 'card-reader' | 'intercom-speaker', id: string, prompt: string, size: readonly [number, number, number], range: number): InteractableMarker {
    const mesh = new Mesh(new BoxGeometry(...size), material);
    mesh.name = `${id}:raycast`;
    if (key === 'access-card') mesh.position.y = 0.025;
    bindings[key].node.add(mesh);
    owned.push(mesh);
    return { id, type: 'inspect', object: mesh, prompt, range };
  }
  const additions = [
    marker('access-card', OPENING_INTERACTIONS.card, 'Take staff access card', [0.3, 0.045, 0.22], 2.3),
    marker('card-reader', OPENING_INTERACTIONS.reader, 'Use card reader', [0.18, 0.26, 0.1], 1.85),
    marker('intercom-speaker', OPENING_INTERACTIONS.intercom, 'Examine intercom', [0.23, 0.18, 0.1], 2),
  ];
  if (record) {
    const mesh = new Mesh(new BoxGeometry(.42,.09,.38),material);
    mesh.name=STATION_RECORD_ID;mesh.position.copy(world.root.worldToLocal(record.clone()));world.root.add(mesh);owned.push(mesh);
    additions.push({id:STATION_RECORD_ID,type:'inspect',object:mesh,prompt:'Examine Room 104 record',range:2.3});
  }
  let disposed = false;
  return { world: { ...world, interactables: [...world.interactables, ...additions] }, dispose() {
    if (disposed) return;
    disposed = true;
    for (const mesh of owned) { mesh.removeFromParent(); mesh.geometry.dispose(); }
    material.dispose();
  } };
}
