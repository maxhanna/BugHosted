export interface SpaceEvolvesRenderState {
  time:number;
  width:number;
  height:number;
  detail:number;
  player:{x:number;y:number};
  playerSprite?:HTMLImageElement;
  playerSpriteReady:boolean;
  bugs:any[];
  shots:any[];
  effects:any[];
  clouds:any[];
  backgroundClouds:any[];
  backgroundShips:any[];
  orbitDrones:any[];
  shieldTimer:number;
  shieldInterval:number;
  shieldVisibleFor:number;
  shieldKnockback:number;
  shieldRadius:number;
}

const NEBULA=['rgba(96,70,190,.32)','rgba(28,150,180,.28)','rgba(190,60,130,.22)'];
const STAR_COLORS=['rgb(180,220,255)','rgb(210,225,255)','rgb(255,255,255)'];
const STAR_PARALLAX=[.02,.045,.08];
const STAR_SPEED=[1,2,4];
const STAR_ALPHA=[.5,.7,1];
const STAR_COUNT=[70,40,22];
const OUTER=new Float64Array(16);
const INNER=new Float64Array(16);
const NODES=new Float64Array(20);

/** Owns all Space Evolves canvas presentation. It deliberately receives a read-only
 * render snapshot instead of knowing about Angular, persistence, or game rules. */
export class SpaceEvolvesRenderer {
  private backgroundWidth=0;
  private backgroundHeight=0;
  private background?:CanvasGradient;
  private vignette?:CanvasGradient;

  render(ctx:CanvasRenderingContext2D,state:SpaceEvolvesRenderState):void {
    const {width,height,time}=state;
    ctx.clearRect(0,0,width,height);
    this.drawBackground(ctx,state);
    for(const ship of state.backgroundShips)this.drawBackgroundShip(ctx,state,ship);
    for(const cloud of state.backgroundClouds)this.drawBackgroundCloud(ctx,state,cloud);
    this.drawStars(ctx,width,height,time);
    ctx.globalAlpha=1;
    if(this.vignette){ctx.fillStyle=this.vignette;ctx.fillRect(0,0,width,height);}
    for(const bug of state.bugs)this.drawBug(ctx,state,bug,bug.x*width,bug.y*height,bug.size*width);
    for(const cloud of state.clouds)this.drawCloud(ctx,state,cloud);
    for(const effect of state.effects)this.drawEffect(ctx,state,effect);
    for(const shot of state.shots)this.drawProjectile(ctx,state,shot);
    this.drawShip(ctx,state,state.player.x*width,state.player.y*height,Math.min(width,height)*.042);
    this.drawDrones(ctx,state);
    ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.shadowBlur=0;
  }

