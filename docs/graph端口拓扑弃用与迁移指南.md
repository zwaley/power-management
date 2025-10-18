# /graph 端口拓扑弃用与迁移指南（草案 v0.1）

## 1. 弃用范围
- 页面：`templates/graph.html` 中与“端口拓扑”相关的按钮、下拉、提示文案与脚本逻辑。
- 脚本：`static/js/port_topology.js` 及其挂载的 `PortTopologyManager`、`loadPortTopology` 等入口函数。
- 接口：`/api/port-topology/{device_id}`（旧版）作为前端调用通道在新页面停止使用；后端可保留兼容别名。

## 2. 保留与迁移目标
- 保留内容：设备级拓扑（`/graph` 页仍然可用），其渲染流程与交互保持不变。
- 迁移目标：端口级拓扑统一迁至新页面 `/topology`，仅使用最终接口与独立脚本。

## 3. 新页面与接口
- 新入口：`GET /topology` → `templates/topology.html`。
- 接口契约：`GET /api/topology/ports/{device_id}`（最终），允许短期并行 `GET /api/port-topology/v2/{device_id}`（别名）。
- 前端脚本：`static/js/topology_ports.js`（渲染）；`static/js/topology_nav.js`（导航）。

## 4. 风险与兼容
- 风险点：
  - 误加载旧脚本导致命名空间冲突或覆盖 LocalStorage。
  - 旧页面 UI 元素仍在，用户误用导致体验混乱。
- 兼容建议：
  - 新页面完全不引入 `port_topology.js`；旧页面隐藏/禁用端口相关 UI。
  - 导航/菜单中对端口拓扑的入口统一指向 `/topology`。

## 5. 发布与下线步骤（不写功能代码）
1) 上线 `/topology` 页面与文档，导航入口切换至新页面。
2) 在 `/graph` 页面标注端口拓扑“已迁移至新页面”，移除或禁用相关控件。
3) 观察期（1~2 周）：采集日志，确保端到端稳定。
4) 确认稳定后，标记 `/api/port-topology/{device_id}` 为废弃，仅保留后端别名一段时间。
5) 最终下线：移除旧端口拓扑脚本与残留 UI，文档归档（保留源码历史）。

## 6. 验收标准
- 导航中仅保留 `/topology` 作为端口级拓扑入口。
- `/graph` 页面不存在端口拓扑交互入口；设备拓扑功能不受影响。
- 前端不再加载 `static/js/port_topology.js`；无旧命名空间污染。
- 端口拓扑完整流程（设备选择→渲染→交互）在新页面可用且稳定。

## 7. 回退策略
- 若新页面出现故障：
  - 导航临时恢复 `/graph` 的设备拓扑入口，不开放端口拓扑入口。
  - 保留后端 `GET /api/port-topology/v2/{device_id}` 别名用于快速修复（不在前端显式调用）。

## 8. 沟通与文档
- 更新《拓扑图功能开发计划.md》《端口拓扑图设计规范.md》中的入口与接口章节链接。
- 在 README 中标注废弃说明与新页面指引。