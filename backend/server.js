import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Polymarket API endpoints
const GAMMA_API = 'https://gamma-api.polymarket.com';
const CLOB_API = 'https://clob.polymarket.com';

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Helper function to add delay between requests
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper function to calculate spread metrics for binary markets
// For Polymarket binary markets, we need to consider both Yes and No tokens
// to get the true spread
function calculateSpread(orderbookYes, orderbookNo = null) {
  if (!orderbookYes || !orderbookYes.bids || !orderbookYes.asks ||
      orderbookYes.bids.length === 0 || orderbookYes.asks.length === 0) {
    return {
      bestBid: null,
      bestAsk: null,
      spread: null,
      spreadPercentage: null
    };
  }

  const bestBidYes = parseFloat(orderbookYes.bids[0].price);
  const bestAskYes = parseFloat(orderbookYes.asks[0].price);

  console.log(`calculateSpread called: orderbookNo=${orderbookNo ? 'PROVIDED' : 'NULL'}`);
  if (orderbookNo) {
    console.log(`orderbookNo has bids: ${orderbookNo.bids ? orderbookNo.bids.length : 'NO'}, asks: ${orderbookNo.asks ? orderbookNo.asks.length : 'NO'}`);
  }

  let bestBid, bestAsk, bidSize, askSize;

  // If we have both orderbooks, calculate the effective spread
  if (orderbookNo && orderbookNo.bids && orderbookNo.asks &&
      orderbookNo.bids.length > 0 && orderbookNo.asks.length > 0) {

    const bestBidNo = parseFloat(orderbookNo.bids[0].price);
    const bestAskNo = parseFloat(orderbookNo.asks[0].price);

    console.log(`RAW PRICES: Yes bid=${bestBidYes}, ask=${bestAskYes} | No bid=${bestBidNo}, ask=${bestAskNo}`);

    // Effective best bid for Yes = max(direct bid Yes, 1 - ask No)
    // Effective best ask for Yes = min(direct ask Yes, 1 - bid No)
    const effectiveBidFromNo = 1 - bestAskNo;
    const effectiveAskFromNo = 1 - bestBidNo;

    console.log(`EFFECTIVE FROM NO: bid=${effectiveBidFromNo.toFixed(4)}, ask=${effectiveAskFromNo.toFixed(4)}`);

    bestBid = Math.max(bestBidYes, effectiveBidFromNo);
    bestAsk = Math.min(bestAskYes, effectiveAskFromNo);

    console.log(`FINAL: bestBid=${bestBid.toFixed(4)}, bestAsk=${bestAsk.toFixed(4)}, spread=${(bestAsk - bestBid).toFixed(4)}`);

    // Use size from the source that provides the best price
    bidSize = bestBid === bestBidYes ?
      parseFloat(orderbookYes.bids[0].size) :
      parseFloat(orderbookNo.asks[0].size);

    askSize = bestAsk === bestAskYes ?
      parseFloat(orderbookYes.asks[0].size) :
      parseFloat(orderbookNo.bids[0].size);

  } else {
    // Fallback to simple calculation if only one orderbook
    bestBid = bestBidYes;
    bestAsk = bestAskYes;
    bidSize = parseFloat(orderbookYes.bids[0].size);
    askSize = parseFloat(orderbookYes.asks[0].size);
  }

  const spread = bestAsk - bestBid;
  const midPrice = (bestBid + bestAsk) / 2;
  const spreadPercentage = midPrice > 0 ? (spread / midPrice) * 100 : 0;

  return {
    bestBid: parseFloat(bestBid.toFixed(4)),
    bestAsk: parseFloat(bestAsk.toFixed(4)),
    spread: parseFloat(spread.toFixed(4)),
    spreadPercentage: parseFloat(spreadPercentage.toFixed(2)),
    bidSize,
    askSize
  };
}

