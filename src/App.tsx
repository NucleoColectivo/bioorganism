import { useEffect, useRef, useState, useCallback } from "react";
import { Maximize, Minimize } from "lucide-react";
import { Bitacora } from './Bitacora';

// ══════════════════════════════════════════════════════════════════
//  SPECIES
// ══════════════════════════════════════════════════════════════════
const SPECIES = [
  { id:"bacillus",  label:"Bacillus",  tier:1, baseHue:145, nc:16, nr:[28,44], fil:"straight", col:"#2d9e64", diet:"producer",  prey:null },
  { id:"coccus",    label:"Coccus",    tier:1, baseHue:215, nc:20, nr:[30,48], fil:"curved",   col:"#4e7fd4", diet:"producer",  prey:null },
  { id:"spirillum", label:"Spirillum", tier:2, baseHue:0,   nc:26, nr:[22,56], fil:"spiral",   col:"#c94040", diet:"carnivore", prey:["bacillus"] },
  { id:"amoeba",    label:"Amoeba",    tier:2, baseHue:38,  nc:14, nr:[26,52], fil:"blob",     col:"#c98a1a", diet:"omnivore",  prey:["bacillus","coccus"] },
  { id:"radiolaria",label:"Radiolaria",tier:3, baseHue:175, nc:30, nr:[20,62], fil:"radial",   col:"#2ec4b6", diet:"apex",      prey:["spirillum","amoeba","coccus"] },
];

const ECO_EVENTS = [
  { id:"bloom",    label:"FLORACIÓN",   desc:"Explosión de comida",  dur:300, col:"#2d9e64" },
  { id:"plague",   label:"PLAGA",       desc:"Drain ×3",             dur:250, col:"#c94040" },
  { id:"pulse",    label:"PULSO EM",    desc:"Onda radial masiva",   dur:80,  col:"#c98a1a" },
  { id:"frost",    label:"FRÍO",        desc:"Velocidad −50%",       dur:400, col:"#4e7fd4" },
  { id:"mutation", label:"MUTAGÉNESIS", desc:"Mutación extrema",     dur:200, col:"#c42ec4" },
];

const FIELD_MODES = ["attract","repel","vortex","explode"];
const FIELD_ICONS = { attract:"▼", repel:"▲", vortex:"↺", explode:"✦" };
const FIELD_COLS  = { attract:"#00ff96", repel:"#ff5050", vortex:"#c98a1a", explode:"#c42ec4" };

// ══════════════════════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════════════════════
let _uid = 0;
const uid   = () => ++_uid;
const rand  = (a, b) => Math.random() * (b - a) + a;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp  = (a, b, t) => a + (b - a) * t;
const d2    = (a, b) => (a.x-b.x)**2+(a.y-b.y)**2;

function mkGenome(p) {
  const m=(v,r,lo,hi)=>clamp(v+rand(-r,r),lo,hi);
  if(!p) return { hueShift:rand(-40,40), sizeScale:rand(.7,1.4), speedScale:rand(.7,1.5),
                  nodeScale:rand(.8,1.3), filAlpha:rand(.08,.22), glow:rand(.6,1.5),
                  reproRate:rand(.6,1.4), drainRate:rand(.7,1.3) };
  return { hueShift:m(p.hueShift,12,-60,60), sizeScale:m(p.sizeScale,.08,.4,2),
           speedScale:m(p.speedScale,.1,.4,2.2), nodeScale:m(p.nodeScale,.08,.5,2),
           filAlpha:m(p.filAlpha,.02,.04,.4), glow:m(p.glow,.1,.2,2.5),
           reproRate:m(p.reproRate,.08,.3,2.5), drainRate:m(p.drainRate,.06,.4,2.2) };
}

function mkOrg(x, y, sp, W, H, cfg, pg) {
  const s  = sp ?? SPECIES[Math.floor(Math.random()*SPECIES.length)];
  const ang= Math.random()*Math.PI*2;
  const g  = mkGenome(pg);
  return {
    id:uid(), x:x??rand(80,W-80), y:y??rand(80,H-80),
    vx:Math.cos(ang)*rand(.2,1.1), vy:Math.sin(ang)*rand(.2,1.1),
    sp:s, size:rand(.55,1.0)*g.sizeScale,
    age:0, lifespan:rand(cfg.lifeMin,cfg.lifeMax),
    energy:rand(55,100), stress:0, rotation:Math.random()*Math.PI*2,
    wanderAng:Math.random()*Math.PI*2, phase:Math.random()*Math.PI*2,
    genome:g, generation:0,
    nodes:Array.from({length:s.nc},(_,i)=>({
      angle:(i/s.nc)*Math.PI*2, baseR:rand(s.nr[0],s.nr[1])*g.nodeScale,
      spd:rand(.004,.013)*(Math.random()<.5?1:-1)*g.speedScale,
      phase:rand(0,Math.PI*2), phaseSpd:rand(.03,.09), hueOff:i*(360/s.nc),
    })),
    label:s.id.substring(0,3).toUpperCase()+"-"+String(uid()).padStart(4,"0"),
    shock:0, lastSound:0, trailTimer:0, dividing:false, divPhase:0, feedTimer:0,
  };
}

function mkFood(W,H){return{id:uid(),x:rand(20,W-20),y:rand(20,H-20),e:rand(12,28),size:rand(2,4),pulse:rand(0,Math.PI*2)};}

const MAX_PH=700;
function emitPh(arr,x,y,type,str,hue){
  if(arr.length>=MAX_PH)arr.splice(0,40);
  arr.push({x,y,type,str,hue,age:0,maxAge:type==="danger"?110:190});
}

function mkParts(x,y,hue,n,spd=3){
  return Array.from({length:n},()=>{const a=Math.random()*Math.PI*2,v=rand(.5,spd);return{x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,hue,alpha:1,size:rand(1,3.5),life:0,maxLife:rand(28,60)};});
}

// ══════════════════════════════════════════════════════════════════
//  DRAW ORGANISM
// ══════════════════════════════════════════════════════════════════
function drawOrg(ctx,o,snd,mot,sel){
  const{x,y,sp,size,rotation,nodes,stress,shock,vx,vy,dividing,divPhase,genome,generation}=o;
  const sc=size*.85, shV=clamp(shock,0,1), eN=clamp(o.energy/100,0,1);
  const life=clamp(1-o.age/o.lifespan,0,1);
  const alpha=Math.min(1,life*4)*(.28+eN*.72);
  const pinch=dividing?Math.sin(divPhase*Math.PI)*14*sc:0;
  const gHue=(sp.baseHue+genome.hueShift+360)%360;
  ctx.save(); ctx.globalAlpha=Math.min(1,alpha+shV*.18);

  const half=(ox,oy)=>{
    ctx.save(); ctx.translate(x+ox,y+oy); ctx.rotate(rotation);
    nodes.forEach(n=>{
      n.angle+=n.spd*(1+mot*.3+snd*.2); n.phase+=n.phaseSpd+mot*.04+snd*.03;
      const baseR=n.baseR*sc, sway=Math.sin(n.phase)*(9+snd*36+mot*26+shV*17)*sc;
      let r=baseR+sway,tx,ty;
      switch(sp.fil){
        case"spiral": r*=1+.3*Math.sin(n.angle*2+n.phase*.5); tx=Math.cos(n.angle)*r;ty=Math.sin(n.angle)*r*.6;break;
        case"blob":   r*=.8+.42*Math.abs(Math.sin(n.phase));  tx=Math.cos(n.angle)*r;ty=Math.sin(n.angle)*r;break;
        case"radial": r*=1+.38*Math.sin(n.angle*3+n.phase);   tx=Math.cos(n.angle)*r;ty=Math.sin(n.angle)*r;break;
        case"curved": tx=Math.cos(n.angle)*r+Math.sin(n.phase*.7)*11*sc;ty=Math.sin(n.angle)*r+Math.cos(n.phase*.7)*11*sc;break;
        default:      tx=Math.cos(n.angle)*r;ty=Math.sin(n.angle)*r*.85;
      }
      const hue=(gHue+n.hueOff+mot*55+snd*25)%360,sat=62+eN*30,lit=40+eN*30;
      ctx.beginPath();ctx.moveTo(0,0);ctx.quadraticCurveTo(vx*2.5,vy*2.5,tx,ty);
      ctx.strokeStyle=`hsla(${hue},${sat}%,${lit}%,${genome.filAlpha+mot*.2+shV*.12})`;
      ctx.lineWidth=Math.max(.5,(1+mot*2+shV*1.8)*sc);ctx.stroke();
      const nSz=(1.5+mot*3.2+shV*2.4+snd*1.6)*sc;
      ctx.beginPath();ctx.arc(tx,ty,nSz,0,Math.PI*2);ctx.fillStyle=`hsl(${hue},100%,85%)`;ctx.fill();
    });
    const cR=(4.5+shV*7+mot*9+snd*5)*sc*genome.glow;
    const grd=ctx.createRadialGradient(0,0,0,0,0,cR*2.8);
    grd.addColorStop(0,`hsla(${gHue},82%,97%,.9)`);
    grd.addColorStop(.4,`hsla(${gHue},90%,58%,${.5+shV*.2})`);
    grd.addColorStop(1,`hsla(${gHue},80%,38%,0)`);
    ctx.shadowBlur=(10+stress*28+mot*18+shV*22)*genome.glow;
    ctx.shadowColor=`hsl(${gHue},100%,62%)`;
    ctx.beginPath();ctx.arc(0,0,cR,0,Math.PI*2);ctx.fillStyle=grd;ctx.fill();
    ctx.shadowBlur=0;
    if(o.feedTimer>0){
      ctx.beginPath();ctx.arc(0,0,cR*2.6,-Math.PI/2,-Math.PI/2+(o.feedTimer/30)*Math.PI*2);
      ctx.strokeStyle=`hsla(${gHue},100%,72%,.7)`;ctx.lineWidth=1.6*sc;ctx.stroke();
    }
    const gd=Math.min(generation,5);
    for(let g=0;g<gd;g++){const ga=(g/Math.max(gd,1))*Math.PI*2;ctx.beginPath();ctx.arc(Math.cos(ga)*cR*1.8,Math.sin(ga)*cR*1.8,.9*sc,0,Math.PI*2);ctx.fillStyle=`hsl(${gHue},80%,90%)`;ctx.fill();}
    ctx.restore();
  };

  if(dividing){const a=Math.atan2(vy,vx);half(Math.cos(a)*pinch,Math.sin(a)*pinch);half(-Math.cos(a)*pinch,-Math.sin(a)*pinch);}
  else half(0,0);

  if(sel){
    ctx.beginPath();ctx.arc(x,y,size*32+14,0,Math.PI*2);
    ctx.strokeStyle="#0f9";ctx.lineWidth=.8;ctx.setLineDash([4,5]);ctx.stroke();ctx.setLineDash([]);
    ctx.font="7px monospace";ctx.fillStyle="#0f9";ctx.textAlign="left";
    ctx.fillText(o.label,x+size*18+6,y-size*14);
  }
  ctx.restore();
}

// ══════════════════════════════════════════════════════════════════
//  AUDIO FM
// ══════════════════════════════════════════════════════════════════
function playFM(actx,freq,dur,intensity,vol){
  if(!actx||vol===0||intensity<.01)return;
  if(actx.state==="suspended")actx.resume().catch(()=>{});
  try{
    const osc=actx.createOscillator(),mod=actx.createOscillator();
    const mg=actx.createGain(),g=actx.createGain();
    osc.type="sine";mod.type="sawtooth";
    mod.frequency.value=freq*.5;mg.gain.value=intensity*80;osc.frequency.value=freq;
    mod.connect(mg);mg.connect(osc.frequency);osc.connect(g);g.connect(actx.destination);
    const t=actx.currentTime;
    g.gain.setValueAtTime(0,t);
    g.gain.linearRampToValueAtTime(clamp(intensity*vol,0,.45),t+.01);
    g.gain.exponentialRampToValueAtTime(.0001,t+dur);
    osc.start(t);mod.start(t);osc.stop(t+dur);mod.stop(t+dur);
  }catch(_){}
}

// ══════════════════════════════════════════════════════════════════
//  CONFIG
// ══════════════════════════════════════════════════════════════════
const mkCfg=()=>({
  maxOrgs:180, speed:100, foodN:40, lifeMin:600, lifeMax:2000,
  mutation:18, cursorForce:100, cursorR:120, sepR:88, cohR:220,
  friction:.94, drain:100, soundForce:100, motForce:100, volume:.3,
  predation:true, pheromones:true, trails:true, soundSpawn:true,
  motionOn:true, showGrid:true, symmetry:false, symmetryAxes:2,
  autoEvent:true, fieldMode:"attract",
});

