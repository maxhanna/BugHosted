import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { User } from './datacontracts/user/user';

export interface GTNPCData {
  id: number;
  posX: number;
  posY?: number;
  posZ: number;
  yaw: number;
  speed: number;
  colorR: number;
  colorG: number;
  colorB: number;
  type?: string;
  gender?: string;
  health?: number;
  hasDriver?: boolean;
  passengerCount?: number;
  isShootingAt?: boolean;
  isBurning?: boolean;
  isSmoking?: boolean;
  isFleeing?: boolean;
  isDucking?: boolean;
  isArresting?: boolean;
  isSwimming?: boolean;
  targetNpcId?: number;
  maxHealth?: number;
}

export interface GTHighScoreEntry {
  playerId: number;
  playerName: string;
  kills: number;
  deaths: number;
  escapes: number;     // clean getaways (wanted burned fully off)
  busted: number;      // arrest bookings (weapons stripped, station respawn)
  resists: number;     // lifetime resisted-arrest attempts
  worstStreak: number; // longest resist run before a chase resolved
  money: number;
  moneyEarned: number; // lifetime cumulative money earned
  score: number;       // composite ranking: kills * 100 + money
}

export interface GTJumpRamp {
  id: number;
  name: string;
  globalBest: number;
  globalHolder: string;
  userBest: number;
  userHeight: number;
  userReward: number;
}

export interface DeadBodyData {
  id: number;
  posX: number;
  posZ: number;
  yaw: number;
  type: string;
  gender?: string;
  colorR?: number;
  colorG?: number;
  colorB?: number;
  deathTime: number;
  userId?: number;
}

export interface GTNPCResponse {
  cars: GTNPCData[];
  pedestrians: GTNPCData[];
  parkedCars: GTNPCData[];
  aircraft?: GTNPCData[];
  deadBodies?: DeadBodyData[];
}

export interface GTPlayerState {
  userId: number;
  posX: number;
  posY: number;
  posZ: number;
  yaw: number;
  pitch: number;
  carYaw: number;
  carSpeed: number;
  health: number;
  weapon: number;
  money: number;
  username: string;
  isShooting: boolean;
  modelUrl?: string;
  /** Stable deterministic appearance seed shared by every client. */
  appearanceSeed?: number;
  appearanceRole?: string;
  appearanceGender?: string;
  isInCar?: boolean;
  vehicleType?: string;
  carColorR?: number;
  carColorG?: number;
  carColorB?: number;
  passengerOfUserId?: number;
} 
export interface GTUpdatePositionResponse {
  ok: boolean;
  players: GTPlayerState[];
  shots?: any[];
  yourHealth?: number;
  wantedLevel?: number;
  yourMoney?: number;
  deadBodies?: DeadBodyData[];
  evicted?: boolean;
  respawnAtHome?: boolean;
  arrested?: boolean;
  arrestRespawn?: boolean;
  arrestResisted?: boolean;
  arrestRegrabbed?: boolean;
  lethalForce?: boolean;
  ownedWeapons?: any[];
  droppedWeapons?: any[];
  ammo?:any;
  chatMessages?: { userId: number; username: string; message: string; timestamp: string }[];
  yourKills?: number;
  newMoneyRecord?: boolean;
}

export interface DeadBody {
  id: number;
  x: number; z: number; yaw: number;
  type: string;
  gender?: string;
  mesh: CityMesh | CityMesh[];
  deathTime: number;
  lifetime: number;
  colorR?: number; colorG?: number; colorB?: number;
}

export interface ParkedCar {
  id: number;
  x: number; z: number; yaw: number;
  y?: number;
  type: string;
  health: number;
  isBurning?: boolean;
  isSmoking?: boolean;
  maxHealth?: number;
  smokeStarted?: number;
  fireStarted?: number;
  carFireX?: number; carFireZ?: number; carFireYaw?: number;
  submerged?: boolean;
  submergeStart?: number;
  mesh: CityMesh | CityMesh[];
  colorR: number; colorG: number; colorB: number;
}

