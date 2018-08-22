class ContentRoute extends Tonic { /* global Tonic */
  constructor (node) {
    super(node)

    const that = this

    if (ContentRoute.patched) return
    ContentRoute.patched = true

    const createEvent = function (type) {
      const orig = window.history[type]
      return function (...args) {
        that.reset()
        var value = orig.call(this, ...args)
        window.dispatchEvent(new window.Event(type.toLowerCase()))
        const nodes = document.getElementsByTagName('content-route')
        for (const node of nodes) node.reRender()
        return value
      }
    }

    window.addEventListener('popstate', e => this.reRender(p => p))

    window.history.pushState = createEvent('pushState')
    window.history.replaceState = createEvent('replaceState')
  }

  reset () {
    ContentRoute.matches = false
    const contentTags = document.getElementsByTagName('content-route')
    Array.from(contentTags).forEach(tag => tag.classList.remove('show'))
  }

  willConnect () {
    this.template = document.createElement('template')
    this.template.innerHTML = this.root.innerHTML
  }

  updated () {
    if (!this.root.classList.contains('show')) return
    const event = new window.Event('show')
    this.root.dispatchEvent(event)
  }

  render () {
    const none = this.root.hasAttribute('none')

    if (none) {
      if (ContentRoute.matches) return
      this.root.classList.add('show')
      return this.template.content
    }

    const path = this.root.getAttribute('path')
    const keys = []
    const matcher = ContentRoute.matcher(path, keys)
    const match = matcher.exec(window.location.pathname)

    if (match) {
      ContentRoute.matches = true

      match.slice(1).forEach((m, i) => {
        this.props[keys[i].name] = m
      })

      this.root.classList.add('show')
      return this.template.content
    }

    return ''
  }
}

ContentRoute.matches = false
ContentRoute.matcher = (() => {
  //
  // Most of this was lifted from the path-to-regex project which can
  // be found here -> https://github.com/pillarjs/path-to-regexp
  //
  const DEFAULT_DELIMITER = '/'
  const DEFAULT_DELIMITERS = './'

  const PATH_REGEXP = new RegExp([
    '(\\\\.)',
    '(?:\\:(\\w+)(?:\\(((?:\\\\.|[^\\\\()])+)\\))?|\\(((?:\\\\.|[^\\\\()])+)\\))([+*?])?'
  ].join('|'), 'g')

  function parse (str, options) {
    let tokens = []
    let key = 0
    let index = 0
    let path = ''
    let defaultDelimiter = (options && options.delimiter) || DEFAULT_DELIMITER
    let delimiters = (options && options.delimiters) || DEFAULT_DELIMITERS
    let pathEscaped = false
    let res

    while ((res = PATH_REGEXP.exec(str)) !== null) {
      let m = res[0]
      let escaped = res[1]
      let offset = res.index
      path += str.slice(index, offset)
      index = offset + m.length

      // Ignore already escaped sequences.
      if (escaped) {
        path += escaped[1]
        pathEscaped = true
        continue
      }

      let prev = ''
      let next = str[index]
      let name = res[2]
      let capture = res[3]
      let group = res[4]
      let modifier = res[5]

      if (!pathEscaped && path.length) {
        let k = path.length - 1

        if (delimiters.indexOf(path[k]) > -1) {
          prev = path[k]
          path = path.slice(0, k)
        }
      }

      if (path) {
        tokens.push(path)
        path = ''
        pathEscaped = false
      }

      let partial = prev !== '' && next !== undefined && next !== prev
      let repeat = modifier === '+' || modifier === '*'
      let optional = modifier === '?' || modifier === '*'
      let delimiter = prev || defaultDelimiter
      let pattern = capture || group

      tokens.push({
        name: name || key++,
        prefix: prev,
        delimiter: delimiter,
        optional: optional,
        repeat: repeat,
        partial: partial,
        pattern: pattern ? escapeGroup(pattern) : '[^' + escapeString(delimiter) + ']+?'
      })
    }

    if (path || index < str.length) {
      tokens.push(path + str.substr(index))
    }

    return tokens
  }

  function escapeString (str) {
    return str.replace(/([.+*?=^!:${}()[\]|/\\])/g, '\\$1')
  }

  function escapeGroup (group) {
    return group.replace(/([=!:$/()])/g, '\\$1')
  }

  function flags (options) {
    return options && options.sensitive ? '' : 'i'
  }

  function regexpToRegexp (path, keys) {
    if (!keys) return path

    const groups = path.source.match(/\((?!\?)/g)

    if (groups) {
      for (let i = 0; i < groups.length; i++) {
        keys.push({
          name: i,
          prefix: null,
          delimiter: null,
          optional: false,
          repeat: false,
          partial: false,
          pattern: null
        })
      }
    }

    return path
  }

  function arrayToRegexp (path, keys, options) {
    let parts = []

    for (let i = 0; i < path.length; i++) {
      parts.push(pathToRegexp(path[i], keys, options).source)
    }

    return new RegExp('(?:' + parts.join('|') + ')', flags(options))
  }

  function stringToRegexp (path, keys, options) {
    return tokensToRegExp(parse(path, options), keys, options)
  }

  function tokensToRegExp (tokens, keys, options) {
    options = options || {}

    let strict = options.strict
    let end = options.end !== false
    let delimiter = escapeString(options.delimiter || DEFAULT_DELIMITER)
    let delimiters = options.delimiters || DEFAULT_DELIMITERS
    let endsWith = [].concat(options.endsWith || []).map(escapeString).concat('$').join('|')
    let route = ''
    let isEndDelimited = tokens.length === 0

    for (let i = 0; i < tokens.length; i++) {
      let token = tokens[i]

      if (typeof token === 'string') {
        route += escapeString(token)
        isEndDelimited = i === tokens.length - 1 && delimiters.indexOf(token[token.length - 1]) > -1
      } else {
        let prefix = escapeString(token.prefix)
        let capture = token.repeat
          ? '(?:' + token.pattern + ')(?:' + prefix + '(?:' + token.pattern + '))*'
          : token.pattern

        if (keys) keys.push(token)

        if (token.optional) {
          if (token.partial) {
            route += prefix + '(' + capture + ')?'
          } else {
            route += '(?:' + prefix + '(' + capture + '))?'
          }
        } else {
          route += prefix + '(' + capture + ')'
        }
      }
    }

    if (end) {
      if (!strict) route += '(?:' + delimiter + ')?'

      route += endsWith === '$' ? '$' : '(?=' + endsWith + ')'
    } else {
      if (!strict) route += '(?:' + delimiter + '(?=' + endsWith + '))?'
      if (!isEndDelimited) route += '(?=' + delimiter + '|' + endsWith + ')'
    }

    return new RegExp('^' + route, flags(options))
  }

  function pathToRegexp (path, keys, options) {
    if (path instanceof RegExp) {
      return regexpToRegexp(path, keys)
    }

    if (Array.isArray(path)) {
      return arrayToRegexp(/** @type {!Array} */ (path), keys, options)
    }

    return stringToRegexp(/** @type {string} */ (path), keys, options)
  }

  return pathToRegexp
})()

Tonic.add(ContentRoute)

class ContentTabs extends Tonic { /* global Tonic */
  defaults () {
    return {}
  }

  style () {
    return {
      'content-tabs': {
        display: 'block'
      },

      '[data-tab-name]:not([data-tab-group])': {
        userSelect: 'none',
        fontFamily: 'var(--subheader)',
        fontSize: '14px',
        borderBottom: '1px solid transparent',
        marginRight: '8px'
      },

      '.tonic--selected': {
        color: 'var(--accent)',
        borderBottom: '1px solid var(--accent)'
      },

      '[data-tab-group]': {
        marginTop: '15px',
        display: 'none',
        borderTop: '1px solid var(--border)',
        paddingTop: '15px'
      },

      '.tonic--show': {
        display: 'block'
      }
    }
  }

  qs (s, p) {
    return (p || document).querySelector(s)
  }

  getCurrentContentNode (group) {
    return this.qs(`[data-tab-group="${group}"].tonic--show`)
  }

  click (e) {
    e.preventDefault()
    if (!Tonic.match(e.target, '[data-tab-name]:not([data-tab-group])')) return

    const group = this.props.group
    const currentContentNode = this.getCurrentContentNode(group)
    if (currentContentNode) currentContentNode.classList.remove('tonic--show')

    const name = e.target.dataset.tabName
    const target = this.qs(`[data-tab-group="${group}"][data-tab-name="${name}"]`)

    if (!target) {
      console.warn(`Not found '[data-tab-group="${group}"][data-tab-name="${name}"]'`)
      return
    }

    const currentContentLink = this.qs(`[data-tab-name].tonic--selected`)
    if (currentContentLink) currentContentLink.classList.remove('tonic--selected')

    target.classList.add('tonic--show')
    e.target.classList.add('tonic--selected')
  }

  connected () {
    let name = this.root.getAttribute('selected')

    if (name) {
      const targetLink = this.qs(`[data-tab-name=${name}]`, this.root)
      targetLink.classList.add('tonic--selected')
    } else {
      const currentLink = this.qs(`[data-tab-name].tonic--selected`, this.root)
      if (!currentLink) {
        console.warn(`Not found '[data.tab-name].tonic--selected'`)
        return
      }
      name = currentLink.dataset.tabName
    }

    const group = this.props.group
    if (!group) return

    const currentContentNode = this.getCurrentContentNode(group)
    if (currentContentNode) currentContentNode.classList.remove('tonic--show')

    const target = this.qs(`[data-tab-group="${group}"][data-tab-name="${name}"]`)
    if (!target) return

    target.classList.add('tonic--show')
  }

  render () {
    let {
      theme
    } = this.props

    if (theme) this.root.classList.add(`tonic--theme--${theme}`)

    return this.root.innerHTML
  }
}

Tonic.add(ContentTabs)

class ContentTooltip extends Tonic { /* global Tonic */
  constructor (node) {
    super(node)
    const target = node.getAttribute('for')
    const el = document.getElementById(target)
    let timer = null

    const leave = e => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        this.hide()
      }, 256)
    }

    el.addEventListener('mouseenter', e => this.show(el))
    node.addEventListener('mouseenter', e => clearTimeout(timer))
    node.addEventListener('mouseleave', leave)
    el.addEventListener('mouseleave', leave)
  }

  defaults (props) {
    return {
      width: 'auto',
      height: 'auto'
    }
  }

  style () {
    return {
      '.tonic--tooltip': {
        position: 'absolute',
        top: '30px',
        background: 'var(--window)',
        border: '1px solid var(--border)',
        borderRadius: '2px',
        transition: 'visibility 0.2s ease-in-out, opacity 0.2s ease-in-out, z-index 0.2s ease-in-out, box-shadow 0.2s ease-in-out',
        visibility: 'hidden',
        zIndex: '-1',
        opacity: '0'
      },
      '.tonic--tooltip.tonic--show': {
        boxShadow: '0px 30px 90px -20px rgba(0, 0, 0, 0.3)',
        visibility: 'visible',
        opacity: '1',
        zIndex: '1'
      },
      '.tonic--tooltip-arrow': {
        width: '12px',
        height: '12px',
        position: 'absolute',
        zIndex: '-1',
        backgroundColor: 'var(--window)',
        border: '1px solid transparent',
        borderRadius: '2px',
        pointerEvents: 'none',
        '-webkit-transform': 'rotate(45deg)',
        '-ms-transform': 'rotate(45deg)',
        transform: 'rotate(45deg)',
        left: '50%'
      },
      '.tonic--top .tonic--tooltip-arrow': {
        marginBottom: '-6px',
        bottom: '100%',
        borderTopColor: 'var(--border)',
        borderLeftColor: 'var(--border)'
      },
      '.tonic--bottom .tonic--tooltip-arrow': {
        marginTop: '-6px',
        position: 'absolute',
        top: '100%',
        borderBottomColor: 'var(--border)',
        borderRightColor: 'var(--border)'
      }
    }
  }

  show (relativeNode) {
    clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      const tooltip = this.root.querySelector('.tonic--tooltip')
      const arrow = this.root.querySelector('.tonic--tooltip-arrow')
      let scrollableArea = relativeNode.parentNode

      while (true) {
        if (!scrollableArea || scrollableArea.tagName === 'BODY') break
        if (window.getComputedStyle(scrollableArea).overflow === 'scroll') break
        scrollableArea = scrollableArea.parentNode
      }

      let { top, left } = relativeNode.getBoundingClientRect()
      let pos = top + scrollableArea.scrollTop

      left -= scrollableArea.offsetLeft + (tooltip.offsetWidth / 2)
      left += relativeNode.offsetWidth / 2

      const offset = relativeNode.offsetHeight + (arrow.offsetHeight / 2)

      if (top < (window.innerHeight / 2)) {
        tooltip.classList.remove('tonic--bottom')
        tooltip.classList.add('tonic--top')
        pos += offset
      } else {
        tooltip.classList.remove('tonic--top')
        tooltip.classList.add('tonic--bottom')
        pos -= offset + tooltip.offsetHeight
      }

      tooltip.style.top = `${pos}px`
      tooltip.style.left = `${left}px`

      window.requestAnimationFrame(() => {
        tooltip.classList.add('tonic--show')
      })
    }, 256)
  }

  hide () {
    clearTimeout(this.timer)
    const tooltip = this.root.querySelector('.tonic--tooltip')
    tooltip.classList.remove('tonic--show')
  }

  render () {
    const {
      theme,
      width,
      height
    } = this.props

    if (theme) this.root.classList.add(`tonic--theme--${theme}`)

    const style = []
    if (width) style.push(`width: ${width};`)
    if (height) style.push(`height: ${height};`)

    return `
      <div
        style="${style.join('')}"
        class="tonic--tooltip">
          ${this.children.trim()}
        <span class="tonic--tooltip-arrow"></span>
      </div>
    `
  }
}

