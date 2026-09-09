import React, { useEffect, useRef, useState } from 'react';
import './Bitacora.css';

interface BitacoraProps {
  micMode: string;
  startMicLive: () => void;
  stopMic: () => void;
  camMode: string;
  startCamLive: () => void;
  stopCam: () => void;
  onStart: () => void;
  onClose?: () => void;
}

export function Bitacora({
  micMode, startMicLive, stopMic,
  camMode, startCamLive, stopCam,
  onStart, onClose
}: BitacoraProps) {
  
  const bgRef = useRef<HTMLCanvasElement>(null);
  const speciesCanvasRef = useRef<HTMLCanvasElement>(null);
  const [currentSpecies, setCurrentSpecies] = useState('bacillus');

  const speciesData: Record<string, any> = {
    bacillus: { name: 'BACILLUS', meta: 'PRODUCTOR · TIER 1', h: 140, type: 'rod' },
    coccus: { name: 'COCCUS', meta: 'PRODUCTOR · TIER 1', h: 215, type: 'coccus' },
    spirillum: { name: 'SPIRILLUM', meta: 'CARNÍVORO · TIER 2', h: 2, type: 'spirillum' },
    amoeba: { name: 'AMOEBA', meta: 'OMNÍVORO · TIER 2', h: 35, type: 'amoeba' },
    radiolaria: { name: 'RADIOLARIA', meta: 'ÁPICE · TIER 3', h: 175, type: 'radiolaria' }
  };

  // 1. Background Animation
  useEffect(() => {
    const c = bgRef.current;
    if (!c) return;
    const ctx = c.getContext('2d', { alpha: true });
    if (!ctx) return;
    
    let w = 0, h = 0, dpr = 1, particles: any[] = [], t = 0;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let reqId: number;

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      c!.width = w * dpr;
      c!.height = h * dpr;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = reduce ? 20 : (w < 500 ? 32 : w < 900 ? 48 : 70);
      particles = Array.from({ length: n }, () => ({
        x: Math.random() * w, y: Math.random() * h,
        vx: (Math.random() - .5) * .25, vy: (Math.random() - .5) * .25,
        r: 1 + Math.random() * 2, h: 125 + Math.random() * 90
      }));
    }

    function loop() {
      t += reduce ? .002 : .006;
      ctx!.clearRect(0, 0, w, h);
      particles.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.r * (1 + Math.sin(t * 2 + p.x) * .2), 0, Math.PI * 2);
        ctx!.fillStyle = `hsla(${p.h},90%,65%,.45)`;
        ctx!.fill();
      });
      if (!reduce) {
        for (let i = 0; i < particles.length; i++) {
          for (let j = i + 1; j < particles.length; j++) {
            const a = particles[i], b = particles[j], d = Math.hypot(a.x - b.x, a.y - b.y);
            if (d < 100) {
              ctx!.beginPath(); ctx!.moveTo(a.x, a.y); ctx!.lineTo(b.x, b.y);
              ctx!.strokeStyle = `rgba(70,255,155,${.04 * (1 - d / 100)})`;
              ctx!.stroke();
            }
          }
        }
      }
      reqId = requestAnimationFrame(loop);
    }
    window.addEventListener('resize', resize, { passive: true });
    resize();
    loop();
    
    return () => { 
      window.removeEventListener('resize', resize); 
      cancelAnimationFrame(reqId); 
    }
  }, []);

  // 2. Species Interaction Canvas
  const drawState = useRef({
    current: currentSpecies,
    pulse: 0,
    pointer: { x: .5, y: .5, down: false },
    vx: 0,
    vy: 0,
    t: 0
  });

  useEffect(() => {
    drawState.current.current = currentSpecies;
    drawState.current.pulse = 1;
    drawState.current.vx = 0;
    drawState.current.vy = 0;
  }, [currentSpecies]);

  useEffect(() => {
    const canvas = speciesCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let w = 1, h = 1, dpr = 1;
    let reqId: number;

    function fit() {
      const r = canvas!.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = Math.max(1, r.width);
      h = Math.max(1, r.height);
      canvas!.width = Math.floor(w * dpr);
      canvas!.height = Math.floor(h * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function col(hue: number, a: number) { return `hsla(${hue},90%,65%,${a})`; }
    
    function drawLoop() {
      const ds = drawState.current;
      ds.t += reduce ? .002 : .012;
      ds.pulse *= .93;
      ctx!.clearRect(0, 0, w, h);

      const s = speciesData[ds.current];
      const cx0 = w * .5, cy0 = h * .5;
      let cx = cx0, cy = cy0;

      if (ds.pointer.down) {
        const dx = ds.pointer.x * w - cx0, dy = ds.pointer.y * h - cy0, d = Math.hypot(dx, dy) || 1;
        ds.vx += (dx / d) * .018;
        ds.vy += (dy / d) * .018;
      }
      ds.vx *= .94; ds.vy *= .94;
      cx += ds.vx * 75; cy += ds.vy * 75;
      cx = Math.max(w * .18, Math.min(w * .82, cx));
      cy = Math.max(h * .2, Math.min(h * .8, cy));
      const scale = Math.min(w, h) * .22 * (1 + Math.sin(ds.t * 1.7) * .07 + ds.pulse * .12);

      for (let i = 0; i < 16; i++) {
        const a = i * Math.PI * 2 / 16 + ds.t * .04, r = Math.min(w, h) * (.30 + .025 * Math.sin(ds.t + i));
        ctx!.beginPath(); ctx!.arc(cx0 + Math.cos(a) * r, cy0 + Math.sin(a) * r, 1.1, 0, Math.PI * 2);
        ctx!.fillStyle = col(s.h, .14); ctx!.fill();
      }
      if (ds.pulse > .02) {
        ctx!.beginPath(); ctx!.arc(cx, cy, scale * (1 + (1 - ds.pulse) * 2.5), 0, Math.PI * 2);
        ctx!.strokeStyle = col(s.h, ds.pulse * .28); ctx!.lineWidth = 1.5; ctx!.stroke();
      }

      const t = ds.t;
      if (s.type === 'rod') {
        ctx!.save(); ctx!.translate(cx, cy); ctx!.rotate(Math.sin(t * .7) * .32); ctx!.lineCap = 'round';
        ctx!.lineWidth = Math.max(7, scale * .2); ctx!.strokeStyle = col(s.h, .78); ctx!.shadowBlur = 16; ctx!.shadowColor = col(s.h, .35);
        ctx!.beginPath(); ctx!.moveTo(-scale * .72, Math.sin(t) * scale * .12); ctx!.lineTo(scale * .72, Math.cos(t * .9) * scale * .12); ctx!.stroke();
        ctx!.shadowBlur = 0; ctx!.fillStyle = col(s.h, .9);
        for (let i = -2; i <= 2; i++) { ctx!.beginPath(); ctx!.arc(i * scale * .28, Math.sin(t + i) * scale * .07, scale * .05, 0, Math.PI * 2); ctx!.fill(); }
        ctx!.restore();
      } else if (s.type === 'coccus') {
        for (let i = 0; i < 4; i++) {
          const a = t * .42 + i * Math.PI / 2, x = cx + Math.cos(a) * scale * .55, y = cy + Math.sin(a) * scale * .55;
          ctx!.beginPath(); ctx!.arc(x, y, scale * (.22 + .025 * Math.sin(t + i)), 0, Math.PI * 2);
          ctx!.fillStyle = col(s.h, .68); ctx!.shadowBlur = 15; ctx!.shadowColor = col(s.h, .32); ctx!.fill(); ctx!.shadowBlur = 0;
        }
      } else if (s.type === 'spirillum') {
        ctx!.save(); ctx!.translate(cx, cy); ctx!.rotate(t * .18); ctx!.strokeStyle = col(s.h, .82); ctx!.lineWidth = Math.max(2, scale * .06); ctx!.shadowBlur = 13; ctx!.shadowColor = col(s.h, .32); ctx!.beginPath();
        for (let i = 0; i <= 80; i++) {
          const u = i / 80, x = -scale * .82 + u * scale * 1.64, y = Math.sin(u * Math.PI * 4 + t) * scale * .24;
          i ? ctx!.lineTo(x, y) : ctx!.moveTo(x, y);
        }
        ctx!.stroke(); ctx!.restore();
      } else if (s.type === 'amoeba') {
        ctx!.save(); ctx!.translate(cx, cy); ctx!.beginPath();
        for (let i = 0; i <= 56; i++) {
          const a = i / 56 * Math.PI * 2, r = scale * (.54 + .14 * Math.sin(a * 3 + t * .9) + .08 * Math.sin(a * 5 - t)), x = Math.cos(a) * r, y = Math.sin(a) * r;
          i ? ctx!.lineTo(x, y) : ctx!.moveTo(x, y);
        }
        ctx!.closePath(); ctx!.fillStyle = col(s.h, .2); ctx!.strokeStyle = col(s.h, .85); ctx!.lineWidth = 2; ctx!.shadowBlur = 18; ctx!.shadowColor = col(s.h, .28); ctx!.fill(); ctx!.stroke(); ctx!.shadowBlur = 0;
        for (let i = 0; i < 5; i++) { const a = t * .25 + i * 1.25; ctx!.beginPath(); ctx!.arc(Math.cos(a) * scale * .25, Math.sin(a * 1.4) * scale * .25, scale * .065, 0, Math.PI * 2); ctx!.fillStyle = col(s.h, .8); ctx!.fill(); }
        ctx!.restore();
      } else if (s.type === 'radiolaria') {
        ctx!.save(); ctx!.translate(cx, cy); ctx!.strokeStyle = col(s.h, .62); ctx!.lineWidth = 1;
        for (let i = 0; i < 16; i++) {
          const a = i * Math.PI * 2 / 16 + t * .07, r = scale * (.88 + .12 * Math.sin(t + i));
          ctx!.beginPath(); ctx!.moveTo(0, 0); ctx!.lineTo(Math.cos(a) * r, Math.sin(a) * r); ctx!.stroke();
          ctx!.beginPath(); ctx!.arc(Math.cos(a) * r, Math.sin(a) * r, scale * .04, 0, Math.PI * 2); ctx!.fillStyle = col(s.h, .85); ctx!.fill();
        }
        ctx!.beginPath(); ctx!.arc(0, 0, scale * .31, 0, Math.PI * 2); ctx!.fillStyle = col(s.h, .15); ctx!.strokeStyle = col(s.h, .9); ctx!.lineWidth = 2; ctx!.fill(); ctx!.stroke(); ctx!.restore();
      }

      reqId = requestAnimationFrame(drawLoop);
    }

    function localPoint(e: PointerEvent) {
      const r = canvas!.getBoundingClientRect();
      drawState.current.pointer.x = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      drawState.current.pointer.y = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
    }
    function onPointerDown(e: PointerEvent) {
      canvas!.setPointerCapture?.(e.pointerId);
      localPoint(e);
      drawState.current.pointer.down = true;
      drawState.current.pulse = 1;
      if (navigator.vibrate) navigator.vibrate(12);
    }
    function onPointerMove(e: PointerEvent) {
      if (drawState.current.pointer.down) localPoint(e);
    }
    function onPointerUp() {
      drawState.current.pointer.down = false;
      drawState.current.pointer.x = .5;
      drawState.current.pointer.y = .5;
    }
    function onPointerLeave() {
      if (!drawState.current.pointer.down) onPointerUp();
    }

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('pointerleave', onPointerLeave);
    window.addEventListener('resize', fit, { passive: true });

    fit();
    drawLoop();

    return () => {
      window.removeEventListener('resize', fit);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      cancelAnimationFrame(reqId);
    };
  }, []); // Run once, reads from drawState ref

  return (
    <div className="b-root">
      <canvas id="bio" ref={bgRef} aria-hidden="true"></canvas>

      <nav className="site-nav">
        <div className="logo" style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          {onClose && (
            <button 
              onClick={onClose}
              style={{ background: 'transparent', border: '1px solid var(--line)', color: '#87938b', padding: '6px 12px', fontSize: '9px', cursor: 'pointer', transition: 'all 0.2s', borderRadius: '2px' }}
              onMouseOver={e => { e.currentTarget.style.color = 'var(--green)'; e.currentTarget.style.borderColor = 'var(--green)'; }}
              onMouseOut={e => { e.currentTarget.style.color = '#87938b'; e.currentTarget.style.borderColor = 'var(--line)'; }}
            >
              ← VOLVER
            </button>
          )}
          <span>BIO<span>O</span>RGANISM / BITÁCORA</span>
        </div>
        <div className="nav-links">
          <a href="#origen">ORIGEN</a>
          <a href="#ecosistema">ECOSISTEMA</a>
          <a href="#especies">ESPECIES</a>
          <a href="#genoma">GENOMA</a>
          <a href="#proceso">PROCESO</a>
          <a href="#archivo">ARCHIVO</a>
          <a href="#artista">ARTISTA</a>
        </div>
        <a className="nav-mobile" href="#especies" aria-label="Ir a especies">↘</a>
      </nav>

      <main>
        <section className="hero">
          <div className="hero-inner">
            <div className="eyebrow">NÚCLEO COLECTIVO · ARTE + IA + CÓDIGO + INTERACCIÓN</div>
            <h1>BIO<em>ORGANISM</em></h1>
            <div className="lead">Bitácora de un organismo artificial. Un sistema que observa, responde, muta y construye su propia historia.</div>
            <a className="cta" href="#origen">ENTRAR EN LA BITÁCORA ↓</a>
          </div>
        </section>

        <section id="origen">
          <div className="grid">
            <div><div className="label">01 / ORIGEN</div><div className="title">La pregunta</div></div>
            <div>
              <div className="statement">¿Puede una imagen comportarse como un organismo?</div>
              <p>Bioorganism nace de explorar el límite entre imagen, sistema y comportamiento. La obra no busca representar la vida: construye un pequeño ecosistema artificial donde formas digitales interactúan, consumen energía, se reproducen, compiten y desaparecen.</p>
              <p>La pantalla deja de ser una superficie para convertirse en un medio vivo. El espectador no contempla solamente el organismo: interviene en sus condiciones de existencia.</p>
            </div>
          </div>
        </section>

        <section id="ecosistema">
          <div className="label">02 / ECOSISTEMA</div><div className="title">Cinco especies</div>
          <p>La simulación organiza una población de microorganismos con diferentes comportamientos y relaciones ecológicas.</p>
          <div className="cards">
            <div className="card"><b style={{ color: '#52d88d' }}>BACILLUS</b><small>Productor. Forma filamentosa. Base energética del ecosistema.</small></div>
            <div className="card"><b style={{ color: '#5e8fe8' }}>COCCUS</b><small>Productor. Estructura curva. Genera recursos para la colonia.</small></div>
            <div className="card"><b style={{ color: '#e25757' }}>SPIRILLUM</b><small>Carnívoro. Se alimenta de Bacillus.</small></div>
            <div className="card"><b style={{ color: '#e0a52b' }}>AMOEBA</b><small>Omnívoro. Consume Bacillus y Coccus.</small></div>
            <div className="card"><b style={{ color: '#3ce0c9' }}>RADIOLARIA</b><small>Depredador ápice. Interactúa con organismos de niveles inferiores.</small></div>
          </div>
        </section>

        <section id="especies">
          <div className="label">02.1 / ORGANISMOS VIVOS</div><div className="title">Explora el organismo</div>
          <p>Una versión interactiva del lenguaje visual de la instalación. Selecciona una especie y toca o arrastra dentro del campo. En móvil no necesitas precisión: el área completa responde al gesto.</p>

          <div className="interaction">
            <div className="interaction-head"><span>LABORATORIO DE ESPECIES</span><span className="interaction-help">TOCA = PULSO · ARRASTRA = FUERZA</span></div>
            <div className="species-tabs" role="tablist" aria-label="Especies">
              {Object.keys(speciesData).map(key => (
                <button
                  key={key}
                  className={`species-tab ${currentSpecies === key ? 'active' : ''}`}
                  onClick={() => setCurrentSpecies(key)}
                  role="tab"
                  aria-selected={currentSpecies === key}
                >
                  {speciesData[key].name}
                </button>
              ))}
            </div>
            <div className="species-stage" id="speciesStage">
              <canvas id="speciesCanvas" ref={speciesCanvasRef} aria-label="Organismo interactivo"></canvas>
              <div className="stage-status">● SISTEMA ACTIVO</div>
              <div className="stage-label">
                <div className="stage-name">{speciesData[currentSpecies].name}</div>
                <div className="stage-meta">{speciesData[currentSpecies].meta}</div>
              </div>
            </div>
            <div className="interaction-tip">En teléfono: toca una vez para producir un pulso. Mantén el dedo y arrastra para modificar el movimiento.</div>
          </div>
        </section>

        <section id="genoma">
          <div className="grid">
            <div><div className="label">03 / GENOMA</div><div className="title">Variación</div></div>
            <div>
              <p>Cada organismo nace con una combinación particular de variables. El sistema produce diferencias de color, tamaño, velocidad, brillo y reproducción.</p>
              <div className="genome">
                <div className="bar"><span>HUE SHIFT</span><div className="track"><div className="fill" style={{ width: '68%' }}></div></div><span>±40</span></div>
                <div className="bar"><span>SIZE SCALE</span><div className="track"><div className="fill" style={{ width: '54%' }}></div></div><span>0.7–1.4</span></div>
                <div className="bar"><span>SPEED</span><div className="track"><div className="fill" style={{ width: '73%' }}></div></div><span>0.7–1.5</span></div>
                <div className="bar"><span>GLOW</span><div className="track"><div className="fill" style={{ width: '61%' }}></div></div><span>0.6–1.5</span></div>
                <div className="bar"><span>REPRO RATE</span><div className="track"><div className="fill" style={{ width: '47%' }}></div></div><span>0.6–1.4</span></div>
              </div>
            </div>
          </div>
        </section>

        <section id="proceso">
          <div className="grid">
            <div><div className="label">04 / MUTACIONES</div><div className="title">Proceso</div></div>
            <div className="timeline">
              <div className="event"><div className="date">01 — INVESTIGACIÓN</div><h3>De la forma al comportamiento</h3><p>Exploración de organismos microscópicos, sistemas generativos y relaciones ecológicas.</p></div>
              <div className="event"><div className="date">02 — PROTOTIPO</div><h3>Primeras colonias</h3><p>Las formas empiezan a moverse y relacionarse dentro de un espacio compartido.</p></div>
              <div className="event"><div className="date">03 — INTERACCIÓN</div><h3>El espectador entra al sistema</h3><p>Movimiento y sonido modifican el comportamiento del ecosistema.</p></div>
              <div className="event"><div className="date">04 — MUTAGÉNESIS</div><h3>El código empieza a comportarse</h3><p>Variaciones, eventos y reglas producen estados que no pueden predecirse completamente.</p></div>
              <div className="event"><div className="date">05 — EXPOSICIÓN</div><h3>El organismo sale del laboratorio</h3><p>La obra se encuentra con cuerpos, espacio, ruido y presencia humana.</p></div>
            </div>
          </div>
        </section>

        <section>
          <div className="grid">
            <div><div className="label">05 / EVENTOS</div><div className="title">Alteraciones</div></div>
            <div className="cards" style={{ gridTemplateColumns: 'repeat(2,minmax(0,1fr))' }}>
              <div className="card"><b>FLORACIÓN</b><small>Explosión de alimento. El ecosistema entra en expansión.</small></div>
              <div className="card"><b>PLAGA</b><small>El consumo energético se intensifica.</small></div>
              <div className="card"><b>PULSO EM</b><small>Una onda radial atraviesa el sistema.</small></div>
              <div className="card"><b>FRÍO</b><small>La velocidad de los organismos disminuye.</small></div>
              <div className="card"><b>MUTAGÉNESIS</b><small>Las características genéticas sufren una alteración extrema.</small></div>
            </div>
          </div>
        </section>

        <section id="archivo">
          <div className="label">06 / ARCHIVO</div><div className="title">El cuerpo de la obra</div>
          <div className="archive">
            <div><div className="media"><img src="/img/bioorganism.png" alt="Visualización general de Bioorganism" /></div><div className="caption">BIOORGANISM / registro visual 01</div></div>
            <div><div className="media"><img src="/img/bioorganism2.png" alt="Visualización de Bioorganism" /></div><div className="caption">BIOORGANISM / registro visual 02</div></div>
          </div>
        </section>

        <section id="artista">
          <div className="grid">
            <div><div className="label">07 / ARTISTA</div><div className="title">Manuel Palacio</div></div>
            <div>
              <div className="statement">Arte, imagen, sonido, tecnología e inteligencia artificial como territorios de experimentación.</div>
              <p>Manuel Palacio es artista plástico, diseñador gráfico e ilustrador. Su práctica explora las relaciones entre imagen y sonido mediante técnicas analógicas y digitales, con especial interés en el audiovisual experimental, las instalaciones interactivas, la programación creativa y los nuevos medios.</p>
              <p>Su trabajo se desarrolla en la intersección entre creación artística, tecnología y procesos colaborativos, construyendo experiencias donde la imagen deja de ser estática para convertirse en sistema, espacio y comportamiento.</p>
              <div className="artist-links">
                <a href="https://nucleocolectivo.com/" target="_blank" rel="noopener noreferrer">NÚCLEO COLECTIVO ↗</a>
                <a href="https://nucleocolectivo.github.io/PORTAFOLIO/" target="_blank" rel="noopener noreferrer">PORTAFOLIO ↗</a>
                <a href="https://bioorganism.vercel.app/" target="_blank" rel="noopener noreferrer">INSTALACIÓN BIOORGANISM ↗</a>
              </div>
            </div>
          </div>
        </section>

        <section id="galeria">
          <div className="label">08 / GALERÍA</div><div className="title">Fragmentos del organismo</div>
          <p>Una lectura visual del sistema: colonias, estructuras, detalles y estados del organismo artificial.</p>
          <div className="gallery-grid">
            <figure className="gallery-item"><img src="/img/bioorganism.png" alt="Bioorganism — composición general" /></figure>
            <figure className="gallery-item"><img src="/img/bioorganism2.png" alt="Bioorganism — estado de la simulación" /></figure>
            <figure className="gallery-item"><img src="/img/bioorganism.png" alt="Bioorganism — detalle visual" /></figure>
            <figure className="gallery-item"><img src="/img/bioorganism2.png" alt="Bioorganism — detalle de colonia" /></figure>
          </div>
        </section>

        <section id="convergencias">
          <div className="grid">
            <div><div className="label">09 / CONVERGENCIAS</div><div className="title">El organismo expuesto</div></div>
            <div>
              <div className="statement">La obra no termina cuando se ejecuta el código.</div>
              <p>Cada visitante introduce una condición nueva. Cada sonido, movimiento y gesto altera el sistema. La exposición se convierte así en otra etapa del proceso: una generación más del organismo.</p>
              <p><strong>Bioorganism continúa mutando.</strong></p>
              
              <div style={{ marginTop: '50px', paddingTop: '40px', borderTop: '1px solid var(--line)' }}>
                <p style={{ fontSize: '13px', textAlign: 'center', marginBottom: '30px' }}>CONCEDE ACCESO A TUS SENTIDOS DIGITALES ANTES DE ENTRAR</p>
                
                <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', justifyContent: 'center', marginBottom: '30px' }}>
                  <div style={{ flex: '1 1 200px', textAlign: 'center' }}>
                    <div style={{ fontSize: '9px', letterSpacing: '0.15em', color: 'var(--muted)', marginBottom: '12px' }}>SENTIDO AUDITIVO</div>
                    <button
                      onClick={() => micMode === 'off' ? startMicLive() : stopMic()}
                      className="sensor-btn"
                      style={{
                        background: micMode === "live" ? "#39ff9a" : "rgba(57, 255, 154, 0.05)",
                        border: "1px solid #39ff9a",
                        color: micMode === "live" ? "#000" : "#39ff9a",
                        boxShadow: micMode === "live" ? "0 0 15px rgba(57, 255, 154, 0.4)" : "none"
                      }}
                    >
                      {micMode === "live" ? "MICRÓFONO CONECTADO" : "CONECTAR MICRÓFONO"}
                    </button>
                  </div>
                  
                  <div style={{ flex: '1 1 200px', textAlign: 'center' }}>
                    <div style={{ fontSize: '9px', letterSpacing: '0.15em', color: 'var(--muted)', marginBottom: '12px' }}>SENTIDO VISUAL</div>
                    <button
                      onClick={() => camMode === 'off' ? startCamLive() : stopCam()}
                      className="sensor-btn"
                      style={{
                        background: camMode === "live" ? "#3ce0c9" : "rgba(60, 224, 201, 0.05)",
                        border: "1px solid #3ce0c9",
                        color: camMode === "live" ? "#000" : "#3ce0c9",
                        boxShadow: camMode === "live" ? "0 0 15px rgba(60, 224, 201, 0.4)" : "none"
                      }}
                    >
                      {camMode === "live" ? "CÁMARA CONECTADA" : "CONECTAR CÁMARA"}
                    </button>
                  </div>
                </div>

                <div style={{ textAlign: 'center', marginTop: '40px' }}>
                  <button className="cta" onClick={onStart} style={{ padding: '16px 32px', fontSize: '11px' }}>
                    INICIAR LA EXPERIENCIA COMPLETA ↓
                  </button>
                </div>
              </div>

            </div>
          </div>
        </section>
      </main>

      <footer>BIOORGANISM · NÚCLEO COLECTIVO · MEDELLÍN, COLOMBIA · 2026</footer>
    </div>
  );
}
