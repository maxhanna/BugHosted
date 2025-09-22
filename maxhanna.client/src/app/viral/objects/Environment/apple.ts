// Viral version: Apple object that can be consumed by the virus
export class ViralApple {
    id: number;
    x: number;
    y: number;
    consumed: boolean = false;
    growthValue: number = 1;

    constructor(id: number, x: number, y: number) {
        this.id = id;
        this.x = x;
        this.y = y;
    }

    consume() {
        this.consumed = true;
        // Trigger backend call to /Viral/ConsumeObject
        // ...
    }
}
