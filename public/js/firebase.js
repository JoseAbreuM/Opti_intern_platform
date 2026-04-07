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

export async function fetchAccessProfiles(maxRows = 100) {
  if (!db) {
    return [];
  }

  const collections = ["usuarios_app", "usuarios", "app_users", "access_profiles"];
  for (const collectionName of collections) {
    try {
      const snapshot = await db.collection(collectionName).limit(maxRows).get();
      if (snapshot.empty) {
        continue;
      }

      return snapshot.docs
        .map((doc) => {
          const data = doc.data() || {};
          return {
            id: doc.id,
            username: firstNonEmpty(data.username, data.usuario, data.user, doc.id),
            displayName: firstNonEmpty(data.displayName, data.nombre, data.name, data.username, doc.id),
            role: firstNonEmpty(data.role, data.rol, "consulta"),
            passwordHash: firstNonEmpty(data.password_hash, data.passwordHash, data.token_hash, data.tokenHash, data.offline_token_hash),
            password: firstNonEmpty(data.password),
            active: data.active !== false,
            permissions: Array.isArray(data.permissions) ? data.permissions : [],
            views: Array.isArray(data.views) ? data.views : []
          };
        })
        .filter((item) => item.username);
    } catch (error) {
      // Probar siguiente colección.
    }
  }

  return [];
}

