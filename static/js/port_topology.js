/**
 * 端口拓扑图功能模块
 * 实现端口级别的网络可视化
 */

class PortTopologyManager {
    constructor() {
        this.network = null;
        this.nodes = new vis.DataSet();
        this.edges = new vis.DataSet();
        this.container = null;
        this.currentDeviceId = null;
        this.isFullscreen = false;
        // 新增：记录当前布局类型，便于拖拽事件依据布局动态调整物理引擎
        this.currentLayout = null;
        // 新增：一次性跳过应用已保存位置（用于“重新生成”）
        this.skipApplySavedPositionsOnce = false;
        
        // 端口拓扑图配置
        this.options = {
            interaction: {
                dragNodes: true,    // 允许拖拽节点
                dragView: true,     // 允许拖拽视图
                hover: true,        // 允许悬停
                zoomView: true,     // 允许缩放
                selectConnectedEdges: false,
                multiselect: true
            },
            physics: {
                enabled: false      // 默认禁用物理引擎，启用自由拖拽
            },
            nodes: {
                shape: 'box',
                margin: 8,
                widthConstraint: {
                    minimum: 80,
                    maximum: 120
                },
                heightConstraint: {
                    minimum: 30
                },
                font: {
                    size: 12,
                    face: 'Arial',
                    align: 'center'
                },
                borderWidth: 2,
                shadow: {
                    enabled: true,
                    color: 'rgba(0,0,0,0.2)',
                    size: 5,
                    x: 2,
                    y: 2
                }
            },
            edges: {
                width: 3,
                color: {
                    color: '#FF0000',
                    highlight: '#FF0000',
                    hover: '#FF0000'
                },
                smooth: {
                    enabled: true,
                    type: 'continuous',
                    roundness: 0.2
                },
                arrows: {
                    to: {
                        enabled: true
                        
                    }
                },
                font: {
                    size: 10,
                    align: 'middle'
                }
            },
            layout: {
                improvedLayout: false,  // 禁用改进布局，使用固定坐标
                hierarchical: {
                    enabled: false
                }
            },
            physics: {
                enabled: false  // 禁用物理引擎，启用完全自由拖拽
            },
            interaction: {
                dragNodes: true,  // 允许拖拽节点（水平和垂直方向）
                dragView: true,   // 允许拖拽视图
                zoomView: true,   // 允许缩放
                selectConnectedEdges: false
            }
        };
    }

    /**
     * 初始化端口拓扑图
     */
    initialize(containerId) {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            console.error('端口拓扑图容器未找到:', containerId);
            return false;
        }

        // 创建网络图
        const data = {
            nodes: this.nodes,
            edges: this.edges
        };
        
        this.network = new vis.Network(this.container, data, this.options);
        
        // 绑定事件
        this.bindEvents();
        
