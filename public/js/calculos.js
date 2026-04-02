const SQRT3 = Math.sqrt(3);
const KW_TO_HP = 1.34102209;

export function calcularPotenciaYTorque({
  voltaje,
  amperaje,
  frecuencia,
  rpm,
  torqueManual = null
}) {
  const v = toNumber(voltaje);
  const i = toNumber(amperaje);
  const hz = toNumber(frecuencia);
  const rpmOperacional = toNumber(rpm);

  if (v <= 0 || i <= 0 || hz <= 0 || rpmOperacional <= 0) {
    return {
      potenciaKw: 0,
      potenciaHp: 0,
      torqueTeoricoNm: 0,
      torqueAplicadoNm: 0,
      rpmSincronica: 0,
      esTorqueManual: false
    };
  }

  const torqueTeoricoNm = (v * i * 7.0424) / rpmOperacional;

  const torqueManualNum = toOptionalNumber(torqueManual);
  const esTorqueManual = torqueManualNum !== null;
  const torqueAplicadoNm = esTorqueManual ? torqueManualNum : torqueTeoricoNm;
  const potenciaKw = (torqueAplicadoNm * rpmOperacional) / 9550;
  const potenciaHp = potenciaKw * KW_TO_HP;
  const rpmSincronica = rpmOperacional;

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
