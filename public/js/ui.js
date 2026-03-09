import { calcularPotenciaYTorque, calcularTendencia } from "./calculos.js";
import { getLatestRecords, saveFormData, syncPendingToFirebase } from "./db.js";
import { verifyOfflineLogin } from "./auth.js";
import {
  fetchLatestParametros,
  fetchLatestTomasNivel,
  fetchPozos,
  isFirebaseReady,
  normalizePozoId,
  syncRecordToFirebase,
  uploadTomaNivelPdf
} from "./firebase.js";

const state = {
  wells: [],
  filteredWells: [],
  parametrosByPozo: new Map(),
  nivelesByPozo: new Map(),
  activePozoId: "POZO-001",
  charts: {
    general: null,
    category: null,
    pozo: null
  }
};

const views = {
  dashboard: document.getElementById("view-dashboard"),
  carga: document.getElementById("view-carga"),
  nivel: document.getElementById("view-nivel"),
  ficha: document.getElementById("view-ficha")
};

const sidebar = document.getElementById("sidebar");
const connectionBadge = document.getElementById("connectionBadge");
const syncBadge = document.getElementById("syncBadge");
const hpCalculadoEl = document.getElementById("hpCalculado");
const torqueCalculadoEl = document.getElementById("torqueCalculado");
const parametrosTableBody = document.getElementById("parametrosTableBody");
const nivelesTableBody = document.getElementById("nivelesTableBody");
const wellsTableBody = document.getElementById("wellsTableBody");
const selectedPozoLabel = document.getElementById("selectedPozoLabel");

setupNavigation();
setupForms();
setupWellsTableActions();
setupExport();
setupPWA();
bootstrap();

function setupNavigation() {
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.addEventListener("click", () => {
      const viewName = button.dataset.view;
      switchView(viewName);
      setActiveNav(viewName);
    });
  });

  const toggleSidebar = document.getElementById("toggleSidebar");
  toggleSidebar.addEventListener("click", () => sidebar.classList.toggle("is-collapsed"));
}

function setupForms() {
  const parametrosForm = document.getElementById("parametrosForm");
  const nivelForm = document.getElementById("nivelForm");

  parametrosForm.addEventListener("input", () => {
    const data = new FormData(parametrosForm);
    const result = calcularPotenciaYTorque(Object.fromEntries(data.entries()));
    hpCalculadoEl.textContent = result.potenciaHp.toFixed(2);
    torqueCalculadoEl.textContent = result.torqueAplicadoNm.toFixed(2);
  });

  parametrosForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(parametrosForm).entries());
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
    upsertLocalPozo(pozoId);
    addLocalParametro(pozoId, { ...record, createdAt: new Date().toISOString() });
    setActivePozo(pozoId);
    await trySync();
    renderDashboard();
    renderPozoDetail();
    parametrosForm.reset();
    parametrosForm.pozoId.value = pozoId;
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
    upsertLocalPozo(pozoId);
    addLocalNivel(pozoId, { ...record, createdAt: new Date().toISOString() });
    setActivePozo(pozoId);
    await trySync();
    renderPozoDetail();
    nivelForm.reset();
    nivelForm.pozoId.value = pozoId;
  });
}

function setupWellsTableActions() {
  ["filterNombre", "filterCategoria", "filterEstado", "filterArea"].forEach((id) => {
    document.getElementById(id).addEventListener("input", applyWellFilters);
    document.getElementById(id).addEventListener("change", applyWellFilters);
  });

  wellsTableBody.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-pozo-id]");
    if (!button) {
      return;
    }
    const pozoId = button.dataset.pozoId;
    setActivePozo(pozoId);
    switchView("ficha");
    setActiveNav("ficha");
  });
}

