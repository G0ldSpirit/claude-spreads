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

    // Use CLOB API to get markets with token data
    let url = `${CLOB_API}/markets`;
    const params = new URLSearchParams();

    // Apply filters
    if (filter === 'active') {
      params.append('closed', 'false');
      params.append('active', 'true');
    } else if (filter === 'closed') {
      params.append('closed', 'true');
    }

    const fullUrl = `${url}?${params.toString()}`;

    const response = await fetch(fullUrl);

    if (!response.ok) {
      throw new Error(`CLOB API error: ${response.status}`);
    }

    const result = await response.json();
    let markets = result.data || result;

    // Filter to only include markets with order books enabled
    markets = markets.filter(m => m.enable_order_book !== false && m.tokens && m.tokens.length > 0);

    // Take only the requested limit
    markets = markets.slice(0, parseInt(limit));

    // Sort markets by end date (most recent first)
    markets = markets.sort((a, b) => {
      const dateA = new Date(a.end_date_iso || a.endDate || 0);
      const dateB = new Date(b.end_date_iso || b.endDate || 0);
      return dateB - dateA;
    });

    // Format for frontend compatibility
    markets = markets.map(m => ({
      condition_id: m.condition_id,
      question: m.question,
      description: m.description,
      end_date_iso: m.end_date_iso,
      volume: m.volume || '0',
      liquidity: m.liquidity || '0',
      active: m.active,
      closed: m.closed,
      tokens: m.tokens,
      enable_order_book: m.enable_order_book
    }));

    res.json(markets);
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
