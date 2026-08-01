import { Component, HostListener, Input, OnInit, ViewChild } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { firstValueFrom } from 'rxjs';
import { ChildComponent } from '../child.component';
import { User } from '../../services/datacontracts/user/user';
import { Rating } from '../../services/ratings.service';
import { MediaSelectorComponent } from '../media-selector/media-selector.component';
import { FileEntry } from '../../services/datacontracts/file/file-entry';
import { RecipePayload, RecipeService, Recipe } from '../../services/recipe.service';
import { Topic } from '../../services/datacontracts/topics/topic';
import { UserEventService } from '../../services/user-event.service';

@Component({
  selector: 'app-recipe',
  templateUrl: './recipe.component.html',
  styleUrls: ['./recipe.component.css'],
  standalone: false
})
export class RecipeComponent extends ChildComponent implements OnInit {
  @Input() parentComponent: any;
  @Input() recipeId?: number;

  @HostListener('document:keydown', ['$event']) onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      if (this.editingRecipeId !== null) { this.cancelEdit(); return; }
      const ids = Array.from(this.expandedRecipes.entries()).filter(([_, v]) => v).map(([k]) => k);
      if (ids.length > 0) this.toggleRecipeDetails(ids[0]);
    }
  }

  @ViewChild('mediaSelector') mediaSelector?: MediaSelectorComponent;
  recipes: Recipe[] = [];
  filteredRecipes: Recipe[] = [];
  expandedRecipes = new Map<number, boolean>();
  searchTerm = '';
  editingRecipeId: number | null = null;
  viewingRecipeId: number | null = null;
  override isLoading = false;
  selectedFiles: FileEntry[] = [];
  selectedTopics: Topic[] = [];
  form: RecipePayload = this.makeBlankForm();
  private youTubeUrlCache = new Map<number, SafeResourceUrl>();

  constructor(
    private recipeService: RecipeService,
    private userEventService: UserEventService,
    private sanitizer: DomSanitizer
  ) { super(); }

  async ngOnInit() {
    await this.loadRecipes();
    this.recipes.forEach(r => { if (!this.expandedRecipes.has(r.id)) this.expandedRecipes.set(r.id, false); });
    if (this.recipeId) {
      this.viewingRecipeId = this.recipeId;
      const t = this.recipes.find(r => r.id === this.recipeId);
      if (t) { this.expandedRecipes.set(t.id, true); }
      this.applyFilters();
    }
  }

  private makeBlankForm(): RecipePayload {
    return { userId: 0, name: '', description: '', createdBy: '', ingredients: [''], instructions: [''], tags: [], imageFileIds: [], externalLinks: [] };
  }

  async loadRecipes(): Promise<void> {
    this.startLoading();
    try { this.recipes = await firstValueFrom(this.recipeService.getRecipes(this.searchTerm || undefined)); this.applyFilters(); }
    catch { }
    this.stopLoading();
  }

  applyFilters(): void {
    if (this.viewingRecipeId) { this.filteredRecipes = this.recipes.filter(r => r.id === this.viewingRecipeId); return; }
    const s = this.searchTerm.trim().toLowerCase();
    if (!s) { this.filteredRecipes = [...this.recipes]; return; }
    this.filteredRecipes = this.recipes.filter(r =>
      [r.id.toString(), r.name, r.description, r.ingredients.join(' '), r.instructions.join(' '), r.tags.join(' ')]
        .join(' ').toLowerCase().includes(s)
    );
  }

  clearViewingRecipeId(): void { this.viewingRecipeId = null; this.searchTerm = ''; this.applyFilters(); }

  openCreateForm(): void {
    this.editingRecipeId = 0;
    this.form = this.makeBlankForm();
    this.selectedFiles = [];
    this.selectedTopics = [];
  }

  cancelEdit(): void {
    const wasEditing = this.editingRecipeId;
    this.editingRecipeId = null;
    this.form = this.makeBlankForm();
    this.selectedFiles = [];
    this.selectedTopics = [];
    // Collapse the card that was being edited
    if (wasEditing && wasEditing > 0) {
      this.expandedRecipes.set(wasEditing, false);
    }
  }

  canEdit(r: Recipe): boolean { return !!this.parentRef?.user?.id && r.userId === this.parentRef.user.id; }

  editRecipe(r: Recipe): void {
    this.expandedRecipes.set(r.id, true);
    this.editingRecipeId = r.id;
    this.form = {
      userId: r.userId, name: r.name, description: r.description, createdBy: r.createdBy,
      ingredients: [...r.ingredients], instructions: [...r.instructions],
      tags: [...r.tags], imageFileIds: [...(r.imageFileIds || [])],
      externalLinks: [...(r.externalLinks || [])]
    };
    this.selectedFiles = [];
    this.selectedTopics = (r.tags || []).map((t, i) => new Topic(i, t));
  }

  hasEmptyIngredient(): boolean { return this.form.ingredients.some(i => !i.trim()); }
  hasEmptyInstruction(): boolean { return this.form.instructions.some(i => !i.trim()); }

  addIngredient(): void { this.form.ingredients.push(''); setTimeout(() => this.scrollTo('ingredient', this.form.ingredients.length - 1), 0); }
  removeIngredient(i: number): void { this.form.ingredients.splice(i, 1); }
  addInstruction(): void { this.form.instructions.push(''); setTimeout(() => this.scrollTo('instruction', this.form.instructions.length - 1), 0); }
  removeInstruction(i: number): void { this.form.instructions.splice(i, 1); }

  private scrollTo(type: string, i: number) {
    setTimeout(() => { document.getElementById(type + i)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 50);
  }

  onTopicsChanged(topics: Topic[]): void { this.selectedTopics = topics; this.form.tags = topics.map(t => t.topicText); }
  addLink(): void { this.form.externalLinks.push(''); }
  removeLink(i: number): void { this.form.externalLinks.splice(i, 1); }
  visitLink(url: string): void { this.parentRef?.visitExternalLink(url); }
  onMediaSelection(files: FileEntry[]): void { this.selectedFiles = files; this.form.imageFileIds = files.map(f => f.id).filter(Boolean); }

  submitRecipe(): void {
    if (!this.form.name.trim()) return alert('Please give your recipe a name.');
    const p: RecipePayload = {
      ...this.form,
      userId: this.parentRef?.user?.id || 0,
      ingredients: this.form.ingredients.map(v => v.trim()).filter(Boolean),
      instructions: this.form.instructions.map(v => v.trim()).filter(Boolean),
      tags: this.selectedTopics.map(t => t.topicText).filter(Boolean),
      imageFileIds: this.form.imageFileIds,
      externalLinks: this.form.externalLinks.map(v => v.trim()).filter(Boolean),
      createdBy: this.parentRef?.user?.username ?? 'Anonymous'
    };
    this.isLoading = true;
    const isUpdate = this.editingRecipeId !== null && this.editingRecipeId > 0;
    const req$ = isUpdate ? this.recipeService.updateRecipe(this.editingRecipeId!, p) : this.recipeService.createRecipe(p);
    this.userEventService.insertUserEvent(
      this.parentRef?.user?.id ?? 0, isUpdate ? 'recipe_edited' : 'recipe_added',
      `${isUpdate ? 'Edited' : 'Added'} a recipe!`, this.editingRecipeId ?? undefined, 'recipe'
    );
    req$.subscribe({
      next: () => {
        this.isLoading = false; this.editingRecipeId = null;
        this.loadRecipes(); this.form = this.makeBlankForm();
        this.selectedFiles = []; this.selectedTopics = [];
      },
      error: () => { this.isLoading = false; alert('Could not save the recipe right now.'); }
    });
  }

  getUserRating(r: Recipe): Rating {
    const uid = this.parentRef?.user?.id ?? 0;
    return { value: 0, user: uid > 0 ? new User(uid, this.parentRef?.user?.username ?? '') : undefined };
  }

  isRecipeVideoShort(url?: string): boolean { return url ? (this.parentRef?.isYoutubeShortUrl(url) ?? false) : false; }
  isVideoOnlyRecipe(r?: Recipe): boolean {
    if (!r) return false;
    return !r.description?.trim() && (!r.ingredients?.length || r.ingredients.every(i => !i.trim()))
      && (!r.instructions?.length || r.instructions.every(i => !i.trim()))
      && !r.imageFileIds?.length && !!this.getFirstYouTubeId(r);
  }
  getFirstYoutubeUrlForRecipe(r?: Recipe): string | undefined {
    if (!r) return;
    for (const l of r.externalLinks) if (this.parentRef?.isYoutubeUrl(l)) return l;
    return;
  }
  getFirstYouTubeId(r: Recipe): string | null {
    for (const l of r.externalLinks) if (this.parentRef?.isYoutubeUrl(l)) return this.parentRef?.getYouTubeVideoId(l) || null;
    return null;
  }
  getYouTubeUrl(r: Recipe): SafeResourceUrl | null {
    const c = this.youTubeUrlCache.get(r.id); if (c) return c;
    const id = this.getFirstYouTubeId(r); if (!id) return null;
    const url = this.sanitizer.bypassSecurityTrustResourceUrl(`https://www.youtube.com/embed/${id}?autoplay=1&mute=1`);
    this.youTubeUrlCache.set(r.id, url); return url;
  }
  trackByRecipeId(_: number, r: Recipe): number { return r.id ?? _; }
  trackByIndex(i: number): number { return i; }

  toggleRecipeDetails(recipeId: number): void {
    const expanded = !this.expandedRecipes.get(recipeId);
    this.expandedRecipes.set(recipeId, expanded);
    if (!expanded && this.editingRecipeId === recipeId) this.cancelEdit();
  }
}
