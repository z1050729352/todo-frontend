export function applyUaClasses() {
  const ua = navigator.userAgent || ''
  const isIOS = /iP(hone|od|ad)/.test(ua)
  const isAndroid = /Android/.test(ua)
  const isWeChat = /MicroMessenger/.test(ua)
  const isQQ = /\bQQ\//.test(ua)
  const isUC = /\bUCBrowser\//.test(ua)
  const isSafari = /Safari/.test(ua) && !/(Chrome|CriOS|EdgiOS|FxiOS|OPiOS)/.test(ua)
  const isChrome = /(Chrome|CriOS)/.test(ua) && !/(Edg|EdgiOS|OPR|OPiOS)/.test(ua)
  const root = document.documentElement

  root.classList.toggle('ua-ios', isIOS)
  root.classList.toggle('ua-android', isAndroid)
  root.classList.toggle('ua-wechat', isWeChat)
  root.classList.toggle('ua-qq', isQQ)
  root.classList.toggle('ua-uc', isUC)
  root.classList.toggle('ua-safari', isSafari)
  root.classList.toggle('ua-chrome', isChrome)
}

export function updateViewportVars() {
  const vv = window.visualViewport
  const height = vv?.height || window.innerHeight
  const width = vv?.width || window.innerWidth
  const root = document.documentElement
  root.style.setProperty('--app-vh', `${height * 0.01}px`)
  root.style.setProperty('--app-vw', `${width * 0.01}px`)
}

export function updateSafeAreaVars() {
  if (!document.body) return
  const probe = document.createElement('div')
  probe.style.position = 'fixed'
  probe.style.left = '0'
  probe.style.top = '0'
  probe.style.height = '0'
  probe.style.width = '0'
  probe.style.paddingTop = 'constant(safe-area-inset-top)'
  probe.style.paddingTop = 'env(safe-area-inset-top)'
  probe.style.paddingBottom = 'constant(safe-area-inset-bottom)'
  probe.style.paddingBottom = 'env(safe-area-inset-bottom)'
  probe.style.paddingLeft = 'constant(safe-area-inset-left)'
  probe.style.paddingLeft = 'env(safe-area-inset-left)'
  probe.style.paddingRight = 'constant(safe-area-inset-right)'
  probe.style.paddingRight = 'env(safe-area-inset-right)'

  document.body.appendChild(probe)
  const cs = getComputedStyle(probe)
  const safeTop = Number.parseFloat(cs.paddingTop) || 0
  const safeBottom = Number.parseFloat(cs.paddingBottom) || 0
  const safeLeft = Number.parseFloat(cs.paddingLeft) || 0
  const safeRight = Number.parseFloat(cs.paddingRight) || 0
  probe.remove()

  const root = document.documentElement
  root.style.setProperty('--safe-area-top', `${safeTop}px`)
  root.style.setProperty('--safe-area-bottom', `${safeBottom}px`)
  root.style.setProperty('--safe-area-left', `${safeLeft}px`)
  root.style.setProperty('--safe-area-right', `${safeRight}px`)
}

export function initDeviceAdaptation() {
  if (typeof window === 'undefined') return
  applyUaClasses()
  updateViewportVars()
  updateSafeAreaVars()
  if (!document.body) {
    requestAnimationFrame(() => {
      updateViewportVars()
      updateSafeAreaVars()
    })
  }

  const onResize = () => {
    updateViewportVars()
    updateSafeAreaVars()
  }

  window.addEventListener('resize', onResize, { passive: true })
  window.addEventListener('orientationchange', onResize, { passive: true })
  window.visualViewport?.addEventListener('resize', onResize, { passive: true })
  window.visualViewport?.addEventListener('scroll', onResize, { passive: true })
}
