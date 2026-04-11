# Checklist de Publicacion en Google Play (SurtiTrack)

## A. Configuracion tecnica (ya preparada)

- [x] `name` de app actualizado a SurtiTrack.
- [x] `android.package` definido como `com.surtitrack.app`.
- [x] `version` y `versionCode` incrementados.
- [x] Perfil EAS `production` configurado como `app-bundle`.
- [x] `usesCleartextTraffic` deshabilitado.
- [x] `allowBackup` deshabilitado.
- [x] Permisos minimizados y bloqueos de permisos sensibles.

## B. Antes de subir

- [ ] Generar AAB con: `npx eas-cli build --platform android --profile production`.
- [ ] Descargar y probar el build en dispositivo real (flujo completo).
- [ ] Validar envio de correo y adjunto CSV.
- [ ] Revisar icono adaptativo y splash en Android.

## C. Google Play Console

- [ ] Crear o seleccionar app SurtiTrack.
- [ ] Completar ficha de tienda (titulo, descripcion corta/larga, imagenes).
- [ ] Configurar categoria de app y datos de contacto.
- [ ] Completar seccion Data safety.
- [ ] Completar seccion App content (audiencia, anuncios, etc.).
- [ ] Publicar URL de politica de privacidad (contenido en `PRIVACY_POLICY.md`).

## D. Seguridad y cumplimiento

- [ ] Confirmar que no se solicitan permisos no utilizados.
- [ ] Revisar alertas de Play Console y pre-launch report.
- [ ] Verificar integridad de firma y Play App Signing.

## E. Lanzamiento

- [ ] Subir AAB a pista interna.
- [ ] Corregir hallazgos de pruebas internas.
- [ ] Promover a produccion cuando todo este validado.
