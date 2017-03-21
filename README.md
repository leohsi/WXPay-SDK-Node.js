微信支付 Node.js SDK
-------

对[微信支付开发者文档](https://pay.weixin.qq.com/wiki/doc/api/index.html)中给出的API进行了封装。

WXPay类下提供了对应的方法：

|方法名 | 说明 |
|--------|--------|
|microPay| 刷卡支付 |
|unifiedOrder | 统一下单|
|orderQuery | 查询订单 |
|reverse | 撤销订单 |
|closeOrder|关闭订单|
|refund|申请退款|
|refundQuery|查询退款|
|downloadBill|下载对账单|
|report|交易保障|
|shortUrl|转换短链接|
|authCodeToOpenid|授权码查询openid|

各个方法都以Promise的形式实现。

参数为JS对象，返回类型也是JS对象。
方法内部会将参数会转换成含有`appid`、`mch_id`、`nonce_str`和`sign`的XML格式数据；
通过HTTPS请求得到返回数据后会对其做必要的处理（例如验证签名，签名错误则抛出异常）。

对于downloadBill，无论是否成功都返回JS对象，且都含有`return_code`和`return_msg`。
若成功，其中`return_code`为`SUCCESS`，另外`data`对应对账单数据。

## 安装
```
$ npm install wxpay.js --save
```

## 示例
以统一下单为例：
```js
'use strict';

var fs = require('fs');
var WXPay = require('wxpay.js').WXPay;
var WXPayConstants = require('wxpay.js').WXPayConstants;

var APPID = 'wx8888888888',
    MCHID = '8888888',
    KEY = '8888888888888888888888888888888',
    CERT_FILE_CONTENT = fs.readFileSync('/path/to/apiclient_cert.p12'),
    CA_FILE_CONTENT = fs.readFileSync('/path/to/rootca.pem'),
    TIMEOUT = 10000; // 毫秒
    
var wxpay = new WXPay({
  appId: APPID,
  mchId: MCHID,
  key: KEY,
  certFileContent: CERT_FILE_CONTENT,
  caFileContent: CA_FILE_CONTENT,
  timeout: TIMEOUT,
  signType: WXPayConstants.SIGN_TYPE_HMACSHA256,  // 使用 HMAC-SHA256 签名，也可以选择  WXPayConstants.SIGN_TYPE_MD5
  useSandbox: false   // 不使用沙箱环境
});


var reqObj = {
  body: '商城-商品1',
  out_trade_no: '1478582754970',
  total_fee: 1,
  spbill_create_ip: '123.12.12.123',
  notify_url: 'http://www.example.com/wxpay/notify',
  trade_type: 'NATIVE'
};

wxpay.unifiedOrder(reqObj).then(function(respObj) {
  console.log(respObj);
}).catch(function(err) {
  console.log(err);
});
```

## License
BSD
