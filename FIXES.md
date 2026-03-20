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

---
---

# 🔍 AUDITORÍA COMPLETA #2 — 20/03/2026

Segunda auditoría completa del proyecto PlayOFans.  
Todos los hallazgos organizados por prioridad. Incluye bugs, seguridad, inconsistencias, features faltantes e ideas nuevas.

---

## FASE 1 — CRÍTICOS (Seguridad + rompen funcionalidad)

### ⬜ C1 · XSS en `mostrarMensaje()` via innerHTML
- **Archivo**: `ruleta.html` L1849-1851
- **Problema**: `mostrarMensaje(msg)` usa `innerHTML` para insertar mensajes. Múltiples llamadas inyectan `nombreUsuario` (dato del usuario) sin escapar:
  - L1684: `¡Felicidades ${nombreUsuario}! Ganaste: <b>${premioGanado}</b>`
  - L1733: `¡Gracias por participar ${nombreUsuario}!`
  - L1799: `¡Hola ${nombreUsuario}!`
  - L1797: `welcomeMsg` con `{nombre}` reemplazado por `nombreUsuario`
- **Riesgo**: Si `fan_name` contiene `<img src=x onerror="...">`, se ejecuta JavaScript.
- **Fix**: Usar `textContent` o escapar `nombreUsuario` con la función `escapeHtml()` que ya existe en L1276. Para mantener `<b>` en premios, escapar solo la parte del usuario.
- **Prioridad**: 🔴 CRÍTICA

### ⬜ C2 · IDs HTML duplicados en admin.html
- **Archivo**: `admin.html` L329/L525, L335/L527
- **Problema**: `id="new-pass"` aparece 2 veces (en change-pass-screen y en settings). `id="change-pass-btn"` también duplicado. `getElementById` solo retorna el primero → el cambio de contraseña en Settings no funciona.
- **Fix**: Renombrar los de Settings a `id="settings-new-pass"` y `id="settings-change-pass-btn"`.
- **Prioridad**: 🔴 CRÍTICA

### ⬜ C3 · Función `doChangePassword()` definida 2 veces
- **Archivo**: `admin.html` L771 y L1518
- **Problema**: La segunda definición (L1518) sobreescribe la primera (L771). Tienen lógica diferente: L771 exige 8 caracteres mínimo, L1518 exige 6. La primera verifica el flag `must_change_password`, la segunda no. Además el listener se registra 2 veces (L817 y L1432).
- **Fix**: Unificar en una sola función con 8 caracteres mínimo. Eliminar registro de listener duplicado.
- **Prioridad**: 🔴 CRÍTICA

### ⬜ C4 · `publish = "."` expone archivos sensibles
- **Archivo**: `netlify.toml` L3
- **Problema**: Publicar la raíz del workspace significa que `schema.sql`, `FIXES.md`, `SPRINTS.md`, `contexto.md`, `package.json` son accesibles por URL directa (e.g. `playofans.com/schema.sql`). Expone estructura de BD, variables de entorno documentadas, y roadmap.
- **Fix**: Mover HTML/CSS/JS/assets a carpeta `public/` y cambiar `publish = "public"`. O añadir headers bloqueando `.sql`, `.md`, `.json`.
- **Prioridad**: 🔴 CRÍTICA

### ⬜ C5 · Superadmin secret en localStorage
- **Archivo**: `superadmin.html` L706, L748
- **Problema**: `localStorage.setItem('sa_verified', saSecret)` almacena el secreto del superadmin en localStorage, persistente e inseguro. Un XSS en cualquier parte del dominio lo expone.
- **Fix**: Usar `sessionStorage` (se borra al cerrar pestaña) o mantener solo en memoria (variable JS).
- **Prioridad**: 🔴 CRÍTICA