        return true;
    }

    /**
     * 绑定网络图事件
     */
    bindEvents() {
        if (!this.network) return;

        // 节点点击事件
        this.network.on('click', (params) => {
            if (params.nodes.length > 0) {
                const nodeId = params.nodes[0];
                this.onNodeClick(nodeId);
            }
        });

        // 节点双击事件
        this.network.on('doubleClick', (params) => {
            if (params.nodes.length > 0) {
                const nodeId = params.nodes[0];
                this.onNodeDoubleClick(nodeId);
            }
        });

        // 拖拽开始事件
        this.network.on('dragStart', (params) => {
            if (params.nodes.length > 0) {
                this.onDragStart(params.nodes);
            }
        });

        // 拖拽结束事件
        this.network.on('dragEnd', (params) => {
            if (params.nodes.length > 0) {
                this.onDragEnd(params.nodes);
            }
        });

        // 悬停事件
        this.network.on('hoverNode', (params) => {
            this.onNodeHover(params.node);
        });

        // 离开悬停事件
        this.network.on('blurNode', (params) => {
            this.onNodeBlur(params.node);
        });
    }

    /**
     * 加载设备的端口拓扑数据
     */
    async loadPortTopology(deviceId) {
        try {
            this.currentDeviceId = deviceId;
            
            // 显示加载状态
            this.showLoading();
            
            // 获取端口拓扑数据
            const response = await fetch(`/api/port-topology/${deviceId}`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            // 更新图形数据
            this.updateTopologyData(data);
            
            // 隐藏加载状态
            this.hideLoading();
            
        } catch (error) {
            console.error('加载端口拓扑数据失败:', error);
            this.showError('加载端口拓扑数据失败: ' + error.message);
            
            // 记录错误到后端
            this.logError('TOPOLOGY_LOAD', 'ERROR', error.message, {
                deviceId: deviceId,
                timestamp: new Date().toISOString()
            });
            // 确保异常时也结束加载态
            this.hideLoading();
        }
    }
    /**
     * 更新拓扑图数据
     */
    updateTopologyData(data, options = {}) {
        try {
            // 清空现有数据
            this.nodes.clear();
            this.edges.clear();

            // 若明确要求重置位置，则清除本地缓存并跳过一次应用
            if (options && options.resetPositions === true) {
                this.clearSavedPositions();
                this.skipApplySavedPositionsOnce = true;
            }

            // 处理后端API返回的节点数据格式 {nodes: [], edges: []}
            if (data.nodes && Array.isArray(data.nodes)) {
                // 直接使用后端返回的节点数据，这些数据已经包含了vis.js需要的格式
                const processedNodes = data.nodes.map(node => {
                    // 统一类型字段：兼容后端的 node_type / nodeType / type，并做语义归一
                    const rawType = node.nodeType || node.type || node.node_type;
                    const normalizedType = (() => {
                        if (!rawType) return 'device';
                        const t = String(rawType).toLowerCase();
                        if (t === 'device_icon' || t === 'device') return 'device';
                        // 后端使用 selected_device_port / connected_device_port
                        if (t.includes('port')) return 'port';
                        // 远端设备类型
                        if (t === 'remote_device') return 'remote_device';
                        return rawType;
                    })();
                    const isRemoteCombined = node.id && String(node.id).startsWith('remote_combined_');
                    return {
                        id: node.id,
                        // 统一清洗名称：去下划线，在“机房”后换行，端口采用两行可读格式
                        label: this.formatLabel(node),
                        title: node.title || this.generateNodeTitle({ ...node, nodeType: normalizedType }),
                        color: node.color || this.getDefaultNodeColor(normalizedType),
                        shape: node.shape || 'box',
                        size: node.size || 30,
                        // 统一提升可读性：远端节点标签更醒目且更小
                        font: node.font || (isRemoteCombined ? { size: 10, color: '#fef08a' } : { size: 12, color: '#ffffff' }),
                        x: node.x,
                        y: node.y,
                        // 保存原始数据
                        nodeData: {
                            ...node,
                            rawNodeType: rawType,
                            nodeType: normalizedType  // 确保 nodeType 字段存在且语义统一
                        }
                    };
                });
                
                // 去重并使用 update 防止重复ID导致异常
                const seenNodeIds = new Set();
                const uniqueNodes = [];
                for (const n of processedNodes) {
                    if (n && n.id != null && !seenNodeIds.has(n.id)) {
                        seenNodeIds.add(n.id);
                        uniqueNodes.push(n);
                    }
                }
                this.nodes.update(uniqueNodes);
            }
            
            // 处理后端API返回的边数据格式
            if (data.edges && Array.isArray(data.edges)) {
                // 仅渲染“端口↔端口”的真实连接边（存在 connection_id 且有电缆类型/型号）。
                // 注意：必须保留设备↔端口、设备↔合成节点等结构性边，以便布局算法识别本端端口与对端节点。
                const connectedEdges = data.edges.filter(edge => {
                    // 仅当存在 connection_id 时，才视为真实连接（不再要求cable_type/cable_model）
                    const isRealConnection = edge.connection_id != null;
                    
                    // 结构性边：没有 connection_id，通常用于布局（例如，设备到端口）
                    const isStructuralEdge = edge.connection_id == null;

                    // 保留真实连接或结构性边
                    return isRealConnection || isStructuralEdge;
                });
                // 使用后端返回的边数据，按交流/直流映射颜色
                const processedEdges = connectedEdges.map(edge => {
                    // 如果后端未提供id，按from/to/连接信息生成稳定ID，确保边能正确渲染
                    const fallbackId = `${edge.from || ''}->${edge.to || ''}:${edge.connection_id || edge.label || edge.cable_model || ''}`;
                    const eid = edge.id || fallbackId;
                    const ct = String(edge.connection_type || edge.cable_type || '').trim();
                    let baseColor = '#9ca3af';
                    if (ct === '交流') baseColor = '#f59e0b';
                    else if (ct === '直流') baseColor = '#ef4444';
                    const colorValue = edge.color || { color: baseColor, highlight: baseColor, hover: baseColor };
                    const widthValue = edge.connection_id ? Math.max(edge.width || 3, 3) : Math.max(edge.width || 1, 1);

                    return {
                        id: eid,
                        from: edge.from,
                        to: edge.to,
                        label: edge.label || '',
                        title: edge.title || this.generateEdgeTitle(edge),
                        color: colorValue,
                        width: widthValue,
                        // 尊重后端提供的箭头方向；若无，则默认指向 to
                        arrows: (edge.arrows != null ? edge.arrows : { to: { enabled: true } }),
                        // 保存原始数据
                        edgeData: edge
                    };
                });
                
                // 去重并使用 update 防止重复ID导致异常
                const seenEdgeIds = new Set();
                const uniqueEdges = [];
                for (const e of processedEdges) {
                    if (e && e.id != null && !seenEdgeIds.has(e.id)) {
                        seenEdgeIds.add(e.id);
                        uniqueEdges.push(e);
                    }
                }
                this.edges.update(uniqueEdges);
                // 调试与强制重绘，确保边立即可见
                try {
                    console.log('端口拓扑: 边数量 =', uniqueEdges.length);
                } catch (e) {}
                setTimeout(() => {
                    if (this.network) {
                        try { this.network.redraw(); } catch (e) {}
                        try { this.network.fit(); } catch (e) {}
                    }
                }, 50);
            }
            
            // 尝试恢复已保存的节点位置（若存在，且未被要求跳过）
            if (!this.skipApplySavedPositionsOnce) {
                this.applySavedNodePositions();
            } else {
                // 跳过一次后立即恢复默认行为
                this.skipApplySavedPositionsOnce = false;
            }
            
            // 自动调整视图
            setTimeout(() => {
                if (this.network) {
                    this.network.fit();
                }
            }, 500);
            
        } catch (error) {
            console.error('更新拓扑数据失败:', error);
            this.showError('更新拓扑数据失败: ' + error.message);
        }
    }

    /**
     * 生成节点标题（悬停提示）
     */
    generateNodeTitle(node) {
        const sanitize = (v) => String(v || '').replace(/_/g, '');
        let title = `节点: ${sanitize(node.label || node.id)}`;
        if (node.nodeType) title += `\n类型: ${sanitize(node.nodeType)}`;
        if (node.deviceType) title += `\n设备类型: ${sanitize(node.deviceType)}`;
        if (node.station) title += `\n站点: ${sanitize(node.station)}`;
        if (node.portName) title += `\n端口: ${sanitize(node.portName)}`;
        if (node.portCount) title += `\n端口数: ${sanitize(node.portCount)}`;
        return title;
    }

    /**
     * 生成边标题（悬停提示）
     */
    generateEdgeTitle(edge) {
        let title = `连接: ${edge.from} -> ${edge.to}`;
        if (edge.connection_type) title += `\n类型: ${edge.connection_type}`;
        if (edge.cable_model) title += `\n线缆型号: ${edge.cable_model}`;
        if (edge.cable_type) title += `\n线缆类型: ${edge.cable_type}`;
        if (edge.remark) title += `\n备注: ${edge.remark}`;
        return title;
    }

    // 名称格式化：去掉下划线；若包含“机房”，在其后插入换行；
    // 特殊处理 remote_combined 节点：仅显示“设备-端口”一行，避免重复
    formatLabel(node) {
        try {
            const sanitize = (v) => String(v || '').replace(/_/g, '');
            const raw = sanitize(node.label || '');
            const withBreak = raw.replace(/机房(?!\n)/, '机房\n');
            const idStr = String(node.id || '');
            const isRemoteCombined = idStr.startsWith('remote_combined_');

            if (isRemoteCombined) {
                const dev = sanitize(node.device_name || node.deviceName || '');
                const port = sanitize(node.port_name || node.portName || '');
                const combined = [dev, port].filter(Boolean).join('-');
                // 若无法组合，则退回原始文本清洗后的结果
                return combined || withBreak;
            }
            if (node.nodeType === 'port') {
                const location = sanitize(node.station || node.site || '');
                const dev = sanitize(node.deviceName || node.device_name || '');
                const port = sanitize(node.portName || node.port_name || '');
                const left = location ? location.replace(/机房(?!\n)/, '机房\n') : withBreak;
                const right = [dev, port].filter(Boolean).join('-');
                return [left, right].filter(Boolean).join('\n');
            }
            return withBreak;
        } catch (e) {
            console.warn('格式化标签失败:', e);
            return String(node.label || '');
        }
    }

    /**
     * 获取默认节点颜色
     */
    getDefaultNodeColor(nodeType) {
        const colors = {
            'device': '#97C2FC',      // 蓝色 - 设备
            'port': '#FFA500',        // 橙色 - 端口
            'remote_device': '#90EE90', // 浅绿色 - 远程设备
            'bus': '#FFB6C1'          // 浅粉色 - 总线
        };
        
        return {
            background: colors[nodeType] || colors.device,
            border: '#2B7CE9',
            highlight: {
                background: colors[nodeType] || colors.device,
                border: '#000000'
            }
        };
    }

    /**
     * 获取端口颜色
     */
    getPortColor(status) {
        const colors = {
            'active': '#4CAF50',    // 绿色 - 活跃
            'inactive': '#9E9E9E',  // 灰色 - 非活跃
            'error': '#F44336',     // 红色 - 错误
            'warning': '#FF9800',   // 橙色 - 警告
            'unknown': '#607D8B'    // 蓝灰色 - 未知
        };
        
        return {
            background: colors[status] || colors.unknown,
            border: '#333333',
            highlight: {
                background: colors[status] || colors.unknown,
                border: '#000000'
            }
        };
    }

    /**
     * 获取连接颜色
     */
    getConnectionColor(status) {
        const colors = {
            'active': '#4CAF50',
            'inactive': '#9E9E9E',
            'error': '#F44336',
            'warning': '#FF9800'
        };
        
        return colors[status] || '#2196F3';
    }

    /**
     * 节点点击处理
     */
    onNodeClick(nodeId) {
        const node = this.nodes.get(nodeId);
        if (node && node.nodeData) {
            this.showNodeDetails(node.nodeData);
        }
    }

    /**
     * 节点双击处理
     */
    onNodeDoubleClick(nodeId) {
        const node = this.nodes.get(nodeId);
        if (node && node.nodeData) {
            // 双击可以打开节点配置界面或显示详细信息
            this.openNodeConfig(node.nodeData);
        }
    }

    /**
     * 拖拽开始处理
     */
    onDragStart(nodeIds) {
        // 根据当前布局决定物理引擎状态
        if (this.currentLayout === 'force') {
            // 力导向布局下，保持物理引擎启用，以便拖拽后继续收敛
            this.network.setOptions({ physics: { enabled: true } });
        } else {
            // 非力导向布局禁用物理引擎，保证位置固定、拖拽稳定
            this.network.setOptions({ physics: { enabled: false } });
        }
    }

    /**
     * 拖拽结束处理
     */
    onDragEnd(nodeIds) {
        // 根据当前布局决定物理引擎状态
        if (this.currentLayout === 'force') {
            // 维持物理引擎启用，并进行短暂稳定以加速收敛
            this.network.setOptions({ physics: { enabled: true } });
            this.network.stabilize(100);
        } else {
            // 非力导向布局保持禁用，位置不被算法更改
            this.network.setOptions({ physics: { enabled: false } });
        }
        // 保存节点位置
        this.saveNodePositions(nodeIds);
    }

    /**
     * 节点悬停处理
     */
    onNodeHover(nodeId) {
        const node = this.nodes.get(nodeId);
        if (node && node.portData) {
            // 显示详细信息提示
            this.showTooltip(node.portData);
        }
    }

    /**
     * 节点离开悬停处理
     */
    onNodeBlur(nodeId) {
        // 隐藏提示
        this.hideTooltip();
    }

    /**
     * 显示端口详情
     */
    showPortDetails(portData) {
        // 实现端口详情显示逻辑
        console.log('显示端口详情:', portData);
    }

    /**
     * 打开端口配置
     */
    openPortConfig(portData) {
        // 实现端口配置界面
        console.log('打开端口配置:', portData);
    }

    /**
     * 保存节点位置
     */
    saveNodePositions(nodeIds) {
        // 将当前拖拽的节点坐标保存到本地存储（按设备与布局区分）
        try {
            if (!this.network || !this.nodes || !Array.isArray(nodeIds) || nodeIds.length === 0) return;
            if (!this.currentDeviceId || !this.currentLayout) {
                console.warn('保存节点位置时缺少当前设备或布局信息');
            }
            const key = this.getPositionStorageKey();
            const existing = this.getSavedPositions();
            // 从 Network 获取节点当前坐标
            const posMap = this.network.getPositions(nodeIds);
            // 合并到 existing
            for (const nid of Object.keys(posMap)) {
                const p = posMap[nid];
                if (p && typeof p.x === 'number' && typeof p.y === 'number') {
                    existing[nid] = { x: p.x, y: p.y };
                }
            }
            // 写回本地存储
            this.setSavedPositions(existing);
            console.log('已保存节点位置到本地存储:', key);
        } catch (e) {
            console.warn('保存节点位置失败:', e);
        }
    }

    // 新增：根据设备与布局生成存储键，确保不同设备/布局的位置互不干扰
    getPositionStorageKey() {
        try {
            const devicePart = this.currentDeviceId ? String(this.currentDeviceId) : 'unknown_device';
            const layoutPart = this.currentLayout ? String(this.currentLayout) : 'unknown_layout';
            return `portTopologyPositions:${devicePart}:${layoutPart}`;
        } catch (e) {
            console.warn('生成存储键失败:', e);
            return 'portTopologyPositions:unknown_device:unknown_layout';
        }
    }

    // 新增：获取本地已保存的节点位置
    getSavedPositions() {
        try {
            const key = this.getPositionStorageKey();
            const raw = localStorage.getItem(key);
            if (!raw) return {};
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') return parsed;
            return {};
        } catch (e) {
            console.warn('读取已保存节点位置失败:', e);
            return {};
        }
    }

    // 新增：写入本地节点位置
    setSavedPositions(positions) {
        try {
            const key = this.getPositionStorageKey();
            localStorage.setItem(key, JSON.stringify(positions || {}));
        } catch (e) {
            console.warn('写入节点位置失败:', e);
        }
    }

    // 新增：清空当前设备与布局的本地已保存位置
    clearSavedPositions() {
        try {
            const key = this.getPositionStorageKey();
            localStorage.removeItem(key);
            // 也清理数据集中可能遗留的 fixed 标记
            const allNodes = this.nodes.get();
            if (Array.isArray(allNodes) && allNodes.length > 0) {
                const reset = allNodes.map(n => ({ id: n.id, fixed: { x: false, y: false } }));
                this.nodes.update(reset);
            }
        } catch (e) {
            console.warn('清空已保存位置失败:', e);
        }
    }

    // 新增：应用本地已保存的节点位置（不固定 x/y，允许用户任意拖拽）
    applySavedNodePositions() {
        try {
            if (!this.network || !this.nodes) return;
            const saved = this.getSavedPositions();
            const ids = Object.keys(saved || {});
            if (ids.length === 0) return;
            // 关闭物理引擎，避免自动重排
            this.network.setOptions({ physics: { enabled: false } });
            for (const id of ids) {
                const p = saved[id];
                if (!p || typeof p.x !== 'number' || typeof p.y !== 'number') continue;
                // 更新数据集中的坐标并固定节点
                if (this.nodes.get(id)) {
                    // 不再固定坐标，允许用户继续拖拽
                    this.nodes.update({ id, x: p.x, y: p.y, fixed: { x: false, y: false } });
                }
                // 强制网络对象移动到指定坐标
                this.network.moveNode(id, p.x, p.y);
            }
            // 重绘以生效
            this.network.redraw();
            console.log('已应用本地保存的节点位置');
        } catch (e) {
            console.warn('应用已保存节点位置失败:', e);
        }
    }

    /**
     * 显示节点提示
     * @param {Object} portData - 端口数据
     */
    showTooltip(portData) {
        // 移除已存在的提示框
        this.hideTooltip();
        
        // 创建提示框元素
        const tooltip = document.createElement('div');
        tooltip.id = 'port-tooltip';
        tooltip.className = 'node-tooltip';
        
        // 生成提示内容
        let tooltipContent = `
            <div class="tooltip-header">端口信息</div>
            <div class="tooltip-content">
                <div><strong>设备:</strong> ${portData.deviceName || '未知'}</div>
                <div><strong>端口:</strong> ${portData.portName || '未知'}</div>
                <div><strong>端口类型:</strong> ${portData.portType || '未知'}</div>
                ${portData.voltage ? `<div><strong>电压等级:</strong> ${portData.voltage}</div>` : ''}
                ${portData.current ? `<div><strong>额定电流:</strong> ${portData.current}</div>` : ''}
                ${portData.status ? `<div><strong>状态:</strong> ${portData.status}</div>` : ''}
                ${portData.remark ? `<div><strong>备注:</strong> ${portData.remark}</div>` : ''}
            </div>
        `;
        
        tooltip.innerHTML = tooltipContent;
        
        // 设置提示框位置 - 跟随鼠标位置
        const updateTooltipPosition = (event) => {
            tooltip.style.position = 'absolute';
            tooltip.style.left = (event.clientX + 10) + 'px';
            tooltip.style.top = (event.clientY - 10) + 'px';
            tooltip.style.zIndex = '9999';
        };
        
        // 初始位置设置
        document.addEventListener('mousemove', updateTooltipPosition);
        tooltip.addEventListener('remove', () => {
            document.removeEventListener('mousemove', updateTooltipPosition);
        });
        
        // 添加到页面
        document.body.appendChild(tooltip);
        
        console.log('显示端口提示:', portData);
    }

    /**
     * 隐藏提示
     */
    hideTooltip() {
        const existingTooltip = document.getElementById('port-tooltip');
        if (existingTooltip) {
            existingTooltip.remove();
        }
        console.log('隐藏端口提示');
    }

    /**
     * 显示节点详情
     */
    showNodeDetails(nodeData) {
        console.log('显示节点详情:', nodeData);
        
        // 创建详情弹窗
        const modal = document.createElement('div');
        modal.className = 'modal fade';
        modal.id = 'nodeDetailsModal';
        modal.innerHTML = `
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">节点详情</h5>
                        <button type="button" class="close" data-dismiss="modal">
                            <span>&times;</span>
                        </button>
                    </div>
                    <div class="modal-body">
                        <div class="row">
                            <div class="col-md-6">
                                <h6>基本信息</h6>
                                <table class="table table-sm">
                                    <tr><td><strong>节点ID:</strong></td><td>${nodeData.id || '未知'}</td></tr>
                                    <tr><td><strong>节点名称:</strong></td><td>${nodeData.label || '未知'}</td></tr>
                                    <tr><td><strong>节点类型:</strong></td><td>${nodeData.type || '未知'}</td></tr>
                                    ${nodeData.device_name ? `<tr><td><strong>设备名称:</strong></td><td>${nodeData.device_name}</td></tr>` : ''}
                                    ${nodeData.port_name ? `<tr><td><strong>端口名称:</strong></td><td>${nodeData.port_name}</td></tr>` : ''}
                                </table>
                            </div>
                            <div class="col-md-6">
                                <h6>技术参数</h6>
                                <table class="table table-sm">
                                    ${nodeData.voltage ? `<tr><td><strong>电压等级:</strong></td><td>${nodeData.voltage}</td></tr>` : ''}
                                    ${nodeData.current ? `<tr><td><strong>额定电流:</strong></td><td>${nodeData.current}</td></tr>` : ''}
                                    ${nodeData.power ? `<tr><td><strong>功率:</strong></td><td>${nodeData.power}</td></tr>` : ''}
                                    ${nodeData.status ? `<tr><td><strong>状态:</strong></td><td>${nodeData.status}</td></tr>` : ''}
                                    ${nodeData.remark ? `<tr><td><strong>备注:</strong></td><td>${nodeData.remark}</td></tr>` : ''}
                                </table>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-dismiss="modal">关闭</button>
                    </div>
                </div>
            </div>
        `;
        
        // 移除已存在的弹窗
        const existingModal = document.getElementById('nodeDetailsModal');
        if (existingModal) {
            existingModal.remove();
        }
        // 添加到页面并显示
        document.body.appendChild(modal);
        if (typeof $ !== 'undefined' && $.fn && $.fn.modal) {
            $(modal).modal('show');
            $(modal).on('hidden.bs.modal', function() {
                modal.remove();
            });
        } else {
            // 若无Bootstrap环境，降级为可关闭的纯JS弹窗
            modal.style.display = 'block';
            modal.style.position = 'fixed';
            modal.style.inset = '0';
            modal.style.zIndex = '9999';
            modal.style.background = 'rgba(0,0,0,0.3)';
            const dialog = modal.querySelector('.modal-dialog');
            if (dialog) dialog.style.margin = '10% auto';
            const doClose = () => { try { modal.remove(); } catch (_) {} };
            const closeBtn = modal.querySelector('.close');
            const footerCloseBtn = modal.querySelector('[data-dismiss="modal"]');
            if (closeBtn) closeBtn.addEventListener('click', doClose);
            if (footerCloseBtn) footerCloseBtn.addEventListener('click', doClose);
            modal.addEventListener('click', (e) => { if (e.target === modal) doClose(); });
            document.addEventListener('keydown', function escHandler(e) {
                if (e.key === 'Escape') {
                    document.removeEventListener('keydown', escHandler);
                    doClose();
                }
            });
        }
    }

    // 打开节点配置（当前先复用详情弹窗）
    openNodeConfig(nodeData) {
        console.log('打开节点配置:', nodeData);
        this.showNodeDetails(nodeData);
    }

    // 显示加载（使用遮罩层，不覆盖网络图内容）
    showLoading() {
        if (this.container) {
            const overlayId = 'topology-loading-overlay';
            let overlay = this.container.querySelector(`#${overlayId}`);
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.id = overlayId;
                overlay.style.position = 'absolute';
                overlay.style.inset = '0';
                overlay.style.background = 'rgba(255,255,255,0.85)';
                overlay.style.zIndex = '10';
                overlay.style.display = 'flex';
                overlay.style.alignItems = 'center';
                overlay.style.justifyContent = 'center';
                overlay.innerHTML = '<div class="d-flex justify-content-center align-items-center"><div class="spinner-border" role="status"><span class="visually-hidden">Loading...</span></div><strong class="ms-3">正在加载端口拓扑图...</strong></div>';
                this.container.appendChild(overlay);
            } else {
                overlay.style.display = 'flex';
            }
        }
    }

    // 隐藏加载（移除遮罩层）
    hideLoading() {
        if (this.container) {
            const overlay = this.container.querySelector('#topology-loading-overlay');
            if (overlay) overlay.remove();
        }
    }

    // 显示错误（使用遮罩层）
    showError(message) {
        console.error('PortTopologyManager Error:', message);
        if (this.container) {
            const loading = this.container.querySelector('#topology-loading-overlay');
            if (loading) loading.remove();
            const errorId = 'topology-error-overlay';
            let overlay = this.container.querySelector(`#${errorId}`);
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.id = errorId;
                overlay.style.position = 'absolute';
                overlay.style.inset = '0';
                overlay.style.background = 'rgba(255,255,255,0.9)';
                overlay.style.zIndex = '10';
                overlay.style.display = 'flex';
                overlay.style.alignItems = 'center';
                overlay.style.justifyContent = 'center';
                overlay.innerHTML = `<div class="alert alert-warning m-3" role="alert">\n                    加载端口拓扑图时发生错误，请稍后重试。<br>\n                    <small class="text-muted">错误详情: ${message}</small>\n                </div>`;
                this.container.appendChild(overlay);
            } else {
                overlay.style.display = 'flex';
            }
        }
    }

    // 重复方法已移除：统一使用设备+布局维度的存储与应用实现（见前文 getPositionStorageKey / getSavedPositions / setSavedPositions / applySavedNodePositions）

    // 记录错误
    async logError(category, level, message, context) {
        try {
            const formData = new FormData();
            formData.append('category', category);
            formData.append('level', level);
            formData.append('message', message);
            formData.append('context', JSON.stringify(context || {}));
            await fetch('/api/log-error', { method: 'POST', body: formData });
        } catch (error) {
            console.error('记录错误失败:', error);
        }
    }

    // 切换全屏（旧版保留为 Legacy，避免覆盖新版实现）
    toggleFullscreenLegacy() {
        this.isFullscreen = !this.isFullscreen;
        if (this.container) {
            if (this.isFullscreen) {
                this.container.classList.add('fullscreen-topology');
            } else {
                this.container.classList.remove('fullscreen-topology');
            }
            setTimeout(() => {
                if (this.network) {
                    this.network.redraw();
                    this.network.fit();
                }
            }, 100);
        }
    }

    // 新增：与CSS匹配的全屏开关（graph.html 已调用此方法）
    toggleFullscreen() {
        if (!this.container) return;
        this.isFullscreen = !this.isFullscreen;
        const cls = 'fullscreen';
        this.container.classList.toggle(cls, this.isFullscreen);
        try {
            if (this.isFullscreen) {
                if (this.container.requestFullscreen) this.container.requestFullscreen();
            } else if (document.fullscreenElement) {
                if (document.exitFullscreen) document.exitFullscreen();
            }
        } catch (_) {}
        setTimeout(() => {
            if (this.network) {
                this.network.redraw();
                this.network.fit();
            }
        }, 120);
    }

    // 新版布局：禁用 hierarchical，使用容器尺寸驱动的自定义坐标（LR/UD），并保持拖拽与位置保存
    updateLayout(layoutType) {
        if (!this.network) {
            console.warn('网络图未初始化');
            return;
        }
        // 记录当前布局
        this.currentLayout = layoutType;
        console.log('更新端口拓扑图布局(新):', layoutType);

        // 基础设置：禁用物理引擎与平滑，避免自动重排；保留边箭头等配置
        this.network.setOptions({
            layout: { improvedLayout: false, hierarchical: { enabled: false } },
            physics: { enabled: false },
            edges: { smooth: { enabled: false }, arrows: { to: { enabled: true } } }
        });

        const containerW = (this.container && this.container.clientWidth) || 1000;
        const containerH = (this.container && this.container.clientHeight) || 600;
        const centerX = Math.round(containerW / 2);
        const centerY = Math.round(containerH / 2);

        const nodesArr = this.nodes.get();
        const edgesArr = this.edges.get();
        const byId = new Map(nodesArr.map(n => [String(n.id), n]));

        // 构建无向邻接表
        const neighbors = new Map();
        const addNeighbor = (a, b) => {
            const A = String(a), B = String(b);
            if (!neighbors.has(A)) neighbors.set(A, new Set());
            if (!neighbors.has(B)) neighbors.set(B, new Set());
            neighbors.get(A).add(B);
            neighbors.get(B).add(A);
        };
        for (const e of edgesArr) {
            if (e && e.from != null && e.to != null) addNeighbor(e.from, e.to);
        }

        const isDevice = (n) => n && n.nodeData && (String(n.nodeData.nodeType).toLowerCase() === 'device' || String(n.nodeData.type).toLowerCase() === 'device');
        const isPort = (n) => n && n.nodeData && (String(n.nodeData.nodeType).toLowerCase() === 'port' || String(n.nodeData.type).toLowerCase() === 'port');
        const isRemoteDevice = (n) => n && n.nodeData && (String(n.nodeData.nodeType).toLowerCase() === 'remote_device' || String(n.nodeData.type).toLowerCase() === 'remote_device');

        // 选定中心设备：优先匹配当前 deviceId，其次首个 device
        let centerNode = nodesArr.find(n => isDevice(n) && (String(n.nodeData.id || n.nodeData.device_id || n.id) === String(this.currentDeviceId)));
        if (!centerNode) centerNode = nodesArr.find(isDevice) || nodesArr[0];
        if (!centerNode) {
            console.warn('未找到中心设备节点，跳过布局');
            return;
        }

        // 本端端口：与中心设备直接相邻的端口
        const neighborIds = Array.from((neighbors.get(String(centerNode.id)) || new Set()).values());
        const localPorts = neighborIds.map(id => byId.get(String(id))).filter(isPort);

        // 针对每个本端端口，寻找对端（远端端口或设备）
        const portPairRows = [];
        for (const lp of localPorts) {
            const lpNeighbors = Array.from((neighbors.get(String(lp.id)) || new Set()).values());
            const remoteCandidates = lpNeighbors.map(id => byId.get(String(id))).filter(n => n && n.id !== centerNode.id);
            // 过滤非法对端（例如名称为 nan/null/未知站点 等），并允许端口或设备作为对端
        // 放宽无效判断，避免误删“远端端口”节点
        const isInvalidName = (txt) => {
            // 允许缺失字段，通过节点类型与其他字段判定有效性
            if (txt === null || txt === undefined) return false;
            const t = String(txt).trim().toLowerCase();
            return t === 'nan' || t === 'null' || t === 'none' || t === '' || t === '未知站点';
        };
        const isInvalidNode = (n) => {
            const nd = n?.nodeData || {};
            const typeStr = String(nd.nodeType || nd.type || '').toLowerCase();
            // 端口节点始终有效（即使内部label被外部侧标签取代）
            if (typeStr === 'port') return false;
            const labelInvalid = isInvalidName(n?.label);
            const nameInvalid = isInvalidName(nd.device_name || nd.name || nd.deviceName);
            return labelInvalid && nameInvalid;
        };
        const remotes = remoteCandidates.filter(n => (isPort(n) || isRemoteDevice(n) || isDevice(n)) && !isInvalidNode(n));
            portPairRows.push({ localPort: lp, remotes });
        }

        // 禁用自动补线：严格按“连接表”是否有电缆类型来画边
        const ENABLE_AUTO_FALLBACK_EDGES = false;
        if (ENABLE_AUTO_FALLBACK_EDGES) {
            try {
                const isValidPortName = (name) => {
                    const s = String(name || '').trim().toLowerCase();
                    return s !== '' && !['nan','null','none','未知端口','未知站点'].includes(s);
                };
                const sanitize = (v) => String(v ?? '').trim();
                const parseCombinedLabel = (node) => {
                    // remote_combined_* 节点的 label 形如 “设备-端口”，尽量解析出二者
                    const raw = sanitize(node?.label || '');
                    const parts = raw.split('\n').pop().split('-');
                    if (parts.length >= 2) {
                        const device = sanitize(parts[0]);
                        const port = sanitize(parts.slice(1).join('-'));
                        return { device, port };
                    }
                    return { device: sanitize(node?.nodeData?.device_name || node?.nodeData?.deviceName || ''),
                             port: sanitize(node?.nodeData?.port_name || node?.nodeData?.portName || '') };
                };
                const deviceOf = (n) => sanitize(n?.nodeData?.device_name || n?.nodeData?.deviceName || '');
                const portOf = (n) => sanitize(n?.nodeData?.port_name || n?.nodeData?.portName || '');

                // 严格遵循数据源，不进行任何自动补线或端口匹配。
            } catch (e) { console.warn('补充回退连线失败:', e); }
        }

        // 布局参数
        const colGap = Math.max(180, Math.round(containerW * 0.18));
        const rowGap = 80; // 行间距
        const half = Math.ceil(localPorts.length / 2);
        const leftRows = portPairRows.slice(0, half);
        const rightRows = portPairRows.slice(half);
        const startYLeft = centerY - Math.round(((leftRows.length - 1) * rowGap) / 2);
        const startYRight = centerY - Math.round(((rightRows.length - 1) * rowGap) / 2);

        // 准备坐标集合
        const updates = [];
        // 侧边标签节点集合
        const sideLabelNodes = [];
        const toVerticalLabel = (txt) => {
            const s = String(txt || '');
            // 将文本按字符拆分并加入换行，以模拟竖排效果
            return s.split('').join('\n');
        };
        const addSideLabel = (node, x, y, side, vertical = false) => {
            if (!node) return;
            const labelId = `label_${node.id}`;
            // 统一侧边标签：优先“设备-端口”单行；无端口则仅设备名
            const sanitize = (v) => String(v ?? '').replace(/_/g, '').trim();
            const dev = sanitize(node?.nodeData?.device_name || node?.nodeData?.name || node?.nodeData?.deviceName || node?.label);
            const port = sanitize(node?.nodeData?.port_name || node?.nodeData?.portName);
            let baseText = [dev, port].filter(Boolean).join('-') || dev || '';
            const text = vertical ? toVerticalLabel(baseText) : baseText;
            const offsetX = side === 'left' ? -70 : side === 'right' ? 70 : 0;
            const offsetY = side === 'top' ? -40 : side === 'bottom' ? 40 : 0;
            sideLabelNodes.push({
                id: labelId,
                label: text,
                shape: 'box',
                size: 1,
                x: x + offsetX,
                y: y + offsetY,
                // 在浅色背景下提高可读性：半透明白底 + 深色字体
                color: { background: 'rgba(255,255,255,0.85)', border: 'rgba(0,0,0,0.1)' },
                font: { size: 11, color: '#333333' },
                physics: false,
                fixed: { x: false, y: false }
            });
            // 仅对端口节点隐藏内置标签，避免重叠；设备保持原标签用于有效性判断
            const typeStr = String(node?.nodeData?.nodeType || node?.nodeData?.type || '').toLowerCase();
            if (typeStr === 'port') {
                updates.push({ id: node.id, label: '' });
            }
        };

        if (layoutType === 'hierarchicalLR') {
            // 中心设备居中
            updates.push({ id: centerNode.id, x: centerX, y: centerY, fixed: { x: false, y: false } });
            // 左半列：本端端口在左，对端在右
            leftRows.forEach((row, idx) => {
                const y = startYLeft + idx * rowGap;
                if (row.localPort) updates.push({ id: row.localPort.id, x: centerX - colGap, y, fixed: { x: false, y: false } });
                row.remotes.forEach((r, jdx) => {
                    const x = centerX - colGap - (jdx + 1) * 140; // 对端与本端同侧，向更左延伸
                    updates.push({ id: r.id, x, y, fixed: { x: false, y: false } });
                    // 左侧行：标签显示在节点左侧
                    addSideLabel(r, x, y, 'left', false);
                });
            });
            // 右半列：本端端口在右，对端在左（保持左右均衡）
            rightRows.forEach((row, idx) => {
                const y = startYRight + idx * rowGap;
                if (row.localPort) updates.push({ id: row.localPort.id, x: centerX + colGap, y, fixed: { x: false, y: false } });
                row.remotes.forEach((r, jdx) => {
                    const x = centerX + colGap + (jdx + 1) * 140; // 对端与本端同侧，向更右延伸
                    updates.push({ id: r.id, x, y, fixed: { x: false, y: false } });
                    // 右侧行：标签显示在节点右侧
                    addSideLabel(r, x, y, 'right', false);
                });
            });
        } else if (layoutType === 'hierarchicalUD') {
            // 中心设备居中
            updates.push({ id: centerNode.id, x: centerX, y: centerY, fixed: { x: false, y: false } });
            // 上半部：本端端口在上，对端在下
            const startXTop = centerX - Math.round(((leftRows.length - 1) * rowGap) / 2);
            leftRows.forEach((row, idx) => {
                const x = startXTop + idx * rowGap;
                if (row.localPort) updates.push({ id: row.localPort.id, x, y: centerY - colGap, fixed: { x: false, y: false } });
                row.remotes.forEach((r, jdx) => {
                    const y = centerY - colGap - (jdx + 1) * 120; // 对端与本端同侧，向更上延伸
                    updates.push({ id: r.id, x, y, fixed: { x: false, y: false } });
                    // 上半部：标签显示在节点上方，竖排
                    addSideLabel(r, x, y, 'top', true);
                });
            });
            // 下半部：本端端口在下，对端在上
            const startXBottom = centerX - Math.round(((rightRows.length - 1) * rowGap) / 2);
            rightRows.forEach((row, idx) => {
                const x = startXBottom + idx * rowGap;
                if (row.localPort) updates.push({ id: row.localPort.id, x, y: centerY + colGap, fixed: { x: false, y: false } });
                row.remotes.forEach((r, jdx) => {
                    const y = centerY + colGap + (jdx + 1) * 120; // 对端与本端同侧，向更下延伸
                    updates.push({ id: r.id, x, y, fixed: { x: false, y: false } });
                    // 下半部：标签显示在节点下方，竖排
                    addSideLabel(r, x, y, 'bottom', true);
                });
            });
        } else if (layoutType === 'force') {
            // 回退到力导向配置
            this.updateLayoutLegacy('force');
            return;
        } else {
            console.warn('未知布局类型(新):', layoutType);
            return;
        }

        // 在应用新坐标前，先清空旧坐标，避免缓存影响
        try {
            const allNodes = this.nodes.get();
            if (Array.isArray(allNodes) && allNodes.length > 0) {
                const reset = allNodes.map(n => ({ id: n.id, x: null, y: null, fixed: { x: false, y: false } }));
                this.nodes.update(reset);
            }
        } catch (e) { console.warn('清空旧坐标失败:', e); }

        // 应用坐标前，清理旧的标签节点
        try {
            const allExisting = this.nodes.get();
            const labelIds = allExisting.filter(n => String(n.id).startsWith('label_')).map(n => n.id);
            if (labelIds.length > 0) this.nodes.remove(labelIds);
        } catch (e) { console.warn('清理旧标签节点失败:', e); }

        // 应用坐标
        this.nodes.update(updates);
        for (const u of updates) {
            try { this.network.moveNode(u.id, u.x, u.y); } catch (e) {}
        }

        // 添加并定位侧边标签节点
        if (sideLabelNodes.length > 0) {
            this.nodes.update(sideLabelNodes);
            for (const l of sideLabelNodes) {
                try { this.network.moveNode(l.id, l.x, l.y); } catch (e) {}
            }
        }

        // 优先恢复本地保存位置（若存在且未被要求跳过），以遵循用户拖拽偏好
        if (!this.skipApplySavedPositionsOnce) {
            this.applySavedNodePositions();
        } else {
            this.skipApplySavedPositionsOnce = false;
        }

        // 重绘与自适应
        this.network.redraw();
        setTimeout(() => this.network.fit(), 100);
    }

    // 更新布局（旧版保留为 Legacy，避免覆盖新版实现）
    updateLayoutLegacy(layoutType) {
        if (!this.network) {
            console.warn('网络图未初始化');
            return;
        }
        // 记录当前布局
        this.currentLayout = layoutType;
        console.log('更新端口拓扑图布局:', layoutType);

        // 切换布局前清空坐标与固定状态，确保重新布局生效
        try {
            const allNodes = this.nodes.get();
            if (Array.isArray(allNodes) && allNodes.length > 0) {
                const resetNodes = allNodes.map(n => ({ id: n.id, x: null, y: null, fixed: { x: false, y: false } }));
                this.nodes.update(resetNodes);
            }
        } catch (e) {
            console.warn('清除节点坐标失败:', e);
        }

        let newOptions = {};
        switch (layoutType) {
            case 'hierarchicalLR':
                newOptions = {
                    layout: {
                        improvedLayout: true,
                        hierarchical: {
                            enabled: true,
                            direction: 'LR',
                            sortMethod: 'directed',
                            levelSeparation: 160,
                            nodeSpacing: 120,
                            treeSpacing: 220
                        }
                    },
                    edges: { smooth: { enabled: false } },
                    physics: { enabled: false }
                };
                break;
            case 'hierarchicalUD':
                newOptions = {
                    layout: {
                        improvedLayout: true,
                        hierarchical: {
                            enabled: true,
                            direction: 'UD',
                            sortMethod: 'directed',
                            levelSeparation: 120,
                            nodeSpacing: 140,
                            treeSpacing: 220
                        }
                    },
                    edges: { smooth: { enabled: false } },
                    physics: { enabled: false }
                };
                break;
            case 'force':
                newOptions = {
                    layout: {
                        improvedLayout: false,
                        hierarchical: { enabled: false }
                    },
                    edges: { smooth: { enabled: true, type: 'continuous', roundness: 0.2 } },
                    physics: {
                        enabled: true,
                        solver: 'forceAtlas2Based',
                        forceAtlas2Based: {
                            gravitationalConstant: -30,
                            centralGravity: 0.02,
                            springLength: 85,
                            springConstant: 0.12,
                            damping: 0.55,
                            avoidOverlap: 0.8
                        },
                        stabilization: { enabled: true, iterations: 900, updateInterval: 50 }
                    }
                };
                break;
            default:
                console.warn('未知的布局类型:', layoutType);
                return;
        }
        // 应用新的配置
        this.network.setOptions(newOptions);
        // 让 Network 重新读取 DataSet，避免内部缓存旧坐标
        this.network.setData({ nodes: this.nodes, edges: this.edges });
        // 触发重绘与必要的稳定过程
        if (newOptions.physics && newOptions.physics.enabled) {
            this.network.stabilize(200);
        }
        this.network.redraw();
        setTimeout(() => this.network.fit(), 100);
    }

    // 销毁（旧版保留为 Legacy，避免覆盖新版实现）
    destroyLegacy() {
        if (this.network) {
            this.network.destroy();
            this.network = null;
        }
        this.nodes.clear();
        this.edges.clear();
        this.container = null;
        this.currentDeviceId = null;
    }
}