function setupExport() {
  document.getElementById("exportExcelBtn").addEventListener("click", () => {
    const wb = XLSX.utils.table_to_book(document.getElementById("parametrosTable"), { sheet: "Parametros" });
    XLSX.writeFile(wb, `parametros_${state.activePozoId}_${Date.now()}.xlsx`);
  });

  document.getElementById("exportWellsExcel").addEventListener("click", () => {
    const wb = XLSX.utils.table_to_book(document.getElementById("wellsTable"), { sheet: "Pozos" });
    XLSX.writeFile(wb, `pozos_${Date.now()}.xlsx`);
  });

  document.getElementById("printWells").addEventListener("click", printWellsTable);
  document.getElementById("exportWellsWord").addEventListener("click", exportWellsWord);
  document.getElementById("exportWellsPdf").addEventListener("click", exportWellsPdf);
}

function setupPWA() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => null);
    navigator.serviceWorker.addEventListener("message", (event) => {
      if (event.data?.type === "SYNC_PENDING_FORMS") {
        trySync();
      }
    });
  }

  window.addEventListener("online", trySync);
  window.addEventListener("online", updateConnectionBadge);
  window.addEventListener("offline", updateConnectionBadge);
  updateConnectionBadge();
}

async function bootstrap() {
  verifyOfflineLogin();

  const latestLocal = await getLatestRecords();
  hydrateLocalState(latestLocal);

  if (navigator.onLine && isFirebaseReady()) {
    state.wells = await fetchPozos();
  }

  if (!state.wells.length) {
    state.wells = buildWellsFromLocal();
  }

  if (!state.wells.length) {
    state.wells = [{ id: "POZO-001", nombre: "POZO-001", categoria: 2, estado: "En observacion", area: "N/A", potencial: 0 }];
  }

  state.filteredWells = [...state.wells];
  setActivePozo(state.wells[0].id);
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

  if (navigator.onLine && isFirebaseReady()) {
    const [remoteParams, remoteNiveles] = await Promise.all([
      fetchLatestParametros(normalized, 20),
      fetchLatestTomasNivel(normalized, 20)
    ]);
    if (remoteParams.length) {
      state.parametrosByPozo.set(normalized, remoteParams);
    }
    if (remoteNiveles.length) {
      state.nivelesByPozo.set(normalized, remoteNiveles);
    }
  }

  renderPozoDetail();
}

function renderDashboard() {
  const total = state.wells.length || 1;
  const c1 = state.wells.filter((w) => Number(w.categoria) === 1).length;
  const c2 = state.wells.filter((w) => Number(w.categoria) === 2).length;
  const c3 = state.wells.filter((w) => Number(w.categoria) === 3).length;

  document.getElementById("kpiTotalPozos").textContent = String(total);
  document.getElementById("kpiCat1").textContent = `${Math.round((c1 / total) * 100)}%`;
  document.getElementById("kpiCat2").textContent = `${Math.round((c2 / total) * 100)}%`;
  document.getElementById("kpiCat3").textContent = `${Math.round((c3 / total) * 100)}%`;

  document.getElementById("categoryLegend").innerHTML = `
    <span>Cat. 1 Activos: ${c1}</span>
    <span>Cat. 2 Mantenimiento menor: ${c2}</span>
    <span>Cat. 3 Operaciones mayores: ${c3}</span>
  `;

  renderCategoryChart([c1, c2, c3]);
  renderGeneralTrendChart();
}

