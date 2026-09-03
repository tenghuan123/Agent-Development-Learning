import * as fs from "fs";
import * as path from "path";
import type {
  SessionSnapshot,
  SessionState,
  SessionStep,
  SessionSummary,
} from "./types";
import type { ChatMessage } from "../llm/types";

export class SessionStore {
  private sessions: Map<string, SessionSnapshot> = new Map();
  private storagePath?: string;
  private autoSave: boolean;

  constructor(options?: { storagePath?: string; autoSave?: boolean }) {
    this.storagePath = options?.storagePath;
    this.autoSave = options?.autoSave ?? true;

    if (this.storagePath && fs.existsSync(this.storagePath)) {
      this.loadFromDisk();
    }
  }

  /**
   * Create a new session initialized with goal
   */
  public createSession(options: {
    sessionId?: string;
    userGoal: string;
    maxSteps?: number;
    initialMessages?: ChatMessage[];
    metadata?: Record<string, any>;
  }): SessionSnapshot {
    const sessionId =
      options.sessionId ||
      `sess_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    const snapshot: SessionSnapshot = {
      sessionId,
      userGoal: options.userGoal,
      state: "running",
      currentStep: 0,
      maxSteps: options.maxSteps ?? 15,
      planState: null,
      workingMemory: {
        hypotheses: [],
        facts: [],
        currentFocus: "",
        notes: [],
        updatedAt: now,
      },
      recalledMemoryIds: [],
      steps: [],
      messages: options.initialMessages || [],
      tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      createdAt: now,
      updatedAt: now,
      metadata: options.metadata || {},
    };

    this.sessions.set(sessionId, snapshot);
    if (this.autoSave && this.storagePath) {
      this.saveToDisk();
    }
    return snapshot;
  }

  /**
   * Save / update a step checkpoint into the session
   */
  public saveCheckpoint(
    sessionId: string,
    updates: Partial<SessionSnapshot> & {
      stepRecord?: SessionStep;
    }
  ): SessionSnapshot | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const now = new Date().toISOString();

    if (updates.stepRecord) {
      // Replace existing step if duplicate, or append
      const existingIdx = session.steps.findIndex(
        (s) => s.step === updates.stepRecord!.step
      );
      if (existingIdx >= 0) {
        session.steps[existingIdx] = updates.stepRecord;
      } else {
        session.steps.push(updates.stepRecord);
      }
      session.currentStep = Math.max(session.currentStep, updates.stepRecord.step);
    }

    if (updates.state) session.state = updates.state;
    if (updates.currentStep !== undefined) session.currentStep = updates.currentStep;
    if (updates.planState !== undefined) session.planState = updates.planState;
    if (updates.workingMemory) session.workingMemory = updates.workingMemory;
    if (updates.recalledMemoryIds) session.recalledMemoryIds = updates.recalledMemoryIds;
    if (updates.messages) session.messages = updates.messages;
    if (updates.tokenUsage) session.tokenUsage = updates.tokenUsage;
    if (updates.metadata) {
      session.metadata = { ...session.metadata, ...updates.metadata };
    }

    session.updatedAt = now;
    this.sessions.set(sessionId, session);

    if (this.autoSave && this.storagePath) {
      this.saveToDisk();
    }
    return session;
  }

  /**
   * Get complete session snapshot by ID
   */
  public getSnapshot(sessionId: string): SessionSnapshot | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Update session state directly (e.g. paused, completed, crashed)
   */
  public updateState(sessionId: string, state: SessionState): SessionSnapshot | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    session.state = state;
    session.updatedAt = new Date().toISOString();
    this.sessions.set(sessionId, session);
    if (this.autoSave && this.storagePath) {
      this.saveToDisk();
    }
    return session;
  }

  /**
   * List all sessions summary
   */
  public listSessions(): SessionSummary[] {
    return Array.from(this.sessions.values())
      .map((s) => ({
        sessionId: s.sessionId,
        userGoal: s.userGoal,
        state: s.state,
        stepCount: s.steps.length,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      }))
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
  }

  /**
   * Delete a session
   */
  public deleteSession(sessionId: string): boolean {
    const deleted = this.sessions.delete(sessionId);
    if (deleted && this.autoSave && this.storagePath) {
      this.saveToDisk();
    }
    return deleted;
  }

  /**
   * Clear all sessions
   */
  public clear(): void {
    this.sessions.clear();
    if (this.autoSave && this.storagePath) {
      this.saveToDisk();
    }
  }

  private saveToDisk(): void {
    if (!this.storagePath) return;
    try {
      const dir = path.dirname(this.storagePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const data = Array.from(this.sessions.values());
      fs.writeFileSync(this.storagePath, JSON.stringify(data, null, 2), "utf-8");
    } catch (e) {
      console.error("[SessionStore] Failed to save to disk:", e);
    }
  }

  private loadFromDisk(): void {
    if (!this.storagePath || !fs.existsSync(this.storagePath)) return;
    try {
      const content = fs.readFileSync(this.storagePath, "utf-8");
      const list: SessionSnapshot[] = JSON.parse(content);
      this.sessions.clear();
      list.forEach((s) => this.sessions.set(s.sessionId, s));
    } catch (e) {
      console.error("[SessionStore] Failed to load from disk:", e);
    }
  }
}

