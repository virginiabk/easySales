/**
 * server.js — servidor para easySales
 *
 * Guarda las credenciales de Supabase en variables de entorno (.env).
 * El HTML nunca contiene las credenciales: las pide a este servidor
 * presentando un token de sesión que se obtiene al hacer login.
 *
 * Requisitos:
 *   node >= 18  (usa crypto nativo, sin dependencias extra)
 *   npm install express dotenv
 */

require('dotenv').config();
const express  = require('express');
const crypto   = require('crypto');
const path     = require('path');

const app  = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); // carpeta con el HTML

// ── Variables de entorno requeridas ──────────────────────────────────────────
const {
  APP_PASSWORD,   // contraseña de acceso a la app
  SUPABASE_URL,   // https://xxxxxxxxxxx.supabase.co
  SUPABASE_KEY,   // anon/public key
  SESSION_SECRET  // string aleatorio largo para firmar tokens
} = process.env;

if (!APP_PASSWORD || !SUPABASE_URL || !SUPABASE_KEY || !SESSION_SECRET) {
  console.error('Faltan variables de entorno. Revisá el archivo .env');
  process.exit(1);
}

// ── Almacén de sesiones en memoria ───────────────────────────────────────────
// Para un uso personal/pequeño esto es suficiente.
// Si reiniciás el servidor las sesiones se pierden (hay que loguearse de nuevo).
const sessions = new Map(); // token -> { createdAt }
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 horas

function createToken() {
  return crypto.randomBytes(32).toString('hex');
}

function validarToken(token) {
  if (!token) return false;
  const s = sessions.get(token);
  if (!s) return false;
  if (Date.now() - s.createdAt > SESSION_TTL_MS) {
    sessions.delete(token);
    return false;
  }
  return true;
}

function limpiarSesionesViejas() {
  const ahora = Date.now();
  for (const [tok, s] of sessions) {
    if (ahora - s.createdAt > SESSION_TTL_MS) sessions.delete(tok);
  }
}
setInterval(limpiarSesionesViejas, 30 * 60 * 1000);

// ── Middleware de autenticación ───────────────────────────────────────────────
function requireAuth(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token  = header.replace('Bearer ', '').trim();
  if (!validarToken(token)) return res.status(401).json({ error: 'No autorizado' });
  next();
}

// ── Rutas ─────────────────────────────────────────────────────────────────────

// POST /api/auth — login con contraseña
app.post('/api/auth', (req, res) => {
  const { password } = req.body;

  // Comparación segura (evita timing attacks)
  const a = Buffer.from(password     || '', 'utf8');
  const b = Buffer.from(APP_PASSWORD || '', 'utf8');
  const match = a.length === b.length && crypto.timingSafeEqual(a, b);

  if (!match) {
    return res.status(401).json({ error: 'Contraseña incorrecta' });
  }

  const token = createToken();
  sessions.set(token, { createdAt: Date.now() });

  return res.json({
    token,
    sbUrl: SUPABASE_URL,
    sbKey: SUPABASE_KEY,
  });
});

// GET /api/auth/session — validar token y devolver credenciales
app.get('/api/auth/session', requireAuth, (req, res) => {
  res.json({
    sbUrl: SUPABASE_URL,
    sbKey: SUPABASE_KEY,
  });
});

// POST /api/auth/logout — cerrar sesión
app.post('/api/auth/logout', (req, res) => {
  const header = req.headers['authorization'] || '';
  const token  = header.replace('Bearer ', '').trim();
  sessions.delete(token);
  res.json({ ok: true });
});

// ── Proxy a Supabase ──────────────────────────────────────────────────────────
// Las peticiones del cliente van aquí, no directamente a Supabase.
// Esto evita CORS y mantiene la SUPABASE_KEY segura en el servidor.
app.all('/api/supabase/*', requireAuth, async (req, res) => {
  try {
    const path = req.params[0];
    const url = new URL(`${SUPABASE_URL}/rest/v1/${path}`);

    // Copiar query params del cliente
    Object.entries(req.query).forEach(([key, val]) => {
      url.searchParams.append(key, val);
    });

    const response = await fetch(url.toString(), {
      method: req.method,
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': req.headers['prefer'] || ''
      },
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body)
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    console.error('Proxy error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Sirve el HTML para cualquier otra ruta (SPA fallback)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Arranque ──────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
  console.log(`Sesiones duran ${SESSION_TTL_MS / 3600000}h. Reiniciar servidor las invalida.`);
});
