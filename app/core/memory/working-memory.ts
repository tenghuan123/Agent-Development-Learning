import type { WorkingMemory } from "./types";

export class WorkingMemoryManager {
  private state: WorkingMemory;

  constructor(initialState?: Partial<WorkingMemory>) {
    this.state = {
      hypotheses: initialState?.hypotheses || [],
      facts: initialState?.facts || [],
      currentFocus: initialState?.currentFocus || "",
      notes: initialState?.notes || [],
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Get current working memory snapshot
   */
  public getState(): WorkingMemory {
    return {
      hypotheses: [...this.state.hypotheses],
      facts: [...this.state.facts],
      currentFocus: this.state.currentFocus,
      notes: [...this.state.notes],
      updatedAt: this.state.updatedAt,
    };
  }

  /**
   * Set or restore entire state
   */
  public setState(newState: Partial<WorkingMemory>): void {
    this.state = {
      hypotheses: newState.hypotheses ? [...newState.hypotheses] : this.state.hypotheses,
      facts: newState.facts ? [...newState.facts] : this.state.facts,
      currentFocus: newState.currentFocus !== undefined ? newState.currentFocus : this.state.currentFocus,
      notes: newState.notes ? [...newState.notes] : this.state.notes,
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Update the active mini-focus
   */
  public setFocus(focus: string): void {
    this.state.currentFocus = focus.trim();
    this.state.updatedAt = new Date().toISOString();
  }

  /**
   * Add a working hypothesis
   */
  public addHypothesis(hypothesis: string): void {
    const trimmed = hypothesis.trim();
    if (trimmed && !this.state.hypotheses.includes(trimmed)) {
      this.state.hypotheses.push(trimmed);
      this.state.updatedAt = new Date().toISOString();
    }
  }

  /**
   * Resolve / Remove a hypothesis (e.g. when confirmed or disproved)
   */
  public resolveHypothesis(hypothesis: string, confirmedAsFact?: string): void {
    this.state.hypotheses = this.state.hypotheses.filter((h) => h !== hypothesis.trim());
    if (confirmedAsFact && confirmedAsFact.trim()) {
      this.addFact(confirmedAsFact);
    }
    this.state.updatedAt = new Date().toISOString();
  }

  /**
   * Add a verified fact discovered during execution
   */
  public addFact(fact: string): void {
    const trimmed = fact.trim();
    if (trimmed && !this.state.facts.includes(trimmed)) {
      this.state.facts.push(trimmed);
      this.state.updatedAt = new Date().toISOString();
    }
  }

  /**
   * Add a freeform note to scratchpad
   */
  public addNote(note: string): void {
    const trimmed = note.trim();
    if (trimmed) {
      this.state.notes.push(trimmed);
      // Keep notes bounded to latest 10
      if (this.state.notes.length > 10) {
        this.state.notes = this.state.notes.slice(-10);
      }
      this.state.updatedAt = new Date().toISOString();
    }
  }

  /**
   * Clear all working memory
   */
  public clear(): void {
    this.state = {
      hypotheses: [],
      facts: [],
      currentFocus: "",
      notes: [],
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Render working memory into a prompt section
   */
  public formatForPrompt(): string {
    const { currentFocus, hypotheses, facts, notes } = this.state;
    const hasContent = currentFocus || hypotheses.length > 0 || facts.length > 0 || notes.length > 0;
    if (!hasContent) return "";

    let text = `=== 📝 L1 WORKING MEMORY & SCRATCHPAD (Immediate Task State) ===\n`;

    if (currentFocus) {
      text += `🎯 **Current Mini-Focus**: ${currentFocus}\n`;
    }

    if (hypotheses.length > 0) {
      text += `🔬 **Active Hypotheses**:\n`;
      hypotheses.forEach((h, i) => {
        text += `   ${i + 1}. [?] ${h}\n`;
      });
    }

    if (facts.length > 0) {
      text += `✅ **Verified Facts**:\n`;
      facts.forEach((f, i) => {
        text += `   ${i + 1}. [✓] ${f}\n`;
      });
    }

    if (notes.length > 0) {
      text += `📌 **Scratchpad Notes**:\n`;
      notes.forEach((n) => {
        text += `   • ${n}\n`;
      });
    }

    text += `=================================================================\n`;
    return text;
  }
}

