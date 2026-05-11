/* ========================================
   DODGE BLITZ - Lógica principal del juego
   Canvas 2D, vanilla JS
   ======================================== */

// ── REGISTRO DEL SERVICE WORKER ──────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// ── REFERENCIAS AL DOM ───────────────────
const canvas       = document.getElementById('canvas');
const ctx          = canvas.getContext('2d');
const pantallaInicio  = document.getElementById('pantalla-inicio');
const pantallaJuego   = document.getElementById('pantalla-juego');
const pantallaPausa   = document.getElementById('pantalla-pausa');
const pantallaGameover= document.getElementById('pantalla-gameover');

const tiempoDisplay = document.getElementById('tiempo-display');
const nivelDisplay  = document.getElementById('nivel-display');
const recordDisplay = document.getElementById('record-display');
const goTiempo      = document.getElementById('go-tiempo');
const goNivel       = document.getElementById('go-nivel');
const goRecord      = document.getElementById('go-record');
const nuevoRecordMsg= document.getElementById('nuevo-record-msg');

// ── ESTADO GLOBAL ────────────────────────
let estado = 'inicio'; // inicio | jugando | pausa | gameover
let animId = null;
let tiempoInicio = 0;
let tiempoAcumulado = 0;   // ms jugados en esta partida
let ultimoFrame = 0;
let nivelActual = 1;
let recordMs = parseInt(localStorage.getItem('dodgeBlitzRecord') || '0');

// ── JUGADOR ──────────────────────────────
const jugador = {
  x: 0, y: 0,
  radio: 14,
  velX: 0, velY: 0,
  speed: 280,       // px/s
  trail: [],        // historial de posiciones para la estela
  invulnerable: false,
  invulnerableTimer: 0,
};

// ── ENEMIGOS ─────────────────────────────
let enemigos = [];
let particulas = [];

// Tipos de enemigo:
// 1 = PERSEGUIDOR  → sigue al jugador lentamente
// 2 = PROYECTIL    → disparo rápido en línea recta
// 3 = ORBITAL      → orbita el centro del canvas

// ── CONTROL TECLADO ──────────────────────
const teclas = {};
document.addEventListener('keydown', e => {
  teclas[e.key] = true;
  if ((e.key === 'Escape' || e.key === 'p' || e.key === 'P') && estado === 'jugando') pausar();
  if ((e.key === 'Escape' || e.key === 'p' || e.key === 'P') && estado === 'pausa') continuar();
});
document.addEventListener('keyup', e => { teclas[e.key] = false; });

// ── CONTROL JOYSTICK VIRTUAL ─────────────
const joystickArea  = document.getElementById('joystick-area');
const joystickBase  = document.getElementById('joystick-base');
const joystickKnob  = document.getElementById('joystick-knob');

const joystick = {
  activo: false,
  centroX: 0, centroY: 0,
  dx: 0, dy: 0,          // dirección normalizada
  radio: 55,             // radio máximo del knob
  touchId: null,
};

// Solo mostrar joystick si es dispositivo táctil
window.addEventListener('touchstart', () => {
  joystickArea.style.display = 'block';
}, { once: true });
joystickArea.style.display = 'none';

joystickBase.addEventListener('touchstart', e => {
  e.preventDefault();
  const toque = e.changedTouches[0];
  joystick.activo   = true;
  joystick.touchId  = toque.identifier;
  const rect = joystickBase.getBoundingClientRect();
  joystick.centroX  = rect.left + rect.width  / 2;
  joystick.centroY  = rect.top  + rect.height / 2;
  moverKnob(toque.clientX, toque.clientY);
}, { passive: false });

document.addEventListener('touchmove', e => {
  if (!joystick.activo) return;
  for (const toque of e.changedTouches) {
    if (toque.identifier === joystick.touchId) {
      e.preventDefault();
      moverKnob(toque.clientX, toque.clientY);
    }
  }
}, { passive: false });

