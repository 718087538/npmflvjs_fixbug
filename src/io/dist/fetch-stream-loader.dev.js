"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports["default"] = void 0;

var _logger = _interopRequireDefault(require("../utils/logger.js"));

var _browser = _interopRequireDefault(require("../utils/browser.js"));

var _loader = require("./loader.js");

var _exception = require("../utils/exception.js");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { "default": obj }; }

function _typeof(obj) { if (typeof Symbol === "function" && typeof Symbol.iterator === "symbol") { _typeof = function _typeof(obj) { return typeof obj; }; } else { _typeof = function _typeof(obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }; } return _typeof(obj); }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (call && (_typeof(call) === "object" || typeof call === "function")) { return call; } return _assertThisInitialized(self); }

function _assertThisInitialized(self) { if (self === void 0) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return self; }

function _get(target, property, receiver) { if (typeof Reflect !== "undefined" && Reflect.get) { _get = Reflect.get; } else { _get = function _get(target, property, receiver) { var base = _superPropBase(target, property); if (!base) return; var desc = Object.getOwnPropertyDescriptor(base, property); if (desc.get) { return desc.get.call(receiver); } return desc.value; }; } return _get(target, property, receiver || target); }

function _superPropBase(object, property) { while (!Object.prototype.hasOwnProperty.call(object, property)) { object = _getPrototypeOf(object); if (object === null) break; } return object; }

function _getPrototypeOf(o) { _getPrototypeOf = Object.setPrototypeOf ? Object.getPrototypeOf : function _getPrototypeOf(o) { return o.__proto__ || Object.getPrototypeOf(o); }; return _getPrototypeOf(o); }

function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } }

function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); return Constructor; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function"); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, writable: true, configurable: true } }); if (superClass) _setPrototypeOf(subClass, superClass); }

function _setPrototypeOf(o, p) { _setPrototypeOf = Object.setPrototypeOf || function _setPrototypeOf(o, p) { o.__proto__ = p; return o; }; return _setPrototypeOf(o, p); }

/* fetch + stream IO loader. Currently working on chrome 43+.
 * fetch provides a better alternative http API to XMLHttpRequest
 *
 * fetch spec   https://fetch.spec.whatwg.org/
 * stream spec  https://streams.spec.whatwg.org/
 */
