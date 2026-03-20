# PlayOFans — Plan de Correcciones

Auditoría completa realizada el 20/03/2026.
32 hallazgos organizados en 6 fases por prioridad.

---

## FASE 1 — Críticos (rompen funcionalidad core)
> Impiden el funcionamiento básico del superadmin y billing.

### ✅ S2 · CORS header faltante `X-Superadmin-Secret`
- **Archivo**: `netlify/functions/_shared.js` L10
- **Problema**: `Access-Control-Allow-Headers` no incluía `X-Superadmin-Secret`. Todas las llamadas desde superadmin.html fallaban en preflight CORS.
- **Fix**: Añadido `X-Superadmin-Secret` al header.
- **Estado**: CORREGIDO

### ✅ S1 · CORS Wildcard `*`
- **Archivo**: `netlify/functions/_shared.js` L9
- **Problema**: `Access-Control-Allow-Origin: '*'` permite requests desde cualquier dominio.
- **Fix**: Cambiado a `https://playofans.com`.
- **Estado**: CORREGIDO

### ✅ F1 · `next_billing_date` nunca se establece
- **Archivos**: `sa-create-model.js` L72 y `sa-review-registration.js` L77
- **Problema**: Al crear modelos no se seteaba `next_billing_date`. La función SQL `generate_monthly_billing()` requiere este campo no-null para generar cobros.
- **Fix**: Añadido `next_billing_date` = 1 mes desde la creación en ambas funciones.
- **Estado**: CORREGIDO

---

## FASE 2 — Seguridad Alta
> Vulnerabilidades que exponen datos o permiten abuso.

### ✅ S3 · Endpoint `send-expiry-warning` sin autenticación
- **Archivo**: `netlify/functions/send-expiry-warning.js` L63-93
- **Problema**: Cualquier persona puede hacer POST con un `model_id` y enviar emails de vencimiento a cualquier modelo sin autenticación.
- **Fix**: Añadido `authenticateSuperAdmin` al handler HTTP. La función interna `sendExpiryEmail()` exportada para `daily-cron.js` sigue sin requerir auth.
- **Estado**: CORREGIDO

### ✅ S5 · XSS en email de contacto
- **Archivo**: `netlify/functions/submit-contact.js` L48
- **Problema**: `${message.trim().replace(/\n/g, '<br>')}` inserta contenido del usuario en HTML sin sanitizar. Posible inyección de HTML/JS en el email.
- **Fix**: Añadida función `escapeHtml()` que escapa `<>&"'` antes de insertar nombre, email y mensaje en el template HTML.
- **Estado**: CORREGIDO

### ✅ S4 · Rate limiting inútil en serverless
- **Archivo**: `netlify/functions/validate-code.js` L3-6
- **Problema**: `new Map()` en memoria se pierde en cada cold start. El rate limiting no funciona.
- **Fix**: Reemplazado con tabla `rate_limits` en Supabase. Cada intento inserta un registro con IP y timestamp, y se cuenta contra la ventana de 60s. Añadida función `cleanup_rate_limits()` para auto-limpiar registros >5 min.
- **Estado**: CORREGIDO

### ✅ F3 · Race condition en `confirm-spin`
- **Archivo**: `netlify/functions/confirm-spin.js` L52-68
- **Problema**: SELECT → calcular → UPDATE no es atómico. Dos confirms concurrentes pueden perder un decremento.
- **Fix**: Creada función RPC `confirm_spin_atomic(p_spin_id, p_code_id)` en PostgreSQL que marca el spin como verificado y decrementa `remaining_spins` atómicamente en una sola transacción. `confirm-spin.js` ahora llama a esta RPC en vez del flujo SELECT→UPDATE.
- **Estado**: CORREGIDO

---

## FASE 3 — Bugs Funcionales
> Funcionalidades rotas o incompletas que afectan al negocio.

### ✅ F2 · Descuentos nunca se aplican
- **Archivos**: `schema.sql` L439-510 (calculate_model_price), funciones `sa-*-discount.js`
- **Problema**: La tabla `discount_codes` existía, el CRUD funcionaba, pero `calculate_model_price()` nunca consultaba ni aplicaba descuentos.
- **Fix**: Añadida columna `applied_discount_code` en `models`. `calculate_model_price()` ahora busca el código en `discount_codes`, verifica que esté activo/vigente/con usos disponibles, y aplica el % de descuento después del descuento por referidos.
- **Estado**: CORREGIDO

