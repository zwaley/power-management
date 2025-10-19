// 设备管理系统主页JavaScript

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
    // 清除URL中的错误参数，防止错误信息持续显示
    clearUrlErrorParams();
    // 初始化密码输入框
    initializePasswordInput();
    // 添加页面加载动画
    addPageLoadAnimation();
    // 为现有元素添加动画类
    addAnimationClasses();
    // 添加按钮点击反馈
    addButtonClickFeedback();
    // 初始化筛选动画
    initializeFilterAnimations();
});

// 添加页面加载动画
function addPageLoadAnimation() {
    // 为主要容器添加淡入动画
    const container = document.querySelector('.container');
    if (container) {
        container.classList.add('fade-in');
    }
    
    // 为表格添加滑入动画
    const tableContainer = document.querySelector('.table-container');
    if (tableContainer) {
        setTimeout(() => {
            tableContainer.classList.add('slide-in');
        }, 200);
    }
}

// 为元素添加动画类
function addAnimationClasses() {
    // 为按钮添加点击反馈效果
    const buttons = document.querySelectorAll('.btn');
    buttons.forEach(btn => {
        btn.classList.add('btn-feedback');
    });
    
    // 为表格行添加进入动画
    addTableRowAnimations();
}

// 为表格行添加动画效果
function addTableRowAnimations() {
    const tableRows = document.querySelectorAll('tbody tr');
    tableRows.forEach((row, index) => {
        // 为每行添加延迟动画
        row.style.animationDelay = `${index * 0.05}s`;
        row.classList.add('table-row-enter');
    });
}

// 为新添加的表格行添加动画
function animateNewTableRow(row) {
    if (row) {
        row.classList.add('table-row-enter');
        // 动画完成后移除类
        setTimeout(() => {
            row.classList.remove('table-row-enter');
        }, 300);
    }
}

// 为按钮添加点击动画反馈
function addButtonClickFeedback() {
    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('btn') || e.target.closest('.btn')) {
            const btn = e.target.classList.contains('btn') ? e.target : e.target.closest('.btn');
            
            // 添加点击效果
            btn.classList.add('btn-clicked');
            
            // 移除点击效果
            setTimeout(() => {
                btn.classList.remove('btn-clicked');
            }, 150);
        }
    });
}

// 初始化筛选动画
function initializeFilterAnimations() {
    // 为筛选输入框添加动画效果
    const filterInputs = document.querySelectorAll('input[type="text"]');
    filterInputs.forEach(input => {
        input.addEventListener('focus', function() {
            this.parentElement.classList.add('input-focused');
        });
        
        input.addEventListener('blur', function() {
            this.parentElement.classList.remove('input-focused');
        });
    });
    
    // 为筛选标签添加点击动画
    const filterTags = document.querySelectorAll('.filter-tag');
    filterTags.forEach(tag => {
        tag.addEventListener('click', function() {
            // 添加点击波纹效果
            this.classList.add('filter-tag-clicked');
            setTimeout(() => {
                this.classList.remove('filter-tag-clicked');
            }, 300);
        });
    });
}

// 为筛选结果添加动画效果
function animateFilterResults() {
    const tableRows = document.querySelectorAll('tbody tr');
    let visibleIndex = 0;
    
    tableRows.forEach(row => {
        if (row.style.display !== 'none') {
            // 为可见行添加淡入动画
            row.style.animationDelay = `${visibleIndex * 0.02}s`;
            row.classList.add('fade-in');
            visibleIndex++;
            
            // 动画完成后移除类
            setTimeout(() => {
                row.classList.remove('fade-in');
            }, 500 + (visibleIndex * 20));
        }
    });
    
    // 更新计数器动画
    animateCounterUpdate();
}

// 计数器更新动画
function animateCounterUpdate() {
    const counter = document.getElementById('filteredCount');
    if (counter) {
        counter.classList.add('bounce');
        setTimeout(() => {
            counter.classList.remove('bounce');
        }, 600);
    }
}

