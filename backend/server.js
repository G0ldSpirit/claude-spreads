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

// Get active markets from Gamma API
app.get('/api/markets', async (req, res) => {
  try {
    const { filter, limit = 100 } = req.query;

    let url = `${GAMMA_API}/markets`;
    const params = new URLSearchParams();

    // Use closed parameter instead of active
    if (filter === 'active') {
      params.append('closed', 'false');
    } else if (filter === 'closed') {
      params.append('closed', 'true');
    }
    // If filter is 'all', don't add any filter parameter

    params.append('limit', limit);

    const fullUrl = `${url}?${params.toString()}`;

    const response = await fetch(fullUrl);

    if (!response.ok) {
      throw new Error(`Gamma API error: ${response.status}`);
    }

    let markets = await response.json();

    // Sort markets by end date (most recent first)
    markets = markets.sort((a, b) => {
      const dateA = new Date(a.endDate || a.end_date_iso || 0);
      const dateB = new Date(b.endDate || b.end_date_iso || 0);
      return dateB - dateA;
    });

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
