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

  let bestBid, bestAsk, bidSize, askSize;

  // If we have both orderbooks, calculate the effective spread
  if (orderbookNo && orderbookNo.bids && orderbookNo.asks &&
      orderbookNo.bids.length > 0 && orderbookNo.asks.length > 0) {

    const bestBidNo = parseFloat(orderbookNo.bids[0].price);
    const bestAskNo = parseFloat(orderbookNo.asks[0].price);

    // Effective best bid for Yes = max(direct bid Yes, 1 - ask No)
    // Effective best ask for Yes = min(direct ask Yes, 1 - bid No)
    const effectiveBidFromNo = 1 - bestAskNo;
    const effectiveAskFromNo = 1 - bestBidNo;

    bestBid = Math.max(bestBidYes, effectiveBidFromNo);
    bestAsk = Math.min(bestAskYes, effectiveAskFromNo);

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
    const url = `${CLOB_API}/book?token_id=${tokenId}`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`CLOB API error: ${response.status}`);
    }

    const orderbook = await response.json();

    // Calculate spread metrics
    const spreadMetrics = calculateSpread(orderbook);

    res.json({
      ...orderbook,
      spreadMetrics
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

    // For each market, fetch orderbooks for all tokens and calculate spread
    const orderbooks = await Promise.all(
      markets.map(async (market) => {
        try {
          if (!market.tokens || market.tokens.length === 0) {
            return {};
          }

          // Fetch orderbooks for all tokens in the market
          const tokenOrderbooks = await Promise.all(
            market.tokens.map(async (token) => {
              try {
                const url = `${CLOB_API}/book?token_id=${token.token_id}`;
                const response = await fetch(url);

                if (!response.ok) {
                  return null;
                }

                const orderbook = await response.json();
                return { outcome: token.outcome, token_id: token.token_id, orderbook };
              } catch (error) {
                console.error(`Error fetching orderbook for token ${token.token_id}:`, error);
                return null;
              }
            })
          );

          // Filter out failed fetches
          const validOrderbooks = tokenOrderbooks.filter(ob => ob !== null);

          // Build result object with orderbooks for each token
          const result = {};

          // Find Yes and No orderbooks for spread calculation
          const yesOb = validOrderbooks.find(ob => ob.outcome === 'Yes');
          const noOb = validOrderbooks.find(ob => ob.outcome === 'No');

          // For each token, add its orderbook with calculated spread
          validOrderbooks.forEach(ob => {
            const spreadMetrics = ob.outcome === 'Yes' && yesOb && noOb ?
              calculateSpread(yesOb.orderbook, noOb.orderbook) :
              ob.outcome === 'No' && yesOb && noOb ?
              // For No token, invert the spread calculation
              calculateSpread(noOb.orderbook, yesOb.orderbook) :
              // Fallback to single orderbook calculation
              calculateSpread(ob.orderbook);

            result[ob.token_id] = {
              ...ob.orderbook,
              spreadMetrics
            };
          });

          return result;
        } catch (error) {
          console.error(`Error processing market ${market.condition_id}:`, error);
          return {};
        }
      })
    );

    // Flatten the results into a single object
    const flatOrderbooks = Object.assign({}, ...orderbooks);

    res.json(flatOrderbooks);
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
