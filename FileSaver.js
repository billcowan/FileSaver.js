void function(global){
  if ('DataView' in global && 'ArrayBuffer' in global) {
    return;
  }


  var hide = (function(){
    // check if we're in ES5
    if (typeof Object.getOwnPropertyNames === 'function' && !('prototype' in Object.getOwnPropertyNames)) {
      var hidden = { enumerable: false };

      return function(object, key){
        Object.defineProperty(object, key, hidden);
      };
    }

    // noop for ES3
    return function(){};
  })();

  function define(object, props){
    for (var key in props) {
      object[key] = props[key];
    }
  }


  var ArrayBuffer = global.ArrayBuffer = (function(){
    var min  = Math.min,
        max  = Math.max,
        char = String.fromCharCode;

    var chars   = {},
        indices = [];

    // create cached mapping of characters to char codes and back
    void function(){
      for (var i = 0; i < 0x100; ++i) {
        chars[indices[i] = char(i)] = i;
        if (i >= 0x80) {
          chars[char(0xf700 + i)] = i;
        }
      }
    }();

    // read a string into an array of bytes
    function readString(string){
      var array  = [],
          cycles = string.length % 8,
          index  = 0;

      while (cycles--) {
        array[index] = chars[string[index++]];
      }

      cycles = string.length >> 3;

      while (cycles--) {
        array.push(
            chars[string[index]],
            chars[string[index+1]],
            chars[string[index+2]],
            chars[string[index+3]],
            chars[string[index+4]],
            chars[string[index+5]],
            chars[string[index+6]],
            chars[string[index+7]]
        );
        index += 8;
      }

      return array;
    }

    // write an array of bytes to a string
    function writeString(array){
      try { return char.apply(null, array) } catch (e) {}

      var string = '',
          cycles = array.length % 8,
          index  = 0;

      while (cycles--) {
        string += indices[array[index++]];
      }

      cycles = array.length >> 3;

      while (cycles--) {
        string +=
            indices[array[index]] +
            indices[array[index+1]] +
            indices[array[index+2]] +
            indices[array[index+3]] +
            indices[array[index+4]] +
            indices[array[index+5]] +
            indices[array[index+6]] +
            indices[array[index+7]];
        index += 8;
      }

      return string;
    }

    // create a new array of given size where each element is 0
    function zerodArray(size){
      var data = new Array(size);

      for (var i=0; i < size; i++) {
        data[i] = 0;
      }

      return data;
    }


    // ###################
    // ### ArrayBuffer ###
    // ###################

    function ArrayBuffer(length){
      if (length instanceof ArrayBuffer) {
        this._data = length._data.slice();
      } else if (typeof length === 'string') {
        this._data = readString(length);
      } else {
        if ((length >>= 0) < 0) {
          throw new RangeError('ArrayBuffer length must be non-negative');
        }
        this._data = zerodArray(length);
      }

      this.byteLength = this._data.length;
      hide(this, '_data');
    }

    define(ArrayBuffer, {
      toByteString: function toByteString(arraybuffer){
        if (!(arraybuffer instanceof ArrayBuffer)) {
          throw new TypeError('ArrayBuffer.toByteString requires an ArrayBuffer');
        }

        return writeString(arraybuffer._data);
      }
    });

    define(ArrayBuffer.prototype, {
      slice: function slice(begin, end){
        var arraybuffer = new ArrayBuffer(0);

        arraybuffer._data = this._data.slice(begin, end);
        arraybuffer.byteLength = arraybuffer._data.length;

        return arraybuffer;
      }
    });

    return ArrayBuffer;
  })();



  global.DataView = (function(){
    var log = Math.log,
        pow = Math.pow,
        LN2 = Math.LN2;


    // Joyent copyright applies to readFloat and writeFloat

    // Copyright Joyent, Inc. and other Node contributors.
    //
    // Permission is hereby granted, free of charge, to any person obtaining a
    // copy of this software and associated documentation files (the
    // "Software"), to deal in the Software without restriction, including
    // without limitation the rights to use, copy, modify, merge, publish,
    // distribute, sublicense, and/or sell copies of the Software, and to permit
    // persons to whom the Software is furnished to do so, subject to the
    // following conditions:
    //
    // The above copyright notice and this permission notice shall be included
    // in all copies or substantial portions of the Software.
    //
    // THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
    // OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
    // MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
    // NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
    // DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
    // OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
    // USE OR OTHER DEALINGS IN THE SOFTWARE.

    function readFloat(dataview, offset, littleEndian, mLen, bytes){
      var buffer = dataview.buffer._data,
          offset = dataview.byteOffset + offset,
          e, m,
          eLen = bytes * 8 - mLen - 1,
          eMax = (1 << eLen) - 1,
          eBias = eMax >> 1,
          nBits = -7,
          i = littleEndian ? bytes - 1 : 0 ,
          d = littleEndian ? -1 : 1,
          s = buffer[offset + i];

      i += d;

      e = s & ((1 << (-nBits)) - 1);
      s >>= (-nBits);
      nBits += eLen;
      for (; nBits > 0; e = e * 0x100 + buffer[offset + i], i += d, nBits -= 8);

      m = e & ((1 << (-nBits)) - 1);
      e >>= (-nBits);
      nBits += mLen;
      for (; nBits > 0; m = m * 0x100 + buffer[offset + i], i += d, nBits -= 8);

      if (e === 0) {
        e = 1 - eBias;
      } else if (e === eMax) {
        return m ? NaN : s ? -Infinity : Infinity;
      } else {
        m = m + pow(2, mLen);
        e = e - eBias;
      }
      return (s ? -1 : 1) * m * pow(2, e - mLen);
    }

    function writeFloat(dataview, offset, value, littleEndian, mLen, bytes){
      var buffer = dataview.buffer._data,
          offset = dataview.byteOffset + offset,
          e, m, c,
          eLen = bytes * 8 - mLen - 1,
          eMax = (1 << eLen) - 1,
          eBias = eMax >> 1,
          rt = (mLen === 23 ? pow(2, -24) - pow(2, -77) : 0),
          i = littleEndian ? 0 : bytes - 1,
          d = littleEndian ? 1 : -1,
          s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0;

      value < 0 && (value = -value);

      if (value !== value || value === Infinity) {
        m = value !== value ? 1 : 0;
        e = eMax;
      } else {
        e = (log(value) / LN2) | 0;
        if (value * (c = pow(2, -e)) < 1) {
          e--;
          c *= 2;
        }
        if (e + eBias >= 1) {
          value += rt / c;
        } else {
          value += rt * pow(2, 1 - eBias);
        }
        if (value * c >= 2) {
          e++;
          c /= 2;
        }

        if (e + eBias >= eMax) {
          m = 0;
          e = eMax;
        } else if (e + eBias >= 1) {
          m = (value * c - 1) * pow(2, mLen);
          e = e + eBias;
        } else {
          m = value * pow(2, eBias - 1) * pow(2, mLen);
          e = 0;
        }
      }

      for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 0x100, mLen -= 8);

      e = (e << mLen) | m;
      eLen += mLen;
      for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 0x100, eLen -= 8);

      buffer[offset + i - d] |= s * 0x80;
    }


    var le2 = [1, 0],
        le4 = [3, 2, 1, 0],
        be2 = [0, 1],
        be4 = [0, 1, 2, 3];

    function readUint8(dataview, byteOffset){
      var buffer = dataview.buffer._data,
          offset = byteOffset + dataview.byteOffset;

      return buffer[offset];
    }

    function readUint16(dataview, byteOffset, littleEndian){
      var buffer = dataview.buffer._data,
          offset = byteOffset + dataview.byteOffset,
          order  = littleEndian ? le2 : be2;

      var b0 = buffer[offset + order[0]],
          b1 = buffer[offset + order[1]] << 8;

      return b0 | b1;
    }

    function readUint32(dataview, byteOffset, littleEndian){
      var buffer = dataview.buffer._data,
          offset = byteOffset + dataview.byteOffset,
          order  = littleEndian ? le4 : be4;

      var b0 = buffer[offset + order[0]],
          b1 = buffer[offset + order[1]] << 8,
          b2 = buffer[offset + order[2]] << 16,
          b3 = buffer[offset + order[3]] << 24;

      return b0 | b1 | b2 | b3;
    }


    function boundsCheck(offset, size, max){
      if (offset < 0) {
        throw new RangeError('Tried to write to a negative index');
      } else if (offset + size > max) {
        throw new RangeError('Tried to write '+size+' bytes past the end of a buffer at index '+offset+' of '+max);
      }
    }


    function writeUint8(dataview, byteOffset, value){
      var buffer = dataview.buffer._data,
          offset = byteOffset + dataview.byteOffset;

      boundsCheck(offset, 1, buffer.length);

      buffer[offset] = value & 0xff;
    }

    function writeUint16(dataview, byteOffset, value, littleEndian){
      var buffer = dataview.buffer._data,
          order  = littleEndian ? le2 : be2,
          offset = byteOffset + dataview.byteOffset;

      boundsCheck(offset, 2, buffer.length);

      buffer[offset + order[0]] = value & 0xff;
      buffer[offset + order[1]] = value >>> 8 & 0xff;
    }

    function writeUint32(dataview, byteOffset, value, littleEndian){
      var buffer = dataview.buffer._data,
          order  = littleEndian ? le4 : be4,
          offset = byteOffset + dataview.byteOffset;

      boundsCheck(offset, 4, buffer.length);

      buffer[offset + order[0]] = value & 0xff;
      buffer[offset + order[1]] = value >>> 8 & 0xff;
      buffer[offset + order[2]] = value >>> 16 & 0xff;
      buffer[offset + order[3]] = value >>> 24 & 0xff;
    }



    // ################
    // ### DataView ###
    // ################

    function DataView(buffer, byteOffset, byteLength){
      if (!(buffer instanceof ArrayBuffer)) {
        throw new TypeError('DataView must be initialized with an ArrayBuffer');
      }

      if (byteOffset === undefined) {
        this.byteOffset = buffer.byteOffset >> 0;
      } else {
        this.byteOffset = byteOffset >> 0;
      }

      if (this.byteOffset < 0) {
        throw new RangeError('DataView byteOffset must be non-negative');
      }


      if (byteLength === undefined) {
        this.byteLength = (buffer.byteLength - this.byteOffset) >> 0;
      } else {
        this.byteLength = byteLength >> 0;
      }

      if (this.byteLength < 0) {
        throw new RangeError('DataView byteLength must be non-negative');
      }


      if (this.byteOffset + this.byteLength > buffer.byteLength) {
        throw new RangeError('DataView byteOffset and byteLength greater than ArrayBuffer byteLength');
      }

      this.buffer = buffer;
    }

    define(DataView.prototype, {
      getFloat32: function getFloat32(byteOffset, littleEndian){
        return readFloat(this, byteOffset, littleEndian, 23, 4);
      },
      getFloat64: function getFloat64(byteOffset, littleEndian){
        return readFloat(this, byteOffset, littleEndian, 52, 8);
      },
      getInt8: function getInt8(byteOffset){
        var n = readUint8(this, byteOffset);
        return n & 0x80 ? n ^ -0x100 : n;
      },
      getInt16: function getInt16(byteOffset, littleEndian){
        var n = readUint16(this, byteOffset, littleEndian);
        return n & 0x8000 ? n ^ -0x10000 : n;
      },
      getInt32: function getInt32(byteOffset, littleEndian){
        var n = readUint32(this, byteOffset, littleEndian);
        return n & 0x80000000 ? n ^ -0x100000000 : n;
      },
      getUint8: function getUint8(byteOffset){
        return readUint8(this, byteOffset);
      },
      getUint16: function getUint16(byteOffset, littleEndian){
        return readUint16(this, byteOffset, littleEndian);
      },
      getUint32: function getUint32(byteOffset, littleEndian){
        return readUint32(this, byteOffset, littleEndian);
      },
      setFloat32: function setFloat32(byteOffset, value, littleEndian){
        writeFloat(this, byteOffset, value, littleEndian, 23, 4);
      },
      setFloat64: function setFloat64(byteOffset, value, littleEndian){
        writeFloat(this, byteOffset, value, littleEndian, 52, 8);
      },
      setInt8: function setInt8(byteOffset, value){
        writeUint8(this, byteOffset, value < 0 ? value | 0x100 : value);
      },
      setInt16: function setInt16(byteOffset, value, littleEndian){
        writeUint16(this, byteOffset, value < 0 ? value | 0x10000 : value, littleEndian);
      },
      setInt32: function setInt32(byteOffset, value, littleEndian){
        writeUint32(this, byteOffset, value < 0 ? value | 0x100000000 : value, littleEndian);
      },
      setUint8: function setUint8(byteOffset, value){
        writeUint8(this, byteOffset, value);
      },
      setUint16: function setUint16(byteOffset, value, littleEndian){
        writeUint16(this, byteOffset, value, littleEndian);
      },
      setUint32: function setUint32(byteOffset, value, littleEndian){
        writeUint32(this, byteOffset, value, littleEndian);
      }
    });

    return DataView;
  })();
}((0,eval)('this'));
/* Blob.js
 * A Blob implementation.
 * 2014-07-24
 *
 * By Eli Grey, http://eligrey.com
 * By Devin Samarin, https://github.com/dsamarin
 * License: X11/MIT
 *   See https://github.com/eligrey/Blob.js/blob/master/LICENSE.md
 */

