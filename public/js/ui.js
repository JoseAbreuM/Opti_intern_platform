import { calcularPotenciaYTorque } from "./calculos.js";
import {
  cachePozoHistory,
  cacheWellsSnapshot,
  getCachedPozoHistory,
  getCachedWellsSnapshot,
  getLatestRecords,
  getOfflineDatasetMeta,
  saveFormData,
  setOfflineDatasetMeta,
  syncPendingToFirebase
} from "./db.js";
import {
  cacheAccessProfiles,
  clearUserSession,
  createInitialAccess,
  getCachedAccessProfiles,
  loginWithCredentials,
  restoreUserSession
} from "./auth.js";
import {
  fetchAccessProfiles,
  fetchAllPozos,
  fetchLatestParametros,
  fetchLatestTomasNivel,
  fetchPozoHistory,
  fetchPozos,
  deletePozoHistoryRecord,
  importExternalWellData,
  isFirebaseReady,
  normalizePozoId,
  saveAccessProfile,
  syncRecordToFirebase,
  upsertPozoHistoryRecord,
  updatePozoBaseData,
  uploadTomaNivelPdf
} from "./firebase.js";

const state = {
  wells: [],
  parametrosByPozo: new Map(),
  nivelesByPozo: new Map(),
  bombasByPozo: new Map(),
  pdtByPozo: new Map(),
  activePozoId: "POZO-001",
  charts: {
    general: null,
    category: null,
    parametrosTrend: null,
    nivelesTrend: null,
    bombasMarca: null,
    bombasTvu: null
  },
  auth: {
    user: null
  },
  hasBootstrapped: false,
  wellsDataTable: null,
  bombasDataTable: null,
  parametrosHistoryDataTable: null,
  nivelesHistoryDataTable: null,
  bombasHistoryDataTable: null,
  pdtHistoryDataTable: null
};

const AUTO_XLS_IMPORT_KEY = "optiAutoXlsImported_v2";

const ROLE_ACCESS = {
  optimizacion: { views: ["*"], permissions: ["*"] },
  consulta: { views: ["dashboard", "pozos", "bombas", "ficha"], permissions: ["view.map", "view.history", "export.basic"] }
};

const views = {
  dashboard: document.getElementById("view-dashboard"),
  pozos: document.getElementById("view-pozos"),
  bombas: document.getElementById("view-bombas"),
  carga: document.getElementById("view-carga"),
  nivel: document.getElementById("view-nivel"),
  ficha: document.getElementById("view-ficha")
};

const authScreen = document.getElementById("authScreen");
const platformShell = document.getElementById("platformShell");
const loginForm = document.getElementById("loginForm");
const loginUsernameInput = document.getElementById("loginUsername");
const loginPasswordInput = document.getElementById("loginPassword");
const loginStatus = document.getElementById("loginStatus");
const openBootstrapAuthBtn = document.getElementById("openBootstrapAuthBtn");
const authBootstrapDialog = document.getElementById("authBootstrapDialog");
const authBootstrapForm = document.getElementById("authBootstrapForm");
const authBootstrapStatus = document.getElementById("authBootstrapStatus");
const cancelBootstrapAuthBtn = document.getElementById("cancelBootstrapAuth");
const sidebar = document.getElementById("sidebar");
const sidebarBackdrop = document.getElementById("sidebarBackdrop");
const installAppBtn = document.getElementById("installAppBtn");
const connectionBadge = document.getElementById("connectionBadge");
const syncBadge = document.getElementById("syncBadge");
const hpCalculadoEl = document.getElementById("hpCalculado");
const torqueAutoCalculadoEl = document.getElementById("torqueAutoCalculado");
const torqueCalculadoEl = document.getElementById("torqueCalculado");
const useManualTorqueEl = document.getElementById("useManualTorque");
const parametrosTableBody = document.getElementById("parametrosTableBody");
const nivelesTableBody = document.getElementById("nivelesTableBody");
const wellsTableBody = document.getElementById("wellsTableBody");
const bombasTableBody = document.getElementById("bombasTableBody");
const selectedPozoLabel = document.getElementById("selectedPozoLabel");
const historicoFileInput = document.getElementById("historicoFileInput");
const wellEditDialog = document.getElementById("wellEditDialog");
const wellEditForm = document.getElementById("wellEditForm");
const wellEditEstadoSelect = wellEditForm.querySelector('select[name="estado"]');
const wellEditAreaSelect = wellEditForm.querySelector('select[name="area"]');
const pdfViewer = document.getElementById("pdfViewer");
const latestNivelPdfWrap = document.getElementById("latestNivelPdfWrap");
const mobileNoteToast = document.getElementById("mobileNoteToast");
const mobileNoteToastText = document.getElementById("mobileNoteToastText");
const mobileNoteToastClose = document.getElementById("mobileNoteToastClose");
const parametrosTrendMetricSelect = document.getElementById("parametrosTrendMetric");
const nivelesTrendMetricSelect = document.getElementById("nivelesTrendMetric");
const fgCabezalRow = document.getElementById("fgCabezalRow");
const fgVariadorRow = document.getElementById("fgVariadorRow");
const pozoBombaCard = document.getElementById("pozoBombaCard");
const pozoPdtCard = document.getElementById("pozoPdtCard");
const parametrosSection = document.getElementById("parametrosSection");
const categoryNoteCard = document.getElementById("categoryNoteCard");
const categoryNoteTitle = document.getElementById("categoryNoteTitle");
const categoryNoteText = document.getElementById("categoryNoteText");

const fichaFields = {
  pozoId: document.getElementById("fgPozoId"),
  zona: document.getElementById("fgZona"),
  estado: document.getElementById("fgEstado"),
  cabezal: document.getElementById("fgCabezal"),
  variador: document.getElementById("fgVariador"),
  yacimiento: document.getElementById("fgYacimiento"),
  fechaArranque: document.getElementById("fgFechaArranque"),
  velocidadRpm: document.getElementById("fgVelocidadRpm"),
  potencial: document.getElementById("fgPotencial"),
  bombaMarca: document.getElementById("fbMarca"),
  bombaModelo: document.getElementById("fbModelo"),
  bombaFechaInstalacion: document.getElementById("fbFechaInstalacion"),
  bombaCaudal: document.getElementById("fbCaudal"),
  bombaTvu: document.getElementById("fbTvu"),
  bombaObservaciones: document.getElementById("fbObservaciones"),
  pdtFechaPrueba: document.getElementById("fpdtFechaPrueba"),
  pdtVolumetria: document.getElementById("fpdtVolumetria"),
  pdtAys: document.getElementById("fpdtAys"),
  pdtCausaDiferido: document.getElementById("fpdtCausaDiferido"),
  surveyTipo: document.getElementById("fsTipo"),
  surveyFecha: document.getElementById("fsFecha"),
  surveyProfundidad: document.getElementById("fsProfundidad"),
  surveyObservaciones: document.getElementById("fsObservaciones"),
  compDiagrama: document.getElementById("fcDiagrama"),
  compNumTuberias: document.getElementById("fcNumTuberias"),
  compDiamTuberias: document.getElementById("fcDiamTuberias"),
  compNumCabillas: document.getElementById("fcNumCabillas"),
  compDiamCabillas: document.getElementById("fcDiamCabillas"),
  compLongCabillas: document.getElementById("fcLongCabillas")
};

const parametrosHistoryDialog = document.getElementById("parametrosHistoryDialog");
const nivelesHistoryDialog = document.getElementById("nivelesHistoryDialog");
const bombasHistoryDialog = document.getElementById("bombasHistoryDialog");
const pdtHistoryDialog = document.getElementById("pdtHistoryDialog");
const parametrosHistoryBody = document.getElementById("parametrosHistoryBody");
const nivelesHistoryBody = document.getElementById("nivelesHistoryBody");
const bombasHistoryBody = document.getElementById("bombasHistoryBody");
const pdtHistoryBody = document.getElementById("pdtHistoryBody");
const kpiBombasTotal = document.getElementById("kpiBombasTotal");
const kpiBombasPozos = document.getElementById("kpiBombasPozos");
const kpiBombasTvu = document.getElementById("kpiBombasTvu");
const authRoleBadge = document.getElementById("authRoleBadge");
const authUserBadge = document.getElementById("authUserBadge");
const logoutBtn = document.getElementById("logoutBtn");
const cardEditDialog = document.getElementById("cardEditDialog");
const cardEditForm = document.getElementById("cardEditForm");
const cardEditTitle = document.getElementById("cardEditTitle");
const cardEditFields = document.getElementById("cardEditFields");
const cancelCardEditBtn = document.getElementById("cancelCardEdit");
let deferredInstallPrompt = null;

setupNavigation();
setupForms();
setupWellsTableActions();
setupExport();
setupHistoryDialogs();
setupTrendControls();
setupCardCrud();
setupPWA();
setupAuthUi();
initializeApplication();

function setupNavigation() {
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.addEventListener("click", () => {
      const viewName = button.dataset.view;
      switchView(viewName);
      setActiveNav(viewName);
      closeMobileSidebar();
    });
  });

  const toggleSidebar = document.getElementById("toggleSidebar");
  toggleSidebar.addEventListener("click", () => {
    if (window.matchMedia("(max-width: 768px)").matches) {
      sidebar.classList.toggle("is-open");
      sidebarBackdrop?.classList.toggle("is-visible", sidebar.classList.contains("is-open"));
      return;
    }

    sidebar.classList.toggle("is-collapsed");
  });

  sidebarBackdrop?.addEventListener("click", closeMobileSidebar);
}

function closeMobileSidebar() {
  sidebar.classList.remove("is-open");
  sidebarBackdrop?.classList.remove("is-visible");
}

function setupForms() {
  const parametrosForm = document.getElementById("parametrosForm");
  const nivelForm = document.getElementById("nivelForm");
  const torqueManualInput = parametrosForm.querySelector('input[name="torqueManual"]');

  function recalcParametros() {
    const data = new FormData(parametrosForm);
    if (!useManualTorqueEl?.checked) {
      data.set("torqueManual", "");
    }
    const result = calcularPotenciaYTorque(Object.fromEntries(data.entries()));
    hpCalculadoEl.textContent = result.potenciaHp.toFixed(2);
    torqueAutoCalculadoEl.textContent = result.torqueTeoricoNm.toFixed(2);
    torqueCalculadoEl.textContent = result.torqueAplicadoNm.toFixed(2);
  }

  function syncTorqueMode() {
    const useManual = Boolean(useManualTorqueEl?.checked);
    if (torqueManualInput) {
      torqueManualInput.disabled = !useManual;
      if (!useManual) {
        torqueManualInput.value = "";
      }
    }
    recalcParametros();
  }

  parametrosForm.addEventListener("input", () => {
    recalcParametros();
  });

  useManualTorqueEl?.addEventListener("change", () => {
    syncTorqueMode();
  });

  syncTorqueMode();

  parametrosForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(parametrosForm).entries());
    if (!useManualTorqueEl?.checked) {
      payload.torqueManual = "";
    }
    const result = calcularPotenciaYTorque(payload);
    const pozoId = normalizePozoId(payload.pozoId);

    const record = {
      ...payload,
      pozoId,
      potenciaHp: result.potenciaHp,
      torqueTeoricoNm: result.torqueTeoricoNm,
      torqueAplicadoNm: result.torqueAplicadoNm,
      tipo: "parametros"
    };

    await saveFormData("parametros", record);
    upsertLocalPozo({ id: pozoId, nombre: pozoId, categoria: 2, estado: "En observacion", area: "N/A", potencial: 0 });
    addLocalParametro(pozoId, { ...record, createdAt: new Date().toISOString() });
    await setActivePozo(pozoId);
    await trySync();
    renderDashboard();
    renderWellsTable();

    parametrosForm.reset();
    parametrosForm.pozoId.value = pozoId;
    if (useManualTorqueEl) {
      useManualTorqueEl.checked = false;
    }
    syncTorqueMode();
  });

  nivelForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(nivelForm);
    const payload = Object.fromEntries(formData.entries());
    const pozoId = normalizePozoId(payload.pozoId);
    const pdfFile = formData.get("nivelPdf");

    let reportePdfUrl = "";
    if (pdfFile && pdfFile.size > 0 && navigator.onLine && isFirebaseReady()) {
      try {
        reportePdfUrl = await uploadTomaNivelPdf(pdfFile, pozoId);
      } catch (error) {
        reportePdfUrl = "";
      }
    }

    const record = {
      ...payload,
      pozoId,
      reportePdfUrl,
      tipo: "toma_nivel"
    };

    await saveFormData("toma_nivel", record);
    upsertLocalPozo({ id: pozoId, nombre: pozoId, categoria: 2, estado: "En observacion", area: "N/A", potencial: 0 });
    addLocalNivel(pozoId, { ...record, createdAt: new Date().toISOString() });
    await setActivePozo(pozoId);
    await trySync();

    nivelForm.reset();
    nivelForm.pozoId.value = pozoId;
  });
}

function setupWellsTableActions() {
  mobileNoteToastClose?.addEventListener("click", () => {
    hideMobileNoteToast();
  });

  wellsTableBody.addEventListener("click", (event) => {
    const statusChip = event.target.closest(".status-chip[data-note]");
    if (statusChip && isMobileViewport()) {
      showMobileNoteToast(statusChip.dataset.note || "Sin nota registrada.");
      return;
    }

    const actionButton = event.target.closest("button[data-action]");
    if (!actionButton) {
      return;
    }

    const pozoId = actionButton.dataset.pozoId;
    if (actionButton.dataset.action === "view") {
      setActivePozo(pozoId);
      switchView("ficha");
      setActiveNav("ficha");
      return;
    }

    if (actionButton.dataset.action === "edit") {
      openWellEdit(pozoId);
    }
  });

  historicoFileInput?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    await importHistoricoExcel(file);
    event.target.value = "";
  });

  document.getElementById("cancelWellEdit").addEventListener("click", () => {
    wellEditDialog.close();
  });

  wellEditForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(wellEditForm).entries());
    const pozoId = normalizePozoId(payload.id);

    const updated = {
      id: pozoId,
      nombre: payload.nombre,
      categoria: Number(payload.categoria),
      estado: payload.estado,
      area: payload.area,
      potencial: Number(payload.potencial || 0),
      yacimiento: String(payload.yacimiento || "").trim(),
      fecha_arranque: String(payload.fecha_arranque || "").trim(),
      velocidad_operacional_rpm: Number(payload.velocidad_operacional_rpm || 0),
      bomba_marca: String(payload.bomba_marca || "").trim(),
      bomba_modelo: String(payload.bomba_modelo || "").trim(),
      bomba_caudal: String(payload.bomba_caudal || "").trim(),
      bomba_tvu: String(payload.bomba_tvu || "").trim(),
      survey_tipo: String(payload.survey_tipo || "").trim(),
      survey_fecha: String(payload.survey_fecha || "").trim(),
      survey_profundidad: String(payload.survey_profundidad || "").trim(),
      survey_observaciones: String(payload.survey_observaciones || "").trim()
    };

    replaceLocalPozo(updated);
    if (isFirebaseReady() && navigator.onLine) {
      await updatePozoBaseData(pozoId, updated);
    }

    renderWellsTable();
    renderDashboard();
    wellEditDialog.close();
  });
}

