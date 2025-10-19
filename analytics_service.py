from typing import Dict, List, Tuple
from sqlalchemy.orm import Session

from models import Device, Connection


def _safe_label(value: str, default: str = "未知") -> str:
    if value is None:
        return default
    value = str(value).strip()
    return value if value else default


def _is_empty(val) -> bool:
    """统一判定空值，包含 'null'/'None'/'nan' 以及空字符串。"""
    if val is None:
        return True
    s = str(val).strip().lower()
    return s == '' or s in ('null', 'none', 'nan')


class AnalyticsService:
    """
    提供统计分析数据：
    - 端口使用率（总体、按设备类型、按站点）
    - 总览仪表板关键指标
    """

    def __init__(self, db: Session):
        self.db = db

    def _iter_ports_from_connection(self, conn: Connection):
        """
        从一条连接记录中抽取两侧设备的端口键（保险/断路器），并返回结构：
        [
          (device_id, device_type, station, port_key, is_connected),  # source
          (device_id, device_type, station, port_key, is_connected),  # target
        ]
        port_key 格式统一为 "fuse-<num>" 或 "breaker-<num>", 保证同一设备内唯一。
        is_connected 根据连接类型字段是否有值来判断：为空视为未连接。
        """
        items = []
        # 使用统一空值判断，确保 'nan/None/null/空字符串' 视为未连接
        connected_flag = not _is_empty(conn.connection_type)

        # 源侧
        if conn.source_device:
            dev = conn.source_device
            device_id = dev.id
            device_type = _safe_label(dev.device_type)
            station = _safe_label(dev.station)
            # fuse / breaker
            if conn.source_fuse_number:
                items.append((device_id, device_type, station, f"fuse-{conn.source_fuse_number}", connected_flag))
            if conn.source_breaker_number:
                items.append((device_id, device_type, station, f"breaker-{conn.source_breaker_number}", connected_flag))
            # 端口存在但未连接的情况：从 spec 信息中无法确定所有端口总数，这里仅统计出现在连接表中的端口。

        # 目标侧
        if conn.target_device:
            dev = conn.target_device
            device_id = dev.id
            device_type = _safe_label(dev.device_type)
            station = _safe_label(dev.station)
            if conn.target_fuse_number:
                items.append((device_id, device_type, station, f"fuse-{conn.target_fuse_number}", connected_flag))
            if conn.target_breaker_number:
                items.append((device_id, device_type, station, f"breaker-{conn.target_breaker_number}", connected_flag))

        return items

    def _aggregate_group_stats(self) -> Tuple[
        Dict[str, Dict[str, set]],  # by_type: {type: {devices, all_ports, connected_ports}}
        Dict[str, Dict[str, set]],  # by_station: {station: {devices, all_ports, connected_ports}}
        set,  # global_all_ports
        set,  # global_connected_ports
        set   # global_device_ids
    ]:
        by_type: Dict[str, Dict[str, set]] = {}
        by_station: Dict[str, Dict[str, set]] = {}
        global_all_ports: set = set()
        global_connected_ports: set = set()
        global_devices: set = set()

        connections: List[Connection] = self.db.query(Connection).all()

        for conn in connections:
            items = self._iter_ports_from_connection(conn)
            for device_id, device_type, station, port_key, is_connected in items:
                # 全局汇总
                global_all_ports.add((device_id, port_key))
                if is_connected:
                    global_connected_ports.add((device_id, port_key))
                global_devices.add(device_id)

                # 设备类型分组
                if device_type not in by_type:
                    by_type[device_type] = {
                        "devices": set(),
                        "all_ports": set(),
                        "connected_ports": set(),
                    }
                by_type[device_type]["devices"].add(device_id)
                by_type[device_type]["all_ports"].add((device_id, port_key))
                if is_connected:
                    by_type[device_type]["connected_ports"].add((device_id, port_key))

                # 站点分组
                if station not in by_station:
                    by_station[station] = {
                        "devices": set(),
                        "all_ports": set(),
                        "connected_ports": set(),
                    }
                by_station[station]["devices"].add(device_id)
                by_station[station]["all_ports"].add((device_id, port_key))
                if is_connected:
                    by_station[station]["connected_ports"].add((device_id, port_key))

        return by_type, by_station, global_all_ports, global_connected_ports, global_devices

    @staticmethod
    def _to_rate(used: int, total: int) -> float:
        if total <= 0:
            return 0.0
        return round(100.0 * used / total, 2)

    def get_utilization_rates(self) -> Dict:
        by_type, by_station, global_all_ports, global_connected_ports, global_devices = self._aggregate_group_stats()

        overall_total = len(global_all_ports)
        overall_used = len(global_connected_ports)
        overall_rate = self._to_rate(overall_used, overall_total)

        device_type_utilization = []
        for t, stats in by_type.items():
            total_ports = len(stats["all_ports"])
            used_ports = len(stats["connected_ports"]) 
            device_type_utilization.append({
                "device_type": t,
                "device_count": len(stats["devices"]),
                "total_ports": total_ports,
                "connected_ports": used_ports,
                "idle_ports": max(total_ports - used_ports, 0),
                "utilization_rate": self._to_rate(used_ports, total_ports),
            })

        station_utilization = []
        for s, stats in by_station.items():
            total_ports = len(stats["all_ports"]) 
            used_ports = len(stats["connected_ports"]) 
            station_utilization.append({
                "station": s,
                "device_count": len(stats["devices"]),
                "total_ports": total_ports,
                "connected_ports": used_ports,
                "idle_ports": max(total_ports - used_ports, 0),
                "utilization_rate": self._to_rate(used_ports, total_ports),
            })

        # 排序：按使用率降序
        device_type_utilization.sort(key=lambda x: x["utilization_rate"], reverse=True)
        station_utilization.sort(key=lambda x: x["utilization_rate"], reverse=True)

        return {
            "overall_utilization_rate": overall_rate,
            "device_type_utilization": device_type_utilization,
            "station_utilization": station_utilization,
        }

    def get_idle_rates(self) -> Dict:
        util = self.get_utilization_rates()
        overall_idle = round(100.0 - util.get("overall_utilization_rate", 0.0), 2)

        # 生成按站点的空闲率数据（可用于热点分析）
        station_idle = []
        for s in util.get("station_utilization", []):
            station_idle.append({
                "station": s["station"],
                "idle_rate": round(100.0 - s.get("utilization_rate", 0.0), 2),
                "idle_ports": s.get("idle_ports", 0),
                "total_ports": s.get("total_ports", 0),
            })
        station_idle.sort(key=lambda x: x["idle_rate"], reverse=True)

        return {
            "overall_idle_rate": overall_idle,
            "station_idle": station_idle,
        }

    def get_summary_dashboard(self) -> Dict:
        by_type, by_station, global_all_ports, global_connected_ports, global_devices = self._aggregate_group_stats()

        total_devices_db = self.db.query(Device).count()
        total_ports = len(global_all_ports)
        used_ports = len(global_connected_ports)
        overall_utilization = self._to_rate(used_ports, total_ports)
        overall_idle = round(100.0 - overall_utilization, 2)

        key_metrics = {
            "total_devices": total_devices_db,
            "total_ports": total_ports,
            "connected_ports": used_ports,
            "idle_ports": max(total_ports - used_ports, 0),
            "overall_utilization_rate": overall_utilization,
            "overall_idle_rate": overall_idle,
        }

        return {
            "key_metrics": key_metrics,
        }