Tonic.add(ContentTooltip)

class Dialog extends Tonic { /* global Tonic */
  constructor (node) {
    super(node)

    this.root.show = () => this.show()
    this.root.hide = () => this.hide()
    this.root.event = name => this.event(name)

    this.root.addEventListener('click', e => {
      const el = Tonic.match(e.target, '.tonic--close')
      if (el) this.hide()

      const overlay = e.target.matches('.tonic--overlay')
      if (overlay) this.hide()
    })
  }

  getPropertyValue (s) {
    const computed = window.getComputedStyle(this.root)
    return computed.getPropertyValue(`--${s}`).trim()
  }

  defaults () {
    return {
      width: '450px',
      height: 'auto',
      overlay: true,
      closeIcon: Dialog.svg.closeIcon(this.getPropertyValue('primary')),
      backgroundColor: 'rgba(0,0,0,0.5)'
    }
  }

  style () {
    return {
      '.tonic--dialog *': {
        boxSizing: 'border-box'
      },
      '.tonic--wrapper': {
        position: 'fixed',
        top: '0',
        left: '0',
        right: '0',
        bottom: '0',
        display: 'flex',
        zIndex: '100',
        visibility: 'hidden',
        transition: 'visibility 0s ease 0.5s'
      },
      '.tonic--show': {
        visibility: 'visible',
        transition: 'visibility 0s ease 0s'
      },
      '.tonic--show .tonic--overlay': {
        opacity: '1'
      },
      '.tonic--show .tonic--dialog--content': {
        opacity: '1',
        '-webkit-transform': 'scale(1)',
        '-ms-transform': 'scale(1)',
        transform: 'scale(1)'
      },
      '.tonic--overlay': {
        position: 'absolute',
        top: '0',
        left: '0',
        right: '0',
        bottom: '0',
        opacity: '0',
        transition: 'opacity 0.3s ease-in-out'
      },
      '.tonic--dialog--content': {
        minWidth: '350px',
        minHeight: '250px',
        height: 'auto',
        width: 'auto',
        paddingTop: '70px',
        paddingBottom: '75px',
        margin: 'auto',
        position: 'relative',
        backgroundColor: 'var(--window)',
        boxShadow: '0px 30px 90px -20px rgba(0,0,0,0.3), 0 0 1px #a2a9b1',
        borderRadius: '4px',
        '-webkit-transform': 'scale(0.8)',
        '-ms-transform': 'scale(0.8)',
        transform: 'scale(0.8)',
        transition: 'all 0.3s ease-in-out',
        zIndex: '1',
        opacity: '0'
      },
      '.tonic--close': {
        width: '25px',
        height: '25px',
        position: 'absolute',
        top: '25px',
        right: '25px',
        cursor: 'pointer'
      }
    }
  }

  show (fn) {
    const node = this.root.firstElementChild
    node.classList.add('tonic--show')
    fn && node.addEventListener('transitionend', fn, { once: true })

    this._escapeHandler = e => {
      if (e.keyCode === 27) this.hide()
    }

    document.addEventListener('keyup', this._escapeHandler)
  }

  hide (fn) {
    const node = this.root.firstElementChild
    node.classList.remove('tonic--show')
    fn && node.addEventListener('transitionend', fn, { once: true })
    document.removeEventListener('keyup', this._escapeHandler)
  }

  event (eventName) {
    const that = this

    return {
      then (resolve) {
        const listener = event => {
          const close = Tonic.match(event.target, '.tonic--close')
          const value = Tonic.match(event.target, '[value]')

          if (close || value) {
            that.root.removeEventListener(eventName, listener)
          }

          if (close) return resolve({})
          if (value) resolve({ [event.target.value]: true })
        }

        that.root.addEventListener(eventName, listener)
      }
    }
  }

  wrap (render) {
    const {
      width,
      height,
      overlay,
      theme,
      color,
      backgroundColor
    } = this.props

    this.root.classList.add('tonic--dialog')

    const template = document.createElement('template')
    const wrapper = document.createElement('div')

    const isOpen = !!this.root.querySelector('.tonic--wrapper.tonic--show')
    wrapper.className = isOpen ? 'tonic--wrapper tonic--show' : 'tonic--wrapper'

    const content = render()

    typeof content === 'string'
      ? (template.innerHTML = content)
      : [...content.children].forEach(el => template.appendChild(el))

    if (theme) this.root.classList.add(`tonic--theme--${theme}`)

    const style = []
    if (width) style.push(`width: ${width};`)
    if (height) style.push(`height: ${height};`)

    if (overlay !== 'false') {
      const overlayElement = document.createElement('div')
      overlayElement.className = 'tonic--overlay'
      overlayElement.setAttribute('style', `background-color: ${backgroundColor}`)
      wrapper.appendChild(overlayElement)
    }

    const dialog = document.createElement('div')
    dialog.className = 'tonic--dialog--content'
    dialog.setAttribute('style', style.join(''))

    const close = document.createElement('div')
    close.className = 'tonic--close'

    const iconColor = color || this.getPropertyValue('primary')
    const url = Dialog.svg.closeIcon(iconColor)
    close.style.backgroundImage = `url("${url}")`

    wrapper.appendChild(dialog)
    dialog.appendChild(template.content)
    dialog.appendChild(close)
    return wrapper
  }
}

