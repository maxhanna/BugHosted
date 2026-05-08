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
  private rotationY = 0;
  private zoom = 1;
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
  }

  private initWebGL(): void {
    const canvas = this.globeCanvas.nativeElement;
    this.gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');

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
        // Add a subtle glow effect for Earth-like appearance
        float alpha = color.a;
        gl_FragColor = vec4(color.rgb * 1.1, alpha);
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

    // Get attribute and uniform locations
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vertexBuffer);
    const positionAttributeLocation = this.gl.getAttribLocation(this.program, 'aPosition');
    const texCoordAttributeLocation = this.gl.getAttribLocation(this.program, 'aTexCoord');
    const projectionMatrixLocation = this.gl.getUniformLocation(this.program, 'uProjectionMatrix');
    const modelViewMatrixLocation = this.gl.getUniformLocation(this.program, 'uModelViewMatrix');
    const samplerLocation = this.gl.getUniformLocation(this.program, 'uSampler');

    // Set up attributes
    this.gl.enableVertexAttribArray(positionAttributeLocation);
    this.gl.vertexAttribPointer(positionAttributeLocation, 3, this.gl.FLOAT, false, 0, 0);

    this.gl.enableVertexAttribArray(texCoordAttributeLocation);
    this.gl.vertexAttribPointer(texCoordAttributeLocation, 2, this.gl.FLOAT, false, 0, 0);

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

    this.gl.enableVertexAttribArray(positionAttributeLocation);
    this.gl.vertexAttribPointer(positionAttributeLocation, 3, this.gl.FLOAT, false, 0, 0);

    this.gl.enableVertexAttribArray(texCoordAttributeLocation);
    this.gl.vertexAttribPointer(texCoordAttributeLocation, 2, this.gl.FLOAT, false, 0, 0);
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
    const radius = 1;
    const latSegments = 32;
    const lonSegments = 64;
    const vertices: number[] = [];
    const texCoords: number[] = [];
    const indices: number[] = [];

    for (let lat = 0; lat <= latSegments; lat++) {
      const theta = lat * Math.PI / latSegments;
      const sinTheta = Math.sin(theta);
      const cosTheta = Math.cos(theta);

      for (let lon = 0; lon <= lonSegments; lon++) {
        const phi = lon * 2 * Math.PI / lonSegments;
        const sinPhi = Math.sin(phi);
        const cosPhi = Math.cos(phi);

        const x = cosPhi * sinTheta * radius;
        const y = cosTheta * radius;
        const z = sinPhi * sinTheta * radius;

        // Add vertex position data
        vertices.push(x, y, z);

        // Add texture coordinates
        texCoords.push(lon / lonSegments, lat / latSegments);
      }
    }

    // Create indices
    for (let lat = 0; lat < latSegments; lat++) {
      for (let lon = 0; lon < lonSegments; lon++) {
        const first = lat * (lonSegments + 1) + lon;
        const second = first + lonSegments + 1;

        indices.push(first, second, first + 1);
        indices.push(second, second + 1, first + 1);
      }
    }

    this.vertexBuffer = this.gl!.createBuffer();
    this.gl!.bindBuffer(this.gl!.ARRAY_BUFFER, this.vertexBuffer);
    this.gl!.bufferData(this.gl!.ARRAY_BUFFER, new Float32Array(vertices.concat(texCoords)), this.gl!.STATIC_DRAW);

    this.indexBuffer = this.gl!.createBuffer();
    this.gl!.bindBuffer(this.gl!.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    this.gl!.bufferData(this.gl!.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), this.gl!.STATIC_DRAW);
  }

  private createTexture(): void {
    // Create Earth texture from a real image
    this.texture = this.gl!.createTexture();
    this.gl!.bindTexture(this.gl!.TEXTURE_2D, this.texture);

    // Create a simple blue sphere as fallback first
    const width = 2;
    const height = 2;
    const fallbackData = new Uint8Array([0, 50, 150, 255, 0, 50, 150, 255, 0, 50, 150, 255, 0, 50, 150, 255]);
    this.gl!.texImage2D(this.gl!.TEXTURE_2D, 0, this.gl!.RGBA, width, height, 0, this.gl!.RGBA, this.gl!.UNSIGNED_BYTE, fallbackData);
    this.gl!.texParameteri(this.gl!.TEXTURE_2D, this.gl!.TEXTURE_MIN_FILTER, this.gl!.LINEAR);
    this.gl!.texParameteri(this.gl!.TEXTURE_2D, this.gl!.TEXTURE_MAG_FILTER, this.gl!.LINEAR);

    // Try to load real Earth texture
    const img = new Image();
    img.onload = () => {
      this.gl!.bindTexture(this.gl!.TEXTURE_2D, this.texture);
      this.gl!.texImage2D(this.gl!.TEXTURE_2D, 0, this.gl!.RGBA, this.gl!.RGBA, this.gl!.UNSIGNED_BYTE, img);
      this.gl!.texParameteri(this.gl!.TEXTURE_2D, this.gl!.TEXTURE_MIN_FILTER, this.gl!.LINEAR);
      this.gl!.texParameteri(this.gl!.TEXTURE_2D, this.gl!.TEXTURE_MAG_FILTER, this.gl!.LINEAR);
      this.gl!.texParameteri(this.gl!.TEXTURE_2D, this.gl!.TEXTURE_WRAP_S, this.gl!.CLAMP_TO_EDGE);
      this.gl!.texParameteri(this.gl!.TEXTURE_2D, this.gl!.TEXTURE_WRAP_T, this.gl!.CLAMP_TO_EDGE);
    };
    img.onerror = () => {
      // Fallback: generate a better procedural texture
      this.createProceduralEarthTexture();
    };
    // Use local earth texture
    img.src = 'assets/sigint/8k_earth_daymap.jpg';
  }

  private createProceduralEarthTexture(): void {
    // Improved procedural Earth texture
    const width = 512;
    const height = 256;
    const textureData = new Uint8Array(width * height * 4);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = (y * width + x) * 4;
        const lat = (y / height - 0.5) * Math.PI;
        const lon = (x / width) * 2 * Math.PI;

        // Simplex-like noise approximation using multiple sin waves
        const noise = Math.sin(lon * 3 + lat * 2) * 0.5 + Math.sin(lon * 7 + lat * 5) * 0.3 + Math.sin(lon * 13 + lat * 11) * 0.2;
        
        // Polar ice caps
        const polar = Math.abs(lat) > 1.3 ? 1 : Math.abs(lat) > 1.1 ? (Math.abs(lat) - 1.1) / 0.2 : 0;
        
        // Ocean vs land
        const landThreshold = 0.15;
        const isLand = noise > landThreshold;
        const isIce = polar > 0 && Math.random() > 0.5;

        if (isIce) {
          // Ice caps - white
          textureData[index] = 240;
          textureData[index + 1] = 245;
          textureData[index + 2] = 255;
          textureData[index + 3] = 255;
        } else if (isLand) {
          // Land - varied greens and browns
          const elevation = (noise - landThreshold) / (1 - landThreshold);
          const greenness = 0.6 - elevation * 0.4;
          textureData[index] = Math.floor(30 + elevation * 80);
          textureData[index + 1] = Math.floor(80 + greenness * 60);
          textureData[index + 2] = Math.floor(20 + elevation * 20);
          textureData[index + 3] = 255;
        } else {
          // Ocean - blue with depth variation
          const depth = 0.5 + 0.5 * Math.sin(lon * 5 + lat * 3);
          textureData[index] = Math.floor(5 + depth * 15);
          textureData[index + 1] = Math.floor(30 + depth * 40);
          textureData[index + 2] = Math.floor(80 + depth * 80);
          textureData[index + 3] = 255;
        }
      }
    }

    this.gl!.bindTexture(this.gl!.TEXTURE_2D, this.texture);
    this.gl!.pixelStorei(this.gl!.UNPACK_FLIP_Y_WEBGL, true);
    this.gl!.texImage2D(this.gl!.TEXTURE_2D, 0, this.gl!.RGBA, width, height, 0, this.gl!.RGBA, this.gl!.UNSIGNED_BYTE, textureData);
    this.gl!.texParameteri(this.gl!.TEXTURE_2D, this.gl!.TEXTURE_MIN_FILTER, this.gl!.LINEAR_MIPMAP_LINEAR);
    this.gl!.texParameteri(this.gl!.TEXTURE_2D, this.gl!.TEXTURE_MAG_FILTER, this.gl!.LINEAR);
    this.gl!.texParameteri(this.gl!.TEXTURE_2D, this.gl!.TEXTURE_WRAP_S, this.gl!.REPEAT);
    this.gl!.texParameteri(this.gl!.TEXTURE_2D, this.gl!.TEXTURE_WRAP_T, this.gl!.CLAMP_TO_EDGE);
    this.gl!.generateMipmap(this.gl!.TEXTURE_2D);
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
    this.zoom *= Math.pow(0.95, event.deltaY);
    this.zoom = Math.max(0.5, Math.min(3, this.zoom));
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

      // Simple zoom based on distance between fingers
      this.zoom *= Math.pow(0.99, distance - 100);
      this.zoom = Math.max(0.5, Math.min(3, this.zoom));
    }
  }

  private handleTouchEnd(): void {
    this.isDragging = false;
  }

  private createProjectionMatrix(): Float32Array {
    const canvas = this.globeCanvas.nativeElement;
    const fov = 45 * Math.PI / 180;
    const aspect = canvas.clientWidth / canvas.clientHeight;
    const near = 0.1;
    const far = 100.0;

    const projectionMatrix = new Float32Array(16);
    const f = 1.0 / Math.tan(fov / 2);

    projectionMatrix[0] = f / aspect;
    projectionMatrix[1] = 0;
    projectionMatrix[2] = 0;
    projectionMatrix[3] = 0;
    projectionMatrix[4] = 0;
    projectionMatrix[5] = f;
    projectionMatrix[6] = 0;
    projectionMatrix[7] = 0;
    projectionMatrix[8] = 0;
    projectionMatrix[9] = 0;
    projectionMatrix[11] = -1;
    projectionMatrix[12] = 0;
    projectionMatrix[13] = 0;
    projectionMatrix[15] = 0;

    return projectionMatrix;
  }

  private createModelViewMatrix(): Float32Array {
    const modelViewMatrix = new Float32Array(16);
    const canvas = this.globeCanvas.nativeElement;

    // Set up view matrix
    const distance = 3 * this.zoom;
    const x = Math.sin(this.rotationY) * distance;
    const z = Math.cos(this.rotationY) * distance;

    modelViewMatrix[0] = 1;
    modelViewMatrix[1] = 0;
    modelViewMatrix[2] = 0;
    modelViewMatrix[3] = 0;
    modelViewMatrix[4] = 0;
    modelViewMatrix[5] = 1;
    modelViewMatrix[6] = 0;
    modelViewMatrix[7] = 0;
    modelViewMatrix[8] = 0;
    modelViewMatrix[9] = 0;
    modelViewMatrix[10] = 1;
    modelViewMatrix[11] = 0;
    modelViewMatrix[12] = x;
    modelViewMatrix[13] = 0;
    modelViewMatrix[14] = z;
    modelViewMatrix[15] = 1;

    // Apply rotation
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

    this.gl.viewport(0, 0, w, h);
    this.gl.clearColor(0, 0, 0, 1);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
    this.gl.enable(this.gl.DEPTH_TEST);

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