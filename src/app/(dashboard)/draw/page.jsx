'use client'
import { useSession } from 'next-auth/react'
import { useRef, useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import { api } from '@/lib/api'

// ── Constants ──────────────────────────────────────────────────────────────────
const PRESET_COLORS = [
  '#000000','#ffffff','#ef4444','#f97316','#eab308','#22c55e',
  '#3b82f6','#8b5cf6','#ec4899','#06b6d4','#64748b','#a3a3a3',
  '#fca5a5','#86efac','#93c5fd','#fde68a','#c4b5fd','#fbcfe8',
]
const TOOLS = [
  { id:'select',  label:'Select',  icon:'↖' },
  { id:'pen',     label:'Pen',     icon:'✏️' },
  { id:'line',    label:'Line',    icon:'╱' },
  { id:'rect',    label:'Rect',    icon:'▭' },
  { id:'ellipse', label:'Ellipse', icon:'⬭' },
  { id:'arrow',   label:'Arrow',   icon:'→' },
  { id:'text',    label:'Text',    icon:'T' },
  { id:'fill',    label:'Bucket',  icon:'🪣' },
  { id:'eraser',  label:'Eraser',  icon:'⌫' },
  { id:'chart',   label:'Chart',   icon:'📊' },
]
const ANIMATIONS = ['none','pulse','float','spin']
const CHART_TYPES = [
  { id:'bar',     label:'Bar',     icon:'📊', st:'chart_bar'     },
  { id:'hbar',    label:'H. Bar',  icon:'📉', st:'chart_hbar'    },
  { id:'line',    label:'Line',    icon:'📈', st:'chart_line'    },
  { id:'area',    label:'Area',    icon:'🌊', st:'chart_area'    },
  { id:'pie',     label:'Pie',     icon:'🥧', st:'chart_pie'     },
  { id:'donut',   label:'Donut',   icon:'🍩', st:'chart_donut'   },
  { id:'scatter', label:'Scatter', icon:'✦',  st:'chart_scatter' },
  { id:'radar',   label:'Radar',   icon:'🕸', st:'chart_radar'   },
]

let _sid = 0
const newId = () => `s${Date.now()}_${++_sid}`
const isChart = t => t?.startsWith('chart_')

// ── Flood fill ─────────────────────────────────────────────────────────────────
function floodFill(ctx, canvas, sx, sy, hexColor) {
  sx = Math.round(sx); sy = Math.round(sy)
  const w = canvas.width, h = canvas.height
  if (sx < 0 || sx >= w || sy < 0 || sy >= h) return
  const imgData = ctx.getImageData(0, 0, w, h)
  const d = imgData.data
  const i0 = (sy * w + sx) * 4
  const [sr, sg, sb, sa] = [d[i0], d[i0+1], d[i0+2], d[i0+3]]
  const fr = parseInt(hexColor.slice(1,3),16)
  const fg = parseInt(hexColor.slice(3,5),16)
  const fb = parseInt(hexColor.slice(5,7),16)
  if (sr===fr && sg===fg && sb===fb) return
  const match = i => Math.abs(d[i]-sr)<32&&Math.abs(d[i+1]-sg)<32&&Math.abs(d[i+2]-sb)<32&&Math.abs(d[i+3]-sa)<32
  const visited = new Uint8Array(w*h)
  const stack = [sy*w+sx]; visited[sy*w+sx]=1
  while (stack.length) {
    const pos=stack.pop(), x=pos%w, y=(pos/w)|0, i=pos*4
    d[i]=fr; d[i+1]=fg; d[i+2]=fb; d[i+3]=255
    if (x>0   &&!visited[pos-1]&&match((pos-1)*4)){visited[pos-1]=1;stack.push(pos-1)}
    if (x<w-1 &&!visited[pos+1]&&match((pos+1)*4)){visited[pos+1]=1;stack.push(pos+1)}
    if (y>0   &&!visited[pos-w]&&match((pos-w)*4)){visited[pos-w]=1;stack.push(pos-w)}
    if (y<h-1 &&!visited[pos+w]&&match((pos+w)*4)){visited[pos+w]=1;stack.push(pos+w)}
  }
  ctx.putImageData(imgData, 0, 0)
}

// ── Geometry ──────────────────────────────────────────────────────────────────
function getBBox(s) {
  switch (s.type) {
    case 'rect':         return { x:s.x, y:s.y, w:s.w, h:s.h }
    case 'ellipse':      return { x:s.cx-Math.abs(s.rx), y:s.cy-Math.abs(s.ry), w:Math.abs(s.rx)*2, h:Math.abs(s.ry)*2 }
    case 'line':
    case 'arrow':        return { x:Math.min(s.x1,s.x2), y:Math.min(s.y1,s.y2), w:Math.abs(s.x2-s.x1)||1, h:Math.abs(s.y2-s.y1)||1 }
    case 'pen': {
      if (!s.points?.length) return {x:0,y:0,w:1,h:1}
      const xs=s.points.map(p=>p.x), ys=s.points.map(p=>p.y)
      const mx=Math.min(...xs), my=Math.min(...ys)
      return {x:mx,y:my,w:Math.max(...xs)-mx||1,h:Math.max(...ys)-my||1}
    }
    case 'text':         return { x:s.x, y:s.y-(s.fontSize||18), w:(s.text?.length||1)*(s.fontSize||18)*0.62, h:(s.fontSize||18)*1.3 }
    case 'chart_bar':
    case 'chart_hbar':
    case 'chart_line':
    case 'chart_area':
    case 'chart_scatter': return { x:s.x, y:s.y, w:s.w, h:s.h }
    case 'chart_pie':
    case 'chart_donut':
    case 'chart_radar':   return { x:s.cx-s.r, y:s.cy-s.r, w:s.r*2, h:s.r*2 }
    default:              return {x:0,y:0,w:1,h:1}
  }
}
function getCenter(s) { const b=getBBox(s); return {x:b.x+b.w/2,y:b.y+b.h/2} }
function hitTest(s, x, y) {
  const pad=Math.max(10,(s.strokeWidth||2)+4)
  if (s.type==='ellipse') {
    const rx=Math.max(s.rx,1), ry=Math.max(s.ry,1)
    return ((x-s.cx)/rx)**2+((y-s.cy)/ry)**2<=1.2
  }
  if (s.type==='line'||s.type==='arrow') {
    const dx=s.x2-s.x1, dy=s.y2-s.y1, len2=dx*dx+dy*dy
    if (!len2) return false
    const t=Math.max(0,Math.min(1,((x-s.x1)*dx+(y-s.y1)*dy)/len2))
    const px=s.x1+t*dx-x, py=s.y1+t*dy-y
    return px*px+py*py<pad*pad
  }
  const b=getBBox(s)
  return x>=b.x-pad&&x<=b.x+b.w+pad&&y>=b.y-pad&&y<=b.y+b.h+pad
}
function moveShape(s, dx, dy) {
  switch (s.type) {
    case 'rect':          return {...s,x:s.x+dx,y:s.y+dy}
    case 'ellipse':       return {...s,cx:s.cx+dx,cy:s.cy+dy}
    case 'line':
    case 'arrow':         return {...s,x1:s.x1+dx,y1:s.y1+dy,x2:s.x2+dx,y2:s.y2+dy}
    case 'pen':           return {...s,points:s.points.map(p=>({x:p.x+dx,y:p.y+dy}))}
    case 'text':          return {...s,x:s.x+dx,y:s.y+dy}
    case 'chart_bar':
    case 'chart_hbar':
    case 'chart_line':
    case 'chart_area':
    case 'chart_scatter': return {...s,x:s.x+dx,y:s.y+dy}
    case 'chart_pie':
    case 'chart_donut':
    case 'chart_radar':   return {...s,cx:s.cx+dx,cy:s.cy+dy}
    default:              return s
  }
}

// ── Chart helpers ─────────────────────────────────────────────────────────────
function chartBg(ctx, x, y, w, h, title) {
  ctx.fillStyle='#f8fafc'; ctx.fillRect(x,y,w,h)
  ctx.strokeStyle='#e2e8f0'; ctx.lineWidth=1; ctx.strokeRect(x,y,w,h)
  if (title) {
    ctx.fillStyle='#1e293b'; ctx.font='bold 13px sans-serif'
    ctx.textAlign='center'; ctx.textBaseline='top'; ctx.fillText(title,x+w/2,y+6)
    ctx.textBaseline='alphabetic'
  }
}
function gridH(ctx, x, y, cw, ch, top, left, maxVal) {
  for (let i=0;i<=4;i++) {
    const gy=y+top+ch-(i/4)*ch
    ctx.strokeStyle='#e2e8f0'; ctx.lineWidth=0.5
    ctx.beginPath(); ctx.moveTo(x+left,gy); ctx.lineTo(x+left+cw,gy); ctx.stroke()
    ctx.fillStyle='#94a3b8'; ctx.font='9px sans-serif'; ctx.textAlign='right'
    ctx.fillText(Math.round(maxVal*i/4),x+left-3,gy+3)
  }
  ctx.strokeStyle='#cbd5e1'; ctx.lineWidth=1
  ctx.beginPath(); ctx.moveTo(x+left,y+top); ctx.lineTo(x+left,y+top+ch); ctx.stroke()
}

// ── Bar Chart ────────────────────────────────────────────────────────────────
function drawBarChart(ctx, s, p=1) {
  const {x,y,w,h,data=[],title=''}=s; if(!data.length) return
  const maxVal=Math.max(...data.map(d=>d.value),1)
  const top=title?30:12, bot=30, left=40, right=12
  const cw=w-left-right, ch=h-top-bot
  chartBg(ctx,x,y,w,h,title); gridH(ctx,x,y,cw,ch,top,left,maxVal)
  const n=data.length, gap=cw/n, bw=gap*0.62
  data.forEach((d,i)=>{
    const localP=Math.max(0,Math.min(1,(p-i/n)*n))
    if (localP<=0) return
    const fullBh=Math.max(2,(d.value/maxVal)*ch)
    const bh=fullBh*localP
    const bx=x+left+i*gap+(gap-bw)/2
    const by=y+top+ch-bh
    const col=d.color||`hsl(${i*47},70%,60%)`
    const grad=ctx.createLinearGradient(bx,by,bx,by+bh)
    grad.addColorStop(0,col); grad.addColorStop(1,col+'88')
    ctx.fillStyle=grad; ctx.fillRect(bx,by,bw,bh)
    // rounded top
    ctx.beginPath(); ctx.arc(bx+bw/2,by+2,bw/2,Math.PI,0,false); ctx.fillStyle=col; ctx.fill()
    if (localP>0.85) {
      ctx.fillStyle='#334155'; ctx.font='bold 9px sans-serif'; ctx.textAlign='center'
      ctx.fillText(d.value,bx+bw/2,by-4)
    }
    ctx.fillStyle='#64748b'; ctx.font='9px sans-serif'; ctx.textAlign='center'
    ctx.fillText((d.label||'').substring(0,8),bx+bw/2,y+top+ch+16)
  })
}

// ── Horizontal Bar Chart ─────────────────────────────────────────────────────
function drawHBarChart(ctx, s, p=1) {
  const {x,y,w,h,data=[],title=''}=s; if(!data.length) return
  const maxVal=Math.max(...data.map(d=>d.value),1)
  const top=title?30:12, bot=10, left=66, right=48
  const cw=w-left-right, ch=h-top-bot
  chartBg(ctx,x,y,w,h,title)
  // vertical grid
  for(let i=0;i<=4;i++){
    const gx=x+left+(i/4)*cw
    ctx.strokeStyle='#e2e8f0'; ctx.lineWidth=0.5
    ctx.beginPath(); ctx.moveTo(gx,y+top); ctx.lineTo(gx,y+top+ch); ctx.stroke()
    ctx.fillStyle='#94a3b8'; ctx.font='9px sans-serif'; ctx.textAlign='center'
    ctx.fillText(Math.round(maxVal*i/4),gx,y+top+ch+14)
  }
  ctx.strokeStyle='#cbd5e1'; ctx.lineWidth=1
  ctx.beginPath(); ctx.moveTo(x+left,y+top); ctx.lineTo(x+left,y+top+ch); ctx.stroke()
  const n=data.length, gap=ch/n, bh=gap*0.62
  data.forEach((d,i)=>{
    const localP=Math.max(0,Math.min(1,(p-i/n)*n))
    if (localP<=0) return
    const fullBw=Math.max(2,(d.value/maxVal)*cw)
    const bw=fullBw*localP
    const by=y+top+i*gap+(gap-bh)/2
    const col=d.color||`hsl(${i*47},70%,60%)`
    const grad=ctx.createLinearGradient(x+left,0,x+left+bw,0)
    grad.addColorStop(0,col); grad.addColorStop(1,col+'88')
    ctx.fillStyle=grad; ctx.fillRect(x+left,by,bw,bh)
    ctx.fillStyle='#475569'; ctx.font='9px sans-serif'; ctx.textAlign='right'
    ctx.fillText((d.label||'').substring(0,10),x+left-4,by+bh/2+3)
    if (localP>0.85) {
      ctx.fillStyle='#334155'; ctx.textAlign='left'
      ctx.fillText(d.value,x+left+bw+3,by+bh/2+3)
    }
  })
}

// ── Line Chart ───────────────────────────────────────────────────────────────
function drawLineChart(ctx, s, p=1) {
  const {x,y,w,h,data=[],title=''}=s; if(data.length<2) return
  const maxVal=Math.max(...data.map(d=>d.value),1)
  const top=title?30:12, bot=28, left=40, right=12
  const cw=w-left-right, ch=h-top-bot
  chartBg(ctx,x,y,w,h,title); gridH(ctx,x,y,cw,ch,top,left,maxVal)
  const pts=data.map((d,i)=>({
    px:x+left+i*(cw/(data.length-1)),
    py:y+top+ch-(d.value/maxVal)*ch,
  }))
  const totalSegs=data.length-1
  const segsF=p*totalSegs, fullSegs=Math.floor(segsF), frac=segsF-fullSegs
  ctx.beginPath(); ctx.strokeStyle='#6366f1'; ctx.lineWidth=2.5; ctx.lineJoin='round'
  ctx.moveTo(pts[0].px,pts[0].py)
  for(let i=1;i<=fullSegs&&i<pts.length;i++) ctx.lineTo(pts[i].px,pts[i].py)
  if(fullSegs<totalSegs&&frac>0){
    const a=pts[fullSegs],b=pts[fullSegs+1]
    ctx.lineTo(a.px+(b.px-a.px)*frac,a.py+(b.py-a.py)*frac)
  }
  ctx.stroke()
  // revealed dots + labels
  const revealed=Math.min(pts.length,fullSegs+1+(frac>0.5?1:0))
  for(let i=0;i<revealed;i++){
    ctx.beginPath(); ctx.arc(pts[i].px,pts[i].py,4,0,Math.PI*2)
    ctx.fillStyle='#6366f1'; ctx.fill(); ctx.strokeStyle='#fff'; ctx.lineWidth=1.5; ctx.stroke()
    ctx.fillStyle='#64748b'; ctx.font='9px sans-serif'; ctx.textAlign='center'
    ctx.fillText((data[i].label||'').substring(0,7),pts[i].px,y+top+ch+14)
    if(data[i].value){
      ctx.fillStyle='#334155'; ctx.font='bold 9px sans-serif'
      ctx.fillText(data[i].value,pts[i].px,pts[i].py-8)
    }
  }
}

// ── Area Chart ───────────────────────────────────────────────────────────────
function drawAreaChart(ctx, s, p=1) {
  const {x,y,w,h,data=[],title=''}=s; if(data.length<2) return
  const maxVal=Math.max(...data.map(d=>d.value),1)
  const top=title?30:12, bot=28, left=40, right=12
  const cw=w-left-right, ch=h-top-bot
  chartBg(ctx,x,y,w,h,title); gridH(ctx,x,y,cw,ch,top,left,maxVal)
  const pts=data.map((d,i)=>({
    px:x+left+i*(cw/(data.length-1)),
    py:y+top+ch-(d.value/maxVal)*ch,
  }))
  const totalSegs=data.length-1
  const segsF=p*totalSegs, fullSegs=Math.floor(segsF), frac=segsF-fullSegs
  const vis=[...pts.slice(0,fullSegs+1)]
  if(fullSegs<totalSegs&&frac>0){
    const a=pts[fullSegs],b=pts[fullSegs+1]
    vis.push({px:a.px+(b.px-a.px)*frac,py:a.py+(b.py-a.py)*frac})
  }
  if(vis.length<2) return
  // fill
  ctx.beginPath()
  ctx.moveTo(vis[0].px,y+top+ch)
  vis.forEach(pt=>ctx.lineTo(pt.px,pt.py))
  ctx.lineTo(vis[vis.length-1].px,y+top+ch)
  ctx.closePath()
  const grad=ctx.createLinearGradient(0,y+top,0,y+top+ch)
  grad.addColorStop(0,'rgba(99,102,241,0.45)'); grad.addColorStop(1,'rgba(99,102,241,0.03)')
  ctx.fillStyle=grad; ctx.fill()
  // line
  ctx.beginPath(); ctx.strokeStyle='#6366f1'; ctx.lineWidth=2.5; ctx.lineJoin='round'
  vis.forEach((pt,i)=>i===0?ctx.moveTo(pt.px,pt.py):ctx.lineTo(pt.px,pt.py))
  ctx.stroke()
  // dots
  const revealed=Math.min(pts.length,fullSegs+1+(frac>0.5?1:0))
  for(let i=0;i<revealed;i++){
    ctx.beginPath(); ctx.arc(pts[i].px,pts[i].py,3.5,0,Math.PI*2)
    ctx.fillStyle='#6366f1'; ctx.fill(); ctx.strokeStyle='#fff'; ctx.lineWidth=1.5; ctx.stroke()
    ctx.fillStyle='#64748b'; ctx.font='9px sans-serif'; ctx.textAlign='center'
    ctx.fillText((data[i].label||'').substring(0,7),pts[i].px,y+top+ch+14)
  }
}

// ── Pie Chart ────────────────────────────────────────────────────────────────
function drawPieChart(ctx, s, p=1) {
  const {cx,cy,r,data=[],title=''}=s; if(!data.length) return
  const total=data.reduce((a,d)=>a+Math.max(d.value,0),0)||1
  const maxSweep=Math.PI*2*p
  let angle=-Math.PI/2
  data.forEach((d,i)=>{
    const full=(d.value/total)*Math.PI*2
    const swept=angle+Math.PI/2
    const slice=Math.min(full,Math.max(0,maxSweep-swept))
    if(slice<=0){angle+=full;return}
    ctx.beginPath(); ctx.moveTo(cx,cy)
    ctx.arc(cx,cy,r,angle,angle+slice); ctx.closePath()
    ctx.fillStyle=d.color||`hsl(${i*(360/data.length)},70%,60%)`
    ctx.fill(); ctx.strokeStyle='#fff'; ctx.lineWidth=2; ctx.stroke()
    if(slice>0.28&&full>0.28){
      const mid=angle+slice/2
      ctx.fillStyle='#fff'; ctx.font='bold 10px sans-serif'; ctx.textAlign='center'
      ctx.fillText(Math.round(d.value/total*100)+'%',cx+Math.cos(mid)*r*0.65,cy+Math.sin(mid)*r*0.65+4)
    }
    angle+=full
  })
  if(title){
    ctx.fillStyle='#1e293b'; ctx.font='bold 12px sans-serif'; ctx.textAlign='center'
    ctx.fillText(title,cx,cy+r+18)
  }
  const ly=cy+r+30
  data.forEach((d,i)=>{
    const lx=cx-r+i*(r*2/Math.max(data.length,1))+8
    ctx.fillStyle=d.color||`hsl(${i*(360/data.length)},70%,60%)`; ctx.fillRect(lx,ly,8,8)
    ctx.fillStyle='#475569'; ctx.font='9px sans-serif'; ctx.textAlign='left'
    ctx.fillText((d.label||'').substring(0,8),lx+10,ly+7)
  })
}

// ── Donut Chart ──────────────────────────────────────────────────────────────
function drawDonutChart(ctx, s, p=1) {
  const {cx,cy,r,data=[],title='',innerRatio=0.52}=s; if(!data.length) return
  const total=data.reduce((a,d)=>a+Math.max(d.value,0),0)||1
  const ir=r*innerRatio
  const maxSweep=Math.PI*2*p
  let angle=-Math.PI/2
  data.forEach((d,i)=>{
    const full=(d.value/total)*Math.PI*2
    const swept=angle+Math.PI/2
    const slice=Math.min(full,Math.max(0,maxSweep-swept))
    if(slice<=0){angle+=full;return}
    ctx.beginPath()
    ctx.arc(cx,cy,r,angle,angle+slice)
    ctx.arc(cx,cy,ir,angle+slice,angle,true)
    ctx.closePath()
    ctx.fillStyle=d.color||`hsl(${i*(360/data.length)},70%,60%)`
    ctx.fill(); ctx.strokeStyle='#fff'; ctx.lineWidth=2; ctx.stroke()
    if(slice>0.35){
      const mid=angle+slice/2
      ctx.fillStyle='#fff'; ctx.font='bold 9px sans-serif'; ctx.textAlign='center'
      ctx.fillText(Math.round(d.value/total*100)+'%',cx+Math.cos(mid)*(ir+r)/2,cy+Math.sin(mid)*(ir+r)/2+3)
    }
    angle+=full
  })
  // white hole + center text
  ctx.beginPath(); ctx.arc(cx,cy,ir,0,Math.PI*2); ctx.fillStyle='#f8fafc'; ctx.fill()
  ctx.fillStyle='#1e293b'; ctx.font='bold 13px sans-serif'; ctx.textAlign='center'
  if(title) ctx.fillText(title.substring(0,8),cx,cy+2)
  else { ctx.font='bold 14px sans-serif'; ctx.fillText(Math.round(p*100)+'%',cx,cy+5) }
  const ly=cy+r+18
  data.forEach((d,i)=>{
    const lx=cx-r+i*(r*2/Math.max(data.length,1))+8
    ctx.fillStyle=d.color||`hsl(${i*(360/data.length)},70%,60%)`; ctx.fillRect(lx,ly,8,8)
    ctx.fillStyle='#475569'; ctx.font='9px sans-serif'; ctx.textAlign='left'
    ctx.fillText((d.label||'').substring(0,8),lx+10,ly+7)
  })
}

// ── Scatter Chart ────────────────────────────────────────────────────────────
function drawScatterChart(ctx, s, p=1) {
  const {x,y,w,h,data=[],title=''}=s; if(!data.length) return
  const maxVal=Math.max(...data.map(d=>d.value),1)
  const top=title?30:12, bot=28, left=40, right=12
  const cw=w-left-right, ch=h-top-bot
  chartBg(ctx,x,y,w,h,title); gridH(ctx,x,y,cw,ch,top,left,maxVal)
  const n=data.length
  data.forEach((d,i)=>{
    const dotP=Math.max(0,Math.min(1,(p-i/n)*n))
    if(dotP<=0) return
    const r=6*dotP
    const px=x+left+((i+0.5)/n)*cw
    const py=y+top+ch-(d.value/maxVal)*ch
    ctx.save(); ctx.globalAlpha=dotP
    ctx.beginPath(); ctx.arc(px,py,r,0,Math.PI*2)
    ctx.fillStyle=d.color||`hsl(${i*47},70%,60%)`; ctx.fill()
    ctx.strokeStyle='#fff'; ctx.lineWidth=1.5; ctx.stroke()
    ctx.restore()
    if(dotP>0.7){
      ctx.fillStyle='#64748b'; ctx.font='9px sans-serif'; ctx.textAlign='center'
      ctx.fillText((d.label||'').substring(0,7),px,y+top+ch+14)
      ctx.fillStyle='#334155'; ctx.font='bold 9px sans-serif'
      ctx.fillText(d.value,px,py-8)
    }
  })
}

// ── Radar Chart ──────────────────────────────────────────────────────────────
function drawRadarChart(ctx, s, p=1) {
  const {cx,cy,r,data=[],title=''}=s; if(data.length<3) return
  const n=data.length
  const maxVal=Math.max(...data.map(d=>d.value),1)
  const axisAngle=i=>(i/n)*Math.PI*2-Math.PI/2
  // background rings
  for(let ring=1;ring<=4;ring++){
    const rr=r*(ring/4)
    ctx.beginPath()
    for(let i=0;i<n;i++){
      const a=axisAngle(i)
      const px=cx+Math.cos(a)*rr, py=cy+Math.sin(a)*rr
      i===0?ctx.moveTo(px,py):ctx.lineTo(px,py)
    }
    ctx.closePath(); ctx.strokeStyle='#e2e8f0'; ctx.lineWidth=0.8; ctx.stroke()
    ctx.fillStyle='#94a3b8'; ctx.font='8px sans-serif'; ctx.textAlign='left'
    ctx.fillText(Math.round(maxVal*ring/4),cx+3,cy-rr+3)
  }
  // axis spokes
  for(let i=0;i<n;i++){
    const a=axisAngle(i)
    ctx.beginPath(); ctx.moveTo(cx,cy)
    ctx.lineTo(cx+Math.cos(a)*r,cy+Math.sin(a)*r)
    ctx.strokeStyle='#cbd5e1'; ctx.lineWidth=1; ctx.stroke()
    const la=axisAngle(i), lr=r+18
    ctx.fillStyle='#334155'; ctx.font='bold 9px sans-serif'
    const ca=Math.cos(la)
    ctx.textAlign=ca>0.1?'left':ca<-0.1?'right':'center'
    ctx.fillText((data[i].label||'').substring(0,9),cx+Math.cos(la)*lr,cy+Math.sin(la)*lr+3)
  }
  // revealed data area
  const revN=Math.ceil(p*n)
  ctx.beginPath()
  for(let i=0;i<revN&&i<n;i++){
    const a=axisAngle(i)
    // animate each point growing outward
    const ptP=Math.max(0,Math.min(1,(p-(i-1)/n)*n))
    const dist=(data[i].value/maxVal)*r*ptP
    const px=cx+Math.cos(a)*dist, py=cy+Math.sin(a)*dist
    i===0?ctx.moveTo(px,py):ctx.lineTo(px,py)
  }
  if(revN>=n){
    const a=axisAngle(0); const dist=(data[0].value/maxVal)*r
    ctx.lineTo(cx+Math.cos(a)*dist,cy+Math.sin(a)*dist)
  }
  ctx.closePath()
  ctx.fillStyle='rgba(99,102,241,0.28)'; ctx.fill()
  ctx.strokeStyle='#6366f1'; ctx.lineWidth=2.5; ctx.stroke()
  // dots
  for(let i=0;i<revN&&i<n;i++){
    const a=axisAngle(i), dist=(data[i].value/maxVal)*r
    const ptP=Math.max(0,Math.min(1,(p-(i-1)/n)*n))
    ctx.beginPath(); ctx.arc(cx+Math.cos(a)*dist,cy+Math.sin(a)*dist,4*ptP,0,Math.PI*2)
    ctx.fillStyle='#6366f1'; ctx.fill(); ctx.strokeStyle='#fff'; ctx.lineWidth=1.5; ctx.stroke()
  }
  if(title){
    ctx.fillStyle='#1e293b'; ctx.font='bold 12px sans-serif'; ctx.textAlign='center'
    ctx.fillText(title,cx,cy+r+18)
  }
}

// ── Shape renderer ────────────────────────────────────────────────────────────
function drawShape(ctx, s, t=0, chartP=1) {
  ctx.save()
  let alpha=s.opacity??1
  if(s.animation==='pulse')  alpha*=0.35+0.65*Math.abs(Math.sin(t*(s.animSpeed||2)))
  if(s.animation==='float')  ctx.translate(0,Math.sin(t*(s.animSpeed||2))*8)
  if(s.animation==='spin'){
    const c=getCenter(s)
    ctx.translate(c.x,c.y); ctx.rotate(t*(s.animSpeed||1)); ctx.translate(-c.x,-c.y)
  }
  ctx.globalAlpha=Math.max(0,Math.min(1,alpha))
  ctx.strokeStyle=s.strokeColor||'#000000'; ctx.fillStyle=s.fillColor||'#3b82f6'
  ctx.lineWidth=s.strokeWidth||2; ctx.lineCap='round'; ctx.lineJoin='round'
  switch(s.type){
    case 'pen':
      if(!s.points?.length) break
      ctx.beginPath(); s.points.forEach((p,i)=>i===0?ctx.moveTo(p.x,p.y):ctx.lineTo(p.x,p.y)); ctx.stroke(); break
    case 'line':
      ctx.beginPath(); ctx.moveTo(s.x1,s.y1); ctx.lineTo(s.x2,s.y2); ctx.stroke(); break
    case 'rect':
      ctx.beginPath(); ctx.rect(s.x,s.y,s.w,s.h)
      if(s.useFill) ctx.fill(); ctx.stroke(); break
    case 'ellipse':
      ctx.beginPath(); ctx.ellipse(s.cx,s.cy,Math.max(1,Math.abs(s.rx)),Math.max(1,Math.abs(s.ry)),0,0,Math.PI*2)
      if(s.useFill) ctx.fill(); ctx.stroke(); break
    case 'arrow':{
      ctx.beginPath(); ctx.moveTo(s.x1,s.y1); ctx.lineTo(s.x2,s.y2); ctx.stroke()
      const ang=Math.atan2(s.y2-s.y1,s.x2-s.x1), hl=Math.max(12,(s.strokeWidth||2)*3)
      ctx.beginPath()
      ctx.moveTo(s.x2,s.y2); ctx.lineTo(s.x2-hl*Math.cos(ang-Math.PI/6),s.y2-hl*Math.sin(ang-Math.PI/6))
      ctx.moveTo(s.x2,s.y2); ctx.lineTo(s.x2-hl*Math.cos(ang+Math.PI/6),s.y2-hl*Math.sin(ang+Math.PI/6))
      ctx.stroke(); break
    }
    case 'text':
      ctx.font=`${s.fontSize||18}px sans-serif`
      ctx.fillStyle=s.strokeColor||'#000'; ctx.fillText(s.text||'',s.x,s.y); break
    case 'chart_bar':     drawBarChart(ctx,s,chartP);     break
    case 'chart_hbar':    drawHBarChart(ctx,s,chartP);    break
    case 'chart_line':    drawLineChart(ctx,s,chartP);    break
    case 'chart_area':    drawAreaChart(ctx,s,chartP);    break
    case 'chart_pie':     drawPieChart(ctx,s,chartP);     break
    case 'chart_donut':   drawDonutChart(ctx,s,chartP);   break
    case 'chart_scatter': drawScatterChart(ctx,s,chartP); break
    case 'chart_radar':   drawRadarChart(ctx,s,chartP);   break
  }
  ctx.restore()
}
function drawSelectionHandles(ctx,s){
  const b=getBBox(s), pad=8; ctx.save()
  ctx.strokeStyle='#6366f1'; ctx.lineWidth=1.5; ctx.setLineDash([5,3])
  ctx.strokeRect(b.x-pad,b.y-pad,b.w+pad*2,b.h+pad*2); ctx.setLineDash([])
  const corners=[[b.x-pad,b.y-pad],[b.x+b.w/2,b.y-pad],[b.x+b.w+pad,b.y-pad],
    [b.x-pad,b.y+b.h/2],[b.x+b.w+pad,b.y+b.h/2],
    [b.x-pad,b.y+b.h+pad],[b.x+b.w/2,b.y+b.h+pad],[b.x+b.w+pad,b.y+b.h+pad]]
  ctx.fillStyle='#6366f1'; corners.forEach(([cx,cy])=>{ctx.fillRect(cx-4,cy-4,8,8)}); ctx.restore()
}

// ── ColorPicker ───────────────────────────────────────────────────────────────
function ColorPicker({label,value,onChange}){
  const [open,setOpen]=useState(false), ref=useRef(null)
  useEffect(()=>{
    const h=e=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false)}
    document.addEventListener('mousedown',h); return()=>document.removeEventListener('mousedown',h)
  },[])
  return(
    <div className="relative" ref={ref}>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</p>
      <button onClick={()=>setOpen(o=>!o)}
        className="w-8 h-8 rounded-lg border-2 border-gray-300 dark:border-gray-600 shadow-sm hover:scale-105 transition-transform"
        style={{backgroundColor:value}} title={value}/>
      {open&&(
        <div className="absolute left-0 top-11 z-50 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 p-3 w-52">
          <div className="grid grid-cols-6 gap-1.5 mb-2">
            {PRESET_COLORS.map(c=>(
              <button key={c} onClick={()=>{onChange(c);setOpen(false)}}
                className={`w-6 h-6 rounded-md border-2 hover:scale-110 transition-transform ${value===c?'border-brand-500':'border-transparent'}`}
                style={{backgroundColor:c}}/>
            ))}
          </div>
          <input type="color" value={value} onChange={e=>onChange(e.target.value)}
            className="w-full h-8 rounded cursor-pointer border border-gray-200 dark:border-gray-600"/>
        </div>
      )}
    </div>
  )
}

