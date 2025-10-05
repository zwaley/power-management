"""
端口级拓扑图服务
实现完整的端口级网络拓扑可视化功能
"""

from typing import Dict, List, Any, Optional, Tuple
from sqlalchemy.orm import Session
from models import Device, Connection
from topology_error_tracker import topology_error_tracker, ErrorCategory, ErrorLevel

class PortTopologyService:
    """端口级拓扑图服务类"""
    
    def __init__(self, db: Session):
        self.db = db
        
    def get_port_topology_data(self, device_id: int, mode: str = "detailed") -> Dict[str, Any]:
        """
        获取端口级拓扑图数据
        
        Args:
            device_id: 设备ID
            mode: 显示模式 ("detailed" | "simplified")
            
        Returns:
            包含节点和边数据的字典
        """
        try:
            # 获取设备信息
            device = self.db.query(Device).filter(Device.id == device_id).first()
            if not device:
                topology_error_tracker.log_error(
                    category=ErrorCategory.DATA_LOADING,
                    level=ErrorLevel.ERROR,
                    message=f"设备不存在: device_id={device_id}",
                    context={"device_id": device_id}
                )
                raise ValueError(f"设备不存在: {device_id}")
            
            # 获取设备的所有连接
            connections = self._get_device_connections(device_id)
            
            # 构建端口级拓扑数据
            if mode == "detailed":
                return self._build_detailed_port_topology(device, connections)
            else:
                return self._build_simplified_port_topology(device, connections)
                
        except Exception as e:
            topology_error_tracker.log_error(
                category=ErrorCategory.API_ERROR,
                level=ErrorLevel.ERROR,
                message=f"获取端口拓扑数据失败: {str(e)}",
                context={"device_id": device_id, "mode": mode},
                exception=e
            )
            raise
    
    def _get_device_connections(self, device_id: int) -> List[Connection]:
        """获取设备的所有连接"""
        return self.db.query(Connection).filter(
            (Connection.source_device_id == device_id) | 
            (Connection.target_device_id == device_id)
        ).all()
    
    def _build_detailed_port_topology(self, device: Device, connections: List[Connection]) -> Dict[str, Any]:
        """构建详细的端口级拓扑数据 - 严格按照设计规范实现左右分列布局"""
        nodes = []
        edges = []
        
        # 创建中心设备节点 - 固定在中心位置
        # 处理设备名称，去掉"未知站点"
        device_name = device.name if device.name else f"设备{device.id}"
        device_label = device_name
        # 只有当站点信息有效且不是"未知站点"时才显示
        if (device.station and 
            device.station != "未知站点" and 
            device.station.lower() != 'nan' and
            device.station.strip() != '' and
            device.station.lower() != 'none'):
            device_label = f"{device.station}\n{device_name}"
        
        center_node = {
            "id": f"device_{device.id}",
            "label": device_label,
            "type": "device",
            "level": 0,
            "x": 0,  # 中心位置
            "y": 0,  # 中心位置
            "color": {
                "background": "#3b82f6",
                "border": "#1e40af"
            },
            "font": {"color": "#ffffff"},
            "shape": "box",
            "size": 30,
            "fixed": {"x": True, "y": True}  # 固定中心设备位置
        }
        nodes.append(center_node)
        
        # 收集所有端口连接信息，按照设计规范进行左右分区
        all_port_connections = []
        
        for conn in connections:
            # 确定本端端口信息
            if conn.source_device_id == device.id:
                # 本设备是源设备
                local_port = conn.source_port
                remote_device_id = conn.target_device_id
                remote_port = conn.target_port
                connection_direction = "outgoing"  # 输出连接
            else:
                # 本设备是目标设备
                local_port = conn.target_port
                remote_device_id = conn.source_device_id
                remote_port = conn.source_port
                connection_direction = "incoming"  # 输入连接
            
            all_port_connections.append({
                'conn': conn,
                'local_port': local_port,
                'remote_device_id': remote_device_id,
                'remote_port': remote_port,
                'direction': connection_direction
            })
        
        # 按照设计规范：左右分区仅用于平衡端口展示数量，与上下游无关
        # 根据端口总数量，将端口平均分配到左右两侧
        total_ports = len(all_port_connections)
        left_port_count = total_ports // 2 + (total_ports % 2)  # 如果是奇数，左侧多一个
        right_port_count = total_ports // 2
        
        # 按顺序分配端口到左右两侧（按照数据库中端口的物理顺序）
        left_ports = all_port_connections[:left_port_count]
        right_ports = all_port_connections[left_port_count:]
        
        # 处理左侧端口
        for i, port_info in enumerate(left_ports):
            conn = port_info['conn']
            local_port = port_info['local_port']
            remote_device_id = port_info['remote_device_id']
            remote_port = port_info['remote_port']
            direction = port_info['direction']
            
            # 获取对端设备信息
            remote_device = self.db.query(Device).filter(Device.id == remote_device_id).first()
            
            # 左侧端口位置计算 - 自上而下排列
            port_x = -280  # 左侧固定位置
            # 垂直分布：从上到下均匀分布，整体居中
            if left_port_count > 1:
                total_height = (left_port_count - 1) * 100  # 端口间距100像素
                start_y = -total_height / 2  # 起始Y坐标，使整体居中
                port_y = start_y + i * 100  # 每个端口间距100像素
            else:
                port_y = 0  # 只有一个端口时居中
            
            # 创建本端端口节点 - 严格采用用户提交的原始port_name
            local_port_id = f"port_{device.id}_{local_port}_{i}"
            port_label = local_port if local_port else f"端口{i+1}"
            
            local_port_node = {
                "id": local_port_id,
                "label": port_label,  # 严格采用原始端口名称
                "type": "port",
                "level": 1,
                "x": port_x,
                "y": port_y,
                "color": {
                    "background": "#10b981",  # 绿色
                    "border": "#059669"
                },
                "font": {"color": "#ffffff"},
                "shape": "box",
                "size": 15
            }
            nodes.append(local_port_node)
            
            # 连接设备到端口
            device_to_port_edge = {
                "from": f"device_{device.id}",
                "to": local_port_id,
                "color": {"color": "#6b7280"},
                "width": 1,
                "dashes": True
            }
            edges.append(device_to_port_edge)
            
            # 仅在存在真实连接且对端有效时再创建对端节点与连线
            # 严格判定：必须同时具备有效对端设备ID、有效对端端口名称、非空电缆型号/类型
            def _is_valid_remote_port_value(name):
                s = str(name).strip().lower() if name is not None else ''
                return s not in ('', 'nan', 'null', 'none', '未知端口', '未知站点')

            # 统一并严格化连接类型为“交流/直流”，兼容常见别名
            def _normalize_connection_type(ct):
                s = (ct or '').strip().lower()
                if s in ('交流', 'ac', 'ac_cable', '交流电缆'):
                    return '交流'
                if s in ('直流', 'dc', 'dc_cable', '直流电缆'):
                    return '直流'
                return None

            normalized_ct = _normalize_connection_type(conn.connection_type)

            # 创建对端的条件：对端设备与端口有效，且电缆型号/类型非空
            should_create_remote = (
                bool(remote_device_id) and (remote_device is not None) and
                _is_valid_remote_port_value(remote_port) and
                bool(str((conn.cable_model or conn.cable_type or '')).strip())
            )
            if not should_create_remote:
                # 空闲端口：不创建对端节点与连接边
                continue

            # 计算对端节点位置（背对中心，具体排布由前端布局函数接管）
            remote_combined_x = port_x - 200

            # 处理对端设备名称（严格要求存在且有效）
            remote_device_name = remote_device.name

            # 端口名有效性
            def _is_valid_port_name(name):
                if not name:
                    return False
                s = str(name).strip().lower()
                return s not in ('', 'nan', 'null', 'none', '未知端口', '未知站点')

            # 合并节点标签：统一为单行“设备-端口”（若端口有效）
            if _is_valid_port_name(remote_port):
                remote_combined_label = f"{remote_device_name}-{remote_port}"
            else:
                remote_combined_label = f"{remote_device_name}"

            # 合并后的对端节点（用port样式，符合前端布局的isPort判断）
            remote_combined_id = f"remote_combined_{conn.id}"
            remote_combined_node = {
                "id": remote_combined_id,
                "label": remote_combined_label,
                "type": "port",
                "nodeType": "port",
                "level": 2,
                "x": remote_combined_x,
                "y": port_y,
                "color": {
                    "background": "#10b981",
                    "border": "#065f46"
                },
                "font": {"color": "#ffffff"},
                "shape": "dot",
                "size": 16,
                "device_name": remote_device_name,
                "station": remote_device.station if remote_device else None,
                "port_name": remote_port
            }
            nodes.append(remote_combined_node)

            # 连接线方向：优先使用表中“上下游”，上游 A->B， 下游 B->A
            upstream_downstream = (conn.upstream_downstream or '').strip()
            # 连线标签统一用“电缆型号”，确保与用户数据一致
            cable_label = conn.cable_model or ""
            # 颜色按交流/直流映射；未知用灰色
            edge_color_val = '#f59e0b' if normalized_ct == '交流' else ('#ef4444' if normalized_ct == '直流' else '#9ca3af')
            if upstream_downstream == "上游":
                connection_edge = {
                    "from": local_port_id,
                    "to": remote_combined_id,
                    "label": cable_label,
                    "color": {"color": edge_color_val},
                    "width": 3,
                    "arrows": {"to": {"enabled": True}},
                    "font": {"size": 10, "color": "#374151"},
                    "connection_id": conn.id,
                    "connection_type": conn.connection_type,
                    "cable_type": conn.cable_type,
                    "cable_model": conn.cable_model
                }
            elif upstream_downstream == "下游":
                connection_edge = {
                    "from": remote_combined_id,
                    "to": local_port_id,
                    "label": cable_label,
                    "color": {"color": edge_color_val},
                    "width": 3,
                    "arrows": {"to": {"enabled": True}},
                    "font": {"size": 10, "color": "#374151"},
                    "connection_id": conn.id,
                    "connection_type": conn.connection_type,
                    "cable_type": conn.cable_type,
                    "cable_model": conn.cable_model
                }
            else:
                # 回退到源/目标方向
                if direction == "outgoing":
                    connection_edge = {
                        "from": local_port_id,
                        "to": remote_combined_id,
                        "label": cable_label,
                        "color": {"color": edge_color_val},
                        "width": 3,
                        "arrows": {"to": {"enabled": True}},
                        "font": {"size": 10, "color": "#374151"},
                        "connection_id": conn.id,
                        "connection_type": conn.connection_type,
                        "cable_type": conn.cable_type,
                        "cable_model": conn.cable_model
                    }
                else:
                    connection_edge = {
                        "from": remote_combined_id,
                        "to": local_port_id,
                        "label": cable_label,
                        "color": {"color": edge_color_val},
                        "width": 3,
                        "arrows": {"to": {"enabled": True}},
                        "font": {"size": 10, "color": "#374151"},
                        "connection_id": conn.id,
                        "connection_type": conn.connection_type,
                        "cable_type": conn.cable_type,
                        "cable_model": conn.cable_model
                    }
            edges.append(connection_edge)
        
        # 处理右侧端口
        for i, port_info in enumerate(right_ports):
            conn = port_info['conn']
            local_port = port_info['local_port']
            remote_device_id = port_info['remote_device_id']
            remote_port = port_info['remote_port']
            direction = port_info['direction']
            
            # 获取对端设备信息
            remote_device = self.db.query(Device).filter(Device.id == remote_device_id).first()
            
            # 右侧端口位置计算 - 自上而下排列
            port_x = 280  # 右侧固定位置
            # 垂直分布：从上到下均匀分布，整体居中
            if right_port_count > 1:
                total_height = (right_port_count - 1) * 100  # 端口间距100像素
                start_y = -total_height / 2  # 起始Y坐标，使整体居中
                port_y = start_y + i * 100  # 每个端口间距100像素
            else:
                port_y = 0  # 只有一个端口时居中
            
            # 创建本端端口节点 - 严格采用用户提交的原始port_name
            local_port_id = f"port_{device.id}_{local_port}_{left_port_count + i}"
            port_label = local_port if local_port else f"端口{left_port_count + i + 1}"
            
            local_port_node = {
                "id": local_port_id,
                "label": port_label,  # 严格采用原始端口名称
                "type": "port",
                "level": 1,
                "x": port_x,
                "y": port_y,
                "color": {
                    "background": "#ef4444",  # 红色
                    "border": "#dc2626"
                },
                "font": {"color": "#ffffff"},
                "shape": "dot",
                "size": 15
            }
            nodes.append(local_port_node)
            
            # 连接设备到端口
            device_to_port_edge = {
                "from": f"device_{device.id}",
                "to": local_port_id,
                "color": {"color": "#6b7280"},
                "width": 1,
                "dashes": True
            }
            edges.append(device_to_port_edge)
            
            # 仅在存在真实连接且对端有效时再创建对端节点与连线
            # 严格判定：对端设备与端口有效，且电缆型号/类型非空
            def _is_valid_remote_port_value(name):
                s = str(name).strip().lower() if name is not None else ''
                return s not in ('', 'nan', 'null', 'none', '未知端口', '未知站点')

            # 统一并严格化连接类型为“交流/直流”，兼容常见别名
            def _normalize_connection_type(ct):
                s = (ct or '').strip().lower()
                if s in ('交流', 'ac', 'ac_cable', '交流电缆'):
                    return '交流'
                if s in ('直流', 'dc', 'dc_cable', '直流电缆'):
                    return '直流'
                return None

            normalized_ct = _normalize_connection_type(conn.connection_type)

            should_create_remote = (
                bool(remote_device_id) and (remote_device is not None) and
                _is_valid_remote_port_value(remote_port) and
                bool(str((conn.cable_model or conn.cable_type or '')).strip())
            )
            if not should_create_remote:
                # 空闲端口：不创建对端节点与连接边
                continue

            # 合并对端节点（右侧）
            remote_combined_x = port_x + 200

            # 处理对端设备名称（严格要求存在且有效）
            remote_device_name = remote_device.name

            def _is_valid_port_name(name):
                if not name:
                    return False
                s = str(name).strip().lower()
                return s not in ('', 'nan', 'null', 'none', '未知端口', '未知站点')

            if _is_valid_port_name(remote_port):
                remote_combined_label = f"{remote_device_name}-{remote_port}"
            else:
                remote_combined_label = f"{remote_device_name}"

            remote_combined_id = f"remote_combined_{conn.id}"
            remote_combined_node = {
                "id": remote_combined_id,
                "label": remote_combined_label,
                "type": "port",
                "nodeType": "port",
                "level": 2,
                "x": remote_combined_x,
                "y": port_y,
                "color": {
                    "background": "#10b981",
                    "border": "#065f46"
                },
                "font": {"color": "#ffffff"},
                "shape": "dot",
                "size": 16,
                "device_name": remote_device_name,
                "station": remote_device.station if remote_device else None,
                "port_name": remote_port
            }
            nodes.append(remote_combined_node)

            upstream_downstream = (conn.upstream_downstream or '').strip()
            cable_label = conn.cable_model or ""
            edge_color_val = '#f59e0b' if normalized_ct == '交流' else ('#ef4444' if normalized_ct == '直流' else '#9ca3af')
            edge_color = {"color": edge_color_val}
            if upstream_downstream == "上游":
                connection_edge = {
                    "id": f"conn_{conn.id}_{local_port_id}_to_{remote_combined_id}",
                    "from": local_port_id,
                    "to": remote_combined_id,
                    "label": cable_label,
                    "color": edge_color,
                    "width": 3,
                    "arrows": {"to": {"enabled": True}},
                    "font": {"size": 10, "color": "#374151"},
                    "connection_id": conn.id,
                    "connection_type": conn.connection_type,
                    "cable_type": conn.cable_type,
                    "cable_model": conn.cable_model
                }
            elif upstream_downstream == "下游":
                connection_edge = {
                    "id": f"conn_{conn.id}_{remote_combined_id}_to_{local_port_id}",
                    "from": remote_combined_id,
                    "to": local_port_id,
                    "label": cable_label,
                    "color": edge_color,
                    "width": 3,
                    "arrows": {"to": {"enabled": True}},
                    "font": {"size": 10, "color": "#374151"},
                    "connection_id": conn.id,
                    "connection_type": conn.connection_type,
                    "cable_type": conn.cable_type,
                    "cable_model": conn.cable_model
                }
            else:
                if direction == "outgoing":
                    connection_edge = {
                        "id": f"conn_{conn.id}_{local_port_id}_to_{remote_combined_id}",
                        "from": local_port_id,
                        "to": remote_combined_id,
                        "label": cable_label,
                        "color": edge_color,
                        "width": 3,
                        "arrows": {"to": {"enabled": True}},
                        "font": {"size": 10, "color": "#374151"},
                        "connection_id": conn.id,
                        "connection_type": conn.connection_type,
                        "cable_type": conn.cable_type,
                        "cable_model": conn.cable_model
                    }
                else:
                    connection_edge = {
                        "id": f"conn_{conn.id}_{remote_combined_id}_to_{local_port_id}",
                        "from": remote_combined_id,
                        "to": local_port_id,
                        "label": cable_label,
                        "color": edge_color,
                        "width": 3,
                        "arrows": {"to": {"enabled": True}},
                        "font": {"size": 10, "color": "#374151"},
                        "connection_id": conn.id,
                        "connection_type": conn.connection_type,
                        "cable_type": conn.cable_type,
                        "cable_model": conn.cable_model
                    }
            edges.append(connection_edge)
        
        # 返回拓扑数据
        topology_error_tracker.log_error(
            category=ErrorCategory.DATA_LOADING,
            level=ErrorLevel.INFO,
            message=f"端口级拓扑数据构建完成",
            context={
                "device_id": device.id,
                "nodes_count": len(nodes),
                "edges_count": len(edges),
                "connections_count": len(connections)
            }
        )
        
        return {
            "nodes": nodes,
            "edges": edges,
            "device_info": {
                "id": device.id,
                "name": device.name,
                "station": device.station,
                "device_type": device.device_type
            },
            "statistics": {
                "total_nodes": len(nodes),
                "total_edges": len(edges),
                "port_count": len([n for n in nodes if n["type"] == "port"]),
                "device_count": len([n for n in nodes if n["type"] == "device"])
            }
        }
    
    def _build_simplified_port_topology(self, device: Device, connections: List[Connection]) -> Dict[str, Any]:
        """构建简化的端口级拓扑数据"""
        # 简化版本：只显示端口连接，不显示对端设备
        nodes = []
        edges = []
        
        # 创建中心设备节点
        center_node = {
            "id": f"device_{device.id}",
            "label": device.name,
            "type": "device",
            "color": {
                "background": "#3b82f6",
                "border": "#1e40af"
            },
            "font": {"color": "#ffffff"},
            "shape": "box"
        }
        nodes.append(center_node)
        
        # 收集所有端口
        ports = set()
        for conn in connections:
            if conn.source_device_id == device.id and conn.source_port:
                ports.add(conn.source_port)
            elif conn.target_device_id == device.id and conn.target_port:
                ports.add(conn.target_port)
        
        # 为每个端口创建节点
        for port in ports:
            port_node = {
                "id": f"port_{device.id}_{port}",
                "label": port,
                "type": "port",
                "color": {
                    "background": "#10b981",
                    "border": "#059669"
                },
                "font": {"color": "#ffffff"},
                "shape": "dot"
            }
            nodes.append(port_node)
            
            # 连接设备到端口
            edge = {
                "from": f"device_{device.id}",
                "to": f"port_{device.id}_{port}",
                "color": {"color": "#6b7280"}
            }
            edges.append(edge)
        
        return {
            "nodes": nodes,
            "edges": edges,
            "device_info": {
                "id": device.id,
                "name": device.name,
                "station": device.station,
                "device_type": device.device_type
            },
            "statistics": {
                "total_nodes": len(nodes),
                "total_edges": len(edges),
                "port_count": len(ports)
            }
        }
    
    def get_port_selection_options(self, device_id: int) -> Dict[str, Any]:
        """获取端口选择选项"""
        try:
            device = self.db.query(Device).filter(Device.id == device_id).first()
            if not device:
                raise ValueError(f"设备不存在: {device_id}")
            
            connections = self._get_device_connections(device_id)
            
            # 收集所有端口信息
            ports = []
            for conn in connections:
                if conn.source_device_id == device_id:
                    port_info = {
                        "port_name": conn.source_port,
                        "connection_type": conn.connection_type,
                        "connected_to": conn.target_device.name if conn.target_device else "未知设备",
                        "remote_port": conn.target_port,
                        "direction": "outgoing"
                    }
                    ports.append(port_info)
                elif conn.target_device_id == device_id:
                    port_info = {
                        "port_name": conn.target_port,
                        "connection_type": conn.connection_type,
                        "connected_to": conn.source_device.name if conn.source_device else "未知设备",
                        "remote_port": conn.source_port,
                        "direction": "incoming"
                    }
                    ports.append(port_info)
            
            return {
                "device_info": {
                    "id": device.id,
                    "name": device.name,
                    "station": device.station
                },
                "ports": ports,
                "total_ports": len(ports)
            }
            
        except Exception as e:
            topology_error_tracker.log_error(
                category=ErrorCategory.API_ERROR,
                level=ErrorLevel.ERROR,
                message=f"获取端口选择选项失败: {str(e)}",
                context={"device_id": device_id},
                exception=e
            )
            raise