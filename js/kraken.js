"use strict";

module.exports = {

    'id': 'kraken',
    'name': 'Kraken',
    'countries': 'US',
    'version': '0',
    'rateLimit': 3000,
    'hasCORS': false,
    'hasFetchTickers': true,
    'hasFetchOHLCV': true,
    'hasFetchOrder': true,
    'hasFetchOpenOrders': true,
    'hasFetchClosedOrders': true,
    'hasFetchMyTrades': true,
    'hasWithdraw': true,
    'marketsByAltname': {},
    'timeframes': {
        '1m': '1',
        '5m': '5',
        '15m': '15',
        '30m': '30',
        '1h': '60',
        '4h': '240',
        '1d': '1440',
        '1w': '10080',
        '2w': '21600',
    },
    'urls': {
        'logo': 'https://user-images.githubusercontent.com/1294454/27766599-22709304-5ede-11e7-9de1-9f33732e1509.jpg',
        'api': 'https://api.kraken.com',
        'www': 'https://www.kraken.com',
        'doc': [
            'https://www.kraken.com/en-us/help/api',
            'https://github.com/nothingisdead/npm-kraken-api',
        ],
        'fees': 'https://www.kraken.com/en-us/help/fees',
    },
    'api': {
        'public': {
            'get': [
                'Assets',
                'AssetPairs',
                'Depth',
                'OHLC',
                'Spread',
                'Ticker',
                'Time',
                'Trades',
            ],
        },
        'private': {
            'post': [
                'AddOrder',
                'Balance',
                'CancelOrder',
                'ClosedOrders',
                'DepositAddresses',
                'DepositMethods',
                'DepositStatus',
                'Ledgers',
                'OpenOrders',
                'OpenPositions',
                'QueryLedgers',
                'QueryOrders',
                'QueryTrades',
                'TradeBalance',
                'TradesHistory',
                'TradeVolume',
                'Withdraw',
                'WithdrawCancel',
                'WithdrawInfo',
                'WithdrawStatus',
            ],
        },
    },

    costToPrecision (symbol, cost) {
        return this.truncate (parseFloat (cost), this.markets[symbol]['precision']['price']);
    },

    feeToPrecision (symbol, fee) {
        return this.truncate (parseFloat (fee), this.markets[symbol]['precision']['amount']);
    },

    async fetchMarkets () {
        let markets = await this.publicGetAssetPairs ();
        let keys = Object.keys (markets['result']);
        let result = [];
        for (let p = 0; p < keys.length; p++) {
            let id = keys[p];
            let market = markets['result'][id];
            let base = market['base'];
            let quote = market['quote'];
            if ((base[0] == 'X') || (base[0] == 'Z'))
                base = base.slice (1);
            if ((quote[0] == 'X') || (quote[0] == 'Z'))
                quote = quote.slice (1);
            base = this.commonCurrencyCode (base);
            quote = this.commonCurrencyCode (quote);
            let darkpool = id.indexOf ('.d') >= 0;
            let symbol = darkpool ? market['altname'] : (base + '/' + quote);
            let maker = undefined;
            if ('fees_maker' in market) {
                maker = parseFloat (market['fees_maker'][0][1]) / 100;
            }
            let precision = {
                'amount': market['lot_decimals'],
                'price': market['pair_decimals'],
            };
            let amountLimits = {
                'min': Math.pow (10, -precision['amount']),
                'max': Math.pow (10, precision['amount']),
            };
            let priceLimits = {
                'min': Math.pow (10, -precision['price']),
                'max': undefined,
            };
            let costLimits = {
                'min': 0,
                'max': undefined,
            };
            let limits = {
                'amount': amountLimits,
                'price': priceLimits,
                'cost': costLimits,
            };
            result.push ({
                'id': id,
                'symbol': symbol,
                'base': base,
                'quote': quote,
                'darkpool': darkpool,
                'info': market,
                'altname': market['altname'],
                'maker': maker,
                'taker': parseFloat (market['fees'][0][1]) / 100,
                'lot': amountLimits['min'],
                'active': true,
                'precision': precision,
                'limits': limits,
            });
        }
        result = this.appendInactiveMarkets (result);
        this.marketsByAltname = this.indexBy (result, 'altname');
        return result;
    },

    appendInactiveMarkets (result = []) {
        let precision = { 'amount': 8, 'price': 8 };
        let costLimits = { 'min': 0, 'max': undefined };
        let priceLimits = { 'min': Math.pow (10, -precision['price']), 'max': undefined };
        let amountLimits = { 'min': Math.pow (10, -precision['amount']), 'max': Math.pow (10, precision['amount']) };
        let limits = { 'amount': amountLimits, 'price': priceLimits, 'cost': costLimits };
        let defaults = {
            'darkpool': false,
            'info': undefined,
            'maker': undefined,
            'taker': undefined,
            'lot': amountLimits['min'],
            'active': false,
            'precision': precision,
            'limits': limits,
        };
        let markets = [
            { 'id': 'XXLMZEUR', 'symbol': 'XLM/EUR', 'base': 'XLM', 'quote': 'EUR', 'altname': 'XLMEUR' },
        ];
        for (let i = 0; i < markets.length; i++) {
            result.push (this.extend (defaults, markets[i]));
        }
        return result;
    },

    async fetchOrderBook (symbol, params = {}) {
        await this.loadMarkets ();
        let darkpool = symbol.indexOf ('.d') >= 0;
        if (darkpool)
            throw new ExchangeError (this.id + ' does not provide an order book for darkpool symbol ' + symbol);
        let market = this.market (symbol);
        let response = await this.publicGetDepth (this.extend ({
            'pair': market['id'],
        }, params));
        let orderbook = response['result'][market['id']];
        return this.parseOrderBook (orderbook);
    },

    parseTicker (ticker, market = undefined) {
        let timestamp = this.milliseconds ();
        let symbol = undefined;
        if (market)
            symbol = market['symbol'];
        return {
            'symbol': symbol,
            'timestamp': timestamp,
            'datetime': this.iso8601 (timestamp),
            'high': parseFloat (ticker['h'][1]),
            'low': parseFloat (ticker['l'][1]),
            'bid': parseFloat (ticker['b'][0]),
            'ask': parseFloat (ticker['a'][0]),
            'vwap': parseFloat (ticker['p'][1]),
            'open': parseFloat (ticker['o']),
            'close': undefined,
            'first': undefined,
            'last': parseFloat (ticker['c'][0]),
            'change': undefined,
            'percentage': undefined,
            'average': undefined,
            'baseVolume': parseFloat (ticker['v'][1]),
            'quoteVolume': undefined,
            'info': ticker,
        };
    },

    async fetchTickers (symbols = undefined, params = {}) {
        await this.loadMarkets ();
        let pairs = [];
        for (let s = 0; s < this.symbols.length; s++) {
            let symbol = this.symbols[s];
            let market = this.markets[symbol];
            if (market['active'])
                if (!market['darkpool'])
                    pairs.push (market['id']);
        }
        let filter = pairs.join (',');
        let response = await this.publicGetTicker (this.extend ({
            'pair': filter,
        }, params));
        let tickers = response['result'];
        let ids = Object.keys (tickers);
        let result = {};
        for (let i = 0; i < ids.length; i++) {
            let id = ids[i];
            let market = this.markets_by_id[id];
            let symbol = market['symbol'];
            let ticker = tickers[id];
            result[symbol] = this.parseTicker (ticker, market);
        }
        return result;
    },

    async fetchTicker (symbol, params = {}) {
        await this.loadMarkets ();
        let darkpool = symbol.indexOf ('.d') >= 0;
        if (darkpool)
            throw new ExchangeError (this.id + ' does not provide a ticker for darkpool symbol ' + symbol);
        let market = this.market (symbol);
        let response = await this.publicGetTicker (this.extend ({
            'pair': market['id'],
        }, params));
        let ticker = response['result'][market['id']];
        return this.parseTicker (ticker, market);
    },

    parseOHLCV (ohlcv, market = undefined, timeframe = '1m', since = undefined, limit = undefined) {
        return [
            ohlcv[0] * 1000,
            parseFloat (ohlcv[1]),
            parseFloat (ohlcv[2]),
            parseFloat (ohlcv[3]),
            parseFloat (ohlcv[4]),
            parseFloat (ohlcv[6]),
        ];
    },

    async fetchOHLCV (symbol, timeframe = '1m', since = undefined, limit = undefined, params = {}) {
        await this.loadMarkets ();
        let market = this.market (symbol);
        let request = {
            'pair': market['id'],
            'interval': this.timeframes[timeframe],
        };
        if (since)
            request['since'] = parseInt (since / 1000);
        let response = await this.publicGetOHLC (this.extend (request, params));
        let ohlcvs = response['result'][market['id']];
        return this.parseOHLCVs (ohlcvs, market, timeframe, since, limit);
    },

    parseTrade (trade, market = undefined) {
        let timestamp = undefined;
        let side = undefined;
        let type = undefined;
        let price = undefined;
        let amount = undefined;
        let id = undefined;
        let order = undefined;
        if (!market)
            market = this.findMarketByAltnameOrId (trade['pair']);
        if ('ordertxid' in trade) {
            order = trade['ordertxid'];
            id = trade['id'];
            timestamp = parseInt (trade['time'] * 1000);
            side = trade['type'];
            type = trade['ordertype'];
            price = parseFloat (trade['price']);
            amount = parseFloat (trade['vol']);
        } else {
            timestamp = parseInt (trade[2] * 1000);
            side = (trade[3] == 's') ? 'sell' : 'buy';
            type = (trade[4] == 'l') ? 'limit' : 'market';
            price = parseFloat (trade[0]);
            amount = parseFloat (trade[1]);
        }
        let symbol = (market) ? market['symbol'] : undefined;
        return {
            'id': id,
            'order': order,
            'info': trade,
            'timestamp': timestamp,
            'datetime': this.iso8601 (timestamp),
            'symbol': symbol,
            'type': type,
            'side': side,
            'price': price,
            'amount': amount,
        };
    },

    async fetchTrades (symbol, params = {}) {
        await this.loadMarkets ();
        let market = this.market (symbol);
        let id = market['id'];
        let response = await this.publicGetTrades (this.extend ({
            'pair': id,
        }, params));
        let trades = response['result'][id];
        return this.parseTrades (trades, market);
    },

    async fetchBalance (params = {}) {
        await this.loadMarkets ();
        let response = await this.privatePostBalance ();
        let balances = response['result'];
        let result = { 'info': balances };
        let currencies = Object.keys (balances);
        for (let c = 0; c < currencies.length; c++) {
            let currency = currencies[c];
            let code = currency;
            // X-ISO4217-A3 standard currency codes
            if (code[0] == 'X') {
                code = code.slice (1);
            } else if (code[0] == 'Z') {
                code = code.slice (1);
            }
            code = this.commonCurrencyCode (code);
            let balance = parseFloat (balances[currency]);
            let account = {
                'free': balance,
                'used': 0.0,
                'total': balance,
            };
            result[code] = account;
        }
        return this.parseBalance (result);
    },

    async createOrder (symbol, type, side, amount, price = undefined, params = {}) {
        await this.loadMarkets ();
        let market = this.market (symbol);
        let order = {
            'pair': market['id'],
            'type': side,
            'ordertype': type,
            'volume': this.amountToPrecision (symbol, amount),
        };
        if (type == 'limit')
            order['price'] = this.priceToPrecision (symbol, price);
        let response = await this.privatePostAddOrder (this.extend (order, params));
        let length = response['result']['txid'].length;
        let id = (length > 1) ? response['result']['txid'] : response['result']['txid'][0];
        return {
            'info': response,
            'id': id,
        };
    },

    findMarketByAltnameOrId (id) {
        let result = undefined;
        if (id in this.marketsByAltname) {
            result = this.marketsByAltname[id];
        } else if (id in this.markets_by_id) {
            result = this.markets_by_id[id];
        }
        return result;
    },

    parseOrder (order, market = undefined) {
        let description = order['descr'];
        let side = description['type'];
        let type = description['ordertype'];
        let symbol = undefined;
        if (!market)
            market = this.findMarketByAltnameOrId (description['pair']);
        let timestamp = parseInt (order['opentm'] * 1000);
        let amount = parseFloat (order['vol']);
        let filled = parseFloat (order['vol_exec']);
        let remaining = amount - filled;
        let fee = undefined;
        let cost = this.safeFloat (order, 'cost');
        let price = this.safeFloat (description, 'price');
        if (!price)
            price = this.safeFloat (order, 'price');
        if (market) {
            symbol = market['symbol'];
            if ('fee' in order) {
                let flags = order['oflags'];
                let feeCost = this.safeFloat (order, 'fee');
                fee = {
                    'cost': feeCost,
                    'rate': undefined,
                };
                if (flags.indexOf ('fciq') >= 0) {
                    fee['currency'] = market['quote'];
                } else if (flags.indexOf ('fcib') >= 0) {
                    fee['currency'] = market['base'];
                }
            }
        }
        return {
            'id': order['id'],
            'info': order,
            'timestamp': timestamp,
            'datetime': this.iso8601 (timestamp),
            'status': order['status'],
            'symbol': symbol,
            'type': type,
            'side': side,
            'price': price,
            'cost': cost,
            'amount': amount,
            'filled': filled,
            'remaining': remaining,
            'fee': fee,
            // 'trades': this.parseTrades (order['trades'], market),
        };
    },

    parseOrders (orders, market = undefined) {
        let result = [];
        let ids = Object.keys (orders);
        for (let i = 0; i < ids.length; i++) {
            let id = ids[i];
            let order = this.extend ({ 'id': id }, orders[id]);
            result.push (this.parseOrder (order, market));
        }
        return result;
    },

    async fetchOrder (id, symbol = undefined, params = {}) {
        await this.loadMarkets ();
        let response = await this.privatePostQueryOrders (this.extend ({
            'trades': true, // whether or not to include trades in output (optional, default false)
            'txid': id, // comma delimited list of transaction ids to query info about (20 maximum)
            // 'userref': 'optional', // restrict results to given user reference id (optional)
        }, params));
        let orders = response['result'];
        let order = this.parseOrder (this.extend ({ 'id': id }, orders[id]));
        return this.extend ({ 'info': response }, order);
    },

    async fetchMyTrades (symbol = undefined, params = {}) {
        await this.loadMarkets ();
        let response = await this.privatePostTradesHistory (this.extend ({
            // 'type': 'all', // any position, closed position, closing position, no position
            // 'trades': false, // whether or not to include trades related to position in output
            // 'start': 1234567890, // starting unix timestamp or trade tx id of results (exclusive)
            // 'end': 1234567890, // ending unix timestamp or trade tx id of results (inclusive)
            // 'ofs' = result offset
        }, params));
        let trades = response['result']['trades'];
        let ids = Object.keys (trades);
        for (let i = 0; i < ids.length; i++) {
            trades[ids[i]]['id'] = ids[i];
        }
        return this.parseTrades (trades);
    },

    async cancelOrder (id, symbol = undefined, params = {}) {
        await this.loadMarkets ();
        let response = undefined;
        try {
            response = await this.privatePostCancelOrder (this.extend ({
                'txid': id,
            }, params));
        } catch (e) {
            if (this.last_json_response) {
                let message = this.safeString (this.last_json_response, 'error');
                if (message.indexOf ('EOrder:Unknown order') >= 0)
                    throw new OrderNotFound (this.id + ' cancelOrder() error: ' + this.last_http_response);
            }
            throw e;
        }
        return response;
    },

    async withdraw (currency, amount, address, params = {}) {
        if ('key' in params) {
            await this.loadMarkets ();
            let response = await this.privatePostWithdraw (this.extend ({
                'asset': currency,
                'amount': amount,
                // 'address': address, // they don't allow withdrawals to direct addresses
            }, params));
            return {
                'info': response,
                'id': response['result'],
            };
        }
        throw new ExchangeError (this.id + " withdraw requires a 'key' parameter (withdrawal key name, as set up on your account)");
    },

    async fetchOpenOrders (symbol = undefined, params = {}) {
        await this.loadMarkets ();
        let response = await this.privatePostOpenOrders (params);
        let orders = this.parseOrders (response['result']['open']);
        return this.filterOrdersBySymbol (orders, symbol);
    },

    async fetchClosedOrders (symbol = undefined, params = {}) {
        await this.loadMarkets ();
        let response = await this.privatePostClosedOrders (params);
        let orders = this.parseOrders (response['result']['closed']);
        return this.filterOrdersBySymbol (orders, symbol);
    },

    sign (path, api = 'public', method = 'GET', params = {}, headers = undefined, body = undefined) {
        let url = '/' + this.version + '/' + api + '/' + path;
        if (api == 'public') {
            if (Object.keys (params).length)
                url += '?' + this.urlencode (params);
        } else {
            let nonce = this.nonce ().toString ();
            body = this.urlencode (this.extend ({ 'nonce': nonce }, params));
            let auth = this.encode (nonce + body);
            let hash = this.hash (auth, 'sha256', 'binary');
            let binary = this.stringToBinary (this.encode (url));
            let binhash = this.binaryConcat (binary, hash);
            let secret = this.base64ToBinary (this.secret);
            let signature = this.hmac (binhash, secret, 'sha512', 'base64');
            headers = {
                'API-Key': this.apiKey,
                'API-Sign': this.decode (signature),
                'Content-Type': 'application/x-www-form-urlencoded',
            };
        }
        url = this.urls['api'] + url;
        return { 'url': url, 'method': method, 'body': body, 'headers': headers };
    },

    async request (path, api = 'public', method = 'GET', params = {}, headers = undefined, body = undefined) {
        let response = await this.fetch2 (path, api, method, params, headers, body);
        if ('error' in response) {
            let numErrors = response['error'].length;
            if (numErrors) {
                for (let i = 0; i < response['error'].length; i++) {
                    if (response['error'][i] == 'EService:Unavailable')
                        throw new ExchangeNotAvailable (this.id + ' ' + this.json (response));
                }
                throw new ExchangeError (this.id + ' ' + this.json (response));
            }
        }
        return response;
    },
}