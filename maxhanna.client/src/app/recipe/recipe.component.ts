import { Component, Input, OnInit, ViewChild } from '@angular/core';
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
  @ViewChild('mediaSelector') mediaSelector?: MediaSelectorComponent;
  recipes: Recipe[] = [];
  filteredRecipes: Recipe[] = [];
  expandedRecipes = new Map<number, boolean>();
  searchTerm = '';
  isCreating = false;
  editingRecipeId: number | null = null;
  viewingRecipeId: number | null = null;
  override isLoading = false;
  selectedFiles: FileEntry[] = [];
  selectedTopics: Topic[] = [];

  form: RecipePayload = {
    userId: 0,
    name: '',
    description: '',
    createdBy: '',
    ingredients: [''],
    instructions: [''],
    tags: [],
    imageFileIds: [],
    externalLinks: []
  };

  constructor(private recipeService: RecipeService, private userEventService: UserEventService, private sanitizer: DomSanitizer) {
    super();
  }

  async ngOnInit() {
    await this.loadRecipes();
    this.recipes.forEach(recipe => {
      if (!this.expandedRecipes.has(recipe.id)) {
        this.expandedRecipes.set(recipe.id, false);
      } else {
        const currentStatus = this.expandedRecipes.get(recipe.id) ?? false;
        this.expandedRecipes.set(recipe.id, currentStatus);
      }
    });
    if (this.recipeId) {
      this.viewingRecipeId = this.recipeId;
      const target = this.recipes.find(r => r.id === this.recipeId);
      if (target) {
        this.expandedRecipes.set(target.id, true);
      }
      this.applyFilters();
    }
  }

  async loadRecipes(): Promise<void> {
    this.startLoading();
    try {
      this.recipes = await firstValueFrom(this.recipeService.getRecipes(this.searchTerm || undefined));
      this.applyFilters();
    } catch { }
    this.stopLoading();
  }

  applyFilters(): void {
    if (this.viewingRecipeId) {
      this.filteredRecipes = this.recipes.filter(r => r.id === this.viewingRecipeId);
      return;
    }
    const search = this.searchTerm.trim().toLowerCase();
    if (!search) {
      this.filteredRecipes = [...this.recipes];
      return;
    }

    this.filteredRecipes = this.recipes.filter(recipe => {
      const haystack = [
        recipe.id.toString(),
        recipe.name,
        recipe.description,
        recipe.ingredients.join(' '),
        recipe.instructions.join(' '),
        recipe.tags.join(' ')
      ].join(' ').toLowerCase();
      return haystack.includes(search);
    });
  }

  clearViewingRecipeId(): void {
    this.viewingRecipeId = null;
    this.searchTerm = '';
    this.applyFilters();
  }

  openCreateForm(): void {
    this.isCreating = true;
    this.editingRecipeId = null;
    this.form = {
      userId: 0,
      name: '',
      description: '',
      createdBy: '',
      ingredients: [''],
      instructions: [''],
      tags: [],
      imageFileIds: [],
      externalLinks: []
    };
    this.selectedFiles = [];
    this.selectedTopics = [];
  }

  cancelCreate(): void {
    this.isCreating = false;
    this.editingRecipeId = null;
    this.form = {
      userId: 0,
      name: '',
      description: '',
      createdBy: '',
      ingredients: [''],
      instructions: [''],
      tags: [],
      imageFileIds: [],
      externalLinks: []
    };
    this.selectedFiles = [];
    this.selectedTopics = [];
    this.parentRef?.closeOverlay();
  }

  canEdit(recipe: Recipe): boolean {
    return !!this.parentRef?.user?.id && recipe.userId === this.parentRef.user.id;
  }

  editRecipe(recipe: Recipe): void {
    this.isCreating = true;
    this.editingRecipeId = recipe.id;
    this.form = {
      userId: recipe.userId,
      name: recipe.name,
      description: recipe.description,
      createdBy: recipe.createdBy,
      ingredients: [...recipe.ingredients],
      instructions: [...recipe.instructions],
      tags: [...recipe.tags],
      imageFileIds: [...(recipe.imageFileIds || [])],
      externalLinks: [...(recipe.externalLinks || [])]
    };
    this.selectedFiles = [];
    this.selectedTopics = (recipe.tags || []).map((t, i) => new Topic(i, t));
  }

  hasEmptyIngredient(): boolean {
    return this.form.ingredients.some(i => !i.trim());
  }

  hasEmptyInstruction(): boolean {
    return this.form.instructions.some(i => !i.trim());
  }

  addIngredient(): void {
    this.form.ingredients.push('');
    setTimeout(() => this.scrollToNewInput('ingredient', this.form.ingredients.length - 1), 0);
  }

  removeIngredient(index: number): void {
    this.form.ingredients.splice(index, 1);
  }

  addInstruction(): void {
    this.form.instructions.push('');
    setTimeout(() => this.scrollToNewInput('instruction', this.form.instructions.length - 1), 0);
  }

  scrollToNewInput(type: 'ingredient' | 'instruction', index: number) {
    setTimeout(() => {
      document.getElementById(type + index)?.scrollIntoView();
    }, 50);
  }

  removeInstruction(index: number): void {
    this.form.instructions.splice(index, 1);
  }

  onTopicsChanged(topics: Topic[]): void {
    this.selectedTopics = topics;
    this.form.tags = topics.map(t => t.topicText);
  }

  addLink(): void {
    this.form.externalLinks.push('');
  }

  removeLink(index: number): void {
    this.form.externalLinks.splice(index, 1);
  }

  visitLink(url: string): void {
    this.parentRef?.visitExternalLink(url);
  }

  onMediaSelection(files: FileEntry[]): void {
    this.selectedFiles = files;
    this.form.imageFileIds = files.map(file => file.id).filter(Boolean);
  }

  submitRecipe(): void {
    if (!this.form.name.trim()) {
      return alert('Please give your recipe a name.');
    }

    const payload: RecipePayload = {
      ...this.form,
      userId: this.parentRef?.user?.id || 0,
      ingredients: this.form.ingredients.map(value => value.trim()).filter(Boolean),
      instructions: this.form.instructions.map(value => value.trim()).filter(Boolean),
      tags: this.selectedTopics.map(t => t.topicText).filter(Boolean),
      imageFileIds: this.form.imageFileIds,
      externalLinks: this.form.externalLinks.map(value => value.trim()).filter(Boolean),
      createdBy: this.parentRef?.user?.username ?? "Anonymous"
    };

    this.isLoading = true;
    const request$ = this.editingRecipeId
      ? this.recipeService.updateRecipe(this.editingRecipeId, payload)
      : this.recipeService.createRecipe(payload);

    const msg = `${this.editingRecipeId ? 'Edited' : 'Added'} a recipe!`;
    this.userEventService.insertUserEvent(
      this.parentRef?.user?.id ?? 0, 
      this.editingRecipeId ? 'recipe_edited' : 'recipe_added', 
      msg, 
      this.editingRecipeId??undefined, 
      'recipe'
    );
    request$.subscribe({
      next: () => {
        this.isLoading = false;
        this.isCreating = false;
        this.editingRecipeId = null;
        this.loadRecipes();
        this.cancelCreate();
      },
      error: () => {
        this.isLoading = false;
        alert('Could not save the recipe right now.');
      }
    });
  }

  getUserRating(recipe: Recipe): Rating {
    const uid = this.parentRef?.user?.id ?? 0;
    return {
      value: 0,
      user: uid > 0 ? new User(uid, this.parentRef?.user?.username ?? '') : undefined
    };
  }

  isRecipeVideoShort(url?: string): boolean { 
    if (!url) { return false; }
    return this.parentRef?.isYoutubeShortUrl(url) ?? false;
  }

  isVideoOnlyRecipe(recipe?: Recipe): boolean {
    if (!recipe) { return false; }
    return !recipe.description?.trim()
      && (!recipe.ingredients?.length || recipe.ingredients.every(i => !i.trim()))
      && (!recipe.instructions?.length || recipe.instructions.every(i => !i.trim()))
      && !recipe.imageFileIds?.length
      && !!this.getFirstYouTubeId(recipe);
  }

  getFirstYoutubeUrlForRecipe(recipe?: Recipe) : string | undefined { 
    if (!recipe) return;
    for (const link of recipe.externalLinks) {
      if (this.parentRef?.isYoutubeUrl(link)) {
        return link;
      }
    }
    return;
  }

  getFirstYouTubeId(recipe: Recipe): string | null {
    for (const link of recipe.externalLinks) {
      if (this.parentRef?.isYoutubeUrl(link)) {
        return this.parentRef?.getYouTubeVideoId(link) || null;
      }
    }
    return null;
  }

  private youTubeUrlCache = new Map<number, SafeResourceUrl>();

  getYouTubeUrl(recipe: Recipe): SafeResourceUrl | null {
    const cached = this.youTubeUrlCache.get(recipe.id);
    if (cached) return cached;
    const id = this.getFirstYouTubeId(recipe);
    if (!id) return null;
    const url = this.sanitizer.bypassSecurityTrustResourceUrl(
      `https://www.youtube.com/embed/${id}?autoplay=1&mute=1`
    );
    this.youTubeUrlCache.set(recipe.id, url);
    return url;
  }

  trackByRecipeId(index: number, recipe: Recipe): number {
    return recipe.id ?? index;
  }

  trackByIndex(index: number): number {
    return index;
  }

  toggleRecipeDetails(recipeId: number): void {
    const isExpanded = this.expandedRecipes.get(recipeId);
    if (!isExpanded) {
      this.parentRef?.showOverlay();
    }
    this.expandedRecipes.set(recipeId, !isExpanded);
  }
}