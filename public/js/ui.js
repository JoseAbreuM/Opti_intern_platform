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
import { verifyOfflineLogin } from "./auth.js";
import {
  fetchAllPozos,
  fetchLatestParametros,
  fetchLatestTomasNivel,
  fetchPozoHistory,
  fetchPozos,
  isFirebaseReady,
  normalizePozoId,
  syncRecordToFirebase,
  updatePozoBaseData,
  uploadTomaNivelPdf
} from "./firebase.js";

const state = {
  wells: [],
  parametrosByPozo: new Map(),
  nivelesByPozo: new Map(),
  activePozoId: "POZO-001",
  charts: {
    general: null,
    category: null,
    parametrosTrend: null,
    nivelesTrend: null
  },
  wellsDataTable: null,
  parametrosHistoryDataTable: null,
  nivelesHistoryDataTable: null
};

const views = {
  dashboard: document.getElementById("view-dashboard"),
  pozos: document.getElementById("view-pozos"),
  carga: document.getElementById("view-carga"),
  nivel: document.getElementById("view-nivel"),
  ficha: document.getElementById("view-ficha")
};

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
  arena: document.getElementById("fgArena"),
  fechaArranque: document.getElementById("fgFechaArranque"),
  velocidadRpm: document.getElementById("fgVelocidadRpm"),
  potencial: document.getElementById("fgPotencial"),
  bombaMarca: document.getElementById("fbMarca"),
  bombaModelo: document.getElementById("fbModelo"),
  bombaCaudal: document.getElementById("fbCaudal"),
  bombaTvu: document.getElementById("fbTvu"),
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
const parametrosHistoryBody = document.getElementById("parametrosHistoryBody");
const nivelesHistoryBody = document.getElementById("nivelesHistoryBody");
let deferredInstallPrompt = null;

setupNavigation();
setupForms();
setupWellsTableActions();
setupExport();
setupHistoryDialogs();
setupTrendControls();
setupPWA();
bootstrap();

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

  historicoFileInput.addEventListener("change", async (event) => {
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
      arena: String(payload.arena || "").trim(),
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
}

function setupTrendControls() {
  parametrosTrendMetricSelect?.addEventListener("change", () => {
    renderPozoDetail();
  });

  nivelesTrendMetricSelect?.addEventListener("change", () => {
    renderPozoDetail();
  });
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
  verifyOfflineLogin();

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
  const parametros = allParametros.slice(0, 12);
  const niveles = allNiveles.slice(0, 12);
  const activeWell = getActiveWell();

  renderFichaGeneralData(activeWell);
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

  renderHistoryBodies(allParametros, allNiveles);
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

function renderFichaGeneralData(well) {
  const row = well || {};
  const id = state.activePozoId;
  const estado = row.estado || "N/A";
  document.getElementById("estadoPozo").textContent = estado;

  fichaFields.pozoId.textContent = formatPozoNombre(id);
  fichaFields.zona.textContent = firstNonEmpty(row.zona, row.area, "N/A");
  fichaFields.estado.textContent = estado;
  fichaFields.cabezal.textContent = firstNonEmpty(row.cabezal, row.cabezal_tipo, "N/A");
  fichaFields.variador.textContent = firstNonEmpty(row.variador, row.variador_modelo, "N/A");
  fichaFields.arena.textContent = firstNonEmpty(row.arena, row.sand, "N/A");
  fichaFields.fechaArranque.textContent = firstNonEmpty(row.fecha_arranque, row.start_date, "N/A");
  fichaFields.velocidadRpm.textContent = firstNonEmpty(
    row.velocidad_operacional_rpm,
    row.velocidad_rpm,
    row.rpm,
    "N/A"
  );
  fichaFields.potencial.textContent = Number(row.potencial || 0).toFixed(2);

  fichaFields.bombaMarca.textContent = firstNonEmpty(row.bomba_marca, row.marca_bomba, "N/A");
  fichaFields.bombaModelo.textContent = firstNonEmpty(row.bomba_modelo, row.modelo_bomba, "N/A");
  fichaFields.bombaCaudal.textContent = firstNonEmpty(row.bomba_caudal, row.caudal_bomba, "N/A");
  fichaFields.bombaTvu.textContent = firstNonEmpty(row.bomba_tvu, row.tvu, "N/A");

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

function renderHistoryBodies(parametros, niveles) {
  parametrosHistoryBody.innerHTML = "";
  parametros
    .slice()
    .sort(sortByDateDesc)
    .forEach((record) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${formatDate(record.createdAt)}</td>
        <td>${Number(record.voltaje || 0).toFixed(2)}</td>
        <td>${Number(record.amperaje || 0).toFixed(2)}</td>
        <td>${Number(record.frecuencia || 0).toFixed(2)}</td>
        <td>${Number(record.torqueAplicadoNm || record.torque || 0).toFixed(2)}</td>
        <td>${Number(record.potenciaHp || record.hp_calculado || 0).toFixed(2)}</td>
      `;
      parametrosHistoryBody.appendChild(tr);
    });

  nivelesHistoryBody.innerHTML = "";
  niveles
    .slice()
    .sort(sortByDateDesc)
    .forEach((record) => {
      const pdfUrl = record.reportePdfUrl || record.reporte_pdf_url || "";
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${formatDate(record.createdAt)}</td>
        <td>${Number(record.ft || 0).toFixed(2)}</td>
        <td>${Number(record.porcentaje || 0).toFixed(2)}</td>
        <td>${Number(record.pip || 0).toFixed(2)}</td>
        <td>${Number(record.pbhp || 0).toFixed(2)}</td>
        <td>${pdfUrl ? `<a href="${escapeHtml(pdfUrl)}" target="_blank" rel="noreferrer">Ver PDF</a>` : "-"}</td>
      `;
      nivelesHistoryBody.appendChild(tr);
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

function initHistoryDataTable(selector, kind, exportColumns) {
  if (!window.jQuery || !window.jQuery.fn?.DataTable) {
    return;
  }

  const table = window.jQuery(selector);
  const current = kind === "parametros" ? state.parametrosHistoryDataTable : state.nivelesHistoryDataTable;
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
  state.nivelesHistoryDataTable = instance;
}

function exportHistoryWord(selector, kind) {
  const table = document.querySelector(selector)?.cloneNode(true);
  if (!table) {
    return;
  }

  const title = kind === "parametros"
    ? "Historico Completo de Parametros"
    : "Historico Completo de Tomas de Nivel";

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
    ["Arena", firstNonEmpty(well.arena, well.sand, "N/A")],
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
      potencial: Number(row.potencial || row.Potencial || 0)
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
  wellEditForm.arena.value = firstNonEmpty(pozo.arena, pozo.sand, "");
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
  Object.entries(views).forEach(([key, element]) => {
    element.classList.toggle("is-visible", key === viewName);
  });
}

function setActiveNav(viewName) {
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === viewName);
  });
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
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function sortByDateDesc(a, b) {
  return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
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

function formatDate(value) {
  return new Date(value || Date.now()).toLocaleString();
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
