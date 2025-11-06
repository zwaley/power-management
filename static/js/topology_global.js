(() => {
  'use strict';

  function ensureNetwork() {
    const container = document.getElementById('topology-network');
    if (!container) return null;
    if (!container._network) {
      const data = { nodes: new vis.DataSet([]), edges: new vis.DataSet([]) };
      const options = {
        layout: { improvedLayout: true, hierarchical: { enabled: false } },
        // 默认关闭物理引擎：节点不自动漂移，拖拽后位置保持
        physics: { enabled: false },
        interaction: { hover: true, dragNodes: true, dragView: true, zoomView: true },
        nodes: {
          shape: 'ellipse',
          // 缩小节点与字体，便于提升可读性
          margin: { top: 6, right: 10, bottom: 6, left: 10 },
          widthConstraint: { maximum: 160 },
          color: { background: '#e7f0ff', border: '#9bbdf9' },
          font: { size: 12, face: 'Microsoft YaHei UI', multi: 'html' }
        },
        edges: {
          arrows: { to: { enabled: false }, from: { enabled: false } },
          color: { color: '#9ca3af', highlight: '#6b7280' },
          width: 1,
          smooth: { type: 'dynamic' }
        }
      };
      const network = new vis.Network(container, data, options);
      container._network = network;

      // 点击与悬停：展示设备详情
      const update = (nodeId) => {
        const opt = container._lastNodesById && container._lastNodesById[nodeId];
        const ds = (window.TopologyPage && typeof window.TopologyPage.getDeviceBrief === 'function')
          ? window.TopologyPage.getDeviceBrief(nodeId)
          : null;
        const data = Object.assign({}, opt || {}, ds || {});
        if (window.TopologyPage && window.TopologyPage.updateDetails) window.TopologyPage.updateDetails(data);
      };
      network.on('click', (params) => { if (params && params.nodes && params.nodes[0] != null) update(params.nodes[0]); });
      network.on('hoverNode', (params) => { if (params && params.node != null) update(params.node); });
    }
    return container._network;
  }

  async function fetchGlobal({ station, deviceType }) {
    const params = new URLSearchParams();
    if (station) params.set('station', station);
    if (deviceType) params.set('device_type', deviceType);
    const resp = await fetch(`/api/topology/global?${params.toString()}`);
    if (!resp.ok) throw new Error('全局设备拓扑API响应失败');
    const json = await resp.json();
    if (!json || !json.nodes || !json.edges) throw new Error('全局设备拓扑数据格式错误');
    return json;
  }

  // 将长名称格式化为两行显示
  function formatTwoLineLabel(str) {
    const s = (str == null ? '' : String(str)).trim();
    if (!s) return '';
    // 首选常见分隔符进行换行
    const delims = ['，', '、', '_', '-', ' '];
    for (let i = 0; i < delims.length; i++) {
      const d = delims[i];
      if (s.includes(d)) {
        const idx = s.indexOf(d);
        if (idx > 0 && idx < s.length - 1) {
          // 去掉分隔符本身，避免多余字符
          return s.slice(0, idx) + '\n' + s.slice(idx + 1);
        }
      }
    }
    // 无分隔符时，按中位附近切分
    const mid = Math.max(8, Math.floor(s.length / 2));
    return s.slice(0, mid) + '\n' + s.slice(mid);
  }

  function toVisData(raw) {
    const nodes = Array.isArray(raw.nodes) ? raw.nodes
      .map(n => {
        const nm = (n.label != null ? String(n.label) : (n.name != null ? String(n.name) : '')).trim();
        const nmLower = nm.toLowerCase();
        // 过滤非法标签：空/NaN/nan/null/none
        if (!nm || nmLower === 'nan' || nmLower === 'na' || nmLower === 'null' || nmLower === 'none') return null;
        const title = n.title || nm || '';
        // 两行标签显示
        const label = formatTwoLineLabel(nm);
        return { id: n.id, label, title };
      })
      .filter(Boolean) : [];
    const edges = Array.isArray(raw.edges) ? raw.edges.map(e => ({
      from: e.from,
      to: e.to,
      label: e.label || '',
      arrows: { to: { enabled: false }, from: { enabled: false } },
      color: { color: '#9ca3af' }
    })) : [];

    // 保存节点用于详情
    const byId = {}; nodes.forEach(n => { byId[n.id] = n; });
    const container = document.getElementById('topology-network');
    if (container) container._lastNodesById = byId;

    return { nodes: new vis.DataSet(nodes), edges: new vis.DataSet(edges) };
  }

  // —— 总线模式：BFS 分层 + 栅格坐标定位（LR）以显著减少交叉与重叠 ——
  function applyBusGridLayout(visData) {
    try {
      const nodesArr = visData && visData.nodes && visData.nodes.get ? visData.nodes.get() : [];
      const edgesArr = visData && visData.edges && visData.edges.get ? visData.edges.get() : [];
      if (!nodesArr.length) return;

      const ids = nodesArr.map(n => n.id);
      const deg = new Map(ids.map(id => [id, 0]));
      const adj = new Map(ids.map(id => [id, new Set()]));
      edgesArr.forEach(e => {
        if (deg.has(e.from)) deg.set(e.from, (deg.get(e.from) || 0) + 1);
        if (deg.has(e.to)) deg.set(e.to, (deg.get(e.to) || 0) + 1);
        if (adj.has(e.from)) adj.get(e.from).add(e.to);
        if (adj.has(e.to)) adj.get(e.to).add(e.from);
      });

      // 选择度数最高的节点作为根（bus 起点），保证分层稳定
      let hub = ids[0];
      let maxDeg = -1;
      ids.forEach(id => { const d = deg.get(id) || 0; if (d > maxDeg) { maxDeg = d; hub = id; } });

      // BFS 计算 level
      const level = new Map();
      const q = [];
      level.set(hub, 0); q.push(hub);
      while (q.length) {
        const cur = q.shift();
        const lv = level.get(cur) || 0;
        adj.get(cur).forEach(n => { if (!level.has(n)) { level.set(n, lv + 1); q.push(n); } });
      }
      // 处理可能的非连通节点
      let maxLv = 0; level.forEach(v => { if (v > maxLv) maxLv = v; });
      ids.forEach(id => { if (!level.has(id)) level.set(id, maxLv + 1); });

      // 按 level 分桶，并在桶内按父层重心排序以减少交叉
      const buckets = new Map();
      ids.forEach(id => {
        const lv = level.get(id) || 0;
        if (!buckets.has(lv)) buckets.set(lv, []);
        buckets.get(lv).push(id);
      });
      const sortedLevels = Array.from(buckets.keys()).sort((a, b) => a - b);
      const indexPrev = new Map();
      sortedLevels.forEach(lv => {
        const prev = buckets.get(lv - 1) || [];
        indexPrev.clear(); prev.forEach((pid, i) => indexPrev.set(pid, i));
        const arr = buckets.get(lv);
        arr.sort((a, b) => {
          const score = (id) => {
            let s = 0, c = 0;
            adj.get(id).forEach(nb => { if (indexPrev.has(nb)) { s += indexPrev.get(nb); c++; } });
            // 无父邻居时用度数兜底
            return c ? (s / c) : -(deg.get(id) || 0);
          };
          return score(a) - score(b);
        });
      });

      // 根据容器尺寸设置栅格坐标（水平 LR）
      const cont = document.getElementById('topology-network');
      const W = (cont && cont.clientWidth) || 1200;
      const H = (cont && cont.clientHeight) || 700;
      const gapX = Math.max(140, Math.floor(W / (sortedLevels.length + 2)));
      const gapY = 80; // 垂直间距
      const centerY = Math.round(H / 2);
      const startX = 40;

      const updates = [];
      sortedLevels.forEach((lv, colIdx) => {
        const arr = buckets.get(lv);
        const mid = (arr.length - 1) / 2;
        arr.forEach((id, i) => {
          const x = startX + gapX * colIdx;
          const y = centerY + (i - mid) * gapY;
          updates.push({ id, x, y, fixed: { x: true, y: true } });
        });
      });
      visData.nodes.update(updates);
    } catch (e) {
      console.warn('应用总线栅格布局失败:', e);
    }
  }

  // —— 标准模式：按连通分量划分网格 + 环形初始坐标，减少“团在一起” ——
  function applyStandardComponentLayout(visData) {
    try {
      const nodesArr = visData && visData.nodes && visData.nodes.get ? visData.nodes.get() : [];
      const edgesArr = visData && visData.edges && visData.edges.get ? visData.edges.get() : [];
      if (!nodesArr.length) return;

      const ids = nodesArr.map(n => n.id);
      const adj = new Map(ids.map(id => [id, new Set()]));
      edgesArr.forEach(e => {
        if (adj.has(e.from)) adj.get(e.from).add(e.to);
        if (adj.has(e.to)) adj.get(e.to).add(e.from);
      });

      // 连通分量
      const comps = [];
      const vis = new Set();
      for (const id of ids) {
        if (vis.has(id)) continue;
        const comp = [];
        const q = [id]; vis.add(id);
        while (q.length) {
          const cur = q.shift(); comp.push(cur);
          adj.get(cur).forEach(nb => { if (!vis.has(nb)) { vis.add(nb); q.push(nb); } });
        }
        comps.push(comp);
      }

      // 容器网格
      const cont = document.getElementById('topology-network');
      const W = (cont && cont.clientWidth) || 1200;
      const H = (cont && cont.clientHeight) || 700;
      const cols = Math.max(1, Math.ceil(Math.sqrt(comps.length)));
      const rows = Math.max(1, Math.ceil(comps.length / cols));
      const cellW = Math.max(360, Math.floor(W / cols));
      const cellH = Math.max(280, Math.floor(H / rows));

      // 计算每个分量的环形初始坐标
      const updates = [];
      comps.forEach((comp, idx) => {
        const cx = (idx % cols) * cellW + Math.floor(cellW / 2);
        const cy = Math.floor(idx / cols) * cellH + Math.floor(cellH / 2);
        // 选枢纽（度最高）
        let hub = comp[0], md = -1;
        comp.forEach(id => { const d = (adj.get(id) || new Set()).size; if (d > md) { md = d; hub = id; } });
        // 从枢纽做 BFS 得到“环层”
        const level = new Map(); const q = [hub]; level.set(hub, 0);
        const inComp = new Set(comp);
        while (q.length) {
          const cur = q.shift(); const lv = level.get(cur) || 0;
          adj.get(cur).forEach(nb => { if (inComp.has(nb) && !level.has(nb)) { level.set(nb, lv + 1); q.push(nb); } });
        }
        // 将未覆盖的节点设置为次层
        comp.forEach(id => { if (!level.has(id)) level.set(id, 1); });

        // 分层分桶，按父层重心排序，然后放环形坐标
        const buckets = new Map();
        comp.forEach(id => { const lv = level.get(id) || 0; if (!buckets.has(lv)) buckets.set(lv, []); buckets.get(lv).push(id); });
        const levels = Array.from(buckets.keys()).sort((a, b) => a - b);
        const rStep = 75; // 每层半径步长
        levels.forEach(lv => {
          const arr = buckets.get(lv);
          const R = Math.max(40, rStep * (lv + 1));
          const n = arr.length;
          for (let i = 0; i < n; i++) {
            const theta = (2 * Math.PI * i) / Math.max(1, n);
            const x = cx + Math.round(R * Math.cos(theta));
            const y = cy + Math.round(R * Math.sin(theta));
            updates.push({ id: arr[i], x, y });
          }
        });
      });

      visData.nodes.update(updates);
    } catch (e) {
      console.warn('应用标准分量初始布局失败:', e);
    }
  }

  function renderVis(visData) {
    const network = ensureNetwork();
    if (!network) return;
    network.setData(visData);
    // 允许节点拖拽：禁用物理引擎即可保持位置稳定，无需设置 fixed
    try {
      const dsNodes = network && network.body && network.body.data && network.body.data.nodes;
      if (dsNodes) {
        const all = dsNodes.get();
        if (Array.isArray(all) && all.length > 0) {
          dsNodes.update(all.map(n => ({ id: n.id, fixed: { x: false, y: false } })));
        }
      }
    } catch (e) { console.warn('解锁节点失败:', e); }
    network.fit({ animation: false });
  }

  // 对称碰撞分离 + 垂直压缩：进一步减少重叠与上下拉伸
  function postArrange(network) {
    try {
      const ids = network && network.body && network.body.data && network.body.data.nodes
        ? network.body.data.nodes.getIds() : [];
      if (!ids || ids.length === 0) return;
      const container = document.getElementById('topology-network');
      const height = container ? container.clientHeight : 800;
      const positions = network.getPositions(ids);

      // 1) 对称碰撞分离（3 次遍历），按重叠主轴拆分
      const minGapY = 36;
      const minGapX = 40;
      for (let pass = 0; pass < 3; pass++) {
        const boxes = ids.map(id => ({ id, box: network.getBoundingBox(id) }));
        for (let i = 0; i < boxes.length; i++) {
          for (let j = i + 1; j < boxes.length; j++) {
            const A = boxes[i].box, B = boxes[j].box;
            const overlapX = Math.max(0, Math.min(A.right, B.right) - Math.max(A.left, B.left));
            const overlapY = Math.max(0, Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top));
            if (overlapX > minGapX && overlapY > minGapY) {
              const idA = boxes[i].id; const idB = boxes[j].id;
              const pA = positions[idA]; const pB = positions[idB];
              // 根据主轴决定移动方向；度数小的移动更多
              const degA = (network.getConnectedEdges(idA) || []).length;
              const degB = (network.getConnectedEdges(idB) || []).length;
              const wA = degA >= degB ? 0.4 : 0.6;
              const wB = 1 - wA;
              if (overlapX >= overlapY) {
                const dx = (overlapX - minGapX + 8) / 2;
                network.moveNode(idA, pA.x - dx * wA, pA.y);
                network.moveNode(idB, pB.x + dx * wB, pB.y);
                positions[idA] = { x: pA.x - dx * wA, y: pA.y };
                positions[idB] = { x: pB.x + dx * wB, y: pB.y };
              } else {
                const dy = (overlapY - minGapY + 8) / 2;
                network.moveNode(idA, pA.x, pA.y - dy * wA);
                network.moveNode(idB, pB.x, pB.y + dy * wB);
                positions[idA] = { x: pA.x, y: pA.y - dy * wA };
                positions[idB] = { x: pB.x, y: pB.y + dy * wB };
              }
            }
          }
        }
      }

      // 2) 压缩整体垂直范围，避免上下拉得过长
      const ys = ids.map(id => positions[id].y);
      const minY = Math.min.apply(null, ys);
      const maxY = Math.max.apply(null, ys);
      const span = maxY - minY;
      const centerY = (minY + maxY) / 2;
      const targetSpan = Math.min(height * 0.65, Math.max(280, span * 0.85));
      if (span > targetSpan) {
        const scale = targetSpan / span;
        ids.forEach(id => {
          const p = positions[id];
          const newY = centerY + (p.y - centerY) * scale;
          network.moveNode(id, p.x, newY);
          positions[id] = { x: p.x, y: newY };
        });
      }

      // 3) 微调主枢纽节点到垂直中心（度数最高）
      try {
        const degrees = ids.map(id => ({ id, deg: (network.getConnectedEdges(id) || []).length }));
        degrees.sort((a, b) => b.deg - a.deg);
        const hub = degrees[0];
        if (hub && hub.id != null) {
          const p = positions[hub.id];
          network.moveNode(hub.id, p.x, centerY);
        }
      } catch (_) {}

      network.fit({ animation: false });
    } catch (e) {
      console.warn('布局后处理失败:', e);
    }
  }

  async function render() {
    try {
      const stationSel = document.getElementById('station-select');
      const deviceTypeSel = document.getElementById('device-type-select');
      const station = stationSel && stationSel.value ? stationSel.value : undefined;
      const deviceType = deviceTypeSel && deviceTypeSel.value ? deviceTypeSel.value : undefined;

      const raw = await fetchGlobal({ station, deviceType });
      const visData = toVisData(raw);
      const network = ensureNetwork();

      // 根据当前布局应用配置
      const layoutSel = document.getElementById('layout-select');
      const layoutName = (layoutSel && layoutSel.value) || 'standard';
      if (layoutName === 'bus') {
        // 总线模式：禁用层级自动计算，采用 BFS 分层 + 栅格坐标，杜绝随机性
        applyBusGridLayout(visData);
        network && network.setOptions({
          layout: { improvedLayout: false, hierarchical: { enabled: false } },
          physics: { enabled: false },
          edges: { smooth: { enabled: false }, arrows: { to: { enabled: false }, from: { enabled: false } } },
          randomSeed: 42
        });
        renderVis(visData);
        postArrange(network);
      } else {
        // 标准模式：强力防重叠的 repulsion，并禁用平滑线以减少“视觉交叉”
        network && network.setOptions({
          layout: { improvedLayout: true, hierarchical: { enabled: false } },
          physics: {
            enabled: true,
            solver: 'repulsion',
            repulsion: { nodeDistance: 170, springLength: 140, damping: 0.35 },
            stabilization: { iterations: 220, updateInterval: 25 }
          },
          edges: { smooth: { enabled: false }, arrows: { to: { enabled: false }, from: { enabled: false } } },
          randomSeed: 42
        });
        // 先进行按分量/环形的初始坐标放置，减少“团在一起”
        applyStandardComponentLayout(visData);
        renderVis(visData);
        try { network && network.stabilize(200); } catch (_) {}
        network && network.setOptions({ physics: { enabled: false } });
        postArrange(network);
      }
    } catch (e) {
      console.warn('渲染全局设备拓扑失败', e);
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
      render();
    }
  }

  window.TopologyGlobal = { render, resize, setLayout };
})();