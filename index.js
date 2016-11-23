'use strict';

var Promise = require('promise');
var request = require('request');
var md5     = require('md5');
var xml2js  = require('xml2js');
var uuid    = require('uuid');


var _SIGN = "sign";
var _DEFAULT_TIMEOUT = 10*1000; // ms

var _MICROPAY_URL     = 'https://api.mch.weixin.qq.com/pay/micropay',
    _UNIFIEDORDER_URL = 'https://api.mch.weixin.qq.com/pay/unifiedorder',
    _ORDERQUERY_URL   = 'https://api.mch.weixin.qq.com/pay/orderquery',
    _REVERSE_URL      = 'https://api.mch.weixin.qq.com/secapi/pay/reverse',
    _CLOSEORDER_URL   = 'https://api.mch.weixin.qq.com/pay/closeorder',
    _REFUND_URL       = 'https://api.mch.weixin.qq.com/secapi/pay/refund',
    _REFUNDQUERY_URL  = 'https://api.mch.weixin.qq.com/pay/refundquery',
    _DOWNLOADBILL_URL = 'https://api.mch.weixin.qq.com/pay/downloadbill',
    _REPORT_URL       = 'https://api.mch.weixin.qq.com/pay/report',
    _SHORTURL_URL     = 'https://api.mch.weixin.qq.com/tools/shorturl',
    _AUTHCODETOOPENID_URL = 'https://api.mch.weixin.qq.com/tools/authcodetoopenid';

var WXPayUtil = {

  /**
   * XML 字符串转换成 object
   *
   * @param {string} xmlStr
   * @returns {Promise}
   */
  xml2obj: function (xmlStr) {
    return new Promise(function(resolve, reject){
      var parseString = xml2js.parseString;
      parseString(xmlStr, function (err, result) {
        if (err) {
          reject(err);
        }
        else {
          var data = result['xml'];
          var newData = {};
          Object.keys(data).sort().forEach(function(key, idx) {
            if (data[key].length > 0)
              newData[key] = data[key][0];
          });
          resolve(newData);
        }
      });
    });
  },

  /**
   * object 转换成 XML 字符串
   *
   * @param {object} obj
   * @returns {Promise}
   */
  obj2xml: function (obj) {
    return new Promise(function (resolve, reject) {
      var builder = new xml2js.Builder({cdata: true, rootName:'xml'});
      try {
        var xmlStr = builder.buildObject(obj);
        resolve(xmlStr);
      } catch (err) {
        reject(err);
      }
    });
  },

  /**
   * 生成签名
   *
   * @param {object} dataObj
   * @param {string} keyStr
   * @returns {Promise}
   */
  generateSignature: function (dataObj, keyStr) {
    return new Promise(function (resolve, reject) {
      var temp = '';
      Object.keys(dataObj).sort().forEach(function(key, idx) {
        if( key !== _SIGN  && dataObj[key] ){
          var value = '' + dataObj[key];
          if (value.length > 0) {
            temp += key + '=' + dataObj[key] + '&';
          }
        }
      });
      if (temp.length == 0) {
        reject(new Error('There is no data to generate signature'));
      }
      else {
        resolve( md5(temp+'key='+keyStr).toUpperCase() );
      }
    });
  },

  /**
   * 验证签名
   *
   * @param {object} dataObj
   * @param {string} keyStr
   * @returns {Promise}
   */
  isSignatureValid: function (dataObj, keyStr) {
    return new Promise(function (resolve, reject) {
      if (dataObj === null || typeof dataObj !== 'object') {
        resolve(false);
      }
      else if (!dataObj[_SIGN]) {
        resolve(false);
      }
      else {
        WXPayUtil.generateSignature(dataObj, keyStr).then(function (sign) {
          resolve(dataObj[_SIGN] === sign);
        }).catch(function (err) {
          reject(err);
        });
      }
    });
  },

  /**
   * 生成签名
   *
   * @param {object} dataObj
   * @param {string} keyStr
   * @returns {Promise}
   */
  generateSignedXml: function (dataObj, keyStr) {
    return new Promise(function (resolve, reject) {
      var clonedDataObj = JSON.parse(JSON.stringify(dataObj));
      WXPayUtil.generateSignature(clonedDataObj, keyStr).then(function (sign) {
        clonedDataObj[_SIGN] = sign;
        return WXPayUtil.obj2xml(clonedDataObj);
      }).then(function (xmlStr) {
        resolve(xmlStr);
      }).catch(function (err) {
        reject(err);
      });
    });
  },

  /**
   * 生成随机字符串
   *
   * @returns {Promise}
   */
  generateNonceStr: function () {
    return new Promise(function (resolve, reject) {
      resolve( uuid.v4().replace(/\-/g,"") );
    });
  }

};

