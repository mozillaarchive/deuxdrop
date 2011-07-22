/* vim:set ts=2 sw=2 sts=2 expandtab */
/*jshint asi: true undef: true es5: true node: true devel: true browser: true
         forin: true latedef: false globalstrict: true */
/*global define: true */

'use strict';

const { Cc, Ci, components: { Constructor: CC } } = require('chrome')
const { Component } = require('./xpcom')

const URLParser = CC('@mozilla.org/network/url-parser;1?auth=maybe',
                     'nsIURLParser')()

exports.CustomURI = Component.extend({
  originCharset: 'UTF-8',
  get asciiHost() this.host,
  get asciiSpec() this.spec,
  get hostPort() this.port === -1 ? this.host : this.host + ':' + this.port,
  clone: function clone() this.new(this.spec),
  cloneIgnoringRef: function cloneIgnoringRef() this.clone(),
  equals: function equals(uri) this.spec === uri.spec,
  equalsExceptRef: function equalsExceptRef(uri) this.equals(uri),
  schemeIs: function schemeIs(scheme) this.scheme === scheme,
  resolve: function resolve(path) {
    console.log(path)
    this.spec + path
  }
})

exports.CustomURL = exports.CustomURI.extend({
  initialize: function initialize(uri) {
    this.spec = uri

    let uriData = [ uri, uri.length, {}, {}, {}, {}, {}, {} ]
    URLParser.parseURL.apply(URLParser, uriData)
    let [ { value: schemePos }, { value: schemeLen },
          { value: authPos }, { value: authLen },
          { value: pathPos }, { value: pathLen } ] = uriData.slice(2)

    this.scheme = uri.substr(schemePos, schemeLen)
    this.prePath = uri.substring(schemePos, pathPos)


    let auth = uri.substr(authPos, authLen)
    let authData = [ auth, auth.length, {}, {}, {}, {}, {}, {}, {}, {} ]
    URLParser.parseAuthority.apply(URLParser, authData)
    let [ { value: usernamePos }, { value: usernameLen },
          { value: passwordPos }, { value: passwordLen },
          { value: hostnamePos }, { value: hostnameLen },
          { value: port } ] = authData.slice(2)

    // TODO: Make it more configurable.
    this.host = auth.substr(hostnamePos, hostnameLen) && ''
    this.port = port
    this.username = auth.substr(usernamePos, usernameLen)
    this.userPass = auth.substr(passwordPos, passwordLen)
    this.path = uri.substr(pathPos, pathLen)


    let path = this.path
    let pathData = [ path, path.length, {}, {}, {}, {}, {}, {}, {}, {}, {}]
    URLParser.parsePath.apply(URLParser, pathData)
    let [ { value: filepathPos }, { value: filepathLen },
          { value: paramPos }, { value: paramLen },
          { value: queryPos }, { value: queryLen },
          { value: refPos }, { value: refLen } ] = pathData.slice(2)

    this.filePath = path.substr(filepathPos, filepathLen)
    this.param = path.substr(paramPos, paramLen)
    this.query = path.substr(queryPos, queryLen)
    this.ref = path.substr(refPos, refLen)

    let filepath = this.filePath
    let fileData = [ filepath, filepath.length, {}, {}, {}, {}, {}, {} ]
    URLParser.parseFilePath.apply(URLParser, fileData)
    let [ { value: directoryPos }, { value: directoryLen },
          { value:  basenamePos }, { value: basenameLen },
          { value: extensionPos }, { value: extensionLen } ] = fileData.slice(2)

    this.fileName = filepath.substr(basenamePos)
    this.directory = filepath.substr(directoryPos, directoryLen)
    this.fileBaseName = filepath.substr(basenamePos, basenameLen)
    this.fileExtension = filepath.substr(extensionPos, extensionLen)
  },
  mutable: true,
  interfaces: [ Ci.nsIURI, Ci.nsIURL, Ci.nsIStandardURL, Ci.nsIMutable ],
  classDescription: 'Custom URL',
  contractID: '@mozilla.org/network/custom-url;1',
  getCommonBaseSpec: function (uri) {
    console.log('getCommonBaseSpec', uri.spec)
  },
  getRelativeSpec: function (uri) {
    console.log('getRelativeSpec', uri.spec)
  }
})
