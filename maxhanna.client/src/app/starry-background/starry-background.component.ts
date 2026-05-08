import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';

@Component({
  selector: 'app-starry-background',
  templateUrl: './starry-background.component.html',
  styleUrls: ['./starry-background.component.css'],
  standalone: false
})
export class StarryBackgroundComponent implements OnInit {
  @ViewChild('backgroundCanvas', { static: true }) backgroundCanvas!: ElementRef;

  private gl: WebGLRenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private vertexBuffer: WebGLBuffer | null = null;
  private stars: Float32Array = new Float32Array(0);
  private animationFrameId = 0;

  constructor() { }

  ngOnInit(): void {
    this.initWebGL();
    this.createStars();
    this.setupAttributes();
    this.setupEventListeners();
    this.animate();
    // Force render after layout is complete
    setTimeout(() => this.render(), 50);
  }

  private initWebGL(): void {
    const canvas = this.backgroundCanvas.nativeElement;
    this.gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    
    if (!this.gl) {
      console.error('WebGL not supported');
      return;
    }

    // Vertex shader source
    const vertexShaderSource = `
      attribute vec2 aPosition;
      uniform mat4 uProjectionMatrix;
      uniform float uTime;
      varying float vSize;
      
      void main() {
        gl_Position = uProjectionMatrix * vec4(aPosition, 0.0, 1.0);
        gl_PointSize = 2.0;
        // Create more realistic pulsing stars with varying intensity
        float pulse = 0.5 + 0.5 * sin(uTime * 0.3 + aPosition.x * 0.1 + aPosition.y * 0.1);
        vSize = 0.5 + 0.5 * pulse;
      }
    `;

    // Fragment shader source
    const fragmentShaderSource = `
      precision mediump float;
      varying float vSize;
      
      void main() {
        // Create a more realistic star effect with twinkling
        float alpha = 0.3 + 0.7 * vSize;
        // Create white/yellow stars
        gl_FragColor = vec4(1.0, 0.9, 0.8, alpha);
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

    // Get uniform locations
    const projectionMatrixLocation = this.gl.getUniformLocation(this.program, 'uProjectionMatrix');
    const timeUniformLocation = this.gl.getUniformLocation(this.program, 'uTime');

    // Set up uniforms
    this.gl.uniformMatrix4fv(projectionMatrixLocation, false, this.createProjectionMatrix());
    this.gl.uniform1f(timeUniformLocation, 0);
  }

  private setupAttributes(): void {
    if (!this.gl || !this.program || !this.vertexBuffer) return;
    
    const positionAttributeLocation = this.gl.getAttribLocation(this.program, 'aPosition');
    this.gl.enableVertexAttribArray(positionAttributeLocation);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vertexBuffer);
    this.gl.vertexAttribPointer(positionAttributeLocation, 2, this.gl.FLOAT, false, 0, 0);
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

  private createStars(): void {
    const starCount = 2000;
    this.stars = new Float32Array(starCount * 2);
    
    for (let i = 0; i < starCount; i++) {
      // Create a more realistic star distribution with some clustering
      const distance = Math.random() * Math.random() * 2.0;  // More close stars
      const angle = Math.random() * Math.PI * 2;
      
      // Add some clustering to make it look more natural
      const cluster = Math.random();
      if (cluster < 0.2) {
        // Create clusters of stars
        this.stars[i * 2] = (Math.random() - 0.5) * 1.5 + Math.cos(angle) * distance;
        this.stars[i * 2 + 1] = (Math.random() - 0.5) * 1.5 + Math.sin(angle) * distance;
      } else {
        this.stars[i * 2] = (Math.random() - 0.5) * 2;
        this.stars[i * 2 + 1] = (Math.random() - 0.5) * 2;
      }
    }

    this.vertexBuffer = this.gl!.createBuffer();
    this.gl!.bindBuffer(this.gl!.ARRAY_BUFFER, this.vertexBuffer);
    this.gl!.bufferData(this.gl!.ARRAY_BUFFER, this.stars, this.gl!.STATIC_DRAW);
  }

  private createProjectionMatrix(): Float32Array {
    // Identity matrix - clip space already maps -1 to 1
    // The star coordinates are in range -1 to 1, so no projection needed
    return new Float32Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1
    ]);
  }

  private setupEventListeners(): void {
    const canvas = this.backgroundCanvas.nativeElement;
    
    // Handle canvas resize
    const resizeObserver = new ResizeObserver(() => {
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
      this.gl!.viewport(0, 0, canvas.width, canvas.height);
    });
    
    resizeObserver.observe(canvas);
  }

  private animate(): void {
    this.animationFrameId = requestAnimationFrame(() => this.animate());
    this.render();
  }

  private render(): void {
    if (!this.gl || !this.program || !this.vertexBuffer) {
      return;
    }

    const canvas = this.backgroundCanvas.nativeElement;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w <= 0 || h <= 0) {
      requestAnimationFrame(() => this.render());
      return;
    }
    canvas.width = w;
    canvas.height = h;

    this.gl.viewport(0, 0, w, h);
    this.gl.clearColor(0, 0, 0, 1);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    
    // Update time uniform
    const timeUniformLocation = this.gl.getUniformLocation(this.program, 'uTime');
    const time = performance.now() / 1000;
    this.gl.uniform1f(timeUniformLocation, time);
    
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vertexBuffer);
    this.gl.drawArrays(this.gl.POINTS, 0, this.stars.length / 2);
  }
}