Dialog.svg = {}
Dialog.svg.toURL = s => `data:image/svg+xml;base64,${window.btoa(s)}`
Dialog.svg.closeIcon = color => Dialog.svg.toURL(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <path fill="${color}" d="M80.7,22.6l-3.5-3.5c-0.1-0.1-0.3-0.1-0.4,0L50,45.9L23.2,19.1c-0.1-0.1-0.3-0.1-0.4,0l-3.5,3.5c-0.1,0.1-0.1,0.3,0,0.4l26.8,26.8L19.3,76.6c-0.1,0.1-0.1,0.3,0,0.4l3.5,3.5c0,0,0.1,0.1,0.2,0.1s0.1,0,0.2-0.1L50,53.6l25.9,25.9c0.1,0.1,0.3,0.1,0.4,0l3.5-3.5c0.1-0.1,0.1-0.3,0-0.4L53.9,49.8l26.8-26.8C80.8,22.8,80.8,22.7,80.7,22.6z"/>
  </svg>
`)

Tonic.Dialog = Dialog

class IconContainer extends Tonic { /* global Tonic */
  defaults () {
    return {
      size: '25px',
      color: 'var(--primary)',
      src: './sprite.svg#example'
    }
  }

  style () {
    return {
      'svg': {
        width: '100%',
        height: '100%'
      }
    }
  }

  render () {
    let {
      color,
      size,
      theme,
      src
    } = this.props

    if (theme) this.root.classList.add(`tonic--theme--${theme}`)

    if (color === 'undefined' || color === 'color') {
      color = this.defaults.color
    }

    const style = `fill: ${color}; color: ${color};`

    return `
      <div class="tonic--wrapper" style="width: ${size}; height: ${size};">
        <svg>
          <use xlink:href="${src}" style="${style}">
        </svg>
      </div>
    `
  }
}

Tonic.add(IconContainer)

class InputButton extends Tonic { /* global Tonic */
  constructor (node) {
    super(node)
    this.root.loading = (state) => this.loading(state)

    const that = this
    Object.defineProperty(this.root, 'value', {
      get () { return that.props.value }
    })
  }

  defaults () {
    return {
      value: 'Submit',
      disabled: false,
      autofocus: false,
      height: '40px',
      width: '150px',
      radius: '2px',
      textColor: 'var(--primary)',
      backgroundColor: 'transparent',
      borderColor: 'var(--primary)'
    }
  }

  style () {
    // if (this.props.width === 100%) {
    // TODO display block (on component)
    // }

    return {
      '': {
        display: 'inline-block'
      },
      '.tonic--wrapper': {
        margin: '5px'
      },
      'button': {
        color: this.props.textColor,
        width: this.props.width,
        height: this.props.height,
        minHeight: '40px',
        font: '12px var(--subheader)',
        fontWeight: '400',
        textTransform: 'uppercase',
        letterSpacing: '1px',
        padding: '8px 8px 5px 8px',
        position: 'relative',
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: this.props.borderColor,
        borderRadius: this.props.radius,
        backgroundColor: this.props.backgroundColor,
        outline: 'none',
        transition: 'all 0.3s ease',
        appearance: 'none'
      },
      'button:before': {
        content: '""',
        width: '14px',
        height: '14px',
        opacity: '0'
      },
      'button[disabled], button.tonic--active': {
        color: 'var(--medium)',
        backgroundColor: 'var(--background)',
        borderColor: 'var(--background)'
      },
      'button:not([disabled]):hover, button:not(.tonic--loading):hover': {
        color: 'var(--window)',
        backgroundColor: 'var(--primary) !important',
        borderColor: 'var(--primary) !important',
        cursor: 'pointer'
      },
      'button.tonic--loading': {
        color: 'transparent',
        background: 'var(--medium)',
        borderColor: 'var(--medium)',
        pointerEvents: 'none',
        transition: 'all 0.3s ease'
      },
      'button.tonic--loading:hover': {
        color: 'transparent',
        background: 'var(--medium) !important',
        borderColor: 'var(--medium) !important'
      },
      'button.tonic--loading:before': {
        marginTop: '-8px',
        marginLeft: '-8px',
        display: 'inline-block',
        position: 'absolute',
        top: '50%',
        left: '50%',
        opacity: '1',
        '-webkit-transform': 'translateX(-50%) translateY(-50%)',
        '-ms-transform': 'translateX(-50%) translateY(-50%)',
        transform: 'translateX(-50%) translateY(-50%)',
        border: '2px solid white',
        borderRadius: '50%',
        borderTopColor: 'transparent',
        animation: 'spin 1s linear 0s infinite',
        transition: 'opacity 0.3s ease'
      }
    }
  }

  loading (state) {
    window.requestAnimationFrame(() => {
      const button = this.root.querySelector('button')
      const method = state ? 'add' : 'remove'
      if (button) button.classList[method]('tonic--loading')
    })
  }

  click () {
    if (!this.props.async) return
    this.loading(true)
  }

  render () {
    const {
      id,
      name,
      value,
      type,
      disabled,
      autofocus,
      active,
      theme
    } = this.props

    if (theme) this.root.classList.add(`tonic--theme--${theme}`)

    const idAttr = id ? `id="${id}"` : ''
    const nameAttr = name ? `name="${name}"` : ''
    const valueAttr = value ? `value="${value}"` : ''
    const typeAttr = type ? `type="${type}"` : ''

    let classes = []
    if (active) classes.push(`tonic--active`)
    classes = classes.join(' ')

    const label = this.root.textContent || value

    return `
      <div class="tonic--wrapper">
        <button
          ${idAttr}
          ${nameAttr}
          ${valueAttr}
          ${typeAttr}
          ${disabled ? 'disabled' : ''}
          ${autofocus ? 'autofocus' : ''}
          class="${classes}">
          ${label}
        </button>
      </div>
    `
  }
}

Tonic.add(InputButton)

class InputCheckbox extends Tonic { /* global Tonic */
  constructor (node) {
    super(node)

    const that = this
    Object.defineProperty(this.root, 'value', {
      get () { return that.value }
    })
  }

  get value () {
    return this.props.checked
  }

  getPropertyValue (s) {
    const computed = window.getComputedStyle(this.root)
    return computed.getPropertyValue(`--${s}`).trim()
  }

  defaults () {
    return {
      disabled: false,
      checked: false,
      size: '18px'
    }
  }

  style () {
    const {
      color,
      iconOn,
      checked,
      iconOff
    } = this.props

    if (!color) this.props.color = this.getPropertyValue('primary')
    if (!iconOn) this.props.iconOn = InputCheckbox.svg.iconOn(this.props.color)
    if (!iconOff) this.props.iconOff = InputCheckbox.svg.iconOff(this.props.color)

    let url = this.props[checked ? 'iconOn' : 'iconOff']

    return {
      '.tonic--wrapper': {
        display: 'inline-block',
        '-webkit-user-select': 'none',
        '-moz-user-select': 'none',
        userSelect: 'none'
      },
      'input[type="checkbox"]': {
        display: 'none'
      },
      'input[type="checkbox"][disabled] + label': {
        opacity: '0.35'
      },
      'label': {
        display: 'inline-block',
        verticalAlign: 'middle'
      },
      'label:nth-of-type(1)': {
        width: this.props.size,
        height: this.props.size,
        backgroundImage: `url('${url}')`
      },
      'label:nth-of-type(2)': {
        color: 'var(--primary)',
        font: '12px var(--subheader)',
        fontWeight: '500',
        textTransform: 'uppercase',
        letterSpacing: '1px',
        paddingTop: '2px',
        marginLeft: '10px'
      }
    }
  }

  change (e) {
    const state = this.props.checked = !this.props.checked
    const color = this.props.color || this.getPropertyValue('primary')
    const url = InputCheckbox.svg[state ? 'iconOn' : 'iconOff'](color)
    this.root.querySelector('label.tonic--icon').style.backgroundImage = `url("${url}")`
  }

  connected () {
    this.label = this.root.querySelector('label')
  }

  updated (oldProps) {
    if (oldProps.checked !== this.props.checked) {
      this.root.dispatchEvent(new window.Event('change'))
    }
  }

  renderLabel () {
    if (!this.props.label) return ''
    return `<label for="${this.props.id}">${this.props.label}</label>`
  }

  render () {
    const {
      id,
      disabled,
      checked,
      theme
    } = this.props

    if (theme) this.classList.add(`tonic--theme--${theme}`)

    //
    // the id attribute can be removed from the component
    // and added to the input inside the component.
    //
    this.root.removeAttribute('id')

    return `
      <div class="tonic--wrapper">
        <input
          type="checkbox"
          id="${id}"
          ${disabled ? 'disabled' : ''}
          ${checked ? 'checked' : ''}/>
        <label for="${id}" class="tonic--icon"></label>
        ${this.renderLabel()}
      </div>
    `
  }
}

InputCheckbox.svg = {}
InputCheckbox.svg.toURL = s => `data:image/svg+xml;base64,${window.btoa(s)}`

InputCheckbox.svg.iconOn = (color) => InputCheckbox.svg.toURL(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <path fill="${color}" d="M79.7,1H21.3C10.4,1,1.5,9.9,1.5,20.8v58.4C1.5,90.1,10.4,99,21.3,99h58.4c10.9,0,19.8-8.9,19.8-19.8V20.8C99.5,9.9,90.6,1,79.7,1z M93.3,79.3c0,7.5-6.1,13.6-13.6,13.6H21.3c-7.5,0-13.6-6.1-13.6-13.6V20.9c0-7.5,6.1-13.6,13.6-13.6V7.2h58.4c7.5,0,13.6,6.1,13.6,13.6V79.3z"/>
    <polygon fill="${color}" points="44,61.7 23.4,41.1 17.5,47 44,73.5 85.1,32.4 79.2,26.5 "/>
  </svg>
`)

InputCheckbox.svg.iconOff = (color) => InputCheckbox.svg.toURL(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <path fill="${color}" d="M79.7,99H21.3C10.4,99,1.5,90.1,1.5,79.2V20.8C1.5,9.9,10.4,1,21.3,1h58.4c10.9,0,19.8,8.9,19.8,19.8v58.4C99.5,90.1,90.6,99,79.7,99z M21.3,7.3c-7.5,0-13.6,6.1-13.6,13.6v58.4c0,7.5,6.1,13.6,13.6,13.6h58.4c7.5,0,13.6-6.1,13.6-13.6V20.8c0-7.5-6.1-13.6-13.6-13.6H21.3V7.3z"/>
  </svg>
`)

Tonic.add(InputCheckbox)

class InputSelect extends Tonic { /* global Tonic */
  constructor (node) {
    super(node)
    this.root.loading = (state) => this.loading(state)

    const that = this
    Object.defineProperty(this.root, 'value', {
      get () { return that.value }
    })

    Object.defineProperty(this.root, 'option', {
      get () { return that.option }
    })

    Object.defineProperty(this.root, 'selectedIndex', {
      get () { return that.selectedIndex }
    })
  }

  defaults () {
    return {
      disabled: false,
      iconArrow: InputSelect.svg.default(),
      width: '250px',
      radius: '2px',
      padding: '10px 20px 10px 10px'
    }
  }

  style () {
    return {
      '.tonic--wrapper': {
        position: 'relative',
        width: this.props.width
      },
      '.tonic--wrapper:before': {
        content: '""',
        width: '14px',
        height: '14px',
        opacity: '0',
        zIndex: '1'
      },
      '.tonic--loading': {
        pointerEvents: 'none',
        transition: 'background 0.3s ease'
      },
      '.tonic--loading select': {
        color: 'transparent',
        backgroundColor: 'var(--window)',
        borderColor: 'var(--border)'
      },
      '.tonic--loading .tonic--wrapper:before': {
        marginTop: '-8px',
        marginLeft: '-8px',
        display: 'block',
        position: 'absolute',
        bottom: '10px',
        left: '50%',
        opacity: '1',
        '-webkit-transform': 'translateX(-50%)',
        '-ms-transform': 'translateX(-50%)',
        transform: 'translateX(-50%)',
        border: '2px solid var(--medium)',
        borderRadius: '50%',
        borderTopColor: 'transparent',
        animation: 'spin 1s linear 0s infinite',
        transition: 'opacity 0.3s ease'
      },
      'select': {
        color: 'var(--primary)',
        width: this.props.width,
        height: this.props.height,
        font: '14px var(--monospace)',
        padding: this.props.padding,
        backgroundImage: `url('${this.props.iconArrow}')`,
        backgroundColor: 'var(--window)',
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'center right',
        border: '1px solid var(--border)',
        borderRadius: this.props.radius,
        outline: 'none',
        '-webkit-appearance': 'none',
        appearance: 'none',
        position: 'relative'
      },
      'select[disabled]': {
        backgroundColor: 'var(--background)'
      },
      'label': {
        color: 'var(--medium)',
        font: '12px/14px var(--subheader)',
        fontWeight: '500',
        textTransform: 'uppercase',
        letterSpacing: '1px',
        paddingBottom: '10px',
        display: 'block'
      }
    }
  }

  get value () {
    return this.root.querySelector('select').value
  }

  get option () {
    const node = this.root.querySelector('select')
    return node.options[node.selectedIndex]
  }

  get selectedIndex () {
    const node = this.root.querySelector('select')
    return node.selectedIndex
  }

  loading (state) {
    const method = state ? 'add' : 'remove'
    this.root.classList[method]('tonic--loading')
  }

  renderLabel () {
    if (!this.props.label) return ''
    return `<label>${this.props.label}</label>`
  }

  connected () {
    if (this.props.value) {
      const option = this.root.querySelector(`option[value="${this.props.value}"]`)
      if (option) option.setAttribute('selected', true)
    }
  }

  render () {
    const {
      disabled,
      required,
      theme
    } = this.props

    if (theme) this.root.classList.add(`tonic--theme--${theme}`)

    const options = this.root.innerHTML

    return `
      <div class="tonic--wrapper">
        ${this.renderLabel()}
        <select
          ${disabled ? 'disabled' : ''}
          ${required ? 'required' : ''}>
          ${options}
        </select>
      </div>
    `
  }
}

InputSelect.svg = {}
InputSelect.svg.toURL = s => `data:image/svg+xml;base64,${window.btoa(s)}`
InputSelect.svg.default = () => InputSelect.svg.toURL(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <path fill="#D7DBDD" d="M61.4,45.8l-11,13.4c-0.2,0.3-0.5,0.3-0.7,0l-11-13.4c-0.3-0.3-0.1-0.8,0.4-0.8h22C61.4,45,61.7,45.5,61.4,45.8z"/>
  </svg>
`)