function setupExport() {
  document.getElementById("openMapLocationBtn").addEventListener("click", () => {
    openMapLocation();
  });

  document.getElementById("exportExcelBtn").addEventListener("click", () => {
    const wb = XLSX.utils.table_to_book(document.getElementById("parametrosTable"), { sheet: "Parametros" });
    XLSX.writeFile(wb, `parametros_${state.activePozoId}_${Date.now()}.xlsx`);
  });

  document.getElementById("exportFichaPdfBtn").addEventListener("click", () => {
    exportFichaTecnicaPdf();
  });
}

function setupHistoryDialogs() {
  document.getElementById("openParametrosHistoryBtn").addEventListener("click", () => {
    openParametrosHistoryDialog();
  });

  document.getElementById("openNivelesHistoryBtn").addEventListener("click", () => {
    openNivelesHistoryDialog();
  });

  document.getElementById("openBombasHistoryBtn")?.addEventListener("click", () => {
    openBombasHistoryDialog();
  });

  document.getElementById("openPdtHistoryBtn")?.addEventListener("click", () => {
    openPdtHistoryDialog();
  });

  document.getElementById("addBombaRecordBtn")?.addEventListener("click", () => {
    openCardEditDialog("bomba_add");
  });

  document.getElementById("editBombaCardBtn")?.addEventListener("click", () => {
    openCardEditDialog("bomba_edit");
  });

  document.getElementById("addPdtRecordBtn")?.addEventListener("click", () => {
    openCardEditDialog("pdt_add");
  });

  document.getElementById("editPdtCardBtn")?.addEventListener("click", () => {
    openCardEditDialog("pdt_edit");
  });

  document.getElementById("editGeneralCardBtn")?.addEventListener("click", () => {
    openCardEditDialog("general");
  });

  document.getElementById("editCompletacionCardBtn")?.addEventListener("click", () => {
    openCardEditDialog("completacion");
  });

  document.getElementById("editSurveyCardBtn")?.addEventListener("click", () => {
    openCardEditDialog("survey");
  });

  document.addEventListener("click", async (event) => {
    const deleteBtn = event.target.closest("button.delete-history-row");
    const editBtn = event.target.closest("button.edit-history-row");
    if (!deleteBtn && !editBtn) {
      return;
    }

    if (!hasPermission("crud.history")) {
      syncBadge.textContent = "Tu rol no tiene permisos para modificar historicos";
      return;
    }

    if (editBtn) {
      const kind = String(editBtn.dataset.kind || "");
      const key = String(editBtn.dataset.key || "");
      if (!kind || !key) {
        return;
      }
      openCardEditDialog(`${kind}_row_edit`, key);
      return;
    }

    const kind = deleteBtn.dataset.kind;
    const docId = deleteBtn.dataset.id;
    const rowKey = String(deleteBtn.dataset.key || "");
    const pozoId = state.activePozoId;
    if (!kind || !rowKey || !pozoId) {
      return;
    }

    if (!window.confirm("Se eliminara el registro historico. Deseas continuar?")) {
      return;
    }

    removeHistoryRecordFromState(kind, pozoId, rowKey);

    if (docId && navigator.onLine && isFirebaseReady()) {
      try {
        await deletePozoHistoryRecord(pozoId, kind, docId);
      } catch (error) {
        syncBadge.textContent = "No se pudo eliminar en Firebase";
      }
    }

    renderWellsTable();
    renderPozoDetail();
  });
}

function removeHistoryRecordFromState(kind, pozoId, rowKey) {
  const mapRef = kind === "parametros"
    ? state.parametrosByPozo
    : kind === "niveles"
      ? state.nivelesByPozo
      : kind === "bombas"
        ? state.bombasByPozo
        : state.pdtByPozo;

  const current = mapRef.get(pozoId) || [];
  mapRef.set(pozoId, current.filter((item) => getHistoryRecordKey(kind, item) !== rowKey));
}

function setupTrendControls() {
  parametrosTrendMetricSelect?.addEventListener("change", () => {
    renderPozoDetail();
  });

  nivelesTrendMetricSelect?.addEventListener("change", () => {
    renderPozoDetail();
  });
}

function setupCardCrud() {
  cancelCardEditBtn?.addEventListener("click", () => {
    cardEditDialog?.close();
  });

  cardEditForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!hasPermission("crud.cards")) {
      syncBadge.textContent = "Tu rol no tiene permisos para editar tarjetas";
      return;
    }
    const payload = Object.fromEntries(new FormData(cardEditForm).entries());
    const type = String(payload.type || "");
    const recordKey = String(payload.recordKey || "");
    const pozoId = normalizePozoId(payload.pozoId || state.activePozoId);
    const currentWell = getExistingWell(pozoId) || {};

    if (!type || !pozoId) {
      return;
    }

    try {
      if (type === "general") {
        const patch = {
          id: pozoId,
          nombre: firstNonEmpty(payload.nombre, currentWell.nombre, pozoId),
          categoria: Number(payload.categoria || currentWell.categoria || 2),
          estado: firstNonEmpty(payload.estado, currentWell.estado, "En observacion"),
          area: firstNonEmpty(payload.area, currentWell.area, "N/A"),
          potencial: Number(payload.potencial || currentWell.potencial || 0),
          cabezal: String(payload.cabezal || "").trim(),
          variador: String(payload.variador || "").trim(),
          yacimiento: String(payload.yacimiento || "").trim(),
          fecha_arranque: String(payload.fecha_arranque || "").trim(),
          velocidad_operacional_rpm: Number(payload.velocidad_operacional_rpm || currentWell.velocidad_operacional_rpm || 0)
        };
        await persistWellPatch(patch);
      }

      if (type === "completacion") {
        const patch = {
          id: pozoId,
          diagrama_mecanico: String(payload.diagrama_mecanico || "").trim(),
          num_tuberias: String(payload.num_tuberias || "").trim(),
          diametro_tuberias: String(payload.diametro_tuberias || "").trim(),
          num_cabillas: String(payload.num_cabillas || "").trim(),
          diametro_cabillas: String(payload.diametro_cabillas || "").trim(),
          longitud_cabillas: String(payload.longitud_cabillas || "").trim()
        };
        await persistWellPatch(patch);
      }

      if (type === "survey") {
        const patch = {
          id: pozoId,
          survey_tipo: String(payload.survey_tipo || "").trim(),
          survey_fecha: String(payload.survey_fecha || "").trim(),
          survey_profundidad: String(payload.survey_profundidad || "").trim(),
          survey_observaciones: String(payload.survey_observaciones || "").trim()
        };
        await persistWellPatch(patch);
      }

      if (type === "bomba_add" || type === "bomba_edit") {
        const fechaIso = payload.fecha_instalacion ? normalizeDate(payload.fecha_instalacion) : new Date().toISOString();
        const record = {
          pozoId,
          marca: String(payload.marca || "").trim(),
          modelo: String(payload.modelo || "").trim(),
          fecha_instalacion: fechaIso,
          createdAt: fechaIso,
          fecha_sort_ms: toTimeMs(fechaIso),
          tvu_dias: String(payload.tvu_dias || "").trim(),
          observaciones: String(payload.observaciones || "").trim()
        };

        const current = state.bombasByPozo.get(pozoId) || [];
        state.bombasByPozo.set(pozoId, dedupeByKey([record, ...current], bombaKey));
        await persistWellPatch({
          id: pozoId,
          bomba_marca: record.marca,
          bomba_modelo: record.modelo,
          bomba_tvu: record.tvu_dias,
          bomba_fecha_instalacion: record.fecha_instalacion,
          bomba_observaciones: record.observaciones,
          bomba_caudal: String(payload.bomba_caudal || currentWell.bomba_caudal || "").trim()
        }, { skipRender: true });

        if (navigator.onLine && isFirebaseReady()) {
          await importExternalWellData({ bombaRows: [record], pdtRows: [] });
          const remoteHistory = await fetchPozoHistory(pozoId, 200);
          state.bombasByPozo.set(pozoId, dedupeByKey(remoteHistory.bombas || [], bombaKey));
          await cachePozoHistory(pozoId, remoteHistory);
        }
      }

      if (type === "pdt_add" || type === "pdt_edit") {
        const fechaIso = payload.fecha_ultima_prueba ? normalizeDate(payload.fecha_ultima_prueba) : "";
        const updateSummary = shouldShowPdtSummary(currentWell);
        const record = {
          pozoId,
          yacimiento: cleanYacimientoValue(payload.yacimiento || currentWell.yacimiento || "N/A"),
          fecha_ultima_prueba: fechaIso,
          createdAt: fechaIso || new Date().toISOString(),
          fecha_sort_ms: fechaIso ? toTimeMs(fechaIso) : 0,
          volumetria: String(payload.volumetria || "").trim(),
          ays: String(payload.ays || "").trim(),
          causa_diferido: String(payload.causa_diferido || "").trim(),
          updateSummary
        };

        const current = state.pdtByPozo.get(pozoId) || [];
        state.pdtByPozo.set(pozoId, dedupeByKey([record, ...current], pdtKey));

        const patch = { id: pozoId, yacimiento: record.yacimiento };
        if (updateSummary) {
          patch.pdt_fecha_ultima_prueba = record.fecha_ultima_prueba;
          patch.pdt_volumetria = record.volumetria;
          patch.pdt_ays = record.ays;
          patch.pdt_causa_diferido = record.causa_diferido;
        }
        await persistWellPatch(patch, { skipRender: true });

        if (navigator.onLine && isFirebaseReady()) {
          await importExternalWellData({ bombaRows: [], pdtRows: [record] });
          const remoteHistory = await fetchPozoHistory(pozoId, 200);
          state.pdtByPozo.set(pozoId, dedupeByKey(remoteHistory.pdt || [], pdtKey));
          await cachePozoHistory(pozoId, remoteHistory);
        }
      }

      if (type.endsWith("_row_edit")) {
        const kind = type.replace("_row_edit", "");
        await saveHistoryRowEdit(kind, recordKey, payload, pozoId);
      }
    } finally {
      renderWellsTable();
      if (normalizePozoId(state.activePozoId) === pozoId) {
        renderPozoDetail();
      }
      cardEditDialog?.close();
    }
  });
}

function openCardEditDialog(type, recordKey = "") {
  if (!cardEditDialog || !cardEditForm || !cardEditFields || !cardEditTitle) {
    return;
  }

  if (type.endsWith("_row_edit")) {
    if (!hasPermission("crud.history")) {
      syncBadge.textContent = "Tu rol no tiene permisos para editar historicos";
      return;
    }
  } else if (!hasPermission("crud.cards")) {
    syncBadge.textContent = "Tu rol no tiene permisos para editar tarjetas";
    return;
  }

  const well = getActiveWell() || {};
  const pozoId = state.activePozoId;
  const latestBomba = (state.bombasByPozo.get(pozoId) || []).slice().sort(sortByDateDesc)[0] || {};
  const latestPdt = (state.pdtByPozo.get(pozoId) || []).slice().sort(sortByDateDesc)[0] || {};

  const templates = {
    general: {
      title: "Editar Ficha General",
      html: `
        <label>Nombre<input type="text" name="nombre" value="${escapeHtml(firstNonEmpty(well.nombre, pozoId))}" /></label>
        <label>Categoria
          <select name="categoria">
            <option value="1" ${Number(well.categoria) === 1 ? "selected" : ""}>Cat-1</option>
            <option value="2" ${Number(well.categoria || 2) === 2 ? "selected" : ""}>Cat-2</option>
            <option value="3" ${Number(well.categoria) === 3 ? "selected" : ""}>Cat-3</option>
          </select>
        </label>
        <label>Estado<input type="text" name="estado" value="${escapeHtml(firstNonEmpty(well.estado, "En observacion"))}" /></label>
        <label>Area<input type="text" name="area" value="${escapeHtml(firstNonEmpty(well.area, "N/A"))}" /></label>
        <label>Potencial<input type="number" step="0.01" name="potencial" value="${escapeHtml(firstNonEmpty(well.potencial, 0))}" /></label>
        <label>Cabezal<input type="text" name="cabezal" value="${escapeHtml(firstNonEmpty(well.cabezal, well.cabezal_tipo, ""))}" /></label>
        <label>Variador<input type="text" name="variador" value="${escapeHtml(firstNonEmpty(well.variador, well.variador_modelo, ""))}" /></label>
        <label>Yacimiento<input type="text" name="yacimiento" value="${escapeHtml(firstNonEmpty(well.yacimiento, well.arena, ""))}" /></label>
        <label>Fecha Arranque<input type="date" name="fecha_arranque" value="${escapeHtml(firstNonEmpty(well.fecha_arranque, ""))}" /></label>
        <label>RPM<input type="number" step="1" name="velocidad_operacional_rpm" value="${escapeHtml(firstNonEmpty(well.velocidad_operacional_rpm, 0))}" /></label>
      `
    },
    bomba_add: {
      title: "Agregar Registro de Bomba",
      html: `
        <label>Marca<input type="text" name="marca" value="${escapeHtml(firstNonEmpty(latestBomba.marca, well.bomba_marca, ""))}" /></label>
        <label>Modelo<input type="text" name="modelo" value="${escapeHtml(firstNonEmpty(latestBomba.modelo, well.bomba_modelo, ""))}" /></label>
        <label>Fecha Instalacion<input type="date" name="fecha_instalacion" value="${escapeHtml(toInputDate(latestBomba.fecha_instalacion || well.bomba_fecha_instalacion))}" /></label>
        <label>TVU (dias)<input type="text" name="tvu_dias" value="${escapeHtml(firstNonEmpty(latestBomba.tvu_dias, well.bomba_tvu, ""))}" /></label>
        <label>Caudal<input type="text" name="bomba_caudal" value="${escapeHtml(firstNonEmpty(well.bomba_caudal, ""))}" /></label>
        <label>Observaciones<input type="text" name="observaciones" value="${escapeHtml(firstNonEmpty(latestBomba.observaciones, well.bomba_observaciones, ""))}" /></label>
      `
    },
    bomba_edit: {
      title: "Editar Ultimo Registro de Bomba",
      html: `
        <label>Marca<input type="text" name="marca" value="${escapeHtml(firstNonEmpty(latestBomba.marca, well.bomba_marca, ""))}" /></label>
        <label>Modelo<input type="text" name="modelo" value="${escapeHtml(firstNonEmpty(latestBomba.modelo, well.bomba_modelo, ""))}" /></label>
        <label>Fecha Instalacion<input type="date" name="fecha_instalacion" value="${escapeHtml(toInputDate(latestBomba.fecha_instalacion || well.bomba_fecha_instalacion))}" /></label>
        <label>TVU (dias)<input type="text" name="tvu_dias" value="${escapeHtml(firstNonEmpty(latestBomba.tvu_dias, well.bomba_tvu, ""))}" /></label>
        <label>Caudal<input type="text" name="bomba_caudal" value="${escapeHtml(firstNonEmpty(well.bomba_caudal, ""))}" /></label>
        <label>Observaciones<input type="text" name="observaciones" value="${escapeHtml(firstNonEmpty(latestBomba.observaciones, well.bomba_observaciones, ""))}" /></label>
      `
    },
    pdt_add: {
      title: "Agregar Registro PDT",
      html: `
        <label>Yacimiento<input type="text" name="yacimiento" value="${escapeHtml(firstNonEmpty(latestPdt.yacimiento, well.yacimiento, ""))}" /></label>
        <label>Fecha Ultima Prueba<input type="date" name="fecha_ultima_prueba" value="${escapeHtml(toInputDate(latestPdt.fecha_ultima_prueba || well.pdt_fecha_ultima_prueba))}" /></label>
        <label>Volumetria<input type="text" name="volumetria" value="${escapeHtml(firstNonEmpty(latestPdt.volumetria, well.pdt_volumetria, ""))}" /></label>
        <label>AyS<input type="text" name="ays" value="${escapeHtml(firstNonEmpty(latestPdt.ays, well.pdt_ays, ""))}" /></label>
        <label>Causa Diferido<input type="text" name="causa_diferido" value="${escapeHtml(firstNonEmpty(latestPdt.causa_diferido, well.pdt_causa_diferido, ""))}" /></label>
      `
    },
    pdt_edit: {
      title: "Editar Ultimo Registro PDT",
      html: `
        <label>Yacimiento<input type="text" name="yacimiento" value="${escapeHtml(firstNonEmpty(latestPdt.yacimiento, well.yacimiento, ""))}" /></label>
        <label>Fecha Ultima Prueba<input type="date" name="fecha_ultima_prueba" value="${escapeHtml(toInputDate(latestPdt.fecha_ultima_prueba || well.pdt_fecha_ultima_prueba))}" /></label>
        <label>Volumetria<input type="text" name="volumetria" value="${escapeHtml(firstNonEmpty(latestPdt.volumetria, well.pdt_volumetria, ""))}" /></label>
        <label>AyS<input type="text" name="ays" value="${escapeHtml(firstNonEmpty(latestPdt.ays, well.pdt_ays, ""))}" /></label>
        <label>Causa Diferido<input type="text" name="causa_diferido" value="${escapeHtml(firstNonEmpty(latestPdt.causa_diferido, well.pdt_causa_diferido, ""))}" /></label>
      `
    },
    completacion: {
      title: "Editar Completacion",
      html: `
        <label>Diagrama Mecanico<input type="text" name="diagrama_mecanico" value="${escapeHtml(firstNonEmpty(well.diagrama_mecanico, ""))}" /></label>
        <label>Numero Tuberias<input type="text" name="num_tuberias" value="${escapeHtml(firstNonEmpty(well.num_tuberias, ""))}" /></label>
        <label>Diametro Tuberias<input type="text" name="diametro_tuberias" value="${escapeHtml(firstNonEmpty(well.diametro_tuberias, ""))}" /></label>
        <label>Numero Cabillas<input type="text" name="num_cabillas" value="${escapeHtml(firstNonEmpty(well.num_cabillas, ""))}" /></label>
        <label>Diametro Cabillas<input type="text" name="diametro_cabillas" value="${escapeHtml(firstNonEmpty(well.diametro_cabillas, ""))}" /></label>
        <label>Longitud Cabillas<input type="text" name="longitud_cabillas" value="${escapeHtml(firstNonEmpty(well.longitud_cabillas, ""))}" /></label>
      `
    },
    survey: {
      title: "Editar Survey",
      html: `
        <label>Tipo<input type="text" name="survey_tipo" value="${escapeHtml(firstNonEmpty(well.survey_tipo, well.tipo_survey, ""))}" /></label>
        <label>Fecha<input type="date" name="survey_fecha" value="${escapeHtml(toInputDate(firstNonEmpty(well.survey_fecha, well.fecha_survey, "")))}" /></label>
        <label>Profundidad<input type="text" name="survey_profundidad" value="${escapeHtml(firstNonEmpty(well.survey_profundidad, well.profundidad_survey, ""))}" /></label>
        <label>Observaciones<input type="text" name="survey_observaciones" value="${escapeHtml(firstNonEmpty(well.survey_observaciones, well.observaciones_survey, ""))}" /></label>
      `
    },
    parametros_row_edit: {
      title: "Editar Registro de Parametros",
      html: ""
    },
    niveles_row_edit: {
      title: "Editar Registro de Nivel",
      html: ""
    },
    bombas_row_edit: {
      title: "Editar Registro de Bomba",
      html: ""
    },
    pdt_row_edit: {
      title: "Editar Registro PDT",
      html: ""
    }
  };

  const template = templates[type];
  if (!template) {
    return;
  }

  if (type.endsWith("_row_edit")) {
    const kind = type.replace("_row_edit", "");
    const picked = getHistoryRecordByKey(kind, recordKey || getHistoryRecordKeyFromLatest(kind));
    if (!picked) {
      syncBadge.textContent = "No se encontro el registro para editar";
      return;
    }

    const generated = buildHistoryRowEditTemplate(kind, picked);
    cardEditTitle.textContent = generated.title;
    cardEditForm.type.value = type;
    cardEditForm.pozoId.value = pozoId;
    cardEditFields.innerHTML = `${generated.html}<input type="hidden" name="recordKey" value="${escapeHtml(recordKey || getHistoryRecordKey(kind, picked))}" />`;
    cardEditDialog.showModal();
    return;
  }

  cardEditTitle.textContent = template.title;
  cardEditForm.type.value = type;
  cardEditForm.pozoId.value = pozoId;
  cardEditFields.innerHTML = template.html;
  cardEditDialog.showModal();
}

