/*
 license: The MIT License, Copyright (c) 2018 YUKI "Piro" Hiroshi
 original:
   https://github.com/piroor/webextensions-lib-menu-ui
*/
'use strict';

{
  const wait = (aTimeout) => {
    return new Promise((aResolve, _aReject) => {
      setTimeout(aResolve, aTimeout);
    });
  };

  // XPath Utilities
  const hasClass = (aClassName) => {
    return `contains(concat(" ", normalize-space(@class), " "), " ${aClassName} ")`;
  };

  const evaluateXPath = (aExpression, aContext, aType) => {
    if (!aType)
      aType = XPathResult.ORDERED_NODE_SNAPSHOT_TYPE;
    try {
      return (aContext.ownerDocument || aContext).evaluate(
        aExpression,
        (aContext || document),
        null,
        aType,
        null
      );
    }
    catch(_e) {
      return {
        singleNodeValue: null,
        snapshotLength:  0,
        snapshotItem:    function() {
          return null
        }
      };
    }
  };

  const getArrayFromXPathResult = (aXPathResult) => {
    const max   = aXPathResult.snapshotLength;
    const array = new Array(max);
    if (!max)
      return array;

    for (let i = 0; i < max; i++) {
      array[i] = aXPathResult.snapshotItem(i);
    }
    return array;
  };

  class MenuUI {
    constructor(aParams = {}) {
      this.lastHoverItem   = null;
      this.lastFocusedItem = null;

      this.root              = aParams.root;
      this.onCommand         = aParams.onCommand || (() => {});
      this.animationDuration = aParams.animationDuration || 150;
      this.subMenuOpenDelay  = aParams.subMenuOpenDelay || 300;
      this.subMenuCloseDelay = aParams.subMenuCloseDelay || 300;
      this.appearance        = aParams.appearance || 'menu';

      this.onBlur            = this.onBlur.bind(this);
      this.onMouseOver       = this.onMouseOver.bind(this);
      this.onMouseDown       = this.onMouseDown.bind(this);
      this.onMouseUp         = this.onMouseUp.bind(this);
      this.onClick           = this.onClick.bind(this);
      this.onKeyDown         = this.onKeyDown.bind(this);
      this.onKeyUp           = this.onKeyUp.bind(this);
      this.onTransitionEnd   = this.onTransitionEnd.bind(this);
      this.onContextMenu     = this.onContextMenu.bind(this);

      if (!this.root.id)
        this.root.id = `MenuUI-root-${this.uniqueKey}-${parseInt(Math.random() * Math.pow(2, 16))}`;

      this.root.classList.add(this.commonClass);
      this.root.classList.add('menu-ui');
      this.root.classList.add(this.appearance);

      this.screen = document.createElement('div');
      this.screen.classList.add(this.commonClass);
      this.screen.classList.add('menu-ui-blocking-screen');
      this.root.parentNode.insertBefore(this.screen, this.root.nextSibling);

      this.marker = document.createElement('span');
      this.marker.classList.add(this.commonClass);
      this.marker.classList.add('menu-ui-marker');
      this.marker.classList.add(this.appearance);
      this.root.parentNode.insertBefore(this.marker, this.root.nextSibling);
    }

    get opened() {
      return this.root.classList.contains('open');
    }

    updateAccessKey(aItem) {
      const ACCESS_KEY_MATCHER = /(&([^\s]))/i;
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
      else if (/^([^\s])/i.test(aItem.textContent))
        aItem.dataset.subAccessKey = RegExp.$1.toLowerCase();
      else
        aItem.dataset.accessKey = aItem.dataset.subAccessKey = null;
    }

    async open(aOptions = {}) {
      if (this.closeTimeout) {
        clearTimeout(this.closeTimeout);
        delete this.closeTimeout;
        this.onClosed();
      }
      this.canceller = aOptions.canceller;
      this.mouseDownAfterOpen = false;
      this.lastFocusedItem = null;
      this.lastHoverItem = null;
      this.anchor = aOptions.anchor;
      for (const item of Array.from(this.root.querySelectorAll('li:not(.separator)'))) {
        item.tabIndex = 0;
        item.classList.remove('open');
        this.updateAccessKey(item);
        if (item.dataset.icon)
          item.style.backgroundImage = `url(${JSON.stringify(item.dataset.icon)})`;
        else
          item.style.backgroundImage = '';
        if (item.querySelector('ul'))
          item.classList.add('has-submenu');
        else
          item.classList.remove('has-submenu');
      }
      this.root.classList.add('open');
      this.screen.classList.add('open');
      this.marker.classList.remove('top');
      this.marker.classList.remove('bottom');
      if (this.anchor) {
        this.anchor.classList.add('open');
        this.marker.style.transition = `opacity ${this.animationDuration}ms ease-out`;
        this.marker.classList.add('open');
      }
      const menus = [this.root].concat(Array.from(this.root.querySelectorAll('ul')));
      for (const menu of menus) {
        if (this.animationDuration)
          menu.style.transition = `opacity ${this.animationDuration}ms ease-out`;
        else
          menu.style.transition = '';
        this.updatePosition(menu, aOptions);
      }
      return new Promise(async (aResolve, _aReject) => {
        await wait(0);
        if (this.tryCancelOpen()) {
          this.close().then(aResolve);
          return;
        }
        await wait(this.animationDuration);
        if (this.tryCancelOpen()) {
          this.close().then(aResolve);
          return;
        }
        this.root.parentNode.addEventListener('mouseover', this.onMouseOver);
        this.root.addEventListener('transitionend', this.onTransitionEnd);
        window.addEventListener('contextmenu', this.onContextMenu, { capture: true });
        window.addEventListener('mousedown', this.onMouseDown, { capture: true });
        window.addEventListener('mouseup', this.onMouseUp, { capture: true });
        window.addEventListener('click', this.onClick, { capture: true });
        window.addEventListener('keydown', this.onKeyDown, { capture: true });
        window.addEventListener('keyup', this.onKeyUp, { capture: true });
        window.addEventListener('blur', this.onBlur, { capture: true });
        aResolve();
      });
    }

    tryCancelOpen() {
      if (!(typeof this.canceller == 'function'))
        return false;
      try {
        return this.canceller();
      }
      catch(_e) {
      }
      return false;
    }

    updatePosition(aMenu, aOptions = {}) {
      let left = aOptions.left;
      let top  = aOptions.top;
      const containerRect = this.containerRect;
      const menuRect      = aMenu.getBoundingClientRect();

      if (aOptions.anchor &&
        (left === undefined || top === undefined)) {
        const anchorRect = aOptions.anchor.getBoundingClientRect();
        if (containerRect.bottom - anchorRect.bottom >= menuRect.height) {
          top = anchorRect.bottom;
          this.marker.classList.add('top');
          this.marker.style.top = `calc(${top}px - 0.4em)`;
        }
        else if (anchorRect.top - containerRect.top >= menuRect.height) {
          top = Math.max(0, anchorRect.top - menuRect.height);
          this.marker.classList.add('bottom');
          this.marker.style.top = `calc(${top}px + ${menuRect.height}px - 0.6em)`;
        }
        else {
          top = Math.max(0, containerRect.top - menuRect.height);
          this.marker.classList.add('bottom');
          this.marker.style.top = `calc(${top}px + ${menuRect.height}px - 0.6em)`;
        }

        if (containerRect.right - anchorRect.left >= menuRect.width) {
          left = anchorRect.left;
          this.marker.style.left = `calc(${left}px + 0.5em)`;
        }
        else if (anchorRect.left - containerRect.left >= menuRect.width) {
          left = Math.max(0, anchorRect.right - menuRect.width);
          this.marker.style.left = `calc(${left}px + ${menuRect.width}px - 1.5em)`;
        }
        else {
          left = Math.max(0, containerRect.left - menuRect.width);
          this.marker.style.left = `calc(${left}px + ${menuRect.width}px - 1.5em)`;
        }
      }

      if (aMenu.parentNode.localName == 'li') {
        const parentRect = aMenu.parentNode.getBoundingClientRect();
        left = parentRect.right;
        top  = parentRect.top;
      }

      if (left === undefined)
        left = Math.max(0, (containerRect.width - menuRect.width) / 2);
      if (top === undefined)
        top = Math.max(0, (containerRect.height - menuRect.height) / 2);

      if (!aOptions.anchor && aMenu == this.root) {
      // reposition to avoid the menu is opened below the cursor
        if (containerRect.bottom - top < menuRect.height) {
          top = top - menuRect.height;
        }
        if (containerRect.right - left < menuRect.width) {
          left = left - menuRect.width;
        }
      }

      const minMargin = 3;
      left = Math.max(minMargin, Math.min(left, containerRect.width - menuRect.width - minMargin));
      top  = Math.max(minMargin, Math.min(top,  containerRect.height - menuRect.height - minMargin));
      aMenu.style.left = `${left}px`;
      if (aMenu == this.root && this.marker.classList.contains('top'))
        aMenu.style.top = `calc(${top}px + 0.5em)`;
      else if (aMenu == this.root && this.marker.classList.contains('bottom'))
        aMenu.style.top = `calc(${top}px - 0.5em)`;
      else
        aMenu.style.top = `${top}px`;
    }

    async close() {
      if (!this.opened)
        return;
      this.tryCancelOpen();
      this.root.classList.remove('open');
      this.screen.classList.remove('open');
      if (this.anchor) {
        this.anchor.classList.remove('open');
        this.marker.classList.remove('open');
      }
      this.mouseDownAfterOpen = false;
      this.lastFocusedItem = null;
      this.lastHoverItem = null;
      this.anchor = null;
      this.canceller = null;
      return new Promise((aResolve, _aReject) => {
        this.closeTimeout = setTimeout(() => {
          delete this.closeTimeout;
          this.onClosed();
          aResolve();
        }, this.animationDuration);
      });
    }
    onClosed() {
      const menus = [this.root].concat(Array.from(this.root.querySelectorAll('ul')));
      for (const menu of menus) {
        this.updatePosition(menu, { left: 0, right: 0 });
      }
      this.root.parentNode.removeEventListener('mouseover', this.onMouseOver);
      this.root.removeEventListener('transitionend', this.onTransitionEnd);
      window.removeEventListener('contextmenu', this.onContextMenu, { capture: true });
      window.removeEventListener('mousedown', this.onMouseDown, { capture: true });
      window.removeEventListener('mouseup', this.onMouseUp, { capture: true });
      window.removeEventListener('click', this.onClick, { capture: true });
      window.removeEventListener('keydown', this.onKeyDown, { capture: true });
      window.removeEventListener('keyup', this.onKeyUp, { capture: true });
      window.removeEventListener('blur', this.onBlur, { capture: true });
    }

    get containerRect() {
      const x      = 0;
      const y      = 0;
      const width  = window.innerWidth;
      const height = window.innerHeight;
      return {
        x, y, width, height,
        left:   x,
        top:    y,
        right:  width,
        bottom: height
      };
    }

    onBlur(aEvent) {
      if (aEvent.target == document)
        this.close();
    }

    onMouseOver(aEvent) {
      let item = this.getEffectiveItem(aEvent.target);
      if (this.delayedOpen && this.delayedOpen.item != item) {
        clearTimeout(this.delayedOpen.timer);
        this.delayedOpen = null;
      }
      if (item && item.delayedClose) {
        clearTimeout(item.delayedClose);
        item.delayedClose = null;
      }
      if (item && item.classList.contains('separator')) {
        this.lastHoverItem = item;
        item = null;
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
    }

    setHover(aItem) {
      for (const item of Array.from(this.root.querySelectorAll('li.hover'))) {
        if (item != aItem)
          item.classList.remove('hover');
      }
      if (aItem)
        aItem.classList.add('hover');
    }

    openSubmenuFor(aItem) {
      const items = evaluateXPath(
        `ancestor-or-self::li[${hasClass('has-submenu')}]`,
        aItem
      );
      for (const item of getArrayFromXPathResult(items)) {
        item.classList.add('open');
      }
    }

    closeOtherSubmenus(aItem) {
      const items = evaluateXPath(
        `preceding-sibling::li[${hasClass('has-submenu')}] |
       following-sibling::li[${hasClass('has-submenu')}] |
       preceding-sibling::li/descendant::li[${hasClass('has-submenu')}] |
       following-sibling::li/descendant::li[${hasClass('has-submenu')}]`,
        aItem
      );
      for (const item of getArrayFromXPathResult(items)) {
        item.delayedClose = setTimeout(() => {
          item.classList.remove('open');
        }, this.subMenuCloseDelay);
      }
    }

    onMouseDown(aEvent) {
      aEvent.stopImmediatePropagation();
      aEvent.stopPropagation();
      aEvent.preventDefault();
      this.mouseDownAfterOpen = true;
    }

    getEffectiveItem(aNode) {
      const target = aNode.closest('li');
      let untransparentTarget = target && target.closest('ul');
      while (untransparentTarget) {
        if (parseFloat(window.getComputedStyle(untransparentTarget, null).opacity) < 1)
          return null;
        untransparentTarget = untransparentTarget.parentNode.closest('ul');
        if (untransparentTarget == document)
          break;
      }
      return target;
    }

    onMouseUp(aEvent) {
      if (!this.mouseDownAfterOpen &&
        aEvent.target.closest(`#${this.root.id}`))
        this.onClick(aEvent);
    }

    async onClick(aEvent) {
      aEvent.stopImmediatePropagation();
      aEvent.stopPropagation();
      aEvent.preventDefault();

      const target = this.getEffectiveItem(aEvent.target);
      if (!target ||
        target.classList.contains('separator') ||
        target.classList.contains('has-submenu') ||
        target.classList.contains('disabled')) {
        if (!aEvent.target.closest(`#${this.root.id}`))
          return this.close();
        return;
      }

      this.onCommand(target, aEvent);
    }

    getNextFocusedItemByAccesskey(aKey) {
      for (const attribute of ['access-key', 'sub-access-key']) {
        const current = this.lastHoverItem || this.lastFocusedItem || this.root.firstChild;
        const condition = `@data-${attribute}="${aKey.toLowerCase()}"`;
        const item = this.getNextItem(current, condition);
        if (item)
          return item;
      }
      return null;
    }

    onKeyDown(aEvent) {
      switch (aEvent.key) {
        case 'ArrowUp':
          aEvent.stopPropagation();
          aEvent.preventDefault();
          this.advanceFocus(-1);
          break;

        case 'ArrowDown':
          aEvent.stopPropagation();
          aEvent.preventDefault();
          this.advanceFocus(1);
          break;

        case 'ArrowRight':
          aEvent.stopPropagation();
          aEvent.preventDefault();
          this.digIn();
          break;

        case 'ArrowLeft':
          aEvent.stopPropagation();
          aEvent.preventDefault();
          this.digOut();
          break;

        case 'Home':
          aEvent.stopPropagation();
          aEvent.preventDefault();
          this.advanceFocus(1, (
            this.lastHoverItem && this.lastHoverItem.parentNode ||
          this.lastFocusedItem && this.lastFocusedItem.parentNode ||
          this.root
          ).lastChild);
          break;

        case 'End':
          aEvent.stopPropagation();
          aEvent.preventDefault();
          this.advanceFocus(-1, (
            this.lastHoverItem && this.lastHoverItem.parentNode ||
          this.lastFocusedItem && this.lastFocusedItem.parentNode ||
          this.root
          ).firstChild);
          break;

        case 'Enter': {
          aEvent.stopPropagation();
          aEvent.preventDefault();
          const targetItem = this.lastHoverItem || this.lastFocusedItem;
          if (targetItem) {
            if (targetItem.classList.contains('disabled'))
              this.close();
            else if (!targetItem.classList.contains('separator'))
              this.onCommand(targetItem, aEvent);
          }
        }; break;

        case 'Escape': {
          aEvent.stopPropagation();
          aEvent.preventDefault();
          const targetItem = this.lastHoverItem || this.lastFocusedItem;
          if (!targetItem ||
            targetItem.parentNode == this.root)
            this.close();
          else
            this.digOut();
        }; break;

        default:
          if (aEvent.key.length == 1) {
            const item = this.getNextFocusedItemByAccesskey(aEvent.key);
            if (item) {
              this.lastFocusedItem = item;
              this.lastFocusedItem.focus();
              this.setHover(null);
              if (this.getNextFocusedItemByAccesskey(aEvent.key) == item)
                this.onCommand(item, aEvent);
            }
          }
          return;
      }
    }

    onKeyUp(aEvent) {
      switch (aEvent.key) {
        case 'ArrowUp':
        case 'ArrowDown':
        case 'ArrowRight':
        case 'ArrowLeft':
        case 'Home':
        case 'End':
        case 'Enter':
        case 'Escape':
          aEvent.stopPropagation();
          aEvent.preventDefault();
          return;

        default:
          if (aEvent.key.length == 1 &&
            this.getNextFocusedItemByAccesskey(aEvent.key)) {
            aEvent.stopPropagation();
            aEvent.preventDefault();
          }
          return;
      }
    }

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
    }

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
    }

    advanceFocus(aDirection, aLastFocused = null) {
      aLastFocused = aLastFocused || this.lastHoverItem || this.lastFocusedItem;
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
      this.lastHoverItem = this.lastFocusedItem;
      this.setHover(null);
    }

    digIn() {
      if (!this.lastFocusedItem) {
        this.advanceFocus(1, this.root.lastChild);
        return;
      }
      const submenu = this.lastFocusedItem.querySelector('ul');
      if (!submenu || this.lastFocusedItem.classList.contains('disabled'))
        return;
      this.closeOtherSubmenus(this.lastFocusedItem);
      this.openSubmenuFor(this.lastFocusedItem);
      this.advanceFocus(1, submenu.lastChild);
    }

    digOut() {
      const targetItem = this.lastHoverItem || this.lastFocusedItem;
      if (!targetItem ||
        targetItem.parentNode == this.root)
        return;
      this.closeOtherSubmenus(targetItem);
      this.lastFocusedItem = targetItem.parentNode.parentNode;
      this.closeOtherSubmenus(this.lastFocusedItem);
      this.lastFocusedItem.classList.remove('open');
      this.lastFocusedItem.focus();
      this.lastHoverItem = this.lastFocusedItem;
      this.setHover(null);
    }

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
      this.lastHoverItem = item;
    }

    onContextMenu(aEvent) {
      aEvent.stopImmediatePropagation();
      aEvent.stopPropagation();
      aEvent.preventDefault();
    }


    static installStyles() {
      this.style = document.createElement('style');
      this.style.setAttribute('type', 'text/css');
      const common = `.${this.commonClass}`;
      this.style.textContent = `
        ${common}.menu-ui,
        ${common}.menu-ui ul {
          background-color: var(--menu-ui-background-color);
          color: var(--menu-ui-text-color);
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

        ${common}.menu-ui.open,
        ${common}.menu-ui li.open > ul {
          opacity: 1;
          pointer-events: auto;
        }

        ${common}.menu-ui li {
          list-style: none;
          margin: 0;
          padding: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        ${common}.menu-ui li:not(.separator):focus,
        ${common}.menu-ui li:not(.separator).open {
          background-color: var(--menu-ui-background-color-active);
          color: var(--menu-ui-text-color-active);
        }

        ${common}.menu-ui li.radio.checked::before,
        ${common}.menu-ui li.checkbox.checked::before {
          content: "✔";
          position: absolute;
          left: 0.25em;
        }

        ${common}.menu-ui li.separator {
          height: 0.5em;
          visibility: hidden;
          margin: 0;
          padding: 0;
        }

        ${common}.menu-ui li.has-submenu {
          padding-right: 1.5em;
        }
        ${common}.menu-ui li.has-submenu::after {
          content: "❯";
          position: absolute;
          right: 0.25em;
          transform: scale(0.75);
        }

        ${common}.menu-ui .accesskey {
          text-decoration: underline;
        }

        ${common}.menu-ui-blocking-screen {
          display: none;
        }

        ${common}.menu-ui-blocking-screen.open {
          bottom: 0;
          display: block;
          left: 0;
          position: fixed;
          right: 0;
          top: 0;
          z-index: 899999;
        }

        ${common}.menu-ui.menu li:not(.separator):focus,
        ${common}.menu-ui.menu li:not(.separator).open {
          outline: none;
        }

        ${common}.menu-ui.panel li:not(.separator):focus ul li:not(:focus):not(.open),
        ${common}.menu-ui.panel li:not(.separator).open ul li:not(:focus):not(.open) {
          background-color: transparent;
          color: var(--menu-ui-text-color);
        }

        ${common}.menu-ui-marker {
          opacity: 0;
          pointer-events: none;
          position: fixed;
        }

        ${common}.menu-ui-marker.open {
          border: 0.5em solid transparent;
          content: "";
          height: 0;
          left: 0;
          opacity: 1;
          top: 0;
          width: 0;
          z-index: 999999;
        }

        ${common}.menu-ui-marker.top {
          border-bottom: 0.5em solid var(--menu-ui-background-color);
        }
        ${common}.menu-ui-marker.bottom {
          border-top: 0.5em solid var(--menu-ui-background-color);
        }

        ${common}.menu-ui li.disabled {
          opacity: 0.5;
        }

        ${common}.menu-ui li[data-icon] {
          background-position: left center;
          background-repeat: no-repeat;
          background-size: 16px;
        }

        /* panel-like appearance */
        ${common}.panel {
          --menu-ui-background-color: -moz-dialog;
          --menu-ui-text-color: -moz-dialogtext;
          --menu-ui-background-color-active: Highlight;
          --menu-ui-text-color-active: HighlightText;
        }
        ${common}.panel li.disabled {
          --menu-ui-background-color-active: InactiveCaptionText;
          --menu-ui-text-color-active: InactiveCaption;
        }
        ${common}.menu-ui.panel,
        ${common}.menu-ui.panel ul {
          box-shadow: 0.1em 0.1em 0.8em rgba(0, 0, 0, 0.65);
          padding: 0.25em 0;
        }

        ${common}.menu-ui.panel li {
          padding: 0.15em 1em;
        }


        /* Menu-like appearance */
        ${common}.menu {
          --menu-ui-background-color: Menu;
          --menu-ui-text-color: MenuText;
          --menu-ui-background-color-active: Highlight;
          --menu-ui-text-color-active: HighlightText;
        }
        ${common}.menu li.disabled {
          --menu-ui-background-color-active: InactiveCaptionText;
          --menu-ui-text-color-active: InactiveCaption;
        }
        ${common}.menu-ui.menu,
        ${common}.menu-ui.menu ul {
          border: 1px outset Menu;
          box-shadow: 0.1em 0.1em 0.5em rgba(0, 0, 0, 0.65);
          font: -moz-pull-down-menu;
        }

        ${common}.menu-ui.menu li {
          padding: 0.15em 0.5em 0.15em 1.5em;
        }

        ${common}.menu-ui.menu li.separator {
          border: 1px inset Menu;
          height: 0;
          margin: 0 0.5em;
          max-height: 0;
          opacity: 0.5;
          padding: 0;
          visibility: visible;
        }

        ${common}.menu-ui.menu li[data-icon] {
          background-position: calc(1em - 16px + 0.5em) center;
        }
      `;
      document.head.appendChild(this.style);
    }
  };

  MenuUI.uniqueKey   = parseInt(Math.random() * Math.pow(2, 16));
  MenuUI.commonClass = `menu-ui-${MenuUI.uniqueKey}`;

  MenuUI.prototype.uniqueKey   = MenuUI.uniqueKey;
  MenuUI.prototype.commonClass = MenuUI.commonClass;

  MenuUI.installStyles();

  window.MenuUI = MenuUI;
}
