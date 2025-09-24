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
        
        // 端口拓扑图配置
        this.options = {
            interaction: {
                dragNodes: true,
                dragView: true,
                hover: true,
                zoomView: true,
                selectConnectedEdges: false,
                multiselect: true
            },
            physics: {
                enabled: true,
                solver: 'forceAtlas2Based',
                forceAtlas2Based: {
                    gravitationalConstant: -30,
                    centralGravity: 0.01,
                    springLength: 80,
                    springConstant: 0.1,
                    damping: 0.5,
                    avoidOverlap: 0.8
                },
                stabilization: {
                    enabled: true,
                    iterations: 800,
                    updateInterval: 50
                }
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
                improvedLayout: true,
                hierarchical: {
                    enabled: false
                }
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
        }
    }

    /**
     * 更新拓扑图数据
     */
    updateTopologyData(data) {
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
                
                this.nodes.add(processedNodes);
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
                    color: edge.color || '#848484',
                    width: edge.width || 2,
                    arrows: edge.arrows || 'to',
                    // 保存原始数据
                    edgeData: edge
                }));
                
                this.edges.add(processedEdges);
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
        // 禁用物理引擎以获得更好的拖拽体验
        this.network.setOptions({
            physics: { enabled: false }
        });
    }

    /**
     * 拖拽结束处理
     */
    onDragEnd(nodeIds) {
        // 重新启用物理引擎
        this.network.setOptions({
            physics: { enabled: true }
        });
        
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
        // 实现节点位置保存逻辑
        console.log('保存节点位置:', nodeIds);
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
        $(modal).modal('show');
        
        // 弹窗关闭后移除DOM元素
        $(modal).on('hidden.bs.modal', function() {
            modal.remove();
        });
    }

    /**
     * 打开节点配置
     */
    openNodeConfig(nodeData) {
        console.log('打开节点配置:', nodeData);
        // 这里可以实现节点配置功能
        // 暂时显示详情
        this.showNodeDetails(nodeData);
    }

    /**
     * 显示加载状态
     */
    showLoading() {
        if (this.container) {
            this.container.innerHTML = '<div class="text-center p-4"><div class="spinner-border" role="status"><span class="sr-only">加载中...</span></div></div>';
        }
    }

    /**
     * 隐藏加载状态
     */
    hideLoading() {
        // 加载状态会在网络图初始化时自动清除
    }

    /**
     * 显示错误信息
     */
    showError(message) {
        if (this.container) {
            this.container.innerHTML = `<div class="alert alert-danger" role="alert">${message}</div>`;
        }
    }

    /**
     * 记录错误到后端
     */
    async logError(category, level, message, context) {
        try {
            const formData = new FormData();
            formData.append('category', category);
            formData.append('level', level);
            formData.append('message', message);
            formData.append('context', JSON.stringify(context));
            
            await fetch('/api/log-error', {
                method: 'POST',
                body: formData
            });
        } catch (error) {
            console.error('记录错误失败:', error);
        }
    }

    /**
     * 切换全屏模式
     */
    toggleFullscreen() {
        this.isFullscreen = !this.isFullscreen;
        
        if (this.isFullscreen) {
            this.container.classList.add('fullscreen-topology');
        } else {
            this.container.classList.remove('fullscreen-topology');
        }
        
        // 重新调整网络图大小
        setTimeout(() => {
            if (this.network) {
                this.network.redraw();
                this.network.fit();
            }
        }, 100);
    }

    /**
     * 销毁端口拓扑图
     */
    destroy() {
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

// 全局端口拓扑管理器实例
window.portTopologyManager = new PortTopologyManager();