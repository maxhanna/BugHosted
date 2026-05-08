import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';

@Component({
  selector: 'app-globe',
  templateUrl: './globe.component.html',
  styleUrls: ['./globe.component.css'],
  standalone: false
})
export class GlobeComponent implements OnInit, OnDestroy {
  @ViewChild('globeCanvas', { static: true }) globeCanvas!: ElementRef<HTMLCanvasElement>;

  private gl!: WebGLRenderingContext;
  private globeProg!: WebGLProgram;
  private starProg!: WebGLProgram;
  private sphereVbo!: WebGLBuffer;
  private sphereIbo!: WebGLBuffer;
  private sphereIdxCount = 0;
  private starVbo!: WebGLBuffer;
  private starVtxCount = 0;
  private globeTex!: WebGLTexture;

  private readonly TILE = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
  private tileCache = new Map<string, HTMLImageElement | 'loading' | 'error'>();
  private texCanvas!: HTMLCanvasElement;
  private texCtx!: CanvasRenderingContext2D;
  private readonly TW = 2048;
  private readonly TH = 1024;
  private lastTileZoom = -1;
  private texDirty = false;

  private rot = new Float32Array([1,0,0, 0,1,0, 0,0,1]) as Float32Array;
  private camDist = 2.8;
  private camDistTarget = 2.8;

  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private velLon = 0;
  private velLat = 0;
  private lastMoveTime = 0;
  private pinchDist0 = 0;
  private pinchCamDist0 = 0;

  private rafId = 0;
  private alive = true;

  ngOnInit(): void {
    this.initGL();
    this.buildSphere();
    this.buildStars();
    this.buildTexCanvas();
    this.initTexture();
    this.setupEvents();
    this.loop();
  }

  ngOnDestroy(): void {
    this.alive = false;
    cancelAnimationFrame(this.rafId);
  }

  private initGL(): void {
    const canvas = this.globeCanvas.nativeElement;
    const opts = { alpha: true, premultipliedAlpha: false, antialias: true };
    this.gl = (canvas.getContext('webgl', opts) ||
               canvas.getContext('experimental-webgl', opts)) as WebGLRenderingContext;
    const gVS = `attribute vec3 aPos;attribute vec2 aUV;uniform mat4 uMVP;varying vec2 vUV;void main(){gl_Position=uMVP*vec4(aPos,1.0);vUV=aUV;}`;
    const gFS = `precision mediump float;varying vec2 vUV;uniform sampler2D uTex;void main(){gl_FragColor=vec4(texture2D(uTex,vUV).rgb,1.0);}`;
    this.globeProg = this.makeProgram(gVS, gFS);
    const sVS = `attribute vec3 aPos;attribute float aBright;uniform mat4 uMVP;varying float vB;void main(){gl_Position=uMVP*vec4(aPos,1.0);gl_PointSize=1.5;vB=aBright;}`;
    const sFS = `precision mediump float;varying float vB;void main(){gl_FragColor=vec4(vB,vB,vB,1.0);}`;
    this.starProg = this.makeProgram(sVS, sFS);
  }