var FetchStreamLoader =
/*#__PURE__*/
function (_BaseLoader) {
  _inherits(FetchStreamLoader, _BaseLoader);

  _createClass(FetchStreamLoader, null, [{
    key: "isSupported",
    value: function isSupported() {
      try {
        // fetch + stream is broken on Microsoft Edge. Disable before build 15048.
        // see https://developer.microsoft.com/en-us/microsoft-edge/platform/issues/8196907/
        // Fixed in Jan 10, 2017. Build 15048+ removed from blacklist.
        var isWorkWellEdge = _browser["default"].msedge && _browser["default"].version.minor >= 15048;
        var browserNotBlacklisted = _browser["default"].msedge ? isWorkWellEdge : true;
        return self.fetch && self.ReadableStream && browserNotBlacklisted;
      } catch (e) {
        return false;
      }
    }
  }]);

  function FetchStreamLoader(seekHandler, config) {
    var _this;

    _classCallCheck(this, FetchStreamLoader);

    _this = _possibleConstructorReturn(this, _getPrototypeOf(FetchStreamLoader).call(this, 'fetch-stream-loader'));
    _this.TAG = 'FetchStreamLoader';
    _this._seekHandler = seekHandler;
    _this._config = config;
    _this._needStash = true;
    _this._requestAbort = false;
    _this._contentLength = null;
    _this._receivedLength = 0;
    return _this;
  }

  _createClass(FetchStreamLoader, [{
    key: "destroy",
    value: function destroy() {
      if (this.isWorking()) {
        this.abort();
      }

      _get(_getPrototypeOf(FetchStreamLoader.prototype), "destroy", this).call(this);
    }
  }, {
    key: "open",
    value: function open(dataSource, range) {
      var _this2 = this;

      this._dataSource = dataSource;
      this._range = range;
      var sourceURL = dataSource.url;

      if (this._config.reuseRedirectedURL && dataSource.redirectedURL != undefined) {
        sourceURL = dataSource.redirectedURL;
      }

      var seekConfig = this._seekHandler.getConfig(sourceURL, range);

      var headers = new self.Headers();

      if (_typeof(seekConfig.headers) === 'object') {
        var configHeaders = seekConfig.headers;

        for (var key in configHeaders) {
          if (configHeaders.hasOwnProperty(key)) {
            headers.append(key, configHeaders[key]);
          }
        }
      }

      var params = {
        method: 'GET',
        headers: headers,
        mode: 'cors',
        cache: 'default',
        // The default policy of Fetch API in the whatwg standard
        // Safari incorrectly indicates 'no-referrer' as default policy, fuck it
        referrerPolicy: 'no-referrer-when-downgrade'
      }; // add additional headers

      if (_typeof(this._config.headers) === 'object') {
        for (var _key in this._config.headers) {
          headers.append(_key, this._config.headers[_key]);
        }
      } // cors is enabled by default


      if (dataSource.cors === false) {
        // no-cors means 'disregard cors policy', which can only be used in ServiceWorker
        params.mode = 'same-origin';
      } // withCredentials is disabled by default


      if (dataSource.withCredentials) {
        params.credentials = 'include';
      } // referrerPolicy from config


      if (dataSource.referrerPolicy) {
        params.referrerPolicy = dataSource.referrerPolicy;
      } // add abort controller, by wmlgl 2019-5-10 12:21:27


      if (self.AbortController) {
        this._abortController = new self.AbortController();
        params.signal = this._abortController.signal;
      }

      this._status = _loader.LoaderStatus.kConnecting;
      self.fetch(seekConfig.url, params).then(function (res) {
        if (_this2._requestAbort) {
          _this2._requestAbort = false;
          _this2._status = _loader.LoaderStatus.kIdle;
          return;
        }

        if (res.ok && res.status >= 200 && res.status <= 299) {
          if (res.url !== seekConfig.url) {
            if (_this2._onURLRedirect) {
              var redirectedURL = _this2._seekHandler.removeURLParameters(res.url);

              _this2._onURLRedirect(redirectedURL);
            }
          }

          var lengthHeader = res.headers.get('Content-Length');

          if (lengthHeader != null) {
            _this2._contentLength = parseInt(lengthHeader);

            if (_this2._contentLength !== 0) {
              if (_this2._onContentLengthKnown) {
                _this2._onContentLengthKnown(_this2._contentLength);
              }
            }
          }

          return _this2._pump.call(_this2, res.body.getReader());
        } else {
          _this2._status = _loader.LoaderStatus.kError;

          if (_this2._onError) {
            _this2._onError(_loader.LoaderErrors.HTTP_STATUS_CODE_INVALID, {
              code: res.status,
              msg: res.statusText
            });
          } else {
            throw new _exception.RuntimeException('FetchStreamLoader: Http code invalid, ' + res.status + ' ' + res.statusText);
          }
        }
      })["catch"](function (e) {
        if (_this2._abortController && _this2._abortController.signal.aborted) {
          return;
        }

        _this2._status = _loader.LoaderStatus.kError;

        if (_this2._onError) {
          _this2._onError(_loader.LoaderErrors.EXCEPTION, {
            code: -1,
            msg: e.message
          });
        } else {
          throw e;
        }
      });
    }
  }, {
    key: "abort",
    value: function abort() {
      this._requestAbort = true;

      if (this._abortController) {
        this._abortController.abort();
      }
    }
  }, {
    key: "_pump",
    value: function _pump(reader) {
      var _this3 = this;

      // ReadableStreamReader
      return reader.read().then(function (result) {
        if (result.done) {
          // First check received length
          if (_this3._contentLength !== null && _this3._receivedLength < _this3._contentLength) {
            // Report Early-EOF
            _this3._status = _loader.LoaderStatus.kError;
            var type = _loader.LoaderErrors.EARLY_EOF;
            var info = {
              code: -1,
              msg: 'Fetch stream meet Early-EOF'
            };

            if (_this3._onError) {
              _this3._onError(type, info);
            } else {
              throw new _exception.RuntimeException(info.msg);
            }
          } else {
            // OK. Download complete
            _this3._status = _loader.LoaderStatus.kComplete;

            if (_this3._onComplete) {
              _this3._onComplete(_this3._range.from, _this3._range.from + _this3._receivedLength - 1);
            }
          }
        } else {
          if (_this3._requestAbort === true) {
            _this3._requestAbort = false;
            _this3._status = _loader.LoaderStatus.kComplete;
            return reader.cancel();
          }

          _this3._status = _loader.LoaderStatus.kBuffering;
          var chunk = result.value.buffer;
          var byteStart = _this3._range.from + _this3._receivedLength;
          _this3._receivedLength += chunk.byteLength;

          if (_this3._onDataArrival) {
            _this3._onDataArrival(chunk, byteStart, _this3._receivedLength);
          }

          _this3._pump(reader);
        }
      })["catch"](function (e) {
        if (e.code === 11 && _browser["default"].msedge) {
          // InvalidStateError on Microsoft Edge
          // Workaround: Edge may throw InvalidStateError after ReadableStreamReader.cancel() call
          // Ignore the unknown exception.
          // Related issue: https://developer.microsoft.com/en-us/microsoft-edge/platform/issues/11265202/
          return;
        }

        _this3._status = _loader.LoaderStatus.kError;
        var type = 0;
        var info = null;

        if ((e.code === 19 || e.message === 'network error') && ( // NETWORK_ERR
        _this3._contentLength === null || _this3._contentLength !== null && _this3._receivedLength < _this3._contentLength)) {
          type = _loader.LoaderErrors.EARLY_EOF;
          info = {
            code: e.code,
            msg: 'Fetch stream meet Early-EOF'
          };
        } else {
          type = _loader.LoaderErrors.EXCEPTION;
          info = {
            code: e.code,
            msg: e.message
          };
        }

        if (_this3._onError) {
          _this3._onError(type, info);
        } else {
          throw new _exception.RuntimeException(info.msg);
        }
      });
    }
  }]);

  return FetchStreamLoader;
}(_loader.BaseLoader);

var _default = FetchStreamLoader;
exports["default"] = _default;