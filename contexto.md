# PlayOFans.com — Contexto Completo del Proyecto

## REFERENCIA: Proyecto xvickyluna (punto de partida)
C:\Users\franc\OneDrive\Desktop\RULETAS\xvickyluna

El proyecto PlayOFans se basa en una ruleta existente 
que ya funciona en producción. Aquí están los detalles 
técnicos relevantes del proyecto original:

### Arquitectura original (xvickyluna)
- Frontend: index.html (~2022 líneas) con ruleta en Canvas
- Admin: admin.html (~1796 líneas)
- Backend: 10 Netlify Functions en netlify/functions/
- Base de datos: Airtable (se reemplaza por Supabase)
- Sonidos: sounds/click.wav, spin.wav, win.wav
- Node 18, sin frameworks frontend

### Funciones existentes que se reescriben para PlayOFans
- login.js → reemplazado por Supabase Auth
- validate-code.js → se reescribe con Supabase + rate limiting
- get-premios.js → absorbido por tenant-config.js
- gastar-tiro.js → reemplazado por prepare-spin + confirm-spin
- config-manager.js → reemplazado por tenant-config.js
- create-code.js → reemplazado por admin-create-code.js
- delete-code.js → soft delete en admin-delete-code.js
- expire-code.js → absorbido por admin-delete-code.js
- get-all-codes.js → reemplazado por admin-get-codes.js
- reactivate-code.js → reemplazado por admin-reactivate-code.js

### Lo que se mantiene del proyecto original
- Los 3 sonidos: click.wav, spin.wav, win.wav (copiar a PLAYOFANS/sounds/)
- El layout de 3 columnas (controles | ruleta | premios ganados)
- El panel "Mis Premios" a la derecha
- Las animaciones CSS de partículas y fondo animado
- El diseño responsive mobile-first
- La lógica visual de la ruleta (se migra de Canvas a SVG)

### Cambio crítico de seguridad
En xvickyluna el premio se elige con Math.random() en el 
CLIENTE (browser). En PlayOFans el premio se elige SIEMPRE 
en el servidor con este flujo:
1. Cliente llama prepare-spin → servidor elige premio y 
   devuelve { prize, wheelIndex, token }
2. Cliente anima la ruleta hacia wheelIndex
3. Cliente llama confirm-spin con el token
4. Servidor descuenta la tirada y marca spin como verificado

### Tabla Airtable "Códigos" (referencia de estructura)
- ID: código único tipo "LEXI1234"
- Nombre Fan: texto
- Premios: string separado por comas
- Tiradas Totales: número
- Tiradas Restantes: número  
- Usado: boolean

Esta estructura se migra a la tabla "codes" de Supabase 
con JSONB para premios y campos adicionales.

---

## PROYECTO NUEVO: PlayOFans.com

### Qué es
Plataforma multi-tenant SaaS de juegos para modelos de 
OnlyFans. Cada modelo tiene su propio espacio en:
playofans.com/[slug]/ruleta

### Stack
- Frontend: HTML/CSS/JS vanilla (sin frameworks)
- Backend: Netlify Functions (Node.js 18)
- Base de datos: Supabase (PostgreSQL + Auth + RLS)
- Deploy: Netlify
- Dominio: playofans.com
- Email: hola@playofans.com via Resend

### URLs
playofans.com                    → Landing pública
playofans.com/precios            → Planes
playofans.com/demo               → Demo pública
playofans.com/guia               → Onboarding (público)
playofans.com/registro           → Formulario de alta
playofans.com/contacto           → Contacto
playofans.com/superadmin         → Panel Franco (2FA)
playofans.com/[slug]             → Si 1 juego: redirect directo
playofans.com/[slug]/ruleta      → La ruleta
playofans.com/[slug]/ruleta?c=XX → Ruleta con código pre-cargado
playofans.com/[slug]/admin       → Panel admin modelo

### Planes
Solo:   49€/mes · 100 códigos/mes · 5 temas
Pro:    89€/mes · ilimitados · 10 temas
Agency: 349€/mes · hasta 8 modelos · panel unificado

### Reglas de negocio
- Código = 4 letras del slug en mayúsculas + 4 dígitos
  Ejemplo: xvickyluna → VICK8472
