const SQRT3 = Math.sqrt(3);
const KW_TO_HP = 1.34102209;

export function calcularPotenciaYTorque({
  voltaje,
  amperaje,
  frecuencia,
  factorPotencia = 0.86,
  eficiencia = 0.92,
  polos = 4,
  torqueManual = null
}) {
  const v = toNumber(voltaje);
  const i = toNumber(amperaje);
  const hz = toNumber(frecuencia);
  const fp = toNumber(factorPotencia) || 0.86;
  const eta = toNumber(eficiencia) || 0.92;
  const p = Math.max(2, Math.round(toNumber(polos) || 4));

  if (v <= 0 || i <= 0 || hz <= 0) {
    return {
      potenciaKw: 0,
      potenciaHp: 0,
      torqueTeoricoNm: 0,
      torqueAplicadoNm: 0,
      rpmSincronica: 0,
      esTorqueManual: false
    };
  }

  const potenciaKw = (SQRT3 * v * i * fp * eta) / 1000;
  const potenciaHp = potenciaKw * KW_TO_HP;
  const rpmSincronica = (120 * hz) / p;
  const torqueTeoricoNm = rpmSincronica > 0 ? (9550 * potenciaKw) / rpmSincronica : 0;

  const torqueManualNum = toOptionalNumber(torqueManual);
  const esTorqueManual = torqueManualNum !== null;
  const torqueAplicadoNm = esTorqueManual ? torqueManualNum : torqueTeoricoNm;

  return {
    potenciaKw,
    potenciaHp,
    torqueTeoricoNm,
    torqueAplicadoNm,
    rpmSincronica,
    esTorqueManual
  };
}

export function calcularTendencia(valorActual, historico = [], umbral = 0.15) {
  const actual = toNumber(valorActual);
  const ultimos = historico
    .map((item) => toNumber(item))
    .filter((num) => Number.isFinite(num) && num > 0)
    .slice(-3);

  if (!ultimos.length || actual <= 0) {
    return {
      variacion: 0,
      direccion: "estable",
      alerta: false
    };
  }

  const promedio = ultimos.reduce((acc, value) => acc + value, 0) / ultimos.length;
  if (!promedio) {
    return {
      variacion: 0,
      direccion: "estable",
      alerta: false
    };
  }

  const variacion = (actual - promedio) / promedio;
  const alerta = Math.abs(variacion) > umbral;
  const direccion = variacion > 0 ? "sube" : variacion < 0 ? "baja" : "estable";

  return { variacion, direccion, alerta };
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toOptionalNumber(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
