(function() {
  'use strict';

  // 默认设置
  const DEFAULT_SETTINGS = {
    keys: {
      w: 'w',
      s: 's',
      a: 'a',
      d: 'd',
      z: 'z',
      q: 'q',
      e: 'e',
      r: 'r',
      f: 'f'
    },
    scrollSpeed: 20
  };

  // 当前设置
  let settings = { ...DEFAULT_SETTINGS };
  let scrollSpeed = DEFAULT_SETTINGS.scrollSpeed;
  let arrowKeysAsWASD = true; // 默认开启
  let arrowKeysScroll = true; // 默认开启
  let autoRefreshOnVideoLoad = true; // 默认开启

  // 跟踪鼠标位置
  let mouseX = 0;
  let mouseY = 0;
  document.addEventListener('mousemove', function(e) {
    mouseX = e.clientX;
    mouseY = e.clientY;
  });

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
        autoRefreshOnVideoLoad = settings.autoRefreshOnVideoLoad !== undefined ? settings.autoRefreshOnVideoLoad : true;
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
    // 对于ArrowRight，需要特殊处理key值
    let key = event.key.toLowerCase();
    if (event.key === 'ArrowRight') {
      key = 'arrowright';
    }
    
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
      // 确保状态干净：清除之前的定时器（如果有）
      if (arrowRightTimer) {
        clearTimeout(arrowRightTimer);
        arrowRightTimer = null;
      }
      // 重置状态
      arrowRightLongPress = false;
      pressedKeys.add('arrowright');
      let wasShortPress = true;
      
      // 延迟执行快进，如果在这期间释放了，就执行快进；如果一直按着，就进入加速模式
      arrowRightTimer = setTimeout(() => {
        // 200ms后检查：如果还在按着，进入加速模式
        // 注意：如果已经释放了，keyup会处理快进，这里不需要处理
        if (pressedKeys.has('arrowright')) {
          // 还在按着，进入加速模式
          wasShortPress = false;
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
        }
        // 如果已经释放了，不需要处理，keyup已经处理了
      }, 200); // 200ms延迟，和D键一致
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
    // 对于ArrowRight，需要特殊处理key值
    let key = event.key.toLowerCase();
    if (event.key === 'ArrowRight') {
      key = 'arrowright';
    }
    
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
      const hadTimer = arrowRightTimer !== null;
      if (arrowRightTimer) {
        clearTimeout(arrowRightTimer);
        arrowRightTimer = null;
      }
      
      // 重置状态
      arrowRightLongPress = false;
      
      // 如果正在模拟空格键，释放它
      if (wasLongPress && spaceKeyPressed) {
        spaceKeyPressed = false;
        const spaceUpEvent = createKeyboardEvent('keyup', ' ', 'Space', 32);
        const video = document.querySelector('video');
        if (video) {
          video.dispatchEvent(spaceUpEvent);
        } else {
          document.dispatchEvent(spaceUpEvent);
        }
      } else if (!wasLongPress && hadTimer) {
        // 短按：定时器被清除，说明是短按，立即执行快进
        const arrowRightDownEvent = createKeyboardEvent('keydown', 'ArrowRight', 'ArrowRight', 39);
        const arrowRightUpEvent = createKeyboardEvent('keyup', 'ArrowRight', 'ArrowRight', 39);
        const video = document.querySelector('video');
        
        // 优先直接调整播放进度，避免合成事件被拦截
        let handled = false;
        if (video && !isNaN(video.currentTime)) {
          video.currentTime = Math.min(
            video.duration || Number.MAX_SAFE_INTEGER,
            video.currentTime + 5
          );
          handled = true;
        }

        if (!handled) {
          // 回退：派发键盘事件，让 YouTube 默认逻辑处理
          document.dispatchEvent(arrowRightDownEvent);
          setTimeout(() => {
            document.dispatchEvent(arrowRightUpEvent);
          }, 30);

          if (video) {
            video.dispatchEvent(arrowRightDownEvent);
            setTimeout(() => {
              video.dispatchEvent(arrowRightUpEvent);
            }, 30);
          }
        }
      }
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
    const boundQ = getBoundKey('q');
    const boundE = getBoundKey('e');
    const boundR = getBoundKey('r');
    const boundF = getBoundKey('f');
    
    // 处理 R 键：刷新页面
    if (boundR && key === boundR) {
      event.preventDefault();
      event.stopPropagation();
      window.location.reload();
      return;
    }
    
    // 处理 F 键：模拟点击鼠标位置下的元素
    if (boundF && key === boundF) {
      event.preventDefault();
      event.stopPropagation();
      
      // 获取鼠标位置下的元素
      const elementAtCursor = document.elementFromPoint(mouseX, mouseY);
      
      if (elementAtCursor) {
        // 尝试找到可点击的父元素（链接、视频缩略图等）
        let clickableElement = elementAtCursor;
        let attempts = 0;
        const maxAttempts = 10;
        
        while (clickableElement && attempts < maxAttempts) {
          // 检查是否是链接
          if (clickableElement.tagName === 'A' && clickableElement.href) {
            clickableElement.click();
            return;
          }
          
          // 检查是否是视频缩略图
          if (clickableElement.tagName === 'YTD-THUMBNAIL' || 
              clickableElement.closest('ytd-thumbnail')) {
            const thumbnail = clickableElement.tagName === 'YTD-THUMBNAIL' 
              ? clickableElement 
              : clickableElement.closest('ytd-thumbnail');
            if (thumbnail) {
              const link = thumbnail.querySelector('a');
              if (link) {
                link.click();
                return;
              }
              thumbnail.click();
              return;
            }
          }
          
          // 检查是否有链接父元素
          const parentLink = clickableElement.closest('a');
          if (parentLink && parentLink.href) {
            parentLink.click();
            return;
          }
          
          clickableElement = clickableElement.parentElement;
          attempts++;
        }
        
        // 如果没找到特定的可点击元素，直接点击鼠标位置下的元素
        if (elementAtCursor) {
          elementAtCursor.click();
        }
      }
      return;
    }
    
    // 处理 Q 键：返回上一页
    if (boundQ && key === boundQ) {
      event.preventDefault();
      event.stopPropagation();
      window.history.back();
      return;
    }
    
    // 处理 E 键：返回下一页
    if (boundE && key === boundE) {
      event.preventDefault();
      event.stopPropagation();
      window.history.forward();
      return;
    }
    
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
    
    // 如果启用了箭头键功能，处理右箭头键
    if (arrowKeysAsWASD && (event.key === 'ArrowRight' || key === 'arrowright')) {
      // 立即阻止默认行为，避免先触发快进
      event.preventDefault();
      event.stopPropagation();
      // 处理长按逻辑（不return，让handleWASDKeyDown处理）
      handleWASDKeyDown(event);
      return; // 处理完后返回，避免重复处理
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
    
    // 如果启用了箭头键功能，处理右箭头键释放
    if (arrowKeysAsWASD && (event.key === 'ArrowRight' || key === 'arrowright')) {
      // 立即阻止默认行为
      event.preventDefault();
      event.stopPropagation();
      // 处理长按释放逻辑
      handleWASDKeyUp(event);
      return; // 处理完后返回，避免重复处理
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

  // 自动刷新功能：解决 YouTube 倍速 bug
  // 在视频加载完成后自动刷新一次，确保倍速功能正常工作
  (function autoRefreshOnVideoLoad() {
    let lastVideoId = null;
    let refreshTimeout = null;
    let urlCheckInterval = null;

    // 从 URL 中提取视频 ID
    function getVideoId() {
      const urlParams = new URLSearchParams(window.location.search);
      return urlParams.get('v');
    }

    // 获取基于视频ID的刷新标记key
    function getRefreshKey(videoId) {
      return `yt-shortcuts-auto-refreshed-${videoId}`;
    }

    // 检查并刷新
    function checkAndRefresh() {
      // 检查设置是否启用
      if (!autoRefreshOnVideoLoad) {
        return;
      }

      const currentVideoId = getVideoId();
      
      // 如果没有视频 ID（不在视频页面），不处理
      if (!currentVideoId) {
        return;
      }

      // 使用基于视频ID的key
      const refreshKey = getRefreshKey(currentVideoId);

      // 如果视频 ID 变化了，更新 lastVideoId
      if (currentVideoId !== lastVideoId) {
        lastVideoId = currentVideoId;
      }

      // 如果已经刷新过这个视频，不处理
      if (sessionStorage.getItem(refreshKey)) {
        return;
      }

      // 使用多种方法检测视频是否已加载
      const video = document.querySelector('video');
      if (video) {
        // 方法1：检查视频是否已加载元数据
        if (video.readyState >= 2) { // HAVE_CURRENT_DATA
          // 再等待一下，确保视频完全初始化
          if (refreshTimeout) {
            clearTimeout(refreshTimeout);
          }
          refreshTimeout = setTimeout(() => {
            // 再次检查视频是否还在（防止页面已经变化）
            const currentVideo = document.querySelector('video');
            const currentId = getVideoId();
            if (currentVideo && currentId === currentVideoId) {
              // 标记已刷新，避免重复刷新
              sessionStorage.setItem(refreshKey, 'true');
              window.location.reload();
            }
          }, 800); // 增加到800ms，给更多时间初始化
          return;
        }
        
        // 方法2：监听多个视频事件
        const onVideoReady = () => {
          if (refreshTimeout) {
            clearTimeout(refreshTimeout);
          }
          refreshTimeout = setTimeout(() => {
            const currentVideo = document.querySelector('video');
            const currentId = getVideoId();
            if (currentVideo && currentId === currentVideoId) {
              sessionStorage.setItem(refreshKey, 'true');
              window.location.reload();
            }
          }, 800);
        };
        
        // 监听多个事件以确保捕获
        video.addEventListener('loadedmetadata', onVideoReady, { once: true });
        video.addEventListener('loadeddata', onVideoReady, { once: true });
        video.addEventListener('canplay', onVideoReady, { once: true });
        
        // 方法3：如果视频已经有src，也认为已加载
        if (video.src || video.currentSrc) {
          setTimeout(() => {
            if (video.readyState >= 1) { // HAVE_METADATA
              onVideoReady();
            }
          }, 500);
        }
      } else {
        // 如果还没有 video 元素，使用MutationObserver监听DOM变化
        const observer = new MutationObserver((mutations, obs) => {
          const video = document.querySelector('video');
          if (video) {
            obs.disconnect();
            setTimeout(checkAndRefresh, 300);
          }
        });
        
        observer.observe(document.body, {
          childList: true,
          subtree: true
        });
        
        // 如果5秒后还没找到视频，停止观察
        setTimeout(() => {
          observer.disconnect();
        }, 5000);
      }
    }

    // 初始化检查
    function initAutoRefresh() {
      // 重新加载设置
      chrome.storage.sync.get(['shortcutSettings'], (result) => {
        if (result.shortcutSettings) {
          autoRefreshOnVideoLoad = result.shortcutSettings.autoRefreshOnVideoLoad !== undefined 
            ? result.shortcutSettings.autoRefreshOnVideoLoad 
            : true;
        }
        
        if (autoRefreshOnVideoLoad) {
          lastVideoId = getVideoId();
          if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', checkAndRefresh);
          } else {
            setTimeout(checkAndRefresh, 1000);
          }

          // 监听 URL 变化（YouTube SPA 导航）
          let lastUrl = window.location.href;
          if (urlCheckInterval) {
            clearInterval(urlCheckInterval);
          }
          urlCheckInterval = setInterval(() => {
            const currentUrl = window.location.href;
            if (currentUrl !== lastUrl) {
              lastUrl = currentUrl;
              // URL 变化了，延迟一点再检查（给 YouTube 时间加载新内容）
              setTimeout(checkAndRefresh, 500);
            }
          }, 200);

          // 监听 popstate 事件（浏览器前进/后退）
          window.addEventListener('popstate', () => {
            setTimeout(checkAndRefresh, 500);
          });
        } else {
          // 如果禁用了，清理定时器
          if (urlCheckInterval) {
            clearInterval(urlCheckInterval);
            urlCheckInterval = null;
          }
        }
      });
    }

    // 初始启动
    initAutoRefresh();

    // 监听设置变化
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.type === 'settingsUpdated') {
        initAutoRefresh();
      }
    });

    // 清理定时器
    window.addEventListener('beforeunload', () => {
      if (refreshTimeout) {
        clearTimeout(refreshTimeout);
      }
      if (urlCheckInterval) {
        clearInterval(urlCheckInterval);
      }
    });
  })();
})();

