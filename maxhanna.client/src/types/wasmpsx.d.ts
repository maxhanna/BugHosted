declare global {
  interface WasmPsxPlayerElement extends HTMLElement {
    loadUrl(url: string): void;
    readFile(file: File): void;
    pause?: () => void;
    resume?: () => void;
  }

  interface HTMLElementTagNameMap {
    'wasmpsx-player': WasmPsxPlayerElement;
  }
}
export {};