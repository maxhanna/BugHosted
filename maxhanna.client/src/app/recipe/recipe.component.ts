import { Component, Input, OnInit, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { MediaSelectorComponent } from '../media-selector/media-selector.component';
import { FileEntry } from '../../services/datacontracts/file/file-entry';
import { FileService } from '../../services/file.service';
import { RecipePayload, RecipeService, Recipe } from '../../services/recipe.service';

@Component({
  selector: 'app-recipe',
  templateUrl: './recipe.component.html',
  styleUrls: ['./recipe.component.css'],
  standalone: false
})
export class RecipeComponent extends ChildComponent implements OnInit {
  @Input() parentComponent: any;
  @ViewChild('mediaSelector') mediaSelector?: MediaSelectorComponent;

  recipes: Recipe[] = [];
  filteredRecipes: Recipe[] = [];
  searchTerm = '';
  isCreating = false;
  override isLoading = false;
  selectedFiles: FileEntry[] = [];

  form: RecipePayload = {
    name: '',
    description: '',
    ingredients: [''],
    instructions: [''],
    tags: [],
    imageFileIds: [],
    externalLinks: []
  };

  constructor(private recipeService: RecipeService, private fileService: FileService) {
    super();
  }

  ngOnInit(): void {
    this.loadRecipes();
  }

  loadRecipes(): void {
    this.isLoading = true;
    this.recipeService.getRecipes(this.searchTerm || undefined).subscribe({
      next: (recipes) => {
        this.recipes = recipes;
        this.applyFilters();
        this.isLoading = false;
      },
      error: () => {
        this.isLoading = false;
      }
    });
  }

  applyFilters(): void {
    const search = this.searchTerm.trim().toLowerCase();
    if (!search) {
      this.filteredRecipes = [...this.recipes];
      return;
    }

    this.filteredRecipes = this.recipes.filter(recipe => {
      const haystack = [
        recipe.name,
        recipe.description,
        recipe.ingredients.join(' '),
        recipe.instructions.join(' '),
        recipe.tags.join(' ')
      ].join(' ').toLowerCase();
      return haystack.includes(search);
    });
  }

  openCreateForm(): void {
    this.isCreating = true;
    this.form = {
      name: '',
      description: '',
      ingredients: [''],
      instructions: [''],
      tags: [],
      imageFileIds: [],
      externalLinks: []
    };
    this.selectedFiles = [];
  }

  cancelCreate(): void {
    this.isCreating = false;
    this.form = {
      name: '',
      description: '',
      ingredients: [''],
      instructions: [''],
      tags: [],
      imageFileIds: [],
      externalLinks: []
    };
    this.selectedFiles = [];
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

  addTag(): void {
    this.form.tags.push('');
  }

  removeTag(index: number): void {
    this.form.tags.splice(index, 1);
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
      ingredients: this.form.ingredients.map(value => value.trim()).filter(Boolean),
      instructions: this.form.instructions.map(value => value.trim()).filter(Boolean),
      tags: this.form.tags.map(value => value.trim()).filter(Boolean),
      imageFileIds: this.form.imageFileIds,
      externalLinks: this.form.externalLinks.map(value => value.trim()).filter(Boolean)
    };

    this.isLoading = true;
    this.recipeService.createRecipe(payload).subscribe({
      next: () => {
        this.isLoading = false;
        this.isCreating = false;
        this.loadRecipes();
        this.cancelCreate();
      },
      error: () => {
        this.isLoading = false;
        alert('Could not save the recipe right now.');
      }
    });
  }

  getImageUrl(fileId?: number): string {
    if (!fileId) {
      return 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=900&q=80';
    }

    return `/file/getfilebyid/${fileId}`;
  }

  trackByRecipeId(index: number, recipe: Recipe): number {
    return recipe.id ?? index;
  }
}