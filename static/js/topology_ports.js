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

    // 节点尺寸：A端更大，B端更小（符合用户UI习惯）
    const nodeSizePortA = 12; // A端（左侧）更大
    const nodeSizePortB = 9;  // B端（右侧）更小
    const nodeSizeDevice = 24;

    const leftPorts = raw.left_ports || [];
    const rightPorts = raw.right_ports || [];

    let centerId = raw.center_device_id || raw.center_id || deviceId || (raw.device_id);
    let centerLabel = raw.center_device_name || raw.device_name || deviceLabel || `设备#${centerId || ''}`;

    // 优先使用后端返回的中心设备节点，避免重复
    const rawNodes = Array.isArray(raw.nodes) ? raw.nodes : [];
    const normalize = (s) => String(s || '').replace(/\s+/g, '').toLowerCase();
    let rawCenter = null;
    for (const n of rawNodes) {
      const nid = String(n.id);
      const ntype = String(n.nodeType || n.type || '').toLowerCase();
      const nlabel = normalize(n.label);
      if (ntype === 'device' && (
            nid === `device_${centerId}` ||
            nid === String(centerId) ||
            nid === 'selected_device' ||
            (centerLabel && nlabel === normalize(centerLabel))
          )) {
        rawCenter = n;
        break;
      }
    }
    if (rawCenter) {
      centerId = String(rawCenter.id);
      centerLabel = rawCenter.label || centerLabel;
    }

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
    // 只有在后端未提供中心节点时才创建本地中心节点
    if (!rawCenter) {
      nodes.push({ id: String(centerId), label: centerLabel, nodeType: 'device', shape: 'box', size: nodeSizeDevice, title: centerTitle });
    }

    const makeY = (i, side) => ((i + 1) * 30 - 15);

    leftPorts.forEach((p, i) => {
      const id = p.id || `L${i + 1}`;
      const portCode = pick(p, ['port_code', 'code', 'port', 'port_id', 'label'], `L${i + 1}`);
      const portName = pick(p, ['a_fuse_number', 'a_breaker_number', 'source_fuse_number', 'source_breaker_number', 'port_name', 'name', 'port_label', 'label', 'port_code', 'code'], undefined);
      const status = pick(p, ['status', 'port_status'], undefined);
      const fuseNumber = pick(p, ['a_fuse_number', 'source_fuse_number', 'fuse_number']);
      const fuseSpec = pick(p, ['a_fuse_spec', 'source_fuse_spec', 'fuse_spec']);
      const breakerNumber = pick(p, ['a_breaker_number', 'source_breaker_number', 'breaker_number']);
      const breakerSpec = pick(p, ['a_breaker_spec', 'source_breaker_spec', 'breaker_spec']);
      const ratedCurrent = pick(p, ['a_rated_current', 'rated_current', 'current', 'rated_amperage', 'amperage', 'current_rating']);
      const connDevice = pick(p, ['connected_device', 'connected_device_info', 'device_name', 'connected_device_name', 'connected_device_label']);
      const connPort = pick(p, ['connected_port', 'connected_port_info', 'remote_port', 'target_port', 'source_port']);
      const cableModel = pick(p, ['cable_model', 'connection_cable_model', 'edge_cable_model']);

      const y = p.y ?? makeY(i, 'left');
      const x = p.x ?? -300;
      const title = formatTooltip([
        `端口名称: ${portName || portCode}`,
        ratedCurrent && `额定电流: ${ratedCurrent}`,
        (fuseNumber || breakerNumber) && `熔丝/空开编号: ${[fuseNumber, breakerNumber].filter(Boolean).join('、')}`,
        (fuseSpec || breakerSpec) && `熔丝/空开规格: ${[fuseSpec, breakerSpec].filter(Boolean).join('、')}`,
        (connDevice || connPort) && `连接: ${[connDevice, connPort].filter(Boolean).join(' ')}`,
        cableModel && `电缆型号: ${cableModel}`,
      ]);
      nodes.push({ id: `left-${id}`, label: portName || portCode, nodeType: 'port', side: 'left', shape: 'dot', size: nodeSizePortA, x, y, title,
        port_code: portCode, port_name: portName || portCode, status, fuse_number: fuseNumber, fuse_spec: fuseSpec, breaker_number: breakerNumber, breaker_spec: breakerSpec, port_spec: (fuseSpec || breakerSpec), rated_current: ratedCurrent,
        connected_device: connDevice, connected_port: connPort, cable_model: cableModel });
      const edgeId = `e-left-${id}`;
      edges.push({ id: edgeId, from: `left-${id}`, to: String(centerId), color: '#5b8ff9' });
    });

    rightPorts.forEach((p, i) => {
      const id = p.id || `R${i + 1}`;
      const portCode = pick(p, ['port_code', 'code', 'port', 'port_id', 'label'], `R${i + 1}`);
      const portName = pick(p, ['b_fuse_number', 'b_breaker_number', 'target_fuse_number', 'target_breaker_number', 'port_name', 'name', 'port_label', 'label', 'port_code', 'code'], undefined);
      const status = pick(p, ['status', 'port_status'], undefined);
      const fuseNumber = pick(p, ['b_fuse_number', 'target_fuse_number', 'fuse_number']);
      const fuseSpec = pick(p, ['b_fuse_spec', 'target_fuse_spec', 'fuse_spec']);
      const breakerNumber = pick(p, ['b_breaker_number', 'target_breaker_number', 'breaker_number']);
      const breakerSpec = pick(p, ['b_breaker_spec', 'target_breaker_spec', 'breaker_spec']);
      const ratedCurrent = pick(p, ['b_rated_current', 'rated_current', 'current', 'rated_amperage', 'amperage', 'current_rating']);
      const connDevice = pick(p, ['connected_device', 'connected_device_info', 'device_name', 'connected_device_name', 'connected_device_label']);
      const connPort = pick(p, ['connected_port', 'connected_port_info', 'remote_port', 'target_port', 'source_port']);
      const cableModel = pick(p, ['cable_model', 'connection_cable_model', 'edge_cable_model']);

      const y = p.y ?? makeY(i, 'right');
      const x = p.x ?? 300;
      const title = formatTooltip([
        `端口名称: ${portName || portCode}`,
        ratedCurrent && `额定电流: ${ratedCurrent}`,
        (fuseNumber || breakerNumber) && `熔丝/空开编号: ${[fuseNumber, breakerNumber].filter(Boolean).join('、')}`,
        (fuseSpec || breakerSpec) && `熔丝/空开规格: ${[fuseSpec, breakerSpec].filter(Boolean).join('、')}`,
        (connDevice || connPort) && `连接: ${[connDevice, connPort].filter(Boolean).join(' ')}`,
        cableModel && `电缆型号: ${cableModel}`,
      ]);
      nodes.push({ id: `right-${id}`, label: portName || portCode, nodeType: 'port', side: 'right', shape: 'dot', size: nodeSizePortB, x, y, title,
        port_code: portCode, port_name: portName || portCode, status, fuse_number: fuseNumber, fuse_spec: fuseSpec, breaker_number: breakerNumber, breaker_spec: breakerSpec, port_spec: (fuseSpec || breakerSpec), rated_current: ratedCurrent,
        connected_device: connDevice, connected_port: connPort, cable_model: cableModel });
      const edgeId = `e-right-${id}`;
      edges.push({ id: edgeId, from: `right-${id}`, to: String(centerId), color: '#5b8ff9' });
    });

    // 合并后端可能返回的其他节点与边，并避免中心设备重复
    const centerIdStr = String(centerId);
    const duplicateCenterIds = new Set();
    (raw.nodes || []).forEach(n => {
      const nId = String(n.id);
      const nType = String(n.nodeType || n.type || '').toLowerCase();
      const sameLabelAsCenter = normalize(n.label) === normalize(centerLabel);
      const isAliasCenter = (nId === 'center' || nId === 'center_device' || nId === 'selected_device') || (nType === 'device' && sameLabelAsCenter && nId !== centerIdStr);
      if (isAliasCenter) { duplicateCenterIds.add(nId); return; }

      if (!nodes.some(x => String(x.id) === nId)) {
        if (nType === 'port') {
          const portCode = pick(n, ['port_code', 'code', 'port', 'port_id']);
          const portName = pick(n, ['port_name', 'name', 'port_label', 'label', 'code', 'port'], n.label || nId);
          const status = pick(n, ['status', 'port_status']);
          const ratedCurrent = pick(n, ['rated_current', 'current', 'rated_amperage', 'amperage', 'current_rating']);
          const fuseSpec = pick(n, ['fuse_spec', 'spec', 'model']);
          const fuseNumber = pick(n, ['fuse_number', 'fuse_no', 'fuseNo', 'fuse_index']);
          const breakerNumber = pick(n, ['breaker_number', 'breaker_no', 'breakerNo']);
          const breakerSpec = pick(n, ['breaker_spec', 'breaker_model']);
          const pTitle = formatTooltip([
            `端口名称: ${portName || portCode}`,
            ratedCurrent && `额定电流: ${ratedCurrent}`,
            (fuseNumber || breakerNumber) && `熔丝/空开编号: ${[fuseNumber, breakerNumber].filter(Boolean).join('、')}`,
            (fuseSpec || breakerSpec) && `熔丝/空开规格: ${[fuseSpec, breakerSpec].filter(Boolean).join('、')}`,
          ]);
          nodes.push({ ...n, nodeType: 'port', label: n.label || portName || portCode, port_code: portCode, port_name: portName || portCode, status, rated_current: ratedCurrent, fuse_spec: fuseSpec, fuse_number: fuseNumber, breaker_number: breakerNumber, breaker_spec: breakerSpec, title: n.title || pTitle });
        } else {
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
      }
    });
    (raw.edges || []).forEach(e => edges.push(e));

    // 将所有指向重复中心或别名中心的边统一重写到唯一中心ID
    const aliasCenterIds = new Set([
      centerIdStr,
      'center', 'center_device', 'selected_device',
      `device_${centerIdStr}`
    ]);
    edges.forEach(e => {
      if (aliasCenterIds.has(String(e.to))) e.to = centerIdStr;
      if (aliasCenterIds.has(String(e.from))) e.from = centerIdStr;
    });

    // 追加渲染后端未返回的中心节点
    if (!nodes.some(n => String(n.id) === centerIdStr)) {
      nodes.push({ id: centerIdStr, label: centerLabel, nodeType: 'device', shape: 'box', size: nodeSizeDevice, title: centerTitle });
    }

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
    container._network = network;

    network.on('hoverNode', (params) => {
      const id = params.node;
      const ds = network?.body?.data?.nodes?.get(id);
      const opt = network?.body?.nodes?.[id]?.options;
      const data = Object.assign({}, opt || {}, ds || {});
      if (window.TopologyPage && window.TopologyPage.updateDetails) window.TopologyPage.updateDetails(data);
    });
    network.on('selectNode', (params) => {
      const id = params.nodes && params.nodes[0];
      const ds = network?.body?.data?.nodes?.get(id);
      const opt = network?.body?.nodes?.[id]?.options;
      const data = Object.assign({}, opt || {}, ds || {});
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
    // 占位：切换不同布局
    const container = document.getElementById('topology-network');
    if (container && container._network) {
      container._network.fit({ animation: false });
    }
  }

  window.TopologyPorts = { render, resize, setLayout };
})();