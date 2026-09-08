import { createHash } from "crypto";
import type { ChatMessage } from "../llm/types";
import type {
  DriftConflict,
  FileDiffItem,
  FileSnapshot,
  WorkspaceDiff,
  WorkspaceDrift,
  WorkspaceSnapshot,
} from "./types";

export class WorkspaceTracker {
  /**
   * Compute a deterministic SHA-256 hash for file content.
   */
  public static computeHash(content: string): string {
    return createHash("sha256").update(content, "utf8").digest("hex");
  }

  /**
   * Fast calculation of workspace cryptographic Merkle root hash.
   */
  public static computeWorkspaceHash(files: Record<string, string>): string {
    const sortedPaths = Object.keys(files).sort();
    const rootHasher = createHash("sha256");
    for (const path of sortedPaths) {
      const content = files[path] ?? "";
      const hash = this.computeHash(content);
      rootHasher.update(`${path}:${hash};`);
    }
    return rootHasher.digest("hex");
  }

  /**
   * Generate a point-in-time WorkspaceSnapshot from an in-memory virtual or real file map.
   */
  public static createSnapshot(
    files: Record<string, string>,
    options: { snapshotId?: string; timestamp?: number } = {}
  ): WorkspaceSnapshot {
    const timestamp = options.timestamp || Date.now();
    const snapshotId =
      options.snapshotId || `snap_ws_${timestamp}_${Math.random().toString(36).substring(2, 7)}`;

    const fileSnapshots: Record<string, FileSnapshot> = {};
    const sortedPaths = Object.keys(files).sort();

    const rootHasher = createHash("sha256");

    for (const path of sortedPaths) {
      const content = files[path] ?? "";
      const hash = this.computeHash(content);
      const snippet = content.length > 200 ? content.substring(0, 200) + "..." : content;

      fileSnapshots[path] = {
        path,
        hash,
        size: Buffer.byteLength(content, "utf8"),
        lastModified: timestamp,
        contentSnippet: snippet,
      };

      rootHasher.update(`${path}:${hash};`);
    }

    const rootHash = rootHasher.digest("hex");

    return {
      id: snapshotId,
      timestamp,
      files: fileSnapshots,
      rootHash,
    };
  }

  /**
   * Compare two snapshots to calculate exact additions, modifications, and deletions.
   */
  public static compareSnapshots(
    before: WorkspaceSnapshot,
    after: WorkspaceSnapshot
  ): WorkspaceDiff {
    const changed: FileDiffItem[] = [];
    const allPaths = new Set([
      ...Object.keys(before.files),
      ...Object.keys(after.files),
    ]);

    let addedCount = 0;
    let modifiedCount = 0;
    let deletedCount = 0;
    let unmodifiedCount = 0;

    for (const path of Array.from(allPaths).sort()) {
      const oldFile = before.files[path];
      const newFile = after.files[path];

      if (!oldFile && newFile) {
        addedCount++;
        changed.push({
          path,
          status: "added",
          newHash: newFile.hash,
          newSnippet: newFile.contentSnippet,
        });
      } else if (oldFile && !newFile) {
        deletedCount++;
        changed.push({
          path,
          status: "deleted",
          oldHash: oldFile.hash,
          oldSnippet: oldFile.contentSnippet,
        });
      } else if (oldFile && newFile) {
        if (oldFile.hash !== newFile.hash) {
          modifiedCount++;
          changed.push({
            path,
            status: "modified",
            oldHash: oldFile.hash,
            newHash: newFile.hash,
            oldSnippet: oldFile.contentSnippet,
            newSnippet: newFile.contentSnippet,
          });
        } else {
          unmodifiedCount++;
          changed.push({
            path,
            status: "unmodified",
            oldHash: oldFile.hash,
            newHash: newFile.hash,
          });
        }
      }
    }

    return {
      changed,
      summary: {
        addedCount,
        modifiedCount,
        deletedCount,
        unmodifiedCount,
      },
    };
  }

  /**
   * Detect drift between a saved snapshot and current physical/memory files.
   * This represents external file modifications, accidental deletions, or branch shifts.
   */
  public static detectDrift(
    snapshot: WorkspaceSnapshot,
    currentFiles: Record<string, string>
  ): WorkspaceDrift {
    const conflicts: DriftConflict[] = [];

    // Check for missing or modified files recorded in snapshot
    for (const [path, expectedFile] of Object.entries(snapshot.files)) {
      if (!(path in currentFiles)) {
        conflicts.push({
          path,
          type: "missing",
          expectedHash: expectedFile.hash,
          message: `File '${path}' recorded in session snapshot is missing from workspace.`,
        });
        continue;
      }

      const actualContent = currentFiles[path] ?? "";
      const actualHash = this.computeHash(actualContent);

      if (actualHash !== expectedFile.hash) {
        conflicts.push({
          path,
          type: "modified",
          expectedHash: expectedFile.hash,
          actualHash,
          message: `File '${path}' was modified externally (expected: ${expectedFile.hash.substring(0, 8)}..., actual: ${actualHash.substring(0, 8)}...).`,
        });
      }
    }

    // Check for untracked files added after snapshot
    for (const path of Object.keys(currentFiles)) {
      if (!(path in snapshot.files)) {
        const actualHash = this.computeHash(currentFiles[path] ?? "");
        conflicts.push({
          path,
          type: "untracked",
          actualHash,
          message: `Untracked file '${path}' was introduced in workspace after session snapshot.`,
        });
      }
    }

    return {
      hasDrift: conflicts.length > 0,
      conflicts,
      checkedAt: Date.now(),
    };
  }

  /**
   * Scan messages for file path references (e.g. `src/...`, `.ts`, `.json`) and cross-check
   * against actual files in workspace to detect "Ghost Reference Risks".
   */
  public static detectGhostReferences(
    messages: ChatMessage[],
    currentFiles: Record<string, string>
  ): {
    hasGhostReferences: boolean;
    ghostFiles: string[];
    details: string[];
  } {
    const referencedFiles = new Set<string>();
    const fileRegex = /([a-zA-Z0-9_\-./]+\.(?:ts|tsx|js|jsx|json|md|py|rs|go|css|html))/g;

    for (const msg of messages) {
      if (!msg.content) continue;
      let match: RegExpExecArray | null;
      while ((match = fileRegex.exec(msg.content)) !== null) {
        const candidate = match[1];
        if (!candidate.startsWith("http") && !candidate.startsWith("node_modules")) {
          referencedFiles.add(candidate);
        }
      }
    }

    const ghostFiles: string[] = [];
    const details: string[] = [];

    for (const file of Array.from(referencedFiles)) {
      // If messages mention file but it does not exist on disk
      if (!(file in currentFiles)) {
        ghostFiles.push(file);
        details.push(
          `Ghost Reference: Messages refer to '${file}', but it does NOT exist in the physical workspace!`
        );
      }
    }

    return {
      hasGhostReferences: ghostFiles.length > 0,
      ghostFiles,
      details,
    };
  }
}

