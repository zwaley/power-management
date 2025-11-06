项目名称：DC Asset Manager（动力资源系统开发）

概述
本项目用于电力/动力资产的管理与拓扑展示，包含设备管理、连接管理、统计分析与端口级拓扑图（支持标准布局与总线式布局）。前端主要使用 Bootstrap + Vis.js，后端基于 FastAPI + SQLAlchemy + Jinja2。

背景与目标
- 背景：在复杂电力系统中，需要快速掌握设备与端口的连接关系与关键路径，便于运维与扩容。
- 目标：
  - 提供设备/连接的增量导入、维护与校验能力。
  - 提供可交互的端口级拓扑图，支持左右/上下布局、拖拽、位置持久化、全屏查看等。
  - 输出多维统计报表，辅助容量规划与风险识别。

技术架构
- 后端：FastAPI、SQLAlchemy、Uvicorn、Jinja2
- 前端：Bootstrap、Font Awesome、Vis.js
- 数据：SQLite（可替换为其他数据库）
- 目录结构（关键项）：
  - main.py：核心业务与路由
  - run.py：开发启动脚本
  - templates/graph.html：拓扑图页面模板
  - static/js/port_topology.js：端口拓扑图逻辑
  - database/asset.db：默认数据库
  - docs/README.md：产品与开发文档
  - docs/错误与经验记录.md：错误与经验记录

环境与依赖
- Python >= 3.9
- 依赖见 requirements.txt：
  - fastapi, uvicorn[standard], sqlalchemy, networkx, pandas, openpyxl, python-multipart, jinja2

本地运行（开发）
1) 安装依赖：
   pip install -r requirements.txt
2) 启动开发服务器（已配置端口与主机回环）：
   python run.py
   默认地址：http://127.0.0.1:8009

关键页面与API
- 设备列表：首页 /（设备管理与Excel导入；设备名称与生产厂家筛选支持输入搜索 + 下拉选择）
- 连接管理：/connections（设备名称筛选支持输入搜索 + 下拉选择）
- 生命周期管理：/lifecycle-management
- 拓扑页面：/topology（新页面，支持端口级/设备级/全局设备图切换）
- 端口级拓扑数据：/api/port-topology/{device_id}
- 设备级拓扑数据：/api/power-chain/{device_id}?level=device
- 全局设备拓扑数据：/api/topology/global?station=&device_type=

端口拓扑图说明（static/js/port_topology.js）
- 标签统一清洗：通过 formatLabel 去下划线，在“机房”后换行，并为端口节点生成两行标签（位置/设备-端口）。
- 标题生成统一：generateNodeTitle 对字段值进行去下划线，保持一致性。
- 布局：支持左右（LR）和上下（UD）两列分配，总线式布局支持汇聚显示。
- 交互：拖拽、悬停提示、双击详情、全屏开关、刷新与筛选。

配置说明（config.py）
- HOST：开发启动脚本使用 0.0.0.0；如遇防火墙限制可改为 127.0.0.1
- PORT：默认 8009（可通过环境变量 PORT 覆盖）
- ADMIN_PASSWORD、DATABASE_URL 可通过环境变量覆盖

开发流程与规范
- 重要改动前先做诊断与方案评审，确保可回退。
- 重要节点请及时 git commit（如：配置修改、路由新增、拓扑逻辑优化）。
- 错误与经验统一记录至 docs/错误与经验记录.md。

测试建议
- 手动测试：
  - /graph 页面加载设备列表；选择设备后生成拓扑图；切换布局；全屏查看与退出。
  - 拖拽节点后检查位置持久化（如页面刷新后的还原策略）。
  - 标签与标题是否符合新的格式（去下划线、位置/设备-端口两行标签）。
- 自动化建议：后续可引入 Playwright 进行端到端测试。

部署与运维
- 开发环境使用 run.py + Uvicorn；生产环境建议通过 ASGI 服务器（如 gunicorn+uvicorn workers）并启用反向代理。
- 提供回滚计划：配置变更应有版本记录；数据库变更需迁移脚本与备份策略。

后续计划
- 完善位置持久化策略与键位存储方案。
- 引入端口标签显示开关的实际隐藏/显示逻辑。
- 增加统计图与报表导出（PDF/Excel）。

迁移与隔离（Topology）
- 新页面：`/topology`（模板：`templates/topology.html`），与旧 `/graph` 彻底隔离。
- 参考文档：`docs/拓扑图重构隔离与复用方案.md`、`docs/graph端口拓扑弃用与迁移指南.md`。
- 新脚本：`static/js/topology_page.js`、`static/js/topology_ports.js`、`static/js/topology_device.js`、`static/js/topology_global.js`；页面不加载 `static/js/port_topology.js`。