// 全局端口拓扑管理器实例初始化位置已统一至文件末尾（幂等），此处移除以避免重复与语法错误


/**
 * 端口拓扑图功能模块
 * 实现端口级别的网络可视化
 */

class PortTopologyManager_Backup3 {
    constructor() {
        this.network = null;
        this.nodes = new vis.DataSet();
        this.edges = new vis.DataSet();
        this.container = null;
        this.currentDeviceId = null;
        this.isFullscreen = false;
        // 新增：记录当前布局类型，便于拖拽事件依据布局动态调整物理引擎
        this.currentLayout = null;
        
        // 端口拓扑图配置
        this.options = {
            interaction: {
                dragNodes: true,    // 允许拖拽节点
                dragView: true,     // 允许拖拽视图
                hover: true,        // 允许悬停
                zoomView: true,     // 允许缩放
                selectConnectedEdges: false,
                multiselect: true
            },
            physics: {
                enabled: false      // 默认禁用物理引擎，启用自由拖拽
            },
            nodes: {
                shape: 'box',
                margin: 8,
                widthConstraint: {
                    minimum: 80,
                    maximum: 120
                },
                heightConstraint: {
                    minimum: 30
                },
                font: {
                    size: 12,
                    face: 'Arial',
                    align: 'center'
                },
                borderWidth: 2,
                shadow: {
                    enabled: true,
                    color: 'rgba(0,0,0,0.2)',
                    size: 5,
                    x: 2,
                    y: 2
                }
            },
            edges: {
                width: 2,
                color: {
                    color: '#2196F3',
                    highlight: '#FF5722',
                    hover: '#FF9800'
                },
                smooth: {
                    enabled: true,
                    type: 'continuous',
                    roundness: 0.2
                },
                arrows: {
                    to: {
                        enabled: false
                    }
                },
                font: {
                    size: 10,
                    align: 'middle'
                }
            },
            layout: {
                improvedLayout: false,  // 禁用改进布局，使用固定坐标
                hierarchical: {
                    enabled: false
                }
            },
            physics: {
                enabled: false  // 禁用物理引擎，启用完全自由拖拽
            },
            interaction: {
                dragNodes: true,  // 允许拖拽节点（水平和垂直方向）
                dragView: true,   // 允许拖拽视图
                zoomView: true,   // 允许缩放
                selectConnectedEdges: false
            }
        };
    }

