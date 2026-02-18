import { createEntity } from './Entity.js';

export class UndoManager {
  constructor(doc) {
    this.doc = doc;
    this.stack = [];
    this.redoStack = [];
    this.maxSize = 100;
  }

  record(action) {
    this.stack.push(action);
    this.redoStack = [];
    if (this.stack.length > this.maxSize) this.stack.shift();
  }

  undo() {
    const action = this.stack.pop();
    if (!action) return;
    this.redoStack.push(action);
    this._reverse(action);
    this.doc._emit('undoRedo');
  }

  redo() {
    const action = this.redoStack.pop();
    if (!action) return;
    this.stack.push(action);
    this._apply(action);
    this.doc._emit('undoRedo');
  }

  _reverse(action) {
    switch (action.type) {
      case 'add':
        this.doc.entities.delete(action.entity.id);
        break;
      case 'remove': {
        const e = createEntity(action.entity);
        if (e) this.doc.entities.set(e.id, e);
        break;
      }
      case 'update': {
        const e = createEntity(action.before);
        if (e) this.doc.entities.set(e.id, e);
        break;
      }
    }
  }

  _apply(action) {
    switch (action.type) {
      case 'add': {
        const e = createEntity(action.entity);
        if (e) this.doc.entities.set(e.id, e);
        break;
      }
      case 'remove':
        this.doc.entities.delete(action.entity.id);
        break;
      case 'update': {
        const e = createEntity(action.after);
        if (e) this.doc.entities.set(e.id, e);
        break;
      }
    }
  }
}
