import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WordlerService } from '../../services/wordler.service';
import { TimeSincePipe } from '../time-since.pipe';
import { WordlerScore } from '../../services/datacontracts/wordler/wordler-score';

type Mode = 'all' | 'user' | 'today' | 'best';

@Component({
    selector: 'app-wordler-high-scores',
    templateUrl: './wordler-high-scores.component.html',
    styleUrls: ['./wordler-high-scores.component.css'],
    standalone: false,
})
export class WordlerHighScoresComponent implements OnInit, OnChanges {
    @Output() hasData = new EventEmitter<boolean>();
    // helper to get object keys from the template without exposing globals
    keys(obj?: Record<string, any>): string[] {
        return Object.keys(obj || {});
    }
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
    @Input() headersCollapsed: boolean = false;
    @Input() inputtedParentRef?: any;

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
        today: {},
        best: {}
    };

    constructor(private wordlerService: WordlerService) { }

    // UI state: collapsed/expanded per mode and per group
    collapsedModes: Record<string, boolean> = {};
    collapsedGroups: Record<string, boolean> = {};

    toggleMode(mode: Mode) {
    if (this.showUserHeader) return; // when showing user header, do not toggle
    this.collapsedModes[mode] = !this.collapsedModes[mode];
    }

    isModeCollapsed(mode: Mode) {
    if (this.showUserHeader) return false; // never collapsed when showUserHeader is active
    return !!this.collapsedModes[mode];
    }

    toggleGroup(mode: Mode, groupKey: string) {
        const k = `${mode}-${groupKey}`;
        this.collapsedGroups[k] = !this.collapsedGroups[k];
    }

    isGroupCollapsed(mode: Mode, groupKey: string) {
        return !!this.collapsedGroups[`${mode}-${groupKey}`];
    }

    ngOnInit(): void {
        // apply initial collapsed state (before data loads) so UI renders collapsed if requested
        this.applyHeadersCollapsed();
        this.refresh();
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['userId'] || changes['mode']) {
            this.refresh();
        }
        // if headersCollapsed or mode changed, ensure collapsed state follows the input
        if (changes['headersCollapsed'] || changes['mode']) {
            this.applyHeadersCollapsed();
        }
    }

    async refresh() {
        this.loading = true;
        this.error = undefined;
        try {
            const modes = this.modesSelected;
            // If the caller requested only the 'today' mode, don't include the 'user' scores section.
            const includeUserMode = modes.includes('user') && !(modes.length === 1 && modes[0] === 'today');

            // We'll fetch `all` once if needed, and `user` separately (if userId provided)
            let allScores: WordlerScore[] | undefined = undefined;

            if (modes.includes('all') || modes.includes('today')) {
                const res = await this.wordlerService.getAllScores();
                console.debug('wordler-high-scores: getAllScores() result:', res);
                if (Array.isArray(res)) {
                    allScores = res as WordlerScore[];
                    console.debug(`wordler-high-scores: allScores.length=${allScores.length}`);
                } else {
                    console.error('getAllScores returned unexpected result:', res);
                    allScores = [];
                }
            }

            if (modes.includes('all')) {
                this.groupedByMode.all = this.groupScores(allScores || []);
            }

            // Compute a 'best' section: top scores across all difficulties (single bucket)
            if (modes.includes('best') || modes.includes('all')) {
                const topAcrossAll = (allScores || []).slice().sort((a, b) => (b.score - a.score) || (a.time - b.time)).slice(0, 10);
                // store under a special key so template can render it; 999 maps to 'Best' label below
                this.groupedByMode.best = { 999: topAcrossAll };
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

            if (includeUserMode) {
                if (!this.userId) {
                    this.groupedByMode.user = {};
                } else {
                    const userRes = await this.wordlerService.getAllScores(this.userId);
                    console.debug('wordler-high-scores: getAllScores(user) result:', userRes);
                    if (Array.isArray(userRes)) {
                        const userScores = userRes as WordlerScore[];
                        console.debug(`wordler-high-scores: userScores.length=${userScores.length}`);
                        this.groupedByMode.user = this.groupScores(userScores || []);
                    } else {
                        console.error('getAllScores(userId) returned unexpected result:', userRes);
                        this.groupedByMode.user = {};
                    }
                }
            }

        } catch (e: any) {
            this.error = e?.message ?? String(e);
        } finally {
            this.loading = false;
            // If headersCollapsed requested, collapse group-level entries as well after data loads
            if (this.headersCollapsed) {
                for (const m of this.modesSelected) {
                    this.collapsedModes[m] = true;
                    const groups = this.groupedByMode[m] || {};
                    for (const g of Object.keys(groups)) {
                        this.collapsedGroups[`${m}-${g}`] = true;
                    }
                }
            }
            // emit whether any mode has groups/data
            try {
                const any = Object.values(this.groupedByMode || {}).some(m => Object.keys(m || {}).length > 0);
                this.hasData.emit(any);
            } catch {}
        }
    }

    private applyHeadersCollapsed() {
        if (this.headersCollapsed) {
            for (const m of this.modesSelected) {
                this.collapsedModes[m] = true;
            }
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
        const requested = Array.isArray(this.mode) ? this.mode.slice() : [this.mode];
        const expanded: Mode[] = [];
        for (const m of requested) {
            if (m === 'all' || m === 'best') {
                // 'all' and 'best' are shorthands: show all-time, today's, and the user's top scores
                expanded.push('all', 'today', 'user');
            } else {
                expanded.push(m);
            }
        }
        // remove duplicates while preserving order
        return Array.from(new Set(expanded));
    }

    openWordler() {
        // prefer inputtedParentRef if provided
        const pr = this.inputtedParentRef;
        pr?.createComponent('Wordler');
    }
}