function getHistoryRecordKeyFromLatest(kind) {
  const pozoId = state.activePozoId;
  const source = kind === "parametros"
    ? state.parametrosByPozo.get(pozoId) || []
    : kind === "niveles"
      ? state.nivelesByPozo.get(pozoId) || []
      : kind === "bombas"
        ? state.bombasByPozo.get(pozoId) || []
        : state.pdtByPozo.get(pozoId) || [];
  const latest = source.slice().sort(sortByDateDesc)[0];
  return latest ? getHistoryRecordKey(kind, latest) : "";
}

function getHistoryRecordKey(kind, record) {
  return String(record?.id || `${kind}_${firstNonEmpty(record?.createdAt, record?.fecha_instalacion, record?.fecha_ultima_prueba, Date.now())}`);
}

function getHistoryRecordByKey(kind, key) {
  const pozoId = state.activePozoId;
  const source = kind === "parametros"
    ? state.parametrosByPozo.get(pozoId) || []
    : kind === "niveles"
      ? state.nivelesByPozo.get(pozoId) || []
      : kind === "bombas"
        ? state.bombasByPozo.get(pozoId) || []
        : state.pdtByPozo.get(pozoId) || [];

  return source.find((item) => getHistoryRecordKey(kind, item) === key) || null;
}

function buildHistoryRowEditTemplate(kind, record) {
  if (kind === "parametros") {
    return {
      title: "Editar Registro de Parametros",
      html: `
        <label>Voltaje<input type="number" step="0.01" name="voltaje" value="${escapeHtml(firstNonEmpty(record.voltaje, 0))}" /></label>
        <label>Amperaje<input type="number" step="0.01" name="amperaje" value="${escapeHtml(firstNonEmpty(record.amperaje, 0))}" /></label>
        <label>Frecuencia<input type="number" step="0.01" name="frecuencia" value="${escapeHtml(firstNonEmpty(record.frecuencia, 0))}" /></label>
        <label>Torque<input type="number" step="0.01" name="torque" value="${escapeHtml(firstNonEmpty(record.torqueAplicadoNm, record.torque, 0))}" /></label>
        <label>HP<input type="number" step="0.01" name="hp" value="${escapeHtml(firstNonEmpty(record.potenciaHp, record.hp_calculado, 0))}" /></label>
      `
    };
  }

  if (kind === "niveles") {
    return {
      title: "Editar Registro de Nivel",
      html: `
        <label>ft<input type="number" step="0.01" name="ft" value="${escapeHtml(firstNonEmpty(record.ft, 0))}" /></label>
        <label>Porcentaje<input type="number" step="0.01" name="porcentaje" value="${escapeHtml(firstNonEmpty(record.porcentaje, 0))}" /></label>
        <label>PIP<input type="number" step="0.01" name="pip" value="${escapeHtml(firstNonEmpty(record.pip, 0))}" /></label>
        <label>PBHP<input type="number" step="0.01" name="pbhp" value="${escapeHtml(firstNonEmpty(record.pbhp, 0))}" /></label>
      `
    };
  }

  if (kind === "bombas") {
    return {
      title: "Editar Registro de Bomba",
      html: `
        <label>Marca<input type="text" name="marca" value="${escapeHtml(firstNonEmpty(record.marca, ""))}" /></label>
        <label>Modelo<input type="text" name="modelo" value="${escapeHtml(firstNonEmpty(record.modelo, ""))}" /></label>
        <label>Fecha Instalacion<input type="date" name="fecha_instalacion" value="${escapeHtml(toInputDate(record.fecha_instalacion))}" /></label>
        <label>TVU (dias)<input type="text" name="tvu_dias" value="${escapeHtml(firstNonEmpty(record.tvu_dias, ""))}" /></label>
        <label>Observaciones<input type="text" name="observaciones" value="${escapeHtml(firstNonEmpty(record.observaciones, ""))}" /></label>
      `
    };
  }

  return {
    title: "Editar Registro PDT",
    html: `
      <label>Yacimiento<input type="text" name="yacimiento" value="${escapeHtml(firstNonEmpty(record.yacimiento, ""))}" /></label>
      <label>Fecha Ultima Prueba<input type="date" name="fecha_ultima_prueba" value="${escapeHtml(toInputDate(record.fecha_ultima_prueba))}" /></label>
      <label>Volumetria<input type="text" name="volumetria" value="${escapeHtml(firstNonEmpty(record.volumetria, ""))}" /></label>
      <label>AyS<input type="text" name="ays" value="${escapeHtml(firstNonEmpty(record.ays, ""))}" /></label>
      <label>Causa Diferido<input type="text" name="causa_diferido" value="${escapeHtml(firstNonEmpty(record.causa_diferido, ""))}" /></label>
    `
  };
}

async function saveHistoryRowEdit(kind, recordKey, payload, pozoId) {
  const current = getHistoryRecordByKey(kind, recordKey);
  if (!current) {
    return;
  }

  const merged = { ...current };
  if (kind === "parametros") {
    merged.voltaje = Number(payload.voltaje || 0);
    merged.amperaje = Number(payload.amperaje || 0);
    merged.frecuencia = Number(payload.frecuencia || 0);
    merged.torque = Number(payload.torque || 0);
    merged.torqueAplicadoNm = merged.torque;
    merged.hp_calculado = Number(payload.hp || 0);
    merged.potenciaHp = merged.hp_calculado;
  } else if (kind === "niveles") {
    merged.ft = Number(payload.ft || 0);
    merged.porcentaje = Number(payload.porcentaje || 0);
    merged.pip = Number(payload.pip || 0);
    merged.pbhp = Number(payload.pbhp || 0);
  } else if (kind === "bombas") {
    const fechaIso = payload.fecha_instalacion ? normalizeDate(payload.fecha_instalacion) : merged.fecha_instalacion;
    merged.marca = String(payload.marca || "").trim();
    merged.modelo = String(payload.modelo || "").trim();
    merged.fecha_instalacion = fechaIso;
    merged.fecha_sort_ms = toTimeMs(fechaIso);
    merged.tvu_dias = String(payload.tvu_dias || "").trim();
    merged.observaciones = String(payload.observaciones || "").trim();
    await persistWellPatch({
      id: pozoId,
      bomba_marca: merged.marca,
      bomba_modelo: merged.modelo,
      bomba_fecha_instalacion: merged.fecha_instalacion,
      bomba_tvu: merged.tvu_dias,
      bomba_observaciones: merged.observaciones
    }, { skipRender: true });
  } else {
    const fechaIso = payload.fecha_ultima_prueba ? normalizeDate(payload.fecha_ultima_prueba) : merged.fecha_ultima_prueba;
    merged.yacimiento = cleanYacimientoValue(payload.yacimiento || merged.yacimiento || "N/A");
    merged.fecha_ultima_prueba = fechaIso;
    merged.fecha_sort_ms = toTimeMs(fechaIso);
    merged.volumetria = String(payload.volumetria || "").trim();
    merged.ays = String(payload.ays || "").trim();
    merged.causa_diferido = String(payload.causa_diferido || "").trim();

    const p = { id: pozoId, yacimiento: merged.yacimiento };
    if (shouldShowPdtSummary(getExistingWell(pozoId))) {
      p.pdt_fecha_ultima_prueba = merged.fecha_ultima_prueba;
      p.pdt_volumetria = merged.volumetria;
      p.pdt_ays = merged.ays;
      p.pdt_causa_diferido = merged.causa_diferido;
    }
    await persistWellPatch(p, { skipRender: true });
  }

  replaceHistoryRecordInState(kind, pozoId, recordKey, merged);

  if (navigator.onLine && isFirebaseReady() && merged.id) {
    const firebasePayload = kind === "parametros"
      ? {
          voltaje: merged.voltaje,
          amperaje: merged.amperaje,
          frecuencia: merged.frecuencia,
          torque: merged.torque,
          hp_calculado: merged.hp_calculado
        }
      : kind === "niveles"
        ? {
            ft: merged.ft,
            porcentaje: merged.porcentaje,
            pip: merged.pip,
            pbhp: merged.pbhp
          }
        : kind === "bombas"
          ? {
              marca: merged.marca,
              modelo: merged.modelo,
              fecha_instalacion: merged.fecha_instalacion,
              fecha_sort_ms: merged.fecha_sort_ms,
              tvu_dias: merged.tvu_dias,
              observaciones: merged.observaciones
            }
          : {
              yacimiento: merged.yacimiento,
              fecha_ultima_prueba: merged.fecha_ultima_prueba,
              fecha_sort_ms: merged.fecha_sort_ms,
              volumetria: merged.volumetria,
              ays: merged.ays,
              causa_diferido: merged.causa_diferido
            };

    await upsertPozoHistoryRecord(pozoId, kind, merged.id, firebasePayload);
  }
}

function replaceHistoryRecordInState(kind, pozoId, recordKey, merged) {
  const mapRef = kind === "parametros"
    ? state.parametrosByPozo
    : kind === "niveles"
      ? state.nivelesByPozo
      : kind === "bombas"
        ? state.bombasByPozo
        : state.pdtByPozo;

  const current = mapRef.get(pozoId) || [];
  const next = current.map((item) => (getHistoryRecordKey(kind, item) === recordKey ? merged : item));
  mapRef.set(pozoId, next);
}

async function persistWellPatch(patch, { skipRender = false } = {}) {
  const pozoId = normalizePozoId(patch.id || state.activePozoId);
  const current = getExistingWell(pozoId) || { id: pozoId, nombre: pozoId, categoria: 2, estado: "En observacion", area: "N/A", potencial: 0 };
  const merged = { ...current, ...patch, id: pozoId };
  upsertLocalPozo(merged);

  if (navigator.onLine && isFirebaseReady()) {
    await updatePozoBaseData(pozoId, merged);
  }

  if (!skipRender) {
    renderWellsTable();
    renderPozoDetail();
  }
}

function setupPWA() {
  setupInstallPrompt();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => null);
    navigator.serviceWorker.addEventListener("message", (event) => {
      if (event.data?.type === "SYNC_PENDING_FORMS") {
        trySync();
      }
    });
  }

  window.addEventListener("online", async () => {
    await trySync();
    await refreshOfflineDatasetIfNeeded({ force: true });
  });
  window.addEventListener("online", updateConnectionBadge);
  window.addEventListener("offline", updateConnectionBadge);
  updateConnectionBadge();
}