  private buildSphere(): void {
    const LAT = 64, LON = 128;
    const verts: number[] = [];
    const idx: number[] = [];
    for (let la = 0; la <= LAT; la++) {
      const theta = la * Math.PI / LAT;
      const st = Math.sin(theta), ct = Math.cos(theta);
      for (let lo = 0; lo <= LON; lo++) {
        const phi = lo * 2 * Math.PI / LON;
        verts.push(Math.cos(phi)*st, ct, Math.sin(phi)*st, lo/LON, 1-la/LAT);
      }
    }
    for (let la = 0; la < LAT; la++)
      for (let lo = 0; lo < LON; lo++) {
        const a = la*(LON+1)+lo, b = a+LON+1;
        idx.push(a,b,a+1,b,b+1,a+1);
      }
    const gl = this.gl;
    this.sphereVbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.sphereVbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
    this.sphereIbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.sphereIbo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(idx), gl.STATIC_DRAW);
    this.sphereIdxCount = idx.length;
  }

  private buildStars(): void {
    const N = 3000;
    const verts: number[] = [];
    const rng = (s: number) => { const v = Math.sin(s*127.1+311.7)*43758.5453; return v-Math.floor(v); };
    for (let i = 0; i < N; i++) {
      const u = rng(i*2.1)*2-1, t = rng(i*3.7)*2*Math.PI, r = Math.sqrt(1-u*u);
      verts.push(r*Math.cos(t)*50, u*50, r*Math.sin(t)*50, 0.4+rng(i*5.3)*0.6);
    }
    const gl = this.gl;
    this.starVbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.starVbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
    this.starVtxCount = N;
  }

  private buildTexCanvas(): void {
    this.texCanvas = document.createElement('canvas');
    this.texCanvas.width = this.TW; this.texCanvas.height = this.TH;
    this.texCtx = this.texCanvas.getContext('2d')!;
    this.texCtx.fillStyle = '#1a3a5c';
    this.texCtx.fillRect(0, 0, this.TW, this.TH);
  }

  private initTexture(): void {
    const gl = this.gl;
    this.globeTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.globeTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.TW, this.TH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.uploadTexCanvas();
    this.loadTilesForZoom(2);
  }

  private tileZoomFromDist(d: number): number {
    const z = Math.round(2 + Math.log2(2.8 / Math.max(0.01, d - 1.0)));
    return Math.max(0, Math.min(10, z));
  }

  private loadTilesForZoom(z: number): void {
    if (z === this.lastTileZoom) return;
    this.lastTileZoom = z;
    const n = Math.pow(2, z);
    const tileW = this.TW / n, tileH = this.TH / n;
    for (let ty = 0; ty < n; ty++) {
      for (let tx = 0; tx < n; tx++) {
        const key = `${z}/${tx}/${ty}`;
        if (this.tileCache.has(key)) {
          const e = this.tileCache.get(key)!;
          if (e instanceof HTMLImageElement) { this.drawTile(e, tx, ty, n, tileW, tileH, z); }
          continue;
        }
        this.tileCache.set(key, 'loading');
        const url = this.TILE.replace('{z}',String(z)).replace('{x}',String(tx)).replace('{y}',String(ty));
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => { this.tileCache.set(key, img); this.drawTile(img, tx, ty, n, tileW, tileH, z); this.texDirty = true; };
        img.onerror = () => this.tileCache.set(key, 'error');
        img.src = url;
      }
    }
  }

  private drawTile(img: HTMLImageElement, tx: number, ty: number, n: number, tileW: number, tileH: number, z: number): void {
    const destX = Math.round(tx * tileW), destY = Math.round(ty * tileH);
    const dw = Math.round(tileW), dh = Math.round(tileH);
    const tmp = document.createElement('canvas');
    tmp.width = dw; tmp.height = dh;
    const tc = tmp.getContext('2d')!;
    tc.drawImage(img, 0, 0, dw, dh);
    const src = tc.getImageData(0, 0, dw, dh);
    const out = this.texCtx.createImageData(dw, dh);
    const latTop = 90 - ty * (180 / n);
    const latBot = 90 - (ty+1) * (180 / n);
    for (let row = 0; row < dh; row++) {
      const latDeg = latTop - (row / dh) * (latTop - latBot);
      const latRad = latDeg * Math.PI / 180;
      const mercY = Math.log(Math.tan(Math.PI/4 + latRad/2));
      const mercTop = Math.log(Math.tan(Math.PI/4 + latTop*Math.PI/360));
      const mercBot = Math.log(Math.tan(Math.PI/4 + latBot*Math.PI/360));
      const srcRow = Math.round(((mercTop - mercY) / (mercTop - mercBot)) * (dh - 1));
      if (srcRow < 0 || srcRow >= dh) continue;
      for (let col = 0; col < dw; col++) {
        const si = (srcRow*dw+col)*4, di = (row*dw+col)*4;
        out.data[di]=src.data[si]; out.data[di+1]=src.data[si+1]; out.data[di+2]=src.data[si+2]; out.data[di+3]=255;
      }
    }
    this.texCtx.putImageData(out, destX, destY);
  }

  private uploadTexCanvas(): void {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.globeTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.texCanvas);
    this.texDirty = false;
  }

  private setupEvents(): void {
    const c = this.globeCanvas.nativeElement;
    c.addEventListener('mousedown',  (e: Event) => this.onMouseDown(e as MouseEvent));
    c.addEventListener('mousemove',  (e: Event) => this.onMouseMove(e as MouseEvent));
    c.addEventListener('mouseup',    () => this.onMouseUp());
    c.addEventListener('mouseleave', () => this.onMouseUp());
    c.addEventListener('wheel',      (e: Event) => this.onWheel(e as WheelEvent), { passive: false });
    c.addEventListener('touchstart', (e: Event) => this.onTouchStart(e as TouchEvent), { passive: false });
    c.addEventListener('touchmove',  (e: Event) => this.onTouchMove(e as TouchEvent),  { passive: false });
    c.addEventListener('touchend',   () => this.onMouseUp());
  }

  private onMouseDown(e: MouseEvent): void {
    this.dragging = true; this.lastX = e.clientX; this.lastY = e.clientY;
    this.velLon = 0; this.velLat = 0; this.lastMoveTime = performance.now();
  }
  private onMouseMove(e: MouseEvent): void {
    if (!this.dragging) return;
    const dx = e.clientX - this.lastX, dy = e.clientY - this.lastY;
    const now = performance.now(), dt = Math.max(1, now - this.lastMoveTime);
    const sp = 0.005 * this.camDist;
    this.applyRotation(dx*sp, dy*sp);
    this.velLon = dx*sp/dt*16; this.velLat = dy*sp/dt*16;
    this.lastX = e.clientX; this.lastY = e.clientY; this.lastMoveTime = now;
  }
  private onMouseUp(): void { this.dragging = false; }
  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    this.camDistTarget = Math.max(1.02, Math.min(8, this.camDistTarget * (e.deltaY > 0 ? 1.12 : 0.89)));
  }
  private onTouchStart(e: TouchEvent): void {
    e.preventDefault();
    if (e.touches.length === 1) {
      this.dragging = true; this.lastX = e.touches[0].clientX; this.lastY = e.touches[0].clientY;
      this.velLon = 0; this.velLat = 0;
    } else if (e.touches.length === 2) {
      this.dragging = false; this.pinchDist0 = this.touchDist(e); this.pinchCamDist0 = this.camDist;
    }
  }
  private onTouchMove(e: TouchEvent): void {
    e.preventDefault();
    if (e.touches.length === 1 && this.dragging) {
      const dx = e.touches[0].clientX - this.lastX, dy = e.touches[0].clientY - this.lastY;
      this.applyRotation(dx*0.005*this.camDist, dy*0.005*this.camDist);
      this.lastX = e.touches[0].clientX; this.lastY = e.touches[0].clientY;
    } else if (e.touches.length === 2) {
      this.camDistTarget = Math.max(1.02, Math.min(8, this.pinchCamDist0 * (this.pinchDist0 / this.touchDist(e))));
    }
  }
  private touchDist(e: TouchEvent): number {
    const dx = e.touches[1].clientX-e.touches[0].clientX, dy = e.touches[1].clientY-e.touches[0].clientY;
    return Math.sqrt(dx*dx+dy*dy);
  }

  private applyRotation(dLon: number, dLat: number): void {
    this.rot = this.mulRot(this.rotY(dLon), this.rot);
    const rx = this.rot[0], ry = this.rot[3], rz = this.rot[6];
    this.rot = this.mulRot(this.rotAxis(rx, ry, rz, dLat), this.rot);
  }
