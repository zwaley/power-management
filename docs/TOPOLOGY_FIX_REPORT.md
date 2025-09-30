修复记录：端口拓扑图改进（日期：2025-09-30）

概述
- 本次针对 /graph 端口拓扑视图的四项核心问题进行了修复与优化，并同步完善交互与样式。

改动摘要
- 修复端口布局：在 `hierarchicalLR` 与 `hierarchicalUD` 布局下，将 A 端所有端口按总数对半分配到左右或上下，保证均衡展示，避免全部挤到单侧。
- 修复全屏功能：新增 `toggleFullscreen()` 与 `exitFullscreen()`，与 `topology.css` 的 `.fullscreen-topology` 样式一致，按钮可正常进入/退出全屏。
- 修复节点详情弹窗卡死：为无 Bootstrap 环境提供纯 JS 关闭逻辑，支持点击关闭按钮、遮罩点击、ESC 退出，显示后不再锁死其他交互。
- 移除“nan”对端节点：过滤无效名称（如 `nan`、`None`、`空` 等）及其边，不再为空闲端口生成对端节点。

涉及文件
- `static/js/port_topology.js`
- 文档新增：`docs/TOPOLOGY_FIX_REPORT.md`

实现要点
- 布局均衡：在 `updateLayout` 内按端口数切分为左右（或上下）两组，分组内按行列坐标计算，恢复用户拖拽位置后再 fit。
- 全屏开关：优先调用原生 Fullscreen API，不可用时降级切换 `.fullscreen-topology` 类名；支持恢复到容器原始尺寸。
- 弹窗降级：在 `showNodeDetails` 中创建可关闭的弹窗（按钮、遮罩、ESC），显示与隐藏均不会阻塞网络交互（drag/zoom/select/refresh）。
- 无效节点过滤：在 `updateTopologyData` 中对 `nodes` 与 `edges` 进行清洗，跳过 `nan` 等无效标签与空连线。

验证步骤
- 启动：`python run.py`，访问 `http://localhost:8009/graph`。
- 选择设备后生成拓扑：切换 `左右` 与 `上下` 布局，观察端口均衡分配。
- 全屏按钮：进入/退出全屏应正常，布局与交互不被锁死。
- 节点详情：单击节点弹窗出现；点击关闭/遮罩或按 ESC 可关闭；其它操作（拖拽、缩放、选择、刷新）仍可用。
- 空闲端口：不再生成标注为 `nan` 的对端节点，空闲端口为空。

后续计划
- 物理引擎与交互配置去重与统一（`options.physics`/`options.interaction`）。
- 迁移备份类 `PortTopologyManager_Backup3/4` 至 `temp/` 目录，减少主实现噪音。