Tonic.add(InputSelect)

class InputText extends Tonic { /* global Tonic */
  constructor (node) {
    super(node)
    this.root.setInvalid = msg => this.setInvalid(msg)
    this.root.setValid = () => this.setValid()

    const that = this
    Object.defineProperty(this.root, 'value', {
      get () { return that.value }
    })
  }

  defaults () {
    return {
      type: 'text',
      value: '',
      placeholder: '',
      spellcheck: false,
      ariaInvalid: false,
      invalid: false,
      radius: '3px',
      disabled: false,
      width: '250px',
      errorMessage: 'Invalid'
    }
  }

  get value () {
    return this.root.querySelector('input').value
  }

  setValid () {
    this.reRender(props => Object.assign({}, props, {
      invalid: false
    }))
  }

  setInvalid (msg) {
    this.reRender(props => Object.assign({}, props, {
      invalid: true,
      errorMessage: msg
    }))
  }

  style () {
    return {
      '.tonic--wrapper': {
        position: 'relative',
        width: this.props.width,
        height: this.props.height,
        padding: this.props.padding,
        borderRadius: this.props.radius
      },
      '.tonic--wrapper.tonic--right icon-container': {
        right: '10px'
      },
      '.tonic--wrapper.tonic--right input': {
        paddingRight: '40px'
      },
      '.tonic--wrapper.tonic--left icon-container': {
        left: '10px'
      },
      '.tonic--wrapper.tonic--left input': {
        paddingLeft: '40px'
      },
      'icon-container': {
        position: 'absolute',
        bottom: '7px'
      },
      'label': {
        color: 'var(--medium)',
        fontWeight: '500',
        font: '12px/14px var(--subheader)',
        textTransform: 'uppercase',
        letterSpacing: '1px',
        paddingBottom: '10px',
        display: 'block'
      },
      '.tonic--wrapper input': {
        color: 'var(--primary)',
        font: '14px var(--monospace)',
        width: this.props.width,
        height: this.props.height,
        padding: '10px',
        backgroundColor: 'transparent',
        border: '1px solid var(--border)',
        borderRadius: this.props.radius,
        transition: 'border 0.2s ease-in-out',
        '-webkit-appearance': 'none',
        '-moz-appearance': 'none',
        appearance: 'none',
        outline: 'none'
      },
      '.tonic--wrapper input:focus': {
        borderColor: 'var(--primary)'
      },
      '.tonic--wrapper input[disabled]': {
        backgroundColor: 'var(--background)'
      },
      '.tonic--wrapper input:invalid': {
        borderColor: 'var(--error)'
      },
      '.tonic--wrapper input:invalid:focus': {
        borderColor: 'var(--error)'
      },
      '.tonic--wrapper input:invalid ~ .tonic--invalid': {
        transition: 'opacity 0.2s ease, transform 0.2s ease, visibility 1s ease 0s',
        '-webkit-transform': 'translateY(0)',
        '-ms-transform': 'translateY(0)',
        transform: 'translateY(0)',
        visibility: 'visible',
        opacity: '1'
      },
      '.tonic--invalid': {
        fontSize: '14px',
        textAlign: 'center',
        position: 'absolute',
        bottom: '50px',
        left: '0',
        right: '0',
        '-webkit-transform': 'translateY(-10px)',
        '-ms-transform': 'translateY(-10px)',
        transform: 'translateY(-10px)',
        transition: 'opacity 0.2s ease, transform 0.2s ease, visibility 0s ease 1s',
        visibility: 'hidden',
        opacity: '0'
      },
      '.tonic--invalid span': {
        color: 'white',
        padding: '2px 6px',
        margin: '0 auto',
        position: 'relative',
        display: 'inline-block',
        backgroundColor: 'var(--error)',
        borderRadius: '2px'
      },
      '.tonic--invalid span:after': {
        content: '""',
        width: '0',
        height: '0',
        display: 'block',
        position: 'absolute',
        bottom: '-6px',
        left: '50%',
        '-webkit-transform': 'translateX(-50%)',
        '-ms-transform': 'translateX(-50%)',
        transform: 'translateX(-50%)',
        borderWidth: '6px',
        borderStyle: 'solid',
        borderColor: 'transparent',
        borderTopColor: 'var(--error)'
      }
    }
  }

  renderLabel () {
    if (!this.props.label) return ''
    return `<label>${this.props.label}</label>`
  }

  renderIcon () {
    if (!this.props.src) return ''

    return `
      <icon-container
        src="${this.props.src}"
        color="${this.props.color}">
      </icon-container>
    `
  }

  updated () {
    const input = this.root.querySelector('input')
    setTimeout(() => {
      if (this.props.invalid) {
        input.setCustomValidity(this.props.errorMessage)
      } else {
        input.setCustomValidity('')
      }
    }, 32)
  }

  render () {
    const {
      type,
      value,
      placeholder,
      spellcheck,
      ariaInvalid,
      disabled,
      required,
      pattern,
      theme,
      position
    } = this.props

    const patternAttr = pattern ? `pattern="${pattern}"` : ''
    const valueAttr = (value && value !== 'undefined') ? `value="${value}"` : ''
    const placeholderAttr = placeholder ? `placeholder="${placeholder}"` : ''
    const spellcheckAttr = spellcheck ? `spellcheck="${spellcheck}"` : ''
    const ariaInvalidAttr = ariaInvalid ? `aria-invalid="${ariaInvalid}"` : ''
    const positionAttr = position ? `tonic--${position}` : ''

    if (theme) this.root.classList.add(`tonic--theme--${theme}`)

    return `
      <div class="tonic--wrapper ${positionAttr}">
        ${this.renderLabel()}
        ${this.renderIcon()}

        <input
          ${patternAttr}
          type="${type}"
          ${valueAttr}
          ${placeholderAttr}
          ${spellcheckAttr}
          ${ariaInvalidAttr}
          ${disabled ? 'disabled' : ''}
          ${required ? 'required' : ''}/>
        <div class="tonic--invalid">
          <span>${this.props.errorMessage}</span>
        </div>
      </div>
    `
  }
}

Tonic.add(InputText)

class InputTextarea extends Tonic { /* global Tonic */
  constructor (node) {
    super(node)

    const that = this
    Object.defineProperty(this.root, 'value', {
      get () { return that.value }
    })
  }

  defaults () {
    return {
      placeholder: '',
      spellcheck: true,
      disabled: false,
      required: false,
      readonly: false,
      autofocus: false,
      width: '100%',
      radius: '2px'
    }
  }

  style () {
    const {
      width,
      height,
      radius,
      resize
    } = this.props

    return {
      'textarea': {
        width,
        height,
        borderRadius: radius,
        resize
      }
    }
  }

  get value () {
    return this.root.querySelector('textarea').value
  }

  renderLabel () {
    if (!this.props.label) return ''
    return `<label>${this.props.label}</label>`
  }

  willConnect () {
    this.props.value = this.props.value || this.root.textContent
  }

  render () {
    const {
      placeholder,
      spellcheck,
      disabled,
      required,
      readonly,
      autofocus,
      rows,
      cols,
      minlength,
      maxlength,
      theme
    } = this.props

    const placeholderAttr = placeholder ? `placeholder="${placeholder}"` : ''
    const spellcheckAttr = spellcheck ? `spellcheck="${spellcheck}"` : ''

    if (theme) this.root.classList.add(`tonic--theme--${theme}`)

    if (this.props.value === 'undefined') this.props.value = ''

    return `
      <div class="tonic--wrapper">
        ${this.renderLabel()}
        <textarea
          ${placeholderAttr}
          ${spellcheckAttr}
          ${disabled ? 'disabled' : ''}
          ${required ? 'required' : ''}
          ${readonly ? 'readonly' : ''}
          ${autofocus ? 'autofocus' : ''}
          rows="${rows}"
          cols="${cols}"
          minlength="${minlength}"
          maxlength="${maxlength}">${this.props.value}</textarea>
      </div>
    `
  }
}

Tonic.add(InputTextarea)

class InputToggle extends Tonic { /* global Tonic */
  constructor (node) {
    super(node)

    const that = this
    Object.defineProperty(this.root, 'value', {
      get () { return that.props.checked }
    })
  }

  defaults () {
    return {
      checked: false
    }
  }

  style () {
    return {
      '.tonic--wrapper': {
        height: '30px',
        width: '47px',
        position: 'relative'
      },
      '.tonic--wrapper > label': {
        color: 'var(--medium)',
        fontWeight: '500',
        font: '12px/14px var(--subheader)',
        textTransform: 'uppercase',
        letterSpacing: '1px',
        marginLeft: '58px',
        paddingTop: '9px',
        display: 'block',
        userSelect: 'none'
      },
      '.tonic--switch': {
        position: 'absolute',
        left: '0',
        top: '0'
      },
      '.tonic--switch label:before': {
        font: 'bold 12px var(--subheader)',
        textTransform: 'uppercase'
      },
      'input.tonic--toggle': {
        position: 'absolute',
        display: 'none',
        outline: 'none',
        userSelect: 'none',
        zIndex: '1'
      },
      'input.tonic--toggle + label': {
        width: '42px',
        height: '24px',
        padding: '2px',
        display: 'block',
        position: 'relative',
        backgroundColor: 'var(--border)',
        borderRadius: '60px',
        transition: 'background 0.4s ease-in-out',
        cursor: 'default'
      },
      'input.tonic--toggle + label:before': {
        content: '""',
        lineHeight: '29px',
        textIndent: '29px',
        position: 'absolute',
        top: '1px',
        left: '1px',
        right: '1px',
        bottom: '1px',
        display: 'block',
        borderRadius: '60px',
        transition: 'background 0.4s ease-in-out',
        paddingTop: '1px',
        fontSize: '0.65em',
        letterSpacing: '0.05em',
        backgroundColor: 'var(--border)'
      },
      'input.tonic--toggle + label:after': {
        content: '""',
        width: '16px',
        position: 'absolute',
        top: '4px',
        left: '4px',
        bottom: '4px',
        backgroundColor: 'var(--window)',
        borderRadius: '52px',
        transition: 'background 0.4s ease-in-out, margin 0.4s ease-in-out',
        display: 'block',
        zIndex: '2'
      },
      'input.tonic--toggle:disabled': {
        cursor: 'default',
        backgroundColor: 'var(--background)'
      },
      'input.tonic--toggle:disabled + label': {
        cursor: 'default',
        backgroundColor: 'var(--background)'
      },
      'input.tonic--toggle:disabled + label:before': {
        backgroundColor: 'var(--background)'
      },
      'input.tonic--toggle:disabled + label:after': {
        backgroundColor: 'var(--window)'
      },
      'input.tonic--toggle:checked + label': {
        backgroundColor: 'var(--accent)'
      },
      'input.tonic--toggle:checked + label:before': {
        content: '""',
        backgroundColor: 'var(--accent)',
        color: 'var(--background)'
      },
      'input.tonic--toggle:checked + label:after': {
        marginLeft: '18px',
        backgroundColor: 'var(--background)'
      }
    }
  }

