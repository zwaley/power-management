(function () {
  'use strict';

  async function fetchTopology(deviceId) {
    // 优先使用正式端点，其次尝试别名与旧版兼容
    const urls = [
      `/api/port-topology/${deviceId}`,
      `/api/topology/ports/${deviceId}`,
      `/api/port_topology?device_id=${deviceId}`
    ];
    let lastError = null;
    for (const url of urls) {
      try {
        const res = await fetch(url);
        if (res.ok) {
          const json = await res.json();
          // 基本有效性检查：存在 nodes/edges 或左右端口结构
          if (json && (Array.isArray(json.nodes) || Array.isArray(json.edges) || json.left_ports || json.right_ports)) {
            return json;
          }
          lastError = new Error(`Invalid payload from ${url}`);
        } else {
          lastError = new Error(`HTTP ${res.status} on ${url}`);
        }
      } catch (e) {
        lastError = e;
      }
    }
    throw lastError || new Error('无法获取端口拓扑数据');
  }

  function formatTooltip(lines) {
    return lines.filter(Boolean).join('\n');
  }

  // 通用字段别名选择器：返回第一个存在且非空的值
  function pick(obj, keys, fallback) {
    for (const k of keys) {
      const v = obj && obj[k];
      if (v !== undefined && v !== null && String(v) !== '') return v;
    }
    return fallback;
  }

  function toVisData(raw, opts = {}) {
    const { deviceId, deviceLabel } = opts;
    let nodes = [];
    const edges = [];

    // 节点尺寸：适当缩小端口节点
    const nodeSizePortA = 9; // 本端(A端)更小
    const nodeSizePortB = 12; // 对端(B端)稍小
    const nodeSizeDevice = 24;

    const leftPorts = raw.left_ports || [];
    const rightPorts = raw.right_ports || [];

    let centerId = raw.center_device_id || raw.center_id || deviceId || (raw.device_id);
    const centerLabel = raw.center_device_name || raw.device_name || deviceLabel || `设备#${centerId || ''}`;

    const centerBrief = (window.TopologyPage && window.TopologyPage.getDeviceBrief) ? window.TopologyPage.getDeviceBrief(centerId) : null;
    const centerTitle = formatTooltip([
      `设备: ${centerLabel}`,
      centerBrief?.vendor && `厂家: ${centerBrief.vendor}`,
      centerBrief?.model && `型号: ${centerBrief.model}`,
      (centerBrief?.power_rating) && `额定容量: ${centerBrief.power_rating}`,
      centerBrief?.lifecycle_status && `生命周期: ${centerBrief.lifecycle_status}`,
      centerBrief?.commission_date && `投产日期: ${centerBrief.commission_date}`,
      centerBrief?.location && `位置: ${centerBrief.location}`,
    ]);
    nodes.push({ id: String(centerId), label: centerLabel, nodeType: 'device', shape: 'box', size: nodeSizeDevice, title: centerTitle });

    const makeY = (i, side) => ((i + 1) * 30 - 15);

    leftPorts.forEach((p, i) => {
      const id = p.id || `L${i + 1}`;
      const portName = pick(p, ['port_name', 'name', 'label', 'port', 'code'], `L${i + 1}`);
      const fuseNumber = pick(p, ['fuse_number', 'a_fuse_number', 'source_fuse_number', 'fuse_no', 'fuseNo', 'fuse_index']);
      const fuseSpec = pick(p, ['fuse_spec', 'a_fuse_spec', 'source_fuse_spec', 'fuse_model', 'spec', 'model']);
      const breakerNumber = pick(p, ['breaker_number', 'a_breaker_number', 'source_breaker_number', 'breaker_no', 'breakerNo']);
      const breakerSpec = pick(p, ['breaker_spec', 'a_breaker_spec', 'source_breaker_spec', 'breaker_model']);
      const ratedCurrent = pick(p, ['rated_current', 'a_rated_current', 'current', 'rated_amperage', 'amperage', 'current_rating']);

      const y = p.y ?? makeY(i, 'left');
      const x = p.x ?? -300;
      const title = formatTooltip([
        `端口: ${portName}`,
        fuseSpec && `型号: ${fuseSpec}`,
        ratedCurrent && `额定电流: ${ratedCurrent}`,
        fuseNumber && `熔丝/空开编号: ${fuseNumber}`,
        breakerNumber && `空开编号: ${breakerNumber}`,
        breakerSpec && `空开型号: ${breakerSpec}`,
      ]);
      nodes.push({ id: `left-${id}`, label: portName, nodeType: 'port', side: 'left', shape: 'dot', size: nodeSizePortA, x, y, title,
        port_name: portName, fuse_number: fuseNumber, fuse_spec: fuseSpec, breaker_number: breakerNumber, breaker_spec: breakerSpec, rated_current: ratedCurrent });
      const edgeId = `e-left-${id}`;
      edges.push({ id: edgeId, from: `left-${id}`, to: String(centerId), color: '#5b8ff9' });
    });

    rightPorts.forEach((p, i) => {
      const id = p.id || `R${i + 1}`;
      const portName = pick(p, ['port_name', 'name', 'label', 'port', 'code'], `R${i + 1}`);
      const fuseNumber = pick(p, ['fuse_number', 'b_fuse_number', 'target_fuse_number', 'fuse_no', 'fuseNo', 'fuse_index']);
      const fuseSpec = pick(p, ['fuse_spec', 'b_fuse_spec', 'target_fuse_spec', 'fuse_model', 'spec', 'model']);
      const breakerNumber = pick(p, ['breaker_number', 'b_breaker_number', 'target_breaker_number', 'breaker_no', 'breakerNo']);
      const breakerSpec = pick(p, ['breaker_spec', 'b_breaker_spec', 'target_breaker_spec', 'breaker_model']);
      const ratedCurrent = pick(p, ['rated_current', 'b_rated_current', 'current', 'rated_amperage', 'amperage', 'current_rating']);

      const y = p.y ?? makeY(i, 'right');
      const x = p.x ?? 300;
      const title = formatTooltip([
        `端口: ${portName}`,
        fuseSpec && `型号: ${fuseSpec}`,
        ratedCurrent && `额定电流: ${ratedCurrent}`,
        fuseNumber && `熔丝/空开编号: ${fuseNumber}`,
        breakerNumber && `空开编号: ${breakerNumber}`,
        breakerSpec && `空开型号: ${breakerSpec}`,
      ]);
      nodes.push({ id: `right-${id}`, label: portName, nodeType: 'port', side: 'right', shape: 'dot', size: nodeSizePortB, x, y, title,
        port_name: portName, fuse_number: fuseNumber, fuse_spec: fuseSpec, breaker_number: breakerNumber, breaker_spec: breakerSpec, rated_current: ratedCurrent });
      const edgeId = `e-right-${id}`;
      edges.push({ id: edgeId, from: `right-${id}`, to: String(centerId), color: '#5b8ff9' });
    });

    // 合并后端可能返回的其他节点与边，并避免中心设备重复
    const centerIdStr = String(centerId);
    const duplicateCenterIds = new Set();
    (raw.nodes || []).forEach(n => {
      const nId = String(n.id);
      const nType = String(n.nodeType || n.type || '').toLowerCase();
      const isCenterDuplicate = (nId === centerIdStr)
        || (nId === 'center' || nId === 'center_device' || nId === 'selected_device')
        || (nType === 'device' && (String(n.label || '') === String(centerLabel || '')))
        || (String(n.label || '') === String(centerLabel || ''));
      if (isCenterDuplicate) { duplicateCenterIds.add(nId); return; }

      if (!nodes.some(x => String(x.id) === nId)) {
        const dTitle = formatTooltip([
          n.label && `设备: ${n.label}`,
          n.vendor && `厂家: ${n.vendor}`,
          n.model && `型号: ${n.model}`,
          (n.rated_capacity || n.power_rating) && `额定容量: ${n.rated_capacity || n.power_rating}`,
          n.lifecycle_status && `生命周期: ${n.lifecycle_status}`,
          n.commission_date && `投产日期: ${n.commission_date}`,
          n.location && `位置: ${n.location}`,
        ]);
        nodes.push({ ...n, title: n.title || dTitle });
      }
    });
    (raw.edges || []).forEach(e => edges.push(e));

    // 将所有指向重复中心或别名中心的边统一重写到唯一中心ID
    const aliasCenterIds = new Set([centerIdStr, 'center', 'center_device', 'selected_device']);
    duplicateCenterIds.forEach(id => aliasCenterIds.add(id));
    edges.forEach(e => {
      const f = String(e.from);
      const t = String(e.to);
      if (aliasCenterIds.has(f)) e.from = centerIdStr;
      if (aliasCenterIds.has(t)) e.to = centerIdStr;
    });

    // 计算各节点度数，用于孤点清理（主要清理重复中心的“孤零零”标签）
    const degree = {};
    edges.forEach(e => {
      const f = String(e.from);
      const t = String(e.to);
      degree[f] = (degree[f] || 0) + 1;
      degree[t] = (degree[t] || 0) + 1;
    });
    nodes = nodes.filter(n => {
      const lbl = String(n.label || '');
      if (lbl === String(centerLabel || '')) {
        const d = degree[String(n.id)] || 0;
        // 保留有连线的中心或id匹配的中心，清理孤点
        if ((String(n.id) === centerIdStr) || d > 0) return true;
        return false;
      }
      return true;
    });

    return { nodes, edges };
  }

  function ensureNetwork() {
    if (!window.vis) return null;
    const container = document.getElementById('topology-network');
    if (!container) return null;

    const options = {
      physics: false,
      interaction: { hover: true },
      nodes: { font: { color: '#333' } },
      edges: { color: { inherit: false } },
    };
    const network = new vis.Network(container, { nodes: [], edges: [] }, options);
    // 将网络实例挂到容器上，便于 resize 时访问
    container._network = network;

    network.on('hoverNode', (params) => {
      const id = params.node;
      const data = network?.body?.data?.nodes?.get(id) || network.body.nodes[id]?.options || {};
      if (window.TopologyPage && window.TopologyPage.updateDetails) window.TopologyPage.updateDetails(data);
    });
    network.on('selectNode', (params) => {
      const id = params.nodes && params.nodes[0];
      const data = network?.body?.data?.nodes?.get(id) || network.body.nodes[id]?.options || {};
      if (window.TopologyPage && window.TopologyPage.updateDetails) window.TopologyPage.updateDetails(data);
    });

    return network;
  }

  function renderVis(visData) {
    const network = ensureNetwork();
    if (!network) return;
    network.setData(visData);
    network.fit({ animation: false });
  }

  async function render(deviceId, deviceLabel) {
    try {
      const raw = await fetchTopology(deviceId);
      const visData = toVisData(raw, { deviceId, deviceLabel });
      renderVis(visData);
    } catch (e) {
      console.warn('渲染端口拓扑失败', e);
    }
  }

  function resize() {
    const container = document.getElementById('topology-network');
    if (container && container._network) {
      try {
        container._network.redraw();
        container._network.fit({ animation: false });
      } catch (_) {}
    }
  }

  function setLayout(name) {
    // 预留：后续可支持多布局
  }

  window.TopologyPorts = { render, setLayout, resize };
})();