private rotY(a: number): Float32Array {
    const c = Math.cos(a), s = Math.sin(a);
    return new Float32Array([c,0,s, 0,1,0, -s,0,c]) as Float32Array;
  }
  private rotAxis(ax: number, ay: number, az: number, a: number): Float32Array {
    const c = Math.cos(a), s = Math.sin(a), t = 1-c;
    const len = Math.sqrt(ax*ax+ay*ay+az*az)||1;
    ax/=len; ay/=len; az/=len;
    return new Float32Array([t*ax*ax+c,t*ax*ay-s*az,t*ax*az+s*ay, t*ax*ay+s*az,t*ay*ay+c,t*ay*az-s*ax, t*ax*az-s*ay,t*ay*az+s*ax,t*az*az+c]) as Float32Array;
  }
  private mulRot(a: Float32Array, b: Float32Array): Float32Array {
    const r = new Float32Array(9) as Float32Array;
    for (let i=0;i<3;i++) for (let j=0;j<3;j++) for (let k=0;k<3;k++) r[i*3+j]+=a[i*3+k]*b[k*3+j];
    return r;
  }

private projMatrix(w: number, h: number): Float32Array {
    const fov = 45*Math.PI/180, asp = w/h||1, n = 0.1, f = 200, t = Math.tan(fov/2);
    const m = new Float32Array(16) as Float32Array;
    m[0]=1/(asp*t); m[5]=1/t; m[10]=(f+n)/(n-f); m[11]=-1; m[14]=2*f*n/(n-f);
    return m;
  }
  private mvpMatrix(w: number, h: number): Float32Array {
    const P = this.projMatrix(w, h), R = this.rot, d = this.camDist;
    const MV = new Float32Array([R[0],R[3],R[6],0, R[1],R[4],R[7],0, R[2],R[5],R[8],0, 0,0,-d,1]) as Float32Array;
    return this.mul4(P, MV);
  }
  private starMVP(w: number, h: number): Float32Array {
    const P = this.projMatrix(w, h);
    const MV = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,-this.camDist,1]) as Float32Array;
    return this.mul4(P, MV);
  }
  private mul4(a: Float32Array, b: Float32Array): Float32Array {
    const r = new Float32Array(16) as Float32Array;
    for (let i=0;i<4;i++) for (let j=0;j<4;j++) for (let k=0;k<4;k++) r[i*4+j]+=a[i*4+k]*b[k*4+j];
    return r;
  }

  private loop(): void {
    if (!this.alive) return;
    this.rafId = requestAnimationFrame(() => this.loop());
    this.camDist += (this.camDistTarget - this.camDist) * 0.12;
    if (!this.dragging) {
      if (Math.abs(this.velLon) > 0.00001 || Math.abs(this.velLat) > 0.00001) {
        this.applyRotation(this.velLon, this.velLat);
        this.velLon *= 0.92; this.velLat *= 0.92;
      }
    }
    const tz = this.tileZoomFromDist(this.camDist);
    if (tz !== this.lastTileZoom) this.loadTilesForZoom(tz);
    if (this.texDirty) this.uploadTexCanvas();
    this.draw();
  }

  private draw(): void {
    const canvas = this.globeCanvas.nativeElement;
    const w = canvas.clientWidth||400, h = canvas.clientHeight||400;
    if (canvas.width!==w||canvas.height!==h) { canvas.width=w; canvas.height=h; }
    const gl = this.gl;
    gl.viewport(0,0,w,h);
    gl.clearColor(0,0,0,0);
    gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);

    // Stars (fixed in space, no globe rotation)
    gl.depthMask(false);
    gl.useProgram(this.starProg);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.starProg,'uMVP'),false,this.starMVP(w,h));
    gl.bindBuffer(gl.ARRAY_BUFFER, this.starVbo);
    const sP=gl.getAttribLocation(this.starProg,'aPos'), sB=gl.getAttribLocation(this.starProg,'aBright');
    gl.enableVertexAttribArray(sP); gl.vertexAttribPointer(sP,3,gl.FLOAT,false,16,0);
    gl.enableVertexAttribArray(sB); gl.vertexAttribPointer(sB,1,gl.FLOAT,false,16,12);
    gl.drawArrays(gl.POINTS,0,this.starVtxCount);
    gl.depthMask(true);

    // Globe
    gl.useProgram(this.globeProg);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.globeProg,'uMVP'),false,this.mvpMatrix(w,h));
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.globeTex);
    gl.uniform1i(gl.getUniformLocation(this.globeProg,'uTex'),0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.sphereVbo);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.sphereIbo);
    const gP=gl.getAttribLocation(this.globeProg,'aPos'), gU=gl.getAttribLocation(this.globeProg,'aUV');
    gl.enableVertexAttribArray(gP); gl.vertexAttribPointer(gP,3,gl.FLOAT,false,20,0);
    gl.enableVertexAttribArray(gU); gl.vertexAttribPointer(gU,2,gl.FLOAT,false,20,12);
    const ext = gl.getExtension('OES_element_index_uint');
    gl.drawElements(gl.TRIANGLES, this.sphereIdxCount, ext ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, 0);
  }

  private makeProgram(vs: string, fs: string): WebGLProgram {
    const gl = this.gl;
    const v = gl.createShader(gl.VERTEX_SHADER)!; gl.shaderSource(v,vs); gl.compileShader(v);
    const f = gl.createShader(gl.FRAGMENT_SHADER)!; gl.shaderSource(f,fs); gl.compileShader(f);
    const p = gl.createProgram()!; gl.attachShader(p,v); gl.attachShader(p,f); gl.linkProgram(p);
    return p;
  }
}
