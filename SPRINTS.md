Crea el archivo SPRINTS.md con este contenido:

# PlayOFans — Sprints de Desarrollo

## SPRINT 1-B — Netlify Functions Core
Crear en netlify/functions/:

### tenant-config.js
GET /api/tenant-config?slug=[slug]
- Busca modelo por slug en tabla models
- Si no existe: 404
- Si !active Y fuera de grace_period_until: 403
  con message "Esta ruleta no está disponible 🎰"
- Si en grace_period: incluir grace:true en respuesta
- Determinar juegos activos según plan
- Devolver: slug, display_name, plan, theme,
  welcome_message, post_prize_message,
  sound_enabled_default, force_dark_mode,
  prizes (premios globales), active_games[],
  grace, codes_created_this_month,
  codes_limit (100 si solo, null si pro/agency)

### validate-code.js
POST /api/validate-code
Body: { slug, codigoId, fanName }
- Verificar código existe y pertenece al slug
- Verificar remaining_spins > 0
- Verificar deleted = false
- Verificar expires_at si existe
- Verificar cuenta modelo activa o en grace
- Reemplazar {nombre} en welcome_message con fanName
- Rate limiting: 10 intentos/IP/minuto (429 si supera)
- Devolver: fan_name, prizes (del código o globales),
  remaining_spins, total_spins, expires_at,
  welcome_message (con nombre reemplazado)

### prepare-spin.js
POST /api/prepare-spin
Body: { codigoId, slug }
- Verificar código y remaining_spins > 0
- Verificar si hay token pendiente sin verificar
  para este código → si existe, devolverlo (recovery)
- Elegir premio ALEATORIAMENTE en el servidor
  usando Math.random() en el servidor
- Calcular wheelIndex = índice en array de prizes
- Generar spin_token único (UUID)
- Insertar en tabla spins con verified: false
- Devolver: { prize, wheelIndex, token }

### confirm-spin.js
POST /api/confirm-spin
Body: { token }
- Buscar spin por token
- Verificar que exists y verified = false
- Marcar spin como verified = true
- Decrementar remaining_spins en codes
- Si remaining_spins = 0: marcar used = true
- Devolver: { success: true, remaining_spins }

### model-landing.js
GET /api/model-landing?slug=[slug]
- Buscar modelo por slug
- Si no existe o suspendida: 404
- Contar juegos activos del modelo según plan
- Si 1 solo juego activo: devolver redirect_to
  Ej: { redirect_to: "/xvickyluna/ruleta" }
- Si múltiples: devolver lista de juegos activos

### REGLAS PARA TODAS LAS FUNCIONES
- Usar @supabase/supabase-js con SUPABASE_SERVICE_KEY
- CORS habilitado para playofans.com
- Errores en español con mensajes claros
- try/catch en todas las operaciones de BD
- No console.log en producción

---

## SPRINT 1-C — ruleta.html
Template multi-tenant del juego del fan.
Partir del index.html de xvickyluna como referencia visual.

MANTENER del original:
- Layout 3 columnas (controles | ruleta | premios ganados)
- Panel "Mis Premios" a la derecha
- Animaciones CSS partículas y fondo
- Sonidos: sounds/click.wav, spin.wav, win.wav
- Diseño responsive mobile-first

CAMBIOS PRINCIPALES:
1. Slug desde window.location.pathname (primer segmento)
2. Fetch a /api/tenant-config al cargar
3. Si 403: pantalla "Esta ruleta no está disponible 🎰"
4. Ruleta en SVG (no Canvas) con CSS variables por tema
5. Código pre-cargado desde URL ?c=CODIGO
6. Flujo seguro: prepare-spin → anima → confirm-spin
7. Token guardado en localStorage para recovery
8. Mensajes personalizados de bienvenida y post-premio
9. Variable {nombre} ya viene reemplazada del backend
10. Contador "Te quedan X tiradas" siempre visible
11. Countdown si expires_at < 72h: "⏰ Expira en Xh Ym"
12. Botón mute/unmute música (🔊/🔇) siempre visible
13. Botón compartir resultado tras ganar (Canvas API)
14. OG tags dinámicas: og:title, og:description, og:url
15. Objeto TEXTS con todos los strings de la UI
16. Temas como objeto THEMES con CSS variables,
    emoji central y música por tema

TEMAS (10):
dark_luxury: colores morado/rosa, emoji 💎
rose_gold: rosa/dorado, emoji 🌹
neon_cyber: negro/azul eléctrico, emoji ⚡
gold_vip: negro/dorado, emoji 👑
red_hot: rojo/negro, emoji 🔥
halloween: naranja/negro/morado, emoji 🎃 (solo Pro)
navidad: rojo/verde/dorado, emoji ❄️ (solo Pro)
san_valentin: rojo/rosa, emoji ❤️‍🔥 (solo Pro)
summer: turquesa/naranja, emoji 🌴 (solo Pro)
galaxy: índigo/violeta/cyan, emoji 🌙 (solo Pro)

---

## SPRINT 1-D — admin.html
Panel de administración de la modelo.
URL: playofans.com/[slug]/admin

AUTENTICACIÓN:
- Login email + contraseña via Supabase Auth JS
- Al cargar: verificar sesión activa
- Si no hay sesión: mostrar formulario login
- Recuperación contraseña: Supabase resetPasswordForEmail()

