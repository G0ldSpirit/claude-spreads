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
app.use(express.json());

// Helper function to calculate spread metrics
function calculateSpread(orderbook) {
  if (!orderbook || !orderbook.bids || !orderbook.asks ||
      orderbook.bids.length === 0 || orderbook.asks.length === 0) {
    return {
      bestBid: null,
      bestAsk: null,
      spread: null,
      spreadPercentage: null
    };
  }

  const bestBid = parseFloat(orderbook.bids[0].price);
  const bestAsk = parseFloat(orderbook.asks[0].price);
  const spread = bestAsk - bestBid;
  const midPrice = (bestBid + bestAsk) / 2;
  const spreadPercentage = midPrice > 0 ? (spread / midPrice) * 100 : 0;

  return {
    bestBid,
    bestAsk,
    spread: parseFloat(spread.toFixed(4)),
    spreadPercentage: parseFloat(spreadPercentage.toFixed(2)),
    bidSize: parseFloat(orderbook.bids[0].size),
    askSize: parseFloat(orderbook.asks[0].size)
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
    const { tokenIds } = req.body;

    if (!Array.isArray(tokenIds)) {
      return res.status(400).json({ error: 'tokenIds must be an array' });
    }

    const orderbooks = await Promise.all(
      tokenIds.map(async (tokenId) => {
        try {
          const url = `${CLOB_API}/book?token_id=${tokenId}`;
          const response = await fetch(url);

          if (!response.ok) {
            return { tokenId, error: `API error: ${response.status}` };
          }

          const orderbook = await response.json();
          const spreadMetrics = calculateSpread(orderbook);

          return {
            tokenId,
            ...orderbook,
            spreadMetrics
          };
        } catch (error) {
          return { tokenId, error: error.message };
        }
      })
    );

    res.json(orderbooks);
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
