import { Component, Input, OnInit, ViewChild } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ChildComponent } from '../child.component';
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

  constructor(private recipeService: RecipeService, private userEventService: UserEventService) {
    super();
  }

  async ngOnInit() {
    await this.loadRecipes();
    this.recipes.forEach(recipe => {
      if(!this.expandedRecipes.has(recipe.id)) {
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

  addIngredient(): void {
    this.form.ingredients.push('');
  }

  removeIngredient(index: number): void {
    this.form.ingredients.splice(index, 1);
  }

  addInstruction(): void {
    this.form.instructions.push('');
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
    this.userEventService.insertUserEvent(this.parentRef?.user?.id ?? 0, this.editingRecipeId ? 'recipe_edited' : 'recipe_added', msg);
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
 
  trackByRecipeId(index: number, recipe: Recipe): number {
    return recipe.id ?? index;
  }

  trackByIndex(index: number): number {
    return index;
  }

  toggleRecipeDetails(recipeId: number): void {
      const isExpanded = this.expandedRecipes.get(recipeId);
      this.expandedRecipes.set(recipeId, !isExpanded);
      if (!isExpanded) {
        const recipe = this.recipes.find(r => r.id === recipeId);
        if (recipe?.externalLinks?.length) {
          for (const link of recipe.externalLinks) {
            if (this.parentRef?.isYoutubeUrl(link)) {
              const id = this.parentRef?.getYouTubeVideoId(link);
              if (id) {
                setTimeout(() => {
                  const el = document.getElementById('recipeYtIframe' + recipeId) as HTMLIFrameElement | null;
                  if (el) el.src = `https://www.youtube.com/embed/${id}?autoplay=1`;
                });
                return;
              }
            }
          }
        }
      }
  }
}