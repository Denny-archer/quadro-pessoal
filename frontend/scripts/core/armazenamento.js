/** Infraestrutura compartilhada: armazenamento. */
import { S } from "./estado.js";
import { render } from "./render.js";
const store = {
  newId(col) {
    return S.db ? S.db.collection(col).doc().id : "l" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  },
  async set(col, id, data) {
    if (S.db) return S.db.doc(`${col}/${id}`).set(data);
    const arr = col === "funcionarios" ? S.func : S.ocs;
    const i = arr.findIndex(x => x.id === id);
    const row = {
      ...data,
      id
    };
    if (i >= 0) arr[i] = row;else arr.push(row);
    render();
  },
  async del(col, id) {
    if (S.db) return S.db.doc(`${col}/${id}`).delete();
    const arr = col === "funcionarios" ? S.func : S.ocs;
    const i = arr.findIndex(x => x.id === id);
    if (i >= 0) arr.splice(i, 1);
    render();
  }
};
export { store };
