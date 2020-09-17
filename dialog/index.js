const Tonic = require('@optoolco/tonic')

class Dialog extends Tonic {
  constructor () {
    super()

    this.classList.add('tonic--dialog')

    if (!document.querySelector('.tonic--dialog--overlay')) {
      const div = document.createElement('div')
      div.classList = 'tonic--dialog--overlay'
      div.textContent = ' '
      document.body.appendChild(div)
    }

    this.closeIcon = document.createElement('div')
    this.closeIcon.className = 'tonic--close'
    this.closeIcon.addEventListener('click', e => this.hide())

    const svgns = 'http://www.w3.org/2000/svg'
    const xlinkns = 'http://www.w3.org/1999/xlink'
    const svg = document.createElementNS(svgns, 'svg')
    const use = document.createElementNS(svgns, 'use')

    this.closeIcon.appendChild(svg)
    svg.appendChild(use)

    use.setAttributeNS(xlinkns, 'href', '#close')
    use.setAttributeNS(xlinkns, 'xlink:href', '#close')

    const iconColor = 'var(--tonic-primary, #333)'
    use.setAttribute('color', iconColor)
    use.setAttribute('fill', iconColor)
  }

  defaults () {
    return {
      width: '450px',
      height: 'auto',
      overlay: true,
      backgroundColor: 'rgba(0, 0, 0, 0.5)'
    }
  }

  getZIndex () {
    return Array.from(document.querySelectorAll('body *'))
      .map(elt => parseFloat(window.getComputedStyle(elt).zIndex))
      .reduce((z, highest = Number.MIN_SAFE_INTEGER) =>
        isNaN(z) || z < highest ? highest : z
      )
  }

  static stylesheet () {
    return `
      .tonic--dialog {
        box-shadow: 0px 4px 16px 3px rgba(0, 0, 0, 0.3);
        background: var(--tonic-window);
        border-radius: 6px;
        position: fixed;
        overflow: hidden;
        top: 50%;
        left: 50%;
        z-index: -1;
        opacity: 0;
        transition: z-index .3s;
        transform: translate(-50%, -50%) scale(1.22);
        will-change: transform;
      }

      .tonic--dialog.tonic--show {
        transform: translate(-50%, -50%) scale(1);
        opacity: 1;
        animation-duration: .3s;
        animation-name: tonic--dialog--show;
        animation-delay: 0s;
      }

      .tonic--dialog.tonic--hide {
        transform: translate(-50%, -50%) scale(1.22);
        opacity: 0;
        animation-duration: .1s;
        animation-name: tonic--dialog--hide;
        animation-delay: 0s;
      }

      @keyframes tonic--dialog--show {
        from {
          transform: translate(-50%, -50%) scale(1.22);
          opacity: 0;
        }

        to {
          opacity: 1;
          transform: translate(-50%, -50%) scale(1);
        }
      }

      @keyframes tonic--dialog--hide {
        from {
          transform: translate(-50%, -50%) scale(1);
          opacity: 1;
        }

        to {
          opacity: 0;
          transform: translate(-50%, -50%) scale(1.22);
        }
      }

      .tonic--dialog--overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        opacity: 0;
        z-index: -1;
        transition: all 0.3s;
        background: var(--tonic-overlay);
      }

      .tonic--dialog--overlay.tonic--show {
        opacity: 1;
      }

      .tonic--dialog > .tonic--close {
        width: 25px;
        height: 25px;
        position: absolute;
        top: 16px;
        right: 16px;
        cursor: pointer;
      }

      .tonic--dialog > .tonic--close svg {
        width: inherit;
        height: inherit;
      }
    `
  }

  updated () {
    window.requestAnimationFrame(() => {
      this.appendChild(this.closeIcon)
    })
  }

  show () {
    const z = this.getZIndex()

    const overlay = document.querySelector('.tonic--dialog--overlay')
    overlay.classList.add('tonic--show')
    this.style.zIndex = z + 100
    overlay.style.zIndex = z

    return new Promise(resolve => {
      this.style.width = this.props.width
      this.style.height = this.props.height
      this.addEventListener('animationend', resolve, { once: true })
      this.classList.remove('tonic--hide')
      this.classList.add('tonic--show')

      this._escapeHandler = e => {
        if (e.keyCode === 27) this.hide()
      }

      document.addEventListener('keyup', this._escapeHandler)
    })
  }

  hide () {
    const overlay = document.querySelector('.tonic--dialog--overlay')
    overlay.classList.remove('tonic--show')
    overlay.style.zIndex = -1
    const that = this

    return new Promise(resolve => {
      this.addEventListener('animationend', resolve, { once: true })
      this.classList.remove('tonic--show')
      this.classList.add('tonic--hide')
      this.style.zIndex = -1
      document.removeEventListener('keyup', that._escapeHandler)
    })
  }

  event (eventName) {
    const that = this

    return {
      then (resolve) {
        const listener = event => {
          const close = Tonic.match(event.target, '.tonic--dialog-close')
          const value = Tonic.match(event.target, '[value]')

          if (close || value) {
            that.removeEventListener(eventName, listener)
          }

          if (close) return resolve({})
          if (value) resolve({ [event.target.value]: true })
        }

        that.addEventListener(eventName, listener)
      }
    }
  }
}

module.exports = { Dialog }
