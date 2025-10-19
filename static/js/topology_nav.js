// 拓扑导航页逻辑：设备搜索 + 端口级渲染闭环
(function () {
  const qs = new URLSearchParams(window.location.search);
  const state = {
    level: qs.get('n') || 'port',      // port | device（当前以端口级为主）
    layout: qs.get('layout') || 'standard', // standard | bus（占位）
    deviceId: qs.get('id') ? parseInt(qs.get('id'), 10) : null,
    selected: null,
  };

  const els = {
    input: document.getElementById('device-search-input'),
    results: document.getElementById('device-search-results'),
    level: document.getElementById('level-select'),
    layout: document.getElementById('layout-select'),
    renderBtn: document.getElementById('render-btn'),
    loadFixtureBtn: document.getElementById('load-fixture-btn'),
    status: document.getElementById('status-area'),
  };

  // 简易状态提示
  function setStatus(type, text) {
    if (!els.status) return;
    const map = {
      info: 'alert-info',
      success: 'alert-success',
      warn: 'alert-warning',
      error: 'alert-danger',
    };
    els.status.innerHTML = `<div class="alert ${map[type] || 'alert-info'} py-2 px-3 mb-2">${text || ''}</div>`;
  }

  // 设备搜索（模糊 + 精确过滤占位）
  let searchTimer = null;
  async function performSearch(q) {
    try {
      const params = new URLSearchParams();
      if (q) params.set('query', q);
      params.set('limit', '30');
      const resp = await fetch(`/api/devices/search?${params.toString()}`);
      const json = await resp.json();
      if (!json || json.success !== true) throw new Error('搜索API返回失败');
      renderResults(json.data || []);
    } catch (e) {
      console.warn('搜索失败', e);
      setStatus('error', '搜索失败：' + e.message);
    }
  }

  function renderResults(list) {
    if (!els.results) return;
    if (!Array.isArray(list) || list.length === 0) {
      els.results.innerHTML = '<li class="list-group-item text-muted">无结果</li>';
      return;
    }
    els.results.innerHTML = list.map(d => {
      const safe = (x) => (x == null ? '' : String(x));
      return `<li class="list-group-item list-group-item-action" data-id="${d.id}" data-name="${safe(d.name)}">
        <div class="d-flex justify-content-between align-items-center">
          <div>
            <div class="fw-semibold">${safe(d.name)}<span class="text-muted ms-2">#${safe(d.asset_id)}</span></div>
            <div class="small text-muted">${safe(d.station)} · ${safe(d.model)} · ${safe(d.vendor)}</div>
          </div>
          <button class="btn btn-sm btn-outline-primary select-item">选择</button>
        </div>
      </li>`;
    }).join('');
  }

  function bindResultsClick() {
    if (!els.results) return;
    els.results.addEventListener('click', (ev) => {
      const btn = ev.target.closest('.select-item');
      const li = ev.target.closest('li.list-group-item');
      if (!li) return;
      const id = parseInt(li.getAttribute('data-id'), 10);
      const name = li.getAttribute('data-name');
      state.deviceId = id;
      state.selected = { id, name };
      setStatus('success', `已选择设备：${name}（ID=${id}）`);
      // 同步到URL
      syncUrl();
    });
  }

  function syncUrl() {
    const p = new URLSearchParams();
    if (state.deviceId) p.set('id', String(state.deviceId));
    if (state.level) p.set('n', state.level);
    if (state.layout) p.set('layout', state.layout);
    const url = `${location.pathname}?${p.toString()}`;
    window.history.replaceState({}, '', url);
  }

  // 渲染端口拓扑
  let portMgr = null;
  async function renderPortTopology() {
    try {
      if (!state.deviceId) {
        setStatus('warn', '请先在左侧选择设备');
        return;
      }
      if (!portMgr) {
        portMgr = new PortTopologyManager();
        portMgr.initialize('topology-network');
      }
      setStatus('info', '正在加载端口拓扑...');
      await portMgr.loadPortTopology(state.deviceId);
      setStatus('success', '端口拓扑渲染完成');
    } catch (e) {
      console.error('渲染端口拓扑失败', e);
      setStatus('error', '渲染端口拓扑失败：' + e.message);
    }
  }

  // 加载本地Fixture示例（按需）
  function loadFixture() {
    try {
      setStatus('info', '正在加载本地Fixture示例...');
      // 动态加载 fixture 渲染脚本，避免与导航逻辑冲突
      const s = document.createElement('script');
      s.src = '/static/js/topology.js';
      s.onload = () => setStatus('success', 'Fixture示例已加载');
      s.onerror = () => setStatus('error', '加载Fixture脚本失败');
      document.body.appendChild(s);
    } catch (e) {
      setStatus('error', '加载Fixture失败：' + e.message);
    }
  }

  function initEvents() {
    if (els.input) {
      els.input.addEventListener('input', () => {
        const q = els.input.value.trim();
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => performSearch(q), 250);
      });
    }
    if (els.level) {
      els.level.addEventListener('change', () => {
        state.level = els.level.value;
        syncUrl();
        // 当前仅实现端口级；设备级占位
        if (state.level !== 'port') {
          setStatus('warn', '设备级拓扑即将上线，当前请使用端口级');
        }
      });
    }
    if (els.layout) {
      els.layout.addEventListener('change', () => {
        state.layout = els.layout.value;
        syncUrl();
      });
    }
    if (els.renderBtn) {
      els.renderBtn.addEventListener('click', () => {
        if (state.level === 'port') return renderPortTopology();
        setStatus('warn', '设备级渲染未实现，请选择端口级');
      });
    }
    if (els.loadFixtureBtn) {
      els.loadFixtureBtn.addEventListener('click', loadFixture);
    }
    bindResultsClick();
  }

  function initFromUrl() {
    // 若URL已包含设备ID，直接尝试渲染端口拓扑
    if (state.deviceId) {
      renderPortTopology();
    }
  }

  // 启动
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initEvents();
      initFromUrl();
      // 首屏空列表提示
      setStatus('info', '请输入关键词搜索设备，或加载示例');
    });
  } else {
    initEvents();
    initFromUrl();
    setStatus('info', '请输入关键词搜索设备，或加载示例');
  }
})();