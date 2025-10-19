(function () {
  'use strict';
  // 页面初始化与交互：设备搜索、下拉选择、布局切换、全屏
  const state = {
    devices: [],
    deviceIndexByName: new Map(),
  };
  async function fetchDevices() {
    try {
      const res = await fetch('/api/devices?page=1&page_size=200');
      const json = await res.json();
      const list = json?.data || json?.devices || [];
      state.devices = list;
      state.deviceIndexByName.clear();
      list.forEach(d => {
        const key = String(d.name || '').trim();
        if (key) state.deviceIndexByName.set(key, d.id);
      });
      const sel = document.getElementById('device-select');
      if (sel) {
        sel.innerHTML = '<option value="">请选择设备...</option>' +
          list.map(d => `<option value="${d.id}">${escapeHtml(d.name || ('设备' + d.id))}</option>`).join('');
      }
    } catch (e) {
      console.warn('加载设备列表失败', e);
    }
  }
  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
  }
  function getQueryParam(name) {
    const params = new URLSearchParams(window.location.search);
    return params.get(name);
  }
  function resolveDeviceIdFromInputs() {
    const q = getQueryParam('device_id') || getQueryParam('id');
    if (q && !isNaN(Number(q))) return Number(q);
    const sel = document.getElementById('device-select');
    if (sel && sel.value) return Number(sel.value);
    const input = document.getElementById('device-search-input');
    if (input && input.value) {
      if (!isNaN(Number(input.value))) return Number(input.value);
      const id = state.deviceIndexByName.get(input.value.trim());
      if (id) return id;
    }
    return 13; // 默认自测设备ID
  }
  function bindSearch() {
    const input = document.getElementById('device-search-input');
    const listEl = document.getElementById('device-search-results');
    const status = document.getElementById('status-area');
    if (!input || !listEl) return;
    let timer = null;
    async function performSearch(q) {
      try {
        const params = new URLSearchParams();
        if (q) params.set('query', q);
        params.set('limit', '30');
        const resp = await fetch(`/api/devices/search?${params.toString()}`);
        const json = await resp.json();
        const list = json?.data || [];
        listEl.innerHTML = list.map(d => `<button type="button" class="list-group-item list-group-item-action" data-id="${d.id}">${escapeHtml(d.name || ('设备' + d.id))} <span class="text-muted">#${d.id}</span></button>`).join('');
        listEl.querySelectorAll('button').forEach(btn => {
          btn.addEventListener('click', () => {
            const id = Number(btn.getAttribute('data-id'));
            const sel = document.getElementById('device-select');
            if (sel) sel.value = String(id);
            input.value = String(id);
            const name = getSelectedDeviceLabel();
            status.textContent = `选择设备 #${id}`;
            const levelEl = document.getElementById('level-select');
            const level = levelEl ? levelEl.value : 'port';
            if (level === 'device') {
              window.TopologyDevice.render(id, name).catch(err => console.error(err));
            } else {
              window.TopologyPorts.render(id, name).catch(err => console.error(err));
            }
          });
        });
      } catch (e) {
        console.warn('搜索失败', e);
        status.textContent = '搜索失败：' + (e?.message || e);
      }
    }
    input.addEventListener('input', () => {
      const q = input.value.trim();
      clearTimeout(timer);
      if (!q) { listEl.innerHTML = ''; return; }
      timer = setTimeout(() => performSearch(q), 250);
    });
    // 支持按回车直接渲染首条匹配
    input.addEventListener('keydown', async (ev) => {
      if (ev.key !== 'Enter') return;
      const q = input.value.trim();
      if (!q) return;
      try {
        const params = new URLSearchParams({ query: q, limit: '1' });
        const resp = await fetch(`/api/devices/search?${params.toString()}`);
        const json = await resp.json();
        const first = (json?.data || [])[0];
        if (!first) { status.textContent = '未找到匹配设备'; return; }
        const id = Number(first.id);
        const sel = document.getElementById('device-select');
        if (sel) sel.value = String(id);
        const name = first.name || getSelectedDeviceLabel();
        const levelEl = document.getElementById('level-select');
        const level = levelEl ? levelEl.value : 'port';
        status.textContent = `选择设备 #${id}`;
        if (level === 'device') {
          window.TopologyDevice.render(id, name).catch(err => console.error(err));
        } else {
          window.TopologyPorts.render(id, name).catch(err => console.error(err));
        }
      } catch (e) {
        status.textContent = '搜索失败：' + (e?.message || e);
      }
    });
  }
  function getSelectedDeviceLabel() {
    const sel = document.getElementById('device-select');
    if (sel && sel.value) {
      const opt = sel.options[sel.selectedIndex];
      return opt ? opt.text : '';
    }
    const input = document.getElementById('device-search-input');
    return input && input.value ? String(input.value) : '';
  }
  function bindSelect() {
    const sel = document.getElementById('device-select');
    if (!sel) return;
    sel.addEventListener('change', () => {
      const id = Number(sel.value || '');
      if (!id) {
        document.getElementById('status-area').textContent = '请选择有效设备';
        return;
      }
      const name = getSelectedDeviceLabel();
      document.getElementById('status-area').textContent = `选择设备 #${id}（${name}）`;
      const levelEl = document.getElementById('level-select');
      const level = levelEl ? levelEl.value : 'port';
      if (level === 'device') {
        window.TopologyDevice.render(id, name).catch(err => console.error(err));
      } else {
        window.TopologyPorts.render(id, name).catch(err => console.error(err));
      }
    });
  }
  function bindRenderButton() {
    const status = document.getElementById('status-area');
    const btn = document.getElementById('render-btn');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      const sel = document.getElementById('device-select');
      let id = sel && sel.value ? Number(sel.value) : undefined;
      const input = document.getElementById('device-search-input');
      const q = (input && input.value ? input.value.trim() : '') || '';
      if (!id && q) {
        if (!isNaN(Number(q))) {
          id = Number(q);
        } else {
          try {
            const params = new URLSearchParams({ query: q, limit: '1' });
            const resp = await fetch(`/api/devices/search?${params.toString()}`);
            const json = await resp.json();
            id = (json?.data && json.data[0] && Number(json.data[0].id)) || undefined;
          } catch (e) {
            console.warn('模糊搜索解析ID失败', e);
          }
        }
      }
      if (!id) {
        status.textContent = '请先选择设备或输入可匹配的设备名称/ID';
        return;
      }
      const name = getSelectedDeviceLabel();
      const levelEl = document.getElementById('level-select');
      const level = levelEl ? levelEl.value : 'port';
      status.textContent = `开始渲染设备 ${id} 的${level === 'device' ? '设备级' : '端口级'}拓扑...`;
      const renderer = level === 'device' ? window.TopologyDevice : window.TopologyPorts;
      renderer.render(id, name).catch(err => {
        console.error(err);
        status.textContent = '渲染失败：' + (err?.message || err);
      });
    });
  }
  function bindLayoutSelect() {
    const sel = document.getElementById('layout-select');
    if (!sel) return;
    sel.addEventListener('change', () => {
      const levelEl = document.getElementById('level-select');
      const level = levelEl ? levelEl.value : 'port';
      const renderer = level === 'device' ? window.TopologyDevice : window.TopologyPorts;
      if (renderer && renderer.setLayout) renderer.setLayout(sel.value);
    });
  }
  function bindFullscreen() {
    const btn = document.getElementById('fullscreen-btn');
    const container = document.getElementById('topology-network');
    if (!btn || !container) return;
    btn.addEventListener('click', async () => {
      try {
        const levelEl = document.getElementById('level-select');
        const level = levelEl ? levelEl.value : 'port';
        const renderer = level === 'device' ? window.TopologyDevice : window.TopologyPorts;
        if (!document.fullscreenElement) {
          container.style.height = '100vh';
          await container.requestFullscreen();
          if (renderer && renderer.resize) renderer.resize();
        } else {
          await document.exitFullscreen();
          container.style.height = '85vh';
          if (renderer && renderer.resize) renderer.resize();
        }
      } catch (e) {
        console.warn('全屏切换失败', e);
      }
    });
    document.addEventListener('fullscreenchange', () => {
      const levelEl = document.getElementById('level-select');
      const level = levelEl ? levelEl.value : 'port';
      const renderer = level === 'device' ? window.TopologyDevice : window.TopologyPorts;
      if (document.fullscreenElement) {
        container.style.height = '100vh';
      } else {
        container.style.height = '85vh';
      }
      if (renderer && renderer.resize) renderer.resize();
    });
  }
  window.TopologyPage = {
    init() {
      const status = document.getElementById('status-area');
      if (status) status.textContent = 'Topology 页面已就绪（新栈，不加载旧脚本）。';
      fetchDevices().then(() => {
        bindSearch();
        bindSelect();
        // 确保设备列表加载后再进行自动渲染，便于获取设备名称
        const autoId = resolveDeviceIdFromInputs();
        const name = getSelectedDeviceLabel();
        const levelEl = document.getElementById('level-select');
        const level = levelEl ? levelEl.value : 'port';
        if (autoId) {
          status.textContent = `自动渲染设备 ${autoId} 的${level === 'device' ? '设备级' : '端口级'}拓扑...`;
          const renderer = level === 'device' ? window.TopologyDevice : window.TopologyPorts;
          renderer.render(autoId, name).catch(err => {
            console.error(err);
            status.textContent = '自动渲染失败：' + (err?.message || err);
          });
        }
      });
      bindRenderButton();
      bindLayoutSelect();
      bindFullscreen();
    },
    getDeviceBrief(id) {
      const d = state.devices.find(x => Number(x.id) === Number(id));
      if (!d) return null;
      return {
        id: d.id,
        name: d.name,
        vendor: d.vendor,
        model: d.model,
        power_rating: d.power_rating,
        commission_date: d.commission_date,
        location: d.location,
        station: d.station || d.location,
        lifecycle_status: d.lifecycle_status || d.status || undefined,
      };
    },
    updateDetails(nodeData) {
      const panel = document.getElementById('node-details');
      if (!panel) return;
  
      const isPort = String(nodeData.nodeType || nodeData.type || '').toLowerCase() === 'port';
      const sideLabel = nodeData.side === 'left' ? 'A端' : (nodeData.side === 'right' ? 'B端' : '');
  
      if (isPort) {
        const name = nodeData.port_name || nodeData.label || '';
        const rated = nodeData.rated_current || nodeData.current || '';
        const fuseNo = nodeData.fuse_number || '';
        const fuseSpec = nodeData.fuse_spec || '';
        const breakerNo = nodeData.breaker_number || '';
        const breakerSpec = nodeData.breaker_spec || '';
        const connDevice = nodeData.connected_device || '';
        const connPort = nodeData.connected_port || '';
        const cableModel = nodeData.cable_model || '';
  
        const hasFuse = !!(fuseNo || fuseSpec);
        const hasBreaker = !!(breakerNo || breakerSpec);
  
        const lines = [];
        if (sideLabel) lines.push(`端别: ${sideLabel}`);
        lines.push(`端口名称: ${name}`);
        if (hasFuse) {
          lines.push('端口类型: 熔丝');
          if (fuseNo) lines.push(`熔丝编号: ${fuseNo}`);
          if (fuseSpec) lines.push(`熔丝规格: ${fuseSpec}`);
        } else if (hasBreaker) {
          lines.push('端口类型: 空开');
          if (breakerNo) lines.push(`空开编号: ${breakerNo}`);
          if (breakerSpec) lines.push(`空开规格: ${breakerSpec}`);
        }
        if (rated) lines.push(`端口额定电流: ${rated}`);
        if (connDevice || connPort) lines.push(`连接: ${[connDevice, connPort].filter(Boolean).join(' ')}`);
        if (cableModel) lines.push(`电缆型号: ${cableModel}`);
  
        panel.textContent = lines.join('\n') || '未选中节点';
      } else {
        const name = nodeData.label || '';
        const vendor = nodeData.vendor || '';
        const model = nodeData.model || '';
        const rating = nodeData.power_rating || nodeData.rated_capacity || '';
        const lifecycle = nodeData.lifecycle_status || '';
        const commission = nodeData.commission_date || '';
        const location = nodeData.location || '';
  
        const lines = [
          `设备: ${name}`,
          vendor && `厂家: ${vendor}`,
          model && `型号: ${model}`,
          rating && `额定容量: ${rating}`,
          lifecycle && `生命周期: ${lifecycle}`,
          commission && `投产日期: ${commission}`,
          location && `位置: ${location}`,
        ].filter(Boolean).join('\n');
  
        panel.textContent = lines || '未选中节点';
      }
    }
  };
  document.addEventListener('DOMContentLoaded', () => {
    window.TopologyPage.init();
  });
})();