  change (e) {
    this.props.checked = !this.props.checked
  }

  renderLabel () {
    if (!this.props.label) return ''
    return `<label for="${this.props.id}">${this.props.label}</label>`
  }

  render () {
    const {
      id,
      disabled,
      theme,
      checked
    } = this.props

    if (theme) this.root.classList.add(`tonic--theme--${theme}`)

    //
    // the id attribute can be removed to the input
    // and added to the input inside the component.
    //
    this.root.removeAttribute('id')

    return `
      <div class="tonic--wrapper">
        <div class="tonic--switch">
          <input
            type="checkbox"
            class="tonic--toggle"
            id="${id}"
            ${disabled ? 'disabled' : ''}
            ${checked ? 'checked' : ''}>
          <label for="${id}"></label>
        </div>
        ${this.renderLabel()}
      </div>
    `
  }
}

Tonic.add(InputToggle)

class NotificationBadge extends Tonic { /* global Tonic */
  defaults () {
    return {
      count: 0
    }
  }

  style () {
    return {
      '*': {
        boxSizing: 'border-box'
      },

      '.tonic--notifications': {
        width: '40px',
        height: '40px',
        textAlign: 'center',
        padding: '10px',
        position: 'relative',
        backgroundColor: 'var(--background)',
        borderRadius: '8px'
      },

      '.tonic--notifications .tonic--new span:after': {
        display: 'block'
      },

      'span': {
        color: 'var(--primary)',
        font: '15px var(--subheader)',
        letterSpacing: '1px',
        textAlign: 'center'
      },

      'span:after': {
        content: '',
        width: '8px',
        height: '8px',
        display: 'none',
        position: 'absolute',
        top: '7px',
        right: '6px',
        backgroundColor: 'var(--notification)',
        border: '2px solid var(--background)',
        borderRadius: '50%'
      }
    }
  }

  render () {
    let {
      count,
      theme
    } = this.props

    if (theme) this.root.classList.add(`tonic--theme--${theme}`)

    const countAttr = (count > 99) ? '99' : count

    const newAttr = (count > 0) ? 'tonic--new' : ''

    return `
      <div class="tonic--notifications ${newAttr}">
        <span>${countAttr}</span>
      </div>
    `
  }
}

Tonic.add(NotificationBadge)

class NotificationCenter extends Tonic { /* global Tonic */
  constructor (node) {
    super(node)

    this.root.create = (o) => this.create(o)
    this.root.hide = () => this.hide()
  }

  getPropertyValue (s) {
    const computed = window.getComputedStyle(this.root)
    return computed.getPropertyValue(`--${s}`).trim()
  }

  defaults () {
    return {
      closeIcon: NotificationCenter.svg.closeIcon(this.getPropertyValue('primary')),
      dangerIcon: NotificationCenter.svg.dangerIcon(this.getPropertyValue('danger')),
      warningIcon: NotificationCenter.svg.warningIcon(this.getPropertyValue('warning')),
      successIcon: NotificationCenter.svg.successIcon(this.getPropertyValue('success')),
      infoIcon: NotificationCenter.svg.infoIcon(this.getPropertyValue('info')),
      position: 'center'
    }
  }

  style () {
    return {
      '*': {
        boxSizing: 'border-box'
      },
      '.tonic--wrapper': {
        userSelect: 'none',
        position: 'fixed',
        top: '10px',
        display: 'flex',
        flexWrap: 'wrap',
        flexDirection: 'column',
        visibility: 'hidden',
        zIndex: '102'
      },
      '.tonic--wrapper @media (max-width: 850px)': {
        width: '90%'
      },
      '.tonic--wrapper.tonic--show': {
        visibility: 'visible'
      },
      '.tonic--wrapper.tonic--center': {
        left: '50%',
        alignItems: 'center',
        '-webkit-transform': 'translateX(-50%)',
        '-ms-transform': 'translateX(-50%)',
        transform: 'translateX(-50%)'
      },
      '.tonic--wrapper.tonic--left': {
        alignItems: 'flex-start',
        left: '10px'
      },
      '.tonic--wrapper.tonic--right': {
        alignItems: 'flex-end',
        right: '10px'
      },
      '.tonic--notification': {
        width: 'auto',
        maxWidth: '600px',
        marginTop: '10px',
        position: 'relative',
        backgroundColor: 'var(--window)',
        boxShadow: '0px 10px 40px -20px rgba(0,0,0,0.4), 0 0 1px #a2a9b1',
        borderRadius: '3px',
        '-webkit-transform': 'translateY(-100px)',
        '-ms-transform': 'translateY(-100px)',
        transform: 'translateY(-100px)',
        transition: 'opacity 0.2s ease, transform 0s ease 1s',
        zIndex: '1',
        opacity: '0'
      },
      '.tonic--notification.tonic--show': {
        opacity: '1',
        '-webkit-transform': 'translateY(0)',
        '-ms-transform': 'translateY(0)',
        transform: 'translateY(0)',
        transition: 'transform 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28)'
      },
      '.tonic--notification.tonic--close': {
        paddingRight: '50px'
      },
      '.tonic--notification.tonic--alert': {
        paddingLeft: '35px'
      },
      '.tonic--main': {
        padding: '17px 15px 15px 15px'
      },
      '.tonic--title': {
        font: '14px/18px var(--subheader)'
      },
      '.tonic--message': {
        font: '14px/18px var(--subheader)',
        color: 'var(--medium)'
      },
      '.tonic--icon': {
        width: '16px',
        height: '16px',
        position: 'absolute',
        left: '20px',
        top: '50%',
        backgroundSize: 'cover',
        '-webkit-transform': 'translateY(-50%)',
        '-ms-transform': 'translateY(-50%)',
        transform: 'translateY(-50%)'
      },
      '.tonic--close': {
        width: '20px',
        height: '20px',
        position: 'absolute',
        right: '20px',
        top: '50%',
        '-webkit-transform': 'translateY(-50%)',
        '-ms-transform': 'translateY(-50%)',
        transform: 'translateY(-50%)',
        cursor: 'pointer',
        backgroundSize: 'cover'
      },
      '.tonic--close svg path': {
        fill: 'var(--primary)',
        color: 'var(--primary)'
      }
    }
  }

  create ({ message, title, duration, type, dismiss } = {}) {
    const notification = document.createElement('div')
    notification.className = 'tonic--notification'
    const main = document.createElement('div')
    main.className = 'tonic--main'
    if (type) {
      notification.classList.add('tonic--alert')
    }

    const titleElement = document.createElement('div')
    titleElement.className = 'tonic--title'
    titleElement.textContent = title || this.props.title

    const messageElement = document.createElement('div')
    messageElement.className = 'tonic--message'
    messageElement.textContent = message || this.props.message

    if (dismiss !== 'false') {
      const close = document.createElement('div')
      close.className = 'tonic--close'
      close.style.backgroundImage = `url("${this.props.closeIcon}")`
      notification.appendChild(close)
      notification.classList.add('tonic--close')
    }

    if (type) {
      const alertIcon = document.createElement('div')
      alertIcon.className = 'tonic--icon'
      notification.appendChild(alertIcon)

      switch (type) {
        case 'danger':
          alertIcon.style.backgroundImage = `url("${this.props.dangerIcon}")`
          if (!title && !message) { titleElement.textContent = 'Danger' }
          break

        case 'warning':
          alertIcon.style.backgroundImage = `url("${this.props.warningIcon}")`
          if (!title && !message) { titleElement.textContent = 'Warning' }
          break

        case 'success':
          alertIcon.style.backgroundImage = `url("${this.props.successIcon}")`
          if (!title && !message) { titleElement.textContent = 'Success' }
          break

        case 'info':
          alertIcon.style.backgroundImage = `url("${this.props.infoIcon}")`
          if (!title && !message) { titleElement.textContent = 'Information' }
          break
      }
    }

    notification.appendChild(main)
    main.appendChild(titleElement)
    main.appendChild(messageElement)
    this.root.querySelector('.tonic--wrapper').appendChild(notification)
    this.show()

    setTimeout(() => {
      notification.classList.add('tonic--show')
    }, 64)

    if (duration) {
      setTimeout(() => this.destroy(notification), duration)
    }
  }

  destroy (notification) {
    notification.classList.remove('tonic--show')
    notification.addEventListener('transitionend', e => {
      notification.parentNode.removeChild(notification)
    })
  }

  show () {
    const node = this.root.firstElementChild
    node.classList.add('tonic--show')
  }

  hide () {
    const node = this.root.firstElementChild
    node.classList.remove('tonic--show')
  }

  click (e) {
    const el = Tonic.match(e.target, '.tonic--close')
    if (!el) return

    const notification = el.closest('.tonic--notification')
    if (notification) this.destroy(notification)
  }

  render () {
    const {
      theme,
      position
    } = this.props

    const positionAttr = position ? `tonic--${position}` : ''

    if (theme) this.root.classList.add(`tonic--theme--${theme}`)

    return `<div class="tonic--wrapper ${positionAttr}"></div>`
  }
}

NotificationCenter.svg = {}
NotificationCenter.svg.toURL = s => `data:image/svg+xml;base64,${window.btoa(s)}`