### ⬜ C6 · Race condition en rate limiting
- **Archivo**: `validate-code.js` L9-25
- **Problema**: `SELECT count` → `INSERT` no es atómico. Dos requests simultáneos al borde del límite (ej: ambos leen count=9 con límite 10) pueden ambos pasar, excediendo el rate limit.
- **Fix**: Usar una función RPC atómica `check_and_insert_rate_limit(ip, window_seconds, max_attempts)` que haga INSERT + COUNT en una transacción.
- **Prioridad**: 🔴 CRÍTICA

---

## FASE 2 — SEGURIDAD ALTA

### ⬜ S1 · tenant-config.js expone datos sensibles
- **Archivo**: `tenant-config.js` L14-55
- **Problema**: Endpoint público (sin auth) retorna `subscription_expires_at`, `codes_created_this_month`, `codes_limit` al cliente. Cualquier persona puede ver el estado de suscripción y uso de cualquier modelo conociendo su slug.
- **Fix**: Remover estos 3 campos de la respuesta pública. Solo retornarlos en endpoints autenticados (admin).
- **Prioridad**: 🟠 ALTA

### ⬜ S2 · Timing attack en comparación de secreto
- **Archivo**: `_shared.js` L67
- **Problema**: `secret !== process.env.SUPERADMIN_SECRET` usa comparación estándar de strings, vulnerable a timing attacks.
- **Fix**: Usar `crypto.timingSafeEqual(Buffer.from(secret), Buffer.from(process.env.SUPERADMIN_SECRET))`.
- **Prioridad**: 🟠 ALTA

### ⬜ S3 · Falta Content-Security-Policy
- **Archivo**: `netlify.toml` L76-81 (headers)
- **Problema**: Headers de seguridad incluyen `X-Frame-Options`, `X-Content-Type-Options`, etc. pero NO incluyen `Content-Security-Policy`. Sin CSP, scripts inline y recursos externos no están restringidos.
- **Fix**: Añadir CSP header con `script-src 'self' 'unsafe-inline' cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' fonts.googleapis.com;`
- **Prioridad**: 🟠 ALTA

### ⬜ S4 · Falta CAPTCHA/bot protection en registro
- **Archivo**: `registro.html`
- **Problema**: Formulario de registro sin CAPTCHA, honeypot ni rate limiting. Bots pueden spamear registros infinitamente.
- **Fix**: Añadir hCaptcha o al menos un honeypot field invisible + validación server-side.
- **Prioridad**: 🟠 ALTA

### ⬜ S5 · Replace con user input inyectable
- **Archivo**: `validate-code.js` L108
- **Problema**: `.replace(/\{nombre\}/gi, name)` donde `name` es input del usuario. Si `name` contiene `$&` o `$'`, JS `replace()` interpreta patrones especiales de reemplazo.
- **Fix**: Usar callback: `.replace(/\{nombre\}/gi, () => name)` para tratar como literal.
- **Prioridad**: 🟠 ALTA

### ⬜ S6 · Lista de slugs reservados triplicada
- **Archivos**: `registro.html` L278, `sa-create-model.js` L24, `submit-registration.js` L34
- **Problema**: Misma lista hardcodeada en 3 archivos. Si se agrega una ruta nueva, hay que actualizar 3 lugares manualmente. Riesgo de olvido = slug colisiona con ruta.
- **Fix**: Centralizar en `_shared.js` como `RESERVED_SLUGS` y exportar. O mejor: endpoint `/api/check-slug`.
- **Prioridad**: 🟠 ALTA

---

## FASE 3 — BUGS FUNCIONALES

### ⬜ F1 · LiveSpins catch vacío silencia errores
- **Archivo**: `admin.html` L924
- **Problema**: `loadLiveSpins()` tiene `catch(e) {}` — errores de red/API pasan completamente silenciados. Dashboard muestra "Cargando..." indefinidamente si la API falla.
- **Fix**: Añadir `catch(e) { console.error(e); toast('Error cargando spins', 'error'); }`.
- **Prioridad**: 🟡 MEDIA

