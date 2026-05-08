import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';

@Component({
  selector: 'app-globe',
  templateUrl: './globe.component.html',
  styleUrls: ['./globe.component.css'],
  standalone: false
})
export class GlobeComponent implements OnInit {
  @ViewChild('globeCanvas', { static: true }) globeCanvas!: ElementRef;

  private gl: WebGLRenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private vertexBuffer: WebGLBuffer | null = null;
  private indexBuffer: WebGLBuffer | null = null;
  private texture: WebGLTexture | null = null;
  private rotationX = 0;
  private rotationY = 0.5; // Start with slight rotation so globe is visible
  private zoom = 1;
  private zoomTarget = 1;
  private isDragging = false;
  private lastX = 0;
  private lastY = 0;
  private animationFrameId = 0;

  constructor() { }

  ngOnInit(): void {
    this.initWebGL();
    this.createSphere();
    this.createTexture();
    this.setupAttributes();
    this.setupEventListeners();
    this.animate();
    // Force render after layout is complete
    setTimeout(() => this.render(), 50);
  }

  private initWebGL(): void {
    const canvas = this.globeCanvas.nativeElement;
    this.gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false }) ||
              canvas.getContext('experimental-webgl', { alpha: true, premultipliedAlpha: false }) as WebGLRenderingContext;

    if (!this.gl) {
      console.error('WebGL not supported');
      return;
    }

    // Vertex shader source
    const vertexShaderSource = `
      attribute vec3 aPosition;
      attribute vec2 aTexCoord;
      uniform mat4 uModelViewMatrix;
      uniform mat4 uProjectionMatrix;
      varying vec2 vTexCoord;
      
      void main() {
        gl_Position = uProjectionMatrix * uModelViewMatrix * vec4(aPosition, 1.0);
        vTexCoord = aTexCoord;
      }
    `;

    // Fragment shader source
    const fragmentShaderSource = `
      precision mediump float;
      varying vec2 vTexCoord;
      uniform sampler2D uSampler;
      
      void main() {
        vec4 color = texture2D(uSampler, vTexCoord);
        // Slight brightness boost for Earth-like appearance; force alpha=1 so globe is opaque
        gl_FragColor = vec4(color.rgb * 1.1, 1.0);
      }
    `;

    // Compile shaders
    const vertexShader = this.compileShader(this.gl.VERTEX_SHADER, vertexShaderSource);
    const fragmentShader = this.compileShader(this.gl.FRAGMENT_SHADER, fragmentShaderSource);

    // Create program
    this.program = this.gl.createProgram()!;
    this.gl.attachShader(this.program, vertexShader);
    this.gl.attachShader(this.program, fragmentShader);
    this.gl.linkProgram(this.program);

    if (!this.gl.getProgramParameter(this.program, this.gl.LINK_STATUS)) {
      console.error('Program linking failed');
      return;
    }

    this.gl.useProgram(this.program);

    // Get uniform locations only (attributes set up in setupAttributes after buffer created)
    const projectionMatrixLocation = this.gl.getUniformLocation(this.program, 'uProjectionMatrix');
    const modelViewMatrixLocation = this.gl.getUniformLocation(this.program, 'uModelViewMatrix');
    const samplerLocation = this.gl.getUniformLocation(this.program, 'uSampler');

    // Set up uniforms
    this.gl.uniform1i(samplerLocation, 0);
    this.gl.uniformMatrix4fv(projectionMatrixLocation, false, this.createProjectionMatrix());
    this.gl.uniformMatrix4fv(modelViewMatrixLocation, false, this.createModelViewMatrix());
  }

  private setupAttributes(): void {
    if (!this.gl || !this.program || !this.vertexBuffer) return;

    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vertexBuffer);
    const positionAttributeLocation = this.gl.getAttribLocation(this.program, 'aPosition');
    const texCoordAttributeLocation = this.gl.getAttribLocation(this.program, 'aTexCoord');

    // Stride is 20 bytes (5 floats: 3 for position + 2 for texCoord)
    const stride = 20;
    this.gl.enableVertexAttribArray(positionAttributeLocation);
    this.gl.vertexAttribPointer(positionAttributeLocation, 3, this.gl.FLOAT, false, stride, 0);

    this.gl.enableVertexAttribArray(texCoordAttributeLocation);
    this.gl.vertexAttribPointer(texCoordAttributeLocation, 2, this.gl.FLOAT, false, stride, 12); // offset 12 = 3 floats * 4 bytes
  }

  private compileShader(type: number, source: string): WebGLShader {
    const shader = this.gl!.createShader(type)!;
    this.gl!.shaderSource(shader, source);
    this.gl!.compileShader(shader);

    if (!this.gl!.getShaderParameter(shader, this.gl!.COMPILE_STATUS)) {
      console.error('Shader compilation failed:', this.gl!.getShaderInfoLog(shader));
      this.gl!.deleteShader(shader);
      throw new Error('Shader compilation failed');
    }

    return shader;
  }

  private createSphere(): void {
    // Create a sphere using latitude/longitude segments
    // Vertices are interleaved: [x, y, z, u, v] per vertex (stride = 5 floats = 20 bytes)
    const radius = 1;
    const latSegments = 32;
    const lonSegments = 64;
    const interleaved: number[] = [];
    const indices: number[] = [];

    for (let lat = 0; lat <= latSegments; lat++) {
      const theta = lat * Math.PI / latSegments;   // 0 (north pole) → π (south pole)
      const sinTheta = Math.sin(theta);
      const cosTheta = Math.cos(theta);

      for (let lon = 0; lon <= lonSegments; lon++) {
        const phi = lon * 2 * Math.PI / lonSegments;
        const sinPhi = Math.sin(phi);
        const cosPhi = Math.cos(phi);

        const x = cosPhi * sinTheta * radius;
        const y = cosTheta * radius;
        const z = sinPhi * sinTheta * radius;

        // UV: u goes 0→1 west→east, v goes 0→1 south→north
        const u = lon / lonSegments;
        const v = 1.0 - lat / latSegments; // flip so v=1 at north pole

        interleaved.push(x, y, z, u, v);
      }
    }

    // Create indices
    for (let lat = 0; lat < latSegments; lat++) {
      for (let lon = 0; lon < lonSegments; lon++) {
        const first  = lat * (lonSegments + 1) + lon;
        const second = first + lonSegments + 1;

        indices.push(first,     second,     first + 1);
        indices.push(second,    second + 1, first + 1);
      }
    }

    this.vertexBuffer = this.gl!.createBuffer();
    this.gl!.bindBuffer(this.gl!.ARRAY_BUFFER, this.vertexBuffer);
    this.gl!.bufferData(this.gl!.ARRAY_BUFFER, new Float32Array(interleaved), this.gl!.STATIC_DRAW);

    this.indexBuffer = this.gl!.createBuffer();
    this.gl!.bindBuffer(this.gl!.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    this.gl!.bufferData(this.gl!.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), this.gl!.STATIC_DRAW);
  }

  private createTexture(): void {
    // Create texture object first
    this.texture = this.gl!.createTexture();
    this.gl!.bindTexture(this.gl!.TEXTURE_2D, this.texture);
    // Generate procedural Earth texture
    this.createProceduralEarthTexture();
  }

  private createProceduralEarthTexture(): void {
    const width  = 1024;
    const height = 512;
    const data   = new Uint8Array(width * height * 4);

    // ── Reliable float-based smooth noise ──────────────────────────────────
    // fract(sin(dot)) — the classic GLSL hash, works fine in JS floats
    const fract = (x: number) => x - Math.floor(x);
    const hash2 = (x: number, y: number) =>
      fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453);

    const smoothstep = (t: number) => t * t * (3 - 2 * t);

    // Bilinear smooth value noise
    const vnoise = (x: number, y: number): number => {
      const ix = Math.floor(x), iy = Math.floor(y);
      const fx = smoothstep(x - ix), fy = smoothstep(y - iy);
      const a = hash2(ix,     iy);
      const b = hash2(ix + 1, iy);
      const c = hash2(ix,     iy + 1);
      const d = hash2(ix + 1, iy + 1);
      return a + (b - a) * fx + (c - a) * fy + (d - b - c + a) * fx * fy;
    };

    // fBm — 6 octaves, returns roughly 0..1
    const fbm = (x: number, y: number): number => {
      let v = 0, amp = 0.5, freq = 1;
      for (let i = 0; i < 6; i++) {
        v    += vnoise(x * freq, y * freq) * amp;
        amp  *= 0.5;
        freq *= 2.0;
      }
      return v; // ~0..1
    };

    // Domain-warped continent mask — returns ~0..1, >0.5 = land
    const continent = (nx: number, ny: number): number => {
      const wx = fbm(nx + 1.7, ny + 9.2) * 0.8;
      const wy = fbm(nx + 8.3, ny + 2.8) * 0.8;
      return fbm(nx + wx, ny + wy);
    };

    for (let py = 0; py < height; py++) {
      for (let px = 0; px < width; px++) {
        const idx = (py * width + px) * 4;

        const u   = px / width;           // 0→1
        const v   = py / height;          // 0→1 (top = north in image)
        const lat = (0.5 - v) * Math.PI;  // +π/2 north … -π/2 south

        // Scale to give ~5 continent-sized features across the globe
        const nx = u * 5.0;
        const ny = (v - 0.5) * 3.0;

        const cm = continent(nx, ny);     // 0..1

        // Ice caps
        const absLat = Math.abs(lat);
        const iceBlend = Math.max(0, (absLat - 1.3) / 0.27);
        const isIce = iceBlend + fbm(nx * 4, ny * 4) * 0.1 > 0.3;

        // Land threshold — ~40% of surface
        const isLand = !isIce && cm > 0.48;

        // Elevation 0..1 above coast
        const elev    = isLand ? Math.min(1, (cm - 0.48) / 0.3) : 0;
        const detail  = fbm(nx * 3 + 17, ny * 3 + 17); // fine detail 0..1
        const moisture = fbm(nx * 1.2 + 30, ny * 1.2 + 30); // 0..1

        let r: number, g: number, b: number;

        if (isIce) {
          // White ice with slight blue tint
          const br = Math.round(215 + detail * 40);
          r = br; g = br; b = Math.min(255, br + 15);

        } else if (isLand) {
          const warm = Math.cos(lat); // 1 at equator, 0 at poles

          if (elev > 0.7) {
            // Mountain snow / rock
            const snow = Math.max(0, (elev - 0.7) / 0.3);
            const rock = Math.round(90 + detail * 50);
            r = Math.round(rock + snow * (235 - rock));
            g = Math.round(rock + snow * (235 - rock));
            b = Math.round(rock + snow * (245 - rock));
          } else if (warm < 0.25) {
            // Tundra / boreal
            r = Math.round(100 + detail * 30);
            g = Math.round(115 + detail * 25);
            b = Math.round( 80 + detail * 20);
          } else if (moisture > 0.58 && warm > 0.45) {
            // Tropical / temperate forest — rich green
            r = Math.round( 20 + detail * 30);
            g = Math.round( 90 + detail * 60 + elev * 25);
            b = Math.round( 15 + detail * 20);
          } else if (moisture < 0.38) {
            // Desert — sandy
            r = Math.round(195 + detail * 35);
            g = Math.round(165 + detail * 25);
            b = Math.round( 85 + detail * 20);
          } else {
            // Grassland / savanna
            r = Math.round( 75 + detail * 45 + elev * 15);
            g = Math.round(125 + detail * 45 + elev * 15);
            b = Math.round( 45 + detail * 20);
          }

        } else {
          // Ocean — deep blue, lighter near coasts
          const shallow = Math.max(0, (cm - 0.35) / 0.13); // 0 deep → 1 near coast
          const depth   = fbm(nx * 2 + 50, ny * 2 + 50);
          r = Math.round(  5 + depth *  8 + shallow * 25);
          g = Math.round( 35 + depth * 35 + shallow * 45);
          b = Math.round(110 + depth * 55 + shallow * 35);
        }

        data[idx]     = Math.min(255, Math.max(0, r));
        data[idx + 1] = Math.min(255, Math.max(0, g));
        data[idx + 2] = Math.min(255, Math.max(0, b));
        data[idx + 3] = 255;
      }
    }

    this.gl!.bindTexture(this.gl!.TEXTURE_2D, this.texture);
    this.gl!.pixelStorei(this.gl!.UNPACK_FLIP_Y_WEBGL, false);
    this.gl!.texImage2D(
      this.gl!.TEXTURE_2D, 0, this.gl!.RGBA,
      width, height, 0,
      this.gl!.RGBA, this.gl!.UNSIGNED_BYTE, data
    );
    this.gl!.texParameteri(this.gl!.TEXTURE_2D, this.gl!.TEXTURE_MIN_FILTER, this.gl!.LINEAR);
    this.gl!.texParameteri(this.gl!.TEXTURE_2D, this.gl!.TEXTURE_MAG_FILTER, this.gl!.LINEAR);
    this.gl!.texParameteri(this.gl!.TEXTURE_2D, this.gl!.TEXTURE_WRAP_S, this.gl!.REPEAT);
    this.gl!.texParameteri(this.gl!.TEXTURE_2D, this.gl!.TEXTURE_WRAP_T, this.gl!.CLAMP_TO_EDGE);
  }

  private setupEventListeners(): void {
    const canvas = this.globeCanvas.nativeElement;

    canvas.addEventListener('mousedown', (e: any) => this.handleMouseDown(e as MouseEvent));
    canvas.addEventListener('mousemove', (e: any) => this.handleMouseMove(e as MouseEvent));
    canvas.addEventListener('mouseup', () => this.handleMouseUp());
    canvas.addEventListener('wheel', (e: any) => this.handleWheel(e as WheelEvent));

    // Touch events
    canvas.addEventListener('touchstart', (e: any) => this.handleTouchStart(e as TouchEvent));
    canvas.addEventListener('touchmove', (e: any) => this.handleTouchMove(e as TouchEvent));
    canvas.addEventListener('touchend', () => this.handleTouchEnd());
  }

  private handleMouseDown(event: MouseEvent): void {
    this.isDragging = true;
    this.lastX = event.clientX;
    this.lastY = event.clientY;
  }

  private handleMouseMove(event: MouseEvent): void {
    if (this.isDragging) {
      const deltaX = event.clientX - this.lastX;
      const deltaY = event.clientY - this.lastY;

      this.rotationY += deltaX * 0.01;
      this.rotationX += deltaY * 0.01;

      this.lastX = event.clientX;
      this.lastY = event.clientY;
    }
  }

  private handleMouseUp(): void {
    this.isDragging = false;
  }

  private handleWheel(event: WheelEvent): void {
    event.preventDefault();
    // Smooth zoom by clamping delta and using smaller increments
    const delta = Math.max(-10, Math.min(10, event.deltaY));
    const zoomSpeed = 0.001;
    this.zoomTarget = Math.max(0.5, Math.min(3, this.zoomTarget - delta * zoomSpeed));
  }

  private handleTouchStart(event: TouchEvent): void {
    if (event.touches.length === 1) {
      this.isDragging = true;
      this.lastX = event.touches[0].clientX;
      this.lastY = event.touches[0].clientY;
    }
  }

  private handleTouchMove(event: TouchEvent): void {
    if (event.touches.length === 1 && this.isDragging) {
      const deltaX = event.touches[0].clientX - this.lastX;
      const deltaY = event.touches[0].clientY - this.lastY;

      this.rotationY += deltaX * 0.01;
      this.rotationX += deltaY * 0.01;

      this.lastX = event.touches[0].clientX;
      this.lastY = event.touches[0].clientY;
    } else if (event.touches.length === 2) {
      // Handle pinch zoom
      const touch1 = event.touches[0];
      const touch2 = event.touches[1];

      const distance = Math.sqrt(
        Math.pow(touch2.clientX - touch1.clientX, 2) +
        Math.pow(touch2.clientY - touch1.clientY, 2)
      );

      // Smooth pinch zoom using target
      const zoomFactor = 1 + (distance - 100) * 0.001;
      this.zoomTarget = Math.max(0.5, Math.min(3, this.zoomTarget * zoomFactor));
    }
  }

  private handleTouchEnd(): void {
    this.isDragging = false;
  }

  private createProjectionMatrix(): Float32Array {
    const canvas = this.globeCanvas.nativeElement;
    let aspect = canvas.clientWidth / canvas.clientHeight;
    if (!isFinite(aspect) || aspect <= 0) aspect = 1;

    const fov  = 45 * Math.PI / 180;
    const near = 0.1;
    const far  = 100.0;
    const f    = 1.0 / Math.tan(fov / 2);

    // Column-major 4×4 perspective matrix
    const m = new Float32Array(16);
    m[0]  = f / aspect;
    m[5]  = f;
    m[10] = (far + near) / (near - far);       // was missing → caused depth = 0
    m[11] = -1;
    m[14] = (2 * far * near) / (near - far);   // was missing → caused depth = 0
    // m[15] stays 0 (perspective divide)
    return m;
  }

  private createModelViewMatrix(): Float32Array {
    // Simple identity matrix for view, we position camera by moving sphere
    const modelViewMatrix = new Float32Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1
    ]);

    // Move sphere back so camera can see it (radius 1, so move back 3 units)
    const distance = 3 * this.zoom;
    modelViewMatrix[14] = -distance;

    // Apply rotations
    this.rotateMatrix(modelViewMatrix, this.rotationX, this.rotationY);

    return modelViewMatrix;
  }

  private rotateMatrix(matrix: Float32Array, x: number, y: number): void {
    // Rotate around X-axis
    const cosX = Math.cos(x);
    const sinX = Math.sin(x);

    const m0 = matrix[0], m1 = matrix[1], m2 = matrix[2], m3 = matrix[3];
    const m4 = matrix[4], m5 = matrix[5], m6 = matrix[6], m7 = matrix[7];
    const m8 = matrix[8], m9 = matrix[9], m10 = matrix[10], m11 = matrix[11];

    matrix[0] = m0;
    matrix[1] = m1 * cosX - m2 * sinX;
    matrix[2] = m1 * sinX + m2 * cosX;
    matrix[3] = m3;
    matrix[4] = m4;
    matrix[5] = m5 * cosX - m6 * sinX;
    matrix[6] = m5 * sinX + m6 * cosX;
    matrix[7] = m7;
    matrix[8] = m8;
    matrix[9] = m9 * cosX - m10 * sinX;
    matrix[10] = m9 * sinX + m10 * cosX;
    matrix[11] = m11;

    // Rotate around Y-axis
    const cosY = Math.cos(y);
    const sinY = Math.sin(y);

    const m0_ = matrix[0], m1_ = matrix[1], m2_ = matrix[2];
    const m4_ = matrix[4], m5_ = matrix[5], m6_ = matrix[6];
    const m8_ = matrix[8], m9_ = matrix[9], m10_ = matrix[10];

    matrix[0] = m0_ * cosY + m2_ * sinY;
    matrix[1] = m1_;
    matrix[2] = -m0_ * sinY + m2_ * cosY;
    matrix[3] = m3;
    matrix[4] = m4_ * cosY + m6_ * sinY;
    matrix[5] = m5_;
    matrix[6] = -m4_ * sinY + m6_ * cosY;
    matrix[7] = m7;
    matrix[8] = m8_ * cosY + m10_ * sinY;
    matrix[9] = m9_;
    matrix[10] = -m8_ * sinY + m10_ * cosY;
    matrix[11] = m11;
  }

  private animate(): void {
    this.animationFrameId = requestAnimationFrame(() => this.animate());
    this.render();
  }

  private render(): void {
    if (!this.gl || !this.program || !this.vertexBuffer || !this.indexBuffer || !this.texture) {
      return;
    }

    const canvas = this.globeCanvas.nativeElement;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w <= 0 || h <= 0) {
      // Request another frame to retry once the canvas is sized
      requestAnimationFrame(() => this.render());
      return;
    }
    canvas.width = w;
    canvas.height = h;

    // Smooth zoom interpolation
    this.zoom += (this.zoomTarget - this.zoom) * 0.1;

    this.gl.viewport(0, 0, w, h);
    this.gl.clearColor(0, 0, 0, 0); // fully transparent background — starry sky shows through
    this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
    this.gl.enable(this.gl.DEPTH_TEST);
    this.gl.enable(this.gl.BLEND);
    this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);

    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vertexBuffer);
    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);

    const modelViewMatrix = this.createModelViewMatrix();
    const projectionMatrix = this.createProjectionMatrix();

    const modelViewMatrixLocation = this.gl.getUniformLocation(this.program, 'uModelViewMatrix');
    const projectionMatrixLocation = this.gl.getUniformLocation(this.program, 'uProjectionMatrix');

    this.gl.uniformMatrix4fv(modelViewMatrixLocation, false, modelViewMatrix);
    this.gl.uniformMatrix4fv(projectionMatrixLocation, false, projectionMatrix);

    this.gl.drawElements(this.gl.TRIANGLES, 2 * 32 * 64 * 3, this.gl.UNSIGNED_SHORT, 0);
  }
}