/**
 * WXPay对象
 *
 * @param {string} appId
 * @param {string} mchId
 * @param {string} key
 * @param {string} certFileContent
 * @param {string} caFileContent
 * @param {int} timeout
 * @constructor
 */
var WXPay = function (appId, mchId, key, certFileContent, caFileContent, timeout) {
  if(!(this instanceof WXPay)) {
    throw new TypeError('Please use \'new WXPay\'');
  }
  this.APPID = appId;
  this.MCHID = mchId;
  this.KEY = key;
  this.CERT_FILE_CONTENT = certFileContent;
  this.CA_FILE_CONTENT = caFileContent;
  this.TIMEOUT = timeout || _DEFAULT_TIMEOUT;
};

/**
 * 处理HTTP请求的返回信息（主要是做签名验证），并将xml转换为object
 *
 * @param {string} respXml
 * @returns {Promise}
 */
WXPay.prototype.processResponseXml = function(respXml) {
  var self = this;
  return new Promise(function (resolve, reject) {
    WXPayUtil.xml2obj(respXml).then(function (respObj) {
      var return_code = respObj['return_code'];
      if (return_code) {
        if (return_code === 'FAIL') {
          resolve(respObj);
        }
        else {
          WXPayUtil.isSignatureValid(respObj, self.KEY).then(function (isValid) {
            if(isValid) {
              resolve(respObj);
            }
            else {
              reject(new Error('signature is not valid'));
            }
          });
        }
      }
      else {
        reject(new Error('no return_code in the response data'));
      }
    }).catch(function (err) {
      reject(err);
    });
  });
};


/**
 * 签名是否合法
 *
 * @param {string} dataObj
 * @returns {Promise}
 */
WXPay.prototype.isSignatureValid = function(dataObj) {
  var self = this;
  return WXPayUtil.isSignatureValid(dataObj, self.KEY);
};

/**
 * 生成请求数据（XML格式）
 *
 * @param {object} reqObj
 * @returns {Promise}
 */
WXPay.prototype.makeRequestBody = function (reqObj) {
  var self = this;
  return new Promise(function (resolve, reject) {
    var clonedData = JSON.parse(JSON.stringify(reqObj));
    clonedData['appid'] = self.APPID;
    clonedData['mch_id'] = self.MCHID;
    WXPayUtil.generateNonceStr().then(function (nonceStr) {
      clonedData['nonce_str'] = nonceStr;
      WXPayUtil.generateSignedXml(clonedData, self.KEY).then(function(signedXml){
        resolve(signedXml);
      }).catch(function (err) {
        reject(err);
      });
    }).catch(function (err) {
      reject(err);
    });
  });
};

/**
 * HTTP(S) 请求
 *
 * @param {string} urlStr
 * @param {object} reqObj
 * @param {int} timeout
 * @returns {Promise}
 */
WXPay.prototype.requestWithoutCert = function(urlStr, reqObj, timeout) {
  var self = this;
  return new Promise(function(resolve, reject) {
    var options = {
      url: urlStr,
      timeout: timeout || self.TIMEOUT
    };
    self.makeRequestBody(reqObj).then(function (reqXml) {
      options['body'] = reqXml;
      request.post(options, function(error, response, body) {
        if(error){
          reject(error);
        }else{
          resolve(body);
        }
      });
    }).catch(function (err) {
      reject(err);
    });
  });
};

