import { GameObject, HUD } from "../game-object";
import { Vector2 } from "../../../../services/datacontracts/bones/vector2";

export class LevelBadge extends GameObject {
  level: number;
  
  constructor(level: number, position: Vector2) {
    super({ position, drawLayer: HUD });
    this.level = level;
  }
  
  override drawImage(ctx: CanvasRenderingContext2D, drawPosX: number, drawPosY: number) {
    const radius = 5;
    const centerX = drawPosX + radius;
    const centerY = drawPosY + radius;
    
  // Draw circle background
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fill();
    
    // Draw level number
  ctx.font = '6px fontRetroGaming';
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(this.level.toString(), centerX, centerY + 1.5);
  }
}
