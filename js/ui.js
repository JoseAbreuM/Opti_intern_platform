import { calcularPotenciaYTorque, calcularTendencia } from "./calculos.js";
import { saveFormData, getLatestRecords, syncPendingToFirebase } from "./db.js";
import { verifyOfflineLogin } from "./auth.js";
import {
  fetchLatestParametros,
  isFirebaseReady,
  normalizePozoId,
  syncRecordToFirebase
} from "./firebase.js";

const state = {
  historicoHz: [],
  historicoTorque: []
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
const kpiHp = document.getElementById("kpiHp");
const kpiTorque = document.getElementById("kpiTorque");
const tableBody = document.getElementById("parametrosTableBody");

let activePozoId = "POZO-001";

setupNavigation();
setupForms();
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

    const record = {
      ...payload,
      pozoId: normalizePozoId(payload.pozoId),
      potenciaHp: result.potenciaHp,
      torqueTeoricoNm: result.torqueTeoricoNm,
      torqueAplicadoNm: result.torqueAplicadoNm,
      tipo: "parametros"
    };

    activePozoId = record.pozoId;
    await saveFormData("parametros", record);
    appendRow(record);
    updateKpis(result);
    await trySync();
    parametrosForm.reset();
  });

  nivelForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(nivelForm).entries());
    const pozoId = normalizePozoId(payload.pozoId);
    activePozoId = pozoId;
    await saveFormData("toma_nivel", { ...payload, pozoId, tipo: "toma_nivel" });
    await trySync();
    nivelForm.reset();
  });
}

function setupExport() {
  const exportBtn = document.getElementById("exportExcelBtn");
  exportBtn.addEventListener("click", () => {
    const table = document.getElementById("parametrosTable");
    const wb = XLSX.utils.table_to_book(table, { sheet: "UltimosParametros" });
    XLSX.writeFile(wb, `parametros_pozo_${Date.now()}.xlsx`);
  });
}

function setupPWA() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => null);

    navigator.serviceWorker.addEventListener("message", (event) => {
      if (event.data?.type === "SYNC_PENDING_FORMS") {
        trySync();
      }
    });
  }

  window.addEventListener("online", trySync);
  updateConnectionBadge();
  window.addEventListener("online", updateConnectionBadge);
  window.addEventListener("offline", updateConnectionBadge);
}

async function bootstrap() {
  verifyOfflineLogin();

  const latest = await getLatestRecords();
  latest.filter((r) => r.formType === "parametros").forEach((row) => appendRow(row.payload, row.createdAt));

  if (isFirebaseReady() && navigator.onLine) {
    const remote = await fetchLatestParametros(activePozoId);
    remote.reverse().forEach((row) => appendRow(row, row.createdAt));
  }

  if (window.lucide) {
    window.lucide.createIcons();
  }

  switchView("dashboard");
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

  if ("serviceWorker" in navigator && "SyncManager" in window) {
    const reg = await navigator.serviceWorker.ready;
    try {
      await reg.sync.register("sync-pending-forms");
    } catch (error) {
      // Background Sync no disponible en algunos navegadores.
    }
  }
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

function appendRow(record, createdAt) {
  if (!record || !record.frecuencia) {
    return;
  }

  const hz = Number(record.frecuencia) || 0;
  const torque = Number(record.torqueAplicadoNm || record.torqueManual || 0);
  const hp = Number(record.potenciaHp || 0);
  const amp = Number(record.amperaje || 0);

  const trendHz = calcularTendencia(hz, state.historicoHz);
  const trendTorque = calcularTendencia(torque, state.historicoTorque);
  state.historicoHz.push(hz);
  state.historicoTorque.push(torque);

  const trendArrow = trendHz.alerta || trendTorque.alerta
    ? trendHz.direccion === "sube" || trendTorque.direccion === "sube"
      ? "↑"
      : "↓"
    : "→";

  const trendClass = trendArrow === "↑" ? "trend-up" : trendArrow === "↓" ? "trend-down" : "";

  const row = document.createElement("tr");
  row.innerHTML = `
    <td>${new Date(createdAt || Date.now()).toLocaleString()}</td>
    <td>${hz.toFixed(2)}</td>
    <td>${amp.toFixed(2)}</td>
    <td>${torque.toFixed(2)}</td>
    <td>${hp.toFixed(2)}</td>
    <td class="${trendClass}">${trendArrow}</td>
  `;

  tableBody.prepend(row);

  if (tableBody.children.length > 12) {
    tableBody.removeChild(tableBody.lastChild);
  }
}

function updateKpis(result) {
  kpiHp.textContent = result.potenciaHp.toFixed(2);
  kpiTorque.textContent = result.torqueAplicadoNm.toFixed(2);
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

