import { useState, useRef, useEffect, useCallback, useReducer } from “react”;

const GRID = 20;
const snap = (v) => Math.round(v / GRID) * GRID;

const ROOM_COLORS = [”#e8d5b7”,”#b7d5e8”,”#b7e8c8”,”#e8b7b7”,”#e8e8b7”,”#d5b7e8”,”#b7e8e8”,”#f0cba8”];
const ROOM_NAMES  = [“Vardagsrum”,“Kök”,“Sovrum”,“Badrum”,“Hall”,“Kontor”,“Förråd”,“Matsal”];
const WALL_SIZES  = [{ label:“Tunn (5cm)”, v:3 },{ label:“Normal (10cm)”, v:6 },{ label:“Tjock (20cm)”, v:12 },{ label:“Bärande (30cm)”, v:18 }];
const TEXT_SIZES  = [8,10,12,14,16,20,24,32];

const TOOLS = [
{ id:“wall”,   label:“Vägg”,    icon:“▬” },
{ id:“room”,   label:“Rum”,     icon:“⬛” },
{ id:“door”,   label:“Dörr”,    icon:“⌒” },
{ id:“window”, label:“Fönster”, icon:“▭” },
{ id:“stair”,  label:“Trappa”,  icon:“≡” },
{ id:“vent”,   label:“Ventil”,  icon:“⊕” },
{ id:“text”,   label:“Text”,    icon:“T” },
{ id:“select”, label:“Välj”,    icon:“↖” },
{ id:“erase”,  label:“Radera”,  icon:“✕” },
];

const STAIR_STEPS = [4, 6, 8, 10, 12, 14, 16];

let _id = 1;
const newId = () => _id++;

// ── History reducer ──────────────────────────────────────────────────────────
function historyReducer(state, action) {
switch (action.type) {
case “SET”: {
const past = […state.past, state.present].slice(-80);
return { past, present: action.elements, future: [] };
}
case “UNDO”: {
if (!state.past.length) return state;
const past = […state.past];
const present = past.pop();
return { past, present, future: [state.present, …state.future] };
}
case “REDO”: {
if (!state.future.length) return state;
const [present, …future] = state.future;
return { past: […state.past, state.present], present, future };
}
default: return state;
}
}

// ── Architectural door SVG path ──────────────────────────────────────────────
function DoorArch({ el, selected, onClick, wallThick }) {
// Door: line (door frame) + quarter-circle arc swinging open
const dx = el.x2 - el.x1, dy = el.y2 - el.y1;
const len = Math.hypot(dx, dy);
if (len < 2) return null;
const ux = dx / len, uy = dy / len;
// perpendicular (swing direction)
const px = -uy, py = ux;
const r = len;
// Arc endpoint: swing quarter circle from x1→x2 direction, rotated 90°
const ax = el.x1 + px * r, ay = el.y1 + py * r;
const stroke = selected ? “#1d4ed8” : “#2c2416”;
const t = wallThick || 6;

return (
<g onClick={onClick} style={{ cursor:“pointer” }}>
{/* invisible hit area */}
<line x1={el.x1} y1={el.y1} x2={el.x2} y2={el.y2} stroke="transparent" strokeWidth={20} />
{/* door leaf line */}
<line x1={el.x1} y1={el.y1} x2={el.x2} y2={el.y2}
stroke={stroke} strokeWidth={t} strokeLinecap="butt" />
{/* thin face line */}
<line x1={el.x1} y1={el.y1} x2={el.x2} y2={el.y2}
stroke={selected ? “#60a5fa” : “#faf6ef”} strokeWidth={Math.max(1,t-3)} strokeLinecap=“butt” />
{/* quarter-circle arc */}
<path d={`M ${el.x2} ${el.y2} A ${r} ${r} 0 0 0 ${ax} ${ay}`}
fill=“none” stroke={stroke} strokeWidth={1.5} strokeDasharray=“5 3” />
{/* hinge dot */}
<circle cx={el.x1} cy={el.y1} r={2.5} fill={stroke} />
</g>
);
}

// ── Vent symbol ──────────────────────────────────────────────────────────────
function VentSymbol({ el, selected, onClick }) {
const cx = (el.x1 + el.x2) / 2, cy = (el.y1 + el.y2) / 2;
const r = Math.max(10, Math.hypot(el.x2 - el.x1, el.y2 - el.y1) / 2);
const stroke = selected ? “#1d4ed8” : “#4a7a6a”;
return (
<g onClick={onClick} style={{ cursor:“pointer” }}>
<circle cx={cx} cy={cy} r={r} fill=”#d4ede8” fillOpacity={0.7} stroke={stroke} strokeWidth={selected ? 2.5 : 1.5} />
<circle cx={cx} cy={cy} r={r * 0.35} fill=“none” stroke={stroke} strokeWidth={1.2} />
{[0,45,90,135].map(deg => {
const rad = deg * Math.PI / 180;
return <line key={deg}
x1={cx + Math.cos(rad)*(r*0.38)} y1={cy + Math.sin(rad)*(r*0.38)}
x2={cx + Math.cos(rad)*r} y2={cy + Math.sin(rad)*r}
stroke={stroke} strokeWidth={1.2} />;
})}
<text x={cx} y={cy+3} textAnchor="middle" fontSize={r*0.55} fill={stroke} fontFamily="Georgia,serif" fontWeight="bold">V</text>
</g>
);
}

// ── Stair symbol (architectural plan view) ───────────────────────────────────
function StairSymbol({ el, selected, onClick }) {
const x = Math.min(el.x1, el.x2), y = Math.min(el.y1, el.y2);
const w = Math.abs(el.x2 - el.x1), h = Math.abs(el.y2 - el.y1);
if (w < 4 || h < 4) return null;
const steps = el.steps || 8;
const stroke = selected ? “#1d4ed8” : “#2c2416”;
const isVertical = h >= w; // step lines run horizontally when stair is taller
const lines = [];
for (let i = 0; i <= steps; i++) {
const t = i / steps;
if (isVertical) {
const ly = y + t * h;
lines.push(<line key={i} x1={x} y1={ly} x2={x + w} y2={ly} stroke={stroke} strokeWidth={i === 0 || i === steps ? 2.5 : 1} />);
} else {
const lx = x + t * w;
lines.push(<line key={i} x1={lx} y1={y} x2={lx} y2={y + h} stroke={stroke} strokeWidth={i === 0 || i === steps ? 2.5 : 1} />);
}
}
// Arrow indicating direction (up)
const arrowX = x + w / 2, arrowY1 = isVertical ? y + h * 0.85 : y + h / 2;
const arrowY2 = isVertical ? y + h * 0.15 : y + h / 2;
const arrowX1 = isVertical ? x + w / 2 : x + w * 0.85;
const arrowX2 = isVertical ? x + w / 2 : x + w * 0.15;

return (
<g onClick={onClick} style={{ cursor:“pointer” }}>
<rect x={x} y={y} width={w} height={h} fill=”#f0ebe0” fillOpacity={0.6}
stroke={stroke} strokeWidth={selected ? 2.5 : 1.5}
strokeDasharray={selected ? “none” : “none”} />
{lines}
{/* Direction arrow */}
{isVertical ? (
<line x1={arrowX} y1={arrowY1} x2={arrowX} y2={arrowY2} stroke={stroke} strokeWidth={1.5} markerEnd={`url(#arrowhead-${el.id??'pre'})`} />
) : (
<line x1={arrowX1} y1={y+h/2} x2={arrowX2} y2={y+h/2} stroke={stroke} strokeWidth={1.5} markerEnd={`url(#arrowhead-${el.id??'pre'})`} />
)}
{/* UP label */}
{w > 30 && h > 20 && (
<text
x={isVertical ? x + w / 2 : x + w * 0.75}
y={isVertical ? y + h * 0.92 : y + h / 2 + 4}
textAnchor=“middle” fontSize={Math.min(9, Math.min(w, h) * 0.18)}
fill={stroke} fontFamily=“Georgia,serif” fontStyle=“italic”>upp</text>
)}
</g>
);
}

function TextEl({ el, selected, onClick, onDblClick }) {
return (
<g onClick={onClick} onDoubleClick={onDblClick} style={{ cursor:“pointer” }}>
{selected && <rect x={el.x-4} y={el.y - el.size - 2} width={el.text.length * el.size * 0.65 + 8} height={el.size + 8} fill=“none” stroke=”#1d4ed8” strokeWidth={1} strokeDasharray=“4 2” rx={2} />}
<text x={el.x} y={el.y} fontSize={el.size} fill={el.color || “#2c2416”} fontFamily=“Georgia,serif” fontWeight={el.bold ? “bold” : “normal”} fontStyle={el.italic ? “italic” : “normal”}>
{el.text}
</text>
</g>
);
}

export default function App() {
const svgRef = useRef(null);
const [tool, setTool] = useState(“wall”);
const [histState, dispatch] = useReducer(historyReducer, { past:[], present:[], future:[] });
const elements = histState.present;
const setElements = useCallback((fn) => {
dispatch({ type:“SET”, elements: typeof fn === “function” ? fn(histState.present) : fn });
}, [histState.present]);

const [drawing, setDrawing]     = useState(null);
const [selected, setSelected]   = useState(null);
const [roomColor, setRoomColor] = useState(ROOM_COLORS[0]);
const [roomLabel, setRoomLabel] = useState(ROOM_NAMES[0]);
const [customLabel, setCustomLabel] = useState(””);
const [wallThick, setWallThick] = useState(6);
const [stairSteps, setStairSteps] = useState(8);
const [textSize, setTextSize]   = useState(14);
const [textColor, setTextColor] = useState(”#2c2416”);
const [textBold, setTextBold]   = useState(false);
const [textItalic, setTextItalic] = useState(false);
const [showGrid, setShowGrid]   = useState(true);
const [zoom, setZoom]           = useState(1);
const [pan, setPan]             = useState({ x:60, y:60 });
const [showPanel, setShowPanel] = useState(false);
const [isMobile, setIsMobile]   = useState(false);
const [editingText, setEditingText] = useState(null); // { id, value }
const touchState = useRef({});

useEffect(() => {
const check = () => setIsMobile(window.innerWidth < 768);
check();
window.addEventListener(“resize”, check);
return () => window.removeEventListener(“resize”, check);
}, []);

const getSVGPoint = useCallback((cx, cy) => {
const rect = svgRef.current.getBoundingClientRect();
return { x: snap((cx - rect.left - pan.x) / zoom), y: snap((cy - rect.top - pan.y) / zoom) };
}, [pan, zoom]);

const getSVGPointFree = useCallback((cx, cy) => {
const rect = svgRef.current.getBoundingClientRect();
return { x: (cx - rect.left - pan.x) / zoom, y: (cy - rect.top - pan.y) / zoom };
}, [pan, zoom]);

// ── Keyboard shortcuts ────────────────────────────────────────────────────
useEffect(() => {
const h = (e) => {
const tag = document.activeElement.tagName;
if (tag === “INPUT” || tag === “TEXTAREA”) return;
if ((e.metaKey || e.ctrlKey) && e.key === “z” && !e.shiftKey) { dispatch({ type:“UNDO” }); setSelected(null); }
if ((e.metaKey || e.ctrlKey) && (e.key === “y” || (e.key === “z” && e.shiftKey))) { dispatch({ type:“REDO” }); setSelected(null); }
if ((e.key === “Delete” || e.key === “Backspace”) && selected !== null) deleteSelected();
};
window.addEventListener(“keydown”, h);
return () => window.removeEventListener(“keydown”, h);
}, [selected, histState]);

// ── Mouse ─────────────────────────────────────────────────────────────────
const onMouseDown = (e) => {
if (e.button !== 0) return;
if (e.altKey || e.metaKey) {
touchState.current = { mode:“pan”, base:{ x: e.clientX - pan.x, y: e.clientY - pan.y } };
return;
}
startDraw(e.clientX, e.clientY);
};
const onMouseMove = (e) => {
if (touchState.current.mode === “pan”) {
setPan({ x: e.clientX - touchState.current.base.x, y: e.clientY - touchState.current.base.y });
return;
}
updateDraw(e.clientX, e.clientY);
};
const onMouseUp   = () => { if (touchState.current.mode === “pan”) { touchState.current = {}; return; } commitDraw(); };
const onWheel     = (e) => { e.preventDefault(); setZoom(z => Math.min(5, Math.max(0.15, z * (1 - e.deltaY * 0.001)))); };

// ── Touch ─────────────────────────────────────────────────────────────────
const onTouchStart = (e) => {
e.preventDefault();
if (e.touches.length === 2) {
touchState.current = { mode:“pinch”,
pinchDist: Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY),
midBase:{ x:(e.touches[0].clientX+e.touches[1].clientX)/2 - pan.x, y:(e.touches[0].clientY+e.touches[1].clientY)/2 - pan.y },
zoomBase: zoom };
setDrawing(null); return;
}
touchState.current = { mode:“draw” };
startDraw(e.touches[0].clientX, e.touches[0].clientY);
};
const onTouchMove = (e) => {
e.preventDefault();
if (e.touches.length === 2 && touchState.current.mode === “pinch”) {
const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
const midX = (e.touches[0].clientX+e.touches[1].clientX)/2, midY = (e.touches[0].clientY+e.touches[1].clientY)/2;
setZoom(Math.min(5, Math.max(0.15, touchState.current.zoomBase * (dist / touchState.current.pinchDist))));
setPan({ x: midX - touchState.current.midBase.x, y: midY - touchState.current.midBase.y });
return;
}
if (e.touches.length === 1) updateDraw(e.touches[0].clientX, e.touches[0].clientY);
};
const onTouchEnd = (e) => { e.preventDefault(); if (touchState.current.mode === “pinch”) { touchState.current={}; return; } commitDraw(); };

// ── Draw ──────────────────────────────────────────────────────────────────
const effectiveLabel = customLabel.trim() || roomLabel;

const startDraw = (cx, cy) => {
if (tool === “select” || tool === “erase”) return;
if (tool === “text”) {
const pt = getSVGPointFree(cx, cy);
const newEl = { id:newId(), type:“text”, x:pt.x, y:pt.y, text:“Text”, size:textSize, color:textColor, bold:textBold, italic:textItalic };
setElements(p => […p, newEl]);
setEditingText({ id:newEl.id, value:“Text” });
return;
}
const pt = getSVGPoint(cx, cy);
setDrawing({ type:tool, x1:pt.x, y1:pt.y, x2:pt.x, y2:pt.y,
color:roomColor, label:effectiveLabel, thick:wallThick, steps:stairSteps });
};
const updateDraw = (cx, cy) => {
if (!drawing) return;
const pt = getSVGPoint(cx, cy);
setDrawing(d => d ? { …d, x2:pt.x, y2:pt.y } : null);
};
const commitDraw = () => {
if (!drawing) return;
const { x1,y1,x2,y2 } = drawing;
if (Math.abs(x2-x1) > 4 || Math.abs(y2-y1) > 4) {
setElements(p => […p, { …drawing, id:newId() }]);
}
setDrawing(null);
};

const deleteSelected = () => {
if (selected !== null) { setElements(p => p.filter(e => e.id !== selected)); setSelected(null); }
};

// ── Render element ────────────────────────────────────────────────────────
const renderEl = (el, preview=false) => {
const key = el.id ?? “preview”;
const sel = el.id === selected;
const click = (e) => {
e.stopPropagation();
if (tool===“erase”) setElements(p => p.filter(x => x.id !== el.id));
else if (tool===“select”) setSelected(el.id);
};

```
if (el.type === "room") {
  const x=Math.min(el.x1,el.x2), y=Math.min(el.y1,el.y2), w=Math.abs(el.x2-el.x1), h=Math.abs(el.y2-el.y1);
  const area = ((w*h)/(GRID*GRID*10)).toFixed(1);
  return (
    <g key={key} onClick={click} style={{ cursor:"pointer" }}>
      <rect x={x} y={y} width={w} height={h} fill={el.color} fillOpacity={0.5}
        stroke={sel?"#1d4ed8":"#7c6a4e"} strokeWidth={sel?3:1.5}
        strokeDasharray={preview?"8 4":"none"} rx={2} />
      {w>60&&h>30&&<>
        <text x={x+w/2} y={y+h/2-5} textAnchor="middle" fontSize={11} fill="#3d3020" fontFamily="Georgia,serif" fontWeight="700">{el.label}</text>
        <text x={x+w/2} y={y+h/2+10} textAnchor="middle" fontSize={9} fill="#7c6a4e" fontFamily="Georgia,serif">{area} m²</text>
      </>}
    </g>
  );
}
if (el.type === "wall") {
  const len = Math.hypot(el.x2-el.x1, el.y2-el.y1);
  const t = el.thick || 6;
  return (
    <g key={key} onClick={click}>
      <line x1={el.x1} y1={el.y1} x2={el.x2} y2={el.y2} stroke="transparent" strokeWidth={Math.max(20,t+14)} style={{ cursor:"pointer" }} />
      <line x1={el.x1} y1={el.y1} x2={el.x2} y2={el.y2} stroke={sel?"#1d4ed8":"#2c2416"} strokeWidth={t} strokeLinecap="square" strokeDasharray={preview?"10 5":"none"} />
      {len>50&&!preview&&<text x={(el.x1+el.x2)/2} y={(el.y1+el.y2)/2-Math.max(5,t/2+2)} textAnchor="middle" fontSize={8} fill="#9a8872" fontFamily="monospace">{(len/(GRID*2)).toFixed(1)} m</text>}
    </g>
  );
}
if (el.type === "door") {
  return <DoorArch key={key} el={el} selected={sel} onClick={click} wallThick={el.thick||6} />;
}
if (el.type === "window") {
  return (
    <g key={key} onClick={click} style={{ cursor:"pointer" }}>
      <line x1={el.x1} y1={el.y1} x2={el.x2} y2={el.y2} stroke="transparent" strokeWidth={16} />
      <line x1={el.x1} y1={el.y1} x2={el.x2} y2={el.y2} stroke={sel?"#1d4ed8":"#2c2416"} strokeWidth={6} strokeLinecap="square" strokeDasharray={preview?"8 4":"none"} />
      <line x1={el.x1} y1={el.y1} x2={el.x2} y2={el.y2} stroke="#93c5fd" strokeWidth={2.5} strokeLinecap="square" />
      <line x1={(el.x1+el.x2)/2} y1={(el.y1+el.y2)/2-4} x2={(el.x1+el.x2)/2} y2={(el.y1+el.y2)/2+4} stroke="#93c5fd" strokeWidth={2} />
    </g>
  );
}
if (el.type === "stair") {
  return <StairSymbol key={key} el={el} selected={sel} onClick={click} />;
}
if (el.type === "vent") {
  return <VentSymbol key={key} el={el} selected={sel} onClick={click} />;
}
if (el.type === "text") {
  if (editingText && editingText.id === el.id) return null;
  return <TextEl key={key} el={el} selected={sel} onClick={click}
    onDblClick={(e) => { e.stopPropagation(); setSelected(el.id); setEditingText({ id:el.id, value:el.text }); }} />;
}
return null;
```

};

// ── Text editing overlay ──────────────────────────────────────────────────
const commitText = () => {
if (!editingText) return;
setElements(p => p.map(e => e.id===editingText.id ? { …e, text:editingText.value||“Text” } : e));
setEditingText(null);
};

const getTextEditorPos = () => {
if (!editingText) return null;
const el = elements.find(e => e.id===editingText.id);
if (!el) return null;
const rect = svgRef.current?.getBoundingClientRect();
if (!rect) return null;
return { left: rect.left + el.x * zoom + pan.x, top: rect.top + el.y * zoom + pan.y - el.size * zoom };
};

const rooms  = elements.filter(e => e.type===“room”);
const others = elements.filter(e => e.type!==“room”);
const canUndo = histState.past.length > 0;
const canRedo = histState.future.length > 0;

// ── Sidebar section ───────────────────────────────────────────────────────
const SideSection = ({ title, children }) => (
<div style={{ borderTop:“1px solid #c4b49a”, paddingTop:8, marginTop:4 }}>
<div style={{ fontSize:9, letterSpacing:2, color:”#9a8872”, fontWeight:“bold”, marginBottom:6 }}>{title}</div>
{children}
</div>
);

return (
<div style={{ display:“flex”, flexDirection:“column”, height:“100vh”, background:”#f5f0e8”, fontFamily:“Georgia,serif”, overflow:“hidden” }}>

```
  {/* ── Top bar ── */}
  <div style={{ background:"#2c2416", color:"#e8d5b7", padding: isMobile?"8px 10px":"9px 18px", display:"flex", alignItems:"center", gap:8, flexShrink:0, boxShadow:"0 2px 10px rgba(0,0,0,0.4)" }}>
    <div>
      <div style={{ fontSize:isMobile?13:16, fontWeight:"bold", letterSpacing:2 }}>PLANLÖSNING</div>
      {!isMobile&&<div style={{ fontSize:9, color:"#9a8872", letterSpacing:1 }}>Arkitektverktyg</div>}
    </div>
    <div style={{ flex:1 }} />

    {/* Undo / Redo */}
    <button onClick={() => { dispatch({type:"UNDO"}); setSelected(null); }} disabled={!canUndo}
      title="Ångra (Ctrl+Z)"
      style={{ ...hdrBtn("#4a4030"), opacity:canUndo?1:0.35, fontSize:15, padding:"4px 9px" }}>↩</button>
    <button onClick={() => { dispatch({type:"REDO"}); setSelected(null); }} disabled={!canRedo}
      title="Gör om (Ctrl+Y)"
      style={{ ...hdrBtn("#4a4030"), opacity:canRedo?1:0.35, fontSize:15, padding:"4px 9px" }}>↪</button>

    {!isMobile&&(
      <label style={{ display:"flex", alignItems:"center", gap:4, fontSize:11, color:"#b7a99a", cursor:"pointer" }}>
        <input type="checkbox" checked={showGrid} onChange={e=>setShowGrid(e.target.checked)} /> Rutnät
      </label>
    )}
    <button onClick={() => { setZoom(1); setPan({x:60,y:60}); }} style={hdrBtn("#4a5a3a")}>{isMobile?"⊡":"Återställ"}</button>
    <button onClick={() => { setElements([]); setSelected(null); }} style={hdrBtn("#7c4a3a")}>{isMobile?"🗑":"Rensa"}</button>
    {isMobile&&(
      <button onClick={() => setShowPanel(p=>!p)} style={{ ...hdrBtn("#5a4a2a"), background:showPanel?"#8b6a3a":"#5a4a2a" }}>⚙</button>
    )}
  </div>

  {/* ── Mobile panel ── */}
  {isMobile&&showPanel&&(
    <div style={{ background:"#ede6d6", borderBottom:"2px solid #c4b49a", padding:"10px 14px", display:"flex", flexDirection:"column", gap:8, flexShrink:0, maxHeight:"45vh", overflowY:"auto" }}>
      {tool==="stair"&&(
        <div>
          <div style={{ fontSize:10, letterSpacing:2, color:"#9a8872", fontWeight:"bold", marginBottom:4 }}>ANTAL STEG</div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>
            {STAIR_STEPS.map(s=>(
              <button key={s} onClick={()=>setStairSteps(s)} style={{ padding:"5px 10px", fontSize:11, borderRadius:3, border:"1.5px solid", fontFamily:"Georgia,serif", cursor:"pointer", background:stairSteps===s?"#2c2416":"#d5c9b5", color:stairSteps===s?"#e8d5b7":"#4a3f2f", borderColor:stairSteps===s?"#6d5a3f":"#b4a48c" }}>{s}</button>
            ))}
          </div>
        </div>
      )}
      {(tool==="wall"||tool==="door")&&(
        <div>
          <div style={{ fontSize:10, letterSpacing:2, color:"#9a8872", fontWeight:"bold", marginBottom:4 }}>VÄGGTJOCKLEK</div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>
            {WALL_SIZES.map(s=>(
              <button key={s.v} onClick={()=>setWallThick(s.v)} style={{ padding:"4px 8px", fontSize:10, borderRadius:3, border:"1.5px solid", fontFamily:"Georgia,serif", background:wallThick===s.v?"#2c2416":"#d5c9b5", color:wallThick===s.v?"#e8d5b7":"#4a3f2f", borderColor:wallThick===s.v?"#6d5a3f":"#b4a48c" }}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {tool==="room"&&(
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
            {ROOM_COLORS.map(c=>(
              <div key={c} onClick={()=>setRoomColor(c)} style={{ width:28,height:28, background:c, border:roomColor===c?"2.5px solid #2c2416":"1.5px solid #b4a48c", borderRadius:4, cursor:"pointer" }} />
            ))}
          </div>
          <div style={{ display:"flex", gap:6 }}>
            <select value={roomLabel} onChange={e=>{setRoomLabel(e.target.value);setCustomLabel("");}} style={selectSty}>
              {ROOM_NAMES.map(n=><option key={n} value={n}>{n}</option>)}
            </select>
            <input value={customLabel} onChange={e=>setCustomLabel(e.target.value)} placeholder="Eget namn..." style={inputSty} />
          </div>
        </div>
      )}
      {tool==="text"&&(
        <div style={{ display:"flex", flexWrap:"wrap", gap:8, alignItems:"center" }}>
          <div>
            <div style={{ fontSize:10, color:"#9a8872", marginBottom:3 }}>STORLEK</div>
            <select value={textSize} onChange={e=>setTextSize(+e.target.value)} style={selectSty}>
              {TEXT_SIZES.map(s=><option key={s} value={s}>{s}px</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize:10, color:"#9a8872", marginBottom:3 }}>FÄRG</div>
            <input type="color" value={textColor} onChange={e=>setTextColor(e.target.value)} style={{ width:36, height:30, border:"1px solid #b4a48c", borderRadius:3, padding:0, cursor:"pointer" }} />
          </div>
          <label style={{ display:"flex", alignItems:"center", gap:4, fontSize:11, cursor:"pointer" }}>
            <input type="checkbox" checked={textBold} onChange={e=>setTextBold(e.target.checked)} /> <b>Fet</b>
          </label>
          <label style={{ display:"flex", alignItems:"center", gap:4, fontSize:11, cursor:"pointer" }}>
            <input type="checkbox" checked={textItalic} onChange={e=>setTextItalic(e.target.checked)} /> <i>Kursiv</i>
          </label>
        </div>
      )}
    </div>
  )}

  <div style={{ display:"flex", flex:1, overflow:"hidden" }}>

    {/* ── Desktop sidebar ── */}
    {!isMobile&&(
      <div style={{ width:188, background:"#ede6d6", borderRight:"1px solid #c4b49a", padding:"12px 10px", display:"flex", flexDirection:"column", gap:7, flexShrink:0, overflowY:"auto" }}>
        <div style={{ fontSize:9, letterSpacing:2, color:"#9a8872", fontWeight:"bold" }}>VERKTYG</div>
        {TOOLS.map(t=>(
          <button key={t.id} onClick={()=>setTool(t.id)} style={{
            display:"flex", alignItems:"center", gap:7, padding:"7px 9px",
            borderRadius:4, cursor:"pointer", fontFamily:"Georgia,serif",
            border:"1.5px solid", transition:"all 0.12s", width:"100%",
            background:tool===t.id?"#2c2416":"#d5c9b5",
            color:tool===t.id?"#e8d5b7":"#4a3f2f",
            borderColor:tool===t.id?"#6d5a3f":"#b4a48c",
          }}>
            <span style={{ fontSize:14, fontFamily:t.id==="text"?"Georgia,serif":"inherit" }}>{t.icon}</span>
            <span style={{ fontSize:11 }}>{t.label}</span>
          </button>
        ))}

        {/* Wall thickness */}
        {(tool==="wall"||tool==="door")&&(
          <SideSection title="VÄGGTJOCKLEK">
            {WALL_SIZES.map(s=>(
              <button key={s.v} onClick={()=>setWallThick(s.v)} style={{
                display:"block", width:"100%", textAlign:"left", padding:"5px 8px", marginBottom:3,
                fontSize:10, borderRadius:3, border:"1.5px solid", fontFamily:"Georgia,serif",
                background:wallThick===s.v?"#2c2416":"#d5c9b5",
                color:wallThick===s.v?"#e8d5b7":"#4a3f2f",
                borderColor:wallThick===s.v?"#6d5a3f":"#b4a48c", cursor:"pointer",
              }}>{s.label}</button>
            ))}
          </SideSection>
        )}

        {/* Stair options */}
        {tool==="stair"&&(
          <SideSection title="ANTAL STEG">
            <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>
              {STAIR_STEPS.map(s=>(
                <button key={s} onClick={()=>setStairSteps(s)} style={{
                  padding:"4px 8px", fontSize:11, borderRadius:3, border:"1.5px solid", fontFamily:"Georgia,serif", cursor:"pointer",
                  background:stairSteps===s?"#2c2416":"#d5c9b5",
                  color:stairSteps===s?"#e8d5b7":"#4a3f2f",
                  borderColor:stairSteps===s?"#6d5a3f":"#b4a48c",
                }}>{s}</button>
              ))}
            </div>
            <div style={{ fontSize:9, color:"#9a8872", marginTop:6, lineHeight:1.6 }}>
              Dra ut en rektangel.<br />Pilens riktning = uppåt.
            </div>
          </SideSection>
        )}

        {/* Room options */}
        {tool==="room"&&(
          <SideSection title="RUM">
            <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginBottom:6 }}>
              {ROOM_COLORS.map(c=>(
                <div key={c} onClick={()=>setRoomColor(c)} style={{ width:20,height:20, background:c, border:roomColor===c?"2.5px solid #2c2416":"1.5px solid #b4a48c", borderRadius:3, cursor:"pointer" }} />
              ))}
            </div>
            <select value={roomLabel} onChange={e=>{setRoomLabel(e.target.value);setCustomLabel("");}} style={{ ...selectSty, width:"100%", marginBottom:4 }}>
              {ROOM_NAMES.map(n=><option key={n} value={n}>{n}</option>)}
            </select>
            <input value={customLabel} onChange={e=>setCustomLabel(e.target.value)} placeholder="Eget namn..." style={{ ...inputSty, width:"100%", boxSizing:"border-box" }} />
          </SideSection>
        )}

        {/* Text options */}
        {tool==="text"&&(
          <SideSection title="TEXT">
            <div style={{ fontSize:10, color:"#9a8872", marginBottom:3 }}>Storlek</div>
            <select value={textSize} onChange={e=>setTextSize(+e.target.value)} style={{ ...selectSty, width:"100%", marginBottom:6 }}>
              {TEXT_SIZES.map(s=><option key={s} value={s}>{s} px</option>)}
            </select>
            <div style={{ fontSize:10, color:"#9a8872", marginBottom:3 }}>Färg</div>
            <input type="color" value={textColor} onChange={e=>setTextColor(e.target.value)} style={{ width:"100%", height:30, border:"1px solid #b4a48c", borderRadius:3, padding:0, cursor:"pointer", marginBottom:6 }} />
            <label style={{ display:"flex", alignItems:"center", gap:5, fontSize:11, cursor:"pointer", marginBottom:3 }}>
              <input type="checkbox" checked={textBold} onChange={e=>setTextBold(e.target.checked)} /> <b>Fet stil</b>
            </label>
            <label style={{ display:"flex", alignItems:"center", gap:5, fontSize:11, cursor:"pointer" }}>
              <input type="checkbox" checked={textItalic} onChange={e=>setTextItalic(e.target.checked)} /> <i>Kursiv stil</i>
            </label>
          </SideSection>
        )}

        {selected&&(
          <button onClick={deleteSelected} style={{ display:"flex", alignItems:"center", gap:7, padding:"7px 9px", borderRadius:4, cursor:"pointer", fontFamily:"Georgia,serif", border:"1.5px solid #7c4a3a", background:"#7c4a3a", color:"#e8d5b7", marginTop:4 }}>
            <span>✕</span><span style={{ fontSize:11 }}>Ta bort vald</span>
          </button>
        )}

        <div style={{ flex:1 }} />
        <div style={{ fontSize:9, color:"#9a8872", lineHeight:1.9 }}>
          <div>Scrolla → zooma</div>
          <div>Alt+drag → panorera</div>
          <div>Ctrl+Z / Y → ångra/gör om</div>
          <div>Dubbelklick text → redigera</div>
          <div>Del → radera vald</div>
        </div>
      </div>
    )}

    {/* ── SVG Canvas ── */}
    <div style={{ flex:1, position:"relative", overflow:"hidden" }}>
      <svg ref={svgRef} style={{ width:"100%", height:"100%", background:"#faf6ef", display:"block", touchAction:"none" }}
        onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
        onWheel={onWheel}
        onClick={() => { if(tool==="select") setSelected(null); }}
      >
        <defs>
          <pattern id="g1" width={GRID} height={GRID} patternUnits="userSpaceOnUse"
            patternTransform={`translate(${pan.x%(GRID*zoom)} ${pan.y%(GRID*zoom)}) scale(${zoom})`}>
            <path d={`M ${GRID} 0 L 0 0 0 ${GRID}`} fill="none" stroke="#d5cbbf" strokeWidth="0.5" />
          </pattern>
          <pattern id="g5" width={GRID*5} height={GRID*5} patternUnits="userSpaceOnUse"
            patternTransform={`translate(${pan.x%(GRID*5*zoom)} ${pan.y%(GRID*5*zoom)}) scale(${zoom})`}>
            <path d={`M ${GRID*5} 0 L 0 0 0 ${GRID*5}`} fill="none" stroke="#c4b8a8" strokeWidth="1" />
          </pattern>
          {/* Arrowhead markers for stairs */}
          {[...elements, drawing].filter(Boolean).filter(e=>e.type==="stair").map(e=>(
            <marker key={`arrowhead-${e.id??'pre'}`} id={`arrowhead-${e.id??'pre'}`} markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
              <path d="M0,0 L0,6 L6,3 z" fill={e.id===selected?"#1d4ed8":"#2c2416"} />
            </marker>
          ))}
        </defs>
        {showGrid&&<rect width="100%" height="100%" fill="url(#g1)" />}
        {showGrid&&<rect width="100%" height="100%" fill="url(#g5)" />}

        <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
          {rooms.map(el=>renderEl(el))}
          {others.map(el=>renderEl(el))}
          {drawing&&renderEl({...drawing, id:null},true)}
        </g>

        <text x={8} y={18} fontSize={10} fill="#9a8872" fontFamily="monospace">{Math.round(zoom*100)}%</text>
        {canUndo&&<text x={8} y={30} fontSize={8} fill="#b4a48c" fontFamily="monospace">Ctrl+Z ångra</text>}
      </svg>

      {/* ── Inline text editor ── */}
      {editingText&&(()=>{
        const pos = getTextEditorPos();
        const el = elements.find(e=>e.id===editingText.id);
        if (!pos||!el) return null;
        return (
          <input
            autoFocus
            value={editingText.value}
            onChange={e=>setEditingText(t=>({...t, value:e.target.value}))}
            onBlur={commitText}
            onKeyDown={e=>{ if(e.key==="Enter"||e.key==="Escape") commitText(); }}
            style={{
              position:"fixed",
              left: pos.left, top: pos.top,
              fontSize: el.size * zoom,
              fontFamily:"Georgia,serif",
              fontWeight: el.bold?"bold":"normal",
              fontStyle: el.italic?"italic":"normal",
              color: el.color,
              background:"rgba(255,252,245,0.95)",
              border:"1.5px dashed #1d4ed8",
              borderRadius:3, padding:"2px 4px",
              outline:"none", minWidth:60,
              boxShadow:"0 2px 8px rgba(0,0,0,0.15)",
              zIndex:100,
            }}
          />
        );
      })()}
    </div>
  </div>

  {/* ── Mobile bottom toolbar ── */}
  {isMobile&&(
    <div style={{ background:"#2c2416", borderTop:"2px solid #6d5a3f", display:"flex", justifyContent:"space-around", flexShrink:0, paddingBottom:"env(safe-area-inset-bottom)" }}>
      {TOOLS.map(t=>(
        <button key={t.id} onClick={()=>{ setTool(t.id); if(t.id!=="room"&&t.id!=="wall"&&t.id!=="text") setShowPanel(false); }} style={{
          display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:1,
          padding:"7px 2px", flex:1, border:"none", cursor:"pointer",
          background:tool===t.id?"#6d5a3f":"transparent",
          color:tool===t.id?"#e8d5b7":"#9a8872",
          transition:"all 0.12s", borderRight:"1px solid #3d3020",
          fontSize:t.id==="text"?13:undefined
        }}>
          <span style={{ fontSize:16 }}>{t.icon}</span>
          <span style={{ fontSize:7, letterSpacing:0.3 }}>{t.label}</span>
        </button>
      ))}
      <button onClick={deleteSelected} disabled={!selected} style={{
        display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:1,
        padding:"7px 2px", flex:1, border:"none", cursor:selected?"pointer":"default",
        background:selected?"#7c4a3a":"transparent",
        color:selected?"#e8d5b7":"#4a3020"
      }}>
        <span style={{ fontSize:16 }}>🗑</span>
        <span style={{ fontSize:7 }}>Ta bort</span>
      </button>
    </div>
  )}
</div>
```

);
}

const hdrBtn = (bg) => ({
background:bg, color:”#e8d5b7”, border:“none”, padding:“5px 10px”,
fontSize:11, borderRadius:4, cursor:“pointer”, fontFamily:“Georgia,serif”
});
const selectSty = { padding:“4px 6px”, fontSize:11, border:“1px solid #b4a48c”, borderRadius:3, background:”#f5f0e8”, fontFamily:“Georgia,serif” };
const inputSty  = { padding:“4px 6px”, fontSize:11, border:“1px solid #b4a48c”, borderRadius:3, background:”#f5f0e8”, fontFamily:“Georgia,serif” };