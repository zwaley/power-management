(function () {
  'use strict';
  // 设备级拓扑渲染（仅显示选中设备的直接连接设备）

  function ensureNetwork() {
    const container = document.getElementById('topology-network');
    if (!container) return null;
    if (!container._network) {
      const data = { nodes: new vis.DataSet([]), edges: new vis.DataSet([]) };
      const options = {
        layout: { improvedLayout: false, hierarchical: { enabled: false } },
        physics: { enabled: false },
        interaction: { hover: true, dragNodes: true, dragView: true, zoomView: true },
        nodes: {
          shape: 'ellipse',
          margin: { top: 10, right: 14, bottom: 10, left: 14 },
          widthConstraint: { maximum: 240 },
          color: { background: '#cfe3ff', border: '#8bb3ff' },
          font: { size: 16, face: 'Microsoft YaHei UI', multi: 'html' }
        },
        edges: {
          arrows: { to: { enabled: true, scaleFactor: 1 } },
          color: { color: '#666', highlight: '#333' },
          smooth: { type: 'curvedCW', roundness: 0.25 }
        }
      };
      const network = new vis.Network(container, data, options);
      container._network = network;

      // 点击显示详情
      network.on('click', (params) => {
        if (!params || !params.nodes) return;
        const nodeId = params.nodes[0];
        const opt = container._lastNodesById && container._lastNodesById[nodeId];
        const ds = (window.TopologyPage && typeof window.TopologyPage.getDeviceBrief === 'function')
          ? window.TopologyPage.getDeviceBrief(nodeId)
          : null;
        const data = Object.assign({}, opt || {}, ds || {});
        if (window.TopologyPage && window.TopologyPage.updateDetails) window.TopologyPage.updateDetails(data);
      });

      // 悬停显示详情
      network.on('hoverNode', (params) => {
        if (!params || !params.node) return;
        const nodeId = params.node;
        const opt = container._lastNodesById && container._lastNodesById[nodeId];
        const ds = (window.TopologyPage && typeof window.TopologyPage.getDeviceBrief === 'function')
          ? window.TopologyPage.getDeviceBrief(nodeId)
          : null;
        const data = Object.assign({}, opt || {}, ds || {});
        if (window.TopologyPage && window.TopologyPage.updateDetails) window.TopologyPage.updateDetails(data);
      });
    }
    return container._network;
  }

  async function fetchTopology(deviceId) {
    const params = new URLSearchParams({ level: 'device' });
    const resp = await fetch(`/api/power-chain/${deviceId}?${params.toString()}`);
    if (!resp.ok) throw new Error('设备级拓扑API响应失败');
    const json = await resp.json();
    if (!json || !json.nodes || !json.edges) throw new Error('设备级拓扑数据格式错误');
    return json;
  }

  function toVisData(raw) {
    const nodes = Array.isArray(raw.nodes) ? raw.nodes.map(n => {
      const label =
        (n.label && String(n.label).trim()) ||
        (n.device && String(n.device).trim()) ||
        (n.device_name && String(n.device_name).trim()) ||
        (n.name && String(n.name).trim()) ||
        (n.meta && n.meta.device_name && String(n.meta.device_name).trim()) ||
        String(n.id);
      const title = n.title || label || '';
      const level = typeof n.level === 'number' ? n.level : 0;
      return { id: n.id, label, title, level };
    }) : [];
    const edges = Array.isArray(raw.edges) ? raw.edges.map(e => ({
      from: e.from,
      to: e.to,
      label: e.label || '',
      arrows: 'to',
      title: e.title || e.label || ''
    })) : [];

    // 保存节点索引用于详情
    const byId = {};
    nodes.forEach(n => { byId[n.id] = n; });
    const container = document.getElementById('topology-network');
    if (container) container._lastNodesById = byId;

    return { nodes: new vis.DataSet(nodes), edges: new vis.DataSet(edges) };
  }

  // 基于中心设备的径向布局，避免节点重叠，提升整洁度
  function applyRadialLayout(visData, centerId) {
    try {
      const container = document.getElementById('topology-network');
      const w = (container && container.clientWidth) || 1000;
      const h = (container && container.clientHeight) || 600;
      const cx = Math.round(w / 2);
      const cy = Math.round(h / 2);

      const nodes = visData.nodes.get();
      const edges = visData.edges.get();

      // 规范化ID并记录原始ID，避免字符串/数字不一致导致新增空节点
      const norm = (x) => String(x);
      const idMap = new Map(); // normId -> original id
      nodes.forEach(n => idMap.set(norm(n.id), n.id));

      // 统计度数
      const degree = new Map(); // normId -> degree
      edges.forEach(e => {
        const from = norm(e.from), to = norm(e.to);
        degree.set(from, (degree.get(from) || 0) + 1);
        degree.set(to, (degree.get(to) || 0) + 1);
      });

      // 选择中心ID（保持原始类型）
      const centerKey = norm(centerId);
      let hubKey = idMap.has(centerKey) ? centerKey : null;
      if (!hubKey) {
        let max = -1, maxKey = null;
        idMap.forEach((origId, key) => {
          const d = degree.get(key) || 0;
          if (d > max) { max = d; maxKey = key; }
        });
        hubKey = maxKey || (nodes[0] ? norm(nodes[0].id) : null);
      }
      const hubId = idMap.get(hubKey);

      // 计算直接邻居（保持原始ID）
      const neighborKeys = [];
      const neighborSet = new Set();
      edges.forEach(e => {
        const from = norm(e.from), to = norm(e.to);
        if (from === hubKey && !neighborSet.has(to)) { neighborSet.add(to); neighborKeys.push(to); }
        if (to === hubKey && !neighborSet.has(from)) { neighborSet.add(from); neighborKeys.push(from); }
      });
      const neighborIds = neighborKeys.map(k => idMap.get(k)).filter(Boolean);

      const R = Math.min(Math.round(Math.min(w, h) * 0.38), 320);
      const count = neighborIds.length || 1;
      const step = (Math.PI * 2) / count;

      // 布置中心点（使用原始ID）— 初始位置可拖拽
      if (hubId != null) visData.nodes.update({ id: hubId, x: cx, y: cy, fixed: false });

      // 均匀分布邻居在圆周上（使用原始ID）— 初始位置可拖拽
      neighborIds.forEach((nid, idx) => {
        const angle = idx * step;
        const x = Math.round(cx + R * Math.cos(angle));
        const y = Math.round(cy + R * Math.sin(angle));
        visData.nodes.update({ id: nid, x, y, fixed: false });
      });

      // 其他未直接连接中心的节点，放置在圆环外一层 — 初始位置可拖拽
      nodes.forEach(n => {
        const key = norm(n.id);
        if (key !== hubKey && !neighborSet.has(key)) {
          const angle = Math.random() * Math.PI * 2;
          const x = Math.round(cx + (R + 140) * Math.cos(angle));
          const y = Math.round(cy + (R + 140) * Math.sin(angle));
          visData.nodes.update({ id: n.id, x, y, fixed: false });
        }
      });
    } catch (e) {
      console.warn('应用径向布局失败', e);
    }
  }

  function renderVis(visData) {
    const network = ensureNetwork();
    if (!network) return;
    network.setData(visData);
    network.fit({ animation: false });
  }

  async function render(deviceId) {
    try {
      const raw = await fetchTopology(deviceId);
      const visData = toVisData(raw);
      const container = document.getElementById('topology-network');
      if (container) container._centerId = deviceId;
      // 根据当前布局选择渲染策略
      const layoutSel = document.getElementById('layout-select');
      const layoutName = (layoutSel && layoutSel.value) || (container && container._layoutName) || 'standard';
      const network = ensureNetwork();
      if (layoutName === 'bus') {
        network && network.setOptions({
          layout: { hierarchical: { enabled: true, direction: 'LR', sortMethod: 'directed', nodeSpacing: 160, levelSeparation: 220 } },
          physics: { enabled: true, solver: 'hierarchicalRepulsion', springLength: 200, nodeDistance: 170, damping: 0.35, stabilization: { iterations: 150, updateInterval: 25 } },
          edges: { smooth: { enabled: false }, arrows: { to: { enabled: true } } }
        });
        renderVis(visData);
        network && network.stabilize(100);
      } else {
        // 默认使用径向布局：节点均匀分布在中心周围，避免重叠（可拖拽）
        network && network.setOptions({ layout: { improvedLayout: false, hierarchical: { enabled: false } }, physics: { enabled: false }, interaction: { dragNodes: true, dragView: true, zoomView: true }, edges: { smooth: { type: 'curvedCW', roundness: 0.25 } } });
        applyRadialLayout(visData, deviceId);
        renderVis(visData);
      }
    } catch (e) {
      console.warn('渲染设备级拓扑失败', e);
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
    const container = document.getElementById('topology-network');
    if (container) container._layoutName = name || 'standard';
    if (container && container._network) {
      const centerId = container._centerId;
      if (centerId) {
        // 重新渲染以应用新的布局
        render(centerId);
      } else {
        container._network.fit({ animation: false });
      }
    }
  }

  window.TopologyDevice = { render, resize, setLayout };
})();