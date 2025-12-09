(function() {
  'use strict';

  // 默认设置
  const DEFAULT_SETTINGS = {
    keys: {
      w: 'w',
      s: 's',
      a: 'a',
      d: 'd',
      z: 'z'
    },
    scrollSpeed: 20
  };

  // 当前设置
  let settings = { ...DEFAULT_SETTINGS };
  let scrollSpeed = DEFAULT_SETTINGS.scrollSpeed;
  let arrowKeysAsWASD = true; // 默认开启
  let arrowKeysScroll = true; // 默认开启

  // 键盘映射：A/D -> 方向键
  const keyMap = {
    'a': 'ArrowLeft',
    'd': 'ArrowRight'
  };

  // 跟踪当前按下的键
  const pressedKeys = new Set();
  let dKeyTimer = null;
  let arrowRightTimer = null;
  let spaceKeyPressed = false;
  let arrowRightLongPress = false; // 标记右箭头键是否进入长按状态
  let wKeyAnimationFrame = null;
  let sKeyAnimationFrame = null;
  let isScrollingW = false;
  let isScrollingS = false;

  // 加载设置
  function loadSettings() {
    chrome.storage.sync.get(['shortcutSettings'], (result) => {
      if (result.shortcutSettings) {
        settings = result.shortcutSettings;
        scrollSpeed = settings.scrollSpeed !== undefined ? settings.scrollSpeed : DEFAULT_SETTINGS.scrollSpeed;
        arrowKeysAsWASD = settings.arrowKeysAsWASD !== undefined ? settings.arrowKeysAsWASD : true;
        arrowKeysScroll = settings.arrowKeysScroll !== undefined ? settings.arrowKeysScroll : true;
      }
    });
  }

  // 初始化加载设置
  loadSettings();

  // 监听来自 popup 的设置更新
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'updateSettings') {
      settings = request.settings;
      scrollSpeed = settings.scrollSpeed || DEFAULT_SETTINGS.scrollSpeed;
      arrowKeysAsWASD = settings.arrowKeysAsWASD !== undefined ? settings.arrowKeysAsWASD : true;
      arrowKeysScroll = settings.arrowKeysScroll || false;
      // 可以在这里打印日志调试：console.log('Settings updated:', settings);
    }
  });

  // 获取绑定的键
  function getBoundKey(action) {
    // 查找哪个键绑定了这个动作
    for (const [key, value] of Object.entries(settings.keys || {})) {
      if (key === action && value) {
        return value.toLowerCase();
      }
    }
    return null;
  }

  // 检查键是否被绑定
  function isKeyBound(key) {
    return Object.values(settings.keys || {}).includes(key.toLowerCase());
  }

  // 创建并分发键盘事件
  function createKeyboardEvent(type, key, code, keyCode) {
    const event = new KeyboardEvent(type, {
      key: key,
      code: code,
      keyCode: keyCode,
      which: keyCode,
      bubbles: true,
      cancelable: true,
      view: window
    });
    return event;
  }

  // 使用 requestAnimationFrame 实现平滑的持续滚动
  function startContinuousScroll(action, pressedKey) {
    // 如果已经在滚动，不重复启动
    if ((action === 'w' && isScrollingW) || (action === 's' && isScrollingS)) {
      return;
    }
    
    // 开始平滑的持续滚动动画
    let lastTime = performance.now();
    // 使用设置中的滚动速度（转换为像素/帧，范围1-20映射到0.5-10）
    const speedMultiplier = scrollSpeed / 2;
    
    const animateScroll = (currentTime) => {
      if (!pressedKeys.has(pressedKey)) {
        // 键已释放，停止动画
        if (action === 'w') {
          isScrollingW = false;
          wKeyAnimationFrame = null;
        } else {
          isScrollingS = false;
          sKeyAnimationFrame = null;
        }
        return;
      }
      
      const deltaTime = currentTime - lastTime;
      lastTime = currentTime;
      
      // 计算这一帧应该滚动的距离（基于时间差，确保不同帧率下速度一致）
      const scrollAmount = (speedMultiplier * deltaTime) / (1000 / 60); // 标准化到60fps
      
      if (action === 'w') {
        window.scrollBy({ top: -scrollAmount, behavior: 'auto' });
        wKeyAnimationFrame = requestAnimationFrame(animateScroll);
      } else if (action === 's') {
        window.scrollBy({ top: scrollAmount, behavior: 'auto' });
        sKeyAnimationFrame = requestAnimationFrame(animateScroll);
      }
    };
    
    // 立即开始动画循环
    if (action === 'w') {
      isScrollingW = true;
      wKeyAnimationFrame = requestAnimationFrame(animateScroll);
    } else if (action === 's') {
      isScrollingS = true;
      sKeyAnimationFrame = requestAnimationFrame(animateScroll);
    }
  }
  
  // 停止持续滚动
  function stopContinuousScroll(key) {
    if (key === 'w') {
      if (wKeyAnimationFrame) {
        cancelAnimationFrame(wKeyAnimationFrame);
        wKeyAnimationFrame = null;
      }
      isScrollingW = false;
    } else if (key === 's') {
      if (sKeyAnimationFrame) {
        cancelAnimationFrame(sKeyAnimationFrame);
        sKeyAnimationFrame = null;
      }
      isScrollingS = false;
    }
  }

  // 检查按钮是否在评论区（排除评论区的点赞按钮）
  function isInCommentsSection(element) {
    if (!element) return false;
    let current = element;
    // 向上遍历DOM树，检查是否在评论区
    for (let i = 0; i < 10 && current; i++) {
      if (current.id === 'comments' || 
          current.id === 'comment-section' ||
          current.classList?.contains('comment') ||
          current.tagName === 'YTD-COMMENT-THREAD-RENDERER' ||
          current.tagName === 'YTD-COMMENT-RENDERER' ||
          current.closest('#comments') ||
          current.closest('#comment-section')) {
        return true;
      }
      current = current.parentElement;
    }
    return false;
  }

  // 处理点赞 - 参考 avi12/youtube-like-dislike-shortcut 的实现方式
  // 只点击视频的点赞按钮，排除评论区的点赞按钮
  function handleLike() {
    // 方法1: 通过 top-level-buttons-computed 查找第一个 toggle（最可靠，这是视频的点赞按钮）
    const topLevelButtons = document.querySelector('#top-level-buttons-computed');
    if (topLevelButtons) {
      const likeToggle = topLevelButtons.querySelector('ytd-toggle-button-renderer:first-child');
      if (likeToggle) {
        const button = likeToggle.querySelector('button');
        if (button && !isInCommentsSection(button)) {
          try {
            button.click();
            return;
          } catch (e) {
            const mouseEvent = new MouseEvent('click', {
              view: window,
              bubbles: true,
              cancelable: true,
              buttons: 1
            });
            button.dispatchEvent(mouseEvent);
            return;
          }
        }
      }
    }
    
    // 方法2: 通过 target-id="watch-like" 查找（这是视频的点赞按钮）
    const likeByTargetId = document.querySelector('ytd-toggle-button-renderer[target-id="watch-like"]');
    if (likeByTargetId) {
      const button = likeByTargetId.querySelector('button');
      if (button && !isInCommentsSection(button)) {
        try {
          button.click();
          return;
        } catch (e) {
          const mouseEvent = new MouseEvent('click', {
            view: window,
            bubbles: true,
            cancelable: true,
            buttons: 1
          });
          button.dispatchEvent(mouseEvent);
          return;
        }
      }
    }
    
    // 方法3: 查找所有 toggle-button-renderer，但排除评论区的
    const allToggles = document.querySelectorAll('ytd-toggle-button-renderer');
    for (const toggle of allToggles) {
      // 跳过评论区的 toggle
      if (isInCommentsSection(toggle)) continue;
      
      const button = toggle.querySelector('button');
      if (!button) continue;
      
      const ariaLabel = (button.getAttribute('aria-label') || '').toLowerCase();
      const targetId = toggle.getAttribute('target-id') || '';
      
      // 检查是否是点赞按钮，且不在评论区
      if ((ariaLabel.includes('like') || 
           ariaLabel.includes('赞') || 
           targetId.includes('like')) &&
          !isInCommentsSection(button)) {
        try {
          button.click();
          return;
        } catch (e) {
          const mouseEvent = new MouseEvent('click', {
            view: window,
            bubbles: true,
            cancelable: true,
            buttons: 1
          });
          button.dispatchEvent(mouseEvent);
          return;
        }
      }
    }
    
    // 方法4: 查找所有按钮，但排除评论区的
    const allButtons = document.querySelectorAll('button[aria-label]');
    for (const btn of allButtons) {
      // 跳过评论区的按钮
      if (isInCommentsSection(btn)) continue;
      
      const label = (btn.getAttribute('aria-label') || '').toLowerCase();
      if ((label.includes('like') || label.includes('赞')) && !isInCommentsSection(btn)) {
        try {
          btn.click();
          return;
        } catch (e) {
          const mouseEvent = new MouseEvent('click', {
            view: window,
            bubbles: true,
            cancelable: true,
            buttons: 1
          });
          btn.dispatchEvent(mouseEvent);
          return;
        }
      }
    }
  }

  // 处理WASD键按下
  function handleWASDKeyDown(event) {
    const key = event.key.toLowerCase();
    
    // 获取绑定的键
    const boundW = getBoundKey('w');
    const boundS = getBoundKey('s');
    const boundA = getBoundKey('a');
    const boundD = getBoundKey('d');
    
    // 处理 W/S 键：页面滚动（支持长按持续滚动）
    if (boundW && key === boundW && !pressedKeys.has(key)) {
      pressedKeys.add(key);
      startContinuousScroll('w', key);
      return;
    }
    if (boundS && key === boundS && !pressedKeys.has(key)) {
      pressedKeys.add(key);
      startContinuousScroll('s', key);
      return;
    }
    
    if (boundD && key === boundD && !pressedKeys.has(key)) {
      // 开始长按D键的处理
      pressedKeys.add(key);
      let isShortPress = true;
      
      dKeyTimer = setTimeout(() => {
        // 200ms后认为是长按，触发空格键
        isShortPress = false;
        if (!spaceKeyPressed) {
          spaceKeyPressed = true;
          const spaceDownEvent = createKeyboardEvent('keydown', ' ', 'Space', 32);
          // 只在video元素上触发，避免重复触发
          const video = document.querySelector('video');
          if (video) {
            video.dispatchEvent(spaceDownEvent);
          } else {
            document.dispatchEvent(spaceDownEvent);
          }
        }
      }, 200); // 200ms后认为是长按
    } else if (arrowKeysAsWASD && (event.key === 'ArrowRight' || key === 'arrowright') && !pressedKeys.has('arrowright')) {
      // 如果启用了箭头键功能，右箭头键和D键一样
      pressedKeys.add('arrowright');
      arrowRightLongPress = false;
      
      arrowRightTimer = setTimeout(() => {
        // 200ms后认为是长按，触发空格键并阻止默认行为
        arrowRightLongPress = true;
        if (!spaceKeyPressed) {
          spaceKeyPressed = true;
          const spaceDownEvent = createKeyboardEvent('keydown', ' ', 'Space', 32);
          const video = document.querySelector('video');
          if (video) {
            video.dispatchEvent(spaceDownEvent);
          } else {
            document.dispatchEvent(spaceDownEvent);
          }
        }
      }, 200);
    } else if (boundA && key === boundA && !pressedKeys.has(key)) {
      // 处理A键（左方向键）
      pressedKeys.add(key);
      const targetKey = keyMap[key];
      const keyCode = {
        'ArrowLeft': 37,
        'ArrowRight': 39
      }[targetKey];
      
      // 只在video元素上触发，避免重复触发
      const video = document.querySelector('video');
      if (video) {
        const arrowDownEvent = createKeyboardEvent('keydown', targetKey, targetKey, keyCode);
        video.dispatchEvent(arrowDownEvent);
      } else {
        // 如果没有video元素，在document上触发
        const arrowDownEvent = createKeyboardEvent('keydown', targetKey, targetKey, keyCode);
        document.dispatchEvent(arrowDownEvent);
      }
    }
  }

  // 处理WASD键释放
  function handleWASDKeyUp(event) {
    const key = event.key.toLowerCase();
    
    // 获取绑定的键
    const boundW = getBoundKey('w');
    const boundS = getBoundKey('s');
    const boundA = getBoundKey('a');
    const boundD = getBoundKey('d');
    
    if (boundD && key === boundD && pressedKeys.has(key)) {
      pressedKeys.delete(key);
      
      // 清除长按定时器
      let wasShortPress = false;
      if (dKeyTimer) {
        clearTimeout(dKeyTimer);
        dKeyTimer = null;
        wasShortPress = true; // 定时器被清除，说明是短按
      }
      
      // 如果正在模拟空格键，释放它
      if (spaceKeyPressed) {
        spaceKeyPressed = false;
        const spaceUpEvent = createKeyboardEvent('keyup', ' ', 'Space', 32);
        const video = document.querySelector('video');
        if (video) {
          video.dispatchEvent(spaceUpEvent);
        } else {
          document.dispatchEvent(spaceUpEvent);
        }
      } else if (wasShortPress) {
        // 短按D（200ms内释放）：触发一次右方向键
        const arrowRightDownEvent = createKeyboardEvent('keydown', 'ArrowRight', 'ArrowRight', 39);
        const arrowRightUpEvent = createKeyboardEvent('keyup', 'ArrowRight', 'ArrowRight', 39);
        const video = document.querySelector('video');
        if (video) {
          video.dispatchEvent(arrowRightDownEvent);
          video.dispatchEvent(arrowRightUpEvent);
        } else {
          document.dispatchEvent(arrowRightDownEvent);
          document.dispatchEvent(arrowRightUpEvent);
        }
      }
    } else if (arrowKeysAsWASD && (event.key === 'ArrowRight' || key === 'arrowright') && pressedKeys.has('arrowright')) {
      pressedKeys.delete('arrowright');
      
      // 清除长按定时器
      const wasLongPress = arrowRightLongPress;
      if (arrowRightTimer) {
        clearTimeout(arrowRightTimer);
        arrowRightTimer = null;
      }
      arrowRightLongPress = false;
      
      // 如果正在模拟空格键，释放它
      if (spaceKeyPressed) {
        spaceKeyPressed = false;
        const spaceUpEvent = createKeyboardEvent('keyup', ' ', 'Space', 32);
        const video = document.querySelector('video');
        if (video) {
          video.dispatchEvent(spaceUpEvent);
        } else {
          document.dispatchEvent(spaceUpEvent);
        }
      }
      // 注意：如果是短按右箭头键，不需要额外处理，因为YouTube会正常处理前进
    } else if (boundA && key === boundA && pressedKeys.has(key)) {
      // 处理A键释放（左方向键）
      pressedKeys.delete(key);
      const targetKey = keyMap[key];
      const keyCode = {
        'ArrowLeft': 37,
        'ArrowRight': 39
      }[targetKey];
      
      // 只在video元素上触发，避免重复触发
      const video = document.querySelector('video');
      if (video) {
        const arrowUpEvent = createKeyboardEvent('keyup', targetKey, targetKey, keyCode);
        video.dispatchEvent(arrowUpEvent);
      } else {
        // 如果没有video元素，在document上触发
        const arrowUpEvent = createKeyboardEvent('keyup', targetKey, targetKey, keyCode);
        document.dispatchEvent(arrowUpEvent);
      }
    } else if (boundW && key === boundW && pressedKeys.has(key)) {
      // 处理W键释放（停止持续滚动）
      pressedKeys.delete(key);
      stopContinuousScroll('w');
    } else if (boundS && key === boundS && pressedKeys.has(key)) {
      // 处理S键释放（停止持续滚动）
      pressedKeys.delete(key);
      stopContinuousScroll('s');
    }
  }

  // 监听键盘事件
  document.addEventListener('keydown', function(event) {
    const key = event.key.toLowerCase();
    
    // 检查是否在输入框中
    const isInInput = event.target.tagName === 'INPUT' || 
                      event.target.tagName === 'TEXTAREA' ||
                      event.target.isContentEditable;
    
    if (isInInput) {
      return; // 在输入框中，不处理
    }
    
    // 获取绑定的键
    const boundW = getBoundKey('w');
    const boundS = getBoundKey('s');
    const boundA = getBoundKey('a');
    const boundD = getBoundKey('d');
    const boundZ = getBoundKey('z');
    
    // 处理 Z 键：点赞/取消点赞
    if (boundZ && key === boundZ) {
      event.preventDefault();
      event.stopPropagation();
      // 立即执行，不延迟（参考 avi12/youtube-like-dislike-shortcut）
      handleLike();
      return;
    }
    
    // 处理WASD键（只处理已绑定的键）
    if ((boundW && key === boundW) || 
        (boundA && key === boundA) || 
        (boundS && key === boundS) || 
        (boundD && key === boundD)) {
      event.preventDefault();
      event.stopPropagation();
      handleWASDKeyDown(event);
    }
    
    // 如果启用了箭头键功能，只处理长按右箭头键快进
    if (arrowKeysAsWASD && (event.key === 'ArrowRight' || key === 'arrowright')) {
      // 如果已经进入长按状态，阻止默认行为（避免连续点击快进）
      if (arrowRightLongPress) {
        event.preventDefault();
        event.stopPropagation();
      }
      // 处理长按逻辑
      handleWASDKeyDown(event);
    }
    
    // 如果启用了箭头键滚动功能，处理上/下箭头键滚动
    if (arrowKeysScroll && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      event.stopPropagation();
      const scrollKey = event.key === 'ArrowUp' ? 'w' : 's';
      if (!pressedKeys.has(event.key.toLowerCase())) {
        pressedKeys.add(event.key.toLowerCase());
        startContinuousScroll(scrollKey, event.key.toLowerCase());
      }
    }
  }, true);

  document.addEventListener('keyup', function(event) {
    const key = event.key.toLowerCase();
    
    // 检查是否在输入框中
    const isInInput = event.target.tagName === 'INPUT' || 
                      event.target.tagName === 'TEXTAREA' ||
                      event.target.isContentEditable;
    
    if (isInInput) {
      return; // 在输入框中，不处理
    }
    
    // 获取绑定的键
    const boundW = getBoundKey('w');
    const boundS = getBoundKey('s');
    const boundA = getBoundKey('a');
    const boundD = getBoundKey('d');
    
    // 处理WASD键（只处理已绑定的键）
    if ((boundW && key === boundW) || 
        (boundA && key === boundA) || 
        (boundS && key === boundS) || 
        (boundD && key === boundD)) {
      event.preventDefault();
      event.stopPropagation();
      handleWASDKeyUp(event);
    }
    
    // 如果启用了箭头键功能，只处理长按右箭头键快进
    if (arrowKeysAsWASD && (event.key === 'ArrowRight' || key === 'arrowright')) {
      // 如果正在长按状态，阻止默认行为
      if (arrowRightLongPress || spaceKeyPressed) {
        event.preventDefault();
        event.stopPropagation();
      }
      // 处理长按释放逻辑
      handleWASDKeyUp(event);
    }
    
    // 如果启用了箭头键滚动功能，处理上/下箭头键释放
    if (arrowKeysScroll && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      event.stopPropagation();
      const scrollKey = event.key === 'ArrowUp' ? 'w' : 's';
      if (pressedKeys.has(event.key.toLowerCase())) {
        pressedKeys.delete(event.key.toLowerCase());
        stopContinuousScroll(scrollKey);
      }
    }
  }, true);

  // 页面卸载时清理
  window.addEventListener('beforeunload', function() {
    if (dKeyTimer) {
      clearTimeout(dKeyTimer);
    }
    if (arrowRightTimer) {
      clearTimeout(arrowRightTimer);
    }
    if (wKeyAnimationFrame) {
      cancelAnimationFrame(wKeyAnimationFrame);
    }
    if (sKeyAnimationFrame) {
      cancelAnimationFrame(sKeyAnimationFrame);
    }
  });
})();

