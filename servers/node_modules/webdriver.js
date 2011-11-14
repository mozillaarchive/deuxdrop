(function(){var COMPILED = !0, goog = goog || {};
goog.global = this;
goog.DEBUG = !0;
goog.LOCALE = "en";
goog.provide = function(a) {
  if(!COMPILED) {
    if(goog.isProvided_(a)) {
      throw Error('Namespace "' + a + '" already declared.');
    }
    delete goog.implicitNamespaces_[a];
    for(var b = a;b = b.substring(0, b.lastIndexOf("."));) {
      if(goog.getObjectByName(b)) {
        break
      }
      goog.implicitNamespaces_[b] = !0
    }
  }
  goog.exportPath_(a)
};
goog.setTestOnly = function(a) {
  if(COMPILED && !goog.DEBUG) {
    throw a = a || "", Error("Importing test-only code into non-debug environment" + a ? ": " + a : ".");
  }
};
if(!COMPILED) {
  goog.isProvided_ = function(a) {
    return!goog.implicitNamespaces_[a] && !!goog.getObjectByName(a)
  }, goog.implicitNamespaces_ = {}
}
goog.exportPath_ = function(a, b, c) {
  a = a.split(".");
  c = c || goog.global;
  !(a[0] in c) && c.execScript && c.execScript("var " + a[0]);
  for(var d;a.length && (d = a.shift());) {
    !a.length && goog.isDef(b) ? c[d] = b : c = c[d] ? c[d] : c[d] = {}
  }
};
goog.getObjectByName = function(a, b) {
  for(var c = a.split("."), d = b || goog.global, e;e = c.shift();) {
    if(goog.isDefAndNotNull(d[e])) {
      d = d[e]
    }else {
      return null
    }
  }
  return d
};
goog.globalize = function(a, b) {
  var c = b || goog.global, d;
  for(d in a) {
    c[d] = a[d]
  }
};
goog.addDependency = function(a, b, c) {
  if(!COMPILED) {
    for(var d, a = a.replace(/\\/g, "/"), e = goog.dependencies_, f = 0;d = b[f];f++) {
      e.nameToPath[d] = a, a in e.pathToNames || (e.pathToNames[a] = {}), e.pathToNames[a][d] = !0
    }
    for(d = 0;b = c[d];d++) {
      a in e.requires || (e.requires[a] = {}), e.requires[a][b] = !0
    }
  }
};
goog.ENABLE_DEBUG_LOADER = !0;
goog.require = function(a) {
  if(!COMPILED && !goog.isProvided_(a)) {
    if(goog.ENABLE_DEBUG_LOADER) {
      var b = goog.getPathFromDeps_(a);
      if(b) {
        goog.included_[b] = !0;
        goog.writeScripts_();
        return
      }
    }
    a = "goog.require could not find: " + a;
    goog.global.console && goog.global.console.error(a);
    throw Error(a);
  }
};
goog.basePath = "";
goog.nullFunction = function() {
};
goog.identityFunction = function(a) {
  return a
};
goog.abstractMethod = function() {
  throw Error("unimplemented abstract method");
};
goog.addSingletonGetter = function(a) {
  a.getInstance = function() {
    return a.instance_ || (a.instance_ = new a)
  }
};
if(!COMPILED && goog.ENABLE_DEBUG_LOADER) {
  goog.included_ = {}, goog.dependencies_ = {pathToNames:{}, nameToPath:{}, requires:{}, visited:{}, written:{}}, goog.inHtmlDocument_ = function() {
    var a = goog.global.document;
    return typeof a != "undefined" && "write" in a
  }, goog.findBasePath_ = function() {
    if(goog.global.CLOSURE_BASE_PATH) {
      goog.basePath = goog.global.CLOSURE_BASE_PATH
    }else {
      if(goog.inHtmlDocument_()) {
        for(var a = goog.global.document.getElementsByTagName("script"), b = a.length - 1;b >= 0;--b) {
          var c = a[b].src, d = c.lastIndexOf("?"), d = d == -1 ? c.length : d;
          if(c.substr(d - 7, 7) == "base.js") {
            goog.basePath = c.substr(0, d - 7);
            break
          }
        }
      }
    }
  }, goog.importScript_ = function(a) {
    var b = goog.global.CLOSURE_IMPORT_SCRIPT || goog.writeScriptTag_;
    !goog.dependencies_.written[a] && b(a) && (goog.dependencies_.written[a] = !0)
  }, goog.writeScriptTag_ = function(a) {
    return goog.inHtmlDocument_() ? (goog.global.document.write('<script type="text/javascript" src="' + a + '"><\/script>'), !0) : !1
  }, goog.writeScripts_ = function() {
    function a(e) {
      if(!(e in d.written)) {
        if(!(e in d.visited) && (d.visited[e] = !0, e in d.requires)) {
          for(var g in d.requires[e]) {
            if(!goog.isProvided_(g)) {
              if(g in d.nameToPath) {
                a(d.nameToPath[g])
              }else {
                throw Error("Undefined nameToPath for " + g);
              }
            }
          }
        }
        e in c || (c[e] = !0, b.push(e))
      }
    }
    var b = [], c = {}, d = goog.dependencies_, e;
    for(e in goog.included_) {
      d.written[e] || a(e)
    }
    for(e = 0;e < b.length;e++) {
      if(b[e]) {
        goog.importScript_(goog.basePath + b[e])
      }else {
        throw Error("Undefined script input");
      }
    }
  }, goog.getPathFromDeps_ = function(a) {
    return a in goog.dependencies_.nameToPath ? goog.dependencies_.nameToPath[a] : null
  }, goog.findBasePath_(), goog.global.CLOSURE_NO_DEPS || goog.importScript_(goog.basePath + "deps.js")
}
goog.typeOf = function(a) {
  var b = typeof a;
  if(b == "object") {
    if(a) {
      if(a instanceof Array) {
        return"array"
      }else {
        if(a instanceof Object) {
          return b
        }
      }
      var c = Object.prototype.toString.call(a);
      if(c == "[object Window]") {
        return"object"
      }
      if(c == "[object Array]" || typeof a.length == "number" && typeof a.splice != "undefined" && typeof a.propertyIsEnumerable != "undefined" && !a.propertyIsEnumerable("splice")) {
        return"array"
      }
      if(c == "[object Function]" || typeof a.call != "undefined" && typeof a.propertyIsEnumerable != "undefined" && !a.propertyIsEnumerable("call")) {
        return"function"
      }
    }else {
      return"null"
    }
  }else {
    if(b == "function" && typeof a.call == "undefined") {
      return"object"
    }
  }
  return b
};
goog.propertyIsEnumerableCustom_ = function(a, b) {
  if(b in a) {
    for(var c in a) {
      if(c == b && Object.prototype.hasOwnProperty.call(a, b)) {
        return!0
      }
    }
  }
  return!1
};
goog.propertyIsEnumerable_ = function(a, b) {
  return a instanceof Object ? Object.prototype.propertyIsEnumerable.call(a, b) : goog.propertyIsEnumerableCustom_(a, b)
};
goog.isDef = function(a) {
  return a !== void 0
};
goog.isNull = function(a) {
  return a === null
};
goog.isDefAndNotNull = function(a) {
  return a != null
};
goog.isArray = function(a) {
  return goog.typeOf(a) == "array"
};
goog.isArrayLike = function(a) {
  var b = goog.typeOf(a);
  return b == "array" || b == "object" && typeof a.length == "number"
};
goog.isDateLike = function(a) {
  return goog.isObject(a) && typeof a.getFullYear == "function"
};
goog.isString = function(a) {
  return typeof a == "string"
};
goog.isBoolean = function(a) {
  return typeof a == "boolean"
};
goog.isNumber = function(a) {
  return typeof a == "number"
};
goog.isFunction = function(a) {
  return goog.typeOf(a) == "function"
};
goog.isObject = function(a) {
  a = goog.typeOf(a);
  return a == "object" || a == "array" || a == "function"
};
goog.getUid = function(a) {
  return a[goog.UID_PROPERTY_] || (a[goog.UID_PROPERTY_] = ++goog.uidCounter_)
};
goog.removeUid = function(a) {
  "removeAttribute" in a && a.removeAttribute(goog.UID_PROPERTY_);
  try {
    delete a[goog.UID_PROPERTY_]
  }catch(b) {
  }
};
goog.UID_PROPERTY_ = "closure_uid_" + Math.floor(Math.random() * 2147483648).toString(36);
goog.uidCounter_ = 0;
goog.getHashCode = goog.getUid;
goog.removeHashCode = goog.removeUid;
goog.cloneObject = function(a) {
  var b = goog.typeOf(a);
  if(b == "object" || b == "array") {
    if(a.clone) {
      return a.clone()
    }
    var b = b == "array" ? [] : {}, c;
    for(c in a) {
      b[c] = goog.cloneObject(a[c])
    }
    return b
  }
  return a
};
goog.bindNative_ = function(a) {
  return a.call.apply(a.bind, arguments)
};
goog.bindJs_ = function(a, b) {
  var c = b || goog.global;
  if(arguments.length > 2) {
    var d = Array.prototype.slice.call(arguments, 2);
    return function() {
      var b = Array.prototype.slice.call(arguments);
      Array.prototype.unshift.apply(b, d);
      return a.apply(c, b)
    }
  }else {
    return function() {
      return a.apply(c, arguments)
    }
  }
};
goog.bind = function() {
  goog.bind = Function.prototype.bind && Function.prototype.bind.toString().indexOf("native code") != -1 ? goog.bindNative_ : goog.bindJs_;
  return goog.bind.apply(null, arguments)
};
goog.partial = function(a) {
  var b = Array.prototype.slice.call(arguments, 1);
  return function() {
    var c = Array.prototype.slice.call(arguments);
    c.unshift.apply(c, b);
    return a.apply(this, c)
  }
};
goog.mixin = function(a, b) {
  for(var c in b) {
    a[c] = b[c]
  }
};
goog.now = Date.now || function() {
  return+new Date
};
goog.globalEval = function(a) {
  if(goog.global.execScript) {
    goog.global.execScript(a, "JavaScript")
  }else {
    if(goog.global.eval) {
      if(goog.evalWorksForGlobals_ == null) {
        goog.global.eval("var _et_ = 1;"), typeof goog.global._et_ != "undefined" ? (delete goog.global._et_, goog.evalWorksForGlobals_ = !0) : goog.evalWorksForGlobals_ = !1
      }
      if(goog.evalWorksForGlobals_) {
        goog.global.eval(a)
      }else {
        var b = goog.global.document, c = b.createElement("script");
        c.type = "text/javascript";
        c.defer = !1;
        c.appendChild(b.createTextNode(a));
        b.body.appendChild(c);
        b.body.removeChild(c)
      }
    }else {
      throw Error("goog.globalEval not available");
    }
  }
};
goog.evalWorksForGlobals_ = null;
goog.getCssName = function(a, b) {
  var c = function(a) {
    return goog.cssNameMapping_[a] || a
  }, d;
  d = goog.cssNameMapping_ ? goog.cssNameMappingStyle_ == "BY_WHOLE" ? c : function(a) {
    for(var a = a.split("-"), b = [], d = 0;d < a.length;d++) {
      b.push(c(a[d]))
    }
    return b.join("-")
  } : function(a) {
    return a
  };
  return b ? a + "-" + d(b) : d(a)
};
goog.setCssNameMapping = function(a, b) {
  goog.cssNameMapping_ = a;
  goog.cssNameMappingStyle_ = b
};
goog.getMsg = function(a, b) {
  var c = b || {}, d;
  for(d in c) {
    var e = ("" + c[d]).replace(/\$/g, "$$$$"), a = a.replace(RegExp("\\{\\$" + d + "\\}", "gi"), e)
  }
  return a
};
goog.exportSymbol = function(a, b, c) {
  goog.exportPath_(a, b, c)
};
goog.exportProperty = function(a, b, c) {
  a[b] = c
};
goog.inherits = function(a, b) {
  function c() {
  }
  c.prototype = b.prototype;
  a.superClass_ = b.prototype;
  a.prototype = new c;
  a.prototype.constructor = a
};
goog.base = function(a, b) {
  var c = arguments.callee.caller;
  if(c.superClass_) {
    return c.superClass_.constructor.apply(a, Array.prototype.slice.call(arguments, 1))
  }
  for(var d = Array.prototype.slice.call(arguments, 2), e = !1, f = a.constructor;f;f = f.superClass_ && f.superClass_.constructor) {
    if(f.prototype[b] === c) {
      e = !0
    }else {
      if(e) {
        return f.prototype[b].apply(a, d)
      }
    }
  }
  if(a[b] === c) {
    return a.constructor.prototype[b].apply(a, d)
  }else {
    throw Error("goog.base called from a method of one name to a method of a different name");
  }
};
goog.scope = function(a) {
  a.call(goog.global)
};
goog.debug = {};
goog.debug.Error = function(a) {
  this.stack = Error().stack || "";
  if(a) {
    this.message = String(a)
  }
};
goog.inherits(goog.debug.Error, Error);
goog.debug.Error.prototype.name = "CustomError";
goog.string = {};
goog.string.Unicode = {NBSP:"\u00a0"};
goog.string.startsWith = function(a, b) {
  return a.lastIndexOf(b, 0) == 0
};
goog.string.endsWith = function(a, b) {
  var c = a.length - b.length;
  return c >= 0 && a.indexOf(b, c) == c
};
goog.string.caseInsensitiveStartsWith = function(a, b) {
  return goog.string.caseInsensitiveCompare(b, a.substr(0, b.length)) == 0
};
goog.string.caseInsensitiveEndsWith = function(a, b) {
  return goog.string.caseInsensitiveCompare(b, a.substr(a.length - b.length, b.length)) == 0
};
goog.string.subs = function(a) {
  for(var b = 1;b < arguments.length;b++) {
    var c = String(arguments[b]).replace(/\$/g, "$$$$"), a = a.replace(/\%s/, c)
  }
  return a
};
goog.string.collapseWhitespace = function(a) {
  return a.replace(/[\s\xa0]+/g, " ").replace(/^\s+|\s+$/g, "")
};
goog.string.isEmpty = function(a) {
  return/^[\s\xa0]*$/.test(a)
};
goog.string.isEmptySafe = function(a) {
  return goog.string.isEmpty(goog.string.makeSafe(a))
};
goog.string.isBreakingWhitespace = function(a) {
  return!/[^\t\n\r ]/.test(a)
};
goog.string.isAlpha = function(a) {
  return!/[^a-zA-Z]/.test(a)
};
goog.string.isNumeric = function(a) {
  return!/[^0-9]/.test(a)
};
goog.string.isAlphaNumeric = function(a) {
  return!/[^a-zA-Z0-9]/.test(a)
};
goog.string.isSpace = function(a) {
  return a == " "
};
goog.string.isUnicodeChar = function(a) {
  return a.length == 1 && a >= " " && a <= "~" || a >= "\u0080" && a <= "\ufffd"
};
goog.string.stripNewlines = function(a) {
  return a.replace(/(\r\n|\r|\n)+/g, " ")
};
goog.string.canonicalizeNewlines = function(a) {
  return a.replace(/(\r\n|\r|\n)/g, "\n")
};
goog.string.normalizeWhitespace = function(a) {
  return a.replace(/\xa0|\s/g, " ")
};
goog.string.normalizeSpaces = function(a) {
  return a.replace(/\xa0|[ \t]+/g, " ")
};
goog.string.collapseBreakingSpaces = function(a) {
  return a.replace(/[\t\r\n ]+/g, " ").replace(/^[\t\r\n ]+|[\t\r\n ]+$/g, "")
};
goog.string.trim = function(a) {
  return a.replace(/^[\s\xa0]+|[\s\xa0]+$/g, "")
};
goog.string.trimLeft = function(a) {
  return a.replace(/^[\s\xa0]+/, "")
};
goog.string.trimRight = function(a) {
  return a.replace(/[\s\xa0]+$/, "")
};
goog.string.caseInsensitiveCompare = function(a, b) {
  var c = String(a).toLowerCase(), d = String(b).toLowerCase();
  return c < d ? -1 : c == d ? 0 : 1
};
goog.string.numerateCompareRegExp_ = /(\.\d+)|(\d+)|(\D+)/g;
goog.string.numerateCompare = function(a, b) {
  if(a == b) {
    return 0
  }
  if(!a) {
    return-1
  }
  if(!b) {
    return 1
  }
  for(var c = a.toLowerCase().match(goog.string.numerateCompareRegExp_), d = b.toLowerCase().match(goog.string.numerateCompareRegExp_), e = Math.min(c.length, d.length), f = 0;f < e;f++) {
    var g = c[f], h = d[f];
    if(g != h) {
      c = parseInt(g, 10);
      if(!isNaN(c) && (d = parseInt(h, 10), !isNaN(d) && c - d)) {
        return c - d
      }
      return g < h ? -1 : 1
    }
  }
  if(c.length != d.length) {
    return c.length - d.length
  }
  return a < b ? -1 : 1
};
goog.string.encodeUriRegExp_ = /^[a-zA-Z0-9\-_.!~*'()]*$/;
goog.string.urlEncode = function(a) {
  a = String(a);
  if(!goog.string.encodeUriRegExp_.test(a)) {
    return encodeURIComponent(a)
  }
  return a
};
goog.string.urlDecode = function(a) {
  return decodeURIComponent(a.replace(/\+/g, " "))
};
goog.string.newLineToBr = function(a, b) {
  return a.replace(/(\r\n|\r|\n)/g, b ? "<br />" : "<br>")
};
goog.string.htmlEscape = function(a, b) {
  if(b) {
    return a.replace(goog.string.amperRe_, "&amp;").replace(goog.string.ltRe_, "&lt;").replace(goog.string.gtRe_, "&gt;").replace(goog.string.quotRe_, "&quot;")
  }else {
    if(!goog.string.allRe_.test(a)) {
      return a
    }
    a.indexOf("&") != -1 && (a = a.replace(goog.string.amperRe_, "&amp;"));
    a.indexOf("<") != -1 && (a = a.replace(goog.string.ltRe_, "&lt;"));
    a.indexOf(">") != -1 && (a = a.replace(goog.string.gtRe_, "&gt;"));
    a.indexOf('"') != -1 && (a = a.replace(goog.string.quotRe_, "&quot;"));
    return a
  }
};
goog.string.amperRe_ = /&/g;
goog.string.ltRe_ = /</g;
goog.string.gtRe_ = />/g;
goog.string.quotRe_ = /\"/g;
goog.string.allRe_ = /[&<>\"]/;
goog.string.unescapeEntities = function(a) {
  if(goog.string.contains(a, "&")) {
    return"document" in goog.global && !goog.string.contains(a, "<") ? goog.string.unescapeEntitiesUsingDom_(a) : goog.string.unescapePureXmlEntities_(a)
  }
  return a
};
goog.string.unescapeEntitiesUsingDom_ = function(a) {
  var b = goog.global.document.createElement("div");
  b.innerHTML = "<pre>x" + a + "</pre>";
  if(b.firstChild[goog.string.NORMALIZE_FN_]) {
    b.firstChild[goog.string.NORMALIZE_FN_]()
  }
  a = b.firstChild.firstChild.nodeValue.slice(1);
  b.innerHTML = "";
  return goog.string.canonicalizeNewlines(a)
};
goog.string.unescapePureXmlEntities_ = function(a) {
  return a.replace(/&([^;]+);/g, function(a, c) {
    switch(c) {
      case "amp":
        return"&";
      case "lt":
        return"<";
      case "gt":
        return">";
      case "quot":
        return'"';
      default:
        if(c.charAt(0) == "#") {
          var d = Number("0" + c.substr(1));
          if(!isNaN(d)) {
            return String.fromCharCode(d)
          }
        }
        return a
    }
  })
};
goog.string.NORMALIZE_FN_ = "normalize";
goog.string.whitespaceEscape = function(a, b) {
  return goog.string.newLineToBr(a.replace(/  /g, " &#160;"), b)
};
goog.string.stripQuotes = function(a, b) {
  for(var c = b.length, d = 0;d < c;d++) {
    var e = c == 1 ? b : b.charAt(d);
    if(a.charAt(0) == e && a.charAt(a.length - 1) == e) {
      return a.substring(1, a.length - 1)
    }
  }
  return a
};
goog.string.truncate = function(a, b, c) {
  c && (a = goog.string.unescapeEntities(a));
  a.length > b && (a = a.substring(0, b - 3) + "...");
  c && (a = goog.string.htmlEscape(a));
  return a
};
goog.string.truncateMiddle = function(a, b, c, d) {
  c && (a = goog.string.unescapeEntities(a));
  if(d && a.length > b) {
    d > b && (d = b);
    var e = a.length - d, a = a.substring(0, b - d) + "..." + a.substring(e)
  }else {
    a.length > b && (d = Math.floor(b / 2), e = a.length - d, d += b % 2, a = a.substring(0, d) + "..." + a.substring(e))
  }
  c && (a = goog.string.htmlEscape(a));
  return a
};
goog.string.specialEscapeChars_ = {"\0":"\\0", "\u0008":"\\b", "\u000c":"\\f", "\n":"\\n", "\r":"\\r", "\t":"\\t", "\u000b":"\\x0B", '"':'\\"', "\\":"\\\\"};
goog.string.jsEscapeCache_ = {"'":"\\'"};
goog.string.quote = function(a) {
  a = String(a);
  if(a.quote) {
    return a.quote()
  }else {
    for(var b = ['"'], c = 0;c < a.length;c++) {
      var d = a.charAt(c), e = d.charCodeAt(0);
      b[c + 1] = goog.string.specialEscapeChars_[d] || (e > 31 && e < 127 ? d : goog.string.escapeChar(d))
    }
    b.push('"');
    return b.join("")
  }
};
goog.string.escapeString = function(a) {
  for(var b = [], c = 0;c < a.length;c++) {
    b[c] = goog.string.escapeChar(a.charAt(c))
  }
  return b.join("")
};
goog.string.escapeChar = function(a) {
  if(a in goog.string.jsEscapeCache_) {
    return goog.string.jsEscapeCache_[a]
  }
  if(a in goog.string.specialEscapeChars_) {
    return goog.string.jsEscapeCache_[a] = goog.string.specialEscapeChars_[a]
  }
  var b = a, c = a.charCodeAt(0);
  if(c > 31 && c < 127) {
    b = a
  }else {
    if(c < 256) {
      if(b = "\\x", c < 16 || c > 256) {
        b += "0"
      }
    }else {
      b = "\\u", c < 4096 && (b += "0")
    }
    b += c.toString(16).toUpperCase()
  }
  return goog.string.jsEscapeCache_[a] = b
};
goog.string.toMap = function(a) {
  for(var b = {}, c = 0;c < a.length;c++) {
    b[a.charAt(c)] = !0
  }
  return b
};
goog.string.contains = function(a, b) {
  return a.indexOf(b) != -1
};
goog.string.removeAt = function(a, b, c) {
  var d = a;
  b >= 0 && b < a.length && c > 0 && (d = a.substr(0, b) + a.substr(b + c, a.length - b - c));
  return d
};
goog.string.remove = function(a, b) {
  var c = RegExp(goog.string.regExpEscape(b), "");
  return a.replace(c, "")
};
goog.string.removeAll = function(a, b) {
  var c = RegExp(goog.string.regExpEscape(b), "g");
  return a.replace(c, "")
};
goog.string.regExpEscape = function(a) {
  return String(a).replace(/([-()\[\]{}+?*.$\^|,:#<!\\])/g, "\\$1").replace(/\x08/g, "\\x08")
};
goog.string.repeat = function(a, b) {
  return Array(b + 1).join(a)
};
goog.string.padNumber = function(a, b, c) {
  a = goog.isDef(c) ? a.toFixed(c) : String(a);
  c = a.indexOf(".");
  if(c == -1) {
    c = a.length
  }
  return goog.string.repeat("0", Math.max(0, b - c)) + a
};
goog.string.makeSafe = function(a) {
  return a == null ? "" : String(a)
};
goog.string.buildString = function() {
  return Array.prototype.join.call(arguments, "")
};
goog.string.getRandomString = function() {
  return Math.floor(Math.random() * 2147483648).toString(36) + Math.abs(Math.floor(Math.random() * 2147483648) ^ goog.now()).toString(36)
};
goog.string.compareVersions = function(a, b) {
  for(var c = 0, d = goog.string.trim(String(a)).split("."), e = goog.string.trim(String(b)).split("."), f = Math.max(d.length, e.length), g = 0;c == 0 && g < f;g++) {
    var h = d[g] || "", i = e[g] || "", j = RegExp("(\\d*)(\\D*)", "g"), m = RegExp("(\\d*)(\\D*)", "g");
    do {
      var k = j.exec(h) || ["", "", ""], l = m.exec(i) || ["", "", ""];
      if(k[0].length == 0 && l[0].length == 0) {
        break
      }
      var c = k[1].length == 0 ? 0 : parseInt(k[1], 10), n = l[1].length == 0 ? 0 : parseInt(l[1], 10), c = goog.string.compareElements_(c, n) || goog.string.compareElements_(k[2].length == 0, l[2].length == 0) || goog.string.compareElements_(k[2], l[2])
    }while(c == 0)
  }
  return c
};
goog.string.compareElements_ = function(a, b) {
  if(a < b) {
    return-1
  }else {
    if(a > b) {
      return 1
    }
  }
  return 0
};
goog.string.HASHCODE_MAX_ = 4294967296;
goog.string.hashCode = function(a) {
  for(var b = 0, c = 0;c < a.length;++c) {
    b = 31 * b + a.charCodeAt(c), b %= goog.string.HASHCODE_MAX_
  }
  return b
};
goog.string.uniqueStringCounter_ = Math.random() * 2147483648 | 0;
goog.string.createUniqueString = function() {
  return"goog_" + goog.string.uniqueStringCounter_++
};
goog.string.toNumber = function(a) {
  var b = Number(a);
  if(b == 0 && goog.string.isEmpty(a)) {
    return NaN
  }
  return b
};
goog.string.toCamelCaseCache_ = {};
goog.string.toCamelCase = function(a) {
  return goog.string.toCamelCaseCache_[a] || (goog.string.toCamelCaseCache_[a] = String(a).replace(/\-([a-z])/g, function(a, c) {
    return c.toUpperCase()
  }))
};
goog.string.toSelectorCaseCache_ = {};
goog.string.toSelectorCase = function(a) {
  return goog.string.toSelectorCaseCache_[a] || (goog.string.toSelectorCaseCache_[a] = String(a).replace(/([A-Z])/g, "-$1").toLowerCase())
};
goog.asserts = {};
goog.asserts.ENABLE_ASSERTS = goog.DEBUG;
goog.asserts.AssertionError = function(a, b) {
  b.unshift(a);
  goog.debug.Error.call(this, goog.string.subs.apply(null, b));
  b.shift();
  this.messagePattern = a
};
goog.inherits(goog.asserts.AssertionError, goog.debug.Error);
goog.asserts.AssertionError.prototype.name = "AssertionError";
goog.asserts.doAssertFailure_ = function(a, b, c, d) {
  var e = "Assertion failed";
  if(c) {
    e += ": " + c;
    var f = d
  }else {
    a && (e += ": " + a, f = b)
  }
  throw new goog.asserts.AssertionError("" + e, f || []);
};
goog.asserts.assert = function(a, b) {
  goog.asserts.ENABLE_ASSERTS && !a && goog.asserts.doAssertFailure_("", null, b, Array.prototype.slice.call(arguments, 2));
  return a
};
goog.asserts.fail = function(a) {
  if(goog.asserts.ENABLE_ASSERTS) {
    throw new goog.asserts.AssertionError("Failure" + (a ? ": " + a : ""), Array.prototype.slice.call(arguments, 1));
  }
};
goog.asserts.assertNumber = function(a, b) {
  goog.asserts.ENABLE_ASSERTS && !goog.isNumber(a) && goog.asserts.doAssertFailure_("Expected number but got %s: %s.", [goog.typeOf(a), a], b, Array.prototype.slice.call(arguments, 2));
  return a
};
goog.asserts.assertString = function(a, b) {
  goog.asserts.ENABLE_ASSERTS && !goog.isString(a) && goog.asserts.doAssertFailure_("Expected string but got %s: %s.", [goog.typeOf(a), a], b, Array.prototype.slice.call(arguments, 2));
  return a
};
goog.asserts.assertFunction = function(a, b) {
  goog.asserts.ENABLE_ASSERTS && !goog.isFunction(a) && goog.asserts.doAssertFailure_("Expected function but got %s: %s.", [goog.typeOf(a), a], b, Array.prototype.slice.call(arguments, 2));
  return a
};
goog.asserts.assertObject = function(a, b) {
  goog.asserts.ENABLE_ASSERTS && !goog.isObject(a) && goog.asserts.doAssertFailure_("Expected object but got %s: %s.", [goog.typeOf(a), a], b, Array.prototype.slice.call(arguments, 2));
  return a
};
goog.asserts.assertArray = function(a, b) {
  goog.asserts.ENABLE_ASSERTS && !goog.isArray(a) && goog.asserts.doAssertFailure_("Expected array but got %s: %s.", [goog.typeOf(a), a], b, Array.prototype.slice.call(arguments, 2));
  return a
};
goog.asserts.assertBoolean = function(a, b) {
  goog.asserts.ENABLE_ASSERTS && !goog.isBoolean(a) && goog.asserts.doAssertFailure_("Expected boolean but got %s: %s.", [goog.typeOf(a), a], b, Array.prototype.slice.call(arguments, 2));
  return a
};
goog.asserts.assertInstanceof = function(a, b, c) {
  goog.asserts.ENABLE_ASSERTS && !(a instanceof b) && goog.asserts.doAssertFailure_("instanceof check failed.", null, c, Array.prototype.slice.call(arguments, 3))
};
goog.array = {};
goog.array.ArrayLike = {};
goog.NATIVE_ARRAY_PROTOTYPES = !0;
goog.array.peek = function(a) {
  return a[a.length - 1]
};
goog.array.ARRAY_PROTOTYPE_ = Array.prototype;
goog.array.indexOf = goog.NATIVE_ARRAY_PROTOTYPES && goog.array.ARRAY_PROTOTYPE_.indexOf ? function(a, b, c) {
  goog.asserts.assert(a.length != null);
  return goog.array.ARRAY_PROTOTYPE_.indexOf.call(a, b, c)
} : function(a, b, c) {
  c = c == null ? 0 : c < 0 ? Math.max(0, a.length + c) : c;
  if(goog.isString(a)) {
    if(!goog.isString(b) || b.length != 1) {
      return-1
    }
    return a.indexOf(b, c)
  }
  for(;c < a.length;c++) {
    if(c in a && a[c] === b) {
      return c
    }
  }
  return-1
};
goog.array.lastIndexOf = goog.NATIVE_ARRAY_PROTOTYPES && goog.array.ARRAY_PROTOTYPE_.lastIndexOf ? function(a, b, c) {
  goog.asserts.assert(a.length != null);
  return goog.array.ARRAY_PROTOTYPE_.lastIndexOf.call(a, b, c == null ? a.length - 1 : c)
} : function(a, b, c) {
  c = c == null ? a.length - 1 : c;
  c < 0 && (c = Math.max(0, a.length + c));
  if(goog.isString(a)) {
    if(!goog.isString(b) || b.length != 1) {
      return-1
    }
    return a.lastIndexOf(b, c)
  }
  for(;c >= 0;c--) {
    if(c in a && a[c] === b) {
      return c
    }
  }
  return-1
};
goog.array.forEach = goog.NATIVE_ARRAY_PROTOTYPES && goog.array.ARRAY_PROTOTYPE_.forEach ? function(a, b, c) {
  goog.asserts.assert(a.length != null);
  goog.array.ARRAY_PROTOTYPE_.forEach.call(a, b, c)
} : function(a, b, c) {
  for(var d = a.length, e = goog.isString(a) ? a.split("") : a, f = 0;f < d;f++) {
    f in e && b.call(c, e[f], f, a)
  }
};
goog.array.forEachRight = function(a, b, c) {
  var d = a.length, e = goog.isString(a) ? a.split("") : a;
  for(d -= 1;d >= 0;--d) {
    d in e && b.call(c, e[d], d, a)
  }
};
goog.array.filter = goog.NATIVE_ARRAY_PROTOTYPES && goog.array.ARRAY_PROTOTYPE_.filter ? function(a, b, c) {
  goog.asserts.assert(a.length != null);
  return goog.array.ARRAY_PROTOTYPE_.filter.call(a, b, c)
} : function(a, b, c) {
  for(var d = a.length, e = [], f = 0, g = goog.isString(a) ? a.split("") : a, h = 0;h < d;h++) {
    if(h in g) {
      var i = g[h];
      b.call(c, i, h, a) && (e[f++] = i)
    }
  }
  return e
};
goog.array.map = goog.NATIVE_ARRAY_PROTOTYPES && goog.array.ARRAY_PROTOTYPE_.map ? function(a, b, c) {
  goog.asserts.assert(a.length != null);
  return goog.array.ARRAY_PROTOTYPE_.map.call(a, b, c)
} : function(a, b, c) {
  for(var d = a.length, e = Array(d), f = goog.isString(a) ? a.split("") : a, g = 0;g < d;g++) {
    g in f && (e[g] = b.call(c, f[g], g, a))
  }
  return e
};
goog.array.reduce = function(a, b, c, d) {
  if(a.reduce) {
    return d ? a.reduce(goog.bind(b, d), c) : a.reduce(b, c)
  }
  var e = c;
  goog.array.forEach(a, function(c, g) {
    e = b.call(d, e, c, g, a)
  });
  return e
};
goog.array.reduceRight = function(a, b, c, d) {
  if(a.reduceRight) {
    return d ? a.reduceRight(goog.bind(b, d), c) : a.reduceRight(b, c)
  }
  var e = c;
  goog.array.forEachRight(a, function(c, g) {
    e = b.call(d, e, c, g, a)
  });
  return e
};
goog.array.some = goog.NATIVE_ARRAY_PROTOTYPES && goog.array.ARRAY_PROTOTYPE_.some ? function(a, b, c) {
  goog.asserts.assert(a.length != null);
  return goog.array.ARRAY_PROTOTYPE_.some.call(a, b, c)
} : function(a, b, c) {
  for(var d = a.length, e = goog.isString(a) ? a.split("") : a, f = 0;f < d;f++) {
    if(f in e && b.call(c, e[f], f, a)) {
      return!0
    }
  }
  return!1
};
goog.array.every = goog.NATIVE_ARRAY_PROTOTYPES && goog.array.ARRAY_PROTOTYPE_.every ? function(a, b, c) {
  goog.asserts.assert(a.length != null);
  return goog.array.ARRAY_PROTOTYPE_.every.call(a, b, c)
} : function(a, b, c) {
  for(var d = a.length, e = goog.isString(a) ? a.split("") : a, f = 0;f < d;f++) {
    if(f in e && !b.call(c, e[f], f, a)) {
      return!1
    }
  }
  return!0
};
goog.array.find = function(a, b, c) {
  b = goog.array.findIndex(a, b, c);
  return b < 0 ? null : goog.isString(a) ? a.charAt(b) : a[b]
};
goog.array.findIndex = function(a, b, c) {
  for(var d = a.length, e = goog.isString(a) ? a.split("") : a, f = 0;f < d;f++) {
    if(f in e && b.call(c, e[f], f, a)) {
      return f
    }
  }
  return-1
};
goog.array.findRight = function(a, b, c) {
  b = goog.array.findIndexRight(a, b, c);
  return b < 0 ? null : goog.isString(a) ? a.charAt(b) : a[b]
};
goog.array.findIndexRight = function(a, b, c) {
  var d = a.length, e = goog.isString(a) ? a.split("") : a;
  for(d -= 1;d >= 0;d--) {
    if(d in e && b.call(c, e[d], d, a)) {
      return d
    }
  }
  return-1
};
goog.array.contains = function(a, b) {
  return goog.array.indexOf(a, b) >= 0
};
goog.array.isEmpty = function(a) {
  return a.length == 0
};
goog.array.clear = function(a) {
  if(!goog.isArray(a)) {
    for(var b = a.length - 1;b >= 0;b--) {
      delete a[b]
    }
  }
  a.length = 0
};
goog.array.insert = function(a, b) {
  goog.array.contains(a, b) || a.push(b)
};
goog.array.insertAt = function(a, b, c) {
  goog.array.splice(a, c, 0, b)
};
goog.array.insertArrayAt = function(a, b, c) {
  goog.partial(goog.array.splice, a, c, 0).apply(null, b)
};
goog.array.insertBefore = function(a, b, c) {
  var d;
  arguments.length == 2 || (d = goog.array.indexOf(a, c)) < 0 ? a.push(b) : goog.array.insertAt(a, b, d)
};
goog.array.remove = function(a, b) {
  var c = goog.array.indexOf(a, b), d;
  (d = c >= 0) && goog.array.removeAt(a, c);
  return d
};
goog.array.removeAt = function(a, b) {
  goog.asserts.assert(a.length != null);
  return goog.array.ARRAY_PROTOTYPE_.splice.call(a, b, 1).length == 1
};
goog.array.removeIf = function(a, b, c) {
  b = goog.array.findIndex(a, b, c);
  if(b >= 0) {
    return goog.array.removeAt(a, b), !0
  }
  return!1
};
goog.array.concat = function() {
  return goog.array.ARRAY_PROTOTYPE_.concat.apply(goog.array.ARRAY_PROTOTYPE_, arguments)
};
goog.array.clone = function(a) {
  if(goog.isArray(a)) {
    return goog.array.concat(a)
  }else {
    for(var b = [], c = 0, d = a.length;c < d;c++) {
      b[c] = a[c]
    }
    return b
  }
};
goog.array.toArray = function(a) {
  if(goog.isArray(a)) {
    return goog.array.concat(a)
  }
  return goog.array.clone(a)
};
goog.array.extend = function(a) {
  for(var b = 1;b < arguments.length;b++) {
    var c = arguments[b], d;
    if(goog.isArray(c) || (d = goog.isArrayLike(c)) && c.hasOwnProperty("callee")) {
      a.push.apply(a, c)
    }else {
      if(d) {
        for(var e = a.length, f = c.length, g = 0;g < f;g++) {
          a[e + g] = c[g]
        }
      }else {
        a.push(c)
      }
    }
  }
};
goog.array.splice = function(a) {
  goog.asserts.assert(a.length != null);
  return goog.array.ARRAY_PROTOTYPE_.splice.apply(a, goog.array.slice(arguments, 1))
};
goog.array.slice = function(a, b, c) {
  goog.asserts.assert(a.length != null);
  return arguments.length <= 2 ? goog.array.ARRAY_PROTOTYPE_.slice.call(a, b) : goog.array.ARRAY_PROTOTYPE_.slice.call(a, b, c)
};
goog.array.removeDuplicates = function(a, b) {
  for(var c = b || a, d = {}, e = 0, f = 0;f < a.length;) {
    var g = a[f++], h = goog.isObject(g) ? "o" + goog.getUid(g) : (typeof g).charAt(0) + g;
    Object.prototype.hasOwnProperty.call(d, h) || (d[h] = !0, c[e++] = g)
  }
  c.length = e
};
goog.array.binarySearch = function(a, b, c) {
  return goog.array.binarySearch_(a, c || goog.array.defaultCompare, !1, b)
};
goog.array.binarySelect = function(a, b, c) {
  return goog.array.binarySearch_(a, b, !0, void 0, c)
};
goog.array.binarySearch_ = function(a, b, c, d, e) {
  for(var f = 0, g = a.length, h;f < g;) {
    var i = f + g >> 1, j;
    j = c ? b.call(e, a[i], i, a) : b(d, a[i]);
    j > 0 ? f = i + 1 : (g = i, h = !j)
  }
  return h ? f : ~f
};
goog.array.sort = function(a, b) {
  goog.asserts.assert(a.length != null);
  goog.array.ARRAY_PROTOTYPE_.sort.call(a, b || goog.array.defaultCompare)
};
goog.array.stableSort = function(a, b) {
  for(var c = 0;c < a.length;c++) {
    a[c] = {index:c, value:a[c]}
  }
  var d = b || goog.array.defaultCompare;
  goog.array.sort(a, function(a, b) {
    return d(a.value, b.value) || a.index - b.index
  });
  for(c = 0;c < a.length;c++) {
    a[c] = a[c].value
  }
};
goog.array.sortObjectsByKey = function(a, b, c) {
  var d = c || goog.array.defaultCompare;
  goog.array.sort(a, function(a, c) {
    return d(a[b], c[b])
  })
};
goog.array.isSorted = function(a, b, c) {
  for(var b = b || goog.array.defaultCompare, d = 1;d < a.length;d++) {
    var e = b(a[d - 1], a[d]);
    if(e > 0 || e == 0 && c) {
      return!1
    }
  }
  return!0
};
goog.array.equals = function(a, b, c) {
  if(!goog.isArrayLike(a) || !goog.isArrayLike(b) || a.length != b.length) {
    return!1
  }
  for(var d = a.length, c = c || goog.array.defaultCompareEquality, e = 0;e < d;e++) {
    if(!c(a[e], b[e])) {
      return!1
    }
  }
  return!0
};
goog.array.compare = function(a, b, c) {
  return goog.array.equals(a, b, c)
};
goog.array.defaultCompare = function(a, b) {
  return a > b ? 1 : a < b ? -1 : 0
};
goog.array.defaultCompareEquality = function(a, b) {
  return a === b
};
goog.array.binaryInsert = function(a, b, c) {
  c = goog.array.binarySearch(a, b, c);
  if(c < 0) {
    return goog.array.insertAt(a, b, -(c + 1)), !0
  }
  return!1
};
goog.array.binaryRemove = function(a, b, c) {
  b = goog.array.binarySearch(a, b, c);
  return b >= 0 ? goog.array.removeAt(a, b) : !1
};
goog.array.bucket = function(a, b) {
  for(var c = {}, d = 0;d < a.length;d++) {
    var e = a[d], f = b(e, d, a);
    goog.isDef(f) && (c[f] || (c[f] = [])).push(e)
  }
  return c
};
goog.array.repeat = function(a, b) {
  for(var c = [], d = 0;d < b;d++) {
    c[d] = a
  }
  return c
};
goog.array.flatten = function() {
  for(var a = [], b = 0;b < arguments.length;b++) {
    var c = arguments[b];
    goog.isArray(c) ? a.push.apply(a, goog.array.flatten.apply(null, c)) : a.push(c)
  }
  return a
};
goog.array.rotate = function(a, b) {
  goog.asserts.assert(a.length != null);
  a.length && (b %= a.length, b > 0 ? goog.array.ARRAY_PROTOTYPE_.unshift.apply(a, a.splice(-b, b)) : b < 0 && goog.array.ARRAY_PROTOTYPE_.push.apply(a, a.splice(0, -b)));
  return a
};
goog.array.zip = function() {
  if(!arguments.length) {
    return[]
  }
  for(var a = [], b = 0;;b++) {
    for(var c = [], d = 0;d < arguments.length;d++) {
      var e = arguments[d];
      if(b >= e.length) {
        return a
      }
      c.push(e[b])
    }
    a.push(c)
  }
};
goog.array.shuffle = function(a, b) {
  for(var c = b || Math.random, d = a.length - 1;d > 0;d--) {
    var e = Math.floor(c() * (d + 1)), f = a[d];
    a[d] = a[e];
    a[e] = f
  }
};
goog.object = {};
goog.object.forEach = function(a, b, c) {
  for(var d in a) {
    b.call(c, a[d], d, a)
  }
};
goog.object.filter = function(a, b, c) {
  var d = {}, e;
  for(e in a) {
    b.call(c, a[e], e, a) && (d[e] = a[e])
  }
  return d
};
goog.object.map = function(a, b, c) {
  var d = {}, e;
  for(e in a) {
    d[e] = b.call(c, a[e], e, a)
  }
  return d
};
goog.object.some = function(a, b, c) {
  for(var d in a) {
    if(b.call(c, a[d], d, a)) {
      return!0
    }
  }
  return!1
};
goog.object.every = function(a, b, c) {
  for(var d in a) {
    if(!b.call(c, a[d], d, a)) {
      return!1
    }
  }
  return!0
};
goog.object.getCount = function(a) {
  var b = 0, c;
  for(c in a) {
    b++
  }
  return b
};
goog.object.getAnyKey = function(a) {
  for(var b in a) {
    return b
  }
};
goog.object.getAnyValue = function(a) {
  for(var b in a) {
    return a[b]
  }
};
goog.object.contains = function(a, b) {
  return goog.object.containsValue(a, b)
};
goog.object.getValues = function(a) {
  var b = [], c = 0, d;
  for(d in a) {
    b[c++] = a[d]
  }
  return b
};
goog.object.getKeys = function(a) {
  var b = [], c = 0, d;
  for(d in a) {
    b[c++] = d
  }
  return b
};
goog.object.getValueByKeys = function(a, b) {
  for(var c = goog.isArrayLike(b), d = c ? b : arguments, c = c ? 0 : 1;c < d.length;c++) {
    if(a = a[d[c]], !goog.isDef(a)) {
      break
    }
  }
  return a
};
goog.object.containsKey = function(a, b) {
  return b in a
};
goog.object.containsValue = function(a, b) {
  for(var c in a) {
    if(a[c] == b) {
      return!0
    }
  }
  return!1
};
goog.object.findKey = function(a, b, c) {
  for(var d in a) {
    if(b.call(c, a[d], d, a)) {
      return d
    }
  }
};
goog.object.findValue = function(a, b, c) {
  return(b = goog.object.findKey(a, b, c)) && a[b]
};
goog.object.isEmpty = function(a) {
  for(var b in a) {
    return!1
  }
  return!0
};
goog.object.clear = function(a) {
  for(var b in a) {
    delete a[b]
  }
};
goog.object.remove = function(a, b) {
  var c;
  (c = b in a) && delete a[b];
  return c
};
goog.object.add = function(a, b, c) {
  if(b in a) {
    throw Error('The object already contains the key "' + b + '"');
  }
  goog.object.set(a, b, c)
};
goog.object.get = function(a, b, c) {
  if(b in a) {
    return a[b]
  }
  return c
};
goog.object.set = function(a, b, c) {
  a[b] = c
};
goog.object.setIfUndefined = function(a, b, c) {
  return b in a ? a[b] : a[b] = c
};
goog.object.clone = function(a) {
  var b = {}, c;
  for(c in a) {
    b[c] = a[c]
  }
  return b
};
goog.object.unsafeClone = function(a) {
  var b = goog.typeOf(a);
  if(b == "object" || b == "array") {
    if(a.clone) {
      return a.clone()
    }
    var b = b == "array" ? [] : {}, c;
    for(c in a) {
      b[c] = goog.object.unsafeClone(a[c])
    }
    return b
  }
  return a
};
goog.object.transpose = function(a) {
  var b = {}, c;
  for(c in a) {
    b[a[c]] = c
  }
  return b
};
goog.object.PROTOTYPE_FIELDS_ = ["constructor", "hasOwnProperty", "isPrototypeOf", "propertyIsEnumerable", "toLocaleString", "toString", "valueOf"];
goog.object.extend = function(a) {
  for(var b, c, d = 1;d < arguments.length;d++) {
    c = arguments[d];
    for(b in c) {
      a[b] = c[b]
    }
    for(var e = 0;e < goog.object.PROTOTYPE_FIELDS_.length;e++) {
      b = goog.object.PROTOTYPE_FIELDS_[e], Object.prototype.hasOwnProperty.call(c, b) && (a[b] = c[b])
    }
  }
};
goog.object.create = function() {
  var a = arguments.length;
  if(a == 1 && goog.isArray(arguments[0])) {
    return goog.object.create.apply(null, arguments[0])
  }
  if(a % 2) {
    throw Error("Uneven number of arguments");
  }
  for(var b = {}, c = 0;c < a;c += 2) {
    b[arguments[c]] = arguments[c + 1]
  }
  return b
};
goog.object.createSet = function() {
  var a = arguments.length;
  if(a == 1 && goog.isArray(arguments[0])) {
    return goog.object.createSet.apply(null, arguments[0])
  }
  for(var b = {}, c = 0;c < a;c++) {
    b[arguments[c]] = !0
  }
  return b
};
var webdriver = {EventEmitter:function() {
  this.events_ = {}
}};
goog.exportSymbol("webdriver.EventEmitter", webdriver.EventEmitter);
webdriver.EventEmitter.prototype.emit = function(a) {
  var b = Array.prototype.slice.call(arguments, 1), c = this.events_[a];
  if(c) {
    for(var d = 0;d < c.length;) {
      c[d].fn.apply(null, b), c[d].oneshot ? c.splice(d, 1) : d += 1
    }
  }
};
goog.exportProperty(webdriver.EventEmitter.prototype, "emit", webdriver.EventEmitter.prototype.emit);
webdriver.EventEmitter.prototype.listeners = function(a) {
  var b = this.events_[a];
  b || (b = this.events_[a] = []);
  return b
};
webdriver.EventEmitter.prototype.addListener = function(a, b, c) {
  for(var a = this.listeners(a), d = a.length, e = 0;e < d;++e) {
    if(a[e] == b) {
      return this
    }
  }
  a.push({fn:b, oneshot:!!c});
  return this
};
goog.exportProperty(webdriver.EventEmitter.prototype, "addListener", webdriver.EventEmitter.prototype.addListener);
webdriver.EventEmitter.prototype.once = function(a, b) {
  return this.addListener(a, b, !0)
};
goog.exportProperty(webdriver.EventEmitter.prototype, "once", webdriver.EventEmitter.prototype.once);
webdriver.EventEmitter.prototype.on = webdriver.EventEmitter.prototype.addListener;
goog.exportProperty(webdriver.EventEmitter.prototype, "on", webdriver.EventEmitter.prototype.on);
webdriver.EventEmitter.prototype.removeListener = function(a, b) {
  var c = this.events_[a];
  if(c) {
    for(var d = c.length, e = 0;e < d;++e) {
      if(c[e].fn == b) {
        c.splice(e, 1);
        break
      }
    }
  }
  return this
};
goog.exportProperty(webdriver.EventEmitter.prototype, "removeListener", webdriver.EventEmitter.prototype.removeListener);
webdriver.EventEmitter.prototype.removeAllListeners = function(a) {
  goog.isDef(a) ? delete this.events_[a] : this.events_ = {};
  return this
};
goog.exportProperty(webdriver.EventEmitter.prototype, "removeAllListeners", webdriver.EventEmitter.prototype.removeAllListeners);
/*
 Portions of this code are from the Dojo toolkit, received under the
 BSD License:
 Redistribution and use in source and binary forms, with or without
 modification, are permitted provided that the following conditions are met:

 Redistributions of source code must retain the above copyright notice,
 this list of conditions and the following disclaimer.
 Redistributions in binary form must reproduce the above copyright notice,
 this list of conditions and the following disclaimer in the documentation
 and/or other materials provided with the distribution.
 Neither the name of the Dojo Foundation nor the names of its contributors
 may be used to endorse or promote products derived from this software
 without specific prior written permission.

 THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
 ARE DISCLAIMED.  IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE
 LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
 CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
 SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
 INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
 CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 POSSIBILITY OF SUCH DAMAGE.
*/
webdriver.promise = {};
webdriver.promise.Promise = function() {
};
webdriver.promise.Promise.prototype.addCallback = function(a, b) {
  return this.then(goog.bind(a, b))
};
webdriver.promise.Promise.prototype.addErrback = function(a, b) {
  return this.then(null, goog.bind(a, b))
};
webdriver.promise.Promise.prototype.addBoth = function(a, b) {
  a = goog.bind(a, b);
  return this.then(a, a)
};
webdriver.promise.Promise.prototype.addCallbacks = function(a, b, c) {
  return this.then(goog.bind(a, c), goog.bind(b, c))
};
webdriver.promise.Deferred = function() {
  function a(a, c) {
    if(g != webdriver.promise.Deferred.State.PENDING) {
      throw Error("This Deferred has already been resolved.");
    }
    g = a;
    for(h = c;e.length;) {
      b(e.shift())
    }
    !f && g == webdriver.promise.Deferred.State.REJECTED && setTimeout(function() {
      f || webdriver.promise.Application.getInstance().abortCurrentFrame_(h)
    }, 0)
  }
  function b(a) {
    var b = g == webdriver.promise.Deferred.State.RESOLVED ? a.callback : a.errback;
    b ? (b = webdriver.promise.Application.getInstance().executeAsap_(goog.partial(b, h)), webdriver.promise.asap(b, a.deferred.resolve, a.deferred.reject)) : g == webdriver.promise.Deferred.State.REJECTED ? a.deferred.reject(h) : a.deferred.resolve(h)
  }
  function c(b) {
    webdriver.promise.isPromise(b) && b !== j ? b instanceof webdriver.promise.Deferred ? b.then(goog.partial(a, webdriver.promise.Deferred.State.RESOLVED), goog.partial(a, webdriver.promise.Deferred.State.REJECTED)) : webdriver.promise.when(b, c, d) : a(webdriver.promise.Deferred.State.RESOLVED, b)
  }
  function d(b) {
    webdriver.promise.isPromise(b) && h !== j ? h instanceof webdriver.promise.Deferred ? h.then(goog.partial(a, webdriver.promise.Deferred.State.REJECTED), goog.partial(a, webdriver.promise.Deferred.State.REJECTED)) : webdriver.promise.when(b, d, d) : a(webdriver.promise.Deferred.State.REJECTED, b)
  }
  webdriver.promise.Promise.call(this);
  var e = [], f = !1, g = webdriver.promise.Deferred.State.PENDING, h;
  this.then = function(a, c) {
    f = !0;
    var d = {callback:a, errback:c, deferred:new webdriver.promise.Deferred};
    g == webdriver.promise.Deferred.State.PENDING ? e.push(d) : b(d);
    return d.deferred.promise
  };
  var i = new webdriver.promise.Promise;
  i.then = this.then;
  var j = this;
  this.promise = i;
  this.then = i.then = this.then;
  this.resolve = this.callback = c;
  this.reject = this.errback = d
};
goog.inherits(webdriver.promise.Deferred, webdriver.promise.Promise);
webdriver.promise.Deferred.State = {REJECTED:-1, PENDING:0, RESOLVED:1};
webdriver.promise.isPromise = function(a) {
  return!!a && goog.isObject(a) && goog.isFunction(a.then)
};
webdriver.promise.delayed = function(a) {
  var b = new webdriver.promise.Deferred;
  setTimeout(b.resolve, a);
  return b.promise
};
webdriver.promise.resolved = function(a) {
  var b = new webdriver.promise.Deferred;
  b.resolve(a);
  return b.promise
};
webdriver.promise.rejected = function(a) {
  var b = new webdriver.promise.Deferred;
  b.reject(a);
  return b.promise
};
webdriver.promise.checkedNodeCall = function(a) {
  var b = new webdriver.promise.Deferred, c = !1;
  try {
    a(function(a, d) {
      c || (c = !0, a ? b.reject(a) : b.resolve(d))
    })
  }catch(d) {
    c || (c = !0, b.reject(d))
  }
  return b.promise
};
webdriver.promise.when = function(a, b, c) {
  if(a instanceof webdriver.promise.Promise) {
    return a.then(b, c)
  }
  var d = new webdriver.promise.Deferred;
  webdriver.promise.asap(a, d.resolve, d.reject);
  return d.then(b, c)
};
webdriver.promise.asap = function(a, b, c) {
  webdriver.promise.isPromise(a) ? a.then(b, c) : a && goog.isObject(a) && goog.isFunction(a.addCallbacks) ? a.addCallbacks(b, c) : b && b(a)
};
webdriver.promise.fullyResolved = function(a) {
  function b(a) {
    switch(goog.typeOf(a)) {
      case "array":
        return c(a, a.length, function(a, b, c) {
          for(var d = a.length, i = 0;i < d;++i) {
            b.call(c, a[i], i, a)
          }
        });
      case "object":
        if(webdriver.promise.isPromise(a)) {
          return a
        }
        return c(a, goog.object.getKeys(a).length, goog.object.forEach);
      default:
        return webdriver.promise.resolved(a)
    }
  }
  function c(a, b, c) {
    if(!b) {
      return webdriver.promise.resolved(a)
    }
    var g = 0, h = !1, i = new webdriver.promise.Deferred;
    c(a, function(c, f) {
      var k = goog.typeOf(c);
      k != "array" && k != "object" ? ++g == b && i.resolve(a) : webdriver.promise.fullyResolved(c).then(function(c) {
        a[f] = c;
        ++g == b && i.resolve(a)
      }, function(a) {
        h || (h = !0, i.reject(a))
      })
    });
    return i.promise
  }
  if(webdriver.promise.isPromise(a)) {
    return webdriver.promise.when(a, b)
  }
  return b(a)
};
webdriver.promise.Application = function() {
  webdriver.EventEmitter.call(this);
  this.frames_ = []
};
goog.inherits(webdriver.promise.Application, webdriver.EventEmitter);
goog.addSingletonGetter(webdriver.promise.Application);
webdriver.promise.Application.IDLE = "idle";
webdriver.promise.Application.SCHEDULE_TASK = "scheduleTask";
webdriver.promise.Application.UNCAUGHT_EXCEPTION = "uncaughtException";
webdriver.promise.Application.prototype.shutdownId_ = null;
webdriver.promise.Application.prototype.executeNextId_ = null;
webdriver.promise.Application.prototype.reset = function() {
  this.frames_ = [];
  this.removeAllListeners();
  this.cancelShutdown_();
  this.cancelNext_()
};
webdriver.promise.Application.prototype.schedule = function(a, b) {
  this.cancelShutdown_();
  var c = goog.array.peek(this.frames_);
  c || (c = new webdriver.promise.Application.Frame_, c.then(goog.bind(this.commenceShutdown_, this), goog.bind(this.abortNow_, this)), this.frames_.push(c));
  var d = new webdriver.promise.Application.Task_(b, a);
  c.queue.push(d);
  this.emit(webdriver.promise.Application.SCHEDULE_TASK);
  this.scheduleNext_();
  return d.promise
};
webdriver.promise.Application.prototype.scheduleAndWaitForIdle = function(a, b) {
  function c() {
    h = setTimeout(function() {
      g.removeListener(webdriver.promise.Application.SCHEDULE_TASK, d);
      g.removeListener(webdriver.promise.Application.UNCAUGHT_EXCEPTION, e);
      g.waitingForIdle_ = null;
      f.resolve()
    }, 0);
    g.once(webdriver.promise.Application.SCHEDULE_TASK, d)
  }
  function d() {
    clearTimeout(h);
    g.once(webdriver.promise.Application.IDLE, c)
  }
  function e(a) {
    clearTimeout(h);
    g.removeListener(webdriver.promise.Application.IDLE, c);
    g.removeListener(webdriver.promise.Application.SCHEDULE_TASK, d);
    setTimeout(function() {
      g.waitingForIdle_ = null;
      f.reject(a)
    }, 0)
  }
  if(this.waitingForIdle_) {
    throw Error("Whoops! It looks like another task is already waiting this application to go idle: " + this.waitingForIdle_);
  }
  this.waitingForIdle_ = a;
  var f = new webdriver.promise.Deferred, g = this, h;
  g.schedule(a, b);
  g.once(webdriver.promise.Application.IDLE, c);
  g.once(webdriver.promise.Application.UNCAUGHT_EXCEPTION, e);
  return f.promise
};
webdriver.promise.Application.prototype.scheduleTimeout = function(a, b) {
  return this.schedule(a, function() {
    return webdriver.promise.delayed(b)
  })
};
webdriver.promise.Application.prototype.scheduleWait = function(a, b, c, d, e) {
  var f = Math.min(c, 100), g = !!e;
  return this.schedule(a, function() {
    function a() {
      return webdriver.promise.when(b(), function(b) {
        var k = goog.now() - e;
        g != !!b ? j.resolve() : k >= c ? j.reject(Error((d ? d + "\n" : "") + "Wait timed out after " + k + "ms")) : setTimeout(a, f)
      })
    }
    var e = goog.now(), j = new webdriver.promise.Deferred;
    a();
    return j.promise
  })
};
webdriver.promise.Application.prototype.scheduleNext_ = function() {
  if(!this.executeNextId_) {
    this.executeNextId_ = setTimeout(goog.bind(this.executeNext_, this), 0)
  }
};
webdriver.promise.Application.prototype.cancelNext_ = function() {
  if(this.executeNextId_) {
    clearTimeout(this.executeNextId_), this.executeNextId_ = null
  }
};
webdriver.promise.Application.prototype.executeNext_ = function() {
  this.executeNextId_ = null;
  var a = goog.array.peek(this.frames_), b = a.queue.shift();
  if(b) {
    a.isActive = !0;
    var a = this.executeAsap_(b.execute), c = this;
    webdriver.promise.asap(a, function(a) {
      b.resolve(a);
      c.scheduleNext_()
    }, function(a) {
      b.reject(a);
      c.scheduleNext_()
    })
  }else {
    this.frames_.pop(), a.resolve()
  }
};
webdriver.promise.Application.prototype.executeAsap_ = function(a) {
  var b = goog.array.peek(this.frames_);
  if(!b || !b.isActive) {
    try {
      return a()
    }catch(c) {
      return webdriver.promise.rejected(c)
    }
  }else {
    b = new webdriver.promise.Application.Frame_;
    b.addBoth(this.scheduleNext_, this);
    this.frames_.push(b);
    try {
      var d = a();
      return b.queue.length ? b.then(function() {
        return d
      }) : (this.frames_.pop(), d)
    }catch(e) {
      return this.frames_.pop(), webdriver.promise.rejected(e)
    }
  }
};
webdriver.promise.Application.prototype.commenceShutdown_ = function() {
  if(!this.shutdownId_) {
    var a = this;
    a.shutdownId_ = setTimeout(function() {
      a.shutdownId_ = null;
      a.emit(webdriver.promise.Application.IDLE)
    }, 0)
  }
};
webdriver.promise.Application.prototype.cancelShutdown_ = function() {
  if(this.shutdownId_) {
    clearTimeout(this.shutdownId_), this.shutdownId_ = null
  }
};
webdriver.promise.Application.prototype.abortNow_ = function(a) {
  this.frames_ = [];
  this.cancelShutdown_();
  this.cancelNext_();
  this.listeners(webdriver.promise.Application.UNCAUGHT_EXCEPTION).length ? this.emit(webdriver.promise.Application.UNCAUGHT_EXCEPTION, a) : setTimeout(function() {
    throw a;
  }, 0)
};
webdriver.promise.Application.prototype.abortCurrentFrame_ = function(a) {
  var b = this.frames_.pop();
  if(b) {
    try {
      b.reject(a)
    }catch(c) {
      throw c;
    }
  }else {
    this.abortNow_(a)
  }
};
webdriver.promise.Application.Frame_ = function() {
  webdriver.promise.Deferred.call(this);
  this.queue = []
};
goog.inherits(webdriver.promise.Application.Frame_, webdriver.promise.Deferred);
webdriver.promise.Application.Frame_.prototype.isActive = !1;
webdriver.promise.Application.Task_ = function(a, b) {
  webdriver.promise.Deferred.call(this);
  this.execute = a;
  this.description = b
};
goog.inherits(webdriver.promise.Application.Task_, webdriver.promise.Deferred);
var bot = {ErrorCode:{SUCCESS:0, NO_SUCH_ELEMENT:7, NO_SUCH_FRAME:8, UNKNOWN_COMMAND:9, UNSUPPORTED_OPERATION:9, STALE_ELEMENT_REFERENCE:10, ELEMENT_NOT_VISIBLE:11, INVALID_ELEMENT_STATE:12, UNKNOWN_ERROR:13, ELEMENT_NOT_SELECTABLE:15, JAVASCRIPT_ERROR:17, XPATH_LOOKUP_ERROR:19, TIMEOUT:21, NO_SUCH_WINDOW:23, INVALID_COOKIE_DOMAIN:24, UNABLE_TO_SET_COOKIE:25, MODAL_DIALOG_OPENED:26, NO_MODAL_DIALOG_OPEN:27, SCRIPT_TIMEOUT:28, INVALID_ELEMENT_COORDINATES:29, INVALID_SELECTOR_ERROR:32, SQL_DATABASE_ERROR:33, 
MOVE_TARGET_OUT_OF_BOUNDS:34, IME_ENGINE_ACTIVATION_FAILED:35, IME_NOT_AVAILABLE:36}};
bot.Error = function(a, b) {
  goog.debug.Error.call(this, b);
  this.code = a;
  this.name = bot.Error.NAMES_[a] || bot.Error.NAMES_[bot.ErrorCode.UNKNOWN_ERROR]
};
goog.inherits(bot.Error, goog.debug.Error);
bot.Error.NAMES_ = goog.object.transpose({NoSuchElementError:bot.ErrorCode.NO_SUCH_ELEMENT, NoSuchFrameError:bot.ErrorCode.NO_SUCH_FRAME, UnknownCommandError:bot.ErrorCode.UNKNOWN_COMMAND, StaleElementReferenceError:bot.ErrorCode.STALE_ELEMENT_REFERENCE, ElementNotVisibleError:bot.ErrorCode.ELEMENT_NOT_VISIBLE, InvalidElementStateError:bot.ErrorCode.INVALID_ELEMENT_STATE, UnknownError:bot.ErrorCode.UNKNOWN_ERROR, ElementNotSelectableError:bot.ErrorCode.ELEMENT_NOT_SELECTABLE, XPathLookupError:bot.ErrorCode.XPATH_LOOKUP_ERROR, 
NoSuchWindowError:bot.ErrorCode.NO_SUCH_WINDOW, InvalidCookieDomainError:bot.ErrorCode.INVALID_COOKIE_DOMAIN, UnableToSetCookieError:bot.ErrorCode.UNABLE_TO_SET_COOKIE, ModalDialogOpenedError:bot.ErrorCode.MODAL_DIALOG_OPENED, NoModalDialogOpenError:bot.ErrorCode.NO_MODAL_DIALOG_OPEN, ScriptTimeoutError:bot.ErrorCode.SCRIPT_TIMEOUT, InvalidSelectorError:bot.ErrorCode.INVALID_SELECTOR_ERROR, SqlDatabaseError:bot.ErrorCode.SQL_DATABASE_ERROR, MoveTargetOutOfBoundsError:bot.ErrorCode.MOVE_TARGET_OUT_OF_BOUNDS});
bot.Error.prototype.isAutomationError = !0;
if(goog.DEBUG) {
  bot.Error.prototype.toString = function() {
    return"[" + this.name + "] " + this.message
  }
}
;webdriver.error = {};
webdriver.error.createResponse = function(a) {
  return{status:a && a.code || 13, value:{message:a && a.message || a + ""}}
};
webdriver.error.checkResponse = function(a) {
  var b = a.status;
  if(b == bot.ErrorCode.SUCCESS) {
    return a
  }
  b = b || bot.ErrorCode.UNKNOWN_ERROR;
  a = a.value;
  if(!a || !goog.isObject(a)) {
    throw new bot.Error(b, a + "");
  }
  throw new bot.Error(b, a.message + "");
};
webdriver.CommandResponse = {};
webdriver.Command = function(a) {
  this.name_ = a;
  this.parameters_ = {}
};
webdriver.Command.prototype.getName = function() {
  return this.name_
};
webdriver.Command.prototype.setParameter = function(a, b) {
  this.parameters_[a] = b;
  return this
};
webdriver.Command.prototype.setParameters = function(a) {
  this.parameters_ = a;
  return this
};
webdriver.Command.prototype.getParameter = function(a) {
  return this.parameters_[a]
};
webdriver.Command.prototype.getParameters = function() {
  return this.parameters_
};
webdriver.CommandName = {GET_SERVER_STATUS:"status", NEW_SESSION:"newSession", DESCRIBE_SESSION:"describeSession", CLOSE:"close", QUIT:"quit", GET_CURRENT_URL:"getCurrentUrl", GET:"get", GO_BACK:"goBack", GO_FORWARD:"goForward", REFRESH:"refresh", ADD_COOKIE:"addCookie", GET_COOKIE:"getCookie", GET_ALL_COOKIES:"getCookies", DELETE_COOKIE:"deleteCookie", DELETE_ALL_COOKIES:"deleteAllCookies", FIND_ELEMENT:"findElement", FIND_ELEMENTS:"findElements", FIND_CHILD_ELEMENT:"findChildElement", FIND_CHILD_ELEMENTS:"findChildElements", 
CLEAR_ELEMENT:"clearElement", CLICK_ELEMENT:"clickElement", SEND_KEYS_TO_ELEMENT:"sendKeysToElement", SUBMIT_ELEMENT:"submitElement", TOGGLE_ELEMENT:"toggleElement", GET_CURRENT_WINDOW_HANDLE:"getCurrentWindowHandle", GET_WINDOW_HANDLES:"getWindowHandles", SWITCH_TO_WINDOW:"switchToWindow", SWITCH_TO_FRAME:"switchToFrame", GET_PAGE_SOURCE:"getPageSource", GET_TITLE:"getTitle", EXECUTE_SCRIPT:"executeScript", EXECUTE_ASYNC_SCRIPT:"executeAsyncScript", GET_ELEMENT_TEXT:"getElementText", GET_ELEMENT_TAG_NAME:"getElementTagName", 
IS_ELEMENT_SELECTED:"isElementSelected", IS_ELEMENT_ENABLED:"isElementEnabled", IS_ELEMENT_DISPLAYED:"isElementDisplayed", GET_ELEMENT_LOCATION:"getElementLocation", GET_ELEMENT_SIZE:"getElementSize", GET_ELEMENT_ATTRIBUTE:"getElementAttribute", GET_ELEMENT_VALUE_OF_CSS_PROPERTY:"getElementValueOfCssProperty", ELEMENT_EQUALS:"elementEquals", SCREENSHOT:"screenshot", DIMISS_ALERT:"dimissAlert", IMPLICITLY_WAIT:"implicitlyWait", SET_SCRIPT_TIMEOUT:"setScriptTimeout", GET_ALERT:"getAlert", ACCEPT_ALERT:"acceptAlert", 
DISMISS_ALERT:"dismissAlert", GET_ALERT_TEXT:"getAlertText", SET_ALERT_VALUE:"setAlertValue"};
webdriver.CommandExecutor = function() {
};
goog.json = {};
goog.json.isValid_ = function(a) {
  if(/^\s*$/.test(a)) {
    return!1
  }
  return/^[\],:{}\s\u2028\u2029]*$/.test(a.replace(/\\["\\\/bfnrtu]/g, "@").replace(/"[^"\\\n\r\u2028\u2029\x00-\x08\x10-\x1f\x80-\x9f]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g, "]").replace(/(?:^|:|,)(?:[\s\u2028\u2029]*\[)+/g, ""))
};
goog.json.parse = function(a) {
  a = String(a);
  if(goog.json.isValid_(a)) {
    try {
      return eval("(" + a + ")")
    }catch(b) {
    }
  }
  throw Error("Invalid JSON string: " + a);
};
goog.json.unsafeParse = function(a) {
  return eval("(" + a + ")")
};
goog.json.serialize = function(a) {
  return(new goog.json.Serializer).serialize(a)
};
goog.json.Serializer = function() {
};
goog.json.Serializer.prototype.serialize = function(a) {
  var b = [];
  this.serialize_(a, b);
  return b.join("")
};
goog.json.Serializer.prototype.serialize_ = function(a, b) {
  switch(typeof a) {
    case "string":
      this.serializeString_(a, b);
      break;
    case "number":
      this.serializeNumber_(a, b);
      break;
    case "boolean":
      b.push(a);
      break;
    case "undefined":
      b.push("null");
      break;
    case "object":
      if(a == null) {
        b.push("null");
        break
      }
      if(goog.isArray(a)) {
        this.serializeArray_(a, b);
        break
      }
      this.serializeObject_(a, b);
      break;
    case "function":
      break;
    default:
      throw Error("Unknown type: " + typeof a);
  }
};
goog.json.Serializer.charToJsonCharCache_ = {'"':'\\"', "\\":"\\\\", "/":"\\/", "\u0008":"\\b", "\u000c":"\\f", "\n":"\\n", "\r":"\\r", "\t":"\\t", "\u000b":"\\u000b"};
goog.json.Serializer.charsToReplace_ = /\uffff/.test("\uffff") ? /[\\\"\x00-\x1f\x7f-\uffff]/g : /[\\\"\x00-\x1f\x7f-\xff]/g;
goog.json.Serializer.prototype.serializeString_ = function(a, b) {
  b.push('"', a.replace(goog.json.Serializer.charsToReplace_, function(a) {
    if(a in goog.json.Serializer.charToJsonCharCache_) {
      return goog.json.Serializer.charToJsonCharCache_[a]
    }
    var b = a.charCodeAt(0), e = "\\u";
    b < 16 ? e += "000" : b < 256 ? e += "00" : b < 4096 && (e += "0");
    return goog.json.Serializer.charToJsonCharCache_[a] = e + b.toString(16)
  }), '"')
};
goog.json.Serializer.prototype.serializeNumber_ = function(a, b) {
  b.push(isFinite(a) && !isNaN(a) ? a : "null")
};
goog.json.Serializer.prototype.serializeArray_ = function(a, b) {
  var c = a.length;
  b.push("[");
  for(var d = "", e = 0;e < c;e++) {
    b.push(d), this.serialize_(a[e], b), d = ","
  }
  b.push("]")
};
goog.json.Serializer.prototype.serializeObject_ = function(a, b) {
  b.push("{");
  var c = "", d;
  for(d in a) {
    if(Object.prototype.hasOwnProperty.call(a, d)) {
      var e = a[d];
      typeof e != "function" && (b.push(c), this.serializeString_(d, b), b.push(":"), this.serialize_(e, b), c = ",")
    }
  }
  b.push("}")
};
webdriver.Session = function(a, b) {
  this.id = a;
  this.capabilities = b
};
goog.exportSymbol("webdriver.Session", webdriver.Session);
webdriver.Session.prototype.getId = function() {
  return this.id
};
goog.exportProperty(webdriver.Session.prototype, "getId", webdriver.Session.prototype.getId);
webdriver.Session.prototype.getCapabilities = function() {
  return this.capabilities
};
goog.exportProperty(webdriver.Session.prototype, "getCapabilities", webdriver.Session.prototype.getCapabilities);
webdriver.Session.prototype.toJSON = function() {
  return this.id
};
webdriver.Locator = function(a, b) {
  this.using = a;
  this.value = b
};
webdriver.Locator.factory_ = function(a) {
  return function(b) {
    return new webdriver.Locator(a, b)
  }
};
webdriver.Locator.Strategy = {className:webdriver.Locator.factory_("class name"), "class name":webdriver.Locator.factory_("class name"), css:webdriver.Locator.factory_("css"), id:webdriver.Locator.factory_("id"), js:webdriver.Locator.factory_("js"), linkText:webdriver.Locator.factory_("link text"), "link text":webdriver.Locator.factory_("link text"), name:webdriver.Locator.factory_("name"), partialLinkText:webdriver.Locator.factory_("partial link text"), "partial link text":webdriver.Locator.factory_("partial link text"), 
tagName:webdriver.Locator.factory_("tag name"), "tag name":webdriver.Locator.factory_("tag name"), xpath:webdriver.Locator.factory_("xpath")};
goog.exportSymbol("By", webdriver.Locator.Strategy);
webdriver.Locator.createFromObj = function(a) {
  var b = goog.object.getAnyKey(a);
  if(b) {
    if(b in webdriver.Locator.Strategy) {
      return webdriver.Locator.Strategy[b](a[b])
    }
  }else {
    throw Error("No keys found in locator hash object");
  }
  throw Error("Unsupported locator strategy: " + b);
};
webdriver.Locator.checkLocator = function(a) {
  if(!a.using || !a.value) {
    a = webdriver.Locator.createFromObj(a)
  }
  if(a.using == "class name") {
    var b = goog.string.normalizeWhitespace(a.value);
    a.value = goog.string.trim(b);
    if(a.value.search(/\s/) >= 0) {
      throw Error("Compound class names are not allowed for searches: " + goog.string.quote(a.target));
    }
  }
  return a
};
webdriver.Locator.prototype.toString = function() {
  return"By " + this.using + " (" + this.value + ")"
};
webdriver.WebDriver = function(a, b) {
  this.session_ = a;
  this.executor_ = b
};
webdriver.WebDriver.toWireValue_ = function(a) {
  switch(goog.typeOf(a)) {
    case "array":
      return webdriver.promise.fullyResolved(goog.array.map(a, webdriver.WebDriver.toWireValue_));
    case "object":
      if(goog.isFunction(a.toWireValue)) {
        return webdriver.promise.fullyResolved(a.toWireValue())
      }
      if(goog.isFunction(a.toJSON)) {
        return webdriver.promise.resolved(a.toJSON())
      }
      return webdriver.promise.fullyResolved(goog.object.map(a, webdriver.WebDriver.toWireValue_));
    case "function":
      return webdriver.promise.resolved("" + a);
    case "undefined":
      return webdriver.promise.resolved(null);
    default:
      return webdriver.promise.resolved(a)
  }
};
webdriver.WebDriver.fromWireValue_ = function(a, b) {
  goog.isArray(b) ? b = goog.array.map(b, goog.partial(webdriver.WebDriver.fromWireValue_, a)) : b && goog.isObject(b) && (b = webdriver.WebElement.ELEMENT_KEY in b ? new webdriver.WebElement(a, b[webdriver.WebElement.ELEMENT_KEY]) : goog.object.map(b, goog.partial(webdriver.WebDriver.fromWireValue_, a)));
  return b
};
webdriver.WebDriver.prototype.schedule = function(a, b) {
  function c() {
    if(!d.session_) {
      throw Error("This driver instance does not have a valid session ID (did you call WebDriver.quit()?) and may no longer be used.");
    }
  }
  var d = this;
  c();
  a.setParameter("sessionId", this.session_);
  return webdriver.promise.Application.getInstance().schedule(b, function() {
    c();
    return webdriver.promise.fullyResolved(a.getParameters()).then(webdriver.WebDriver.toWireValue_).then(function(b) {
      a.setParameters(b);
      return webdriver.promise.checkedNodeCall(goog.bind(d.executor_.execute, d.executor_, a))
    })
  }).then(function(a) {
    webdriver.error.checkResponse(a);
    return webdriver.WebDriver.fromWireValue_(d, a.value)
  })
};
webdriver.WebDriver.prototype.getSession = function() {
  return webdriver.promise.when(this.session_)
};
goog.exportSymbol("webdriver.WebDriver.prototype.getSession", webdriver.WebDriver.prototype.getSession);
webdriver.WebDriver.prototype.getCapability = function(a) {
  return webdriver.promise.when(this.session_, function(b) {
    return b.capabilities[a]
  })
};
goog.exportSymbol("webdriver.WebDriver.prototype.getCapability", webdriver.WebDriver.prototype.getCapability);
webdriver.WebDriver.prototype.quit = function() {
  this.schedule(new webdriver.Command(webdriver.CommandName.QUIT), "WebDriver.quit()").addBoth(function() {
    delete this.session_
  }, this)
};
goog.exportSymbol("webdriver.WebDriver.prototype.quit", webdriver.WebDriver.prototype.quit);
webdriver.WebDriver.prototype.executeScript = function(a) {
  goog.isFunction(a) && (a = "return (" + a + ").apply(null, arguments);");
  return this.schedule((new webdriver.Command(webdriver.CommandName.EXECUTE_SCRIPT)).setParameter("script", a).setParameter("args", goog.array.slice(arguments, 1)), "WebDriver.executeScript()")
};
goog.exportSymbol("webdriver.WebDriver.prototype.executeScript", webdriver.WebDriver.prototype.executeScript);
webdriver.WebDriver.prototype.executeAsyncScript = function(a) {
  goog.isFunction(a) && (a = "return (" + a + ").apply(null, arguments);");
  return this.schedule((new webdriver.Command(webdriver.CommandName.EXECUTE_ASYNC_SCRIPT)).setParameter("script", a).setParameter("args", goog.array.slice(arguments, 1)), "WebDriver.executeScript()")
};
goog.exportSymbol("webdriver.WebDriver.prototype.executeAsyncScript", webdriver.WebDriver.prototype.executeAsyncScript);
webdriver.WebDriver.prototype.call = function(a, b) {
  var c = goog.array.slice(arguments, 2), d = webdriver.promise.Application.getInstance().schedule("WebDriver.call(" + (a.name || "function") + ")", webdriver.promise.resolved);
  return webdriver.promise.when(d, function() {
    return a.apply(b, c)
  })
};
goog.exportSymbol("webdriver.WebDriver.prototype.call", webdriver.WebDriver.prototype.call);
webdriver.WebDriver.prototype.wait = function(a, b, c, d, e) {
  var f = a.name || "<anonymous function>", g = d ? " (" + d + ")" : "";
  return webdriver.promise.Application.getInstance().scheduleWait("WebDriver.wait(" + f + ")" + g, goog.bind(a, c), b, d, e)
};
goog.exportSymbol("webdriver.WebDriver.prototype.wait", webdriver.WebDriver.prototype.wait);
webdriver.WebDriver.prototype.waitNot = function(a, b, c, d) {
  return this.wait(a, b, c, d, !0)
};
goog.exportSymbol("webdriver.WebDriver.prototype.waitNot", webdriver.WebDriver.prototype.waitNot);
webdriver.WebDriver.prototype.sleep = function(a) {
  return webdriver.promise.Application.getInstance().scheduleTimeout("WebDriver.sleep(" + a + ")", a)
};
goog.exportSymbol("webdriver.WebDriver.prototype.sleep", webdriver.WebDriver.prototype.sleep);
webdriver.WebDriver.prototype.getWindowHandle = function() {
  return this.schedule(new webdriver.Command(webdriver.CommandName.GET_CURRENT_WINDOW_HANDLE), "WebDriver.getWindowHandle()")
};
goog.exportSymbol("webdriver.WebDriver.prototype.getWindowHandle", webdriver.WebDriver.prototype.getWindowHandle);
webdriver.WebDriver.prototype.getAllWindowHandles = function() {
  return this.schedule(new webdriver.Command(webdriver.CommandName.GET_WINDOW_HANDLES), "WebDriver.getAllWindowHandles()")
};
goog.exportSymbol("webdriver.WebDriver.prototype.getAllWindowHandles", webdriver.WebDriver.prototype.getAllWindowHandles);
webdriver.WebDriver.prototype.getPageSource = function() {
  return this.schedule(new webdriver.Command(webdriver.CommandName.GET_PAGE_SOURCE), "WebDriver.getAllWindowHandles()")
};
goog.exportSymbol("webdriver.WebDriver.prototype.getPageSource", webdriver.WebDriver.prototype.getPageSource);
webdriver.WebDriver.prototype.close = function() {
  return this.schedule(new webdriver.Command(webdriver.CommandName.CLOSE), "WebDriver.close()")
};
goog.exportSymbol("webdriver.WebDriver.prototype.close", webdriver.WebDriver.prototype.close);
webdriver.WebDriver.prototype.get = function(a) {
  return this.navigate().to(a)
};
goog.exportSymbol("webdriver.WebDriver.prototype.get", webdriver.WebDriver.prototype.get);
webdriver.WebDriver.prototype.getCurrentUrl = function() {
  return this.schedule(new webdriver.Command(webdriver.CommandName.GET_CURRENT_URL), "WebDriver.getCurrentUrl()")
};
goog.exportSymbol("webdriver.WebDriver.prototype.getCurrentUrl", webdriver.WebDriver.prototype.getCurrentUrl);
webdriver.WebDriver.prototype.getTitle = function() {
  return this.schedule(new webdriver.Command(webdriver.CommandName.GET_TITLE), "WebDriver.getTitle()")
};
goog.exportSymbol("webdriver.WebDriver.prototype.getTitle", webdriver.WebDriver.prototype.getTitle);
webdriver.WebDriver.prototype.findElement = function(a) {
  var a = webdriver.Locator.checkLocator(a), b;
  a.using == "js" ? (b = goog.array.slice(arguments, 1), goog.array.splice(b, 0, 0, a.value), b = this.executeScript.apply(this, b).then(function(a) {
    if(!(a instanceof webdriver.WebElement)) {
      throw Error("JS locator script result was not a WebElement");
    }
    return a
  })) : b = this.schedule((new webdriver.Command(webdriver.CommandName.FIND_ELEMENT)).setParameter("using", a.using).setParameter("value", a.value), "WebDriver.findElement(" + a + ")");
  return new webdriver.WebElement(this, b)
};
goog.exportSymbol("webdriver.WebDriver.prototype.findElement", webdriver.WebDriver.prototype.findElement);
webdriver.WebDriver.prototype.isElementPresent = function() {
  return this.findElement.apply(this, arguments).then(function() {
    return!0
  }, function(a) {
    if(a.code == bot.ErrorCode.NO_SUCH_ELEMENT) {
      return!1
    }
    throw a;
  })
};
goog.exportSymbol("webdriver.WebDriver.prototype.isElementPresent", webdriver.WebDriver.prototype.isElementPresent);
webdriver.WebDriver.prototype.findElements = function(a) {
  a = webdriver.Locator.checkLocator(a);
  if(a.using == "js") {
    var b = goog.array.slice(arguments, 1);
    goog.array.splice(b, 0, 0, a.value);
    return this.executeScript.apply(this, b).then(function(a) {
      if(a instanceof webdriver.WebElement) {
        return[a]
      }else {
        if(!goog.isArray(a)) {
          return[]
        }
      }
      return goog.array.filter(a, function(a) {
        return a instanceof webdriver.WebElement
      })
    })
  }else {
    return this.schedule((new webdriver.Command(webdriver.CommandName.FIND_ELEMENTS)).setParameter("using", a.using).setParameter("value", a.value), "WebDriver.findElements(" + a + ")")
  }
};
goog.exportSymbol("webdriver.WebDriver.prototype.findElements", webdriver.WebDriver.prototype.findElements);
webdriver.WebDriver.prototype.manage = function() {
  return new webdriver.WebDriver.Options(this)
};
goog.exportSymbol("webdriver.WebDriver.prototype.manage", webdriver.WebDriver.prototype.manage);
webdriver.WebDriver.prototype.navigate = function() {
  return new webdriver.WebDriver.Navigation(this)
};
goog.exportSymbol("webdriver.WebDriver.prototype.navigate", webdriver.WebDriver.prototype.navigate);
webdriver.WebDriver.prototype.switchTo = function() {
  return new webdriver.WebDriver.TargetLocator(this)
};
goog.exportSymbol("webdriver.WebDriver.prototype.switchTo", webdriver.WebDriver.prototype.switchTo);
webdriver.WebDriver.Navigation = function(a) {
  this.driver_ = a
};
webdriver.WebDriver.Navigation.prototype.to = function(a) {
  return this.driver_.schedule((new webdriver.Command(webdriver.CommandName.GET)).setParameter("url", a), "WebDriver.navigate().to(" + a + ")")
};
goog.exportSymbol("webdriver.WebDriver.Navigation.prototype.to", webdriver.WebDriver.Navigation.prototype.to);
webdriver.WebDriver.Navigation.prototype.back = function() {
  return this.driver_.schedule(new webdriver.Command(webdriver.CommandName.GO_BACK), "WebDriver.navigate().back()")
};
goog.exportSymbol("webdriver.WebDriver.Navigation.prototype.back", webdriver.WebDriver.Navigation.prototype.back);
webdriver.WebDriver.Navigation.prototype.forward = function() {
  return this.driver_.schedule(new webdriver.Command(webdriver.CommandName.GO_FORWARD), "WebDriver.navigate().forward()")
};
goog.exportSymbol("webdriver.WebDriver.Navigation.prototype.forward", webdriver.WebDriver.Navigation.prototype.forward);
webdriver.WebDriver.Navigation.prototype.refresh = function() {
  return this.driver_.schedule(new webdriver.Command(webdriver.CommandName.REFRESH), "WebDriver.navigate().refresh()")
};
goog.exportSymbol("webdriver.WebDriver.Navigation.prototype.refresh", webdriver.WebDriver.Navigation.prototype.refresh);
webdriver.WebDriver.Options = function(a) {
  this.driver_ = a
};
webdriver.WebDriver.Options.prototype.addCookie = function(a, b, c, d, e) {
  if(/[;=]/.test(a)) {
    throw Error('Invalid cookie name "' + a + '"');
  }
  if(/;/.test(b)) {
    throw Error('Invalid cookie value "' + b + '"');
  }
  var f = a + "=" + b + (d ? ";domain=" + d : "") + (c ? ";path=" + c : "") + (e ? ";secure" : "");
  return this.driver_.schedule((new webdriver.Command(webdriver.CommandName.ADD_COOKIE)).setParameter("name", a).setParameter("value", b).setParameter("path", c).setParameter("domain", d).setParameter("secure", !!e), "WebDriver.manage().addCookie(" + f + ")")
};
goog.exportSymbol("webdriver.WebDriver.Options.prototype.addCookie", webdriver.WebDriver.Options.prototype.addCookie);
webdriver.WebDriver.Options.prototype.deleteAllCookies = function() {
  return this.driver_.schedule(new webdriver.Command(webdriver.CommandName.ADD_COOKIE), "WebDriver.manage().deleteAllCookies()")
};
goog.exportSymbol("webdriver.WebDriver.Options.prototype.deleteAllCookies", webdriver.WebDriver.Options.prototype.deleteAllCookies);
webdriver.WebDriver.Options.prototype.deleteCookie = function(a) {
  return this.driver_.schedule(new webdriver.Command(webdriver.CommandName.DELETE_COOKIE), "WebDriver.manage().deleteCookie(" + a + ")")
};
goog.exportSymbol("webdriver.WebDriver.Options.prototype.deleteCookie", webdriver.WebDriver.Options.prototype.deleteCookie);
webdriver.WebDriver.Options.prototype.getCookies = function() {
  return this.driver_.schedule(new webdriver.Command(webdriver.CommandName.GET_ALL_COOKIES), "WebDriver.manage().getCookies()")
};
goog.exportSymbol("webdriver.WebDriver.Options.prototype.getCookies", webdriver.WebDriver.Options.prototype.getCookies);
webdriver.WebDriver.Options.prototype.getCookie = function(a) {
  return this.getCookies().addCallback(function(b) {
    return goog.array.find(b, function(b) {
      return b && b.name == a
    })
  })
};
goog.exportSymbol("webdriver.WebDriver.Options.prototype.getCookie", webdriver.WebDriver.Options.prototype.getCookie);
webdriver.WebDriver.Options.prototype.timeouts = function() {
  return new webdriver.WebDriver.Timeouts(this.driver_)
};
goog.exportSymbol("webdriver.WebDriver.Options.prototype.timeouts", webdriver.WebDriver.Options.prototype.timeouts);
webdriver.WebDriver.Timeouts = function(a) {
  this.driver_ = a
};
webdriver.WebDriver.Timeouts.prototype.implicitlyWait = function(a) {
  return this.driver_.schedule((new webdriver.Command(webdriver.CommandName.IMPLICITLY_WAIT)).setParameter("ms", a < 0 ? 0 : a), "WebDriver.manage().timeouts().implicitlyWait(" + a + ")")
};
goog.exportSymbol("webdriver.WebDriver.Timeouts.prototype.implicitlyWait", webdriver.WebDriver.Timeouts.prototype.implicitlyWait);
webdriver.WebDriver.Timeouts.prototype.setScriptTimeout = function(a) {
  return this.driver_.schedule((new webdriver.Command(webdriver.CommandName.SET_SCRIPT_TIMEOUT)).setParameter("ms", a < 0 ? 0 : a), "WebDriver.manage().timeouts().setScriptTimeout(" + a + ")")
};
goog.exportSymbol("webdriver.WebDriver.Timeouts.prototype.setScriptTimeout", webdriver.WebDriver.Timeouts.prototype.setScriptTimeout);
webdriver.WebDriver.TargetLocator = function(a) {
  this.driver_ = a
};
webdriver.WebDriver.TargetLocator.prototype.activeElement = function() {
  var a = this.driver_.schedule(new webdriver.Command(webdriver.CommandName.GET_ACTIVE_ELEMENT), "WebDriver.switchTo().activeElement()");
  return new webdriver.WebElement(this.driver_, a)
};
goog.exportSymbol("webdriver.WebDriver.TargetLocator.prototype.activeElement", webdriver.WebDriver.TargetLocator.prototype.activeElement);
webdriver.WebDriver.TargetLocator.prototype.defaultContent = function() {
  return this.driver_.schedule((new webdriver.Command(webdriver.CommandName.SWITCH_TO_FRAME)).setParameter("id", null), "WebDriver.switchTo().defaultContent()")
};
goog.exportSymbol("webdriver.WebDriver.TargetLocator.prototype.defaultContent", webdriver.WebDriver.TargetLocator.prototype.defaultContent);
webdriver.WebDriver.TargetLocator.prototype.frame = function(a) {
  return this.driver_.schedule((new webdriver.Command(webdriver.CommandName.SWITCH_TO_FRAME)).setParameter("id", a), "WebDriver.switchTo().frame(" + a + ")")
};
goog.exportSymbol("webdriver.WebDriver.TargetLocator.prototype.frame", webdriver.WebDriver.TargetLocator.prototype.frame);
webdriver.WebDriver.TargetLocator.prototype.window = function(a) {
  return this.driver_.schedule((new webdriver.Command(webdriver.CommandName.SWITCH_TO_WINDOW)).setParameter("name", a), "WebDriver.switchTo().frame(" + a + ")")
};
goog.exportSymbol("webdriver.WebDriver.TargetLocator.prototype.window", webdriver.WebDriver.TargetLocator.prototype.window);
webdriver.Key = {NULL:"\ue000", CANCEL:"\ue001", HELP:"\ue002", BACK_SPACE:"\ue003", TAB:"\ue004", CLEAR:"\ue005", RETURN:"\ue006", ENTER:"\ue007", SHIFT:"\ue008", CONTROL:"\ue009", ALT:"\ue00a", PAUSE:"\ue00b", ESCAPE:"\ue00c", SPACE:"\ue00d", PAGE_UP:"\ue00e", PAGE_DOWN:"\ue00f", END:"\ue010", HOME:"\ue011", ARROW_LEFT:"\ue012", ARROW_UP:"\ue013", ARROW_RIGHT:"\ue014", ARROW_DOWN:"\ue015", INSERT:"\ue016", DELETE:"\ue017", SEMICOLON:"\ue018", EQUALS:"\ue019", NUMPAD0:"\ue01a", NUMPAD1:"\ue01b", 
NUMPAD2:"\ue01c", NUMPAD3:"\ue01d", NUMPAD4:"\ue01e", NUMPAD5:"\ue01f", NUMPAD6:"\ue020", NUMPAD7:"\ue021", NUMPAD8:"\ue022", NUMPAD9:"\ue023", MULTIPLY:"\ue024", ADD:"\ue025", SEPARATOR:"\ue026", SUBTRACT:"\ue027", DECIMAL:"\ue028", DIVIDE:"\ue029", F1:"\ue031", F2:"\ue032", F3:"\ue033", F4:"\ue034", F5:"\ue035", F6:"\ue036", F7:"\ue037", F8:"\ue038", F9:"\ue039", F10:"\ue03a", F11:"\ue03b", F12:"\ue03c", COMMAND:"\ue03d", META:"\ue03d"};
goog.exportSymbol("webdriver.Key", webdriver.Key);
webdriver.Key.chord = function() {
  var a = goog.array.reduce(goog.array.slice(arguments, 0), function(a, c) {
    return a + c
  }, "");
  a += webdriver.Key.NULL;
  return a
};
goog.exportProperty(webdriver.Key, "chord", webdriver.Key.chord);
webdriver.WebElement = function(a, b) {
  webdriver.promise.Deferred.call(this);
  this.driver_ = a;
  var c = this, d = this.resolve, e = this.reject;
  delete this.promise;
  delete this.resolve;
  delete this.reject;
  this.id_ = webdriver.promise.when(b, function(a) {
    d(c);
    if(a instanceof webdriver.WebElement) {
      return a.id_
    }else {
      if(goog.isDef(a[webdriver.WebElement.ELEMENT_KEY])) {
        return a
      }
    }
    var b = {};
    b[webdriver.WebElement.ELEMENT_KEY] = a;
    return b
  }, e)
};
goog.inherits(webdriver.WebElement, webdriver.promise.Deferred);
webdriver.WebElement.ELEMENT_KEY = "ELEMENT";
goog.exportSymbol("webdriver.WebElement.ELEMENT_KEY", webdriver.WebElement.ELEMENT_KEY);
webdriver.WebElement.prototype.getDriver = function() {
  return this.driver_
};
goog.exportSymbol("webdriver.WebElement.prototype.getDriver", webdriver.WebElement.prototype.getDriver);
webdriver.WebElement.prototype.toWireValue = function() {
  return this.id_
};
webdriver.WebElement.prototype.schedule_ = function(a, b) {
  a.setParameter("id", this.id_);
  return this.driver_.schedule(a, b)
};
webdriver.WebElement.prototype.findElement = function(a) {
  a = webdriver.Locator.checkLocator(a);
  if(a.using == "js") {
    return this.driver_.findElement.apply(this.driver_, arguments)
  }
  var b = this.schedule_((new webdriver.Command(webdriver.CommandName.FIND_ELEMENT)).setParameter("using", a.using).setParameter("value", a.value), "WebElement.findElement(" + a + ")");
  return new webdriver.WebElement(this.driver_, b)
};
goog.exportSymbol("webdriver.WebElement.prototype.findElement", webdriver.WebElement.prototype.findElement);
webdriver.WebElement.prototype.isElementPresent = function(a) {
  a = webdriver.Locator.checkLocator(a);
  if(a.using == "js") {
    return this.driver_.isElementPresent.apply(this.driver_, arguments)
  }
  return this.findElement.apply(this, arguments).then(function() {
    return!0
  }, function(a) {
    if(a.name == bot.ErrorCode.NO_SUCH_ELEMENT) {
      return!1
    }
    throw a;
  })
};
goog.exportSymbol("webdriver.WebElement.prototype.isElementPresent", webdriver.WebElement.prototype.isElementPresent);
webdriver.WebElement.prototype.findElements = function(a) {
  a = webdriver.Locator.checkLocator(a);
  if(a.using == "js") {
    return this.driver_.findElements.apply(this.driver_, arguments)
  }
  return this.schedule_((new webdriver.Command(webdriver.CommandName.FIND_ELEMENTS)).setParameter("using", a.using).setParameter("value", a.value), "WebElement.findElements(" + a + ")")
};
goog.exportSymbol("webdriver.WebElement.prototype.findElements", webdriver.WebElement.prototype.findElements);
webdriver.WebElement.prototype.click = function() {
  return this.schedule_(new webdriver.Command(webdriver.CommandName.CLICK_ELEMENT), "WebElement.click()")
};
goog.exportSymbol("webdriver.WebElement.prototype.click", webdriver.WebElement.prototype.click);
webdriver.WebElement.prototype.sendKeys = function() {
  var a = webdriver.promise.fullyResolved(goog.array.slice(arguments, 0)).then(function(a) {
    return goog.array.map(goog.array.slice(a, 0), function(a) {
      return a + ""
    })
  });
  return this.schedule_((new webdriver.Command(webdriver.CommandName.SEND_KEYS_TO_ELEMENT)).setParameter("value", a), "WebElement.sendKeys(" + a + ")")
};
goog.exportSymbol("webdriver.WebElement.prototype.sendKeys", webdriver.WebElement.prototype.sendKeys);
webdriver.WebElement.prototype.getTagName = function() {
  return this.schedule_(new webdriver.Command(webdriver.CommandName.GET_ELEMENT_TAG_NAME), "WebElement.getTagName()")
};
goog.exportSymbol("webdriver.WebElement.prototype.getTagName", webdriver.WebElement.prototype.getTagName);
webdriver.WebElement.prototype.getCssValue = function(a) {
  return this.schedule_((new webdriver.Command(webdriver.CommandName.GET_ELEMENT_VALUE_OF_CSS_PROPERTY)).setParameter("name", a), "WebElement.getCssValue(" + a + ")")
};
goog.exportSymbol("webdriver.WebElement.prototype.getCssValue", webdriver.WebElement.prototype.getCssValue);
webdriver.WebElement.prototype.getAttribute = function(a) {
  return this.schedule_((new webdriver.Command(webdriver.CommandName.GET_ELEMENT_ATTRIBUTE)).setParameter("name", a), "WebElement.getAttribute(" + a + ")")
};
goog.exportSymbol("webdriver.WebElement.prototype.getAttribute", webdriver.WebElement.prototype.getAttribute);
webdriver.WebElement.prototype.getText = function() {
  return this.schedule_(new webdriver.Command(webdriver.CommandName.GET_ELEMENT_TEXT), "WebElement.getText()")
};
goog.exportSymbol("webdriver.WebElement.prototype.getText", webdriver.WebElement.prototype.getText);
webdriver.WebElement.prototype.getSize = function() {
  return this.schedule_(new webdriver.Command(webdriver.CommandName.GET_ELEMENT_SIZE), "WebElement.getSize()")
};
goog.exportSymbol("webdriver.WebElement.prototype.getSize", webdriver.WebElement.prototype.getSize);
webdriver.WebElement.prototype.getLocation = function() {
  return this.schedule_(new webdriver.Command(webdriver.CommandName.GET_ELEMENT_LOCATION), "WebElement.getLocation()")
};
goog.exportSymbol("webdriver.WebElement.prototype.getLocation", webdriver.WebElement.prototype.getLocation);
webdriver.WebElement.prototype.isEnabled = function() {
  return this.schedule_(new webdriver.Command(webdriver.CommandName.IS_ELEMENT_ENABLED), "WebElement.isEnabled()")
};
goog.exportSymbol("webdriver.WebElement.prototype.isEnabled", webdriver.WebElement.prototype.isEnabled);
webdriver.WebElement.prototype.isSelected = function() {
  return this.schedule_(new webdriver.Command(webdriver.CommandName.IS_ELEMENT_SELECTED), "WebElement.isSelected()")
};
goog.exportSymbol("webdriver.WebElement.prototype.isSelected", webdriver.WebElement.prototype.isSelected);
webdriver.WebElement.prototype.submit = function() {
  return this.schedule_(new webdriver.Command(webdriver.CommandName.SUBMIT_ELEMENT), "WebElement.submit()")
};
goog.exportSymbol("webdriver.WebElement.prototype.submit", webdriver.WebElement.prototype.submit);
webdriver.WebElement.prototype.clear = function() {
  return this.schedule_(new webdriver.Command(webdriver.CommandName.CLEAR_ELEMENT), "WebElement.clear()")
};
goog.exportSymbol("webdriver.WebElement.prototype.clear", webdriver.WebElement.prototype.clear);
webdriver.WebElement.prototype.isDisplayed = function() {
  return this.schedule_(new webdriver.Command(webdriver.CommandName.IS_ELEMENT_DISPLAYED), "WebElement.isDisplayed()")
};
goog.exportSymbol("webdriver.WebElement.prototype.isDisplayed", webdriver.WebElement.prototype.isDisplayed);
webdriver.WebElement.prototype.getOuterHtml = function() {
  return this.driver_.executeScript(function(a) {
    if("outerHTML" in a) {
      return a.outerHTML
    }else {
      var b = a.ownerDocument.createElement("div");
      b.appendChild(a.cloneNode(!0));
      return b.innerHTML
    }
  }, this)
};
goog.exportSymbol("webdriver.WebElement.prototype.getOuterHtml", webdriver.WebElement.prototype.getOuterHtml);
webdriver.WebElement.prototype.getInnerHtml = function() {
  return this.driver_.executeScript("return arguments[0].innerHTML", this)
};
goog.exportSymbol("webdriver.WebElement.prototype.getInnerHtml", webdriver.WebElement.prototype.getInnerHtml);
webdriver.http = {};
webdriver.http.Client = function() {
};
webdriver.http.Client.prototype.send = function() {
};
webdriver.http.Executor = function(a) {
  this.client_ = a
};
webdriver.http.Executor.prototype.execute = function(a, b) {
  var c = webdriver.http.Executor.COMMAND_MAP_[a.getName()];
  if(!c) {
    throw Error("Unrecognized command: " + a.getName());
  }
  var d = a.getParameters(), e = webdriver.http.Executor.buildPath_(c.path, d);
  this.client_.send(new webdriver.http.Request(c.method, e, d), function(a, c) {
    var d;
    if(!a) {
      try {
        d = webdriver.http.Executor.parseHttpResponse_(c)
      }catch(e) {
        a = e
      }
    }
    b(a, d)
  })
};
webdriver.http.Executor.buildPath_ = function(a, b) {
  var c = a.match(/:(\w+)\b/g);
  if(c) {
    for(var d = 0;d < c.length;++d) {
      var e = c[d].substring(1);
      if(e in b) {
        var f = b[e];
        f && f[webdriver.WebElement.ELEMENT_KEY] && (f = f[webdriver.WebElement.ELEMENT_KEY]);
        a = a.replace(c[d], f);
        delete b[e]
      }else {
        throw Error("Missing required parameter: " + e);
      }
    }
  }
  return a
};
webdriver.http.Executor.parseHttpResponse_ = function(a) {
  try {
    return goog.json.parse(a.body)
  }catch(b) {
  }
  var c = {status:bot.ErrorCode.SUCCESS, value:a.body.replace(/\r\n/g, "\n")};
  a.status > 199 && a.status < 300 || (c.status = a.status == 404 ? bot.ErrorCode.UNKNOWN_COMMAND : bot.ErrorCode.UNKNOWN_ERROR);
  return c
};
webdriver.http.Executor.COMMAND_MAP_ = function() {
  function a(a) {
    return c("POST", a)
  }
  function b(a) {
    return c("GET", a)
  }
  function c(a, b) {
    return{method:a, path:b}
  }
  return(new function() {
    var a = {};
    this.put = function(b, c) {
      a[b] = c;
      return this
    };
    this.build = function() {
      return a
    }
  }).put(webdriver.CommandName.NEW_SESSION, a("/session")).put(webdriver.CommandName.DESCRIBE_SESSION, b("/session/:sessionId")).put(webdriver.CommandName.QUIT, c("DELETE", "/session/:sessionId")).put(webdriver.CommandName.CLOSE, c("DELETE", "/session/:sessionId/window")).put(webdriver.CommandName.GET_CURRENT_WINDOW_HANDLE, b("/session/:sessionId/window_handle")).put(webdriver.CommandName.GET_WINDOW_HANDLES, b("/session/:sessionId/window_handles")).put(webdriver.CommandName.GET_CURRENT_URL, b("/session/:sessionId/url")).put(webdriver.CommandName.GET, 
  a("/session/:sessionId/url")).put(webdriver.CommandName.GO_BACK, a("/session/:sessionId/back")).put(webdriver.CommandName.GO_FORWARD, a("/session/:sessionId/forward")).put(webdriver.CommandName.REFRESH, a("/session/:sessionId/refresh")).put(webdriver.CommandName.ADD_COOKIE, a("/session/:sessionId/cookie")).put(webdriver.CommandName.GET_ALL_COOKIES, b("/session/:sessionId/cookie")).put(webdriver.CommandName.DELETE_ALL_COOKIES, c("DELETE", "/session/:sessionId/cookie")).put(webdriver.CommandName.DELETE_COOKIE, 
  c("DELETE", "/session/:sessionId/cookie/:name")).put(webdriver.CommandName.FIND_ELEMENT, a("/session/:sessionId/element")).put(webdriver.CommandName.FIND_ELEMENTS, a("/session/:sessionId/elements")).put(webdriver.CommandName.GET_ACTIVE_ELEMENT, a("/session/:sessionId/element/active")).put(webdriver.CommandName.FIND_CHILD_ELEMENT, a("/session/:sessionId/element/:id/element")).put(webdriver.CommandName.FIND_CHILD_ELEMENTS, a("/session/:sessionId/element/:id/elements")).put(webdriver.CommandName.CLEAR_ELEMENT, 
  a("/session/:sessionId/element/:id/clear")).put(webdriver.CommandName.CLICK_ELEMENT, a("/session/:sessionId/element/:id/click")).put(webdriver.CommandName.SEND_KEYS_TO_ELEMENT, a("/session/:sessionId/element/:id/value")).put(webdriver.CommandName.SUBMIT_ELEMENT, a("/session/:sessionId/element/:id/submit")).put(webdriver.CommandName.GET_ELEMENT_TEXT, b("/session/:sessionId/element/:id/text")).put(webdriver.CommandName.GET_ELEMENT_TAG_NAME, b("/session/:sessionId/element/:id/name")).put(webdriver.CommandName.IS_ELEMENT_SELECTED, 
  b("/session/:sessionId/element/:id/selected")).put(webdriver.CommandName.IS_ELEMENT_ENABLED, b("/session/:sessionId/element/:id/enabled")).put(webdriver.CommandName.IS_ELEMENT_DISPLAYED, b("/session/:sessionId/element/:id/displayed")).put(webdriver.CommandName.GET_ELEMENT_LOCATION, b("/session/:sessionId/element/:id/location")).put(webdriver.CommandName.GET_ELEMENT_SIZE, b("/session/:sessionId/element/:id/size")).put(webdriver.CommandName.GET_ELEMENT_ATTRIBUTE, b("/session/:sessionId/element/:id/attribute/:name")).put(webdriver.CommandName.GET_ELEMENT_VALUE_OF_CSS_PROPERTY, 
  b("/session/:sessionId/element/:id/css/:name")).put(webdriver.CommandName.ELEMENT_EQUALS, b("/session/:sessionId/element/:id/equals/:other")).put(webdriver.CommandName.SWITCH_TO_WINDOW, a("/session/:sessionId/window")).put(webdriver.CommandName.SWITCH_TO_FRAME, a("/session/:sessionId/frame")).put(webdriver.CommandName.GET_PAGE_SOURCE, b("/session/:sessionId/source")).put(webdriver.CommandName.GET_TITLE, b("/session/:sessionId/title")).put(webdriver.CommandName.EXECUTE_SCRIPT, a("/session/:sessionId/execute")).put(webdriver.CommandName.EXECUTE_ASYNC_SCRIPT, 
  a("/session/:sessionId/execute_async")).put(webdriver.CommandName.SCREENSHOT, b("/session/:sessionId/screenshot")).put(webdriver.CommandName.SET_SCRIPT_TIMEOUT, a("/session/:sessionId/timeouts/async_script")).put(webdriver.CommandName.IMPLICITLY_WAIT, a("/session/:sessionId/timeouts/implicit_wait")).build()
}();
webdriver.http.Request = function(a, b, c) {
  this.method = a;
  this.path = b;
  this.data = c || "";
  this.headers = {Accept:"application/json; charset=utf-8"}
};
webdriver.http.Request.prototype.toString = function() {
  var a = [this.method + " " + this.path], b;
  for(b in this.headers) {
    a.push(b + ": " + this.headers[b])
  }
  a.push("");
  a.push(this.data);
  return a.join("\n")
};
webdriver.http.Response = function(a, b, c) {
  this.status = a;
  this.body = c;
  this.headers = {};
  for(var d in b) {
    this.headers[d.toLowerCase()] = b[d]
  }
};
webdriver.http.Response.fromXmlHttpRequest = function(a) {
  var b = a.getAllResponseHeaders().replace(/\r\n/g, "\n").split("\n"), c = {};
  goog.array.forEach(b, function(a) {
    a = a.split(/\s*:\s*/, 2);
    a[0] && (c[a[0]] = a[1] || "")
  });
  return new webdriver.http.Response(a.status, c, a.responseText.replace(/\0/g, ""))
};
webdriver.http.Response.prototype.toString = function() {
  var a = ["HTTP/1.1 " + this.status], b;
  for(b in this.headers) {
    a.push(b + ": " + this.headers[b])
  }
  a.push("");
  a.push(this.body);
  return a.join("\n")
};
webdriver.http.XhrClient = function(a) {
  this.url_ = a
};
webdriver.http.XhrClient.isCorsAvailable = function() {
  return typeof XMLHttpRequest != "undefined" && goog.isBoolean((new XMLHttpRequest).withCredentials)
};
webdriver.http.XhrClient.prototype.send = function(a, b) {
  try {
    var c = new XMLHttpRequest, d = this.url_ + a.path;
    c.open(a.method, d, !0);
    c.onload = function() {
      b(null, webdriver.http.Response.fromXmlHttpRequest(c))
    };
    c.onerror = function() {
      var c = window.location, c = [c.protocol, "//", c.hostname, c.port ? ":" + c.port : ""].join(""), c = ["Unable to send request: ", a.method, " ", d, "\nWas this a cross-domain request? The current domain is ", c];
      webdriver.http.XhrClient.isCorsAvailable() ? c.push("\nThe current browser appears to support cross-domain XHR.", "\nPerhaps the server did not respond to the preflight request ", "with valid access control headers?") : c.push("The current browser does not appear to support cross-domain XHR.");
      c.push("\n", a);
      b(Error(c.join("")))
    };
    for(var e in a.headers) {
      c.setRequestHeader(e, a.headers[e])
    }
    c.send(goog.json.serialize(a.data))
  }catch(f) {
    b(f)
  }
};
goog.userAgent = {};
goog.userAgent.ASSUME_IE = !1;
goog.userAgent.ASSUME_GECKO = !1;
goog.userAgent.ASSUME_WEBKIT = !1;
goog.userAgent.ASSUME_MOBILE_WEBKIT = !1;
goog.userAgent.ASSUME_OPERA = !1;
goog.userAgent.BROWSER_KNOWN_ = goog.userAgent.ASSUME_IE || goog.userAgent.ASSUME_GECKO || goog.userAgent.ASSUME_MOBILE_WEBKIT || goog.userAgent.ASSUME_WEBKIT || goog.userAgent.ASSUME_OPERA;
goog.userAgent.getUserAgentString = function() {
  return goog.global.navigator ? goog.global.navigator.userAgent : null
};
goog.userAgent.getNavigator = function() {
  return goog.global.navigator
};
goog.userAgent.init_ = function() {
  goog.userAgent.detectedOpera_ = !1;
  goog.userAgent.detectedIe_ = !1;
  goog.userAgent.detectedWebkit_ = !1;
  goog.userAgent.detectedMobile_ = !1;
  goog.userAgent.detectedGecko_ = !1;
  var a;
  if(!goog.userAgent.BROWSER_KNOWN_ && (a = goog.userAgent.getUserAgentString())) {
    var b = goog.userAgent.getNavigator();
    goog.userAgent.detectedOpera_ = a.indexOf("Opera") == 0;
    goog.userAgent.detectedIe_ = !goog.userAgent.detectedOpera_ && a.indexOf("MSIE") != -1;
    goog.userAgent.detectedWebkit_ = !goog.userAgent.detectedOpera_ && a.indexOf("WebKit") != -1;
    goog.userAgent.detectedMobile_ = goog.userAgent.detectedWebkit_ && a.indexOf("Mobile") != -1;
    goog.userAgent.detectedGecko_ = !goog.userAgent.detectedOpera_ && !goog.userAgent.detectedWebkit_ && b.product == "Gecko"
  }
};
goog.userAgent.BROWSER_KNOWN_ || goog.userAgent.init_();
goog.userAgent.OPERA = goog.userAgent.BROWSER_KNOWN_ ? goog.userAgent.ASSUME_OPERA : goog.userAgent.detectedOpera_;
goog.userAgent.IE = goog.userAgent.BROWSER_KNOWN_ ? goog.userAgent.ASSUME_IE : goog.userAgent.detectedIe_;
goog.userAgent.GECKO = goog.userAgent.BROWSER_KNOWN_ ? goog.userAgent.ASSUME_GECKO : goog.userAgent.detectedGecko_;
goog.userAgent.WEBKIT = goog.userAgent.BROWSER_KNOWN_ ? goog.userAgent.ASSUME_WEBKIT || goog.userAgent.ASSUME_MOBILE_WEBKIT : goog.userAgent.detectedWebkit_;
goog.userAgent.MOBILE = goog.userAgent.ASSUME_MOBILE_WEBKIT || goog.userAgent.detectedMobile_;
goog.userAgent.SAFARI = goog.userAgent.WEBKIT;
goog.userAgent.determinePlatform_ = function() {
  var a = goog.userAgent.getNavigator();
  return a && a.platform || ""
};
goog.userAgent.PLATFORM = goog.userAgent.determinePlatform_();
goog.userAgent.ASSUME_MAC = !1;
goog.userAgent.ASSUME_WINDOWS = !1;
goog.userAgent.ASSUME_LINUX = !1;
goog.userAgent.ASSUME_X11 = !1;
goog.userAgent.PLATFORM_KNOWN_ = goog.userAgent.ASSUME_MAC || goog.userAgent.ASSUME_WINDOWS || goog.userAgent.ASSUME_LINUX || goog.userAgent.ASSUME_X11;
goog.userAgent.initPlatform_ = function() {
  goog.userAgent.detectedMac_ = goog.string.contains(goog.userAgent.PLATFORM, "Mac");
  goog.userAgent.detectedWindows_ = goog.string.contains(goog.userAgent.PLATFORM, "Win");
  goog.userAgent.detectedLinux_ = goog.string.contains(goog.userAgent.PLATFORM, "Linux");
  goog.userAgent.detectedX11_ = !!goog.userAgent.getNavigator() && goog.string.contains(goog.userAgent.getNavigator().appVersion || "", "X11")
};
goog.userAgent.PLATFORM_KNOWN_ || goog.userAgent.initPlatform_();
goog.userAgent.MAC = goog.userAgent.PLATFORM_KNOWN_ ? goog.userAgent.ASSUME_MAC : goog.userAgent.detectedMac_;
goog.userAgent.WINDOWS = goog.userAgent.PLATFORM_KNOWN_ ? goog.userAgent.ASSUME_WINDOWS : goog.userAgent.detectedWindows_;
goog.userAgent.LINUX = goog.userAgent.PLATFORM_KNOWN_ ? goog.userAgent.ASSUME_LINUX : goog.userAgent.detectedLinux_;
goog.userAgent.X11 = goog.userAgent.PLATFORM_KNOWN_ ? goog.userAgent.ASSUME_X11 : goog.userAgent.detectedX11_;
goog.userAgent.determineVersion_ = function() {
  var a = "", b;
  goog.userAgent.OPERA && goog.global.opera ? (a = goog.global.opera.version, a = typeof a == "function" ? a() : a) : (goog.userAgent.GECKO ? b = /rv\:([^\);]+)(\)|;)/ : goog.userAgent.IE ? b = /MSIE\s+([^\);]+)(\)|;)/ : goog.userAgent.WEBKIT && (b = /WebKit\/(\S+)/), b && (a = (a = b.exec(goog.userAgent.getUserAgentString())) ? a[1] : ""));
  if(goog.userAgent.IE && (b = goog.userAgent.getDocumentMode_(), b > parseFloat(a))) {
    return String(b)
  }
  return a
};
goog.userAgent.getDocumentMode_ = function() {
  var a = goog.global.document;
  return a ? a.documentMode : void 0
};
goog.userAgent.VERSION = goog.userAgent.determineVersion_();
goog.userAgent.compare = function(a, b) {
  return goog.string.compareVersions(a, b)
};
goog.userAgent.isVersionCache_ = {};
goog.userAgent.isVersion = function(a) {
  return goog.userAgent.isVersionCache_[a] || (goog.userAgent.isVersionCache_[a] = goog.string.compareVersions(goog.userAgent.VERSION, a) >= 0)
};
goog.userAgent.isDocumentModeCache_ = {};
goog.userAgent.isDocumentMode = function(a) {
  return goog.userAgent.isDocumentModeCache_[a] || (goog.userAgent.isDocumentModeCache_[a] = goog.userAgent.IE && document.documentMode && document.documentMode >= a)
};
goog.dom = {};
goog.dom.BrowserFeature = {CAN_ADD_NAME_OR_TYPE_ATTRIBUTES:!goog.userAgent.IE || goog.userAgent.isVersion("9"), CAN_USE_CHILDREN_ATTRIBUTE:!goog.userAgent.GECKO && !goog.userAgent.IE || goog.userAgent.IE && goog.userAgent.isVersion("9") || goog.userAgent.GECKO && goog.userAgent.isVersion("1.9.1"), CAN_USE_INNER_TEXT:goog.userAgent.IE && !goog.userAgent.isVersion("9"), INNER_HTML_NEEDS_SCOPED_ELEMENT:goog.userAgent.IE};
goog.dom.TagName = {A:"A", ABBR:"ABBR", ACRONYM:"ACRONYM", ADDRESS:"ADDRESS", APPLET:"APPLET", AREA:"AREA", B:"B", BASE:"BASE", BASEFONT:"BASEFONT", BDO:"BDO", BIG:"BIG", BLOCKQUOTE:"BLOCKQUOTE", BODY:"BODY", BR:"BR", BUTTON:"BUTTON", CANVAS:"CANVAS", CAPTION:"CAPTION", CENTER:"CENTER", CITE:"CITE", CODE:"CODE", COL:"COL", COLGROUP:"COLGROUP", DD:"DD", DEL:"DEL", DFN:"DFN", DIR:"DIR", DIV:"DIV", DL:"DL", DT:"DT", EM:"EM", FIELDSET:"FIELDSET", FONT:"FONT", FORM:"FORM", FRAME:"FRAME", FRAMESET:"FRAMESET", 
H1:"H1", H2:"H2", H3:"H3", H4:"H4", H5:"H5", H6:"H6", HEAD:"HEAD", HR:"HR", HTML:"HTML", I:"I", IFRAME:"IFRAME", IMG:"IMG", INPUT:"INPUT", INS:"INS", ISINDEX:"ISINDEX", KBD:"KBD", LABEL:"LABEL", LEGEND:"LEGEND", LI:"LI", LINK:"LINK", MAP:"MAP", MENU:"MENU", META:"META", NOFRAMES:"NOFRAMES", NOSCRIPT:"NOSCRIPT", OBJECT:"OBJECT", OL:"OL", OPTGROUP:"OPTGROUP", OPTION:"OPTION", P:"P", PARAM:"PARAM", PRE:"PRE", Q:"Q", S:"S", SAMP:"SAMP", SCRIPT:"SCRIPT", SELECT:"SELECT", SMALL:"SMALL", SPAN:"SPAN", STRIKE:"STRIKE", 
STRONG:"STRONG", STYLE:"STYLE", SUB:"SUB", SUP:"SUP", TABLE:"TABLE", TBODY:"TBODY", TD:"TD", TEXTAREA:"TEXTAREA", TFOOT:"TFOOT", TH:"TH", THEAD:"THEAD", TITLE:"TITLE", TR:"TR", TT:"TT", U:"U", UL:"UL", VAR:"VAR"};
goog.dom.classes = {};
goog.dom.classes.set = function(a, b) {
  a.className = b
};
goog.dom.classes.get = function(a) {
  return(a = a.className) && typeof a.split == "function" ? a.split(/\s+/) : []
};
goog.dom.classes.add = function(a) {
  var b = goog.dom.classes.get(a), c = goog.array.slice(arguments, 1), c = goog.dom.classes.add_(b, c);
  a.className = b.join(" ");
  return c
};
goog.dom.classes.remove = function(a) {
  var b = goog.dom.classes.get(a), c = goog.array.slice(arguments, 1), c = goog.dom.classes.remove_(b, c);
  a.className = b.join(" ");
  return c
};
goog.dom.classes.add_ = function(a, b) {
  for(var c = 0, d = 0;d < b.length;d++) {
    goog.array.contains(a, b[d]) || (a.push(b[d]), c++)
  }
  return c == b.length
};
goog.dom.classes.remove_ = function(a, b) {
  for(var c = 0, d = 0;d < a.length;d++) {
    goog.array.contains(b, a[d]) && (goog.array.splice(a, d--, 1), c++)
  }
  return c == b.length
};
goog.dom.classes.swap = function(a, b, c) {
  for(var d = goog.dom.classes.get(a), e = !1, f = 0;f < d.length;f++) {
    d[f] == b && (goog.array.splice(d, f--, 1), e = !0)
  }
  if(e) {
    d.push(c), a.className = d.join(" ")
  }
  return e
};
goog.dom.classes.addRemove = function(a, b, c) {
  var d = goog.dom.classes.get(a);
  goog.isString(b) ? goog.array.remove(d, b) : goog.isArray(b) && goog.dom.classes.remove_(d, b);
  goog.isString(c) && !goog.array.contains(d, c) ? d.push(c) : goog.isArray(c) && goog.dom.classes.add_(d, c);
  a.className = d.join(" ")
};
goog.dom.classes.has = function(a, b) {
  return goog.array.contains(goog.dom.classes.get(a), b)
};
goog.dom.classes.enable = function(a, b, c) {
  c ? goog.dom.classes.add(a, b) : goog.dom.classes.remove(a, b)
};
goog.dom.classes.toggle = function(a, b) {
  var c = !goog.dom.classes.has(a, b);
  goog.dom.classes.enable(a, b, c);
  return c
};
goog.math = {};
goog.math.Coordinate = function(a, b) {
  this.x = goog.isDef(a) ? a : 0;
  this.y = goog.isDef(b) ? b : 0
};
goog.math.Coordinate.prototype.clone = function() {
  return new goog.math.Coordinate(this.x, this.y)
};
if(goog.DEBUG) {
  goog.math.Coordinate.prototype.toString = function() {
    return"(" + this.x + ", " + this.y + ")"
  }
}
goog.math.Coordinate.equals = function(a, b) {
  if(a == b) {
    return!0
  }
  if(!a || !b) {
    return!1
  }
  return a.x == b.x && a.y == b.y
};
goog.math.Coordinate.distance = function(a, b) {
  var c = a.x - b.x, d = a.y - b.y;
  return Math.sqrt(c * c + d * d)
};
goog.math.Coordinate.squaredDistance = function(a, b) {
  var c = a.x - b.x, d = a.y - b.y;
  return c * c + d * d
};
goog.math.Coordinate.difference = function(a, b) {
  return new goog.math.Coordinate(a.x - b.x, a.y - b.y)
};
goog.math.Coordinate.sum = function(a, b) {
  return new goog.math.Coordinate(a.x + b.x, a.y + b.y)
};
goog.math.Size = function(a, b) {
  this.width = a;
  this.height = b
};
goog.math.Size.equals = function(a, b) {
  if(a == b) {
    return!0
  }
  if(!a || !b) {
    return!1
  }
  return a.width == b.width && a.height == b.height
};
goog.math.Size.prototype.clone = function() {
  return new goog.math.Size(this.width, this.height)
};
if(goog.DEBUG) {
  goog.math.Size.prototype.toString = function() {
    return"(" + this.width + " x " + this.height + ")"
  }
}
goog.math.Size.prototype.getLongest = function() {
  return Math.max(this.width, this.height)
};
goog.math.Size.prototype.getShortest = function() {
  return Math.min(this.width, this.height)
};
goog.math.Size.prototype.area = function() {
  return this.width * this.height
};
goog.math.Size.prototype.perimeter = function() {
  return(this.width + this.height) * 2
};
goog.math.Size.prototype.aspectRatio = function() {
  return this.width / this.height
};
goog.math.Size.prototype.isEmpty = function() {
  return!this.area()
};
goog.math.Size.prototype.ceil = function() {
  this.width = Math.ceil(this.width);
  this.height = Math.ceil(this.height);
  return this
};
goog.math.Size.prototype.fitsInside = function(a) {
  return this.width <= a.width && this.height <= a.height
};
goog.math.Size.prototype.floor = function() {
  this.width = Math.floor(this.width);
  this.height = Math.floor(this.height);
  return this
};
goog.math.Size.prototype.round = function() {
  this.width = Math.round(this.width);
  this.height = Math.round(this.height);
  return this
};
goog.math.Size.prototype.scale = function(a) {
  this.width *= a;
  this.height *= a;
  return this
};
goog.math.Size.prototype.scaleToFit = function(a) {
  return this.scale(this.aspectRatio() > a.aspectRatio() ? a.width / this.width : a.height / this.height)
};
goog.dom.ASSUME_QUIRKS_MODE = !1;
goog.dom.ASSUME_STANDARDS_MODE = !1;
goog.dom.COMPAT_MODE_KNOWN_ = goog.dom.ASSUME_QUIRKS_MODE || goog.dom.ASSUME_STANDARDS_MODE;
goog.dom.NodeType = {ELEMENT:1, ATTRIBUTE:2, TEXT:3, CDATA_SECTION:4, ENTITY_REFERENCE:5, ENTITY:6, PROCESSING_INSTRUCTION:7, COMMENT:8, DOCUMENT:9, DOCUMENT_TYPE:10, DOCUMENT_FRAGMENT:11, NOTATION:12};
goog.dom.getDomHelper = function(a) {
  return a ? new goog.dom.DomHelper(goog.dom.getOwnerDocument(a)) : goog.dom.defaultDomHelper_ || (goog.dom.defaultDomHelper_ = new goog.dom.DomHelper)
};
goog.dom.getDocument = function() {
  return document
};
goog.dom.getElement = function(a) {
  return goog.isString(a) ? document.getElementById(a) : a
};
goog.dom.$ = goog.dom.getElement;
goog.dom.getElementsByTagNameAndClass = function(a, b, c) {
  return goog.dom.getElementsByTagNameAndClass_(document, a, b, c)
};
goog.dom.getElementsByClass = function(a, b) {
  var c = b || document;
  if(goog.dom.canUseQuerySelector_(c)) {
    return c.querySelectorAll("." + a)
  }else {
    if(c.getElementsByClassName) {
      return c.getElementsByClassName(a)
    }
  }
  return goog.dom.getElementsByTagNameAndClass_(document, "*", a, b)
};
goog.dom.getElementByClass = function(a, b) {
  var c = b || document, d = null;
  return(d = goog.dom.canUseQuerySelector_(c) ? c.querySelector("." + a) : goog.dom.getElementsByClass(a, b)[0]) || null
};
goog.dom.canUseQuerySelector_ = function(a) {
  return a.querySelectorAll && a.querySelector && (!goog.userAgent.WEBKIT || goog.dom.isCss1CompatMode_(document) || goog.userAgent.isVersion("528"))
};
goog.dom.getElementsByTagNameAndClass_ = function(a, b, c, d) {
  a = d || a;
  b = b && b != "*" ? b.toUpperCase() : "";
  if(goog.dom.canUseQuerySelector_(a) && (b || c)) {
    return a.querySelectorAll(b + (c ? "." + c : ""))
  }
  if(c && a.getElementsByClassName) {
    if(a = a.getElementsByClassName(c), b) {
      for(var d = {}, e = 0, f = 0, g;g = a[f];f++) {
        b == g.nodeName && (d[e++] = g)
      }
      d.length = e;
      return d
    }else {
      return a
    }
  }
  a = a.getElementsByTagName(b || "*");
  if(c) {
    d = {};
    for(f = e = 0;g = a[f];f++) {
      b = g.className, typeof b.split == "function" && goog.array.contains(b.split(/\s+/), c) && (d[e++] = g)
    }
    d.length = e;
    return d
  }else {
    return a
  }
};
goog.dom.$$ = goog.dom.getElementsByTagNameAndClass;
goog.dom.setProperties = function(a, b) {
  goog.object.forEach(b, function(b, d) {
    d == "style" ? a.style.cssText = b : d == "class" ? a.className = b : d == "for" ? a.htmlFor = b : d in goog.dom.DIRECT_ATTRIBUTE_MAP_ ? a.setAttribute(goog.dom.DIRECT_ATTRIBUTE_MAP_[d], b) : a[d] = b
  })
};
goog.dom.DIRECT_ATTRIBUTE_MAP_ = {cellpadding:"cellPadding", cellspacing:"cellSpacing", colspan:"colSpan", rowspan:"rowSpan", valign:"vAlign", height:"height", width:"width", usemap:"useMap", frameborder:"frameBorder", maxlength:"maxLength", type:"type"};
goog.dom.getViewportSize = function(a) {
  return goog.dom.getViewportSize_(a || window)
};
goog.dom.getViewportSize_ = function(a) {
  var b = a.document;
  if(goog.userAgent.WEBKIT && !goog.userAgent.isVersion("500") && !goog.userAgent.MOBILE) {
    typeof a.innerHeight == "undefined" && (a = window);
    var b = a.innerHeight, c = a.document.documentElement.scrollHeight;
    a == a.top && c < b && (b -= 15);
    return new goog.math.Size(a.innerWidth, b)
  }
  a = goog.dom.isCss1CompatMode_(b) ? b.documentElement : b.body;
  return new goog.math.Size(a.clientWidth, a.clientHeight)
};
goog.dom.getDocumentHeight = function() {
  return goog.dom.getDocumentHeight_(window)
};
goog.dom.getDocumentHeight_ = function(a) {
  var b = a.document, c = 0;
  if(b) {
    var a = goog.dom.getViewportSize_(a).height, c = b.body, d = b.documentElement;
    if(goog.dom.isCss1CompatMode_(b) && d.scrollHeight) {
      c = d.scrollHeight != a ? d.scrollHeight : d.offsetHeight
    }else {
      var b = d.scrollHeight, e = d.offsetHeight;
      if(d.clientHeight != e) {
        b = c.scrollHeight, e = c.offsetHeight
      }
      c = b > a ? b > e ? b : e : b < e ? b : e
    }
  }
  return c
};
goog.dom.getPageScroll = function(a) {
  return goog.dom.getDomHelper((a || goog.global || window).document).getDocumentScroll()
};
goog.dom.getDocumentScroll = function() {
  return goog.dom.getDocumentScroll_(document)
};
goog.dom.getDocumentScroll_ = function(a) {
  var b = goog.dom.getDocumentScrollElement_(a), a = goog.dom.getWindow_(a);
  return new goog.math.Coordinate(a.pageXOffset || b.scrollLeft, a.pageYOffset || b.scrollTop)
};
goog.dom.getDocumentScrollElement = function() {
  return goog.dom.getDocumentScrollElement_(document)
};
goog.dom.getDocumentScrollElement_ = function(a) {
  return!goog.userAgent.WEBKIT && goog.dom.isCss1CompatMode_(a) ? a.documentElement : a.body
};
goog.dom.getWindow = function(a) {
  return a ? goog.dom.getWindow_(a) : window
};
goog.dom.getWindow_ = function(a) {
  return a.parentWindow || a.defaultView
};
goog.dom.createDom = function() {
  return goog.dom.createDom_(document, arguments)
};
goog.dom.createDom_ = function(a, b) {
  var c = b[0], d = b[1];
  if(!goog.dom.BrowserFeature.CAN_ADD_NAME_OR_TYPE_ATTRIBUTES && d && (d.name || d.type)) {
    c = ["<", c];
    d.name && c.push(' name="', goog.string.htmlEscape(d.name), '"');
    if(d.type) {
      c.push(' type="', goog.string.htmlEscape(d.type), '"');
      var e = {};
      goog.object.extend(e, d);
      d = e;
      delete d.type
    }
    c.push(">");
    c = c.join("")
  }
  c = a.createElement(c);
  if(d) {
    goog.isString(d) ? c.className = d : goog.isArray(d) ? goog.dom.classes.add.apply(null, [c].concat(d)) : goog.dom.setProperties(c, d)
  }
  b.length > 2 && goog.dom.append_(a, c, b, 2);
  return c
};
goog.dom.append_ = function(a, b, c, d) {
  function e(c) {
    c && b.appendChild(goog.isString(c) ? a.createTextNode(c) : c)
  }
  for(;d < c.length;d++) {
    var f = c[d];
    goog.isArrayLike(f) && !goog.dom.isNodeLike(f) ? goog.array.forEach(goog.dom.isNodeList(f) ? goog.array.clone(f) : f, e) : e(f)
  }
};
goog.dom.$dom = goog.dom.createDom;
goog.dom.createElement = function(a) {
  return document.createElement(a)
};
goog.dom.createTextNode = function(a) {
  return document.createTextNode(a)
};
goog.dom.createTable = function(a, b, c) {
  return goog.dom.createTable_(document, a, b, !!c)
};
goog.dom.createTable_ = function(a, b, c, d) {
  for(var e = ["<tr>"], f = 0;f < c;f++) {
    e.push(d ? "<td>&nbsp;</td>" : "<td></td>")
  }
  e.push("</tr>");
  e = e.join("");
  c = ["<table>"];
  for(f = 0;f < b;f++) {
    c.push(e)
  }
  c.push("</table>");
  a = a.createElement(goog.dom.TagName.DIV);
  a.innerHTML = c.join("");
  return a.removeChild(a.firstChild)
};
goog.dom.htmlToDocumentFragment = function(a) {
  return goog.dom.htmlToDocumentFragment_(document, a)
};
goog.dom.htmlToDocumentFragment_ = function(a, b) {
  var c = a.createElement("div");
  goog.dom.BrowserFeature.INNER_HTML_NEEDS_SCOPED_ELEMENT ? (c.innerHTML = "<br>" + b, c.removeChild(c.firstChild)) : c.innerHTML = b;
  if(c.childNodes.length == 1) {
    return c.removeChild(c.firstChild)
  }else {
    for(var d = a.createDocumentFragment();c.firstChild;) {
      d.appendChild(c.firstChild)
    }
    return d
  }
};
goog.dom.getCompatMode = function() {
  return goog.dom.isCss1CompatMode() ? "CSS1Compat" : "BackCompat"
};
goog.dom.isCss1CompatMode = function() {
  return goog.dom.isCss1CompatMode_(document)
};
goog.dom.isCss1CompatMode_ = function(a) {
  if(goog.dom.COMPAT_MODE_KNOWN_) {
    return goog.dom.ASSUME_STANDARDS_MODE
  }
  return a.compatMode == "CSS1Compat"
};
goog.dom.canHaveChildren = function(a) {
  if(a.nodeType != goog.dom.NodeType.ELEMENT) {
    return!1
  }
  switch(a.tagName) {
    case goog.dom.TagName.APPLET:
    ;
    case goog.dom.TagName.AREA:
    ;
    case goog.dom.TagName.BASE:
    ;
    case goog.dom.TagName.BR:
    ;
    case goog.dom.TagName.COL:
    ;
    case goog.dom.TagName.FRAME:
    ;
    case goog.dom.TagName.HR:
    ;
    case goog.dom.TagName.IMG:
    ;
    case goog.dom.TagName.INPUT:
    ;
    case goog.dom.TagName.IFRAME:
    ;
    case goog.dom.TagName.ISINDEX:
    ;
    case goog.dom.TagName.LINK:
    ;
    case goog.dom.TagName.NOFRAMES:
    ;
    case goog.dom.TagName.NOSCRIPT:
    ;
    case goog.dom.TagName.META:
    ;
    case goog.dom.TagName.OBJECT:
    ;
    case goog.dom.TagName.PARAM:
    ;
    case goog.dom.TagName.SCRIPT:
    ;
    case goog.dom.TagName.STYLE:
      return!1
  }
  return!0
};
goog.dom.appendChild = function(a, b) {
  a.appendChild(b)
};
goog.dom.append = function(a) {
  goog.dom.append_(goog.dom.getOwnerDocument(a), a, arguments, 1)
};
goog.dom.removeChildren = function(a) {
  for(var b;b = a.firstChild;) {
    a.removeChild(b)
  }
};
goog.dom.insertSiblingBefore = function(a, b) {
  b.parentNode && b.parentNode.insertBefore(a, b)
};
goog.dom.insertSiblingAfter = function(a, b) {
  b.parentNode && b.parentNode.insertBefore(a, b.nextSibling)
};
goog.dom.insertChildAt = function(a, b, c) {
  a.insertBefore(b, a.childNodes[c] || null)
};
goog.dom.removeNode = function(a) {
  return a && a.parentNode ? a.parentNode.removeChild(a) : null
};
goog.dom.replaceNode = function(a, b) {
  var c = b.parentNode;
  c && c.replaceChild(a, b)
};
goog.dom.flattenElement = function(a) {
  var b, c = a.parentNode;
  if(c && c.nodeType != goog.dom.NodeType.DOCUMENT_FRAGMENT) {
    if(a.removeNode) {
      return a.removeNode(!1)
    }else {
      for(;b = a.firstChild;) {
        c.insertBefore(b, a)
      }
      return goog.dom.removeNode(a)
    }
  }
};
goog.dom.getChildren = function(a) {
  if(goog.dom.BrowserFeature.CAN_USE_CHILDREN_ATTRIBUTE && a.children != void 0) {
    return a.children
  }
  return goog.array.filter(a.childNodes, function(a) {
    return a.nodeType == goog.dom.NodeType.ELEMENT
  })
};
goog.dom.getFirstElementChild = function(a) {
  if(a.firstElementChild != void 0) {
    return a.firstElementChild
  }
  return goog.dom.getNextElementNode_(a.firstChild, !0)
};
goog.dom.getLastElementChild = function(a) {
  if(a.lastElementChild != void 0) {
    return a.lastElementChild
  }
  return goog.dom.getNextElementNode_(a.lastChild, !1)
};
goog.dom.getNextElementSibling = function(a) {
  if(a.nextElementSibling != void 0) {
    return a.nextElementSibling
  }
  return goog.dom.getNextElementNode_(a.nextSibling, !0)
};
goog.dom.getPreviousElementSibling = function(a) {
  if(a.previousElementSibling != void 0) {
    return a.previousElementSibling
  }
  return goog.dom.getNextElementNode_(a.previousSibling, !1)
};
goog.dom.getNextElementNode_ = function(a, b) {
  for(;a && a.nodeType != goog.dom.NodeType.ELEMENT;) {
    a = b ? a.nextSibling : a.previousSibling
  }
  return a
};
goog.dom.getNextNode = function(a) {
  if(!a) {
    return null
  }
  if(a.firstChild) {
    return a.firstChild
  }
  for(;a && !a.nextSibling;) {
    a = a.parentNode
  }
  return a ? a.nextSibling : null
};
goog.dom.getPreviousNode = function(a) {
  if(!a) {
    return null
  }
  if(!a.previousSibling) {
    return a.parentNode
  }
  for(a = a.previousSibling;a && a.lastChild;) {
    a = a.lastChild
  }
  return a
};
goog.dom.isNodeLike = function(a) {
  return goog.isObject(a) && a.nodeType > 0
};
goog.dom.isWindow = function(a) {
  return goog.isObject(a) && a.window == a
};
goog.dom.contains = function(a, b) {
  if(a.contains && b.nodeType == goog.dom.NodeType.ELEMENT) {
    return a == b || a.contains(b)
  }
  if(typeof a.compareDocumentPosition != "undefined") {
    return a == b || Boolean(a.compareDocumentPosition(b) & 16)
  }
  for(;b && a != b;) {
    b = b.parentNode
  }
  return b == a
};
goog.dom.compareNodeOrder = function(a, b) {
  if(a == b) {
    return 0
  }
  if(a.compareDocumentPosition) {
    return a.compareDocumentPosition(b) & 2 ? 1 : -1
  }
  if("sourceIndex" in a || a.parentNode && "sourceIndex" in a.parentNode) {
    var c = a.nodeType == goog.dom.NodeType.ELEMENT, d = b.nodeType == goog.dom.NodeType.ELEMENT;
    if(c && d) {
      return a.sourceIndex - b.sourceIndex
    }else {
      var e = a.parentNode, f = b.parentNode;
      if(e == f) {
        return goog.dom.compareSiblingOrder_(a, b)
      }
      if(!c && goog.dom.contains(e, b)) {
        return-1 * goog.dom.compareParentsDescendantNodeIe_(a, b)
      }
      if(!d && goog.dom.contains(f, a)) {
        return goog.dom.compareParentsDescendantNodeIe_(b, a)
      }
      return(c ? a.sourceIndex : e.sourceIndex) - (d ? b.sourceIndex : f.sourceIndex)
    }
  }
  d = goog.dom.getOwnerDocument(a);
  c = d.createRange();
  c.selectNode(a);
  c.collapse(!0);
  d = d.createRange();
  d.selectNode(b);
  d.collapse(!0);
  return c.compareBoundaryPoints(goog.global.Range.START_TO_END, d)
};
goog.dom.compareParentsDescendantNodeIe_ = function(a, b) {
  var c = a.parentNode;
  if(c == b) {
    return-1
  }
  for(var d = b;d.parentNode != c;) {
    d = d.parentNode
  }
  return goog.dom.compareSiblingOrder_(d, a)
};
goog.dom.compareSiblingOrder_ = function(a, b) {
  for(var c = b;c = c.previousSibling;) {
    if(c == a) {
      return-1
    }
  }
  return 1
};
goog.dom.findCommonAncestor = function() {
  var a, b = arguments.length;
  if(b) {
    if(b == 1) {
      return arguments[0]
    }
  }else {
    return null
  }
  var c = [], d = Infinity;
  for(a = 0;a < b;a++) {
    for(var e = [], f = arguments[a];f;) {
      e.unshift(f), f = f.parentNode
    }
    c.push(e);
    d = Math.min(d, e.length)
  }
  e = null;
  for(a = 0;a < d;a++) {
    for(var f = c[0][a], g = 1;g < b;g++) {
      if(f != c[g][a]) {
        return e
      }
    }
    e = f
  }
  return e
};
goog.dom.getOwnerDocument = function(a) {
  return a.nodeType == goog.dom.NodeType.DOCUMENT ? a : a.ownerDocument || a.document
};
goog.dom.getFrameContentDocument = function(a) {
  return goog.userAgent.WEBKIT ? a.document || a.contentWindow.document : a.contentDocument || a.contentWindow.document
};
goog.dom.getFrameContentWindow = function(a) {
  return a.contentWindow || goog.dom.getWindow_(goog.dom.getFrameContentDocument(a))
};
goog.dom.setTextContent = function(a, b) {
  if("textContent" in a) {
    a.textContent = b
  }else {
    if(a.firstChild && a.firstChild.nodeType == goog.dom.NodeType.TEXT) {
      for(;a.lastChild != a.firstChild;) {
        a.removeChild(a.lastChild)
      }
      a.firstChild.data = b
    }else {
      goog.dom.removeChildren(a);
      var c = goog.dom.getOwnerDocument(a);
      a.appendChild(c.createTextNode(b))
    }
  }
};
goog.dom.getOuterHtml = function(a) {
  if("outerHTML" in a) {
    return a.outerHTML
  }else {
    var b = goog.dom.getOwnerDocument(a).createElement("div");
    b.appendChild(a.cloneNode(!0));
    return b.innerHTML
  }
};
goog.dom.findNode = function(a, b) {
  var c = [];
  return goog.dom.findNodes_(a, b, c, !0) ? c[0] : void 0
};
goog.dom.findNodes = function(a, b) {
  var c = [];
  goog.dom.findNodes_(a, b, c, !1);
  return c
};
goog.dom.findNodes_ = function(a, b, c, d) {
  if(a != null) {
    for(var e = 0, f;f = a.childNodes[e];e++) {
      if(b(f) && (c.push(f), d)) {
        return!0
      }
      if(goog.dom.findNodes_(f, b, c, d)) {
        return!0
      }
    }
  }
  return!1
};
goog.dom.TAGS_TO_IGNORE_ = {SCRIPT:1, STYLE:1, HEAD:1, IFRAME:1, OBJECT:1};
goog.dom.PREDEFINED_TAG_VALUES_ = {IMG:" ", BR:"\n"};
goog.dom.isFocusableTabIndex = function(a) {
  var b = a.getAttributeNode("tabindex");
  if(b && b.specified) {
    return a = a.tabIndex, goog.isNumber(a) && a >= 0
  }
  return!1
};
goog.dom.setFocusableTabIndex = function(a, b) {
  b ? a.tabIndex = 0 : a.removeAttribute("tabIndex")
};
goog.dom.getTextContent = function(a) {
  if(goog.dom.BrowserFeature.CAN_USE_INNER_TEXT && "innerText" in a) {
    a = goog.string.canonicalizeNewlines(a.innerText)
  }else {
    var b = [];
    goog.dom.getTextContent_(a, b, !0);
    a = b.join("")
  }
  a = a.replace(/ \xAD /g, " ").replace(/\xAD/g, "");
  a = a.replace(/\u200B/g, "");
  goog.userAgent.IE || (a = a.replace(/ +/g, " "));
  a != " " && (a = a.replace(/^\s*/, ""));
  return a
};
goog.dom.getRawTextContent = function(a) {
  var b = [];
  goog.dom.getTextContent_(a, b, !1);
  return b.join("")
};
goog.dom.getTextContent_ = function(a, b, c) {
  if(!(a.nodeName in goog.dom.TAGS_TO_IGNORE_)) {
    if(a.nodeType == goog.dom.NodeType.TEXT) {
      c ? b.push(String(a.nodeValue).replace(/(\r\n|\r|\n)/g, "")) : b.push(a.nodeValue)
    }else {
      if(a.nodeName in goog.dom.PREDEFINED_TAG_VALUES_) {
        b.push(goog.dom.PREDEFINED_TAG_VALUES_[a.nodeName])
      }else {
        for(a = a.firstChild;a;) {
          goog.dom.getTextContent_(a, b, c), a = a.nextSibling
        }
      }
    }
  }
};
goog.dom.getNodeTextLength = function(a) {
  return goog.dom.getTextContent(a).length
};
goog.dom.getNodeTextOffset = function(a, b) {
  for(var c = b || goog.dom.getOwnerDocument(a).body, d = [];a && a != c;) {
    for(var e = a;e = e.previousSibling;) {
      d.unshift(goog.dom.getTextContent(e))
    }
    a = a.parentNode
  }
  return goog.string.trimLeft(d.join("")).replace(/ +/g, " ").length
};
goog.dom.getNodeAtOffset = function(a, b, c) {
  for(var a = [a], d = 0, e;a.length > 0 && d < b;) {
    if(e = a.pop(), !(e.nodeName in goog.dom.TAGS_TO_IGNORE_)) {
      if(e.nodeType == goog.dom.NodeType.TEXT) {
        var f = e.nodeValue.replace(/(\r\n|\r|\n)/g, "").replace(/ +/g, " ");
        d += f.length
      }else {
        if(e.nodeName in goog.dom.PREDEFINED_TAG_VALUES_) {
          d += goog.dom.PREDEFINED_TAG_VALUES_[e.nodeName].length
        }else {
          for(f = e.childNodes.length - 1;f >= 0;f--) {
            a.push(e.childNodes[f])
          }
        }
      }
    }
  }
  if(goog.isObject(c)) {
    c.remainder = e ? e.nodeValue.length + b - d - 1 : 0, c.node = e
  }
  return e
};
goog.dom.isNodeList = function(a) {
  if(a && typeof a.length == "number") {
    if(goog.isObject(a)) {
      return typeof a.item == "function" || typeof a.item == "string"
    }else {
      if(goog.isFunction(a)) {
        return typeof a.item == "function"
      }
    }
  }
  return!1
};
goog.dom.getAncestorByTagNameAndClass = function(a, b, c) {
  var d = b ? b.toUpperCase() : null;
  return goog.dom.getAncestor(a, function(a) {
    return(!d || a.nodeName == d) && (!c || goog.dom.classes.has(a, c))
  }, !0)
};
goog.dom.getAncestorByClass = function(a, b) {
  return goog.dom.getAncestorByTagNameAndClass(a, null, b)
};
goog.dom.getAncestor = function(a, b, c, d) {
  if(!c) {
    a = a.parentNode
  }
  for(var c = d == null, e = 0;a && (c || e <= d);) {
    if(b(a)) {
      return a
    }
    a = a.parentNode;
    e++
  }
  return null
};
goog.dom.DomHelper = function(a) {
  this.document_ = a || goog.global.document || document
};
goog.dom.DomHelper.prototype.getDomHelper = goog.dom.getDomHelper;
goog.dom.DomHelper.prototype.setDocument = function(a) {
  this.document_ = a
};
goog.dom.DomHelper.prototype.getDocument = function() {
  return this.document_
};
goog.dom.DomHelper.prototype.getElement = function(a) {
  return goog.isString(a) ? this.document_.getElementById(a) : a
};
goog.dom.DomHelper.prototype.$ = goog.dom.DomHelper.prototype.getElement;
goog.dom.DomHelper.prototype.getElementsByTagNameAndClass = function(a, b, c) {
  return goog.dom.getElementsByTagNameAndClass_(this.document_, a, b, c)
};
goog.dom.DomHelper.prototype.getElementsByClass = function(a, b) {
  return goog.dom.getElementsByClass(a, b || this.document_)
};
goog.dom.DomHelper.prototype.getElementByClass = function(a, b) {
  return goog.dom.getElementByClass(a, b || this.document_)
};
goog.dom.DomHelper.prototype.$$ = goog.dom.DomHelper.prototype.getElementsByTagNameAndClass;
goog.dom.DomHelper.prototype.setProperties = goog.dom.setProperties;
goog.dom.DomHelper.prototype.getViewportSize = function(a) {
  return goog.dom.getViewportSize(a || this.getWindow())
};
goog.dom.DomHelper.prototype.getDocumentHeight = function() {
  return goog.dom.getDocumentHeight_(this.getWindow())
};
goog.dom.DomHelper.prototype.createDom = function() {
  return goog.dom.createDom_(this.document_, arguments)
};
goog.dom.DomHelper.prototype.$dom = goog.dom.DomHelper.prototype.createDom;
goog.dom.DomHelper.prototype.createElement = function(a) {
  return this.document_.createElement(a)
};
goog.dom.DomHelper.prototype.createTextNode = function(a) {
  return this.document_.createTextNode(a)
};
goog.dom.DomHelper.prototype.createTable = function(a, b, c) {
  return goog.dom.createTable_(this.document_, a, b, !!c)
};
goog.dom.DomHelper.prototype.htmlToDocumentFragment = function(a) {
  return goog.dom.htmlToDocumentFragment_(this.document_, a)
};
goog.dom.DomHelper.prototype.getCompatMode = function() {
  return this.isCss1CompatMode() ? "CSS1Compat" : "BackCompat"
};
goog.dom.DomHelper.prototype.isCss1CompatMode = function() {
  return goog.dom.isCss1CompatMode_(this.document_)
};
goog.dom.DomHelper.prototype.getWindow = function() {
  return goog.dom.getWindow_(this.document_)
};
goog.dom.DomHelper.prototype.getDocumentScrollElement = function() {
  return goog.dom.getDocumentScrollElement_(this.document_)
};
goog.dom.DomHelper.prototype.getDocumentScroll = function() {
  return goog.dom.getDocumentScroll_(this.document_)
};
goog.dom.DomHelper.prototype.appendChild = goog.dom.appendChild;
goog.dom.DomHelper.prototype.append = goog.dom.append;
goog.dom.DomHelper.prototype.removeChildren = goog.dom.removeChildren;
goog.dom.DomHelper.prototype.insertSiblingBefore = goog.dom.insertSiblingBefore;
goog.dom.DomHelper.prototype.insertSiblingAfter = goog.dom.insertSiblingAfter;
goog.dom.DomHelper.prototype.removeNode = goog.dom.removeNode;
goog.dom.DomHelper.prototype.replaceNode = goog.dom.replaceNode;
goog.dom.DomHelper.prototype.flattenElement = goog.dom.flattenElement;
goog.dom.DomHelper.prototype.getFirstElementChild = goog.dom.getFirstElementChild;
goog.dom.DomHelper.prototype.getLastElementChild = goog.dom.getLastElementChild;
goog.dom.DomHelper.prototype.getNextElementSibling = goog.dom.getNextElementSibling;
goog.dom.DomHelper.prototype.getPreviousElementSibling = goog.dom.getPreviousElementSibling;
goog.dom.DomHelper.prototype.getNextNode = goog.dom.getNextNode;
goog.dom.DomHelper.prototype.getPreviousNode = goog.dom.getPreviousNode;
goog.dom.DomHelper.prototype.isNodeLike = goog.dom.isNodeLike;
goog.dom.DomHelper.prototype.contains = goog.dom.contains;
goog.dom.DomHelper.prototype.getOwnerDocument = goog.dom.getOwnerDocument;
goog.dom.DomHelper.prototype.getFrameContentDocument = goog.dom.getFrameContentDocument;
goog.dom.DomHelper.prototype.getFrameContentWindow = goog.dom.getFrameContentWindow;
goog.dom.DomHelper.prototype.setTextContent = goog.dom.setTextContent;
goog.dom.DomHelper.prototype.findNode = goog.dom.findNode;
goog.dom.DomHelper.prototype.findNodes = goog.dom.findNodes;
goog.dom.DomHelper.prototype.getTextContent = goog.dom.getTextContent;
goog.dom.DomHelper.prototype.getNodeTextLength = goog.dom.getNodeTextLength;
goog.dom.DomHelper.prototype.getNodeTextOffset = goog.dom.getNodeTextOffset;
goog.dom.DomHelper.prototype.getAncestorByTagNameAndClass = goog.dom.getAncestorByTagNameAndClass;
goog.dom.DomHelper.prototype.getAncestorByClass = goog.dom.getAncestorByClass;
goog.dom.DomHelper.prototype.getAncestor = goog.dom.getAncestor;
webdriver.http.JsonpClient = function(a, b) {
  this.dom_ = b || goog.dom.getDomHelper();
  this.url_ = a + "/jsonp"
};
webdriver.http.JsonpClient.nextRequestId_ = 0;
webdriver.http.JsonpClient.createCallbackName_ = function() {
  return["wdJSONP_", (webdriver.http.JsonpClient.nextRequestId_++).toString(36), "_", goog.now().toString(36)].join("")
};
webdriver.http.JsonpClient.prototype.send = function(a, b) {
  function c() {
    try {
      delete goog.global[d]
    }catch(a) {
      goog.global[d] = void 0
    }
  }
  var d = webdriver.http.JsonpClient.createCallbackName_(), e = this.dom_, f = e.createDom("script", {type:"text/javascript", charset:"UTF-8", src:[this.url_, "?method=", a.method, "&path=", encodeURIComponent(a.path), "&body=", encodeURIComponent(goog.json.serialize(a.data)), "&callback=", d, "&cacheBuster=", goog.now()].join("")});
  goog.global[d] = function(a) {
    c();
    e.removeNode(f);
    a = new webdriver.http.Response(200, {}, a);
    b(null, a)
  };
  f.onerror = function() {
    c();
    e.removeNode(f);
    b(Error("Unable to send request: " + f.src))
  };
  e.appendChild(e.getDocument().documentElement, f)
};
goog.structs = {};
goog.structs.getCount = function(a) {
  if(typeof a.getCount == "function") {
    return a.getCount()
  }
  if(goog.isArrayLike(a) || goog.isString(a)) {
    return a.length
  }
  return goog.object.getCount(a)
};
goog.structs.getValues = function(a) {
  if(typeof a.getValues == "function") {
    return a.getValues()
  }
  if(goog.isString(a)) {
    return a.split("")
  }
  if(goog.isArrayLike(a)) {
    for(var b = [], c = a.length, d = 0;d < c;d++) {
      b.push(a[d])
    }
    return b
  }
  return goog.object.getValues(a)
};
goog.structs.getKeys = function(a) {
  if(typeof a.getKeys == "function") {
    return a.getKeys()
  }
  if(typeof a.getValues != "function") {
    if(goog.isArrayLike(a) || goog.isString(a)) {
      for(var b = [], a = a.length, c = 0;c < a;c++) {
        b.push(c)
      }
      return b
    }
    return goog.object.getKeys(a)
  }
};
goog.structs.contains = function(a, b) {
  if(typeof a.contains == "function") {
    return a.contains(b)
  }
  if(typeof a.containsValue == "function") {
    return a.containsValue(b)
  }
  if(goog.isArrayLike(a) || goog.isString(a)) {
    return goog.array.contains(a, b)
  }
  return goog.object.containsValue(a, b)
};
goog.structs.isEmpty = function(a) {
  if(typeof a.isEmpty == "function") {
    return a.isEmpty()
  }
  if(goog.isArrayLike(a) || goog.isString(a)) {
    return goog.array.isEmpty(a)
  }
  return goog.object.isEmpty(a)
};
goog.structs.clear = function(a) {
  typeof a.clear == "function" ? a.clear() : goog.isArrayLike(a) ? goog.array.clear(a) : goog.object.clear(a)
};
goog.structs.forEach = function(a, b, c) {
  if(typeof a.forEach == "function") {
    a.forEach(b, c)
  }else {
    if(goog.isArrayLike(a) || goog.isString(a)) {
      goog.array.forEach(a, b, c)
    }else {
      for(var d = goog.structs.getKeys(a), e = goog.structs.getValues(a), f = e.length, g = 0;g < f;g++) {
        b.call(c, e[g], d && d[g], a)
      }
    }
  }
};
goog.structs.filter = function(a, b, c) {
  if(typeof a.filter == "function") {
    return a.filter(b, c)
  }
  if(goog.isArrayLike(a) || goog.isString(a)) {
    return goog.array.filter(a, b, c)
  }
  var d, e = goog.structs.getKeys(a), f = goog.structs.getValues(a), g = f.length;
  if(e) {
    d = {};
    for(var h = 0;h < g;h++) {
      b.call(c, f[h], e[h], a) && (d[e[h]] = f[h])
    }
  }else {
    d = [];
    for(h = 0;h < g;h++) {
      b.call(c, f[h], void 0, a) && d.push(f[h])
    }
  }
  return d
};
goog.structs.map = function(a, b, c) {
  if(typeof a.map == "function") {
    return a.map(b, c)
  }
  if(goog.isArrayLike(a) || goog.isString(a)) {
    return goog.array.map(a, b, c)
  }
  var d, e = goog.structs.getKeys(a), f = goog.structs.getValues(a), g = f.length;
  if(e) {
    d = {};
    for(var h = 0;h < g;h++) {
      d[e[h]] = b.call(c, f[h], e[h], a)
    }
  }else {
    d = [];
    for(h = 0;h < g;h++) {
      d[h] = b.call(c, f[h], void 0, a)
    }
  }
  return d
};
goog.structs.some = function(a, b, c) {
  if(typeof a.some == "function") {
    return a.some(b, c)
  }
  if(goog.isArrayLike(a) || goog.isString(a)) {
    return goog.array.some(a, b, c)
  }
  for(var d = goog.structs.getKeys(a), e = goog.structs.getValues(a), f = e.length, g = 0;g < f;g++) {
    if(b.call(c, e[g], d && d[g], a)) {
      return!0
    }
  }
  return!1
};
goog.structs.every = function(a, b, c) {
  if(typeof a.every == "function") {
    return a.every(b, c)
  }
  if(goog.isArrayLike(a) || goog.isString(a)) {
    return goog.array.every(a, b, c)
  }
  for(var d = goog.structs.getKeys(a), e = goog.structs.getValues(a), f = e.length, g = 0;g < f;g++) {
    if(!b.call(c, e[g], d && d[g], a)) {
      return!1
    }
  }
  return!0
};
goog.iter = {};
goog.iter.StopIteration = "StopIteration" in goog.global ? goog.global.StopIteration : Error("StopIteration");
goog.iter.Iterator = function() {
};
goog.iter.Iterator.prototype.next = function() {
  throw goog.iter.StopIteration;
};
goog.iter.Iterator.prototype.__iterator__ = function() {
  return this
};
goog.iter.toIterator = function(a) {
  if(a instanceof goog.iter.Iterator) {
    return a
  }
  if(typeof a.__iterator__ == "function") {
    return a.__iterator__(!1)
  }
  if(goog.isArrayLike(a)) {
    var b = 0, c = new goog.iter.Iterator;
    c.next = function() {
      for(;;) {
        if(b >= a.length) {
          throw goog.iter.StopIteration;
        }
        if(b in a) {
          return a[b++]
        }else {
          b++
        }
      }
    };
    return c
  }
  throw Error("Not implemented");
};
goog.iter.forEach = function(a, b, c) {
  if(goog.isArrayLike(a)) {
    try {
      goog.array.forEach(a, b, c)
    }catch(d) {
      if(d !== goog.iter.StopIteration) {
        throw d;
      }
    }
  }else {
    a = goog.iter.toIterator(a);
    try {
      for(;;) {
        b.call(c, a.next(), void 0, a)
      }
    }catch(e) {
      if(e !== goog.iter.StopIteration) {
        throw e;
      }
    }
  }
};
goog.iter.filter = function(a, b, c) {
  var a = goog.iter.toIterator(a), d = new goog.iter.Iterator;
  d.next = function() {
    for(;;) {
      var d = a.next();
      if(b.call(c, d, void 0, a)) {
        return d
      }
    }
  };
  return d
};
goog.iter.range = function(a, b, c) {
  var d = 0, e = a, f = c || 1;
  arguments.length > 1 && (d = a, e = b);
  if(f == 0) {
    throw Error("Range step argument must not be zero");
  }
  var g = new goog.iter.Iterator;
  g.next = function() {
    if(f > 0 && d >= e || f < 0 && d <= e) {
      throw goog.iter.StopIteration;
    }
    var a = d;
    d += f;
    return a
  };
  return g
};
goog.iter.join = function(a, b) {
  return goog.iter.toArray(a).join(b)
};
goog.iter.map = function(a, b, c) {
  var a = goog.iter.toIterator(a), d = new goog.iter.Iterator;
  d.next = function() {
    for(;;) {
      var d = a.next();
      return b.call(c, d, void 0, a)
    }
  };
  return d
};
goog.iter.reduce = function(a, b, c, d) {
  var e = c;
  goog.iter.forEach(a, function(a) {
    e = b.call(d, e, a)
  });
  return e
};
goog.iter.some = function(a, b, c) {
  a = goog.iter.toIterator(a);
  try {
    for(;;) {
      if(b.call(c, a.next(), void 0, a)) {
        return!0
      }
    }
  }catch(d) {
    if(d !== goog.iter.StopIteration) {
      throw d;
    }
  }
  return!1
};
goog.iter.every = function(a, b, c) {
  a = goog.iter.toIterator(a);
  try {
    for(;;) {
      if(!b.call(c, a.next(), void 0, a)) {
        return!1
      }
    }
  }catch(d) {
    if(d !== goog.iter.StopIteration) {
      throw d;
    }
  }
  return!0
};
goog.iter.chain = function() {
  var a = arguments, b = a.length, c = 0, d = new goog.iter.Iterator;
  d.next = function() {
    try {
      if(c >= b) {
        throw goog.iter.StopIteration;
      }
      return goog.iter.toIterator(a[c]).next()
    }catch(d) {
      if(d !== goog.iter.StopIteration || c >= b) {
        throw d;
      }else {
        return c++, this.next()
      }
    }
  };
  return d
};
goog.iter.dropWhile = function(a, b, c) {
  var a = goog.iter.toIterator(a), d = new goog.iter.Iterator, e = !0;
  d.next = function() {
    for(;;) {
      var d = a.next();
      if(!e || !b.call(c, d, void 0, a)) {
        return e = !1, d
      }
    }
  };
  return d
};
goog.iter.takeWhile = function(a, b, c) {
  var a = goog.iter.toIterator(a), d = new goog.iter.Iterator, e = !0;
  d.next = function() {
    for(;;) {
      if(e) {
        var d = a.next();
        if(b.call(c, d, void 0, a)) {
          return d
        }else {
          e = !1
        }
      }else {
        throw goog.iter.StopIteration;
      }
    }
  };
  return d
};
goog.iter.toArray = function(a) {
  if(goog.isArrayLike(a)) {
    return goog.array.toArray(a)
  }
  var a = goog.iter.toIterator(a), b = [];
  goog.iter.forEach(a, function(a) {
    b.push(a)
  });
  return b
};
goog.iter.equals = function(a, b) {
  var a = goog.iter.toIterator(a), b = goog.iter.toIterator(b), c, d;
  try {
    for(;;) {
      c = d = !1;
      var e = a.next();
      c = !0;
      var f = b.next();
      d = !0;
      if(e != f) {
        break
      }
    }
  }catch(g) {
    if(g !== goog.iter.StopIteration) {
      throw g;
    }else {
      if(c && !d) {
        return!1
      }
      if(!d) {
        try {
          b.next()
        }catch(h) {
          if(h !== goog.iter.StopIteration) {
            throw h;
          }
          return!0
        }
      }
    }
  }
  return!1
};
goog.iter.nextOrValue = function(a, b) {
  try {
    return goog.iter.toIterator(a).next()
  }catch(c) {
    if(c != goog.iter.StopIteration) {
      throw c;
    }
    return b
  }
};
goog.iter.product = function() {
  if(goog.array.some(arguments, function(a) {
    return!a.length
  }) || !arguments.length) {
    return new goog.iter.Iterator
  }
  var a = new goog.iter.Iterator, b = arguments, c = goog.array.repeat(0, b.length);
  a.next = function() {
    if(c) {
      for(var a = goog.array.map(c, function(a, c) {
        return b[c][a]
      }), e = c.length - 1;e >= 0;e--) {
        goog.asserts.assert(c);
        if(c[e] < b[e].length - 1) {
          c[e]++;
          break
        }
        if(e == 0) {
          c = null;
          break
        }
        c[e] = 0
      }
      return a
    }
    throw goog.iter.StopIteration;
  };
  return a
};
goog.structs.Map = function(a) {
  this.map_ = {};
  this.keys_ = [];
  var b = arguments.length;
  if(b > 1) {
    if(b % 2) {
      throw Error("Uneven number of arguments");
    }
    for(var c = 0;c < b;c += 2) {
      this.set(arguments[c], arguments[c + 1])
    }
  }else {
    a && this.addAll(a)
  }
};
goog.structs.Map.prototype.count_ = 0;
goog.structs.Map.prototype.version_ = 0;
goog.structs.Map.prototype.getCount = function() {
  return this.count_
};
goog.structs.Map.prototype.getValues = function() {
  this.cleanupKeysArray_();
  for(var a = [], b = 0;b < this.keys_.length;b++) {
    a.push(this.map_[this.keys_[b]])
  }
  return a
};
goog.structs.Map.prototype.getKeys = function() {
  this.cleanupKeysArray_();
  return this.keys_.concat()
};
goog.structs.Map.prototype.containsKey = function(a) {
  return goog.structs.Map.hasKey_(this.map_, a)
};
goog.structs.Map.prototype.containsValue = function(a) {
  for(var b = 0;b < this.keys_.length;b++) {
    var c = this.keys_[b];
    if(goog.structs.Map.hasKey_(this.map_, c) && this.map_[c] == a) {
      return!0
    }
  }
  return!1
};
goog.structs.Map.prototype.equals = function(a, b) {
  if(this === a) {
    return!0
  }
  if(this.count_ != a.getCount()) {
    return!1
  }
  var c = b || goog.structs.Map.defaultEquals;
  this.cleanupKeysArray_();
  for(var d, e = 0;d = this.keys_[e];e++) {
    if(!c(this.get(d), a.get(d))) {
      return!1
    }
  }
  return!0
};
goog.structs.Map.defaultEquals = function(a, b) {
  return a === b
};
goog.structs.Map.prototype.isEmpty = function() {
  return this.count_ == 0
};
goog.structs.Map.prototype.clear = function() {
  this.map_ = {};
  this.version_ = this.count_ = this.keys_.length = 0
};
goog.structs.Map.prototype.remove = function(a) {
  if(goog.structs.Map.hasKey_(this.map_, a)) {
    return delete this.map_[a], this.count_--, this.version_++, this.keys_.length > 2 * this.count_ && this.cleanupKeysArray_(), !0
  }
  return!1
};
goog.structs.Map.prototype.cleanupKeysArray_ = function() {
  if(this.count_ != this.keys_.length) {
    for(var a = 0, b = 0;a < this.keys_.length;) {
      var c = this.keys_[a];
      goog.structs.Map.hasKey_(this.map_, c) && (this.keys_[b++] = c);
      a++
    }
    this.keys_.length = b
  }
  if(this.count_ != this.keys_.length) {
    for(var d = {}, b = a = 0;a < this.keys_.length;) {
      c = this.keys_[a], goog.structs.Map.hasKey_(d, c) || (this.keys_[b++] = c, d[c] = 1), a++
    }
    this.keys_.length = b
  }
};
goog.structs.Map.prototype.get = function(a, b) {
  if(goog.structs.Map.hasKey_(this.map_, a)) {
    return this.map_[a]
  }
  return b
};
goog.structs.Map.prototype.set = function(a, b) {
  goog.structs.Map.hasKey_(this.map_, a) || (this.count_++, this.keys_.push(a), this.version_++);
  this.map_[a] = b
};
goog.structs.Map.prototype.addAll = function(a) {
  var b;
  a instanceof goog.structs.Map ? (b = a.getKeys(), a = a.getValues()) : (b = goog.object.getKeys(a), a = goog.object.getValues(a));
  for(var c = 0;c < b.length;c++) {
    this.set(b[c], a[c])
  }
};
goog.structs.Map.prototype.clone = function() {
  return new goog.structs.Map(this)
};
goog.structs.Map.prototype.transpose = function() {
  for(var a = new goog.structs.Map, b = 0;b < this.keys_.length;b++) {
    var c = this.keys_[b];
    a.set(this.map_[c], c)
  }
  return a
};
goog.structs.Map.prototype.toObject = function() {
  this.cleanupKeysArray_();
  for(var a = {}, b = 0;b < this.keys_.length;b++) {
    var c = this.keys_[b];
    a[c] = this.map_[c]
  }
  return a
};
goog.structs.Map.prototype.getKeyIterator = function() {
  return this.__iterator__(!0)
};
goog.structs.Map.prototype.getValueIterator = function() {
  return this.__iterator__(!1)
};
goog.structs.Map.prototype.__iterator__ = function(a) {
  this.cleanupKeysArray_();
  var b = 0, c = this.keys_, d = this.map_, e = this.version_, f = this, g = new goog.iter.Iterator;
  g.next = function() {
    for(;;) {
      if(e != f.version_) {
        throw Error("The map has changed since the iterator was created");
      }
      if(b >= c.length) {
        throw goog.iter.StopIteration;
      }
      var g = c[b++];
      return a ? g : d[g]
    }
  };
  return g
};
goog.structs.Map.hasKey_ = function(a, b) {
  return Object.prototype.hasOwnProperty.call(a, b)
};
goog.uri = {};
goog.uri.utils = {};
goog.uri.utils.QueryArray = {};
goog.uri.utils.QueryValue = {};
goog.uri.utils.CharCode_ = {AMPERSAND:38, EQUAL:61, HASH:35, QUESTION:63};
goog.uri.utils.buildFromEncodedParts = function(a, b, c, d, e, f, g) {
  var h = [];
  a && h.push(a, ":");
  c && (h.push("//"), b && h.push(b, "@"), h.push(c), d && h.push(":", d));
  e && h.push(e);
  f && h.push("?", f);
  g && h.push("#", g);
  return h.join("")
};
goog.uri.utils.splitRe_ = RegExp("^(?:([^:/?#.]+):)?(?://(?:([^/?#]*)@)?([\\w\\d\\-\\u0100-\\uffff.%]*)(?::([0-9]+))?)?([^?#]+)?(?:\\?([^#]*))?(?:#(.*))?$");
goog.uri.utils.ComponentIndex = {SCHEME:1, USER_INFO:2, DOMAIN:3, PORT:4, PATH:5, QUERY_DATA:6, FRAGMENT:7};
goog.uri.utils.split = function(a) {
  return a.match(goog.uri.utils.splitRe_)
};
goog.uri.utils.decodeIfPossible_ = function(a) {
  return a && decodeURIComponent(a)
};
goog.uri.utils.getComponentByIndex_ = function(a, b) {
  return goog.uri.utils.split(b)[a] || null
};
goog.uri.utils.getScheme = function(a) {
  return goog.uri.utils.getComponentByIndex_(goog.uri.utils.ComponentIndex.SCHEME, a)
};
goog.uri.utils.getUserInfoEncoded = function(a) {
  return goog.uri.utils.getComponentByIndex_(goog.uri.utils.ComponentIndex.USER_INFO, a)
};
goog.uri.utils.getUserInfo = function(a) {
  return goog.uri.utils.decodeIfPossible_(goog.uri.utils.getUserInfoEncoded(a))
};
goog.uri.utils.getDomainEncoded = function(a) {
  return goog.uri.utils.getComponentByIndex_(goog.uri.utils.ComponentIndex.DOMAIN, a)
};
goog.uri.utils.getDomain = function(a) {
  return goog.uri.utils.decodeIfPossible_(goog.uri.utils.getDomainEncoded(a))
};
goog.uri.utils.getPort = function(a) {
  return Number(goog.uri.utils.getComponentByIndex_(goog.uri.utils.ComponentIndex.PORT, a)) || null
};
goog.uri.utils.getPathEncoded = function(a) {
  return goog.uri.utils.getComponentByIndex_(goog.uri.utils.ComponentIndex.PATH, a)
};
goog.uri.utils.getPath = function(a) {
  return goog.uri.utils.decodeIfPossible_(goog.uri.utils.getPathEncoded(a))
};
goog.uri.utils.getQueryData = function(a) {
  return goog.uri.utils.getComponentByIndex_(goog.uri.utils.ComponentIndex.QUERY_DATA, a)
};
goog.uri.utils.getFragmentEncoded = function(a) {
  var b = a.indexOf("#");
  return b < 0 ? null : a.substr(b + 1)
};
goog.uri.utils.setFragmentEncoded = function(a, b) {
  return goog.uri.utils.removeFragment(a) + (b ? "#" + b : "")
};
goog.uri.utils.getFragment = function(a) {
  return goog.uri.utils.decodeIfPossible_(goog.uri.utils.getFragmentEncoded(a))
};
goog.uri.utils.getHost = function(a) {
  a = goog.uri.utils.split(a);
  return goog.uri.utils.buildFromEncodedParts(a[goog.uri.utils.ComponentIndex.SCHEME], a[goog.uri.utils.ComponentIndex.USER_INFO], a[goog.uri.utils.ComponentIndex.DOMAIN], a[goog.uri.utils.ComponentIndex.PORT])
};
goog.uri.utils.getPathAndAfter = function(a) {
  a = goog.uri.utils.split(a);
  return goog.uri.utils.buildFromEncodedParts(null, null, null, null, a[goog.uri.utils.ComponentIndex.PATH], a[goog.uri.utils.ComponentIndex.QUERY_DATA], a[goog.uri.utils.ComponentIndex.FRAGMENT])
};
goog.uri.utils.removeFragment = function(a) {
  var b = a.indexOf("#");
  return b < 0 ? a : a.substr(0, b)
};
goog.uri.utils.haveSameDomain = function(a, b) {
  var c = goog.uri.utils.split(a), d = goog.uri.utils.split(b);
  return c[goog.uri.utils.ComponentIndex.DOMAIN] == d[goog.uri.utils.ComponentIndex.DOMAIN] && c[goog.uri.utils.ComponentIndex.SCHEME] == d[goog.uri.utils.ComponentIndex.SCHEME] && c[goog.uri.utils.ComponentIndex.PORT] == d[goog.uri.utils.ComponentIndex.PORT]
};
goog.uri.utils.assertNoFragmentsOrQueries_ = function(a) {
  if(goog.DEBUG && (a.indexOf("#") >= 0 || a.indexOf("?") >= 0)) {
    throw Error("goog.uri.utils: Fragment or query identifiers are not supported: [" + a + "]");
  }
};
goog.uri.utils.appendQueryData_ = function(a) {
  if(a[1]) {
    var b = a[0], c = b.indexOf("#");
    c >= 0 && (a.push(b.substr(c)), a[0] = b = b.substr(0, c));
    c = b.indexOf("?");
    c < 0 ? a[1] = "?" : c == b.length - 1 && (a[1] = void 0)
  }
  return a.join("")
};
goog.uri.utils.appendKeyValuePairs_ = function(a, b, c) {
  if(goog.isArray(b)) {
    for(var d = 0;d < b.length;d++) {
      c.push("&", a), b[d] !== "" && c.push("=", goog.string.urlEncode(b[d]))
    }
  }else {
    b != null && (c.push("&", a), b !== "" && c.push("=", goog.string.urlEncode(b)))
  }
};
goog.uri.utils.buildQueryDataBuffer_ = function(a, b, c) {
  goog.asserts.assert(Math.max(b.length - (c || 0), 0) % 2 == 0, "goog.uri.utils: Key/value lists must be even in length.");
  for(c = c || 0;c < b.length;c += 2) {
    goog.uri.utils.appendKeyValuePairs_(b[c], b[c + 1], a)
  }
  return a
};
goog.uri.utils.buildQueryData = function(a, b) {
  var c = goog.uri.utils.buildQueryDataBuffer_([], a, b);
  c[0] = "";
  return c.join("")
};
goog.uri.utils.buildQueryDataBufferFromMap_ = function(a, b) {
  for(var c in b) {
    goog.uri.utils.appendKeyValuePairs_(c, b[c], a)
  }
  return a
};
goog.uri.utils.buildQueryDataFromMap = function(a) {
  a = goog.uri.utils.buildQueryDataBufferFromMap_([], a);
  a[0] = "";
  return a.join("")
};
goog.uri.utils.appendParams = function(a) {
  return goog.uri.utils.appendQueryData_(arguments.length == 2 ? goog.uri.utils.buildQueryDataBuffer_([a], arguments[1], 0) : goog.uri.utils.buildQueryDataBuffer_([a], arguments, 1))
};
goog.uri.utils.appendParamsFromMap = function(a, b) {
  return goog.uri.utils.appendQueryData_(goog.uri.utils.buildQueryDataBufferFromMap_([a], b))
};
goog.uri.utils.appendParam = function(a, b, c) {
  return goog.uri.utils.appendQueryData_([a, "&", b, "=", goog.string.urlEncode(c)])
};
goog.uri.utils.findParam_ = function(a, b, c, d) {
  for(var e = c.length;(b = a.indexOf(c, b)) >= 0 && b < d;) {
    var f = a.charCodeAt(b - 1);
    if(f == goog.uri.utils.CharCode_.AMPERSAND || f == goog.uri.utils.CharCode_.QUESTION) {
      if(f = a.charCodeAt(b + e), !f || f == goog.uri.utils.CharCode_.EQUAL || f == goog.uri.utils.CharCode_.AMPERSAND || f == goog.uri.utils.CharCode_.HASH) {
        return b
      }
    }
    b += e + 1
  }
  return-1
};
goog.uri.utils.hashOrEndRe_ = /#|$/;
goog.uri.utils.hasParam = function(a, b) {
  return goog.uri.utils.findParam_(a, 0, b, a.search(goog.uri.utils.hashOrEndRe_)) >= 0
};
goog.uri.utils.getParamValue = function(a, b) {
  var c = a.search(goog.uri.utils.hashOrEndRe_), d = goog.uri.utils.findParam_(a, 0, b, c);
  if(d < 0) {
    return null
  }else {
    var e = a.indexOf("&", d);
    if(e < 0 || e > c) {
      e = c
    }
    d += b.length + 1;
    return goog.string.urlDecode(a.substr(d, e - d))
  }
};
goog.uri.utils.getParamValues = function(a, b) {
  for(var c = a.search(goog.uri.utils.hashOrEndRe_), d = 0, e, f = [];(e = goog.uri.utils.findParam_(a, d, b, c)) >= 0;) {
    d = a.indexOf("&", e);
    if(d < 0 || d > c) {
      d = c
    }
    e += b.length + 1;
    f.push(goog.string.urlDecode(a.substr(e, d - e)))
  }
  return f
};
goog.uri.utils.trailingQueryPunctuationRe_ = /[?&]($|#)/;
goog.uri.utils.removeParam = function(a, b) {
  for(var c = a.search(goog.uri.utils.hashOrEndRe_), d = 0, e, f = [];(e = goog.uri.utils.findParam_(a, d, b, c)) >= 0;) {
    f.push(a.substring(d, e)), d = Math.min(a.indexOf("&", e) + 1 || c, c)
  }
  f.push(a.substr(d));
  return f.join("").replace(goog.uri.utils.trailingQueryPunctuationRe_, "$1")
};
goog.uri.utils.setParam = function(a, b, c) {
  return goog.uri.utils.appendParam(goog.uri.utils.removeParam(a, b), b, c)
};
goog.uri.utils.appendPath = function(a, b) {
  goog.uri.utils.assertNoFragmentsOrQueries_(a);
  goog.string.endsWith(a, "/") && (a = a.substr(0, a.length - 1));
  goog.string.startsWith(b, "/") && (b = b.substr(1));
  return goog.string.buildString(a, "/", b)
};
goog.uri.utils.StandardQueryParam = {RANDOM:"zx"};
goog.uri.utils.makeUnique = function(a) {
  return goog.uri.utils.setParam(a, goog.uri.utils.StandardQueryParam.RANDOM, goog.string.getRandomString())
};
goog.Uri = function(a, b) {
  var c;
  a instanceof goog.Uri ? (this.setIgnoreCase(b == null ? a.getIgnoreCase() : b), this.setScheme(a.getScheme()), this.setUserInfo(a.getUserInfo()), this.setDomain(a.getDomain()), this.setPort(a.getPort()), this.setPath(a.getPath()), this.setQueryData(a.getQueryData().clone()), this.setFragment(a.getFragment())) : a && (c = goog.uri.utils.split(String(a))) ? (this.setIgnoreCase(!!b), this.setScheme(c[goog.uri.utils.ComponentIndex.SCHEME] || "", !0), this.setUserInfo(c[goog.uri.utils.ComponentIndex.USER_INFO] || 
  "", !0), this.setDomain(c[goog.uri.utils.ComponentIndex.DOMAIN] || "", !0), this.setPort(c[goog.uri.utils.ComponentIndex.PORT]), this.setPath(c[goog.uri.utils.ComponentIndex.PATH] || "", !0), this.setQuery(c[goog.uri.utils.ComponentIndex.QUERY_DATA] || "", !0), this.setFragment(c[goog.uri.utils.ComponentIndex.FRAGMENT] || "", !0)) : (this.setIgnoreCase(!!b), this.queryData_ = new goog.Uri.QueryData(null, this, this.ignoreCase_))
};
goog.Uri.RANDOM_PARAM = goog.uri.utils.StandardQueryParam.RANDOM;
goog.Uri.prototype.scheme_ = "";
goog.Uri.prototype.userInfo_ = "";
goog.Uri.prototype.domain_ = "";
goog.Uri.prototype.port_ = null;
goog.Uri.prototype.path_ = "";
goog.Uri.prototype.fragment_ = "";
goog.Uri.prototype.isReadOnly_ = !1;
goog.Uri.prototype.ignoreCase_ = !1;
goog.Uri.prototype.toString = function() {
  if(this.cachedToString_) {
    return this.cachedToString_
  }
  var a = [];
  this.scheme_ && a.push(goog.Uri.encodeSpecialChars_(this.scheme_, goog.Uri.reDisallowedInSchemeOrUserInfo_), ":");
  this.domain_ && (a.push("//"), this.userInfo_ && a.push(goog.Uri.encodeSpecialChars_(this.userInfo_, goog.Uri.reDisallowedInSchemeOrUserInfo_), "@"), a.push(goog.Uri.encodeString_(this.domain_)), this.port_ != null && a.push(":", String(this.getPort())));
  this.path_ && (this.hasDomain() && this.path_.charAt(0) != "/" && a.push("/"), a.push(goog.Uri.encodeSpecialChars_(this.path_, this.path_.charAt(0) == "/" ? goog.Uri.reDisallowedInAbsolutePath_ : goog.Uri.reDisallowedInRelativePath_)));
  var b = String(this.queryData_);
  b && a.push("?", b);
  this.fragment_ && a.push("#", goog.Uri.encodeSpecialChars_(this.fragment_, goog.Uri.reDisallowedInFragment_));
  return this.cachedToString_ = a.join("")
};
goog.Uri.prototype.resolve = function(a) {
  var b = this.clone(), c = a.hasScheme();
  c ? b.setScheme(a.getScheme()) : c = a.hasUserInfo();
  c ? b.setUserInfo(a.getUserInfo()) : c = a.hasDomain();
  c ? b.setDomain(a.getDomain()) : c = a.hasPort();
  var d = a.getPath();
  if(c) {
    b.setPort(a.getPort())
  }else {
    if(c = a.hasPath()) {
      if(d.charAt(0) != "/") {
        if(this.hasDomain() && !this.hasPath()) {
          d = "/" + d
        }else {
          var e = b.getPath().lastIndexOf("/");
          e != -1 && (d = b.getPath().substr(0, e + 1) + d)
        }
      }
      d = goog.Uri.removeDotSegments(d)
    }
  }
  c ? b.setPath(d) : c = a.hasQuery();
  c ? b.setQuery(a.getDecodedQuery()) : c = a.hasFragment();
  c && b.setFragment(a.getFragment());
  return b
};
goog.Uri.prototype.clone = function() {
  return goog.Uri.create(this.scheme_, this.userInfo_, this.domain_, this.port_, this.path_, this.queryData_.clone(), this.fragment_, this.ignoreCase_)
};
goog.Uri.prototype.getScheme = function() {
  return this.scheme_
};
goog.Uri.prototype.setScheme = function(a, b) {
  this.enforceReadOnly();
  delete this.cachedToString_;
  if(this.scheme_ = b ? goog.Uri.decodeOrEmpty_(a) : a) {
    this.scheme_ = this.scheme_.replace(/:$/, "")
  }
  return this
};
goog.Uri.prototype.hasScheme = function() {
  return!!this.scheme_
};
goog.Uri.prototype.getUserInfo = function() {
  return this.userInfo_
};
goog.Uri.prototype.setUserInfo = function(a, b) {
  this.enforceReadOnly();
  delete this.cachedToString_;
  this.userInfo_ = b ? goog.Uri.decodeOrEmpty_(a) : a;
  return this
};
goog.Uri.prototype.hasUserInfo = function() {
  return!!this.userInfo_
};
goog.Uri.prototype.getDomain = function() {
  return this.domain_
};
goog.Uri.prototype.setDomain = function(a, b) {
  this.enforceReadOnly();
  delete this.cachedToString_;
  this.domain_ = b ? goog.Uri.decodeOrEmpty_(a) : a;
  return this
};
goog.Uri.prototype.hasDomain = function() {
  return!!this.domain_
};
goog.Uri.prototype.getPort = function() {
  return this.port_
};
goog.Uri.prototype.setPort = function(a) {
  this.enforceReadOnly();
  delete this.cachedToString_;
  if(a) {
    a = Number(a);
    if(isNaN(a) || a < 0) {
      throw Error("Bad port number " + a);
    }
    this.port_ = a
  }else {
    this.port_ = null
  }
  return this
};
goog.Uri.prototype.hasPort = function() {
  return this.port_ != null
};
goog.Uri.prototype.getPath = function() {
  return this.path_
};
goog.Uri.prototype.setPath = function(a, b) {
  this.enforceReadOnly();
  delete this.cachedToString_;
  this.path_ = b ? goog.Uri.decodeOrEmpty_(a) : a;
  return this
};
goog.Uri.prototype.hasPath = function() {
  return!!this.path_
};
goog.Uri.prototype.hasQuery = function() {
  return this.queryData_.toString() !== ""
};
goog.Uri.prototype.setQueryData = function(a, b) {
  this.enforceReadOnly();
  delete this.cachedToString_;
  a instanceof goog.Uri.QueryData ? (this.queryData_ = a, this.queryData_.uri_ = this, this.queryData_.setIgnoreCase(this.ignoreCase_)) : (b || (a = goog.Uri.encodeSpecialChars_(a, goog.Uri.reDisallowedInQuery_)), this.queryData_ = new goog.Uri.QueryData(a, this, this.ignoreCase_));
  return this
};
goog.Uri.prototype.setQuery = function(a, b) {
  return this.setQueryData(a, b)
};
goog.Uri.prototype.getEncodedQuery = function() {
  return this.queryData_.toString()
};
goog.Uri.prototype.getDecodedQuery = function() {
  return this.queryData_.toDecodedString()
};
goog.Uri.prototype.getQueryData = function() {
  return this.queryData_
};
goog.Uri.prototype.getQuery = function() {
  return this.getEncodedQuery()
};
goog.Uri.prototype.setParameterValue = function(a, b) {
  this.enforceReadOnly();
  delete this.cachedToString_;
  this.queryData_.set(a, b);
  return this
};
goog.Uri.prototype.setParameterValues = function(a, b) {
  this.enforceReadOnly();
  delete this.cachedToString_;
  goog.isArray(b) || (b = [String(b)]);
  this.queryData_.setValues(a, b);
  return this
};
goog.Uri.prototype.getParameterValues = function(a) {
  return this.queryData_.getValues(a)
};
goog.Uri.prototype.getParameterValue = function(a) {
  return this.queryData_.get(a)
};
goog.Uri.prototype.getFragment = function() {
  return this.fragment_
};
goog.Uri.prototype.setFragment = function(a, b) {
  this.enforceReadOnly();
  delete this.cachedToString_;
  this.fragment_ = b ? goog.Uri.decodeOrEmpty_(a) : a;
  return this
};
goog.Uri.prototype.hasFragment = function() {
  return!!this.fragment_
};
goog.Uri.prototype.hasSameDomainAs = function(a) {
  return(!this.hasDomain() && !a.hasDomain() || this.getDomain() == a.getDomain()) && (!this.hasPort() && !a.hasPort() || this.getPort() == a.getPort())
};
goog.Uri.prototype.makeUnique = function() {
  this.enforceReadOnly();
  this.setParameterValue(goog.Uri.RANDOM_PARAM, goog.string.getRandomString());
  return this
};
goog.Uri.prototype.removeParameter = function(a) {
  this.enforceReadOnly();
  this.queryData_.remove(a);
  return this
};
goog.Uri.prototype.setReadOnly = function(a) {
  this.isReadOnly_ = a;
  return this
};
goog.Uri.prototype.isReadOnly = function() {
  return this.isReadOnly_
};
goog.Uri.prototype.enforceReadOnly = function() {
  if(this.isReadOnly_) {
    throw Error("Tried to modify a read-only Uri");
  }
};
goog.Uri.prototype.setIgnoreCase = function(a) {
  this.ignoreCase_ = a;
  this.queryData_ && this.queryData_.setIgnoreCase(a);
  return this
};
goog.Uri.prototype.getIgnoreCase = function() {
  return this.ignoreCase_
};
goog.Uri.parse = function(a, b) {
  return a instanceof goog.Uri ? a.clone() : new goog.Uri(a, b)
};
goog.Uri.create = function(a, b, c, d, e, f, g, h) {
  h = new goog.Uri(null, h);
  a && h.setScheme(a);
  b && h.setUserInfo(b);
  c && h.setDomain(c);
  d && h.setPort(d);
  e && h.setPath(e);
  f && h.setQueryData(f);
  g && h.setFragment(g);
  return h
};
goog.Uri.resolve = function(a, b) {
  a instanceof goog.Uri || (a = goog.Uri.parse(a));
  b instanceof goog.Uri || (b = goog.Uri.parse(b));
  return a.resolve(b)
};
goog.Uri.removeDotSegments = function(a) {
  if(a == ".." || a == ".") {
    return""
  }else {
    if(!goog.string.contains(a, "./") && !goog.string.contains(a, "/.")) {
      return a
    }else {
      for(var b = goog.string.startsWith(a, "/"), a = a.split("/"), c = [], d = 0;d < a.length;) {
        var e = a[d++];
        e == "." ? b && d == a.length && c.push("") : e == ".." ? ((c.length > 1 || c.length == 1 && c[0] != "") && c.pop(), b && d == a.length && c.push("")) : (c.push(e), b = !0)
      }
      return c.join("/")
    }
  }
};
goog.Uri.decodeOrEmpty_ = function(a) {
  return a ? decodeURIComponent(a) : ""
};
goog.Uri.encodeString_ = function(a) {
  if(goog.isString(a)) {
    return encodeURIComponent(a)
  }
  return null
};
goog.Uri.encodeSpecialRegExp_ = /^[a-zA-Z0-9\-_.!~*'():\/;?]*$/;
goog.Uri.encodeSpecialChars_ = function(a, b) {
  var c = null;
  goog.isString(a) && (c = a, goog.Uri.encodeSpecialRegExp_.test(c) || (c = encodeURI(a)), c.search(b) >= 0 && (c = c.replace(b, goog.Uri.encodeChar_)));
  return c
};
goog.Uri.encodeChar_ = function(a) {
  a = a.charCodeAt(0);
  return"%" + (a >> 4 & 15).toString(16) + (a & 15).toString(16)
};
goog.Uri.reDisallowedInSchemeOrUserInfo_ = /[#\/\?@]/g;
goog.Uri.reDisallowedInRelativePath_ = /[\#\?:]/g;
goog.Uri.reDisallowedInAbsolutePath_ = /[\#\?]/g;
goog.Uri.reDisallowedInQuery_ = /[\#\?@]/g;
goog.Uri.reDisallowedInFragment_ = /#/g;
goog.Uri.haveSameDomain = function(a, b) {
  var c = goog.uri.utils.split(a), d = goog.uri.utils.split(b);
  return c[goog.uri.utils.ComponentIndex.DOMAIN] == d[goog.uri.utils.ComponentIndex.DOMAIN] && c[goog.uri.utils.ComponentIndex.PORT] == d[goog.uri.utils.ComponentIndex.PORT]
};
goog.Uri.QueryData = function(a, b, c) {
  this.encodedQuery_ = a || null;
  this.uri_ = b || null;
  this.ignoreCase_ = !!c
};
goog.Uri.QueryData.prototype.ensureKeyMapInitialized_ = function() {
  if(!this.keyMap_ && (this.keyMap_ = new goog.structs.Map, this.encodedQuery_)) {
    for(var a = this.encodedQuery_.split("&"), b = 0;b < a.length;b++) {
      var c = a[b].indexOf("="), d = null, e = null;
      c >= 0 ? (d = a[b].substring(0, c), e = a[b].substring(c + 1)) : d = a[b];
      d = goog.string.urlDecode(d);
      d = this.getKeyName_(d);
      this.add(d, e ? goog.string.urlDecode(e) : "")
    }
  }
};
goog.Uri.QueryData.createFromMap = function(a, b, c) {
  var d = goog.structs.getKeys(a);
  if(typeof d == "undefined") {
    throw Error("Keys are undefined");
  }
  return goog.Uri.QueryData.createFromKeysValues(d, goog.structs.getValues(a), b, c)
};
goog.Uri.QueryData.createFromKeysValues = function(a, b, c, d) {
  if(a.length != b.length) {
    throw Error("Mismatched lengths for keys/values");
  }
  c = new goog.Uri.QueryData(null, c, d);
  for(d = 0;d < a.length;d++) {
    c.add(a[d], b[d])
  }
  return c
};
goog.Uri.QueryData.prototype.keyMap_ = null;
goog.Uri.QueryData.prototype.count_ = null;
goog.Uri.QueryData.decodedQuery_ = null;
goog.Uri.QueryData.prototype.getCount = function() {
  this.ensureKeyMapInitialized_();
  return this.count_
};
goog.Uri.QueryData.prototype.add = function(a, b) {
  this.ensureKeyMapInitialized_();
  this.invalidateCache_();
  a = this.getKeyName_(a);
  if(this.containsKey(a)) {
    var c = this.keyMap_.get(a);
    goog.isArray(c) ? c.push(b) : this.keyMap_.set(a, [c, b])
  }else {
    this.keyMap_.set(a, b)
  }
  this.count_++;
  return this
};
goog.Uri.QueryData.prototype.remove = function(a) {
  this.ensureKeyMapInitialized_();
  a = this.getKeyName_(a);
  if(this.keyMap_.containsKey(a)) {
    this.invalidateCache_();
    var b = this.keyMap_.get(a);
    goog.isArray(b) ? this.count_ -= b.length : this.count_--;
    return this.keyMap_.remove(a)
  }
  return!1
};
goog.Uri.QueryData.prototype.clear = function() {
  this.invalidateCache_();
  this.keyMap_ && this.keyMap_.clear();
  this.count_ = 0
};
goog.Uri.QueryData.prototype.isEmpty = function() {
  this.ensureKeyMapInitialized_();
  return this.count_ == 0
};
goog.Uri.QueryData.prototype.containsKey = function(a) {
  this.ensureKeyMapInitialized_();
  a = this.getKeyName_(a);
  return this.keyMap_.containsKey(a)
};
goog.Uri.QueryData.prototype.containsValue = function(a) {
  var b = this.getValues();
  return goog.array.contains(b, a)
};
goog.Uri.QueryData.prototype.getKeys = function() {
  this.ensureKeyMapInitialized_();
  for(var a = this.keyMap_.getValues(), b = this.keyMap_.getKeys(), c = [], d = 0;d < b.length;d++) {
    var e = a[d];
    if(goog.isArray(e)) {
      for(var f = 0;f < e.length;f++) {
        c.push(b[d])
      }
    }else {
      c.push(b[d])
    }
  }
  return c
};
goog.Uri.QueryData.prototype.getValues = function(a) {
  this.ensureKeyMapInitialized_();
  if(a) {
    if(a = this.getKeyName_(a), this.containsKey(a)) {
      var b = this.keyMap_.get(a);
      if(goog.isArray(b)) {
        return b
      }else {
        a = [], a.push(b)
      }
    }else {
      a = []
    }
  }else {
    for(var b = this.keyMap_.getValues(), a = [], c = 0;c < b.length;c++) {
      var d = b[c];
      goog.isArray(d) ? goog.array.extend(a, d) : a.push(d)
    }
  }
  return a
};
goog.Uri.QueryData.prototype.set = function(a, b) {
  this.ensureKeyMapInitialized_();
  this.invalidateCache_();
  a = this.getKeyName_(a);
  if(this.containsKey(a)) {
    var c = this.keyMap_.get(a);
    goog.isArray(c) ? this.count_ -= c.length : this.count_--
  }
  this.keyMap_.set(a, b);
  this.count_++;
  return this
};
goog.Uri.QueryData.prototype.get = function(a, b) {
  this.ensureKeyMapInitialized_();
  a = this.getKeyName_(a);
  if(this.containsKey(a)) {
    var c = this.keyMap_.get(a);
    return goog.isArray(c) ? c[0] : c
  }else {
    return b
  }
};
goog.Uri.QueryData.prototype.setValues = function(a, b) {
  this.ensureKeyMapInitialized_();
  this.invalidateCache_();
  a = this.getKeyName_(a);
  if(this.containsKey(a)) {
    var c = this.keyMap_.get(a);
    goog.isArray(c) ? this.count_ -= c.length : this.count_--
  }
  b.length > 0 && (this.keyMap_.set(a, b), this.count_ += b.length)
};
goog.Uri.QueryData.prototype.toString = function() {
  if(this.encodedQuery_) {
    return this.encodedQuery_
  }
  if(!this.keyMap_) {
    return""
  }
  for(var a = [], b = 0, c = this.keyMap_.getKeys(), d = 0;d < c.length;d++) {
    var e = c[d], f = goog.string.urlEncode(e), e = this.keyMap_.get(e);
    if(goog.isArray(e)) {
      for(var g = 0;g < e.length;g++) {
        b > 0 && a.push("&"), a.push(f), e[g] !== "" && a.push("=", goog.string.urlEncode(e[g])), b++
      }
    }else {
      b > 0 && a.push("&"), a.push(f), e !== "" && a.push("=", goog.string.urlEncode(e)), b++
    }
  }
  return this.encodedQuery_ = a.join("")
};
goog.Uri.QueryData.prototype.toDecodedString = function() {
  if(!this.decodedQuery_) {
    this.decodedQuery_ = goog.Uri.decodeOrEmpty_(this.toString())
  }
  return this.decodedQuery_
};
goog.Uri.QueryData.prototype.invalidateCache_ = function() {
  delete this.decodedQuery_;
  delete this.encodedQuery_;
  this.uri_ && delete this.uri_.cachedToString_
};
goog.Uri.QueryData.prototype.filterKeys = function(a) {
  this.ensureKeyMapInitialized_();
  goog.structs.forEach(this.keyMap_, function(b, c) {
    goog.array.contains(a, c) || this.remove(c)
  }, this);
  return this
};
goog.Uri.QueryData.prototype.clone = function() {
  var a = new goog.Uri.QueryData;
  if(this.decodedQuery_) {
    a.decodedQuery_ = this.decodedQuery_
  }
  if(this.encodedQuery_) {
    a.encodedQuery_ = this.encodedQuery_
  }
  if(this.keyMap_) {
    a.keyMap_ = this.keyMap_.clone()
  }
  return a
};
goog.Uri.QueryData.prototype.getKeyName_ = function(a) {
  a = String(a);
  this.ignoreCase_ && (a = a.toLowerCase());
  return a
};
goog.Uri.QueryData.prototype.setIgnoreCase = function(a) {
  a && !this.ignoreCase_ && (this.ensureKeyMapInitialized_(), this.invalidateCache_(), goog.structs.forEach(this.keyMap_, function(a, c) {
    var d = c.toLowerCase();
    c != d && (this.remove(c), this.add(d, a))
  }, this));
  this.ignoreCase_ = a
};
goog.Uri.QueryData.prototype.extend = function() {
  for(var a = 0;a < arguments.length;a++) {
    goog.structs.forEach(arguments[a], function(a, c) {
      this.add(c, a)
    }, this)
  }
};
webdriver.process = {};
webdriver.process.isNative = function() {
  return webdriver.process.IS_NATIVE_PROCESS_
};
goog.exportSymbol("webdriver.process.isNative", webdriver.process.isNative);
webdriver.process.nextTick = function(a) {
  webdriver.process.PROCESS_.nextTick(a)
};
goog.exportSymbol("webdriver.process.nextTick", webdriver.process.nextTick);
webdriver.process.getEnv = function(a, b) {
  var c = webdriver.process.PROCESS_.env[a];
  return goog.isDef(c) ? c : b
};
goog.exportSymbol("webdriver.process.getEnv", webdriver.process.getEnv);
webdriver.process.setEnv = function(a, b) {
  webdriver.process.PROCESS_.env[a] = b + ""
};
goog.exportSymbol("webdriver.process.setEnv", webdriver.process.setEnv);
webdriver.process.IS_NATIVE_PROCESS_ = typeof process !== "undefined";
webdriver.process.initBrowserProcess_ = function(a) {
  var b = {env:{}};
  !a && typeof window != "undefined" && (a = window);
  if(a) {
    var c = a.onerror;
    a.onerror = function(a, d, g) {
      c && c(a, d, g);
      a = Error(a);
      a.stack = a.name + ": " + a.message + "\n\t" + d + ":" + g;
      b.emit(webdriver.process.UNCAUGHT_EXCEPTION, a)
    };
    if(a.location) {
      var d = (new goog.Uri(a.location)).getQueryData();
      goog.array.forEach(d.getKeys(), function(a) {
        var c = d.getValues(a);
        b.env[a] = c.length == 0 ? "" : c.length == 1 ? c[0] : goog.json.serialize(c)
      })
    }
  }
  b.nextTick = function(a) {
    setTimeout(a, 0)
  };
  return b
};
webdriver.process.PROCESS_ = webdriver.process.IS_NATIVE_PROCESS_ ? process : webdriver.process.initBrowserProcess_();
webdriver.node = {};
webdriver.node.toSource = function() {
  return function(a) {
    webdriver.node.checkIsNative_();
    webdriver.node.source_ ? a(null, webdriver.node.source_) : require("fs").readFile(__filename, "utf-8", function(b, c) {
      a(b, webdriver.node.source_ = c)
    })
  }
}();
goog.exportSymbol("webdriver.node.toSource", webdriver.node.toSource);
webdriver.node.parseUrl_ = function(a) {
  return require("url").parse(a)
};
webdriver.node.checkIsNative_ = function() {
  if(!webdriver.process.isNative()) {
    throw Error("This operation/object may not be used in a non-native environment");
  }
};
webdriver.node.HttpClient = function(a) {
  webdriver.node.checkIsNative_();
  a = webdriver.node.parseUrl_(a);
  if(!a.hostname) {
    throw Error("Invalid server URL: " + a);
  }
  this.options_ = {host:a.hostname, path:a.pathname || "/", port:a.port}
};
webdriver.node.HttpClient.prototype.send = function(a, b) {
  var c;
  if(a.method == "POST" || a.method == "PUT") {
    c = JSON.stringify(a.data), a.headers["Content-Length"] = c.length
  }
  webdriver.node.HttpClient.sendRequest_({method:a.method, host:this.options_.host, port:this.options_.port, path:this.options_.path + a.path, headers:a.headers}, b, c)
};
webdriver.node.HttpClient.sendRequest_ = function(a, b, c) {
  var d = require("http").request(a, function(c) {
    if(c.statusCode == 302 || c.statusCode == 303) {
      var f = webdriver.node.parseUrl_(c.headers.location);
      if(!f.hostname) {
        f.hostname = a.host, f.port = a.port
      }
      d.abort();
      webdriver.node.HttpClient.sendRequest_({method:"GET", host:f.hostname, path:f.pathname + (f.search || ""), port:f.port, headers:{Accept:"application/json"}}, b)
    }else {
      var g = [];
      c.on("data", g.push.bind(g));
      c.on("end", function() {
        var a = new webdriver.http.Response(c.statusCode, c.headers, g.join("").replace(/\0/g, ""));
        b(null, a)
      })
    }
  });
  d.on("error", function(a) {
    b(Error("Unable to send request: " + a.message))
  });
  c && d.write(c);
  d.end()
};
webdriver.Builder = function() {
  this.serverUrl_ = webdriver.process.getEnv(webdriver.Builder.SERVER_URL_ENV);
  this.sessionId_ = webdriver.process.getEnv(webdriver.Builder.SESSION_ID_ENV);
  this.capabilities_ = {}
};
goog.exportSymbol("webdriver.Builder", webdriver.Builder);
webdriver.Builder.SESSION_ID_ENV = "wdsid";
goog.exportProperty(webdriver.Builder, "SESSION_ID_ENV", webdriver.Builder.SESSION_ID_ENV);
webdriver.Builder.SERVER_URL_ENV = "wdurl";
goog.exportProperty(webdriver.Builder, "SERVER_URL_ENV", webdriver.Builder.SERVER_URL_ENV);
webdriver.Builder.USE_JSONP_ENV = "wdjsonp";
goog.exportProperty(webdriver.Builder, "USE_JSONP_ENV", webdriver.Builder.USE_JSONP_ENV);
webdriver.Builder.getSessionHelper_ = function(a, b) {
  var c = goog.bind(a.execute, a, b);
  return webdriver.promise.checkedNodeCall(c).then(function(a) {
    webdriver.error.checkResponse(a);
    return new webdriver.Session(a.sessionId, a.value)
  })
};
webdriver.Builder.getSession_ = function(a, b) {
  return webdriver.Builder.getSessionHelper_(b, (new webdriver.Command(webdriver.CommandName.DESCRIBE_SESSION)).setParameter("sessionId", a))
};
webdriver.Builder.createSession_ = function(a, b) {
  return webdriver.Builder.getSessionHelper_(a, (new webdriver.Command(webdriver.CommandName.NEW_SESSION)).setParameter("desiredCapabilities", b))
};
webdriver.Builder.prototype.usingServer = function(a) {
  this.serverUrl_ = a;
  return this
};
goog.exportProperty(webdriver.Builder.prototype, "usingServer", webdriver.Builder.prototype.usingServer);
webdriver.Builder.prototype.usingSession = function(a) {
  this.sessionId_ = a;
  return this
};
goog.exportProperty(webdriver.Builder.prototype, "usingSession", webdriver.Builder.prototype.usingSession);
webdriver.Builder.prototype.withCapabilities = function(a) {
  this.capabilities_ = a;
  return this
};
goog.exportProperty(webdriver.Builder.prototype, "withCapabilities", webdriver.Builder.prototype.withCapabilities);
webdriver.Builder.prototype.build = function() {
  if(!this.serverUrl_) {
    throw Error("The remote WebDriver server URL has not been specified.");
  }
  var a = new (webdriver.process.isNative() ? webdriver.node.HttpClient : webdriver.process.getEnv(webdriver.Builder.USE_JSONP_ENV) || !webdriver.http.XhrClient.isCorsAvailable() ? webdriver.http.JsonpClient : webdriver.http.XhrClient)(this.serverUrl_), a = new webdriver.http.Executor(a), b;
  if(this.sessionId_) {
    b = webdriver.Builder.getSession_(this.sessionId_, a)
  }else {
    if(webdriver.process.isNative()) {
      b = webdriver.Builder.createSession_(a, this.capabilities_)
    }else {
      throw Error("Unable to create a new client for this browser. The WebDriver session ID has not been defined.");
    }
  }
  return new webdriver.WebDriver(b, a)
};
goog.exportProperty(webdriver.Builder.prototype, "build", webdriver.Builder.prototype.build);
;for (var key in this.webdriver) this[key] = this.webdriver[key]; delete this.webdriver;}).call(typeof exports !== 'undefined' && exports == this ? exports : this.webdriver = this.webdriver || {})
