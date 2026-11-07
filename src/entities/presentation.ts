import { Group } from 'three';
import type { Scene } from 'three';
import type { EntitySystem } from './entitySystem';

export interface EntityPresentation {
  getObject(entityId: string): Group | undefined;
  update(): void;
  dispose(): void;
}

/**
 * Scene-graph bridge for model owners. Nodes are feet poses, with no generated model.
 * An atmosphere module can find `night-ward:entity:<id>` after gameplay setup and
 * attach its model without importing AI internals or editing a gameplay file.
 * Attached models remain the attaching module's resource/disposal responsibility.
 */
export function createEntityPresentation(scene: Scene, source: Pick<EntitySystem, 'getSnapshots'>): EntityPresentation {
  const root = new Group(); root.name = 'night-ward:entities';
  const nodes = new Map<string, Group>();
  let disposed = false;
  function update(): void {
    if (disposed) return;
    const present = new Set<string>();
    for (const actor of source.getSnapshots()) {
      present.add(actor.id);
      let node = nodes.get(actor.id);
      if (!node) {
        node = new Group();
        node.name = `night-ward:entity:${actor.id}`;
        node.userData.entityId = actor.id;
        node.userData.entityType = actor.type;
        node.position.copy(actor.position);
        nodes.set(actor.id, node); root.add(node);
      }
      const dx = actor.position.x - node.position.x;
      const dz = actor.position.z - node.position.z;
      if (Math.hypot(dx, dz) > 1e-6) node.rotation.y = Math.atan2(-dx, -dz);
      node.position.copy(actor.position);
      node.userData.behaviourState = actor.state;
    }
    for (const [id, node] of nodes) if (!present.has(id)) { node.removeFromParent(); nodes.delete(id); }
  }
  try { update(); scene.add(root); } catch (error) { root.removeFromParent(); throw error; }
  return {
    getObject: (id) => nodes.get(id), update,
    dispose() { if (disposed) return; disposed = true; root.removeFromParent(); nodes.clear(); },
  };
}
