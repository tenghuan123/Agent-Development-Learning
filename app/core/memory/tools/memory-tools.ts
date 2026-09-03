import { z } from "zod";
import type { ToolDefinition } from "../../tools/types";
import type { MemoryBank } from "../memory-bank";
import type { WorkingMemoryManager } from "../working-memory";

/**
 * Manage Memory Tool Schema
 */
export const ManageMemoryInputSchema = z.object({
  action: z
    .enum(["save_memory", "recall_memory", "delete_memory", "list_memories"])
    .describe(
      "The memory action: 'save_memory' (store a long-term rule/learning), 'recall_memory' (query relevant memories by keywords), 'delete_memory' (remove outdated rule), 'list_memories' (browse stored rules)."
    ),
  category: z
    .enum(["preference", "convention", "learning", "architecture"])
    .optional()
    .describe("Category of memory (required for 'save_memory')"),
  key: z
    .string()
    .optional()
    .describe("Unique snake_case identifier key (e.g. 'pkg_manager', 'db_port')"),
  content: z
    .string()
    .optional()
    .describe("Detailed persistent rule or insight to remember (required for 'save_memory')"),
  tags: z
    .array(z.string())
    .optional()
    .describe("Optional search tags for quick retrieval"),
  query: z
    .string()
    .optional()
    .describe("Search term or keywords for 'recall_memory'"),
  memoryId: z
    .string()
    .optional()
    .describe("Memory ID for 'delete_memory'"),
});

export type ManageMemoryInput = z.infer<typeof ManageMemoryInputSchema>;

/**
 * Creates manage_memory tool instance bound to a MemoryBank
 */
export function createManageMemoryTool(
  memoryBank: MemoryBank
): ToolDefinition<ManageMemoryInput, string> {
  return {
    name: "manage_memory",
    description: `Manage the agent's L3 Long-term Semantic Memory Bank.
Enables learning and persisting reusable project conventions, user style preferences, and debugging lessons across sessions.
Actions:
1. 'save_memory': Persist a new convention, preference, or learning rule.
2. 'recall_memory': Search relevant memories using query keywords.
3. 'delete_memory': Remove a stale or invalid memory item.
4. 'list_memories': View existing memories by category.`,
    schema: ManageMemoryInputSchema,
    execute: async (args) => {
      const { action, category, key, content, tags, query, memoryId } = args;

      switch (action) {
        case "save_memory": {
          if (!category) {
            throw new Error("Action 'save_memory' requires 'category' ('preference' | 'convention' | 'learning' | 'architecture').");
          }
          if (!content || !content.trim()) {
            throw new Error("Action 'save_memory' requires non-empty 'content'.");
          }
          const itemKey = key && key.trim() ? key.trim() : `rule_${Date.now()}`;
          const item = memoryBank.add({
            category,
            key: itemKey,
            content,
            tags,
            source: "agent_saved",
            confidence: 0.95,
          });
          return `✅ Memory successfully saved to Memory Bank!\n• ID: ${item.id}\n• Category: [${item.category}]\n• Key: ${item.key}\n• Content: "${item.content}"`;
        }

        case "recall_memory": {
          const memories = memoryBank.recall(query || "", {
            category: category as any,
            limit: 5,
          });
          if (memories.length === 0) {
            return `No memories matched query: "${query || "all"}".`;
          }
          return `🧠 Found ${memories.length} relevant memories in Memory Bank:\n\n` +
            memories
              .map(
                (m, i) =>
                  `${i + 1}. [${m.category}] **${m.key}** (Score boost: ${m.confidence || 0.9})\n   ${m.content}\n   (Tags: ${m.tags.join(", ")})`
              )
              .join("\n\n");
        }

        case "delete_memory": {
          if (!memoryId && !key) {
            throw new Error("Action 'delete_memory' requires 'memoryId' or 'key'.");
          }
          let targetId = memoryId;
          if (!targetId && key) {
            const found = memoryBank.findByKey(key);
            if (found) targetId = found.id;
          }
          if (!targetId) {
            return `Memory with key "${key}" not found.`;
          }
          const deleted = memoryBank.remove(targetId);
          return deleted
            ? `🗑️ Memory item '${targetId}' successfully deleted.`
            : `Memory item '${targetId}' not found.`;
        }

        case "list_memories": {
          const items = memoryBank.list({ category: category as any, limit: 10 });
          if (items.length === 0) {
            return "Memory Bank is currently empty.";
          }
          return `📋 Stored Memories in Bank (${items.length} items):\n\n` +
            items
              .map(
                (m, i) =>
                  `${i + 1}. [${m.category}] **${m.key}** (ID: ${m.id})\n   ${m.content}`
              )
              .join("\n\n");
        }

        default:
          throw new Error(`Unknown action: ${(args as any).action}`);
      }
    },
  };
}

/**
 * Scratchpad Tool Schema for L1 Working Memory
 */
export const ScratchpadInputSchema = z.object({
  action: z
    .enum(["update", "read", "clear"])
    .describe("Scratchpad action: 'update' (add hypothesis/fact/note), 'read' (inspect state), 'clear' (reset)."),
  focus: z.string().optional().describe("Update current immediate mini-focus"),
  hypothesis: z.string().optional().describe("Add a working hypothesis to investigate"),
  resolveHypothesis: z.string().optional().describe("Name of hypothesis resolved"),
  fact: z.string().optional().describe("Add a verified fact discovered"),
  note: z.string().optional().describe("Add a brief freeform scratchpad note"),
});

export type ScratchpadInput = z.infer<typeof ScratchpadInputSchema>;

/**
 * Creates scratchpad tool instance bound to WorkingMemoryManager
 */
export function createScratchpadTool(
  workingMemory: WorkingMemoryManager
): ToolDefinition<ScratchpadInput, string> {
  return {
    name: "scratchpad",
    description: `Manage L1 Working Memory and Scratchpad for the active task.
Use this to track active hypotheses under investigation, log confirmed facts, record immediate sub-goals, and take scratch notes.`,
    schema: ScratchpadInputSchema,
    execute: async (args) => {
      const { action, focus, hypothesis, resolveHypothesis, fact, note } = args;

      switch (action) {
        case "update": {
          if (focus) workingMemory.setFocus(focus);
          if (hypothesis) workingMemory.addHypothesis(hypothesis);
          if (resolveHypothesis) workingMemory.resolveHypothesis(resolveHypothesis, fact);
          else if (fact) workingMemory.addFact(fact);
          if (note) workingMemory.addNote(note);

          return `📝 Scratchpad updated.\n\n${workingMemory.formatForPrompt() || "Working memory updated."}`;
        }

        case "read": {
          const formatted = workingMemory.formatForPrompt();
          return formatted || "Scratchpad is currently empty.";
        }

        case "clear": {
          workingMemory.clear();
          return "Scratchpad cleared.";
        }

        default:
          throw new Error(`Unknown scratchpad action: ${(args as any).action}`);
      }
    },
  };
}

