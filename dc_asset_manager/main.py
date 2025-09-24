import logging
from sqlalchemy.orm import Session
from fastapi import HTTPException
from sqlalchemy.orm import Session
import traceback
from models import Device, Connection

# Configure logging
logger = logging.getLogger(__name__)

class PortTopologyService:
    """Port topology service class for generating port topology data"""
    
    def __init__(self, db: Session):
        self.db = db
    
    def get_port_topology_data(self, device_id: int, mode: str = "all") -> dict:
        """
        获取端口拓扑图数据
        
        Args:
            device_id: 设备ID
            mode: 显示模式，可选 'all' 或 'used'
        
        Returns:
            包含节点和边的拓扑图数据
        """
        try:
            # Get the center device
            logger.info(f"查询中心设备，设备ID: {device_id}")
            center_device = self.db.query(Device).filter(Device.id == device_id).first()
            if not center_device:
                logger.error(f"设备不存在，设备ID: {device_id}")
                raise HTTPException(status_code=404, detail="设备不存在")
            
            # Get all connections related to this device
            logger.info(f"查询与设备ID {device_id} 相关的所有连接")
            connections = self.db.query(Connection).filter(
                (Connection.source_device_id == device_id) |
                (Connection.target_device_id == device_id)
            ).all()
            
            if not connections:
                logger.info(f"设备ID {device_id} 没有相关连接")
                return {
                    "nodes": [],
                    "edges": []
                }
            
            # Build nodes and edges
            nodes = []
            edges = []
            
            # Add center device node
            center_node = {
                "id": f"device_{device_id}",
                "label": f"{center_device.station} {center_device.name}",
                "type": "device",
                "x": 0,
                "y": 0,
                "size": 20,
                "color": "#848484"
            }
            nodes.append(center_node)
            
            # Process connections
            left_ports = []
            right_ports = []
            port_count = 0
            
            for conn in connections:
                # Check if display conditions are met
                if mode == "used" and not conn.connection_type:
                    continue  # 跳过空闲端口
                
                # Process source port (local)
                if conn.source_device_id == device_id:
                    source_port = conn.source_fuse_number or conn.source_breaker_number
                    if source_port:
                        port_count += 1
                        port_id = f"port_{device_id}_{source_port}"
                        port_label = f"{source_port}"
                        
                        # Distribute ports left/right based on count
                        if port_count % 2 == 1:
                            port_x = -100
                            port_y = 50 + (port_count // 2) * 80
                            port_side = "left"
                        else:
                            port_x = 100
                            port_y = 50 + ((port_count - 1) // 2) * 80
                            port_side = "right"
                        
                        port_node = {
                            "id": port_id,
                            "label": port_label,
                            "type": "port",
                            "x": port_x,
                            "y": port_y,
                            "size": 10,
                            "color": "#848484"
                        }
                        nodes.append(port_node)
                        
                        # 添加连接线
                        edge_id = f"edge_{device_id}_{source_port}"
                        edge_data = {
                            "id": edge_id,
                            "from": f"device_{device_id}",
                            "to": port_id,
                            "width": 2,
                            "color": "#848484",
                            "arrows": {"to": {"enabled": True, "type": "arrow"}}
                        }
                        edges.append(edge_data)
                        
                        # 处理对端设备
                        if conn.target_device:
                            target_device = conn.target_device
                            target_port = conn.target_fuse_number or conn.target_breaker_number
                            
                            # 创建对端设备节点
                            target_node_id = f"target_{conn.target_device_id}"
                            target_node = {
                                "id": target_node_id,
                                "label": f"{target_device.name} {target_port}",
                                "type": "device",
                                "x": port_x + (-150 if port_side == "left" else 150),
                                "y": port_y,
                                "size": 15,
                                "color": "#848484"
                            }
                            nodes.append(target_node)
                            
                            # 添加连接线到对端设备
                            edge_target_id = f"edge_{device_id}_{source_port}_target"
                            edge_target_data = {
                                "id": edge_target_id,
                                "from": port_id,
                                "to": target_node_id,
                                "width": 2,
                                "color": "#848484",
                                "arrows": {"to": {"enabled": True, "type": "arrow"}},
                                "cable_model": conn.cable_model,
                                "remark": conn.remark
                            }
                            edges.append(edge_target_data)
                
                # 处理目标端口（本端）
                elif conn.target_device_id == device_id:
                    target_port = conn.target_fuse_number or conn.target_breaker_number
                    if target_port:
                        port_count += 1
                        port_id = f"port_{device_id}_{target_port}"
                        port_label = f"{target_port}"
                        
                        # 根据端口数量决定左右分布
                        if port_count % 2 == 1:
                            port_x = -100
                            port_y = 50 + (port_count // 2) * 80
                            port_side = "left"
                        else:
                            port_x = 100
                            port_y = 50 + ((port_count - 1) // 2) * 80
                            port_side = "right"
                        
                        port_node = {
                            "id": port_id,
                            "label": port_label,
                            "type": "port",
                            "x": port_x,
                            "y": port_y,
                            "size": 10,
                            "color": "#848484"
                        }
                        nodes.append(port_node)
                        
                        # 添加连接线
                        edge_id = f"edge_{device_id}_{target_port}"
                        edge_data = {
                            "id": edge_id,
                            "from": f"device_{device_id}",
                            "to": port_id,
                            "width": 2,
                            "color": "#848484",
                            "arrows": {"to": {"enabled": True, "type": "arrow"}},
                            "cable_model": conn.cable_model,
                            "remark": conn.remark
                        }
                        edges.append(edge_data)
                        
                        # 处理对端设备
                        if conn.source_device:
                            source_device = conn.source_device
                            source_port = conn.source_fuse_number or conn.source_breaker_number
                            
                            # 创建对端设备节点
                            source_node_id = f"source_{conn.source_device_id}"
                            source_node = {
                                "id": source_node_id,
                                "label": f"{source_device.name} {source_port}",
                                "type": "device",
                                "x": port_x + (-150 if port_side == "left" else 150),
                                "y": port_y,
                                "size": 15,
                                "color": "#848484"
                            }
                            nodes.append(source_node)
                            
                            # 添加连接线到对端设备
                            edge_source_id = f"edge_{device_id}_{target_port}_source"
                            edge_source_data = {
                                "id": edge_source_id,
                                "from": port_id,
                                "to": source_node_id,
                                "width": 2,
                                "color": "#848484",
                                "arrows": {"to": {"enabled": True, "type": "arrow"}},
                                "cable_model": conn.cable_model,
                                "remark": conn.remark
                            }
                            edges.append(edge_source_data)
            
            logger.info(f"成功生成端口拓扑图数据，节点数: {len(nodes)}, 边数: {len(edges)}")
            return {
                "nodes": nodes,
                "edges": edges
            }
        except Exception as e:
            logger.error(f"获取端口拓扑图数据时出错: {str(e)}")
            traceback.print_exc()
            # 返回标准格式的空数据，避免前端解析失败
            return {
                "nodes": [],
                "edges": []
            }