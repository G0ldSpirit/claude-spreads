import { useState, useEffect } from 'react';
import MarketCard from './components/MarketCard';
import OrderBookModal from './components/OrderBookModal';
import './App.css';

const API_BASE = '/api';

function App() {
  const [markets, setMarkets] = useState([]);
  const [orderbooks, setOrderbooks] = useState({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('active');
  const [selectedMarket, setSelectedMarket] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [sortBySpread, setSortBySpread] = useState(false);

  const fetchMarkets = async () => {
    try {
      const params = new URLSearchParams();

      // Send filter as a single parameter
      params.append('filter', filter);
      params.append('limit', '20');

      const response = await fetch(`${API_BASE}/markets?${params.toString()}`);
      const data = await response.json();
      setMarkets(data);
      setLastUpdate(new Date());

      // Fetch orderbooks for all markets
      if (data.length > 0) {
        const orderbookResponse = await fetch(`${API_BASE}/orderbooks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ markets: data })
        });

        const orderbookData = await orderbookResponse.json();
        setOrderbooks(orderbookData);
      }

      setLoading(false);
    } catch (error) {
      console.error('Error fetching markets:', error);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMarkets();
  }, [filter]);

  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchMarkets();
    }, 10000); // Refresh every 10 seconds

    return () => clearInterval(interval);
  }, [autoRefresh, filter]);

  const handleMarketClick = (market) => {
    setSelectedMarket(market);
  };

  const handleCloseModal = () => {
    setSelectedMarket(null);
  };

  const getSpreadForMarket = (market) => {
    if (!market.tokens || market.tokens.length === 0) return 0;
    const yesToken = market.tokens.find(t => t.outcome === 'Yes') || market.tokens[0];
    const orderbook = orderbooks[yesToken.token_id];
    return orderbook?.spreadMetrics?.spread || 0;
  };

  const getSortedMarkets = () => {
    if (!sortBySpread) return markets;

    return [...markets].sort((a, b) => {
      const spreadA = getSpreadForMarket(a);
      const spreadB = getSpreadForMarket(b);
      return spreadB - spreadA; // Sort descending (highest spread first)
    });
  };

  const displayedMarkets = getSortedMarkets();

  return (
    <div className="app">
      <header className="header">
        <div className="header-content">
          <h1>📊 Polymarket Live Spreads</h1>
          <p className="subtitle">Real-time bid-ask spreads from order book data</p>
        </div>
        <div className="header-controls">
          {lastUpdate && (
            <div className="last-update">
              Last update: {lastUpdate.toLocaleTimeString()}
            </div>
          )}
          <button
            className={`refresh-toggle ${autoRefresh ? 'active' : ''}`}
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            {autoRefresh ? '⏸ Pause' : '▶ Resume'} Auto-refresh
          </button>
          <button className="refresh-button" onClick={fetchMarkets}>
            🔄 Refresh Now
          </button>
        </div>
      </header>

      <div className="filters">
        <div className="filter-group">
          <button
            className={`filter-button ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All Markets
          </button>
          <button
            className={`filter-button ${filter === 'active' ? 'active' : ''}`}
            onClick={() => setFilter('active')}
          >
            Active
          </button>
          <button
            className={`filter-button ${filter === 'closed' ? 'active' : ''}`}
            onClick={() => setFilter('closed')}
          >
            Closed
          </button>
        </div>
        <div className="sort-group">
          <button
            className={`filter-button ${sortBySpread ? 'active' : ''}`}
            onClick={() => setSortBySpread(!sortBySpread)}
          >
            {sortBySpread ? '📊 Sorted by Spread' : '📊 Sort by Spread'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="loading">
          <div className="spinner"></div>
          <p>Loading markets...</p>
        </div>
      ) : (
        <div className="markets-grid">
          {displayedMarkets.map((market) => (
            <MarketCard
              key={market.condition_id}
              market={market}
              orderbooks={orderbooks}
              onClick={() => handleMarketClick(market)}
            />
          ))}
        </div>
      )}

      {markets.length === 0 && !loading && (
        <div className="no-markets">
          <p>No markets found</p>
        </div>
      )}

      {selectedMarket && (
        <OrderBookModal
          market={selectedMarket}
          orderbooks={orderbooks}
          onClose={handleCloseModal}
        />
      )}
    </div>
  );
}

export default App;