function setupAuthUi() {
  loginForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const username = loginUsernameInput?.value || "";
    const password = loginPasswordInput?.value || "";
    setLoginStatus("Validando acceso...");

    const result = await loginWithCredentials({
      username,
      password,
      fetchProfiles: fetchAccessProfiles
    });

    if (!result.ok) {
      if (result.reason === "missing-profiles") {
        setLoginStatus("No hay usuarios configurados aun. Usa 'Configurar Acceso Inicial'.", true);
      } else {
        setLoginStatus(result.message || "No se pudo iniciar sesion.", true);
      }
      return;
    }

    loginPasswordInput.value = "";
    await activateSession(result.session, { source: result.source });
  });

  logoutBtn?.addEventListener("click", async () => {
    await clearUserSession();
    state.auth.user = null;
    applyAccessControl();
    showAuthScreen("Sesion cerrada.");
  });

  openBootstrapAuthBtn?.addEventListener("click", () => {
    authBootstrapStatus.textContent = "Esto crea el primer acceso con control total y lo deja cacheado para uso offline.";
    authBootstrapDialog?.showModal();
  });

  cancelBootstrapAuthBtn?.addEventListener("click", () => {
    authBootstrapDialog?.close();
  });

  authBootstrapForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(authBootstrapForm).entries());
    if (String(payload.password || "") !== String(payload.confirmPassword || "")) {
      authBootstrapStatus.textContent = "Las claves no coinciden.";
      return;
    }

    try {
      authBootstrapStatus.textContent = "Creando acceso inicial...";
      const session = await createInitialAccess({
        username: payload.username,
        displayName: payload.displayName,
        password: payload.password,
        role: payload.role,
        saveProfile: saveAccessProfile
      });
      authBootstrapForm.reset();
      authBootstrapDialog?.close();
      await activateSession(session, { source: navigator.onLine ? "remote" : "cache" });
    } catch (error) {
      authBootstrapStatus.textContent = "No se pudo crear el acceso inicial.";
    }
  });
}

async function initializeApplication() {
  const session = await restoreUserSession();

  if (session?.username) {
    await activateSession(session, { restoreOnly: true });
    return;
  }

  if (navigator.onLine) {
    try {
      const remoteProfiles = await fetchAccessProfiles();
      if (remoteProfiles.length) {
        await cacheAccessProfiles(remoteProfiles);
      }
    } catch (error) {
      // Mantener arranque en modo login.
    }
  }

  const cachedProfiles = await getCachedAccessProfiles();
  if (!cachedProfiles.length) {
    showAuthScreen("No hay usuarios configurados aun. Configura el acceso inicial.");
    return;
  }

  showAuthScreen("Inicia sesion para continuar.");
}

async function activateSession(session, { source = "cache", restoreOnly = false } = {}) {
  state.auth.user = { ...session, source };
  updateAuthBadges();
  showPlatformShell();
  applyAccessControl();

  if (navigator.onLine) {
    try {
      const remoteProfiles = await fetchAccessProfiles();
      if (remoteProfiles.length) {
        await cacheAccessProfiles(remoteProfiles);
      }
    } catch (error) {
      // Mantener sesion activa con cache.
    }
  }

  if (!state.hasBootstrapped) {
    await bootstrap();
    state.hasBootstrapped = true;
  } else if (!restoreOnly) {
    renderWellsTable();
    renderPozoDetail();
  }

  setLoginStatus(source === "remote" ? "Sesion iniciada." : "Sesion restaurada desde cache.");
}

function showAuthScreen(message = "") {
  authScreen.hidden = false;
  platformShell.hidden = true;
  setLoginStatus(message || "Ingresa tus credenciales para continuar.");
}

function showPlatformShell() {
  authScreen.hidden = true;
  platformShell.hidden = false;
}

function setLoginStatus(message, isError = false) {
  if (!loginStatus) {
    return;
  }
  loginStatus.textContent = message;
  loginStatus.classList.toggle("is-error", Boolean(isError));
}

function updateAuthBadges() {
  const user = state.auth.user;
  if (!user) {
    authRoleBadge.hidden = true;
    authUserBadge.hidden = true;
    logoutBtn.hidden = true;
    return;
  }

  authRoleBadge.textContent = `Rol: ${user.role}`;
  authUserBadge.textContent = `Usuario: ${user.displayName || user.username}`;
  authRoleBadge.hidden = false;
  authUserBadge.hidden = false;
  logoutBtn.hidden = false;
}

function setupInstallPrompt() {
  if (!installAppBtn) {
    return;
  }

  const isStandalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
  if (isStandalone) {
    installAppBtn.hidden = true;
    return;
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    installAppBtn.hidden = false;
  });

  installAppBtn.addEventListener("click", async () => {
    if (!deferredInstallPrompt) {
      return;
    }

    deferredInstallPrompt.prompt();
    try {
      await deferredInstallPrompt.userChoice;
    } catch (error) {
      // El usuario pudo cerrar el popup.
    }

    deferredInstallPrompt = null;
    installAppBtn.hidden = true;
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    installAppBtn.hidden = true;
  });
}