/**
 * HTTP(S)请求，附带证书，适合申请退款等接口
 *
 * @param {string} urlStr
 * @param {object} reqObj
 * @param {int} timeout
 * @returns {Promise}
 */
WXPay.prototype.requestWithCert = function(urlStr, reqObj, timeout) {
  var self = this;
  return new Promise(function(resolve, reject) {
    var options = {
      url: urlStr,
      timeout: timeout || self.TIMEOUT,
      agentOptions: {
        ca: self.CA_FILE_CONTENT,
        pfx: self.CERT_FILE_CONTENT,
        passphrase: self.MCHID
      }
    };
    self.makeRequestBody(reqObj).then(function (reqXml) {
      options['body'] = reqXml;
      request.post(options, function(error, response, body) {
        if(error){
          reject(error);
        }else{
          resolve(body);
        }
      }).catch(function (err) {
        reject(err);
      });
    });
  });
};

/**
 * 提交刷卡支付
 *
 * @param {object} dataObj
 * @param {int} timeout
 * @returns {Promise}
 */
WXPay.prototype.microPay = function (dataObj, timeout) {
  var self = this;
  return new Promise(function (resolve, reject) {
    self.requestWithoutCert(_MICROPAY_URL, dataObj,  timeout).then(function (respXml) {
      self.processResponseXml(respXml).then(function (respObj) {
        resolve(respObj);
      }).catch(function (err) {
        reject(err);
      });
    }).catch(function (err) {
      reject(err);
    });
  });
};

/**
 * 统一下单
 *
 * @param {object} dataObj
 * @param {int} timeout
 * @returns {Promise}
 */
WXPay.prototype.unifiedOrder = function (dataObj, timeout) {
  var self = this;
  return new Promise(function (resolve, reject) {
    self.requestWithoutCert(_UNIFIEDORDER_URL, dataObj,  timeout).then(function (respXml) {
      self.processResponseXml(respXml).then(function (respObj) {
        resolve(respObj);
      }).catch(function (err) {
        reject(err);
      });
    }).catch(function (err) {
      reject(err);
    });
  });
};

/**
 * 查询订单
 *
 * @param {object} dataObj
 * @param {int} timeout
 * @returns {Promise}
 */
WXPay.prototype.orderQuery = function (dataObj, timeout) {
  var self = this;
  return new Promise(function (resolve, reject) {
    self.requestWithoutCert(_ORDERQUERY_URL, dataObj,  timeout).then(function (respXml) {
      self.processResponseXml(respXml).then(function (respObj) {
        resolve(respObj);
      }).catch(function (err) {
        reject(err);
      });
    }).catch(function (err) {
      reject(err);
    });
  });
};

/**
 * 撤销订单, 用于刷卡支付
 *
 * @param {object} dataObj
 * @param {int} timeout
 * @returns {Promise}
 */
WXPay.prototype.reverse = function (dataObj, timeout) {
  var self = this;
  return new Promise(function (resolve, reject) {
    self.requestWithCert(_REVERSE_URL, dataObj,  timeout).then(function (respXml) {
      self.processResponseXml(respXml).then(function (respObj) {
        resolve(respObj);
      }).catch(function (err) {
        reject(err);
      });
    }).catch(function (err) {
      reject(err);
    });
  });
};


/**
 * 关闭订单
 *
 * @param {object} dataObj
 * @param {int} timeout
 * @returns {Promise}
 */
WXPay.prototype.closeOrder = function (dataObj, timeout) {
  var self = this;
  return new Promise(function (resolve, reject) {
    self.requestWithoutCert(_CLOSEORDER_URL, dataObj,  timeout).then(function (respXml) {
      self.processResponseXml(respXml).then(function (respObj) {
        resolve(respObj);
      }).catch(function (err) {
        reject(err);
      });
    }).catch(function (err) {
      reject(err);
    });
  });
};