### ⬜ F2 · QR data inyectada sin validar
- **Archivo**: `admin.html` L1097
- **Problema**: `innerHTML = '<img src="${qrData.qr}">'` — si el endpoint retorna una URL maliciosa en `qr`, se inyecta directo en el DOM sin validar protocolo (podría ser `javascript:` o data URI con HTML).
- **Fix**: Validar que la URL empiece con `https://` o `data:image/` antes de inyectar.
- **Prioridad**: 🟡 MEDIA

### ⬜ F3 · Error con plan null en settings
- **Archivo**: `admin.html` L1507
- **Problema**: `plan.toUpperCase()` puede fallar si `plan` es null/undefined del API. `TypeError: null.toUpperCase()`.
- **Fix**: `(plan || 'unknown').toUpperCase()`.
- **Prioridad**: 🟡 MEDIA

### ⬜ F4 · Premios vacíos/whitespace se pueden guardar
- **Archivo**: `admin.html` L1293
- **Problema**: `doSavePrizes()` verifica `premiosLocales.length < 2` pero no filtra strings vacíos o solo espacios. Un premio `"   "` se guarda válido.
- **Fix**: Filtrar: `premiosLocales.filter(p => p.trim().length > 0)` antes de validar longitud.
- **Prioridad**: 🟡 MEDIA

### ⬜ F5 · confetti() sin fallback si CDN falla
- **Archivo**: `ruleta.html` L1366-1374
- **Problema**: `confetti()` se llama 3 veces sin try-catch. Si la librería confetti.js del CDN no cargó, `ReferenceError: confetti is not defined` rompe todo el flujo post-premio.
- **Fix**: Envolver en `if (typeof confetti === 'function')` o try-catch.
- **Prioridad**: 🟡 MEDIA

### ⬜ F6 · localStorage sin try-catch
- **Archivo**: `ruleta.html` L1318
- **Problema**: `localStorage.setItem(...)` puede lanzar excepción en Safari private mode o quota exceeded. Sin catch, el flujo de validación se interrumpe.
- **Fix**: Envolver en try-catch con fallback silencioso.
- **Prioridad**: 🟡 MEDIA

### ⬜ F7 · Demo mode usa premios reales
- **Archivo**: `ruleta.html` L1651-1659
- **Problema**: Banner dice "premios son ejemplos" pero carga configuración real de la API. Si alguien configura el slug "demo" con premios reales, se regalan.
- **Fix**: Hardcodear premios demo en el frontend cuando `SLUG === 'demo'`.
- **Prioridad**: 🟡 MEDIA

### ⬜ F8 · `iniciarCountdown()` nunca se llama
- **Archivo**: `ruleta.html` L1590-1600
- **Problema**: Función definida pero nunca invocada. El temporizador de expiración no actualiza en tiempo real — el usuario no ve cuánto tiempo le queda.
- **Fix**: Llamar `iniciarCountdown()` después de `validarCodigo()` exitoso, pasando `expiresAt`.
- **Prioridad**: 🟡 MEDIA

### ⬜ F9 · model-landing.html sin timeout de carga
- **Archivo**: `model-landing.html` L293
- **Problema**: Si la API `/api/model-landing` cuelga, el usuario ve "Cargando..." para siempre sin error.
- **Fix**: Añadir `AbortController` con timeout de 10s y mostrar mensaje de error.
- **Prioridad**: 🟡 MEDIA

### ⬜ F10 · CSV export sin validación de respuesta
- **Archivo**: `superadmin.html` L1564
- **Problema**: `exportCSV()` hace fetch y llama `res.blob()` sin verificar `res.ok`. Si el server retorna error, se descarga un blob de error como CSV.
- **Fix**: Añadir `if (!res.ok) { toast('Error al exportar', 'error'); return; }`.
- **Prioridad**: 🟡 MEDIA

---

## FASE 4 — INCONSISTENCIAS Y CÓDIGO MUERTO