async function bootstrap() {
  hydrateLocalState(await getLatestRecords());

  const cachedSnapshot = await getCachedWellsSnapshot();
  if (cachedSnapshot?.wells?.length) {
    state.wells = cachedSnapshot.wells;
    syncBadge.textContent = `Offline listo: ${state.wells.length} pozos en cache`;
  }

  if (navigator.onLine && isFirebaseReady()) {
    try {
      state.wells = await fetchAllPozos();
      await cacheWellsSnapshot(state.wells, { source: "firebase-bootstrap" });
      await setOfflineDatasetMeta({
        syncedAt: new Date().toISOString(),
        wellsCount: state.wells.length,
        version: Date.now()
      });
      syncBadge.textContent = `Firebase: ${state.wells.length} pozos sincronizados`;
    } catch (error) {
      syncBadge.textContent = "No se pudo leer Firebase (revisar reglas/coleccion)";
    }
  }

  if (!state.wells.length) {
    state.wells = buildWellsFromLocal();
    if (state.wells.length) {
      syncBadge.textContent = `Modo local: ${state.wells.length} pozos`;
    }
  }

  if (!state.wells.length) {
    state.wells = [{ id: "POZO-001", nombre: "POZO-001", categoria: 2, estado: "En observacion", area: "N/A", potencial: 0 }];
  }

  await runAutoBundledImport();

  await setActivePozo(state.wells[0].id);
  await refreshOfflineDatasetIfNeeded();
  hydrateEditSelectors();
  renderDashboard();
  renderWellsTable();

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

async function setActivePozo(pozoId) {
  const normalized = normalizePozoId(pozoId);
  state.activePozoId = normalized;
  selectedPozoLabel.textContent = normalized;

  const parametrosForm = document.getElementById("parametrosForm");
  const nivelForm = document.getElementById("nivelForm");
  parametrosForm.pozoId.value = normalized;
  nivelForm.pozoId.value = normalized;

  const cachedHistory = await getCachedPozoHistory(normalized);
  if (cachedHistory) {
    if (cachedHistory.parametros?.length) {
      state.parametrosByPozo.set(normalized, dedupeByKey(cachedHistory.parametros, paramKey));
    }
    if (cachedHistory.niveles?.length) {
      state.nivelesByPozo.set(normalized, dedupeByKey(cachedHistory.niveles, nivelKey));
    }
    if (cachedHistory.bombas?.length) {
      state.bombasByPozo.set(normalized, dedupeByKey(cachedHistory.bombas, bombaKey));
    }
    if (cachedHistory.pdt?.length) {
      state.pdtByPozo.set(normalized, dedupeByKey(cachedHistory.pdt, pdtKey));
    }
  }

  if (navigator.onLine && isFirebaseReady()) {
    try {
      const remoteHistory = await fetchPozoHistory(normalized, 500);
      if (remoteHistory.parametros.length) {
        state.parametrosByPozo.set(normalized, dedupeByKey(remoteHistory.parametros, paramKey));
      }
      if (remoteHistory.niveles.length) {
        state.nivelesByPozo.set(normalized, dedupeByKey(remoteHistory.niveles, nivelKey));
      }
      if (remoteHistory.bombas.length) {
        state.bombasByPozo.set(normalized, dedupeByKey(remoteHistory.bombas, bombaKey));
      }
      if (remoteHistory.pdt.length) {
        state.pdtByPozo.set(normalized, dedupeByKey(remoteHistory.pdt, pdtKey));
      }
      await cachePozoHistory(normalized, remoteHistory);
    } catch (error) {
      // Si falla la red, mantener los datos cacheados/locales.
    }
  }

  renderPozoDetail();
}

async function refreshOfflineDatasetIfNeeded({ force = false } = {}) {
  if (!navigator.onLine || !isFirebaseReady()) {
    return;
  }

  const meta = await getOfflineDatasetMeta();
  const lastSyncMs = meta?.syncedAt ? new Date(meta.syncedAt).getTime() : 0;
  const ageMs = Date.now() - lastSyncMs;
  const isStale = !lastSyncMs || ageMs > 1000 * 60 * 30;

  if (!force && !isStale) {
    return;
  }

  try {
    const wells = await fetchPozos(5000);
    if (wells.length) {
      state.wells = wells;
      await cacheWellsSnapshot(wells, { source: "firebase-refresh" });

      const subset = wells.slice(0, 150);
      await Promise.all(
        subset.map(async (well) => {
          const id = normalizePozoId(well.id);
          const history = await fetchPozoHistory(id, 200);
          await cachePozoHistory(id, history);
        })
      );

      await setOfflineDatasetMeta({
        syncedAt: new Date().toISOString(),
        wellsCount: wells.length,
        prefetchedHistoryCount: subset.length,
        reason: force ? "forced-online" : "ttl-refresh"
      });

      if (state.activePozoId) {
        const activeHistory = await getCachedPozoHistory(state.activePozoId);
        if (activeHistory?.parametros?.length) {
          state.parametrosByPozo.set(state.activePozoId, dedupeByKey(activeHistory.parametros, paramKey));
        }
        if (activeHistory?.niveles?.length) {
          state.nivelesByPozo.set(state.activePozoId, dedupeByKey(activeHistory.niveles, nivelKey));
        }
        if (activeHistory?.bombas?.length) {
          state.bombasByPozo.set(state.activePozoId, dedupeByKey(activeHistory.bombas, bombaKey));
        }
        if (activeHistory?.pdt?.length) {
          state.pdtByPozo.set(state.activePozoId, dedupeByKey(activeHistory.pdt, pdtKey));
        }
      }

      renderWellsTable();
      renderDashboard();
      renderPozoDetail();
      syncBadge.textContent = `Offline actualizado: ${wells.length} pozos`;
    }
  } catch (error) {
    // Mantener cache existente cuando falla la actualización.
  }
}

function renderDashboard() {
  const total = state.wells.length || 1;
  const c1 = state.wells.filter((w) => Number(w.categoria) === 1).length;
  const c2 = state.wells.filter((w) => Number(w.categoria) === 2).length;
  const c3 = state.wells.filter((w) => Number(w.categoria) === 3).length;
  const diferidos = state.wells.filter((w) => isDiferidoWell(w)).length;
  const c3Activos = Math.max(0, c3 - diferidos);

  document.getElementById("kpiTotalPozos").textContent = String(total);
  document.getElementById("kpiCat1").textContent = `${Math.round((c1 / total) * 100)}%`;
  document.getElementById("kpiCat2").textContent = `${Math.round((c2 / total) * 100)}%`;
  document.getElementById("kpiCat3").textContent = `${Math.round((c3 / total) * 100)}%`;

  document.getElementById("categoryLegend").innerHTML = `
    <span>Cat. 1 Activos: ${c1}</span>
    <span>Cat. 2 Mantenimiento menor: ${c2}</span>
    <span>Cat. 3 Operaciones mayores: ${c3Activos}</span>
    <span>Diferidos (Cat. 3): ${diferidos}</span>
  `;

  renderCategoryChart([c1, c2, c3Activos, diferidos]);
  renderGeneralTrendChart();
}

function renderWellsTable() {
  wellsTableBody.innerHTML = "";
  state.wells.forEach((well) => {
    const row = document.createElement("tr");
    const pozoName = formatPozoNombre(well.id);
    const estadoRaw = String(well.estado || "N/A");
    const estadoLabel = formatEstadoLabel(estadoRaw);
    const estadoClass = getEstadoClass(estadoRaw);
    const categoria = Number(well.categoria || 2);
    const notaMotivo = getWellCategoryNote(well);
    const estadoTooltip = notaMotivo && notaMotivo !== "-"
      ? ` title="${escapeHtml(`Nota/Motivo: ${notaMotivo}`)}" data-note="${escapeHtml(notaMotivo)}"`
      : "";
    const estadoHint = notaMotivo && notaMotivo !== "-" ? " *" : "";
    row.innerHTML = `
      <td data-label="Pozo"><strong>${escapeHtml(pozoName)}</strong></td>
      <td data-label="Categoria"><span class="cat-chip cat-${categoria}">Cat-${categoria}</span></td>
      <td data-label="Estado"><span class="status-chip ${estadoClass}"${estadoTooltip}><span class="status-dot"></span>${escapeHtml(estadoLabel)}${escapeHtml(estadoHint)}</span></td>
      <td data-label="Area">${escapeHtml(well.area || "N/A")}</td>
      <td data-label="Potencial">${Number(well.potencial || 0).toFixed(2)}</td>
      <td data-label="Acciones">
        <button class="btn-secondary" data-action="view" data-pozo-id="${escapeHtml(well.id)}">Ficha</button>
        <button class="btn-secondary" data-action="edit" data-pozo-id="${escapeHtml(well.id)}">Editar</button>
      </td>
    `;
    wellsTableBody.appendChild(row);
  });

  initDataTable();
  hydrateEditSelectors();
  renderBombasModule();
}

function renderBombasModule() {
  if (!bombasTableBody) {
    return;
  }

  const rows = buildBombasModuleRows();
  const uniquePozos = new Set(rows.map((row) => row.pozoId));
  const tvuValues = rows
    .map((row) => Number.parseFloat(String(row.tvu_dias || "").replace(",", ".")))
    .filter((value) => Number.isFinite(value));
  const avgTvu = tvuValues.length
    ? tvuValues.reduce((acc, value) => acc + value, 0) / tvuValues.length
    : 0;

  if (kpiBombasTotal) {
    kpiBombasTotal.textContent = String(rows.length);
  }
  if (kpiBombasPozos) {
    kpiBombasPozos.textContent = String(uniquePozos.size);
  }
  if (kpiBombasTvu) {
    kpiBombasTvu.textContent = avgTvu.toFixed(1);
  }

  bombasTableBody.innerHTML = "";
  rows.forEach((row) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td data-label="Pozo">${escapeHtml(formatPozoNombre(row.pozoId))}</td>
      <td data-label="Marca">${escapeHtml(firstNonEmpty(row.marca, "N/A"))}</td>
      <td data-label="Modelo">${escapeHtml(firstNonEmpty(row.modelo, "N/A"))}</td>
      <td data-label="Fecha Instalacion">${escapeHtml(formatDateOnly(row.fecha_instalacion) || "N/A")}</td>
      <td data-label="TVU (dias)">${escapeHtml(firstNonEmpty(row.tvu_dias, "N/A"))}</td>
      <td data-label="Observaciones">${escapeHtml(firstNonEmpty(row.observaciones, "-"))}</td>
    `;
    bombasTableBody.appendChild(tr);
  });

  initBombasDataTable();
  renderBombasMarcaChart(rows);
  renderBombasTvuChart(rows);
}

function buildBombasModuleRows() {
  const rows = [];
  const seenFallback = new Set();

  state.bombasByPozo.forEach((items, pozoId) => {
    items.forEach((item) => {
      rows.push({
        pozoId,
        marca: item.marca,
        modelo: item.modelo,
        fecha_instalacion: item.fecha_instalacion || item.createdAt,
        tvu_dias: item.tvu_dias,
        observaciones: item.observaciones,
        sortMs: toTimeMs(item.fecha_instalacion || item.createdAt)
      });
    });
    seenFallback.add(normalizePozoId(pozoId));
  });

  state.wells.forEach((well) => {
    const pozoId = normalizePozoId(well.id);
    if (seenFallback.has(pozoId)) {
      return;
    }
    if (!firstNonEmpty(well.bomba_marca, well.bomba_modelo, well.bomba_tvu, well.bomba_fecha_instalacion)) {
      return;
    }
    rows.push({
      pozoId,
      marca: well.bomba_marca,
      modelo: well.bomba_modelo,
      fecha_instalacion: well.bomba_fecha_instalacion,
      tvu_dias: well.bomba_tvu,
      observaciones: well.bomba_observaciones,
      sortMs: toTimeMs(well.bomba_fecha_instalacion)
    });
  });

  return rows.sort((a, b) => b.sortMs - a.sortMs);
}

function initBombasDataTable() {
  if (!window.jQuery || !window.jQuery.fn?.DataTable) {
    return;
  }

  const $table = window.jQuery("#bombasTable");
  if (state.bombasDataTable) {
    state.bombasDataTable.destroy();
  }

  state.bombasDataTable = $table.DataTable({
    pageLength: 12,
    order: [[3, "desc"]],
    responsive: true,
    autoWidth: false,
    destroy: true,
    dom: '<"top"Blf>rt<"bottom"ip>',
    buttons: [
      { extend: "colvis", text: "Columnas" },
      { extend: "excelHtml5", text: "Excel", exportOptions: { columns: [0, 1, 2, 3, 4, 5] } },
      { extend: "pdfHtml5", text: "PDF", exportOptions: { columns: [0, 1, 2, 3, 4, 5] } },
      { extend: "print", text: "Imprimir", exportOptions: { columns: [0, 1, 2, 3, 4, 5] } }
    ],
    language: {
      search: "Buscar:",
      lengthMenu: "Mostrar _MENU_",
      info: "_START_ a _END_ de _TOTAL_ registros",
      paginate: { previous: "Anterior", next: "Siguiente" }
    }
  });
}

function renderBombasMarcaChart(rows) {
  if (!window.Chart) {
    return;
  }

  const marcaCounts = new Map();
  rows.forEach((row) => {
    const brand = firstNonEmpty(row.marca, "N/A");
    marcaCounts.set(brand, (marcaCounts.get(brand) || 0) + 1);
  });

  const topBrands = [...marcaCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  const ctx = document.getElementById("bombasMarcaChart");
  if (!ctx) {
    return;
  }

  state.charts.bombasMarca?.destroy();
  state.charts.bombasMarca = new window.Chart(ctx, {
    type: "bar",
    data: {
      labels: topBrands.map((item) => item[0]),
      datasets: [
        {
          label: "Instalaciones",
          data: topBrands.map((item) => item[1]),
          backgroundColor: "rgba(27, 191, 131, 0.65)",
          borderColor: "#1bbf83",
          borderWidth: 1
        }
      ]
    },
    options: {
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
    }
  });
}

function renderBombasTvuChart(rows) {
  if (!window.Chart) {
    return;
  }

  const brandStats = new Map();
  rows.forEach((row) => {
    const brand = firstNonEmpty(row.marca, "N/A");
    const tvu = Number.parseFloat(String(row.tvu_dias || "").replace(",", "."));
    if (!Number.isFinite(tvu)) {
      return;
    }
    const current = brandStats.get(brand) || { sum: 0, count: 0 };
    current.sum += tvu;
    current.count += 1;
    brandStats.set(brand, current);
  });

  const topByAvg = [...brandStats.entries()]
    .map(([brand, stats]) => ({ brand, avg: stats.sum / Math.max(stats.count, 1), count: stats.count }))
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 8);

  const ctx = document.getElementById("bombasTvuChart");
  if (!ctx) {
    return;
  }

  state.charts.bombasTvu?.destroy();
  state.charts.bombasTvu = new window.Chart(ctx, {
    type: "bar",
    data: {
      labels: topByAvg.map((item) => `${item.brand} (${item.count})`),
      datasets: [
        {
          label: "TVU promedio (dias)",
          data: topByAvg.map((item) => Number(item.avg.toFixed(1))),
          backgroundColor: "rgba(48, 65, 255, 0.58)",
          borderColor: "#3041ff",
          borderWidth: 1
        }
      ]
    },
    options: {
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true } }
    }
  });
}

function initDataTable() {
  if (!window.jQuery || !window.jQuery.fn?.DataTable) {
    return;
  }

  const $table = window.jQuery("#wellsTable");
  if (state.wellsDataTable) {
    state.wellsDataTable.destroy();
    $table.find("tfoot").remove();
  }

  state.wellsDataTable = $table.DataTable({
    pageLength: window.matchMedia("(max-width: 768px)").matches ? 6 : 12,
    lengthMenu: window.matchMedia("(max-width: 768px)").matches ? [6, 12, 25] : [12, 25, 50, 100],
    order: [[0, "asc"]],
    responsive: {
      details: {
        type: "inline",
        renderer: window.jQuery.fn.dataTable.Responsive.renderer.tableAll({ tableClass: "mobile-detail-table" })
      }
    },
    autoWidth: false,
    deferRender: true,
    stateSave: true,
    scrollX: !window.matchMedia("(max-width: 768px)").matches,
    columnDefs: [
      { targets: 0, width: "23%", responsivePriority: 1 },
      { targets: 1, width: "14%", responsivePriority: 5 },
      { targets: 2, width: "26%", responsivePriority: 2 },
      { targets: 3, width: "16%", responsivePriority: 4 },
      { targets: 4, width: "11%", className: "dt-right", responsivePriority: 6 },
      { targets: 5, orderable: false, searchable: false, width: "10%", responsivePriority: 1 }
    ],
    dom: '<"top"Blf>rt<"bottom"ip>',
    buttons: [
      {
        extend: "colvis",
        text: "Columnas",
        columns: [0, 1, 2, 3, 4],
        postfixButtons: ["colvisRestore"]
      },
      {
        extend: "excelHtml5",
        text: "Excel",
        exportOptions: { columns: [0, 1, 2, 3, 4] }
      },
      {
        text: "Word",
        action: () => {
          exportWellsWord();
        }
      },
      {
        extend: "pdfHtml5",
        text: "PDF",
        exportOptions: { columns: [0, 1, 2, 3, 4] }
      },
      {
        extend: "print",
        text: "Imprimir",
        exportOptions: { columns: [0, 1, 2, 3, 4] }
      }
    ],
    language: {
      search: "Buscar:",
      lengthMenu: "Mostrar _MENU_",
      info: "_START_ a _END_ de _TOTAL_ pozos",
      paginate: { previous: "Anterior", next: "Siguiente" }
    }
  });
}

function renderPozoDetail() {
  const pozoId = state.activePozoId;
  const allParametros = (state.parametrosByPozo.get(pozoId) || []).slice().sort(sortByDateDesc);
  const allNiveles = (state.nivelesByPozo.get(pozoId) || []).slice().sort(sortByDateDesc);
  const allBombas = (state.bombasByPozo.get(pozoId) || []).slice().sort(sortByDateDesc);
  const allPdt = (state.pdtByPozo.get(pozoId) || []).slice().sort(sortByDateDesc);
  const parametros = allParametros.slice(0, 12);
  const niveles = allNiveles.slice(0, 12);
  const activeWell = getActiveWell();

  renderFichaGeneralData(activeWell, allBombas[0] || null, allPdt[0] || null);
  applyCategoriaFichaRules(activeWell);

  parametrosTableBody.innerHTML = "";

  parametros.reverse().forEach((record) => {
    const hz = Number(record.frecuencia || 0);
    const torque = Number(record.torqueAplicadoNm || record.torque || record.torqueManual || 0);
    const hp = Number(record.potenciaHp || record.hp_calculado || 0);
    const amp = Number(record.amperaje || 0);
    const row = document.createElement("tr");
    row.innerHTML = `
      <td data-label="Fecha">${formatDate(record.createdAt)}</td>
      <td data-label="Hz">${hz.toFixed(2)}</td>
      <td data-label="Amp">${amp.toFixed(2)}</td>
      <td data-label="Torque">${torque.toFixed(2)}</td>
      <td data-label="HP">${hp.toFixed(2)}</td>
    `;
    parametrosTableBody.prepend(row);
  });

  nivelesTableBody.innerHTML = "";
  niveles.reverse().forEach((record) => {
    const pdfUrl = record.reportePdfUrl || record.reporte_pdf_url || "";
    const row = document.createElement("tr");
    row.innerHTML = `
      <td data-label="Fecha">${formatDate(record.createdAt)}</td>
      <td data-label="ft">${Number(record.ft || 0).toFixed(2)}</td>
      <td data-label="%">${Number(record.porcentaje || 0).toFixed(2)}</td>
      <td data-label="PIP">${Number(record.pip || 0).toFixed(2)}</td>
      <td data-label="PBHP">${Number(record.pbhp || 0).toFixed(2)}</td>
      <td data-label="PDF">${pdfUrl ? `<a href="${pdfUrl}" target="_blank" rel="noreferrer">Ver PDF</a>` : "-"}</td>
    `;
    nivelesTableBody.prepend(row);
  });

  const latestNivel = niveles[0] || {};

  const latestPdfUrl = latestNivel.reportePdfUrl || latestNivel.reporte_pdf_url || "";
  if (latestPdfUrl) {
    latestNivelPdfWrap.innerHTML = `<a href="${escapeHtml(latestPdfUrl)}" target="_blank" rel="noreferrer">Abrir ultimo PDF de toma de nivel</a>`;
    pdfViewer.src = latestPdfUrl;
  } else {
    latestNivelPdfWrap.textContent = "Sin PDF disponible.";
    pdfViewer.src = "/assets/sample-diagrama.pdf";
  }

  renderInteractiveTrendCharts(allParametros, allNiveles);

  renderHistoryBodies(allParametros, allNiveles, allBombas, allPdt);
}

function applyCategoriaFichaRules(well) {
  const categoria = Number(well?.categoria || 2);
  const isCat3 = categoria === 3;
  const isCat2 = categoria === 2;

  if (fgCabezalRow) {
    fgCabezalRow.hidden = isCat3;
  }
  if (fgVariadorRow) {
    fgVariadorRow.hidden = isCat3;
  }
  if (pozoBombaCard) {
    pozoBombaCard.hidden = isCat3;
  }
  if (parametrosSection) {
    parametrosSection.hidden = isCat3;
  }

  if (!categoryNoteCard || !categoryNoteTitle || !categoryNoteText) {
    return;
  }

  if (isCat2) {
    categoryNoteCard.hidden = false;
    categoryNoteTitle.textContent = "Nota Categoria 2";
    categoryNoteText.textContent = firstNonEmpty(
      well?.nota,
      well?.diagnostico,
      well?.nota_diagnostico,
      well?.motivo,
      well?.razon,
      well?.observaciones,
      "Sin diagnostico o motivo registrado en mapa."
    );
    return;
  }

  if (isCat3) {
    categoryNoteCard.hidden = false;
    categoryNoteTitle.textContent = "Motivo Categoria 3 / Diferido";
    categoryNoteText.textContent = firstNonEmpty(
      well?.causaDiferido,
      well?.causa_diferido,
      well?.motivo_diferido,
      well?.motivo,
      well?.razon,
      "Sin motivo de diferido registrado en mapa."
    );
    return;
  }

  categoryNoteCard.hidden = true;
}

function renderFichaGeneralData(well, latestBomba, latestPdt) {
  const row = well || {};
  const id = state.activePozoId;
  const estado = row.estado || "N/A";
  const showPdtSummary = shouldShowPdtSummary(row);
  const pdtSource = showPdtSummary ? latestPdt || row : null;
  document.getElementById("estadoPozo").textContent = estado;

  fichaFields.pozoId.textContent = formatPozoNombre(id);
  fichaFields.zona.textContent = firstNonEmpty(row.zona, row.area, "N/A");
  fichaFields.estado.textContent = estado;
  fichaFields.cabezal.textContent = firstNonEmpty(row.cabezal, row.cabezal_tipo, "N/A");
  fichaFields.variador.textContent = firstNonEmpty(row.variador, row.variador_modelo, "N/A");
  fichaFields.yacimiento.textContent = firstNonEmpty(row.yacimiento, row.arena, row.sand, "N/A");
  fichaFields.fechaArranque.textContent = firstNonEmpty(row.fecha_arranque, row.start_date, "N/A");
  fichaFields.velocidadRpm.textContent = firstNonEmpty(
    row.velocidad_operacional_rpm,
    row.velocidad_rpm,
    row.rpm,
    "N/A"
  );
  fichaFields.potencial.textContent = Number(row.potencial || 0).toFixed(2);

  fichaFields.bombaMarca.textContent = firstNonEmpty(latestBomba?.marca, row.bomba_marca, row.marca_bomba, "N/A");
  fichaFields.bombaModelo.textContent = firstNonEmpty(latestBomba?.modelo, row.bomba_modelo, row.modelo_bomba, "N/A");
  fichaFields.bombaFechaInstalacion.textContent = firstNonEmpty(
    formatDateOnly(latestBomba?.fecha_instalacion),
    formatDateOnly(row.bomba_fecha_instalacion),
    "N/A"
  );
  fichaFields.bombaCaudal.textContent = firstNonEmpty(row.bomba_caudal, row.caudal_bomba, "N/A");
  fichaFields.bombaTvu.textContent = firstNonEmpty(latestBomba?.tvu_dias, row.bomba_tvu, row.tvu, "N/A");
  fichaFields.bombaObservaciones.textContent = firstNonEmpty(latestBomba?.observaciones, row.bomba_observaciones, "N/A");

  fichaFields.pdtFechaPrueba.textContent = showPdtSummary
    ? firstNonEmpty(formatDateOnly(pdtSource?.fecha_ultima_prueba), formatDateOnly(row.pdt_fecha_ultima_prueba), "N/A")
    : "N/A";
  fichaFields.pdtVolumetria.textContent = showPdtSummary
    ? firstNonEmpty(pdtSource?.volumetria, row.pdt_volumetria, "N/A")
    : "N/A";
  fichaFields.pdtAys.textContent = showPdtSummary
    ? firstNonEmpty(pdtSource?.ays, row.pdt_ays, "N/A")
    : "N/A";
  fichaFields.pdtCausaDiferido.textContent = showPdtSummary
    ? firstNonEmpty(pdtSource?.causa_diferido, row.pdt_causa_diferido, "N/A")
    : "N/A";

  fichaFields.surveyTipo.textContent = firstNonEmpty(row.survey_tipo, row.tipo_survey, row.survey_type, "N/A");
  fichaFields.surveyFecha.textContent = firstNonEmpty(row.survey_fecha, row.fecha_survey, row.survey_date, "N/A");
  fichaFields.surveyProfundidad.textContent = firstNonEmpty(
    row.survey_profundidad,
    row.profundidad_survey,
    row.survey_depth,
    "N/A"
  );
  fichaFields.surveyObservaciones.textContent = firstNonEmpty(
    row.survey_observaciones,
    row.observaciones_survey,
    row.survey_notes,
    "N/A"
  );

  fichaFields.compDiagrama.textContent = firstNonEmpty(row.diagrama_mecanico, "Disponible en visor");
  fichaFields.compNumTuberias.textContent = firstNonEmpty(row.num_tuberias, "N/A");
  fichaFields.compDiamTuberias.textContent = firstNonEmpty(row.diametro_tuberias, "N/A");
  fichaFields.compNumCabillas.textContent = firstNonEmpty(row.num_cabillas, "N/A");
  fichaFields.compDiamCabillas.textContent = firstNonEmpty(row.diametro_cabillas, "N/A");
  fichaFields.compLongCabillas.textContent = firstNonEmpty(row.longitud_cabillas, "N/A");
}

function renderHistoryBodies(parametros, niveles, bombas, pdt) {
  parametrosHistoryBody.innerHTML = "";
  parametros
    .slice()
    .sort(sortByDateDesc)
    .forEach((record) => {
      const rowKey = getHistoryRecordKey("parametros", record);
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${formatDate(record.createdAt)}</td>
        <td>${Number(record.voltaje || 0).toFixed(2)}</td>
        <td>${Number(record.amperaje || 0).toFixed(2)}</td>
        <td>${Number(record.frecuencia || 0).toFixed(2)}</td>
        <td>${Number(record.torqueAplicadoNm || record.torque || 0).toFixed(2)}</td>
        <td>${Number(record.potenciaHp || record.hp_calculado || 0).toFixed(2)}</td>
        <td>
          <button class="btn-secondary edit-history-row" data-kind="parametros" data-key="${escapeHtml(rowKey)}" type="button">Editar</button>
          <button class="btn-secondary delete-history-row" data-kind="parametros" data-key="${escapeHtml(rowKey)}" data-id="${escapeHtml(record.id || "")}" type="button">Eliminar</button>
        </td>
      `;
      parametrosHistoryBody.appendChild(tr);
    });

  nivelesHistoryBody.innerHTML = "";
  niveles
    .slice()
    .sort(sortByDateDesc)
    .forEach((record) => {
      const rowKey = getHistoryRecordKey("niveles", record);
      const pdfUrl = record.reportePdfUrl || record.reporte_pdf_url || "";
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${formatDate(record.createdAt)}</td>
        <td>${Number(record.ft || 0).toFixed(2)}</td>
        <td>${Number(record.porcentaje || 0).toFixed(2)}</td>
        <td>${Number(record.pip || 0).toFixed(2)}</td>
        <td>${Number(record.pbhp || 0).toFixed(2)}</td>
        <td>${pdfUrl ? `<a href="${escapeHtml(pdfUrl)}" target="_blank" rel="noreferrer">Ver PDF</a>` : "-"}</td>
        <td>
          <button class="btn-secondary edit-history-row" data-kind="niveles" data-key="${escapeHtml(rowKey)}" type="button">Editar</button>
          <button class="btn-secondary delete-history-row" data-kind="niveles" data-key="${escapeHtml(rowKey)}" data-id="${escapeHtml(record.id || "")}" type="button">Eliminar</button>
        </td>
      `;
      nivelesHistoryBody.appendChild(tr);
    });

  bombasHistoryBody.innerHTML = "";
  bombas
    .slice()
    .sort(sortByDateDesc)
    .forEach((record) => {
      const rowKey = getHistoryRecordKey("bombas", record);
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${formatDateOnly(record.fecha_instalacion)}</td>
        <td>${escapeHtml(firstNonEmpty(record.marca, "-"))}</td>
        <td>${escapeHtml(firstNonEmpty(record.modelo, "-"))}</td>
        <td>${escapeHtml(firstNonEmpty(record.tvu_dias, "-"))}</td>
        <td>${escapeHtml(firstNonEmpty(record.observaciones, "-"))}</td>
        <td>
          <button
            class="btn-secondary edit-history-row"
            data-kind="bombas"
            data-key="${escapeHtml(rowKey)}"
            type="button"
          >Editar</button>
          <button
            class="btn-secondary delete-history-row"
            data-kind="bombas"
            data-key="${escapeHtml(rowKey)}"
            data-id="${escapeHtml(record.id || "")}"
            type="button"
          >Eliminar</button>
        </td>
      `;
      bombasHistoryBody.appendChild(tr);
    });

  pdtHistoryBody.innerHTML = "";
  pdt
    .slice()
    .sort(sortByDateDesc)
    .forEach((record) => {
      const rowKey = getHistoryRecordKey("pdt", record);
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${formatDateOnly(record.fecha_ultima_prueba)}</td>
        <td>${escapeHtml(firstNonEmpty(record.yacimiento, "-"))}</td>
        <td>${escapeHtml(firstNonEmpty(record.volumetria, "-"))}</td>
        <td>${escapeHtml(firstNonEmpty(record.ays, "-"))}</td>
        <td>${escapeHtml(firstNonEmpty(record.causa_diferido, "-"))}</td>
        <td>
          <button
            class="btn-secondary edit-history-row"
            data-kind="pdt"
            data-key="${escapeHtml(rowKey)}"
            type="button"
          >Editar</button>
          <button
            class="btn-secondary delete-history-row"
            data-kind="pdt"
            data-key="${escapeHtml(rowKey)}"
            data-id="${escapeHtml(record.id || "")}"
            type="button"
          >Eliminar</button>
        </td>
      `;
      pdtHistoryBody.appendChild(tr);
    });
}

function openParametrosHistoryDialog() {
  if (!parametrosHistoryDialog) {
    return;
  }
  parametrosHistoryDialog.showModal();
  initHistoryDataTable("#parametrosHistoryTable", "parametros", [0, 1, 2, 3, 4, 5]);
}

function openNivelesHistoryDialog() {
  if (!nivelesHistoryDialog) {
    return;
  }
  nivelesHistoryDialog.showModal();
  initHistoryDataTable("#nivelesHistoryTable", "niveles", [0, 1, 2, 3, 4, 5]);
}

function openBombasHistoryDialog() {
  if (!bombasHistoryDialog) {
    return;
  }
  bombasHistoryDialog.showModal();
  initHistoryDataTable("#bombasHistoryTable", "bombas", [0, 1, 2, 3, 4]);
}

function openPdtHistoryDialog() {
  if (!pdtHistoryDialog) {
    return;
  }
  pdtHistoryDialog.showModal();
  initHistoryDataTable("#pdtHistoryTable", "pdt", [0, 1, 2, 3, 4]);
}

function initHistoryDataTable(selector, kind, exportColumns) {
  if (!window.jQuery || !window.jQuery.fn?.DataTable) {
    return;
  }

  const table = window.jQuery(selector);
  const current = kind === "parametros"
    ? state.parametrosHistoryDataTable
    : kind === "niveles"
      ? state.nivelesHistoryDataTable
      : kind === "bombas"
        ? state.bombasHistoryDataTable
        : state.pdtHistoryDataTable;
  if (current) {
    current.destroy();
  }

  const instance = table.DataTable({
    pageLength: 10,
    responsive: {
      details: {
        type: "inline",
        renderer: window.jQuery.fn.dataTable.Responsive.renderer.tableAll({ tableClass: "mobile-detail-table" })
      }
    },
    autoWidth: false,
    scrollX: !window.matchMedia("(max-width: 768px)").matches,
    destroy: true,
    columnDefs: [
      {
        targets: kind === "parametros" || kind === "niveles" ? [6] : [5],
        orderable: false,
        searchable: false
      }
    ],
    dom: '<"top"Blf>rt<"bottom"ip>',
    buttons: [
      { extend: "colvis", text: "Columnas" },
      { extend: "excelHtml5", text: "Excel", exportOptions: { columns: exportColumns } },
      {
        text: "Word",
        action: () => exportHistoryWord(selector, kind)
      },
      { extend: "pdfHtml5", text: "PDF", exportOptions: { columns: exportColumns } },
      { extend: "print", text: "Imprimir", exportOptions: { columns: exportColumns } }
    ],
    language: {
      search: "Buscar:",
      lengthMenu: "Mostrar _MENU_",
      info: "_START_ a _END_ de _TOTAL_ registros",
      paginate: { previous: "Anterior", next: "Siguiente" }
    }
  });

  if (kind === "parametros") {
    state.parametrosHistoryDataTable = instance;
    return;
  }
  if (kind === "niveles") {
    state.nivelesHistoryDataTable = instance;
    return;
  }
  if (kind === "bombas") {
    state.bombasHistoryDataTable = instance;
    return;
  }
  state.pdtHistoryDataTable = instance;
}

function exportHistoryWord(selector, kind) {
  const table = document.querySelector(selector)?.cloneNode(true);
  if (!table) {
    return;
  }

  const title = kind === "parametros"
    ? "Historico Completo de Parametros"
    : kind === "niveles"
      ? "Historico Completo de Tomas de Nivel"
      : kind === "bombas"
        ? "Historico de Bombas"
        : "Historico PDT";

  const html = `<html><body><h2>${title}</h2>${table.outerHTML}</body></html>`;
  const blob = new Blob([html], { type: "application/msword" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${kind}_historico_${state.activePozoId}_${Date.now()}.doc`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function exportFichaTecnicaPdf() {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    return;
  }

  const well = getActiveWell() || {};
  const pozoId = formatPozoNombre(state.activePozoId);
  const parametros = (state.parametrosByPozo.get(state.activePozoId) || []).slice().sort(sortByDateDesc).slice(0, 10);
  const niveles = (state.nivelesByPozo.get(state.activePozoId) || []).slice().sort(sortByDateDesc).slice(0, 10);
  const latestNivel = niveles[0] || {};
  const latestPdfUrl = latestNivel.reportePdfUrl || latestNivel.reporte_pdf_url || "Sin PDF";

  const doc = new window.jspdf.jsPDF({ unit: "pt", format: "a4" });
  doc.setFontSize(14);
  doc.text(`Ficha Tecnica - ${pozoId}`, 40, 40);

  doc.setFontSize(10);
  const rows = [
    ["Zona", firstNonEmpty(well.zona, well.area, "N/A")],
    ["Estado", firstNonEmpty(well.estado, "N/A")],
    ["Cabezal", firstNonEmpty(well.cabezal, well.cabezal_tipo, "N/A")],
    ["Variador", firstNonEmpty(well.variador, well.variador_modelo, "N/A")],
    ["Yacimiento", firstNonEmpty(well.yacimiento, well.arena, well.sand, "N/A")],
    ["Fecha Arranque", firstNonEmpty(well.fecha_arranque, well.start_date, "N/A")],
    ["Velocidad Operacional (RPM)", firstNonEmpty(well.velocidad_operacional_rpm, well.velocidad_rpm, well.rpm, "N/A")],
    ["Potencial", Number(well.potencial || 0).toFixed(2)],
    ["Bomba Marca", firstNonEmpty(well.bomba_marca, well.marca_bomba, "N/A")],
    ["Bomba Modelo", firstNonEmpty(well.bomba_modelo, well.modelo_bomba, "N/A")],
    ["Bomba Caudal", firstNonEmpty(well.bomba_caudal, well.caudal_bomba, "N/A")],
    ["Bomba TVU", firstNonEmpty(well.bomba_tvu, well.tvu, "N/A")],
    ["Survey Tipo", firstNonEmpty(well.survey_tipo, well.tipo_survey, well.survey_type, "N/A")],
    ["Survey Fecha", firstNonEmpty(well.survey_fecha, well.fecha_survey, well.survey_date, "N/A")],
    ["Survey Profundidad", firstNonEmpty(well.survey_profundidad, well.profundidad_survey, well.survey_depth, "N/A")],
    ["Survey Observaciones", firstNonEmpty(well.survey_observaciones, well.observaciones_survey, well.survey_notes, "N/A")],
    ["Num. Tuberias", firstNonEmpty(well.num_tuberias, "N/A")],
    ["Diam. Tuberias", firstNonEmpty(well.diametro_tuberias, "N/A")],
    ["Num. Cabillas", firstNonEmpty(well.num_cabillas, "N/A")],
    ["Diam. Cabillas", firstNonEmpty(well.diametro_cabillas, "N/A")],
    ["Long. Cabillas", firstNonEmpty(well.longitud_cabillas, "N/A")],
    ["Ultimo PDF Nivel", latestPdfUrl]
  ];

  if (typeof doc.autoTable === "function") {
    doc.autoTable({
      startY: 58,
      head: [["Campo", "Valor"]],
      body: rows,
      theme: "grid",
      styles: { fontSize: 9 }
    });

    const pRows = parametros.map((record) => [
      formatDate(record.createdAt),
      Number(record.frecuencia || 0).toFixed(2),
      Number(record.amperaje || 0).toFixed(2),
      Number(record.torqueAplicadoNm || record.torque || 0).toFixed(2),
      Number(record.potenciaHp || record.hp_calculado || 0).toFixed(2)
    ]);

    doc.autoTable({
      startY: doc.lastAutoTable.finalY + 18,
      head: [["Ultimos Parametros", "Hz", "Amp", "Torque", "HP"]],
      body: pRows.length ? pRows : [["Sin datos", "-", "-", "-", "-"]],
      styles: { fontSize: 8 }
    });

    const nRows = niveles.map((record) => [
      formatDate(record.createdAt),
      Number(record.ft || 0).toFixed(2),
      Number(record.porcentaje || 0).toFixed(2),
      Number(record.pip || 0).toFixed(2),
      Number(record.pbhp || 0).toFixed(2)
    ]);

    doc.autoTable({
      startY: doc.lastAutoTable.finalY + 18,
      head: [["Ultimas Tomas", "ft", "%", "PIP", "PBHP"]],
      body: nRows.length ? nRows : [["Sin datos", "-", "-", "-", "-"]],
      styles: { fontSize: 8 }
    });
  }

  doc.save(`ficha_tecnica_${state.activePozoId}_${Date.now()}.pdf`);
}

async function importHistoricoExcel(file) {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { raw: false });

  rows.forEach((row) => {
    const pozoId = normalizePozoId(row.pozoId || row.id || row.ID || row.pozo || row.Pozo || row.nombre || "POZO-001");

    upsertLocalPozo({
      id: pozoId,
      nombre: row.nombre || row.Nombre || pozoId,
      categoria: Number(row.categoria || row.Categoria || 2),
      estado: row.estado || row.Estado || "En observacion",
      area: row.area || row.Area || "N/A",
      potencial: Number(row.potencial || row.Potencial || 0),
      yacimiento: row.yacimiento || row.Yacimiento || row.arena || row.Arena || ""
    });

    const hasParam = row.frecuencia || row.Frecuencia || row.amperaje || row.Amperaje || row.voltaje || row.Voltaje;
    if (hasParam) {
      addLocalParametro(pozoId, {
        frecuencia: row.frecuencia || row.Frecuencia || 0,
        amperaje: row.amperaje || row.Amperaje || 0,
        voltaje: row.voltaje || row.Voltaje || 0,
        torqueAplicadoNm: row.torque || row.Torque || 0,
        potenciaHp: row.hp || row.HP || 0,
        createdAt: normalizeDate(row.fecha || row.Fecha)
      });
    }

    const hasNivel = row.ft || row.FT || row.pip || row.PIP || row.pbhp || row.PBHP;
    if (hasNivel) {
      addLocalNivel(pozoId, {
        ft: row.ft || row.FT || 0,
        porcentaje: row.porcentaje || row.Porcentaje || 0,
        pip: row.pip || row.PIP || 0,
        pbhp: row.pbhp || row.PBHP || 0,
        createdAt: normalizeDate(row.fecha || row.Fecha)
      });
    }
  });

  renderDashboard();
  renderWellsTable();
  renderPozoDetail();
}

async function runAutoBundledImport() {
  const wasImported = window.localStorage?.getItem(AUTO_XLS_IMPORT_KEY) === "1";
  if (wasImported) {
    return;
  }

  await importBundledXlsData({ silent: true });
}

async function importBundledXlsData({ silent = false } = {}) {
  if (!window.XLSX) {
    if (!silent) {
      syncBadge.textContent = "No se pudo cargar XLSX en el navegador";
    }
    return;
  }

  if (!silent) {
    syncBadge.textContent = "Importando XLS base...";
  }

  try {
    const [bombasRows, pdtRows] = await Promise.all([
      fetchWorkbookRows("/xls/bombas_pozos.xlsx"),
      fetchWorkbookRows("/xls/pozos_actuales.xlsx")
    ]);

    const wellsByKey = new Map(state.wells.map((well) => [extractPozoKey(well.id), well]));
    const normalizedBombas = bombasRows
      .map((row) => normalizeBombasRow(row, wellsByKey))
      .filter(Boolean);
    const normalizedPdt = pdtRows
      .map((row) => normalizePdtRow(row, wellsByKey))
      .filter(Boolean);

    applyImportedDataToLocalState(normalizedBombas, normalizedPdt);

    let remoteSummary = null;
    if (navigator.onLine && isFirebaseReady()) {
      remoteSummary = await importExternalWellData({
        bombaRows: normalizedBombas,
        pdtRows: normalizedPdt
      });

      const activeWasImported = normalizedBombas.some((row) => row.pozoId === state.activePozoId)
        || normalizedPdt.some((row) => row.pozoId === state.activePozoId);

      if (activeWasImported) {
        const history = await fetchPozoHistory(state.activePozoId, 200);
        state.parametrosByPozo.set(state.activePozoId, dedupeByKey(history.parametros || [], paramKey));
        state.nivelesByPozo.set(state.activePozoId, dedupeByKey(history.niveles || [], nivelKey));
        state.bombasByPozo.set(state.activePozoId, dedupeByKey(history.bombas || [], bombaKey));
        state.pdtByPozo.set(state.activePozoId, dedupeByKey(history.pdt || [], pdtKey));
        await cachePozoHistory(state.activePozoId, history);
      }
    }

    renderDashboard();
    renderWellsTable();
    renderPozoDetail();

    const activosOmitidos = normalizedPdt.filter((row) => !row.updateSummary).length;
    if (remoteSummary) {
      window.localStorage?.setItem(AUTO_XLS_IMPORT_KEY, "1");
    }
    if (!silent) {
      syncBadge.textContent = remoteSummary
        ? `XLS base cargado: ${remoteSummary.bombas} bombas, ${remoteSummary.pdt} PDT, ${activosOmitidos} activos solo con yacimiento`
        : `XLS base cargado localmente: ${normalizedBombas.length} bombas, ${normalizedPdt.length} PDT`;
    }
  } catch (error) {
    if (!silent) {
      syncBadge.textContent = "Fallo la importacion de XLS base";
    }
  }
}

async function fetchWorkbookRows(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`No se pudo leer ${url}`);
  }
  const data = await response.arrayBuffer();
  const workbook = XLSX.read(data, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { raw: false, defval: "" });
}