// 加载统计数据








// 清除URL中的错误参数，防止错误信息持续显示
function clearUrlErrorParams() {
    const url = new URL(window.location);
    const hasErrorParam = url.searchParams.has('error') || url.searchParams.has('success');
    
    if (hasErrorParam) {
        // 清除错误和成功参数
        url.searchParams.delete('error');
        url.searchParams.delete('success');
        
        // 使用replaceState更新URL，不会触发页面刷新
        window.history.replaceState({}, document.title, url.pathname + url.search);
    }
}

// 初始化密码输入框，改善用户体验
function initializePasswordInput() {
    const passwordInput = document.getElementById('password');
    if (passwordInput) {
        // 清空密码框的默认值
        passwordInput.value = '';
        
        // 添加更明确的占位符文本
        passwordInput.placeholder = '请输入管理员密码';
        
        // 添加焦点事件，提供更好的用户反馈
        passwordInput.addEventListener('focus', function() {
            this.parentElement.classList.add('input-focused');
        });
        
        passwordInput.addEventListener('blur', function() {
            this.parentElement.classList.remove('input-focused');
        });
        
        // 添加输入事件，实时验证
        passwordInput.addEventListener('input', function() {
            if (this.value.length > 0) {
                this.parentElement.classList.add('input-has-value');
            } else {
                this.parentElement.classList.remove('input-has-value');
            }
        });
    }
}

// 显示错误消息
function displayErrorMessage(message) {
    const statsGrid = document.getElementById('statsGrid');
    if (!statsGrid) return;

    statsGrid.innerHTML = `
        <div class="error-message">
            <div class="error-icon">
                ${createIcon('error', 'icon-lg')}
            </div>
            <div class="error-text">${message}</div>
            <button class="btn btn-primary" onclick="loadStatistics()">
                ${createIcon('refresh', 'icon-sm')}
                重新加载
            </button>
        </div>
    `;
}



// 导出Excel文件上传处理
function handleFileUpload() {
    const fileInput = document.getElementById('file');
    const passwordInput = document.getElementById('password');
    const file = fileInput.files[0];
    const password = passwordInput.value;
    
    if (!file) {
        alert('请选择要上传的Excel文件');
        return;
    }
    
    if (!password) {
        alert('请输入管理员密码');
        return;
    }
    
    if (!file.name.toLowerCase().endsWith('.xlsx') && !file.name.toLowerCase().endsWith('.xls')) {
        alert('请选择Excel文件（.xlsx或.xls格式）');
        return;
    }
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('password', password);
    
    // 显示上传进度
    const uploadBtn = document.getElementById('uploadBtn');
    const originalText = uploadBtn.innerHTML;
    uploadBtn.innerHTML = `<span class="btn-icon" data-icon="upload"></span><span>上传中...</span>`;
    uploadBtn.disabled = true;
    
    fetch('/upload', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            alert(data.message || 'Excel文件上传成功！');
            // 清空文件输入
            fileInput.value = '';
            // 刷新整个页面以显示最新数据
            window.location.reload();
        } else {
            alert('上传失败：' + (data.message || '未知错误'));
        }
    })
    .catch(error => {
        console.error('上传错误:', error);
        alert('上传失败，请检查网络连接');
    })
    .finally(() => {
        // 恢复按钮状态
        uploadBtn.innerHTML = originalText;
        uploadBtn.disabled = false;
    });
}

