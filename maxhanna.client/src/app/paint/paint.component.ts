import { Component, ElementRef, HostListener, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { FileEntry } from '../../services/datacontracts/file/file-entry';
import { MediaSelectorComponent } from '../media-selector/media-selector.component';
import { UserEventService } from '../../services/user-event.service';

/** One editable layer — an offscreen canvas composited onto the visible canvas
 *  with its own visibility and opacity. Pixels are transparent; the composite
 *  fills white beneath everything so the app keeps its white-canvas look. */
interface PaintLayer {
  id: number;
  name: string;
  canvas: HTMLCanvasElement;
  visible: boolean;
  opacity: number;
}

/** Undo/redo snapshot: a deep copy of every layer's pixels plus its state. */
interface LayerSnapshot {
  id: number;
  name: string;
  visible: boolean;
  opacity: number;
  imageData: ImageData;
}

/** A pen-tool anchor point (auto-smoothed bezier through the points). */
interface PenPt {
  x: number;
  y: number;
}

/** A slider parameter for a filter / adjustment. */
interface FilterParam {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
}

interface FilterDef {
  id: string;
  label: string;
  params: FilterParam[];
}

interface PsMenuItem {
  label?: string;
  header?: string;
  action?: string;
}

interface PsMenu {
  id: string;
  label: string;
  items: PsMenuItem[];
}

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
  @ViewChild('stage', { static: true }) stageRef!: ElementRef<HTMLDivElement>;
  @ViewChild('canvasWrapper', { static: false }) wrapperRef!: ElementRef<HTMLDivElement>;

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

  undoStack: LayerSnapshot[][] = [];
  redoStack: LayerSnapshot[][] = [];

  /** Layers, ordered bottom-first (index 0 = bottom of the stack). */
  layers: PaintLayer[] = [];
  activeLayerId = 0;
  private layerIdCounter = 1;

  fileName = '';
  currentFileId: number | null = null;
  visibility: string = 'Public';
  // File type picked in the File menu — drives both the data-URL mime type and
  // the file extension the server assigns on save.
  fileType: 'jpg' | 'png' | 'webp' = 'png';

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

  /** Bitmap selection mask (1 = selected). null = no selection (edit whole layer). */
  selectionMask: Uint8Array | null = null;
  private lassoPts: { x: number; y: number }[] = [];
  wandTolerance = 32;

  get isSelectionActive(): boolean {
    return !!this.selectionMask;
  }

  // Pen tool
  penPoints: PenPt[] = [];
  private penClosed = false;
  private penDragPt: PenPt | null = null;
  private lastPenDown: { x: number; y: number; t: number } | null = null;

  // Gradient tool
  gradientType: 'linear' | 'radial' = 'linear';
  gradientEndColor = '#ffffff';
  gradientEndTransparent = true;
  private gradEnd = { x: 0, y: 0 };

  // Clone stamp
  private cloneSrc: { x: number; y: number } | null = null;
  private cloneStart = { x: 0, y: 0 };
  private cloneSnap: HTMLCanvasElement | null = null;

  // Move tool
  private moveSnap: HTMLCanvasElement | null = null;
  private moveStart = { x: 0, y: 0 };

  // Hand pan
  private panStart = { x: 0, y: 0, sl: 0, st: 0 };
  private isPanning = false;

  // Fill dialog
  showFillDialog = false;
  fillOption = 'foreground';
  fillOptions = [
    { value: 'foreground', label: 'Foreground Color' },
    { value: 'background', label: 'Background Color' },
    { value: 'white', label: 'White' },
    { value: 'black', label: 'Black' },
    { value: 'gray', label: '50% Gray' },
  ];

  // Filter dialog (live preview)
  showFilterDialog = false;
  filterDef: FilterDef | null = null;
  filterParams: Record<string, number> = {};
  filterPreviewOn = true;
  private preFilterImage: ImageData | null = null;

  // PS-style menu bar
  openMenu: string | null = null;
  psMenus: PsMenu[] = [];

  showHelpDialog = false;
  helpShortcuts: [string, string][] = [
    ['V', 'Move active layer'], ['M', 'Marquee select'], ['L', 'Lasso'], ['W', 'Magic Wand'],
    ['I', 'Eyedropper (pick color)'], ['G', 'Gradient'], ['P', 'Pen path'], ['C', 'Clone stamp'],
    ['B', 'Brush'], ['E', 'Eraser'], ['F', 'Flood fill'], ['H', 'Hand / pan'], ['Z', 'Zoom (Alt+click out)'],
    ['T', 'Text'], ['[  ]', 'Brush size'], ['Enter', 'Commit pen path'], ['Esc', 'Cancel pen / close'],
    ['Alt+Click', 'Clone source / zoom out'], ['Ctrl+Z / Y', 'Undo / Redo'], ['Ctrl+C / X', 'Copy / Cut selection'],
    ['Ctrl+V', 'Paste image on layer'], ['Ctrl+D', 'Deselect'], ['Ctrl+A', 'Select all'],
    ['Ctrl+0 / 1', 'Fit / 100% zoom'],
  ];

  showMenuPanel = false;
  menuTab: string = 'file';

  private resizeX = 0;
  private resizeY = 0;
  private isResizing = false;
  private resizeStartW = 0;
  private resizeStartH = 0;
  canvasMinW = 1;
  canvasMinH = 1;

  brushSizes = [1, 2, 5, 10, 20, 30];
  presetColors = [
    '#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff',
    '#808080', '#800000', '#008000', '#000080', '#808000', '#800080', '#008080', '#c0c0c0',
    '#ff4500', '#ff8c00', '#ffd700', '#adff2f', '#00fa9a', '#00ced1', '#1e90ff', '#9370db',
    '#ff69b4', '#f08080', '#90ee90', '#add8e6', '#dda0dd', '#f0e68c', '#e0ffff', '#fff5ee',
  ];
  tools = [
    { id: 'move', label: '🖐️', title: 'Move (V)' },
    { id: 'select', label: '⬜', title: 'Marquee Select (M)' },
    { id: 'lasso', label: '🪢', title: 'Lasso (L)' },
    { id: 'wand', label: '🪄', title: 'Magic Wand (W)' },
    { id: 'eyedropper', label: '💧', title: 'Eyedropper (I)' },
    { id: 'gradient', label: '🌗', title: 'Gradient (G)' },
    { id: 'pen', label: '🖊️', title: 'Pen (P)' },
    { id: 'pencil', label: '✏️', title: 'Pencil' },
    { id: 'brush', label: '🖌️', title: 'Brush (B)' },
    { id: 'eraser', label: '🧽', title: 'Eraser (E)' },
    { id: 'clone', label: '🧬', title: 'Clone Stamp (C) — Alt+click to sample' },
    { id: 'blurbrush', label: '💫', title: 'Blur Tool' },
    { id: 'smudge', label: '👆', title: 'Smudge Tool' },
    { id: 'line', label: '📏', title: 'Line' },
    { id: 'rect', label: '▭', title: 'Rectangle' },
    { id: 'filledRect', label: '▬', title: 'Filled Rect' },
    { id: 'circle', label: '○', title: 'Circle' },
    { id: 'filledCircle', label: '●', title: 'Filled Circle' },
    { id: 'fill', label: '🪣', title: 'Flood Fill (F)' },
    { id: 'text', label: '🔤', title: 'Text (T)' },
    { id: 'hand', label: '✋', title: 'Hand (H)' },
    { id: 'zoom', label: '🔍', title: 'Zoom (Z) — Alt+click to zoom out' },
  ];

  private maxUndo = 50;

  constructor(private http: HttpClient, private userEventService: UserEventService) { super(); }

  @HostListener('document:keydown', ['$event'])
  handleKeyboard(e: KeyboardEvent) {
    const t = e.target as HTMLElement | null;
    const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
    if (typing) {
      if (e.key === 'Escape') { this.showFilterDialog = false; this.showFillDialog = false; this.showHelpDialog = false; this.showTextDialog = false; }
      return;
    }

    if (e.ctrlKey || e.metaKey) {
      const k = e.key.toLowerCase();
      if (k === 'z') { e.preventDefault(); this.undo(); }
      else if (k === 'y') { e.preventDefault(); this.redo(); }
      else if (k === 'c') { e.preventDefault(); this.copySelection(); }
      else if (k === 'x') { e.preventDefault(); this.cutSelection(); }
      else if (k === 'd') { e.preventDefault(); this.deselect(); }
      else if (k === 'a') { e.preventDefault(); this.selectAll(); }
      else if (k === '0') { e.preventDefault(); this.zoomFit(); }
      else if (k === '1') { e.preventDefault(); this.zoom100(); }
      else if (k === '=' || k === '+') { e.preventDefault(); this.zoomIn(); }
      else if (k === '-') { e.preventDefault(); this.zoomOut(); }
      return;
    }

    switch (e.key.toLowerCase()) {
      case 'v': this.setTool('move'); break;
      case 'm': this.setTool('select'); break;
      case 'l': this.setTool('lasso'); break;
      case 'w': this.setTool('wand'); break;
      case 'i': this.setTool('eyedropper'); break;
      case 'g': this.setTool('gradient'); break;
      case 'p': this.setTool('pen'); break;
      case 'c': this.setTool('clone'); break;
      case 'e': this.setTool('eraser'); break;
      case 'b': this.setTool('brush'); break;
      case 'f': this.setTool('fill'); break;
      case 'h': this.setTool('hand'); break;
      case 'z': this.setTool('zoom'); break;
      case 't': this.setTool('text'); break;
      case 'escape': this.cancelPen(); this.openMenu = null; break;
      case 'enter': if (this.penPoints.length) { e.preventDefault(); this.commitPen(); } break;
      case 'backspace': if (this.currentTool === 'pen' && this.penPoints.length) { e.preventDefault(); this.penPoints.pop(); this.redrawPenOverlay(); } break;
      case '[': this.brushSize = Math.max(1, this.brushSize - 1); break;
      case ']': this.brushSize = Math.min(200, this.brushSize + 1); break;
    }
  }

  private buildPsMenus() {
    this.psMenus = [
      { id: 'file', label: 'File', items: [
        { label: 'New…', action: 'new' },
        { label: 'Open…', action: 'open' },
        { label: 'Save', action: 'save' },
        { header: 'Export' },
        { label: 'Export PNG', action: 'export.png' },
        { label: 'Export JPG', action: 'export.jpg' },
        { label: 'Export WebP', action: 'export.webp' },
        { label: 'Close', action: 'close' },
      ] },
      { id: 'edit', label: 'Edit', items: [
        { label: 'Undo', action: 'undo' },
        { label: 'Redo', action: 'redo' },
        { label: 'Copy Selection', action: 'copy' },
        { label: 'Cut Selection', action: 'cut' },
        { label: 'Paste Image', action: 'paste' },
        { label: 'Fill…', action: 'fill' },
        { label: 'Clear Selection Content', action: 'clearSel' },
        { label: 'Select All', action: 'selectAll' },
        { label: 'Deselect', action: 'deselect' },
        { label: 'Inverse Selection', action: 'inverse' },
      ] },
      { id: 'image', label: 'Image', items: [
        { label: 'Image Size… (scale)', action: 'scale' },
        { label: 'Canvas Size…', action: 'resize' },
        { header: 'Rotation & Flip' },
        { label: 'Rotate 90° CW', action: 'rotCw' },
        { label: 'Rotate 90° CCW', action: 'rotCcw' },
        { label: 'Rotate 180°', action: 'rot180' },
        { label: 'Flip Horizontal', action: 'flipH' },
        { label: 'Flip Vertical', action: 'flipV' },
        { header: 'Adjustments' },
        { label: 'Brightness/Contrast…', action: 'f.brightness' },
        { label: 'Hue/Saturation…', action: 'f.hueSat' },
        { label: 'Color Balance…', action: 'f.colorBalance' },
        { label: 'Levels…', action: 'f.levels' },
        { label: 'Vibrance…', action: 'f.vibrance' },
        { label: 'Invert', action: 'f.invert' },
        { label: 'Grayscale', action: 'f.grayscale' },
        { label: 'Sepia', action: 'f.sepia' },
        { label: 'Threshold…', action: 'f.threshold' },
        { label: 'Posterize…', action: 'f.posterize' },
        { label: 'Equalize', action: 'f.equalize' },
      ] },
      { id: 'layer', label: 'Layer', items: [
        { label: 'New Layer', action: 'layerNew' },
        { label: 'Duplicate Layer', action: 'layerDup' },
        { label: 'Delete Layer', action: 'layerDel' },
        { label: 'Rename Layer', action: 'layerRename' },
        { label: 'Move Layer Up', action: 'layerUp' },
        { label: 'Move Layer Down', action: 'layerDown' },
        { label: 'Merge Down', action: 'layerMerge' },
        { label: 'Flatten Image', action: 'layerFlatten' },
        { label: 'Rasterize', action: 'layerRasterize' },
      ] },
      { id: 'select', label: 'Select', items: [
        { label: 'All', action: 'selectAll' },
        { label: 'Deselect', action: 'deselect' },
        { label: 'Inverse', action: 'inverse' },
        { label: 'Color Range (Magic Wand)', action: 'wand' },
      ] },
      { id: 'filter', label: 'Filter', items: [
        { header: 'Blur' },
        { label: 'Gaussian Blur…', action: 'f.gaussian' },
        { label: 'Motion Blur…', action: 'f.motion' },
        { label: 'Radial Blur…', action: 'f.radial' },
        { label: 'Average', action: 'f.average' },
        { header: 'Sharpen' },
        { label: 'Sharpen', action: 'f.sharpen' },
        { label: 'Sharpen More', action: 'f.sharpenMore' },
        { label: 'Unsharp Mask…', action: 'f.unsharp' },
        { header: 'Noise' },
        { label: 'Add Noise…', action: 'f.noise' },
        { label: 'Median…', action: 'f.median' },
        { header: 'Pixelate' },
        { label: 'Mosaic…', action: 'f.mosaic' },
        { label: 'Fragment', action: 'f.fragment' },
        { header: 'Distort' },
        { label: 'Ripple…', action: 'f.ripple' },
        { label: 'Twirl…', action: 'f.twirl' },
        { label: 'Wave…', action: 'f.wave' },
        { label: 'Spherize…', action: 'f.spherize' },
        { header: 'Stylize' },
        { label: 'Emboss…', action: 'f.emboss' },
        { label: 'Find Edges', action: 'f.edges' },
        { label: 'Solarize', action: 'f.solarize' },
        { label: 'Neon Glow…', action: 'f.neon' },
        { header: 'Render' },
        { label: 'Clouds', action: 'f.clouds' },
        { label: 'Difference Clouds', action: 'f.diffClouds' },
        { label: 'Lens Flare…', action: 'f.flare' },
        { header: 'Other' },
        { label: 'Vignette…', action: 'f.vignette' },
      ] },
      { id: 'view', label: 'View', items: [
        { label: 'Zoom In', action: 'zoomIn' },
        { label: 'Zoom Out', action: 'zoomOut' },
        { label: 'Actual Pixels (100%)', action: 'zoom100' },
        { label: 'Fit on Screen', action: 'zoomFit' },
      ] },
      { id: 'help', label: 'Help', items: [
        { label: 'Keyboard Shortcuts', action: 'help' },
        { label: 'About Paint', action: 'about' },
      ] },
    ];
  }

  ngAfterViewInit() {
    if (this.onMobile()) {
      this.canvasWidth = 320;
      this.canvasHeight = 480;
    }
    const canvas = this.canvasRef.nativeElement;
    canvas.width = this.canvasWidth;
    canvas.height = this.canvasHeight;
    this.ctx = canvas.getContext('2d')!;

    const overlay = this.overlayRef.nativeElement;
    overlay.width = this.canvasWidth;
    overlay.height = this.canvasHeight;
    this.overlayCtx = overlay.getContext('2d')!;

    this.buildPsMenus();

    // Start with a single (empty) background layer; compositeLayers fills the
    // visible canvas white beneath the transparent layers.
    this.layers = [this.makeLayer('Background')];
    this.activeLayerId = this.layers[0].id;
    this.compositeLayers();
    this.saveState();

    // Fit the canvas to the window on open so the whole document — and any
    // selection ants — is visible even for large canvases. Ctrl+1 returns to
    // 100% and Ctrl+0 re-fits.
    if (!this.onMobile()) this.zoomFit();
  }

  // ── Layers ──────────────────────────────────────────────────────────────
  get activeLayer(): PaintLayer {
    return this.layers.find(l => l.id === this.activeLayerId) ?? this.layers[this.layers.length - 1];
  }

  get activeLayerName(): string {
    return this.activeLayer?.name ?? '';
  }

  /** Display order: top layer first. */
  get topLayers(): PaintLayer[] {
    return [...this.layers].reverse();
  }

  /** Drawing context of the active layer (all tool strokes land here). */
  private get activeCtx(): CanvasRenderingContext2D {
    return this.activeLayer.canvas.getContext('2d')!;
  }

  private makeLayer(name: string): PaintLayer {
    const c = document.createElement('canvas');
    c.width = this.canvasWidth;
    c.height = this.canvasHeight;
    return { id: this.layerIdCounter++, name, canvas: c, visible: true, opacity: 1 };
  }

  /** Rebuilds the visible canvas from the layer stack (white background first,
   *  then each visible layer top-down with its opacity). Keeps this.ctx valid. */
  private compositeLayers() {
    const canvas = this.canvasRef.nativeElement;
    if (!canvas) return;
    this.ctx = canvas.getContext('2d')!;
    this.ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
    for (const layer of this.layers) {
      if (!layer.visible || layer.opacity <= 0) continue;
      this.ctx.globalAlpha = layer.opacity;
      this.ctx.drawImage(layer.canvas, 0, 0);
    }
    this.ctx.globalAlpha = 1;
  }

  /** Maps a pointer event to canvas pixel coords, accounting for the zoom
   *  transform applied to the stage. */
  private getPos(e: PointerEvent): { x: number; y: number } {
    const rect = this.stageRef.nativeElement.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / this.zoom,
      y: (e.clientY - rect.top) / this.zoom
    };
  }

  onPointerDown(e: PointerEvent) {
    const canvas = this.canvasRef.nativeElement;
    try { canvas.setPointerCapture(e.pointerId); } catch { }
    const pos = this.getPos(e);

    // Zoom tool: click to zoom in, Alt+click to zoom out.
    if (this.currentTool === 'zoom') {
      if (e.altKey) this.zoomOut(); else this.zoomIn();
      return;
    }

    // Hand tool: pan the scrollable canvas area.
    if (this.currentTool === 'hand') {
      this.isPanning = true;
      const wr = this.wrapperRef?.nativeElement;
      this.panStart = { x: e.clientX, y: e.clientY, sl: wr?.scrollLeft ?? 0, st: wr?.scrollTop ?? 0 };
      return;
    }

    // Eyedropper: sample the composite color under the cursor.
    if (this.currentTool === 'eyedropper') {
      this.pickColorAt(pos.x, pos.y);
      return;
    }

    // Marquee: dragging draws a new selection that replaces any existing one;
    // a plain click (no drag) clears the current selection (see onPointerUp).
    if (this.currentTool === 'select') {
      this.selectionStartX = pos.x;
      this.selectionStartY = pos.y;
      this.selectionEndX = pos.x;
      this.selectionEndY = pos.y;
      this.isDrawing = true;
      return;
    }

    // Lasso: freehand polygon selection.
    if (this.currentTool === 'lasso') {
      if (this.selectionMask) this.clearSelection();
      this.lassoPts = [pos];
      this.isDrawing = true;
      return;
    }

    // Magic wand: contiguous color-range selection.
    if (this.currentTool === 'wand') {
      this.wandSelect(pos.x, pos.y);
      return;
    }

    // Pen: add/move anchors, double-click to commit.
    if (this.currentTool === 'pen') {
      this.penPointerDown(e, pos);
      return;
    }

    // Move: drag the active layer's whole content.
    if (this.currentTool === 'move') {
      this.moveStart = pos;
      const lc = this.activeLayer.canvas;
      this.moveSnap = document.createElement('canvas');
      this.moveSnap.width = lc.width;
      this.moveSnap.height = lc.height;
      this.moveSnap.getContext('2d')!.drawImage(lc, 0, 0);
      this.isDrawing = true;
      return;
    }

    // Clone stamp: Alt+click sets the source, then paint copies of it.
    if (this.currentTool === 'clone') {
      if (e.altKey) {
        this.cloneSrc = { x: pos.x, y: pos.y };
        this.parentRef?.showNotification('Clone source set — paint to stamp it.');
        return;
      }
      if (!this.cloneSrc) {
        this.parentRef?.showNotification('Alt+click to set the clone source first.');
        return;
      }
      const lc = this.activeLayer.canvas;
      this.cloneSnap = document.createElement('canvas');
      this.cloneSnap.width = lc.width;
      this.cloneSnap.height = lc.height;
      this.cloneSnap.getContext('2d')!.drawImage(lc, 0, 0);
      this.cloneStart = pos;
      this.stampClone(pos);
      this.isDrawing = true;
      this.lastX = pos.x;
      this.lastY = pos.y;
      return;
    }

    if (this.currentTool === 'smudge') {
      this.isDrawing = true;
      this.lastX = pos.x;
      this.lastY = pos.y;
      return;
    }

    if (this.currentTool === 'blurbrush') {
      this.isDrawing = true;
      this.lastX = pos.x;
      this.lastY = pos.y;
      this.stampBlur(pos);
      return;
    }

    if (this.currentTool === 'gradient') {
      this.startX = pos.x;
      this.startY = pos.y;
      this.gradEnd = pos;
      this.isDrawing = true;
      return;
    }

    if (this.isSelectionActive) {
      this.clearSelection();
    }

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

    // Hand pan
    if (this.currentTool === 'hand' && this.isPanning) {
      const wr = this.wrapperRef?.nativeElement;
      if (wr) {
        wr.scrollLeft = this.panStart.sl - (e.clientX - this.panStart.x);
        wr.scrollTop = this.panStart.st - (e.clientY - this.panStart.y);
      }
      return;
    }

    // Lasso preview
    if (this.currentTool === 'lasso' && this.isDrawing) {
      const last = this.lassoPts[this.lassoPts.length - 1];
      if (!last || Math.hypot(pos.x - last.x, pos.y - last.y) > 3) this.lassoPts.push(pos);
      this.overlayCtx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
      this.drawLassoPreview();
      return;
    }

    // Pen: dragging an anchor moves it; otherwise refresh the preview.
    if (this.currentTool === 'pen') {
      if (this.penDragPt) {
        this.penDragPt.x = pos.x;
        this.penDragPt.y = pos.y;
      }
      this.redrawPenOverlay();
      return;
    }

    // Move layer content
    if (this.currentTool === 'move' && this.isDrawing && this.moveSnap) {
      const dx = pos.x - this.moveStart.x;
      const dy = pos.y - this.moveStart.y;
      const lctx = this.activeCtx;
      lctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
      lctx.drawImage(this.moveSnap, dx, dy);
      this.compositeLayers();
      return;
    }

    // Clone stamp / smudge / blur brush strokes
    if (this.currentTool === 'clone' && this.isDrawing && this.cloneSnap && this.cloneSrc) {
      this.stampCloneLine(pos);
      this.lastX = pos.x;
      this.lastY = pos.y;
      return;
    }
    if (this.currentTool === 'smudge' && this.isDrawing) {
      this.smudgeTo(pos);
      this.lastX = pos.x;
      this.lastY = pos.y;
      return;
    }
    if (this.currentTool === 'blurbrush' && this.isDrawing) {
      this.stampBlurLine(pos);
      this.lastX = pos.x;
      this.lastY = pos.y;
      return;
    }

    // Gradient preview while dragging
    if (this.currentTool === 'gradient' && this.isDrawing) {
      this.gradEnd = pos;
      this.drawGradientPreview();
      return;
    }

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
        // Strokes commit to the active layer; the eraser carves transparency so
        // layers below show through.
        const lctx = this.activeCtx;
        lctx.save();
        if (this.currentTool === 'eraser') lctx.globalCompositeOperation = 'destination-out';
        lctx.beginPath();
        lctx.moveTo(this.lastX, this.lastY);
        lctx.lineTo(pos.x, pos.y);
        lctx.strokeStyle = this.currentColor;
        lctx.lineWidth = this.currentTool === 'pencil' ? 1 : this.brushSize;
        lctx.lineCap = 'round';
        lctx.lineJoin = 'round';
        lctx.stroke();
        lctx.restore();
        this.lastX = pos.x;
        this.lastY = pos.y;
        this.compositeLayers();
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
    if (this.currentTool === 'hand') { this.isPanning = false; return; }

    if (this.currentTool === 'pen') { this.penPointerUp(); return; }

    if (this.currentTool === 'select') {
      this.isDrawing = false;
      const x1 = Math.min(this.selectionStartX, this.selectionEndX);
      const y1 = Math.min(this.selectionStartY, this.selectionEndY);
      const x2 = Math.max(this.selectionStartX, this.selectionEndX);
      const y2 = Math.max(this.selectionStartY, this.selectionEndY);
      this.overlayCtx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
      if (Math.abs(x2 - x1) > 2 && Math.abs(y2 - y1) > 2) {
        this.commitMaskRect(x1, y1, x2, y2);
      } else {
        this.selectionMask = null;
      }
      return;
    }

    if (this.currentTool === 'lasso') {
      this.isDrawing = false;
      if (this.lassoPts.length >= 3) {
        this.closeLasso();
      } else {
        this.lassoPts = [];
        this.selectionMask = null;
        this.overlayCtx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
      }
      return;
    }

    if (this.currentTool === 'move' && this.isDrawing) {
      this.isDrawing = false;
      this.moveSnap = null;
      this.saveState();
      return;
    }

    if (this.currentTool === 'clone' && this.isDrawing) {
      this.isDrawing = false;
      this.cloneSnap = null;
      this.saveState();
      return;
    }

    if (this.currentTool === 'smudge' && this.isDrawing) {
      this.isDrawing = false;
      this.saveState();
      return;
    }

    if (this.currentTool === 'blurbrush' && this.isDrawing) {
      this.isDrawing = false;
      this.saveState();
      return;
    }

    if (this.currentTool === 'gradient' && this.isDrawing) {
      this.isDrawing = false;
      this.overlayCtx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
      this.applyGradient();
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

    this.saveState();
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
    if (this.currentTool === 'pen' && this.penPoints.length) { this.redrawPenOverlay(); return; }
    if (this.currentTool === 'lasso' && this.lassoPts.length) { this.drawLassoPreview(); return; }
    if (this.selectionMask) this.drawSelectionOverlay();
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
    this.selectionMask = null;
    this.lassoPts = [];
    this.overlayCtx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
    this.selectionStartX = 0;
    this.selectionStartY = 0;
    this.selectionEndX = 0;
    this.selectionEndY = 0;
  }

  /** Bounding box of the selection mask in pixel coords (x2/y2 exclusive), or null. */
  private maskBBox(): { x1: number; y1: number; x2: number; y2: number } | null {
    const m = this.selectionMask;
    if (!m) return null;
    const w = this.canvasWidth, h = this.canvasHeight;
    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        if (m[row + x]) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return null;
    return { x1: minX, y1: minY, x2: maxX + 1, y2: maxY + 1 };
  }

  /** Replaces the mask with a rectangle (clamped) and repaints the ants. */
  private commitMaskRect(x1: number, y1: number, x2: number, y2: number) {
    const w = this.canvasWidth, h = this.canvasHeight;
    const mask = new Uint8Array(w * h);
    const l = Math.max(0, Math.floor(Math.min(x1, x2)));
    const r = Math.min(w, Math.ceil(Math.max(x1, x2)));
    const t = Math.max(0, Math.floor(Math.min(y1, y2)));
    const b = Math.min(h, Math.ceil(Math.max(y1, y2)));
    for (let y = t; y < b; y++) for (let x = l; x < r; x++) mask[y * w + x] = 1;
    this.selectionMask = mask;
    this.drawSelectionOverlay();
  }

  private drawSelectionOverlay() {
    const bbox = this.maskBBox();
    if (!bbox) return;
    this.overlayCtx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
    this.drawSelectionRect(this.overlayCtx, bbox.x1, bbox.y1, bbox.x2, bbox.y2);
  }

  private drawLine(x1: number, y1: number, x2: number, y2: number) {
    const lctx = this.activeCtx;
    lctx.beginPath();
    lctx.moveTo(x1, y1);
    lctx.lineTo(x2, y2);
    lctx.strokeStyle = this.currentColor;
    lctx.lineWidth = this.brushSize;
    lctx.stroke();
    this.compositeLayers();
  }

  private drawRect(x1: number, y1: number, x2: number, y2: number, fill: boolean) {
    const lctx = this.activeCtx;
    if (fill) {
      lctx.fillStyle = this.currentColor;
      lctx.fillRect(x1, y1, x2 - x1, y2 - y1);
    } else {
      lctx.strokeStyle = this.currentColor;
      lctx.lineWidth = this.brushSize;
      lctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
    }
    this.compositeLayers();
  }

  private drawEllipse(x1: number, y1: number, x2: number, y2: number, fill: boolean) {
    const rx = Math.abs(x2 - x1) / 2;
    const ry = Math.abs(y2 - y1) / 2;
    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;
    const lctx = this.activeCtx;
    lctx.beginPath();
    lctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    if (fill) {
      lctx.fillStyle = this.currentColor;
      lctx.fill();
    }
    lctx.strokeStyle = this.currentColor;
    lctx.lineWidth = this.brushSize;
    lctx.stroke();
    this.compositeLayers();
  }

  private floodFill(startX: number, startY: number, fillColor: string) {
    const w = this.canvasWidth;
    const h = this.canvasHeight;

    // Clamp coordinates to canvas bounds (mobile touch events can fire out-of-bounds)
    startX = Math.max(0, Math.min(w - 1, Math.round(startX)));
    startY = Math.max(0, Math.min(h - 1, Math.round(startY)));

    const lctx = this.activeCtx;
    const imageData = lctx.getImageData(0, 0, w, h);
    const data = imageData.data;

    const idx = (startY * w + startX) * 4;
    const targetR = data[idx];
    const targetG = data[idx + 1];
    const targetB = data[idx + 2];
    const targetA = data[idx + 3];

    const fill = this.hexToRgb(fillColor);
    if (!fill) return;
    if (targetR === fill.r && targetG === fill.g && targetB === fill.b && targetA === 255) return;

    let minX = 0, maxX = w, minY = 0, maxY = h;
    const bbox = this.maskBBox();
    if (bbox) {
      minX = Math.max(0, Math.floor(bbox.x1));
      maxX = Math.min(w, Math.ceil(bbox.x2));
      minY = Math.max(0, Math.floor(bbox.y1));
      maxY = Math.min(h, Math.ceil(bbox.y2));
      if (startX < minX || startX >= maxX || startY < minY || startY >= maxY) return;
    }

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

      if (cx > minX) { stack.push(cx - 1, cy); }
      if (cx < maxX - 1) { stack.push(cx + 1, cy); }
      if (cy > minY) { stack.push(cx, cy - 1); }
      if (cy < maxY - 1) { stack.push(cx, cy + 1); }
    }

    lctx.putImageData(imageData, 0, 0);
    this.compositeLayers();
  }

  private hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) } : null;
  }

  placeText() {
    if (!this.textInput.trim()) { this.showTextDialog = false; return; }
    const lctx = this.activeCtx;
    lctx.font = `${this.fontSize}px ${this.fontFamily}`;
    lctx.fillStyle = this.currentColor;
    lctx.fillText(this.textInput, this.textX, this.textY);
    this.textInput = '';
    this.showTextDialog = false;
    this.compositeLayers();
    this.saveState();
  }

  cancelText() {
    this.textInput = '';
    this.showTextDialog = false;
  }  private snapshotLayers(): LayerSnapshot[] {
    return this.layers.map(l => ({
      id: l.id,
      name: l.name,
      visible: l.visible,
      opacity: l.opacity,
      imageData: l.canvas.getContext('2d')!.getImageData(0, 0, this.canvasWidth, this.canvasHeight)
    }));
  }

  private restoreSnapshot(snap: LayerSnapshot[]) {
    this.layers = snap.map(s => {
      const c = document.createElement('canvas');
      c.width = this.canvasWidth;
      c.height = this.canvasHeight;
      c.getContext('2d')!.putImageData(s.imageData, 0, 0);
      return { id: s.id, name: s.name, canvas: c, visible: s.visible, opacity: s.opacity };
    });
    if (!this.layers.find(l => l.id === this.activeLayerId)) {
      this.activeLayerId = this.layers[this.layers.length - 1]?.id ?? 0;
    }
    this.compositeLayers();
  }

  private saveState() {
    this.undoStack.push(this.snapshotLayers());
    this.redoStack = [];
    if (this.undoStack.length > this.maxUndo) this.undoStack.shift();
  }

  undo() {
    if (this.undoStack.length < 2) return;
    this.redoStack.push(this.undoStack.pop()!);
    this.restoreSnapshot(this.undoStack[this.undoStack.length - 1]);
  }

  redo() {
    if (this.redoStack.length === 0) return;
    const state = this.redoStack.pop()!;
    this.undoStack.push(state);
    this.restoreSnapshot(state);
  }

  clearCanvas() {
    for (const layer of this.layers) {
      layer.canvas.getContext('2d')!.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
    }
    this.compositeLayers();
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

  private getMimeType(): string {
    switch (this.fileType) {
      case 'jpg': return 'image/jpeg';
      case 'webp': return 'image/webp';
      default: return 'image/png';
    }
  }

  async savePainting() {
    const userId = this.parentRef?.user?.id;
    if (!userId) { this.parentRef?.showNotification('Please log in to save paintings.'); return; }

    this.startLoading();
    try {
      const dataUrl = this.canvasRef.nativeElement.toDataURL(this.getMimeType());
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
        this.resetToSingleLayer(img);
        this.stopLoading();
      };
      img.onerror = () => { this.parentRef?.showNotification('Error loading image.'); this.stopLoading(); };
      img.src = res.imageData;
    } catch {
      this.parentRef?.showNotification('Error loading painting.');
      this.stopLoading();
    }
  }

  // ── Layer operations ────────────────────────────────────────────────────
  setActiveLayer(id: number) {
    this.activeLayerId = id;
  }

  opacityPct(l: PaintLayer): number {
    return Math.round(l.opacity * 100);
  }

  addLayer() {
    const layer = this.makeLayer(`Layer ${this.layers.length}`);
    this.layers.push(layer);
    this.activeLayerId = layer.id;
    this.compositeLayers();
    this.saveState();
  }

  deleteLayer(id: number) {
    if (this.layers.length <= 1) return;
    const i = this.layers.findIndex(l => l.id === id);
    if (i < 0) return;
    this.layers.splice(i, 1);
    if (this.activeLayerId === id) {
      this.activeLayerId = this.layers[Math.max(0, i - 1)].id;
    }
    this.compositeLayers();
    this.saveState();
  }

  /** dir = +1 moves toward the top of the stack, -1 toward the bottom. */
  moveLayer(id: number, dir: number) {
    const i = this.layers.findIndex(l => l.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= this.layers.length) return;
    [this.layers[i], this.layers[j]] = [this.layers[j], this.layers[i]];
    this.compositeLayers();
    this.saveState();
  }

  duplicateLayer(id: number) {
    const i = this.layers.findIndex(l => l.id === id);
    if (i < 0) return;
    const src = this.layers[i];
    const copy = this.makeLayer(src.name + ' copy');
    copy.canvas.getContext('2d')!.drawImage(src.canvas, 0, 0);
    copy.visible = src.visible;
    copy.opacity = src.opacity;
    this.layers.splice(i + 1, 0, copy);
    this.activeLayerId = copy.id;
    this.compositeLayers();
    this.saveState();
  }

  toggleLayerVisible(id: number) {
    const layer = this.layers.find(l => l.id === id);
    if (!layer) return;
    layer.visible = !layer.visible;
    this.compositeLayers();
    this.saveState();
  }

  setLayerOpacity(id: number, value: string) {
    const layer = this.layers.find(l => l.id === id);
    if (!layer) return;
    layer.opacity = Math.max(0, Math.min(1, Number(value) / 100));
    this.compositeLayers();
  }

  renameLayer(id: number) {
    const layer = this.layers.find(l => l.id === id);
    if (!layer) return;
    const name = prompt('Layer name:', layer.name);
    if (name && name.trim()) {
      layer.name = name.trim();
    }
  }

  @ViewChild('mediaSelector') mediaSelector!: MediaSelectorComponent;

  onMediaSelected(files: FileEntry[]) {
    if (!files || files.length === 0) return;
    const fileId = files[0].id;
    if (fileId) {
      this.loadPainting(fileId);
      // Clear the media selector after loading so it doesn't show stale selection
      this.mediaSelector.selectedFiles = [];
    }
  }

  downloadPainting() {
    const userId = this.parentRef?.user?.id;
    if(!userId) { return; }

    // Emit user event before downloading
    try {
      this.userEventService.insertUserEvent(userId, 'paint', 'downloaded_painting');
    } catch(ex) {
      console.error("Failed to insert user event:", ex); 
    }

    const link = document.createElement('a');
    const ext = this.fileType === 'jpg' ? 'jpg' : this.fileType;
    link.download = this.fileName || ('painting.' + ext);
    link.href = this.canvasRef.nativeElement.toDataURL(this.getMimeType());
    link.click();
  }
  /** Sets the active tool (used by the toolbar, keyboard, and menus). */
  setTool(t: string) {
    this.currentTool = t;
    const c = this.canvasRef.nativeElement;
    c.style.cursor = t === 'hand' ? 'grab' : t === 'move' ? 'move' : t === 'eyedropper' ? 'copy'
      : t === 'zoom' ? 'zoom-in' : 'crosshair';
  }
  async cropImage() {
    if (!this.parentRef) return;

    const bbox = this.maskBBox();
    if (!bbox) { this.parentRef?.showNotification('Select an area first (Marquee, Lasso or Wand).'); return; }

    const confirmed = confirm('Are you sure you want to crop the image?');
    if (!confirmed) return;

    try {
      let startX = Math.max(0, Math.min(bbox.x1, this.canvasWidth));
      let endX = Math.max(0, Math.min(bbox.x2, this.canvasWidth));
      let startY = Math.max(0, Math.min(bbox.y1, this.canvasHeight));
      let endY = Math.max(0, Math.min(bbox.y2, this.canvasHeight));
      const sw = endX - startX;
      const sh = endY - startY;
      if (sw <= 0 || sh <= 0) return; /* Invalid crop */

      // Crop every layer to the selected region.
      this.rebuildLayersTo(sw, sh,
        (nctx, old) => nctx.drawImage(old, startX, startY, sw, sh, 0, 0, sw, sh), true);
      this.parentRef?.showNotification('Image has been cropped successfully.');
    } catch (ex) {
      console.error(ex);
      this.parentRef?.showNotification('Error during cropping operation.');
    } finally {
      /* Reset selection after crop (mask coordinates no longer apply). */
      this.selectionMask = null;
      this.lassoPts = [];
    }
  }

  toggleMenuPanel() {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(async () => {
      this.showMenuPanel = !this.showMenuPanel;
      if (this.showMenuPanel) {
        this.parentRef?.showOverlay();
      } else {
        this.parentRef?.closeOverlay(false);
      }
    }, 50); 
  }

  /** Recreates every layer canvas at a new size, applying the same transform
   *  to each (resize keeps top-left, scale stretches, crop cuts), then
   *  re-composites the visible canvas. */
  private rebuildLayersTo(newW: number, newH: number,
    draw: (nctx: CanvasRenderingContext2D, old: HTMLCanvasElement) => void, save: boolean) {
    for (const layer of this.layers) {
      const old = layer.canvas;
      const nc = document.createElement('canvas');
      nc.width = newW;
      nc.height = newH;
      draw(nc.getContext('2d')!, old);
      layer.canvas = nc;
    }
    this.canvasWidth = newW;
    this.canvasHeight = newH;
    const canvas = this.canvasRef.nativeElement;
    canvas.width = newW;
    canvas.height = newH;
    this.ctx = canvas.getContext('2d')!;
    const overlay = this.overlayRef.nativeElement;
    overlay.width = newW;
    overlay.height = newH;
    this.overlayCtx = overlay.getContext('2d')!;
    this.clearSelection();
    this.compositeLayers();
    if (save) this.saveState();
  }

  /** Resets the document to a single layer (used by new/open/load). */
  private resetToSingleLayer(img?: HTMLImageElement) {
    const w = img ? img.width : this.canvasWidth;
    const h = img ? img.height : this.canvasHeight;
    this.canvasWidth = Math.max(this.canvasMinW, w);
    this.canvasHeight = Math.max(this.canvasMinH, h);
    const canvas = this.canvasRef.nativeElement;
    canvas.width = this.canvasWidth;
    canvas.height = this.canvasHeight;
    this.ctx = canvas.getContext('2d')!;
    const overlay = this.overlayRef.nativeElement;
    overlay.width = this.canvasWidth;
    overlay.height = this.canvasHeight;
    this.overlayCtx = overlay.getContext('2d')!;
    this.clearSelection();
    this.layers = [this.makeLayer('Background')];
    this.activeLayerId = this.layers[0].id;
    if (img) {
      this.layers[0].canvas.getContext('2d')!.drawImage(img, 0, 0);
    }
    this.undoStack = [];
    this.redoStack = [];
    this.compositeLayers();
    this.saveState();
  }

  applySize(w: string, h: string) {
    const nw = parseInt(w, 10);
    const nh = parseInt(h, 10);
    if (isNaN(nw) || isNaN(nh) || nw < this.canvasMinW || nh < this.canvasMinH) return;
    this.rebuildLayersTo(nw, nh, (nctx, old) => nctx.drawImage(old, 0, 0), true);
  }

  scaleCanvas(w: string, h: string) {
    const nw = parseInt(w, 10);
    const nh = parseInt(h, 10);
    if (isNaN(nw) || isNaN(nh) || nw < this.canvasMinW || nh < this.canvasMinH) return;
    this.rebuildLayersTo(nw, nh, (nctx, old) => nctx.drawImage(old, 0, 0, nw, nh), true);
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
    const newW = Math.max(this.canvasMinW, this.resizeStartW + dx);
    const newH = Math.max(this.canvasMinH, this.resizeStartH + dy);
    // Live-resize every layer (top-left preserved); the undo state is only
    // recorded once on pointerup.
    this.rebuildLayersTo(newW, newH, (nctx, old) => nctx.drawImage(old, 0, 0), false);
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
      this.canvasWidth = Math.max(this.canvasMinW, Number(w));
      this.canvasHeight = Math.max(this.canvasMinH, Number(h));
      const canvas = this.canvasRef.nativeElement;
      canvas.width = this.canvasWidth;
      canvas.height = this.canvasHeight;
      const overlay = this.overlayRef.nativeElement;
      overlay.width = this.canvasWidth;
      overlay.height = this.canvasHeight;
      this.ctx = canvas.getContext('2d')!;
      this.overlayCtx = overlay.getContext('2d')!;
      this.clearSelection();
      this.undoStack = [];
      this.redoStack = [];
      this.layers = [this.makeLayer('Background')];
      this.activeLayerId = this.layers[0].id;
      this.compositeLayers();
      this.saveState();
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
        // Open replaces the whole document: reset to a single layer with the image.
        this.resetToSingleLayer(img);
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
    input.value = '';
  }

  /** Adds a local image as a NEW layer on top of all others (no canvas resize). */
  addImageLayerFromFile(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    this.addImageAsLayer(input.files[0], input.files[0].name || 'Image');
    input.value = '';
  }

  /** Decodes an image blob and adds it as a new layer on top of the stack. */
  private addImageAsLayer(file: File, layerName?: string) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const layer = this.makeLayer(layerName || 'Image');
        layer.canvas.getContext('2d')!.drawImage(img, 0, 0);
        this.layers.push(layer);
        this.activeLayerId = layer.id;
        this.compositeLayers();
        this.saveState();
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  }

  /** Paste: Ctrl+V / Cmd+V pastes a clipboard image onto a brand-new top layer.
   *  Lets text fields keep their own paste behavior. */
  @HostListener('document:paste', ['$event'])
  handlePaste(e: ClipboardEvent) {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          this.addImageAsLayer(file, 'Pasted image');
          this.parentRef?.showNotification('Image pasted on a new layer.');
          return;
        }
      }
    }
  }

  /** Toolbar fallback (touch devices have no Ctrl+V): reads the clipboard directly. */
  async pasteFromClipboard() {
    try {
      if (!navigator.clipboard?.read) {
        this.parentRef?.showNotification('Clipboard images are not supported in this browser.');
        return;
      }
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const type = item.types.find(t => t.startsWith('image/'));
        if (type) {
          const blob = await item.getType(type);
          this.addImageAsLayer(new File([blob], 'Pasted image', { type }), 'Pasted image');
          this.parentRef?.showNotification('Image pasted on a new layer.');
          return;
        }
      }
      this.parentRef?.showNotification('No image found on the clipboard.');
    } catch {
      this.parentRef?.showNotification('Could not read the clipboard.');
    }
  }

  // ── Eyedropper ───────────────────────────────────────────────────────────
  private pickColorAt(x: number, y: number) {
    const i = Math.floor(x), j = Math.floor(y);
    if (i < 0 || j < 0 || i >= this.canvasWidth || j >= this.canvasHeight) return;
    const data = this.ctx.getImageData(i, j, 1, 1).data;
    const hex = '#' + [data[0], data[1], data[2]].map(v => v.toString(16).padStart(2, '0')).join('');
    this.onColorChange(hex);
    this.parentRef?.showNotification('Color picked: ' + hex.toUpperCase());
  }

  // ── Gradient tool ────────────────────────────────────────────────────────
  private drawGradientPreview() {
    this.overlayCtx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
    const ctx = this.overlayCtx;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(this.startX, this.startY);
    ctx.lineTo(this.gradEnd.x, this.gradEnd.y);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.stroke();
    ctx.restore();
    const a = { x: this.startX, y: this.startY }, b = { x: this.gradEnd.x, y: this.gradEnd.y };
    ctx.fillStyle = this.currentColor;
    ctx.beginPath(); ctx.arc(a.x, a.y, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = this.gradientEndTransparent ? '#000000' : this.gradientEndColor;
    ctx.beginPath(); ctx.arc(b.x, b.y, 3, 0, Math.PI * 2); ctx.fill();
  }

  private applyGradient() {
    const lctx = this.activeCtx;
    const end = this.gradientEndTransparent ? 'rgba(255,255,255,0)' : this.gradientEndColor;
    const dx = this.gradEnd.x - this.startX;
    const dy = this.gradEnd.y - this.startY;
    const dist = Math.max(1, Math.hypot(dx, dy));
    let grad: CanvasGradient;
    if (this.gradientType === 'radial') {
      grad = lctx.createRadialGradient(this.startX, this.startY, 0, this.startX, this.startY, dist);
    } else {
      grad = lctx.createLinearGradient(this.startX, this.startY, this.gradEnd.x, this.gradEnd.y);
    }
    grad.addColorStop(0, this.currentColor);
    grad.addColorStop(1, end);
    lctx.fillStyle = grad;
    lctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
    this.compositeLayers();
    this.saveState();
  }

  // ── Pen tool ─────────────────────────────────────────────────────────────
  private penPointerDown(e: PointerEvent, pos: { x: number; y: number }) {
    // Drag an existing anchor to move it.
    const near = this.penPoints.find(p => Math.hypot(p.x - pos.x, p.y - pos.y) < 7);
    if (near) { this.penDragPt = near; return; }

    // Double-click (or click near the first anchor) commits the path.
    const now = Date.now();
    if (this.lastPenDown && now - this.lastPenDown.t < 350 && Math.hypot(this.lastPenDown.x - pos.x, this.lastPenDown.y - pos.y) < 10) {
      this.commitPen();
      return;
    }
    this.lastPenDown = { x: pos.x, y: pos.y, t: now };
    if (this.penPoints.length >= 2) {
      const first = this.penPoints[0];
      if (Math.hypot(first.x - pos.x, first.y - pos.y) < 9) {
        this.penClosed = true;
        this.commitPen();
        return;
      }
    }
    this.penPoints.push({ x: pos.x, y: pos.y });
    this.redrawPenOverlay();
  }

  private penPointerUp() {
    this.penDragPt = null;
  }

  private redrawPenOverlay() {
    this.overlayCtx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
    if (!this.penPoints.length) return;
    const ctx = this.overlayCtx;
    ctx.strokeStyle = '#2bd9ff';
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    this.drawPenPath(ctx, false);
    ctx.stroke();
    this.penPoints.forEach((p, i) => {
      ctx.fillStyle = i === 0 ? '#ffd23e' : '#ffffff';
      ctx.fillRect(p.x - 2.5, p.y - 2.5, 5, 5);
    });
  }

  /** Auto-smoothed bezier through the anchors (Catmull-Rom style). */
  private drawPenPath(ctx: CanvasRenderingContext2D, close: boolean) {
    const pts = this.penPoints;
    const n = pts.length;
    if (!n) return;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    if (n === 1) return;
    const P = (i: number) => pts[((i % n) + n) % n];
    const count = close ? n : n - 1;
    for (let i = 1; i < count; i++) {
      const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
      ctx.bezierCurveTo(p1.x + (p2.x - p0.x) / 6, p1.y + (p2.y - p0.y) / 6,
        p2.x - (p3.x - p1.x) / 6, p2.y - (p3.y - p1.y) / 6, p2.x, p2.y);
    }
    if (!close) ctx.lineTo(pts[n - 1].x, pts[n - 1].y);
    else ctx.closePath();
  }

  commitPen() {
    if (!this.penPoints.length) return;
    const lctx = this.activeCtx;
    this.drawPenPath(lctx, this.penClosed);
    if (this.penClosed) {
      lctx.fillStyle = this.currentColor;
      lctx.fill();
    }
    lctx.strokeStyle = this.currentColor;
    lctx.lineWidth = this.brushSize;
    lctx.lineJoin = 'round';
    lctx.lineCap = 'round';
    lctx.stroke();
    this.compositeLayers();
    this.penPoints = [];
    this.penClosed = false;
    this.overlayCtx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
    this.saveState();
  }

  cancelPen() {
    this.penPoints = [];
    this.penClosed = false;
    this.penDragPt = null;
    this.overlayCtx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
  }

  // ── Clone stamp ──────────────────────────────────────────────────────────
  private stampClone(pos: { x: number; y: number }) {
    if (!this.cloneSrc || !this.cloneSnap) return;
    const size = Math.max(4, this.brushSize);
    const lctx = this.activeCtx;
    lctx.save();
    lctx.globalCompositeOperation = 'copy';
    const dx = pos.x - this.cloneStart.x;
    const dy = pos.y - this.cloneStart.y;
    lctx.drawImage(this.cloneSnap, this.cloneSrc.x - size / 2 + dx, this.cloneSrc.y - size / 2 + dy, size, size,
      pos.x - size / 2, pos.y - size / 2, size, size);
    lctx.restore();
    this.compositeLayers();
  }

  private stampCloneLine(pos: { x: number; y: number }) {
    const d = Math.hypot(pos.x - this.lastX, pos.y - this.lastY);
    const steps = Math.max(1, Math.ceil(d / Math.max(2, this.brushSize / 2)));
    for (let i = 1; i <= steps; i++) {
      this.stampClone({ x: this.lastX + (pos.x - this.lastX) * i / steps, y: this.lastY + (pos.y - this.lastY) * i / steps });
    }
  }

  // ── Smudge tool ──────────────────────────────────────────────────────────
  private smudgeTo(pos: { x: number; y: number }) {
    const r = Math.max(2, Math.ceil(this.brushSize / 2));
    const sx = Math.round(this.lastX) - r, sy = Math.round(this.lastY) - r;
    try {
      const patch = document.createElement('canvas');
      patch.width = r * 2;
      patch.height = r * 2;
      const pctx = patch.getContext('2d')!;
      pctx.drawImage(this.activeLayer.canvas, sx, sy, r * 2, r * 2, 0, 0, r * 2, r * 2);
      const lctx = this.activeCtx;
      lctx.save();
      lctx.globalAlpha = 0.45;
      lctx.drawImage(patch, Math.round(pos.x) - r, Math.round(pos.y) - r);
      lctx.restore();
      this.compositeLayers();
    } catch { /* out-of-bounds patch */ }
  }

  // ── Blur brush ───────────────────────────────────────────────────────────
  private stampBlur(pos: { x: number; y: number }) {
    const r = Math.max(2, Math.ceil(this.brushSize / 2));
    const sx = Math.max(0, Math.round(pos.x) - r);
    const sy = Math.max(0, Math.round(pos.y) - r);
    const w = Math.min(r * 2, this.canvasWidth - sx);
    const h = Math.min(r * 2, this.canvasHeight - sy);
    if (w <= 0 || h <= 0) return;
    const tmp = document.createElement('canvas');
    tmp.width = w;
    tmp.height = h;
    const tctx = tmp.getContext('2d')!;
    tctx.drawImage(this.activeLayer.canvas, sx, sy, w, h, 0, 0, w, h);
    tctx.filter = 'blur(3px)';
    tctx.drawImage(tmp, 0, 0);
    tctx.filter = 'none';
    const lctx = this.activeCtx;
    lctx.save();
    lctx.globalAlpha = 0.8;
    lctx.drawImage(tmp, sx, sy);
    lctx.restore();
    this.compositeLayers();
  }

  private stampBlurLine(pos: { x: number; y: number }) {
    const d = Math.hypot(pos.x - this.lastX, pos.y - this.lastY);
    const steps = Math.max(1, Math.ceil(d / Math.max(2, this.brushSize / 2)));
    for (let i = 1; i <= steps; i++) {
      this.stampBlur({ x: this.lastX + (pos.x - this.lastX) * i / steps, y: this.lastY + (pos.y - this.lastY) * i / steps });
    }
  }

  // ── Magic wand ───────────────────────────────────────────────────────────
  private wandSelect(x: number, y: number) {
    x = Math.max(0, Math.min(this.canvasWidth - 1, Math.round(x)));
    y = Math.max(0, Math.min(this.canvasHeight - 1, Math.round(y)));
    const w = this.canvasWidth, h = this.canvasHeight;
    const data = this.activeLayer.canvas.getContext('2d')!.getImageData(0, 0, w, h).data;
    const idx = (y * w + x) * 4;
    const tr = data[idx], tg = data[idx + 1], tb = data[idx + 2], ta = data[idx + 3];
    const tol = this.wandTolerance;
    const mask = new Uint8Array(w * h);
    const stack: number[] = [x, y];
    while (stack.length) {
      const cy = stack.pop()!, cx = stack.pop()!;
      const pi = cy * w + cx;
      if (mask[pi]) continue;
      const p4 = pi * 4;
      if (Math.abs(data[p4] - tr) > tol || Math.abs(data[p4 + 1] - tg) > tol ||
        Math.abs(data[p4 + 2] - tb) > tol || Math.abs(data[p4 + 3] - ta) > tol) continue;
      mask[pi] = 1;
      if (cx > 0) stack.push(cx - 1, cy);
      if (cx < w - 1) stack.push(cx + 1, cy);
      if (cy > 0) stack.push(cx, cy - 1);
      if (cy < h - 1) stack.push(cx, cy + 1);
    }
    this.selectionMask = mask;
    this.drawSelectionOverlay();
    this.parentRef?.showNotification('Color range selected (tolerance ' + this.wandTolerance + ').');
  }

  // ── Lasso ────────────────────────────────────────────────────────────────
  private drawLassoPreview() {
    const pts = this.lassoPts;
    if (pts.length < 2) return;
    const ctx = this.overlayCtx;
    ctx.strokeStyle = '#2bd9ff';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  private closeLasso() {
    const pts = this.lassoPts;
    const w = this.canvasWidth, h = this.canvasHeight;
    const mask = new Uint8Array(w * h);
    const n = pts.length;
    let minY = h, maxY = 0;
    for (const p of pts) {
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    minY = Math.max(0, Math.floor(minY));
    maxY = Math.min(h - 1, Math.ceil(maxY));
    for (let y = minY; y <= maxY; y++) {
      const xs: number[] = [];
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const a = pts[i], b = pts[j];
        if ((a.y > y) !== (b.y > y)) {
          xs.push((b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x);
        }
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const x1 = Math.max(0, Math.floor(xs[k]));
        const x2 = Math.min(w - 1, Math.ceil(xs[k + 1]));
        for (let x = x1; x <= x2; x++) mask[y * w + x] = 1;
      }
    }
    this.selectionMask = mask;
    this.lassoPts = [];
    this.drawSelectionOverlay();
  }

  // ── Selection ops (Edit / Select menus, Ctrl+A/D) ───────────────────────
  selectAll() {
    const m = new Uint8Array(this.canvasWidth * this.canvasHeight);
    m.fill(1);
    this.selectionMask = m;
    this.drawSelectionOverlay();
  }

  deselect() {
    this.selectionMask = null;
    this.lassoPts = [];
    this.overlayCtx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
  }

  inverseSelect() {
    const m = this.selectionMask;
    if (!m) return;
    for (let i = 0; i < m.length; i++) m[i] = m[i] ? 0 : 1;
    this.drawSelectionOverlay();
  }

  async copySelection() {
    const bbox = this.maskBBox();
    if (!bbox) { this.parentRef?.showNotification('Select an area first (Marquee, Lasso or Wand).'); return; }
    const tmp = document.createElement('canvas');
    tmp.width = bbox.x2 - bbox.x1;
    tmp.height = bbox.y2 - bbox.y1;
    tmp.getContext('2d')!.drawImage(this.activeLayer.canvas, bbox.x1, bbox.y1, tmp.width, tmp.height, 0, 0, tmp.width, tmp.height);
    try {
      const blob = await new Promise<Blob | null>(res => tmp.toBlob(res, 'image/png'));
      if (blob && navigator.clipboard?.write) {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        this.parentRef?.showNotification('Selection copied to clipboard.');
      } else {
        this.parentRef?.showNotification('Clipboard write not supported in this browser.');
      }
    } catch {
      this.parentRef?.showNotification('Could not copy selection.');
    }
  }

  cutSelection() {
    this.copySelection();
    this.clearSelectionContent();
  }

  clearSelectionContent() {
    const bbox = this.maskBBox();
    if (!bbox) return;
    const lctx = this.activeCtx;
    lctx.clearRect(bbox.x1, bbox.y1, bbox.x2 - bbox.x1, bbox.y2 - bbox.y1);
    this.compositeLayers();
    this.saveState();
  }

  doFill() {
    const color = this.fillOption === 'foreground' ? this.currentColor
      : this.fillOption === 'background' ? this.gradientEndColor
      : this.fillOption === 'white' ? '#ffffff'
      : this.fillOption === 'black' ? '#000000' : '#808080';
    const lctx = this.activeCtx;
    const bbox = this.maskBBox();
    lctx.save();
    if (bbox) {
      lctx.beginPath();
      lctx.rect(bbox.x1, bbox.y1, bbox.x2 - bbox.x1, bbox.y2 - bbox.y1);
      lctx.clip();
    }
    lctx.fillStyle = color;
    lctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
    lctx.restore();
    this.compositeLayers();
    this.saveState();
    this.showFillDialog = false;
  }

  // ── Zoom / view ──────────────────────────────────────────────────────────
  setZoom(z: number) { this.zoom = Math.max(0.1, Math.min(8, z)); }
  zoomIn() { this.setZoom(this.zoom * 1.5); }
  zoomOut() { this.setZoom(this.zoom / 1.5); }
  zoom100() { this.zoom = 1; }
  zoomFit() {
    const wr = this.wrapperRef?.nativeElement;
    if (!wr) return;
    const availW = Math.max(50, wr.clientWidth - 40);
    const availH = Math.max(50, wr.clientHeight - 40);
    this.setZoom(Math.min(availW / this.canvasWidth, availH / this.canvasHeight));
  }

  // ── Image ops (rotate / flip) ────────────────────────────────────────────
  private rotateLayers(deg: number, swap: boolean) {
    const oldW = this.canvasWidth, oldH = this.canvasHeight;
    const nw = swap ? oldH : oldW;
    const nh = swap ? oldW : oldH;
    this.rebuildLayersTo(nw, nh, (nctx, old) => {
      nctx.save();
      nctx.translate(nw / 2, nh / 2);
      nctx.rotate((deg * Math.PI) / 180);
      nctx.drawImage(old, -oldW / 2, -oldH / 2);
      nctx.restore();
    }, true);
  }

  rotate90cw() { this.rotateLayers(90, true); }
  rotate90ccw() { this.rotateLayers(-90, true); }
  rotate180() { this.rotateLayers(180, false); }

  flipH() {
    this.rebuildLayersTo(this.canvasWidth, this.canvasHeight, (nctx, old) => {
      nctx.save();
      nctx.translate(this.canvasWidth, 0);
      nctx.scale(-1, 1);
      nctx.drawImage(old, 0, 0);
      nctx.restore();
    }, true);
  }

  flipV() {
    this.rebuildLayersTo(this.canvasWidth, this.canvasHeight, (nctx, old) => {
      nctx.save();
      nctx.translate(0, this.canvasHeight);
      nctx.scale(1, -1);
      nctx.drawImage(old, 0, 0);
      nctx.restore();
    }, true);
  }

  // ── Layer ops (merge / flatten / rasterize) ─────────────────────────────
  mergeDown() {
    const i = this.layers.findIndex(l => l.id === this.activeLayerId);
    if (i <= 0) { this.parentRef?.showNotification('No layer below to merge into.'); return; }
    const lower = this.layers[i - 1], active = this.layers[i];
    const lc = lower.canvas.getContext('2d')!;
    lc.save();
    lc.globalAlpha = active.opacity;
    lc.drawImage(active.canvas, 0, 0);
    lc.restore();
    lower.visible = lower.visible && active.visible;
    this.layers.splice(i, 1);
    this.activeLayerId = lower.id;
    this.compositeLayers();
    this.saveState();
  }

  flattenImage() {
    if (this.layers.length <= 1) { this.parentRef?.showNotification('Image is already a single layer.'); return; }
    const flat = this.makeLayer('Flattened');
    const fc = flat.canvas.getContext('2d')!;
    fc.fillStyle = '#ffffff';
    fc.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
    for (const l of this.layers) {
      if (!l.visible || l.opacity <= 0) continue;
      fc.save();
      fc.globalAlpha = l.opacity;
      fc.drawImage(l.canvas, 0, 0);
      fc.restore();
    }
    this.layers = [flat];
    this.activeLayerId = flat.id;
    this.compositeLayers();
    this.saveState();
  }

  rasterize() {
    if (this.penPoints.length) { this.commitPen(); return; }
    this.parentRef?.showNotification('Layer is already rasterized — all painting is pixel-based.');
  }

  // ── PS menu bar ──────────────────────────────────────────────────────────
  togglePsMenu(id: string) {
    this.openMenu = this.openMenu === id ? null : id;
  }

  @HostListener('document:click', ['$event'])
  onDocClick(e: MouseEvent) {
    const el = e.target as HTMLElement;
    if (this.openMenu && !el.closest('.psMenuBar')) this.openMenu = null;
  }

  runMenuAction(action: string) {
    this.openMenu = null;
    switch (action) {
      case 'new': this.newCanvas(); break;
      case 'open': (document.getElementById('paintOpenInput') as HTMLInputElement | null)?.click(); break;
      case 'save': this.savePainting(); break;
      case 'export.png': this.fileType = 'png'; this.downloadPainting(); break;
      case 'export.jpg': this.fileType = 'jpg'; this.downloadPainting(); break;
      case 'export.webp': this.fileType = 'webp'; this.downloadPainting(); break;
      case 'close': this.remove_me?.('PaintComponent'); break;
      case 'undo': this.undo(); break;
      case 'redo': this.redo(); break;
      case 'copy': this.copySelection(); break;
      case 'cut': this.cutSelection(); break;
      case 'paste': this.pasteFromClipboard(); break;
      case 'fill': this.showFillDialog = true; break;
      case 'clearSel': this.clearSelectionContent(); break;
      case 'selectAll': this.selectAll(); break;
      case 'deselect': this.deselect(); break;
      case 'inverse': this.inverseSelect(); break;
      case 'wand': this.setTool('wand'); break;
      case 'scale': {
        const w = prompt('Image width:', String(this.canvasWidth));
        const h = prompt('Image height:', String(this.canvasHeight));
        if (w && h) this.scaleCanvas(w, h);
        break;
      }
      case 'resize': {
        const w = prompt('Canvas width:', String(this.canvasWidth));
        const h = prompt('Canvas height:', String(this.canvasHeight));
        if (w && h) this.applySize(w, h);
        break;
      }
      case 'rotCw': this.rotate90cw(); break;
      case 'rotCcw': this.rotate90ccw(); break;
      case 'rot180': this.rotate180(); break;
      case 'flipH': this.flipH(); break;
      case 'flipV': this.flipV(); break;
      case 'layerNew': this.addLayer(); break;
      case 'layerDup': this.duplicateLayer(this.activeLayerId); break;
      case 'layerDel': this.deleteLayer(this.activeLayerId); break;
      case 'layerRename': this.renameLayer(this.activeLayerId); break;
      case 'layerUp': this.moveLayer(this.activeLayerId, 1); break;
      case 'layerDown': this.moveLayer(this.activeLayerId, -1); break;
      case 'layerMerge': this.mergeDown(); break;
      case 'layerFlatten': this.flattenImage(); break;
      case 'layerRasterize': this.rasterize(); break;
      case 'zoomIn': this.zoomIn(); break;
      case 'zoomOut': this.zoomOut(); break;
      case 'zoom100': this.zoom100(); break;
      case 'zoomFit': this.zoomFit(); break;
      case 'help': this.showHelpDialog = true; break;
      case 'about':
        this.parentRef?.showNotification('BugHosted Paint — a Photoshop-style canvas editor with layers, filters, and vector pen tools.');
        break;
      default:
        if (action.startsWith('f.')) this.openFilter(action.slice(2));
        break;
    }
  }

  // ── Filters ──────────────────────────────────────────────────────────────
  private filterDefs: Record<string, FilterDef> = {
    gaussian: { id: 'gaussian', label: 'Gaussian Blur', params: [{ key: 'radius', label: 'Radius', min: 1, max: 64, step: 1, value: 8 }] },
    motion: { id: 'motion', label: 'Motion Blur', params: [{ key: 'length', label: 'Length', min: 1, max: 64, step: 1, value: 20 }, { key: 'angle', label: 'Angle', min: 0, max: 360, step: 1, value: 0 }] },
    radial: { id: 'radial', label: 'Radial Blur', params: [{ key: 'amount', label: 'Amount', min: 1, max: 30, step: 1, value: 10 }] },
    average: { id: 'average', label: 'Average', params: [] },
    sharpen: { id: 'sharpen', label: 'Sharpen', params: [] },
    sharpenMore: { id: 'sharpenMore', label: 'Sharpen More', params: [] },
    unsharp: { id: 'unsharp', label: 'Unsharp Mask', params: [{ key: 'amount', label: 'Amount', min: 1, max: 300, step: 1, value: 100 }, { key: 'radius', label: 'Radius', min: 1, max: 12, step: 1, value: 3 }] },
    noise: { id: 'noise', label: 'Add Noise', params: [{ key: 'amount', label: 'Amount', min: 1, max: 200, step: 1, value: 25 }] },
    median: { id: 'median', label: 'Median', params: [{ key: 'radius', label: 'Radius', min: 1, max: 5, step: 1, value: 3 }] },
    mosaic: { id: 'mosaic', label: 'Mosaic', params: [{ key: 'cell', label: 'Cell Size', min: 2, max: 64, step: 1, value: 10 }] },
    fragment: { id: 'fragment', label: 'Fragment', params: [] },
    ripple: { id: 'ripple', label: 'Ripple', params: [{ key: 'amount', label: 'Amount', min: -50, max: 50, step: 1, value: 10 }, { key: 'wavelength', label: 'Wavelength', min: 5, max: 100, step: 1, value: 20 }] },
    twirl: { id: 'twirl', label: 'Twirl', params: [{ key: 'angle', label: 'Angle', min: -360, max: 360, step: 1, value: 90 }] },
    wave: { id: 'wave', label: 'Wave', params: [{ key: 'amplitude', label: 'Amplitude', min: 1, max: 50, step: 1, value: 10 }, { key: 'wavelength', label: 'Wavelength', min: 5, max: 100, step: 1, value: 20 }] },
    spherize: { id: 'spherize', label: 'Spherize', params: [{ key: 'amount', label: 'Amount', min: -100, max: 100, step: 1, value: 50 }] },
    emboss: { id: 'emboss', label: 'Emboss', params: [{ key: 'angle', label: 'Angle', min: 0, max: 315, step: 45, value: 135 }] },
    edges: { id: 'edges', label: 'Find Edges', params: [] },
    solarize: { id: 'solarize', label: 'Solarize', params: [] },
    neon: { id: 'neon', label: 'Neon Glow', params: [{ key: 'amount', label: 'Glow', min: 1, max: 100, step: 1, value: 25 }] },
    clouds: { id: 'clouds', label: 'Clouds', params: [] },
    diffClouds: { id: 'diffClouds', label: 'Difference Clouds', params: [] },
    flare: { id: 'flare', label: 'Lens Flare', params: [{ key: 'brightness', label: 'Brightness', min: 10, max: 255, step: 1, value: 120 }] },
    vignette: { id: 'vignette', label: 'Vignette', params: [{ key: 'strength', label: 'Strength', min: 1, max: 100, step: 1, value: 40 }] },
    brightness: { id: 'brightness', label: 'Brightness/Contrast', params: [{ key: 'brightness', label: 'Brightness', min: -100, max: 100, step: 1, value: 0 }, { key: 'contrast', label: 'Contrast', min: -100, max: 100, step: 1, value: 0 }] },
    hueSat: { id: 'hueSat', label: 'Hue/Saturation', params: [{ key: 'hue', label: 'Hue', min: -180, max: 180, step: 1, value: 0 }, { key: 'sat', label: 'Saturation', min: -100, max: 100, step: 1, value: 0 }, { key: 'light', label: 'Lightness', min: -100, max: 100, step: 1, value: 0 }] },
    colorBalance: { id: 'colorBalance', label: 'Color Balance', params: [{ key: 'r', label: 'Red', min: -100, max: 100, step: 1, value: 0 }, { key: 'g', label: 'Green', min: -100, max: 100, step: 1, value: 0 }, { key: 'b', label: 'Blue', min: -100, max: 100, step: 1, value: 0 }] },
    levels: { id: 'levels', label: 'Levels', params: [{ key: 'black', label: 'Black Point', min: 0, max: 254, step: 1, value: 0 }, { key: 'white', label: 'White Point', min: 1, max: 255, step: 1, value: 255 }, { key: 'gamma', label: 'Gamma', min: 10, max: 500, step: 1, value: 100 }] },
    invert: { id: 'invert', label: 'Invert', params: [] },
    grayscale: { id: 'grayscale', label: 'Grayscale', params: [] },
    sepia: { id: 'sepia', label: 'Sepia', params: [] },
    threshold: { id: 'threshold', label: 'Threshold', params: [{ key: 'level', label: 'Level', min: 1, max: 254, step: 1, value: 128 }] },
    posterize: { id: 'posterize', label: 'Posterize', params: [{ key: 'levels', label: 'Levels', min: 2, max: 32, step: 1, value: 4 }] },
    equalize: { id: 'equalize', label: 'Equalize', params: [] },
    vibrance: { id: 'vibrance', label: 'Vibrance', params: [{ key: 'vibrance', label: 'Vibrance', min: -100, max: 100, step: 1, value: 30 }] },
  };

  openFilter(id: string) {
    const def = this.filterDefs[id];
    if (!def) return;
    const lctx = this.activeCtx;
    this.preFilterImage = lctx.getImageData(0, 0, this.canvasWidth, this.canvasHeight);
    this.filterDef = def;
    this.filterParams = {};
    for (const prm of def.params) this.filterParams[prm.key] = prm.value;
    this.filterPreviewOn = true;
    this.showFilterDialog = true;
    this.previewFilter();
  }

  onFilterParamChange() {
    if (this.filterPreviewOn) this.previewFilter();
  }

  previewFilter() {
    if (!this.filterDef) return;
    const lctx = this.activeCtx;
    if (this.preFilterImage) lctx.putImageData(this.preFilterImage, 0, 0);
    const out = this.runFilter(this.filterDef.id, this.filterParams);
    lctx.putImageData(out, 0, 0);
    this.compositeLayers();
  }

  applyFilter() {
    this.previewFilter();
    this.showFilterDialog = false;
    this.filterDef = null;
    this.preFilterImage = null;
    this.saveState();
  }

  cancelFilter() {
    if (this.preFilterImage) this.activeCtx.putImageData(this.preFilterImage, 0, 0);
    this.showFilterDialog = false;
    this.filterDef = null;
    this.preFilterImage = null;
    this.compositeLayers();
  }

  /** Applies a filter to the active layer's pixels and returns the new ImageData. */
  private runFilter(id: string, p: Record<string, number>): ImageData {
    const w = this.canvasWidth, h = this.canvasHeight;
    const lctx = this.activeCtx;
    const src = lctx.getImageData(0, 0, w, h);
    const d = src.data;
    const out = new ImageData(new Uint8ClampedArray(d), w, h);
    const od = out.data;
    const n = w * h;
    const lum = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;
    const clamp = (v: number) => v < 0 ? 0 : v > 255 ? 255 : v;

    const prm = (k: string, d: number) => p[k] ?? d;
    const radius = prm('radius', 8), motionLength = prm('length', 20), angle = prm('angle', 0),
      amount = prm('amount', 25), cellSize = prm('cell', 10), wavelength = prm('wavelength', 20),
      amplitude = prm('amplitude', 10), brightness = prm('brightness', 0), contrast = prm('contrast', 0),
      hue = prm('hue', 0), sat = prm('sat', 0), light = prm('light', 0),
      pr = prm('r', 0), pg = prm('g', 0), pb = prm('b', 0),
      black = prm('black', 0), white = prm('white', 255), gamma = prm('gamma', 100),
      vibrance = prm('vibrance', 30), level = prm('level', 128), lvl = prm('levels', 4),
      strength = prm('strength', 40);

    const rgb2hsl = (r: number, g: number, b: number): [number, number, number] => {
      r /= 255; g /= 255; b /= 255;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      let hh = 0, s = 0; const l = (mx + mn) / 2;
      const dd = mx - mn;
      if (dd !== 0) {
        s = l > 0.5 ? dd / (2 - mx - mn) : dd / (mx + mn);
        if (mx === r) hh = (g - b) / dd + (g < b ? 6 : 0);
        else if (mx === g) hh = (b - r) / dd + 2;
        else hh = (r - g) / dd + 4;
        hh /= 6;
      }
      return [hh, s, l];
    };
    const hsl2rgb = (hh: number, s: number, l: number): [number, number, number] => {
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const pp = 2 * l - q;
      const f = (t: number) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return pp + (q - pp) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return pp + (q - pp) * (2 / 3 - t) * 6;
        return pp;
      };
      return [f(hh + 1 / 3) * 255, f(hh) * 255, f(hh - 1 / 3) * 255];
    };

    // In-place sliding-window box blur (reads src, writes back to data).
    const boxBlur = (data: Uint8ClampedArray, radius: number) => {
      const buf = new Uint8ClampedArray(data.length);
      const r = Math.max(1, Math.floor(radius));
      for (let y = 0; y < h; y++) {
        let sr = 0, sg = 0, sb = 0, sa = 0;
        const row = y * w;
        for (let x = -r; x <= r; x++) {
          const xi = Math.min(w - 1, Math.max(0, x));
          const pi = (row + xi) * 4;
          sr += data[pi]; sg += data[pi + 1]; sb += data[pi + 2]; sa += data[pi + 3];
        }
        const count = r * 2 + 1;
        for (let x = 0; x < w; x++) {
          const pi = (row + x) * 4;
          buf[pi] = sr / count; buf[pi + 1] = sg / count; buf[pi + 2] = sb / count; buf[pi + 3] = sa / count;
          const xAdd = Math.min(w - 1, x + r + 1), xSub = Math.max(0, x - r);
          sr += data[(row + xAdd) * 4] - data[(row + xSub) * 4];
          sg += data[(row + xAdd) * 4 + 1] - data[(row + xSub) * 4 + 1];
          sb += data[(row + xAdd) * 4 + 2] - data[(row + xSub) * 4 + 2];
          sa += data[(row + xAdd) * 4 + 3] - data[(row + xSub) * 4 + 3];
        }
      }
      for (let x = 0; x < w; x++) {
        let sr = 0, sg = 0, sb = 0, sa = 0;
        for (let y = -r; y <= r; y++) {
          const yi = Math.min(h - 1, Math.max(0, y));
          const pi = (yi * w + x) * 4;
          sr += buf[pi]; sg += buf[pi + 1]; sb += buf[pi + 2]; sa += buf[pi + 3];
        }
        const count = r * 2 + 1;
        for (let y = 0; y < h; y++) {
          const pi = (y * w + x) * 4;
          data[pi] = sr / count; data[pi + 1] = sg / count; data[pi + 2] = sb / count; data[pi + 3] = sa / count;
          const yAdd = Math.min(h - 1, y + r + 1), ySub = Math.max(0, y - r);
          sr += buf[(yAdd * w + x) * 4] - buf[(ySub * w + x) * 4];
          sg += buf[(yAdd * w + x) * 4 + 1] - buf[(ySub * w + x) * 4 + 1];
          sb += buf[(yAdd * w + x) * 4 + 2] - buf[(ySub * w + x) * 4 + 2];
          sa += buf[(yAdd * w + x) * 4 + 3] - buf[(ySub * w + x) * 4 + 3];
        }
      }
    };

    switch (id) {
      case 'invert':
        for (let i = 0; i < n; i++) { const pi = i * 4; od[pi] = 255 - d[pi]; od[pi + 1] = 255 - d[pi + 1]; od[pi + 2] = 255 - d[pi + 2]; od[pi + 3] = d[pi + 3]; }
        break;
      case 'grayscale':
      case 'desaturate':
        for (let i = 0; i < n; i++) { const pi = i * 4; const v = lum(d[pi], d[pi + 1], d[pi + 2]); od[pi] = v; od[pi + 1] = v; od[pi + 2] = v; od[pi + 3] = d[pi + 3]; }
        break;
      case 'sepia':
        for (let i = 0; i < n; i++) {
          const pi = i * 4; const r = d[pi], g = d[pi + 1], b = d[pi + 2];
          od[pi] = clamp(0.393 * r + 0.769 * g + 0.189 * b);
          od[pi + 1] = clamp(0.349 * r + 0.686 * g + 0.168 * b);
          od[pi + 2] = clamp(0.272 * r + 0.534 * g + 0.131 * b);
          od[pi + 3] = d[pi + 3];
        }
        break;
      case 'threshold': {
        const t = level;
        for (let i = 0; i < n; i++) { const pi = i * 4; const v = lum(d[pi], d[pi + 1], d[pi + 2]) > t ? 255 : 0; od[pi] = v; od[pi + 1] = v; od[pi + 2] = v; od[pi + 3] = d[pi + 3]; }
        break;
      }
      case 'posterize': {
        const levels = Math.max(2, Math.round(lvl));
        const step = 255 / (levels - 1);
        for (let i = 0; i < n; i++) { const pi = i * 4; for (let c = 0; c < 3; c++) od[pi + c] = clamp(Math.round(Math.round(d[pi + c] / step) * step)); od[pi + 3] = d[pi + 3]; }
        break;
      }
      case 'equalize': {
        const hist = new Float64Array(256);
        for (let i = 0; i < n; i++) { const pi = i * 4; hist[Math.round(lum(d[pi], d[pi + 1], d[pi + 2]))]++; }
        let cdf = 0; const map = new Uint8ClampedArray(256);
        for (let i = 0; i < 256; i++) { cdf += hist[i]; map[i] = Math.round(cdf / n * 255); }
        for (let i = 0; i < n; i++) {
          const pi = i * 4; const l = Math.round(lum(d[pi], d[pi + 1], d[pi + 2]));
          const f = map[l] / Math.max(1, l);
          od[pi] = clamp(d[pi] * f); od[pi + 1] = clamp(d[pi + 1] * f); od[pi + 2] = clamp(d[pi + 2] * f); od[pi + 3] = d[pi + 3];
        }
        break;
      }
      case 'brightness': {
        const b = brightness / 100 * 255;
        const c = contrast;
        const f = (259 * (c + 255)) / (255 * (259 - c));
        for (let i = 0; i < n; i++) {
          const pi = i * 4;
          for (let ch = 0; ch < 3; ch++) od[pi + ch] = clamp(f * (d[pi + ch] + b - 128) + 128);
          od[pi + 3] = d[pi + 3];
        }
        break;
      }
      case 'hueSat': {
        const dh = hue / 360, ds = sat / 100, dl = light / 100;
        for (let i = 0; i < n; i++) {
          const pi = i * 4;
          const [hh, s, l] = rgb2hsl(d[pi], d[pi + 1], d[pi + 2]);
          let nh = (hh + dh) % 1; if (nh < 0) nh += 1;
          const ns = Math.max(0, Math.min(1, s + ds));
          const nl = Math.max(0, Math.min(1, l + dl));
          const [r, g, b] = hsl2rgb(nh, ns, nl);
          od[pi] = r; od[pi + 1] = g; od[pi + 2] = b; od[pi + 3] = d[pi + 3];
        }
        break;
      }
      case 'colorBalance': {
        const dr = pr, dg = pg, db = pb;
        for (let i = 0; i < n; i++) { const pi = i * 4; od[pi] = clamp(d[pi] + dr); od[pi + 1] = clamp(d[pi + 1] + dg); od[pi + 2] = clamp(d[pi + 2] + db); od[pi + 3] = d[pi + 3]; }
        break;
      }
      case 'levels': {
        const bl = black, wh = white, gamm = gamma / 100;
        const range = Math.max(1, wh - bl);
        for (let i = 0; i < n; i++) {
          const pi = i * 4;
          for (let c = 0; c < 3; c++) { const v = Math.pow(Math.max(0, (d[pi + c] - bl) / range), 1 / gamm); od[pi + c] = clamp(v * 255); }
          od[pi + 3] = d[pi + 3];
        }
        break;
      }
      case 'vibrance': {
        const vib = vibrance / 100;
        for (let i = 0; i < n; i++) {
          const pi = i * 4;
          const [hh, s, l] = rgb2hsl(d[pi], d[pi + 1], d[pi + 2]);
          const ns = Math.max(0, Math.min(1, s + vib * (1 - s)));
          const [r, g, b] = hsl2rgb(hh, ns, l);
          od[pi] = r; od[pi + 1] = g; od[pi + 2] = b; od[pi + 3] = d[pi + 3];
        }
        break;
      }
      case 'gaussian': {
        const r = Math.max(1, Math.round(radius / 2));
        boxBlur(od, r); boxBlur(od, r); boxBlur(od, r);
        break;
      }
      case 'motion': {
        const len = Math.max(1, Math.round(motionLength));
        const ang = (angle * Math.PI) / 180;
        const dx = Math.cos(ang), dy = Math.sin(ang);
        const steps = Math.min(len, 32);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          let sr = 0, sg = 0, sb = 0, sa = 0;
          for (let s = -steps; s <= steps; s++) {
            const sx = Math.min(w - 1, Math.max(0, Math.round(x + dx * s * len / steps)));
            const sy = Math.min(h - 1, Math.max(0, Math.round(y + dy * s * len / steps)));
            const pi = (sy * w + sx) * 4;
            sr += d[pi]; sg += d[pi + 1]; sb += d[pi + 2]; sa += d[pi + 3];
          }
          const c = steps * 2 + 1;
          const pi = (y * w + x) * 4;
          od[pi] = sr / c; od[pi + 1] = sg / c; od[pi + 2] = sb / c; od[pi + 3] = sa / c;
        }
        break;
      }
      case 'radial': {
        const amt = Math.max(1, Math.min(30, amount));
        const cx = w / 2, cy = h / 2;
        const k = Math.min(amt, 16);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          let sr = 0, sg = 0, sb = 0, sa = 0;
          for (let t = 0; t < k; t++) {
            const f = 1 - (t / k) * (amt / 30);
            const sx = Math.min(w - 1, Math.max(0, Math.round(cx + (x - cx) * f)));
            const sy = Math.min(h - 1, Math.max(0, Math.round(cy + (y - cy) * f)));
            const pi = (sy * w + sx) * 4;
            sr += d[pi]; sg += d[pi + 1]; sb += d[pi + 2]; sa += d[pi + 3];
          }
          const pi = (y * w + x) * 4;
          od[pi] = sr / k; od[pi + 1] = sg / k; od[pi + 2] = sb / k; od[pi + 3] = sa / k;
        }
        break;
      }
      case 'average': {
        let sr = 0, sg = 0, sb = 0, sa = 0;
        for (let i = 0; i < n; i++) { const pi = i * 4; sr += d[pi]; sg += d[pi + 1]; sb += d[pi + 2]; sa += d[pi + 3]; }
        for (let i = 0; i < n; i++) { const pi = i * 4; od[pi] = sr / n; od[pi + 1] = sg / n; od[pi + 2] = sb / n; od[pi + 3] = sa / n; }
        break;
      }
      case 'noise': {
        const amt = amount;
        for (let i = 0; i < n; i++) {
          const pi = i * 4; const nz = (Math.random() * 2 - 1) * amt;
          od[pi] = clamp(d[pi] + nz); od[pi + 1] = clamp(d[pi + 1] + nz); od[pi + 2] = clamp(d[pi + 2] + nz);
        }
        break;
      }
      case 'median': {
        const r = Math.max(1, Math.min(5, Math.round(radius)));
        const win = (r * 2 + 1) * (r * 2 + 1);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const vals = [new Array<number>(win), new Array<number>(win), new Array<number>(win)];
          let k = 0;
          for (let ky = -r; ky <= r; ky++) for (let kx = -r; kx <= r; kx++) {
            const sx = Math.min(w - 1, Math.max(0, x + kx)), sy = Math.min(h - 1, Math.max(0, y + ky));
            const pi = (sy * w + sx) * 4;
            vals[0][k] = d[pi]; vals[1][k] = d[pi + 1]; vals[2][k] = d[pi + 2];
            k++;
          }
          const pi = (y * w + x) * 4;
          for (let c = 0; c < 3; c++) { vals[c].sort((a, b) => a - b); od[pi + c] = vals[c][Math.floor(win / 2)]; }
          od[pi + 3] = d[pi + 3];
        }
        break;
      }
      case 'mosaic': {
        const cell = Math.max(2, Math.round(cellSize));
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const sx = Math.floor(x / cell) * cell, sy = Math.floor(y / cell) * cell;
          const pi = (sy * w + sx) * 4, qi = (y * w + x) * 4;
          od[qi] = d[pi]; od[qi + 1] = d[pi + 1]; od[qi + 2] = d[pi + 2]; od[qi + 3] = d[pi + 3];
        }
        break;
      }
      case 'fragment': {
        const offs = [[-2, 0], [2, 0], [0, -2], [0, 2]] as const;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          let sr = 0, sg = 0, sb = 0, sa = 0;
          for (const [ox, oy] of offs) {
            const sx = Math.min(w - 1, Math.max(0, x + ox)), sy = Math.min(h - 1, Math.max(0, y + oy));
            const pi = (sy * w + sx) * 4;
            sr += d[pi]; sg += d[pi + 1]; sb += d[pi + 2]; sa += d[pi + 3];
          }
          const pi = (y * w + x) * 4;
          od[pi] = sr / 4; od[pi + 1] = sg / 4; od[pi + 2] = sb / 4; od[pi + 3] = sa / 4;
        }
        break;
      }
      case 'ripple': {
        const amt = amount, wave = Math.max(1, wavelength);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const disp = Math.round(amt * Math.sin((y / wave) * Math.PI * 2));
          const sx = Math.min(w - 1, Math.max(0, x + disp));
          const pi = (y * w + sx) * 4, qi = (y * w + x) * 4;
          od[qi] = d[pi]; od[qi + 1] = d[pi + 1]; od[qi + 2] = d[pi + 2]; od[qi + 3] = d[pi + 3];
        }
        break;
      }
      case 'twirl': {
        const ang = (angle * Math.PI) / 180;
        const cx = w / 2, cy = h / 2, maxR = Math.hypot(cx, cy);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const dx = x - cx, dy = y - cy, r = Math.hypot(dx, dy);
          const a = Math.atan2(dy, dx) + ang * (1 - r / maxR);
          const sx = Math.min(w - 1, Math.max(0, Math.round(cx + Math.cos(a) * r)));
          const sy = Math.min(h - 1, Math.max(0, Math.round(cy + Math.sin(a) * r)));
          const pi = (sy * w + sx) * 4, qi = (y * w + x) * 4;
          od[qi] = d[pi]; od[qi + 1] = d[pi + 1]; od[qi + 2] = d[pi + 2]; od[qi + 3] = d[pi + 3];
        }
        break;
      }
      case 'wave': {
        const amt = amplitude, wave = Math.max(1, wavelength);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const disp = Math.round(amt * Math.sin((x / wave) * Math.PI * 2));
          const sy = Math.min(h - 1, Math.max(0, y + disp));
          const pi = (sy * w + x) * 4, qi = (y * w + x) * 4;
          od[qi] = d[pi]; od[qi + 1] = d[pi + 1]; od[qi + 2] = d[pi + 2]; od[qi + 3] = d[pi + 3];
        }
        break;
      }
      case 'spherize': {
        const amt = amount / 100;
        const cx = w / 2, cy = h / 2, maxR = Math.hypot(cx, cy);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const dx = x - cx, dy = y - cy, r = Math.hypot(dx, dy), f = maxR > 0 ? r / maxR : 0;
          const s = f * f * amt;
          const sx = Math.min(w - 1, Math.max(0, Math.round(cx + dx * (1 + s))));
          const sy = Math.min(h - 1, Math.max(0, Math.round(cy + dy * (1 + s))));
          const pi = (sy * w + sx) * 4, qi = (y * w + x) * 4;
          od[qi] = d[pi]; od[qi + 1] = d[pi + 1]; od[qi + 2] = d[pi + 2]; od[qi + 3] = d[pi + 3];
        }
        break;
      }
      case 'emboss': {
        const ang = Math.round((angle % 360) / 45) * 45 * Math.PI / 180;
        const kx = Math.round(Math.cos(ang)), ky = Math.round(Math.sin(ang));
        const kernel = [-kx - ky, -ky, kx - ky, -kx, 0, kx, -kx + ky, ky, kx + ky];
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          let v = 0, ki = 0;
          for (let yy = -1; yy <= 1; yy++) for (let xx = -1; xx <= 1; xx++, ki++) {
            const sx = Math.min(w - 1, Math.max(0, x + xx)), sy = Math.min(h - 1, Math.max(0, y + yy));
            const pi = (sy * w + sx) * 4;
            v += d[pi] * kernel[ki];
          }
          const pi = (y * w + x) * 4;
          const g = clamp(128 + v);
          od[pi] = g; od[pi + 1] = g; od[pi + 2] = g; od[pi + 3] = d[pi + 3];
        }
        break;
      }
      case 'edges': {
        const L = (xx: number, yy: number) => {
          const sx = Math.min(w - 1, Math.max(0, xx)), sy = Math.min(h - 1, Math.max(0, yy));
          const pi = (sy * w + sx) * 4;
          return lum(d[pi], d[pi + 1], d[pi + 2]);
        };
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          let gx = 0, gy = 0;
          for (let yy = -1; yy <= 1; yy++) for (let xx = -1; xx <= 1; xx++) {
            const kx = xx === 0 ? 0 : (xx < 0 ? -1 : 1), ky = yy === 0 ? 0 : (yy < 0 ? -1 : 1);
            gx += L(x + xx, y + yy) * kx;
            gy += L(x + xx, y + yy) * ky;
          }
          const v = 255 - Math.min(255, Math.hypot(gx, gy));
          const pi = (y * w + x) * 4;
          od[pi] = v; od[pi + 1] = v; od[pi + 2] = v; od[pi + 3] = d[pi + 3];
        }
        break;
      }
      case 'solarize':
        for (let i = 0; i < n; i++) { const pi = i * 4; for (let c = 0; c < 3; c++) { const v = d[pi + c]; od[pi + c] = v > 128 ? 255 - v : v; } od[pi + 3] = d[pi + 3]; }
        break;
      case 'neon': {
        const amt = amount / 100;
        const L = (xx: number, yy: number) => {
          const sx = Math.min(w - 1, Math.max(0, xx)), sy = Math.min(h - 1, Math.max(0, yy));
          const pi = (sy * w + sx) * 4;
          return lum(d[pi], d[pi + 1], d[pi + 2]);
        };
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          let gx = 0, gy = 0;
          for (let yy = -1; yy <= 1; yy++) for (let xx = -1; xx <= 1; xx++) {
            const kx = xx === 0 ? 0 : (xx < 0 ? -1 : 1), ky = yy === 0 ? 0 : (yy < 0 ? -1 : 1);
            gx += L(x + xx, y + yy) * kx;
            gy += L(x + xx, y + yy) * ky;
          }
          const m = Math.min(255, Math.hypot(gx, gy));
          const pi = (y * w + x) * 4;
          const t = (m / 255) * amt;
          od[pi] = d[pi] * (1 - t) + 255 * t;
          od[pi + 1] = d[pi + 1] * (1 - t) + 255 * t;
          od[pi + 2] = d[pi + 2] * (1 - t) + 255 * t;
          od[pi + 3] = d[pi + 3];
        }
        break;
      }
      case 'clouds': {
        const tmp = new Uint8ClampedArray(n * 4);
        for (let i = 0; i < n; i++) { const g = Math.random() * 255; const pi = i * 4; tmp[pi] = g; tmp[pi + 1] = g; tmp[pi + 2] = g; tmp[pi + 3] = 255; }
        boxBlur(tmp, 3); boxBlur(tmp, 3);
        for (let i = 0; i < n; i++) { const pi = i * 4; od[pi] = tmp[pi]; od[pi + 1] = tmp[pi + 1]; od[pi + 2] = tmp[pi + 2]; od[pi + 3] = d[pi + 3]; }
        break;
      }
      case 'diffClouds': {
        const cloud = new Uint8ClampedArray(n * 4);
        for (let i = 0; i < n; i++) { const g = Math.random() * 255; const pi = i * 4; cloud[pi] = g; cloud[pi + 1] = g; cloud[pi + 2] = g; cloud[pi + 3] = 255; }
        boxBlur(cloud, 3); boxBlur(cloud, 3);
        for (let i = 0; i < n; i++) {
          const pi = i * 4;
          const v = Math.abs(cloud[pi] - lum(d[pi], d[pi + 1], d[pi + 2]));
          od[pi] = v; od[pi + 1] = v; od[pi + 2] = v; od[pi + 3] = d[pi + 3];
        }
        break;
      }
      case 'flare': {
        const bright = brightness;
        const cx = w / 2, cy = h / 2, maxR = Math.hypot(cx, cy);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const r = maxR > 0 ? Math.hypot(x - cx, y - cy) / maxR : 1;
          const t = bright * Math.exp(-r * r * 5);
          const pi = (y * w + x) * 4;
          od[pi] = clamp(d[pi] + t); od[pi + 1] = clamp(d[pi + 1] + t); od[pi + 2] = clamp(d[pi + 2] + t);
        }
        break;
      }
      case 'vignette': {
        const str = strength / 100;
        const cx = w / 2, cy = h / 2, maxR = Math.hypot(cx, cy);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const r = maxR > 0 ? Math.hypot(x - cx, y - cy) / maxR : 1;
          const t = Math.min(1, r * r) * str;
          const pi = (y * w + x) * 4;
          od[pi] = clamp(d[pi] * (1 - t)); od[pi + 1] = clamp(d[pi + 1] * (1 - t)); od[pi + 2] = clamp(d[pi + 2] * (1 - t));
        }
        break;
      }
      case 'sharpen': {
        const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          let sr = 0, sg = 0, sb = 0, ki = 0;
          for (let yy = -1; yy <= 1; yy++) for (let xx = -1; xx <= 1; xx++, ki++) {
            const sx = Math.min(w - 1, Math.max(0, x + xx)), sy = Math.min(h - 1, Math.max(0, y + yy));
            const pi = (sy * w + sx) * 4, k = kernel[ki];
            sr += d[pi] * k; sg += d[pi + 1] * k; sb += d[pi + 2] * k;
          }
          const pi = (y * w + x) * 4;
          od[pi] = clamp(sr); od[pi + 1] = clamp(sg); od[pi + 2] = clamp(sb); od[pi + 3] = d[pi + 3];
        }
        break;
      }
      case 'sharpenMore': {
        const kernel = [-1, -1, -1, -1, 9, -1, -1, -1, -1];
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          let sr = 0, sg = 0, sb = 0, ki = 0;
          for (let yy = -1; yy <= 1; yy++) for (let xx = -1; xx <= 1; xx++, ki++) {
            const sx = Math.min(w - 1, Math.max(0, x + xx)), sy = Math.min(h - 1, Math.max(0, y + yy));
            const pi = (sy * w + sx) * 4, k = kernel[ki];
            sr += d[pi] * k; sg += d[pi + 1] * k; sb += d[pi + 2] * k;
          }
          const pi = (y * w + x) * 4;
          od[pi] = clamp(sr); od[pi + 1] = clamp(sg); od[pi + 2] = clamp(sb); od[pi + 3] = d[pi + 3];
        }
        break;
      }
      case 'unsharp': {
        const amt = amount / 100;
        const rad = Math.max(1, Math.round(radius));
        const blur = new Uint8ClampedArray(d);
        boxBlur(blur, rad); boxBlur(blur, rad); boxBlur(blur, rad);
        for (let i = 0; i < n; i++) {
          const pi = i * 4;
          for (let c = 0; c < 3; c++) {
            const diff = d[pi + c] - blur[pi + c];
            od[pi + c] = clamp(d[pi + c] + diff * amt);
          }
          od[pi + 3] = d[pi + 3];
        }
        break;
      }
      default:
        break;
    }
    return out;
  }
}