NotificationCenter.svg.closeIcon = color => NotificationCenter.svg.toURL(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <path fill="${color}" d="M80.7,22.6l-3.5-3.5c-0.1-0.1-0.3-0.1-0.4,0L50,45.9L23.2,19.1c-0.1-0.1-0.3-0.1-0.4,0l-3.5,3.5c-0.1,0.1-0.1,0.3,0,0.4l26.8,26.8L19.3,76.6c-0.1,0.1-0.1,0.3,0,0.4l3.5,3.5c0,0,0.1,0.1,0.2,0.1s0.1,0,0.2-0.1L50,53.6l25.9,25.9c0.1,0.1,0.3,0.1,0.4,0l3.5-3.5c0.1-0.1,0.1-0.3,0-0.4L53.9,49.8l26.8-26.8C80.8,22.8,80.8,22.7,80.7,22.6z"/>
  </svg>
`)

NotificationCenter.svg.dangerIcon = color => NotificationCenter.svg.toURL(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <path fill="${color}" d="M50.1,6.7C26.3,6.7,6.9,26.2,6.9,50s19.4,43.2,43.2,43.2c23.8,0,43.2-19.5,43.2-43.3C93.3,26.1,74,6.7,50.1,6.7z M53.9,76.4h-7.6V68h7.6V76.4z M53.9,60.5h-7.6V25.6h7.6V60.5z"/>
  </svg>
`)

NotificationCenter.svg.warningIcon = color => NotificationCenter.svg.toURL(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <path fill="${color}" d="M98.6,86.6l-46-79.7c-1.2-2-4-2-5.2,0l-46,79.7c-1.2,2,0.3,4.5,2.6,4.5h92C98.3,91.1,99.8,88.6,98.6,86.6z M53.9,80.4h-7.6V72h7.6V80.4z M53.9,64.5h-7.6V29.6h7.6V64.5z"/>
  </svg>
`)

NotificationCenter.svg.successIcon = color => NotificationCenter.svg.toURL(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <path fill="${color}" d="M50.1,6.7C26.3,6.7,6.9,26.2,6.9,50s19.4,43.2,43.2,43.2c23.8,0,43.2-19.5,43.2-43.3C93.3,26.1,74,6.7,50.1,6.7z M43.4,71.5L22,50.1l4.8-4.8L43.4,62l28.5-28.5l4.8,4.8L43.4,71.5z"/>
  </svg>
`)

NotificationCenter.svg.infoIcon = color => NotificationCenter.svg.toURL(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <path fill="${color}" d="M50.1,6.7C26.3,6.7,6.9,26.2,6.9,50s19.4,43.2,43.2,43.2c23.8,0,43.2-19.5,43.2-43.3C93.3,26.1,74,6.7,50.1,6.7z M54.1,75.5h-8.1v-7.8h8.1V75.5z M64.1,47.6c-0.8,1.1-2.4,2.7-4.8,4.5L57,54c-1.4,1.1-2.3,2.3-2.7,3.7c-0.3,0.8-0.4,2-0.4,3.6h-8c0.1-3.4,0.5-5.8,1-7.1c0.5-1.3,2-2.9,4.3-4.7l2.4-1.9c0.8-0.6,1.5-1.3,2-2.1c0.9-1.3,1.4-2.8,1.4-4.3c0-1.8-0.5-3.4-1.6-4.9c-1.1-1.5-3-2.3-5.8-2.3c-2.7,0-4.7,0.9-5.9,2.8c-1,1.6-1.6,3.3-1.7,5.1h-8.6c0.4-5.9,2.5-10.1,6.4-12.6l0,0c2.5-1.6,5.7-2.5,9.4-2.5c4.9,0,9,1.2,12.2,3.5c3.2,2.3,4.8,5.7,4.8,10.3C66.2,43.4,65.5,45.7,64.1,47.6z"/>
  </svg>
`)

Tonic.add(NotificationCenter)

class NotificationInline extends Tonic { /* global Tonic */
  constructor (node) {
    super(node)

    this.root.create = (o) => this.create(o)
    this.root.hide = () => this.hide()
  }

  getPropertyValue (s) {
    const computed = window.getComputedStyle(this.root)
    return computed.getPropertyValue(`--${s}`).trim()
  }

  defaults () {
    return {
      closeIcon: NotificationInline.svg.closeIcon(),
      dangerIcon: NotificationInline.svg.dangerIcon(this.getPropertyValue('danger')),
      warningIcon: NotificationInline.svg.warningIcon(this.getPropertyValue('warning')),
      successIcon: NotificationInline.svg.successIcon(this.getPropertyValue('success')),
      infoIcon: NotificationInline.svg.infoIcon(this.getPropertyValue('info'))
    }
  }

  style () {
    return `%style%`
  }

  create ({ message, title, duration, type, dismiss } = {}) {
    this.show()

    while (this.root.firstChild) this.root.firstChild.remove()

    const notification = document.createElement('div')
    notification.className = 'tonic--notification'
    const main = document.createElement('main')
    if (type) {
      notification.classList.add('tonic--alert')
      notification.classList.add(`tonic--${type}`)
    }

    const titleElement = document.createElement('div')
    titleElement.className = 'tonic--title'
    titleElement.textContent = title || this.props.title

    const messageElement = document.createElement('div')
    messageElement.className = 'tonic--message'
    messageElement.innerHTML = message || this.props.message

    if (dismiss !== 'false') {
      const close = document.createElement('div')
      close.className = 'tonic--close'
      close.style.backgroundImage = `url("${this.props.closeIcon}")`
      notification.appendChild(close)
      notification.classList.add('tonic--close')
    }

    if (type) {
      const alertIcon = document.createElement('div')
      alertIcon.className = 'tonic--icon'
      notification.appendChild(alertIcon)

      switch (type) {
        case 'danger':
          alertIcon.style.backgroundImage = `url("${this.props.dangerIcon}")`
          if (!title && !message) { titleElement.textContent = 'Danger' }
          break

        case 'warning':
          alertIcon.style.backgroundImage = `url("${this.props.warningIcon}")`
          if (!title && !message) { titleElement.textContent = 'Warning' }
          break

        case 'success':
          alertIcon.style.backgroundImage = `url("${this.props.successIcon}")`
          if (!title && !message) { titleElement.textContent = 'Success' }
          break

        case 'info':
          alertIcon.style.backgroundImage = `url("${this.props.infoIcon}")`
          if (!title && !message) { titleElement.textContent = 'Information' }
          break
      }
    }

    if (!type && !message && !title) {
      messageElement.textContent = 'Empty message'
    }

    this.root.appendChild(notification)
    notification.appendChild(main)
    main.appendChild(titleElement)
    main.appendChild(messageElement)
    window.requestAnimationFrame(() => {
      notification.classList.add('tonic--show')
    })

    if (duration) {
      setTimeout(() => this.destroy(notification), duration)
    }
  }

  destroy (notification) {
    notification.classList.remove('tonic--show')
    notification.addEventListener('transitionend', e => {
      notification.parentNode.removeChild(notification)
    })
  }

  show () {
    window.requestAnimationFrame(() => {
      this.root.firstChild.classList.add('tonic--show')
    })
  }

  hide () {
    this.root.firstChild.classList.remove('tonic--show')
  }

  click (e) {
    const el = Tonic.match(e.target, '.tonic--close')
    if (!el) return

    const notification = el.closest('.tonic--notification')
    if (notification) this.destroy(notification)
  }

  willConnect () {
    this.html = this.root.innerHTML
  }

  connected () {
    if (this.props.display !== 'true') return
    if (this.root.querySelector('main')) return
    this.props.message = this.html
    this.create(this.props)
  }

  render () {
    const {
      theme
    } = this.props

    if (theme) this.root.classList.add(`tonic--theme--${theme}`)

    return `<div class="tonic--wrapper"></div>`
  }
}

NotificationInline.svg = {}
NotificationInline.svg.toURL = s => `data:image/svg+xml;base64,${window.btoa(s)}`

NotificationInline.svg.closeIcon = color => NotificationInline.svg.toURL(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <path fill="${color}" d="M80.7,22.6l-3.5-3.5c-0.1-0.1-0.3-0.1-0.4,0L50,45.9L23.2,19.1c-0.1-0.1-0.3-0.1-0.4,0l-3.5,3.5c-0.1,0.1-0.1,0.3,0,0.4l26.8,26.8L19.3,76.6c-0.1,0.1-0.1,0.3,0,0.4l3.5,3.5c0,0,0.1,0.1,0.2,0.1s0.1,0,0.2-0.1L50,53.6l25.9,25.9c0.1,0.1,0.3,0.1,0.4,0l3.5-3.5c0.1-0.1,0.1-0.3,0-0.4L53.9,49.8l26.8-26.8C80.8,22.8,80.8,22.7,80.7,22.6z"/>
  </svg>
`)

NotificationInline.svg.dangerIcon = color => NotificationInline.svg.toURL(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <path fill="${color}" d="M50.1,6.7C26.3,6.7,6.9,26.2,6.9,50s19.4,43.2,43.2,43.2c23.8,0,43.2-19.5,43.2-43.3C93.3,26.1,74,6.7,50.1,6.7z M53.9,76.4h-7.6V68h7.6V76.4z M53.9,60.5h-7.6V25.6h7.6V60.5z"/>
  </svg>
`)

NotificationInline.svg.warningIcon = color => NotificationInline.svg.toURL(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <path fill="${color}" d="M98.6,86.6l-46-79.7c-1.2-2-4-2-5.2,0l-46,79.7c-1.2,2,0.3,4.5,2.6,4.5h92C98.3,91.1,99.8,88.6,98.6,86.6z M53.9,80.4h-7.6V72h7.6V80.4z M53.9,64.5h-7.6V29.6h7.6V64.5z"/>
  </svg>
`)

NotificationInline.svg.successIcon = color => NotificationInline.svg.toURL(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <path fill="${color}" d="M50.1,6.7C26.3,6.7,6.9,26.2,6.9,50s19.4,43.2,43.2,43.2c23.8,0,43.2-19.5,43.2-43.3C93.3,26.1,74,6.7,50.1,6.7z M43.4,71.5L22,50.1l4.8-4.8L43.4,62l28.5-28.5l4.8,4.8L43.4,71.5z"/>
  </svg>
`)

NotificationInline.svg.infoIcon = color => NotificationInline.svg.toURL(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <path fill="${color}" d="M50.1,6.7C26.3,6.7,6.9,26.2,6.9,50s19.4,43.2,43.2,43.2c23.8,0,43.2-19.5,43.2-43.3C93.3,26.1,74,6.7,50.1,6.7z M54.1,75.5h-8.1v-7.8h8.1V75.5z M64.1,47.6c-0.8,1.1-2.4,2.7-4.8,4.5L57,54c-1.4,1.1-2.3,2.3-2.7,3.7c-0.3,0.8-0.4,2-0.4,3.6h-8c0.1-3.4,0.5-5.8,1-7.1c0.5-1.3,2-2.9,4.3-4.7l2.4-1.9c0.8-0.6,1.5-1.3,2-2.1c0.9-1.3,1.4-2.8,1.4-4.3c0-1.8-0.5-3.4-1.6-4.9c-1.1-1.5-3-2.3-5.8-2.3c-2.7,0-4.7,0.9-5.9,2.8c-1,1.6-1.6,3.3-1.7,5.1h-8.6c0.4-5.9,2.5-10.1,6.4-12.6l0,0c2.5-1.6,5.7-2.5,9.4-2.5c4.9,0,9,1.2,12.2,3.5c3.2,2.3,4.8,5.7,4.8,10.3C66.2,43.4,65.5,45.7,64.1,47.6z"/>
  </svg>
`)