    /**
     * 初始化端口拓扑图
     */
    initialize(containerId) {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            console.error('端口拓扑图容器未找到:', containerId);
            return false;
        }

        // 创建网络图
        const data = {
            nodes: this.nodes,
            edges: this.edges
        };
        
        this.network = new vis.Network(this.container, data, this.options);
        
        // 绑定事件
        this.bindEvents();
        
        return true;
    }

    /**
     * 绑定网络图事件
     */
    bindEvents() {
        if (!this.network) return;

        // 节点点击事件
        this.network.on('click', (params) => {
            if (params.nodes.length > 0) {
                const nodeId = params.nodes[0];
                this.onNodeClick(nodeId);
            }
        });

        // 节点双击事件
        this.network.on('doubleClick', (params) => {
            if (params.nodes.length > 0) {
                const nodeId = params.nodes[0];
                this.onNodeDoubleClick(nodeId);
            }
        });

        // 拖拽开始事件
        this.network.on('dragStart', (params) => {
            if (params.nodes.length > 0) {
                this.onDragStart(params.nodes);
            }
        });

        // 拖拽结束事件
        this.network.on('dragEnd', (params) => {
            if (params.nodes.length > 0) {
                this.onDragEnd(params.nodes);
            }
        });

        // 悬停事件
        this.network.on('hoverNode', (params) => {
            this.onNodeHover(params.node);
        });

        // 离开悬停事件
        this.network.on('blurNode', (params) => {
            this.onNodeBlur(params.node);
        });
    }

    /**
     * 加载设备的端口拓扑数据
     */
    async loadPortTopology(deviceId) {
        try {
            this.currentDeviceId = deviceId;
            
            // 显示加载状态
            this.showLoading();
            
            // 获取端口拓扑数据
            const response = await fetch(`/api/port-topology/${deviceId}`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            // 更新图形数据
            this.updateTopologyData(data);
            
            // 隐藏加载状态
            this.hideLoading();
            
        } catch (error) {
            console.error('加载端口拓扑数据失败:', error);
            this.showError('加载端口拓扑数据失败: ' + error.message);
            
            // 记录错误到后端
            this.logError('TOPOLOGY_LOAD', 'ERROR', error.message, {
                deviceId: deviceId,
                timestamp: new Date().toISOString()
            });
            // 确保异常时也结束加载态
            this.hideLoading();
        }
    }

    /**
     * 更新拓扑图数据（Legacy备份版本）
     */
    updateTopologyDataLegacy(data) {
        try {
            // 清空现有数据
            this.nodes.clear();
            this.edges.clear();
            
            // 处理后端API返回的节点数据格式 {nodes: [], edges: []}
            if (data.nodes && Array.isArray(data.nodes)) {
                // 直接使用后端返回的节点数据，这些数据已经包含了vis.js需要的格式
                const processedNodes = data.nodes.map(node => ({
                    id: node.id,
                    label: node.label,
                    title: node.title || this.generateNodeTitle(node),
                    color: node.color || this.getDefaultNodeColor(node.nodeType),
                    shape: node.shape || 'box',
                    size: node.size || 30,
                    font: node.font || { size: 12, color: '#000000' },
                    x: node.x,
                    y: node.y,
                    // 保存原始数据
                    nodeData: node
                }));
                
                // 去重并使用 update 防止重复ID导致异常
                const seenNodeIds = new Set();
                const uniqueNodes = [];
                for (const n of processedNodes) {
                    if (n && n.id != null && !seenNodeIds.has(n.id)) {
                        seenNodeIds.add(n.id);
                        uniqueNodes.push(n);
                    }
                }
                this.nodes.update(uniqueNodes);
            }
            
            // 处理后端API返回的边数据格式
            if (data.edges && Array.isArray(data.edges)) {
                // 直接使用后端返回的边数据，这些数据已经包含了vis.js需要的格式
                const processedEdges = data.edges.map(edge => ({
                    id: edge.id,
                    from: edge.from,
                    to: edge.to,
                    label: edge.label || '',
                    title: edge.title || this.generateEdgeTitle(edge),
                    color: { color: '#FF0000', highlight: '#FF0000', hover: '#FF0000' },
                    width: edge.width || 3,
                    arrows: { to: { enabled: true } },
                    // 保存原始数据
                    edgeData: edge
                }));
                
                // 去重并使用 update 防止重复ID导致异常
                const seenEdgeIds = new Set();
                const uniqueEdges = [];
                for (const e of processedEdges) {
                    if (e && e.id != null && !seenEdgeIds.has(e.id)) {
                        seenEdgeIds.add(e.id);
                        uniqueEdges.push(e);
                    }
                }
                this.edges.update(uniqueEdges);
            }
            
            // 尝试恢复已保存的节点位置（若存在）
            this.applySavedNodePositions();
            
            // 自动调整视图
            setTimeout(() => {
                if (this.network) {
                    this.network.fit();
                }
            }, 500);
            
        } catch (error) {
            console.error('更新拓扑数据失败:', error);
            this.showError('更新拓扑数据失败: ' + error.message);
        }
    }

    /**
     * 生成节点标题（悬停提示）
     */
    generateNodeTitle(node) {
        let title = `节点: ${node.label || node.id}`;
        if (node.nodeType) title += `\n类型: ${node.nodeType}`;
        if (node.deviceType) title += `\n设备类型: ${node.deviceType}`;
        if (node.station) title += `\n站点: ${node.station}`;
        if (node.portName) title += `\n端口: ${node.portName}`;
        if (node.portCount) title += `\n端口数: ${node.portCount}`;
        return title;
    }

    /**
     * 生成边标题（悬停提示）
     */
    generateEdgeTitle(edge) {
        let title = `连接: ${edge.from} -> ${edge.to}`;
        if (edge.connection_type) title += `\n类型: ${edge.connection_type}`;
        if (edge.cable_model) title += `\n线缆型号: ${edge.cable_model}`;
        if (edge.cable_type) title += `\n线缆类型: ${edge.cable_type}`;
        if (edge.remark) title += `\n备注: ${edge.remark}`;
        return title;
    }

    /**
     * 获取默认节点颜色
     */
    getDefaultNodeColor(nodeType) {
        const colors = {
            'device': '#97C2FC',      // 蓝色 - 设备
            'port': '#FFA500',        // 橙色 - 端口
            'remote_device': '#90EE90', // 浅绿色 - 远程设备
            'bus': '#FFB6C1'          // 浅粉色 - 总线
        };
        
        return {
            background: colors[nodeType] || colors.device,
            border: '#2B7CE9',
            highlight: {
                background: colors[nodeType] || colors.device,
                border: '#000000'
            }
        };
    }

    /**
     * 获取端口颜色
     */
    getPortColor(status) {
        const colors = {
            'active': '#4CAF50',    // 绿色 - 活跃
            'inactive': '#9E9E9E',  // 灰色 - 非活跃
            'error': '#F44336',     // 红色 - 错误
            'warning': '#FF9800',   // 橙色 - 警告
            'unknown': '#607D8B'    // 蓝灰色 - 未知
        };
        
        return {
            background: colors[status] || colors.unknown,
            border: '#333333',
            highlight: {
                background: colors[status] || colors.unknown,
                border: '#000000'
            }
        };
    }

    /**
     * 获取连接颜色
     */
    getConnectionColor(status) {
        const colors = {
            'active': '#4CAF50',
            'inactive': '#9E9E9E',
            'error': '#F44336',
            'warning': '#FF9800'
        };
        
        return colors[status] || '#2196F3';
    }

    /**
     * 节点点击处理
     */
    onNodeClick(nodeId) {
        const node = this.nodes.get(nodeId);
        if (node && node.nodeData) {
            this.showNodeDetails(node.nodeData);
        }
    }

    /**
     * 节点双击处理
     */
    onNodeDoubleClick(nodeId) {
        const node = this.nodes.get(nodeId);
        if (node && node.nodeData) {
            // 双击可以打开节点配置界面或显示详细信息
            this.openNodeConfig(node.nodeData);
        }
    }

    /**
     * 拖拽开始处理
     */
    onDragStart(nodeIds) {
        // 根据当前布局决定物理引擎状态
        if (this.currentLayout === 'force') {
            // 力导向布局下，保持物理引擎启用，以便拖拽后继续收敛
            this.network.setOptions({ physics: { enabled: true } });
        } else {
            // 非力导向布局禁用物理引擎，保证位置固定、拖拽稳定
            this.network.setOptions({ physics: { enabled: false } });
        }
    }

    /**
     * 拖拽结束处理
     */
    onDragEnd(nodeIds) {
        // 根据当前布局决定物理引擎状态
        if (this.currentLayout === 'force') {
            // 维持物理引擎启用，并进行短暂稳定以加速收敛
            this.network.setOptions({ physics: { enabled: true } });
            this.network.stabilize(100);
        } else {
            // 非力导向布局保持禁用，位置不被算法更改
            this.network.setOptions({ physics: { enabled: false } });
        }
        // 保存节点位置
        this.saveNodePositions(nodeIds);
    }

    /**
     * 节点悬停处理
     */
    onNodeHover(nodeId) {
        const node = this.nodes.get(nodeId);
        if (node && node.portData) {
            // 显示详细信息提示
            this.showTooltip(node.portData);
        }
    }

    /**
     * 节点离开悬停处理
     */
    onNodeBlur(nodeId) {
        // 隐藏提示
        this.hideTooltip();
    }

    /**
     * 显示端口详情
     */
    showPortDetails(portData) {
        // 实现端口详情显示逻辑
        console.log('显示端口详情:', portData);
    }

    /**
     * 打开端口配置
     */
    openPortConfig(portData) {
        // 实现端口配置界面
        console.log('打开端口配置:', portData);
    }

    /**
     * 保存节点位置
     */
    saveNodePositions(nodeIds) {
        // 实现节点位置保存逻辑（本地存储，按设备与布局区分）
        try {
            if (!this.network || !this.nodes || !Array.isArray(nodeIds) || nodeIds.length === 0) return;
            if (!this.currentDeviceId || !this.currentLayout) {
                console.warn('保存节点位置时缺少当前设备或布局信息');
            }
            const key = this.getPositionStorageKey();
            const existing = this.getSavedPositions();
            const posMap = this.network.getPositions(nodeIds);
            // 合并到 existing
            for (const nid of Object.keys(posMap)) {
                const p = posMap[nid];
                if (p && typeof p.x === 'number' && typeof p.y === 'number') {
                    existing[nid] = { x: p.x, y: p.y };
                }
            }
            this.setSavedPositions(existing);
                        console.log('已保存节点位置到本地存储:', key);

        } catch (e) {
            console.warn('保存节点位置失败:', e);
        }
    }

    // 新增：根据设备与布局生成存储键，确保不同设备/布局的位置互不干扰
    getPositionStorageKey() {
        try {
            const devicePart = this.currentDeviceId ? String(this.currentDeviceId) : 'unknown_device';
            const layoutPart = this.currentLayout ? String(this.currentLayout) : 'unknown_layout';
            return `portTopologyPositions:${devicePart}:${layoutPart}`;
        } catch (e) {
            console.warn('生成存储键失败:', e);
            return 'portTopologyPositions:unknown_device:unknown_layout';
        }
    }

    // 新增：获取本地已保存的节点位置
    getSavedPositions() {
        try {
            const key = this.getPositionStorageKey();
            const raw = localStorage.getItem(key);
            if (!raw) return {};
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') return parsed;
            return {};
        } catch (e) {
            console.warn('读取已保存节点位置失败:', e);
            return {};
        }
    }

    // 新增：写入本地节点位置
    setSavedPositions(positions) {
        try {
            const key = this.getPositionStorageKey();
            localStorage.setItem(key, JSON.stringify(positions || {}));
        } catch (e) {
            console.warn('写入节点位置失败:', e);
        }
    }

    // 新增：应用本地已保存的节点位置，并固定坐标
    applySavedNodePositions() {
        try {
            if (!this.network || !this.nodes) return;
            const saved = this.getSavedPositions();
            const ids = Object.keys(saved || {});
            if (ids.length === 0) return;
            // 关闭物理引擎，避免自动重排
            this.network.setOptions({ physics: { enabled: false } });
            for (const id of ids) {
                const p = saved[id];
                if (!p || typeof p.x !== 'number' || typeof p.y !== 'number') continue;
                // 更新数据集中的坐标并固定节点
                if (this.nodes.get(id)) {
                    this.nodes.update({ id, x: p.x, y: p.y, fixed: { x: true, y: true } });
                }
                // 强制网络对象移动到指定坐标
                this.network.moveNode(id, p.x, p.y);
            }
            // 重绘以生效
            this.network.redraw();
            console.log('已应用本地保存的节点位置');
        } catch (e) {
            console.warn('应用已保存节点位置失败:', e);
        }
    }

    /**
     * 显示节点提示（端口级）
     * @param {Object} portData - 端口数据
     */
    showTooltip(portData) {
        // 移除已存在的提示框
        this.hideTooltip();
        if (!portData) return;
        // 创建提示框元素
        const tooltip = document.createElement('div');
        tooltip.id = 'port-tooltip';
        tooltip.className = 'node-tooltip';

        // 生成提示内容
        let tooltipContent = `
            <div class="tooltip-header">端口信息</div>
            <div class="tooltip-content">
                <div><strong>设备:</strong> ${portData.deviceName || portData.device_name || '未知'}</div>
                <div><strong>端口:</strong> ${portData.portName || portData.port_name || '未知'}</div>
                <div><strong>端口类型:</strong> ${portData.portType || portData.port_type || '未知'}</div>
                ${portData.voltage ? `<div><strong>电压等级:</strong> ${portData.voltage}</div>` : ''}
                ${portData.current ? `<div><strong>额定电流:</strong> ${portData.current}</div>` : ''}
                ${portData.status ? `<div><strong>状态:</strong> ${portData.status}</div>` : ''}
                ${portData.remark ? `<div><strong>备注:</strong> ${portData.remark}</div>` : ''}
            </div>
        `;
        tooltip.innerHTML = tooltipContent;

        // 设置提示框位置 - 跟随鼠标位置
        const updateTooltipPosition = (event) => {
            tooltip.style.position = 'absolute';
            tooltip.style.left = (event.clientX + 10) + 'px';
            tooltip.style.top = (event.clientY - 10) + 'px';
            tooltip.style.zIndex = '9999';
        };
        document.addEventListener('mousemove', updateTooltipPosition);
        tooltip.addEventListener('remove', () => {
            document.removeEventListener('mousemove', updateTooltipPosition);
        });

        // 添加到页面
        document.body.appendChild(tooltip);
        console.log('显示端口提示:', portData);
    }

    // 隐藏提示
    hideTooltip() {
        const existingTooltip = document.getElementById('port-tooltip');
        if (existingTooltip) {
            existingTooltip.remove();
        }
    }

    // 显示节点详情（通用节点信息弹窗）
    showNodeDetails(nodeData) {
        console.log('显示节点详情:', nodeData);
        if (!nodeData) return;
        // 创建详情弹窗
        const modal = document.createElement('div');
        modal.className = 'modal fade';
        modal.id = 'nodeDetailsModal';
        modal.innerHTML = `
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">节点详情</h5>
                        <button type="button" class="close" data-dismiss="modal">
                            <span>&times;</span>
                        </button>
                    </div>
                    <div class="modal-body">
                        <div class="row">
                            <div class="col-md-6">
                                <h6>基本信息</h6>
                                <table class="table table-sm">
                                    <tr><td><strong>节点ID:</strong></td><td>${nodeData.id || '未知'}</td></tr>
                                    <tr><td><strong>节点名称:</strong></td><td>${nodeData.label || nodeData.name || '未知'}</td></tr>
                                    <tr><td><strong>节点类型:</strong></td><td>${nodeData.type || nodeData.nodeType || '未知'}</td></tr>
                                    ${nodeData.device_name ? `<tr><td><strong>设备名称:</strong></td><td>${nodeData.device_name}</td></tr>` : ''}
                                    ${nodeData.port_name ? `<tr><td><strong>端口名称:</strong></td><td>${nodeData.port_name}</td></tr>` : ''}
                                </table>
                            </div>
                            <div class="col-md-6">
                                <h6>技术参数</h6>
                                <table class="table table-sm">
                                    ${nodeData.voltage ? `<tr><td><strong>电压等级:</strong></td><td>${nodeData.voltage}</td></tr>` : ''}
                                    ${nodeData.current ? `<tr><td><strong>额定电流:</strong></td><td>${nodeData.current}</td></tr>` : ''}
                                    ${nodeData.power ? `<tr><td><strong>功率:</strong></td><td>${nodeData.power}</td></tr>` : ''}
                                    ${nodeData.status ? `<tr><td><strong>状态:</strong></td><td>${nodeData.status}</td></tr>` : ''}
                                    ${nodeData.remark ? `<tr><td><strong>备注:</strong></td><td>${nodeData.remark}</td></tr>` : ''}
                                </table>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-dismiss="modal">关闭</button>
                    </div>
                </div>
            </div>
        `;

        // 移除已存在的弹窗
        const existingModal = document.getElementById('nodeDetailsModal');
        if (existingModal) {
            existingModal.remove();
        }
        // 添加到页面并显示
        document.body.appendChild(modal);
        if (typeof $ !== 'undefined' && $.fn && $.fn.modal) {
            $(modal).modal('show');
            $(modal).on('hidden.bs.modal', function() {
                modal.remove();
            });
        } else {
            // 若无Bootstrap环境，降级为简单显示
            modal.style.display = 'block';
        }
    }

    // 打开节点配置（当前先复用详情弹窗）
    openNodeConfig(nodeData) {
        console.log('打开节点配置:', nodeData);
        this.showNodeDetails(nodeData);
    }

    // 显示加载（使用遮罩层，不覆盖网络图内容）
    showLoading() {
        if (this.container) {
            const overlayId = 'topology-loading-overlay';
            let overlay = this.container.querySelector(`#${overlayId}`);
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.id = overlayId;
                overlay.style.position = 'absolute';
                overlay.style.inset = '0';
                overlay.style.background = 'rgba(255,255,255,0.85)';
                overlay.style.zIndex = '10';
                overlay.style.display = 'flex';
                overlay.style.alignItems = 'center';
                overlay.style.justifyContent = 'center';
                overlay.innerHTML = '<div class="d-flex justify-content-center align-items-center"><div class="spinner-border" role="status"><span class="visually-hidden">Loading...</span></div><strong class="ms-3">正在加载端口拓扑图...</strong></div>';
                this.container.appendChild(overlay);
            } else {
                overlay.style.display = 'flex';
            }
        }
    }

    // 隐藏加载（移除遮罩层）
    hideLoading() {
        if (this.container) {
            const overlay = this.container.querySelector('#topology-loading-overlay');
            if (overlay) overlay.remove();
        }
    }

    // 显示错误（使用遮罩层）
    showError(message) {
        console.error('PortTopologyManager Error:', message);
        if (this.container) {
            const loading = this.container.querySelector('#topology-loading-overlay');
            if (loading) loading.remove();
            const errorId = 'topology-error-overlay';
            let overlay = this.container.querySelector(`#${errorId}`);
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.id = errorId;
                overlay.style.position = 'absolute';
                overlay.style.inset = '0';
                overlay.style.background = 'rgba(255,255,255,0.9)';
                overlay.style.zIndex = '10';
                overlay.style.display = 'flex';
                overlay.style.alignItems = 'center';
                overlay.style.justifyContent = 'center';
                overlay.innerHTML = `<div class=\"alert alert-warning m-3\" role=\"alert\">\n                加载端口拓扑图时发生错误，请稍后重试。<br>\n                <small class=\"text-muted\">错误详情: ${message}</small>\n            </div>`;
                this.container.appendChild(overlay);
            } else {
                overlay.style.display = 'flex';
            }
        }
    }

    // 重复方法已移除：统一使用设备+布局维度的存储与应用实现（见前文 getPositionStorageKey / getSavedPositions / setSavedPositions / applySavedNodePositions）

    // 记录错误
    async logError(category, level, message, context) {
        try {
            const formData = new FormData();
            formData.append('category', category);
            formData.append('level', level);
            formData.append('message', message);
            formData.append('context', JSON.stringify(context || {}));
            await fetch('/api/log-error', { method: 'POST', body: formData });
        } catch (error) {
            console.error('记录错误失败:', error);
        }
    }

    // 切换全屏（旧版保留为 Legacy，避免覆盖新版实现）
    toggleFullscreenLegacy() {
        this.isFullscreen = !this.isFullscreen;
        if (this.container) {
            if (this.isFullscreen) {
                this.container.classList.add('fullscreen-topology');
            } else {
                this.container.classList.remove('fullscreen-topology');
            }
            setTimeout(() => {
                if (this.network) {
                    this.network.redraw();
                    this.network.fit();
                }
            }, 100);
        }
    }

    // 更新布局（旧版保留为 Legacy，避免覆盖新版实现）
    updateLayoutLegacy(layoutType) {
        if (!this.network) {
            console.warn('网络图未初始化');
            return;
        }
        // 记录当前布局
        this.currentLayout = layoutType;
        console.log('更新端口拓扑图布局:', layoutType);

        // 切换布局前清空坐标与固定状态，确保重新布局生效
        try {
            const allNodes = this.nodes.get();
            if (Array.isArray(allNodes) && allNodes.length > 0) {
                const resetNodes = allNodes.map(n => ({ id: n.id, x: null, y: null, fixed: { x: false, y: false } }));
                this.nodes.update(resetNodes);
            }
        } catch (e) {
            console.warn('清除节点坐标失败:', e);
        }

        let newOptions = {};
        switch (layoutType) {
            case 'hierarchicalLR':
                newOptions = {
                    layout: {
                        improvedLayout: true,
                        hierarchical: {
                            enabled: true,
                            direction: 'LR',
                            sortMethod: 'directed',
                            levelSeparation: 160,
                            nodeSpacing: 120,
                            treeSpacing: 220
                        }
                    },
                    edges: { smooth: { enabled: false } },
                    physics: { enabled: false }
                };
                break;
            case 'hierarchicalUD':
                newOptions = {
                    layout: {
                        improvedLayout: true,
                        hierarchical: {
                            enabled: true,
                            direction: 'UD',
                            sortMethod: 'directed',
                            levelSeparation: 120,
                            nodeSpacing: 140,
                            treeSpacing: 220
                        }
                    },
                    edges: { smooth: { enabled: false } },
                    physics: { enabled: false }
                };
                break;
            case 'force':
                newOptions = {
                    layout: {
                        improvedLayout: false,
                        hierarchical: { enabled: false }
                    },
                    edges: { smooth: { enabled: true, type: 'continuous', roundness: 0.2 } },
                    physics: {
                        enabled: true,
                        solver: 'forceAtlas2Based',
                        forceAtlas2Based: {
                            gravitationalConstant: -30,
                            centralGravity: 0.02,
                            springLength: 85,
                            springConstant: 0.12,
                            damping: 0.55,
                            avoidOverlap: 0.8
                        },
                        stabilization: { enabled: true, iterations: 900, updateInterval: 50 }
                    }
                };
                break;
            default:
                console.warn('未知的布局类型:', layoutType);
                return;
        }
        // 应用新的配置
        this.network.setOptions(newOptions);
        // 让 Network 重新读取 DataSet，避免内部缓存旧坐标
        this.network.setData({ nodes: this.nodes, edges: this.edges });
        // 触发重绘与必要的稳定过程
        if (newOptions.physics && newOptions.physics.enabled) {
            this.network.stabilize(200);
        }
        this.network.redraw();
        setTimeout(() => this.network.fit(), 100);
    }

    // 销毁（旧版保留为 Legacy，避免覆盖新版实现）
    destroyLegacy() {
        if (this.network) {
            this.network.destroy();
            this.network = null;
        }
        this.nodes.clear();
        this.edges.clear();
        this.container = null;
        this.currentDeviceId = null;
    }
}