/**
 * 申请退款
 *
 * @param {object} dataObj
 * @param {int} timeout
 * @returns {Promise}
 */
WXPay.prototype.refund = function (dataObj, timeout) {
  var self = this;
  return new Promise(function (resolve, reject) {
    self.requestWithCert(_REFUND_URL, dataObj,  timeout).then(function (respXml) {
      self.processResponseXml(respXml).then(function (respObj) {
        resolve(respObj);
      }).catch(function (err) {
        reject(err);
      });
    }).catch(function (err) {
      reject(err);
    });
  });
};


/**
 * 退款查询
 *
 * @param {object} dataObj
 * @param {int} timeout
 * @returns {Promise}
 */
WXPay.prototype.refundQuery = function (dataObj, timeout) {
  var self = this;
  return new Promise(function (resolve, reject) {
    self.requestWithoutCert(_REFUNDQUERY_URL, dataObj,  timeout).then(function (respXml) {
      self.processResponseXml(respXml).then(function (respObj) {
        resolve(respObj);
      }).catch(function (err) {
        reject(err);
      });
    }).catch(function (err) {
      reject(err);
    });
  });
};

/**
 * 下载对账单
 *
 * @param {object} dataObj
 * @param {int} timeout
 * @returns {Promise}
 */
WXPay.prototype.downloadBill = function (dataObj, timeout) {
  var self = this;
  return new Promise(function (resolve, reject) {
    self.requestWithoutCert(_DOWNLOADBILL_URL, dataObj,  timeout).then(function (respStr) {
      respStr = respStr.trim();
      // console.log('downloadBill data: ', respStr);
      if (respStr.startsWith('<')) {  // XML格式，下载出错
        self.processResponseXml(respStr).then(function (respObj) {
          resolve(respObj);
        }).catch(function (err) {
          reject(err);
        });
      }
      else {   // 下载到数据了
        resolve({return_code: 'SUCCESS',
          return_msg: '',
          data: respStr
        })
      }
    }).catch(function (err) {
      reject(err);
    });
  });
};

/**
 * 交易保障
 *
 * @param {object} dataObj
 * @param {int} timeout
 * @returns {Promise}
 */
WXPay.prototype.report = function (dataObj, timeout) {
  var self = this;
  return new Promise(function (resolve, reject) {
    self.requestWithoutCert(_REPORT_URL, dataObj,  timeout).then(function (respXml) {
      self.processResponseXml(respXml).then(function (respObj) {
        resolve(respObj);
      }).catch(function (err) {
        reject(err);
      });
    }).catch(function (err) {
      reject(err);
    });
  });
};

/**
 * 转换短链接
 *
 * @param {object} dataObj
 * @param {int} timeout
 * @returns {Promise}
 */
WXPay.prototype.shortUrl = function (dataObj, timeout) {
  var self = this;
  return new Promise(function (resolve, reject) {
    self.requestWithoutCert(_SHORTURL_URL, dataObj,  timeout).then(function (respXml) {
      self.processResponseXml(respXml).then(function (respObj) {
        resolve(respObj);
      }).catch(function (err) {
        reject(err);
      });
    }).catch(function (err) {
      reject(err);
    });
  });
};

/**
 * 授权码查询 OPENID 接口
 *
 * @param {object} dataObj
 * @param {int} timeout
 * @returns {Promise}
 */
WXPay.prototype.authCodeToOpenid = function (dataObj, timeout) {
  var self = this;
  return new Promise(function (resolve, reject) {
    self.requestWithoutCert(_AUTHCODETOOPENID_URL, dataObj,  timeout).then(function (respXml) {
      self.processResponseXml(respXml).then(function (respObj) {
        resolve(respObj);
      }).catch(function (err) {
        reject(err);
      });
    }).catch(function (err) {
      reject(err);
    });
  });
};

module.exports = {
  WXPayUtil: WXPayUtil,
  WXPay: WXPay
};