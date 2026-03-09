# Conexion a la misma base de datos (mapa-trillas-bare) con deploy distinto

Este proyecto puede compartir Firestore con la app GPS sin compartir Hosting.

## 1) Configurar credenciales del mismo proyecto Firebase

Editar `public/firebase.config.js` con las claves reales del proyecto `mapa-trillas-bare`.

Estructura usada por esta app:
- `pozos/{pozoId}`
- `pozos/{pozoId}/parametros`
- `pozos/{pozoId}/tomas_nivel`

Campos que actualiza:
- En `parametros`: voltaje, amperaje, frecuencia, torque, hp_calculado, createdAt, sourceApp
- En `tomas_nivel`: ft, porcentaje, pip, pbhp, createdAt, sourceApp
- En documento `pozos/{pozoId}` (merge): `potencia_instalada_hp`, `ultimo_torque_nm`, `ultima_frecuencia_hz`, `updatedAt`, `fuente_ultima_actualizacion`

## 2) Deploy diferente, misma DB

Usa Firebase Hosting con otro `site` para esta app.

Comandos sugeridos:

```bash
firebase login
firebase use mapa-trillas-bare
firebase hosting:sites:create opti-intern-platform
firebase target:apply hosting optiams opti-intern-platform
```

En `firebase.json`, asigna el target nuevo:

```json
{
  "hosting": [
    {
      "target": "optiams",
      "public": "public",
      "ignore": ["firebase.json", "**/.*", "**/node_modules/**"]
    }
  ]
}
```

Deploy:

```bash
firebase deploy --only hosting:optiams
```

## 3) Reglas recomendadas para convivencia entre apps

- Permitir lecturas/escrituras autenticadas por rol.
- Exigir `sourceApp` dentro de valores permitidos: `mapa-trillas-bare`, `opti-intern-platform`.
- Validar tipos numericos y limites de negocio en `parametros` y `tomas_nivel`.

## 4) Integracion en tiempo real con la app GPS

Como ambas apps comparten Firestore:
- Cambios en `pozos/{pozoId}` se reflejan en ambas aplicaciones.
- Puedes crear listeners por `pozoId` para estados como `En Revision` y tareas pendientes.
