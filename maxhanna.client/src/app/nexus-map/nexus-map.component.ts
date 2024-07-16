import { AfterViewInit, Component, ElementRef, Input, OnInit, ViewChild } from '@angular/core';
import { NexusBase } from '../../services/datacontracts/nexus/nexus-base';
import { User } from '../../services/datacontracts/user/user';
import { FileEntry } from '../../services/datacontracts/file/file-entry';
import { FileService } from '../../services/file.service';

@Component({
  selector: 'app-nexus-map',
  templateUrl: './nexus-map.component.html',
  styleUrl: './nexus-map.component.css'
})
export class NexusMapComponent implements OnInit {
  mapData: NexusBase[] = [];
  grid: string[][] = [];

  nexusPicture: FileEntry | undefined;

  @Input() user?: User;

  @ViewChild('mapContainer') mapContainer!: ElementRef;
   
  constructor(private fileService: FileService) {


  }

  async ngOnInit() { 
    const picDirectoryRes = await this.fileService.getDirectory("Nexus/Assets", "all", "all", this.user, undefined, 1000, undefined, undefined, ["webp"]);
    if (picDirectoryRes) {
      this.nexusPicture = picDirectoryRes?.data?.filter((x: FileEntry) => x.id == 5940)[0]; 
    }
  }
  scrollToUserBase() { 
    if (!this.user || !this.mapData || this.mapData.length === 0) return;

    const userBase = this.mapData.find(base => base.userId === this.user?.id);
    if (userBase) {
      const cell = this.mapContainer.nativeElement.querySelector(`.cell[x='${userBase.coordsX}'][y='${userBase.coordsY}']`);
      if (cell) {
        cell.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
      }
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
}