### ✅ F4 · Contacto no guarda en BD
- **Archivo**: `netlify/functions/submit-contact.js`
- **Problema**: Solo enviaba email via Resend. SPRINTS.md especifica "guardar en Supabase + email".
- **Fix**: Creada tabla `contact_messages` (id, name, email, message, created_at). `submit-contact.js` ahora inserta en la tabla antes de enviar el email.
- **Estado**: CORREGIDO

### ✅ F5 · CSV export sin columna `credit_applied`
- **Archivo**: `netlify/functions/sa-billing-export.js` L30-40
- **Problema**: El CSV de billing no incluía `credit_applied` aunque existe en `billing_records`.
- **Fix**: Añadida columna "Crédito Aplicado" al header y `r.credit_applied || 0` a cada fila.
- **Estado**: CORREGIDO

### ✅ F6 · `sa-billing-list.js` sin try/catch
- **Archivo**: `netlify/functions/sa-billing-list.js` L7-8
- **Problema**: `authenticateSuperAdmin` estaba fuera del try/catch. Excepciones de red devolvían 500 sin cuerpo JSON.
- **Fix**: Envuelto todo el handler en try/catch.
- **Estado**: CORREGIDO

### ✅ F7 · Creación de modelo no envía welcome email
- **Archivos**: `sa-create-model.js`, `sa-review-registration.js`, `send-welcome-email.js`
- **Problema**: Después de crear modelo, devolvía credenciales pero no enviaba email de bienvenida.
- **Fix**: Refactorizado `send-welcome-email.js` para exportar función reutilizable `sendWelcomeEmail()`. Ambos `sa-create-model.js` y `sa-review-registration.js` ahora la llaman automáticamente después de crear el modelo (con try/catch para no bloquear si falla).
- **Estado**: CORREGIDO

---

## FASE 4 — Inconsistencias
> Datos incorrectos, redirects rotos, documentación desactualizada.

### ✅ I1 · Redirect a `afiliados.html` inexistente
- **Archivo**: `netlify.toml` L46-48
- **Problema**: `/afiliados` redirige a `afiliados.html` que nunca se creó.
- **Fix**: Eliminado el redirect. No se necesita página separada: admin.html tiene la pestaña completa de Afiliados e index.html explica el programa en la sección Referidos.
- **Estado**: CORREGIDO

### ✅ I2 · Documentación afiliados desactualizada
- **Archivo**: `contexto.md` L107
- **Problema**: Decía "20% recurrente 12 meses", debía ser "10% recurrente 6 meses".
- **Fix**: Actualizada la línea.
- **Estado**: CORREGIDO

### ✅ I3 · `contexto.md` lista `afiliados.html`
- **Archivo**: `contexto.md` L134
- **Problema**: Estructura de archivos incluía `afiliados.html` que no existe.
- **Fix**: Eliminada de la estructura de archivos.
- **Estado**: CORREGIDO

### ✅ I4 · Variable de entorno `SUPABASE_ANON_KEY` no documentada
- **Archivo**: `contexto.md` L148-152
- **Problema**: `auth-init.js` usa `SUPABASE_ANON_KEY` pero no aparecía en la lista de env vars.
- **Fix**: Añadida a la lista de variables de entorno.
- **Estado**: CORREGIDO

### ✅ I5 · CTA engañoso "Crear mi cuenta gratis"
- **Archivo**: `index.html` L771
- **Problema**: No existe plan gratis. El mínimo es Solo 49€/mes.
- **Fix**: Cambiado a "Empieza ahora 🚀".
- **Estado**: CORREGIDO

### ✅ I6 · Precios anuales inconsistentes con index.html
- **Archivos**: `schema.sql`, `patch-fase3.sql`, `patch-affiliate-v2.sql`
- **Problema**: Precios anuales en SQL eran (399, 699, 2800) pero la fórmula correcta del index.html es mensual × 0.8 × 12 = (468, 852, 3348).
- **Fix**: Actualizados los 3 archivos SQL. Creado `patch-fase4.sql` con DROP + CREATE de `calculate_model_price()` con precios corregidos.
- **Estado**: CORREGIDO