### ⬜ I1 · `escapeHtml()` definida pero casi sin usar
- **Archivo**: `ruleta.html` L1276
- **Problema**: Función `escapeHtml()` existe y se usa SOLO para el historial. Todas las otras inyecciones de texto de usuario (`mostrarMensaje`, welcome, error) la ignoran. Inconsistencia de patrón de seguridad.
- **Fix**: Usar `escapeHtml()` en todos los puntos donde se inyecta `nombreUsuario` o datos del API.
- **Prioridad**: 🟡 MEDIA

### ⬜ I2 · Naming inconsistente para grace period
- **Archivos**: `prepare-spin.js` usa `inGrace`, `tenant-config.js` retorna `grace`, `confirm-spin.js` usa `inGrace`
- **Problema**: El mismo concepto tiene 2 nombres diferentes cruzando archivos. Confuso para mantenimiento.
- **Fix**: Estandarizar a `inGrace` en todas las funciones.
- **Prioridad**: 🔵 BAJA

### ⬜ I3 · `robots.txt` bloquea ruta inexistente
- **Archivo**: `robots.txt` L6
- **Problema**: `Disallow: /afiliados` — esta ruta ya no existe (eliminada en auditoría #1).
- **Fix**: Eliminar la línea.
- **Prioridad**: 🔵 BAJA

### ⬜ I4 · Afiliados error silencioso
- **Archivo**: `admin.html` L1500
- **Problema**: `loadAfiliados()` solo hace `console.error()` — usuario no ve ningún feedback si falla.
- **Fix**: Añadir `toast('Error cargando datos de afiliados', 'error')`.
- **Prioridad**: 🔵 BAJA

### ⬜ I5 · Clipboard copy falla silenciosamente
- **Archivo**: `admin.html` L1552
- **Problema**: `.catch(() => {})` — si copiar al portapapeles falla, usuario ve toast "copiado" de todas formas. Feedback falso.
- **Fix**: `.catch(() => { toast('No se pudo copiar', 'error'); })`.
- **Prioridad**: 🔵 BAJA

### ⬜ I6 · Scroll reveal classes sin usar
- **Archivo**: `index.html`
- **Problema**: CSS define `reveal-delay-1`, `reveal-delay-2`, `reveal-delay-3` pero ningún elemento HTML las usa. CSS muerto.
- **Fix**: Eliminar las clases CSS o aplicarlas a elementos de la landing.
- **Prioridad**: 🔵 BAJA

### ⬜ I7 · demos `prepare-spin.js` modo abusable
- **Archivo**: `prepare-spin.js` L28
- **Problema**: Slug `demo` con código `DEMO2025` retorna `remaining_spins: 999` sin límite. Cualquiera puede hacer requests infinitos, potencial DoS.
- **Fix**: Limitar demo a 50 spins por IP por hora, o retornar 5 spins y resetear periódicamente.
- **Prioridad**: 🟡 MEDIA

---

## FASE 5 — SQL Y SCHEMA

### ⬜ DB1 · Índice faltante en `models(active)`
- **Archivo**: `schema.sql` L44
- **Problema**: Queries frecuentes filtran `WHERE active = true` (billing, cron, grace) sin índice.
- **Fix**: `CREATE INDEX idx_models_active ON models(active);`
- **Prioridad**: 🟡 MEDIA

### ⬜ DB2 · Índice faltante en `models(subscription_expires_at)`
- **Archivo**: `schema.sql` L44
- **Problema**: Checks de expiración y grace period consultan esta columna repetidamente.
- **Fix**: `CREATE INDEX idx_models_sub_expires ON models(subscription_expires_at);`
- **Prioridad**: 🟡 MEDIA

### ⬜ DB3 · Índice faltante en `codes(deleted)`
- **Archivo**: `schema.sql` L74
- **Problema**: Todas las queries de códigos filtran `WHERE deleted = false` sin índice.
- **Fix**: `CREATE INDEX idx_codes_deleted ON codes(deleted);`
- **Prioridad**: 🟡 MEDIA

### ⬜ DB4 · Slug inmutabilidad no forzada
- **Archivo**: `schema.sql`
- **Problema**: `slug` es UNIQUE NOT NULL pero puede cambiarse con UPDATE. Contexto.md dice "slug permanente, no se puede cambiar". Sin constraint ni trigger que lo impida.
- **Fix**: Crear trigger `BEFORE UPDATE ON models` que lance excepción si `NEW.slug != OLD.slug`.
- **Prioridad**: 🟡 MEDIA

### ⬜ DB5 · Sin constraint de límite de miembros de agencia
- **Archivo**: `schema.sql` L275
- **Problema**: `agency_members` no tiene CHECK constraint limitando a 8 miembros por agencia. La validación solo está en la función JS.
- **Fix**: Crear trigger `BEFORE INSERT ON agency_members` que cuente existentes y lance error si >= 8.
- **Prioridad**: 🔵 BAJA

### ⬜ DB6 · Sin tabla de auditoría para cambios de modelo
- **Archivo**: `schema.sql`
- **Problema**: No hay tabla que registre quién cambió qué en un modelo (password, plan, premios). Imposible auditar cambios para soporte o compliance.
- **Fix**: Crear tabla `model_audit_log(id, model_id, action, changed_by, old_value, new_value, created_at)`.
- **Prioridad**: 🔵 BAJA

---

## FASE 6 — FEATURES FALTANTES

### ⬜ NF1 · Panel de Agencia inexistente
- **Referencia**: `contexto.md` L35 — "Agency: 349€/mes · hasta 8 modelos · panel unificado"
- **Problema**: La tabla `agency_members` existe y `sa-agency-members.js` permite CRUD desde superadmin. Pero NO existe un panel para que la agencia misma gestione sus modelos. Una agencia debería poder:
  1. Ver dashboard consolidado de todos sus modelos
  2. Añadir/remover modelos de su equipo
  3. Ver analytics combinados (total spins, total códigos)
  4. Gestionar facturación unificada
  5. Cambiar entre modelos sin cerrar sesión
- **Implementación sugerida**: 
  - Crear sección "Equipo" en `admin.html` visible solo si `plan === 'agency'`
  - Endpoint `admin-agency-team.js` para listar/gestionar miembros
  - RLS policies para que agency vea datos de sus miembros
  - Dashboard card con métricas combinadas
- **Prioridad**: 🔴 CRÍTICA (feature vendida pero no entregada)

### ⬜ NF2 · Rasca y Gana
- **Referencia**: `schema.sql` game_catalog seed — `'rasca'` listado
- **Problema**: Solo existe la ruleta. "Rasca" está en el catálogo de juegos pero sin implementación.
- **Scope**: Crear `rasca.html` con mecánica de rascar via canvas + integrar en model-landing.
- **Prioridad**: 🟡 MEDIA (roadmap futuro)

### ⬜ NF3 · OG tags dinámicas para WhatsApp preview
- **Referencia**: `contexto.md` L80
- **Problema**: Las meta tags OG son estáticas. Cuando se comparte un link de modelo por WhatsApp, no muestra nombre ni foto del modelo.
- **Fix**: Crear endpoint SSR (o edge function) que sirva HTML con meta tags dinámicas por slug.
- **Prioridad**: 🟡 MEDIA

### ⬜ NF4 · Grace period no se calcula automáticamente
- **Referencia**: `contexto.md` — "Grace period: 3 días tras expirar"
- **Problema**: `grace_period_until` existe en schema pero NO hay trigger ni cron que lo calcule automáticamente como `subscription_expires_at + 3 days`.
- **Fix**: Trigger `AFTER UPDATE ON models` cuando `subscription_expires_at` cambia → setear `grace_period_until = NEW.subscription_expires_at + interval '3 days'`.
- **Prioridad**: 🟡 MEDIA

### ⬜ NF5 · Música por tema sin especificar
- **Referencia**: `contexto.md` — "música de fondo por tema, mutable por el fan"
- **Problema**: Carpeta `sounds/` existe pero no hay lógica que mapee qué sonido pertenece a qué tema. No hay endpoint para servir sonidos condicionalmente.
- **Fix**: Añadir propiedad `music` al objeto THEMES con path del archivo. Implementar audio player toggle en ruleta.
- **Prioridad**: 🔵 BAJA

---

## FASE 7 — MEJORAS VISUALES Y UX

### ⬜ V1 · Pantalla error/loading no responsive
- **Archivo**: `ruleta.html` L1101-1125
- **Problema**: `.screen-error` y `.screen-loading` usan font-size fijo (4rem, 1.3rem) que no escala en móviles pequeños (360px). Texto se desborda.
- **Fix**: Añadir media queries para reducir font-size en pantallas pequeñas.
- **Prioridad**: 🔵 BAJA

### ⬜ V2 · Historial max-height salta entre breakpoints
- **Archivo**: `ruleta.html` L856/879/901/916
- **Problema**: `max-height` salta entre 380px → 400px → 250px → 200px en distintos breakpoints. Transición visual brusca al redimensionar.
- **Fix**: Usar transición suave o valores más graduales.
- **Prioridad**: 🔵 BAJA

### ⬜ V3 · Partículas no escalan con pantalla
- **Archivo**: `ruleta.html` `crearParticulasFondo()`
- **Problema**: 40 partículas fijas sin importar tamaño de pantalla. En móviles pequeños 40 partículas son excesivas (performance). En monitores 4K son pocas.
- **Fix**: `const count = Math.min(60, Math.max(15, Math.floor(window.innerWidth * window.innerHeight / 30000)));`
- **Prioridad**: 🔵 BAJA

### ⬜ V4 · Admin tablas no responsivas correctamente
- **Archivo**: `admin.html` L542
- **Problema**: `.table` con `min-width: 500px` dentro de `overflow-x: auto` causa scroll horizontal incómodo en móviles. Mejor patrón sería cards para móvil.
- **Fix**: Media query que transforme tabla en cards colapsables en móvil.
- **Prioridad**: 🔵 BAJA

---

## FASE 8 — IDEAS NUEVAS

### 💡 IDEA 1 · Near-miss psychology (Casi-ganas)
- **Qué**: La ruleta se detiene a 1-2 posiciones del premio "grande", creando sensación de casi-ganar que aumenta engagement.
- **Cómo**: En `prepare-spin.js`, si el premio es menor, configurar `wheelIndex` para que visualmente quede cerca del premio grande.
- **Impacto**: +30-40% retención según estudios de gamificación.

### 💡 IDEA 2 · Bonus spin por racha
- **Qué**: Después de 3 spins sin ganar premio grande, otorgar 1 spin bonus gratis.
- **Cómo**: Contador en tabla `codes` de spins sin premio top. Al llegar a 3, `remaining_spins += 1`.
- **Impacto**: Reduce frustración, aumenta engagement.

### 💡 IDEA 3 · Ticker de ganadores en tiempo real
- **Qué**: Banner horizontal inferior mostrando "🎉 María ganó un Video Privado hace 3 min" con scroll automático.
- **Cómo**: Endpoint que lea últimos 10 spins verificados. WebSocket o polling cada 30s.
- **Impacto**: Social proof — otros fans ven que los premios son reales.

### 💡 IDEA 4 · Temporizador de urgencia
- **Qué**: "¡Tu código expira en 2h 34m!" con timer visual decrementando en tiempo real.
- **Cómo**: Ya existe `iniciarCountdown()` (nunca llamada). Activarla y añadir barra de progreso visual.
- **Impacto**: Urgencia psicológica aumenta tasa de uso de códigos.

### 💡 IDEA 5 · Sistema de tiers de premios
- **Qué**: Premios clasificados como Bronce/Plata/Oro/Diamante con diferentes probabilidades y efectos visuales (más confetti, sonido especial para Diamante).
- **Cómo**: Propiedad `tier` en cada premio. Efectos post-spin escalados por tier.
- **Impacto**: Diferenciación de premios y mayor emoción.

### 💡 IDEA 6 · Panel de Agencia completo
- **Qué**: Dashboard unificado para que agencias gestionen sus modelos sin depender del superadmin.
- **Funcionalidades**:
  1. Vista consolidada: spins totales, códigos activos, ingresos del equipo
  2. Añadir/quitar modelos del equipo (máx. 8)
  3. Cambiar entre paneles de modelos individuales con 1 click
  4. Facturación unificada: 1 factura para toda la agencia
  5. Roles: admin de agencia vs modelo miembro (solo lectura)
  6. Templates compartidos entre modelos del equipo
  7. Notificaciones cuando un modelo del equipo necesita atención
- **Implementación**:
  - Sección "Mi Agencia" en admin.html (visible si `plan === 'agency'`)
  - `admin-agency-dashboard.js` — métricas combinadas
  - `admin-agency-team.js` — CRUD miembros
  - RLS policies para cross-model data access
  - UI con selector de modelo en sidebar/header

### 💡 IDEA 7 · Notificaciones push / email
- **Qué**: Notificar modelo cuando un code se usa, cuando faltan pocas tiradas, o cuando su suscripción expira pronto.
- **Cómo**: Web Push API + email via Resend para eventos críticos.
- **Impacto**: Retención de modelos, reduce churn.

### 💡 IDEA 8 · Analytics avanzado
- **Qué**: Dashboard con gráficos: spins por día, hora pico de uso, premios más/menos entregados, códigos más exitosos, tasa de conversión código→spin.
- **Cómo**: RPC que agrupe spins por día/hora. Librería chart.js (lightweight) para visualización.
- **Impacto**: Modelos entienden mejor a su audiencia, optimizan premios.

### 💡 IDEA 9 · Personalización de ruleta por modelo
- **Qué**: Permitir que modelos suban su propia foto/logo para el centro de la ruleta, cambien colores de slices, y personalicen el fondo.
- **Cómo**: Campos `custom_logo_url`, `custom_colors[]` en tabla models. Upload a Supabase Storage.
- **Impacto**: Cada ruleta se siente única, mayor branding para la modelo.

### 💡 IDEA 10 · Multi-idioma
- **Qué**: Soporte para español, inglés, portugués. Cambio automático según navegador o manual.
- **Cómo**: Objeto de traducciones por idioma. Función `t('key')` que retorne el string localizado.
- **Impacto**: Mercado expandido a Latinoamérica angloparlante y Brasil.

### 💡 IDEA 11 · Integración con pasarela de pago
- **Qué**: Cobro automático mensual con Stripe/Mercado Pago en vez de proceso manual.
- **Cómo**: Stripe Checkout para suscripciones. Webhook para activar/desactivar modelo.
- **Impacto**: Automatiza billing, reduce trabajo manual del superadmin, reduce churn por olvido de pago.

### 💡 IDEA 12 · App PWA instalable
- **Qué**: Manifest + service worker para que fans puedan "instalar" la ruleta en su celular.
- **Cómo**: `manifest.json` con iconos, `sw.js` para cache de assets.
- **Impacto**: Acceso directo desde home screen, engagement recurrente.

---

## Resumen General — Auditoría #2

| Fase | Hallazgos | Críticos | Altos | Medios | Bajos |
|------|-----------|----------|-------|--------|-------|
| 1 — Críticos | 6 | 6 | — | — | — |
| 2 — Seguridad | 6 | — | 6 | — | — |
| 3 — Bugs Funcionales | 10 | — | — | 10 | — |
| 4 — Inconsistencias | 7 | — | — | 3 | 4 |
| 5 — SQL/Schema | 6 | — | — | 4 | 2 |
| 6 — Features Faltantes | 5 | 1 | — | 3 | 1 |
| 7 — Visual/UX | 4 | — | — | — | 4 |
| **TOTAL ISSUES** | **44** | **7** | **6** | **20** | **11** |
| 8 — Ideas Nuevas | 12 | — | — | — | — |
