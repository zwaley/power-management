// 绠€鍗曠殑绔彛鎷撴墤娓叉煋鍣細鍔犺浇 /temp/topology_fixture_sample.json 骞舵覆鏌?
(function () {
  function getQueryParam(name) {
    const params = new URLSearchParams(window.location.search);
    return params.get(name);
  }

  async function loadFixtureData() {
    // 鏀寔閫氳繃 ?fixture=1 寮哄埗鍔犺浇鏈湴fixture
    const useFixture = getQueryParam('fixture');
    const url = '/temp/topology_fixture_sample.json';
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('鍔犺浇fixture澶辫触: ' + resp.status);
    return resp.json();
  }

  function combineRemoteLabel(n) {
    const remoteFlag = (
      n.is_remote_compound === true ||
      n.kind === 'remote_compound' ||
      (n.type === 'compound' && (n.scope === 'remote' || n.remote === true))
    );
    const device = n.device || n.device_name || n.remote_device;
    const port = n.port || n.port_name || n.remote_port;
    if (remoteFlag && (device || port)) {
      return [device, port].filter(Boolean).join(' 路 ');
    }
    return n.label || n.id;
  }

  function buildNodeTitle(n) {
    try {
      const id = n.id || '';
      const meta = n.meta || {};
      const type = n.type || (String(id).startsWith('port:') ? 'port' : (String(id).startsWith('device:') ? 'device' : ''));
      if (type === 'port') {
        const { deviceName, portName } = parsePortId(id, n);
        const lines = [];
        lines.push(`\u8bbe\u5907\u540d\u79f0: ${deviceName || meta.device_name || ''}`);
        lines.push(`\u7aef\u53e3\u540d\u79f0: ${portName || n.label || ''}`);
        const fuseNo = meta.fuse_no || meta.breaker_no || '';
        if (fuseNo) lines.push(`\u7194\u4e1d/\u7a7a\u5f00\u7f16\u53f7: ${fuseNo}`);
        if (meta.spec) lines.push(`\u7194\u4e1d/\u7a7a\u5f00\u89c4\u683c: ${meta.spec}`);
        if (meta.rated_current) lines.push(`\u989d\u5b9a\u7535\u6d41: ${meta.rated_current}`);
        return lines.join('\n');
      } else {
        const deviceName = n.device || n.device_name || meta.device_name || n.label || id;
        const lines = [];
        lines.push(`\u8bbe\u5907\u540d\u79f0: ${deviceName}`);
        // 基础字段（若fixture存在）
        if (n.model || meta.model) lines.push(`\u578b\u53f7: ${n.model || meta.model}`);
        const vendor = meta.manufacturer || meta.vendor; // 兼容不同来源
        if (vendor) lines.push(`\u751f\u4ea7\u5382\u5bb6: ${vendor}`);
        const ratedCap = meta.rated_capacity || meta.power_rating; // 兼容字段名
        if (ratedCap) lines.push(`\u989d\u5b9a\u5bb9\u91cf: ${ratedCap}`);
        if (meta.commission_date) lines.push(`\u6295\u4ea7\u65e5\u671f: ${meta.commission_date}`);
        if (meta.lifecycle_status) lines.push(`\u751f\u547d\u5468\u671f\u72b6\u6001: ${meta.lifecycle_status}`);
        return lines.join('\n');
      }
    } catch (_) {
      return String(n.label || n.id || '');
    }
  }

  function parsePortId(id, n) {
    try {
      let rest = String(id || '');
      if (rest.startsWith('port:')) rest = rest.slice(5);
      const idx = rest.lastIndexOf(':');
      if (idx > -1) {
        const deviceName = rest.slice(0, idx);
        const portName = rest.slice(idx + 1);
        return { deviceName, portName };
      }
      return { deviceName: (n && n.meta && n.meta.device_name) || (n && n.device_name) || '', portName: (n && n.label) || '' };
    } catch (_) {
      return { deviceName: '', portName: '' };
    }
  }

  // 边详情：显示电缆型号、方向与类型
  function buildEdgeTitle(e) {
    try {
      const isStructural = e && e.kind === 'structural';
      if (isStructural) {
        return `结构性边\n来源: ${e.from}\n去向: ${e.to}`;
      }
      const conn = (e && e.connection) || {};
      const lines = [];
      lines.push(`连接ID: ${conn.id || e.id || ''}`);
      if (conn.model) lines.push(`电缆型号: ${conn.model}`);
      if (conn.type) lines.push(`电力类型: ${conn.type}`);
      if (conn.direction) lines.push(`方向: ${conn.direction}`);
      lines.push(`来源: ${e.from}`);
      lines.push(`去向: ${e.to}`);
      return lines.join('\n');
    } catch (_) {
      return String(e && e.id ? e.id : '连接');
    }
  }

  // 涓績璁惧鑺傜偣鐨勫弻琛屾爣绛撅細绗竴琛岃澶囧悕锛岀浜岃灞€绔?鍨嬪彿
  
    // 端口排序键：BF类优先、其次F或出线N，最后其他；同类按数字升序
  function getPortSortKey(n) {
    const label = String(n.label || n.id || '');
    const text = label;
    let cat = 100, num = 0;
    // BF / 电池 N
    let m = label.match(/BF\s*([0-9]+)/i) || label.match(/电池\s*([0-9]+)/);
    if (m) { cat = 0; num = parseInt(m[1], 10) || 0; return { cat, num, text }; }
    // F / 出线 N
    m = label.match(/\bF\s*([0-9]+)/i) || label.match(/出线\s*([0-9]+)/);
    if (m) { cat = 1; num = parseInt(m[1], 10) || 0; return { cat, num, text }; }
    // 其他
    return { cat: 2, num: 0, text };
  }

  // 中心设备节点双行标签（V2）：设备名 + 站点·型号（使用 \n 换行）
  function buildRootLabelV2(n) {
    const device = n.device || n.device_name || (n.meta && n.meta.device_name) || n.label || n.id;
    const sub = [n.station || (n.meta && n.meta.station), n.model].filter(Boolean).join(' · ');
    const main = String(device);
    return sub ? `${main}\n${sub}` : main;
  }

  function computeLevels(json) {
    const nodes = json.nodes || [];
    const edges = json.edges || [];
    if (!nodes.length) return {};

    const adj = new Map();
    const degree = new Map();
    nodes.forEach(n => { adj.set(n.id, new Set()); degree.set(n.id, 0); });
    edges.forEach(e => {
      if (!adj.has(e.from)) adj.set(e.from, new Set());
      if (!adj.has(e.to)) adj.set(e.to, new Set());
      adj.get(e.from).add(e.to);
      adj.get(e.to).add(e.from);
    });
    Array.from(adj.entries()).forEach(([id, set]) => degree.set(id, set.size));

    // 閫夋嫨搴︽暟鏈€澶х殑鑺傜偣浣滀负涓績鏍?
    let root = nodes[0].id; let maxDeg = -1;
    degree.forEach((d, id) => { if (d > maxDeg) { maxDeg = d; root = id; } });

    const levels = {}; levels[root] = 0;
    const q = [root];
    const visited = new Set([root]);
    while (q.length) {
      const cur = q.shift();
      const curLevel = levels[cur] ?? 0;
      (adj.get(cur) || []).forEach((nbr) => {
        if (!visited.has(nbr)) {
          visited.add(nbr);
          levels[nbr] = curLevel + 1;
          q.push(nbr);
        }
      });
    }
    return levels;
  }

  function buildAdjacency(json) {
    const nodes = json.nodes || [];
    const edges = json.edges || [];
    const adj = new Map();
    nodes.forEach(n => adj.set(n.id, new Set()));
    edges.forEach(e => {
      if (!adj.has(e.from)) adj.set(e.from, new Set());
      if (!adj.has(e.to)) adj.set(e.to, new Set());
      adj.get(e.from).add(e.to);
      adj.get(e.to).add(e.from);
    });
    return adj;
  }

  function computeBalancedPositions(json, connectedPortIds = new Set()) {
    const nodes = json.nodes || [];
    const adj = buildAdjacency(json);
    if (!nodes.length) return {};

    // 鏍硅妭鐐癸細搴︽暟鏈€澶э紝涓斾紭鍏堥潪绔彛
    let root = nodes[0];
    let maxDeg = -1;
    nodes.forEach(n => {
      const deg = (adj.get(n.id) || new Set()).size;
      const score = (n.type === 'port' ? 0 : 1000) + deg; // 闈炵鍙ｄ紭鍏?
      if (score > maxDeg) { maxDeg = score; root = n; }
    });

    const positions = {};
    positions[root.id] = { x: 0, y: 0 };
    const neighbors = Array.from(adj.get(root.id) || []);
    const nodeById = new Map();
    nodes.forEach(n => nodeById.set(n.id, n));

    const vSpacing = 90;       // 鍩虹鍨傜洿闂磋窛锛堢◢寰姞澶э級
    const offset1 = 420;       // 绗竴灞傚乏鍙冲亸绉伙紙鎷夊紑绾挎潯涓庤妭鐐癸級
    const offset2 = 980;       // 绗簩灞傚乏鍙冲亸绉伙紙杩涗竴姝ユ媺寮€锛?
    const subSpacing = 55;     // 绗簩灞傚瓙鑺傜偣鐩稿鐖惰妭鐐圭殑鍨傜洿鍋忕Щ

    // 宸﹀彸浜ゆ浛鍒嗛厤绗竴灞傝妭鐐癸紱鍒嗗埆璁＄畻宸﹀彸鏁扮粍浠ヤ究鍔犲ぇ宸︿晶鐪熷疄杩炴帴鐨勯棿璺?        // 左右平分：仅对端口按顺序（BF/F/出线N）排序后，左边放前半、右边放后半；非端口邻居（很少）置于右侧末尾
    const firstNeighbors = neighbors.map(id => nodeById.get(id)).filter(Boolean);
    const portNeighbors = firstNeighbors.filter(n => n.type === 'port').sort((a, b) => {
      const ka = getPortSortKey(a); const kb = getPortSortKey(b);
      if (ka.cat !== kb.cat) return ka.cat - kb.cat;
      if (ka.num !== kb.num) return ka.num - kb.num;
      return ka.text.localeCompare(kb.text, 'zh');
    });
    const otherNeighbors = firstNeighbors.filter(n => n.type !== 'port');
    const half = Math.ceil(portNeighbors.length / 2);
    const leftPorts = portNeighbors.slice(0, half).map(n => n.id);
    const rightPorts = portNeighbors.slice(half).map(n => n.id);

    const sideOf = {}; // 记录每个第一层节点的方向
    leftPorts.forEach(id => sideOf[id] = 'left');
    rightPorts.forEach(id => sideOf[id] = 'right');
    const leftNeighbors = leftPorts;
    const rightNeighbors = rightPorts.concat(otherNeighbors.map(n => n.id));
    const leftConnectedCount = leftNeighbors.filter(id => connectedPortIds.has(id)).length;
    const vSpacingLeft = leftConnectedCount > 0 ? Math.round(vSpacing * 1.35) : vSpacing;
    const vSpacingRight = vSpacing;
    leftNeighbors.forEach((nid, i) => {
      const y = (i - (leftNeighbors.length - 1) / 2) * vSpacingLeft;
      positions[nid] = { x: -1 * offset1, y };
    });
    rightNeighbors.forEach((nid, i) => {
      const y = (i - (rightNeighbors.length - 1) / 2) * vSpacingRight;
      positions[nid] = { x: 1 * offset1, y };
    });

    // 绗簩灞傦細姣忎釜绗竴灞傝妭鐐圭殑閭诲眳锛堥櫎鍘籸oot锛夋斁鍒版洿杩滅殑鍚屼晶
    const visited = new Set([root.id, ...neighbors]);
    neighbors.forEach((nid) => {
      const side = sideOf[nid];
      const sign = side === 'left' ? -1 : 1;
      const children = Array.from(adj.get(nid) || []).filter(id => id !== root.id);
      children.forEach((cid, j) => {
        if (visited.has(cid)) return;
        const baseY = positions[nid].y;
        const y = baseY + (j + 1) * subSpacing * (j % 2 === 0 ? 1 : -1);
        positions[cid] = { x: sign * offset2, y };
        visited.add(cid);
      });
    });

    // 鍏朵綑鏈斁缃妭鐐癸細闈犺繎root鍙充晶锛岄伩鍏嶅彔鍔?
    nodes.forEach(n => {
      if (!positions[n.id]) {
        const i = visited.size % 10;
        positions[n.id] = { x: 200 + (i * 20), y: (i - 5) * vSpacing };
        visited.add(n.id);
      }
    });

    return { positions, rootId: root.id };
  }
  function toVisNodesEdges(json) {
    const connectionEdges = (json.edges || []).filter(e => e.kind === 'connection');
    const connectedPortIds = new Set();
    connectionEdges.forEach(e => { connectedPortIds.add(e.from); connectedPortIds.add(e.to); });
    const layout = computeBalancedPositions(json, connectedPortIds);
    const levels = computeLevels(json); // 淇濈暀涓簍ooltip淇℃伅锛屼笉鐢ㄤ簬甯冨眬
    const nodes = (json.nodes || []).map(n => {
      const isPort = n.type === 'port';
      const isIdlePort = isPort && !connectedPortIds.has(n.id);
      const pos = layout.positions[n.id] || { x: undefined, y: undefined };
      const isRoot = n.id === layout.rootId;
      const nodeObj = {
        id: n.id,
        label: isRoot ? buildRootLabelV2(n) : combineRemoteLabel(n),
        title: buildNodeTitle(n),
        shape: isPort ? 'ellipse' : 'box',
        // 节点配色：端口使用深色底/白字提高对比度，设备使用深色灰底
        color: isPort
          ? (isIdlePort
              ? { background: '#6c757d', border: '#495057' }
              : { background: '#0d6efd', border: '#084298' })
          : (isRoot ? { background: '#212529', border: '#0d6efd' } : { background: '#343a40', border: '#212529' }),
        font: isRoot
          ? { color: '#ffffff', size: 20, face: 'Microsoft YaHei UI' }
          : (isPort ? { color: '#ffffff', size: 18, face: 'Microsoft YaHei UI' } : { color: '#ffffff', size: 14, face: 'Microsoft YaHei UI' }),
        // 提升节点可视尺寸：通过 margin 和宽高约束而非 size
        margin: isPort ? 8 : (isRoot ? 12 : 10),
        widthConstraint: isPort ? { minimum: 86 } : (isRoot ? { minimum: 180 } : { minimum: 120 }),
        heightConstraint: isPort ? { minimum: 34 } : (isRoot ? { minimum: 54 } : { minimum: 42 }),
        borderWidth: isRoot ? 3 : 1,
        shadow: isRoot ? true : false,
        level: levels[n.id],
        x: pos.x,
        y: pos.y,
      };
      if (isRoot) nodeObj.shapeProperties = { borderRadius: 6 };
      return nodeObj;
    });

    const edges = (json.edges || []).map(e => {
      const isStructural = e.kind === 'structural';
      const arrows = isStructural ? '' : (e.arrows || ''); // connection鎸塮ixture鐨刟rrows灞曠ず
      return {
        id: e.id,
        from: e.from,
        to: e.to,
        arrows: arrows,
        color: isStructural ? { color: '#888888' } : { color: '#2f7cd1' },
        title: buildEdgeTitle(e),
      };
    });

    return { nodes, edges };
  }

  async function render() {
    try {
      const canvas = document.getElementById('topology-network');
      if (!canvas) return;
      const container = document.getElementById('topology-container');
      const detailBox = document.querySelector('#node-details');
      const detailPre = detailBox ? detailBox.querySelector('pre') : null;
      // 设备详情缓存（按设备名称缓存）
      const __deviceDetailsCache = {};
      async function fetchDeviceDetailsByName(name) {
        if (!name) return null;
        const key = String(name).trim();
        if (__deviceDetailsCache[key]) return __deviceDetailsCache[key];
        try {
          const resp = await fetch('/api/devices/lifecycle-status');
          const json = await resp.json();
          if (json && json.success && Array.isArray(json.data)) {
            // 精确匹配名称；若找不到，尝试去掉开头的局站前缀匹配
            let item = json.data.find(d => String(d.name).trim() === key);
            if (!item) {
              const short = key.replace(/^\s*([\u4e00-\u9fa5A-Za-z0-9_\-]+)\s*[_\-·]\s*/, '');
              item = json.data.find(d => String(d.name).includes(short));
            }
            if (item) {
              __deviceDetailsCache[key] = item;
              return item;
            }
          }
        } catch (e) {
          console.warn('获取设备详情失败', e);
        }
        return null;
      }
      function buildDeviceDetailsText(node, apiObj) {
        const meta = node.meta || {};
        const name = node.device || node.device_name || meta.device_name || node.label || node.id;
        const lines = [];
        lines.push(`设备名称: ${name}`);
        const model = node.model || meta.model || (apiObj && apiObj.model);
        if (model) lines.push(`型号: ${model}`);
        const vendor = meta.manufacturer || meta.vendor || (apiObj && apiObj.vendor);
        if (vendor) lines.push(`生产厂家: ${vendor}`);
        const capacity = meta.rated_capacity || meta.power_rating || (apiObj && apiObj.power_rating);
        if (capacity) lines.push(`额定容量: ${capacity}`);
        const station = node.station || meta.station || (apiObj && apiObj.station);
        if (station) lines.push(`局站: ${station}`);
        const commission = meta.commission_date || (apiObj && apiObj.commission_date);
        if (commission) lines.push(`投产日期: ${commission}`);
        const lifecycle = meta.lifecycle_status || (apiObj && apiObj.lifecycle_status_text) || (apiObj && apiObj.lifecycle_status);
        if (lifecycle) lines.push(`生命周期状态: ${lifecycle}`);
        return lines.join('\n');
      }
      const fsBtn = document.getElementById('fullscreen-btn');
      const data = await loadFixtureData();
      const visData = toVisNodesEdges(data);
      const originalNodesById = {};
      (data.nodes || []).forEach(n => { originalNodesById[n.id] = n; });
      const originalEdgesById = {};
      (data.edges || []).forEach(e => { originalEdgesById[e.id] = e; });

      const options = {
        physics: false,
        interaction: { hover: true, dragNodes: true, dragView: true },
        nodes: { borderWidth: 1, font: { multi: 'html' }, margin: { top: 6, right: 12, bottom: 6, left: 12 } },
        edges: {
          smooth: { type: 'curvedCW', roundness: 0.25 },
          arrows: { to: { enabled: true, scaleFactor: 1 } },
          color: { inherit: false },
        },
      };

      const network = new vis.Network(canvas, visData, options);
      network.fit({ animation: false });

      // 鍏ㄥ睆鍒囨崲锛堢洿鎺ュ鐢诲竷鍏冪礌璇锋眰鍏ㄥ睆锛屾洿璐磋繎鐢ㄦ埛鏈熷緟鐨?100% 瑙嗗彛锛?
      if (fsBtn && canvas) {
        fsBtn.addEventListener('click', () => {
          if (!document.fullscreenElement) {
            const req = canvas.requestFullscreen || canvas.webkitRequestFullscreen || canvas.msRequestFullscreen || canvas.mozRequestFullScreen;
            if (req) {
              Promise.resolve(req.call(canvas)).then(() => {
                network.setSize('100vw', '100vh');
                network.redraw();
                network.fit({ animation: false });
              }).catch(err => console.warn('鍏ㄥ睆澶辫触', err));
            }
          } else {
            const exit = document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen || document.mozCancelFullScreen;
            if (exit) {
              Promise.resolve(exit.call(document)).then(() => {
                network.setSize('100%', '80vh');
                network.redraw();
                network.fit({ animation: false });
              });
            }
          }
        });
        document.addEventListener('fullscreenchange', () => {
          if (document.fullscreenElement) {
            network.setSize('100vw', '100vh');
          } else {
            network.setSize('100%', '80vh');
          }
          network.redraw();
        });
      }

      // 点击节点或边：打开详情面板（节点/电缆信息）
      network.on('click', (params) => {
        if (detailBox && detailPre) {
          if (params.nodes && params.nodes.length) {
            const nid = params.nodes[0];
            const node = originalNodesById[nid] || { id: nid, label: nid };
            // 初始显示（本地字段）
            const initialText = buildNodeTitle(node);
            detailPre.textContent = initialText || '';
            detailBox.style.display = 'block';
            // 若为设备节点，进一步拉取后端详情并补充显示
            const idStr = String(node.id || '');
            const type = node.type || (idStr.startsWith('port:') ? 'port' : (idStr.startsWith('device:') ? 'device' : ''));
            if (type === 'device') {
              const name = node.device || node.device_name || (node.meta && node.meta.device_name) || node.label || node.id;
              // 显示加载中的提示
              detailPre.textContent = (initialText ? initialText + '\n' : '') + '（正在加载更多详情...）';
              fetchDeviceDetailsByName(name).then((info) => {
                if (info) {
                  const text = buildDeviceDetailsText(node, info);
                  detailPre.textContent = text;
                } else {
                  // 未找到后端详情则保留初始内容
                  detailPre.textContent = initialText || '';
                }
              }).catch(() => {
                detailPre.textContent = initialText || '';
              });
            }
          } else if (params.edges && params.edges.length) {
            const eid = params.edges[0];
            const edge = originalEdgesById[eid] || { id: eid };
            detailPre.textContent = buildEdgeTitle(edge);
            detailBox.style.display = 'block';
          } else {
            detailBox.style.display = 'none';
          }
        }
      });
    } catch (e) {
      console.error('娓叉煋鎷撴墤澶辫触:', e);
    }
  }

  // 椤甸潰鍔犺浇鍚庢墽琛?
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render);
  } else {
    render();
  }
})();