### ✅ I7 · `PLAN_PRICES` hardcodeado en múltiples lugares
- **Archivos**: `sa-dashboard.js` L3, `_shared.js`
- **Problema**: Precios repetidos en múltiples archivos.
- **Fix**: Centralizado `PLAN_PRICES` en `_shared.js` como export. `sa-dashboard.js` ahora lo importa de ahí. En schema.sql es inevitable pero documentado que deben coincidir.
- **Estado**: CORREGIDO

### ✅ I8 · `payCommission` confuso en modelo credit
- **Archivo**: `superadmin.html` L1188
- **Problema**: Función `payCommission()` con confirm "Marcar como pagada" no tiene sentido en el modelo de saldo a favor. Además era código muerto (ningún botón la invocaba).
- **Fix**: Eliminada la función. La tabla ya muestra "✅ Saldo a favor" estáticamente.
- **Estado**: CORREGIDO

---

## FASE 5 — Rendimiento y Mejoras Técnicas
> No rompen nada pero degradan la experiencia o escalabilidad.

### ✅ P1 · N+1 queries en lista de modelos
- **Archivo**: `netlify/functions/sa-list-models.js` L29-34
- **Problema**: 1 query de spins por cada modelo. Con 100 modelos = 101 queries.
- **Fix**: Creada función RPC `count_spins_by_models(model_ids uuid[])` que hace un solo `GROUP BY`. `sa-list-models.js` ahora llama a esta RPC y mapea los resultados.
- **Estado**: CORREGIDO

### ✅ P2 · Cálculo impreciso de 6 meses (183 días)
- **Archivo**: `admin.html` L1382
- **Problema**: `183*24*60*60*1000` no equivale exactamente a 6 meses.
- **Fix**: Reemplazado con `new Date(); d.setMonth(d.getMonth() - 6)` para cálculo preciso.
- **Estado**: CORREGIDO

### ✅ P3 · `tenant-config.js` hace SELECT *
- **Archivo**: `netlify/functions/tenant-config.js` L16
- **Problema**: Traía todas las columnas incluyendo datos sensibles (`admin_notes`, `supabase_user_id`).
- **Fix**: Listadas solo las 14 columnas necesarias en el `.select()`. Eliminados `admin_notes`, `supabase_user_id`, `email`, etc.
- **Estado**: CORREGIDO

### ✅ M4 · Spins no verificados bloquean premios
- **Archivo**: `netlify/functions/prepare-spin.js` L95-97
- **Problema**: Filtraba premios ya otorgados incluyendo spins no verificados. Un spin pendiente indefinidamente bloqueaba ese premio.
- **Fix**: Añadido `.eq('verified', true)` al filtro de spins previos.
- **Estado**: CORREGIDO

---

## FASE 6 — Features No Implementadas y Menores
> Definidas en especificación pero no construidas.

### ✅ NI1 · 2FA TOTP para Superadmin
- **Archivo**: `superadmin.html`
- **Problema**: Especificado como requisito de seguridad, no implementado.
- **Fix**: Integrado Supabase MFA completo. Flujo: login → si no tiene TOTP enrollado, muestra pantalla de enrollment con QR + clave manual → si ya tiene TOTP, muestra challenge de 6 dígitos. Screens: #totp-screen (challenge), #totp-enroll-screen (enrollment). Funciones: `verifyTotp()`, `startTotpEnrollment()`, `confirmEnrollTotp()`.
- **Estado**: CORREGIDO

### ⬜ NI2 · Rasca y Gana
- **Referencia**: `game_catalog` seed en schema.sql
- **Problema**: Solo existe la ruleta. "Rasca" está en el catálogo pero sin implementación.
- **Scope**: Crear rasca.html con mecánica de rascar + integrar en model-landing.