  private drawBackground(ctx:CanvasRenderingContext2D,s:SpaceEvolvesRenderState){
    const {width:w,height:h,time:t}=s;
    if(this.backgroundWidth!==w||this.backgroundHeight!==h||!this.background||!this.vignette){
      this.backgroundWidth=w;this.backgroundHeight=h;
      this.background=ctx.createRadialGradient(w*.5,h*.35,10,w*.5,h*.5,w*1.1);
      this.background.addColorStop(0,'#0b1430');this.background.addColorStop(.55,'#050a1c');this.background.addColorStop(1,'#01030a');
      this.vignette=ctx.createRadialGradient(w*.5,h*.5,Math.min(w,h)*.25,w*.5,h*.5,Math.max(w,h)*.75);
      this.vignette.addColorStop(0,'rgba(0,0,0,0)');this.vignette.addColorStop(1,'rgba(0,0,10,.55)');
    }
    ctx.fillStyle=this.background;ctx.fillRect(0,0,w,h);ctx.save();ctx.globalCompositeOperation='lighter';
    for(let k=0;k<3;k++){const x=w*(.25+.5*(.5+.5*Math.sin(t*.05+k*2.1))),y=h*(.3+.4*(.5+.5*Math.cos(t*.07+k*1.7))),r=w*(.45+k*.16),g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,NEBULA[k]);g.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);}
    ctx.restore();
  }
  private drawStars(ctx:CanvasRenderingContext2D,w:number,h:number,t:number){
    for(let layer=0;layer<3;layer++){const par=STAR_PARALLAX[layer],count=STAR_COUNT[layer],speed=STAR_SPEED[layer],alpha=STAR_ALPHA[layer],size=layer===2?2.4:layer===1?1.6:1;for(let i=0;i<count;i++){const x=((i*61.8+37)%101)/100*w,y=(((i*137.3+13)%97)/100*h+t*speed)%h,tw=.5+.5*Math.sin(t*(1+par*140)+i*3.3);ctx.globalAlpha=alpha*(.35+.55*tw);ctx.fillStyle=layer===2&&tw>.82?'#eaf6ff':STAR_COLORS[layer];ctx.fillRect(x,y,size,size);}}
    ctx.globalAlpha=1;
  }
  private drawBackgroundShip(ctx:CanvasRenderingContext2D,s:SpaceEvolvesRenderState,ship:any){
    const w=s.width,h=s.height,fade=Math.min(1,ship.life/1.2,(ship.maxLife-ship.life)/1.2),color=ship.enemy?'#ff6b9d':'#73d8ff';
    ctx.save();ctx.globalAlpha=.22*fade;ctx.globalCompositeOperation='lighter';
    if(!this.drawSprite(ctx,s,ship.x*w,ship.y*h,ship.size*w,Math.floor(ship.life*8+ship.phase)+12,color,ship.angle))this.drawProceduralShip(ctx,ship.x*w,ship.y*h,ship.size*w,ship.angle,ship.enemy?'#e3b7cc':'#b9d9e8',color);
    ctx.globalAlpha=.12*fade;ctx.strokeStyle=color;ctx.lineWidth=Math.max(1,w*.0015);ctx.beginPath();ctx.moveTo((ship.x-ship.vx*28)*w,ship.y*h);ctx.lineTo((ship.x-ship.vx*7)*w,ship.y*h);ctx.stroke();ctx.restore();
    for(const escort of ship.escorts||[]){ctx.save();ctx.globalAlpha=.18*fade;const z=ship.size*w*.42;if(!this.drawSprite(ctx,s,escort.x*w,escort.y*h,z,Math.floor(ship.life*9+escort.phase)+12,'#8affff',ship.angle))this.drawProceduralShip(ctx,escort.x*w,escort.y*h,z,ship.angle,'#b8efff','#8affff');ctx.restore();}
    for(const foe of ship.threats||[]){const x=foe.x*w,y=foe.y*h,r=Math.max(1.5,ship.size*w*.22),attack=Math.max(0,1-foe.cooldown/1.1);ctx.save();ctx.globalCompositeOperation='lighter';ctx.globalAlpha=.45*fade;ctx.fillStyle='#ff557d';ctx.shadowBlur=6;ctx.shadowColor='#ff557d';ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();ctx.globalAlpha=.2*fade;ctx.strokeStyle='#ff9ab0';ctx.lineWidth=Math.max(1,w*.001);ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(ship.x*w,ship.y*h);ctx.stroke();if(attack>.85){ctx.globalAlpha=.65*fade;ctx.fillStyle='#ffd1dd';ctx.beginPath();ctx.arc(x+(ship.x-foe.x)*w*.22,y+(ship.y-foe.y)*h*.22,Math.max(1,r*.45),0,Math.PI*2);ctx.fill();}ctx.restore();}
  }
  private drawBackgroundCloud(ctx:CanvasRenderingContext2D,s:SpaceEvolvesRenderState,c:any){const pulse=1+Math.sin(s.time*1.4+c.seed)*.08,w=s.width,h=s.height;ctx.save();ctx.globalCompositeOperation='lighter';ctx.globalAlpha=.09;const g=ctx.createRadialGradient(c.x*w,c.y*h,0,c.x*w,c.y*h,c.radius*w*pulse);g.addColorStop(0,c.seed%3===0?'#a67cff':c.seed%3===1?'#4de1ff':'#ff6bd6');g.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=g;ctx.fillRect((c.x-c.radius)*w,(c.y-c.radius)*h,c.radius*2*w,c.radius*2*h);ctx.restore();}
  private drawCloud(ctx:CanvasRenderingContext2D,s:SpaceEvolvesRenderState,c:any){const a=Math.max(0,c.life/c.maxLife),r=Math.max(2,c.radius*s.width),pulse=1+.08*Math.sin(s.time*5+c.x*17);ctx.save();ctx.translate(c.x*s.width,c.y*s.height);ctx.globalCompositeOperation='lighter';ctx.globalAlpha=.12*a;const g=ctx.createRadialGradient(0,0,r*.08,0,0,r*pulse);g.addColorStop(0,'rgba(232,255,166,.95)');g.addColorStop(.25,'rgba(182,255,77,.7)');g.addColorStop(.68,'rgba(73,174,55,.28)');g.addColorStop(1,'rgba(20,70,35,0)');ctx.fillStyle=g;ctx.beginPath();ctx.arc(0,0,r*pulse,0,Math.PI*2);ctx.fill();ctx.globalAlpha=.42*a;ctx.strokeStyle='#b6ff4d';ctx.lineWidth=Math.max(1.5,s.width*.003);ctx.setLineDash([r*.12,r*.08]);ctx.beginPath();ctx.arc(0,0,r*(.72+.08*Math.sin(s.time*3+c.y*11)),0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);ctx.restore();}
  private drawEffect(ctx:CanvasRenderingContext2D,s:SpaceEvolvesRenderState,e:any){const a=Math.max(0,e.life/e.maxLife),w=s.width,h=s.height;if(e.kind==='ring'){const p=1-a,r=Math.max(1,(e.len||.1)*w*(.3+.7*p));ctx.save();ctx.globalAlpha=a;ctx.strokeStyle=e.color;ctx.lineWidth=Math.max(1.5,w*.006*(1-p)+1);ctx.beginPath();ctx.arc(e.x*w,e.y*h,r,0,Math.PI*2);ctx.stroke();ctx.restore();return;}if(e.kind==='edge'){const len=Math.max(0,(e.len||0)*(.25+.75*a))*w;ctx.save();ctx.translate(e.x*w,e.y*h);ctx.rotate((e.angle||0)+(e.spin||0)*(e.maxLife-e.life));ctx.globalAlpha=Math.min(1,a*1.6);ctx.strokeStyle=e.color;ctx.lineWidth=Math.max(1,w*.003);ctx.beginPath();ctx.moveTo(-len/2,0);ctx.lineTo(len/2,0);ctx.stroke();ctx.restore();return;}ctx.globalAlpha=a;ctx.fillStyle=e.color;ctx.beginPath();ctx.arc(e.x*w,e.y*h,Math.max(1,e.size*w*a),0,Math.PI*2);ctx.fill();}
  private drawProjectile(ctx:CanvasRenderingContext2D,s:SpaceEvolvesRenderState,p:any){const w=s.width,h=s.height;if(p.kind==='laser'){this.drawLaser(ctx,p,w,h);return;}if(p.kind==='missile'){this.drawMissile(ctx,p,w,h);return;}if(p.kind==='plasma'){this.drawPlasma(ctx,p,w,h);return;}if(p.kind==='chem'){this.drawChem(ctx,p,w,h);return;}const x=p.x*w,y=p.y*h,r=Math.max(2,p.radius*w);ctx.fillStyle=p.kind==='boss'?'#ff4f9a':p.kind==='drone'?'#7dff9a':'#7cf7ff';ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();}
  private drawLaser(ctx:CanvasRenderingContext2D,p:any,w:number,h:number){const x=p.x*w,y=p.y*h,a=Math.atan2(p.vy,p.vx),r=Math.max(1.5,Math.min(4,p.radius*w*.9)),len=Math.max(10,Math.min(w*.14,Math.hypot(p.vx,p.vy)*w*.08));ctx.save();ctx.translate(x,y);ctx.rotate(a);ctx.globalCompositeOperation='lighter';ctx.strokeStyle='rgba(124,247,255,.3)';ctx.lineWidth=r*2.6;ctx.beginPath();ctx.moveTo(-len*.7,0);ctx.lineTo(len*.45,0);ctx.stroke();ctx.shadowBlur=0;ctx.strokeStyle='#7cf7ff';ctx.lineWidth=r*1.25;ctx.beginPath();ctx.moveTo(-len*.62,0);ctx.lineTo(len*.5,0);ctx.stroke();ctx.strokeStyle='#fff';ctx.lineWidth=Math.max(1,r*.45);ctx.beginPath();ctx.moveTo(-len*.52,0);ctx.lineTo(len*.56,0);ctx.stroke();ctx.restore();}
  private drawMissile(ctx:CanvasRenderingContext2D,p:any,w:number,h:number){const x=p.x*w,y=p.y*h,a=Math.atan2(p.vy,p.vx),r=Math.max(3.5,p.radius*w),pulse=.72+.28*Math.sin((p.age||0)*34);ctx.save();ctx.translate(x,y);ctx.rotate(a);ctx.globalCompositeOperation='lighter';
    // A compact advanced interceptor: hot exhaust and ion wake trail behind the body.
    ctx.shadowBlur=10;ctx.shadowColor='#ff7b3d';ctx.fillStyle='rgba(255,126,56,.28)';ctx.beginPath();ctx.moveTo(-r*.72,-r*.28);ctx.lineTo(-r*(2.8+pulse*.55),0);ctx.lineTo(-r*.72,r*.28);ctx.closePath();ctx.fill();
    ctx.fillStyle='#ffd27a';ctx.beginPath();ctx.moveTo(-r*.62,-r*.16);ctx.lineTo(-r*(2.05+pulse*.35),0);ctx.lineTo(-r*.62,r*.16);ctx.closePath();ctx.fill();
    // Stabiliser fins and rear control surfaces.
    ctx.shadowBlur=0;ctx.fillStyle='#465b78';ctx.strokeStyle='#a9c9df';ctx.lineWidth=Math.max(.8,r*.1);ctx.beginPath();ctx.moveTo(-r*.48,-r*.28);ctx.lineTo(-r*1.05,-r*.9);ctx.lineTo(-r*.95,-r*.18);ctx.closePath();ctx.fill();ctx.stroke();ctx.beginPath();ctx.moveTo(-r*.48,r*.28);ctx.lineTo(-r*1.05,r*.9);ctx.lineTo(-r*.95,r*.18);ctx.closePath();ctx.fill();ctx.stroke();
    // Faceted titanium fuselage with a needle nose and chamfered tail.
    const body=ctx.createLinearGradient(-r,0,r*1.7,0);body.addColorStop(0,'#34465e');body.addColorStop(.28,'#b9d2df');body.addColorStop(.62,'#f4fbff');body.addColorStop(1,'#718ca5');ctx.fillStyle=body;ctx.strokeStyle='#dff7ff';ctx.lineWidth=Math.max(1,r*.11);ctx.beginPath();ctx.moveTo(r*1.72,0);ctx.lineTo(r*.88,-r*.31);ctx.lineTo(-r*.72,-r*.27);ctx.lineTo(-r*1.08,0);ctx.lineTo(-r*.72,r*.27);ctx.lineTo(r*.88,r*.31);ctx.closePath();ctx.fill();ctx.stroke();
    // Dark sensor canopy and twin guidance lamps make the heading obvious.
    ctx.fillStyle='#142538';ctx.strokeStyle='#79dfff';ctx.lineWidth=Math.max(.7,r*.07);ctx.beginPath();ctx.ellipse(r*.55,0,r*.48,r*.17,0,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle='#bff8ff';ctx.beginPath();ctx.arc(r*.76,-r*.07,r*.055,0,Math.PI*2);ctx.arc(r*.76,r*.07,r*.055,0,Math.PI*2);ctx.fill();
    // Rear reactor ring and pulsing core.
    ctx.strokeStyle='#ffb15c';ctx.lineWidth=Math.max(1,r*.1);ctx.beginPath();ctx.arc(-r*.78,0,r*.2,0,Math.PI*2);ctx.stroke();ctx.fillStyle=pulse>.85?'#fff4bb':'#ff8c45';ctx.beginPath();ctx.arc(-r*.82,0,r*.1,0,Math.PI*2);ctx.fill();ctx.restore();}
  private drawPlasma(ctx:CanvasRenderingContext2D,p:any,w:number,h:number){const x=p.x*w,y=p.y*h,a=Math.atan2(p.vy,p.vx),r=Math.max(4,p.radius*w);ctx.save();ctx.translate(x,y);ctx.rotate(a);ctx.shadowBlur=14;ctx.shadowColor='#ff66dd';ctx.fillStyle='rgba(255,102,221,.35)';ctx.beginPath();ctx.ellipse(0,0,r*2,r*.8,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#ff9df0';ctx.beginPath();ctx.ellipse(0,0,r*1.25,r*.45,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff';ctx.beginPath();ctx.ellipse(0,0,r*.6,r*.22,0,0,Math.PI*2);ctx.fill();ctx.restore();}
  private drawChem(ctx:CanvasRenderingContext2D,p:any,w:number,h:number){const x=p.x*w,y=p.y*h,a=Math.atan2(p.vy,p.vx),r=Math.max(4,p.radius*w),pulse=1+.1*Math.sin(performance.now()/80);ctx.save();ctx.translate(x,y);ctx.rotate(a);ctx.globalCompositeOperation='lighter';ctx.shadowBlur=14;ctx.shadowColor='#8dff4f';ctx.fillStyle='rgba(80,220,62,.24)';ctx.beginPath();ctx.ellipse(-r*.6,0,r*2,r*.75,0,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;ctx.fillStyle='#396f2d';ctx.strokeStyle='#b6ff4d';ctx.lineWidth=Math.max(1,r*.12);ctx.beginPath();ctx.moveTo(r*1.25,0);ctx.bezierCurveTo(r*.75,-r*.8,-r*.45,-r*.72,-r*.95,-r*.15);ctx.bezierCurveTo(-r*1.25,r*.35,-r*.25,r*.75,r*1.25,0);ctx.fill();ctx.stroke();ctx.fillStyle='#9cff45';ctx.beginPath();ctx.ellipse(0,0,r*.6*pulse,r*.35*pulse,0,0,Math.PI*2);ctx.fill();ctx.restore();}
  private drawShip(ctx:CanvasRenderingContext2D,s:SpaceEvolvesRenderState,x:number,y:number,z:number){if(this.drawSprite(ctx,s,x,y,z,Math.floor(s.time*7)%4+12,'#55dfff')){this.drawShield(ctx,s,x,y,z);return;}this.drawProceduralShip(ctx,x,y,z);this.drawShield(ctx,s,x,y,z);}
  private drawDrones(ctx:CanvasRenderingContext2D,s:SpaceEvolvesRenderState){if(!s.orbitDrones.length)return;for(const d of s.orbitDrones){const z=Math.min(s.width,s.height)*.016,sp=Math.hypot(d.vx,d.vy),angle=sp>.02?Math.atan2(d.vy,d.vx)+Math.PI/2:0;if(!this.drawSprite(ctx,s,d.x*s.width,d.y*s.height,z,Math.floor(s.time*8+d.phase*2)%16,'#7dff9a',angle))this.drawProceduralShip(ctx,d.x*s.width,d.y*s.height,z,angle,'#0d2b1a','#7dff9a');}}
  private drawShield(ctx:CanvasRenderingContext2D,s:SpaceEvolvesRenderState,x:number,y:number,z:number){if(s.shieldTimer>s.shieldInterval-s.shieldVisibleFor){ctx.save();ctx.strokeStyle=s.shieldKnockback>0?'#8fb2ff':'#55eaff';ctx.shadowBlur=14;ctx.shadowColor=ctx.strokeStyle;ctx.lineWidth=Math.max(2,z*.045);ctx.beginPath();ctx.arc(x,y,z*(1.45+s.shieldRadius*4),0,Math.PI*2);ctx.stroke();ctx.restore();}}
  private drawSprite(ctx:CanvasRenderingContext2D,s:SpaceEvolvesRenderState,x:number,y:number,z:number,frame:number,glow:string,angle=0){if(!s.playerSpriteReady||!s.playerSprite)return false;const fw=s.playerSprite.naturalWidth/4,fh=s.playerSprite.naturalHeight/4;if(!fw||!fh)return false;const cell=((Math.floor(frame)%16)+16)%16,dw=z*2.15;ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.imageSmoothingEnabled=false;ctx.shadowBlur=14;ctx.shadowColor=glow;ctx.drawImage(s.playerSprite,(cell%4)*fw,Math.floor(cell/4)*fh,fw,fh,-dw/2,-dw*(fh/fw)/2,dw,dw*(fh/fw));ctx.restore();return true;}
  private drawProceduralShip(ctx:CanvasRenderingContext2D,x:number,y:number,z:number,angle=0,fill='#b9d9e8',stroke='#66ddff'){ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.fillStyle=fill;ctx.strokeStyle=stroke;ctx.beginPath();ctx.moveTo(0,-z*1.35);ctx.lineTo(z*.82,z*.48);ctx.lineTo(z*.42,z*.7);ctx.lineTo(0,z*.55);ctx.lineTo(-z*.42,z*.7);ctx.lineTo(-z*.82,z*.48);ctx.closePath();ctx.fill();ctx.stroke();ctx.fillStyle=stroke;ctx.beginPath();ctx.ellipse(0,-z*.08,z*.22,z*.48,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#8affff';ctx.beginPath();ctx.arc(0,z*.38,z*.12,0,Math.PI*2);ctx.fill();ctx.restore();}
  private drawBug(ctx:CanvasRenderingContext2D,s:SpaceEvolvesRenderState,b:any,x:number,y:number,z:number){const t=s.time,units=Math.min(b.boss?10:8,Math.max(1,b.segments||1));let color=b.ally?'#a66cff':b.chemDotTimer>0?'#a8ff3e':b.boss?'#ff557d':b.trait==='armored'?'#b9c7d8':b.trait==='charger'?'#ff9c4a':b.trait==='splitter'?'#f5e85b':b.trait==='weaver'?'#53d8ff':b.trait==='volatile'?'#ff4b58':b.trait==='regenerator'?'#74ff91':b.kind==='queen'?'#ff557d':b.kind==='mantis'?'#d875ff':'#74ff91';ctx.save();ctx.translate(x,y);ctx.rotate(Math.sin(t*2+b.phase)*.18);const spin=t*(1.1+b.speed*4)+b.phase;for(let i=0;i<units;i++){const u=units===1?0:i/(units-1)-.5,wob=Math.sin(t*2.2+b.phase+i*1.7);NODES[i*2]=Math.cos(spin+u*2.8)*z*u*1.55+wob*z*.06;NODES[i*2+1]=Math.sin(spin+u*2.8)*z*u*.65+Math.cos(t*1.9+i+b.phase)*z*.07;}ctx.strokeStyle=color;ctx.lineWidth=Math.max(1.5,z*.08);ctx.globalAlpha=.9;for(let i=0;i<units-1;i++){ctx.beginPath();ctx.moveTo(NODES[i*2],NODES[i*2+1]);ctx.lineTo(NODES[i*2+2],NODES[i*2+3]);ctx.stroke();}for(let i=0;i<units;i++){if(i>=b.segments)continue;const nx=NODES[i*2],ny=NODES[i*2+1],size=z*(b.boss?.66:.5);this.drawTesseract(ctx,size,spin+i*.9,color,s.detail);ctx.save();ctx.translate(nx,ny);this.drawTesseract(ctx,size,spin+i*.9,color,s.detail);ctx.restore();}this.drawBugFace(ctx,z,b,color,units,t);if(b.chemDotTimer>0)this.drawPoison(ctx,z,b,t,units);ctx.restore();}
  private drawTesseract(ctx:CanvasRenderingContext2D,size:number,spin:number,color:string,detail:number){const ca=Math.cos(spin),sa=Math.sin(spin),cb=Math.cos(spin*.7+1),sb=Math.sin(spin*.7+1);for(let i=0;i<8;i++){const X=(i>>2&1)?1:-1,Y=(i>>1&1)?1:-1,Z=(i&1)?1:-1,x=X*ca-Z*sa,z=X*sa+Z*ca;let y=Y*cb-sb,w=Y*sb+cb,p=3/(3-w*.9)/(3-z*.9);OUTER[i*2]=x*size*p;OUTER[i*2+1]=y*size*p;y=Y*cb+sb;w=Y*sb-cb;p=3/(3-w*.9)/(3-z*.9);INNER[i*2]=x*size*p;INNER[i*2+1]=y*size*p;}ctx.strokeStyle=color;ctx.lineWidth=Math.max(1.2,size*.08);this.strokeCube(ctx,OUTER);if(detail>1){ctx.strokeStyle='#fff';ctx.globalAlpha=.8;this.strokeCube(ctx,INNER);ctx.globalAlpha=1;}}
  private strokeCube(ctx:CanvasRenderingContext2D,p:Float64Array){ctx.beginPath();ctx.moveTo(p[0],p[1]);ctx.lineTo(p[2],p[3]);ctx.lineTo(p[6],p[7]);ctx.lineTo(p[4],p[5]);ctx.closePath();ctx.moveTo(p[8],p[9]);ctx.lineTo(p[10],p[11]);ctx.lineTo(p[14],p[15]);ctx.lineTo(p[12],p[13]);ctx.closePath();ctx.moveTo(p[0],p[1]);ctx.lineTo(p[8],p[9]);ctx.moveTo(p[2],p[3]);ctx.lineTo(p[10],p[11]);ctx.moveTo(p[4],p[5]);ctx.lineTo(p[12],p[13]);ctx.moveTo(p[6],p[7]);ctx.lineTo(p[14],p[15]);ctx.stroke();}
  private drawBugFace(ctx:CanvasRenderingContext2D,z:number,b:any,color:string,units:number,t:number){const x=NODES[0],y=NODES[1];ctx.save();ctx.translate(x,y);const eye=z*(b.boss?.17:.12);ctx.fillStyle='#fff';for(const side of[-1,1]){ctx.beginPath();ctx.arc(side*z*(b.boss?.42:.3),-z*.1,eye,0,Math.PI*2);ctx.fill();}ctx.strokeStyle=color;ctx.lineWidth=Math.max(1.5,z*.08);for(const side of[-1,1]){ctx.beginPath();ctx.moveTo(side*z*.14,z*.16);ctx.quadraticCurveTo(side*z*.5,z*.35,side*z*.45,z*.62);ctx.stroke();}ctx.restore();}
  private drawPoison(ctx:CanvasRenderingContext2D,z:number,b:any,t:number,units:number){ctx.save();ctx.globalCompositeOperation='lighter';for(let i=0;i<Math.min(units,4);i++){const x=NODES[i*2],y=NODES[i*2+1],phase=b.phase+i*1.73,p=.5+.5*Math.sin(t*3.8+phase);ctx.globalAlpha=.35+.25*p;ctx.strokeStyle='#d8ff83';ctx.lineWidth=Math.max(1,z*.045);ctx.beginPath();ctx.arc(x+Math.sin(t*2.4+phase)*z*.12,y-z*(.2+.08*p),z*(.08+.035*p),0,Math.PI*2);ctx.stroke();ctx.globalAlpha=.55;ctx.strokeStyle='#9cff45';ctx.beginPath();ctx.moveTo(x,y+z*.18);ctx.quadraticCurveTo(x+Math.sin(t*2.8+phase)*z*.1,y+z*.35,x+Math.sin(t*2.8+phase)*z*.1,y+z*.55);ctx.stroke();}ctx.restore();}
}