// 全局端口拓扑管理器实例初始化位置已统一至文件末尾（幂等），此处移除以避免重复与语法错误


/**
 * 端口拓扑图功能模块
 * 实现端口级别的网络可视化
 */

class PortTopologyManager_Backup4 {
    constructor() {
        this.network = null;
        this.nodes = new vis.DataSet();
        this.edges = new vis.DataSet();
        this.container = null;
        this.currentDeviceId = null;
        this.isFullscreen = false;
        // 新增：记录当前布局类型，便于拖拽事件依据布局动态调整物理引擎
        this.currentLayout = null;
        
        // 端口拓扑图配置
        this.options = {
            interaction: {
                dragNodes: true,    // 允许拖拽节点
                dragView: true,     // 允许拖拽视图
                hover: true,        // 允许悬停
                zoomView: true,     // 允许缩放
                selectConnectedEdges: false,
                multiselect: true
            },
            physics: {
                enabled: false      // 默认禁用物理引擎，启用自由拖拽
            },
            nodes: {
                shape: 'box',
                margin: 8,
                widthConstraint: {
                    minimum: 80,
                    maximum: 120
                },
                heightConstraint: {
                    minimum: 30
                },
                font: {
                    size: 12,
                    face: 'Arial',
                    align: 'center'
                },
                borderWidth: 2,
                shadow: {
                    enabled: true,
                    color: 'rgba(0,0,0,0.2)',
                    size: 5,
                    x: 2,
                    y: 2
                }
            },
            edges: {
                width: 2,
                color: {
                    color: '#2196F3',
                    highlight: '#FF5722',
                    hover: '#FF9800'
                },
                smooth: {
                    enabled: true,
                    type: 'continuous',
                    roundness: 0.2
                },
                arrows: {
                    to: {
                        enabled: false
                    }
                },
                font: {
                    size: 10,
                    align: 'middle'
                }
            },
            layout: {
                improvedLayout: false,  // 禁用改进布局，使用固定坐标
                hierarchical: {
                    enabled: false
                }
            },
            physics: {
                enabled: false  // 禁用物理引擎，启用完全自由拖拽
            },
            interaction: {
                dragNodes: true,  // 允许拖拽节点（水平和垂直方向）
                dragView: true,   // 允许拖拽视图
                zoomView: true,   // 允许缩放
                selectConnectedEdges: false
            }
        };
    }