### ✅ NI3 · Agency multi-model
- **Archivos**: `sa-agency-members.js` (nuevo), `superadmin.html`
- **Problema**: Tabla `agency_members` existía sin UI ni funciones.
- **Fix**: Creada función `sa-agency-members.js` con GET/POST/DELETE para gestionar miembros (máx. 8). UI añadida en el modal de acciones de modelo (solo visible si plan=agency). Validaciones: límite 8, no duplicados, no añadirse a sí mismo.
- **Estado**: CORREGIDO

### ✅ NI4 · Tabla de contactos en BD
- **Referencia**: SPRINTS.md L286
- **Problema**: No había tabla ni se guardaban mensajes de contacto.
- **Fix**: Ya corregido en F4 (Fase 3). Tabla `contact_messages` creada e inserción añadida en `submit-contact.js`.
- **Estado**: CORREGIDO (en F4)

### ✅ NI5 · `sitemap.xml` actualizado
- **Archivo**: `sitemap.xml`
- **Problema**: Faltaba la URL de `/registro`.
- **Fix**: Añadida URL `/registro` con prioridad 0.8.
- **Estado**: CORREGIDO

### ✅ M1 · `og:url` con fallback en ruleta.html
- **Archivo**: `ruleta.html` L12
- **Problema**: `content=""` — crawlers que no ejecutan JS veían URL vacío.
- **Fix**: Añadido fallback `https://playofans.com/` como valor por defecto. El JS dinámico lo sobreescribe con la URL específica del modelo cuando carga.
- **Estado**: CORREGIDO

### ✅ M2 · Página 404 creada
- **Archivo**: `404.html` (nuevo)
- **Problema**: Netlify mostraba su 404 genérico.
- **Fix**: Creada `404.html` con branding PlayOFans, gradientes neón, partículas animadas y botón "Volver al inicio".
- **Estado**: CORREGIDO

### ✅ M3 · Contraseña temporal con cambio forzado
- **Archivos**: `admin.html`, `sa-create-model.js`, `sa-review-registration.js`, `schema.sql`
- **Problema**: Se enviaba password temporal en email pero no se forzaba cambio en primer login.
- **Fix**: Añadida columna `must_change_password` (default false) en `models`. Se setea `true` al crear modelo. `admin.html` verifica el flag tras login y muestra pantalla de cambio de contraseña obligatoria. Al cambiarla, se limpia el flag.
- **Estado**: CORREGIDO

---

## Progreso General

| Fase | Total | Corregidos | Pendientes |
|------|-------|------------|------------|
| 1 — Críticos | 3 | 3 | 0 |
| 2 — Seguridad Alta | 4 | 4 | 0 |
| 3 — Bugs Funcionales | 5 | 5 | 0 |
| 4 — Inconsistencias | 8 | 8 | 0 |
| 5 — Rendimiento | 4 | 4 | 0 |
| 6 — Features/Menores | 8 | 7 | 1 |
| 7 — Visual Casino | 12 | 12 | 0 |
| **TOTAL** | **44** | **43** | **1** |

---

## FASE 7 — Overhaul Visual: Estética Casino Online
> Rediseño visual completo para maximizar engagement. Look & feel de casino online moderno, adictivo y premium.

