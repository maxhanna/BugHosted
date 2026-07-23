import { Component, ElementRef, HostListener, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-paint',
  standalone: false,
  templateUrl: './paint.component.html',
  styleUrl: './paint.component.css'
})
export class PaintComponent extends ChildComponent {
  @ViewChild('paintCanvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;
  private ctx!: CanvasRenderingContext2D;
  private overlayCtx!: CanvasRenderingContext2D;
  @ViewChild('overlayCanvas', { static: true }) overlayRef!: ElementRef<HTMLCanvasElement>;

  canvasWidth = 800;
  canvasHeight = 600;

  currentTool: string = 'pencil';
  currentColor = '#000000';
  brushSize = 2;
  isDrawing = false;

  private startX = 0;
  private startY = 0;
  private lastX = 0;
  private lastY = 0;

  undoStack: ImageData[] = [];
  redoStack: ImageData[] = [];

  fileName = '';
  currentFileId: number | null = null;
  visibility: string = 'Public';

  fontFamily = 'Arial';
  fontSize = 16;
  textInput = '';
  textX = 0;
  textY = 0;
  showTextDialog = false;

  recentColors: string[] = [];
  showColorPicker = false;
  tempColor = '#000000';

  cursorX = 0;
  cursorY = 0;
  zoom = 1;

  private selectionStartX: number = 0;
  private selectionStartY: number = 0;
  private selectionEndX: number = 0;
  private selectionEndY: number = 0;

  isSelectionActive: boolean = false;

  showMenuPanel = false;

  private resizeX = 0;
  private resizeY = 0;
  private isResizing = false;
  private resizeStartW = 0;
  private resizeStartH = 0;
  canvasMinW = 100;
  canvasMinH = 100;

  brushSizes = [1, 2, 5, 10, 20, 30];
  presetColors = [
    '#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff',
    '#808080', '#800000', '#008000', '#000080', '#808000', '#800080', '#008080', '#c0c0c0',
    '#ff4500', '#ff8c00', '#ffd700', '#adff2f', '#00fa9a', '#00ced1', '#1e90ff', '#9370db',
    '#ff69b4', '#f08080', '#90ee90', '#add8e6', '#dda0dd', '#f0e68c', '#e0ffff', '#fff5ee',
  ];
  tools = [
    { id: 'pencil', label: '✏️', title: 'Pencil' },
    { id: 'brush', label: '🖌️', title: 'Brush' },
    { id: 'eraser', label: '🧹', title: 'Eraser' },
    { id: 'line', label: '📏', title: 'Line' },
    { id: 'rect', label: '▭', title: 'Rectangle' },
    { id: 'filledRect', label: '▬', title: 'Filled Rect' },
    { id: 'circle', label: '○', title: 'Circle' },
    { id: 'filledCircle', label: '●', title: 'Filled Circle' },
    { id: 'fill', label: '🪣', title: 'Flood Fill' },
    { id: 'text', label: '🔤', title: 'Text' },
  ];

  private maxUndo = 50;

  constructor(private http: HttpClient) { super(); }

  @HostListener('document:keydown', ['$event'])
  handleKeyboard(e: KeyboardEvent) {
    if (e.ctrlKey && e.key === 'z') {
      e.preventDefault();
      this.undo();
    } else if (e.ctrlKey && e.key === 'y') {
      e.preventDefault();
      this.redo();
    }
  }

  ngAfterViewInit() {
    const canvas = this.canvasRef.nativeElement;
    canvas.width = this.canvasWidth;
    canvas.height = this.canvasHeight;
    this.ctx = canvas.getContext('2d')!;
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);

    const overlay = this.overlayRef.nativeElement;
    overlay.width = this.canvasWidth;
    overlay.height = this.canvasHeight;
    this.overlayCtx = overlay.getContext('2d')!;

    this.saveState();
  }

