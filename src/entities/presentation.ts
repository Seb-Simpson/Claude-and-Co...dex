import { Group } from 'three';
import type { Scene } from 'three';
import type { EntitySystem } from './entitySystem';
import { createPatientProxy } from './patientProxy';
import type { PatientProxy } from './patientProxy';

export interface EntityPresentation {
  getObject(entityId: string): Group | undefined;
  update(): void;
  dispose(): void;
}

/**
 * Scene-graph bridge for model owners. Nodes are feet poses. The Patient has a
 * temporary silhouette until an external model is attached to its node.
 * An atmosphere module can find `night-ward:entity:<id>` after gameplay setup and
 * attach its model without importing AI internals or editing a gameplay file.
 * Attached models remain the attaching module's resource/disposal responsibility.
 */
export function createEntityPresentation(scene: Scene, source: Pick<EntitySystem, 'getSnapshots'>): EntityPresentation {
  const root = new Group(); root.name = 'night-ward:entities';
  const nodes = new Map<string, Group>();
  const proxies = new Map<string, PatientProxy>();
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
        if (actor.type === 'patient') {
          const proxy = createPatientProxy();
          proxies.set(actor.id, proxy); node.add(proxy.object);
        }
      }
      const dx = actor.position.x - node.position.x;
      const dz = actor.position.z - node.position.z;
      if (Math.hypot(dx, dz) > 1e-6) node.rotation.y = Math.atan2(-dx, -dz);
      node.position.copy(actor.position);
      node.userData.behaviourState = actor.state;
      const proxy = proxies.get(actor.id);
      if (proxy) {
        // Final asset modules may attach any direct child, or explicitly mark
        // readiness. They continue to own their model's resources and cleanup.
        proxy.object.visible = node.userData.nwEntityModelReady !== true &&
          !node.children.some((child) => child !== proxy.object && child.userData.nwTemporaryProxy !== true);
      }
    }
    for (const [id, node] of nodes) if (!present.has(id)) {
      proxies.get(id)?.dispose(); proxies.delete(id);
      node.removeFromParent(); nodes.delete(id);
    }
  }
  try { update(); scene.add(root); } catch (error) {
    for (const proxy of proxies.values()) proxy.dispose();
    root.removeFromParent(); throw error;
  }
  return {
    getObject: (id) => nodes.get(id), update,
    dispose() {
      if (disposed) return; disposed = true;
      for (const proxy of proxies.values()) proxy.dispose();
      proxies.clear(); root.removeFromParent(); nodes.clear();
    },
  };
}