function renderWellsTable() {
  wellsTableBody.innerHTML = "";
  state.filteredWells.forEach((well) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${escapeHtml(well.nombre || well.id)}</td>
      <td>${well.categoria}</td>
      <td>${escapeHtml(well.estado || "N/A")}</td>
      <td>${escapeHtml(well.area || "N/A")}</td>
      <td>${Number(well.potencial || 0).toFixed(2)}</td>
      <td><button class="btn-secondary" data-pozo-id="${well.id}">Ver mas</button></td>
    `;
    wellsTableBody.appendChild(row);
  });
}

function applyWellFilters() {
  const nombre = document.getElementById("filterNombre").value.trim().toLowerCase();
  const categoria = document.getElementById("filterCategoria").value;
  const estado = document.getElementById("filterEstado").value.trim().toLowerCase();
  const area = document.getElementById("filterArea").value.trim().toLowerCase();

  state.filteredWells = state.wells.filter((well) => {
    const byNombre = !nombre || String(well.nombre || well.id).toLowerCase().includes(nombre);
    const byCategoria = !categoria || String(well.categoria) === categoria;
    const byEstado = !estado || String(well.estado || "").toLowerCase().includes(estado);
    const byArea = !area || String(well.area || "").toLowerCase().includes(area);
    return byNombre && byCategoria && byEstado && byArea;
  });

  renderWellsTable();
}

function renderPozoDetail() {
  const pozoId = state.activePozoId;
  const parametros = (state.parametrosByPozo.get(pozoId) || []).slice().sort(sortByDateDesc).slice(0, 12);
  const niveles = (state.nivelesByPozo.get(pozoId) || []).slice().sort(sortByDateDesc).slice(0, 12);

  const trendHz = [];
  const trendTorque = [];
  parametrosTableBody.innerHTML = "";

  parametros.reverse().forEach((record) => {
    const hz = Number(record.frecuencia || 0);
    const torque = Number(record.torqueAplicadoNm || record.torque || record.torqueManual || 0);
    const hp = Number(record.potenciaHp || record.hp_calculado || 0);
    const amp = Number(record.amperaje || 0);
    const hzTrend = calcularTendencia(hz, trendHz);
    const tqTrend = calcularTendencia(torque, trendTorque);
    trendHz.push(hz);
    trendTorque.push(torque);

    const arrow = hzTrend.alerta || tqTrend.alerta
      ? hzTrend.direccion === "sube" || tqTrend.direccion === "sube"
        ? "↑"
        : "↓"
      : "→";

    const cls = arrow === "↑" ? "trend-up" : arrow === "↓" ? "trend-down" : "";
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${formatDate(record.createdAt)}</td>
      <td>${hz.toFixed(2)}</td>
      <td>${amp.toFixed(2)}</td>
      <td>${torque.toFixed(2)}</td>
      <td>${hp.toFixed(2)}</td>
      <td class="${cls}">${arrow}</td>
    `;
    parametrosTableBody.prepend(row);
  });

  nivelesTableBody.innerHTML = "";
  niveles.reverse().forEach((record) => {
    const pdfUrl = record.reportePdfUrl || record.reporte_pdf_url || "";
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${formatDate(record.createdAt)}</td>
      <td>${Number(record.ft || 0).toFixed(2)}</td>
      <td>${Number(record.porcentaje || 0).toFixed(2)}</td>
      <td>${Number(record.pip || 0).toFixed(2)}</td>
      <td>${Number(record.pbhp || 0).toFixed(2)}</td>
      <td>${pdfUrl ? `<a href="${pdfUrl}" target="_blank" rel="noreferrer">Ver PDF</a>` : "-"}</td>
    `;
    nivelesTableBody.prepend(row);
  });

  const latestParam = parametros[0] || {};
  const latestNivel = niveles[0] || {};
  document.getElementById("cmpHp").textContent = Number(latestParam.potenciaHp || latestParam.hp_calculado || 0).toFixed(2);
  document.getElementById("cmpTorque").textContent = Number(latestParam.torqueAplicadoNm || latestParam.torque || 0).toFixed(2);
  document.getElementById("cmpNivel").textContent = Number(latestNivel.ft || 0).toFixed(2);
  document.getElementById("cmpPip").textContent = Number(latestNivel.pip || 0).toFixed(2);

  renderPozoTrendChart(parametros, niveles);
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
      labels: ["Cat 1", "Cat 2", "Cat 3"],
      datasets: [{ data: values, backgroundColor: ["#1bbf83", "#f3b941", "#f05656"] }]
    },
    options: { plugins: { legend: { display: false } } }
  });
}

function renderGeneralTrendChart() {
  if (!window.Chart) {
    return;
  }

  const all = [];
  state.parametrosByPozo.forEach((items) => {
    items.forEach((row) => {
      all.push({
        createdAt: row.createdAt,
        hp: Number(row.potenciaHp || row.hp_calculado || 0)
      });
    });
  });

  all.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const last = all.slice(-15);
  const labels = last.map((item) => shortDate(item.createdAt));
  const values = last.map((item) => item.hp);

  const ctx = document.getElementById("generalTrendChart");
  state.charts.general?.destroy();
  state.charts.general = new window.Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{ label: "HP", data: values, borderColor: "#1f8eff", tension: 0.3 }]
    },
    options: { plugins: { legend: { display: true } } }
  });
}

function renderPozoTrendChart(parametros, niveles) {
  if (!window.Chart) {
    return;
  }

  const p = parametros.slice(0, 10).reverse();
  const n = niveles.slice(0, 10).reverse();
  const labels = p.length ? p.map((item) => shortDate(item.createdAt)) : n.map((item) => shortDate(item.createdAt));
  const hp = p.map((item) => Number(item.potenciaHp || item.hp_calculado || 0));
  const ft = n.map((item) => Number(item.ft || 0));

  const ctx = document.getElementById("pozoTrendChart");
  state.charts.pozo?.destroy();
  state.charts.pozo = new window.Chart(ctx, {
    data: {
      labels,
      datasets: [
        { type: "line", label: "HP", data: hp, borderColor: "#1f8eff", yAxisID: "y" },
        { type: "bar", label: "Nivel ft", data: ft, backgroundColor: "rgba(27,191,131,0.45)", yAxisID: "y1" }
      ]
    },
    options: {
      scales: {
        y: { position: "left" },
        y1: { position: "right", grid: { drawOnChartArea: false } }
      }
    }
  });
}

function hydrateLocalState(records) {
  records.forEach((row) => {
    const pozoId = normalizePozoId(row.payload?.pozoId || "POZO-001");
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
  return [...ids].map((id) => ({
    id,
    nombre: id,
    categoria: 2,
    estado: "En observacion",
    area: "N/A",
    potencial: 0
  }));
}

function addLocalParametro(pozoId, row) {
  const current = state.parametrosByPozo.get(pozoId) || [];
  state.parametrosByPozo.set(pozoId, dedupeByKey([row, ...current], paramKey));
}

function addLocalNivel(pozoId, row) {
  const current = state.nivelesByPozo.get(pozoId) || [];
  state.nivelesByPozo.set(pozoId, dedupeByKey([row, ...current], nivelKey));
}

function upsertLocalPozo(pozoId) {
  if (state.wells.some((w) => w.id === pozoId)) {
    return;
  }
  state.wells.unshift({ id: pozoId, nombre: pozoId, categoria: 2, estado: "En observacion", area: "N/A", potencial: 0 });
  applyWellFilters();
}

function exportWellsPdf() {
  if (!window.jspdf?.jsPDF) {
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  doc.text("Tabla de Pozos", 14, 12);
  const rows = state.filteredWells.map((w) => [w.nombre || w.id, w.categoria, w.estado || "", w.area || "", Number(w.potencial || 0).toFixed(2)]);
  doc.autoTable({ head: [["Nombre", "Categoria", "Estado", "Area", "Potencial"]], body: rows, startY: 18 });
  doc.save(`pozos_${Date.now()}.pdf`);
}

function exportWellsWord() {
  const html = `
    <html><body>
      <h2>Tabla de Pozos</h2>
      ${document.getElementById("wellsTable").outerHTML}
    </body></html>
  `;
  const blob = new Blob([html], { type: "application/msword" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `pozos_${Date.now()}.doc`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function printWellsTable() {
  const printWin = window.open("", "_blank", "width=1024,height=720");
  if (!printWin) {
    return;
  }
  printWin.document.write(`<html><body><h2>Tabla de Pozos</h2>${document.getElementById("wellsTable").outerHTML}</body></html>`);
  printWin.document.close();
  printWin.print();
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

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