- Un código = un fan único
- Límite Solo: 100 códigos creados por mes (resetea día 1)
- Soft delete en códigos (spins históricos se conservan)
- Grace period: 3 días tras expirar antes de bloquear
- Aviso: email 7 días antes + banner en admin
- Sin reembolsos
- Mensaje bienvenida: máximo 80 caracteres
- Mensaje post-premio: máximo 100 caracteres
- Variable {nombre} en mensajes → reemplaza con fan_name
- Máximo 10 premios por ruleta, mínimo 2
- Slug permanente (no se puede cambiar)
- Afiliados: 20% recurrente 12 meses
- Código referido: REF-[SLUG en mayúsculas]
- Solo español en fase 1
- Polling en admin cada 30 segundos para historial en vivo
- Música de fondo por tema, mutable por el fan
- OG tags dinámicas por modelo para WhatsApp preview

### Seguridad
- Premio SIEMPRE elegido en servidor (nunca cliente)
- Rate limiting: 10 intentos/IP/minuto en validate-code
- Superadmin: login + SUPERADMIN_SECRET + 2FA TOTP
- Token de spin guardado en localStorage para recovery
  de conexión perdida

### Temas visuales (10 en total)
Plan Solo (5): dark_luxury · rose_gold · neon_cyber · 
               gold_vip · red_hot
Plan Pro (10): + halloween · navidad · san_valentin · 
                 summer · galaxy

Cada tema define: colores CSS, fuente, emoji central, 
música de fondo.

### Archivos a crear
playofans/
├── index.html              ← Landing pública
├── ruleta.html             ← El juego (multi-tenant)
├── admin.html              ← Panel admin modelo
├── superadmin.html         ← Panel Franco
├── model-landing.html      ← Landing /[slug]
├── demo.html               ← Demo pública
├── registro.html           ← Formulario de alta
├── guia.html               ← Onboarding
├── contacto.html           ← Contacto
├── afiliados.html          ← Panel afiliados
├── robots.txt
├── sitemap.xml
├── netlify.toml
├── package.json
├── sounds/                 ← Copiar de xvickyluna
│   ├── click.wav
│   ├── spin.wav
│   └── win.wav
└── netlify/
    └── functions/
        ├── tenant-config.js
        ├── model-landing.js
        ├── validate-code.js
        ├── prepare-spin.js
        ├── confirm-spin.js
        ├── admin-get-codes.js
        ├── admin-create-code.js
        ├── admin-delete-code.js
        ├── admin-reactivate-code.js
        ├── admin-get-analytics.js
        ├── admin-get-spins-live.js
        ├── admin-update-config.js
        ├── admin-get-qr.js
        ├── send-welcome-email.js
        ├── send-expiry-warning.js
        └── daily-cron.js

### Variables de entorno (ya configuradas en Netlify)
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
SUPERADMIN_SECRET=
RESEND_API_KEY=

### Sprints de desarrollo
Sprint 1-A: schema.sql + netlify.toml + package.json
Sprint 1-B: Netlify Functions core (5 funciones)
Sprint 1-C: ruleta.html (el juego del fan)
Sprint 1-D: admin.html (panel de la modelo)
Sprint 2-A: superadmin.html
Sprint 2-B: index.html (landing pública)
Sprint 2-C: páginas de soporte (registro, guia, contacto, demo)
Sprint 2-D: emails automáticos con Resend
Sprint 2-E: funciones adicionales de admin
---

Añade esta sección al final del archivo CONTEXTO.md:

---

## REGLAS DE TRABAJO — OBLIGATORIAS

### Al terminar cada Sprint o grupo de archivos:
Ejecuta SIEMPRE estos comandos automáticamente sin que 
te lo pida:

git add .
git commit -m "Sprint [X]: descripción breve de lo que se hizo"
git push origin main

### Por qué es importante:
- El repositorio GitHub está conectado a Netlify
- Cada push a main despliega automáticamente en producción
- playofans.com se actualiza solo después del push
- Sin el push, los cambios solo existen en local

### Después de cada push:
Avísame con este mensaje exacto:
"✅ Push completado. Netlify desplegando en 
playofans.com/api/tenant-config?slug=demo 
para verificar que funciona."