// 手动添加设备表单处理
function handleManualAdd() {
    // 获取表单数据
    const formData = {
        device_id: document.getElementById('deviceId').value.trim(),
        device_name: document.getElementById('deviceName').value.trim(),
        device_type: document.getElementById('deviceType').value.trim(),
        manufacturer: document.getElementById('manufacturer').value.trim(),
        model: document.getElementById('model').value.trim(),
        location: document.getElementById('location').value.trim()
    };
    
    // 验证必填字段
    if (!formData.device_id || !formData.device_name || !formData.device_type) {
        alert('请填写设备ID、设备名称和设备类型');
        return;
    }
    
    // 显示提交进度
    const submitBtn = document.querySelector('button[onclick="handleManualAdd()"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = `${createIcon('upload', 'icon-sm')} 提交中...`;
    submitBtn.disabled = true;
    
    fetch('/add_device', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            alert('设备添加成功！');
            // 清空表单
            document.getElementById('manualAddForm').reset();
            // 刷新统计数据
            loadStatistics();
        } else {
            alert('添加失败：' + (data.message || '未知错误'));
        }
    })
    .catch(error => {
        console.error('添加设备错误:', error);
        alert('添加失败，请检查网络连接');
    })
    .finally(() => {
        // 恢复按钮状态
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    });
}

// 设备列表相关功能
function loadDeviceList() {
    // 跳转到设备列表页面或显示设备列表模态框
    window.location.href = '/devices';
}