const HIST=80;

// ══════════════════════════════════════════════════════════════════
//  UI SUBCOMPONENTS — defined OUTSIDE App to preserve identity
//  across renders and prevent constant unmount/remount of inputs
// ══════════════════════════════════════════════════════════════════
function Spark({data,color,maxVal}){
  if(!data?.length)return null;
  const W2=162,H2=26,max=maxVal||Math.max(...data,1);
  const pts=data.map((v,i)=>`${(i/(data.length-1))*W2},${H2-(v/max)*H2}`).join(" ");
  return(
    <svg width={W2} height={H2} style={{display:"block"}}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.2" opacity=".65"/>
      <text x={W2-2} y={H2-3} textAnchor="end" fill={color} fontSize="7" fontFamily="monospace" opacity=".5">{data[data.length-1]}</text>
    </svg>
  );
}

function Sl({label,k,min,max,step=1,unit="",cfg,updCfg}){
  return(
    <div style={{marginBottom:8}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}>
        <span style={{fontSize:"7px",color:"#9dcfb0",letterSpacing:".12em"}}>{label}</span>
        <span style={{fontSize:"8px",color:"#7eff99",fontWeight:"bold"}}>{cfg[k]}{unit}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={cfg[k]}
        onChange={e=>updCfg(k,Number(e.target.value))}
        style={{width:"100%",height:"3px",accentColor:"#2d9e64",cursor:"pointer"}}
      />
    </div>
  );
}

function Tog({label,k,color="#2d9e64",cfg,updCfg}){
  return(
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
      <span style={{fontSize:"7px",color:"#9dcfb0",letterSpacing:".1em"}}>{label}</span>
      <button
        onClick={()=>updCfg(k,!cfg[k])}
        style={{padding:"2px 9px",background:cfg[k]?color+"22":"transparent",border:`1px solid ${cfg[k]?color:"#1a3a28"}`,color:cfg[k]?color:"#6abf8a",fontSize:"7px",cursor:"pointer",fontFamily:"monospace"}}
      >
        {cfg[k]?"ON":"OFF"}
      </button>
    </div>
  );
}

function TabBtn({id,label,tab,setTab}){
  return(
    <button
      onClick={()=>setTab(id)}
      style={{flex:1,padding:"6px 0",background:"transparent",border:"none",borderBottom:`2px solid ${tab===id?"#2d9e64":"transparent"}`,color:tab===id?"#9df":"#4a7a5a",fontSize:"7px",letterSpacing:".12em",cursor:"pointer",fontFamily:"monospace",transition:"all .12s"}}
    >
      {label}
    </button>
  );
}

function Bar({label,value,color}){
  return(
    <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:5}}>
      <span style={{fontSize:"7px",color:"#9dcfb0",width:26,flexShrink:0}}>{label}</span>
      <div style={{flex:1,height:"3px",background:"#0d1a14",borderRadius:2,overflow:"hidden"}}>
        <div style={{width:`${value}%`,height:"100%",background:color,transition:"width .1s"}}/>
      </div>
      <span style={{fontSize:"7px",color,width:24,textAlign:"right"}}>{value}%</span>
    </div>
  );
}

function CoverBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    
    let dpr = 1, w = 0, h = 0, t = 0;
    const pts: any[] = [];
    let reqId: number;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    
    function resize() {
      dpr = Math.min(devicePixelRatio || 1, 2);
      const r = c!.getBoundingClientRect();
      w = r.width;
      h = r.height;
      c!.width = w * dpr;
      c!.height = h * dpr;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      pts.length = 0;
      for (let i = 0; i < 55; i++) {
        pts.push({
          a: Math.random() * Math.PI * 2,
          r: 20 + Math.random() * Math.min(w, h) * 0.35,
          s: 0.003 + Math.random() * 0.01,
          p: Math.random() * 7,
          x: 0,
          y: 0
        });
      }
    }
    
    function draw() {
      t += reduced ? 0.1 : 0.55;
      ctx!.clearRect(0, 0, w, h);
      const cx = w / 2, cy = h / 2;
      ctx!.globalCompositeOperation = 'lighter';
      
      pts.forEach((p, i) => {
        p.a += p.s;
        const pulse = Math.sin(t * 0.018 + p.p) * 0.18 + 0.82;
        const rr = p.r * pulse;
        const x = cx + Math.cos(p.a) * rr;
        const y = cy + Math.sin(p.a * 1.13) * rr * 0.62;
        const hue = (145 + i * 13 + t * 0.05) % 360;
        
        ctx!.beginPath();
        ctx!.moveTo(cx, cy);
        ctx!.quadraticCurveTo(
          (cx + x) / 2 + Math.sin(t * 0.01 + i) * 20,
          (cy + y) / 2 + Math.cos(t * 0.008 + i) * 20,
          x, y
        );
        ctx!.strokeStyle = `hsla(${hue}, 90%, 60%, 0.07)`;
        ctx!.lineWidth = 0.6;
        ctx!.stroke();
        
        ctx!.beginPath();
        ctx!.arc(x, y, 1.5, 0, Math.PI * 2);
        ctx!.fillStyle = `hsla(${hue}, 100%, 78%, 0.7)`;
        ctx!.fill();
      });
      
      ctx!.globalCompositeOperation = 'source-over';
      if (!reduced) reqId = requestAnimationFrame(draw);
    }
    
    window.addEventListener('resize', resize);
    resize();
    draw();
    
    return () => {
      window.removeEventListener('resize', resize);
      if (reqId) cancelAnimationFrame(reqId);
    };
  }, []);
  
  return (
    <canvas 
      ref={canvasRef} 
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 0,
        opacity: 0.78,
        pointerEvents: 'none'
      }}
      aria-hidden="true"
    />
  );
}

