const OFFLINE_DB = "opti-ams-offline";

const queues = {
  parametros: localforage.createInstance({ name: OFFLINE_DB, storeName: "queue_parametros" }),
  tomasNivel: localforage.createInstance({ name: OFFLINE_DB, storeName: "queue_tomas_nivel" }),
  cache: localforage.createInstance({ name: OFFLINE_DB, storeName: "cache_general" })
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