// 创建密码输入对话框
function showPasswordDialog(title, callback) {
    // 创建遮罩层
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        z-index: 1000;
        display: flex;
        justify-content: center;
        align-items: center;
    `;
    
    // 创建对话框
    const dialog = document.createElement('div');
    dialog.style.cssText = `
        background: white;
        padding: 20px;
        border-radius: 8px;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        min-width: 300px;
        text-align: center;
    `;
    
    dialog.innerHTML = `
        <h3 style="margin-top: 0; color: #333;">${title}</h3>
        <p style="margin: 10px 0; color: #666; font-size: 14px; line-height: 1.4;">
            为了保护系统安全，此操作需要管理员密码验证。<br>
            请输入管理员密码以继续操作。
        </p>
        <input type="password" id="passwordInput" placeholder="请输入管理员密码" 
               style="width: 100%; padding: 8px; margin: 10px 0; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box;">
        <div style="margin-top: 15px;">
            <button id="confirmBtn" style="background: #007bff; color: white; border: none; padding: 8px 16px; margin: 0 5px; border-radius: 4px; cursor: pointer;">确定</button>
            <button id="cancelBtn" style="background: #6c757d; color: white; border: none; padding: 8px 16px; margin: 0 5px; border-radius: 4px; cursor: pointer;">取消</button>
        </div>
    `;
    
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    
    const passwordInput = dialog.querySelector('#passwordInput');
    const confirmBtn = dialog.querySelector('#confirmBtn');
    const cancelBtn = dialog.querySelector('#cancelBtn');
    
    // 聚焦到密码输入框
    passwordInput.focus();
    
    // 处理确定按钮点击
    const handleConfirm = () => {
        const password = passwordInput.value;
        if (password.trim() === '') {
            alert('密码不能为空');
            passwordInput.focus();
            return;
        }
        document.body.removeChild(overlay);
        callback(password);
    };
    
    // 处理取消按钮点击
    const handleCancel = () => {
        document.body.removeChild(overlay);
        callback(null);
    };
    
    confirmBtn.addEventListener('click', handleConfirm);
    cancelBtn.addEventListener('click', handleCancel);
    
    // 支持回车键确认
    passwordInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleConfirm();
        }
    });
    
    // 支持ESC键取消
    document.addEventListener('keydown', function escHandler(e) {
        if (e.key === 'Escape') {
            document.removeEventListener('keydown', escHandler);
            handleCancel();
        }
    });
}

function editDevice(deviceId) {
    showPasswordDialog('编辑设备', (password) => {
        if (password === null) return; // 用户取消
        
        // 跳转到编辑页面，传递设备ID和密码
        window.location.href = `/edit/${deviceId}?password=${encodeURIComponent(password)}`;
    });
}

// deleteDevice函数已在index.html中定义，这里不需要重复定义

// 生成设备操作按钮组
function generateDeviceActionButtons(deviceId) {
    return `
        <div class="btn-group">
            <button class="btn btn-sm btn-outline-primary" onclick="editDevice('${deviceId}')">
                <span class="btn-icon" data-icon="edit"></span>
                <span>编辑</span>
            </button>
            <button class="btn btn-sm btn-outline-danger" onclick="deleteDevice('${deviceId}')">
                <span class="btn-icon" data-icon="trash"></span>
                <span>删除</span>
            </button>
        </div>
    `;
}

// 生命周期管理
function goToLifecycleManagement() {
    window.location.href = '/lifecycle-management';
}

// 图表分析
function goToGraphAnalysis() {
    window.location.href = '/graph';
}

// 当前筛选状态
let currentFilters = {
    station: '',
    name: '',
    deviceType: '',
    manufacturer: '',
    lifecycle: ''
};

// 标签式筛选 - 设备类型
function selectDeviceTypeFilter(element, value) {
    // 移除所有活动状态
    document.querySelectorAll('#deviceTypeFilters .filter-tag').forEach(tag => {
        tag.classList.remove('active');
    });
    
    // 设置当前标签为活动状态
    element.classList.add('active');
    
    // 更新筛选状态
    currentFilters.deviceType = value;
    
    // 执行筛选
    filterDevices();
}

// 标签式筛选 - 生命周期状态
function selectLifecycleFilter(element, value) {
    // 移除所有活动状态
    document.querySelectorAll('#lifecycleFilters .filter-tag').forEach(tag => {
        tag.classList.remove('active');
    });
    
    // 设置当前标签为活动状态
    element.classList.add('active');
    
    // 更新筛选状态
    currentFilters.lifecycle = value;
    
    // 执行筛选
    filterDevices();
}

// 清除厂家搜索
function clearManufacturerFilter() {
    const input = document.getElementById('manufacturerFilter');
    const clearBtn = input.parentElement.querySelector('.clear-search-btn');
    
    input.value = '';
    clearBtn.style.display = 'none';
    currentFilters.manufacturer = '';
    filterDevices();
}

// 清除设备名称搜索
function clearNameFilter() {
    const input = document.getElementById('nameFilter');
    const clearBtn = input.parentElement.querySelector('.clear-search-btn');
    
    input.value = '';
    clearBtn.style.display = 'none';
    currentFilters.name = '';
    filterDevices();
}

// ==================== 导出功能 ====================

// 设备管理：已改为直接导出当前筛选结果（CSV）。
// 旧的“导出确认”对话框及其逻辑已移除。
// 请使用 exportDevices() 直接触发下载。

// 直接导出设备列表当前筛选结果（CSV）
function exportDevices() {
    const table = document.getElementById('deviceTable');
    if (!table) {
        alert('未找到设备表格');
        return;
    }

    const rows = Array.from(table.querySelectorAll('tbody tr'));
    const visibleRows = rows.filter(row => row.style.display !== 'none');

    if (visibleRows.length === 0) {
        alert('当前筛选结果为空，没有可导出的数据');
        return;
    }

    const headers = ['ID','资产编号','设备名称','局站','设备类型','设备型号','所在位置','额定容量','设备生产厂家','投产日期','生命周期状态','备注'];
    const csvRows = [];
    csvRows.push(headers.join(','));

    visibleRows.forEach(row => {
        const cells = Array.from(row.querySelectorAll('td'));
        const values = [];
        // 取前12列，跳过最后的“操作”列
        for (let i = 0; i <= 11; i++) {
            let text = cells[i] ? (cells[i].innerText || cells[i].textContent || '') : '';
            text = text.replace(/\r?\n|\r/g, ' ').trim();
            text = text.replace(/"/g, '""');
            values.push(`"${text}"`);
        }
        csvRows.push(values.join(','));
    });

    const csvContent = csvRows.join('\r\n');
    const bom = '\ufeff'; // 让Excel正确识别UTF-8中文
    const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8' });

    const now = new Date();
    const pad = n => n.toString().padStart(2, '0');
    const filename = `devices_export_${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.csv`;

    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    URL.revokeObjectURL(link.href);
    document.body.removeChild(link);

    alert('导出成功！文件已开始下载。');
}