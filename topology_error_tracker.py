"""
拓扑图错误追踪系统
提供系统化的错误日志记录、故障点定位和修复建议功能
"""

import logging
import json
from datetime import datetime
from enum import Enum
from typing import Dict, Any, Optional
import os

class ErrorLevel(Enum):
    """错误级别枚举"""
    DEBUG = "DEBUG"
    INFO = "INFO"
    WARNING = "WARNING"
    ERROR = "ERROR"
    CRITICAL = "CRITICAL"

class ErrorCategory(Enum):
    """错误分类枚举"""
    NODE_RENDERING = "NODE_RENDERING"  # 节点渲染错误
    EDGE_RENDERING = "EDGE_RENDERING"  # 边渲染错误
    DATA_LOADING = "DATA_LOADING"      # 数据加载错误
    USER_INTERACTION = "USER_INTERACTION"  # 用户交互错误
    PHYSICS_ENGINE = "PHYSICS_ENGINE"  # 物理引擎错误
    API_ERROR = "API_ERROR"           # API接口错误
    DATABASE_ERROR = "DATABASE_ERROR"  # 数据库错误
    PERFORMANCE = "PERFORMANCE"       # 性能问题
    # 新增：API 成功事件分类，避免在引用时抛出异常
    API_SUCCESS = "API_SUCCESS"

class TopologyErrorTracker:
    """拓扑图错误追踪器"""
    
    def __init__(self, log_file: str = "topology_errors.log"):
        self.log_file = log_file
        self.setup_logger()
        
    def setup_logger(self):
        """设置日志记录器"""
        # 创建日志目录
        log_dir = os.path.dirname(self.log_file) if os.path.dirname(self.log_file) else "logs"
        if log_dir and not os.path.exists(log_dir):
            os.makedirs(log_dir)
            
        # 配置日志格式
        logging.basicConfig(
            level=logging.DEBUG,
            format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
            handlers=[
                logging.FileHandler(self.log_file, encoding='utf-8'),
                logging.StreamHandler()
            ]
        )
        self.logger = logging.getLogger('TopologyErrorTracker')
    
    def log_error(self, 
                  category: ErrorCategory, 
                  level: ErrorLevel, 
                  message: str, 
                  context: Optional[Dict[str, Any]] = None,
                  exception: Optional[Exception] = None):
        """记录错误信息"""
        
        if context is None:
            context = {}
            
        # 分析故障点和修复建议
        fault_point, repair_suggestion = self._analyze_error(message, category)
        
        # 记录到日志文件
        log_message = f"[{category.value}] {message}"
        context_str = json.dumps(context, ensure_ascii=False) if context else "{}"
        
        if level == ErrorLevel.DEBUG:
            self.logger.debug(f"{log_message} | Context: {context_str}")
        elif level == ErrorLevel.INFO:
            self.logger.info(f"{log_message} | Context: {context_str}")
        elif level == ErrorLevel.WARNING:
            self.logger.warning(f"{log_message} | Context: {context_str}")
        elif level == ErrorLevel.ERROR:
            self.logger.error(f"{log_message} | Context: {context_str} | Fault: {fault_point} | Suggestion: {repair_suggestion}")
        elif level == ErrorLevel.CRITICAL:
            self.logger.critical(f"{log_message} | Context: {context_str} | Fault: {fault_point} | Suggestion: {repair_suggestion}")
    
    def _analyze_error(self, message: str, category: ErrorCategory) -> tuple[str, str]:
        """分析错误并提供故障点和修复建议"""
        message_lower = message.lower()
        
        # 错误模式匹配
        error_patterns = {
            "设备名称": ("设备节点标签格式化逻辑", "检查设备名称和站点字段是否正确获取，确保格式化逻辑符合'站点名称 - 设备名称'规范"),
            "拖拽": ("vis.js物理引擎配置", "检查physics.enabled设置，调整stabilization参数，确保dragNodes为true"),
            "端口": ("端口级拓扑数据处理逻辑", "验证端口数据结构，检查source_port和target_port字段映射关系"),
            "超时": ("后端数据查询性能", "优化数据库查询语句，添加适当索引，考虑分页加载大量数据"),
            "卡顿": ("vis.js网络图渲染性能", "减少同时渲染的节点数量，优化物理引擎参数，考虑使用聚类功能")
        }
        
        for pattern, (fault_point, suggestion) in error_patterns.items():
            if pattern in message_lower:
                return fault_point, suggestion
        
        # 根据错误分类提供通用建议
        category_suggestions = {
            ErrorCategory.NODE_RENDERING: ("节点渲染逻辑", "检查节点数据结构和样式配置，验证vis.js节点属性设置"),
            ErrorCategory.EDGE_RENDERING: ("边渲染逻辑", "检查边数据结构和连接关系，验证from/to节点ID的有效性"),
            ErrorCategory.DATA_LOADING: ("数据加载流程", "检查API接口响应格式，验证数据库连接和查询语句"),
            ErrorCategory.USER_INTERACTION: ("用户交互处理", "检查事件监听器绑定，验证用户操作响应逻辑"),
            ErrorCategory.PHYSICS_ENGINE: ("vis.js物理引擎配置", "调整物理引擎参数，检查节点固定和拖拽设置")
        }
        
        if category in category_suggestions:
            return category_suggestions[category]
        
        return "未知故障点", "请检查相关日志和代码逻辑"

# 创建全局错误追踪器实例
topology_error_tracker = TopologyErrorTracker("logs/topology_errors.log")