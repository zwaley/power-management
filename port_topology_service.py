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
        """构建详细的端口级拓扑数据 - 垂直布局，左右分列"""
        nodes = []
        edges = []
        port_groups = {}
        
        # 创建中心设备节点 - 固定在中心位置
        center_node = {
            "id": f"device_{device.id}",
            "label": device.name,
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
        
        # 处理每个连接，创建端口节点 - 实现左右分列布局
        left_ports = []  # 左侧端口
        right_ports = []  # 右侧端口
        port_index = 0
        
        for conn in connections:
            # 确定本端和对端信息
            if conn.source_device_id == device.id:
                local_port = conn.source_port
                remote_device_id = conn.target_device_id
                remote_port = conn.target_port
                is_outgoing = True
            else:
                local_port = conn.target_port
                remote_device_id = conn.source_device_id
                remote_port = conn.source_port
                is_outgoing = False
            
            # 获取对端设备信息
            remote_device = self.db.query(Device).filter(Device.id == remote_device_id).first()
            if not remote_device:
                continue
            
            # 计算端口位置 - 左右交替分布
            is_left_side = (port_index % 2 == 0)
            port_x = -200 if is_left_side else 200  # 左侧-200，右侧+200
            port_y = (port_index // 2) * 80 - 40  # 垂直间距80像素
            
            # 创建本端端口节点 - 只显示端口名称
            local_port_id = f"port_{device.id}_{local_port}"
            if local_port_id not in [n["id"] for n in nodes]:
                # 本端端口只显示端口名称，不显示站点信息
                port_label = local_port if local_port else f"端口{conn.id}"
                local_port_node = {
                    "id": local_port_id,
                    "label": port_label,  # 只显示端口名称
                    "type": "port",
                    "level": 1,
                    "x": port_x,
                    "y": port_y,
                    "color": {
                        "background": "#10b981",
                        "border": "#059669"
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
            
            # 计算对端设备和端口位置
            remote_device_x = port_x + (150 if is_left_side else -150)  # 对端设备距离端口150像素
            remote_port_x = port_x + (100 if is_left_side else -100)    # 对端端口距离本端端口100像素
            
            # 创建对端设备节点 - 显示正确的站点信息
            remote_device_id_str = f"device_{remote_device_id}"
            if remote_device_id_str not in [n["id"] for n in nodes]:
                # 对端设备显示设备名称和站点信息
                device_label = f"{remote_device.name}"
                if remote_device.station and remote_device.station != "未知站点":
                    device_label += f"\n({remote_device.station})"
                
                remote_device_node = {
                    "id": remote_device_id_str,
                    "label": device_label,
                    "type": "device",
                    "level": 2,
                    "x": remote_device_x,
                    "y": port_y,
                    "color": {
                        "background": "#8b5cf6",
                        "border": "#7c3aed"
                    },
                    "font": {"color": "#ffffff"},
                    "shape": "box",
                    "size": 25
                }
                nodes.append(remote_device_node)
            
            # 创建对端端口节点 - 显示正确的端口信息
            remote_port_id = f"port_{remote_device_id}_{remote_port}"
            if remote_port_id not in [n["id"] for n in nodes]:
                # 对端端口显示端口名称和设备信息
                remote_port_label = remote_port if remote_port else f"入线{conn.id}"
                if remote_device.station and remote_device.station != "未知站点":
                    remote_port_label += f"\n({remote_device.station})"
                
                remote_port_node = {
                    "id": remote_port_id,
                    "label": remote_port_label,
                    "type": "port",
                    "level": 2,
                    "x": remote_port_x,
                    "y": port_y,
                    "color": {
                        "background": "#f59e0b",
                        "border": "#d97706"
                    },
                    "font": {"color": "#ffffff"},
                    "shape": "dot",
                    "size": 15
                }
                nodes.append(remote_port_node)
                
                # 连接对端设备到端口
                remote_device_to_port_edge = {
                    "from": remote_device_id_str,
                    "to": remote_port_id,
                    "color": {"color": "#6b7280"},
                    "width": 1,
                    "dashes": True
                }
                edges.append(remote_device_to_port_edge)
            
            # 创建端口到端口的连接
            port_to_port_edge = {
                "from": local_port_id,
                "to": remote_port_id,
                "label": conn.connection_type or conn.cable_type or "连接",
                "color": {"color": "#374151"},
                "width": 3,
                "arrows": {"to": {"enabled": True}},
                "font": {
                    "size": 12,
                    "color": "#f59e0b",
                    "strokeWidth": 2,
                    "strokeColor": "#ffffff"
                }
            }
            edges.append(port_to_port_edge)
            
            # 增加端口索引
            port_index += 1
        
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