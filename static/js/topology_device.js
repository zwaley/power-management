(function () {
  'use strict';
  // 设备级拓扑渲染（仅显示选中设备的直接连接设备）

  function ensureNetwork() {
    const container = document.getElementById('topology-network');
    if (!container) return null;
    if (!container._network) {
      const data = { nodes: new vis.DataSet([]), edges: new vis.DataSet([]) };
      const options = {
        physics: false,
        layout: {
          hierarchical: {
            direction: 'LR',
            sortMethod: 'directed',
            nodeSpacing: 120,
            levelSeparation: 180,
          }
        },
        nodes: {
          shape: 'box',
          margin: 10,
          color: { background: '#cfe3ff', border: '#8bb3ff' },
          font: { size: 14 }
        },
        edges: {
          arrows: { to: { enabled: true } },
          color: { color: '#666', highlight: '#333' },
          smooth: {
            type: 'dynamic'
          }
        }
      };
      const network = new vis.Network(container, data, options);
      container._network = network;

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
    const nodes = Array.isArray(raw.nodes) ? raw.nodes.map(n => ({
      id: n.id,
      label: n.label,
      title: n.title || '',
      level: typeof n.level === 'number' ? n.level : 0
    })) : [];
    const edges = Array.isArray(raw.edges) ? raw.edges.map(e => ({
      from: e.from,
      to: e.to,
      label: e.label || '',
      arrows: 'to'
    })) : [];

    // 保存节点索引用于详情
    const byId = {};
    nodes.forEach(n => { byId[n.id] = n; });
    const container = document.getElementById('topology-network');
    if (container) container._lastNodesById = byId;

    return { nodes: new vis.DataSet(nodes), edges: new vis.DataSet(edges) };
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
      renderVis(visData);
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
    if (container && container._network) {
      container._network.fit({ animation: false });
    }
  }

  window.TopologyDevice = { render, resize, setLayout };
})();