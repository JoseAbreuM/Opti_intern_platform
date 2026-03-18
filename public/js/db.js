const OFFLINE_DB = "opti-ams-offline";

const queues = {
  parametros: localforage.createInstance({ name: OFFLINE_DB, storeName: "queue_parametros" }),
  tomasNivel: localforage.createInstance({ name: OFFLINE_DB, storeName: "queue_tomas_nivel" }),
  cache: localforage.createInstance({ name: OFFLINE_DB, storeName: "cache_general" }),
  catalogo: localforage.createInstance({ name: OFFLINE_DB, storeName: "cache_catalogo_pozos" }),
  historial: localforage.createInstance({ name: OFFLINE_DB, storeName: "cache_historial_pozos" }),
  metadata: localforage.createInstance({ name: OFFLINE_DB, storeName: "cache_metadata" })
};

export async function saveFormData(formType, payload) {
  const id = `${formType}_${Date.now()}`;
  const record = {
    id,
    formType,
    payload,
    createdAt: new Date().toISOString(),
    synced: false
  };

  const target = formType === "toma_nivel" ? queues.tomasNivel : queues.parametros;
  await target.setItem(id, record);

  const latest = (await queues.cache.getItem("latestRecords")) || [];
  latest.unshift(record);
  await queues.cache.setItem("latestRecords", latest.slice(0, 20));

  return record;
}

export async function getLatestRecords() {
  return (await queues.cache.getItem("latestRecords")) || [];
}

export async function cacheWellsSnapshot(wells, metadata = {}) {
  const normalizedWells = Array.isArray(wells) ? wells : [];
  const payload = {
    wells: normalizedWells,
    syncedAt: new Date().toISOString(),
    source: metadata.source || "firebase",
    total: normalizedWells.length
  };

  await queues.catalogo.setItem("wellsSnapshot", payload);
  return payload;
}

export async function getCachedWellsSnapshot() {
  return (await queues.catalogo.getItem("wellsSnapshot")) || null;
}

export async function cachePozoHistory(pozoId, history = {}) {
  const id = String(pozoId || "").trim();
  if (!id) {
    return null;
  }

  const payload = {
    pozoId: id,
    parametros: Array.isArray(history.parametros) ? history.parametros : [],
    niveles: Array.isArray(history.niveles) ? history.niveles : [],
    syncedAt: history.syncedAt || new Date().toISOString()
  };

  await queues.historial.setItem(id, payload);
  return payload;
}

export async function getCachedPozoHistory(pozoId) {
  const id = String(pozoId || "").trim();
  if (!id) {
    return null;
  }
  return (await queues.historial.getItem(id)) || null;
}

export async function setOfflineDatasetMeta(meta = {}) {
  const payload = {
    ...meta,
    updatedAt: new Date().toISOString()
  };
  await queues.metadata.setItem("offlineDataset", payload);
  return payload;
}

export async function getOfflineDatasetMeta() {
  return (await queues.metadata.getItem("offlineDataset")) || null;
}

export async function syncPendingToFirebase(firebaseSyncAdapter) {
  if (typeof firebaseSyncAdapter !== "function") {
    return { synced: 0, failed: 0 };
  }

  const allQueues = [queues.parametros, queues.tomasNivel];
  let synced = 0;
  let failed = 0;

  for (const queue of allQueues) {
    const records = await readAll(queue);

    for (const record of records) {
      try {
        await firebaseSyncAdapter(record);
        await queue.removeItem(record.id);
        synced += 1;
      } catch (error) {
        failed += 1;
      }
    }
  }

  return { synced, failed };
}

async function readAll(instance) {
  const data = [];
  await instance.iterate((value) => {
    data.push(value);
  });
  return data.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}
