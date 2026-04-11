# SurtiTrack

Aplicacion movil para gestion de solicitudes de material auxiliar (bolsas, cajas y otros) con calculo operativo y envio de resumen por correo.

## Estado de release

Este proyecto esta preparado para publicacion en Google Play, pero **no se ha subido ningun build** en este paso.

## Ejecutar en local

```bash
npm install
npm run start
```

## Build local de pruebas (sin publicar)

```bash
npx eas-cli build --platform android --profile stable
```

## Build para Play Store (AAB, sin publicar)

```bash
npx eas-cli build --platform android --profile production
```

## Notas de seguridad implementadas

- Trafico en texto plano deshabilitado en Android.
- Backup de datos de app deshabilitado en Android.
- Permisos Android minimizados y permisos sensibles bloqueados.
- Politica ATS en iOS para evitar cargas arbitrarias inseguras.
- Validacion de correo destino antes de envio.
- Sanitizacion de campos CSV para evitar formula injection.

## Archivos clave de preparacion

- `app.json`: metadatos, versionado, paquete y seguridad base.
- `eas.json`: perfiles `stable` (apk interno) y `production` (aab tienda).
- `PRIVACY_POLICY.md`: politica de privacidad lista para publicar.
- `PLAYSTORE_RELEASE_CHECKLIST.md`: checklist operativo de subida.
