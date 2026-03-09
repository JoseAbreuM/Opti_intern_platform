function getFirebaseConfig() {
  return window.OPTI_FIREBASE_CONFIG || null;
}

function hasPlaceholder(value = "") {
  return String(value).startsWith("REEMPLAZAR_");
}

function createDb() {
  const config = getFirebaseConfig();
  if (!window.firebase || !config || !config.apiKey || hasPlaceholder(config.apiKey)) {
    return null;
  }

  if (!window.firebase.apps.length) {
    window.firebase.initializeApp(config);
  }

  return window.firebase.firestore();
}

const db = createDb();

export function isFirebaseReady() {
  return Boolean(db);
}

export function normalizePozoId(rawValue) {
  const clean = String(rawValue || "").trim();
  return clean || "POZO-001";
}

export async function syncRecordToFirebase(record) {
  if (!db) {
    throw new Error("Firebase no configurado");
  }

  const payload = record.payload || {};
  const pozoId = normalizePozoId(payload.pozoId);
  const pozoRef = db.collection("pozos").doc(pozoId);
  const serverTs = window.firebase.firestore.FieldValue.serverTimestamp();

  if (record.formType === "parametros") {
    const body = {
      voltaje: toNumber(payload.voltaje),
      amperaje: toNumber(payload.amperaje),
      frecuencia: toNumber(payload.frecuencia),
      factor_potencia: toNumber(payload.factorPotencia),
      eficiencia: toNumber(payload.eficiencia),
      polos: toNumber(payload.polos),
      torque: toNumber(payload.torqueAplicadoNm || payload.torqueManual),
      torque_teorico: toNumber(payload.torqueTeoricoNm),
      hp_calculado: toNumber(payload.potenciaHp),
      createdAt: serverTs,
      sourceApp: "opti-intern-platform"
    };

    await pozoRef.collection("parametros").add(body);
    await pozoRef.set(
      {
        id: pozoId,
        potencia_instalada_hp: body.hp_calculado,
        ultimo_torque_nm: body.torque,
        ultima_frecuencia_hz: body.frecuencia,
        updatedAt: serverTs,
        fuente_ultima_actualizacion: "opti-intern-platform"
      },
      { merge: true }
    );

    return;
  }

  if (record.formType === "toma_nivel") {
    const body = {
      ft: toNumber(payload.ft),
      porcentaje: toNumber(payload.porcentaje),
      pip: toNumber(payload.pip),
      pbhp: toNumber(payload.pbhp),
      createdAt: serverTs,
      sourceApp: "opti-intern-platform"
    };

    await pozoRef.collection("tomas_nivel").add(body);
    await pozoRef.set(
      {
        id: pozoId,
        updatedAt: serverTs,
        fuente_ultima_actualizacion: "opti-intern-platform"
      },
      { merge: true }
    );
  }
}

export async function fetchLatestParametros(pozoId, maxRows = 12) {
  if (!db) {
    return [];
  }

  const snapshot = await db
    .collection("pozos")
    .doc(normalizePozoId(pozoId))
    .collection("parametros")
    .orderBy("createdAt", "desc")
    .limit(maxRows)
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    const createdAt = data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : new Date().toISOString();
    return {
      ...data,
      createdAt,
      id: doc.id
    };
  });
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
