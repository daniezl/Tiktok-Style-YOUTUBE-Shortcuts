// 默认设置
const DEFAULT_SETTINGS = {
  keys: {
    w: 'w',
    s: 's',
    a: 'a',
    d: 'd',
    z: 'z'
  },
  scrollSpeed: 20,
  arrowKeysAsWASD: true,
  arrowKeysScroll: true
};

let currentSettings = { ...DEFAULT_SETTINGS };
let originalSettings = null; // 保存原始设置，用于检测是否改变

// 按键代码到显示名称的映射
function formatKeyName(key) {
  if (!key) return 'None';
  if (key === ' ') return 'Space';
  if (key.length === 1) return key.toUpperCase();
  return key; // 对于 ArrowUp 等保持原样或进一步处理
}

// 检查是否有键绑定冲突
function checkConflicts(newKey, excludeAction) {
  if (!newKey) return null; // 空键不冲突
  
  for (const [action, boundKey] of Object.entries(currentSettings.keys || {})) {
    if (action !== excludeAction && boundKey && boundKey.toLowerCase() === newKey.toLowerCase()) {
      return action;
    }
  }
  return null;
}

// 显示冲突错误
function showConflictError(action, conflictingAction) {
  const btn = document.getElementById(`btn-${action}`);
  if (btn) {
    btn.classList.add('conflict');
    setTimeout(() => {
      btn.classList.remove('conflict');
    }, 2000);
  }
  
  // 可以添加一个提示消息
  console.warn(`Key conflict: ${action} and ${conflictingAction} both use the same key`);
}

  // 检测设置是否改变
function hasSettingsChanged() {
  if (!originalSettings) return false;
  
  // 比较键绑定
  for (const key of Object.keys(DEFAULT_SETTINGS.keys)) {
    const current = (currentSettings.keys[key] || '').toLowerCase();
    const original = (originalSettings.keys[key] || '').toLowerCase();
    if (current !== original) {
      return true;
    }
  }
  
  // 比较滚动速度
  if (currentSettings.scrollSpeed !== originalSettings.scrollSpeed) {
    return true;
  }
  
  // 比较箭头键设置
  if (currentSettings.arrowKeysAsWASD !== originalSettings.arrowKeysAsWASD) {
    return true;
  }
  
  // 比较箭头键滚动设置
  if (currentSettings.arrowKeysScroll !== originalSettings.arrowKeysScroll) {
    return true;
  }
  
  return false;
}

// 显示/隐藏刷新提示
function updateRefreshNotice() {
  const notice = document.getElementById('refresh-notice');
  if (notice) {
    if (hasSettingsChanged()) {
      notice.classList.remove('hidden');
    } else {
      notice.classList.add('hidden');
    }
  }
}

// 刷新当前 YouTube 标签页
async function refreshYouTubeTabs() {
  try {
    const tabs = await chrome.tabs.query({ url: ['*://www.youtube.com/*', '*://youtube.com/*'] });
    if (tabs.length === 0) {
      // 如果没有找到 YouTube 标签页，尝试刷新当前活动标签页
      const currentTabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (currentTabs.length > 0) {
        chrome.tabs.reload(currentTabs[0].id);
      }
    } else {
      for (const tab of tabs) {
        chrome.tabs.reload(tab.id);
      }
    }
    
    // 重置原始设置
    originalSettings = JSON.parse(JSON.stringify(currentSettings));
    updateRefreshNotice();
  } catch (error) {
    console.error('Error refreshing tabs:', error);
  }
}

// 更新UI显示
function updateUI() {
  // 更新按键显示
  Object.keys(DEFAULT_SETTINGS.keys).forEach(key => {
    const btn = document.getElementById(`btn-${key}`);
    const boundKey = currentSettings.keys[key];
    
    if (btn) {
      if (boundKey) {
        btn.textContent = formatKeyName(boundKey);
        btn.classList.remove('unbound');
      } else {
        btn.textContent = 'None';
        btn.classList.add('unbound');
      }
      btn.classList.remove('recording');
    }
  });

  // 更新滑块
  const speedSlider = document.getElementById('scroll-speed');
  const speedValue = document.getElementById('speed-value');
  if (speedSlider && speedValue) {
    const speed = currentSettings.scrollSpeed || 20;
    speedSlider.value = speed;
    speedValue.textContent = speed;
  }

  // 更新开关
  const arrowKeysToggle = document.getElementById('arrow-keys-toggle');
  if (arrowKeysToggle) {
    arrowKeysToggle.checked = currentSettings.arrowKeysAsWASD !== undefined ? currentSettings.arrowKeysAsWASD : true;
  }
  
  const arrowKeysScrollToggle = document.getElementById('arrow-keys-scroll-toggle');
  if (arrowKeysScrollToggle) {
    arrowKeysScrollToggle.checked = currentSettings.arrowKeysScroll !== undefined ? currentSettings.arrowKeysScroll : true;
  }
}