document.addEventListener('touchend', e => {
  for (const toque of e.changedTouches) {
    if (toque.identifier === joystick.touchId) {
      joystick.activo = false;
      joystick.dx = 0; joystick.dy = 0;
      joystickKnob.style.transform = 'translate(-50%, -50%)';
    }
  }
});

function moverKnob(cx, cy) {
  const dx = cx - joystick.centroX;
  const dy = cy - joystick.centroY;
  const dist = Math.hypot(dx, dy);
  const limitado = Math.min(dist, joystick.radio);
  const ang = Math.atan2(dy, dx);
  joystick.dx = Math.cos(ang);
  joystick.dy = Math.sin(ang);
  const ox = Math.cos(ang) * limitado;
  const oy = Math.sin(ang) * limitado;
  joystickKnob.style.transform = `translate(calc(-50% + ${ox}px), calc(-50% + ${oy}px))`;
}

// ── BOTONES UI ───────────────────────────
document.getElementById('btn-jugar').addEventListener('click', iniciarJuego);
document.getElementById('btn-pausa').addEventListener('click', pausar);
document.getElementById('btn-continuar').addEventListener('click', continuar);
document.getElementById('btn-reiniciar').addEventListener('click', iniciarJuego);
document.getElementById('btn-menu-pausa').addEventListener('click', () => irAlMenu());
document.getElementById('btn-menu-go').addEventListener('click', () => irAlMenu());

// ── REDIMENSIONAR CANVAS ─────────────────
function redimensionar() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', redimensionar);
redimensionar();

// ── MOSTRAR / OCULTAR PANTALLAS ──────────
function mostrarPantalla(id) {
  document.querySelectorAll('.pantalla').forEach(p => p.classList.remove('activa'));
  document.getElementById(id).classList.add('activa');
}