  private getPos(e: PointerEvent): { x: number; y: number } {
    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX / this.zoom,
      y: (e.clientY - rect.top) * scaleY / this.zoom
    };
  }

  onPointerDown(e: PointerEvent) {
    const canvas = this.canvasRef.nativeElement;
    canvas.setPointerCapture(e.pointerId);

    if (this.currentTool === 'select') {
      const pos = this.getPos(e);
      if (this.isSelectionActive) {
        this.clearSelection();
        return;
      }
      this.selectionStartX = pos.x;
      this.selectionStartY = pos.y;
      this.selectionEndX = pos.x;
      this.selectionEndY = pos.y;
      this.isSelectionActive = true;
      this.isDrawing = true;
      return;
    }

    if (this.isSelectionActive) {
      this.clearSelection();
    }

    const pos = this.getPos(e);
    this.startX = pos.x;
    this.startY = pos.y;
    this.lastX = pos.x;
    this.lastY = pos.y;
    this.isDrawing = true;

    if (this.currentTool === 'fill') {
      this.floodFill(Math.round(pos.x), Math.round(pos.y), this.currentColor);
      this.isDrawing = false;
      this.saveState();
      return;
    }
    if (this.currentTool === 'text') {
      this.textX = pos.x;
      this.textY = pos.y;
      this.showTextDialog = true;
      this.isDrawing = false;
      return;
    }
  }

  onPointerMove(e: PointerEvent) {
    const pos = this.getPos(e);
    this.cursorX = Math.round(pos.x);
    this.cursorY = Math.round(pos.y);

    if (this.currentTool === 'select' && this.isDrawing) {
      this.selectionEndX = pos.x;
      this.selectionEndY = pos.y;
      this.overlayCtx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
      this.drawSelectionRect(this.overlayCtx, this.selectionStartX, this.selectionStartY, pos.x, pos.y);
      return;
    }

    this.overlayCtx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);

    if (this.isDrawing) {
      if (this.currentTool === 'pencil' || this.currentTool === 'brush' || this.currentTool === 'eraser') {
        this.ctx.beginPath();
        this.ctx.moveTo(this.lastX, this.lastY);
        this.ctx.lineTo(pos.x, pos.y);
        this.ctx.strokeStyle = this.currentTool === 'eraser' ? '#ffffff' : this.currentColor;
        this.ctx.lineWidth = this.currentTool === 'pencil' ? 1 : this.brushSize;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        this.ctx.stroke();
        this.lastX = pos.x;
        this.lastY = pos.y;
      } else if (this.currentTool === 'line') {
        this.drawShapePreview('line', pos);
      } else if (this.currentTool === 'rect') {
        this.drawShapePreview('rect', pos);
      } else if (this.currentTool === 'filledRect') {
        this.drawShapePreview('filledRect', pos);
      } else if (this.currentTool === 'circle') {
        this.drawShapePreview('circle', pos);
      } else if (this.currentTool === 'filledCircle') {
        this.drawShapePreview('filledCircle', pos);
      }
    } else {
      this.restoreOverlay();
      this.drawCursorPreview(pos);
    }
  }

  onPointerUp(e: PointerEvent) {
    if (this.currentTool === 'select') {
      this.isDrawing = false;
      if (this.isSelectionActive) {
        this.overlayCtx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
        const x1 = Math.min(this.selectionStartX, this.selectionEndX);
        const y1 = Math.min(this.selectionStartY, this.selectionEndY);
        const x2 = Math.max(this.selectionStartX, this.selectionEndX);
        const y2 = Math.max(this.selectionStartY, this.selectionEndY);
        if (Math.abs(x2 - x1) > 2 && Math.abs(y2 - y1) > 2) {
          this.selectionStartX = x1; this.selectionStartY = y1;
          this.selectionEndX = x2; this.selectionEndY = y2;
          this.drawSelectionRect(this.overlayCtx, x1, y1, x2, y2);
        } else {
          this.isSelectionActive = false;
        }
      }
      return;
    }

    if (!this.isDrawing) return;
    this.isDrawing = false;

    const pos = this.getPos(e);

    this.overlayCtx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);

    if (this.currentTool === 'line') {
      this.drawLine(this.startX, this.startY, pos.x, pos.y);
    } else if (this.currentTool === 'rect') {
      this.drawRect(this.startX, this.startY, pos.x, pos.y, false);
    } else if (this.currentTool === 'filledRect') {
      this.drawRect(this.startX, this.startY, pos.x, pos.y, true);
    } else if (this.currentTool === 'circle') {
      this.drawEllipse(this.startX, this.startY, pos.x, pos.y, false);
    } else if (this.currentTool === 'filledCircle') {
      this.drawEllipse(this.startX, this.startY, pos.x, pos.y, true);
    }

    if (this.currentTool !== 'pencil' && this.currentTool !== 'brush' && this.currentTool !== 'eraser') {
      this.saveState();
    } else {
      this.saveState();
    }
  }

  onPointerLeave(e: PointerEvent) {
    this.overlayCtx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
    if (this.isDrawing) {
      this.isDrawing = false;
      this.saveState();
    }
    this.restoreOverlay();
    try { this.canvasRef.nativeElement.releasePointerCapture(e.pointerId); } catch { }
  }

  private restoreOverlay() {
    if (this.isSelectionActive && this.selectionStartX !== this.selectionEndX && this.selectionStartY !== this.selectionEndY) {
      this.drawSelectionRect(this.overlayCtx, this.selectionStartX, this.selectionStartY, this.selectionEndX, this.selectionEndY);
    }
  }

  private drawShapePreview(tool: string, pos: { x: number; y: number }) {
    this.overlayCtx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
    this.overlayCtx.strokeStyle = this.currentColor;
    this.overlayCtx.lineWidth = this.brushSize;

    if (tool === 'line') {
      this.overlayCtx.beginPath();
      this.overlayCtx.moveTo(this.startX, this.startY);
      this.overlayCtx.lineTo(pos.x, pos.y);
      this.overlayCtx.stroke();
    } else if (tool === 'rect') {
      this.overlayCtx.strokeRect(this.startX, this.startY, pos.x - this.startX, pos.y - this.startY);
    } else if (tool === 'filledRect') {
      this.overlayCtx.fillStyle = this.currentColor;
      this.overlayCtx.fillRect(this.startX, this.startY, pos.x - this.startX, pos.y - this.startY);
    } else if (tool === 'circle' || tool === 'filledCircle') {
      const rx = Math.abs(pos.x - this.startX) / 2;
      const ry = Math.abs(pos.y - this.startY) / 2;
      const cx = (this.startX + pos.x) / 2;
      const cy = (this.startY + pos.y) / 2;
      this.overlayCtx.beginPath();
      this.overlayCtx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      if (tool === 'filledCircle') {
        this.overlayCtx.fillStyle = this.currentColor;
        this.overlayCtx.fill();
      }
      this.overlayCtx.stroke();
    }
  }

  private drawCursorPreview(pos: { x: number; y: number }) {
    const r = this.brushSize / 2;
    const cx = Math.round(pos.x);
    const cy = Math.round(pos.y);

    let invColor = '#000000';
    try {
      const imgData = this.ctx.getImageData(cx, cy, 1, 1);
      const lum = 0.299 * imgData.data[0] + 0.587 * imgData.data[1] + 0.114 * imgData.data[2];
      invColor = lum > 128 ? '#000000' : '#ffffff';
    } catch { }

    const ctx = this.overlayCtx;

    if (this.currentTool === 'pencil' || this.currentTool === 'brush' || this.currentTool === 'eraser' || this.currentTool === 'fill') {
      const radius = this.currentTool === 'pencil' ? 4 : r;
      ctx.beginPath();
      ctx.arc(cx, cy, radius + 2, 0, Math.PI * 2);
      ctx.strokeStyle = invColor === '#ffffff' ? '#000000' : '#ffffff';
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.strokeStyle = invColor;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else {
      const crossLen = 8;
      ctx.strokeStyle = invColor === '#ffffff' ? '#000000' : '#ffffff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx - crossLen, cy); ctx.lineTo(cx + crossLen, cy);
      ctx.moveTo(cx, cy - crossLen); ctx.lineTo(cx, cy + crossLen);
      ctx.stroke();

      ctx.strokeStyle = invColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx - crossLen, cy); ctx.lineTo(cx + crossLen, cy);
      ctx.moveTo(cx, cy - crossLen); ctx.lineTo(cx, cy + crossLen);
      ctx.stroke();
    }
  }

  private drawSelectionRect(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
    const left = Math.min(x1, x2);
    const top = Math.min(y1, y2);
    const w = Math.abs(x2 - x1);
    const h = Math.abs(y2 - y1);
    ctx.save();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(left, top, w, h);
    ctx.setLineDash([]);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(left - 1, top - 1, w + 2, h + 2);
    ctx.restore();
  }

  private clearSelection() {
    this.isSelectionActive = false;
    this.overlayCtx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
    this.selectionStartX = 0;
    this.selectionStartY = 0;
    this.selectionEndX = 0;
    this.selectionEndY = 0;
  }

  private drawLine(x1: number, y1: number, x2: number, y2: number) {
    this.ctx.beginPath();
    this.ctx.moveTo(x1, y1);
    this.ctx.lineTo(x2, y2);
    this.ctx.strokeStyle = this.currentColor;
    this.ctx.lineWidth = this.brushSize;
    this.ctx.stroke();
  }

  private drawRect(x1: number, y1: number, x2: number, y2: number, fill: boolean) {
    if (fill) {
      this.ctx.fillStyle = this.currentColor;
      this.ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
    } else {
      this.ctx.strokeStyle = this.currentColor;
      this.ctx.lineWidth = this.brushSize;
      this.ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
    }
  }

  private drawEllipse(x1: number, y1: number, x2: number, y2: number, fill: boolean) {
    const rx = Math.abs(x2 - x1) / 2;
    const ry = Math.abs(y2 - y1) / 2;
    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;
    this.ctx.beginPath();
    this.ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    if (fill) {
      this.ctx.fillStyle = this.currentColor;
      this.ctx.fill();
    }
    this.ctx.strokeStyle = this.currentColor;
    this.ctx.lineWidth = this.brushSize;
    this.ctx.stroke();
  }

  private floodFill(startX: number, startY: number, fillColor: string) {
    const imageData = this.ctx.getImageData(0, 0, this.canvasWidth, this.canvasHeight);
    const data = imageData.data;
    const w = this.canvasWidth;
    const h = this.canvasHeight;

    const idx = (startY * w + startX) * 4;
    const targetR = data[idx];
    const targetG = data[idx + 1];
    const targetB = data[idx + 2];
    const targetA = data[idx + 3];

    const fill = this.hexToRgb(fillColor);
    if (!fill) return;
    if (targetR === fill.r && targetG === fill.g && targetB === fill.b && targetA === 255) return;

    const visited = new Uint8Array(w * h);
    const stack: number[] = [startX, startY];

    while (stack.length > 0) {
      const cy = stack.pop()!;
      const cx = stack.pop()!;
      const pi = cy * w + cx;
      if (visited[pi]) continue;
      visited[pi] = 1;

      const pi4 = pi * 4;
      if (data[pi4] !== targetR || data[pi4 + 1] !== targetG || data[pi4 + 2] !== targetB || data[pi4 + 3] !== targetA) continue;

      data[pi4] = fill.r;
      data[pi4 + 1] = fill.g;
      data[pi4 + 2] = fill.b;
      data[pi4 + 3] = 255;

      if (cx > 0) { stack.push(cx - 1, cy); }
      if (cx < w - 1) { stack.push(cx + 1, cy); }
      if (cy > 0) { stack.push(cx, cy - 1); }
      if (cy < h - 1) { stack.push(cx, cy + 1); }
    }

    this.ctx.putImageData(imageData, 0, 0);
  }

  private hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) } : null;
  }

  placeText() {
    if (!this.textInput.trim()) { this.showTextDialog = false; return; }
    this.ctx.font = `${this.fontSize}px ${this.fontFamily}`;
    this.ctx.fillStyle = this.currentColor;
    this.ctx.fillText(this.textInput, this.textX, this.textY);
    this.textInput = '';
    this.showTextDialog = false;
    this.saveState();
  }

  cancelText() {
    this.textInput = '';
    this.showTextDialog = false;
  }

  private saveState() {
    const data = this.ctx.getImageData(0, 0, this.canvasWidth, this.canvasHeight);
    this.undoStack.push(data);
    this.redoStack = [];
    if (this.undoStack.length > this.maxUndo) this.undoStack.shift();
  }

  undo() {
    if (this.undoStack.length < 2) return;
    this.redoStack.push(this.undoStack.pop()!);
    const state = this.undoStack[this.undoStack.length - 1];
    this.ctx.putImageData(state, 0, 0);
  }

  redo() {
    if (this.redoStack.length === 0) return;
    const state = this.redoStack.pop()!;
    this.undoStack.push(state);
    this.ctx.putImageData(state, 0, 0);
  }

  clearCanvas() {
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
    this.saveState();
  }

  onColorChange(color: string) {
    this.currentColor = color;
    this.addRecentColor(color);
  }

  addRecentColor(color: string) {
    this.recentColors = this.recentColors.filter(c => c !== color);
    this.recentColors.unshift(color);
    if (this.recentColors.length > 8) this.recentColors.pop();
  }

  async savePainting() {
    const userId = this.parentRef?.user?.id;
    if (!userId) { this.parentRef?.showNotification('Please log in to save paintings.'); return; }

    this.startLoading();
    try {
      const dataUrl = this.canvasRef.nativeElement.toDataURL('image/png');
      const body = {
        userId,
        imageData: dataUrl,
        fileName: this.fileName || undefined,
        fileId: this.currentFileId,
        visibility: this.visibility,
        width: this.canvasWidth,
        height: this.canvasHeight
      };
      const res: any = await firstValueFrom(this.http.post('/paint/save', body));
      this.currentFileId = res.fileId;
      this.fileName = res.fileName;
      this.parentRef?.showNotification('Painting saved!');
    } catch {
      this.parentRef?.showNotification('Error saving painting.');
    } finally {
      this.stopLoading();
    }
  }

  async loadPainting(fileId?: number) {
    if (!fileId && !this.currentFileId) { this.parentRef?.showNotification('No file to load.'); return; }
    this.startLoading();
    try {
      const body = { fileId: fileId ?? this.currentFileId };
      const res: any = await firstValueFrom(this.http.post('/paint/load', body));
      const img = new Image();
      img.onload = () => {
        this.ctx.drawImage(img, 0, 0);
        this.saveState();
        this.stopLoading();
      };
      img.onerror = () => { this.parentRef?.showNotification('Error loading image.'); this.stopLoading(); };
      img.src = res.imageData;
    } catch {
      this.parentRef?.showNotification('Error loading painting.');
      this.stopLoading();
    }
  }

  async loadPaintingByFileId() {
    const id = prompt('Enter File ID:');
    if (!id || isNaN(Number(id))) return;
    await this.loadPainting(Number(id));
  }

  downloadPainting() {
    const link = document.createElement('a');
    link.download = this.fileName || 'painting.png';
    link.href = this.canvasRef.nativeElement.toDataURL('image/png');
    link.click();
  }
  selectArea() {
    if (this.currentTool === 'select') {
      this.clearSelection();
      this.currentTool = '';
      return;
    }
    this.clearSelection();
    this.currentTool = 'select';
    this.parentRef?.showNotification('Select area by dragging on image');
  }
  async cropImage() {
    if (!this.parentRef) return;

    try {
      const confirmed = confirm('Are you sure you want to crop the image?');
      if (!confirmed) return;

      // Get current canvas data as base64 string
      const imageDataUrl = this.canvasRef.nativeElement.toDataURL('image/png');

      // Create a temporary offscreen canvas for cropping operations
      const tempCanvas = document.createElement('canvas');
      const tempCtx = tempCanvas.getContext('2d')!;
      const img = new Image();
      img.onload = () => {
        // Calculate selection boundaries with proper clamping
        let startX = Math.min(this.selectionStartX, this.selectionEndX);
        let endX = Math.max(this.selectionStartX, this.selectionEndX);
        let startY = Math.min(this.selectionStartY, this.selectionEndY);
        let endY = Math.max(this.selectionStartY, this.selectionEndY);

        // Clamp coordinates within bounds of original canvas size (for safety)
        startX = Math.max(0, Math.min(startX, this.canvasWidth));
        endX = Math.max(0, Math.min(endX, this.canvasWidth));
        startY = Math.max(0, Math.min(startY, this.canvasHeight));
        endY = Math.max(0, Math.min(endY, this.canvasHeight));

        // Set dimensions based on selected area
        tempCanvas.width = endX - startX;
        tempCanvas.height = endY - startY;

        if (tempCanvas.width <= 0 || tempCanvas.height <= 0) return; /* Invalid crop */

        // Draw cropped portion onto our temporary canvas using the calculated boundaries
        tempCtx.drawImage(
          img,
          startX, startY, tempCanvas.width, tempCanvas.height,
          0, 0, tempCanvas.width, tempCanvas.height
        );

        // Resize main canvas to cropped dimensions
        this.canvasWidth = tempCanvas.width;
        this.canvasHeight = tempCanvas.height;
        const canvas = this.canvasRef.nativeElement;
        canvas.width = this.canvasWidth;
        canvas.height = this.canvasHeight;
        const overlay = this.overlayRef.nativeElement;
        overlay.width = this.canvasWidth;
        overlay.height = this.canvasHeight;
        this.ctx = canvas.getContext('2d')!;
        this.overlayCtx = overlay.getContext('2d')!;
        this.ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
        this.ctx.globalCompositeOperation = 'source-over';
        this.ctx.drawImage(tempCanvas, 0, 0);
        this.saveState();

        this.parentRef?.showNotification('Image has been cropped successfully.');
      };
      img.src = imageDataUrl;
    } catch (ex) {
      console.error(ex);
      this.parentRef?.showNotification('Error during cropping operation.');
    } finally {
      /* Reset selection after crop */
      this.isSelectionActive = false;
      this.selectionStartX = 0; this.selectionEndX = 0;
      this.selectionStartY = 0; this.selectionEndY = 0;
    }
  }

  toggleMenuPanel() {
    this.showMenuPanel = !this.showMenuPanel;
  }

  applySize(w: string, h: string) {
    const nw = parseInt(w, 10);
    const nh = parseInt(h, 10);
    if (isNaN(nw) || isNaN(nh) || nw < this.canvasMinW || nh < this.canvasMinH) return;
    this.canvasWidth = nw;
    this.canvasHeight = nh;
    const canvas = this.canvasRef.nativeElement;
    canvas.width = nw;
    canvas.height = nh;
    const overlay = this.overlayRef.nativeElement;
    overlay.width = nw;
    overlay.height = nh;
    this.ctx = canvas.getContext('2d')!;
    this.overlayCtx = overlay.getContext('2d')!;
    this.clearSelection();
    this.saveState();
  }

  startResize(e: PointerEvent) {
    this.isResizing = true;
    this.resizeX = e.clientX;
    this.resizeY = e.clientY;
    this.resizeStartW = this.canvasWidth;
    this.resizeStartH = this.canvasHeight;
  }

  @HostListener('document:pointermove', ['$event'])
  onResizePointerMove(e: PointerEvent) {
    if (!this.isResizing) return;
    const dx = e.clientX - this.resizeX;
    const dy = e.clientY - this.resizeY;
    this.canvasWidth = Math.max(this.canvasMinW, this.resizeStartW + dx);
    this.canvasHeight = Math.max(this.canvasMinH, this.resizeStartH + dy);
    const canvas = this.canvasRef.nativeElement;
    canvas.width = this.canvasWidth;
    canvas.height = this.canvasHeight;
    const overlay = this.overlayRef.nativeElement;
    overlay.width = this.canvasWidth;
    overlay.height = this.canvasHeight;
    this.restoreOverlay();
  }

  @HostListener('document:pointerup', ['$event'])
  onResizePointerUp(e: PointerEvent) {
    if (!this.isResizing) return;
    this.isResizing = false;
    this.saveState();
  }

  newCanvas() {
    const w = prompt('Canvas width:', String(this.canvasWidth));
    const h = prompt('Canvas height:', String(this.canvasHeight));
    if (w && h && !isNaN(Number(w)) && !isNaN(Number(h))) {
      this.canvasWidth = Number(w);
      this.canvasHeight = Number(h);
      const canvas = this.canvasRef.nativeElement;
      canvas.width = this.canvasWidth;
      canvas.height = this.canvasHeight;
      const overlay = this.overlayRef.nativeElement;
      overlay.width = this.canvasWidth;
      overlay.height = this.canvasHeight;
      this.ctx = canvas.getContext('2d')!;
      this.overlayCtx = overlay.getContext('2d')!;
      this.undoStack = [];
      this.redoStack = [];
      this.clearCanvas();
    }
  }

  loadImageFromFile(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        this.canvasWidth = img.width;
        this.canvasHeight = img.height;
        const canvas = this.canvasRef.nativeElement;
        canvas.width = this.canvasWidth;
        canvas.height = this.canvasHeight;
        const overlay = this.overlayRef.nativeElement;
        overlay.width = this.canvasWidth;
        overlay.height = this.canvasHeight;
        this.ctx = canvas.getContext('2d')!;
        this.overlayCtx = overlay.getContext('2d')!;
        this.ctx.drawImage(img, 0, 0);
        this.saveState();
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
    input.value = '';
  }
}
