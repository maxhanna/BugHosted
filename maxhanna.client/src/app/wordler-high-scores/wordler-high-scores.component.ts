import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { WordlerService } from '../../services/wordler.service';
import { WordlerScore } from '../../services/datacontracts/wordler/wordler-score';

type Mode = 'all' | 'user' | 'today';

@Component({
    selector: 'app-wordler-high-scores',
    templateUrl: './wordler-high-scores.component.html',
    styleUrls: ['./wordler-high-scores.component.css'],
    standalone: true,
})
export class WordlerHighScoresComponent implements OnInit, OnChanges {
    // If provided, component will show top scores for this user when mode === 'user'
    @Input() userId?: number;
    // Accept a single mode or an array of modes. Pass e.g. ['all','user','today'] to show all three sections.
    @Input() mode: Mode | Mode[] = 'all';

    // Header controls: component renders its own header by default.
    @Input() showHeader: boolean = true;
    @Input() headerTitle: string | null = null; // if null, component computes a default title
    @Input() headerClickable: boolean = false; // whether header should be clickable
    @Input() headerClickTarget: string | null = null; // payload emitted when header clicked
    @Output() headerClick = new EventEmitter<string | null>();
    @Input() showUserHeader: boolean = false;
    @Input() showHeaderTitles: boolean = true;

    // not used for multi-mode output; per-mode mappings are stored in groupedByMode
    scores: WordlerScore[] = [];
    loading = false;
    error?: string;

    // grouped by difficulty
    grouped: Record<number, WordlerScore[]> = {};

    // grouped results for each mode requested
    groupedByMode: Record<Mode, Record<number, WordlerScore[]>> = {
        all: {},
        user: {},
        today: {}
    };

    constructor(private wordlerService: WordlerService) { }

    ngOnInit(): void {
        this.refresh();
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['userId'] || changes['mode']) {
            this.refresh();
        }
    }

    async refresh() {
        this.loading = true;
        this.error = undefined;
        try {
            const modes = this.modesSelected;

            // We'll fetch `all` once if needed, and `user` separately (if userId provided)
            let allScores: WordlerScore[] | undefined = undefined;

            if (modes.includes('all') || modes.includes('today')) {
                allScores = await this.wordlerService.getAllScores() as WordlerScore[];
            }

            if (modes.includes('all')) {
                this.groupedByMode.all = this.groupScores(allScores || []);
            }

            if (modes.includes('today')) {
                const today = new Date();
                const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
                const end = start + 24 * 60 * 60 * 1000;
                const todays = (allScores || []).filter(s => {
                    if (!s.submitted) return false;
                    const t = new Date(s.submitted).getTime();
                    return t >= start && t < end;
                });
                this.groupedByMode.today = this.groupScores(todays);
            }

            if (modes.includes('user')) {
                if (!this.userId) {
                    this.groupedByMode.user = {};
                } else {
                    const userScores = await this.wordlerService.getAllScores(this.userId) as WordlerScore[];
                    this.groupedByMode.user = this.groupScores(userScores || []);
                }
            }

        } catch (e: any) {
            this.error = e?.message ?? String(e);
        } finally {
            this.loading = false;
        }
    }

    private groupScores(scores: WordlerScore[]) {
        const out: Record<number, WordlerScore[]> = {};
        (scores || []).forEach(s => {
            const d = s.difficulty ?? 0;
            if (!out[d]) out[d] = [];
            out[d].push(s);
        });
        Object.keys(out).forEach(k => {
            out[+k] = out[+k].sort((a, b) => (b.score - a.score) || (a.time - b.time)).slice(0, 10);
        });
        return out;
    }

    difficultyLabel(d: number) {
        switch (d) {
            case 4: return 'Easy';
            case 5: return 'Medium';
            case 6: return 'Hard';
            case 7: return 'Master';
            default: return `Difficulty ${d}`;
        }
    }

    // keyvalue pipe comparator to keep difficulties in descending order (Master -> Easy)
    keepOrder = (a: { key: string, value: any }, b: { key: string, value: any }) => {
        return parseInt(b.key) - parseInt(a.key);
    }

    get modesSelected(): Mode[] {
        return Array.isArray(this.mode) ? this.mode : [this.mode];
    }
}
