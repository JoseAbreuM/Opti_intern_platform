# Data Schema Map - Convivencia Mapa + Opti

## Objetivo
Mantener compatibilidad entre:
- App GPS/Mapa actual (esquema agregado): `pozos/data` con arreglo `pozos[]`.
- App Optimizacion (esquema operacional): `pozos/{pozoId}` + subcolecciones.

## Esquema compartido actual detectado
- Documento maestro: `pozos/data`
- Campo: `pozos` (array)
- Cada item del array incluye campos como: `id`, `estado`, `zona`, `potencial`, `cabezal`, `variador`, etc.

## Esquema operativo recomendado (Opti)
- `pozos/{pozoId}`
  - Campos resumen: `potencia_instalada_hp`, `ultimo_torque_nm`, `ultima_frecuencia_hz`, `ultimo_nivel_ft`, `updatedAt`, etc.
- `pozos/{pozoId}/parametros`
- `pozos/{pozoId}/tomas_nivel`
- `pozos/{pozoId}/historial_servicios` (siguiente fase)

## Estrategia de compatibilidad (implementada)
1. Lectura de pozos:
- Prioriza `pozos/data.pozos[]`.
- Si no existe, intenta colecciones alternativas (`pozos`, `Pozos`, `wells`, etc.).

2. Escritura base de pozo (edicion):
- Actualiza `pozos/{pozoId}` (merge).
- Intenta tambien actualizar/insertar el item correspondiente en `pozos/data.pozos[]`.

3. Escritura de campo (parametros/nivel):
- Guarda en subcolecciones por pozo.
- Actualiza resumen en `pozos/{pozoId}`.
- Intenta reflejar resumen en `pozos/data.pozos[]` sin bloquear si falla.

## Regla clave de seguridad
- Si la actualizacion del array maestro falla por reglas, no se cae la operacion principal de Opti.
- Esto evita romper la operacion en campo y protege a la app Mapa.

## Campos sugeridos para alineacion futura
- Identidad: `id`, `nombre`, `zona`/`area`, `estado`, `categoria`, `potencial`.
- Operacion: `ultima_frecuencia_hz`, `ultimo_torque_nm`, `potencia_instalada_hp`.
- Nivel: `ultimo_nivel_ft`, `ultimo_pip`, `ultimo_pbhp`, `reporte_pdf_url`.

## Recomendacion de evolucion
1. Mantener `pozos/data` para la app Mapa (legacy).
2. Consolidar escritura nueva en `pozos/{pozoId}` y subcolecciones.
3. Crear un proceso de sincronizacion gradual de `pozos/data` desde el modelo nuevo cuando definan ventana de migracion.
4. En esa fase, migrar mapa para leer del modelo por documento y retirar dependencia del array masivo.