### ✅ V1 · Hero section index.html — impacto visual casino
- **Archivo**: `index.html` hero section
- **Fix**: Título con gradient text animado (shimmer), palabras clave en dorado (#ffd700), CTA con pulsing glow animation, hero glow con gradiente dorado/pink.
- **Estado**: CORREGIDO

### ✅ V2 · Sección de precios — cards tipo VIP
- **Archivo**: `index.html` pricing section
- **Fix**: Card Pro con borde dorado + precio con gradient gold. Card Agency con acento púrpura. Badge POPULAR con gradient gold-to-orange. Hover mejorado con glow y scale.
- **Estado**: CORREGIDO

### ✅ V3 · Palabras destacadas en color (index.html)
- **Archivo**: `index.html` secciones de texto
- **Fix**: Clases `.hl` (accent) y `.hl-gold` (dorado) creadas. 6 títulos de sección con palabras clave resaltadas. Step card <strong> en dorado. Flechas de pasos en dorado.
- **Estado**: CORREGIDO

### ✅ V4 · Ruleta visual — experiencia casino inmersiva
- **Archivo**: `ruleta.html`
- **Fix**: 24 LED lights parpadeantes alrededor de la ruleta con animación staggered. Clase .spinning con glow amplificado durante giro. Confetti triple-burst al ganar (frontal + laterales). Enhanced box-shadow con glow neón.
- **Estado**: CORREGIDO

### ✅ V5 · Landing de modelo — personalización premium
- **Archivo**: `model-landing.html`
- **Fix**: Partículas flotantes de fondo (30 partículas con colores accent/gold). Game cards con borde glow animado al hover. Emoji con scale al hover. Botón "Jugar" con pulse animation. Nombre de modelo con gradient animado (shimmer).
- **Estado**: CORREGIDO

### ✅ V6 · Micro-interacciones y transiciones globales
- **Archivos**: `index.html`, `model-landing.html`, `ruleta.html`
- **Fix**: Scroll-reveal con IntersectionObserver en todas las secciones de index.html. Ripple effect en botones hero y CTA. Cards con hover translateY(-6px). Navbar ya tenía blur progresivo.
- **Estado**: CORREGIDO

### ✅ V7 · Paleta de colores — rojo/dorado casino
- **Archivos**: `index.html`, `ruleta.html`
- **Fix**: Variables --gold (#ffd700) y --hot-pink (#ff1493) añadidas. Dorado integrado en hero glow, shimmer del título, CTA, step arrows, step card <strong>, testimonial stars con text-shadow, pricing Pro card, y badge POPULAR.
- **Estado**: CORREGIDO

### ✅ V8 · Tipografía y jerarquía visual
- **Archivos**: `ruleta.html`
- **Problema**: Dancing Script cursiva en "FELICITACIONES" y otros títulos de la ruleta era ilegible y antiestética.
- **Fix**: Eliminada fuente Dancing Script. Reemplazada por Poppins weight 900 con text-shadow glow, uppercase y letter-spacing en `.popup-title`, `.controls-title`, `.historial-title` y `.form-title`. Eliminado el import de Google Fonts de Dancing Script.
- **Estado**: CORREGIDO

### ✅ V9 · Demo page — revisión
- **Archivo**: `demo.html`
- **Problema**: demo.html es solo un redirect via `window.location.replace('/demo/ruleta')`.
- **Fix**: Revisado — el archivo es funcional como SEO-friendly redirect para `/demo`. Se mantiene tal cual. No requiere cambios.
- **Estado**: REVISADO

### ✅ V10 · Admin panel — mejoras visuales
- **Archivos**: `admin.html`, `superadmin.html`
- **Problema**: Dropdowns/selects con fondo claro ilegible. Tablas comprimidas. Temas visuales con colores planos y anticuados. Info-row sin espaciado adecuado.
- **Fix**: (1) Añadido `color-scheme: dark` a todos los `select.form-input` en admin y superadmin. (2) Tablas con `min-width` (500px admin, 600px superadmin) y `word-break`. (3) Info-rows con gap y min-width en labels. (4) THEMES actualizado con colores más vibrantes: rose_gold, neon_cyber, gold_vip, red_hot con degradados modernos. (5) Theme cards ahora muestran gradient bar en lugar de 3 dots planos.
- **Estado**: CORREGIDO

### ✅ V11 · Página de registro — mejora de radio buttons
- **Archivo**: `registro.html`
- **Problema**: Radio buttons/pills de selección se veían muy feos — planos, sin feedback visual.
- **Fix**: Rediseño de `.radio-group`: border-radius a 12px, padding ampliado, hover con glow púrpura, radio checked con inner-dot + box-shadow glow, label seleccionado con fondo tintado accent via `:has()`, selected span con font-weight 600. Añadido `color-scheme: dark` a selects del formulario.
- **Estado**: CORREGIDO

### ✅ V12 · Dropdown colors — fix global
- **Archivos**: `admin.html`, `superadmin.html`, `registro.html`
- **Problema**: `<select>` con fondo clarito, texto ilegible en los desplegables nativos del navegador.
- **Fix**: Añadido `color-scheme: dark` a todos los selects. En admin/superadmin via `select.form-input`, en registro via `.field select`.
- **Estado**: CORREGIDO
