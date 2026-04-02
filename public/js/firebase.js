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

function createStorage() {
  if (!window.firebase || !window.firebase.storage || !window.firebase.apps.length) {
    return null;
  }
  return window.firebase.storage();
}

const db = createDb();
const storage = createStorage();
const MASTER_COLLECTION = "pozos";
const MASTER_DOC_ID = "data";

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
  const pozoRef = db.collection(MASTER_COLLECTION).doc(pozoId);
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

    await safeUpsertMasterPozo(pozoId, {
      id: pozoId,
      estado: firstNonEmpty(payload.estado, "activo"),
      potencial: String(firstNonEmpty(payload.potencial, "0")),
      ultima_frecuencia_hz: body.frecuencia,
      ultimo_torque_nm: body.torque,
      potencia_instalada_hp: body.hp_calculado
    });

    return;
  }

  if (record.formType === "toma_nivel") {
    const body = {
      ft: toNumber(payload.ft),
      porcentaje: toNumber(payload.porcentaje),
      pip: toNumber(payload.pip),
      pbhp: toNumber(payload.pbhp),
      reporte_pdf_url: payload.reportePdfUrl || "",
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

    await safeUpsertMasterPozo(pozoId, {
      id: pozoId,
      ultimo_nivel_ft: body.ft,
      ultimo_pip: body.pip,
      ultimo_pbhp: body.pbhp,
      reporte_pdf_url: body.reporte_pdf_url || ""
    });
  }
}

