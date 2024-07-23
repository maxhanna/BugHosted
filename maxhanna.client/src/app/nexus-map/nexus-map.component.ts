import { AfterViewInit, Component, ElementRef, Input, OnInit, ViewChild } from '@angular/core';
import { NexusBase } from '../../services/datacontracts/nexus/nexus-base';
import { User } from '../../services/datacontracts/user/user';
import { FileEntry } from '../../services/datacontracts/file/file-entry';
import { FileService } from '../../services/file.service';
import { DirectoryResults } from '../../services/datacontracts/file/directory-results';

@Component({
  selector: 'app-nexus-map',
  templateUrl: './nexus-map.component.html',
  styleUrl: './nexus-map.component.css'
})
export class NexusMapComponent implements OnInit {
  mapData: NexusBase[] = [];
  grid: string[][] = [];

  nexusPictureSrc: string | undefined; 
  mapTileSrc: string | undefined; 

  @Input() user?: User;

  @ViewChild('mapInputX') mapInputX!: ElementRef<HTMLInputElement>;
  @ViewChild('mapInputY') mapInputY!: ElementRef<HTMLInputElement>;
  @ViewChild('mapContainer') mapContainer!: ElementRef;
   
  constructor(private fileService: FileService) {


  }

  ngOnInit() {  
    this.fileService.getFileSrcByFileId(5940)
      .then(src => {
        this.nexusPictureSrc = src;
      })
      .catch(error => {
        console.error('Error loading map tile source:', error);
      });

    this.fileService.getFileSrcByFileId(6251)
      .then(src => {
        this.mapTileSrc = src;
      })
      .catch(error => {
        console.error('Error loading map tile source:', error); 
      });
  }
  scrollToUserBase() {
    if (!this.user || !this.mapData || this.mapData.length === 0) return;

    const userBase = this.mapData.find(base => base.userId === this.user?.id);
    if (userBase && this.mapContainer) {
      const cell = this.mapContainer.nativeElement.querySelector(`.cell[x='${userBase.coordsX}'][y='${userBase.coordsY}']`);
      if (cell) {
        cell.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
      }
    }
  }

  scrollToCoordinates(coordsX: number, coordsY: number) {
    if (!this.user || !this.mapData || this.mapData.length === 0) return;

    const cell = this.mapContainer.nativeElement.querySelector(`.cell[x='${coordsX}'][y='${coordsY}']`);
    if (cell) {
      cell.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    }
  }

  setMapData(nexusBases: NexusBase[]) { 
    this.mapData = nexusBases;

    if (!this.mapData) return;
     
    for (let i = 0; i < 100; i++) {
      this.grid[i] = [];
      for (let j = 0; j < 100; j++) {
        var base = this.mapData.filter(x => x.coordsX == i && x.coordsY == j)[0];
        if (base) {
          this.grid[i][j] = base.commandCenterLevel + '';
        } else {
          this.grid[i][j] = "";
        }
      }
    }

    this.scrollToUserBase();
  }

  clearMapInputs() {
    this.mapInputX.nativeElement.value = '';
    this.mapInputY.nativeElement.value = ''; 
  }
  showMapLocation() {
    const x = parseInt(this.mapInputX.nativeElement.value);
    const y = parseInt(this.mapInputY.nativeElement.value);
    if (x < 0 || y < 0) { return alert("Invalid Coordinates."); }
    if (x > this.grid[0].length) {
      return alert("X coordinates off map.");
    } else if (y > this.grid[0].length) { 
      return alert("Y coordinates off map.");
    }
    this.scrollToCoordinates(x, y);
  }
  showHomeBase() {
    this.scrollToUserBase();
  }
  getRandomEmptyMapTile() {
    return this.mapTileSrc;
  }
}