export interface OtherPlayerState {
  userId: number;
  posX: number; posY: number; posZ: number;
  yaw: number;
  carSpeed: number;
  health: number; weapon: number;
  money: number;
  username: string;
  mesh: CityMesh | CityMesh[];
  modelUrl?: string;
  appearanceSeed?: number;
  appearanceRole?: string;
  appearanceGender?: string;
  isShooting: boolean;
  camYaw: number;
  camPitch: number;
  remoteShootTimer: number;
  isInCar: boolean;
  vehicleType?: string;
  carColorR?: number;
  carColorG?: number;
  carColorB?: number;
  passengerOfUserId?: number;
}
export interface CityMesh {
  originalVBO?: Float32Array;
  vao: WebGLVertexArrayObject;
  vbo: WebGLBuffer;
  ibo: WebGLBuffer;
  indexCount: number;
  indexType?: number;
  texture?: WebGLTexture | null;
  needsFlip?: boolean;
  vertexCount?: number;
  restPositions?: Float32Array;
  restNormals?: Float32Array;
  jointIndices?: Uint16Array;
  jointWeights?: Float32Array;
  minY?: number;
  maxY?: number;
  minX?: number;
  maxX?: number;
  minZ?: number;
  maxZ?: number;
  carName?: string;
  meshName?: string;
  renderScale?: number;
  yawOffset?: number;
  // Animation support — stored on loaded models that have skeletons
  animations?: GltfAnimation[];
  skeleton?: {
    boneParents: Int32Array;
    boneLocalMatrices: Float32Array;
    inverseBindMatrices: Float32Array;
    skinRootWorld: Float32Array;
    nodeToBoneIdx: Map<number, number>;
    boneCount: number;
    nodeNames: string[];
  };
}
export interface GltfAnimation {
  name: string;
  duration: number;                       // seconds (longest channel)
  channels: {
    nodeIndex: number;                    // GLTF node index
    path: 'translation' | 'rotation' | 'scale' | 'weights';
    sampler: {
      input: Float32Array;                // keyframe times (seconds)
      output: Float32Array;               // flat values (3 for translation, 4 for rotation, 3 for scale)
      interpolation: 'LINEAR' | 'STEP' | 'CUBICSPLINE';
    };
  }[];
}
export interface BuildingPlacement {
  model: CityMesh[];
  x: number;
  y: number;
  z: number;
  yaw: number;
  scale: [number, number, number];
}
export interface CityChunk {
  mesh: CityMesh;
  cx: number;
  cz: number;
  lamps: { x: number; z: number }[];
  hydrants: { x: number; z: number }[];
  buildings: BuildingPlacement[];
  benches: { x: number; z: number; yaw: number }[];
  barrels: { x: number; z: number; yaw: number }[];
  chickens: { x: number; z: number; yaw: number }[];
  trees: { x: number; z: number; yaw: number; scale: number }[];
  supermarkets: { x: number; z: number; yaw: number; hd: number; isConvenience?: boolean }[];
  tatami: { x: number; z: number; yaw: number }[];
  cabins: { x: number; z: number; yaw: number }[];
  lighthouses: { x: number; z: number; yaw: number }[];
  tropicalShops: { x: number; z: number; yaw: number }[];
  decorativeAircraft: { x: number; z: number; yaw: number; type: string; model?: CityMesh | CityMesh[] }[];
}
export interface Tracer {
  originX: number; originY: number; originZ: number;
  dirX: number; dirY: number; dirZ: number;
  age: number; lifetime: number;
}

export interface MuzzleFlash {
  x: number; y: number; z: number;
  dirX: number; dirY: number; dirZ: number;
  weapon: number;
  age: number; lifetime: number;
}

export interface Rocket {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  age: number; lifetime: number;
}

export interface Explosion {
  x: number; y: number; z: number;
  age: number; lifetime: number;
  /** Visual + blast multiplier; 1 = a normal explosion (barrel, car). */
  scale?: number;
}

export interface BloodSplat {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  size: number;
  age: number; lifetime: number;
}

export interface BloodPool {
  x: number; z: number;
  age: number; lifetime: number; maxRadius: number;
  variant?: number;
}

export interface VendingMachine {
  x: number; z: number;
  yaw: number;
}

export interface TrafficLane {
  fromIdx: number;
  toIdx: number;
  offsetX: number;
  offsetZ: number;
}

@Injectable({
  providedIn: 'root'
})
export class GrandtheftService {
  private baseUrl = '/grandtheft';

  constructor(private http: HttpClient) { }