// ── FORMATEAR TIEMPO ─────────────────────
function formatMs(ms) {
  const seg = Math.floor(ms / 1000);
  const min = Math.floor(seg / 60);
  const s   = seg % 60;
  return `${String(min).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

// ── INICIO / REINICIO ────────────────────
function iniciarJuego() {
  // Reiniciar estado del juego
  estado = 'jugando';
  tiempoAcumulado = 0;
  tiempoInicio    = performance.now();
  ultimoFrame     = tiempoInicio;
  nivelActual     = 1;
  enemigos        = [];
  particulas      = [];

  // Posición inicial del jugador: centro del canvas
  jugador.x     = canvas.width  / 2;
  jugador.y     = canvas.height / 2;
  jugador.velX  = 0;
  jugador.velY  = 0;
  jugador.trail = [];
  jugador.invulnerable = false;

  nuevoRecordMsg.classList.remove('visible');
  mostrarPantalla('pantalla-juego');

  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

function pausar() {
  if (estado !== 'jugando') return;
  estado = 'pausa';
  tiempoAcumulado += performance.now() - tiempoInicio;
  cancelAnimationFrame(animId);
  mostrarPantalla('pantalla-pausa');
}

function continuar() {
  if (estado !== 'pausa') return;
  estado = 'jugando';
  tiempoInicio = performance.now();
  ultimoFrame  = tiempoInicio;
  mostrarPantalla('pantalla-juego');
  animId = requestAnimationFrame(loop);
}

function irAlMenu() {
  cancelAnimationFrame(animId);
  estado = 'inicio';
  recordDisplay.textContent = formatMs(recordMs);
  mostrarPantalla('pantalla-inicio');
}

function gameOver() {
  estado = 'gameover';
  cancelAnimationFrame(animId);

  const total = tiempoAcumulado;
  goTiempo.textContent = formatMs(total);
  goNivel.textContent  = nivelActual;

  // Verificar récord
  let esRecord = false;
  if (total > recordMs) {
    recordMs = total;
    localStorage.setItem('dodgeBlitzRecord', String(recordMs));
    esRecord = true;
  }
  goRecord.textContent = formatMs(recordMs);
  nuevoRecordMsg.classList.toggle('visible', esRecord);

  // Explotar al jugador
  crearExplosion(jugador.x, jugador.y, 40);

  // Mostrar pantalla de game over tras un breve delay
  setTimeout(() => mostrarPantalla('pantalla-gameover'), 900);
}

// ── GENERACIÓN DE ENEMIGOS ───────────────
let timerEnemigo = 0;

function calcularIntervaloEnemigo() {
  // Cada nivel es 1 segundo más rápido de spawn, mínimo 0.4s
  return Math.max(400, 1500 - (nivelActual - 1) * 100);
}

function spawnEnemigo() {
  const tipo = obtenerTipoAleatorio();
  const e = crearEnemigo(tipo);
  enemigos.push(e);
}

function obtenerTipoAleatorio() {
  // Nivel 1-2: solo perseguidores y proyectiles
  // Nivel 3+: aparecen también orbitales
  const rand = Math.random();
  if (nivelActual < 3) {
    return rand < 0.6 ? 1 : 2;
  }
  if (rand < 0.45) return 1;
  if (rand < 0.80) return 2;
  return 3;
}

function crearEnemigo(tipo) {
  const w = canvas.width;
  const h = canvas.height;
  // Spawn desde los bordes
  const lado = Math.floor(Math.random() * 4);
  let x, y, vx = 0, vy = 0;
  const margen = 20;

  switch (lado) {
    case 0: x = Math.random() * w; y = -margen; break;  // arriba
    case 1: x = w + margen; y = Math.random() * h; break;// derecha
    case 2: x = Math.random() * w; y = h + margen; break; // abajo
    default:x = -margen; y = Math.random() * h; break;   // izquierda
  }

  const velocidadBase = 80 + (nivelActual - 1) * 18;

  if (tipo === 1) {
    // Perseguidor: la velocidad se actualiza cada frame (sigue al jugador)
    return { tipo, x, y, radio: 10, speed: velocidadBase * 0.8, vx: 0, vy: 0, color: '#ff00aa', angulo: 0 };
  }
  if (tipo === 2) {
    // Proyectil: dirección fija hacia el jugador al nacer
    const ang = Math.atan2(jugador.y - y, jugador.x - x);
    const speed = velocidadBase * 2.2;
    return { tipo, x, y, radio: 7, speed, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, color: '#ffea00' };
  }
  // Orbital
  const angOrbita = Math.random() * Math.PI * 2;
  const radioOrbita = Math.min(w, h) * (0.25 + Math.random() * 0.2);
  return {
    tipo, x, y, radio: 12,
    angOrbita, radioOrbita,
    velocidadOrbita: (0.8 + Math.random() * 0.6) * (Math.random() < 0.5 ? 1 : -1),
    color: '#00ff88'
  };
}

// ── PARTÍCULAS ───────────────────────────
function crearExplosion(x, y, cantidad) {
  for (let i = 0; i < cantidad; i++) {
    const ang   = Math.random() * Math.PI * 2;
    const speed = 50 + Math.random() * 300;
    const colores = ['#00f5ff','#ff00aa','#ffea00','#ffffff','#00ff88'];
    particulas.push({
      x, y,
      vx: Math.cos(ang) * speed,
      vy: Math.sin(ang) * speed,
      radio: 2 + Math.random() * 4,
      vida: 1.0,
      decaimiento: 0.6 + Math.random() * 0.8,
      color: colores[Math.floor(Math.random() * colores.length)],
    });
  }
}

// ── LOOP PRINCIPAL ───────────────────────
function loop(timestamp) {
  const dt = Math.min((timestamp - ultimoFrame) / 1000, 0.05); // delta en segundos, máx 50ms
  ultimoFrame = timestamp;

  if (estado !== 'jugando') return;

  tiempoAcumulado = (timestamp - tiempoInicio) + (tiempoAcumulado - (timestamp - tiempoInicio - dt * 1000));
  // Recalcular tiempo total correctamente
  const tiempoTotal = tiempoAcumulado + (timestamp - tiempoInicio);

  // Actualizar HUD cada frame
  const msTotal = Math.floor(timestamp - tiempoInicio) + parseInt(localStorage.getItem('_dbOffset') || 0);

  actualizar(dt, timestamp);
  dibujar();

  animId = requestAnimationFrame(loop);
}

// Ajuste: calcular tiempoJugado de forma simple
let _tiempoOffset = 0;

// Loop corregido (reemplaza el anterior)
cancelAnimationFrame(animId);
function loopCorregido(timestamp) {
  if (estado !== 'jugando') return;
  const dt = Math.min((timestamp - ultimoFrame) / 1000, 0.05);
  ultimoFrame = timestamp;

  actualizar(dt, timestamp);
  dibujar();

  animId = requestAnimationFrame(loopCorregido);
}

// ── ACTUALIZAR ───────────────────────────
function actualizar(dt, timestamp) {
  const w = canvas.width;
  const h = canvas.height;

  // Tiempo total jugado (ms)
  const tiempoJugado = tiempoAcumulado + (timestamp - tiempoInicio);

  // Actualizar HUD
  tiempoDisplay.textContent = formatMs(tiempoJugado);

  // Nivel: sube cada 10 segundos
  const nuevoNivel = Math.floor(tiempoJugado / 10000) + 1;
  if (nuevoNivel !== nivelActual) {
    nivelActual = nuevoNivel;
    nivelDisplay.textContent = nivelActual;
    // Flash visual al subir de nivel
    flash('#ffffff', 0.3);
  }

  // ── Movimiento del jugador ──
  let dx = 0, dy = 0;

  // Teclado
  if (teclas['ArrowLeft'] || teclas['a'] || teclas['A']) dx -= 1;
  if (teclas['ArrowRight']|| teclas['d'] || teclas['D']) dx += 1;
  if (teclas['ArrowUp']   || teclas['w'] || teclas['W']) dy -= 1;
  if (teclas['ArrowDown'] || teclas['s'] || teclas['S']) dy += 1;

  // Joystick
  if (joystick.activo) { dx = joystick.dx; dy = joystick.dy; }

  // Normalizar diagonal
  const mag = Math.hypot(dx, dy);
  if (mag > 0) { dx /= mag; dy /= mag; }

  jugador.x += dx * jugador.speed * dt;
  jugador.y += dy * jugador.speed * dt;

  // Limitar al canvas
  jugador.x = Math.max(jugador.radio, Math.min(w - jugador.radio, jugador.x));
  jugador.y = Math.max(jugador.radio, Math.min(h - jugador.radio, jugador.y));

  // Trail
  jugador.trail.unshift({ x: jugador.x, y: jugador.y });
  if (jugador.trail.length > 22) jugador.trail.pop();

  // Invulnerabilidad
  if (jugador.invulnerable) {
    jugador.invulnerableTimer -= dt;
    if (jugador.invulnerableTimer <= 0) jugador.invulnerable = false;
  }

  // ── Spawn de enemigos ──
  timerEnemigo += dt * 1000;
  if (timerEnemigo >= calcularIntervaloEnemigo()) {
    timerEnemigo = 0;
    spawnEnemigo();
    // A mayor nivel, más de un spawn a la vez
    if (nivelActual >= 4 && Math.random() < 0.4) spawnEnemigo();
    if (nivelActual >= 7 && Math.random() < 0.3) spawnEnemigo();
  }

  // ── Actualizar enemigos ──
  const centroX = w / 2, centroY = h / 2;

  enemigos = enemigos.filter(e => {
    if (e.tipo === 1) {
      // Perseguidor: apunta al jugador
      const ang = Math.atan2(jugador.y - e.y, jugador.x - e.x);
      e.vx = Math.cos(ang) * e.speed;
      e.vy = Math.sin(ang) * e.speed;
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      e.angulo += dt * 3;
    } else if (e.tipo === 2) {
      // Proyectil: dirección fija
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      // Eliminar si sale de la pantalla
      if (e.x < -50 || e.x > w + 50 || e.y < -50 || e.y > h + 50) return false;
    } else if (e.tipo === 3) {
      // Orbital: gira alrededor del centro
      e.angOrbita += e.velocidadOrbita * dt;
      e.x = centroX + Math.cos(e.angOrbita) * e.radioOrbita;
      e.y = centroY + Math.sin(e.angOrbita) * e.radioOrbita;
    }

    // Colisión con jugador
    if (!jugador.invulnerable) {
      const dist = Math.hypot(e.x - jugador.x, e.y - jugador.y);
      if (dist < jugador.radio + e.radio - 4) {
        crearExplosion(jugador.x, jugador.y, 20);
        gameOver();
        return false;
      }
    }
    return true;
  });

  // ── Actualizar partículas ──
  particulas = particulas.filter(p => {
    p.x    += p.vx * dt;
    p.y    += p.vy * dt;
    p.vx   *= 0.92;
    p.vy   *= 0.92;
    p.vida -= p.decaimiento * dt;
    return p.vida > 0;
  });
}

// ── FLASH DE NIVEL ───────────────────────
let flashColor = null, flashAlpha = 0;
function flash(color, alpha) { flashColor = color; flashAlpha = alpha; }

// ── DIBUJAR ──────────────────────────────
function dibujar() {
  const w = canvas.width, h = canvas.height;

  // Fondo con fade (para el trail se vea)
  ctx.fillStyle = 'rgba(10,10,15,0.88)';
  ctx.fillRect(0, 0, w, h);

  // Grid de fondo sutil
  dibujarGrid(w, h);

  // Flash de nivel
  if (flashAlpha > 0) {
    ctx.fillStyle = flashColor;
    ctx.globalAlpha = flashAlpha;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
    flashAlpha -= 0.04;
  }

  // Trail del jugador
  dibujarTrail();

  // Partículas
  particulas.forEach(p => {
    ctx.save();
    ctx.globalAlpha = p.vida;
    ctx.shadowBlur  = 8;
    ctx.shadowColor = p.color;
    ctx.fillStyle   = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radio * p.vida, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });

  // Enemigos
  enemigos.forEach(e => {
    ctx.save();
    ctx.shadowBlur  = 20;
    ctx.shadowColor = e.color;
    ctx.strokeStyle = e.color;
    ctx.fillStyle   = e.color + '33';
    ctx.lineWidth   = 2;

    if (e.tipo === 1) {
      // Perseguidor: triángulo rotatorio
      ctx.translate(e.x, e.y);
      ctx.rotate(e.angulo);
      ctx.beginPath();
      ctx.moveTo(0, -e.radio);
      ctx.lineTo(-e.radio * 0.8, e.radio * 0.8);
      ctx.lineTo(e.radio * 0.8, e.radio * 0.8);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (e.tipo === 2) {
      // Proyectil: rombo/diamante
      const r = e.radio;
      ctx.translate(e.x, e.y);
      const ang = Math.atan2(e.vy, e.vx);
      ctx.rotate(ang);
      ctx.beginPath();
      ctx.moveTo(r * 1.5, 0);
      ctx.lineTo(0, r * 0.7);
      ctx.lineTo(-r * 1.5, 0);
      ctx.lineTo(0, -r * 0.7);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else {
      // Orbital: hexágono
      ctx.translate(e.x, e.y);
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        i === 0
          ? ctx.moveTo(Math.cos(a) * e.radio, Math.sin(a) * e.radio)
          : ctx.lineTo(Math.cos(a) * e.radio, Math.sin(a) * e.radio);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  });

  // Jugador
  dibujarJugador();
}

function dibujarGrid(w, h) {
  const paso = 60;
  ctx.strokeStyle = 'rgba(0,245,255,0.04)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x < w; x += paso) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
  for (let y = 0; y < h; y += paso) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
  ctx.stroke();
}

function dibujarTrail() {
  const trail = jugador.trail;
  if (trail.length < 2) return;
  for (let i = 1; i < trail.length; i++) {
    const alpha = 1 - i / trail.length;
    const radio = jugador.radio * (1 - i / trail.length) * 0.8;
    ctx.save();
    ctx.globalAlpha = alpha * 0.5;
    ctx.shadowBlur  = 10;
    ctx.shadowColor = '#00f5ff';
    ctx.fillStyle   = '#00f5ff';
    ctx.beginPath();
    ctx.arc(trail[i].x, trail[i].y, radio, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function dibujarJugador() {
  const x = jugador.x, y = jugador.y, r = jugador.radio;

  // Parpadeo si es invulnerable
  if (jugador.invulnerable && Math.floor(performance.now() / 100) % 2 === 0) return;

  ctx.save();

  // Núcleo externo (glow grande)
  ctx.shadowBlur  = 30;
  ctx.shadowColor = '#00f5ff';
  ctx.fillStyle   = 'rgba(0,245,255,0.15)';
  ctx.beginPath();
  ctx.arc(x, y, r * 1.8, 0, Math.PI * 2);
  ctx.fill();

  // Cuerpo principal
  ctx.shadowBlur  = 20;
  ctx.shadowColor = '#00f5ff';
  ctx.strokeStyle = '#00f5ff';
  ctx.fillStyle   = '#001a22';
  ctx.lineWidth   = 2.5;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Punto central brillante
  ctx.shadowBlur  = 10;
  ctx.fillStyle   = '#ffffff';
  ctx.beginPath();
  ctx.arc(x, y, r * 0.35, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// ── PARTÍCULAS DE FONDO (INICIO) ─────────
function iniciarParticulasFondo() {
  const contenedor = document.getElementById('particulas-fondo');
  for (let i = 0; i < 25; i++) {
    const p = document.createElement('div');
    p.classList.add('particula');
    const size = 2 + Math.random() * 4;
    const colores = ['#00f5ff','#ff00aa','#ffea00','#00ff88'];
    p.style.cssText = `
      width: ${size}px; height: ${size}px;
      left: ${Math.random() * 100}%;
      background: ${colores[Math.floor(Math.random() * colores.length)]};
      animation-duration: ${5 + Math.random() * 10}s;
      animation-delay: ${-Math.random() * 10}s;
      box-shadow: 0 0 6px currentColor;
    `;
    contenedor.appendChild(p);
  }
}

// ── INICIO DE LA APP ─────────────────────
recordDisplay.textContent = formatMs(recordMs);
iniciarParticulasFondo();

// El loop real que se llama al iniciar juego
function iniciarLoopReal(timestamp) {
  ultimoFrame = timestamp;
  loopCorregido(timestamp);
}

// Sobrescribir iniciarJuego para usar el loop correcto
const _iniciarJuegoOriginal = iniciarJuego;
function iniciarJuego() {
  estado = 'jugando';
  tiempoAcumulado = 0;
  tiempoInicio    = performance.now();
  ultimoFrame     = tiempoInicio;
  nivelActual     = 1;
  nivelDisplay.textContent = '1';
  enemigos        = [];
  particulas      = [];
  timerEnemigo    = 0;

  jugador.x     = canvas.width  / 2;
  jugador.y     = canvas.height / 2;
  jugador.velX  = 0;
  jugador.velY  = 0;
  jugador.trail = [];
  jugador.invulnerable = false;

  nuevoRecordMsg.classList.remove('visible');
  mostrarPantalla('pantalla-juego');

  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(t => {
    ultimoFrame = t;
    tiempoInicio = t;
    animId = requestAnimationFrame(loopCorregido);
  });
}

// Reasignar listeners para usar la versión correcta
document.getElementById('btn-jugar').onclick     = iniciarJuego;
document.getElementById('btn-reiniciar').onclick  = iniciarJuego;

// Función continuar corregida
function continuar() {
  if (estado !== 'pausa') return;
  estado = 'jugando';
  mostrarPantalla('pantalla-juego');
  animId = requestAnimationFrame(t => {
    tiempoInicio = t;
    ultimoFrame  = t;
    animId = requestAnimationFrame(loopCorregido);
  });
}
document.getElementById('btn-continuar').onclick = continuar;