// Get active markets from CLOB API
app.get('/api/markets', async (req, res) => {
  try {
    const { filter, limit = 50 } = req.query;

    let url, params;

    if (filter === 'active') {
      // Use simplified-markets endpoint for active markets with order books
      url = `${CLOB_API}/sampling-simplified-markets`;
      params = new URLSearchParams();
      params.append('active', 'true');
      params.append('closed', 'false');
      params.append('limit', limit);
    } else {
      // Use regular markets endpoint for closed/all markets
      url = `${CLOB_API}/markets`;
      params = new URLSearchParams();

      if (filter === 'closed') {
        params.append('closed', 'true');
      }
    }

    const fullUrl = `${url}?${params.toString()}`;

    const response = await fetch(fullUrl);

    if (!response.ok) {
      throw new Error(`CLOB API error: ${response.status}`);
    }

    const result = await response.json();
    let markets = result.data || result;

    // Ensure we have valid markets with tokens
    markets = markets.filter(m => m.tokens && m.tokens.length > 0);

    // Take only the requested limit
    markets = markets.slice(0, parseInt(limit));

    // Enrich markets with additional data from CLOB markets endpoint if needed
    const enrichedMarkets = await Promise.all(
      markets.map(async (m) => {
        // If market doesn't have full details, try to fetch them
        if (!m.question && m.condition_id) {
          try {
            const detailResponse = await fetch(`${CLOB_API}/markets/${m.condition_id}`);
            if (detailResponse.ok) {
              const details = await detailResponse.json();
              return { ...m, ...details };
            }
          } catch (err) {
            console.error(`Error fetching details for ${m.condition_id}:`, err);
          }
        }
        return m;
      })
    );

    // Format for frontend compatibility
    const formattedMarkets = enrichedMarkets.map(m => ({
      condition_id: m.condition_id,
      question: m.question || 'Unknown Market',
      description: m.description || '',
      end_date_iso: m.end_date_iso,
      volume: m.volume || '0',
      liquidity: m.liquidity || '0',
      active: m.active !== undefined ? m.active : true,
      closed: m.closed !== undefined ? m.closed : false,
      tokens: m.tokens
    }));

    res.json(formattedMarkets);
  } catch (error) {
    console.error('Error fetching markets:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get order book for a specific token
app.get('/api/orderbook/:tokenId', async (req, res) => {
  try {
    const { tokenId } = req.params;

    // Fetch best bid and ask using /price endpoint
    const bidResponse = await fetch(`${CLOB_API}/price?token_id=${tokenId}&side=SELL`);
    const askResponse = await fetch(`${CLOB_API}/price?token_id=${tokenId}&side=BUY`);

    if (!bidResponse.ok || !askResponse.ok) {
      throw new Error(`CLOB API error: ${bidResponse.status || askResponse.status}`);
    }

    const bidData = await bidResponse.json();
    const askData = await askResponse.json();

    const bestBid = parseFloat(bidData.price);
    const bestAsk = parseFloat(askData.price);
    const spread = bestAsk - bestBid;
    const midPrice = (bestBid + bestAsk) / 2;
    const spreadPercentage = midPrice > 0 ? (spread / midPrice) * 100 : 0;

    res.json({
      bids: [{ price: bestBid.toString(), size: "0" }],
      asks: [{ price: bestAsk.toString(), size: "0" }],
      spreadMetrics: {
        bestBid: parseFloat(bestBid.toFixed(4)),
        bestAsk: parseFloat(bestAsk.toFixed(4)),
        spread: parseFloat(spread.toFixed(4)),
        spreadPercentage: parseFloat(spreadPercentage.toFixed(2))
      }
    });
  } catch (error) {
    console.error('Error fetching orderbook:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get multiple orderbooks at once
app.post('/api/orderbooks', async (req, res) => {
  try {
    const { markets } = req.body;

    if (!Array.isArray(markets)) {
      return res.status(400).json({ error: 'markets must be an array' });
    }

    // Process markets sequentially with delays to avoid rate limiting
    const allOrderbooks = {};

    for (let i = 0; i < markets.length; i++) {
      const market = markets[i];

      try {
        if (!market.tokens || market.tokens.length === 0) {
          continue;
        }

        // Fetch prices for all tokens using the /price endpoint
        for (const token of market.tokens) {
          try {
            // Fetch best bid (price when selling)
            const bidResponse = await fetch(`${CLOB_API}/price?token_id=${token.token_id}&side=SELL`);
            const askResponse = await fetch(`${CLOB_API}/price?token_id=${token.token_id}&side=BUY`);

            if (bidResponse.ok && askResponse.ok) {
              const bidData = await bidResponse.json();
              const askData = await askResponse.json();

              const bestBid = parseFloat(bidData.price);
              const bestAsk = parseFloat(askData.price);
              const spread = bestAsk - bestBid;
              const midPrice = (bestBid + bestAsk) / 2;
              const spreadPercentage = midPrice > 0 ? (spread / midPrice) * 100 : 0;

              console.log(`Token ${token.outcome} - Bid: ${bestBid}, Ask: ${bestAsk}, Spread: ${spread.toFixed(4)}`);

              allOrderbooks[token.token_id] = {
                bids: [{ price: bestBid.toString(), size: "0" }],
                asks: [{ price: bestAsk.toString(), size: "0" }],
                spreadMetrics: {
                  bestBid: parseFloat(bestBid.toFixed(4)),
                  bestAsk: parseFloat(bestAsk.toFixed(4)),
                  spread: parseFloat(spread.toFixed(4)),
                  spreadPercentage: parseFloat(spreadPercentage.toFixed(2))
                }
              };
            }

            // Small delay between token requests
            await delay(100);
          } catch (error) {
            console.error(`Error fetching prices for token ${token.token_id}:`, error);
          }
        }

        // Delay between markets to avoid rate limiting
        if (i < markets.length - 1) {
          await delay(200);
        }
      } catch (error) {
        console.error(`Error processing market ${market.condition_id}:`, error);
      }
    }

    res.json(allOrderbooks);
  } catch (error) {
    console.error('Error fetching orderbooks:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get market details
app.get('/api/market/:conditionId', async (req, res) => {
  try {
    const { conditionId } = req.params;
    const url = `${GAMMA_API}/markets/${conditionId}`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Gamma API error: ${response.status}`);
    }

    const market = await response.json();
    res.json(market);
  } catch (error) {
    console.error('Error fetching market:', error);
    res.status(500).json({ error: error.message });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`API available at http://localhost:${PORT}/api`);
});
