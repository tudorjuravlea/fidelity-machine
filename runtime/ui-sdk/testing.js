// UI SDK 0.1.0-beta.10 testing kit (@ui-sdk/core/dist/testing.js), bundled into one script by scripts/ui-sdk.mjs.
// Apache-2.0, see LICENSE in this folder. A copy: never edited by hand.
var __uiSdkTesting = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // ../../../../../../private/var/folders/kh/4q17my9s6bjbn8rw5mscpwmr0000gn/T/ui-sdk-pack-ugM7HV/core/package/dist/testing.js
  var testing_exports = {};
  __export(testing_exports, {
    checkDirection: () => checkDirection,
    checkPattern: () => checkPattern,
    checkServer: () => checkServer,
    mount: () => mount,
    partAttrs: () => attrs,
    partPresent: () => present,
    partState: () => partState,
    setPlatform: () => setPlatform,
    settle: () => settle
  });

  // ../../../../../../private/var/folders/kh/4q17my9s6bjbn8rw5mscpwmr0000gn/T/ui-sdk-pack-ugM7HV/core/package/dist/foundation/kernel/dev-stub.js
  var dev = false;
  function warn(_message, _from, _detail) {
  }
  function checkRole(_definition, _slot, _own, _role, _from, _live) {
  }
  function checkFocus(_focus, _slot, _el, _from) {
  }
  function checkMarks(_elements, _marks) {
  }

  // ../../../../../../private/var/folders/kh/4q17my9s6bjbn8rw5mscpwmr0000gn/T/ui-sdk-pack-ugM7HV/core/package/dist/foundation/platform/style.js
  var adopted = () => globalThis[/* @__PURE__ */ Symbol.for("ui-sdk.styles@1")] ??= /* @__PURE__ */ new WeakMap();
  var nonces = /* @__PURE__ */ new WeakMap();
  function pageNonce(doc) {
    if (nonces.has(doc)) {
      return nonces.get(doc);
    }
    let meta;
    for (let at = doc; at && !meta; at = at.defaultView?.frameElement?.ownerDocument) {
      meta = at.head?.querySelector('meta[property="csp-nonce"]');
    }
    const nonce = meta ? meta.nonce || meta.getAttribute("nonce") || "" : null;
    nonces.set(doc, nonce);
    return nonce;
  }
  function writeStyle(doc, id, css) {
    if (!doc.head) {
      return;
    }
    const view2 = doc.defaultView;
    if (pageNonce(doc) === "" && view2 && "adoptedStyleSheets" in doc) {
      adoptStyle(doc, view2, id, css);
    } else {
      appendStyle(doc, id, css);
    }
  }
  var styleText = /* @__PURE__ */ new WeakMap();
  function appendStyle(doc, id, css) {
    const existing = doc.getElementById(id);
    if (existing) {
      if (styleText.get(existing) === css) {
        return;
      }
      if (existing.textContent !== css) {
        existing.textContent = css;
      }
      styleText.set(existing, css);
      return;
    }
    const style = doc.createElement("style");
    style.id = id;
    const nonce = pageNonce(doc);
    if (nonce) {
      style.nonce = nonce;
    }
    style.textContent = css;
    styleText.set(style, css);
    const ours = doc.head.querySelectorAll(':scope > style[id^="ui-sdk-"]');
    if (ours.length) {
      ours[ours.length - 1].after(style);
    } else {
      doc.head.prepend(style);
    }
  }
  function adoptStyle(doc, view2, id, css) {
    let sheets = adopted().get(doc);
    if (!sheets) {
      adopted().set(doc, sheets = /* @__PURE__ */ new Map());
    }
    let entry = sheets.get(id);
    if (!entry) {
      sheets.set(id, entry = { sheet: new view2.CSSStyleSheet(), css: "" });
    }
    if (entry.css !== css) {
      entry.sheet.replaceSync(css);
      entry.css = css;
    }
    if (!doc.adoptedStyleSheets.includes(entry.sheet)) {
      doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, entry.sheet];
    }
  }
  function enforceHidden(doc) {
    writeStyle(
      doc,
      "ui-sdk-hidden",
      '@layer ui-sdk { :where([data-slot][hidden]:not([hidden="until-found"])) { display: none !important } }'
    );
  }

  // ../../../../../../private/var/folders/kh/4q17my9s6bjbn8rw5mscpwmr0000gn/T/ui-sdk-pack-ugM7HV/core/package/dist/foundation/kernel/events.js
  function on(target, type2, listener, options) {
    target.addEventListener(type2, listener, options);
    return () => target.removeEventListener(type2, listener, options);
  }
  function isComposing(event) {
    const key = "nativeEvent" in event ? event.nativeEvent : event;
    return key.isComposing === true || key.keyCode === 229;
  }

  // ../../../../../../private/var/folders/kh/4q17my9s6bjbn8rw5mscpwmr0000gn/T/ui-sdk-pack-ugM7HV/core/package/dist/foundation/kernel/store.js
  var held = /* @__PURE__ */ new WeakMap();
  function subscribeSkipping(store, skip, listener) {
    return join(held.get(store).skipping, skip, listener);
  }
  function join(groups, group, listener) {
    let members = groups.get(group);
    if (!members) {
      groups.set(group, members = /* @__PURE__ */ new Set());
    }
    members.add(listener);
    return () => {
      members.delete(listener);
      if (!members.size && groups.get(group) === members) {
        groups.delete(group);
      }
    };
  }
  var renders = (store) => held.get(store).renders();
  var touch = (store) => held.get(store).touch();

  // ../../../../../../private/var/folders/kh/4q17my9s6bjbn8rw5mscpwmr0000gn/T/ui-sdk-pack-ugM7HV/core/package/dist/foundation/kernel/part.js
  var ownerOf = (part) => part.owner;
  var definitionOf = (part) => ownerOf(part).slots[part.slot];
  var view = (part, props) => ({
    id: part.id,
    key: part.key,
    props,
    api: part.api
  });
  var context = (part, props = part.props) => ({
    el: part.el,
    id: part.id,
    key: part.key,
    props,
    store: part.store,
    api: part.api
  });
  function lease(part) {
    const { parts } = part.owner;
    const mapKey = `${part.slot}:${part.key}`;
    if (!parts.has(mapKey)) {
      parts.set(mapKey, part);
    }
    part.leases++;
    let held2 = true;
    return () => {
      if (!held2) {
        return;
      }
      held2 = false;
      if (--part.leases) {
        return;
      }
      const { owner } = part;
      if (!owner.released.length) {
        queueMicrotask(() => sweep(owner));
      }
      owner.released.push(part);
    };
  }
  function sweep(owner) {
    for (const part of owner.released) {
      const mapKey = `${part.slot}:${part.key}`;
      if (!part.leases && owner.parts.get(mapKey) === part) {
        owner.parts.delete(mapKey);
      }
    }
    owner.released = [];
  }
  function attrs(part, props = part.props, state = part.store.get()) {
    const definition = definitionOf(part);
    const context2 = view(part, props);
    const own = definition.attrs?.(state, context2);
    const declared = definition.role;
    const role = typeof declared === "function" ? declared(state, context2) : declared;
    if (dev) {
      checkRole(
        definition,
        part.slot,
        own,
        role,
        { component: ownerOf(part).label, id: part.id },
        definition.live?.read(state, context2)
      );
    }
    const { name } = ownerOf(part);
    const result = {
      "data-slot": part.slot === "root" ? name : `${name}-${part.slot}`,
      ...declared === void 0 ? void 0 : { role },
      ...own
    };
    if (declared !== void 0) {
      result.role = role;
    }
    return aliased(part, result);
  }
  var authorOwned = /* @__PURE__ */ new Set([
    "aria-label",
    "aria-labelledby",
    "aria-description",
    "title",
    "autocomplete",
    "autocapitalize",
    "autocorrect",
    "spellcheck",
    "inputmode",
    "enterkeyhint"
  ]);
  var madeLabel = (value) => typeof value === "string" && value.split(/\s+/).every((id) => id.startsWith("ui-sdk-"));
  function partState(part, props = part.props, state = part.store.get()) {
    return definitionOf(part).state?.(state, view(part, props)) ?? {};
  }
  function present(part, props = part.props, state = part.store.get()) {
    return definitionOf(part).present?.(state, view(part, props)) ?? true;
  }
  var skipNone = {};
  function subscribe(part, listener, props = part.props) {
    const narrowed = definitionOf(part).selects;
    const cleanups = [
      lease(part),
      narrowed ? narrowed.subscribe(part, listener, props) : subscribeSkipping(part.store, skipNone, listener)
    ];
    return () => cleanups.forEach((cleanup) => cleanup());
  }
  function handlers(part) {
    const { on: events, press: activate } = definitionOf(part);
    const result = {};
    for (const type2 in events) {
      const handler = events[type2];
      result[type2] = (event) => {
        if (event.defaultPrevented || composing(event)) {
          return;
        }
        ownerOf(part).sleeping?.wake();
        handler(event, context(part));
      };
    }
    if (typeof activate === "function" && !result.click) {
      result.click = (event) => {
        if (!event.defaultPrevented) {
          ownerOf(part).sleeping?.wake();
          activate(context(part), event);
        }
      };
    }
    return result;
  }
  var hidingSlots = /* @__PURE__ */ new WeakMap();
  function canHide(part) {
    const definition = definitionOf(part);
    let hides = hidingSlots.get(definition);
    if (hides === void 0) {
      hides = !!definition.attrs && "hidden" in definition.attrs(part.store.get(), view(part, part.props));
      hidingSlots.set(definition, hides);
    }
    return hides;
  }
  function bind(part, el, host = { by: "core" }) {
    const kept = part;
    const { parts } = kept.owner;
    const mapKey = `${part.slot}:${part.key}`;
    if (!part.el && (parts.get(mapKey) ?? kept) === kept) {
      parts.delete(mapKey);
      parts.set(mapKey, kept);
    }
    if (dev) {
      checkShared(part, part.el, el);
      const { focus } = definitionOf(part);
      checkFocus(
        typeof focus === "function" ? focus(part.store.get(), view(part, part.props)) : focus,
        part.slot,
        el,
        {
          component: ownerOf(part).label,
          id: part.id
        }
      );
    }
    const binding = {};
    part.el = el;
    kept.binding = binding;
    const cleanups = [lease(kept)];
    if (canHide(part)) {
      enforceHidden(el.ownerDocument);
    }
    for (const [type2, handler] of Object.entries(handlers(part))) {
      if (host.by === "core" || host.attaches !== "all" && !host.attaches.includes(type2)) {
        cleanups.push(on(el, type2, handler));
      }
    }
    const definition = definitionOf(part);
    if (definition.live) {
      cleanups.push(definition.live.attach(part, el));
    }
    if (host.by === "framework" && definition.direct) {
      cleanups.push(definition.direct.attach(part, el));
    }
    const early = definition.asleep?.(el, part);
    if (early) {
      cleanups.push(early);
    }
    const late = () => {
      const cleanup = definition.bind?.(el, part);
      if (cleanup) {
        cleanups.push(cleanup);
      }
    };
    const { sleeping } = kept.owner;
    if (sleeping && definition.bind) {
      sleeping.binds.add(late);
      cleanups.push(() => sleeping.binds.delete(late));
    } else {
      late();
    }
    if (definition.attrs && typeof MutationObserver !== "undefined") {
      cleanups.push(followId(kept, el));
    }
    return () => {
      cleanups.forEach((cleanup) => cleanup());
      if (kept.binding !== binding) {
        return;
      }
      part.el = kept.binding = void 0;
      if (kept.own !== void 0) {
        readIdLater(kept);
      }
    };
  }
  function checkShared(part, bound2, el) {
    if (!part.key || !bound2 || bound2 === el) {
      return;
    }
    queueMicrotask(() => {
      if (part.el !== el || !bound2.isConnected || !el.isConnected) {
        return;
      }
      const { parts, label } = ownerOf(part);
      for (const other of parts.values()) {
        if (other.el === bound2) {
          return;
        }
      }
      warn(
        `two "${part.slot}" parts share the key "${part.key}". Give each an id or a unique value.`,
        {
          component: label,
          id: part.id
        }
      );
    });
  }
  var references = [
    "aria-activedescendant",
    "aria-controls",
    "aria-describedby",
    "aria-details",
    "aria-errormessage",
    "aria-flowto",
    "aria-labelledby",
    "aria-owns",
    "for",
    "headers"
  ];
  var madeId = (part) => definitionOf(part).attrs?.(
    part.store.get(),
    view(part, { ...part.props, id: void 0 })
  ).id;
  function aliased(part, attrs2) {
    const { owner } = part;
    if (!owner.named?.size || !references.some((name) => attrs2[name])) {
      return attrs2;
    }
    const aliases = aliasesOf(owner, part.store);
    if (!aliases.size) {
      return attrs2;
    }
    const result = { ...attrs2 };
    for (const name of references) {
      const ids2 = result[name];
      if (ids2) {
        result[name] = ids2.split(" ").map((id) => aliases.get(id) ?? id).join(" ");
      }
    }
    return result;
  }
  function aliasesOf(owner, store) {
    const version = renders(store);
    if (owner.aliases?.version === version) {
      return owner.aliases.map;
    }
    const map = /* @__PURE__ */ new Map();
    for (const part of owner.named) {
      const made = madeId(part);
      if (made !== void 0 && made !== part.own) {
        map.set(made, part.own);
      }
    }
    owner.aliases = { version, map };
    return map;
  }
  function followId(part, el) {
    if (el.hasAttribute("id") || part.own !== void 0) {
      readIdLater(part);
    }
    const observer = new MutationObserver(() => readIdLater(part));
    observer.observe(el, { attributeFilter: ["id"] });
    return () => observer.disconnect();
  }
  function readIdLater(part) {
    const { owner } = part;
    if (!owner.unread) {
      owner.unread = /* @__PURE__ */ new Set();
      queueMicrotask(() => readIds(owner, part.store));
    }
    owner.unread.add(part);
  }
  function readIds(owner, store) {
    const parts = owner.unread;
    owner.unread = void 0;
    let renamed = owner.renamed === true;
    owner.renamed = void 0;
    for (const part of parts) {
      renamed = rename(part, part.el && idOf(part.el)) || renamed;
    }
    if (renamed) {
      touch(store);
    }
  }
  var idOf = (el) => el.localName === "form" ? el.getAttribute("id") : el.id;
  function rename(part, id) {
    const made = madeId(part);
    const own = id && id !== made ? id : void 0;
    if (own === part.own) {
      return false;
    }
    const { owner } = part;
    part.own = own;
    owner.named ??= /* @__PURE__ */ new Set();
    if (own === void 0) {
      owner.named.delete(part);
    } else {
      owner.named.add(part);
    }
    owner.aliases = void 0;
    return made !== void 0;
  }
  function composing(event) {
    return (event.type === "keydown" || event.type === "keyup") && isComposing(event);
  }

  // ../../../../../../private/var/folders/kh/4q17my9s6bjbn8rw5mscpwmr0000gn/T/ui-sdk-pack-ugM7HV/core/package/dist/foundation/platform/platform.js
  function composedHops(node) {
    const hops = [node];
    let at = node;
    while (at) {
      const next = at.assignedSlot ?? at.parentNode ?? at.host;
      if (next && next !== at.parentNode) {
        hops.push(next);
      }
      at = next;
    }
    return hops;
  }
  function composedClosest(node, selector) {
    for (const hop of composedHops(node)) {
      const found2 = hop.closest?.(selector);
      if (found2) {
        return found2;
      }
    }
    return null;
  }
  var platformOverride;
  function setPlatform(platform) {
    platformOverride = platform;
  }

  // ../../../../../../private/var/folders/kh/4q17my9s6bjbn8rw5mscpwmr0000gn/T/ui-sdk-pack-ugM7HV/core/package/dist/foundation/drag-and-drop/pointer.js
  var dragThreshold = 3;

  // ../../../../../../private/var/folders/kh/4q17my9s6bjbn8rw5mscpwmr0000gn/T/ui-sdk-pack-ugM7HV/core/package/dist/foundation/kernel/trusted.js
  var trusted = (event) => event.isTrusted;
  function trustSent(sent2) {
    trusted = (event) => event.isTrusted || sent2.has(event);
  }

  // ../../../../../../private/var/folders/kh/4q17my9s6bjbn8rw5mscpwmr0000gn/T/ui-sdk-pack-ugM7HV/core/package/dist/foundation/text/accessible-name.js
  var implicitRoles = [
    ["button", "button"],
    ["a[href]", "link"],
    ["input[type=checkbox][switch]", "switch"],
    ["input[type=checkbox]", "checkbox"],
    ["input[type=radio]", "radio"],
    ["input[type=range]", "slider"],
    ["dialog", "dialog"],
    ["h1, h2, h3, h4, h5, h6", "heading"]
  ];
  var namedByContent = /* @__PURE__ */ new Set([
    "button",
    "cell",
    "checkbox",
    "columnheader",
    "gridcell",
    "heading",
    "link",
    "menuitem",
    "menuitemcheckbox",
    "menuitemradio",
    "option",
    "radio",
    "row",
    "rowheader",
    "switch",
    "tab",
    "treeitem"
  ]);
  function roleOf(el) {
    const explicit = el.getAttribute("role")?.trim().split(/\s+/)[0];
    if (explicit) {
      return explicit;
    }
    return implicitRoles.find(([selector]) => el.matches(selector))?.[1] ?? "";
  }
  function isHidden(el) {
    if (el.hasAttribute("hidden") || el.getAttribute("aria-hidden") === "true") {
      return true;
    }
    const style = el.ownerDocument.defaultView?.getComputedStyle(el);
    return style?.display === "none" || style?.visibility === "hidden";
  }
  function byId(el, id) {
    const root = el.getRootNode();
    return root.getElementById?.(id) ?? null;
  }
  function labelledByOf(el) {
    return (el.getAttribute("aria-labelledby") ?? "").split(/\s+/).map((id) => id && byId(el, id)).filter((label) => !!label).map((label) => label.getAttribute("aria-label") ?? contentOf(label, true)).join(" ");
  }
  function embeddedName(el) {
    if (el.localName === "img") {
      return el.getAttribute("alt") ?? "";
    }
    if (el.localName !== "svg") {
      return "";
    }
    return [...el.children].find((child) => child.localName === "title")?.textContent ?? "";
  }
  function nameWithin(el, labelling, hidden) {
    if (el.matches("input, select, textarea")) {
      return "";
    }
    const own = !labelling && labelledByOf(el) || el.getAttribute("aria-label")?.trim() || embeddedName(el);
    if (own) {
      return ` ${own} `;
    }
    if (el.localName === "svg") {
      return "";
    }
    const content = contentOf(el, labelling, hidden);
    const title = el.getAttribute("title");
    return content || (title ? ` ${title} ` : "");
  }
  function contentOf(el, labelling = false, hidden = isHidden(el)) {
    let text = "";
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.nodeValue;
      } else if (node.nodeType === Node.ELEMENT_NODE && (hidden || !isHidden(node))) {
        text += nameWithin(node, labelling, hidden);
      }
    }
    return text;
  }
  var collapse = (text) => text.replace(/\s+/g, " ").trim();
  var labelsOf = (el) => [...el.labels ?? []].map((label) => contentOf(label)).join(" ");
  var nameSources = [
    labelledByOf,
    (el) => el.getAttribute("aria-label") ?? "",
    labelsOf,
    embeddedName,
    (el) => namedByContent.has(roleOf(el)) ? contentOf(el) : "",
    (el) => el.getAttribute("title") ?? ""
  ];
  var labelsLast = [
    ...nameSources.filter((source) => source !== labelsOf),
    labelsOf
  ];
  function firstName(el, sources) {
    for (const source of sources) {
      const name = collapse(source(el));
      if (name) {
        return name;
      }
    }
    return "";
  }
  function accessibleName(el) {
    return firstName(el, nameSources);
  }

  // ../../../../../../private/var/folders/kh/4q17my9s6bjbn8rw5mscpwmr0000gn/T/ui-sdk-pack-ugM7HV/core/package/dist/testing/aria.js
  var focusable = "a[href], button, input, select, textarea, summary, [tabindex], [contenteditable]:not([contenteditable=false])";
  var referenceAttributes = [
    "aria-controls",
    "aria-labelledby",
    "aria-describedby",
    "aria-activedescendant",
    "aria-owns"
  ];
  var isGone = (el) => !el.isConnected || !!el.closest("[hidden], [inert]");
  var isUnreachable = (el) => !!el.closest('[aria-hidden="true"], [inert]');
  var renderedParent = (el) => el.assignedSlot ?? el.parentElement ?? (el.parentNode?.host || null);
  function isUndisplayed(el, known = /* @__PURE__ */ new Map()) {
    if (!el) {
      return false;
    }
    let hidden = known.get(el);
    if (hidden === void 0) {
      known.set(
        el,
        hidden = getComputedStyle(el).display === "none" || isUndisplayed(renderedParent(el), known)
      );
    }
    return hidden;
  }
  function withRole(scope, roles, { displayed = true } = {}) {
    const known = /* @__PURE__ */ new Map();
    return [...scope.querySelectorAll("*")].filter(
      (el) => roles.includes(roleOf(el)) && !isGone(el) && !isUnreachable(el) && (!displayed || !isUndisplayed(el, known))
    );
  }
  var hasBoolean = (el, attribute) => ["true", "false"].includes(el.getAttribute(attribute) ?? "");
  var checkedOf = (el) => el instanceof HTMLInputElement && !el.hasAttribute("aria-checked") ? String(el.checked) : el.getAttribute("aria-checked") ?? "";
  var isReadOnly = (el) => el.getAttribute("aria-readonly") === "true";
  function isTabStop(el, known) {
    if (!el.matches(focusable) || isGone(el)) {
      return false;
    }
    if (el.tabIndex < 0 || el.matches(":disabled")) {
      return false;
    }
    if (el instanceof HTMLInputElement && el.type === "hidden") {
      return false;
    }
    if (isUndisplayed(el, known)) {
      return false;
    }
    if (el instanceof HTMLInputElement && el.type === "radio" && el.name) {
      const group = [
        ...el.ownerDocument.querySelectorAll(
          "input[type=radio]"
        )
      ].filter(
        (radio) => radio.name === el.name && radio.form === el.form && !isUndisplayed(radio, known)
      );
      return el === (group.find((radio) => radio.checked) ?? group[0]);
    }
    return true;
  }
  function tabStops(scope) {
    const known = /* @__PURE__ */ new Map();
    return [scope, ...scope.querySelectorAll(focusable)].filter(
      (el) => isTabStop(el, known)
    );
  }
  function focusables(scope) {
    const known = /* @__PURE__ */ new Map();
    return [...scope.querySelectorAll(focusable)].filter(
      (el) => !isGone(el) && !el.matches(":disabled") && !(el instanceof HTMLInputElement && el.type === "hidden") && !isUndisplayed(el, known)
    );
  }
  var ids = (el, attribute) => (el.getAttribute(attribute) ?? "").split(/\s+/).filter(Boolean);
  var textOf = (el) => (el.textContent ?? "").replace(/\s+/g, " ").trim();
  function byId2(el, id) {
    const root = el.getRootNode();
    return root instanceof Document || root instanceof ShadowRoot ? root.getElementById(id) : null;
  }
  function danglingReferences(scope) {
    const dangling = [];
    for (const el of [scope, ...scope.querySelectorAll("*")].filter(
      (el2) => !isGone(el2)
    )) {
      for (const attribute of referenceAttributes) {
        if (attribute === "aria-controls" && el.getAttribute("aria-expanded") === "false") {
          continue;
        }
        for (const id of ids(el, attribute)) {
          if (!byId2(el, id)) {
            dangling.push({ el, attribute, id });
          }
        }
      }
    }
    return dangling;
  }
  function isRtl(el) {
    const dir = el.closest("[dir]")?.getAttribute("dir")?.toLowerCase();
    if (dir === "rtl" || dir === "ltr") {
      return dir === "rtl";
    }
    return getComputedStyle(el).direction === "rtl";
  }
  function describe(el) {
    if (!el) {
      return "nothing";
    }
    if (el === el.ownerDocument.body) {
      return "body";
    }
    const role = el.getAttribute("role");
    const selector = `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${role ? `[role=${role}]` : ""}`;
    if (el.id || el.children.length && !namedByContent.has(roleOf(el))) {
      return selector;
    }
    const text = textOf(el).slice(0, 24);
    return text ? `${selector} "${text}"` : selector;
  }

  // ../../../../../../private/var/folders/kh/4q17my9s6bjbn8rw5mscpwmr0000gn/T/ui-sdk-pack-ugM7HV/core/package/dist/testing/input.js
  var sent = /* @__PURE__ */ new WeakSet();
  trustSent(sent);
  function markTrusted(event) {
    sent.add(event);
    return event;
  }
  var focusable2 = "a[href], button, input, select, textarea, summary, [tabindex], [contenteditable]:not([contenteditable=false])";
  async function settle() {
    for (let i = 0; i < 3; i++) {
      await Promise.resolve();
    }
    await new Promise((resolve) => setTimeout(resolve));
    const frame = () => new Promise(
      (resolve) => typeof requestAnimationFrame === "function" ? requestAnimationFrame(resolve) : setTimeout(resolve, 16)
    );
    await frame();
    await frame();
  }
  function parseKey(name) {
    const parts = name.split("+");
    const key = parts.pop();
    const held2 = new Set(parts.map((part) => part.toLowerCase()));
    return {
      key: key === "Space" ? " " : key,
      shiftKey: held2.has("shift"),
      altKey: held2.has("alt"),
      ctrlKey: held2.has("control") || held2.has("ctrl"),
      metaKey: held2.has("meta") || held2.has("cmd")
    };
  }
  var codeOf = (key) => key === " " ? "Space" : /^[a-z]$/i.test(key) ? `Key${key.toUpperCase()}` : /^\d$/.test(key) ? `Digit${key}` : key;
  function isEditable(el) {
    if (!el) {
      return false;
    }
    if (el instanceof HTMLTextAreaElement) {
      return !el.readOnly && !el.matches(":disabled");
    }
    if (el instanceof HTMLInputElement) {
      return !el.readOnly && !el.matches(":disabled") && !/^(button|checkbox|radio|submit|reset|range|color|file|image)$/.test(
        el.type
      );
    }
    return el.isContentEditable;
  }
  var isHidden2 = (el) => !!el.closest("[hidden], [inert]");
  function tabOrder(doc) {
    const stops = [...doc.querySelectorAll(focusable2)].filter(
      (el) => el.tabIndex >= 0 && !el.matches(":disabled") && !isHidden2(el)
    );
    const positive = stops.filter((el) => el.tabIndex > 0).sort((a, b) => a.tabIndex - b.tabIndex);
    return [...positive, ...stops.filter((el) => el.tabIndex === 0)];
  }
  function moveTab(doc, backward, scope) {
    const stops = tabOrder(doc);
    const active = doc.activeElement;
    if (scope && !(active && scope.contains(active))) {
      const inside = stops.filter((el) => scope.contains(el));
      return (backward ? inside.at(-1) : inside[0])?.focus();
    }
    const index = active ? stops.indexOf(active) : -1;
    const next = backward ? index < 0 ? stops.at(-1) : stops[index - 1] : stops[index + 1];
    if (next) {
      next.focus();
    } else {
      active?.blur();
    }
  }
  var keyClick = (el) => el.dispatchEvent(
    markTrusted(
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        composed: true,
        detail: 0
      })
    )
  );
  function keyEvent(type2, init) {
    return markTrusted(
      new KeyboardEvent(type2, {
        ...init,
        code: codeOf(init.key),
        bubbles: true,
        cancelable: true,
        composed: true
      })
    );
  }
  function insert(el, data) {
    const before = markTrusted(
      new InputEvent("beforeinput", {
        data,
        inputType: "insertText",
        bubbles: true,
        cancelable: true
      })
    );
    if (!el.dispatchEvent(before)) {
      return;
    }
    if ("setRangeText" in el) {
      const start = el.selectionStart ?? el.value.length;
      el.setRangeText(data, start, el.selectionEnd ?? start, "end");
    } else {
      el.textContent = (el.textContent ?? "") + data;
    }
    el.dispatchEvent(
      markTrusted(
        new InputEvent("input", { data, inputType: "insertText", bubbles: true })
      )
    );
  }
  var activates = (el, key) => !!el && (key === "Enter" ? el instanceof HTMLButtonElement || el instanceof HTMLAnchorElement : key === " " && (el instanceof HTMLButtonElement || el instanceof HTMLInputElement && /^(checkbox|radio)$/.test(el.type)));
  var rendered = (el) => {
    for (let at = el; at; at = at.parentElement) {
      if (getComputedStyle(at).display === "none") {
        return false;
      }
    }
    return getComputedStyle(el).visibility !== "hidden" && !isHidden2(el);
  };
  function changed(el) {
    el.dispatchEvent(
      markTrusted(new Event("input", { bubbles: true, composed: true }))
    );
    el.dispatchEvent(markTrusted(new Event("change", { bubbles: true })));
  }
  function nativeKey(el, key) {
    const inline = isRtl(el) ? ["ArrowLeft", "ArrowRight"] : ["ArrowRight", "ArrowLeft"];
    if (el.type === "radio" && el.name) {
      const by = [inline[0], "ArrowDown"].includes(key) ? 1 : [inline[1], "ArrowUp"].includes(key) ? -1 : 0;
      const group = [
        ...el.getRootNode().querySelectorAll("input[type=radio]")
      ].filter(
        (radio) => radio === el || radio.name === el.name && radio.form === el.form && !radio.matches(":disabled") && rendered(radio)
      );
      const next = group.at((group.indexOf(el) + by) % group.length);
      if (by && next && next !== el) {
        next.focus();
        keyClick(next);
      }
    } else if (el.type === "range") {
      const min = Number.parseFloat(el.min) || 0;
      const max = el.max === "" ? 100 : Number.parseFloat(el.max);
      const any = el.step.toLowerCase() === "any";
      const step = any ? (max - min) / 100 : Number.parseFloat(el.step) || 1;
      const value = Number.parseFloat(el.value);
      const page = Math.max(step, (max - min) / 10);
      const top = any ? max : min + Math.floor((max - min) / step) * step;
      const next = [inline[0], "ArrowUp"].includes(key) ? value + step : [inline[1], "ArrowDown"].includes(key) ? value - step : {
        PageUp: value + page,
        PageDown: value - page,
        Home: min,
        End: max
      }[key];
      if (next === void 0) {
        return;
      }
      const snapped = any ? next : min + Math.round((next - min) / step) * step;
      el.value = String(
        Number.parseFloat(Math.min(top, Math.max(min, snapped)).toPrecision(12))
      );
      if (Number.parseFloat(el.value) !== value) {
        changed(el);
      }
    }
  }
  async function keys(doc, names, scope) {
    for (const name of names) {
      const init = parseKey(name);
      const target = doc.activeElement ?? doc.body;
      const proceeds = target.dispatchEvent(keyEvent("keydown", init));
      if (proceeds && init.key === "Tab") {
        moveTab(doc, init.shiftKey, scope);
      }
      const printable = init.key.length === 1 && !init.ctrlKey && !init.metaKey;
      if (proceeds && printable && isEditable(target)) {
        insert(target, init.key);
      }
      if (proceeds && target instanceof HTMLInputElement) {
        nativeKey(target, init.key);
      }
      if (proceeds && init.key === "Enter" && activates(target, "Enter")) {
        keyClick(target);
      }
      const up = doc.activeElement ?? doc.body;
      up.dispatchEvent(keyEvent("keyup", init));
      if (proceeds && init.key === " " && activates(target, " ")) {
        keyClick(target);
      }
      await settle();
    }
  }
  var type = (doc, text) => keys(
    doc,
    [...text].map((char) => char === " " ? "Space" : char)
  );
  function center(el) {
    const box = el.getBoundingClientRect();
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  }
  function pointer(type2, at, pressed) {
    const init = {
      bubbles: !type2.endsWith("enter") && !type2.endsWith("leave"),
      cancelable: true,
      composed: true,
      clientX: at.x,
      clientY: at.y,
      button: type2.endsWith("move") ? -1 : 0,
      buttons: pressed ? 1 : 0,
      detail: type2 === "click" ? 1 : 0
    };
    if (!type2.startsWith("pointer")) {
      return markTrusted(new MouseEvent(type2, init));
    }
    return markTrusted(
      new PointerEvent(type2, {
        ...init,
        pointerId: 1,
        pointerType: "mouse",
        isPrimary: true,
        width: 1,
        height: 1,
        pressure: pressed ? 0.5 : 0
      })
    );
  }
  function focusTarget(el) {
    const target = el.closest(focusable2);
    return target && !target.matches(":disabled") ? target : void 0;
  }
  async function click(el) {
    const at = center(el);
    const disabled = !!el.closest("button, input, select, textarea")?.matches(":disabled");
    const down = el.dispatchEvent(pointer("pointerdown", at, true));
    if (!disabled && el.dispatchEvent(pointer("mousedown", at, true)) && down) {
      focusTarget(el)?.focus();
    }
    el.dispatchEvent(pointer("pointerup", at, false));
    if (!disabled) {
      el.dispatchEvent(pointer("mouseup", at, false));
      el.dispatchEvent(pointer("click", at, false));
    }
    await settle();
  }
  async function hover(el) {
    const at = center(el);
    for (const type2 of [
      "pointerover",
      "pointerenter",
      "mouseover",
      "mouseenter",
      "pointermove",
      "mousemove"
    ]) {
      el.dispatchEvent(pointer(type2, at, false));
    }
    await settle();
  }
  async function drag(el, target) {
    const from = center(el);
    const to = "to" in target ? center(target.to) : { x: from.x + target.by.x, y: from.y + target.by.y };
    el.dispatchEvent(pointer("pointerdown", from, true));
    el.dispatchEvent(pointer("mousedown", from, true));
    await settle();
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    const steps = Math.max(2, Math.ceil(distance / dragThreshold));
    for (let step = 1; step <= steps; step++) {
      const at = {
        x: from.x + (to.x - from.x) * step / steps,
        y: from.y + (to.y - from.y) * step / steps
      };
      el.dispatchEvent(pointer("pointermove", at, true));
      el.dispatchEvent(pointer("mousemove", at, true));
    }
    await settle();
    el.dispatchEvent(pointer("pointerup", to, false));
    el.dispatchEvent(pointer("mouseup", to, false));
    await settle();
  }

  // ../../../../../../private/var/folders/kh/4q17my9s6bjbn8rw5mscpwmr0000gn/T/ui-sdk-pack-ugM7HV/core/package/dist/testing/markup.js
  var entities = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    "#39": "'"
  };
  var decode = (text) => text.replace(
    /&(amp|lt|gt|quot|apos|#39);/g,
    (_, name) => entities[name]
  );
  var voids = /* @__PURE__ */ new Set([
    "area",
    "br",
    "col",
    "embed",
    "hr",
    "img",
    "input",
    "link",
    "meta",
    "source",
    "track",
    "wbr"
  ]);
  function parseMarkup(markup) {
    const root = { tag: "", attributes: [], children: [] };
    const open = [root];
    const token = /<\/([\w-]+)\s*>|<([\w-]+)((?:\s+[\w:-]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>|([^<]+)/g;
    for (const [, close, tag, attributes, selfClosing, text] of markup.matchAll(
      token
    )) {
      const parent = open.at(-1);
      if (text !== void 0) {
        if (text.trim()) {
          parent.children.push(decode(text));
        }
        continue;
      }
      if (close) {
        if (open.length > 1 && open.at(-1).tag === close.toLowerCase()) {
          open.pop();
        }
        continue;
      }
      const node = {
        tag: tag.toLowerCase(),
        attributes: [],
        children: []
      };
      for (const [, name, quoted, single, bare] of attributes.matchAll(
        /([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g
      )) {
        node.attributes.push([name, decode(quoted ?? single ?? bare ?? "")]);
      }
      parent.children.push(node);
      if (!selfClosing && !voids.has(node.tag)) {
        open.push(node);
      }
    }
    return root.children;
  }

  // ../../../../../../private/var/folders/kh/4q17my9s6bjbn8rw5mscpwmr0000gn/T/ui-sdk-pack-ugM7HV/core/package/dist/testing/schema.js
  var kindOf = (spec) => typeof spec === "function" ? "value" : typeof spec === "object" ? spec.kind : spec;
  function fromOf(spec, key) {
    if (typeof spec !== "object") {
      return void 0;
    }
    const [slot, prop = key] = spec.from.split(".");
    return { slot, prop };
  }
  function parseProp(spec, attribute) {
    if (typeof spec === "function") {
      return spec(attribute);
    }
    const kind = kindOf(spec);
    if (kind === "boolean") {
      return attribute !== "false";
    }
    if (kind === "number") {
      return Number(attribute);
    }
    if (kind === "list") {
      return attribute ? attribute.split(",").map((item) => item.trim()) : [];
    }
    if (kind === "value") {
      try {
        return JSON.parse(attribute);
      } catch {
        return attribute;
      }
    }
    return attribute;
  }
  var camel = (name) => name.replace(/-(\w)/g, (_, char) => char.toUpperCase());
  function slotProps(own, attributes, around, makeId) {
    const props = {};
    const extra = [];
    let as;
    for (const [name, value] of attributes) {
      const key = camel(name);
      if (name === "as") {
        as = value;
      } else if (key in own) {
        props[key] = parseProp(own[key], value);
      } else {
        extra.push([name, value]);
      }
    }
    for (const key in own) {
      const from = fromOf(own[key], key);
      if (from) {
        props[key] ??= around[from.slot]?.[from.prop];
      }
      if (kindOf(own[key]) === "id") {
        props[key] ??= makeId();
      }
    }
    return { props, extra, as };
  }
  function tagOf(rendered2) {
    if (rendered2.type === "button" || rendered2.type === "submit") {
      return "button";
    }
    if (rendered2.href !== void 0) {
      return "a";
    }
    if (rendered2.for !== void 0) {
      return "label";
    }
    if (typeof rendered2.type === "string") {
      return "input";
    }
    return "div";
  }

  // ../../../../../../private/var/folders/kh/4q17my9s6bjbn8rw5mscpwmr0000gn/T/ui-sdk-pack-ugM7HV/core/package/dist/foundation/platform/announce.js
  var announcer;
  function setAnnouncer(announce2) {
    announcer = announce2;
  }

  // ../../../../../../private/var/folders/kh/4q17my9s6bjbn8rw5mscpwmr0000gn/T/ui-sdk-pack-ugM7HV/core/package/dist/foundation/kernel/live.js
  var applied = /* @__PURE__ */ new WeakMap();
  var found = /* @__PURE__ */ new WeakMap();
  var writing;
  function applyAttrs(el, attrs2, channel = "render") {
    writeAttrs(el, attrs2, channel, false);
  }
  function writeAttrs(el, attrs2, channel, release) {
    const outer = writing;
    writing = el;
    try {
      writeChannel(el, attrs2, channel, release);
    } finally {
      writing = outer;
    }
  }
  function writeChannel(el, attrs2, channel, release) {
    const channels = applied.get(el) ?? {};
    const previous = channels[channel] ?? /* @__PURE__ */ new Map();
    const written = /* @__PURE__ */ new Map();
    const styles = attrs2.style === void 0 ? [] : styleDeclarations(attrs2.style);
    for (const [property, value] of styles) {
      written.set(`style:${property}`, value);
    }
    for (const [name, value] of Object.entries(attrs2)) {
      if (value !== void 0 && name !== "style") {
        written.set(name, value);
      }
    }
    const id = written.has("id") || previous.has("id") ? el.getAttribute("id") : null;
    const keeps = keepsId(id, channels, channel);
    if (keeps) {
      written.delete("id");
    }
    const authors = /* @__PURE__ */ new Set();
    const read = /* @__PURE__ */ new Map();
    for (const name of /* @__PURE__ */ new Set([...written.keys(), ...previous.keys()])) {
      if (!authorOwned.has(name)) {
        continue;
      }
      const current = el.getAttribute(name);
      read.set(name, current);
      if (current === null || current === written.get(name) || name === "aria-labelledby" && madeLabel(current)) {
        continue;
      }
      if (!Object.values(channels).some((wrote) => wrote.get(name) === current)) {
        authors.add(name);
      }
    }
    for (const name of authors) {
      written.delete(name);
    }
    for (const name of previous.keys()) {
      if (written.has(name) || authors.has(name) || name === "id" && keeps) {
        continue;
      }
      if (name.startsWith("style:")) {
        el.style.removeProperty(name.slice(6));
        continue;
      }
      if (!release) {
        el.removeAttribute(name);
        keepFound(el, channel, name, null);
        continue;
      }
      const current = el.getAttribute(name);
      if (current !== previous.get(name)) {
        continue;
      }
      const original = found.get(el)?.[channel]?.get(name);
      if (original === void 0) {
        el.removeAttribute(name);
      } else if (current !== original) {
        el.setAttribute(name, original);
      }
    }
    for (const [property, value] of styles) {
      if (el.style.getPropertyValue(property) !== value) {
        el.style.setProperty(property, value);
      }
    }
    for (const [name, value] of Object.entries(attrs2)) {
      if (value === void 0 || !written.has(name)) {
        continue;
      }
      const current = name === "id" ? id : read.has(name) ? read.get(name) : el.getAttribute(name);
      if (current !== (previous.get(name) ?? null)) {
        keepFound(el, channel, name, current);
      }
      if (current === value) {
        continue;
      }
      if (name === "value" && isTextField(el) && el.value !== value) {
        el.value = value;
      }
      el.setAttribute(name, value);
    }
    channels[channel] = written;
    applied.set(el, channels);
    if (release) {
      delete found.get(el)?.[channel];
    }
  }
  function keepFound(el, channel, name, value) {
    const kept = value == null || name === "id" ? void 0 : references.includes(name) ? authoredIds(value) : value;
    if (kept === void 0) {
      return void found.get(el)?.[channel]?.delete(name);
    }
    let channels = found.get(el);
    if (!channels) {
      found.set(el, channels = {});
    }
    ;
    (channels[channel] ??= /* @__PURE__ */ new Map()).set(name, kept);
  }
  var authoredIds = (ids2) => ids2.split(/\s+/).filter((id) => id && !id.startsWith("ui-sdk-")).join(" ") || void 0;
  function keepsId(id, channels, channel) {
    if (id === null || id === channels[channel]?.get("id")) {
      return false;
    }
    return !id.startsWith("ui-sdk-") || Object.values(channels).some((written) => written.get("id") === id);
  }
  var isTextField = (el) => el.localName === "textarea" || el.localName === "input" && el.type !== "file";
  function styleDeclarations(css) {
    const declarations = [];
    for (const declaration of css.split(";")) {
      const index = declaration.indexOf(":");
      if (index > 0) {
        declarations.push([
          declaration.slice(0, index).trim(),
          declaration.slice(index + 1).trim()
        ]);
      }
    }
    return declarations;
  }

  // ../../../../../../private/var/folders/kh/4q17my9s6bjbn8rw5mscpwmr0000gn/T/ui-sdk-pack-ugM7HV/core/package/dist/foundation/kernel/keep.js
  var deferring = false;
  function unwatched(make) {
    const outer = deferring;
    deferring = true;
    try {
      return make();
    } finally {
      deferring = outer;
    }
  }

  // ../../../../../../private/var/folders/kh/4q17my9s6bjbn8rw5mscpwmr0000gn/T/ui-sdk-pack-ugM7HV/core/package/dist/foundation/kernel/watchers.js
  var watchers = {};
  var earlier = /* @__PURE__ */ new Set();
  var watchLater = /* @__PURE__ */ new WeakMap();
  function watchEarlier() {
    for (const ref of earlier) {
      earlier.delete(ref);
      const instance = ref.deref();
      if (instance) {
        watchLater.get(instance)?.();
      }
    }
  }

  // ../../../../../../private/var/folders/kh/4q17my9s6bjbn8rw5mscpwmr0000gn/T/ui-sdk-pack-ugM7HV/core/package/dist/foundation/kernel/primitive.js
  var schemas = /* @__PURE__ */ new WeakMap();
  function schemaOf(primitive) {
    let schema = schemas.get(primitive);
    if (!schema) {
      const { options, slots = {} } = primitive;
      schema = {
        options: { debug: "boolean", ...options },
        slots: Object.fromEntries(
          Object.entries(slots).map(([slot, def]) => [
            slot,
            def.props ?? {}
          ])
        )
      };
      schemas.set(primitive, schema);
    }
    return schema;
  }

  // ../../../../../../private/var/folders/kh/4q17my9s6bjbn8rw5mscpwmr0000gn/T/ui-sdk-pack-ugM7HV/core/package/dist/page/observe/marks.js
  var marks = ["data-agent-confirm", "data-agent-hidden", "data-agent-secret"];
  var isOffLimits = (elements) => elements.some((el) => composedClosest(el, "[data-agent-hidden]"));
  var isSecret = (elements) => elements.some((el) => composedClosest(el, "[data-agent-secret]"));
  function textOf2(el, skip = []) {
    let text = "";
    const walk = (node) => {
      for (const child of node.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) {
          text += child.textContent;
        } else if (child instanceof Element && !skip.includes(child) && !child.hasAttribute("data-agent-hidden") && child.getAttribute("aria-hidden") !== "true") {
          walk(child);
        }
      }
    };
    walk(el);
    return text.replace(/\s+/g, " ").trim();
  }
  var checkMarks2 = (elements) => checkMarks(elements, marks);

  // ../../../../../../private/var/folders/kh/4q17my9s6bjbn8rw5mscpwmr0000gn/T/ui-sdk-pack-ugM7HV/core/package/dist/page/observe/registry.js
  var entries = /* @__PURE__ */ new Map();
  var byId3 = /* @__PURE__ */ new Map();
  var retired = /* @__PURE__ */ new Map();
  var retiredLimit = 500;
  var offPage = /* @__PURE__ */ new Map();
  var partsOf = /* @__PURE__ */ new WeakMap();
  var count = 0;
  var listeners = /* @__PURE__ */ new Map();
  function watch(instance, parts, {
    controlled,
    commits,
    agent,
    options
  }) {
    const entry = {
      ref: `c${++count}`,
      id: instance.id,
      component: instance.name,
      agent,
      options,
      controlled,
      commits,
      started: /* @__PURE__ */ new Map(),
      instance: new WeakRef(instance),
      secret: agent?.secret
    };
    entries.set(entry.ref, entry);
    byId3.set(entry.id, entry);
    partsOf.set(instance, parts);
    return () => retire(entry);
  }
  function retire(entry) {
    if (entries.get(entry.ref) !== entry) {
      return;
    }
    entries.delete(entry.ref);
    if (byId3.get(entry.id) === entry) {
      byId3.delete(entry.id);
    }
    if (!entry.key || entry.secret || entry.offLimits) {
      return;
    }
    const queued = retired.get(entry.key);
    if (queued?.at === count) {
      queued.refs.push(entry.ref);
    } else {
      retired.delete(entry.key);
      retired.set(entry.key, { at: count, refs: [entry.ref] });
      if (retired.size > retiredLimit) {
        retired.delete(retired.keys().next().value);
      }
    }
    const state = entry.instance.deref()?.get();
    const keys2 = stateKeys(entry, state ?? {}).filter((key) => key !== "open");
    if (!state || !keys2.length) {
      return;
    }
    const last = {
      ref: entry.ref,
      component: entry.component,
      offPage: true,
      actions: []
    };
    if (entry.label) {
      last.label = entry.label;
    }
    if (entry.row) {
      last.row = entry.row;
    }
    for (const key of keys2) {
      if (key === "value" || state[key] !== "") {
        last[key] = state[key] ?? null;
      }
    }
    offPage.delete(entry.ref);
    offPage.set(entry.ref, last);
    if (offPage.size > 50) {
      offPage.delete(offPage.keys().next().value);
    }
  }
  var secret = /\b(password|current-password|new-password|one-time-code|cc-[a-z-]+)\b/i;
  var stateKeys = (entry, state) => entry.controlled ?? ["open", "value", "checked"].filter((key) => key in state);
  function remember(entry, parts) {
    const first = !entry.key;
    const elements = parts.map((part) => part.el);
    checkMarks2(elements);
    entry.label = componentLabel(parts);
    entry.row = rowOf(parts);
    entry.secret ||= isSecret(elements) || parts.some(
      ({ el }) => secret.test(
        `${el.getAttribute("type")} ${el.getAttribute("autocomplete")}`
      )
    );
    entry.offLimits = isOffLimits(elements) || elements.every((el) => el.type === "hidden");
    entry.key = `${entry.component}|${entry.label}|${entry.row}`;
    if (!first) {
      return;
    }
    const queue = retired.get(entry.key)?.refs;
    const ref = queue?.shift();
    if (!ref) {
      return;
    }
    if (!queue.length) {
      retired.delete(entry.key);
    }
    offPage.delete(ref);
    entries.delete(entry.ref);
    entry.ref = ref;
    entries.set(ref, entry);
  }
  function bound(instance) {
    return [...partsOf.get(instance)?.values() ?? []].filter(
      (part) => part.el?.isConnected
    );
  }
  function componentLabel(parts) {
    const keyless = (slot) => parts.find((part) => part.slot === slot && !part.key)?.el;
    const first = (slot) => {
      const found2 = parts.filter((part) => part.slot === slot);
      return new Set(found2.map((part) => part.key)).size === 1 ? found2[0].el : found2.find((part) => !part.key)?.el;
    };
    const text = (el) => el && textOf2(el).slice(0, 80) || void 0;
    const label = text(first("label"));
    if (label) {
      return label;
    }
    const group = keyless("group") ?? keyless("root");
    const name = group && accessibleName(group);
    if (name) {
      return name;
    }
    const input = parts.find(
      (part) => part.slot === "input" || part.slot === "control" && part.el.matches("input, textarea")
    )?.el;
    const popup = parts.find((part) => part.slot === "content")?.el;
    const field = input && !popup?.contains(input) && accessibleName(input);
    if (field) {
      return field;
    }
    const root = keyless("root");
    const button = root && (root.tagName === "BUTTON" || root.getAttribute("role") === "button") ? root : void 0;
    const named = (el) => el && accessibleName(el) || text(el);
    const shown = named(first("title")) ?? named(first("heading")) ?? named(first("trigger")) ?? named(button);
    if (shown) {
      return shown;
    }
    const keys2 = new Set(parts.map((part) => part.key).filter(Boolean));
    const keyed = keys2.size === 1 ? parts.filter((part) => part.key) : [];
    for (const part of [...parts.filter((part2) => !part2.key), ...keyed]) {
      const name2 = accessibleName(part.el);
      if (name2) {
        return name2;
      }
    }
  }
  function rowOf(parts) {
    const el = (parts.find((part) => part.slot === "trigger" || part.slot === "root") ?? parts[0])?.el;
    const row = el?.closest("li, tr, [role=row], [role=listitem]");
    if (!row || parts.some((part) => part.el.contains(row))) {
      return;
    }
    const own = parts.flatMap(({ el: el2 }) => [
      el2,
      ...el2.labels ?? []
    ]);
    const words = [];
    const walker = row.ownerDocument.createTreeWalker(row, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!own.some((el2) => el2.contains(node)) && !isOffLimits([node.parentElement]) && node.textContent?.trim()) {
        words.push(node.textContent.trim());
      }
    }
    return words.join(" ").slice(0, 80) || void 0;
  }
  function report(id, key, value, details, previous) {
    const entry = byId3.get(id);
    if (!listeners.size || !entry) {
      return;
    }
    const { source } = details;
    const held2 = !!entry.commits?.includes(key) && source !== "programmatic" && source !== "agent";
    if (entry.started.has(key) !== held2) {
      entry.started.set(key, held2 ? previous : value);
    }
    send(entry, key, value, details, previous, held2 || void 0);
  }
  function settle2(id, key, value, details) {
    const entry = byId3.get(id);
    if (!listeners.size || !entry?.started.has(key)) {
      return;
    }
    send(entry, key, value, details, entry.started.get(key), false);
    entry.started.delete(key);
  }
  function send(entry, key, value, details, previous, live) {
    const instance = entry.instance.deref();
    if (!instance) {
      return;
    }
    const parts = bound(instance);
    if (parts.length) {
      remember(entry, parts);
    }
    const change = {
      ref: entry.ref,
      component: entry.component,
      id: entry.id,
      key,
      value: entry.secret ? "[redacted]" : value,
      previous: entry.secret ? "[redacted]" : previous,
      reason: details.reason,
      source: details.source
    };
    if (entry.label) {
      change.label = entry.label;
    }
    if (entry.row) {
      change.row = entry.row;
    }
    listeners.forEach(
      (hearsSteps, listener) => (live ?? hearsSteps) === hearsSteps && listener(change, parts)
    );
  }
  function install() {
    if (typeof document === "undefined") {
      return;
    }
    if (watchers.add) {
      return;
    }
    watchers.add = watch;
    watchers.change = report;
    watchers.commit = settle2;
    watchEarlier();
  }
  function listen(listener, live = false) {
    install();
    listeners.set(listener, live);
    return () => {
      listeners.delete(listener);
    };
  }

  // ../../../../../../private/var/folders/kh/4q17my9s6bjbn8rw5mscpwmr0000gn/T/ui-sdk-pack-ugM7HV/core/package/dist/testing/mount.js
  var mounted = 0;
  var rerenders = /* @__PURE__ */ new WeakMap();
  var announcers = /* @__PURE__ */ new Set();
  var announceToMounts = (text) => announcers.forEach((hear) => hear(text));
  function listenToAnnouncements(hear) {
    announcers.add(hear);
    setAnnouncer(announceToMounts);
    return () => {
      announcers.delete(hear);
      if (!announcers.size) {
        setAnnouncer(void 0);
      }
    };
  }
  function layOut(el) {
    el.getBoundingClientRect = () => {
      const siblings = el.parentElement ? [...el.parentElement.children].filter(
        (child) => child.getAttribute("data-slot") === el.getAttribute("data-slot")
      ) : [el];
      const index = Math.max(0, siblings.indexOf(el));
      const row = el.closest(
        '[aria-orientation="horizontal"], [data-orientation="horizontal"]'
      );
      const rtl = el.closest("[dir]")?.getAttribute("dir") === "rtl";
      const [width, height] = row ? [100, 40] : [200, 40];
      const x = row ? (rtl ? siblings.length - 1 - index : index) * width : 0;
      const y = row ? 0 : index * height;
      return {
        x,
        y,
        left: x,
        top: y,
        width,
        height,
        right: x + width,
        bottom: y + height,
        toJSON: () => ({})
      };
    };
    el.getClientRects = () => el.isConnected ? [el.getBoundingClientRect()] : [];
  }
  function fillGaps(doc) {
    const proto = Element.prototype;
    proto.getAnimations ??= () => [];
    Element.prototype.scrollIntoView ??= () => {
    };
    if (!doc.querySelector("style[data-ui-sdk-testing]")) {
      const style = doc.createElement("style");
      style.setAttribute("data-ui-sdk-testing", "");
      style.textContent = "[popover][data-open] { display: block !important }";
      doc.head.append(style);
    }
    proto.checkVisibility ??= function() {
      if (!this.isConnected) {
        return false;
      }
      for (let node = this; node; node = node.parentElement) {
        if (node.hidden) {
          return false;
        }
        const style = getComputedStyle(node);
        if (style.display === "none" || style.visibility === "hidden") {
          return false;
        }
      }
      return true;
    };
    doc.elementsFromPoint ??= (x, y) => [...doc.querySelectorAll("[data-slot]")].filter((el) => {
      const box = el.getBoundingClientRect();
      return x >= box.left && x < box.right && y >= box.top && y < box.bottom;
    }).reverse();
    doc.elementFromPoint ??= (x, y) => doc.elementsFromPoint(x, y)[0] ?? null;
  }
  function mount(primitive, options, markup) {
    const schema = schemaOf(primitive);
    const doc = document;
    fillGaps(doc);
    const id = `mount-${++mounted}`;
    const changes = [];
    const settled = [];
    const announced = [];
    const cleanups = [
      listen((change) => change.id === id && changes.push(change), true),
      listen((change) => change.id === id && settled.push(change))
    ];
    const teardown = [listenToAnnouncements((text) => announced.push(text))];
    function unmount() {
      const errors = [];
      for (const step of [...cleanups.splice(0), ...teardown.splice(0)]) {
        try {
          step();
        } catch (error) {
          errors.push(error);
        }
      }
      if (errors.length) {
        throw errors[0];
      }
    }
    function unmountingOnError(run) {
      try {
        return run();
      } catch (error) {
        unmount();
        throw error;
      }
    }
    const container = doc.createElement("div");
    doc.body.append(container);
    teardown.unshift(() => container.remove());
    let current = { ...options, id };
    const instance = unmountingOnError(() => primitive(current));
    teardown.unshift(() => instance.destroy());
    const parts = [];
    const syncs = [];
    function render(node, parent, around) {
      if (typeof node === "string") {
        return parent.appendChild(doc.createTextNode(node));
      }
      const own = schema.slots[node.tag];
      if (!own) {
        const el2 = doc.createElement(node.tag);
        for (const [name, value] of node.attributes) {
          el2.setAttribute(name, value);
        }
        parent.appendChild(el2);
        for (const child of node.children) {
          render(child, el2, around);
        }
        return;
      }
      const slot = node.tag;
      const { props, extra, as } = slotProps(
        own,
        node.attributes,
        around,
        () => `${id}-${slot}-${parts.length}`
      );
      let part = instance.part(slot, props);
      const el = doc.createElement(as ?? tagOf(attrs(part)));
      for (const [name, value] of extra) {
        el.setAttribute(name, value);
      }
      layOut(el);
      const placeholder = doc.createComment(slot);
      parent.appendChild(placeholder);
      let unbind;
      let ready = false;
      const sync = () => {
        applyAttrs(el, attrs(part));
        const shows = present(part);
        const swaps = shows ? placeholder.parentNode : el.parentNode;
        if (shows && swaps) {
          placeholder.replaceWith(el);
        } else if (!shows && swaps) {
          el.replaceWith(placeholder);
        }
        if (!ready) {
          return;
        }
        const rendered2 = shows && !parts.some(
          (outer) => outer.el !== el && !outer.shows() && outer.el.contains(el)
        );
        if (rendered2 && !unbind) {
          let cleanup;
          unbind = () => cleanup?.();
          cleanup = bind(part, el);
        } else if (!rendered2 && unbind) {
          unbind();
          unbind = void 0;
        }
        if (swaps) {
          for (const inner of parts) {
            if (inner.el !== el && el.contains(inner.el)) {
              inner.sync();
            }
          }
        }
      };
      sync();
      syncs.push(sync);
      const inherited = Object.keys(own).flatMap((key) => {
        const from = fromOf(own[key], key);
        return from && !node.attributes.some(([name]) => camel(name) === key) ? [{ key, ...from }] : [];
      });
      let unsubscribe;
      const rerender = (next) => {
        const found2 = instance.part(slot, next);
        if (found2 === part) {
          return;
        }
        unbind?.();
        unbind = void 0;
        unsubscribe?.();
        part = found2;
        entry.key = part.key;
        if (ready) {
          unsubscribe = subscribe(part, sync);
        }
      };
      const entry = {
        slot,
        key: part.key,
        el,
        props,
        inherited,
        sync,
        rerender,
        shows: () => present(part)
      };
      parts.push(entry);
      binds.push(() => {
        ready = true;
        unsubscribe = subscribe(part, sync);
        cleanups.push(
          () => unsubscribe?.(),
          () => unbind?.()
        );
        sync();
      });
      for (const child of node.children) {
        render(child, el, { ...around, [slot]: props });
      }
    }
    const binds = [];
    unmountingOnError(() => {
      for (const node of parseMarkup(markup)) {
        render(node, container, {});
      }
      binds.forEach((bindPart) => bindPart());
    });
    const root = container.firstElementChild ?? container;
    const view2 = {
      /** The first element of the markup, usually the root part. */
      root,
      /** The element of a part, by slot and, for a slot with several parts, its key, like an item's value. */
      part: (slot, key) => parts.find(
        (entry) => entry.slot === slot && (key === void 0 || entry.key === key)
      )?.el,
      /** The instance's state now. */
      get state() {
        return instance.get();
      },
      /** The instance's api, the methods a controller calls. */
      api: instance.api,
      /** Every change that went through, step by step, with its reason and source. */
      changes,
      /** Changes as `observe` reports them: one per interaction a commit settles. */
      settled,
      /** What screen readers would read, in order. */
      announced,
      /** Presses keys one after another on the focused element, like `"Tab"`, `"Shift+Tab"` or `"Space"`. Tab from elsewhere in the page goes into the markup. */
      keys: (...names) => keys(doc, names, container),
      /** Types text into the focused element, a key per character. */
      type: (text) => type(doc, text),
      /** Clicks an element with a mouse. */
      click,
      /** Drags an element with a mouse onto another, or by a distance. */
      drag,
      /** Moves a mouse onto an element. */
      hover,
      /** Waits for what the primitive scheduled: microtasks, a timer and two frames. */
      settle,
      /** Unbinds every part, destroys the instance and removes the markup. */
      unmount
    };
    rerenders.set(view2, {
      setOptions(patch) {
        current = { ...current, ...patch, id };
        instance.setOptions(current);
        syncs.forEach((sync) => sync());
      },
      setProps(slot, key, patch) {
        const entry = parts.find(
          (found2) => found2.slot === slot && (key === "" || found2.key === key)
        );
        if (!entry) {
          throw new Error(`No ${slot} part keyed "${key}" in the markup.`);
        }
        entry.props = { ...entry.props, ...patch };
        entry.rerender(entry.props);
        for (const inner of parts) {
          const taken = inner.inherited.filter(
            (from) => from.slot === slot && from.prop in patch
          );
          if (inner === entry || !taken.length || !entry.el.contains(inner.el)) {
            continue;
          }
          for (const from of taken) {
            inner.props = { ...inner.props, [from.key]: patch[from.prop] };
          }
          inner.rerender(inner.props);
        }
        syncs.forEach((sync) => sync());
      }
    });
    return view2;
  }

  // ../../../../../../private/var/folders/kh/4q17my9s6bjbn8rw5mscpwmr0000gn/T/ui-sdk-pack-ugM7HV/core/package/dist/testing/check-direction.js
  function outcome(view2, dir) {
    const focused = document.activeElement;
    const slot = focused?.getAttribute("data-slot") ?? "";
    const key = focused?.getAttribute("data-value") ?? focused?.textContent?.trim() ?? "";
    const mirrored = { left: "right", right: "left" };
    const state = JSON.stringify(
      view2.state,
      (name, value) => name === "id" ? void 0 : typeof value !== "string" ? value : dir === "rtl" && (name === "direction" || name === "side") && value in mirrored ? mirrored[value] : value.replace(/^mount-\d+/, "mount")
    );
    return { focus: `${slot} ${key}`, state };
  }
  async function press(primitive, options, markup, dir, key) {
    const html = document.documentElement;
    const before = html.getAttribute("dir");
    html.setAttribute("dir", dir);
    try {
      const view2 = mount(primitive, options, markup);
      try {
        await view2.keys("Tab");
        const start = outcome(view2, dir);
        await view2.keys(key);
        return { start, end: outcome(view2, dir) };
      } finally {
        view2.unmount();
      }
    } finally {
      if (before === null) {
        html.removeAttribute("dir");
      } else {
        html.setAttribute("dir", before);
      }
    }
  }
  var running = Promise.resolve();
  function checkDirection(primitive, options, markup) {
    const check = running.then(
      () => compareDirections(primitive, options, markup)
    );
    running = check.catch(() => {
    });
    return check;
  }
  async function compareDirections(primitive, options, markup) {
    const problems = [];
    for (const [forward, mirrored] of [
      ["ArrowRight", "ArrowLeft"],
      ["ArrowLeft", "ArrowRight"]
    ]) {
      const ltr = await press(primitive, options, markup, "ltr", forward);
      const rtl = await press(primitive, options, markup, "rtl", mirrored);
      const moved = ltr.end.focus !== ltr.start.focus || ltr.end.state !== ltr.start.state;
      if (forward === "ArrowRight" && !moved) {
        problems.push(
          "ArrowRight changes nothing left to right, so there's no direction to check"
        );
        break;
      }
      if (rtl.end.focus !== ltr.end.focus) {
        problems.push(
          `${mirrored} right to left focuses ${rtl.end.focus || "nothing"}, where ${forward} left to right focuses ${ltr.end.focus || "nothing"}`
        );
      }
      if (rtl.end.state !== ltr.end.state) {
        problems.push(
          `${mirrored} right to left leaves state ${rtl.end.state}, where ${forward} left to right leaves ${ltr.end.state}`
        );
      }
    }
    if (problems.length) {
      throw new Error(
        `checkDirection found ${problems.length} problem${problems.length === 1 ? "" : "s"}:
- ${problems.join("\n- ")}`
      );
    }
  }

  // ../../../../../../private/var/folders/kh/4q17my9s6bjbn8rw5mscpwmr0000gn/T/ui-sdk-pack-ugM7HV/core/package/dist/testing/pattern-context.js
  var stopped = new Error("checkPattern stopped pressing keys.");
  var defaultOrientation = {
    listbox: "vertical",
    menu: "vertical",
    menubar: "horizontal",
    scrollbar: "vertical",
    slider: "horizontal",
    tablist: "horizontal",
    toolbar: "horizontal",
    tree: "vertical"
  };
  var widgetRoles = /* @__PURE__ */ new Set([
    "button",
    "checkbox",
    "combobox",
    "gridcell",
    "link",
    "menuitem",
    "menuitemcheckbox",
    "menuitemradio",
    "option",
    "radio",
    "slider",
    "switch",
    "tab",
    "textbox",
    "treeitem"
  ]);
  function createContext(root) {
    const doc = root.ownerDocument;
    const problems = /* @__PURE__ */ new Set();
    const watched = /* @__PURE__ */ new Set([root]);
    const problem = (el, rule) => {
      problems.add(`${describe(el)}: ${rule}`);
    };
    function checkReferences() {
      for (const scope of watched) {
        for (const { el, attribute, id } of danglingReferences(scope)) {
          problem(
            el,
            `${attribute} points at "${id}", which isn't in the page; every id reference names a real element (ARIA).`
          );
        }
      }
    }
    async function press2(key) {
      const before = doc.activeElement;
      await keys(doc, [key]);
      const after = doc.activeElement;
      if (!after || after === doc.body || after === doc.documentElement) {
        problem(
          before,
          `after ${key}, focus fell to the body; a key never loses focus (APG: keyboard interface).`
        );
        throw stopped;
      }
      if (isUnreachable(after)) {
        problem(
          after,
          `after ${key}, focus is inside aria-hidden or inert content, where a screen reader can't follow it.`
        );
      }
      checkReferences();
    }
    async function focus(el) {
      ;
      el.focus();
      await settle();
      const active = doc.activeElement;
      if (active && active !== doc.body) {
        return;
      }
      problem(el, "can't take focus.");
      throw stopped;
    }
    return {
      root,
      doc,
      problems,
      problem,
      press: press2,
      focus,
      checkReferences,
      /** Checks id references in a popup that renders outside the root too. */
      watch: (el) => watched.add(el)
    };
  }
  function findWidget(context2, roles) {
    const { root } = context2;
    if (roles.includes(roleOf(root))) {
      return root;
    }
    const inside = withRole(root, roles)[0];
    if (inside) {
      return inside;
    }
    for (const el of [root, ...root.querySelectorAll("[aria-controls]")]) {
      for (const id of ids(el, "aria-controls")) {
        const popup = byId2(el, id);
        if (popup && roles.includes(roleOf(popup))) {
          return popup;
        }
      }
    }
  }
  function requireName(context2, el, source) {
    if (!accessibleName(el)) {
      context2.problem(
        el,
        `has no accessible name; give it aria-label or aria-labelledby (APG ${source}).`
      );
    }
  }
  function orientationOf(context2, el) {
    const fallback = defaultOrientation[roleOf(el)];
    const aria = el.getAttribute("aria-orientation");
    const laidOut = el.getAttribute("data-orientation");
    const read = aria === "horizontal" || aria === "vertical" ? aria : fallback ?? "vertical";
    if (laidOut && fallback && laidOut !== read) {
      context2.problem(
        el,
        `is ${laidOut} (data-orientation) but tells assistive technology it's ${read}; set aria-orientation="${laidOut}" (ARIA: aria-orientation).`
      );
    }
    return read;
  }
  function arrowsFor(orientation, rtl) {
    if (orientation === "vertical") {
      return { next: "ArrowDown", previous: "ArrowUp" };
    }
    return rtl ? { next: "ArrowLeft", previous: "ArrowRight" } : { next: "ArrowRight", previous: "ArrowLeft" };
  }
  function checkOwned(context2, container, allowed, source) {
    for (const el of container.querySelectorAll("*")) {
      const role = roleOf(el);
      if (!widgetRoles.has(role) || allowed.includes(role) || isGone(el) || isUnreachable(el)) {
        continue;
      }
      context2.problem(
        el,
        `is a ${role} inside a ${roleOf(container)}, which owns only ${allowed.join(" and ")} elements (APG ${source}).`
      );
    }
  }
  function triggerOf(popup) {
    if (!popup.id) {
      return void 0;
    }
    return [
      ...popup.getRootNode().querySelectorAll("[aria-controls]")
    ].find(
      (el) => !popup.contains(el) && ids(el, "aria-controls").includes(popup.id)
    );
  }
  function popupOf(el, roles) {
    return ids(el, "aria-controls").map((id) => byId2(el, id)).find((popup) => !!popup && roles.includes(roleOf(popup)));
  }
  function isShown(el) {
    return !!el && !isGone(el) && !isUndisplayed(el);
  }

  // ../../../../../../private/var/folders/kh/4q17my9s6bjbn8rw5mscpwmr0000gn/T/ui-sdk-pack-ugM7HV/core/package/dist/foundation/forms/form.js
  var isDisabledElement = (el) => el.matches(":disabled") || el.getAttribute("aria-disabled") === "true";

  // ../../../../../../private/var/folders/kh/4q17my9s6bjbn8rw5mscpwmr0000gn/T/ui-sdk-pack-ugM7HV/core/package/dist/testing/pattern-controls.js
  var controls = (context2, roles) => [context2.root, ...withRole(context2.root, roles)].filter(
    (el) => roles.includes(roleOf(el)) && !isGone(el)
  );
  async function checkToggles(context2, el, key, state, { name, source, cycle = 2 }) {
    await context2.focus(el);
    const before = state();
    await context2.press(key);
    if (isReadOnly(el)) {
      if (state() !== before) {
        context2.problem(
          el,
          `${key} changed ${name} from "${before}", but aria-readonly="true" says it can't change (ARIA: aria-readonly).`
        );
      }
      return;
    }
    if (state() === before) {
      context2.problem(
        el,
        `${key} should change ${name} from "${before}" (APG ${source}).`
      );
      return;
    }
    for (let press2 = 1; press2 < cycle && state() !== before; press2++) {
      await context2.press(key);
    }
    if (state() !== before && before !== "mixed") {
      context2.problem(
        el,
        `${key} again should change ${name} back to "${before}" (APG ${source}).`
      );
    }
  }
  async function disclosure(context2) {
    const buttons = [
      context2.root,
      ...context2.root.querySelectorAll("[aria-expanded]")
    ].filter((el) => el.hasAttribute("aria-expanded") && !isGone(el));
    if (!buttons.length) {
      context2.problem(
        context2.root,
        "has no button with aria-expanded, so it isn't a disclosure (APG disclosure)."
      );
      return;
    }
    for (const button2 of buttons) {
      if (roleOf(button2) !== "button") {
        context2.problem(
          button2,
          "shows and hides content, so it's a button (APG disclosure)."
        );
      }
      requireName(context2, button2, "disclosure");
      if (!hasBoolean(button2, "aria-expanded")) {
        context2.problem(
          button2,
          `has aria-expanded "${button2.getAttribute("aria-expanded")}"; it's "true" or "false" (APG disclosure).`
        );
      }
    }
    const button = buttons.find((el) => !isDisabledElement(el));
    if (!button) {
      return;
    }
    const expanded = () => button.getAttribute("aria-expanded") ?? "";
    for (const key of ["Enter", "Space"]) {
      await checkToggles(context2, button, key, expanded, {
        name: "aria-expanded",
        source: "disclosure"
      });
    }
  }
  async function accordion(context2) {
    const buttons = withRole(context2.root, ["button"]).filter(
      (el) => el.hasAttribute("aria-expanded")
    );
    if (!buttons.length) {
      context2.problem(
        context2.root,
        "has no header button with aria-expanded, so it isn't an accordion (APG accordion)."
      );
      return;
    }
    for (const button2 of buttons) {
      requireName(context2, button2, "accordion");
      const heading = button2.closest("h1, h2, h3, h4, h5, h6, [role=heading]");
      if (!heading || !context2.root.contains(heading)) {
        context2.problem(
          button2,
          "sits in no heading; each header button is wrapped in an element with role heading (APG accordion)."
        );
      } else if (heading.getAttribute("role") === "heading" && !heading.hasAttribute("aria-level")) {
        context2.problem(
          heading,
          "is a heading without aria-level (APG accordion)."
        );
      }
      if (!hasBoolean(button2, "aria-expanded")) {
        context2.problem(
          button2,
          `has aria-expanded "${button2.getAttribute("aria-expanded")}"; it's "true" or "false" (APG accordion).`
        );
      }
      if (button2.getAttribute("aria-expanded") !== "true") {
        continue;
      }
      const panel = ids(button2, "aria-controls").map((id) => byId2(button2, id))[0];
      if (!panel) {
        context2.problem(
          button2,
          "is expanded but names no panel with aria-controls (APG accordion)."
        );
      } else if (roleOf(panel) === "region" && !ids(panel, "aria-labelledby").length) {
        context2.problem(
          panel,
          "is a region without aria-labelledby; it's labelled by its header button (APG accordion)."
        );
      }
    }
    const button = buttons.find(
      (el) => el.getAttribute("aria-expanded") === "false" && !isDisabledElement(el)
    ) ?? buttons.find((el) => !isDisabledElement(el));
    if (!button) {
      return;
    }
    for (const key of ["Enter", "Space"]) {
      await checkAccordionKey(context2, buttons, button, key);
    }
  }
  async function checkAccordionKey(context2, buttons, button, key) {
    const before = buttons.map((el) => el.getAttribute("aria-expanded"));
    await context2.focus(button);
    await context2.press(key);
    if (button.getAttribute("aria-expanded") === before[buttons.indexOf(button)]) {
      context2.problem(
        button,
        `${key} should toggle its panel, aria-expanded (APG accordion).`
      );
    }
    for (const [index, el] of buttons.entries()) {
      if (el.getAttribute("aria-expanded") === before[index] || isDisabledElement(el)) {
        continue;
      }
      await context2.focus(el);
      await context2.press("Enter");
    }
  }
  async function switchPattern(context2) {
    const switches = controls(context2, ["switch"]);
    if (!switches.length) {
      context2.problem(
        context2.root,
        "has no element with role switch, so it isn't a switch (APG switch)."
      );
      return;
    }
    for (const control of switches) {
      requireName(context2, control, "switch");
      if (!["true", "false"].includes(checkedOf(control))) {
        context2.problem(
          control,
          `has no aria-checked; a switch is on, "true", or off, "false" (APG switch).`
        );
      }
    }
    for (const control of switches.filter((el) => !isDisabledElement(el))) {
      await checkToggles(context2, control, "Space", () => checkedOf(control), {
        name: "aria-checked",
        source: "switch"
      });
    }
  }
  async function checkbox(context2) {
    const boxes = controls(context2, ["checkbox"]);
    if (!boxes.length) {
      context2.problem(
        context2.root,
        "has no element with role checkbox, so it isn't a checkbox (APG checkbox)."
      );
      return;
    }
    for (const box of boxes) {
      requireName(context2, box, "checkbox");
      if (!["true", "false", "mixed"].includes(checkedOf(box))) {
        context2.problem(
          box,
          `has no aria-checked; a checkbox is "true", "false" or "mixed" (APG checkbox).`
        );
      }
    }
    for (const box of boxes.filter((el) => !isDisabledElement(el))) {
      await checkToggles(context2, box, "Space", () => checkedOf(box), {
        name: "aria-checked",
        source: "checkbox",
        cycle: 3
      });
    }
  }
  async function slider(context2) {
    const sliders = controls(context2, ["slider"]);
    if (!sliders.length) {
      context2.problem(
        context2.root,
        "has no element with role slider, so it isn't a slider (APG slider)."
      );
      return;
    }
    for (const thumb of sliders) {
      if (!accessibleName(thumb)) {
        context2.problem(
          thumb,
          "has no accessible name; each slider thumb has its own aria-label or aria-labelledby (APG slider)."
        );
      }
      if (!(thumb instanceof HTMLInputElement) && !thumb.hasAttribute("aria-valuenow")) {
        context2.problem(
          thumb,
          "has no aria-valuenow, the value a screen reader reads (APG slider)."
        );
      }
      orientationOf(context2, thumb);
    }
    for (const thumb of sliders.filter((el) => !isDisabledElement(el))) {
      await checkSliderKeys(context2, thumb);
    }
  }
  async function checkSliderKeys(context2, thumb) {
    const input = thumb instanceof HTMLInputElement ? thumb : void 0;
    const value = () => Number(thumb.getAttribute("aria-valuenow") ?? input?.value);
    const min = () => Number(thumb.getAttribute("aria-valuemin") ?? (input?.min || 0));
    const max = () => Number(thumb.getAttribute("aria-valuemax") ?? (input?.max || 100));
    const vertical = orientationOf(context2, thumb) === "vertical";
    const [increase, decrease] = vertical ? ["ArrowUp", "ArrowDown"] : isRtl(thumb) ? ["ArrowLeft", "ArrowRight"] : ["ArrowRight", "ArrowLeft"];
    const expectChange = async (key, up) => {
      const before = value();
      await context2.press(key);
      const after = value();
      if (up ? after > before : after < before) {
        return;
      }
      context2.problem(
        thumb,
        `${key} should ${up ? "raise" : "lower"} the value from ${before}, but it's ${after} (APG slider).`
      );
    };
    await context2.focus(thumb);
    const start = value();
    if (isReadOnly(thumb)) {
      const key = start >= max() ? decrease : increase;
      await context2.press(key);
      if (value() !== start) {
        context2.problem(
          thumb,
          `${key} changed the value from ${start} to ${value()}, but aria-readonly="true" says it can't change (ARIA: aria-readonly).`
        );
      }
      return;
    }
    const pairs = vertical ? [[increase, decrease]] : [
      ["ArrowUp", "ArrowDown"],
      [increase, decrease]
    ];
    for (const [up, down] of pairs) {
      const atMax = value() >= max();
      await expectChange(atMax ? down : up, !atMax);
      await expectChange(atMax ? up : down, atMax);
    }
    await context2.press("End");
    if (value() !== max()) {
      context2.problem(
        thumb,
        `End should set the value to its maximum, ${max()}, but it's ${value()} (APG slider).`
      );
    }
    await context2.press("Home");
    if (value() !== min()) {
      context2.problem(
        thumb,
        `Home should set the value to its minimum, ${min()}, but it's ${value()} (APG slider).`
      );
    }
    if (max() - start < start - min()) {
      await context2.press("End");
    }
    await pressToward(
      context2,
      value,
      start,
      value() < start ? "PageUp" : "PageDown"
    );
    await pressToward(
      context2,
      value,
      start,
      value() < start ? increase : decrease
    );
  }
  async function pressToward(context2, value, target, key) {
    const below = value() < target;
    const distance = Math.abs(target - value());
    let presses = 1;
    for (let press2 = 0; press2 < presses && value() !== target; press2++) {
      const before = value();
      await context2.press(key);
      const moved = below ? value() - before : before - value();
      if (moved <= 0) {
        return;
      }
      if (!press2) {
        presses = Math.floor(distance / moved + 1e-9);
      }
    }
  }

  // ../../../../../../private/var/folders/kh/4q17my9s6bjbn8rw5mscpwmr0000gn/T/ui-sdk-pack-ugM7HV/core/package/dist/testing/composite.js
  function currentItem(context2, composite) {
    const active = context2.doc.activeElement;
    const items = composite.items();
    const descendant = active?.getAttribute("aria-activedescendant");
    if (descendant) {
      return items.find((item) => item.id === descendant);
    }
    if (!active) {
      return void 0;
    }
    return items.find((item) => item === active) ?? items.filter((item) => item.contains(active)).at(-1);
  }
  function scan(items, start, step) {
    const passed = [];
    for (let index = start; index >= 0 && index < items.length; index += step) {
      passed.push(items[index]);
      if (!isDisabledElement(items[index])) {
        return { passed, reached: true };
      }
    }
    return { passed, reached: false };
  }
  function stepTargets(items, index, forward, wraps) {
    const step = forward ? 1 : -1;
    const ahead = scan(items, index + step, step);
    if (ahead.reached) {
      return ahead.passed;
    }
    const around = scan(items, forward ? 0 : items.length - 1, step).passed;
    const stays = [items[index], ...ahead.passed];
    if (wraps === true) {
      return [...ahead.passed, ...around];
    }
    if (wraps === false) {
      return stays;
    }
    return [...stays, ...around];
  }
  function checkTabStop(context2, composite, required = true) {
    const { container, noun, source } = composite;
    const stops = tabStops(container);
    if (stops.length > 1) {
      context2.problem(
        container,
        `has ${stops.length} tab stops (${stops.map(describe).join(", ")}); a composite has one, and arrows move within it (APG ${source}).`
      );
    } else if (!stops.length && required) {
      context2.problem(
        container,
        `has no tab stop; one ${noun} takes Tab, or the ${roleOf(container)} itself with aria-activedescendant (APG ${source}).`
      );
    } else if (stops.length === 1 && container.hasAttribute("aria-activedescendant") && stops[0] !== container) {
      context2.problem(
        stops[0],
        `takes Tab, but with aria-activedescendant the ${roleOf(container)} itself is the tab stop (APG ${source}).`
      );
    }
  }
  async function enter(context2, composite) {
    const stop = tabStops(composite.container)[0] ?? composite.items().find((item) => !isDisabledElement(item));
    if (!stop) {
      throw stopped;
    }
    await context2.focus(stop);
    return currentItem(context2, composite);
  }
  async function expectMove(context2, composite, key, allowed, expected) {
    const from = currentItem(context2, composite);
    await context2.press(key);
    const to = currentItem(context2, composite);
    if (to && allowed.includes(to)) {
      return to;
    }
    const outcome2 = !to ? `focus went to ${describe(context2.doc.activeElement)}, outside the ${composite.noun}s` : to === from ? "focus stayed" : `focus went to ${describe(to)}`;
    context2.problem(
      from ?? composite.container,
      `${key} should move focus to ${expected}, ${describe(allowed[0])}, but ${outcome2} (APG ${composite.source}).`
    );
    if (!to) {
      throw stopped;
    }
    return to;
  }
  async function expectStep(context2, composite, key, forward, wraps) {
    const items = composite.items();
    const from = currentItem(context2, composite);
    const index = from ? items.indexOf(from) : -1;
    const allowed = index < 0 ? scan(items, 0, 1).passed : stepTargets(items, index, forward, wraps);
    const atEnd = index >= 0 && !scan(items, index + (forward ? 1 : -1), forward ? 1 : -1).reached;
    const expected = index < 0 ? `the first ${composite.noun}` : `the ${forward ? "next" : "previous"} ${composite.noun}`;
    return expectMove(
      context2,
      composite,
      key,
      allowed,
      atEnd && wraps ? `${expected}, wrapping around` : expected
    );
  }
  async function checkNavigation(context2, composite, moves) {
    const start = currentItem(context2, composite);
    const items = composite.items();
    if (items.length < 2) {
      return start;
    }
    const step = async (key, forward) => {
      const to = await expectStep(context2, composite, key, forward, moves.wraps);
      moves.onMove?.(key, to);
    };
    const jump = async (key) => {
      const all = composite.items();
      const allowed = key === "Home" ? scan(all, 0, 1).passed : scan(all, all.length - 1, -1).passed;
      const to = await expectMove(
        context2,
        composite,
        key,
        allowed,
        `the ${key === "Home" ? "first" : "last"} ${composite.noun}`
      );
      moves.onMove?.(key, to);
    };
    if (moves.homeEnd) {
      await jump("Home");
    }
    for (const key of moves.next) {
      await step(key, true);
    }
    for (const key of moves.previous) {
      await step(key, false);
    }
    if (moves.homeEnd) {
      await jump("End");
    } else {
      for (let guard = items.length; guard > 0; guard--) {
        const all = composite.items();
        const index = all.indexOf(currentItem(context2, composite));
        if (!scan(all, index + 1, 1).reached) {
          break;
        }
        await step(moves.next[0], true);
      }
    }
    await step(moves.next[0], true);
    await step(moves.previous[0], false);
    return start;
  }
  async function returnTo(context2, composite, target, arrows) {
    if (!target) {
      return;
    }
    for (let guard = composite.items().length * 2; guard > 0; guard--) {
      const items = composite.items();
      const current = currentItem(context2, composite);
      if (!current || current === target || !items.includes(target)) {
        return;
      }
      await context2.press(
        items.indexOf(target) > items.indexOf(current) ? arrows.next : arrows.previous
      );
    }
  }
  var initialOf = (el) => accessibleName(el).charAt(0).toLowerCase();
  async function checkTypeahead(context2, composite, arrows) {
    const items = composite.items();
    const unique = items.filter(
      (item) => !isDisabledElement(item) && /^[a-z0-9]$/.test(initialOf(item)) && items.filter((other) => initialOf(other) === initialOf(item)).length === 1
    );
    const index = items.indexOf(currentItem(context2, composite));
    if (unique.length === 1 && unique[0] === items[index]) {
      await context2.press(
        index < items.length - 1 ? arrows.next : arrows.previous
      );
    }
    const from = currentItem(context2, composite);
    const target = unique.find((item) => item !== from);
    if (!target) {
      return;
    }
    const letter = initialOf(target);
    await context2.press(letter);
    if (currentItem(context2, composite) === target) {
      return;
    }
    context2.problem(
      from ?? composite.container,
      `typing "${letter}" should move focus to ${describe(target)}, the ${composite.noun} whose name starts with it (APG ${composite.source}: type-ahead).`
    );
  }

  // ../../../../../../private/var/folders/kh/4q17my9s6bjbn8rw5mscpwmr0000gn/T/ui-sdk-pack-ugM7HV/core/package/dist/testing/pattern-lists.js
  var isSelected = (el) => el.getAttribute("aria-selected") === "true" || el.getAttribute("aria-checked") === "true";
  var isChecked = (el) => checkedOf(el) === "true";
  function missing(context2, roles, pattern) {
    context2.problem(
      context2.root,
      `has no element with role ${roles}, so it isn't a ${pattern}.`
    );
  }
  async function listbox(context2) {
    const box = findWidget(context2, ["listbox"]);
    if (!box) {
      return missing(context2, "listbox", "listbox");
    }
    context2.watch(box);
    requireName(context2, box, "listbox");
    checkOwned(context2, box, ["option"], "listbox");
    const multiple = box.getAttribute("aria-multiselectable") === "true";
    const options = withRole(box, ["option"]);
    if (!options.length) {
      context2.problem(
        box,
        "owns no option; a listbox's items have role option (APG listbox)."
      );
    }
    for (const option of options) {
      if (!option.hasAttribute("aria-selected") && !(multiple && option.hasAttribute("aria-checked"))) {
        context2.problem(
          option,
          `has no aria-selected; a selectable option says whether it's selected, "true" or "false" (APG listbox).`
        );
      }
    }
    const selected = options.filter(isSelected);
    if (!multiple && selected.length > 1) {
      context2.problem(
        box,
        `has ${selected.length} selected options without aria-multiselectable="true" (APG listbox).`
      );
    }
    const composite = {
      container: box,
      items: () => withRole(box, ["option"]),
      noun: "option",
      source: "listbox"
    };
    const arrows = arrowsFor(orientationOf(context2, box), isRtl(box));
    const owner = triggerOf(box);
    const popup = !!owner && roleOf(owner) === "combobox";
    checkTabStop(context2, composite, !popup);
    if (options.length < 2) {
      return;
    }
    await enter(context2, composite);
    const start = await checkNavigation(context2, composite, {
      next: [arrows.next],
      previous: [arrows.previous],
      homeEnd: true
    });
    const readOnly = box.getAttribute("aria-readonly") === "true" || isDisabledElement(box);
    if (!readOnly && (multiple || !popup)) {
      await checkSpaceSelects(context2, composite, arrows, multiple);
    }
    await checkTypeahead(context2, composite, arrows);
    await returnTo(context2, composite, start, arrows);
  }
  async function checkSpaceSelects(context2, composite, arrows, multiple) {
    const before = composite.items().filter(isSelected);
    let option = currentItem(context2, composite);
    if (option && (isSelected(option) || isDisabledElement(option))) {
      await context2.press(arrows.next);
      option = currentItem(context2, composite);
    }
    if (!option || isSelected(option) || isDisabledElement(option)) {
      return;
    }
    await context2.press("Space");
    if (!isSelected(option)) {
      context2.problem(
        option,
        `Space should select the focused option (APG listbox).`
      );
      return;
    }
    if (multiple) {
      await context2.press("Space");
    } else if (before[0]) {
      await returnTo(context2, composite, before[0], arrows);
      if (!isSelected(before[0])) {
        await context2.press("Space");
      }
    }
  }
  async function tabs(context2) {
    const list = findWidget(context2, ["tablist"]);
    if (!list) {
      return missing(context2, "tablist", "tabs");
    }
    requireName(context2, list, "tabs");
    checkOwned(context2, list, ["tab"], "tabs");
    const all = withRole(list, ["tab"]);
    if (!all.length) {
      context2.problem(
        list,
        "owns no tab; a tablist's items have role tab (APG tabs)."
      );
    }
    for (const tab of all) {
      if (!hasBoolean(tab, "aria-selected")) {
        context2.problem(
          tab,
          `has no aria-selected; the active tab has aria-selected="true" and the others "false" (APG tabs).`
        );
      }
    }
    const selected = all.filter(isSelected);
    if (selected.length > 1) {
      context2.problem(
        list,
        `has ${selected.length} selected tabs; one tab is active (APG tabs).`
      );
    }
    checkPanels(context2, all);
    const composite = {
      container: list,
      items: () => withRole(list, ["tab"]),
      noun: "tab",
      source: "tabs"
    };
    const arrows = arrowsFor(orientationOf(context2, list), isRtl(list));
    checkTabStop(context2, composite);
    const stop = tabStops(list)[0];
    if (stop && selected[0] && !isDisabledElement(selected[0]) && stop !== selected[0]) {
      context2.problem(
        stop,
        `takes Tab, but the active tab, ${describe(selected[0])}, should (APG tabs).`
      );
    }
    if (all.length < 2) {
      return;
    }
    const start = await enter(context2, composite);
    await checkNavigation(context2, composite, {
      next: [arrows.next],
      previous: [arrows.previous],
      wraps: true,
      homeEnd: true
    });
    for (const key of ["Enter", "Space"]) {
      const tab = await expectStep(context2, composite, arrows.next, true, true);
      if (isSelected(tab) || isDisabledElement(tab)) {
        continue;
      }
      await context2.press(key);
      if (!isSelected(tab)) {
        context2.problem(tab, `${key} should activate the focused tab (APG tabs).`);
      }
      checkPanels(context2, composite.items());
    }
    await returnTo(context2, composite, start, arrows);
    if (start && !isSelected(start)) {
      await context2.press("Enter");
    }
  }
  function checkPanels(context2, all) {
    for (const tab of all) {
      const panels = ids(tab, "aria-controls").map((id) => context2.doc.getElementById(id)).filter((panel) => !!panel);
      if (isSelected(tab) && !panels.length) {
        context2.problem(
          tab,
          "is active but names no tabpanel with aria-controls (APG tabs)."
        );
      }
      for (const panel of panels) {
        if (roleOf(panel) !== "tabpanel") {
          context2.problem(
            tab,
            `aria-controls points at ${describe(panel)}, which isn't a tabpanel (APG tabs).`
          );
          continue;
        }
        if (!tab.id || !ids(panel, "aria-labelledby").includes(tab.id)) {
          context2.problem(
            panel,
            `is labelled by its tab, ${describe(tab)}, with aria-labelledby (APG tabs).`
          );
        }
      }
    }
  }
  async function radioGroup(context2) {
    const group = findWidget(context2, ["radiogroup"]);
    if (!group) {
      return missing(context2, "radiogroup", "radio group");
    }
    requireName(context2, group, "radio group");
    checkOwned(context2, group, ["radio"], "radio group");
    const radios = withRole(group, ["radio"]);
    if (!radios.length) {
      context2.problem(
        group,
        "owns no radio; a radiogroup's items have role radio (APG radio group)."
      );
    }
    for (const radio of radios) {
      if (!(radio instanceof HTMLInputElement) && !hasBoolean(radio, "aria-checked")) {
        context2.problem(
          radio,
          `has no aria-checked; a radio says whether it's checked, "true" or "false" (APG radio group).`
        );
      }
    }
    const checked2 = radios.filter(isChecked);
    if (checked2.length > 1) {
      context2.problem(
        group,
        `has ${checked2.length} checked radios; one is checked at most (APG radio group).`
      );
    }
    const composite = {
      container: group,
      items: () => withRole(group, ["radio"]),
      noun: "radio",
      source: "radio group"
    };
    checkTabStop(context2, composite);
    const stop = tabStops(group)[0];
    if (stop && checked2[0] && !isDisabledElement(checked2[0]) && stop !== checked2[0]) {
      context2.problem(
        stop,
        `takes Tab, but the checked radio, ${describe(checked2[0])}, should (APG radio group).`
      );
    }
    if (radios.length < 2) {
      return;
    }
    const start = await enter(context2, composite);
    const readOnly = isReadOnly(group);
    let held2 = checked2[0];
    const kept = (key, radio) => {
      if (isChecked(radio) && radio !== checked2[0]) {
        context2.problem(
          radio,
          `${key} checked it, but the group's aria-readonly="true" says it can't change (ARIA: aria-readonly).`
        );
      } else if (held2 && !isChecked(held2)) {
        context2.problem(
          held2,
          `${key} unchecked it, but the group's aria-readonly="true" says it can't change (ARIA: aria-readonly).`
        );
        held2 = void 0;
      }
    };
    if (start && !isChecked(start) && !isDisabledElement(start)) {
      await context2.press("Space");
      if (readOnly) {
        kept("Space", start);
      } else if (!isChecked(start)) {
        context2.problem(
          start,
          "Space should check the focused radio (APG radio group)."
        );
      }
    }
    const rtl = isRtl(group);
    const [forward, back] = rtl ? ["ArrowLeft", "ArrowRight"] : ["ArrowRight", "ArrowLeft"];
    await checkNavigation(context2, composite, {
      next: ["ArrowDown", forward],
      previous: ["ArrowUp", back],
      wraps: true,
      homeEnd: false,
      onMove: (key, radio) => {
        if (readOnly) {
          kept(key, radio);
        } else if (!isChecked(radio) && !isDisabledElement(radio)) {
          context2.problem(
            radio,
            `${key} should check the radio it moves to (APG radio group).`
          );
        }
      }
    });
    await returnTo(context2, composite, start, {
      next: "ArrowDown",
      previous: "ArrowUp"
    });
  }
  var isEditable2 = (el) => el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement && !/^(button|checkbox|radio|submit|reset|range|color|file|image)$/.test(
    el.type
  ) || el.isContentEditable;
  async function toolbar(context2) {
    const bar = findWidget(context2, ["toolbar"]);
    if (!bar) {
      return missing(context2, "toolbar", "toolbar");
    }
    if (withRole(context2.doc.body, ["toolbar"]).length > 1) {
      requireName(context2, bar, "toolbar");
    }
    const composite = {
      container: bar,
      items: () => focusables(bar).filter((el) => !isUnreachable(el)),
      noun: "control",
      source: "toolbar"
    };
    const arrows = arrowsFor(orientationOf(context2, bar), isRtl(bar));
    checkTabStop(context2, composite);
    const items = composite.items();
    if (items.length < 2 || items.some(isEditable2)) {
      return;
    }
    const start = await enter(context2, composite);
    await checkNavigation(context2, composite, {
      next: [arrows.next],
      previous: [arrows.previous],
      homeEnd: true
    });
    await returnTo(context2, composite, start, arrows);
  }
  var menuItemRoles = ["menuitem", "menuitemcheckbox", "menuitemradio"];
  var ownItems = (container) => withRole(container, menuItemRoles).filter(
    (item) => item.parentElement?.closest('[role="menu"], [role="menubar"]') === container
  );
  async function menubar(context2) {
    const bar = findWidget(context2, ["menubar"]);
    if (!bar) {
      return missing(context2, "menubar", "menubar");
    }
    checkOwned(context2, bar, menuItemRoles, "menubar");
    const items = ownItems(bar);
    if (!items.length) {
      context2.problem(
        bar,
        "owns no menuitem; a menubar's items have role menuitem (APG menubar)."
      );
    }
    for (const item of items) {
      if (item.hasAttribute("aria-haspopup") && !hasBoolean(item, "aria-expanded")) {
        context2.problem(
          item,
          `opens a menu but has no aria-expanded, "true" or "false" (APG menubar).`
        );
      }
    }
    const composite = {
      container: bar,
      items: () => ownItems(bar),
      noun: "item",
      source: "menubar"
    };
    const orientation = orientationOf(context2, bar);
    const arrows = arrowsFor(orientation, isRtl(bar));
    checkTabStop(context2, composite);
    if (items.length < 2) {
      return;
    }
    const start = await enter(context2, composite);
    await checkNavigation(context2, composite, {
      next: [arrows.next],
      previous: [arrows.previous],
      wraps: true,
      homeEnd: true
    });
    const opener = composite.items().find(
      (item) => item.hasAttribute("aria-haspopup") && !isDisabledElement(item)
    );
    if (opener) {
      await returnTo(context2, composite, opener, arrows);
      const opens = orientation === "vertical" ? arrowsFor("horizontal", isRtl(bar)).next : "ArrowDown";
      await checkSubmenu(context2, opener, opens);
    }
    await returnTo(context2, composite, start, arrows);
  }
  async function checkSubmenu(context2, item, key) {
    if (context2.doc.activeElement !== item) {
      return;
    }
    await context2.press(key);
    const menu2 = popupOf(item, ["menu"]);
    if (!menu2 || !isShown(menu2) || item.getAttribute("aria-expanded") !== "true") {
      context2.problem(
        item,
        `${key} should open its menu, with aria-expanded="true" (APG menubar).`
      );
      return;
    }
    context2.watch(menu2);
    if (!menu2.contains(context2.doc.activeElement)) {
      context2.problem(
        menu2,
        `opened, but focus stayed on ${describe(context2.doc.activeElement)}; it moves into the menu (APG menubar).`
      );
    }
    await context2.press("Escape");
    if (isShown(menu2)) {
      context2.problem(menu2, "Escape should close it (APG menubar).");
    } else if (context2.doc.activeElement !== item) {
      context2.problem(
        item,
        `Escape closed its menu, but focus went to ${describe(context2.doc.activeElement)}, not back to it (APG menubar).`
      );
    }
  }
  async function tree(context2) {
    const box = findWidget(context2, ["tree"]);
    if (!box) {
      return missing(context2, "tree", "tree view");
    }
    requireName(context2, box, "tree view");
    checkOwned(context2, box, ["treeitem"], "tree view");
    const items = withRole(box, ["treeitem"], { displayed: false });
    if (!items.length) {
      context2.problem(
        box,
        "owns no treeitem; a tree's items have role treeitem (APG tree view)."
      );
    }
    for (const item of items) {
      const group = withRole(item, ["group"], { displayed: false }).find(
        (el) => el.parentElement?.closest('[role="treeitem"]') === item
      );
      if ((group || item.hasAttribute("aria-owns")) && !hasBoolean(item, "aria-expanded")) {
        context2.problem(
          item,
          `has child items but no aria-expanded, "true" or "false" (APG tree view).`
        );
      }
    }
    const composite = {
      container: box,
      items: () => withRole(box, ["treeitem"]),
      noun: "item",
      source: "tree view"
    };
    orientationOf(context2, box);
    checkTabStop(context2, composite);
    if (!items.length) {
      return;
    }
    const start = await enter(context2, composite);
    const arrows = { next: "ArrowDown", previous: "ArrowUp" };
    await checkNavigation(context2, composite, {
      next: [arrows.next],
      previous: [arrows.previous],
      homeEnd: true
    });
    await checkBranch(context2, composite, isRtl(box));
    await checkTypeahead(context2, composite, arrows);
    await returnTo(context2, composite, start, arrows);
  }
  async function checkBranch(context2, composite, rtl) {
    const [open, close] = rtl ? ["ArrowLeft", "ArrowRight"] : ["ArrowRight", "ArrowLeft"];
    const branch = composite.items().find(
      (item) => item.hasAttribute("aria-expanded") && !isDisabledElement(item)
    );
    if (!branch) {
      return;
    }
    await returnTo(context2, composite, branch, {
      next: "ArrowDown",
      previous: "ArrowUp"
    });
    if (currentItem(context2, composite) !== branch) {
      return;
    }
    const expanded = () => branch.getAttribute("aria-expanded") === "true";
    const wasExpanded = expanded();
    if (!wasExpanded) {
      await context2.press(open);
      if (!expanded()) {
        context2.problem(
          branch,
          `${open} should expand a closed branch (APG tree view).`
        );
      } else if (currentItem(context2, composite) !== branch) {
        context2.problem(
          branch,
          `${open} should expand the branch and keep focus on it (APG tree view).`
        );
      }
    }
    if (expanded()) {
      const all = composite.items();
      const next = all[all.indexOf(branch) + 1];
      const level = Number(branch.getAttribute("aria-level"));
      const isChild = !!next && (branch.contains(next) || !!level && Number(next.getAttribute("aria-level")) === level + 1);
      if (isChild) {
        await context2.press(open);
        if (currentItem(context2, composite) !== next) {
          context2.problem(
            branch,
            `${open} on an open branch should move focus to its first child, ${describe(next)} (APG tree view).`
          );
        } else {
          await context2.press(close);
          if (currentItem(context2, composite) !== branch) {
            context2.problem(
              next,
              `${close} on a child should move focus to its parent, ${describe(branch)} (APG tree view).`
            );
          }
        }
      }
    }
    if (currentItem(context2, composite) !== branch) {
      return;
    }
    await context2.press(close);
    if (expanded()) {
      context2.problem(
        branch,
        `${close} should collapse an open branch (APG tree view).`
      );
    } else if (wasExpanded) {
      await context2.press(open);
    }
  }

  // ../../../../../../private/var/folders/kh/4q17my9s6bjbn8rw5mscpwmr0000gn/T/ui-sdk-pack-ugM7HV/core/package/dist/testing/pattern-popups.js
  async function reopen(context2, trigger, key, roles, source) {
    if (context2.doc.activeElement !== trigger) {
      return void 0;
    }
    await context2.press(key);
    const popup = popupOf(trigger, roles);
    if (!popup || !isShown(popup)) {
      context2.problem(
        trigger,
        `${key} should open its ${roles[0]} (APG ${source}).`
      );
      return void 0;
    }
    context2.watch(popup);
    if (!popup.contains(context2.doc.activeElement)) {
      context2.problem(
        popup,
        `opened with ${key}, but focus stayed on ${describe(context2.doc.activeElement)}; it moves into the ${roles[0]} (APG ${source}).`
      );
    }
    return popup;
  }
  async function checkEscape(context2, popup, trigger, source) {
    await context2.press("Escape");
    const now = popup.id && context2.doc.getElementById(popup.id) || popup;
    if (isShown(now)) {
      context2.problem(popup, `Escape should close it (APG ${source}).`);
      return false;
    }
    const active = context2.doc.activeElement;
    if (trigger && active !== trigger) {
      context2.problem(
        trigger,
        `focus should return here when Escape closes ${describe(popup)}, but went to ${describe(active)} (APG ${source}).`
      );
    }
    return true;
  }
  async function menu(context2) {
    const popup = findWidget(context2, ["menu"]);
    if (!popup || !isShown(popup)) {
      context2.problem(
        context2.root,
        "has no open menu; open it before checking the menu pattern."
      );
      return;
    }
    context2.watch(popup);
    const trigger = triggerOf(popup);
    if (trigger) {
      context2.watch(trigger);
      if (!["menu", "true"].includes(trigger.getAttribute("aria-haspopup") ?? "")) {
        context2.problem(
          trigger,
          `opens a menu, so it has aria-haspopup="menu" or "true" (APG menu button).`
        );
      }
      if (trigger.getAttribute("aria-expanded") !== "true") {
        context2.problem(
          trigger,
          `has aria-expanded="true" while its menu is open (APG menu button).`
        );
      }
    }
    checkOwned(context2, popup, menuItemRoles, "menu");
    const items = ownItems(popup);
    if (!items.length) {
      context2.problem(
        popup,
        "owns no menuitem; a menu's items have role menuitem (APG menu)."
      );
    }
    for (const item of items) {
      const role = roleOf(item);
      const states = role === "menuitemcheckbox" ? ["true", "false", "mixed"] : ["true", "false"];
      if (role !== "menuitem" && !states.includes(item.getAttribute("aria-checked") ?? "")) {
        context2.problem(
          item,
          `has no aria-checked; a ${role} says whether it's checked (APG menu).`
        );
      }
    }
    const composite = {
      container: popup,
      items: () => ownItems(popup),
      noun: "item",
      source: "menu"
    };
    checkTabStop(context2, composite, false);
    const active = context2.doc.activeElement;
    if (!popup.contains(active) && !active?.hasAttribute("aria-activedescendant")) {
      context2.problem(
        popup,
        `is open, but focus is on ${describe(active)}; opening a menu moves focus into it (APG menu button).`
      );
      return;
    }
    if (!items.length) {
      return;
    }
    const arrows = arrowsFor(orientationOf(context2, popup), isRtl(popup));
    const start = currentItem(context2, composite) ?? await expectStep(context2, composite, arrows.next, true, void 0);
    await checkNavigation(context2, composite, {
      next: [arrows.next],
      previous: [arrows.previous],
      homeEnd: true
    });
    await checkTypeahead(context2, composite, arrows);
    await returnTo(context2, composite, start, arrows);
    if (!await checkEscape(context2, popup, trigger, "menu button") || !trigger) {
      return;
    }
    if (trigger.getAttribute("aria-expanded") === "true") {
      context2.problem(
        trigger,
        `still has aria-expanded="true" after its menu closed (APG menu button).`
      );
    }
    const reopened = await reopen(
      context2,
      trigger,
      "Enter",
      ["menu"],
      "menu button"
    );
    if (reopened) {
      await checkEnterActivates(context2, reopened, trigger);
    }
  }
  async function checkEnterActivates(context2, popup, trigger) {
    const composite = {
      container: popup,
      items: () => ownItems(popup),
      noun: "item",
      source: "menu"
    };
    const item = composite.items().find(
      (el) => roleOf(el) === "menuitem" && !el.hasAttribute("aria-haspopup") && !isDisabledElement(el)
    );
    if (!item) {
      return;
    }
    await returnTo(context2, composite, item, {
      next: "ArrowDown",
      previous: "ArrowUp"
    });
    if (currentItem(context2, composite) !== item) {
      return;
    }
    await context2.press("Enter");
    if (isShown(popup)) {
      context2.problem(
        item,
        "Enter should activate the item and close the menu (APG menu)."
      );
      return;
    }
    if (context2.doc.activeElement !== trigger) {
      context2.problem(
        trigger,
        `focus should return here when an item's Enter closes the menu, but went to ${describe(context2.doc.activeElement)} (APG menu button).`
      );
    } else {
      await reopen(context2, trigger, "Enter", ["menu"], "menu button");
    }
  }
  function isInert(el) {
    for (let node = el; node; node = node.parentElement) {
      if (node.inert === true || node.hasAttribute("inert")) {
        return true;
      }
    }
    return false;
  }
  var isPage = (el) => !el.matches("script, style, template") && (isInert(el) || !!el.textContent?.trim() || tabStops(el).length > 0);
  function isPageInert(popup) {
    const trigger = triggerOf(popup);
    if (trigger) {
      return isInert(trigger);
    }
    for (let node = popup; node.parentElement; node = node.parentElement) {
      const page = [...node.parentElement.children].filter(
        (el) => el !== node && isPage(el)
      );
      if (page.length) {
        return page.every((el) => isInert(el));
      }
    }
    return false;
  }
  async function modal(context2, role) {
    const source = role === "dialog" ? "dialog (modal)" : "alert dialog";
    const popup = findWidget(context2, [role]);
    if (!popup || !isShown(popup)) {
      context2.problem(
        context2.root,
        `has no open ${role}; open it before checking the ${source} pattern.`
      );
      return;
    }
    context2.watch(popup);
    requireName(context2, popup, source);
    if (role === "alertdialog" && !ids(popup, "aria-describedby").length) {
      context2.problem(
        popup,
        "has no aria-describedby; an alert dialog points it at its message (APG alert dialog)."
      );
    }
    const inside = () => popup.contains(context2.doc.activeElement);
    if (!inside()) {
      context2.problem(
        popup,
        `is open, but focus is on ${describe(context2.doc.activeElement)}; opening a dialog moves focus into it (APG ${source}).`
      );
      return;
    }
    const first = context2.doc.activeElement;
    const pageInert = isPageInert(popup);
    const stops = tabStops(popup).length;
    let trapped = true;
    for (const key of ["Tab", "Shift+Tab"]) {
      const from = context2.doc.activeElement;
      let moved = false;
      for (let press2 = 0; press2 <= stops && trapped; press2++) {
        await context2.press(key);
        if (!inside()) {
          trapped = false;
        }
        if (context2.doc.activeElement !== from) {
          moved = true;
        }
      }
      if (trapped && !moved && stops > 1) {
        context2.problem(
          popup,
          `${key} keeps focus on ${describe(from)}; it moves through the dialog's ${stops} tab stops, wrapping at the ends (APG ${source}).`
        );
      }
    }
    const modal2 = pageInert || popup.getAttribute("aria-modal") === "true";
    if (modal2 && !trapped) {
      context2.problem(
        popup,
        `is modal, but Tab moved focus out of it, to ${describe(context2.doc.activeElement)}; it wraps inside (APG ${source}).`
      );
    }
    if (modal2 && popup.getAttribute("aria-modal") !== "true" && !(popup instanceof HTMLDialogElement)) {
      context2.problem(
        popup,
        `is modal but has no aria-modal="true", which tells screen readers the page behind it is inert (APG ${source}).`
      );
    }
    if (!inside()) {
      first?.focus();
    }
    const trigger = triggerOf(popup);
    if (await checkEscape(context2, popup, trigger, source) && trigger) {
      await reopen(context2, trigger, "Enter", [role], source);
    }
  }
  var dialog = (context2) => modal(context2, "dialog");
  var alertdialog = (context2) => modal(context2, "alertdialog");
  async function combobox(context2) {
    const box = findWidget(context2, ["combobox"]);
    if (!box) {
      context2.problem(
        context2.root,
        "has no element with role combobox, so it isn't a combobox."
      );
      return;
    }
    requireName(context2, box, "combobox");
    const expanded = () => box.getAttribute("aria-expanded") === "true";
    if (!["true", "false"].includes(box.getAttribute("aria-expanded") ?? "")) {
      context2.problem(
        box,
        `has no aria-expanded; a combobox says whether its popup is open, "true" or "false" (APG combobox).`
      );
    }
    if (!tabStops(box).includes(box)) {
      context2.problem(
        box,
        "isn't a tab stop; a combobox takes Tab (APG combobox)."
      );
    }
    const wasOpen = expanded();
    await context2.focus(box);
    if (!expanded()) {
      await context2.press("ArrowDown");
    }
    if (!expanded()) {
      context2.problem(
        box,
        'ArrowDown should open its popup, with aria-expanded="true" (APG combobox).'
      );
      return;
    }
    const popup = popupOf(box, ["listbox", "grid", "tree", "dialog"]);
    if (!popup || !isShown(popup)) {
      context2.problem(
        box,
        "is expanded, but its aria-controls names no open listbox, grid, tree or dialog (APG combobox)."
      );
      return;
    }
    context2.watch(popup);
    const kind = roleOf(popup);
    if (kind !== "listbox" && box.getAttribute("aria-haspopup") !== kind) {
      context2.problem(
        box,
        `controls a ${kind}, so it has aria-haspopup="${kind}"; only a listbox popup goes without it (APG combobox).`
      );
    }
    if (kind === "listbox") {
      await checkActiveOption(context2, box, popup);
    }
    await context2.press("Escape");
    if (expanded()) {
      context2.problem(box, "Escape should close its popup (APG combobox).");
    }
    if (context2.doc.activeElement !== box) {
      context2.problem(
        box,
        `focus stays here when Escape closes the popup, but went to ${describe(context2.doc.activeElement)} (APG combobox).`
      );
    }
    if (wasOpen && !expanded()) {
      await context2.press("ArrowDown");
    }
  }
  async function checkActiveOption(context2, box, popup) {
    const composite = {
      container: popup,
      items: () => withRole(popup, ["option"]),
      noun: "option",
      source: "combobox"
    };
    if (!composite.items().length) {
      return;
    }
    const stays = (key) => {
      if (context2.doc.activeElement !== box) {
        context2.problem(
          box,
          `${key} moved DOM focus to ${describe(context2.doc.activeElement)}; it stays on the combobox, with aria-activedescendant naming the option (APG combobox).`
        );
      }
      return context2.doc.activeElement === box;
    };
    if (!currentItem(context2, composite)) {
      await context2.press("ArrowDown");
      if (!stays("ArrowDown")) {
        return;
      }
    }
    if (!currentItem(context2, composite)) {
      context2.problem(
        box,
        "ArrowDown should make an option active, with aria-activedescendant (APG combobox)."
      );
      return;
    }
    await expectStep(context2, composite, "ArrowDown", true, void 0);
    if (!stays("ArrowDown")) {
      return;
    }
    await expectStep(context2, composite, "ArrowUp", false, void 0);
    stays("ArrowUp");
  }

  // ../../../../../../private/var/folders/kh/4q17my9s6bjbn8rw5mscpwmr0000gn/T/ui-sdk-pack-ugM7HV/core/package/dist/testing/check-pattern.js
  var checks = {
    listbox,
    menu,
    menubar,
    tabs,
    "radio-group": radioGroup,
    toolbar,
    tree,
    dialog,
    alertdialog,
    disclosure,
    accordion,
    combobox,
    slider,
    switch: switchPattern,
    checkbox
  };
  async function checkPattern(root, pattern) {
    const check = checks[pattern];
    if (!check) {
      throw new Error(
        `checkPattern doesn't support "${pattern}" yet. It supports ${Object.keys(checks).join(", ")}.`
      );
    }
    const context2 = createContext(root);
    context2.checkReferences();
    try {
      await check(context2);
    } catch (error) {
      if (error !== stopped) {
        throw error;
      }
    }
    const problems = [...context2.problems];
    if (!problems.length) {
      return;
    }
    const count2 = `${problems.length} problem${problems.length === 1 ? "" : "s"}`;
    throw new Error(
      `checkPattern found ${count2} with the ${pattern} pattern:
${problems.map((problem) => `- ${problem}`).join("\n")}`
    );
  }

  // ../../../../../../private/var/folders/kh/4q17my9s6bjbn8rw5mscpwmr0000gn/T/ui-sdk-pack-ugM7HV/core/package/dist/testing/check-server.js
  var checked = 0;
  var stopped2 = (error) => error.message?.endsWith("isn't available on a server.");
  var escape = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  var cssText = (style) => Object.entries(style).filter(
    ([, value]) => value !== void 0 && value !== null && value !== ""
  ).map(
    ([property, value]) => `${property.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`)}: ${value}`
  ).join("; ");
  function toHtml(tag, attributes, children) {
    const { style, ...rest } = attributes;
    if (style && typeof style === "object") {
      rest.style = cssText(style);
    } else if (style !== void 0) {
      rest.style = style;
    }
    const written = Object.entries(rest).filter(([, value]) => value !== void 0 && value !== false).map(
      ([name, value]) => value === true || value === "" ? ` ${name}` : ` ${name}="${escape(String(value))}"`
    ).join("");
    return `<${tag}${written}>${children}</${tag}>`;
  }
  function isolated(what, read) {
    const restores = [];
    const replace = (target, name, replacement) => {
      const saved = Object.getOwnPropertyDescriptor(target, name);
      Object.defineProperty(target, name, { configurable: true, ...replacement });
      restores.push(
        () => saved ? Object.defineProperty(target, name, saved) : delete target[name]
      );
    };
    const stop = (name) => () => {
      what(`reads the clock or randomness (\`${name}\`)`);
      throw new Error(`${name} isn't available on a server.`);
    };
    const globals = [
      "document",
      "window",
      "navigator",
      "location",
      "localStorage",
      "sessionStorage",
      "matchMedia"
    ];
    for (const name of globals) {
      if (Object.getOwnPropertyDescriptor(globalThis, name)?.configurable !== false) {
        replace(globalThis, name, {
          get() {
            what(`reads \`${name}\``);
            return void 0;
          }
        });
      }
    }
    replace(Date, "now", { writable: true, value: stop("Date.now") });
    const date = new Proxy(Date, {
      apply: stop("Date()"),
      construct: (target, args, newTarget) => args.length ? Reflect.construct(target, args, newTarget) : stop("new Date()")()
    });
    replace(globalThis, "Date", { writable: true, value: date });
    if (globalThis.performance) {
      replace(performance, "now", {
        writable: true,
        value: stop("performance.now")
      });
    }
    replace(Math, "random", { writable: true, value: stop("Math.random") });
    if (globalThis.crypto) {
      for (const name of ["randomUUID", "getRandomValues"]) {
        replace(crypto, name, { writable: true, value: stop(`crypto.${name}`) });
      }
    }
    try {
      return read();
    } finally {
      restores.reverse().forEach((restore) => restore());
    }
  }
  function checkServer(primitive, options, markup) {
    const schema = schemaOf(primitive);
    const id = `server-${++checked}`;
    const problems = /* @__PURE__ */ new Set();
    let rendering = "";
    const watched = new Proxy({ ...options, id }, {
      get(target, key) {
        if (rendering && typeof key === "string" && key !== "id") {
          problems.add(`${rendering} reads option \`${key}\``);
        }
        return target[key];
      }
    });
    const fail = () => new Error(
      `checkServer found ${problems.size} problem${problems.size === 1 ? "" : "s"}:
- ${[...problems].join("\n- ")}`
    );
    const instance = isolated(
      (what) => problems.add(`creating it ${what}`),
      () => {
        try {
          return unwatched(() => primitive(watched));
        } catch (error) {
          throw stopped2(error) ? fail() : error;
        }
      }
    );
    let count2 = 0;
    function render(node, around) {
      if (typeof node === "string") {
        return escape(node);
      }
      const own = schema.slots[node.tag];
      if (!own) {
        const inner2 = node.children.map((child) => render(child, around)).join("");
        return toHtml(node.tag, Object.fromEntries(node.attributes), inner2);
      }
      const slot = node.tag;
      const { props, extra, as } = slotProps(
        own,
        node.attributes,
        around,
        () => `${id}-${slot}-${count2++}`
      );
      const part = instance.part(slot, props);
      rendering = `\`${slot}\`${part.key ? ` "${part.key}"` : ""}`;
      const report2 = (what) => problems.add(`${rendering} ${what}`);
      const view2 = isolated(report2, () => {
        try {
          return {
            attributes: attrs(part),
            shown: present(part),
            state: partState(part)
          };
        } catch (error) {
          if (!stopped2(error)) {
            report2(`throws while rendering: ${error.message}`);
          }
          return { attributes: {}, shown: true, state: {} };
        }
      });
      rendering = "";
      if (!view2.shown) {
        return "";
      }
      const inner = node.children.map((child) => render(child, { ...around, [slot]: props })).join("");
      return toHtml(
        as ?? tagOf(view2.attributes),
        { ...Object.fromEntries(extra), ...view2.attributes },
        inner
      );
    }
    const html = parseMarkup(markup).map((node) => render(node, {})).join("");
    instance.destroy();
    if (problems.size) {
      throw fail();
    }
    return html;
  }
  return __toCommonJS(testing_exports);
})();