    /**
     * 初始化端口拓扑图
     */
    initialize(containerId) {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            console.error('端口拓扑图容器未找到:', containerId);
            return false;
        }

        // 创建网络图
        const data = {
            nodes: this.nodes,
            edges: this.edges
        };
        
        this.network = new vis.Network(this.container, data, this.options);
        
        // 绑定事件
        this.bindEvents();
        
        return true;
    }

    /**
     * 绑定网络图事件
     */
    bindEvents() {
        if (!this.network) return;

        // 节点点击事件
        this.network.on('click', (params) => {
            if (params.nodes.length > 0) {
                const nodeId = params.nodes[0];
                this.onNodeClick(nodeId);
            }
        });

        // 节点双击事件
        this.network.on('doubleClick', (params) => {
            if (params.nodes.length > 0) {
                const nodeId = params.nodes[0];
                this.onNodeDoubleClick(nodeId);
            }
        });

        // 拖拽开始事件
        this.network.on('dragStart', (params) => {
            if (params.nodes.length > 0) {
                this.onDragStart(params.nodes);
            }
        });

        // 拖拽结束事件
        this.network.on('dragEnd', (params) => {
            if (params.nodes.length > 0) {
                this.onDragEnd(params.nodes);
            }
        });

        // 悬停事件
        this.network.on('hoverNode', (params) => {
            this.onNodeHover(params.node);
        });

        // 离开悬停事件
        this.network.on('blurNode', (params) => {
            this.onNodeBlur(params.node);
        });
    }

    /**
     * 加载设备的端口拓扑数据
     */
    async loadPortTopology(deviceId) {
        try {
            this.currentDeviceId = deviceId;
            
            // 显示加载状态
            this.showLoading();
            
            // 获取端口拓扑数据
            const response = await fetch(`/api/port-topology/${deviceId}`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            // 更新图形数据
            this.updateTopologyData(data);
            
            // 隐藏加载状态
            this.hideLoading();
            
        } catch (error) {
            console.error('加载端口拓扑数据失败:', error);
            this.showError('加载端口拓扑数据失败: ' + error.message);
            
            // 记录错误到后端
            this.logError('TOPOLOGY_LOAD', 'ERROR', error.message, {
                deviceId: deviceId,
                timestamp: new Date().toISOString()
            });
            // 确保异常时也结束加载态
            this.hideLoading();
        }
    }
}