// ══════════════════════════════════════════════════════════════════
//  COMPONENT
// ══════════════════════════════════════════════════════════════════
export default function App(){
  // ── Refs (never cause re-render) ────────────────────────────────
  const canvasRef = useRef(null);
  const trailRef  = useRef(null);
  const videoRef  = useRef(null);
  const camCvs    = useRef(null);
  const cfgRef    = useRef(mkCfg());
  const audioRef  = useRef({ctx:null,analyser:null,freq:null,amp:0,bass:0,prevAmp:0});
  const motRef    = useRef({active:false,motion:0,prevFrame:null,grid:Array.from({length:48},()=>({fx:0,fy:0,mag:0}))});
  const mouseRef  = useRef({x:-999,y:-999,prevX:-999,prevY:-999,down:false});
  const viewRef   = useRef({zoom:1,targetZoom:1});
  const fieldsRef = useRef([]);
  const eventRef  = useRef({id:null,age:0,maxAge:0,label:"",col:"#fff",desc:""});
  const animRef   = useRef(null);
  const simRef    = useRef({
    organisms:[],foods:[],pheromones:[],particles:[],
    mode:"attract",frame:0,births:0,deaths:0,selectedId:null,paused:false,
    energyH:Array(HIST).fill(0), popH:Array(HIST).fill(0),
  });
  const triggerEvRef = useRef(null);

  // ── State (only UI display) ─────────────────────────────────────
  // mic: "off" | "live" | "sim"   cam: "off" | "live" | "sim"
  const [micMode,  setMicMode]  = useState("off");
  const [camMode,  setCamMode]  = useState("off");
  const [micErr,   setMicErr]   = useState("");
  const [camErr,   setCamErr]   = useState("");
  // derived booleans kept for any remaining references
  const micOn = micMode !== "off";
  const camOn = camMode !== "off";
  const [stats,    setStats]    = useState({count:0,births:0,deaths:0,tier:[0,0,0],avgGen:0});
  const [selected, setSelected] = useState(null);
  const [elapsed,  setElapsed]  = useState("00:00:00");
  const [sensors,  setSensors]  = useState({mic:0,mot:0});
  const [paused,   setPaused]   = useState(false);
  const [mode,     setMode]     = useState("attract");
  const [panel,    setPanel]    = useState(true);
  const [tab,      setTab]      = useState("controls");
  const [cfg,      setCfgS]     = useState(()=>({...cfgRef.current}));
  const [sparkE,   setSparkE]   = useState([]);
  const [sparkP,   setSparkP]   = useState([]);
  const [curEvent, setCurEvent] = useState(null);
  const [zoomDisp, setZoomDisp] = useState(1);
  const [narrativeSubtitle, setNarrativeSubtitle] = useState("");
  const [started, setStarted] = useState(false);
  const [showBitacora, setShowBitacora] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.warn("Fullscreen request failed:", err);
      });
    } else {
      document.exitFullscreen().catch(err => {
        console.warn("Exit fullscreen failed:", err);
      });
    }
  };

  // ── Poetic Narrative ──────────────────────────────────────────
  useEffect(() => {
    let active = true;
    
    const fallbackPhrases = [
      "Tu presencia despierta algo que permanecía invisible dentro de este organismo.",
      "El organismo percibe tu movimiento y comienza a transformar su propia forma.",
      "Algo se mueve contigo; cada gesto altera el equilibrio de este paisaje vivo.",
      "Tu presencia entra en el sistema y una nueva posibilidad comienza a aparecer.",
      "El organismo respira a través del movimiento, la luz y las señales que recibe.",
      "Cada desplazamiento deja una huella que el organismo transforma en una nueva forma.",
      "Acabas de alterar el equilibrio; observa cómo el organismo encuentra otra manera de existir.",
      "Hay formas que solo aparecen cuando alguien decide acercarse.",
      "El organismo no estaba completo antes de tu llegada; ahora algo nuevo comienza a suceder.",
      "Tu movimiento se convierte en energía y esa energía modifica el paisaje.",
      "Las formas responden lentamente, como si estuvieran descubriendo tu presencia.",
      "Una señal atraviesa el espacio y el organismo comienza a reorganizarse.",
      "Lo que observas está cambiando mientras lo observas; nada permanece exactamente igual.",
      "Tu presencia modifica el ritmo del organismo y abre una nueva posibilidad.",
      "Cada interacción produce una pequeña transformación dentro de este ecosistema.",
      "El organismo escucha el movimiento y responde con una nueva configuración.",
      "Algo invisible conecta tu presencia con las formas que aparecen frente a ti.",
      "El espacio parece quieto, pero debajo de la imagen todo continúa transformándose.",
      "Una nueva relación acaba de surgir entre tu cuerpo y este organismo digital.",
      "El organismo aprende de cada encuentro y nunca responde exactamente de la misma manera.",
      "Acércate; algunas formas necesitan de tu presencia para comenzar a existir.",
      "Tu movimiento despierta una respuesta que se propaga lentamente por todo el sistema.",
      "La imagen cambia porque tú cambias el espacio que habitas.",
      "Cada señal que produces se convierte en una oportunidad para que algo aparezca.",
      "El organismo busca equilibrio mientras tú introduces nuevas formas de movimiento.",
      "Hay una conversación silenciosa ocurriendo entre tu cuerpo y la imagen.",
      "Lo digital comienza a comportarse como algo vivo cuando entra en relación contigo.",
      "Una pequeña alteración puede convertirse en el comienzo de una transformación mayor.",
      "El organismo está explorando el espacio a través de las señales que recibe.",
      "Nada está predeterminado; cada encuentro puede producir una forma diferente.",
      "Tu presencia se mezcla con el sistema y modifica aquello que parecía estable.",
      "Entre la materia y el código aparece un paisaje que todavía está aprendiendo a existir.",
      "El organismo transforma el movimiento en imágenes, y las imágenes vuelven a transformar el espacio.",
      "Observa cómo las formas se encuentran, se separan y vuelven a organizarse.",
      "Cada instante contiene una posibilidad distinta de transformación.",
      "El organismo no representa la vida; intenta imaginar cómo podría sentirse estar vivo.",
      "Aquí la imagen no es solamente una superficie: es un territorio que responde.",
      "Tu cuerpo se convierte por un momento en parte de la arquitectura del organismo.",
      "Una nueva estructura aparece allí donde antes solo había movimiento.",
      "El organismo cambia contigo, pero también conserva rastros de lo que acaba de suceder.",
      "La transformación nunca termina; cada respuesta contiene el comienzo de otra.",
      "Estamos construyendo juntos un paisaje entre lo humano, lo natural y lo digital.",
      "Lo que haces ahora modifica lo que podrás encontrar un instante después.",
      "El organismo recibe tu presencia, la transforma y devuelve algo que no estaba allí antes.",
      "Entre cada movimiento existe un intervalo donde nuevas formas pueden comenzar a surgir.",
      "La frontera entre observador y organismo se vuelve cada vez más difícil de distinguir.",
      "Quizás no estés observando al organismo; quizás el organismo también te está observando.",
      "La tecnología se vuelve sensible cuando aprende a responder al movimiento de un cuerpo.",
      "Somos parte de un sistema en constante transformación, aunque por un instante parezca inmóvil.",
      "Tu presencia ya forma parte de este organismo; lo que suceda después también dependerá de ti."
    ];

    const generateNarrative = () => {
      if (active) {
        const randomIndex = Math.floor(Math.random() * fallbackPhrases.length);
        setNarrativeSubtitle(fallbackPhrases[randomIndex]);
      }
    };
    
    // Start after 5 seconds to let the colony stabilize, then every 18 seconds
    let initialTimer: any;
    let interval: any;
    if (started) {
      initialTimer = setTimeout(() => {
        generateNarrative();
        interval = setInterval(generateNarrative, 18000);
      }, 5000);
    }
    
    return () => {
      active = false;
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [started]);

  const updCfg=useCallback((k,v)=>{cfgRef.current[k]=v;setCfgS(p=>({...p,[k]:v}));},[]);

  // ── Eco-event trigger ───────────────────────────────────────────
  const triggerEvent=useCallback((evId)=>{
    const ev=evId?ECO_EVENTS.find(e=>e.id===evId):ECO_EVENTS[Math.floor(Math.random()*ECO_EVENTS.length)];
    if(!ev)return;
    eventRef.current={id:ev.id,age:0,maxAge:ev.dur,label:ev.label,col:ev.col,desc:ev.desc};
    setCurEvent({id:ev.id,label:ev.label,col:ev.col,desc:ev.desc});
    setTimeout(()=>setCurEvent(null),ev.dur*16+1000);
  },[]);

  useEffect(()=>{triggerEvRef.current=triggerEvent;},[triggerEvent]);

  // ── Init ────────────────────────────────────────────────────────
  useEffect(()=>{
    const canvas=canvasRef.current;
    const dpr=window.devicePixelRatio||1;
    const resize=()=>{
      canvas.width=canvas.offsetWidth*dpr;canvas.height=canvas.offsetHeight*dpr;
      canvas.getContext("2d").scale(dpr,dpr);
      const tc=trailRef.current;if(tc){tc.width=canvas.offsetWidth;tc.height=canvas.offsetHeight;}
    };
    resize();window.addEventListener("resize",resize);
    const W=canvas.offsetWidth,H=canvas.offsetHeight,c=cfgRef.current,s=simRef.current;
    for(let i=0;i<44;i++)s.organisms.push(mkOrg(null,null,SPECIES[i%SPECIES.length],W,H,c,null));
    for(let i=0;i<c.foodN;i++)s.foods.push(mkFood(W,H));
    const t0=Date.now();
    const clk=setInterval(()=>{
      const e=Date.now()-t0;
      setElapsed([Math.floor(e/3600000),Math.floor((e%3600000)/60000),Math.floor((e%60000)/1000)].map(n=>String(n).padStart(2,"0")).join(":"));
    },1000);
    return()=>{window.removeEventListener("resize",resize);clearInterval(clk);};
  },[]);

  // ── MIC — live (getUserMedia) o simulado (oscilador) ────────────
  const stopMic=useCallback(()=>{
    const a=audioRef.current;
    a.ctx?.close();
    Object.assign(a,{ctx:null,analyser:null,freq:null,amp:0,bass:0,prevAmp:0,simOsc:null});
    setMicMode("off");setMicErr("");
  },[]);

  const startMicLive=useCallback(async()=>{
    stopMic();
    const a=audioRef.current;
    if(!navigator?.mediaDevices?.getUserMedia){
      setMicErr("getUserMedia no disponible en este contexto.");return;
    }
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:true,video:false});
      const ctx=new(window.AudioContext||(window as any).webkitAudioContext)();
      if(ctx.state==="suspended")await ctx.resume();
      const src=ctx.createMediaStreamSource(stream),an=ctx.createAnalyser();
      an.fftSize=256;src.connect(an);
      Object.assign(a,{ctx,analyser:an,freq:new Uint8Array(an.frequencyBinCount)});
      setMicMode("live");setMicErr("");
    }catch(e){
      const msg=e.name==="NotAllowedError"
        ?"Permiso denegado — usa el modo SIMULADO"
        :"Error: "+e.message;
      setMicErr(msg);
    }
  },[stopMic]);

  const startMicSim=useCallback(()=>{
    stopMic();
    // Build an AudioContext with a modulated oscillator as fake mic signal
    try{
      const ctx=new(window.AudioContext||(window as any).webkitAudioContext)();
      const osc=ctx.createOscillator();
      const lfo=ctx.createOscillator();
      const lfoGain=ctx.createGain();
      const an=ctx.createAnalyser();
      an.fftSize=256;
      osc.type="sawtooth"; osc.frequency.value=180;
      lfo.type="sine";     lfo.frequency.value=0.8;
      lfoGain.gain.value=140;
      lfo.connect(lfoGain); lfoGain.connect(osc.frequency);
      osc.connect(an);
      // Don't connect to destination — analysis only, no sound output
      osc.start(); lfo.start();
      const a=audioRef.current;
      Object.assign(a,{ctx,analyser:an,freq:new Uint8Array(an.frequencyBinCount),simOsc:osc});
      setMicMode("sim");setMicErr("");
    }catch(e){setMicErr("Error simulación: "+e.message);}
  },[stopMic]);

  // ── CAM — live (getUserMedia) o simulada (mouse motion) ─────────
  const stopCam=useCallback(()=>{
    const m=motRef.current;
    const v=videoRef.current;
    if(v?.srcObject)v.srcObject.getTracks().forEach(t=>t.stop());
    if(v)v.srcObject=null;
    m.active=false;m.motion=0;m.prevFrame=null;
    m.grid.forEach(c=>{c.fx=0;c.fy=0;c.mag=0;});
    setCamMode("off");setCamErr("");
  },[]);

  const startCamLive=useCallback(async()=>{
    stopCam();
    if(!navigator?.mediaDevices?.getUserMedia){
      setCamErr("getUserMedia no disponible — usa SIMULADO (mouse).");return;
    }
    try{
      const stream=await navigator.mediaDevices.getUserMedia(
        {video:{facingMode:"user",width:{ideal:160},height:{ideal:120}},audio:false});
      const v=videoRef.current;v.srcObject=stream;v.muted=true;v.playsInline=true;
      await v.play().catch(()=>{});
      motRef.current.active=true;
      setCamMode("live");setCamErr("");
    }catch(e){
      const msg=e.name==="NotAllowedError"?"Permiso denegado — usa SIMULADO (mouse)"
               :e.name==="NotFoundError"?"No se encontró cámara"
               :"Error: "+e.message;
      setCamErr(msg);
    }
  },[stopCam]);

  const startCamSim=useCallback(()=>{
    stopCam();
    // Camera sim = mouse movement already feeds motRef via updateMouseMot
    // Just enable the motion grid display
    motRef.current.active=false; // don't use webcam, use mouse path
    setCamMode("sim");setCamErr("");
  },[stopCam]);

  // ── MAIN LOOP ────────────────────────────────────────────────────
  useEffect(()=>{
    const canvas=canvasRef.current;
    const ctx=canvas.getContext("2d");
    const tc=document.createElement("canvas");
    tc.width=canvas.offsetWidth;tc.height=canvas.offsetHeight;
    trailRef.current=tc;const tctx=tc.getContext("2d");

    let nextEvent=1800+Math.floor(Math.random()*1200);
    let lastStatFrame=0;

    const tick=()=>{
      const a=audioRef.current;
      if(a.analyser&&a.freq){
        a.analyser.getByteFrequencyData(a.freq);
        const len=a.freq.length;let sum=0;for(let i=0;i<len;i++)sum+=a.freq[i];
        a.prevAmp=a.amp;a.amp=lerp(a.amp,sum/len/255,.3);
        let bass=0;const bb=Math.floor(len*.08);for(let i=0;i<bb;i++)bass+=a.freq[i];
        a.bass=bass/bb/255;
      }else{a.amp=lerp(a.amp,0,.1);a.bass=0;}

      const mm=motRef.current,vid=videoRef.current,cc=camCvs.current;
      if(mm.active&&vid&&vid.readyState>=2&&cc){
        const COLS=8,ROWS=6;cc.width=COLS*20;cc.height=ROWS*20;
        const cctx=cc.getContext("2d",{willReadFrequently:true});
        cctx.save();cctx.scale(-1,1);cctx.drawImage(vid,-cc.width,0,cc.width,cc.height);cctx.restore();
        const frame=cctx.getImageData(0,0,cc.width,cc.height).data;
        if(mm.prevFrame&&mm.prevFrame.length===frame.length){
          const cW=Math.floor(cc.width/COLS),cH=Math.floor(cc.height/ROWS);let tot=0;
          for(let row=0;row<ROWS;row++)for(let col=0;col<COLS;col++){
            let diff=0,fx=0,fy=0,n=0;
            for(let py=row*cH;py<(row+1)*cH;py++)for(let px=col*cW;px<(col+1)*cW;px++){
              const idx=(py*cc.width+px)*4;
              const dr=frame[idx]-mm.prevFrame[idx],dg=frame[idx+1]-mm.prevFrame[idx+1],db=frame[idx+2]-mm.prevFrame[idx+2];
              const dd=Math.sqrt(dr*dr+dg*dg+db*db);if(dd>12){diff+=dd;fx+=dr;fy+=dg;}n++;
            }
            const mag=clamp(diff/n/255*4*(cfgRef.current.motForce/100),0,1);
            const gi=row*COLS+col;mm.grid[gi]={fx:n>0?fx/n/128:0,fy:n>0?fy/n/128:0,mag};tot+=mag;
          }
          mm.motion=clamp(tot/(COLS*ROWS)*8,0,1);
        }
        mm.prevFrame=new Uint8ClampedArray(frame);
      }else{mm.motion=lerp(mm.motion,0,.07);}
      mm.grid.forEach(g=>{g.fx=lerp(g.fx,0,.09);g.fy=lerp(g.fy,0,.09);g.mag=lerp(g.mag,0,.07);});

      const s=simRef.current,c=cfgRef.current;
      const W=canvas.offsetWidth,H=canvas.offsetHeight;
      const amp=a.amp,bass=a.bass,mot=mm.motion;
      const sF=c.soundForce/100,mF=c.motForce/100;
      const now=Date.now();
      const ev=eventRef.current;
      const vw=viewRef.current;

      if(s.paused){
        ctx.fillStyle="rgba(0,0,0,.55)";ctx.fillRect(0,0,W,H);
        ctx.font="bold 13px monospace";ctx.fillStyle="#556";ctx.textAlign="center";
        ctx.fillText("PAUSADO",W/2,H/2);ctx.fillText("▶ click para continuar",W/2,H/2+18);
        animRef.current=requestAnimationFrame(tick);return;
      }
      s.frame++;

      if(c.autoEvent&&!ev.id){nextEvent--;if(nextEvent<=0){nextEvent=1800+Math.floor(Math.random()*1200);triggerEvRef.current?.(null);}}
      if(ev.id){ev.age++;if(ev.age>=ev.maxAge)ev.id=null;}

      const evDrain=ev.id==="plague"?3:ev.id==="frost"?.5:1;
      const evSpeed=ev.id==="frost"?.45:1;
      const evMut  =ev.id==="mutation"?6:1;
      const isTransient=amp>.55&&amp>a.prevAmp*1.5&&c.soundSpawn;

      const prevZ=vw.zoom;
      vw.zoom=lerp(vw.zoom,vw.targetZoom,.08);
      if(Math.abs(vw.zoom-prevZ)>.005){const zd=Math.round(vw.zoom*100)/100;setZoomDisp(zd);}

      ctx.fillStyle="#060810";ctx.fillRect(0,0,W,H);

      if(c.showGrid){
        const G=42;ctx.lineWidth=.35;ctx.strokeStyle="rgba(40,80,60,0.11)";
        for(let gx=0;gx<=W;gx+=G){ctx.beginPath();ctx.moveTo(gx,0);ctx.lineTo(gx,H);ctx.stroke();}
        for(let gy=0;gy<=H;gy+=G){ctx.beginPath();ctx.moveTo(0,gy);ctx.lineTo(W,gy);ctx.stroke();}
        ctx.lineWidth=.6;ctx.strokeStyle="rgba(40,80,60,0.18)";
        for(let gx=0;gx<=W;gx+=G*4){ctx.beginPath();ctx.moveTo(gx,0);ctx.lineTo(gx,H);ctx.stroke();}
        for(let gy=0;gy<=H;gy+=G*4){ctx.beginPath();ctx.moveTo(0,gy);ctx.lineTo(W,gy);ctx.stroke();}
      }

      if(ev.id){
        const t=1-ev.age/ev.maxAge;
        const eg=ctx.createRadialGradient(W/2,H/2,0,W/2,H/2,Math.max(W,H)*.7);
        eg.addColorStop(0,"transparent");
        eg.addColorStop(1,ev.col+Math.round(t*40).toString(16).padStart(2,"0"));
        ctx.fillStyle=eg;ctx.fillRect(0,0,W,H);
        ctx.save();ctx.font=`bold ${12+t*5}px monospace`;ctx.fillStyle=ev.col+Math.round(t*160).toString(16).padStart(2,"0");
        ctx.textAlign="center";ctx.fillText(ev.label,W/2,40);
        ctx.font="9px monospace";ctx.fillStyle=ev.col+Math.round(t*90).toString(16).padStart(2,"0");
        ctx.fillText(ev.desc,W/2,54);ctx.restore();
      }

      if(amp>.04){const g=ctx.createRadialGradient(W/2,H/2,0,W/2,H/2,Math.max(W,H)*.6);g.addColorStop(0,`hsla(${130+bass*80},45%,28%,${amp*.1*sF})`);g.addColorStop(1,"transparent");ctx.fillStyle=g;ctx.fillRect(0,0,W,H);}
      if(mot>.4){ctx.strokeStyle=`rgba(0,255,150,${mot*.1})`;ctx.lineWidth=3;ctx.strokeRect(8,8,W-16,H-16);}

      ctx.save();
      ctx.translate(W/2,H/2);ctx.scale(vw.zoom,vw.zoom);ctx.translate(-W/2,-H/2);

      if(c.trails){
        tctx.fillStyle="rgba(0,0,0,0.04)";tctx.fillRect(0,0,W,H);
        s.organisms.forEach(o=>{
          if(o.energy<14)return;
          const hue=(o.sp.baseHue+o.genome.hueShift+360)%360;
          const al=clamp((o.energy/100)*.17+o.shock*.1,0,.24);
          tctx.beginPath();tctx.arc(o.x,o.y,o.size*3.2+amp*5,0,Math.PI*2);
          tctx.fillStyle=`hsla(${hue},80%,55%,${al})`;tctx.fill();
        });
        ctx.globalAlpha=.68;ctx.drawImage(tc,0,0,W,H);ctx.globalAlpha=1;
      }

      fieldsRef.current=fieldsRef.current.filter(f=>{
        f.age++;if(f.age>f.maxAge)return false;
        const ft=1-f.age/f.maxAge,fc=FIELD_COLS[f.type]||"#fff";
        ctx.save();
        const fg=ctx.createRadialGradient(f.x,f.y,0,f.x,f.y,f.radius);
        fg.addColorStop(0,fc+Math.round(ft*44).toString(16).padStart(2,"0"));
        fg.addColorStop(1,"transparent");
        ctx.fillStyle=fg;ctx.beginPath();ctx.arc(f.x,f.y,f.radius,0,Math.PI*2);ctx.fill();
        ctx.beginPath();ctx.arc(f.x,f.y,f.radius,0,Math.PI*2);
        ctx.strokeStyle=fc+Math.round(ft*70).toString(16).padStart(2,"0");
        ctx.lineWidth=1;ctx.setLineDash([4,6]);ctx.stroke();ctx.setLineDash([]);
        ctx.font="9px monospace";ctx.fillStyle=fc+Math.round(ft*160).toString(16).padStart(2,"0");
        ctx.textAlign="center";ctx.fillText(FIELD_ICONS[f.type]||"",f.x,f.y-f.radius-5);
        ctx.restore();return true;
      });

      if(c.pheromones){
        s.pheromones=s.pheromones.filter(p=>{
          p.age++;const al=clamp((1-p.age/p.maxAge)*.36,0,.36);if(al<.01)return false;
          ctx.beginPath();ctx.arc(p.x,p.y,3+p.str*2,0,Math.PI*2);
          ctx.fillStyle=p.type==="danger"?`hsla(0,80%,60%,${al})`:p.type==="food"?`hsla(120,70%,50%,${al})`:`hsla(${p.hue},68%,54%,${al})`;
          ctx.fill();return true;
        });
      }

      if((mm.active||c.motionOn)&&mot>.03){
        const COLS=8,ROWS=6,cW=W/COLS,cH=H/ROWS;
        mm.grid.forEach((cell,idx)=>{
          if(cell.mag<.04)return;
          const col=idx%COLS,row=Math.floor(idx/COLS);
          ctx.fillStyle=`rgba(0,180,130,${cell.mag*.07})`;ctx.fillRect(col*cW,row*cH,cW,cH);
          if(cell.mag>.15){const cx=(col+.5)*cW,cy=(row+.5)*cH;ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+cell.fx*22,cy+cell.fy*22);ctx.strokeStyle=`rgba(0,220,160,${cell.mag*.45})`;ctx.lineWidth=.9;ctx.stroke();}
        });
      }

      if(ev.id==="bloom"&&s.frame%6===0)for(let i=0;i<3;i++)s.foods.push(mkFood(W,H));
      while(s.foods.length<c.foodN)s.foods.push(mkFood(W,H));
      while(s.foods.length>c.foodN+10)s.foods.pop();
      s.foods.forEach(f=>{
        f.pulse+=.04;ctx.save();ctx.globalAlpha=.6;
        const fR=f.size*(1+.22*Math.sin(f.pulse));
        const fg=ctx.createRadialGradient(f.x,f.y,0,f.x,f.y,fR*3);
        fg.addColorStop(0,"rgba(60,180,80,.6)");fg.addColorStop(1,"transparent");
        ctx.fillStyle=fg;ctx.beginPath();ctx.arc(f.x,f.y,fR*3,0,Math.PI*2);ctx.fill();
        ctx.beginPath();ctx.arc(f.x,f.y,fR,0,Math.PI*2);ctx.fillStyle="#1e4a28";ctx.strokeStyle="#3db060";ctx.lineWidth=.7;ctx.fill();ctx.stroke();ctx.restore();
      });

      if(isTransient&&s.organisms.length<c.maxOrgs&&s.frame%10===0){
        const sp=SPECIES[Math.floor(Math.random()*SPECIES.length)];
        for(let i=0;i<3;i++){s.organisms.push(mkOrg(rand(W*.1,W*.9),rand(H*.1,H*.9),sp,W,H,c,null));s.births++;}
      }

      if(ev.id==="pulse"&&ev.age===1){
        s.organisms.forEach(o=>{const an=Math.atan2(o.y-H/2,o.x-W/2);o.vx+=Math.cos(an)*8;o.vy+=Math.sin(an)*8;o.shock=1;});
        s.particles.push(...mkParts(W/2,H/2,180,30,12));
        playFM(a.ctx,60,.8,.5,c.volume);
      }

      const dead=new Set(),born=[];
      let totE=0,totG=0;
      const baseSpd=1.6*(c.speed/100)*evSpeed;

      s.organisms.forEach((o,i)=>{
        o.age++;o.phase+=.04+amp*.08;o.shock=lerp(o.shock,0,.1);
        if(o.feedTimer>0)o.feedTimer--;
        const g=o.genome;
        const tb=o.sp.tier===3?.017:o.sp.tier===2?.021:.025;
        o.energy-=tb*(c.drain/100)*evDrain*(1+amp*.35)*g.drainRate;
        if(amp>.07){o.energy=Math.min(100,o.energy+amp*1.5*sF);o.shock=Math.min(1,o.shock+amp*.55*sF);}
        if(o.age>=o.lifespan||o.energy<=0){
          dead.add(i);s.deaths++;
          s.particles.push(...mkParts(o.x,o.y,o.sp.baseHue,8,2.5));
          if(c.pheromones)emitPh(s.pheromones,o.x,o.y,"danger",.8,o.sp.baseHue);return;
        }
        totE+=o.energy;totG+=o.generation;

        let fx=0,fy=0,sepX=0,sepY=0,cohX=0,cohY=0,cohN=0,hFx=0,hFy=0;

        if(c.pheromones&&s.frame%4===0)s.pheromones.forEach(p=>{
          const dd=d2(o,p);if(dd>120**2)return;
          const dv=Math.sqrt(dd),str=(1-dv/120)*p.str;
          if(p.type==="food"){fx+=(p.x-o.x)/dv*str*.06;fy+=(p.y-o.y)/dv*str*.06;}
          if(p.type==="danger"){fx-=(p.x-o.x)/dv*str*.08;fy-=(p.y-o.y)/dv*str*.08;o.shock=Math.min(1,o.shock+str*.18);}
        });

        fieldsRef.current.forEach(f=>{
          const dd=d2(o,f);if(dd>f.radius**2||dd<1)return;
          const dv=Math.sqrt(dd),str=(1-dv/f.radius)*f.strength;
          if(f.type==="attract"){fx+=(f.x-o.x)/dv*str;fy+=(f.y-o.y)/dv*str;}
          else if(f.type==="repel"){fx-=(f.x-o.x)/dv*str;fy-=(f.y-o.y)/dv*str;}
          else if(f.type==="vortex"){const px=-(f.y-o.y),py=f.x-o.x,pd=Math.sqrt(px*px+py*py)||1;fx+=px/pd*str;fy+=py/pd*str;}
          else if(f.type==="explode"){const pa=Math.atan2(o.y-f.y,o.x-f.x);fx+=Math.cos(pa)*str*2;fy+=Math.sin(pa)*str*2;o.shock=Math.min(1,o.shock+str*.5);}
        });

        s.organisms.forEach((b,j)=>{
          if(i===j)return;
          const dd=d2(o,b);
          const sr=(c.sepR*(o.size+b.size)*.5)**2;
          if(dd<sr&&dd>0){const dv=Math.sqrt(dd);sepX+=(o.x-b.x)/dv;sepY+=(o.y-b.y)/dv;o.stress+=.027;}
          const coR=o.sp.id===b.sp.id?c.cohR*1.3:c.cohR;
          if(dd<coR**2){cohX+=b.x;cohY+=b.y;cohN++;}
          if(c.predation&&o.sp.prey?.includes(b.sp.id)&&o.energy<88){
            const hR=160*o.size;if(dd<hR**2){
              const dv=Math.sqrt(dd)+.1,str=clamp(1-dv/hR,.05,1)*1.2;
              hFx+=(b.x-o.x)/dv*str;hFy+=(b.y-o.y)/dv*str;
              if(dd<(o.size*18)**2){
                const gain=Math.min(b.energy,30);o.energy=Math.min(100,o.energy+gain);b.energy-=gain;o.feedTimer=30;
                if(b.energy<5){dead.add(j);s.deaths++;s.particles.push(...mkParts(b.x,b.y,b.sp.baseHue,12,3));if(c.pheromones)emitPh(s.pheromones,b.x,b.y,"danger",1,b.sp.baseHue);playFM(a.ctx,200+o.sp.baseHue,.3,.3,c.volume);}
              }
            }
          }
          if(c.predation&&b.sp.prey?.includes(o.sp.id)&&dd<(180*b.size)**2){
            const dv=Math.sqrt(dd)+.1;fx-=(b.x-o.x)/dv*1.8;fy-=(b.y-o.y)/dv*1.8;o.shock=Math.min(1,o.shock+.28);
            if(c.pheromones&&s.frame%20===0)emitPh(s.pheromones,o.x,o.y,"danger",.6,o.sp.baseHue);
          }
          if(dd<(50*(o.size+b.size)*.5)**2&&now-o.lastSound>500){playFM(a.ctx,80+o.sp.baseHue*.5,.32,.08,c.volume);o.lastSound=now;}
        });

        fx+=sepX*.055;fy+=sepY*.055;
        if(cohN>0){fx+=(cohX/cohN-o.x)*.00038;fy+=(cohY/cohN-o.y)*.00038;}
        fx+=hFx*.7;fy+=hFy*.7;
        o.wanderAng+=(Math.random()-.5)*.28;fx+=Math.cos(o.wanderAng)*.07;fy+=Math.sin(o.wanderAng)*.07;

        let nearD=200**2,nearF=null,nearFI=-1;
        s.foods.forEach((f,fi)=>{const dd=d2(o,f);if(dd<nearD){nearD=dd;nearF=f;nearFI=fi;}});
        if(nearF){const dv=Math.sqrt(nearD);fx+=(nearF.x-o.x)/dv*.11;fy+=(nearF.y-o.y)/dv*.11;
          if(nearD<(o.size*12+4)**2){o.energy=Math.min(100,o.energy+nearF.e);s.foods.splice(nearFI,1);if(c.pheromones)emitPh(s.pheromones,o.x,o.y,"food",.5,o.sp.baseHue);}
        }

        const{x:cx,y:cy}=mouseRef.current,cdx=cx-o.x,cdy=cy-o.y,cdd=cdx*cdx+cdy*cdy;
        if(cdd<c.cursorR**2&&cdd>200&&s.mode!=="kill"&&!mouseRef.current.down){
          const cd=Math.sqrt(cdd),str=(1-cd/c.cursorR)*.04*(c.cursorForce/100),dir=s.mode==="repel"?-1:1;
          fx+=cdx/cd*str*dir;fy+=cdy/cd*str*dir;
        }
        if(isTransient&&amp>.3){const an=Math.random()*Math.PI*2;fx+=Math.cos(an)*amp*1.8*sF;fy+=Math.sin(an)*amp*1.8*sF;}
        if(bass>.12){fx+=(W/2-o.x)*.0003*bass*sF;fy+=(H/2-o.y)*.0003*bass*sF;}
        if((mm.active||c.motionOn)&&mot>.02){
          const col=clamp(Math.floor(o.x/W*8),0,7),row=clamp(Math.floor(o.y/H*6),0,5);
          const cell=mm.grid[row*8+col];
          if(cell.mag>.04){fx+=cell.fx*cell.mag*mF*2.2;fy+=cell.fy*cell.mag*mF*2.2;o.shock=Math.min(1,o.shock+cell.mag*.44);
            if(mot>.55&&now-o.lastSound>280){playFM(a.ctx,300+mot*430,.17,mot*.16,c.volume);o.lastSound=now;}
          }
        }
        o.trailTimer++;if(o.trailTimer>=8&&c.pheromones){o.trailTimer=0;emitPh(s.pheromones,o.x,o.y,"attract",.22,o.sp.baseHue);}
        o.stress*=.9;

        o.vx+=fx;o.vy+=fy;
        const maxSpd=baseSpd*(1+amp*(3-1)*sF)*(1+mot*1.3*mF)*g.speedScale;
        const spd=Math.sqrt(o.vx**2+o.vy**2);
        if(spd>maxSpd){o.vx=o.vx/spd*maxSpd;o.vy=o.vy/spd*maxSpd;}
        if(spd<.08&&spd>0){o.vx=o.vx/spd*.08;o.vy=o.vy/spd*.08;}
        o.vx*=c.friction;o.vy*=c.friction;
        const pad=75;
        if(o.x<pad)o.vx+=1.3;if(o.x>W-pad)o.vx-=1.3;
        if(o.y<pad)o.vy+=1.3;if(o.y>H-pad)o.vy-=1.3;
        o.x+=o.vx;o.y+=o.vy;
        const rt=Math.atan2(o.vy,o.vx);o.rotation+=lerp(0,rt-o.rotation,.14);

        if(c.symmetry){
          const axes=c.symmetryAxes||2;
          const mirrors=[[W-o.x,o.y],[o.x,H-o.y],[W-o.x,H-o.y]].slice(0,axes-1);
          mirrors.forEach(([mx,my])=>{
            const mo={...o,x:mx,y:my,vx:-o.vx,vy:o.vy};
            ctx.save();ctx.globalAlpha=(ctx.globalAlpha||1)*.35;drawOrg(ctx,mo,amp*sF,mot*mF,false);ctx.restore();
          });
        }

        const rC=.00030*(1+amp*5+mot*2.4)*(c.mutation/18)*evMut*g.reproRate;
        if(o.energy>68&&s.organisms.length+born.length<c.maxOrgs&&Math.random()<rC){o.dividing=true;o.divPhase=0;}
        if(o.dividing){
          o.divPhase+=.055;
          if(o.divPhase>=1){
            o.dividing=false;o.divPhase=0;o.energy-=27;
            const cSp=Math.random()<c.mutation/100?SPECIES[Math.floor(Math.random()*SPECIES.length)]:o.sp;
            const child=mkOrg(o.x+rand(-18,18),o.y+rand(-18,18),cSp,W,H,c,o.genome);
            child.generation=o.generation+1;born.push(child);s.births++;
            s.particles.push(...mkParts(o.x,o.y,o.sp.baseHue,6,1.5));
            playFM(a.ctx,280+o.sp.baseHue*.35,.22,.1,c.volume);
          }
        }

        drawOrg(ctx,o,amp*sF,mot*mF,s.selectedId===o.id);
      });

      s.organisms=s.organisms.filter((_,i)=>!dead.has(i));
      born.forEach(b=>s.organisms.push(b));

      s.particles=s.particles.filter(p=>{
        p.life++;p.x+=p.vx;p.y+=p.vy;p.vx*=.9;p.vy*=.9;p.alpha=1-p.life/p.maxLife;
        if(p.alpha<.02)return false;
        ctx.beginPath();ctx.arc(p.x,p.y,p.size,0,Math.PI*2);ctx.fillStyle=`hsla(${p.hue},80%,72%,${p.alpha})`;ctx.fill();return true;
      });

      ctx.restore();

      if(a.analyser&&a.freq){
        const bw=W/a.freq.length;
        for(let i=0;i<a.freq.length;i++){const bh=a.freq[i]/255*26;ctx.fillStyle=`hsla(${135+i*.7},65%,48%,.34)`;ctx.fillRect(i*bw,H-bh,bw*.88,bh);}
      }

      const{x:cx2,y:cy2,down:dn}=mouseRef.current;
      if(cx2>0){
        const mc={attract:"#00ff96",repel:"#ff5050",kill:"#6070ff"}[s.mode];
        if(!dn){
          ctx.save();
          const rg=ctx.createRadialGradient(cx2,cy2,0,cx2,cy2,c.cursorR);rg.addColorStop(0,mc+"18");rg.addColorStop(1,"transparent");
          ctx.fillStyle=rg;ctx.beginPath();ctx.arc(cx2,cy2,c.cursorR,0,Math.PI*2);ctx.fill();
          ctx.beginPath();ctx.arc(cx2,cy2,c.cursorR,0,Math.PI*2);ctx.strokeStyle=mc+"28";ctx.lineWidth=.8;ctx.setLineDash([5,8]);ctx.stroke();ctx.setLineDash([]);
          [[-1,0],[1,0],[0,-1],[0,1]].forEach(([dx,dy])=>{ctx.beginPath();ctx.moveTo(cx2+dx*14,cy2+dy*14);ctx.lineTo(cx2+dx*c.cursorR,cy2+dy*c.cursorR);ctx.strokeStyle=mc+"36";ctx.lineWidth=.6;ctx.stroke();});
          ctx.beginPath();ctx.arc(cx2,cy2,3,0,Math.PI*2);ctx.fillStyle=mc+"cc";ctx.fill();
          ctx.restore();
        }else{
          const fc=FIELD_COLS[c.fieldMode]||"#fff";
          ctx.save();ctx.beginPath();ctx.arc(cx2,cy2,6,0,Math.PI*2);ctx.fillStyle=fc+"aa";ctx.fill();ctx.restore();
        }
      }

      {
        const MW=90,MH=54,MX=W-MW-10,MY=10;
        ctx.save();ctx.globalAlpha=.65;
        ctx.fillStyle="#050810";ctx.strokeStyle="#0d2018";ctx.lineWidth=.5;
        ctx.beginPath();ctx.rect(MX,MY,MW,MH);ctx.fill();ctx.stroke();
        s.organisms.forEach(o=>{
          const mx=MX+(o.x/W)*MW,my=MY+(o.y/H)*MH;
          ctx.beginPath();ctx.arc(mx,my,1.1,0,Math.PI*2);
          ctx.fillStyle=`hsl(${(o.sp.baseHue+o.genome.hueShift+360)%360},80%,65%)`;ctx.fill();
        });
        ctx.restore();
      }

      ctx.save();ctx.font="8px monospace";ctx.textAlign="left";
      const tC=[1,2,3].map(t=>s.organisms.filter(o=>o.sp.tier===t).length);
      ctx.fillStyle="rgba(0,255,130,0.25)";
      ctx.fillText(`T1:${tC[0]}  T2:${tC[1]}  T3:${tC[2]}   SND:${Math.round(amp*100)}%  MOT:${Math.round(mot*100)}%  ×${Math.round(vw.zoom*100)/100}`,12,H-10);
      ctx.restore();

      if(s.frame-lastStatFrame>=30){
        lastStatFrame=s.frame;
        const tC2=[1,2,3].map(t=>s.organisms.filter(o=>o.sp.tier===t).length);
        const avgGen=s.organisms.length?Math.round(totG/s.organisms.length*10)/10:0;
        setStats({count:s.organisms.length,births:s.births,deaths:s.deaths,tier:tC2,avgGen});
        setSensors({mic:Math.round(a.amp*100),mot:Math.round(mm.motion*100)});
        const avgE=s.organisms.length?Math.round(totE/s.organisms.length):0;
        s.energyH.push(avgE);if(s.energyH.length>HIST)s.energyH.shift();
        s.popH.push(s.organisms.length);if(s.popH.length>HIST)s.popH.shift();
        setSparkE([...s.energyH]);setSparkP([...s.popH]);
        if(s.selectedId!=null){
          const live=s.organisms.find(o=>o.id===s.selectedId);
          if(live)setSelected({label:live.label,spName:live.sp.label,tier:live.sp.tier,diet:live.sp.diet,energy:Math.round(live.energy),age:Math.round(live.age),stress:Math.round(live.stress*100),gen:live.generation,hueShift:Math.round(live.genome.hueShift),sizeScale:Math.round(live.genome.sizeScale*100),speedScale:Math.round(live.genome.speedScale*100),glow:Math.round(live.genome.glow*100)});
          else{s.selectedId=null;setSelected(null);}
        }
      }
      animRef.current=requestAnimationFrame(tick);
    };
    animRef.current=requestAnimationFrame(tick);
    return()=>cancelAnimationFrame(animRef.current);
  },[]);// eslint-disable-line

  // ── Mouse motion ─────────────────────────────────────────────────
  const updateMouseMot=useCallback((mx,my)=>{
    const m=motRef.current,c=cfgRef.current;
    if(!c.motionOn||m.active)return;
    const W=canvasRef.current?.offsetWidth||800,H=canvasRef.current?.offsetHeight||600;
    if(mouseRef.current.prevX<0){mouseRef.current.prevX=mx;mouseRef.current.prevY=my;return;}
    const dx=mx-mouseRef.current.prevX,dy=my-mouseRef.current.prevY;
    mouseRef.current.prevX=mx;mouseRef.current.prevY=my;
    const spd=Math.sqrt(dx*dx+dy*dy);
    m.motion=lerp(m.motion,clamp(spd/25,0,1)*(c.motForce/100),.4);
    const COLS=8,ROWS=6,cW=W/COLS,cH=H/ROWS;
    const col=clamp(Math.floor(mx/cW),0,COLS-1),row=clamp(Math.floor(my/cH),0,ROWS-1);
    for(let r=0;r<ROWS;r++)for(let c2=0;c2<COLS;c2++){
      const inf=clamp(1-Math.sqrt((r-row)**2+(c2-col)**2)/2.5,0,1),gi=r*COLS+c2;
      motRef.current.grid[gi].fx=lerp(motRef.current.grid[gi].fx,(dx/25)*inf,.5);
      motRef.current.grid[gi].fy=lerp(motRef.current.grid[gi].fy,(dy/25)*inf,.5);
      motRef.current.grid[gi].mag=lerp(motRef.current.grid[gi].mag,m.motion*inf,.4);
    }
  },[]);

  // ── Pointer handlers ──────────────────────────────────────────────
  const getXY=useCallback(e=>{const r=canvasRef.current.getBoundingClientRect(),src=e.touches?e.touches[0]:e;return{x:src.clientX-r.left,y:src.clientY-r.top};},[]);

  const handleMove=useCallback(e=>{
    const{x,y}=getXY(e);
    mouseRef.current.x=x;mouseRef.current.y=y;
    updateMouseMot(x,y);
    if(mouseRef.current.down){
      const c=cfgRef.current;
      if(fieldsRef.current.length<14)
        fieldsRef.current.push({x,y,type:c.fieldMode,strength:.75,radius:c.cursorR*1.2,age:0,maxAge:400});
    }
  },[getXY,updateMouseMot]);

  const handleDown=useCallback(()=>{mouseRef.current.down=true;},[]);
  const handleUp=useCallback(()=>{mouseRef.current.down=false;},[]);

  const handleClick=useCallback(e=>{
    e.preventDefault();
    if(mouseRef.current.down)return;
    const{x,y}=getXY(e),s=simRef.current,c=cfgRef.current;
    const W=canvasRef.current.offsetWidth,H=canvasRef.current.offsetHeight;
    if(s.mode==="kill"){const b=s.organisms.length;s.organisms=s.organisms.filter(o=>d2(o,{x,y})>(c.cursorR*.5)**2);s.deaths+=b-s.organisms.length;}
    else if(s.organisms.length<c.maxOrgs){
      const sp=SPECIES[Math.floor(Math.random()*SPECIES.length)];
      for(let i=0;i<6;i++)if(s.organisms.length<c.maxOrgs)s.organisms.push(mkOrg(x+rand(-22,22),y+rand(-22,22),sp,W,H,c,null));
      s.births+=6;
    }
    const hit=[...s.organisms].reverse().find(o=>d2(o,{x,y})<(o.size*28)**2);
    s.selectedId=hit?.id??null;
    if(hit)setSelected({label:hit.label,spName:hit.sp.label,tier:hit.sp.tier,diet:hit.sp.diet,energy:Math.round(hit.energy),age:Math.round(hit.age),stress:Math.round(hit.stress*100),gen:hit.generation,hueShift:Math.round(hit.genome.hueShift),sizeScale:Math.round(hit.genome.sizeScale*100),speedScale:Math.round(hit.genome.speedScale*100),glow:Math.round(hit.genome.glow*100)});
    else setSelected(null);
  },[getXY]);

  const handleWheel=useCallback(e=>{e.preventDefault();const vw=viewRef.current;vw.targetZoom=clamp(vw.targetZoom*(e.deltaY<0?1.12:.88),.25,6);},[]);
  const cycleMode=useCallback(()=>{const modes=["attract","repel","kill"],s=simRef.current,next=modes[(modes.indexOf(s.mode)+1)%modes.length];s.mode=next;setMode(next);},[]);
  const togglePause=useCallback(()=>{simRef.current.paused=!simRef.current.paused;setPaused(p=>!p);},[]);
  const resetSim=useCallback(()=>{
    const s=simRef.current,c=cfgRef.current,W=canvasRef.current.offsetWidth,H=canvasRef.current.offsetHeight;
    s.organisms=[];s.foods=[];s.pheromones=[];s.particles=[];s.births=0;s.deaths=0;s.frame=0;s.selectedId=null;
    s.energyH=Array(HIST).fill(0);s.popH=Array(HIST).fill(0);fieldsRef.current=[];
    for(let i=0;i<44;i++)s.organisms.push(mkOrg(null,null,SPECIES[i%SPECIES.length],W,H,c,null));
    for(let i=0;i<c.foodN;i++)s.foods.push(mkFood(W,H));
    setStats({count:44,births:0,deaths:0,tier:[0,0,0],avgGen:0});setSelected(null);
    setSparkE([]);setSparkP([]);eventRef.current={id:null};setCurEvent(null);
    viewRef.current={zoom:1,targetZoom:1};setZoomDisp(1);
    const tc=trailRef.current;if(tc)tc.getContext("2d").clearRect(0,0,tc.width,tc.height);
  },[]);

  const MC={attract:"#00ff96",repel:"#ff5050",kill:"#6070ff"};
  const ML={attract:"▶ ATRAER",repel:"◀ REPELER",kill:"✕ KILL"};

  // ── panel CSS vars ───────────────────────────────────────────────
  const PW = 230; // panel pixel width
  const P = {
    bg:    "#0e1318",
    bd:    "#1f3d2a",
    lbl:   "#7ecfa0",   // section labels
    dim:   "#4a8a62",   // secondary text
    txt:   "#c0e8cc",   // primary text / values
    hi:    "#2d9e64",
    btn:   "#0e1318",
    btnBd: "#1f3d2a",
    btnTx: "#7ecfa0",
  };
  const slProps={cfg,updCfg};

  return(
    <div style={{position:"relative",width:"100vw",height:"100vh",background:"#060810",overflow:"hidden",fontFamily:"'Courier New',monospace"}}>
      
      {/* Fullscreen Button */}
      <button 
        onClick={toggleFullscreen}
        style={{
          position: "absolute",
          top: "20px",
          right: "20px",
          zIndex: 9999,
          background: "rgba(5,7,6,0.5)",
          border: "1px solid #1f3d2a",
          color: "#39ff9a",
          padding: "10px",
          borderRadius: "2px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backdropFilter: "blur(4px)",
          transition: "all 0.2s"
        }}
        onMouseOver={e => { e.currentTarget.style.background = "rgba(5,7,6,0.8)"; e.currentTarget.style.borderColor = "#39ff9a"; }}
        onMouseOut={e => { e.currentTarget.style.background = "rgba(5,7,6,0.5)"; e.currentTarget.style.borderColor = "#1f3d2a"; }}
        title={isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
      >
        {isFullscreen ? <Minimize size={16} strokeWidth={1.5} /> : <Maximize size={16} strokeWidth={1.5} />}
      </button>

      {!started && (
        showBitacora ? (
          <Bitacora 
            micMode={micMode}
            startMicLive={startMicLive}
            stopMic={stopMic}
            camMode={camMode}
            startCamLive={startCamLive}
            stopCam={stopCam}
            onStart={() => setStarted(true)}
            onClose={() => setShowBitacora(false)}
          />
        ) : (
          <div style={{
            position: "fixed", top: 0, left: 0, width: "100%", height: "100%", zIndex: 1000,
            backgroundColor: "#050706",
            fontFamily: "'Montserrat', sans-serif", color: "#e9efeb",
            overflow: "hidden"
          }}>
            <CoverBackground />
            <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 50% 45%, transparent 0, rgba(5,7,6,0.12) 30%, rgba(5,7,6,0.86) 86%)", pointerEvents: "none", zIndex: 0 }} />
            
            <div style={{
              position: "relative", zIndex: 1,
              height: "100%", width: "100%", overflowY: "auto",
              display: "flex", flexDirection: "column", alignItems: "center",
              padding: "clamp(15px, 3vh, 40px) 20px"
            }}>
              <div style={{ flex: "1 1 auto", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: "100%", maxWidth: "850px", padding: "10px 0" }}>
                
                <div style={{ color: "#39ff9a", font: "600 clamp(7px, 2vw, 9px)/1.7 'JetBrains Mono', monospace", letterSpacing: ".18em", textTransform: "uppercase", textAlign: "center" }}>
                  NÚCLEO COLECTIVO · ECOSISTEMA INTERACTIVO
                </div>
                
                <h1 style={{ margin: "clamp(12px, 3vh, 26px) auto 0", fontSize: "clamp(36.8px, 10vw, 145px)", lineHeight: 0.84, letterSpacing: "-.065em", fontWeight: 300, whiteSpace: "nowrap", color: "#e9efeb", textAlign: "center" }}>
                  BIO<em style={{fontStyle: "normal", color: "#39ff9a"}}>ORGANISM</em>
                </h1>

                <div style={{ width: "min(680px, 100%)", margin: "clamp(25px, 5vh, 45px) auto clamp(40px, 8vh, 75px)", color: "#bdc7c0", fontSize: "clamp(12px, 3.5vw, 21px)", lineHeight: 1.5, textAlign: "center", fontWeight: 300 }}>
                  Un ecosistema digital donde la vida artificial responde a la presencia humana.<br/>
                  El sonido esculpe la materia y el movimiento genera energía.
                </div>

                <div style={{ display: "flex", gap: "clamp(8px, 1.5vh, 14px)", marginBottom: "clamp(20px, 4vh, 3.5rem)", flexDirection: "column", width: "100%", maxWidth: "320px" }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "clamp(4px, 1vh, 8px)", width: "100%" }}>
                    <span style={{ font: "600 8px 'JetBrains Mono', monospace", letterSpacing: ".15em", color: "#657169", marginBottom: "2px" }}>SENTIDO AUDITIVO</span>
                    <button
                      onClick={() => micMode === "off" ? startMicLive() : stopMic()}
                      style={{
                        width: "100%", padding: "10px 16px", font: "600 8.5px 'JetBrains Mono', monospace", letterSpacing: ".12em",
                        background: micMode === "live" ? "#39ff9a" : "rgba(57, 255, 154, 0.05)", 
                        border: "1px solid #39ff9a", 
                        color: micMode === "live" ? "#000" : "#39ff9a",
                        borderRadius: "2px", cursor: "pointer", transition: "all 0.2s ease",
                        boxShadow: micMode === "live" ? "0 0 15px rgba(57, 255, 154, 0.4)" : "none",
                        whiteSpace: "nowrap"
                      }}
                    >
                      {micMode === "live" ? "MICRÓFONO CONECTADO" : "CONECTAR MICRÓFONO"}
                    </button>
                  </div>
                  
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "clamp(4px, 1vh, 8px)", width: "100%" }}>
                    <span style={{ font: "600 8px 'JetBrains Mono', monospace", letterSpacing: ".15em", color: "#657169", marginBottom: "2px" }}>SENTIDO VISUAL</span>
                    <button
                      onClick={() => camMode === "off" ? startCamLive() : stopCam()}
                      style={{
                        width: "100%", padding: "10px 16px", font: "600 8.5px 'JetBrains Mono', monospace", letterSpacing: ".12em",
                        background: camMode === "live" ? "#3ce0c9" : "rgba(60, 224, 201, 0.05)", 
                        border: "1px solid #3ce0c9", 
                        color: camMode === "live" ? "#000" : "#3ce0c9",
                        borderRadius: "2px", cursor: "pointer", transition: "all 0.2s ease",
                        boxShadow: camMode === "live" ? "0 0 15px rgba(60, 224, 201, 0.4)" : "none",
                        whiteSpace: "nowrap"
                      }}
                    >
                      {camMode === "live" ? "CÁMARA CONECTADA" : "CONECTAR CÁMARA"}
                    </button>
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "clamp(10px, 1.5vh, 15px)", alignItems: "center", width: "100%" }}>
                  <button
                    onClick={() => {
                      if (!audioRef.current.ctx) {
                        const actx = new (window.AudioContext || (window as any).webkitAudioContext)();
                        actx.resume();
                        audioRef.current.ctx = actx;
                      } else if (audioRef.current.ctx.state === "suspended") {
                        audioRef.current.ctx.resume();
                      }
                      setStarted(true);
                    }}
                    style={{
                      display: "inline-flex", alignItems: "center", justifyContent: "center", minHeight: "40px", padding: "0 32px",
                      background: "#39ff9a0b", border: "1px solid #39ff9a", color: "#dfffea",
                      font: "600 9px 'JetBrains Mono', monospace", letterSpacing: ".12em",
                      borderRadius: "2px", cursor: "pointer", transition: "transform 0.2s, background 0.3s",
                      width: "100%", maxWidth: "320px", marginTop: "4px"
                    }}
                    onMouseOver={e => e.currentTarget.style.background = "#39ff9a15"}
                    onMouseOut={e => e.currentTarget.style.background = "#39ff9a0b"}
                    onMouseDown={e => e.currentTarget.style.transform = "scale(0.98)"}
                    onMouseUp={e => e.currentTarget.style.transform = "scale(1)"}
                    onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}
                  >
                    INICIAR EXPERIENCIA ↓
                  </button>
                  
                  <button
                    onClick={() => setShowBitacora(true)}
                    style={{
                      width: "100%", maxWidth: "320px", padding: "10px 20px", 
                      font: "400 8.5px 'JetBrains Mono', monospace", letterSpacing: ".1em",
                      background: "transparent", border: "1px solid transparent", color: "#87938b",
                      cursor: "pointer", transition: "all 0.3s ease", textDecoration: "underline"
                    }}
                    onMouseOver={(e) => { e.currentTarget.style.color = "#39ff9a"; }}
                    onMouseOut={(e) => { e.currentTarget.style.color = "#87938b"; }}
                  >
                    LEER BITÁCORA DE LA OBRA
                  </button>
                </div>
              </div>

              <div style={{ marginTop: "auto", textAlign: "center", display: "flex", flexDirection: "column", gap: "clamp(6px, 1.5vh, 12px)", paddingTop: "clamp(10px, 2vh, 20px)" }}>
                <span style={{ font: "300 10px 'Montserrat', sans-serif", color: "#58645c", letterSpacing: "0.05em" }}>
                  BIOORGANISM · <strong style={{ color: "#758178", fontWeight: 500 }}>Manuel Palacio</strong> © 2026
                </span>
                <a href="http://nucleocolectivo.com/" target="_blank" rel="noreferrer" style={{ font: "400 9px 'JetBrains Mono', monospace", color: "#657169", textDecoration: "none", letterSpacing: "0.15em", transition: "color 0.3s" }} onMouseOver={e=>e.currentTarget.style.color="#39ff9a"} onMouseOut={e=>e.currentTarget.style.color="#657169"}>
                  NÚCLEO COLECTIVO ↗
                </a>
              </div>
            </div>
          </div>
        )
      )}

      <video ref={videoRef} muted playsInline style={{position:"absolute",width:1,height:1,opacity:0,pointerEvents:"none"}}/>
      <canvas ref={camCvs} style={{display:"none"}}/>

      {/* ── CANVAS — fills full viewport ── */}
      <canvas ref={canvasRef}
        onMouseMove={handleMove} onMouseDown={handleDown} onMouseUp={handleUp}
        onClick={handleClick} onWheel={handleWheel}
        onTouchMove={e=>{e.preventDefault();const{x,y}=getXY(e);mouseRef.current.x=x;mouseRef.current.y=y;updateMouseMot(x,y);}}
        onTouchStart={e=>{mouseRef.current.down=true;handleClick(e);}}
        onTouchEnd={()=>mouseRef.current.down=false}
        style={{position:"absolute",inset:0,width:"100%",height:"100%",cursor:"crosshair",display:"block"}}
      />

      {/* ── EVENT TOAST ── */}
      {curEvent&&(
        <div style={{position:"absolute",top:14,left:"50%",transform:"translateX(-50%)",padding:"6px 18px",
          background:"rgba(6,8,16,.88)",border:`1px solid ${curEvent.col}66`,color:curEvent.col,
          fontSize:10,letterSpacing:".18em",pointerEvents:"none",zIndex:80,whiteSpace:"nowrap",borderRadius:2}}>
          {curEvent.label} — {curEvent.desc}
        </div>
      )}

      {/* ── NARRATIVE SUBTITLE ── */}
      {narrativeSubtitle && (
        <div key={narrativeSubtitle} style={{
          position: "absolute", bottom: 40, left: "50%", transform: "translateX(-50%)",
          maxWidth: "80%", textAlign: "center", pointerEvents: "none", zIndex: 90,
          color: "#fff", fontSize: 24, letterSpacing: ".05em", fontFamily: "'Montserrat', sans-serif",
          textShadow: "0 2px 14px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.8)",
          animation: "fadeInOut 16s ease-in-out forwards"
        }}>
          {narrativeSubtitle}
        </div>
      )}

      {/* ── PANEL TOGGLE ── */}
      <button
        onClick={()=>setPanel(p=>!p)}
        style={{position:"fixed",top:12,right:panel?PW+8:8,zIndex:300,
          width:28,height:28,display:"flex",alignItems:"center",justifyContent:"center",
          background:"#0e1318",border:"1px solid #2d9e64",color:"#2d9e64",
          fontSize:13,cursor:"pointer",borderRadius:3,transition:"right .18s"}}>
        {panel?"▶":"◀"}
      </button>

      {/* ══ SIDE PANEL — fixed overlay, always on top ══ */}
      <div style={{
        position:"fixed", top:0, right:panel?0:-PW, width:PW, height:"100vh",
        transition:"right .18s", zIndex:200,
        background:P.bg, borderLeft:`2px solid ${P.bd}`,
        display:"flex", flexDirection:"column", overflow:"hidden",
        boxShadow:"-4px 0 24px rgba(0,0,0,.7)",
      }}>

        {/* ── HEADER ── */}
        <div style={{padding:"14px 14px 10px",borderBottom:`1px solid ${P.bd}`,flexShrink:0}}>
          <div style={{fontSize:8,letterSpacing:".22em",color:P.dim,marginBottom:3}}>OBSERVATORIO BIO-LINK</div>
          <div style={{fontSize:15,letterSpacing:".05em",color:"#a8dfff",fontWeight:"bold",marginBottom:2}}>e/organisms</div>
          <div style={{fontSize:9,color:P.lbl}}>{elapsed} · zoom ×{zoomDisp}</div>

          {/* counters */}
          <div style={{display:"flex",justifyContent:"space-between",marginTop:10}}>
            {[["VIVOS",stats.count,"#2d9e64"],["NACIDOS",stats.births,"#4e7fd4"],["MUERTOS",stats.deaths,"#c94040"]].map(([l,v,c])=>(
              <div key={l} style={{textAlign:"center"}}>
                <div style={{fontSize:7,color:P.dim,letterSpacing:".1em",marginBottom:2}}>{l}</div>
                <div style={{fontSize:13,color:c,fontWeight:"bold"}}>{v}</div>
              </div>
            ))}
          </div>
          {/* tier / gen */}
          <div style={{display:"flex",marginTop:8,gap:2}}>
            {[["T1",stats.tier?.[0],"#2d9e64"],["T2",stats.tier?.[1],"#c98a1a"],["T3",stats.tier?.[2],"#2ec4b6"],["G⌀",stats.avgGen,"#c42ec4"]].map(([l,v,c])=>(
              <div key={l} style={{flex:1,textAlign:"center",background:"#111820",borderRadius:2,padding:"3px 0"}}>
                <div style={{fontSize:7,color:c+"aa",marginBottom:1}}>{l}</div>
                <div style={{fontSize:11,color:c,fontWeight:"bold"}}>{v??0}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── SPARKLINES ── */}
        <div style={{padding:"8px 14px",borderBottom:`1px solid ${P.bd}`,flexShrink:0}}>
          <div style={{fontSize:8,color:P.dim,letterSpacing:".1em",marginBottom:3}}>ENERGÍA MEDIA</div>
          <Spark data={sparkE} color="#2d9e64" maxVal={100}/>
          <div style={{fontSize:8,color:P.dim,letterSpacing:".1em",margin:"5px 0 3px"}}>POBLACIÓN</div>
          <Spark data={sparkP} color="#4e7fd4" maxVal={cfg.maxOrgs}/>
        </div>

        {/* ── PLAYBACK BUTTONS ── */}
        <div style={{padding:"8px 10px",borderBottom:`1px solid ${P.bd}`,display:"flex",gap:5,flexShrink:0}}>
          <button onClick={togglePause} style={{flex:1,padding:"7px 0",background:paused?"#2a1800":"transparent",
            border:`1px solid ${paused?"#c98a1a":"#1f3d2a"}`,color:paused?"#c98a1a":P.lbl,
            fontSize:9,cursor:"pointer",fontFamily:"inherit",borderRadius:2}}>
            {paused?"▶ PLAY":"⏸ PAUSA"}
          </button>
          <button onClick={resetSim} style={{flex:1,padding:"7px 0",background:"transparent",
            border:`1px solid ${P.bd}`,color:P.lbl,fontSize:9,cursor:"pointer",fontFamily:"inherit",borderRadius:2}}>
            ↺ RESET
          </button>
          <button onClick={cycleMode} style={{flex:1,padding:"7px 0",background:"transparent",
            border:`1px solid ${MC[mode]}66`,color:MC[mode],fontSize:9,cursor:"pointer",fontFamily:"inherit",borderRadius:2}}>
            {ML[mode]}
          </button>
        </div>

        {/* ── TABS ── */}
        <div style={{display:"flex",borderBottom:`1px solid ${P.bd}`,flexShrink:0}}>
          {[["controls","CTRL"],["sensors","SENS"],["eco","ECO"],["info","INFO"]].map(([id,lbl])=>(
            <button key={id} onClick={()=>setTab(id)} style={{flex:1,padding:"8px 0",background:"transparent",
              border:"none",borderBottom:`2px solid ${tab===id?"#2d9e64":"transparent"}`,
              color:tab===id?"#a8dfff":P.dim,fontSize:9,letterSpacing:".1em",
              cursor:"pointer",fontFamily:"inherit",transition:"all .1s"}}>
              {lbl}
            </button>
          ))}
        </div>

        {/* ── TAB BODY ── */}
        <div style={{flex:1,overflowY:"auto",padding:"12px 12px 20px",
          scrollbarWidth:"thin",scrollbarColor:`${P.bd} ${P.bg}`}}>

          {/* ── CONTROLS TAB ── */}
          {tab==="controls"&&<>
            <SectionLabel>SIMULACIÓN</SectionLabel>
            <Sl label="VELOCIDAD"  k="speed"    min={10}  max={300} unit="%" {...slProps}/>
            <Sl label="COMIDA"     k="foodN"    min={5}   max={120}          {...slProps}/>
            <Sl label="VIDA MIN"   k="lifeMin"  min={100} max={2000} step={50} {...slProps}/>
            <Sl label="VIDA MAX"   k="lifeMax"  min={200} max={5000} step={100} {...slProps}/>
            <Sl label="MUTACIÓN"   k="mutation" min={0}   max={100} unit="%" {...slProps}/>
            <Sl label="MÁX ORGS"  k="maxOrgs"  min={10}  max={500}          {...slProps}/>
            <Sl label="FRICCIÓN"   k="friction" min={0.8} max={0.99} step={.01} {...slProps}/>
            <Sl label="DESGASTE"   k="drain"    min={10}  max={300} unit="%" {...slProps}/>

            <SectionLabel mt>FUERZAS</SectionLabel>
            <Sl label="CURSOR"     k="cursorForce" min={0}   max={300} unit="%" {...slProps}/>
            <Sl label="RADIO CURSOR" k="cursorR"   min={30}  max={300}          {...slProps}/>
            <Sl label="SEPARACIÓN" k="sepR"        min={20}  max={200}          {...slProps}/>
            <Sl label="COHESIÓN"   k="cohR"        min={40}  max={400}          {...slProps}/>
            <Sl label="SONIDO"     k="soundForce"  min={0}   max={300} unit="%" {...slProps}/>
            <Sl label="MOVIMIENTO" k="motForce"    min={0}   max={300} unit="%" {...slProps}/>
            <Sl label="VOLUMEN"    k="volume"      min={0}   max={1}   step={.05} {...slProps}/>

            <SectionLabel mt>CAMPOS DE FUERZA</SectionLabel>
            <div style={{display:"flex",gap:5,marginBottom:6,flexWrap:"wrap"}}>
              {FIELD_MODES.map(fm=>(
                <button key={fm} onClick={()=>updCfg("fieldMode",fm)}
                  style={{padding:"6px 10px",background:cfg.fieldMode===fm?FIELD_COLS[fm]+"22":"transparent",
                    border:`1px solid ${cfg.fieldMode===fm?FIELD_COLS[fm]:P.bd}`,
                    color:cfg.fieldMode===fm?FIELD_COLS[fm]:P.lbl,
                    fontSize:13,cursor:"pointer",fontFamily:"inherit",borderRadius:2}}>
                  {FIELD_ICONS[fm]}
                </button>
              ))}
              <button onClick={()=>fieldsRef.current=[]}
                style={{padding:"6px 10px",background:"transparent",border:`1px solid ${P.bd}`,
                  color:P.lbl,fontSize:9,cursor:"pointer",fontFamily:"inherit",borderRadius:2}}>CLR</button>
            </div>
            <div style={{fontSize:9,color:P.dim,lineHeight:1.7}}>Mantener clic arrastrado → dibuja campo de fuerza</div>
          </>}

          {/* ── SENSORS TAB ── */}
          {tab==="sensors"&&<>
            <SectionLabel>NIVELES EN VIVO</SectionLabel>
            <Bar label="MIC" value={sensors.mic} color="#2d9e64"/>
            <Bar label="MOV" value={sensors.mot} color="#4e7fd4"/>

            {/* ── MIC ── */}
            <SectionLabel mt>🎙 MICRÓFONO</SectionLabel>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
              <div style={{width:9,height:9,borderRadius:"50%",flexShrink:0,
                background:micMode==="live"?"#2d9e64":micMode==="sim"?"#c98a1a":"#1a2820",
                boxShadow:micMode!=="off"?`0 0 7px ${micMode==="live"?"#2d9e64":"#c98a1a"}`:""}}/>
              <span style={{fontSize:10,color:micMode==="live"?"#2d9e64":micMode==="sim"?"#c98a1a":P.dim,fontWeight:"bold"}}>
                {micMode==="live"?"EN VIVO":micMode==="sim"?"SIMULADO":"APAGADO"}
              </span>
              {micMode!=="off"&&
                <button onClick={stopMic}
                  style={{marginLeft:"auto",padding:"3px 8px",background:"#2a0a0a",
                    border:"1px solid #c9404066",color:"#c94040",fontSize:9,
                    cursor:"pointer",fontFamily:"inherit",borderRadius:2}}>■ OFF</button>
              }
            </div>

            {micMode==="off"&&<div style={{display:"flex",gap:6,marginBottom:8}}>
              <button onClick={startMicLive}
                style={{flex:1,padding:"10px 0",background:"#0d2218",
                  border:"2px solid #2d9e64",color:"#2d9e64",fontSize:10,fontWeight:"bold",
                  cursor:"pointer",fontFamily:"inherit",borderRadius:3,lineHeight:1.3}}>
                🎤 REAL<br/><span style={{fontSize:8,fontWeight:"normal",opacity:.8}}>getUserMedia</span>
              </button>
              <button onClick={startMicSim}
                style={{flex:1,padding:"10px 0",background:"#1a1400",
                  border:"2px solid #c98a1a",color:"#c98a1a",fontSize:10,fontWeight:"bold",
                  cursor:"pointer",fontFamily:"inherit",borderRadius:3,lineHeight:1.3}}>
                〜 SIMULAR<br/><span style={{fontSize:8,fontWeight:"normal",opacity:.8}}>oscilador LFO</span>
              </button>
            </div>}

            {micErr&&<div style={{fontSize:9,color:"#f77",background:"#1a0808",border:"1px solid #c9404055",
              borderRadius:3,padding:"6px 8px",marginBottom:8,lineHeight:1.5}}>{micErr}</div>}

            <div style={{fontSize:9,color:P.dim,lineHeight:1.8,background:"#111820",borderRadius:3,padding:"6px 8px",marginBottom:4}}>
              <b style={{color:P.lbl}}>REAL</b> — usa el micrófono del dispositivo<br/>
              <b style={{color:P.lbl}}>SIMULAR</b> — oscilador LFO, sin permiso
            </div>
            <div style={{fontSize:9,color:P.dim,lineHeight:1.8}}>
              Amp → vel + deformación · Graves → cohesión<br/>Transientes → spawn
            </div>

            {/* ── CAM ── */}
            <SectionLabel mt>📷 CÁMARA / MOVIMIENTO</SectionLabel>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
              <div style={{width:9,height:9,borderRadius:"50%",flexShrink:0,
                background:camMode==="live"?"#4e7fd4":camMode==="sim"?"#c98a1a":"#1a1820",
                boxShadow:camMode!=="off"?`0 0 7px ${camMode==="live"?"#4e7fd4":"#c98a1a"}`:""}}/>
              <span style={{fontSize:10,color:camMode==="live"?"#4e7fd4":camMode==="sim"?"#c98a1a":P.dim,fontWeight:"bold"}}>
                {camMode==="live"?"EN VIVO":camMode==="sim"?"MOUSE→CAMPO":"APAGADO"}
              </span>
              {camMode!=="off"&&
                <button onClick={stopCam}
                  style={{marginLeft:"auto",padding:"3px 8px",background:"#2a0a0a",
                    border:"1px solid #c9404066",color:"#c94040",fontSize:9,
                    cursor:"pointer",fontFamily:"inherit",borderRadius:2}}>■ OFF</button>
              }
            </div>

            {camMode==="off"&&<div style={{display:"flex",gap:6,marginBottom:8}}>
              <button onClick={startCamLive}
                style={{flex:1,padding:"10px 0",background:"#0a0f1e",
                  border:"2px solid #4e7fd4",color:"#4e7fd4",fontSize:10,fontWeight:"bold",
                  cursor:"pointer",fontFamily:"inherit",borderRadius:3,lineHeight:1.3}}>
                📹 REAL<br/><span style={{fontSize:8,fontWeight:"normal",opacity:.8}}>webcam óptica</span>
              </button>
              <button onClick={startCamSim}
                style={{flex:1,padding:"10px 0",background:"#1a1400",
                  border:"2px solid #c98a1a",color:"#c98a1a",fontSize:10,fontWeight:"bold",
                  cursor:"pointer",fontFamily:"inherit",borderRadius:3,lineHeight:1.3}}>
                🖱 MOUSE<br/><span style={{fontSize:8,fontWeight:"normal",opacity:.8}}>sin permiso</span>
              </button>
            </div>}

            {camErr&&<div style={{fontSize:9,color:"#f77",background:"#1a0808",border:"1px solid #c9404055",
              borderRadius:3,padding:"6px 8px",marginBottom:8,lineHeight:1.5}}>{camErr}</div>}

            <div style={{fontSize:9,color:P.dim,lineHeight:1.8,background:"#111820",borderRadius:3,padding:"6px 8px"}}>
              <b style={{color:P.lbl}}>REAL</b> — usa la webcam para detectar movimiento<br/>
              <b style={{color:P.lbl}}>MOUSE</b> — velocidad del cursor → grid 8×6
            </div>
          </>}

          {/* ── ECO TAB ── */}
          {tab==="eco"&&<>
            <SectionLabel>SISTEMAS</SectionLabel>
            <Tog label="DEPREDACIÓN"  k="predation"  color="#c94040" {...slProps}/>
            <Tog label="FEROMONAS"    k="pheromones" color="#c98a1a" {...slProps}/>
            <Tog label="TRAILS BIO"   k="trails"     color="#2ec4b6" {...slProps}/>
            <Tog label="SPAWN SONIDO" k="soundSpawn" color="#2d9e64" {...slProps}/>
            <Tog label="MOV. CURSOR"  k="motionOn"   color="#4e7fd4" {...slProps}/>
            <Tog label="GRILLA"       k="showGrid"   color="#5a9a7a" {...slProps}/>
            <Tog label="SIMETRÍA"     k="symmetry"   color="#c42ec4" {...slProps}/>
            <Tog label="EVENTOS AUTO" k="autoEvent"  color="#c98a1a" {...slProps}/>
            {cfg.symmetry&&<Sl label="EJES SIMETRÍA" k="symmetryAxes" min={2} max={4} step={2} {...slProps}/>}

            <SectionLabel mt>EVENTOS ECO</SectionLabel>
            <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:10}}>
              {ECO_EVENTS.map(ev=>(
                <button key={ev.id} onClick={()=>triggerEvent(ev.id)}
                  style={{padding:"5px 8px",background:"transparent",border:`1px solid ${ev.col}66`,
                    color:ev.col,fontSize:9,cursor:"pointer",fontFamily:"inherit",borderRadius:2,letterSpacing:".05em"}}>
                  {ev.label}
                </button>
              ))}
            </div>

            <SectionLabel mt>CADENA TRÓFICA</SectionLabel>
            {SPECIES.map(sp=>(
              <div key={sp.id} style={{marginBottom:8,padding:"5px 6px",background:"#111820",borderRadius:3}}>
                <div style={{display:"flex",alignItems:"center",gap:7}}>
                  <div style={{width:8,height:8,borderRadius:"50%",background:sp.col,flexShrink:0,boxShadow:`0 0 5px ${sp.col}`}}/>
                  <span style={{fontSize:9,color:"#c0e8cc",fontWeight:"bold"}}>{sp.label.toUpperCase()}</span>
                  <span style={{fontSize:8,color:P.dim,marginLeft:"auto"}}>T{sp.tier} · {sp.diet}</span>
                </div>
                {sp.prey&&<div style={{fontSize:8,color:P.dim,paddingLeft:15,marginTop:3}}>↳ preda: {sp.prey.join(", ")}</div>}
              </div>
            ))}
          </>}

          {/* ── INFO TAB ── */}
          {tab==="info"&&<>
            <SectionLabel>ESPÉCIMEN SELECCIONADO</SectionLabel>
            {selected?(
              <div style={{background:"#111820",borderRadius:4,padding:"10px 10px"}}>
                <div style={{fontSize:10,color:"#a8dfff",marginBottom:8,wordBreak:"break-all",fontWeight:"bold",letterSpacing:".05em"}}>{selected.label}</div>
                {[["ESPECIE",selected.spName],["DIETA",selected.diet],["TIER","T"+selected.tier],["GEN.","G"+selected.gen],
                  ["ENERGÍA",selected.energy+"%"],["ESTRÉS",selected.stress+"%"],["EDAD",selected.age+"t"]].map(([k,v])=>(
                  <div key={k} style={{display:"flex",justifyContent:"space-between",marginBottom:5,borderBottom:`1px solid ${P.bd}`,paddingBottom:4}}>
                    <span style={{fontSize:8,color:P.dim}}>{k}</span>
                    <span style={{fontSize:9,color:P.txt,fontWeight:"bold"}}>{v}</span>
                  </div>
                ))}
                <div style={{marginTop:8,fontSize:8,color:P.dim,marginBottom:4,letterSpacing:".1em"}}>GENOMA</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4}}>
                  {[["HUE",selected.hueShift+"°"],["TAMAÑO",selected.sizeScale+"%"],["VEL.",selected.speedScale+"%"],["BRILLO",selected.glow+"%"]].map(([k,v])=>(
                    <div key={k} style={{background:"#0e1318",borderRadius:2,padding:"4px 6px"}}>
                      <div style={{fontSize:7,color:P.dim,marginBottom:1}}>{k}</div>
                      <div style={{fontSize:10,color:"#c42ec4",fontWeight:"bold"}}>{v}</div>
                    </div>
                  ))}
                </div>
                <div style={{marginTop:8,background:"#0e1318",height:4,borderRadius:2,overflow:"hidden"}}>
                  <div style={{width:`${selected.energy}%`,height:"100%",
                    background:selected.energy>50?"#2d9e64":"#c94040",transition:"width .3s"}}/>
                </div>
                <div style={{fontSize:7,color:P.dim,marginTop:2,textAlign:"right"}}>energía {selected.energy}%</div>
              </div>
            ):(
              <div style={{padding:"14px 10px",background:"#111820",borderRadius:4,fontSize:9,color:P.dim,lineHeight:1.8}}>
                Haz clic sobre<br/>un organismo<br/>para inspeccionar su genoma.
              </div>
            )}

            <SectionLabel mt>ATAJOS</SectionLabel>
            <div style={{fontSize:9,color:P.dim,lineHeight:2,background:"#111820",borderRadius:4,padding:"8px 10px"}}>
              <b style={{color:P.lbl}}>CLIC</b> → spawnar colonia<br/>
              <b style={{color:P.lbl}}>HOLD+ARRASTRAR</b> → campo<br/>
              <b style={{color:P.lbl}}>SCROLL</b> → zoom ×0.25–6<br/>
              <b style={{color:P.lbl}}>CLIC ORG</b> → ver genoma<br/>
              <b style={{color:P.lbl}}>MIC</b> → vel + deformación<br/>
              <b style={{color:P.lbl}}>CAM</b> → bio-reactividad
            </div>
          </>}
        </div>
      </div>
    </div>
  );
}

// ── Tiny layout helpers used only inside panel ───────────────────
function SectionLabel({children,mt}: {children: any, mt?: boolean}){
  return <div style={{fontSize:8,letterSpacing:".18em",color:"#5aaa7a",marginBottom:8,marginTop:mt?14:0,paddingBottom:3,borderBottom:"1px solid #1f3d2a"}}>{children}</div>;
}
function StatusDot({active,label,color}){
  return(
    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
      <div style={{width:7,height:7,borderRadius:"50%",background:active?color:"#222",boxShadow:active?`0 0 6px ${color}`:""}}/>
      <span style={{fontSize:9,color:active?color:"#4a6a58"}}>{label}</span>
    </div>
  );
}
