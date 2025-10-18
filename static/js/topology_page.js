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
    const q = getQueryParam('device_id');
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
    if (!input || !listEl) return;
    input.addEventListener('input', () => {
      const q = input.value.trim().toLowerCase();
      if (!q) { listEl.innerHTML = ''; return; }
      const items = state.devices
        .filter(d => String(d.name || '').toLowerCase().includes(q) || String(d.id).includes(q))
        .slice(0, 10);
      listEl.innerHTML = items.map(d => `<button type="button" class="list-group-item list-group-item-action" data-id="${d.id}">${escapeHtml(d.name)} <span class="text-muted">#${d.id}</span></button>`).join('');
      listEl.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = Number(btn.getAttribute('data-id'));
          const sel = document.getElementById('device-select');
          if (sel) sel.value = String(id);
          input.value = String(id);
          document.getElementById('status-area').textContent = `选择设备 #${id}`;
          window.TopologyPorts.render(id).catch(err => console.error(err));
        });
      });
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
      window.TopologyPorts.render(id, name).catch(err => console.error(err));
    });
  }
  function bindRenderButton() {
    const status = document.getElementById('status-area');
    const btn = document.getElementById('render-btn');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const sel = document.getElementById('device-select');
      let id = sel && sel.value ? Number(sel.value) : undefined;
      if (!id) {
        const input = document.getElementById('device-search-input');
        if (input && input.value && !isNaN(Number(input.value))) id = Number(input.value);
      }
      if (!id) id = resolveDeviceIdFromInputs();
      const name = getSelectedDeviceLabel();
      status.textContent = `开始渲染设备 ${id} 的端口拓扑...`;
      window.TopologyPorts.render(id, name).catch(err => {
        console.error(err);
        status.textContent = '渲染失败：' + (err?.message || err);
      });
    });
  }
  function bindLayoutSelect() {
    const sel = document.getElementById('layout-select');
    if (!sel) return;
    sel.addEventListener('change', () => {
      window.TopologyPorts.setLayout(sel.value);
    });
  }
  function bindFullscreen() {
    const btn = document.getElementById('fullscreen-btn');
    const container = document.getElementById('topology-network');
    if (!btn || !container) return;
    btn.addEventListener('click', async () => {
      try {
        if (!document.fullscreenElement) {
          container.style.height = '100vh';
          await container.requestFullscreen();
          if (window.TopologyPorts && window.TopologyPorts.resize) window.TopologyPorts.resize();
        } else {
          await document.exitFullscreen();
          container.style.height = '85vh';
          if (window.TopologyPorts && window.TopologyPorts.resize) window.TopologyPorts.resize();
        }
      } catch (e) {
        console.warn('全屏切换失败', e);
      }
    });
    document.addEventListener('fullscreenchange', () => {
      if (document.fullscreenElement) {
        container.style.height = '100vh';
      } else {
        container.style.height = '85vh';
      }
      if (window.TopologyPorts && window.TopologyPorts.resize) window.TopologyPorts.resize();
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
        if (autoId) {
          status.textContent = `自动渲染设备 ${autoId} 的端口拓扑...`;
          window.TopologyPorts.render(autoId, name).catch(err => {
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
        lifecycle_status: d.lifecycle_status || d.status || undefined,
      };
    },
    updateDetails(nodeData) {
      const box = document.getElementById('node-details');
      if (!box) return;
      if (!nodeData) { box.textContent = '未选中节点'; return; }
      const lines = [];
      if (nodeData.nodeType === 'device') {
        const d = this.getDeviceBrief(nodeData.id);
        lines.push(`设备: ${nodeData.label || (d?.name || '')}`);
        if (d?.vendor) lines.push(`厂家: ${d.vendor}`);
        if (d?.model) lines.push(`型号: ${d.model}`);
        if (d?.power_rating) lines.push(`额定容量: ${d.power_rating}`);
        if (d?.lifecycle_status) lines.push(`生命周期: ${d.lifecycle_status}`);
        if (d?.commission_date) lines.push(`投产日期: ${d.commission_date}`);
        if (d?.location) lines.push(`位置: ${d.location}`);
      } else {
        lines.push(`端口: ${nodeData.port_name || nodeData.label || nodeData.id}`);
        if (nodeData.fuse_number) lines.push(`熔丝/空开编号: ${nodeData.fuse_number}`);
        if (nodeData.fuse_spec) lines.push(`熔丝/空开型号: ${nodeData.fuse_spec}`);
        if (nodeData.breaker_number) lines.push(`空开编号: ${nodeData.breaker_number}`);
        if (nodeData.breaker_spec) lines.push(`空开型号: ${nodeData.breaker_spec}`);
        if (nodeData.rated_current) lines.push(`额定电流: ${nodeData.rated_current}`);
      }
      box.innerHTML = lines.map(escapeHtml).join('<br>');
    }
  };
  document.addEventListener('DOMContentLoaded', () => {
    window.TopologyPage.init();
  });
})();