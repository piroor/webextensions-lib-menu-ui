/*
 license: The MIT License, Copyright (c) 2018 YUKI "Piro" Hiroshi
 original:
   https://github.com/piroor/webextensions-lib-menu-ui
*/
'use strict';

{
const MenuUI = function(aParams = {}) {
  this.root              = aParams.root;
  this.onCommand         = aParams.onCommand || (() => {});
  this.animationDuration = aParams.animationDuration || 0;
  this.subMenuOpenDelay  = aParams.subMenuOpenDelay || 300;
  this.subMenuCloseDelay = aParams.subMenuCloseDelay || 300;
  this.appearance        = aParams.appearance || 'menu';

  this.onBlur            = this.onBlur.bind(this);
  this.onMouseOver       = this.onMouseOver.bind(this);
  this.onMouseDown       = this.onMouseDown.bind(this);
  this.onClick           = this.onClick.bind(this);
  this.onKeyPress        = this.onKeyPress.bind(this);
  this.onTransitionEnd   = this.onTransitionEnd.bind(this);

  this.root.classList.add(`menu-ui-${this.uniqueKey}`);
  this.root.classList.add(this.appearance);

  this.screen = document.createElement('div');
  this.screen.classList.add(`menu-ui-${this.uniqueKey}-blocking-screen`);
  this.root.parentNode.insertBefore(this.screen, this.root.nextSibling);
};

MenuUI.uniqueKey = parseInt(Math.random() * Math.pow(2, 16));

MenuUI.prototype = {
  uniqueKey: MenuUI.uniqueKey,

  lastFocusedItem: null,

  updateAccessKey(aItem) {
    const ACCESS_KEY_MATCHER = /(&([a-z]))/i;
    const title = aItem.getAttribute('title');
    if (title)
      aItem.setAttribute('title', title.replace(ACCESS_KEY_MATCHER, '$2'));
    const label = evaluateXPath('child::text()', aItem, XPathResult.STRING_TYPE).stringValue;
    const matchedKey = label.match(ACCESS_KEY_MATCHER);
    if (matchedKey) {
      const textNode = evaluateXPath(
        `child::node()[contains(self::text(), "${matchedKey[1]}")]`,
        aItem,
        XPathResult.FIRST_ORDERED_NODE_TYPE
      ).singleNodeValue;
      if (textNode) {
        const range = document.createRange();
        const startPosition = textNode.nodeValue.indexOf(matchedKey[1]);
        range.setStart(textNode, startPosition);
        range.setEnd(textNode, startPosition + 2);
        range.deleteContents();
        const accessKeyNode = document.createElement('span');
        accessKeyNode.classList.add('accesskey');
        accessKeyNode.textContent = matchedKey[2];
        range.insertNode(accessKeyNode);
        range.detach();
      }
      aItem.dataset.accessKey = matchedKey[2].toLowerCase();
    }
    else if (/^([a-z])/i.test(aItem.textContent))
      aItem.dataset.subAccessKey = RegExp.$1.toLowerCase();
    else
      aItem.dataset.accessKey = aItem.dataset.subAccessKey = null;
  },

  open: async function(aOptions = {}) {
    if (this.closeTimeout) {
      clearTimeout(this.closeTimeout);
      delete this.closeTimeout;
      this.onClosed();
    }
    this.lastFocusedItem = null;
    for (let item of Array.slice(this.root.querySelectorAll('li:not(.separator)'))) {
      item.tabIndex = 0;
      item.classList.remove('open');
      this.updateAccessKey(item);
      if (item.querySelector('ul'))
        item.classList.add('has-submenu');
      else
        item.classList.remove('has-submenu');
    }
    this.root.classList.add('open');
    const menus = [this.root].concat(Array.slice(this.root.querySelectorAll('ul')));
    for (let menu of menus) {
      if (this.animationDuration)
        menu.style.transition = `opacity ${this.animationDuration}ms ease-out`;
      else
        menu.style.transition = '';
      this.updatePosition(menu, aOptions);
    }
    setTimeout(() => {
      this.root.parentNode.addEventListener('mouseover', this.onMouseOver);
      this.root.addEventListener('transitionend', this.onTransitionEnd);
      window.addEventListener('mousedown', this.onMouseDown, { capture: true });
      window.addEventListener('click', this.onClick, { capture: true });
      window.addEventListener('keypress', this.onKeyPress, { capture: true });
      window.addEventListener('blur', this.onBlur, { capture: true });
    }, this.animationDuration);
  },

  updatePosition(aMenu, aOptions = {}) {
    var left = aOptions.left;
    var top  = aOptions.top;

    if (aMenu.parentNode.localName == 'li') {
      let parentRect = aMenu.parentNode.getBoundingClientRect();
      left = parentRect.right;
      top  = parentRect.top;
    }

    let menuRect = aMenu.getBoundingClientRect();
    let containerRect = this.containerRect;
    left = left || Math.max(0, (containerRect.width - menuRect.width) / 2);
    top  = top  || Math.max(0, (containerRect.height - menuRect.height) / 2);

    left = Math.min(left, containerRect.width - menuRect.width - 3);
    top  = Math.min(top,  containerRect.height - menuRect.height - 3);
    aMenu.style.left = `${left}px`;
    aMenu.style.top  = `${top}px`;
  },

  close: async function() {
    if (!this.root.classList.contains('open'))
      return;
    this.root.classList.remove('open');
    this.lastFocusedItem = null;
    return new Promise((aResolve, aReject) => {
      this.closeTimeout = setTimeout(() => {
        delete this.closeTimeout;
        this.onClosed();
        aResolve();
      }, this.animationDuration);
    });
  },
  onClosed() {
    const menus = [this.root].concat(Array.slice(this.root.querySelectorAll('ul')));
    for (let menu of menus) {
      this.updatePosition(menu, { left: 0, right: 0 });
    }
    this.root.parentNode.removeEventListener('mouseover', this.onMouseOver);
    this.root.removeEventListener('transitionend', this.onTransitionEnd);
    window.removeEventListener('mousedown', this.onMouseDown, { capture: true });
    window.removeEventListener('click', this.onClick, { capture: true });
    window.removeEventListener('keypress', this.onKeyPress, { capture: true });
    window.removeEventListener('blur', this.onBlur, { capture: true });
  },

  get containerRect() {
    var allRange = document.createRange();
    allRange.selectNodeContents(document.body);
    var containerRect = allRange.getBoundingClientRect();
    allRange.detach();
    // because the contianer box can be shifted to hide scrollbar
    var dummyTabsRect = document.querySelector('#dummy-tabs').getBoundingClientRect();
    return {
      x:      dummyTabsRect.x,
      y:      containerRect.y,
      width:  dummyTabsRect.width,
      height: containerRect.height,
      top:    containerRect.top,
      right:  dummyTabsRect.right,
      bottom: containerRect.bottom,
      left:   dummyTabsRect.left
    };
  },

  onBlur(aEvent) {
    if (!aEvent.target.closest ||
        !aEvent.target.closest(`#${this.root.id}`))
      this.close();
  },

  onMouseOver(aEvent) {
    const item = this.getEffectiveItem(aEvent.target);
    if (this.delayedOpen && this.delayedOpen.item != item) {
      clearTimeout(this.delayedOpen.timer);
      this.delayedOpen = null;
    }
    if (item && item.delayedClose) {
      clearTimeout(item.delayedClose);
      item.delayedClose = null;
    }
    if (!item) {
      if (this.lastFocusedItem) {
        if (this.lastFocusedItem.parentNode != this.root) {
          this.lastFocusedItem = this.lastFocusedItem.parentNode.parentNode;
          this.lastFocusedItem.focus();
        }
        else {
          this.lastFocusedItem.blur();
          this.lastFocusedItem = null;
        }
      }
      this.setHover(null);
      return;
    }

    this.setHover(item);
    this.closeOtherSubmenus(item);
    item.focus();
    this.lastFocusedItem = item;

    this.delayedOpen = {
      item:  item,
      timer: setTimeout(() => {
        this.delayedOpen = null;
        this.openSubmenuFor(item);
      }, this.subMenuOpenDelay)
    };
  },

  setHover(aItem) {
    for (let item of Array.slice(this.root.querySelectorAll('li.hover'))) {
      if (item != aItem)
        item.classList.remove('hover');
    }
    if (aItem)
      aItem.classList.add('hover');
  },

  openSubmenuFor(aItem) {
    const items = evaluateXPath(
      `ancestor-or-self::li[${hasClass('has-submenu')}]`,
      aItem
    );
    for (let item of getArrayFromXPathResult(items)) {
      item.classList.add('open');
    }
  },

  closeOtherSubmenus(aItem) {
    const items = evaluateXPath(
      `preceding-sibling::li[${hasClass('has-submenu')}] |
       following-sibling::li[${hasClass('has-submenu')}] |
       preceding-sibling::li/descendant::li[${hasClass('has-submenu')}] |
       following-sibling::li/descendant::li[${hasClass('has-submenu')}]`,
      aItem
    );
    for (let item of getArrayFromXPathResult(items)) {
      item.delayedClose = setTimeout(() => {
        item.classList.remove('open');
      }, this.subMenuCloseDelay);
    }
  },

  onMouseDown(aEvent) {
    aEvent.stopImmediatePropagation();
    aEvent.stopPropagation();
    aEvent.preventDefault();
  },

  getEffectiveItem(aNode) {
    var target = aNode.closest('li');
    var untransparentTarget = target;
    while (untransparentTarget) {
      if (parseFloat(window.getComputedStyle(untransparentTarget, null).opacity) < 1)
        return null;
      untransparentTarget = untransparentTarget.parentNode;
      if (untransparentTarget == document)
        break;
    }
    return target;
  },

  onClick: async function(aEvent) {
    if (aEvent.button != 0)
      return this.close();

    aEvent.stopImmediatePropagation();
    aEvent.stopPropagation();
    aEvent.preventDefault();

    var target = this.getEffectiveItem(aEvent.target);
    if (!target ||
        target.classList.contains('has-submenu') ||
        !target.id) {
      let elementTarget = aEvent.target;
      if (elementTarget.nodeType != Node.ELEMENT_NODE)
        elementTarget = elementTarget.parentNode;
      if (!elementTarget.matches(`#${this.root.id} *`))
        return this.close();
      return;
    }

    this.onCommand(target, aEvent);
  },

  onKeyPress(aEvent) {
    switch (aEvent.keyCode) {
      case aEvent.DOM_VK_UP:
        aEvent.stopPropagation();
        aEvent.preventDefault();
        this.advanceFocus(-1);
        break;

      case aEvent.DOM_VK_DOWN:
        aEvent.stopPropagation();
        aEvent.preventDefault();
        this.advanceFocus(1);
        break;

      case aEvent.DOM_VK_RIGHT:
        aEvent.stopPropagation();
        aEvent.preventDefault();
        this.digIn();
        break;

      case aEvent.DOM_VK_LEFT:
        aEvent.stopPropagation();
        aEvent.preventDefault();
        this.digOut();
        break;

      case aEvent.DOM_VK_HOME:
        aEvent.stopPropagation();
        aEvent.preventDefault();
        this.advanceFocus(1, (this.lastFocusedItem && this.lastFocusedItem.parentNode || this.root).lastChild);
        break;

      case aEvent.DOM_VK_END:
        aEvent.stopPropagation();
        aEvent.preventDefault();
        this.advanceFocus(-1, (this.lastFocusedItem && this.lastFocusedItem.parentNode || this.root).firstChild);
        break;

      case aEvent.DOM_VK_ENTER:
      case aEvent.DOM_VK_RETURN:
        aEvent.stopPropagation();
        aEvent.preventDefault();
        if (this.lastFocusedItem)
          this.onCommand(this.lastFocusedItem, aEvent);
        break;

      case aEvent.DOM_VK_ESCAPE:
        aEvent.stopPropagation();
        aEvent.preventDefault();
        this.close();
        break;

      default:
        if (aEvent.key) {
          for (let attribute of ['access-key', 'sub-access-key']) {
            const current = this.lastFocusedItem || this.root.firstChild;
            const condition = `@data-${attribute}="${aEvent.key.toLowerCase()}"`;
            const item = this.getNextItem(current, condition);
            if (item) {
              this.lastFocusedItem = item;
              this.lastFocusedItem.focus();
              this.setHover(null);
              if (this.getNextItem(item, condition) == item)
                this.onCommand(item, aEvent);
              break;
            }
          }
        }
        return;
    }
  },

  getPreviousItem(aBase, aCondition = '') {
    const extraCondition = aCondition ? `[${aCondition}]` : '' ;
    const item = (
      evaluateXPath(
        `preceding-sibling::li[not(${hasClass('separator')})]${extraCondition}[1]`,
        aBase,
        XPathResult.FIRST_ORDERED_NODE_TYPE
      ).singleNodeValue ||
      evaluateXPath(
        `following-sibling::li[not(${hasClass('separator')})]${extraCondition}[last()]`,
        aBase,
        XPathResult.FIRST_ORDERED_NODE_TYPE
      ).singleNodeValue ||
      evaluateXPath(
        `self::li[not(${hasClass('separator')})]${extraCondition}`,
        aBase,
        XPathResult.FIRST_ORDERED_NODE_TYPE
      ).singleNodeValue
    );
    if (window.getComputedStyle(item, null).display == 'none')
      return this.getPreviousItem(item, aCondition);
    return item;
  },

  getNextItem(aBase, aCondition = '') {
    const extraCondition = aCondition ? `[${aCondition}]` : '' ;
    const item = (
      evaluateXPath(
        `following-sibling::li[not(${hasClass('separator')})]${extraCondition}[1]`,
        aBase,
        XPathResult.FIRST_ORDERED_NODE_TYPE
      ).singleNodeValue ||
      evaluateXPath(
        `preceding-sibling::li[not(${hasClass('separator')})]${extraCondition}[last()]`,
        aBase,
        XPathResult.FIRST_ORDERED_NODE_TYPE
      ).singleNodeValue ||
      evaluateXPath(
        `self::li[not(${hasClass('separator')})]${extraCondition}`,
        aBase,
        XPathResult.FIRST_ORDERED_NODE_TYPE
      ).singleNodeValue
    );
    if (item && window.getComputedStyle(item, null).display == 'none')
      return this.getNextItem(item, aCondition);
    return item;
  },

  advanceFocus(aDirection, aLastFocused = null) {
    aLastFocused = aLastFocused || this.lastFocusedItem;
    if (!aLastFocused) {
      if (aDirection < 0)
        this.lastFocusedItem = aLastFocused = this.root.firstChild;
      else
        this.lastFocusedItem = aLastFocused = this.root.lastChild;
    }
    if (aDirection < 0)
      this.lastFocusedItem = this.getPreviousItem(aLastFocused);
    else
      this.lastFocusedItem = this.getNextItem(aLastFocused);
    this.lastFocusedItem.focus();
    this.setHover(null);
  },

  digIn() {
    if (!this.lastFocusedItem) {
      this.advanceFocus(1, this.root.lastChild);
      return;
    }
    const submenu = this.lastFocusedItem.querySelector('ul');
    if (!submenu)
      return;
    this.closeOtherSubmenus(this.lastFocusedItem);
    this.openSubmenuFor(this.lastFocusedItem);
    this.advanceFocus(1, submenu.lastChild);
  },

  digOut() {
    if (!this.lastFocusedItem ||
        this.lastFocusedItem.parentNode == this.root)
      return;
    this.closeOtherSubmenus(this.lastFocusedItem);
    this.lastFocusedItem = this.lastFocusedItem.parentNode.parentNode;
    this.closeOtherSubmenus(this.lastFocusedItem);
    this.lastFocusedItem.classList.remove('open');
    this.lastFocusedItem.focus();
    this.setHover(null);
  },

  onTransitionEnd(aEvent) {
    const hoverItems = this.root.querySelectorAll('li:hover');
    if (hoverItems.length == 0)
      return;
    const lastHoverItem = hoverItems[hoverItems.length - 1];
    const item = this.getEffectiveItem(lastHoverItem);
    if (!item)
      return;
    if (item.parentNode != aEvent.target)
      return;
    this.setHover(item);
    item.focus();
    this.lastFocusedItem = item;
  }
};

MenuUI.installStyles = function() {
  this.style = document.createElement('style');
  this.style.setAttribute('type', 'text/css');
  this.style.textContent = `
    .menu-ui-${this.uniqueKey},
    .menu-ui-${this.uniqueKey} ul {
      margin: 0;
      max-height: calc(100% - 6px);
      max-width: calc(100% - 6px);
      opacity: 0;
      overflow: auto;
      padding: 0;
      pointer-events: none;
      position: fixed;
      z-index: 999999;
    }

    .menu-ui-${this.uniqueKey}.open,
    .menu-ui-${this.uniqueKey} li.open > ul {
      opacity: 1;
      pointer-events: auto;
    }

    .menu-ui-${this.uniqueKey} li {
      list-style: none;
      margin: 0;
      padding: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .menu-ui-${this.uniqueKey} li.radio.checked::before,
    .menu-ui-${this.uniqueKey} li.checkbox.checked::before {
      content: "✔";
      position: absolute;
      left: 0.25em;
    }

    .menu-ui-${this.uniqueKey} li.separator {
      height: 0.5em;
      visibility: hidden;
      margin: 0;
      padding: 0;
      pointer-events: none;
    }

    .menu-ui-${this.uniqueKey} li.has-submenu {
      padding-right: 1.5em;
    }
    .menu-ui-${this.uniqueKey} li.has-submenu::after {
      content: ">";
      position: absolute;
      right: 0.5em;
    }

    .menu-ui-${this.uniqueKey} .accesskey {
      text-decoration: underline;
    }

    .menu-ui-${this.uniqueKey}-blocking-screen {
      display: none;
    }

    .menu-ui-${this.uniqueKey}.open + .menu-ui-${this.uniqueKey}-blocking-screen {
      bottom: 0;
      display: block;
      left: 0;
      position: fixed;
      right: 0;
      top: 0;
      z-index: 899999;
    }

    .menu-ui-${this.uniqueKey}.menu li:not(.separator):focus,
    .menu-ui-${this.uniqueKey}.menu li:not(.separator).open {
      outline: none;
    }

    .menu-ui-${this.uniqueKey}.panel li:not(.separator):focus ul li:not(:focus):not(.open),
    .menu-ui-${this.uniqueKey}.panel li:not(.separator).open ul li:not(:focus):not(.open) {
      background: transparent;
    }

    /* panel-like appearance */
    .menu-ui-${this.uniqueKey}.panel,
    .menu-ui-${this.uniqueKey}.panel ul {
      background: -moz-dialog;
      border-radius: 0.5em;
      box-shadow: 0.1em 0.1em 0.5em rgba(0, 0, 0, 0.65);
      color: -moz-dialogtext;
      padding: 0.5em 0;
    }

    .menu-ui-${this.uniqueKey}.panel li {
      padding: 0.15em 1em;
    }

    .menu-ui-${this.uniqueKey}.panel li:not(.separator):focus,
    .menu-ui-${this.uniqueKey}.panel li:not(.separator).open {
      background: Highlight;
      color: HighlightText;
    }

    .menu-ui-${this.uniqueKey}.panel li:not(.separator):focus ul li:not(:focus):not(.open),
    .menu-ui-${this.uniqueKey}.panel li:not(.separator).open ul li:not(:focus):not(.open) {
      color: -moz-dialogtext;
    }

    /* Menu-like appearance */
    .menu-ui-${this.uniqueKey}.menu,
    .menu-ui-${this.uniqueKey}.menu ul {
      background: Menu;
      border: 1px outset Menu;
      box-shadow: 0.1em 0.1em 0.5em rgba(0, 0, 0, 0.65);
      color: MenuText;
      font: -moz-pull-down-menu;
    }

    .menu-ui-${this.uniqueKey}.menu li {
      padding: 0.15em 0.5em 0.15em 1.5em;
    }

    .menu-ui-${this.uniqueKey}.menu li.separator {
      border: 1px inset Menu;
      height: 0;
      margin: 0 0.5em;
      max-height: 0;
      opacity: 0.5;
      visibility: visible;
    }

    .menu-ui-${this.uniqueKey}.menu li:not(.separator):focus,
    .menu-ui-${this.uniqueKey}.menu li:not(.separator).open {
      background: Highlight;
      color: HighlightText;
    }

    .menu-ui-${this.uniqueKey}.menu li:not(.separator):focus ul li:not(:focus):not(.open),
    .menu-ui-${this.uniqueKey}.menu li:not(.separator).open ul li:not(:focus):not(.open) {
      color: MenuText;
    }
  `;
  document.head.appendChild(this.style);
};

MenuUI.installStyles();

window.MenuUI = MenuUI;

// XPath Utilities
const hasClass = (aClassName) => {
  return `contains(concat(" ", normalize-space(@class), " "), " ${aClassName} ")`;
};

const evaluateXPath = (aExpression, aContext, aType) => {
  if (!aType)
    aType = XPathResult.ORDERED_NODE_SNAPSHOT_TYPE;
  try {
    var result = (aContext.ownerDocument || aContext).evaluate(
      aExpression,
      (aContext || document),
      null,
      aType,
      null
    );
  }
  catch(e) {
    return {
      singleNodeValue: null,
      snapshotLength:  0,
      snapshotItem:    function() {
        return null
      }
    };
  }
  return result;
};

const getArrayFromXPathResult = (aXPathResult) => {
  var max   = aXPathResult.snapshotLength;
  var array = new Array(max);
  if (!max)
    return array;

  for (var i = 0; i < max; i++) {
    array[i] = aXPathResult.snapshotItem(i);
  }
  return array;
};
}