Tonic.add(NotificationInline)

class Panel extends Tonic { /* global Tonic */
  constructor (node) {
    super(node)

    this.root.show = fn => this.show(fn)
    this.root.hide = fn => this.hide(fn)

    this.root.addEventListener('click', e => {
      const el = Tonic.match(e.target, '.tonic--close')
      if (el) this.hide()

      const overlay = Tonic.match(e.target, '.tonic--overlay')
      if (overlay) this.hide()
    })
  }

  getPropertyValue (s) {
    const computed = window.getComputedStyle(this.root)
    return computed.getPropertyValue(`--${s}`).trim()
  }

  defaults () {
    return {
      position: 'right',
      overlay: false,
      closeIcon: Panel.svg.closeIcon,
      backgroundColor: 'rgba(0,0,0,0.5)'
    }
  }

  style () {
    return {
      '*': {
        boxSizing: 'border-box'
      },
      '.tonic--wrapper .tonic--panel': {
        width: '500px',
        position: 'fixed',
        bottom: '0',
        top: '0',
        backgroundColor: 'var(--window)',
        boxShadow: '0px 0px 28px 0 rgba(0,0,0,0.05)',
        zIndex: '100',
        transition: 'transform 0.3s ease-in-out'
      },
      '.tonic--wrapper .tonic--panel @media (max-width: 500px)': {
        width: '100%'
      },
      '.tonic--wrapper.tonic--left .tonic--panel': {
        left: '0',
        borderRight: '1px solid var(--border)',
        '-webkit-transform': 'translateX(-500px)',
        '-ms-transform': 'translateX(-500px)',
        'transform': 'translateX(-500px)'
      },
      '.tonic--wrapper.tonic--right .tonic--panel': {
        right: '0',
        borderLeft: '1px solid var(--border)',
        '-webkit-transform': 'translateX(500px)',
        '-ms-transform': 'translateX(500px)',
        transform: 'translateX(500px)'
      },
      '.tonic--show .tonic--panel': {
        '-webkit-transform': 'translateX(0)',
        '-ms-transform': 'translateX(0)',
        transform: 'translateX(0)'
      },
      '.tonic--show[overlay="true"] .tonic--overlay': {
        opacity: '1',
        visibility: 'visible',
        transition: 'opacity 0.3s ease-in-out, visibility 0s ease 0s'
      },
      '.tonic--overlay': {
        opacity: '0',
        visibility: 'hidden',
        position: 'fixed',
        top: '0',
        left: '0',
        right: '0',
        bottom: '0',
        transition: 'opacity 0.3s ease-in-out, visibility 0s ease 1s',
        zIndex: '1'
      },
      '.tonic--close': {
        width: '25px',
        height: '25px',
        position: 'absolute',
        top: '30px',
        right: '30px',
        cursor: 'pointer'
      }
    }
  }

  show (fn) {
    const node = this.root.firstChild
    node.classList.add('tonic--show')
    fn && node.addEventListener('transitionend', fn, { once: true })
  }

  hide (fn) {
    const node = this.root.firstChild
    node.classList.remove('tonic--show')
    fn && node.addEventListener('transitionend', fn, { once: true })
  }

  wrap (render) {
    const {
      name,
      position,
      overlay,
      theme,
      color,
      backgroundColor
    } = this.props

    this.root.classList.add('tonic--panel')

    const wrapper = document.createElement('div')
    const template = document.createElement('template')

    const content = render()

    typeof content === 'string'
      ? (template.innerHTML = content)
      : [...content.children].forEach(el => template.appendChild(el))

    if (theme) this.root.classList.add(`tonic--theme--${theme}`)

    const isOpen = !!this.root.querySelector('.tonic--wrapper.tonic--show')
    wrapper.className = isOpen ? 'tonic--wrapper tonic--show' : 'tonic--wrapper'
    wrapper.id = 'wrapper'
    const positionAttr = position ? `tonic--${position}` : ''
    wrapper.classList.add(positionAttr)

    if (overlay) wrapper.setAttribute('overlay', true)
    if (name) wrapper.setAttribute('name', name)

    // create panel
    const panel = document.createElement('div')
    panel.className = 'tonic--panel'

    if (overlay !== 'false') {
      const overlayElement = document.createElement('div')
      overlayElement.className = 'tonic--overlay'
      overlayElement.setAttribute('style', `background-color: ${backgroundColor}`)
      wrapper.appendChild(overlayElement)
    }

    // create template
    const close = document.createElement('div')
    close.className = 'tonic--close'

    const iconColor = color || this.getPropertyValue('primary')
    const url = Panel.svg.closeIcon(iconColor)
    close.style.backgroundImage = `url("${url}")`

    // append everything
    wrapper.appendChild(panel)
    wrapper.appendChild(panel)
    panel.appendChild(template.content)
    panel.appendChild(close)

    return wrapper
  }
}

Panel.svg = {}
Panel.svg.toURL = s => `data:image/svg+xml;base64,${window.btoa(s)}`
Panel.svg.closeIcon = color => Panel.svg.toURL(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <path fill="${color}" d="M80.7,22.6l-3.5-3.5c-0.1-0.1-0.3-0.1-0.4,0L50,45.9L23.2,19.1c-0.1-0.1-0.3-0.1-0.4,0l-3.5,3.5c-0.1,0.1-0.1,0.3,0,0.4l26.8,26.8L19.3,76.6c-0.1,0.1-0.1,0.3,0,0.4l3.5,3.5c0,0,0.1,0.1,0.2,0.1s0.1,0,0.2-0.1L50,53.6l25.9,25.9c0.1,0.1,0.3,0.1,0.4,0l3.5-3.5c0.1-0.1,0.1-0.3,0-0.4L53.9,49.8l26.8-26.8C80.8,22.8,80.8,22.7,80.7,22.6z"/>
  </svg>
`)

Tonic.Panel = Panel

class Popover extends Tonic { /* global Tonic */
  constructor (node) {
    super(node)
    const target = node.getAttribute('for')
    const el = document.getElementById(target)

    this.root.hide = () => this.hide()

    el.addEventListener('click', e => this.show(el))
  }

  defaults (props) {
    return {
      width: 'auto',
      height: 'auto',
      padding: '15px',
      margin: 10,
      position: 'bottomleft'
    }
  }

  style () {
    const {
      width,
      height,
      padding
    } = this.props

    return {
      '.tonic--popover': {
        position: 'absolute',
        top: '30px',
        width,
        height,
        padding,
        background: 'var(--window)',
        border: '1px solid var(--border)',
        borderRadius: '2px',
        visibility: 'hidden',
        zIndex: -1,
        opacity: 0,
        transform: 'scale(0.75)',
        transition: [
          'transform 0.1s ease-in-out',
          'opacity 0s ease 0.1s',
          'visibility 0s ease 0.1s',
          'z-index 0s ease 0.1s'
        ].join(', ')
      },

      '.tonic--popover.tonic--show': {
        boxShadow: '0px 30px 90px -20px rgba(0, 0, 0, 0.3)',
        transform: 'scale(1)',
        visibility: 'visible',
        transition: 'transform 0.15s ease-in-out',
        opacity: 1,
        zIndex: 1
      },

      '.tonic--popover--top': {
        transformOrigin: 'bottom center'
      },

      '.tonic--popover--topleft': {
        transformOrigin: 'bottom left'
      },

      '.tonic--popover--topright': {
        transformOrigin: 'bottom right'
      },

      '.tonic--popover--bottom': {
        transformOrigin: 'top center'
      },

      '.tonic--popover--bottomleft': {
        transformOrigin: 'top left'
      },

      '.tonic--popover--bottomright': {
        transformOrigin: 'top right'
      }
    }
  }

  show (triggerNode) {
    const popover = this.root.querySelector('.tonic--popover')
    let scrollableArea = triggerNode.parentNode

    while (true) {
      if (!scrollableArea || scrollableArea.tagName === 'BODY') break
      if (window.getComputedStyle(scrollableArea).overflow === 'scroll') break
      scrollableArea = scrollableArea.parentNode
    }

    const margin = parseInt(this.props.margin, 10)
    let { top, left } = triggerNode.getBoundingClientRect()
    let pos = top + scrollableArea.scrollTop
    left -= scrollableArea.offsetLeft

    switch (this.props.position) {
      case 'topleft':
        pos -= popover.offsetHeight + margin
        break
      case 'topright':
        pos -= popover.offsetHeight + margin
        left += (triggerNode.offsetWidth - popover.offsetWidth)
        break
      case 'top':
        pos -= popover.offsetHeight + margin
        left += (triggerNode.offsetWidth / 2) - (popover.offsetWidth / 2)
        break
      case 'bottomleft':
        pos += triggerNode.offsetHeight + margin
        break
      case 'bottomright':
        pos += triggerNode.offsetHeight + margin
        left += triggerNode.offsetWidth - popover.offsetWidth
        break
      case 'bottom':
        pos += triggerNode.offsetHeight + margin
        left += (triggerNode.offsetWidth / 2) - (popover.offsetWidth / 2)
        break
    }

    popover.style.top = `${pos}px`
    popover.style.left = `${left}px`

    window.requestAnimationFrame(() => {
      popover.className = `tonic--popover tonic--show tonic--popover--${this.props.position}`
      const event = new window.Event('show')
      this.root.dispatchEvent(event)
    })
  }

  hide () {
    const popover = this.root.querySelector('.tonic--popover')
    if (popover) popover.classList.remove('tonic--show')
  }

  render () {
    const {
      theme
    } = this.props

    if (theme) this.root.classList.add(`tonic--theme--${theme}`)

    return `
      <div class="tonic--popover">
          ${this.children.trim()}
      </div>
    `
  }
}

Tonic.add(Popover)

class ProfileImage extends Tonic { /* global Tonic */
  defaults () {
    return {
      size: '50px',
      src: ProfileImage.svg.default(),
      iconEdit: ProfileImage.svg.edit(),
      radius: '5px'
    }
  }

  getPropertyValue (s) {
    const computed = window.getComputedStyle(this.root)
    return computed.getPropertyValue(`--${s}`).trim()
  }

  style () {
    return {
      '': {
        display: 'inline-block'
      },
      'input[type="file"]': {
        display: 'none'
      },
      '.tonic--wrapper': {
        width: this.props.size,
        height: this.props.size,
        border: this.props.border,
        borderRadius: this.props.radius,
        position: 'relative',
        overflow: 'hidden'
      },
      '.tonic--image': {
        position: 'absolute',
        top: '0',
        left: '0',
        right: '0',
        bottom: '0',
        backgroundImage: `url('${this.props.src}')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center center',
        backgroundRepeat: 'no-repeat'
      },
      '.tonic--overlay': {
        position: 'absolute',
        top: '0',
        left: '0',
        right: '0',
        bottom: '0',
        backgroundColor: 'rgba(0,0,0,0.5)',
        transition: 'opacity 0.2s ease-in-out',
        visibility: 'hidden',
        opacity: '0',
        display: 'flex'
      },
      '.tonic--icon': {
        position: 'absolute',
        top: '0',
        left: '0',
        right: '0',
        bottom: '0',
        backgroundImage: `url('${this.props.iconEdit}')`,
        backgroundSize: '40px 40px',
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'center center'
      },
      '.tonic--editable:hover .tonic--overlay': {
        visibility: 'visible',
        opacity: '1',
        cursor: 'pointer'
      }
    }
  }

  getPictureData (src, cb) {
    const reader = new window.FileReader()
    reader.onerror = err => cb(err)
    reader.onload = e => cb(null, e.target.result)
    reader.readAsDataURL(src)
  }

  click (e) {
    const fileInput = this.root.getElementsByTagName('input')[0]
    fileInput.click()
  }

  change (e) {
    const fileInput = this.root.getElementsByTagName('input')[0]
    const data = fileInput.files[0]

    this.getPictureData(data, (err, data) => {
      if (err) return this.emit('error', err)

      const slot = this.root.querySelector('.tonic--image')
      slot.style.backgroundImage = 'url("' + data + '")'
      this.emit('changed', data)
    })
  }

  render () {
    let {
      id,
      name,
      theme,
      editable
    } = this.props

    const idAttr = id ? `id="${id}"` : ''
    const nameAttr = name ? `name="${name}"` : ''

    if (theme) this.root.classList.add(`tonic--theme--${theme}`)

    return `
      <div class="tonic--wrapper ${editable ? 'tonic--editable' : ''}">
        <div class="tonic--image" ${idAttr} ${nameAttr}>
        </div>
        <input type="file"/>
        <div class="tonic--overlay">
          <div class="tonic--icon"></div>
        </div>
      </div>
    `
  }
}