function normalizeBombasRow(row, wellsByKey) {
  const rawPozo = firstNonEmpty(
    getRowValue(row, ["pozo", "id pozo", "id"]),
    row.POZO,
    row.pozo,
    row.Pozo,
    row.id
  );
  if (!rawPozo) {
    return null;
  }

  const pozoKey = extractPozoKey(rawPozo);
  const matchedWell = pozoKey ? wellsByKey.get(pozoKey) : null;
  const pozoId = matchedWell?.id || (pozoKey ? normalizeImportedPozoId(rawPozo) : normalizePozoId(rawPozo));
  const fechaRaw = firstNonEmpty(
    getRowValue(row, ["fecha de instalacion", "fecha instalacion", "fecha"]),
    row["FECHA DE INSTALACIÓN"],
    row["FECHA DE INSTALACION"],
    row.fecha_instalacion,
    ""
  );
  const fechaIso = fechaRaw ? normalizeDate(fechaRaw) : "";

  return {
    pozoId,
    marca: firstNonEmpty(getRowValue(row, ["marca"]), row.MARCA, row.marca),
    modelo: firstNonEmpty(getRowValue(row, ["modelo"]), row.MODELO, row.modelo),
    fecha_instalacion: fechaIso,
    createdAt: fechaIso || new Date().toISOString(),
    fecha_sort_ms: fechaIso ? new Date(fechaIso).getTime() : 0,
    tvu_dias: firstNonEmpty(
      getRowValue(row, ["tiempo de vida dias", "tiempo de vida", "tvu"]),
      row["TIEMPO DE VIDA (DÍAS)"],
      row["TIEMPO DE VIDA (DIAS)"],
      row.TVU,
      row.tvu
    ),
    observaciones: firstNonEmpty(getRowValue(row, ["observaciones", "estado"]), row.OBSERVACIONES, row.observaciones, row.estado)
  };
}

