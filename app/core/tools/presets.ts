export interface ToolPresetItem {
  id: string;
  title: string;
  prompt: string;
  description: string;
}

export const TOOL_CALLING_PRESETS: ToolPresetItem[] = [
  {
    id: "read_package_json",
    title: "实验 1：配置与代码读取 (File System Tool)",
    prompt: "请帮我读取项目中的 package.json，告诉我这个项目的名称、核心依赖库以及 React 版本是多少？",
    description: "模型必须识别需要读取磁盘文件，自动生成 read_file 工具调用请求并解析结果。",
  },
  {
    id: "math_calculation",
    title: "实验 2：高精度数学计算 (Math Execution Tool)",
    prompt: "请帮我精确计算以下复杂算式的值：(145 * 89) + (1024 / 32) - 127.5，并给出最终答案。",
    description: "LLM 自身极易在算术中产生幻觉，通过 calculate 工具调用 CPU 运算引擎确保 100% 正确。",
  },
  {
    id: "system_and_dirs",
    title: "实验 3：系统状态与目录探索 (System Info & Directory)",
    prompt: "请告诉我当前的系统时间、操作系统环境，并列出 app/core/ 目录下的文件结构。",
    description: "模型需要根据意图组合或调用系统信息与目录探索工具。",
  },
  {
    id: "error_self_healing",
    title: "实验 4：不存在文件的容错自愈 (Error Handling Lab)",
    prompt: "请读取不存在的文件 'src/non_existent_config.json'，并告诉我里面的内容。",
    description: "测试 Runtime 捕获文件不存在异常后，如何包装友好错误并让模型礼貌解释，而不是程序崩溃。",
  },
];

