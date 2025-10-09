#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
端口拓扑图修复脚本
修复问题：
1. 缺失的连接线：使用cable_model而非cable_type判断是否创建连接
2. 虚假的伪端口：过滤掉源设备和目标设备相同的连接记录
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from models import SessionLocal, Connection, Device
from sqlalchemy import or_

def analyze_connections():
    """分析连接数据，找出问题"""
    db = SessionLocal()
    
    print("=== 连接数据分析 ===")
    
    # 1. 统计总连接数
    total_connections = db.query(Connection).count()
    print(f"总连接数: {total_connections}")
    
    # 2. 统计自连接（虚假伪端口）
    self_connections = db.query(Connection).filter(
        Connection.source_device_id == Connection.target_device_id
    ).count()
    print(f"自连接数（虚假伪端口）: {self_connections}")
    
    # 3. 统计有电缆信息的连接
    cable_connections = db.query(Connection).filter(
        or_(Connection.cable_type.isnot(None), Connection.cable_model.isnot(None))
    ).count()
    print(f"有电缆信息的连接数: {cable_connections}")
    
    # 4. 统计真实连接（不同设备间且有电缆信息）
    real_connections = db.query(Connection).filter(
        Connection.source_device_id != Connection.target_device_id,
        or_(Connection.cable_type.isnot(None), Connection.cable_model.isnot(None))
    ).count()
    print(f"真实连接数（不同设备间且有电缆信息）: {real_connections}")
    
    # 5. 显示一些真实连接的示例
    print("\n=== 真实连接示例 ===")
    real_conn_examples = db.query(Connection).filter(
        Connection.source_device_id != Connection.target_device_id,
        or_(Connection.cable_type.isnot(None), Connection.cable_model.isnot(None))
    ).limit(5).all()
    
    for conn in real_conn_examples:
        source_device = db.query(Device).filter(Device.id == conn.source_device_id).first()
        target_device = db.query(Device).filter(Device.id == conn.target_device_id).first()
        print(f"连接ID: {conn.id}")
        print(f"  源设备: {source_device.name if source_device else 'Unknown'} (ID: {conn.source_device_id})")
        print(f"  目标设备: {target_device.name if target_device else 'Unknown'} (ID: {conn.target_device_id})")
        print(f"  电缆类型: {conn.cable_type}")
        print(f"  电缆型号: {conn.cable_model}")
        print(f"  源端口: {conn.source_fuse_number or conn.source_breaker_number}")
        print(f"  目标端口: {conn.target_fuse_number or conn.target_breaker_number}")
        print("---")
    
    db.close()

def test_new_logic():
    """测试新的连接创建逻辑"""
    db = SessionLocal()
    
    print("\n=== 测试新逻辑 ===")
    
    # 获取一个设备的连接
    device_id = 13  # 使用之前看到的有连接的设备
    connections = db.query(Connection).filter(
        or_(Connection.source_device_id == device_id, Connection.target_device_id == device_id)
    ).all()
    
    print(f"设备 {device_id} 的连接数: {len(connections)}")
    
    valid_connections = 0
    for conn in connections:
        # 应用新逻辑
        remote_device_id = conn.target_device_id if conn.source_device_id == device_id else conn.source_device_id
        
        # 1. 必须有电缆型号（cable_model）或电缆类型（cable_type）
        has_cable_info = bool((conn.cable_model or '').strip()) or bool((conn.cable_type or '').strip())
        
        # 2. 必须是不同设备间的连接（过滤掉自连接/空闲端口）
        is_real_connection = remote_device_id != device_id
        
        # 3. 必须有有效的远程设备
        remote_device = db.query(Device).filter(Device.id == remote_device_id).first()
        has_valid_remote = bool(remote_device_id) and remote_device is not None
        
        should_create_remote = has_cable_info and is_real_connection and has_valid_remote
        
        if should_create_remote:
            valid_connections += 1
            print(f"有效连接 {conn.id}: {device_id} -> {remote_device_id}, 电缆: {conn.cable_model or conn.cable_type}")
    
    print(f"应该创建的连接数: {valid_connections}")
    
    db.close()

if __name__ == "__main__":
    analyze_connections()
    test_new_logic()