function normalizePdtRow(row, wellsByKey) {
  const rawPozo = firstNonEmpty(row["id pozo "], row["id pozo"], row.pozo, row.POZO, row.id);
  const pozoKey = extractPozoKey(rawPozo);
  if (!pozoKey) {
    return null;
  }

  const matchedWell = wellsByKey.get(pozoKey);
  const pozoId = matchedWell?.id || normalizeImportedPozoId(rawPozo);
  const estado = matchedWell?.estado || "";
  const rawFecha = firstNonEmpty(
    row["fecha de ultima prueba del pozo de monitorieo"],
    row["fecha de ultima prueba del pozo de monitoreo"],
    row.fecha,
    ""
  );
  const rawVol = firstNonEmpty(row["Volumetria  de monitoreo"], row.Volumetria, row.volumetria, "");
  const rawAys = firstNonEmpty(row.AyS, row.ays, row["A&S"], "");
  let causa = firstNonEmpty(row["causa de diferido "], row["causa de diferido"], row.causa, "");
  let fechaPrueba = rawFecha;
  let volumetria = rawVol;
  let ays = rawAys;

  if (!causa && !rawVol && !rawAys && !looksLikeDateValue(rawFecha)) {
    causa = rawFecha;
    fechaPrueba = "";
  }

  if (causa === "1035") {
    causa = "";
  }

  if (volumetria === "1035") {
    volumetria = "";
  }

  return {
    pozoId,
    yacimiento: cleanYacimientoValue(firstNonEmpty(row.yacimiento, row.YACIMIENTO, "")),
    fecha_ultima_prueba: fechaPrueba ? normalizeDate(fechaPrueba) : "",
    createdAt: fechaPrueba ? normalizeDate(fechaPrueba) : new Date().toISOString(),
    fecha_sort_ms: fechaPrueba ? new Date(normalizeDate(fechaPrueba)).getTime() : 0,
    volumetria,
    ays,
    causa_diferido: causa,
    updateSummary: !isPozoActivoEstado(estado)
  };
}

function applyImportedDataToLocalState(bombasRows, pdtRows) {
  const latestBombasByPozo = new Map();
  bombasRows.forEach((row) => {
    const history = state.bombasByPozo.get(row.pozoId) || [];
    state.bombasByPozo.set(row.pozoId, dedupeByKey([row, ...history], bombaKey));
    const current = latestBombasByPozo.get(row.pozoId);
    if (!current || row.fecha_sort_ms >= current.fecha_sort_ms) {
      latestBombasByPozo.set(row.pozoId, row);
    }
  });

  latestBombasByPozo.forEach((row, pozoId) => {
    upsertLocalPozo({
      id: pozoId,
      nombre: pozoId,
      categoria: 2,
      estado: getExistingWell(pozoId)?.estado || "En observacion",
      area: getExistingWell(pozoId)?.area || "N/A",
      potencial: Number(getExistingWell(pozoId)?.potencial || 0),
      bomba_marca: row.marca,
      bomba_modelo: row.modelo,
      bomba_tvu: row.tvu_dias,
      bomba_fecha_instalacion: row.fecha_instalacion,
      bomba_observaciones: row.observaciones
    });
  });

  pdtRows.forEach((row) => {
    const history = state.pdtByPozo.get(row.pozoId) || [];
    state.pdtByPozo.set(row.pozoId, dedupeByKey([row, ...history], pdtKey));

    const baseWell = getExistingWell(row.pozoId);
    const patch = {
      id: row.pozoId,
      nombre: baseWell?.nombre || row.pozoId,
      categoria: Number(baseWell?.categoria || 2),
      estado: baseWell?.estado || "En observacion",
      area: baseWell?.area || "N/A",
      potencial: Number(baseWell?.potencial || 0),
      yacimiento: row.yacimiento
    };

    if (row.updateSummary) {
      patch.pdt_fecha_ultima_prueba = row.fecha_ultima_prueba;
      patch.pdt_volumetria = row.volumetria;
      patch.pdt_ays = row.ays;
      patch.pdt_causa_diferido = row.causa_diferido;
    }

    upsertLocalPozo(patch);
  });
}

function openWellEdit(pozoId) {
  const pozo = state.wells.find((item) => item.id === pozoId);
  if (!pozo) {
    return;
  }

  ensureOption(wellEditEstadoSelect, pozo.estado || "En observacion");
  ensureOption(wellEditAreaSelect, pozo.area || "N/A");

  wellEditForm.id.value = pozo.id;
  wellEditForm.nombre.value = pozo.nombre || pozo.id;
  wellEditForm.categoria.value = String(pozo.categoria || 2);
  wellEditForm.estado.value = pozo.estado || "En observacion";
  wellEditForm.area.value = pozo.area || "N/A";
  wellEditForm.potencial.value = Number(pozo.potencial || 0);
  wellEditForm.yacimiento.value = firstNonEmpty(pozo.yacimiento, pozo.arena, pozo.sand, "");
  wellEditForm.fecha_arranque.value = firstNonEmpty(pozo.fecha_arranque, pozo.start_date, "");
  wellEditForm.velocidad_operacional_rpm.value = Number(
    firstNonEmpty(pozo.velocidad_operacional_rpm, pozo.velocidad_rpm, pozo.rpm, 0)
  );
  wellEditForm.bomba_marca.value = firstNonEmpty(pozo.bomba_marca, pozo.marca_bomba, "");
  wellEditForm.bomba_modelo.value = firstNonEmpty(pozo.bomba_modelo, pozo.modelo_bomba, "");
  wellEditForm.bomba_caudal.value = firstNonEmpty(pozo.bomba_caudal, pozo.caudal_bomba, "");
  wellEditForm.bomba_tvu.value = firstNonEmpty(pozo.bomba_tvu, pozo.tvu, "");
  wellEditForm.survey_tipo.value = firstNonEmpty(pozo.survey_tipo, pozo.tipo_survey, pozo.survey_type, "");
  wellEditForm.survey_fecha.value = firstNonEmpty(pozo.survey_fecha, pozo.fecha_survey, pozo.survey_date, "");
  wellEditForm.survey_profundidad.value = firstNonEmpty(pozo.survey_profundidad, pozo.profundidad_survey, pozo.survey_depth, "");
  wellEditForm.survey_observaciones.value = firstNonEmpty(
    pozo.survey_observaciones,
    pozo.observaciones_survey,
    pozo.survey_notes,
    ""
  );
  wellEditDialog.showModal();
}

function hydrateEditSelectors() {
  hydrateSelectWithValues(wellEditEstadoSelect, state.wells.map((w) => w.estado), [
    "activo",
    "inactivo por servicio",
    "en servicio",
    "diagnostico",
    "candidato",
    "diferido"
  ]);

  hydrateSelectWithValues(wellEditAreaSelect, state.wells.map((w) => w.area), [
    "bare-tradicional",
    "bare-norte",
    "bare-sur",
    "N/A"
  ]);
}

function hydrateSelectWithValues(selectEl, dynamicValues, baseValues) {
  if (!selectEl) {
    return;
  }

  const normalizedSet = new Set();
  const values = [];

  [...baseValues, ...dynamicValues]
    .map((value) => String(value || "").trim())
    .filter((value) => value.length > 0)
    .forEach((value) => {
      const key = value.toLowerCase();
      if (!normalizedSet.has(key)) {
        normalizedSet.add(key);
        values.push(value);
      }
    });

  const current = selectEl.value;
  selectEl.innerHTML = values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("");

  if (current) {
    ensureOption(selectEl, current);
    selectEl.value = current;
  }
}

function ensureOption(selectEl, value) {
  if (!selectEl) {
    return;
  }

  const clean = String(value || "").trim();
  if (!clean) {
    return;
  }

  const exists = [...selectEl.options].some((opt) => opt.value.toLowerCase() === clean.toLowerCase());
  if (!exists) {
    const option = document.createElement("option");
    option.value = clean;
    option.textContent = clean;
    selectEl.appendChild(option);
  }
}

function exportWellsWord() {
  const table = document.getElementById("wellsTable").cloneNode(true);
  const hiddenCols = state.wellsDataTable
    ? state.wellsDataTable.columns().indexes().toArray().filter((idx) => !state.wellsDataTable.column(idx).visible())
    : [];

  hiddenCols.forEach((colIndex) => {
    table.querySelectorAll("tr").forEach((row) => {
      if (row.children[colIndex]) {
        row.children[colIndex].remove();
      }
    });
  });

  const noExportIdx = [...table.querySelectorAll("thead th")]
    .map((th, idx) => (th.classList.contains("no-export") ? idx : -1))
    .filter((idx) => idx >= 0)
    .reverse();

  noExportIdx.forEach((idx) => {
    table.querySelectorAll("tr").forEach((row) => {
      if (row.children[idx]) {
        row.children[idx].remove();
      }
    });
  });

  const html = `
    <html><body>
      <h2>Tabla de Pozos</h2>
      ${table.outerHTML}
    </body></html>
  `;
  const blob = new Blob([html], { type: "application/msword" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `pozos_${Date.now()}.doc`;
  link.click();
  URL.revokeObjectURL(link.href);
}

async function trySync() {
  if (!navigator.onLine) {
    syncBadge.textContent = "Datos guardados offline";
    return;
  }

  if (!isFirebaseReady()) {
    syncBadge.textContent = "Firebase no configurado";
    return;
  }

  syncBadge.textContent = "Sincronizando...";
  const result = await syncPendingToFirebase(syncRecordToFirebase);
  syncBadge.textContent = `Sincronizados: ${result.synced} | Fallidos: ${result.failed}`;
}

function updateConnectionBadge() {
  if (navigator.onLine) {
    connectionBadge.textContent = "Online";
    connectionBadge.classList.remove("offline");
    connectionBadge.classList.add("online");
  } else {
    connectionBadge.textContent = "Offline";
    connectionBadge.classList.remove("online");
    connectionBadge.classList.add("offline");
  }
}

function switchView(viewName) {
  if (!canAccessView(viewName)) {
    syncBadge.textContent = "Tu rol no tiene acceso a ese modulo";
    return;
  }
  Object.entries(views).forEach(([key, element]) => {
    element.classList.toggle("is-visible", key === viewName);
  });
}

function setActiveNav(viewName) {
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === viewName);
  });
}

function applyAccessControl() {
  document.querySelectorAll(".nav-item[data-view]").forEach((button) => {
    const viewName = button.dataset.view;
    const allowed = canAccessView(viewName);
    button.hidden = !allowed;
    button.disabled = !allowed;
  });

  document.querySelectorAll(
    "#editGeneralCardBtn, #addBombaRecordBtn, #editBombaCardBtn, #addPdtRecordBtn, #editPdtCardBtn, #editCompletacionCardBtn, #editSurveyCardBtn"
  ).forEach((button) => {
    if (!button) {
      return;
    }
    const allowed = hasPermission("crud.cards");
    button.hidden = !allowed;
    button.disabled = !allowed;
  });

  document.querySelectorAll("button[data-action='edit']").forEach((button) => {
    button.hidden = !hasPermission("crud.cards");
  });
}