export async function saveAccessProfile(profile = {}) {
  if (!db) {
    throw new Error("Firebase no configurado");
  }

  const username = String(profile.username || "").trim().toLowerCase();
  if (!username) {
    throw new Error("username requerido");
  }

  const serverTs = window.firebase.firestore.FieldValue.serverTimestamp();
  await db.collection("usuarios_app").doc(username).set(
    {
      username,
      displayName: String(profile.displayName || username).trim(),
      role: String(profile.role || "consulta").trim().toLowerCase(),
      password_hash: String(profile.passwordHash || profile.password_hash || "").trim(),
      active: profile.active !== false,
      permissions: Array.isArray(profile.permissions) ? profile.permissions : [],
      views: Array.isArray(profile.views) ? profile.views : [],
      updatedAt: serverTs,
      createdByApp: "opti-intern-platform"
    },
    { merge: true }
  );
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
      rpm: toNumber(payload.rpm),
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
      estado: normalizeEstadoCompat(firstNonEmpty(payload.estado, "activo")),
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
          const estado = normalizeEstadoCompat(firstNonEmpty(row.estado, row.status, "activo"));
          const id = String(firstNonEmpty(row.id, row.pozoId, row.pozo_id, `POZO-${idx + 1}`));
          const classif = classifyEstado(estado);
          return {
            id,
            nombre: firstNonEmpty(row.nombre, row.name, row.pozo, id),
            area: firstNonEmpty(row.area, row.zona, row.zone, "N/A"),
            zona: firstNonEmpty(row.zona, row.area, row.zone, "N/A"),
            estado,
            potencial: toNumber(firstNonEmpty(row.potencial, row.potential, row.potencial_pozo, row.pot, 0)),
            categoria: toCategory(firstNonEmpty(row.categoria, row.category), estado),
            esDiferido: classif.esDiferido,
            yacimiento: firstNonEmpty(row.yacimiento, row.arena, row.sand, ""),
            fecha_arranque: firstNonEmpty(row.fecha_arranque, row.start_date, ""),
            velocidad_operacional_rpm: firstNonEmpty(row.velocidad_operacional_rpm, row.velocidad_rpm, row.rpm, ""),
            cabezal: firstNonEmpty(row.cabezal, row.cabezal_tipo, row.tipo_cabezal, row.head, ""),
            variador: firstNonEmpty(row.variador, row.variador_modelo, row.modelo_variador, row.vfd, ""),
            bomba_marca: firstNonEmpty(row.bomba_marca, row.marca_bomba, row.pump_brand, ""),
            bomba_modelo: firstNonEmpty(row.bomba_modelo, row.modelo_bomba, row.pump_model, ""),
            bomba_caudal: firstNonEmpty(row.bomba_caudal, row.caudal_bomba, row.pump_flow, ""),
            bomba_tvu: firstNonEmpty(row.bomba_tvu, row.tvu, ""),
            bomba_fecha_instalacion: firstNonEmpty(row.bomba_fecha_instalacion, row.fecha_instalacion_bomba, ""),
            bomba_observaciones: firstNonEmpty(row.bomba_observaciones, row.observaciones_bomba, ""),
            survey_tipo: firstNonEmpty(row.survey_tipo, row.tipo_survey, row.survey_type, ""),
            survey_fecha: firstNonEmpty(row.survey_fecha, row.fecha_survey, row.survey_date, ""),
            survey_profundidad: firstNonEmpty(row.survey_profundidad, row.profundidad_survey, row.survey_depth, ""),
            survey_observaciones: firstNonEmpty(row.survey_observaciones, row.observaciones_survey, row.survey_notes, ""),
            pdt_fecha_ultima_prueba: firstNonEmpty(row.pdt_fecha_ultima_prueba, row.fecha_ultima_prueba, ""),
            pdt_volumetria: firstNonEmpty(row.pdt_volumetria, row.volumetria_monitoreo, ""),
            pdt_ays: firstNonEmpty(row.pdt_ays, row.ays, ""),
            pdt_causa_diferido: firstNonEmpty(row.pdt_causa_diferido, row.causa_diferido, row.motivo_diferido, ""),
            nota: firstNonEmpty(row.nota, row.note, ""),
            diagnostico: firstNonEmpty(row.diagnostico, row.diagnosis, row.nota_diagnostico, ""),
            motivo: firstNonEmpty(row.motivo, row.razon, row.reason, row.observaciones, ""),
            causaDiferido: firstNonEmpty(row.causaDiferido, row.causa_diferido, row.motivo_diferido, ""),
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

          const estado = normalizeEstadoCompat(firstNonEmpty(data.estado, data.status, "activo"));
          const classif = classifyEstado(estado);
          return {
            id: firstNonEmpty(doc.id, data.id, data.pozoId, data.pozo_id, "POZO-000"),
            nombre: firstNonEmpty(data.nombre, data.name, data.pozo, doc.id),
            area: firstNonEmpty(data.area, data.zona, data.zone, "N/A"),
            zona: firstNonEmpty(data.zona, data.area, data.zone, "N/A"),
            estado,
            potencial: toNumber(firstNonEmpty(data.potencial, data.potential, data.potencial_pozo, data.pot, 0)),
            categoria: toCategory(firstNonEmpty(data.categoria, data.category), estado),
            esDiferido: classif.esDiferido,
            yacimiento: firstNonEmpty(data.yacimiento, data.arena, data.sand, ""),
            fecha_arranque: firstNonEmpty(data.fecha_arranque, data.start_date, ""),
            velocidad_operacional_rpm: firstNonEmpty(data.velocidad_operacional_rpm, data.velocidad_rpm, data.rpm, ""),
            cabezal: firstNonEmpty(data.cabezal, data.cabezal_tipo, data.tipo_cabezal, data.head, ""),
            variador: firstNonEmpty(data.variador, data.variador_modelo, data.modelo_variador, data.vfd, ""),
            bomba_marca: firstNonEmpty(data.bomba_marca, data.marca_bomba, data.pump_brand, ""),
            bomba_modelo: firstNonEmpty(data.bomba_modelo, data.modelo_bomba, data.pump_model, ""),
            bomba_caudal: firstNonEmpty(data.bomba_caudal, data.caudal_bomba, data.pump_flow, ""),
            bomba_tvu: firstNonEmpty(data.bomba_tvu, data.tvu, ""),
            bomba_fecha_instalacion: firstNonEmpty(data.bomba_fecha_instalacion, data.fecha_instalacion_bomba, ""),
            bomba_observaciones: firstNonEmpty(data.bomba_observaciones, data.observaciones_bomba, ""),
            survey_tipo: firstNonEmpty(data.survey_tipo, data.tipo_survey, data.survey_type, ""),
            survey_fecha: firstNonEmpty(data.survey_fecha, data.fecha_survey, data.survey_date, ""),
            survey_profundidad: firstNonEmpty(data.survey_profundidad, data.profundidad_survey, data.survey_depth, ""),
            survey_observaciones: firstNonEmpty(data.survey_observaciones, data.observaciones_survey, data.survey_notes, ""),
            pdt_fecha_ultima_prueba: firstNonEmpty(data.pdt_fecha_ultima_prueba, data.fecha_ultima_prueba, ""),
            pdt_volumetria: firstNonEmpty(data.pdt_volumetria, data.volumetria_monitoreo, ""),
            pdt_ays: firstNonEmpty(data.pdt_ays, data.ays, ""),
            pdt_causa_diferido: firstNonEmpty(data.pdt_causa_diferido, data.causa_diferido, data.motivo_diferido, ""),
            nota: firstNonEmpty(data.nota, data.note, ""),
            diagnostico: firstNonEmpty(data.diagnostico, data.diagnosis, data.nota_diagnostico, ""),
            motivo: firstNonEmpty(data.motivo, data.razon, data.reason, data.observaciones, ""),
            causaDiferido: firstNonEmpty(data.causaDiferido, data.causa_diferido, data.motivo_diferido, ""),
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

      // Unificar ambas fuentes: usar agregado como base y priorizar filas por-documento.
      // Esto evita mostrar datos viejos cuando otra app actualiza docs individuales.
      if (aggregateRows.length && collectionRows.length) {
        const byId = new Map();

        aggregateRows.forEach((row) => {
          const key = String(row.id || "").trim().toLowerCase();
          if (key) {
            byId.set(key, row);
          }
        });

        collectionRows.forEach((row) => {
          const key = String(row.id || "").trim().toLowerCase();
          if (!key) {
            return;
          }

          const base = byId.get(key) || {};
          const merged = mergeWellRows(base, row);

          // Para estado/categoria, priorizar el dataset agregado (mapa) cuando exista.
          if (base.estado) {
            merged.estado = base.estado;
          }
          if (base.categoria !== undefined && base.categoria !== null) {
            merged.categoria = base.categoria;
          }
          if (base.esDiferido !== undefined) {
            merged.esDiferido = base.esDiferido;
          }

          byId.set(key, merged);
        });

        return Array.from(byId.values()).slice(0, maxRows);
      }

      if (collectionRows.length) {
        return collectionRows;
      }

      if (aggregateRows.length) {
        return aggregateRows;
      }
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
  const estadoNormalizado = normalizeEstadoCompat(payload.estado || "activo");

  await db.collection(MASTER_COLLECTION).doc(id).set(
    {
      id,
      nombre: String(payload.nombre || id).trim(),
      categoria: Number(payload.categoria || 2),
      estado: estadoNormalizado,
      area: String(payload.area || "N/A").trim(),
      potencial: toNumber(payload.potencial),
      yacimiento: String(payload.yacimiento || payload.arena || "").trim(),
      fecha_arranque: String(payload.fecha_arranque || "").trim(),
      velocidad_operacional_rpm: toNumber(payload.velocidad_operacional_rpm),
      bomba_marca: String(payload.bomba_marca || "").trim(),
      bomba_modelo: String(payload.bomba_modelo || "").trim(),
      bomba_caudal: String(payload.bomba_caudal || "").trim(),
      bomba_tvu: String(payload.bomba_tvu || "").trim(),
      bomba_fecha_instalacion: String(payload.bomba_fecha_instalacion || "").trim(),
      bomba_observaciones: String(payload.bomba_observaciones || "").trim(),
      survey_tipo: String(payload.survey_tipo || "").trim(),
      survey_fecha: String(payload.survey_fecha || "").trim(),
      survey_profundidad: String(payload.survey_profundidad || "").trim(),
      survey_observaciones: String(payload.survey_observaciones || "").trim(),
      pdt_fecha_ultima_prueba: String(payload.pdt_fecha_ultima_prueba || "").trim(),
      pdt_volumetria: String(payload.pdt_volumetria || "").trim(),
      pdt_ays: String(payload.pdt_ays || "").trim(),
      pdt_causa_diferido: String(payload.pdt_causa_diferido || "").trim(),
      updatedAt: serverTs,
      fuente_ultima_actualizacion: "opti-intern-platform"
    },
    { merge: true }
  );

  await safeUpsertMasterPozo(id, {
    id,
    nombre: String(payload.nombre || id).trim(),
    categoria: Number(payload.categoria || 2),
    estado: estadoNormalizado,
    zona: String(payload.area || "N/A").trim(),
    area: String(payload.area || "N/A").trim(),
    potencial: String(toNumber(payload.potencial)),
    yacimiento: String(payload.yacimiento || payload.arena || "").trim(),
    fecha_arranque: String(payload.fecha_arranque || "").trim(),
    velocidad_operacional_rpm: String(toNumber(payload.velocidad_operacional_rpm)),
    bomba_marca: String(payload.bomba_marca || "").trim(),
    bomba_modelo: String(payload.bomba_modelo || "").trim(),
    bomba_caudal: String(payload.bomba_caudal || "").trim(),
    bomba_tvu: String(payload.bomba_tvu || "").trim(),
    bomba_fecha_instalacion: String(payload.bomba_fecha_instalacion || "").trim(),
    bomba_observaciones: String(payload.bomba_observaciones || "").trim(),
    survey_tipo: String(payload.survey_tipo || "").trim(),
    survey_fecha: String(payload.survey_fecha || "").trim(),
    survey_profundidad: String(payload.survey_profundidad || "").trim(),
    survey_observaciones: String(payload.survey_observaciones || "").trim(),
    pdt_fecha_ultima_prueba: String(payload.pdt_fecha_ultima_prueba || "").trim(),
    pdt_volumetria: String(payload.pdt_volumetria || "").trim(),
    pdt_ays: String(payload.pdt_ays || "").trim(),
    pdt_causa_diferido: String(payload.pdt_causa_diferido || "").trim()
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

export async function fetchLatestBombas(pozoId, maxRows = 100) {
  if (!db) {
    return [];
  }

  const snapshot = await db
    .collection(MASTER_COLLECTION)
    .doc(normalizePozoId(pozoId))
    .collection("historial_bombas")
    .orderBy("fecha_sort_ms", "desc")
    .limit(maxRows)
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data() || {};
    return {
      ...data,
      id: doc.id,
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : firstNonEmpty(data.createdAt, data.fecha_instalacion, new Date().toISOString())
    };
  });
}

export async function fetchLatestPdt(pozoId, maxRows = 100) {
  if (!db) {
    return [];
  }

  const snapshot = await db
    .collection(MASTER_COLLECTION)
    .doc(normalizePozoId(pozoId))
    .collection("historial_pdt")
    .orderBy("fecha_sort_ms", "desc")
    .limit(maxRows)
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data() || {};
    return {
      ...data,
      id: doc.id,
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : firstNonEmpty(data.createdAt, data.fecha_ultima_prueba, new Date().toISOString())
    };
  });
}

export async function fetchPozoHistory(pozoId, maxRows = 500) {
  const normalized = normalizePozoId(pozoId);
  const [parametros, niveles, bombas, pdt] = await Promise.all([
    fetchLatestParametros(normalized, maxRows),
    fetchLatestTomasNivel(normalized, maxRows),
    fetchLatestBombas(normalized, maxRows),
    fetchLatestPdt(normalized, maxRows)
  ]);

  return {
    pozoId: normalized,
    parametros,
    niveles,
    bombas,
    pdt,
    syncedAt: new Date().toISOString()
  };
}

export async function importExternalWellData({ bombaRows = [], pdtRows = [] } = {}) {
  if (!db) {
    throw new Error("Firebase no configurado");
  }

  const serverTs = window.firebase.firestore.FieldValue.serverTimestamp();
  const writeOps = [];
  const latestBombasByPozo = new Map();
  const summaryPdtByPozo = new Map();

  bombaRows.forEach((row) => {
    const pozoId = normalizePozoId(row.pozoId);
    if (!pozoId) {
      return;
    }

    const pozoRef = db.collection(MASTER_COLLECTION).doc(pozoId);
    const docId = buildHistoryDocId([
      pozoId,
      row.fecha_instalacion,
      row.marca,
      row.modelo,
      row.tvu_dias,
      row.observaciones
    ]);
    const payload = {
      pozoId,
      marca: String(row.marca || "").trim(),
      modelo: String(row.modelo || "").trim(),
      fecha_instalacion: String(row.fecha_instalacion || "").trim(),
      fecha_sort_ms: toNumber(row.fecha_sort_ms),
      tvu_dias: String(row.tvu_dias || "").trim(),
      observaciones: String(row.observaciones || "").trim(),
      sourceApp: "opti-intern-platform",
      createdAt: serverTs
    };

    writeOps.push((batch) => batch.set(pozoRef.collection("historial_bombas").doc(docId), payload, { merge: true }));

    const current = latestBombasByPozo.get(pozoId);
    if (!current || toNumber(row.fecha_sort_ms) >= toNumber(current.fecha_sort_ms)) {
      latestBombasByPozo.set(pozoId, payload);
    }
  });

  pdtRows.forEach((row) => {
    const pozoId = normalizePozoId(row.pozoId);
    if (!pozoId) {
      return;
    }

    const pozoRef = db.collection(MASTER_COLLECTION).doc(pozoId);
    const docId = buildHistoryDocId([
      pozoId,
      row.fecha_ultima_prueba,
      row.yacimiento,
      row.volumetria,
      row.ays,
      row.causa_diferido
    ]);
    const payload = {
      pozoId,
      yacimiento: String(row.yacimiento || "").trim(),
      fecha_ultima_prueba: String(row.fecha_ultima_prueba || "").trim(),
      fecha_sort_ms: toNumber(row.fecha_sort_ms),
      volumetria: String(row.volumetria || "").trim(),
      ays: String(row.ays || "").trim(),
      causa_diferido: String(row.causa_diferido || "").trim(),
      sourceApp: "opti-intern-platform",
      createdAt: serverTs
    };

    writeOps.push((batch) => batch.set(pozoRef.collection("historial_pdt").doc(docId), payload, { merge: true }));

    const summary = {
      id: pozoId,
      yacimiento: payload.yacimiento,
      updatedAt: serverTs,
      fuente_ultima_actualizacion: "opti-intern-platform"
    };

    if (row.updateSummary) {
      summary.pdt_fecha_ultima_prueba = payload.fecha_ultima_prueba;
      summary.pdt_volumetria = payload.volumetria;
      summary.pdt_ays = payload.ays;
      summary.pdt_causa_diferido = payload.causa_diferido;
    }

    summaryPdtByPozo.set(pozoId, { ...summaryPdtByPozo.get(pozoId), ...summary });
  });

  latestBombasByPozo.forEach((row, pozoId) => {
    const pozoRef = db.collection(MASTER_COLLECTION).doc(pozoId);
    writeOps.push((batch) => batch.set(
      pozoRef,
      {
        id: pozoId,
        bomba_marca: row.marca,
        bomba_modelo: row.modelo,
        bomba_tvu: row.tvu_dias,
        bomba_fecha_instalacion: row.fecha_instalacion,
        bomba_observaciones: row.observaciones,
        updatedAt: serverTs,
        fuente_ultima_actualizacion: "opti-intern-platform"
      },
      { merge: true }
    ));
  });

  summaryPdtByPozo.forEach((row, pozoId) => {
    const pozoRef = db.collection(MASTER_COLLECTION).doc(pozoId);
    writeOps.push((batch) => batch.set(pozoRef, row, { merge: true }));
  });

  await commitBatchWriters(writeOps, 400);

  return {
    bombas: bombaRows.length,
    pdt: pdtRows.length,
    pozosActualizados: latestBombasByPozo.size + summaryPdtByPozo.size
  };
}

export async function deletePozoHistoryRecord(pozoId, kind, docId) {
  if (!db) {
    throw new Error("Firebase no configurado");
  }

  const normalized = normalizePozoId(pozoId);
  const collection = historyCollectionByKind(kind);
  await db.collection(MASTER_COLLECTION).doc(normalized).collection(collection).doc(String(docId || "").trim()).delete();
}

export async function upsertPozoHistoryRecord(pozoId, kind, docId, payload = {}) {
  if (!db) {
    throw new Error("Firebase no configurado");
  }

  const normalized = normalizePozoId(pozoId);
  const collection = historyCollectionByKind(kind);
  const serverTs = window.firebase.firestore.FieldValue.serverTimestamp();
  const id = String(docId || "").trim();
  if (!id) {
    throw new Error("docId requerido para actualizar historial");
  }

  await db
    .collection(MASTER_COLLECTION)
    .doc(normalized)
    .collection(collection)
    .doc(id)
    .set(
      {
        ...sanitizePatch(payload),
        updatedAt: serverTs,
        sourceApp: "opti-intern-platform"
      },
      { merge: true }
    );
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
  const parsed = Number(rawCategory);
  // Si viene categoría explícita del origen, respetarla.
  if ([1, 2, 3].includes(parsed)) {
    return parsed;
  }

  const classif = classifyEstado(normalizeEstadoCompat(estado));
  if (classif.categoria !== null) {
    return classif.categoria;
  }
  return 2;
}

function classifyEstado(estado) {
  const status = normalizeEstadoCompat(estado);

  if (status === "diferido") {
    return { categoria: 3, esDiferido: true };
  }
  if (status === "candidato") {
    return { categoria: 3, esDiferido: false };
  }
  if (status === "en-servicio" || status === "inactivo-servicio") {
    return { categoria: 2, esDiferido: false };
  }
  if (status === "diagnostico") {
    return { categoria: 1, esDiferido: false };
  }
  if (status === "activo") {
    return { categoria: 1, esDiferido: false };
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

function normalizeEstadoCompat(rawEstado) {
  const clean = normalizeText(rawEstado);
  if (clean === "inactivo" || clean === "inactivo por servicio") {
    return "inactivo-servicio";
  }
  if (
    clean === "revision" ||
    clean === "revision" ||
    clean === "en revision" ||
    clean === "en revision" ||
    clean === "diagnostico" ||
    clean === "diagnostico"
  ) {
    return "diagnostico";
  }
  if (clean === "diferido") {
    return "diferido";
  }
  if (clean === "en servicio") {
    return "en-servicio";
  }
  if (
    clean === "activo" ||
    clean === "inactivo-servicio" ||
    clean === "en-servicio" ||
    clean === "diagnostico" ||
    clean === "candidato" ||
    clean === "diferido"
  ) {
    return clean;
  }
  return "activo";
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

function mergeWellRows(base = {}, incoming = {}) {
  const merged = { ...base };
  Object.keys(incoming).forEach((key) => {
    const nextValue = incoming[key];
    const currentValue = merged[key];

    const isNextEmpty = nextValue === undefined
      || nextValue === null
      || (typeof nextValue === "string" && nextValue.trim() === "");

    if (isNextEmpty) {
      merged[key] = currentValue;
      return;
    }

    merged[key] = nextValue;
  });

  return merged;
}

function historyCollectionByKind(kind) {
  if (kind === "parametros") {
    return "parametros";
  }
  if (kind === "niveles") {
    return "tomas_nivel";
  }
  if (kind === "bombas") {
    return "historial_bombas";
  }
  return "historial_pdt";
}

async function commitBatchWriters(writers, chunkSize = 400) {
  for (let index = 0; index < writers.length; index += chunkSize) {
    const chunk = writers.slice(index, index + chunkSize);
    const batch = db.batch();
    chunk.forEach((writer) => writer(batch));
    await batch.commit();
  }
}

function buildHistoryDocId(parts) {
  return String(parts.filter(Boolean).join("_"))
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120) || `hist-${Date.now()}`;
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