/*global self, unescape */
/*jslint bitwise: true, regexp: true, confusion: true, es5: true, vars: true, white: true,
 plusplus: true */

/*! @source http://purl.eligrey.com/github/Blob.js/blob/master/Blob.js */

(function (view) {
  "use strict";

  view.URL = view.URL || view.webkitURL;

  if (view.Blob && view.URL) {
    try {
      new Blob;
      return;
    } catch (e) {}
  }

  // Internally we use a BlobBuilder implementation to base Blob off of
  // in order to support older browsers that only have BlobBuilder
  var BlobBuilder = view.BlobBuilder || view.WebKitBlobBuilder || view.MozBlobBuilder || (function(view) {
        var
            get_class = function(object) {
              return Object.prototype.toString.call(object).match(/^\[object\s(.*)\]$/)[1];
            }
            , FakeBlobBuilder = function BlobBuilder() {
              this.data = [];
            }
            , FakeBlob = function Blob(data, type, encoding) {
              this.data = data;
              this.size = data.length;
              this.type = type;
              this.encoding = encoding;
            }
            , FBB_proto = FakeBlobBuilder.prototype
            , FB_proto = FakeBlob.prototype
            , FileReaderSync = view.FileReaderSync
            , FileException = function(type) {
              this.code = this[this.name = type];
            }
            , file_ex_codes = (
                "NOT_FOUND_ERR SECURITY_ERR ABORT_ERR NOT_READABLE_ERR ENCODING_ERR "
                + "NO_MODIFICATION_ALLOWED_ERR INVALID_STATE_ERR SYNTAX_ERR"
            ).split(" ")
            , file_ex_code = file_ex_codes.length
            , real_URL = view.URL || view.webkitURL || view
            , real_create_object_URL = real_URL.createObjectURL
            , real_revoke_object_URL = real_URL.revokeObjectURL
            , URL = real_URL
            , btoa = view.btoa
            , atob = view.atob

            , ArrayBuffer = view.ArrayBuffer
            , Uint8Array = view.Uint8Array

            , origin = /^[\w-]+:\/*\[?[\w\.:-]+\]?(?::[0-9]+)?/
            ;
        FakeBlob.fake = FB_proto.fake = true;
        while (file_ex_code--) {
          FileException.prototype[file_ex_codes[file_ex_code]] = file_ex_code + 1;
        }
        // Polyfill URL
        if (!real_URL.createObjectURL) {
          URL = view.URL = function(uri) {
            var
                uri_info = document.createElementNS("http://www.w3.org/1999/xhtml", "a")
                , uri_origin
                ;
            uri_info.href = uri;
            if (!("origin" in uri_info)) {
              if (uri_info.protocol.toLowerCase() === "data:") {
                uri_info.origin = null;
              } else {
                uri_origin = uri.match(origin);
                uri_info.origin = uri_origin && uri_origin[1];
              }
            }
            return uri_info;
          };
        }
        URL.createObjectURL = function(blob) {
          var
              type = blob.type
              , data_URI_header
              ;
          if (type === null) {
            type = "application/octet-stream";
          }
          if (blob instanceof FakeBlob) {
            data_URI_header = "data:" + type;
            if (blob.encoding === "base64") {
              return data_URI_header + ";base64," + blob.data;
            } else if (blob.encoding === "URI") {
              return data_URI_header + "," + decodeURIComponent(blob.data);
            } if (btoa) {
              return data_URI_header + ";base64," + btoa(blob.data);
            } else {
              return data_URI_header + "," + encodeURIComponent(blob.data);
            }
          } else if (real_create_object_URL) {
            return real_create_object_URL.call(real_URL, blob);
          }
        };
        URL.revokeObjectURL = function(object_URL) {
          if (object_URL.substring(0, 5) !== "data:" && real_revoke_object_URL) {
            real_revoke_object_URL.call(real_URL, object_URL);
          }
        };
        FBB_proto.append = function(data/*, endings*/) {
          var bb = this.data;
          // decode data to a binary string
          if (Uint8Array && (data instanceof ArrayBuffer || data instanceof Uint8Array)) {
            var
                str = ""
                , buf = new Uint8Array(data)
                , i = 0
                , buf_len = buf.length
                ;
            for (; i < buf_len; i++) {
              str += String.fromCharCode(buf[i]);
            }
            bb.push(str);
          } else if (get_class(data) === "Blob" || get_class(data) === "File") {
            if (FileReaderSync) {
              var fr = new FileReaderSync;
              bb.push(fr.readAsBinaryString(data));
            } else {
              // async FileReader won't work as BlobBuilder is sync
              throw new FileException("NOT_READABLE_ERR");
            }
          } else if (data instanceof FakeBlob) {
            if (data.encoding === "base64" && atob) {
              bb.push(atob(data.data));
            } else if (data.encoding === "URI") {
              bb.push(decodeURIComponent(data.data));
            } else if (data.encoding === "raw") {
              bb.push(data.data);
            }
          } else {
            if (typeof data !== "string") {
              data += ""; // convert unsupported types to strings
            }
            // decode UTF-16 to binary string
            bb.push(unescape(encodeURIComponent(data)));
          }
        };
        FBB_proto.getBlob = function(type) {
          if (!arguments.length) {
            type = null;
          }
          return new FakeBlob(this.data.join(""), type, "raw");
        };
        FBB_proto.toString = function() {
          return "[object BlobBuilder]";
        };
        FB_proto.slice = function(start, end, type) {
          var args = arguments.length;
          if (args < 3) {
            type = null;
          }
          return new FakeBlob(
              this.data.slice(start, args > 1 ? end : this.data.length)
              , type
              , this.encoding
          );
        };
        FB_proto.toString = function() {
          return "[object Blob]";
        };
        FB_proto.close = function() {
          this.size = 0;
          delete this.data;
        };
        return FakeBlobBuilder;
      }(view));

  view.Blob = function(blobParts, options) {
    var type = options ? (options.type || "") : "";
    var builder = new BlobBuilder();
    if (blobParts) {
      for (var i = 0, len = blobParts.length; i < len; i++) {
        if (Uint8Array && blobParts[i] instanceof Uint8Array) {
          builder.append(blobParts[i].buffer);
        }
        else {
          builder.append(blobParts[i]);
        }
      }
    }
    var blob = builder.getBlob(type);
    if (!blob.slice && blob.webkitSlice) {
      blob.slice = blob.webkitSlice;
    }
    return blob;
  };

  var getPrototypeOf = Object.getPrototypeOf || function(object) {
        return object.__proto__;
      };
  view.Blob.prototype = getPrototypeOf(new view.Blob());
}(typeof self !== "undefined" && self || typeof window !== "undefined" && window || this.content || this));