function canAccessView(viewName) {
  const user = state.auth.user;
  if (!user) {
    return false;
  }
  const roleConfig = getRoleConfig(user.role);
  return roleConfig.views.includes("*") || roleConfig.views.includes(viewName);
}

function hasPermission(permission) {
  const user = state.auth.user;
  if (!user) {
    return false;
  }
  const roleConfig = getRoleConfig(user.role);
  const permissions = [...roleConfig.permissions, ...(user.permissions || [])];
  return permissions.includes("*") || permissions.includes(permission);
}

function getRoleConfig(role) {
  return ROLE_ACCESS[String(role || "consulta").toLowerCase()] || ROLE_ACCESS.consulta;
}

function renderCategoryChart(values) {
  if (!window.Chart) {
    return;
  }
  const ctx = document.getElementById("categoryChart");
  state.charts.category?.destroy();
  state.charts.category = new window.Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["Cat 1", "Cat 2", "Cat 3", "Diferidos"],
      datasets: [{ data: values, backgroundColor: ["#1bbf83", "#f3b941", "#f05656", "#6b7280"] }]
    },
    options: { plugins: { legend: { display: false } } }
  });
}

function isDiferidoWell(well) {
  if (well?.esDiferido) {
    return true;
  }
  const estado = String(well?.estado || "").toLowerCase();
  return estado.includes("diferido");
}

function renderGeneralTrendChart() {
  if (!window.Chart) {
    return;
  }

  const all = [];
  state.parametrosByPozo.forEach((items) => {
    items.forEach((row) => {
      all.push({ createdAt: row.createdAt, hp: Number(row.potenciaHp || row.hp_calculado || 0) });
    });
  });

  all.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const last = all.slice(-15);

  const ctx = document.getElementById("generalTrendChart");
  state.charts.general?.destroy();
  state.charts.general = new window.Chart(ctx, {
    type: "line",
    data: {
      labels: last.map((item) => shortDate(item.createdAt)),
      datasets: [{ label: "HP", data: last.map((item) => item.hp), borderColor: "#3041ff", tension: 0.3 }]
    }
  });
}

function renderInteractiveTrendCharts(parametros, niveles) {
  if (!window.Chart) {
    return;
  }

  const parametroMetric = parametrosTrendMetricSelect?.value || "frecuencia";
  const nivelMetric = nivelesTrendMetricSelect?.value || "ft";

  const parametroCfg = getParametroMetricConfig(parametroMetric);
  const nivelCfg = getNivelMetricConfig(nivelMetric);

  const parametroSeries = buildTimeSeries(parametros, parametroCfg.extractor);
  const nivelSeries = buildTimeSeries(niveles, nivelCfg.extractor);

  const parametrosCtx = document.getElementById("parametrosTrendChart");
  state.charts.parametrosTrend?.destroy();
  state.charts.parametrosTrend = new window.Chart(parametrosCtx, {
    type: "line",
    data: {
      labels: parametroSeries.labels,
      datasets: [
        {
          label: parametroCfg.label,
          data: parametroSeries.values,
          borderColor: "#3041ff",
          backgroundColor: "rgba(48,65,255,0.18)",
          pointRadius: 4,
          pointHoverRadius: 6,
          tension: 0.25,
          fill: false
        }
      ]
    },
    options: {
      responsive: true,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: true }
      },
      scales: {
        y: {
          title: {
            display: true,
            text: parametroCfg.label
          }
        }
      }
    }
  });

  const nivelesCtx = document.getElementById("nivelesTrendChart");
  state.charts.nivelesTrend?.destroy();
  state.charts.nivelesTrend = new window.Chart(nivelesCtx, {
    type: "line",
    data: {
      labels: nivelSeries.labels,
      datasets: [
        {
          label: nivelCfg.label,
          data: nivelSeries.values,
          borderColor: "#1bbf83",
          backgroundColor: "rgba(27,191,131,0.16)",
          pointRadius: 4,
          pointHoverRadius: 6,
          tension: 0.25,
          fill: false
        }
      ]
    },
    options: {
      responsive: true,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: true }
      },
      scales: {
        y: {
          title: {
            display: true,
            text: nivelCfg.label
          }
        }
      }
    }
  });
}

function getParametroMetricConfig(metric) {
  const map = {
    frecuencia: {
      label: "Frecuencia (Hz)",
      extractor: (row) => Number(row.frecuencia || 0)
    },
    rpm: {
      label: "RPM",
      extractor: (row) => Number(row.rpm || 0)
    },
    torqueAplicadoNm: {
      label: "Torque (Nm)",
      extractor: (row) => Number(row.torqueAplicadoNm || row.torque || row.torqueManual || 0)
    },
    amperaje: {
      label: "Amperaje (A)",
      extractor: (row) => Number(row.amperaje || 0)
    },
    potenciaHp: {
      label: "Potencia (HP)",
      extractor: (row) => Number(row.potenciaHp || row.hp_calculado || 0)
    },
    voltaje: {
      label: "Voltaje (V)",
      extractor: (row) => Number(row.voltaje || 0)
    }
  };

  return map[metric] || map.frecuencia;
}

function getNivelMetricConfig(metric) {
  const map = {
    ft: {
      label: "Nivel (ft)",
      extractor: (row) => Number(row.ft || 0)
    },
    porcentaje: {
      label: "Porcentaje (%)",
      extractor: (row) => Number(row.porcentaje || 0)
    },
    pip: {
      label: "PIP",
      extractor: (row) => Number(row.pip || 0)
    },
    pbhp: {
      label: "PBHP",
      extractor: (row) => Number(row.pbhp || 0)
    }
  };

  return map[metric] || map.ft;
}

function buildTimeSeries(rows, extractor) {
  const ordered = rows
    .slice()
    .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));

  return {
    labels: ordered.map((item) => shortDateTime(item.createdAt)),
    values: ordered.map((item) => extractor(item))
  };
}

function hydrateLocalState(records) {
  records.forEach((row) => {
    const pozoId = normalizePozoId(row.payload?.pozoId || "POZO-001");
    upsertLocalPozo({ id: pozoId, nombre: pozoId, categoria: 2, estado: "En observacion", area: "N/A", potencial: 0 });

    if (row.formType === "parametros") {
      addLocalParametro(pozoId, { ...row.payload, createdAt: row.createdAt });
    }

    if (row.formType === "toma_nivel") {
      addLocalNivel(pozoId, { ...row.payload, createdAt: row.createdAt });
    }
  });
}

function buildWellsFromLocal() {
  const ids = new Set([...state.parametrosByPozo.keys(), ...state.nivelesByPozo.keys()]);
  return [...ids].map((id) => ({ id, nombre: id, categoria: 2, estado: "En observacion", area: "N/A", potencial: 0 }));
}

function addLocalParametro(pozoId, row) {
  const current = state.parametrosByPozo.get(pozoId) || [];
  state.parametrosByPozo.set(pozoId, dedupeByKey([row, ...current], paramKey));
}

function addLocalNivel(pozoId, row) {
  const current = state.nivelesByPozo.get(pozoId) || [];
  state.nivelesByPozo.set(pozoId, dedupeByKey([row, ...current], nivelKey));
}

function upsertLocalPozo(pozo) {
  const idx = state.wells.findIndex((item) => item.id === pozo.id);
  if (idx === -1) {
    state.wells.unshift(pozo);
    return;
  }
  state.wells[idx] = { ...state.wells[idx], ...pozo };
}

function replaceLocalPozo(pozo) {
  const idx = state.wells.findIndex((item) => item.id === pozo.id);
  if (idx === -1) {
    state.wells.unshift(pozo);
    return;
  }
  state.wells[idx] = pozo;
}

function normalizeDate(value) {
  const clean = String(value || "").trim();
  if (!clean) {
    return new Date().toISOString();
  }

  if (/^\d{4,6}$/.test(clean)) {
    const numeric = Number(clean);
    if (numeric > 20000) {
      const excelEpoch = new Date(Date.UTC(1899, 11, 30));
      excelEpoch.setUTCDate(excelEpoch.getUTCDate() + numeric);
      return excelEpoch.toISOString();
    }
  }

  const date = new Date(clean);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function sortByDateDesc(a, b) {
  const left = firstNonEmpty(a?.createdAt, a?.fecha_instalacion, a?.fecha_ultima_prueba, 0);
  const right = firstNonEmpty(b?.createdAt, b?.fecha_instalacion, b?.fecha_ultima_prueba, 0);
  return new Date(right || 0) - new Date(left || 0);
}

function dedupeByKey(items, keyFn) {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyFn(item);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function paramKey(item) {
  return `${item.createdAt || ""}_${item.frecuencia || ""}_${item.amperaje || ""}_${item.potenciaHp || item.hp_calculado || ""}`;
}

function nivelKey(item) {
  return `${item.createdAt || ""}_${item.ft || ""}_${item.pip || ""}_${item.pbhp || ""}`;
}

function bombaKey(item) {
  return `${item.fecha_instalacion || item.createdAt || ""}_${item.marca || ""}_${item.modelo || ""}_${item.tvu_dias || ""}`;
}

function pdtKey(item) {
  return `${item.fecha_ultima_prueba || item.createdAt || ""}_${item.yacimiento || ""}_${item.volumetria || ""}_${item.ays || ""}_${item.causa_diferido || ""}`;
}

function formatDate(value) {
  return new Date(value || Date.now()).toLocaleString();
}

function formatDateOnly(value) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString();
}

function toTimeMs(value) {
  const date = new Date(value || 0);
  const ms = date.getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function toInputDate(value) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function shortDate(value) {
  return new Date(value || Date.now()).toLocaleDateString();
}

function shortDateTime(value) {
  return new Date(value || Date.now()).toLocaleString();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatPozoNombre(pozoId) {
  const clean = String(pozoId || "").replace(/[^0-9]/g, "");
  const padded = clean ? clean.padStart(4, "0") : "0000";
  return `MFB-${padded}`;
}

function getActiveWell() {
  return state.wells.find((w) => normalizePozoId(w.id) === state.activePozoId) || null;
}

function getExistingWell(pozoId) {
  return state.wells.find((w) => normalizePozoId(w.id) === normalizePozoId(pozoId)) || null;
}

function openMapLocation() {
  const activeWell = getActiveWell() || {};
  const pozoId = normalizePozoId(state.activePozoId);
  const pozoNumeric = String(pozoId).replace(/[^0-9]/g, "");
  const pozoName = formatPozoNombre(pozoId);
  const zona = firstNonEmpty(activeWell.zona, activeWell.area, "");

  const url = new URL("https://mapa-trillas-bare.web.app/");
  url.searchParams.set("pozoId", pozoId);
  url.searchParams.set("id", pozoId);
  url.searchParams.set("well", pozoId);
  url.searchParams.set("search", pozoName);
  url.searchParams.set("autosearch", pozoId);
  url.searchParams.set("autofly", "1");
  url.searchParams.set("source", "opti-intern-platform");
  if (pozoNumeric) {
    url.searchParams.set("pozoNum", pozoNumeric);
  }
  if (zona) {
    url.searchParams.set("zona", zona);
  }

  // Doble pista para la app mapa: query params + hash semantico.
  url.hash = `flyto=${encodeURIComponent(pozoId)}`;
  window.open(url.toString(), "_blank", "noopener,noreferrer");
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value);
    }
  }
  return "";
}

function getEstadoClass(estado) {
  const s = String(estado || "").toLowerCase();
  if (s.includes("inactivo por servicio") || s.includes("inactivo-servicio")) return "status-dot-inactivo-servicio";
  if (s.includes("en servicio") || s.includes("en-servicio")) return "status-dot-en-servicio";
  if (s.includes("diagnostico")) return "status-dot-diagnostico";
  if (s.includes("candidato")) return "status-dot-candidato";
  if (s.includes("diferido")) return "status-dot-candidato";
  if (s.includes("activo")) return "status-dot-activo";
  return "status-dot-default";
}

function formatEstadoLabel(estado) {
  const key = String(estado || "").toLowerCase().trim();
  if (key === "activo") return "Activo";
  if (key === "inactivo-servicio" || key === "inactivo por servicio") return "Inactivo por servicio";
  if (key === "en-servicio" || key === "en servicio") return "En servicio";
  if (key === "diagnostico" || key === "diagnóstico") return "En diagnostico";
  if (key === "candidato") return "Candidato";
  if (key === "diferido") return "Diferido";
  return estado;
}

function getWellCategoryNote(well) {
  const categoria = Number(well?.categoria || 2);
  if (categoria === 2) {
    return firstNonEmpty(
      well?.nota,
      well?.diagnostico,
      well?.nota_diagnostico,
      well?.motivo,
      well?.razon,
      well?.observaciones,
      "-"
    );
  }

  if (categoria === 3) {
    return firstNonEmpty(
      well?.causaDiferido,
      well?.causa_diferido,
      well?.motivo_diferido,
      well?.motivo,
      well?.razon,
      "-"
    );
  }

  return "-";
}

function extractPozoKey(value) {
  return String(value || "").replace(/[^0-9]/g, "").replace(/^0+/, "") || "";
}

function normalizeImportedPozoId(value) {
  const digits = extractPozoKey(value);
  if (!digits) {
    return normalizePozoId(value);
  }
  return `MFB${digits}`;
}

function looksLikeDateValue(value) {
  const clean = String(value || "").trim();
  if (!clean) {
    return false;
  }
  if (/^\d{4,6}$/.test(clean) && Number(clean) > 20000) {
    return true;
  }
  return !Number.isNaN(new Date(clean).getTime());
}

function cleanYacimientoValue(value) {
  const clean = String(value || "").trim();
  if (!clean || /^0+P?$/i.test(clean)) {
    return "N/A";
  }
  return clean.replace(/\s+/g, " ");
}

function getRowValue(row, aliases = []) {
  const normalizedEntries = Object.entries(row || {}).map(([key, value]) => [normalizeColumnKey(key), value]);
  const map = new Map(normalizedEntries);

  for (const alias of aliases) {
    const key = normalizeColumnKey(alias);
    if (map.has(key)) {
      const value = map.get(key);
      if (value !== undefined && value !== null && String(value).trim() !== "") {
        return value;
      }
    }
  }

  return "";
}

function normalizeColumnKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isPozoActivoEstado(estado) {
  const clean = String(estado || "").toLowerCase().trim();
  return clean === "activo" || clean === "en servicio" || clean === "en-servicio";
}

function shouldShowPdtSummary(well) {
  return !isPozoActivoEstado(well?.estado);
}

function isMobileViewport() {
  return window.matchMedia("(max-width: 768px)").matches;
}

function showMobileNoteToast(note) {
  if (!mobileNoteToast || !mobileNoteToastText) {
    return;
  }
  mobileNoteToastText.textContent = note;
  mobileNoteToast.hidden = false;
  requestAnimationFrame(() => {
    mobileNoteToast.classList.add("is-visible");
  });
}

function hideMobileNoteToast() {
  if (!mobileNoteToast) {
    return;
  }
  mobileNoteToast.classList.remove("is-visible");
  setTimeout(() => {
    mobileNoteToast.hidden = true;
  }, 180);
}
