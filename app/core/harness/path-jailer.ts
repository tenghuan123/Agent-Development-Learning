import * as path from "node:path";
import * as fs from "node:fs";

export interface PathValidationResult {
  allowed: boolean;
  resolvedPath: string;
  normalizedWorkspace: string;
  reason?: string;
  isSymlinkEscape?: boolean;
}

export class PathJailer {
  private workspaceRoot: string;
  private allowSymlinkEscape: boolean;

  constructor(workspaceRoot?: string, allowSymlinkEscape = false) {
    this.workspaceRoot = path.resolve(workspaceRoot || process.cwd());
    this.allowSymlinkEscape = allowSymlinkEscape;
  }

  /**
   * Validates if a target path is safely contained within the workspace root
   */
  validatePath(targetPath: string): PathValidationResult {
    const normalizedRoot = path.resolve(this.workspaceRoot);

    if (!targetPath || typeof targetPath !== "string") {
      return {
        allowed: false,
        resolvedPath: "",
        normalizedWorkspace: normalizedRoot,
        reason: "目标路径为空或非有效字符串",
      };
    }

    // Resolve relative path against workspace root
    const resolvedPath = path.isAbsolute(targetPath)
      ? path.resolve(targetPath)
      : path.resolve(normalizedRoot, targetPath);

    // 1. Check relative path boundary
    const relative = path.relative(normalizedRoot, resolvedPath);
    const isOutside =
      relative.startsWith("..") ||
      path.isAbsolute(relative) ||
      (relative === "" && false);

    if (isOutside) {
      return {
        allowed: false,
        resolvedPath,
        normalizedWorkspace: normalizedRoot,
        reason: `[沙箱越界拦截] 目标路径 '${targetPath}' 解析后为 '${resolvedPath}'，超出了工作区沙盒边界 ('${normalizedRoot}')。禁止访问宿主机外部文件！`,
      };
    }

    // 2. Symlink Traversal Check (if file exists and is a symlink)
    if (!this.allowSymlinkEscape) {
      try {
        if (fs.existsSync(resolvedPath)) {
          const realPath = fs.realpathSync(resolvedPath);
          const realRelative = path.relative(normalizedRoot, realPath);
          if (realRelative.startsWith("..") || path.isAbsolute(realRelative)) {
            return {
              allowed: false,
              resolvedPath,
              normalizedWorkspace: normalizedRoot,
              reason: `[符号链接逃逸拦截] 目标路径 '${resolvedPath}' 是一个指向沙盒外部真实路径 '${realPath}' 的符号链接，系统已阻断访问。`,
              isSymlinkEscape: true,
            };
          }
        }
      } catch {
        // If file doesn't exist yet (e.g. for write_file), relative check above is sufficient
      }
    }

    return {
      allowed: true,
      resolvedPath,
      normalizedWorkspace: normalizedRoot,
    };
  }

  /**
   * Asserts path validity or throws error
   */
  assertPath(targetPath: string): string {
    const result = this.validatePath(targetPath);
    if (!result.allowed) {
      throw new Error(result.reason || `路径 '${targetPath}' 未通过沙箱边界校验。`);
    }
    return result.resolvedPath;
  }

  getWorkspaceRoot(): string {
    return this.workspaceRoot;
  }
}