ProfileImage.svg = {}
ProfileImage.svg.toURL = s => `data:image/svg+xml;base64,${window.btoa(s)}`
ProfileImage.svg.default = () => ProfileImage.svg.toURL(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <rect fill="#F0F0F0" width="100" height="100"></rect>
    <circle fill="#D6D6D6" cx="49.3" cy="41.3" r="21.1"></circle>
    <path fill="#D6D6D6" d="M48.6,69.5c-18.1,0-33.1,13.2-36,30.5h72C81.8,82.7,66.7,69.5,48.6,69.5z"></path>
  </svg>
`)

ProfileImage.svg.edit = () => ProfileImage.svg.toURL(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <path fill="#fff" d="M79.8,32.8L67.5,20.5c-0.2-0.2-0.5-0.2-0.7,0L25.2,62.1c-0.1,0.1-0.1,0.1-0.1,0.2L20.8,79c0,0.2,0,0.4,0.1,0.5c0.1,0.1,0.2,0.1,0.4,0.1c0,0,0.1,0,0.1,0l16.6-4.4c0.1,0,0.2-0.1,0.2-0.1l41.6-41.6C79.9,33.3,79.9,33,79.8,32.8z M67.1,25.8l7.3,7.3L36.9,70.7l-7.3-7.3L67.1,25.8z M33,72.4l-6.8,1.8l1.8-6.9L33,72.4z"/>
  </svg>
`)

Tonic.add(ProfileImage)

class ProgressBar extends Tonic { /* global Tonic */
  constructor (node) {
    super(node)

    this.root.setProgress = n => this.setProgress(n)

    const that = this
    Object.defineProperty(this.root, 'value', {
      get () { return that.props.progress }
    })
  }

  defaults () {
    return {
      width: '280px',
      height: '15px',
      progress: 0
    }
  }

  getPropertyValue (s) {
    const computed = window.getComputedStyle(this.root)
    return computed.getPropertyValue(`--${s}`).trim()
  }

  style () {
    const {
      width,
      height
    } = this.props

    return {
      '': {
        display: 'block'
      },

      '.tonic--wrapper': {
        backgroundColor: 'var(--background)',
        width,
        height,
        position: 'relative'
      },

      '.tonic--progress': {
        backgroundColor: 'var(--accent)',
        width: this.props.progress + '%',
        height: '100%',
        transition: 'width 0.2s ease'
      }
    }
  }

  setProgress (progress) {
    this.reRender(props => Object.assign({}, props, {
      progress
    }))
  }

  updated () {
    window.requestAnimationFrame(() => {
      const progressBar = this.root.querySelector('.progress')
      if (progressBar) progressBar.style.width = `${this.props.progress}%`
    })
  }

  render () {
    if (this.props.theme) {
      this.root.classList.add(`tonic--theme--${this.props.theme}`)
    }

    return `
      <div class="tonic--wrapper">
        <div class="tonic--progress"></div>
      </div>
    `
  }
}

Tonic.add(ProgressBar)

class Windowed extends Tonic { /* global Tonic */
  constructor (node) {
    super(node)

    this.root.getRows = () => this.rows
    this.root.load = (rows) => this.load(rows)
    this.root.rePaint = () => this.rePaint()

    const outer = this.root.querySelector('.tonic--windowed--outer')
    outer.addEventListener('scroll', () => this.rePaint(), { passive: true })
  }

  defaults () {
    return {
      page: 100,
      rowsPerPage: 100,
      rowPadding: 50,
      rowHeight: 30,
      debug: false
    }
  }

  style () {
    return {
      '.tonic--windowed--inner': {
        position: 'relative'
      },

      '.tonic--windowed--outer': {
        width: '100%',
        height: 'inherit',
        overflow: 'auto'
      }
    }
  }

  async getRow (idx) {
    const el = this.rows[idx]
    return typeof el === 'function' ? el() : el
  }

  load (rows = []) {
    const outer = this.root.querySelector('.tonic--windowed--outer')
    this.outerHeight = outer.offsetHeight

    this.loaded = true
    this.rows = rows
    this.numPages = Math.ceil(this.rows.length / this.props.rowsPerPage)

    this.pages = this.pages || {}
    this.pagesAvailable = this.pagesAvailable || []
    this.rowHeight = this.props.rowHeight

    const inner = this.root.querySelector('.tonic--windowed--inner')
    inner.style.height = `${this.rowHeight * this.rows.length}px`
    this.pageHeight = this.props.rowsPerPage * this.rowHeight
    this.padding = this.props.rowPadding * this.rowHeight

    this.rePaint()
  }

  setHeight (height, { render } = {}) {
    const outer = this.root.querySelector('.tonic--windowed--outer')
    outer.style.height = height
    this.outerHeight = outer.offsetHeight

    if (render !== false) {
      this.rePaint()
    }
  }

  getPage (i) {
    let page, state

    ;[page, state] = this.pages[i]
      ? [this.pages[i], 'ok']
      : this.pagesAvailable.length
        ? [this.getAvailablePage(i), 'old']
        : [this.createNewPage(i), 'fresh']

    this.pages[i] = page

    page.style.height = i < this.numPages - 1
      ? `${this.pageHeight}px`
      : this.getLastPageHeight()

    page.style.top = this.getPageTop(i)
    return [page, state]
  }

  getAvailablePage (i) {
    const page = this.pagesAvailable.pop()
    const inner = this.root.querySelector('.tonic--windowed--inner')
    inner.appendChild(page)
    return page
  }

  createNewPage (i) {
    const page = document.createElement('div')

    Object.assign(page.style, {
      position: 'absolute',
      minWidth: '100%',
      className: 'tonic--windowed--page'
    })

    if (this.props.debug) {
      const random = Math.random() * 356
      page.style.backgroundColor = `hsla(${random}, 100%, 50%, 0.5)`
    }

    const inner = this.root.querySelector('.tonic--windowed--inner')
    inner.appendChild(page)
    return page
  }

  async rePaint ({ refresh, load } = {}) {
    if (refresh && load !== false) this.load(this.rows)

    const outer = this.root.querySelector('.tonic--windowed--outer')
    const viewStart = outer.scrollTop
    const viewEnd = viewStart + this.outerHeight

    const _start = Math.floor((viewStart - this.padding) / this.pageHeight)
    const start = Math.max(_start, 0) || 0

    const _end = Math.floor((viewEnd + this.padding) / this.pageHeight)
    const end = Math.min(_end, this.numPages - 1)
    const pagesRendered = {}

    for (let i = start; i <= end; i++) {
      const [page, state] = this.getPage(i)

      if (state === 'fresh') {
        await this.fillPage(i)
      } else if (refresh || state === 'old') {
        if (this.updateRow) {
          await this.updatePage(i)
        } else {
          page.innerHTML = ''
          await this.fillPage(i)
        }
      }
      pagesRendered[i] = true
    }

    const inner = this.root.querySelector('.tonic--windowed--inner')

    for (const i of Object.keys(this.pages)) {
      if (pagesRendered[i]) continue

      this.pagesAvailable.push(this.pages[i])
      inner.removeChild(this.pages[i])
      delete this.pages[i]
    }
  }

  getPageTop (i) {
    return `${i * this.pageHeight}px`
  }

  getLastPageHeight (i) {
    return `${(this.rows.length % this.props.rowsPerPage) * this.rowHeight}px`
  }

  async fillPage (i) {
    const page = this.pages[i]
    const frag = document.createDocumentFragment()
    const limit = Math.min((i + 1) * this.props.rowsPerPage, this.rows.length)

    for (let j = i * this.props.rowsPerPage; j < limit; j++) {
      const data = await this.getRow(j)
      if (!data) continue

      const div = document.createElement('div')
      div.innerHTML = this.renderRow(data, j)
      frag.appendChild(div.firstElementChild)
    }

    window.requestAnimationFrame(() => page.appendChild(frag))
  }

  async updatePage (i) {
    const page = this.pages[i]
    const start = i * this.props.rowsPerPage
    const limit = Math.min((i + 1) * this.props.rowsPerPage, this.rows.length)

    const inner = this.root.querySelector('.tonic--windowed--inner')

    if (start > limit) {
      inner.removeChild(page)
      delete this.pages[i]
      return
    }

    for (let j = start, rowIdx = 0; j < limit; j++, rowIdx++) {
      if (page.children[rowIdx] && this.updateRow) {
        this.updateRow(await this.getRow(j), page.children[rowIdx])
      } else {
        const div = document.createElement('div')
        div.innerHTML = this.renderRow(await this.getRow(j))
        page.appendChild(div.firstElementChild)
      }
    }

    while (page.children.length > limit - start) {
      page.removeChild(page.lastChild)
    }
  }

  wrap (render) {
    return `
      ${render()}
      <div class="tonic--windowed--outer">
        <div class="tonic--windowed--inner">
        </div>
      </div>
    `
  }
}

Tonic.Windowed = Windowed