// ── Chart Wizard ──────────────────────────────────────────────────────────────
function ChartWizard({onAdd,onClose}){
  const [type,setType]=useState('bar')
  const [title,setTitle]=useState('')
  const [speed,setSpeed]=useState(1)
  const [rows,setRows]=useState([
    {label:'Jan',value:40,color:'#6366f1'},
    {label:'Feb',value:65,color:'#22c55e'},
    {label:'Mar',value:55,color:'#f97316'},
    {label:'Apr',value:80,color:'#ec4899'},
    {label:'May',value:45,color:'#06b6d4'},
  ])
  function addRow(){setRows(r=>[...r,{label:`Item ${r.length+1}`,value:30,color:'#3b82f6'}])}
  function removeRow(i){setRows(r=>r.filter((_,idx)=>idx!==i))}
  function updateRow(i,k,v){setRows(r=>r.map((row,idx)=>idx===i?{...row,[k]:v}:row))}
  function handleAdd(){
    if(!rows.length){toast.error('Add at least one data row');return}
    const data=rows.map(r=>({...r,value:parseFloat(r.value)||0}))
    const ct=CHART_TYPES.find(c=>c.id===type)
    const base={id:newId(),title,data,animation:'none',opacity:1,chartSpeed:speed,chartProgress:0}
    const isPolar=type==='pie'||type==='donut'||type==='radar'
    if(isPolar) onAdd({...base,type:ct.st,cx:500,cy:320,r:type==='radar'?130:120})
    else         onAdd({...base,type:ct.st,x:100,y:60,w:420,h:300})
    onClose()
  }
  const needsMin3=type==='radar'
  return(
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col" onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-white">📊 Insert Animated Chart</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Type */}
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Chart Type</label>
            <div className="grid grid-cols-4 gap-1.5 mt-2">
              {CHART_TYPES.map(ct=>(
                <button key={ct.id} onClick={()=>setType(ct.id)}
                  className={`flex flex-col items-center gap-0.5 py-2 px-1 rounded-lg text-xs font-medium transition-colors ${type===ct.id?'bg-brand-600 text-white':'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'}`}>
                  <span className="text-base leading-none">{ct.icon}</span>
                  <span className="text-[10px]">{ct.label}</span>
                </button>
              ))}
            </div>
          </div>
          {/* Title */}
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Title</label>
            <input className="input w-full mt-1 text-sm" placeholder="Chart title…" value={title} onChange={e=>setTitle(e.target.value)}/>
          </div>
          {/* Animation speed */}
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Animation Speed: {speed}×</label>
            <input type="range" min={0.2} max={4} step={0.2} value={speed} onChange={e=>setSpeed(+e.target.value)} className="w-full mt-1 accent-brand-600"/>
            <p className="text-[10px] text-gray-400 mt-0.5">Chart will auto-play when inserted</p>
          </div>
          {/* Data rows */}
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              Data {needsMin3&&<span className="text-orange-500">(min 3 for radar)</span>}
            </label>
            <div className="mt-2 space-y-2 max-h-44 overflow-y-auto pr-1">
              {rows.map((r,i)=>(
                <div key={i} className="flex items-center gap-1.5">
                  <input className="input flex-1 text-xs py-1.5" placeholder="Label" value={r.label} onChange={e=>updateRow(i,'label',e.target.value)}/>
                  <input type="number" className="input w-20 text-xs py-1.5" placeholder="Value" value={r.value} onChange={e=>updateRow(i,'value',e.target.value)}/>
                  <input type="color" value={r.color} onChange={e=>updateRow(i,'color',e.target.value)} className="w-8 h-8 rounded cursor-pointer border border-gray-200"/>
                  <button onClick={()=>removeRow(i)} className="text-red-400 hover:text-red-600 text-sm px-1">✕</button>
                </div>
              ))}
            </div>
            <button onClick={addRow} className="mt-2 text-xs text-brand-600 hover:text-brand-500">+ Add row</button>
          </div>
        </div>
        <div className="flex gap-2 px-5 py-4 border-t border-gray-200 dark:border-gray-700">
          <button onClick={onClose} className="btn-secondary text-sm flex-1">Cancel</button>
          <button onClick={handleAdd} className="btn-primary text-sm flex-1">▶ Insert & Animate</button>
        </div>
      </div>
    </div>
  )
}