  async getNPCs(worldId: number, posX: number, posZ: number, userId: number): Promise<GTNPCResponse | null> {
    try {
      const query = new URLSearchParams({
        posX: String(posX),
        posZ: String(posZ),
        userId: String(userId),
      });
      const response = await fetch(`${this.baseUrl}/npcs/${worldId}?${query.toString()}`, {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (!response.ok) return null;
      const data = await response.json() as Partial<GTNPCResponse>;
      // Keep malformed backend responses from reaching the renderer. Empty
      // arrays are valid; missing arrays are treated as an unavailable poll.
      if (!Array.isArray(data.cars) || !Array.isArray(data.pedestrians) || !Array.isArray(data.parkedCars)) {
        console.warn('Grand Theft NPC endpoint returned an invalid payload');
        return null;
      }
      return {
        cars: data.cars,
        pedestrians: data.pedestrians,
        parkedCars: data.parkedCars,
        aircraft: Array.isArray(data.aircraft) ? data.aircraft : [],
        deadBodies: Array.isArray(data.deadBodies) ? data.deadBodies : [],
      } as GTNPCResponse;
    } catch (e) {
      console.error('Error fetching Grand Theft NPCs', e);
      return null;
    }
  }

  // Spawns a moving NPC taxi on the server so a finished taxi ride "becomes"
  // a real taxi that drives away normally (visible to all nearby players).
  async spawnTaxi(worldId: number, posX: number, posZ: number, yaw: number): Promise<{ ok: boolean; id?: number } | null> {
    try {
      return await this.http.post<{ ok: boolean; id?: number }>(`${this.baseUrl}/spawntaxi`, { worldId, posX, posZ, yaw }).toPromise() ?? null;
    } catch (e) {
      console.error('Error spawning taxi', e);
      return null;
    }
  }

  async updatePosition(
    userId: number, worldId: number,
    posX: number, posY: number, posZ: number,
    yaw: number, pitch: number,
    carYaw: number, carSpeed: number,
    health: number, weapon: number, isShooting: boolean,
    modelUrl?: string, money?: number,
    isInCar?: boolean, vehicleType?: string,
    appearanceSeed?: number, appearanceRole?: string, appearanceGender?: string,
    carColorR?: number, carColorG?: number, carColorB?: number,
    passengerOfUserId?: number,
    chatMessage?: string,
    respawned?: boolean,
    ownedWeapons?: boolean[],
    ammo?: number[],
    wantedLevel?: number
  ): Promise<GTUpdatePositionResponse | null> {
    try {
      const body: any = { userId, worldId, posX, posY, posZ, yaw, pitch, carYaw, carSpeed, health, weapon, isShooting };
      if (modelUrl) body.modelUrl = modelUrl;
      if (money !== undefined) body.money = money;
      if (isInCar !== undefined) body.isInCar = isInCar;
      if (vehicleType) body.vehicleType = vehicleType;
      if (carColorR !== undefined) body.carColorR = carColorR;
      if (carColorG !== undefined) body.carColorG = carColorG;
      if (carColorB !== undefined) body.carColorB = carColorB;
      if (passengerOfUserId !== undefined) body.passengerOfUserId = passengerOfUserId;
      if (chatMessage !== undefined) body.chatMessage = chatMessage;
      if (respawned !== undefined) body.respawned = respawned;
      if (ownedWeapons) body.ownedWeapons = ownedWeapons;
      if (ammo) body.ammo = ammo;
      if (wantedLevel !== undefined) body.wantedLevel = wantedLevel;
      const response = await fetch(`${this.baseUrl}/updateposition`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify(body),
      });
      if (!response.ok) return null;
      return await response.json() as GTUpdatePositionResponse;
    } catch (e) {
      console.error('Error updating position', e);
      return null;
    }
  }

  async stealCar(npcId: number, userId: number): Promise<any> {
    try {
      return await this.http.post(`${this.baseUrl}/stealcar/${npcId}`, { userId, worldId: 1 }).toPromise() ?? null;
    } catch (e) {
      console.error('Error stealing car', e);
      return null;
    }
  }

  async parkCar(worldId: number, posX: number, posZ: number, yaw: number, colorR: number, colorG: number, colorB: number, vehicleType?: string): Promise<any> {
    try {
      const body: any = { worldId, posX, posZ, yaw, colorR, colorG, colorB };
      if (vehicleType) body.vehicleType = vehicleType;
      return await this.http.post(`${this.baseUrl}/parkcar`, body).toPromise();
    } catch (e) {
      console.error('Error parking car', e);
      return null;
    }
  }

  async getActivePlayers(signal?: AbortSignal): Promise<User[] | null> {
    try {
      const response = await fetch(`${this.baseUrl}/activeplayers`, { signal });
      if (!response.ok) return null;
      return await response.json() as User[];
    } catch (e) {
      console.error('Error fetching active players', e);
      return null;
    }
  }

  async getHighScores(sort: string = 'score', userId: number = 0, limit: number = 50): Promise<{ results: GTHighScoreEntry[]; totalCount: number; userRank: number; sort: string } | null> {
    try {
      const data: any = await this.http.get(`${this.baseUrl}/highscores?sort=${encodeURIComponent(sort)}&userId=${userId}&limit=${limit}&_=${Date.now()}`).toPromise();
      if (!data || typeof data !== 'object') return null;
      const results = data.results ?? data.highScores ?? data.rows ?? [];
      return {
        results: Array.isArray(results) ? results : [],
        totalCount: Number(data.totalCount ?? data.TotalCount ?? results.length),
        userRank: Number(data.userRank ?? data.UserRank ?? 0),
        sort: String(data.sort ?? data.Sort ?? sort),
      };
    } catch (e) {
      console.error('Error fetching high scores', e);
      return null;
    }
  }

  async getJumps(userId: number = 0): Promise<{ ramps: GTJumpRamp[] } | null> {
    try {
      const data: any = await this.http.get(`${this.baseUrl}/jumps?userId=${userId}`).toPromise();
      return data ?? null;
    } catch (e) {
      console.error('Error fetching jumps', e);
      return null;
    }
  }

  async submitJump(userId: number, rampId: number, distance: number, height: number): Promise<any> {
    try {
      return await this.http.post(`${this.baseUrl}/jump`, { userId, rampId, distance, height }).toPromise();
    } catch (e) {
      console.error('Error submitting jump', e);
      return null;
    }
  }
  
  async reportRobbery(userId: number, posX: number, posZ: number): Promise<any> {
    try {
      return await this.http.post(`${this.baseUrl}/robbery`, { userId, posX, posZ }).toPromise();
    } catch (e) {
      console.error('Error reporting robbery', e);
      return null;
    }
  }

  async hit(attackerId: number, targetId: number, worldId: number, damage: number, attackerX: number = 0, attackerZ: number = 0, weapon: number = -1, npcKill: boolean = false): Promise<any> {
    try {
      return await this.http.post(`${this.baseUrl}/hit`, { attackerId, targetId, worldId, damage, weapon, attackerX, attackerZ, npcKill }).toPromise();
    } catch (e) {
      console.error('Error registering hit', e);
      return null;
    }
  }

  // FIX: Garage system — store/retrieve/remove cars at the home base.
  async getGarageCar(userId: number): Promise<any> {
    try {
      return await this.http.get(`${this.baseUrl}/garage/${userId}`, { withCredentials: true }).toPromise() ?? null;
    } catch (e) {
      console.error('Error fetching garage car', e);
      return null;
    }
  }

  async storeGarageCar(userId: number, vehicleType: string, colorR: number, colorG: number, colorB: number, yaw: number): Promise<any> {
    try {
      return await this.http.post(`${this.baseUrl}/garage/store`, { userId, vehicleType, colorR, colorG, colorB, yaw }, { withCredentials: true }).toPromise() ?? null;
    } catch (e) {
      console.error('Error storing garage car', e);
      return null;
    }
  }

  async removeGarageCar(userId: number): Promise<any> {
    try {
      return await this.http.post(`${this.baseUrl}/garage/remove`, { userId }, { withCredentials: true }).toPromise() ?? null;
    } catch (e) {
      console.error('Error removing garage car', e);
      return null;
    }
  }

  async pickup(userId: number, dropId: number): Promise<any> {
    try {
      return await this.http.post(`${this.baseUrl}/pickup`, { userId, dropId }).toPromise();
    } catch (e) {
      console.error('Error picking up weapon', e);
      return null;
    }
  }
}