// 保存设置（不广播，因为需要刷新页面）
async function saveSettings() {
  await chrome.storage.sync.set({ shortcutSettings: currentSettings });
  updateRefreshNotice();
}

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
  // 加载设置
  const result = await chrome.storage.sync.get(['shortcutSettings']);
  if (result.shortcutSettings) {
    currentSettings = { ...DEFAULT_SETTINGS, ...result.shortcutSettings };
    // 确保 keys 对象存在
    if (!currentSettings.keys) currentSettings.keys = { ...DEFAULT_SETTINGS.keys };
  }
  
  // 保存原始设置用于比较
  originalSettings = JSON.parse(JSON.stringify(currentSettings));
  
  updateUI();
  updateRefreshNotice();

  // 绑定点击事件，开始录制按键
  document.querySelectorAll('.key-bind-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const actionKey = btn.getAttribute('data-key');
      
      // 如果已经在录制这个键，取消录制
      if (btn.classList.contains('recording')) {
        updateUI();
        return;
      }

      // 重置其他所有按钮状态
      updateUI();
      
      // 进入录制状态
      btn.textContent = 'Press Key...';
      btn.classList.add('recording');

      // 添加一次性键盘监听
      const handleKeyDown = (event) => {
        event.preventDefault();
        event.stopPropagation();
        
        const key = event.key.toLowerCase();
        
        // 允许的按键：字母、数字、方向键、空格
        // 排除系统键如 Shift, Control, Alt, Meta
        if (['shift', 'control', 'alt', 'meta', 'escape', 'backspace'].includes(key)) {
            // Escape 取消录制
            if (key === 'escape') {
              document.removeEventListener('keydown', handleKeyDown);
              updateUI();
            }
            return; // 忽略其他修饰键
        }

        // 检查冲突
        const conflictingAction = checkConflicts(key, actionKey);
        if (conflictingAction) {
          showConflictError(actionKey, conflictingAction);
          document.removeEventListener('keydown', handleKeyDown);
          updateUI();
          return;
        }

        // 保存新按键
        currentSettings.keys[actionKey] = key;
        
        // 移除监听器并保存
        document.removeEventListener('keydown', handleKeyDown);
        updateUI();
        saveSettings();
      };

      // 稍微延迟添加监听器，避免点击按钮的 Enter 键立即触发
      setTimeout(() => {
        document.addEventListener('keydown', handleKeyDown);
        
        // 点击页面其他地方取消录制
        const handleOutsideClick = (clickEvent) => {
            if (clickEvent.target !== btn) {
                document.removeEventListener('keydown', handleKeyDown);
                document.removeEventListener('click', handleOutsideClick);
                updateUI();
            }
        };
        document.addEventListener('click', handleOutsideClick);
      }, 100);
    });
  });

  // 解绑按钮
  document.querySelectorAll('.unbind-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const actionKey = btn.getAttribute('data-key');
      currentSettings.keys[actionKey] = ''; // 设置为空字符串表示解绑
      updateUI();
      saveSettings();
    });
  });

  // 滚动速度滑块
  const speedSlider = document.getElementById('scroll-speed');
  const speedValue = document.getElementById('speed-value');
  
  if (speedSlider) {
    speedSlider.addEventListener('input', (e) => {
      const val = parseInt(e.target.value);
      speedValue.textContent = val;
      currentSettings.scrollSpeed = val;
      saveSettings();
    });
  }

  // 箭头键开关
  const arrowKeysToggle = document.getElementById('arrow-keys-toggle');
  if (arrowKeysToggle) {
    arrowKeysToggle.addEventListener('change', (e) => {
      currentSettings.arrowKeysAsWASD = e.target.checked;
      saveSettings();
    });
  }

  // 箭头键滚动开关
  const arrowKeysScrollToggle = document.getElementById('arrow-keys-scroll-toggle');
  if (arrowKeysScrollToggle) {
    arrowKeysScrollToggle.addEventListener('change', (e) => {
      currentSettings.arrowKeysScroll = e.target.checked;
      saveSettings();
    });
  }

  // 重置按钮
  document.getElementById('reset-btn').addEventListener('click', () => {
    if (confirm('Are you sure you want to reset all settings to default values?')) {
      currentSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS)); // 深拷贝重置
      updateUI();
      saveSettings();
    }
  });

  // 刷新按钮
  document.getElementById('refresh-btn').addEventListener('click', () => {
    refreshYouTubeTabs();
  });
});
