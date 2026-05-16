import { AfterViewInit, Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { ChildComponent } from '../child.component';
import { UserPlant } from '../../services/datacontracts/planter/user-plant';
import { PlantPhoto } from '../../services/datacontracts/planter/plant-photo';
import { PlanterService } from '../../services/planter.service';
import { AppComponent } from '../app.component';
import { FileService } from '../../services/file.service';

@Component({
  selector: 'app-planter',
  templateUrl: './planter.component.html',
  styleUrl: './planter.component.css',
  standalone: false
})
export class PlanterComponent extends ChildComponent implements OnInit, OnDestroy, AfterViewInit {
  plants: UserPlant[] = [];
  selectedPlant: UserPlant | null = null;
  photos: PlantPhoto[] = [];
  loading = false;
  @Input() inputtedParentRef?: AppComponent;
  @Input() showTitleBar = true;
  @Output() hasData = new EventEmitter<boolean>();
  isMenuPanelOpen = false;

  newPlantName = '';
  newPlantSpecies = '';
  newPlantLocation = '';

  editName = '';
  editSpecies = '';
  editNotes = '';
  editLocation = '';

  analysisResult = '';
  analysisType = '';
  isAnalyzing = false;

  chatInput = '';
  chatMessages: { role: string; text: string }[] = [];
  isChatting = false;

  selectedPhotoForAnalysis: PlantPhoto | null = null;
  uploadingProgress = 0;

  constructor(private planterService: PlanterService, private fileService: FileService) { super(); }

  async ngOnInit() {
    if (this.inputtedParentRef) { this.parentRef = this.inputtedParentRef; }
    await this.loadPlants();
  }
  ngAfterViewInit() { }
  ngOnDestroy(): void {
    this.remove_me("PlanterComponent");
  }
  safeDestroy() { this.ngOnDestroy(); }

  async loadPlants() {
    if (!this.parentRef?.user?.id) return;
    this.loading = true;
    try {
      this.plants = await this.planterService.getPlants(this.parentRef.user.id);
      this.hasData.emit(this.plants.length > 0);
    } catch (e) {
      console.error('Failed to load plants', e);
      this.plants = [];
    } finally {
      this.loading = false;
    }
  }

  async addPlant() {
    if (!this.parentRef?.user?.id || !this.newPlantName.trim()) return;
    const plantId = await this.planterService.addPlant(
      this.parentRef.user.id,
      this.newPlantName.trim(),
      this.newPlantSpecies.trim() || undefined,
      undefined,
      this.newPlantLocation.trim() || undefined
    );
    if (plantId) {
      this.newPlantName = '';
      this.newPlantSpecies = '';
      this.newPlantLocation = '';
      await this.loadPlants();
    }
  }

  async selectPlant(plant: UserPlant) {
    this.selectedPlant = plant;
    this.editName = plant.name;
    this.editSpecies = plant.species || '';
    this.editNotes = plant.notes || '';
    this.editLocation = plant.location || '';
    this.analysisResult = '';
    this.analysisType = '';
    this.chatMessages = [];
    this.chatInput = '';
    this.selectedPhotoForAnalysis = null;
    await this.loadPhotos();
  }

  backToList() {
    this.selectedPlant = null;
    this.photos = [];
    this.analysisResult = '';
    this.chatMessages = [];
  }

  async savePlantDetails() {
    if (!this.selectedPlant) return;
    const success = await this.planterService.updatePlant(this.selectedPlant.id, {
      name: this.editName,
      species: this.editSpecies || undefined,
      notes: this.editNotes || undefined,
      location: this.editLocation || undefined,
    });
    if (success) {
      this.selectedPlant.name = this.editName;
      this.selectedPlant.species = this.editSpecies;
      this.selectedPlant.notes = this.editNotes;
      this.selectedPlant.location = this.editLocation;
      this.parentRef?.showNotification('Plant details saved.');
      await this.loadPlants();
    }
  }

  async deletePlant() {
    if (!this.selectedPlant || !this.parentRef?.user?.id) return;
    if (!confirm(`Delete ${this.selectedPlant.name}? This will remove all photos.`)) return;
    const success = await this.planterService.deletePlant(this.selectedPlant.id, this.parentRef.user.id);
    if (success) {
      this.parentRef?.showNotification('Plant deleted.');
      this.backToList();
      await this.loadPlants();
    }
  }

  async waterPlant() {
    if (!this.selectedPlant) return;
    const now = new Date();
    const success = await this.planterService.updatePlant(this.selectedPlant.id, { lastWatered: now });
    if (success) {
      this.selectedPlant.lastWatered = now;
      this.parentRef?.showNotification(`${this.selectedPlant.name} has been watered!`);
    }
  }

  async loadPhotos() {
    if (!this.selectedPlant) return;
    this.photos = await this.planterService.getPhotos(this.selectedPlant.id);
  }

  onFileSelected(event: any) {
    const file = event.target.files?.[0];
    if (!file || !this.selectedPlant || !this.parentRef?.user?.id) return;
    this.uploadPhoto(file);
  }

  uploadPhoto(file: File) {
    if (!this.selectedPlant || !this.parentRef?.user?.id) return;
    const maxPhotos = 10;
    if (this.photos.length >= maxPhotos) {
      this.parentRef?.showNotification(`Maximum ${maxPhotos} photos per plant. Delete one first.`);
      return;
    }

    this.uploadingProgress = 0;
    this.planterService.uploadPhoto(this.selectedPlant.id, this.parentRef.user.id, file)
      .subscribe({
        next: (event: any) => {
          if (event.type === 1 && event.total) {
            this.uploadingProgress = Math.round(100 * event.loaded / event.total);
          } else if (event.type === 4) {
            this.uploadingProgress = 0;
            this.loadPhotos();
          }
        },
        error: (err) => {
          console.error('Upload failed:', err);
          this.uploadingProgress = 0;
          this.parentRef?.showNotification('Photo upload failed.');
        }
      });
  }

  async deletePhoto(photo: PlantPhoto) {
    if (!this.parentRef?.user?.id) return;
    if (!confirm('Delete this photo?')) return;
    const success = await this.planterService.deletePhoto(photo.id, this.parentRef.user.id);
    if (success) {
      this.photos = this.photos.filter(p => p.id !== photo.id);
      this.parentRef?.showNotification('Photo deleted.');
    }
  }

  getPhotoSrc(photo: PlantPhoto): string {
    if (!this.parentRef) return '';
    this.parentRef.getSessionToken().then(token => {
      this.fileService.getFileSrcByFileId(photo.fileId, token).then(src => {
        const img = document.getElementById(`plant-photo-${photo.id}`) as HTMLImageElement;
        if (img) img.src = src;
      });
    });
    return '';
  }

  async analyzePlant(photo: PlantPhoto, type: string) {
    if (!this.parentRef?.user?.id || !this.selectedPlant) return;
    this.isAnalyzing = true;
    this.analysisResult = '';
    this.analysisType = type;
    this.selectedPhotoForAnalysis = photo;

    const typeLabels: { [key: string]: string } = {
      'general': 'General Plant Analysis',
      'health': 'Health Analysis',
      'recommendations': 'Recommendations'
    };
    this.analysisType = typeLabels[type] || type;

    const result = await this.planterService.analyzePlant(
      this.parentRef.user.id,
      this.selectedPlant.id,
      photo.fileId,
      type
    );
    if (result) {
      this.analysisResult = this.parseMessage(result);
    } else {
      this.analysisResult = 'Analysis failed. Please try again.';
    }
    this.isAnalyzing = false;
  }

  async sendChat() {
    if (!this.chatInput.trim() || !this.parentRef?.user?.id || !this.selectedPlant) return;
    const message = this.chatInput.trim();
    this.chatInput = '';
    this.chatMessages.push({ role: 'user', text: message });
    this.isChatting = true;

    const photoFileId = this.selectedPhotoForAnalysis?.fileId;
    const result = await this.planterService.chatAboutPlant(
      this.parentRef.user.id,
      this.selectedPlant.id,
      message,
      photoFileId
    );
    if (result) {
      this.chatMessages.push({ role: 'ai', text: this.parseMessage(result) });
    } else {
      this.chatMessages.push({ role: 'ai', text: 'Sorry, I could not respond right now.' });
    }
    this.isChatting = false;
  }

  parseMessage(message: string): string {
    if (!message) return '';
    return message
      .replace(/```(\w+)?\n?([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
      .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
      .replace(/__(.*?)__/g, '<b>$1</b>')
      .replace(/\*(.*?)\*/g, '<i>$1</i>')
      .replace(/_(.*?)_/g, '<i>$1</i>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/^## (.*$)/gim, '<h3>$1</h3>')
      .replace(/^### (.*$)/gim, '<h4>$1</h4>')
      .replace(/^\s*[-*] (.*$)/gim, '<li>$1</li>')
      .replace(/(<li>.*<\/li>)/gims, '<ul>$1</ul>')
      .replace(/\n/g, '<br>');
  }

  showMenuPanel() { this.isMenuPanelOpen = true; this.parentRef?.showOverlay(); }
  closeMenuPanel() { this.isMenuPanelOpen = false; this.parentRef?.closeOverlay(); }
}