export async function fetchPozos(maxRows = 250) {
  if (!db) {
    return [];
  }

  let aggregateRows = [];

  // Esquema actual de mapa-trillas-bare: un documento `pozos/data` con array `pozos[]`.
  try {
    const aggregateDoc = await db.collection(MASTER_COLLECTION).doc(MASTER_DOC_ID).get();
    if (aggregateDoc.exists) {
      const aggregate = aggregateDoc.data() || {};
      const rows = Array.isArray(aggregate.pozos) ? aggregate.pozos : [];
      if (rows.length) {
        aggregateRows = rows.slice(0, maxRows).map((row, idx) => {
          const estado = firstNonEmpty(row.estado, row.status, "En observacion");
          const id = String(firstNonEmpty(row.id, row.pozoId, row.pozo_id, `POZO-${idx + 1}`));
          const classif = classifyEstado(estado);
          return {
            id,
            nombre: firstNonEmpty(row.nombre, row.name, row.pozo, id),
            area: firstNonEmpty(row.area, row.zona, row.zone, "N/A"),
            zona: firstNonEmpty(row.zona, row.area, row.zone, "N/A"),
            estado,
            potencial: toNumber(firstNonEmpty(row.potencial, row.potential, 0)),
            categoria: toCategory(firstNonEmpty(row.categoria, row.category), estado),
            esDiferido: classif.esDiferido,
            arena: firstNonEmpty(row.arena, row.sand, ""),
            fecha_arranque: firstNonEmpty(row.fecha_arranque, row.start_date, ""),
            velocidad_operacional_rpm: firstNonEmpty(row.velocidad_operacional_rpm, row.velocidad_rpm, row.rpm, ""),
            cabezal: firstNonEmpty(row.cabezal, row.cabezal_tipo, row.head, ""),
            variador: firstNonEmpty(row.variador, row.variador_modelo, row.vfd, ""),
            bomba_marca: firstNonEmpty(row.bomba_marca, row.marca_bomba, row.pump_brand, ""),
            bomba_modelo: firstNonEmpty(row.bomba_modelo, row.modelo_bomba, row.pump_model, ""),
            bomba_caudal: firstNonEmpty(row.bomba_caudal, row.caudal_bomba, row.pump_flow, ""),
            bomba_tvu: firstNonEmpty(row.bomba_tvu, row.tvu, ""),
            survey_tipo: firstNonEmpty(row.survey_tipo, row.tipo_survey, row.survey_type, ""),
            survey_fecha: firstNonEmpty(row.survey_fecha, row.fecha_survey, row.survey_date, ""),
            survey_profundidad: firstNonEmpty(row.survey_profundidad, row.profundidad_survey, row.survey_depth, ""),
            survey_observaciones: firstNonEmpty(row.survey_observaciones, row.observaciones_survey, row.survey_notes, ""),
            diagrama_mecanico: firstNonEmpty(row.diagrama_mecanico, row.mechanical_diagram, ""),
            num_tuberias: firstNonEmpty(row.num_tuberias, row.numero_tuberias, ""),
            diametro_tuberias: firstNonEmpty(row.diametro_tuberias, row.diam_tuberias, ""),
            num_cabillas: firstNonEmpty(row.num_cabillas, row.numero_cabillas, ""),
            diametro_cabillas: firstNonEmpty(row.diametro_cabillas, row.diam_cabillas, ""),
            longitud_cabillas: firstNonEmpty(row.longitud_cabillas, row.long_cabillas, "")
          };
        });
      }
    }
  } catch (error) {
    // Continuar con búsqueda de esquemas alternativos.
  }

  const candidates = ["pozos", "Pozos", "POZOS", "wells", "Wells"];
  for (const collectionName of candidates) {
    try {
      const snapshot = await db.collection(collectionName).limit(maxRows).get();
      if (snapshot.empty) {
        continue;
      }

      const collectionRows = snapshot.docs
        .map((doc) => {
          const data = doc.data() || {};
          // Evitar incluir el documento agregado `pozos/data` como si fuera un pozo.
          if (doc.id === MASTER_DOC_ID && Array.isArray(data.pozos)) {
            return null;
          }

          const estado = firstNonEmpty(data.estado, data.status, "En observacion");
          const classif = classifyEstado(estado);
          return {
            id: firstNonEmpty(doc.id, data.id, data.pozoId, data.pozo_id, "POZO-000"),
            nombre: firstNonEmpty(data.nombre, data.name, data.pozo, doc.id),
            area: firstNonEmpty(data.area, data.zona, data.zone, "N/A"),
            zona: firstNonEmpty(data.zona, data.area, data.zone, "N/A"),
            estado,
            potencial: toNumber(firstNonEmpty(data.potencial, data.potential, 0)),
            categoria: toCategory(firstNonEmpty(data.categoria, data.category), estado),
            esDiferido: classif.esDiferido,
            arena: firstNonEmpty(data.arena, data.sand, ""),
            fecha_arranque: firstNonEmpty(data.fecha_arranque, data.start_date, ""),
            velocidad_operacional_rpm: firstNonEmpty(data.velocidad_operacional_rpm, data.velocidad_rpm, data.rpm, ""),
            cabezal: firstNonEmpty(data.cabezal, data.cabezal_tipo, data.head, ""),
            variador: firstNonEmpty(data.variador, data.variador_modelo, data.vfd, ""),
            bomba_marca: firstNonEmpty(data.bomba_marca, data.marca_bomba, data.pump_brand, ""),
            bomba_modelo: firstNonEmpty(data.bomba_modelo, data.modelo_bomba, data.pump_model, ""),
            bomba_caudal: firstNonEmpty(data.bomba_caudal, data.caudal_bomba, data.pump_flow, ""),
            bomba_tvu: firstNonEmpty(data.bomba_tvu, data.tvu, ""),
            survey_tipo: firstNonEmpty(data.survey_tipo, data.tipo_survey, data.survey_type, ""),
            survey_fecha: firstNonEmpty(data.survey_fecha, data.fecha_survey, data.survey_date, ""),
            survey_profundidad: firstNonEmpty(data.survey_profundidad, data.profundidad_survey, data.survey_depth, ""),
            survey_observaciones: firstNonEmpty(data.survey_observaciones, data.observaciones_survey, data.survey_notes, ""),
            diagrama_mecanico: firstNonEmpty(data.diagrama_mecanico, data.mechanical_diagram, ""),
            num_tuberias: firstNonEmpty(data.num_tuberias, data.numero_tuberias, ""),
            diametro_tuberias: firstNonEmpty(data.diametro_tuberias, data.diam_tuberias, ""),
            num_cabillas: firstNonEmpty(data.num_cabillas, data.numero_cabillas, ""),
            diametro_cabillas: firstNonEmpty(data.diametro_cabillas, data.diam_cabillas, ""),
            longitud_cabillas: firstNonEmpty(data.longitud_cabillas, data.long_cabillas, "")
          };
        })
        .filter(Boolean);

      if (!collectionRows.length) {
        continue;
      }

      // Si ambas fuentes existen, tomar la más completa para evitar datasets truncados.
      if (aggregateRows.length > collectionRows.length) {
        return aggregateRows;
      }

      return collectionRows;
    } catch (error) {
      // Probar siguiente colección candidata.
    }
  }

  return aggregateRows;
}

export async function fetchAllPozos(maxRows = 5000) {
  return fetchPozos(maxRows);
}

