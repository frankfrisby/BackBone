import { createEntity } from './EntityRegistry.js';
import { Layer } from './Layer.js';
import { UndoManager } from './UndoManager.js';

export class DrawingDocument extends EventTarget {
  constructor() {
    super();
    this.entities = new Map();
    this.layers = new Map();
    this.blocks = new Map();
    this.settings = { units: 'mm', gridSize: 10, snapSize: 5 };
    this.currentLayer = '0';
    this.filePath = null;
    this.modified = false;
    this.undo = new UndoManager(this);

    this.addLayer(new Layer('0', '#ffffff'));
  }

  addLayer(layer) {
    this.layers.set(layer.name, layer);
    this._emit('layerChanged');
  }

  getLayer(name) { return this.layers.get(name) || this.layers.get('0'); }

  addEntity(entity, recordUndo = true) {
    if (!entity.id) entity.id = crypto.randomUUID();
    if (!entity.layer) entity.layer = this.currentLayer;
    this.entities.set(entity.id, entity);
    if (recordUndo) this.undo.record({ type: 'add', entity: entity.toJSON() });
    this.modified = true;
    this._emit('entityAdded', entity);
    return entity;
  }

  removeEntity(id, recordUndo = true) {
    const entity = this.entities.get(id);
    if (!entity) return;
    if (recordUndo) this.undo.record({ type: 'remove', entity: entity.toJSON() });
    this.entities.delete(id);
    this.modified = true;
    this._emit('entityRemoved', entity);
  }

  updateEntity(id, props, recordUndo = true) {
    const entity = this.entities.get(id);
    if (!entity) return;
    if (recordUndo) this.undo.record({ type: 'update', before: entity.toJSON(), after: { ...entity.toJSON(), ...props } });
    Object.assign(entity, props);
    this.modified = true;
    this._emit('entityChanged', entity);
  }

  clear() {
    this.entities.clear();
    this.layers.clear();
    this.blocks.clear();
    this.addLayer(new Layer('0', '#ffffff'));
    this.currentLayer = '0';
    this.modified = false;
    this.filePath = null;
    this._emit('cleared');
  }

  toJSON() {
    return {
      settings: this.settings,
      layers: Object.fromEntries([...this.layers].map(([k, v]) => [k, v.toJSON()])),
      entities: [...this.entities.values()].map(e => e.toJSON()),
      blocks: Object.fromEntries(this.blocks)
    };
  }

  fromJSON(data) {
    this.clear();
    if (data.settings) Object.assign(this.settings, data.settings);
    if (data.layers) {
      for (const [name, ld] of Object.entries(data.layers)) {
        this.layers.set(name, Layer.fromJSON(ld));
      }
    }
    if (data.entities) {
      for (const ed of data.entities) {
        const entity = createEntity(ed);
        if (entity) {
          this.entities.set(entity.id, entity);
        }
      }
    }
    if (data.blocks) {
      for (const [k, v] of Object.entries(data.blocks)) this.blocks.set(k, v);
    }
    this.modified = false;
    this._emit('loaded');
  }

  // API operation executor
  executeOperation(op) {
    switch (op.action) {
      case 'add_entity': {
        const entity = createEntity({ ...op.entity, id: op.entity.id || crypto.randomUUID() });
        if (entity) return this.addEntity(entity);
        break;
      }
      case 'update_entity':
        this.updateEntity(op.id, op.props);
        return this.entities.get(op.id);
      case 'remove_entity':
        this.removeEntity(op.id);
        return { removed: op.id };
      case 'add_layer':
        this.addLayer(new Layer(op.name, op.color || '#ffffff'));
        return { layer: op.name };
      case 'set_layer':
        this.currentLayer = op.name;
        return { currentLayer: op.name };
      default:
        throw new Error(`Unknown operation: ${op.action}`);
    }
  }

  _emit(name, detail) {
    this.dispatchEvent(new CustomEvent(name, { detail }));
  }
}