// ── SaveDialog ────────────────────────────────────────────────────────────────
function SaveDialog({initial,onSave,onCancel}){
  const [name,setName]=useState(initial||'')
  return(
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6 w-80">
        <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Save Drawing</h3>
        <input autoFocus value={name} onChange={e=>setName(e.target.value)}
          onKeyDown={e=>{if(e.key==='Enter')onSave(name);if(e.key==='Escape')onCancel()}}
          placeholder="Drawing name…" className="input w-full mb-4"/>
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="btn-secondary text-sm">Cancel</button>
          <button onClick={()=>onSave(name)} disabled={!name.trim()} className="btn-primary text-sm disabled:opacity-50">Save</button>
        </div>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function DrawPage(){
  const {data:session}=useSession()
  const canvasRef=useRef(null)

  // Scene
  const shapesRef=useRef([])
  const [shapes,setShapes]=useState([])

  // Tools & style
  const [tool,setTool]=useState('select')
  const [strokeColor,setStrokeColor]=useState('#000000')
  const [fillColor,setFillColor]=useState('#3b82f6')
  const [strokeWidth,setStrokeWidth]=useState(2)
  const [useFill,setUseFill]=useState(true)
  const [opacity,setOpacity]=useState(1)

  // Selection
  const [selectedId,setSelectedId]=useState(null)
  const selectedIdRef=useRef(null)

  // Drawing
  const isDrawing=useRef(false)
  const startPos=useRef({x:0,y:0})
  const penPoints=useRef([])
  const previewShape=useRef(null)

  // Drag
  const isDragging=useRef(false)
  const dragStart=useRef({x:0,y:0})
  const dragOrigin=useRef(null)

  // Text
  const [textInput,setTextInput]=useState({visible:false,x:0,y:0,canvasX:0,canvasY:0,value:''})
  const textRef=useRef(null)

  // Shape animation (pulse/float/spin)
  const [playing,setPlaying]=useState(false)
  const rafRef=useRef(null)

  // Chart animations
  const chartProgressRef=useRef({})    // id -> 0-1
  const chartAnimRef=useRef({})         // id -> { playing, speed, lastTime }
  const chartRafRef=useRef(null)
  const [chartUITick,setChartUITick]=useState(0) // force re-render of chart controls

  // Modals
  const [showChartWizard,setShowChartWizard]=useState(false)
  const [showSaveDialog,setShowSaveDialog]=useState(false)
  const [showGallery,setShowGallery]=useState(false)
  const [drawings,setDrawings]=useState([])
  const [loadingGallery,setLoadingGallery]=useState(false)
  const [saving,setSaving]=useState(false)
  const [currentId,setCurrentId]=useState(null)
  const [currentName,setCurrentName]=useState(null)
  const [isDirty,setIsDirty]=useState(false)

  // Undo/redo
  const undoStack=useRef([[]])
  const undoIdx=useRef(0)

  // Sync refs
  const toolRef=useRef(tool), strokeRef=useRef(strokeColor), fillRef=useRef(fillColor)
  const swRef=useRef(strokeWidth), ufRef=useRef(useFill), opRef=useRef(opacity)
  useEffect(()=>{toolRef.current=tool},[tool])
  useEffect(()=>{strokeRef.current=strokeColor},[strokeColor])
  useEffect(()=>{fillRef.current=fillColor},[fillColor])
  useEffect(()=>{swRef.current=strokeWidth},[strokeWidth])
  useEffect(()=>{ufRef.current=useFill},[useFill])
  useEffect(()=>{opRef.current=opacity},[opacity])
  useEffect(()=>{selectedIdRef.current=selectedId},[selectedId])

  // ── Render ────────────────────────────────────────────────────────────────────
  const renderAll=useCallback((t=0)=>{
    const canvas=canvasRef.current; if(!canvas) return
    const ctx=canvas.getContext('2d')
    ctx.fillStyle='#ffffff'; ctx.fillRect(0,0,canvas.width,canvas.height)
    shapesRef.current.forEach(s=>{
      const cp=chartProgressRef.current[s.id]??1
      drawShape(ctx,s,t,cp)
    })
    if(previewShape.current) drawShape(ctx,previewShape.current,0,1)
    if(selectedIdRef.current){
      const sel=shapesRef.current.find(s=>s.id===selectedIdRef.current)
      if(sel) drawSelectionHandles(ctx,sel)
    }
  },[])

  useEffect(()=>{renderAll()},[shapes,selectedId,renderAll])

  // Shape animation loop
  useEffect(()=>{
    if(!playing){if(rafRef.current)cancelAnimationFrame(rafRef.current);renderAll(0);return}
    const t0=performance.now()
    function tick(now){renderAll((now-t0)/1000);rafRef.current=requestAnimationFrame(tick)}
    rafRef.current=requestAnimationFrame(tick)
    return()=>cancelAnimationFrame(rafRef.current)
  },[playing,shapes,renderAll])

  // Canvas init
  useEffect(()=>{
    const canvas=canvasRef.current; if(!canvas) return
    canvas.width=canvas.offsetWidth||1600; canvas.height=canvas.offsetHeight||900
    renderAll()
  },[])

  // Poll chart progress for UI updates while animating
  useEffect(()=>{
    if(!selectedId) return
    const sel=shapesRef.current.find(s=>s.id===selectedId)
    if(!sel||!isChart(sel.type)) return
    if(!chartAnimRef.current[selectedId]?.playing) return
    const interval=setInterval(()=>setChartUITick(t=>t+1),80)
    return()=>clearInterval(interval)
  },[selectedId,chartUITick])

  // ── Chart animation engine ────────────────────────────────────────────────────
  function startChartRaf(){
    if(chartRafRef.current) return
    let last=performance.now()
    function tick(now){
      const dt=Math.min((now-last)/1000,0.05); last=now
      let anyPlaying=false
      for(const id of Object.keys(chartAnimRef.current)){
        const anim=chartAnimRef.current[id]
        if(!anim?.playing) continue
        const cur=chartProgressRef.current[id]??0
        const next=cur+dt*(anim.speed||1)
        if(next>=1){
          chartProgressRef.current[id]=1
          anim.playing=false
          setChartUITick(t=>t+1)
        } else {
          chartProgressRef.current[id]=next
          anyPlaying=true
        }
      }
      renderAll()
      if(anyPlaying) chartRafRef.current=requestAnimationFrame(tick)
      else chartRafRef.current=null
    }
    chartRafRef.current=requestAnimationFrame(tick)
  }

  function playChart(id){
    chartProgressRef.current[id]=0
    chartAnimRef.current[id]={playing:true,speed:chartAnimRef.current[id]?.speed||1}
    setChartUITick(t=>t+1)
    startChartRaf()
  }
  function pauseChart(id){
    if(chartAnimRef.current[id]) chartAnimRef.current[id].playing=false
    setChartUITick(t=>t+1)
  }
  function resetChart(id){
    chartProgressRef.current[id]=0
    if(chartAnimRef.current[id]) chartAnimRef.current[id].playing=false
    setChartUITick(t=>t+1); renderAll()
  }
  function setChartSpeed(id,speed){
    if(!chartAnimRef.current[id]) chartAnimRef.current[id]={playing:false,speed}
    else chartAnimRef.current[id].speed=speed
    setChartUITick(t=>t+1)
  }
  function playAllCharts(){
    shapesRef.current.forEach(s=>{
      if(!isChart(s.type)) return
      chartProgressRef.current[s.id]=0
      chartAnimRef.current[s.id]={playing:true,speed:chartAnimRef.current[s.id]?.speed||1}
    })
    setChartUITick(t=>t+1); startChartRaf()
  }

  // ── Scene management ──────────────────────────────────────────────────────────
  function commitShapeObj(s){
    const next=[...shapesRef.current,s]
    shapesRef.current=next; setShapes([...next]); pushUndo(next); setIsDirty(true)
  }
  function updateShapeById(id,updates){
    const next=shapesRef.current.map(s=>s.id===id?{...s,...updates}:s)
    shapesRef.current=next; setShapes([...next]); setIsDirty(true)
  }
  function deleteShape(id){
    const next=shapesRef.current.filter(s=>s.id!==id)
    shapesRef.current=next; setShapes([...next]); setSelectedId(null); pushUndo(next); setIsDirty(true)
  }

  // ── Undo/redo ─────────────────────────────────────────────────────────────────
  function pushUndo(s){
    undoStack.current=undoStack.current.slice(0,undoIdx.current+1)
    undoStack.current.push(JSON.parse(JSON.stringify(s)))
    if(undoStack.current.length>60) undoStack.current.shift(); else undoIdx.current++
  }
  function undo(){
    if(undoIdx.current<=0) return
    undoIdx.current--
    const s=JSON.parse(JSON.stringify(undoStack.current[undoIdx.current]))
    shapesRef.current=s; setShapes([...s]); setSelectedId(null)
  }
  function redo(){
    if(undoIdx.current>=undoStack.current.length-1) return
    undoIdx.current++
    const s=JSON.parse(JSON.stringify(undoStack.current[undoIdx.current]))
    shapesRef.current=s; setShapes([...s]); setSelectedId(null)
  }

  // ── Canvas coords ─────────────────────────────────────────────────────────────
  function getPos(e){
    const canvas=canvasRef.current, rect=canvas.getBoundingClientRect()
    return {x:(e.clientX-rect.left)*(canvas.width/rect.width),y:(e.clientY-rect.top)*(canvas.height/rect.height)}
  }

  // ── Mouse handlers ────────────────────────────────────────────────────────────
  function onMouseDown(e){
    const pos=getPos(e), t=toolRef.current
    if(t==='fill'){
      renderAll(); const canvas=canvasRef.current
      floodFill(canvas.getContext('2d'),canvas,pos.x,pos.y,fillRef.current); setIsDirty(true); return
    }
    if(t==='text'){
      const canvas=canvasRef.current, rect=canvas.getBoundingClientRect()
      setTextInput({visible:true,x:e.clientX-rect.left,y:e.clientY-rect.top,canvasX:pos.x,canvasY:pos.y,value:''})
      setTimeout(()=>textRef.current?.focus(),0); return
    }
    if(t==='chart'){setShowChartWizard(true);return}
    if(t==='select'){
      const hit=[...shapesRef.current].reverse().find(s=>hitTest(s,pos.x,pos.y))
      if(hit){setSelectedId(hit.id);isDragging.current=true;dragStart.current=pos;dragOrigin.current=hit}
      else setSelectedId(null)
      return
    }
    isDrawing.current=true; startPos.current=pos
    if(t==='pen'||t==='eraser') penPoints.current=[pos]
  }
  function onMouseMove(e){
    const pos=getPos(e), t=toolRef.current
    if(t==='select'&&isDragging.current&&dragOrigin.current){
      const dx=pos.x-dragStart.current.x, dy=pos.y-dragStart.current.y
      const moved=moveShape(dragOrigin.current,dx,dy)
      const next=shapesRef.current.map(s=>s.id===moved.id?moved:s)
      shapesRef.current=next; setShapes([...next]); return
    }
    if(!isDrawing.current) return
    if(t==='pen'){
      penPoints.current.push(pos)
      const canvas=canvasRef.current, ctx=canvas.getContext('2d')
      ctx.strokeStyle=strokeRef.current; ctx.lineWidth=swRef.current; ctx.lineCap='round'; ctx.lineJoin='round'
      const pts=penPoints.current
      if(pts.length>=2){ctx.beginPath();ctx.moveTo(pts[pts.length-2].x,pts[pts.length-2].y);ctx.lineTo(pts[pts.length-1].x,pts[pts.length-1].y);ctx.stroke()}
      return
    }
    if(t==='eraser'){
      const canvas=canvasRef.current, ctx=canvas.getContext('2d')
      ctx.save(); ctx.fillStyle='#ffffff'; const r=swRef.current*5
      ctx.beginPath(); ctx.arc(pos.x,pos.y,r,0,Math.PI*2); ctx.fill(); ctx.restore()
      penPoints.current.push(pos); return
    }
    const sp=startPos.current, base={strokeColor:strokeRef.current,fillColor:fillRef.current,strokeWidth:swRef.current,useFill:ufRef.current}
    if(t==='line')         previewShape.current={...base,id:'__preview',type:'line',x1:sp.x,y1:sp.y,x2:pos.x,y2:pos.y}
    else if(t==='rect')    previewShape.current={...base,id:'__preview',type:'rect',x:Math.min(sp.x,pos.x),y:Math.min(sp.y,pos.y),w:Math.abs(pos.x-sp.x),h:Math.abs(pos.y-sp.y)}
    else if(t==='ellipse') previewShape.current={...base,id:'__preview',type:'ellipse',cx:(sp.x+pos.x)/2,cy:(sp.y+pos.y)/2,rx:Math.abs(pos.x-sp.x)/2,ry:Math.abs(pos.y-sp.y)/2}
    else if(t==='arrow')   previewShape.current={...base,id:'__preview',type:'arrow',x1:sp.x,y1:sp.y,x2:pos.x,y2:pos.y}
    renderAll()
  }
  function onMouseUp(e){
    const pos=getPos(e), t=toolRef.current
    if(t==='select'){
      if(isDragging.current){isDragging.current=false;pushUndo([...shapesRef.current]);setIsDirty(true)}
      dragOrigin.current=null; return
    }
    if(!isDrawing.current) return
    isDrawing.current=false; previewShape.current=null
    const sp=startPos.current
    const base={strokeColor:strokeRef.current,fillColor:fillRef.current,strokeWidth:swRef.current,useFill:ufRef.current,opacity:opRef.current,animation:'none'}
    if(t==='pen'){
      if(penPoints.current.length>1) commitShapeObj({...base,id:newId(),type:'pen',points:[...penPoints.current]})
      penPoints.current=[]; return
    }
    if(t==='eraser'){penPoints.current=[];setIsDirty(true);return}
    if(t==='line')         commitShapeObj({...base,id:newId(),type:'line',x1:sp.x,y1:sp.y,x2:pos.x,y2:pos.y})
    else if(t==='rect')    commitShapeObj({...base,id:newId(),type:'rect',x:Math.min(sp.x,pos.x),y:Math.min(sp.y,pos.y),w:Math.abs(pos.x-sp.x)||1,h:Math.abs(pos.y-sp.y)||1})
    else if(t==='ellipse') commitShapeObj({...base,id:newId(),type:'ellipse',cx:(sp.x+pos.x)/2,cy:(sp.y+pos.y)/2,rx:Math.abs(pos.x-sp.x)/2||1,ry:Math.abs(pos.y-sp.y)/2||1})
    else if(t==='arrow')   commitShapeObj({...base,id:newId(),type:'arrow',x1:sp.x,y1:sp.y,x2:pos.x,y2:pos.y})
    renderAll()
  }
  function commitText(){
    if(!textInput.value.trim()){setTextInput(t=>({...t,visible:false}));return}
    const fs=swRef.current*6+10
    commitShapeObj({id:newId(),type:'text',x:textInput.canvasX,y:textInput.canvasY+fs*0.35,text:textInput.value,fontSize:fs,strokeColor:strokeRef.current,opacity:opRef.current,animation:'none'})
    setTextInput(t=>({...t,visible:false,value:''}))
  }

  // ── Keyboard ──────────────────────────────────────────────────────────────────
  useEffect(()=>{
    function onKey(e){
      if(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA') return
      if(e.ctrlKey&&e.key==='z'){e.preventDefault();undo()}
      if(e.ctrlKey&&e.key==='y'){e.preventDefault();redo()}
      if(e.ctrlKey&&e.key==='s'){e.preventDefault();handleSave()}
      if((e.key==='Delete'||e.key==='Backspace')&&selectedIdRef.current){e.preventDefault();deleteShape(selectedIdRef.current)}
      if(e.key==='Escape') setSelectedId(null)
    }
    window.addEventListener('keydown',onKey)
    return()=>window.removeEventListener('keydown',onKey)
  },[])

  // ── Persistence ───────────────────────────────────────────────────────────────
  function makeThumbnail(canvas,maxW=320){
    const ratio=maxW/canvas.width; const tmp=document.createElement('canvas')
    tmp.width=maxW; tmp.height=Math.round(canvas.height*ratio)
    tmp.getContext('2d').drawImage(canvas,0,0,tmp.width,tmp.height)
    return tmp.toDataURL('image/png')
  }
  function handleSave(){
    if(currentId&&currentName) doSave(currentName,currentId)
    else setShowSaveDialog(true)
  }
  async function doSave(name,existingId=null){
    if(!session){toast.error('Not logged in');return}
    setSaving(true); renderAll()
    const canvas=canvasRef.current
    const canvas_data=JSON.stringify({version:2,shapes:shapesRef.current})
    const thumbnail=makeThumbnail(canvas)
    try{
      const saved=existingId
        ?await api.drawings.update(existingId,{name,canvas_data,thumbnail},session)
        :await api.drawings.save({name,canvas_data,thumbnail},session)
      setCurrentId(saved.id); setCurrentName(saved.name); setIsDirty(false)
      toast.success(`Saved "${saved.name}"`)
    }catch(err){toast.error(err.message||'Save failed')}
    finally{setSaving(false);setShowSaveDialog(false)}
  }
  async function openGallery(){
    setShowGallery(true); setLoadingGallery(true)
    try{setDrawings(await api.drawings.list(session))}
    catch{toast.error('Failed to load drawings')}
    finally{setLoadingGallery(false)}
  }
  async function loadDrawing(id){
    if(isDirty&&!confirm('Unsaved changes. Load anyway?')) return
    try{
      const data=await api.drawings.get(id,session)
      let loadedShapes=[]
      if(data.canvas_data?.startsWith('{')){
        const parsed=JSON.parse(data.canvas_data)
        loadedShapes=parsed.shapes||[]
      } else if(data.canvas_data?.startsWith('data:image')){
        await new Promise(resolve=>{
          const canvas=canvasRef.current, ctx=canvas.getContext('2d')
          const img=new Image(); img.onload=()=>{ctx.drawImage(img,0,0);resolve()}; img.src=data.canvas_data
        })
        toast.success(`Loaded "${data.name}" (legacy)`); setCurrentId(data.id); setCurrentName(data.name); setShowGallery(false); return
      }
      shapesRef.current=loadedShapes; setShapes([...loadedShapes])
      undoStack.current=[JSON.parse(JSON.stringify(loadedShapes))]; undoIdx.current=0
      setCurrentId(data.id); setCurrentName(data.name); setIsDirty(false); setSelectedId(null); setShowGallery(false)
      toast.success(`Loaded "${data.name}"`)
    }catch{toast.error('Failed to load drawing')}
  }
  async function deleteDrawing(id,name){
    if(!confirm(`Delete "${name}"?`)) return
    try{
      await api.drawings.delete(id,session)
      setDrawings(prev=>prev.filter(d=>d.id!==id))
      if(currentId===id){setCurrentId(null);setCurrentName(null)}
      toast.success('Deleted')
    }catch{toast.error('Delete failed')}
  }
  function clearCanvas(){
    shapesRef.current=[]; setShapes([]); setSelectedId(null)
    undoStack.current=[[]]; undoIdx.current=0; setIsDirty(false)
    const canvas=canvasRef.current, ctx=canvas.getContext('2d')
    ctx.fillStyle='#ffffff'; ctx.fillRect(0,0,canvas.width,canvas.height)
    toast.success('Cleared')
  }
  function downloadPNG(){
    renderAll()
    const a=document.createElement('a')
    a.href=canvasRef.current.toDataURL('image/png')
    a.download=`${currentName||'drawing'}.png`; a.click(); toast.success('Downloaded!')
  }

  // ── Derived state ─────────────────────────────────────────────────────────────
  const selShape=shapes.find(s=>s.id===selectedId)
  const selIsChart=selShape&&isChart(selShape.type)
  const selChartProgress=chartProgressRef.current[selectedId]??1
  const selChartPlaying=chartAnimRef.current[selectedId]?.playing??false
  const selChartSpeed=chartAnimRef.current[selectedId]?.speed??1
  const chartCount=shapes.filter(s=>isChart(s.type)).length

  return(
    <div className="flex gap-3 fade-in" style={{height:'calc(100vh - 7.5rem)'}}>

      {/* ── Left toolbar ─────────────────────────────────────────────────── */}
      <div className="w-44 flex-shrink-0 flex flex-col gap-2 overflow-y-auto">

        {/* Tools */}
        <div className="card p-2">
          <div className="grid grid-cols-2 gap-1">
            {TOOLS.map(t=>(
              <button key={t.id} onClick={()=>{setTool(t.id);if(t.id!=='select')setSelectedId(null)}} title={t.label}
                className={`flex flex-col items-center gap-0.5 px-1 py-2 rounded-lg text-xs font-medium transition-colors ${tool===t.id?'bg-brand-600 text-white':'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>
                <span className="text-sm leading-none">{t.icon}</span>
                <span className="text-[10px]">{t.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Colors */}
        <div className="card p-3 space-y-2">
          <ColorPicker label="Stroke" value={strokeColor} onChange={setStrokeColor}/>
          <ColorPicker label="Fill" value={fillColor} onChange={setFillColor}/>
          <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400 cursor-pointer">
            <input type="checkbox" checked={useFill} onChange={e=>setUseFill(e.target.checked)} className="rounded"/>
            Filled shape
          </label>
        </div>

        {/* Size */}
        <div className="card p-3">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Size: {strokeWidth}px</p>
          <input type="range" min={1} max={30} value={strokeWidth} onChange={e=>setStrokeWidth(+e.target.value)} className="w-full accent-brand-600"/>
          <div className="mt-1.5 rounded-full mx-auto" style={{width:Math.max(4,strokeWidth),height:Math.max(4,strokeWidth),backgroundColor:strokeColor}}/>
        </div>

        {/* Opacity */}
        <div className="card p-3">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Opacity: {Math.round(opacity*100)}%</p>
          <input type="range" min={0.1} max={1} step={0.05} value={opacity} onChange={e=>setOpacity(+e.target.value)} className="w-full accent-brand-600"/>
        </div>

        {/* Actions */}
        <div className="card p-2 grid grid-cols-2 gap-1">
          <button onClick={undo} className="btn-secondary text-xs py-1.5 justify-center">↩</button>
          <button onClick={redo} className="btn-secondary text-xs py-1.5 justify-center">↪</button>
          <button onClick={clearCanvas} className="col-span-2 btn-ghost text-xs py-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">🗑 Clear</button>
          <button onClick={downloadPNG} className="col-span-2 btn-secondary text-xs py-1.5 justify-center">⬇ PNG</button>
        </div>

        {/* Shape animation */}
        <div className="card p-3">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1.5">Shape Anim</p>
          <button onClick={()=>setPlaying(p=>!p)}
            className={`w-full text-xs py-1.5 rounded-lg font-medium mb-2 transition-colors ${playing?'bg-green-500 text-white':'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'}`}>
            {playing?'⏹ Stop':'▶ Play All'}
          </button>
          {selShape&&!selIsChart&&(
            <div>
              <p className="text-[10px] text-gray-400 mb-1">Selected shape:</p>
              <select className="input text-xs py-1 w-full"
                value={selShape.animation||'none'}
                onChange={e=>updateShapeById(selectedId,{animation:e.target.value})}>
                {ANIMATIONS.map(a=><option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          )}
        </div>

        {/* Chart animations global */}
        {chartCount>0&&(
          <div className="card p-3">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1.5">📊 Chart Anim</p>
            <button onClick={playAllCharts}
              className="w-full text-xs py-1.5 rounded-lg font-medium bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-200 dark:hover:bg-indigo-900/60 transition-colors">
              ▶ Replay All Charts
            </button>
            <p className="text-[10px] text-gray-400 mt-1 text-center">{chartCount} chart{chartCount!==1?'s':''}</p>
          </div>
        )}

        {/* Save */}
        <div className="card p-2 space-y-1">
          <button onClick={handleSave} disabled={saving} className="btn-primary text-xs w-full justify-center py-1.5 disabled:opacity-50">
            {saving?'Saving…':isDirty?'💾 Save*':'💾 Save'}
          </button>
          <button onClick={()=>{shapesRef.current=[];setShapes([]);setCurrentId(null);setCurrentName(null);setIsDirty(false)}} className="btn-secondary text-xs w-full justify-center py-1.5">+ New</button>
          <button onClick={openGallery} className="btn-secondary text-xs w-full justify-center py-1.5">🖼 Gallery</button>
          {currentName&&<p className="text-[10px] text-gray-400 text-center truncate">{isDirty?'● ':''}{currentName}</p>}
        </div>

        {/* Hints */}
        <div className="card p-2">
          <p className="text-[10px] text-gray-400">↖ Select → drag to move</p>
          <p className="text-[10px] text-gray-400">Del → delete shape</p>
          <p className="text-[10px] text-gray-400">📊 → insert chart</p>
          <p className="text-[10px] text-gray-400">Ctrl+Z/Y — Undo/Redo</p>
        </div>
      </div>

      {/* ── Canvas ──────────────────────────────────────────────────────────── */}
      <div className="relative flex-1 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 shadow-sm bg-white">
        <canvas ref={canvasRef} width={1600} height={900} className="w-full h-full"
          style={{cursor:tool==='select'?'default':tool==='eraser'?'cell':tool==='text'?'text':'crosshair',touchAction:'none'}}
          onMouseDown={onMouseDown} onMouseMove={onMouseMove}
          onMouseUp={onMouseUp} onMouseLeave={e=>{if(isDrawing.current)onMouseUp(e)}}/>

        {/* Text input */}
        {textInput.visible&&(
          <input ref={textRef} value={textInput.value}
            onChange={e=>setTextInput(t=>({...t,value:e.target.value}))}
            onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();commitText()}if(e.key==='Escape')setTextInput(t=>({...t,visible:false}))}}
            onBlur={commitText}
            className="absolute bg-transparent border-2 border-dashed border-brand-400 outline-none px-1 rounded"
            style={{left:textInput.x,top:textInput.y,fontSize:`${strokeWidth*6+10}px`,color:strokeColor,fontFamily:'sans-serif',minWidth:'100px',zIndex:10}}
            placeholder="Type…"/>
        )}

        {/* Info bar — chart controls */}
        {selIsChart&&(
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl px-4 py-2 shadow-xl text-xs text-gray-600 dark:text-gray-400 max-w-[95%] flex-wrap">
            <span className="font-semibold text-gray-800 dark:text-gray-200 capitalize">
              {selShape.type.replace('chart_','').replace('hbar','H. Bar')} Chart
            </span>
            <span className="text-gray-300">|</span>
            {/* Playback */}
            <div className="flex items-center gap-1">
              <button onClick={()=>resetChart(selectedId)} title="Reset" className="w-7 h-7 flex items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">⟳</button>
              {selChartPlaying
                ? <button onClick={()=>pauseChart(selectedId)} className="w-7 h-7 flex items-center justify-center rounded-lg bg-indigo-500 text-white hover:bg-indigo-600 transition-colors">⏸</button>
                : <button onClick={()=>playChart(selectedId)} className="w-7 h-7 flex items-center justify-center rounded-lg bg-indigo-500 text-white hover:bg-indigo-600 transition-colors">▶</button>
              }
            </div>
            {/* Progress scrubber */}
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-gray-400">Progress</span>
              <input type="range" min={0} max={1} step={0.01}
                value={selChartProgress}
                className="w-24 accent-indigo-500"
                onChange={e=>{
                  chartProgressRef.current[selectedId]=+e.target.value
                  if(chartAnimRef.current[selectedId]) chartAnimRef.current[selectedId].playing=false
                  renderAll(); setChartUITick(t=>t+1)
                }}/>
              <span className="text-[10px] w-8 text-right font-medium text-indigo-600">{Math.round(selChartProgress*100)}%</span>
            </div>
            {/* Speed */}
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-gray-400">Speed</span>
              <input type="range" min={0.2} max={4} step={0.2}
                value={selChartSpeed}
                className="w-20 accent-indigo-500"
                onChange={e=>setChartSpeed(selectedId,+e.target.value)}/>
              <span className="text-[10px] w-8 text-right font-medium">{selChartSpeed}×</span>
            </div>
            <span className="text-gray-300">|</span>
            {/* Shape opacity */}
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-gray-400">Opacity</span>
              <input type="range" min={0.1} max={1} step={0.05} value={selShape.opacity??1}
                className="w-16 accent-brand-600"
                onChange={e=>updateShapeById(selectedId,{opacity:+e.target.value})}/>
            </div>
            <button onClick={()=>deleteShape(selectedId)} className="text-red-500 hover:text-red-700">🗑</button>
            <button onClick={()=>setSelectedId(null)} className="text-gray-400 hover:text-gray-600">✕</button>
          </div>
        )}

        {/* Info bar — non-chart shape */}
        {selShape&&!selIsChart&&(
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2 shadow-lg text-xs text-gray-600 dark:text-gray-400">
            <span className="font-medium text-gray-800 dark:text-gray-200 capitalize">{selShape.type}</span>
            <span>·</span>
            <span>Anim:</span>
            <select className="bg-transparent outline-none text-brand-600 font-medium"
              value={selShape.animation||'none'}
              onChange={e=>updateShapeById(selectedId,{animation:e.target.value})}>
              {ANIMATIONS.map(a=><option key={a} value={a}>{a}</option>)}
            </select>
            <span>·</span>
            <span>Opacity:</span>
            <input type="range" min={0.1} max={1} step={0.05} value={selShape.opacity??1}
              className="w-20 accent-brand-600"
              onChange={e=>updateShapeById(selectedId,{opacity:+e.target.value})}/>
            <button onClick={()=>deleteShape(selectedId)} className="text-red-500 hover:text-red-700 ml-1">🗑</button>
            <button onClick={()=>setSelectedId(null)} className="text-gray-400 hover:text-gray-600">✕</button>
          </div>
        )}
      </div>

      {/* Modals */}
      {showChartWizard&&(
        <ChartWizard onClose={()=>setShowChartWizard(false)} onAdd={s=>{
          const sid=s.id||newId()
          const shapeWithId={...s,id:sid}
          commitShapeObj(shapeWithId)
          setTool('select')
          // auto-play
          chartProgressRef.current[sid]=0
          chartAnimRef.current[sid]={playing:true,speed:s.chartSpeed||1}
          setChartUITick(t=>t+1)
          startChartRaf()
          setTimeout(()=>setSelectedId(sid),50)
        }}/>
      )}
      {showSaveDialog&&(
        <SaveDialog initial={currentName||''} onSave={name=>doSave(name,currentId)} onCancel={()=>setShowSaveDialog(false)}/>
      )}
      {showGallery&&(
        <div className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="font-semibold text-gray-900 dark:text-white">My Drawings</h3>
              <button onClick={()=>setShowGallery(false)} className="text-gray-500 hover:text-gray-700 text-xl">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {loadingGallery?(
                <div className="flex items-center justify-center h-32 text-gray-400">Loading…</div>
              ):drawings.length===0?(
                <div className="flex flex-col items-center justify-center h-32 text-gray-400">
                  <p className="text-4xl mb-2">🎨</p><p className="text-sm">No saved drawings yet</p>
                </div>
              ):(
                <div className="grid grid-cols-3 gap-3">
                  {drawings.map(d=>(
                    <div key={d.id} className={`group relative rounded-xl border-2 overflow-hidden cursor-pointer hover:shadow-md transition-all ${currentId===d.id?'border-brand-500':'border-gray-200 dark:border-gray-700 hover:border-brand-400'}`}>
                      <div className="w-full aspect-video bg-gray-50 dark:bg-gray-800" onClick={()=>loadDrawing(d.id)}>
                        {d.thumbnail?<img src={d.thumbnail} alt={d.name} className="w-full h-full object-cover"/>
                          :<div className="w-full h-full flex items-center justify-center text-3xl text-gray-300">🎨</div>}
                      </div>
                      <div className="p-2 flex items-center justify-between gap-1">
                        <p className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate flex-1">{d.name}</p>
                        <button onClick={e=>{e.stopPropagation();deleteDrawing(d.id,d.name)}}
                          className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 text-xs transition-opacity">🗑</button>
                      </div>
                      <p className="px-2 pb-2 text-xs text-gray-400">{new Date(d.updated_at).toLocaleDateString()}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