MENÚ LATERAL:
📊 Dashboard
🎰 Ruleta → Códigos
🎰 Ruleta → Configuración
⚙️ Ajustes

DASHBOARD:
- Giros hoy / esta semana
- Códigos activos / agotados / expirados
- Últimos 10 spins (polling cada 30 segundos)
- Banner estado suscripción si grace_period
- Barra progreso códigos si plan Solo (X/100)

SECCIÓN CÓDIGOS:
- Tabla: Código|Fan|Tiradas|Restantes|Expira|Estado|Acciones
- Acciones: Copiar link, Ver QR, Plantillas mensaje,
  Duplicar, Reactivar, Eliminar (soft delete)
- Plantillas WhatsApp/Telegram/OF copiables en 1 clic
  con link playofans.com/[slug]/ruleta?c=CODIGO incluido
- Formulario crear código:
  fan_name, total_spins (1-10), prizes (globales o custom),
  expires_at (opcional)
- Modal post-creación: código + QR + link + plantillas

SECCIÓN CONFIGURACIÓN:
- Premios globales (textarea, 1 por línea, max 10)
- Mensaje bienvenida (max 80 chars, contador live)
- Mensaje post-premio (max 100 chars, contador live)
- Selector tema: grid de cards con preview miniatura
  Temas Pro bloqueados con 🔒 en plan Solo
- Preview en vivo de la ruleta (250px, gira lento)
- Toggle música ON/OFF por defecto

AJUSTES:
- Info cuenta: slug, plan, expiración, códigos del mes
- Código referido REF-[SLUG] con botón copiar
- Link referido: playofans.com/registro?ref=REF-[SLUG]
- Cambiar contraseña

---

## SPRINT 2-A — superadmin.html
URL: playofans.com/superadmin
Solo accesible para Franco.

AUTENTICACIÓN TRIPLE:
1. Email + contraseña (Supabase Auth)
2. Campo extra: SUPERADMIN_SECRET (validado en servidor)
3. 2FA TOTP via Supabase MFA

Si falla cualquier capa: redirect a / sin mensaje de error.

DASHBOARD: MRR estimado, cuentas activas,
giros hoy, giros este mes

TABLA CLIENTES:
Estado🟢🟡🔴⚫ | Slug | Plan | Expira |
Códigos/mes | Spins totales | Acciones
Acciones: Renovar, Cambiar plan, Activar/Desactivar,
Ver panel, Notas (textarea inline auto-guardado)

ALERTAS: vencen en 7 días, en grace period, suspendidas

CREAR CUENTA: formulario completo → crea Supabase Auth
user + fila en models + envía email bienvenida

SOLICITUDES DE REGISTRO: tabla con aprobación/rechazo

DESCUENTOS: CRUD de discount_codes

---

## SPRINT 2-B — index.html (Landing pública)
Marketing de PlayOFans.com

Secciones:
1. Hero: headline + CTA "Quiero empezar" + "Ver demo"
2. Cómo funciona: 3 pasos animados
3. Los juegos: cards (solo ruleta activa + placeholder)
4. Para quién: 3 cards (modelos, agencias, managers)
5. Precios: toggle mensual/anual, 3 planes
6. Testimonios: estructura lista, contenido vacío
7. FAQ: 5 preguntas frecuentes
8. CTA final + Footer

Si URL tiene ?ref=[codigo]: guardar en localStorage

---

## SPRINT 2-C — Páginas de soporte

### registro.html
Formulario de alta con 5 bloques:
1. Identidad: nombre artístico, email, país
2. Negocio: ingresos mensuales (radio), tiene agencia (radio),
   fans activos (radio)
3. Interés: plan deseado, cómo conoció PlayOFans
4. Slug deseado con validación en tiempo real
5. Telegram/Instagram (opcional)
Al enviar: insertar en registration_requests +
email a hola@playofans.com via Resend

### guia.html (pública)
5 secciones: bienvenida, configurar ruleta,
crear código, enviar al fan, FAQ (7 preguntas)

### contacto.html
Formulario nombre+email+mensaje
Al enviar: guardar en Supabase + email a Franco

### demo.html
Ruleta con slug "demo" siempre activo
Código DEMO2025 con tiradas infinitas
Premios genéricos de ejemplo
Banner: "Esta es una demo → Regístrate"

### model-landing.html
Landing /[slug]
Si 1 juego: redirect automático
Si 2+ juegos: grid de cards de juegos
Si 403: "Esta página no está disponible 🎰"

---

## SPRINT 2-D — Emails con Resend
Crear netlify/functions/:

send-welcome-email.js: bienvenida + credenciales
send-expiry-warning.js: aviso 7 días antes

daily-cron.js (scheduled, 9AM diario):
- Enviar aviso 7 días a los que vencen en 7 días
- Enviar aviso día de vencimiento
- Suspender cuentas con grace_period_until <= hoy
- Ejecutar reset_monthly_codes() si necesario

---

## SPRINT 2-E — Funciones admin adicionales
Crear netlify/functions/:

admin-get-codes.js: GET lista códigos del modelo
admin-create-code.js: POST crear código nuevo
  (verificar límite 100/mes si plan Solo)
admin-delete-code.js: DELETE soft delete
admin-reactivate-code.js: POST restaurar tiradas
admin-get-analytics.js: GET métricas del modelo
admin-get-spins-live.js: GET últimos 10 spins
admin-update-config.js: POST actualizar config modelo
admin-get-qr.js: GET generar imagen QR