export async function updatePozoBaseData(pozoId, payload) {
  if (!db) {
    throw new Error("Firebase no configurado");
  }

  const id = normalizePozoId(pozoId);
  const serverTs = window.firebase.firestore.FieldValue.serverTimestamp();

  await db.collection(MASTER_COLLECTION).doc(id).set(
    {
      id,
      nombre: String(payload.nombre || id).trim(),
      categoria: Number(payload.categoria || 2),
      estado: String(payload.estado || "En observacion").trim(),
      area: String(payload.area || "N/A").trim(),
      potencial: toNumber(payload.potencial),
      arena: String(payload.arena || "").trim(),
      fecha_arranque: String(payload.fecha_arranque || "").trim(),
      velocidad_operacional_rpm: toNumber(payload.velocidad_operacional_rpm),
      bomba_marca: String(payload.bomba_marca || "").trim(),
      bomba_modelo: String(payload.bomba_modelo || "").trim(),
      bomba_caudal: String(payload.bomba_caudal || "").trim(),
      bomba_tvu: String(payload.bomba_tvu || "").trim(),
      survey_tipo: String(payload.survey_tipo || "").trim(),
      survey_fecha: String(payload.survey_fecha || "").trim(),
      survey_profundidad: String(payload.survey_profundidad || "").trim(),
      survey_observaciones: String(payload.survey_observaciones || "").trim(),
      updatedAt: serverTs,
      fuente_ultima_actualizacion: "opti-intern-platform"
    },
    { merge: true }
  );

  await safeUpsertMasterPozo(id, {
    id,
    nombre: String(payload.nombre || id).trim(),
    categoria: Number(payload.categoria || 2),
    estado: String(payload.estado || "En observacion").trim(),
    zona: String(payload.area || "N/A").trim(),
    area: String(payload.area || "N/A").trim(),
    potencial: String(toNumber(payload.potencial)),
    arena: String(payload.arena || "").trim(),
    fecha_arranque: String(payload.fecha_arranque || "").trim(),
    velocidad_operacional_rpm: String(toNumber(payload.velocidad_operacional_rpm)),
    bomba_marca: String(payload.bomba_marca || "").trim(),
    bomba_modelo: String(payload.bomba_modelo || "").trim(),
    bomba_caudal: String(payload.bomba_caudal || "").trim(),
    bomba_tvu: String(payload.bomba_tvu || "").trim(),
    survey_tipo: String(payload.survey_tipo || "").trim(),
    survey_fecha: String(payload.survey_fecha || "").trim(),
    survey_profundidad: String(payload.survey_profundidad || "").trim(),
    survey_observaciones: String(payload.survey_observaciones || "").trim()
  });
}

export async function fetchLatestParametros(pozoId, maxRows = 12) {
  if (!db) {
    return [];
  }

  const snapshot = await db
    .collection(MASTER_COLLECTION)
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

export async function fetchLatestTomasNivel(pozoId, maxRows = 12) {
  if (!db) {
    return [];
  }

  const snapshot = await db
    .collection(MASTER_COLLECTION)
    .doc(normalizePozoId(pozoId))
    .collection("tomas_nivel")
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

export async function fetchPozoHistory(pozoId, maxRows = 500) {
  const normalized = normalizePozoId(pozoId);
  const [parametros, niveles] = await Promise.all([
    fetchLatestParametros(normalized, maxRows),
    fetchLatestTomasNivel(normalized, maxRows)
  ]);

  return {
    pozoId: normalized,
    parametros,
    niveles,
    syncedAt: new Date().toISOString()
  };
}

export async function uploadTomaNivelPdf(file, pozoId) {
  if (!storage || !file) {
    return "";
  }

  const safePozo = normalizePozoId(pozoId).replace(/[^a-zA-Z0-9_-]/g, "_");
  const safeName = (file.name || "toma_nivel.pdf").replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `tomas_nivel/${safePozo}/${Date.now()}_${safeName}`;
  const ref = storage.ref(path);
  await ref.put(file, { contentType: "application/pdf" });
  return ref.getDownloadURL();
}

function toCategory(rawCategory, estado) {
  const classif = classifyEstado(estado);
  if (classif.categoria !== null) {
    return classif.categoria;
  }

  const parsed = Number(rawCategory);
  // Validación: categoria 1 solo para estados activos/diagnostico.
  if (parsed === 1) {
    return 2;
  }
  if ([2, 3].includes(parsed)) {
    return parsed;
  }
  return 2;
}

function classifyEstado(estado) {
  const status = normalizeText(estado);

  if (status.includes("diferido")) {
    return { categoria: 3, esDiferido: true };
  }
  if (status.includes("candidato")) {
    return { categoria: 3, esDiferido: false };
  }
  if (status.includes("en servicio") || status.includes("inactivo por servicio")) {
    return { categoria: 2, esDiferido: false };
  }
  if (status.includes("diagnostico")) {
    return { categoria: 1, esDiferido: false };
  }
  if (status.includes("activo") || status.includes("operativo")) {
    return { categoria: 1, esDiferido: false };
  }
  if (status.includes("inactivo")) {
    return { categoria: 2, esDiferido: false };
  }

  return { categoria: null, esDiferido: false };
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

async function safeUpsertMasterPozo(pozoId, patch) {
  try {
    await upsertMasterPozo(pozoId, patch);
  } catch (error) {
    // No bloquear flujo principal si reglas impiden editar array maestro.
  }
}

async function upsertMasterPozo(pozoId, patch) {
  const masterRef = db.collection(MASTER_COLLECTION).doc(MASTER_DOC_ID);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(masterRef);
    const data = snap.exists ? snap.data() || {} : {};
    const current = Array.isArray(data.pozos) ? data.pozos : [];
    const id = String(pozoId);
    const idx = current.findIndex((row) => String(row?.id) === id);
    const cleanPatch = sanitizePatch({ ...patch, id });

    if (idx >= 0) {
      current[idx] = { ...current[idx], ...cleanPatch };
    } else {
      current.push(cleanPatch);
    }

    tx.set(masterRef, { pozos: current }, { merge: true });
  });
}

function sanitizePatch(patch) {
  const output = {};
  Object.entries(patch || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      output[key] = value;
    }
  });
  return output;
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }
  return "";
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