/* FileSaver.js
 * A saveAs() FileSaver implementation.
 * 1.1.20150716
 *
 * By Eli Grey, http://eligrey.com
 * License: X11/MIT
 *   See https://github.com/eligrey/FileSaver.js/blob/master/LICENSE.md
 */

/*global self */
/*jslint bitwise: true, indent: 4, laxbreak: true, laxcomma: true, smarttabs: true, plusplus: true */

/*! @source http://purl.eligrey.com/github/FileSaver.js/blob/master/FileSaver.js */

var saveAs = saveAs || (function(view) {
	"use strict";

			var doc;

	// IE <10 is explicitly unsupported
	if (typeof navigator !== "undefined" && /MSIE [1-8]\./.test(navigator.userAgent)) {
		return;
	} else if (typeof navigator !== "undefined" && /MSIE [9]\./.test(navigator.userAgent)) {
    // IE9 doesn't support typed arrays (which we need for this to work)
    (function() {
      try {
        var a = new Uint8Array(1);
        return; //no need
      } catch(e) { }

      function subarray(start, end) {
        return this.slice(start, end);
      }

      function set_(array, offset) {
        if (arguments.length < 2) offset = 0;
        for (var i = 0, n = array.length; i < n; ++i, ++offset)
          this[offset] = array[i] & 0xFF;
      }

      // we need typed arrays
      function TypedArray(arg1) {
        var result;
        if (typeof arg1 === "number") {
          result = new Array(arg1);
          for (var i = 0; i < arg1; ++i)
            result[i] = 0;
        } else
          result = arg1.slice(0);
        result.subarray = subarray;
        result.buffer = result;
        result.byteLength = result.length;
        result.set = set_;
        if (typeof arg1 === "object" && arg1.buffer)
          result.buffer = arg1.buffer;

        return result;
      }

      window.Uint8Array = TypedArray;
      window.Uint32Array = TypedArray;
      window.Int32Array = TypedArray;
    })();
		// IE 9 will try to use execCommand to save the file
		return function (data, filename) {
      var w = window.open();
      doc = w.document;

      doc.open(mimetype, 'replace');
      doc.charset = "utf-8";
      doc.write(data);
      doc.close();
      doc.execCommand("SaveAs", null, filename);
    };
	}

			doc = view.document
		  // only get URL when necessary in case Blob.js hasn't overridden it yet
		var get_URL = function() {
			return view.URL || view.webkitURL || view;
		}
		, save_link = doc.createElementNS("http://www.w3.org/1999/xhtml", "a")
		, can_use_save_link = "download" in save_link
		, click = function(node) {
			var event = new MouseEvent("click");
			node.dispatchEvent(event);
		}
		, webkit_req_fs = view.webkitRequestFileSystem
		, req_fs = view.requestFileSystem || webkit_req_fs || view.mozRequestFileSystem
		, throw_outside = function(ex) {
			(view.setImmediate || view.setTimeout)(function() {
				throw ex;
			}, 0);
		}
		, force_saveable_type = "application/octet-stream"
		, fs_min_size = 0
		// See https://code.google.com/p/chromium/issues/detail?id=375297#c7 and
		// https://github.com/eligrey/FileSaver.js/commit/485930a#commitcomment-8768047
		// for the reasoning behind the timeout and revocation flow
		, arbitrary_revoke_timeout = 500 // in ms
		, revoke = function(file) {
			var revoker = function() {
				if (typeof file === "string") { // file is an object URL
					get_URL().revokeObjectURL(file);
				} else { // file is a File
					file.remove();
				}
			};
			if (view.chrome) {
				revoker();
			} else {
				setTimeout(revoker, arbitrary_revoke_timeout);
			}
		}
		, dispatch = function(filesaver, event_types, event) {
			event_types = [].concat(event_types);
			var i = event_types.length;
			while (i--) {
				var listener = filesaver["on" + event_types[i]];
				if (typeof listener === "function") {
					try {
						listener.call(filesaver, event || filesaver);
					} catch (ex) {
						throw_outside(ex);
					}
				}
			}
		}
		, auto_bom = function(blob) {
			// prepend BOM for UTF-8 XML and text/* types (including HTML)
			if (/^\s*(?:text\/\S*|application\/xml|\S*\/\S*\+xml)\s*;.*charset\s*=\s*utf-8/i.test(blob.type)) {
				return new Blob(["\ufeff", blob], {type: blob.type});
			}
			return blob;
		}
		, FileSaver = function(blob, name, no_auto_bom) {
			if (!no_auto_bom) {
				blob = auto_bom(blob);
			}
			// First try a.download, then web filesystem, then object URLs
			var
				  filesaver = this
				, type = blob.type
				, blob_changed = false
				, object_url
				, target_view
				, dispatch_all = function() {
					dispatch(filesaver, "writestart progress write writeend".split(" "));
				}
				// on any filesys errors revert to saving with object URLs
				, fs_error = function() {
					// don't create more object URLs than needed
					if (blob_changed || !object_url) {
						object_url = get_URL().createObjectURL(blob);
					}
					if (target_view) {
						target_view.location.href = object_url;
					} else {
						var new_tab = view.open(object_url, "_blank");
						if (new_tab == undefined && typeof safari !== "undefined") {
							//Apple do not allow window.open, see http://bit.ly/1kZffRI
							view.location.href = object_url
						}
					}
					filesaver.readyState = filesaver.DONE;
					dispatch_all();
					revoke(object_url);
				}
				, abortable = function(func) {
					return function() {
						if (filesaver.readyState !== filesaver.DONE) {
							return func.apply(this, arguments);
						}
					};
				}
				, create_if_not_found = {create: true, exclusive: false}
				, slice
			;
			filesaver.readyState = filesaver.INIT;
			if (!name) {
				name = "download";
			}
			if (can_use_save_link) {
				object_url = get_URL().createObjectURL(blob);
				save_link.href = object_url;
				save_link.download = name;
				setTimeout(function() {
					click(save_link);
					dispatch_all();
					revoke(object_url);
					filesaver.readyState = filesaver.DONE;
				});
				return;
			}
			// Object and web filesystem URLs have a problem saving in Google Chrome when
			// viewed in a tab, so I force save with application/octet-stream
			// http://code.google.com/p/chromium/issues/detail?id=91158
			// Update: Google errantly closed 91158, I submitted it again:
			// https://code.google.com/p/chromium/issues/detail?id=389642
			if (view.chrome && type && type !== force_saveable_type) {
				slice = blob.slice || blob.webkitSlice;
				blob = slice.call(blob, 0, blob.size, force_saveable_type);
				blob_changed = true;
			}
			// Since I can't be sure that the guessed media type will trigger a download
			// in WebKit, I append .download to the filename.
			// https://bugs.webkit.org/show_bug.cgi?id=65440
			if (webkit_req_fs && name !== "download") {
				name += ".download";
			}
			if (type === force_saveable_type || webkit_req_fs) {
				target_view = view;
			}
			if (!req_fs) {
				fs_error();
				return;
			}
			fs_min_size += blob.size;
			req_fs(view.TEMPORARY, fs_min_size, abortable(function(fs) {
				fs.root.getDirectory("saved", create_if_not_found, abortable(function(dir) {
					var save = function() {
						dir.getFile(name, create_if_not_found, abortable(function(file) {
							file.createWriter(abortable(function(writer) {
								writer.onwriteend = function(event) {
									target_view.location.href = file.toURL();
									filesaver.readyState = filesaver.DONE;
									dispatch(filesaver, "writeend", event);
									revoke(file);
								};
								writer.onerror = function() {
									var error = writer.error;
									if (error.code !== error.ABORT_ERR) {
										fs_error();
									}
								};
								"writestart progress write abort".split(" ").forEach(function(event) {
									writer["on" + event] = filesaver["on" + event];
								});
								writer.write(blob);
								filesaver.abort = function() {
									writer.abort();
									filesaver.readyState = filesaver.DONE;
								};
								filesaver.readyState = filesaver.WRITING;
							}), fs_error);
						}), fs_error);
					};
					dir.getFile(name, {create: false}, abortable(function(file) {
						// delete file if it already exists
						file.remove();
						save();
					}), abortable(function(ex) {
						if (ex.code === ex.NOT_FOUND_ERR) {
							save();
						} else {
							fs_error();
						}
					}));
				}), fs_error);
			}), fs_error);
		}
		, FS_proto = FileSaver.prototype
		, saveAs = function(blob, name, no_auto_bom) {
			return new FileSaver(blob, name, no_auto_bom);
		}
	;
	// IE 10+ (native saveAs)
	if (typeof navigator !== "undefined" && navigator.msSaveOrOpenBlob) {
		return function(blob, name, no_auto_bom) {
			if (!no_auto_bom) {
				blob = auto_bom(blob);
			}
			return navigator.msSaveOrOpenBlob(blob, name || "download");
		};
	}

	FS_proto.abort = function() {
		var filesaver = this;
		filesaver.readyState = filesaver.DONE;
		dispatch(filesaver, "abort");
	};
	FS_proto.readyState = FS_proto.INIT = 0;
	FS_proto.WRITING = 1;
	FS_proto.DONE = 2;

	FS_proto.error =
	FS_proto.onwritestart =
	FS_proto.onprogress =
	FS_proto.onwrite =
	FS_proto.onabort =
	FS_proto.onerror =
	FS_proto.onwriteend =
		null;

	return saveAs;
}(
	   typeof self !== "undefined" && self
	|| typeof window !== "undefined" && window
	|| this.content
));
// `self` is undefined in Firefox for Android content script context
// while `this` is nsIContentFrameMessageManager
// with an attribute `content` that corresponds to the window

if (typeof module !== "undefined" && module.exports) {
  module.exports.saveAs = saveAs;
} else if ((typeof define !== "undefined" && define !== null) && (define.amd != null)) {
  define([], function() {
    return saveAs;
  });
}
